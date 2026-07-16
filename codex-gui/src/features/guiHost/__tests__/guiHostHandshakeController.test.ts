import { describe, expect, it, vi } from "vitest";
import { attachBaseline } from "@/features/projection/__tests__/projectionFixtures";
import type { GuiHostRequestClient, GuiHostRpcResponse } from "../guiHostTransportSession";
import { GuiHostRequestError, GuiHostTransportSession } from "../guiHostTransportSession";
import { GuiHostHandshakeController } from "../guiHostHandshakeController";

type DeferredRequest = {
  method: string;
  params: unknown;
  resolve: (response: GuiHostRpcResponse<unknown>) => void;
  reject: (error: unknown) => void;
};

class DeferredRequestClient implements GuiHostRequestClient {
  readonly requests: DeferredRequest[] = [];
  readonly calls: string[];

  constructor(calls: string[] = []) {
    this.calls = calls;
  }

  request<T>(method: string, params: unknown): Promise<GuiHostRpcResponse<T>> {
    this.calls.push(`request:${method}`);
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

const flushMicrotasks = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

const resolveRequest = async (request: DeferredRequest, result: unknown): Promise<void> => {
  request.resolve({ result });
  await flushMicrotasks();
};

function createController(
  client: GuiHostRequestClient,
  overrides: Partial<{
    onAuthenticated: () => void;
    onInitialized: () => void;
    onAttached: (response: typeof attachBaseline) => void;
    onTerminalError: (message: string, closeReason: string) => void;
  }> = {},
) {
  return new GuiHostHandshakeController(client, {
    token: "secret-token",
    threadId: attachBaseline.snapshot.thread.id,
    onAuthenticated: () => undefined,
    onInitialized: () => undefined,
    onAttached: () => undefined,
    onTerminalError: () => undefined,
    ...overrides,
  });
}

function runController(controller: GuiHostHandshakeController): Promise<void> {
  return (controller as unknown as { run(): Promise<void> }).run();
}

function requestAt(client: DeferredRequestClient, index: number): DeferredRequest {
  const request = client.requests[index];
  if (!request) {
    throw new Error(`Expected request at index ${String(index)}`);
  }
  return request;
}

async function completeAuthentication(client: DeferredRequestClient): Promise<void> {
  await resolveRequest(requestAt(client, 0), { authenticated: true });
}

async function completeInitialization(client: DeferredRequestClient): Promise<void> {
  await resolveRequest(requestAt(client, 1), {});
}

describe("GuiHostHandshakeController", () => {
  it("starts one authentication chain with the launch token", () => {
    const client = new DeferredRequestClient();
    const controller = createController(client);

    controller.start();
    controller.start();

    expect(client.requests).toEqual([
      expect.objectContaining({
        method: "gui/authenticate",
        params: { token: "secret-token" },
      }),
    ]);
  });

  it("emits authenticated before requesting initialize with exact params", async () => {
    const calls: string[] = [];
    const client = new DeferredRequestClient(calls);
    const controller = createController(client, {
      onAuthenticated: () => calls.push("authenticated"),
    });

    controller.start();
    await completeAuthentication(client);

    expect(calls).toEqual(["request:gui/authenticate", "authenticated", "request:initialize"]);
    expect(client.requests[1]).toEqual(
      expect.objectContaining({
        method: "initialize",
        params: {
          clientInfo: { name: "codex-gui", version: "0.0.0" },
          capabilities: {},
        },
      }),
    );
  });

  it("does not initialize when onAuthenticated synchronously stops the controller", async () => {
    const onAuthenticated = vi.fn<() => void>();
    const client = new DeferredRequestClient();
    const controller = createController(client, {
      onAuthenticated: () => {
        onAuthenticated();
        controller.stop();
      },
    });

    controller.start();
    await completeAuthentication(client);

    expect(onAuthenticated).toHaveBeenCalledOnce();
    expect(client.requests).toHaveLength(1);
  });

  it("rejects the handshake run when onAuthenticated synchronously throws", async () => {
    const callbackError = new Error("authenticated callback failed");
    const onTerminalError = vi.fn<(message: string, closeReason: string) => void>();
    const client = new DeferredRequestClient();
    const controller = createController(client, {
      onAuthenticated: () => {
        throw callbackError;
      },
      onTerminalError,
    });

    const observedError = runController(controller).catch((error: unknown) => error);
    await completeAuthentication(client);

    await expect(observedError).resolves.toBe(callbackError);
    expect(onTerminalError).not.toHaveBeenCalled();
    expect(client.requests).toHaveLength(1);
  });

  it("emits initialized before requesting projection attachment", async () => {
    const calls: string[] = [];
    const client = new DeferredRequestClient(calls);
    const controller = createController(client, {
      onInitialized: () => calls.push("initialized"),
    });

    controller.start();
    await completeAuthentication(client);
    calls.length = 0;
    await completeInitialization(client);

    expect(calls).toEqual(["initialized", "request:thread/projection/attach"]);
    expect(client.requests[2]).toEqual(
      expect.objectContaining({
        method: "thread/projection/attach",
        params: { threadId: attachBaseline.snapshot.thread.id },
      }),
    );
  });

  it("does not attach when onInitialized synchronously stops the controller", async () => {
    const onInitialized = vi.fn<() => void>();
    const client = new DeferredRequestClient();
    const controller = createController(client, {
      onInitialized: () => {
        onInitialized();
        controller.stop();
      },
    });

    controller.start();
    await completeAuthentication(client);
    await completeInitialization(client);

    expect(onInitialized).toHaveBeenCalledOnce();
    expect(client.requests).toHaveLength(2);
  });

  it("forwards one valid attachment and completes the handshake", async () => {
    const onAttached = vi.fn<(response: typeof attachBaseline) => void>();
    const onTerminalError = vi.fn<(message: string, closeReason: string) => void>();
    const client = new DeferredRequestClient();
    const controller = createController(client, { onAttached, onTerminalError });

    controller.start();
    await completeAuthentication(client);
    await completeInitialization(client);
    await resolveRequest(requestAt(client, 2), attachBaseline);

    expect(onAttached).toHaveBeenCalledExactlyOnceWith(attachBaseline);
    expect(onTerminalError).not.toHaveBeenCalled();
    expect(client.requests).toHaveLength(3);
  });

  it("rejects the handshake run when onAttached synchronously throws", async () => {
    const callbackError = new Error("attached callback failed");
    const onTerminalError = vi.fn<(message: string, closeReason: string) => void>();
    const client = new DeferredRequestClient();
    const controller = createController(client, {
      onAttached: () => {
        throw callbackError;
      },
      onTerminalError,
    });

    const observedError = runController(controller).catch((error: unknown) => error);
    await completeAuthentication(client);
    await completeInitialization(client);
    await resolveRequest(requestAt(client, 2), attachBaseline);

    await expect(observedError).resolves.toBe(callbackError);
    expect(onTerminalError).not.toHaveBeenCalled();
    expect(client.requests).toHaveLength(3);
  });

  it("stops without milestones or terminal errors when authentication is not true", async () => {
    const onAuthenticated = vi.fn<() => void>();
    const onInitialized = vi.fn<() => void>();
    const onAttached = vi.fn<(response: typeof attachBaseline) => void>();
    const onTerminalError = vi.fn<(message: string, closeReason: string) => void>();
    const client = new DeferredRequestClient();
    const controller = createController(client, {
      onAuthenticated,
      onInitialized,
      onAttached,
      onTerminalError,
    });

    controller.start();
    await resolveRequest(requestAt(client, 0), { authenticated: false });

    expect(client.requests).toHaveLength(1);
    expect(onAuthenticated).not.toHaveBeenCalled();
    expect(onInitialized).not.toHaveBeenCalled();
    expect(onAttached).not.toHaveBeenCalled();
    expect(onTerminalError).not.toHaveBeenCalled();
  });

  it.each([undefined, null])(
    "reports a missing initialize result as a protocol error",
    async (result) => {
      const onTerminalError = vi.fn<(message: string, closeReason: string) => void>();
      const client = new DeferredRequestClient();
      const controller = createController(client, { onTerminalError });

      controller.start();
      await completeAuthentication(client);
      await resolveRequest(requestAt(client, 1), result);

      expect(onTerminalError).toHaveBeenCalledExactlyOnceWith(
        "initialize returned no result payload",
        "protocol error",
      );
      expect(client.requests).toHaveLength(2);
    },
  );

  it.each([
    [undefined, "thread/projection/attach returned no result payload"],
    [null, "thread/projection/attach returned no result payload"],
    [{ subscriptionId: "sub-only" }, "thread/projection/attach returned malformed result payload"],
  ])("reports an invalid attach result as a protocol error", async (result, message) => {
    const onAttached = vi.fn<(response: typeof attachBaseline) => void>();
    const onTerminalError = vi.fn<(message: string, closeReason: string) => void>();
    const client = new DeferredRequestClient();
    const controller = createController(client, { onAttached, onTerminalError });

    controller.start();
    await completeAuthentication(client);
    await completeInitialization(client);
    await resolveRequest(requestAt(client, 2), result);

    expect(onAttached).not.toHaveBeenCalled();
    expect(onTerminalError).toHaveBeenCalledExactlyOnceWith(message, "protocol error");
  });

  it("reports a correlated RPC failure with the exact error message", async () => {
    const onTerminalError = vi.fn<(message: string, closeReason: string) => void>();
    const client = new DeferredRequestClient();
    const controller = createController(client, { onTerminalError });
    const error = new GuiHostRequestError("rpc", "method not found");

    controller.start();
    requestAt(client, 0).reject(error);
    await flushMicrotasks();

    expect(onTerminalError).toHaveBeenCalledExactlyOnceWith("method not found", "handshake error");
  });

  it("consumes send, unavailable, and unknown failures without a terminal error", async () => {
    const sendSourceError = new GuiHostRequestError("rpc", "write failed");
    const socket = {
      readyState: WebSocket.OPEN,
      send: () => {
        throw sendSourceError;
      },
    } as unknown as WebSocket;
    const session = new GuiHostTransportSession(socket, {
      onOpen: () => undefined,
      onError: () => undefined,
      onClose: () => undefined,
      onMessage: () => undefined,
    });
    const classifiedSendError = await session.request("probe", {}).catch((error: unknown) => error);
    const failures = [
      classifiedSendError,
      new GuiHostRequestError("unavailable", "GUI host WebSocket is not available"),
      new Error("unclassified failure"),
    ];

    for (const failure of failures) {
      const onTerminalError = vi.fn<(message: string, closeReason: string) => void>();
      const client = new DeferredRequestClient();
      const controller = createController(client, { onTerminalError });

      controller.start();
      requestAt(client, 0).reject(failure);
      await flushMicrotasks();

      expect(onTerminalError).not.toHaveBeenCalled();
    }
  });

  it("ignores a resolved authentication request after stop", async () => {
    const onAuthenticated = vi.fn<() => void>();
    const client = new DeferredRequestClient();
    const controller = createController(client, { onAuthenticated });

    controller.start();
    controller.stop();
    await resolveRequest(requestAt(client, 0), { authenticated: true });

    expect(onAuthenticated).not.toHaveBeenCalled();
    expect(client.requests).toHaveLength(1);
  });

  it("does not start after stop was called before start", () => {
    const onAuthenticated = vi.fn<() => void>();
    const onInitialized = vi.fn<() => void>();
    const onAttached = vi.fn<(response: typeof attachBaseline) => void>();
    const onTerminalError = vi.fn<(message: string, closeReason: string) => void>();
    const client = new DeferredRequestClient();
    const controller = createController(client, {
      onAuthenticated,
      onInitialized,
      onAttached,
      onTerminalError,
    });

    controller.stop();
    controller.start();

    expect(client.requests).toEqual([]);
    expect(onAuthenticated).not.toHaveBeenCalled();
    expect(onInitialized).not.toHaveBeenCalled();
    expect(onAttached).not.toHaveBeenCalled();
    expect(onTerminalError).not.toHaveBeenCalled();
  });

  it("ignores a resolved initialization request after stop", async () => {
    const onInitialized = vi.fn<() => void>();
    const client = new DeferredRequestClient();
    const controller = createController(client, { onInitialized });

    controller.start();
    await completeAuthentication(client);
    controller.stop();
    await resolveRequest(requestAt(client, 1), {});

    expect(onInitialized).not.toHaveBeenCalled();
    expect(client.requests).toHaveLength(2);
  });

  it("ignores attach resolution and RPC rejection after stop", async () => {
    const onAttached = vi.fn<(response: typeof attachBaseline) => void>();
    const onTerminalError = vi.fn<(message: string, closeReason: string) => void>();
    const client = new DeferredRequestClient();
    const controller = createController(client, { onAttached, onTerminalError });

    controller.start();
    await completeAuthentication(client);
    await completeInitialization(client);
    controller.stop();
    requestAt(client, 2).reject(new GuiHostRequestError("rpc", "late failure"));
    await flushMicrotasks();

    expect(onAttached).not.toHaveBeenCalled();
    expect(onTerminalError).not.toHaveBeenCalled();
    expect(client.requests).toHaveLength(3);
  });
});
