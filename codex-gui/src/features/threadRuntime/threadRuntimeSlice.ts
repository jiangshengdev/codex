import type { PayloadAction } from "@reduxjs/toolkit";
import { createAppSlice } from "@/app/createAppSlice";
import type { ProjectionManualReconnectReason } from "@/features/projectionIngress/projectionIngressAdapter";
import { liveThreadReplacementCommitted } from "@/features/projectionCoordination/liveThreadReplacement";
import type {
  Thread,
  ThreadProjectionAttachResponse,
  ThreadProjectionDeltaNotification,
  ThreadProjectionEventNotification,
  ThreadTokenUsage,
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

export type ThreadRuntimeProjectionDeltasPayload = {
  notifications: ThreadProjectionDeltaNotification[];
};

export type ThreadRuntimeBufferedEvent = {
  type: "projectionEvent";
  notification: ThreadProjectionEventNotification;
  replay: ThreadRuntimeEventReplay;
};

export type ThreadRuntimeTurnCompletionStatus = Exclude<Turn["status"], "inProgress">;

export type ThreadRuntimeLiveTurnCompletion = {
  status: ThreadRuntimeTurnCompletionStatus;
  turnId: string;
  commitId: string;
};

export type ThreadRuntimeRecord = {
  threadId: string;
  sessionId: string;
  thread: Omit<Thread, "turns">;
  snapshotTurns: Turn[];
  tokenUsage: ThreadTokenUsage | null;
  eventBuffer: ThreadRuntimeBufferedEvent[];
  activeTurnId: string | null;
  latestLiveTurnCompletion: ThreadRuntimeLiveTurnCompletion | null;
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

const threadRuntimeRecordFromAttach = (
  response: ThreadProjectionAttachResponse,
): ThreadRuntimeRecord => {
  const { turns: snapshotTurns, ...thread } = response.snapshot.thread;
  return {
    threadId: thread.id,
    sessionId: thread.sessionId,
    thread,
    snapshotTurns,
    tokenUsage: response.snapshot.tokenUsage,
    eventBuffer: [],
    activeTurnId: activeTurnIdFromSnapshot(snapshotTurns),
    latestLiveTurnCompletion: null,
    subscription: { state: "active" },
  };
};

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
    case "tokenUsageUpdated":
      return "live";
  }
  notification.event satisfies never;
};

export const threadRuntimeSlice = createAppSlice({
  name: "threadRuntime",
  initialState,
  reducers: (create) => ({
    threadRuntimeAttached: create.reducer(
      (state, action: PayloadAction<ThreadProjectionAttachResponse>) => {
        state.current = threadRuntimeRecordFromAttach(action.payload);
      },
    ),
    threadRuntimeDeltasAccepted: create.reducer(
      // eslint-disable-next-line @typescript-eslint/no-empty-function -- Accepted projection delta batches are a cross-slice signal; runtime intentionally does not mutate buffers.
      (_state, _action: PayloadAction<ThreadRuntimeProjectionDeltasPayload>) => {},
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
            if (notification.event.notification.turn.status !== "inProgress") {
              runtime.latestLiveTurnCompletion = {
                status: notification.event.notification.turn.status,
                turnId: notification.event.notification.turn.id,
                commitId: notification.commitId,
              };
            }
            return;
          case "itemStarted":
          case "itemCompleted":
            return;
          case "tokenUsageUpdated":
            runtime.tokenUsage = notification.event.notification.tokenUsage;
            return;
        }
        notification.event satisfies never;
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
  extraReducers: (builder) => {
    builder.addCase(liveThreadReplacementCommitted, (state, action) => {
      state.current = threadRuntimeRecordFromAttach(action.payload.response);
    });
  },
  selectors: {
    selectThreadRuntimeRecord: (threadRuntime) => threadRuntime.current,
    selectThreadRuntimeActiveTurnId: (threadRuntime) => threadRuntime.current?.activeTurnId ?? null,
    selectThreadRuntimeLatestLiveTurnCompletion: (threadRuntime) =>
      threadRuntime.current?.latestLiveTurnCompletion ?? null,
    selectThreadRuntimeTokenUsage: (threadRuntime): ThreadTokenUsage | null =>
      threadRuntime.current?.tokenUsage ?? null,
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
  threadRuntimeDeltasAccepted,
  threadRuntimeEventBuffered,
  threadRuntimeManualReconnectRequired,
} = threadRuntimeSlice.actions;

export const {
  selectThreadRuntimeActiveTurnId,
  selectThreadRuntimeEventBuffer,
  selectThreadRuntimeLatestLiveTurnCompletion,
  selectThreadRuntimeRecord,
  selectThreadRuntimeSubscription,
  selectThreadRuntimeSubscriptionState,
  selectThreadRuntimeThreadId,
  selectThreadRuntimeTokenUsage,
} = threadRuntimeSlice.selectors;

export default threadRuntimeSlice;
