import type { ThreadProjectionEventNotification, Turn } from "@codex-protocol/v2";
import type { ActiveThreadProjectionEventReplay } from "./activeThreadProjectionFacts";

type SnapshotReplayIndex = {
  turnStatusById: Partial<Record<string, Turn["status"]>>;
  itemIdsById: Record<string, true>;
  completedItemIdsById: Record<string, true>;
};

const idsById = (ids: string[]): Record<string, true> =>
  Object.fromEntries(ids.map((id) => [id, true]));

export const snapshotReplayIndexFromTurns = (turns: Turn[]): SnapshotReplayIndex => ({
  turnStatusById: Object.fromEntries(turns.map((turn) => [turn.id, turn.status])),
  itemIdsById: idsById(turns.flatMap((turn) => turn.items.map((item) => item.id))),
  completedItemIdsById: idsById(
    turns.flatMap((turn) =>
      turn.items
        .filter((item) => item.type !== "collabAgentToolCall" || item.status !== "inProgress")
        .map((item) => item.id),
    ),
  ),
});

export const replayForProjectionEvent = (
  index: SnapshotReplayIndex,
  notification: ThreadProjectionEventNotification,
): ActiveThreadProjectionEventReplay => {
  switch (notification.event.type) {
    case "turnStarted":
      return index.turnStatusById[notification.event.notification.turn.id] != null
        ? "snapshotDuplicate"
        : "live";
    case "turnCompleted":
      return index.turnStatusById[notification.event.notification.turn.id] ===
        notification.event.notification.turn.status
        ? "snapshotDuplicate"
        : "live";
    case "itemStarted":
      return index.itemIdsById[notification.event.notification.item.id] === true
        ? "snapshotDuplicate"
        : "live";
    case "itemCompleted":
      return index.completedItemIdsById[notification.event.notification.item.id] === true
        ? "snapshotDuplicate"
        : "live";
    case "tokenUsageUpdated":
      return "live";
  }
  notification.event satisfies never;
};
