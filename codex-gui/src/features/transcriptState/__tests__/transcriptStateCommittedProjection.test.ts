import { describe, expect, it } from "vitest";
import { makeStore } from "@/app/store";
import {
  attachBaseline,
  eventItemCompleted,
  eventItemStarted,
  eventTurnCompleted,
  eventTurnStarted,
} from "@/features/projection/__tests__/projectionFixtures";
import {
  agentMessage,
  attachWithTurns,
  baseTurn,
  inProgressTurn,
  itemCompleted,
  itemStarted,
  planItem,
  sleepItem,
  textInput,
  turnCompleted,
  turnStarted,
  userMessage,
} from "@/features/projection/__tests__/projectionTestBuilders";
import {
  threadRuntimeAttached,
  threadRuntimeEventBuffered,
} from "@/features/threadRuntime/threadRuntimeSlice";
import {
  TARGET_TRANSCRIPT_CHUNK_ENTRY_LIMIT,
  selectTranscriptChunk,
  selectTranscriptEntry,
  selectTranscriptMiddlePresentation,
  selectTranscriptTurn,
  selectTranscriptTurnIds,
} from "../transcriptStateSlice";

describe("transcript state committed projection reducer", () => {
  it("preserves assistant message phase in live completed transcript entries", () => {
    const store = makeStore();

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemCompleted(
          eventItemCompleted,
          "commit-live-commentary",
          "turn-live-phase",
          agentMessage("agent-live-commentary", "Still working", "commentary"),
        ),
        replay: "live",
      }),
    );

    expect(
      selectTranscriptChunk(store.getState(), "turn-live-phase:chunk:0")?.entryIds,
    ).toStrictEqual(["agent-live-commentary"]);
    expect(
      selectTranscriptMiddlePresentation(
        store.getState(),
        "turn-live-phase",
        "agent-live-commentary",
      ),
    ).toStrictEqual({
      kind: "committed",
      entry: {
        type: "message",
        id: "agent-live-commentary",
        turnId: "turn-live-phase",
        role: "assistant",
        source: "Still working",
        sourceKind: "markdown",
        phase: "commentary",
        revision: 0,
      },
    });
  });

  it("keeps a later completed user in middle when the first completed item is assistant", () => {
    const store = makeStore();

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: turnStarted(
          eventTurnStarted,
          "commit-live-turn",
          inProgressTurn("turn-live"),
        ),
        replay: "live",
      }),
    );
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemCompleted(
          eventItemCompleted,
          "commit-live-agent",
          "turn-live",
          agentMessage("agent-live", "Live answer"),
        ),
        replay: "live",
      }),
    );
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemCompleted(
          eventItemCompleted,
          "commit-live-user",
          "turn-live",
          userMessage("user-after-agent", [textInput("Later prompt")]),
        ),
        replay: "live",
      }),
    );

    expect(selectTranscriptTurn(store.getState(), "turn-live")).toStrictEqual({
      id: "turn-live",
      status: "inProgress",
      originalFirstItemId: "agent-live",
      leadingPromptEntryId: null,
      middleChunkIds: ["turn-live:chunk:0"],
      middleEntryCount: 1,
      finalAssistantEntryIds: ["agent-live"],
    });
    expect(selectTranscriptEntry(store.getState(), "agent-live")).toStrictEqual({
      type: "message",
      id: "agent-live",
      turnId: "turn-live",
      role: "assistant",
      source: "Live answer",
      sourceKind: "markdown",
      phase: "final_answer",
      revision: 0,
    });
    expect(
      selectTranscriptChunk(store.getState(), "turn-live:chunk:0")?.entryIds,
    ).toStrictEqual(["agent-live", "user-after-agent"]);
  });

  it("keeps a later completed user in middle when an assistant item started first", () => {
    const store = makeStore();

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemStarted(
          eventItemStarted,
          "start-assistant-first",
          "turn-started-first",
          agentMessage("agent-started-first", "Working", "commentary"),
        ),
        replay: "live",
      }),
    );
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemCompleted(
          eventItemCompleted,
          "complete-user-after-started",
          "turn-started-first",
          userMessage("user-after-started", [textInput("Later prompt")]),
        ),
        replay: "live",
      }),
    );

    expect(selectTranscriptTurn(store.getState(), "turn-started-first")).toStrictEqual({
      id: "turn-started-first",
      status: "inProgress",
      originalFirstItemId: "agent-started-first",
      leadingPromptEntryId: null,
      middleChunkIds: ["turn-started-first:chunk:0"],
      middleEntryCount: 2,
      finalAssistantEntryIds: [],
    });
    expect(
      selectTranscriptChunk(store.getState(), "turn-started-first:chunk:0")?.entryIds,
    ).toStrictEqual(["agent-started-first", "user-after-started"]);
  });

  it("applies normalized live itemCompleted projection payloads into committed transcript chunks", () => {
    const store = makeStore();

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemCompleted(
          eventItemCompleted,
          "commit-live-normalized",
          "turn-live-normalized",
          agentMessage("agent-live-normalized", "Live normalized answer"),
        ),
        replay: "live",
      }),
    );

    expect(selectTranscriptTurn(store.getState(), "turn-live-normalized")).toStrictEqual({
      id: "turn-live-normalized",
      status: "inProgress",
      originalFirstItemId: "agent-live-normalized",
      leadingPromptEntryId: null,
      middleChunkIds: ["turn-live-normalized:chunk:0"],
      middleEntryCount: 0,
      finalAssistantEntryIds: ["agent-live-normalized"],
    });
    expect(selectTranscriptEntry(store.getState(), "agent-live-normalized")).toStrictEqual({
      type: "message",
      id: "agent-live-normalized",
      turnId: "turn-live-normalized",
      role: "assistant",
      source: "Live normalized answer",
      sourceKind: "markdown",
      phase: "final_answer",
      revision: 0,
    });
    expect(
      selectTranscriptMiddlePresentation(
        store.getState(),
        "turn-live-normalized",
        "agent-live-normalized",
      ),
    ).toBeNull();
  });

  it("keeps completed-without-started identity membership isolated by turn", () => {
    const store = makeStore();
    const sharedItemId = "agent-shared-between-turns";

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemCompleted(
          eventItemCompleted,
          "commit-shared-turn-first",
          "turn-shared-first",
          agentMessage(sharedItemId, "First turn", "commentary"),
        ),
        replay: "live",
      }),
    );
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemCompleted(
          eventItemCompleted,
          "commit-shared-turn-second",
          "turn-shared-second",
          agentMessage(sharedItemId, "Second turn", "commentary"),
        ),
        replay: "live",
      }),
    );

    const beforeDuplicateState = store.getState().transcriptState;
    const firstChunkRevision = beforeDuplicateState.chunksById["turn-shared-first:chunk:0"]?.revision;
    const secondChunkRevision =
      beforeDuplicateState.chunksById["turn-shared-second:chunk:0"]?.revision;

    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemCompleted(
          eventItemCompleted,
          "commit-shared-turn-first-duplicate",
          "turn-shared-first",
          agentMessage(sharedItemId, "First turn updated", "commentary"),
        ),
        replay: "live",
      }),
    );

    const completedState = store.getState().transcriptState;
    expect(completedState.turnsById["turn-shared-first"].middleEntryCount).toBe(1);
    expect(completedState.turnsById["turn-shared-second"].middleEntryCount).toBe(1);
    expect(completedState.chunksById["turn-shared-first:chunk:0"]?.entryIds).toStrictEqual([
      sharedItemId,
    ]);
    expect(completedState.chunksById["turn-shared-second:chunk:0"]?.entryIds).toStrictEqual([
      sharedItemId,
    ]);
    expect(completedState.chunksById["turn-shared-first:chunk:0"]?.revision).toBe(
      firstChunkRevision,
    );
    expect(completedState.chunksById["turn-shared-second:chunk:0"]?.revision).toBe(
      secondChunkRevision,
    );
  });

  it("updates turn terminal status from live turnCompleted", () => {
    const store = makeStore();

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: turnStarted(
          eventTurnStarted,
          "commit-start-done",
          inProgressTurn("turn-done"),
        ),
        replay: "live",
      }),
    );
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: turnCompleted(eventTurnCompleted, "commit-complete-done", {
          ...baseTurn("turn-done", []),
          status: "completed",
        }),
        replay: "live",
      }),
    );

    expect(selectTranscriptTurn(store.getState(), "turn-done")).toStrictEqual({
      id: "turn-done",
      status: "completed",
      originalFirstItemId: null,
      leadingPromptEntryId: null,
      middleChunkIds: [],
      middleEntryCount: 0,
      finalAssistantEntryIds: [],
    });
  });

  it("filters empty text and non-chat live item completions", () => {
    const store = makeStore();

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemCompleted(
          eventItemCompleted,
          "commit-empty-user",
          "turn-live-filtered",
          userMessage("empty-user", [textInput("")]),
        ),
        replay: "live",
      }),
    );
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemCompleted(
          eventItemCompleted,
          "commit-empty-agent",
          "turn-live-filtered",
          agentMessage("empty-agent", ""),
        ),
        replay: "live",
      }),
    );
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemCompleted(
          eventItemCompleted,
          "commit-plan",
          "turn-live-filtered",
          planItem("hidden-plan"),
        ),
        replay: "live",
      }),
    );
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemCompleted(
          eventItemCompleted,
          "commit-sleep",
          "turn-live-filtered",
          sleepItem("hidden-sleep"),
        ),
        replay: "live",
      }),
    );

    expect(selectTranscriptTurnIds(store.getState())).toStrictEqual(["turn-live-filtered"]);
    expect(selectTranscriptTurn(store.getState(), "turn-live-filtered")).toStrictEqual({
      id: "turn-live-filtered",
      status: "inProgress",
      originalFirstItemId: "empty-user",
      leadingPromptEntryId: null,
      middleChunkIds: ["turn-live-filtered:chunk:0"],
      middleEntryCount: 0,
      finalAssistantEntryIds: [],
    });
    expect(
      selectTranscriptChunk(store.getState(), "turn-live-filtered:chunk:0")?.entryIds,
    ).toStrictEqual(["empty-user", "empty-agent"]);
  });

  it("updates an existing committed entry without changing its order chunk", () => {
    const store = makeStore();

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemCompleted(
          eventItemCompleted,
          "commit-first",
          "turn-update",
          agentMessage("agent-update", "First", "commentary"),
        ),
        replay: "live",
      }),
    );
    const beforeUpdateChunk = selectTranscriptChunk(store.getState(), "turn-update:chunk:0");

    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemCompleted(
          eventItemCompleted,
          "commit-second",
          "turn-update",
          agentMessage("agent-update", "Second", "commentary"),
        ),
        replay: "live",
      }),
    );

    expect(selectTranscriptTurn(store.getState(), "turn-update")).toStrictEqual({
      id: "turn-update",
      status: "inProgress",
      originalFirstItemId: "agent-update",
      leadingPromptEntryId: null,
      middleChunkIds: ["turn-update:chunk:0"],
      middleEntryCount: 1,
      finalAssistantEntryIds: [],
    });
    expect(selectTranscriptEntry(store.getState(), "agent-update")).toStrictEqual({
      type: "message",
      id: "agent-update",
      turnId: "turn-update",
      role: "assistant",
      source: "Second",
      sourceKind: "markdown",
      phase: "commentary",
      revision: 1,
    });
    expect(selectTranscriptChunk(store.getState(), "turn-update:chunk:0")).toBe(beforeUpdateChunk);
    expect(
      selectTranscriptMiddlePresentation(store.getState(), "turn-update", "agent-update"),
    ).toStrictEqual({
      kind: "committed",
      entry: {
        type: "message",
        id: "agent-update",
        turnId: "turn-update",
        role: "assistant",
        source: "Second",
        sourceKind: "markdown",
        phase: "commentary",
        revision: 1,
      },
    });
  });

  it("keeps order stable when an existing middle entry phase changes", () => {
    const store = makeStore();

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemCompleted(
          eventItemCompleted,
          "commit-phase-first",
          "turn-phase-update",
          agentMessage("agent-phase-update", "Working", "commentary"),
        ),
        replay: "live",
      }),
    );
    const beforeUpdateChunk = selectTranscriptChunk(store.getState(), "turn-phase-update:chunk:0");

    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemCompleted(
          eventItemCompleted,
          "commit-phase-second",
          "turn-phase-update",
          agentMessage("agent-phase-update", "Done", "final_answer"),
        ),
        replay: "live",
      }),
    );

    expect(selectTranscriptEntry(store.getState(), "agent-phase-update")).toStrictEqual({
      type: "message",
      id: "agent-phase-update",
      turnId: "turn-phase-update",
      role: "assistant",
      source: "Done",
      sourceKind: "markdown",
      phase: "final_answer",
      revision: 1,
    });
    expect(selectTranscriptChunk(store.getState(), "turn-phase-update:chunk:0")).toBe(
      beforeUpdateChunk,
    );
    expect(
      selectTranscriptMiddlePresentation(
        store.getState(),
        "turn-phase-update",
        "agent-phase-update",
      ),
    ).toBeNull();
  });

  it("updates an existing final assistant entry without creating a middle presentation", () => {
    const store = makeStore();

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemCompleted(
          eventItemCompleted,
          "commit-final-first",
          "turn-final-update",
          agentMessage("agent-final-update", "First", "final_answer"),
        ),
        replay: "live",
      }),
    );
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemCompleted(
          eventItemCompleted,
          "commit-final-second",
          "turn-final-update",
          agentMessage("agent-final-update", "Second", "final_answer"),
        ),
        replay: "live",
      }),
    );

    expect(selectTranscriptTurn(store.getState(), "turn-final-update")).toStrictEqual({
      id: "turn-final-update",
      status: "inProgress",
      originalFirstItemId: "agent-final-update",
      leadingPromptEntryId: null,
      middleChunkIds: ["turn-final-update:chunk:0"],
      middleEntryCount: 0,
      finalAssistantEntryIds: ["agent-final-update"],
    });
    expect(selectTranscriptEntry(store.getState(), "agent-final-update")).toStrictEqual({
      type: "message",
      id: "agent-final-update",
      turnId: "turn-final-update",
      role: "assistant",
      source: "Second",
      sourceKind: "markdown",
      phase: "final_answer",
      revision: 1,
    });
    expect(
      selectTranscriptMiddlePresentation(
        store.getState(),
        "turn-final-update",
        "agent-final-update",
      ),
    ).toBeNull();
  });

  it("chunks message identities after the order chunk entry limit", () => {
    const store = makeStore();

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemCompleted(
          eventItemCompleted,
          "commit-leading",
          "turn-middle-chunked",
          userMessage("user-leading-live", [textInput("Prompt")]),
        ),
        replay: "live",
      }),
    );
    let firstChunkAfterLimit: ReturnType<typeof selectTranscriptChunk> | null = null;

    for (let index = 0; index <= TARGET_TRANSCRIPT_CHUNK_ENTRY_LIMIT; index += 1) {
      store.dispatch(
        threadRuntimeEventBuffered({
          notification: itemCompleted(
            eventItemCompleted,
            `commit-middle-${String(index)}`,
            "turn-middle-chunked",
            agentMessage(`agent-middle-${String(index)}`, `Middle ${String(index)}`, "commentary"),
          ),
          replay: "live",
        }),
      );

      if (index === TARGET_TRANSCRIPT_CHUNK_ENTRY_LIMIT - 1) {
        firstChunkAfterLimit = selectTranscriptChunk(
          store.getState(),
          "turn-middle-chunked:chunk:0",
        );
      }
    }
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemCompleted(
          eventItemCompleted,
          "commit-final",
          "turn-middle-chunked",
          agentMessage("agent-final-live", "Final", "final_answer"),
        ),
        replay: "live",
      }),
    );

    expect(selectTranscriptTurn(store.getState(), "turn-middle-chunked")).toStrictEqual({
      id: "turn-middle-chunked",
      status: "inProgress",
      originalFirstItemId: "user-leading-live",
      leadingPromptEntryId: "user-leading-live",
      middleChunkIds: ["turn-middle-chunked:chunk:0", "turn-middle-chunked:chunk:1"],
      middleEntryCount: TARGET_TRANSCRIPT_CHUNK_ENTRY_LIMIT + 1,
      finalAssistantEntryIds: ["agent-final-live"],
    });
    expect(
      selectTranscriptChunk(store.getState(), "turn-middle-chunked:chunk:0")?.entryIds,
    ).toHaveLength(TARGET_TRANSCRIPT_CHUNK_ENTRY_LIMIT);
    expect(
      selectTranscriptChunk(store.getState(), "turn-middle-chunked:chunk:1")?.entryIds,
    ).toHaveLength(3);
    expect(selectTranscriptChunk(store.getState(), "turn-middle-chunked:chunk:0")).toBe(
      firstChunkAfterLimit,
    );
  });
});
