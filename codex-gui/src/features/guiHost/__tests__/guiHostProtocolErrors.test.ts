import { describe, expect, it } from "vitest";
import { attachBaseline } from "@/features/projection/__tests__/projectionFixtures";
import {
  recordStatusLabels,
  recordStatusSummaries,
  readLatestRpcRequest,
  readRpcMethod,
  sendAuthenticateResult,
  sendJsonRpcError,
  startConnectionUntilCommandsReady,
  startGuiHostConnectionWithSocket,
} from "./guiHostClientTestSupport";

describe("guiHostClient protocol errors", () => {
  it("closes the socket and suppresses later status updates during cleanup", () => {
    const { labels: statuses, onStatus } = recordStatusLabels();

    const { cleanup, socket } = startGuiHostConnectionWithSocket({
      attachResponse: attachBaseline,
      onStatus,
    });

    socket.onopen?.();
    const request = readLatestRpcRequest(socket, "gui/authenticate");
    cleanup();
    cleanup();
    const sentAfterCleanup = [...socket.sent];
    const closedAfterCleanup = [...socket.closed];
    socket.onmessage?.({
      data: JSON.stringify({
        jsonrpc: "2.0",
        id: request.id,
        result: { authenticated: true },
      }),
    });
    socket.onclose?.({ code: 1000, reason: "cleanup" });

    expect(statuses).toEqual(["connecting"]);
    expect(socket.sent).toEqual(sentAfterCleanup);
    expect(socket.closed).toEqual(closedAfterCleanup);
    expect(socket.closed).toEqual([{ code: 1000, reason: "cleanup" }]);
  });

  it("ignores a valid success response with a non-numeric id", () => {
    const { labels: statuses, onStatus } = recordStatusLabels();
    const { socket } = startGuiHostConnectionWithSocket({
      attachResponse: attachBaseline,
      onStatus,
    });

    socket.onopen?.();
    const authenticateRequest = readLatestRpcRequest(socket, "gui/authenticate");
    socket.onmessage?.({
      data: JSON.stringify({
        jsonrpc: "2.0",
        id: "external",
        result: { accepted: true },
      }),
    });

    expect(socket.sent.map(readRpcMethod)).toEqual(["gui/authenticate"]);
    expect(statuses).toEqual(["connecting"]);
    expect(socket.closed).toEqual([]);

    socket.onmessage?.({
      data: JSON.stringify({
        jsonrpc: "2.0",
        id: authenticateRequest.id,
        result: { authenticated: true },
      }),
    });

    expect(socket.sent.map(readRpcMethod)).toEqual(["gui/authenticate", "initialize"]);
    expect(statuses).toEqual(["connecting", "authenticated"]);
    expect(socket.closed).toEqual([]);
  });

  it("treats a valid error response with a non-numeric id as terminal", () => {
    const { summaries: statuses, onStatus } = recordStatusSummaries();
    const { socket } = startGuiHostConnectionWithSocket({
      attachResponse: attachBaseline,
      onStatus,
    });

    socket.onopen?.();
    const authenticateRequest = readLatestRpcRequest(socket, "gui/authenticate");
    socket.onmessage?.({
      data: JSON.stringify({
        jsonrpc: "2.0",
        id: "external",
        error: { code: -32601, message: "method not found" },
      }),
    });

    expect(statuses.at(-1)).toEqual({
      label: "error",
      message: "JSON-RPC error (id=external, code=-32601): method not found",
    });
    expect(socket.closed).toEqual([{ code: 1000, reason: "handshake error" }]);

    socket.onmessage?.({
      data: JSON.stringify({
        jsonrpc: "2.0",
        id: authenticateRequest.id,
        result: { authenticated: true },
      }),
    });
    socket.onclose?.({ code: 1000, reason: "handshake error" });

    expect(socket.sent.map(readRpcMethod)).toEqual(["gui/authenticate"]);
    expect(statuses).toEqual([
      { label: "connecting", message: undefined },
      {
        label: "error",
        message: "JSON-RPC error (id=external, code=-32601): method not found",
      },
    ]);
    expect(socket.closed).toEqual([{ code: 1000, reason: "handshake error" }]);
  });

  it("ignores an unmatched numeric JSON-RPC error response", () => {
    const { labels: statuses, onStatus } = recordStatusLabels();
    const { socket } = startGuiHostConnectionWithSocket({
      attachResponse: attachBaseline,
      onStatus,
    });

    socket.onopen?.();
    const authenticateRequest = readLatestRpcRequest(socket, "gui/authenticate");
    sendJsonRpcError(socket, authenticateRequest.id + 1, {
      code: -32601,
      message: "method not found",
    });

    expect(socket.sent.map(readRpcMethod)).toEqual(["gui/authenticate"]);
    expect(statuses).toEqual(["connecting"]);
    expect(socket.closed).toEqual([]);

    sendAuthenticateResult(socket);

    expect(socket.sent.map(readRpcMethod)).toEqual(["gui/authenticate", "initialize"]);
    expect(statuses).toEqual(["connecting", "authenticated"]);
    expect(socket.closed).toEqual([]);
  });

  it("surfaces JSON-RPC errors on initialize/attach instead of advancing", () => {
    const { summaries: statuses, onStatus } = recordStatusSummaries();

    const { socket } = startGuiHostConnectionWithSocket({
      attachResponse: attachBaseline,
      onStatus,
    });

    socket.onopen?.();
    sendAuthenticateResult(socket);
    const request = readLatestRpcRequest(socket, "initialize");
    sendJsonRpcError(socket, request.id, { code: -32601, message: "method not found" });

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
    const request = readLatestRpcRequest(socket, "initialize");
    sendJsonRpcError(socket, request.id, { code: -32601, message: "method not found" });
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

  it("orders protocol error status before making commands unavailable", () => {
    const calls: string[] = [];
    const { socket } = startConnectionUntilCommandsReady({
      attachResponse: attachBaseline,
      onCommandsUnavailable: () => {
        calls.push("commands-unavailable");
      },
      onStatus: (status) => {
        calls.push(`status:${status.label}`);
      },
    });

    calls.length = 0;
    socket.onmessage?.({ data: "{" });

    expect(calls).toEqual(["status:error", "commands-unavailable"]);
  });

  it("orders command unavailability before socket error status", () => {
    const calls: string[] = [];
    const { socket } = startConnectionUntilCommandsReady({
      attachResponse: attachBaseline,
      onCommandsUnavailable: () => {
        calls.push("commands-unavailable");
      },
      onStatus: (status) => {
        calls.push(`status:${status.label}`);
      },
    });

    calls.length = 0;
    socket.onerror?.();

    expect(calls).toEqual(["commands-unavailable", "status:error"]);
  });

  it("preserves both error callbacks when socket error is followed by abnormal close", () => {
    const { labels: statuses, onStatus } = recordStatusLabels();
    const { socket } = startGuiHostConnectionWithSocket({
      attachResponse: attachBaseline,
      onStatus,
    });

    socket.onerror?.();
    socket.onclose?.({ code: 1006, reason: "network lost" });

    expect(statuses).toEqual(["connecting", "error", "error"]);
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

  it.each([
    ["array", []],
    ["primitive", 42],
    ["object missing JSON-RPC fields", { jsonrpc: "2.0" }],
  ])("reports a parseable %s as a malformed JSON-RPC message", (_, message) => {
    const { summaries: statuses, onStatus } = recordStatusSummaries();
    const callbacks: string[] = [];
    const { socket } = startGuiHostConnectionWithSocket({
      attachResponse: attachBaseline,
      onStatus,
      onCommandsReady: () => {
        callbacks.push("commands-ready");
      },
      onProjectionAttached: () => {
        callbacks.push("projection-attached");
      },
      onProjectionClosed: () => {
        callbacks.push("projection-closed");
      },
      onProjectionDelta: () => {
        callbacks.push("projection-delta");
      },
      onProjectionEvent: () => {
        callbacks.push("projection-event");
      },
    });

    socket.onopen?.();
    socket.onmessage?.({ data: JSON.stringify(message) });

    expect(socket.sent.map(readRpcMethod)).toEqual(["gui/authenticate"]);
    expect(callbacks).toEqual([]);
    expect(statuses.at(-1)).toEqual({
      label: "error",
      message: "Malformed JSON-RPC message",
    });
    expect(socket.closed).toEqual([{ code: 1000, reason: "invalid message" }]);
  });

  it.each(["thread/projection/event", "thread/projection/delta", "thread/projection/closed"])(
    "reports %s params with missing required fields as a protocol error",
    (method) => {
      const { summaries: statuses, onStatus } = recordStatusSummaries();
      const projectionCallbacks: string[] = [];
      const { socket } = startGuiHostConnectionWithSocket({
        attachResponse: attachBaseline,
        onStatus,
        onProjectionAttached: () => {
          projectionCallbacks.push("attached");
        },
        onProjectionClosed: () => {
          projectionCallbacks.push("closed");
        },
        onProjectionDelta: () => {
          projectionCallbacks.push("delta");
        },
        onProjectionEvent: () => {
          projectionCallbacks.push("event");
        },
      });

      socket.onmessage?.({
        data: JSON.stringify({ jsonrpc: "2.0", method, params: {} }),
      });

      expect(projectionCallbacks).toEqual([]);
      expect(statuses.at(-1)).toEqual({
        label: "error",
        message: `${method} returned malformed params payload`,
      });
      expect(socket.closed).toEqual([{ code: 1000, reason: "protocol error" }]);
    },
  );

  it("reports an unknown notification method as malformed and closes cleanly", () => {
    const { summaries: statuses, onStatus } = recordStatusSummaries();
    const projectionCallbacks: string[] = [];
    const { socket } = startGuiHostConnectionWithSocket({
      attachResponse: attachBaseline,
      onStatus,
      onProjectionAttached: () => {
        projectionCallbacks.push("attached");
      },
      onProjectionClosed: () => {
        projectionCallbacks.push("closed");
      },
      onProjectionDelta: () => {
        projectionCallbacks.push("delta");
      },
      onProjectionEvent: () => {
        projectionCallbacks.push("event");
      },
    });

    socket.onmessage?.({
      data: JSON.stringify({
        jsonrpc: "2.0",
        method: "fixture/unknown-notification",
        params: {},
      }),
    });

    expect(projectionCallbacks).toEqual([]);
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
