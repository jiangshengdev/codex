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

export type ThreadRuntimeBufferedEvent = {
  type: "projectionEvent";
  notification: ThreadProjectionEventNotification;
};

export type ThreadRuntimeRecord = {
  threadId: string;
  sessionId: string;
  thread: Omit<Thread, "turns">;
  snapshotTurns: Turn[];
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

const activeTurnIdFromSnapshot = (turns: Turn[]): string | null =>
  turns.toReversed().find((turn) => turn.status === "inProgress")?.id ?? null;

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
          eventBuffer: [],
          activeTurnId: activeTurnIdFromSnapshot(snapshotTurns),
          subscription: { state: "active" },
        };
      },
    ),
    threadRuntimeEventBuffered: create.reducer(
      (state, action: PayloadAction<ThreadProjectionEventNotification>) => {
        const runtime = state.current;
        if (runtime?.subscription.state !== "active") {
          return;
        }

        runtime.eventBuffer.push({
          type: "projectionEvent",
          notification: action.payload,
        });

        switch (action.payload.event.type) {
          case "turnStarted":
            runtime.activeTurnId = action.payload.event.notification.turn.id;
            return;
          case "turnCompleted":
            if (runtime.activeTurnId === action.payload.event.notification.turn.id) {
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
} = threadRuntimeSlice.selectors;

export default threadRuntimeSlice;
