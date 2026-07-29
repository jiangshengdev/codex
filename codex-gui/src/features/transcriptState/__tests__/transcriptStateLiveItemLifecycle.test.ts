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
  selectTranscriptChunk,
  selectTranscriptEntry,
  selectTranscriptLiveItem,
  selectTranscriptLiveItemsForTurn,
  selectTranscriptMiddlePresentation,
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

  it("keeps message identity order stable when later live commentary commits first", () => {
    const store = makeStore();

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
    const turnId = "turn-commentary-settlement-order";
    const firstItemId = "agent-commentary-first";
    const secondItemId = "agent-commentary-second";

    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemStarted(
          eventItemStarted,
          "commit-commentary-first-started",
          turnId,
          agentMessage(firstItemId, "Live first", "commentary"),
        ),
        replay: "live",
      }),
    );
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemStarted(
          eventItemStarted,
          "commit-commentary-second-started",
          turnId,
          agentMessage(secondItemId, "Live second", "commentary"),
        ),
        replay: "live",
      }),
    );

    const startedState = store.getState().transcriptState;
    const middleChunkId = `${turnId}:chunk:0`;
    expect(startedState.turnsById[turnId].middleChunkIds).toStrictEqual([middleChunkId]);
    expect(startedState.chunksById[middleChunkId]?.entryIds).toStrictEqual([
      firstItemId,
      secondItemId,
    ]);
    expect(startedState.turnsById[turnId].middleEntryCount).toBe(2);

    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemCompleted(
          eventItemCompleted,
          "commit-commentary-second-completed",
          turnId,
          agentMessage(secondItemId, "Completed second", "commentary"),
        ),
        replay: "live",
      }),
    );

    const secondCompletedState = store.getState().transcriptState;
    expect(secondCompletedState.chunksById[middleChunkId]?.entryIds).toStrictEqual([
      firstItemId,
      secondItemId,
    ]);
    expect(secondCompletedState.turnsById[turnId].middleEntryCount).toBe(2);

    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemCompleted(
          eventItemCompleted,
          "commit-commentary-first-completed",
          turnId,
          agentMessage(firstItemId, "Completed first", "commentary"),
        ),
        replay: "live",
      }),
    );

    const completedState = store.getState().transcriptState;
    expect(completedState.chunksById[middleChunkId]?.entryIds).toStrictEqual([
      firstItemId,
      secondItemId,
    ]);
    expect(completedState.turnsById[turnId].middleEntryCount).toBe(2);
  });

  it("keeps identity order stable across unknown delta, phase migration, and late started", () => {
    const store = makeStore();
    const turnId = "turn-phase-lifecycle";
    const itemId = "agent-phase-lifecycle";

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
    store.dispatch(
      threadRuntimeDeltasAccepted({
        notifications: [
          agentMessageDelta(eventAgentMessageDelta, turnId, itemId, "Unknown delta"),
        ],
      }),
    );

    expect(store.getState().transcriptState.turnsById[turnId]).toBeUndefined();
    expect(selectTranscriptChunk(store.getState(), `${turnId}:chunk:0`)).toBeNull();
    expect(selectTranscriptMiddlePresentation(store.getState(), turnId, itemId)).toBeNull();

    const startedItem = agentMessage(itemId, "Initial commentary", "commentary");
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemStarted(
          eventItemStarted,
          "commit-phase-lifecycle-started",
          turnId,
          startedItem,
        ),
        replay: "live",
      }),
    );

    const startedChunk = selectTranscriptChunk(store.getState(), `${turnId}:chunk:0`);
    const startedChunkRevision = startedChunk?.revision;
    expect(startedChunk?.entryIds).toStrictEqual([itemId]);
    expect(store.getState().transcriptState.turnsById[turnId].middleEntryCount).toBe(1);

    store.dispatch(
      threadRuntimeDeltasAccepted({
        notifications: [
          agentMessageDelta(eventAgentMessageDelta, turnId, itemId, " plus streamed text"),
        ],
      }),
    );

    expect(selectTranscriptChunk(store.getState(), `${turnId}:chunk:0`)).toBe(startedChunk);
    expect(selectTranscriptChunk(store.getState(), `${turnId}:chunk:0`)?.revision).toBe(
      startedChunkRevision,
    );
    expect(selectTranscriptMiddlePresentation(store.getState(), turnId, itemId)).toStrictEqual({
      kind: "live",
      item: {
        key: `${turnId}:${itemId}`,
        turnId,
        itemId,
        status: "streaming",
        initialItem: startedItem,
        transientText: " plus streamed text",
        revision: 1,
      },
    });

    const completedItem = agentMessage(itemId, "Authoritative final", "final_answer");
    const completedNotification = itemCompleted(
      eventItemCompleted,
      "commit-phase-lifecycle-completed",
      turnId,
      completedItem,
    );
    store.dispatch(
      threadRuntimeEventBuffered({ notification: completedNotification, replay: "live" }),
    );

    expect(selectTranscriptChunk(store.getState(), `${turnId}:chunk:0`)).toBe(startedChunk);
    expect(selectTranscriptChunk(store.getState(), `${turnId}:chunk:0`)?.entryIds).toStrictEqual([
      itemId,
    ]);
    expect(selectTranscriptChunk(store.getState(), `${turnId}:chunk:0`)?.revision).toBe(
      startedChunkRevision,
    );
    expect(store.getState().transcriptState.turnsById[turnId].middleEntryCount).toBe(0);
    expect(selectTranscriptMiddlePresentation(store.getState(), turnId, itemId)).toBeNull();

    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemStarted(
          eventItemStarted,
          "commit-phase-lifecycle-late-started",
          turnId,
          agentMessage(itemId, "Late commentary", "commentary"),
        ),
        replay: "live",
      }),
    );
    store.dispatch(
      threadRuntimeEventBuffered({ notification: completedNotification, replay: "live" }),
    );

    expect(selectTranscriptLiveItem(store.getState(), turnId, itemId)).toBeNull();
    expect(selectTranscriptEntry(store.getState(), itemId)).toStrictEqual({
      type: "message",
      id: itemId,
      turnId,
      role: "assistant",
      source: "Authoritative final",
      sourceKind: "markdown",
      phase: "final_answer",
      revision: 0,
    });
    expect(selectTranscriptMiddlePresentation(store.getState(), turnId, itemId)).toBeNull();
    expect(selectTranscriptChunk(store.getState(), `${turnId}:chunk:0`)).toBe(startedChunk);
    expect(store.getState().transcriptState.turnsById[turnId].middleEntryCount).toBe(0);
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
