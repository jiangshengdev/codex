import { describe, expect, it } from "vitest";
import { makeStore } from "@/app/store";
import { activeThreadReadModelTransitionApplied } from "@/features/activeThreadSession/activeThreadSessionReadModel";
import type {
  ActiveThreadProjectionAcceptedQueueFact,
  ActiveThreadProjectionReadModelFact,
} from "@/features/activeThreadSession/activeThreadProjection";
import {
  attachBaseline,
  eventItemCompleted,
  eventItemStarted,
  eventTurnStarted,
} from "@/features/projection/__tests__/projectionFixtures";
import {
  agentMessage,
  attachWithTurns,
  inProgressTurn,
  itemCompleted,
  itemStarted,
  planItem,
  sleepItem,
  textInput,
  turnStarted,
  userMessage,
} from "@/features/projection/__tests__/projectionTestBuilders";
import {
  TARGET_TRANSCRIPT_CHUNK_ENTRY_LIMIT,
  selectTranscriptChunk,
  selectTranscriptEntry,
  selectTranscriptTurn,
  selectTranscriptTurnIds,
  transcriptEntryIdFor,
} from "../transcriptStateSlice";

let sessionRevision = 0;
const readModelAction = (...facts: ActiveThreadProjectionReadModelFact[]) =>
  activeThreadReadModelTransitionApplied({ sessionRevision: ++sessionRevision, facts });
const threadRuntimeAttached = (
  response: Extract<ActiveThreadProjectionReadModelFact, { type: "baselineAttached" }>["response"],
) => readModelAction({ type: "baselineAttached", response });
const threadRuntimeEventBuffered = (payload: ActiveThreadProjectionAcceptedQueueFact) =>
  readModelAction({ type: "eventAccepted", payload });

describe("transcript state committed messages reducer", () => {
  it("preserves assistant message phase in stored live completions while projecting views", () => {
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
      selectTranscriptChunk(store.getState(), "turn-live-phase:chunk:0")?.entries,
    ).toStrictEqual([
      {
        type: "message",
        id: "agent-live-commentary",
        turnId: "turn-live-phase",
        role: "assistant",
        rendering: { mode: "staticMarkdown", source: "Still working" },
        revision: 0,
      },
    ]);
    expect(
      store.getState().transcriptState.entriesById[
        transcriptEntryIdFor("turn-live-phase", "agent-live-commentary")
      ],
    ).toMatchObject({ type: "message", phase: "commentary" });
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
      finalAssistantEntryIds: [transcriptEntryIdFor("turn-live", "agent-live")],
    });
    expect(
      selectTranscriptEntry(store.getState(), transcriptEntryIdFor("turn-live", "agent-live")),
    ).toStrictEqual({
      type: "message",
      id: "agent-live",
      turnId: "turn-live",
      role: "assistant",
      rendering: { mode: "staticMarkdown", source: "Live answer" },
      revision: 0,
    });
    expect(
      selectTranscriptChunk(store.getState(), "turn-live:chunk:0")?.entries.map(({ id }) => id),
    ).toStrictEqual(["user-after-agent"]);
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
      middleEntryCount: 1,
      finalAssistantEntryIds: [],
    });
    expect(
      store.getState().transcriptState.chunksById["turn-started-first:chunk:0"]?.entryIds,
    ).toStrictEqual([
      transcriptEntryIdFor("turn-started-first", "agent-started-first"),
      transcriptEntryIdFor("turn-started-first", "user-after-started"),
    ]);
    expect(
      selectTranscriptChunk(store.getState(), "turn-started-first:chunk:0")?.entries.map(
        ({ id }) => id,
      ),
    ).toStrictEqual(["user-after-started"]);
  });

  it("makes a completed first user item leading without a started middle slot", () => {
    const store = makeStore();

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemStarted(
          eventItemStarted,
          "start-leading-user",
          "turn-started-leading-user",
          userMessage("user-started-leading", [textInput("Prompt")]),
        ),
        replay: "live",
      }),
    );

    expect(selectTranscriptTurn(store.getState(), "turn-started-leading-user")).toStrictEqual({
      id: "turn-started-leading-user",
      status: "inProgress",
      originalFirstItemId: "user-started-leading",
      leadingPromptEntryId: null,
      middleChunkIds: [],
      middleEntryCount: 0,
      finalAssistantEntryIds: [],
    });
    expect(
      selectTranscriptEntry(
        store.getState(),
        transcriptEntryIdFor("turn-started-leading-user", "user-started-leading"),
      ),
    ).toBeNull();
    expect(selectTranscriptChunk(store.getState(), "turn-started-leading-user:chunk:0")).toBeNull();

    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemCompleted(
          eventItemCompleted,
          "complete-leading-user",
          "turn-started-leading-user",
          userMessage("user-started-leading", [textInput("Prompt")]),
        ),
        replay: "live",
      }),
    );

    expect(selectTranscriptTurn(store.getState(), "turn-started-leading-user")).toStrictEqual({
      id: "turn-started-leading-user",
      status: "inProgress",
      originalFirstItemId: "user-started-leading",
      leadingPromptEntryId: transcriptEntryIdFor(
        "turn-started-leading-user",
        "user-started-leading",
      ),
      middleChunkIds: [],
      middleEntryCount: 0,
      finalAssistantEntryIds: [],
    });
    expect(
      selectTranscriptEntry(
        store.getState(),
        transcriptEntryIdFor("turn-started-leading-user", "user-started-leading"),
      ),
    ).toStrictEqual({
      type: "message",
      id: "user-started-leading",
      turnId: "turn-started-leading-user",
      role: "user",
      rendering: { mode: "plainText", source: "Prompt" },
      revision: 0,
    });
    expect(selectTranscriptChunk(store.getState(), "turn-started-leading-user:chunk:0")).toBeNull();
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
      middleChunkIds: [],
      middleEntryCount: 0,
      finalAssistantEntryIds: [
        transcriptEntryIdFor("turn-live-normalized", "agent-live-normalized"),
      ],
    });
    expect(
      selectTranscriptEntry(
        store.getState(),
        transcriptEntryIdFor("turn-live-normalized", "agent-live-normalized"),
      ),
    ).toStrictEqual({
      type: "message",
      id: "agent-live-normalized",
      turnId: "turn-live-normalized",
      role: "assistant",
      rendering: { mode: "staticMarkdown", source: "Live normalized answer" },
      revision: 0,
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
      middleChunkIds: [],
      middleEntryCount: 0,
      finalAssistantEntryIds: [],
    });
  });

  it("updates an existing committed entry and bumps only its chunk revision", () => {
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
    expect(
      selectTranscriptEntry(store.getState(), transcriptEntryIdFor("turn-update", "agent-update")),
    ).toStrictEqual({
      type: "message",
      id: "agent-update",
      turnId: "turn-update",
      role: "assistant",
      rendering: { mode: "staticMarkdown", source: "Second" },
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
          rendering: { mode: "staticMarkdown", source: "Second" },
          revision: 1,
        },
      ],
    });
  });

  it("defensively reclassifies an existing middle entry when a repeated completion changes phase", () => {
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

    expect(
      selectTranscriptEntry(
        store.getState(),
        transcriptEntryIdFor("turn-phase-update", "agent-phase-update"),
      ),
    ).toStrictEqual({
      type: "message",
      id: "agent-phase-update",
      turnId: "turn-phase-update",
      role: "assistant",
      rendering: { mode: "staticMarkdown", source: "Done" },
      revision: 1,
    });
    expect(selectTranscriptTurn(store.getState(), "turn-phase-update")).toStrictEqual({
      id: "turn-phase-update",
      status: "inProgress",
      originalFirstItemId: "agent-phase-update",
      leadingPromptEntryId: null,
      middleChunkIds: [],
      middleEntryCount: 0,
      finalAssistantEntryIds: [transcriptEntryIdFor("turn-phase-update", "agent-phase-update")],
    });
    expect(selectTranscriptChunk(store.getState(), "turn-phase-update:chunk:0")).toBeNull();
    expect(
      store.getState().transcriptState.entriesById[
        transcriptEntryIdFor("turn-phase-update", "agent-phase-update")
      ],
    ).toMatchObject({ type: "message", phase: "final_answer" });
  });

  it("updates an existing final assistant entry without creating a middle chunk", () => {
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
      middleChunkIds: [],
      middleEntryCount: 0,
      finalAssistantEntryIds: [transcriptEntryIdFor("turn-final-update", "agent-final-update")],
    });
    expect(
      selectTranscriptEntry(
        store.getState(),
        transcriptEntryIdFor("turn-final-update", "agent-final-update"),
      ),
    ).toStrictEqual({
      type: "message",
      id: "agent-final-update",
      turnId: "turn-final-update",
      role: "assistant",
      rendering: { mode: "staticMarkdown", source: "Second" },
      revision: 1,
    });
  });

  it("chunks only middle entries after the committed chunk entry limit", () => {
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
      leadingPromptEntryId: transcriptEntryIdFor("turn-middle-chunked", "user-leading-live"),
      middleChunkIds: ["turn-middle-chunked:chunk:0", "turn-middle-chunked:chunk:1"],
      middleEntryCount: TARGET_TRANSCRIPT_CHUNK_ENTRY_LIMIT + 1,
      finalAssistantEntryIds: [transcriptEntryIdFor("turn-middle-chunked", "agent-final-live")],
    });
    expect(
      selectTranscriptChunk(store.getState(), "turn-middle-chunked:chunk:0")?.entries,
    ).toHaveLength(TARGET_TRANSCRIPT_CHUNK_ENTRY_LIMIT);
    expect(
      selectTranscriptChunk(store.getState(), "turn-middle-chunked:chunk:1")?.entries,
    ).toHaveLength(1);
    expect(selectTranscriptChunk(store.getState(), "turn-middle-chunked:chunk:0")).toBe(
      firstChunkAfterLimit,
    );
  });
});
