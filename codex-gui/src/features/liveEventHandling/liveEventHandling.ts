import type { RootState } from "@/app/store";
import {
  selectSnapshotReplayMaterials,
  type SnapshotReplayMaterial,
} from "@/features/snapshotReplay/snapshotReplay";
import {
  selectThreadRuntimeRecord,
  type ThreadRuntimeBufferedEvent,
  type ThreadRuntimeRecord,
} from "@/features/threadRuntime/threadRuntimeSlice";
import type { ProjectionManualReconnectReason } from "@/features/projectionIngress/projectionIngressAdapter";
import type { ThreadItem, Turn } from "@codex-protocol/v2";

export type LiveEventSource = "liveEvent";

export type LiveEventMaterial =
  | {
      type: "turnStarted";
      source: LiveEventSource;
      threadId: string;
      turn: Turn;
    }
  | {
      type: "itemStarted";
      source: LiveEventSource;
      threadId: string;
      turnId: string;
      item: ThreadItem;
    }
  | {
      type: "itemCompleted";
      source: LiveEventSource;
      threadId: string;
      turnId: string;
      item: ThreadItem;
    }
  | {
      type: "turnCompleted";
      source: LiveEventSource;
      threadId: string;
      turn: Omit<Turn, "items">;
    };

export type LiveSubscriptionMaterial = {
  type: "subscriptionInterrupted";
  source: LiveEventSource;
  threadId: string;
  reason: ProjectionManualReconnectReason;
  subscriptionId: string | null;
};

export type TimelineMaterial =
  | SnapshotReplayMaterial
  | LiveEventMaterial
  | LiveSubscriptionMaterial;

const LIVE_EVENT_SOURCE: LiveEventSource = "liveEvent";

const turnWithoutItems = ({
  id,
  itemsView,
  status,
  error,
  startedAt,
  completedAt,
  durationMs,
}: Turn): Omit<Turn, "items"> => ({
  id,
  itemsView,
  status,
  error,
  startedAt,
  completedAt,
  durationMs,
});

const liveMaterialFromBufferedEvent = (
  bufferedEvent: ThreadRuntimeBufferedEvent,
): LiveEventMaterial => {
  const { notification } = bufferedEvent;

  switch (notification.event.type) {
    case "turnStarted":
      return {
        type: "turnStarted",
        source: LIVE_EVENT_SOURCE,
        threadId: notification.threadId,
        turn: notification.event.notification.turn,
      };
    case "itemStarted":
      return {
        type: "itemStarted",
        source: LIVE_EVENT_SOURCE,
        threadId: notification.threadId,
        turnId: notification.event.notification.turnId,
        item: notification.event.notification.item,
      };
    case "itemCompleted":
      return {
        type: "itemCompleted",
        source: LIVE_EVENT_SOURCE,
        threadId: notification.threadId,
        turnId: notification.event.notification.turnId,
        item: notification.event.notification.item,
      };
    case "turnCompleted":
      return {
        type: "turnCompleted",
        source: LIVE_EVENT_SOURCE,
        threadId: notification.threadId,
        turn: turnWithoutItems(notification.event.notification.turn),
      };
  }
};

export const buildLiveEventMaterials = (
  runtime: ThreadRuntimeRecord | null,
): LiveEventMaterial[] => {
  if (runtime == null) {
    return [];
  }

  return runtime.eventBuffer
    .filter((bufferedEvent) => bufferedEvent.replay === "live")
    .map(liveMaterialFromBufferedEvent);
};

export const buildLiveSubscriptionMaterials = (
  runtime: ThreadRuntimeRecord | null,
): LiveSubscriptionMaterial[] => {
  if (runtime?.subscription.state !== "manualReconnectRequired") {
    return [];
  }

  return [
    {
      type: "subscriptionInterrupted",
      source: LIVE_EVENT_SOURCE,
      threadId: runtime.threadId,
      reason: runtime.subscription.reason,
      subscriptionId: runtime.subscription.subscriptionId,
    },
  ];
};

export const selectLiveEventMaterials = (state: RootState): LiveEventMaterial[] =>
  buildLiveEventMaterials(selectThreadRuntimeRecord(state));

export const selectLiveSubscriptionMaterials = (state: RootState): LiveSubscriptionMaterial[] =>
  buildLiveSubscriptionMaterials(selectThreadRuntimeRecord(state));

export const selectThreadTimelineMaterials = (state: RootState): TimelineMaterial[] => [
  ...selectSnapshotReplayMaterials(state),
  ...selectLiveEventMaterials(state),
  ...selectLiveSubscriptionMaterials(state),
];
