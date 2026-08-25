import type { AppDispatch } from "@/app/store";
import type { BrowserAuthorizationSession } from "@/features/browserLaunch/browserAuthorizationSession";
import type { ComposerInputQueueCoordinatorReleaseBlocker } from "@/features/composerInputQueue/composerInputQueueCoordinator";
import type { GuiHostCommands } from "@/features/guiHost/guiHostClient";
import type {
  ThreadProjectionAttachResponse,
  ThreadProjectionClosedNotification,
  ThreadProjectionDeltaNotification,
  ThreadProjectionEventNotification,
} from "@codex-protocol/v2";
import type { UnknownAction } from "@reduxjs/toolkit";
import { createActiveThreadProjection } from "./activeThreadProjection";
import type { LiveActiveThreadSession } from "./activeThreadSessionContracts";
import {
  createLiveActiveThreadSession,
  type CreateLiveActiveThreadSessionInput,
} from "./liveActiveThreadSession";

type ActiveThreadSessionCommands = Pick<
  GuiHostCommands,
  | "attachThreadProjection"
  | "detachThreadProjection"
  | "interruptTurn"
  | "listSkills"
  | "resumeThread"
  | "startTurn"
  | "steerTurn"
>;

type ActiveThreadAuthorizationSession = Pick<
  BrowserAuthorizationSession,
  "commitActiveThread" | "getSnapshot"
>;

export type ActiveThreadSessionScheduler = Readonly<{
  requestFrame(callback: () => void): number;
  cancelFrame(frameId: number): void;
}>;

export type ActiveThreadSessionSnapshot =
  | Readonly<{ phase: "empty"; revision: number }>
  | Exclude<ReturnType<LiveActiveThreadSession["getSnapshot"]>, { phase: "disposed" }>
  | Readonly<{ phase: "disposed"; revision: number }>;

export type ActiveThreadActivationWarning =
  | Readonly<{ type: "authorizationPersistenceFailed"; error: unknown }>
  | Readonly<{ type: "previousOwnerCleanupFailed"; error: unknown }>;

export type ActiveThreadActivationFailure =
  | Readonly<{ type: "switchInProgress" }>
  | Readonly<{
      type: "currentThreadChanged";
      activeThreadId: string | null;
      expectedRevision: number;
      actualRevision: number;
    }>
  | Readonly<{
      type: "currentThreadUnresolved";
      activeThreadId: string;
      blockers: readonly ComposerInputQueueCoordinatorReleaseBlocker[];
    }>
  | Readonly<{
      type: "connectionLost";
      progress: "beforeCommit" | "afterCommit";
      threadId: string | null;
      cleanupError: unknown;
    }>
  | Readonly<{
      type: "operationFailed";
      phase: "resume" | "attach" | "prepare" | "activate";
      error: unknown;
      cleanupError: unknown;
    }>;

export type ActiveThreadActivationOutcome =
  | Readonly<{
      type: "ready";
      threadId: string;
      warnings: readonly ActiveThreadActivationWarning[];
    }>
  | Readonly<{ type: "empty" }>
  | Readonly<{ type: "unavailable"; failure: ActiveThreadActivationFailure }>;

export type ActiveThreadSession = Readonly<{
  getSnapshot(): ActiveThreadSessionSnapshot;
  getLiveSession(): LiveActiveThreadSession | null;
  subscribe(listener: () => void): () => void;
  activate(threadId: string): Promise<ActiveThreadActivationOutcome>;
  activateRecoveryThread(): Promise<ActiveThreadActivationOutcome>;
  handleProjectionEvent(notification: ThreadProjectionEventNotification): void;
  handleProjectionDelta(notification: ThreadProjectionDeltaNotification): void;
  handleProjectionClosed(notification: ThreadProjectionClosedNotification): void;
  handleSkillsChanged(): void;
  connectionUnavailable(): void;
  dispose(): void;
}>;

export type CreateActiveThreadSessionInput = Readonly<{
  authorizationSession: ActiveThreadAuthorizationSession;
  commands: ActiveThreadSessionCommands;
  dispatch: AppDispatch;
  scheduler: ActiveThreadSessionScheduler;
}>;

type ActiveThreadNotification =
  | Readonly<{ type: "event"; notification: ThreadProjectionEventNotification }>
  | Readonly<{ type: "delta"; notification: ThreadProjectionDeltaNotification }>
  | Readonly<{ type: "closed"; notification: ThreadProjectionClosedNotification }>;

type ActivationCandidate = {
  generation: number;
  threadId: string;
  subscriptionId: string | null;
  attachedThreadId: string | null;
  notifications: ActiveThreadNotification[];
  replayedNotificationCount: number;
  liveSession: LiveActiveThreadSession | null;
  stagedActions: UnknownAction[];
};

class ActiveThreadSessionImpl implements ActiveThreadSession {
  private readonly authorizationSession: ActiveThreadAuthorizationSession;
  private readonly commands: ActiveThreadSessionCommands;
  private readonly dispatch: AppDispatch;
  private readonly scheduler: ActiveThreadSessionScheduler;
  private readonly listeners = new Set<() => void>();
  private current: LiveActiveThreadSession | null = null;
  private unsubscribeCurrent: (() => void) | null = null;
  private candidate: ActivationCandidate | null = null;
  private pendingProjectionFrame: Readonly<{
    liveSession: LiveActiveThreadSession;
    frameId: number;
  }> | null = null;
  private snapshot: ActiveThreadSessionSnapshot = { phase: "empty", revision: 0 };
  private generation = 0;
  private busy = false;
  private suppressCurrentPublication = false;
  private disposed = false;

  constructor({ authorizationSession, commands, dispatch, scheduler }: CreateActiveThreadSessionInput) {
    this.authorizationSession = authorizationSession;
    this.commands = commands;
    this.dispatch = dispatch;
    this.scheduler = scheduler;
  }

  getSnapshot = (): ActiveThreadSessionSnapshot => this.snapshot;

  getLiveSession = (): LiveActiveThreadSession | null => this.current;

  subscribe = (listener: () => void): (() => void) => {
    if (this.disposed) return () => undefined;
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  activateRecoveryThread = (): Promise<ActiveThreadActivationOutcome> => {
    const threadId = this.authorizationSession.getSnapshot().activeThreadId;
    if (this.disposed) return Promise.resolve(this.connectionFailure(threadId, "beforeCommit", null));
    return threadId == null ? Promise.resolve({ type: "empty" }) : this.activate(threadId);
  };

  activate = async (threadId: string): Promise<ActiveThreadActivationOutcome> => {
    const previous = this.current;
    const previousSnapshot = previous?.getSnapshot() ?? null;
    if (this.disposed) return this.connectionFailure(threadId, "beforeCommit", null);
    if (previousSnapshot != null && previousSnapshot.phase !== "disposed" && previousSnapshot.threadId === threadId) {
      return { type: "ready", threadId, warnings: [] };
    }
    if (this.busy) return { type: "unavailable", failure: { type: "switchInProgress" } };

    this.busy = true;
    const candidate: ActivationCandidate = {
      generation: ++this.generation,
      threadId,
      subscriptionId: null,
      attachedThreadId: null,
      notifications: [],
      replayedNotificationCount: 0,
      liveSession: null,
      stagedActions: [],
    };
    this.candidate = candidate;
    const previousRevision = previousSnapshot?.revision ?? this.snapshot.revision;

    if (previous != null) {
      let resumedThreadId: string;
      try {
        const response = await this.commands.resumeThread({ threadId });
        resumedThreadId = response.thread.id;
        if (resumedThreadId !== threadId) {
          throw new Error("thread/resume returned a different thread identity");
        }
      } catch (error: unknown) {
        return this.finishUncommitted(candidate, {
          type: "operationFailed",
          phase: "resume",
          error,
        });
      }
      if (!this.isCurrentCandidate(candidate)) {
        return this.finishUncommitted(candidate, { type: "connectionLost" });
      }
    }

    let attachResponse: ThreadProjectionAttachResponse;
    try {
      attachResponse = await this.commands.attachThreadProjection({ threadId });
      candidate.attachedThreadId = threadId;
      candidate.subscriptionId = attachResponse.subscriptionId;
      if (attachResponse.snapshot.thread.id !== threadId) {
        throw new Error("thread/projection/attach returned a different thread identity");
      }
    } catch (error: unknown) {
      return this.finishUncommitted(candidate, {
        type: "operationFailed",
        phase: "attach",
        error,
      });
    }
    if (!this.isCurrentCandidate(candidate)) {
      return this.finishUncommitted(candidate, { type: "connectionLost" });
    }

    try {
      const projection = createActiveThreadProjection({ threadId, attachResponse });
      for (const input of candidate.notifications) {
        const outcome = applyProjectionNotification(projection, input);
        if (outcome.type === "projectionUnavailable") {
          throw new Error("Candidate projection became unavailable before publication");
        }
        candidate.replayedNotificationCount += 1;
      }
      const stagedDispatch = ((action: UnknownAction) => {
        candidate.stagedActions.push(action);
        return action;
      }) as AppDispatch;
      candidate.liveSession = createLiveActiveThreadSession({
        sessionRevision: previousRevision + 1,
        attachResponse,
        projection,
        commands: this.commands,
        dispatch: stagedDispatch,
      } satisfies CreateLiveActiveThreadSessionInput);
    } catch (error: unknown) {
      return this.finishUncommitted(candidate, {
        type: "operationFailed",
        phase: "prepare",
        error,
      });
    }

    const changed = this.currentRevisionChanged(previous, previousRevision, candidate);
    if (changed != null) {
      return this.finishUncommitted(candidate, changed);
    }

    let releaseReservation: Extract<
      ReturnType<LiveActiveThreadSession["reserveRelease"]>,
      { type: "reserved" }
    >["reservation"] | null = null;
    if (previous != null) {
      this.suppressCurrentPublication = true;
      const release = previous.reserveRelease(previousRevision);
      if (release.type === "unavailable") {
        this.suppressCurrentPublication = false;
        return this.finishUncommitted(candidate, this.currentChangedFailure(previousRevision));
      }
      if (release.type === "blocked") {
        this.suppressCurrentPublication = false;
        return this.finishUncommitted(candidate, {
          type: "currentThreadUnresolved",
          activeThreadId: previousSnapshot?.phase === "disposed" ? threadId : previousSnapshot?.threadId ?? threadId,
          blockers: release.blockers,
        });
      }
      releaseReservation = release.reservation;
    }

    if (!this.isCurrentCandidate(candidate) || candidate.notifications.length !== candidate.replayedNotificationCount) {
      this.suppressCurrentPublication = false;
      return this.finishUncommitted(
        candidate,
        this.currentChangedFailure(previousRevision),
        releaseReservation,
      );
    }

    try {
      for (const action of candidate.stagedActions) this.dispatch(action);
    } catch (error: unknown) {
      this.suppressCurrentPublication = false;
      return this.finishUncommitted(
        candidate,
        { type: "operationFailed", phase: "activate", error },
        releaseReservation,
      );
    }

    if (releaseReservation != null) {
      const handoffCommit = releaseReservation.commit();
      if (handoffCommit.type !== "committed") {
        this.suppressCurrentPublication = false;
        return this.finishUncommitted(
          candidate,
          handoffCommit.reason === "disposed" || !this.isAttemptLive(candidate.generation)
            ? { type: "connectionLost" }
            : this.currentChangedFailure(previousRevision),
          releaseReservation,
        );
      }
      releaseReservation = null;
    }

    const next = candidate.liveSession;
    if (next == null) {
      this.suppressCurrentPublication = false;
      return this.finishUncommitted(
        candidate,
        { type: "operationFailed", phase: "activate", error: new Error("Candidate live session was not prepared") },
        releaseReservation,
      );
    }
    this.cancelPendingProjectionFrame();
    this.unsubscribeCurrent?.();
    this.unsubscribeCurrent = null;
    this.current = next;
    candidate.liveSession = null;
    this.candidate = null;
    this.suppressCurrentPublication = false;
    this.unsubscribeCurrent = next.subscribe(this.handleCurrentPublication);
    this.snapshot = availableSnapshot(next);
    this.notifyListeners();

    const warnings: ActiveThreadActivationWarning[] = [];
    try {
      this.authorizationSession.commitActiveThread(threadId);
    } catch (error: unknown) {
      warnings.push({ type: "authorizationPersistenceFailed", error });
    }

    let cleanupError: unknown = null;
    if (previous != null) {
      try {
        previous.dispose();
      } catch (error: unknown) {
        cleanupError = appendError(cleanupError, error);
      }
      try {
        await this.commands.detachThreadProjection({ threadId: previousSnapshot?.phase === "disposed" ? threadId : previousSnapshot?.threadId ?? threadId });
      } catch (error: unknown) {
        cleanupError = appendError(cleanupError, error);
      }
    }
    this.busy = false;

    if (!this.isAttemptLive(candidate.generation)) {
      return this.connectionFailure(threadId, "afterCommit", cleanupError);
    }
    if (cleanupError != null) {
      warnings.push({ type: "previousOwnerCleanupFailed", error: cleanupError });
    }
    return { type: "ready", threadId, warnings };
  };

  handleProjectionEvent = (notification: ThreadProjectionEventNotification): void => {
    this.routeNotification({ type: "event", notification });
  };

  handleProjectionDelta = (notification: ThreadProjectionDeltaNotification): void => {
    const owner = this.routeNotification({ type: "delta", notification });
    if (owner === this.current && owner != null) this.scheduleProjectionFlush(owner);
  };

  handleProjectionClosed = (notification: ThreadProjectionClosedNotification): void => {
    this.cancelProjectionFrameForCurrent();
    this.routeNotification({ type: "closed", notification });
  };

  handleSkillsChanged = (): void => {
    const current = this.current;
    if (current == null) return;
    current.invalidateSkills(current.getSnapshot().revision);
  };

  connectionUnavailable = (): void => {
    this.disposeSession();
  };

  dispose = (): void => {
    this.disposeSession();
  };

  private readonly handleCurrentPublication = (): void => {
    if (this.disposed || this.suppressCurrentPublication || this.current == null) return;
    this.snapshot = availableSnapshot(this.current);
    this.notifyListeners();
  };

  private routeNotification(input: ActiveThreadNotification): LiveActiveThreadSession | null {
    if (this.disposed) return null;
    const identity = input.notification;
    const candidate = this.candidate;
    if (candidate != null && identity.threadId === candidate.threadId) {
      if (candidate.subscriptionId == null || identity.subscriptionId === candidate.subscriptionId) {
        candidate.notifications.push(input);
      }
      return null;
    }
    const current = this.current;
    const snapshot = current?.getSnapshot();
    if (
      current == null ||
      snapshot == null ||
      snapshot.phase === "disposed" ||
      identity.threadId !== snapshot.threadId ||
      identity.subscriptionId !== snapshot.subscriptionId
    ) {
      return null;
    }
    if (input.type !== "delta") this.cancelProjectionFrameForCurrent();
    applyLiveNotification(current, input);
    return current;
  }

  private scheduleProjectionFlush(liveSession: LiveActiveThreadSession): void {
    if (this.pendingProjectionFrame != null) return;
    const frameId = this.scheduler.requestFrame(() => {
      if (this.pendingProjectionFrame?.liveSession !== liveSession) return;
      this.pendingProjectionFrame = null;
      if (!this.disposed && this.current === liveSession) liveSession.flushProjection();
    });
    this.pendingProjectionFrame = { liveSession, frameId };
  }

  private cancelProjectionFrameForCurrent(): void {
    if (this.pendingProjectionFrame?.liveSession === this.current) this.cancelPendingProjectionFrame();
  }

  private cancelPendingProjectionFrame(): void {
    const pending = this.pendingProjectionFrame;
    if (pending == null) return;
    this.pendingProjectionFrame = null;
    this.scheduler.cancelFrame(pending.frameId);
  }

  private currentRevisionChanged(
    previous: LiveActiveThreadSession | null,
    previousRevision: number,
    candidate: ActivationCandidate,
  ): Extract<ActiveThreadActivationFailure, { type: "currentThreadChanged" }> | null {
    if (
      !this.isCurrentCandidate(candidate) ||
      this.current !== previous ||
      candidate.notifications.length !== candidate.replayedNotificationCount ||
      (previous != null && previous.getSnapshot().revision !== previousRevision)
    ) {
      return this.currentChangedFailure(previousRevision);
    }
    return null;
  }

  private currentChangedFailure(
    expectedRevision: number,
  ): Extract<ActiveThreadActivationFailure, { type: "currentThreadChanged" }> {
    const snapshot = this.current?.getSnapshot();
    return {
      type: "currentThreadChanged",
      activeThreadId: snapshot == null || snapshot.phase === "disposed" ? null : snapshot.threadId,
      expectedRevision,
      actualRevision: snapshot?.revision ?? this.snapshot.revision,
    };
  }

  private async finishUncommitted(
    candidate: ActivationCandidate,
    failure:
      | Exclude<ActiveThreadActivationFailure, { type: "connectionLost" }>
      | Readonly<{ type: "connectionLost" }>,
    releaseReservation: Extract<
      ReturnType<LiveActiveThreadSession["reserveRelease"]>,
      { type: "reserved" }
    >["reservation"] | null = null,
  ): Promise<ActiveThreadActivationOutcome> {
    let cleanupError: unknown = null;
    try {
      candidate.liveSession?.dispose();
    } catch (error: unknown) {
      cleanupError = appendError(cleanupError, error);
    }
    try {
      releaseReservation?.release();
    } catch (error: unknown) {
      cleanupError = appendError(cleanupError, error);
    }
    if (candidate.attachedThreadId != null) {
      try {
        await this.commands.detachThreadProjection({ threadId: candidate.attachedThreadId });
      } catch (error: unknown) {
        cleanupError = appendError(cleanupError, error);
      }
    }
    if (this.candidate === candidate) this.candidate = null;
    this.suppressCurrentPublication = false;
    this.busy = false;
    if (this.current != null && !this.disposed) {
      const previousSnapshot = this.snapshot;
      this.snapshot = availableSnapshot(this.current);
      if (this.snapshot !== previousSnapshot && this.snapshot.revision !== previousSnapshot.revision) {
        this.notifyListeners();
      }
    }
    if (failure.type === "connectionLost" || !this.isAttemptLive(candidate.generation)) {
      return this.connectionFailure(candidate.threadId, "beforeCommit", cleanupError);
    }
    if (failure.type === "operationFailed") {
      return { type: "unavailable", failure: { ...failure, cleanupError } };
    }
    return { type: "unavailable", failure };
  }

  private connectionFailure(
    threadId: string | null,
    progress: "beforeCommit" | "afterCommit",
    cleanupError: unknown,
  ): ActiveThreadActivationOutcome {
    return {
      type: "unavailable",
      failure: { type: "connectionLost", progress, threadId, cleanupError },
    };
  }

  private isCurrentCandidate(candidate: ActivationCandidate): boolean {
    return this.candidate === candidate && this.isAttemptLive(candidate.generation);
  }

  private isAttemptLive(generation: number): boolean {
    return !this.disposed && generation === this.generation;
  }

  private disposeSession(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.busy = false;
    this.generation += 1;
    this.cancelPendingProjectionFrame();
    this.unsubscribeCurrent?.();
    this.unsubscribeCurrent = null;
    const revision = this.current?.getSnapshot().revision ?? this.snapshot.revision;
    try {
      this.candidate?.liveSession?.dispose();
    } finally {
      this.current?.dispose();
    }
    this.candidate = null;
    this.current = null;
    this.snapshot = { phase: "disposed", revision: revision + 1 };
    this.notifyListeners();
    this.listeners.clear();
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) listener();
  }
}

function availableSnapshot(liveSession: LiveActiveThreadSession): ActiveThreadSessionSnapshot {
  const snapshot = liveSession.getSnapshot();
  return snapshot.phase === "disposed" ? { phase: "disposed", revision: snapshot.revision } : snapshot;
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
): ActiveThreadSession {
  return new ActiveThreadSessionImpl(input);
}
