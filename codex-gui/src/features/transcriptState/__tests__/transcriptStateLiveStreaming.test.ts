import { describe, expect, it } from "vitest";
import { makeStore } from "@/app/store";
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
  threadRuntimeAttached,
  threadRuntimeDeltaAccepted,
  threadRuntimeDeltasAccepted,
  threadRuntimeEventBuffered,
} from "@/features/threadRuntime/threadRuntimeSlice";
import {
  selectCommittedTranscriptScrollCommitKey,
  selectTranscriptChunk,
  selectTranscriptEntry,
  selectTranscriptLiveItem,
  selectTranscriptLiveItemsForTurn,
  selectTranscriptLiveScrollPulse,
} from "../transcriptStateSlice";

describe("transcript state live streaming reducer", () => {
  it("creates a started live slot from itemStarted without committing transcript entries", () => {
    const store = makeStore();

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
    const attachKey = selectCommittedTranscriptScrollCommitKey(store.getState());

    const initialItem = agentMessage("agent-live-started", "Initial text should stay live only");
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

    expect(
      selectTranscriptLiveItemsForTurn(store.getState(), "turn-live-started-slot"),
    ).toStrictEqual([
      {
        key: "turn-live-started-slot:agent-live-started",
        turnId: "turn-live-started-slot",
        itemId: "agent-live-started",
        status: "started",
        initialItem,
        transientText: "",
        revision: 0,
      },
    ]);
    expect(selectTranscriptEntry(store.getState(), "agent-live-started")).toBeNull();
    expect(selectTranscriptChunk(store.getState(), "turn-live-started-slot:chunk:0")).toBeNull();
    expect(selectCommittedTranscriptScrollCommitKey(store.getState())).toBe(attachKey);
  });

  it("appends accepted agent message deltas into an existing live slot", () => {
    const store = makeStore();

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
    const attachKey = selectCommittedTranscriptScrollCommitKey(store.getState());

    const initialItem = agentMessage("agent-streaming", "");
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
    store.dispatch(
      threadRuntimeDeltaAccepted({
        notification: agentMessageDelta(
          eventAgentMessageDelta,
          "turn-streaming",
          "agent-streaming",
          "Hello",
        ),
      }),
    );
    store.dispatch(
      threadRuntimeDeltaAccepted({
        notification: agentMessageDelta(
          eventAgentMessageDelta,
          "turn-streaming",
          "agent-streaming",
          " world",
        ),
      }),
    );

    expect(
      selectTranscriptLiveItem(store.getState(), "turn-streaming", "agent-streaming"),
    ).toStrictEqual({
      key: "turn-streaming:agent-streaming",
      turnId: "turn-streaming",
      itemId: "agent-streaming",
      status: "streaming",
      initialItem,
      transientText: "Hello world",
      revision: 2,
    });
    expect(selectTranscriptEntry(store.getState(), "agent-streaming")).toBeNull();
    expect(selectTranscriptChunk(store.getState(), "turn-streaming:chunk:0")).toBeNull();
    expect(selectCommittedTranscriptScrollCommitKey(store.getState())).toBe(attachKey);
  });

  it("coalesces accepted agent message delta batches per live item in notification order", () => {
    const store = makeStore();
    const initialItem = agentMessage("agent-streaming-batch", "");
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

    expect(
      selectTranscriptLiveItem(store.getState(), "turn-streaming-batch", "agent-streaming-batch"),
    ).toStrictEqual({
      key: "turn-streaming-batch:agent-streaming-batch",
      turnId: "turn-streaming-batch",
      itemId: "agent-streaming-batch",
      status: "streaming",
      initialItem,
      transientText: "Hello world",
      revision: 1,
    });
    expect(selectTranscriptLiveScrollPulse(store.getState())).toBe(pulseAfterStarted + 1);
  });

  it("keeps batch delta coalescing isolated per live item", () => {
    const store = makeStore();
    const firstItem = agentMessage("agent-streaming-batch-first", "");
    const secondItem = agentMessage("agent-streaming-batch-second", "");

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

    expect(
      selectTranscriptLiveItem(
        store.getState(),
        "turn-streaming-batch-isolated",
        "agent-streaming-batch-first",
      ),
    ).toStrictEqual({
      key: "turn-streaming-batch-isolated:agent-streaming-batch-first",
      turnId: "turn-streaming-batch-isolated",
      itemId: "agent-streaming-batch-first",
      status: "streaming",
      initialItem: firstItem,
      transientText: "First message",
      revision: 1,
    });
    expect(
      selectTranscriptLiveItem(
        store.getState(),
        "turn-streaming-batch-isolated",
        "agent-streaming-batch-second",
      ),
    ).toStrictEqual({
      key: "turn-streaming-batch-isolated:agent-streaming-batch-second",
      turnId: "turn-streaming-batch-isolated",
      itemId: "agent-streaming-batch-second",
      status: "streaming",
      initialItem: secondItem,
      transientText: "Second message",
      revision: 1,
    });
    expect(selectTranscriptLiveScrollPulse(store.getState())).toBe(pulseAfterStarted + 2);
  });

  it("ignores accepted agent message deltas when the live slot is missing", () => {
    const store = makeStore();

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
    const beforeState = store.getState().transcriptState;

    store.dispatch(
      threadRuntimeDeltaAccepted({
        notification: agentMessageDelta(
          eventAgentMessageDelta,
          "turn-missing",
          "agent-missing",
          "Ignored",
        ),
      }),
    );

    expect(store.getState().transcriptState).toBe(beforeState);
    expect(selectTranscriptLiveItemsForTurn(store.getState(), "turn-missing")).toStrictEqual([]);
  });

  it("ignores wrong-thread and unsupported delta notifications in accepted delta batches", () => {
    const store = makeStore();
    const initialItem = agentMessage("agent-streaming-filtered-batch", "");

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

    expect(
      selectTranscriptLiveItem(
        store.getState(),
        "turn-streaming-filtered-batch",
        "agent-streaming-filtered-batch",
      ),
    ).toStrictEqual({
      key: "turn-streaming-filtered-batch:agent-streaming-filtered-batch",
      turnId: "turn-streaming-filtered-batch",
      itemId: "agent-streaming-filtered-batch",
      status: "streaming",
      initialItem,
      transientText: "Visible text",
      revision: 1,
    });
    expect(selectTranscriptLiveScrollPulse(store.getState())).toBe(pulseAfterStarted + 1);
  });
});
