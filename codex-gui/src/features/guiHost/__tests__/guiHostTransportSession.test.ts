import { describe, expect, it } from "vitest";
import type { InitializeResponse } from "@codex-protocol/InitializeResponse";
import type { GuiAuthenticateResult } from "@codex-gui-host-contract";
import { requestDescriptors } from "@/generated/appServerProtocol";
import {
  GuiHostTransportSession,
  type TransportRequestFailure,
  type TransportRequestSettlement,
} from "../guiHostTransportSession";

class RecordingSocket {
  sent: string[] = [];
  closed: { code: number | undefined; reason: string | undefined }[] = [];
  readyState: number = WebSocket.OPEN;
  onerror: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onopen: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;

  send(message: string): void {
    this.sent.push(message);
  }

  close(code?: number, reason?: string): void {
    this.closed.push({ code, reason });
  }
}

const initializeParams = {
  clientInfo: { name: "codex-gui", title: null, version: "0.0.0" },
  capabilities: null,
};

const initializeResponse: InitializeResponse = {
  userAgent: "codex-test",
  codexHome: "/codex-home",
  platformFamily: "test",
  platformOs: "test",
};

function createSession(
  callbacks: ConstructorParameters<typeof GuiHostTransportSession>[1] = {},
  socket = new RecordingSocket(),
): {
  session: GuiHostTransportSession;
  socket: RecordingSocket;
} {
  const session = new GuiHostTransportSession(socket as unknown as WebSocket, callbacks);
  return { session, socket };
}

function requestId(socket: RecordingSocket): number {
  const request = JSON.parse(socket.sent.at(-1) ?? "null") as { id?: unknown };
  if (typeof request.id !== "number") {
    throw new Error("Expected a numeric request id");
  }
  return request.id;
}

function expectFailure(
  settlement: TransportRequestSettlement<InitializeResponse> | undefined,
  source: TransportRequestFailure["source"],
  message: string,
): void {
  expect(settlement).toEqual({
    type: "failure",
    failure: { source, error: new Error(message) },
  });
  if (settlement?.type !== "failure") {
    throw new Error("Expected a failed settlement");
  }
  expect(settlement.failure.error.constructor).toBe(Error);
}

describe("GuiHostTransportSession", () => {
  it("settles a descriptor-bound result once and runs the continuation in the same stack", async () => {
    const { session, socket } = createSession();
    const calls: string[] = [];
    let settlement: TransportRequestSettlement<InitializeResponse> | undefined;
    let id = 0;
    let reentrantSettlement: boolean | undefined;
    const promise = session.request(requestDescriptors.initialize, initializeParams, (value) => {
      calls.push("settlement");
      settlement = value;
      reentrantSettlement = session.settleResult(id, initializeResponse);
    });
    void promise.then(() => {
      calls.push("promise");
    });
    id = requestId(socket);

    expect(session.settleResult(id, initializeResponse)).toBe(true);
    expect(calls).toEqual(["settlement"]);
    expect(settlement).toEqual({ type: "result", response: initializeResponse });
    expect(settlement?.type === "result" && settlement.response).toBe(initializeResponse);
    expect(reentrantSettlement).toBe(false);
    expect(session.settleResult(id, initializeResponse)).toBe(false);

    await expect(promise).resolves.toBe(initializeResponse);
    expect(calls).toEqual(["settlement", "promise"]);
  });

  it("rejects a missing result with a plain Error and missingResult source", async () => {
    const { session, socket } = createSession();
    let settlement: TransportRequestSettlement<InitializeResponse> | undefined;
    const promise = session.request(requestDescriptors.initialize, initializeParams, (value) => {
      settlement = value;
    });

    expect(session.settleMissingResult(requestId(socket))).toBe(true);
    expectFailure(settlement, "missingResult", "initialize returned no result payload");
    await expect(promise).rejects.toEqual(new Error("initialize returned no result payload"));
  });

  it("keeps a missing authenticate result classified as malformed", async () => {
    const { session, socket } = createSession();
    let settlement: TransportRequestSettlement<GuiAuthenticateResult> | undefined;
    const promise = session.authenticate({ token: "secret" }, (value) => {
      settlement = value;
    });

    expect(session.settleMissingResult(requestId(socket))).toBe(true);
    expect(settlement).toEqual({
      type: "failure",
      failure: {
        source: "malformedResult",
        error: new Error("gui/authenticate returned malformed result payload"),
      },
    });
    await expect(promise).rejects.toEqual(
      new Error("gui/authenticate returned malformed result payload"),
    );
  });

  it("rejects a malformed descriptor result with a plain Error and malformedResult source", async () => {
    const { session, socket } = createSession();
    let settlement: TransportRequestSettlement<InitializeResponse> | undefined;
    const promise = session.request(requestDescriptors.initialize, initializeParams, (value) => {
      settlement = value;
    });

    expect(session.settleResult(requestId(socket), {})).toBe(true);
    expectFailure(settlement, "malformedResult", "initialize returned malformed result payload");
    await expect(promise).rejects.toEqual(
      new Error("initialize returned malformed result payload"),
    );
  });

  it("rejects a correlated RPC failure with a plain Error, rpc source, and exact text", async () => {
    const { session, socket } = createSession();
    let settlement: TransportRequestSettlement<InitializeResponse> | undefined;
    const promise = session.request(requestDescriptors.initialize, initializeParams, (value) => {
      settlement = value;
    });
    const id = requestId(socket);
    const message = `JSON-RPC error (id=${String(id)}, code=-32000): request failed`;

    expect(session.settleRpcError(id, { code: -32000, message: "request failed" })).toBe(true);
    expectFailure(settlement, "rpc", message);
    await expect(promise).rejects.toEqual(new Error(message));
  });

  it("preserves Error subclass identity on send failure without invalidating the session", async () => {
    const { session, socket } = createSession();
    class SendError extends Error {
      readonly operation = "initialize";
    }
    const cause = new Error("socket cause");
    const sendError = new SendError("send failed", { cause });
    const settlements: TransportRequestSettlement<InitializeResponse>[] = [];
    socket.send = () => {
      throw sendError;
    };

    const failedPromise = session.request(
      requestDescriptors.initialize,
      initializeParams,
      (settlement) => {
        settlements.push(settlement);
      },
    );

    await expect(failedPromise).rejects.toBe(sendError);
    expect(sendError).toBeInstanceOf(SendError);
    expect(sendError.operation).toBe("initialize");
    expect(sendError.cause).toBe(cause);
    expect(settlements).toEqual([
      { type: "failure", failure: { source: "send", error: sendError } },
    ]);
    expect(settlements[0]?.type === "failure" && settlements[0].failure.error).toBe(sendError);

    socket.send = (message) => {
      socket.sent.push(message);
    };
    const nextPromise = session.request(requestDescriptors.initialize, initializeParams);
    expect(session.settleResult(requestId(socket), initializeResponse)).toBe(true);
    await expect(nextPromise).resolves.toEqual(initializeResponse);

    const callbackError = new Error("send settlement callback failed");
    socket.send = () => {
      throw sendError;
    };
    expect(() =>
      session.request(requestDescriptors.initialize, initializeParams, () => {
        throw callbackError;
      }),
    ).toThrow(callbackError);
    await Promise.resolve();
  });

  it("normalizes a non-Error send failure to the unavailable Error", async () => {
    const { session, socket } = createSession();
    let settlement: TransportRequestSettlement<InitializeResponse> | undefined;
    socket.send = () => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- Verifies normalization of non-Error throws from WebSocket.send.
      throw "send failed";
    };

    const promise = session.request(requestDescriptors.initialize, initializeParams, (value) => {
      settlement = value;
    });

    expectFailure(settlement, "send", "GUI host WebSocket is not available");
    await expect(promise).rejects.toEqual(new Error("GUI host WebSocket is not available"));
  });

  it.each([
    ["CLOSING", WebSocket.CLOSING],
    ["CLOSED", WebSocket.CLOSED],
  ])(
    "rejects request and authenticate as unavailable when the socket is already %s",
    async (_, readyState) => {
      const requestSocket = new RecordingSocket();
      requestSocket.readyState = readyState;
      const { session: requestSession } = createSession({}, requestSocket);
      const requestPromise = requestSession.request(
        requestDescriptors.initialize,
        initializeParams,
      );

      const authenticateSocket = new RecordingSocket();
      authenticateSocket.readyState = readyState;
      const { session: authenticateSession } = createSession({}, authenticateSocket);
      const authenticatePromise = authenticateSession.authenticate({ token: "secret" });

      expect(requestSocket.sent).toEqual([]);
      expect(authenticateSocket.sent).toEqual([]);
      await expect(requestPromise).rejects.toEqual(
        new Error("GUI host WebSocket is not available"),
      );
      await expect(authenticatePromise).rejects.toEqual(
        new Error("GUI host WebSocket is not available"),
      );
    },
  );

  it("makes new requests unavailable after invalidation without sending", async () => {
    const { session, socket } = createSession();
    session.invalidate("GUI host WebSocket is not available");
    const sentBeforeRequest = [...socket.sent];
    let settlement: TransportRequestSettlement<InitializeResponse> | undefined;

    const promise = session.request(requestDescriptors.initialize, initializeParams, (value) => {
      settlement = value;
    });

    expect(socket.sent).toEqual(sentBeforeRequest);
    expectFailure(settlement, "unavailable", "GUI host WebSocket is not available");
    await expect(promise).rejects.toEqual(new Error("GUI host WebSocket is not available"));

    const callbackError = new Error("unavailable settlement callback failed");
    expect(() =>
      session.request(requestDescriptors.initialize, initializeParams, () => {
        throw callbackError;
      }),
    ).toThrow(callbackError);
    await Promise.resolve();
  });

  it("uses one Error instance when invalidating multiple pending requests", async () => {
    const { session } = createSession();
    const failures: TransportRequestFailure[] = [];
    const firstPromise = session.request(
      requestDescriptors.initialize,
      initializeParams,
      (settlement) => {
        if (settlement.type === "failure") {
          failures.push(settlement.failure);
        }
      },
    );
    const secondPromise = session.request(
      requestDescriptors.initialize,
      initializeParams,
      (settlement) => {
        if (settlement.type === "failure") {
          failures.push(settlement.failure);
        }
      },
    );

    session.invalidate("connection lost");

    expect(failures).toHaveLength(2);
    expect(failures[0]?.source).toBe("unavailable");
    expect(failures[0]?.error).toEqual(new Error("connection lost"));
    expect(failures[0]?.error).toBe(failures[1]?.error);
    await expect(firstPromise).rejects.toBe(failures[0]?.error);
    await expect(secondPromise).rejects.toBe(failures[0]?.error);
  });

  it("settles every pending request before propagating the first invalidate callback error", async () => {
    const { session, socket } = createSession();
    const callbackError = new Error("first settlement callback failed");
    const secondCallbackError = new Error("second settlement callback failed");
    const callbacks: string[] = [];
    const firstPromise = session.request(requestDescriptors.initialize, initializeParams, () => {
      callbacks.push("first");
      throw callbackError;
    });
    const firstRejection = firstPromise.catch((error: unknown) => error);
    const firstId = requestId(socket);
    const secondPromise = session.request(requestDescriptors.initialize, initializeParams, () => {
      callbacks.push("second");
      throw secondCallbackError;
    });
    const secondRejection = secondPromise.catch((error: unknown) => error);
    const secondId = requestId(socket);
    let thrown: unknown;

    try {
      session.invalidate("connection lost");
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBe(callbackError);
    expect(callbacks).toEqual(["first", "second"]);
    const firstError = await firstRejection;
    const secondError = await secondRejection;
    expect(firstError).toBe(secondError);
    expect(firstError).toEqual(new Error("connection lost"));
    expect(session.settleMissingResult(firstId)).toBe(false);
    expect(session.settleMissingResult(secondId)).toBe(false);
  });

  it("keeps invalidate and close independent from handler detachment and each other", async () => {
    const invalidated = createSession();
    invalidated.session.invalidate("connection lost");

    expect(invalidated.socket.onopen).not.toBeNull();
    expect(invalidated.socket.onmessage).not.toBeNull();
    expect(invalidated.socket.onerror).not.toBeNull();
    expect(invalidated.socket.onclose).not.toBeNull();
    expect(invalidated.socket.closed).toEqual([]);

    const closed = createSession();
    const promise = closed.session.request(requestDescriptors.initialize, initializeParams);
    const id = requestId(closed.socket);
    closed.session.close(1000, "manual close");
    expect(closed.socket.onopen).not.toBeNull();
    expect(closed.socket.onmessage).not.toBeNull();
    expect(closed.socket.onerror).not.toBeNull();
    expect(closed.socket.onclose).not.toBeNull();
    expect(closed.socket.closed).toEqual([{ code: 1000, reason: "manual close" }]);
    expect(closed.socket.sent).toHaveLength(1);
    expect(closed.session.settleResult(id, initializeResponse)).toBe(true);
    await expect(promise).resolves.toBe(initializeResponse);
  });

  it("detaches handlers and closes once before propagating a dispose callback error", async () => {
    const { session, socket } = createSession();
    const callbackError = new Error("dispose settlement callback failed");
    const promise = session.request(requestDescriptors.initialize, initializeParams, () => {
      throw callbackError;
    });
    const rejection = promise.catch((error: unknown) => error);
    let thrown: unknown;

    try {
      session.dispose(1000, "cleanup");
    } catch (error) {
      thrown = error;
    }
    session.dispose(1000, "cleanup");

    expect(thrown).toBe(callbackError);
    expect(await rejection).toEqual(new Error("GUI host WebSocket is not available"));
    expect(socket.onopen).toBeNull();
    expect(socket.onmessage).toBeNull();
    expect(socket.onerror).toBeNull();
    expect(socket.onclose).toBeNull();
    expect(socket.closed).toEqual([{ code: 1000, reason: "cleanup" }]);
  });

  it("forwards raw socket open, message, error, and close facts synchronously", () => {
    const facts: unknown[] = [];
    const { socket } = createSession({
      onOpen: (event) => facts.push(["open", event]),
      onMessage: (event) => facts.push(["message", event]),
      onError: (event) => facts.push(["error", event]),
      onClose: (event) => facts.push(["close", event]),
    });
    const openEvent = new Event("open");
    const messageEvent = new MessageEvent("message", { data: "raw" });
    const errorEvent = new Event("error");
    const closeEvent = new CloseEvent("close", { code: 1006, reason: "lost" });

    socket.onopen?.(openEvent);
    expect(facts).toEqual([["open", openEvent]]);
    socket.onmessage?.(messageEvent);
    expect(facts.at(-1)).toEqual(["message", messageEvent]);
    socket.onerror?.(errorEvent);
    expect(facts.at(-1)).toEqual(["error", errorEvent]);
    socket.onclose?.(closeEvent);
    expect(facts.at(-1)).toEqual(["close", closeEvent]);
  });

  it("disposes idempotently by rejecting pending work, detaching handlers, and closing once", async () => {
    const { session, socket } = createSession();
    let settlement: TransportRequestSettlement<InitializeResponse> | undefined;
    const promise = session.request(requestDescriptors.initialize, initializeParams, (value) => {
      settlement = value;
    });

    session.dispose(1000, "cleanup");
    session.dispose(1000, "cleanup");

    expectFailure(settlement, "unavailable", "GUI host WebSocket is not available");
    await expect(promise).rejects.toEqual(new Error("GUI host WebSocket is not available"));
    expect(socket.onopen).toBeNull();
    expect(socket.onmessage).toBeNull();
    expect(socket.onerror).toBeNull();
    expect(socket.onclose).toBeNull();
    expect(socket.closed).toEqual([{ code: 1000, reason: "cleanup" }]);
  });
});
