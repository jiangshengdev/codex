import { describe, expect, it, vi } from "vitest";
import { inProgressTurn } from "@/features/projection/__tests__/projectionTestBuilders";
import type { JSONRPCErrorError } from "@codex-protocol/JSONRPCErrorError";
import {
  isGuiHostCommandError,
  type GuiHostCommandFailureSource,
  type GuiHostCommands,
} from "../guiHostClient";
import { GuiHostCommandGateway } from "../guiHostCommandGateway";
import { GuiHostTransportSession, type TransportRequestDelivery } from "../guiHostTransportSession";
import {
  RecordingWebSocket,
  readLatestRpcRequest,
  readRpcRequest,
  sendAuthenticateResult,
  sendInitializeResult,
  startGuiHostConnectionWithSocket,
} from "./guiHostClientTestSupport";

class FailOnceWebSocket extends RecordingWebSocket {
  failNextSend = false;

  override send(message: string): void {
    if (this.failNextSend) {
      this.failNextSend = false;
      throw new Error("send failed");
    }
    super.send(message);
  }
}

function setup(socket: RecordingWebSocket = new RecordingWebSocket()) {
  const transport = new GuiHostTransportSession(socket as unknown as WebSocket, {
    onOpen: vi.fn<() => void>(),
    onMessage: vi.fn<(data: unknown) => void>(),
    onError: vi.fn<() => void>(),
    onClose: vi.fn<(event: { code: number; reason: string }) => void>(),
  });
  return { gateway: new GuiHostCommandGateway(transport), socket, transport };
}

const rpcErrorClassificationCases: ReadonlyArray<
  readonly [string, JSONRPCErrorError["data"] | undefined, boolean]
> = [
  [
    "complete active-turn error",
    {
      message: "cannot steer a review turn",
      codexErrorInfo: { activeTurnNotSteerable: { turnKind: "review" } },
      additionalDetails: null,
    },
    true,
  ],
  [
    "generic turn error",
    { message: "request failed", codexErrorInfo: "badRequest", additionalDetails: null },
    false,
  ],
  ["message-only turn error", { message: "request failed" }, false],
  ["null codex error info", { message: "request failed", codexErrorInfo: null }, false],
  ["string data", "request failed", false],
  ["unrelated object data", { unrelated: true }, false],
  [
    "malformed turn error",
    {
      message: 42,
      codexErrorInfo: { activeTurnNotSteerable: { turnKind: "review" } },
    },
    false,
  ],
  ["no data", undefined, false],
];

async function expectCommandFailure(
  promise: Promise<unknown>,
  source: GuiHostCommandFailureSource,
  delivery: TransportRequestDelivery,
  message: string,
): Promise<void> {
  const error: unknown = await promise.catch((failure: unknown) => failure);
  if (!isGuiHostCommandError(error)) {
    throw new Error("Expected GuiHostCommandError");
  }
  expect(error.source).toBe(source);
  expect(error.delivery).toBe(delivery);
  expect(error.message).toContain(message);
  if (!(error.cause instanceof Error)) {
    throw new Error("Expected GuiHostCommandError cause");
  }
  expect(error.cause).toBeInstanceOf(Error);
  expect(error.message).toBe(error.cause.message);
}

async function expectInterruptStillWorks(
  state: ReturnType<typeof setup>,
  turnId: string,
): Promise<void> {
  const promise = state.gateway.commands.interruptTurn({
    threadId: "thread-1",
    turnId,
  });
  const request = readLatestRpcRequest(state.socket, "turn/interrupt");
  const response = {};
  state.transport.settleResult(request.id, response);
  await expect(promise).resolves.toBe(response);
}

describe("GuiHostCommandGateway", () => {
  it("publishes one stable handle only after activation", async () => {
    const { gateway, socket } = setup();
    const commands = gateway.commands;

    await expectCommandFailure(
      commands.interruptTurn({ threadId: "thread-1", turnId: "turn-1" }),
      "unavailable",
      "definitelyNotAccepted",
      "GUI host WebSocket is not available",
    );
    expect(socket.sent).toEqual([]);
    expect(gateway.activate()).toBe(true);
    expect(gateway.activate()).toBe(false);
    expect(gateway.commands).toBe(commands);
  });

  it("maps startTurn, steerTurn, and interruptTurn to their generated descriptors", async () => {
    const { gateway, socket, transport } = setup();
    gateway.activate();
    const startParams = {
      threadId: "thread-1",
      clientUserMessageId: null,
      input: [{ type: "text" as const, text: "Hello", text_elements: [] }],
    };
    const startPromise = gateway.commands.startTurn(startParams);
    const startRequest = readLatestRpcRequest(socket, "turn/start");
    expect(startRequest).toEqual({
      jsonrpc: "2.0",
      id: startRequest.id,
      method: "turn/start",
      params: startParams,
    });
    const startResponse = { turn: inProgressTurn("turn-1") };
    transport.settleResult(startRequest.id, startResponse);
    await expect(startPromise).resolves.toBe(startResponse);

    const steerParams = {
      threadId: "thread-1",
      expectedTurnId: "turn-1",
      clientUserMessageId: null,
      input: [{ type: "text" as const, text: "Guide", text_elements: [] }],
    };
    const steerPromise = gateway.commands.steerTurn(steerParams);
    const steerRequest = readLatestRpcRequest(socket, "turn/steer");
    expect(steerRequest).toEqual({
      jsonrpc: "2.0",
      id: steerRequest.id,
      method: "turn/steer",
      params: steerParams,
    });
    const steerResponse = { turnId: "turn-1" };
    transport.settleResult(steerRequest.id, steerResponse);
    await expect(steerPromise).resolves.toBe(steerResponse);

    const interruptParams = { threadId: "thread-1", turnId: "turn-1" };
    const interruptPromise = gateway.commands.interruptTurn(interruptParams);
    const interruptRequest = readLatestRpcRequest(socket, "turn/interrupt");
    expect(interruptRequest).toEqual({
      jsonrpc: "2.0",
      id: interruptRequest.id,
      method: "turn/interrupt",
      params: interruptParams,
    });
    const interruptResponse = {};
    transport.settleResult(interruptRequest.id, interruptResponse);
    await expect(interruptPromise).resolves.toBe(interruptResponse);
  });

  it.each(rpcErrorClassificationCases)(
    "classifies %s from validated RPC error data",
    async (_, data, expected) => {
      const { gateway, socket, transport } = setup();
      gateway.activate();
      const promise = gateway.commands.steerTurn({
        threadId: "thread-1",
        expectedTurnId: "turn-1",
        clientUserMessageId: null,
        input: [{ type: "text", text: "Guide", text_elements: [] }],
      });
      const request = readLatestRpcRequest(socket, "turn/steer");
      const rpcError: JSONRPCErrorError = {
        code: -32000,
        message: "request failed",
        ...(data === undefined ? {} : { data }),
      };

      transport.settleRpcError(request.id, rpcError);

      const error: unknown = await promise.catch((failure: unknown) => failure);
      if (!isGuiHostCommandError(error)) {
        throw new Error("Expected GuiHostCommandError");
      }
      expect(error.rpcError).toBe(rpcError);
      expect(error.activeTurnNotSteerable).toBe(expected);
    },
  );

  it("keeps ready state after a single rpc, missing, malformed, or send failure", async () => {
    const rpc = setup();
    rpc.gateway.activate();
    const rpcPromise = rpc.gateway.commands.interruptTurn({
      threadId: "thread-1",
      turnId: "turn-rpc",
    });
    const rpcRequest = readRpcRequest(rpc.socket.sent[0] ?? "");
    rpc.transport.settleRpcError(rpcRequest.id, { code: -32000, message: "rejected" });
    await expectCommandFailure(rpcPromise, "rpc", "definitelyNotAccepted", "rejected");
    expect(rpc.gateway.activate()).toBe(false);
    await expectInterruptStillWorks(rpc, "turn-after-rpc");

    const missing = setup();
    missing.gateway.activate();
    const missingPromise = missing.gateway.commands.interruptTurn({
      threadId: "thread-1",
      turnId: "turn-missing",
    });
    const missingRequest = readRpcRequest(missing.socket.sent[0] ?? "");
    missing.transport.settleMissingResult(missingRequest.id);
    await expectCommandFailure(
      missingPromise,
      "missingResult",
      "deliveryUnknown",
      "returned no result payload",
    );
    expect(missing.gateway.activate()).toBe(false);
    await expectInterruptStillWorks(missing, "turn-after-missing");

    const malformed = setup();
    malformed.gateway.activate();
    const malformedPromise = malformed.gateway.commands.startTurn({
      threadId: "thread-1",
      clientUserMessageId: null,
      input: [],
    });
    const malformedRequest = readRpcRequest(malformed.socket.sent[0] ?? "");
    malformed.transport.settleResult(malformedRequest.id, { turn: null });
    await expectCommandFailure(
      malformedPromise,
      "malformedResult",
      "deliveryUnknown",
      "returned malformed result payload",
    );
    expect(malformed.gateway.activate()).toBe(false);
    await expectInterruptStillWorks(malformed, "turn-after-malformed");

    const sendSocket = new FailOnceWebSocket();
    const send = setup(sendSocket);
    send.gateway.activate();
    sendSocket.failNextSend = true;
    await expectCommandFailure(
      send.gateway.commands.interruptTurn({ threadId: "thread-1", turnId: "turn-send" }),
      "send",
      "definitelyNotAccepted",
      "send failed",
    );
    expect(send.gateway.activate()).toBe(false);
    await expectInterruptStillWorks(send, "turn-after-send");
  });

  it("permanently invalidates the old stable handle", async () => {
    const { gateway, socket } = setup();
    const commands = gateway.commands;
    expect(gateway.activate()).toBe(true);
    expect(gateway.invalidate()).toBe(true);
    expect(gateway.invalidate()).toBe(false);
    expect(gateway.activate()).toBe(false);

    await expectCommandFailure(
      commands.interruptTurn({ threadId: "thread-1", turnId: "turn-after-close" }),
      "unavailable",
      "definitelyNotAccepted",
      "GUI host WebSocket is not available",
    );
    expect(socket.sent).toEqual([]);
  });
});

describe("GuiHostCommandGateway facade integration", () => {
  it("does not publish commands when the initialized status callback cleans up", () => {
    const calls: string[] = [];
    let cleanup = (): void => undefined;
    const connection = startGuiHostConnectionWithSocket({
      onStatus: (status) => {
        calls.push(`status:${status.label}`);
        if (status.label === "initialized") {
          cleanup();
        }
      },
      onCommandsReady: () => {
        calls.push("commands-ready");
      },
      onCommandsUnavailable: () => {
        calls.push("commands-unavailable");
      },
    });
    cleanup = connection.cleanup;

    connection.socket.onopen?.();
    sendAuthenticateResult(connection.socket);
    calls.length = 0;
    sendInitializeResult(connection.socket);

    expect(calls).toEqual(["status:initialized"]);
    expect(connection.socket.sent.map(readRpcRequest)).toHaveLength(2);
  });

  it("invalidates once when onCommandsReady cleans up and reuses the old handle", async () => {
    const calls: string[] = [];
    let cleanup = (): void => undefined;
    let commandPromise: Promise<unknown> | undefined;
    let commands: GuiHostCommands | undefined;
    const connection = startGuiHostConnectionWithSocket({
      onCommandsReady: (readyCommands) => {
        calls.push("commands-ready");
        commands = readyCommands;
        cleanup();
        cleanup();
        commandPromise = readyCommands.interruptTurn({
          threadId: "thread-1",
          turnId: "turn-after-cleanup",
        });
      },
      onCommandsUnavailable: () => {
        calls.push("commands-unavailable");
      },
    });
    cleanup = connection.cleanup;

    connection.socket.onopen?.();
    sendAuthenticateResult(connection.socket);
    sendInitializeResult(connection.socket);

    expect(calls).toEqual(["commands-ready", "commands-unavailable"]);
    expect(commands).toBeDefined();
    await expect(commandPromise).rejects.toThrow("GUI host WebSocket is not available");
    expect(connection.socket.sent.map(readRpcRequest)).toHaveLength(2);
  });
});
