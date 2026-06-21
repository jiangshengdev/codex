import { expect, type Page, test } from "@playwright/test";
import type { ThreadProjectionAttachResponse } from "@codex-protocol/v2";

const threadId = "00000000-0000-0000-0000-000000000001";
const subscriptionId = "projection-e2e-subscription";

type RpcRequest = {
  id: number;
  method: string;
  params?: unknown;
};

type LayoutMetrics = {
  appSurfaceRight: number;
  bodyClientWidth: number;
  bodyScrollWidth: number;
  clientWidth: number;
  composerRight: number;
  scrollWidth: number;
  transcriptSurfaceRight: number;
};

function rpcParams(request: RpcRequest): Record<string, unknown> {
  if (typeof request.params === "object" && request.params !== null) {
    return request.params as Record<string, unknown>;
  }

  return {};
}

const attachResponse: ThreadProjectionAttachResponse = {
  subscriptionId,
  snapshot: {
    thread: {
      id: threadId,
      sessionId: threadId,
      forkedFromId: null,
      parentThreadId: null,
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

const mobileStressTurnId = "019ee976-b222-73a3-8ca7-e298f1d457f5";
const mobileStressAttachResponse: ThreadProjectionAttachResponse = {
  ...attachResponse,
  snapshot: {
    ...attachResponse.snapshot,
    thread: {
      ...attachResponse.snapshot.thread,
      turns: [
        {
          id: mobileStressTurnId,
          items: [
            {
              type: "userMessage",
              id: "user-mobile-stress",
              clientId: null,
              content: [
                {
                  type: "text",
                  text: "[$debug-responsive-gui](/Users/jiangsheng/cnb/codex/.codex/skills/debug-responsive-gui/SKILL.md) 启动一次",
                  text_elements: [],
                },
              ],
            },
            {
              type: "agentMessage",
              id: "agent-mobile-stress",
              text: "当前指标是 `375x667`，但 `documentElement.scrollWidth/body.scrollWidth` 仍然可能被 `/Applications/Codex.app/Contents/Resources/codex app-server` 这样的长片段撑宽。",
              phase: "final_answer",
              memoryCitation: null,
            },
          ],
          itemsView: "full",
          status: "completed",
          error: null,
          startedAt: 1700000001,
          completedAt: 1700000005,
          durationMs: 4000,
        },
      ],
    },
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
  attach?: ThreadProjectionAttachResponse;
  emitActiveTurnEvent?: boolean;
};

async function routeGuiHostWebSocket(
  page: Page,
  options: RouteGuiHostWebSocketOptions = {},
): Promise<RpcRequest[]> {
  const attach = options.attach ?? attachResponse;
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

        ws.send(JSON.stringify({ jsonrpc: "2.0", id: request.id, result: attach }));
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

test("fits committed transcript and composer in a narrow mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await routeGuiHostWebSocket(page, {
    attach: mobileStressAttachResponse,
    emitActiveTurnEvent: false,
  });

  await page.goto(`/?threadId=${threadId}#token=e2e-secret-token`);

  await expect(page.getByRole("article", { name: `Turn ${mobileStressTurnId}` })).toBeVisible();
  await expect(page.getByRole("region", { name: "Message composer" })).toBeVisible();

  const layout = await page.evaluate<LayoutMetrics>(`(() => {
    const appSurface = document.querySelector(".surface");
    const transcriptSurface = document.querySelector(".committed-transcript-surface");
    const composer = document.querySelector('[aria-label="Message composer"]');

    return {
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      bodyClientWidth: document.body.clientWidth,
      bodyScrollWidth: document.body.scrollWidth,
      appSurfaceRight: appSurface?.getBoundingClientRect().right ?? 0,
      transcriptSurfaceRight: transcriptSurface?.getBoundingClientRect().right ?? 0,
      composerRight: composer?.getBoundingClientRect().right ?? 0,
    };
  })()`);

  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth);
  expect(layout.bodyScrollWidth).toBeLessThanOrEqual(layout.bodyClientWidth);
  expect(layout.appSurfaceRight).toBeLessThanOrEqual(layout.clientWidth);
  expect(layout.transcriptSurfaceRight).toBeLessThanOrEqual(layout.clientWidth);
  expect(layout.composerRight).toBeLessThanOrEqual(layout.clientWidth);
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
