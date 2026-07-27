import { describe, expect, it } from "vitest";
import {
  collabAgentToolCall,
  subAgentActivity,
} from "@/features/projection/__tests__/projectionTestBuilders";
import { materializeTranscriptActivity } from "../transcriptActivityMaterialization";

describe("transcript activity materialization", () => {
  it.each([
    ["started", "agentStarted"],
    ["interacted", "agentInteracted"],
    ["interrupted", "agentInterrupted"],
  ] as const)("materializes %s sub-agent activity", (kind, copyKind) => {
    expect(
      materializeTranscriptActivity(
        subAgentActivity("activity-id", kind, "/root/reviewer", {
          agentThreadId: "private-agent-thread-id",
        }),
      ),
    ).toStrictEqual({
      copy: { kind: copyKind, agentPath: "/root/reviewer" },
      details: [],
    });
  });

  it("does not expose item, sender, or sub-agent thread IDs", () => {
    const subAgentResult = materializeTranscriptActivity(
      subAgentActivity("private-activity-id", "started", "/root/reviewer", {
        agentThreadId: "private-agent-thread-id",
      }),
    );
    const collabResult = materializeTranscriptActivity(
      collabAgentToolCall("private-call-id", "sendInput", "completed", {
        senderThreadId: "private-sender-thread-id",
        receiverThreadIds: ["visible-receiver-id"],
        prompt: "Review the state changes",
      }),
    );
    const visibleText = JSON.stringify([subAgentResult, collabResult]);

    expect(visibleText).not.toContain("private-activity-id");
    expect(visibleText).not.toContain("private-agent-thread-id");
    expect(visibleText).not.toContain("private-call-id");
    expect(visibleText).not.toContain("private-sender-thread-id");
    expect(visibleText).toContain("visible-receiver-id");
  });

  describe("collaboration tool visibility and semantics", () => {
    it("hides in-progress spawn, send, and close calls", () => {
      expect(
        materializeTranscriptActivity(collabAgentToolCall("spawn", "spawnAgent", "inProgress")),
      ).toBeNull();
      expect(
        materializeTranscriptActivity(
          collabAgentToolCall("send", "sendInput", "inProgress", {
            receiverThreadIds: ["receiver-a"],
          }),
        ),
      ).toBeNull();
      expect(
        materializeTranscriptActivity(
          collabAgentToolCall("close", "closeAgent", "inProgress", {
            receiverThreadIds: ["receiver-a"],
          }),
        ),
      ).toBeNull();
    });

    it("materializes terminal spawn calls with request details", () => {
      expect(
        materializeTranscriptActivity(
          collabAgentToolCall("spawn", "spawnAgent", "completed", {
            receiverThreadIds: ["receiver-a"],
            prompt: "  Review the transcript state  ",
            model: "gpt-5",
            reasoningEffort: "high",
          }),
        ),
      ).toStrictEqual({
        copy: {
          kind: "agentSpawned",
          receiver: "receiver-a",
          model: "gpt-5",
          reasoningEffort: "high",
        },
        details: [{ kind: "raw", text: "Review the transcript state" }],
      });

      expect(
        materializeTranscriptActivity(collabAgentToolCall("spawn-failed", "spawnAgent", "failed")),
      ).toStrictEqual({ copy: { kind: "agentSpawnFailed" }, details: [] });
    });

    it("materializes terminal send and close calls", () => {
      expect(
        materializeTranscriptActivity(
          collabAgentToolCall("send", "sendInput", "completed", {
            receiverThreadIds: ["receiver-a"],
            prompt: "Re-check the live path",
          }),
        ),
      ).toStrictEqual({
        copy: { kind: "inputSent", receiver: "receiver-a" },
        details: [{ kind: "raw", text: "Re-check the live path" }],
      });
      expect(
        materializeTranscriptActivity(collabAgentToolCall("send-missing", "sendInput", "failed")),
      ).toBeNull();
      expect(
        materializeTranscriptActivity(
          collabAgentToolCall("close", "closeAgent", "failed", {
            receiverThreadIds: ["receiver-a"],
          }),
        ),
      ).toStrictEqual({ copy: { kind: "agentClosed", receiver: "receiver-a" }, details: [] });
      expect(
        materializeTranscriptActivity(
          collabAgentToolCall("close-missing", "closeAgent", "completed"),
        ),
      ).toBeNull();
    });

    it("materializes resume lifecycle states", () => {
      expect(
        materializeTranscriptActivity(
          collabAgentToolCall("resume-started", "resumeAgent", "inProgress", {
            receiverThreadIds: ["receiver-a"],
          }),
        ),
      ).toStrictEqual({ copy: { kind: "agentResuming", receiver: "receiver-a" }, details: [] });
      expect(
        materializeTranscriptActivity(
          collabAgentToolCall("resume-completed", "resumeAgent", "completed", {
            receiverThreadIds: ["receiver-a"],
            agentsStates: {
              "receiver-a": { status: "running", message: null },
            },
          }),
        ),
      ).toStrictEqual({
        copy: { kind: "agentResumed", receiver: "receiver-a" },
        details: [
          {
            kind: "copy",
            copy: { kind: "agentStatus", receiver: null, status: "running", message: null },
          },
        ],
      });
      expect(
        materializeTranscriptActivity(
          collabAgentToolCall("resume-failed", "resumeAgent", "failed", {
            receiverThreadIds: ["receiver-a"],
          }),
        ),
      ).toStrictEqual({
        copy: { kind: "agentResumed", receiver: "receiver-a" },
        details: [{ kind: "copy", copy: { kind: "agentResumeFailed" } }],
      });
      expect(
        materializeTranscriptActivity(
          collabAgentToolCall("resume-missing", "resumeAgent", "completed"),
        ),
      ).toBeNull();
    });

    it("materializes wait lifecycle states, including empty current V2 payloads", () => {
      expect(
        materializeTranscriptActivity(collabAgentToolCall("wait", "wait", "inProgress")),
      ).toStrictEqual({
        copy: { kind: "agentsWaiting", receiver: null, receiverCount: 0 },
        details: [],
      });
      expect(
        materializeTranscriptActivity(collabAgentToolCall("wait", "wait", "completed")),
      ).toStrictEqual({
        copy: { kind: "agentsFinishedWaiting" },
        details: [{ kind: "copy", copy: { kind: "noAgentsCompletedYet" } }],
      });
      expect(
        materializeTranscriptActivity(collabAgentToolCall("wait", "wait", "failed")),
      ).toStrictEqual({
        copy: { kind: "agentsFinishedWaiting" },
        details: [{ kind: "copy", copy: { kind: "noAgentsCompletedYet" } }],
      });
    });

    it("uses receiver labels for single and multiple in-progress waits", () => {
      expect(
        materializeTranscriptActivity(
          collabAgentToolCall("wait-one", "wait", "inProgress", {
            receiverThreadIds: ["receiver-a"],
          }),
        ),
      ).toStrictEqual({
        copy: { kind: "agentsWaiting", receiver: "receiver-a", receiverCount: 1 },
        details: [],
      });
      expect(
        materializeTranscriptActivity(
          collabAgentToolCall("wait-many", "wait", "inProgress", {
            receiverThreadIds: ["receiver-a", "receiver-b"],
          }),
        ),
      ).toStrictEqual({
        copy: { kind: "agentsWaiting", receiver: null, receiverCount: 2 },
        details: [
          { kind: "raw", text: "receiver-a" },
          { kind: "raw", text: "receiver-b" },
        ],
      });
    });
  });

  describe("agent state details", () => {
    it.each([
      ["pendingInit", null, null],
      ["running", null, null],
      ["interrupted", null, null],
      ["completed", null, null],
      ["completed", "  Finished\nall   checks  ", "Finished all checks"],
      ["errored", null, null],
      ["errored", "  Build\nfailed   hard  ", "Build failed hard"],
      ["shutdown", null, null],
      ["notFound", null, null],
    ] as const)("materializes %s states", (status, message, normalizedMessage) => {
      expect(
        materializeTranscriptActivity(
          collabAgentToolCall(`wait-${status}`, "wait", "completed", {
            receiverThreadIds: ["receiver-a"],
            agentsStates: { "receiver-a": { status, message } },
          }),
        ),
      ).toStrictEqual({
        copy: { kind: "agentsFinishedWaiting" },
        details: [
          {
            kind: "copy",
            copy: { kind: "agentStatus", receiver: "receiver-a", status, message: normalizedMessage },
          },
        ],
      });
    });

    it("keeps receiver order and sorts additional states", () => {
      expect(
        materializeTranscriptActivity(
          collabAgentToolCall("wait-order", "wait", "completed", {
            receiverThreadIds: ["receiver-b", "receiver-a"],
            agentsStates: {
              "receiver-c": { status: "shutdown", message: null },
              "receiver-a": { status: "completed", message: "Done" },
              "receiver-d": { status: "running", message: null },
              "receiver-b": { status: "interrupted", message: null },
            },
          }),
        ),
      ).toStrictEqual({
        copy: { kind: "agentsFinishedWaiting" },
        details: [
          {
            kind: "copy",
            copy: {
              kind: "agentStatus",
              receiver: "receiver-b",
              status: "interrupted",
              message: null,
            },
          },
          {
            kind: "copy",
            copy: {
              kind: "agentStatus",
              receiver: "receiver-a",
              status: "completed",
              message: "Done",
            },
          },
          {
            kind: "copy",
            copy: {
              kind: "agentStatus",
              receiver: "receiver-c",
              status: "shutdown",
              message: null,
            },
          },
          {
            kind: "copy",
            copy: {
              kind: "agentStatus",
              receiver: "receiver-d",
              status: "running",
              message: null,
            },
          },
        ],
      });
    });
  });

  describe("bounded details", () => {
    const combinedGrapheme = "e\u0301";

    it("trims prompts, omits empty prompts, and preserves internal whitespace", () => {
      expect(
        materializeTranscriptActivity(
          collabAgentToolCall("prompt", "sendInput", "completed", {
            receiverThreadIds: ["receiver-a"],
            prompt: " \n  Keep   internal\tspacing \n ",
          }),
        ),
      ).toStrictEqual({
        copy: { kind: "inputSent", receiver: "receiver-a" },
        details: [{ kind: "raw", text: "Keep   internal\tspacing" }],
      });
      expect(
        materializeTranscriptActivity(
          collabAgentToolCall("empty-prompt", "sendInput", "completed", {
            receiverThreadIds: ["receiver-a"],
            prompt: " \n\t ",
          }),
        ),
      ).toStrictEqual({ copy: { kind: "inputSent", receiver: "receiver-a" }, details: [] });
    });

    it("keeps prompt details at 160 graphemes and truncates without splitting a cluster", () => {
      const atLimit = combinedGrapheme.repeat(160);
      const overLimit = combinedGrapheme.repeat(161);

      expect(
        materializeTranscriptActivity(
          collabAgentToolCall("prompt-limit", "sendInput", "completed", {
            receiverThreadIds: ["receiver-a"],
            prompt: atLimit,
          }),
        ),
      ).toStrictEqual({
        copy: { kind: "inputSent", receiver: "receiver-a" },
        details: [{ kind: "raw", text: atLimit }],
      });
      expect(
        materializeTranscriptActivity(
          collabAgentToolCall("prompt-over", "sendInput", "completed", {
            receiverThreadIds: ["receiver-a"],
            prompt: overLimit,
          }),
        ),
      ).toStrictEqual({
        copy: { kind: "inputSent", receiver: "receiver-a" },
        details: [{ kind: "raw", text: `${combinedGrapheme.repeat(157)}...` }],
      });
    });

    it("keeps completed messages at 240 graphemes and truncates after whitespace folding", () => {
      const atLimit = combinedGrapheme.repeat(240);
      const overLimit = `${combinedGrapheme.repeat(240)} \n ${combinedGrapheme}`;

      expect(
        materializeTranscriptActivity(
          collabAgentToolCall("completed-limit", "wait", "completed", {
            receiverThreadIds: ["receiver-a"],
            agentsStates: {
              "receiver-a": { status: "completed", message: atLimit },
            },
          }),
        ),
      ).toStrictEqual({
        copy: { kind: "agentsFinishedWaiting" },
        details: [
          {
            kind: "copy",
            copy: {
              kind: "agentStatus",
              receiver: "receiver-a",
              status: "completed",
              message: atLimit,
            },
          },
        ],
      });
      expect(
        materializeTranscriptActivity(
          collabAgentToolCall("completed-over", "wait", "completed", {
            receiverThreadIds: ["receiver-a"],
            agentsStates: {
              "receiver-a": { status: "completed", message: overLimit },
            },
          }),
        ),
      ).toStrictEqual({
        copy: { kind: "agentsFinishedWaiting" },
        details: [
          {
            kind: "copy",
            copy: {
              kind: "agentStatus",
              receiver: "receiver-a",
              status: "completed",
              message: `${combinedGrapheme.repeat(237)}...`,
            },
          },
        ],
      });
    });

    it("keeps error messages at 160 graphemes and truncates after whitespace folding", () => {
      const atLimit = combinedGrapheme.repeat(160);
      const overLimit = `${combinedGrapheme.repeat(160)} \t ${combinedGrapheme}`;

      expect(
        materializeTranscriptActivity(
          collabAgentToolCall("error-limit", "wait", "completed", {
            receiverThreadIds: ["receiver-a"],
            agentsStates: {
              "receiver-a": { status: "errored", message: atLimit },
            },
          }),
        ),
      ).toStrictEqual({
        copy: { kind: "agentsFinishedWaiting" },
        details: [
          {
            kind: "copy",
            copy: {
              kind: "agentStatus",
              receiver: "receiver-a",
              status: "errored",
              message: atLimit,
            },
          },
        ],
      });
      expect(
        materializeTranscriptActivity(
          collabAgentToolCall("error-over", "wait", "completed", {
            receiverThreadIds: ["receiver-a"],
            agentsStates: {
              "receiver-a": { status: "errored", message: overLimit },
            },
          }),
        ),
      ).toStrictEqual({
        copy: { kind: "agentsFinishedWaiting" },
        details: [
          {
            kind: "copy",
            copy: {
              kind: "agentStatus",
              receiver: "receiver-a",
              status: "errored",
              message: `${combinedGrapheme.repeat(157)}...`,
            },
          },
        ],
      });
    });
  });
});
