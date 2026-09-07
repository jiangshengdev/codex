import { describe, expect, it } from "vitest";
import { makeStore } from "@/app/store";
import { requiredTranscriptState } from "./requiredTranscriptState";
import {
  activeThreadReadModelSlotCreated,
  activeThreadReadModelTransitionApplied,
} from "@/features/activeThreadSession/activeThreadSessionReadModel";
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

const identity = { threadId: attachBaseline.snapshot.thread.id, instanceId: "test-live" };
let sessionRevision = 0;
const readModelAction = (...facts: ActiveThreadProjectionReadModelFact[]) =>
  activeThreadReadModelTransitionApplied({ identity, sessionRevision: ++sessionRevision, facts });
const threadRuntimeAttached = (
  response: Extract<ActiveThreadProjectionReadModelFact, { type: "baselineAttached" }>["response"],
) => readModelAction({ type: "baselineAttached", response });
const threadRuntimeEventBuffered = (payload: ActiveThreadProjectionAcceptedEvent) =>
  readModelAction({ type: "eventAccepted", payload });

describe("transcript state committed activity reducer", () => {
  it("ignores token usage updates before transcript dedupe and scroll commits", () => {
    const store = makeStore();
    store.dispatch(activeThreadReadModelSlotCreated(identity));

    store.dispatch(threadRuntimeAttached(attachBaseline));
    const revisionBefore = requiredTranscriptState(
      store.getState(),
      identity.threadId,
    ).sessionRevision;
    const scrollCommitKeyBefore = selectCommittedTranscriptScrollCommitKey(
      store.getState(),
      identity.threadId,
    );

    store.dispatch(
      threadRuntimeEventBuffered({ notification: eventTokenUsageUpdated, replay: "live" }),
    );

    expect(
      requiredTranscriptState(store.getState(), identity.threadId).sessionRevision,
    ).toBeGreaterThan(revisionBefore);
    expect(selectCommittedTranscriptScrollCommitKey(store.getState(), identity.threadId)).toBe(
      scrollCommitKeyBefore,
    );
  });

  it("ignores sub-agent itemStarted until the same item completes into one middle entry", () => {
    const store = makeStore();
    store.dispatch(activeThreadReadModelSlotCreated(identity));
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

    expect(selectTranscriptTurn(store.getState(), identity.threadId, turnId)).toStrictEqual({
      id: turnId,
      status: "inProgress",
      originalFirstItemId: activity.id,
      leadingPromptEntryId: null,
      middleChunkIds: [],
      middleEntryCount: 0,
      finalAssistantEntryIds: [],
    });
    expect(
      selectTranscriptEntry(
        store.getState(),
        identity.threadId,
        transcriptEntryIdFor(turnId, activity.id),
      ),
    ).toBeNull();
    expect(
      selectTranscriptChunk(store.getState(), identity.threadId, `${turnId}:chunk:0`),
    ).toBeNull();

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

    expect(selectTranscriptTurn(store.getState(), identity.threadId, turnId)).toStrictEqual({
      id: turnId,
      status: "inProgress",
      originalFirstItemId: activity.id,
      leadingPromptEntryId: null,
      middleChunkIds: [`${turnId}:chunk:0`],
      middleEntryCount: 1,
      finalAssistantEntryIds: [],
    });
    expect(
      selectTranscriptChunk(store.getState(), identity.threadId, `${turnId}:chunk:0`)?.entries,
    ).toStrictEqual([
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
    snapshotStore.dispatch(activeThreadReadModelSlotCreated(identity));
    const completedOnlyStore = makeStore();
    completedOnlyStore.dispatch(activeThreadReadModelSlotCreated(identity));

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
    expect(
      selectTranscriptEntry(completedOnlyStore.getState(), identity.threadId, entryId),
    ).toStrictEqual(selectTranscriptEntry(snapshotStore.getState(), identity.threadId, entryId));
    expect(
      selectTranscriptChunk(completedOnlyStore.getState(), identity.threadId, `${turnId}:chunk:0`)
        ?.entries,
    ).toStrictEqual(
      selectTranscriptChunk(snapshotStore.getState(), identity.threadId, `${turnId}:chunk:0`)
        ?.entries,
    );
    expect(
      selectTranscriptTurn(completedOnlyStore.getState(), identity.threadId, turnId),
    ).toMatchObject({
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
    snapshotStore.dispatch(activeThreadReadModelSlotCreated(identity));
    const completedOnlyStore = makeStore();
    completedOnlyStore.dispatch(activeThreadReadModelSlotCreated(identity));

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
    const startedStoredBeforeCompletion = requiredTranscriptState(
      completedOnlyStore.getState(),
      identity.threadId,
    ).entriesById[startedEntryId];
    const startedViewBeforeCompletion = selectTranscriptEntry(
      completedOnlyStore.getState(),
      identity.threadId,
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

    expect(
      requiredTranscriptState(completedOnlyStore.getState(), identity.threadId).entriesById[
        startedEntryId
      ],
    ).toBe(startedStoredBeforeCompletion);
    expect(
      selectTranscriptEntry(completedOnlyStore.getState(), identity.threadId, startedEntryId),
    ).toBe(startedViewBeforeCompletion);
    expect(
      requiredTranscriptState(completedOnlyStore.getState(), identity.threadId).entriesById[
        completedEntryId
      ],
    ).toMatchObject({
      id: completed.id,
      activityKind: "completed",
      revision: 0,
    });

    const completedOnlyEntries = selectTranscriptChunk(
      completedOnlyStore.getState(),
      identity.threadId,
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
      selectTranscriptChunk(snapshotStore.getState(), identity.threadId, `${turnId}:chunk:0`)
        ?.entries,
    );
    expect(
      selectTranscriptTurn(completedOnlyStore.getState(), identity.threadId, turnId),
    ).toMatchObject({
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
    snapshotStore.dispatch(activeThreadReadModelSlotCreated(identity));
    const completedOnlyStore = makeStore();
    completedOnlyStore.dispatch(activeThreadReadModelSlotCreated(identity));

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
    expect(
      selectTranscriptEntry(completedOnlyStore.getState(), identity.threadId, entryId),
    ).toStrictEqual(selectTranscriptEntry(snapshotStore.getState(), identity.threadId, entryId));
    const completedOnlyChunk = selectTranscriptChunk(
      completedOnlyStore.getState(),
      identity.threadId,
      chunkId,
    );
    const snapshotChunk = selectTranscriptChunk(
      snapshotStore.getState(),
      identity.threadId,
      chunkId,
    );
    expect(completedOnlyChunk?.entries).toStrictEqual(snapshotChunk?.entries);
    expect(completedOnlyChunk?.revision).toBe(1);
    expect(snapshotChunk?.revision).toBe(0);
    expect(
      selectTranscriptTurn(completedOnlyStore.getState(), identity.threadId, turnId),
    ).toMatchObject({
      leadingPromptEntryId: transcriptEntryIdFor(turnId, leading.id),
      middleChunkIds: [chunkId],
      middleEntryCount: 1,
      finalAssistantEntryIds: [transcriptEntryIdFor(turnId, final.id)],
    });
  });

  it("settles started resume and empty wait in place from authoritative terminal payloads", () => {
    const store = makeStore();
    store.dispatch(activeThreadReadModelSlotCreated(identity));
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

    expect(selectTranscriptTurn(store.getState(), identity.threadId, turnId)).toMatchObject({
      leadingPromptEntryId: null,
      middleEntryCount: 2,
      finalAssistantEntryIds: [],
    });
    expect(
      selectTranscriptChunk(store.getState(), identity.threadId, `${turnId}:chunk:0`)?.entries,
    ).toMatchObject([
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

    expect(
      selectTranscriptTurn(store.getState(), identity.threadId, turnId)?.middleEntryCount,
    ).toBe(3);
    expect(
      selectTranscriptChunk(store.getState(), identity.threadId, `${turnId}:chunk:0`)?.entries,
    ).toMatchObject([
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
    const storedResume = requiredTranscriptState(store.getState(), identity.threadId).entriesById[
      transcriptEntryIdFor(turnId, resumeId)
    ];
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
    store.dispatch(activeThreadReadModelSlotCreated(identity));
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
      entry: requiredTranscriptState(store.getState(), identity.threadId).entriesById[entryId],
      mapping: requiredTranscriptState(store.getState(), identity.threadId).entryChunkById[entryId],
      rawOrder: requiredTranscriptState(store.getState(), identity.threadId).chunksById[chunkId]
        ?.entryIds,
      visibleOrder: selectTranscriptChunk(
        store.getState(),
        identity.threadId,
        chunkId,
      )?.entries.map(({ id }) => id),
      turn: selectTranscriptTurn(store.getState(), identity.threadId, turnId),
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
    expect(selectTranscriptEntry(store.getState(), identity.threadId, entryId)).toBeNull();

    live(
      itemCompleted(
        eventItemCompleted,
        "commit-reasoning-summary",
        turnId,
        reasoningItem(itemId, [" Authoritative summary "], ["raw reasoning"]),
      ),
    );
    expect(
      requiredTranscriptState(store.getState(), identity.threadId).entriesById[entryId],
    ).toStrictEqual({
      type: "reasoning",
      id: itemId,
      turnId,
      lifecycle: "completed",
      summaryParts: ["Authoritative summary"],
      revision: 1,
    });
    expect(
      selectTranscriptChunk(store.getState(), identity.threadId, chunkId)?.entries.map(
        ({ id }) => id,
      ),
    ).toStrictEqual([before.id, itemId, after.id]);
    expect(selectCommittedTranscriptScrollCommitKey(store.getState(), identity.threadId)).toBe(
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
      entry: requiredTranscriptState(store.getState(), identity.threadId).entriesById[entryId],
      mapping: requiredTranscriptState(store.getState(), identity.threadId).entryChunkById[entryId],
      rawOrder: requiredTranscriptState(store.getState(), identity.threadId).chunksById[chunkId]
        ?.entryIds,
      visibleOrder: selectTranscriptChunk(
        store.getState(),
        identity.threadId,
        chunkId,
      )?.entries.map(({ id }) => id),
      turn: selectTranscriptTurn(store.getState(), identity.threadId, turnId),
      signal: selectCommittedTranscriptScrollCommitKey(store.getState(), identity.threadId),
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
