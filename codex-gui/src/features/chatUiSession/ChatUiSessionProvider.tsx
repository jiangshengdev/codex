import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type PropsWithChildren,
  type SetStateAction,
} from "react";
import { ChatUiSessionContext, type ChatUiSessionContextValue } from "./ChatUiSessionContext";
import {
  captureChatScrollSnapshot,
  completeChatScrollRestore,
  consumeChatScrollRestore,
  createInitialChatUiSessionState,
  updateChatDraft,
  type ChatScrollRestore,
  type ChatScrollSnapshot,
  type ChatUiSessionState,
} from "./chatUiSession";

export function ChatUiSessionProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState(createInitialChatUiSessionState);
  const stateRef = useRef(state);

  const updateState = useCallback(
    (update: (currentState: ChatUiSessionState) => ChatUiSessionState): ChatUiSessionState => {
      const nextState = update(stateRef.current);
      stateRef.current = nextState;
      setState(nextState);
      return nextState;
    },
    [],
  );

  const setDraft = useCallback<Dispatch<SetStateAction<string>>>(
    (nextDraft) => {
      updateState((currentState) =>
        updateChatDraft(
          currentState,
          typeof nextDraft === "function" ? nextDraft(currentState.draft) : nextDraft,
        ),
      );
    },
    [updateState],
  );

  const captureScrollSnapshot = useCallback(
    (snapshot: ChatScrollSnapshot) => {
      updateState((currentState) => captureChatScrollSnapshot(currentState, snapshot));
    },
    [updateState],
  );

  const consumeScrollRestore = useCallback((): ChatScrollRestore | null => {
    let restore: ChatScrollRestore | null = null;
    updateState((currentState) => {
      const consumption = consumeChatScrollRestore(currentState);
      restore = consumption.restore;
      return consumption.nextState;
    });
    return restore;
  }, [updateState]);

  const completeScrollRestore = useCallback(() => {
    updateState(completeChatScrollRestore);
  }, [updateState]);

  const value = useMemo<ChatUiSessionContextValue>(
    () => ({
      draft: state.draft,
      setDraft,
      captureScrollSnapshot,
      consumeScrollRestore,
      completeScrollRestore,
    }),
    [captureScrollSnapshot, completeScrollRestore, consumeScrollRestore, setDraft, state.draft],
  );

  return <ChatUiSessionContext value={value}>{children}</ChatUiSessionContext>;
}
