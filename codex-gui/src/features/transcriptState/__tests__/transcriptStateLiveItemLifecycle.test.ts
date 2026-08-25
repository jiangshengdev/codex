import { describe, expect, it } from "vitest";
import { makeStore } from "@/app/store";
import { activeThreadReadModelTransitionApplied } from "@/features/activeThreadSession/activeThreadSessionReadModel";
import type {
  ActiveThreadProjectionAcceptedQueueFact,
  ActiveThreadProjectionReadModelFact,
} from "@/features/activeThreadSession/activeThreadProjection";
import {
  attachBaseline,
  eventAgentMessageDelta,
  eventItemCompleted,
  eventItemStarted,
} from "@/features/projection/__tests__/projectionFixtures";
import {
  agentMessage,
  agentMessageDelta,
  attachWithTurns,
  collabAgentToolCall,
  itemCompleted,
  itemStarted,
} from "@/features/projection/__tests__/projectionTestBuilders";
import {
  TARGET_TRANSCRIPT_CHUNK_ENTRY_LIMIT,
  selectCommittedTranscriptScrollCommitKey,
  selectTranscriptChunk,
  selectTranscriptEntry,
  selectTranscriptTurn,
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
const threadRuntimeDeltasAccepted = ({
  notifications,
}: Pick<Extract<ActiveThreadProjectionReadModelFact, { type: "deltasAccepted" }>, "notifications">) =>
  readModelAction({ type: "deltasAccepted", notifications });

describe("transcript state live item lifecycle reducer", () => {
  it("keeps itemStarted slot order stable and ignores duplicate live slot insertion", () => {
    const store = makeStore();

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
    const firstItem = agentMessage("agent-slot-first", "First", "commentary");
    const secondItem = agentMessage("agent-slot-second", "Second", "commentary");

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
          agentMessage("agent-slot-first", "Updated initial", "commentary"),
        ),
        replay: "live",
      }),
    );

    const afterDuplicateState = store.getState().transcriptState;
    expect(afterDuplicateState.sessionRevision).toBeGreaterThan(
      beforeDuplicateState.sessionRevision,
    );
    expect({ ...afterDuplicateState, sessionRevision: beforeDuplicateState.sessionRevision }).toStrictEqual(
      beforeDuplicateState,
    );

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
      middleEntryCount: 0,
      finalAssistantEntryIds: [],
    });
    const firstEntryId = transcriptEntryIdFor("turn-slot-order", "agent-slot-first");
    const secondEntryId = transcriptEntryIdFor("turn-slot-order", "agent-slot-second");
    expect(
      store.getState().transcriptState.chunksById["turn-slot-order:chunk:0"]?.entryIds,
    ).toStrictEqual([firstEntryId, secondEntryId]);
    expect(
      selectTranscriptChunk(store.getState(), "turn-slot-order:chunk:0")?.entries,
    ).toStrictEqual([]);
    expect(store.getState().transcriptState.entriesById[firstEntryId]).toStrictEqual({
      type: "live",
      id: "agent-slot-first",
      key: firstEntryId,
      turnId: "turn-slot-order",
      itemId: "agent-slot-first",
      status: "started",
      initialItem: firstItem,
      transientText: "",
      revision: 0,
    });
    expect(selectTranscriptEntry(store.getState(), firstEntryId)).toBeNull();
    expect(selectTranscriptEntry(store.getState(), secondEntryId)).toBeNull();
  });

  it("removes the live item after committing the completed agent message", () => {
    const store = makeStore();

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
    const initialItem = agentMessage("agent-settled", "", "final_answer");
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
    expect(selectTranscriptTurn(store.getState(), "turn-settled")).toStrictEqual({
      id: "turn-settled",
      status: "inProgress",
      originalFirstItemId: "agent-settled",
      leadingPromptEntryId: null,
      middleChunkIds: [],
      middleEntryCount: 0,
      finalAssistantEntryIds: [],
    });
    expect(selectTranscriptTurn(store.getState(), "turn-settled")?.middleEntryCount).toBe(0);
    expect(selectTranscriptChunk(store.getState(), "turn-settled:chunk:0")).toBeNull();
    const beforeDuplicateState = store.getState().transcriptState;
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemStarted(
          eventItemStarted,
          "commit-settled-started-duplicate",
          "turn-settled",
          agentMessage("agent-settled", "Updated duplicate", "final_answer"),
        ),
        replay: "live",
      }),
    );
    const afterDuplicateState = store.getState().transcriptState;
    expect(afterDuplicateState.sessionRevision).toBeGreaterThan(
      beforeDuplicateState.sessionRevision,
    );
    expect({ ...afterDuplicateState, sessionRevision: beforeDuplicateState.sessionRevision }).toStrictEqual(
      beforeDuplicateState,
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
      rendering: { mode: "staticMarkdown", source: "Completed answer" },
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

  it("removes a hidden final slot after an empty completed final message", () => {
    const store = makeStore();
    const turnId = "turn-empty-final-settled";
    const itemId = "agent-empty-final-settled";
    const entryId = transcriptEntryIdFor(turnId, itemId);
    const emptyFinalItem = agentMessage(itemId, "", "final_answer");

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
    const attachKey = selectCommittedTranscriptScrollCommitKey(store.getState());
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemStarted(
          eventItemStarted,
          "commit-empty-final-settled-started",
          turnId,
          emptyFinalItem,
        ),
        replay: "live",
      }),
    );
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemCompleted(
          eventItemCompleted,
          "commit-empty-final-settled-completed",
          turnId,
          emptyFinalItem,
        ),
        replay: "live",
      }),
    );

    expect(selectTranscriptEntry(store.getState(), entryId)).toBeNull();
    expect(selectTranscriptTurn(store.getState(), turnId)).toStrictEqual({
      id: turnId,
      status: "inProgress",
      originalFirstItemId: itemId,
      leadingPromptEntryId: null,
      middleChunkIds: [],
      middleEntryCount: 0,
      finalAssistantEntryIds: [],
    });
    expect(selectTranscriptChunk(store.getState(), `${turnId}:chunk:0`)).toBeNull();
    expect(selectCommittedTranscriptScrollCommitKey(store.getState())).toBe(attachKey);
  });

  it("reclassifies a visible started final answer as commentary on completion", () => {
    const store = makeStore();
    const turnId = "turn-final-to-commentary";
    const itemId = "agent-final-to-commentary";
    const entryId = transcriptEntryIdFor(turnId, itemId);
    const initialItem = agentMessage(itemId, "", "final_answer");

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemStarted(
          eventItemStarted,
          "commit-final-to-commentary-started",
          turnId,
          initialItem,
        ),
        replay: "live",
      }),
    );
    store.dispatch(
      threadRuntimeDeltasAccepted({
        notifications: [
          agentMessageDelta(eventAgentMessageDelta, turnId, itemId, "Visible final draft"),
        ],
      }),
    );

    expect(selectTranscriptTurn(store.getState(), turnId)).toMatchObject({
      middleChunkIds: [],
      middleEntryCount: 0,
      finalAssistantEntryIds: [entryId],
    });

    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemCompleted(
          eventItemCompleted,
          "commit-final-to-commentary-completed",
          turnId,
          agentMessage(itemId, "Completed commentary", "commentary"),
        ),
        replay: "live",
      }),
    );

    expect(selectTranscriptEntry(store.getState(), entryId)).toStrictEqual({
      type: "message",
      id: itemId,
      turnId,
      role: "assistant",
      rendering: { mode: "staticMarkdown", source: "Completed commentary" },
      revision: 2,
    });
    expect(store.getState().transcriptState.entriesById[entryId]).toMatchObject({
      type: "message",
      phase: "commentary",
    });
    expect(selectTranscriptTurn(store.getState(), turnId)).toStrictEqual({
      id: turnId,
      status: "inProgress",
      originalFirstItemId: itemId,
      leadingPromptEntryId: null,
      middleChunkIds: [`${turnId}:chunk:0`],
      middleEntryCount: 1,
      finalAssistantEntryIds: [],
    });
    expect(
      selectTranscriptChunk(store.getState(), `${turnId}:chunk:0`)?.entries.map(({ id }) => id),
    ).toStrictEqual([itemId]);
  });

  it("reclassifies a visible phase-null live item as final on completion", () => {
    const store = makeStore();
    const turnId = "turn-phase-null-to-final";
    const itemId = "agent-phase-null-to-final";
    const entryId = transcriptEntryIdFor(turnId, itemId);
    const chunkId = `${turnId}:chunk:0`;
    const initialItem = agentMessage(itemId, "", null);

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemStarted(
          eventItemStarted,
          "commit-phase-null-to-final-started",
          turnId,
          initialItem,
        ),
        replay: "live",
      }),
    );
    store.dispatch(
      threadRuntimeDeltasAccepted({
        notifications: [agentMessageDelta(eventAgentMessageDelta, turnId, itemId, "Visible draft")],
      }),
    );

    expect(selectTranscriptEntry(store.getState(), entryId)).toStrictEqual({
      type: "message",
      id: itemId,
      turnId,
      role: "assistant",
      rendering: { mode: "streamingMarkdown", source: "Visible draft" },
      revision: 1,
    });
    expect(store.getState().transcriptState.entriesById[entryId]).toMatchObject({
      type: "live",
      key: entryId,
      itemId,
      status: "streaming",
      initialItem,
      transientText: "Visible draft",
      revision: 1,
    });
    expect(selectTranscriptTurn(store.getState(), turnId)).toStrictEqual({
      id: turnId,
      status: "inProgress",
      originalFirstItemId: itemId,
      leadingPromptEntryId: null,
      middleChunkIds: [chunkId],
      middleEntryCount: 1,
      finalAssistantEntryIds: [],
    });
    expect(
      selectTranscriptChunk(store.getState(), chunkId)?.entries.map(({ id }) => id),
    ).toStrictEqual([itemId]);

    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemCompleted(
          eventItemCompleted,
          "commit-phase-null-to-final-completed",
          turnId,
          agentMessage(itemId, "Completed answer", "final_answer"),
        ),
        replay: "live",
      }),
    );

    expect(selectTranscriptEntry(store.getState(), entryId)).toStrictEqual({
      type: "message",
      id: itemId,
      turnId,
      role: "assistant",
      rendering: { mode: "staticMarkdown", source: "Completed answer" },
      revision: 2,
    });
    expect(store.getState().transcriptState.entriesById[entryId]).toMatchObject({
      type: "message",
      phase: "final_answer",
    });
    expect(selectTranscriptTurn(store.getState(), turnId)).toStrictEqual({
      id: turnId,
      status: "inProgress",
      originalFirstItemId: itemId,
      leadingPromptEntryId: null,
      middleChunkIds: [],
      middleEntryCount: 0,
      finalAssistantEntryIds: [entryId],
    });
    expect(selectTranscriptChunk(store.getState(), chunkId)).toBeNull();
  });

  it("keeps the later live item addressable after removing an earlier live item", () => {
    const store = makeStore();

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
    const firstItem = agentMessage("agent-remove-first", "", null);
    const secondItem = agentMessage("agent-remove-second", "Still live", "commentary");
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
    expect(selectTranscriptTurn(store.getState(), "turn-remove-first")).toStrictEqual({
      id: "turn-remove-first",
      status: "inProgress",
      originalFirstItemId: "agent-remove-first",
      leadingPromptEntryId: null,
      middleChunkIds: ["turn-remove-first:chunk:0"],
      middleEntryCount: 0,
      finalAssistantEntryIds: [],
    });
    const firstEntryId = transcriptEntryIdFor("turn-remove-first", "agent-remove-first");
    const secondEntryId = transcriptEntryIdFor("turn-remove-first", "agent-remove-second");
    expect(
      store.getState().transcriptState.chunksById["turn-remove-first:chunk:0"]?.entryIds,
    ).toStrictEqual([firstEntryId, secondEntryId]);
    expect(
      selectTranscriptChunk(store.getState(), "turn-remove-first:chunk:0")?.entries,
    ).toStrictEqual([]);
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

    expect(selectTranscriptEntry(store.getState(), firstEntryId)).toStrictEqual({
      type: "message",
      id: "agent-remove-first",
      turnId: "turn-remove-first",
      role: "assistant",
      rendering: { mode: "staticMarkdown", source: "Completed first" },
      revision: 1,
    });
    expect(store.getState().transcriptState.entriesById[secondEntryId]).toStrictEqual({
      type: "live",
      id: "agent-remove-second",
      key: secondEntryId,
      turnId: "turn-remove-first",
      itemId: "agent-remove-second",
      status: "started",
      initialItem: secondItem,
      transientText: "",
      revision: 0,
    });
    expect(selectTranscriptEntry(store.getState(), secondEntryId)).toBeNull();
    expect(selectTranscriptTurn(store.getState(), "turn-remove-first")).toStrictEqual({
      id: "turn-remove-first",
      status: "inProgress",
      originalFirstItemId: "agent-remove-first",
      leadingPromptEntryId: null,
      middleChunkIds: ["turn-remove-first:chunk:0"],
      middleEntryCount: 0,
      finalAssistantEntryIds: [transcriptEntryIdFor("turn-remove-first", "agent-remove-first")],
    });
    expect(
      selectTranscriptChunk(store.getState(), "turn-remove-first:chunk:0")?.entries,
    ).toStrictEqual([]);
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
      rendering: { mode: "staticMarkdown", source: "Committed without live slot" },
      revision: 0,
    });
  });

  it("removes the middle contribution after an empty completed agent message", () => {
    const store = makeStore();

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
    const initialItem = agentMessage("agent-empty-settled", "", "commentary");
    const completedItem = agentMessage("agent-empty-settled", "", "commentary");
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
    expect(selectTranscriptTurn(store.getState(), "turn-empty-settled")?.middleEntryCount).toBe(0);
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
    const firstItem = agentMessage("agent-empty-first", "", "commentary");
    const secondItem = agentMessage("agent-empty-second", "", "commentary");

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
    expect(selectTranscriptTurn(store.getState(), "turn-empty-shared")?.middleEntryCount).toBe(0);
    const firstEntryId = transcriptEntryIdFor("turn-empty-shared", "agent-empty-first");
    const secondEntryId = transcriptEntryIdFor("turn-empty-shared", "agent-empty-second");
    expect(
      store.getState().transcriptState.chunksById["turn-empty-shared:chunk:0"]?.entryIds,
    ).toStrictEqual([firstEntryId, secondEntryId]);
    expect(
      selectTranscriptChunk(store.getState(), "turn-empty-shared:chunk:0")?.entries,
    ).toStrictEqual([]);
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

    expect(selectTranscriptEntry(store.getState(), firstEntryId)).toBeNull();
    expect(store.getState().transcriptState.entriesById[secondEntryId]).toStrictEqual({
      type: "live",
      id: "agent-empty-second",
      key: secondEntryId,
      turnId: "turn-empty-shared",
      itemId: "agent-empty-second",
      status: "started",
      initialItem: secondItem,
      transientText: "",
      revision: 0,
    });
    expect(selectTranscriptEntry(store.getState(), secondEntryId)).toBeNull();
    expect(selectTranscriptTurn(store.getState(), "turn-empty-shared")).toStrictEqual({
      id: "turn-empty-shared",
      status: "inProgress",
      originalFirstItemId: "agent-empty-first",
      leadingPromptEntryId: null,
      middleChunkIds: ["turn-empty-shared:chunk:0"],
      middleEntryCount: 0,
      finalAssistantEntryIds: [],
    });
    expect(
      selectTranscriptChunk(store.getState(), "turn-empty-shared:chunk:0")?.entries,
    ).toStrictEqual([]);
  });

  it("counts a non-empty middle completion once when no delta activated its live slot", () => {
    const store = makeStore();
    const initialItem = agentMessage("agent-direct-middle", "", "commentary");
    const completedItem = agentMessage("agent-direct-middle", "Completed commentary", "commentary");

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemStarted(
          eventItemStarted,
          "commit-direct-middle-started",
          "turn-direct-middle",
          initialItem,
        ),
        replay: "live",
      }),
    );
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemCompleted(
          eventItemCompleted,
          "commit-direct-middle-completed",
          "turn-direct-middle",
          completedItem,
        ),
        replay: "live",
      }),
    );

    expect(selectTranscriptTurn(store.getState(), "turn-direct-middle")?.middleEntryCount).toBe(1);
    expect(
      selectTranscriptChunk(store.getState(), "turn-direct-middle:chunk:0")?.entries.map(
        ({ id }) => id,
      ),
    ).toStrictEqual(["agent-direct-middle"]);
  });

  it("preserves hidden slot chunk identity after clearing a full earlier chunk", () => {
    const store = makeStore();
    const turnId = "turn-hidden-chunk-boundary";
    const initialItemIds = Array.from(
      { length: TARGET_TRANSCRIPT_CHUNK_ENTRY_LIMIT + 1 },
      (_, index) => `agent-hidden-initial-${String(index)}`,
    );

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
    for (const [index, itemId] of initialItemIds.entries()) {
      store.dispatch(
        threadRuntimeEventBuffered({
          notification: itemStarted(
            eventItemStarted,
            `commit-hidden-initial-started-${String(index)}`,
            turnId,
            agentMessage(itemId, "", "commentary"),
          ),
          replay: "live",
        }),
      );
    }

    for (const [index, itemId] of initialItemIds
      .slice(0, TARGET_TRANSCRIPT_CHUNK_ENTRY_LIMIT)
      .entries()) {
      store.dispatch(
        threadRuntimeEventBuffered({
          notification: itemCompleted(
            eventItemCompleted,
            `commit-hidden-initial-completed-${String(index)}`,
            turnId,
            agentMessage(itemId, "", "commentary"),
          ),
          replay: "live",
        }),
      );
    }

    const retainedItemId = `agent-hidden-initial-${String(TARGET_TRANSCRIPT_CHUNK_ENTRY_LIMIT)}`;
    const addedItemIds = Array.from(
      { length: TARGET_TRANSCRIPT_CHUNK_ENTRY_LIMIT },
      (_, index) => `agent-hidden-added-${String(index)}`,
    );
    for (const [index, itemId] of addedItemIds.entries()) {
      store.dispatch(
        threadRuntimeEventBuffered({
          notification: itemStarted(
            eventItemStarted,
            `commit-hidden-added-started-${String(index)}`,
            turnId,
            agentMessage(itemId, "", "commentary"),
          ),
          replay: "live",
        }),
      );
    }

    const chunkOneItemIds = [
      retainedItemId,
      ...addedItemIds.slice(0, TARGET_TRANSCRIPT_CHUNK_ENTRY_LIMIT - 1),
    ];
    const chunkTwoItemId = `agent-hidden-added-${String(TARGET_TRANSCRIPT_CHUNK_ENTRY_LIMIT - 1)}`;
    expect(selectTranscriptTurn(store.getState(), turnId)?.middleChunkIds).toStrictEqual([
      `${turnId}:chunk:0`,
      `${turnId}:chunk:1`,
      `${turnId}:chunk:2`,
    ]);
    expect(selectTranscriptTurn(store.getState(), turnId)?.middleEntryCount).toBe(0);
    expect(selectTranscriptChunk(store.getState(), `${turnId}:chunk:0`)?.entries).toStrictEqual([]);
    expect(
      store.getState().transcriptState.chunksById[`${turnId}:chunk:1`]?.entryIds,
    ).toStrictEqual(chunkOneItemIds.map((itemId) => transcriptEntryIdFor(turnId, itemId)));
    expect(
      store.getState().transcriptState.chunksById[`${turnId}:chunk:2`]?.entryIds,
    ).toStrictEqual([transcriptEntryIdFor(turnId, chunkTwoItemId)]);
    expect(selectTranscriptChunk(store.getState(), `${turnId}:chunk:1`)?.entries).toStrictEqual([]);
    expect(selectTranscriptChunk(store.getState(), `${turnId}:chunk:2`)?.entries).toStrictEqual([]);

    for (const itemId of chunkOneItemIds) {
      const entryId = transcriptEntryIdFor(turnId, itemId);
      expect(store.getState().transcriptState.entryChunkById[entryId]).toBe(`${turnId}:chunk:1`);
      expect(store.getState().transcriptState.entriesById[entryId]).toMatchObject({
        type: "live",
        key: entryId,
        turnId,
        itemId,
      });
      expect(selectTranscriptEntry(store.getState(), entryId)).toBeNull();
    }
    const chunkTwoEntryId = transcriptEntryIdFor(turnId, chunkTwoItemId);
    expect(store.getState().transcriptState.entryChunkById[chunkTwoEntryId]).toBe(
      `${turnId}:chunk:2`,
    );
    expect(store.getState().transcriptState.entriesById[chunkTwoEntryId]).toMatchObject({
      type: "live",
      key: chunkTwoEntryId,
      turnId,
      itemId: chunkTwoItemId,
    });
    expect(selectTranscriptEntry(store.getState(), chunkTwoEntryId)).toBeNull();
  });

  it("keeps 100 and 101 visible started activities in bounded middle chunks", () => {
    const store = makeStore();
    const turnId = "turn-started-activity-chunks";

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
    for (let index = 0; index <= TARGET_TRANSCRIPT_CHUNK_ENTRY_LIMIT; index += 1) {
      store.dispatch(
        threadRuntimeEventBuffered({
          notification: itemStarted(
            eventItemStarted,
            `commit-started-activity-${String(index)}`,
            turnId,
            collabAgentToolCall(`collab-started-${String(index)}`, "wait", "inProgress"),
          ),
          replay: "live",
        }),
      );
    }

    expect(selectTranscriptTurn(store.getState(), turnId)).toMatchObject({
      middleChunkIds: [`${turnId}:chunk:0`, `${turnId}:chunk:1`],
      middleEntryCount: TARGET_TRANSCRIPT_CHUNK_ENTRY_LIMIT + 1,
    });
    expect(selectTranscriptChunk(store.getState(), `${turnId}:chunk:0`)?.entries).toHaveLength(
      TARGET_TRANSCRIPT_CHUNK_ENTRY_LIMIT,
    );
    expect(selectTranscriptChunk(store.getState(), `${turnId}:chunk:1`)?.entries).toMatchObject([
      { id: `collab-started-${String(TARGET_TRANSCRIPT_CHUNK_ENTRY_LIMIT)}` },
    ]);
  });
});
