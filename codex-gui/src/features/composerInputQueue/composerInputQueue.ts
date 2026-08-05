import type { ThreadRuntimeLiveTurnCompletion } from "@/features/threadRuntime/threadRuntimeSlice";

const startClaimCapability: unique symbol = Symbol("StartClaim");
const steerClaimCapability: unique symbol = Symbol("SteerClaim");
const steerAttemptCapability: unique symbol = Symbol("SteerAttempt");

export type ComposerQueueMessage = Readonly<{
  id: string;
  text: string;
}>;

export type StartClaim = Readonly<{
  type: "start";
  messages: readonly ComposerQueueMessage[];
  [startClaimCapability]: true;
}>;

export type SteerClaim = Readonly<{
  type: "steer";
  message: ComposerQueueMessage;
  [steerClaimCapability]: true;
}>;

export type SteerAttempt = Readonly<{
  claim: SteerClaim;
  turnId: string;
  sequence: number;
  [steerAttemptCapability]: true;
}>;

export type RecoveryBatch = Readonly<{
  reason:
    | "interrupted"
    | "startDefinitelyNotAccepted"
    | "steerDefinitelyNotAccepted"
    | "steerRetryExhausted";
  messages: readonly ComposerQueueMessage[];
}>;

export type ComposerInputQueueEffect =
  | Readonly<{ type: "performStart"; claim: StartClaim }>
  | Readonly<{ type: "performSteer"; attempt: SteerAttempt }>
  | Readonly<{ type: "recover"; batch: RecoveryBatch }>;

export type ComposerInputQueueResult =
  | Readonly<{ type: "claimIssued"; claimType: "start" | "steer" }>
  | Readonly<{ type: "queued"; messageId: string }>
  | Readonly<{
      type: "applied";
      operation:
        | "observationRecorded"
        | "startAccepted"
        | "steerAccepted"
        | "steerRetryIssued"
        | "turnStarted"
        | "turnCompleted"
        | "userMessageCommitted";
    }>
  | Readonly<{
      type: "recoveryProduced";
      reason:
        | "interrupted"
        | "startDefinitelyNotAccepted"
        | "steerDefinitelyNotAccepted"
        | "steerRetryExhausted";
      messageIds: readonly string[];
    }>
  | Readonly<{ type: "deliveryUnknown"; claimType: "start" | "steer" }>
  | Readonly<{ type: "rejected"; reason: "noActive" | "nonSteerable" }>
  | Readonly<{ type: "invalidInput"; reason: "emptyText" }>
  | Readonly<{ type: "duplicateIdentity"; messageId: string }>
  | Readonly<{
      type: "idempotentReplay";
      subject: "runtimeCommit" | "startSettlement" | "steerSettlement" | "runtimeObservation";
    }>
  | Readonly<{
      type: "stale";
      subject: "runtimeCommit" | "startSettlement" | "steerSettlement" | "runtimeObservation";
    }>
  | Readonly<{
      type: "ownershipMismatch";
      subject: "startClaim" | "steerClaim" | "runtimeCommit" | "runtimeTurn";
    }>;

export type ComposerInputQueueTransition = Readonly<{
  result: ComposerInputQueueResult;
  effects: readonly ComposerInputQueueEffect[];
}>;

export type ComposerInputQueueView = Readonly<{
  ordinary: readonly ComposerQueueMessage[];
  hasPendingStart: boolean;
  pendingSteerCount: number;
  rejectedSteerCount: number;
  hasDeliveryUnknown: boolean;
}>;

export type SubmitInput =
  | Readonly<{ intent: "queue"; message: ComposerQueueMessage }>
  | Readonly<{ intent: "steer"; message: ComposerQueueMessage }>;

export type StartClaimSettlement =
  | Readonly<{ type: "startAccepted"; claim: StartClaim; turnId: string }>
  | Readonly<{ type: "startDefinitelyNotAccepted"; claim: StartClaim }>
  | Readonly<{ type: "startDeliveryUnknown"; claim: StartClaim }>;

export type SteerClaimSettlement =
  | Readonly<{ type: "steerAccepted"; attempt: SteerAttempt }>
  | Readonly<{ type: "steerNonSteerable"; attempt: SteerAttempt }>
  | Readonly<{ type: "steerNoActive"; attempt: SteerAttempt }>
  | Readonly<{
      type: "steerExpectedTurnMismatch";
      attempt: SteerAttempt;
      actualTurnId: string;
    }>
  | Readonly<{ type: "steerDefinitelyNotAccepted"; attempt: SteerAttempt }>
  | Readonly<{ type: "steerDeliveryUnknown"; attempt: SteerAttempt }>;

export type RuntimeObservation =
  | Readonly<{ type: "turnStarted"; turnId: string }>
  | Readonly<{ type: "turnCompleted"; completion: ThreadRuntimeLiveTurnCompletion }>
  | Readonly<{
      type: "userMessageCommitted";
      clientId: string;
      turnId: string;
      commitId: string;
    }>;

export type ComposerInputQueue = {
  submit(input: SubmitInput): ComposerInputQueueTransition;
  settle(settlement: StartClaimSettlement | SteerClaimSettlement): ComposerInputQueueTransition;
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

type RuntimeFact =
  | Readonly<{ type: "turnStarted"; turnId: string }>
  | Readonly<{ type: "turnCompleted"; completion: ThreadRuntimeLiveTurnCompletion }>;

type PendingRuntimeFact = Readonly<{
  claim: StartClaim;
  fact: RuntimeFact;
}>;

type PendingSteer = {
  readonly claim: SteerClaim;
  attempt: SteerAttempt;
  readonly order: number;
  phase: "accepted" | "deliveryUnknown" | "issuing";
  turnId: string;
  retryUsed: boolean;
  committedFact?: Readonly<{ clientId: string; turnId: string; commitId: string }>;
};

type SteerSettlementRecord = Readonly<{
  type: SteerClaimSettlement["type"];
  actualTurnId?: string;
}>;

type RejectedSteer = Readonly<{
  message: ComposerQueueMessage;
  order: number;
  turnId: string;
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

function isStartSettlement(
  settlement: StartClaimSettlement | SteerClaimSettlement,
): settlement is StartClaimSettlement {
  switch (settlement.type) {
    case "startAccepted":
    case "startDefinitelyNotAccepted":
    case "startDeliveryUnknown":
      return true;
    case "steerAccepted":
    case "steerDefinitelyNotAccepted":
    case "steerDeliveryUnknown":
    case "steerExpectedTurnMismatch":
    case "steerNoActive":
    case "steerNonSteerable":
      return false;
  }
}

function runtimeFactTurnId(fact: RuntimeFact): string {
  return fact.type === "turnStarted" ? fact.turnId : fact.completion.turnId;
}

export function createComposerInputQueue(
  input: CreateComposerInputQueueInput = { activeTurnId: null },
): ComposerInputQueue {
  const ordinary: ComposerQueueMessage[] = [];
  const rejectedSteers: RejectedSteer[] = [];
  const pendingSteers: PendingSteer[] = [];
  const knownMessageIds = new Set<string>();
  const settledClaims = new WeakMap<StartClaim, StartSettlementRecord>();
  const settledSteerAttempts = new WeakMap<SteerAttempt, SteerSettlementRecord>();
  const retiredSteerClaims = new WeakSet<SteerClaim>();
  let nextSteerOrder = 0;
  let activeTurnId = input.activeTurnId;
  let pendingStart: PendingStart | null = null;
  let pendingRuntimeFact: PendingRuntimeFact | null = null;
  let pendingStartCommittedFact: Readonly<{
    claim: StartClaim;
    clientId: string;
    turnId: string;
    commitId: string;
  }> | null = null;
  let latestRuntimeFact: RuntimeFact | null = null;
  let latestCommittedFact: Readonly<{ clientId: string; turnId: string; commitId: string }> | null =
    null;

  const issueStartClaim = (
    messagesInput: readonly ComposerQueueMessage[],
  ): Readonly<{ result: ComposerInputQueueResult; effect: ComposerInputQueueEffect }> => {
    const messages = Object.freeze([...messagesInput]);
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
    if (rejectedSteers.length > 0) {
      const earliestPendingOrder = pendingSteers.reduce(
        (earliest, { order }) => Math.min(earliest, order),
        Number.POSITIVE_INFINITY,
      );
      const eligibleCount = rejectedSteers.findIndex(({ order }) => order >= earliestPendingOrder);
      const count = eligibleCount < 0 ? rejectedSteers.length : eligibleCount;
      if (count === 0) {
        return null;
      }
      return issueStartClaim(rejectedSteers.splice(0, count).map(({ message }) => message)).effect;
    }
    if (pendingSteers.length > 0) {
      return null;
    }
    const message = ordinary.shift();
    return message == null ? null : issueStartClaim([message]).effect;
  };

  const issueSteerClaim = (
    message: ComposerQueueMessage,
    turnId: string,
  ): Readonly<{ result: ComposerInputQueueResult; effect: ComposerInputQueueEffect }> => {
    const claim: SteerClaim = Object.freeze({
      type: "steer",
      message,
      [steerClaimCapability]: true as const,
    });
    const attempt: SteerAttempt = Object.freeze({
      claim,
      turnId,
      sequence: 0,
      [steerAttemptCapability]: true as const,
    });
    pendingSteers.push({
      claim,
      attempt,
      order: nextSteerOrder,
      phase: "issuing",
      turnId,
      retryUsed: false,
    });
    nextSteerOrder += 1;
    return Object.freeze({
      result: Object.freeze({ type: "claimIssued", claimType: "steer" }),
      effect: Object.freeze({ type: "performSteer", attempt }),
    });
  };

  const enqueueRejected = (pending: PendingSteer): void => {
    rejectedSteers.push({
      message: pending.claim.message,
      order: pending.order,
      turnId: pending.turnId,
    });
    rejectedSteers.sort((left, right) => left.order - right.order);
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

  const releaseMessages = (messages: readonly ComposerQueueMessage[]): void => {
    for (const message of messages) {
      knownMessageIds.delete(message.id);
    }
  };

  const rememberPendingRuntimeFact = (
    claim: StartClaim,
    fact: RuntimeFact,
  ): ComposerInputQueueTransition => {
    const turnId = runtimeFactTurnId(fact);
    if (
      pendingRuntimeFact?.claim === claim &&
      pendingRuntimeFact.fact.type === fact.type &&
      (pendingRuntimeFact.fact.type === "turnStarted"
        ? pendingRuntimeFact.fact.turnId === turnId
        : pendingRuntimeFact.fact.completion.commitId ===
          (fact.type === "turnCompleted" ? fact.completion.commitId : ""))
    ) {
      return transition({ type: "idempotentReplay", subject: "runtimeObservation" });
    }
    if (
      pendingRuntimeFact?.claim === claim &&
      (pendingRuntimeFact.fact.type === "turnStarted"
        ? pendingRuntimeFact.fact.turnId
        : pendingRuntimeFact.fact.completion.turnId) !== turnId
    ) {
      return transition({ type: "ownershipMismatch", subject: "runtimeTurn" });
    }
    if (
      pendingRuntimeFact?.claim === claim &&
      pendingRuntimeFact.fact.type === "turnCompleted" &&
      pendingRuntimeFact.fact.completion.turnId === turnId &&
      fact.type === "turnStarted"
    ) {
      return transition({ type: "stale", subject: "runtimeObservation" });
    }
    pendingRuntimeFact = Object.freeze({
      claim,
      fact: Object.freeze(fact),
    });
    return transition({ type: "applied", operation: "observationRecorded" });
  };

  const settleSteer = (settlement: SteerClaimSettlement): ComposerInputQueueTransition => {
    const { attempt } = settlement;
    const previous = settledSteerAttempts.get(attempt);
    if (previous != null) {
      const exactReplay =
        previous.type === settlement.type &&
        (settlement.type !== "steerExpectedTurnMismatch" ||
          previous.actualTurnId === settlement.actualTurnId);
      return transition(
        exactReplay
          ? { type: "idempotentReplay", subject: "steerSettlement" }
          : { type: "stale", subject: "steerSettlement" },
      );
    }

    const index = pendingSteers.findIndex(({ claim }) => claim === attempt.claim);
    if (index < 0) {
      return transition(
        retiredSteerClaims.has(attempt.claim)
          ? { type: "stale", subject: "steerSettlement" }
          : { type: "ownershipMismatch", subject: "steerClaim" },
      );
    }

    const pending = pendingSteers[index];
    if (pending?.attempt !== attempt) {
      return transition({ type: "stale", subject: "steerSettlement" });
    }
    if (pending.phase !== "issuing") {
      return transition({ type: "stale", subject: "steerSettlement" });
    }

    settledSteerAttempts.set(
      attempt,
      Object.freeze({
        type: settlement.type,
        ...(settlement.type === "steerExpectedTurnMismatch"
          ? { actualTurnId: settlement.actualTurnId }
          : {}),
      }),
    );
    switch (settlement.type) {
      case "steerAccepted":
        if (pending.committedFact != null) {
          pendingSteers.splice(index, 1);
          latestCommittedFact = pending.committedFact;
          releaseMessages([pending.claim.message]);
          return transition({ type: "applied", operation: "steerAccepted" });
        }
        pending.phase = "accepted";
        return transition({ type: "applied", operation: "steerAccepted" });
      case "steerDeliveryUnknown":
        if (pending.committedFact != null) {
          pendingSteers.splice(index, 1);
          latestCommittedFact = pending.committedFact;
          releaseMessages([pending.claim.message]);
          return transition({ type: "applied", operation: "userMessageCommitted" });
        }
        pending.phase = "deliveryUnknown";
        return transition({ type: "deliveryUnknown", claimType: "steer" });
      case "steerExpectedTurnMismatch":
        if (pending.retryUsed) {
          pendingSteers.splice(index, 1);
          retiredSteerClaims.add(pending.claim);
          releaseMessages([pending.claim.message]);
          const batch: RecoveryBatch = Object.freeze({
            reason: "steerRetryExhausted",
            messages: Object.freeze([pending.claim.message]),
          });
          return transition(
            {
              type: "recoveryProduced",
              reason: batch.reason,
              messageIds: Object.freeze([pending.claim.message.id]),
            },
            [Object.freeze({ type: "recover", batch })],
          );
        }
        pending.retryUsed = true;
        pending.turnId = settlement.actualTurnId;
        activeTurnId = settlement.actualTurnId;
        pending.attempt = Object.freeze({
          claim: pending.claim,
          turnId: settlement.actualTurnId,
          sequence: attempt.sequence + 1,
          [steerAttemptCapability]: true as const,
        });
        return transition({ type: "applied", operation: "steerRetryIssued" }, [
          Object.freeze({ type: "performSteer", attempt: pending.attempt }),
        ]);
      case "steerNonSteerable": {
        pendingSteers.splice(index, 1);
        enqueueRejected(pending);
        const nextStart = activeTurnId == null ? drainOrdinary() : null;
        return transition(
          { type: "rejected", reason: "nonSteerable" },
          nextStart == null ? noEffects : [nextStart],
        );
      }
      case "steerNoActive": {
        pendingSteers.splice(index, 1);
        activeTurnId = null;
        enqueueRejected(pending);
        const nextStart = drainOrdinary();
        return transition(
          { type: "rejected", reason: "noActive" },
          nextStart == null ? noEffects : [nextStart],
        );
      }
      case "steerDefinitelyNotAccepted": {
        pendingSteers.splice(index, 1);
        releaseMessages([pending.claim.message]);
        const batch: RecoveryBatch = Object.freeze({
          reason: "steerDefinitelyNotAccepted",
          messages: Object.freeze([pending.claim.message]),
        });
        const nextStart = activeTurnId == null ? drainOrdinary() : null;
        return transition(
          {
            type: "recoveryProduced",
            reason: batch.reason,
            messageIds: Object.freeze([pending.claim.message.id]),
          },
          [Object.freeze({ type: "recover", batch }), ...(nextStart == null ? [] : [nextStart])],
        );
      }
    }
  };

  const applyCompletion = (
    completion: ThreadRuntimeLiveTurnCompletion,
    options: Readonly<{ releasedPendingStart: boolean }> = { releasedPendingStart: false },
  ): ComposerInputQueueTransition => {
    const wasActive = activeTurnId === completion.turnId;
    const matchesPendingStart =
      pendingStart?.phase === "acceptedAwaitingStart" && pendingStart.turnId === completion.turnId;
    const unblocksDrain = wasActive || matchesPendingStart || options.releasedPendingStart;
    if (
      pendingStart?.phase === "acceptedAwaitingStart" &&
      pendingStart.turnId === completion.turnId
    ) {
      const claim = pendingStart.claim;
      pendingStart = null;
      pendingRuntimeFact = null;
      releaseClaimMessageIds(claim);
    }
    if (wasActive) {
      activeTurnId = null;
    }
    latestRuntimeFact = Object.freeze({ type: "turnCompleted", completion });

    if (completion.status === "interrupted") {
      const recoveryRejected = rejectedSteers.filter(
        ({ turnId }) => unblocksDrain || turnId === completion.turnId,
      );
      const recoveryPending = pendingSteers.filter(
        ({ committedFact, turnId }) =>
          committedFact == null && (unblocksDrain || turnId === completion.turnId),
      );
      const messages = Object.freeze([
        ...recoveryRejected.map(({ message }) => message),
        ...recoveryPending.map(({ claim }) => claim.message),
        ...(unblocksDrain ? ordinary : []),
      ]);
      for (const pending of recoveryPending) {
        retiredSteerClaims.add(pending.claim);
      }
      for (const pending of pendingSteers.filter(
        ({ committedFact, turnId }) =>
          committedFact != null && (unblocksDrain || turnId === completion.turnId),
      )) {
        latestCommittedFact = pending.committedFact ?? latestCommittedFact;
        releaseMessages([pending.claim.message]);
        retiredSteerClaims.add(pending.claim);
      }
      rejectedSteers.splice(
        0,
        rejectedSteers.length,
        ...rejectedSteers.filter(({ turnId }) => !unblocksDrain && turnId !== completion.turnId),
      );
      pendingSteers.splice(
        0,
        pendingSteers.length,
        ...pendingSteers.filter(({ turnId }) => !unblocksDrain && turnId !== completion.turnId),
      );
      if (unblocksDrain) {
        ordinary.splice(0);
      }
      releaseMessages(messages);
      if (messages.length === 0) {
        return transition({ type: "applied", operation: "turnCompleted" });
      }
      const batch: RecoveryBatch = Object.freeze({ reason: "interrupted", messages });
      return transition(
        {
          type: "recoveryProduced",
          reason: "interrupted",
          messageIds: Object.freeze(messages.map(({ id }) => id)),
        },
        [Object.freeze({ type: "recover", batch })],
      );
    }

    const completedPending = pendingSteers.filter(({ turnId }) => turnId === completion.turnId);
    for (const pending of completedPending) {
      const index = pendingSteers.indexOf(pending);
      pendingSteers.splice(index, 1);
      retiredSteerClaims.add(pending.claim);
      if (pending.committedFact != null) {
        latestCommittedFact = pending.committedFact;
        releaseMessages([pending.claim.message]);
      } else {
        enqueueRejected(pending);
      }
    }
    const nextStart = unblocksDrain ? drainOrdinary() : null;
    return transition(
      { type: "applied", operation: "turnCompleted" },
      nextStart == null ? noEffects : [nextStart],
    );
  };

  const observeCommittedMessage = (
    observation: Extract<RuntimeObservation, { type: "userMessageCommitted" }>,
  ) => {
    if (latestCommittedFact?.commitId === observation.commitId) {
      return transition(
        latestCommittedFact.clientId === observation.clientId &&
          latestCommittedFact.turnId === observation.turnId
          ? { type: "idempotentReplay", subject: "runtimeCommit" }
          : { type: "ownershipMismatch", subject: "runtimeCommit" },
      );
    }

    if (
      pendingStart != null &&
      pendingStart.claim.messages.some(({ id }) => id === observation.clientId) &&
      pendingRuntimeFact?.claim === pendingStart.claim &&
      runtimeFactTurnId(pendingRuntimeFact.fact) !== observation.turnId
    ) {
      return transition({ type: "ownershipMismatch", subject: "runtimeCommit" });
    }

    const steerIndex = pendingSteers.findIndex(
      ({ claim }) => claim.message.id === observation.clientId,
    );
    if (steerIndex >= 0) {
      const pending = pendingSteers[steerIndex];
      if (pending == null) {
        return transition({ type: "stale", subject: "runtimeCommit" });
      }
      if (pending.turnId !== observation.turnId) {
        return transition({ type: "ownershipMismatch", subject: "runtimeCommit" });
      }
      const fact = Object.freeze({
        clientId: observation.clientId,
        turnId: observation.turnId,
        commitId: observation.commitId,
      });
      if (pending.phase === "issuing") {
        pending.committedFact = fact;
        return transition({ type: "applied", operation: "observationRecorded" });
      }
      pendingSteers.splice(steerIndex, 1);
      latestCommittedFact = fact;
      releaseMessages([pending.claim.message]);
      const nextStart = activeTurnId == null ? drainOrdinary() : null;
      return transition(
        { type: "applied", operation: "userMessageCommitted" },
        nextStart == null ? noEffects : [nextStart],
      );
    }

    if (
      pendingStart?.phase === "deliveryUnknown" &&
      pendingStart.claim.messages.some(({ id }) => id === observation.clientId)
    ) {
      const claim = pendingStart.claim;
      const matchingFact = pendingRuntimeFact?.claim === claim ? pendingRuntimeFact.fact : null;
      pendingStart = null;
      pendingRuntimeFact = null;
      latestCommittedFact = Object.freeze({
        clientId: observation.clientId,
        turnId: observation.turnId,
        commitId: observation.commitId,
      });
      releaseClaimMessageIds(claim);
      if (matchingFact?.type === "turnCompleted") {
        return applyCompletion(matchingFact.completion, { releasedPendingStart: true });
      }
      activeTurnId =
        matchingFact?.type === "turnStarted" ? matchingFact.turnId : observation.turnId;
      if (matchingFact?.type === "turnStarted") {
        latestRuntimeFact = matchingFact;
      }
      return transition({ type: "applied", operation: "userMessageCommitted" });
    }

    if (
      pendingStart?.phase === "issuing" &&
      pendingStart.claim.messages.some(({ id }) => id === observation.clientId)
    ) {
      pendingStartCommittedFact = Object.freeze({
        claim: pendingStart.claim,
        clientId: observation.clientId,
        turnId: observation.turnId,
        commitId: observation.commitId,
      });
      return transition({ type: "applied", operation: "observationRecorded" });
    }
    return transition({ type: "stale", subject: "runtimeCommit" });
  };

  return Object.freeze({
    submit({ intent, message }: SubmitInput): ComposerInputQueueTransition {
      if (message.text.trim() === "") {
        return transition({ type: "invalidInput", reason: "emptyText" });
      }
      if (knownMessageIds.has(message.id)) {
        return transition({ type: "duplicateIdentity", messageId: message.id });
      }

      const ownedMessage = immutableMessage(message);
      knownMessageIds.add(ownedMessage.id);
      if (intent === "steer" && activeTurnId != null) {
        const issued = issueSteerClaim(ownedMessage, activeTurnId);
        return transition(issued.result, [issued.effect]);
      }
      if (
        activeTurnId == null &&
        pendingStart == null &&
        pendingSteers.length === 0 &&
        rejectedSteers.length === 0 &&
        ordinary.length === 0
      ) {
        const issued = issueStartClaim([ownedMessage]);
        return transition(issued.result, [issued.effect]);
      }

      ordinary.push(ownedMessage);
      return transition({ type: "queued", messageId: ownedMessage.id });
    },

    settle(settlement: StartClaimSettlement | SteerClaimSettlement): ComposerInputQueueTransition {
      if (!isStartSettlement(settlement)) {
        return settleSteer(settlement);
      }
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
            runtimeFactTurnId(pendingRuntimeFact.fact) === settlement.turnId
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
            return applyCompletion(matchingFact.completion, { releasedPendingStart: true });
          }
          if (pendingStartCommittedFact?.claim === settlement.claim) {
            const committed = pendingStartCommittedFact;
            pendingStart = null;
            pendingRuntimeFact = null;
            pendingStartCommittedFact = null;
            latestCommittedFact = committed;
            activeTurnId = committed.turnId;
            releaseClaimMessageIds(settlement.claim);
            return transition({ type: "applied", operation: "startAccepted" });
          }
          pendingStart = Object.freeze({
            phase: "acceptedAwaitingStart",
            claim: settlement.claim,
            turnId: settlement.turnId,
          });
          return transition({ type: "applied", operation: "startAccepted" });
        }
        case "startDeliveryUnknown": {
          const matchingFact =
            pendingRuntimeFact?.claim === settlement.claim ? pendingRuntimeFact.fact : null;
          if (pendingStartCommittedFact?.claim === settlement.claim) {
            const committed = pendingStartCommittedFact;
            pendingStart = null;
            pendingRuntimeFact = null;
            pendingStartCommittedFact = null;
            latestCommittedFact = committed;
            releaseClaimMessageIds(settlement.claim);
            if (matchingFact?.type === "turnCompleted") {
              return applyCompletion(matchingFact.completion, { releasedPendingStart: true });
            }
            activeTurnId =
              matchingFact?.type === "turnStarted" ? matchingFact.turnId : committed.turnId;
            if (matchingFact?.type === "turnStarted") {
              latestRuntimeFact = matchingFact;
            }
            return transition({ type: "applied", operation: "userMessageCommitted" });
          }
          pendingStart = Object.freeze({
            phase: "deliveryUnknown",
            claim: settlement.claim,
          });
          return transition({ type: "deliveryUnknown", claimType: "start" });
        }
        case "startDefinitelyNotAccepted": {
          pendingStart = null;
          pendingRuntimeFact = null;
          pendingStartCommittedFact = null;
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
            latestRuntimeFact?.type === "turnCompleted" &&
            latestRuntimeFact.completion.turnId === observation.turnId
          ) {
            return transition({ type: "stale", subject: "runtimeObservation" });
          }
          if (pendingStart?.phase === "issuing") {
            return rememberPendingRuntimeFact(pendingStart.claim, observation);
          }
          if (pendingStart?.phase === "deliveryUnknown") {
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
        case "turnCompleted": {
          const { completion } = observation;
          if (
            latestRuntimeFact?.type === "turnCompleted" &&
            latestRuntimeFact.completion.turnId === completion.turnId
          ) {
            return transition(
              latestRuntimeFact.completion.commitId === completion.commitId
                ? { type: "idempotentReplay", subject: "runtimeObservation" }
                : { type: "stale", subject: "runtimeObservation" },
            );
          }
          if (pendingStart?.phase === "issuing") {
            return rememberPendingRuntimeFact(pendingStart.claim, {
              type: "turnCompleted",
              completion,
            });
          }
          if (pendingStart?.phase === "deliveryUnknown") {
            return rememberPendingRuntimeFact(pendingStart.claim, {
              type: "turnCompleted",
              completion,
            });
          }
          const matchesPendingStart =
            pendingStart?.phase === "acceptedAwaitingStart" &&
            pendingStart.turnId === completion.turnId;
          const matchesPendingSteer = pendingSteers.some(
            ({ turnId }) => turnId === completion.turnId,
          );
          if (!matchesPendingStart && !matchesPendingSteer && activeTurnId !== completion.turnId) {
            return transition(
              pendingStart?.phase === "acceptedAwaitingStart" || activeTurnId != null
                ? { type: "ownershipMismatch", subject: "runtimeTurn" }
                : { type: "stale", subject: "runtimeObservation" },
            );
          }
          return applyCompletion(completion);
        }
        case "userMessageCommitted":
          return observeCommittedMessage(observation);
      }
    },

    view(): ComposerInputQueueView {
      return Object.freeze({
        ordinary: Object.freeze(ordinary.map(immutableMessage)),
        hasPendingStart: pendingStart != null,
        pendingSteerCount: pendingSteers.length,
        rejectedSteerCount: rejectedSteers.length,
        hasDeliveryUnknown:
          pendingStart?.phase === "deliveryUnknown" ||
          pendingSteers.some(({ phase }) => phase === "deliveryUnknown"),
      });
    },
  });
}
