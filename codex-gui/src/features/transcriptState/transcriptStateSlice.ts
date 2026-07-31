import { createAppSlice } from "@/app/createAppSlice";
import {
  threadRuntimeAttached,
  threadRuntimeDeltasAccepted,
  threadRuntimeEventBuffered,
  threadRuntimeManualReconnectRequired,
} from "@/features/threadRuntime/threadRuntimeSlice";
import { reduceTranscriptInput } from "./transcriptProjection";
import {
  initialTranscriptState,
  type TranscriptChunkView,
  type TranscriptEntryId,
  type TranscriptGlobalStatus,
  type TranscriptMiddlePayload,
  type TranscriptTurn,
} from "./transcriptStateModel";
import { transcriptChunkView } from "./transcriptStateSelectors";

export {
  MAX_APPLIED_EVENT_ID_WINDOW_LENGTH,
  TARGET_TRANSCRIPT_CHUNK_ENTRY_LIMIT,
  transcriptEntryIdFor,
} from "./transcriptStateModel";
export type {
  TranscriptChunk,
  TranscriptChunkView,
  TranscriptEntryId,
  TranscriptEntry,
  TranscriptGlobalStatus,
  TranscriptLiveItemStatus,
  TranscriptMessagePhase,
  TranscriptMiddlePayload,
  TranscriptRenderableLiveItem,
  TranscriptState,
  TranscriptTurn,
} from "./transcriptStateModel";

export const transcriptStateSlice = createAppSlice({
  name: "transcriptState",
  initialState: initialTranscriptState,
  reducers: () => ({}),
  selectors: {
    selectCommittedTranscriptScrollCommitKey: (transcriptState): string | null =>
      transcriptState.committedScrollCommitKey,
    selectTranscriptLiveScrollPulse: (transcriptState): number => transcriptState.liveScrollPulse,
    selectTranscriptTurnIds: (transcriptState): string[] => transcriptState.turnIds,
    selectTranscriptTurn: (transcriptState, turnId: string): TranscriptTurn | null =>
      transcriptState.turnsById[turnId] ?? null,
    selectTranscriptChunk: (transcriptState, chunkId: string): TranscriptChunkView | null =>
      transcriptChunkView(transcriptState, chunkId),
    selectTranscriptEntry: (
      transcriptState,
      entryId: TranscriptEntryId,
    ): TranscriptMiddlePayload | null => transcriptState.entriesById[entryId] ?? null,
    selectTranscriptGlobalStatus: (transcriptState): TranscriptGlobalStatus[] =>
      transcriptState.globalStatus,
  },
  extraReducers: (builder) => {
    builder
      .addCase(threadRuntimeAttached, (state, action) => {
        reduceTranscriptInput(state, action);
      })
      .addCase(threadRuntimeEventBuffered, (state, action) => {
        reduceTranscriptInput(state, action);
      })
      .addCase(threadRuntimeDeltasAccepted, (state, action) => {
        reduceTranscriptInput(state, action);
      })
      .addCase(threadRuntimeManualReconnectRequired, (state, action) => {
        reduceTranscriptInput(state, action);
      });
  },
});

export const {
  selectCommittedTranscriptScrollCommitKey,
  selectTranscriptLiveScrollPulse,
  selectTranscriptTurnIds,
  selectTranscriptTurn,
  selectTranscriptChunk,
  selectTranscriptEntry,
  selectTranscriptGlobalStatus,
} = transcriptStateSlice.selectors;

export default transcriptStateSlice;
