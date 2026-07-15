import type {
  ThreadProjectionAttachResponse,
  ThreadProjectionClosedNotification,
  ThreadProjectionDeltaNotification,
  ThreadProjectionEventNotification,
  TurnInterruptParams,
  TurnInterruptResponse,
  TurnStartParams,
  TurnStartResponse,
} from "@codex-protocol/v2";
import {
  consumeBrowserLaunchParams,
  type BrowserLaunchParams,
} from "@/features/browserLaunch/browserLaunchParams";
import {
  formatRpcId,
  isThreadProjectionClosedNotification,
  isThreadProjectionDeltaNotification,
  isThreadProjectionEventNotification,
  parseRpcMessage,
  type RpcMessage,
} from "./guiHostProtocol";
import { GuiHostCommandGateway } from "./guiHostCommandGateway";
import { GuiHostHandshakeController } from "./guiHostHandshakeController";
import { GuiHostTransportSession } from "./guiHostTransportSession";

export type GuiHostStatus =
  | { label: "connecting" }
  | { label: "authenticated" }
  | { label: "initialized" }
  | { label: "attached" }
  | { label: "closed" }
  | { label: "error"; message: string };

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
  onLaunchParams?: (params: BrowserLaunchParams) => void;
  onProjectionAttached?: (response: ThreadProjectionAttachResponse) => void;
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

  const socket = createWebSocket(`${webSocketProtocol(location)}://${location.host}/ws`);
  let terminalError = false;
  let closed = false;
  let handshakeController: GuiHostHandshakeController | undefined = undefined;
  let commandGateway: GuiHostCommandGateway | undefined = undefined;

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

  const failProtocolAndClose = (message: string, closeReason: string): void => {
    emit({ label: "error", message });
    handshakeController?.stop();
    transport.invalidate();
    commandGateway?.invalidate();
    transport.close(1000, closeReason);
  };

  const onMessage = (data: string): void => {
    let message: RpcMessage;
    try {
      message = parseRpcMessage(data);
    } catch {
      failProtocolAndClose("Malformed JSON-RPC message", "invalid message");
      return;
    }

    if (transport.correlate(message)) {
      return;
    }
    if (typeof message.id === "number") {
      return;
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

    if (message.method === "thread/projection/event") {
      if (!isThreadProjectionEventNotification(message.params)) {
        failProtocolAndClose(
          "thread/projection/event returned malformed params payload",
          "protocol error",
        );
        return;
      }

      const notification = message.params;
      onProjectionEvent?.(notification);
    }

    if (message.method === "thread/projection/delta") {
      if (!isThreadProjectionDeltaNotification(message.params)) {
        failProtocolAndClose(
          "thread/projection/delta returned malformed params payload",
          "protocol error",
        );
        return;
      }

      const notification = message.params;
      onProjectionDelta?.(notification);
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
      onProjectionClosed?.(notification);
    }
  };

  const transport = new GuiHostTransportSession(socket, {
    onOpen: () => {
      handshakeController?.start();
    },
    onError: () => {
      handshakeController?.stop();
      commandGateway?.invalidate();
      emit({
        label: "error",
        message: "GUI host WebSocket failed",
      });
    },
    onClose: (event) => {
      handshakeController?.stop();
      commandGateway?.invalidate();
      if (event.code === 1000) {
        emit({ label: "closed" });
        return;
      }

      emit({
        label: "error",
        message: `GUI host WebSocket closed (code=${String(event.code)}${event.reason ? `, reason=${event.reason}` : ""})`,
      });
    },
    onMessage,
  });
  commandGateway = new GuiHostCommandGateway(transport, () => {
    onCommandsUnavailable?.();
  });
  handshakeController = new GuiHostHandshakeController(transport, {
    token,
    threadId,
    onAuthenticated: () => {
      emit({ label: "authenticated" });
    },
    onInitialized: () => {
      emit({ label: "initialized" });
    },
    onAttached: (response) => {
      if (closed || terminalError) {
        return;
      }
      onProjectionAttached?.(response);
      emit({ label: "attached" });
      const commands = commandGateway.activate();
      if (commands) {
        onCommandsReady?.(commands);
      }
    },
    onTerminalError: failProtocolAndClose,
  });

  return () => {
    if (closed) {
      return;
    }

    closed = true;
    handshakeController.stop();
    transport.invalidate();
    commandGateway.invalidate();
    transport.dispose(1000, "cleanup");
  };
}

function webSocketProtocol(location: URL): "ws" | "wss" {
  return location.protocol === "https:" ? "wss" : "ws";
}
