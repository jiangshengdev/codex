import type { AppDispatch } from "@/app/store";
import type { BrowserAuthorizationSession } from "@/features/browserLaunch/browserAuthorizationSession";
import type { GuiRouteTarget } from "@/features/browserLaunch/guiRouteTarget";
import type { GuiHostCommands } from "@/features/guiHost/guiHostClient";
import {
  applyActiveThreadOwnerNotification,
  prepareActiveThreadOwner,
  type ActiveThreadOwnerHandle,
  type ActiveThreadOwnerNotification,
  type PreparedActiveThreadOwner,
} from "@/features/projectionCoordination/activeThreadOwner";
import type { ProjectionAnimationFrameScheduler } from "@/features/projectionCoordination/projectionApplicationCoordinator";
import type {
  ThreadProjectionClosedNotification,
  ThreadProjectionDeltaNotification,
  ThreadProjectionEventNotification,
} from "@codex-protocol/v2";

type RouteConnectionStartupCommands = Pick<
  GuiHostCommands,
  "attachThreadProjection" | "detachThreadProjection" | "startTurn"
>;

export type RouteConnectionStartupCleanupFailure = Readonly<{
  phase: "detach";
  threadId: string;
  error: unknown;
}>;

export type RouteConnectionStartupPostCommitFailure = Readonly<{
  failures: readonly (
    | Readonly<{ phase: "applicationCommit"; error: unknown }>
    | Readonly<{ phase: "replay"; error: unknown }>
    | Readonly<{ phase: "authorizationSession"; error: unknown }>
  )[];
}>;

export type RouteConnectionStartupOutcome =
  | Readonly<{
      type: "ready";
      target: GuiRouteTarget;
      activeOwner: ActiveThreadOwnerHandle | null;
      cleanupFailure: null;
      postCommitFailure: RouteConnectionStartupPostCommitFailure | null;
    }>
  | Readonly<{
      type: "historyContextUnavailable";
      target: Readonly<{ type: "historyList" }>;
      activeOwner: null;
      cleanupFailure: null;
    }>
  | Readonly<{
      type: "failed";
      target: GuiRouteTarget;
      phase: "attach" | "application";
      error: unknown;
      cleanupFailure: RouteConnectionStartupCleanupFailure | null;
    }>;

type RouteConnectionStartupCoordinatorOptions = Readonly<{
  target: GuiRouteTarget;
  authorizationSession: BrowserAuthorizationSession;
  commands: RouteConnectionStartupCommands;
  dispatch: AppDispatch;
  scheduler: ProjectionAnimationFrameScheduler;
}>;

type StartupCandidate = {
  generation: number;
  threadId: string;
  subscriptionId: string | null;
  attachedThreadId: string | null;
  notifications: ActiveThreadOwnerNotification[];
};

export class RouteConnectionStartupCoordinator {
  private readonly target: GuiRouteTarget;
  private readonly authorizationSession: BrowserAuthorizationSession;
  private readonly commands: RouteConnectionStartupCommands;
  private readonly dispatch: AppDispatch;
  private readonly scheduler: ProjectionAnimationFrameScheduler;
  private activeOwner: ActiveThreadOwnerHandle | null = null;
  private activePreparedOwner: PreparedActiveThreadOwner | null = null;
  private candidate: StartupCandidate | null = null;
  private generation = 0;
  private started = false;
  private disposed = false;

  constructor({
    target,
    authorizationSession,
    commands,
    dispatch,
    scheduler,
  }: RouteConnectionStartupCoordinatorOptions) {
    this.target = target;
    this.authorizationSession = authorizationSession;
    this.commands = commands;
    this.dispatch = dispatch;
    this.scheduler = scheduler;
  }

  start = async (): Promise<RouteConnectionStartupOutcome> => {
    if (this.disposed) {
      return this.failed(
        "application",
        new Error("Route connection startup was disposed before start"),
      );
    }
    if (this.started) {
      return this.failed("application", new Error("Route connection startup has already started"));
    }
    this.started = true;

    const threadId = this.selectStartupThreadId();
    if (threadId == null) {
      if (this.target.type === "historyList") {
        return {
          type: "historyContextUnavailable",
          target: this.target,
          activeOwner: null,
          cleanupFailure: null,
        };
      }
      return {
        type: "ready",
        target: this.target,
        activeOwner: null,
        cleanupFailure: null,
        postCommitFailure: null,
      };
    }

    const candidate: StartupCandidate = {
      generation: ++this.generation,
      threadId,
      subscriptionId: null,
      attachedThreadId: null,
      notifications: [],
    };
    this.candidate = candidate;

    let attachResponse: Awaited<
      ReturnType<RouteConnectionStartupCommands["attachThreadProjection"]>
    >;
    try {
      attachResponse = await this.commands.attachThreadProjection({ threadId });
      candidate.attachedThreadId = candidate.threadId;
      candidate.subscriptionId = attachResponse.subscriptionId;
      if (attachResponse.snapshot.thread.id !== threadId) {
        throw new Error("thread/projection/attach returned a different thread identity");
      }
    } catch (error: unknown) {
      return this.failCandidate(candidate, "attach", error);
    }

    if (!this.isCurrent(candidate)) {
      return this.failCandidate(
        candidate,
        "application",
        new Error("Route connection startup was disposed"),
      );
    }

    let preparedOwner: PreparedActiveThreadOwner;
    try {
      preparedOwner = prepareActiveThreadOwner({
        attachResponse,
        commands: this.commands,
        dispatch: this.dispatch,
        scheduler: this.scheduler,
      });
    } catch (error: unknown) {
      return this.failCandidate(candidate, "application", error);
    }

    this.activeOwner = preparedOwner.activeOwner;
    this.activePreparedOwner = preparedOwner;
    const postCommitFailures: RouteConnectionStartupPostCommitFailure["failures"][number][] = [];
    let committed: boolean;
    try {
      if (!this.isCurrent(candidate)) {
        return await this.failDisposedCandidate(candidate);
      }
      committed = preparedOwner.commit();
      if (!this.isCurrent(candidate)) {
        return await this.failDisposedCandidate(candidate);
      }
    } catch (error: unknown) {
      if (this.hasBeenDisposed()) {
        return this.failDisposedCandidate(candidate, error);
      }
      postCommitFailures.push({ phase: "applicationCommit", error });
      return this.finishReady(candidate, preparedOwner.activeOwner, postCommitFailures);
    }
    if (!committed) {
      this.disposeActivePreparedOwner();
      return this.failCandidate(
        candidate,
        "application",
        new Error("Prepared projection owner could not commit"),
      );
    }

    try {
      if (!this.isCurrent(candidate)) {
        return await this.failDisposedCandidate(candidate);
      }
      this.replayCandidate(candidate, preparedOwner.activeOwner);
      if (!this.isCurrent(candidate)) {
        return await this.failDisposedCandidate(candidate);
      }
    } catch (error: unknown) {
      if (this.hasBeenDisposed()) {
        return this.failDisposedCandidate(candidate, error);
      }
      postCommitFailures.push({ phase: "replay", error });
    }
    try {
      if (!this.isCurrent(candidate)) {
        return await this.failDisposedCandidate(candidate);
      }
      this.authorizationSession.commitActiveThread(preparedOwner.activeOwner.threadId);
      if (!this.isCurrent(candidate)) {
        return await this.failDisposedCandidate(candidate);
      }
    } catch (error: unknown) {
      if (this.hasBeenDisposed()) {
        return this.failDisposedCandidate(candidate, error);
      }
      postCommitFailures.push({ phase: "authorizationSession", error });
    }
    return this.finishReady(candidate, preparedOwner.activeOwner, postCommitFailures);
  };

  handleProjectionEvent(notification: ThreadProjectionEventNotification): void {
    this.handleNotification(notification, { type: "event", notification });
  }

  handleProjectionDelta(notification: ThreadProjectionDeltaNotification): void {
    this.handleNotification(notification, { type: "delta", notification });
  }

  handleProjectionClosed(notification: ThreadProjectionClosedNotification): void {
    this.handleNotification(notification, { type: "closed", notification });
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.generation += 1;
    this.candidate = null;
    this.disposeActivePreparedOwner();
  }

  private selectStartupThreadId(): string | null {
    if (this.target.type === "currentTask") {
      return this.target.threadId;
    }
    return this.authorizationSession.getSnapshot().activeThreadId;
  }

  private handleNotification(
    identity: Readonly<{ threadId: string; subscriptionId: string }>,
    input: ActiveThreadOwnerNotification,
  ): void {
    if (this.disposed) {
      return;
    }
    const candidate = this.candidate;
    if (identity.threadId === candidate?.threadId) {
      if (
        candidate.subscriptionId == null ||
        identity.subscriptionId === candidate.subscriptionId
      ) {
        candidate.notifications.push(input);
      }
      return;
    }
    if (
      identity.threadId === this.activeOwner?.threadId &&
      identity.subscriptionId === this.activeOwner.subscriptionId
    ) {
      applyActiveThreadOwnerNotification(this.activeOwner, input);
    }
  }

  private replayCandidate(candidate: StartupCandidate, activeOwner: ActiveThreadOwnerHandle): void {
    for (const input of candidate.notifications) {
      if (!this.isCurrent(candidate)) {
        throw new Error("Route connection startup was disposed during replay");
      }
      if (input.notification.subscriptionId === activeOwner.subscriptionId) {
        applyActiveThreadOwnerNotification(activeOwner, input);
        if (!this.isCurrent(candidate)) {
          throw new Error("Route connection startup was disposed during replay");
        }
      }
    }
  }

  private finishReady(
    candidate: StartupCandidate,
    activeOwner: ActiveThreadOwnerHandle,
    postCommitFailures: RouteConnectionStartupPostCommitFailure["failures"],
  ): RouteConnectionStartupOutcome {
    if (this.candidate === candidate) {
      this.candidate = null;
    }
    return {
      type: "ready",
      target: this.target,
      activeOwner,
      cleanupFailure: null,
      postCommitFailure: postCommitFailures.length === 0 ? null : { failures: postCommitFailures },
    };
  }

  private failDisposedCandidate(
    candidate: StartupCandidate,
    operationError?: unknown,
  ): Promise<RouteConnectionStartupOutcome> {
    const disposedError = new Error("Route connection startup was disposed");
    return this.failCandidate(
      candidate,
      "application",
      operationError === undefined
        ? disposedError
        : new AggregateError(
            [operationError, disposedError],
            "Route connection startup failed while being disposed",
          ),
    );
  }

  private disposeActivePreparedOwner(): void {
    this.activePreparedOwner?.dispose();
    this.activePreparedOwner = null;
    this.activeOwner = null;
  }

  private isCurrent(candidate: StartupCandidate): boolean {
    return (
      !this.disposed && this.candidate === candidate && candidate.generation === this.generation
    );
  }

  private hasBeenDisposed(): boolean {
    return this.disposed;
  }

  private async failCandidate(
    candidate: StartupCandidate,
    phase: "attach" | "application",
    error: unknown,
  ): Promise<RouteConnectionStartupOutcome> {
    const cleanupFailure = await this.detachCandidate(candidate);
    if (this.candidate === candidate) {
      this.candidate = null;
    }
    return this.failed(phase, error, cleanupFailure);
  }

  private failed(
    phase: "attach" | "application",
    error: unknown,
    cleanupFailure: RouteConnectionStartupCleanupFailure | null = null,
  ): RouteConnectionStartupOutcome {
    return { type: "failed", target: this.target, phase, error, cleanupFailure };
  }

  private async detachCandidate(
    candidate: StartupCandidate,
  ): Promise<RouteConnectionStartupCleanupFailure | null> {
    if (candidate.attachedThreadId == null) {
      return null;
    }
    try {
      await this.commands.detachThreadProjection({ threadId: candidate.attachedThreadId });
      return null;
    } catch (error: unknown) {
      return { phase: "detach", threadId: candidate.attachedThreadId, error };
    }
  }
}
