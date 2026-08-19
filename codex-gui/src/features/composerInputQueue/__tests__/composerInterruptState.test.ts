import { describe, expect, it } from "vitest";

import {
  createComposerInterruptState,
  type ComposerInterruptState,
  type ComposerInterruptStateEvent,
  type InterruptClaim,
  type InterruptSettlement,
  type InterruptPhase,
} from "../composerInterruptState";

function issue(state: ComposerInterruptState, generation = 1, turnId = "turn-a"): InterruptClaim {
  const result = state.transition({
    type: "issue",
    params: { threadId: "thread-a", turnId },
    generation,
  });
  expect(result.type).toBe("issued");
  if (result.type !== "issued") {
    throw new Error("expected an interrupt claim");
  }
  return result.claim;
}

function terminal(
  generation = 1,
  turnId = "turn-a",
): Extract<ComposerInterruptStateEvent, { type: "terminal" }> {
  return {
    type: "terminal",
    fact: { params: { threadId: "thread-a", turnId }, generation },
  };
}

function assertInterruptClaimCannotBeForged(): void {
  // @ts-expect-error interrupt claims require the state-private capability brand
  const claim: InterruptClaim = {
    type: "interrupt",
    params: { threadId: "thread-a", turnId: "turn-a" },
    generation: 1,
    requestId: "forged",
  };
  void claim;
}

void assertInterruptClaimCannotBeForged;

describe("composer interrupt state", () => {
  it("classifies an unmatched terminal once and blocks a second issuing claim", () => {
    const state = createComposerInterruptState();

    expect(state.transition(terminal())).toEqual({ type: "terminal", disposition: "nonLocal" });
    expect(state.transition(terminal())).toEqual({
      type: "idempotentReplay",
      subject: "terminal",
    });
    issue(state, 2, "turn-b");
    expect(
      state.transition({
        type: "issue",
        params: { threadId: "thread-a", turnId: "turn-c" },
        generation: 2,
      }),
    ).toEqual({ type: "blocked", phase: "issuing" });
    expect(state.state()).toEqual({
      phase: "issuing",
      params: { threadId: "thread-a", turnId: "turn-b" },
      generation: 2,
    });
  });

  const retainedSettlements: ReadonlyArray<
    readonly [
      Extract<InterruptSettlement["type"], "accepted" | "deliveryUnknown">,
      Extract<InterruptPhase, "accepted" | "unknown">,
    ]
  > = [
    ["accepted", "accepted"],
    ["deliveryUnknown", "unknown"],
  ];

  it.each(retainedSettlements)(
    "retains a matching claim after %s until terminal",
    (settlement, phase) => {
      const state = createComposerInterruptState();
      const claim = issue(state);

      expect(state.transition({ type: "settle", settlement: { type: settlement, claim } })).toEqual(
        {
          type: settlement,
          terminalDisposition: null,
        },
      );
      expect(state.state()).toEqual({
        phase,
        params: { threadId: "thread-a", turnId: "turn-a" },
        generation: 1,
      });
      expect(
        state.transition({
          type: "issue",
          params: { threadId: "thread-a", turnId: "turn-b" },
          generation: 1,
        }),
      ).toEqual({ type: "blocked", phase });
      expect(state.transition(terminal())).toEqual({ type: "terminal", disposition: "local" });
      expect(state.state()).toBeNull();
      expect(state.transition({ type: "settle", settlement: { type: settlement, claim } })).toEqual(
        { type: "idempotentReplay", subject: "settlement" },
      );
      const conflictingSettlement = settlement === "accepted" ? "deliveryUnknown" : "accepted";
      expect(
        state.transition({
          type: "settle",
          settlement: { type: conflictingSettlement, claim },
        }),
      ).toEqual({ type: "stale", subject: "settlement" });
      expect(issue(state, 1, "turn-b").requestId).not.toBe(claim.requestId);
    },
  );
  const terminalReorderedSettlements: readonly Extract<
    InterruptSettlement["type"],
    "accepted" | "deliveryUnknown"
  >[] = ["accepted", "deliveryUnknown"];

  it.each(terminalReorderedSettlements)(
    "reorders terminal before %s settlement as one local terminal",
    (settlement) => {
      const state = createComposerInterruptState();
      const claim = issue(state);

      expect(state.transition(terminal())).toEqual({ type: "terminalDeferred" });
      expect(state.transition(terminal())).toEqual({
        type: "idempotentReplay",
        subject: "terminal",
      });
      expect(state.transition({ type: "settle", settlement: { type: settlement, claim } })).toEqual(
        { type: settlement, terminalDisposition: "local" },
      );
      expect(state.transition(terminal())).toEqual({
        type: "idempotentReplay",
        subject: "terminal",
      });
    },
  );

  it("reclassifies a terminal-before-definite-rejection as non-local", () => {
    const state = createComposerInterruptState();
    const claim = issue(state);

    expect(state.transition(terminal())).toEqual({ type: "terminalDeferred" });
    expect(
      state.transition({
        type: "settle",
        settlement: { type: "definitelyNotAccepted", claim },
      }),
    ).toEqual({ type: "definitelyNotAccepted", terminalDisposition: "nonLocal" });
    expect(state.state()).toBeNull();
  });

  it("clears a definite rejection and never lets its late settlement replace a new owner", () => {
    const state = createComposerInterruptState();
    const oldClaim = issue(state);

    expect(
      state.transition({
        type: "settle",
        settlement: { type: "definitelyNotAccepted", claim: oldClaim },
      }),
    ).toEqual({ type: "definitelyNotAccepted", terminalDisposition: null });
    expect(state.state()).toBeNull();
    expect(
      state.transition({
        type: "settle",
        settlement: { type: "definitelyNotAccepted", claim: oldClaim },
      }),
    ).toEqual({ type: "idempotentReplay", subject: "settlement" });
    expect(
      state.transition({ type: "settle", settlement: { type: "accepted", claim: oldClaim } }),
    ).toEqual({ type: "stale", subject: "settlement" });

    const newClaim = issue(state, 2, "turn-b");
    expect(
      state.transition({ type: "settle", settlement: { type: "accepted", claim: oldClaim } }),
    ).toEqual({ type: "stale", subject: "settlement" });
    expect(state.transition(terminal(1))).toEqual({ type: "terminal", disposition: "nonLocal" });
    expect(state.transition(terminal(1))).toEqual({
      type: "idempotentReplay",
      subject: "terminal",
    });
    expect(state.state()).toEqual({
      phase: "issuing",
      params: newClaim.params,
      generation: newClaim.generation,
    });
  });

  it("consumes each settlement capability exactly once", () => {
    const state = createComposerInterruptState();
    const claim = issue(state);
    const clone = {
      ...claim,
      params: { threadId: "thread-forged", turnId: "turn-forged" },
      generation: 99,
      requestId: "forged",
    };

    expect(
      state.transition({ type: "settle", settlement: { type: "deliveryUnknown", claim: clone } }),
    ).toEqual({ type: "ownershipMismatch", subject: "interruptClaim" });
    expect(state.state()).toEqual({
      phase: "issuing",
      params: { threadId: "thread-a", turnId: "turn-a" },
      generation: 1,
    });
    expect(
      state.transition({ type: "settle", settlement: { type: "deliveryUnknown", claim } }),
    ).toEqual({ type: "deliveryUnknown", terminalDisposition: null });
    expect(
      state.transition({ type: "settle", settlement: { type: "deliveryUnknown", claim: clone } }),
    ).toEqual({ type: "ownershipMismatch", subject: "interruptClaim" });
    expect(
      state.transition({ type: "settle", settlement: { type: "deliveryUnknown", claim } }),
    ).toEqual({ type: "idempotentReplay", subject: "settlement" });
    expect(state.transition({ type: "settle", settlement: { type: "accepted", claim } })).toEqual({
      type: "stale",
      subject: "settlement",
    });
  });

  it("does not let stale generation or foreign terminal identity consume the owner", () => {
    const state = createComposerInterruptState();
    const claim = issue(state, 2);
    const foreignClaim = issue(createComposerInterruptState());

    expect(
      state.transition({ type: "settle", settlement: { type: "accepted", claim: foreignClaim } }),
    ).toEqual({ type: "ownershipMismatch", subject: "interruptClaim" });
    expect(state.transition(terminal(1))).toEqual({ type: "stale", subject: "terminal" });
    expect(state.transition(terminal(2, "turn-other"))).toEqual({
      type: "terminal",
      disposition: "nonLocal",
    });
    expect(state.state()?.phase).toBe("issuing");
    expect(state.transition({ type: "settle", settlement: { type: "accepted", claim } })).toEqual({
      type: "accepted",
      terminalDisposition: null,
    });
    expect(state.transition(terminal(2))).toEqual({ type: "terminal", disposition: "local" });
  });
});
