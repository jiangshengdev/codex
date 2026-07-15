import { formatRpcId, type RpcMessage } from "./guiHostProtocol";

export type GuiHostRequestFailureSource = "rpc" | "send" | "unavailable";

export type GuiHostRpcResponse<T> = {
  result: T | undefined;
};

export type GuiHostRequestClient = {
  request<T>(method: string, params: unknown): Promise<GuiHostRpcResponse<T>>;
};

type TransportCallbacks = {
  onOpen: () => void;
  onError: () => void;
  onClose: (event: CloseEvent) => void;
  onMessage: (data: string) => void;
};

type PendingRequest = {
  resolve(response: GuiHostRpcResponse<unknown>): void;
  reject(error: Error): void;
};

const unavailableMessage = "GUI host WebSocket is not available";
const requestFailureSources = new WeakMap<Error, GuiHostRequestFailureSource>();

function setGuiHostRequestFailureSource(error: Error, source: GuiHostRequestFailureSource): Error {
  requestFailureSources.set(error, source);
  return error;
}

export function getGuiHostRequestFailureSource(
  error: unknown,
): GuiHostRequestFailureSource | undefined {
  if (error instanceof Error) {
    return requestFailureSources.get(error);
  }
  return undefined;
}

function sendFailure(error: unknown): Error {
  if (!(error instanceof Error)) {
    return setGuiHostRequestFailureSource(new Error(unavailableMessage), "send");
  }

  return setGuiHostRequestFailureSource(error, "send");
}

export class GuiHostTransportSession implements GuiHostRequestClient {
  private readonly socket: WebSocket;
  private readonly callbacks: TransportCallbacks;
  private nextRequestId = 1;
  private readonly pendingRequests = new Map<number, PendingRequest>();
  private invalidated = false;
  private disposed = false;

  constructor(socket: WebSocket, callbacks: TransportCallbacks) {
    this.socket = socket;
    this.callbacks = callbacks;
    socket.onopen = () => {
      if (this.disposed) {
        return;
      }
      this.callbacks.onOpen();
    };
    socket.onerror = () => {
      if (this.disposed) {
        return;
      }
      this.invalidate();
      this.callbacks.onError();
    };
    socket.onclose = (event) => {
      if (this.disposed) {
        return;
      }
      this.invalidate();
      this.callbacks.onClose(event);
    };
    socket.onmessage = (event) => {
      if (this.disposed) {
        return;
      }
      this.callbacks.onMessage(String(event.data));
    };
  }

  request<T>(method: string, params: unknown): Promise<GuiHostRpcResponse<T>> {
    if (this.isUnavailable()) {
      return Promise.reject(
        setGuiHostRequestFailureSource(new Error(unavailableMessage), "unavailable"),
      );
    }

    const id = this.nextRequestId;
    this.nextRequestId += 1;
    let message: string;
    try {
      message = JSON.stringify({
        jsonrpc: "2.0",
        id,
        method,
        params,
      });
    } catch (error) {
      return Promise.reject(sendFailure(error));
    }

    if (this.isUnavailable()) {
      return Promise.reject(
        setGuiHostRequestFailureSource(new Error(unavailableMessage), "unavailable"),
      );
    }

    return new Promise<GuiHostRpcResponse<T>>((resolve, reject) => {
      this.pendingRequests.set(id, {
        resolve: (response) => {
          resolve(response as GuiHostRpcResponse<T>);
        },
        reject,
      });

      try {
        this.socket.send(message);
      } catch (error) {
        this.pendingRequests.delete(id);
        reject(sendFailure(error));
      }
    });
  }

  private isUnavailable(): boolean {
    return (
      this.invalidated ||
      this.disposed ||
      this.socket.readyState === WebSocket.CLOSING ||
      this.socket.readyState === WebSocket.CLOSED
    );
  }

  correlate(message: RpcMessage): boolean {
    if (typeof message.id !== "number") {
      return false;
    }

    const pending = this.pendingRequests.get(message.id);
    if (!pending) {
      return false;
    }
    this.pendingRequests.delete(message.id);

    if (message.error) {
      pending.reject(
        setGuiHostRequestFailureSource(
          new Error(
            `JSON-RPC error (id=${formatRpcId(message.id)}, code=${String(message.error.code)}): ${
              message.error.message ?? ""
            }`.trim(),
          ),
          "rpc",
        ),
      );
    } else {
      pending.resolve({ result: message.result });
    }
    return true;
  }

  invalidate(): void {
    if (this.invalidated) {
      return;
    }
    this.invalidated = true;

    const error = setGuiHostRequestFailureSource(new Error(unavailableMessage), "unavailable");
    for (const pending of this.pendingRequests.values()) {
      pending.reject(error);
    }
    this.pendingRequests.clear();
  }

  close(code: number, reason: string): void {
    try {
      this.socket.close(code, reason);
    } catch {
      // The socket may close between the ready-state check and this call.
    }
  }

  dispose(code: number, reason: string): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.invalidate();
    this.socket.onopen = null;
    this.socket.onerror = null;
    this.socket.onclose = null;
    this.socket.onmessage = null;
    this.close(code, reason);
  }
}
