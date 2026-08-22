import type { Turn, TurnStartParams } from "@codex-protocol/v2";
import type {
  ComposerInputQueuePendingStartPhase,
  ComposerInputQueueResult,
  ComposerQueueMessage,
  RuntimeObservation,
} from "./composerInputQueueContracts";
import type { ReadonlyComposerInputPayload } from "./composerInputPayload";
import type { RejectedSteerTransfer } from "./composerSteerQueueState";

const startClaimCapability: unique symbol = Symbol("StartClaim");
const PENDING_FACT_LIMIT = 4;
const RECENT_FACT_LIMIT = 4;
let nextClientUserMessageSequence = 0;

type TurnIdentity = Turn["id"];
type StartClientIdentity = NonNullable<TurnStartParams["clientUserMessageId"]>;
export type RejectedSteerStartMessage = Readonly<{
  type: "rejectedSteerMerge";
  id: string;
  input: ReadonlyComposerInputPayload;
  transfer: RejectedSteerTransfer;
}>;

export type ComposerStartMessage = ComposerQueueMessage | RejectedSteerStartMessage;

export type StartClaim = Readonly<{
  type: "start";
  message: ComposerStartMessage;
  clientUserMessageId: StartClientIdentity;
  [startClaimCapability]: true;
}>;

export type StartSettlement =
  | Readonly<{ type: "accepted"; claim: StartClaim; turnId: TurnIdentity }>
  | Readonly<{ type: "definitelyNotAccepted"; claim: StartClaim }>
  | Readonly<{ type: "deliveryUnknown"; claim: StartClaim }>;

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

type StartQueueOutcome =
  | Readonly<{ type: "result"; result: ComposerInputQueueResult }>
  | Readonly<{
      type: "ownerAccepted";
      observation: TurnStarted | UserMessageCommitted;
      releasedClaim: StartClaim | null;
    }>
  | Readonly<{
      type: "terminal";
      observation: TurnCompleted;
      releasedClaim: StartClaim | null;
    }>
  | Readonly<{ type: "definitelyNotAccepted"; claim: StartClaim }>;

function result(result: ComposerInputQueueResult): StartQueueOutcome {
  return { type: "result", result };
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

export class ComposerStartQueueState {
  private pendingStart: PendingStart | null = null;
  private pendingFacts: PendingFacts | null = null;
  private latestSettlement: SettlementRecord | null = null;
  private readonly recentObservations: RuntimeObservation[] = [];

  public hasPending(): boolean {
    return this.pendingStart != null;
  }

  public pendingPhase(): ComposerInputQueuePendingStartPhase | null {
    if (this.pendingStart == null) {
      return null;
    }
    return this.pendingStart.phase === "acceptedAwaitingStart"
      ? "acceptedAwaitingRuntime"
      : this.pendingStart.phase;
  }

  public issue(message: ComposerStartMessage): StartClaim {
    nextClientUserMessageSequence += 1;
    const claim: StartClaim = {
      type: "start",
      message,
      clientUserMessageId: `composer-input-queue-${String(nextClientUserMessageSequence)}`,
      [startClaimCapability]: true as const,
    };
    this.pendingStart = { phase: "issuing", claim };
    return claim;
  }

  private classifySettlement(settlement: StartSettlement): StartQueueOutcome {
    if (this.latestSettlement?.claim !== settlement.claim) {
      return result({ type: "ownershipMismatch", subject: "startClaim" });
    }
    const exactReplay =
      this.latestSettlement.type === settlement.type &&
      (settlement.type !== "accepted" || this.latestSettlement.turnId === settlement.turnId);
    return result(
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
  ): StartQueueOutcome {
    const subject =
      observation.type === "userMessageCommitted" ? "runtimeCommit" : "runtimeObservation";
    if (sameObservation(previous, observation)) {
      return result({ type: "idempotentReplay", subject });
    }
    if (previous.commitId === observation.commitId) {
      return result({
        type: "ownershipMismatch",
        subject: observation.type === "userMessageCommitted" ? "runtimeCommit" : "runtimeTurn",
      });
    }
    return result({ type: "stale", subject });
  }

  private classifyRecent(observation: RuntimeObservation): StartQueueOutcome | null {
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
      return result({ type: "stale", subject: "runtimeObservation" });
    }
    return null;
  }

  private rememberPending(observation: RuntimeObservation): StartQueueOutcome | null {
    if (this.pendingStart == null) {
      return result({ type: "stale", subject: "runtimeObservation" });
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

  private releasePending(): StartClaim | null {
    const claim = this.pendingStart?.claim ?? null;
    this.pendingStart = null;
    this.pendingFacts = null;
    return claim;
  }

  private acceptOwner(observation: TurnStarted | UserMessageCommitted): StartQueueOutcome {
    const releasedClaim = this.releasePending();
    this.rememberRecent(observation);
    return { type: "ownerAccepted", observation, releasedClaim };
  }

  private applyTerminal(observation: TurnCompleted): StartQueueOutcome {
    const releasedClaim = this.releasePending();
    this.rememberRecent(observation);
    return { type: "terminal", observation, releasedClaim };
  }

  private reconcilePending(): StartQueueOutcome | null {
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

  private acceptObservation(observation: RuntimeObservation): StartQueueOutcome {
    const classification = this.rememberPending(observation);
    return (
      classification ??
      this.reconcilePending() ??
      result({ type: "applied", operation: "observationRecorded" })
    );
  }

  public settle(settlement: StartSettlement): StartQueueOutcome {
    if (this.pendingStart?.claim !== settlement.claim || this.pendingStart.phase !== "issuing") {
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
        return this.reconcilePending() ?? result({ type: "applied", operation: "startAccepted" });
      case "deliveryUnknown":
        this.pendingStart = { phase: "deliveryUnknown", claim: settlement.claim };
        return this.reconcilePending() ?? result({ type: "deliveryUnknown" });
      case "definitelyNotAccepted":
        this.pendingStart = null;
        this.pendingFacts = null;
        return { type: "definitelyNotAccepted", claim: settlement.claim };
    }
  }

  public observe(
    observation: RuntimeObservation,
    activeTurnId: TurnIdentity | null,
  ): StartQueueOutcome {
    const recent = this.classifyRecent(observation);
    if (recent != null) {
      return recent;
    }
    switch (observation.type) {
      case "turnStarted":
        if (
          this.pendingStart?.phase === "acceptedAwaitingStart" &&
          this.pendingStart.turnId !== observation.turnId
        ) {
          return result({ type: "ownershipMismatch", subject: "runtimeTurn" });
        }
        if (this.pendingStart != null) {
          return this.acceptObservation(observation);
        }
        if (activeTurnId != null && activeTurnId !== observation.turnId) {
          return result({ type: "ownershipMismatch", subject: "runtimeTurn" });
        }
        return this.acceptOwner(observation);
      case "userMessageCommitted":
        if (this.pendingStart?.claim.clientUserMessageId !== observation.clientId) {
          return result({
            type: this.pendingStart == null ? "stale" : "ownershipMismatch",
            subject: "runtimeCommit",
          });
        }
        if (
          this.pendingStart.phase === "acceptedAwaitingStart" &&
          this.pendingStart.turnId !== observation.turnId
        ) {
          return result({ type: "ownershipMismatch", subject: "runtimeCommit" });
        }
        return this.acceptObservation(observation);
      case "turnCompleted":
        if (
          this.pendingStart?.phase === "acceptedAwaitingStart" &&
          this.pendingStart.turnId !== observation.turnId
        ) {
          return result({ type: "ownershipMismatch", subject: "runtimeTurn" });
        }
        if (this.pendingStart != null) {
          return this.acceptObservation(observation);
        }
        if (activeTurnId !== observation.turnId) {
          return result(
            activeTurnId == null
              ? { type: "stale", subject: "runtimeObservation" }
              : { type: "ownershipMismatch", subject: "runtimeTurn" },
          );
        }
        return this.applyTerminal(observation);
    }
  }
}
