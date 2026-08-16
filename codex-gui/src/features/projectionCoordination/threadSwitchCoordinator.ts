import type { AppDispatch } from "@/app/store";
import {
  createComposerInputQueueCoordinator,
  type ComposerInputQueueCoordinator,
  type ComposerInputQueueCoordinatorReleaseBlocker,
  type ComposerInputQueueCoordinatorReleaseReservation,
} from "@/features/composerInputQueue/composerInputQueueCoordinator";
import type { GuiHostCommands } from "@/features/guiHost/guiHostClient";
import type {
  ThreadProjectionClosedNotification,
  ThreadProjectionDeltaNotification,
  ThreadProjectionEventNotification,
} from "@codex-protocol/v2";
import { buildLiveThreadReplacementRecord } from "./buildLiveThreadReplacementRecord";
import {
  ProjectionApplicationCoordinator,
  type ProjectionAnimationFrameScheduler,
} from "./projectionApplicationCoordinator";

export type ActiveThreadOwnerHandle = Readonly<{
  threadId: string;
  subscriptionId: string;
  projectionOwner: ProjectionApplicationCoordinator;
  queueCoordinator: ComposerInputQueueCoordinator;
}>;

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
  "attachThreadProjection" | "detachThreadProjection" | "resumeThread" | "startTurn"
>;

type ThreadSwitchCoordinatorOptions = Readonly<{
  activeOwner: ActiveThreadOwnerHandle;
  commands: ThreadSwitchCommands;
  dispatch: AppDispatch;
  publishActiveOwner: (activeOwner: ActiveThreadOwnerHandle) => void;
  scheduler: ProjectionAnimationFrameScheduler;
}>;

type CandidateNotification =
  | Readonly<{ type: "event"; notification: ThreadProjectionEventNotification }>
  | Readonly<{ type: "delta"; notification: ThreadProjectionDeltaNotification }>
  | Readonly<{ type: "closed"; notification: ThreadProjectionClosedNotification }>;

type CandidateThreadOwner = {
  generation: number;
  threadId: string;
  releaseReservation: ComposerInputQueueCoordinatorReleaseReservation;
  attachedThreadId: string | null;
  subscriptionId: string | null;
  notifications: CandidateNotification[];
};

type SwitchAdmission =
  | Readonly<{ type: "candidate"; candidate: CandidateThreadOwner }>
  | Readonly<{ type: "outcome"; outcome: ThreadSwitchOutcome }>;

type CandidatePreparation = Readonly<{
  candidate: CandidateThreadOwner;
  attachResponse: Awaited<ReturnType<ThreadSwitchCommands["attachThreadProjection"]>>;
  replacementRecord: ReturnType<typeof buildLiveThreadReplacementRecord>;
}>;

type PreparedActiveOwner = CandidatePreparation &
  Readonly<{
    previousOwner: ActiveThreadOwnerHandle;
    activeOwner: ActiveThreadOwnerHandle;
    projectionOwner: ProjectionApplicationCoordinator;
    queueCoordinator: ComposerInputQueueCoordinator;
  }>;

type ActiveOwnerPreparationResult =
  | Readonly<{ type: "prepared"; preparedOwner: PreparedActiveOwner }>
  | Readonly<{ type: "failed"; candidate: CandidateThreadOwner; error: unknown }>;

type CommitReconciliation = Readonly<{
  committed: boolean;
  cleanupFailure: ThreadSwitchCleanupFailure | null;
}>;

export class ThreadSwitchCoordinator {
  private activeOwner: ActiveThreadOwnerHandle;
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

  getActiveOwner(): ActiveThreadOwnerHandle {
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

    let replacementRecord: CandidatePreparation["replacementRecord"];
    try {
      replacementRecord = buildLiveThreadReplacementRecord(attachResponse);
    } catch (error: unknown) {
      return this.finishFailed(candidate, "attach", error);
    }
    const activeOwnerPreparation = this.constructActiveOwner({
      candidate,
      attachResponse,
      replacementRecord,
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
      preparedOwner.queueCoordinator.dispose();
      preparedOwner.projectionOwner.dispose();
      return this.finishFailed(
        preparedOwner.candidate,
        "attach",
        cleanupFailure?.error ?? new Error("prepared projection owner could not commit"),
      );
    }
    const replay = this.replayCommittedCandidate(preparedOwner, cleanupFailure);
    cleanupFailure = this.cleanupPreviousOwner(preparedOwner, replay);
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
    if (threadId === this.activeOwner.threadId) {
      return { type: "outcome", outcome: { type: "current", activeOwner: this.activeOwner } };
    }
    if (this.busy) {
      return {
        type: "outcome",
        outcome: { type: "blocked", reason: { type: "busy" }, cleanupFailure: null },
      };
    }

    const releaseReservation = this.activeOwner.queueCoordinator.reserveRelease();
    if (releaseReservation.type === "blocked") {
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
      releaseReservation: releaseReservation.reservation,
      attachedThreadId: null,
      subscriptionId: null,
      notifications: [],
    };
    this.candidate = candidate;
    return { type: "candidate", candidate };
  }

  private constructActiveOwner(preparation: CandidatePreparation): ActiveOwnerPreparationResult {
    const { attachResponse, candidate } = preparation;
    let queueCoordinator: ComposerInputQueueCoordinator | null = null;
    const projectionOwner = new ProjectionApplicationCoordinator({
      dispatch: this.dispatch,
      scheduler: this.scheduler,
      acceptedEventSink: (payload) => {
        queueCoordinator?.observeAcceptedEvent(payload);
      },
    });
    try {
      queueCoordinator = createComposerInputQueueCoordinator({
        threadId: candidate.threadId,
        activeTurnId:
          attachResponse.snapshot.thread.turns
            .toReversed()
            .find((turn) => turn.status === "inProgress")?.id ?? null,
        startTurn: this.commands.startTurn,
      });
    } catch (error: unknown) {
      projectionOwner.dispose();
      return { type: "failed", candidate, error };
    }

    const previousOwner = this.activeOwner;
    return {
      type: "prepared",
      preparedOwner: {
        ...preparation,
        previousOwner,
        activeOwner: {
          threadId: candidate.threadId,
          subscriptionId: attachResponse.subscriptionId,
          projectionOwner,
          queueCoordinator,
        },
        projectionOwner,
        queueCoordinator,
      },
    };
  }

  private commitAndReconcileActiveOwner(prepared: PreparedActiveOwner): CommitReconciliation {
    const { activeOwner, attachResponse, candidate, projectionOwner, replacementRecord } = prepared;
    this.commitInProgress = true;
    let committed: boolean;
    let applicationOperation: "commit" | "publish" = "commit";
    let cleanupFailure: ThreadSwitchCleanupFailure | null = null;
    try {
      committed = projectionOwner.commitLiveThreadReplacement(replacementRecord);
      if (committed) {
        this.activeOwner = activeOwner;
        applicationOperation = "publish";
        this.publishActiveOwner(activeOwner);
      }
    } catch (error: unknown) {
      committed =
        projectionOwner.ownerThreadId === candidate.threadId &&
        projectionOwner.ownerSubscriptionId === attachResponse.subscriptionId;
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
        this.replayCandidateNotifications(prepared.candidate, prepared.projectionOwner);
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
    previousOwner.queueCoordinator.dispose();
    previousOwner.projectionOwner.dispose();
    if (replay.disposeAfterCommit) {
      this.disposeActiveOwner();
    }
    return replay.cleanupFailure;
  }

  handleProjectionEvent(notification: ThreadProjectionEventNotification): void {
    if (this.bufferCandidateNotification(notification, { type: "event", notification })) {
      return;
    }
    this.activeOwner.projectionOwner.handleProjectionEvent(notification);
  }

  handleProjectionDelta(notification: ThreadProjectionDeltaNotification): void {
    if (this.bufferCandidateNotification(notification, { type: "delta", notification })) {
      return;
    }
    this.activeOwner.projectionOwner.handleProjectionDelta(notification);
  }

  handleProjectionClosed(notification: ThreadProjectionClosedNotification): void {
    if (this.bufferCandidateNotification(notification, { type: "closed", notification })) {
      return;
    }
    this.activeOwner.projectionOwner.handleProjectionClosed(notification);
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
    candidateNotification: CandidateNotification,
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
    projectionOwner: ProjectionApplicationCoordinator,
  ): void {
    for (const buffered of candidate.notifications) {
      if (!this.isCurrent(candidate)) {
        return;
      }
      switch (buffered.type) {
        case "event":
          projectionOwner.handleProjectionEvent(buffered.notification);
          break;
        case "delta":
          projectionOwner.handleProjectionDelta(buffered.notification);
          break;
        case "closed":
          projectionOwner.handleProjectionClosed(buffered.notification);
          break;
      }
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
    candidate.releaseReservation.release();
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
    this.activeOwner.queueCoordinator.dispose();
    this.activeOwner.projectionOwner.dispose();
  }
}
