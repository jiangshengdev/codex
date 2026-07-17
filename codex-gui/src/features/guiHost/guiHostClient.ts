import type {
  ThreadProjectionClosedNotification,
  ThreadProjectionDeltaNotification,
  ThreadProjectionEventNotification,
} from "@codex-protocol/v2";
import type { JSONRPCMessage } from "@codex-protocol/JSONRPCMessage";
import { AUTHENTICATE_METHOD, WEBSOCKET_PATH } from "@codex-gui-host-contract";
import {
  consumeBrowserLaunchParams,
  type BrowserLaunchParams,
} from "@/features/browserLaunch/browserLaunchParams";
import { classifyServerNotification, requestDescriptors } from "@/generated/appServerProtocol";
import { validateJSONRPCMessage } from "@/generated/appServerProtocol/jsonRpcEnvelopeValidators.js";
import type { RequestParams, RequestResponse } from "./appServerProtocol";
import { parseRpcMessage } from "./guiHostProtocol";
import { GuiHostTransportSession, type TransportRequestFailure } from "./guiHostTransportSession";

const unavailableMessage = "GUI host WebSocket is not available";

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

  const markCommandsUnavailable = (): void => {
    if (!commandsReady) {
      return;
    }

    commandsReady = false;
    onCommandsUnavailable?.();
  };

  const transport = new GuiHostTransportSession(socket, {
    onOpen: () => {
      startAuthenticationRequest();
    },
    onMessage: (event) => {
      handleMessage(event);
    },
    onError: () => {
      transport.invalidate(unavailableMessage);
      markCommandsUnavailable();
      emit({
        label: "error",
        message: "GUI host WebSocket failed",
      });
    },
    onClose: (event) => {
      transport.invalidate(unavailableMessage);
      markCommandsUnavailable();
      if (event.code === 1000) {
        emit({ label: "closed" });
        return;
      }

      emit({
        label: "error",
        message: `GUI host WebSocket closed (code=${String(event.code)}${event.reason ? `, reason=${event.reason}` : ""})`,
      });
    },
  });

  const emitProtocolError = (message: string): void => {
    emit({
      label: "error",
      message,
    });
    transport.invalidate(unavailableMessage);
    markCommandsUnavailable();
  };

  const failProtocolAndClose = (message: string, closeReason: string): void => {
    emitProtocolError(message);
    transport.close(1000, closeReason);
  };

  const closeForHandshakeFailure = (failure: TransportRequestFailure): void => {
    switch (failure.source) {
      case "rpc":
        failProtocolAndClose(failure.error.message, "handshake error");
        return;
      case "missingResult":
      case "malformedResult":
        failProtocolAndClose(failure.error.message, "protocol error");
        return;
      case "send":
      case "unavailable":
        return;
      default:
        failure.source satisfies never;
    }
  };

  const withReadyCommands = <T>(startRequest: () => Promise<T>): Promise<T> => {
    if (!commandsReady) {
      return Promise.reject(new Error(unavailableMessage));
    }

    return startRequest();
  };

  const commands: GuiHostCommands = {
    startTurn: (params) =>
      withReadyCommands(() => transport.request(requestDescriptors["turn/start"], params)),
    interruptTurn: (params) =>
      withReadyCommands(() => transport.request(requestDescriptors["turn/interrupt"], params)),
  };

  const startAttachRequest = (): void => {
    void transport
      .request(requestDescriptors["thread/projection/attach"], { threadId }, (settlement) => {
        if (settlement.type === "failure") {
          closeForHandshakeFailure(settlement.failure);
          return;
        }

        onProjectionAttached?.(settlement.response);
        emit({ label: "attached" });
        commandsReady = true;
        onCommandsReady?.(commands);
      })
      .catch(() => undefined);
  };

  const startInitializeRequest = (): void => {
    void transport
      .request(
        requestDescriptors.initialize,
        {
          clientInfo: { name: "codex-gui", title: null, version: "0.0.0" },
          capabilities: null,
        },
        (settlement) => {
          if (settlement.type === "failure") {
            closeForHandshakeFailure(settlement.failure);
            return;
          }

          emit({ label: "initialized" });
          startAttachRequest();
        },
      )
      .catch(() => undefined);
  };

  const startAuthenticationRequest = (): void => {
    if (closed) {
      return;
    }

    void transport
      .authenticate({ token }, (settlement) => {
        if (settlement.type === "failure") {
          closeForHandshakeFailure(settlement.failure);
          return;
        }
        if (!settlement.response.authenticated) {
          failProtocolAndClose(
            `${AUTHENTICATE_METHOD} returned malformed result payload`,
            "protocol error",
          );
          return;
        }

        emit({ label: "authenticated" });
        startInitializeRequest();
      })
      .catch(() => undefined);
  };

  const handleMessage = (event: MessageEvent): void => {
    let parsedMessage: unknown;
    try {
      parsedMessage = parseRpcMessage(event.data);
    } catch {
      failProtocolAndClose("Malformed JSON-RPC message", "invalid message");
      return;
    }

    if (!validateJSONRPCMessage(parsedMessage)) {
      if (
        typeof parsedMessage === "object" &&
        parsedMessage !== null &&
        !Array.isArray(parsedMessage) &&
        "id" in parsedMessage &&
        typeof parsedMessage.id === "number" &&
        !("result" in parsedMessage) &&
        !("error" in parsedMessage) &&
        transport.settleMissingResult(parsedMessage.id)
      ) {
        return;
      }

      failProtocolAndClose("Malformed JSON-RPC message", "invalid message");
      return;
    }

    const message: JSONRPCMessage = parsedMessage;
    if ("result" in message) {
      if (typeof message.id === "number") {
        transport.settleResult(message.id, message.result);
      }
      return;
    }
    if ("error" in message) {
      if (typeof message.id === "number") {
        transport.settleRpcError(message.id, message.error);
        return;
      }

      failProtocolAndClose(
        `JSON-RPC error (id=${message.id}, code=${String(message.error.code)}): ${message.error.message}`.trim(),
        "handshake error",
      );
      return;
    }
    if ("id" in message) {
      return;
    }

    const classification = classifyServerNotification(message);
    switch (classification.type) {
      case "selected": {
        const notification = classification.notification;
        switch (notification.method) {
          case "thread/projection/event":
            onProjectionEvent?.(notification.params);
            return;
          case "thread/projection/delta":
            onProjectionDelta?.(notification.params);
            return;
          case "thread/projection/closed":
            onProjectionClosed?.(notification.params);
            return;
          default:
            notification satisfies never;
            return;
        }
      }
      case "selectedInvalid":
        failProtocolAndClose(
          `${classification.method} returned malformed params payload`,
          "protocol error",
        );
        return;
      case "knownUnconsumed":
        return;
      case "unknown":
        failProtocolAndClose("Malformed JSON-RPC message", "invalid message");
        return;
      default:
        classification satisfies never;
        return;
    }
  };

  emit({ label: "connecting" });

  return () => {
    if (closed) {
      return;
    }

    closed = true;
    transport.invalidate(unavailableMessage);
    markCommandsUnavailable();
    transport.dispose(1000, "cleanup");
  };
}

function webSocketProtocol(location: URL): "ws" | "wss" {
  return location.protocol === "https:" ? "wss" : "ws";
}
