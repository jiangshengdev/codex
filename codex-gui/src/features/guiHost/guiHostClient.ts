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

      emit({ label: "attached", eventCount, lastEventType: null });
      return;
    }

    if (message.method === "thread/projection/event") {
      eventCount += 1;
      emit({
        label: "received event",
        eventCount,
        lastEventType: message.params?.event?.type ?? "unknown",
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
  result?: {
    authenticated?: boolean;
  };
  error?: {
    code: number;
    message?: string;
  };
  params?: {
    event?: {
      type?: string;
    };
  };
};

function parseRpcMessage(data: unknown): RpcMessage {
  const parsed: unknown = JSON.parse(String(data));
  if (!isRecord(parsed)) {
    return {};
  }

  const message: RpcMessage = {
    id: parsed.id,
    method: typeof parsed.method === "string" ? parsed.method : undefined,
    result: isRecord(parsed.result)
      ? {
          authenticated:
            typeof parsed.result.authenticated === "boolean"
              ? parsed.result.authenticated
              : undefined,
        }
      : undefined,
    error: parseRpcError(parsed.error),
    params: parseProjectionParams(parsed.params),
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

function parseProjectionParams(value: unknown): RpcMessage["params"] {
  if (!isRecord(value) || !isRecord(value.event)) {
    return undefined;
  }

  return {
    event: {
      type: typeof value.event.type === "string" ? value.event.type : undefined,
    },
  };
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
