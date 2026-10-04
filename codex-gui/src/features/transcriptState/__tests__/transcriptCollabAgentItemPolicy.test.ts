import { describe, expect, it } from "vitest";
import {
  collabAgentState,
  collabAgentToolCall,
} from "@/features/projection/__tests__/projectionTestBuilders";
import {
  projectCompletedTranscriptItem,
  projectStartedTranscriptItem,
} from "../transcriptItemPolicy";
import {
  createEmptyTranscriptState,
  transcriptEntryIdFor,
  type TranscriptActivityCopy,
} from "../transcriptStateModel";
import { transcriptEntryView } from "../transcriptStateSelectors";

const rawDetail = (text: string) => ({ kind: "raw" as const, text });

const copyDetail = (copy: TranscriptActivityCopy) => ({ kind: "copy" as const, copy });

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
  it.each(["sendMessage", "followupTask", "interruptAgent", "listAgents"] as const)(
    "ignores %s in started and terminal collaboration policies",
    (tool) => {
      expect(
        projectStartedTranscriptItem(
          collabAgentToolCall(`started-${tool}`, tool, "inProgress"),
          "turn-ignored-collab",
        ),
      ).toStrictEqual({ kind: "ignore" });

      for (const status of ["completed", "failed", "interrupted"] as const) {
        expect(
          projectCompletedTranscriptItem(
            collabAgentToolCall(`terminal-${tool}-${status}`, tool, status),
            "turn-ignored-collab",
          ),
        ).toStrictEqual({ kind: "ignore" });
      }
    },
  );

  it.each([
    [
      "spawnAgent",
      "completed",
      { kind: "agentSpawned", receiver: "agent-a", model: null, reasoningEffort: null },
      [],
    ],
    [
      "spawnAgent",
      "failed",
      { kind: "agentSpawned", receiver: "agent-a", model: null, reasoningEffort: null },
      [],
    ],
    [
      "sendInput",
      "completed",
      { kind: "inputSent", receiver: "agent-a" },
      [rawDetail("Send this")],
    ],
    ["sendInput", "failed", { kind: "inputSent", receiver: "agent-a" }, [rawDetail("Send this")]],
    [
      "resumeAgent",
      "completed",
      { kind: "agentResumed", receiver: "agent-a" },
      [copyDetail({ kind: "agentState", threadId: null, status: "running", messagePreview: null })],
    ],
    [
      "resumeAgent",
      "failed",
      { kind: "agentResumed", receiver: "agent-a" },
      [copyDetail({ kind: "agentState", threadId: null, status: "running", messagePreview: null })],
    ],
    [
      "wait",
      "completed",
      { kind: "agentsFinishedWaiting" },
      [
        copyDetail({
          kind: "agentState",
          threadId: "agent-a",
          status: "running",
          messagePreview: null,
        }),
      ],
    ],
    [
      "wait",
      "failed",
      { kind: "agentsFinishedWaiting" },
      [
        copyDetail({
          kind: "agentState",
          threadId: "agent-a",
          status: "running",
          messagePreview: null,
        }),
      ],
    ],
    ["closeAgent", "completed", { kind: "agentClosed", receiver: "agent-a" }, []],
    ["closeAgent", "failed", { kind: "agentClosed", receiver: "agent-a" }, []],
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
    ["resumeAgent", "inProgress", { kind: "agentResuming", receiver: "agent-a" }],
    ["resumeAgent", "completed", null],
    ["resumeAgent", "failed", null],
    ["wait", "inProgress", { kind: "agentsWaiting", receiver: "agent-a", receiverCount: 1 }],
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

    expect(view).toMatchObject({
      title: { kind: "agentsWaiting", receiver: "agent-00", receiverCount: 66 },
    });
    expect(view?.type === "collabAgent" ? view.details : []).toHaveLength(64);
    expect(view?.type === "collabAgent" ? view.details.slice(0, 2) : []).toStrictEqual([
      rawDetail("agent-00"),
      rawDetail("agent-01"),
    ]);
    expect(view?.type === "collabAgent" ? view.details.at(-1) : null).toStrictEqual(
      copyDetail({ kind: "omitted", count: 3 }),
    );
  });

  it.each([
    ["gpt-5", "high"],
    ["", "high"],
    [" ", "medium"],
    [null, "high"],
    ["gpt-5", null],
  ] as const)(
    "preserves the authoritative spawn facts for model %j and effort %j",
    (model, reasoningEffort) => {
      const view = completedCollabView(
        collabAgentToolCall("spawn-suffix", "spawnAgent", "completed", {
          receiverThreadIds: ["agent-a"],
          model,
          reasoningEffort,
        }),
      );

      expect(view.title).toStrictEqual({
        kind: "agentSpawned",
        receiver: "agent-a",
        model,
        reasoningEffort,
      });
    },
  );

  it("handles missing and multiple terminal receivers without inventing an agent", () => {
    expect(
      completedCollabView(collabAgentToolCall("spawn-none", "spawnAgent", "failed")),
    ).toMatchObject({ title: { kind: "agentSpawnFailed" }, details: [] });
    expect(
      completedCollabView(collabAgentToolCall("wait-none", "wait", "completed")),
    ).toMatchObject({
      title: { kind: "agentsFinishedWaiting" },
      details: [copyDetail({ kind: "noAgentsCompletedYet" })],
    });

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
    expect(completedCollabView(item).title).toStrictEqual({
      kind: "agentSpawned",
      receiver: "agent-a",
      model: null,
      reasoningEffort: null,
    });
  });

  it("preserves every terminal agent state", () => {
    const statuses = [
      ["pending", collabAgentState("pendingInit")],
      ["running", collabAgentState("running")],
      ["interrupted", collabAgentState("interrupted")],
      ["completed", collabAgentState("completed", "done")],
      ["errored", collabAgentState("errored")],
      ["shutdown", collabAgentState("shutdown")],
      ["not-found", collabAgentState("notFound")],
    ] as const;
    const view = completedCollabView(
      collabAgentToolCall("wait-states", "wait", "completed", {
        receiverThreadIds: statuses.map(([threadId]) => threadId),
        agentsStates: Object.fromEntries(statuses.map(([threadId, state]) => [threadId, state])),
      }),
    );

    expect(view.details).toStrictEqual([
      copyDetail({
        kind: "agentState",
        threadId: "pending",
        status: "pendingInit",
        messagePreview: null,
      }),
      copyDetail({
        kind: "agentState",
        threadId: "running",
        status: "running",
        messagePreview: null,
      }),
      copyDetail({
        kind: "agentState",
        threadId: "interrupted",
        status: "interrupted",
        messagePreview: null,
      }),
      copyDetail({
        kind: "agentState",
        threadId: "completed",
        status: "completed",
        messagePreview: "done",
      }),
      copyDetail({
        kind: "agentState",
        threadId: "errored",
        status: "errored",
        messagePreview: null,
      }),
      copyDetail({
        kind: "agentState",
        threadId: "shutdown",
        status: "shutdown",
        messagePreview: null,
      }),
      copyDetail({
        kind: "agentState",
        threadId: "not-found",
        status: "notFound",
        messagePreview: null,
      }),
    ]);
  });

  it.each([
    [null, null],
    ["", ""],
    [" \n\t ", ""],
  ] as const)("preserves normalized errored message preview %j", (message, messagePreview) => {
    const view = completedCollabView(
      collabAgentToolCall("wait-error-fallback", "wait", "failed", {
        receiverThreadIds: ["agent-error"],
        agentsStates: { "agent-error": collabAgentState("errored", message) },
      }),
    );

    expect(view.details).toStrictEqual([
      copyDetail({
        kind: "agentState",
        threadId: "agent-error",
        status: "errored",
        messagePreview,
      }),
    ]);
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

    expect(targetState.details).toStrictEqual([
      copyDetail({
        kind: "agentState",
        threadId: null,
        status: "interrupted",
        messagePreview: null,
      }),
    ]);
    expect(laterReceiverState.details).toStrictEqual([
      copyDetail({
        kind: "agentState",
        threadId: null,
        status: "completed",
        messagePreview: "Done",
      }),
    ]);
    expect(remainingState.details).toStrictEqual([
      copyDetail({ kind: "agentState", threadId: null, status: "shutdown", messagePreview: null }),
    ]);
    expect(noState.details).toStrictEqual([copyDetail({ kind: "agentResumeFailed" })]);
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
      copyDetail({
        kind: "agentState",
        threadId: "agent-b",
        status: "running",
        messagePreview: null,
      }),
      copyDetail({
        kind: "agentState",
        threadId: "agent-a",
        status: "completed",
        messagePreview: null,
      }),
      copyDetail({
        kind: "agentState",
        threadId: "agent-c",
        status: "pendingInit",
        messagePreview: null,
      }),
      copyDetail({
        kind: "agentState",
        threadId: "agent-z",
        status: "shutdown",
        messagePreview: null,
      }),
    ]);
  });

  it.each([
    ["prompt boundary", "spawnAgent", "p".repeat(160), rawDetail("p".repeat(160))],
    [
      "prompt grapheme overflow",
      "spawnAgent",
      "👨‍👩‍👧‍👦".repeat(161),
      rawDetail(`${"👨‍👩‍👧‍👦".repeat(157)}...`),
    ],
    [
      "completed boundary",
      "wait",
      "c".repeat(240),
      copyDetail({
        kind: "agentState",
        threadId: "agent-a",
        status: "completed",
        messagePreview: "c".repeat(240),
      }),
    ],
    [
      "completed overflow",
      "wait",
      "c".repeat(241),
      copyDetail({
        kind: "agentState",
        threadId: "agent-a",
        status: "completed",
        messagePreview: `${"c".repeat(237)}...`,
      }),
    ],
    [
      "error boundary",
      "wait",
      "e".repeat(160),
      copyDetail({
        kind: "agentState",
        threadId: "agent-a",
        status: "errored",
        messagePreview: "e".repeat(160),
      }),
    ],
    [
      "error overflow",
      "wait",
      "e".repeat(161),
      copyDetail({
        kind: "agentState",
        threadId: "agent-a",
        status: "errored",
        messagePreview: `${"e".repeat(157)}...`,
      }),
    ],
  ] as const)("applies the %s preview limit", (_name, tool, source, expectedDetail) => {
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

    expect(view.details).toStrictEqual([expectedDetail]);
  });

  it("applies prompt and state whitespace rules", () => {
    expect(
      completedCollabView(
        collabAgentToolCall("prompt-whitespace", "spawnAgent", "completed", {
          receiverThreadIds: ["agent-a"],
          prompt: "  line one \n line two  ",
        }),
      ).details,
    ).toStrictEqual([rawDetail("line one \n line two")]);
    expect(
      completedCollabView(
        collabAgentToolCall("state-whitespace", "wait", "completed", {
          receiverThreadIds: ["agent-a"],
          agentsStates: { "agent-a": collabAgentState("completed", "  line one \n line two  ") },
        }),
      ).details,
    ).toStrictEqual([
      copyDetail({
        kind: "agentState",
        threadId: "agent-a",
        status: "completed",
        messagePreview: "line one line two",
      }),
    ]);
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
    expect(view.details[0]).toStrictEqual(
      copyDetail({
        kind: "agentState",
        threadId: "agent-00",
        status: "running",
        messagePreview: null,
      }),
    );
    expect(view.details[62]).toStrictEqual(
      copyDetail({
        kind: "agentState",
        threadId: "agent-62",
        status: "running",
        messagePreview: null,
      }),
    );
    expect(view.details[63]).toStrictEqual(copyDetail({ kind: "omitted", count: 3 }));
  });

  it("ignores in-progress collab items and hides sender and item ids from visible text", () => {
    expect(
      projectCompletedTranscriptItem(
        collabAgentToolCall("collab-in-progress", "wait", "inProgress"),
        "turn-collab",
      ),
    ).toStrictEqual({ kind: "ignore" });

    const presentation = completedCollabView(
      collabAgentToolCall("hidden-item-id", "spawnAgent", "completed", {
        senderThreadId: "hidden-sender-id",
        receiverThreadIds: ["visible-receiver"],
        prompt: "Visible prompt",
      }),
    );
    const view = { title: presentation.title, details: presentation.details };
    const visibleText = JSON.stringify(view);
    expect(visibleText).not.toContain("hidden-item-id");
    expect(visibleText).not.toContain("hidden-sender-id");
  });
});
