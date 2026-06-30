import { describe, expect, it, vi } from "vitest";
import { attachBaseline } from "@/features/projection/__tests__/projectionFixtures";
import { inProgressTurn } from "@/features/projection/__tests__/projectionTestBuilders";
import type { TurnStartParams, TurnStartResponse } from "@codex-protocol/v2";
import type { GuiHostCommands } from "../guiHostClient";
import {
  recordStatusLabels,
  readRpcRequest,
  sendAttachResult,
  sendAuthenticateResult,
  sendInitializeResult,
  sendJsonRpcError,
  sendJsonRpcResult,
  startConnectionUntilCommandsReady,
  startGuiHostConnectionWithSocket,
} from "./guiHostClientTestSupport";

describe("guiHostClient commands", () => {
  it("sends turn/start through the ready command API", async () => {
    const commandsReady = vi.fn<(commands: GuiHostCommands) => void>();
    const attachResponse = attachBaseline;
    const { socket, threadId } = startGuiHostConnectionWithSocket({
      attachResponse,
      onCommandsReady: commandsReady,
    });

    socket.onopen?.();
    sendAuthenticateResult(socket);
    sendInitializeResult(socket);
    sendAttachResult(socket, attachResponse);

    expect(commandsReady).toHaveBeenCalledTimes(1);
    const commands = commandsReady.mock.calls[0]?.[0];
    expect(commands).toBeDefined();

    const params: TurnStartParams = {
      threadId,
      clientUserMessageId: null,
      input: [{ type: "text", text: "Hello", text_elements: [] }],
    };
    const response: TurnStartResponse = {
      turn: inProgressTurn("turn-started-by-command"),
    };
    const promise = commands?.startTurn(params);

    expect(readRpcRequest(socket.sent.at(-1) ?? "")).toEqual({
      jsonrpc: "2.0",
      id: 4,
      method: "turn/start",
      params,
    });

    sendJsonRpcResult(socket, 4, response);

    await expect(promise).resolves.toEqual(response);
  });

  it("sends turn/interrupt through the ready command API", async () => {
    const commandsReady = vi.fn<(commands: GuiHostCommands) => void>();
    const attachResponse = attachBaseline;
    const { socket, threadId } = startGuiHostConnectionWithSocket({
      attachResponse,
      onCommandsReady: commandsReady,
    });

    socket.onopen?.();
    sendAuthenticateResult(socket);
    sendInitializeResult(socket);
    sendAttachResult(socket, attachResponse);

    expect(commandsReady).toHaveBeenCalledTimes(1);
    const commands = commandsReady.mock.calls[0]?.[0];
    expect(commands).toBeDefined();

    const params = { threadId, turnId: "turn-active" };
    const promise = commands?.interruptTurn(params);

    expect(readRpcRequest(socket.sent.at(-1) ?? "")).toEqual({
      jsonrpc: "2.0",
      id: 4,
      method: "turn/interrupt",
      params,
    });

    sendJsonRpcResult(socket, 4, {});

    await expect(promise).resolves.toEqual({});
  });

  it("rejects command JSON-RPC errors without closing the socket", async () => {
    const { labels: statuses, onStatus } = recordStatusLabels();
    const commandsReady = vi.fn<(commands: GuiHostCommands) => void>();
    const attachResponse = attachBaseline;
    const { socket, threadId } = startGuiHostConnectionWithSocket({
      attachResponse,
      onStatus,
      onCommandsReady: commandsReady,
    });

    socket.onopen?.();
    sendAuthenticateResult(socket);
    sendInitializeResult(socket);
    sendAttachResult(socket, attachResponse);

    const commands = commandsReady.mock.calls[0]?.[0];
    expect(commands).toBeDefined();

    const params: TurnStartParams = {
      threadId,
      clientUserMessageId: null,
      input: [{ type: "text", text: "Hello", text_elements: [] }],
    };
    const promise = commands?.startTurn(params);

    sendJsonRpcError(socket, 4, { code: -32000, message: "active turn already running" });

    await expect(promise).rejects.toThrow("active turn already running");
    expect(socket.closed).toEqual([]);
    expect(statuses.at(-1)).toBe("attached");
  });

  it("rejects pending command requests during cleanup", async () => {
    const commandsUnavailable = vi.fn<() => void>();
    const { cleanup, commands, threadId } = startConnectionUntilCommandsReady({
      attachResponse: attachBaseline,
      onCommandsUnavailable: commandsUnavailable,
    });

    const promise = commands.interruptTurn({ threadId, turnId: "turn-active" });

    cleanup();

    await expect(promise).rejects.toThrow("GUI host WebSocket is not available");
    expect(commandsUnavailable).toHaveBeenCalledTimes(1);
  });

  it("rejects pending command requests and marks commands unavailable on socket error", async () => {
    const commandsUnavailable = vi.fn<() => void>();
    const { commands, socket, threadId } = startConnectionUntilCommandsReady({
      attachResponse: attachBaseline,
      onCommandsUnavailable: commandsUnavailable,
    });

    const promise = commands.interruptTurn({ threadId, turnId: "turn-active" });

    socket.onerror?.();

    await expect(promise).rejects.toThrow("GUI host WebSocket is not available");
    expect(commandsUnavailable).toHaveBeenCalledTimes(1);
  });

  it("rejects pending command requests and marks commands unavailable on socket close", async () => {
    const commandsUnavailable = vi.fn<() => void>();
    const { commands, socket, threadId } = startConnectionUntilCommandsReady({
      attachResponse: attachBaseline,
      onCommandsUnavailable: commandsUnavailable,
    });

    const promise = commands.interruptTurn({ threadId, turnId: "turn-active" });

    socket.onclose?.({ code: 1006, reason: "network lost" });

    await expect(promise).rejects.toThrow("GUI host WebSocket is not available");
    expect(commandsUnavailable).toHaveBeenCalledTimes(1);
  });

  it("closes the socket and marks commands unavailable on terminal projection protocol errors", async () => {
    const commandsUnavailable = vi.fn<() => void>();
    const { attachResponse, commands, socket, threadId } = startConnectionUntilCommandsReady({
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
