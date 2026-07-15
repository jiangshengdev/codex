import type { AppDispatch } from "@/app/store";
import {
  ProjectionIngressAdapter,
  type ProjectionIngressOutcome,
} from "@/features/projectionIngress/projectionIngressAdapter";
import {
  attachedThreadIdObserved,
  launchThreadIdRecorded,
} from "@/features/threadIdentity/threadIdentitySlice";
import {
  replayForProjectionEvent,
  snapshotReplayIndexFromTurns,
  type SnapshotReplayIndex,
  threadRuntimeAttached,
  threadRuntimeDeltasAccepted,
  threadRuntimeEventBuffered,
  threadRuntimeManualReconnectRequired,
} from "@/features/threadRuntime/threadRuntimeSlice";
import type {
  ThreadProjectionAttachResponse,
  ThreadProjectionClosedNotification,
  ThreadProjectionDeltaNotification,
  ThreadProjectionEventNotification,
} from "@codex-protocol/v2";

export type ProjectionAnimationFrameScheduler = {
  requestFrame: (callback: () => void) => number;
  cancelFrame: (frameId: number) => void;
};

type ProjectionApplicationCoordinatorOptions = {
  dispatch: AppDispatch;
  scheduler: ProjectionAnimationFrameScheduler;
};

export class ProjectionApplicationCoordinator {
  private readonly dispatch: AppDispatch;
  private readonly scheduler: ProjectionAnimationFrameScheduler;
  private launchThreadId: string | null = null;
  private projectionIngress: ProjectionIngressAdapter | null = null;
  private snapshotReplayIndex: SnapshotReplayIndex | null = null;
  private pendingDeltaNotifications: ThreadProjectionDeltaNotification[] = [];
  private pendingDeltaFrame: number | null = null;
  private disposed = false;

  constructor({ dispatch, scheduler }: ProjectionApplicationCoordinatorOptions) {
    this.dispatch = dispatch;
    this.scheduler = scheduler;
  }

  handleLaunchThread(threadId: string): void {
    if (this.disposed) {
      return;
    }

    this.launchThreadId = threadId;
    this.projectionIngress = new ProjectionIngressAdapter(threadId);
    this.snapshotReplayIndex = null;
    this.dispatch(launchThreadIdRecorded(threadId));
  }

  handleProjectionAttached(response: ThreadProjectionAttachResponse): void {
    if (this.disposed) {
      return;
    }

    const attachedThreadId = response.snapshot.thread.id;
    this.dispatch(attachedThreadIdObserved(attachedThreadId));

    if (this.launchThreadId !== attachedThreadId || this.projectionIngress == null) {
      return;
    }

    const outcome = this.projectionIngress.handleAttach(response);
    if (outcome.type === "attachAccepted") {
      this.snapshotReplayIndex = snapshotReplayIndexFromTurns(
        outcome.response.snapshot.thread.turns,
      );
    }

    this.dispatchProjectionOutcome(outcome);
  }

  handleProjectionEvent(notification: ThreadProjectionEventNotification): void {
    if (this.disposed || this.projectionIngress == null) {
      return;
    }

    this.dispatchProjectionOutcome(this.projectionIngress.handleEvent(notification));
  }

  handleProjectionDelta(notification: ThreadProjectionDeltaNotification): void {
    if (this.disposed || this.projectionIngress == null) {
      return;
    }

    this.dispatchProjectionOutcome(this.projectionIngress.handleDelta(notification));
  }

  handleProjectionClosed(notification: ThreadProjectionClosedNotification): void {
    if (this.disposed || this.projectionIngress == null) {
      return;
    }

    this.dispatchProjectionOutcome(this.projectionIngress.handleClosed(notification));
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    this.pendingDeltaNotifications = [];
    this.cancelPendingDeltaFrame();
  }

  private dispatchProjectionOutcome(outcome: ProjectionIngressOutcome): void {
    switch (outcome.type) {
      case "attachAccepted":
        this.flushPendingDeltas();
        this.dispatch(threadRuntimeAttached(outcome.response));
        return;
      case "eventAccepted":
        this.flushPendingDeltas();
        this.dispatch(
          threadRuntimeEventBuffered({
            notification: outcome.notification,
            replay:
              this.snapshotReplayIndex == null
                ? "live"
                : replayForProjectionEvent(this.snapshotReplayIndex, outcome.notification),
          }),
        );
        return;
      case "deltaAccepted":
        this.enqueueProjectionDelta(outcome.notification);
        return;
      case "manualReconnectRequired":
        this.flushPendingDeltas();
        this.dispatch(
          threadRuntimeManualReconnectRequired({
            reason: outcome.reason,
            threadId: outcome.threadId,
            subscriptionId: outcome.subscriptionId,
          }),
        );
        return;
      case "ignored":
        return;
    }
  }

  private enqueueProjectionDelta(notification: ThreadProjectionDeltaNotification): void {
    this.pendingDeltaNotifications.push(notification);
    this.schedulePendingDeltaFlush();
  }

  private schedulePendingDeltaFlush(): void {
    if (this.pendingDeltaFrame != null) {
      return;
    }

    this.pendingDeltaFrame = this.scheduler.requestFrame(() => {
      if (this.disposed) {
        return;
      }

      this.pendingDeltaFrame = null;
      this.flushPendingDeltas();
    });
  }

  private flushPendingDeltas(): void {
    if (this.pendingDeltaNotifications.length === 0) {
      this.cancelPendingDeltaFrame();
      return;
    }

    const notifications = this.pendingDeltaNotifications;
    this.pendingDeltaNotifications = [];
    this.cancelPendingDeltaFrame();
    this.dispatch(threadRuntimeDeltasAccepted({ notifications }));
  }

  private cancelPendingDeltaFrame(): void {
    if (this.pendingDeltaFrame == null) {
      return;
    }

    this.scheduler.cancelFrame(this.pendingDeltaFrame);
    this.pendingDeltaFrame = null;
  }
}
