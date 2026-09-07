import { createAppSlice } from "@/app/createAppSlice";
import {
  activeThreadReadModelSlotCreated,
  activeThreadReadModelSlotRemoved,
  activeThreadReadModelTransitionApplied,
} from "@/features/activeThreadSession/activeThreadSessionReadModel";
import type { ActiveThreadSessionIdentity } from "@/features/activeThreadSession/activeThreadSessionIdentity";
import type { TranscriptState } from "./transcriptStateModel";
import { reduceTranscriptReadModelFact } from "./transcriptProjection";
import {
  createEmptyTranscriptState,
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

export type TranscriptStateSlot = {
  identity: ActiveThreadSessionIdentity;
  transcript: TranscriptState;
};

export type TranscriptCollectionState = {
  byThreadId: Record<string, TranscriptStateSlot>;
};

const initialState: TranscriptCollectionState = { byThreadId: {} };

const transcriptForThread = (state: TranscriptCollectionState, threadId: string): TranscriptState =>
  state.byThreadId[threadId]?.transcript ?? initialTranscriptState;

export const transcriptStateSlice = createAppSlice({
  name: "transcriptState",
  initialState,
  reducers: () => ({}),
  selectors: {
    selectTranscriptState: (state, threadId: string): TranscriptState | null =>
      state.byThreadId[threadId]?.transcript ?? null,
    selectCommittedTranscriptScrollCommitKey: (state, threadId: string): string | null =>
      transcriptForThread(state, threadId).committedScrollCommitKey,
    selectTranscriptLiveScrollPulse: (state, threadId: string): number =>
      transcriptForThread(state, threadId).liveScrollPulse,
    selectTranscriptTurnIds: (state, threadId: string): string[] =>
      transcriptForThread(state, threadId).turnIds,
    selectTranscriptTurn: (state, threadId: string, turnId: string): TranscriptTurn | null =>
      transcriptForThread(state, threadId).turnsById[turnId] ?? null,
    selectTranscriptContextPageIds: (state, threadId: string): string[] =>
      transcriptForThread(state, threadId).contextPageIds,
    selectTranscriptContextPage: (
      state,
      threadId: string,
      pageId: string,
    ): TranscriptContextPage | null =>
      transcriptContextPageTopology(transcriptForThread(state, threadId), pageId),
    selectTranscriptTurnFragment: (
      state,
      threadId: string,
      fragmentId: string,
    ): TranscriptTurnFragment | null =>
      transcriptTurnFragmentTopology(transcriptForThread(state, threadId), fragmentId),
    selectTranscriptChunk: (state, threadId: string, chunkId: string): TranscriptChunkView | null =>
      transcriptChunkView(transcriptForThread(state, threadId), chunkId),
    selectTranscriptEntry: (
      state,
      threadId: string,
      entryId: TranscriptEntryId,
    ): TranscriptEntryView | null =>
      transcriptEntryView(transcriptForThread(state, threadId), entryId),
    selectTranscriptGlobalStatus: (state, threadId: string): TranscriptGlobalStatus[] =>
      transcriptForThread(state, threadId).globalStatus,
  },
  extraReducers: (builder) => {
    builder.addCase(activeThreadReadModelSlotCreated, (state, { payload: identity }) => {
      if (state.byThreadId[identity.threadId] != null) {
        return;
      }
      return {
        byThreadId: {
          ...state.byThreadId,
          [identity.threadId]: { identity, transcript: createEmptyTranscriptState() },
        },
      };
    });
    builder.addCase(activeThreadReadModelSlotRemoved, (state, { payload: identity }) => {
      if (state.byThreadId[identity.threadId]?.identity.instanceId === identity.instanceId) {
        const { [identity.threadId]: _removed, ...byThreadId } = state.byThreadId;
        return { byThreadId };
      }
    });
    builder.addCase(activeThreadReadModelTransitionApplied, (state, action) => {
      const { identity, facts, sessionRevision } = action.payload;
      const slot = state.byThreadId[identity.threadId];
      if (
        slot?.identity.instanceId !== identity.instanceId ||
        sessionRevision <= slot.transcript.sessionRevision
      ) {
        return;
      }

      for (const fact of facts) {
        reduceTranscriptReadModelFact(slot.transcript, fact);
      }
      slot.transcript.sessionRevision = sessionRevision;
    });
  },
});

export const {
  selectTranscriptState,
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
