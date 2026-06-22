import { describe, expect, it, vi } from "vitest";
import attachBaselineJson from "@/features/projection/__fixtures__/attach-baseline.json";
import closedBackpressureJson from "@/features/projection/__fixtures__/closed-backpressure.json";
import eventTurnStartedJson from "@/features/projection/__fixtures__/event-turn-started.json";
import type {
  ThreadProjectionAttachResponse,
  ThreadProjectionClosedNotification,
  ThreadProjectionEventNotification,
  TurnStartParams,
  TurnStartResponse,
} from "@codex-protocol/v2";
import {
  clearLaunchTokenFragment,
  readLaunchParams,
  startGuiHostConnection,
  type LaunchParams,
} from "./guiHostClient";
import {
  MemoryStorage,
  RecordingWebSocket,
  ThrowingSetItemStorage,
  readRpcRequest,
  startConnectionUntilCommandsReady,
} from "./__tests__/guiHostClientTestSupport";

const attachBaseline = attachBaselineJson as ThreadProjectionAttachResponse;

describe("guiHostClient", () => {
  it("stores app-server launch URL fragment token and restores it after refresh", () => {
    const storage = new MemoryStorage();
    const replaceState = vi.fn<History["replaceState"]>();

    expect(
      readLaunchParams(new URL("http://127.0.0.1:4567/?threadId=thread-abc#token=secret"), storage),
    ).toEqual({ threadId: "thread-abc", token: "secret" });
    expect(
      readLaunchParams(new URL("http://127.0.0.1:4567/?threadId=thread-abc"), storage),
    ).toEqual({ threadId: "thread-abc", token: "secret" });

    clearLaunchTokenFragment(
      new URL("http://127.0.0.1:4567/app?threadId=thread-abc#token=secret"),
      replaceState,
    );

    expect(replaceState).toHaveBeenCalledTimes(1);
    const [, , replacedUrl] = replaceState.mock.calls[0] as [unknown, unknown, string];
    expect(replacedUrl).not.toContain("#token=");
    expect(replacedUrl).toContain("/app");
    expect(replacedUrl).toContain("threadId=thread-abc");
  });

  it("throws when launch URL is missing required launch params", () => {
    expect(() =>
      readLaunchParams(new URL("http://127.0.0.1:4567/#token=secret"), new MemoryStorage()),
    ).toThrow("Missing threadId query parameter");
    expect(() =>
      readLaunchParams(new URL("http://127.0.0.1:4567/?threadId=thread-abc"), new MemoryStorage()),
    ).toThrow("Missing launch token fragment");
  });

  it("sends authenticate, initialize, attach, and forwards projection payloads", () => {
    const socket = new RecordingWebSocket();
    const statuses: string[] = [];
    const attached: ThreadProjectionAttachResponse[] = [];
    const projectionEvents: ThreadProjectionEventNotification[] = [];
    const projectionClosedNotifications: ThreadProjectionClosedNotification[] = [];
    const launchParams: LaunchParams[] = [];
    const attachResponse = attachBaseline;
    const projectionEvent = eventTurnStartedJson as ThreadProjectionEventNotification;
    const projectionClosed = closedBackpressureJson as ThreadProjectionClosedNotification;

    startGuiHostConnection({
      location: new URL(
        `http://127.0.0.1:4567/?threadId=${attachResponse.snapshot.thread.id}#token=secret`,
      ),
      replaceState: vi.fn<History["replaceState"]>(),
      tokenStorage: new MemoryStorage(),
      createWebSocket: () => socket as unknown as WebSocket,
      onStatus: (status) => {
        statuses.push(status.label);
      },
      onLaunchParams: (params) => {
        launchParams.push(params);
      },
      onProjectionAttached: (response) => {
        attached.push(response);
      },
      onProjectionEvent: (notification) => {
        projectionEvents.push(notification);
      },
      onProjectionClosed: (notification) => {
        projectionClosedNotifications.push(notification);
      },
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
    socket.onmessage?.({
      data: JSON.stringify({
        jsonrpc: "2.0",
        method: "thread/projection/event",
        params: projectionEvent,
      }),
    });
    socket.onmessage?.({
      data: JSON.stringify({
        jsonrpc: "2.0",
        method: "thread/projection/closed",
        params: projectionClosed,
      }),
    });

    expect(socket.sent.map(readRpcMethod)).toEqual([
      "gui/authenticate",
      "initialize",
      "thread/projection/attach",
    ]);
    expect(statuses).toContain("authenticated");
    expect(statuses).toContain("initialized");
    expect(statuses).toContain("attached");
    expect(statuses).toContain("received event");
    expect(launchParams).toEqual([
      { threadId: attachResponse.snapshot.thread.id, token: "secret" },
    ]);
    expect(attached).toEqual([attachResponse]);
    expect(projectionEvents).toEqual([projectionEvent]);
    expect(projectionClosedNotifications).toEqual([projectionClosed]);
  });

  it("sends turn/start through the ready command API", async () => {
    const socket = new RecordingWebSocket();
    const commandsReady =
      vi.fn<NonNullable<Parameters<typeof startGuiHostConnection>[0]["onCommandsReady"]>>();
    const attachResponse = attachBaseline;
    const threadId = attachResponse.snapshot.thread.id;

    startGuiHostConnection({
      location: new URL(`http://127.0.0.1:4567/?threadId=${threadId}#token=secret`),
      replaceState: vi.fn<History["replaceState"]>(),
      tokenStorage: new MemoryStorage(),
      createWebSocket: () => socket as unknown as WebSocket,
      onCommandsReady: commandsReady,
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
    expect(commands).toBeDefined();

    const params: TurnStartParams = {
      threadId,
      clientUserMessageId: null,
      input: [{ type: "text", text: "Hello", text_elements: [] }],
    };
    const response: TurnStartResponse = {
      turn: {
        id: "turn-started-by-command",
        items: [],
        itemsView: "full",
        status: "inProgress",
        error: null,
        startedAt: 1700000100,
        completedAt: null,
        durationMs: null,
      },
    };
    const promise = commands?.startTurn(params);

    expect(readRpcRequest(socket.sent.at(-1) ?? "")).toEqual({
      jsonrpc: "2.0",
      id: 4,
      method: "turn/start",
      params,
    });

    socket.onmessage?.({
      data: JSON.stringify({ jsonrpc: "2.0", id: 4, result: response }),
    });

    await expect(promise).resolves.toEqual(response);
  });

  it("sends turn/interrupt through the ready command API", async () => {
    const socket = new RecordingWebSocket();
    const commandsReady =
      vi.fn<NonNullable<Parameters<typeof startGuiHostConnection>[0]["onCommandsReady"]>>();
    const attachResponse = attachBaseline;
    const threadId = attachResponse.snapshot.thread.id;

    startGuiHostConnection({
      location: new URL(`http://127.0.0.1:4567/?threadId=${threadId}#token=secret`),
      replaceState: vi.fn<History["replaceState"]>(),
      tokenStorage: new MemoryStorage(),
      createWebSocket: () => socket as unknown as WebSocket,
      onCommandsReady: commandsReady,
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
    expect(commands).toBeDefined();

    const params = { threadId, turnId: "turn-active" };
    const promise = commands?.interruptTurn(params);

    expect(readRpcRequest(socket.sent.at(-1) ?? "")).toEqual({
      jsonrpc: "2.0",
      id: 4,
      method: "turn/interrupt",
      params,
    });

    socket.onmessage?.({
      data: JSON.stringify({ jsonrpc: "2.0", id: 4, result: {} }),
    });

    await expect(promise).resolves.toEqual({});
  });

  it("rejects command JSON-RPC errors without closing the socket", async () => {
    const socket = new RecordingWebSocket();
    const statuses: string[] = [];
    const commandsReady =
      vi.fn<NonNullable<Parameters<typeof startGuiHostConnection>[0]["onCommandsReady"]>>();
    const attachResponse = attachBaseline;
    const threadId = attachResponse.snapshot.thread.id;

    startGuiHostConnection({
      location: new URL(`http://127.0.0.1:4567/?threadId=${threadId}#token=secret`),
      replaceState: vi.fn<History["replaceState"]>(),
      tokenStorage: new MemoryStorage(),
      createWebSocket: () => socket as unknown as WebSocket,
      onStatus: (status) => {
        statuses.push(status.label);
      },
      onCommandsReady: commandsReady,
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

    const commands = commandsReady.mock.calls[0]?.[0];
    expect(commands).toBeDefined();

    const params: TurnStartParams = {
      threadId,
      clientUserMessageId: null,
      input: [{ type: "text", text: "Hello", text_elements: [] }],
    };
    const promise = commands?.startTurn(params);

    socket.onmessage?.({
      data: JSON.stringify({
        jsonrpc: "2.0",
        id: 4,
        error: { code: -32000, message: "active turn already running" },
      }),
    });

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

  it("reports malformed projection attach payloads without forwarding them", () => {
    const socket = new RecordingWebSocket();
    const statuses: { label: string; message?: string }[] = [];
    const attached: ThreadProjectionAttachResponse[] = [];

    startGuiHostConnection({
      location: new URL("http://127.0.0.1:4567/?threadId=thread-abc#token=secret"),
      replaceState: vi.fn<History["replaceState"]>(),
      tokenStorage: new MemoryStorage(),
      createWebSocket: () => socket as unknown as WebSocket,
      onStatus: (status) => {
        statuses.push({
          label: status.label,
          message: "message" in status ? status.message : undefined,
        });
      },
      onProjectionAttached: (response) => {
        attached.push(response);
      },
    });

    socket.onopen?.();
    socket.onmessage?.({
      data: JSON.stringify({ jsonrpc: "2.0", id: 1, result: { authenticated: true } }),
    });
    socket.onmessage?.({
      data: JSON.stringify({ jsonrpc: "2.0", id: 2, result: {} }),
    });
    socket.onmessage?.({
      data: JSON.stringify({ jsonrpc: "2.0", id: 3, result: { subscriptionId: "sub-1" } }),
    });

    expect(attached).toEqual([]);
    expect(statuses.at(-1)).toEqual({
      label: "error",
      message: "thread/projection/attach returned malformed result payload",
    });
  });

  it("reports malformed projection event payloads without forwarding them", () => {
    const socket = new RecordingWebSocket();
    const statuses: { label: string; message?: string }[] = [];
    const projectionEvents: ThreadProjectionEventNotification[] = [];
    const attachResponse = attachBaseline;

    startGuiHostConnection({
      location: new URL(
        `http://127.0.0.1:4567/?threadId=${attachResponse.snapshot.thread.id}#token=secret`,
      ),
      replaceState: vi.fn<History["replaceState"]>(),
      tokenStorage: new MemoryStorage(),
      createWebSocket: () => socket as unknown as WebSocket,
      onStatus: (status) => {
        statuses.push({
          label: status.label,
          message: "message" in status ? status.message : undefined,
        });
      },
      onProjectionEvent: (notification) => {
        projectionEvents.push(notification);
      },
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
    socket.onmessage?.({
      data: JSON.stringify({
        jsonrpc: "2.0",
        method: "thread/projection/event",
        params: {
          threadId: attachResponse.snapshot.thread.id,
          subscriptionId: attachResponse.subscriptionId,
          commitId: "c1",
          parentCommitId: null,
          event: { type: "turnStarted" },
        },
      }),
    });

    expect(projectionEvents).toEqual([]);
    expect(statuses.at(-1)).toEqual({
      label: "error",
      message: "thread/projection/event returned malformed params payload",
    });
  });

  it("reports malformed projection closed payloads without forwarding them", () => {
    const socket = new RecordingWebSocket();
    const statuses: { label: string; message?: string }[] = [];
    const projectionClosedNotifications: ThreadProjectionClosedNotification[] = [];
    const attachResponse = attachBaseline;

    startGuiHostConnection({
      location: new URL(
        `http://127.0.0.1:4567/?threadId=${attachResponse.snapshot.thread.id}#token=secret`,
      ),
      replaceState: vi.fn<History["replaceState"]>(),
      tokenStorage: new MemoryStorage(),
      createWebSocket: () => socket as unknown as WebSocket,
      onStatus: (status) => {
        statuses.push({
          label: status.label,
          message: "message" in status ? status.message : undefined,
        });
      },
      onProjectionClosed: (notification) => {
        projectionClosedNotifications.push(notification);
      },
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
    socket.onmessage?.({
      data: JSON.stringify({
        jsonrpc: "2.0",
        method: "thread/projection/closed",
        params: {
          threadId: attachResponse.snapshot.thread.id,
          subscriptionId: attachResponse.subscriptionId,
          reason: "unexpected",
        },
      }),
    });

    expect(projectionClosedNotifications).toEqual([]);
    expect(statuses.at(-1)).toEqual({
      label: "error",
      message: "thread/projection/closed returned malformed params payload",
    });
  });

  it("clears the fragment and authenticates when launch token storage fails", () => {
    const socket = new RecordingWebSocket();
    const replaceState = vi.fn<History["replaceState"]>();

    startGuiHostConnection({
      location: new URL("http://127.0.0.1:4567/?threadId=thread-abc#token=secret"),
      replaceState,
      tokenStorage: new ThrowingSetItemStorage(),
      createWebSocket: () => socket as unknown as WebSocket,
    });

    expect(replaceState).toHaveBeenCalledTimes(1);
    const [, , replacedUrl] = replaceState.mock.calls[0] as [unknown, unknown, string];
    expect(replacedUrl).not.toContain("#token=");

    socket.onopen?.();

    expect(socket.sent.map(readRpcMethod)).toEqual(["gui/authenticate"]);
  });

  it("closes the socket and suppresses later status updates during cleanup", () => {
    const socket = new RecordingWebSocket();
    const statuses: string[] = [];

    const cleanup = startGuiHostConnection({
      location: new URL("http://127.0.0.1:4567/?threadId=thread-abc#token=secret"),
      replaceState: vi.fn<History["replaceState"]>(),
      tokenStorage: new MemoryStorage(),
      createWebSocket: () => socket as unknown as WebSocket,
      onStatus: (status) => {
        statuses.push(status.label);
      },
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
    const socket = new RecordingWebSocket();
    const statuses: { label: string; message?: string }[] = [];

    startGuiHostConnection({
      location: new URL("http://127.0.0.1:4567/?threadId=thread-abc#token=secret"),
      replaceState: vi.fn<History["replaceState"]>(),
      tokenStorage: new MemoryStorage(),
      createWebSocket: () => socket as unknown as WebSocket,
      onStatus: (status) => {
        statuses.push({
          label: status.label,
          message: "message" in status ? status.message : undefined,
        });
      },
    });

    socket.onopen?.();
    socket.onmessage?.({
      data: JSON.stringify({ jsonrpc: "2.0", id: 1, result: { authenticated: true } }),
    });
    socket.onmessage?.({
      data: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        error: { code: -32601, message: "method not found" },
      }),
    });

    expect(socket.sent.map(readRpcMethod)).toEqual(["gui/authenticate", "initialize"]);
    expect(statuses.at(-1)?.label).toBe("error");
    expect(socket.closed).toHaveLength(1);
    expect(socket.closed[0]?.code).toBe(1000);
  });

  it("keeps terminal error state even after clean close fires afterwards", () => {
    const socket = new RecordingWebSocket();
    const statuses: string[] = [];

    startGuiHostConnection({
      location: new URL("http://127.0.0.1:4567/?threadId=thread-abc#token=secret"),
      replaceState: vi.fn<History["replaceState"]>(),
      tokenStorage: new MemoryStorage(),
      createWebSocket: () => socket as unknown as WebSocket,
      onStatus: (status) => {
        statuses.push(status.label);
      },
    });

    socket.onopen?.();
    socket.onmessage?.({
      data: JSON.stringify({ jsonrpc: "2.0", id: 1, result: { authenticated: true } }),
    });
    socket.onmessage?.({
      data: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        error: { code: -32601, message: "method not found" },
      }),
    });
    expect(socket.closed).toHaveLength(1);
    expect(socket.closed[0]?.code).toBe(1000);

    socket.onclose?.({ code: 1000, reason: "handshake error" });

    expect(statuses.at(-1)).toBe("error");
  });

  it("keeps terminal error state when socket error is followed by clean close", () => {
    const socket = new RecordingWebSocket();
    const statuses: string[] = [];

    startGuiHostConnection({
      location: new URL("http://127.0.0.1:4567/?threadId=thread-abc#token=secret"),
      replaceState: vi.fn<History["replaceState"]>(),
      tokenStorage: new MemoryStorage(),
      createWebSocket: () => socket as unknown as WebSocket,
      onStatus: (status) => {
        statuses.push(status.label);
      },
    });

    socket.onerror?.();
    socket.onclose?.({ code: 1000, reason: "" });

    expect(statuses.at(-1)).toBe("error");
  });

  it("reports malformed JSON-RPC messages as errors and closes cleanly", () => {
    const socket = new RecordingWebSocket();
    const statuses: { label: string; message?: string }[] = [];

    startGuiHostConnection({
      location: new URL("http://127.0.0.1:4567/?threadId=thread-abc#token=secret"),
      replaceState: vi.fn<History["replaceState"]>(),
      tokenStorage: new MemoryStorage(),
      createWebSocket: () => socket as unknown as WebSocket,
      onStatus: (status) => {
        statuses.push({
          label: status.label,
          message: "message" in status ? status.message : undefined,
        });
      },
    });

    socket.onmessage?.({ data: "{" });

    expect(statuses.at(-1)).toEqual({
      label: "error",
      message: "Malformed JSON-RPC message",
    });
    expect(socket.closed).toEqual([{ code: 1000, reason: "invalid message" }]);
  });

  it("reports policy-close as error", () => {
    const socket = new RecordingWebSocket();
    const statuses: string[] = [];

    startGuiHostConnection({
      location: new URL("http://127.0.0.1:4567/?threadId=thread-abc#token=secret"),
      replaceState: vi.fn<History["replaceState"]>(),
      tokenStorage: new MemoryStorage(),
      createWebSocket: () => socket as unknown as WebSocket,
      onStatus: (status) => {
        statuses.push(status.label);
      },
    });
    socket.onopen?.();

    socket.onclose?.({ code: 1008, reason: "invalid token" });

    expect(statuses.at(-1)).toBe("error");
  });
});

function readRpcMethod(message: string): string | undefined {
  const parsed: unknown = JSON.parse(message);
  if (!isRecord(parsed)) {
    return undefined;
  }

  return typeof parsed.method === "string" ? parsed.method : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
