import { describe, expect, it } from "vitest";
import { makeStore } from "@/app/store";
import { activeThreadReadModelTransitionApplied } from "@/features/activeThreadSession/activeThreadSessionReadModel";
import type {
  ActiveThreadProjectionAcceptedEvent,
  ActiveThreadProjectionReadModelFact,
} from "@/features/activeThreadSession/activeThreadProjectionFacts";
import {
  attachBaseline,
  eventItemCompleted,
  eventItemStarted,
  eventReasoningItemStarted,
  eventTokenUsageUpdated,
} from "@/features/projection/__tests__/projectionFixtures";
import {
  agentMessage,
  attachWithTurns,
  baseTurn,
  collabAgentState,
  collabAgentToolCall,
  itemCompleted,
  itemStarted,
  reasoningItem,
  subAgentActivity,
  textInput,
  userMessage,
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

describe("transcript state committed activity reducer", () => {
  it("ignores token usage updates before transcript dedupe and scroll commits", () => {
    const store = makeStore();

    store.dispatch(threadRuntimeAttached(attachBaseline));
    const revisionBefore = store.getState().transcriptState.sessionRevision;
    const scrollCommitKeyBefore = selectCommittedTranscriptScrollCommitKey(store.getState());

    store.dispatch(
      threadRuntimeEventBuffered({ notification: eventTokenUsageUpdated, replay: "live" }),
    );

    expect(store.getState().transcriptState.sessionRevision).toBeGreaterThan(revisionBefore);
    expect(selectCommittedTranscriptScrollCommitKey(store.getState())).toBe(scrollCommitKeyBefore);
  });

  it("ignores sub-agent itemStarted until the same item completes into one middle entry", () => {
    const store = makeStore();
    const turnId = "turn-sub-agent-started-completed";
    const activity = subAgentActivity(
      "activity-sub-agent-started-completed",
      "started",
      "agents/implementer",
    );

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemStarted(eventItemStarted, "commit-sub-agent-started", turnId, activity),
        replay: "live",
      }),
    );

    expect(selectTranscriptTurn(store.getState(), turnId)).toStrictEqual({
      id: turnId,
      status: "inProgress",
      originalFirstItemId: activity.id,
      leadingPromptEntryId: null,
      middleChunkIds: [],
      middleEntryCount: 0,
      finalAssistantEntryIds: [],
    });
    expect(
      selectTranscriptEntry(store.getState(), transcriptEntryIdFor(turnId, activity.id)),
    ).toBeNull();
    expect(selectTranscriptChunk(store.getState(), `${turnId}:chunk:0`)).toBeNull();

    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemCompleted(
          eventItemCompleted,
          "commit-sub-agent-completed",
          turnId,
          activity,
        ),
        replay: "live",
      }),
    );

    expect(selectTranscriptTurn(store.getState(), turnId)).toStrictEqual({
      id: turnId,
      status: "inProgress",
      originalFirstItemId: activity.id,
      leadingPromptEntryId: null,
      middleChunkIds: [`${turnId}:chunk:0`],
      middleEntryCount: 1,
      finalAssistantEntryIds: [],
    });
    expect(selectTranscriptChunk(store.getState(), `${turnId}:chunk:0`)?.entries).toStrictEqual([
      {
        type: "subAgentActivity",
        id: activity.id,
        turnId,
        title: {
          kind: "agentStarted",
          agentThreadId: "agent-thread-id",
          agentPath: "agents/implementer",
        },
        details: [],
        revision: 0,
      },
    ]);
  });

  it("projects completed-only and snapshot sub-agent activities to the same settled view", () => {
    const turnId = "turn-sub-agent-settled-equivalence";
    const activity = subAgentActivity(
      "activity-sub-agent-settled-equivalence",
      "interrupted",
      "agents/tester",
    );
    const snapshotStore = makeStore();
    const completedOnlyStore = makeStore();

    snapshotStore.dispatch(
      threadRuntimeAttached(attachWithTurns(attachBaseline, [baseTurn(turnId, [activity])])),
    );
    completedOnlyStore.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
    completedOnlyStore.dispatch(
      threadRuntimeEventBuffered({
        notification: itemCompleted(
          eventItemCompleted,
          "commit-sub-agent-completed-only",
          turnId,
          activity,
        ),
        replay: "live",
      }),
    );

    const entryId = transcriptEntryIdFor(turnId, activity.id);
    expect(selectTranscriptEntry(completedOnlyStore.getState(), entryId)).toStrictEqual(
      selectTranscriptEntry(snapshotStore.getState(), entryId),
    );
    expect(
      selectTranscriptChunk(completedOnlyStore.getState(), `${turnId}:chunk:0`)?.entries,
    ).toStrictEqual(selectTranscriptChunk(snapshotStore.getState(), `${turnId}:chunk:0`)?.entries);
    expect(selectTranscriptTurn(completedOnlyStore.getState(), turnId)).toMatchObject({
      leadingPromptEntryId: null,
      middleEntryCount: 1,
      finalAssistantEntryIds: [],
    });
  });

  it("appends completed activity without rewriting its earlier started activity", () => {
    const turnId = "turn-sub-agent-started-then-completed";
    const started = subAgentActivity(
      "activity-sub-agent-started",
      "started",
      "agents/implementer",
      { agentThreadId: "agent-thread-implementer" },
    );
    const completed = subAgentActivity(
      "activity-sub-agent-completed",
      "completed",
      "agents/implementer",
      { agentThreadId: "agent-thread-implementer" },
    );
    const snapshotStore = makeStore();
    const completedOnlyStore = makeStore();

    snapshotStore.dispatch(
      threadRuntimeAttached(
        attachWithTurns(attachBaseline, [baseTurn(turnId, [started, completed])]),
      ),
    );
    completedOnlyStore.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
    completedOnlyStore.dispatch(
      threadRuntimeEventBuffered({
        notification: itemCompleted(
          eventItemCompleted,
          "commit-sub-agent-started-activity",
          turnId,
          started,
        ),
        replay: "live",
      }),
    );

    const startedEntryId = transcriptEntryIdFor(turnId, started.id);
    const completedEntryId = transcriptEntryIdFor(turnId, completed.id);
    const startedStoredBeforeCompletion =
      completedOnlyStore.getState().transcriptState.entriesById[startedEntryId];
    const startedViewBeforeCompletion = selectTranscriptEntry(
      completedOnlyStore.getState(),
      startedEntryId,
    );

    completedOnlyStore.dispatch(
      threadRuntimeEventBuffered({
        notification: itemCompleted(
          eventItemCompleted,
          "commit-sub-agent-completed-activity",
          turnId,
          completed,
        ),
        replay: "live",
      }),
    );

    expect(completedOnlyStore.getState().transcriptState.entriesById[startedEntryId]).toBe(
      startedStoredBeforeCompletion,
    );
    expect(selectTranscriptEntry(completedOnlyStore.getState(), startedEntryId)).toBe(
      startedViewBeforeCompletion,
    );
    expect(
      completedOnlyStore.getState().transcriptState.entriesById[completedEntryId],
    ).toMatchObject({
      id: completed.id,
      activityKind: "completed",
      revision: 0,
    });

    const completedOnlyEntries = selectTranscriptChunk(
      completedOnlyStore.getState(),
      `${turnId}:chunk:0`,
    )?.entries;
    expect(completedOnlyEntries).toStrictEqual([
      {
        type: "subAgentActivity",
        id: started.id,
        turnId,
        title: {
          kind: "agentStarted",
          agentThreadId: "agent-thread-implementer",
          agentPath: "agents/implementer",
        },
        details: [],
        revision: 0,
      },
      {
        type: "subAgentActivity",
        id: completed.id,
        turnId,
        title: {
          kind: "agentCompleted",
          agentThreadId: "agent-thread-implementer",
          agentPath: "agents/implementer",
        },
        details: [],
        revision: 0,
      },
    ]);
    expect(completedOnlyEntries).toStrictEqual(
      selectTranscriptChunk(snapshotStore.getState(), `${turnId}:chunk:0`)?.entries,
    );
    expect(selectTranscriptTurn(completedOnlyStore.getState(), turnId)).toMatchObject({
      middleEntryCount: 2,
    });
  });

  it("projects completed-only and snapshot terminal collab activity to the same middle view", () => {
    const turnId = "turn-collab-settled-equivalence";
    const leading = userMessage("user-collab-settled", [textInput("Delegate")]);
    const activity = collabAgentToolCall("collab-settled", "wait", "completed", {
      receiverThreadIds: ["agent-a"],
      agentsStates: { "agent-a": collabAgentState("completed", "Done") },
    });
    const final = agentMessage("agent-collab-settled", "Final", "final_answer");
    const snapshotStore = makeStore();
    const completedOnlyStore = makeStore();

    snapshotStore.dispatch(
      threadRuntimeAttached(
        attachWithTurns(attachBaseline, [baseTurn(turnId, [leading, activity, final])]),
      ),
    );
    completedOnlyStore.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
    for (const [commitId, item] of [
      ["leading", leading],
      ["activity", activity],
      ["final", final],
    ] as const) {
      completedOnlyStore.dispatch(
        threadRuntimeEventBuffered({
          notification: itemCompleted(
            eventItemCompleted,
            `commit-collab-${commitId}`,
            turnId,
            item,
          ),
          replay: "live",
        }),
      );
    }

    const entryId = transcriptEntryIdFor(turnId, activity.id);
    const chunkId = `${turnId}:chunk:0`;
    expect(selectTranscriptEntry(completedOnlyStore.getState(), entryId)).toStrictEqual(
      selectTranscriptEntry(snapshotStore.getState(), entryId),
    );
    const completedOnlyChunk = selectTranscriptChunk(completedOnlyStore.getState(), chunkId);
    const snapshotChunk = selectTranscriptChunk(snapshotStore.getState(), chunkId);
    expect(completedOnlyChunk?.entries).toStrictEqual(snapshotChunk?.entries);
    expect(completedOnlyChunk?.revision).toBe(1);
    expect(snapshotChunk?.revision).toBe(0);
    expect(selectTranscriptTurn(completedOnlyStore.getState(), turnId)).toMatchObject({
      leadingPromptEntryId: transcriptEntryIdFor(turnId, leading.id),
      middleChunkIds: [chunkId],
      middleEntryCount: 1,
      finalAssistantEntryIds: [transcriptEntryIdFor(turnId, final.id)],
    });
  });

  it("settles started resume and empty wait in place from authoritative terminal payloads", () => {
    const store = makeStore();
    const turnId = "turn-collab-started-terminal";
    const waitId = "collab-empty-wait";
    const resumeId = "collab-authoritative-resume";

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
    for (const [commitId, item] of [
      ["wait", collabAgentToolCall(waitId, "wait", "inProgress")],
      [
        "resume",
        collabAgentToolCall(resumeId, "resumeAgent", "inProgress", {
          receiverThreadIds: ["started-agent"],
          prompt: "started prompt",
          model: "started-model",
          reasoningEffort: "high",
          agentsStates: { "started-agent": collabAgentState("running") },
        }),
      ],
    ] as const) {
      store.dispatch(
        threadRuntimeEventBuffered({
          notification: itemStarted(
            eventItemStarted,
            `commit-collab-started-${commitId}`,
            turnId,
            item,
          ),
          replay: "live",
        }),
      );
    }

    expect(selectTranscriptTurn(store.getState(), turnId)).toMatchObject({
      leadingPromptEntryId: null,
      middleEntryCount: 2,
      finalAssistantEntryIds: [],
    });
    expect(selectTranscriptChunk(store.getState(), `${turnId}:chunk:0`)?.entries).toMatchObject([
      {
        id: waitId,
        title: { kind: "agentsWaiting", receiver: null, receiverCount: 0 },
        details: [],
        revision: 0,
      },
      {
        id: resumeId,
        title: { kind: "agentResuming", receiver: "started-agent" },
        details: [],
        revision: 0,
      },
    ]);

    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemCompleted(
          eventItemCompleted,
          "commit-collab-between",
          turnId,
          agentMessage("agent-between-collab", "Between", "commentary"),
        ),
        replay: "live",
      }),
    );
    for (const [commitId, item] of [
      ["wait", collabAgentToolCall(waitId, "wait", "completed")],
      [
        "resume",
        collabAgentToolCall(resumeId, "resumeAgent", "failed", {
          receiverThreadIds: ["terminal-agent"],
          agentsStates: { "terminal-agent": collabAgentState("completed", "Terminal") },
        }),
      ],
    ] as const) {
      store.dispatch(
        threadRuntimeEventBuffered({
          notification: itemCompleted(
            eventItemCompleted,
            `commit-collab-terminal-${commitId}`,
            turnId,
            item,
          ),
          replay: "live",
        }),
      );
    }

    expect(selectTranscriptTurn(store.getState(), turnId)?.middleEntryCount).toBe(3);
    expect(selectTranscriptChunk(store.getState(), `${turnId}:chunk:0`)?.entries).toMatchObject([
      {
        id: waitId,
        title: { kind: "agentsFinishedWaiting" },
        details: [{ kind: "copy", copy: { kind: "noAgentsCompletedYet" } }],
        revision: 1,
      },
      {
        id: resumeId,
        title: { kind: "agentResumed", receiver: "terminal-agent" },
        details: [
          {
            kind: "copy",
            copy: {
              kind: "agentState",
              threadId: null,
              status: "completed",
              messagePreview: "Terminal",
            },
          },
        ],
        revision: 1,
      },
      { id: "agent-between-collab" },
    ]);
    const storedResume =
      store.getState().transcriptState.entriesById[transcriptEntryIdFor(turnId, resumeId)];
    expect(storedResume).toMatchObject({
      receiverThreadIds: ["terminal-agent"],
      promptPreview: null,
      model: null,
      reasoningEffort: null,
      agentStateSummaries: [{ threadId: "terminal-agent", messagePreview: "Terminal" }],
    });
    const storedResumeJson = JSON.stringify(storedResume);
    for (const staleFact of ["started-agent", "started prompt", "started-model"]) {
      expect(storedResumeJson).not.toContain(staleFact);
    }
  });

  it("keeps reasoning identity ordered while replacing and removing its authoritative completion", () => {
    const store = makeStore();
    const turnId = "turn-in-progress";
    const itemId = "reasoning-item";
    const entryId = transcriptEntryIdFor(turnId, itemId);
    const chunkId = turnId + ":chunk:0";
    const before = agentMessage("commentary-before-reasoning", "Before", "commentary");
    const after = subAgentActivity("activity-after-reasoning", "started", "agents/worker");
    const live = (notification: Parameters<typeof threadRuntimeEventBuffered>[0]["notification"]) =>
      store.dispatch(threadRuntimeEventBuffered({ notification, replay: "live" }));

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
    live(itemCompleted(eventItemCompleted, "commit-before-reasoning", turnId, before));
    live(eventReasoningItemStarted);
    live(itemCompleted(eventItemCompleted, "commit-after-reasoning", turnId, after));

    expect({
      entry: store.getState().transcriptState.entriesById[entryId],
      mapping: store.getState().transcriptState.entryChunkById[entryId],
      rawOrder: store.getState().transcriptState.chunksById[chunkId]?.entryIds,
      visibleOrder: selectTranscriptChunk(store.getState(), chunkId)?.entries.map(({ id }) => id),
      turn: selectTranscriptTurn(store.getState(), turnId),
    }).toStrictEqual({
      entry: {
        type: "reasoning",
        id: itemId,
        turnId,
        lifecycle: "streaming",
        summaryParts: {},
        currentSummaryIndex: null,
        title: null,
        revision: 0,
      },
      mapping: chunkId,
      rawOrder: [
        transcriptEntryIdFor(turnId, before.id),
        entryId,
        transcriptEntryIdFor(turnId, after.id),
      ],
      visibleOrder: [before.id, after.id],
      turn: {
        id: turnId,
        status: "inProgress",
        originalFirstItemId: before.id,
        leadingPromptEntryId: null,
        middleChunkIds: [chunkId],
        middleEntryCount: 2,
        finalAssistantEntryIds: [],
      },
    });
    expect(selectTranscriptEntry(store.getState(), entryId)).toBeNull();

    live(
      itemCompleted(
        eventItemCompleted,
        "commit-reasoning-summary",
        turnId,
        reasoningItem(itemId, [" Authoritative summary "], ["raw reasoning"]),
      ),
    );
    expect(store.getState().transcriptState.entriesById[entryId]).toStrictEqual({
      type: "reasoning",
      id: itemId,
      turnId,
      lifecycle: "completed",
      summaryParts: ["Authoritative summary"],
      revision: 1,
    });
    expect(
      selectTranscriptChunk(store.getState(), chunkId)?.entries.map(({ id }) => id),
    ).toStrictEqual([before.id, itemId, after.id]);
    expect(selectCommittedTranscriptScrollCommitKey(store.getState())).toBe(
      "event:commit-reasoning-summary",
    );
    live(
      itemCompleted(
        eventItemCompleted,
        "commit-reasoning-empty",
        turnId,
        reasoningItem(itemId, [" \n "], ["late raw reasoning"]),
      ),
    );
    expect({
      entry: store.getState().transcriptState.entriesById[entryId],
      mapping: store.getState().transcriptState.entryChunkById[entryId],
      rawOrder: store.getState().transcriptState.chunksById[chunkId]?.entryIds,
      visibleOrder: selectTranscriptChunk(store.getState(), chunkId)?.entries.map(({ id }) => id),
      turn: selectTranscriptTurn(store.getState(), turnId),
      signal: selectCommittedTranscriptScrollCommitKey(store.getState()),
    }).toStrictEqual({
      entry: undefined,
      mapping: undefined,
      rawOrder: [transcriptEntryIdFor(turnId, before.id), transcriptEntryIdFor(turnId, after.id)],
      visibleOrder: [before.id, after.id],
      turn: {
        id: turnId,
        status: "inProgress",
        originalFirstItemId: before.id,
        leadingPromptEntryId: null,
        middleChunkIds: [chunkId],
        middleEntryCount: 2,
        finalAssistantEntryIds: [],
      },
      signal: "event:commit-reasoning-empty",
    });
  });
});
