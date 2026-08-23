import type { TurnSteerParams } from "@codex-protocol/v2";
import {
  copyComposerInputPayload,
  type ReadonlyComposerInputPayload,
} from "./composerInputPayload";
import type {
  ComposerPendingInputManagement,
  ComposerPendingInputMoveDestination,
  ComposerPendingInputMovement,
  ComposerQueueMessage,
} from "./composerInputQueueContracts";
import {
  composerPendingInputMoveTargetIndex,
  moveArrayElement,
} from "./composerPendingInputMove";

const steerClaimCapability: unique symbol = Symbol("SteerClaim");
const rejectedSteerTransferCapability: unique symbol = Symbol("RejectedSteerTransfer");
const steerRecoveryTransferCapability: unique symbol = Symbol("SteerRecoveryTransfer");
let nextClientUserMessageSequence = 0;

type ThreadIdentity = TurnSteerParams["threadId"];
type TurnIdentity = TurnSteerParams["expectedTurnId"];
type SteerClientIdentity = NonNullable<TurnSteerParams["clientUserMessageId"]>;

export type SteerSource = "direct" | "ordinaryPromotion";

export type EnqueueSteerInput = Readonly<{
  message: ComposerQueueMessage;
  threadId: ThreadIdentity;
  expectedTurnId: TurnIdentity;
  source: SteerSource;
}>;

export type SteerIntent = Readonly<{
  type: "intent";
  message: ComposerQueueMessage;
  threadId: ThreadIdentity;
  expectedTurnId: TurnIdentity;
  clientUserMessageId: SteerClientIdentity;
  source: SteerSource;
}>;

export type SteerEditAcquisition = Readonly<{
  type: "acquiring";
  original: SteerIntent;
  owner: object;
}>;

export type SteerEditReservation = Readonly<{
  type: "reservation";
  original: SteerIntent;
  owner: object;
}>;

export type SteerQueueSlot = SteerIntent | SteerEditAcquisition | SteerEditReservation;

export type SteerClaim = Readonly<{
  type: "steer";
  intent: SteerIntent;
  [steerClaimCapability]: true;
}>;

export type PendingSteerPhase =
  | "issuing"
  | "acceptedAwaitingCommit"
  | "deliveryUnknown"
  | "responseTurnMismatch";

export type PendingSteer = Readonly<{
  claim: SteerClaim;
  phase: PendingSteerPhase;
}>;

export type RejectedSteer = Readonly<{
  intent: SteerIntent;
  reason: "activeTurnNotSteerable" | "terminal";
}>;

type ClosedSteerTarget = Readonly<{
  reason: RejectedSteer["reason"];
  rejectionBatch: number;
}>;

type RejectedSteerOrder = Readonly<{
  rejectionBatch: number;
  intentOrder: number;
}>;

export type SteerEditInvalidation = Readonly<{
  messageId: ComposerQueueMessage["id"];
  owner: object;
  reason: RejectedSteer["reason"];
}>;

export type RejectedSteerTransfer = Readonly<{
  entries: readonly RejectedSteer[];
  [rejectedSteerTransferCapability]: object;
}>;

export type SteerRecoveryTransfer = Readonly<{
  intents: readonly SteerIntent[];
  [steerRecoveryTransferCapability]: object;
}>;

export type ComposerSteerQueueState = Readonly<{
  steerQueue: readonly SteerQueueSlot[];
  pendingSteers: readonly PendingSteer[];
  rejectedSteersQueue: readonly RejectedSteer[];
}>;

export type ComposerSteerPendingInput = Readonly<{
  messageId: ComposerQueueMessage["id"];
  input: ReadonlyComposerInputPayload;
  management: ComposerPendingInputManagement;
  movement: ComposerPendingInputMovement | null;
}>;

export type SteerEditAcquisitionResult =
  | Readonly<{ type: "acquired"; acquisition: SteerEditAcquisition }>
  | Readonly<{ type: "notManageable" }>;

export type SteerEditSettlementResult =
  | Readonly<{ type: "settled" }>
  | Readonly<{ type: "unavailable" }>;

export type SteerDeleteResult =
  | Readonly<{ type: "deleted"; messageId: string }>
  | Readonly<{ type: "notManageable" }>;

export type SteerMoveResult =
  | Readonly<{ type: "moved"; position: number; count: number }>
  | Readonly<{ type: "noOp"; reason: "alreadyAtDestination" }>
  | Readonly<{ type: "notManageable" }>;

export type ComposerSteerQueueOverview = Readonly<{
  pendingCount: number;
  queuedCount: number;
  hasUnknown: boolean;
  rejectedSteersQueue: readonly RejectedSteer[];
}>;

export type ComposerSteerQueueEvent =
  | Readonly<{ type: "enqueue"; input: EnqueueSteerInput }>
  | Readonly<{ type: "issueNext" }>
  | Readonly<{ type: "responseAccepted"; claim: SteerClaim; turnId: TurnIdentity }>
  | Readonly<{ type: "deliveryUnknown"; claim: SteerClaim }>
  | Readonly<{ type: "activeTurnNotSteerable"; claim: SteerClaim }>
  | Readonly<{ type: "definitelyNotAccepted"; claim: SteerClaim }>
  | Readonly<{ type: "takeRejected" }>
  | Readonly<{ type: "restoreRejected"; transfer: RejectedSteerTransfer }>
  | Readonly<{ type: "releaseRejected"; transfer: RejectedSteerTransfer }>
  | Readonly<{ type: "restoreRecovery"; transfer: SteerRecoveryTransfer }>
  | Readonly<{
      type: "committed";
      threadId: ThreadIdentity;
      turnId: TurnIdentity;
      clientUserMessageId: SteerClientIdentity;
    }>
  | Readonly<{ type: "terminal"; threadId: ThreadIdentity; turnId: TurnIdentity }>;

export type ComposerSteerQueueResult =
  | Readonly<{ type: "enqueued"; messageId: string }>
  | Readonly<{ type: "issued"; claim: SteerClaim }>
  | Readonly<{ type: "accepted"; messageId: string }>
  | Readonly<{ type: "deliveryUnknown"; messageId: string }>
  | Readonly<{
      type: "responseTurnMismatch";
      messageId: string;
      expectedTurnId: TurnIdentity;
      responseTurnId: TurnIdentity;
    }>
  | Readonly<{
      type: "rejected";
      reason: RejectedSteer["reason"];
      messageIds: readonly string[];
      editInvalidations?: readonly SteerEditInvalidation[];
    }>
  | Readonly<{ type: "recoveryRequired"; transfer: SteerRecoveryTransfer }>
  | Readonly<{ type: "rejectedTaken"; transfer: RejectedSteerTransfer }>
  | Readonly<{ type: "rejectedRestored"; messageIds: readonly string[] }>
  | Readonly<{ type: "rejectedReleased"; messageIds: readonly string[] }>
  | Readonly<{
      type: "recoveryRestored";
      messageIds: readonly string[];
      rejectedMessageIds?: readonly string[];
    }>
  | Readonly<{ type: "committed"; messageId: string }>
  | Readonly<{
      type: "terminal";
      messageIds: readonly string[];
      editInvalidations?: readonly SteerEditInvalidation[];
    }>
  | Readonly<{ type: "empty" }>
  | Readonly<{
      type: "blocked";
      phase:
        | Extract<PendingSteerPhase, "issuing" | "deliveryUnknown" | "responseTurnMismatch">
        | "editReservation";
    }>
  | Readonly<{ type: "duplicateIdentity"; messageId: string }>
  | Readonly<{
      type: "ownershipMismatch";
      subject: "steerClaim" | "committedMessage" | "rejectedTransfer" | "recoveryTransfer";
    }>;

export type ComposerSteerQueue = Readonly<{
  state(): ComposerSteerQueueState;
  overview(): ComposerSteerQueueOverview;
  pendingInputCount(): number;
  readPendingInputs(offset: number, limit: number): readonly ComposerSteerPendingInput[];
  findPendingInput(messageId: ComposerQueueMessage["id"]): ComposerSteerPendingInput | null;
  acquirePendingInputEdit(messageId: ComposerQueueMessage["id"]): SteerEditAcquisitionResult;
  rollbackPendingInputEdit(acquisition: SteerEditAcquisition): SteerEditSettlementResult;
  reservePendingInputEdit(acquisition: SteerEditAcquisition): SteerEditReservation | null;
  savePendingInputEdit(
    reservation: SteerEditReservation,
    message: ComposerQueueMessage,
  ): SteerEditSettlementResult;
  cancelPendingInputEdit(reservation: SteerEditReservation): SteerEditSettlementResult;
  deletePendingInput(messageId: ComposerQueueMessage["id"]): SteerDeleteResult;
  movePendingInput(
    messageId: ComposerQueueMessage["id"],
    destination: ComposerPendingInputMoveDestination,
  ): SteerMoveResult;
  transition(event: ComposerSteerQueueEvent): ComposerSteerQueueResult;
}>;

class ComposerSteerQueueImpl implements ComposerSteerQueue {
  private readonly steerQueue: SteerQueueSlot[] = [];
  private readonly pendingSteers: PendingSteer[] = [];
  private readonly unknownPendingMessageIds = new Set<string>();
  private readonly rejectedSteersQueue: RejectedSteer[] = [];
  private readonly knownMessageIds = new Set<string>();
  private readonly intentOrder = new WeakMap<SteerIntent, number>();
  private readonly rejectedOrder = new WeakMap<RejectedSteer, RejectedSteerOrder>();
  private readonly outstandingRejectedTransfers = new Map<object, readonly RejectedSteer[]>();
  private readonly outstandingRecoveryTransfers = new Map<object, readonly SteerIntent[]>();
  private readonly closedTargets = new Map<ThreadIdentity, Map<TurnIdentity, ClosedSteerTarget>>();
  private nextIntentOrder = 0;
  private nextRejectionBatch = 0;

  public state = (): ComposerSteerQueueState => ({
    steerQueue: [...this.steerQueue],
    pendingSteers: [...this.pendingSteers],
    rejectedSteersQueue: [...this.rejectedSteersQueue],
  });

  public overview = (): ComposerSteerQueueOverview => ({
    pendingCount: this.pendingSteers.length,
    queuedCount: this.steerQueue.length,
    hasUnknown: this.unknownPendingMessageIds.size > 0,
    rejectedSteersQueue: [...this.rejectedSteersQueue],
  });

  public pendingInputCount = (): number => this.pendingSteers.length + this.steerQueue.length;

  public readPendingInputs = (
    offset: number,
    limit: number,
  ): readonly ComposerSteerPendingInput[] => {
    const pendingEnd = Math.min(this.pendingSteers.length, offset + limit);
    const result: ComposerSteerPendingInput[] = this.pendingSteers
      .slice(offset, pendingEnd)
      .map(({ claim }) => ({
        messageId: claim.intent.message.id,
        input: claim.intent.message.input,
        management: { type: "readOnly", reason: "deliveryInProgress" } as const,
        movement: null,
      }));
    const remaining = limit - result.length;
    if (remaining <= 0) {
      return result;
    }
    const queuedOffset = Math.max(0, offset - this.pendingSteers.length);
    result.push(
      ...this.steerQueue.slice(queuedOffset, queuedOffset + remaining).map((slot, index) => {
        const intent = this.slotIntent(slot);
        return {
          messageId: intent.message.id,
          input: intent.message.input,
          management:
            slot.type === "reservation"
              ? ({ type: "editing" } as const)
              : ({ type: "manageable" } as const),
          movement: this.movementForQueueIndex(queuedOffset + index),
        };
      }),
    );
    return result;
  };

  public findPendingInput = (
    messageId: ComposerQueueMessage["id"],
  ): ComposerSteerPendingInput | null => {
    const pending = this.pendingSteers.find(({ claim }) => claim.intent.message.id === messageId);
    const slot = this.steerQueue.find((item) => this.slotIntent(item).message.id === messageId);
    const intent = pending?.claim.intent ?? (slot == null ? null : this.slotIntent(slot));
    return intent == null
      ? null
      : {
          messageId: intent.message.id,
          input: intent.message.input,
          management:
            pending != null
              ? { type: "readOnly", reason: "deliveryInProgress" }
              : slot?.type === "reservation"
                ? { type: "editing" }
                : { type: "manageable" },
          movement:
            pending != null || slot == null
              ? null
              : this.movementForQueueIndex(this.steerQueue.indexOf(slot)),
        };
  };

  public acquirePendingInputEdit = (
    messageId: ComposerQueueMessage["id"],
  ): SteerEditAcquisitionResult => {
    const index = this.steerQueue.findIndex(
      (slot) => slot.type === "intent" && slot.message.id === messageId,
    );
    const intent = this.steerQueue[index];
    if (index < 0 || intent?.type !== "intent") {
      return { type: "notManageable" };
    }
    const acquisition: SteerEditAcquisition = { type: "acquiring", original: intent, owner: {} };
    this.steerQueue[index] = acquisition;
    return { type: "acquired", acquisition };
  };

  public rollbackPendingInputEdit = (
    acquisition: SteerEditAcquisition,
  ): SteerEditSettlementResult => {
    const index = this.findAcquisition(acquisition);
    if (index < 0) {
      return { type: "unavailable" };
    }
    this.steerQueue[index] = acquisition.original;
    return { type: "settled" };
  };

  public reservePendingInputEdit = (
    acquisition: SteerEditAcquisition,
  ): SteerEditReservation | null => {
    const index = this.findAcquisition(acquisition);
    if (index < 0) {
      return null;
    }
    const reservation: SteerEditReservation = {
      type: "reservation",
      original: acquisition.original,
      owner: acquisition.owner,
    };
    this.steerQueue[index] = reservation;
    return reservation;
  };

  public savePendingInputEdit = (
    reservation: SteerEditReservation,
    message: ComposerQueueMessage,
  ): SteerEditSettlementResult => {
    const index = this.findReservation(reservation);
    if (index < 0) {
      return { type: "unavailable" };
    }
    const order = this.intentOrder.get(reservation.original);
    if (order == null) {
      throw new Error("Composer pending steer edit lost its original FIFO order");
    }
    const saved: SteerIntent = {
      ...reservation.original,
      message: {
        type: "recoverable",
        id: reservation.original.message.id,
        draft: message.draft,
        input: copyComposerInputPayload(message.input),
      },
    };
    this.intentOrder.set(saved, order);
    this.steerQueue[index] = saved;
    return { type: "settled" };
  };

  public cancelPendingInputEdit = (
    reservation: SteerEditReservation,
  ): SteerEditSettlementResult => {
    const index = this.findReservation(reservation);
    if (index < 0) {
      return { type: "unavailable" };
    }
    this.steerQueue[index] = reservation.original;
    return { type: "settled" };
  };

  public deletePendingInput = (messageId: ComposerQueueMessage["id"]): SteerDeleteResult => {
    const index = this.steerQueue.findIndex(
      (slot) => slot.type === "intent" && slot.message.id === messageId,
    );
    const deleted = this.steerQueue[index];
    if (index < 0 || deleted?.type !== "intent") {
      return { type: "notManageable" };
    }
    this.steerQueue.splice(index, 1);
    this.knownMessageIds.delete(deleted.message.id);
    return { type: "deleted", messageId: deleted.message.id };
  };

  public movePendingInput = (
    messageId: ComposerQueueMessage["id"],
    destination: ComposerPendingInputMoveDestination,
  ): SteerMoveResult => {
    if (
      this.outstandingRecoveryTransfers.size > 0 ||
      this.steerQueue.some((slot) => slot.type !== "intent")
    ) {
      return { type: "notManageable" };
    }
    const sourceIndex = this.steerQueue.findIndex(
      (slot) => slot.type === "intent" && slot.message.id === messageId,
    );
    if (sourceIndex < 0) {
      return { type: "notManageable" };
    }
    const count = this.steerQueue.length;
    const targetIndex = composerPendingInputMoveTargetIndex(sourceIndex, count, destination);
    if (sourceIndex === targetIndex) {
      return { type: "noOp", reason: "alreadyAtDestination" };
    }
    const schedulingOrder = this.steerQueue
      .map((slot) => {
        const intent = this.slotIntent(slot);
        const order = this.intentOrder.get(intent);
        if (order == null) {
          throw new Error("Composer pending steer lost its scheduling order");
        }
        return order;
      })
      .sort((left, right) => left - right);
    moveArrayElement(this.steerQueue, sourceIndex, targetIndex);
    this.steerQueue.forEach((slot, index) => {
      const order = schedulingOrder[index];
      if (order == null) {
        throw new Error("Composer pending steer move lost a scheduling order token");
      }
      this.intentOrder.set(this.slotIntent(slot), order);
    });
    return { type: "moved", position: targetIndex + 1, count };
  };

  private enqueue(input: EnqueueSteerInput): ComposerSteerQueueResult {
    if (this.knownMessageIds.has(input.message.id)) {
      return { type: "duplicateIdentity", messageId: input.message.id };
    }
    nextClientUserMessageSequence += 1;
    const intent: SteerIntent = {
      type: "intent",
      message: {
        type: "recoverable",
        id: input.message.id,
        draft: input.message.draft,
        input: copyComposerInputPayload(input.message.input),
      },
      threadId: input.threadId,
      expectedTurnId: input.expectedTurnId,
      clientUserMessageId: `composer-steer-${String(nextClientUserMessageSequence)}`,
      source: input.source,
    };
    this.nextIntentOrder += 1;
    this.intentOrder.set(intent, this.nextIntentOrder);
    this.knownMessageIds.add(intent.message.id);
    const closedTarget = this.closedTargets.get(intent.threadId)?.get(intent.expectedTurnId);
    if (closedTarget != null) {
      const rejected = this.createRejected(intent, closedTarget.reason);
      this.rejectedSteersQueue.push(rejected);
      return {
        type: "rejected",
        reason: closedTarget.reason,
        messageIds: [intent.message.id],
      };
    }
    this.steerQueue.push(intent);
    return { type: "enqueued", messageId: intent.message.id };
  }

  private issueNext(): ComposerSteerQueueResult {
    for (const { phase } of this.pendingSteers) {
      switch (phase) {
        case "acceptedAwaitingCommit":
          break;
        case "issuing":
        case "deliveryUnknown":
        case "responseTurnMismatch":
          return { type: "blocked", phase };
      }
    }
    const head = this.steerQueue[0];
    if (head == null) {
      return { type: "empty" };
    }
    if (head.type !== "intent") {
      return { type: "blocked", phase: "editReservation" };
    }
    const intent = this.steerQueue.shift();
    if (intent?.type !== "intent") {
      throw new Error("Composer steer queue lost its issueable intent");
    }
    const claim: SteerClaim = {
      type: "steer",
      intent,
      [steerClaimCapability]: true as const,
    };
    this.pendingSteers.push({ claim, phase: "issuing" });
    return { type: "issued", claim };
  }

  private findIssuing(claim: SteerClaim): number {
    return this.pendingSteers.findIndex(
      (pending) => pending.claim === claim && pending.phase === "issuing",
    );
  }

  private settleAccepted(claim: SteerClaim, turnId: TurnIdentity): ComposerSteerQueueResult {
    const index = this.findIssuing(claim);
    if (index < 0) {
      return { type: "ownershipMismatch", subject: "steerClaim" };
    }
    if (turnId !== claim.intent.expectedTurnId) {
      this.pendingSteers[index] = { claim, phase: "responseTurnMismatch" };
      this.unknownPendingMessageIds.add(claim.intent.message.id);
      return {
        type: "responseTurnMismatch",
        messageId: claim.intent.message.id,
        expectedTurnId: claim.intent.expectedTurnId,
        responseTurnId: turnId,
      };
    }
    this.pendingSteers[index] = { claim, phase: "acceptedAwaitingCommit" };
    return { type: "accepted", messageId: claim.intent.message.id };
  }

  private markDeliveryUnknown(claim: SteerClaim): ComposerSteerQueueResult {
    const index = this.findIssuing(claim);
    if (index < 0) {
      return { type: "ownershipMismatch", subject: "steerClaim" };
    }
    this.pendingSteers[index] = { claim, phase: "deliveryUnknown" };
    this.unknownPendingMessageIds.add(claim.intent.message.id);
    return { type: "deliveryUnknown", messageId: claim.intent.message.id };
  }

  private rejectTarget(claim: SteerClaim): ComposerSteerQueueResult {
    if (this.findIssuing(claim) < 0) {
      return { type: "ownershipMismatch", subject: "steerClaim" };
    }
    const { threadId, expectedTurnId } = claim.intent;
    const closedTarget = this.closeTarget(threadId, expectedTurnId, "activeTurnNotSteerable");
    const reason = closedTarget.reason;
    const pending = this.removePendingTarget(threadId, expectedTurnId);
    const unsent = this.removeUnsentTarget(threadId, expectedTurnId);
    const intents = [...pending, ...unsent.intents];
    this.rejectedSteersQueue.push(
      ...intents.map((intent) => this.createRejected(intent, reason, closedTarget.rejectionBatch)),
    );
    return {
      type: "rejected",
      reason,
      messageIds: intents.map(({ message }) => message.id),
      ...(unsent.invalidations.length === 0 ? {} : { editInvalidations: unsent.invalidations }),
    };
  }

  private requireRecovery(claim: SteerClaim): ComposerSteerQueueResult {
    const index = this.findIssuing(claim);
    if (index < 0) {
      return { type: "ownershipMismatch", subject: "steerClaim" };
    }
    const recoveredClaim = this.pendingSteers[index]?.claim;
    if (recoveredClaim == null) {
      return { type: "ownershipMismatch", subject: "steerClaim" };
    }
    this.pendingSteers.splice(index, 1);
    this.unknownPendingMessageIds.delete(recoveredClaim.intent.message.id);
    this.knownMessageIds.delete(recoveredClaim.intent.message.id);
    const token = {};
    const intents = [recoveredClaim.intent];
    this.outstandingRecoveryTransfers.set(token, intents);
    return {
      type: "recoveryRequired",
      transfer: {
        intents: [...intents],
        [steerRecoveryTransferCapability]: token,
      },
    };
  }

  private commit(
    threadId: ThreadIdentity,
    turnId: TurnIdentity,
    clientUserMessageId: SteerClientIdentity,
  ): ComposerSteerQueueResult {
    const index = this.pendingSteers.findIndex(
      ({ claim }) =>
        claim.intent.threadId === threadId &&
        claim.intent.expectedTurnId === turnId &&
        claim.intent.clientUserMessageId === clientUserMessageId,
    );
    if (index < 0) {
      return { type: "ownershipMismatch", subject: "committedMessage" };
    }
    const claim = this.pendingSteers[index]?.claim;
    if (claim == null) {
      return { type: "ownershipMismatch", subject: "committedMessage" };
    }
    this.pendingSteers.splice(index, 1);
    this.unknownPendingMessageIds.delete(claim.intent.message.id);
    this.knownMessageIds.delete(claim.intent.message.id);
    return { type: "committed", messageId: claim.intent.message.id };
  }

  private terminal(threadId: ThreadIdentity, turnId: TurnIdentity): ComposerSteerQueueResult {
    const closedTarget = this.closeTarget(threadId, turnId, "terminal");
    const reason = closedTarget.reason;
    const pending = this.removePendingTarget(threadId, turnId);
    const unsent = this.removeUnsentTarget(threadId, turnId);
    const intents = [...pending, ...unsent.intents];
    this.rejectedSteersQueue.push(
      ...intents.map((intent) => this.createRejected(intent, reason, closedTarget.rejectionBatch)),
    );
    return {
      type: "terminal",
      messageIds: intents.map(({ message }) => message.id),
      ...(unsent.invalidations.length === 0 ? {} : { editInvalidations: unsent.invalidations }),
    };
  }

  private closeTarget(
    threadId: ThreadIdentity,
    turnId: TurnIdentity,
    reason: RejectedSteer["reason"],
  ): ClosedSteerTarget {
    const closedTurns =
      this.closedTargets.get(threadId) ?? new Map<TurnIdentity, ClosedSteerTarget>();
    const existing = closedTurns.get(turnId);
    if (existing != null) {
      return existing;
    }
    this.nextRejectionBatch += 1;
    const closedTarget: ClosedSteerTarget = {
      reason,
      rejectionBatch: this.nextRejectionBatch,
    };
    closedTurns.set(turnId, closedTarget);
    this.closedTargets.set(threadId, closedTurns);
    return closedTarget;
  }

  private removePendingTarget(threadId: ThreadIdentity, turnId: TurnIdentity): SteerIntent[] {
    const removed: SteerIntent[] = [];
    for (let index = 0; index < this.pendingSteers.length;) {
      const pending = this.pendingSteers[index];
      if (pending == null) {
        break;
      }
      if (
        pending.claim.intent.threadId === threadId &&
        pending.claim.intent.expectedTurnId === turnId
      ) {
        removed.push(pending.claim.intent);
        this.unknownPendingMessageIds.delete(pending.claim.intent.message.id);
        this.pendingSteers.splice(index, 1);
      } else {
        index += 1;
      }
    }
    return removed;
  }

  private removeUnsentTarget(
    threadId: ThreadIdentity,
    turnId: TurnIdentity,
  ): Readonly<{
    intents: readonly SteerIntent[];
    invalidations: readonly SteerEditInvalidation[];
  }> {
    const removed: SteerIntent[] = [];
    const invalidations: SteerEditInvalidation[] = [];
    for (let index = 0; index < this.steerQueue.length;) {
      const slot = this.steerQueue[index];
      if (slot == null) {
        break;
      }
      const intent = this.slotIntent(slot);
      if (intent.threadId === threadId && intent.expectedTurnId === turnId) {
        removed.push(intent);
        if (slot.type === "reservation") {
          invalidations.push({
            messageId: intent.message.id,
            owner: slot.owner,
            reason: this.closedTargets.get(threadId)?.get(turnId)?.reason ?? "terminal",
          });
        }
        this.steerQueue.splice(index, 1);
      } else {
        index += 1;
      }
    }
    return { intents: removed, invalidations };
  }

  private slotIntent(slot: SteerQueueSlot): SteerIntent {
    return slot.type === "intent" ? slot : slot.original;
  }

  private movementForQueueIndex(queueIndex: number): ComposerPendingInputMovement | null {
    if (
      this.outstandingRecoveryTransfers.size > 0 ||
      this.steerQueue.some((candidate) => candidate.type !== "intent")
    ) {
      return null;
    }
    const slot = this.steerQueue[queueIndex];
    if (slot?.type !== "intent") {
      return null;
    }
    const sortableSlots = this.steerQueue.filter((candidate) => candidate.type === "intent");
    const position = sortableSlots.indexOf(slot);
    if (position < 0) {
      throw new Error("Composer pending steer projection lost its sortable position");
    }
    return {
      position: position + 1,
      count: sortableSlots.length,
      canMoveEarlier: position > 0,
      canMoveLater: position < sortableSlots.length - 1,
    };
  }

  private findAcquisition(acquisition: SteerEditAcquisition): number {
    return this.steerQueue.findIndex(
      (slot) => slot.type === "acquiring" && slot.owner === acquisition.owner,
    );
  }

  private findReservation(reservation: SteerEditReservation): number {
    return this.steerQueue.findIndex(
      (slot) => slot.type === "reservation" && slot.owner === reservation.owner,
    );
  }

  private takeRejected(): ComposerSteerQueueResult {
    if (this.rejectedSteersQueue.length === 0) {
      return { type: "empty" };
    }

    const entries = this.rejectedSteersQueue.splice(0);
    const token = {};
    this.outstandingRejectedTransfers.set(token, entries);
    return {
      type: "rejectedTaken",
      transfer: {
        entries: [...entries],
        [rejectedSteerTransferCapability]: token,
      },
    };
  }

  private consumeRejectedTransfer(
    transfer: RejectedSteerTransfer,
  ): readonly RejectedSteer[] | undefined {
    const token = transfer[rejectedSteerTransferCapability];
    const entries = this.outstandingRejectedTransfers.get(token);
    if (entries == null) {
      return undefined;
    }
    this.outstandingRejectedTransfers.delete(token);
    return entries;
  }

  private restoreRejected(transfer: RejectedSteerTransfer): ComposerSteerQueueResult {
    const entries = this.consumeRejectedTransfer(transfer);
    if (entries == null) {
      return { type: "ownershipMismatch", subject: "rejectedTransfer" };
    }
    for (const entry of entries) {
      this.insertRejectedByOrder(entry);
    }
    return {
      type: "rejectedRestored",
      messageIds: entries.map(({ intent }) => intent.message.id),
    };
  }

  private releaseRejected(transfer: RejectedSteerTransfer): ComposerSteerQueueResult {
    const entries = this.consumeRejectedTransfer(transfer);
    if (entries == null) {
      return { type: "ownershipMismatch", subject: "rejectedTransfer" };
    }
    for (const { intent } of entries) {
      this.knownMessageIds.delete(intent.message.id);
    }
    return {
      type: "rejectedReleased",
      messageIds: entries.map(({ intent }) => intent.message.id),
    };
  }

  private restoreRecovery(transfer: SteerRecoveryTransfer): ComposerSteerQueueResult {
    const token = transfer[steerRecoveryTransferCapability];
    const intents = this.outstandingRecoveryTransfers.get(token);
    if (intents == null) {
      return { type: "ownershipMismatch", subject: "recoveryTransfer" };
    }
    this.outstandingRecoveryTransfers.delete(token);
    const restored: SteerIntent[] = [];
    const rejected: RejectedSteer[] = [];
    for (const intent of intents) {
      this.knownMessageIds.add(intent.message.id);
      const closedTarget = this.closedTargets.get(intent.threadId)?.get(intent.expectedTurnId);
      if (closedTarget == null) {
        restored.push(intent);
      } else {
        rejected.push(
          this.createRejected(intent, closedTarget.reason, closedTarget.rejectionBatch),
        );
      }
    }
    this.steerQueue.unshift(...restored);
    for (const entry of rejected) {
      this.insertRejectedByOrder(entry);
    }
    return {
      type: "recoveryRestored",
      messageIds: restored.map(({ message }) => message.id),
      ...(rejected.length === 0
        ? {}
        : { rejectedMessageIds: rejected.map(({ intent }) => intent.message.id) }),
    };
  }

  private insertRejectedByOrder(entry: RejectedSteer): void {
    const order = this.requireRejectedOrder(entry);
    const laterIndex = this.rejectedSteersQueue.findIndex((existing) => {
      const existingOrder = this.requireRejectedOrder(existing);
      return (
        existingOrder.rejectionBatch > order.rejectionBatch ||
        (existingOrder.rejectionBatch === order.rejectionBatch &&
          existingOrder.intentOrder > order.intentOrder)
      );
    });
    if (laterIndex >= 0) {
      this.rejectedSteersQueue.splice(laterIndex, 0, entry);
      return;
    }
    this.rejectedSteersQueue.push(entry);
  }

  private createRejected(
    intent: SteerIntent,
    reason: RejectedSteer["reason"],
    rejectionBatch?: number,
  ): RejectedSteer {
    const intentOrder = this.intentOrder.get(intent);
    if (intentOrder == null) {
      throw new Error("Composer rejected steer lost its original FIFO order");
    }
    if (rejectionBatch == null) {
      this.nextRejectionBatch += 1;
    }
    const entry: RejectedSteer = { intent, reason };
    this.rejectedOrder.set(entry, {
      rejectionBatch: rejectionBatch ?? this.nextRejectionBatch,
      intentOrder,
    });
    return entry;
  }

  private requireRejectedOrder(entry: RejectedSteer): RejectedSteerOrder {
    const order = this.rejectedOrder.get(entry);
    if (order == null) {
      throw new Error("Composer rejected steer lost its rejection order");
    }
    return order;
  }

  public transition = (event: ComposerSteerQueueEvent): ComposerSteerQueueResult => {
    switch (event.type) {
      case "enqueue":
        return this.enqueue(event.input);
      case "issueNext":
        return this.issueNext();
      case "responseAccepted":
        return this.settleAccepted(event.claim, event.turnId);
      case "deliveryUnknown":
        return this.markDeliveryUnknown(event.claim);
      case "activeTurnNotSteerable":
        return this.rejectTarget(event.claim);
      case "definitelyNotAccepted":
        return this.requireRecovery(event.claim);
      case "takeRejected":
        return this.takeRejected();
      case "restoreRejected":
        return this.restoreRejected(event.transfer);
      case "releaseRejected":
        return this.releaseRejected(event.transfer);
      case "restoreRecovery":
        return this.restoreRecovery(event.transfer);
      case "committed":
        return this.commit(event.threadId, event.turnId, event.clientUserMessageId);
      case "terminal":
        return this.terminal(event.threadId, event.turnId);
    }
  };
}

export function createComposerSteerQueue(): ComposerSteerQueue {
  return new ComposerSteerQueueImpl();
}
