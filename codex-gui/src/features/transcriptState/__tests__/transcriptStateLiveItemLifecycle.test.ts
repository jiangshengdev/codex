import { describe, expect, it } from "vitest";
import { makeStore } from "@/app/store";
import {
  attachBaseline,
  eventItemCompleted,
  eventItemStarted,
} from "@/features/projection/__tests__/projectionFixtures";
import {
  agentMessage,
  attachWithTurns,
  itemCompleted,
  itemStarted,
} from "@/features/projection/__tests__/projectionTestBuilders";
import {
  threadRuntimeAttached,
  threadRuntimeEventBuffered,
} from "@/features/threadRuntime/threadRuntimeSlice";
import {
  selectCommittedTranscriptScrollCommitKey,
  selectTranscriptChunk,
  selectTranscriptEntry,
  selectTranscriptTurn,
  transcriptEntryIdFor,
} from "../transcriptStateSlice";

describe("transcript state live item lifecycle reducer", () => {
  it("keeps itemStarted slot order stable and ignores duplicate live slot insertion", () => {
    const store = makeStore();

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
    const firstItem = agentMessage("agent-slot-first", "First");
    const secondItem = agentMessage("agent-slot-second", "Second");

    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemStarted(
          eventItemStarted,
          "commit-slot-first",
          "turn-slot-order",
          firstItem,
        ),
        replay: "live",
      }),
    );
    const beforeDuplicateState = store.getState().transcriptState;

    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemStarted(
          eventItemStarted,
          "commit-slot-first-duplicate-id",
          "turn-slot-order",
          agentMessage("agent-slot-first", "Updated initial"),
        ),
        replay: "live",
      }),
    );

    expect(store.getState().transcriptState).toBe(beforeDuplicateState);

    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemStarted(
          eventItemStarted,
          "commit-slot-second",
          "turn-slot-order",
          secondItem,
        ),
        replay: "live",
      }),
    );

    expect(selectTranscriptTurn(store.getState(), "turn-slot-order")).toStrictEqual({
      id: "turn-slot-order",
      status: "inProgress",
      originalFirstItemId: "agent-slot-first",
      leadingPromptEntryId: null,
      middleChunkIds: ["turn-slot-order:chunk:0"],
      middleEntryCount: 2,
      finalAssistantEntryIds: [],
    });
    expect(
      selectTranscriptChunk(store.getState(), "turn-slot-order:chunk:0")?.entries.map(
        ({ id }) => id,
      ),
    ).toStrictEqual(["agent-slot-first", "agent-slot-second"]);
    expect(
      selectTranscriptEntry(
        store.getState(),
        transcriptEntryIdFor("turn-slot-order", "agent-slot-first"),
      ),
    ).toStrictEqual({
      type: "live",
      id: "agent-slot-first",
      key: transcriptEntryIdFor("turn-slot-order", "agent-slot-first"),
      turnId: "turn-slot-order",
      itemId: "agent-slot-first",
      status: "started",
      initialItem: firstItem,
      transientText: "",
      revision: 0,
    });
  });

  it("removes the live item after committing the completed agent message", () => {
    const store = makeStore();

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
    const initialItem = agentMessage("agent-settled", "");
    const completedItem = agentMessage("agent-settled", "Completed answer", "final_answer");

    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemStarted(
          eventItemStarted,
          "commit-settled-started",
          "turn-settled",
          initialItem,
        ),
        replay: "live",
      }),
    );
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemCompleted(
          eventItemCompleted,
          "commit-settled-completed",
          "turn-settled",
          completedItem,
        ),
        replay: "live",
      }),
    );

    expect(
      selectTranscriptEntry(
        store.getState(),
        transcriptEntryIdFor("turn-settled", "agent-settled"),
      ),
    ).toStrictEqual({
      type: "message",
      id: "agent-settled",
      turnId: "turn-settled",
      role: "assistant",
      source: "Completed answer",
      sourceKind: "markdown",
      phase: "final_answer",
      revision: 1,
    });
    expect(selectTranscriptTurn(store.getState(), "turn-settled")).toStrictEqual({
      id: "turn-settled",
      status: "inProgress",
      originalFirstItemId: "agent-settled",
      leadingPromptEntryId: null,
      middleChunkIds: [],
      middleEntryCount: 0,
      finalAssistantEntryIds: [transcriptEntryIdFor("turn-settled", "agent-settled")],
    });
    expect(selectTranscriptChunk(store.getState(), "turn-settled:chunk:0")).toBeNull();
  });

  it("keeps the later live item addressable after removing an earlier live item", () => {
    const store = makeStore();

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
    const firstItem = agentMessage("agent-remove-first", "");
    const secondItem = agentMessage("agent-remove-second", "Still live");
    const completedFirstItem = agentMessage(
      "agent-remove-first",
      "Completed first",
      "final_answer",
    );

    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemStarted(
          eventItemStarted,
          "commit-remove-first-started",
          "turn-remove-first",
          firstItem,
        ),
        replay: "live",
      }),
    );
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemStarted(
          eventItemStarted,
          "commit-remove-second-started",
          "turn-remove-first",
          secondItem,
        ),
        replay: "live",
      }),
    );
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemCompleted(
          eventItemCompleted,
          "commit-remove-first-completed",
          "turn-remove-first",
          completedFirstItem,
        ),
        replay: "live",
      }),
    );

    expect(
      selectTranscriptEntry(
        store.getState(),
        transcriptEntryIdFor("turn-remove-first", "agent-remove-first"),
      ),
    ).toStrictEqual({
      type: "message",
      id: "agent-remove-first",
      turnId: "turn-remove-first",
      role: "assistant",
      source: "Completed first",
      sourceKind: "markdown",
      phase: "final_answer",
      revision: 1,
    });
    expect(
      selectTranscriptEntry(
        store.getState(),
        transcriptEntryIdFor("turn-remove-first", "agent-remove-second"),
      ),
    ).toStrictEqual({
      type: "live",
      id: "agent-remove-second",
      key: transcriptEntryIdFor("turn-remove-first", "agent-remove-second"),
      turnId: "turn-remove-first",
      itemId: "agent-remove-second",
      status: "started",
      initialItem: secondItem,
      transientText: "",
      revision: 0,
    });
    expect(selectTranscriptTurn(store.getState(), "turn-remove-first")).toStrictEqual({
      id: "turn-remove-first",
      status: "inProgress",
      originalFirstItemId: "agent-remove-first",
      leadingPromptEntryId: null,
      middleChunkIds: ["turn-remove-first:chunk:0"],
      middleEntryCount: 1,
      finalAssistantEntryIds: [transcriptEntryIdFor("turn-remove-first", "agent-remove-first")],
    });
    expect(
      selectTranscriptChunk(store.getState(), "turn-remove-first:chunk:0")?.entries.map(
        ({ id }) => id,
      ),
    ).toStrictEqual(["agent-remove-second"]);
  });

  it("does not create a live slot when itemCompleted arrives without itemStarted", () => {
    const store = makeStore();

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemCompleted(
          eventItemCompleted,
          "commit-missing-slot-completed",
          "turn-missing-slot-completed",
          agentMessage("agent-missing-slot-completed", "Committed without live slot"),
        ),
        replay: "live",
      }),
    );

    expect(selectTranscriptTurn(store.getState(), "turn-missing-slot-completed")).toStrictEqual({
      id: "turn-missing-slot-completed",
      status: "inProgress",
      originalFirstItemId: "agent-missing-slot-completed",
      leadingPromptEntryId: null,
      middleChunkIds: [],
      middleEntryCount: 0,
      finalAssistantEntryIds: [
        transcriptEntryIdFor("turn-missing-slot-completed", "agent-missing-slot-completed"),
      ],
    });
    expect(
      selectTranscriptEntry(
        store.getState(),
        transcriptEntryIdFor("turn-missing-slot-completed", "agent-missing-slot-completed"),
      ),
    ).toStrictEqual({
      type: "message",
      id: "agent-missing-slot-completed",
      turnId: "turn-missing-slot-completed",
      role: "assistant",
      source: "Committed without live slot",
      sourceKind: "markdown",
      phase: "final_answer",
      revision: 0,
    });
  });

  it("removes the middle contribution after an empty completed agent message", () => {
    const store = makeStore();

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
    const initialItem = agentMessage("agent-empty-settled", "");
    const completedItem = agentMessage("agent-empty-settled", "");
    const attachKey = selectCommittedTranscriptScrollCommitKey(store.getState());

    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemStarted(
          eventItemStarted,
          "commit-empty-settled-started",
          "turn-empty-settled",
          initialItem,
        ),
        replay: "live",
      }),
    );
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemCompleted(
          eventItemCompleted,
          "commit-empty-settled-completed",
          "turn-empty-settled",
          completedItem,
        ),
        replay: "live",
      }),
    );

    expect(
      selectTranscriptEntry(
        store.getState(),
        transcriptEntryIdFor("turn-empty-settled", "agent-empty-settled"),
      ),
    ).toBeNull();
    expect(selectTranscriptTurn(store.getState(), "turn-empty-settled")).toStrictEqual({
      id: "turn-empty-settled",
      status: "inProgress",
      originalFirstItemId: "agent-empty-settled",
      leadingPromptEntryId: null,
      middleChunkIds: [],
      middleEntryCount: 0,
      finalAssistantEntryIds: [],
    });
    expect(selectTranscriptChunk(store.getState(), "turn-empty-settled:chunk:0")).toBeNull();
    expect(selectCommittedTranscriptScrollCommitKey(store.getState())).toBe(attachKey);
  });

  it("removes only the targeted empty completed item from a shared middle chunk", () => {
    const store = makeStore();

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
    const firstItem = agentMessage("agent-empty-first", "");
    const secondItem = agentMessage("agent-empty-second", "");

    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemStarted(
          eventItemStarted,
          "commit-empty-first-started",
          "turn-empty-shared",
          firstItem,
        ),
        replay: "live",
      }),
    );
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemStarted(
          eventItemStarted,
          "commit-empty-second-started",
          "turn-empty-shared",
          secondItem,
        ),
        replay: "live",
      }),
    );
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemCompleted(
          eventItemCompleted,
          "commit-empty-first-completed",
          "turn-empty-shared",
          firstItem,
        ),
        replay: "live",
      }),
    );

    expect(
      selectTranscriptEntry(
        store.getState(),
        transcriptEntryIdFor("turn-empty-shared", "agent-empty-first"),
      ),
    ).toBeNull();
    expect(
      selectTranscriptEntry(
        store.getState(),
        transcriptEntryIdFor("turn-empty-shared", "agent-empty-second"),
      ),
    ).toStrictEqual({
      type: "live",
      id: "agent-empty-second",
      key: transcriptEntryIdFor("turn-empty-shared", "agent-empty-second"),
      turnId: "turn-empty-shared",
      itemId: "agent-empty-second",
      status: "started",
      initialItem: secondItem,
      transientText: "",
      revision: 0,
    });
    expect(selectTranscriptTurn(store.getState(), "turn-empty-shared")).toStrictEqual({
      id: "turn-empty-shared",
      status: "inProgress",
      originalFirstItemId: "agent-empty-first",
      leadingPromptEntryId: null,
      middleChunkIds: ["turn-empty-shared:chunk:0"],
      middleEntryCount: 1,
      finalAssistantEntryIds: [],
    });
    expect(
      selectTranscriptChunk(store.getState(), "turn-empty-shared:chunk:0")?.entries.map(
        ({ id }) => id,
      ),
    ).toStrictEqual(["agent-empty-second"]);
  });
});
