import type { Turn, TurnStartParams } from "@codex-protocol/v2";
import { randomUuid } from "@/identity/randomUuid";
import type {
  ComposerInputQueuePendingStartPhase,
  ComposerInputQueueResult,
  ComposerQueueMessage,
  RuntimeObservation,
} from "./composerInputQueueContracts";
import type { ReadonlyComposerInputPayload } from "@/features/composerInput/composerInputPayload";
import type { RejectedSteerTransfer } from "./composerSteerQueueState";
import {
  persistedArray,
  persistedRecord,
  persistedString,
} from "./composerLanePersistenceValidation";

const startClaimCapability: unique symbol = Symbol("StartClaim");
const PENDING_FACT_LIMIT = 4;
const RECENT_FACT_LIMIT = 4;

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

export type PersistedComposerStartState<M> = Readonly<{
  pending: Readonly<{
    phase: PendingStart["phase"];
    message: M;
    clientUserMessageId: StartClientIdentity;
    turnId: TurnIdentity | null;
    facts: readonly RuntimeObservation[];
  }> | null;
  recentObservations: readonly RuntimeObservation[];
}>;

const terminalStatuses = { completed: true, failed: true, interrupted: true } satisfies Record<
  Extract<RuntimeObservation, { type: "turnCompleted" }>["status"],
  true
>;

function importObservation(raw: unknown): RuntimeObservation {
  const value = persistedRecord(raw);
  const turnId = persistedString(value.turnId);
  const commitId = persistedString(value.commitId);
  switch (value.type) {
    case "turnStarted":
      return { type: value.type, turnId, commitId };
    case "userMessageCommitted":
      return { type: value.type, turnId, commitId, clientId: persistedString(value.clientId) };
    case "turnCompleted": {
      if (typeof value.status !== "string" || !Object.hasOwn(terminalStatuses, value.status))
        throw new Error("Invalid persisted terminal status");
      const status = value.status as keyof typeof terminalStatuses;
      return { type: value.type, turnId, commitId, status };
    }
    default:
      throw new Error("Invalid persisted start observation");
  }
}

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

  public reconcileSnapshot(
    turns: readonly Turn[],
  ):
    | Readonly<{ type: "unresolved" }>
    | Readonly<{ type: "resolved"; claim: StartClaim; turnId: TurnIdentity; terminal: boolean }> {
    const pending = this.pendingStart;
    if (pending == null) return { type: "unresolved" };
    const matches =
      pending.phase === "acceptedAwaitingStart"
        ? turns.filter(({ id }) => id === pending.turnId)
        : turns.filter((turn) =>
            turn.items.some(
              (item) =>
                item.type === "userMessage" && item.clientId === pending.claim.clientUserMessageId,
            ),
          );
    if (matches.length !== 1) return { type: "unresolved" };
    const turn = matches[0];
    if (turn == null) return { type: "unresolved" };
    this.releasePending();
    return {
      type: "resolved",
      claim: pending.claim,
      turnId: turn.id,
      terminal: turn.status !== "inProgress",
    };
  }

  public fork(): ComposerStartQueueState {
    const candidate = new ComposerStartQueueState();
    candidate.adopt(this);
    return candidate;
  }

  public adopt(candidate: ComposerStartQueueState): void {
    if (candidate === this) return;
    this.pendingStart = candidate.pendingStart;
    this.pendingFacts =
      candidate.pendingFacts == null
        ? null
        : { claim: candidate.pendingFacts.claim, facts: [...candidate.pendingFacts.facts] };
    this.latestSettlement = candidate.latestSettlement;
    this.recentObservations.splice(
      0,
      this.recentObservations.length,
      ...candidate.recentObservations,
    );
  }

  public exportState<M>(
    encode: (message: ComposerStartMessage) => M,
  ): PersistedComposerStartState<M> {
    const pending = this.pendingStart;
    return {
      pending:
        pending == null
          ? null
          : {
              phase: pending.phase,
              message: encode(pending.claim.message),
              clientUserMessageId: pending.claim.clientUserMessageId,
              turnId: pending.phase === "acceptedAwaitingStart" ? pending.turnId : null,
              facts: [...(this.pendingFacts?.facts ?? [])],
            },
      recentObservations: [...this.recentObservations],
    };
  }

  public rehydrateState(raw: unknown, decode: (message: unknown) => ComposerStartMessage): void {
    const state = persistedRecord(raw);
    const recent = persistedArray(state.recentObservations).map(importObservation);
    const pending = state.pending === null ? null : persistedRecord(state.pending);
    const candidate = new ComposerStartQueueState();
    candidate.recentObservations.push(...recent);
    if (pending != null) {
      if (
        pending.phase !== "issuing" &&
        pending.phase !== "deliveryUnknown" &&
        pending.phase !== "acceptedAwaitingStart"
      )
        throw new Error("Invalid persisted start phase");
      const claim: StartClaim = {
        type: "start",
        message: decode(pending.message),
        clientUserMessageId: persistedString(pending.clientUserMessageId),
        [startClaimCapability]: true,
      };
      if (pending.phase === "acceptedAwaitingStart") {
        candidate.pendingStart = {
          phase: "acceptedAwaitingStart",
          claim,
          turnId: persistedString(pending.turnId),
        };
      } else {
        if (pending.turnId !== null) throw new Error("Unconfirmed persisted start has a turn");
        candidate.pendingStart = { phase: "deliveryUnknown", claim };
      }
      candidate.pendingFacts = {
        claim,
        facts: persistedArray(pending.facts).map(importObservation),
      };
    }
    this.adopt(candidate);
  }

  public hasPending(): boolean {
    return this.pendingStart != null;
  }

  public unknownMessages(): readonly ComposerStartMessage[] {
    return this.pendingStart?.phase === "deliveryUnknown" ? [this.pendingStart.claim.message] : [];
  }

  public discardUnknown(id: string): boolean {
    if (this.pendingStart?.phase !== "deliveryUnknown" || this.pendingStart.claim.message.id !== id)
      return false;
    this.pendingStart = null;
    this.pendingFacts = null;
    return true;
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
    const claim: StartClaim = {
      type: "start",
      message,
      clientUserMessageId: `composer-input-queue-${randomUuid()}`,
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
    if (classification?.type === "result" && classification.result.type === "idempotentReplay") {
      return this.reconcilePending() ?? classification;
    }
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
