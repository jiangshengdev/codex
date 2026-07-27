import { describe, expect, it } from "vitest";
import {
  collabAgentToolCall,
  subAgentActivity,
} from "@/features/projection/__tests__/projectionTestBuilders";
import {
  materializeTranscriptActivity,
  type TranscriptActivityContent,
} from "../transcriptActivityMaterialization";
import type {
  TranscriptActivityCopy,
  TranscriptActivityDetail,
  TranscriptActivityDetailCopy,
} from "../transcriptStateModel";

const activity = (
  copy: TranscriptActivityCopy,
  details: TranscriptActivityDetail[] = [],
): TranscriptActivityContent => ({ copy, details });
const raw = (text: string): TranscriptActivityDetail => ({ kind: "raw", text });
const detailCopy = (copy: TranscriptActivityDetailCopy): TranscriptActivityDetail => ({
  kind: "copy",
  copy,
});
const agentStatus = (
  receiver: string | null,
  status: Extract<TranscriptActivityCopy, { kind: "agentStatus" }>["status"],
  message: string | null,
): TranscriptActivityDetail => detailCopy({ kind: "agentStatus", receiver, status, message });

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
    ).toStrictEqual(activity({ kind: copyKind, agentPath: "/root/reviewer" }));
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
      ).toStrictEqual(
        activity(
          {
            kind: "agentSpawned",
            receiver: "receiver-a",
            model: "gpt-5",
            reasoningEffort: "high",
          },
          [raw("Review the transcript state")],
        ),
      );

      expect(
        materializeTranscriptActivity(collabAgentToolCall("spawn-failed", "spawnAgent", "failed")),
      ).toStrictEqual(activity({ kind: "agentSpawnFailed" }));
    });

    it("materializes terminal send and close calls", () => {
      expect(
        materializeTranscriptActivity(
          collabAgentToolCall("send", "sendInput", "completed", {
            receiverThreadIds: ["receiver-a"],
            prompt: "Re-check the live path",
          }),
        ),
      ).toStrictEqual(
        activity({ kind: "inputSent", receiver: "receiver-a" }, [raw("Re-check the live path")]),
      );
      expect(
        materializeTranscriptActivity(collabAgentToolCall("send-missing", "sendInput", "failed")),
      ).toBeNull();
      expect(
        materializeTranscriptActivity(
          collabAgentToolCall("close", "closeAgent", "failed", {
            receiverThreadIds: ["receiver-a"],
          }),
        ),
      ).toStrictEqual(activity({ kind: "agentClosed", receiver: "receiver-a" }));
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
      ).toStrictEqual(activity({ kind: "agentResuming", receiver: "receiver-a" }));
      expect(
        materializeTranscriptActivity(
          collabAgentToolCall("resume-completed", "resumeAgent", "completed", {
            receiverThreadIds: ["receiver-a"],
            agentsStates: {
              "receiver-a": { status: "running", message: null },
            },
          }),
        ),
      ).toStrictEqual(
        activity({ kind: "agentResumed", receiver: "receiver-a" }, [
          agentStatus(null, "running", null),
        ]),
      );
      expect(
        materializeTranscriptActivity(
          collabAgentToolCall("resume-failed", "resumeAgent", "failed", {
            receiverThreadIds: ["receiver-a"],
          }),
        ),
      ).toStrictEqual(
        activity({ kind: "agentResumed", receiver: "receiver-a" }, [
          detailCopy({ kind: "agentResumeFailed" }),
        ]),
      );
      expect(
        materializeTranscriptActivity(
          collabAgentToolCall("resume-missing", "resumeAgent", "completed"),
        ),
      ).toBeNull();
    });

    it("materializes wait lifecycle states, including empty current V2 payloads", () => {
      expect(
        materializeTranscriptActivity(collabAgentToolCall("wait", "wait", "inProgress")),
      ).toStrictEqual(activity({ kind: "agentsWaiting", receiver: null, receiverCount: 0 }));
      expect(
        materializeTranscriptActivity(collabAgentToolCall("wait", "wait", "completed")),
      ).toStrictEqual(
        activity({ kind: "agentsFinishedWaiting" }, [detailCopy({ kind: "noAgentsCompletedYet" })]),
      );
      expect(
        materializeTranscriptActivity(collabAgentToolCall("wait", "wait", "failed")),
      ).toStrictEqual(
        activity({ kind: "agentsFinishedWaiting" }, [detailCopy({ kind: "noAgentsCompletedYet" })]),
      );
    });

    it("uses receiver labels for single and multiple in-progress waits", () => {
      expect(
        materializeTranscriptActivity(
          collabAgentToolCall("wait-one", "wait", "inProgress", {
            receiverThreadIds: ["receiver-a"],
          }),
        ),
      ).toStrictEqual(
        activity({ kind: "agentsWaiting", receiver: "receiver-a", receiverCount: 1 }),
      );
      expect(
        materializeTranscriptActivity(
          collabAgentToolCall("wait-many", "wait", "inProgress", {
            receiverThreadIds: ["receiver-a", "receiver-b"],
          }),
        ),
      ).toStrictEqual(
        activity({ kind: "agentsWaiting", receiver: null, receiverCount: 2 }, [
          raw("receiver-a"),
          raw("receiver-b"),
        ]),
      );
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
      ).toStrictEqual(
        activity({ kind: "agentsFinishedWaiting" }, [
          agentStatus("receiver-a", status, normalizedMessage),
        ]),
      );
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
      ).toStrictEqual(
        activity({ kind: "agentsFinishedWaiting" }, [
          agentStatus("receiver-b", "interrupted", null),
          agentStatus("receiver-a", "completed", "Done"),
          agentStatus("receiver-c", "shutdown", null),
          agentStatus("receiver-d", "running", null),
        ]),
      );
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
      ).toStrictEqual(
        activity({ kind: "inputSent", receiver: "receiver-a" }, [raw("Keep   internal\tspacing")]),
      );
      expect(
        materializeTranscriptActivity(
          collabAgentToolCall("empty-prompt", "sendInput", "completed", {
            receiverThreadIds: ["receiver-a"],
            prompt: " \n\t ",
          }),
        ),
      ).toStrictEqual(activity({ kind: "inputSent", receiver: "receiver-a" }));
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
      ).toStrictEqual(activity({ kind: "inputSent", receiver: "receiver-a" }, [raw(atLimit)]));
      expect(
        materializeTranscriptActivity(
          collabAgentToolCall("prompt-over", "sendInput", "completed", {
            receiverThreadIds: ["receiver-a"],
            prompt: overLimit,
          }),
        ),
      ).toStrictEqual(
        activity({ kind: "inputSent", receiver: "receiver-a" }, [
          raw(`${combinedGrapheme.repeat(157)}...`),
        ]),
      );
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
      ).toStrictEqual(
        activity({ kind: "agentsFinishedWaiting" }, [
          agentStatus("receiver-a", "completed", atLimit),
        ]),
      );
      expect(
        materializeTranscriptActivity(
          collabAgentToolCall("completed-over", "wait", "completed", {
            receiverThreadIds: ["receiver-a"],
            agentsStates: {
              "receiver-a": { status: "completed", message: overLimit },
            },
          }),
        ),
      ).toStrictEqual(
        activity({ kind: "agentsFinishedWaiting" }, [
          agentStatus("receiver-a", "completed", `${combinedGrapheme.repeat(237)}...`),
        ]),
      );
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
      ).toStrictEqual(
        activity({ kind: "agentsFinishedWaiting" }, [
          agentStatus("receiver-a", "errored", atLimit),
        ]),
      );
      expect(
        materializeTranscriptActivity(
          collabAgentToolCall("error-over", "wait", "completed", {
            receiverThreadIds: ["receiver-a"],
            agentsStates: {
              "receiver-a": { status: "errored", message: overLimit },
            },
          }),
        ),
      ).toStrictEqual(
        activity({ kind: "agentsFinishedWaiting" }, [
          agentStatus("receiver-a", "errored", `${combinedGrapheme.repeat(157)}...`),
        ]),
      );
    });
  });
});
