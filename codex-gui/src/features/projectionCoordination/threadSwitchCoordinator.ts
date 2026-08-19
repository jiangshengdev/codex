import type { AppDispatch } from "@/app/store";
import {
  type ComposerInputQueueCoordinatorReleaseBlocker,
  type ComposerInputQueueCoordinatorReleaseReservation,
} from "@/features/composerInputQueue/composerInputQueueCoordinator";
import type { GuiHostCommands } from "@/features/guiHost/guiHostClient";
import type {
  ThreadProjectionClosedNotification,
  ThreadProjectionDeltaNotification,
  ThreadProjectionEventNotification,
} from "@codex-protocol/v2";
import {
  applyActiveThreadOwnerNotification,
  prepareActiveThreadOwner,
  type ActiveThreadOwnerHandle,
  type ActiveThreadOwnerNotification,
  type PreparedActiveThreadOwner,
} from "./activeThreadOwner";
import { type ProjectionAnimationFrameScheduler } from "./projectionApplicationCoordinator";

export type ThreadSwitchBlockedReason =
  | Readonly<{ type: "busy" }>
  | Readonly<{ type: "disposed" }>
  | Readonly<{
      type: "queueReleaseBlocked";
      blockers: readonly ComposerInputQueueCoordinatorReleaseBlocker[];
    }>;

export type ThreadSwitchOutcome =
  | Readonly<{ type: "current"; activeOwner: ActiveThreadOwnerHandle }>
  | Readonly<{
      type: "blocked";
      reason: ThreadSwitchBlockedReason;
      cleanupFailure: ThreadSwitchCleanupFailure | null;
    }>
  | Readonly<{
      type: "failed";
      phase: "resume" | "attach";
      error: unknown;
      cleanupFailure: ThreadSwitchCleanupFailure | null;
    }>
  | Readonly<{
      type: "switched";
      activeOwner: ActiveThreadOwnerHandle;
      cleanupFailure: ThreadSwitchCleanupFailure | null;
    }>;

export type ThreadSwitchCleanupFailure = Readonly<{
  phase: "detach" | "application";
  owner?: "candidate" | "previous";
  operation?: "commit" | "publish" | "replay";
  threadId?: string;
  error: unknown;
}>;

type ThreadSwitchCommands = Pick<
  GuiHostCommands,
  | "attachThreadProjection"
  | "detachThreadProjection"
  | "listSkills"
  | "resumeThread"
  | "startTurn"
  | "steerTurn"
>;

type ThreadSwitchCoordinatorOptions = Readonly<{
  activeOwner: ActiveThreadOwnerHandle | null;
  commands: ThreadSwitchCommands;
  dispatch: AppDispatch;
  publishActiveOwner: (activeOwner: ActiveThreadOwnerHandle) => void;
  scheduler: ProjectionAnimationFrameScheduler;
}>;

type CandidateThreadOwner = {
  generation: number;
  threadId: string;
  releaseReservation: ComposerInputQueueCoordinatorReleaseReservation | null;
  attachedThreadId: string | null;
  subscriptionId: string | null;
  notifications: ActiveThreadOwnerNotification[];
};

type SwitchAdmission =
  | Readonly<{ type: "candidate"; candidate: CandidateThreadOwner }>
  | Readonly<{ type: "outcome"; outcome: ThreadSwitchOutcome }>;

type CandidatePreparation = Readonly<{
  candidate: CandidateThreadOwner;
  attachResponse: Awaited<ReturnType<ThreadSwitchCommands["attachThreadProjection"]>>;
}>;

type PreparedActiveOwner = CandidatePreparation &
  Readonly<{
    previousOwner: ActiveThreadOwnerHandle | null;
    activeOwner: ActiveThreadOwnerHandle;
    preparedOwner: PreparedActiveThreadOwner;
  }>;

type ActiveOwnerPreparationResult =
  | Readonly<{ type: "prepared"; preparedOwner: PreparedActiveOwner }>
  | Readonly<{ type: "failed"; candidate: CandidateThreadOwner; error: unknown }>;

type CommitReconciliation = Readonly<{
  committed: boolean;
  cleanupFailure: ThreadSwitchCleanupFailure | null;
}>;

export class ThreadSwitchCoordinator {
  private activeOwner: ActiveThreadOwnerHandle | null;
  private readonly commands: ThreadSwitchCommands;
  private readonly dispatch: AppDispatch;
  private readonly publishActiveOwner: (activeOwner: ActiveThreadOwnerHandle) => void;
  private readonly scheduler: ProjectionAnimationFrameScheduler;
  private candidate: CandidateThreadOwner | null = null;
  private transitionGeneration = 0;
  private commitInProgress = false;
  private disposeRequested = false;
  private busy = false;
  private disposed = false;

  constructor({
    activeOwner,
    commands,
    dispatch,
    publishActiveOwner,
    scheduler,
  }: ThreadSwitchCoordinatorOptions) {
    this.activeOwner = activeOwner;
    this.commands = commands;
    this.dispatch = dispatch;
    this.publishActiveOwner = publishActiveOwner;
    this.scheduler = scheduler;
  }

  getActiveOwner(): ActiveThreadOwnerHandle | null {
    return this.activeOwner;
  }

  continueThread = (threadId: string): Promise<ThreadSwitchOutcome> =>
    this.executeThreadSwitch(threadId);

  private async executeThreadSwitch(threadId: string): Promise<ThreadSwitchOutcome> {
    const admission = this.reserveCandidate(threadId);
    if (admission.type === "outcome") {
      return admission.outcome;
    }
    const candidate = admission.candidate;
    let resumedThreadId: string;
    try {
      const response = await this.commands.resumeThread({ threadId: candidate.threadId });
      resumedThreadId = response.thread.id;
      if (resumedThreadId !== candidate.threadId) {
        throw new Error("thread/resume returned a different thread identity");
      }
    } catch (error: unknown) {
      return this.finishFailed(candidate, "resume", error);
    }
    if (!this.isCurrent(candidate)) {
      return this.finishBlocked(candidate, "disposed");
    }

    let attachResponse: CandidatePreparation["attachResponse"];
    try {
      attachResponse = await this.commands.attachThreadProjection({ threadId: resumedThreadId });
      candidate.attachedThreadId = resumedThreadId;
      candidate.subscriptionId = attachResponse.subscriptionId;
      if (attachResponse.snapshot.thread.id !== candidate.threadId) {
        throw new Error("thread/projection/attach returned a different thread identity");
      }
    } catch (error: unknown) {
      return this.finishFailed(candidate, "attach", error);
    }
    if (!this.isCurrent(candidate)) {
      return this.finishBlocked(candidate, "disposed");
    }

    const activeOwnerPreparation = this.constructActiveOwner({
      candidate,
      attachResponse,
    });
    if (activeOwnerPreparation.type === "failed") {
      return this.finishFailed(
        activeOwnerPreparation.candidate,
        "attach",
        activeOwnerPreparation.error,
      );
    }
    const preparedOwner = activeOwnerPreparation.preparedOwner;
    const reconciliation = this.commitAndReconcileActiveOwner(preparedOwner);
    let { cleanupFailure } = reconciliation;
    if (!reconciliation.committed) {
      preparedOwner.preparedOwner.dispose();
      return this.finishFailed(
        preparedOwner.candidate,
        "attach",
        cleanupFailure?.error ?? new Error("prepared projection owner could not commit"),
      );
    }
    const replay = this.replayCommittedCandidate(preparedOwner, cleanupFailure);
    cleanupFailure = this.cleanupPreviousOwner(preparedOwner, replay);
    if (preparedOwner.previousOwner != null) {
      try {
        await this.commands.detachThreadProjection({
          threadId: preparedOwner.previousOwner.threadId,
        });
      } catch (error: unknown) {
        cleanupFailure =
          cleanupFailure == null
            ? {
                phase: "detach",
                owner: "previous",
                threadId: preparedOwner.previousOwner.threadId,
                error,
              }
            : {
                ...cleanupFailure,
                error: new AggregateError([cleanupFailure.error, error]),
              };
      }
    }
    this.busy = false;
    return { type: "switched", activeOwner: preparedOwner.activeOwner, cleanupFailure };
  }

  private reserveCandidate(threadId: string): SwitchAdmission {
    if (this.disposed) {
      return {
        type: "outcome",
        outcome: { type: "blocked", reason: { type: "disposed" }, cleanupFailure: null },
      };
    }
    const activeOwner = this.activeOwner;
    if (activeOwner?.threadId === threadId) {
      return { type: "outcome", outcome: { type: "current", activeOwner } };
    }
    if (this.busy) {
      return {
        type: "outcome",
        outcome: { type: "blocked", reason: { type: "busy" }, cleanupFailure: null },
      };
    }

    const releaseReservation = this.activeOwner?.queueCoordinator.reserveRelease() ?? null;
    if (releaseReservation?.type === "blocked") {
      return {
        type: "outcome",
        outcome: {
          type: "blocked",
          reason: { type: "queueReleaseBlocked", blockers: releaseReservation.blockers },
          cleanupFailure: null,
        },
      };
    }

    this.busy = true;
    const candidate: CandidateThreadOwner = {
      generation: ++this.transitionGeneration,
      threadId,
      releaseReservation: releaseReservation?.reservation ?? null,
      attachedThreadId: null,
      subscriptionId: null,
      notifications: [],
    };
    this.candidate = candidate;
    return { type: "candidate", candidate };
  }

  private constructActiveOwner(preparation: CandidatePreparation): ActiveOwnerPreparationResult {
    const { attachResponse, candidate } = preparation;
    let preparedOwner: PreparedActiveThreadOwner;
    try {
      preparedOwner = prepareActiveThreadOwner({
        attachResponse,
        commands: this.commands,
        dispatch: this.dispatch,
        scheduler: this.scheduler,
      });
    } catch (error: unknown) {
      return { type: "failed", candidate, error };
    }

    const previousOwner = this.activeOwner;
    return {
      type: "prepared",
      preparedOwner: {
        ...preparation,
        previousOwner,
        activeOwner: preparedOwner.activeOwner,
        preparedOwner,
      },
    };
  }

  private commitAndReconcileActiveOwner(prepared: PreparedActiveOwner): CommitReconciliation {
    const { activeOwner, attachResponse, candidate } = prepared;
    this.commitInProgress = true;
    let committed: boolean;
    let applicationOperation: "commit" | "publish" = "commit";
    let cleanupFailure: ThreadSwitchCleanupFailure | null = null;
    try {
      committed = prepared.preparedOwner.commit();
      if (committed) {
        this.activeOwner = activeOwner;
        applicationOperation = "publish";
        this.publishActiveOwner(activeOwner);
      }
    } catch (error: unknown) {
      committed =
        activeOwner.projectionOwner.ownerThreadId === candidate.threadId &&
        activeOwner.projectionOwner.ownerSubscriptionId === attachResponse.subscriptionId;
      cleanupFailure = { phase: "application", operation: applicationOperation, error };
      if (committed) {
        this.activeOwner = activeOwner;
      }
    } finally {
      this.commitInProgress = false;
    }
    return { committed, cleanupFailure };
  }

  private replayCommittedCandidate(
    prepared: PreparedActiveOwner,
    cleanupFailure: ThreadSwitchCleanupFailure | null,
  ): Readonly<{
    cleanupFailure: ThreadSwitchCleanupFailure | null;
    disposeAfterCommit: boolean;
  }> {
    const disposeAfterCommit = this.disposeRequested;
    this.disposeRequested = false;
    if (!disposeAfterCommit && cleanupFailure == null && this.isCurrent(prepared.candidate)) {
      try {
        this.replayCandidateNotifications(prepared.candidate, prepared.activeOwner);
      } catch (error: unknown) {
        cleanupFailure = { phase: "application", operation: "replay", error };
      }
    }
    this.finishCommitted(prepared.candidate);
    return { cleanupFailure, disposeAfterCommit };
  }

  private cleanupPreviousOwner(
    prepared: PreparedActiveOwner,
    replay: Readonly<{
      cleanupFailure: ThreadSwitchCleanupFailure | null;
      disposeAfterCommit: boolean;
    }>,
  ): ThreadSwitchCleanupFailure | null {
    const { previousOwner } = prepared;
    previousOwner?.dispose();
    if (replay.disposeAfterCommit) {
      this.disposeActiveOwner();
    }
    return replay.cleanupFailure;
  }

  handleProjectionEvent(notification: ThreadProjectionEventNotification): void {
    const input = { type: "event", notification } as const;
    if (this.bufferCandidateNotification(notification, input)) {
      return;
    }
    if (this.activeOwner != null) {
      applyActiveThreadOwnerNotification(this.activeOwner, input);
    }
  }

  handleProjectionDelta(notification: ThreadProjectionDeltaNotification): void {
    const input = { type: "delta", notification } as const;
    if (this.bufferCandidateNotification(notification, input)) {
      return;
    }
    if (this.activeOwner != null) {
      applyActiveThreadOwnerNotification(this.activeOwner, input);
    }
  }

  handleProjectionClosed(notification: ThreadProjectionClosedNotification): void {
    const input = { type: "closed", notification } as const;
    if (this.bufferCandidateNotification(notification, input)) {
      return;
    }
    if (this.activeOwner != null) {
      applyActiveThreadOwnerNotification(this.activeOwner, input);
    }
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.transitionGeneration += 1;
    this.candidate = null;
    if (this.commitInProgress) {
      this.disposeRequested = true;
      return;
    }
    this.disposeActiveOwner();
  }

  private bufferCandidateNotification(
    notification: { threadId: string; subscriptionId: string },
    candidateNotification: ActiveThreadOwnerNotification,
  ): boolean {
    const candidate = this.candidate;
    if (notification.threadId !== candidate?.threadId) {
      return false;
    }
    if (
      candidate.subscriptionId != null &&
      notification.subscriptionId !== candidate.subscriptionId
    ) {
      return true;
    }
    candidate.notifications.push(candidateNotification);
    return true;
  }

  private replayCandidateNotifications(
    candidate: CandidateThreadOwner,
    activeOwner: ActiveThreadOwnerHandle,
  ): void {
    for (const buffered of candidate.notifications) {
      if (!this.isCurrent(candidate)) {
        return;
      }
      applyActiveThreadOwnerNotification(activeOwner, buffered);
    }
  }

  private async finishFailed(
    candidate: CandidateThreadOwner,
    phase: "resume" | "attach",
    error: unknown,
  ): Promise<ThreadSwitchOutcome> {
    const cleanupFailure = await this.detachCandidate(candidate);
    this.finishUncommitted(candidate);
    return { type: "failed", phase, error, cleanupFailure };
  }

  private async finishBlocked(
    candidate: CandidateThreadOwner,
    type: "disposed",
  ): Promise<ThreadSwitchOutcome> {
    const cleanupFailure = await this.detachCandidate(candidate);
    this.finishUncommitted(candidate);
    return { type: "blocked", reason: { type }, cleanupFailure };
  }

  private isCurrent(candidate: CandidateThreadOwner): boolean {
    return (
      !this.disposed &&
      this.candidate === candidate &&
      candidate.generation === this.transitionGeneration
    );
  }

  private finishUncommitted(candidate: CandidateThreadOwner): void {
    candidate.releaseReservation?.release();
    if (this.candidate === candidate) {
      this.candidate = null;
      this.busy = false;
    }
  }

  private finishCommitted(candidate: CandidateThreadOwner): void {
    if (this.candidate === candidate) {
      this.candidate = null;
    }
  }

  private async detachCandidate(
    candidate: CandidateThreadOwner,
  ): Promise<ThreadSwitchCleanupFailure | null> {
    if (candidate.attachedThreadId == null) {
      return null;
    }
    try {
      await this.commands.detachThreadProjection({ threadId: candidate.attachedThreadId });
      return null;
    } catch (error: unknown) {
      return {
        phase: "detach",
        owner: "candidate",
        threadId: candidate.attachedThreadId,
        error,
      };
    }
  }

  private disposeActiveOwner(): void {
    this.activeOwner?.dispose();
  }
}
