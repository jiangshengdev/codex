import { expect, type Page, test } from "@playwright/test";
import {
  attachBaseline,
  eventItemCompleted,
  eventTurnStarted,
} from "@/features/projection/__tests__/projectionFixtures";
import {
  agentMessage,
  attachWithTurns,
  baseTurn,
  eventWithEnvelope,
  inProgressTurn,
  itemCompleted,
  subAgentActivity,
  textInput,
  userMessage,
} from "@/features/projection/__tests__/projectionTestBuilders";
import type { InitializeResponse } from "@codex-protocol/InitializeResponse";
import type {
  ThreadProjectionAttachResponse,
  ThreadProjectionEventNotification,
} from "@codex-protocol/v2";

const threadId = attachBaseline.snapshot.thread.id;
const subscriptionId = "projection-e2e-subscription";
const initializeResponse = {
  userAgent: "codex-gui-e2e",
  codexHome: "/tmp/codex-home",
  platformFamily: "unix",
  platformOs: "macos",
} satisfies InitializeResponse;

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

const attachResponse: ThreadProjectionAttachResponse = attachWithTurns(
  {
    ...attachBaseline,
    subscriptionId,
    snapshot: {
      ...attachBaseline.snapshot,
      thread: {
        ...attachBaseline.snapshot.thread,
        preview: "Projection e2e thread",
        cwd: "/tmp/codex-gui-e2e",
        cliVersion: "projection-e2e",
        name: "Projection e2e",
      },
    },
  },
  [],
);

const mobileStressTurnId = "019ee976-b222-73a3-8ca7-e298f1d457f5";
const mobileStressAttachResponse: ThreadProjectionAttachResponse = attachWithTurns(attachResponse, [
  baseTurn(mobileStressTurnId, [
    userMessage("user-mobile-stress", [
      textInput(
        "[$debug-responsive-gui](/workspace/codex/.codex/skills/debug-responsive-gui/SKILL.md) 启动一次",
      ),
    ]),
    agentMessage(
      "agent-mobile-stress",
      "当前指标是 `375x667`，但 `documentElement.scrollWidth/body.scrollWidth` 仍然可能被 `/Applications/Codex.app/Contents/Resources/codex app-server` 这样的长片段撑宽。",
    ),
  ]),
]);

const longTranscriptText = (label: string): string =>
  Array.from({ length: 140 }, (_, index) => `${label} line ${String(index + 1)}`).join("\n");

const scrollStressAttachResponse: ThreadProjectionAttachResponse = attachWithTurns(attachResponse, [
  baseTurn("turn-scroll-stress", [
    userMessage("user-scroll-stress", [textInput("Scroll restoration prompt")]),
    agentMessage("agent-scroll-stress", longTranscriptText("Scroll restoration response")),
  ]),
]);

const localizedAttachResponse: ThreadProjectionAttachResponse = attachWithTurns(attachResponse, [
  baseTurn("turn-locale-e2e", [
    userMessage("user-locale-e2e", [textInput("Keep this user message unchanged")]),
    subAgentActivity("activity-locale-e2e", "started", "/root/e2e-agent"),
    agentMessage("agent-locale-e2e", "Keep this model response unchanged"),
  ]),
]);

const projectionEvent = {
  ...eventTurnStarted,
  subscriptionId,
  event: {
    ...eventTurnStarted.event,
    notification: {
      ...eventTurnStarted.event.notification,
      turn: inProgressTurn("turn-in-progress"),
    },
  },
};

const messageWhileSettingsEvent = eventWithEnvelope(
  itemCompleted(
    eventItemCompleted,
    "commit-message-while-settings",
    "turn-in-progress",
    agentMessage("agent-message-while-settings", "Message received while settings were open"),
  ),
  {
    subscriptionId,
    parentCommitId: projectionEvent.commitId,
  },
);

type LocaleTestGlobal = typeof globalThis & {
  __e2eSystemLanguage?: string;
  __e2eSystemLanguages?: string[];
};

async function installSystemLocale(page: Page, language: string): Promise<void> {
  await page.addInitScript((initialLanguage) => {
    const scope = globalThis as LocaleTestGlobal;
    scope.__e2eSystemLanguage = initialLanguage;
    scope.__e2eSystemLanguages = [initialLanguage];
    Object.defineProperty(navigator, "language", {
      configurable: true,
      get: () => scope.__e2eSystemLanguage,
    });
    Object.defineProperty(navigator, "languages", {
      configurable: true,
      get: () => scope.__e2eSystemLanguages,
    });
  }, language);
}

async function setSystemLocale(page: Page, language: string): Promise<void> {
  await page.evaluate((nextLanguage) => {
    const scope = globalThis as LocaleTestGlobal;
    scope.__e2eSystemLanguage = nextLanguage;
    scope.__e2eSystemLanguages = [nextLanguage];
    window.dispatchEvent(new Event("languagechange"));
  }, language);
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const metrics = await page.evaluate(() => ({
    documentClientWidth: document.documentElement.clientWidth,
    documentScrollWidth: document.documentElement.scrollWidth,
    bodyClientWidth: document.body.clientWidth,
    bodyScrollWidth: document.body.scrollWidth,
  }));
  expect(metrics.documentScrollWidth).toBeLessThanOrEqual(metrics.documentClientWidth);
  expect(metrics.bodyScrollWidth).toBeLessThanOrEqual(metrics.bodyClientWidth);
}

async function documentScrollTop(page: Page): Promise<number> {
  return page.evaluate(() => document.scrollingElement?.scrollTop ?? 0);
}

async function distanceFromDocumentBottom(page: Page): Promise<number> {
  return page.evaluate(() => {
    const scroller = document.scrollingElement;
    if (scroller == null) {
      throw new Error("document.scrollingElement must be available");
    }

    return scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
  });
}

type RouteGuiHostWebSocketOptions = {
  attach?: ThreadProjectionAttachResponse;
  emitActiveTurnEvent?: boolean;
};

type GuiHostWebSocketHarness = {
  sentRequests: RpcRequest[];
  connectionCount(): number;
  sendProjectionEvent(notification: ThreadProjectionEventNotification): void;
};

async function routeGuiHostWebSocket(
  page: Page,
  options: RouteGuiHostWebSocketOptions = {},
): Promise<GuiHostWebSocketHarness> {
  const attach = options.attach ?? attachResponse;
  const emitActiveTurnEvent = options.emitActiveTurnEvent ?? true;
  const sentRequests: RpcRequest[] = [];
  let connectionCount = 0;
  let sendProjectionEvent: GuiHostWebSocketHarness["sendProjectionEvent"] | null = null;

  await page.routeWebSocket("/ws", (ws) => {
    connectionCount += 1;
    sendProjectionEvent = (notification) => {
      ws.send(
        JSON.stringify({
          jsonrpc: "2.0",
          method: "thread/projection/event",
          params: notification,
        }),
      );
    };
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
        ws.send(JSON.stringify({ jsonrpc: "2.0", id: request.id, result: initializeResponse }));
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
              turn: inProgressTurn("turn-started-from-e2e"),
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

  return {
    sentRequests,
    connectionCount: () => connectionCount,
    sendProjectionEvent(notification) {
      if (sendProjectionEvent == null) {
        throw new Error("GUI host WebSocket is not connected");
      }
      sendProjectionEvent(notification);
    },
  };
}

test("records a launch-param error without rendering host debug UI", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator("main")).toHaveAttribute("data-gui-host-status", "error");
  await expect(page.getByRole("region", { name: "Committed transcript" })).toBeVisible();
  await expect(page.getByText("No committed messages yet.")).toBeVisible();
  await expect(page.getByText("GUI host")).toHaveCount(0);
});

test("authenticates, attaches, records attach state, and clears token", async ({ page }) => {
  const { sentRequests } = await routeGuiHostWebSocket(page);

  await page.goto(`/?threadId=${threadId}#token=e2e-secret-token`);

  await expect(page.locator("main")).toHaveAttribute("data-gui-host-status", "attached");
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
  const { sentRequests } = await routeGuiHostWebSocket(page, { emitActiveTurnEvent: false });

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
  const { sentRequests } = await routeGuiHostWebSocket(page);

  await page.goto(`/?threadId=${threadId}#token=e2e-secret-token`);
  await expect(page.locator("main")).toHaveAttribute("data-gui-host-status", "attached");

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

test("keeps the chat runtime alive across a settings round trip", async ({ page }) => {
  const harness = await routeGuiHostWebSocket(page);

  await page.goto(
    `/?threadId=${threadId}&future=value#token=e2e-secret-token`,
  );
  await expect(page.locator("main")).toHaveAttribute("data-gui-host-status", "attached");
  const connectionCountBeforeSettings = harness.connectionCount();
  const historyLength = await page.evaluate(() => window.history.length);
  const composer = page.getByPlaceholder("Message Codex");
  await composer.fill("Draft survives settings");
  await page.evaluate(() => {
    window.history.replaceState(
      window.history.state,
      "",
      `${window.location.pathname}${window.location.search}#transient`,
    );
  });

  await page.getByRole("button", { name: "Settings" }).click();

  await expect(page).toHaveURL(
    `/settings?threadId=${threadId}&future=value`,
  );
  expect(await page.evaluate(() => window.history.length)).toBe(historyLength);
  expect(harness.connectionCount()).toBe(connectionCountBeforeSettings);
  harness.sendProjectionEvent(messageWhileSettingsEvent);
  await expect
    .poll(
      () =>
        harness.sentRequests.filter(
          (request) =>
            request.method === "gui/authenticate" ||
            request.method === "initialize" ||
            request.method === "thread/projection/attach",
        ).length,
    )
    .toBe(3);

  await page.getByRole("button", { name: "Back" }).click();

  await expect(page).toHaveURL(`/?threadId=${threadId}&future=value`);
  expect(await page.evaluate(() => window.history.length)).toBe(historyLength);
  expect(harness.connectionCount()).toBe(connectionCountBeforeSettings);
  await expect(page.getByText("Message received while settings were open")).toBeVisible();
  await expect(composer).toHaveValue("Draft survives settings");
});

test("restores sticky-bottom chat scroll after returning from settings", async ({ page }) => {
  await routeGuiHostWebSocket(page, {
    attach: scrollStressAttachResponse,
    emitActiveTurnEvent: false,
  });
  await page.goto(`/?threadId=${threadId}#token=e2e-secret-token`);
  await expect(page.getByText("Scroll restoration response line 140")).toBeVisible();
  await page.evaluate(() => {
    const scroller = document.scrollingElement;
    scroller?.scrollTo({ top: scroller.scrollHeight });
  });
  await expect.poll(() => distanceFromDocumentBottom(page)).toBeLessThanOrEqual(4);

  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Back" }).click();

  await expect.poll(() => distanceFromDocumentBottom(page)).toBeLessThanOrEqual(4);
});

test("restores non-sticky chat scroll after returning from settings", async ({ page }) => {
  await routeGuiHostWebSocket(page, {
    attach: scrollStressAttachResponse,
    emitActiveTurnEvent: false,
  });
  await page.goto(`/?threadId=${threadId}#token=e2e-secret-token`);
  await expect(page.getByText("Scroll restoration response line 140")).toBeVisible();
  await page.evaluate(() => {
    document.scrollingElement?.scrollTo({ top: 240 });
  });
  await expect.poll(() => documentScrollTop(page)).toBeGreaterThan(200);
  await expect.poll(() => distanceFromDocumentBottom(page)).toBeGreaterThan(40);
  const savedScrollTop = await documentScrollTop(page);

  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Back" }).click();

  await expect
    .poll(async () => Math.abs((await documentScrollTop(page)) - savedScrollTop))
    .toBeLessThanOrEqual(4);
});

test("persists explicit Simplified Chinese through chat and a direct settings refresh", async ({
  page,
}) => {
  const harness = await routeGuiHostWebSocket(page, {
    attach: localizedAttachResponse,
    emitActiveTurnEvent: false,
  });
  await page.goto(`/?threadId=${threadId}#token=e2e-secret-token`);
  await expect(page.getByText("Keep this model response unchanged")).toBeVisible();

  await page.getByRole("button", { name: "Settings" }).click();
  await page.locator('[data-slot="autocomplete-value"]').click();
  await page
    .getByRole("option", {
      name: "Simplified Chinese · 简体中文",
      exact: true,
    })
    .click();

  await expect(page.getByRole("heading", { level: 1, name: "设置" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  expect(await page.evaluate(() => localStorage.getItem("codex-gui.locale"))).toBe("zh-CN");
  await page.getByRole("button", { name: "返回" }).click();

  await expect(page.getByPlaceholder("向 Codex 发送消息")).toBeVisible();
  await expect(page.getByRole("region", { name: "已提交的对话" })).toBeVisible();
  await expect(page.getByText("Keep this user message unchanged")).toBeVisible();
  await expect(page.getByText("Keep this model response unchanged")).toBeVisible();
  await expect(page.getByText("/root/e2e-agent")).toBeVisible();

  await page.getByRole("button", { name: "设置" }).click();
  await page.reload();

  await expect(page).toHaveURL(`/settings?threadId=${threadId}`);
  await expect(page.getByRole("heading", { level: 1, name: "设置" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  expect(await page.evaluate(() => localStorage.getItem("codex-gui.locale"))).toBe("zh-CN");
  await expect.poll(() => harness.connectionCount()).toBe(2);
});

test("follows languagechange only while the system locale preference is active", async ({
  page,
}) => {
  await installSystemLocale(page, "en-US");
  await routeGuiHostWebSocket(page, { emitActiveTurnEvent: false });
  await page.goto(`/settings?threadId=${threadId}#token=e2e-secret-token`);
  await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("codex-gui.locale"))).toBeNull();

  await setSystemLocale(page, "zh-SG");

  await expect(page.getByRole("heading", { level: 1, name: "设置" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  expect(await page.evaluate(() => localStorage.getItem("codex-gui.locale"))).toBeNull();

  await page.locator('[data-slot="autocomplete-value"]').click();
  await page
    .getByRole("option", { name: "英语 · English", exact: true })
    .click();
  await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  expect(await page.evaluate(() => localStorage.getItem("codex-gui.locale"))).toBe("en");

  await setSystemLocale(page, "zh-CN");

  await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
});

test("keeps settings usable when launch parameters are missing", async ({ page }) => {
  await page.goto("/settings");

  await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Language" })).toBeEnabled();
  await page.getByRole("button", { name: "Back" }).click();

  await expect(page.getByText("Unable to start Codex GUI")).toBeVisible();
  await expect(page.getByText("Missing threadId query parameter")).toBeVisible();
});

test("fits settings and the language popover without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await routeGuiHostWebSocket(page, { emitActiveTurnEvent: false });
  await page.goto(`/settings?threadId=${threadId}#token=e2e-secret-token`);
  await page.locator('[data-slot="autocomplete-value"]').click();

  const search = page.getByRole("searchbox", { name: "Search languages" });
  const dialog = page.getByRole("dialog", { name: "Language options" });
  await expect(search).toBeVisible();
  await expect(search).not.toBeFocused();
  await expect(dialog).toBeVisible();
  await expectNoHorizontalOverflow(page);
  const mobileDialogBox = await dialog.boundingBox();
  expect(mobileDialogBox).not.toBeNull();
  expect(mobileDialogBox?.right ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(375);

  await page.setViewportSize({ width: 1280, height: 800 });

  await expect(dialog).toBeVisible();
  await expectNoHorizontalOverflow(page);
  const desktopDialogBox = await dialog.boundingBox();
  expect(desktopDialogBox).not.toBeNull();
  expect(desktopDialogBox?.right ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(1280);
});

test("matches the English chat and settings screenshots", async ({ page }) => {
  await installSystemLocale(page, "en-US");
  await page.setViewportSize({ width: 1280, height: 800 });
  await routeGuiHostWebSocket(page, {
    attach: localizedAttachResponse,
    emitActiveTurnEvent: false,
  });
  await page.goto(`/?threadId=${threadId}#token=e2e-secret-token`);
  await expect(page.getByText("Keep this model response unchanged")).toBeVisible();

  await expect(page).toHaveScreenshot("chat-en.png", { fullPage: true });
  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
  await expect(page).toHaveScreenshot("settings-en.png", { fullPage: true });
});

test("matches the Simplified Chinese chat and settings screenshots", async ({ page }) => {
  await installSystemLocale(page, "zh-CN");
  await page.setViewportSize({ width: 1280, height: 800 });
  await routeGuiHostWebSocket(page, {
    attach: localizedAttachResponse,
    emitActiveTurnEvent: false,
  });
  await page.goto(`/?threadId=${threadId}#token=e2e-secret-token`);
  await expect(page.getByText("Keep this model response unchanged")).toBeVisible();
  await expect(page.getByPlaceholder("向 Codex 发送消息")).toBeVisible();

  await expect(page).toHaveScreenshot("chat-zh-CN.png", { fullPage: true });
  await page.getByRole("button", { name: "设置" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "设置" })).toBeVisible();
  await expect(page).toHaveScreenshot("settings-zh-CN.png", { fullPage: true });
});
