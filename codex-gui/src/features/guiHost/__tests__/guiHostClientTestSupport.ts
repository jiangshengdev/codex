import { expect, vi } from "vitest";
import type { InitializeResponse } from "@codex-protocol/InitializeResponse";
import type { ThreadProjectionAttachResponse } from "@codex-protocol/v2";
import {
  startGuiHostConnection,
  type GuiHostCommands,
  type StartGuiHostConnectionOptions,
} from "../guiHostClient";

type StatusSummary = {
  label: string;
  message?: string;
};

export class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
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

export function readRpcMethod(message: string): string | undefined {
  const parsed: unknown = JSON.parse(message);
  if (!isRecord(parsed)) {
    return undefined;
  }

  return typeof parsed.method === "string" ? parsed.method : undefined;
}

export function readLatestRpcRequest(socket: RecordingWebSocket, method: string): ParsedRpcRequest {
  const request = socket.sent
    .map(readRpcRequest)
    .findLast((candidate) => candidate.method === method);
  if (!request) {
    throw new Error(`Expected ${method} request`);
  }

  return request;
}

export function recordStatusLabels(): {
  labels: string[];
  onStatus: NonNullable<StartGuiHostConnectionOptions["onStatus"]>;
} {
  const labels: string[] = [];

  return {
    labels,
    onStatus: (status) => {
      labels.push(status.label);
    },
  };
}

export function recordStatusSummaries(): {
  summaries: StatusSummary[];
  onStatus: NonNullable<StartGuiHostConnectionOptions["onStatus"]>;
} {
  const summaries: StatusSummary[] = [];

  return {
    summaries,
    onStatus: (status) => {
      summaries.push({
        label: status.label,
        message: "message" in status ? status.message : undefined,
      });
    },
  };
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

export function sendJsonRpcResult(socket: RecordingWebSocket, id: number, result: unknown): void {
  socket.onmessage?.({
    data: JSON.stringify({ jsonrpc: "2.0", id, result }),
  });
}

export function sendJsonRpcError(
  socket: RecordingWebSocket,
  id: number,
  error: { code: number; message: string },
): void {
  socket.onmessage?.({
    data: JSON.stringify({ jsonrpc: "2.0", id, error }),
  });
}

export function sendAuthenticateResult(socket: RecordingWebSocket): void {
  const request = readLatestRpcRequest(socket, "gui/authenticate");
  sendJsonRpcResult(socket, request.id, { authenticated: true });
}

export function sendInitializeResult(socket: RecordingWebSocket): void {
  const request = readLatestRpcRequest(socket, "initialize");
  const response: InitializeResponse = {
    userAgent: "codex-test",
    codexHome: "/codex-home",
    platformFamily: "test",
    platformOs: "test",
  };
  sendJsonRpcResult(socket, request.id, response);
}

export function sendAttachResult(
  socket: RecordingWebSocket,
  attachResponse: ThreadProjectionAttachResponse,
): void {
  const request = readLatestRpcRequest(socket, "thread/projection/attach");
  sendJsonRpcResult(socket, request.id, attachResponse);
}

export function startGuiHostConnectionWithSocket({
  attachResponse,
  onCommandsReady,
  onCommandsUnavailable,
  onProjectionAttached,
  onProjectionClosed,
  onProjectionDelta,
  onProjectionEvent,
  onStatus,
}: {
  attachResponse: ThreadProjectionAttachResponse;
  onCommandsReady?: StartGuiHostConnectionOptions["onCommandsReady"];
  onCommandsUnavailable?: StartGuiHostConnectionOptions["onCommandsUnavailable"];
  onProjectionAttached?: StartGuiHostConnectionOptions["onProjectionAttached"];
  onProjectionClosed?: StartGuiHostConnectionOptions["onProjectionClosed"];
  onProjectionDelta?: StartGuiHostConnectionOptions["onProjectionDelta"];
  onProjectionEvent?: StartGuiHostConnectionOptions["onProjectionEvent"];
  onStatus?: StartGuiHostConnectionOptions["onStatus"];
}): {
  cleanup: () => void;
  socket: RecordingWebSocket;
  threadId: string;
} {
  const socket = new RecordingWebSocket();
  const threadId = attachResponse.snapshot.thread.id;

  const cleanup = startGuiHostConnection({
    location: new URL(`http://127.0.0.1:4567/?threadId=${threadId}#token=secret`),
    replaceState: vi.fn<History["replaceState"]>(),
    tokenStorage: new MemoryStorage(),
    createWebSocket: () => socket as unknown as WebSocket,
    onCommandsReady,
    onCommandsUnavailable,
    onProjectionAttached,
    onProjectionClosed,
    onProjectionDelta,
    onProjectionEvent,
    onStatus,
  });

  return { cleanup, socket, threadId };
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
  const commandsReady = vi.fn<(commands: GuiHostCommands) => void>();
  const { cleanup, socket, threadId } = startGuiHostConnectionWithSocket({
    attachResponse,
    onCommandsReady: commandsReady,
    onCommandsUnavailable,
    onStatus,
  });

  socket.onopen?.();
  sendAuthenticateResult(socket);
  sendInitializeResult(socket);
  sendAttachResult(socket, attachResponse);

  expect(commandsReady).toHaveBeenCalledTimes(1);
  const commands = commandsReady.mock.calls[0]?.[0];
  if (!commands) {
    throw new Error("Expected commands to be ready");
  }

  return { attachResponse, cleanup, commands, socket, threadId };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
