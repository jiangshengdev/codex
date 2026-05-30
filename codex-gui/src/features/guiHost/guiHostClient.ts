import type {
  ThreadProjectionAttachResponse,
  ThreadProjectionEventNotification,
} from "@codex-protocol/v2";

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

export type StartGuiHostConnectionOptions = {
  location: URL;
  replaceState: History["replaceState"];
  tokenStorage?: Pick<Storage, "getItem" | "setItem">;
  createWebSocket?: (url: string) => WebSocket;
  onStatus?: (status: GuiHostStatus) => void;
  onProjectionAttached?: (response: ThreadProjectionAttachResponse) => void;
  onProjectionEvent?: (notification: ThreadProjectionEventNotification) => void;
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
  onProjectionAttached,
  onProjectionEvent,
}: StartGuiHostConnectionOptions): GuiHostConnectionCleanup {
  clearLaunchTokenFragment(location, replaceState);
  const { threadId, token } = readLaunchParams(location, tokenStorage ?? readSessionStorage());

  const socket = createWebSocket(`${webSocketProtocol(location)}://${location.host}/ws`);
  let eventCount = 0;
  let terminalError = false;
  let closed = false;

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

  socket.onopen = () => {
    sendRequest(socket, 1, "gui/authenticate", { token });
  };

  socket.onerror = () => {
    emit({
      label: "error",
      eventCount,
      lastEventType: null,
      message: "GUI host WebSocket failed",
    });
  };

  socket.onclose = (event) => {
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
      emit({
        label: "error",
        eventCount,
        lastEventType: null,
        message: "Malformed JSON-RPC message",
      });
      try {
        socket.close(1000, "invalid message");
      } catch {
        // Ignore close races; the status above is already terminal.
      }
      return;
    }

    if (message.error) {
      emit({
        label: "error",
        eventCount,
        lastEventType: null,
        message:
          `JSON-RPC error (id=${formatRpcId(message.id)}, code=${String(message.error.code)}): ${
            message.error.message ?? ""
          }`.trim(),
      });
      try {
        socket.close(1000, "handshake error");
      } catch {
        // Ignore close races; the status above is already terminal.
      }
      return;
    }

    if (message.id === 1 && message.result?.authenticated === true) {
      emit({ label: "authenticated", eventCount, lastEventType: null });
      sendRequest(socket, 2, "initialize", {
        clientInfo: { name: "codex-gui", version: "0.0.0" },
        capabilities: {},
      });
      return;
    }

    if (message.id === 2) {
      if (!message.result) {
        emit({
          label: "error",
          eventCount,
          lastEventType: null,
          message: "initialize returned no result payload",
        });
        return;
      }

      emit({ label: "initialized", eventCount, lastEventType: null });
      sendRequest(socket, 3, "thread/projection/attach", { threadId });
      return;
    }

    if (message.id === 3) {
      if (!message.result) {
        emit({
          label: "error",
          eventCount,
          lastEventType: null,
          message: "thread/projection/attach returned no result payload",
        });
        return;
      }

      if (!isThreadProjectionAttachResponse(message.result)) {
        emit({
          label: "error",
          eventCount,
          lastEventType: null,
          message: "thread/projection/attach returned malformed result payload",
        });
        return;
      }

      onProjectionAttached?.(message.result);
      emit({ label: "attached", eventCount, lastEventType: null });
      return;
    }

    if (message.method === "thread/projection/event") {
      if (!isThreadProjectionEventNotification(message.params)) {
        emit({
          label: "error",
          eventCount,
          lastEventType: null,
          message: "thread/projection/event returned malformed params payload",
        });
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
  };

  return () => {
    if (closed) {
      return;
    }

    closed = true;
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

type RpcMessage = {
  id?: unknown;
  method?: string;
  result?: Record<string, unknown>;
  error?: {
    code: number;
    message?: string;
  };
  params?: Record<string, unknown>;
};

function parseRpcMessage(data: unknown): RpcMessage {
  const parsed: unknown = JSON.parse(String(data));
  if (!isRecord(parsed)) {
    return {};
  }

  const message: RpcMessage = {
    id: parsed.id,
    method: typeof parsed.method === "string" ? parsed.method : undefined,
    result: isRecord(parsed.result) ? parsed.result : undefined,
    error: parseRpcError(parsed.error),
    params: isRecord(parsed.params) ? parsed.params : undefined,
  };

  return message;
}

function parseRpcError(value: unknown): RpcMessage["error"] {
  if (!isRecord(value) || typeof value.code !== "number") {
    return undefined;
  }

  return {
    code: value.code,
    message: typeof value.message === "string" ? value.message : undefined,
  };
}

function isThreadProjectionAttachResponse(
  value: unknown,
): value is ThreadProjectionAttachResponse {
  if (!isRecord(value) || typeof value.subscriptionId !== "string") {
    return false;
  }

  const snapshot = value.snapshot;
  if (!isRecord(snapshot)) {
    return false;
  }

  const thread = snapshot.thread;
  return (
    isRecord(thread) &&
    typeof thread.id === "string" &&
    Array.isArray(thread.turns) &&
    (typeof snapshot.headCommitId === "string" || snapshot.headCommitId === null)
  );
}

function isThreadProjectionEventNotification(
  value: unknown,
): value is ThreadProjectionEventNotification {
  if (
    !isRecord(value) ||
    typeof value.threadId !== "string" ||
    typeof value.subscriptionId !== "string" ||
    typeof value.commitId !== "string" ||
    (typeof value.parentCommitId !== "string" && value.parentCommitId !== null)
  ) {
    return false;
  }

  const event = value.event;
  return isThreadProjectionEvent(event);
}

function isThreadProjectionEvent(value: unknown): boolean {
  if (!isRecord(value) || typeof value.type !== "string" || !isRecord(value.notification)) {
    return false;
  }

  switch (value.type) {
    case "turnStarted":
    case "turnCompleted":
      return isTurnProjectionNotification(value.notification);
    case "itemStarted":
      return isItemProjectionNotification(value.notification, "startedAtMs");
    case "itemCompleted":
      return isItemProjectionNotification(value.notification, "completedAtMs");
    default:
      return false;
  }
}

function isTurnProjectionNotification(value: Record<string, unknown>): boolean {
  return typeof value.threadId === "string" && isProjectionTurn(value.turn);
}

function isItemProjectionNotification(
  value: Record<string, unknown>,
  timestampField: "startedAtMs" | "completedAtMs",
): boolean {
  return (
    typeof value.threadId === "string" &&
    typeof value.turnId === "string" &&
    typeof value[timestampField] === "number" &&
    isProjectionItem(value.item)
  );
}

function isProjectionTurn(value: unknown): boolean {
  return isRecord(value) && typeof value.id === "string" && Array.isArray(value.items);
}

function isProjectionItem(value: unknown): boolean {
  return isRecord(value) && typeof value.id === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function formatRpcId(value: unknown): string {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return "-";
}

function webSocketProtocol(location: URL): "ws" | "wss" {
  return location.protocol === "https:" ? "wss" : "ws";
}

function sendRequest(
  socket: WebSocket,
  id: number,
  method: string,
  params: Record<string, unknown>,
): void {
  socket.send(JSON.stringify({ jsonrpc: "2.0", id, method, params }));
}

function readSessionStorage(): Pick<Storage, "getItem" | "setItem"> | undefined {
  try {
    return globalThis.sessionStorage;
  } catch {
    return undefined;
  }
}
