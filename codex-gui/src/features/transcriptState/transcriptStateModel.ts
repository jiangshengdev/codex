import type { ProjectionManualReconnectReason } from "@/features/projectionIngress/projectionIngressAdapter";
import type { ThreadItem, TurnStatus } from "@codex-protocol/v2";

export const TARGET_TRANSCRIPT_CHUNK_ENTRY_LIMIT = 100;
export const MAX_APPLIED_EVENT_ID_WINDOW_LENGTH = 500;

declare const transcriptEntryIdBrand: unique symbol;

export type TranscriptEntryId = string & {
  readonly [transcriptEntryIdBrand]: true;
};

export const transcriptEntryIdFor = (turnId: string, itemId: string): TranscriptEntryId =>
  JSON.stringify([turnId, itemId]) as TranscriptEntryId;

export type TranscriptTurn = {
  id: string;
  status: TurnStatus;
  originalFirstItemId: string | null;
  leadingPromptEntryId: TranscriptEntryId | null;
  middleChunkIds: string[];
  middleEntryCount: number;
  finalAssistantEntryIds: TranscriptEntryId[];
};

export type TranscriptChunk = {
  id: string;
  turnId: string;
  entryIds: TranscriptEntryId[];
  revision: number;
};

export type TranscriptLiveItemStatus = "started" | "streaming";

export type TranscriptAgentMessageItem = Extract<ThreadItem, { type: "agentMessage" }>;

export type TranscriptMessagePhase = TranscriptAgentMessageItem["phase"];

export type TranscriptCollabAgentItem = Extract<ThreadItem, { type: "collabAgentToolCall" }>;

export type TranscriptCollabAgentState = NonNullable<
  TranscriptCollabAgentItem["agentsStates"][string]
>;

export type TranscriptCollabAgentStateSummary = {
  threadId: string;
  status: TranscriptCollabAgentState["status"];
  messagePreview: string | null;
};

type TranscriptCollabAgentStoredEntryBase = {
  type: "collabAgent";
  id: string;
  turnId: string;
  receiverThreadIds: readonly string[];
  receiverCount: number;
  omittedReceiverCount: number;
  promptPreview: string | null;
  model: TranscriptCollabAgentItem["model"];
  reasoningEffort: TranscriptCollabAgentItem["reasoningEffort"];
  agentStateSummaries: readonly TranscriptCollabAgentStateSummary[];
  omittedAgentStateCount: number;
  revision: number;
};

export type TranscriptCollabAgentStoredEntry = TranscriptCollabAgentStoredEntryBase &
  (
    | {
        tool: TranscriptCollabAgentItem["tool"];
        toolStatus: Exclude<TranscriptCollabAgentItem["status"], "inProgress">;
      }
    | {
        tool: Extract<TranscriptCollabAgentItem["tool"], "resumeAgent" | "wait">;
        toolStatus: Extract<TranscriptCollabAgentItem["status"], "inProgress">;
      }
  );

export type TranscriptSubAgentActivityItem = Extract<ThreadItem, { type: "subAgentActivity" }>;

export type TranscriptSubAgentActivityStoredEntry = {
  type: "subAgentActivity";
  id: string;
  turnId: string;
  activityKind: TranscriptSubAgentActivityItem["kind"];
  agentPath: TranscriptSubAgentActivityItem["agentPath"];
  revision: number;
};

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
      type: "status";
      id: string;
      turnId: string;
      status: "interrupted" | "failed";
      revision: number;
    }
  | TranscriptCollabAgentStoredEntry
  | TranscriptSubAgentActivityStoredEntry;

export type TranscriptGlobalStatus = {
  id: string;
  status: "subscriptionInterrupted";
  reason: ProjectionManualReconnectReason;
  subscriptionId: string | null;
};

export type TranscriptRenderableLiveItem = {
  type: "live";
  id: string;
  key: TranscriptEntryId;
  turnId: string;
  itemId: string;
  status: TranscriptLiveItemStatus;
  initialItem: TranscriptAgentMessageItem;
  transientText: string;
  revision: number;
};

export type TranscriptStoredEntry = TranscriptEntry | TranscriptRenderableLiveItem;

export type TranscriptMessageRendering =
  | { mode: "plainText"; source: string }
  | { mode: "staticMarkdown"; source: string }
  | { mode: "streamingMarkdown"; source: string };

export type TranscriptMessageView = {
  type: "message";
  id: string;
  turnId: string;
  role: "user" | "assistant";
  rendering: TranscriptMessageRendering;
  revision: number;
};

export type TranscriptStatusView = {
  type: "status";
  id: string;
  turnId: string;
  status: "interrupted" | "failed";
  revision: number;
};

export type TranscriptActivityCopy =
  | {
      kind: "agentStarted";
      agentPath: TranscriptSubAgentActivityItem["agentPath"];
    }
  | {
      kind: "agentInteracted";
      agentPath: TranscriptSubAgentActivityItem["agentPath"];
    }
  | {
      kind: "agentInterrupted";
      agentPath: TranscriptSubAgentActivityItem["agentPath"];
    }
  | {
      kind: "agentResuming";
      receiver: TranscriptCollabAgentItem["receiverThreadIds"][number];
    }
  | {
      kind: "agentsWaiting";
      receiver: TranscriptCollabAgentItem["receiverThreadIds"][number] | null;
      receiverCount: number;
    }
  | { kind: "agentSpawnFailed" }
  | {
      kind: "agentSpawned";
      receiver: TranscriptCollabAgentItem["receiverThreadIds"][number];
      model: TranscriptCollabAgentItem["model"];
      reasoningEffort: TranscriptCollabAgentItem["reasoningEffort"];
    }
  | {
      kind: "inputSent";
      receiver: TranscriptCollabAgentItem["receiverThreadIds"][number];
    }
  | {
      kind: "agentResumed";
      receiver: TranscriptCollabAgentItem["receiverThreadIds"][number];
    }
  | { kind: "agentsFinishedWaiting" }
  | {
      kind: "agentClosed";
      receiver: TranscriptCollabAgentItem["receiverThreadIds"][number];
    }
  | {
      kind: "agentState";
      threadId: TranscriptCollabAgentStateSummary["threadId"] | null;
      status: TranscriptCollabAgentStateSummary["status"];
      messagePreview: TranscriptCollabAgentStateSummary["messagePreview"];
    }
  | { kind: "agentResumeFailed" }
  | { kind: "noAgentsCompletedYet" }
  | { kind: "omitted"; count: number };

export type TranscriptActivityDetail =
  | { kind: "raw"; text: string }
  | { kind: "copy"; copy: TranscriptActivityCopy };

export type TranscriptCollabAgentView = {
  type: "collabAgent";
  id: string;
  turnId: string;
  title: TranscriptActivityCopy;
  details: readonly TranscriptActivityDetail[];
  revision: number;
};

export type TranscriptSubAgentActivityView = {
  type: "subAgentActivity";
  id: string;
  turnId: string;
  title: TranscriptActivityCopy;
  details: readonly [];
  revision: number;
};

export type TranscriptEntryView =
  | TranscriptMessageView
  | TranscriptStatusView
  | TranscriptCollabAgentView
  | TranscriptSubAgentActivityView;

export type TranscriptChunkView = {
  id: string;
  turnId: string;
  revision: number;
  entries: TranscriptEntryView[];
};

export type TranscriptState = {
  threadId: string | null;
  subscriptionId: string | null;
  committedScrollCommitKey: string | null;
  liveScrollPulse: number;
  turnIds: string[];
  turnsById: Record<string, TranscriptTurn>;
  chunksById: Record<string, TranscriptChunk>;
  entriesById: Record<TranscriptEntryId, TranscriptStoredEntry>;
  entryChunkById: Record<TranscriptEntryId, string>;
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
  globalStatus: [],
  appliedEventIdsById: {},
  appliedEventOrder: [],
});

export const initialTranscriptState = createEmptyTranscriptState();

export const resetTranscriptState = (state: TranscriptState, nextState: TranscriptState) => {
  Object.assign(state, nextState);
};
