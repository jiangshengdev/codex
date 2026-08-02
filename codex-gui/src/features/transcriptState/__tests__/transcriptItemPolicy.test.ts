import { describe, expect, it } from "vitest";
import { subAgentActivity } from "@/features/projection/__tests__/projectionTestBuilders";
import {
  projectCompletedTranscriptItem,
  projectStartedTranscriptItem,
} from "../transcriptItemPolicy";
import { createEmptyTranscriptState, transcriptEntryIdFor } from "../transcriptStateModel";
import { transcriptEntryView } from "../transcriptStateSelectors";

describe("transcript item policy", () => {
  it.each([
    ["started", "Started `agents/planner`"],
    ["interacted", "Interacted with `agents/planner`"],
    ["interrupted", "Interrupted `agents/planner`"],
  ] as const)("projects completed sub-agent %s activity", (kind, title) => {
    const turnId = `turn-${kind}`;
    const item = subAgentActivity(`activity-${kind}`, kind, "agents/planner", {
      agentThreadId: `agent-thread-${kind}`,
    });

    expect(projectStartedTranscriptItem(item)).toStrictEqual({ kind: "ignore" });

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
      agentPath: "agents/planner",
      revision: 0,
    });
    expect(projection.entry).not.toHaveProperty("agentThreadId");

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
    expect(view).not.toHaveProperty("agentThreadId");
  });
});
