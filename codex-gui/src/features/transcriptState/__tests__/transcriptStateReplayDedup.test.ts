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
  baseTurn,
  itemCompleted,
  itemStarted,
} from "@/features/projection/__tests__/projectionTestBuilders";
import {
  threadRuntimeAttached,
  threadRuntimeEventBuffered,
} from "@/features/threadRuntime/threadRuntimeSlice";
import {
  selectCommittedTranscriptScrollCommitKey,
  selectTranscriptEntry,
  selectTranscriptLiveItemsForTurn,
  selectTranscriptTurn,
} from "../transcriptStateSlice";

describe("transcript state replay and event dedup", () => {
  it("ignores snapshot duplicate live items without changing transcript or scroll key", () => {
    const store = makeStore();
    const snapshotTurn = baseTurn("turn-snapshot-duplicate", [
      agentMessage("agent-snapshot-duplicate", "Already attached"),
    ]);

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [snapshotTurn])));
    const attachKey = selectCommittedTranscriptScrollCommitKey(store.getState());
    const beforeTurn = selectTranscriptTurn(store.getState(), "turn-snapshot-duplicate");
    const beforeEntry = selectTranscriptEntry(store.getState(), "agent-snapshot-duplicate");

    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemCompleted(
          eventItemCompleted,
          "commit-snapshot-duplicate",
          "turn-snapshot-duplicate",
          agentMessage("agent-snapshot-duplicate", "Live replay should be ignored"),
        ),
        replay: "snapshotDuplicate",
      }),
    );

    expect(selectCommittedTranscriptScrollCommitKey(store.getState())).toBe(attachKey);
    expect(selectTranscriptTurn(store.getState(), "turn-snapshot-duplicate")).toStrictEqual(
      beforeTurn,
    );
    expect(selectTranscriptEntry(store.getState(), "agent-snapshot-duplicate")).toStrictEqual(
      beforeEntry,
    );
  });

  it("ignores snapshot duplicate itemStarted and itemCompleted without touching live slots", () => {
    const store = makeStore();
    const snapshotItem = agentMessage("agent-snapshot-duplicate-live", "Already attached");
    const snapshotTurn = baseTurn("turn-snapshot-duplicate-live", [snapshotItem]);

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [snapshotTurn])));
    const attachKey = selectCommittedTranscriptScrollCommitKey(store.getState());
    const beforeTurn = selectTranscriptTurn(store.getState(), "turn-snapshot-duplicate-live");
    const beforeEntry = selectTranscriptEntry(store.getState(), "agent-snapshot-duplicate-live");

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

    expect(
      selectTranscriptLiveItemsForTurn(store.getState(), "turn-snapshot-duplicate-live"),
    ).toStrictEqual([]);
    expect(selectCommittedTranscriptScrollCommitKey(store.getState())).toBe(attachKey);
    expect(selectTranscriptTurn(store.getState(), "turn-snapshot-duplicate-live")).toStrictEqual(
      beforeTurn,
    );
    expect(selectTranscriptEntry(store.getState(), "agent-snapshot-duplicate-live")).toStrictEqual(
      beforeEntry,
    );
  });

  it("uses commitId to avoid applying the same live notification twice", () => {
    const store = makeStore();

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemCompleted(
          eventItemCompleted,
          "commit-duplicate",
          "turn-duplicate",
          agentMessage("agent-first", "First"),
        ),
        replay: "live",
      }),
    );
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemCompleted(
          eventItemCompleted,
          "commit-duplicate",
          "turn-duplicate",
          agentMessage("agent-second", "Second should be ignored"),
        ),
        replay: "live",
      }),
    );

    expect(selectTranscriptTurn(store.getState(), "turn-duplicate")).toMatchObject({
      finalAssistantEntryIds: ["agent-first"],
    });
    expect(selectTranscriptEntry(store.getState(), "agent-first")).toStrictEqual({
      type: "message",
      id: "agent-first",
      turnId: "turn-duplicate",
      role: "assistant",
      source: "First",
      sourceKind: "markdown",
      phase: "final_answer",
      revision: 0,
    });
  });
});
