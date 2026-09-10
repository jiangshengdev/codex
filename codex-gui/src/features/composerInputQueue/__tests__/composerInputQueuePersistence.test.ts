import { describe, expect, it } from "vitest";
import { createComposerInputQueue, type ComposerInputQueue } from "../composerInputQueue";
import { composerDraftCapture, composerQueueMessage } from "./composerInputQueueTestFixtures";
import {
  baseTurn,
  inProgressTurn,
  userMessage,
} from "@/features/projection/__tests__/projectionTestBuilders";

function firstOrdinary(queue: ComposerInputQueue) {
  const page = queue.readPendingInputPage({
    lane: "ordinary",
    revision: queue.detailRevision(),
    cursor: null,
    limit: 20,
  });
  if (page.type !== "page" || page.items[0] == null) throw new Error("Expected ordinary input");
  return page.items[0];
}

function restored(queue: ComposerInputQueue): ComposerInputQueue {
  const next = createComposerInputQueue({ threadId: "thread-a", activeTurnId: null });
  const serialized: unknown = JSON.parse(JSON.stringify(queue.exportState(null)));
  next.rehydrateState(serialized);
  return next;
}

describe("composer queue persistence transactions", () => {
  it.each([
    "acceptedAwaitingCommit",
    "issuing",
    "deliveryUnknown",
    "responseTurnMismatch",
  ] as const)("recovers legacy %s without granting automatic resend permission", (phase) => {
    const queue = createComposerInputQueue({ threadId: "thread-a", activeTurnId: "turn-a" });
    queue.submitSteer(composerQueueMessage("legacy"));
    queue.observe({
      type: "turnCompleted",
      turnId: "turn-a",
      status: "completed",
      commitId: "terminal",
    });
    const current = queue.exportState(null);
    const legacy = {
      ...current,
      version: 1,
      steer: {
        ...current.steer,
        pending: current.steer.pending.map((entry) => ({ ...entry, phase })),
        closedTargets: current.steer.closedTargets.map(({ target, ...identity }) => ({
          ...identity,
          target: { reason: target.reason, rejectionBatch: target.rejectionBatch },
        })),
      },
    };
    const restoredQueue = createComposerInputQueue({ threadId: "thread-a", activeTurnId: null });
    expect(restoredQueue.rehydrateState(legacy)).toBeNull();
    const result = restoredQueue.reconcileSnapshot([baseTurn("turn-a")]);
    const accepted = phase === "acceptedAwaitingCommit";
    expect(result.effects).toMatchObject(
      accepted
        ? [
            {
              type: "recover",
              batch: {
                reason: "userStopped",
                rejected: {
                  entries: [
                    { intent: { message: { input: composerQueueMessage("legacy").input } } },
                  ],
                },
              },
            },
          ]
        : [],
    );
    const effect = result.effects[0];
    expect(
      restoredQueue.exportState(effect?.type === "recover" ? effect.batch : null).version,
    ).toBe(2);
    expect(restoredQueue.unknownMessages()).toHaveLength(accepted ? 0 : 1);
    expect(restoredQueue.view().guidingCount).toBe(accepted ? 0 : 1);
  });

  it("matches a legacy accepted commit before producing manual recovery", () => {
    const queue = createComposerInputQueue({ threadId: "thread-a", activeTurnId: "turn-a" });
    queue.submitSteer(composerQueueMessage("legacy"));
    queue.observe({
      type: "turnCompleted",
      turnId: "turn-a",
      status: "completed",
      commitId: "terminal",
    });
    const current = queue.exportState(null);
    const pending = current.steer.pending[0];
    if (pending == null) throw new Error("Expected pending steer");
    const legacy = {
      ...current,
      version: 1,
      steer: {
        ...current.steer,
        pending: [{ ...pending, phase: "acceptedAwaitingCommit" }],
        closedTargets: current.steer.closedTargets.map(({ target, ...identity }) => ({
          ...identity,
          target: { reason: target.reason, rejectionBatch: target.rejectionBatch },
        })),
      },
    };
    const restoredQueue = createComposerInputQueue({ threadId: "thread-a", activeTurnId: null });
    restoredQueue.rehydrateState(legacy);
    const committed = userMessage("committed", [], pending.intent.clientUserMessageId);
    expect(
      restoredQueue.reconcileSnapshot([{ ...baseTurn("turn-a"), items: [committed] }]).effects,
    ).toEqual([]);
    expect(restoredQueue.view().releaseState).toEqual({ type: "safe" });
  });

  it("replaces the current turn from a candidate snapshot only when its transaction commits", () => {
    const queue = createComposerInputQueue({ threadId: "thread-a", activeTurnId: "old-turn" });
    queue.submit(composerQueueMessage("queued"));
    queue.setAutomaticSendingPaused(true);
    const rejected = queue.prepare((candidate) => candidate.reconcileSnapshot([]));
    expect(rejected.result.effects).toEqual([]);
    expect(rejected.queue.currentTurnId()).toBeNull();
    expect(queue.currentTurnId()).toBe("old-turn");
    const accepted = queue.prepare((candidate) =>
      candidate.reconcileSnapshot([inProgressTurn("new-turn")]),
    );
    expect(accepted.result.effects).toEqual([]);
    accepted.commit();
    expect(queue.currentTurnId()).toBe("new-turn");
    expect(queue.view().ordinaryQueuedCount).toBe(1);
  });

  it("keeps the live queue unchanged until the prepared candidate is committed", () => {
    const queue = createComposerInputQueue({ threadId: "thread-a", activeTurnId: "turn-a" });
    const prepared = queue.prepare((candidate) => candidate.submit(composerQueueMessage("a")));
    expect(prepared.result.result.type).toBe("queued");
    expect(queue.view().ordinaryQueuedCount).toBe(0);
    expect(prepared.queue.exportState(null).ordinary).toHaveLength(1);
    prepared.commit();
    expect(queue.view().ordinaryQueuedCount).toBe(1);
  });

  it("does not consume an edit reservation when its candidate cannot be saved", () => {
    const queue = createComposerInputQueue({ threadId: "thread-a", activeTurnId: "turn-a" });
    queue.submit(composerQueueMessage("a"));
    const edit = queue.beginPendingInputEdit(
      { key: firstOrdinary(queue).key, revision: queue.detailRevision() },
      () => ({ type: "restored" }),
    );
    if (edit.type !== "begun") throw new Error("Expected edit");
    const candidate = queue.prepare(() => edit.reservation.save(composerDraftCapture("updated")));
    expect(candidate.result.type).toBe("saved");
    expect(queue.exportState(null).ordinary[0]?.input).toEqual(composerQueueMessage("a").input);
    expect(firstOrdinary(queue).management.type).toBe("editing");
    const retry = queue.prepare(() => edit.reservation.save(composerDraftCapture("updated")));
    retry.commit();
    expect(firstOrdinary(queue).management.type).toBe("manageable");
    expect(queue.exportState(null).ordinary[0]?.input).toEqual(
      composerDraftCapture("updated").input,
    );
  });

  it("restores only the saved original of an active edit and pauses terminal and new-input drains", () => {
    const queue = createComposerInputQueue({ threadId: "thread-a", activeTurnId: "turn-a" });
    queue.submit(composerQueueMessage("a"));
    queue.beginPendingInputEdit(
      { key: firstOrdinary(queue).key, revision: queue.detailRevision() },
      () => ({ type: "restored" }),
    );
    const next = restored(queue);
    expect(firstOrdinary(next).management.type).toBe("manageable");
    expect(
      next.observe({
        type: "turnCompleted",
        turnId: "turn-a",
        status: "completed",
        commitId: "terminal-a",
      }).effects,
    ).toEqual([]);
    expect(next.submit(composerQueueMessage("b")).effects).toEqual([]);
    expect(next.drainPendingInput({ lane: "ordinary" }).effects).toEqual([]);
    next.setAutomaticSendingPaused(false);
    expect(next.drainPendingInput({ lane: "ordinary" }).effects[0]?.type).toBe("performStart");
  });

  it("keeps restored issuing starts unknown even after manual continuation", () => {
    const queue = createComposerInputQueue({ threadId: "thread-a", activeTurnId: null });
    queue.submit(composerQueueMessage("a"));
    queue.submit(composerQueueMessage("b"));
    const next = restored(queue);
    expect(next.unknownMessages()).toEqual([{ id: "a", text: "message a" }]);
    next.setAutomaticSendingPaused(false);
    expect(next.drainPendingInput({ lane: "ordinary" }).effects).toEqual([]);
    expect(next.discardUnknown("a")).toBe(true);
    expect(next.unknownMessages()).toEqual([]);
    expect(next.drainPendingInput({ lane: "ordinary" }).effects[0]?.type).toBe("performStart");
  });

  it.each(["start", "steer"] as const)(
    "preserves other records and round-trips a discarded unknown %s",
    (lane) => {
      const queue = createComposerInputQueue({
        threadId: "thread-a",
        activeTurnId: lane === "steer" ? "turn-a" : null,
      });
      if (lane === "steer") queue.submitSteer(composerQueueMessage("unknown"));
      else queue.submit(composerQueueMessage("unknown"));
      queue.submit(composerQueueMessage("preserved"));
      const next = restored(queue);
      const before = next.exportState(null);
      const revision = next.detailRevision();
      expect(next.discardUnknown("missing")).toBe(false);
      expect(next.exportState(null)).toEqual(before);
      expect(next.detailRevision()).toBe(revision);
      expect(next.discardUnknown("unknown")).toBe(true);
      expect(next.detailRevision()).not.toBe(revision);
      const after = next.exportState(null);
      expect(after.knownMessageIds).toEqual(["preserved"]);
      expect(after.ordinary).toEqual(before.ordinary);
      expect(restored(next).unknownMessages()).toEqual([]);
      expect(restored(next).view().ordinaryQueuedCount).toBe(1);
      expect(next.discardUnknown("unknown")).toBe(false);
    },
  );

  it("preserves live claim ownership across prepared adoption", () => {
    const queue = createComposerInputQueue({ threadId: "thread-a", activeTurnId: null });
    const first = queue.prepare((candidate) => candidate.submit(composerQueueMessage("a")));
    const effect = first.result.effects[0];
    if (effect?.type !== "performStart") throw new Error("Expected start");
    first.commit();
    const second = queue.prepare((candidate) =>
      candidate.settleStart({ type: "accepted", claim: effect.claim, turnId: "turn-a" }),
    );
    expect(second.result.result).toEqual({ type: "applied", operation: "startAccepted" });
    second.commit();
  });

  it("rejects malformed input and foreign ownership without replacing live state", () => {
    const queue = createComposerInputQueue({ threadId: "thread-a", activeTurnId: "turn-a" });
    queue.submit(composerQueueMessage("a"));
    const state = queue.exportState(null);
    expect(() => queue.rehydrateState({ ...state, threadId: "another" })).toThrow(
      "Invalid persisted composer queue version or owner",
    );
    expect(() =>
      queue.rehydrateState({
        ...state,
        ordinary: [{ ...state.ordinary[0], input: [{ type: "invented" }] }],
      }),
    ).toThrow("Invalid persisted composer input");
    expect(queue.view().ordinaryQueuedCount).toBe(1);
    expect(queue.currentTurnId()).toBe("turn-a");
  });

  it("reconciles an accepted start from a completed snapshot without changing the current owner", () => {
    const queue = createComposerInputQueue({ threadId: "thread-a", activeTurnId: null });
    const effect = queue.submit(composerQueueMessage("a")).effects[0];
    if (effect?.type !== "performStart") throw new Error("Expected start");
    queue.settleStart({ type: "accepted", claim: effect.claim, turnId: "past-turn" });
    queue.submit(composerQueueMessage("b"));
    const next = restored(queue);
    expect(next.reconcileSnapshot([baseTurn("past-turn")]).effects).toEqual([]);
    expect(next.currentTurnId()).toBeNull();
    next.setAutomaticSendingPaused(false);
    expect(next.drain().effects[0]?.type).toBe("performStart");
  });

  it("requires positive client evidence before releasing an unknown start from a snapshot", () => {
    const queue = createComposerInputQueue({ threadId: "thread-a", activeTurnId: null });
    const effect = queue.submit(composerQueueMessage("a")).effects[0];
    if (effect?.type !== "performStart") throw new Error("Expected start");
    queue.submit(composerQueueMessage("b"));
    const next = restored(queue);
    next.reconcileSnapshot([baseTurn("other-turn")]);
    expect(next.unknownMessages()).toHaveLength(1);
    const committed = userMessage(
      "item-a",
      [{ type: "text", text: "message a", text_elements: [] }],
      effect.claim.clientUserMessageId,
    );
    expect(next.reconcileSnapshot([baseTurn("past-turn", [committed])]).effects).toEqual([]);
    expect(next.unknownMessages()).toEqual([]);
    next.setAutomaticSendingPaused(false);
    expect(next.drain().effects[0]?.type).toBe("performStart");
  });
});
