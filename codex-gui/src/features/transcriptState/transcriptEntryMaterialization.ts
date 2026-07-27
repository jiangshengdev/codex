import type { ThreadItem, UserInput } from "@codex-protocol/v2";
import { materializeTranscriptActivity } from "./transcriptActivityMaterialization";
import type { TranscriptEntry } from "./transcriptStateModel";

const textFromUserInput = (input: UserInput): string => {
  switch (input.type) {
    case "text":
      return input.text;
    case "image":
    case "localImage":
    case "audio":
    case "localAudio":
    case "skill":
    case "mention":
      return "";
  }

  const exhaustiveInput: never = input;
  return exhaustiveInput;
};

export const materializeTranscriptItem = (
  item: ThreadItem,
  turnId: string,
): TranscriptEntry | null => {
  switch (item.type) {
    case "userMessage": {
      const source = item.content.map(textFromUserInput).join("");
      if (source.length === 0) {
        return null;
      }

      return {
        type: "message",
        id: item.id,
        turnId,
        role: "user",
        source,
        sourceKind: "plainText",
        phase: null,
        revision: 0,
      };
    }
    case "agentMessage":
      if (item.text.length === 0) {
        return null;
      }

      return {
        type: "message",
        id: item.id,
        turnId,
        role: "assistant",
        source: item.text,
        sourceKind: "markdown",
        phase: item.phase,
        revision: 0,
      };
    case "collabAgentToolCall":
    case "subAgentActivity": {
      const activity = materializeTranscriptActivity(item);
      return activity == null
        ? null
        : {
            type: "activity",
            id: item.id,
            turnId,
            copy: activity.copy,
            details: activity.details,
            revision: 0,
          };
    }
    case "hookPrompt":
    case "plan":
    case "reasoning":
    case "commandExecution":
    case "fileChange":
    case "mcpToolCall":
    case "dynamicToolCall":
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
