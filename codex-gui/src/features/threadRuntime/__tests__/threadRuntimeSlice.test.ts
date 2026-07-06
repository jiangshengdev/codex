import { describe, expect, expectTypeOf, it } from "vitest";
import { makeStore } from "@/app/store";
import {
  attachBaseline,
  attachReplacement,
  eventAgentMessageDelta,
  eventItemCompleted,
  eventItemStarted,
  eventTurnCompleted,
  eventTurnStarted,
} from "@/features/projection/__tests__/projectionFixtures";
import {
  agentMessage,
  attachWithTurns,
  itemCompleted,
  itemStarted,
  turnCompleted,
  turnStarted,
} from "@/features/projection/__tests__/projectionTestBuilders";
import {
  replayForProjectionEvent,
  selectThreadRuntimeActiveTurnId,
  selectThreadRuntimeEventBuffer,
  selectThreadRuntimeRecord,
  selectThreadRuntimeSubscription,
  selectThreadRuntimeSubscriptionState,
  selectThreadRuntimeThreadId,
  snapshotReplayIndexFromTurns,
  threadRuntimeAttached,
  threadRuntimeDeltaAccepted,
  threadRuntimeDeltasAccepted,
  threadRuntimeEventBuffered,
  threadRuntimeManualReconnectRequired,
  threadRuntimeSlice,
  type ThreadRuntimeProjectionDeltasPayload,
  type ThreadRuntimeProjectionEventPayload,
  type ThreadRuntimeState,
} from "../threadRuntimeSlice";
import type { ThreadProjectionEventNotification } from "@codex-protocol/v2";

const reduce = (
  state: ThreadRuntimeState | undefined,
  action:
    | ReturnType<typeof threadRuntimeAttached>
    | ReturnType<typeof threadRuntimeDeltaAccepted>
    | ReturnType<typeof threadRuntimeDeltasAccepted>
    | ReturnType<typeof threadRuntimeEventBuffered>
    | ReturnType<typeof threadRuntimeManualReconnectRequired>,
) => threadRuntimeSlice.reducer(state, action);

const runtimeRoot = (state: ThreadRuntimeState) => ({ threadRuntime: state });

describe("thread runtime reducer", () => {
  it("registers thread runtime state in the app store", () => {
    const store = makeStore();

    expect(selectThreadRuntimeRecord(store.getState())).toBeNull();
    expect(selectThreadRuntimeActiveTurnId(store.getState())).toBeNull();
    expect(selectThreadRuntimeSubscription(store.getState())).toBeNull();
    expect(selectThreadRuntimeThreadId(store.getState())).toBeNull();
    expect(selectThreadRuntimeSubscriptionState(store.getState())).toBeNull();
    expect(selectThreadRuntimeEventBuffer(store.getState())).toStrictEqual([]);
  });

  it("returns a stable empty event buffer when no runtime exists", () => {
    const root = runtimeRoot({ current: null });

    expect(selectThreadRuntimeEventBuffer(root)).toBe(selectThreadRuntimeEventBuffer(root));
  });

  it("creates a runtime baseline from an accepted attach", () => {
    const state = reduce(undefined, threadRuntimeAttached(attachBaseline));
    const { turns: snapshotTurns, ...threadMetadata } = attachBaseline.snapshot.thread;

    expect(state.current).toStrictEqual({
      threadId: attachBaseline.snapshot.thread.id,
      sessionId: attachBaseline.snapshot.thread.sessionId,
      thread: threadMetadata,
      snapshotTurns,
      snapshotReplayIndex: snapshotReplayIndexFromTurns(snapshotTurns),
      eventBuffer: [],
      activeTurnId: null,
      subscription: { state: "active" },
    });
    expect(selectThreadRuntimeRecord(runtimeRoot(state))).toStrictEqual(state.current);
    expect(selectThreadRuntimeActiveTurnId(runtimeRoot(state))).toBeNull();
    expect(selectThreadRuntimeSubscription(runtimeRoot(state))).toStrictEqual({
      state: "active",
    });
    expect(selectThreadRuntimeThreadId(runtimeRoot(state))).toBe(attachBaseline.snapshot.thread.id);
    expect(selectThreadRuntimeSubscriptionState(runtimeRoot(state))).toBe("active");
    expect(selectThreadRuntimeEventBuffer(runtimeRoot(state))).toStrictEqual([]);
  });

  it("derives the active turn from snapshot turns", () => {
    if (eventTurnStarted.event.type !== "turnStarted") {
      throw new Error("fixture must contain a turnStarted projection event");
    }
    const state = reduce(
      undefined,
      threadRuntimeAttached(
        attachWithTurns(attachBaseline, [
          ...attachBaseline.snapshot.thread.turns,
          eventTurnStarted.event.notification.turn,
        ]),
      ),
    );

    expect(state.current?.activeTurnId).toBe(eventTurnStarted.event.notification.turn.id);
  });

  it("buffers turn lifecycle events and tracks the active turn", () => {
    const attached = reduce(undefined, threadRuntimeAttached(attachBaseline));
    const started = reduce(
      attached,
      threadRuntimeEventBuffered({ notification: eventTurnStarted, replay: "live" }),
    );
    const completed = reduce(
      started,
      threadRuntimeEventBuffered({ notification: eventTurnCompleted, replay: "live" }),
    );

    expect(started.current?.activeTurnId).toBe("turn-in-progress");
    expect(completed.current?.activeTurnId).toBeNull();
    expect(completed.current?.eventBuffer).toStrictEqual([
      { type: "projectionEvent", notification: eventTurnStarted, replay: "live" },
      { type: "projectionEvent", notification: eventTurnCompleted, replay: "live" },
    ]);
  });

  it("requires projection payloads for buffered events", () => {
    expectTypeOf<
      Parameters<typeof threadRuntimeEventBuffered>[0]
    >().toEqualTypeOf<ThreadRuntimeProjectionEventPayload>();
    expectTypeOf<ThreadProjectionEventNotification>().not.toExtend<
      Parameters<typeof threadRuntimeEventBuffered>[0]
    >();

    expect(
      threadRuntimeEventBuffered({ notification: eventTurnStarted, replay: "live" }).payload,
    ).toStrictEqual({ notification: eventTurnStarted, replay: "live" });
  });

  it("does not clear active turn when a different turn completes", () => {
    if (eventTurnCompleted.event.type !== "turnCompleted") {
      throw new Error("fixture must contain a turnCompleted projection event");
    }
    const attached = reduce(undefined, threadRuntimeAttached(attachBaseline));
    const started = reduce(
      attached,
      threadRuntimeEventBuffered({ notification: eventTurnStarted, replay: "live" }),
    );
    const nonMatchingCompleted = turnCompleted(eventTurnCompleted, eventTurnCompleted.commitId, {
      ...eventTurnCompleted.event.notification.turn,
      id: "another-turn",
    });

    const state = reduce(
      started,
      threadRuntimeEventBuffered({ notification: nonMatchingCompleted, replay: "live" }),
    );

    expect(state.current?.activeTurnId).toBe("turn-in-progress");
    expect(state.current?.eventBuffer.at(-1)).toStrictEqual({
      type: "projectionEvent",
      notification: nonMatchingCompleted,
      replay: "live",
    });
  });

  it("buffers item events without upserting them into snapshot turns", () => {
    const attached = reduce(undefined, threadRuntimeAttached(attachBaseline));
    const itemStarted = reduce(
      attached,
      threadRuntimeEventBuffered({ notification: eventTurnStarted, replay: "live" }),
    );
    const itemBuffered = reduce(
      itemStarted,
      threadRuntimeEventBuffered({ notification: eventItemStarted, replay: "live" }),
    );
    const itemCompleted = reduce(
      itemBuffered,
      threadRuntimeEventBuffered({ notification: eventItemCompleted, replay: "live" }),
    );

    expect(itemCompleted.current?.snapshotTurns).toStrictEqual(
      attachBaseline.snapshot.thread.turns,
    );
    expect(itemCompleted.current?.eventBuffer).toStrictEqual([
      { type: "projectionEvent", notification: eventTurnStarted, replay: "live" },
      { type: "projectionEvent", notification: eventItemStarted, replay: "live" },
      { type: "projectionEvent", notification: eventItemCompleted, replay: "live" },
    ]);
  });

  it("exports accepted projection delta actions without mutating runtime buffers", () => {
    const state = reduce(undefined, threadRuntimeAttached(attachBaseline));
    const nextState = reduce(
      state,
      threadRuntimeDeltaAccepted({ notification: eventAgentMessageDelta }),
    );

    expect(nextState).toStrictEqual(state);
  });

  it("exports accepted projection delta batch actions without mutating runtime buffers", () => {
    expectTypeOf<
      Parameters<typeof threadRuntimeDeltasAccepted>[0]
    >().toEqualTypeOf<ThreadRuntimeProjectionDeltasPayload>();

    const state = reduce(undefined, threadRuntimeAttached(attachBaseline));
    const nextState = reduce(
      state,
      threadRuntimeDeltasAccepted({ notifications: [eventAgentMessageDelta] }),
    );

    expect(nextState).toStrictEqual(state);
    expect(threadRuntimeDeltasAccepted({ notifications: [eventAgentMessageDelta] }).payload)
      .toStrictEqual({
        notifications: [eventAgentMessageDelta],
      });
  });

  it("marks live turn events already present in the attach snapshot as snapshot duplicates", () => {
    if (eventTurnStarted.event.type !== "turnStarted") {
      throw new Error("fixture must contain a turnStarted projection event");
    }
    const attached = reduce(
      undefined,
      threadRuntimeAttached(
        attachWithTurns(attachBaseline, [eventTurnStarted.event.notification.turn]),
      ),
    );
    const replay = replayForProjectionEvent(
      snapshotReplayIndexFromTurns([eventTurnStarted.event.notification.turn]),
      eventTurnStarted,
    );

    const state = reduce(
      attached,
      threadRuntimeEventBuffered({
        notification: eventTurnStarted,
        replay,
      }),
    );

    expect(replay).toBe("snapshotDuplicate");
    expect(state.current?.activeTurnId).toBe(eventTurnStarted.event.notification.turn.id);
    expect(state.current?.eventBuffer).toStrictEqual([
      {
        type: "projectionEvent",
        notification: eventTurnStarted,
        replay: "snapshotDuplicate",
      },
    ]);
  });

  it("keeps a completed turn live when the snapshot only has the same turn in progress", () => {
    if (eventTurnStarted.event.type !== "turnStarted") {
      throw new Error("fixture must contain a turnStarted projection event");
    }
    if (eventTurnCompleted.event.type !== "turnCompleted") {
      throw new Error("fixture must contain a turnCompleted projection event");
    }
    const snapshotReplayIndex = snapshotReplayIndexFromTurns([
      eventTurnStarted.event.notification.turn,
    ]);
    const attached = reduce(
      undefined,
      threadRuntimeAttached(
        attachWithTurns(attachBaseline, [eventTurnStarted.event.notification.turn]),
      ),
    );
    const replay = replayForProjectionEvent(snapshotReplayIndex, eventTurnCompleted);

    const state = reduce(
      attached,
      threadRuntimeEventBuffered({
        notification: eventTurnCompleted,
        replay,
      }),
    );

    expect(replay).toBe("live");
    expect(state.current?.activeTurnId).toBeNull();
    expect(state.current?.eventBuffer).toStrictEqual([
      {
        type: "projectionEvent",
        notification: eventTurnCompleted,
        replay: "live",
      },
    ]);
  });

  it("marks live item events already present in the attach snapshot as snapshot duplicates", () => {
    if (eventTurnStarted.event.type !== "turnStarted") {
      throw new Error("fixture must contain a turnStarted projection event");
    }
    const snapshotItem = agentMessage("agent-snapshot-duplicate", "Already in snapshot");
    const snapshotTurn = {
      ...eventTurnStarted.event.notification.turn,
      items: [snapshotItem],
    };
    const attached = reduce(
      undefined,
      threadRuntimeAttached(attachWithTurns(attachBaseline, [snapshotTurn])),
    );
    const duplicateStarted = itemStarted(
      eventItemStarted,
      "commit-started-snapshot-duplicate",
      eventTurnStarted.event.notification.turn.id,
      snapshotItem,
    );
    const duplicateCompleted = itemCompleted(
      eventItemCompleted,
      "commit-completed-snapshot-duplicate",
      eventTurnStarted.event.notification.turn.id,
      snapshotItem,
    );
    const snapshotReplayIndex = snapshotReplayIndexFromTurns([snapshotTurn]);

    const started = reduce(
      attached,
      threadRuntimeEventBuffered({
        notification: duplicateStarted,
        replay: replayForProjectionEvent(snapshotReplayIndex, duplicateStarted),
      }),
    );
    const completed = reduce(
      started,
      threadRuntimeEventBuffered({
        notification: duplicateCompleted,
        replay: replayForProjectionEvent(snapshotReplayIndex, duplicateCompleted),
      }),
    );

    expect(completed.current?.eventBuffer).toStrictEqual([
      {
        type: "projectionEvent",
        notification: duplicateStarted,
        replay: "snapshotDuplicate",
      },
      {
        type: "projectionEvent",
        notification: duplicateCompleted,
        replay: "snapshotDuplicate",
      },
    ]);
  });

  it("caps the event buffer as a bounded replay tail", () => {
    if (eventTurnStarted.event.type !== "turnStarted") {
      throw new Error("fixture must contain a turnStarted projection event");
    }
    const attached = reduce(undefined, threadRuntimeAttached(attachBaseline));

    let state = attached;
    for (let index = 0; index < 501; index += 1) {
      const commitIndex = String(index);
      const parentCommitIndex = String(index - 1);
      state = reduce(
        state,
        threadRuntimeEventBuffered({
          notification: {
            ...turnStarted(eventTurnStarted, `commit-buffer-${commitIndex}`, {
              ...eventTurnStarted.event.notification.turn,
              id: `turn-buffer-${commitIndex}`,
            }),
            parentCommitId: index === 0 ? null : `commit-buffer-${parentCommitIndex}`,
          },
          replay: "live",
        }),
      );
    }

    expect(state.current?.eventBuffer).toHaveLength(500);
    expect(state.current?.eventBuffer[0]?.notification.commitId).toBe("commit-buffer-1");
    expect(state.current?.eventBuffer.at(-1)?.notification.commitId).toBe("commit-buffer-500");
    expect(state.current?.activeTurnId).toBe("turn-buffer-500");
  });

  it("records manual reconnect state and blocks later events", () => {
    const attached = reduce(undefined, threadRuntimeAttached(attachBaseline));
    const interrupted = reduce(
      attached,
      threadRuntimeManualReconnectRequired({
        reason: "backpressure",
        threadId: attachBaseline.snapshot.thread.id,
        subscriptionId: attachBaseline.subscriptionId,
      }),
    );
    const afterEvent = reduce(
      interrupted,
      threadRuntimeEventBuffered({ notification: eventTurnStarted, replay: "live" }),
    );

    expect(interrupted.current?.subscription).toStrictEqual({
      state: "manualReconnectRequired",
      reason: "backpressure",
      subscriptionId: attachBaseline.subscriptionId,
    });
    expect(selectThreadRuntimeSubscriptionState(runtimeRoot(interrupted))).toBe(
      "manualReconnectRequired",
    );
    expect(afterEvent).toStrictEqual(interrupted);
  });

  it("ignores manual reconnect for another thread and ignores reconnect without runtime", () => {
    const attached = reduce(undefined, threadRuntimeAttached(attachBaseline));

    expect(
      reduce(
        attached,
        threadRuntimeManualReconnectRequired({
          reason: "backpressure",
          threadId: "00000000-0000-0000-0000-000000000099",
          subscriptionId: attachBaseline.subscriptionId,
        }),
      ),
    ).toStrictEqual(attached);
    expect(
      reduce(
        undefined,
        threadRuntimeManualReconnectRequired({
          reason: "backpressure",
          threadId: attachBaseline.snapshot.thread.id,
          subscriptionId: attachBaseline.subscriptionId,
        }),
      ),
    ).toStrictEqual({ current: null });
  });

  it("rebuilds baseline and clears manual reconnect state on a new attach", () => {
    const attached = reduce(undefined, threadRuntimeAttached(attachBaseline));
    const interrupted = reduce(
      attached,
      threadRuntimeManualReconnectRequired({
        reason: "backpressure",
        threadId: attachBaseline.snapshot.thread.id,
        subscriptionId: attachBaseline.subscriptionId,
      }),
    );

    const state = reduce(interrupted, threadRuntimeAttached(attachReplacement));

    expect(state.current?.thread.name).toBe("Replacement projection fixture");
    expect(state.current?.snapshotTurns).toStrictEqual(attachReplacement.snapshot.thread.turns);
    expect(state.current?.eventBuffer).toStrictEqual([]);
    expect(state.current?.subscription).toStrictEqual({ state: "active" });
  });
});
