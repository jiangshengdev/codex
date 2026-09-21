import {
  attachBaseline,
  eventAgentMessageDelta,
  eventItemCompleted,
  eventItemStarted,
  eventTurnCompleted,
} from "@/features/projection/__tests__/projectionFixtures";
import {
  agentMessage,
  agentMessageDelta,
  attachWithTurns,
  baseTurn,
  contextCompaction,
  inProgressTurn,
  itemCompleted,
  itemStarted,
  textInput,
  turnCompleted,
  turnWithTiming,
  userMessage,
} from "@/features/projection/__tests__/projectionTestBuilders";
import { activityCompletedTurn } from "./activityReplay";
import { imageTurns } from "./imageSamples";
import { basicMessageTurns, type TranscriptReplay } from "./messageReplay";
import { richContentSamples, richContentTurn } from "./richContentSamples";

const growthTurnId = "mixed-growth";
const growthAnswerId = "mixed-growth-answer";
const prompt = userMessage("mixed-growth-prompt", [textInput("Expand the final reading notes.")]);
const sections = richContentSamples.longText.split("\n\n## ");
const opening = sections.slice(0, 4).join("\n\n## ");
const middle = `\n\n## ${sections.slice(4, 16).join("\n\n## ")}`;
const ending = `\n\n## ${sections.slice(16).join("\n\n## ")}`;
const answer = agentMessage(growthAnswerId, richContentSamples.longText);

export const mixedReplay: TranscriptReplay = [
  [
    {
      type: "baselineAttached",
      response: attachWithTurns(attachBaseline, [
        ...basicMessageTurns.user,
        ...basicMessageTurns.assistant,
        richContentTurn("markdown"),
        richContentTurn("longCode"),
        baseTurn("mixed-table-boundary", [contextCompaction("mixed-context-2")]),
        richContentTurn("wideTable"),
        baseTurn("mixed-image-boundary", [contextCompaction("mixed-context-3")]),
        ...imageTurns.mixedContent,
        activityCompletedTurn,
        turnWithTiming(inProgressTurn(growthTurnId, [prompt]), {
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
          "mixed-answer-start",
          growthTurnId,
          agentMessage(growthAnswerId, ""),
        ),
      },
    },
    {
      type: "deltasAccepted",
      notifications: [
        agentMessageDelta(eventAgentMessageDelta, growthTurnId, growthAnswerId, opening),
      ],
    },
  ],
  [
    {
      type: "deltasAccepted",
      notifications: [
        agentMessageDelta(eventAgentMessageDelta, growthTurnId, growthAnswerId, middle),
      ],
    },
  ],
  [
    {
      type: "deltasAccepted",
      notifications: [
        agentMessageDelta(eventAgentMessageDelta, growthTurnId, growthAnswerId, ending),
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
          "mixed-answer-complete",
          growthTurnId,
          answer,
        ),
      },
    },
    {
      type: "eventAccepted",
      payload: {
        replay: "live",
        notification: turnCompleted(
          eventTurnCompleted,
          "mixed-turn-complete",
          baseTurn(growthTurnId, [prompt, answer]),
        ),
      },
    },
  ],
];
