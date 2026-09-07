import type {
  Turn,
  TurnInterruptParams,
  TurnInterruptResponse,
  TurnStartParams,
  TurnStartResponse,
  TurnSteerParams,
  TurnSteerResponse,
} from "@codex-protocol/v2";
import { isGuiHostCommandError } from "@/features/guiHost/guiHostCommandGateway";
import type { ActiveThreadProjectionAcceptedEvent } from "@/features/activeThreadSession/activeThreadProjectionFacts";
import type { ComposerDraftCapture } from "@/features/composerEditor/composerEditorContracts";
import { createListenerSet } from "@/subscriptions/listenerSet";
import { randomUuid } from "@/identity/randomUuid";
import { BrowserPersistenceStore } from "@/features/browserPersistence/browserPersistenceStore";
import {
  exportComposerDraft,
  importComposerDraft,
  type ComposerDraft,
} from "@/features/composerEditor/composerDraft";
import {
  decodeComposerCoordinatorRecord,
  type ComposerCoordinatorRecord,
} from "./composerCoordinatorPersistence";
import {
  createComposerInputQueue,
  type ComposerInputQueue,
  type ComposerInputQueueEffect,
  type ComposerInputQueueTransition,
  type ComposerInterruptedDisposition,
  type StartClaim,
  type StartSettlement,
  type SteerSettlement,
} from "./composerInputQueue";
import type {
  ComposerInputQueueReleaseBlocker,
  ComposerPendingInputDetailRequest,
  ComposerPendingInputDetailResult,
  ComposerPendingInputEditRestore,
  ComposerPendingInputManagementRequest,
  ComposerPendingInputMoveRequest,
  ComposerPendingInputOwnerGoneCause,
  ComposerPendingInputOwnerGoneResult,
  ComposerPendingInputPageRequest,
  ComposerPendingInputPageResult,
  ComposerQueueMessage,
  ComposerRejectedSteerView,
  RecoveryBatch,
} from "./composerInputQueueContracts";
import { createComposerInterruptState, type InterruptClaim } from "./composerInterruptState";
import type { InterruptPhase, InterruptSettlement } from "./composerInterruptState";
import type { SteerClaim } from "./composerSteerQueueState";
import { copyComposerInputPayload } from "@/features/composerInput/composerInputPayload";
import { runtimeObservationFromAcceptedProjectionEvent } from "./composerInputQueueRuntimeObservation";
import {
  createComposerPendingInputLiveManagement,
  type ComposerPendingInputCoordinatorBeginEditResult,
  type ComposerPendingInputCoordinatorDeleteResult,
  type ComposerPendingInputCoordinatorMoveResult,
  type ComposerPendingInputLiveInvalidation,
  type ComposerPendingInputLiveManagement,
} from "./composerPendingInputLiveManagement";

export type {
  ComposerPendingInputCoordinatorBeginEditResult,
  ComposerPendingInputCoordinatorDeleteResult,
  ComposerPendingInputCoordinatorEditReservation,
  ComposerPendingInputCoordinatorMoveResult,
  ComposerPendingInputLiveInvalidation,
} from "./composerPendingInputLiveManagement";

export type ComposerInputQueueCoordinatorSnapshot = Readonly<{
  persistence: Readonly<{
    error: string | null;
    restoredPaused: boolean;
    revision: number | null;
    unknownMessages: readonly Readonly<{ id: string; text: string }>[];
  }>;
  ordinaryQueuedCount: number;
  guidingCount: number;
  detailRevision: number;
  recoveryCount: number;
  recovery: Readonly<{ reason: RecoveryBatch["reason"]; count: number }> | null;
  isRecovering: boolean;
  rejectedSteers: readonly ComposerRejectedSteerView[];
  hasUnknownSteer: boolean;
  canStop: boolean;
  interrupt: Readonly<{ phase: InterruptPhase | "definitelyNotAccepted" }> | null;
  pendingInputManagementOutcome: ComposerPendingInputLiveInvalidation | null;
}>;

export type ComposerInputQueueSubmitResult =
  | Readonly<{ type: "accepted" }>
  | Readonly<{
      type: "rejected";
      reason:
        | "disposed"
        | "recoveryPending"
        | "releaseReserved"
        | "managementPending"
        | "persistenceFailed"
        | "invalidInput";
    }>;

export type ComposerInputQueueCoordinatorReleaseBlocker =
  | ComposerInputQueueReleaseBlocker
  | Readonly<{ type: "recoveryPending"; count: number }>
  | Readonly<{ type: "recovering" }>
  | Readonly<{ type: "releaseReserved" }>
  | Readonly<{ type: "interruptPending"; phase: InterruptPhase }>
  | Readonly<{ type: "managementPending" }>
  | Readonly<{ type: "persistenceFailed" }>
  | Readonly<{ type: "disposed" }>;

export type ComposerInputQueueCoordinatorReleaseReadiness =
  | Readonly<{ type: "safe" }>
  | Readonly<{
      type: "blocked";
      blockers: readonly ComposerInputQueueCoordinatorReleaseBlocker[];
    }>;

export type ComposerInputQueueCoordinatorReleaseReservation = Readonly<{
  release(): void;
}>;

export type ComposerInputQueueCoordinatorReserveReleaseResult =
  | Readonly<{
      type: "reserved";
      reservation: ComposerInputQueueCoordinatorReleaseReservation;
    }>
  | Readonly<{
      type: "blocked";
      blockers: readonly ComposerInputQueueCoordinatorReleaseBlocker[];
    }>;

export type ComposerInputQueueCoordinator = Readonly<{
  getDraft(): ComposerDraft | null;
  saveDraft(draft: ComposerDraft): boolean;
  retryPersistence(): boolean;
  resumeRestored(expectedRevision: number | null): boolean;
  suspendRestored(): void;
  completeRestoreReconciliation(): void;
  reconcileRestoredTurns(turns: readonly Turn[]): void;
  discardUnknown(id: string, expectedRevision: number | null): boolean;
  ownerThreadId: string;
  submit(capture: ComposerDraftCapture): ComposerInputQueueSubmitResult;
  submitSteer(capture: ComposerDraftCapture): ComposerInputQueueSubmitResult;
  promoteOrdinaryFrontToSteer(): boolean;
  interruptActiveTurn(): boolean;
  recover(): boolean;
  observeAcceptedEvent(payload: Readonly<ActiveThreadProjectionAcceptedEvent>): void;
  getReleaseReadiness(): ComposerInputQueueCoordinatorReleaseReadiness;
  reserveRelease(): ComposerInputQueueCoordinatorReserveReleaseResult;
  readPendingInputPage(request: ComposerPendingInputPageRequest): ComposerPendingInputPageResult;
  readPendingInputDetail(
    request: ComposerPendingInputDetailRequest,
  ): ComposerPendingInputDetailResult;
  beginPendingInputEdit(
    request: ComposerPendingInputManagementRequest,
    restore: ComposerPendingInputEditRestore,
  ): ComposerPendingInputCoordinatorBeginEditResult;
  deletePendingInput(
    request: ComposerPendingInputManagementRequest,
  ): ComposerPendingInputCoordinatorDeleteResult;
  movePendingInput(
    request: ComposerPendingInputMoveRequest,
  ): ComposerPendingInputCoordinatorMoveResult;
  getSnapshot(): ComposerInputQueueCoordinatorSnapshot;
  subscribe(listener: () => void): () => void;
  dispose(cause?: ComposerPendingInputOwnerGoneCause): void;
}>;

export type CreateComposerInputQueueCoordinatorInput = Readonly<{
  persistence: Readonly<{
    authorizationContext: string;
    storage?: Pick<Storage, "getItem" | "setItem">;
  }>;
  threadId: string;
  activeTurnId: Turn["id"] | null;
  startTurn(params: TurnStartParams): Promise<TurnStartResponse>;
  steerTurn(params: TurnSteerParams): Promise<TurnSteerResponse>;
  interruptTurn(params: TurnInterruptParams): Promise<TurnInterruptResponse>;
}>;

type CoordinatorState = {
  queue: ComposerInputQueue;
  interruptState: ReturnType<typeof createComposerInterruptState>;
  recovery: RecoveryBatch | null;
  deferredEffects: readonly ComposerInputQueueEffect[];
  failedInterruptTurnId: Turn["id"] | null;
  draft: ComposerDraft | null;
};

function recoveryCount(batch: RecoveryBatch | null): number {
  if (batch == null) return 0;
  switch (batch.reason) {
    case "startDefinitelyNotAccepted":
      return batch.messages.length;
    case "steerDefinitelyNotAccepted":
      return batch.transfer.intents.length;
    case "userStopped":
      return (batch.rejected?.entries.length ?? 0) + batch.messages.length;
  }
}

function deliveryFailure(error: unknown): Exclude<InterruptSettlement["type"], "accepted"> {
  return isGuiHostCommandError(error) && error.delivery === "definitelyNotAccepted"
    ? "definitelyNotAccepted"
    : "deliveryUnknown";
}

class ComposerInputQueueCoordinatorImpl implements ComposerInputQueueCoordinator {
  private state: CoordinatorState;
  private readonly persistenceStore: BrowserPersistenceStore<ComposerCoordinatorRecord>;
  private persistenceRevision: number | null = null;
  private persistenceError: string | null = null;
  private restoredPaused = false;
  private reconciliationComplete = false;
  private reconciliationRequested = false;
  private pendingDraft: ComposerDraft | null = null;
  private transactionEffects: (() => void)[] | null = null;
  private readonly pendingFacts: (() => void)[] = [];
  private get queue() {
    return this.state.queue;
  }
  private get interruptState() {
    return this.state.interruptState;
  }
  private set interruptState(value: ReturnType<typeof createComposerInterruptState>) {
    this.state.interruptState = value;
  }
  private get recovery() {
    return this.state.recovery;
  }
  private set recovery(value: RecoveryBatch | null) {
    this.state.recovery = value;
  }
  private get deferredEffects() {
    return this.state.deferredEffects;
  }
  private set deferredEffects(value: readonly ComposerInputQueueEffect[]) {
    this.state.deferredEffects = value;
  }
  private get failedInterruptTurnId() {
    return this.state.failedInterruptTurnId;
  }
  private set failedInterruptTurnId(value: Turn["id"] | null) {
    this.state.failedInterruptTurnId = value;
  }
  private readonly liveManagement: ComposerPendingInputLiveManagement;
  private readonly threadId: string;
  private readonly startTurn: CreateComposerInputQueueCoordinatorInput["startTurn"];
  private readonly steerTurn: CreateComposerInputQueueCoordinatorInput["steerTurn"];
  private readonly interruptTurn: CreateComposerInputQueueCoordinatorInput["interruptTurn"];
  private readonly listeners = createListenerSet();
  private snapshot: ComposerInputQueueCoordinatorSnapshot;
  private generation = 0;
  private releaseReservation: object | null = null;
  private disposed = false;
  private disposeCause: ComposerPendingInputOwnerGoneCause | null = null;
  private isRecovering = false;

  constructor(input: CreateComposerInputQueueCoordinatorInput) {
    this.threadId = input.threadId;
    this.startTurn = input.startTurn;
    this.steerTurn = input.steerTurn;
    this.interruptTurn = input.interruptTurn;
    this.state = {
      queue: createComposerInputQueue({
        threadId: input.threadId,
        activeTurnId: input.activeTurnId,
      }),
      interruptState: createComposerInterruptState(),
      recovery: null,
      deferredEffects: [],
      failedInterruptTurnId: null,
      draft: null,
    };
    this.persistenceStore = new BrowserPersistenceStore({
      ...input.persistence,
      threadId: input.threadId,
      codec: {
        encode: (value) => value,
        decode: (value) => decodeComposerCoordinatorRecord(value, input.threadId),
      },
    });
    try {
      const stored = this.persistenceStore.read();
      if (stored != null) {
        this.restoredPaused = true;
        this.queue.setAutomaticSendingPaused(true);
        this.persistenceRevision = stored.revision;
        this.recovery = this.queue.rehydrateState(stored.value.queue);
        this.interruptState.rehydrateState(stored.value.interrupt, this.generation);
        this.failedInterruptTurnId = stored.value.failedInterruptTurnId;
        if (stored.value.draft != null) {
          const imported = importComposerDraft(stored.value.draft);
          if (imported.type !== "imported") throw new Error("Invalid saved draft");
          this.state.draft = imported.draft;
        }
      }
    } catch (error: unknown) {
      this.persistenceError = persistenceErrorText(error);
      this.restoredPaused = true;
      this.queue.setAutomaticSendingPaused(true);
    }
    this.liveManagement = createComposerPendingInputLiveManagement(this.queue, {
      transact: (operation) => {
        const result = this.persistTransaction(() => operation(this.queue));
        return result.type === "committed" ? result : { type: "persistenceFailed" };
      },
      applyAcceptedEvent: (payload) => {
        this.applyAcceptedEvent(payload);
      },
      publishSnapshot: () => {
        this.publishSnapshot();
      },
      drainPendingInput: (intent) => {
        if (this.recoveryPending()) return "deferred";
        const result = this.persistTransaction(() => {
          this.consumeTransition(this.queue.drainPendingInput(intent));
        });
        if (result.type !== "committed") return "deferred";
        return this.recoveryPending() ? "consumedRecoveryPending" : "consumed";
      },
    });
    this.snapshot = {
      persistence: this.persistenceSnapshot(),
      ordinaryQueuedCount: 0,
      guidingCount: 0,
      detailRevision: this.queue.detailRevision(),
      recoveryCount: 0,
      recovery: null,
      isRecovering: false,
      rejectedSteers: [],
      hasUnknownSteer: false,
      canStop: input.activeTurnId != null,
      interrupt: null,
      pendingInputManagementOutcome: null,
    };
    this.publishSnapshot();
  }
  get ownerThreadId(): string {
    return this.threadId;
  }

  getDraft = (): ComposerDraft | null => this.pendingDraft ?? this.state.draft;

  saveDraft = (draft: ComposerDraft): boolean => {
    if (this.disposed) return false;
    this.pendingDraft = draft;
    return this.retryPersistence();
  };

  retryPersistence = (): boolean => {
    if (this.disposed) return false;
    const pending = [...this.pendingFacts];
    const draft = this.pendingDraft;
    const result = this.persistTransaction(() => {
      if (draft != null) this.state.draft = draft;
      for (const fact of pending) fact();
    }, true);
    if (result.type !== "committed") return false;
    if (this.pendingDraft === draft) this.pendingDraft = null;
    this.pendingFacts.splice(0, pending.length);
    if (this.reconciliationRequested) this.reconciliationComplete = true;
    this.liveManagement.flushDeferredDrains();
    this.publishSnapshot();
    return this.persistenceError == null;
  };

  completeRestoreReconciliation = (): void => {
    this.reconciliationRequested = true;
    this.retryPersistence();
  };

  reconcileRestoredTurns = (turns: readonly Turn[]): void => {
    if (!this.restoredPaused) return;
    this.receiveFact(() => {
      this.consumeTransition(this.queue.reconcileSnapshot(turns));
      const result = this.interruptState.reconcileSnapshot(turns, this.generation);
      if (result != null && "terminal" in result && result.terminal != null) {
        const turn = turns.find(({ id }) => id === result.terminal?.fact.params.turnId);
        if (turn == null) throw new Error("Reconciled interrupt is missing its snapshot turn");
        this.queue.prepareInterruptedSnapshot(turn);
        this.applyInterruptedDisposition(
          result.terminal.fact.params.turnId,
          result.terminal.disposition,
        );
      }
    });
  };

  resumeRestored = (expectedRevision: number | null): boolean => {
    if (
      this.disposed ||
      !this.reconciliationComplete ||
      expectedRevision !== this.persistenceRevision ||
      this.persistenceError != null
    )
      return false;
    const result = this.persistTransaction(() => {
      this.queue.setAutomaticSendingPaused(this.recoveryPending());
      this.consumeTransition(this.queue.drain());
    });
    if (result.type !== "committed") return false;
    this.restoredPaused = false;
    this.publishSnapshot();
    return true;
  };

  suspendRestored = (): void => {
    if (this.disposed) return;
    this.restoredPaused = true;
    this.reconciliationComplete = false;
    this.reconciliationRequested = false;
    this.queue.setAutomaticSendingPaused(true);
    this.publishSnapshot();
  };

  discardUnknown = (id: string, expectedRevision: number | null): boolean => {
    if (this.disposed || expectedRevision !== this.persistenceRevision) return false;
    const result = this.persistTransaction(() => this.queue.discardUnknown(id));
    return result.type === "committed" && result.result;
  };

  private persistenceSnapshot(): ComposerInputQueueCoordinatorSnapshot["persistence"] {
    const unknownMessages = this.queue.unknownMessages();
    return {
      error: this.persistenceError,
      restoredPaused: this.restoredPaused,
      revision: this.restoredPaused || unknownMessages.length > 0 ? this.persistenceRevision : null,
      unknownMessages,
    };
  }

  private persistTransaction<T>(
    operation: () => T,
    retry = false,
  ): Readonly<{ type: "committed"; result: T }> | Readonly<{ type: "persistenceFailed" }> {
    if (this.transactionEffects != null) return { type: "committed", result: operation() };
    if (this.disposed || (!retry && this.persistenceError != null))
      return { type: "persistenceFailed" };
    const original = this.state;
    const originalRecord = this.record(original);
    const wasRecovering = this.isRecovering;
    const effects: (() => void)[] = [];
    this.transactionEffects = effects;
    let prepared: ReturnType<ComposerInputQueue["prepare"]>;
    let result: T;
    try {
      const candidate = original.queue.prepare((queue) => {
        this.state = { ...original, queue, interruptState: original.interruptState.fork() };
        queue.setAutomaticSendingPaused(this.restoredPaused || this.recoveryPending());
        return operation();
      });
      prepared = candidate;
      result = candidate.result;
    } catch (error: unknown) {
      this.state = original;
      this.isRecovering = wasRecovering;
      this.transactionEffects = null;
      throw error;
    }
    try {
      const record = this.record(this.state);
      const changed = JSON.stringify(record) !== JSON.stringify(originalRecord);
      const saved =
        changed || retry ? this.persistenceStore.commit(record, this.persistenceRevision) : null;
      prepared.commit();
      this.state.queue = original.queue;
      if (saved != null) this.persistenceRevision = saved.revision;
      this.persistenceError = null;
    } catch (error: unknown) {
      this.state = original;
      this.isRecovering = wasRecovering;
      this.persistenceError = persistenceErrorText(error);
      this.transactionEffects = null;
      this.publishSnapshot();
      return { type: "persistenceFailed" };
    }
    this.transactionEffects = null;
    for (const effect of effects) {
      if (this.currentOwnerIsGone()) break;
      effect();
    }
    return { type: "committed", result };
  }

  private record(state: CoordinatorState): ComposerCoordinatorRecord {
    return {
      version: 1,
      queue: state.queue.exportState(state.recovery),
      draft: state.draft == null ? null : exportComposerDraft(state.draft),
      interrupt: state.interruptState.exportState(),
      failedInterruptTurnId: state.failedInterruptTurnId,
    };
  }

  private receiveFact(operation: () => void): void {
    if (this.disposed) return;
    if (this.pendingFacts.length > 0 || this.persistenceError != null) {
      this.pendingFacts.push(operation);
      return;
    }
    if (this.persistTransaction(operation).type !== "committed") this.pendingFacts.push(operation);
  }

  private afterCommit(effect: () => void): void {
    if (this.transactionEffects != null) this.transactionEffects.push(effect);
    else effect();
  }

  submit(capture: ComposerDraftCapture): ComposerInputQueueSubmitResult {
    if (this.disposed) return { type: "rejected", reason: "disposed" };
    const result = this.persistTransaction(() => this.submitInput(capture, this.queue.submit));
    return result.type === "committed"
      ? result.result
      : { type: "rejected", reason: "persistenceFailed" };
  }
  submitSteer(capture: ComposerDraftCapture): ComposerInputQueueSubmitResult {
    if (this.disposed) return { type: "rejected", reason: "disposed" };
    const result = this.persistTransaction(() => this.submitInput(capture, this.queue.submitSteer));
    return result.type === "committed"
      ? result.result
      : { type: "rejected", reason: "persistenceFailed" };
  }
  promoteOrdinaryFrontToSteer(): boolean {
    const result = this.persistTransaction(() => this.promoteOrdinaryFrontToSteerImpl());
    return result.type === "committed" && result.result;
  }
  private promoteOrdinaryFrontToSteerImpl(): boolean {
    if (
      this.disposed ||
      this.releaseReservation != null ||
      this.recovery != null ||
      this.liveManagement.mutationPending()
    ) {
      return false;
    }
    const transition = this.queue.promoteOrdinaryFrontToSteer();
    if (transition.result.type === "noOp") {
      return false;
    }
    this.consumeTransition(transition);
    return true;
  }
  interruptActiveTurn(): boolean {
    const result = this.persistTransaction(() => this.interruptActiveTurnImpl());
    return result.type === "committed" && result.result;
  }
  private interruptActiveTurnImpl(): boolean {
    const turnId = this.queue.currentTurnId();
    if (!this.canInterrupt(turnId)) return false;
    const issued = this.interruptState.transition({
      type: "issue",
      params: { threadId: this.threadId, turnId },
      generation: this.generation,
    });
    if (issued.type !== "issued") return false;
    this.failedInterruptTurnId = null;
    this.publishSnapshot();
    const pending = this.interruptState.state();
    if (
      !this.disposed &&
      pending?.params.threadId === this.threadId &&
      pending.params.turnId === turnId &&
      pending.generation === this.generation
    ) {
      this.performInterrupt(issued.claim);
    }
    return true;
  }
  recover(): boolean {
    if (
      this.disposed ||
      this.releaseReservation != null ||
      this.recovery == null ||
      this.isRecovering ||
      this.liveManagement.mutationPending() ||
      this.liveManagement.hasActiveSession()
    )
      return false;
    this.isRecovering = true;
    this.publishSnapshot();
    if (this.currentOwnerIsGone()) return false;
    const result = this.persistTransaction(() => this.recoverImpl());
    this.isRecovering = false;
    this.publishSnapshot();
    return result.type === "committed" && result.result;
  }
  private recoverImpl(): boolean {
    const batch = this.recovery;
    const unavailable =
      this.disposed ||
      this.releaseReservation != null ||
      batch == null ||
      this.liveManagement.mutationPending() ||
      this.liveManagement.hasActiveSession();
    if (unavailable) return false;
    const generation = this.generation;
    this.isRecovering = true;
    this.publishSnapshot();
    if (this.disposed || generation !== this.generation) return false;
    const recoveryEffects: ComposerInputQueueEffect[] = [];
    switch (batch.reason) {
      case "startDefinitelyNotAccepted":
        for (const message of batch.messages) {
          const transition = this.queue.submit(message);
          this.assertNoRecoveryEffect(transition);
          recoveryEffects.push(...transition.effects);
        }
        break;
      case "userStopped":
      case "steerDefinitelyNotAccepted": {
        const transition =
          batch.reason === "userStopped"
            ? this.queue.restoreUserStoppedRecovery(batch)
            : this.queue.restoreSteerRecovery(batch.transfer);
        this.assertNoRecoveryEffect(transition);
        recoveryEffects.push(...transition.effects);
        break;
      }
    }
    this.recovery = null;
    this.isRecovering = false;
    this.queue.setAutomaticSendingPaused(this.restoredPaused);
    const resumed = this.queue.drain();
    this.assertNoRecoveryEffect(resumed);
    recoveryEffects.push(...resumed.effects);
    const effects = [...recoveryEffects, ...this.deferredEffects];
    this.deferredEffects = [];
    this.runEffects(effects);
    if (this.currentOwnerDiffersFrom(generation)) return false;
    this.afterCommit(() => {
      this.liveManagement.flushDeferredDrains();
    });
    this.publishSnapshot();
    return true;
  }
  observeAcceptedEvent(payload: Readonly<ActiveThreadProjectionAcceptedEvent>): void {
    if (this.disposed || payload.notification.threadId !== this.threadId) return;
    this.liveManagement.observeAcceptedEvent(payload);
  }
  private applyAcceptedEvent(payload: Readonly<ActiveThreadProjectionAcceptedEvent>): void {
    this.receiveFact(() => {
      this.applyAcceptedEventImpl(payload);
    });
  }
  private applyAcceptedEventImpl(payload: Readonly<ActiveThreadProjectionAcceptedEvent>): void {
    const observation = runtimeObservationFromAcceptedProjectionEvent(payload);
    if (observation == null) return;
    if (observation.type === "turnCompleted") {
      if (observation.status === "interrupted") {
        this.consumeTransition(this.queue.prepareInterruptedTerminal(observation));
        return;
      }
      this.clearInterruptForTerminal(observation.turnId);
    }
    this.consumeTransition(this.queue.observe(observation));
  }
  getSnapshot = (): ComposerInputQueueCoordinatorSnapshot => this.snapshot;
  readPendingInputPage = (
    request: ComposerPendingInputPageRequest,
  ): ComposerPendingInputPageResult => {
    return this.disposed ? this.ownerGoneResult() : this.queue.readPendingInputPage(request);
  };
  readPendingInputDetail = (
    request: ComposerPendingInputDetailRequest,
  ): ComposerPendingInputDetailResult => {
    return this.disposed ? this.ownerGoneResult() : this.queue.readPendingInputDetail(request);
  };
  beginPendingInputEdit = (
    request: ComposerPendingInputManagementRequest,
    restore: ComposerPendingInputEditRestore,
  ): ComposerPendingInputCoordinatorBeginEditResult => {
    return this.liveManagement.beginPendingInputEdit(
      request,
      restore,
      this.releaseReservation != null ||
        this.recovery != null ||
        this.isRecovering ||
        this.interruptState.state() != null,
    );
  };
  deletePendingInput = (
    request: ComposerPendingInputManagementRequest,
  ): ComposerPendingInputCoordinatorDeleteResult => {
    return this.liveManagement.deletePendingInput(request, this.releaseReservation != null);
  };
  movePendingInput = (
    request: ComposerPendingInputMoveRequest,
  ): ComposerPendingInputCoordinatorMoveResult => {
    const unavailableReason =
      this.releaseReservation != null
        ? "releaseReserved"
        : this.recovery != null || this.isRecovering
          ? "recoveryPending"
          : null;
    return this.liveManagement.movePendingInput(request, unavailableReason);
  };
  getReleaseReadiness = (): ComposerInputQueueCoordinatorReleaseReadiness => {
    if (this.disposed) return { type: "blocked", blockers: [{ type: "disposed" }] };
    const queueState = this.queue.view().releaseState;
    const blockers: ComposerInputQueueCoordinatorReleaseBlocker[] =
      queueState.type === "blocked" ? [...queueState.blockers] : [];
    if (this.recovery != null)
      blockers.push({ type: "recoveryPending", count: recoveryCount(this.recovery) });
    if (this.isRecovering) blockers.push({ type: "recovering" });
    if (this.liveManagement.mutationPending()) blockers.push({ type: "managementPending" });
    if (this.persistenceError != null) blockers.push({ type: "persistenceFailed" });
    if (this.releaseReservation != null) blockers.push({ type: "releaseReserved" });
    const interrupt = this.interruptState.state();
    if (interrupt != null) blockers.push({ type: "interruptPending", phase: interrupt.phase });
    if (blockers.length === 0) return { type: "safe" };
    return { type: "blocked", blockers };
  };
  reserveRelease = (): ComposerInputQueueCoordinatorReserveReleaseResult => {
    const readiness = this.getReleaseReadiness();
    if (readiness.type === "blocked") return readiness;
    const reservation = {};
    this.releaseReservation = reservation;
    this.publishSnapshot();
    return {
      type: "reserved",
      reservation: {
        release: () => {
          if (this.releaseReservation === reservation) {
            this.releaseReservation = null;
            this.publishSnapshot();
          }
        },
      },
    };
  };
  subscribe = (listener: () => void): (() => void) => {
    if (this.disposed) return (): void => undefined;
    return this.listeners.subscribe(listener);
  };
  dispose(cause: ComposerPendingInputOwnerGoneCause = "disposed"): void {
    if (this.disposed) return;
    this.disposed = true;
    this.disposeCause = cause;
    this.generation += 1;
    this.listeners.clear();
    this.releaseReservation = null;
    this.recovery = null;
    this.deferredEffects = [];
    this.isRecovering = false;
    this.failedInterruptTurnId = null;
    this.pendingFacts.length = 0;
    this.liveManagement.dispose(this.ownerGoneResult());
    this.snapshot = {
      ...this.snapshot,
      canStop: false,
      interrupt: null,
      pendingInputManagementOutcome: null,
    };
  }

  private consumeTransition(transition: ComposerInputQueueTransition): void {
    this.afterCommit(() => {
      this.liveManagement.consumeEditInvalidation(transition.editInvalidation);
    });
    this.runEffects(transition.effects);
    if (transition.result.type === "interruptedTerminalPrepared") {
      this.classifyInterrupted(transition.result.turnId);
      return;
    }
    this.publishSnapshot();
  }
  private submitInput(
    capture: ComposerDraftCapture,
    submit: ComposerInputQueue["submit"],
  ): ComposerInputQueueSubmitResult {
    if (this.disposed) return { type: "rejected", reason: "disposed" };
    if (this.liveManagement.mutationPending()) {
      return { type: "rejected", reason: "managementPending" };
    }
    if (this.releaseReservation != null) return { type: "rejected", reason: "releaseReserved" };
    if (this.recovery != null) return { type: "rejected", reason: "recoveryPending" };
    const message: ComposerQueueMessage = {
      type: "recoverable",
      id: `composer-message-${randomUuid()}`,
      draft: capture.draft,
      input: capture.input,
    };
    const transition = submit(message);
    if (transition.result.type === "invalidInput") {
      return { type: "rejected", reason: "invalidInput" };
    }
    this.consumeTransition(transition);
    this.state.draft = null;
    return { type: "accepted" };
  }
  private runEffects(effects: readonly ComposerInputQueueEffect[]): void {
    for (const [index, effect] of effects.entries()) {
      switch (effect.type) {
        case "recover":
          if (this.recovery != null) {
            throw new Error("Composer input queue produced a second recovery batch");
          }
          this.recovery = effect.batch;
          this.deferredEffects = [...effects.slice(index + 1), ...this.deferredEffects];
          return;
        case "performStart":
          this.performStart(effect.claim);
          break;
        case "performSteer":
          this.performSteer(effect.claim);
          break;
      }
    }
  }
  private performStart(claim: StartClaim): void {
    if (this.transactionEffects != null) {
      this.transactionEffects.push(() => {
        this.performStart(claim);
      });
      return;
    }
    const generation = this.generation;
    this.startTurn({
      threadId: this.ownerThreadId,
      clientUserMessageId: claim.clientUserMessageId,
      input: copyComposerInputPayload(claim.message.input),
    }).then(
      ({ turn }) => {
        this.settle(generation, { type: "accepted", claim, turnId: turn.id });
      },
      (error: unknown) => {
        this.settle(generation, { type: deliveryFailure(error), claim });
      },
    );
  }
  private settle(generation: number, settlement: StartSettlement): void {
    if (this.disposed || generation !== this.generation) return;
    this.receiveFact(() => {
      this.consumeTransition(this.queue.settleStart(settlement));
    });
  }
  private performSteer(claim: SteerClaim): void {
    if (this.transactionEffects != null) {
      this.transactionEffects.push(() => {
        this.performSteer(claim);
      });
      return;
    }
    const generation = this.generation;
    this.steerTurn({
      threadId: claim.intent.threadId,
      expectedTurnId: claim.intent.expectedTurnId,
      clientUserMessageId: claim.intent.clientUserMessageId,
      input: copyComposerInputPayload(claim.intent.message.input),
    }).then(
      ({ turnId }) => {
        this.settleSteer(generation, { type: "accepted", claim, turnId });
      },
      (error: unknown) => {
        const type =
          isGuiHostCommandError(error) && error.activeTurnNotSteerable
            ? "activeTurnNotSteerable"
            : isGuiHostCommandError(error) && error.delivery === "definitelyNotAccepted"
              ? "definitelyNotAccepted"
              : "deliveryUnknown";
        this.settleSteer(generation, { type, claim });
      },
    );
  }
  private performInterrupt(claim: InterruptClaim): void {
    if (this.transactionEffects != null) {
      this.transactionEffects.push(() => {
        this.performInterrupt(claim);
      });
      return;
    }
    const generation = this.generation;
    this.interruptTurn(claim.params).then(
      () => {
        this.settleInterrupt(generation, { type: "accepted", claim });
      },
      (error: unknown) => {
        this.settleInterrupt(generation, {
          type: deliveryFailure(error),
          claim,
        });
      },
    );
  }
  private settleInterrupt(generation: number, settlement: InterruptSettlement): void {
    if (this.disposed || generation !== this.generation) return;
    this.receiveFact(() => {
      this.settleInterruptImpl(settlement);
    });
  }
  private settleInterruptImpl(settlement: InterruptSettlement): void {
    const result = this.interruptState.transition({ type: "settle", settlement });
    if (result.type === "definitelyNotAccepted") {
      this.failedInterruptTurnId = settlement.claim.params.turnId;
    }
    if ("terminal" in result && result.terminal != null) {
      this.applyInterruptedDisposition(
        result.terminal.fact.params.turnId,
        result.terminal.disposition,
      );
      return;
    }
    this.publishSnapshot();
  }
  private classifyInterrupted(turnId: Turn["id"]): void {
    if (this.failedInterruptTurnId === turnId) this.failedInterruptTurnId = null;
    const result = this.interruptState.transition({
      type: "terminal",
      fact: {
        params: { threadId: this.threadId, turnId },
        generation: this.generation,
      },
    });
    if (result.type === "terminalDeferred") {
      this.publishSnapshot();
      return;
    }
    if (result.type === "terminal") {
      this.applyInterruptedDisposition(
        result.terminal.fact.params.turnId,
        result.terminal.disposition,
      );
      return;
    }
    this.publishSnapshot();
  }
  private applyInterruptedDisposition(
    turnId: Turn["id"],
    disposition: ComposerInterruptedDisposition,
  ): void {
    if (this.recovery != null) {
      if (this.recovery.reason !== "steerDefinitelyNotAccepted") {
        throw new Error("Interrupted terminal conflicts with non-steer recovery");
      }
      const restored = this.queue.restoreSteerRecovery(this.recovery.transfer);
      if (
        restored.result.type !== "applied" ||
        restored.result.operation !== "steerRecoveryRestored" ||
        restored.effects.length !== 0
      ) {
        throw new Error("Composer steer recovery was not restored without effects");
      }
      this.recovery = null;
    }
    this.queue.setAutomaticSendingPaused(this.restoredPaused || this.recoveryPending());
    this.consumeTransition(this.queue.applyInterruptedDisposition(turnId, disposition));
  }
  private clearInterruptForTerminal(turnId: Turn["id"]): void {
    if (this.failedInterruptTurnId === turnId) this.failedInterruptTurnId = null;
    const pending = this.interruptState.state();
    if (pending?.params.threadId !== this.threadId || pending.params.turnId !== turnId) return;
    this.interruptState = createComposerInterruptState();
  }
  private settleSteer(generation: number, settlement: SteerSettlement): void {
    if (this.disposed || generation !== this.generation) return;
    this.receiveFact(() => {
      this.consumeTransition(this.queue.settleSteer(settlement));
    });
  }
  private publishSnapshot(): void {
    if (this.disposed) return;
    if (this.transactionEffects != null) {
      this.transactionEffects.push(() => {
        this.publishSnapshot();
      });
      return;
    }
    const queueView = this.queue.view();
    const count = recoveryCount(this.recovery);
    const interrupt = this.interruptState.state();
    const currentTurnId = this.queue.currentTurnId();
    if (this.failedInterruptTurnId !== currentTurnId) this.failedInterruptTurnId = null;
    const interruptPhase =
      interrupt?.phase ?? (this.failedInterruptTurnId == null ? null : "definitelyNotAccepted");
    const next: ComposerInputQueueCoordinatorSnapshot = {
      persistence: this.persistenceSnapshot(),
      ordinaryQueuedCount: queueView.ordinaryQueuedCount,
      guidingCount: queueView.guidingCount,
      detailRevision: queueView.detailRevision,
      recoveryCount: count,
      recovery: this.recovery == null ? null : { reason: this.recovery.reason, count },
      isRecovering: this.isRecovering,
      rejectedSteers: queueView.rejectedSteers,
      hasUnknownSteer: queueView.hasUnknownSteer,
      canStop: this.canInterruptForSnapshot(currentTurnId),
      interrupt: interruptPhase == null ? null : { phase: interruptPhase },
      pendingInputManagementOutcome: this.liveManagement.outcome(),
    };
    if (JSON.stringify(next) === JSON.stringify(this.snapshot)) return;
    this.snapshot = next;
    this.listeners.notify();
  }
  private canInterrupt(turnId: Turn["id"] | null): turnId is Turn["id"] {
    return (
      !this.disposed &&
      this.releaseReservation == null &&
      this.recovery == null &&
      !this.isRecovering &&
      !this.liveManagement.mutationPending() &&
      !this.liveManagement.hasActiveSession() &&
      turnId != null &&
      this.interruptState.state() == null
    );
  }

  private canInterruptForSnapshot(turnId: Turn["id"] | null): turnId is Turn["id"] {
    return (
      !this.disposed &&
      this.releaseReservation == null &&
      this.recovery == null &&
      !this.isRecovering &&
      !this.liveManagement.blocksInterruptForSnapshot() &&
      turnId != null &&
      this.interruptState.state() == null
    );
  }

  private currentOwnerIsGone(): boolean {
    return this.disposed;
  }

  private currentOwnerDiffersFrom(generation: number): boolean {
    return this.currentOwnerIsGone() || generation !== this.generation;
  }

  private recoveryPending(): boolean {
    return this.recovery != null || this.isRecovering;
  }

  private ownerGoneResult(): ComposerPendingInputOwnerGoneResult {
    return {
      type: "unavailable",
      scope: "ownerGone",
      reason: this.disposeCause ?? "disposed",
    };
  }
  private assertNoRecoveryEffect(transition: ComposerInputQueueTransition): void {
    if (transition.effects.some((effect) => effect.type === "recover")) {
      throw new Error("Composer input queue produced a second recovery batch");
    }
  }
}

function persistenceErrorText(error: unknown): string {
  return error instanceof Error ? error.message : "Unable to save this session";
}

export function createComposerInputQueueCoordinator(
  input: CreateComposerInputQueueCoordinatorInput,
): ComposerInputQueueCoordinator {
  return new ComposerInputQueueCoordinatorImpl(input);
}
