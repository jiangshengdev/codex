import { describe, expect, it } from "vitest";

import {
  createComposerInputQueue,
  type ComposerInputQueue,
  type ComposerInputQueueTransition,
  type ComposerPendingInputDisplayKey,
  type ComposerPendingInputLane,
  type ComposerPendingInputMoveDestination,
  type StartClaim,
} from "../composerInputQueue";
import {
  createComposerSteerQueue,
  type ComposerSteerQueue,
  type SteerClaim,
} from "../composerSteerQueueState";
import { composerQueueMessage, composerSteerInput } from "./composerInputQueueTestFixtures";

function pendingPage(queue: ComposerInputQueue, lane: ComposerPendingInputLane, limit = 20) {
  const result = queue.readPendingInputPage({
    lane,
    revision: queue.detailRevision(),
    cursor: null,
    limit,
  });
  if (result.type !== "page") throw new Error(`expected ${lane} pending-input page`);
  return result;
}

function pageIds(queue: ComposerInputQueue, lane: ComposerPendingInputLane): string[] {
  return pendingPage(queue, lane).items.map(({ preview }) => {
    if (preview.type !== "text") throw new Error("expected text preview");
    return preview.text.replace("message ", "");
  });
}

function keyFor(
  queue: ComposerInputQueue,
  lane: ComposerPendingInputLane,
  messageId: string,
): ComposerPendingInputDisplayKey {
  const item = pendingPage(queue, lane).items.find(({ preview }) => {
    return preview.type === "text" && preview.text === `message ${messageId}`;
  });
  if (item == null) throw new Error(`expected pending input ${messageId}`);
  return item.key;
}

function move(
  queue: ComposerInputQueue,
  lane: ComposerPendingInputLane,
  messageId: string,
  destination: ComposerPendingInputMoveDestination,
) {
  return queue.movePendingInput({
    key: keyFor(queue, lane, messageId),
    revision: queue.detailRevision(),
    destination,
  });
}

function startClaim(transition: ComposerInputQueueTransition): StartClaim {
  const effect = transition.effects.find((candidate) => candidate.type === "performStart");
  if (effect?.type !== "performStart") throw new Error("expected start claim");
  return effect.claim;
}

function steerClaim(transition: ComposerInputQueueTransition): SteerClaim {
  const effect = transition.effects.find((candidate) => candidate.type === "performSteer");
  if (effect?.type !== "performSteer") throw new Error("expected steer claim");
  return effect.claim;
}

function enqueueSteer(
  queue: ComposerSteerQueue,
  messageId: string,
  expectedTurnId = "turn-a",
): void {
  expect(
    queue.transition({ type: "enqueue", input: composerSteerInput(messageId, expectedTurnId) }),
  ).toEqual({ type: "enqueued", messageId });
}

function issueSteer(queue: ComposerSteerQueue): SteerClaim {
  const result = queue.transition({ type: "issueNext" });
  if (result.type !== "issued") throw new Error("expected issued steer");
  return result.claim;
}

function steerQueueIds(queue: ComposerSteerQueue): string[] {
  return queue
    .state()
    .steerQueue.map((slot) =>
      slot.type === "intent" ? slot.message.id : slot.original.message.id,
    );
}

describe("composer pending input reordering", () => {
  it("preserves ordinary identity, display keys, counts, and release state through reorder", () => {
    const queue = createComposerInputQueue({ threadId: "thread-a", activeTurnId: "turn-a" });
    const a = composerQueueMessage("a");
    const b = composerQueueMessage("b");
    const c = composerQueueMessage("c");
    queue.submit(a);
    queue.submit(b);
    queue.submit(c);
    const keys = {
      a: keyFor(queue, "ordinary", "a"),
      b: keyFor(queue, "ordinary", "b"),
      c: keyFor(queue, "ordinary", "c"),
    };
    const beforeMove = queue.view();

    expect(move(queue, "ordinary", "c", "first")).toEqual({
      type: "moved",
      revision: beforeMove.detailRevision + 1,
      lane: "ordinary",
      position: 1,
      count: 3,
    });
    expect(queue.view()).toEqual({
      ...beforeMove,
      detailRevision: beforeMove.detailRevision + 1,
    });
    expect(pendingPage(queue, "ordinary").items.map(({ key }) => key)).toEqual([
      keys.c,
      keys.a,
      keys.b,
    ]);

    queue.submit(composerQueueMessage("d"));
    expect(pageIds(queue, "ordinary")).toEqual(["c", "a", "b", "d"]);
    const claim = steerClaim(queue.promoteOrdinaryFrontToSteer());
    expect(claim.intent).toEqual({
      type: "intent",
      message: c,
      threadId: "thread-a",
      expectedTurnId: "turn-a",
      clientUserMessageId: claim.intent.clientUserMessageId,
      source: "ordinaryPromotion",
    });
    expect(keyFor(queue, "steer", "c")).toEqual(keys.c);
    expect(pendingPage(queue, "ordinary").items.map(({ key }) => key)).toEqual([
      keys.a,
      keys.b,
      keyFor(queue, "ordinary", "d"),
    ]);
  });

  it("preserves complete steer identities and appends new work after the reordered tail", () => {
    const queue = createComposerSteerQueue();
    enqueueSteer(queue, "a");
    enqueueSteer(queue, "b");
    enqueueSteer(queue, "c");
    const originals = queue.state().steerQueue;

    expect(queue.movePendingInput("c", "first")).toMatchObject({ type: "moved" });
    enqueueSteer(queue, "d");
    const reordered = queue.state().steerQueue;

    expect(reordered.slice(0, 3)).toEqual([originals[2], originals[0], originals[1]]);
    expect(steerQueueIds(queue)).toEqual(["c", "a", "b", "d"]);
    expect(issueSteer(queue).intent).toEqual(originals[2]);
    expect(steerQueueIds(queue)).toEqual(["a", "b", "d"]);
  });

  it("uses reordered ordinary order for the next start claim and promotion", () => {
    const startQueue = createComposerInputQueue({ threadId: "thread-a", activeTurnId: null });
    const firstClaim = startClaim(startQueue.submit(composerQueueMessage("pending")));
    startQueue.submit(composerQueueMessage("a"));
    startQueue.submit(composerQueueMessage("b"));
    startQueue.submit(composerQueueMessage("c"));
    expect(move(startQueue, "ordinary", "c", "first")).toMatchObject({ type: "moved" });

    const retried = startQueue.settleStart({
      type: "definitelyNotAccepted",
      claim: firstClaim,
    });
    expect(startClaim(retried).message).toEqual(composerQueueMessage("c"));

    const promotionQueue = createComposerInputQueue({
      threadId: "thread-a",
      activeTurnId: "turn-a",
    });
    promotionQueue.submit(composerQueueMessage("a"));
    promotionQueue.submit(composerQueueMessage("b"));
    promotionQueue.submit(composerQueueMessage("c"));
    expect(move(promotionQueue, "ordinary", "c", "first")).toMatchObject({ type: "moved" });
    expect(steerClaim(promotionQueue.promoteOrdinaryFrontToSteer()).intent.message).toEqual(
      composerQueueMessage("c"),
    );
  });

  it("keeps the pending steer prefix fixed while sorted unsent work drives claims", () => {
    const queue = createComposerSteerQueue();
    enqueueSteer(queue, "pending");
    enqueueSteer(queue, "a");
    enqueueSteer(queue, "b");
    const pending = issueSteer(queue);

    expect(queue.movePendingInput("b", "first")).toEqual({
      type: "moved",
      position: 1,
      count: 2,
    });
    expect(queue.readPendingInputs(0, 3).map(({ messageId }) => messageId)).toEqual([
      "pending",
      "b",
      "a",
    ]);
    expect(queue.findPendingInput("pending")?.movement).toBeNull();
    expect(
      queue.transition({ type: "responseAccepted", claim: pending, turnId: "turn-a" }),
    ).toEqual({ type: "accepted", messageId: "pending" });
    expect(issueSteer(queue).intent.message.id).toBe("b");
  });

  it.each(["activeTurnNotSteerable", "terminal"] as const)(
    "preserves sorted unsent order behind a pending claim on %s target close",
    (closure) => {
      const queue = createComposerSteerQueue();
      enqueueSteer(queue, "pending");
      enqueueSteer(queue, "a");
      enqueueSteer(queue, "b");
      const pending = issueSteer(queue);
      queue.movePendingInput("b", "first");

      const result =
        closure === "activeTurnNotSteerable"
          ? queue.transition({ type: "activeTurnNotSteerable", claim: pending })
          : queue.transition({ type: "terminal", threadId: "thread-a", turnId: "turn-a" });
      expect(result).toEqual(
        closure === "activeTurnNotSteerable"
          ? {
              type: "rejected",
              reason: "activeTurnNotSteerable",
              messageIds: ["pending", "b", "a"],
            }
          : { type: "terminal", messageIds: ["pending", "b", "a"] },
      );
      expect(
        queue.state().rejectedSteersQueue.map(({ intent, reason }) => ({
          messageId: intent.message.id,
          reason,
        })),
      ).toEqual(
        ["pending", "b", "a"].map((messageId) => ({
          messageId,
          reason: closure,
        })),
      );
    },
  );

  it("closes only the requested target while retaining mixed-target sorted work", () => {
    const queue = createComposerSteerQueue();
    enqueueSteer(queue, "a-1", "turn-a");
    enqueueSteer(queue, "b-1", "turn-b");
    enqueueSteer(queue, "a-2", "turn-a");
    queue.movePendingInput("a-2", "first");

    expect(queue.transition({ type: "terminal", threadId: "thread-a", turnId: "turn-a" })).toEqual({
      type: "terminal",
      messageIds: ["a-2", "a-1"],
    });
    expect(steerQueueIds(queue)).toEqual(["b-1"]);
    expect(issueSteer(queue).intent.message.id).toBe("b-1");
  });

  it("retains reordered scheduling through takeRejected and restoreRejected", () => {
    const queue = createComposerSteerQueue();
    enqueueSteer(queue, "a");
    enqueueSteer(queue, "b");
    enqueueSteer(queue, "c");
    queue.movePendingInput("c", "first");
    queue.transition({ type: "terminal", threadId: "thread-a", turnId: "turn-a" });
    const taken = queue.transition({ type: "takeRejected" });
    if (taken.type !== "rejectedTaken") throw new Error("expected rejected transfer");

    expect(taken.transfer.entries.map(({ intent }) => intent.message.id)).toEqual(["c", "a", "b"]);
    expect(queue.transition({ type: "restoreRejected", transfer: taken.transfer })).toEqual({
      type: "rejectedRestored",
      messageIds: ["c", "a", "b"],
    });
    expect(queue.state().rejectedSteersQueue.map(({ intent }) => intent.message.id)).toEqual([
      "c",
      "a",
      "b",
    ]);
  });

  it("restores reordered rejected steers after a definite rejected-merge start failure", () => {
    const queue = createComposerInputQueue({ threadId: "thread-a", activeTurnId: "turn-a" });
    const pending = steerClaim(queue.submitSteer(composerQueueMessage("pending")));
    queue.submitSteer(composerQueueMessage("a"));
    queue.submitSteer(composerQueueMessage("b"));
    expect(move(queue, "steer", "b", "first")).toMatchObject({ type: "moved" });
    queue.settleSteer({ type: "activeTurnNotSteerable", claim: pending });

    const terminal = queue.observe({
      type: "turnCompleted",
      turnId: "turn-a",
      status: "completed",
      commitId: "terminal-a",
    });
    const merge = startClaim(terminal);
    expect(merge.message.type).toBe("rejectedSteerMerge");
    if (merge.message.type !== "rejectedSteerMerge") throw new Error("expected rejected merge");
    expect(merge.message.input).toEqual([
      ...composerQueueMessage("pending").input,
      ...composerQueueMessage("b").input,
      ...composerQueueMessage("a").input,
    ]);

    queue.settleStart({ type: "definitelyNotAccepted", claim: merge });
    expect(queue.view().rejectedSteers.map(({ key }) => key)).toEqual(["pending", "b", "a"]);
  });

  it("uses reordered scheduling when outstanding recovery is restored after target close", () => {
    const queue = createComposerSteerQueue();
    enqueueSteer(queue, "a");
    enqueueSteer(queue, "b");
    enqueueSteer(queue, "c");
    queue.movePendingInput("b", "first");
    const failed = issueSteer(queue);
    const recovery = queue.transition({ type: "definitelyNotAccepted", claim: failed });
    if (recovery.type !== "recoveryRequired") throw new Error("expected recovery transfer");
    expect(
      queue.readPendingInputs(0, 20).map(({ messageId, movement }) => ({ messageId, movement })),
    ).toEqual([
      { messageId: "a", movement: null },
      { messageId: "c", movement: null },
    ]);
    expect(queue.findPendingInput("a")?.movement).toBeNull();
    expect(queue.findPendingInput("c")?.movement).toBeNull();
    expect(queue.movePendingInput("a", "first")).toEqual({ type: "notManageable" });
    expect(queue.transition({ type: "terminal", threadId: "thread-a", turnId: "turn-a" })).toEqual({
      type: "terminal",
      messageIds: ["a", "c"],
    });

    expect(queue.transition({ type: "restoreRecovery", transfer: recovery.transfer })).toEqual({
      type: "recoveryRestored",
      messageIds: [],
      rejectedMessageIds: ["b"],
    });
    expect(queue.state().rejectedSteersQueue.map(({ intent }) => intent.message.id)).toEqual([
      "b",
      "a",
      "c",
    ]);
  });
});
