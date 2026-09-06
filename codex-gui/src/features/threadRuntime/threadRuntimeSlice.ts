import { createAppSlice } from "@/app/createAppSlice";
import {
  activeThreadReadModelSlotCreated,
  activeThreadReadModelSlotRemoved,
  activeThreadReadModelTransitionApplied,
} from "@/features/activeThreadSession/activeThreadSessionReadModel";
import type { ActiveThreadSessionIdentity } from "@/features/activeThreadSession/activeThreadSessionIdentity";
import type { ActiveThreadProjectionReadModelFact } from "@/features/activeThreadSession/activeThreadProjectionFacts";
import type { Thread, ThreadTokenUsage } from "@codex-protocol/v2";

export type ThreadRuntimeRecord = {
  sessionRevision: number;
  threadId: string;
  thread: Omit<Thread, "turns" | "status">;
  tokenUsage: ThreadTokenUsage | null;
};

export type ThreadRuntimeSlot = {
  identity: ActiveThreadSessionIdentity;
  sessionRevision: number;
  current: ThreadRuntimeRecord | null;
};

export type ThreadRuntimeState = {
  byThreadId: Record<string, ThreadRuntimeSlot>;
};

const initialState: ThreadRuntimeState = {
  byThreadId: {},
};

const threadMetadata = ({
  turns: _turns,
  status: _status,
  ...thread
}: Thread): Omit<Thread, "turns" | "status"> => thread;

const applyRuntimeFact = (
  state: ThreadRuntimeSlot,
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
    builder.addCase(activeThreadReadModelSlotCreated, (state, { payload: identity }) => {
      state.byThreadId[identity.threadId] ??= { identity, sessionRevision: 0, current: null };
    });
    builder.addCase(activeThreadReadModelSlotRemoved, (state, { payload: identity }) => {
      if (state.byThreadId[identity.threadId]?.identity.instanceId === identity.instanceId) {
        const { [identity.threadId]: _removed, ...byThreadId } = state.byThreadId;
        return { byThreadId };
      }
    });
    builder.addCase(activeThreadReadModelTransitionApplied, (state, action) => {
      const { identity, facts, sessionRevision } = action.payload;
      const slot = state.byThreadId[identity.threadId];
      if (
        slot?.identity.instanceId !== identity.instanceId ||
        sessionRevision <= slot.sessionRevision
      ) {
        return;
      }

      for (const fact of facts) {
        applyRuntimeFact(slot, sessionRevision, fact);
      }
      slot.sessionRevision = sessionRevision;
      if (slot.current != null) {
        slot.current.sessionRevision = sessionRevision;
      }
    });
  },
  selectors: {
    selectThreadRuntimeRecord: (threadRuntime, threadId: string) =>
      threadRuntime.byThreadId[threadId]?.current ?? null,
    selectThreadRuntimeThreadId: (threadRuntime, threadId: string) =>
      threadRuntime.byThreadId[threadId]?.current?.threadId ?? null,
    selectThreadRuntimeTokenUsage: (threadRuntime, threadId: string): ThreadTokenUsage | null =>
      threadRuntime.byThreadId[threadId]?.current?.tokenUsage ?? null,
  },
});

export const {
  selectThreadRuntimeRecord,
  selectThreadRuntimeThreadId,
  selectThreadRuntimeTokenUsage,
} = threadRuntimeSlice.selectors;

export default threadRuntimeSlice;
