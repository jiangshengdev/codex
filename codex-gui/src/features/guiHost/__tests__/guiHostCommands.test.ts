import { describe, expect, it, vi } from "vitest";
import { attachBaseline } from "@/features/projection/__tests__/projectionFixtures";
import { inProgressTurn } from "@/features/projection/__tests__/projectionTestBuilders";
import type {
  TurnStartParams,
  TurnStartResponse,
  TurnSteerParams,
  TurnSteerResponse,
} from "@codex-protocol/v2";
import type { RequestParams, RequestResponse } from "../appServerProtocol";
import { isGuiHostCommandError } from "../guiHostClient";
import {
  recordStatusLabels,
  readLatestRpcRequest,
  sendJsonRpcError,
  sendJsonRpcResult,
  startConnectionUntilCommandsReady,
} from "./guiHostClientTestSupport";

const turnStartParams = (threadId: string): TurnStartParams => ({
  threadId,
  clientUserMessageId: null,
  input: [{ type: "text", text: "Hello", text_elements: [] }],
});

const turnSteerParams = (threadId: string): TurnSteerParams => ({
  threadId,
  expectedTurnId: "turn-active",
  clientUserMessageId: null,
  input: [{ type: "text", text: "Guide", text_elements: [] }],
});

const threadResumeResponse = (threadId: string): RequestResponse<"thread/resume"> => ({
  thread: { ...attachBaseline.snapshot.thread, id: threadId },
  model: "gpt-5",
  modelProvider: "openai",
  serviceTier: null,
  cwd: attachBaseline.snapshot.thread.cwd,
  instructionSources: [],
  approvalPolicy: "on-request",
  approvalsReviewer: "user",
  sandbox: { type: "dangerFullAccess" },
  reasoningEffort: null,
  turnsBackwardsCursor: null,
  itemsBackwardsCursor: null,
});

const threadId = attachBaseline.snapshot.thread.id;
const skillsListParams: RequestParams<"skills/list"> = {
  cwds: [attachBaseline.snapshot.thread.cwd],
  forceReload: false,
};
const skillsListResponse: RequestResponse<"skills/list"> = {
  data: [
    {
      cwd: attachBaseline.snapshot.thread.cwd,
      skills: [
        {
          name: "grill-me",
          description: "Stress-test a plan.",
          path: "/workspace/project/skills/grill-me/SKILL.md",
          scope: "repo",
          enabled: true,
          pluginId: null,
        },
      ],
      errors: [],
    },
  ],
};

describe("guiHostClient commands", () => {
  it("sends history requests through the ready command API", async () => {
    const { commands, socket } = startConnectionUntilCommandsReady({});

    const listParams: RequestParams<"thread/list"> = {
      cwd: attachBaseline.snapshot.thread.cwd,
      archived: false,
    };
    const listResponse: RequestResponse<"thread/list"> = {
      data: [attachBaseline.snapshot.thread],
      nextCursor: "next-page",
      backwardsCursor: null,
    };
    const listPromise = commands.listThreads(listParams);
    const listRequest = readLatestRpcRequest(socket, "thread/list");
    expect(listRequest).toEqual({
      jsonrpc: "2.0",
      id: listRequest.id,
      method: "thread/list",
      params: listParams,
    });
    sendJsonRpcResult(socket, listRequest.id, listResponse);
    await expect(listPromise).resolves.toEqual(listResponse);

    const readParams: RequestParams<"thread/read"> = { threadId, includeTurns: true };
    const readResponse: RequestResponse<"thread/read"> = {
      thread: attachBaseline.snapshot.thread,
    };
    const readPromise = commands.readThread(readParams);
    const readRequest = readLatestRpcRequest(socket, "thread/read");
    expect(readRequest).toEqual({
      jsonrpc: "2.0",
      id: readRequest.id,
      method: "thread/read",
      params: readParams,
    });
    sendJsonRpcResult(socket, readRequest.id, readResponse);
    await expect(readPromise).resolves.toEqual(readResponse);

    const resumeParams: RequestParams<"thread/resume"> = { threadId };
    const resumeResponse = threadResumeResponse(threadId);
    const resumePromise = commands.resumeThread(resumeParams);
    const resumeRequest = readLatestRpcRequest(socket, "thread/resume");
    expect(resumeRequest).toEqual({
      jsonrpc: "2.0",
      id: resumeRequest.id,
      method: "thread/resume",
      params: resumeParams,
    });
    sendJsonRpcResult(socket, resumeRequest.id, resumeResponse);
    await expect(resumePromise).resolves.toEqual(resumeResponse);

    const detachParams: RequestParams<"thread/projection/detach"> = { threadId };
    const detachResponse: RequestResponse<"thread/projection/detach"> = { status: "detached" };
    const detachPromise = commands.detachThreadProjection(detachParams);
    const detachRequest = readLatestRpcRequest(socket, "thread/projection/detach");
    expect(detachRequest).toEqual({
      jsonrpc: "2.0",
      id: detachRequest.id,
      method: "thread/projection/detach",
      params: detachParams,
    });
    sendJsonRpcResult(socket, detachRequest.id, detachResponse);
    await expect(detachPromise).resolves.toEqual(detachResponse);

    const attachParams: RequestParams<"thread/projection/attach"> = { threadId };
    const attachResponse: RequestResponse<"thread/projection/attach"> = attachBaseline;
    const attachPromise = commands.attachThreadProjection(attachParams);
    const attachRequest = readLatestRpcRequest(socket, "thread/projection/attach");
    expect(attachRequest).toEqual({
      jsonrpc: "2.0",
      id: attachRequest.id,
      method: "thread/projection/attach",
      params: attachParams,
    });
    sendJsonRpcResult(socket, attachRequest.id, attachResponse);
    await expect(attachPromise).resolves.toEqual(attachResponse);
  });

  it("sends skills/list through the ready command API", async () => {
    const { commands, socket } = startConnectionUntilCommandsReady({});
    const promise = commands.listSkills(skillsListParams);
    const request = readLatestRpcRequest(socket, "skills/list");

    expect(request).toEqual({
      jsonrpc: "2.0",
      id: request.id,
      method: "skills/list",
      params: skillsListParams,
    });

    sendJsonRpcResult(socket, request.id, skillsListResponse);

    await expect(promise).resolves.toEqual(skillsListResponse);
  });

  it("sends turn/start through the ready command API", async () => {
    const { commands, socket } = startConnectionUntilCommandsReady({});
    const params = turnStartParams(threadId);
    const response: TurnStartResponse = {
      turn: inProgressTurn("turn-started-by-command"),
    };
    const promise = commands.startTurn(params);
    const request = readLatestRpcRequest(socket, "turn/start");

    expect(typeof request.id).toBe("number");
    expect(request).toEqual({
      jsonrpc: "2.0",
      id: request.id,
      method: "turn/start",
      params,
    });

    sendJsonRpcResult(socket, request.id, response);

    await expect(promise).resolves.toEqual(response);
  });

  it("sends turn/interrupt through the ready command API", async () => {
    const { commands, socket } = startConnectionUntilCommandsReady({});

    const params = { threadId, turnId: "turn-active" };
    const promise = commands.interruptTurn(params);
    const request = readLatestRpcRequest(socket, "turn/interrupt");

    expect(typeof request.id).toBe("number");
    expect(request).toEqual({
      jsonrpc: "2.0",
      id: request.id,
      method: "turn/interrupt",
      params,
    });

    sendJsonRpcResult(socket, request.id, {});

    await expect(promise).resolves.toEqual({});
  });

  it("sends turn/steer through the ready command API", async () => {
    const { commands, socket } = startConnectionUntilCommandsReady({});
    const params = turnSteerParams(threadId);
    const response: TurnSteerResponse = { turnId: params.expectedTurnId };
    const promise = commands.steerTurn(params);
    const request = readLatestRpcRequest(socket, "turn/steer");

    expect(request).toEqual({
      jsonrpc: "2.0",
      id: request.id,
      method: "turn/steer",
      params,
    });

    sendJsonRpcResult(socket, request.id, response);

    await expect(promise).resolves.toEqual(response);
  });

  it("rejects command JSON-RPC errors without closing the socket", async () => {
    const { labels: statuses, onStatus } = recordStatusLabels();
    const { commands, socket } = startConnectionUntilCommandsReady({
      onStatus,
    });

    const params = turnSteerParams(threadId);
    const promise = commands.steerTurn(params);
    const request = readLatestRpcRequest(socket, "turn/steer");

    expect(typeof request.id).toBe("number");
    expect(request).toEqual({
      jsonrpc: "2.0",
      id: request.id,
      method: "turn/steer",
      params,
    });

    const rpcError = {
      code: -32000,
      message: "cannot steer a review turn",
      data: {
        message: "cannot steer a review turn",
        codexErrorInfo: { activeTurnNotSteerable: { turnKind: "review" } },
        additionalDetails: null,
      },
    };
    sendJsonRpcError(socket, request.id, rpcError);

    const error: unknown = await promise.catch((failure: unknown) => failure);
    if (!isGuiHostCommandError(error)) {
      throw new Error("Expected GuiHostCommandError");
    }
    expect(error.source).toBe("rpc");
    expect(error.message).toContain("cannot steer a review turn");
    expect(error.rpcError).toEqual(rpcError);
    expect(error.activeTurnNotSteerable).toBe(true);
    if (!(error.cause instanceof Error)) {
      throw new Error("Expected GuiHostCommandError cause");
    }
    expect(error.cause).toBeInstanceOf(Error);
    expect(error.message).toBe(error.cause.message);
    expect(socket.closed).toEqual([]);
    expect(statuses.at(-1)).toBe("initialized");
  });

  it("propagates thread/list JSON-RPC errors without closing the socket", async () => {
    const { labels: statuses, onStatus } = recordStatusLabels();
    const { commands, socket } = startConnectionUntilCommandsReady({
      onStatus,
    });
    const params: RequestParams<"thread/list"> = { cwd: attachBaseline.snapshot.thread.cwd };
    const promise = commands.listThreads(params);
    const request = readLatestRpcRequest(socket, "thread/list");

    sendJsonRpcError(socket, request.id, {
      code: -32000,
      message: "thread list unavailable",
    });

    const error: unknown = await promise.catch((failure: unknown) => failure);
    if (!isGuiHostCommandError(error)) {
      throw new Error("Expected GuiHostCommandError");
    }
    expect(error.source).toBe("rpc");
    expect(error.message).toContain("thread list unavailable");
    expect(socket.closed).toEqual([]);
    expect(statuses.at(-1)).toBe("initialized");
  });

  it("propagates skills/list JSON-RPC errors without closing the socket", async () => {
    const { labels: statuses, onStatus } = recordStatusLabels();
    const { commands, socket } = startConnectionUntilCommandsReady({
      onStatus,
    });
    const promise = commands.listSkills(skillsListParams);
    const request = readLatestRpcRequest(socket, "skills/list");

    sendJsonRpcError(socket, request.id, {
      code: -32000,
      message: "skill catalog unavailable",
    });

    const error: unknown = await promise.catch((failure: unknown) => failure);
    if (!isGuiHostCommandError(error)) {
      throw new Error("Expected GuiHostCommandError");
    }
    expect(error.source).toBe("rpc");
    expect(error.message).toContain("skill catalog unavailable");
    expect(socket.closed).toEqual([]);
    expect(statuses.at(-1)).toBe("initialized");
  });

  it("rejects a malformed skills/list response and keeps commands available", async () => {
    const { labels: statuses, onStatus } = recordStatusLabels();
    const { commands, socket } = startConnectionUntilCommandsReady({
      onStatus,
    });
    const listPromise = commands.listSkills(skillsListParams);
    const listRequest = readLatestRpcRequest(socket, "skills/list");

    sendJsonRpcResult(socket, listRequest.id, { data: null });

    await expect(listPromise).rejects.toThrow("skills/list returned malformed result payload");
    expect(socket.closed).toEqual([]);
    expect(statuses.at(-1)).toBe("initialized");

    const interruptPromise = commands.interruptTurn({ threadId, turnId: "turn-active" });
    const interruptRequest = readLatestRpcRequest(socket, "turn/interrupt");
    sendJsonRpcResult(socket, interruptRequest.id, {});
    await expect(interruptPromise).resolves.toEqual({});
  });

  it("rejects a malformed thread/list response and keeps commands available", async () => {
    const { labels: statuses, onStatus } = recordStatusLabels();
    const { commands, socket } = startConnectionUntilCommandsReady({
      onStatus,
    });
    const listPromise = commands.listThreads({ cwd: attachBaseline.snapshot.thread.cwd });
    const listRequest = readLatestRpcRequest(socket, "thread/list");

    sendJsonRpcResult(socket, listRequest.id, {
      data: null,
      nextCursor: null,
      backwardsCursor: null,
    });

    await expect(listPromise).rejects.toThrow("thread/list returned malformed result payload");
    expect(socket.closed).toEqual([]);
    expect(statuses.at(-1)).toBe("initialized");

    const detachPromise = commands.detachThreadProjection({ threadId });
    const detachRequest = readLatestRpcRequest(socket, "thread/projection/detach");
    sendJsonRpcResult(socket, detachRequest.id, { status: "detached" });
    await expect(detachPromise).resolves.toEqual({ status: "detached" });
  });

  it("rejects a missing turn/start result without closing the socket", async () => {
    const { labels: statuses, onStatus } = recordStatusLabels();
    const { commands, socket } = startConnectionUntilCommandsReady({
      onStatus,
    });

    const promise = commands.startTurn(turnStartParams(threadId));
    const request = readLatestRpcRequest(socket, "turn/start");

    socket.onmessage?.({
      data: JSON.stringify({ jsonrpc: "2.0", id: request.id }),
    });

    await expect(promise).rejects.toThrow("turn/start returned no result payload");
    expect(socket.closed).toEqual([]);
    expect(statuses.at(-1)).toBe("initialized");
  });

  it("rejects a malformed turn/start result and keeps commands available", async () => {
    const { labels: statuses, onStatus } = recordStatusLabels();
    const { commands, socket } = startConnectionUntilCommandsReady({
      onStatus,
    });

    const startPromise = commands.startTurn(turnStartParams(threadId));
    const startRequest = readLatestRpcRequest(socket, "turn/start");

    sendJsonRpcResult(socket, startRequest.id, { turn: null });

    await expect(startPromise).rejects.toThrow("turn/start returned malformed result payload");
    expect(socket.closed).toEqual([]);
    expect(statuses.at(-1)).toBe("initialized");

    const interruptPromise = commands.interruptTurn({ threadId, turnId: "turn-active" });
    const interruptRequest = readLatestRpcRequest(socket, "turn/interrupt");
    sendJsonRpcResult(socket, interruptRequest.id, {});

    await expect(interruptPromise).resolves.toEqual({});
    expect(socket.closed).toEqual([]);
    expect(statuses.at(-1)).toBe("initialized");
  });

  it("rejects pending command requests during cleanup", async () => {
    const calls: string[] = [];
    const { cleanup, commands, socket } = startConnectionUntilCommandsReady({
      onCommandsUnavailable: () => {
        calls.push("commands-unavailable");
      },
      onStatus: (status) => {
        calls.push(`status:${status.label}`);
      },
    });

    const promise = commands.interruptTurn({ threadId, turnId: "turn-active" });

    calls.length = 0;
    cleanup();
    cleanup();

    await expect(promise).rejects.toThrow("GUI host WebSocket is not available");
    expect(calls).toEqual(["commands-unavailable"]);
    expect(socket.closed).toEqual([{ code: 1000, reason: "cleanup" }]);
  });

  it("invalidates the ready command API during cleanup", async () => {
    const { cleanup, commands, socket } = startConnectionUntilCommandsReady({});
    const sentBeforeCleanup = [...socket.sent];

    cleanup();

    await expect(
      commands.interruptTurn({ threadId, turnId: "turn-after-cleanup" }),
    ).rejects.toThrow("GUI host WebSocket is not available");
    expect(socket.sent).toEqual(sentBeforeCleanup);
  });

  it("rejects history commands through an unavailable gateway", async () => {
    const { cleanup, commands, socket } = startConnectionUntilCommandsReady({});
    const sentBeforeCleanup = [...socket.sent];
    cleanup();

    const attempts = [
      () => commands.attachThreadProjection({ threadId }),
      () => commands.listThreads({ cwd: attachBaseline.snapshot.thread.cwd }),
      () => commands.readThread({ threadId, includeTurns: true }),
      () => commands.resumeThread({ threadId }),
      () => commands.detachThreadProjection({ threadId }),
    ];
    for (const attempt of attempts) {
      await expect(attempt()).rejects.toThrow("GUI host WebSocket is not available");
    }
    expect(socket.sent).toEqual(sentBeforeCleanup);
  });

  it.each([
    ["socket error", (socket: { onerror?: (() => void) | null }) => socket.onerror?.()],
    [
      "socket close",
      (socket: { onclose?: ((event: { code: number; reason: string }) => void) | null }) =>
        socket.onclose?.({ code: 1006, reason: "network lost" }),
    ],
  ])(
    "rejects pending command requests and marks commands unavailable on %s",
    async (_, closeSocket) => {
      const commandsUnavailable = vi.fn<() => void>();
      const { commands, socket } = startConnectionUntilCommandsReady({
        onCommandsUnavailable: commandsUnavailable,
      });

      const promise = commands.interruptTurn({ threadId, turnId: "turn-active" });

      closeSocket(socket);

      await expect(promise).rejects.toThrow("GUI host WebSocket is not available");
      expect(commandsUnavailable).toHaveBeenCalledTimes(1);
    },
  );

  it("closes the socket and marks commands unavailable on terminal projection protocol errors", async () => {
    const commandsUnavailable = vi.fn<() => void>();
    const { commands, socket } = startConnectionUntilCommandsReady({
      onCommandsUnavailable: commandsUnavailable,
    });

    const promise = commands.interruptTurn({ threadId, turnId: "turn-active" });

    socket.onmessage?.({
      data: JSON.stringify({
        jsonrpc: "2.0",
        method: "thread/projection/event",
        params: {
          threadId,
          subscriptionId: attachBaseline.subscriptionId,
          commitId: "c1",
          parentCommitId: null,
          event: { type: "turnStarted" },
        },
      }),
    });

    await expect(promise).rejects.toThrow("GUI host WebSocket is not available");
    expect(commandsUnavailable).toHaveBeenCalledTimes(1);
    expect(socket.closed).toEqual([{ code: 1000, reason: "protocol error" }]);
  });
});
