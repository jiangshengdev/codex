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
  slotIds: string[];
  revision: number;
};

export type TranscriptLiveItemStatus = "started" | "streaming";

export type TranscriptLiveItemIndex = {
  turnId: string;
  index: number;
};

export type TranscriptMessagePhase = Extract<ThreadItem, { type: "agentMessage" }>["phase"];

export type TranscriptPresentation =
  | {
      type: "message";
      role: "user" | "assistant";
      source: string;
      sourceKind: "plainText" | "markdown";
      phase: TranscriptMessagePhase;
    }
  | {
      type: "status";
      status: "interrupted" | "failed";
    };

export type TranscriptEntry = TranscriptPresentation & {
  id: string;
  turnId: string;
  revision: number;
};

export type TranscriptPresentationLocation = "leading" | "intermediate" | "final";

export type TranscriptPresentationAuthority = "transient" | "authoritative";

export type TranscriptPresentationPlacementIntent = "leadingCandidate" | "intermediate" | "final";

export type TranscriptPresentationCandidate = {
  content: TranscriptPresentation;
  placementIntent: TranscriptPresentationPlacementIntent;
};

export type TranscriptPresentationSlot = {
  id: string;
  turnId: string;
  location: TranscriptPresentationLocation;
  authority: TranscriptPresentationAuthority;
  content: TranscriptPresentation;
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
  presentationGeneration: number;
  committedScrollCommitKey: string | null;
  liveScrollPulse: number;
  turnIds: string[];
  turnsById: Record<string, TranscriptTurn>;
  chunksById: Record<string, TranscriptChunk>;
  slotsById: Record<string, TranscriptPresentationSlot>;
  slotChunkById: Record<string, string>;
  liveItemsByTurnId: Record<string, TranscriptRenderableLiveItem[]>;
  liveItemIndexByKey: Record<string, TranscriptLiveItemIndex>;
  globalStatus: TranscriptGlobalStatus[];
  appliedEventIdsById: Record<string, true>;
  appliedEventOrder: string[];
};

export const createEmptyTranscriptState = (): TranscriptState => ({
  threadId: null,
  subscriptionId: null,
  presentationGeneration: 0,
  committedScrollCommitKey: null,
  liveScrollPulse: 0,
  turnIds: [],
  turnsById: {},
  chunksById: {},
  slotsById: {},
  slotChunkById: {},
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
