import type { Turn, TurnInterruptParams } from "@codex-protocol/v2";
import { randomUuid } from "@/identity/randomUuid";
import { validateV2TurnSteerParams } from "@/generated/appServerProtocol/appServerPayloadValidators.js";
import { persistedArray, persistedRecord } from "./composerLanePersistenceValidation";

const interruptClaimCapability: unique symbol = Symbol("InterruptClaim");
const RECENT_FACT_LIMIT = 4;
let nextInterruptRequestSequence = 0;

export type InterruptPhase = "issuing" | "accepted" | "unknown";

export type InterruptClaim = Readonly<{
  type: "interrupt";
  params: Readonly<TurnInterruptParams>;
  generation: number;
  requestId: string;
  [interruptClaimCapability]: object;
}>;

export type InterruptSettlement = Readonly<{
  type: "accepted" | "deliveryUnknown" | "definitelyNotAccepted";
  claim: InterruptClaim;
}>;

export type InterruptTerminalFact = Readonly<{
  params: Readonly<TurnInterruptParams>;
  generation: number;
}>;

export type ComposerInterruptStateEvent =
  | Readonly<{
      type: "issue";
      params: Readonly<TurnInterruptParams>;
      generation: number;
    }>
  | Readonly<{ type: "settle"; settlement: InterruptSettlement }>
  | Readonly<{ type: "terminal"; fact: InterruptTerminalFact }>;

export type InterruptTerminalDisposition = "local" | "nonLocal";

export type InterruptTerminalOutcome = Readonly<{
  fact: InterruptTerminalFact;
  disposition: InterruptTerminalDisposition;
}>;

export type ComposerInterruptStateResult =
  | Readonly<{ type: "issued"; claim: InterruptClaim }>
  | Readonly<{ type: "blocked"; phase: InterruptPhase }>
  | Readonly<{
      type: "accepted" | "deliveryUnknown" | "definitelyNotAccepted";
      terminal: InterruptTerminalOutcome | null;
    }>
  | Readonly<{ type: "terminal"; terminal: InterruptTerminalOutcome }>
  | Readonly<{ type: "terminalDeferred" }>
  | Readonly<{ type: "idempotentReplay"; subject: "settlement" | "terminal" }>
  | Readonly<{ type: "stale"; subject: "settlement" | "terminal" }>
  | Readonly<{ type: "ownershipMismatch"; subject: "interruptClaim" }>;

export type ComposerInterruptStateView = Readonly<{
  phase: InterruptPhase;
  params: Readonly<TurnInterruptParams>;
  generation: number;
}> | null;

export type ComposerInterruptState = Readonly<{
  reconcileSnapshot(
    turns: readonly Turn[],
    generation: number,
  ): ComposerInterruptStateResult | null;
  fork(): ComposerInterruptState;
  adopt(candidate: ComposerInterruptState): void;
  exportState(): PersistedComposerInterruptState;
  rehydrateState(state: unknown, generation: number): void;
  state(): ComposerInterruptStateView;
  transition(event: ComposerInterruptStateEvent): ComposerInterruptStateResult;
}>;

export type PersistedComposerInterruptState = Readonly<{
  pending: Readonly<{
    params: Readonly<TurnInterruptParams>;
    phase: InterruptPhase;
    terminal: Readonly<TurnInterruptParams> | null;
  }> | null;
  recentTerminals: readonly Readonly<TurnInterruptParams>[];
}>;

function importInterruptParams(raw: unknown): Readonly<TurnInterruptParams> {
  const value = persistedRecord(raw);
  const params = { threadId: value.threadId, expectedTurnId: value.turnId, input: [] };
  if (!validateV2TurnSteerParams(params)) throw new Error("Invalid persisted interrupt target");
  return { threadId: params.threadId, turnId: params.expectedTurnId };
}

export function decodePersistedComposerInterruptState(
  raw: unknown,
): PersistedComposerInterruptState {
  const value = persistedRecord(raw);
  const recentTerminals = persistedArray(value.recentTerminals).map(importInterruptParams);
  if (value.pending === null) return { pending: null, recentTerminals };
  const pending = persistedRecord(value.pending);
  if (pending.phase !== "issuing" && pending.phase !== "accepted" && pending.phase !== "unknown")
    throw new Error("Invalid persisted interrupt phase");
  const params = importInterruptParams(pending.params);
  const terminal = pending.terminal === null ? null : importInterruptParams(pending.terminal);
  if (
    terminal != null &&
    (terminal.threadId !== params.threadId || terminal.turnId !== params.turnId)
  )
    throw new Error("Persisted interrupt terminal has a different target");
  return { pending: { params, phase: pending.phase, terminal }, recentTerminals };
}

type ClaimRecord = Readonly<{
  claim: InterruptClaim;
  token: object;
}>;

type PendingInterrupt = Readonly<{
  record: ClaimRecord;
  phase: InterruptPhase;
  terminal: InterruptTerminalFact | null;
}>;

type SettlementRecord = Readonly<{
  claim: InterruptClaim;
  token: object;
  type: InterruptSettlement["type"];
}>;

function sameTarget(left: InterruptTerminalFact, right: InterruptTerminalFact): boolean {
  return (
    left.params.threadId === right.params.threadId && left.params.turnId === right.params.turnId
  );
}

function sameIdentity(left: InterruptTerminalFact, right: InterruptTerminalFact): boolean {
  return sameTarget(left, right) && left.generation === right.generation;
}

function ownTerminalFact(fact: InterruptTerminalFact): InterruptTerminalFact {
  return { params: { ...fact.params }, generation: fact.generation };
}

function terminalOutcome(
  fact: InterruptTerminalFact,
  disposition: InterruptTerminalDisposition,
): InterruptTerminalOutcome {
  return { fact: ownTerminalFact(fact), disposition };
}

class ComposerInterruptStateImpl implements ComposerInterruptState {
  private pending: PendingInterrupt | null = null;
  private readonly outstandingClaims = new Map<object, ClaimRecord>();
  private readonly recentSettlements: SettlementRecord[] = [];
  private readonly recentTerminals: InterruptTerminalFact[] = [];

  public reconcileSnapshot = (
    turns: readonly Turn[],
    generation: number,
  ): ComposerInterruptStateResult | null => {
    const params = this.pending?.record.claim.params;
    if (params == null) return null;
    const matches = turns.filter((turn) => turn.id === params.turnId);
    if (matches.length !== 1 || matches[0]?.status === "inProgress") return null;
    if (matches[0]?.status !== "interrupted") {
      this.adopt(new ComposerInterruptStateImpl());
      return null;
    }
    return this.terminal({ params, generation });
  };

  public fork = (): ComposerInterruptState => {
    const candidate = new ComposerInterruptStateImpl();
    candidate.adopt(this);
    return candidate;
  };

  public adopt = (candidate: ComposerInterruptState): void => {
    if (candidate === this) return;
    if (!(candidate instanceof ComposerInterruptStateImpl))
      throw new Error("Invalid interrupt candidate");
    this.pending = candidate.pending;
    this.outstandingClaims.clear();
    for (const [token, claim] of candidate.outstandingClaims)
      this.outstandingClaims.set(token, claim);
    this.recentSettlements.splice(0, this.recentSettlements.length, ...candidate.recentSettlements);
    this.recentTerminals.splice(0, this.recentTerminals.length, ...candidate.recentTerminals);
  };

  public exportState = (): PersistedComposerInterruptState => ({
    pending:
      this.pending == null
        ? null
        : {
            params: { ...this.pending.record.claim.params },
            phase: this.pending.phase,
            terminal: this.pending.terminal == null ? null : { ...this.pending.terminal.params },
          },
    recentTerminals: this.recentTerminals.map(({ params }) => ({ ...params })),
  });

  public rehydrateState = (raw: unknown, generation: number): void => {
    const state = decodePersistedComposerInterruptState(raw);
    const candidate = new ComposerInterruptStateImpl();
    candidate.recentTerminals.push(
      ...state.recentTerminals.map((params) => ({ params: { ...params }, generation })),
    );
    if (state.pending != null) {
      const token = {};
      const claim: InterruptClaim = {
        type: "interrupt",
        params: { ...state.pending.params },
        generation,
        requestId: `composer-interrupt-${randomUuid()}`,
        [interruptClaimCapability]: token,
      };
      candidate.pending = {
        record: { claim, token },
        phase: state.pending.phase === "issuing" ? "unknown" : state.pending.phase,
        terminal:
          state.pending.terminal == null
            ? null
            : { params: { ...state.pending.terminal }, generation },
      };
    }
    this.adopt(candidate);
  };

  public state = (): ComposerInterruptStateView => {
    if (this.pending == null) {
      return null;
    }
    return {
      phase: this.pending.phase,
      params: this.pending.record.claim.params,
      generation: this.pending.record.claim.generation,
    };
  };

  private issue(
    params: Readonly<TurnInterruptParams>,
    generation: number,
  ): ComposerInterruptStateResult {
    if (this.pending != null) {
      return { type: "blocked", phase: this.pending.phase };
    }
    nextInterruptRequestSequence += 1;
    const token = {};
    const claim: InterruptClaim = {
      type: "interrupt",
      params: { ...params },
      generation,
      requestId: `composer-interrupt-${String(nextInterruptRequestSequence)}`,
      [interruptClaimCapability]: token,
    };
    const record = { claim, token };
    this.outstandingClaims.set(token, record);
    this.pending = { record, phase: "issuing", terminal: null };
    return { type: "issued", claim };
  }

  private rememberSettlement(record: SettlementRecord): void {
    this.recentSettlements.push(record);
    if (this.recentSettlements.length > RECENT_FACT_LIMIT) {
      this.recentSettlements.shift();
    }
  }

  private rememberTerminal(fact: InterruptTerminalFact): void {
    this.recentTerminals.push({ ...fact, params: { ...fact.params } });
    if (this.recentTerminals.length > RECENT_FACT_LIMIT) {
      this.recentTerminals.shift();
    }
  }

  private classifyConsumedSettlement(
    settlement: InterruptSettlement,
  ): ComposerInterruptStateResult {
    const token = settlement.claim[interruptClaimCapability];
    const previous = this.recentSettlements.find((record) => record.token === token);
    if (previous?.claim !== settlement.claim) {
      return { type: "ownershipMismatch", subject: "interruptClaim" };
    }
    return previous.type === settlement.type
      ? { type: "idempotentReplay", subject: "settlement" }
      : { type: "stale", subject: "settlement" };
  }

  private settle(settlement: InterruptSettlement): ComposerInterruptStateResult {
    const token = settlement.claim[interruptClaimCapability];
    const record = this.outstandingClaims.get(token);
    if (record == null) {
      return this.classifyConsumedSettlement(settlement);
    }
    if (record.claim !== settlement.claim || this.pending?.record !== record) {
      return { type: "ownershipMismatch", subject: "interruptClaim" };
    }
    this.outstandingClaims.delete(token);
    this.rememberSettlement({ claim: record.claim, token, type: settlement.type });
    const terminal = this.pending.terminal;
    if (settlement.type === "definitelyNotAccepted") {
      this.pending = null;
      if (terminal != null) {
        this.rememberTerminal(terminal);
      }
      return {
        type: settlement.type,
        terminal: terminal == null ? null : terminalOutcome(terminal, "nonLocal"),
      };
    }
    const phase = settlement.type === "accepted" ? "accepted" : "unknown";
    if (terminal == null) {
      this.pending = { record, phase, terminal: null };
      return { type: settlement.type, terminal: null };
    }
    this.pending = null;
    this.rememberTerminal(terminal);
    return { type: settlement.type, terminal: terminalOutcome(terminal, "local") };
  }

  private terminal(fact: InterruptTerminalFact): ComposerInterruptStateResult {
    const previous = this.recentTerminals.find((recent) => sameIdentity(recent, fact));
    if (previous != null) {
      return { type: "idempotentReplay", subject: "terminal" };
    }
    if (
      this.pending?.phase === "issuing" &&
      this.pending.terminal != null &&
      sameIdentity(this.pending.terminal, fact)
    ) {
      return { type: "idempotentReplay", subject: "terminal" };
    }
    if (this.pending != null) {
      const claimFact = {
        params: this.pending.record.claim.params,
        generation: this.pending.record.claim.generation,
      };
      if (sameTarget(claimFact, fact) && !sameIdentity(claimFact, fact)) {
        return { type: "stale", subject: "terminal" };
      }
      if (sameIdentity(claimFact, fact)) {
        if (this.pending.phase === "issuing") {
          this.pending = { ...this.pending, terminal: ownTerminalFact(fact) };
          return { type: "terminalDeferred" };
        }
        this.pending = null;
        this.rememberTerminal(fact);
        return { type: "terminal", terminal: terminalOutcome(fact, "local") };
      }
    }
    if (this.recentTerminals.some((recent) => sameTarget(recent, fact))) {
      return { type: "stale", subject: "terminal" };
    }
    this.rememberTerminal(fact);
    return { type: "terminal", terminal: terminalOutcome(fact, "nonLocal") };
  }

  public transition = (event: ComposerInterruptStateEvent): ComposerInterruptStateResult => {
    switch (event.type) {
      case "issue":
        return this.issue(event.params, event.generation);
      case "settle":
        return this.settle(event.settlement);
      case "terminal":
        return this.terminal(event.fact);
    }
  };
}

export function createComposerInterruptState(): ComposerInterruptState {
  return new ComposerInterruptStateImpl();
}
