import { describe, expect, it } from "vitest";
import { makeStore } from "@/app/store";
import attachBaselineJson from "../__fixtures__/attach-baseline.json";
import attachReplacementJson from "../__fixtures__/attach-replacement.json";
import eventItemCompletedJson from "../__fixtures__/event-item-completed.json";
import eventItemStartedJson from "../__fixtures__/event-item-started.json";
import eventLargeSequenceJson from "../__fixtures__/event-large-sequence.json";
import eventMetadataNullJson from "../__fixtures__/event-thread-metadata-updated-null.json";
import eventProjectionResetJson from "../__fixtures__/event-projection-reset.json";
import eventTurnCompletedJson from "../__fixtures__/event-turn-completed.json";
import eventTurnStartedJson from "../__fixtures__/event-turn-started.json";
import type {
  ProjectionEventNotification,
  ThreadProjectionAttachResponse,
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
const eventItemCompleted = eventItemCompletedJson as ProjectionEventNotification;
const eventItemStarted = eventItemStartedJson as ProjectionEventNotification;
const eventLargeSequence = eventLargeSequenceJson as ProjectionEventNotification;
const eventMetadataNull = eventMetadataNullJson as ProjectionEventNotification;
const eventProjectionReset = eventProjectionResetJson as ProjectionEventNotification;
const eventTurnCompleted = eventTurnCompletedJson as ProjectionEventNotification;
const eventTurnStarted = eventTurnStartedJson as ProjectionEventNotification;
const projectionThreadId = attachBaseline.thread.id;
const deriveEvent = (
  event: ProjectionEventNotification,
  overrides: Partial<ProjectionEventNotification>,
): ProjectionEventNotification => ({
  ...event,
  ...overrides,
});
const sequenceEvent = (
  event: ProjectionEventNotification,
  sequence: string,
): ProjectionEventNotification =>
  deriveEvent(event, {
    sequence,
    eventId: `${event.projectionInstanceId}:${sequence}`,
  });
const fixtureSnapshot = (
  latestSequence: string,
  turns = attachBaseline.thread.turns,
): ThreadProjectionAttachResponse => ({
  ...attachBaseline,
  latestSequence,
  thread: {
    ...attachBaseline.thread,
    turns,
  },
});

describe("projection reducer", () => {
  it("stores attach response by thread id", () => {
    const store = makeStore();
    const threadId = attachBaseline.thread.id;

    store.dispatch(
      projectionAttached({
        threadId,
        snapshot: attachBaseline,
      }),
    );

    expect(selectProjectionByThreadId(store.getState(), threadId)).toStrictEqual({
      ...attachBaseline,
      reattach: null,
    } satisfies ThreadProjection);
  });

  it("replaces existing projection and clears reattach", () => {
    const store = makeStore();
    const threadId = attachBaseline.thread.id;

    store.dispatch(
      projectionAttached({
        threadId,
        snapshot: attachBaseline,
      }),
    );

    store.dispatch(
      projectionAttached({
        threadId,
        snapshot: attachReplacement,
      }),
    );

    expect(selectProjectionByThreadId(store.getState(), threadId)).toStrictEqual({
      ...attachReplacement,
      reattach: null,
    } satisfies ThreadProjection);
    expect(selectProjectionReattachByThreadId(store.getState(), threadId)).toBeNull();
  });

  it("ignores projection events for unknown threads", () => {
    const store = makeStore();
    const unknownThreadId = "00000000-0000-0000-0000-000000000099";

    store.dispatch(
      projectionAttached({
        threadId: projectionThreadId,
        snapshot: attachBaseline,
      }),
    );
    const existingProjection = selectProjectionByThreadId(store.getState(), projectionThreadId);

    store.dispatch(
      projectionEventReceived(
        deriveEvent(eventTurnStarted, {
          threadId: unknownThreadId,
        }),
      ),
    );

    expect(selectProjectionByThreadId(store.getState(), projectionThreadId)).toStrictEqual(
      existingProjection,
    );
    expect(selectProjectionByThreadId(store.getState(), unknownThreadId)).toBeNull();
  });

  it("marks reattach when projection instance id mismatches", () => {
    const store = makeStore();

    store.dispatch(
      projectionAttached({
        threadId: projectionThreadId,
        snapshot: attachBaseline,
      }),
    );
    store.dispatch(
      projectionEventReceived(
        deriveEvent(eventTurnStarted, {
          projectionInstanceId: "projection-fixture-instance-replacement",
        }),
      ),
    );

    expect(selectProjectionReattachByThreadId(store.getState(), projectionThreadId)).toStrictEqual({
      reason: "projectionInstanceMismatch",
    });
  });

  it("ignores duplicate or old sequence events without changing turns or reattach", () => {
    const store = makeStore();
    const snapshotAtSequenceOne = {
      ...attachBaseline,
      latestSequence: "1",
    } satisfies ThreadProjectionAttachResponse;

    store.dispatch(
      projectionAttached({
        threadId: projectionThreadId,
        snapshot: snapshotAtSequenceOne,
      }),
    );

    const duplicateEvent = sequenceEvent(
      deriveEvent(eventTurnStarted, {
        payload:
          eventTurnStarted.payload.type === "turnStarted"
            ? {
                ...eventTurnStarted.payload,
                turn: {
                  ...eventTurnStarted.payload.turn,
                  status: "completed",
                },
              }
            : eventTurnStarted.payload,
      }),
      "1",
    );

    store.dispatch(projectionEventReceived(duplicateEvent));
    store.dispatch(projectionEventReceived(sequenceEvent(eventTurnStarted, "0")));

    const projection = selectProjectionByThreadId(store.getState(), projectionThreadId);
    expect(projection?.latestSequence).toBe("1");
    expect(projection?.reattach).toBeNull();
    expect(projection?.thread.turns).toStrictEqual(snapshotAtSequenceOne.thread.turns);
  });

  it("accepts contiguous unsafe integer sequence events", () => {
    const store = makeStore();
    const snapshotBeforeLargeSequence = {
      ...attachBaseline,
      latestSequence: "9007199254740992",
    } satisfies ThreadProjectionAttachResponse;

    store.dispatch(
      projectionAttached({
        threadId: projectionThreadId,
        snapshot: snapshotBeforeLargeSequence,
      }),
    );
    store.dispatch(projectionEventReceived(eventLargeSequence));

    const projection = selectProjectionByThreadId(store.getState(), projectionThreadId);
    expect(projection?.latestSequence).toBe("9007199254740993");
  });

  it("marks reattach when event sequence has a gap", () => {
    const store = makeStore();

    store.dispatch(
      projectionAttached({
        threadId: projectionThreadId,
        snapshot: attachBaseline,
      }),
    );
    store.dispatch(projectionEventReceived(sequenceEvent(eventTurnStarted, "2")));

    expect(selectProjectionReattachByThreadId(store.getState(), projectionThreadId)).toStrictEqual({
      reason: "sequenceGap",
    });
  });

  it("ignores events after reattach until a new attach arrives", () => {
    const store = makeStore();

    store.dispatch(
      projectionAttached({
        threadId: projectionThreadId,
        snapshot: attachBaseline,
      }),
    );
    store.dispatch(projectionEventReceived(sequenceEvent(eventTurnStarted, "2")));
    store.dispatch(projectionEventReceived(eventTurnStarted));

    const projectionAfterIgnoredEvent = selectProjectionByThreadId(
      store.getState(),
      projectionThreadId,
    );
    expect(projectionAfterIgnoredEvent?.latestSequence).toBe("0");
    expect(projectionAfterIgnoredEvent?.reattach).toStrictEqual({ reason: "sequenceGap" });

    store.dispatch(
      projectionAttached({
        threadId: projectionThreadId,
        snapshot: attachReplacement,
      }),
    );

    expect(selectProjectionReattachByThreadId(store.getState(), projectionThreadId)).toBeNull();

    store.dispatch(
      projectionEventReceived(
        deriveEvent(sequenceEvent(eventTurnStarted, "2"), {
          projectionInstanceId: attachReplacement.projectionInstanceId,
          eventId: `${attachReplacement.projectionInstanceId}:2`,
        }),
      ),
    );

    const projectionAfterNewEvent = selectProjectionByThreadId(
      store.getState(),
      projectionThreadId,
    );
    expect(projectionAfterNewEvent?.latestSequence).toBe("2");
    expect(projectionAfterNewEvent?.reattach).toBeNull();
  });
});

describe("projection reducer event application", () => {
  it("appends a turn from a continuous turnStarted event and updates latestSequence", () => {
    const store = makeStore();
    if (eventTurnStarted.payload.type !== "turnStarted") {
      throw new Error("expected turnStarted fixture");
    }

    store.dispatch(
      projectionAttached({
        threadId: projectionThreadId,
        snapshot: attachBaseline,
      }),
    );
    store.dispatch(projectionEventReceived(eventTurnStarted));

    const projection = selectProjectionByThreadId(store.getState(), projectionThreadId);
    expect(projection?.latestSequence).toBe("1");
    expect(projection?.thread.turns).toStrictEqual([
      ...attachBaseline.thread.turns,
      eventTurnStarted.payload.turn,
    ]);
  });

  it("replaces an existing turn from a turnStarted event with the same id", () => {
    const store = makeStore();
    if (eventTurnStarted.payload.type !== "turnStarted") {
      throw new Error("expected turnStarted fixture");
    }
    if (eventItemStarted.payload.type !== "itemStarted") {
      throw new Error("expected itemStarted fixture");
    }
    const replacementTurn = {
      ...eventTurnStarted.payload.turn,
      items: [eventItemStarted.payload.item],
    };

    store.dispatch(
      projectionAttached({
        threadId: projectionThreadId,
        snapshot: fixtureSnapshot("0", [eventTurnStarted.payload.turn]),
      }),
    );
    store.dispatch(
      projectionEventReceived(
        deriveEvent(eventTurnStarted, {
          payload: {
            ...eventTurnStarted.payload,
            turn: replacementTurn,
          },
        }),
      ),
    );

    const projection = selectProjectionByThreadId(store.getState(), projectionThreadId);
    expect(projection?.latestSequence).toBe("1");
    expect(projection?.thread.turns).toStrictEqual([replacementTurn]);
  });

  it("marks reattach when itemStarted is missing the parent turn", () => {
    const store = makeStore();

    store.dispatch(
      projectionAttached({
        threadId: projectionThreadId,
        snapshot: fixtureSnapshot("1"),
      }),
    );
    store.dispatch(projectionEventReceived(eventItemStarted));

    const projection = selectProjectionByThreadId(store.getState(), projectionThreadId);
    expect(projection?.latestSequence).toBe("1");
    expect(projection?.thread.turns).toStrictEqual(attachBaseline.thread.turns);
    expect(projection?.reattach).toStrictEqual({ reason: "missingTurn" });
  });

  it("appends and then replaces an item from itemStarted events", () => {
    const store = makeStore();
    if (eventTurnStarted.payload.type !== "turnStarted") {
      throw new Error("expected turnStarted fixture");
    }
    if (eventItemStarted.payload.type !== "itemStarted") {
      throw new Error("expected itemStarted fixture");
    }
    if (eventItemCompleted.payload.type !== "itemCompleted") {
      throw new Error("expected itemCompleted fixture");
    }
    const replacementEvent = sequenceEvent(
      deriveEvent(eventItemStarted, {
        payload: {
          ...eventItemStarted.payload,
          item: eventItemCompleted.payload.item,
        },
      }),
      "3",
    );

    store.dispatch(
      projectionAttached({
        threadId: projectionThreadId,
        snapshot: fixtureSnapshot("1", [eventTurnStarted.payload.turn]),
      }),
    );
    store.dispatch(projectionEventReceived(eventItemStarted));
    store.dispatch(projectionEventReceived(replacementEvent));

    const projection = selectProjectionByThreadId(store.getState(), projectionThreadId);
    expect(projection?.latestSequence).toBe("3");
    expect(projection?.thread.turns).toStrictEqual([
      {
        ...eventTurnStarted.payload.turn,
        items: [eventItemCompleted.payload.item],
      },
    ]);
  });

  it("appends and then replaces an item from itemCompleted events", () => {
    const store = makeStore();
    if (eventTurnStarted.payload.type !== "turnStarted") {
      throw new Error("expected turnStarted fixture");
    }
    if (eventItemStarted.payload.type !== "itemStarted") {
      throw new Error("expected itemStarted fixture");
    }
    if (eventItemCompleted.payload.type !== "itemCompleted") {
      throw new Error("expected itemCompleted fixture");
    }
    const replacementEvent = sequenceEvent(
      deriveEvent(eventItemCompleted, {
        payload: {
          ...eventItemCompleted.payload,
          item: eventItemStarted.payload.item,
        },
      }),
      "4",
    );

    store.dispatch(
      projectionAttached({
        threadId: projectionThreadId,
        snapshot: fixtureSnapshot("2", [eventTurnStarted.payload.turn]),
      }),
    );
    store.dispatch(projectionEventReceived(eventItemCompleted));
    store.dispatch(projectionEventReceived(replacementEvent));

    const projection = selectProjectionByThreadId(store.getState(), projectionThreadId);
    expect(projection?.latestSequence).toBe("4");
    expect(projection?.thread.turns).toStrictEqual([
      {
        ...eventTurnStarted.payload.turn,
        items: [eventItemStarted.payload.item],
      },
    ]);
  });

  it("updates turn status from a turnCompleted event", () => {
    const store = makeStore();
    if (eventTurnStarted.payload.type !== "turnStarted") {
      throw new Error("expected turnStarted fixture");
    }
    if (eventTurnCompleted.payload.type !== "turnCompleted") {
      throw new Error("expected turnCompleted fixture");
    }

    store.dispatch(
      projectionAttached({
        threadId: projectionThreadId,
        snapshot: fixtureSnapshot("3", [eventTurnStarted.payload.turn]),
      }),
    );
    store.dispatch(projectionEventReceived(eventTurnCompleted));

    const projection = selectProjectionByThreadId(store.getState(), projectionThreadId);
    expect(projection?.latestSequence).toBe("4");
    expect(projection?.thread.turns).toStrictEqual([
      {
        ...eventTurnStarted.payload.turn,
        status: eventTurnCompleted.payload.status,
      },
    ]);
  });

  it("marks reattach when turnCompleted is missing the parent turn", () => {
    const store = makeStore();

    store.dispatch(
      projectionAttached({
        threadId: projectionThreadId,
        snapshot: fixtureSnapshot("3"),
      }),
    );
    store.dispatch(projectionEventReceived(eventTurnCompleted));

    const projection = selectProjectionByThreadId(store.getState(), projectionThreadId);
    expect(projection?.latestSequence).toBe("3");
    expect(projection?.thread.turns).toStrictEqual(attachBaseline.thread.turns);
    expect(projection?.reattach).toStrictEqual({ reason: "missingTurn" });
  });

  it("overwrites thread name from threadMetadataUpdated including null", () => {
    const store = makeStore();

    store.dispatch(
      projectionAttached({
        threadId: projectionThreadId,
        snapshot: fixtureSnapshot("4"),
      }),
    );
    store.dispatch(projectionEventReceived(eventMetadataNull));

    const projection = selectProjectionByThreadId(store.getState(), projectionThreadId);
    expect(projection?.latestSequence).toBe("5");
    expect(projection?.thread.name).toBeNull();
  });

  it("marks reattach from projectionReset and consumes the sequence", () => {
    const store = makeStore();

    store.dispatch(
      projectionAttached({
        threadId: projectionThreadId,
        snapshot: fixtureSnapshot("5"),
      }),
    );
    store.dispatch(projectionEventReceived(eventProjectionReset));

    const projection = selectProjectionByThreadId(store.getState(), projectionThreadId);
    expect(projection?.latestSequence).toBe("6");
    expect(projection?.reattach).toStrictEqual({ reason: "projectionReset" });
  });
});
