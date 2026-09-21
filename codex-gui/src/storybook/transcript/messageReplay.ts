import type { ActiveThreadProjectionReadModelFact } from "@/features/activeThreadSession/activeThreadProjectionFacts";
import {
  attachBaseline,
  eventAgentMessageDelta,
  eventItemStarted,
  eventItemCompleted,
  eventTurnCompleted,
} from "@/features/projection/__tests__/projectionFixtures";
import {
  agentMessage,
  agentMessageDelta,
  attachWithTurns,
  baseTurn,
  inProgressTurn,
  itemCompleted,
  itemStarted,
  textInput,
  turnCompleted,
  turnWithTiming,
  userMessage,
} from "@/features/projection/__tests__/projectionTestBuilders";

/** A frame contains real read-model facts, not an alternative presentation model. */
export type TranscriptReplay = readonly (readonly ActiveThreadProjectionReadModelFact[])[];
export const messageTurnId = "storybook-message";
const prompt = userMessage("prompt", [
  textInput("Explain this fictional change.\n\n"),
  textInput("# Keep user syntax literal."),
]);
const answer =
  "The first part explains the input.\n\nThe second part explains the result.\n\nReplay complete.";
export const messageReplay: TranscriptReplay = [
  [
    // This content-only replay has no wall-clock start. Reusing the protocol
    // fixture's historical timestamp would display years of elapsed time.
    {
      type: "baselineAttached",
      response: attachWithTurns(attachBaseline, [
        turnWithTiming(inProgressTurn(messageTurnId, [prompt]), {
          startedAt: null,
          completedAt: null,
          durationMs: null,
        }),
      ]),
    },
    {
      type: "eventAccepted",
      payload: {
        replay: "live",
        notification: itemStarted(
          eventItemStarted,
          "start-answer",
          messageTurnId,
          agentMessage("answer", ""),
        ),
      },
    },
  ],
  [
    {
      type: "deltasAccepted",
      notifications: [
        agentMessageDelta(
          eventAgentMessageDelta,
          messageTurnId,
          "answer",
          "The first part explains the input.",
        ),
      ],
    },
  ],
  [
    {
      type: "deltasAccepted",
      notifications: [
        agentMessageDelta(
          eventAgentMessageDelta,
          messageTurnId,
          "answer",
          "\n\nThe second part explains the result.",
        ),
      ],
    },
  ],
  [
    {
      type: "eventAccepted",
      payload: {
        replay: "live",
        notification: itemCompleted(
          eventItemCompleted,
          "complete-answer",
          messageTurnId,
          agentMessage("answer", answer),
        ),
      },
    },
    {
      type: "eventAccepted",
      payload: {
        replay: "live",
        notification: turnCompleted(
          eventTurnCompleted,
          "complete-turn",
          baseTurn(messageTurnId, [prompt, agentMessage("answer", answer)]),
        ),
      },
    },
  ],
];

export const basicMessageTurns = {
  user: [baseTurn("user-message", [prompt])],
  assistant: [
    baseTurn("assistant-message", [
      agentMessage(
        "assistant",
        "A short answer.\n\nA second paragraph keeps the reading order clear.",
      ),
    ]),
  ],
};
