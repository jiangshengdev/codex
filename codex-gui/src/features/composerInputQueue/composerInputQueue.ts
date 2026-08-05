const startClaimCapability: unique symbol = Symbol("StartClaim");

export type ComposerQueueMessage = Readonly<{
  id: string;
  text: string;
}>;

export type StartClaim = Readonly<{
  type: "start";
  messages: readonly ComposerQueueMessage[];
  [startClaimCapability]: true;
}>;

export type RecoveryBatch = Readonly<{
  reason: "startDefinitelyNotAccepted";
  messages: readonly ComposerQueueMessage[];
}>;

export type ComposerInputQueueEffect =
  | Readonly<{ type: "performStart"; claim: StartClaim }>
  | Readonly<{ type: "recover"; batch: RecoveryBatch }>;

export type ComposerInputQueueResult =
  | Readonly<{ type: "claimIssued"; claimType: "start" }>
  | Readonly<{ type: "queued"; messageId: string }>
  | Readonly<{
      type: "applied";
      operation: "observationRecorded" | "startAccepted" | "turnStarted" | "turnTerminal";
    }>
  | Readonly<{
      type: "recoveryProduced";
      reason: "startDefinitelyNotAccepted";
      messageIds: readonly string[];
    }>
  | Readonly<{ type: "deliveryUnknown"; claimType: "start" }>
  | Readonly<{ type: "invalidInput"; reason: "emptyText" }>
  | Readonly<{ type: "duplicateIdentity"; messageId: string }>
  | Readonly<{
      type: "idempotentReplay";
      subject: "startSettlement" | "runtimeObservation";
    }>
  | Readonly<{
      type: "stale";
      subject: "startSettlement" | "runtimeObservation";
    }>
  | Readonly<{
      type: "ownershipMismatch";
      subject: "startClaim" | "runtimeTurn";
    }>;

export type ComposerInputQueueTransition = Readonly<{
  result: ComposerInputQueueResult;
  effects: readonly ComposerInputQueueEffect[];
}>;

export type ComposerInputQueueView = Readonly<{
  ordinary: readonly ComposerQueueMessage[];
  hasPendingStart: boolean;
  hasDeliveryUnknown: boolean;
}>;

export type SubmitInput = Readonly<{
  intent: "queue";
  message: ComposerQueueMessage;
}>;

export type StartClaimSettlement =
  | Readonly<{ type: "startAccepted"; claim: StartClaim; turnId: string }>
  | Readonly<{ type: "startDefinitelyNotAccepted"; claim: StartClaim }>
  | Readonly<{ type: "startDeliveryUnknown"; claim: StartClaim }>;

export type RuntimeObservation =
  | Readonly<{ type: "turnStarted"; turnId: string }>
  | Readonly<{ type: "turnTerminal"; turnId: string }>;

export type ComposerInputQueue = {
  submit(input: SubmitInput): ComposerInputQueueTransition;
  settle(settlement: StartClaimSettlement): ComposerInputQueueTransition;
  observe(observation: RuntimeObservation): ComposerInputQueueTransition;
  view(): ComposerInputQueueView;
};

export type CreateComposerInputQueueInput = Readonly<{
  activeTurnId: string | null;
}>;

type StartSettlementRecord =
  | Readonly<{ type: "startAccepted"; turnId: string }>
  | Readonly<{ type: "startDefinitelyNotAccepted" }>
  | Readonly<{ type: "startDeliveryUnknown" }>;

type PendingStart =
  | Readonly<{ phase: "issuing"; claim: StartClaim }>
  | Readonly<{
      phase: "acceptedAwaitingStart";
      claim: StartClaim;
      turnId: string;
    }>
  | Readonly<{ phase: "deliveryUnknown"; claim: StartClaim }>;

type RuntimeFact = Readonly<{
  type: "turnStarted" | "turnTerminal";
  turnId: string;
}>;

type PendingRuntimeFact = Readonly<{
  claim: StartClaim;
  fact: RuntimeFact;
}>;

const noEffects = Object.freeze([]) as readonly ComposerInputQueueEffect[];

function transition(
  result: ComposerInputQueueResult,
  effects: readonly ComposerInputQueueEffect[] = noEffects,
): ComposerInputQueueTransition {
  return Object.freeze({ result: Object.freeze(result), effects: Object.freeze([...effects]) });
}

function immutableMessage(message: ComposerQueueMessage): ComposerQueueMessage {
  return Object.freeze({ id: message.id, text: message.text });
}

function settlementRecord(settlement: StartClaimSettlement): StartSettlementRecord {
  switch (settlement.type) {
    case "startAccepted":
      return Object.freeze({ type: settlement.type, turnId: settlement.turnId });
    case "startDefinitelyNotAccepted":
    case "startDeliveryUnknown":
      return Object.freeze({ type: settlement.type });
  }
}

function isExactSettlementReplay(
  record: StartSettlementRecord,
  settlement: StartClaimSettlement,
): boolean {
  if (record.type !== settlement.type) {
    return false;
  }
  if (record.type === "startAccepted" && settlement.type === "startAccepted") {
    return record.turnId === settlement.turnId;
  }
  return true;
}

export function createComposerInputQueue(
  input: CreateComposerInputQueueInput = { activeTurnId: null },
): ComposerInputQueue {
  const ordinary: ComposerQueueMessage[] = [];
  const knownMessageIds = new Set<string>();
  const settledClaims = new WeakMap<StartClaim, StartSettlementRecord>();
  let activeTurnId = input.activeTurnId;
  let pendingStart: PendingStart | null = null;
  let pendingRuntimeFact: PendingRuntimeFact | null = null;
  let latestRuntimeFact: RuntimeFact | null = null;

  const issueStartClaim = (
    message: ComposerQueueMessage,
  ): Readonly<{ result: ComposerInputQueueResult; effect: ComposerInputQueueEffect }> => {
    const messages = Object.freeze([message]);
    const claim: StartClaim = Object.freeze({
      type: "start",
      messages,
      [startClaimCapability]: true as const,
    });
    pendingStart = Object.freeze({ phase: "issuing", claim });
    return Object.freeze({
      result: Object.freeze({ type: "claimIssued", claimType: "start" }),
      effect: Object.freeze({ type: "performStart", claim }),
    });
  };

  const drainOrdinary = (): ComposerInputQueueEffect | null => {
    if (activeTurnId != null || pendingStart != null) {
      return null;
    }
    const message = ordinary.shift();
    return message == null ? null : issueStartClaim(message).effect;
  };

  const classifyNonCurrentSettlement = (
    settlement: StartClaimSettlement,
  ): ComposerInputQueueTransition => {
    const record = settledClaims.get(settlement.claim);
    if (record == null) {
      return transition({ type: "ownershipMismatch", subject: "startClaim" });
    }
    return transition(
      isExactSettlementReplay(record, settlement)
        ? { type: "idempotentReplay", subject: "startSettlement" }
        : { type: "stale", subject: "startSettlement" },
    );
  };

  const releaseClaimMessageIds = (claim: StartClaim): void => {
    for (const message of claim.messages) {
      knownMessageIds.delete(message.id);
    }
  };

  const rememberPendingRuntimeFact = (
    claim: StartClaim,
    observation: RuntimeObservation,
  ): ComposerInputQueueTransition => {
    if (
      pendingRuntimeFact?.claim === claim &&
      pendingRuntimeFact.fact.type === observation.type &&
      pendingRuntimeFact.fact.turnId === observation.turnId
    ) {
      return transition({ type: "idempotentReplay", subject: "runtimeObservation" });
    }
    if (
      pendingRuntimeFact?.claim === claim &&
      pendingRuntimeFact.fact.turnId !== observation.turnId
    ) {
      return transition({ type: "ownershipMismatch", subject: "runtimeTurn" });
    }
    if (
      pendingRuntimeFact?.claim === claim &&
      pendingRuntimeFact.fact.type === "turnTerminal" &&
      pendingRuntimeFact.fact.turnId === observation.turnId &&
      observation.type === "turnStarted"
    ) {
      return transition({ type: "stale", subject: "runtimeObservation" });
    }
    pendingRuntimeFact = Object.freeze({
      claim,
      fact: Object.freeze({ type: observation.type, turnId: observation.turnId }),
    });
    return transition({ type: "applied", operation: "observationRecorded" });
  };

  return Object.freeze({
    submit({ message }: SubmitInput): ComposerInputQueueTransition {
      if (message.text.trim() === "") {
        return transition({ type: "invalidInput", reason: "emptyText" });
      }
      if (knownMessageIds.has(message.id)) {
        return transition({ type: "duplicateIdentity", messageId: message.id });
      }

      const ownedMessage = immutableMessage(message);
      knownMessageIds.add(ownedMessage.id);
      if (activeTurnId == null && pendingStart == null && ordinary.length === 0) {
        const issued = issueStartClaim(ownedMessage);
        return transition(issued.result, [issued.effect]);
      }

      ordinary.push(ownedMessage);
      return transition({ type: "queued", messageId: ownedMessage.id });
    },

    settle(settlement: StartClaimSettlement): ComposerInputQueueTransition {
      if (pendingStart?.claim !== settlement.claim) {
        return classifyNonCurrentSettlement(settlement);
      }

      if (pendingStart.phase !== "issuing") {
        const record = settledClaims.get(settlement.claim);
        return transition(
          record != null && isExactSettlementReplay(record, settlement)
            ? { type: "idempotentReplay", subject: "startSettlement" }
            : { type: "stale", subject: "startSettlement" },
        );
      }

      const record = settlementRecord(settlement);
      settledClaims.set(settlement.claim, record);
      switch (settlement.type) {
        case "startAccepted": {
          const matchingFact =
            pendingRuntimeFact?.claim === settlement.claim &&
            pendingRuntimeFact.fact.turnId === settlement.turnId
              ? pendingRuntimeFact.fact
              : null;
          if (matchingFact != null) {
            pendingStart = null;
            pendingRuntimeFact = null;
            latestRuntimeFact = matchingFact;
            releaseClaimMessageIds(settlement.claim);
            if (matchingFact.type === "turnStarted") {
              activeTurnId = matchingFact.turnId;
              return transition({ type: "applied", operation: "startAccepted" });
            }
            activeTurnId = null;
            const nextStart = drainOrdinary();
            return transition(
              { type: "applied", operation: "startAccepted" },
              nextStart == null ? noEffects : [nextStart],
            );
          }
          pendingStart = Object.freeze({
            phase: "acceptedAwaitingStart",
            claim: settlement.claim,
            turnId: settlement.turnId,
          });
          return transition({ type: "applied", operation: "startAccepted" });
        }
        case "startDeliveryUnknown":
          pendingStart = Object.freeze({
            phase: "deliveryUnknown",
            claim: settlement.claim,
          });
          return transition({ type: "deliveryUnknown", claimType: "start" });
        case "startDefinitelyNotAccepted": {
          pendingStart = null;
          pendingRuntimeFact = null;
          const messages = settlement.claim.messages;
          const batch: RecoveryBatch = Object.freeze({
            reason: "startDefinitelyNotAccepted",
            messages,
          });
          releaseClaimMessageIds(settlement.claim);
          const effects: ComposerInputQueueEffect[] = [Object.freeze({ type: "recover", batch })];
          const nextStart = drainOrdinary();
          if (nextStart != null) {
            effects.push(nextStart);
          }
          return transition(
            {
              type: "recoveryProduced",
              reason: "startDefinitelyNotAccepted",
              messageIds: Object.freeze(messages.map(({ id }) => id)),
            },
            effects,
          );
        }
      }
    },

    observe(observation: RuntimeObservation): ComposerInputQueueTransition {
      switch (observation.type) {
        case "turnStarted": {
          if (
            latestRuntimeFact?.type === "turnTerminal" &&
            latestRuntimeFact.turnId === observation.turnId
          ) {
            return transition({ type: "stale", subject: "runtimeObservation" });
          }
          if (pendingStart?.phase === "issuing" || pendingStart?.phase === "deliveryUnknown") {
            return rememberPendingRuntimeFact(pendingStart.claim, observation);
          }
          if (pendingStart?.phase === "acceptedAwaitingStart") {
            if (pendingStart.turnId !== observation.turnId) {
              return transition({ type: "ownershipMismatch", subject: "runtimeTurn" });
            }
            const claim = pendingStart.claim;
            pendingStart = null;
            pendingRuntimeFact = null;
            activeTurnId = observation.turnId;
            latestRuntimeFact = Object.freeze({
              type: observation.type,
              turnId: observation.turnId,
            });
            releaseClaimMessageIds(claim);
            return transition({ type: "applied", operation: "turnStarted" });
          }
          if (activeTurnId === observation.turnId) {
            return transition({ type: "idempotentReplay", subject: "runtimeObservation" });
          }
          if (activeTurnId != null) {
            return transition({ type: "ownershipMismatch", subject: "runtimeTurn" });
          }
          activeTurnId = observation.turnId;
          latestRuntimeFact = Object.freeze({
            type: observation.type,
            turnId: observation.turnId,
          });
          return transition({ type: "applied", operation: "turnStarted" });
        }
        case "turnTerminal": {
          if (
            latestRuntimeFact?.type === observation.type &&
            latestRuntimeFact.turnId === observation.turnId
          ) {
            return transition({ type: "idempotentReplay", subject: "runtimeObservation" });
          }
          if (pendingStart?.phase === "issuing" || pendingStart?.phase === "deliveryUnknown") {
            return rememberPendingRuntimeFact(pendingStart.claim, observation);
          }

          if (
            !(
              pendingStart?.phase === "acceptedAwaitingStart" &&
              pendingStart.turnId === observation.turnId
            ) &&
            activeTurnId !== observation.turnId
          ) {
            if (pendingStart?.phase === "acceptedAwaitingStart" || activeTurnId != null) {
              return transition({ type: "ownershipMismatch", subject: "runtimeTurn" });
            }
            return transition({ type: "stale", subject: "runtimeObservation" });
          }

          if (
            pendingStart?.phase === "acceptedAwaitingStart" &&
            pendingStart.turnId === observation.turnId
          ) {
            const claim = pendingStart.claim;
            pendingStart = null;
            pendingRuntimeFact = null;
            releaseClaimMessageIds(claim);
          }
          if (activeTurnId === observation.turnId) {
            activeTurnId = null;
          }
          latestRuntimeFact = Object.freeze({
            type: observation.type,
            turnId: observation.turnId,
          });
          const nextStart = drainOrdinary();
          return transition(
            { type: "applied", operation: "turnTerminal" },
            nextStart == null ? noEffects : [nextStart],
          );
        }
      }
    },

    view(): ComposerInputQueueView {
      return Object.freeze({
        ordinary: Object.freeze(ordinary.map(immutableMessage)),
        hasPendingStart: pendingStart != null,
        hasDeliveryUnknown: pendingStart?.phase === "deliveryUnknown",
      });
    },
  });
}
