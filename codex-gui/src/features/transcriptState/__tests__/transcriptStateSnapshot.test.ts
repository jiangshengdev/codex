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
} from "../transcriptStateSlice";
import {
  agentMessage,
  attachWithTurns,
  baseTurn,
  imageInput,
  planItem,
  sleepItem,
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
});
