import { describe, expect, it, vi } from "vitest";
import * as transportSessionModule from "../guiHostTransportSession";

const { GuiHostRequestError, GuiHostTransportSession } = transportSessionModule;
const getRequestFailureSource = (error: unknown) =>
  (
    transportSessionModule as typeof transportSessionModule & {
      getGuiHostRequestFailureSource?: (error: unknown) => string | undefined;
    }
  ).getGuiHostRequestFailureSource?.(error);

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
      throw this.sendError;
    }
    this.sent.push(message);
    this.onSend?.(message);
  }

  close(code?: number, reason?: string): void {
    this.closeCalls += 1;
    if (this.closeError !== undefined) {
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

describe("GuiHostTransportSession", () => {
  it("allocates request IDs in order and correlates only the matching response", async () => {
    const socket = new TransportSocket();
    const session = new GuiHostTransportSession(asWebSocket(socket), transportCallbacks());
    const firstSettled = vi.fn();
    const secondSettled = vi.fn();

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

  it("rejects a correlated JSON-RPC error with its exact source and message", async () => {
    const socket = new TransportSocket();
    const session = new GuiHostTransportSession(asWebSocket(socket), transportCallbacks());
    const request = session.request("turn/start", {});

    expect(
      session.correlate({
        id: 1,
        error: { code: -32000, message: "active turn already running" },
      }),
    ).toBe(true);

    await expect(request).rejects.toMatchObject({
      name: "GuiHostRequestError",
      source: "rpc",
      message: "JSON-RPC error (id=1, code=-32000): active turn already running",
    });
    await expect(request).rejects.toBeInstanceOf(GuiHostRequestError);
  });

  it("preserves a synchronous socket send Error while classifying its source", async () => {
    const socket = new TransportSocket();
    const original = new Error("write failed");
    socket.sendError = original;
    const session = new GuiHostTransportSession(asWebSocket(socket), transportCallbacks());
    const request = session.request("turn/start", {});

    await expect(request).rejects.toBe(original);
    expect(original.message).toBe("write failed");
    expect(getRequestFailureSource(original)).toBe("send");
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
    expect(getRequestFailureSource(original)).toBe("send");
  });

  it("prefers the transport send classification for an existing request error", async () => {
    const socket = new TransportSocket();
    const original = new GuiHostRequestError("rpc", "upstream failure");
    socket.sendError = original;
    const session = new GuiHostTransportSession(asWebSocket(socket), transportCallbacks());
    const request = session.request("turn/start", {});

    await expect(request).rejects.toBe(original);
    expect(original.source).toBe("rpc");
    expect(getRequestFailureSource(original)).toBe("send");
  });

  it("preserves a frozen serialization Error and returns it through the Promise", async () => {
    const socket = new TransportSocket();
    const original = Object.freeze(new Error("serialization failed"));
    const session = new GuiHostTransportSession(asWebSocket(socket), transportCallbacks());
    let request: Promise<unknown> | undefined;

    expect(() => {
      request = session.request("turn/start", {
        toJSON: () => {
          throw original;
        },
      });
    }).not.toThrow();
    expect(request).toBeDefined();
    await expect(request).rejects.toBe(original);
    expect(original.message).toBe("serialization failed");
    expect(getRequestFailureSource(original)).toBe("send");
    expect(socket.sent).toEqual([]);
  });

  it("uses the unavailable public message for a non-Error socket send failure", async () => {
    const socket = new TransportSocket();
    socket.sendError = "write failed";
    const session = new GuiHostTransportSession(asWebSocket(socket), transportCallbacks());

    await expect(session.request("turn/start", {})).rejects.toMatchObject({
      source: "send",
      message: "GUI host WebSocket is not available",
    });
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

    await expect(session.request("turn/start", params)).rejects.toMatchObject({
      source: "unavailable",
      message: "GUI host WebSocket is not available",
    });
    expect(socket.sent).toEqual([]);
  });

  it("rejects pending and future requests after invalidation", async () => {
    const socket = new TransportSocket();
    const session = new GuiHostTransportSession(asWebSocket(socket), transportCallbacks());
    const pending = session.request("turn/start", {});

    session.invalidate();

    await expect(pending).rejects.toMatchObject({
      source: "unavailable",
      message: "GUI host WebSocket is not available",
    });
    await expect(session.request("turn/interrupt", {})).rejects.toMatchObject({
      source: "unavailable",
      message: "GUI host WebSocket is not available",
    });
  });

  it("reuses one unavailable error for all requests rejected by an invalidation", async () => {
    const socket = new TransportSocket();
    const session = new GuiHostTransportSession(asWebSocket(socket), transportCallbacks());
    const first = session.request("first", {}).catch((error: unknown) => error);
    const second = session.request("second", {}).catch((error: unknown) => error);

    session.invalidate();

    const [firstError, secondError] = await Promise.all([first, second]);
    expect(firstError).toBe(secondError);
    expect(firstError).toMatchObject({
      source: "unavailable",
      message: "GUI host WebSocket is not available",
    });
  });

  it.each([WebSocket.CLOSING, WebSocket.CLOSED])(
    "rejects requests while the socket ready state is %s",
    async (readyState) => {
      const socket = new TransportSocket();
      socket.readyState = readyState;
      const session = new GuiHostTransportSession(asWebSocket(socket), transportCallbacks());

      await expect(session.request("turn/start", {})).rejects.toMatchObject({
        source: "unavailable",
        message: "GUI host WebSocket is not available",
      });
      expect(socket.sent).toEqual([]);
    },
  );

  it("stores a pending request before sending so a synchronous response can correlate", async () => {
    const socket = new TransportSocket();
    let session: InstanceType<typeof GuiHostTransportSession>;
    socket.onSend = (message) => {
      const request = JSON.parse(message) as { id: number };
      expect(session.correlate({ id: request.id, result: { value: "synchronous" } })).toBe(true);
    };
    session = new GuiHostTransportSession(asWebSocket(socket), transportCallbacks());

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
    let session: InstanceType<typeof GuiHostTransportSession>;
    session = new GuiHostTransportSession(
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
    const rejection = expect(pending).rejects.toMatchObject({ source: "unavailable" });

    dispatch(socket);
    expect(calls).toEqual(["pending-rejected", `${event}-callback`]);
    await rejection;
  });

  it("forwards open and message events while the session is active", () => {
    const socket = new TransportSocket();
    const onOpen = vi.fn();
    const onMessage = vi.fn();
    new GuiHostTransportSession(asWebSocket(socket), transportCallbacks({ onOpen, onMessage }));

    socket.onopen?.();
    socket.onmessage?.({ data: 42 });

    expect(onOpen).toHaveBeenCalledOnce();
    expect(onMessage).toHaveBeenCalledWith("42");
  });

  it("disposes once by rejecting pending work, clearing handlers, and closing the socket", async () => {
    const socket = new TransportSocket();
    const onOpen = vi.fn();
    const session = new GuiHostTransportSession(
      asWebSocket(socket),
      transportCallbacks({ onOpen }),
    );
    const pending = session.request("turn/start", {});

    session.dispose(1000, "cleanup");
    session.dispose(1000, "cleanup");
    socket.onopen?.();

    await expect(pending).rejects.toMatchObject({
      source: "unavailable",
      message: "GUI host WebSocket is not available",
    });
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

    expect(() => closeSession.close(1000, "cleanup")).not.toThrow();
    expect(closeSocket.closeCalls).toBe(1);

    const disposeSocket = new TransportSocket();
    disposeSocket.closeError = new Error("already closed");
    const disposeSession = new GuiHostTransportSession(
      asWebSocket(disposeSocket),
      transportCallbacks(),
    );

    expect(() => disposeSession.dispose(1000, "cleanup")).not.toThrow();
    expect(() => disposeSession.dispose(1000, "cleanup")).not.toThrow();
    expect(disposeSocket.closeCalls).toBe(1);
  });
});
