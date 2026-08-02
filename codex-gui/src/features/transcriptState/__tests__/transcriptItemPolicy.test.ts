import { describe, expect, it } from "vitest";
import {
  collabAgentState,
  collabAgentToolCall,
  subAgentActivity,
} from "@/features/projection/__tests__/projectionTestBuilders";
import {
  projectCompletedTranscriptItem,
  projectStartedTranscriptItem,
} from "../transcriptItemPolicy";
import { createEmptyTranscriptState, transcriptEntryIdFor } from "../transcriptStateModel";
import { transcriptEntryView } from "../transcriptStateSelectors";

const completedCollabView = (item: ReturnType<typeof collabAgentToolCall>) => {
  const turnId = "turn-collab";
  const projection = projectCompletedTranscriptItem(item, turnId);
  if (projection.kind !== "present") {
    throw new Error("Expected completed collab-agent item to be present");
  }

  const state = createEmptyTranscriptState();
  const entryId = transcriptEntryIdFor(turnId, item.id);
  state.entriesById[entryId] = projection.entry;
  const view = transcriptEntryView(state, entryId);
  if (view?.type !== "collabAgent") {
    throw new Error("Expected a collab-agent transcript view");
  }
  return view;
};

const startedCollabPresentation = (item: ReturnType<typeof collabAgentToolCall>) => {
  const turnId = "turn-started-collab";
  const projection = projectStartedTranscriptItem(item, turnId);
  if (projection.kind !== "present") {
    return { kind: projection.kind, title: null, details: null, revision: null };
  }

  const state = createEmptyTranscriptState();
  const entryId = transcriptEntryIdFor(turnId, item.id);
  state.entriesById[entryId] = projection.entry;
  const view = transcriptEntryView(state, entryId);
  return {
    kind: projection.kind,
    title: view?.type === "collabAgent" ? view.title : null,
    details: view?.type === "collabAgent" ? view.details : null,
    revision: view?.type === "collabAgent" ? view.revision : null,
  };
};

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

  it.each([
    ["spawnAgent", "completed", "Spawned agent-a", []],
    ["spawnAgent", "failed", "Spawned agent-a", []],
    ["sendInput", "completed", "Sent input to agent-a", ["Send this"]],
    ["sendInput", "failed", "Sent input to agent-a", ["Send this"]],
    ["resumeAgent", "completed", "Resumed agent-a", ["Running"]],
    ["resumeAgent", "failed", "Resumed agent-a", ["Running"]],
    ["wait", "completed", "Finished waiting", ["agent-a: Running"]],
    ["wait", "failed", "Finished waiting", ["agent-a: Running"]],
    ["closeAgent", "completed", "Closed agent-a", []],
    ["closeAgent", "failed", "Closed agent-a", []],
  ] as const)("projects terminal %s %s with the action wording", (tool, status, title, details) => {
    const view = completedCollabView(
      collabAgentToolCall(`collab-${tool}-${status}`, tool, status, {
        receiverThreadIds: ["agent-a"],
        prompt: tool === "sendInput" ? "Send this" : null,
        agentsStates: { "agent-a": collabAgentState("running") },
      }),
    );

    expect(view).toStrictEqual({
      type: "collabAgent",
      id: `collab-${tool}-${status}`,
      turnId: "turn-collab",
      title,
      details,
      revision: 0,
    });
  });

  it.each([
    ["spawnAgent", "inProgress", null],
    ["spawnAgent", "completed", null],
    ["spawnAgent", "failed", null],
    ["sendInput", "inProgress", null],
    ["sendInput", "completed", null],
    ["sendInput", "failed", null],
    ["resumeAgent", "inProgress", "Resuming agent-a"],
    ["resumeAgent", "completed", null],
    ["resumeAgent", "failed", null],
    ["wait", "inProgress", "Waiting for agent-a"],
    ["wait", "completed", null],
    ["wait", "failed", null],
    ["closeAgent", "inProgress", null],
    ["closeAgent", "completed", null],
    ["closeAgent", "failed", null],
  ] as const)("projects started %s %s", (tool, status, title) => {
    const item = collabAgentToolCall(`started-${tool}-${status}`, tool, status, {
      receiverThreadIds: ["agent-a"],
    });
    const expected =
      title == null
        ? { kind: "ignore", title: null, details: null, revision: null }
        : { kind: "present", title, details: [], revision: 0 };

    expect(startedCollabPresentation(item)).toStrictEqual(expected);
  });

  it("requires a resume receiver and bounds multi-receiver started wait details", () => {
    expect(
      projectStartedTranscriptItem(
        collabAgentToolCall("resume-started-no-receiver", "resumeAgent", "inProgress"),
        "turn-started-collab",
      ),
    ).toStrictEqual({ kind: "ignore" });

    const receiverThreadIds = Array.from(
      { length: 66 },
      (_, index) => `agent-${String(index).padStart(2, "0")}`,
    );
    const item = collabAgentToolCall("wait-started-many", "wait", "inProgress", {
      receiverThreadIds,
    });
    const projection = projectStartedTranscriptItem(item, "turn-started-collab");
    if (projection.kind !== "present") {
      throw new Error("Expected multi-receiver started wait to be present");
    }
    const state = createEmptyTranscriptState();
    const entryId = transcriptEntryIdFor("turn-started-collab", item.id);
    state.entriesById[entryId] = projection.entry;
    const view = transcriptEntryView(state, entryId);

    expect(view).toMatchObject({ title: "Waiting for 66 agents" });
    expect(view?.type === "collabAgent" ? view.details : []).toHaveLength(64);
    expect(view?.type === "collabAgent" ? view.details.slice(0, 2) : []).toStrictEqual([
      "agent-00",
      "agent-01",
    ]);
    expect(view?.type === "collabAgent" ? view.details.at(-1) : null).toBe("... and 3 more");
  });

  it.each([
    ["gpt-5", "high", " (gpt-5 high)"],
    ["", "high", " (high)"],
    [" ", "medium", ""],
    [null, "high", ""],
    ["gpt-5", null, ""],
  ] as const)(
    "formats the authoritative spawn suffix for model %j and effort %j",
    (model, reasoningEffort, suffix) => {
      const view = completedCollabView(
        collabAgentToolCall("spawn-suffix", "spawnAgent", "completed", {
          receiverThreadIds: ["agent-a"],
          model,
          reasoningEffort,
        }),
      );

      expect(view.title).toBe(`Spawned agent-a${suffix}`);
    },
  );

  it("handles missing and multiple terminal receivers without inventing an agent", () => {
    expect(
      completedCollabView(collabAgentToolCall("spawn-none", "spawnAgent", "failed")),
    ).toMatchObject({ title: "Agent spawn failed", details: [] });
    expect(
      completedCollabView(collabAgentToolCall("wait-none", "wait", "completed")),
    ).toMatchObject({ title: "Finished waiting", details: ["No agents completed yet"] });

    for (const tool of ["sendInput", "resumeAgent", "closeAgent"] as const) {
      expect(
        projectCompletedTranscriptItem(
          collabAgentToolCall(`missing-${tool}`, tool, "completed"),
          "turn-collab",
        ),
      ).toStrictEqual({ kind: "remove" });
    }

    const item = collabAgentToolCall("spawn-many", "spawnAgent", "completed", {
      receiverThreadIds: ["agent-a", "agent-b", "agent-c"],
    });
    const projection = projectCompletedTranscriptItem(item, "turn-collab");
    expect(projection).toMatchObject({
      kind: "present",
      entry: {
        receiverThreadIds: ["agent-a", "agent-b", "agent-c"],
        receiverCount: 3,
        omittedReceiverCount: 0,
      },
    });
    expect(completedCollabView(item).title).toBe("Spawned agent-a");
  });

  it("formats every terminal agent state", () => {
    const statuses = [
      ["pending", collabAgentState("pendingInit"), "Pending init"],
      ["running", collabAgentState("running"), "Running"],
      ["interrupted", collabAgentState("interrupted"), "Interrupted"],
      ["completed", collabAgentState("completed", "done"), "Completed - done"],
      ["errored", collabAgentState("errored"), "Error - Agent errored"],
      ["shutdown", collabAgentState("shutdown"), "Shutdown"],
      ["not-found", collabAgentState("notFound"), "Not found"],
    ] as const;
    const view = completedCollabView(
      collabAgentToolCall("wait-states", "wait", "completed", {
        receiverThreadIds: statuses.map(([threadId]) => threadId),
        agentsStates: Object.fromEntries(statuses.map(([threadId, state]) => [threadId, state])),
      }),
    );

    expect(view.details).toStrictEqual(
      statuses.map(([threadId, , detail]) => `${threadId}: ${detail}`),
    );
  });

  it.each([
    [null, "Error - Agent errored"],
    ["", "Error"],
    [" \n\t ", "Error"],
  ] as const)("formats errored message %j", (message, expected) => {
    const view = completedCollabView(
      collabAgentToolCall("wait-error-fallback", "wait", "failed", {
        receiverThreadIds: ["agent-error"],
        agentsStates: { "agent-error": collabAgentState("errored", message) },
      }),
    );

    expect(view.details).toStrictEqual([`agent-error: ${expected}`]);
  });

  it("selects the first available resume state before falling back", () => {
    const targetState = completedCollabView(
      collabAgentToolCall("resume-state", "resumeAgent", "completed", {
        receiverThreadIds: ["agent-target"],
        agentsStates: {
          "agent-other": collabAgentState("completed", "ignore me"),
          "agent-target": collabAgentState("interrupted"),
        },
      }),
    );
    const laterReceiverState = completedCollabView(
      collabAgentToolCall("resume-later-receiver", "resumeAgent", "completed", {
        receiverThreadIds: ["agent-target", "agent-later", "agent-last"],
        agentsStates: {
          "agent-last": collabAgentState("shutdown"),
          "agent-later": collabAgentState("completed", "Done"),
        },
      }),
    );
    const remainingState = completedCollabView(
      collabAgentToolCall("resume-remaining", "resumeAgent", "failed", {
        receiverThreadIds: ["agent-target", "agent-later"],
        agentsStates: {
          "agent-z": collabAgentState("running"),
          "agent-a": collabAgentState("shutdown"),
        },
      }),
    );
    const noState = completedCollabView(
      collabAgentToolCall("resume-no-state", "resumeAgent", "failed", {
        receiverThreadIds: ["agent-target"],
      }),
    );

    expect(targetState.details).toStrictEqual(["Interrupted"]);
    expect(laterReceiverState.details).toStrictEqual(["Completed - Done"]);
    expect(remainingState.details).toStrictEqual(["Shutdown"]);
    expect(noState.details).toStrictEqual(["Error - Agent resume failed"]);
  });

  it("orders wait states by receiver order and then remaining thread id", () => {
    const view = completedCollabView(
      collabAgentToolCall("wait-order", "wait", "completed", {
        receiverThreadIds: ["agent-b", "agent-missing", "agent-a"],
        agentsStates: {
          "agent-z": collabAgentState("shutdown"),
          "agent-a": collabAgentState("completed"),
          "agent-c": collabAgentState("pendingInit"),
          "agent-b": collabAgentState("running"),
        },
      }),
    );

    expect(view.details).toStrictEqual([
      "agent-b: Running",
      "agent-a: Completed",
      "agent-c: Pending init",
      "agent-z: Shutdown",
    ]);
  });

  it.each([
    ["prompt boundary", "spawnAgent", "p".repeat(160), "p".repeat(160)],
    ["prompt grapheme overflow", "spawnAgent", "👨‍👩‍👧‍👦".repeat(161), `${"👨‍👩‍👧‍👦".repeat(157)}...`],
    ["completed boundary", "wait", "c".repeat(240), `agent-a: Completed - ${"c".repeat(240)}`],
    ["completed overflow", "wait", "c".repeat(241), `agent-a: Completed - ${"c".repeat(237)}...`],
    ["error boundary", "wait", "e".repeat(160), `agent-a: Error - ${"e".repeat(160)}`],
    ["error overflow", "wait", "e".repeat(161), `agent-a: Error - ${"e".repeat(157)}...`],
  ] as const)("applies the %s preview limit", (_name, tool, source, expected) => {
    const isPrompt = tool === "spawnAgent";
    const view = completedCollabView(
      collabAgentToolCall(`preview-${_name}`, tool, "completed", {
        receiverThreadIds: ["agent-a"],
        prompt: isPrompt ? source : null,
        agentsStates: isPrompt
          ? {}
          : {
              "agent-a": collabAgentState(
                _name.startsWith("completed") ? "completed" : "errored",
                source,
              ),
            },
      }),
    );

    expect(view.details).toStrictEqual([expected]);
  });

  it("applies prompt and state whitespace rules", () => {
    expect(
      completedCollabView(
        collabAgentToolCall("prompt-whitespace", "spawnAgent", "completed", {
          receiverThreadIds: ["agent-a"],
          prompt: "  line one \n line two  ",
        }),
      ).details,
    ).toStrictEqual(["line one \n line two"]);
    expect(
      completedCollabView(
        collabAgentToolCall("state-whitespace", "wait", "completed", {
          receiverThreadIds: ["agent-a"],
          agentsStates: { "agent-a": collabAgentState("completed", "  line one \n line two  ") },
        }),
      ).details,
    ).toStrictEqual(["agent-a: Completed - line one line two"]);
    expect(
      completedCollabView(
        collabAgentToolCall("blank-prompt", "spawnAgent", "completed", {
          receiverThreadIds: ["agent-a"],
          prompt: " \n ",
        }),
      ).details,
    ).toStrictEqual([]);
  });

  it("caps wait details at 64 rows with an omission summary", () => {
    const states = Object.fromEntries(
      Array.from({ length: 66 }, (_, index) => [
        `agent-${String(index).padStart(2, "0")}`,
        collabAgentState("running"),
      ]),
    );
    const view = completedCollabView(
      collabAgentToolCall("wait-bounded", "wait", "completed", { agentsStates: states }),
    );

    expect(view.details).toHaveLength(64);
    expect(view.details[0]).toBe("agent-00: Running");
    expect(view.details[62]).toBe("agent-62: Running");
    expect(view.details[63]).toBe("... and 3 more");
  });

  it("ignores in-progress collab items and hides sender and item ids from visible text", () => {
    expect(
      projectCompletedTranscriptItem(
        collabAgentToolCall("collab-in-progress", "wait", "inProgress"),
        "turn-collab",
      ),
    ).toStrictEqual({ kind: "ignore" });

    const view = completedCollabView(
      collabAgentToolCall("hidden-item-id", "spawnAgent", "completed", {
        senderThreadId: "hidden-sender-id",
        receiverThreadIds: ["visible-receiver"],
        prompt: "Visible prompt",
      }),
    );
    const visibleText = [view.title, ...view.details].join("\n");
    expect(visibleText).not.toContain("hidden-item-id");
    expect(visibleText).not.toContain("hidden-sender-id");
  });
});
