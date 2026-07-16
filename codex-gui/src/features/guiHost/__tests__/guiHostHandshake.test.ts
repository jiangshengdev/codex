import { describe, expect, it, vi } from "vitest";
import {
  attachBaseline,
  closedBackpressure,
  eventAgentMessageDelta,
  eventReasoningSummaryPartAddedDelta,
  eventReasoningSummaryTextDelta,
  eventReasoningTextDelta,
  eventTurnStarted,
} from "@/features/projection/__tests__/projectionFixtures";
import type {
  ThreadProjectionAttachResponse,
  ThreadProjectionClosedNotification,
  ThreadProjectionDeltaNotification,
  ThreadProjectionEventNotification,
} from "@codex-protocol/v2";
import type { BrowserLaunchParams } from "@/features/browserLaunch/browserLaunchParams";
import { validateGuiAuthenticateResult } from "@/generated/guiHostContract";
import { startGuiHostConnection } from "../guiHostClient";
import {
  MemoryStorage,
  RecordingWebSocket,
  recordStatusSummaries,
  readLatestRpcRequest,
  readRpcMethod,
  sendAttachResult,
  sendAuthenticateResult,
  sendInitializeResult,
  sendJsonRpcResult,
  startGuiHostConnectionWithSocket,
} from "./guiHostClientTestSupport";

describe("guiHostClient handshake", () => {
  it("clears the fragment and authenticates when launch token storage fails", () => {
    const socket = new RecordingWebSocket();
    const replaceState = vi.fn<History["replaceState"]>();

    startGuiHostConnection({
      location: new URL("http://127.0.0.1:4567/?threadId=thread-abc#token=secret"),
      replaceState,
      tokenStorage: {
        getItem: () => null,
        setItem: () => {
          throw new Error("sessionStorage unavailable");
        },
      },
      createWebSocket: () => socket as unknown as WebSocket,
    });

    expect(replaceState).toHaveBeenCalledWith(null, "", "/?threadId=thread-abc");

    socket.onopen?.();

    expect(socket.sent.map(readRpcMethod)).toEqual(["gui/authenticate"]);
  });

  it("calls onLaunchParams synchronously before creating the WebSocket", () => {
    const socket = new RecordingWebSocket();
    const calls: string[] = [];

    startGuiHostConnection({
      location: new URL("http://127.0.0.1:4567/?threadId=thread-abc#token=secret"),
      replaceState: vi.fn<History["replaceState"]>(),
      tokenStorage: new MemoryStorage(),
      onLaunchParams: (params) => {
        calls.push(`launch:${params.threadId}:${params.token}`);
      },
      createWebSocket: (url) => {
        calls.push(`create-websocket:${url}`);
        return socket as unknown as WebSocket;
      },
    });

    expect(calls).toEqual(["launch:thread-abc:secret", "create-websocket:ws://127.0.0.1:4567/ws"]);
  });

  it("does not create a WebSocket when launch params consumption fails", () => {
    const createWebSocket = vi.fn<(url: string) => WebSocket>();

    expect(() =>
      startGuiHostConnection({
        location: new URL("http://127.0.0.1:4567/#token=secret"),
        replaceState: vi.fn<History["replaceState"]>(),
        tokenStorage: new MemoryStorage(),
        createWebSocket,
      }),
    ).toThrow(new Error("Missing threadId query parameter"));
    expect(createWebSocket).not.toHaveBeenCalled();
  });

  it("sends authenticate, initialize, attach, and forwards projection payloads", () => {
    const socket = new RecordingWebSocket();
    const statuses: string[] = [];
    const attached: ThreadProjectionAttachResponse[] = [];
    const projectionEvents: ThreadProjectionEventNotification[] = [];
    const projectionDeltas: ThreadProjectionDeltaNotification[] = [];
    const projectionClosedNotifications: ThreadProjectionClosedNotification[] = [];
    const launchParams: BrowserLaunchParams[] = [];
    const attachResponse = attachBaseline;
    const projectionEvent = eventTurnStarted;
    const projectionDelta = eventAgentMessageDelta;
    const projectionClosed = closedBackpressure;

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
      onProjectionDelta: (notification) => {
        projectionDeltas.push(notification);
      },
      onProjectionClosed: (notification) => {
        projectionClosedNotifications.push(notification);
      },
    });

    socket.onopen?.();
    const authenticateRequest = readLatestRpcRequest(socket, "gui/authenticate");
    expect(authenticateRequest).toEqual({
      jsonrpc: "2.0",
      id: authenticateRequest.id,
      method: "gui/authenticate",
      params: { token: "secret" },
    });
    sendAuthenticateResult(socket);
    const initializeRequest = readLatestRpcRequest(socket, "initialize");
    expect(initializeRequest).toEqual({
      jsonrpc: "2.0",
      id: initializeRequest.id,
      method: "initialize",
      params: {
        clientInfo: { name: "codex-gui", title: null, version: "0.0.0" },
        capabilities: null,
      },
    });
    sendInitializeResult(socket);
    const attachRequest = readLatestRpcRequest(socket, "thread/projection/attach");
    expect(attachRequest).toEqual({
      jsonrpc: "2.0",
      id: attachRequest.id,
      method: "thread/projection/attach",
      params: { threadId: attachResponse.snapshot.thread.id },
    });
    sendAttachResult(socket, attachResponse);
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
        method: "thread/projection/delta",
        params: projectionDelta,
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
    expect(statuses).toEqual(["connecting", "authenticated", "initialized", "attached"]);
    expect(launchParams).toEqual([
      { threadId: attachResponse.snapshot.thread.id, token: "secret" },
    ]);
    expect(attached).toEqual([attachResponse]);
    expect(projectionEvents).toEqual([projectionEvent]);
    expect(projectionDeltas).toEqual([projectionDelta]);
    expect(projectionClosedNotifications).toEqual([projectionClosed]);
  });

  it("keeps a missing initialize result terminal without sending attach", () => {
    const { summaries: statuses, onStatus } = recordStatusSummaries();
    const { socket } = startGuiHostConnectionWithSocket({
      attachResponse: attachBaseline,
      onStatus,
    });

    socket.onopen?.();
    sendAuthenticateResult(socket);
    const initializeRequest = readLatestRpcRequest(socket, "initialize");
    socket.onmessage?.({
      data: JSON.stringify({ jsonrpc: "2.0", id: initializeRequest.id }),
    });

    expect(socket.sent.map(readRpcMethod)).toEqual(["gui/authenticate", "initialize"]);
    expect(statuses.at(-1)).toEqual({
      label: "error",
      message: "initialize returned no result payload",
    });
    expect(socket.closed).toEqual([{ code: 1000, reason: "protocol error" }]);
  });

  it.each([
    ["missing authenticated", {}],
    ["wrong authenticated type", { authenticated: "true" }],
  ])("keeps an authenticate result with %s terminal", (_, result) => {
    expect(validateGuiAuthenticateResult(result)).toBe(false);

    const { summaries: statuses, onStatus } = recordStatusSummaries();
    const { socket } = startGuiHostConnectionWithSocket({
      attachResponse: attachBaseline,
      onStatus,
    });

    socket.onopen?.();
    const authenticateRequest = readLatestRpcRequest(socket, "gui/authenticate");
    sendJsonRpcResult(socket, authenticateRequest.id, result);

    expect(socket.sent.map(readRpcMethod)).toEqual(["gui/authenticate"]);
    expect(statuses.at(-1)).toEqual({
      label: "error",
      message: "gui/authenticate returned malformed result payload",
    });
    expect(socket.closed).toEqual([{ code: 1000, reason: "protocol error" }]);
  });

  it("keeps an authenticate result with authenticated false terminal", () => {
    const result = { authenticated: false };
    expect(validateGuiAuthenticateResult(result)).toBe(true);
    const { summaries: statuses, onStatus } = recordStatusSummaries();
    const { socket } = startGuiHostConnectionWithSocket({
      attachResponse: attachBaseline,
      onStatus,
    });

    socket.onopen?.();
    const authenticateRequest = readLatestRpcRequest(socket, "gui/authenticate");
    sendJsonRpcResult(socket, authenticateRequest.id, result);

    expect(socket.sent.map(readRpcMethod)).toEqual(["gui/authenticate"]);
    expect(statuses.at(-1)).toEqual({
      label: "error",
      message: "gui/authenticate returned malformed result payload",
    });
    expect(socket.closed).toEqual([{ code: 1000, reason: "protocol error" }]);
  });

  it("accepts extra authenticate result fields and continues to initialize", () => {
    const result = { authenticated: true, extra: "allowed" };
    expect(validateGuiAuthenticateResult(result)).toBe(true);
    const statuses: string[] = [];
    const { socket } = startGuiHostConnectionWithSocket({
      attachResponse: attachBaseline,
      onStatus: (status) => {
        statuses.push(status.label);
      },
    });

    socket.onopen?.();
    const authenticateRequest = readLatestRpcRequest(socket, "gui/authenticate");
    sendJsonRpcResult(socket, authenticateRequest.id, result);

    expect(socket.sent.map(readRpcMethod)).toEqual(["gui/authenticate", "initialize"]);
    expect(statuses).toEqual(["connecting", "authenticated"]);
    expect(socket.closed).toEqual([]);
  });

  it("does not advance the handshake for an unmatched initialize response", () => {
    const statuses: string[] = [];
    const { socket } = startGuiHostConnectionWithSocket({
      attachResponse: attachBaseline,
      onStatus: (status) => {
        statuses.push(status.label);
      },
    });

    socket.onopen?.();
    socket.onmessage?.({
      data: JSON.stringify({ jsonrpc: "2.0", id: 2, result: {} }),
    });

    expect(socket.sent.map(readRpcMethod)).toEqual(["gui/authenticate"]);
    expect(statuses).toEqual(["connecting"]);
  });

  it("does not repeat initialize for a duplicate authenticate response", () => {
    const statuses: string[] = [];
    const { socket } = startGuiHostConnectionWithSocket({
      attachResponse: attachBaseline,
      onStatus: (status) => {
        statuses.push(status.label);
      },
    });

    socket.onopen?.();
    const authenticateRequest = readLatestRpcRequest(socket, "gui/authenticate");
    sendJsonRpcResult(socket, authenticateRequest.id, { authenticated: true });
    sendJsonRpcResult(socket, authenticateRequest.id, { authenticated: true });

    expect(socket.sent.map(readRpcMethod)).toEqual(["gui/authenticate", "initialize"]);
    expect(statuses).toEqual(["connecting", "authenticated"]);
  });

  it("does not repeat attach for a late initialize response", () => {
    const statuses: string[] = [];
    const { socket } = startGuiHostConnectionWithSocket({
      attachResponse: attachBaseline,
      onStatus: (status) => {
        statuses.push(status.label);
      },
    });

    socket.onopen?.();
    sendAuthenticateResult(socket);
    sendInitializeResult(socket);
    sendInitializeResult(socket);

    expect(socket.sent.map(readRpcMethod)).toEqual([
      "gui/authenticate",
      "initialize",
      "thread/projection/attach",
    ]);
    expect(statuses).toEqual(["connecting", "authenticated", "initialized"]);
  });

  it("orders projection attachment before attached status and command readiness", () => {
    const calls: string[] = [];
    const attachResponse = attachBaseline;
    const { socket } = startGuiHostConnectionWithSocket({
      attachResponse,
      onProjectionAttached: () => {
        calls.push("projection-attached");
      },
      onStatus: (status) => {
        calls.push(`status:${status.label}`);
      },
      onCommandsReady: () => {
        calls.push("commands-ready");
      },
    });

    socket.onopen?.();
    sendAuthenticateResult(socket);
    sendInitializeResult(socket);
    calls.length = 0;
    sendAttachResult(socket, attachResponse);

    expect(calls).toEqual(["projection-attached", "status:attached", "commands-ready"]);
  });

  it("forwards reasoning projection delta payloads", () => {
    const { summaries: statuses, onStatus } = recordStatusSummaries();
    const projectionDeltas: ThreadProjectionDeltaNotification[] = [];
    const attachResponse = attachBaseline;
    const reasoningDeltas = [
      eventReasoningSummaryTextDelta,
      eventReasoningSummaryPartAddedDelta,
      eventReasoningTextDelta,
    ];

    const { socket } = startGuiHostConnectionWithSocket({
      attachResponse,
      onStatus,
      onProjectionDelta: (notification) => {
        projectionDeltas.push(notification);
      },
    });

    socket.onopen?.();
    sendAuthenticateResult(socket);
    sendInitializeResult(socket);
    sendAttachResult(socket, attachResponse);

    for (const delta of reasoningDeltas) {
      socket.onmessage?.({
        data: JSON.stringify({
          jsonrpc: "2.0",
          method: "thread/projection/delta",
          params: delta,
        }),
      });
    }

    expect(projectionDeltas).toEqual(reasoningDeltas);
    expect(statuses.at(-1)).toEqual({ label: "attached", message: undefined });
  });

  it("reports malformed projection attach payloads without forwarding them", () => {
    const { summaries: statuses, onStatus } = recordStatusSummaries();
    const attached: ThreadProjectionAttachResponse[] = [];
    const attachResponse = attachBaseline;

    const { socket } = startGuiHostConnectionWithSocket({
      attachResponse,
      onStatus,
      onProjectionAttached: (response) => {
        attached.push(response);
      },
    });

    socket.onopen?.();
    sendAuthenticateResult(socket);
    sendInitializeResult(socket);
    const request = readLatestRpcRequest(socket, "thread/projection/attach");
    sendJsonRpcResult(socket, request.id, { subscriptionId: "sub-1" });

    expect(attached).toEqual([]);
    expect(statuses.at(-1)).toEqual({
      label: "error",
      message: "thread/projection/attach returned malformed result payload",
    });
    expect(socket.closed).toEqual([{ code: 1000, reason: "protocol error" }]);
  });

  it("reports malformed projection event payloads without forwarding them", () => {
    const { summaries: statuses, onStatus } = recordStatusSummaries();
    const projectionEvents: ThreadProjectionEventNotification[] = [];
    const attachResponse = attachBaseline;

    const { socket } = startGuiHostConnectionWithSocket({
      attachResponse,
      onStatus,
      onProjectionEvent: (notification) => {
        projectionEvents.push(notification);
      },
    });

    socket.onopen?.();
    sendAuthenticateResult(socket);
    sendInitializeResult(socket);
    sendAttachResult(socket, attachResponse);
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
    expect(socket.closed).toEqual([{ code: 1000, reason: "protocol error" }]);
  });

  it("reports malformed projection delta payloads without forwarding them", () => {
    const { summaries: statuses, onStatus } = recordStatusSummaries();
    const projectionDeltas: ThreadProjectionDeltaNotification[] = [];
    const attachResponse = attachBaseline;

    const { socket } = startGuiHostConnectionWithSocket({
      attachResponse,
      onStatus,
      onProjectionDelta: (notification) => {
        projectionDeltas.push(notification);
      },
    });

    socket.onopen?.();
    sendAuthenticateResult(socket);
    sendInitializeResult(socket);
    sendAttachResult(socket, attachResponse);
    socket.onmessage?.({
      data: JSON.stringify({
        jsonrpc: "2.0",
        method: "thread/projection/delta",
        params: {
          threadId: attachResponse.snapshot.thread.id,
          subscriptionId: attachResponse.subscriptionId,
          delta: {
            type: "agentMessage",
            notification: {
              threadId: attachResponse.snapshot.thread.id,
              turnId: "turn-1",
              itemId: "item-1",
            },
          },
        },
      }),
    });

    expect(projectionDeltas).toEqual([]);
    expect(statuses.at(-1)).toEqual({
      label: "error",
      message: "thread/projection/delta returned malformed params payload",
    });
    expect(socket.closed).toEqual([{ code: 1000, reason: "protocol error" }]);
  });

  it("reports malformed projection closed payloads without forwarding them", () => {
    const { summaries: statuses, onStatus } = recordStatusSummaries();
    const projectionClosedNotifications: ThreadProjectionClosedNotification[] = [];
    const attachResponse = attachBaseline;

    const { socket } = startGuiHostConnectionWithSocket({
      attachResponse,
      onStatus,
      onProjectionClosed: (notification) => {
        projectionClosedNotifications.push(notification);
      },
    });

    socket.onopen?.();
    sendAuthenticateResult(socket);
    sendInitializeResult(socket);
    sendAttachResult(socket, attachResponse);
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
    expect(socket.closed).toEqual([{ code: 1000, reason: "protocol error" }]);
  });
});
