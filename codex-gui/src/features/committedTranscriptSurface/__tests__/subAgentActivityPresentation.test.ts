import { describe, expect, it } from "vitest";
import {
  formatSubAgentTaskName,
  presentSubAgentActivityGroup,
  type SubAgentActivityPresentationInput,
} from "../subAgentActivityPresentation";

const activity = (
  id: string,
  agentThreadId: string,
  agentPath: string,
): SubAgentActivityPresentationInput => ({
  id,
  turnId: "turn-activity-presentation",
  title: { kind: "agentStarted", agentThreadId, agentPath },
});

describe("sub-agent activity presentation", () => {
  it.each([
    ["/root/gui_composer_surface", "Gui composer surface"],
    ["/root/url_route_semantics", "Url route semantics"],
    ["/root/task1_test_app_server", "Task1 test app server"],
  ])("formats the task leaf in %s", (agentPath, expected) => {
    expect(formatSubAgentTaskName(agentPath)).toBe(expected);
  });

  it("removes leading separator whitespace before presenting the first visible character", () => {
    expect(
      presentSubAgentActivityGroup([activity("activity-worker", "thread-worker", "/root/_worker")]),
    ).toStrictEqual({
      items: [
        {
          id: "activity-worker",
          turnId: "turn-activity-presentation",
          agentThreadId: "thread-worker",
          identityKey: JSON.stringify([
            "turn-activity-presentation",
            "activity-worker",
            "thread-worker",
          ]),
          label: "Worker",
        },
      ],
      omittedCount: 0,
    });
  });

  it.each(["/root/___", "/root/   "])(
    "rejects task leaves without visible text in %s",
    (agentPath) => {
      expect(() => formatSubAgentTaskName(agentPath)).toThrow(
        "Expected sub-agent path segment to contain visible text",
      );
    },
  );

  it("adds only the shortest parent path needed to distinguish agents", () => {
    expect(
      presentSubAgentActivityGroup([
        activity("activity-backend", "thread-backend", "/root/backend/validation"),
        activity("activity-frontend", "thread-frontend", "/root/frontend/validation"),
        activity("activity-worker", "thread-worker", "/root/worker"),
      ]),
    ).toStrictEqual({
      items: [
        {
          id: "activity-backend",
          turnId: "turn-activity-presentation",
          agentThreadId: "thread-backend",
          identityKey: JSON.stringify([
            "turn-activity-presentation",
            "activity-backend",
            "thread-backend",
          ]),
          label: "Backend / Validation",
        },
        {
          id: "activity-frontend",
          turnId: "turn-activity-presentation",
          agentThreadId: "thread-frontend",
          identityKey: JSON.stringify([
            "turn-activity-presentation",
            "activity-frontend",
            "thread-frontend",
          ]),
          label: "Frontend / Validation",
        },
        {
          id: "activity-worker",
          turnId: "turn-activity-presentation",
          agentThreadId: "thread-worker",
          identityKey: JSON.stringify([
            "turn-activity-presentation",
            "activity-worker",
            "thread-worker",
          ]),
          label: "Worker",
        },
      ],
      omittedCount: 0,
    });
  });

  it("adds deeper parents when one parent remains ambiguous", () => {
    expect(
      presentSubAgentActivityGroup([
        activity("activity-team-a", "thread-team-a", "/root/team_a/backend/validation"),
        activity("activity-team-b", "thread-team-b", "/root/team_b/backend/validation"),
      ]),
    ).toStrictEqual({
      items: [
        {
          id: "activity-team-a",
          turnId: "turn-activity-presentation",
          agentThreadId: "thread-team-a",
          identityKey: JSON.stringify([
            "turn-activity-presentation",
            "activity-team-a",
            "thread-team-a",
          ]),
          label: "Team a / Backend / Validation",
        },
        {
          id: "activity-team-b",
          turnId: "turn-activity-presentation",
          agentThreadId: "thread-team-b",
          identityKey: JSON.stringify([
            "turn-activity-presentation",
            "activity-team-b",
            "thread-team-b",
          ]),
          label: "Team b / Backend / Validation",
        },
      ],
      omittedCount: 0,
    });
  });

  it("does not add parent paths for repeated activity from the same agent", () => {
    expect(
      presentSubAgentActivityGroup([
        activity("activity-repeat-a", "thread-repeat", "/root/backend/validation"),
        activity("activity-repeat-b", "thread-repeat", "/root/frontend/validation"),
      ]),
    ).toStrictEqual({
      items: [
        {
          id: "activity-repeat-a",
          turnId: "turn-activity-presentation",
          agentThreadId: "thread-repeat",
          identityKey: JSON.stringify([
            "turn-activity-presentation",
            "activity-repeat-a",
            "thread-repeat",
          ]),
          label: "Validation",
        },
        {
          id: "activity-repeat-b",
          turnId: "turn-activity-presentation",
          agentThreadId: "thread-repeat",
          identityKey: JSON.stringify([
            "turn-activity-presentation",
            "activity-repeat-b",
            "thread-repeat",
          ]),
          label: "Validation",
        },
      ],
      omittedCount: 0,
    });
  });

  it.each([1, 2, 3, 4])("keeps the first three of %s ordered activities", (count) => {
    const inputs = [
      activity("activity-a", "thread-a", "/root/agent_a"),
      activity("activity-b", "thread-b", "/root/agent_b"),
      activity("activity-c", "thread-c", "/root/agent_c"),
      activity("activity-d", "thread-d", "/root/agent_d"),
    ].slice(0, count);
    const expectedItems = [
      {
        id: "activity-a",
        turnId: "turn-activity-presentation",
        agentThreadId: "thread-a",
        identityKey: JSON.stringify(["turn-activity-presentation", "activity-a", "thread-a"]),
        label: "Agent a",
      },
      {
        id: "activity-b",
        turnId: "turn-activity-presentation",
        agentThreadId: "thread-b",
        identityKey: JSON.stringify(["turn-activity-presentation", "activity-b", "thread-b"]),
        label: "Agent b",
      },
      {
        id: "activity-c",
        turnId: "turn-activity-presentation",
        agentThreadId: "thread-c",
        identityKey: JSON.stringify(["turn-activity-presentation", "activity-c", "thread-c"]),
        label: "Agent c",
      },
    ];

    expect(presentSubAgentActivityGroup(inputs)).toStrictEqual({
      items: expectedItems.slice(0, Math.min(count, 3)),
      omittedCount: Math.max(0, count - 3),
    });
  });
});
