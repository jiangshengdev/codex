import { expect, type Page, test } from "@playwright/test";

const threadId = "00000000-0000-0000-0000-000000000001";
const subscriptionId = "projection-e2e-subscription";

type RpcRequest = {
  id: number;
  method: string;
  params?: unknown;
};

function rpcParams(request: RpcRequest): Record<string, unknown> {
  if (typeof request.params === "object" && request.params !== null) {
    return request.params as Record<string, unknown>;
  }

  return {};
}

const attachResponse = {
  subscriptionId,
  snapshot: {
    thread: {
      id: threadId,
      sessionId: threadId,
      forkedFromId: null,
      preview: "Projection e2e thread",
      ephemeral: false,
      modelProvider: "openai",
      createdAt: 1700000000,
      updatedAt: 1700000030,
      status: { type: "idle" },
      path: null,
      cwd: "/tmp/codex-gui-e2e",
      cliVersion: "projection-e2e",
      source: "appServer",
      threadSource: null,
      agentNickname: null,
      agentRole: null,
      gitInfo: null,
      name: "Projection e2e",
      turns: [],
    },
    headCommitId: null,
  },
};

const projectionEvent = {
  threadId,
  subscriptionId,
  commitId: "commit-turn-started",
  parentCommitId: null,
  event: {
    type: "turnStarted",
    notification: {
      threadId,
      turn: {
        id: "turn-in-progress",
        items: [],
        itemsView: "full",
        status: "inProgress",
        error: null,
        startedAt: 1700000010,
        completedAt: null,
        durationMs: null,
      },
    },
  },
};

type RouteGuiHostWebSocketOptions = {
  emitActiveTurnEvent?: boolean;
};

async function routeGuiHostWebSocket(
  page: Page,
  options: RouteGuiHostWebSocketOptions = {},
): Promise<RpcRequest[]> {
  const emitActiveTurnEvent = options.emitActiveTurnEvent ?? true;
  const sentRequests: RpcRequest[] = [];

  await page.routeWebSocket("/ws", (ws) => {
    ws.onMessage((message) => {
      const request = JSON.parse(String(message)) as RpcRequest;
      sentRequests.push(request);

      if (request.method === "gui/authenticate") {
        const params = rpcParams(request);
        if (params.token !== "e2e-secret-token") {
          ws.send(
            JSON.stringify({
              jsonrpc: "2.0",
              id: request.id,
              error: { code: -32000, message: "missing launch token" },
            }),
          );
          return;
        }

        ws.send(
          JSON.stringify({ jsonrpc: "2.0", id: request.id, result: { authenticated: true } }),
        );
        return;
      }

      if (request.method === "initialize") {
        ws.send(JSON.stringify({ jsonrpc: "2.0", id: request.id, result: {} }));
        return;
      }

      if (request.method === "thread/projection/attach") {
        const params = rpcParams(request);
        if (params.threadId !== threadId) {
          ws.send(
            JSON.stringify({
              jsonrpc: "2.0",
              id: request.id,
              error: { code: -32000, message: "unexpected threadId" },
            }),
          );
          return;
        }

        ws.send(JSON.stringify({ jsonrpc: "2.0", id: request.id, result: attachResponse }));
        if (emitActiveTurnEvent) {
          ws.send(
            JSON.stringify({
              jsonrpc: "2.0",
              method: "thread/projection/event",
              params: projectionEvent,
            }),
          );
        }
        return;
      }

      if (request.method === "turn/start") {
        ws.send(
          JSON.stringify({
            jsonrpc: "2.0",
            id: request.id,
            result: {
              turn: {
                id: "turn-started-from-e2e",
                items: [],
                itemsView: "full",
                status: "inProgress",
                error: null,
                startedAt: 1700000100,
                completedAt: null,
                durationMs: null,
              },
            },
          }),
        );
        return;
      }

      if (request.method === "turn/interrupt") {
        ws.send(JSON.stringify({ jsonrpc: "2.0", id: request.id, result: {} }));
        return;
      }

      ws.send(
        JSON.stringify({
          jsonrpc: "2.0",
          id: request.id,
          error: { code: -32601, message: `unexpected method ${request.method}` },
        }),
      );
    });
  });

  return sentRequests;
}

test("records a launch-param error without rendering host debug UI", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator("main")).toHaveAttribute("data-gui-host-status", "error");
  await expect(page.getByRole("region", { name: "Committed transcript" })).toBeVisible();
  await expect(page.getByText("No committed messages yet.")).toBeVisible();
  await expect(page.getByText("GUI host")).toHaveCount(0);
});

test("authenticates, attaches, records projection status, and clears token", async ({ page }) => {
  const sentRequests = await routeGuiHostWebSocket(page);

  await page.goto(`/?threadId=${threadId}#token=e2e-secret-token`);

  await expect(page.locator("main")).toHaveAttribute("data-gui-host-status", "received event");
  await expect(page.getByRole("region", { name: "Committed transcript" })).toBeVisible();
  await expect(page.getByText("No committed messages yet.")).toBeVisible();
  await expect(page.getByText("GUI host")).toHaveCount(0);
  await expect
    .poll(() => sentRequests.map((request) => request.method))
    .toEqual(["gui/authenticate", "initialize", "thread/projection/attach"]);
  expect(page.url()).not.toContain("#token=");
});

test("sends plain text through turn/start", async ({ page }) => {
  const sentRequests = await routeGuiHostWebSocket(page, { emitActiveTurnEvent: false });

  await page.goto(`/?threadId=${threadId}#token=e2e-secret-token`);
  await expect(page.locator("main")).toHaveAttribute("data-gui-host-status", "attached");

  await page.getByPlaceholder("Message Codex").fill("Hello from e2e");
  await page.getByRole("button", { name: "Send" }).click();

  await expect
    .poll(() => sentRequests.find((request) => request.method === "turn/start"))
    .toBeTruthy();

  const turnStart = sentRequests.find((request) => request.method === "turn/start");
  expect(turnStart?.params).toEqual({
    threadId,
    clientUserMessageId: null,
    input: [{ type: "text", text: "Hello from e2e", text_elements: [] }],
  });
  await expect(page.getByPlaceholder("Message Codex")).toHaveValue("");
});

test("interrupts active turn through turn/interrupt", async ({ page }) => {
  const sentRequests = await routeGuiHostWebSocket(page);

  await page.goto(`/?threadId=${threadId}#token=e2e-secret-token`);
  await expect(page.locator("main")).toHaveAttribute("data-gui-host-status", "received event");

  await expect(page.getByRole("button", { name: "Stop" })).toBeEnabled();
  await page.getByRole("button", { name: "Stop" }).click();

  await expect
    .poll(() => sentRequests.find((request) => request.method === "turn/interrupt"))
    .toBeTruthy();

  const turnInterrupt = sentRequests.find((request) => request.method === "turn/interrupt");
  expect(turnInterrupt?.params).toEqual({
    threadId,
    turnId: "turn-in-progress",
  });
});
