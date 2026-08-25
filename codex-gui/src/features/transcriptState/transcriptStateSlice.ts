import { createAppSlice } from "@/app/createAppSlice";
import { activeThreadReadModelTransitionApplied } from "@/features/activeThreadSession/activeThreadSessionReadModel";
import { reduceTranscriptReadModelFact } from "./transcriptProjection";
import {
  initialTranscriptState,
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
    builder.addCase(activeThreadReadModelTransitionApplied, (state, action) => {
      const { facts, sessionRevision } = action.payload;
      if (sessionRevision <= state.sessionRevision) {
        return;
      }

      for (const fact of facts) {
        reduceTranscriptReadModelFact(state, fact);
      }
      state.sessionRevision = sessionRevision;
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
