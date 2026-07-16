import type { RootState } from "@/app/store";
import {
  selectThreadRuntimeRecord,
  type ThreadRuntimeRecord,
} from "@/features/threadRuntime/threadRuntimeSlice";
import type { ThreadItem, Turn } from "@codex-protocol/v2";

export type SnapshotReplaySource = "snapshotReplay";

export type SnapshotReplayMaterial =
  | {
      type: "turnStarted";
      source: SnapshotReplaySource;
      threadId: string;
      turn: Turn;
    }
  | {
      type: "itemReplayed";
      source: SnapshotReplaySource;
      threadId: string;
      turnId: string;
      item: ThreadItem;
    }
  | {
      type: "turnCompleted";
      source: SnapshotReplaySource;
      threadId: string;
      turn: Omit<Turn, "items">;
    };

const SNAPSHOT_REPLAY_SOURCE: SnapshotReplaySource = "snapshotReplay";

const isTerminalTurn = (turn: Turn): boolean => {
  const { status } = turn;
  switch (status) {
    case "inProgress":
      return false;
    case "completed":
    case "interrupted":
    case "failed":
      return true;
    default: {
      const exhaustive: never = status;
      return exhaustive;
    }
  }
};

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

export const buildSnapshotReplayMaterials = (
  runtime: ThreadRuntimeRecord | null,
): SnapshotReplayMaterial[] => {
  if (runtime == null) {
    return [];
  }

  return runtime.snapshotTurns.flatMap((turn) => {
    const materials: SnapshotReplayMaterial[] = [
      {
        type: "turnStarted",
        source: SNAPSHOT_REPLAY_SOURCE,
        threadId: runtime.threadId,
        turn,
      },
    ];

    materials.push(
      ...turn.items.map(
        (item): SnapshotReplayMaterial => ({
          type: "itemReplayed",
          source: SNAPSHOT_REPLAY_SOURCE,
          threadId: runtime.threadId,
          turnId: turn.id,
          item,
        }),
      ),
    );

    if (isTerminalTurn(turn)) {
      materials.push({
        type: "turnCompleted",
        source: SNAPSHOT_REPLAY_SOURCE,
        threadId: runtime.threadId,
        turn: turnWithoutItems(turn),
      });
    }

    return materials;
  });
};

export const selectSnapshotReplayMaterials = (state: RootState): SnapshotReplayMaterial[] =>
  buildSnapshotReplayMaterials(selectThreadRuntimeRecord(state));
