import type { GuiHostStatus } from "@/features/guiHost/guiHostClient";
import type { ThreadRuntimeSubscription } from "@/features/threadRuntime/threadRuntimeSlice";
import type { UserInput } from "@codex-protocol/v2";

export type ComposerAvailabilityInput = {
  canAdvanceThreadIdentity: boolean;
  guiHostStatus: GuiHostStatus;
  threadId: string | null;
  subscriptionState: ThreadRuntimeSubscription["state"] | null;
};

export function buildPlainTextInput(text: string): UserInput {
  return { type: "text", text, text_elements: [] };
}

export function isConnectionUsable(input: ComposerAvailabilityInput): boolean {
  return (
    input.canAdvanceThreadIdentity &&
    input.threadId != null &&
    input.subscriptionState === "active" &&
    input.guiHostStatus.label !== "error" &&
    input.guiHostStatus.label !== "closed"
  );
}

export function canSend(input: {
  connectionUsable: boolean;
  activeTurnId: string | null;
  draft: string;
  isSending: boolean;
}): boolean {
  return (
    input.connectionUsable &&
    input.activeTurnId == null &&
    input.draft.trim().length > 0 &&
    !input.isSending
  );
}

export function canStop(input: {
  connectionUsable: boolean;
  activeTurnId: string | null;
}): boolean {
  return input.connectionUsable && input.activeTurnId != null;
}

export function errorDescription(error: unknown): string | undefined {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }
  return undefined;
}
