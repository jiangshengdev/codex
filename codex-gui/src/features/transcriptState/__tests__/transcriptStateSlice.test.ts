import { describe, expect, it } from "vitest";
import { makeStore } from "@/app/store";
import attachBaselineJson from "@/features/projection/__fixtures__/attach-baseline.json";
import eventItemCompletedJson from "@/features/projection/__fixtures__/event-item-completed.json";
import eventItemStartedJson from "@/features/projection/__fixtures__/event-item-started.json";
import eventTurnCompletedJson from "@/features/projection/__fixtures__/event-turn-completed.json";
import eventTurnStartedJson from "@/features/projection/__fixtures__/event-turn-started.json";
import {
  threadRuntimeAttached,
  threadRuntimeEventBuffered,
  threadRuntimeManualReconnectRequired,
} from "@/features/threadRuntime/threadRuntimeSlice";
import type {
  ThreadProjectionAttachResponse,
  ThreadProjectionEventNotification,
} from "@codex-protocol/v2";
import {
  TARGET_TRANSCRIPT_CHUNK_ENTRY_LIMIT,
  selectTranscriptChunk,
  selectTranscriptChunkIdsForTurn,
  selectTranscriptEntry,
  selectTranscriptGlobalStatus,
  selectTranscriptTurn,
  selectTranscriptTurnIds,
} from "../transcriptStateSlice";
import {
  agentMessage,
  attachWithTurns,
  baseTurn,
  imageInput,
  itemCompleted,
  itemStarted,
  planItem,
  sleepItem,
  textInput,
  turnCompleted,
  turnStarted,
  userMessage,
} from "./transcriptStateTestBuilders";

const attachBaseline = attachBaselineJson as ThreadProjectionAttachResponse;
const eventTurnStarted = eventTurnStartedJson as ThreadProjectionEventNotification;
const eventItemStarted = eventItemStartedJson as ThreadProjectionEventNotification;
const eventItemCompleted = eventItemCompletedJson as ThreadProjectionEventNotification;
const eventTurnCompleted = eventTurnCompletedJson as ThreadProjectionEventNotification;

describe("transcript state reducer", () => {
  it("registers transcript state in the app store", () => {
    const store = makeStore();

    expect(selectTranscriptTurnIds(store.getState())).toStrictEqual([]);
    expect(selectTranscriptGlobalStatus(store.getState())).toStrictEqual([]);
  });

  it("rebuilds committed transcript chunks from an accepted attach snapshot", () => {
    const attachWithChat = attachWithTurns(attachBaseline, [
      baseTurn("turn-snapshot", [
        userMessage("user-snapshot", [
          textInput("Hello "),
          imageInput("https://example.invalid/a.png"),
          textInput("there"),
        ]),
        agentMessage("agent-snapshot", "**Plain** text"),
        planItem("plan-snapshot"),
      ]),
    ]);
    const store = makeStore();

    store.dispatch(threadRuntimeAttached(attachWithChat));

    expect(selectTranscriptTurnIds(store.getState())).toStrictEqual(["turn-snapshot"]);
    expect(selectTranscriptTurn(store.getState(), "turn-snapshot")).toStrictEqual({
      id: "turn-snapshot",
      status: "completed",
    });
    expect(selectTranscriptChunkIdsForTurn(store.getState(), "turn-snapshot")).toStrictEqual([
      "turn-snapshot:chunk:0",
    ]);
    expect(selectTranscriptChunk(store.getState(), "turn-snapshot:chunk:0")).toStrictEqual({
      id: "turn-snapshot:chunk:0",
      turnId: "turn-snapshot",
      revision: 0,
      entries: [
        {
          type: "message",
          id: "user-snapshot",
          turnId: "turn-snapshot",
          role: "user",
          source: "Hello there",
          sourceKind: "plainText",
          revision: 0,
        },
        {
          type: "message",
          id: "agent-snapshot",
          turnId: "turn-snapshot",
          role: "assistant",
          source: "**Plain** text",
          sourceKind: "plainText",
          revision: 0,
        },
      ],
    });
    expect(selectTranscriptGlobalStatus(store.getState())).toStrictEqual([]);
  });

  it("filters empty text, non-text user inputs, and non-chat snapshot items", () => {
    const store = makeStore();

    store.dispatch(
      threadRuntimeAttached(
        attachWithTurns(attachBaseline, [
          baseTurn("turn-filtered", [
            userMessage("image-only", [imageInput("https://example.invalid/image.png")]),
            userMessage("empty-user", [textInput("")]),
            agentMessage("empty-agent", ""),
            planItem("hidden-plan"),
            sleepItem("hidden-sleep"),
          ]),
        ]),
      ),
    );

    expect(selectTranscriptTurnIds(store.getState())).toStrictEqual(["turn-filtered"]);
    expect(selectTranscriptChunkIdsForTurn(store.getState(), "turn-filtered")).toStrictEqual([]);
  });

  it("applies live itemCompleted messages into committed transcript chunks", () => {
    const store = makeStore();

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
    store.dispatch(
      threadRuntimeEventBuffered(
        turnStarted(eventTurnStarted, "commit-live-turn", {
          ...baseTurn("turn-live", []),
          status: "inProgress",
        }),
      ),
    );
    store.dispatch(
      threadRuntimeEventBuffered(
        itemStarted(
          eventItemStarted,
          "commit-live-started",
          "turn-live",
          agentMessage("agent-started", "Started should be ignored"),
        ),
      ),
    );
    store.dispatch(
      threadRuntimeEventBuffered(
        itemCompleted(
          eventItemCompleted,
          "commit-live-agent",
          "turn-live",
          agentMessage("agent-live", "Live answer"),
        ),
      ),
    );

    expect(selectTranscriptTurn(store.getState(), "turn-live")).toStrictEqual({
      id: "turn-live",
      status: "inProgress",
    });
    expect(selectTranscriptChunkIdsForTurn(store.getState(), "turn-live")).toStrictEqual([
      "turn-live:chunk:0",
    ]);
    expect(selectTranscriptChunk(store.getState(), "turn-live:chunk:0")?.entries).toStrictEqual([
      {
        type: "message",
        id: "agent-live",
        turnId: "turn-live",
        role: "assistant",
        source: "Live answer",
        sourceKind: "plainText",
        revision: 0,
      },
    ]);
  });

  it("updates turn terminal status from live turnCompleted", () => {
    const store = makeStore();

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
    store.dispatch(
      threadRuntimeEventBuffered(
        turnStarted(eventTurnStarted, "commit-start-done", {
          ...baseTurn("turn-done", []),
          status: "inProgress",
        }),
      ),
    );
    store.dispatch(
      threadRuntimeEventBuffered(
        turnCompleted(eventTurnCompleted, "commit-complete-done", {
          ...baseTurn("turn-done", []),
          status: "completed",
        }),
      ),
    );

    expect(selectTranscriptTurn(store.getState(), "turn-done")).toStrictEqual({
      id: "turn-done",
      status: "completed",
    });
    expect(selectTranscriptChunkIdsForTurn(store.getState(), "turn-done")).toStrictEqual([]);
  });

  it("filters empty text and non-chat live item completions", () => {
    const store = makeStore();

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
    store.dispatch(
      threadRuntimeEventBuffered(
        itemCompleted(
          eventItemCompleted,
          "commit-empty-user",
          "turn-live-filtered",
          userMessage("empty-user", [textInput("")]),
        ),
      ),
    );
    store.dispatch(
      threadRuntimeEventBuffered(
        itemCompleted(
          eventItemCompleted,
          "commit-empty-agent",
          "turn-live-filtered",
          agentMessage("empty-agent", ""),
        ),
      ),
    );
    store.dispatch(
      threadRuntimeEventBuffered(
        itemCompleted(
          eventItemCompleted,
          "commit-plan",
          "turn-live-filtered",
          planItem("hidden-plan"),
        ),
      ),
    );
    store.dispatch(
      threadRuntimeEventBuffered(
        itemCompleted(
          eventItemCompleted,
          "commit-sleep",
          "turn-live-filtered",
          sleepItem("hidden-sleep"),
        ),
      ),
    );

    expect(selectTranscriptTurnIds(store.getState())).toStrictEqual(["turn-live-filtered"]);
    expect(selectTranscriptChunkIdsForTurn(store.getState(), "turn-live-filtered")).toStrictEqual(
      [],
    );
  });

  it("uses commitId to avoid applying the same live notification twice", () => {
    const store = makeStore();

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
    store.dispatch(
      threadRuntimeEventBuffered(
        itemCompleted(
          eventItemCompleted,
          "commit-duplicate",
          "turn-duplicate",
          agentMessage("agent-first", "First"),
        ),
      ),
    );
    store.dispatch(
      threadRuntimeEventBuffered(
        itemCompleted(
          eventItemCompleted,
          "commit-duplicate",
          "turn-duplicate",
          agentMessage("agent-second", "Second should be ignored"),
        ),
      ),
    );

    expect(
      selectTranscriptChunk(store.getState(), "turn-duplicate:chunk:0")?.entries,
    ).toStrictEqual([
      {
        type: "message",
        id: "agent-first",
        turnId: "turn-duplicate",
        role: "assistant",
        source: "First",
        sourceKind: "plainText",
        revision: 0,
      },
    ]);
  });

  it("updates an existing committed entry and bumps only its chunk revision", () => {
    const store = makeStore();

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
    store.dispatch(
      threadRuntimeEventBuffered(
        itemCompleted(
          eventItemCompleted,
          "commit-first",
          "turn-update",
          agentMessage("agent-update", "First"),
        ),
      ),
    );
    const beforeUpdateChunk = selectTranscriptChunk(store.getState(), "turn-update:chunk:0");

    store.dispatch(
      threadRuntimeEventBuffered(
        itemCompleted(
          eventItemCompleted,
          "commit-second",
          "turn-update",
          agentMessage("agent-update", "Second"),
        ),
      ),
    );

    expect(selectTranscriptEntry(store.getState(), "agent-update")).toStrictEqual({
      type: "message",
      id: "agent-update",
      turnId: "turn-update",
      role: "assistant",
      source: "Second",
      sourceKind: "plainText",
      revision: 1,
    });
    expect(selectTranscriptChunk(store.getState(), "turn-update:chunk:0")).toStrictEqual({
      id: "turn-update:chunk:0",
      turnId: "turn-update",
      revision: (beforeUpdateChunk?.revision ?? 0) + 1,
      entries: [
        {
          type: "message",
          id: "agent-update",
          turnId: "turn-update",
          role: "assistant",
          source: "Second",
          sourceKind: "plainText",
          revision: 1,
        },
      ],
    });
  });

  it("creates a new chunk after the committed chunk entry limit", () => {
    const store = makeStore();

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
    for (let index = 0; index <= TARGET_TRANSCRIPT_CHUNK_ENTRY_LIMIT; index += 1) {
      store.dispatch(
        threadRuntimeEventBuffered(
          itemCompleted(
            eventItemCompleted,
            `commit-chunk-${String(index)}`,
            "turn-chunked",
            agentMessage(`agent-chunk-${String(index)}`, `Entry ${String(index)}`),
          ),
        ),
      );
    }

    expect(selectTranscriptChunkIdsForTurn(store.getState(), "turn-chunked")).toStrictEqual([
      "turn-chunked:chunk:0",
      "turn-chunked:chunk:1",
    ]);
    expect(selectTranscriptChunk(store.getState(), "turn-chunked:chunk:0")?.entries).toHaveLength(
      TARGET_TRANSCRIPT_CHUNK_ENTRY_LIMIT,
    );
    expect(selectTranscriptChunk(store.getState(), "turn-chunked:chunk:1")?.entries).toStrictEqual([
      {
        type: "message",
        id: "agent-chunk-100",
        turnId: "turn-chunked",
        role: "assistant",
        source: "Entry 100",
        sourceKind: "plainText",
        revision: 0,
      },
    ]);
  });

  it("preserves committed transcript and sets global status on manual reconnect", () => {
    const store = makeStore();
    const attachWithChat = attachWithTurns(attachBaseline, [
      baseTurn("turn-existing", [agentMessage("agent-existing", "Existing answer")]),
    ]);

    store.dispatch(threadRuntimeAttached(attachWithChat));
    store.dispatch(
      threadRuntimeManualReconnectRequired({
        reason: "backpressure",
        threadId: attachWithChat.snapshot.thread.id,
        subscriptionId: attachWithChat.subscriptionId,
      }),
    );

    expect(selectTranscriptChunk(store.getState(), "turn-existing:chunk:0")?.entries).toStrictEqual(
      [
        {
          type: "message",
          id: "agent-existing",
          turnId: "turn-existing",
          role: "assistant",
          source: "Existing answer",
          sourceKind: "plainText",
          revision: 0,
        },
      ],
    );
    expect(selectTranscriptGlobalStatus(store.getState())).toStrictEqual([
      {
        id: `subscriptionInterrupted:${attachWithChat.snapshot.thread.id}:${attachWithChat.subscriptionId}:backpressure`,
        status: "subscriptionInterrupted",
        reason: "backpressure",
        subscriptionId: attachWithChat.subscriptionId,
      },
    ]);
  });

  it("clears interrupted status and applied event ids on the next attach", () => {
    const store = makeStore();
    const attachWithChat = attachWithTurns(attachBaseline, [
      baseTurn("turn-before-reconnect", [agentMessage("agent-before", "Before reconnect")]),
    ]);
    const replacementAttach = attachWithTurns(attachBaseline, [
      baseTurn("turn-after-reconnect", [agentMessage("agent-after", "After reconnect")]),
    ]);

    store.dispatch(threadRuntimeAttached(attachWithChat));
    store.dispatch(
      threadRuntimeEventBuffered(
        itemCompleted(
          eventItemCompleted,
          "commit-before",
          "turn-before-reconnect",
          agentMessage("agent-live-before", "Live before"),
        ),
      ),
    );
    store.dispatch(
      threadRuntimeManualReconnectRequired({
        reason: "backpressure",
        threadId: attachWithChat.snapshot.thread.id,
        subscriptionId: attachWithChat.subscriptionId,
      }),
    );
    store.dispatch(threadRuntimeAttached(replacementAttach));
    store.dispatch(
      threadRuntimeEventBuffered(
        itemCompleted(
          eventItemCompleted,
          "commit-before",
          "turn-after-reconnect",
          agentMessage("agent-live-after", "Live after reconnect"),
        ),
      ),
    );

    expect(selectTranscriptTurnIds(store.getState())).toStrictEqual(["turn-after-reconnect"]);
    expect(
      selectTranscriptChunk(store.getState(), "turn-after-reconnect:chunk:0")?.entries,
    ).toHaveLength(2);
    expect(selectTranscriptGlobalStatus(store.getState())).toStrictEqual([]);
  });
});
