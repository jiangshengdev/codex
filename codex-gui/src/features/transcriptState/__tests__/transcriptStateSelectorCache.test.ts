import { describe, expect, it } from "vitest";
import { makeStore } from "@/app/store";
import {
  attachBaseline,
  attachReplacement,
  eventAgentMessageDelta,
  eventItemCompleted,
  eventItemStarted,
} from "@/features/projection/__tests__/projectionFixtures";
import {
  threadRuntimeAttached,
  threadRuntimeDeltasAccepted,
  threadRuntimeEventBuffered,
} from "@/features/threadRuntime/threadRuntimeSlice";
import {
  selectTranscriptChunk,
  selectTranscriptLiveItemsForTurn,
  selectTranscriptMiddlePresentation,
} from "../transcriptStateSlice";
import {
  agentMessageDelta,
  agentMessage,
  attachWithTurns,
  baseTurn,
  itemCompleted,
  itemStarted,
} from "@/features/projection/__tests__/projectionTestBuilders";

describe("transcript state selector cache", () => {
  it("returns a stable transcript order chunk while the chunk is unchanged", () => {
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

  it("returns a new transcript order chunk when a message identity is appended", () => {
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
      entryIds: ["agent-cached", "agent-cached-live"],
    });
  });

  it("does not reuse transcript order chunks across snapshot reattach", () => {
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
      entryIds: ["agent-reattach"],
    });
  });

  it("returns the store-owned live item array while that turn is unchanged", () => {
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

  it("returns a new store-owned live item array when the live turn changes", () => {
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

  it("keeps order chunks stable while only the target live presentation receives a delta", () => {
    const store = makeStore();

    store.dispatch(
      threadRuntimeAttached(
        attachWithTurns(attachBaseline, [
          baseTurn("turn-delta-unrelated", [
            agentMessage("agent-delta-unrelated", "Unrelated", "commentary"),
          ]),
        ]),
      ),
    );
    const initialItem = agentMessage("agent-live-cache-delta", "", "commentary");
    const siblingItem = agentMessage("agent-live-cache-sibling", "Sibling", "commentary");

    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemStarted(
          eventItemStarted,
          "commit-live-cache-delta-started",
          "turn-live-cache-delta",
          initialItem,
        ),
        replay: "live",
      }),
    );
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemStarted(
          eventItemStarted,
          "commit-live-cache-sibling-started",
          "turn-live-cache-delta",
          siblingItem,
        ),
        replay: "live",
      }),
    );

    const beforeTargetChunk = selectTranscriptChunk(
      store.getState(),
      "turn-live-cache-delta:chunk:0",
    );
    const beforeUnrelatedChunk = selectTranscriptChunk(
      store.getState(),
      "turn-delta-unrelated:chunk:0",
    );
    const beforeTargetRevision = beforeTargetChunk?.revision;
    const beforeSiblingPresentation = selectTranscriptMiddlePresentation(
      store.getState(),
      "turn-live-cache-delta",
      "agent-live-cache-sibling",
    );

    store.dispatch(
      threadRuntimeDeltasAccepted({
        notifications: [
          agentMessageDelta(
            eventAgentMessageDelta,
            "turn-live-cache-delta",
            "agent-live-cache-delta",
            "Streamed text",
          ),
        ],
      }),
    );

    expect(selectTranscriptChunk(store.getState(), "turn-live-cache-delta:chunk:0")).toBe(
      beforeTargetChunk,
    );
    expect(selectTranscriptChunk(store.getState(), "turn-live-cache-delta:chunk:0")?.revision).toBe(
      beforeTargetRevision,
    );
    expect(selectTranscriptChunk(store.getState(), "turn-delta-unrelated:chunk:0")).toBe(
      beforeUnrelatedChunk,
    );
    expect(
      selectTranscriptMiddlePresentation(
        store.getState(),
        "turn-live-cache-delta",
        "agent-live-cache-delta",
      ),
    ).toStrictEqual({
      kind: "live",
      item: {
        key: "turn-live-cache-delta:agent-live-cache-delta",
        turnId: "turn-live-cache-delta",
        itemId: "agent-live-cache-delta",
        status: "streaming",
        initialItem,
        transientText: "Streamed text",
        revision: 1,
      },
    });
    expect(
      selectTranscriptMiddlePresentation(
        store.getState(),
        "turn-live-cache-delta",
        "agent-live-cache-sibling",
      ),
    ).toStrictEqual(beforeSiblingPresentation);
  });

  it("keeps the order chunk stable while settlement switches live presentation to committed", () => {
    const store = makeStore();

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
    const initialItem = agentMessage("agent-live-cache-settled", "Live answer", "commentary");

    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemStarted(
          eventItemStarted,
          "commit-live-cache-settled-started",
          "turn-live-cache-settled",
          initialItem,
        ),
        replay: "live",
      }),
    );

    const beforeSettlementChunk = selectTranscriptChunk(
      store.getState(),
      "turn-live-cache-settled:chunk:0",
    );
    const beforeSettlementRevision = beforeSettlementChunk?.revision;
    expect(
      selectTranscriptMiddlePresentation(
        store.getState(),
        "turn-live-cache-settled",
        "agent-live-cache-settled",
      ),
    ).toStrictEqual({
      kind: "live",
      item: {
        key: "turn-live-cache-settled:agent-live-cache-settled",
        turnId: "turn-live-cache-settled",
        itemId: "agent-live-cache-settled",
        status: "started",
        initialItem,
        transientText: "",
        revision: 0,
      },
    });

    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemCompleted(
          eventItemCompleted,
          "commit-live-cache-settled-completed",
          "turn-live-cache-settled",
          agentMessage("agent-live-cache-settled", "Completed cache answer", "commentary"),
        ),
        replay: "live",
      }),
    );

    expect(selectTranscriptChunk(store.getState(), "turn-live-cache-settled:chunk:0")).toBe(
      beforeSettlementChunk,
    );
    expect(
      selectTranscriptChunk(store.getState(), "turn-live-cache-settled:chunk:0")?.revision,
    ).toBe(beforeSettlementRevision);
    expect(
      selectTranscriptMiddlePresentation(
        store.getState(),
        "turn-live-cache-settled",
        "agent-live-cache-settled",
      ),
    ).toStrictEqual({
      kind: "committed",
      entry: {
        type: "message",
        id: "agent-live-cache-settled",
        turnId: "turn-live-cache-settled",
        role: "assistant",
        source: "Completed cache answer",
        sourceKind: "markdown",
        phase: "commentary",
        revision: 0,
      },
    });
  });
});
