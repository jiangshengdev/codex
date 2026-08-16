import { describe, expect, it } from "vitest";
import { makeStore } from "@/app/store";
import { attachBaseline } from "@/features/projection/__tests__/projectionFixtures";
import { threadRuntimeAttached } from "@/features/threadRuntime/threadRuntimeSlice";
import {
  selectCommittedTranscriptScrollCommitKey,
  selectTranscriptChunk,
  selectTranscriptEntry,
  selectTranscriptGlobalStatus,
  selectTranscriptTurn,
  selectTranscriptTurnIds,
  transcriptEntryIdFor,
} from "../transcriptStateSlice";
import { buildTranscriptStateFromTurns } from "../transcriptStateImplementation";
import {
  agentMessage,
  audioInput,
  attachWithTurns,
  baseTurn,
  collabAgentState,
  collabAgentToolCall,
  failedTurn,
  imageInput,
  localAudioInput,
  planItem,
  reasoningItem,
  sleepItem,
  subAgentActivity,
  textInput,
  userMessage,
} from "@/features/projection/__tests__/projectionTestBuilders";

describe("transcript state snapshot reducer", () => {
  it("registers transcript state in the app store", () => {
    const store = makeStore();

    expect(selectTranscriptTurnIds(store.getState())).toStrictEqual([]);
    expect(selectTranscriptGlobalStatus(store.getState())).toStrictEqual([]);
    expect(selectCommittedTranscriptScrollCommitKey(store.getState())).toBeNull();
  });

  it("builds an isolated transcript state before live attach metadata is applied", () => {
    const turnId = "turn-isolated-snapshot";
    const userEntryId = transcriptEntryIdFor(turnId, "user-isolated-snapshot");
    const agentEntryId = transcriptEntryIdFor(turnId, "agent-isolated-snapshot");
    const fragmentId = JSON.stringify(["context-page:1", turnId, 0]);
    const turns = [
      baseTurn(turnId, [
        userMessage("user-isolated-snapshot", [textInput("Question")]),
        agentMessage("agent-isolated-snapshot", "Answer"),
      ]),
    ];

    const transcriptState = buildTranscriptStateFromTurns(turns);

    expect(transcriptState).toStrictEqual({
      threadId: null,
      subscriptionId: null,
      committedScrollCommitKey: null,
      liveScrollPulse: 0,
      turnIds: [turnId],
      turnsById: {
        [turnId]: {
          id: turnId,
          status: "completed",
          originalFirstItemId: "user-isolated-snapshot",
          leadingPromptEntryId: userEntryId,
          middleChunkIds: [],
          middleEntryCount: 0,
          finalAssistantEntryIds: [agentEntryId],
        },
      },
      chunksById: {},
      entriesById: {
        [userEntryId]: {
          type: "message",
          id: "user-isolated-snapshot",
          turnId,
          role: "user",
          source: "Question",
          sourceKind: "plainText",
          phase: null,
          revision: 0,
        },
        [agentEntryId]: {
          type: "message",
          id: "agent-isolated-snapshot",
          turnId,
          role: "assistant",
          source: "Answer",
          sourceKind: "markdown",
          phase: "final_answer",
          revision: 0,
        },
      },
      entryChunkById: {},
      contextPageIds: ["context-page:1"],
      contextPagesById: {
        "context-page:1": {
          id: "context-page:1",
          leadingBoundaryId: null,
          turnFragmentIds: [fragmentId],
        },
      },
      turnFragmentsById: {
        [fragmentId]: {
          id: fragmentId,
          turnId,
          leadingPromptEntryId: userEntryId,
          middleChunkIds: [],
          middleEntryCount: 0,
          finalAssistantEntryIds: [agentEntryId],
        },
      },
      entryFragmentById: {
        [userEntryId]: fragmentId,
        [agentEntryId]: fragmentId,
      },
      chunkFragmentById: {},
      contextBoundaryIdsById: {},
      globalStatus: [],
      appliedEventIdsById: {},
      appliedEventOrder: [],
    });

    const attach = attachWithTurns(attachBaseline, turns);
    const store = makeStore();
    store.dispatch(threadRuntimeAttached(attach));

    expect(store.getState().transcriptState).toStrictEqual({
      ...transcriptState,
      threadId: attach.snapshot.thread.id,
      subscriptionId: attach.subscriptionId,
      committedScrollCommitKey: `attach:${attach.snapshot.thread.id}:${attach.subscriptionId}:${attach.snapshot.headCommitId ?? "none"}`,
    });
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
        reasoningItem("reasoning-snapshot", [" **First** ", " ", "\nSecond\n"], ["raw reasoning"]),
      ]),
    ]);
    const store = makeStore();

    store.dispatch(threadRuntimeAttached(attachWithChat));

    expect(selectTranscriptTurnIds(store.getState())).toStrictEqual(["turn-snapshot"]);
    expect(selectTranscriptTurn(store.getState(), "turn-snapshot")).toStrictEqual({
      id: "turn-snapshot",
      status: "completed",
      originalFirstItemId: "user-snapshot",
      leadingPromptEntryId: transcriptEntryIdFor("turn-snapshot", "user-snapshot"),
      middleChunkIds: ["turn-snapshot:chunk:0"],
      middleEntryCount: 1,
      finalAssistantEntryIds: [transcriptEntryIdFor("turn-snapshot", "agent-snapshot")],
    });
    expect(
      selectTranscriptEntry(
        store.getState(),
        transcriptEntryIdFor("turn-snapshot", "user-snapshot"),
      ),
    ).toStrictEqual({
      type: "message",
      id: "user-snapshot",
      turnId: "turn-snapshot",
      role: "user",
      rendering: { mode: "plainText", source: "Hello there" },
      revision: 0,
    });
    expect(
      selectTranscriptEntry(
        store.getState(),
        transcriptEntryIdFor("turn-snapshot", "agent-snapshot"),
      ),
    ).toStrictEqual({
      type: "message",
      id: "agent-snapshot",
      turnId: "turn-snapshot",
      role: "assistant",
      rendering: { mode: "staticMarkdown", source: "**Plain** text" },
      revision: 0,
    });
    const reasoningEntryId = transcriptEntryIdFor("turn-snapshot", "reasoning-snapshot");
    expect({
      stored: store.getState().transcriptState.entriesById[reasoningEntryId],
      views: selectTranscriptChunk(store.getState(), "turn-snapshot:chunk:0")?.entries,
    }).toStrictEqual({
      stored: {
        type: "reasoning",
        id: "reasoning-snapshot",
        turnId: "turn-snapshot",
        lifecycle: "completed",
        summaryParts: ["**First**", "Second"],
        revision: 0,
      },
      views: [
        {
          type: "reasoning",
          id: "reasoning-snapshot",
          turnId: "turn-snapshot",
          lifecycle: "completed",
          source: "**First**\n\nSecond",
          revision: 0,
        },
      ],
    });
    expect(selectTranscriptGlobalStatus(store.getState())).toStrictEqual([]);
  });

  it("restores the complete failed turn error without adding a transcript entry", () => {
    const error = {
      message:
        "unexpected status 403 Forbidden: token quota is not enough\n(request id: request-snapshot), url: https://shapi.vip/v1/responses",
      codexErrorInfo: { responseTooManyFailedAttempts: { httpStatusCode: 403 } },
      additionalDetails: "provider quota exhausted",
    } satisfies NonNullable<ReturnType<typeof failedTurn>["error"]>;
    const turn = failedTurn("turn-failed-snapshot", error);
    const store = makeStore();

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [turn])));

    const transcriptTurn = selectTranscriptTurn(store.getState(), turn.id);
    expect(transcriptTurn).toStrictEqual({
      id: turn.id,
      status: "failed",
      error,
      originalFirstItemId: null,
      leadingPromptEntryId: null,
      middleChunkIds: [],
      middleEntryCount: 0,
      finalAssistantEntryIds: [],
    });
    expect(store.getState().transcriptState.entriesById).toStrictEqual({});
    expect(store.getState().transcriptState.chunksById).toStrictEqual({});
    const fragmentId = JSON.stringify(["context-page:1", turn.id, 0]);
    expect({
      contextPageIds: store.getState().transcriptState.contextPageIds,
      contextPagesById: store.getState().transcriptState.contextPagesById,
      turnFragmentsById: store.getState().transcriptState.turnFragmentsById,
    }).toStrictEqual({
      contextPageIds: ["context-page:1"],
      contextPagesById: {
        "context-page:1": {
          id: "context-page:1",
          leadingBoundaryId: null,
          turnFragmentIds: [fragmentId],
        },
      },
      turnFragmentsById: {
        [fragmentId]: {
          id: fragmentId,
          turnId: turn.id,
          leadingPromptEntryId: null,
          middleChunkIds: [],
          middleEntryCount: 0,
          finalAssistantEntryIds: [],
        },
      },
    });
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
      originalFirstItemId: "user-leading",
      leadingPromptEntryId: transcriptEntryIdFor("turn-layout", "user-leading"),
      middleChunkIds: ["turn-layout:chunk:0"],
      middleEntryCount: 3,
      finalAssistantEntryIds: [transcriptEntryIdFor("turn-layout", "agent-final")],
    });
    expect(selectTranscriptChunk(store.getState(), "turn-layout:chunk:0")?.entries).toStrictEqual([
      {
        type: "message",
        id: "agent-commentary",
        turnId: "turn-layout",
        role: "assistant",
        rendering: { mode: "staticMarkdown", source: "Working" },
        revision: 0,
      },
      {
        type: "message",
        id: "user-follow-up",
        turnId: "turn-layout",
        role: "user",
        rendering: { mode: "plainText", source: "Extra input" },
        revision: 0,
      },
      {
        type: "message",
        id: "agent-legacy",
        turnId: "turn-layout",
        role: "assistant",
        rendering: { mode: "staticMarkdown", source: "Legacy assistant" },
        revision: 0,
      },
    ]);
    expect(
      selectTranscriptEntry(store.getState(), transcriptEntryIdFor("turn-layout", "agent-final")),
    ).toStrictEqual({
      type: "message",
      id: "agent-final",
      turnId: "turn-layout",
      role: "assistant",
      rendering: { mode: "staticMarkdown", source: "Final answer" },
      revision: 0,
    });
  });

  it("keeps completed sub-agent activities in snapshot middle order", () => {
    const store = makeStore();

    store.dispatch(
      threadRuntimeAttached(
        attachWithTurns(attachBaseline, [
          baseTurn("turn-sub-agent-activity-snapshot", [
            userMessage("user-sub-agent-activity-snapshot", [textInput("Initial prompt")]),
            subAgentActivity("activity-sub-agent-started-snapshot", "started", "agents/researcher"),
            agentMessage("agent-sub-agent-commentary-snapshot", "Still working", "commentary"),
            subAgentActivity(
              "activity-sub-agent-interacted-snapshot",
              "interacted",
              "agents/reviewer",
            ),
            agentMessage("agent-sub-agent-final-snapshot", "Final answer", "final_answer"),
          ]),
        ]),
      ),
    );

    expect(
      selectTranscriptTurn(store.getState(), "turn-sub-agent-activity-snapshot"),
    ).toStrictEqual({
      id: "turn-sub-agent-activity-snapshot",
      status: "completed",
      originalFirstItemId: "user-sub-agent-activity-snapshot",
      leadingPromptEntryId: transcriptEntryIdFor(
        "turn-sub-agent-activity-snapshot",
        "user-sub-agent-activity-snapshot",
      ),
      middleChunkIds: ["turn-sub-agent-activity-snapshot:chunk:0"],
      middleEntryCount: 3,
      finalAssistantEntryIds: [
        transcriptEntryIdFor("turn-sub-agent-activity-snapshot", "agent-sub-agent-final-snapshot"),
      ],
    });
    expect(
      selectTranscriptChunk(store.getState(), "turn-sub-agent-activity-snapshot:chunk:0")?.entries,
    ).toStrictEqual([
      {
        type: "subAgentActivity",
        id: "activity-sub-agent-started-snapshot",
        turnId: "turn-sub-agent-activity-snapshot",
        title: { kind: "agentStarted", agentPath: "agents/researcher" },
        details: [],
        revision: 0,
      },
      {
        type: "message",
        id: "agent-sub-agent-commentary-snapshot",
        turnId: "turn-sub-agent-activity-snapshot",
        role: "assistant",
        rendering: { mode: "staticMarkdown", source: "Still working" },
        revision: 0,
      },
      {
        type: "subAgentActivity",
        id: "activity-sub-agent-interacted-snapshot",
        turnId: "turn-sub-agent-activity-snapshot",
        title: { kind: "agentInteracted", agentPath: "agents/reviewer" },
        details: [],
        revision: 0,
      },
    ]);
  });

  it("keeps terminal collab activities in snapshot middle order", () => {
    const store = makeStore();
    const turnId = "turn-collab-snapshot";

    store.dispatch(
      threadRuntimeAttached(
        attachWithTurns(attachBaseline, [
          baseTurn(turnId, [
            userMessage("user-collab-snapshot", [textInput("Delegate work")]),
            collabAgentToolCall("collab-spawn-snapshot", "spawnAgent", "completed", {
              receiverThreadIds: ["agent-builder"],
              prompt: "Build the feature",
            }),
            agentMessage("agent-collab-commentary", "Coordinating", "commentary"),
            collabAgentToolCall("collab-wait-snapshot", "wait", "failed", {
              receiverThreadIds: ["agent-builder"],
              agentsStates: { "agent-builder": collabAgentState("completed", "Built") },
            }),
            agentMessage("agent-collab-final", "Done", "final_answer"),
          ]),
        ]),
      ),
    );

    expect(selectTranscriptTurn(store.getState(), turnId)).toMatchObject({
      leadingPromptEntryId: transcriptEntryIdFor(turnId, "user-collab-snapshot"),
      middleChunkIds: [`${turnId}:chunk:0`],
      middleEntryCount: 3,
      finalAssistantEntryIds: [transcriptEntryIdFor(turnId, "agent-collab-final")],
    });
    const entries = selectTranscriptChunk(store.getState(), `${turnId}:chunk:0`)?.entries;
    expect(entries?.map(({ id }) => id)).toStrictEqual([
      "collab-spawn-snapshot",
      "agent-collab-commentary",
      "collab-wait-snapshot",
    ]);
    expect(entries?.[0]).toStrictEqual({
      type: "collabAgent",
      id: "collab-spawn-snapshot",
      turnId,
      title: {
        kind: "agentSpawned",
        receiver: "agent-builder",
        model: null,
        reasoningEffort: null,
      },
      details: [{ kind: "raw", text: "Build the feature" }],
      revision: 0,
    });
    expect(entries?.[2]).toStrictEqual({
      type: "collabAgent",
      id: "collab-wait-snapshot",
      turnId,
      title: { kind: "agentsFinishedWaiting" },
      details: [
        {
          kind: "copy",
          copy: {
            kind: "agentState",
            threadId: "agent-builder",
            status: "completed",
            messagePreview: "Built",
          },
        },
      ],
      revision: 0,
    });
  });

  it("keeps an activity-first turn out of leading and final placement", () => {
    const store = makeStore();
    const turnId = "turn-activity-first-snapshot";

    store.dispatch(
      threadRuntimeAttached(
        attachWithTurns(attachBaseline, [
          baseTurn(turnId, [
            collabAgentToolCall("collab-first-snapshot", "wait", "completed"),
            userMessage("user-after-activity-snapshot", [textInput("Later prompt")]),
            agentMessage("agent-after-activity-final", "Done", "final_answer"),
          ]),
        ]),
      ),
    );

    expect(selectTranscriptTurn(store.getState(), turnId)).toMatchObject({
      originalFirstItemId: "collab-first-snapshot",
      leadingPromptEntryId: null,
      middleChunkIds: [`${turnId}:chunk:0`],
      middleEntryCount: 2,
      finalAssistantEntryIds: [transcriptEntryIdFor(turnId, "agent-after-activity-final")],
    });
    expect(
      selectTranscriptChunk(store.getState(), `${turnId}:chunk:0`)?.entries.map(({ id }) => id),
    ).toStrictEqual(["collab-first-snapshot", "user-after-activity-snapshot"]);
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
      originalFirstItemId: "agent-first-commentary",
      leadingPromptEntryId: null,
      middleChunkIds: ["turn-assistant-first:chunk:0"],
      middleEntryCount: 1,
      finalAssistantEntryIds: [transcriptEntryIdFor("turn-assistant-first", "agent-first-final")],
    });
    expect(
      selectTranscriptChunk(store.getState(), "turn-assistant-first:chunk:0")?.entries,
    ).toStrictEqual([
      {
        type: "message",
        id: "agent-first-commentary",
        turnId: "turn-assistant-first",
        role: "assistant",
        rendering: { mode: "staticMarkdown", source: "Working first" },
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
      originalFirstItemId: "agent-final-first",
      leadingPromptEntryId: null,
      middleChunkIds: ["turn-final-first:chunk:0"],
      middleEntryCount: 1,
      finalAssistantEntryIds: [transcriptEntryIdFor("turn-final-first", "agent-final-first")],
    });
    expect(
      selectTranscriptChunk(store.getState(), "turn-final-first:chunk:0")?.entries,
    ).toStrictEqual([
      {
        type: "message",
        id: "user-after-final",
        turnId: "turn-final-first",
        role: "user",
        rendering: { mode: "plainText", source: "After final" },
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
      originalFirstItemId: "user-multi-final",
      leadingPromptEntryId: transcriptEntryIdFor("turn-multi-final", "user-multi-final"),
      middleChunkIds: [],
      middleEntryCount: 0,
      finalAssistantEntryIds: [
        transcriptEntryIdFor("turn-multi-final", "agent-final-one"),
        transcriptEntryIdFor("turn-multi-final", "agent-final-two"),
      ],
    });
  });

  it("preserves assistant message phase in stored snapshot entries while projecting views", () => {
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
        rendering: { mode: "staticMarkdown", source: "Working" },
        revision: 0,
      },
    ]);
    expect(
      selectTranscriptEntry(store.getState(), transcriptEntryIdFor("turn-phase", "agent-final")),
    ).toStrictEqual({
      type: "message",
      id: "agent-final",
      turnId: "turn-phase",
      role: "assistant",
      rendering: { mode: "staticMarkdown", source: "Done" },
      revision: 0,
    });
    expect(
      store.getState().transcriptState.entriesById[
        transcriptEntryIdFor("turn-phase", "agent-commentary")
      ],
    ).toMatchObject({ type: "message", phase: "commentary" });
    expect(
      store.getState().transcriptState.entriesById[
        transcriptEntryIdFor("turn-phase", "agent-final")
      ],
    ).toMatchObject({ type: "message", phase: "final_answer" });
  });

  it("filters empty text, non-text user inputs, and non-chat snapshot items", () => {
    const store = makeStore();

    store.dispatch(
      threadRuntimeAttached(
        attachWithTurns(attachBaseline, [
          baseTurn("turn-filtered", [
            userMessage("image-only", [imageInput("https://example.invalid/image.png")]),
            userMessage("audio-only", [audioInput("https://example.invalid/audio.mp3")]),
            userMessage("local-audio-only", [localAudioInput("/tmp/audio.mp3")]),
            userMessage("empty-user", [textInput("")]),
            agentMessage("empty-agent", ""),
            planItem("hidden-plan"),
            sleepItem("hidden-sleep"),
            userMessage("visible-later", [textInput("Visible later")]),
          ]),
        ]),
      ),
    );

    expect(selectTranscriptTurnIds(store.getState())).toStrictEqual(["turn-filtered"]);
    expect(selectTranscriptTurn(store.getState(), "turn-filtered")).toStrictEqual({
      id: "turn-filtered",
      status: "completed",
      originalFirstItemId: "image-only",
      leadingPromptEntryId: null,
      middleChunkIds: ["turn-filtered:chunk:0"],
      middleEntryCount: 1,
      finalAssistantEntryIds: [],
    });
  });
});
