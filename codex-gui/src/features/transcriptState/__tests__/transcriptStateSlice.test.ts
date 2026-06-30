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
  threadRuntimeManualReconnectRequired,
} from "@/features/threadRuntime/threadRuntimeSlice";
import {
  TARGET_TRANSCRIPT_CHUNK_ENTRY_LIMIT,
  selectCommittedTranscriptScrollCommitKey,
  selectTranscriptChunk,
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
} from "@/features/projection/__tests__/projectionTestBuilders";

describe("transcript state reducer", () => {
  it("registers transcript state in the app store", () => {
    const store = makeStore();

    expect(selectTranscriptTurnIds(store.getState())).toStrictEqual([]);
    expect(selectTranscriptGlobalStatus(store.getState())).toStrictEqual([]);
    expect(selectCommittedTranscriptScrollCommitKey(store.getState())).toBeNull();
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
      leadingPromptEntryId: "user-snapshot",
      middleChunkIds: [],
      middleEntryCount: 0,
      finalAssistantEntryIds: ["agent-snapshot"],
    });
    expect(selectTranscriptEntry(store.getState(), "user-snapshot")).toStrictEqual({
      type: "message",
      id: "user-snapshot",
      turnId: "turn-snapshot",
      role: "user",
      source: "Hello there",
      sourceKind: "plainText",
      phase: null,
      revision: 0,
    });
    expect(selectTranscriptEntry(store.getState(), "agent-snapshot")).toStrictEqual({
      type: "message",
      id: "agent-snapshot",
      turnId: "turn-snapshot",
      role: "assistant",
      source: "**Plain** text",
      sourceKind: "plainText",
      phase: "final_answer",
      revision: 0,
    });
    expect(selectTranscriptGlobalStatus(store.getState())).toStrictEqual([]);
  });

  it("classifies leading prompt, middle entries, and final answers from snapshot entries", () => {
    const store = makeStore();

    store.dispatch(
      threadRuntimeAttached(
        attachWithTurns(attachBaseline, [
          baseTurn("turn-layout", [
            userMessage("user-leading", [textInput("Initial prompt")]),
            agentMessage("agent-commentary", "Working", "commentary"),
            userMessage("user-follow-up", [textInput("Extra input")]),
            agentMessage("agent-legacy", "Legacy assistant", null),
            agentMessage("agent-final", "Final answer", "final_answer"),
          ]),
        ]),
      ),
    );

    expect(selectTranscriptTurn(store.getState(), "turn-layout")).toStrictEqual({
      id: "turn-layout",
      status: "completed",
      leadingPromptEntryId: "user-leading",
      middleChunkIds: ["turn-layout:chunk:0"],
      middleEntryCount: 3,
      finalAssistantEntryIds: ["agent-final"],
    });
    expect(selectTranscriptChunk(store.getState(), "turn-layout:chunk:0")?.entries).toStrictEqual([
      {
        type: "message",
        id: "agent-commentary",
        turnId: "turn-layout",
        role: "assistant",
        source: "Working",
        sourceKind: "plainText",
        phase: "commentary",
        revision: 0,
      },
      {
        type: "message",
        id: "user-follow-up",
        turnId: "turn-layout",
        role: "user",
        source: "Extra input",
        sourceKind: "plainText",
        phase: null,
        revision: 0,
      },
      {
        type: "message",
        id: "agent-legacy",
        turnId: "turn-layout",
        role: "assistant",
        source: "Legacy assistant",
        sourceKind: "plainText",
        phase: null,
        revision: 0,
      },
    ]);
    expect(selectTranscriptEntry(store.getState(), "agent-final")).toStrictEqual({
      type: "message",
      id: "agent-final",
      turnId: "turn-layout",
      role: "assistant",
      source: "Final answer",
      sourceKind: "plainText",
      phase: "final_answer",
      revision: 0,
    });
  });

  it("leaves leading prompt empty when the first visible entry is assistant commentary", () => {
    const store = makeStore();

    store.dispatch(
      threadRuntimeAttached(
        attachWithTurns(attachBaseline, [
          baseTurn("turn-assistant-first", [
            agentMessage("agent-first-commentary", "Working first", "commentary"),
            agentMessage("agent-first-final", "Done", "final_answer"),
          ]),
        ]),
      ),
    );

    expect(selectTranscriptTurn(store.getState(), "turn-assistant-first")).toStrictEqual({
      id: "turn-assistant-first",
      status: "completed",
      leadingPromptEntryId: null,
      middleChunkIds: ["turn-assistant-first:chunk:0"],
      middleEntryCount: 1,
      finalAssistantEntryIds: ["agent-first-final"],
    });
    expect(
      selectTranscriptChunk(store.getState(), "turn-assistant-first:chunk:0")?.entries,
    ).toStrictEqual([
      {
        type: "message",
        id: "agent-first-commentary",
        turnId: "turn-assistant-first",
        role: "assistant",
        source: "Working first",
        sourceKind: "plainText",
        phase: "commentary",
        revision: 0,
      },
    ]);
  });

  it("leaves leading prompt empty when the first visible entry is a final assistant answer", () => {
    const store = makeStore();

    store.dispatch(
      threadRuntimeAttached(
        attachWithTurns(attachBaseline, [
          baseTurn("turn-final-first", [
            agentMessage("agent-final-first", "Final first", "final_answer"),
            userMessage("user-after-final", [textInput("After final")]),
          ]),
        ]),
      ),
    );

    expect(selectTranscriptTurn(store.getState(), "turn-final-first")).toStrictEqual({
      id: "turn-final-first",
      status: "completed",
      leadingPromptEntryId: null,
      middleChunkIds: ["turn-final-first:chunk:0"],
      middleEntryCount: 1,
      finalAssistantEntryIds: ["agent-final-first"],
    });
    expect(
      selectTranscriptChunk(store.getState(), "turn-final-first:chunk:0")?.entries,
    ).toStrictEqual([
      {
        type: "message",
        id: "user-after-final",
        turnId: "turn-final-first",
        role: "user",
        source: "After final",
        sourceKind: "plainText",
        phase: null,
        revision: 0,
      },
    ]);
  });

  it("stores multiple final assistant answers outside middle chunks", () => {
    const store = makeStore();

    store.dispatch(
      threadRuntimeAttached(
        attachWithTurns(attachBaseline, [
          baseTurn("turn-multi-final", [
            userMessage("user-multi-final", [textInput("Prompt")]),
            agentMessage("agent-final-one", "First final", "final_answer"),
            agentMessage("agent-final-two", "Second final", "final_answer"),
          ]),
        ]),
      ),
    );

    expect(selectTranscriptTurn(store.getState(), "turn-multi-final")).toStrictEqual({
      id: "turn-multi-final",
      status: "completed",
      leadingPromptEntryId: "user-multi-final",
      middleChunkIds: [],
      middleEntryCount: 0,
      finalAssistantEntryIds: ["agent-final-one", "agent-final-two"],
    });
  });

  it("preserves assistant message phase in snapshot transcript entries", () => {
    const store = makeStore();

    store.dispatch(
      threadRuntimeAttached(
        attachWithTurns(attachBaseline, [
          baseTurn("turn-phase", [
            agentMessage("agent-commentary", "Working", "commentary"),
            agentMessage("agent-final", "Done", "final_answer"),
          ]),
        ]),
      ),
    );

    expect(selectTranscriptChunk(store.getState(), "turn-phase:chunk:0")?.entries).toStrictEqual([
      {
        type: "message",
        id: "agent-commentary",
        turnId: "turn-phase",
        role: "assistant",
        source: "Working",
        sourceKind: "plainText",
        phase: "commentary",
        revision: 0,
      },
    ]);
    expect(selectTranscriptEntry(store.getState(), "agent-final")).toStrictEqual({
      type: "message",
      id: "agent-final",
      turnId: "turn-phase",
      role: "assistant",
      source: "Done",
      sourceKind: "plainText",
      phase: "final_answer",
      revision: 0,
    });
  });

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
      threadRuntimeEventBuffered(
        itemStarted(
          eventItemStarted,
          "commit-other-started",
          "turn-other",
          agentMessage("agent-other-started", "Started should not affect cached chunk"),
        ),
      ),
    );

    expect(selectTranscriptChunk(store.getState(), "turn-cached:chunk:0")).toBe(firstChunk);

    store.dispatch(
      threadRuntimeEventBuffered(
        itemCompleted(
          eventItemCompleted,
          "commit-other-completed",
          "turn-other",
          agentMessage("agent-other-completed", "Other turn answer"),
        ),
      ),
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
      threadRuntimeEventBuffered(
        itemCompleted(
          eventItemCompleted,
          "commit-cached-append",
          "turn-cached",
          agentMessage("agent-cached-live", "Live answer", "commentary"),
        ),
      ),
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
          sourceKind: "plainText",
          phase: "commentary",
          revision: 0,
        },
        {
          type: "message",
          id: "agent-cached-live",
          turnId: "turn-cached",
          role: "assistant",
          source: "Live answer",
          sourceKind: "plainText",
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
          sourceKind: "plainText",
          phase: "commentary",
          revision: 0,
        },
      ],
    });
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
    expect(selectTranscriptTurn(store.getState(), "turn-filtered")).toStrictEqual({
      id: "turn-filtered",
      status: "completed",
      leadingPromptEntryId: null,
      middleChunkIds: [],
      middleEntryCount: 0,
      finalAssistantEntryIds: [],
    });
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

    expect(selectTranscriptTurn(store.getState(), "turn-existing")).toMatchObject({
      finalAssistantEntryIds: ["agent-existing"],
    });
    expect(selectTranscriptEntry(store.getState(), "agent-existing")).toStrictEqual({
      type: "message",
      id: "agent-existing",
      turnId: "turn-existing",
      role: "assistant",
      source: "Existing answer",
      sourceKind: "plainText",
      phase: "final_answer",
      revision: 0,
    });
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
    expect(selectTranscriptTurn(store.getState(), "turn-after-reconnect")).toMatchObject({
      finalAssistantEntryIds: ["agent-after", "agent-live-after"],
    });
    expect(selectTranscriptGlobalStatus(store.getState())).toStrictEqual([]);
  });
});
