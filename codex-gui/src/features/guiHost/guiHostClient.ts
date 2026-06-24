import type {
  ThreadProjectionAttachResponse,
  ThreadProjectionClosedNotification,
  ThreadProjectionEventNotification,
  TurnInterruptParams,
  TurnInterruptResponse,
  TurnStartParams,
  TurnStartResponse,
} from "@codex-protocol/v2";
import {
  formatRpcId,
  isThreadProjectionAttachResponse,
  isThreadProjectionClosedNotification,
  isThreadProjectionEventNotification,
  parseRpcMessage,
  type RpcMessage,
} from "./guiHostProtocol";

export type GuiHostStatus =
  | { label: "connecting"; eventCount: number; lastEventType: null }
  | { label: "authenticated"; eventCount: number; lastEventType: null }
  | { label: "initialized"; eventCount: number; lastEventType: null }
  | { label: "attached"; eventCount: number; lastEventType: null }
  | { label: "received event"; eventCount: number; lastEventType: string }
  | { label: "closed"; eventCount: number; lastEventType: null }
  | { label: "error"; eventCount: number; lastEventType: null; message: string };

export type LaunchParams = {
  threadId: string;
  token: string;
};

export type GuiHostCommands = {
  startTurn: (params: TurnStartParams) => Promise<TurnStartResponse>;
  interruptTurn: (params: TurnInterruptParams) => Promise<TurnInterruptResponse>;
};

export type StartGuiHostConnectionOptions = {
  location: URL;
  replaceState: History["replaceState"];
  tokenStorage?: Pick<Storage, "getItem" | "setItem">;
  createWebSocket?: (url: string) => WebSocket;
  onStatus?: (status: GuiHostStatus) => void;
  onLaunchParams?: (params: LaunchParams) => void;
  onProjectionAttached?: (response: ThreadProjectionAttachResponse) => void;
  onProjectionEvent?: (notification: ThreadProjectionEventNotification) => void;
  onProjectionClosed?: (notification: ThreadProjectionClosedNotification) => void;
  onCommandsReady?: (commands: GuiHostCommands) => void;
  onCommandsUnavailable?: () => void;
};

export type GuiHostConnectionCleanup = () => void;

const launchTokenStorageKey = "codex-gui.launchToken";

export function readLaunchParams(
  url: URL,
  tokenStorage?: Pick<Storage, "getItem" | "setItem">,
): LaunchParams {
  const threadId = url.searchParams.get("threadId");
  const fragmentToken = new URLSearchParams(url.hash.replace(/^#/, "")).get("token");

  if (!threadId) {
    throw new Error("Missing threadId query parameter");
  }

  if (fragmentToken) {
    try {
      tokenStorage?.setItem(launchTokenStorageKey, fragmentToken);
    } catch {
      // The fragment token is still valid for this connection if storage is unavailable.
    }
    return { threadId, token: fragmentToken };
  }

  const storedToken = tokenStorage?.getItem(launchTokenStorageKey);
  if (!storedToken) {
    throw new Error("Missing launch token fragment");
  }

  return { threadId, token: storedToken };
}

export function clearLaunchTokenFragment(
  location: URL,
  replaceState: History["replaceState"],
): void {
  replaceState(null, "", `${location.pathname}${location.search}`);
}

export function startGuiHostConnection({
  location,
  replaceState,
  tokenStorage,
  createWebSocket = (url) => new WebSocket(url),
  onStatus,
  onLaunchParams,
  onProjectionAttached,
  onProjectionEvent,
  onProjectionClosed,
  onCommandsReady,
  onCommandsUnavailable,
}: StartGuiHostConnectionOptions): GuiHostConnectionCleanup {
  clearLaunchTokenFragment(location, replaceState);
  const launchParams = readLaunchParams(location, tokenStorage ?? readSessionStorage());
  const { threadId, token } = launchParams;
  onLaunchParams?.(launchParams);

  const socket = createWebSocket(`${webSocketProtocol(location)}://${location.host}/ws`);
  let eventCount = 0;
  let terminalError = false;
  let closed = false;
  let nextRequestId = 1;
  const pendingRequests = new Map<number, PendingRequest>();
  let commandsReady = false;

  const emit = (status: GuiHostStatus): void => {
    if (closed) {
      return;
    }
    if (terminalError && status.label !== "error") {
      return;
    }
    if (status.label === "error") {
      terminalError = true;
    }
    onStatus?.(status);
  };

  emit({ label: "connecting", eventCount, lastEventType: null });

  const rejectPendingRequests = (reason: string): void => {
    const error = new Error(reason);
    for (const request of pendingRequests.values()) {
      request.reject(error);
    }
    pendingRequests.clear();

    if (commandsReady) {
      commandsReady = false;
      onCommandsUnavailable?.();
    }
  };

  const emitProtocolError = (message: string): void => {
    emit({
      label: "error",
      eventCount,
      lastEventType: null,
      message,
    });
    rejectPendingRequests("GUI host WebSocket is not available");
  };

  const failProtocolAndClose = (message: string, closeReason: string): void => {
    emitProtocolError(message);
    try {
      socket.close(1000, closeReason);
    } catch {
      // Ignore close races; the status above is already terminal.
    }
  };

  const request = <TResponse>(
    method: string,
    params: unknown,
    { terminalOnError }: { terminalOnError: boolean },
  ): Promise<TResponse> => {
    if (
      closed ||
      socket.readyState === WebSocket.CLOSING ||
      socket.readyState === WebSocket.CLOSED
    ) {
      return Promise.reject(new Error("GUI host WebSocket is not available"));
    }

    const id = nextRequestId;
    nextRequestId += 1;

    return new Promise<TResponse>((resolve, reject) => {
      pendingRequests.set(id, {
        terminalOnError,
        resolve: (result) => {
          resolve(result as TResponse);
        },
        reject,
      });
      try {
        sendRequest(socket, id, method, params);
      } catch (error) {
        pendingRequests.delete(id);
        reject(error instanceof Error ? error : new Error("GUI host WebSocket is not available"));
      }
    });
  };

  const commandRequest = <TResponse>(method: string, params: unknown): Promise<TResponse> => {
    if (!commandsReady) {
      return Promise.reject(new Error("GUI host WebSocket is not available"));
    }

    return request<TResponse>(method, params, { terminalOnError: false });
  };

  const commands: GuiHostCommands = {
    startTurn: (params) => commandRequest<TurnStartResponse>("turn/start", params),
    interruptTurn: (params) => commandRequest<TurnInterruptResponse>("turn/interrupt", params),
  };

  const startHandshakeRequest = (method: string, params: unknown): void => {
    void request(method, params, { terminalOnError: true }).catch(() => undefined);
  };

  socket.onopen = () => {
    startHandshakeRequest("gui/authenticate", { token });
  };

  socket.onerror = () => {
    rejectPendingRequests("GUI host WebSocket is not available");
    emit({
      label: "error",
      eventCount,
      lastEventType: null,
      message: "GUI host WebSocket failed",
    });
  };

  socket.onclose = (event) => {
    rejectPendingRequests("GUI host WebSocket is not available");
    if (event.code === 1000) {
      emit({ label: "closed", eventCount, lastEventType: null });
      return;
    }

    emit({
      label: "error",
      eventCount,
      lastEventType: null,
      message: `GUI host WebSocket closed (code=${String(event.code)}${event.reason ? `, reason=${event.reason}` : ""})`,
    });
  };

  socket.onmessage = (event) => {
    let message: RpcMessage;
    try {
      message = parseRpcMessage(event.data);
    } catch {
      failProtocolAndClose("Malformed JSON-RPC message", "invalid message");
      return;
    }

    if (typeof message.id === "number" && pendingRequests.has(message.id)) {
      const pending = pendingRequests.get(message.id);
      pendingRequests.delete(message.id);

      if (!pending) {
        return;
      }

      if (message.error) {
        const error = new Error(
          `JSON-RPC error (id=${String(message.id)}, code=${String(message.error.code)}): ${
            message.error.message ?? ""
          }`.trim(),
        );
        pending.reject(error);

        if (pending.terminalOnError) {
          failProtocolAndClose(error.message, "handshake error");
        }
        return;
      }

      pending.resolve(message.result ?? {});
      if (!pending.terminalOnError) {
        return;
      }
    }

    if (message.error) {
      failProtocolAndClose(
        `JSON-RPC error (id=${formatRpcId(message.id)}, code=${String(message.error.code)}): ${
          message.error.message ?? ""
        }`.trim(),
        "handshake error",
      );
      return;
    }

    if (message.id === 1 && message.result?.authenticated === true) {
      emit({ label: "authenticated", eventCount, lastEventType: null });
      startHandshakeRequest("initialize", {
        clientInfo: { name: "codex-gui", version: "0.0.0" },
        capabilities: {},
      });
      return;
    }

    if (message.id === 2) {
      if (!message.result) {
        failProtocolAndClose("initialize returned no result payload", "protocol error");
        return;
      }

      emit({ label: "initialized", eventCount, lastEventType: null });
      startHandshakeRequest("thread/projection/attach", { threadId });
      return;
    }

    if (message.id === 3) {
      if (!message.result) {
        failProtocolAndClose(
          "thread/projection/attach returned no result payload",
          "protocol error",
        );
        return;
      }

      if (!isThreadProjectionAttachResponse(message.result)) {
        failProtocolAndClose(
          "thread/projection/attach returned malformed result payload",
          "protocol error",
        );
        return;
      }

      onProjectionAttached?.(message.result);
      emit({ label: "attached", eventCount, lastEventType: null });
      commandsReady = true;
      onCommandsReady?.(commands);
      return;
    }

    if (message.method === "thread/projection/event") {
      if (!isThreadProjectionEventNotification(message.params)) {
        failProtocolAndClose(
          "thread/projection/event returned malformed params payload",
          "protocol error",
        );
        return;
      }

      const notification = message.params;
      eventCount += 1;
      onProjectionEvent?.(notification);
      emit({
        label: "received event",
        eventCount,
        lastEventType: notification.event.type,
      });
    }

    if (message.method === "thread/projection/closed") {
      if (!isThreadProjectionClosedNotification(message.params)) {
        failProtocolAndClose(
          "thread/projection/closed returned malformed params payload",
          "protocol error",
        );
        return;
      }

      const notification = message.params;
      eventCount += 1;
      onProjectionClosed?.(notification);
      emit({
        label: "received event",
        eventCount,
        lastEventType: "projectionClosed",
      });
    }
  };

  return () => {
    if (closed) {
      return;
    }

    closed = true;
    rejectPendingRequests("GUI host WebSocket is not available");
    socket.onopen = null;
    socket.onerror = null;
    socket.onclose = null;
    socket.onmessage = null;

    try {
      socket.close(1000, "cleanup");
    } catch {
      // The browser may reject close if the socket is already gone.
    }
  };
}

type PendingRequest = {
  terminalOnError: boolean;
  resolve: (result: Record<string, unknown>) => void;
  reject: (error: Error) => void;
};

function webSocketProtocol(location: URL): "ws" | "wss" {
  return location.protocol === "https:" ? "wss" : "ws";
}

function sendRequest(socket: WebSocket, id: number, method: string, params: unknown): void {
  socket.send(JSON.stringify({ jsonrpc: "2.0", id, method, params }));
}

function readSessionStorage(): Pick<Storage, "getItem" | "setItem"> | undefined {
  try {
    return globalThis.sessionStorage;
  } catch {
    return undefined;
  }
}
