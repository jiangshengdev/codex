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
  entries: TranscriptMiddlePayload[];
};

export type TranscriptRenderableLiveItem = {
  type: "live";
  id: string;
  key: TranscriptEntryId;
  turnId: string;
  itemId: string;
  status: TranscriptLiveItemStatus;
  initialItem: ThreadItem;
  transientText: string;
  revision: number;
};

export type TranscriptMiddlePayload = TranscriptEntry | TranscriptRenderableLiveItem;

export type TranscriptState = {
  threadId: string | null;
  subscriptionId: string | null;
  committedScrollCommitKey: string | null;
  liveScrollPulse: number;
  turnIds: string[];
  turnsById: Record<string, TranscriptTurn>;
  chunksById: Record<string, TranscriptChunk>;
  entriesById: Record<TranscriptEntryId, TranscriptMiddlePayload>;
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
