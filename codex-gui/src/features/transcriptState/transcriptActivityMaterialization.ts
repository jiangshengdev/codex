import type { ThreadItem } from "@codex-protocol/v2";
import type {
  TranscriptActivityCopy,
  TranscriptActivityDetail,
  TranscriptActivityDetailCopy,
} from "./transcriptStateModel";

type TranscriptActivityItem = Extract<
  ThreadItem,
  { type: "collabAgentToolCall" | "subAgentActivity" }
>;
type CollabAgentToolCallItem = Extract<TranscriptActivityItem, { type: "collabAgentToolCall" }>;
type SubAgentActivityItem = Extract<TranscriptActivityItem, { type: "subAgentActivity" }>;
type CollabAgentState = NonNullable<CollabAgentToolCallItem["agentsStates"][string]>;

export type TranscriptActivityContent = {
  copy: TranscriptActivityCopy;
  details: TranscriptActivityDetail[];
};

const COLLAB_PROMPT_PREVIEW_GRAPHEMES = 160;
const COLLAB_AGENT_RESPONSE_PREVIEW_GRAPHEMES = 240;
const COLLAB_AGENT_ERROR_PREVIEW_GRAPHEMES = 160;

const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

const exhaustive = (value: never): never => value;

const truncateGraphemes = (text: string, limit: number): string => {
  const prefix: string[] = [];
  let graphemeCount = 0;

  for (const { segment } of graphemeSegmenter.segment(text)) {
    graphemeCount += 1;
    if (graphemeCount <= limit - 3) {
      prefix.push(segment);
    }
    if (graphemeCount > limit) {
      return `${prefix.join("")}...`;
    }
  }

  return text;
};

const promptDetail = (prompt: string | null): TranscriptActivityDetail | null => {
  const trimmed = prompt?.trim() ?? "";
  return trimmed.length === 0
    ? null
    : { kind: "raw", text: truncateGraphemes(trimmed, COLLAB_PROMPT_PREVIEW_GRAPHEMES) };
};

const normalizedMessage = (message: string): string => message.trim().replace(/\s+/gu, " ");

const terminalStatus = (status: CollabAgentToolCallItem["status"]): boolean => {
  switch (status) {
    case "inProgress":
      return false;
    case "completed":
    case "failed":
      return true;
  }

  return exhaustive(status);
};

const firstReceiver = (item: CollabAgentToolCallItem): string | null =>
  item.receiverThreadIds[0] ?? null;

const promptDetails = (item: CollabAgentToolCallItem): TranscriptActivityDetail[] => {
  const detail = promptDetail(item.prompt);
  return detail == null ? [] : [detail];
};

const agentStatusCopy = (
  receiver: string | null,
  state: CollabAgentState,
): TranscriptActivityDetailCopy => {
  const { status } = state;
  switch (status) {
    case "pendingInit":
    case "running":
    case "interrupted":
    case "shutdown":
    case "notFound":
      return { kind: "agentStatus", receiver, status, message: null };
    case "completed": {
      const message = normalizedMessage(state.message ?? "");
      return {
        kind: "agentStatus",
        receiver,
        status,
        message:
          message.length === 0
            ? null
            : truncateGraphemes(message, COLLAB_AGENT_RESPONSE_PREVIEW_GRAPHEMES),
      };
    }
    case "errored": {
      const message = state.message == null ? null : normalizedMessage(state.message);
      return {
        kind: "agentStatus",
        receiver,
        status,
        message:
          message == null ? null : truncateGraphemes(message, COLLAB_AGENT_ERROR_PREVIEW_GRAPHEMES),
      };
    }
  }

  return exhaustive(status);
};

const availableAgentStates = (
  item: CollabAgentToolCallItem,
): (readonly [string, CollabAgentState])[] =>
  Object.entries(item.agentsStates).flatMap(([threadId, state]) =>
    state == null ? [] : [[threadId, state] as const],
  );

const firstAgentState = (item: CollabAgentToolCallItem): CollabAgentState | null => {
  for (const receiver of item.receiverThreadIds) {
    const state = item.agentsStates[receiver];
    if (state != null) {
      return state;
    }
  }

  const firstExtra = availableAgentStates(item).sort(([left], [right]) =>
    left < right ? -1 : left > right ? 1 : 0,
  )[0];
  return firstExtra?.[1] ?? null;
};

const waitDetails = (item: CollabAgentToolCallItem): TranscriptActivityDetail[] => {
  const seen = new Set<string>();
  const receiverStates = item.receiverThreadIds.flatMap((receiver) => {
    const state = item.agentsStates[receiver];
    if (state == null) {
      return [];
    }

    seen.add(receiver);
    return [[receiver, state] as const];
  });
  const extraStates = availableAgentStates(item)
    .filter(([threadId]) => !seen.has(threadId))
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
  const states = [...receiverStates, ...extraStates];

  return states.length === 0
    ? [{ kind: "copy", copy: { kind: "noAgentsCompletedYet" } }]
    : states.map(([threadId, state]) => ({
        kind: "copy",
        copy: agentStatusCopy(threadId, state),
      }));
};

const materializeSubAgentActivity = (item: SubAgentActivityItem): TranscriptActivityContent => {
  const { kind } = item;
  switch (kind) {
    case "started":
      return { copy: { kind: "agentStarted", agentPath: item.agentPath }, details: [] };
    case "interacted":
      return { copy: { kind: "agentInteracted", agentPath: item.agentPath }, details: [] };
    case "interrupted":
      return { copy: { kind: "agentInterrupted", agentPath: item.agentPath }, details: [] };
  }

  return exhaustive(kind);
};

const materializeCollabAgentToolCall = (
  item: CollabAgentToolCallItem,
): TranscriptActivityContent | null => {
  const { tool } = item;
  switch (tool) {
    case "spawnAgent": {
      if (!terminalStatus(item.status)) {
        return null;
      }

      const receiver = firstReceiver(item);
      return {
        copy:
          receiver == null
            ? { kind: "agentSpawnFailed" }
            : {
                kind: "agentSpawned",
                receiver,
                model: item.model,
                reasoningEffort: item.reasoningEffort,
              },
        details: promptDetails(item),
      };
    }
    case "sendInput": {
      if (!terminalStatus(item.status)) {
        return null;
      }

      const receiver = firstReceiver(item);
      return receiver == null
        ? null
        : { copy: { kind: "inputSent", receiver }, details: promptDetails(item) };
    }
    case "resumeAgent": {
      const receiver = firstReceiver(item);
      if (receiver == null) {
        return null;
      }
      if (!terminalStatus(item.status)) {
        return { copy: { kind: "agentResuming", receiver }, details: [] };
      }

      const state = firstAgentState(item);
      return {
        copy: { kind: "agentResumed", receiver },
        details: [
          {
            kind: "copy",
            copy: state == null ? { kind: "agentResumeFailed" } : agentStatusCopy(null, state),
          },
        ],
      };
    }
    case "wait": {
      if (!terminalStatus(item.status)) {
        const receiver = firstReceiver(item);
        if (receiver == null) {
          return {
            copy: { kind: "agentsWaiting", receiver: null, receiverCount: 0 },
            details: [],
          };
        }

        const receiverCount = item.receiverThreadIds.length;
        if (receiverCount === 1) {
          return {
            copy: { kind: "agentsWaiting", receiver, receiverCount },
            details: [],
          };
        }

        return {
          copy: { kind: "agentsWaiting", receiver: null, receiverCount },
          details: item.receiverThreadIds.map((text) => ({ kind: "raw", text })),
        };
      }

      return { copy: { kind: "agentsFinishedWaiting" }, details: waitDetails(item) };
    }
    case "closeAgent": {
      if (!terminalStatus(item.status)) {
        return null;
      }

      const receiver = firstReceiver(item);
      return receiver == null ? null : { copy: { kind: "agentClosed", receiver }, details: [] };
    }
  }

  return exhaustive(tool);
};

export const materializeTranscriptActivity = (
  item: TranscriptActivityItem,
): TranscriptActivityContent | null => {
  switch (item.type) {
    case "collabAgentToolCall":
      return materializeCollabAgentToolCall(item);
    case "subAgentActivity":
      return materializeSubAgentActivity(item);
  }

  return exhaustive(item);
};
