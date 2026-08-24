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

export type ContinueThreadOutcome =
  | Readonly<{
      type: "ready";
      threadId: string;
      warnings: readonly ThreadSwitchWarning[];
    }>
  | Readonly<{
      type: "unavailable";
      failure: ContinueThreadFailure;
    }>;

export type ContinueThreadFailure =
  | Readonly<{ type: "switchInProgress" }>
  | Readonly<{
      type: "currentThreadUnresolved";
      blockers: readonly ComposerInputQueueCoordinatorReleaseBlocker[];
      activeThreadId: string | null;
    }>
  | Readonly<{
      type: "connectionLost";
      progress: "beforeCommit" | "afterCommit";
      threadId: string;
      cleanupError: unknown | null;
    }>
  | Readonly<{
      type: "operationFailed";
      phase: "admission" | "resume" | "attach" | "activate";
      error: unknown;
      cleanupError: unknown | null;
    }>;

export type ThreadSwitchWarning =
  | Readonly<{ type: "previousOwnerCleanupFailed"; error: unknown }>
  | Readonly<{
      type: "postCommitDegraded";
      operation: "publishAuthorization" | "replay";
      error: unknown;
    }>;

export type ActiveOwnerPublicationReceipt =
  | Readonly<{
      ownerPublished: true;
      authorizationPersistenceError: unknown | null;
    }>
  | Readonly<{ ownerPublished: false; error: unknown }>;

type ThreadSwitchCommands = Pick<
  GuiHostCommands,
  | "attachThreadProjection"
  | "detachThreadProjection"
  | "interruptTurn"
  | "listSkills"
  | "resumeThread"
  | "startTurn"
  | "steerTurn"
>;

type ThreadSwitchCoordinatorOptions = Readonly<{
  activeOwner: ActiveThreadOwnerHandle | null;
  commands: ThreadSwitchCommands;
  dispatch: AppDispatch;
  readCommittedActiveThreadId: () => string | null;
  publishActiveOwner: (activeOwner: ActiveThreadOwnerHandle) => ActiveOwnerPublicationReceipt;
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
  | Readonly<{ type: "alreadyCurrent"; activeOwner: ActiveThreadOwnerHandle }>
  | Readonly<{ type: "failure"; failure: TerminalFailure }>;

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
  | Readonly<{ type: "error"; candidate: CandidateThreadOwner; error: unknown }>;

type ActivationFacts = Readonly<{
  committed: boolean;
  published: boolean;
  failure: unknown | null;
  warnings: readonly Extract<ThreadSwitchWarning, { type: "postCommitDegraded" }>[];
}>;

type TerminalFailure =
  | Extract<ContinueThreadFailure, { type: "switchInProgress" | "currentThreadUnresolved" }>
  | Readonly<{ type: "connectionLost" }>
  | Readonly<{
      type: "operationFailed";
      phase: "admission" | "resume" | "attach" | "activate";
      error: unknown;
    }>;

type TerminalFacts = Readonly<{
  threadId: string;
  generation: number;
  activeOwner: ActiveThreadOwnerHandle | null;
  committed: boolean;
  published: boolean;
  failure: TerminalFailure | null;
  cleanupError: unknown | null;
  warnings: readonly ThreadSwitchWarning[];
}>;

export class ThreadSwitchCoordinator {
  private activeOwner: ActiveThreadOwnerHandle | null;
  private publishedActiveOwner: ActiveThreadOwnerHandle | null;
  private readonly commands: ThreadSwitchCommands;
  private readonly dispatch: AppDispatch;
  private readonly readCommittedActiveThreadId: ThreadSwitchCoordinatorOptions["readCommittedActiveThreadId"];
  private readonly publishActiveOwner: ThreadSwitchCoordinatorOptions["publishActiveOwner"];
  private readonly scheduler: ProjectionAnimationFrameScheduler;
  private candidate: CandidateThreadOwner | null = null;
  private transitionGeneration = 0;
  private commitInProgress = false;
  private disposeRequested = false;
  private disposalError: unknown | null = null;
  private busy = false;
  private disposed = false;

  constructor({
    activeOwner,
    commands,
    dispatch,
    readCommittedActiveThreadId,
    publishActiveOwner,
    scheduler,
  }: ThreadSwitchCoordinatorOptions) {
    this.activeOwner = activeOwner;
    this.publishedActiveOwner = activeOwner;
    this.commands = commands;
    this.dispatch = dispatch;
    this.readCommittedActiveThreadId = readCommittedActiveThreadId;
    this.publishActiveOwner = publishActiveOwner;
    this.scheduler = scheduler;
  }

  getActiveOwner(): ActiveThreadOwnerHandle | null {
    return this.activeOwner;
  }

  continueThread = (threadId: string): Promise<ContinueThreadOutcome> =>
    this.executeThreadSwitch(threadId);

  private async executeThreadSwitch(threadId: string): Promise<ContinueThreadOutcome> {
    const admission = this.reserveCandidate(threadId);
    if (admission.type === "alreadyCurrent") {
      return this.classifyTerminal({
        threadId,
        generation: this.transitionGeneration,
        activeOwner: admission.activeOwner,
        committed: true,
        published: true,
        failure: null,
        cleanupError: null,
        warnings: [],
      });
    }
    if (admission.type === "failure") {
      return this.classifyTerminal({
        threadId,
        generation: this.transitionGeneration,
        activeOwner: null,
        committed: false,
        published: false,
        failure: admission.failure,
        cleanupError: null,
        warnings: [],
      });
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
      return this.finishUncommitted(candidate, {
        type: "operationFailed",
        phase: "resume",
        error,
      });
    }
    if (!this.isCurrent(candidate)) {
      return this.finishUncommitted(candidate, { type: "connectionLost" });
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
      return this.finishUncommitted(candidate, {
        type: "operationFailed",
        phase: "attach",
        error,
      });
    }
    if (!this.isCurrent(candidate)) {
      return this.finishUncommitted(candidate, { type: "connectionLost" });
    }

    const activeOwnerPreparation = this.constructActiveOwner({
      candidate,
      attachResponse,
    });
    if (activeOwnerPreparation.type === "error") {
      return this.finishUncommitted(activeOwnerPreparation.candidate, {
        type: "operationFailed",
        phase: "attach",
        error: activeOwnerPreparation.error,
      });
    }

    const prepared = activeOwnerPreparation.preparedOwner;
    const activation = this.activateOwner(prepared);
    let cleanupError = this.settleDeferredDisposal();
    if (!activation.committed) {
      return this.finishUncommitted(
        candidate,
        {
          type: "operationFailed",
          phase: "activate",
          error: activation.failure ?? new Error("prepared projection owner could not commit"),
        },
        prepared.preparedOwner,
        cleanupError,
      );
    }

    const warnings: ThreadSwitchWarning[] = [...activation.warnings];
    if (activation.published && this.isAttemptLive(candidate.generation)) {
      try {
        this.replayCandidateNotifications(candidate, prepared.activeOwner);
      } catch (error: unknown) {
        warnings.push({ type: "postCommitDegraded", operation: "replay", error });
      }
    }

    this.finishCommitted(candidate);
    let previousOwnerCleanupError: unknown | null = null;
    if (prepared.previousOwner != null) {
      try {
        prepared.previousOwner.dispose("ownerReplaced");
      } catch (error: unknown) {
        previousOwnerCleanupError = appendError(previousOwnerCleanupError, error);
      }
    }
    cleanupError = appendError(cleanupError, this.settleDeferredDisposal());
    if (prepared.previousOwner != null) {
      try {
        await this.commands.detachThreadProjection({ threadId: prepared.previousOwner.threadId });
      } catch (error: unknown) {
        previousOwnerCleanupError = appendError(previousOwnerCleanupError, error);
      }
    }
    cleanupError = appendError(cleanupError, this.disposalError);
    this.busy = false;

    if (previousOwnerCleanupError != null) {
      cleanupError = appendError(cleanupError, previousOwnerCleanupError);
      warnings.push({ type: "previousOwnerCleanupFailed", error: previousOwnerCleanupError });
    }
    return this.classifyTerminal({
      threadId: candidate.threadId,
      generation: candidate.generation,
      activeOwner: prepared.activeOwner,
      committed: activation.committed,
      published: activation.published,
      failure:
        activation.failure == null
          ? null
          : { type: "operationFailed", phase: "activate", error: activation.failure },
      cleanupError,
      warnings,
    });
  }

  private reserveCandidate(threadId: string): SwitchAdmission {
    if (this.disposed) {
      return { type: "failure", failure: { type: "connectionLost" } };
    }
    const activeOwner = this.activeOwner;
    if (activeOwner?.threadId === threadId) {
      return { type: "alreadyCurrent", activeOwner };
    }
    if (this.busy) {
      return { type: "failure", failure: { type: "switchInProgress" } };
    }

    let releaseReservation: ComposerInputQueueCoordinatorReleaseReservation | null;
    try {
      const release = activeOwner?.queueCoordinator.reserveRelease() ?? null;
      if (release?.type === "blocked") {
        return {
          type: "failure",
          failure: {
            type: "currentThreadUnresolved",
            blockers: release.blockers,
            activeThreadId: activeOwner?.threadId ?? null,
          },
        };
      }
      releaseReservation = release?.reservation ?? null;
    } catch (error: unknown) {
      return {
        type: "failure",
        failure: { type: "operationFailed", phase: "admission", error },
      };
    }

    this.busy = true;
    const candidate: CandidateThreadOwner = {
      generation: ++this.transitionGeneration,
      threadId,
      releaseReservation,
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
      return { type: "error", candidate, error };
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

  private activateOwner(prepared: PreparedActiveOwner): ActivationFacts {
    const { activeOwner, candidate } = prepared;
    this.commitInProgress = true;
    let committed = false;
    let published = false;
    let failure: unknown | null = null;
    const warnings: Extract<ThreadSwitchWarning, { type: "postCommitDegraded" }>[] = [];
    try {
      let commitReturned = false;
      let commitError: unknown | null = null;
      try {
        commitReturned = prepared.preparedOwner.commit();
      } catch (error: unknown) {
        commitError = error;
      }
      try {
        committed = this.readCommittedActiveThreadId() === candidate.threadId;
      } catch (error: unknown) {
        failure = error;
      }
      if (failure == null) {
        if (commitError != null) {
          if (committed) {
            warnings.push({ type: "postCommitDegraded", operation: "replay", error: commitError });
          } else {
            failure = commitError;
          }
        } else if (!commitReturned || !committed) {
          failure = new Error("prepared projection owner could not commit to the active store");
        }
      }
      if (committed && failure == null) {
        this.activeOwner = activeOwner;
        if (!this.disposeRequested) {
          try {
            const receipt = this.publishActiveOwner(activeOwner);
            published = receipt.ownerPublished;
            if (!receipt.ownerPublished) {
              failure = receipt.error;
            } else {
              this.publishedActiveOwner = activeOwner;
              if (receipt.authorizationPersistenceError != null) {
                warnings.push({
                  type: "postCommitDegraded",
                  operation: "publishAuthorization",
                  error: receipt.authorizationPersistenceError,
                });
              }
            }
          } catch (error: unknown) {
            failure = error;
          }
        }
      }
    } finally {
      this.commitInProgress = false;
    }
    return { committed, published, failure, warnings };
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
    try {
      this.disposeActiveOwner();
    } catch (error: unknown) {
      this.disposalError = appendError(this.disposalError, error);
    }
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

  private async finishUncommitted(
    candidate: CandidateThreadOwner,
    failure: TerminalFailure,
    preparedOwner: PreparedActiveThreadOwner | null = null,
    initialCleanupError: unknown | null = null,
  ): Promise<ContinueThreadOutcome> {
    let cleanupError = initialCleanupError;
    if (preparedOwner != null) {
      try {
        preparedOwner.dispose();
      } catch (error: unknown) {
        cleanupError = appendError(cleanupError, error);
      }
    }
    cleanupError = appendError(cleanupError, await this.detachCandidate(candidate));
    try {
      candidate.releaseReservation?.release();
    } catch (error: unknown) {
      cleanupError = appendError(cleanupError, error);
    } finally {
      if (this.candidate === candidate) {
        this.candidate = null;
        this.busy = false;
      }
    }
    cleanupError = appendError(cleanupError, this.settleDeferredDisposal());
    cleanupError = appendError(cleanupError, this.disposalError);
    return this.classifyTerminal({
      threadId: candidate.threadId,
      generation: candidate.generation,
      activeOwner: null,
      committed: false,
      published: false,
      failure,
      cleanupError,
      warnings: [],
    });
  }

  private classifyTerminal(facts: TerminalFacts): ContinueThreadOutcome {
    if (
      facts.failure?.type === "switchInProgress" ||
      facts.failure?.type === "currentThreadUnresolved"
    ) {
      return { type: "unavailable", failure: facts.failure };
    }
    if (facts.failure?.type === "connectionLost" || !this.isAttemptLive(facts.generation)) {
      return {
        type: "unavailable",
        failure: {
          type: "connectionLost",
          progress: facts.committed ? "afterCommit" : "beforeCommit",
          threadId: facts.threadId,
          cleanupError: facts.cleanupError,
        },
      };
    }
    if (facts.failure?.type === "operationFailed") {
      return {
        type: "unavailable",
        failure: { ...facts.failure, cleanupError: facts.cleanupError },
      };
    }
    let committedActiveThreadId: string | null;
    try {
      committedActiveThreadId = this.readCommittedActiveThreadId();
    } catch (error: unknown) {
      return {
        type: "unavailable",
        failure: {
          type: "operationFailed",
          phase: "activate",
          error,
          cleanupError: facts.cleanupError,
        },
      };
    }
    if (
      !facts.committed ||
      !facts.published ||
      facts.activeOwner == null ||
      this.activeOwner !== facts.activeOwner ||
      this.publishedActiveOwner !== facts.activeOwner ||
      facts.activeOwner.threadId !== facts.threadId ||
      committedActiveThreadId !== facts.threadId
    ) {
      return {
        type: "unavailable",
        failure: {
          type: "operationFailed",
          phase: "activate",
          error: new Error("thread switch did not publish an available active owner"),
          cleanupError: facts.cleanupError,
        },
      };
    }
    return { type: "ready", threadId: facts.threadId, warnings: facts.warnings };
  }

  private isCurrent(candidate: CandidateThreadOwner): boolean {
    return this.candidate === candidate && this.isAttemptLive(candidate.generation);
  }

  private isAttemptLive(generation: number): boolean {
    return !this.disposed && generation === this.transitionGeneration;
  }

  private finishCommitted(candidate: CandidateThreadOwner): void {
    if (this.candidate === candidate) {
      this.candidate = null;
    }
  }

  private async detachCandidate(candidate: CandidateThreadOwner): Promise<unknown | null> {
    if (candidate.attachedThreadId == null) {
      return null;
    }
    try {
      await this.commands.detachThreadProjection({ threadId: candidate.attachedThreadId });
      return null;
    } catch (error: unknown) {
      return error;
    }
  }

  private settleDeferredDisposal(): unknown | null {
    if (!this.disposeRequested) {
      return null;
    }
    this.disposeRequested = false;
    try {
      this.disposeActiveOwner();
      return null;
    } catch (error: unknown) {
      this.disposalError = appendError(this.disposalError, error);
      return null;
    }
  }

  private disposeActiveOwner(): void {
    const activeOwner = this.activeOwner;
    this.activeOwner = null;
    this.publishedActiveOwner = null;
    activeOwner?.dispose();
  }
}

function appendError(current: unknown | null, error: unknown | null): unknown | null {
  if (error == null) return current;
  if (current == null) return error;
  return new AggregateError([current, error], "Multiple thread switch errors");
}
