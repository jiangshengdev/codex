import type { PayloadAction } from "@reduxjs/toolkit";
import { createAppSlice } from "@/app/createAppSlice";
import type { Thread } from "@codex-protocol/v2";

export type ThreadRecord = Omit<Thread, "turns">;

export type ThreadRootState = {
  primaryThreadId: string | null;
  activeThreadId: string | null;
  threadsById: Record<string, ThreadRecord>;
  parentThreadIdByThreadId: Record<string, string | null>;
  childThreadIdsByParentId: Record<string, string[]>;
};

type LaunchPrimaryThreadPayload = {
  threadId: string;
};

const initialState: ThreadRootState = {
  primaryThreadId: null,
  activeThreadId: null,
  threadsById: {},
  parentThreadIdByThreadId: {},
  childThreadIdsByParentId: {},
};

export const toThreadRecord = (thread: Thread): ThreadRecord => {
  const record = { ...thread };
  delete (record as Partial<Thread>).turns;

  return {
    ...record,
    parentThreadId: thread.parentThreadId ?? null,
  };
};

export const threadRootSlice = createAppSlice({
  name: "threadRoot",
  initialState,
  reducers: (create) => ({
    launchPrimaryThread: create.reducer(
      (state, action: PayloadAction<LaunchPrimaryThreadPayload>) => {
        state.primaryThreadId = action.payload.threadId;
        state.activeThreadId = action.payload.threadId;
      },
    ),
    threadMetadataAttached: create.reducer((state, action: PayloadAction<Thread>) => {
      const record = toThreadRecord(action.payload);
      const threadId = record.id;
      const parentThreadId = record.parentThreadId;
      const previousParentThreadId = state.parentThreadIdByThreadId[threadId] ?? null;

      state.threadsById[threadId] = record;
      state.parentThreadIdByThreadId[threadId] = parentThreadId;

      if (previousParentThreadId !== parentThreadId && previousParentThreadId != null) {
        const previousChildren = state.childThreadIdsByParentId[previousParentThreadId];
        if (previousChildren != null) {
          state.childThreadIdsByParentId[previousParentThreadId] = previousChildren.filter(
            (childThreadId) => childThreadId !== threadId,
          );
        }
      }

      if (parentThreadId != null) {
        const children = state.childThreadIdsByParentId[parentThreadId];
        if (children == null) {
          state.childThreadIdsByParentId[parentThreadId] = [threadId];
        } else if (!children.includes(threadId)) {
          children.push(threadId);
        }
      }
    }),
  }),
  selectors: {
    selectPrimaryThreadId: (threadRoot) => threadRoot.primaryThreadId,
    selectActiveThreadId: (threadRoot) => threadRoot.activeThreadId,
    selectThreadById: (threadRoot, threadId: string) => threadRoot.threadsById[threadId] ?? null,
    selectParentThreadId: (threadRoot, threadId: string) =>
      threadRoot.parentThreadIdByThreadId[threadId] ?? null,
    selectChildThreadIds: (threadRoot, parentThreadId: string) =>
      threadRoot.childThreadIdsByParentId[parentThreadId] ?? [],
  },
});

export const { launchPrimaryThread, threadMetadataAttached } = threadRootSlice.actions;

export const {
  selectPrimaryThreadId,
  selectActiveThreadId,
  selectThreadById,
  selectParentThreadId,
  selectChildThreadIds,
} = threadRootSlice.selectors;

export default threadRootSlice;
