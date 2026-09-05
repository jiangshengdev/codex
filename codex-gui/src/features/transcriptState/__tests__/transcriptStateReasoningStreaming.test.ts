import { describe, expect, it } from "vitest";
import { makeStore } from "@/app/store";
import { activeThreadReadModelTransitionApplied } from "@/features/activeThreadSession/activeThreadSessionReadModel";
import type {
  ActiveThreadProjectionAcceptedEvent,
  ActiveThreadProjectionReadModelFact,
} from "@/features/activeThreadSession/activeThreadProjectionFacts";
import {
  attachBaseline,
  eventItemCompleted,
  eventItemStarted,
  eventReasoningSummaryPartAddedDelta,
  eventReasoningSummaryTextDelta,
  eventReasoningTextDelta,
} from "@/features/projection/__tests__/projectionFixtures";
import {
  agentMessage,
  attachWithTurns,
  deltaWithEnvelope,
  itemCompleted,
  itemStarted,
  reasoningItem,
  reasoningSummaryPartAddedDelta,
  reasoningSummaryTextDelta,
  reasoningTextDelta,
} from "@/features/projection/__tests__/projectionTestBuilders";
import {
  selectTranscriptChunk,
  selectTranscriptEntry,
  selectTranscriptLiveScrollPulse,
  selectTranscriptTurn,
  transcriptEntryIdFor,
} from "../transcriptStateSlice";

let sessionRevision = 0;
const readModelAction = (...facts: ActiveThreadProjectionReadModelFact[]) =>
  activeThreadReadModelTransitionApplied({ sessionRevision: ++sessionRevision, facts });
const threadRuntimeAttached = (
  response: Extract<ActiveThreadProjectionReadModelFact, { type: "baselineAttached" }>["response"],
) => readModelAction({ type: "baselineAttached", response });
const threadRuntimeEventBuffered = (payload: ActiveThreadProjectionAcceptedEvent) =>
  readModelAction({ type: "eventAccepted", payload });
const threadRuntimeDeltasAccepted = ({
  notifications,
}: Pick<
  Extract<ActiveThreadProjectionReadModelFact, { type: "deltasAccepted" }>,
  "notifications"
>) => readModelAction({ type: "deltasAccepted", notifications });

const startReasoning = (turnId: string, itemId: string) => {
  const store = makeStore();
  store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
  store.dispatch(
    threadRuntimeEventBuffered({
      notification: itemStarted(
        eventItemStarted,
        "commit-" + itemId + "-started",
        turnId,
        reasoningItem(itemId, []),
      ),
      replay: "live",
    }),
  );
  return store;
};

const summaryText = (turnId: string, itemId: string, delta: string, summaryIndex: number) =>
  reasoningSummaryTextDelta(eventReasoningSummaryTextDelta, turnId, itemId, delta, summaryIndex);
const summaryPart = (turnId: string, itemId: string, summaryIndex: number) =>
  reasoningSummaryPartAddedDelta(eventReasoningSummaryPartAddedDelta, turnId, itemId, summaryIndex);
const acceptDeltas = (
  store: ReturnType<typeof makeStore>,
  ...notifications: ReturnType<typeof summaryText>[]
) => store.dispatch(threadRuntimeDeltasAccepted({ notifications }));

type StreamingExpectation = [
  Record<number, string>,
  number,
  string | null,
  number,
  number,
  number,
  number,
];

const liveReasoningSnapshot = (
  store: ReturnType<typeof makeStore>,
  turnId: string,
  itemId: string,
) => {
  const entryId = transcriptEntryIdFor(turnId, itemId);
  return {
    entry: store.getState().transcriptState.entriesById[entryId],
    view: selectTranscriptEntry(store.getState(), entryId),
    chunk: selectTranscriptChunk(store.getState(), turnId + ":chunk:0"),
    turn: selectTranscriptTurn(store.getState(), turnId),
    pulse: selectTranscriptLiveScrollPulse(store.getState()),
  };
};

const expectStreamingReasoning = (
  store: ReturnType<typeof makeStore>,
  turnId: string,
  itemId: string,
  parts: Record<number, string>,
  current: number,
  title: string | null,
  revision: number,
  chunkRevision: number,
  count: number,
  pulse: number,
) => {
  const view =
    title == null
      ? null
      : { type: "reasoning", id: itemId, turnId, lifecycle: "streaming", title, revision };
  expect(liveReasoningSnapshot(store, turnId, itemId)).toStrictEqual({
    entry: {
      type: "reasoning",
      id: itemId,
      turnId,
      lifecycle: "streaming",
      summaryParts: parts,
      currentSummaryIndex: current,
      title,
      revision,
    },
    view,
    chunk: {
      id: turnId + ":chunk:0",
      turnId,
      revision: chunkRevision,
      entries: view == null ? [] : [view],
    },
    turn: {
      id: turnId,
      status: "inProgress",
      originalFirstItemId: itemId,
      leadingPromptEntryId: null,
      middleChunkIds: [turnId + ":chunk:0"],
      middleEntryCount: count,
      finalAssistantEntryIds: [],
    },
    pulse,
  });
};

const runReasoningStages = (
  turnId: string,
  itemId: string,
  stages: { notifications: ReturnType<typeof summaryText>[]; expected: StreamingExpectation }[],
) => {
  const store = startReasoning(turnId, itemId);
  const initialPulse = selectTranscriptLiveScrollPulse(store.getState());
  for (const { notifications, expected } of stages) {
    acceptDeltas(store, ...notifications);
    const [parts, current, title, revision, chunkRevision, count, pulseDelta] = expected;
    expectStreamingReasoning(
      store,
      turnId,
      itemId,
      parts,
      current,
      title,
      revision,
      chunkRevision,
      count,
      initialPulse + pulseDelta,
    );
  }
};

describe("transcript state live streaming reducer", () => {
  it("closes a reasoning title across deltas and updates the same summary position", () => {
    expect.hasAssertions();
    const turnId = "turn-reasoning-cross-delta";
    const itemId = "reasoning-cross-delta";
    runReasoningStages(turnId, itemId, [
      {
        notifications: [
          summaryText(turnId, itemId, "**Plan", 0),
          summaryText(turnId, itemId, "ning**", 0),
        ],
        expected: [{ 0: "**Planning**" }, 0, "Planning", 2, 3, 1, 1],
      },
      {
        notifications: [summaryText(turnId, itemId, " details", 0)],
        expected: [{ 0: "**Planning** details" }, 0, "Planning", 3, 4, 1, 1],
      },
    ]);
  });

  it("switches reasoning visibility across sparse summary part boundaries", () => {
    expect.hasAssertions();
    const turnId = "turn-reasoning-parts";
    const itemId = "reasoning-parts";
    runReasoningStages(turnId, itemId, [
      {
        notifications: [
          summaryText(turnId, itemId, "**First**", 0),
          summaryPart(turnId, itemId, 2),
        ],
        expected: [{ 0: "**First**", 2: "" }, 2, null, 2, 3, 0, 1],
      },
      {
        notifications: [summaryText(turnId, itemId, "**Third**", 2)],
        expected: [{ 0: "**First**", 2: "**Third**" }, 2, "Third", 3, 4, 1, 2],
      },
    ]);
  });

  it("ignores raw reasoning and summary deltas for the wrong thread or target", () => {
    const turnId = "turn-reasoning-filtered";
    const itemId = "reasoning-filtered";
    const store = startReasoning(turnId, itemId);
    const wrongTarget = agentMessage("reasoning-wrong-target", "", "commentary");
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemStarted(eventItemStarted, "commit-wrong-target", turnId, wrongTarget),
        replay: "live",
      }),
    );
    acceptDeltas(store, summaryText(turnId, itemId, "**Kept**", 0));
    const beforeState = store.getState().transcriptState;
    const expected = liveReasoningSnapshot(store, turnId, itemId);
    acceptDeltas(
      store,
      reasoningTextDelta(eventReasoningTextDelta, turnId, itemId, "raw secret", 0),
      deltaWithEnvelope(summaryText(turnId, itemId, "wrong thread", 0), {
        threadId: "wrong-thread-id",
      }),
      summaryText(turnId, wrongTarget.id, "wrong item type", 0),
      summaryPart(turnId, "missing-reasoning-entry", 1),
    );
    const afterState = store.getState().transcriptState;
    expect(afterState.sessionRevision).toBeGreaterThan(beforeState.sessionRevision);
    expect({ ...afterState, sessionRevision: beforeState.sessionRevision }).toStrictEqual(
      beforeState,
    );
    expect(liveReasoningSnapshot(store, turnId, itemId)).toStrictEqual(expected);
  });

  it("ignores reasoning deltas that arrive after the entry completes", () => {
    const turnId = "turn-reasoning-completed";
    const itemId = "reasoning-completed";
    const store = startReasoning(turnId, itemId);
    acceptDeltas(store, summaryText(turnId, itemId, "**Streaming**", 0));
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemCompleted(
          eventItemCompleted,
          "commit-reasoning-completed",
          turnId,
          reasoningItem(itemId, [" Final summary "], ["raw reasoning"]),
        ),
        replay: "live",
      }),
    );
    const completedView = {
      type: "reasoning",
      id: itemId,
      turnId,
      lifecycle: "completed",
      source: "Final summary",
      revision: 2,
    };
    const expected = {
      entry: {
        type: "reasoning",
        id: itemId,
        turnId,
        lifecycle: "completed",
        summaryParts: ["Final summary"],
        revision: 2,
      },
      view: completedView,
      chunk: { id: turnId + ":chunk:0", turnId, revision: 3, entries: [completedView] },
      turn: {
        id: turnId,
        status: "inProgress",
        originalFirstItemId: itemId,
        leadingPromptEntryId: null,
        middleChunkIds: [turnId + ":chunk:0"],
        middleEntryCount: 1,
        finalAssistantEntryIds: [],
      },
      pulse: selectTranscriptLiveScrollPulse(store.getState()),
    };
    expect(liveReasoningSnapshot(store, turnId, itemId)).toStrictEqual(expected);
    const beforeLateDeltas = store.getState().transcriptState;
    acceptDeltas(
      store,
      summaryText(turnId, itemId, "late summary", 0),
      summaryPart(turnId, itemId, 1),
      reasoningTextDelta(eventReasoningTextDelta, turnId, itemId, "late raw", 0),
    );
    const afterLateDeltas = store.getState().transcriptState;
    expect(afterLateDeltas.sessionRevision).toBeGreaterThan(beforeLateDeltas.sessionRevision);
    expect({ ...afterLateDeltas, sessionRevision: beforeLateDeltas.sessionRevision }).toStrictEqual(
      beforeLateDeltas,
    );
    expect(liveReasoningSnapshot(store, turnId, itemId)).toStrictEqual(expected);
  });
});
