import { describe, expect, it, vi } from "vitest";
import { attachBaseline } from "@/features/projection/__tests__/projectionFixtures";
import type { ThreadProjectionAttachResponse } from "@codex-protocol/v2";
import type { GuiHostCommands, StartGuiHostConnectionOptions } from "../guiHostClient";
import {
  recordStatusLabels,
  recordStatusSummaries,
  readLatestRpcRequest,
  readRpcMethod,
  sendAttachResult,
  sendAuthenticateResult,
  sendInitializeResult,
  sendJsonRpcError,
  startGuiHostConnectionWithSocket,
} from "./guiHostClientTestSupport";

async function sendAuthenticationAndWaitForInitialize(
  socket: ReturnType<typeof startGuiHostConnectionWithSocket>["socket"],
): Promise<void> {
  sendAuthenticateResult(socket);
  await vi.waitFor(() => {
    expect(socket.sent.map(readRpcMethod)).toContain("initialize");
  });
}

async function startConnectionUntilCommandsReady({
  attachResponse,
  onCommandsUnavailable,
  onStatus,
}: {
  attachResponse: ThreadProjectionAttachResponse;
  onCommandsUnavailable?: StartGuiHostConnectionOptions["onCommandsUnavailable"];
  onStatus?: StartGuiHostConnectionOptions["onStatus"];
}): Promise<ReturnType<typeof startGuiHostConnectionWithSocket>> {
  const commandsReady = vi.fn<(commands: GuiHostCommands) => void>();
  const connection = startGuiHostConnectionWithSocket({
    attachResponse,
    onCommandsReady: commandsReady,
    onCommandsUnavailable,
    onStatus,
  });

  connection.socket.onopen?.();
  await sendAuthenticationAndWaitForInitialize(connection.socket);
  sendInitializeResult(connection.socket);
  await vi.waitFor(() => {
    expect(connection.socket.sent.map(readRpcMethod)).toContain("thread/projection/attach");
  });
  sendAttachResult(connection.socket, attachResponse);
  await vi.waitFor(() => {
    expect(commandsReady).toHaveBeenCalledOnce();
  });

  return connection;
}

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

  it("ignores messages delivered through a captured handler after cleanup", () => {
    const attached = vi.fn<(response: ThreadProjectionAttachResponse) => void>();
    const commandsReady = vi.fn<(commands: GuiHostCommands) => void>();
    const { cleanup, socket } = startGuiHostConnectionWithSocket({
      attachResponse: attachBaseline,
      onProjectionAttached: attached,
      onCommandsReady: commandsReady,
    });
    const onMessage = socket.onmessage;

    cleanup();
    onMessage?.({
      data: JSON.stringify({ jsonrpc: "2.0", id: 3, result: attachBaseline }),
    });

    expect(attached).not.toHaveBeenCalled();
    expect(commandsReady).not.toHaveBeenCalled();
  });

  it("ignores an unmatched numeric JSON-RPC error response", () => {
    const { labels, onStatus } = recordStatusLabels();
    const { socket } = startGuiHostConnectionWithSocket({
      attachResponse: attachBaseline,
      onStatus,
    });

    sendJsonRpcError(socket, 99, { code: -32601, message: "method not found" });

    expect(labels).toEqual(["connecting"]);
    expect(socket.closed).toEqual([]);
  });

  it("surfaces JSON-RPC errors on initialize/attach instead of advancing", async () => {
    const { summaries: statuses, onStatus } = recordStatusSummaries();

    const { socket } = startGuiHostConnectionWithSocket({
      attachResponse: attachBaseline,
      onStatus,
    });

    socket.onopen?.();
    await sendAuthenticationAndWaitForInitialize(socket);
    const request = readLatestRpcRequest(socket, "initialize");
    sendJsonRpcError(socket, request.id, { code: -32601, message: "method not found" });

    await vi.waitFor(() => {
      expect(statuses.at(-1)?.label).toBe("error");
    });

    expect(socket.sent.map(readRpcMethod)).toEqual(["gui/authenticate", "initialize"]);
    expect(statuses.at(-1)?.label).toBe("error");
    expect(socket.closed).toHaveLength(1);
    expect(socket.closed[0]?.code).toBe(1000);
  });

  it("keeps terminal error state even after clean close fires afterwards", async () => {
    const { labels: statuses, onStatus } = recordStatusLabels();

    const { socket } = startGuiHostConnectionWithSocket({
      attachResponse: attachBaseline,
      onStatus,
    });

    socket.onopen?.();
    await sendAuthenticationAndWaitForInitialize(socket);
    const request = readLatestRpcRequest(socket, "initialize");
    sendJsonRpcError(socket, request.id, { code: -32601, message: "method not found" });
    await vi.waitFor(() => {
      expect(socket.closed).toHaveLength(1);
    });
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

  it("orders protocol error status before making commands unavailable", async () => {
    const calls: string[] = [];
    const { socket } = await startConnectionUntilCommandsReady({
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

  it("orders command unavailability before socket error status", async () => {
    const calls: string[] = [];
    const { socket } = await startConnectionUntilCommandsReady({
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
