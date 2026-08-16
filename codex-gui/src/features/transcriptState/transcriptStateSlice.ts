import { createAppSlice } from "@/app/createAppSlice";
import { liveThreadReplacementCommitted } from "@/features/projectionCoordination/liveThreadReplacement";
import {
  threadRuntimeAttached,
  threadRuntimeDeltasAccepted,
  threadRuntimeEventBuffered,
  threadRuntimeManualReconnectRequired,
} from "@/features/threadRuntime/threadRuntimeSlice";
import { reduceTranscriptInput } from "./transcriptProjection";
import {
  initialTranscriptState,
  resetTranscriptState,
  type TranscriptChunkView,
  type TranscriptContextPage,
  type TranscriptEntryId,
  type TranscriptEntryView,
  type TranscriptGlobalStatus,
  type TranscriptTurn,
  type TranscriptTurnFragment,
} from "./transcriptStateModel";
import {
  transcriptChunkView,
  transcriptContextPageTopology,
  transcriptEntryView,
  transcriptTurnFragmentTopology,
} from "./transcriptStateSelectors";

export {
  MAX_APPLIED_EVENT_ID_WINDOW_LENGTH,
  TARGET_TRANSCRIPT_CHUNK_ENTRY_LIMIT,
  transcriptEntryIdFor,
} from "./transcriptStateModel";
export type {
  TranscriptChunk,
  TranscriptChunkView,
  TranscriptContextPage,
  TranscriptEntryId,
  TranscriptEntryView,
  TranscriptGlobalStatus,
  TranscriptMessageRendering,
  TranscriptMessageView,
  TranscriptState,
  TranscriptStatusView,
  TranscriptTurn,
  TranscriptTurnFragment,
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
    selectTranscriptContextPageIds: (transcriptState): string[] => transcriptState.contextPageIds,
    selectTranscriptContextPage: (transcriptState, pageId: string): TranscriptContextPage | null =>
      transcriptContextPageTopology(transcriptState, pageId),
    selectTranscriptTurnFragment: (
      transcriptState,
      fragmentId: string,
    ): TranscriptTurnFragment | null => transcriptTurnFragmentTopology(transcriptState, fragmentId),
    selectTranscriptChunk: (transcriptState, chunkId: string): TranscriptChunkView | null =>
      transcriptChunkView(transcriptState, chunkId),
    selectTranscriptEntry: (
      transcriptState,
      entryId: TranscriptEntryId,
    ): TranscriptEntryView | null => transcriptEntryView(transcriptState, entryId),
    selectTranscriptGlobalStatus: (transcriptState): TranscriptGlobalStatus[] =>
      transcriptState.globalStatus,
  },
  extraReducers: (builder) => {
    builder
      .addCase(liveThreadReplacementCommitted, (state, action) => {
        resetTranscriptState(state, action.payload.transcriptState);
      })
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
  selectTranscriptContextPageIds,
  selectTranscriptContextPage,
  selectTranscriptTurnFragment,
  selectTranscriptChunk,
  selectTranscriptEntry,
  selectTranscriptGlobalStatus,
} = transcriptStateSlice.selectors;

export default transcriptStateSlice;
