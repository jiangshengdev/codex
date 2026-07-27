import { createContext, use, type Dispatch, type SetStateAction } from "react";
import type { ChatScrollRestore, ChatScrollSnapshot } from "./chatUiSession";

export type ChatUiSessionContextValue = Readonly<{
  draft: string;
  setDraft: Dispatch<SetStateAction<string>>;
  captureScrollSnapshot: (snapshot: ChatScrollSnapshot) => void;
  consumeScrollRestore: () => ChatScrollRestore | null;
  completeScrollRestore: () => void;
}>;

export const ChatUiSessionContext = createContext<ChatUiSessionContextValue | null>(null);

export function useChatUiSession(): ChatUiSessionContextValue {
  const session = use(ChatUiSessionContext);
  if (session == null) {
    throw new Error("useChatUiSession must be used within ChatUiSessionProvider");
  }

  return session;
}
