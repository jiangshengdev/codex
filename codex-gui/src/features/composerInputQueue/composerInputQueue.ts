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
  input: readonly TurnStartParams["input"][number][];
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
  | Readonly<{ type: "invalidInput"; reason: "emptyInput" }>
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

export type ComposerInputQueuePendingStartPhase =
  | "issuing"
  | "acceptedAwaitingRuntime"
  | "deliveryUnknown";

export type ComposerInputQueueReleaseBlocker =
  | Readonly<{ type: "ordinaryQueued"; count: number }>
  | Readonly<{ type: "pendingStart"; phase: ComposerInputQueuePendingStartPhase }>;

export type ComposerInputQueueReleaseState =
  | Readonly<{ type: "safe" }>
  | Readonly<{ type: "blocked"; blockers: readonly ComposerInputQueueReleaseBlocker[] }>;

export type ComposerInputQueueView = Readonly<{
  queuedCount: number;
  releaseState: ComposerInputQueueReleaseState;
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
  view(): ComposerInputQueueView;
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
  return { id: message.id, input: [...message.input] };
}

function hasMeaningfulInput(input: ComposerQueueMessage["input"]): boolean {
  return input.some((item) => item.type !== "text" || item.text.trim() !== "");
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

class ComposerInputQueueImpl implements ComposerInputQueue {
  private readonly ordinary: ComposerQueueMessage[] = [];
  private readonly knownMessageIds = new Set<string>();
  private pendingStart: PendingStart | null = null;
  private pendingFacts: PendingFacts | null = null;
  private latestSettlement: SettlementRecord | null = null;
  private readonly recentObservations: RuntimeObservation[] = [];
  private activeTurnId: TurnIdentity | null;

  constructor(activeTurnId: TurnIdentity | null) {
    this.activeTurnId = activeTurnId;
  }

  public view = (): ComposerInputQueueView => {
    const queuedCount = this.ordinary.length;
    const blockers: ComposerInputQueueReleaseBlocker[] = [];
    if (queuedCount > 0) {
      blockers.push({ type: "ordinaryQueued", count: queuedCount });
    }
    if (this.pendingStart != null) {
      blockers.push({
        type: "pendingStart",
        phase:
          this.pendingStart.phase === "acceptedAwaitingStart"
            ? "acceptedAwaitingRuntime"
            : this.pendingStart.phase,
      });
    }
    return {
      queuedCount,
      releaseState: blockers.length === 0 ? { type: "safe" } : { type: "blocked", blockers },
    };
  };

  private issueStart(message: ComposerQueueMessage): ComposerInputQueueEffect {
    nextClientUserMessageSequence += 1;
    const clientUserMessageId = `composer-input-queue-${String(nextClientUserMessageSequence)}`;
    const claim: StartClaim = {
      type: "start",
      message,
      clientUserMessageId,
      [startClaimCapability]: true as const,
    };
    this.pendingStart = { phase: "issuing", claim };
    return { type: "performStart", claim };
  }

  private drainOrdinary(): ComposerInputQueueEffect | null {
    if (this.activeTurnId != null || this.pendingStart != null) {
      return null;
    }
    const message = this.ordinary.shift();
    return message == null ? null : this.issueStart(message);
  }

  private classifySettlement(settlement: StartSettlement): ComposerInputQueueTransition {
    if (this.latestSettlement?.claim !== settlement.claim) {
      return transition({ type: "ownershipMismatch", subject: "startClaim" });
    }
    const exactReplay =
      this.latestSettlement.type === settlement.type &&
      (settlement.type !== "accepted" || this.latestSettlement.turnId === settlement.turnId);
    return transition(
      exactReplay
        ? { type: "idempotentReplay", subject: "startSettlement" }
        : { type: "stale", subject: "startSettlement" },
    );
  }

  private rememberRecent(observation: RuntimeObservation): void {
    this.recentObservations.push(observation);
    if (this.recentObservations.length > RECENT_FACT_LIMIT) {
      this.recentObservations.splice(0, this.recentObservations.length - RECENT_FACT_LIMIT);
    }
  }

  private classifyFact(
    previous: RuntimeObservation,
    observation: RuntimeObservation,
  ): ComposerInputQueueTransition {
    const subject =
      observation.type === "userMessageCommitted" ? "runtimeCommit" : "runtimeObservation";
    if (sameObservation(previous, observation)) {
      return transition({ type: "idempotentReplay", subject });
    }
    if (previous.commitId === observation.commitId) {
      return transition({
        type: "ownershipMismatch",
        subject: observation.type === "userMessageCommitted" ? "runtimeCommit" : "runtimeTurn",
      });
    }
    return transition({ type: "stale", subject });
  }

  private classifyRecent(observation: RuntimeObservation): ComposerInputQueueTransition | null {
    const matchingCommit = this.recentObservations.find(
      ({ commitId }) => commitId === observation.commitId,
    );
    if (matchingCommit != null) {
      return this.classifyFact(matchingCommit, observation);
    }
    if (
      observation.type !== "userMessageCommitted" &&
      this.recentObservations.some(
        (fact) => fact.type === "turnCompleted" && fact.turnId === observation.turnId,
      )
    ) {
      return transition({ type: "stale", subject: "runtimeObservation" });
    }
    return null;
  }

  private rememberPending(observation: RuntimeObservation): ComposerInputQueueTransition | null {
    if (this.pendingStart == null) {
      return transition({ type: "stale", subject: "runtimeObservation" });
    }
    if (this.pendingFacts?.claim !== this.pendingStart.claim) {
      this.pendingFacts = { claim: this.pendingStart.claim, facts: [] };
    }
    const previous = this.pendingFacts.facts.find(
      ({ commitId }) => commitId === observation.commitId,
    );
    if (previous != null) {
      return this.classifyFact(previous, observation);
    }
    this.pendingFacts.facts.push(observation);
    if (this.pendingFacts.facts.length > PENDING_FACT_LIMIT) {
      this.pendingFacts.facts.splice(0, this.pendingFacts.facts.length - PENDING_FACT_LIMIT);
    }
    return null;
  }

  private releasePending(): void {
    if (this.pendingStart != null) {
      this.knownMessageIds.delete(this.pendingStart.claim.message.id);
    }
    this.pendingStart = null;
    this.pendingFacts = null;
  }

  private acceptOwner(
    observation: TurnStarted | UserMessageCommitted,
  ): ComposerInputQueueTransition {
    this.releasePending();
    this.activeTurnId = observation.turnId;
    this.rememberRecent(observation);
    return transition({
      type: "applied",
      operation: observation.type === "turnStarted" ? "turnStarted" : "userMessageCommitted",
    });
  }

  private applyTerminal(observation: TurnCompleted): ComposerInputQueueTransition {
    this.releasePending();
    if (this.activeTurnId === observation.turnId) {
      this.activeTurnId = null;
    }
    this.rememberRecent(observation);
    if (observation.status !== "interrupted") {
      const nextStart = this.drainOrdinary();
      return transition(
        { type: "applied", operation: "turnCompleted" },
        nextStart == null ? noEffects : [nextStart],
      );
    }

    const messages = this.ordinary.splice(0);
    for (const message of messages) {
      this.knownMessageIds.delete(message.id);
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
  }

  private reconcilePending(): ComposerInputQueueTransition | null {
    if (
      this.pendingStart == null ||
      this.pendingStart.phase === "issuing" ||
      this.pendingFacts == null
    ) {
      return null;
    }
    const committed = this.pendingFacts.facts.findLast(
      (fact): fact is UserMessageCommitted => fact.type === "userMessageCommitted",
    );
    const turnId =
      this.pendingStart.phase === "acceptedAwaitingStart"
        ? this.pendingStart.turnId
        : committed?.turnId;
    if (turnId == null) {
      return null;
    }
    const matchingFacts = this.pendingFacts.facts.filter((fact) => fact.turnId === turnId);
    const selected =
      matchingFacts.findLast((fact): fact is TurnCompleted => fact.type === "turnCompleted") ??
      matchingFacts.findLast(
        (fact): fact is UserMessageCommitted => fact.type === "userMessageCommitted",
      ) ??
      matchingFacts.findLast((fact): fact is TurnStarted => fact.type === "turnStarted") ??
      null;
    if (selected == null) {
      if (this.pendingStart.phase === "acceptedAwaitingStart") {
        this.pendingFacts = null;
      }
      return null;
    }
    for (const fact of matchingFacts) {
      if (fact !== selected) {
        this.rememberRecent(fact);
      }
    }
    return selected.type === "turnCompleted"
      ? this.applyTerminal(selected)
      : this.acceptOwner(selected);
  }

  private acceptObservation(observation: RuntimeObservation): ComposerInputQueueTransition {
    const classification = this.rememberPending(observation);
    return (
      classification ??
      this.reconcilePending() ??
      transition({ type: "applied", operation: "observationRecorded" })
    );
  }

  public submit = (message: ComposerQueueMessage): ComposerInputQueueTransition => {
    if (!hasMeaningfulInput(message.input)) {
      return transition({ type: "invalidInput", reason: "emptyInput" });
    }
    if (this.knownMessageIds.has(message.id)) {
      return transition({ type: "duplicateIdentity", messageId: message.id });
    }

    const ownedMessage = ownMessage(message);
    this.knownMessageIds.add(ownedMessage.id);
    if (this.activeTurnId == null && this.pendingStart == null && this.ordinary.length === 0) {
      return transition({ type: "claimIssued" }, [this.issueStart(ownedMessage)]);
    }
    this.ordinary.push(ownedMessage);
    return transition({ type: "queued", messageId: ownedMessage.id });
  };

  public settleStart = (settlement: StartSettlement): ComposerInputQueueTransition => {
    if (this.pendingStart?.claim !== settlement.claim) {
      return this.classifySettlement(settlement);
    }
    if (this.pendingStart.phase !== "issuing") {
      return this.classifySettlement(settlement);
    }

    this.latestSettlement = {
      claim: settlement.claim,
      type: settlement.type,
      ...(settlement.type === "accepted" ? { turnId: settlement.turnId } : {}),
    };
    switch (settlement.type) {
      case "accepted":
        this.pendingStart = {
          phase: "acceptedAwaitingStart",
          claim: settlement.claim,
          turnId: settlement.turnId,
        };
        return (
          this.reconcilePending() ?? transition({ type: "applied", operation: "startAccepted" })
        );
      case "deliveryUnknown": {
        this.pendingStart = { phase: "deliveryUnknown", claim: settlement.claim };
        return this.reconcilePending() ?? transition({ type: "deliveryUnknown" });
      }
      case "definitelyNotAccepted": {
        this.pendingStart = null;
        this.pendingFacts = null;
        const recoveredMessage = settlement.claim.message;
        this.knownMessageIds.delete(recoveredMessage.id);
        const batch: RecoveryBatch = {
          reason: "startDefinitelyNotAccepted",
          messages: [recoveredMessage],
        };
        const effects: ComposerInputQueueEffect[] = [{ type: "recover", batch }];
        const nextStart = this.drainOrdinary();
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
  };

  public observe = (observation: RuntimeObservation): ComposerInputQueueTransition => {
    const recent = this.classifyRecent(observation);
    if (recent != null) {
      return recent;
    }
    switch (observation.type) {
      case "turnStarted":
        if (this.pendingStart?.phase === "acceptedAwaitingStart") {
          if (this.pendingStart.turnId !== observation.turnId) {
            return transition({ type: "ownershipMismatch", subject: "runtimeTurn" });
          }
        }
        if (this.pendingStart != null) {
          return this.acceptObservation(observation);
        }
        if (this.activeTurnId != null && this.activeTurnId !== observation.turnId) {
          return transition({ type: "ownershipMismatch", subject: "runtimeTurn" });
        }
        this.activeTurnId = observation.turnId;
        this.rememberRecent(observation);
        return transition({ type: "applied", operation: "turnStarted" });
      case "userMessageCommitted":
        if (this.pendingStart?.claim.clientUserMessageId !== observation.clientId) {
          return transition({
            type: this.pendingStart == null ? "stale" : "ownershipMismatch",
            subject: "runtimeCommit",
          });
        }
        if (
          this.pendingStart.phase === "acceptedAwaitingStart" &&
          this.pendingStart.turnId !== observation.turnId
        ) {
          return transition({ type: "ownershipMismatch", subject: "runtimeCommit" });
        }
        return this.acceptObservation(observation);
      case "turnCompleted":
        if (
          this.pendingStart?.phase === "acceptedAwaitingStart" &&
          this.pendingStart.turnId !== observation.turnId
        ) {
          return transition({ type: "ownershipMismatch", subject: "runtimeTurn" });
        }
        if (this.pendingStart != null) {
          return this.acceptObservation(observation);
        }
        if (this.activeTurnId !== observation.turnId) {
          return this.activeTurnId == null
            ? transition({ type: "stale", subject: "runtimeObservation" })
            : transition({ type: "ownershipMismatch", subject: "runtimeTurn" });
        }
        return this.applyTerminal(observation);
    }
  };
}

export function createComposerInputQueue(
  input: CreateComposerInputQueueInput = { activeTurnId: null },
): ComposerInputQueue {
  return new ComposerInputQueueImpl(input.activeTurnId);
}
