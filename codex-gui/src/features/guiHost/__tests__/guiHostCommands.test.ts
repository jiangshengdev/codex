import { describe, expect, it, vi } from "vitest";
import { attachBaseline } from "@/features/projection/__tests__/projectionFixtures";
import { inProgressTurn } from "@/features/projection/__tests__/projectionTestBuilders";
import type {
  ThreadProjectionAttachResponse,
  TurnStartParams,
  TurnStartResponse,
} from "@codex-protocol/v2";
import type { GuiHostCommands, StartGuiHostConnectionOptions } from "../guiHostClient";
import {
  recordStatusLabels,
  readLatestRpcRequest,
  readRpcMethod,
  sendAttachResult,
  sendAuthenticateResult,
  sendInitializeResult,
  sendJsonRpcError,
  sendJsonRpcResult,
  startGuiHostConnectionWithSocket,
} from "./guiHostClientTestSupport";

const turnStartParams = (threadId: string): TurnStartParams => ({
  threadId,
  clientUserMessageId: null,
  input: [{ type: "text", text: "Hello", text_elements: [] }],
});

async function startConnectionUntilCommandsReady({
  attachResponse,
  onCommandsUnavailable,
  onStatus,
}: {
  attachResponse: ThreadProjectionAttachResponse;
  onCommandsUnavailable?: StartGuiHostConnectionOptions["onCommandsUnavailable"];
  onStatus?: StartGuiHostConnectionOptions["onStatus"];
}): Promise<{
  attachResponse: ThreadProjectionAttachResponse;
  cleanup: () => void;
  commands: GuiHostCommands;
  socket: ReturnType<typeof startGuiHostConnectionWithSocket>["socket"];
  threadId: string;
}> {
  const commandsReady = vi.fn<(commands: GuiHostCommands) => void>();
  const { cleanup, socket, threadId } = startGuiHostConnectionWithSocket({
    attachResponse,
    onCommandsReady: commandsReady,
    onCommandsUnavailable,
    onStatus,
  });

  socket.onopen?.();
  sendAuthenticateResult(socket);
  await vi.waitFor(() => {
    expect(socket.sent.map(readRpcMethod)).toContain("initialize");
  });
  sendInitializeResult(socket);
  await vi.waitFor(() => {
    expect(socket.sent.map(readRpcMethod)).toContain("thread/projection/attach");
  });
  sendAttachResult(socket, attachResponse);
  await vi.waitFor(() => {
    expect(commandsReady).toHaveBeenCalledOnce();
  });
  const commands = commandsReady.mock.calls[0]?.[0];
  if (!commands) {
    throw new Error("Expected commands to be ready");
  }

  return { attachResponse, cleanup, commands, socket, threadId };
}

describe("guiHostClient commands", () => {
  it("sends turn/start through the ready command API", async () => {
    const { commands, socket, threadId } = await startConnectionUntilCommandsReady({
      attachResponse: attachBaseline,
    });
    const params = turnStartParams(threadId);
    const response: TurnStartResponse = {
      turn: inProgressTurn("turn-started-by-command"),
    };
    const promise = commands.startTurn(params);
    const request = readLatestRpcRequest(socket, "turn/start");

    expect(typeof request.id).toBe("number");
    expect(request).toEqual({
      jsonrpc: "2.0",
      id: request.id,
      method: "turn/start",
      params,
    });

    sendJsonRpcResult(socket, request.id, response);

    await expect(promise).resolves.toEqual(response);
  });

  it("sends turn/interrupt through the ready command API", async () => {
    const { commands, socket, threadId } = await startConnectionUntilCommandsReady({
      attachResponse: attachBaseline,
    });

    const params = { threadId, turnId: "turn-active" };
    const promise = commands.interruptTurn(params);
    const request = readLatestRpcRequest(socket, "turn/interrupt");

    expect(typeof request.id).toBe("number");
    expect(request).toEqual({
      jsonrpc: "2.0",
      id: request.id,
      method: "turn/interrupt",
      params,
    });

    sendJsonRpcResult(socket, request.id, {});

    await expect(promise).resolves.toEqual({});
  });

  it("rejects command JSON-RPC errors without closing the socket", async () => {
    const { labels: statuses, onStatus } = recordStatusLabels();
    const { commands, socket, threadId } = await startConnectionUntilCommandsReady({
      attachResponse: attachBaseline,
      onStatus,
    });

    const params = turnStartParams(threadId);
    const promise = commands.startTurn(params);
    const request = readLatestRpcRequest(socket, "turn/start");

    expect(typeof request.id).toBe("number");
    expect(request).toEqual({
      jsonrpc: "2.0",
      id: request.id,
      method: "turn/start",
      params,
    });

    sendJsonRpcError(socket, request.id, {
      code: -32000,
      message: "active turn already running",
    });

    await expect(promise).rejects.toThrow("active turn already running");
    expect(socket.closed).toEqual([]);
    expect(statuses.at(-1)).toBe("attached");
  });

  it("rejects pending command requests during cleanup", async () => {
    const calls: string[] = [];
    const { cleanup, commands, socket, threadId } = await startConnectionUntilCommandsReady({
      attachResponse: attachBaseline,
      onCommandsUnavailable: () => {
        calls.push("commands-unavailable");
      },
      onStatus: (status) => {
        calls.push(`status:${status.label}`);
      },
    });

    const promise = commands.interruptTurn({ threadId, turnId: "turn-active" });

    calls.length = 0;
    cleanup();
    cleanup();

    await expect(promise).rejects.toThrow("GUI host WebSocket is not available");
    expect(calls).toEqual(["commands-unavailable"]);
    expect(socket.closed).toEqual([{ code: 1000, reason: "cleanup" }]);
  });

  it.each([
    ["socket error", (socket: { onerror?: (() => void) | null }) => socket.onerror?.()],
    [
      "socket close",
      (socket: { onclose?: ((event: { code: number; reason: string }) => void) | null }) =>
        socket.onclose?.({ code: 1006, reason: "network lost" }),
    ],
  ])(
    "rejects pending command requests and marks commands unavailable on %s",
    async (_, closeSocket) => {
      const commandsUnavailable = vi.fn<() => void>();
      const { commands, socket, threadId } = await startConnectionUntilCommandsReady({
        attachResponse: attachBaseline,
        onCommandsUnavailable: commandsUnavailable,
      });

      const promise = commands.interruptTurn({ threadId, turnId: "turn-active" });

      closeSocket(socket);

      await expect(promise).rejects.toThrow("GUI host WebSocket is not available");
      expect(commandsUnavailable).toHaveBeenCalledTimes(1);
    },
  );

  it("closes the socket and marks commands unavailable on terminal projection protocol errors", async () => {
    const commandsUnavailable = vi.fn<() => void>();
    const { attachResponse, commands, socket, threadId } = await startConnectionUntilCommandsReady({
      attachResponse: attachBaseline,
      onCommandsUnavailable: commandsUnavailable,
    });

    const promise = commands.interruptTurn({ threadId, turnId: "turn-active" });

    socket.onmessage?.({
      data: JSON.stringify({
        jsonrpc: "2.0",
        method: "thread/projection/event",
        params: {
          threadId,
          subscriptionId: attachResponse.subscriptionId,
          commitId: "c1",
          parentCommitId: null,
          event: { type: "turnStarted" },
        },
      }),
    });

    await expect(promise).rejects.toThrow("GUI host WebSocket is not available");
    expect(commandsUnavailable).toHaveBeenCalledTimes(1);
    expect(socket.closed).toEqual([{ code: 1000, reason: "protocol error" }]);
  });
});
