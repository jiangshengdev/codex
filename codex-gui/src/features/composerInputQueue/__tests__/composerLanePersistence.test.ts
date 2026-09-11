import { describe, expect, it } from "vitest";
import {
  baseTurn,
  inProgressTurn,
  userMessage,
} from "@/features/projection/__tests__/projectionTestBuilders";
import { createComposerOrdinaryQueueState } from "../composerOrdinaryQueueState";
import { ComposerStartQueueState } from "../composerStartQueueState";
import { createComposerSteerQueue } from "../composerSteerQueueState";
import { createComposerInterruptState } from "../composerInterruptState";
import { ComposerPendingInputIdentity } from "../composerPendingInputIdentity";
import { composerQueueMessage, composerSteerInput } from "./composerInputQueueTestFixtures";

function decodeMessage(value: unknown) {
  if (typeof value !== "string") throw new Error("Invalid test message");
  return composerQueueMessage(value);
}

describe("lane persistence and transaction candidates", () => {
  it("keeps an earlier terminal batch ahead of later rejections during snapshot convergence", () => {
    const owner = createComposerSteerQueue();
    owner.transition({ type: "enqueue", input: composerSteerInput("early", "turn-a") });
    owner.transition({ type: "issueNext" });
    owner.transition({ type: "terminal", threadId: "thread-a", turnId: "turn-a" });
    owner.transition({ type: "enqueue", input: composerSteerInput("later", "turn-b") });
    owner.transition({ type: "terminal", threadId: "thread-a", turnId: "turn-b" });
    const state = owner.exportState(({ id }) => id);
    const restored = createComposerSteerQueue();
    restored.rehydrateState(
      {
        ...state,
        pending: state.pending.map((entry) => ({ ...entry, phase: "acceptedAwaitingCommit" })),
      },
      decodeMessage,
    );
    restored.reconcileSnapshot([baseTurn("turn-a")]);
    const taken = restored.transition({ type: "takeRejected" });
    expect(taken.type).toBe("rejectedTaken");
    if (taken.type !== "rejectedTaken") throw new Error("Expected rejected transfer");
    expect(taken.transfer.entries.map(({ intent }) => intent.message.id)).toEqual([
      "early",
      "later",
    ]);
  });

  it("confirms restored start from snapshot client identity without replaying historical owners", () => {
    const owner = new ComposerStartQueueState();
    const claim = owner.issue(composerQueueMessage("snapshot-start"));
    const restored = new ComposerStartQueueState();
    restored.rehydrateState(
      owner.exportState(({ id }) => id),
      decodeMessage,
    );
    expect(restored.reconcileSnapshot([baseTurn("unrelated")])).toEqual({ type: "unresolved" });
    const item = userMessage("committed-start", [], claim.clientUserMessageId);
    expect(restored.reconcileSnapshot([baseTurn("confirmed", [item])])).toMatchObject({
      type: "resolved",
      turnId: "confirmed",
      terminal: true,
    });
    expect(restored.hasPending()).toBe(false);
  });

  it("confirms accepted start from its known snapshot turn without requiring a live event", () => {
    const owner = new ComposerStartQueueState();
    const claim = owner.issue(composerQueueMessage("accepted-start"));
    owner.settle({ type: "accepted", claim, turnId: "known" });
    expect(owner.reconcileSnapshot([inProgressTurn("known")])).toEqual({
      type: "resolved",
      claim,
      turnId: "known",
      terminal: false,
    });
  });

  it("uses snapshot committed client identity to release unknown steer and keeps absent delivery blocked", () => {
    const owner = createComposerSteerQueue();
    owner.transition({ type: "enqueue", input: composerSteerInput("snapshot-steer") });
    const issued = owner.transition({ type: "issueNext" });
    if (issued.type !== "issued") throw new Error("Expected steer claim");
    const restored = createComposerSteerQueue();
    restored.rehydrateState(
      owner.exportState(({ id }) => id),
      decodeMessage,
    );
    restored.reconcileSnapshot([baseTurn("turn-a")]);
    expect(restored.unknownMessages().map(({ id }) => id)).toEqual(["snapshot-steer"]);
    const item = userMessage("committed-steer", [], issued.claim.intent.clientUserMessageId);
    expect(restored.reconcileSnapshot([baseTurn("turn-a", [item])])).toContainEqual({
      type: "committed",
      messageId: "snapshot-steer",
    });
    expect(restored.unknownMessages()).toEqual([]);
  });

  it("settles a restored interrupt from its target terminal snapshot", () => {
    const owner = createComposerInterruptState();
    owner.transition({
      type: "issue",
      params: { threadId: "thread-a", turnId: "turn-a" },
      generation: 1,
    });
    const restored = createComposerInterruptState();
    restored.rehydrateState(owner.exportState(), 2);
    expect(restored.reconcileSnapshot([baseTurn("unrelated")], 2)).toBeNull();
    expect(
      restored.reconcileSnapshot([{ ...baseTurn("turn-a"), status: "interrupted" }], 2)?.type,
    ).toBe("terminal");
    expect(restored.state()).toBeNull();
  });
  it("keeps a live edit reservation usable after a discarded candidate", () => {
    const owner = createComposerOrdinaryQueueState();
    owner.enqueue(composerQueueMessage("original"));
    const acquired = owner.acquirePendingInputEdit(0);
    if (acquired.type !== "acquired") throw new Error("Expected edit acquisition");
    const reservation = owner.reservePendingInputEdit(acquired.acquisition);
    if (reservation == null) throw new Error("Expected edit reservation");
    const candidate = owner.fork();
    expect(candidate.savePendingInputEdit(reservation, composerQueueMessage("changed")).type).toBe(
      "settled",
    );
    expect(owner.exportState(({ id }) => id)).toEqual(["original"]);
    expect(owner.savePendingInputEdit(reservation, composerQueueMessage("saved")).type).toBe(
      "settled",
    );
    expect(owner.exportState(({ id }) => id)).toEqual(["saved"]);
  });

  it("restores the saved ordinary original without its temporary reservation", () => {
    const owner = createComposerOrdinaryQueueState();
    owner.enqueue(composerQueueMessage("original"));
    owner.acquirePendingInputEdit(0);
    const restored = createComposerOrdinaryQueueState();
    restored.rehydrateState(
      owner.exportState(({ id }) => id),
      decodeMessage,
    );
    expect(restored.takeFront().type).toBe("taken");
  });

  it("preserves a start claim across candidate commits and restores issuing as unknown", () => {
    const owner = new ComposerStartQueueState();
    const claim = owner.issue(composerQueueMessage("a"));
    const candidate = owner.fork();
    candidate.settle({ type: "accepted", claim, turnId: "turn-a" });
    expect(owner.pendingPhase()).toBe("issuing");
    const restored = new ComposerStartQueueState();
    restored.rehydrateState(
      owner.exportState(({ id }) => id),
      decodeMessage,
    );
    expect(restored.pendingPhase()).toBe("deliveryUnknown");
    expect(restored.unknownMessages().map(({ id }) => id)).toEqual(["a"]);
    expect(restored.discardUnknown("a")).toMatchObject({
      type: "start",
      message: composerQueueMessage("a"),
      clientUserMessageId: claim.clientUserMessageId,
    });
    expect(restored.hasPending()).toBe(false);
    expect(restored.unknownMessages()).toEqual([]);
    owner.adopt(candidate);
    expect(owner.pendingPhase()).toBe("acceptedAwaitingRuntime");
  });

  it("only releases the matching unknown start claim", () => {
    const owner = new ComposerStartQueueState();
    expect(owner.discardUnknown("a")).toBeNull();
    const claim = owner.issue(composerQueueMessage("a"));
    expect(owner.discardUnknown("a")).toBeNull();
    expect(owner.pendingPhase()).toBe("issuing");
    owner.settle({ type: "deliveryUnknown", claim });
    expect(owner.discardUnknown("other")).toBeNull();
    expect(owner.pendingPhase()).toBe("deliveryUnknown");
    expect(owner.discardUnknown("a")).toBe(claim);
    expect(owner.exportState(({ id }) => id).pending).toBeNull();
    expect(owner.discardUnknown("a")).toBeNull();

    const accepted = owner.issue(composerQueueMessage("accepted"));
    owner.settle({ type: "accepted", claim: accepted, turnId: "turn-a" });
    expect(owner.discardUnknown("accepted")).toBeNull();
    expect(owner.pendingPhase()).toBe("acceptedAwaitingRuntime");
  });

  it("keeps rejected transfer ownership when a candidate consumes it", () => {
    const owner = createComposerSteerQueue();
    owner.transition({ type: "enqueue", input: composerSteerInput("a") });
    owner.transition({ type: "terminal", threadId: "thread-a", turnId: "turn-a" });
    const taken = owner.transition({ type: "takeRejected" });
    if (taken.type !== "rejectedTaken") throw new Error("Expected transfer");
    const candidate = owner.fork();
    expect(candidate.transition({ type: "releaseRejected", transfer: taken.transfer }).type).toBe(
      "rejectedReleased",
    );
    const persisted = owner.exportRejectedTransfer(taken.transfer, ({ id }) => id);
    const restored = createComposerSteerQueue();
    restored.rehydrateState(
      owner.exportState(({ id }) => id),
      decodeMessage,
    );
    const newTransfer = restored.rehydrateRejectedTransfer(persisted, decodeMessage);
    expect(restored.transition({ type: "restoreRejected", transfer: taken.transfer }).type).toBe(
      "ownershipMismatch",
    );
    expect(restored.transition({ type: "restoreRejected", transfer: newTransfer }).type).toBe(
      "rejectedRestored",
    );
    expect(owner.transition({ type: "restoreRejected", transfer: taken.transfer }).type).toBe(
      "rejectedRestored",
    );
  });

  it("does not convert an unconfirmed steer to a resendable rejection on terminal", () => {
    const owner = createComposerSteerQueue();
    owner.transition({ type: "enqueue", input: composerSteerInput("a") });
    const issued = owner.transition({ type: "issueNext" });
    if (issued.type !== "issued") throw new Error("Expected claim");
    const restored = createComposerSteerQueue();
    restored.rehydrateState(
      owner.exportState(({ id }) => id),
      decodeMessage,
    );
    restored.transition({ type: "terminal", threadId: "thread-a", turnId: "turn-a" });
    expect(restored.transition({ type: "takeRejected" }).type).toBe("empty");
    expect(restored.transition({ type: "issueNext" })).toEqual({
      type: "blocked",
      phase: "deliveryUnknown",
    });
    expect(
      restored.transition({
        type: "committed",
        threadId: "thread-a",
        turnId: "turn-a",
        clientUserMessageId: issued.claim.intent.clientUserMessageId,
      }).type,
    ).toBe("committed");
  });

  it("restores interrupt issuing as unknown and accepts a current terminal without the old promise", () => {
    const owner = createComposerInterruptState();
    const params = { threadId: "thread-a", turnId: "turn-a" };
    const issued = owner.transition({ type: "issue", params, generation: 1 });
    if (issued.type !== "issued") throw new Error("Expected interrupt claim");
    const restored = createComposerInterruptState();
    restored.rehydrateState(owner.exportState(), 2);
    expect(restored.state()?.phase).toBe("unknown");
    expect(
      restored.transition({ type: "settle", settlement: { type: "accepted", claim: issued.claim } })
        .type,
    ).toBe("ownershipMismatch");
    expect(restored.transition({ type: "terminal", fact: { params, generation: 2 } }).type).toBe(
      "terminal",
    );
  });

  it("restores interrupt targets while discarding additional persisted fields", () => {
    const owner = createComposerInterruptState();
    const params = { threadId: "thread-a", turnId: "turn-a" };
    const target = { ...params, extra: "ignored" };
    owner.rehydrateState(
      {
        pending: { params: target, phase: "accepted", terminal: target },
        recentTerminals: [target],
      },
      2,
    );
    expect(owner.exportState()).toEqual({
      pending: { params, phase: "accepted", terminal: params },
      recentTerminals: [params],
    });
  });

  it.each([
    {},
    { threadId: "thread-a" },
    { turnId: "turn-a" },
    { threadId: 1, turnId: "turn-a" },
    { threadId: "thread-a", turnId: null },
  ])("rejects malformed interrupt targets without replacing live state: %j", (invalidTarget) => {
    const owner = createComposerInterruptState();
    owner.transition({
      type: "issue",
      params: { threadId: "thread-a", turnId: "turn-a" },
      generation: 1,
    });
    const saved = owner.exportState();
    const pending = saved.pending;
    if (pending === null) throw new Error("Expected pending interrupt");
    for (const invalidState of [
      { ...saved, pending: { ...pending, params: invalidTarget } },
      { ...saved, pending: { ...pending, terminal: invalidTarget } },
      { ...saved, recentTerminals: [invalidTarget] },
    ]) {
      expect(() => {
        owner.rehydrateState(invalidState, 2);
      }).toThrow("Invalid persisted interrupt target");
      expect(owner.exportState()).toEqual(saved);
    }
  });

  it("rejects invalid interrupt phases and mismatched terminals without replacing live state", () => {
    const owner = createComposerInterruptState();
    owner.transition({
      type: "issue",
      params: { threadId: "thread-a", turnId: "turn-a" },
      generation: 1,
    });
    const saved = owner.exportState();
    const pending = saved.pending;
    if (pending === null) throw new Error("Expected pending interrupt");
    expect(() => {
      owner.rehydrateState({ ...saved, pending: { ...pending, phase: "invalid" } }, 2);
    }).toThrow("Invalid persisted interrupt phase");
    expect(owner.exportState()).toEqual(saved);
    expect(() => {
      owner.rehydrateState(
        {
          ...saved,
          pending: { ...pending, terminal: { threadId: "thread-a", turnId: "turn-b" } },
        },
        2,
      );
    }).toThrow("Persisted interrupt terminal has a different target");
    expect(owner.exportState()).toEqual(saved);
  });

  it("preserves cursor ownership on an adopted candidate", () => {
    const identity = new ComposerPendingInputIdentity();
    const cursor = identity.createCursor("ordinary", 1);
    identity.adopt(identity.fork());
    expect(identity.resolvePage(0, "ordinary", cursor)).toEqual({ type: "current", offset: 1 });
  });

  it("rejects malformed restored phases without changing the live lane", () => {
    const owner = new ComposerStartQueueState();
    owner.issue(composerQueueMessage("a"));
    const state = owner.exportState(({ id }) => id);
    expect(() => {
      owner.rehydrateState(
        { ...state, pending: { ...state.pending, phase: "invalid" } },
        decodeMessage,
      );
    }).toThrow("Invalid persisted start phase");
    expect(owner.pendingPhase()).toBe("issuing");
  });
});
