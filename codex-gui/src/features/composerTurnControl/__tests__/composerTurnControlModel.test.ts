import { describe, expect, it } from "vitest";
import type { GuiHostStatus } from "@/features/guiHost/guiHostClient";
import {
  canRecoverComposerQueue,
  canSend,
  canStop,
  errorDescription,
  isConnectionUsable,
} from "../composerTurnControlModel";

const attachedStatus: GuiHostStatus = {
  label: "attached",
};

describe("composerTurnControlModel", () => {
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
        controllerReady: true,
        draft: "Hello",
        isSending: false,
        recoveryCount: 0,
      }),
    ).toBe(true);
    expect(
      canSend({
        connectionUsable: true,
        controllerReady: true,
        draft: "   ",
        isSending: false,
        recoveryCount: 0,
      }),
    ).toBe(false);
    expect(
      canSend({
        connectionUsable: true,
        controllerReady: true,
        draft: "Hello",
        isSending: false,
        recoveryCount: 0,
      }),
    ).toBe(true);
    expect(
      canSend({
        connectionUsable: true,
        controllerReady: true,
        draft: "Hello",
        isSending: true,
        recoveryCount: 0,
      }),
    ).toBe(false);
    expect(
      canSend({
        connectionUsable: true,
        controllerReady: false,
        draft: "Hello",
        isSending: false,
        recoveryCount: 0,
      }),
    ).toBe(false);
    expect(
      canSend({
        connectionUsable: true,
        controllerReady: true,
        draft: "Hello",
        isSending: false,
        recoveryCount: 2,
      }),
    ).toBe(false);

    expect(canStop({ connectionUsable: true, activeTurnId: "turn-1", isStopping: false })).toBe(
      true,
    );
    expect(canStop({ connectionUsable: true, activeTurnId: null, isStopping: false })).toBe(false);
    expect(canStop({ connectionUsable: false, activeTurnId: "turn-1", isStopping: false })).toBe(
      false,
    );
    expect(canStop({ connectionUsable: true, activeTurnId: "turn-1", isStopping: true })).toBe(
      false,
    );
  });

  it.each([
    {
      caseName: "commands unavailable",
      input: {
        connectionUsable: false,
        hasController: true,
        recoveryCount: 2,
        isRecovering: false,
      },
      expected: false,
    },
    {
      caseName: "manual reconnect required",
      input: {
        connectionUsable: false,
        hasController: true,
        recoveryCount: 2,
        isRecovering: false,
      },
      expected: false,
    },
    {
      caseName: "no recovery batch",
      input: {
        connectionUsable: true,
        hasController: true,
        recoveryCount: 0,
        isRecovering: false,
      },
      expected: false,
    },
    {
      caseName: "recovery already running",
      input: {
        connectionUsable: true,
        hasController: true,
        recoveryCount: 2,
        isRecovering: true,
      },
      expected: false,
    },
    {
      caseName: "controller unavailable",
      input: {
        connectionUsable: true,
        hasController: false,
        recoveryCount: 2,
        isRecovering: false,
      },
      expected: false,
    },
    {
      caseName: "recovery available",
      input: {
        connectionUsable: true,
        hasController: true,
        recoveryCount: 2,
        isRecovering: false,
      },
      expected: true,
    },
  ])("derives queue recovery availability for $caseName", ({ input, expected }) => {
    expect(canRecoverComposerQueue(input)).toBe(expected);
  });

  it("extracts human-readable error descriptions", () => {
    expect(errorDescription(new Error("failed"))).toBe("failed");
    expect(errorDescription("failed string")).toBe("failed string");
    expect(errorDescription({ message: "structured" })).toBe("structured");
    expect(errorDescription({})).toBeUndefined();
  });
});
