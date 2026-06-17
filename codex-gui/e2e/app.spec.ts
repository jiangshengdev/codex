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

async function routeGuiHostWebSocket(page: Page): Promise<string[]> {
  const sentMethods: string[] = [];

  await page.routeWebSocket("/ws", (ws) => {
    ws.onMessage((message) => {
      const request = JSON.parse(String(message)) as RpcRequest;
      sentMethods.push(request.method);

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
        ws.send(
          JSON.stringify({
            jsonrpc: "2.0",
            method: "thread/projection/event",
            params: projectionEvent,
          }),
        );
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

  return sentMethods;
}

test("records a launch-param error without rendering GUI host debug UI", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator("main")).toHaveAttribute("data-gui-host-status", "error");
  await expect(page.getByRole("region", { name: "Committed transcript" })).toBeVisible();
  await expect(page.getByText("No committed messages yet.")).toBeVisible();
  await expect(page.locator("main > section")).toHaveCount(1);
});

test("authenticates, attaches, records projection status, and clears token", async ({ page }) => {
  const sentMethods = await routeGuiHostWebSocket(page);

  await page.goto(`/?threadId=${threadId}#token=e2e-secret-token`);

  await expect(page.locator("main")).toHaveAttribute("data-gui-host-status", "received event");
  await expect(page.getByRole("region", { name: "Committed transcript" })).toBeVisible();
  await expect(page.getByText("No committed messages yet.")).toBeVisible();
  await expect(page.locator("main > section")).toHaveCount(1);
  await expect
    .poll(() => sentMethods)
    .toEqual(["gui/authenticate", "initialize", "thread/projection/attach"]);
  expect(page.url()).not.toContain("#token=");
});
