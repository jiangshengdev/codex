import { describe, expect, it } from "vitest";
import type { GuiHostStatus } from "@/features/guiHost/guiHostClient";
import attachBaselineJson from "@/features/projection/__fixtures__/attach-baseline.json";
import type { ThreadRuntimeRecord } from "@/features/threadRuntime/threadRuntimeSlice";
import type { ThreadProjectionAttachResponse } from "@codex-protocol/v2";
import {
  buildPlainTextInput,
  canSend,
  canStop,
  errorDescription,
  isConnectionUsable,
} from "../composerTurnControlModel";

const attachedStatus: GuiHostStatus = {
  label: "attached",
  eventCount: 0,
  lastEventType: null,
};

const attachBaseline = attachBaselineJson as ThreadProjectionAttachResponse;

const runtimeFromAttach = (response: ThreadProjectionAttachResponse): ThreadRuntimeRecord => {
  const { turns: snapshotTurns, ...thread } = response.snapshot.thread;

  return {
    threadId: thread.id,
    sessionId: thread.sessionId,
    thread,
    snapshotTurns,
    eventBuffer: [],
    activeTurnId:
      snapshotTurns.toReversed().find((turn) => turn.status === "inProgress")?.id ?? null,
    subscription: { state: "active" },
  };
};

const runtime = runtimeFromAttach(attachBaseline);

describe("composerTurnControlModel", () => {
  it("builds plain text UserInput with text_elements", () => {
    expect(buildPlainTextInput("Hello")).toEqual({
      type: "text",
      text: "Hello",
      text_elements: [],
    });
  });

  it("requires attached identity, active subscription, runtime, and usable host status", () => {
    expect(
      isConnectionUsable({
        canAdvanceThreadIdentity: true,
        guiHostStatus: attachedStatus,
        runtime,
        subscription: { state: "active" },
      }),
    ).toBe(true);

    expect(
      isConnectionUsable({
        canAdvanceThreadIdentity: false,
        guiHostStatus: attachedStatus,
        runtime,
        subscription: { state: "active" },
      }),
    ).toBe(false);

    expect(
      isConnectionUsable({
        canAdvanceThreadIdentity: true,
        guiHostStatus: attachedStatus,
        runtime,
        subscription: {
          state: "manualReconnectRequired",
          reason: "backpressure",
          subscriptionId: "sub-1",
        },
      }),
    ).toBe(false);

    expect(
      isConnectionUsable({
        canAdvanceThreadIdentity: true,
        guiHostStatus: { label: "error", eventCount: 0, lastEventType: null, message: "boom" },
        runtime,
        subscription: { state: "active" },
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
