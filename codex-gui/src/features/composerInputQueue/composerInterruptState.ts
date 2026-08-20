import type { TurnInterruptParams } from "@codex-protocol/v2";

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
  state(): ComposerInterruptStateView;
  transition(event: ComposerInterruptStateEvent): ComposerInterruptStateResult;
}>;

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
    if (previous == null || previous.claim !== settlement.claim) {
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
    if (this.pending?.terminal != null && sameIdentity(this.pending.terminal, fact)) {
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
