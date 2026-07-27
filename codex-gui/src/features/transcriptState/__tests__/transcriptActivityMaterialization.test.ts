import { describe, expect, it } from "vitest";
import {
  collabAgentToolCall,
  subAgentActivity,
} from "@/features/projection/__tests__/projectionTestBuilders";
import { materializeTranscriptActivity } from "../transcriptActivityMaterialization";

describe("transcript activity materialization", () => {
  it.each([
    ["started", "Started /root/reviewer"],
    ["interacted", "Interacted with /root/reviewer"],
    ["interrupted", "Interrupted /root/reviewer"],
  ] as const)("materializes %s sub-agent activity", (kind, title) => {
    expect(
      materializeTranscriptActivity(
        subAgentActivity("activity-id", kind, "/root/reviewer", {
          agentThreadId: "private-agent-thread-id",
        }),
      ),
    ).toStrictEqual({ title, details: [] });
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

  describe("collaboration tool visibility and titles", () => {
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
        title: "Spawned receiver-a (gpt-5 high)",
        details: ["Review the transcript state"],
      });

      expect(
        materializeTranscriptActivity(collabAgentToolCall("spawn-failed", "spawnAgent", "failed")),
      ).toStrictEqual({ title: "Agent spawn failed", details: [] });
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
        title: "Sent input to receiver-a",
        details: ["Re-check the live path"],
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
      ).toStrictEqual({ title: "Closed receiver-a", details: [] });
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
      ).toStrictEqual({ title: "Resuming receiver-a", details: [] });
      expect(
        materializeTranscriptActivity(
          collabAgentToolCall("resume-completed", "resumeAgent", "completed", {
            receiverThreadIds: ["receiver-a"],
            agentsStates: {
              "receiver-a": { status: "running", message: null },
            },
          }),
        ),
      ).toStrictEqual({ title: "Resumed receiver-a", details: ["Running"] });
      expect(
        materializeTranscriptActivity(
          collabAgentToolCall("resume-failed", "resumeAgent", "failed", {
            receiverThreadIds: ["receiver-a"],
          }),
        ),
      ).toStrictEqual({
        title: "Resumed receiver-a",
        details: ["Error - Agent resume failed"],
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
      ).toStrictEqual({ title: "Waiting for agents", details: [] });
      expect(
        materializeTranscriptActivity(collabAgentToolCall("wait", "wait", "completed")),
      ).toStrictEqual({
        title: "Finished waiting",
        details: ["No agents completed yet"],
      });
      expect(
        materializeTranscriptActivity(collabAgentToolCall("wait", "wait", "failed")),
      ).toStrictEqual({
        title: "Finished waiting",
        details: ["No agents completed yet"],
      });
    });

    it("uses receiver labels for single and multiple in-progress waits", () => {
      expect(
        materializeTranscriptActivity(
          collabAgentToolCall("wait-one", "wait", "inProgress", {
            receiverThreadIds: ["receiver-a"],
          }),
        ),
      ).toStrictEqual({ title: "Waiting for receiver-a", details: [] });
      expect(
        materializeTranscriptActivity(
          collabAgentToolCall("wait-many", "wait", "inProgress", {
            receiverThreadIds: ["receiver-a", "receiver-b"],
          }),
        ),
      ).toStrictEqual({
        title: "Waiting for 2 agents",
        details: ["receiver-a", "receiver-b"],
      });
    });
  });

  describe("agent state details", () => {
    it.each([
      ["pendingInit", null, "Pending init"],
      ["running", null, "Running"],
      ["interrupted", null, "Interrupted"],
      ["completed", null, "Completed"],
      ["completed", "  Finished\nall   checks  ", "Completed - Finished all checks"],
      ["errored", null, "Error - Agent errored"],
      ["errored", "  Build\nfailed   hard  ", "Error - Build failed hard"],
      ["shutdown", null, "Shutdown"],
      ["notFound", null, "Not found"],
    ] as const)("materializes %s states", (status, message, summary) => {
      expect(
        materializeTranscriptActivity(
          collabAgentToolCall(`wait-${status}`, "wait", "completed", {
            receiverThreadIds: ["receiver-a"],
            agentsStates: { "receiver-a": { status, message } },
          }),
        ),
      ).toStrictEqual({
        title: "Finished waiting",
        details: [`receiver-a: ${summary}`],
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
        title: "Finished waiting",
        details: [
          "receiver-b: Interrupted",
          "receiver-a: Completed - Done",
          "receiver-c: Shutdown",
          "receiver-d: Running",
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
        title: "Sent input to receiver-a",
        details: ["Keep   internal\tspacing"],
      });
      expect(
        materializeTranscriptActivity(
          collabAgentToolCall("empty-prompt", "sendInput", "completed", {
            receiverThreadIds: ["receiver-a"],
            prompt: " \n\t ",
          }),
        ),
      ).toStrictEqual({ title: "Sent input to receiver-a", details: [] });
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
      ).toStrictEqual({ title: "Sent input to receiver-a", details: [atLimit] });
      expect(
        materializeTranscriptActivity(
          collabAgentToolCall("prompt-over", "sendInput", "completed", {
            receiverThreadIds: ["receiver-a"],
            prompt: overLimit,
          }),
        ),
      ).toStrictEqual({
        title: "Sent input to receiver-a",
        details: [`${combinedGrapheme.repeat(157)}...`],
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
        title: "Finished waiting",
        details: [`receiver-a: Completed - ${atLimit}`],
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
        title: "Finished waiting",
        details: [`receiver-a: Completed - ${combinedGrapheme.repeat(237)}...`],
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
        title: "Finished waiting",
        details: [`receiver-a: Error - ${atLimit}`],
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
        title: "Finished waiting",
        details: [`receiver-a: Error - ${combinedGrapheme.repeat(157)}...`],
      });
    });
  });
});
