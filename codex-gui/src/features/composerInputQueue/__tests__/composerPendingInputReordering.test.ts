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
  return queue.state().steerQueue.map((slot) =>
    slot.type === "intent" ? slot.message.id : slot.original.message.id,
  );
}

describe("composer pending input reordering", () => {
  it.each([
    ["earlier", "c", ["a", "c", "b"]],
    ["later", "a", ["b", "a", "c"]],
    ["first", "c", ["c", "a", "b"]],
    ["last", "a", ["b", "c", "a"]],
  ] as const)("moves an ordinary input to %s", (destination, messageId, expected) => {
    const queue = createComposerInputQueue({ threadId: "thread-a", activeTurnId: "turn-a" });
    queue.submit(composerQueueMessage("a"));
    queue.submit(composerQueueMessage("b"));
    queue.submit(composerQueueMessage("c"));
    const revision = queue.detailRevision();

    expect(move(queue, "ordinary", messageId, destination)).toEqual({
      type: "moved",
      revision: revision + 1,
      lane: "ordinary",
      position: expected.indexOf(messageId) + 1,
      count: 3,
    });
    expect(pageIds(queue, "ordinary")).toEqual(expected);
  });

  it.each([
    ["earlier", "c", ["a", "c", "b"]],
    ["later", "a", ["b", "a", "c"]],
    ["first", "c", ["c", "a", "b"]],
    ["last", "a", ["b", "c", "a"]],
  ] as const)("moves a steer input to %s", (destination, messageId, expected) => {
    const queue = createComposerSteerQueue();
    enqueueSteer(queue, "a");
    enqueueSteer(queue, "b");
    enqueueSteer(queue, "c");

    expect(queue.movePendingInput(messageId, destination)).toEqual({
      type: "moved",
      position: expected.indexOf(messageId) + 1,
      count: 3,
    });
    expect(steerQueueIds(queue)).toEqual(expected);
  });

  it("projects complete 1-based movement tables for ordinary and the steer sortable suffix", () => {
    const movementTable = (queue: ComposerInputQueue, lane: ComposerPendingInputLane) =>
      pendingPage(queue, lane).items.map(({ preview, movement }) => {
        if (preview.type !== "text") throw new Error("expected text preview");
        return { messageId: preview.text.replace("message ", ""), movement };
      });
    const ordinary = createComposerInputQueue({
      threadId: "thread-a",
      activeTurnId: "turn-a",
    });
    ordinary.submit(composerQueueMessage("a"));
    ordinary.submit(composerQueueMessage("b"));
    ordinary.submit(composerQueueMessage("c"));

    expect(movementTable(ordinary, "ordinary")).toEqual([
      {
        messageId: "a",
        movement: {
          position: 1,
          count: 3,
          canMoveEarlier: false,
          canMoveLater: true,
        },
      },
      {
        messageId: "b",
        movement: {
          position: 2,
          count: 3,
          canMoveEarlier: true,
          canMoveLater: true,
        },
      },
      {
        messageId: "c",
        movement: {
          position: 3,
          count: 3,
          canMoveEarlier: true,
          canMoveLater: false,
        },
      },
    ]);
    move(ordinary, "ordinary", "c", "first");
    expect(movementTable(ordinary, "ordinary")).toEqual([
      {
        messageId: "c",
        movement: {
          position: 1,
          count: 3,
          canMoveEarlier: false,
          canMoveLater: true,
        },
      },
      {
        messageId: "a",
        movement: {
          position: 2,
          count: 3,
          canMoveEarlier: true,
          canMoveLater: true,
        },
      },
      {
        messageId: "b",
        movement: {
          position: 3,
          count: 3,
          canMoveEarlier: true,
          canMoveLater: false,
        },
      },
    ]);

    const steer = createComposerInputQueue({ threadId: "thread-a", activeTurnId: "turn-a" });
    steer.submitSteer(composerQueueMessage("pending"));
    steer.submitSteer(composerQueueMessage("a"));
    steer.submitSteer(composerQueueMessage("b"));
    steer.submitSteer(composerQueueMessage("c"));

    expect(movementTable(steer, "steer")).toEqual([
      { messageId: "pending", movement: null },
      {
        messageId: "a",
        movement: {
          position: 1,
          count: 3,
          canMoveEarlier: false,
          canMoveLater: true,
        },
      },
      {
        messageId: "b",
        movement: {
          position: 2,
          count: 3,
          canMoveEarlier: true,
          canMoveLater: true,
        },
      },
      {
        messageId: "c",
        movement: {
          position: 3,
          count: 3,
          canMoveEarlier: true,
          canMoveLater: false,
        },
      },
    ]);
    move(steer, "steer", "c", "first");
    expect(movementTable(steer, "steer")).toEqual([
      { messageId: "pending", movement: null },
      {
        messageId: "c",
        movement: {
          position: 1,
          count: 3,
          canMoveEarlier: false,
          canMoveLater: true,
        },
      },
      {
        messageId: "a",
        movement: {
          position: 2,
          count: 3,
          canMoveEarlier: true,
          canMoveLater: true,
        },
      },
      {
        messageId: "b",
        movement: {
          position: 3,
          count: 3,
          canMoveEarlier: true,
          canMoveLater: false,
        },
      },
    ]);
  });

  it.each([
    ["ordinary", "a", "earlier"],
    ["ordinary", "c", "later"],
    ["steer", "a", "first"],
    ["steer", "c", "last"],
  ] as const)(
    "returns a no-op without advancing revision at the %s boundary",
    (lane, messageId, destination) => {
      const queue = createComposerInputQueue({ threadId: "thread-a", activeTurnId: "turn-a" });
      const submit = lane === "ordinary" ? queue.submit : queue.submitSteer;
      submit(composerQueueMessage("a"));
      submit(composerQueueMessage("b"));
      submit(composerQueueMessage("c"));
      // The first steer is a fixed delivery prefix, so b/c are its queued boundaries.
      const targetId = lane === "steer" && destination === "first" ? "b" : messageId;
      const revision = queue.detailRevision();

      expect(move(queue, lane, targetId, destination)).toEqual({
        type: "noOp",
        reason: "alreadyAtDestination",
        revision,
      });
      expect(queue.detailRevision()).toBe(revision);
    },
  );

  it("invalidates old cursors and revisions only after a real move", () => {
    const queue = createComposerInputQueue({ threadId: "thread-a", activeTurnId: "turn-a" });
    queue.submit(composerQueueMessage("a"));
    queue.submit(composerQueueMessage("b"));
    queue.submit(composerQueueMessage("c"));
    const revision = queue.detailRevision();
    const firstPage = queue.readPendingInputPage({
      lane: "ordinary",
      revision,
      cursor: null,
      limit: 1,
    });
    if (firstPage.type !== "page" || firstPage.nextCursor == null) {
      throw new Error("expected cursor-bearing first page");
    }
    const key = firstPage.items[0]?.key;
    if (key == null) throw new Error("expected first pending key");

    expect(
      queue.movePendingInput({ key, revision, destination: "last" }),
    ).toMatchObject({ type: "moved", revision: revision + 1 });
    expect(
      queue.readPendingInputPage({
        lane: "ordinary",
        revision,
        cursor: firstPage.nextCursor,
        limit: 1,
      }),
    ).toEqual({ type: "stale", revision: revision + 1 });
    expect(
      queue.movePendingInput({ key, revision, destination: "first" }),
    ).toEqual({ type: "stale", revision: revision + 1 });
    expect(pageIds(queue, "ordinary")).toEqual(["b", "c", "a"]);
  });

  it("rejects foreign, drained, and pending-delivery keys without changing order or revision", () => {
    const queue = createComposerInputQueue({ threadId: "thread-a", activeTurnId: "turn-a" });
    queue.submit(composerQueueMessage("a"));
    queue.submit(composerQueueMessage("b"));
    const foreign = createComposerInputQueue({ threadId: "thread-b", activeTurnId: "turn-b" });
    foreign.submit(composerQueueMessage("foreign"));
    const foreignKey = keyFor(foreign, "ordinary", "foreign");
    const revision = queue.detailRevision();

    expect(
      queue.movePendingInput({ key: foreignKey, revision, destination: "first" }),
    ).toEqual({ type: "notManageable", revision });
    expect(queue.detailRevision()).toBe(revision);
    expect(pageIds(queue, "ordinary")).toEqual(["a", "b"]);

    const drained = createComposerInputQueue({ threadId: "thread-a", activeTurnId: null });
    const pendingStart = startClaim(drained.submit(composerQueueMessage("pending-start")));
    drained.submit(composerQueueMessage("drained"));
    const drainedKey = keyFor(drained, "ordinary", "drained");
    const beforeDrainRevision = drained.detailRevision();
    drained.settleStart({ type: "definitelyNotAccepted", claim: pendingStart });
    const afterDrainRevision = drained.detailRevision();
    expect(
      drained.movePendingInput({
        key: drainedKey,
        revision: afterDrainRevision,
        destination: "first",
      }),
    ).toEqual({ type: "notManageable", revision: afterDrainRevision });
    expect(drained.detailRevision()).toBe(afterDrainRevision);
    expect(afterDrainRevision).toBeGreaterThanOrEqual(beforeDrainRevision);

    const steer = createComposerInputQueue({ threadId: "thread-a", activeTurnId: "turn-a" });
    steer.submitSteer(composerQueueMessage("pending-steer"));
    steer.submitSteer(composerQueueMessage("queued-steer"));
    const pendingSteerKey = keyFor(steer, "steer", "pending-steer");
    const steerRevision = steer.detailRevision();
    expect(
      steer.movePendingInput({
        key: pendingSteerKey,
        revision: steerRevision,
        destination: "last",
      }),
    ).toEqual({ type: "notManageable", revision: steerRevision });
    expect(steer.detailRevision()).toBe(steerRevision);
    expect(pageIds(steer, "steer")).toEqual(["pending-steer", "queued-steer"]);
  });

  it("globally rejects moves during edit acquisition and an active reservation", () => {
    const queue = createComposerInputQueue({ threadId: "thread-a", activeTurnId: "turn-a" });
    queue.submit(composerQueueMessage("ordinary"));
    queue.submit(composerQueueMessage("ordinary-successor"));
    queue.submitSteer(composerQueueMessage("pending"));
    queue.submitSteer(composerQueueMessage("steer"));
    queue.submitSteer(composerQueueMessage("steer-successor"));
    const ordinaryKey = keyFor(queue, "ordinary", "ordinary");
    const steerKey = keyFor(queue, "steer", "steer");
    const revision = queue.detailRevision();
    let acquisitionResult: ReturnType<ComposerInputQueue["movePendingInput"]> | null = null;
    let acquisitionMovements: readonly (unknown | null)[] = [];

    const begun = queue.beginPendingInputEdit({ key: ordinaryKey, revision }, () => {
      acquisitionMovements = [
        ...pendingPage(queue, "ordinary").items.map(({ movement }) => movement),
        ...pendingPage(queue, "steer").items.map(({ movement }) => movement),
      ];
      acquisitionResult = queue.movePendingInput({
        key: steerKey,
        revision,
        destination: "first",
      });
      return { type: "restored" };
    });
    expect(acquisitionMovements).toEqual([null, null, null, null, null]);
    expect(acquisitionResult).toEqual({
      type: "conflict",
      reason: "editInProgress",
      revision,
    });
    if (begun.type !== "begun") throw new Error("expected active edit reservation");
    expect([
      ...pendingPage(queue, "ordinary").items.map(({ movement }) => movement),
      ...pendingPage(queue, "steer").items.map(({ movement }) => movement),
    ]).toEqual([null, null, null, null, null]);
    expect(
      queue.movePendingInput({
        key: steerKey,
        revision: begun.revision,
        destination: "first",
      }),
    ).toEqual({
      type: "conflict",
      reason: "editInProgress",
      revision: begun.revision,
    });
  });

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
    expect(queue.transition({ type: "responseAccepted", claim: pending, turnId: "turn-a" })).toEqual(
      { type: "accepted", messageId: "pending" },
    );
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

    expect(queue.transition({ type: "terminal", threadId: "thread-a", turnId: "turn-a" })).toEqual(
      { type: "terminal", messageIds: ["a-2", "a-1"] },
    );
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
    expect(queue.readPendingInputs(0, 20).map(({ messageId, movement }) => ({ messageId, movement })))
      .toEqual([
        { messageId: "a", movement: null },
        { messageId: "c", movement: null },
      ]);
    expect(queue.findPendingInput("a")?.movement).toBeNull();
    expect(queue.findPendingInput("c")?.movement).toBeNull();
    expect(queue.movePendingInput("a", "first")).toEqual({ type: "notManageable" });
    expect(queue.transition({ type: "terminal", threadId: "thread-a", turnId: "turn-a" })).toEqual(
      { type: "terminal", messageIds: ["a", "c"] },
    );

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
