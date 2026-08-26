import type { ActiveThreadProjectionReadModelFact } from "@/features/activeThreadSession/activeThreadProjection";
import {
  appendStartedTranscriptItem,
  applyAcceptedProjectionDeltaBatch,
  applyCompletedTranscriptItem,
  clearAllStreamingReasoning,
  clearStreamingReasoningForTurn,
  hasTranscriptEntry,
  rebuildTranscriptFromSnapshot,
  upsertTranscriptTurn,
} from "./transcriptStateImplementation";
import { hasAppliedTranscriptEvent, recordAppliedTranscriptEvent } from "./transcriptEventDedup";
import type { TranscriptState } from "./transcriptStateModel";

export const reduceTranscriptReadModelFact = (
  state: TranscriptState,
  fact: ActiveThreadProjectionReadModelFact,
): void => {
  switch (fact.type) {
    case "baselineAttached":
      rebuildTranscriptFromSnapshot(
        state,
        fact.response.snapshot.thread.id,
        fact.response.subscriptionId,
        fact.response.snapshot.headCommitId,
        fact.response.snapshot.thread.turns,
      );
      return;
    case "eventAccepted": {
      const { notification, replay } = fact.payload;
      if (replay === "snapshotDuplicate") {
        return;
      }

      if (state.threadId !== notification.threadId) {
        return;
      }

      if (notification.event.type === "tokenUsageUpdated") {
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
          upsertTranscriptTurn(state, notification.event.notification.turn);
          return;
        case "turnCompleted": {
          const { turn } = notification.event.notification;
          upsertTranscriptTurn(state, turn);
          if (
            (turn.status === "interrupted" || turn.status === "failed") &&
            clearStreamingReasoningForTurn(state, turn.id)
          ) {
            state.committedScrollCommitKey = `event:${notification.commitId}`;
          }
          return;
        }
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
    case "deltasAccepted":
      applyAcceptedProjectionDeltaBatch(state, [...fact.notifications]);
      return;
    case "projectionUnavailable":
      if (state.threadId !== fact.threadId) {
        return;
      }

      if (clearAllStreamingReasoning(state)) {
        state.committedScrollCommitKey = `reconnect:${fact.threadId}:${fact.subscriptionId ?? "none"}:${fact.reason}`;
      }

      state.globalStatus = [
        {
          id: `subscriptionInterrupted:${fact.threadId}:${fact.subscriptionId ?? "none"}:${fact.reason}`,
          status: "subscriptionInterrupted",
          reason: fact.reason,
          subscriptionId: fact.subscriptionId,
        },
      ];
      return;
  }
  fact satisfies never;
};
