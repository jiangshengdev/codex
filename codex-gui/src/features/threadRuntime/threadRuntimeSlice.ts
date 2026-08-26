import { createAppSlice } from "@/app/createAppSlice";
import { activeThreadReadModelTransitionApplied } from "@/features/activeThreadSession/activeThreadSessionReadModel";
import type { ActiveThreadProjectionReadModelFact } from "@/features/activeThreadSession/activeThreadProjection";
import type {
  Thread,
  ThreadProjectionEventNotification,
  ThreadTokenUsage,
  Turn,
} from "@codex-protocol/v2";

export type ThreadRuntimeEventReplay = "live" | "snapshotDuplicate";

export type ThreadRuntimeProjectionEventPayload = Readonly<{
  notification: ThreadProjectionEventNotification;
  replay: ThreadRuntimeEventReplay;
}>;

export type ThreadRuntimeRecord = {
  sessionRevision: number;
  threadId: string;
  thread: Omit<Thread, "turns">;
  tokenUsage: ThreadTokenUsage | null;
};

export type ThreadRuntimeState = {
  sessionRevision: number;
  current: ThreadRuntimeRecord | null;
};

const initialState: ThreadRuntimeState = {
  sessionRevision: 0,
  current: null,
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

const threadMetadata = ({ turns: _turns, ...thread }: Thread): Omit<Thread, "turns"> => thread;

const applyRuntimeFact = (
  state: ThreadRuntimeState,
  sessionRevision: number,
  fact: ActiveThreadProjectionReadModelFact,
): void => {
  switch (fact.type) {
    case "baselineAttached": {
      const thread = threadMetadata(fact.response.snapshot.thread);
      state.current = {
        sessionRevision,
        threadId: thread.id,
        thread,
        tokenUsage: fact.response.snapshot.tokenUsage,
      };
      return;
    }
    case "eventAccepted": {
      const { notification, replay } = fact.payload;
      if (
        replay === "live" &&
        notification.event.type === "tokenUsageUpdated" &&
        state.current?.threadId === notification.threadId
      ) {
        state.current.tokenUsage = notification.event.notification.tokenUsage;
      }
      return;
    }
    case "deltasAccepted":
    case "projectionUnavailable":
      return;
  }
  fact satisfies never;
};

export const threadRuntimeSlice = createAppSlice({
  name: "threadRuntime",
  initialState,
  reducers: () => ({}),
  extraReducers: (builder) => {
    builder.addCase(activeThreadReadModelTransitionApplied, (state, action) => {
      const { facts, sessionRevision } = action.payload;
      if (sessionRevision <= state.sessionRevision) {
        return;
      }

      for (const fact of facts) {
        applyRuntimeFact(state, sessionRevision, fact);
      }
      state.sessionRevision = sessionRevision;
      if (state.current != null) {
        state.current.sessionRevision = sessionRevision;
      }
    });
  },
  selectors: {
    selectThreadRuntimeRecord: (threadRuntime) => threadRuntime.current,
    selectThreadRuntimeThreadId: (threadRuntime) => threadRuntime.current?.threadId ?? null,
    selectThreadRuntimeTokenUsage: (threadRuntime): ThreadTokenUsage | null =>
      threadRuntime.current?.tokenUsage ?? null,
  },
});

export const {
  selectThreadRuntimeRecord,
  selectThreadRuntimeThreadId,
  selectThreadRuntimeTokenUsage,
} = threadRuntimeSlice.selectors;

export default threadRuntimeSlice;
