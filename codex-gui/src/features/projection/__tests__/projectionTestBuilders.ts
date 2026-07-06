import type {
  ThreadItem,
  ThreadProjectionAttachResponse,
  ThreadProjectionDeltaNotification,
  ThreadProjectionEventNotification,
  Turn,
  UserInput,
} from "@codex-protocol/v2";
import {
  snapshotReplayIndexFromTurns,
  type ThreadRuntimeRecord,
} from "@/features/threadRuntime/threadRuntimeSlice";

export const textInput = (text: string): UserInput => ({
  type: "text",
  text,
  text_elements: [],
});

export const imageInput = (url: string): UserInput => ({
  type: "image",
  url,
});

export const userMessage = (id: string, content: UserInput[]): ThreadItem => ({
  type: "userMessage",
  id,
  clientId: null,
  content,
});

type AgentMessagePhase = Extract<ThreadItem, { type: "agentMessage" }>["phase"];

export const agentMessage = (
  id: string,
  text: string,
  phase: AgentMessagePhase = "final_answer",
): ThreadItem => ({
  type: "agentMessage",
  id,
  text,
  phase,
  memoryCitation: null,
});

export const planItem = (id: string): ThreadItem => ({
  type: "plan",
  id,
  text: "Hidden plan text",
});

export const sleepItem = (id: string): ThreadItem => ({
  type: "sleep",
  id,
  durationMs: 1000,
});

export const baseTurn = (id: string, items: ThreadItem[] = []): Turn => ({
  id,
  items,
  itemsView: "full",
  status: "completed",
  error: null,
  startedAt: 1700000001,
  completedAt: 1700000005,
  durationMs: 4000,
});

export const inProgressTurn = (id: string, items: ThreadItem[] = []): Turn => ({
  ...baseTurn(id, items),
  status: "inProgress",
  completedAt: null,
  durationMs: null,
});

export const attachWithTurns = (
  attachBaseline: ThreadProjectionAttachResponse,
  turns: Turn[],
): ThreadProjectionAttachResponse => ({
  ...attachBaseline,
  snapshot: {
    ...attachBaseline.snapshot,
    thread: {
      ...attachBaseline.snapshot.thread,
      turns,
    },
  },
});

export const runtimeFromAttach = (attach: ThreadProjectionAttachResponse): ThreadRuntimeRecord => {
  const { turns: snapshotTurns, ...thread } = attach.snapshot.thread;

  return {
    threadId: thread.id,
    sessionId: thread.sessionId,
    thread,
    snapshotTurns,
    snapshotReplayIndex: snapshotReplayIndexFromTurns(snapshotTurns),
    eventBuffer: [],
    activeTurnId:
      snapshotTurns.toReversed().find((turn) => turn.status === "inProgress")?.id ?? null,
    subscription: { state: "active" },
  };
};

export const agentMessageDelta = (
  eventAgentMessageDelta: ThreadProjectionDeltaNotification,
  turnId: string,
  itemId: string,
  delta: string,
): ThreadProjectionDeltaNotification => {
  if (eventAgentMessageDelta.delta.type !== "agentMessage") {
    throw new Error("fixture must contain an agentMessage projection delta");
  }

  return {
    ...eventAgentMessageDelta,
    delta: {
      ...eventAgentMessageDelta.delta,
      notification: {
        ...eventAgentMessageDelta.delta.notification,
        turnId,
        itemId,
        delta,
      },
    },
  };
};

export const itemCompleted = (
  eventItemCompleted: ThreadProjectionEventNotification,
  commitId: string,
  turnId: string,
  item: ThreadItem,
): ThreadProjectionEventNotification => {
  if (eventItemCompleted.event.type !== "itemCompleted") {
    throw new Error("fixture must contain an itemCompleted projection event");
  }

  return {
    ...eventItemCompleted,
    commitId,
    event: {
      ...eventItemCompleted.event,
      notification: {
        ...eventItemCompleted.event.notification,
        turnId,
        item,
      },
    },
  };
};

export const itemStarted = (
  eventItemStarted: ThreadProjectionEventNotification,
  commitId: string,
  turnId: string,
  item: ThreadItem,
): ThreadProjectionEventNotification => {
  if (eventItemStarted.event.type !== "itemStarted") {
    throw new Error("fixture must contain an itemStarted projection event");
  }

  return {
    ...eventItemStarted,
    commitId,
    event: {
      ...eventItemStarted.event,
      notification: {
        ...eventItemStarted.event.notification,
        turnId,
        item,
      },
    },
  };
};

export const turnStarted = (
  eventTurnStarted: ThreadProjectionEventNotification,
  commitId: string,
  turn: Turn,
): ThreadProjectionEventNotification => {
  if (eventTurnStarted.event.type !== "turnStarted") {
    throw new Error("fixture must contain a turnStarted projection event");
  }

  return {
    ...eventTurnStarted,
    commitId,
    event: {
      ...eventTurnStarted.event,
      notification: {
        ...eventTurnStarted.event.notification,
        turn,
      },
    },
  };
};

export const turnCompleted = (
  eventTurnCompleted: ThreadProjectionEventNotification,
  commitId: string,
  turn: Turn,
): ThreadProjectionEventNotification => {
  if (eventTurnCompleted.event.type !== "turnCompleted") {
    throw new Error("fixture must contain a turnCompleted projection event");
  }

  return {
    ...eventTurnCompleted,
    commitId,
    event: {
      ...eventTurnCompleted.event,
      notification: {
        ...eventTurnCompleted.event.notification,
        turn,
      },
    },
  };
};
