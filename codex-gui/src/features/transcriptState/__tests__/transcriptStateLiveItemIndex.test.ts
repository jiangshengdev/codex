import { describe, expect, it } from "vitest";
import { makeStore } from "@/app/store";
import {
  attachBaseline,
  eventItemStarted,
} from "@/features/projection/__tests__/projectionFixtures";
import {
  agentMessage,
  attachWithTurns,
  itemStarted,
} from "@/features/projection/__tests__/projectionTestBuilders";
import {
  threadRuntimeAttached,
  threadRuntimeEventBuffered,
} from "@/features/threadRuntime/threadRuntimeSlice";
import {
  selectTranscriptLiveItem,
  selectTranscriptLiveItemsForTurn,
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
});
