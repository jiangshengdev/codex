import { describe, expect, it } from "vitest";
import type {
  ThreadProjectionAttachResponse,
  ThreadProjectionEventNotification,
} from "@codex-protocol/v2";
import { makeStore } from "@/app/store";
import { createActiveThreadProjection } from "@/features/activeThreadSession/activeThreadProjection";
import {
  activeThreadReadModelSlotCreated,
  activeThreadReadModelTransitionApplied,
} from "@/features/activeThreadSession/activeThreadSessionReadModel";
import {
  attachBaseline,
  eventItemCompleted,
  eventItemStarted,
} from "@/features/projection/__tests__/projectionFixtures";
import {
  attachWithTurns,
  baseTurn,
  collabAgentState,
  collabAgentToolCall,
  eventWithEnvelope,
  inProgressTurn,
  itemCompleted,
  itemStarted,
} from "@/features/projection/__tests__/projectionTestBuilders";
import {
  selectTranscriptEntry,
  selectTranscriptTurn,
  transcriptEntryIdFor,
} from "../transcriptStateSlice";

const turnId = "collab-attach-turn";
const itemId = "collab-attach-item";

const attachTranscript = (response: ThreadProjectionAttachResponse) => {
  const store = makeStore();
  const identity = { threadId: response.snapshot.thread.id, instanceId: "collab-attach" };
  const projection = createActiveThreadProjection({
    threadId: identity.threadId,
    attachResponse: response,
  });
  let sessionRevision = 0;
  let headCommitId = response.snapshot.headCommitId;
  store.dispatch(activeThreadReadModelSlotCreated(identity));
  const flush = () => {
    store.dispatch(
      activeThreadReadModelTransitionApplied({
        identity,
        sessionRevision: ++sessionRevision,
        facts: projection.flush().readModelFacts,
      }),
    );
  };
  flush();
  return {
    entry: () =>
      selectTranscriptEntry(
        store.getState(),
        identity.threadId,
        transcriptEntryIdFor(turnId, itemId),
      ),
    turn: () => selectTranscriptTurn(store.getState(), identity.threadId, turnId),
    accept: (notification: ThreadProjectionEventNotification) => {
      const event = eventWithEnvelope(notification, { parentCommitId: headCommitId });
      expect(projection.handleEvent(event)).toStrictEqual({ type: "accepted" });
      headCommitId = event.commitId;
      flush();
    },
  };
};

describe("collaboration activity across a mid-flight attach", () => {
  it("shows an attached wait immediately and updates its completion in place", () => {
    const running = collabAgentToolCall(itemId, "wait", "inProgress");
    const transcript = attachTranscript(
      attachWithTurns(attachBaseline, [inProgressTurn(turnId, [running])]),
    );
    expect(transcript.entry()).toMatchObject({
      type: "collabAgent",
      title: { kind: "agentsWaiting" },
    });
    transcript.accept(
      itemCompleted(
        eventItemCompleted,
        "collab-finished",
        turnId,
        collabAgentToolCall(itemId, "wait", "completed"),
      ),
    );
    expect(transcript.entry()).toMatchObject({
      type: "collabAgent",
      title: { kind: "agentsFinishedWaiting" },
    });
    expect(transcript.turn()).toMatchObject({ middleEntryCount: 1 });
  });

  it.each([
    ["wait", "completed"],
    ["wait", "failed"],
    ["wait", "interrupted"],
    ["resumeAgent", "completed"],
    ["resumeAgent", "failed"],
    ["resumeAgent", "interrupted"],
  ] as const)(
    "settles attached %s as %s like continuous subscription without duplicate rows",
    (tool, status) => {
      const running = collabAgentToolCall(itemId, tool, "inProgress", {
        receiverThreadIds: ["agent-a"],
      });
      const terminal = collabAgentToolCall(itemId, tool, status, {
        receiverThreadIds: ["agent-a"],
        agentsStates: {
          "agent-a": collabAgentState(
            status === "completed" ? "completed" : "errored",
            "Result from agent",
          ),
        },
      });
      const attached = attachTranscript(
        attachWithTurns(attachBaseline, [inProgressTurn(turnId, [running])]),
      );
      const continuous = attachTranscript(
        attachWithTurns(attachBaseline, [inProgressTurn(turnId)]),
      );
      const start = itemStarted(eventItemStarted, "collab-start", turnId, running);
      continuous.accept(start);
      expect(attached.entry()).toStrictEqual(continuous.entry());
      const beforeTurn = attached.turn();
      attached.accept(start);
      expect(attached.entry()).toStrictEqual(continuous.entry());
      const completion = itemCompleted(eventItemCompleted, "collab-end", turnId, terminal);
      attached.accept(completion);
      continuous.accept(completion);
      expect(attached.entry()).toStrictEqual(continuous.entry());
      expect(attached.entry()).toMatchObject({
        title: { kind: tool === "wait" ? "agentsFinishedWaiting" : "agentResumed" },
        details: [
          {
            kind: "copy",
            copy: {
              kind: "agentState",
              status: status === "completed" ? "completed" : "errored",
              messagePreview: "Result from agent",
            },
          },
        ],
      });
      expect(attached.turn()).toMatchObject({
        middleEntryCount: 1,
        middleChunkIds: beforeTurn?.middleChunkIds,
      });
      attached.accept(itemCompleted(eventItemCompleted, "collab-end-replayed", turnId, terminal));
      expect(attached.turn()).toMatchObject({
        middleEntryCount: 1,
        middleChunkIds: beforeTurn?.middleChunkIds,
      });
      expect(attached.entry()).toMatchObject({
        title: { kind: tool === "wait" ? "agentsFinishedWaiting" : "agentResumed" },
      });
    },
  );

  it.each(["wait", "resumeAgent"] as const)(
    "keeps completed %s snapshots unchanged under repeated lifecycle events",
    (tool) => {
      const terminal = collabAgentToolCall(itemId, tool, "completed", {
        receiverThreadIds: ["agent-a"],
      });
      const transcript = attachTranscript(
        attachWithTurns(attachBaseline, [baseTurn(turnId, [terminal])]),
      );
      const before = transcript.entry();
      const beforeTurn = transcript.turn();
      transcript.accept(
        itemStarted(
          eventItemStarted,
          "old-start",
          turnId,
          collabAgentToolCall(itemId, tool, "inProgress", { receiverThreadIds: ["agent-a"] }),
        ),
      );
      transcript.accept(itemCompleted(eventItemCompleted, "old-end", turnId, terminal));
      expect(transcript.entry()).toBe(before);
      expect(transcript.turn()).toBe(beforeTurn);
    },
  );

  it("preserves the missing receiver rule when resuming an agent", () => {
    const transcript = attachTranscript(
      attachWithTurns(attachBaseline, [
        inProgressTurn(turnId, [collabAgentToolCall(itemId, "resumeAgent", "inProgress")]),
      ]),
    );
    expect(transcript.entry()).toBeNull();
    transcript.accept(
      itemCompleted(
        eventItemCompleted,
        "resume-no-receiver",
        turnId,
        collabAgentToolCall(itemId, "resumeAgent", "failed"),
      ),
    );
    expect(transcript.entry()).toBeNull();
    expect(transcript.turn()).toMatchObject({ middleEntryCount: 0 });
  });
});
