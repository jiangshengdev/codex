import type { Turn } from "@codex-protocol/v2";
import type {
  ComposerInterruptedDisposition,
  ComposerInputQueueResult,
  ComposerInputQueueView,
  ComposerQueueMessage,
  ComposerPendingInputBeginEditResult,
  ComposerPendingInputCursor,
  ComposerPendingInputDeleteResult,
  ComposerPendingInputDrainIntent,
  ComposerPendingInputDetailRequest,
  ComposerPendingInputDetailResult,
  ComposerPendingInputDisplayKey,
  ComposerPendingInputEditCancelResult,
  ComposerPendingInputEditInvalidation,
  ComposerPendingInputEditReservation,
  ComposerPendingInputEditRestore,
  ComposerPendingInputEditSaveResult,
  ComposerPendingInputLane,
  ComposerPendingInputManagementRequest,
  ComposerPendingInputMoveRequest,
  ComposerPendingInputMoveResult,
  ComposerPendingInputMovementResult,
  ComposerPendingInputPageRequest,
  ComposerPendingInputPageResult,
  CreateComposerInputQueueInput,
  InterruptedTurnCompletedObservation,
  NonInterruptedRuntimeObservation,
  RecoveryBatch,
  RuntimeObservation,
  UserStoppedRecoveryBatch,
} from "./composerInputQueueContracts";
import {
  createComposerOrdinaryQueueState,
  type OrdinaryEditAcquisition,
  type OrdinaryEditReservation,
} from "./composerOrdinaryQueueState";
import { copyComposerInputPayload } from "./composerInputPayload";
import {
  projectComposerInputPreview,
  projectComposerInputTextDetail,
} from "./composerInputPreview";
import { projectComposerInputQueueView } from "./composerInputQueueProjection";
import {
  ComposerStartQueueState,
  type ComposerStartMessage,
  type StartClaim,
  type StartSettlement,
} from "./composerStartQueueState";
import {
  createComposerSteerQueue,
  type SteerEditAcquisition,
  type SteerEditInvalidation,
  type SteerEditReservation,
  type SteerRecoveryTransfer,
  type SteerClaim,
} from "./composerSteerQueueState";

export type {
  ComposerInputQueuePendingStartPhase,
  ComposerInputQueueReleaseBlocker,
  ComposerInputQueueReleaseState,
  ComposerInputQueueResult,
  ComposerInputQueueView,
  ComposerInterruptedDisposition,
  ComposerQueueMessage,
  ComposerPendingInputBeginEditResult,
  ComposerPendingInputCursor,
  ComposerPendingInputDeleteResult,
  ComposerPendingInputDrainIntent,
  ComposerPendingInputDetailRequest,
  ComposerPendingInputDetailResult,
  ComposerPendingInputDisplayKey,
  ComposerPendingInputEditCancelResult,
  ComposerPendingInputEditInvalidation,
  ComposerPendingInputEditReservation,
  ComposerPendingInputEditRestore,
  ComposerPendingInputEditSaveResult,
  ComposerPendingInputLane,
  ComposerPendingInputManagement,
  ComposerPendingInputManagementRequest,
  ComposerPendingInputMoveDestination,
  ComposerPendingInputMoveRequest,
  ComposerPendingInputMoveResult,
  ComposerPendingInputMovement,
  ComposerPendingInputMovementResult,
  ComposerPendingInputPageRequest,
  ComposerPendingInputPageResult,
  CreateComposerInputQueueInput,
  InterruptedTurnCompletedObservation,
  NonInterruptedRuntimeObservation,
  RecoveryBatch,
  RuntimeObservation,
  UserStoppedRecoveryBatch,
} from "./composerInputQueueContracts";
export type { StartClaim, StartSettlement } from "./composerStartQueueState";

type TurnIdentity = Turn["id"];
let nextRejectedMergeSequence = 0;
let nextPendingInputDisplaySequence = 0;

export const COMPOSER_PENDING_INPUT_MAX_PAGE_SIZE = 20;

const cursorOwner = Symbol("ComposerPendingInputCursor.owner");
const cursorRevision = Symbol("ComposerPendingInputCursor.revision");
const cursorLane = Symbol("ComposerPendingInputCursor.lane");
const cursorOffset = Symbol("ComposerPendingInputCursor.offset");

type OwnedPendingInputCursor = ComposerPendingInputCursor &
  Readonly<{
    [cursorOwner]: object;
    [cursorRevision]: number;
    [cursorLane]: ComposerPendingInputLane;
    [cursorOffset]: number;
  }>;

export type ComposerInputQueueEffect =
  | Readonly<{ type: "performStart"; claim: StartClaim }>
  | Readonly<{ type: "performSteer"; claim: SteerClaim }>
  | Readonly<{ type: "recover"; batch: RecoveryBatch }>;

export type ComposerInputQueueTransition = Readonly<{
  result: ComposerInputQueueResult;
  effects: readonly ComposerInputQueueEffect[];
  editInvalidation?: ComposerPendingInputEditInvalidation;
}>;

export type ComposerInputQueue = Readonly<{
  view(): ComposerInputQueueView;
  detailRevision(): number;
  readPendingInputPage(request: ComposerPendingInputPageRequest): ComposerPendingInputPageResult;
  readPendingInputDetail(
    request: ComposerPendingInputDetailRequest,
  ): ComposerPendingInputDetailResult;
  readPendingInputMovement(
    request: ComposerPendingInputManagementRequest,
  ): ComposerPendingInputMovementResult;
  beginPendingInputEdit(
    request: ComposerPendingInputManagementRequest,
    restore: ComposerPendingInputEditRestore,
  ): ComposerPendingInputBeginEditResult;
  deletePendingInput(
    request: ComposerPendingInputManagementRequest,
  ): ComposerPendingInputDeleteResult;
  movePendingInput(request: ComposerPendingInputMoveRequest): ComposerPendingInputMoveResult;
  drainPendingInput(intent: ComposerPendingInputDrainIntent): ComposerInputQueueTransition;
  currentTurnId(): TurnIdentity | null;
  submit(message: ComposerQueueMessage): ComposerInputQueueTransition;
  submitSteer(message: ComposerQueueMessage): ComposerInputQueueTransition;
  promoteOrdinaryFrontToSteer(): ComposerInputQueueTransition;
  restoreSteerRecovery(transfer: SteerRecoveryTransfer): ComposerInputQueueTransition;
  settleStart(settlement: StartSettlement): ComposerInputQueueTransition;
  settleSteer(settlement: SteerSettlement): ComposerInputQueueTransition;
  prepareInterruptedTerminal(
    observation: InterruptedTurnCompletedObservation,
  ): ComposerInputQueueTransition;
  applyInterruptedDisposition(
    turnId: TurnIdentity,
    disposition: ComposerInterruptedDisposition,
  ): ComposerInputQueueTransition;
  restoreUserStoppedRecovery(batch: UserStoppedRecoveryBatch): ComposerInputQueueTransition;
  observe(observation: NonInterruptedRuntimeObservation): ComposerInputQueueTransition;
}>;

export type SteerSettlement =
  | Readonly<{ type: "accepted"; claim: SteerClaim; turnId: TurnIdentity }>
  | Readonly<{ type: "activeTurnNotSteerable"; claim: SteerClaim }>
  | Readonly<{ type: "definitelyNotAccepted"; claim: SteerClaim }>
  | Readonly<{ type: "deliveryUnknown"; claim: SteerClaim }>;

type StartQueueOutcome = ReturnType<ComposerStartQueueState["observe"]>;
type TurnCompleted = Extract<RuntimeObservation, { type: "turnCompleted" }>;

const noEffects: readonly ComposerInputQueueEffect[] = [];

function transition(
  result: ComposerInputQueueResult,
  effects: readonly ComposerInputQueueEffect[] = noEffects,
  editInvalidation?: ComposerPendingInputEditInvalidation,
): ComposerInputQueueTransition {
  return {
    result,
    effects: [...effects],
    ...(editInvalidation == null ? {} : { editInvalidation }),
  };
}

function recoveryTransition(
  batch: RecoveryBatch,
  messageIds: readonly string[],
): ComposerInputQueueTransition {
  return transition({ type: "recoveryProduced", reason: batch.reason, messageIds }, [
    { type: "recover", batch },
  ]);
}

function ownMessage(message: ComposerQueueMessage): ComposerQueueMessage {
  return {
    type: "recoverable",
    id: message.id,
    draft: message.draft,
    input: copyComposerInputPayload(message.input),
  };
}

function boundedPageLimit(limit: number): number {
  if (!Number.isFinite(limit)) {
    return COMPOSER_PENDING_INPUT_MAX_PAGE_SIZE;
  }
  return Math.max(1, Math.min(COMPOSER_PENDING_INPUT_MAX_PAGE_SIZE, Math.floor(limit)));
}

function hasMeaningfulInput(input: ComposerQueueMessage["input"]): boolean {
  return input.some((item) => item.type !== "text" || item.text.trim() !== "");
}

type PendingEditAcquisition =
  | Readonly<{ lane: "ordinary"; slot: OrdinaryEditAcquisition }>
  | Readonly<{ lane: "steer"; slot: SteerEditAcquisition }>;

type PendingEditReservation =
  | Readonly<{ lane: "ordinary"; slot: OrdinaryEditReservation }>
  | Readonly<{ lane: "steer"; slot: SteerEditReservation }>;

type PendingInputManagementResolution =
  | Readonly<{ type: "stale"; revision: number }>
  | Readonly<{ type: "conflict"; reason: "editInProgress"; revision: number }>
  | Readonly<{ type: "ordinary"; index: number }>
  | Readonly<{ type: "steer"; messageId: string }>
  | Readonly<{ type: "notManageable"; revision: number }>;

type MessageAcceptance =
  | Readonly<{ type: "accepted"; message: ComposerQueueMessage }>
  | Readonly<{ type: "rejected"; transition: ComposerInputQueueTransition }>;

class ComposerInputQueueImpl implements ComposerInputQueue {
  private readonly ordinaryState = createComposerOrdinaryQueueState();
  private readonly knownMessageIds = new Set<string>();
  private readonly userStoppedRecoveryOwners = new WeakSet<UserStoppedRecoveryBatch>();
  private readonly startState = new ComposerStartQueueState();
  private readonly steerState = createComposerSteerQueue();
  private readonly threadId: string;
  private readonly detailCursorOwner = {};
  private readonly displayKeyByMessageId = new Map<string, ComposerPendingInputDisplayKey>();
  private readonly messageIdByDisplayKey = new Map<ComposerPendingInputDisplayKey, string>();
  private currentDetailRevision = 0;
  private activeEditAcquisition: PendingEditAcquisition | null = null;
  private activeEdit: PendingEditReservation | null = null;
  private activeTurnId: TurnIdentity | null;
  private preparedInterruptedTurnId: TurnIdentity | null = null;

  constructor(input: CreateComposerInputQueueInput) {
    this.threadId = input.threadId;
    this.activeTurnId = input.activeTurnId;
  }

  public view = (): ComposerInputQueueView => {
    return projectComposerInputQueueView(
      this.ordinaryState.count(),
      this.startState.pendingPhase(),
      this.steerState.overview(),
      this.currentDetailRevision,
    );
  };

  public detailRevision = (): number => this.currentDetailRevision;

  public readPendingInputPage = (
    request: ComposerPendingInputPageRequest,
  ): ComposerPendingInputPageResult => {
    if (request.revision !== this.currentDetailRevision) {
      return { type: "stale", revision: this.currentDetailRevision };
    }
    const cursor = request.cursor as OwnedPendingInputCursor | null;
    if (
      cursor != null &&
      (cursor[cursorOwner] !== this.detailCursorOwner ||
        cursor[cursorRevision] !== request.revision ||
        cursor[cursorLane] !== request.lane)
    ) {
      return { type: "stale", revision: this.currentDetailRevision };
    }
    const offset = cursor?.[cursorOffset] ?? 0;
    const limit = boundedPageLimit(request.limit);
    const isMovementBlocked = this.activeEditAcquisition != null || this.activeEdit != null;
    const items =
      request.lane === "ordinary"
        ? this.ordinaryState
            .readPendingInputs(offset, limit, isMovementBlocked)
            .map((pendingInput) => ({
              key: this.requireDisplayKey(pendingInput.messageId),
              lane: request.lane,
              management: pendingInput.management,
              movement: pendingInput.movement,
              preview: projectComposerInputPreview(pendingInput.input),
            }))
        : this.steerState.readPendingInputs(offset, limit).map((intent) => ({
            key: this.requireDisplayKey(intent.messageId),
            lane: request.lane,
            management: intent.management,
            movement: isMovementBlocked ? null : intent.movement,
            preview: projectComposerInputPreview(intent.input),
          }));
    const count =
      request.lane === "ordinary"
        ? this.ordinaryState.count()
        : this.steerState.pendingInputCount();
    const nextOffset = offset + items.length;
    return {
      type: "page",
      revision: this.currentDetailRevision,
      items,
      nextCursor:
        nextOffset < count
          ? this.createPendingInputCursor(request.lane, this.currentDetailRevision, nextOffset)
          : null,
    };
  };

  public readPendingInputDetail = (
    request: ComposerPendingInputDetailRequest,
  ): ComposerPendingInputDetailResult => {
    if (request.revision !== this.currentDetailRevision) {
      return { type: "stale", revision: this.currentDetailRevision };
    }
    const messageId = this.messageIdByDisplayKey.get(request.key);
    if (messageId == null) {
      return { type: "missing", revision: this.currentDetailRevision };
    }
    const message =
      this.ordinaryState.findPendingInput(messageId) ?? this.steerState.findPendingInput(messageId);
    if (message == null) {
      return { type: "missing", revision: this.currentDetailRevision };
    }
    const preview = projectComposerInputPreview(message.input);
    if (preview.type !== "text" || !preview.truncated) {
      return { type: "missing", revision: this.currentDetailRevision };
    }
    const text = projectComposerInputTextDetail(message.input);
    return text == null
      ? { type: "missing", revision: this.currentDetailRevision }
      : { type: "detail", key: request.key, revision: this.currentDetailRevision, text };
  };

  public currentTurnId = (): TurnIdentity | null => this.activeTurnId;

  public readPendingInputMovement = (
    request: ComposerPendingInputManagementRequest,
  ): ComposerPendingInputMovementResult => {
    const resolution = this.resolvePendingInputManagement(request);
    if (resolution.type === "stale" || resolution.type === "conflict") {
      return resolution;
    }
    if (resolution.type === "ordinary") {
      const pendingInput = this.ordinaryState.readPendingInputs(resolution.index, 1, false)[0];
      if (pendingInput?.management.type !== "manageable" || pendingInput.movement == null) {
        return { type: "notManageable", revision: this.currentDetailRevision };
      }
      return {
        type: "movement",
        revision: this.currentDetailRevision,
        lane: "ordinary",
        movement: pendingInput.movement,
      };
    }
    if (resolution.type === "notManageable") {
      return resolution;
    }
    const pendingInput = this.steerState.findPendingInput(resolution.messageId);
    if (pendingInput?.management.type !== "manageable" || pendingInput.movement == null) {
      return { type: "notManageable", revision: this.currentDetailRevision };
    }
    return {
      type: "movement",
      revision: this.currentDetailRevision,
      lane: "steer",
      movement: pendingInput.movement,
    };
  };

  public beginPendingInputEdit = (
    request: ComposerPendingInputManagementRequest,
    restore: ComposerPendingInputEditRestore,
  ): ComposerPendingInputBeginEditResult => {
    const resolution = this.resolvePendingInputManagement(request);
    if (resolution.type === "stale" || resolution.type === "conflict") {
      return resolution;
    }
    if (resolution.type === "ordinary") {
      const acquired = this.ordinaryState.acquirePendingInputEdit(resolution.index);
      if (acquired.type !== "acquired") {
        return { type: "notManageable", revision: this.currentDetailRevision };
      }
      return this.beginOrdinaryEdit(acquired.acquisition, restore);
    }
    if (resolution.type === "notManageable") {
      return resolution;
    }
    const acquired = this.steerState.acquirePendingInputEdit(resolution.messageId);
    if (acquired.type !== "acquired") {
      return { type: "notManageable", revision: this.currentDetailRevision };
    }
    this.activeEditAcquisition = { lane: "steer", slot: acquired.acquisition };
    let restoreResult: ReturnType<ComposerPendingInputEditRestore>;
    try {
      restoreResult = restore(acquired.acquisition.original.message.draft);
    } catch (error) {
      this.rollbackEditAcquisition(this.activeEditAcquisition);
      throw error;
    }
    if (restoreResult.type !== "restored") {
      this.rollbackEditAcquisition(this.activeEditAcquisition);
      return { type: "invalidDraft", revision: this.currentDetailRevision };
    }
    const reservation = this.steerState.reservePendingInputEdit(acquired.acquisition);
    if (reservation == null) {
      throw new Error("Composer pending steer edit acquisition lost its slot");
    }
    this.activeEditAcquisition = null;
    const activeEdit: PendingEditReservation = { lane: "steer", slot: reservation };
    this.activeEdit = activeEdit;
    this.advanceDetailRevision();
    return {
      type: "begun",
      revision: this.currentDetailRevision,
      reservation: this.createEditCapability(activeEdit),
    };
  };

  private beginOrdinaryEdit(
    acquisition: OrdinaryEditAcquisition,
    restore: ComposerPendingInputEditRestore,
  ): ComposerPendingInputBeginEditResult {
    const activeAcquisition: PendingEditAcquisition = { lane: "ordinary", slot: acquisition };
    this.activeEditAcquisition = activeAcquisition;
    let restoreResult: ReturnType<ComposerPendingInputEditRestore>;
    try {
      restoreResult = restore(acquisition.original.draft);
    } catch (error) {
      this.rollbackEditAcquisition(activeAcquisition);
      throw error;
    }
    if (restoreResult.type !== "restored") {
      this.rollbackEditAcquisition(activeAcquisition);
      return { type: "invalidDraft", revision: this.currentDetailRevision };
    }
    const reservation = this.ordinaryState.reservePendingInputEdit(acquisition);
    if (reservation == null) {
      throw new Error("Composer pending ordinary edit acquisition lost its slot");
    }
    this.activeEditAcquisition = null;
    const activeEdit: PendingEditReservation = { lane: "ordinary", slot: reservation };
    this.activeEdit = activeEdit;
    this.advanceDetailRevision();
    return {
      type: "begun",
      revision: this.currentDetailRevision,
      reservation: this.createEditCapability(activeEdit),
    };
  }

  public deletePendingInput = (
    request: ComposerPendingInputManagementRequest,
  ): ComposerPendingInputDeleteResult => {
    const resolution = this.resolvePendingInputManagement(request);
    if (resolution.type === "stale" || resolution.type === "conflict") {
      return resolution;
    }
    if (resolution.type === "ordinary") {
      const deleted = this.ordinaryState.deletePendingInput(resolution.index);
      if (deleted.type !== "deleted") {
        throw new Error("Composer pending input delete lost its ordinary message");
      }
      this.knownMessageIds.delete(deleted.messageId);
      this.forgetDisplayKey(deleted.messageId);
      this.advanceDetailRevision();
      return {
        type: "deleted",
        revision: this.currentDetailRevision,
        drainIntent: { lane: "ordinary" },
      };
    }
    if (resolution.type === "notManageable") {
      return resolution;
    }
    const deleted = this.steerState.deletePendingInput(resolution.messageId);
    if (deleted.type !== "deleted") {
      return { type: "notManageable", revision: this.currentDetailRevision };
    }
    this.knownMessageIds.delete(deleted.messageId);
    this.forgetDisplayKey(deleted.messageId);
    this.advanceDetailRevision();
    return {
      type: "deleted",
      revision: this.currentDetailRevision,
      drainIntent: { lane: "steer" },
    };
  };

  public movePendingInput = (
    request: ComposerPendingInputMoveRequest,
  ): ComposerPendingInputMoveResult => {
    const resolution = this.resolvePendingInputManagement(request);
    if (resolution.type === "stale" || resolution.type === "conflict") {
      return resolution;
    }
    if (resolution.type === "ordinary") {
      const moved = this.ordinaryState.movePendingInput(resolution.index, request.destination);
      if (moved.type === "notManageable") {
        return { type: "notManageable", revision: this.currentDetailRevision };
      }
      if (moved.type === "noOp") {
        return { ...moved, revision: this.currentDetailRevision };
      }
      this.advanceDetailRevision();
      return {
        ...moved,
        revision: this.currentDetailRevision,
        lane: "ordinary",
      };
    }
    if (resolution.type === "notManageable") {
      return resolution;
    }
    const moved = this.steerState.movePendingInput(resolution.messageId, request.destination);
    if (moved.type === "notManageable") {
      return { type: "notManageable", revision: this.currentDetailRevision };
    }
    if (moved.type === "noOp") {
      return { ...moved, revision: this.currentDetailRevision };
    }
    this.advanceDetailRevision();
    return {
      ...moved,
      revision: this.currentDetailRevision,
      lane: "steer",
    };
  };

  private resolvePendingInputManagement(
    request: ComposerPendingInputManagementRequest,
  ): PendingInputManagementResolution {
    if (request.revision !== this.currentDetailRevision) {
      return { type: "stale", revision: this.currentDetailRevision };
    }
    if (this.activeEditAcquisition != null || this.activeEdit != null) {
      return {
        type: "conflict",
        reason: "editInProgress",
        revision: this.currentDetailRevision,
      };
    }
    const messageId = this.messageIdByDisplayKey.get(request.key);
    const ordinaryIndex = this.ordinaryState.findManageableIndex(messageId);
    if (ordinaryIndex >= 0) {
      return { type: "ordinary", index: ordinaryIndex };
    }
    return messageId == null
      ? { type: "notManageable", revision: this.currentDetailRevision }
      : { type: "steer", messageId };
  }

  public drainPendingInput = (
    intent: ComposerPendingInputDrainIntent,
  ): ComposerInputQueueTransition => {
    if (this.activeEditAcquisition != null) {
      return this.editAcquisitionConflictTransition();
    }
    const effect = intent.lane === "ordinary" ? this.drainNextStart() : this.drainSteer();
    return this.drainTransition("pendingInputManagementDrained", effect);
  };

  private advanceDetailRevision(): void {
    this.currentDetailRevision += 1;
  }

  private rollbackEditAcquisition(acquisition: PendingEditAcquisition): void {
    if (this.activeEditAcquisition !== acquisition) {
      throw new Error("Composer pending input edit acquisition lost its slot");
    }
    if (acquisition.lane === "steer") {
      if (this.steerState.rollbackPendingInputEdit(acquisition.slot).type !== "settled") {
        throw new Error("Composer pending steer edit acquisition lost its slot");
      }
    } else if (this.ordinaryState.rollbackPendingInputEdit(acquisition.slot).type !== "settled") {
      throw new Error("Composer pending ordinary edit acquisition lost its slot");
    }
    this.activeEditAcquisition = null;
  }

  private editAcquisitionConflictTransition(): ComposerInputQueueTransition {
    return transition({ type: "ownershipMismatch", subject: "pendingInputEdit" });
  }

  private createEditCapability(
    reservation: PendingEditReservation,
  ): ComposerPendingInputEditReservation {
    return {
      save: (capture) => this.saveEditReservation(reservation, capture),
      cancel: () => this.cancelEditReservation(reservation),
    };
  }

  private saveEditReservation(
    reservation: PendingEditReservation,
    capture: Parameters<ComposerPendingInputEditReservation["save"]>[0],
  ): ComposerPendingInputEditSaveResult {
    if (this.activeEdit !== reservation) {
      return {
        type: "unavailable",
        reason: "sessionSettled",
        revision: this.currentDetailRevision,
      };
    }
    if (!hasMeaningfulInput(capture.input)) {
      return { type: "invalidInput", reason: "emptyInput", revision: this.currentDetailRevision };
    }
    const originalMessage =
      reservation.lane === "ordinary"
        ? reservation.slot.original
        : reservation.slot.original.message;
    const message: ComposerQueueMessage = {
      type: "recoverable",
      id: originalMessage.id,
      draft: capture.draft,
      input: copyComposerInputPayload(capture.input),
    };
    if (reservation.lane === "ordinary") {
      if (this.ordinaryState.savePendingInputEdit(reservation.slot, message).type !== "settled") {
        return this.settledEditSaveResult();
      }
    } else if (this.steerState.savePendingInputEdit(reservation.slot, message).type !== "settled") {
      return this.settledEditSaveResult();
    }
    this.activeEdit = null;
    this.advanceDetailRevision();
    return {
      type: "saved",
      revision: this.currentDetailRevision,
      drainIntent: { lane: reservation.lane },
    };
  }

  private cancelEditReservation(
    reservation: PendingEditReservation,
  ): ComposerPendingInputEditCancelResult {
    if (this.activeEdit !== reservation) {
      return {
        type: "unavailable",
        reason: "sessionSettled",
        revision: this.currentDetailRevision,
      };
    }
    if (reservation.lane === "ordinary") {
      if (this.ordinaryState.cancelPendingInputEdit(reservation.slot).type !== "settled") {
        return {
          type: "unavailable",
          reason: "sessionSettled",
          revision: this.currentDetailRevision,
        };
      }
    } else if (this.steerState.cancelPendingInputEdit(reservation.slot).type !== "settled") {
      return {
        type: "unavailable",
        reason: "sessionSettled",
        revision: this.currentDetailRevision,
      };
    }
    this.activeEdit = null;
    this.advanceDetailRevision();
    return {
      type: "cancelled",
      revision: this.currentDetailRevision,
      drainIntent: { lane: reservation.lane },
    };
  }

  private settledEditSaveResult(): ComposerPendingInputEditSaveResult {
    return {
      type: "unavailable",
      reason: "sessionSettled",
      revision: this.currentDetailRevision,
    };
  }

  private ownDisplayKey(messageId: string): ComposerPendingInputDisplayKey {
    const existing = this.displayKeyByMessageId.get(messageId);
    if (existing != null) {
      return existing;
    }
    nextPendingInputDisplaySequence += 1;
    const key = `composer-pending-input-${String(
      nextPendingInputDisplaySequence,
    )}` as ComposerPendingInputDisplayKey;
    this.displayKeyByMessageId.set(messageId, key);
    this.messageIdByDisplayKey.set(key, messageId);
    return key;
  }

  private requireDisplayKey(messageId: string): ComposerPendingInputDisplayKey {
    const key = this.displayKeyByMessageId.get(messageId);
    if (key == null) {
      throw new Error("Composer pending input is missing its display key");
    }
    return key;
  }

  private forgetDisplayKey(messageId: string): void {
    const key = this.displayKeyByMessageId.get(messageId);
    if (key == null) {
      return;
    }
    this.displayKeyByMessageId.delete(messageId);
    this.messageIdByDisplayKey.delete(key);
  }

  private createPendingInputCursor(
    lane: ComposerPendingInputLane,
    revision: number,
    offset: number,
  ): ComposerPendingInputCursor {
    const cursor: OwnedPendingInputCursor = {
      [cursorOwner]: this.detailCursorOwner,
      [cursorRevision]: revision,
      [cursorLane]: lane,
      [cursorOffset]: offset,
    } as OwnedPendingInputCursor;
    return cursor;
  }

  private removeNormalDisplayKeys(messageIds: readonly string[]): void {
    if (messageIds.length === 0) {
      return;
    }
    for (const messageId of messageIds) {
      this.forgetDisplayKey(messageId);
    }
    this.advanceDetailRevision();
  }

  private issueStart(message: ComposerStartMessage): ComposerInputQueueEffect {
    return { type: "performStart", claim: this.startState.issue(message) };
  }

  private drainNextStart(): ComposerInputQueueEffect | null {
    if (this.activeTurnId != null || this.startState.hasPending()) {
      return null;
    }
    const taken = this.steerState.transition({ type: "takeRejected" });
    if (taken.type === "rejectedTaken") {
      let messageId: string;
      do {
        nextRejectedMergeSequence += 1;
        messageId = `composer-rejected-steer-merge-${String(nextRejectedMergeSequence)}`;
      } while (this.knownMessageIds.has(messageId));
      const message: ComposerStartMessage = {
        type: "rejectedSteerMerge",
        id: messageId,
        input: taken.transfer.entries.flatMap(({ intent }) =>
          copyComposerInputPayload(intent.message.input),
        ),
        transfer: taken.transfer,
      };
      this.knownMessageIds.add(message.id);
      return this.issueStart(message);
    }
    const ordinaryTaken = this.ordinaryState.takeFront();
    if (ordinaryTaken.type === "blocked") {
      return null;
    }
    if (ordinaryTaken.type === "taken") {
      this.forgetDisplayKey(ordinaryTaken.message.id);
      this.advanceDetailRevision();
    }
    return ordinaryTaken.type === "taken" ? this.issueStart(ordinaryTaken.message) : null;
  }

  private drainSteer(): ComposerInputQueueEffect | null {
    if (this.activeTurnId == null) {
      return null;
    }
    const result = this.steerState.transition({ type: "issueNext" });
    if (result.type === "issued") {
      this.advanceDetailRevision();
    }
    return result.type === "issued" ? { type: "performSteer", claim: result.claim } : null;
  }

  private drainTransition(
    operation: Extract<ComposerInputQueueResult, { type: "applied" }>["operation"],
    effect: ComposerInputQueueEffect | null,
    editInvalidation?: ComposerPendingInputEditInvalidation,
  ): ComposerInputQueueTransition {
    return transition(
      { type: "applied", operation },
      effect == null ? noEffects : [effect],
      editInvalidation,
    );
  }

  private consumeSteerEditInvalidation(
    invalidations: readonly SteerEditInvalidation[] | undefined,
  ): ComposerPendingInputEditInvalidation | undefined {
    if (this.activeEdit?.lane !== "steer" || invalidations == null) {
      return undefined;
    }
    const invalidation = invalidations.find(({ owner }) => owner === this.activeEdit?.slot.owner);
    if (invalidation == null) {
      return undefined;
    }
    const key = this.requireDisplayKey(invalidation.messageId);
    this.activeEdit = null;
    return {
      key,
      lane: "steer",
      reason: "targetInvalidated",
      targetReason: invalidation.reason,
    };
  }

  private applyTerminal(observation: TurnCompleted): ComposerInputQueueTransition {
    if (this.activeTurnId === observation.turnId) {
      this.activeTurnId = null;
    }
    const terminal = this.steerState.transition({
      type: "terminal",
      threadId: this.threadId,
      turnId: observation.turnId,
    });
    const editInvalidation =
      terminal.type === "terminal"
        ? this.consumeSteerEditInvalidation(terminal.editInvalidations)
        : undefined;
    if (terminal.type === "terminal") {
      this.removeNormalDisplayKeys(terminal.messageIds);
    }
    return this.drainTransition("turnCompleted", this.drainNextStart(), editInvalidation);
  }

  private releaseStartClaim(claim: StartClaim): void {
    this.knownMessageIds.delete(claim.message.id);
    if (claim.message.type === "rejectedSteerMerge") {
      const released = this.steerState.transition({
        type: "releaseRejected",
        transfer: claim.message.transfer,
      });
      if (released.type === "rejectedReleased") {
        for (const messageId of released.messageIds) {
          this.knownMessageIds.delete(messageId);
        }
      }
    }
  }

  private applyStartOutcome(outcome: StartQueueOutcome): ComposerInputQueueTransition {
    if (
      (outcome.type === "ownerAccepted" || outcome.type === "terminal") &&
      outcome.releasedClaim != null
    ) {
      this.releaseStartClaim(outcome.releasedClaim);
    }
    switch (outcome.type) {
      case "result":
        return transition(outcome.result);
      case "ownerAccepted":
        this.activeTurnId = outcome.observation.turnId;
        return transition({
          type: "applied",
          operation:
            outcome.observation.type === "turnStarted" ? "turnStarted" : "userMessageCommitted",
        });
      case "terminal":
        if (outcome.observation.status === "interrupted") {
          if (this.activeTurnId === outcome.observation.turnId) {
            this.activeTurnId = null;
          }
          this.preparedInterruptedTurnId = outcome.observation.turnId;
          return transition({
            type: "interruptedTerminalPrepared",
            turnId: outcome.observation.turnId,
          });
        }
        return this.applyTerminal(outcome.observation);
      case "definitelyNotAccepted": {
        if (outcome.claim.message.type === "rejectedSteerMerge") {
          this.knownMessageIds.delete(outcome.claim.message.id);
          this.steerState.transition({
            type: "restoreRejected",
            transfer: outcome.claim.message.transfer,
          });
          return transition({ type: "applied", operation: "rejectedSteerStartRestored" });
        }
        const recoveredMessage = outcome.claim.message;
        this.knownMessageIds.delete(recoveredMessage.id);
        const batch: RecoveryBatch = {
          reason: "startDefinitelyNotAccepted",
          messages: [recoveredMessage],
        };
        const effects: ComposerInputQueueEffect[] = [{ type: "recover", batch }];
        const nextStart = this.drainNextStart();
        if (nextStart != null) {
          effects.push(nextStart);
        }
        return transition(
          {
            type: "recoveryProduced",
            reason: "startDefinitelyNotAccepted",
            messageIds: [recoveredMessage.id],
          },
          effects,
        );
      }
    }
  }

  public submit = (message: ComposerQueueMessage): ComposerInputQueueTransition => {
    if (this.activeEditAcquisition != null) {
      return this.editAcquisitionConflictTransition();
    }
    const acceptance = this.acceptMessage(message);
    if (acceptance.type === "rejected") {
      return acceptance.transition;
    }

    const ownedMessage = acceptance.message;
    if (
      this.activeTurnId == null &&
      !this.startState.hasPending() &&
      this.ordinaryState.count() === 0
    ) {
      return transition({ type: "claimIssued" }, [this.issueStart(ownedMessage)]);
    }
    this.ordinaryState.enqueue(ownedMessage);
    this.ownDisplayKey(ownedMessage.id);
    this.advanceDetailRevision();
    return transition({ type: "queued", messageId: ownedMessage.id });
  };

  public submitSteer = (message: ComposerQueueMessage): ComposerInputQueueTransition => {
    if (this.activeEditAcquisition != null) {
      return this.editAcquisitionConflictTransition();
    }
    if (this.activeTurnId == null) {
      return this.submit(message);
    }
    const acceptance = this.acceptMessage(message);
    if (acceptance.type === "rejected") {
      return acceptance.transition;
    }
    const ownedMessage = acceptance.message;
    const queued = this.steerState.transition({
      type: "enqueue",
      input: {
        message: ownedMessage,
        threadId: this.threadId,
        expectedTurnId: this.activeTurnId,
        source: "direct",
      },
    });
    if (queued.type === "enqueued") {
      this.ownDisplayKey(ownedMessage.id);
      this.advanceDetailRevision();
    }
    return this.drainTransition(
      queued.type === "rejected" ? "steerRejected" : "steerQueued",
      this.drainSteer(),
    );
  };

  private acceptMessage(message: ComposerQueueMessage): MessageAcceptance {
    if (!hasMeaningfulInput(message.input)) {
      return {
        type: "rejected",
        transition: transition({ type: "invalidInput", reason: "emptyInput" }),
      };
    }
    if (this.knownMessageIds.has(message.id)) {
      return {
        type: "rejected",
        transition: transition({ type: "duplicateIdentity", messageId: message.id }),
      };
    }
    const ownedMessage = ownMessage(message);
    this.knownMessageIds.add(ownedMessage.id);
    return { type: "accepted", message: ownedMessage };
  }

  public promoteOrdinaryFrontToSteer = (): ComposerInputQueueTransition => {
    if (this.activeEditAcquisition != null) {
      return this.editAcquisitionConflictTransition();
    }
    if (this.activeTurnId == null) {
      return transition({ type: "noOp", reason: "noActiveTurn" });
    }
    const taken = this.ordinaryState.takeFront();
    if (taken.type === "empty") {
      return transition({ type: "noOp", reason: "ordinaryQueueEmpty" });
    }
    if (taken.type === "blocked") {
      return transition({ type: "noOp", reason: "ordinaryQueueBlockedByEdit" });
    }
    const message = taken.message;
    const queued = this.steerState.transition({
      type: "enqueue",
      input: {
        message,
        threadId: this.threadId,
        expectedTurnId: this.activeTurnId,
        source: "ordinaryPromotion",
      },
    });
    this.advanceDetailRevision();
    if (queued.type === "rejected") {
      this.forgetDisplayKey(message.id);
      return transition({ type: "applied", operation: "steerRejected" });
    }
    return this.drainTransition("steerQueued", this.drainSteer());
  };

  public restoreSteerRecovery = (transfer: SteerRecoveryTransfer): ComposerInputQueueTransition => {
    if (this.activeEditAcquisition != null) {
      return this.editAcquisitionConflictTransition();
    }
    const restored = this.steerState.transition({ type: "restoreRecovery", transfer });
    if (restored.type !== "recoveryRestored") {
      return transition({ type: "ownershipMismatch", subject: "steerRecoveryTransfer" });
    }
    for (const messageId of restored.messageIds) {
      this.knownMessageIds.add(messageId);
      this.ownDisplayKey(messageId);
    }
    for (const messageId of restored.rejectedMessageIds ?? []) {
      this.knownMessageIds.add(messageId);
      this.forgetDisplayKey(messageId);
    }
    if (restored.messageIds.length > 0) {
      this.advanceDetailRevision();
    }
    return this.drainTransition("steerRecoveryRestored", this.drainSteer());
  };

  public settleStart = (settlement: StartSettlement): ComposerInputQueueTransition => {
    if (this.activeEditAcquisition != null) {
      return this.editAcquisitionConflictTransition();
    }
    return this.applyStartOutcome(this.startState.settle(settlement));
  };

  public settleSteer = (settlement: SteerSettlement): ComposerInputQueueTransition => {
    if (this.activeEditAcquisition != null) {
      return this.editAcquisitionConflictTransition();
    }
    const result = this.steerState.transition(
      settlement.type === "accepted"
        ? { type: "responseAccepted", claim: settlement.claim, turnId: settlement.turnId }
        : settlement,
    );
    if (result.type === "ownershipMismatch") {
      return transition({ type: "ownershipMismatch", subject: "steerClaim" });
    }
    if (result.type === "deliveryUnknown") {
      return transition({ type: "deliveryUnknown" });
    }
    if (result.type === "recoveryRequired") {
      const messageIds = result.transfer.intents.map(({ message }) => message.id);
      for (const messageId of messageIds) {
        this.knownMessageIds.delete(messageId);
      }
      this.removeNormalDisplayKeys(messageIds);
      return recoveryTransition(
        { reason: "steerDefinitelyNotAccepted", transfer: result.transfer },
        messageIds,
      );
    }
    const editInvalidation =
      result.type === "rejected"
        ? this.consumeSteerEditInvalidation(result.editInvalidations)
        : undefined;
    if (result.type === "rejected") {
      this.removeNormalDisplayKeys(result.messageIds);
    }
    const operation =
      result.type === "accepted"
        ? "steerAccepted"
        : result.type === "rejected"
          ? "steerRejected"
          : "observationRecorded";
    return this.drainTransition(operation, this.drainSteer(), editInvalidation);
  };

  public prepareInterruptedTerminal = (
    observation: InterruptedTurnCompletedObservation,
  ): ComposerInputQueueTransition => {
    if (this.activeEditAcquisition != null) {
      return this.editAcquisitionConflictTransition();
    }
    return this.applyStartOutcome(this.startState.observe(observation, this.activeTurnId));
  };

  public applyInterruptedDisposition = (
    turnId: TurnIdentity,
    disposition: ComposerInterruptedDisposition,
  ): ComposerInputQueueTransition => {
    if (this.activeEditAcquisition != null) {
      return this.editAcquisitionConflictTransition();
    }
    if (this.preparedInterruptedTurnId !== turnId) {
      return transition({ type: "ownershipMismatch", subject: "interruptedTurn" });
    }
    if (disposition === "local" && this.activeEdit != null) {
      return transition({ type: "ownershipMismatch", subject: "pendingInputEdit" });
    }
    this.preparedInterruptedTurnId = null;
    const terminal = this.steerState.transition({
      type: "terminal",
      threadId: this.threadId,
      turnId,
    });
    const editInvalidation =
      terminal.type === "terminal"
        ? this.consumeSteerEditInvalidation(terminal.editInvalidations)
        : undefined;
    if (terminal.type === "terminal") {
      this.removeNormalDisplayKeys(terminal.messageIds);
    }
    if (disposition === "nonLocal") {
      return this.drainTransition("turnCompleted", this.drainNextStart(), editInvalidation);
    }

    const taken = this.steerState.transition({ type: "takeRejected" });
    const rejected = taken.type === "rejectedTaken" ? taken.transfer : null;
    const drained = this.ordinaryState.drain();
    if (drained.type === "blocked") {
      throw new Error("Composer local interruption crossed a pending input edit");
    }
    const messages = drained.messages;
    for (const message of messages) {
      this.knownMessageIds.delete(message.id);
      this.forgetDisplayKey(message.id);
    }
    if (messages.length > 0) {
      this.advanceDetailRevision();
    }
    if (rejected == null && messages.length === 0) {
      return transition(
        { type: "applied", operation: "turnCompleted" },
        noEffects,
        editInvalidation,
      );
    }
    const batch: UserStoppedRecoveryBatch = { reason: "userStopped", rejected, messages };
    this.userStoppedRecoveryOwners.add(batch);
    const recovery = recoveryTransition(batch, [
      ...(rejected?.entries.map(({ intent }) => intent.message.id) ?? []),
      ...messages.map(({ id }) => id),
    ]);
    return editInvalidation == null ? recovery : { ...recovery, editInvalidation };
  };

  public restoreUserStoppedRecovery = (
    batch: UserStoppedRecoveryBatch,
  ): ComposerInputQueueTransition => {
    if (this.activeEditAcquisition != null) {
      return this.editAcquisitionConflictTransition();
    }
    if (!this.userStoppedRecoveryOwners.delete(batch)) {
      return transition({ type: "ownershipMismatch", subject: "userStoppedRecovery" });
    }
    if (batch.messages.some(({ id }) => this.knownMessageIds.has(id))) {
      return transition({ type: "ownershipMismatch", subject: "userStoppedRecovery" });
    }
    if (batch.rejected != null) {
      const restored = this.steerState.transition({
        type: "restoreRejected",
        transfer: batch.rejected,
      });
      if (restored.type !== "rejectedRestored") {
        return transition({ type: "ownershipMismatch", subject: "userStoppedRecovery" });
      }
    }
    const messages = batch.messages.map(ownMessage);
    this.ordinaryState.restoreFront(messages);
    for (const message of messages) {
      this.knownMessageIds.add(message.id);
      this.ownDisplayKey(message.id);
    }
    if (messages.length > 0) {
      this.advanceDetailRevision();
    }
    return this.drainTransition("userStoppedRecoveryRestored", this.drainNextStart());
  };

  public observe = (
    observation: NonInterruptedRuntimeObservation,
  ): ComposerInputQueueTransition => {
    if (this.activeEditAcquisition != null) {
      return this.editAcquisitionConflictTransition();
    }
    if (observation.type === "userMessageCommitted") {
      const steerResult = this.steerState.transition({
        type: "committed",
        threadId: this.threadId,
        turnId: observation.turnId,
        clientUserMessageId: observation.clientId,
      });
      if (steerResult.type === "committed") {
        this.knownMessageIds.delete(steerResult.messageId);
        this.removeNormalDisplayKeys([steerResult.messageId]);
        return this.drainTransition("steerCommitted", this.drainSteer());
      }
    }
    return this.applyStartOutcome(this.startState.observe(observation, this.activeTurnId));
  };
}

export function createComposerInputQueue(
  input: CreateComposerInputQueueInput = { threadId: "composer-input-queue", activeTurnId: null },
): ComposerInputQueue {
  return new ComposerInputQueueImpl(input);
}
