import type { ThreadItem, UserInput } from "@codex-protocol/v2";
import type { TranscriptEntry } from "./transcriptStateSlice";

const textFromUserInput = (input: UserInput): string => {
  switch (input.type) {
    case "text":
      return input.text;
    case "image":
    case "localImage":
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
        sourceKind: "plainText",
        phase: item.phase,
        revision: 0,
      };
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
