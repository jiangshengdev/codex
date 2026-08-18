import { describe, expect, it } from "vitest";
import { makeStore } from "@/app/store";
import {
  attachBaseline,
  eventItemCompleted,
  eventItemStarted,
  eventReasoningItemStarted,
  eventReasoningSummaryTextDelta,
  eventTokenUsageUpdated,
  eventTurnCompleted,
  eventTurnStarted,
} from "@/features/projection/__tests__/projectionFixtures";
import {
  agentMessage,
  attachWithTurns,
  baseTurn,
  collabAgentState,
  collabAgentToolCall,
  failedTurn,
  inProgressTurn,
  itemCompleted,
  itemStarted,
  planItem,
  reasoningItem,
  reasoningSummaryTextDelta,
  sleepItem,
  subAgentActivity,
  textInput,
  turnCompleted,
  turnStarted,
  userMessage,
} from "@/features/projection/__tests__/projectionTestBuilders";
import {
  selectThreadRuntimeActiveTurnId,
  threadRuntimeAttached,
  threadRuntimeDeltasAccepted,
  threadRuntimeEventBuffered,
} from "@/features/threadRuntime/threadRuntimeSlice";
import {
  TARGET_TRANSCRIPT_CHUNK_ENTRY_LIMIT,
  selectCommittedTranscriptScrollCommitKey,
  selectTranscriptChunk,
  selectTranscriptEntry,
  selectTranscriptTurn,
  selectTranscriptTurnIds,
  transcriptEntryIdFor,
} from "../transcriptStateSlice";

describe("transcript state committed projection reducer", () => {
  it("ignores token usage updates before transcript dedupe and scroll commits", () => {
    const store = makeStore();

    store.dispatch(threadRuntimeAttached(attachBaseline));
    const transcriptBefore = store.getState().transcriptState;
    const activeTurnIdBefore = selectThreadRuntimeActiveTurnId(store.getState());
    const scrollCommitKeyBefore = selectCommittedTranscriptScrollCommitKey(store.getState());

    store.dispatch(
      threadRuntimeEventBuffered({ notification: eventTokenUsageUpdated, replay: "live" }),
    );

    expect(store.getState().transcriptState).toBe(transcriptBefore);
    expect(selectThreadRuntimeActiveTurnId(store.getState())).toBe(activeTurnIdBefore);
    expect(selectCommittedTranscriptScrollCommitKey(store.getState())).toBe(scrollCommitKeyBefore);
  });

  it("preserves assistant message phase in stored live completions while projecting views", () => {
    const store = makeStore();

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemCompleted(
          eventItemCompleted,
          "commit-live-commentary",
          "turn-live-phase",
          agentMessage("agent-live-commentary", "Still working", "commentary"),
        ),
        replay: "live",
      }),
    );

    expect(
      selectTranscriptChunk(store.getState(), "turn-live-phase:chunk:0")?.entries,
    ).toStrictEqual([
      {
        type: "message",
        id: "agent-live-commentary",
        turnId: "turn-live-phase",
        role: "assistant",
        rendering: { mode: "staticMarkdown", source: "Still working" },
        revision: 0,
      },
    ]);
    expect(
      store.getState().transcriptState.entriesById[
        transcriptEntryIdFor("turn-live-phase", "agent-live-commentary")
      ],
    ).toMatchObject({ type: "message", phase: "commentary" });
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

  it("keeps a later completed user in middle when the first completed item is assistant", () => {
    const store = makeStore();

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: turnStarted(
          eventTurnStarted,
          "commit-live-turn",
          inProgressTurn("turn-live"),
        ),
        replay: "live",
      }),
    );
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemCompleted(
          eventItemCompleted,
          "commit-live-agent",
          "turn-live",
          agentMessage("agent-live", "Live answer"),
        ),
        replay: "live",
      }),
    );
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemCompleted(
          eventItemCompleted,
          "commit-live-user",
          "turn-live",
          userMessage("user-after-agent", [textInput("Later prompt")]),
        ),
        replay: "live",
      }),
    );

    expect(selectTranscriptTurn(store.getState(), "turn-live")).toStrictEqual({
      id: "turn-live",
      status: "inProgress",
      originalFirstItemId: "agent-live",
      leadingPromptEntryId: null,
      middleChunkIds: ["turn-live:chunk:0"],
      middleEntryCount: 1,
      finalAssistantEntryIds: [transcriptEntryIdFor("turn-live", "agent-live")],
    });
    expect(
      selectTranscriptEntry(store.getState(), transcriptEntryIdFor("turn-live", "agent-live")),
    ).toStrictEqual({
      type: "message",
      id: "agent-live",
      turnId: "turn-live",
      role: "assistant",
      rendering: { mode: "staticMarkdown", source: "Live answer" },
      revision: 0,
    });
    expect(
      selectTranscriptChunk(store.getState(), "turn-live:chunk:0")?.entries.map(({ id }) => id),
    ).toStrictEqual(["user-after-agent"]);
  });

  it("keeps a later completed user in middle when an assistant item started first", () => {
    const store = makeStore();

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemStarted(
          eventItemStarted,
          "start-assistant-first",
          "turn-started-first",
          agentMessage("agent-started-first", "Working", "commentary"),
        ),
        replay: "live",
      }),
    );
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemCompleted(
          eventItemCompleted,
          "complete-user-after-started",
          "turn-started-first",
          userMessage("user-after-started", [textInput("Later prompt")]),
        ),
        replay: "live",
      }),
    );

    expect(selectTranscriptTurn(store.getState(), "turn-started-first")).toStrictEqual({
      id: "turn-started-first",
      status: "inProgress",
      originalFirstItemId: "agent-started-first",
      leadingPromptEntryId: null,
      middleChunkIds: ["turn-started-first:chunk:0"],
      middleEntryCount: 1,
      finalAssistantEntryIds: [],
    });
    expect(
      store.getState().transcriptState.chunksById["turn-started-first:chunk:0"]?.entryIds,
    ).toStrictEqual([
      transcriptEntryIdFor("turn-started-first", "agent-started-first"),
      transcriptEntryIdFor("turn-started-first", "user-after-started"),
    ]);
    expect(
      selectTranscriptChunk(store.getState(), "turn-started-first:chunk:0")?.entries.map(
        ({ id }) => id,
      ),
    ).toStrictEqual(["user-after-started"]);
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

  it.each(["interrupted", "failed"] as const)(
    "clears streaming reasoning when a turn is %s",
    (status) => {
      const store = makeStore();
      const turnId = "turn-reasoning-" + status;
      const itemId = "reasoning-" + status;
      const activity = subAgentActivity("activity-" + status, "interrupted", "agents/worker");
      const entryId = transcriptEntryIdFor(turnId, itemId);
      const chunkId = turnId + ":chunk:0";
      const live = (
        notification: Parameters<typeof threadRuntimeEventBuffered>[0]["notification"],
      ) => store.dispatch(threadRuntimeEventBuffered({ notification, replay: "live" }));

      store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
      live(
        itemStarted(eventItemStarted, "commit-start-" + status, turnId, reasoningItem(itemId, [])),
      );
      live(itemCompleted(eventItemCompleted, "commit-activity-" + status, turnId, activity));
      store.dispatch(
        threadRuntimeDeltasAccepted({
          notifications: [
            reasoningSummaryTextDelta(
              eventReasoningSummaryTextDelta,
              turnId,
              itemId,
              "**Visible**",
              0,
            ),
          ],
        }),
      );
      expect(
        selectTranscriptChunk(store.getState(), chunkId)?.entries.map(({ id }) => id),
      ).toStrictEqual([itemId, activity.id]);

      live(
        turnCompleted(eventTurnCompleted, "commit-terminal-" + status, {
          ...baseTurn(turnId),
          status,
        }),
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
        rawOrder: [transcriptEntryIdFor(turnId, activity.id)],
        visibleOrder: [activity.id],
        turn: {
          id: turnId,
          status,
          originalFirstItemId: itemId,
          leadingPromptEntryId: null,
          middleChunkIds: [chunkId],
          middleEntryCount: 1,
          finalAssistantEntryIds: [],
        },
        signal: "event:commit-terminal-" + status,
      });
    },
  );

  it("makes a completed first user item leading without a started middle slot", () => {
    const store = makeStore();

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemStarted(
          eventItemStarted,
          "start-leading-user",
          "turn-started-leading-user",
          userMessage("user-started-leading", [textInput("Prompt")]),
        ),
        replay: "live",
      }),
    );

    expect(selectTranscriptTurn(store.getState(), "turn-started-leading-user")).toStrictEqual({
      id: "turn-started-leading-user",
      status: "inProgress",
      originalFirstItemId: "user-started-leading",
      leadingPromptEntryId: null,
      middleChunkIds: [],
      middleEntryCount: 0,
      finalAssistantEntryIds: [],
    });
    expect(
      selectTranscriptEntry(
        store.getState(),
        transcriptEntryIdFor("turn-started-leading-user", "user-started-leading"),
      ),
    ).toBeNull();
    expect(selectTranscriptChunk(store.getState(), "turn-started-leading-user:chunk:0")).toBeNull();

    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemCompleted(
          eventItemCompleted,
          "complete-leading-user",
          "turn-started-leading-user",
          userMessage("user-started-leading", [textInput("Prompt")]),
        ),
        replay: "live",
      }),
    );

    expect(selectTranscriptTurn(store.getState(), "turn-started-leading-user")).toStrictEqual({
      id: "turn-started-leading-user",
      status: "inProgress",
      originalFirstItemId: "user-started-leading",
      leadingPromptEntryId: transcriptEntryIdFor(
        "turn-started-leading-user",
        "user-started-leading",
      ),
      middleChunkIds: [],
      middleEntryCount: 0,
      finalAssistantEntryIds: [],
    });
    expect(
      selectTranscriptEntry(
        store.getState(),
        transcriptEntryIdFor("turn-started-leading-user", "user-started-leading"),
      ),
    ).toStrictEqual({
      type: "message",
      id: "user-started-leading",
      turnId: "turn-started-leading-user",
      role: "user",
      rendering: { mode: "plainText", source: "Prompt" },
      revision: 0,
    });
    expect(selectTranscriptChunk(store.getState(), "turn-started-leading-user:chunk:0")).toBeNull();
  });

  it("applies normalized live itemCompleted projection payloads into committed transcript chunks", () => {
    const store = makeStore();

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemCompleted(
          eventItemCompleted,
          "commit-live-normalized",
          "turn-live-normalized",
          agentMessage("agent-live-normalized", "Live normalized answer"),
        ),
        replay: "live",
      }),
    );

    expect(selectTranscriptTurn(store.getState(), "turn-live-normalized")).toStrictEqual({
      id: "turn-live-normalized",
      status: "inProgress",
      originalFirstItemId: "agent-live-normalized",
      leadingPromptEntryId: null,
      middleChunkIds: [],
      middleEntryCount: 0,
      finalAssistantEntryIds: [
        transcriptEntryIdFor("turn-live-normalized", "agent-live-normalized"),
      ],
    });
    expect(
      selectTranscriptEntry(
        store.getState(),
        transcriptEntryIdFor("turn-live-normalized", "agent-live-normalized"),
      ),
    ).toStrictEqual({
      type: "message",
      id: "agent-live-normalized",
      turnId: "turn-live-normalized",
      role: "assistant",
      rendering: { mode: "staticMarkdown", source: "Live normalized answer" },
      revision: 0,
    });
  });

  it("updates turn terminal status from live turnCompleted", () => {
    const store = makeStore();

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: turnStarted(
          eventTurnStarted,
          "commit-start-done",
          inProgressTurn("turn-done"),
        ),
        replay: "live",
      }),
    );
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: turnCompleted(eventTurnCompleted, "commit-complete-done", {
          ...baseTurn("turn-done", []),
          status: "completed",
        }),
        replay: "live",
      }),
    );

    expect(selectTranscriptTurn(store.getState(), "turn-done")).toStrictEqual({
      id: "turn-done",
      status: "completed",
      originalFirstItemId: null,
      leadingPromptEntryId: null,
      middleChunkIds: [],
      middleEntryCount: 0,
      finalAssistantEntryIds: [],
    });
  });

  it("stores, deduplicates, and clears a live failed turn error without adding entries", () => {
    const store = makeStore();
    const turnId = "turn-live-failed-error";
    const error = {
      message:
        "unexpected status 403 Forbidden: token quota is not enough\n(request id: request-live), url: https://shapi.vip/v1/responses",
      codexErrorInfo: "usageLimitExceeded",
      additionalDetails: null,
    } satisfies NonNullable<ReturnType<typeof failedTurn>["error"]>;
    const failedNotification = turnCompleted(
      eventTurnCompleted,
      "commit-live-failed-error",
      failedTurn(turnId, error),
    );

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
    store.dispatch(
      threadRuntimeEventBuffered({ notification: failedNotification, replay: "live" }),
    );
    store.dispatch(
      threadRuntimeEventBuffered({ notification: failedNotification, replay: "live" }),
    );

    expect(selectTranscriptTurnIds(store.getState())).toStrictEqual([turnId]);
    expect(selectTranscriptTurn(store.getState(), turnId)).toStrictEqual({
      id: turnId,
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

    store.dispatch(
      threadRuntimeEventBuffered({
        notification: turnCompleted(
          eventTurnCompleted,
          "commit-live-error-cleared",
          baseTurn(turnId),
        ),
        replay: "live",
      }),
    );

    const completedTurn = selectTranscriptTurn(store.getState(), turnId);
    expect(completedTurn).toStrictEqual({
      id: turnId,
      status: "completed",
      originalFirstItemId: null,
      leadingPromptEntryId: null,
      middleChunkIds: [],
      middleEntryCount: 0,
      finalAssistantEntryIds: [],
    });
    expect(completedTurn).not.toHaveProperty("error");
  });

  it("filters empty text and non-chat live item completions", () => {
    const store = makeStore();

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemCompleted(
          eventItemCompleted,
          "commit-empty-user",
          "turn-live-filtered",
          userMessage("empty-user", [textInput("")]),
        ),
        replay: "live",
      }),
    );
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemCompleted(
          eventItemCompleted,
          "commit-empty-agent",
          "turn-live-filtered",
          agentMessage("empty-agent", ""),
        ),
        replay: "live",
      }),
    );
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemCompleted(
          eventItemCompleted,
          "commit-plan",
          "turn-live-filtered",
          planItem("hidden-plan"),
        ),
        replay: "live",
      }),
    );
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemCompleted(
          eventItemCompleted,
          "commit-sleep",
          "turn-live-filtered",
          sleepItem("hidden-sleep"),
        ),
        replay: "live",
      }),
    );

    expect(selectTranscriptTurnIds(store.getState())).toStrictEqual(["turn-live-filtered"]);
    expect(selectTranscriptTurn(store.getState(), "turn-live-filtered")).toStrictEqual({
      id: "turn-live-filtered",
      status: "inProgress",
      originalFirstItemId: "empty-user",
      leadingPromptEntryId: null,
      middleChunkIds: [],
      middleEntryCount: 0,
      finalAssistantEntryIds: [],
    });
  });

  it("updates an existing committed entry and bumps only its chunk revision", () => {
    const store = makeStore();

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemCompleted(
          eventItemCompleted,
          "commit-first",
          "turn-update",
          agentMessage("agent-update", "First", "commentary"),
        ),
        replay: "live",
      }),
    );
    const beforeUpdateChunk = selectTranscriptChunk(store.getState(), "turn-update:chunk:0");

    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemCompleted(
          eventItemCompleted,
          "commit-second",
          "turn-update",
          agentMessage("agent-update", "Second", "commentary"),
        ),
        replay: "live",
      }),
    );

    expect(selectTranscriptTurn(store.getState(), "turn-update")).toStrictEqual({
      id: "turn-update",
      status: "inProgress",
      originalFirstItemId: "agent-update",
      leadingPromptEntryId: null,
      middleChunkIds: ["turn-update:chunk:0"],
      middleEntryCount: 1,
      finalAssistantEntryIds: [],
    });
    expect(
      selectTranscriptEntry(store.getState(), transcriptEntryIdFor("turn-update", "agent-update")),
    ).toStrictEqual({
      type: "message",
      id: "agent-update",
      turnId: "turn-update",
      role: "assistant",
      rendering: { mode: "staticMarkdown", source: "Second" },
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
          rendering: { mode: "staticMarkdown", source: "Second" },
          revision: 1,
        },
      ],
    });
  });

  it("defensively reclassifies an existing middle entry when a repeated completion changes phase", () => {
    const store = makeStore();

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemCompleted(
          eventItemCompleted,
          "commit-phase-first",
          "turn-phase-update",
          agentMessage("agent-phase-update", "Working", "commentary"),
        ),
        replay: "live",
      }),
    );
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemCompleted(
          eventItemCompleted,
          "commit-phase-second",
          "turn-phase-update",
          agentMessage("agent-phase-update", "Done", "final_answer"),
        ),
        replay: "live",
      }),
    );

    expect(
      selectTranscriptEntry(
        store.getState(),
        transcriptEntryIdFor("turn-phase-update", "agent-phase-update"),
      ),
    ).toStrictEqual({
      type: "message",
      id: "agent-phase-update",
      turnId: "turn-phase-update",
      role: "assistant",
      rendering: { mode: "staticMarkdown", source: "Done" },
      revision: 1,
    });
    expect(selectTranscriptTurn(store.getState(), "turn-phase-update")).toStrictEqual({
      id: "turn-phase-update",
      status: "inProgress",
      originalFirstItemId: "agent-phase-update",
      leadingPromptEntryId: null,
      middleChunkIds: [],
      middleEntryCount: 0,
      finalAssistantEntryIds: [transcriptEntryIdFor("turn-phase-update", "agent-phase-update")],
    });
    expect(selectTranscriptChunk(store.getState(), "turn-phase-update:chunk:0")).toBeNull();
    expect(
      store.getState().transcriptState.entriesById[
        transcriptEntryIdFor("turn-phase-update", "agent-phase-update")
      ],
    ).toMatchObject({ type: "message", phase: "final_answer" });
  });

  it("updates an existing final assistant entry without creating a middle chunk", () => {
    const store = makeStore();

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemCompleted(
          eventItemCompleted,
          "commit-final-first",
          "turn-final-update",
          agentMessage("agent-final-update", "First", "final_answer"),
        ),
        replay: "live",
      }),
    );
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemCompleted(
          eventItemCompleted,
          "commit-final-second",
          "turn-final-update",
          agentMessage("agent-final-update", "Second", "final_answer"),
        ),
        replay: "live",
      }),
    );

    expect(selectTranscriptTurn(store.getState(), "turn-final-update")).toStrictEqual({
      id: "turn-final-update",
      status: "inProgress",
      originalFirstItemId: "agent-final-update",
      leadingPromptEntryId: null,
      middleChunkIds: [],
      middleEntryCount: 0,
      finalAssistantEntryIds: [transcriptEntryIdFor("turn-final-update", "agent-final-update")],
    });
    expect(
      selectTranscriptEntry(
        store.getState(),
        transcriptEntryIdFor("turn-final-update", "agent-final-update"),
      ),
    ).toStrictEqual({
      type: "message",
      id: "agent-final-update",
      turnId: "turn-final-update",
      role: "assistant",
      rendering: { mode: "staticMarkdown", source: "Second" },
      revision: 1,
    });
  });

  it("chunks only middle entries after the committed chunk entry limit", () => {
    const store = makeStore();

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemCompleted(
          eventItemCompleted,
          "commit-leading",
          "turn-middle-chunked",
          userMessage("user-leading-live", [textInput("Prompt")]),
        ),
        replay: "live",
      }),
    );
    let firstChunkAfterLimit: ReturnType<typeof selectTranscriptChunk> | null = null;

    for (let index = 0; index <= TARGET_TRANSCRIPT_CHUNK_ENTRY_LIMIT; index += 1) {
      store.dispatch(
        threadRuntimeEventBuffered({
          notification: itemCompleted(
            eventItemCompleted,
            `commit-middle-${String(index)}`,
            "turn-middle-chunked",
            agentMessage(`agent-middle-${String(index)}`, `Middle ${String(index)}`, "commentary"),
          ),
          replay: "live",
        }),
      );

      if (index === TARGET_TRANSCRIPT_CHUNK_ENTRY_LIMIT - 1) {
        firstChunkAfterLimit = selectTranscriptChunk(
          store.getState(),
          "turn-middle-chunked:chunk:0",
        );
      }
    }
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemCompleted(
          eventItemCompleted,
          "commit-final",
          "turn-middle-chunked",
          agentMessage("agent-final-live", "Final", "final_answer"),
        ),
        replay: "live",
      }),
    );

    expect(selectTranscriptTurn(store.getState(), "turn-middle-chunked")).toStrictEqual({
      id: "turn-middle-chunked",
      status: "inProgress",
      originalFirstItemId: "user-leading-live",
      leadingPromptEntryId: transcriptEntryIdFor("turn-middle-chunked", "user-leading-live"),
      middleChunkIds: ["turn-middle-chunked:chunk:0", "turn-middle-chunked:chunk:1"],
      middleEntryCount: TARGET_TRANSCRIPT_CHUNK_ENTRY_LIMIT + 1,
      finalAssistantEntryIds: [transcriptEntryIdFor("turn-middle-chunked", "agent-final-live")],
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
