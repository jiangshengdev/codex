import { describe, expect, it, vi } from "vitest";
import {
  attachBaseline,
  closedBackpressure,
  eventAgentMessageDelta,
  eventTurnStarted,
} from "@/features/projection/__tests__/projectionFixtures";
import type {
  ThreadProjectionAttachResponse,
  ThreadProjectionClosedNotification,
  ThreadProjectionDeltaNotification,
  ThreadProjectionEventNotification,
} from "@codex-protocol/v2";
import { startGuiHostConnection, type LaunchParams } from "../guiHostClient";
import {
  MemoryStorage,
  RecordingWebSocket,
  recordStatusSummaries,
  readRpcMethod,
  sendAttachResult,
  sendAuthenticateResult,
  sendInitializeResult,
  sendJsonRpcResult,
  startGuiHostConnectionWithSocket,
} from "./guiHostClientTestSupport";

describe("guiHostClient handshake", () => {
  it("sends authenticate, initialize, attach, and forwards projection payloads", () => {
    const socket = new RecordingWebSocket();
    const statuses: string[] = [];
    const attached: ThreadProjectionAttachResponse[] = [];
    const projectionEvents: ThreadProjectionEventNotification[] = [];
    const projectionDeltas: ThreadProjectionDeltaNotification[] = [];
    const projectionClosedNotifications: ThreadProjectionClosedNotification[] = [];
    const launchParams: LaunchParams[] = [];
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
    sendJsonRpcResult(socket, 3, { subscriptionId: "sub-1" });

    expect(attached).toEqual([]);
    expect(statuses.at(-1)).toEqual({
      label: "error",
      message: "thread/projection/attach returned malformed result payload",
    });
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
  });
});
