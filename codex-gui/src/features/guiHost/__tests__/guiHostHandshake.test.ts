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
import { startGuiHostConnection, type GuiHostCommands } from "../guiHostClient";
import {
  MemoryStorage,
  RecordingWebSocket,
  recordStatusLabels,
  recordStatusSummaries,
  readLatestRpcRequest,
  readRpcMethod,
  sendAttachResult,
  sendAuthenticateResult,
  sendInitializeResult,
  sendJsonRpcResult,
  startGuiHostConnectionWithSocket,
} from "./guiHostClientTestSupport";

async function sendAuthenticationAndWaitForInitialize(socket: RecordingWebSocket): Promise<void> {
  sendAuthenticateResult(socket);
  await vi.waitFor(() => {
    expect(socket.sent.map(readRpcMethod)).toContain("initialize");
  });
}

async function sendInitializationAndWaitForAttach(socket: RecordingWebSocket): Promise<void> {
  sendInitializeResult(socket);
  await vi.waitFor(() => {
    expect(socket.sent.map(readRpcMethod)).toContain("thread/projection/attach");
  });
}

async function completeHandshake(
  socket: RecordingWebSocket,
  attachResponse: ThreadProjectionAttachResponse,
): Promise<void> {
  await sendAuthenticationAndWaitForInitialize(socket);
  await sendInitializationAndWaitForAttach(socket);
  sendAttachResult(socket, attachResponse);
  await Promise.resolve();
}

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
      createWebSocket: () => {
        calls.push("create-websocket");
        return socket as unknown as WebSocket;
      },
    });

    expect(calls).toEqual(["launch:thread-abc:secret", "create-websocket"]);
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

  it("ignores a duplicate authenticate response after the request is settled", async () => {
    const { labels, onStatus } = recordStatusLabels();
    const { socket } = startGuiHostConnectionWithSocket({
      attachResponse: attachBaseline,
      onStatus,
    });

    socket.onopen?.();
    const request = readLatestRpcRequest(socket, "gui/authenticate");
    sendJsonRpcResult(socket, request.id, { authenticated: true });
    await vi.waitFor(() => {
      expect(labels).toEqual(["connecting", "authenticated"]);
    });
    const sentAfterAuthentication = [...socket.sent];
    sendJsonRpcResult(socket, request.id, { authenticated: true });

    expect(socket.sent).toEqual(sentAfterAuthentication);
    expect(labels).toEqual(["connecting", "authenticated"]);
  });

  it("ignores initialize and attach responses before their requests exist", async () => {
    const { labels, onStatus } = recordStatusLabels();
    const attached = vi.fn<(response: ThreadProjectionAttachResponse) => void>();
    const commandsReady = vi.fn<(commands: GuiHostCommands) => void>();
    const { socket } = startGuiHostConnectionWithSocket({
      attachResponse: attachBaseline,
      onStatus,
      onProjectionAttached: attached,
      onCommandsReady: commandsReady,
    });

    socket.onopen?.();
    sendJsonRpcResult(socket, 2, {});
    sendJsonRpcResult(socket, 3, attachBaseline);

    expect(socket.sent.map(readRpcMethod)).toEqual(["gui/authenticate"]);
    expect(labels).toEqual(["connecting"]);
    expect(attached).not.toHaveBeenCalled();
    expect(commandsReady).not.toHaveBeenCalled();

    await sendAuthenticationAndWaitForInitialize(socket);
    await sendInitializationAndWaitForAttach(socket);
    sendAttachResult(socket, attachBaseline);
    await vi.waitFor(() => {
      expect(labels).toEqual(["connecting", "authenticated", "initialized", "attached"]);
    });
    expect(attached).toHaveBeenCalledWith(attachBaseline);
    expect(commandsReady).toHaveBeenCalledOnce();
  });

  it("sends authenticate, initialize, attach, and forwards projection payloads", async () => {
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
    await completeHandshake(socket, attachResponse);
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

  it("orders projection attachment before attached status and command readiness", async () => {
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
    await sendAuthenticationAndWaitForInitialize(socket);
    await sendInitializationAndWaitForAttach(socket);
    calls.length = 0;
    sendAttachResult(socket, attachResponse);
    await vi.waitFor(() => {
      expect(calls).toHaveLength(3);
    });

    expect(calls).toEqual(["projection-attached", "status:attached", "commands-ready"]);
  });

  it("forwards reasoning projection delta payloads", async () => {
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
    await completeHandshake(socket, attachResponse);

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

  it("reports malformed projection attach payloads without forwarding them", async () => {
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
    await sendAuthenticationAndWaitForInitialize(socket);
    await sendInitializationAndWaitForAttach(socket);
    const request = readLatestRpcRequest(socket, "thread/projection/attach");
    sendJsonRpcResult(socket, request.id, { subscriptionId: "sub-1" });

    await vi.waitFor(() => {
      expect(statuses.at(-1)?.label).toBe("error");
    });

    expect(attached).toEqual([]);
    expect(statuses.at(-1)).toEqual({
      label: "error",
      message: "thread/projection/attach returned malformed result payload",
    });
  });

  it("reports malformed projection event payloads without forwarding them", async () => {
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
    await completeHandshake(socket, attachResponse);
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

  it("reports malformed projection delta payloads without forwarding them", async () => {
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
    await completeHandshake(socket, attachResponse);
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

  it("reports malformed projection closed payloads without forwarding them", async () => {
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
    await completeHandshake(socket, attachResponse);
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
