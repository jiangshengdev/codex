import { expect, vi } from "vitest";
import type { ThreadProjectionAttachResponse } from "@codex-protocol/v2";
import { startGuiHostConnection, type GuiHostCommands } from "../guiHostClient";

export class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

export class ThrowingSetItemStorage extends MemoryStorage {
  override setItem(): void {
    throw new Error("sessionStorage unavailable");
  }
}

type SocketCloseEvent = {
  code: number;
  reason: string;
};

export type ParsedRpcRequest = {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params?: unknown;
};

export function readRpcRequest(message: string): ParsedRpcRequest {
  return JSON.parse(message) as ParsedRpcRequest;
}

export class RecordingWebSocket {
  sent: string[] = [];
  closed: { code: number | undefined; reason: string | undefined }[] = [];
  onerror: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onopen: (() => void) | null = null;
  onclose: ((event: SocketCloseEvent) => void) | null = null;

  send(message: string): void {
    this.sent.push(message);
  }

  close(code?: number, reason?: string): void {
    this.closed.push({ code, reason });
  }
}

export function startConnectionUntilCommandsReady({
  attachResponse,
  onCommandsUnavailable,
  onStatus,
}: {
  attachResponse: ThreadProjectionAttachResponse;
  onCommandsUnavailable?: () => void;
  onStatus?: Parameters<typeof startGuiHostConnection>[0]["onStatus"];
}): {
  attachResponse: ThreadProjectionAttachResponse;
  cleanup: () => void;
  commands: GuiHostCommands;
  socket: RecordingWebSocket;
  threadId: string;
} {
  const socket = new RecordingWebSocket();
  const commandsReady = vi.fn<(commands: GuiHostCommands) => void>();
  const threadId = attachResponse.snapshot.thread.id;

  const cleanup = startGuiHostConnection({
    location: new URL(`http://127.0.0.1:4567/?threadId=${threadId}#token=secret`),
    replaceState: vi.fn<History["replaceState"]>(),
    tokenStorage: new MemoryStorage(),
    createWebSocket: () => socket as unknown as WebSocket,
    onCommandsReady: commandsReady,
    onCommandsUnavailable,
    onStatus,
  });

  socket.onopen?.();
  socket.onmessage?.({
    data: JSON.stringify({ jsonrpc: "2.0", id: 1, result: { authenticated: true } }),
  });
  socket.onmessage?.({
    data: JSON.stringify({ jsonrpc: "2.0", id: 2, result: {} }),
  });
  socket.onmessage?.({
    data: JSON.stringify({ jsonrpc: "2.0", id: 3, result: attachResponse }),
  });

  expect(commandsReady).toHaveBeenCalledTimes(1);
  const commands = commandsReady.mock.calls[0]?.[0];
  if (!commands) {
    throw new Error("Expected commands to be ready");
  }

  return { attachResponse, cleanup, commands, socket, threadId };
}
