import { describe, expect, it } from "vitest";
import { makeStore } from "@/app/store";
import { activeThreadReadModelTransitionApplied } from "@/features/activeThreadSession/activeThreadSessionReadModel";
import type {
  ActiveThreadProjectionAcceptedEvent,
  ActiveThreadProjectionReadModelFact,
} from "@/features/activeThreadSession/activeThreadProjectionFacts";
import {
  attachBaseline,
  eventAgentMessageDelta,
  eventItemStarted,
  eventReasoningTextDelta,
} from "@/features/projection/__tests__/projectionFixtures";
import {
  agentMessage,
  agentMessageDelta,
  attachWithTurns,
  itemStarted,
} from "@/features/projection/__tests__/projectionTestBuilders";
import {
  selectCommittedTranscriptScrollCommitKey,
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

describe("transcript state live streaming reducer", () => {
  it("keeps a started final answer out of middle until its first delta makes it visible", () => {
    const store = makeStore();

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
    const attachKey = selectCommittedTranscriptScrollCommitKey(store.getState());

    const initialItem = agentMessage("agent-live-started", "", "final_answer");
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemStarted(
          eventItemStarted,
          "commit-live-started-slot",
          "turn-live-started-slot",
          initialItem,
        ),
        replay: "live",
      }),
    );

    const entryId = transcriptEntryIdFor("turn-live-started-slot", "agent-live-started");
    const expectedStartedStoredEntry = {
      type: "live" as const,
      id: "agent-live-started",
      key: entryId,
      turnId: "turn-live-started-slot",
      itemId: "agent-live-started",
      status: "started" as const,
      initialItem,
      transientText: "",
      revision: 0,
    };
    expect(store.getState().transcriptState.entriesById[entryId]).toStrictEqual(
      expectedStartedStoredEntry,
    );
    expect(selectTranscriptEntry(store.getState(), entryId)).toBeNull();
    expect(selectTranscriptTurn(store.getState(), "turn-live-started-slot")).toStrictEqual({
      id: "turn-live-started-slot",
      status: "inProgress",
      originalFirstItemId: "agent-live-started",
      leadingPromptEntryId: null,
      middleChunkIds: [],
      middleEntryCount: 0,
      finalAssistantEntryIds: [],
    });
    expect(selectTranscriptChunk(store.getState(), "turn-live-started-slot:chunk:0")).toBeNull();
    expect(selectCommittedTranscriptScrollCommitKey(store.getState())).toBe(attachKey);

    store.dispatch(
      threadRuntimeDeltasAccepted({
        notifications: [
          agentMessageDelta(
            eventAgentMessageDelta,
            "turn-live-started-slot",
            "agent-live-started",
            "Initial text should stay live only",
          ),
        ],
      }),
    );

    expect(store.getState().transcriptState.entriesById[entryId]).toStrictEqual({
      ...expectedStartedStoredEntry,
      status: "streaming",
      transientText: "Initial text should stay live only",
      revision: 1,
    });
    expect(selectTranscriptEntry(store.getState(), entryId)).toStrictEqual({
      type: "message",
      id: "agent-live-started",
      turnId: "turn-live-started-slot",
      role: "assistant",
      rendering: {
        mode: "streamingMarkdown",
        source: "Initial text should stay live only",
      },
      revision: 1,
    });
    expect(selectTranscriptTurn(store.getState(), "turn-live-started-slot")).toStrictEqual({
      id: "turn-live-started-slot",
      status: "inProgress",
      originalFirstItemId: "agent-live-started",
      leadingPromptEntryId: null,
      middleChunkIds: [],
      middleEntryCount: 0,
      finalAssistantEntryIds: [entryId],
    });
    expect(selectTranscriptChunk(store.getState(), "turn-live-started-slot:chunk:0")).toBeNull();
    expect(selectCommittedTranscriptScrollCommitKey(store.getState())).toBe(attachKey);
  });

  it("appends accepted agent message deltas into an existing middle live payload", () => {
    const store = makeStore();

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
    const attachKey = selectCommittedTranscriptScrollCommitKey(store.getState());
    const initialPulse = selectTranscriptLiveScrollPulse(store.getState());

    const initialItem = agentMessage("agent-streaming", "", "commentary");
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemStarted(
          eventItemStarted,
          "commit-streaming-started",
          "turn-streaming",
          initialItem,
        ),
        replay: "live",
      }),
    );
    expect(selectTranscriptTurn(store.getState(), "turn-streaming")?.middleEntryCount).toBe(0);
    expect(selectTranscriptLiveScrollPulse(store.getState())).toBe(initialPulse);
    store.dispatch(
      threadRuntimeDeltasAccepted({
        notifications: [
          agentMessageDelta(eventAgentMessageDelta, "turn-streaming", "agent-streaming", "Hello"),
        ],
      }),
    );
    expect(selectTranscriptTurn(store.getState(), "turn-streaming")?.middleEntryCount).toBe(1);
    expect(selectTranscriptLiveScrollPulse(store.getState())).toBe(initialPulse + 1);
    store.dispatch(
      threadRuntimeDeltasAccepted({
        notifications: [
          agentMessageDelta(eventAgentMessageDelta, "turn-streaming", "agent-streaming", " world"),
        ],
      }),
    );

    const entryId = transcriptEntryIdFor("turn-streaming", "agent-streaming");
    const expectedStreamingStoredEntry = {
      type: "live" as const,
      id: "agent-streaming",
      key: entryId,
      turnId: "turn-streaming",
      itemId: "agent-streaming",
      status: "streaming",
      initialItem,
      transientText: "Hello world",
      revision: 2,
    };
    const expectedStreamingView = {
      type: "message" as const,
      id: "agent-streaming",
      turnId: "turn-streaming",
      role: "assistant" as const,
      rendering: { mode: "streamingMarkdown" as const, source: "Hello world" },
      revision: 2,
    };
    expect(store.getState().transcriptState.entriesById[entryId]).toStrictEqual(
      expectedStreamingStoredEntry,
    );
    expect(selectTranscriptEntry(store.getState(), entryId)).toStrictEqual(expectedStreamingView);
    expect(selectTranscriptChunk(store.getState(), "turn-streaming:chunk:0")).toStrictEqual({
      id: "turn-streaming:chunk:0",
      turnId: "turn-streaming",
      revision: 3,
      entries: [expectedStreamingView],
    });
    expect(selectCommittedTranscriptScrollCommitKey(store.getState())).toBe(attachKey);
    expect(selectTranscriptTurn(store.getState(), "turn-streaming")?.middleEntryCount).toBe(1);
    expect(selectTranscriptLiveScrollPulse(store.getState())).toBe(initialPulse + 2);
  });

  it("does not activate an empty started item from an empty accepted delta", () => {
    const store = makeStore();
    const initialItem = agentMessage("agent-empty-delta", "", "commentary");

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
    const initialPulse = selectTranscriptLiveScrollPulse(store.getState());
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemStarted(
          eventItemStarted,
          "commit-empty-delta-started",
          "turn-empty-delta",
          initialItem,
        ),
        replay: "live",
      }),
    );
    store.dispatch(
      threadRuntimeDeltasAccepted({
        notifications: [
          agentMessageDelta(eventAgentMessageDelta, "turn-empty-delta", "agent-empty-delta", ""),
        ],
      }),
    );

    expect(selectTranscriptTurn(store.getState(), "turn-empty-delta")?.middleEntryCount).toBe(0);
    expect(selectTranscriptLiveScrollPulse(store.getState())).toBe(initialPulse);
    const entryId = transcriptEntryIdFor("turn-empty-delta", "agent-empty-delta");
    expect(store.getState().transcriptState.entriesById[entryId]).toMatchObject({
      type: "live",
      status: "started",
      transientText: "",
      revision: 0,
    });
    expect(selectTranscriptEntry(store.getState(), entryId)).toBeNull();
  });

  it("coalesces accepted agent message delta batches per live item in notification order", () => {
    const store = makeStore();
    const initialItem = agentMessage("agent-streaming-batch", "", "commentary");
    const started = itemStarted(
      eventItemStarted,
      "commit-streaming-batch-started",
      "turn-streaming-batch",
      initialItem,
    );
    const firstDelta = agentMessageDelta(
      eventAgentMessageDelta,
      "turn-streaming-batch",
      "agent-streaming-batch",
      "Hello",
    );
    const secondDelta = agentMessageDelta(
      eventAgentMessageDelta,
      "turn-streaming-batch",
      "agent-streaming-batch",
      " world",
    );

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: started,
        replay: "live",
      }),
    );
    const pulseAfterStarted = selectTranscriptLiveScrollPulse(store.getState());

    store.dispatch(threadRuntimeDeltasAccepted({ notifications: [firstDelta, secondDelta] }));

    const entryId = transcriptEntryIdFor("turn-streaming-batch", "agent-streaming-batch");
    const expectedBatchStoredEntry = {
      type: "live" as const,
      id: "agent-streaming-batch",
      key: entryId,
      turnId: "turn-streaming-batch",
      itemId: "agent-streaming-batch",
      status: "streaming",
      initialItem,
      transientText: "Hello world",
      revision: 1,
    };
    const expectedBatchView = {
      type: "message" as const,
      id: "agent-streaming-batch",
      turnId: "turn-streaming-batch",
      role: "assistant" as const,
      rendering: { mode: "streamingMarkdown" as const, source: "Hello world" },
      revision: 1,
    };
    expect(store.getState().transcriptState.entriesById[entryId]).toStrictEqual(
      expectedBatchStoredEntry,
    );
    expect(selectTranscriptEntry(store.getState(), entryId)).toStrictEqual(expectedBatchView);
    expect(selectTranscriptChunk(store.getState(), "turn-streaming-batch:chunk:0")).toStrictEqual({
      id: "turn-streaming-batch:chunk:0",
      turnId: "turn-streaming-batch",
      revision: 2,
      entries: [expectedBatchView],
    });
    expect(selectTranscriptLiveScrollPulse(store.getState())).toBe(pulseAfterStarted + 1);
  });

  it("accepts a single agent message delta batch with one live update", () => {
    const store = makeStore();
    const initialItem = agentMessage("agent-streaming-single-batch", "", "commentary");

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemStarted(
          eventItemStarted,
          "commit-streaming-single-batch-started",
          "turn-streaming-single-batch",
          initialItem,
        ),
        replay: "live",
      }),
    );
    const pulseAfterStarted = selectTranscriptLiveScrollPulse(store.getState());

    store.dispatch(
      threadRuntimeDeltasAccepted({
        notifications: [
          agentMessageDelta(
            eventAgentMessageDelta,
            "turn-streaming-single-batch",
            "agent-streaming-single-batch",
            "Hello",
          ),
        ],
      }),
    );

    const entryId = transcriptEntryIdFor(
      "turn-streaming-single-batch",
      "agent-streaming-single-batch",
    );
    const expectedSingleBatchStoredEntry = {
      type: "live" as const,
      id: "agent-streaming-single-batch",
      key: entryId,
      turnId: "turn-streaming-single-batch",
      itemId: "agent-streaming-single-batch",
      status: "streaming",
      initialItem,
      transientText: "Hello",
      revision: 1,
    };
    const expectedSingleBatchView = {
      type: "message" as const,
      id: "agent-streaming-single-batch",
      turnId: "turn-streaming-single-batch",
      role: "assistant" as const,
      rendering: { mode: "streamingMarkdown" as const, source: "Hello" },
      revision: 1,
    };
    expect(store.getState().transcriptState.entriesById[entryId]).toStrictEqual(
      expectedSingleBatchStoredEntry,
    );
    expect(selectTranscriptEntry(store.getState(), entryId)).toStrictEqual(expectedSingleBatchView);
    expect(
      selectTranscriptChunk(store.getState(), "turn-streaming-single-batch:chunk:0"),
    ).toStrictEqual({
      id: "turn-streaming-single-batch:chunk:0",
      turnId: "turn-streaming-single-batch",
      revision: 2,
      entries: [expectedSingleBatchView],
    });
    expect(selectTranscriptLiveScrollPulse(store.getState())).toBe(pulseAfterStarted + 1);
  });

  it("keeps batch delta coalescing isolated per live item", () => {
    const store = makeStore();
    const firstItem = agentMessage("agent-streaming-batch-first", "", "commentary");
    const secondItem = agentMessage("agent-streaming-batch-second", "", "commentary");

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemStarted(
          eventItemStarted,
          "commit-streaming-batch-first-started",
          "turn-streaming-batch-isolated",
          firstItem,
        ),
        replay: "live",
      }),
    );
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemStarted(
          eventItemStarted,
          "commit-streaming-batch-second-started",
          "turn-streaming-batch-isolated",
          secondItem,
        ),
        replay: "live",
      }),
    );
    const pulseAfterStarted = selectTranscriptLiveScrollPulse(store.getState());

    store.dispatch(
      threadRuntimeDeltasAccepted({
        notifications: [
          agentMessageDelta(
            eventAgentMessageDelta,
            "turn-streaming-batch-isolated",
            "agent-streaming-batch-first",
            "First ",
          ),
          agentMessageDelta(
            eventAgentMessageDelta,
            "turn-streaming-batch-isolated",
            "agent-streaming-batch-second",
            "Second ",
          ),
          agentMessageDelta(
            eventAgentMessageDelta,
            "turn-streaming-batch-isolated",
            "agent-streaming-batch-first",
            "message",
          ),
          agentMessageDelta(
            eventAgentMessageDelta,
            "turn-streaming-batch-isolated",
            "agent-streaming-batch-second",
            "message",
          ),
        ],
      }),
    );

    const firstEntryId = transcriptEntryIdFor(
      "turn-streaming-batch-isolated",
      "agent-streaming-batch-first",
    );
    const secondEntryId = transcriptEntryIdFor(
      "turn-streaming-batch-isolated",
      "agent-streaming-batch-second",
    );
    const expectedFirstStoredEntry = {
      type: "live" as const,
      id: "agent-streaming-batch-first",
      key: firstEntryId,
      turnId: "turn-streaming-batch-isolated",
      itemId: "agent-streaming-batch-first",
      status: "streaming",
      initialItem: firstItem,
      transientText: "First message",
      revision: 1,
    };
    const expectedSecondStoredEntry = {
      type: "live" as const,
      id: "agent-streaming-batch-second",
      key: secondEntryId,
      turnId: "turn-streaming-batch-isolated",
      itemId: "agent-streaming-batch-second",
      status: "streaming",
      initialItem: secondItem,
      transientText: "Second message",
      revision: 1,
    };
    const expectedFirstView = {
      type: "message" as const,
      id: "agent-streaming-batch-first",
      turnId: "turn-streaming-batch-isolated",
      role: "assistant" as const,
      rendering: { mode: "streamingMarkdown" as const, source: "First message" },
      revision: 1,
    };
    const expectedSecondView = {
      type: "message" as const,
      id: "agent-streaming-batch-second",
      turnId: "turn-streaming-batch-isolated",
      role: "assistant" as const,
      rendering: { mode: "streamingMarkdown" as const, source: "Second message" },
      revision: 1,
    };
    expect(store.getState().transcriptState.entriesById[firstEntryId]).toStrictEqual(
      expectedFirstStoredEntry,
    );
    expect(store.getState().transcriptState.entriesById[secondEntryId]).toStrictEqual(
      expectedSecondStoredEntry,
    );
    expect(selectTranscriptEntry(store.getState(), firstEntryId)).toStrictEqual(expectedFirstView);
    expect(selectTranscriptEntry(store.getState(), secondEntryId)).toStrictEqual(
      expectedSecondView,
    );
    expect(
      selectTranscriptChunk(store.getState(), "turn-streaming-batch-isolated:chunk:0"),
    ).toStrictEqual({
      id: "turn-streaming-batch-isolated:chunk:0",
      turnId: "turn-streaming-batch-isolated",
      revision: 4,
      entries: [expectedFirstView, expectedSecondView],
    });
    expect(selectTranscriptLiveScrollPulse(store.getState())).toBe(pulseAfterStarted + 2);
  });

  it("ignores accepted agent message deltas when the middle live payload is missing", () => {
    const store = makeStore();

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
    const beforeState = store.getState().transcriptState;

    store.dispatch(
      threadRuntimeDeltasAccepted({
        notifications: [
          agentMessageDelta(eventAgentMessageDelta, "turn-missing", "agent-missing", "Ignored"),
        ],
      }),
    );

    const afterState = store.getState().transcriptState;
    expect(afterState.sessionRevision).toBeGreaterThan(beforeState.sessionRevision);
    expect({ ...afterState, sessionRevision: beforeState.sessionRevision }).toStrictEqual(
      beforeState,
    );
  });

  it("ignores accepted agent message delta batches when the middle live payload is missing", () => {
    const store = makeStore();

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
    const beforeState = store.getState().transcriptState;

    store.dispatch(
      threadRuntimeDeltasAccepted({
        notifications: [
          agentMessageDelta(
            eventAgentMessageDelta,
            "turn-missing-batch",
            "agent-missing-batch",
            "Ignored",
          ),
          agentMessageDelta(
            eventAgentMessageDelta,
            "turn-missing-batch",
            "agent-missing-batch",
            " text",
          ),
        ],
      }),
    );

    const afterState = store.getState().transcriptState;
    expect(afterState.sessionRevision).toBeGreaterThan(beforeState.sessionRevision);
    expect({ ...afterState, sessionRevision: beforeState.sessionRevision }).toStrictEqual(
      beforeState,
    );
  });

  it("ignores wrong-thread and unsupported delta notifications in accepted delta batches", () => {
    const store = makeStore();
    const initialItem = agentMessage("agent-streaming-filtered-batch", "", "commentary");

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemStarted(
          eventItemStarted,
          "commit-streaming-filtered-batch-started",
          "turn-streaming-filtered-batch",
          initialItem,
        ),
        replay: "live",
      }),
    );
    const pulseAfterStarted = selectTranscriptLiveScrollPulse(store.getState());

    store.dispatch(
      threadRuntimeDeltasAccepted({
        notifications: [
          {
            ...agentMessageDelta(
              eventAgentMessageDelta,
              "turn-streaming-filtered-batch",
              "agent-streaming-filtered-batch",
              "Wrong thread",
            ),
            threadId: "wrong-thread-id",
          },
          eventReasoningTextDelta,
          agentMessageDelta(
            eventAgentMessageDelta,
            "turn-streaming-filtered-batch",
            "agent-streaming-filtered-batch",
            "Visible text",
          ),
        ],
      }),
    );

    const entryId = transcriptEntryIdFor(
      "turn-streaming-filtered-batch",
      "agent-streaming-filtered-batch",
    );
    const expectedFilteredStoredEntry = {
      type: "live" as const,
      id: "agent-streaming-filtered-batch",
      key: entryId,
      turnId: "turn-streaming-filtered-batch",
      itemId: "agent-streaming-filtered-batch",
      status: "streaming",
      initialItem,
      transientText: "Visible text",
      revision: 1,
    };
    const expectedFilteredView = {
      type: "message" as const,
      id: "agent-streaming-filtered-batch",
      turnId: "turn-streaming-filtered-batch",
      role: "assistant" as const,
      rendering: { mode: "streamingMarkdown" as const, source: "Visible text" },
      revision: 1,
    };
    expect(store.getState().transcriptState.entriesById[entryId]).toStrictEqual(
      expectedFilteredStoredEntry,
    );
    expect(selectTranscriptEntry(store.getState(), entryId)).toStrictEqual(expectedFilteredView);
    expect(
      selectTranscriptChunk(store.getState(), "turn-streaming-filtered-batch:chunk:0"),
    ).toStrictEqual({
      id: "turn-streaming-filtered-batch:chunk:0",
      turnId: "turn-streaming-filtered-batch",
      revision: 2,
      entries: [expectedFilteredView],
    });
    expect(selectTranscriptLiveScrollPulse(store.getState())).toBe(pulseAfterStarted + 1);
  });
});
