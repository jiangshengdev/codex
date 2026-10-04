import { describe, expect, it } from "vitest";
import type { ThreadItem } from "@codex-protocol/v2";
import {
  contextCompaction,
  reasoningItem,
  reasoningSummaryPartAddedDelta,
  reasoningSummaryTextDelta,
  reasoningTextDelta,
  subAgentActivity,
} from "@/features/projection/__tests__/projectionTestBuilders";
import {
  eventReasoningSummaryPartAddedDelta,
  eventReasoningSummaryTextDelta,
  eventReasoningTextDelta,
} from "@/features/projection/__tests__/projectionFixtures";
import {
  projectCompletedTranscriptItem,
  projectStartedTranscriptItem,
  projectTranscriptDelta,
} from "../transcriptItemPolicy";
import { createEmptyTranscriptState, transcriptEntryIdFor } from "../transcriptStateModel";
import { transcriptEntryView } from "../transcriptStateSelectors";

describe("transcript item policy", () => {
  it("ignores function call output in started and completed policies", () => {
    const item = {
      type: "functionCallOutput",
      id: "function-call-output-1",
      name: "lookup",
      namespace: null,
      output: "hidden output",
    } satisfies Extract<ThreadItem, { type: "functionCallOutput" }>;

    expect(projectStartedTranscriptItem(item, "turn-function-call-output")).toStrictEqual({
      kind: "ignore",
    });
    expect(projectCompletedTranscriptItem(item, "turn-function-call-output")).toStrictEqual({
      kind: "ignore",
    });
  });

  it("uses only completed context compaction as a transcript boundary", () => {
    const item = contextCompaction("compaction-1");

    expect(projectStartedTranscriptItem(item, "turn-compaction")).toStrictEqual({
      kind: "ignore",
    });
    expect(projectCompletedTranscriptItem(item, "turn-compaction")).toStrictEqual({
      kind: "contextBoundary",
      item,
    });
  });

  it("projects reasoning item lifecycle without exposing raw content", () => {
    const started = reasoningItem("reasoning-started", [], ["raw started reasoning"]);
    expect(projectStartedTranscriptItem(started, "turn-reasoning")).toStrictEqual({
      kind: "reserveReasoning",
      item: started,
    });

    const completed = reasoningItem(
      "reasoning-completed",
      ["  First  ", "\n\t", " Second\n"],
      ["raw completed reasoning"],
    );
    expect(projectCompletedTranscriptItem(completed, "turn-reasoning")).toStrictEqual({
      kind: "present",
      entry: {
        type: "reasoning",
        id: completed.id,
        turnId: "turn-reasoning",
        lifecycle: "completed",
        summaryParts: ["First", "Second"],
        revision: 0,
      },
    });
    expect(
      projectCompletedTranscriptItem(
        reasoningItem("reasoning-empty", ["", " \n\t "], ["raw reasoning"]),
        "turn-reasoning",
      ),
    ).toStrictEqual({ kind: "remove" });
  });

  it("projects reasoning summary deltas and ignores raw reasoning deltas", () => {
    const summaryText = reasoningSummaryTextDelta(
      eventReasoningSummaryTextDelta,
      "turn-reasoning",
      "reasoning-streaming",
      "Summary text",
      2,
    );
    const summaryPart = reasoningSummaryPartAddedDelta(
      eventReasoningSummaryPartAddedDelta,
      "turn-reasoning",
      "reasoning-streaming",
      3,
    );
    const raw = reasoningTextDelta(
      eventReasoningTextDelta,
      "turn-reasoning",
      "reasoning-streaming",
      "raw reasoning",
      4,
    );

    expect([
      projectTranscriptDelta(summaryText.delta),
      projectTranscriptDelta(summaryPart.delta),
      projectTranscriptDelta(raw.delta),
    ]).toStrictEqual([
      {
        kind: "reasoningSummaryText",
        delta: {
          threadId: "00000000-0000-0000-0000-000000000001",
          turnId: "turn-reasoning",
          itemId: "reasoning-streaming",
          delta: "Summary text",
          summaryIndex: 2,
        },
      },
      {
        kind: "reasoningSummaryPartAdded",
        delta: {
          threadId: "00000000-0000-0000-0000-000000000001",
          turnId: "turn-reasoning",
          itemId: "reasoning-streaming",
          summaryIndex: 3,
        },
      },
      { kind: "ignore" },
    ]);
  });

  it.each([
    [
      "started",
      {
        kind: "agentStarted",
        agentThreadId: "agent-thread-started",
        agentPath: "agents/planner",
      },
    ],
    [
      "interacted",
      {
        kind: "agentInteracted",
        agentThreadId: "agent-thread-interacted",
        agentPath: "agents/planner",
      },
    ],
    [
      "interrupted",
      {
        kind: "agentInterrupted",
        agentThreadId: "agent-thread-interrupted",
        agentPath: "agents/planner",
      },
    ],
    [
      "completed",
      {
        kind: "agentCompleted",
        agentThreadId: "agent-thread-completed",
        agentPath: "agents/planner",
      },
    ],
  ] as const)("projects completed sub-agent %s activity", (kind, title) => {
    const turnId = `turn-${kind}`;
    const item = subAgentActivity(`activity-${kind}`, kind, "agents/planner", {
      agentThreadId: `agent-thread-${kind}`,
    });

    expect(projectStartedTranscriptItem(item, turnId)).toStrictEqual({ kind: "ignore" });

    const projection = projectCompletedTranscriptItem(item, turnId);
    expect(projection.kind).toBe("present");
    if (projection.kind !== "present") {
      throw new Error("Expected completed sub-agent activity to be present");
    }

    expect(projection.entry).toStrictEqual({
      type: "subAgentActivity",
      id: item.id,
      turnId,
      activityKind: kind,
      agentThreadId: `agent-thread-${kind}`,
      agentPath: "agents/planner",
      revision: 0,
    });

    const state = createEmptyTranscriptState();
    const entryId = transcriptEntryIdFor(turnId, item.id);
    state.entriesById[entryId] = projection.entry;
    const view = transcriptEntryView(state, entryId);

    expect(view).toStrictEqual({
      type: "subAgentActivity",
      id: item.id,
      turnId,
      title,
      details: [],
      revision: 0,
    });
  });
});
