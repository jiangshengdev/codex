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
  ThreadItem,
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

const fixtureTurn = (turn: Turn | undefined, label: string): Turn => {
  if (turn == null) {
    throw new Error(`missing ${label} fixture turn`);
  }

  return turn;
};

const fixtureItem = (item: ThreadItem | undefined, label: string): ThreadItem => {
  if (item == null) {
    throw new Error(`missing ${label} fixture item`);
  }

  return item;
};

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
    const turn = fixtureTurn(attachBaseline.snapshot.thread.turns[0], "baseline");
    const item = fixtureItem(turn.items[0], "baseline");

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
    const firstTurn = fixtureTurn(attachBaseline.snapshot.thread.turns[0], "first");
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
    const firstItem = fixtureItem(firstTurn.items[0], "first turn");
    const secondFirstItem = fixtureItem(secondTurn.items[0], "second turn first");
    const secondSecondItem = fixtureItem(secondTurn.items[1], "second turn second");
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
        item: firstItem,
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
        item: secondFirstItem,
      },
      {
        type: "itemReplayed",
        source: "snapshotReplay",
        threadId: attachBaseline.snapshot.thread.id,
        turnId: secondTurn.id,
        item: secondSecondItem,
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
    const firstItem = fixtureItem(inProgressTurn.items[0], "in-progress first");
    const secondItem = fixtureItem(inProgressTurn.items[1], "in-progress second");
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
        item: firstItem,
      },
      {
        type: "itemReplayed",
        source: "snapshotReplay",
        threadId: attachBaseline.snapshot.thread.id,
        turnId: inProgressTurn.id,
        item: secondItem,
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
