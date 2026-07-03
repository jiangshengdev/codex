import { describe, expect, it } from "vitest";
import { makeStore } from "@/app/store";
import {
  attachBaseline,
  attachReplacement,
  eventItemCompleted,
  eventItemStarted,
} from "@/features/projection/__tests__/projectionFixtures";
import {
  threadRuntimeAttached,
  threadRuntimeEventBuffered,
} from "@/features/threadRuntime/threadRuntimeSlice";
import { selectTranscriptChunk, selectTranscriptLiveItemsForTurn } from "../transcriptStateSlice";
import {
  agentMessage,
  attachWithTurns,
  baseTurn,
  itemCompleted,
  itemStarted,
} from "@/features/projection/__tests__/projectionTestBuilders";

describe("transcript state selector cache", () => {
  it("returns a stable transcript chunk view while the chunk is unchanged", () => {
    const store = makeStore();

    store.dispatch(
      threadRuntimeAttached(
        attachWithTurns(attachBaseline, [
          baseTurn("turn-cached", [agentMessage("agent-cached", "Cached answer", "commentary")]),
        ]),
      ),
    );

    const firstChunk = selectTranscriptChunk(store.getState(), "turn-cached:chunk:0");

    expect(firstChunk).not.toBeNull();
    expect(selectTranscriptChunk(store.getState(), "turn-cached:chunk:0")).toBe(firstChunk);

    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemStarted(
          eventItemStarted,
          "commit-other-started",
          "turn-other",
          agentMessage("agent-other-started", "Started should not affect cached chunk"),
        ),
        replay: "live",
      }),
    );

    expect(selectTranscriptChunk(store.getState(), "turn-cached:chunk:0")).toBe(firstChunk);

    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemCompleted(
          eventItemCompleted,
          "commit-other-completed",
          "turn-other",
          agentMessage("agent-other-completed", "Other turn answer"),
        ),
        replay: "live",
      }),
    );

    expect(selectTranscriptChunk(store.getState(), "turn-cached:chunk:0")).toBe(firstChunk);
  });

  it("returns a new transcript chunk view when that chunk changes", () => {
    const store = makeStore();

    store.dispatch(
      threadRuntimeAttached(
        attachWithTurns(attachBaseline, [
          baseTurn("turn-cached", [agentMessage("agent-cached", "Cached answer", "commentary")]),
        ]),
      ),
    );

    const beforeUpdateChunk = selectTranscriptChunk(store.getState(), "turn-cached:chunk:0");

    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemCompleted(
          eventItemCompleted,
          "commit-cached-append",
          "turn-cached",
          agentMessage("agent-cached-live", "Live answer", "commentary"),
        ),
        replay: "live",
      }),
    );

    const afterUpdateChunk = selectTranscriptChunk(store.getState(), "turn-cached:chunk:0");

    expect(afterUpdateChunk).not.toBe(beforeUpdateChunk);
    expect(afterUpdateChunk).toStrictEqual({
      id: "turn-cached:chunk:0",
      turnId: "turn-cached",
      revision: (beforeUpdateChunk?.revision ?? 0) + 1,
      entries: [
        {
          type: "message",
          id: "agent-cached",
          turnId: "turn-cached",
          role: "assistant",
          source: "Cached answer",
          sourceKind: "markdown",
          phase: "commentary",
          revision: 0,
        },
        {
          type: "message",
          id: "agent-cached-live",
          turnId: "turn-cached",
          role: "assistant",
          source: "Live answer",
          sourceKind: "markdown",
          phase: "commentary",
          revision: 0,
        },
      ],
    });
  });

  it("does not reuse transcript chunk views across snapshot reattach", () => {
    const store = makeStore();

    store.dispatch(
      threadRuntimeAttached(
        attachWithTurns(attachBaseline, [
          baseTurn("turn-reattach", [
            agentMessage("agent-reattach", "Before reconnect", "commentary"),
          ]),
        ]),
      ),
    );

    const beforeReattachChunk = selectTranscriptChunk(store.getState(), "turn-reattach:chunk:0");

    store.dispatch(
      threadRuntimeAttached(
        attachWithTurns(attachReplacement, [
          baseTurn("turn-reattach", [
            agentMessage("agent-reattach", "After reconnect", "commentary"),
          ]),
        ]),
      ),
    );

    const afterReattachChunk = selectTranscriptChunk(store.getState(), "turn-reattach:chunk:0");

    expect(afterReattachChunk).not.toBe(beforeReattachChunk);
    expect(afterReattachChunk).toStrictEqual({
      id: "turn-reattach:chunk:0",
      turnId: "turn-reattach",
      revision: 0,
      entries: [
        {
          type: "message",
          id: "agent-reattach",
          turnId: "turn-reattach",
          role: "assistant",
          source: "After reconnect",
          sourceKind: "markdown",
          phase: "commentary",
          revision: 0,
        },
      ],
    });
  });

  it("returns a stable live item view while the live turn is unchanged", () => {
    const store = makeStore();

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemStarted(
          eventItemStarted,
          "commit-live-cache-started",
          "turn-live-cache",
          agentMessage("agent-live-cache", "Live cache"),
        ),
        replay: "live",
      }),
    );

    const firstLiveItems = selectTranscriptLiveItemsForTurn(store.getState(), "turn-live-cache");
    expect(firstLiveItems).toHaveLength(1);
    expect(selectTranscriptLiveItemsForTurn(store.getState(), "turn-live-cache")).toBe(
      firstLiveItems,
    );

    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemCompleted(
          eventItemCompleted,
          "commit-unrelated-committed",
          "turn-unrelated-committed",
          agentMessage("agent-unrelated-committed", "Unrelated committed"),
        ),
        replay: "live",
      }),
    );

    expect(selectTranscriptLiveItemsForTurn(store.getState(), "turn-live-cache")).toBe(
      firstLiveItems,
    );
  });

  it("returns a new live item view when the live turn order changes", () => {
    const store = makeStore();

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemStarted(
          eventItemStarted,
          "commit-live-cache-first",
          "turn-live-cache-update",
          agentMessage("agent-live-cache-first", "First"),
        ),
        replay: "live",
      }),
    );
    const beforeUpdate = selectTranscriptLiveItemsForTurn(
      store.getState(),
      "turn-live-cache-update",
    );

    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemStarted(
          eventItemStarted,
          "commit-live-cache-second",
          "turn-live-cache-update",
          agentMessage("agent-live-cache-second", "Second"),
        ),
        replay: "live",
      }),
    );

    const afterUpdate = selectTranscriptLiveItemsForTurn(
      store.getState(),
      "turn-live-cache-update",
    );
    expect(afterUpdate).not.toBe(beforeUpdate);
    expect(afterUpdate.map((item) => item.itemId)).toStrictEqual([
      "agent-live-cache-first",
      "agent-live-cache-second",
    ]);
  });
});
