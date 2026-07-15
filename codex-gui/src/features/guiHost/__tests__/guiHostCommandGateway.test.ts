import { describe, expect, it, vi } from "vitest";
import { inProgressTurn } from "@/features/projection/__tests__/projectionTestBuilders";
import type { TurnInterruptParams, TurnStartParams, TurnStartResponse } from "@codex-protocol/v2";
import type { GuiHostCommands } from "../guiHostClient";
import type { GuiHostRequestClient, GuiHostRpcResponse } from "../guiHostTransportSession";
import { GuiHostCommandGateway } from "../guiHostCommandGateway";

type DeferredRequest = {
  method: string;
  params: unknown;
  resolve: (response: GuiHostRpcResponse<unknown>) => void;
  reject: (error: unknown) => void;
};

class DeferredRequestClient implements GuiHostRequestClient {
  readonly requests: DeferredRequest[] = [];

  request<T>(method: string, params: unknown): Promise<GuiHostRpcResponse<T>> {
    return new Promise((resolve, reject) => {
      this.requests.push({
        method,
        params,
        resolve: (response) => {
          resolve(response as GuiHostRpcResponse<T>);
        },
        reject,
      });
    });
  }
}

const startParams: TurnStartParams = {
  threadId: "thread-1",
  clientUserMessageId: null,
  input: [{ type: "text", text: "Hello", text_elements: [] }],
};

const interruptParams: TurnInterruptParams = {
  threadId: "thread-1",
  turnId: "turn-1",
};

const unavailableMessage = "GUI host WebSocket is not available";

const readPrivateCommands = (gateway: GuiHostCommandGateway): GuiHostCommands =>
  (gateway as unknown as { commands: GuiHostCommands }).commands;

function requestAt(client: DeferredRequestClient, index: number): DeferredRequest {
  const request = client.requests[index];
  if (!request) {
    throw new Error(`Expected request at index ${String(index)}`);
  }
  return request;
}

function activate(gateway: GuiHostCommandGateway): GuiHostCommands {
  const commands = gateway.activate();
  if (!commands) {
    throw new Error("Expected gateway commands to be active");
  }
  return commands;
}

describe("GuiHostCommandGateway", () => {
  it("rejects both commands before activation without issuing requests", async () => {
    const client = new DeferredRequestClient();
    const gateway = new GuiHostCommandGateway(client, () => undefined);
    const commands = readPrivateCommands(gateway);

    await expect(commands.startTurn(startParams)).rejects.toThrow(unavailableMessage);
    await expect(commands.interruptTurn(interruptParams)).rejects.toThrow(unavailableMessage);
    expect(client.requests).toEqual([]);
  });

  it("does not expose a second public command API", () => {
    const client = new DeferredRequestClient();
    const gateway = new GuiHostCommandGateway(client, () => undefined);

    expect("startTurn" in gateway).toBe(false);
    expect("interruptTurn" in gateway).toBe(false);
  });

  it("returns one stable command handle across repeated activation", () => {
    const client = new DeferredRequestClient();
    const gateway = new GuiHostCommandGateway(client, () => undefined);

    const first = gateway.activate();
    const second = gateway.activate();

    expect(first).toBeDefined();
    expect(second).toBe(first);
  });

  it("maps command methods and preserves their params", () => {
    const client = new DeferredRequestClient();
    const gateway = new GuiHostCommandGateway(client, () => undefined);
    const commands = gateway.activate();

    void commands?.startTurn(startParams);
    void commands?.interruptTurn(interruptParams);

    expect(client.requests).toEqual([
      expect.objectContaining({ method: "turn/start", params: startParams }),
      expect.objectContaining({ method: "turn/interrupt", params: interruptParams }),
    ]);
  });

  it("resolves generated responses and defaults a missing result to an empty object", async () => {
    const client = new DeferredRequestClient();
    const gateway = new GuiHostCommandGateway(client, () => undefined);
    const commands = activate(gateway);
    const startResponse: TurnStartResponse = {
      turn: inProgressTurn("turn-started-by-command"),
    };

    const startPromise = commands.startTurn(startParams);
    requestAt(client, 0).resolve({ result: startResponse });
    await expect(startPromise).resolves.toEqual(startResponse);

    const interruptPromise = commands.interruptTurn(interruptParams);
    requestAt(client, 1).resolve({ result: undefined });
    await expect(interruptPromise).resolves.toEqual({});
  });

  it("isolates an RPC rejection and remains ready for the next command", async () => {
    const client = new DeferredRequestClient();
    const gateway = new GuiHostCommandGateway(client, () => undefined);
    const commands = activate(gateway);
    const error = new Error("active turn already running");

    const failed = commands.startTurn(startParams);
    requestAt(client, 0).reject(error);
    await expect(failed).rejects.toBe(error);

    const next = commands.interruptTurn(interruptParams);
    expect(client.requests[1]).toEqual(
      expect.objectContaining({ method: "turn/interrupt", params: interruptParams }),
    );
    requestAt(client, 1).resolve({ result: {} });
    await expect(next).resolves.toEqual({});
  });

  it("notifies once when a ready gateway is invalidated", () => {
    const onUnavailable = vi.fn<() => void>();
    const client = new DeferredRequestClient();
    const gateway = new GuiHostCommandGateway(client, onUnavailable);

    gateway.activate();
    gateway.invalidate();
    gateway.invalidate();

    expect(onUnavailable).toHaveBeenCalledOnce();
  });

  it("does not notify when an inactive gateway is invalidated", () => {
    const onUnavailable = vi.fn<() => void>();
    const client = new DeferredRequestClient();
    const gateway = new GuiHostCommandGateway(client, onUnavailable);

    gateway.invalidate();

    expect(onUnavailable).not.toHaveBeenCalled();
  });

  it("permanently rejects new and old-handle commands after invalidation", async () => {
    const client = new DeferredRequestClient();
    const gateway = new GuiHostCommandGateway(client, () => undefined);
    const commands = activate(gateway);

    gateway.invalidate();

    expect(gateway.activate()).toBeUndefined();
    await expect(commands.startTurn(startParams)).rejects.toThrow(unavailableMessage);
    await expect(commands.interruptTurn(interruptParams)).rejects.toThrow(unavailableMessage);
    expect(client.requests).toEqual([]);
  });
});
