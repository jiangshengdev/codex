import type {
  ThreadProjectionClosedNotification,
  ThreadProjectionDeltaNotification,
  ThreadProjectionEventNotification,
} from "@codex-protocol/v2";
import type { ServerNotification } from "@codex-protocol/ServerNotification";
import type { JSONRPCMessage } from "@codex-protocol/JSONRPCMessage";
import {
  AUTHENTICATE_METHOD,
  WEBSOCKET_PATH,
  type GuiAuthenticateParams,
  type GuiAuthenticateResult,
} from "@codex-gui-host-contract";
import {
  consumeBrowserLaunchParams,
  type BrowserLaunchParams,
} from "@/features/browserLaunch/browserLaunchParams";
import {
  requestDescriptors,
  validateServerNotification,
  validatorRegistry,
} from "@/generated/appServerProtocol";
import { validateGuiAuthenticateResult } from "@/generated/guiHostContract";
import type { RequestParams, RequestResponse } from "./appServerProtocol";
import { parseRpcMessage } from "./guiHostProtocol";

export type GuiHostStatus =
  | { label: "connecting" }
  | { label: "authenticated" }
  | { label: "initialized" }
  | { label: "attached" }
  | { label: "closed" }
  | { label: "error"; message: string };

export type GuiHostCommands = {
  startTurn: (params: RequestParams<"turn/start">) => Promise<RequestResponse<"turn/start">>;
  interruptTurn: (
    params: RequestParams<"turn/interrupt">,
  ) => Promise<RequestResponse<"turn/interrupt">>;
};

export type StartGuiHostConnectionOptions = {
  location: URL;
  replaceState: History["replaceState"];
  tokenStorage?: Pick<Storage, "getItem" | "setItem">;
  createWebSocket?: (url: string) => WebSocket;
  onStatus?: (status: GuiHostStatus) => void;
  onLaunchParams?: (params: BrowserLaunchParams) => void;
  onProjectionAttached?: (response: RequestResponse<"thread/projection/attach">) => void;
  onProjectionDelta?: (notification: ThreadProjectionDeltaNotification) => void;
  onProjectionEvent?: (notification: ThreadProjectionEventNotification) => void;
  onProjectionClosed?: (notification: ThreadProjectionClosedNotification) => void;
  onCommandsReady?: (commands: GuiHostCommands) => void;
  onCommandsUnavailable?: () => void;
};

export type GuiHostConnectionCleanup = () => void;

export function startGuiHostConnection({
  location,
  replaceState,
  tokenStorage,
  createWebSocket = (url) => new WebSocket(url),
  onStatus,
  onLaunchParams,
  onProjectionAttached,
  onProjectionDelta,
  onProjectionEvent,
  onProjectionClosed,
  onCommandsReady,
  onCommandsUnavailable,
}: StartGuiHostConnectionOptions): GuiHostConnectionCleanup {
  const launchParams = consumeBrowserLaunchParams({
    location,
    replaceState,
    tokenStorage,
  });
  const { threadId, token } = launchParams;
  onLaunchParams?.(launchParams);

  const socket = createWebSocket(
    `${webSocketProtocol(location)}://${location.host}${WEBSOCKET_PATH}`,
  );
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

  emit({ label: "connecting" });

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

  const request = <M extends GuiRequestMethod>(
    descriptor: RequestDescriptor<M>,
    params: RequestParams<M>,
    { terminalOnError, onValidatedResult }: RequestOptions<M>,
  ): Promise<RequestResponse<M>> => {
    if (
      closed ||
      socket.readyState === WebSocket.CLOSING ||
      socket.readyState === WebSocket.CLOSED
    ) {
      return Promise.reject(new Error("GUI host WebSocket is not available"));
    }

    const id = nextRequestId;
    nextRequestId += 1;

    const resultPromise = new Promise<() => RequestResponse<M>>((resolve, reject) => {
      pendingRequests.set(id, {
        terminalOnError,
        settleResult: (hasResult, result) => {
          if (!hasResult) {
            const error = new Error(`${descriptor.method} returned no result payload`);
            reject(error);
            return error.message;
          }
          if (!validateDescriptorResponse(descriptor, result)) {
            const error = new Error(`${descriptor.method} returned malformed result payload`);
            reject(error);
            return error.message;
          }

          resolve(() => result);
          onValidatedResult?.(result);
          return undefined;
        },
        reject,
      });
      try {
        sendRequest(socket, id, descriptor.method, params);
      } catch (error) {
        pendingRequests.delete(id);
        reject(error instanceof Error ? error : new Error("GUI host WebSocket is not available"));
      }
    });
    return readValidatedResult(resultPromise);
  };

  const withReadyCommands = <T>(startRequest: () => Promise<T>): Promise<T> => {
    if (!commandsReady) {
      return Promise.reject(new Error("GUI host WebSocket is not available"));
    }

    return startRequest();
  };

  const commands: GuiHostCommands = {
    startTurn: (params) =>
      withReadyCommands(() =>
        request<"turn/start">(requestDescriptors["turn/start"], params, {
          terminalOnError: false,
        }),
      ),
    interruptTurn: (params) =>
      withReadyCommands(() =>
        request<"turn/interrupt">(requestDescriptors["turn/interrupt"], params, {
          terminalOnError: false,
        }),
      ),
  };

  const startHandshakeRequest = <M extends GuiRequestMethod>(
    descriptor: RequestDescriptor<M>,
    params: RequestParams<M>,
    onValidatedResult: (result: RequestResponse<M>) => void,
  ): void => {
    void request(descriptor, params, { terminalOnError: true, onValidatedResult }).catch(
      () => undefined,
    );
  };

  const startAuthenticationRequest = (): void => {
    if (
      closed ||
      socket.readyState === WebSocket.CLOSING ||
      socket.readyState === WebSocket.CLOSED
    ) {
      return;
    }

    const id = nextRequestId;
    nextRequestId += 1;
    const params: GuiAuthenticateParams = { token };
    pendingRequests.set(id, {
      terminalOnError: true,
      settleResult: (hasResult, result) => {
        const malformedResultError = new Error(
          `${AUTHENTICATE_METHOD} returned malformed result payload`,
        );
        if (!hasResult || !validateGuiAuthenticateResult(result)) {
          return malformedResultError.message;
        }

        const authenticateResult: GuiAuthenticateResult = result;
        if (!authenticateResult.authenticated) {
          return malformedResultError.message;
        }

        emit({ label: "authenticated" });
        startHandshakeRequest<"initialize">(
          requestDescriptors.initialize,
          {
            clientInfo: { name: "codex-gui", title: null, version: "0.0.0" },
            capabilities: null,
          },
          () => {
            emit({ label: "initialized" });
            startHandshakeRequest<"thread/projection/attach">(
              requestDescriptors["thread/projection/attach"],
              { threadId },
              (response) => {
                onProjectionAttached?.(response);
                emit({ label: "attached" });
                commandsReady = true;
                onCommandsReady?.(commands);
              },
            );
          },
        );
        return undefined;
      },
      reject: () => undefined,
    });

    try {
      sendRequest(socket, id, AUTHENTICATE_METHOD, params);
    } catch {
      pendingRequests.delete(id);
    }
  };

  socket.onopen = () => {
    startAuthenticationRequest();
  };

  socket.onerror = () => {
    rejectPendingRequests("GUI host WebSocket is not available");
    emit({
      label: "error",
      message: "GUI host WebSocket failed",
    });
  };

  socket.onclose = (event) => {
    rejectPendingRequests("GUI host WebSocket is not available");
    if (event.code === 1000) {
      emit({ label: "closed" });
      return;
    }

    emit({
      label: "error",
      message: `GUI host WebSocket closed (code=${String(event.code)}${event.reason ? `, reason=${event.reason}` : ""})`,
    });
  };

  const settlePendingResult = (id: JsonRpcResponse["id"], result: unknown): void => {
    if (typeof id !== "number") {
      return;
    }

    const pending = pendingRequests.get(id);
    if (!pending) {
      return;
    }
    pendingRequests.delete(id);

    const resultError = pending.settleResult(true, result);
    if (resultError && pending.terminalOnError) {
      failProtocolAndClose(resultError, "protocol error");
    }
  };

  const settlePendingError = (
    id: JsonRpcErrorResponse["id"],
    rpcError: JsonRpcErrorResponse["error"],
  ): void => {
    const error = new Error(
      `JSON-RPC error (id=${String(id)}, code=${String(rpcError.code)}): ${rpcError.message}`.trim(),
    );
    if (typeof id !== "number") {
      failProtocolAndClose(error.message, "handshake error");
      return;
    }

    const pending = pendingRequests.get(id);
    if (!pending) {
      return;
    }
    pendingRequests.delete(id);
    pending.reject(error);

    if (pending.terminalOnError) {
      failProtocolAndClose(error.message, "handshake error");
    }
  };

  socket.onmessage = (event) => {
    let parsedMessage: unknown;
    try {
      parsedMessage = parseRpcMessage(event.data);
    } catch {
      failProtocolAndClose("Malformed JSON-RPC message", "invalid message");
      return;
    }

    if (!validatorRegistry.JSONRPCMessage(parsedMessage)) {
      if (
        typeof parsedMessage === "object" &&
        parsedMessage !== null &&
        !Array.isArray(parsedMessage) &&
        "id" in parsedMessage &&
        typeof parsedMessage.id === "number" &&
        !("result" in parsedMessage) &&
        !("error" in parsedMessage)
      ) {
        const pending = pendingRequests.get(parsedMessage.id);
        if (pending) {
          pendingRequests.delete(parsedMessage.id);
          const resultError = pending.settleResult(false, undefined);
          if (resultError && pending.terminalOnError) {
            failProtocolAndClose(resultError, "protocol error");
          }
          return;
        }
      }

      failProtocolAndClose("Malformed JSON-RPC message", "invalid message");
      return;
    }

    const message: JSONRPCMessage = parsedMessage;
    if ("result" in message) {
      settlePendingResult(message.id, message.result);
      return;
    }
    if ("error" in message) {
      settlePendingError(message.id, message.error);
      return;
    }
    if ("id" in message) {
      return;
    }

    if (!validateServerNotification(message)) {
      if (message.method.startsWith("thread/projection/")) {
        failProtocolAndClose(
          `${message.method} returned malformed params payload`,
          "protocol error",
        );
      }
      return;
    }
    if (!isProjectionServerNotification(message)) {
      return;
    }

    switch (message.method) {
      case "thread/projection/event":
        onProjectionEvent?.(message.params);
        return;
      case "thread/projection/delta":
        onProjectionDelta?.(message.params);
        return;
      case "thread/projection/closed":
        onProjectionClosed?.(message.params);
        return;
      default:
        message satisfies never;
        return;
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
  settleResult: (hasResult: boolean, result: unknown) => string | undefined;
  reject: (error: Error) => void;
};

type GuiRequestMethod = keyof typeof requestDescriptors;

type RequestDescriptor<M extends GuiRequestMethod> = (typeof requestDescriptors)[M];

type RequestOptions<M extends GuiRequestMethod> = {
  terminalOnError: boolean;
  onValidatedResult?: (result: RequestResponse<M>) => void;
};

type ProjectionServerNotification = Extract<
  ServerNotification,
  { method: `thread/projection/${string}` }
>;

type JsonRpcResponse = Extract<JSONRPCMessage, { result: unknown }>;
type JsonRpcErrorResponse = Extract<JSONRPCMessage, { error: unknown }>;

function validateDescriptorResponse<M extends GuiRequestMethod>(
  descriptor: RequestDescriptor<M>,
  result: unknown,
): result is RequestResponse<M> {
  return descriptor.validateResponse(result);
}

async function readValidatedResult<M extends GuiRequestMethod>(
  resultPromise: Promise<() => RequestResponse<M>>,
): Promise<RequestResponse<M>> {
  const getResult = await resultPromise;
  return getResult();
}

function isProjectionServerNotification(
  notification: ServerNotification,
): notification is ProjectionServerNotification {
  return notification.method.startsWith("thread/projection/");
}

function webSocketProtocol(location: URL): "ws" | "wss" {
  return location.protocol === "https:" ? "wss" : "ws";
}

function sendRequest(socket: WebSocket, id: number, method: string, params: unknown): void {
  socket.send(JSON.stringify({ jsonrpc: "2.0", id, method, params }));
}
