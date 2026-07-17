import { describe, expect, it, vi } from "vitest";
import { attachBaseline } from "@/features/projection/__tests__/projectionFixtures";
import { inProgressTurn } from "@/features/projection/__tests__/projectionTestBuilders";
import type { GuiHostCommands } from "../guiHostClient";
import { GuiHostCommandGateway } from "../guiHostCommandGateway";
import { GuiHostTransportSession } from "../guiHostTransportSession";
import {
  RecordingWebSocket,
  readLatestRpcRequest,
  readRpcRequest,
  sendAttachResult,
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
    onOpen: vi.fn(),
    onMessage: vi.fn(),
    onError: vi.fn(),
    onClose: vi.fn(),
  });
  return { gateway: new GuiHostCommandGateway(transport), socket, transport };
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

    await expect(
      commands.interruptTurn({ threadId: "thread-1", turnId: "turn-1" }),
    ).rejects.toThrow("GUI host WebSocket is not available");
    expect(socket.sent).toEqual([]);
    expect(gateway.activate()).toBe(true);
    expect(gateway.activate()).toBe(false);
    expect(gateway.commands).toBe(commands);
  });

  it("maps startTurn and interruptTurn to their generated descriptors", async () => {
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

  it("keeps ready state after a single rpc, missing, malformed, or send failure", async () => {
    const rpc = setup();
    rpc.gateway.activate();
    const rpcPromise = rpc.gateway.commands.interruptTurn({
      threadId: "thread-1",
      turnId: "turn-rpc",
    });
    const rpcRequest = readRpcRequest(rpc.socket.sent[0] ?? "");
    rpc.transport.settleRpcError(rpcRequest.id, { code: -32000, message: "rejected" });
    await expect(rpcPromise).rejects.toThrow("rejected");
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
    await expect(missingPromise).rejects.toThrow("returned no result payload");
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
    await expect(malformedPromise).rejects.toThrow("returned malformed result payload");
    expect(malformed.gateway.activate()).toBe(false);
    await expectInterruptStillWorks(malformed, "turn-after-malformed");

    const sendSocket = new FailOnceWebSocket();
    const send = setup(sendSocket);
    send.gateway.activate();
    sendSocket.failNextSend = true;
    await expect(
      send.gateway.commands.interruptTurn({ threadId: "thread-1", turnId: "turn-send" }),
    ).rejects.toThrow("send failed");
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

    await expect(
      commands.interruptTurn({ threadId: "thread-1", turnId: "turn-after-close" }),
    ).rejects.toThrow("GUI host WebSocket is not available");
    expect(socket.sent).toEqual([]);
  });
});

describe("GuiHostCommandGateway facade integration", () => {
  it.each(["projection", "attached status"] as const)(
    "does not publish commands when %s callback cleans up",
    (cleanupAt) => {
      const calls: string[] = [];
      let cleanup = (): void => undefined;
      const connection = startGuiHostConnectionWithSocket({
        attachResponse: attachBaseline,
        onProjectionAttached: () => {
          calls.push("projection-attached");
          if (cleanupAt === "projection") {
            cleanup();
          }
        },
        onStatus: (status) => {
          calls.push(`status:${status.label}`);
          if (cleanupAt === "attached status" && status.label === "attached") {
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
      sendInitializeResult(connection.socket);
      calls.length = 0;
      sendAttachResult(connection.socket, attachBaseline);

      expect(calls).toEqual(
        cleanupAt === "projection"
          ? ["projection-attached"]
          : ["projection-attached", "status:attached"],
      );
      expect(connection.socket.sent.map(readRpcRequest)).toHaveLength(3);
    },
  );

  it("invalidates once when onCommandsReady cleans up and reuses the old handle", async () => {
    const calls: string[] = [];
    let cleanup = (): void => undefined;
    let commandPromise: Promise<unknown> | undefined;
    let commands: GuiHostCommands | undefined;
    const connection = startGuiHostConnectionWithSocket({
      attachResponse: attachBaseline,
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
    sendAttachResult(connection.socket, attachBaseline);

    expect(calls).toEqual(["commands-ready", "commands-unavailable"]);
    expect(commands).toBeDefined();
    await expect(commandPromise).rejects.toThrow("GUI host WebSocket is not available");
    expect(connection.socket.sent.map(readRpcRequest)).toHaveLength(3);
  });
});
