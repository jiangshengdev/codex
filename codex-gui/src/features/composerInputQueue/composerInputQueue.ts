const startClaimCapability: unique symbol = Symbol("StartClaim");

export type ComposerQueueMessage = Readonly<{
  id: string;
  text: string;
}>;

export type StartClaim = Readonly<{
  type: "start";
  message: ComposerQueueMessage;
  [startClaimCapability]: true;
}>;

export type RecoveryBatch = Readonly<{
  reason: "startDefinitelyNotAccepted";
  messages: readonly ComposerQueueMessage[];
}>;

export type ComposerInputQueueResult =
  | Readonly<{ type: "claimIssued" }>
  | Readonly<{ type: "queued"; messageId: string }>
  | Readonly<{ type: "applied"; operation: "startAccepted" }>
  | Readonly<{ type: "deliveryUnknown" }>
  | Readonly<{
      type: "recoveryProduced";
      reason: "startDefinitelyNotAccepted";
      messageIds: readonly string[];
    }>
  | Readonly<{ type: "invalidInput"; reason: "emptyText" }>
  | Readonly<{ type: "duplicateIdentity"; messageId: string }>
  | Readonly<{ type: "idempotentReplay"; subject: "startSettlement" }>
  | Readonly<{ type: "stale"; subject: "startSettlement" }>
  | Readonly<{ type: "ownershipMismatch"; subject: "startClaim" }>;

export type ComposerInputQueueEffect =
  | Readonly<{ type: "performStart"; claim: StartClaim }>
  | Readonly<{ type: "recover"; batch: RecoveryBatch }>;

export type ComposerInputQueueTransition = Readonly<{
  result: ComposerInputQueueResult;
  effects: readonly ComposerInputQueueEffect[];
}>;

export type StartSettlement =
  | Readonly<{ type: "accepted"; claim: StartClaim; turnId: string }>
  | Readonly<{ type: "definitelyNotAccepted"; claim: StartClaim }>
  | Readonly<{ type: "deliveryUnknown"; claim: StartClaim }>;

export type ComposerInputQueue = Readonly<{
  submit(message: ComposerQueueMessage): ComposerInputQueueTransition;
  settleStart(settlement: StartSettlement): ComposerInputQueueTransition;
}>;

export type CreateComposerInputQueueInput = Readonly<{
  activeTurnId: string | null;
}>;

type PendingStart =
  | Readonly<{ phase: "issuing"; claim: StartClaim }>
  | Readonly<{ phase: "acceptedAwaitingStart"; claim: StartClaim; turnId: string }>
  | Readonly<{ phase: "deliveryUnknown"; claim: StartClaim }>;

type SettlementRecord = Readonly<{
  claim: StartClaim;
  type: StartSettlement["type"];
  turnId?: string;
}>;

const noEffects = Object.freeze([]) as readonly ComposerInputQueueEffect[];

function transition(
  result: ComposerInputQueueResult,
  effects: readonly ComposerInputQueueEffect[] = noEffects,
): ComposerInputQueueTransition {
  return Object.freeze({ result: Object.freeze(result), effects: Object.freeze([...effects]) });
}

function ownMessage(message: ComposerQueueMessage): ComposerQueueMessage {
  return Object.freeze({ id: message.id, text: message.text });
}

function settlementRecord(settlement: StartSettlement): SettlementRecord {
  return Object.freeze({
    claim: settlement.claim,
    type: settlement.type,
    ...(settlement.type === "accepted" ? { turnId: settlement.turnId } : {}),
  });
}

function isExactReplay(record: SettlementRecord, settlement: StartSettlement): boolean {
  return (
    record.type === settlement.type &&
    (settlement.type !== "accepted" || record.turnId === settlement.turnId)
  );
}

export function createComposerInputQueue(
  input: CreateComposerInputQueueInput = { activeTurnId: null },
): ComposerInputQueue {
  const ordinary: ComposerQueueMessage[] = [];
  const knownMessageIds = new Set<string>();
  const activeTurnId = input.activeTurnId;
  let pendingStart: PendingStart | null = null;
  let latestSettlement: SettlementRecord | null = null;

  const issueStart = (message: ComposerQueueMessage): ComposerInputQueueEffect => {
    const claim: StartClaim = Object.freeze({
      type: "start",
      message,
      [startClaimCapability]: true as const,
    });
    pendingStart = Object.freeze({ phase: "issuing", claim });
    return Object.freeze({ type: "performStart", claim });
  };

  const drainOrdinary = (): ComposerInputQueueEffect | null => {
    if (activeTurnId != null || pendingStart != null) {
      return null;
    }
    const message = ordinary.shift();
    return message == null ? null : issueStart(message);
  };

  const classifyRecordedSettlement = (
    settlement: StartSettlement,
  ): ComposerInputQueueTransition => {
    if (latestSettlement?.claim !== settlement.claim) {
      return transition({ type: "ownershipMismatch", subject: "startClaim" });
    }
    return transition(
      isExactReplay(latestSettlement, settlement)
        ? { type: "idempotentReplay", subject: "startSettlement" }
        : { type: "stale", subject: "startSettlement" },
    );
  };

  return Object.freeze({
    submit(message: ComposerQueueMessage): ComposerInputQueueTransition {
      if (message.text.trim() === "") {
        return transition({ type: "invalidInput", reason: "emptyText" });
      }
      if (knownMessageIds.has(message.id)) {
        return transition({ type: "duplicateIdentity", messageId: message.id });
      }

      const ownedMessage = ownMessage(message);
      knownMessageIds.add(ownedMessage.id);
      if (activeTurnId == null && pendingStart == null && ordinary.length === 0) {
        return transition({ type: "claimIssued" }, [issueStart(ownedMessage)]);
      }
      ordinary.push(ownedMessage);
      return transition({ type: "queued", messageId: ownedMessage.id });
    },

    settleStart(settlement: StartSettlement): ComposerInputQueueTransition {
      if (pendingStart?.claim !== settlement.claim) {
        return classifyRecordedSettlement(settlement);
      }
      if (pendingStart.phase !== "issuing") {
        return classifyRecordedSettlement(settlement);
      }

      latestSettlement = settlementRecord(settlement);
      switch (settlement.type) {
        case "accepted":
          pendingStart = Object.freeze({
            phase: "acceptedAwaitingStart",
            claim: settlement.claim,
            turnId: settlement.turnId,
          });
          return transition({ type: "applied", operation: "startAccepted" });
        case "deliveryUnknown":
          pendingStart = Object.freeze({ phase: "deliveryUnknown", claim: settlement.claim });
          return transition({ type: "deliveryUnknown" });
        case "definitelyNotAccepted": {
          pendingStart = null;
          const recoveredMessage = settlement.claim.message;
          knownMessageIds.delete(recoveredMessage.id);
          const batch: RecoveryBatch = Object.freeze({
            reason: "startDefinitelyNotAccepted",
            messages: Object.freeze([recoveredMessage]),
          });
          const effects: ComposerInputQueueEffect[] = [Object.freeze({ type: "recover", batch })];
          const nextStart = drainOrdinary();
          if (nextStart != null) {
            effects.push(nextStart);
          }
          return transition(
            {
              type: "recoveryProduced",
              reason: "startDefinitelyNotAccepted",
              messageIds: Object.freeze([recoveredMessage.id]),
            },
            effects,
          );
        }
      }
    },
  });
}
