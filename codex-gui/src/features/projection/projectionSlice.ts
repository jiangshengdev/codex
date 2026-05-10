import type { PayloadAction } from "@reduxjs/toolkit";
import { createAppSlice } from "@/app/createAppSlice";
import type { ServerRequest } from "@codex-protocol";
import type {
  ProjectionEventPayload,
  ProjectionEventNotification,
  Thread,
  ThreadItem,
  ThreadProjectionAttachResponse,
  ThreadStatus,
  Turn,
} from "@codex-protocol/v2";

export type ReattachRequest = {
  reason: "sequenceGap" | "projectionInstanceMismatch" | "projectionReset" | "missingTurn";
};

export type ThreadProjection = {
  thread: Thread;
  pendingRequests: ServerRequest[];
  runtimeStatus: ThreadStatus;
  projectionInstanceId: string;
  latestSequence: string;
  reattach: ReattachRequest | null;
};

export type ProjectionSliceState = {
  projectionsByThreadId: Record<string, ThreadProjection>;
};

export type ProjectionAttachedPayload = {
  threadId: string;
  snapshot: ThreadProjectionAttachResponse;
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

const applyProjectionPayload = (
  projection: ThreadProjection,
  payload: ProjectionEventPayload,
): boolean => {
  switch (payload.type) {
    case "turnStarted":
      replaceOrAppendTurn(projection.thread.turns, payload.turn);
      return true;
    case "itemStarted": {
      const turn = findTurn(projection, payload.turnId);
      if (turn == null) {
        markReattach(projection, "missingTurn");
        return false;
      }

      replaceOrAppendItem(turn, payload.item);
      return true;
    }
    case "itemCompleted": {
      const turn = findTurn(projection, payload.turnId);
      if (turn == null) {
        markReattach(projection, "missingTurn");
        return false;
      }

      replaceOrAppendItem(turn, payload.item);
      return true;
    }
    case "turnCompleted": {
      const turn = findTurn(projection, payload.turnId);
      if (turn == null) {
        markReattach(projection, "missingTurn");
        return false;
      }

      turn.status = payload.status;
      return true;
    }
    case "threadMetadataUpdated":
      projection.thread.name = payload.name;
      return true;
    case "projectionReset":
      markReattach(projection, "projectionReset");
      return true;
  }
};

export const projectionSlice = createAppSlice({
  name: "projection",
  initialState,
  reducers: (create) => ({
    projectionAttached: create.reducer(
      (state, action: PayloadAction<ProjectionAttachedPayload>) => {
        const { threadId, snapshot } = action.payload;

        state.projectionsByThreadId[threadId] = {
          ...snapshot,
          reattach: null,
        };
      },
    ),
    projectionEventReceived: create.reducer(
      (state, action: PayloadAction<ProjectionEventNotification>) => {
        const event = action.payload;
        const projection = state.projectionsByThreadId[event.threadId];

        if (projection == null || projection.reattach != null) {
          return;
        }

        if (projection.projectionInstanceId !== event.projectionInstanceId) {
          projection.reattach = { reason: "projectionInstanceMismatch" };
          return;
        }

        const expectedSequence = BigInt(projection.latestSequence) + 1n;
        const actualSequence = BigInt(event.sequence);

        if (actualSequence < expectedSequence) {
          return;
        }

        if (actualSequence > expectedSequence) {
          projection.reattach = { reason: "sequenceGap" };
          return;
        }

        if (applyProjectionPayload(projection, event.payload)) {
          projection.latestSequence = event.sequence;
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
