import type { PayloadAction } from "@reduxjs/toolkit";
import { createAppSlice } from "@/app/createAppSlice";
import type {
  Thread,
  ThreadItem,
  ThreadProjectionAttachResponse,
  ThreadProjectionEvent,
  ThreadProjectionEventNotification,
  Turn,
} from "@codex-protocol/v2";

export type ReattachRequest = {
  reason: "commitChainMismatch" | "missingTurn";
};

export type ThreadProjection = {
  subscriptionId: string;
  thread: Thread;
  headCommitId: string | null;
  reattach: ReattachRequest | null;
};

export type ProjectionSliceState = {
  projectionsByThreadId: Record<string, ThreadProjection>;
};

const initialState: ProjectionSliceState = {
  projectionsByThreadId: {},
};

const markReattach = (projection: ThreadProjection, reason: ReattachRequest["reason"]) => {
  projection.reattach = { reason };
};

const replaceOrAppendTurn = (turns: Turn[], turn: Turn) => {
  const existingIndex = turns.findIndex((candidate) => candidate.id === turn.id);

  if (existingIndex === -1) {
    turns.push(turn);
    return;
  }

  turns[existingIndex] = turn;
};

const findTurn = (projection: ThreadProjection, turnId: string) =>
  projection.thread.turns.find((turn) => turn.id === turnId);

const replaceOrAppendItem = (turn: Turn, item: ThreadItem) => {
  const existingIndex = turn.items.findIndex((candidate) => candidate.id === item.id);

  if (existingIndex === -1) {
    turn.items.push(item);
    return;
  }

  turn.items[existingIndex] = item;
};

const applyItemEvent = (
  projection: ThreadProjection,
  turnId: string,
  item: ThreadItem,
): boolean => {
  const turn = findTurn(projection, turnId);
  if (turn == null) {
    markReattach(projection, "missingTurn");
    return false;
  }

  replaceOrAppendItem(turn, item);
  return true;
};

const applyProjectionEvent = (
  projection: ThreadProjection,
  event: ThreadProjectionEvent,
): boolean => {
  switch (event.type) {
    case "turnStarted":
      replaceOrAppendTurn(projection.thread.turns, event.notification.turn);
      return true;
    case "itemStarted":
      return applyItemEvent(projection, event.notification.turnId, event.notification.item);
    case "itemCompleted":
      return applyItemEvent(projection, event.notification.turnId, event.notification.item);
    case "turnCompleted":
      replaceOrAppendTurn(projection.thread.turns, event.notification.turn);
      return true;
  }
};

export const projectionSlice = createAppSlice({
  name: "projection",
  initialState,
  reducers: (create) => ({
    projectionAttached: create.reducer(
      (state, action: PayloadAction<ThreadProjectionAttachResponse>) => {
        const response = action.payload;
        const thread = response.snapshot.thread;

        state.projectionsByThreadId[thread.id] = {
          subscriptionId: response.subscriptionId,
          thread,
          headCommitId: response.snapshot.headCommitId,
          reattach: null,
        };
      },
    ),
    projectionEventReceived: create.reducer(
      (state, action: PayloadAction<ThreadProjectionEventNotification>) => {
        const event = action.payload;
        const projection = state.projectionsByThreadId[event.threadId];

        if (projection == null || projection.reattach != null) {
          return;
        }

        if (event.subscriptionId !== projection.subscriptionId) {
          return;
        }

        if (event.commitId === projection.headCommitId) {
          return;
        }

        if (event.parentCommitId !== projection.headCommitId) {
          markReattach(projection, "commitChainMismatch");
          return;
        }

        if (applyProjectionEvent(projection, event.event)) {
          projection.headCommitId = event.commitId;
        }
      },
    ),
  }),
  selectors: {
    selectProjectionByThreadId: (projection, threadId: string) =>
      projection.projectionsByThreadId[threadId] ?? null,
    selectProjectionReattachByThreadId: (projection, threadId: string) =>
      projection.projectionsByThreadId[threadId]?.reattach ?? null,
  },
});

export const { projectionAttached, projectionEventReceived } = projectionSlice.actions;

export const { selectProjectionByThreadId, selectProjectionReattachByThreadId } =
  projectionSlice.selectors;

export default projectionSlice;
