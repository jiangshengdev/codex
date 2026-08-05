import type { ThreadRuntimeLiveTurnCompletion } from "@/features/threadRuntime/threadRuntimeSlice";

export const COMPOSER_MESSAGE_QUEUE_CAPACITY = 20;

export type QueuedComposerMessage = {
  readonly id: string;
  readonly text: string;
};

export type ComposerMessageQueueMode = "running" | "paused";

export type ComposerMessageQueueUndo =
  | { readonly type: "delete"; readonly item: QueuedComposerMessage; readonly index: number }
  | { readonly type: "clear"; readonly items: readonly QueuedComposerMessage[] };

export type ComposerMessageQueueState = {
  readonly items: readonly QueuedComposerMessage[];
  readonly mode: ComposerMessageQueueMode;
  readonly waitingTurnId: string | null;
  readonly startingItemId: string | null;
  readonly lastConsumedCompletionCommitId: string | null;
  readonly undo: ComposerMessageQueueUndo | null;
};

export type ComposerMessageQueueAction =
  | {
      readonly type: "pushBack";
      readonly item: QueuedComposerMessage;
      readonly waitingTurnId: string;
    }
  | {
      readonly type: "pushFrontAfterGuideRejection";
      readonly item: QueuedComposerMessage;
      readonly waitingTurnId: string | null;
    }
  | { readonly type: "beginQueuedStart" }
  | { readonly type: "queuedStartSucceeded"; readonly itemId: string; readonly turnId: string }
  | { readonly type: "queuedStartFailed"; readonly itemId: string }
  | { readonly type: "consumeCompletion"; readonly completion: ThreadRuntimeLiveTurnCompletion }
  | { readonly type: "pause" }
  | { readonly type: "continue"; readonly waitingTurnId: string | null }
  | { readonly type: "connectionUnavailable" }
  | { readonly type: "edit"; readonly itemId: string; readonly text: string }
  | { readonly type: "delete"; readonly itemId: string }
  | { readonly type: "clear" }
  | { readonly type: "undo" };

export const initialComposerMessageQueueState: ComposerMessageQueueState = {
  items: [],
  mode: "running",
  waitingTurnId: null,
  startingItemId: null,
  lastConsumedCompletionCommitId: null,
  undo: null,
};

export const isComposerMessageQueueFull = (state: ComposerMessageQueueState): boolean =>
  state.items.length >= COMPOSER_MESSAGE_QUEUE_CAPACITY;

export const selectQueuedStartCandidate = (
  state: ComposerMessageQueueState,
): QueuedComposerMessage | null =>
  state.mode === "running" && state.waitingTurnId == null && state.startingItemId == null
    ? (state.items[0] ?? null)
    : null;

function invariant(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Composer message queue invariant failed: ${message}`);
  }
}

const push = (
  state: ComposerMessageQueueState,
  item: QueuedComposerMessage,
  waitingTurnId: string | null,
  placement: "front" | "back",
): ComposerMessageQueueState => {
  if (
    state.startingItemId != null ||
    isComposerMessageQueueFull(state) ||
    item.text.trim() === ""
  ) {
    return state;
  }
  invariant(!state.items.some((queued) => queued.id === item.id), `duplicate item id ${item.id}`);
  return {
    ...state,
    items: placement === "front" ? [item, ...state.items] : [...state.items, item],
    mode: state.items.length === 0 ? "running" : state.mode,
    waitingTurnId,
    undo: null,
  };
};

const pushGuideRejection = (
  state: ComposerMessageQueueState,
  item: QueuedComposerMessage,
  waitingTurnId: string | null,
): ComposerMessageQueueState => {
  if (state.startingItemId == null) {
    return push(state, item, waitingTurnId, "front");
  }
  if (isComposerMessageQueueFull(state) || item.text.trim() === "") {
    return state;
  }
  invariant(state.items[0]?.id === state.startingItemId, "starting item is not the head");
  invariant(!state.items.some((queued) => queued.id === item.id), `duplicate item id ${item.id}`);
  return {
    ...state,
    items: [state.items[0], item, ...state.items.slice(1)],
    undo: null,
  };
};

const consumeCompletion = (
  state: ComposerMessageQueueState,
  completion: ThreadRuntimeLiveTurnCompletion,
): ComposerMessageQueueState => {
  if (
    completion.turnId !== state.waitingTurnId ||
    completion.commitId === state.lastConsumedCompletionCommitId
  ) {
    return state;
  }
  const consumed = {
    ...state,
    waitingTurnId: null,
    lastConsumedCompletionCommitId: completion.commitId,
  };
  switch (completion.status) {
    case "completed":
      return consumed;
    case "interrupted":
    case "failed":
      return { ...consumed, mode: "paused" };
  }
  completion.status satisfies never;
};

const restoreUndo = (state: ComposerMessageQueueState): ComposerMessageQueueState => {
  if (state.undo == null) {
    return state;
  }
  const restored =
    state.undo.type === "clear"
      ? state.undo.items
      : [
          ...state.items.slice(0, state.undo.index),
          state.undo.item,
          ...state.items.slice(state.undo.index),
        ];
  invariant(restored.length <= COMPOSER_MESSAGE_QUEUE_CAPACITY, "undo exceeds capacity");
  invariant(
    new Set(restored.map((item) => item.id)).size === restored.length,
    "undo duplicates item id",
  );
  return { ...state, items: restored, undo: null };
};

export function composerMessageQueueReducer(
  state: ComposerMessageQueueState,
  action: ComposerMessageQueueAction,
): ComposerMessageQueueState {
  switch (action.type) {
    case "pushBack":
      return push(state, action.item, action.waitingTurnId, "back");
    case "pushFrontAfterGuideRejection":
      return pushGuideRejection(state, action.item, action.waitingTurnId);
    case "beginQueuedStart": {
      const candidate = selectQueuedStartCandidate(state);
      return candidate == null ? state : { ...state, startingItemId: candidate.id };
    }
    case "queuedStartSucceeded": {
      if (action.itemId !== state.startingItemId) {
        return state;
      }
      invariant(
        state.items[0]?.id === action.itemId,
        `starting item ${action.itemId} is not the head`,
      );
      return {
        ...state,
        items: state.items.slice(1),
        waitingTurnId: action.turnId,
        startingItemId: null,
        undo: null,
      };
    }
    case "queuedStartFailed":
      return action.itemId === state.startingItemId
        ? { ...state, mode: "paused", startingItemId: null }
        : state;
    case "consumeCompletion":
      return consumeCompletion(state, action.completion);
    case "pause":
    case "connectionUnavailable":
      return state.mode === "paused" ? state : { ...state, mode: "paused" };
    case "continue":
      return state.startingItemId != null
        ? state
        : {
            ...state,
            mode: "running",
            waitingTurnId: state.items.length === 0 ? null : action.waitingTurnId,
          };
    case "edit": {
      const itemIndex = state.items.findIndex((item) => item.id === action.itemId);
      if (
        itemIndex < 0 ||
        action.itemId === state.startingItemId ||
        action.text.trim() === "" ||
        state.items[itemIndex]?.text === action.text
      ) {
        return state;
      }
      return {
        ...state,
        items: state.items.with(itemIndex, { id: action.itemId, text: action.text }),
      };
    }
    case "delete": {
      const itemIndex = state.items.findIndex((item) => item.id === action.itemId);
      if (itemIndex < 0 || action.itemId === state.startingItemId) {
        return state;
      }
      const item = state.items[itemIndex];
      invariant(item != null, `item ${action.itemId} is missing`);
      const items = state.items.toSpliced(itemIndex, 1);
      return {
        ...state,
        items,
        undo: { type: "delete", item, index: itemIndex },
      };
    }
    case "clear":
      return state.items.length === 0 || state.startingItemId != null
        ? state
        : {
            ...state,
            items: [],
            undo: { type: "clear", items: state.items },
          };
    case "undo":
      return state.startingItemId == null ? restoreUndo(state) : state;
  }
  action satisfies never;
}
