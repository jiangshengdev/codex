import type { ThreadItem, ThreadProjectionDelta, UserInput } from "@codex-protocol/v2";
import type { TranscriptAgentMessageItem, TranscriptEntry } from "./transcriptStateModel";

type IgnoreTranscriptItem = { kind: "ignore" };

export type StartedTranscriptItemProjection =
  | IgnoreTranscriptItem
  | { kind: "reserve"; item: TranscriptAgentMessageItem };

export type CompletedTranscriptItemProjection =
  | IgnoreTranscriptItem
  | { kind: "present"; entry: TranscriptEntry }
  | { kind: "remove" };

export type TranscriptAgentMessageDelta = Extract<
  ThreadProjectionDelta,
  { type: "agentMessage" }
>["notification"];

export type TranscriptDeltaProjection =
  | IgnoreTranscriptItem
  | { kind: "present"; delta: TranscriptAgentMessageDelta };

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

export const projectStartedTranscriptItem = (item: ThreadItem): StartedTranscriptItemProjection => {
  switch (item.type) {
    case "agentMessage":
      return { kind: "reserve", item };
    case "userMessage":
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
      return { kind: "ignore" };
  }

  const exhaustiveItem: never = item;
  return exhaustiveItem;
};

export const projectCompletedTranscriptItem = (
  item: ThreadItem,
  turnId: string,
): CompletedTranscriptItemProjection => {
  switch (item.type) {
    case "userMessage": {
      const source = item.content.map(textFromUserInput).join("");
      if (source.length === 0) {
        return { kind: "ignore" };
      }

      return {
        kind: "present",
        entry: {
          type: "message",
          id: item.id,
          turnId,
          role: "user",
          source,
          sourceKind: "plainText",
          phase: null,
          revision: 0,
        },
      };
    }
    case "agentMessage":
      if (item.text.length === 0) {
        return { kind: "remove" };
      }

      return {
        kind: "present",
        entry: {
          type: "message",
          id: item.id,
          turnId,
          role: "assistant",
          source: item.text,
          sourceKind: "markdown",
          phase: item.phase,
          revision: 0,
        },
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
      return { kind: "ignore" };
  }

  const exhaustiveItem: never = item;
  return exhaustiveItem;
};

export const projectTranscriptDelta = (delta: ThreadProjectionDelta): TranscriptDeltaProjection => {
  switch (delta.type) {
    case "agentMessage":
      return { kind: "present", delta: delta.notification };
    case "reasoningSummaryText":
    case "reasoningSummaryPartAdded":
    case "reasoningText":
      return { kind: "ignore" };
  }

  const exhaustiveDelta: never = delta;
  return exhaustiveDelta;
};
