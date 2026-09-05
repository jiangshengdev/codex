import { describe, expect, it } from "vitest";
import { makeStore } from "@/app/store";
import { activeThreadReadModelTransitionApplied } from "@/features/activeThreadSession/activeThreadSessionReadModel";
import type {
  ActiveThreadProjectionAcceptedEvent,
  ActiveThreadProjectionReadModelFact,
} from "@/features/activeThreadSession/activeThreadProjectionFacts";
import {
  attachBaseline,
  attachReplacement,
  eventAgentMessageDelta,
  eventItemCompleted,
  eventItemStarted,
  eventReasoningSummaryTextDelta,
} from "@/features/projection/__tests__/projectionFixtures";
import {
  TARGET_TRANSCRIPT_CHUNK_ENTRY_LIMIT,
  selectTranscriptChunk,
  selectTranscriptContextPage,
  selectTranscriptEntry,
  selectTranscriptTurn,
  selectTranscriptTurnFragment,
  transcriptEntryIdFor,
} from "../transcriptStateSlice";
import {
  selectLastTranscriptFragmentIdsByTurnIdFromTranscriptState,
  selectTranscriptChunkFromTranscriptState,
  selectTranscriptContextPageFromTranscriptState,
  selectTranscriptEntryFromTranscriptState,
  selectTranscriptTurnFragmentFromTranscriptState,
} from "../transcriptStateSelectors";
import {
  agentMessageDelta,
  agentMessage,
  attachWithTurns,
  baseTurn,
  collabAgentToolCall,
  contextCompaction,
  itemCompleted,
  itemStarted,
  reasoningItem,
  reasoningSummaryTextDelta,
  subAgentActivity,
} from "@/features/projection/__tests__/projectionTestBuilders";

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

describe("transcript state selector cache", () => {
  it("keeps context page topology selectors stable when entry revisions change", () => {
    const store = makeStore();
    const turnId = "turn-context-page-cache";
    const activityId = "activity-context-page-cache";

    store.dispatch(
      threadRuntimeAttached(
        attachWithTurns(attachBaseline, [
          baseTurn(turnId, [
            contextCompaction("compaction-context-page-cache"),
            subAgentActivity(activityId, "started", "agents/cache"),
          ]),
        ]),
      ),
    );

    const beforePage = selectTranscriptContextPage(store.getState(), "context-page:2");
    const fragmentId = beforePage?.turnFragmentIds[0];
    expect(fragmentId).toBeDefined();
    const beforeFragment = selectTranscriptTurnFragment(store.getState(), fragmentId ?? "");
    const entryId = transcriptEntryIdFor(turnId, activityId);
    const beforeEntry = selectTranscriptEntry(store.getState(), entryId);
    const transcriptState = store.getState().transcriptState;
    const lastFragmentIdsByTurnId =
      selectLastTranscriptFragmentIdsByTurnIdFromTranscriptState(transcriptState);

    expect(lastFragmentIdsByTurnId).toStrictEqual({ [turnId]: fragmentId });
    expect(selectTranscriptContextPageFromTranscriptState(transcriptState, "context-page:2")).toBe(
      beforePage,
    );
    expect(selectTranscriptTurnFragmentFromTranscriptState(transcriptState, fragmentId ?? "")).toBe(
      beforeFragment,
    );
    expect(selectTranscriptEntryFromTranscriptState(transcriptState, entryId)).toBe(beforeEntry);
    expect(selectLastTranscriptFragmentIdsByTurnIdFromTranscriptState(transcriptState)).toBe(
      lastFragmentIdsByTurnId,
    );

    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemCompleted(
          eventItemCompleted,
          "commit-context-page-cache-update",
          turnId,
          subAgentActivity(activityId, "interacted", "agents/cache"),
        ),
        replay: "live",
      }),
    );

    expect(selectTranscriptEntry(store.getState(), entryId)).not.toBe(beforeEntry);
    expect(selectTranscriptEntry(store.getState(), entryId)?.revision).toBe(
      (beforeEntry?.revision ?? 0) + 1,
    );
    expect(selectTranscriptContextPage(store.getState(), "context-page:2")).toBe(beforePage);
    expect(selectTranscriptTurnFragment(store.getState(), fragmentId ?? "")).toBe(beforeFragment);
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

    const entryId = transcriptEntryIdFor("turn-cached", "agent-cached");
    const firstChunk = selectTranscriptChunk(store.getState(), "turn-cached:chunk:0");
    const firstEntry = selectTranscriptEntry(store.getState(), entryId);
    const transcriptState = store.getState().transcriptState;

    expect(firstChunk).not.toBeNull();
    expect(firstEntry).not.toBeNull();
    expect(selectTranscriptChunkFromTranscriptState(transcriptState, "turn-cached:chunk:0")).toBe(
      firstChunk,
    );
    expect(selectTranscriptEntryFromTranscriptState(transcriptState, entryId)).toBe(firstEntry);
    expect(selectTranscriptChunk(store.getState(), "turn-cached:chunk:0")).toBe(firstChunk);
    expect(selectTranscriptEntry(store.getState(), entryId)).toBe(firstEntry);

    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemStarted(
          eventItemStarted,
          "commit-other-started",
          "turn-other",
          agentMessage("agent-other-started", "Started should not affect cached chunk"),
        ),
        replay: "live",
      }),
    );

    expect(selectTranscriptChunk(store.getState(), "turn-cached:chunk:0")).toBe(firstChunk);
    expect(selectTranscriptEntry(store.getState(), entryId)).toBe(firstEntry);

    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemCompleted(
          eventItemCompleted,
          "commit-other-completed",
          "turn-other",
          agentMessage("agent-other-completed", "Other turn answer"),
        ),
        replay: "live",
      }),
    );

    expect(selectTranscriptChunk(store.getState(), "turn-cached:chunk:0")).toBe(firstChunk);
    expect(selectTranscriptEntry(store.getState(), entryId)).toBe(firstEntry);
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

    const cachedEntryId = transcriptEntryIdFor("turn-cached", "agent-cached");
    const beforeUpdateChunk = selectTranscriptChunk(store.getState(), "turn-cached:chunk:0");
    const beforeUpdateEntry = selectTranscriptEntry(store.getState(), cachedEntryId);

    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemCompleted(
          eventItemCompleted,
          "commit-cached-append",
          "turn-cached",
          agentMessage("agent-cached-live", "Live answer", "commentary"),
        ),
        replay: "live",
      }),
    );

    const afterUpdateChunk = selectTranscriptChunk(store.getState(), "turn-cached:chunk:0");

    expect(afterUpdateChunk).not.toBe(beforeUpdateChunk);
    expect(selectTranscriptEntry(store.getState(), cachedEntryId)).toBe(beforeUpdateEntry);
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
          rendering: { mode: "staticMarkdown", source: "Cached answer" },
          revision: 0,
        },
        {
          type: "message",
          id: "agent-cached-live",
          turnId: "turn-cached",
          role: "assistant",
          rendering: { mode: "staticMarkdown", source: "Live answer" },
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

    const entryId = transcriptEntryIdFor("turn-reattach", "agent-reattach");
    const beforeReattachChunk = selectTranscriptChunk(store.getState(), "turn-reattach:chunk:0");
    const beforeReattachEntry = selectTranscriptEntry(store.getState(), entryId);

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
    const afterReattachEntry = selectTranscriptEntry(store.getState(), entryId);

    expect(afterReattachChunk).not.toBe(beforeReattachChunk);
    expect(afterReattachEntry).not.toBe(beforeReattachEntry);
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
          rendering: { mode: "staticMarkdown", source: "After reconnect" },
          revision: 0,
        },
      ],
    });
    expect(afterReattachEntry).toBe(afterReattachChunk?.entries[0]);
  });

  it("returns a stable middle chunk view while that turn is unchanged", () => {
    const store = makeStore();

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemStarted(
          eventItemStarted,
          "commit-live-cache-started",
          "turn-live-cache",
          agentMessage("agent-live-cache", "Live cache", "commentary"),
        ),
        replay: "live",
      }),
    );

    const entryId = transcriptEntryIdFor("turn-live-cache", "agent-live-cache");
    const firstChunk = selectTranscriptChunk(store.getState(), "turn-live-cache:chunk:0");
    expect(firstChunk).not.toBeNull();
    expect(firstChunk?.entries).toStrictEqual([]);
    expect(selectTranscriptEntry(store.getState(), entryId)).toBeNull();
    expect(selectTranscriptChunk(store.getState(), "turn-live-cache:chunk:0")).toBe(firstChunk);

    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemCompleted(
          eventItemCompleted,
          "commit-unrelated-committed",
          "turn-unrelated-committed",
          agentMessage("agent-unrelated-committed", "Unrelated committed"),
        ),
        replay: "live",
      }),
    );

    expect(selectTranscriptChunk(store.getState(), "turn-live-cache:chunk:0")).toBe(firstChunk);
    expect(selectTranscriptEntry(store.getState(), entryId)).toBeNull();
  });

  it("returns a new middle chunk view when another started item enters the turn", () => {
    const store = makeStore();

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemStarted(
          eventItemStarted,
          "commit-live-cache-first",
          "turn-live-cache-update",
          agentMessage("agent-live-cache-first", "First", "commentary"),
        ),
        replay: "live",
      }),
    );
    const beforeUpdate = selectTranscriptChunk(store.getState(), "turn-live-cache-update:chunk:0");

    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemStarted(
          eventItemStarted,
          "commit-live-cache-second",
          "turn-live-cache-update",
          agentMessage("agent-live-cache-second", "Second", "commentary"),
        ),
        replay: "live",
      }),
    );

    const afterUpdate = selectTranscriptChunk(store.getState(), "turn-live-cache-update:chunk:0");
    expect(afterUpdate).not.toBe(beforeUpdate);
    expect(afterUpdate?.revision).toBe((beforeUpdate?.revision ?? 0) + 1);
    expect(afterUpdate?.entries).toStrictEqual([]);
    expect(
      selectTranscriptEntry(
        store.getState(),
        transcriptEntryIdFor("turn-live-cache-update", "agent-live-cache-first"),
      ),
    ).toBeNull();
    expect(
      selectTranscriptEntry(
        store.getState(),
        transcriptEntryIdFor("turn-live-cache-update", "agent-live-cache-second"),
      ),
    ).toBeNull();
  });

  it("returns a new middle chunk view when delta updates that live entry", () => {
    const store = makeStore();

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
    const initialItem = agentMessage("agent-live-cache-delta", "", "commentary");

    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemStarted(
          eventItemStarted,
          "commit-live-cache-delta-started",
          "turn-live-cache-delta",
          initialItem,
        ),
        replay: "live",
      }),
    );

    const entryId = transcriptEntryIdFor("turn-live-cache-delta", "agent-live-cache-delta");
    const beforeUpdate = selectTranscriptChunk(store.getState(), "turn-live-cache-delta:chunk:0");
    expect(beforeUpdate?.revision).toBe(1);
    expect(beforeUpdate?.entries).toStrictEqual([]);
    expect(selectTranscriptEntry(store.getState(), entryId)).toBeNull();

    store.dispatch(
      threadRuntimeDeltasAccepted({
        notifications: [
          agentMessageDelta(
            eventAgentMessageDelta,
            "turn-live-cache-delta",
            "agent-live-cache-delta",
            "Streamed text",
          ),
        ],
      }),
    );

    const afterUpdate = selectTranscriptChunk(store.getState(), "turn-live-cache-delta:chunk:0");
    const expectedStreamingView = {
      type: "message" as const,
      id: "agent-live-cache-delta",
      turnId: "turn-live-cache-delta",
      role: "assistant" as const,
      rendering: { mode: "streamingMarkdown" as const, source: "Streamed text" },
      revision: 1,
    };

    expect(afterUpdate).not.toBe(beforeUpdate);
    expect(selectTranscriptEntry(store.getState(), entryId)).toStrictEqual(expectedStreamingView);
    expect(afterUpdate).toStrictEqual({
      id: "turn-live-cache-delta:chunk:0",
      turnId: "turn-live-cache-delta",
      revision: 2,
      entries: [expectedStreamingView],
    });
  });

  it("returns a new middle chunk view when a live entry settles in place", () => {
    const store = makeStore();

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
    const initialItem = agentMessage("agent-live-cache-settled", "", "commentary");

    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemStarted(
          eventItemStarted,
          "commit-live-cache-settled-started",
          "turn-live-cache-settled",
          initialItem,
        ),
        replay: "live",
      }),
    );

    store.dispatch(
      threadRuntimeDeltasAccepted({
        notifications: [
          agentMessageDelta(
            eventAgentMessageDelta,
            "turn-live-cache-settled",
            "agent-live-cache-settled",
            "Streaming cache answer",
          ),
        ],
      }),
    );

    const entryId = transcriptEntryIdFor("turn-live-cache-settled", "agent-live-cache-settled");
    const beforeSettlement = selectTranscriptChunk(
      store.getState(),
      "turn-live-cache-settled:chunk:0",
    );
    const beforeSettlementEntry = selectTranscriptEntry(store.getState(), entryId);
    expect(beforeSettlement).toStrictEqual({
      id: "turn-live-cache-settled:chunk:0",
      turnId: "turn-live-cache-settled",
      revision: 2,
      entries: [
        {
          type: "message",
          id: "agent-live-cache-settled",
          turnId: "turn-live-cache-settled",
          role: "assistant",
          rendering: { mode: "streamingMarkdown", source: "Streaming cache answer" },
          revision: 1,
        },
      ],
    });
    expect(beforeSettlementEntry).toBe(beforeSettlement?.entries[0]);

    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemCompleted(
          eventItemCompleted,
          "commit-live-cache-settled-completed",
          "turn-live-cache-settled",
          agentMessage("agent-live-cache-settled", "Completed cache answer", "commentary"),
        ),
        replay: "live",
      }),
    );

    const afterSettlement = selectTranscriptChunk(
      store.getState(),
      "turn-live-cache-settled:chunk:0",
    );
    const afterSettlementEntry = selectTranscriptEntry(store.getState(), entryId);

    expect(afterSettlement).not.toBe(beforeSettlement);
    expect(afterSettlementEntry).not.toBe(beforeSettlementEntry);
    expect(afterSettlement).toStrictEqual({
      id: "turn-live-cache-settled:chunk:0",
      turnId: "turn-live-cache-settled",
      revision: (beforeSettlement?.revision ?? 0) + 1,
      entries: [
        {
          type: "message",
          id: "agent-live-cache-settled",
          turnId: "turn-live-cache-settled",
          role: "assistant",
          rendering: { mode: "staticMarkdown", source: "Completed cache answer" },
          revision: 2,
        },
      ],
    });
    expect(afterSettlementEntry).toBe(afterSettlement?.entries[0]);
  });

  it("invalidates only the changed sub-agent activity entry and its middle chunk view", () => {
    const store = makeStore();
    const turnId = "turn-sub-agent-cache";
    const targetActivity = subAgentActivity(
      "activity-sub-agent-cache-0",
      "started",
      "agents/cache-0",
    );
    const stableActivity = subAgentActivity(
      "activity-sub-agent-cache-1",
      "started",
      "agents/cache-1",
    );
    const activities = [
      targetActivity,
      stableActivity,
      ...Array.from({ length: TARGET_TRANSCRIPT_CHUNK_ENTRY_LIMIT - 1 }, (_, index) => {
        const activityIndex = index + 2;
        return subAgentActivity(
          `activity-sub-agent-cache-${String(activityIndex)}`,
          "started",
          `agents/cache-${String(activityIndex)}`,
        );
      }),
    ];

    store.dispatch(
      threadRuntimeAttached(attachWithTurns(attachBaseline, [baseTurn(turnId, activities)])),
    );

    const targetEntryId = transcriptEntryIdFor(turnId, targetActivity.id);
    const stableEntryId = transcriptEntryIdFor(turnId, stableActivity.id);
    const firstChunkId = `${turnId}:chunk:0`;
    const secondChunkId = `${turnId}:chunk:1`;
    const beforeTargetEntry = selectTranscriptEntry(store.getState(), targetEntryId);
    const beforeStableEntry = selectTranscriptEntry(store.getState(), stableEntryId);
    const beforeFirstChunk = selectTranscriptChunk(store.getState(), firstChunkId);
    const beforeSecondChunk = selectTranscriptChunk(store.getState(), secondChunkId);

    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemCompleted(
          eventItemCompleted,
          "commit-sub-agent-cache-update",
          turnId,
          subAgentActivity(targetActivity.id, "interacted", "agents/cache-0"),
        ),
        replay: "live",
      }),
    );

    const afterTargetEntry = selectTranscriptEntry(store.getState(), targetEntryId);
    const afterFirstChunk = selectTranscriptChunk(store.getState(), firstChunkId);

    expect(afterTargetEntry).not.toBe(beforeTargetEntry);
    expect(afterTargetEntry).toStrictEqual({
      type: "subAgentActivity",
      id: targetActivity.id,
      turnId,
      title: {
        kind: "agentInteracted",
        agentThreadId: "agent-thread-id",
        agentPath: "agents/cache-0",
      },
      details: [],
      revision: 1,
    });
    expect(selectTranscriptEntry(store.getState(), stableEntryId)).toBe(beforeStableEntry);
    expect(afterFirstChunk).not.toBe(beforeFirstChunk);
    expect(afterFirstChunk?.entries.map(({ id }) => id)).toStrictEqual(
      beforeFirstChunk?.entries.map(({ id }) => id),
    );
    expect(afterFirstChunk?.entries[1]).toBe(beforeFirstChunk?.entries[1]);
    expect(selectTranscriptChunk(store.getState(), secondChunkId)).toBe(beforeSecondChunk);
    expect(selectTranscriptTurn(store.getState(), turnId)).toMatchObject({
      middleChunkIds: [firstChunkId, secondChunkId],
      middleEntryCount: TARGET_TRANSCRIPT_CHUNK_ENTRY_LIMIT + 1,
      finalAssistantEntryIds: [],
    });
  });

  it("invalidates only the changed terminal collab entry and its middle chunk view", () => {
    const store = makeStore();
    const turnId = "turn-collab-cache";
    const target = collabAgentToolCall("collab-cache-0", "spawnAgent", "completed", {
      receiverThreadIds: ["agent-before"],
    });
    const stable = collabAgentToolCall("collab-cache-1", "spawnAgent", "completed", {
      receiverThreadIds: ["agent-stable"],
    });
    const entries = [
      target,
      stable,
      ...Array.from({ length: TARGET_TRANSCRIPT_CHUNK_ENTRY_LIMIT - 1 }, (_, index) =>
        collabAgentToolCall(`collab-cache-${String(index + 2)}`, "spawnAgent", "completed", {
          receiverThreadIds: [`agent-${String(index + 2)}`],
        }),
      ),
    ];
    store.dispatch(
      threadRuntimeAttached(attachWithTurns(attachBaseline, [baseTurn(turnId, entries)])),
    );

    const targetId = transcriptEntryIdFor(turnId, target.id);
    const stableId = transcriptEntryIdFor(turnId, stable.id);
    const firstChunkId = `${turnId}:chunk:0`;
    const secondChunkId = `${turnId}:chunk:1`;
    const beforeTarget = selectTranscriptEntry(store.getState(), targetId);
    const beforeStable = selectTranscriptEntry(store.getState(), stableId);
    const beforeFirstChunk = selectTranscriptChunk(store.getState(), firstChunkId);
    const beforeSecondChunk = selectTranscriptChunk(store.getState(), secondChunkId);

    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemCompleted(
          eventItemCompleted,
          "commit-collab-cache-update",
          turnId,
          collabAgentToolCall(target.id, "spawnAgent", "failed", {
            receiverThreadIds: ["agent-after"],
          }),
        ),
        replay: "live",
      }),
    );

    expect(selectTranscriptEntry(store.getState(), targetId)).not.toBe(beforeTarget);
    expect(selectTranscriptEntry(store.getState(), targetId)).toMatchObject({
      title: {
        kind: "agentSpawned",
        receiver: "agent-after",
        model: null,
        reasoningEffort: null,
      },
      details: [],
      revision: 1,
    });
    expect(selectTranscriptEntry(store.getState(), stableId)).toBe(beforeStable);
    expect(selectTranscriptChunk(store.getState(), firstChunkId)).not.toBe(beforeFirstChunk);
    expect(selectTranscriptChunk(store.getState(), firstChunkId)?.entries[1]).toBe(
      beforeFirstChunk?.entries[1],
    );
    expect(selectTranscriptChunk(store.getState(), secondChunkId)).toBe(beforeSecondChunk);
    expect(selectTranscriptTurn(store.getState(), turnId)).toMatchObject({
      middleChunkIds: [firstChunkId, secondChunkId],
      middleEntryCount: TARGET_TRANSCRIPT_CHUNK_ENTRY_LIMIT + 1,
    });
  });

  it("invalidates only the changed reasoning entry and its owning chunk", () => {
    const store = makeStore();
    const turnId = "turn-started-collab-cache";
    const stableItems = Array.from(
      { length: TARGET_TRANSCRIPT_CHUNK_ENTRY_LIMIT * 2 },
      (_, index) =>
        collabAgentToolCall(`stable-collab-${String(index)}`, "spawnAgent", "completed", {
          receiverThreadIds: [`stable-agent-${String(index)}`],
        }),
    );
    const target = reasoningItem("reasoning-cache", []);

    store.dispatch(
      threadRuntimeAttached(attachWithTurns(attachBaseline, [baseTurn(turnId, stableItems)])),
    );
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemStarted(eventItemStarted, "commit-reasoning-cache", turnId, target),
        replay: "live",
      }),
    );

    const targetId = transcriptEntryIdFor(turnId, target.id);
    const stableId = transcriptEntryIdFor(turnId, "stable-collab-0");
    const chunkIds = [`${turnId}:chunk:0`, `${turnId}:chunk:1`, `${turnId}:chunk:2`] as const;
    const beforeTarget = selectTranscriptEntry(store.getState(), targetId);
    const beforeStable = selectTranscriptEntry(store.getState(), stableId);
    const beforeChunks = chunkIds.map((chunkId) =>
      selectTranscriptChunk(store.getState(), chunkId),
    );

    store.dispatch(
      threadRuntimeDeltasAccepted({
        notifications: [
          reasoningSummaryTextDelta(
            eventReasoningSummaryTextDelta,
            turnId,
            target.id,
            "**Cached reasoning**",
            0,
          ),
        ],
      }),
    );

    const afterTarget = selectTranscriptEntry(store.getState(), targetId);
    const afterChunks = chunkIds.map((chunkId) => selectTranscriptChunk(store.getState(), chunkId));
    expect(afterTarget).not.toBe(beforeTarget);
    expect(afterTarget).toStrictEqual({
      type: "reasoning",
      id: target.id,
      turnId,
      lifecycle: "streaming",
      title: "Cached reasoning",
      revision: 1,
    });
    expect(selectTranscriptEntry(store.getState(), stableId)).toBe(beforeStable);
    expect(afterChunks.map((chunk, index) => chunk === beforeChunks[index])).toStrictEqual([
      true,
      true,
      false,
    ]);
    expect(afterChunks[2]?.entries.at(-1)).toBe(afterTarget);
    expect(selectTranscriptTurn(store.getState(), turnId)?.middleEntryCount).toBe(
      TARGET_TRANSCRIPT_CHUNK_ENTRY_LIMIT * 2 + 1,
    );
  });
});
