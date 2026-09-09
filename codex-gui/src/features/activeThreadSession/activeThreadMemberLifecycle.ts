import type { AppDispatch } from "@/app/store";
import type { ActiveThreadConnection } from "./activeThreadConnection";
import type { GuiHostCommands } from "@/features/guiHost/guiHostClient";
import { createListenerSet } from "@/subscriptions/listenerSet";
import {
  createActiveThreadSessionIdentity,
  type ActiveThreadSessionIdentity,
} from "./activeThreadSessionIdentity";
import {
  activeThreadReadModelSlotCreated,
  activeThreadReadModelSlotRemoved,
} from "./activeThreadSessionReadModel";
import type {
  ThreadProjectionClosedNotification,
  ThreadProjectionDeltaNotification,
  ThreadProjectionEventNotification,
} from "@codex-protocol/v2";
import { createActiveThreadProjection } from "./activeThreadProjection";
import type {
  LiveActiveThreadSession,
  ProjectionRecoveryOutcome,
} from "./activeThreadSessionContracts";
import {
  createLiveActiveThreadSession,
  type CreateLiveActiveThreadSessionInput,
} from "./liveActiveThreadSession";

type ActiveThreadSessionCommands = Pick<
  GuiHostCommands,
  | "attachThreadProjection"
  | "compactThread"
  | "detachThreadProjection"
  | "interruptTurn"
  | "listSkills"
  | "listLoadedThreads"
  | "readThread"
  | "resumeThread"
  | "startTurn"
  | "steerTurn"
>;

import type {
  ActiveThreadCollectionMember,
  ActiveThreadActivationOutcome,
  ActiveThreadSessionRoles,
  ActiveThreadSessionSnapshot,
  ActiveThreadSessionScheduler,
  ActiveThreadRemovalOutcome,
  ActiveThreadRemovalBlocker,
} from "./activeThreadSessionCollectionContracts";

type CreateActiveThreadMemberLifecycleInput = Readonly<{
  threadId: string;
  connection: ActiveThreadConnection<ActiveThreadSessionCommands>;
  dispatch: AppDispatch;
  scheduler: ActiveThreadSessionScheduler;
  persistence: CreateLiveActiveThreadSessionInput["persistence"];
}>;

type RemovalFailure = Exclude<ActiveThreadRemovalOutcome, { type: "removed" }>;
type Released = Readonly<{ type: "released" }>;
type RemovalPreparation =
  | RemovalFailure
  | Readonly<{
      type: "prepared";
      cancel(): void;
      release(): Promise<Released | RemovalFailure>;
    }>;

type ActiveThreadNotification =
  | Readonly<{ type: "event"; notification: ThreadProjectionEventNotification }>
  | Readonly<{ type: "delta"; notification: ThreadProjectionDeltaNotification }>
  | Readonly<{ type: "closed"; notification: ThreadProjectionClosedNotification }>;

type Member = {
  threadId: string;
  cwd: string | null;
  phase: ActiveThreadCollectionMember["phase"];
  live: LiveActiveThreadSession | null;
  roles: ActiveThreadSessionRoles | null;
  error: unknown;
  initializationError: unknown;
  pending: Promise<ActiveThreadActivationOutcome> | null;
  subscriptionId: string | null;
  attached: boolean;
  cleanupFromFailure: boolean;
  notifications: ActiveThreadNotification[];
  drainingNotifications: boolean;
  slotIdentity: ActiveThreadSessionIdentity | null;
  statusDirty: boolean;
  skillsDirty: boolean;
  suspended: boolean;
  frame: number | null;
  unsubscribe: (() => void) | null;
  snapshot: ActiveThreadSessionSnapshot | null;
};

class ActiveThreadMemberLifecycleImpl {
  private readonly member: Member;
  private readonly connection: ActiveThreadConnection<ActiveThreadSessionCommands>;
  private readonly dispatch: AppDispatch;
  private readonly scheduler: ActiveThreadSessionScheduler;
  private readonly persistence: CreateLiveActiveThreadSessionInput["persistence"];
  private readonly listeners = createListenerSet();
  private disposed = false;
  private recovery: Readonly<{
    live: LiveActiveThreadSession;
    pending: Promise<ProjectionRecoveryOutcome>;
    notifications: ActiveThreadNotification[];
  }> | null = null;

  constructor({
    threadId,
    connection,
    dispatch,
    scheduler,
    persistence,
  }: CreateActiveThreadMemberLifecycleInput) {
    this.connection = connection;
    this.dispatch = dispatch;
    this.scheduler = scheduler;
    this.persistence = persistence;
    this.member = {
      threadId,
      cwd: null,
      phase: "initializing",
      live: null,
      roles: null,
      error: null,
      initializationError: null,
      pending: null,
      subscriptionId: null,
      attached: false,
      cleanupFromFailure: false,
      notifications: [],
      drainingNotifications: false,
      slotIdentity: null,
      statusDirty: false,
      skillsDirty: false,
      suspended: false,
      frame: null,
      unsubscribe: null,
      snapshot: null,
    };
  }

  getState = () => {
    const member = this.member;
    const live = member.live;
    if (member.phase === "ready" && live != null && member.roles != null) {
      const source = live.getSnapshot();
      if (source.phase !== "disposed" && member.snapshot?.revision !== source.revision)
        member.snapshot = { ...source, ...member.roles };
    }
    return {
      threadId: member.threadId,
      cwd: member.cwd,
      phase: member.phase,
      snapshot: member.snapshot,
      error: member.error,
      isPending: member.pending != null,
      removalBlockers: this.removalBlockers(member),
      retryRemoval:
        !member.cleanupFromFailure &&
        (member.phase === "cleanupPending" || member.phase === "removalPending"),
    } as const;
  };

  subscribe = (listener: () => void): (() => void) => this.listeners.subscribe(listener);
  recoverProjection = (
    expectedIdentity: ActiveThreadSessionIdentity,
  ): Promise<ProjectionRecoveryOutcome> => {
    const live = this.member.live;
    if (
      this.disposed ||
      this.connection.capture() == null ||
      live == null ||
      !this.isReadyMember(live) ||
      live.identity.instanceId !== expectedIdentity.instanceId ||
      live.identity.threadId !== expectedIdentity.threadId
    ) {
      return Promise.resolve({ type: "unavailable" });
    }
    if (this.recovery != null) return this.recovery.pending;
    let run: () => void = () => undefined;
    const pending = new Promise<ProjectionRecoveryOutcome>((resolve) => {
      run = () => {
        void this.performProjectionRecovery(live).then(resolve);
      };
    });
    this.recovery = { live, pending, notifications: [] };
    run();
    return pending;
  };

  private async performProjectionRecovery(
    live: LiveActiveThreadSession,
  ): Promise<ProjectionRecoveryOutcome> {
    const attempt = this.recovery;
    const round = this.connection.capture();
    const current = () =>
      !this.disposed &&
      round?.isCurrent() === true &&
      this.isReadyMember(live) &&
      this.recovery === attempt;
    try {
      if (!live.beginProjectionRecovery() || !current()) return { type: "unavailable" };
      this.cancelFrame(this.member);
      live.flushProjection();
      if (!current()) return { type: "unavailable" };
      const response = await this.connection.run((commands) =>
        commands.attachThreadProjection({
          threadId: this.member.threadId,
        }),
      );
      if (!current()) return { type: "unavailable" };
      const projection = createActiveThreadProjection({
        threadId: this.member.threadId,
        attachResponse: response,
      });
      const drain = () => {
        if (!current()) return false;
        let notification = attempt?.notifications.shift();
        while (notification != null) {
          if (notification.notification.subscriptionId === response.subscriptionId) {
            applyProjectionNotification(projection, notification);
          }
          notification = attempt?.notifications.shift();
        }
        return current();
      };
      if (!drain()) return { type: "unavailable" };
      const outcome = live.commitProjectionRecovery(response, projection, drain);
      if (!current()) return { type: "unavailable" };
      if (outcome.type === "recovered") {
        this.member.subscriptionId = response.subscriptionId;
        // Sending resumes only after publication. Any notification caused by that
        // release belongs to the now-current subscription and follows normal ingress.
        this.recovery = null;
        for (const notification of attempt?.notifications ?? [])
          this.routeNotification(notification);
        if (!this.disposed && this.isReadyMember(live)) live.flushProjection();
        if (this.disposed || !this.isReadyMember(live)) return { type: "unavailable" };
        if (live.getSnapshot().phase === "projectionUnavailable") {
          const error = new Error("The subscription stopped after synchronization recovery");
          live.failProjectionRecovery(error);
          return { type: "failed", error };
        }
      }
      return outcome;
    } catch (error: unknown) {
      if (!current()) return { type: "unavailable" };
      live.failProjectionRecovery(error);
      return { type: "failed", error };
    } finally {
      if (this.recovery === attempt) this.recovery = null;
    }
  }
  initialize = (): Promise<ActiveThreadActivationOutcome> => this.ensureInitialized(this.member);
  retry = async (): Promise<ActiveThreadActivationOutcome> => {
    const member = this.member;
    if (this.disposed || this.connection.capture() == null)
      return this.connectionFailure(member.threadId);
    if (member.phase === "cleanupPending" && member.cleanupFromFailure) {
      member.pending ??= this.retryInitializationCleanup(member);
      return await member.pending;
    }
    if (member.phase === "ready" && member.live != null) {
      const live = member.live;
      live.invalidateThreadStatus();
      await live.settleThreadStatusInvalidations();
      if (this.isDisposed() || this.connection.capture() == null)
        return this.connectionFailure(member.threadId);
      if (!this.isReadyMember(live))
        return this.failure("prepare", new Error("Session changed during status retry"));
      return { type: "ready", threadId: member.threadId, warnings: [] };
    }
    return await this.ensureInitialized(member);
  };
  private async retryInitializationCleanup(member: Member): Promise<ActiveThreadActivationOutcome> {
    try {
      await this.connection.run((commands) =>
        commands.detachThreadProjection({ threadId: member.threadId }),
      );
      member.attached = false;
      member.cleanupFromFailure = false;
      member.phase = "failed";
      member.pending = null;
      if (this.isDisposed()) return this.connectionFailure(member.threadId);
      return await this.ensureInitialized(member);
    } catch (error: unknown) {
      member.pending = null;
      member.error = appendError(member.initializationError, error);
      this.publish();
      return this.failure("prepare", error);
    }
  }

  private ensureInitialized(member: Member): Promise<ActiveThreadActivationOutcome> {
    if (this.isDisposed()) return Promise.resolve(this.connectionFailure(member.threadId));
    if (member.pending != null) return member.pending;
    if (member.phase === "ready")
      return Promise.resolve({ type: "ready", threadId: member.threadId, warnings: [] });
    if (this.connection.capture() == null)
      return Promise.resolve(this.connectionFailure(member.threadId));
    if (member.phase === "cleanupPending" || member.phase === "removalPending") {
      return Promise.resolve(this.failure("prepare", member.error));
    }
    member.phase = "initializing";
    member.notifications = [];
    member.subscriptionId = null;
    const pending = this.initializeMember(member).finally(() => {
      if (member.pending === pending) member.pending = null;
      this.publish();
    });
    member.pending = pending;
    this.publish();
    return pending;
  }

  private async initializeMember(member: Member): Promise<ActiveThreadActivationOutcome> {
    const round = this.connection.capture();
    if (round == null) return this.connectionFailure(member.threadId);
    let phase: "loaded" | "resume" | "attach" | "prepare" = "loaded";
    try {
      let cursor: string | null = null;
      let loaded = false;
      do {
        const page = await round.commands.listLoadedThreads(cursor == null ? {} : { cursor });
        if (this.isDisposed() || !round.isCurrent()) return this.connectionFailure(member.threadId);
        loaded = page.data.includes(member.threadId);
        cursor = page.nextCursor;
      } while (!loaded && cursor != null);
      if (!loaded) {
        phase = "resume";
        const resumed = await round.commands.resumeThread({ threadId: member.threadId });
        if (resumed.thread.id !== member.threadId)
          throw new Error("thread/resume returned a different thread identity");
        if (this.isDisposed() || !round.isCurrent()) return this.connectionFailure(member.threadId);
      }
      phase = "attach";
      const response = await round.commands.attachThreadProjection({ threadId: member.threadId });
      if (this.isDisposed()) {
        let cleanupError: unknown = null;
        try {
          await round.commands.detachThreadProjection({ threadId: member.threadId });
        } catch (error: unknown) {
          cleanupError = error;
        }
        return {
          type: "unavailable",
          failure: {
            type: "connectionLost",
            progress: "beforeCommit",
            threadId: member.threadId,
            cleanupError,
          },
        };
      }
      if (!round.isCurrent()) return this.connectionFailure(member.threadId);
      member.attached = true;
      member.subscriptionId = response.subscriptionId;
      if (response.snapshot.thread.id !== member.threadId)
        throw new Error("thread/projection/attach returned a different thread identity");
      phase = "prepare";
      const projection = createActiveThreadProjection({
        threadId: member.threadId,
        attachResponse: response,
      });
      for (const notification of member.notifications) {
        if (notification.notification.subscriptionId !== response.subscriptionId) continue;
        if (
          applyProjectionNotification(projection, notification).type === "projectionUnavailable"
        ) {
          throw new Error("Candidate projection became unavailable before publication");
        }
      }
      member.notifications = [];
      const identity = createActiveThreadSessionIdentity(member.threadId);
      member.slotIdentity = identity;
      this.dispatch(activeThreadReadModelSlotCreated(identity));
      if (this.isDisposed() || !round.isCurrent())
        throw new Error("Connection closed during session initialization");
      try {
        member.live = createLiveActiveThreadSession({
          identity,
          sessionRevision: 1,
          attachResponse: response,
          projection,
          connection: this.connection,
          dispatch: this.dispatch,
          persistence: this.persistence,
        });
      } catch (error: unknown) {
        this.removeSlot(member);
        throw error;
      }
      if (this.isDisposed() || !round.isCurrent())
        throw new Error("Connection closed during session initialization");
      member.roles = createSessionRoles(member.live);
      member.cwd = response.snapshot.thread.cwd;
      member.unsubscribe = member.live.subscribe(() => {
        this.publish();
      });
      this.drainInitializingNotifications(member);
      if (member.suspended) member.live.suspendRestored();
      if (member.skillsDirty) {
        member.skillsDirty = false;
        member.live.invalidateSkills(member.live.getSnapshot().revision);
      }
      if (member.statusDirty) {
        member.statusDirty = false;
        member.live.invalidateThreadStatus();
      }
      await member.live.settleThreadStatusInvalidations();
      if (this.isDisposed() || !round.isCurrent()) return this.connectionFailure(member.threadId);
      if (member.live.getSnapshot().phase === "projectionUnavailable") {
        throw new Error("Candidate projection became unavailable before publication");
      }
      member.cwd = response.snapshot.thread.cwd;
      member.phase = "ready";
      member.error = null;
      member.initializationError = null;
      this.publish();
      return { type: "ready", threadId: member.threadId, warnings: [] };
    } catch (error: unknown) {
      member.error = error;
      member.initializationError = error;
      try {
        this.releaseLive(member);
      } catch (cleanupError: unknown) {
        member.error = appendError(error, cleanupError);
        member.initializationError = member.error;
      }
      if (member.attached) {
        try {
          await round.commands.detachThreadProjection({ threadId: member.threadId });
          member.attached = false;
        } catch (cleanupError: unknown) {
          member.phase = "cleanupPending";
          member.cleanupFromFailure = true;
          member.error = appendError(member.initializationError, cleanupError);
          this.publish();
          return this.failure(phase, error, cleanupError);
        }
      }
      member.phase = "failed";
      this.publish();
      return this.failure(phase, error);
    }
  }

  prepareRemoval = async (): Promise<RemovalPreparation> => {
    const member = this.member;
    const threadId = member.threadId;
    if (this.isDisposed()) return { type: "unavailable", threadId };
    if (this.connection.capture() == null)
      return { type: "blocked", threadId, blockers: ["connectionUnavailable"] };
    const live = member.live;
    if (member.phase === "initializing")
      return { type: "blocked", threadId, blockers: ["initializing"] };
    if (member.phase === "failed" || member.cleanupFromFailure)
      return { type: "blocked", threadId, blockers: ["statusUnknown"] };
    if (live != null && member.phase === "ready") {
      live.invalidateThreadStatus();
      await live.settleThreadStatusInvalidations();
      if (this.isDisposed() || member.live !== live) return { type: "unavailable", threadId };
      const blockers = this.removalBlockers(member);
      if (blockers.length > 0) return { type: "blocked", threadId, blockers };
    }
    const release =
      live != null && member.phase === "ready"
        ? live.reserveRelease(live.getSnapshot().revision)
        : null;
    if (release?.type === "blocked")
      return { type: "blocked", threadId, blockers: release.blockers };
    if (release?.type === "unavailable")
      return { type: "blocked", threadId, blockers: ["changed"] };
    return {
      type: "prepared",
      cancel: () => {
        if (release?.type === "reserved") release.reservation.release();
      },
      release: async () => {
        if (this.isDisposed()) {
          if (release?.type === "reserved") release.reservation.release();
          return { type: "unavailable", threadId };
        }
        if (release?.type === "reserved" && release.reservation.commit().type !== "committed") {
          release.reservation.release();
          return { type: "blocked", threadId, blockers: ["changed"] };
        }
        return await this.releaseForRemoval(member);
      },
    };
  };

  private async releaseForRemoval(member: Member): Promise<Released | RemovalFailure> {
    const threadId = member.threadId;
    // Once release commits, keep the member visible but its capabilities unavailable until cleanup settles.
    member.phase = member.attached ? "cleanupPending" : "removalPending";
    try {
      this.releaseLive(member, true);
    } catch (error: unknown) {
      member.error = error;
      this.publish();
      return { type: "failed", threadId, phase: "detach", error };
    }
    this.publish();
    if (member.attached) {
      try {
        await this.connection.run((commands) => commands.detachThreadProjection({ threadId }));
        member.attached = false;
      } catch (error: unknown) {
        member.error = error;
        this.publish();
        return { type: "failed", threadId, phase: "detach", error };
      }
    }
    member.phase = "removalPending";
    if (this.isDisposed()) return { type: "unavailable", threadId };
    return { type: "released" };
  }

  finalizeRemoval = (): void => {
    this.removeSlot(this.member);
    this.disposed = true;
    this.listeners.clear();
  };
  private removalBlockers(member: Member): ActiveThreadRemovalBlocker[] {
    if (this.connection.capture() == null) return ["connectionUnavailable"];
    if (member.phase === "initializing") return ["initializing"];
    if (member.phase === "failed" || member.cleanupFromFailure) return ["statusUnknown"];
    const live = member.live;
    if (live == null) return [];
    const snapshot = live.getSnapshot();
    if (snapshot.phase !== "active") return ["projectionUnavailable"];
    const blockers: ActiveThreadRemovalBlocker[] = [];
    if (
      snapshot.threadStatus == null ||
      snapshot.threadStatus.type === "notLoaded" ||
      snapshot.threadStatus.type === "systemError"
    )
      blockers.push("statusUnknown");
    if (snapshot.threadStatus?.type === "active" || snapshot.activeTurnId != null)
      blockers.push("activeTurn");
    if (snapshot.compaction.phase !== "idle") blockers.push("compaction");
    if (snapshot.composer.persistence.restoredPaused) blockers.push("restoredPaused");
    const readiness = live.getReleaseReadiness();
    if (readiness.type === "blocked") blockers.push(...readiness.blockers);
    return blockers;
  }

  handleProjectionEvent = (notification: ThreadProjectionEventNotification): void => {
    this.routeNotification({ type: "event", notification });
  };
  handleProjectionDelta = (notification: ThreadProjectionDeltaNotification): void => {
    this.routeNotification({ type: "delta", notification });
  };
  handleProjectionClosed = (notification: ThreadProjectionClosedNotification): void => {
    this.routeNotification({ type: "closed", notification });
  };

  private routeNotification(input: ActiveThreadNotification): void {
    if (this.isDisposed() || this.connection.capture() == null) return;
    const member = this.member;
    if (input.notification.threadId !== member.threadId) return;
    if (this.recovery != null) {
      this.recovery.notifications.push(input);
      return;
    }
    if (member.phase === "initializing") {
      member.notifications.push(input);
      this.drainInitializingNotifications(member);
      return;
    }
    if (member.live == null) return;
    if (input.notification.subscriptionId !== member.subscriptionId) return;
    if (input.type !== "delta") this.cancelFrame(member);
    applyLiveNotification(member.live, input);
    if (input.type === "delta" && member.frame == null) {
      member.frame = this.scheduler.requestFrame(() => {
        member.frame = null;
        if (!this.isDisposed()) member.live?.flushProjection();
      });
    }
  }

  private drainInitializingNotifications(member: Member): void {
    const live = member.live;
    if (live == null || member.drainingNotifications || this.isDisposed()) return;
    member.drainingNotifications = true;
    try {
      do {
        let input = member.notifications.shift();
        while (input != null && !this.isDisposed()) {
          if (input.notification.subscriptionId === member.subscriptionId)
            applyLiveNotification(live, input);
          input = member.notifications.shift();
        }
        if (!this.isDisposed()) live.flushProjection();
      } while (!this.isDisposed() && member.notifications.length > 0);
    } finally {
      member.drainingNotifications = false;
    }
  }

  invalidateSkills = (): void => {
    const member = this.member;
    if (member.live != null) member.live.invalidateSkills(member.live.getSnapshot().revision);
    else member.skillsDirty = true;
  };
  invalidateThreadStatus = (): void => {
    if (this.disposed) return;
    const member = this.member;
    if (member.live != null) member.live.invalidateThreadStatus();
    else member.statusDirty = true;
  };
  suspendRestored = (): void => {
    this.member.suspended = true;
    this.member.live?.suspendRestored();
  };
  connectionUnavailable = (): void => {
    if (this.disposed) return;
    this.connection.revoke();
    this.cancelFrame(this.member);
    this.member.live?.flushProjection();
    this.member.live?.connectionUnavailable();
    this.member.notifications = [];
    this.member.attached = false;
    this.recovery = null;
    if (this.member.live == null) {
      this.member.phase = "failed";
      this.member.error = new Error("GUI host connection is not available");
    } else if (this.member.roles != null) {
      this.member.phase = "ready";
    }
    this.publish();
  };
  dispose = (): void => {
    if (this.disposed) return;
    this.disposed = true;
    try {
      this.releaseLive(this.member);
    } finally {
      this.listeners.clear();
    }
  };
  private cancelFrame(member: Member): void {
    if (member.frame == null) return;
    this.scheduler.cancelFrame(member.frame);
    member.frame = null;
  }

  private releaseLive(member: Member, retainSlot = false): void {
    this.cancelFrame(member);
    member.unsubscribe?.();
    member.unsubscribe = null;
    const live = member.live;
    member.live = null;
    member.roles = null;
    member.snapshot = null;
    if (live != null) {
      try {
        live.dispose();
      } finally {
        if (!retainSlot) this.removeSlot(member);
      }
    } else if (!retainSlot) this.removeSlot(member);
  }

  private removeSlot(member: Member): void {
    const identity = member.slotIdentity;
    if (identity == null) return;
    member.slotIdentity = null;
    this.dispatch(activeThreadReadModelSlotRemoved(identity));
  }

  private publish(): void {
    if (!this.disposed) this.listeners.notify();
  }
  private isDisposed(): boolean {
    return this.disposed;
  }
  private isReadyMember(live: LiveActiveThreadSession): boolean {
    return this.member.phase === "ready" && this.member.live === live;
  }
  private failure(
    phase: "loaded" | "resume" | "attach" | "prepare" | "activate",
    error: unknown,
    cleanupError: unknown = null,
  ): ActiveThreadActivationOutcome {
    return {
      type: "unavailable",
      failure: { type: "operationFailed", phase, error, cleanupError },
    };
  }

  private connectionFailure(threadId: string | null): ActiveThreadActivationOutcome {
    return {
      type: "unavailable",
      failure: { type: "connectionLost", progress: "beforeCommit", threadId, cleanupError: null },
    };
  }
}

function createSessionRoles(liveSession: LiveActiveThreadSession): ActiveThreadSessionRoles {
  return {
    compactionRole: {
      requestCompaction: liveSession.requestCompaction,
    },
    composerRole: {
      beginPendingInputEdit: liveSession.beginPendingInputEdit,
      deletePendingInput: liveSession.deletePendingInput,
      interruptActiveTurn: liveSession.interruptActiveTurn,
      movePendingInput: liveSession.movePendingInput,
      promoteOrdinaryFrontToSteer: liveSession.promoteOrdinaryFrontToSteer,
      readPendingInputDetail: liveSession.readPendingInputDetail,
      readPendingInputPage: liveSession.readPendingInputPage,
      recover: liveSession.recover,
      submit: liveSession.submit,
      submitSteer: liveSession.submitSteer,
      getDraft: liveSession.getDraft,
      saveDraft: liveSession.saveDraft,
      retainDraft: liveSession.retainDraft,
      retryPersistence: liveSession.retryPersistence,
      resumeRestored: liveSession.resumeRestored,
      discardUnknown: liveSession.discardUnknown,
    },
    skillsRole: {
      invalidateSkills: liveSession.invalidateSkills,
      refreshSkills: liveSession.refreshSkills,
      retrySkills: liveSession.retrySkills,
    },
  };
}

function applyProjectionNotification(
  projection: ReturnType<typeof createActiveThreadProjection>,
  input: ActiveThreadNotification,
) {
  switch (input.type) {
    case "event":
      return projection.handleEvent(input.notification);
    case "delta":
      return projection.handleDelta(input.notification);
    case "closed":
      return projection.handleClosed(input.notification);
  }
}

function applyLiveNotification(
  liveSession: LiveActiveThreadSession,
  input: ActiveThreadNotification,
): void {
  switch (input.type) {
    case "event":
      liveSession.handleProjectionEvent(input.notification);
      return;
    case "delta":
      liveSession.handleProjectionDelta(input.notification);
      return;
    case "closed":
      liveSession.handleProjectionClosed(input.notification);
  }
}

function appendError(current: unknown, error: unknown): unknown {
  if (error == null) return current;
  if (current == null) return error;
  return new AggregateError([current, error], "Multiple active thread activation errors");
}

export function createActiveThreadMemberLifecycle(input: CreateActiveThreadMemberLifecycleInput) {
  const member = new ActiveThreadMemberLifecycleImpl(input);
  return {
    getState: member.getState,
    subscribe: member.subscribe,
    initialize: member.initialize,
    retry: member.retry,
    recoverProjection: member.recoverProjection,
    handleProjectionEvent: member.handleProjectionEvent,
    handleProjectionDelta: member.handleProjectionDelta,
    handleProjectionClosed: member.handleProjectionClosed,
    invalidateSkills: member.invalidateSkills,
    invalidateThreadStatus: member.invalidateThreadStatus,
    suspendRestored: member.suspendRestored,
    connectionUnavailable: member.connectionUnavailable,
    prepareRemoval: member.prepareRemoval,
    finalizeRemoval: member.finalizeRemoval,
    dispose: member.dispose,
  };
}
export type ActiveThreadMemberLifecycle = ReturnType<typeof createActiveThreadMemberLifecycle>;
