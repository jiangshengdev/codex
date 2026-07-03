import type { PayloadAction } from "@reduxjs/toolkit";
import { createAppSlice } from "@/app/createAppSlice";
import type { ProjectionManualReconnectReason } from "@/features/projectionIngress/projectionIngressAdapter";
import type {
  Thread,
  ThreadProjectionAttachResponse,
  ThreadProjectionEventNotification,
  Turn,
} from "@codex-protocol/v2";

export type ThreadRuntimeSubscription =
  | { state: "active" }
  | {
      state: "manualReconnectRequired";
      reason: ProjectionManualReconnectReason;
      subscriptionId: string | null;
    };

export type ThreadRuntimeEventReplay = "live" | "snapshotDuplicate";

export type ThreadRuntimeProjectionEventPayload = {
  notification: ThreadProjectionEventNotification;
  replay: ThreadRuntimeEventReplay;
};

export type ThreadRuntimeBufferedEvent = {
  type: "projectionEvent";
  notification: ThreadProjectionEventNotification;
  replay: ThreadRuntimeEventReplay;
};

export type ThreadRuntimeRecord = {
  threadId: string;
  sessionId: string;
  thread: Omit<Thread, "turns">;
  snapshotTurns: Turn[];
  snapshotReplayIndex: SnapshotReplayIndex;
  eventBuffer: ThreadRuntimeBufferedEvent[];
  activeTurnId: string | null;
  subscription: ThreadRuntimeSubscription;
};

export type ThreadRuntimeState = {
  current: ThreadRuntimeRecord | null;
};

export type ThreadRuntimeManualReconnectPayload = {
  reason: ProjectionManualReconnectReason;
  threadId: string;
  subscriptionId: string | null;
};

const initialState: ThreadRuntimeState = {
  current: null,
};

const EMPTY_EVENT_BUFFER: ThreadRuntimeBufferedEvent[] = [];
const MAX_THREAD_RUNTIME_EVENT_BUFFER_LENGTH = 500;

const activeTurnIdFromSnapshot = (turns: Turn[]): string | null =>
  turns.toReversed().find((turn) => turn.status === "inProgress")?.id ?? null;

export type SnapshotReplayIndex = {
  turnStatusById: Partial<Record<string, Turn["status"]>>;
  itemIdsById: Record<string, true>;
};

const idsById = (ids: string[]): Record<string, true> =>
  Object.fromEntries(ids.map((id) => [id, true]));

export const snapshotReplayIndexFromTurns = (turns: Turn[]): SnapshotReplayIndex => ({
  turnStatusById: Object.fromEntries(turns.map((turn) => [turn.id, turn.status])),
  itemIdsById: idsById(turns.flatMap((turn) => turn.items.map((item) => item.id))),
});

export const replayForProjectionEvent = (
  index: SnapshotReplayIndex,
  notification: ThreadProjectionEventNotification,
): ThreadRuntimeEventReplay => {
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
    case "itemCompleted":
      return index.itemIdsById[notification.event.notification.item.id] === true
        ? "snapshotDuplicate"
        : "live";
  }
};

export const threadRuntimeSlice = createAppSlice({
  name: "threadRuntime",
  initialState,
  reducers: (create) => ({
    threadRuntimeAttached: create.reducer(
      (state, action: PayloadAction<ThreadProjectionAttachResponse>) => {
        const { turns: snapshotTurns, ...thread } = action.payload.snapshot.thread;

        state.current = {
          threadId: thread.id,
          sessionId: thread.sessionId,
          thread,
          snapshotTurns,
          snapshotReplayIndex: snapshotReplayIndexFromTurns(snapshotTurns),
          eventBuffer: [],
          activeTurnId: activeTurnIdFromSnapshot(snapshotTurns),
          subscription: { state: "active" },
        };
      },
    ),
    threadRuntimeEventBuffered: create.reducer(
      (state, action: PayloadAction<ThreadRuntimeProjectionEventPayload>) => {
        const runtime = state.current;
        if (runtime?.subscription.state !== "active") {
          return;
        }
        const { notification, replay } = action.payload;

        runtime.eventBuffer.push({
          type: "projectionEvent",
          notification,
          replay,
        });

        if (runtime.eventBuffer.length > MAX_THREAD_RUNTIME_EVENT_BUFFER_LENGTH) {
          runtime.eventBuffer.splice(
            0,
            runtime.eventBuffer.length - MAX_THREAD_RUNTIME_EVENT_BUFFER_LENGTH,
          );
        }

        if (replay === "snapshotDuplicate") {
          return;
        }

        switch (notification.event.type) {
          case "turnStarted":
            runtime.activeTurnId = notification.event.notification.turn.id;
            return;
          case "turnCompleted":
            if (runtime.activeTurnId === notification.event.notification.turn.id) {
              runtime.activeTurnId = null;
            }
            return;
          case "itemStarted":
          case "itemCompleted":
            return;
        }
      },
    ),
    threadRuntimeManualReconnectRequired: create.reducer(
      (state, action: PayloadAction<ThreadRuntimeManualReconnectPayload>) => {
        const runtime = state.current;
        if (runtime?.threadId !== action.payload.threadId) {
          return;
        }

        runtime.subscription = {
          state: "manualReconnectRequired",
          reason: action.payload.reason,
          subscriptionId: action.payload.subscriptionId,
        };
      },
    ),
  }),
  selectors: {
    selectThreadRuntimeRecord: (threadRuntime) => threadRuntime.current,
    selectThreadRuntimeActiveTurnId: (threadRuntime) => threadRuntime.current?.activeTurnId ?? null,
    selectThreadRuntimeSubscription: (threadRuntime) => threadRuntime.current?.subscription ?? null,
    selectThreadRuntimeThreadId: (threadRuntime) => threadRuntime.current?.threadId ?? null,
    selectThreadRuntimeSubscriptionState: (threadRuntime) =>
      threadRuntime.current?.subscription.state ?? null,
    selectThreadRuntimeEventBuffer: (threadRuntime) =>
      threadRuntime.current?.eventBuffer ?? EMPTY_EVENT_BUFFER,
  },
});

export const {
  threadRuntimeAttached,
  threadRuntimeEventBuffered,
  threadRuntimeManualReconnectRequired,
} = threadRuntimeSlice.actions;

export const {
  selectThreadRuntimeActiveTurnId,
  selectThreadRuntimeEventBuffer,
  selectThreadRuntimeRecord,
  selectThreadRuntimeSubscription,
  selectThreadRuntimeSubscriptionState,
  selectThreadRuntimeThreadId,
} = threadRuntimeSlice.selectors;

export default threadRuntimeSlice;
