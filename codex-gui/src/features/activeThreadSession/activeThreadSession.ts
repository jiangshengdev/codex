import type { AppDispatch } from "@/app/store";
import type { BrowserAuthorizationSession } from "@/features/browserLaunch/browserAuthorizationSession";
import type { GuiHostCommands } from "@/features/guiHost/guiHostClient";
import { createListenerSet } from "@/subscriptions/listenerSet";
import { SessionCollectionPersistenceStore } from "@/features/sessionCollection/sessionCollectionPersistence";
import {
  createActiveThreadSessionIdentity,
  type ActiveThreadSessionIdentity,
} from "./activeThreadSessionIdentity";
import {
  activeThreadReadModelSlotCreated,
  activeThreadReadModelSlotRemoved,
} from "./activeThreadSessionReadModel";
import type {
  ActiveThreadCollectionSnapshot,
  ActiveThreadRemovalOutcome,
  ActiveThreadRemovalBlocker,
  ActiveThreadCollectionError,
  ActiveThreadMemberOperationError,
} from "./activeThreadSessionCollectionContracts";
export type {
  ActiveThreadCollectionSnapshot,
  ActiveThreadCollectionMember,
  ActiveThreadRemovalOutcome,
  ActiveThreadRemovalBlocker,
} from "./activeThreadSessionCollectionContracts";
import type {
  ThreadProjectionClosedNotification,
  ThreadProjectionDeltaNotification,
  ThreadProjectionEventNotification,
  ThreadStatusChangedNotification,
} from "@codex-protocol/v2";
import { createActiveThreadProjection } from "./activeThreadProjection";
import type { LiveActiveThreadSession } from "./activeThreadSessionContracts";
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

type ActiveThreadAuthorizationSession = Pick<
  BrowserAuthorizationSession,
  "commitActiveThread" | "clearActiveThread" | "getSnapshot"
>;

export type * from "./activeThreadSessionCollectionContracts";
import type {
  ActiveThreadSessionScheduler,
  ActiveThreadSessionRoles,
  ActiveThreadSessionSnapshot,
  ActiveThreadActivationWarning,
  ActiveThreadActivationFailure,
  ActiveThreadActivationOutcome,
  ActiveThreadRetryOutcome,
  ActiveThreadSession,
  ActiveThreadSessionController,
} from "./activeThreadSessionCollectionContracts";

export type CreateActiveThreadSessionInput = Readonly<{
  authorizationSession: ActiveThreadAuthorizationSession;
  commands: ActiveThreadSessionCommands;
  dispatch: AppDispatch;
  scheduler: ActiveThreadSessionScheduler;
  persistence: CreateLiveActiveThreadSessionInput["persistence"];
}>;

type ActiveThreadNotification =
  | Readonly<{ type: "event"; notification: ThreadProjectionEventNotification }>
  | Readonly<{ type: "delta"; notification: ThreadProjectionDeltaNotification }>
  | Readonly<{ type: "closed"; notification: ThreadProjectionClosedNotification }>;

type Member = {
  threadId: string;
  cwd: string | null;
  phase: "initializing" | "ready" | "failed" | "cleanupPending" | "removalPending";
  live: LiveActiveThreadSession | null;
  roles: ActiveThreadSessionRoles | null;
  error: unknown;
  operationErrors: readonly ActiveThreadMemberOperationError[];
  initializationError: unknown;
  pending: Promise<ActiveThreadActivationOutcome> | null;
  removal: Promise<ActiveThreadRemovalOutcome> | null;
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

class ActiveThreadSessionImpl implements ActiveThreadSessionController {
  readonly session: ActiveThreadSession;
  private readonly authorizationSession: ActiveThreadAuthorizationSession;
  private readonly commands: ActiveThreadSessionCommands;
  private readonly dispatch: AppDispatch;
  private readonly scheduler: ActiveThreadSessionScheduler;
  private readonly persistence: CreateLiveActiveThreadSessionInput["persistence"];
  private readonly listeners = createListenerSet();
  private readonly members = new Map<string, Member>();
  private collectionStore: SessionCollectionPersistenceStore | null = null;
  private collectionErrors: readonly ActiveThreadCollectionError[] = [];
  private collectionLoaded = false;
  private viewedThreadId: string | null = null;
  private selectionIntent = 0;
  private disposed = false;
  private snapshot: ActiveThreadSessionSnapshot = { phase: "empty", revision: 0 };
  private collectionSnapshot: ActiveThreadCollectionSnapshot = {
    viewedThreadId: null,
    members: [],
    errors: [],
  };

  constructor({
    authorizationSession,
    commands,
    dispatch,
    scheduler,
    persistence,
  }: CreateActiveThreadSessionInput) {
    this.authorizationSession = authorizationSession;
    this.commands = commands;
    this.dispatch = dispatch;
    this.scheduler = scheduler;
    this.persistence = persistence;
    this.session = {
      getSnapshot: this.getSnapshot,
      getHistoryCwd: () => this.authorizationSession.getSnapshot().historyCwd ?? null,
      getCollectionSnapshot: this.getCollectionSnapshot,
      subscribe: this.subscribe,
      activate: this.activate,
      view: this.view,
      retry: this.retry,
      remove: this.remove,
      setOperationError: this.setOperationError,
    };
  }

  getSnapshot = (): ActiveThreadSessionSnapshot => this.snapshot;
  getCollectionSnapshot = (): ActiveThreadCollectionSnapshot => this.collectionSnapshot;
  subscribe = (listener: () => void): (() => void) => this.listeners.subscribe(listener);

  private setCollectionError(
    operation: ActiveThreadCollectionError["operation"],
    threadId: string | null,
    error: unknown,
  ): void {
    this.collectionErrors = this.collectionErrors.filter(
      (entry) => entry.operation !== operation || entry.threadId !== threadId,
    );
    if (error != null)
      this.collectionErrors = [...this.collectionErrors, { operation, threadId, error }];
  }

  private setOperationError = (
    threadId: string,
    operation: ActiveThreadMemberOperationError["operation"],
    error: unknown,
  ): void => {
    if (this.isDisposed()) return;
    const member = this.members.get(threadId);
    this.setCollectionError(operation, threadId, member == null ? error : null);
    if (member != null) {
      member.operationErrors = member.operationErrors.filter(
        (entry) => entry.operation !== operation,
      );
      if (error != null) member.operationErrors = [...member.operationErrors, { operation, error }];
    }
    this.publish();
  };

  private loadCollection(): boolean {
    if (this.collectionLoaded) return true;
    try {
      this.collectionStore ??= new SessionCollectionPersistenceStore(this.persistence);
      const result = this.collectionStore.read();
      if (result.type === "restored") {
        for (const threadId of result.threadIds)
          this.members.set(threadId, this.createMember(threadId));
      }
      this.collectionLoaded = true;
      this.setCollectionError("collectionRead", null, null);
      return true;
    } catch (error: unknown) {
      this.setCollectionError("collectionRead", null, error);
      this.publish();
      return false;
    }
  }

  activateRecoveryThread = (
    preferredThreadId?: string | null,
  ): Promise<ActiveThreadActivationOutcome> => {
    if (this.isDisposed())
      return Promise.resolve(this.connectionFailure(preferredThreadId ?? null));
    if (!this.loadCollection())
      return Promise.resolve(this.collectionFailure("collectionRead", null));
    const target = preferredThreadId ?? this.authorizationSession.getSnapshot().activeThreadId;
    // Begin the foreground intent before any asynchronous background initialization settles.
    const foreground =
      target == null ? Promise.resolve({ type: "empty" } as const) : this.activate(target);
    this.initializeWaitingMembers(target);
    this.publish();
    return foreground;
  };

  private activate = (threadId: string): Promise<ActiveThreadActivationOutcome> =>
    this.selectThread(threadId, "activate");

  private view = (threadId: string): Promise<ActiveThreadActivationOutcome> =>
    this.selectThread(threadId, "view");

  private selectThread = async (
    threadId: string,
    mode: "activate" | "view",
  ): Promise<ActiveThreadActivationOutcome> => {
    if (this.isDisposed()) return this.connectionFailure(threadId);
    const intent = ++this.selectionIntent;
    if (!this.loadCollection()) return this.collectionFailure("collectionRead", null);
    let member = this.members.get(threadId);
    if (member == null) {
      try {
        this.commitMembership([...this.members.keys(), threadId]);
        this.setCollectionError("membershipAdd", threadId, null);
      } catch (error: unknown) {
        this.setCollectionError("membershipAdd", threadId, error);
        this.initializeWaitingMembers(threadId);
        this.publish();
        return this.collectionFailure("membershipAdd", threadId);
      }
      member = this.createMember(threadId);
      this.members.set(threadId, member);
    }
    this.viewedThreadId = threadId;
    this.publish();
    const foreground =
      mode === "view" && member.phase === "failed"
        ? Promise.resolve(this.failure("prepare", member.error))
        : this.ensureInitialized(member);
    this.initializeWaitingMembers(threadId);
    const result = await foreground;
    if (this.isDisposed()) return this.connectionFailure(threadId);
    if (intent !== this.selectionIntent)
      return {
        type: "unavailable",
        failure: {
          type: "currentThreadChanged",
          activeThreadId: this.viewedThreadId,
          expectedRevision: intent,
          actualRevision: this.selectionIntent,
        },
      };
    if (result.type !== "ready") return result;
    const warnings: ActiveThreadActivationWarning[] = [];
    try {
      this.commitSelection(member);
      this.setCollectionError("viewSelection", threadId, null);
    } catch (error: unknown) {
      this.setCollectionError("viewSelection", threadId, error);
      warnings.push({ type: "authorizationPersistenceFailed", error });
    }
    this.publish();
    return { type: "ready", threadId, warnings };
  };

  private retry = async (threadId: string): Promise<ActiveThreadRetryOutcome> => {
    if (this.isDisposed()) return this.connectionFailure(threadId);
    if (!this.loadCollection()) return this.collectionFailure("collectionRead", null);
    const intent = this.selectionIntent;
    const wasViewed = this.viewedThreadId === threadId;
    this.initializeWaitingMembers(threadId);
    const member = this.members.get(threadId);
    if (member == null)
      return this.failure("prepare", new Error("Session is no longer a collection member"));
    let result: ActiveThreadActivationOutcome;
    if (member.phase === "cleanupPending" && member.cleanupFromFailure) {
      member.pending ??= this.retryInitializationCleanup(member);
      result = await member.pending;
    } else if (member.phase === "cleanupPending" || member.phase === "removalPending") {
      const removed = await this.remove(threadId);
      if (this.isDisposed()) return this.connectionFailure(threadId);
      if (removed.type === "failed" && removed.phase !== "detach")
        return this.collectionFailure(
          removed.phase === "selection" ? "removeSelection" : "membershipRemove",
          threadId,
        );
      return removed.type === "removed"
        ? removed
        : this.failure("activate", removed.type === "failed" ? removed.error : member.error);
    } else if (member.phase === "ready" && member.live != null) {
      const live = member.live;
      live.invalidateThreadStatus();
      await live.settleThreadStatusInvalidations();
      if (this.isDisposed()) return this.connectionFailure(threadId);
      if (!this.isReadyMember(member, live)) {
        return this.failure("prepare", new Error("Session changed during status retry"));
      }
      result = { type: "ready", threadId, warnings: [] };
    } else {
      result = await this.ensureInitialized(member);
    }
    if (this.isDisposed()) return this.connectionFailure(threadId);
    if (this.members.get(threadId) !== member)
      return this.failure("prepare", new Error("Session is no longer a collection member"));
    if (result.type !== "ready") return result;
    if (!wasViewed || intent !== this.selectionIntent || this.viewedThreadId !== threadId)
      return result;
    const warnings = [...result.warnings];
    try {
      this.commitSelection(member);
      this.setCollectionError("viewSelection", threadId, null);
    } catch (error: unknown) {
      this.setCollectionError("viewSelection", threadId, error);
      warnings.push({ type: "authorizationPersistenceFailed", error });
    }
    this.publish();
    return { type: "ready", threadId, warnings };
  };

  private commitSelection(member: Member): void {
    if (member.cwd == null)
      throw new Error("Cannot persist selection before thread initialization");
    this.authorizationSession.commitActiveThread(member.threadId, member.cwd);
  }

  private async retryInitializationCleanup(member: Member): Promise<ActiveThreadActivationOutcome> {
    try {
      await this.commands.detachThreadProjection({ threadId: member.threadId });
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

  private createMember(threadId: string): Member {
    const operationErrors: ActiveThreadMemberOperationError[] = [];
    for (const entry of this.collectionErrors) {
      if (
        entry.threadId === threadId &&
        (entry.operation === "navigation" || entry.operation === "remove")
      ) {
        operationErrors.push({ operation: entry.operation, error: entry.error });
      }
    }
    for (const entry of operationErrors) this.setCollectionError(entry.operation, threadId, null);
    return {
      threadId,
      cwd: null,
      phase: "initializing",
      live: null,
      roles: null,
      error: null,
      operationErrors,
      initializationError: null,
      pending: null,
      removal: null,
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

  private initializeWaitingMembers(foregroundThreadId: string | null): void {
    for (const member of this.members.values()) {
      if (
        member.threadId !== foregroundThreadId &&
        member.phase === "initializing" &&
        member.pending == null
      ) {
        void this.ensureInitialized(member);
      }
    }
  }

  private ensureInitialized(member: Member): Promise<ActiveThreadActivationOutcome> {
    if (this.isDisposed()) return Promise.resolve(this.connectionFailure(member.threadId));
    if (member.pending != null) return member.pending;
    if (member.phase === "ready")
      return Promise.resolve({ type: "ready", threadId: member.threadId, warnings: [] });
    if (member.phase === "cleanupPending" || member.phase === "removalPending") {
      return Promise.resolve(this.failure("prepare", member.error));
    }
    member.phase = "initializing";
    member.error = null;
    member.initializationError = null;
    member.notifications = [];
    member.subscriptionId = null;
    const pending = this.initialize(member).finally(() => {
      if (member.pending === pending) member.pending = null;
    });
    member.pending = pending;
    this.publish();
    return pending;
  }

  private async initialize(member: Member): Promise<ActiveThreadActivationOutcome> {
    let phase: "loaded" | "resume" | "attach" | "prepare" = "loaded";
    try {
      let cursor: string | null = null;
      let loaded = false;
      do {
        const page = await this.commands.listLoadedThreads(cursor == null ? {} : { cursor });
        if (this.isDisposed()) return this.connectionFailure(member.threadId);
        loaded = page.data.includes(member.threadId);
        cursor = page.nextCursor;
      } while (!loaded && cursor != null);
      if (!loaded) {
        phase = "resume";
        const resumed = await this.commands.resumeThread({ threadId: member.threadId });
        if (resumed.thread.id !== member.threadId)
          throw new Error("thread/resume returned a different thread identity");
        if (this.isDisposed()) return this.connectionFailure(member.threadId);
      }
      phase = "attach";
      const response = await this.commands.attachThreadProjection({ threadId: member.threadId });
      member.attached = true;
      member.subscriptionId = response.subscriptionId;
      if (response.snapshot.thread.id !== member.threadId)
        throw new Error("thread/projection/attach returned a different thread identity");
      if (this.isDisposed()) {
        await this.commands.detachThreadProjection({ threadId: member.threadId });
        member.attached = false;
        return this.connectionFailure(member.threadId);
      }
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
      if (this.isDisposed()) throw new Error("Connection closed during session initialization");
      try {
        member.live = createLiveActiveThreadSession({
          identity,
          sessionRevision: 1,
          attachResponse: response,
          projection,
          commands: this.commands,
          dispatch: this.dispatch,
          persistence: this.persistence,
        });
      } catch (error: unknown) {
        this.removeSlot(member);
        throw error;
      }
      if (this.isDisposed()) throw new Error("Connection closed during session initialization");
      member.roles = createSessionRoles(member.live);
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
      if (this.isDisposed()) return this.connectionFailure(member.threadId);
      if (member.live.getSnapshot().phase === "projectionUnavailable") {
        throw new Error("Candidate projection became unavailable before publication");
      }
      member.cwd = response.snapshot.thread.cwd;
      member.phase = "ready";
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
          await this.commands.detachThreadProjection({ threadId: member.threadId });
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

  private remove = (threadId: string): Promise<ActiveThreadRemovalOutcome> => {
    const member = this.members.get(threadId);
    if (this.isDisposed() || member == null)
      return Promise.resolve({ type: "unavailable", threadId });
    if (member.removal != null) return member.removal;
    const pending = this.removeMember(member).finally(() => {
      if (member.removal === pending) member.removal = null;
      this.publish();
    });
    member.removal = pending;
    this.publish();
    return pending;
  };

  private async removeMember(member: Member): Promise<ActiveThreadRemovalOutcome> {
    const threadId = member.threadId;
    const live = member.live;
    if (member.phase === "initializing")
      return { type: "blocked", threadId, blockers: ["initializing"] };
    if (member.phase === "failed" || member.cleanupFromFailure)
      return { type: "blocked", threadId, blockers: ["statusUnknown"] };
    if (live != null && member.phase === "ready") {
      live.invalidateThreadStatus();
      await live.settleThreadStatusInvalidations();
      if (this.isDisposed() || this.members.get(threadId) !== member || member.live !== live)
        return { type: "unavailable", threadId };
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
    const wasViewed = this.viewedThreadId === threadId;
    try {
      if (wasViewed || this.authorizationSession.getSnapshot().activeThreadId === threadId) {
        this.authorizationSession.clearActiveThread();
        this.setCollectionError("removeSelection", threadId, null);
      }
    } catch (error: unknown) {
      if (release?.type === "reserved") release.reservation.release();
      this.setCollectionError("removeSelection", threadId, error);
      this.publish();
      return { type: "failed", threadId, phase: "selection", error };
    }
    if (release?.type === "reserved" && release.reservation.commit().type !== "committed") {
      release.reservation.release();
      return { type: "blocked", threadId, blockers: ["changed"] };
    }
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
        await this.commands.detachThreadProjection({ threadId });
        member.attached = false;
      } catch (error: unknown) {
        member.error = error;
        this.publish();
        return { type: "failed", threadId, phase: "detach", error };
      }
    }
    member.error = null;
    member.phase = "removalPending";
    if (this.isDisposed()) return { type: "unavailable", threadId };
    try {
      this.commitMembership([...this.members.keys()].filter((id) => id !== threadId));
      this.setCollectionError("membershipRemove", threadId, null);
    } catch (error: unknown) {
      this.setCollectionError("membershipRemove", threadId, error);
      this.publish();
      return { type: "failed", threadId, phase: "membership", error };
    }
    this.removeSlot(member);
    for (const entry of member.operationErrors) {
      if (entry.operation !== "remove")
        this.setCollectionError(entry.operation, threadId, entry.error);
    }
    this.setCollectionError("remove", threadId, null);
    this.setCollectionError("removeSelection", threadId, null);
    this.setCollectionError("viewSelection", threadId, null);
    this.members.delete(threadId);
    if (this.viewedThreadId === threadId) {
      this.viewedThreadId = null;
      this.selectionIntent += 1;
    }
    this.publish();
    return { type: "removed", threadId, wasViewed };
  }

  private removalBlockers(member: Member): ActiveThreadRemovalBlocker[] {
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
    if (this.isDisposed()) return;
    const member = this.members.get(input.notification.threadId);
    if (member == null) return;
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

  handleSkillsChanged = (): void => {
    for (const member of this.members.values()) {
      const live = member.live;
      if (live != null) live.invalidateSkills(live.getSnapshot().revision);
      else member.skillsDirty = true;
    }
  };
  handleThreadStatusChanged = (notification: ThreadStatusChangedNotification): void => {
    const member = this.members.get(notification.threadId);
    if (this.isDisposed() || member == null) return;
    if (member.live != null) member.live.invalidateThreadStatus();
    else member.statusDirty = true;
  };
  suspendRestoredQueue = (): void => {
    for (const member of this.members.values()) {
      member.suspended = true;
      member.live?.suspendRestored();
    }
  };
  connectionUnavailable = (): void => {
    this.dispose();
  };
  dispose = (): void => {
    if (this.isDisposed()) return;
    this.disposed = true;
    let cleanupError: unknown = null;
    for (const member of this.members.values()) {
      try {
        this.releaseLive(member);
      } catch (error: unknown) {
        cleanupError = appendError(cleanupError, error);
      }
    }
    this.snapshot = { phase: "disposed", revision: this.snapshot.revision + 1 };
    this.collectionSnapshot = {
      viewedThreadId: this.viewedThreadId,
      members: [],
      errors:
        cleanupError == null ? [] : [{ operation: "dispose", threadId: null, error: cleanupError }],
    };
    this.listeners.notify();
    this.listeners.clear();
    if (cleanupError != null)
      throw new Error("Session collection cleanup failed", { cause: cleanupError });
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
    if (this.isDisposed()) return;
    for (const member of this.members.values()) {
      const live = member.live;
      if (member.phase === "ready" && live != null && member.roles != null) {
        const source = live.getSnapshot();
        if (source.phase !== "disposed" && member.snapshot?.revision !== source.revision) {
          member.snapshot = { ...source, ...member.roles };
        }
      }
    }
    const viewed = this.viewedThreadId == null ? null : this.members.get(this.viewedThreadId);
    this.snapshot =
      viewed == null
        ? { phase: "empty", revision: this.snapshot.revision + 1 }
        : (viewed.snapshot ?? {
            phase: viewed.phase === "initializing" ? "loading" : "failed",
            threadId: viewed.threadId,
            revision: this.snapshot.revision + 1,
            error: viewed.error,
          });
    this.collectionSnapshot = {
      viewedThreadId: this.viewedThreadId,
      members: [...this.members.values()].map((member) => {
        const removalBlockers = this.removalBlockers(member);
        return {
          threadId: member.threadId,
          phase: member.phase,
          snapshot: member.snapshot,
          error: member.error,
          operationErrors: member.operationErrors,
          canRemove: member.removal == null && removalBlockers.length === 0,
          removalBlockers,
        };
      }),
      errors: this.collectionErrors,
    };
    this.listeners.notify();
  }

  private isDisposed(): boolean {
    return this.disposed;
  }

  private isReadyMember(member: Member, live: LiveActiveThreadSession): boolean {
    return (
      this.members.get(member.threadId) === member &&
      member.phase === "ready" &&
      member.live === live
    );
  }

  private commitMembership(threadIds: readonly string[]): void {
    const store = this.collectionStore;
    if (store == null) throw new Error("Session collection storage has not been loaded");
    store.commit(threadIds);
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

  private collectionFailure(
    operation: Extract<ActiveThreadActivationFailure, { type: "collectionFailed" }>["operation"],
    threadId: string | null,
  ): ActiveThreadActivationOutcome {
    return { type: "unavailable", failure: { type: "collectionFailed", operation, threadId } };
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

export function createActiveThreadSession(
  input: CreateActiveThreadSessionInput,
): ActiveThreadSessionController {
  return new ActiveThreadSessionImpl(input);
}
