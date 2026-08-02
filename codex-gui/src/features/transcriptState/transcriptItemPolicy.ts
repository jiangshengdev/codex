import type { ThreadItem, ThreadProjectionDelta, UserInput } from "@codex-protocol/v2";
import type {
  TranscriptAgentMessageItem,
  TranscriptCollabAgentItem,
  TranscriptCollabAgentState,
  TranscriptCollabAgentStateSummary,
  TranscriptEntry,
} from "./transcriptStateModel";

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

const MAX_COLLAB_AGENT_DETAIL_COUNT = 64;
const COLLAB_PROMPT_PREVIEW_GRAPHEMES = 160;
const COLLAB_AGENT_COMPLETED_PREVIEW_GRAPHEMES = 240;
const COLLAB_AGENT_ERROR_PREVIEW_GRAPHEMES = 160;

const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

const truncateGraphemePreview = (value: string, limit: number): string => {
  const graphemes: string[] = [];
  for (const segment of graphemeSegmenter.segment(value)) {
    graphemes.push(segment.segment);
    if (graphemes.length > limit) {
      break;
    }
  }

  if (graphemes.length <= limit) {
    return graphemes.join("");
  }

  return `${graphemes.slice(0, limit - 3).join("")}...`;
};

const collapseWhitespace = (value: string): string => value.trim().split(/\s+/u).join(" ");

const boundedDetailItems = <T>(items: readonly T[]): { items: T[]; omittedCount: number } => {
  if (items.length <= MAX_COLLAB_AGENT_DETAIL_COUNT) {
    return { items: items.slice(), omittedCount: 0 };
  }

  const retainedCount = MAX_COLLAB_AGENT_DETAIL_COUNT - 1;
  return {
    items: items.slice(0, retainedCount),
    omittedCount: items.length - retainedCount,
  };
};

const orderedCollabAgentStates = (
  item: TranscriptCollabAgentItem,
): { threadId: string; state: TranscriptCollabAgentState }[] => {
  const seen = new Set<string>();
  const orderedStates: { threadId: string; state: TranscriptCollabAgentState }[] = [];

  for (const threadId of item.receiverThreadIds) {
    const state = item.agentsStates[threadId];
    if (state == null) {
      continue;
    }

    seen.add(threadId);
    orderedStates.push({ threadId, state });
  }

  const remainingStates: { threadId: string; state: TranscriptCollabAgentState }[] = [];
  for (const [threadId, state] of Object.entries(item.agentsStates)) {
    if (state == null || seen.has(threadId)) {
      continue;
    }

    remainingStates.push({ threadId, state });
  }
  remainingStates.sort((left, right) =>
    left.threadId < right.threadId ? -1 : left.threadId > right.threadId ? 1 : 0,
  );
  orderedStates.push(...remainingStates);
  return orderedStates;
};

const collabAgentStateSummary = ({
  threadId,
  state,
}: {
  threadId: string;
  state: TranscriptCollabAgentState;
}): TranscriptCollabAgentStateSummary => {
  let messagePreview: string | null = null;
  if (state.message != null) {
    const message = collapseWhitespace(state.message);
    if (state.status === "completed") {
      messagePreview = truncateGraphemePreview(message, COLLAB_AGENT_COMPLETED_PREVIEW_GRAPHEMES);
    } else if (state.status === "errored") {
      messagePreview = truncateGraphemePreview(message, COLLAB_AGENT_ERROR_PREVIEW_GRAPHEMES);
    }
  }

  return { threadId, status: state.status, messagePreview };
};

const collabPromptPreview = (prompt: string | null): string | null => {
  const trimmedPrompt = prompt?.trim();
  return trimmedPrompt == null || trimmedPrompt.length === 0
    ? null
    : truncateGraphemePreview(trimmedPrompt, COLLAB_PROMPT_PREVIEW_GRAPHEMES);
};

const projectCompletedCollabAgentItem = (
  item: TranscriptCollabAgentItem,
  turnId: string,
): CompletedTranscriptItemProjection => {
  if (item.status === "inProgress") {
    return { kind: "ignore" };
  }

  switch (item.tool) {
    case "spawnAgent":
    case "wait":
      break;
    case "sendInput":
    case "resumeAgent":
    case "closeAgent":
      if (item.receiverThreadIds[0] == null) {
        return { kind: "remove" };
      }
      break;
    default: {
      const exhaustiveTool: never = item.tool;
      return exhaustiveTool;
    }
  }

  const receivers = boundedDetailItems(item.receiverThreadIds);
  const agentStates = boundedDetailItems(orderedCollabAgentStates(item));
  return {
    kind: "present",
    entry: {
      type: "collabAgent",
      id: item.id,
      turnId,
      tool: item.tool,
      toolStatus: item.status,
      receiverThreadIds: receivers.items,
      receiverCount: item.receiverThreadIds.length,
      omittedReceiverCount: receivers.omittedCount,
      promptPreview: collabPromptPreview(item.prompt),
      model: item.model,
      reasoningEffort: item.reasoningEffort,
      agentStateSummaries: agentStates.items.map(collabAgentStateSummary),
      omittedAgentStateCount: agentStates.omittedCount,
      revision: 0,
    },
  };
};

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
    case "collabAgentToolCall":
      return projectCompletedCollabAgentItem(item, turnId);
    case "subAgentActivity":
      return {
        kind: "present",
        entry: {
          type: "subAgentActivity",
          id: item.id,
          turnId,
          activityKind: item.kind,
          agentPath: item.agentPath,
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
