import type { TurnSteerParams } from "@codex-protocol/v2";

const steerClaimCapability: unique symbol = Symbol("SteerClaim");
const rejectedSteerTransferCapability: unique symbol = Symbol("RejectedSteerTransfer");
const steerRecoveryTransferCapability: unique symbol = Symbol("SteerRecoveryTransfer");
let nextClientUserMessageSequence = 0;

type ThreadIdentity = TurnSteerParams["threadId"];
type TurnIdentity = TurnSteerParams["expectedTurnId"];
type SteerClientIdentity = NonNullable<TurnSteerParams["clientUserMessageId"]>;
type DeepReadonly<T> = T extends readonly (infer Item)[]
  ? readonly DeepReadonly<Item>[]
  : T extends object
    ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
    : T;
type SteerInput = DeepReadonly<TurnSteerParams["input"]>;

export type SteerSource = "direct" | "ordinaryPromotion";

export type EnqueueSteerInput = Readonly<{
  messageId: string;
  threadId: ThreadIdentity;
  expectedTurnId: TurnIdentity;
  input: SteerInput;
  source: SteerSource;
}>;

export type SteerIntent = Readonly<{
  messageId: string;
  threadId: ThreadIdentity;
  expectedTurnId: TurnIdentity;
  clientUserMessageId: SteerClientIdentity;
  input: SteerInput;
  source: SteerSource;
}>;

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

export type RejectedSteerTransfer = Readonly<{
  entries: readonly RejectedSteer[];
  [rejectedSteerTransferCapability]: object;
}>;

export type SteerRecoveryTransfer = Readonly<{
  intents: readonly SteerIntent[];
  [steerRecoveryTransferCapability]: object;
}>;

export type ComposerSteerQueueState = Readonly<{
  steerQueue: readonly SteerIntent[];
  pendingSteers: readonly PendingSteer[];
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
  | Readonly<{ type: "rejected"; reason: RejectedSteer["reason"]; messageIds: readonly string[] }>
  | Readonly<{ type: "recoveryRequired"; transfer: SteerRecoveryTransfer }>
  | Readonly<{ type: "rejectedTaken"; transfer: RejectedSteerTransfer }>
  | Readonly<{ type: "rejectedRestored"; messageIds: readonly string[] }>
  | Readonly<{ type: "rejectedReleased"; messageIds: readonly string[] }>
  | Readonly<{ type: "recoveryRestored"; messageIds: readonly string[] }>
  | Readonly<{ type: "committed"; messageId: string }>
  | Readonly<{ type: "terminal"; messageIds: readonly string[] }>
  | Readonly<{ type: "empty" }>
  | Readonly<{
      type: "blocked";
      phase: Extract<PendingSteerPhase, "issuing" | "deliveryUnknown" | "responseTurnMismatch">;
    }>
  | Readonly<{ type: "duplicateIdentity"; messageId: string }>
  | Readonly<{
      type: "ownershipMismatch";
      subject: "steerClaim" | "committedMessage" | "rejectedTransfer" | "recoveryTransfer";
    }>;

export type ComposerSteerQueue = Readonly<{
  state(): ComposerSteerQueueState;
  transition(event: ComposerSteerQueueEvent): ComposerSteerQueueResult;
}>;

function ownInput(input: SteerInput): SteerInput {
  return input.map((item) => structuredClone(item));
}

class ComposerSteerQueueImpl implements ComposerSteerQueue {
  private readonly steerQueue: SteerIntent[] = [];
  private readonly pendingSteers: PendingSteer[] = [];
  private readonly rejectedSteersQueue: RejectedSteer[] = [];
  private readonly knownMessageIds = new Set<string>();
  private readonly outstandingRejectedTransfers = new Map<object, readonly RejectedSteer[]>();
  private readonly outstandingRecoveryTransfers = new Map<object, readonly SteerIntent[]>();
  private readonly closedTargets = new Map<
    ThreadIdentity,
    Map<TurnIdentity, RejectedSteer["reason"]>
  >();

  public state = (): ComposerSteerQueueState => ({
    steerQueue: [...this.steerQueue],
    pendingSteers: [...this.pendingSteers],
    rejectedSteersQueue: [...this.rejectedSteersQueue],
  });

  private enqueue(input: EnqueueSteerInput): ComposerSteerQueueResult {
    if (this.knownMessageIds.has(input.messageId)) {
      return { type: "duplicateIdentity", messageId: input.messageId };
    }
    nextClientUserMessageSequence += 1;
    const intent: SteerIntent = {
      messageId: input.messageId,
      threadId: input.threadId,
      expectedTurnId: input.expectedTurnId,
      clientUserMessageId: `composer-steer-${String(nextClientUserMessageSequence)}`,
      input: ownInput(input.input),
      source: input.source,
    };
    this.knownMessageIds.add(intent.messageId);
    const closedReason = this.closedTargets.get(intent.threadId)?.get(intent.expectedTurnId);
    if (closedReason != null) {
      this.rejectedSteersQueue.push({ intent, reason: closedReason });
      return {
        type: "rejected",
        reason: closedReason,
        messageIds: [intent.messageId],
      };
    }
    this.steerQueue.push(intent);
    return { type: "enqueued", messageId: intent.messageId };
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
    const intent = this.steerQueue.shift();
    if (intent == null) {
      return { type: "empty" };
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
      return {
        type: "responseTurnMismatch",
        messageId: claim.intent.messageId,
        expectedTurnId: claim.intent.expectedTurnId,
        responseTurnId: turnId,
      };
    }
    this.pendingSteers[index] = { claim, phase: "acceptedAwaitingCommit" };
    return { type: "accepted", messageId: claim.intent.messageId };
  }

  private markDeliveryUnknown(claim: SteerClaim): ComposerSteerQueueResult {
    const index = this.findIssuing(claim);
    if (index < 0) {
      return { type: "ownershipMismatch", subject: "steerClaim" };
    }
    this.pendingSteers[index] = { claim, phase: "deliveryUnknown" };
    return { type: "deliveryUnknown", messageId: claim.intent.messageId };
  }

  private rejectTarget(claim: SteerClaim): ComposerSteerQueueResult {
    if (this.findIssuing(claim) < 0) {
      return { type: "ownershipMismatch", subject: "steerClaim" };
    }
    const { threadId, expectedTurnId } = claim.intent;
    const reason = this.closeTarget(threadId, expectedTurnId, "activeTurnNotSteerable");
    const pending = this.removePendingTarget(threadId, expectedTurnId);
    const unsent = this.removeUnsentTarget(threadId, expectedTurnId);
    const intents = [...pending, ...unsent];
    this.rejectedSteersQueue.push(...intents.map((intent): RejectedSteer => ({ intent, reason })));
    return {
      type: "rejected",
      reason,
      messageIds: intents.map(({ messageId }) => messageId),
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
    this.knownMessageIds.delete(recoveredClaim.intent.messageId);
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
    this.knownMessageIds.delete(claim.intent.messageId);
    return { type: "committed", messageId: claim.intent.messageId };
  }

  private terminal(threadId: ThreadIdentity, turnId: TurnIdentity): ComposerSteerQueueResult {
    const reason = this.closeTarget(threadId, turnId, "terminal");
    const pending = this.removePendingTarget(threadId, turnId);
    const unsent = this.removeUnsentTarget(threadId, turnId);
    const intents = [...pending, ...unsent];
    this.rejectedSteersQueue.push(...intents.map((intent): RejectedSteer => ({ intent, reason })));
    return { type: "terminal", messageIds: intents.map(({ messageId }) => messageId) };
  }

  private closeTarget(
    threadId: ThreadIdentity,
    turnId: TurnIdentity,
    reason: RejectedSteer["reason"],
  ): RejectedSteer["reason"] {
    const closedTurns = this.closedTargets.get(threadId) ?? new Map();
    const existingReason = closedTurns.get(turnId);
    if (existingReason != null) {
      return existingReason;
    }
    closedTurns.set(turnId, reason);
    this.closedTargets.set(threadId, closedTurns);
    return reason;
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
        this.pendingSteers.splice(index, 1);
      } else {
        index += 1;
      }
    }
    return removed;
  }

  private removeUnsentTarget(threadId: ThreadIdentity, turnId: TurnIdentity): SteerIntent[] {
    const removed: SteerIntent[] = [];
    for (let index = 0; index < this.steerQueue.length;) {
      const intent = this.steerQueue[index];
      if (intent == null) {
        break;
      }
      if (intent.threadId === threadId && intent.expectedTurnId === turnId) {
        removed.push(intent);
        this.steerQueue.splice(index, 1);
      } else {
        index += 1;
      }
    }
    return removed;
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
    this.rejectedSteersQueue.unshift(...entries);
    return {
      type: "rejectedRestored",
      messageIds: entries.map(({ intent }) => intent.messageId),
    };
  }

  private releaseRejected(transfer: RejectedSteerTransfer): ComposerSteerQueueResult {
    const entries = this.consumeRejectedTransfer(transfer);
    if (entries == null) {
      return { type: "ownershipMismatch", subject: "rejectedTransfer" };
    }
    for (const { intent } of entries) {
      this.knownMessageIds.delete(intent.messageId);
    }
    return {
      type: "rejectedReleased",
      messageIds: entries.map(({ intent }) => intent.messageId),
    };
  }

  private restoreRecovery(transfer: SteerRecoveryTransfer): ComposerSteerQueueResult {
    const token = transfer[steerRecoveryTransferCapability];
    const intents = this.outstandingRecoveryTransfers.get(token);
    if (intents == null) {
      return { type: "ownershipMismatch", subject: "recoveryTransfer" };
    }
    this.outstandingRecoveryTransfers.delete(token);
    for (const intent of intents) {
      this.knownMessageIds.add(intent.messageId);
    }
    this.steerQueue.unshift(...intents);
    return {
      type: "recoveryRestored",
      messageIds: intents.map(({ messageId }) => messageId),
    };
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
