import { describe, expect, it, vi } from "vitest";
import attachBaselineJson from "@/features/projection/__fixtures__/attach-baseline.json";
import eventTurnStartedJson from "@/features/projection/__fixtures__/event-turn-started.json";
import type {
  ThreadProjectionAttachResponse,
  ThreadProjectionClosedNotification,
  ThreadProjectionEventNotification,
} from "@codex-protocol/v2";
import {
  clearLaunchTokenFragment,
  readLaunchParams,
  startGuiHostConnection,
  type LaunchParams,
} from "./guiHostClient";

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

class ThrowingSetItemStorage extends MemoryStorage {
  override setItem(): void {
    throw new Error("sessionStorage unavailable");
  }
}

type SocketCloseEvent = {
  code: number;
  reason: string;
};

class RecordingWebSocket {
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

describe("guiHostClient", () => {
  it("stores app-server launch URL fragment token and restores it after refresh", () => {
    const storage = new MemoryStorage();
    const replaceState = vi.fn();

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
    const attachResponse = attachBaselineJson as ThreadProjectionAttachResponse;
    const projectionEvent = eventTurnStartedJson as ThreadProjectionEventNotification;
    const projectionClosed: ThreadProjectionClosedNotification = {
      threadId: attachResponse.snapshot.thread.id,
      subscriptionId: attachResponse.subscriptionId,
      reason: "backpressure",
    };

    startGuiHostConnection({
      location: new URL(
        `http://127.0.0.1:4567/?threadId=${attachResponse.snapshot.thread.id}#token=secret`,
      ),
      replaceState: vi.fn(),
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

  it("reports malformed projection attach payloads without forwarding them", () => {
    const socket = new RecordingWebSocket();
    const statuses: { label: string; message?: string }[] = [];
    const attached: ThreadProjectionAttachResponse[] = [];

    startGuiHostConnection({
      location: new URL("http://127.0.0.1:4567/?threadId=thread-abc#token=secret"),
      replaceState: vi.fn(),
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
    const attachResponse = attachBaselineJson as ThreadProjectionAttachResponse;

    startGuiHostConnection({
      location: new URL(
        `http://127.0.0.1:4567/?threadId=${attachResponse.snapshot.thread.id}#token=secret`,
      ),
      replaceState: vi.fn(),
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
    const attachResponse = attachBaselineJson as ThreadProjectionAttachResponse;

    startGuiHostConnection({
      location: new URL(
        `http://127.0.0.1:4567/?threadId=${attachResponse.snapshot.thread.id}#token=secret`,
      ),
      replaceState: vi.fn(),
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
    const replaceState = vi.fn();

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
      replaceState: vi.fn(),
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
      replaceState: vi.fn(),
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
      replaceState: vi.fn(),
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
      replaceState: vi.fn(),
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
      replaceState: vi.fn(),
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
      replaceState: vi.fn(),
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
