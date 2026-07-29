import { describe, expect, it } from "vitest";
import { makeStore } from "@/app/store";
import {
  attachBaseline,
  eventAgentMessageDelta,
  eventItemCompleted,
  eventItemStarted,
} from "@/features/projection/__tests__/projectionFixtures";
import {
  agentMessage,
  agentMessageDelta,
  attachWithTurns,
  itemCompleted,
  itemStarted,
} from "@/features/projection/__tests__/projectionTestBuilders";
import {
  threadRuntimeAttached,
  threadRuntimeDeltasAccepted,
  threadRuntimeEventBuffered,
} from "@/features/threadRuntime/threadRuntimeSlice";
import {
  selectCommittedTranscriptScrollCommitKey,
  selectTranscriptEntry,
  selectTranscriptLiveItem,
  selectTranscriptLiveItemsForTurn,
} from "../transcriptStateSlice";

describe("transcript state live item lifecycle reducer", () => {
  it("keeps itemStarted slot order stable and ignores duplicate live slot insertion", () => {
    const store = makeStore();

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
    const firstItem = agentMessage("agent-slot-first", "First");
    const secondItem = agentMessage("agent-slot-second", "Second");

    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemStarted(
          eventItemStarted,
          "commit-slot-first",
          "turn-slot-order",
          firstItem,
        ),
        replay: "live",
      }),
    );
    const beforeDuplicateState = store.getState().transcriptState;

    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemStarted(
          eventItemStarted,
          "commit-slot-first-duplicate-id",
          "turn-slot-order",
          agentMessage("agent-slot-first", "Updated initial"),
        ),
        replay: "live",
      }),
    );

    expect(store.getState().transcriptState).toBe(beforeDuplicateState);

    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemStarted(
          eventItemStarted,
          "commit-slot-second",
          "turn-slot-order",
          secondItem,
        ),
        replay: "live",
      }),
    );

    expect(
      selectTranscriptLiveItemsForTurn(store.getState(), "turn-slot-order").map(
        (item) => item.itemId,
      ),
    ).toStrictEqual(["agent-slot-first", "agent-slot-second"]);
    expect(
      selectTranscriptLiveItem(store.getState(), "turn-slot-order", "agent-slot-first"),
    ).toStrictEqual({
      key: "turn-slot-order:agent-slot-first",
      turnId: "turn-slot-order",
      itemId: "agent-slot-first",
      status: "started",
      initialItem: firstItem,
      transientText: "",
      revision: 0,
    });
  });

  it("removes the live item after committing the completed agent message", () => {
    const store = makeStore();

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
    const initialItem = agentMessage("agent-settled", "");
    const completedItem = agentMessage("agent-settled", "Completed answer", "final_answer");

    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemStarted(
          eventItemStarted,
          "commit-settled-started",
          "turn-settled",
          initialItem,
        ),
        replay: "live",
      }),
    );
    store.dispatch(
      threadRuntimeDeltasAccepted({
        notifications: [
          agentMessageDelta(eventAgentMessageDelta, "turn-settled", "agent-settled", "Partial"),
        ],
      }),
    );
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemCompleted(
          eventItemCompleted,
          "commit-settled-completed",
          "turn-settled",
          completedItem,
        ),
        replay: "live",
      }),
    );

    expect(selectTranscriptLiveItem(store.getState(), "turn-settled", "agent-settled")).toBeNull();
    expect(selectTranscriptLiveItemsForTurn(store.getState(), "turn-settled")).toStrictEqual([]);
    expect(selectTranscriptEntry(store.getState(), "agent-settled")).toStrictEqual({
      type: "message",
      id: "agent-settled",
      turnId: "turn-settled",
      role: "assistant",
      source: "Completed answer",
      sourceKind: "markdown",
      phase: "final_answer",
      revision: 0,
    });
  });

  it("keeps the later live item addressable after removing an earlier live item", () => {
    const store = makeStore();

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
    const firstItem = agentMessage("agent-remove-first", "");
    const secondItem = agentMessage("agent-remove-second", "Still live");
    const completedFirstItem = agentMessage("agent-remove-first", "Completed first");

    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemStarted(
          eventItemStarted,
          "commit-remove-first-started",
          "turn-remove-first",
          firstItem,
        ),
        replay: "live",
      }),
    );
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemStarted(
          eventItemStarted,
          "commit-remove-second-started",
          "turn-remove-first",
          secondItem,
        ),
        replay: "live",
      }),
    );
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemCompleted(
          eventItemCompleted,
          "commit-remove-first-completed",
          "turn-remove-first",
          completedFirstItem,
        ),
        replay: "live",
      }),
    );

    expect(
      selectTranscriptLiveItem(store.getState(), "turn-remove-first", "agent-remove-first"),
    ).toBeNull();
    expect(
      selectTranscriptLiveItem(store.getState(), "turn-remove-first", "agent-remove-second"),
    ).toStrictEqual({
      key: "turn-remove-first:agent-remove-second",
      turnId: "turn-remove-first",
      itemId: "agent-remove-second",
      status: "started",
      initialItem: secondItem,
      transientText: "",
      revision: 0,
    });
    expect(selectTranscriptLiveItemsForTurn(store.getState(), "turn-remove-first")).toStrictEqual([
      {
        key: "turn-remove-first:agent-remove-second",
        turnId: "turn-remove-first",
        itemId: "agent-remove-second",
        status: "started",
        initialItem: secondItem,
        transientText: "",
        revision: 0,
      },
    ]);
  });

  it("does not create a live slot when itemCompleted arrives without itemStarted", () => {
    const store = makeStore();

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemCompleted(
          eventItemCompleted,
          "commit-missing-slot-completed",
          "turn-missing-slot-completed",
          agentMessage("agent-missing-slot-completed", "Committed without live slot"),
        ),
        replay: "live",
      }),
    );

    expect(
      selectTranscriptLiveItemsForTurn(store.getState(), "turn-missing-slot-completed"),
    ).toStrictEqual([]);
    expect(selectTranscriptEntry(store.getState(), "agent-missing-slot-completed")).toStrictEqual({
      type: "message",
      id: "agent-missing-slot-completed",
      turnId: "turn-missing-slot-completed",
      role: "assistant",
      source: "Committed without live slot",
      sourceKind: "markdown",
      phase: "final_answer",
      revision: 0,
    });
  });

  it("removes the live item after an empty completed agent message without committing an entry", () => {
    const store = makeStore();

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
    const initialItem = agentMessage("agent-empty-settled", "");
    const completedItem = agentMessage("agent-empty-settled", "");
    const attachKey = selectCommittedTranscriptScrollCommitKey(store.getState());

    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemStarted(
          eventItemStarted,
          "commit-empty-settled-started",
          "turn-empty-settled",
          initialItem,
        ),
        replay: "live",
      }),
    );
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemCompleted(
          eventItemCompleted,
          "commit-empty-settled-completed",
          "turn-empty-settled",
          completedItem,
        ),
        replay: "live",
      }),
    );

    expect(
      selectTranscriptLiveItem(store.getState(), "turn-empty-settled", "agent-empty-settled"),
    ).toBeNull();
    expect(selectTranscriptLiveItemsForTurn(store.getState(), "turn-empty-settled")).toStrictEqual(
      [],
    );
    expect(selectTranscriptEntry(store.getState(), "agent-empty-settled")).toBeNull();
    expect(selectCommittedTranscriptScrollCommitKey(store.getState())).toBe(attachKey);
  });
});
