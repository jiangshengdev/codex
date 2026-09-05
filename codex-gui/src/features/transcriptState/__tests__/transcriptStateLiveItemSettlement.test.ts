import { describe, expect, it } from "vitest";
import { makeStore } from "@/app/store";
import { activeThreadReadModelTransitionApplied } from "@/features/activeThreadSession/activeThreadSessionReadModel";
import type {
  ActiveThreadProjectionAcceptedEvent,
  ActiveThreadProjectionReadModelFact,
} from "@/features/activeThreadSession/activeThreadProjectionFacts";
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
  itemCompleted,
  itemStarted,
} from "@/features/projection/__tests__/projectionTestBuilders";
import {
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
const threadRuntimeEventBuffered = (payload: ActiveThreadProjectionAcceptedEvent) =>
  readModelAction({ type: "eventAccepted", payload });
const threadRuntimeDeltasAccepted = ({
  notifications,
}: Pick<
  Extract<ActiveThreadProjectionReadModelFact, { type: "deltasAccepted" }>,
  "notifications"
>) => readModelAction({ type: "deltasAccepted", notifications });

describe("transcript state live item lifecycle reducer", () => {
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
    expect({
      ...afterDuplicateState,
      sessionRevision: beforeDuplicateState.sessionRevision,
    }).toStrictEqual(beforeDuplicateState);
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
});
