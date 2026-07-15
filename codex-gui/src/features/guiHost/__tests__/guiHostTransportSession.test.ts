import { describe, expect, it, vi } from "vitest";
import * as transportSessionModule from "../guiHostTransportSession";

const { getGuiHostRequestFailureSource, GuiHostTransportSession } = transportSessionModule;

type SocketCloseEvent = {
  code: number;
  reason: string;
};

class TransportSocket {
  readonly sent: string[] = [];
  readonly closed: { code: number | undefined; reason: string | undefined }[] = [];
  closeCalls = 0;
  readyState: number = WebSocket.OPEN;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: ((event: SocketCloseEvent) => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  sendError: unknown;
  closeError: unknown;
  onSend: ((message: string) => void) | undefined;

  send(message: string): void {
    if (this.sendError !== undefined) {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- Model non-Error socket failures.
      throw this.sendError;
    }
    this.sent.push(message);
    this.onSend?.(message);
  }

  close(code?: number, reason?: string): void {
    this.closeCalls += 1;
    if (this.closeError !== undefined) {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- Model non-Error socket failures.
      throw this.closeError;
    }
    this.closed.push({ code, reason });
  }
}

const asWebSocket = (socket: TransportSocket): WebSocket => socket as unknown as WebSocket;

function transportCallbacks(
  overrides: Partial<{
    onOpen: () => void;
    onError: () => void;
    onClose: (event: CloseEvent) => void;
    onMessage: (data: string) => void;
  }> = {},
) {
  return {
    onOpen: () => undefined,
    onError: () => undefined,
    onClose: () => undefined,
    onMessage: () => undefined,
    ...overrides,
  };
}

function readRequest(socket: TransportSocket, index: number): Record<string, unknown> {
  return JSON.parse(socket.sent[index] ?? "") as Record<string, unknown>;
}

function expectPlainError(error: unknown, message: string): asserts error is Error {
  expect(error).toBeInstanceOf(Error);
  expect(error?.constructor).toBe(Error);
  expect(error).toMatchObject({ name: "Error", message });
  expect("source" in (error as Error)).toBe(false);
}

async function createRpcFailure(message: string): Promise<Error> {
  const socket = new TransportSocket();
  const session = new GuiHostTransportSession(asWebSocket(socket), transportCallbacks());
  const request = session.request("probe", {});
  const rpcRequest = readRequest(socket, 0) as { id: number };

  session.correlate({ id: rpcRequest.id, error: { code: -32000, message } });
  const error = await request.catch((reason: unknown) => reason);
  if (!(error instanceof Error)) {
    throw new Error("Expected an RPC Error");
  }
  return error;
}

describe("GuiHostTransportSession", () => {
  it("does not export the request failure source setter", () => {
    expect("setGuiHostRequestFailureSource" in transportSessionModule).toBe(false);
  });

  it("allocates request IDs in order and correlates only the matching response", async () => {
    const socket = new TransportSocket();
    const session = new GuiHostTransportSession(asWebSocket(socket), transportCallbacks());
    const firstSettled = vi.fn<(response: unknown) => void>();
    const secondSettled = vi.fn<(response: unknown) => void>();

    const first = session.request<{ value: string }>("first", { sequence: 1 });
    const second = session.request<{ value: string }>("second", { sequence: 2 });
    void first.then(firstSettled);
    void second.then(secondSettled);

    expect(readRequest(socket, 0)).toEqual({
      jsonrpc: "2.0",
      id: 1,
      method: "first",
      params: { sequence: 1 },
    });
    expect(readRequest(socket, 1)).toEqual({
      jsonrpc: "2.0",
      id: 2,
      method: "second",
      params: { sequence: 2 },
    });

    expect(session.correlate({ id: 2, result: { value: "second" } })).toBe(true);
    await expect(second).resolves.toEqual({ result: { value: "second" } });
    expect(secondSettled).toHaveBeenCalledWith({ result: { value: "second" } });
    expect(firstSettled).not.toHaveBeenCalled();

    expect(session.correlate({ id: 2, result: { value: "duplicate" } })).toBe(false);
    expect(session.correlate({ id: 99, result: { value: "unknown" } })).toBe(false);
    await Promise.resolve();
    expect(firstSettled).not.toHaveBeenCalled();

    expect(session.correlate({ id: 1, result: { value: "first" } })).toBe(true);
    await expect(first).resolves.toEqual({ result: { value: "first" } });
    expect(firstSettled).toHaveBeenCalledWith({ result: { value: "first" } });
  });

  it("rejects a correlated JSON-RPC error as a plain Error with internal classification", async () => {
    const socket = new TransportSocket();
    const session = new GuiHostTransportSession(asWebSocket(socket), transportCallbacks());
    const request = session.request("turn/start", {});

    expect(
      session.correlate({
        id: 1,
        error: { code: -32000, message: "active turn already running" },
      }),
    ).toBe(true);

    const error = await request.catch((reason: unknown) => reason);
    expectPlainError(error, "JSON-RPC error (id=1, code=-32000): active turn already running");
    expect(getGuiHostRequestFailureSource(error)).toBe("rpc");
  });

  it("preserves a synchronous socket send Error while classifying its source", async () => {
    const socket = new TransportSocket();
    const original = new Error("write failed");
    socket.sendError = original;
    const session = new GuiHostTransportSession(asWebSocket(socket), transportCallbacks());
    const request = session.request("turn/start", {});

    await expect(request).rejects.toBe(original);
    expect(original.message).toBe("write failed");
    expect("source" in original).toBe(false);
    expect(getGuiHostRequestFailureSource(original)).toBe("send");
    expect(session.correlate({ id: 1, result: {} })).toBe(false);
  });

  it("preserves a frozen socket send Error and classifies it without mutation", async () => {
    const socket = new TransportSocket();
    const original = Object.freeze(new Error("write failed"));
    socket.sendError = original;
    const session = new GuiHostTransportSession(asWebSocket(socket), transportCallbacks());
    let request: Promise<unknown> | undefined;

    expect(() => {
      request = session.request("turn/start", {});
    }).not.toThrow();
    expect(request).toBeDefined();
    await expect(request).rejects.toBe(original);
    expect(original.message).toBe("write failed");
    expect("source" in original).toBe(false);
    expect(getGuiHostRequestFailureSource(original)).toBe("send");
  });

  it("prefers the transport send classification for an existing request error", async () => {
    const socket = new TransportSocket();
    const original = await createRpcFailure("upstream failure");
    expect(getGuiHostRequestFailureSource(original)).toBe("rpc");
    socket.sendError = original;
    const session = new GuiHostTransportSession(asWebSocket(socket), transportCallbacks());
    const request = session.request("turn/start", {});

    await expect(request).rejects.toBe(original);
    expect("source" in original).toBe(false);
    expect(getGuiHostRequestFailureSource(original)).toBe("send");
  });

  it("preserves a frozen serialization Error and returns it through the Promise", async () => {
    const socket = new TransportSocket();
    const original = Object.freeze(new Error("serialization failed"));
    const session = new GuiHostTransportSession(asWebSocket(socket), transportCallbacks());
    let request: Promise<unknown> | undefined;

    expect(() => {
      request = session.request("turn/start", {
        toJSON: () => {
          // eslint-disable-next-line @typescript-eslint/only-throw-error -- Preserve the frozen Error identity.
          throw original;
        },
      });
    }).not.toThrow();
    expect(request).toBeDefined();
    await expect(request).rejects.toBe(original);
    expect(original.message).toBe("serialization failed");
    expect("source" in original).toBe(false);
    expect(getGuiHostRequestFailureSource(original)).toBe("send");
    expect(socket.sent).toEqual([]);
  });

  it("uses the unavailable public message for a non-Error socket send failure", async () => {
    const socket = new TransportSocket();
    socket.sendError = "write failed";
    const session = new GuiHostTransportSession(asWebSocket(socket), transportCallbacks());

    const error = await session.request("turn/start", {}).catch((reason: unknown) => reason);
    expectPlainError(error, "GUI host WebSocket is not available");
    expect(getGuiHostRequestFailureSource(error)).toBe("send");
  });

  it("does not send when params serialization invalidates the session", async () => {
    const socket = new TransportSocket();
    const session = new GuiHostTransportSession(asWebSocket(socket), transportCallbacks());
    const params = {
      toJSON: () => {
        session.invalidate();
        return { value: "serialized" };
      },
    };

    const error = await session.request("turn/start", params).catch((reason: unknown) => reason);
    expectPlainError(error, "GUI host WebSocket is not available");
    expect(getGuiHostRequestFailureSource(error)).toBe("unavailable");
    expect(socket.sent).toEqual([]);
  });

  it("rejects pending and future requests after invalidation", async () => {
    const socket = new TransportSocket();
    const session = new GuiHostTransportSession(asWebSocket(socket), transportCallbacks());
    const pending = session.request("turn/start", {});

    session.invalidate();

    const pendingError = await pending.catch((reason: unknown) => reason);
    const futureError = await session
      .request("turn/interrupt", {})
      .catch((reason: unknown) => reason);
    expectPlainError(pendingError, "GUI host WebSocket is not available");
    expectPlainError(futureError, "GUI host WebSocket is not available");
    expect(getGuiHostRequestFailureSource(pendingError)).toBe("unavailable");
    expect(getGuiHostRequestFailureSource(futureError)).toBe("unavailable");
  });

  it("reuses one unavailable error for all requests rejected by an invalidation", async () => {
    const socket = new TransportSocket();
    const session = new GuiHostTransportSession(asWebSocket(socket), transportCallbacks());
    const first = session.request("first", {}).catch((error: unknown) => error);
    const second = session.request("second", {}).catch((error: unknown) => error);

    session.invalidate();

    const [firstError, secondError] = await Promise.all([first, second]);
    expect(firstError).toBe(secondError);
    expectPlainError(firstError, "GUI host WebSocket is not available");
    expect(getGuiHostRequestFailureSource(firstError)).toBe("unavailable");
  });

  it.each([WebSocket.CLOSING, WebSocket.CLOSED])(
    "rejects requests while the socket ready state is %s",
    async (readyState) => {
      const socket = new TransportSocket();
      socket.readyState = readyState;
      const session = new GuiHostTransportSession(asWebSocket(socket), transportCallbacks());

      const error = await session.request("turn/start", {}).catch((reason: unknown) => reason);
      expectPlainError(error, "GUI host WebSocket is not available");
      expect(getGuiHostRequestFailureSource(error)).toBe("unavailable");
      expect(socket.sent).toEqual([]);
    },
  );

  it("stores a pending request before sending so a synchronous response can correlate", async () => {
    const socket = new TransportSocket();
    const session = new GuiHostTransportSession(asWebSocket(socket), transportCallbacks());
    socket.onSend = (message) => {
      const request = JSON.parse(message) as { id: number };
      expect(session.correlate({ id: request.id, result: { value: "synchronous" } })).toBe(true);
    };

    await expect(session.request<{ value: string }>("synchronous", {})).resolves.toEqual({
      result: { value: "synchronous" },
    });
  });

  it.each([
    ["error", (socket: TransportSocket) => socket.onerror?.()],
    [
      "close",
      (socket: TransportSocket) => socket.onclose?.({ code: 1006, reason: "network lost" }),
    ],
  ])("rejects pending requests before the socket %s callback", async (event, dispatch) => {
    const socket = new TransportSocket();
    const calls: string[] = [];
    const session = new GuiHostTransportSession(
      asWebSocket(socket),
      transportCallbacks({
        onError: () => {
          calls.push(session.correlate({ id: 1, result: {} }) ? "pending" : "pending-rejected");
          calls.push("error-callback");
        },
        onClose: () => {
          calls.push(session.correlate({ id: 1, result: {} }) ? "pending" : "pending-rejected");
          calls.push("close-callback");
        },
      }),
    );
    const pending = session.request("turn/start", {});
    const observedError = pending.catch((error: unknown) => error);

    dispatch(socket);
    expect(calls).toEqual(["pending-rejected", `${event}-callback`]);
    const error = await observedError;
    expectPlainError(error, "GUI host WebSocket is not available");
    expect(getGuiHostRequestFailureSource(error)).toBe("unavailable");
  });

  it("forwards open and message events while the session is active", () => {
    const socket = new TransportSocket();
    const onOpen = vi.fn<() => void>();
    const onMessage = vi.fn<(data: string) => void>();
    new GuiHostTransportSession(asWebSocket(socket), transportCallbacks({ onOpen, onMessage }));

    socket.onopen?.();
    socket.onmessage?.({ data: 42 });

    expect(onOpen).toHaveBeenCalledOnce();
    expect(onMessage).toHaveBeenCalledWith("42");
  });

  it("disposes once by rejecting pending work, clearing handlers, and closing the socket", async () => {
    const socket = new TransportSocket();
    const onOpen = vi.fn<() => void>();
    const session = new GuiHostTransportSession(
      asWebSocket(socket),
      transportCallbacks({ onOpen }),
    );
    const pending = session.request("turn/start", {});

    session.dispose(1000, "cleanup");
    session.dispose(1000, "cleanup");
    socket.onopen?.();

    const error = await pending.catch((reason: unknown) => reason);
    expectPlainError(error, "GUI host WebSocket is not available");
    expect(getGuiHostRequestFailureSource(error)).toBe("unavailable");
    expect(socket.onerror).toBeNull();
    expect(socket.onclose).toBeNull();
    expect(socket.onmessage).toBeNull();
    expect(socket.onopen).toBeNull();
    expect(onOpen).not.toHaveBeenCalled();
    expect(socket.closed).toEqual([{ code: 1000, reason: "cleanup" }]);
  });

  it("ignores synchronous socket close races from close and dispose", () => {
    const closeSocket = new TransportSocket();
    closeSocket.closeError = new Error("already closed");
    const closeSession = new GuiHostTransportSession(
      asWebSocket(closeSocket),
      transportCallbacks(),
    );

    expect(() => {
      closeSession.close(1000, "cleanup");
    }).not.toThrow();
    expect(closeSocket.closeCalls).toBe(1);

    const disposeSocket = new TransportSocket();
    disposeSocket.closeError = new Error("already closed");
    const disposeSession = new GuiHostTransportSession(
      asWebSocket(disposeSocket),
      transportCallbacks(),
    );

    expect(() => {
      disposeSession.dispose(1000, "cleanup");
    }).not.toThrow();
    expect(() => {
      disposeSession.dispose(1000, "cleanup");
    }).not.toThrow();
    expect(disposeSocket.closeCalls).toBe(1);
  });
});
