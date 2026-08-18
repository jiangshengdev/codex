import type { ThreadItem, ThreadProjectionDelta, UserInput } from "@codex-protocol/v2";
import type {
  TranscriptAgentMessageItem,
  TranscriptCollabAgentItem,
  TranscriptCollabAgentState,
  TranscriptCollabAgentStateSummary,
  TranscriptContextBoundaryItem,
  TranscriptEntry,
  TranscriptReasoningItem,
} from "./transcriptStateModel";

type IgnoreTranscriptItem = { kind: "ignore" };

export type StartedTranscriptItemProjection =
  | IgnoreTranscriptItem
  | { kind: "reserve"; item: TranscriptAgentMessageItem }
  | { kind: "reserveReasoning"; item: TranscriptReasoningItem }
  | { kind: "present"; entry: TranscriptEntry };

export type CompletedTranscriptItemProjection =
  | IgnoreTranscriptItem
  | { kind: "contextBoundary"; item: TranscriptContextBoundaryItem }
  | { kind: "present"; entry: TranscriptEntry }
  | { kind: "remove" };

export type TranscriptAgentMessageDelta = Extract<
  ThreadProjectionDelta,
  { type: "agentMessage" }
>["notification"];

export type TranscriptReasoningSummaryTextDelta = Extract<
  ThreadProjectionDelta,
  { type: "reasoningSummaryText" }
>["notification"];

export type TranscriptReasoningSummaryPartAddedDelta = Extract<
  ThreadProjectionDelta,
  { type: "reasoningSummaryPartAdded" }
>["notification"];

export type TranscriptDeltaProjection =
  | IgnoreTranscriptItem
  | { kind: "agentMessage"; delta: TranscriptAgentMessageDelta }
  | { kind: "reasoningSummaryText"; delta: TranscriptReasoningSummaryTextDelta }
  | { kind: "reasoningSummaryPartAdded"; delta: TranscriptReasoningSummaryPartAddedDelta };

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

const collabAgentEntryFacts = (item: TranscriptCollabAgentItem, turnId: string) => {
  const receivers = boundedDetailItems(item.receiverThreadIds);
  const agentStates = boundedDetailItems(orderedCollabAgentStates(item));
  return {
    type: "collabAgent" as const,
    id: item.id,
    turnId,
    receiverThreadIds: receivers.items,
    receiverCount: item.receiverThreadIds.length,
    omittedReceiverCount: receivers.omittedCount,
    promptPreview: collabPromptPreview(item.prompt),
    model: item.model,
    reasoningEffort: item.reasoningEffort,
    agentStateSummaries: agentStates.items.map(collabAgentStateSummary),
    omittedAgentStateCount: agentStates.omittedCount,
    revision: 0,
  };
};

const projectStartedCollabAgentItem = (
  item: TranscriptCollabAgentItem,
  turnId: string,
): StartedTranscriptItemProjection => {
  if (item.status !== "inProgress") {
    return { kind: "ignore" };
  }

  switch (item.tool) {
    case "resumeAgent":
      if (item.receiverThreadIds[0] == null) {
        return { kind: "ignore" };
      }
      return {
        kind: "present",
        entry: {
          ...collabAgentEntryFacts(item, turnId),
          tool: item.tool,
          toolStatus: item.status,
        },
      };
    case "wait":
      return {
        kind: "present",
        entry: {
          ...collabAgentEntryFacts(item, turnId),
          tool: item.tool,
          toolStatus: item.status,
        },
      };
    case "spawnAgent":
    case "sendInput":
    case "closeAgent":
      return { kind: "ignore" };
  }

  const exhaustiveTool: never = item.tool;
  return exhaustiveTool;
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

  return {
    kind: "present",
    entry: {
      ...collabAgentEntryFacts(item, turnId),
      tool: item.tool,
      toolStatus: item.status,
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

export const projectStartedTranscriptItem = (
  item: ThreadItem,
  turnId: string,
): StartedTranscriptItemProjection => {
  switch (item.type) {
    case "agentMessage":
      return { kind: "reserve", item };
    case "reasoning":
      return { kind: "reserveReasoning", item };
    case "collabAgentToolCall":
      return projectStartedCollabAgentItem(item, turnId);
    case "userMessage":
    case "hookPrompt":
    case "plan":
    case "commandExecution":
    case "fileChange":
    case "mcpToolCall":
    case "dynamicToolCall":
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
    case "reasoning": {
      const summaryParts = item.summary
        .map((part) => part.trim())
        .filter((part) => part.length > 0);
      if (summaryParts.length === 0) {
        return { kind: "remove" };
      }

      return {
        kind: "present",
        entry: {
          type: "reasoning",
          id: item.id,
          turnId,
          lifecycle: "completed",
          summaryParts,
          revision: 0,
        },
      };
    }
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
          agentThreadId: item.agentThreadId,
          agentPath: item.agentPath,
          revision: 0,
        },
      };
    case "hookPrompt":
    case "plan":
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
      return { kind: "ignore" };
    case "contextCompaction":
      return { kind: "contextBoundary", item };
  }

  const exhaustiveItem: never = item;
  return exhaustiveItem;
};

export const projectTranscriptDelta = (delta: ThreadProjectionDelta): TranscriptDeltaProjection => {
  switch (delta.type) {
    case "agentMessage":
      return { kind: "agentMessage", delta: delta.notification };
    case "reasoningSummaryText":
      return { kind: "reasoningSummaryText", delta: delta.notification };
    case "reasoningSummaryPartAdded":
      return { kind: "reasoningSummaryPartAdded", delta: delta.notification };
    case "reasoningText":
      return { kind: "ignore" };
  }

  const exhaustiveDelta: never = delta;
  return exhaustiveDelta;
};
