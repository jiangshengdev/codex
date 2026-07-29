import { createAppSlice } from "@/app/createAppSlice";
import {
  threadRuntimeAttached,
  threadRuntimeDeltasAccepted,
  threadRuntimeEventBuffered,
  threadRuntimeManualReconnectRequired,
} from "@/features/threadRuntime/threadRuntimeSlice";
import {
  applyCompletedTranscriptItem,
  ensureTranscriptTurn,
  rebuildTranscriptFromSnapshot,
  upsertTranscriptTurn,
} from "./transcriptCommittedProjection";
import { hasAppliedTranscriptEvent, recordAppliedTranscriptEvent } from "./transcriptEventDedup";
import {
  appendStartedLiveItem,
  applyAcceptedProjectionDeltaBatch,
  hasLiveItem,
  removeLiveItemIfPresent,
} from "./transcriptLiveProjection";
import {
  initialTranscriptState,
  type TranscriptChunkView,
  type TranscriptEntry,
  type TranscriptGlobalStatus,
  type TranscriptRenderableLiveItem,
  type TranscriptTurn,
} from "./transcriptStateModel";
import {
  transcriptChunkView,
  transcriptLiveItem,
  transcriptLiveItemsForTurn,
} from "./transcriptStateSelectors";

export {
  MAX_APPLIED_EVENT_ID_WINDOW_LENGTH,
  TARGET_TRANSCRIPT_CHUNK_ENTRY_LIMIT,
} from "./transcriptStateModel";
export type {
  TranscriptChunk,
  TranscriptChunkView,
  TranscriptEntry,
  TranscriptGlobalStatus,
  TranscriptLiveItemIndex,
  TranscriptLiveItemStatus,
  TranscriptMessagePhase,
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
    selectTranscriptEntry: (transcriptState, entryId: string): TranscriptEntry | null =>
      transcriptState.entriesById[entryId] ?? null,
    selectTranscriptLiveItem: (
      transcriptState,
      turnId: string,
      itemId: string,
    ): TranscriptRenderableLiveItem | null => transcriptLiveItem(transcriptState, turnId, itemId),
    selectTranscriptLiveItemsForTurn: (
      transcriptState,
      turnId: string,
    ): readonly TranscriptRenderableLiveItem[] =>
      transcriptLiveItemsForTurn(transcriptState, turnId),
    selectTranscriptGlobalStatus: (transcriptState): TranscriptGlobalStatus[] =>
      transcriptState.globalStatus,
  },
  extraReducers: (builder) => {
    builder
      .addCase(threadRuntimeAttached, (state, action) => {
        rebuildTranscriptFromSnapshot(
          state,
          action.payload.snapshot.thread.id,
          action.payload.subscriptionId,
          action.payload.snapshot.headCommitId,
          action.payload.snapshot.thread.turns,
        );
      })
      .addCase(threadRuntimeEventBuffered, (state, action) => {
        const { notification, replay } = action.payload;
        if (replay === "snapshotDuplicate") {
          return;
        }

        if (state.threadId !== notification.threadId) {
          return;
        }

        if (hasAppliedTranscriptEvent(state, notification.commitId)) {
          return;
        }

        if (notification.event.type === "itemStarted") {
          const { item, turnId } = notification.event.notification;
          if (hasLiveItem(state, turnId, item.id)) {
            return;
          }
        }

        recordAppliedTranscriptEvent(state, notification.commitId);

        switch (notification.event.type) {
          case "turnStarted":
          case "turnCompleted":
            upsertTranscriptTurn(state, notification.event.notification.turn);
            return;
          case "itemCompleted": {
            const { item, turnId } = notification.event.notification;
            removeLiveItemIfPresent(state, turnId, item.id);
            if (applyCompletedTranscriptItem(state, turnId, item)) {
              state.committedScrollCommitKey = `event:${notification.commitId}`;
            }
            return;
          }
          case "itemStarted": {
            const { item, turnId } = notification.event.notification;
            ensureTranscriptTurn(state, turnId);
            appendStartedLiveItem(state, turnId, item);
            return;
          }
        }
        notification.event satisfies never;
      })
      .addCase(threadRuntimeDeltasAccepted, (state, action) => {
        applyAcceptedProjectionDeltaBatch(state, action.payload.notifications);
      })
      .addCase(threadRuntimeManualReconnectRequired, (state, action) => {
        if (state.threadId !== action.payload.threadId) {
          return;
        }

        state.globalStatus = [
          {
            id: `subscriptionInterrupted:${action.payload.threadId}:${action.payload.subscriptionId ?? "none"}:${action.payload.reason}`,
            status: "subscriptionInterrupted",
            reason: action.payload.reason,
            subscriptionId: action.payload.subscriptionId,
          },
        ];
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
  selectTranscriptLiveItem,
  selectTranscriptLiveItemsForTurn,
  selectTranscriptGlobalStatus,
} = transcriptStateSlice.selectors;

export default transcriptStateSlice;
