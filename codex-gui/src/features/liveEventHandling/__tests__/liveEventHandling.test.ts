import { describe, expect, it } from "vitest";
import { makeStore } from "@/app/store";
import {
  attachBaseline,
  eventItemCompleted,
  eventItemStarted,
  eventTurnCompleted,
  eventTurnStarted,
} from "@/features/projection/__tests__/projectionFixtures";
import { selectSnapshotReplayMaterials } from "@/features/snapshotReplay/snapshotReplay";
import {
  selectThreadRuntimeEventBuffer,
  selectThreadRuntimeRecord,
  threadRuntimeAttached,
  threadRuntimeEventBuffered,
  threadRuntimeManualReconnectRequired,
} from "@/features/threadRuntime/threadRuntimeSlice";
import type { Turn } from "@codex-protocol/v2";
import {
  buildLiveEventMaterials,
  buildLiveSubscriptionMaterials,
  selectLiveEventMaterials,
  selectLiveSubscriptionMaterials,
  selectThreadTimelineMaterials,
  type LiveEventMaterial,
  type LiveSubscriptionMaterial,
  type TimelineMaterial,
} from "../liveEventHandling";

const turnWithoutItems = ({
  id,
  itemsView,
  status,
  error,
  startedAt,
  completedAt,
  durationMs,
}: Turn): Omit<Turn, "items"> => ({
  id,
  itemsView,
  status,
  error,
  startedAt,
  completedAt,
  durationMs,
});

const expectedItemLifecycleMaterials = (): LiveEventMaterial[] => {
  if (eventItemStarted.event.type !== "itemStarted") {
    throw new Error("fixture must contain an itemStarted projection event");
  }
  if (eventItemCompleted.event.type !== "itemCompleted") {
    throw new Error("fixture must contain an itemCompleted projection event");
  }

  return [
    {
      type: "itemStarted",
      source: "liveEvent",
      threadId: eventItemStarted.threadId,
      turnId: eventItemStarted.event.notification.turnId,
      item: eventItemStarted.event.notification.item,
    },
    {
      type: "itemCompleted",
      source: "liveEvent",
      threadId: eventItemCompleted.threadId,
      turnId: eventItemCompleted.event.notification.turnId,
      item: eventItemCompleted.event.notification.item,
    },
  ] satisfies LiveEventMaterial[];
};

describe("live event handling", () => {
  it("returns no material when no runtime exists", () => {
    const store = makeStore();

    expect(buildLiveEventMaterials(null)).toStrictEqual([]);
    expect(buildLiveSubscriptionMaterials(null)).toStrictEqual([]);
    expect(selectLiveEventMaterials(store.getState())).toStrictEqual([]);
    expect(selectLiveSubscriptionMaterials(store.getState())).toStrictEqual([]);
    expect(selectThreadTimelineMaterials(store.getState())).toStrictEqual([]);
  });

  it("derives live turn and item lifecycle material in event buffer order", () => {
    if (eventTurnStarted.event.type !== "turnStarted") {
      throw new Error("fixture must contain a turnStarted projection event");
    }
    if (eventTurnCompleted.event.type !== "turnCompleted") {
      throw new Error("fixture must contain a turnCompleted projection event");
    }

    const store = makeStore();
    store.dispatch(threadRuntimeAttached(attachBaseline));
    store.dispatch(threadRuntimeEventBuffered(eventTurnStarted));
    store.dispatch(threadRuntimeEventBuffered(eventItemStarted));
    store.dispatch(threadRuntimeEventBuffered(eventItemCompleted));
    store.dispatch(threadRuntimeEventBuffered(eventTurnCompleted));

    const expectedMaterials = [
      {
        type: "turnStarted",
        source: "liveEvent",
        threadId: eventTurnStarted.threadId,
        turn: eventTurnStarted.event.notification.turn,
      },
      ...expectedItemLifecycleMaterials(),
      {
        type: "turnCompleted",
        source: "liveEvent",
        threadId: eventTurnCompleted.threadId,
        turn: turnWithoutItems(eventTurnCompleted.event.notification.turn),
      },
    ] satisfies LiveEventMaterial[];

    expect(buildLiveEventMaterials(selectThreadRuntimeRecord(store.getState()))).toStrictEqual(
      expectedMaterials,
    );
    expect(selectLiveEventMaterials(store.getState())).toStrictEqual(expectedMaterials);
  });

  it("does not derive live material from snapshot duplicate events", () => {
    const store = makeStore();
    store.dispatch(threadRuntimeAttached(attachBaseline));
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: eventTurnStarted,
        replay: "snapshotDuplicate",
      }),
    );

    expect(selectLiveEventMaterials(store.getState())).toStrictEqual([]);
    expect(selectThreadTimelineMaterials(store.getState())).toStrictEqual(
      selectSnapshotReplayMaterials(store.getState()),
    );
  });

  it("does not collapse item started and completed lifecycle material", () => {
    const store = makeStore();
    store.dispatch(threadRuntimeAttached(attachBaseline));
    store.dispatch(threadRuntimeEventBuffered(eventTurnStarted));
    store.dispatch(threadRuntimeEventBuffered(eventItemStarted));
    store.dispatch(threadRuntimeEventBuffered(eventItemCompleted));

    expect(selectLiveEventMaterials(store.getState()).slice(1)).toStrictEqual(
      expectedItemLifecycleMaterials(),
    );
  });

  it("derives subscription interrupted material only for manual reconnect state", () => {
    const store = makeStore();
    store.dispatch(threadRuntimeAttached(attachBaseline));

    expect(selectLiveSubscriptionMaterials(store.getState())).toStrictEqual([]);

    store.dispatch(
      threadRuntimeManualReconnectRequired({
        reason: "backpressure",
        threadId: attachBaseline.snapshot.thread.id,
        subscriptionId: attachBaseline.subscriptionId,
      }),
    );

    const expectedMaterials = [
      {
        type: "subscriptionInterrupted",
        source: "liveEvent",
        threadId: attachBaseline.snapshot.thread.id,
        reason: "backpressure",
        subscriptionId: attachBaseline.subscriptionId,
      },
    ] satisfies LiveSubscriptionMaterial[];

    expect(
      buildLiveSubscriptionMaterials(selectThreadRuntimeRecord(store.getState())),
    ).toStrictEqual(expectedMaterials);
    expect(selectLiveSubscriptionMaterials(store.getState())).toStrictEqual(expectedMaterials);
  });

  it("combines snapshot replay, live events, and subscription status in timeline order", () => {
    if (eventTurnStarted.event.type !== "turnStarted") {
      throw new Error("fixture must contain a turnStarted projection event");
    }

    const store = makeStore();
    store.dispatch(threadRuntimeAttached(attachBaseline));
    store.dispatch(threadRuntimeEventBuffered(eventTurnStarted));
    store.dispatch(
      threadRuntimeManualReconnectRequired({
        reason: "backpressure",
        threadId: attachBaseline.snapshot.thread.id,
        subscriptionId: attachBaseline.subscriptionId,
      }),
    );

    const expectedTimeline = [
      ...selectSnapshotReplayMaterials(store.getState()),
      {
        type: "turnStarted",
        source: "liveEvent",
        threadId: eventTurnStarted.threadId,
        turn: eventTurnStarted.event.notification.turn,
      },
      {
        type: "subscriptionInterrupted",
        source: "liveEvent",
        threadId: attachBaseline.snapshot.thread.id,
        reason: "backpressure",
        subscriptionId: attachBaseline.subscriptionId,
      },
    ] satisfies TimelineMaterial[];

    expect(selectThreadTimelineMaterials(store.getState())).toStrictEqual(expectedTimeline);
  });

  it("does not mutate or consume the runtime event buffer", () => {
    const store = makeStore();
    store.dispatch(threadRuntimeAttached(attachBaseline));
    store.dispatch(threadRuntimeEventBuffered(eventTurnStarted));
    const expectedBuffer = [
      { type: "projectionEvent", notification: eventTurnStarted, replay: "live" },
    ];

    selectLiveEventMaterials(store.getState());
    selectThreadTimelineMaterials(store.getState());

    expect(selectThreadRuntimeEventBuffer(store.getState())).toStrictEqual(expectedBuffer);
  });
});
