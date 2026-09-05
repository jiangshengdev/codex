import { createAppSlice } from "@/app/createAppSlice";
import { activeThreadReadModelTransitionApplied } from "@/features/activeThreadSession/activeThreadSessionReadModel";
import type { ActiveThreadProjectionReadModelFact } from "@/features/activeThreadSession/activeThreadProjectionFacts";
import type { Thread, ThreadTokenUsage } from "@codex-protocol/v2";

export type ThreadRuntimeRecord = {
  sessionRevision: number;
  threadId: string;
  thread: Omit<Thread, "turns" | "status">;
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

const threadMetadata = ({
  turns: _turns,
  status: _status,
  ...thread
}: Thread): Omit<Thread, "turns" | "status"> => thread;

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
