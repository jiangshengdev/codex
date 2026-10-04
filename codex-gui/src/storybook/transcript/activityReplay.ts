import type {
  ActiveThreadProjectionAcceptedEvent,
  ActiveThreadProjectionReadModelFact,
} from "@/features/activeThreadSession/activeThreadProjectionFacts";
import {
  attachBaseline,
  eventItemStarted,
  eventItemCompleted,
  eventReasoningSummaryTextDelta,
  eventTurnCompleted,
} from "@/features/projection/__tests__/projectionFixtures";
import {
  agentMessage,
  attachWithTurns,
  baseTurn,
  collabAgentState,
  collabAgentToolCall,
  inProgressTurn,
  itemCompleted,
  itemStarted,
  reasoningItem,
  reasoningSummaryTextDelta,
  subAgentActivity,
  textInput,
  turnCompleted,
  turnWithTiming,
  userMessage,
} from "@/features/projection/__tests__/projectionTestBuilders";
import type { TranscriptReplay } from "./messageReplay";

export const activityTurnId = "storybook-activity";
const prompt = userMessage("activity-prompt", [
  textInput("Review the fictional transcript change."),
]);
const summary =
  "**Inspecting the request**\n\nChecking the visible states before reviewing activity.";
const reasoning = reasoningItem("activity-reasoning", [summary]);
const started = subAgentActivity("activity-started", "started", "/root/transcript_reviewer");
const completed = subAgentActivity("activity-completed", "completed", "/root/transcript_reviewer");
const waitRunning = collabAgentToolCall("activity-wait", "wait", "inProgress", {
  receiverThreadIds: ["agents/transcript-reviewer"],
});
const waitCompleted = collabAgentToolCall("activity-wait", "wait", "completed", {
  receiverThreadIds: ["agents/transcript-reviewer"],
  agentsStates: { "agents/transcript-reviewer": collabAgentState("completed", "Review complete") },
});
const answer = agentMessage(
  "activity-answer",
  "The review is complete. All visible states are ready for inspection.",
);
export const activityCompletedTurn = turnWithTiming(
  baseTurn(activityTurnId, [prompt, reasoning, started, waitCompleted, completed, answer]),
  { startedAt: null, completedAt: null, durationMs: null },
);
const accepted = (
  notification: ActiveThreadProjectionAcceptedEvent["notification"],
): ActiveThreadProjectionReadModelFact => ({
  type: "eventAccepted",
  payload: { replay: "live", notification },
});

export const activityReplay: TranscriptReplay = [
  [
    {
      type: "baselineAttached",
      response: attachWithTurns(attachBaseline, [
        turnWithTiming(inProgressTurn(activityTurnId, [prompt]), {
          startedAt: null,
          completedAt: null,
          durationMs: null,
        }),
      ]),
    },
    accepted(
      itemStarted(
        eventItemStarted,
        "activity-reasoning-start",
        activityTurnId,
        reasoningItem("activity-reasoning", []),
      ),
    ),
  ],
  [
    {
      type: "deltasAccepted",
      notifications: [
        reasoningSummaryTextDelta(
          eventReasoningSummaryTextDelta,
          activityTurnId,
          "activity-reasoning",
          summary,
          0,
        ),
      ],
    },
  ],
  [
    accepted(
      itemCompleted(eventItemCompleted, "activity-reasoning-complete", activityTurnId, reasoning),
    ),
  ],
  [
    accepted(itemCompleted(eventItemCompleted, "activity-agent-start", activityTurnId, started)),
    accepted(itemStarted(eventItemStarted, "activity-wait-start", activityTurnId, waitRunning)),
  ],
  [
    accepted(
      itemCompleted(eventItemCompleted, "activity-wait-complete", activityTurnId, waitCompleted),
    ),
    accepted(
      itemCompleted(eventItemCompleted, "activity-agent-complete", activityTurnId, completed),
    ),
  ],
  [
    accepted(itemCompleted(eventItemCompleted, "activity-answer-complete", activityTurnId, answer)),
    accepted(turnCompleted(eventTurnCompleted, "activity-turn-complete", activityCompletedTurn)),
  ],
];
