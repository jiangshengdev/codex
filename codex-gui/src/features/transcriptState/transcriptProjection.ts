import {
  threadRuntimeAttached,
  threadRuntimeDeltasAccepted,
  threadRuntimeEventBuffered,
  threadRuntimeManualReconnectRequired,
} from "@/features/threadRuntime/threadRuntimeSlice";
import {
  appendStartedTranscriptItem,
  applyAcceptedProjectionDeltaBatch,
  applyCompletedTranscriptItem,
  hasTranscriptEntry,
  rebuildTranscriptFromSnapshot,
  upsertTranscriptTurn,
} from "./transcriptStateImplementation";
import { hasAppliedTranscriptEvent, recordAppliedTranscriptEvent } from "./transcriptEventDedup";
import type { TranscriptState } from "./transcriptStateModel";

type TranscriptInput =
  | ReturnType<typeof threadRuntimeAttached>
  | ReturnType<typeof threadRuntimeDeltasAccepted>
  | ReturnType<typeof threadRuntimeEventBuffered>
  | ReturnType<typeof threadRuntimeManualReconnectRequired>;

export const reduceTranscriptInput = (state: TranscriptState, action: TranscriptInput): void => {
  switch (action.type) {
    case threadRuntimeAttached.type:
      rebuildTranscriptFromSnapshot(
        state,
        action.payload.snapshot.thread.id,
        action.payload.subscriptionId,
        action.payload.snapshot.headCommitId,
        action.payload.snapshot.thread.turns,
      );
      return;
    case threadRuntimeEventBuffered.type: {
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
        if (hasTranscriptEntry(state, turnId, item.id)) {
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
          applyCompletedTranscriptItem(state, turnId, item, notification.commitId);
          return;
        }
        case "itemStarted": {
          const { item, turnId } = notification.event.notification;
          appendStartedTranscriptItem(state, turnId, item, notification.commitId);
          return;
        }
      }
      notification.event satisfies never;
      return;
    }
    case threadRuntimeDeltasAccepted.type:
      applyAcceptedProjectionDeltaBatch(state, action.payload.notifications);
      return;
    case threadRuntimeManualReconnectRequired.type:
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
      return;
  }
  action satisfies never;
};
