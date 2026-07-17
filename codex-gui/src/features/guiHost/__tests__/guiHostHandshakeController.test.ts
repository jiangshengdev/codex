import { describe, expect, it } from "vitest";
import type { InitializeResponse } from "@codex-protocol/InitializeResponse";
import { attachBaseline } from "@/features/projection/__tests__/projectionFixtures";
import {
  GuiHostHandshakeController,
  type GuiHostHandshakeCallbacks,
  type GuiHostHandshakeTerminalFailure,
} from "../guiHostHandshakeController";
import { GuiHostTransportSession } from "../guiHostTransportSession";

class RecordingSocket {
  sent: string[] = [];
  readyState: number = WebSocket.OPEN;
  onerror: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onopen: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;

  send(message: string): void {
    this.sent.push(message);
  }

  close(): void {
    this.readyState = WebSocket.CLOSED;
  }
}

type RpcRequest = {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params: unknown;
};

const initializeResponse: InitializeResponse = {
  userAgent: "codex-test",
  codexHome: "/codex-home",
  platformFamily: "test",
  platformOs: "test",
};

const defaultCallbacks: GuiHostHandshakeCallbacks = {
  onAuthenticated: () => undefined,
  onInitialized: () => undefined,
  onAttached: () => undefined,
  onTerminalFailure: () => undefined,
};

function createHarness(callbacks: Partial<GuiHostHandshakeCallbacks> = {}): {
  controller: GuiHostHandshakeController;
  session: GuiHostTransportSession;
  socket: RecordingSocket;
} {
  const socket = new RecordingSocket();
  const session = new GuiHostTransportSession(socket as unknown as WebSocket);
  const controller = new GuiHostHandshakeController({
    requests: session,
    token: "secret",
    threadId: "thread-1",
    callbacks: { ...defaultCallbacks, ...callbacks },
  });
  return { controller, session, socket };
}

function requestAt(socket: RecordingSocket, index: number): RpcRequest {
  const request = JSON.parse(socket.sent[index] ?? "null") as Partial<RpcRequest> | null;
  if (
    request?.jsonrpc !== "2.0" ||
    typeof request.id !== "number" ||
    typeof request.method !== "string"
  ) {
    throw new Error(`Expected JSON-RPC request at index ${String(index)}`);
  }
  return request as RpcRequest;
}

function settleAuthenticated(session: GuiHostTransportSession, socket: RecordingSocket): void {
  expect(session.settleResult(requestAt(socket, 0).id, { authenticated: true })).toBe(true);
}

function settleInitialized(session: GuiHostTransportSession, socket: RecordingSocket): void {
  expect(session.settleResult(requestAt(socket, 1).id, initializeResponse)).toBe(true);
}

describe("GuiHostHandshakeController", () => {
  it("advances synchronously through authenticate, initialize, and attach with exact params and callback order", () => {
    const calls: string[] = [];
    const { controller, session, socket } = createHarness({
      onAuthenticated: () => calls.push("authenticated"),
      onInitialized: () => calls.push("initialized"),
      onAttached: (response) => {
        expect(response).toBe(attachBaseline);
        calls.push("attached");
      },
    });

    controller.start();
    expect(requestAt(socket, 0)).toEqual({
      jsonrpc: "2.0",
      id: 1,
      method: "gui/authenticate",
      params: { token: "secret" },
    });

    settleAuthenticated(session, socket);
    expect(calls).toEqual(["authenticated"]);
    expect(requestAt(socket, 1)).toEqual({
      jsonrpc: "2.0",
      id: 2,
      method: "initialize",
      params: {
        clientInfo: { name: "codex-gui", title: null, version: "0.0.0" },
        capabilities: null,
      },
    });

    settleInitialized(session, socket);
    expect(calls).toEqual(["authenticated", "initialized"]);
    expect(requestAt(socket, 2)).toEqual({
      jsonrpc: "2.0",
      id: 3,
      method: "thread/projection/attach",
      params: { threadId: "thread-1" },
    });

    expect(session.settleResult(requestAt(socket, 2).id, attachBaseline)).toBe(true);
    expect(calls).toEqual(["authenticated", "initialized", "attached"]);
  });

  it("starts only once and ignores settlements after stop", () => {
    const calls: string[] = [];
    const { controller, session, socket } = createHarness({
      onAuthenticated: () => calls.push("authenticated"),
      onInitialized: () => calls.push("initialized"),
      onAttached: () => calls.push("attached"),
      onTerminalFailure: () => calls.push("failure"),
    });

    controller.start();
    controller.start();
    expect(socket.sent).toHaveLength(1);

    controller.stop();
    expect(session.settleResult(requestAt(socket, 0).id, { authenticated: true })).toBe(true);
    expect(socket.sent).toHaveLength(1);
    expect(calls).toEqual([]);
  });

  it("does not initialize when the authenticated callback stops the controller", () => {
    const calls: string[] = [];
    const harness = createHarness({
      onAuthenticated: () => {
        calls.push("authenticated");
        harness.controller.stop();
      },
    });

    harness.controller.start();
    settleAuthenticated(harness.session, harness.socket);

    expect(calls).toEqual(["authenticated"]);
    expect(harness.socket.sent).toHaveLength(1);
    expect(requestAt(harness.socket, 0).method).toBe("gui/authenticate");
  });

  it("does not attach when the initialized callback stops the controller", () => {
    const calls: string[] = [];
    const harness = createHarness({
      onInitialized: () => {
        calls.push("initialized");
        harness.controller.stop();
      },
    });

    harness.controller.start();
    settleAuthenticated(harness.session, harness.socket);
    settleInitialized(harness.session, harness.socket);

    expect(calls).toEqual(["initialized"]);
    expect(harness.socket.sent).toHaveLength(2);
    expect(requestAt(harness.socket, 1).method).toBe("initialize");
  });

  it.each([
    ["authenticate", -32001, "authentication failed"],
    ["initialize", -32002, "initialization failed"],
    ["thread/projection/attach", -32003, "attachment failed"],
  ])("maps an RPC failure during %s to a handshake terminal failure", (stage, code, message) => {
    const failures: GuiHostHandshakeTerminalFailure[] = [];
    const { controller, session, socket } = createHarness({
      onTerminalFailure: (failure) => failures.push(failure),
    });
    controller.start();
    if (stage !== "authenticate") {
      settleAuthenticated(session, socket);
    }
    if (stage === "thread/projection/attach") {
      settleInitialized(session, socket);
    }
    const request = requestAt(socket, socket.sent.length - 1);

    expect(session.settleRpcError(request.id, { code, message })).toBe(true);
    expect(failures).toEqual([
      {
        message: `JSON-RPC error (id=${String(request.id)}, code=${String(code)}): ${message}`,
        closeReason: "handshake error",
      },
    ]);
  });

  it.each([
    [
      "authenticate missing",
      "authenticate",
      "missing",
      "gui/authenticate returned malformed result payload",
    ],
    [
      "authenticate malformed",
      "authenticate",
      "malformed",
      "gui/authenticate returned malformed result payload",
    ],
    ["initialize missing", "initialize", "missing", "initialize returned no result payload"],
    [
      "initialize malformed",
      "initialize",
      "malformed",
      "initialize returned malformed result payload",
    ],
    [
      "attach missing",
      "thread/projection/attach",
      "missing",
      "thread/projection/attach returned no result payload",
    ],
    [
      "attach malformed",
      "thread/projection/attach",
      "malformed",
      "thread/projection/attach returned malformed result payload",
    ],
  ])("maps %s to a protocol terminal failure", (_, stage, resultKind, message) => {
    const failures: GuiHostHandshakeTerminalFailure[] = [];
    const { controller, session, socket } = createHarness({
      onTerminalFailure: (failure) => failures.push(failure),
    });
    controller.start();
    if (stage !== "authenticate") {
      settleAuthenticated(session, socket);
    }
    if (stage === "thread/projection/attach") {
      settleInitialized(session, socket);
    }
    const request = requestAt(socket, socket.sent.length - 1);

    if (resultKind === "missing") {
      expect(session.settleMissingResult(request.id)).toBe(true);
    } else {
      expect(session.settleResult(request.id, {})).toBe(true);
    }
    expect(failures).toEqual([{ message, closeReason: "protocol error" }]);
  });

  it("treats authenticated false as the exact malformed authenticate protocol failure", () => {
    const failures: GuiHostHandshakeTerminalFailure[] = [];
    const { controller, session, socket } = createHarness({
      onTerminalFailure: (failure) => failures.push(failure),
    });
    controller.start();

    expect(session.settleResult(requestAt(socket, 0).id, { authenticated: false })).toBe(true);
    expect(socket.sent).toHaveLength(1);
    expect(failures).toEqual([
      {
        message: "gui/authenticate returned malformed result payload",
        closeReason: "protocol error",
      },
    ]);
  });

  it("silently stops on unavailable settlement without an unhandled rejection", async () => {
    const calls: string[] = [];
    const { controller, session, socket } = createHarness({
      onAuthenticated: () => calls.push("authenticated"),
      onTerminalFailure: () => calls.push("failure"),
    });
    controller.start();

    session.invalidate("unavailable");
    await Promise.resolve();

    expect(socket.sent).toHaveLength(1);
    expect(calls).toEqual([]);
  });

  it("silently stops on immediate send failure without an unhandled rejection", async () => {
    const calls: string[] = [];
    const { controller, socket } = createHarness({
      onTerminalFailure: () => calls.push("failure"),
    });
    socket.send = () => {
      throw new Error("send failed");
    };

    controller.start();
    await Promise.resolve();

    expect(calls).toEqual([]);
  });

  it("keeps a terminal callback exception synchronous and visible", async () => {
    const callbackError = new Error("terminal callback failed");
    const { controller, session, socket } = createHarness({
      onTerminalFailure: () => {
        throw callbackError;
      },
    });
    controller.start();

    expect(() =>
      session.settleRpcError(requestAt(socket, 0).id, {
        code: -32000,
        message: "authentication failed",
      }),
    ).toThrow(callbackError);
    await Promise.resolve();
  });

  it("does not reclassify or swallow a synchronous milestone callback exception", async () => {
    const callbackError = new Error("authenticated callback failed");
    const failures: GuiHostHandshakeTerminalFailure[] = [];
    const { controller, session, socket } = createHarness({
      onAuthenticated: () => {
        throw callbackError;
      },
      onTerminalFailure: (failure) => failures.push(failure),
    });
    controller.start();

    expect(() => session.settleResult(requestAt(socket, 0).id, { authenticated: true })).toThrow(
      callbackError,
    );
    await Promise.resolve();

    expect(socket.sent).toHaveLength(1);
    expect(failures).toEqual([]);
  });
});
