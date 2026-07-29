import { describe, expect, it } from "vitest";
import { makeStore } from "@/app/store";
import { attachBaseline } from "@/features/projection/__tests__/projectionFixtures";
import {
  agentMessage,
  attachWithTurns,
  baseTurn,
  planItem,
  textInput,
  userMessage,
} from "@/features/projection/__tests__/projectionTestBuilders";
import { threadRuntimeAttached } from "@/features/threadRuntime/threadRuntimeSlice";
import {
  TARGET_TRANSCRIPT_CHUNK_ENTRY_LIMIT,
  selectTranscriptChunk,
  selectTranscriptMessageOrderChunk,
  selectTranscriptTurn,
} from "../transcriptStateSlice";

describe("transcript state message order", () => {
  it("records message identities in original snapshot order without using visibility as order truth", () => {
    const store = makeStore();

    store.dispatch(
      threadRuntimeAttached(
        attachWithTurns(attachBaseline, [
          baseTurn("turn-message-order", [
            planItem("plan-original-first"),
            userMessage("user-after-plan", [textInput("Follow-up")]),
            agentMessage("agent-commentary", "Working", "commentary"),
            userMessage("user-empty", [textInput("")]),
            agentMessage("agent-legacy", "Legacy", null),
            agentMessage("agent-final", "Done", "final_answer"),
          ]),
        ]),
      ),
    );

    expect(selectTranscriptTurn(store.getState(), "turn-message-order")).toStrictEqual({
      id: "turn-message-order",
      status: "completed",
      originalFirstItemId: "plan-original-first",
      leadingPromptEntryId: null,
      messageOrderChunkIds: ["turn-message-order:message-order:chunk:0"],
      middleChunkIds: ["turn-message-order:chunk:0"],
      middleEntryCount: 3,
      finalAssistantEntryIds: ["agent-final"],
    });
    expect(
      selectTranscriptMessageOrderChunk(
        store.getState(),
        "turn-message-order:message-order:chunk:0",
      ),
    ).toStrictEqual({
      id: "turn-message-order:message-order:chunk:0",
      turnId: "turn-message-order",
      revision: 0,
      itemIds: ["user-after-plan", "agent-commentary", "user-empty", "agent-legacy", "agent-final"],
    });
    expect(
      selectTranscriptChunk(store.getState(), "turn-message-order:chunk:0")?.entries,
    ).toStrictEqual([
      {
        type: "message",
        id: "user-after-plan",
        turnId: "turn-message-order",
        role: "user",
        source: "Follow-up",
        sourceKind: "plainText",
        phase: null,
        revision: 0,
      },
      {
        type: "message",
        id: "agent-commentary",
        turnId: "turn-message-order",
        role: "assistant",
        source: "Working",
        sourceKind: "markdown",
        phase: "commentary",
        revision: 0,
      },
      {
        type: "message",
        id: "agent-legacy",
        turnId: "turn-message-order",
        role: "assistant",
        source: "Legacy",
        sourceKind: "markdown",
        phase: null,
        revision: 0,
      },
    ]);
  });

  it("keys message-order membership by both turn and item identity", () => {
    const store = makeStore();

    store.dispatch(
      threadRuntimeAttached(
        attachWithTurns(attachBaseline, [
          baseTurn("turn-shared-a", [agentMessage("shared-message", "A", "commentary")]),
          baseTurn("turn-shared-b", [agentMessage("shared-message", "B", "commentary")]),
        ]),
      ),
    );

    expect(
      selectTranscriptMessageOrderChunk(store.getState(), "turn-shared-a:message-order:chunk:0"),
    ).toStrictEqual({
      id: "turn-shared-a:message-order:chunk:0",
      turnId: "turn-shared-a",
      revision: 0,
      itemIds: ["shared-message"],
    });
    expect(
      selectTranscriptMessageOrderChunk(store.getState(), "turn-shared-b:message-order:chunk:0"),
    ).toStrictEqual({
      id: "turn-shared-b:message-order:chunk:0",
      turnId: "turn-shared-b",
      revision: 0,
      itemIds: ["shared-message"],
    });
  });

  it("keeps message-order identity chunks bounded at 100 items", () => {
    const store = makeStore();
    const items = Array.from({ length: TARGET_TRANSCRIPT_CHUNK_ENTRY_LIMIT + 1 }, (_, index) =>
      agentMessage(`agent-order-${String(index)}`, `Message ${String(index)}`, "commentary"),
    );

    store.dispatch(
      threadRuntimeAttached(
        attachWithTurns(attachBaseline, [baseTurn("turn-order-chunked", items)]),
      ),
    );

    expect(selectTranscriptTurn(store.getState(), "turn-order-chunked")).toStrictEqual({
      id: "turn-order-chunked",
      status: "completed",
      originalFirstItemId: "agent-order-0",
      leadingPromptEntryId: null,
      messageOrderChunkIds: [
        "turn-order-chunked:message-order:chunk:0",
        "turn-order-chunked:message-order:chunk:1",
      ],
      middleChunkIds: ["turn-order-chunked:chunk:0", "turn-order-chunked:chunk:1"],
      middleEntryCount: TARGET_TRANSCRIPT_CHUNK_ENTRY_LIMIT + 1,
      finalAssistantEntryIds: [],
    });
    expect(
      selectTranscriptMessageOrderChunk(
        store.getState(),
        "turn-order-chunked:message-order:chunk:0",
      )?.itemIds,
    ).toStrictEqual(items.slice(0, TARGET_TRANSCRIPT_CHUNK_ENTRY_LIMIT).map((item) => item.id));
    expect(
      selectTranscriptMessageOrderChunk(
        store.getState(),
        "turn-order-chunked:message-order:chunk:1",
      ),
    ).toStrictEqual({
      id: "turn-order-chunked:message-order:chunk:1",
      turnId: "turn-order-chunked",
      revision: 0,
      itemIds: [`agent-order-${String(TARGET_TRANSCRIPT_CHUNK_ENTRY_LIMIT)}`],
    });
  });
});
