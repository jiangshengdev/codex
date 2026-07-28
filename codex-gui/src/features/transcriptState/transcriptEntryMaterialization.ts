import type { ThreadItem } from "@codex-protocol/v2";
import { presentTranscriptMessage } from "./transcriptMessagePresentation";
import type {
  TranscriptPresentation,
  TranscriptPresentationCandidate,
} from "./transcriptStateModel";

export const materializeAuthoritativeTranscriptItem = (
  item: ThreadItem,
): TranscriptPresentationCandidate | null => {
  switch (item.type) {
    case "userMessage":
    case "agentMessage":
      return presentTranscriptMessage(item);
    case "hookPrompt":
    case "plan":
    case "reasoning":
    case "commandExecution":
    case "fileChange":
    case "mcpToolCall":
    case "dynamicToolCall":
    case "collabAgentToolCall":
    case "subAgentActivity":
    case "webSearch":
    case "imageView":
    case "sleep":
    case "imageGeneration":
    case "enteredReviewMode":
    case "exitedReviewMode":
    case "contextCompaction":
      return null;
  }

  const exhaustiveItem: never = item;
  return exhaustiveItem;
};

export const areTranscriptPresentationsEqual = (
  previous: TranscriptPresentation,
  next: TranscriptPresentation,
): boolean => {
  if (previous.type !== next.type) {
    return false;
  }

  switch (previous.type) {
    case "message":
      return (
        next.type === "message" &&
        previous.role === next.role &&
        previous.source === next.source &&
        previous.sourceKind === next.sourceKind &&
        previous.phase === next.phase
      );
    case "status":
      return next.type === "status" && previous.status === next.status;
  }

  const exhaustivePresentation: never = previous;
  return exhaustivePresentation;
};
