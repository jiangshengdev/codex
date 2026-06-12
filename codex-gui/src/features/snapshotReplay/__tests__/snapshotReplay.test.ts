import { describe, expect, it } from "vitest";
import { makeStore } from "@/app/store";
import attachBaselineJson from "@/features/projection/__fixtures__/attach-baseline.json";
import eventItemStartedJson from "@/features/projection/__fixtures__/event-item-started.json";
import eventTurnStartedJson from "@/features/projection/__fixtures__/event-turn-started.json";
import {
  threadRuntimeAttached,
  threadRuntimeEventBuffered,
  type ThreadRuntimeRecord,
} from "@/features/threadRuntime/threadRuntimeSlice";
import type {
  ThreadProjectionAttachResponse,
  ThreadProjectionEventNotification,
  Turn,
} from "@codex-protocol/v2";
import {
  buildSnapshotReplayMaterials,
  selectSnapshotReplayMaterials,
  type SnapshotReplayMaterial,
} from "../snapshotReplay";

const attachBaseline = attachBaselineJson as ThreadProjectionAttachResponse;
const eventTurnStarted = eventTurnStartedJson as ThreadProjectionEventNotification;
const eventItemStarted = eventItemStartedJson as ThreadProjectionEventNotification;

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

const runtimeFromAttach = (response: ThreadProjectionAttachResponse): ThreadRuntimeRecord => {
  const { turns: snapshotTurns, ...thread } = response.snapshot.thread;

  return {
    threadId: thread.id,
    sessionId: thread.sessionId,
    thread,
    snapshotTurns,
    eventBuffer: [],
    activeTurnId:
      snapshotTurns.toReversed().find((turn) => turn.status === "inProgress")?.id ?? null,
    subscription: { state: "active" },
  };
};

describe("snapshot replay", () => {
  it("returns no material when no runtime exists", () => {
    const store = makeStore();

    expect(buildSnapshotReplayMaterials(null)).toStrictEqual([]);
    expect(selectSnapshotReplayMaterials(store.getState())).toStrictEqual([]);
  });

  it("expands snapshot turns into ordered replay material", () => {
    const runtime = runtimeFromAttach(attachBaseline);
    const turn = attachBaseline.snapshot.thread.turns[0];
    const item = turn.items[0];

    expect(buildSnapshotReplayMaterials(runtime)).toStrictEqual([
      {
        type: "turnStarted",
        source: "snapshotReplay",
        threadId: attachBaseline.snapshot.thread.id,
        turn,
      },
      {
        type: "itemReplayed",
        source: "snapshotReplay",
        threadId: attachBaseline.snapshot.thread.id,
        turnId: turn.id,
        item,
      },
      {
        type: "turnCompleted",
        source: "snapshotReplay",
        threadId: attachBaseline.snapshot.thread.id,
        turn: turnWithoutItems(turn),
      },
    ] satisfies SnapshotReplayMaterial[]);
  });

  it("expands multiple snapshot turns in snapshot order", () => {
    const firstTurn = attachBaseline.snapshot.thread.turns[0];
    const secondTurn: Turn = {
      ...firstTurn,
      id: "second-turn",
      items: [
        { type: "plan", id: "second-plan", text: "Second replayed item" },
        { type: "plan", id: "third-plan", text: "Third replayed item" },
      ],
      startedAt: 1700000010,
      completedAt: 1700000016,
      durationMs: 6000,
    };
    const runtime = runtimeFromAttach(attachWithTurns([firstTurn, secondTurn]));

    expect(buildSnapshotReplayMaterials(runtime)).toStrictEqual([
      {
        type: "turnStarted",
        source: "snapshotReplay",
        threadId: attachBaseline.snapshot.thread.id,
        turn: firstTurn,
      },
      {
        type: "itemReplayed",
        source: "snapshotReplay",
        threadId: attachBaseline.snapshot.thread.id,
        turnId: firstTurn.id,
        item: firstTurn.items[0],
      },
      {
        type: "turnCompleted",
        source: "snapshotReplay",
        threadId: attachBaseline.snapshot.thread.id,
        turn: turnWithoutItems(firstTurn),
      },
      {
        type: "turnStarted",
        source: "snapshotReplay",
        threadId: attachBaseline.snapshot.thread.id,
        turn: secondTurn,
      },
      {
        type: "itemReplayed",
        source: "snapshotReplay",
        threadId: attachBaseline.snapshot.thread.id,
        turnId: secondTurn.id,
        item: secondTurn.items[0],
      },
      {
        type: "itemReplayed",
        source: "snapshotReplay",
        threadId: attachBaseline.snapshot.thread.id,
        turnId: secondTurn.id,
        item: secondTurn.items[1],
      },
      {
        type: "turnCompleted",
        source: "snapshotReplay",
        threadId: attachBaseline.snapshot.thread.id,
        turn: turnWithoutItems(secondTurn),
      },
    ] satisfies SnapshotReplayMaterial[]);
  });

  it("keeps in-progress turns open and preserves item order", () => {
    if (eventTurnStarted.event.type !== "turnStarted") {
      throw new Error("fixture must contain a turnStarted projection event");
    }
    if (eventItemStarted.event.type !== "itemStarted") {
      throw new Error("fixture must contain an itemStarted projection event");
    }

    const inProgressTurn: Turn = {
      ...eventTurnStarted.event.notification.turn,
      items: [
        { type: "plan", id: "first-plan", text: "First replayed item" },
        eventItemStarted.event.notification.item,
      ],
    };
    const runtime = runtimeFromAttach(attachWithTurns([inProgressTurn]));

    expect(buildSnapshotReplayMaterials(runtime)).toStrictEqual([
      {
        type: "turnStarted",
        source: "snapshotReplay",
        threadId: attachBaseline.snapshot.thread.id,
        turn: inProgressTurn,
      },
      {
        type: "itemReplayed",
        source: "snapshotReplay",
        threadId: attachBaseline.snapshot.thread.id,
        turnId: inProgressTurn.id,
        item: inProgressTurn.items[0],
      },
      {
        type: "itemReplayed",
        source: "snapshotReplay",
        threadId: attachBaseline.snapshot.thread.id,
        turnId: inProgressTurn.id,
        item: inProgressTurn.items[1],
      },
    ] satisfies SnapshotReplayMaterial[]);
  });

  it("selects replay material from thread runtime state without consuming event buffer", () => {
    const store = makeStore();
    store.dispatch(threadRuntimeAttached(attachBaseline));

    const beforeLiveEvent = selectSnapshotReplayMaterials(store.getState());

    store.dispatch(threadRuntimeEventBuffered(eventTurnStarted));

    expect(selectSnapshotReplayMaterials(store.getState())).toStrictEqual(beforeLiveEvent);
  });
});
