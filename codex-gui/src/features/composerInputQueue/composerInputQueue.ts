import type {
  ThreadItem,
  ThreadProjectionEventNotification,
  Turn,
  TurnStartParams,
} from "@codex-protocol/v2";

const startClaimCapability: unique symbol = Symbol("StartClaim");
const PENDING_FACT_LIMIT = 4;
const RECENT_FACT_LIMIT = 4;
let nextClientUserMessageSequence = 0;

type TurnIdentity = Turn["id"];
type CommitIdentity = ThreadProjectionEventNotification["commitId"];
type TerminalStatus = Exclude<Turn["status"], "inProgress">;
type StartClientIdentity = NonNullable<TurnStartParams["clientUserMessageId"]>;
type ObservedClientIdentity = NonNullable<Extract<ThreadItem, { type: "userMessage" }>["clientId"]>;

export type ComposerQueueMessage = Readonly<{
  id: string;
  text: string;
}>;

export type StartClaim = Readonly<{
  type: "start";
  message: ComposerQueueMessage;
  clientUserMessageId: StartClientIdentity;
  [startClaimCapability]: true;
}>;

export type RecoveryBatch = Readonly<{
  reason: "interrupted" | "startDefinitelyNotAccepted";
  messages: readonly ComposerQueueMessage[];
}>;

export type ComposerInputQueueResult =
  | Readonly<{ type: "claimIssued" }>
  | Readonly<{ type: "queued"; messageId: string }>
  | Readonly<{
      type: "applied";
      operation:
        | "observationRecorded"
        | "startAccepted"
        | "turnCompleted"
        | "turnStarted"
        | "userMessageCommitted";
    }>
  | Readonly<{ type: "deliveryUnknown" }>
  | Readonly<{
      type: "recoveryProduced";
      reason: RecoveryBatch["reason"];
      messageIds: readonly string[];
    }>
  | Readonly<{ type: "invalidInput"; reason: "emptyText" }>
  | Readonly<{ type: "duplicateIdentity"; messageId: string }>
  | Readonly<{
      type: "idempotentReplay";
      subject: "runtimeCommit" | "runtimeObservation" | "startSettlement";
    }>
  | Readonly<{
      type: "stale";
      subject: "runtimeCommit" | "runtimeObservation" | "startSettlement";
    }>
  | Readonly<{
      type: "ownershipMismatch";
      subject: "runtimeCommit" | "runtimeTurn" | "startClaim";
    }>;

export type ComposerInputQueueEffect =
  | Readonly<{ type: "performStart"; claim: StartClaim }>
  | Readonly<{ type: "recover"; batch: RecoveryBatch }>;

export type ComposerInputQueueTransition = Readonly<{
  result: ComposerInputQueueResult;
  effects: readonly ComposerInputQueueEffect[];
}>;

export type StartSettlement =
  | Readonly<{ type: "accepted"; claim: StartClaim; turnId: TurnIdentity }>
  | Readonly<{ type: "definitelyNotAccepted"; claim: StartClaim }>
  | Readonly<{ type: "deliveryUnknown"; claim: StartClaim }>;

export type RuntimeObservation =
  | Readonly<{ type: "turnStarted"; turnId: TurnIdentity; commitId: CommitIdentity }>
  | Readonly<{
      type: "userMessageCommitted";
      clientId: ObservedClientIdentity;
      turnId: TurnIdentity;
      commitId: CommitIdentity;
    }>
  | Readonly<{
      type: "turnCompleted";
      turnId: TurnIdentity;
      status: TerminalStatus;
      commitId: CommitIdentity;
    }>;

export type ComposerInputQueue = Readonly<{
  submit(message: ComposerQueueMessage): ComposerInputQueueTransition;
  settleStart(settlement: StartSettlement): ComposerInputQueueTransition;
  observe(observation: RuntimeObservation): ComposerInputQueueTransition;
}>;

export type CreateComposerInputQueueInput = Readonly<{
  activeTurnId: TurnIdentity | null;
}>;

type PendingStart =
  | Readonly<{ phase: "issuing"; claim: StartClaim }>
  | Readonly<{ phase: "acceptedAwaitingStart"; claim: StartClaim; turnId: TurnIdentity }>
  | Readonly<{ phase: "deliveryUnknown"; claim: StartClaim }>;

type SettlementRecord = Readonly<{
  claim: StartClaim;
  type: StartSettlement["type"];
  turnId?: TurnIdentity;
}>;

type TurnStarted = Extract<RuntimeObservation, { type: "turnStarted" }>;
type UserMessageCommitted = Extract<RuntimeObservation, { type: "userMessageCommitted" }>;
type TurnCompleted = Extract<RuntimeObservation, { type: "turnCompleted" }>;

type PendingFacts = { readonly claim: StartClaim; readonly facts: RuntimeObservation[] };

const noEffects: readonly ComposerInputQueueEffect[] = [];

function transition(
  result: ComposerInputQueueResult,
  effects: readonly ComposerInputQueueEffect[] = noEffects,
): ComposerInputQueueTransition {
  return { result, effects: [...effects] };
}

function ownMessage(message: ComposerQueueMessage): ComposerQueueMessage {
  return { id: message.id, text: message.text };
}

function sameObservation(left: RuntimeObservation, right: RuntimeObservation): boolean {
  if (
    left.type !== right.type ||
    left.commitId !== right.commitId ||
    left.turnId !== right.turnId
  ) {
    return false;
  }
  switch (left.type) {
    case "turnStarted":
      return true;
    case "turnCompleted":
      return right.type === left.type && left.status === right.status;
    case "userMessageCommitted":
      return right.type === left.type && left.clientId === right.clientId;
  }
}

export function createComposerInputQueue(
  input: CreateComposerInputQueueInput = { activeTurnId: null },
): ComposerInputQueue {
  const ordinary: ComposerQueueMessage[] = [];
  const knownMessageIds = new Set<string>();
  let activeTurnId = input.activeTurnId;
  let pendingStart: PendingStart | null = null;
  let pendingFacts: PendingFacts | null = null;
  let latestSettlement: SettlementRecord | null = null;
  const recentObservations: RuntimeObservation[] = [];

  const issueStart = (message: ComposerQueueMessage): ComposerInputQueueEffect => {
    nextClientUserMessageSequence += 1;
    const clientUserMessageId = `composer-input-queue-${String(nextClientUserMessageSequence)}`;
    const claim: StartClaim = {
      type: "start",
      message,
      clientUserMessageId,
      [startClaimCapability]: true as const,
    };
    pendingStart = { phase: "issuing", claim };
    return { type: "performStart", claim };
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
    const exactReplay =
      latestSettlement.type === settlement.type &&
      (settlement.type !== "accepted" || latestSettlement.turnId === settlement.turnId);
    return transition(
      exactReplay
        ? { type: "idempotentReplay", subject: "startSettlement" }
        : { type: "stale", subject: "startSettlement" },
    );
  };

  const rememberRecent = (observation: RuntimeObservation): void => {
    recentObservations.push(observation);
    if (recentObservations.length > RECENT_FACT_LIMIT) {
      recentObservations.splice(0, recentObservations.length - RECENT_FACT_LIMIT);
    }
  };

  const replaySubject = (
    observation: RuntimeObservation,
  ): "runtimeCommit" | "runtimeObservation" =>
    observation.type === "userMessageCommitted" ? "runtimeCommit" : "runtimeObservation";

  const classifyFact = (
    previous: RuntimeObservation,
    observation: RuntimeObservation,
  ): ComposerInputQueueTransition => {
    if (sameObservation(previous, observation)) {
      return transition({ type: "idempotentReplay", subject: replaySubject(observation) });
    }
    if (previous.commitId === observation.commitId) {
      return transition({
        type: "ownershipMismatch",
        subject: observation.type === "userMessageCommitted" ? "runtimeCommit" : "runtimeTurn",
      });
    }
    return transition({ type: "stale", subject: replaySubject(observation) });
  };

  const classifyRecent = (observation: RuntimeObservation): ComposerInputQueueTransition | null => {
    const matchingCommit = recentObservations.find(
      ({ commitId }) => commitId === observation.commitId,
    );
    if (matchingCommit != null) {
      return classifyFact(matchingCommit, observation);
    }
    if (
      observation.type !== "userMessageCommitted" &&
      recentObservations.some(
        (fact) => fact.type === "turnCompleted" && fact.turnId === observation.turnId,
      )
    ) {
      return transition({ type: "stale", subject: "runtimeObservation" });
    }
    return null;
  };

  const rememberPending = (
    observation: RuntimeObservation,
  ): ComposerInputQueueTransition | null => {
    if (pendingStart == null) {
      return transition({ type: "stale", subject: "runtimeObservation" });
    }
    if (pendingFacts?.claim !== pendingStart.claim) {
      pendingFacts = { claim: pendingStart.claim, facts: [] };
    }
    const previous = pendingFacts.facts.find(({ commitId }) => commitId === observation.commitId);
    if (previous != null) {
      return classifyFact(previous, observation);
    }
    pendingFacts.facts.push(observation);
    if (pendingFacts.facts.length > PENDING_FACT_LIMIT) {
      pendingFacts.facts.splice(0, pendingFacts.facts.length - PENDING_FACT_LIMIT);
    }
    return null;
  };

  const releasePending = (): void => {
    if (pendingStart != null) {
      knownMessageIds.delete(pendingStart.claim.message.id);
    }
    pendingStart = null;
    pendingFacts = null;
  };

  const acceptRuntimeOwner = (
    observation: TurnStarted | UserMessageCommitted,
  ): ComposerInputQueueTransition => {
    releasePending();
    activeTurnId = observation.turnId;
    rememberRecent(observation);
    return transition({
      type: "applied",
      operation: observation.type === "turnStarted" ? "turnStarted" : "userMessageCommitted",
    });
  };

  const applyTerminal = (observation: TurnCompleted): ComposerInputQueueTransition => {
    releasePending();
    if (activeTurnId === observation.turnId) {
      activeTurnId = null;
    }
    rememberRecent(observation);
    if (observation.status !== "interrupted") {
      const nextStart = drainOrdinary();
      return transition(
        { type: "applied", operation: "turnCompleted" },
        nextStart == null ? noEffects : [nextStart],
      );
    }

    const messages = ordinary.splice(0);
    for (const message of messages) {
      knownMessageIds.delete(message.id);
    }
    if (messages.length === 0) {
      return transition({ type: "applied", operation: "turnCompleted" });
    }
    const batch: RecoveryBatch = { reason: "interrupted", messages };
    return transition(
      {
        type: "recoveryProduced",
        reason: "interrupted",
        messageIds: messages.map(({ id }) => id),
      },
      [{ type: "recover", batch }],
    );
  };

  const reconcilePending = (): ComposerInputQueueTransition | null => {
    if (pendingStart == null || pendingStart.phase === "issuing" || pendingFacts == null) {
      return null;
    }
    const committed = pendingFacts.facts.findLast(
      (fact): fact is UserMessageCommitted => fact.type === "userMessageCommitted",
    );
    const turnId =
      pendingStart.phase === "acceptedAwaitingStart" ? pendingStart.turnId : committed?.turnId;
    if (turnId == null) {
      return null;
    }
    const matchingFacts = pendingFacts.facts.filter((fact) => fact.turnId === turnId);
    const selected =
      matchingFacts.findLast((fact): fact is TurnCompleted => fact.type === "turnCompleted") ??
      matchingFacts.findLast(
        (fact): fact is UserMessageCommitted => fact.type === "userMessageCommitted",
      ) ??
      matchingFacts.findLast((fact): fact is TurnStarted => fact.type === "turnStarted") ??
      null;
    if (selected == null) {
      if (pendingStart.phase === "acceptedAwaitingStart") {
        pendingFacts = null;
      }
      return null;
    }
    for (const fact of matchingFacts) {
      if (fact !== selected) {
        rememberRecent(fact);
      }
    }
    return selected.type === "turnCompleted"
      ? applyTerminal(selected)
      : acceptRuntimeOwner(selected);
  };

  const acceptObservation = (observation: RuntimeObservation): ComposerInputQueueTransition => {
    const classification = rememberPending(observation);
    return (
      classification ??
      reconcilePending() ??
      transition({ type: "applied", operation: "observationRecorded" })
    );
  };

  return {
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

      latestSettlement = {
        claim: settlement.claim,
        type: settlement.type,
        ...(settlement.type === "accepted" ? { turnId: settlement.turnId } : {}),
      };
      switch (settlement.type) {
        case "accepted":
          pendingStart = {
            phase: "acceptedAwaitingStart",
            claim: settlement.claim,
            turnId: settlement.turnId,
          };
          return reconcilePending() ?? transition({ type: "applied", operation: "startAccepted" });
        case "deliveryUnknown": {
          pendingStart = { phase: "deliveryUnknown", claim: settlement.claim };
          return reconcilePending() ?? transition({ type: "deliveryUnknown" });
        }
        case "definitelyNotAccepted": {
          pendingStart = null;
          pendingFacts = null;
          const recoveredMessage = settlement.claim.message;
          knownMessageIds.delete(recoveredMessage.id);
          const batch: RecoveryBatch = {
            reason: "startDefinitelyNotAccepted",
            messages: [recoveredMessage],
          };
          const effects: ComposerInputQueueEffect[] = [{ type: "recover", batch }];
          const nextStart = drainOrdinary();
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
    },

    observe(observation: RuntimeObservation): ComposerInputQueueTransition {
      const recent = classifyRecent(observation);
      if (recent != null) {
        return recent;
      }
      switch (observation.type) {
        case "turnStarted":
          if (pendingStart?.phase === "acceptedAwaitingStart") {
            if (pendingStart.turnId !== observation.turnId) {
              return transition({ type: "ownershipMismatch", subject: "runtimeTurn" });
            }
          }
          if (pendingStart != null) {
            return acceptObservation(observation);
          }
          if (activeTurnId != null && activeTurnId !== observation.turnId) {
            return transition({ type: "ownershipMismatch", subject: "runtimeTurn" });
          }
          activeTurnId = observation.turnId;
          rememberRecent(observation);
          return transition({ type: "applied", operation: "turnStarted" });
        case "userMessageCommitted":
          if (pendingStart?.claim.clientUserMessageId !== observation.clientId) {
            return transition({
              type: pendingStart == null ? "stale" : "ownershipMismatch",
              subject: "runtimeCommit",
            });
          }
          if (
            pendingStart.phase === "acceptedAwaitingStart" &&
            pendingStart.turnId !== observation.turnId
          ) {
            return transition({ type: "ownershipMismatch", subject: "runtimeCommit" });
          }
          return acceptObservation(observation);
        case "turnCompleted":
          if (
            pendingStart?.phase === "acceptedAwaitingStart" &&
            pendingStart.turnId !== observation.turnId
          ) {
            return transition({ type: "ownershipMismatch", subject: "runtimeTurn" });
          }
          if (pendingStart != null) {
            return acceptObservation(observation);
          }
          if (activeTurnId !== observation.turnId) {
            return activeTurnId == null
              ? transition({ type: "stale", subject: "runtimeObservation" })
              : transition({ type: "ownershipMismatch", subject: "runtimeTurn" });
          }
          return applyTerminal(observation);
      }
    },
  };
}
