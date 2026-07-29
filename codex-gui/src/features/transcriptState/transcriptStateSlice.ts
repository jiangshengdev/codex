import { createAppSlice } from "@/app/createAppSlice";
import {
  threadRuntimeAttached,
  threadRuntimeDeltasAccepted,
  threadRuntimeEventBuffered,
  threadRuntimeManualReconnectRequired,
} from "@/features/threadRuntime/threadRuntimeSlice";
import {
  applyCompletedTranscriptItem,
  applyStartedTranscriptItem,
  applyTranscriptDeltaBatch,
  rebuildTranscriptFromSnapshot,
  upsertTranscriptTurn,
} from "./transcriptMessageProjection";
import { hasAppliedTranscriptEvent, recordAppliedTranscriptEvent } from "./transcriptEventDedup";
import {
  initialTranscriptState,
  type TranscriptEntry,
  type TranscriptGlobalStatus,
  type TranscriptMessageChunk,
  type TranscriptMessageKey,
  type TranscriptMessagePlacement,
  type TranscriptMessagePresentation,
  type TranscriptRenderableLiveItem,
  type TranscriptTurn,
} from "./transcriptStateModel";
import {
  transcriptMessageChunk,
  transcriptMessagePresentation,
  transcriptMiddleMessagePresentation,
} from "./transcriptStateSelectors";

export {
  MAX_APPLIED_EVENT_ID_WINDOW_LENGTH,
  TARGET_TRANSCRIPT_CHUNK_ENTRY_LIMIT,
} from "./transcriptStateModel";
export type {
  TranscriptEntry,
  TranscriptGlobalStatus,
  TranscriptLiveItemIndex,
  TranscriptLiveItemStatus,
  TranscriptMessageChunk,
  TranscriptMessageKey,
  TranscriptMessagePhase,
  TranscriptMessagePlacement,
  TranscriptMessagePresentation,
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
    selectTranscriptMessageChunk: (
      transcriptState,
      chunkId: string,
    ): TranscriptMessageChunk | null => transcriptMessageChunk(transcriptState, chunkId),
    selectTranscriptMessagePresentation: (
      transcriptState,
      key: TranscriptMessageKey,
    ): TranscriptMessagePresentation | null => transcriptMessagePresentation(transcriptState, key),
    selectTranscriptMiddleMessagePresentation: (
      transcriptState,
      key: TranscriptMessageKey,
    ): TranscriptMessagePresentation | null =>
      transcriptMiddleMessagePresentation(transcriptState, key),
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

        recordAppliedTranscriptEvent(state, notification.commitId);

        switch (notification.event.type) {
          case "turnStarted":
          case "turnCompleted":
            upsertTranscriptTurn(state, notification.event.notification.turn);
            return;
          case "itemCompleted": {
            const { item, turnId } = notification.event.notification;
            if (applyCompletedTranscriptItem(state, turnId, item)) {
              state.committedScrollCommitKey = `event:${notification.commitId}`;
            }
            return;
          }
          case "itemStarted": {
            const { item, turnId } = notification.event.notification;
            applyStartedTranscriptItem(state, turnId, item);
            return;
          }
        }
        notification.event satisfies never;
      })
      .addCase(threadRuntimeDeltasAccepted, (state, action) => {
        applyTranscriptDeltaBatch(state, action.payload.notifications);
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
  selectTranscriptMessageChunk,
  selectTranscriptMessagePresentation,
  selectTranscriptMiddleMessagePresentation,
  selectTranscriptGlobalStatus,
} = transcriptStateSlice.selectors;

export default transcriptStateSlice;
