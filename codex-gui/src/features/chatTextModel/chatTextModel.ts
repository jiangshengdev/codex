import type { RootState } from "@/app/store";
import {
  selectThreadTimelineMaterials,
  type LiveSubscriptionMaterial,
  type TimelineMaterial,
} from "@/features/liveEventHandling/liveEventHandling";
import type { ThreadItem, UserInput } from "@codex-protocol/v2";

export type ChatTextModel = {
  turns: ChatTextTurn[];
  globalStatus: ChatTextGlobalStatus[];
};

export type ChatTextTurn = {
  id: string;
  entries: ChatTextMessageEntry[];
};

export type ChatTextMessageEntry = {
  type: "message";
  id: string;
  role: "user" | "assistant";
  text: string;
};

export type ChatTextGlobalStatus = {
  type: "status";
  id: string;
  status: "subscriptionInterrupted";
  text: string;
};

const SUBSCRIPTION_INTERRUPTED_TEXT = "Connection interrupted. Reconnect required.";

export const buildChatTextModel = (materials: TimelineMaterial[]): ChatTextModel => {
  const model: ChatTextModel = {
    turns: [],
    globalStatus: [],
  };
  const turnsById = new Map<string, ChatTextTurn>();

  const ensureTurn = (id: string): ChatTextTurn => {
    const existingTurn = turnsById.get(id);
    if (existingTurn != null) {
      return existingTurn;
    }

    const turn: ChatTextTurn = { id, entries: [] };
    turnsById.set(id, turn);
    model.turns.push(turn);
    return turn;
  };

  for (const material of materials) {
    switch (material.type) {
      case "turnStarted":
        ensureTurn(material.turn.id);
        break;
      case "itemReplayed":
      case "itemCompleted": {
        const message = messageEntryFromThreadItem(material.item);
        if (message != null) {
          ensureTurn(material.turnId).entries.push(message);
        }
        break;
      }
      case "itemStarted":
      case "turnCompleted":
        break;
      case "subscriptionInterrupted":
        model.globalStatus.push(statusEntryFromSubscriptionInterrupted(material));
        break;
    }
  }

  return model;
};

export const selectChatTextModel = (state: RootState): ChatTextModel =>
  buildChatTextModel(selectThreadTimelineMaterials(state));

const statusEntryFromSubscriptionInterrupted = (
  material: LiveSubscriptionMaterial,
): ChatTextGlobalStatus => ({
  type: "status",
  id: `subscriptionInterrupted:${material.threadId}:${material.subscriptionId ?? "none"}:${material.reason}`,
  status: "subscriptionInterrupted",
  text: SUBSCRIPTION_INTERRUPTED_TEXT,
});

const messageEntryFromThreadItem = (item: ThreadItem): ChatTextMessageEntry | null => {
  switch (item.type) {
    case "userMessage": {
      const text = item.content.map(textFromUserInput).join("");
      if (text.length === 0) {
        return null;
      }

      return {
        type: "message",
        id: item.id,
        role: "user",
        text,
      };
    }
    case "agentMessage":
      if (item.text.length === 0) {
        return null;
      }

      return {
        type: "message",
        id: item.id,
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
