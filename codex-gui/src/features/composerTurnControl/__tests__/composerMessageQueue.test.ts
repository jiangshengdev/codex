import { describe, expect, it } from "vitest";
import {
  COMPOSER_MESSAGE_QUEUE_CAPACITY,
  composerMessageQueueReducer,
  initialComposerMessageQueueState,
  isComposerMessageQueueFull,
  selectQueuedStartCandidate,
  type ComposerMessageQueueAction,
  type ComposerMessageQueueState,
  type QueuedComposerMessage,
} from "../composerMessageQueue";

const item = (index: number): QueuedComposerMessage => ({
  id: `message-${String(index)}`,
  text: `Text ${String(index)}`,
});
const reduce = (state: ComposerMessageQueueState, action: ComposerMessageQueueAction) =>
  composerMessageQueueReducer(state, action);
const pushBack = (
  state: ComposerMessageQueueState,
  message: QueuedComposerMessage,
  turnId = "turn-1",
) => reduce(state, { type: "pushBack", item: message, waitingTurnId: turnId });
const queued = (...items: QueuedComposerMessage[]): ComposerMessageQueueState => ({
  ...initialComposerMessageQueueState,
  items,
  waitingTurnId: "turn-1",
});
const begin = (state: ComposerMessageQueueState) =>
  reduce({ ...state, waitingTurnId: null }, { type: "beginQueuedStart" });
const succeed = (state: ComposerMessageQueueState, itemId = "message-1") =>
  reduce(state, { type: "queuedStartSucceeded", itemId, turnId: "turn-2" });

describe("composer message queue", () => {
  it("keeps a bounded FIFO and inserts guide rejections at the front", () => {
    let state = initialComposerMessageQueueState;
    for (let index = 0; index < COMPOSER_MESSAGE_QUEUE_CAPACITY; index += 1) {
      state = pushBack(state, item(index));
    }
    expect(isComposerMessageQueueFull(state)).toBe(true);
    expect(pushBack(state, item(20))).toBe(state);
    expect(
      reduce(state, {
        type: "pushFrontAfterGuideRejection",
        item: item(21),
        waitingTurnId: "turn-1",
      }),
    ).toBe(state);
    expect(state.items).toStrictEqual(Array.from({ length: 20 }, (_, index) => item(index)));

    const withSpace = reduce(state, { type: "delete", itemId: "message-19" });
    expect(
      reduce(withSpace, {
        type: "pushFrontAfterGuideRejection",
        item: item(21),
        waitingTurnId: "turn-1",
      }).items[0],
    ).toStrictEqual(item(21));
  });

  it("locks one head item and handles matching start results", () => {
    const started = begin(queued(item(1), item(2)));

    expect(started.startingItemId).toBe("message-1");
    expect(selectQueuedStartCandidate(started)).toBeNull();
    expect(reduce(started, { type: "beginQueuedStart" })).toBe(started);
    expect(succeed(started, "stale")).toBe(started);
    expect(succeed(started)).toStrictEqual({
      ...started,
      items: [item(2)],
      waitingTurnId: "turn-2",
      startingItemId: null,
    });

    const paused = reduce(started, { type: "connectionUnavailable" });
    expect(succeed(paused).mode).toBe("paused");

    const failing = begin(queued(item(1)));
    const failed = reduce(failing, { type: "queuedStartFailed", itemId: "message-1" });

    expect(reduce(failing, { type: "queuedStartFailed", itemId: "stale" })).toBe(failing);
    expect(failed.items).toStrictEqual([item(1)]);
    expect(failed).toMatchObject({ mode: "paused", startingItemId: null });

    const invalid = { ...queued(item(1), item(2)), startingItemId: "message-2" };
    expect(() => succeed(invalid, "message-2")).toThrow(
      "Composer message queue invariant failed: starting item message-2 is not the head",
    );
  });

  it.each(["interrupted", "failed"] as const)("pauses for a matching %s completion", (status) => {
    const state = queued(item(1));
    const completed = reduce(state, {
      type: "consumeCompletion",
      completion: { status, turnId: "turn-1", commitId: `commit-${status}` },
    });

    expect(completed).toMatchObject({
      mode: "paused",
      waitingTurnId: null,
      lastConsumedCompletionCommitId: `commit-${status}`,
      items: [item(1)],
    });
  });

  it("routes completed outcomes by waiting turn, mode, and consumed commit", () => {
    const paused = reduce(queued(item(1)), { type: "pause" });
    const completion = { status: "completed", turnId: "turn-1", commitId: "commit-1" } as const;
    const consumed = reduce(paused, { type: "consumeCompletion", completion });

    expect(consumed).toMatchObject({
      mode: "paused",
      waitingTurnId: null,
      lastConsumedCompletionCommitId: "commit-1",
    });
    expect(reduce(consumed, { type: "consumeCompletion", completion })).toBe(consumed);
    expect(selectQueuedStartCandidate(consumed)).toBeNull();

    const running = reduce(queued(item(1)), {
      type: "consumeCompletion",
      completion: { status: "completed", turnId: "turn-1", commitId: "commit-1" },
    });
    expect(running.waitingTurnId).toBeNull();
    expect(selectQueuedStartCandidate(running)).toStrictEqual(item(1));

    const waiting = queued(item(1));
    expect(
      reduce(waiting, {
        type: "consumeCompletion",
        completion: { status: "completed", turnId: "other-turn", commitId: "commit-1" },
      }),
    ).toBe(waiting);
  });

  it("pauses for Stop or unavailable connection and only Continue resumes", () => {
    const state = queued(item(1));
    const stopped = reduce(state, { type: "pause" });
    const unavailable = reduce(state, { type: "connectionUnavailable" });

    expect(stopped).toMatchObject({ mode: "paused", items: [item(1)], waitingTurnId: "turn-1" });
    expect(unavailable).toStrictEqual(stopped);
    expect(reduce(stopped, { type: "continue", waitingTurnId: "turn-2" })).toMatchObject({
      mode: "running",
      waitingTurnId: "turn-2",
    });
    expect(
      selectQueuedStartCandidate(reduce(stopped, { type: "continue", waitingTurnId: null })),
    ).toStrictEqual(item(1));
  });

  it("edits in place but does not edit, delete, or clear a starting item", () => {
    const started = begin(queued(item(1), item(2)));
    const edited = reduce(started, { type: "edit", itemId: "message-2", text: "Changed" });

    expect(edited.items).toStrictEqual([item(1), { id: "message-2", text: "Changed" }]);
    expect(reduce(edited, { type: "edit", itemId: "message-1", text: "No" })).toBe(edited);
    expect(reduce(edited, { type: "delete", itemId: "message-1" })).toBe(edited);
    expect(reduce(edited, { type: "clear" })).toBe(edited);
  });

  it("undoes one delete with the original identity and position", () => {
    const state = queued(item(1), item(2), item(3));
    const deleted = reduce(state, { type: "delete", itemId: "message-2" });
    const edited = reduce(deleted, { type: "edit", itemId: "message-3", text: "Changed" });
    const restored = reduce(edited, { type: "undo" });

    expect(restored.items).toStrictEqual([item(1), item(2), { id: "message-3", text: "Changed" }]);
    expect(restored.undo).toBeNull();
    expect(reduce(restored, { type: "undo" })).toBe(restored);
  });

  it("does not let Undo change a locked starting head", () => {
    const deleted = reduce(queued(item(1), item(2)), { type: "delete", itemId: "message-2" });
    const started = begin(deleted);

    expect(reduce(started, { type: "undo" })).toBe(started);
    expect(succeed(started).undo).toBeNull();
  });

  it("queues a late guide rejection immediately behind a locked starting head", () => {
    const started = begin(queued(item(1)));
    const rejected = reduce(started, {
      type: "pushFrontAfterGuideRejection",
      item: item(2),
      waitingTurnId: null,
    });

    expect(rejected.items).toStrictEqual([item(1), item(2)]);
    expect(rejected.startingItemId).toBe("message-1");
    expect(succeed(rejected).items).toStrictEqual([item(2)]);
  });

  it("restores cleared and last-deleted items without losing paused wait facts", () => {
    const cleared = reduce({ ...queued(item(1), item(2)), mode: "paused" }, { type: "clear" });

    expect(cleared).toMatchObject({ items: [], mode: "paused", waitingTurnId: "turn-1" });
    expect(reduce(cleared, { type: "undo" })).toMatchObject({
      items: [item(1), item(2)],
      mode: "paused",
      waitingTurnId: "turn-1",
    });

    const deleted = reduce(
      { ...queued(item(1)), mode: "paused" },
      {
        type: "delete",
        itemId: "message-1",
      },
    );

    expect(deleted).toMatchObject({ items: [], mode: "paused", waitingTurnId: "turn-1" });
    expect(reduce(deleted, { type: "undo" })).toMatchObject({
      items: [item(1)],
      mode: "paused",
      waitingTurnId: "turn-1",
    });
  });

  it("settles old Undo before every later membership mutation", () => {
    const deleted = reduce(queued(item(1), item(2)), { type: "delete", itemId: "message-1" });
    const pushed = pushBack(deleted, item(3));
    const deletedAgain = reduce(pushed, { type: "delete", itemId: "message-2" });
    const cleared = reduce(deletedAgain, { type: "clear" });

    expect(pushed.undo).toBeNull();
    expect(reduce(pushed, { type: "undo" })).toBe(pushed);
    expect(cleared.undo).toStrictEqual({ type: "clear", items: [item(3)] });
    expect(reduce(cleared, { type: "undo" }).items).toStrictEqual([item(3)]);
  });

  it("rejects duplicate identities as a development invariant", () => {
    expect(() => pushBack(queued(item(1)), item(1))).toThrow(
      "Composer message queue invariant failed: duplicate item id message-1",
    );
  });
});
