import type { ProjectionManualReconnectReason } from "@/features/projectionIngress/projectionIngressAdapter";
import type { ThreadItem, Turn } from "@codex-protocol/v2";

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
  status: Turn["status"];
  error?: NonNullable<Turn["error"]>;
  originalFirstItemId: string | null;
  leadingPromptEntryId: TranscriptEntryId | null;
  middleChunkIds: string[];
  middleEntryCount: number;
  finalAssistantEntryIds: TranscriptEntryId[];
};

export type TranscriptContextBoundaryItem = Extract<ThreadItem, { type: "contextCompaction" }>;

export type TranscriptTurnFragment = {
  id: string;
  turnId: string;
  leadingPromptEntryId: TranscriptEntryId | null;
  middleChunkIds: string[];
  middleEntryCount: number;
  finalAssistantEntryIds: TranscriptEntryId[];
};

export type TranscriptContextPage = {
  id: string;
  leadingBoundaryId: TranscriptEntryId | null;
  turnFragmentIds: string[];
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

export type TranscriptReasoningItem = Extract<ThreadItem, { type: "reasoning" }>;

export type TranscriptReasoningSummaryPart = TranscriptReasoningItem["summary"][number];

export type TranscriptStreamingReasoningStoredEntry = {
  type: "reasoning";
  id: string;
  turnId: string;
  lifecycle: "streaming";
  summaryParts: Partial<Record<number, TranscriptReasoningSummaryPart>>;
  currentSummaryIndex: number | null;
  title: TranscriptReasoningSummaryPart | null;
  revision: number;
};

export type TranscriptCompletedReasoningStoredEntry = {
  type: "reasoning";
  id: string;
  turnId: string;
  lifecycle: "completed";
  summaryParts: readonly TranscriptReasoningSummaryPart[];
  revision: number;
};

export type TranscriptReasoningStoredEntry =
  | TranscriptStreamingReasoningStoredEntry
  | TranscriptCompletedReasoningStoredEntry;

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

type TranscriptCollabAgentTerminalTool = Exclude<
  TranscriptCollabAgentItem["tool"],
  "sendMessage" | "followupTask" | "interruptAgent" | "listAgents"
>;

export type TranscriptCollabAgentStoredEntry = TranscriptCollabAgentStoredEntryBase &
  (
    | {
        tool: TranscriptCollabAgentTerminalTool;
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
  agentThreadId: TranscriptSubAgentActivityItem["agentThreadId"];
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
  | TranscriptCompletedReasoningStoredEntry
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

export type TranscriptStoredEntry =
  | TranscriptEntry
  | TranscriptRenderableLiveItem
  | TranscriptStreamingReasoningStoredEntry;

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

export type TranscriptStreamingReasoningView = {
  type: "reasoning";
  id: string;
  turnId: string;
  lifecycle: "streaming";
  title: TranscriptReasoningSummaryPart;
  revision: number;
};

export type TranscriptCompletedReasoningView = {
  type: "reasoning";
  id: string;
  turnId: string;
  lifecycle: "completed";
  source: TranscriptReasoningSummaryPart;
  revision: number;
};

export type TranscriptReasoningView =
  | TranscriptStreamingReasoningView
  | TranscriptCompletedReasoningView;

export type TranscriptActivityCopy =
  | {
      kind: "agentStarted";
      agentThreadId: TranscriptSubAgentActivityItem["agentThreadId"];
      agentPath: TranscriptSubAgentActivityItem["agentPath"];
    }
  | {
      kind: "agentInteracted";
      agentThreadId: TranscriptSubAgentActivityItem["agentThreadId"];
      agentPath: TranscriptSubAgentActivityItem["agentPath"];
    }
  | {
      kind: "agentInterrupted";
      agentThreadId: TranscriptSubAgentActivityItem["agentThreadId"];
      agentPath: TranscriptSubAgentActivityItem["agentPath"];
    }
  | {
      kind: "agentCompleted";
      agentThreadId: TranscriptSubAgentActivityItem["agentThreadId"];
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

export type TranscriptSubAgentActivityCopy = Extract<
  TranscriptActivityCopy,
  { agentPath: unknown }
>;

export type TranscriptCollabAgentActivityCopy = Exclude<
  TranscriptActivityCopy,
  TranscriptSubAgentActivityCopy
>;

export type TranscriptCollabAgentActivityDetail =
  | { kind: "raw"; text: string }
  | { kind: "copy"; copy: TranscriptCollabAgentActivityCopy };

export type TranscriptActivityDetail = TranscriptCollabAgentActivityDetail;

export type TranscriptCollabAgentView = {
  type: "collabAgent";
  id: string;
  turnId: string;
  title: TranscriptCollabAgentActivityCopy;
  details: readonly TranscriptCollabAgentActivityDetail[];
  revision: number;
};

export type TranscriptSubAgentActivityView = {
  type: "subAgentActivity";
  id: string;
  turnId: string;
  title: TranscriptSubAgentActivityCopy;
  details: readonly [];
  revision: number;
};

export type TranscriptEntryView =
  | TranscriptMessageView
  | TranscriptStatusView
  | TranscriptReasoningView
  | TranscriptCollabAgentView
  | TranscriptSubAgentActivityView;

export type TranscriptChunkView = {
  id: string;
  turnId: string;
  revision: number;
  entries: TranscriptEntryView[];
};

export type TranscriptState = {
  sessionRevision: number;
  threadId: string | null;
  subscriptionId: string | null;
  committedScrollCommitKey: string | null;
  liveScrollPulse: number;
  turnIds: string[];
  turnsById: Record<string, TranscriptTurn>;
  chunksById: Record<string, TranscriptChunk>;
  entriesById: Record<TranscriptEntryId, TranscriptStoredEntry>;
  entryChunkById: Record<TranscriptEntryId, string>;
  contextPageIds: string[];
  contextPagesById: Record<string, TranscriptContextPage>;
  turnFragmentsById: Record<string, TranscriptTurnFragment>;
  entryFragmentById: Record<TranscriptEntryId, string>;
  chunkFragmentById: Record<string, string>;
  contextBoundaryIdsById: Record<TranscriptEntryId, true>;
  globalStatus: TranscriptGlobalStatus[];
  appliedEventIdsById: Record<string, true>;
  appliedEventOrder: string[];
};

export const createEmptyTranscriptState = (): TranscriptState => {
  const firstPage: TranscriptContextPage = {
    id: "context-page:1",
    leadingBoundaryId: null,
    turnFragmentIds: [],
  };
  return {
    sessionRevision: 0,
    threadId: null,
    subscriptionId: null,
    committedScrollCommitKey: null,
    liveScrollPulse: 0,
    turnIds: [],
    turnsById: {},
    chunksById: {},
    entriesById: {},
    entryChunkById: {},
    contextPageIds: [firstPage.id],
    contextPagesById: { [firstPage.id]: firstPage },
    turnFragmentsById: {},
    entryFragmentById: {},
    chunkFragmentById: {},
    contextBoundaryIdsById: {},
    globalStatus: [],
    appliedEventIdsById: {},
    appliedEventOrder: [],
  };
};

export const initialTranscriptState = createEmptyTranscriptState();

export const resetTranscriptState = (state: TranscriptState, nextState: TranscriptState) => {
  Object.assign(state, nextState);
};
