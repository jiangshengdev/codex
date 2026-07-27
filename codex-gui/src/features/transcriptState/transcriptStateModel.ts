import type { ProjectionManualReconnectReason } from "@/features/projectionIngress/projectionIngressAdapter";
import type { ThreadItem, TurnStatus } from "@codex-protocol/v2";

export const TARGET_TRANSCRIPT_CHUNK_ENTRY_LIMIT = 100;
export const MAX_APPLIED_EVENT_ID_WINDOW_LENGTH = 500;

export type TranscriptTurn = {
  id: string;
  status: TurnStatus;
  leadingPromptEntryId: string | null;
  middleChunkIds: string[];
  middleEntryCount: number;
  finalAssistantEntryIds: string[];
};

export type TranscriptChunk = {
  id: string;
  turnId: string;
  entryIds: string[];
  revision: number;
};

export type TranscriptLiveItemStatus = "started" | "streaming";

export type TranscriptLiveItemIndex = {
  turnId: string;
  index: number;
};

export type TranscriptMessagePhase = Extract<ThreadItem, { type: "agentMessage" }>["phase"];

type TranscriptCollabAgentToolCallItem = Extract<ThreadItem, { type: "collabAgentToolCall" }>;
type TranscriptCollabAgentState = NonNullable<
  TranscriptCollabAgentToolCallItem["agentsStates"][string]
>;

export type TranscriptActivityCopy =
  | { kind: "agentStarted"; agentPath: string }
  | { kind: "agentInteracted"; agentPath: string }
  | { kind: "agentInterrupted"; agentPath: string }
  | { kind: "agentSpawnFailed" }
  | {
      kind: "agentSpawned";
      receiver: string;
      model: TranscriptCollabAgentToolCallItem["model"];
      reasoningEffort: TranscriptCollabAgentToolCallItem["reasoningEffort"];
    }
  | { kind: "inputSent"; receiver: string }
  | { kind: "agentResuming"; receiver: string }
  | { kind: "agentResumed"; receiver: string }
  | { kind: "agentsWaiting"; receiver: string | null; receiverCount: number }
  | { kind: "agentsFinishedWaiting" }
  | { kind: "agentClosed"; receiver: string }
  | {
      kind: "agentStatus";
      receiver: string | null;
      status: TranscriptCollabAgentState["status"];
      message: string | null;
    }
  | { kind: "agentResumeFailed" }
  | { kind: "noAgentsCompletedYet" };

export type TranscriptActivityDetailCopy = Extract<
  TranscriptActivityCopy,
  { kind: "agentStatus" | "agentResumeFailed" | "noAgentsCompletedYet" }
>;

export type TranscriptActivityDetail =
  | { kind: "raw"; text: string }
  | { kind: "copy"; copy: TranscriptActivityDetailCopy };

export type TranscriptEntry =
  | {
      type: "message";
      id: string;
      turnId: string;
      role: "user" | "assistant";
      source: string;
      sourceKind: "plainText" | "markdown";
      phase: TranscriptMessagePhase;
      revision: number;
    }
  | {
      type: "activity";
      id: string;
      turnId: string;
      copy: TranscriptActivityCopy;
      details: TranscriptActivityDetail[];
      revision: number;
    }
  | {
      type: "status";
      id: string;
      turnId: string;
      status: "interrupted" | "failed";
      revision: number;
    };

export type TranscriptGlobalStatus = {
  id: string;
  status: "subscriptionInterrupted";
  reason: ProjectionManualReconnectReason;
  subscriptionId: string | null;
};

export type TranscriptChunkView = {
  id: string;
  turnId: string;
  revision: number;
  entries: TranscriptEntry[];
};

export type TranscriptRenderableLiveItem = {
  key: string;
  turnId: string;
  itemId: string;
  status: TranscriptLiveItemStatus;
  initialItem: ThreadItem;
  transientText: string;
  revision: number;
};

export type TranscriptState = {
  threadId: string | null;
  subscriptionId: string | null;
  committedScrollCommitKey: string | null;
  liveScrollPulse: number;
  turnIds: string[];
  turnsById: Record<string, TranscriptTurn>;
  chunksById: Record<string, TranscriptChunk>;
  entriesById: Record<string, TranscriptEntry>;
  entryChunkById: Record<string, string>;
  liveItemsByTurnId: Record<string, TranscriptRenderableLiveItem[]>;
  liveItemIndexByKey: Record<string, TranscriptLiveItemIndex>;
  globalStatus: TranscriptGlobalStatus[];
  appliedEventIdsById: Record<string, true>;
  appliedEventOrder: string[];
};

export const createEmptyTranscriptState = (): TranscriptState => ({
  threadId: null,
  subscriptionId: null,
  committedScrollCommitKey: null,
  liveScrollPulse: 0,
  turnIds: [],
  turnsById: {},
  chunksById: {},
  entriesById: {},
  entryChunkById: {},
  liveItemsByTurnId: {},
  liveItemIndexByKey: {},
  globalStatus: [],
  appliedEventIdsById: {},
  appliedEventOrder: [],
});

export const initialTranscriptState = createEmptyTranscriptState();

export const resetTranscriptState = (state: TranscriptState, nextState: TranscriptState) => {
  Object.assign(state, nextState);
};
