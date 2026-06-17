import { createAppSlice } from "@/app/createAppSlice";
import type { ProjectionManualReconnectReason } from "@/features/projectionIngress/projectionIngressAdapter";
import {
  threadRuntimeAttached,
  threadRuntimeEventBuffered,
  threadRuntimeManualReconnectRequired,
} from "@/features/threadRuntime/threadRuntimeSlice";
import type { ThreadItem, Turn, TurnStatus, UserInput } from "@codex-protocol/v2";

export type IncrementalChatMessage = {
  id: string;
  turnId: string;
  role: "user" | "assistant";
  text: string;
};

export type IncrementalChatTurn = {
  id: string;
  status: TurnStatus;
};

export type IncrementalChatGlobalStatus = {
  id: string;
  status: "subscriptionInterrupted";
  reason: ProjectionManualReconnectReason;
  subscriptionId: string | null;
};

export type IncrementalChatTurnView = {
  id: string;
  status: TurnStatus;
  messages: IncrementalChatMessage[];
};

export type IncrementalChatState = {
  threadId: string | null;
  subscriptionId: string | null;
  turnsById: Record<string, IncrementalChatTurn>;
  turnOrder: string[];
  messagesById: Record<string, IncrementalChatMessage>;
  messagesByTurnId: Record<string, string[]>;
  turnViews: IncrementalChatTurnView[];
  turnViewIndexById: Record<string, number>;
  messageViewIndexById: Record<string, { turnId: string; index: number }>;
  globalStatus: IncrementalChatGlobalStatus[];
  appliedEventIdsById: Record<string, true>;
  appliedEventOrder: string[];
};

const MAX_APPLIED_EVENT_ID_WINDOW_LENGTH = 500;

const initialState: IncrementalChatState = {
  threadId: null,
  subscriptionId: null,
  turnsById: {},
  turnOrder: [],
  messagesById: {},
  messagesByTurnId: {},
  turnViews: [],
  turnViewIndexById: {},
  messageViewIndexById: {},
  globalStatus: [],
  appliedEventIdsById: {},
  appliedEventOrder: [],
};

const createEmptyState = (): IncrementalChatState => ({
  threadId: null,
  subscriptionId: null,
  turnsById: {},
  turnOrder: [],
  messagesById: {},
  messagesByTurnId: {},
  turnViews: [],
  turnViewIndexById: {},
  messageViewIndexById: {},
  globalStatus: [],
  appliedEventIdsById: {},
  appliedEventOrder: [],
});

const resetState = (state: IncrementalChatState, nextState: IncrementalChatState) => {
  state.threadId = nextState.threadId;
  state.subscriptionId = nextState.subscriptionId;
  state.turnsById = nextState.turnsById;
  state.turnOrder = nextState.turnOrder;
  state.messagesById = nextState.messagesById;
  state.messagesByTurnId = nextState.messagesByTurnId;
  state.turnViews = nextState.turnViews;
  state.turnViewIndexById = nextState.turnViewIndexById;
  state.messageViewIndexById = nextState.messageViewIndexById;
  state.globalStatus = nextState.globalStatus;
  state.appliedEventIdsById = nextState.appliedEventIdsById;
  state.appliedEventOrder = nextState.appliedEventOrder;
};

const hasAppliedEvent = (state: IncrementalChatState, commitId: string): boolean =>
  state.appliedEventIdsById[commitId] === true;

const recordAppliedEvent = (state: IncrementalChatState, commitId: string) => {
  state.appliedEventIdsById[commitId] = true;
  state.appliedEventOrder.push(commitId);

  if (state.appliedEventOrder.length <= MAX_APPLIED_EVENT_ID_WINDOW_LENGTH) {
    return;
  }

  const removedCommitId = state.appliedEventOrder.shift();
  if (removedCommitId != null) {
    Reflect.deleteProperty(state.appliedEventIdsById, removedCommitId);
  }
};

const syncTurnView = (state: IncrementalChatState, turn: IncrementalChatTurn) => {
  const existingIndex = state.turnViewIndexById[turn.id];
  if (existingIndex != null) {
    const existingView = state.turnViews[existingIndex];
    if (existingView != null && existingView.status !== turn.status) {
      state.turnViews[existingIndex] = {
        ...existingView,
        status: turn.status,
      };
    }
    return;
  }

  state.turnViewIndexById[turn.id] = state.turnViews.length;
  state.turnViews.push({
    id: turn.id,
    status: turn.status,
    messages: [],
  });
};

const ensureTurnExists = (state: IncrementalChatState, turnId: string): IncrementalChatTurn => {
  const existingTurn = state.turnsById[turnId];
  if (existingTurn != null) {
    syncTurnView(state, existingTurn);
    return existingTurn;
  }

  const turn: IncrementalChatTurn = {
    id: turnId,
    status: "inProgress",
  };
  state.turnsById[turnId] = turn;
  state.turnOrder.push(turnId);
  syncTurnView(state, turn);
  return turn;
};

const upsertTurnFromPayload = (state: IncrementalChatState, turn: Turn) => {
  const existingTurn = state.turnsById[turn.id];
  if (existingTurn == null) {
    const nextTurn: IncrementalChatTurn = {
      id: turn.id,
      status: turn.status,
    };
    state.turnsById[turn.id] = nextTurn;
    state.turnOrder.push(turn.id);
    syncTurnView(state, nextTurn);
    return;
  }

  existingTurn.status = turn.status;
  syncTurnView(state, existingTurn);
};

const removeMessageFromTurnView = (
  state: IncrementalChatState,
  messageId: string,
  turnId: string,
) => {
  const turnViewIndex = state.turnViewIndexById[turnId];
  if (turnViewIndex == null) {
    return;
  }

  const turnView = state.turnViews[turnViewIndex];
  if (turnView == null) {
    return;
  }

  const messageViewIndex = state.messageViewIndexById[messageId];
  if (messageViewIndex?.turnId !== turnId) {
    return;
  }

  const messages = turnView.messages.filter((message) => message.id !== messageId);
  state.turnViews[turnViewIndex] = {
    ...turnView,
    messages,
  };

  const remainingMessageViewIndexById = { ...state.messageViewIndexById };
  Reflect.deleteProperty(remainingMessageViewIndexById, messageId);
  state.messageViewIndexById = remainingMessageViewIndexById;

  for (const [index, message] of messages.entries()) {
    state.messageViewIndexById[message.id] = {
      turnId,
      index,
    };
  }
};

const upsertMessageIntoTurnView = (
  state: IncrementalChatState,
  message: IncrementalChatMessage,
) => {
  ensureTurnExists(state, message.turnId);

  const turnViewIndex = state.turnViewIndexById[message.turnId];
  if (turnViewIndex == null) {
    return;
  }

  const turnView = state.turnViews[turnViewIndex];
  if (turnView == null) {
    return;
  }

  const existingMessageIndex = state.messageViewIndexById[message.id];
  if (existingMessageIndex?.turnId === message.turnId) {
    const messages = [...turnView.messages];
    messages[existingMessageIndex.index] = message;
    state.turnViews[turnViewIndex] = {
      ...turnView,
      messages,
    };
    return;
  }

  if (existingMessageIndex != null) {
    removeMessageFromTurnView(state, message.id, existingMessageIndex.turnId);
  }

  const messages = [...turnView.messages, message];
  state.turnViews[turnViewIndex] = {
    ...turnView,
    messages,
  };
  state.messageViewIndexById[message.id] = {
    turnId: message.turnId,
    index: messages.length - 1,
  };
};

const upsertMessage = (state: IncrementalChatState, message: IncrementalChatMessage) => {
  const existingMessage = state.messagesById[message.id];
  if (existingMessage != null && existingMessage.turnId !== message.turnId) {
    const previousTurnMessages = state.messagesByTurnId[existingMessage.turnId];
    if (previousTurnMessages != null) {
      state.messagesByTurnId[existingMessage.turnId] = previousTurnMessages.filter(
        (messageId) => messageId !== message.id,
      );
    }
  }

  state.messagesById[message.id] = message;

  const turnMessages = state.messagesByTurnId[message.turnId] ?? [];
  if (!turnMessages.includes(message.id)) {
    turnMessages.push(message.id);
  }
  state.messagesByTurnId[message.turnId] = turnMessages;
  upsertMessageIntoTurnView(state, message);
};

const materializeItem = (item: ThreadItem, turnId: string): IncrementalChatMessage | null => {
  switch (item.type) {
    case "userMessage": {
      const text = item.content.map(textFromUserInput).join("");
      if (text.length === 0) {
        return null;
      }

      return {
        id: item.id,
        turnId,
        role: "user",
        text,
      };
    }
    case "agentMessage":
      if (item.text.length === 0) {
        return null;
      }

      return {
        id: item.id,
        turnId,
        role: "assistant",
        text: item.text,
      };
    case "hookPrompt":
    case "plan":
    case "reasoning":
    case "commandExecution":
    case "fileChange":
    case "mcpToolCall":
    case "dynamicToolCall":
    case "collabAgentToolCall":
    case "subAgentActivity":
    case "webSearch":
    case "imageView":
    case "imageGeneration":
    case "enteredReviewMode":
    case "exitedReviewMode":
    case "contextCompaction":
      return null;
  }

  const exhaustiveItem: never = item;
  return exhaustiveItem;
};

const textFromUserInput = (input: UserInput): string => {
  switch (input.type) {
    case "text":
      return input.text;
    case "image":
    case "localImage":
    case "skill":
    case "mention":
      return "";
  }

  const exhaustiveInput: never = input;
  return exhaustiveInput;
};

const rebuildFromSnapshot = (
  state: IncrementalChatState,
  threadId: string,
  subscriptionId: string,
  turns: Turn[],
) => {
  const nextState = createEmptyState();
  nextState.threadId = threadId;
  nextState.subscriptionId = subscriptionId;

  for (const turn of turns) {
    upsertTurnFromPayload(nextState, turn);
    for (const item of turn.items) {
      const message = materializeItem(item, turn.id);
      if (message != null) {
        upsertMessage(nextState, message);
      }
    }
  }

  resetState(state, nextState);
};

export const incrementalChatStateSlice = createAppSlice({
  name: "incrementalChatState",
  initialState,
  reducers: () => ({}),
  selectors: {
    selectIncrementalChatTurns: (incrementalChatState): IncrementalChatTurnView[] =>
      incrementalChatState.turnViews,
    selectIncrementalChatGlobalStatus: (incrementalChatState) => incrementalChatState.globalStatus,
    selectIncrementalChatIsInterrupted: (incrementalChatState) =>
      incrementalChatState.globalStatus.length > 0,
  },
  extraReducers: (builder) => {
    builder
      .addCase(threadRuntimeAttached, (state, action) => {
        rebuildFromSnapshot(
          state,
          action.payload.snapshot.thread.id,
          action.payload.subscriptionId,
          action.payload.snapshot.thread.turns,
        );
      })
      .addCase(threadRuntimeEventBuffered, (state, action) => {
        if (state.threadId !== action.payload.threadId) {
          return;
        }

        if (hasAppliedEvent(state, action.payload.commitId)) {
          return;
        }

        recordAppliedEvent(state, action.payload.commitId);

        switch (action.payload.event.type) {
          case "turnStarted":
          case "turnCompleted":
            upsertTurnFromPayload(state, action.payload.event.notification.turn);
            return;
          case "itemCompleted": {
            const { item, turnId } = action.payload.event.notification;
            ensureTurnExists(state, turnId);
            const message = materializeItem(item, turnId);
            if (message != null) {
              upsertMessage(state, message);
            }
            return;
          }
          case "itemStarted":
            return;
        }
      })
      .addCase(threadRuntimeManualReconnectRequired, (state, action) => {
        if (state.threadId !== action.payload.threadId) {
          return;
        }

        state.globalStatus = [
          {
            id: `subscriptionInterrupted:${action.payload.threadId}:${action.payload.subscriptionId ?? "none"}:${action.payload.reason}`,
            status: "subscriptionInterrupted",
            reason: action.payload.reason,
            subscriptionId: action.payload.subscriptionId,
          },
        ];
      });
  },
});

export const {
  selectIncrementalChatGlobalStatus,
  selectIncrementalChatIsInterrupted,
  selectIncrementalChatTurns,
} = incrementalChatStateSlice.selectors;

export default incrementalChatStateSlice;
