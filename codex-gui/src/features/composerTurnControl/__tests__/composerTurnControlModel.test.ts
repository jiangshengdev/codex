import { describe, expect, it } from "vitest";
import type { GuiHostStatus } from "@/features/guiHost/guiHostClient";
import {
  buildPlainTextInput,
  canSend,
  canStop,
  errorDescription,
  isConnectionUsable,
} from "../composerTurnControlModel";

const attachedStatus: GuiHostStatus = {
  label: "attached",
};

describe("composerTurnControlModel", () => {
  it("builds plain text UserInput with text_elements", () => {
    expect(buildPlainTextInput("Hello")).toEqual({
      type: "text",
      text: "Hello",
      text_elements: [],
    });
  });

  it("requires attached identity, active subscription, thread id, and usable host status", () => {
    expect(
      isConnectionUsable({
        canAdvanceThreadIdentity: true,
        guiHostStatus: attachedStatus,
        threadId: "thread-1",
        subscriptionState: "active",
      }),
    ).toBe(true);

    expect(
      isConnectionUsable({
        canAdvanceThreadIdentity: false,
        guiHostStatus: attachedStatus,
        threadId: "thread-1",
        subscriptionState: "active",
      }),
    ).toBe(false);

    expect(
      isConnectionUsable({
        canAdvanceThreadIdentity: true,
        guiHostStatus: attachedStatus,
        threadId: null,
        subscriptionState: "active",
      }),
    ).toBe(false);

    expect(
      isConnectionUsable({
        canAdvanceThreadIdentity: true,
        guiHostStatus: attachedStatus,
        threadId: "thread-1",
        subscriptionState: "manualReconnectRequired",
      }),
    ).toBe(false);

    expect(
      isConnectionUsable({
        canAdvanceThreadIdentity: true,
        guiHostStatus: { label: "error", message: "boom" },
        threadId: "thread-1",
        subscriptionState: "active",
      }),
    ).toBe(false);
  });

  it("derives send and stop availability", () => {
    expect(
      canSend({
        connectionUsable: true,
        activeTurnId: null,
        draft: "Hello",
        isSending: false,
      }),
    ).toBe(true);
    expect(
      canSend({ connectionUsable: true, activeTurnId: null, draft: "   ", isSending: false }),
    ).toBe(false);
    expect(
      canSend({
        connectionUsable: true,
        activeTurnId: "turn-1",
        draft: "Hello",
        isSending: false,
      }),
    ).toBe(false);
    expect(
      canSend({ connectionUsable: true, activeTurnId: null, draft: "Hello", isSending: true }),
    ).toBe(false);

    expect(canStop({ connectionUsable: true, activeTurnId: "turn-1" })).toBe(true);
    expect(canStop({ connectionUsable: true, activeTurnId: null })).toBe(false);
    expect(canStop({ connectionUsable: false, activeTurnId: "turn-1" })).toBe(false);
  });

  it("extracts human-readable error descriptions", () => {
    expect(errorDescription(new Error("failed"))).toBe("failed");
    expect(errorDescription("failed string")).toBe("failed string");
    expect(errorDescription({ message: "structured" })).toBe("structured");
    expect(errorDescription({})).toBeUndefined();
  });
});
