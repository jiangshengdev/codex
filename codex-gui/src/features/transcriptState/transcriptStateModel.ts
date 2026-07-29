import type { ProjectionManualReconnectReason } from "@/features/projectionIngress/projectionIngressAdapter";
import type { ThreadItem, TurnStatus } from "@codex-protocol/v2";

export const TARGET_TRANSCRIPT_CHUNK_ENTRY_LIMIT = 100;
export const MAX_APPLIED_EVENT_ID_WINDOW_LENGTH = 500;

declare const transcriptMessageKeyBrand: unique symbol;

export type TranscriptMessageKey = string & {
  readonly [transcriptMessageKeyBrand]: true;
};

export const transcriptMessageKeyFor = (
  turnId: string,
  itemId: string,
): TranscriptMessageKey => JSON.stringify([turnId, itemId]) as TranscriptMessageKey;

export type TranscriptMessagePlacement =
  | "hidden"
  | "leading"
  | "middle"
  | "liveFinal"
  | "committedFinal";

export type TranscriptTurn = {
  id: string;
  status: TurnStatus;
  originalFirstItemId: string | null;
  leadingPromptEntryKey: TranscriptMessageKey | null;
  messageChunkIds: string[];
  middleEntryCount: number;
  liveFinalMessageKeys: TranscriptMessageKey[];
  committedFinalMessageKeys: TranscriptMessageKey[];
};

export type TranscriptMessageChunk = {
  id: string;
  turnId: string;
  messageKeys: TranscriptMessageKey[];
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

export type TranscriptRenderableLiveItem = {
  key: TranscriptMessageKey;
  turnId: string;
  itemId: string;
  status: TranscriptLiveItemStatus;
  initialItem: ThreadItem;
  transientText: string;
  revision: number;
};

export type TranscriptMessagePresentation = TranscriptEntry | TranscriptRenderableLiveItem;

export type TranscriptState = {
  threadId: string | null;
  subscriptionId: string | null;
  committedScrollCommitKey: string | null;
  liveScrollPulse: number;
  turnIds: string[];
  turnsById: Record<string, TranscriptTurn>;
  chunksById: Record<string, TranscriptMessageChunk>;
  entriesByKey: Record<TranscriptMessageKey, TranscriptEntry | null>;
  messageChunkByKey: Record<TranscriptMessageKey, string>;
  messagePlacementByKey: Record<TranscriptMessageKey, TranscriptMessagePlacement>;
  liveItemsByTurnId: Record<string, TranscriptRenderableLiveItem[]>;
  liveItemIndexByKey: Record<TranscriptMessageKey, TranscriptLiveItemIndex>;
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
  entriesByKey: {},
  messageChunkByKey: {},
  messagePlacementByKey: {},
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
