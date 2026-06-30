import { describe, expect, it } from "vitest";
import { makeStore } from "@/app/store";
import {
  attachBaseline,
  attachReplacement,
  eventItemCompleted,
  eventItemStarted,
  eventTurnCompleted,
  eventTurnStarted,
} from "@/features/projection/__tests__/projectionFixtures";
import {
  threadRuntimeAttached,
  threadRuntimeEventBuffered,
} from "@/features/threadRuntime/threadRuntimeSlice";
import {
  TARGET_TRANSCRIPT_CHUNK_ENTRY_LIMIT,
  selectCommittedTranscriptScrollCommitKey,
  selectTranscriptChunk,
  selectTranscriptEntry,
  selectTranscriptTurn,
  selectTranscriptTurnIds,
} from "../transcriptStateSlice";
import {
  agentMessage,
  attachWithTurns,
  baseTurn,
  itemCompleted,
  itemStarted,
  planItem,
  sleepItem,
  textInput,
  turnCompleted,
  turnStarted,
  userMessage,
} from "@/features/projection/__tests__/projectionTestBuilders";

describe("transcript state live events reducer", () => {
  it("preserves assistant message phase in live completed transcript entries", () => {
    const store = makeStore();

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
    store.dispatch(
      threadRuntimeEventBuffered(
        itemCompleted(
          eventItemCompleted,
          "commit-live-commentary",
          "turn-live-phase",
          agentMessage("agent-live-commentary", "Still working", "commentary"),
        ),
      ),
    );

    expect(
      selectTranscriptChunk(store.getState(), "turn-live-phase:chunk:0")?.entries,
    ).toStrictEqual([
      {
        type: "message",
        id: "agent-live-commentary",
        turnId: "turn-live-phase",
        role: "assistant",
        source: "Still working",
        sourceKind: "plainText",
        phase: "commentary",
        revision: 0,
      },
    ]);
  });

  it("sets the committed scroll commit key from accepted attach snapshots", () => {
    const store = makeStore();

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));

    expect(selectCommittedTranscriptScrollCommitKey(store.getState())).toBe(
      `attach:${attachBaseline.snapshot.thread.id}:${attachBaseline.subscriptionId}:none`,
    );

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachReplacement, [])));

    expect(selectCommittedTranscriptScrollCommitKey(store.getState())).toBe(
      `attach:${attachReplacement.snapshot.thread.id}:${attachReplacement.subscriptionId}:${attachReplacement.snapshot.headCommitId ?? "none"}`,
    );
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
      leadingPromptEntryId: null,
      middleChunkIds: [],
      middleEntryCount: 0,
      finalAssistantEntryIds: ["agent-live"],
    });
    expect(selectTranscriptEntry(store.getState(), "agent-live")).toStrictEqual({
      type: "message",
      id: "agent-live",
      turnId: "turn-live",
      role: "assistant",
      source: "Live answer",
      sourceKind: "plainText",
      phase: "final_answer",
      revision: 0,
    });
  });

  it("advances the committed scroll commit key only when live events change committed transcript DOM", () => {
    const store = makeStore();

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
    const attachKey = selectCommittedTranscriptScrollCommitKey(store.getState());

    store.dispatch(
      threadRuntimeEventBuffered(
        itemStarted(
          eventItemStarted,
          "commit-started-no-dom",
          "turn-scroll-key",
          agentMessage("agent-started-no-dom", "Started should be ignored"),
        ),
      ),
    );

    expect(selectCommittedTranscriptScrollCommitKey(store.getState())).toBe(attachKey);

    store.dispatch(
      threadRuntimeEventBuffered(
        itemCompleted(
          eventItemCompleted,
          "commit-filtered-no-dom",
          "turn-scroll-key",
          planItem("hidden-plan"),
        ),
      ),
    );

    expect(selectCommittedTranscriptScrollCommitKey(store.getState())).toBe(attachKey);

    store.dispatch(
      threadRuntimeEventBuffered(
        itemCompleted(
          eventItemCompleted,
          "commit-visible-dom",
          "turn-scroll-key",
          agentMessage("agent-visible-dom", "Visible committed message"),
        ),
      ),
    );

    expect(selectCommittedTranscriptScrollCommitKey(store.getState())).toBe(
      "event:commit-visible-dom",
    );

    store.dispatch(
      threadRuntimeEventBuffered(
        itemCompleted(
          eventItemCompleted,
          "commit-visible-dom",
          "turn-scroll-key",
          agentMessage("agent-duplicate-dom", "Duplicate should be ignored"),
        ),
      ),
    );

    expect(selectCommittedTranscriptScrollCommitKey(store.getState())).toBe(
      "event:commit-visible-dom",
    );
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
    expect(selectTranscriptTurn(store.getState(), "turn-live-filtered")).toStrictEqual({
      id: "turn-live-filtered",
      status: "inProgress",
      leadingPromptEntryId: null,
      middleChunkIds: [],
      middleEntryCount: 0,
      finalAssistantEntryIds: [],
    });
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

    expect(selectTranscriptTurn(store.getState(), "turn-duplicate")).toMatchObject({
      finalAssistantEntryIds: ["agent-first"],
    });
    expect(selectTranscriptEntry(store.getState(), "agent-first")).toStrictEqual({
      type: "message",
      id: "agent-first",
      turnId: "turn-duplicate",
      role: "assistant",
      source: "First",
      sourceKind: "plainText",
      phase: "final_answer",
      revision: 0,
    });
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
          agentMessage("agent-update", "First", "commentary"),
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
          agentMessage("agent-update", "Second", "commentary"),
        ),
      ),
    );

    expect(selectTranscriptTurn(store.getState(), "turn-update")).toStrictEqual({
      id: "turn-update",
      status: "inProgress",
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
      sourceKind: "plainText",
      phase: "commentary",
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
          phase: "commentary",
          revision: 1,
        },
      ],
    });
  });

  it("bumps entry and chunk revisions when an existing middle entry phase changes", () => {
    const store = makeStore();

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
    store.dispatch(
      threadRuntimeEventBuffered(
        itemCompleted(
          eventItemCompleted,
          "commit-phase-first",
          "turn-phase-update",
          agentMessage("agent-phase-update", "Working", "commentary"),
        ),
      ),
    );
    const beforeUpdateChunk = selectTranscriptChunk(store.getState(), "turn-phase-update:chunk:0");

    store.dispatch(
      threadRuntimeEventBuffered(
        itemCompleted(
          eventItemCompleted,
          "commit-phase-second",
          "turn-phase-update",
          agentMessage("agent-phase-update", "Done", "final_answer"),
        ),
      ),
    );

    expect(selectTranscriptEntry(store.getState(), "agent-phase-update")).toStrictEqual({
      type: "message",
      id: "agent-phase-update",
      turnId: "turn-phase-update",
      role: "assistant",
      source: "Done",
      sourceKind: "plainText",
      phase: "final_answer",
      revision: 1,
    });
    expect(selectTranscriptChunk(store.getState(), "turn-phase-update:chunk:0")).toStrictEqual({
      id: "turn-phase-update:chunk:0",
      turnId: "turn-phase-update",
      revision: (beforeUpdateChunk?.revision ?? 0) + 1,
      entries: [
        {
          type: "message",
          id: "agent-phase-update",
          turnId: "turn-phase-update",
          role: "assistant",
          source: "Done",
          sourceKind: "plainText",
          phase: "final_answer",
          revision: 1,
        },
      ],
    });
  });

  it("updates an existing final assistant entry without creating a middle chunk", () => {
    const store = makeStore();

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
    store.dispatch(
      threadRuntimeEventBuffered(
        itemCompleted(
          eventItemCompleted,
          "commit-final-first",
          "turn-final-update",
          agentMessage("agent-final-update", "First", "final_answer"),
        ),
      ),
    );
    store.dispatch(
      threadRuntimeEventBuffered(
        itemCompleted(
          eventItemCompleted,
          "commit-final-second",
          "turn-final-update",
          agentMessage("agent-final-update", "Second", "final_answer"),
        ),
      ),
    );

    expect(selectTranscriptTurn(store.getState(), "turn-final-update")).toStrictEqual({
      id: "turn-final-update",
      status: "inProgress",
      leadingPromptEntryId: null,
      middleChunkIds: [],
      middleEntryCount: 0,
      finalAssistantEntryIds: ["agent-final-update"],
    });
    expect(selectTranscriptEntry(store.getState(), "agent-final-update")).toStrictEqual({
      type: "message",
      id: "agent-final-update",
      turnId: "turn-final-update",
      role: "assistant",
      source: "Second",
      sourceKind: "plainText",
      phase: "final_answer",
      revision: 1,
    });
  });

  it("chunks only middle entries after the committed chunk entry limit", () => {
    const store = makeStore();

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
    store.dispatch(
      threadRuntimeEventBuffered(
        itemCompleted(
          eventItemCompleted,
          "commit-leading",
          "turn-middle-chunked",
          userMessage("user-leading-live", [textInput("Prompt")]),
        ),
      ),
    );
    let firstChunkAfterLimit: ReturnType<typeof selectTranscriptChunk> | null = null;

    for (let index = 0; index <= TARGET_TRANSCRIPT_CHUNK_ENTRY_LIMIT; index += 1) {
      store.dispatch(
        threadRuntimeEventBuffered(
          itemCompleted(
            eventItemCompleted,
            `commit-middle-${String(index)}`,
            "turn-middle-chunked",
            agentMessage(`agent-middle-${String(index)}`, `Middle ${String(index)}`, "commentary"),
          ),
        ),
      );

      if (index === TARGET_TRANSCRIPT_CHUNK_ENTRY_LIMIT - 1) {
        firstChunkAfterLimit = selectTranscriptChunk(
          store.getState(),
          "turn-middle-chunked:chunk:0",
        );
      }
    }
    store.dispatch(
      threadRuntimeEventBuffered(
        itemCompleted(
          eventItemCompleted,
          "commit-final",
          "turn-middle-chunked",
          agentMessage("agent-final-live", "Final", "final_answer"),
        ),
      ),
    );

    expect(selectTranscriptTurn(store.getState(), "turn-middle-chunked")).toStrictEqual({
      id: "turn-middle-chunked",
      status: "inProgress",
      leadingPromptEntryId: "user-leading-live",
      middleChunkIds: ["turn-middle-chunked:chunk:0", "turn-middle-chunked:chunk:1"],
      middleEntryCount: TARGET_TRANSCRIPT_CHUNK_ENTRY_LIMIT + 1,
      finalAssistantEntryIds: ["agent-final-live"],
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
