import { describe, expect, it } from "vitest";
import { makeStore } from "@/app/store";
import {
  attachBaseline,
  attachReplacement,
  eventItemCompleted,
  eventItemStarted,
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
  textInput,
  userMessage,
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

describe("transcript state replay and event dedup", () => {
  it("ignores snapshot duplicate reasoning without changing transcript or scroll key", () => {
    const store = makeStore();
    const snapshotTurn = baseTurn("turn-snapshot-duplicate", [
      reasoningItem("reasoning-snapshot-duplicate", ["Already attached"]),
    ]);

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [snapshotTurn])));
    const attachKey = selectCommittedTranscriptScrollCommitKey(store.getState());
    const beforeTurn = selectTranscriptTurn(store.getState(), "turn-snapshot-duplicate");
    const beforeEntry = selectTranscriptEntry(
      store.getState(),
      transcriptEntryIdFor("turn-snapshot-duplicate", "reasoning-snapshot-duplicate"),
    );

    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemCompleted(
          eventItemCompleted,
          "commit-snapshot-duplicate",
          "turn-snapshot-duplicate",
          reasoningItem("reasoning-snapshot-duplicate", ["Live replay should be ignored"]),
        ),
        replay: "snapshotDuplicate",
      }),
    );

    expect(selectCommittedTranscriptScrollCommitKey(store.getState())).toBe(attachKey);
    expect(selectTranscriptTurn(store.getState(), "turn-snapshot-duplicate")).toStrictEqual(
      beforeTurn,
    );
    expect(
      selectTranscriptEntry(
        store.getState(),
        transcriptEntryIdFor("turn-snapshot-duplicate", "reasoning-snapshot-duplicate"),
      ),
    ).toStrictEqual(beforeEntry);
  });

  it("ignores snapshot duplicate itemStarted and itemCompleted without changing transcript", () => {
    const store = makeStore();
    const snapshotItem = agentMessage("agent-snapshot-duplicate-live", "Already attached");
    const snapshotTurn = baseTurn("turn-snapshot-duplicate-live", [snapshotItem]);

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [snapshotTurn])));
    const attachKey = selectCommittedTranscriptScrollCommitKey(store.getState());
    const beforeTurn = selectTranscriptTurn(store.getState(), "turn-snapshot-duplicate-live");
    const beforeEntry = selectTranscriptEntry(
      store.getState(),
      transcriptEntryIdFor("turn-snapshot-duplicate-live", "agent-snapshot-duplicate-live"),
    );

    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemStarted(
          eventItemStarted,
          "commit-duplicate-started",
          "turn-snapshot-duplicate-live",
          snapshotItem,
        ),
        replay: "snapshotDuplicate",
      }),
    );
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemCompleted(
          eventItemCompleted,
          "commit-duplicate-completed",
          "turn-snapshot-duplicate-live",
          agentMessage("agent-snapshot-duplicate-live", "Replay ignored"),
        ),
        replay: "snapshotDuplicate",
      }),
    );

    expect(selectCommittedTranscriptScrollCommitKey(store.getState())).toBe(attachKey);
    expect(selectTranscriptTurn(store.getState(), "turn-snapshot-duplicate-live")).toStrictEqual(
      beforeTurn,
    );
    expect(
      selectTranscriptEntry(
        store.getState(),
        transcriptEntryIdFor("turn-snapshot-duplicate-live", "agent-snapshot-duplicate-live"),
      ),
    ).toStrictEqual(beforeEntry);
  });

  it("uses commitId to keep repeated completed reasoning in one entry and count", () => {
    const store = makeStore();
    const turnId = "turn-reasoning-duplicate";
    const itemId = "reasoning-duplicate";

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemCompleted(
          eventItemCompleted,
          "commit-reasoning-duplicate",
          turnId,
          reasoningItem(itemId, ["First"]),
        ),
        replay: "live",
      }),
    );
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemCompleted(
          eventItemCompleted,
          "commit-reasoning-duplicate",
          turnId,
          reasoningItem(itemId, ["Second authoritative summary"]),
        ),
        replay: "live",
      }),
    );

    expect({
      turn: selectTranscriptTurn(store.getState(), turnId),
      chunk: selectTranscriptChunk(store.getState(), `${turnId}:chunk:0`),
    }).toStrictEqual({
      turn: {
        id: turnId,
        status: "inProgress",
        originalFirstItemId: itemId,
        leadingPromptEntryId: null,
        middleChunkIds: [`${turnId}:chunk:0`],
        middleEntryCount: 1,
        finalAssistantEntryIds: [],
      },
      chunk: {
        id: `${turnId}:chunk:0`,
        turnId,
        revision: 1,
        entries: [
          {
            type: "reasoning",
            id: itemId,
            turnId,
            lifecycle: "completed",
            source: "First",
            revision: 0,
          },
        ],
      },
    });
  });

  it("deduplicates started activity replay while isolating the same raw id across turns", () => {
    const store = makeStore();
    const itemId = "collab-replayed";
    const turnA = "turn-collab-replay-a";
    const turnB = "turn-collab-replay-b";
    const startedA = collabAgentToolCall(itemId, "wait", "inProgress", {
      receiverThreadIds: ["agent-a"],
    });

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemStarted(eventItemStarted, "commit-collab-replay-a", turnA, startedA),
        replay: "live",
      }),
    );
    const beforeReplay = selectTranscriptEntry(
      store.getState(),
      transcriptEntryIdFor(turnA, itemId),
    );

    for (const payload of [
      {
        notification: itemCompleted(
          eventItemCompleted,
          "commit-collab-replay-a",
          turnA,
          collabAgentToolCall(itemId, "wait", "completed"),
        ),
        replay: "live" as const,
      },
      {
        notification: itemStarted(eventItemStarted, "commit-collab-restarted", turnA, startedA),
        replay: "live" as const,
      },
      {
        notification: itemCompleted(
          eventItemCompleted,
          "commit-collab-snapshot-duplicate",
          turnA,
          collabAgentToolCall(itemId, "wait", "completed"),
        ),
        replay: "snapshotDuplicate" as const,
      },
    ]) {
      store.dispatch(threadRuntimeEventBuffered(payload));
    }

    expect(selectTranscriptEntry(store.getState(), transcriptEntryIdFor(turnA, itemId))).toBe(
      beforeReplay,
    );
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemStarted(
          eventItemStarted,
          "commit-collab-replay-b",
          turnB,
          collabAgentToolCall(itemId, "wait", "inProgress", {
            receiverThreadIds: ["agent-b"],
          }),
        ),
        replay: "live",
      }),
    );

    expect(
      selectTranscriptEntry(store.getState(), transcriptEntryIdFor(turnA, itemId)),
    ).toStrictEqual({
      type: "collabAgent",
      id: itemId,
      turnId: turnA,
      title: {
        kind: "agentsWaiting",
        receiver: "agent-a",
        receiverCount: 1,
      },
      details: [],
      revision: 0,
    });
    expect(
      selectTranscriptEntry(store.getState(), transcriptEntryIdFor(turnB, itemId)),
    ).toStrictEqual({
      type: "collabAgent",
      id: itemId,
      turnId: turnB,
      title: {
        kind: "agentsWaiting",
        receiver: "agent-b",
        receiverCount: 1,
      },
      details: [],
      revision: 0,
    });
    expect(selectTranscriptTurn(store.getState(), turnA)?.middleEntryCount).toBe(1);
    expect(selectTranscriptTurn(store.getState(), turnB)?.middleEntryCount).toBe(1);
  });

  it("replaces live started activity with the authoritative terminal attach snapshot", () => {
    const store = makeStore();
    const turnId = "turn-collab-replacement";
    const itemId = "collab-replacement";

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemStarted(
          eventItemStarted,
          "commit-collab-replacement-started",
          turnId,
          collabAgentToolCall(itemId, "wait", "inProgress", {
            receiverThreadIds: ["started-agent"],
            prompt: "started prompt",
            model: "started-model",
            reasoningEffort: "high",
            agentsStates: { "started-agent": collabAgentState("running") },
          }),
        ),
        replay: "live",
      }),
    );
    expect(
      selectTranscriptEntry(store.getState(), transcriptEntryIdFor(turnId, itemId)),
    ).toStrictEqual({
      type: "collabAgent",
      id: itemId,
      turnId,
      title: {
        kind: "agentsWaiting",
        receiver: "started-agent",
        receiverCount: 1,
      },
      details: [],
      revision: 0,
    });

    store.dispatch(
      threadRuntimeAttached(
        attachWithTurns(attachReplacement, [
          baseTurn(turnId, [
            userMessage("user-collab-replacement", [textInput("Prompt")]),
            agentMessage("agent-before-collab-replacement", "Before", "commentary"),
            collabAgentToolCall(itemId, "wait", "completed", {
              receiverThreadIds: ["terminal-agent"],
              agentsStates: { "terminal-agent": collabAgentState("completed", "Terminal") },
            }),
            agentMessage("agent-after-collab-replacement", "After", "commentary"),
            agentMessage("agent-final-collab-replacement", "Final", "final_answer"),
          ]),
        ]),
      ),
    );

    expect(selectTranscriptTurn(store.getState(), turnId)).toMatchObject({
      leadingPromptEntryId: transcriptEntryIdFor(turnId, "user-collab-replacement"),
      middleEntryCount: 3,
      finalAssistantEntryIds: [transcriptEntryIdFor(turnId, "agent-final-collab-replacement")],
    });
    const chunk = selectTranscriptChunk(store.getState(), `${turnId}:chunk:0`);
    expect(chunk?.entries.map(({ id }) => id)).toStrictEqual([
      "agent-before-collab-replacement",
      itemId,
      "agent-after-collab-replacement",
    ]);
    expect(chunk?.entries.filter(({ id }) => id === itemId)).toStrictEqual([
      {
        type: "collabAgent",
        id: itemId,
        turnId,
        title: { kind: "agentsFinishedWaiting" },
        details: [
          {
            kind: "copy",
            copy: {
              kind: "agentState",
              threadId: "terminal-agent",
              status: "completed",
              messagePreview: "Terminal",
            },
          },
        ],
        revision: 0,
      },
    ]);
    const stored =
      store.getState().transcriptState.entriesById[transcriptEntryIdFor(turnId, itemId)];
    expect(stored).toMatchObject({
      receiverThreadIds: ["terminal-agent"],
      promptPreview: null,
      model: null,
      reasoningEffort: null,
    });
    const storedJson = JSON.stringify(stored);
    for (const staleFact of ["started-agent", "started prompt", "started-model"]) {
      expect(storedJson).not.toContain(staleFact);
    }
  });
});
