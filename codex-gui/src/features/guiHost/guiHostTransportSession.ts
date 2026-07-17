import type { JSONRPCMessage } from "@codex-protocol/JSONRPCMessage";
import {
  AUTHENTICATE_METHOD,
  type GuiAuthenticateParams,
  type GuiAuthenticateResult,
} from "@codex-gui-host-contract";
import type { requestDescriptors } from "@/generated/appServerProtocol";
import { validateGuiAuthenticateResult } from "@/generated/guiHostContract";
import type { RequestParams, RequestResponse } from "./appServerProtocol";

export type GuiRequestMethod = keyof typeof requestDescriptors;

type GeneratedRequestDescriptor = (typeof requestDescriptors)[GuiRequestMethod];

export type RequestDescriptor<M extends GuiRequestMethod> = Extract<
  GeneratedRequestDescriptor,
  { method: M }
>;

type JsonRpcErrorResponse = Extract<JSONRPCMessage, { error: unknown }>;

export type TransportRequestFailure = {
  source: "rpc" | "missingResult" | "malformedResult" | "send" | "unavailable";
  error: Error;
};

export type TransportRequestSettlement<T> =
  | { type: "result"; response: T }
  | { type: "failure"; failure: TransportRequestFailure };

type TransportRequestSettlementCallback<T> = (settlement: TransportRequestSettlement<T>) => void;

export type AppServerRequestSender = {
  request<M extends GuiRequestMethod>(
    descriptor: RequestDescriptor<M>,
    params: RequestParams<M>,
    onSettlement?: TransportRequestSettlementCallback<RequestResponse<M>>,
  ): Promise<RequestResponse<M>>;
};

export type AuthenticateRequestSender = {
  authenticate(
    params: GuiAuthenticateParams,
    onSettlement?: TransportRequestSettlementCallback<GuiAuthenticateResult>,
  ): Promise<GuiAuthenticateResult>;
};

export type GuiHostTransportCallbacks = {
  onOpen?: (event: Event) => void;
  onMessage?: (event: MessageEvent) => void;
  onError?: (event: Event) => void;
  onClose?: (event: CloseEvent) => void;
};

type PendingRequest = {
  settleResult: (result: unknown) => void;
  settleMissingResult: () => void;
  settleRpcError: (rpcError: JsonRpcErrorResponse["error"]) => void;
  settleUnavailable: (error: Error) => void;
};

const unavailableMessage = "GUI host WebSocket is not available";

export class GuiHostTransportSession implements AppServerRequestSender, AuthenticateRequestSender {
  private readonly socket: WebSocket;
  private readonly callbacks: GuiHostTransportCallbacks;
  private nextRequestId = 1;
  private readonly pendingRequests = new Map<number, PendingRequest>();
  private available = true;
  private unavailableError: Error | undefined;
  private disposed = false;

  constructor(socket: WebSocket, callbacks: GuiHostTransportCallbacks = {}) {
    this.socket = socket;
    this.callbacks = callbacks;
    socket.onopen = (event) => this.callbacks.onOpen?.(event);
    socket.onmessage = (event) => this.callbacks.onMessage?.(event);
    socket.onerror = (event) => this.callbacks.onError?.(event);
    socket.onclose = (event) => this.callbacks.onClose?.(event);
  }

  request<M extends GuiRequestMethod>(
    descriptor: RequestDescriptor<M>,
    params: RequestParams<M>,
    onSettlement?: TransportRequestSettlementCallback<RequestResponse<M>>,
  ): Promise<RequestResponse<M>> {
    const validateResponse = descriptor.validateResponse as (
      value: unknown,
    ) => value is RequestResponse<M>;
    return this.startRequest(
      descriptor.method,
      params,
      validateResponse,
      {
        source: "missingResult",
        message: `${descriptor.method} returned no result payload`,
      },
      onSettlement,
    );
  }

  authenticate(
    params: GuiAuthenticateParams,
    onSettlement?: TransportRequestSettlementCallback<GuiAuthenticateResult>,
  ): Promise<GuiAuthenticateResult> {
    return this.startRequest(
      AUTHENTICATE_METHOD,
      params,
      validateGuiAuthenticateResult,
      {
        source: "malformedResult",
        message: `${AUTHENTICATE_METHOD} returned malformed result payload`,
      },
      onSettlement,
    );
  }

  settleResult(id: number, result: unknown): boolean {
    const pending = this.takePending(id);
    if (!pending) {
      return false;
    }

    pending.settleResult(result);
    return true;
  }

  settleRpcError(id: number, rpcError: JsonRpcErrorResponse["error"]): boolean {
    const pending = this.takePending(id);
    if (!pending) {
      return false;
    }

    pending.settleRpcError(rpcError);
    return true;
  }

  settleMissingResult(id: number): boolean {
    const pending = this.takePending(id);
    if (!pending) {
      return false;
    }

    pending.settleMissingResult();
    return true;
  }

  invalidate(reason: string): void {
    if (!this.available) {
      return;
    }

    this.available = false;
    const error = new Error(reason);
    this.unavailableError = error;
    const pending = [...this.pendingRequests.values()];
    this.pendingRequests.clear();
    let hasSettlementError = false;
    let settlementError: unknown;
    for (const request of pending) {
      try {
        request.settleUnavailable(error);
      } catch (error) {
        if (!hasSettlementError) {
          hasSettlementError = true;
          settlementError = error;
        }
      }
    }
    if (hasSettlementError) {
      throw settlementError;
    }
  }

  close(code?: number, reason?: string): void {
    try {
      this.socket.close(code, reason);
    } catch {
      // Ignore close races; the session's owner already controls terminal state.
    }
  }

  dispose(code?: number, reason?: string): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    try {
      this.invalidate(unavailableMessage);
    } finally {
      this.socket.onopen = null;
      this.socket.onmessage = null;
      this.socket.onerror = null;
      this.socket.onclose = null;
      this.close(code, reason);
    }
  }

  private startRequest<T>(
    method: string,
    params: unknown,
    validateResponse: (value: unknown) => value is T,
    missingResultFailure: {
      source: "missingResult" | "malformedResult";
      message: string;
    },
    onSettlement?: TransportRequestSettlementCallback<T>,
  ): Promise<T> {
    let immediateFailure: TransportRequestFailure | undefined;
    const resultPromise = new Promise<() => T>((resolve, reject) => {
      if (
        !this.available ||
        this.socket.readyState === WebSocket.CLOSING ||
        this.socket.readyState === WebSocket.CLOSED
      ) {
        immediateFailure = {
          source: "unavailable" as const,
          error: this.unavailableError ?? new Error(unavailableMessage),
        };
        reject(immediateFailure.error);
        return;
      }

      const id = this.nextRequestId;
      this.nextRequestId += 1;
      const fail = (failure: TransportRequestFailure): void => {
        reject(failure.error);
        onSettlement?.({ type: "failure", failure });
      };
      this.pendingRequests.set(id, {
        settleResult: (result) => {
          if (!validateResponse(result)) {
            fail(createFailure("malformedResult", `${method} returned malformed result payload`));
            return;
          }

          resolve(() => result);
          onSettlement?.({ type: "result", response: result });
        },
        settleMissingResult: () => {
          fail(createFailure(missingResultFailure.source, missingResultFailure.message));
        },
        settleRpcError: (rpcError) => {
          fail(
            createFailure(
              "rpc",
              `JSON-RPC error (id=${String(id)}, code=${String(rpcError.code)}): ${rpcError.message}`.trim(),
            ),
          );
        },
        settleUnavailable: (error) => {
          fail({ source: "unavailable", error });
        },
      });

      try {
        this.socket.send(JSON.stringify({ jsonrpc: "2.0", id, method, params }));
      } catch (error) {
        this.pendingRequests.delete(id);
        immediateFailure = { source: "send", error: toPlainError(error) };
        reject(immediateFailure.error);
      }
    });

    if (immediateFailure) {
      try {
        onSettlement?.({ type: "failure", failure: immediateFailure });
      } catch (error) {
        void resultPromise.catch(() => undefined);
        throw error;
      }
    }

    return readValidatedResult(resultPromise);
  }

  private takePending(id: number): PendingRequest | undefined {
    const pending = this.pendingRequests.get(id);
    if (pending) {
      this.pendingRequests.delete(id);
    }
    return pending;
  }
}

function createFailure(
  source: TransportRequestFailure["source"],
  message: string,
): TransportRequestFailure {
  return { source, error: new Error(message) };
}

function toPlainError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }
  return new Error(unavailableMessage);
}

async function readValidatedResult<T>(resultPromise: Promise<() => T>): Promise<T> {
  const getResult = await resultPromise;
  return getResult();
}
