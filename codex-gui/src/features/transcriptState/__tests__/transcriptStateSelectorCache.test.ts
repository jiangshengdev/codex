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

  it("returns a stable middle chunk view while that turn is unchanged", () => {
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

    const firstChunk = selectTranscriptChunk(store.getState(), "turn-live-cache:chunk:0");
    expect(firstChunk).not.toBeNull();
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
          agentMessage("agent-live-cache-first", "First"),
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
          agentMessage("agent-live-cache-second", "Second"),
        ),
        replay: "live",
      }),
    );

    const afterUpdate = selectTranscriptChunk(store.getState(), "turn-live-cache-update:chunk:0");
    expect(afterUpdate).not.toBe(beforeUpdate);
    expect(afterUpdate?.revision).toBe((beforeUpdate?.revision ?? 0) + 1);
    expect(afterUpdate?.entries.map(({ id }) => id)).toStrictEqual([
      "agent-live-cache-first",
      "agent-live-cache-second",
    ]);
  });

  it("returns a new middle chunk view when delta updates that live entry", () => {
    const store = makeStore();

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
    const initialItem = agentMessage("agent-live-cache-delta", "");

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

    const beforeUpdate = selectTranscriptChunk(store.getState(), "turn-live-cache-delta:chunk:0");
    expect(beforeUpdate?.revision).toBe(1);

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
    const expectedStreamingPayload = {
      type: "live" as const,
      id: "agent-live-cache-delta",
      key: transcriptEntryIdFor("turn-live-cache-delta", "agent-live-cache-delta"),
      turnId: "turn-live-cache-delta",
      itemId: "agent-live-cache-delta",
      status: "streaming" as const,
      initialItem,
      transientText: "Streamed text",
      revision: 1,
    };

    expect(afterUpdate).not.toBe(beforeUpdate);
    expect(
      selectTranscriptEntry(
        store.getState(),
        transcriptEntryIdFor("turn-live-cache-delta", "agent-live-cache-delta"),
      ),
    ).toStrictEqual(expectedStreamingPayload);
    expect(afterUpdate).toStrictEqual({
      id: "turn-live-cache-delta:chunk:0",
      turnId: "turn-live-cache-delta",
      revision: 2,
      entries: [expectedStreamingPayload],
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

    const beforeSettlement = selectTranscriptChunk(
      store.getState(),
      "turn-live-cache-settled:chunk:0",
    );
    expect(beforeSettlement).toStrictEqual({
      id: "turn-live-cache-settled:chunk:0",
      turnId: "turn-live-cache-settled",
      revision: 1,
      entries: [
        {
          type: "live",
          id: "agent-live-cache-settled",
          key: transcriptEntryIdFor("turn-live-cache-settled", "agent-live-cache-settled"),
          turnId: "turn-live-cache-settled",
          itemId: "agent-live-cache-settled",
          status: "started",
          initialItem,
          transientText: "",
          revision: 0,
        },
      ],
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

    const afterSettlement = selectTranscriptChunk(
      store.getState(),
      "turn-live-cache-settled:chunk:0",
    );

    expect(afterSettlement).not.toBe(beforeSettlement);
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
          source: "Completed cache answer",
          sourceKind: "markdown",
          phase: "commentary",
          revision: 1,
        },
      ],
    });
  });
});
