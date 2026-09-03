import { describe, expect, it } from "vitest";

import {
  createComposerInputQueue,
  type ComposerInputQueue,
  type ComposerInputQueueTransition,
  type ComposerPendingInputDisplayKey,
  type ComposerPendingInputLane,
  type ComposerPendingInputMoveDestination,
  type ComposerPendingInputMovement,
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

function steerQueueIds(queue: ComposerSteerQueue): string[] {
  return queue
    .state()
    .steerQueue.map((slot) =>
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

  it("reads authoritative ordinary and steer movement at the requested revision", () => {
    const queue = createComposerInputQueue({ threadId: "thread-a", activeTurnId: "turn-a" });
    queue.submit(composerQueueMessage("ordinary-a"));
    queue.submit(composerQueueMessage("ordinary-b"));
    queue.submit(composerQueueMessage("ordinary-c"));
    queue.submitSteer(composerQueueMessage("pending"));
    queue.submitSteer(composerQueueMessage("steer-a"));
    queue.submitSteer(composerQueueMessage("steer-b"));
    const revision = queue.detailRevision();

    expect(
      queue.readPendingInputMovement({
        key: keyFor(queue, "ordinary", "ordinary-b"),
        revision,
      }),
    ).toEqual({
      type: "movement",
      revision,
      lane: "ordinary",
      movement: {
        position: 2,
        count: 3,
        canMoveEarlier: true,
        canMoveLater: true,
      },
    });
    expect(
      queue.readPendingInputMovement({
        key: keyFor(queue, "steer", "steer-b"),
        revision,
      }),
    ).toEqual({
      type: "movement",
      revision,
      lane: "steer",
      movement: {
        position: 2,
        count: 2,
        canMoveEarlier: true,
        canMoveLater: false,
      },
    });
  });

  it("re-reads moved steer position until the target is claimed", () => {
    const queue = createComposerInputQueue({ threadId: "thread-a", activeTurnId: "turn-a" });
    const pending = steerClaim(queue.submitSteer(composerQueueMessage("pending")));
    queue.submitSteer(composerQueueMessage("a"));
    queue.submitSteer(composerQueueMessage("b"));
    const key = keyFor(queue, "steer", "b");
    const beforeMoveRevision = queue.detailRevision();

    expect(
      queue.movePendingInput({ key, revision: beforeMoveRevision, destination: "first" }),
    ).toMatchObject({ type: "moved", position: 1, count: 2 });
    const movedRevision = queue.detailRevision();
    expect(queue.readPendingInputMovement({ key, revision: movedRevision })).toEqual({
      type: "movement",
      revision: movedRevision,
      lane: "steer",
      movement: {
        position: 1,
        count: 2,
        canMoveEarlier: false,
        canMoveLater: true,
      },
    });

    const settled = queue.settleSteer({ type: "accepted", claim: pending, turnId: "turn-a" });
    expect(steerClaim(settled).intent.message.id).toBe("b");
    expect(queue.readPendingInputMovement({ key, revision: queue.detailRevision() })).toEqual({
      type: "notManageable",
      revision: queue.detailRevision(),
    });
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

    expect(queue.movePendingInput({ key, revision, destination: "last" })).toMatchObject({
      type: "moved",
      revision: revision + 1,
    });
    expect(
      queue.readPendingInputPage({
        lane: "ordinary",
        revision,
        cursor: firstPage.nextCursor,
        limit: 1,
      }),
    ).toEqual({ type: "stale", revision: revision + 1 });
    expect(queue.movePendingInput({ key, revision, destination: "first" })).toEqual({
      type: "stale",
      revision: revision + 1,
    });
    expect(queue.readPendingInputMovement({ key, revision })).toEqual({
      type: "stale",
      revision: revision + 1,
    });
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

    expect(queue.movePendingInput({ key: foreignKey, revision, destination: "first" })).toEqual({
      type: "notManageable",
      revision,
    });
    expect(queue.readPendingInputMovement({ key: foreignKey, revision })).toEqual({
      type: "notManageable",
      revision,
    });
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
    expect(
      drained.readPendingInputMovement({ key: drainedKey, revision: afterDrainRevision }),
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
    expect(
      steer.readPendingInputMovement({ key: pendingSteerKey, revision: steerRevision }),
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
    let acquisitionReadResult: ReturnType<ComposerInputQueue["readPendingInputMovement"]> | null =
      null;
    let acquisitionMovements: readonly (ComposerPendingInputMovement | null)[] = [];

    const begun = queue.beginPendingInputEdit({ key: ordinaryKey, revision }, () => {
      acquisitionMovements = [
        ...pendingPage(queue, "ordinary").items.map(({ movement }) => movement),
        ...pendingPage(queue, "steer").items.map(({ movement }) => movement),
      ];
      acquisitionReadResult = queue.readPendingInputMovement({ key: steerKey, revision });
      acquisitionResult = queue.movePendingInput({
        key: steerKey,
        revision,
        destination: "first",
      });
      return { type: "restored" };
    });
    expect(acquisitionMovements).toEqual([null, null, null, null, null]);
    expect(acquisitionReadResult).toEqual({
      type: "conflict",
      reason: "editInProgress",
      revision,
    });
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
    expect(queue.readPendingInputMovement({ key: steerKey, revision: begun.revision })).toEqual({
      type: "conflict",
      reason: "editInProgress",
      revision: begun.revision,
    });
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

  it("reports reservation and outstanding-recovery steer work as non-sortable", () => {
    const reserved = createComposerSteerQueue();
    enqueueSteer(reserved, "reserved");
    enqueueSteer(reserved, "successor");
    const acquired = reserved.acquirePendingInputEdit("reserved");
    if (acquired.type !== "acquired") throw new Error("expected steer edit acquisition");
    const reservation = reserved.reservePendingInputEdit(acquired.acquisition);
    if (reservation == null) throw new Error("expected steer edit reservation");
    expect(reserved.findPendingInput("reserved")).toMatchObject({
      management: { type: "editing" },
      movement: null,
    });
    expect(reserved.findPendingInput("successor")?.movement).toBeNull();
    expect(reserved.movePendingInput("reserved", "first")).toEqual({ type: "notManageable" });
    expect(reserved.movePendingInput("successor", "first")).toEqual({ type: "notManageable" });

    const recovering = createComposerInputQueue({
      threadId: "thread-a",
      activeTurnId: "turn-a",
    });
    const failed = steerClaim(recovering.submitSteer(composerQueueMessage("failed")));
    recovering.submitSteer(composerQueueMessage("a"));
    recovering.submitSteer(composerQueueMessage("b"));
    const key = keyFor(recovering, "steer", "a");
    const recovery = recovering.settleSteer({ type: "definitelyNotAccepted", claim: failed });
    expect(recovery.result).toMatchObject({
      type: "recoveryProduced",
      reason: "steerDefinitelyNotAccepted",
    });
    const revision = recovering.detailRevision();
    expect(recovering.readPendingInputMovement({ key, revision })).toEqual({
      type: "notManageable",
      revision,
    });
  });
});
