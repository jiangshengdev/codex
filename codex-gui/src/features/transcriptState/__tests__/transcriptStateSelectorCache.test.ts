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
  selectTranscriptEntry,
  transcriptEntryIdFor,
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
  it("returns a stable transcript chunk view while the chunk is unchanged", () => {
    const store = makeStore();

    store.dispatch(
      threadRuntimeAttached(
        attachWithTurns(attachBaseline, [
          baseTurn("turn-cached", [agentMessage("agent-cached", "Cached answer", "commentary")]),
        ]),
      ),
    );

    const entryId = transcriptEntryIdFor("turn-cached", "agent-cached");
    const firstChunk = selectTranscriptChunk(store.getState(), "turn-cached:chunk:0");
    const firstEntry = selectTranscriptEntry(store.getState(), entryId);

    expect(firstChunk).not.toBeNull();
    expect(firstEntry).not.toBeNull();
    expect(selectTranscriptChunk(store.getState(), "turn-cached:chunk:0")).toBe(firstChunk);
    expect(selectTranscriptEntry(store.getState(), entryId)).toBe(firstEntry);

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
    expect(selectTranscriptEntry(store.getState(), entryId)).toBe(firstEntry);

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
    expect(selectTranscriptEntry(store.getState(), entryId)).toBe(firstEntry);
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

    const cachedEntryId = transcriptEntryIdFor("turn-cached", "agent-cached");
    const beforeUpdateChunk = selectTranscriptChunk(store.getState(), "turn-cached:chunk:0");
    const beforeUpdateEntry = selectTranscriptEntry(store.getState(), cachedEntryId);

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
    expect(selectTranscriptEntry(store.getState(), cachedEntryId)).toBe(beforeUpdateEntry);
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
          rendering: { mode: "staticMarkdown", source: "Cached answer" },
          revision: 0,
        },
        {
          type: "message",
          id: "agent-cached-live",
          turnId: "turn-cached",
          role: "assistant",
          rendering: { mode: "staticMarkdown", source: "Live answer" },
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

    const entryId = transcriptEntryIdFor("turn-reattach", "agent-reattach");
    const beforeReattachChunk = selectTranscriptChunk(store.getState(), "turn-reattach:chunk:0");
    const beforeReattachEntry = selectTranscriptEntry(store.getState(), entryId);

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
    const afterReattachEntry = selectTranscriptEntry(store.getState(), entryId);

    expect(afterReattachChunk).not.toBe(beforeReattachChunk);
    expect(afterReattachEntry).not.toBe(beforeReattachEntry);
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
          rendering: { mode: "staticMarkdown", source: "After reconnect" },
          revision: 0,
        },
      ],
    });
    expect(afterReattachEntry).toBe(afterReattachChunk?.entries[0]);
  });

  it("returns a stable middle chunk view while that turn is unchanged", () => {
    const store = makeStore();

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemStarted(
          eventItemStarted,
          "commit-live-cache-started",
          "turn-live-cache",
          agentMessage("agent-live-cache", "Live cache", "commentary"),
        ),
        replay: "live",
      }),
    );

    const entryId = transcriptEntryIdFor("turn-live-cache", "agent-live-cache");
    const firstChunk = selectTranscriptChunk(store.getState(), "turn-live-cache:chunk:0");
    expect(firstChunk).not.toBeNull();
    expect(firstChunk?.entries).toStrictEqual([]);
    expect(selectTranscriptEntry(store.getState(), entryId)).toBeNull();
    expect(selectTranscriptChunk(store.getState(), "turn-live-cache:chunk:0")).toBe(firstChunk);

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

    expect(selectTranscriptChunk(store.getState(), "turn-live-cache:chunk:0")).toBe(firstChunk);
    expect(selectTranscriptEntry(store.getState(), entryId)).toBeNull();
  });

  it("returns a new middle chunk view when another started item enters the turn", () => {
    const store = makeStore();

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemStarted(
          eventItemStarted,
          "commit-live-cache-first",
          "turn-live-cache-update",
          agentMessage("agent-live-cache-first", "First", "commentary"),
        ),
        replay: "live",
      }),
    );
    const beforeUpdate = selectTranscriptChunk(store.getState(), "turn-live-cache-update:chunk:0");

    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemStarted(
          eventItemStarted,
          "commit-live-cache-second",
          "turn-live-cache-update",
          agentMessage("agent-live-cache-second", "Second", "commentary"),
        ),
        replay: "live",
      }),
    );

    const afterUpdate = selectTranscriptChunk(store.getState(), "turn-live-cache-update:chunk:0");
    expect(afterUpdate).not.toBe(beforeUpdate);
    expect(afterUpdate?.revision).toBe((beforeUpdate?.revision ?? 0) + 1);
    expect(afterUpdate?.entries).toStrictEqual([]);
    expect(
      selectTranscriptEntry(
        store.getState(),
        transcriptEntryIdFor("turn-live-cache-update", "agent-live-cache-first"),
      ),
    ).toBeNull();
    expect(
      selectTranscriptEntry(
        store.getState(),
        transcriptEntryIdFor("turn-live-cache-update", "agent-live-cache-second"),
      ),
    ).toBeNull();
  });

  it("returns a new middle chunk view when delta updates that live entry", () => {
    const store = makeStore();

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
    const initialItem = agentMessage("agent-live-cache-delta", "", "commentary");

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

    const entryId = transcriptEntryIdFor("turn-live-cache-delta", "agent-live-cache-delta");
    const beforeUpdate = selectTranscriptChunk(store.getState(), "turn-live-cache-delta:chunk:0");
    expect(beforeUpdate?.revision).toBe(1);
    expect(beforeUpdate?.entries).toStrictEqual([]);
    expect(selectTranscriptEntry(store.getState(), entryId)).toBeNull();

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

    const afterUpdate = selectTranscriptChunk(store.getState(), "turn-live-cache-delta:chunk:0");
    const expectedStreamingView = {
      type: "message" as const,
      id: "agent-live-cache-delta",
      turnId: "turn-live-cache-delta",
      role: "assistant" as const,
      rendering: { mode: "streamingMarkdown" as const, source: "Streamed text" },
      revision: 1,
    };

    expect(afterUpdate).not.toBe(beforeUpdate);
    expect(selectTranscriptEntry(store.getState(), entryId)).toStrictEqual(expectedStreamingView);
    expect(afterUpdate).toStrictEqual({
      id: "turn-live-cache-delta:chunk:0",
      turnId: "turn-live-cache-delta",
      revision: 2,
      entries: [expectedStreamingView],
    });
  });

  it("returns a new middle chunk view when a live entry settles in place", () => {
    const store = makeStore();

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
    const initialItem = agentMessage("agent-live-cache-settled", "", "commentary");

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

    store.dispatch(
      threadRuntimeDeltasAccepted({
        notifications: [
          agentMessageDelta(
            eventAgentMessageDelta,
            "turn-live-cache-settled",
            "agent-live-cache-settled",
            "Streaming cache answer",
          ),
        ],
      }),
    );

    const entryId = transcriptEntryIdFor("turn-live-cache-settled", "agent-live-cache-settled");
    const beforeSettlement = selectTranscriptChunk(
      store.getState(),
      "turn-live-cache-settled:chunk:0",
    );
    const beforeSettlementEntry = selectTranscriptEntry(store.getState(), entryId);
    expect(beforeSettlement).toStrictEqual({
      id: "turn-live-cache-settled:chunk:0",
      turnId: "turn-live-cache-settled",
      revision: 2,
      entries: [
        {
          type: "message",
          id: "agent-live-cache-settled",
          turnId: "turn-live-cache-settled",
          role: "assistant",
          rendering: { mode: "streamingMarkdown", source: "Streaming cache answer" },
          revision: 1,
        },
      ],
    });
    expect(beforeSettlementEntry).toBe(beforeSettlement?.entries[0]);

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

    const afterSettlement = selectTranscriptChunk(
      store.getState(),
      "turn-live-cache-settled:chunk:0",
    );
    const afterSettlementEntry = selectTranscriptEntry(store.getState(), entryId);

    expect(afterSettlement).not.toBe(beforeSettlement);
    expect(afterSettlementEntry).not.toBe(beforeSettlementEntry);
    expect(afterSettlement).toStrictEqual({
      id: "turn-live-cache-settled:chunk:0",
      turnId: "turn-live-cache-settled",
      revision: (beforeSettlement?.revision ?? 0) + 1,
      entries: [
        {
          type: "message",
          id: "agent-live-cache-settled",
          turnId: "turn-live-cache-settled",
          role: "assistant",
          rendering: { mode: "staticMarkdown", source: "Completed cache answer" },
          revision: 2,
        },
      ],
    });
    expect(afterSettlementEntry).toBe(afterSettlement?.entries[0]);
  });
});
