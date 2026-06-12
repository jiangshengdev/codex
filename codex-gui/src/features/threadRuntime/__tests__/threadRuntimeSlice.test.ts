import { describe, expect, it } from "vitest";
import attachBaselineJson from "@/features/projection/__fixtures__/attach-baseline.json";
import attachReplacementJson from "@/features/projection/__fixtures__/attach-replacement.json";
import eventItemCompletedJson from "@/features/projection/__fixtures__/event-item-completed.json";
import eventItemStartedJson from "@/features/projection/__fixtures__/event-item-started.json";
import eventTurnCompletedJson from "@/features/projection/__fixtures__/event-turn-completed.json";
import eventTurnStartedJson from "@/features/projection/__fixtures__/event-turn-started.json";
import type {
  ThreadProjectionAttachResponse,
  ThreadProjectionEventNotification,
  Turn,
} from "@codex-protocol/v2";
import {
  selectThreadRuntimeActiveTurnId,
  selectThreadRuntimeEventBuffer,
  selectThreadRuntimeRecord,
  selectThreadRuntimeSubscription,
  threadRuntimeAttached,
  threadRuntimeEventBuffered,
  threadRuntimeManualReconnectRequired,
  threadRuntimeSlice,
  type ThreadRuntimeState,
} from "../threadRuntimeSlice";

const attachBaseline = attachBaselineJson as ThreadProjectionAttachResponse;
const attachReplacement = attachReplacementJson as ThreadProjectionAttachResponse;
const eventTurnStarted = eventTurnStartedJson as ThreadProjectionEventNotification;
const eventTurnCompleted = eventTurnCompletedJson as ThreadProjectionEventNotification;
const eventItemStarted = eventItemStartedJson as ThreadProjectionEventNotification;
const eventItemCompleted = eventItemCompletedJson as ThreadProjectionEventNotification;

const reduce = (
  state: ThreadRuntimeState | undefined,
  action:
    | ReturnType<typeof threadRuntimeAttached>
    | ReturnType<typeof threadRuntimeEventBuffered>
    | ReturnType<typeof threadRuntimeManualReconnectRequired>,
) => threadRuntimeSlice.reducer(state, action);

const attachWithTurns = (turns: Turn[]): ThreadProjectionAttachResponse => ({
  ...attachBaseline,
  snapshot: {
    ...attachBaseline.snapshot,
    thread: {
      ...attachBaseline.snapshot.thread,
      turns,
    },
  },
});

const runtimeRoot = (state: ThreadRuntimeState) => ({ threadRuntime: state });

describe("thread runtime reducer", () => {
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
      eventBuffer: [],
      activeTurnId: null,
      subscription: { state: "active" },
    });
    expect(selectThreadRuntimeRecord(runtimeRoot(state))).toStrictEqual(state.current);
    expect(selectThreadRuntimeActiveTurnId(runtimeRoot(state))).toBeNull();
    expect(selectThreadRuntimeSubscription(runtimeRoot(state))).toStrictEqual({
      state: "active",
    });
    expect(selectThreadRuntimeEventBuffer(runtimeRoot(state))).toStrictEqual([]);
  });

  it("derives the active turn from snapshot turns", () => {
    if (eventTurnStarted.event.type !== "turnStarted") {
      throw new Error("fixture must contain a turnStarted projection event");
    }
    const state = reduce(
      undefined,
      threadRuntimeAttached(
        attachWithTurns([
          ...attachBaseline.snapshot.thread.turns,
          eventTurnStarted.event.notification.turn,
        ]),
      ),
    );

    expect(state.current?.activeTurnId).toBe(eventTurnStarted.event.notification.turn.id);
  });

  it("buffers turn lifecycle events and tracks the active turn", () => {
    const attached = reduce(undefined, threadRuntimeAttached(attachBaseline));
    const started = reduce(attached, threadRuntimeEventBuffered(eventTurnStarted));
    const completed = reduce(started, threadRuntimeEventBuffered(eventTurnCompleted));

    expect(started.current?.activeTurnId).toBe("turn-in-progress");
    expect(completed.current?.activeTurnId).toBeNull();
    expect(completed.current?.eventBuffer).toStrictEqual([
      { type: "projectionEvent", notification: eventTurnStarted },
      { type: "projectionEvent", notification: eventTurnCompleted },
    ]);
  });

  it("does not clear active turn when a different turn completes", () => {
    if (eventTurnCompleted.event.type !== "turnCompleted") {
      throw new Error("fixture must contain a turnCompleted projection event");
    }
    const attached = reduce(undefined, threadRuntimeAttached(attachBaseline));
    const started = reduce(attached, threadRuntimeEventBuffered(eventTurnStarted));
    const nonMatchingCompleted: ThreadProjectionEventNotification = {
      ...eventTurnCompleted,
      event: {
        ...eventTurnCompleted.event,
        notification: {
          ...eventTurnCompleted.event.notification,
          turn: {
            ...eventTurnCompleted.event.notification.turn,
            id: "another-turn",
          },
        },
      },
    };

    const state = reduce(started, threadRuntimeEventBuffered(nonMatchingCompleted));

    expect(state.current?.activeTurnId).toBe("turn-in-progress");
    expect(state.current?.eventBuffer.at(-1)).toStrictEqual({
      type: "projectionEvent",
      notification: nonMatchingCompleted,
    });
  });

  it("buffers item events without upserting them into snapshot turns", () => {
    const attached = reduce(undefined, threadRuntimeAttached(attachBaseline));
    const itemStarted = reduce(attached, threadRuntimeEventBuffered(eventTurnStarted));
    const itemBuffered = reduce(itemStarted, threadRuntimeEventBuffered(eventItemStarted));
    const itemCompleted = reduce(itemBuffered, threadRuntimeEventBuffered(eventItemCompleted));

    expect(itemCompleted.current?.snapshotTurns).toStrictEqual(
      attachBaseline.snapshot.thread.turns,
    );
    expect(itemCompleted.current?.eventBuffer).toStrictEqual([
      { type: "projectionEvent", notification: eventTurnStarted },
      { type: "projectionEvent", notification: eventItemStarted },
      { type: "projectionEvent", notification: eventItemCompleted },
    ]);
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
    const afterEvent = reduce(interrupted, threadRuntimeEventBuffered(eventTurnStarted));

    expect(interrupted.current?.subscription).toStrictEqual({
      state: "manualReconnectRequired",
      reason: "backpressure",
      subscriptionId: attachBaseline.subscriptionId,
    });
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
