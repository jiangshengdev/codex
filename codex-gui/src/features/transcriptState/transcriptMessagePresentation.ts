import type { ThreadItem, UserInput } from "@codex-protocol/v2";
import type { TranscriptPresentationCandidate } from "./transcriptStateModel";

type TranscriptMessageItem = Extract<
  ThreadItem,
  { type: "userMessage" } | { type: "agentMessage" }
>;

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

export const presentTranscriptMessage = (
  item: TranscriptMessageItem,
): TranscriptPresentationCandidate | null => {
  switch (item.type) {
    case "userMessage": {
      const source = item.content.map(textFromUserInput).join("");
      if (source.length === 0) {
        return null;
      }

      return {
        content: {
          type: "message",
          role: "user",
          source,
          sourceKind: "plainText",
          phase: null,
        },
        placementIntent: "leadingCandidate",
      };
    }
    case "agentMessage":
      if (item.text.length === 0) {
        return null;
      }

      return {
        content: {
          type: "message",
          role: "assistant",
          source: item.text,
          sourceKind: "markdown",
          phase: item.phase,
        },
        placementIntent: item.phase === "final_answer" ? "final" : "intermediate",
      };
  }

  const exhaustiveItem: never = item;
  return exhaustiveItem;
};
