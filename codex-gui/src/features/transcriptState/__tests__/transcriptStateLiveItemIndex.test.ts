import { describe, expect, it } from "vitest";
import { makeStore } from "@/app/store";
import {
  attachBaseline,
  eventItemCompleted,
  eventItemStarted,
} from "@/features/projection/__tests__/projectionFixtures";
import {
  agentMessage,
  attachWithTurns,
  itemCompleted,
  itemStarted,
} from "@/features/projection/__tests__/projectionTestBuilders";
import {
  threadRuntimeAttached,
  threadRuntimeEventBuffered,
} from "@/features/threadRuntime/threadRuntimeSlice";
import {
  selectCommittedTranscriptScrollCommitKey,
  selectTranscriptLiveItem,
  selectTranscriptLiveItemsForTurn,
  selectTranscriptLiveScrollPulse,
  transcriptStateSlice,
} from "../transcriptStateSlice";

describe("transcript state live item index", () => {
  it("returns null when a stale live item index points at a different key", () => {
    const store = makeStore();

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
    const firstItem = agentMessage("agent-stale-index-first", "First");
    const secondItem = agentMessage("agent-stale-index-second", "Second");

    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemStarted(
          eventItemStarted,
          "commit-stale-index-first",
          "turn-stale-index",
          firstItem,
        ),
        replay: "live",
      }),
    );
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemStarted(
          eventItemStarted,
          "commit-stale-index-second",
          "turn-stale-index",
          secondItem,
        ),
        replay: "live",
      }),
    );

    const state = store.getState();
    const nextState: ReturnType<typeof store.getState> = {
      ...state,
      transcriptState: {
        ...state.transcriptState,
        liveItemIndexByKey: {
          ...state.transcriptState.liveItemIndexByKey,
          "turn-stale-index:agent-stale-index-first": {
            turnId: "turn-stale-index",
            index: 1,
          },
        },
      },
    };

    expect(
      selectTranscriptLiveItem(nextState, "turn-stale-index", "agent-stale-index-first"),
    ).toBeNull();
  });

  it("returns the store-owned live item array when live item state changes", () => {
    const store = makeStore();

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
    const initialItem = agentMessage("agent-cache-slot", "Initial");
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemStarted(
          eventItemStarted,
          "commit-cache-slot",
          "turn-cache-slot",
          initialItem,
        ),
        replay: "live",
      }),
    );

    const cachedView = selectTranscriptLiveItemsForTurn(store.getState(), "turn-cache-slot");
    const state = store.getState();
    const liveItems = state.transcriptState.liveItemsByTurnId["turn-cache-slot"];
    expect(liveItems).toBeDefined();
    if (liveItems == null) {
      throw new Error("expected live item array to exist");
    }
    const liveItem = liveItems[0];
    expect(liveItem).toBeDefined();
    if (liveItem == null) {
      throw new Error("expected live item to exist");
    }

    const nextState: ReturnType<typeof store.getState> = {
      ...state,
      transcriptState: {
        ...state.transcriptState,
        liveItemsByTurnId: {
          ...state.transcriptState.liveItemsByTurnId,
          "turn-cache-slot": [
            {
              ...liveItem,
              status: "streaming",
              transientText: "Streamed text",
              revision: liveItem.revision + 1,
            },
          ],
        },
      },
    };

    const nextView = selectTranscriptLiveItemsForTurn(nextState, "turn-cache-slot");
    expect(nextView).not.toBe(cachedView);
    expect(nextView).toStrictEqual([
      {
        key: "turn-cache-slot:agent-cache-slot",
        turnId: "turn-cache-slot",
        itemId: "agent-cache-slot",
        status: "streaming",
        initialItem,
        transientText: "Streamed text",
        revision: 1,
      },
    ]);
  });

  it("does not remove another live item or bump the pulse when a live item index is stale", () => {
    const store = makeStore();

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
    const firstItem = agentMessage("agent-stale-removal-first", "");
    const secondItem = agentMessage("agent-stale-removal-second", "");
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemStarted(
          eventItemStarted,
          "commit-stale-removal-first-started",
          "turn-stale-removal",
          firstItem,
        ),
        replay: "live",
      }),
    );
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemStarted(
          eventItemStarted,
          "commit-stale-removal-second-started",
          "turn-stale-removal",
          secondItem,
        ),
        replay: "live",
      }),
    );

    const state = store.getState();
    const staleTranscriptState = {
      ...state.transcriptState,
      liveItemIndexByKey: {
        ...state.transcriptState.liveItemIndexByKey,
        "turn-stale-removal:agent-stale-removal-first": {
          turnId: "turn-stale-removal",
          index: 1,
        },
      },
    };
    const pulseBeforeStaleCompletion = selectTranscriptLiveScrollPulse({
      ...state,
      transcriptState: staleTranscriptState,
    });

    const nextTranscriptState = transcriptStateSlice.reducer(
      staleTranscriptState,
      threadRuntimeEventBuffered({
        notification: itemCompleted(
          eventItemCompleted,
          "commit-stale-removal-first-completed",
          "turn-stale-removal",
          agentMessage("agent-stale-removal-first", "Completed first despite stale index"),
        ),
        replay: "live",
      }),
    );
    const nextState = {
      ...state,
      transcriptState: nextTranscriptState,
    };

    expect(
      selectTranscriptLiveItem(nextState, "turn-stale-removal", "agent-stale-removal-first"),
    ).toBeNull();
    expect(
      selectTranscriptLiveItem(nextState, "turn-stale-removal", "agent-stale-removal-second"),
    ).toStrictEqual({
      key: "turn-stale-removal:agent-stale-removal-second",
      turnId: "turn-stale-removal",
      itemId: "agent-stale-removal-second",
      status: "started",
      initialItem: secondItem,
      transientText: "",
      revision: 0,
    });
    expect(selectTranscriptLiveScrollPulse(nextState)).toBe(pulseBeforeStaleCompletion);
    expect(selectCommittedTranscriptScrollCommitKey(nextState)).toBe(
      "event:commit-stale-removal-first-completed",
    );
  });
});
