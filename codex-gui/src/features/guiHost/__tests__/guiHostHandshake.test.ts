import { describe, expect, it } from "vitest";
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
  SkillsChangedNotification,
  ThreadProjectionClosedNotification,
  ThreadProjectionDeltaNotification,
  ThreadProjectionEventNotification,
} from "@codex-protocol/v2";
import { validateGuiAuthenticateResult } from "@/generated/guiHostContract";
import { startGuiHostConnection, type GuiHostCommands } from "../guiHostClient";
import {
  RecordingWebSocket,
  recordStatusSummaries,
  readLatestRpcRequest,
  readRpcMethod,
  sendAuthenticateResult,
  sendInitializeResult,
  sendJsonRpcResult,
  startGuiHostConnectionWithSocket,
} from "./guiHostClientTestSupport";

describe("guiHostClient handshake", () => {
  it("propagates a WebSocket factory error before connecting", () => {
    const socketError = new Error("WebSocket factory failed");
    const calls: string[] = [];
    let thrown: unknown;

    try {
      startGuiHostConnection({
        location: new URL("http://127.0.0.1:4567/task/thread-abc"),
        token: "secret",
        createWebSocket: () => {
          calls.push("create-websocket");
          throw socketError;
        },
        onStatus: (status) => {
          calls.push(`status:${status.label}`);
        },
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBe(socketError);
    expect(calls).toEqual(["create-websocket"]);
  });

  it("sends only authenticate and initialize before publishing commands and forwarding projection payloads", () => {
    const socket = new RecordingWebSocket();
    const statuses: string[] = [];
    const commandsReady: string[] = [];
    const projectionEvents: ThreadProjectionEventNotification[] = [];
    const projectionDeltas: ThreadProjectionDeltaNotification[] = [];
    const projectionClosedNotifications: ThreadProjectionClosedNotification[] = [];
    const projectionEvent = eventTurnStarted;
    const projectionDelta = eventAgentMessageDelta;
    const projectionClosed = closedBackpressure;

    startGuiHostConnection({
      location: new URL("http://127.0.0.1:4567/task/thread-abc"),
      token: "secret",
      createWebSocket: () => socket as unknown as WebSocket,
      onStatus: (status) => {
        statuses.push(status.label);
      },
      onCommandsReady: () => {
        commandsReady.push("ready");
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

    expect(socket.sent.map(readRpcMethod)).toEqual(["gui/authenticate", "initialize"]);
    expect(statuses).toEqual(["connecting", "authenticated", "initialized"]);
    expect(commandsReady).toEqual(["ready"]);
    expect(projectionEvents).toEqual([projectionEvent]);
    expect(projectionDeltas).toEqual([projectionDelta]);
    expect(projectionClosedNotifications).toEqual([projectionClosed]);
  });

  it("keeps a missing initialize result terminal without publishing commands", () => {
    const { summaries: statuses, onStatus } = recordStatusSummaries();
    const { socket } = startGuiHostConnectionWithSocket({ onStatus });

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
    const { socket } = startGuiHostConnectionWithSocket({ onStatus });

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
    const { socket } = startGuiHostConnectionWithSocket({ onStatus });

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

  it("does not publish commands twice for a late initialize response", () => {
    const statuses: string[] = [];
    const commandsReady: string[] = [];
    const { socket } = startGuiHostConnectionWithSocket({
      onStatus: (status) => {
        statuses.push(status.label);
      },
      onCommandsReady: () => {
        commandsReady.push("ready");
      },
    });

    socket.onopen?.();
    sendAuthenticateResult(socket);
    sendInitializeResult(socket);
    sendInitializeResult(socket);

    expect(socket.sent.map(readRpcMethod)).toEqual(["gui/authenticate", "initialize"]);
    expect(statuses).toEqual(["connecting", "authenticated", "initialized"]);
    expect(commandsReady).toEqual(["ready"]);
  });

  it("orders initialized status before command readiness", () => {
    const calls: string[] = [];
    const { socket } = startGuiHostConnectionWithSocket({
      onStatus: (status) => {
        calls.push(`status:${status.label}`);
      },
      onCommandsReady: () => {
        calls.push("commands-ready");
      },
    });

    socket.onopen?.();
    sendAuthenticateResult(socket);
    calls.length = 0;
    sendInitializeResult(socket);

    expect(calls).toEqual(["status:initialized", "commands-ready"]);
  });

  it("forwards reasoning projection delta payloads", () => {
    const { summaries: statuses, onStatus } = recordStatusSummaries();
    const projectionDeltas: ThreadProjectionDeltaNotification[] = [];
    const reasoningDeltas = [
      eventReasoningSummaryTextDelta,
      eventReasoningSummaryPartAddedDelta,
      eventReasoningTextDelta,
    ];

    const { socket } = startGuiHostConnectionWithSocket({
      onStatus,
      onProjectionDelta: (notification) => {
        projectionDeltas.push(notification);
      },
    });

    socket.onopen?.();
    sendAuthenticateResult(socket);
    sendInitializeResult(socket);

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
    expect(statuses.at(-1)).toEqual({ label: "initialized", message: undefined });
  });

  it("forwards skills/changed notifications", () => {
    const { summaries: statuses, onStatus } = recordStatusSummaries();
    const notifications: SkillsChangedNotification[] = [];
    const socket = new RecordingWebSocket();
    startGuiHostConnection({
      location: new URL("http://127.0.0.1:4567/task/thread-abc"),
      token: "secret",
      createWebSocket: () => socket as unknown as WebSocket,
      onStatus,
      onSkillsChanged: (notification) => {
        notifications.push(notification);
      },
    });

    socket.onopen?.();
    sendAuthenticateResult(socket);
    sendInitializeResult(socket);
    socket.onmessage?.({
      data: JSON.stringify({
        jsonrpc: "2.0",
        method: "skills/changed",
        params: {},
      }),
    });

    expect(notifications).toEqual([{}]);
    expect(statuses.at(-1)).toEqual({ label: "initialized", message: undefined });
    expect(socket.closed).toEqual([]);
  });

  it("ignores a known unconsumed notification without validating its params", () => {
    const { summaries: statuses, onStatus } = recordStatusSummaries();
    const projectionCallbacks: string[] = [];
    const { socket } = startGuiHostConnectionWithSocket({
      onStatus,
      onProjectionEvent: () => {
        projectionCallbacks.push("event");
      },
      onProjectionDelta: () => {
        projectionCallbacks.push("delta");
      },
      onProjectionClosed: () => {
        projectionCallbacks.push("closed");
      },
    });

    socket.onopen?.();
    sendAuthenticateResult(socket);
    sendInitializeResult(socket);
    projectionCallbacks.length = 0;
    const statusesBeforeNotification = [...statuses];

    socket.onmessage?.({
      data: JSON.stringify({
        jsonrpc: "2.0",
        method: "thread/started",
        params: {},
      }),
    });

    expect(projectionCallbacks).toEqual([]);
    expect(statuses).toEqual(statusesBeforeNotification);
    expect(statuses.at(-1)).toEqual({ label: "initialized", message: undefined });
    expect(socket.closed).toEqual([]);
  });

  it("rejects a malformed explicit projection attach response without closing the socket", async () => {
    const { summaries: statuses, onStatus } = recordStatusSummaries();
    let commands: GuiHostCommands | undefined;

    const { socket } = startGuiHostConnectionWithSocket({
      onStatus,
      onCommandsReady: (readyCommands) => {
        commands = readyCommands;
      },
    });

    socket.onopen?.();
    sendAuthenticateResult(socket);
    sendInitializeResult(socket);
    if (!commands) {
      throw new Error("Expected commands to be ready");
    }
    const promise = commands.attachThreadProjection({
      threadId: attachBaseline.snapshot.thread.id,
    });
    const request = readLatestRpcRequest(socket, "thread/projection/attach");
    sendJsonRpcResult(socket, request.id, { subscriptionId: "sub-1" });

    await expect(promise).rejects.toThrow(
      "thread/projection/attach returned malformed result payload",
    );
    expect(statuses.at(-1)).toEqual({ label: "initialized", message: undefined });
    expect(socket.closed).toEqual([]);
  });

  it("reports malformed projection event payloads without forwarding them", () => {
    const { summaries: statuses, onStatus } = recordStatusSummaries();
    const projectionEvents: ThreadProjectionEventNotification[] = [];
    const attachResponse = attachBaseline;

    const { socket } = startGuiHostConnectionWithSocket({
      onStatus,
      onProjectionEvent: (notification) => {
        projectionEvents.push(notification);
      },
    });

    socket.onopen?.();
    sendAuthenticateResult(socket);
    sendInitializeResult(socket);
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

  it("reports malformed skills/changed payloads without forwarding them", () => {
    const { summaries: statuses, onStatus } = recordStatusSummaries();
    const notifications: SkillsChangedNotification[] = [];
    const socket = new RecordingWebSocket();
    startGuiHostConnection({
      location: new URL("http://127.0.0.1:4567/task/thread-abc"),
      token: "secret",
      createWebSocket: () => socket as unknown as WebSocket,
      onStatus,
      onSkillsChanged: (notification) => {
        notifications.push(notification);
      },
    });

    socket.onopen?.();
    sendAuthenticateResult(socket);
    sendInitializeResult(socket);
    socket.onmessage?.({
      data: JSON.stringify({
        jsonrpc: "2.0",
        method: "skills/changed",
        params: null,
      }),
    });

    expect(notifications).toEqual([]);
    expect(statuses.at(-1)).toEqual({
      label: "error",
      message: "skills/changed returned malformed params payload",
    });
    expect(socket.closed).toEqual([{ code: 1000, reason: "protocol error" }]);
  });

  it("reports malformed projection delta payloads without forwarding them", () => {
    const { summaries: statuses, onStatus } = recordStatusSummaries();
    const projectionDeltas: ThreadProjectionDeltaNotification[] = [];
    const attachResponse = attachBaseline;

    const { socket } = startGuiHostConnectionWithSocket({
      onStatus,
      onProjectionDelta: (notification) => {
        projectionDeltas.push(notification);
      },
    });

    socket.onopen?.();
    sendAuthenticateResult(socket);
    sendInitializeResult(socket);
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
      onStatus,
      onProjectionClosed: (notification) => {
        projectionClosedNotifications.push(notification);
      },
    });

    socket.onopen?.();
    sendAuthenticateResult(socket);
    sendInitializeResult(socket);
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
