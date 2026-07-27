export type ChatScrollRestoreStatus = "pending" | "restoring" | null;

export type ChatUiSessionState = Readonly<{
  draft: string;
  isStickyBottom: boolean;
  scrollTop: number;
  pendingRestore: ChatScrollRestoreStatus;
}>;

export type ChatScrollSnapshot = Readonly<{
  isStickyBottom: boolean;
  scrollTop: number;
}>;

export type ChatScrollRestore =
  | Readonly<{ type: "stickyBottom" }>
  | Readonly<{ type: "scrollTop"; scrollTop: number }>;

export type ChatScrollRestoreConsumption = Readonly<{
  nextState: ChatUiSessionState;
  restore: ChatScrollRestore | null;
}>;

export function createInitialChatUiSessionState(): ChatUiSessionState {
  return {
    draft: "",
    isStickyBottom: true,
    scrollTop: 0,
    pendingRestore: null,
  };
}

export function updateChatDraft(state: ChatUiSessionState, draft: string): ChatUiSessionState {
  return {
    ...state,
    draft,
  };
}

export function captureChatScrollSnapshot(
  state: ChatUiSessionState,
  snapshot: ChatScrollSnapshot,
): ChatUiSessionState {
  return {
    ...state,
    isStickyBottom: snapshot.isStickyBottom,
    scrollTop: snapshot.scrollTop,
    pendingRestore: "pending",
  };
}

export function consumeChatScrollRestore(state: ChatUiSessionState): ChatScrollRestoreConsumption {
  if (state.pendingRestore !== "pending") {
    return {
      nextState: state,
      restore: null,
    };
  }

  const nextState: ChatUiSessionState = {
    ...state,
    pendingRestore: "restoring",
  };

  return {
    nextState,
    restore: state.isStickyBottom
      ? { type: "stickyBottom" }
      : { type: "scrollTop", scrollTop: state.scrollTop },
  };
}

export function completeChatScrollRestore(state: ChatUiSessionState): ChatUiSessionState {
  if (state.pendingRestore !== "restoring") {
    return state;
  }

  return {
    ...state,
    pendingRestore: null,
  };
}
