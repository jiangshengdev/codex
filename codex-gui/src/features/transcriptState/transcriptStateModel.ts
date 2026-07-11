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

export const initialTranscriptState: TranscriptState = {
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

export const resetTranscriptState = (state: TranscriptState, nextState: TranscriptState) => {
  state.threadId = nextState.threadId;
  state.subscriptionId = nextState.subscriptionId;
  state.committedScrollCommitKey = nextState.committedScrollCommitKey;
  state.liveScrollPulse = nextState.liveScrollPulse;
  state.turnIds = nextState.turnIds;
  state.turnsById = nextState.turnsById;
  state.chunksById = nextState.chunksById;
  state.entriesById = nextState.entriesById;
  state.entryChunkById = nextState.entryChunkById;
  state.liveItemsByTurnId = nextState.liveItemsByTurnId;
  state.liveItemIndexByKey = nextState.liveItemIndexByKey;
  state.globalStatus = nextState.globalStatus;
  state.appliedEventIdsById = nextState.appliedEventIdsById;
  state.appliedEventOrder = nextState.appliedEventOrder;
};
