import { describe, expect, it } from "vitest";
import { attachBaseline } from "@/features/projection/__tests__/projectionFixtures";
import {
  recordStatusLabels,
  recordStatusSummaries,
  readRpcMethod,
  sendAuthenticateResult,
  sendJsonRpcError,
  startGuiHostConnectionWithSocket,
} from "./guiHostClientTestSupport";

describe("guiHostClient protocol errors", () => {
  it("closes the socket and suppresses later status updates during cleanup", () => {
    const { labels: statuses, onStatus } = recordStatusLabels();

    const { cleanup, socket } = startGuiHostConnectionWithSocket({
      attachResponse: attachBaseline,
      onStatus,
    });

    cleanup();
    socket.onmessage?.({
      data: JSON.stringify({ jsonrpc: "2.0", id: 1, result: { authenticated: true } }),
    });
    socket.onclose?.({ code: 1000, reason: "cleanup" });

    expect(socket.closed).toEqual([{ code: 1000, reason: "cleanup" }]);
    expect(statuses).toEqual(["connecting"]);
  });

  it("surfaces JSON-RPC errors on initialize/attach instead of advancing", () => {
    const { summaries: statuses, onStatus } = recordStatusSummaries();

    const { socket } = startGuiHostConnectionWithSocket({
      attachResponse: attachBaseline,
      onStatus,
    });

    socket.onopen?.();
    sendAuthenticateResult(socket);
    sendJsonRpcError(socket, 2, { code: -32601, message: "method not found" });

    expect(socket.sent.map(readRpcMethod)).toEqual(["gui/authenticate", "initialize"]);
    expect(statuses.at(-1)?.label).toBe("error");
    expect(socket.closed).toHaveLength(1);
    expect(socket.closed[0]?.code).toBe(1000);
  });

  it("keeps terminal error state even after clean close fires afterwards", () => {
    const { labels: statuses, onStatus } = recordStatusLabels();

    const { socket } = startGuiHostConnectionWithSocket({
      attachResponse: attachBaseline,
      onStatus,
    });

    socket.onopen?.();
    sendAuthenticateResult(socket);
    sendJsonRpcError(socket, 2, { code: -32601, message: "method not found" });
    expect(socket.closed).toHaveLength(1);
    expect(socket.closed[0]?.code).toBe(1000);

    socket.onclose?.({ code: 1000, reason: "handshake error" });

    expect(statuses.at(-1)).toBe("error");
  });

  it("keeps terminal error state when socket error is followed by clean close", () => {
    const { labels: statuses, onStatus } = recordStatusLabels();

    const { socket } = startGuiHostConnectionWithSocket({
      attachResponse: attachBaseline,
      onStatus,
    });

    socket.onerror?.();
    socket.onclose?.({ code: 1000, reason: "" });

    expect(statuses.at(-1)).toBe("error");
  });

  it("reports malformed JSON-RPC messages as errors and closes cleanly", () => {
    const { summaries: statuses, onStatus } = recordStatusSummaries();

    const { socket } = startGuiHostConnectionWithSocket({
      attachResponse: attachBaseline,
      onStatus,
    });

    socket.onmessage?.({ data: "{" });

    expect(statuses.at(-1)).toEqual({
      label: "error",
      message: "Malformed JSON-RPC message",
    });
    expect(socket.closed).toEqual([{ code: 1000, reason: "invalid message" }]);
  });

  it("reports policy-close as error", () => {
    const { labels: statuses, onStatus } = recordStatusLabels();

    const { socket } = startGuiHostConnectionWithSocket({
      attachResponse: attachBaseline,
      onStatus,
    });
    socket.onopen?.();

    socket.onclose?.({ code: 1008, reason: "invalid token" });

    expect(statuses.at(-1)).toBe("error");
  });
});
