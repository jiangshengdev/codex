import { describe, expect, it } from "vitest";
import { makeStore } from "@/app/store";
import attachBaselineJson from "../__fixtures__/attach-baseline.json";
import attachReplacementJson from "../__fixtures__/attach-replacement.json";
import eventItemCompletedJson from "../__fixtures__/event-item-completed.json";
import eventItemStartedJson from "../__fixtures__/event-item-started.json";
import eventSubscriptionReplacementJson from "../__fixtures__/event-subscription-replacement.json";
import eventTurnCompletedJson from "../__fixtures__/event-turn-completed.json";
import eventTurnStartedJson from "../__fixtures__/event-turn-started.json";
import type {
  ThreadProjectionAttachResponse,
  ThreadProjectionEvent,
  ThreadProjectionEventNotification,
  Turn,
} from "@codex-protocol/v2";
import type { ThreadProjection } from "../projectionSlice";
import {
  projectionAttached,
  projectionEventReceived,
  selectProjectionByThreadId,
  selectProjectionReattachByThreadId,
} from "../projectionSlice";

const attachBaseline = attachBaselineJson as ThreadProjectionAttachResponse;
const attachReplacement = attachReplacementJson as ThreadProjectionAttachResponse;
const eventTurnStarted = eventTurnStartedJson as ThreadProjectionEventNotification;
const eventItemStarted = eventItemStartedJson as ThreadProjectionEventNotification;
const eventItemCompleted = eventItemCompletedJson as ThreadProjectionEventNotification;
const eventTurnCompleted = eventTurnCompletedJson as ThreadProjectionEventNotification;
const eventSubscriptionReplacement =
  eventSubscriptionReplacementJson as ThreadProjectionEventNotification;
const projectionThreadId = attachBaseline.snapshot.thread.id;

const deriveEvent = (
  event: ThreadProjectionEventNotification,
  overrides: Partial<ThreadProjectionEventNotification>,
): ThreadProjectionEventNotification => ({
  ...event,
  ...overrides,
});

const attachWithSnapshot = (
  response: ThreadProjectionAttachResponse,
  overrides: Partial<ThreadProjectionAttachResponse["snapshot"]>,
): ThreadProjectionAttachResponse => ({
  ...response,
  snapshot: {
    ...response.snapshot,
    ...overrides,
  },
});

const attachWithTurnsAndHead = (
  turns: Turn[],
  headCommitId: string | null,
): ThreadProjectionAttachResponse =>
  attachWithSnapshot(attachBaseline, {
    headCommitId,
    thread: {
      ...attachBaseline.snapshot.thread,
      turns,
    },
  });

const expectProjectionEvent = <Type extends ThreadProjectionEvent["type"]>(
  event: ThreadProjectionEventNotification,
  type: Type,
): Extract<ThreadProjectionEvent, { type: Type }> => {
  expect(event.event.type).toBe(type);
  return event.event as Extract<ThreadProjectionEvent, { type: Type }>;
};

const expectedProjection = (response: ThreadProjectionAttachResponse): ThreadProjection => ({
  subscriptionId: response.subscriptionId,
  thread: response.snapshot.thread,
  headCommitId: response.snapshot.headCommitId,
  reattach: null,
});

describe("projection reducer", () => {
  it("stores attach response by snapshot thread id", () => {
    const store = makeStore();

    store.dispatch(projectionAttached(attachBaseline));

    expect(selectProjectionByThreadId(store.getState(), projectionThreadId)).toStrictEqual(
      expectedProjection(attachBaseline),
    );
  });

  it("replaces existing projection and clears reattach", () => {
    const store = makeStore();

    store.dispatch(projectionAttached(attachBaseline));
    store.dispatch(projectionEventReceived(eventItemStarted));
    expect(selectProjectionReattachByThreadId(store.getState(), projectionThreadId)).toStrictEqual({
      reason: "commitChainMismatch",
    });

    store.dispatch(projectionAttached(attachReplacement));

    expect(selectProjectionByThreadId(store.getState(), projectionThreadId)).toStrictEqual(
      expectedProjection(attachReplacement),
    );
    expect(selectProjectionReattachByThreadId(store.getState(), projectionThreadId)).toBeNull();
  });

  it("ignores projection events for unknown threads", () => {
    const store = makeStore();

    store.dispatch(projectionAttached(attachBaseline));
    const existingProjection = selectProjectionByThreadId(store.getState(), projectionThreadId);

    store.dispatch(
      projectionEventReceived(
        deriveEvent(eventTurnStarted, {
          threadId: "00000000-0000-0000-0000-000000000099",
        }),
      ),
    );

    expect(selectProjectionByThreadId(store.getState(), projectionThreadId)).toStrictEqual(
      existingProjection,
    );
  });

  it("ignores stale subscription events", () => {
    const store = makeStore();

    store.dispatch(projectionAttached(attachBaseline));
    const existingProjection = selectProjectionByThreadId(store.getState(), projectionThreadId);

    store.dispatch(projectionEventReceived(eventSubscriptionReplacement));

    expect(selectProjectionByThreadId(store.getState(), projectionThreadId)).toStrictEqual(
      existingProjection,
    );
  });

  it("ignores duplicate latest commit events", () => {
    const store = makeStore();
    const turnStarted = expectProjectionEvent(eventTurnStarted, "turnStarted");
    const snapshotAtCommit = attachWithTurnsAndHead(
      [turnStarted.notification.turn],
      eventTurnStarted.commitId,
    );

    store.dispatch(projectionAttached(snapshotAtCommit));
    store.dispatch(projectionEventReceived(eventTurnStarted));

    expect(selectProjectionByThreadId(store.getState(), projectionThreadId)).toStrictEqual(
      expectedProjection(snapshotAtCommit),
    );
  });

  it("marks reattach when parent commit does not match the local head", () => {
    const store = makeStore();

    store.dispatch(projectionAttached(attachBaseline));
    store.dispatch(projectionEventReceived(eventItemStarted));

    expect(selectProjectionReattachByThreadId(store.getState(), projectionThreadId)).toStrictEqual({
      reason: "commitChainMismatch",
    });
  });

  it("ignores events after reattach until a new attach arrives", () => {
    const store = makeStore();

    store.dispatch(projectionAttached(attachBaseline));
    store.dispatch(projectionEventReceived(eventItemStarted));
    const projectionAfterMismatch = selectProjectionByThreadId(
      store.getState(),
      projectionThreadId,
    );

    store.dispatch(projectionEventReceived(eventTurnStarted));

    expect(selectProjectionByThreadId(store.getState(), projectionThreadId)).toStrictEqual(
      projectionAfterMismatch,
    );
  });

  it("applies contiguous events and advances head commit id", () => {
    const store = makeStore();
    const turnStarted = expectProjectionEvent(eventTurnStarted, "turnStarted");
    const itemStarted = expectProjectionEvent(eventItemStarted, "itemStarted");
    const itemCompleted = expectProjectionEvent(eventItemCompleted, "itemCompleted");
    const turnCompleted = expectProjectionEvent(eventTurnCompleted, "turnCompleted");

    store.dispatch(projectionAttached(attachBaseline));
    store.dispatch(projectionEventReceived(eventTurnStarted));
    store.dispatch(projectionEventReceived(eventItemStarted));
    store.dispatch(projectionEventReceived(eventItemCompleted));
    store.dispatch(projectionEventReceived(eventTurnCompleted));

    const projection = selectProjectionByThreadId(store.getState(), projectionThreadId);
    expect(projection?.headCommitId).toBe(eventTurnCompleted.commitId);
    expect(projection?.reattach).toBeNull();
    expect(projection?.thread.turns).toStrictEqual([
      ...attachBaseline.snapshot.thread.turns,
      turnCompleted.notification.turn,
    ]);
    expect(turnStarted.notification.turn.id).toBe(itemStarted.notification.turnId);
    expect(itemStarted.notification.item.id).toBe(itemCompleted.notification.item.id);
  });

  it("marks reattach when an item event is missing the parent turn", () => {
    const store = makeStore();
    const snapshotWithoutLiveTurn = attachWithTurnsAndHead(
      attachBaseline.snapshot.thread.turns,
      eventTurnStarted.commitId,
    );

    store.dispatch(projectionAttached(snapshotWithoutLiveTurn));
    store.dispatch(projectionEventReceived(eventItemStarted));

    const projection = selectProjectionByThreadId(store.getState(), projectionThreadId);
    expect(projection?.headCommitId).toBe(eventTurnStarted.commitId);
    expect(projection?.thread.turns).toStrictEqual(attachBaseline.snapshot.thread.turns);
    expect(projection?.reattach).toStrictEqual({ reason: "missingTurn" });
  });

  it("applies replacement subscription events after replacement attach", () => {
    const store = makeStore();
    const replacementStarted = expectProjectionEvent(eventSubscriptionReplacement, "turnStarted");

    store.dispatch(projectionAttached(attachReplacement));
    store.dispatch(projectionEventReceived(eventSubscriptionReplacement));

    const projection = selectProjectionByThreadId(store.getState(), projectionThreadId);
    expect(projection?.subscriptionId).toBe(attachReplacement.subscriptionId);
    expect(projection?.headCommitId).toBe(eventSubscriptionReplacement.commitId);
    expect(projection?.thread.turns).toStrictEqual([
      ...attachReplacement.snapshot.thread.turns,
      replacementStarted.notification.turn,
    ]);
  });
});
