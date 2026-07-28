import { expect, type Page, test } from "@playwright/test";
import {
  attachBaseline,
  eventItemCompleted,
  eventItemStarted,
  eventTurnStarted,
} from "@/features/projection/__tests__/projectionFixtures";
import {
  agentMessage,
  attachWithTurns,
  baseTurn,
  collabAgentToolCall,
  eventWithEnvelope,
  inProgressTurn,
  itemCompleted,
  itemStarted,
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

type RouteGuiHostWebSocketOptions = {
  attach?: ThreadProjectionAttachResponse;
  emitActiveTurnEvent?: boolean;
  onConnected?: (send: (message: unknown) => void) => void;
};

async function routeGuiHostWebSocket(
  page: Page,
  options: RouteGuiHostWebSocketOptions = {},
): Promise<RpcRequest[]> {
  const attach = options.attach ?? attachResponse;
  const emitActiveTurnEvent = options.emitActiveTurnEvent ?? true;
  const sentRequests: RpcRequest[] = [];

  await page.routeWebSocket("/ws", (ws) => {
    options.onConnected?.((message) => {
      ws.send(JSON.stringify(message));
    });
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

  return sentRequests;
}

const emitProjectionEvent = (
  send: (message: unknown) => void,
  notification: ThreadProjectionEventNotification,
): void => {
  send({
    jsonrpc: "2.0",
    method: "thread/projection/event",
    params: notification,
  });
};

const openLanguageOptions = async (page: Page) => {
  await page.getByTestId("settings-route").getByRole("group").click();
  await expect(page.getByRole("dialog", { name: /Language options|语言选项/ })).toBeVisible();
};

const emitAgentMessage = (
  send: (message: unknown) => void,
  itemId: string,
  text: string,
): void => {
  const item = agentMessage(itemId, text);
  for (const notification of [
    itemStarted(eventItemStarted, "commit-item-started", "turn-in-progress", item),
    itemCompleted(eventItemCompleted, "commit-item-completed", "turn-in-progress", item),
  ]) {
    emitProjectionEvent(send, eventWithEnvelope(notification, { subscriptionId }));
  }
};

const requireConnectedHost = (
  send: ((message: unknown) => void) | undefined,
): ((message: unknown) => void) => {
  if (send == null) {
    throw new Error("GUI host WebSocket did not connect");
  }
  return send;
};

const chooseSimplifiedChinese = async (page: Page): Promise<void> => {
  await openLanguageOptions(page);
  await page
    .getByRole("option", { name: "Simplified Chinese · 简体中文", exact: true })
    .click();
  await expect(page.getByRole("heading", { level: 1, name: "设置" })).toBeVisible();
};

const visualAttachResponse: ThreadProjectionAttachResponse = attachWithTurns(attachResponse, [
  baseTurn("turn-visual", [
    userMessage("user-visual", [textInput("Dynamic user content stays exactly as written.")]),
    agentMessage("agent-visual", "Dynamic model content stays exactly as written."),
    subAgentActivity("activity-visual", "started", "/root/dynamic-agent"),
    collabAgentToolCall("activity-spawn", "spawnAgent", "completed", {
      receiverThreadIds: ["receiver-dynamic"],
      model: "gpt-dynamic",
      reasoningEffort: "high",
    }),
  ]),
]);

const longTranscriptAttachResponse: ThreadProjectionAttachResponse = attachWithTurns(
  attachResponse,
  Array.from({ length: 36 }, (_, index) =>
    baseTurn(`turn-scroll-${String(index)}`, [
      userMessage(`user-scroll-${String(index)}`, [
        textInput(`Saved scroll marker ${String(index)} with enough text to make the page tall.`),
      ]),
      agentMessage(
        `agent-scroll-${String(index)}`,
        `Response ${String(index)} keeps the transcript tall for route restoration coverage.`,
      ),
    ]),
  ),
);

test("records a launch-param error without rendering host debug UI", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator("main")).toHaveAttribute("data-gui-host-status", "error");
  await expect(page.getByRole("region", { name: "Committed transcript" })).toBeVisible();
  await expect(page.getByText("No committed messages yet.")).toBeVisible();
  await expect(page.getByText("GUI host")).toHaveCount(0);
});

test("authenticates, attaches, records attach state, and clears token", async ({ page }) => {
  const sentRequests = await routeGuiHostWebSocket(page);

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

test("settings navigation preserves launch search, clears hash, replaces history, and keeps the host live", async ({
  page,
}) => {
  let websocketConnections = 0;
  let sendFromHost: ((message: unknown) => void) | undefined;
  const sentRequests = await routeGuiHostWebSocket(page, {
    onConnected(send) {
      websocketConnections += 1;
      sendFromHost = send;
    },
  });

  await page.goto(`/?threadId=${threadId}&future=value#token=e2e-secret-token`);
  await expect(page.locator("main")).toHaveAttribute("data-gui-host-status", "attached");
  const initialHistoryLength = await page.evaluate(() => history.length);
  const connectionCountBeforeRouteChange = websocketConnections;
  const authenticationCountBeforeRouteChange = sentRequests.filter(
    (request) => request.method === "gui/authenticate",
  ).length;

  await page.getByPlaceholder("Message Codex").fill("Draft survives settings");
  await page.getByRole("button", { name: "Settings" }).click();

  await expect(page).toHaveURL(
    new RegExp(`/settings\\?threadId=${threadId}&future=value$`),
  );
  await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeFocused();
  await expect(page.getByPlaceholder("Message Codex")).toHaveCount(0);
  expect(await page.evaluate(() => history.length)).toBe(initialHistoryLength);
  expect(websocketConnections).toBe(connectionCountBeforeRouteChange);
  expect(sentRequests.filter((request) => request.method === "gui/authenticate")).toHaveLength(
    authenticationCountBeforeRouteChange,
  );

  emitAgentMessage(
    requireConnectedHost(sendFromHost),
    "agent-settings-message",
    "Message received while the settings page was open",
  );

  await page.getByRole("button", { name: "Back" }).click();

  await expect(page).toHaveURL(new RegExp(`/\\?threadId=${threadId}&future=value$`));
  await expect(page.getByPlaceholder("Message Codex")).toHaveValue("Draft survives settings");
  await expect(page.getByText("Message received while the settings page was open")).toBeVisible();
  await expect(page.getByRole("button", { name: "Settings" })).toBeFocused();
  expect(await page.evaluate(() => history.length)).toBe(initialHistoryLength);
  expect(websocketConnections).toBe(connectionCountBeforeRouteChange);
  await expect
    .poll(() => sentRequests.filter((request) => request.method === "gui/authenticate").length)
    .toBe(authenticationCountBeforeRouteChange);
});

test("restores a sticky chat to the latest bottom after settings", async ({ page }) => {
  let sendFromHost: ((message: unknown) => void) | undefined;
  await routeGuiHostWebSocket(page, {
    attach: longTranscriptAttachResponse,
    onConnected(send) {
      sendFromHost = send;
    },
  });
  await page.goto(`/?threadId=${threadId}#token=e2e-secret-token`);
  await expect(page.locator("main")).toHaveAttribute("data-gui-host-status", "attached");
  await page.evaluate(() => { window.scrollTo({ top: document.documentElement.scrollHeight }); });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document.documentElement.scrollHeight -
          document.documentElement.scrollTop -
          document.documentElement.clientHeight,
      ),
    )
    .toBeLessThanOrEqual(4);

  await page.getByRole("button", { name: "Settings" }).click();
  emitAgentMessage(
    requireConnectedHost(sendFromHost),
    "agent-sticky-settings-message",
    "Newest message while settings is open",
  );
  await page.getByRole("button", { name: "Back" }).click();

  await expect(page.getByText("Newest message while settings is open")).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document.documentElement.scrollHeight -
          document.documentElement.scrollTop -
          document.documentElement.clientHeight,
      ),
    )
    .toBeLessThanOrEqual(4);
});

test("restores a non-sticky document position after settings", async ({ page }) => {
  let sendFromHost: ((message: unknown) => void) | undefined;
  await routeGuiHostWebSocket(page, {
    attach: longTranscriptAttachResponse,
    onConnected(send) {
      sendFromHost = send;
    },
  });
  await page.goto(`/?threadId=${threadId}#token=e2e-secret-token`);
  await expect(page.locator("main")).toHaveAttribute("data-gui-host-status", "attached");
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollHeight))
    .toBeGreaterThan(2_000);
  const savedScrollTop = await page.evaluate(() => {
    const scroller = document.scrollingElement;
    if (!(scroller instanceof HTMLElement)) {
      throw new Error("document scroller is unavailable");
    }
    window.scrollTo({ top: Math.floor((scroller.scrollHeight - scroller.clientHeight) / 2) });
    return scroller.scrollTop;
  });
  expect(savedScrollTop).toBeGreaterThan(0);

  await page.getByRole("button", { name: "Settings" }).click();
  emitAgentMessage(
    requireConnectedHost(sendFromHost),
    "agent-non-sticky-settings-message",
    "A new message must not move the saved reading position",
  );
  await page.getByRole("button", { name: "Back" }).click();

  await expect
    .poll(async () =>
      Math.abs((await page.evaluate(() => document.documentElement.scrollTop)) - savedScrollTop),
    )
    .toBeLessThanOrEqual(4);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document.documentElement.scrollHeight -
          document.documentElement.scrollTop -
          document.documentElement.clientHeight,
      ),
    )
    .toBeGreaterThan(40);
});

test("locale changes immediately across settings, chat, QR access, transcript, and activity", async ({
  page,
}) => {
  await routeGuiHostWebSocket(page, {
    attach: visualAttachResponse,
    emitActiveTurnEvent: false,
  });
  await page.goto(`/?threadId=${threadId}#token=e2e-secret-token`);
  await expect(page.locator("main")).toHaveAttribute("data-gui-host-status", "attached");
  await page.getByRole("button", { name: "Intermediate updates · 2 items" }).click();
  await expect(page.getByText("Started /root/dynamic-agent")).toBeVisible();

  await page.getByRole("button", { name: "Settings" }).click();
  await chooseSimplifiedChinese(page);
  await expect(page.getByText("选择界面语言。")).toBeVisible();
  await expect(page.getByTestId("settings-route").getByRole("group")).toContainText("简体中文");
  expect(await page.evaluate(() => localStorage.getItem("codex-gui.locale"))).toBe("zh-CN");

  await page.getByRole("button", { name: "返回" }).click();
  await expect(page.getByRole("region", { name: "消息编辑器" })).toBeVisible();
  await expect(page.getByPlaceholder("向 Codex 发送消息")).toBeVisible();
  await expect(page.getByRole("button", { name: "设置" })).toBeVisible();
  await expect(page.getByRole("button", { name: "手机扫码" })).toBeVisible();
  await page.getByRole("button", { name: "中间更新 · 2 项" }).click();
  await expect(page.getByText("已启动 /root/dynamic-agent")).toBeVisible();
  await expect(page.getByText("已创建 receiver-dynamic（gpt-dynamic high）")).toBeVisible();
  await expect(page.getByText("Dynamic user content stays exactly as written.")).toBeVisible();
  await expect(page.getByText("Dynamic model content stays exactly as written.")).toBeVisible();
});

test("system and explicit locale preferences survive settings refresh", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window.navigator, "languages", {
      configurable: true,
      get: () => ["zh-SG"],
    });
    Object.defineProperty(window.navigator, "language", {
      configurable: true,
      get: () => "zh-SG",
    });
  });
  await routeGuiHostWebSocket(page, { emitActiveTurnEvent: false });

  await page.goto(`/settings?threadId=${threadId}#token=e2e-secret-token`);
  await expect(page).toHaveURL(new RegExp(`/settings\\?threadId=${threadId}$`));
  await expect(page.getByRole("heading", { level: 1, name: "设置" })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("codex-gui.locale"))).toBeNull();

  await openLanguageOptions(page);
  await page.getByRole("option", { name: "英语 · English", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("codex-gui.locale"))).toBe("en");

  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
  await expect(page.getByTestId("settings-route").getByRole("group")).toContainText("English");
});

test("settings remains usable without launch parameters and reports the original error on chat", async ({
  page,
}) => {
  await page.goto("/settings");

  await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeFocused();
  await expect(page.getByRole("button", { name: /Language$/ })).toBeEnabled();
  await expect(page.getByText("Unable to start Codex GUI")).toHaveCount(0);

  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.getByText("Unable to start Codex GUI")).toBeVisible();
  await expect(page.getByText(/threadId/)).toBeVisible();
});

for (const viewport of [
  { name: "desktop", width: 1280, height: 900 },
  { name: "narrow", width: 375, height: 667 },
] as const) {
  test(`settings layout, popover, focus, and overflow are correct at ${viewport.name} width`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await routeGuiHostWebSocket(page, { emitActiveTurnEvent: false });
    await page.goto(`/settings?threadId=${threadId}#token=e2e-secret-token`);

    const heading = page.getByRole("heading", { level: 1, name: "Settings" });
    await expect(heading).toBeFocused();
    await openLanguageOptions(page);
    await expect(page.getByRole("searchbox", { name: "Search languages" })).not.toBeFocused();

    const metrics = await page.evaluate(() => {
      const settings = document.querySelector<HTMLElement>('[data-testid="settings-route"]');
      const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
      const languageTrigger = settings?.querySelector<HTMLElement>('[role="group"]');
      return {
        documentClientWidth: document.documentElement.clientWidth,
        documentScrollWidth: document.documentElement.scrollWidth,
        bodyClientWidth: document.body.clientWidth,
        bodyScrollWidth: document.body.scrollWidth,
        settingsRight: settings?.getBoundingClientRect().right ?? 0,
        dialogLeft: dialog?.getBoundingClientRect().left ?? -1,
        dialogRight: dialog?.getBoundingClientRect().right ?? 0,
        languageTriggerLeft: languageTrigger?.getBoundingClientRect().left ?? -1,
        languageTriggerRight: languageTrigger?.getBoundingClientRect().right ?? 0,
      };
    });

    expect(metrics.documentScrollWidth).toBeLessThanOrEqual(metrics.documentClientWidth);
    expect(metrics.bodyScrollWidth).toBeLessThanOrEqual(metrics.bodyClientWidth);
    expect(metrics.settingsRight).toBeLessThanOrEqual(metrics.documentClientWidth);
    expect(metrics.dialogLeft).toBeGreaterThanOrEqual(0);
    expect(metrics.dialogRight).toBeLessThanOrEqual(metrics.documentClientWidth);
    expect(metrics.languageTriggerLeft).toBeGreaterThanOrEqual(0);
    expect(metrics.languageTriggerRight).toBeLessThanOrEqual(metrics.documentClientWidth);
  });
}

type VisualLocale = "en" | "zh-CN";

const prepareVisualPage = async (page: Page, locale: VisualLocale): Promise<void> => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.addInitScript((preference) => {
    localStorage.setItem("codex-gui.locale", preference);
  }, locale);
  await routeGuiHostWebSocket(page, {
    attach: visualAttachResponse,
    emitActiveTurnEvent: false,
  });
};

test("settings screenshot in English", { tag: "@visual" }, async ({ page }) => {
  await prepareVisualPage(page, "en");

  await page.goto(`/settings?threadId=${threadId}#token=e2e-secret-token`);
  await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
  await expect(page).toHaveScreenshot("settings-english.png", {
    animations: "disabled",
    fullPage: true,
  });

});

test("chat screenshot in English", { tag: "@visual" }, async ({ page }) => {
  await prepareVisualPage(page, "en");

  await page.goto(`/?threadId=${threadId}#token=e2e-secret-token`);
  await expect(page.locator("main")).toHaveAttribute("data-gui-host-status", "attached");
  await expect(page.getByText("Dynamic model content stays exactly as written.")).toBeVisible();
  await expect(page).toHaveScreenshot("chat-english.png", {
    animations: "disabled",
    fullPage: true,
  });
});

test("settings screenshot in Simplified Chinese", { tag: "@visual" }, async ({ page }) => {
  await prepareVisualPage(page, "zh-CN");

  await page.goto(`/settings?threadId=${threadId}#token=e2e-secret-token`);
  await expect(page.getByRole("heading", { level: 1, name: "设置" })).toBeVisible();
  await expect(page).toHaveScreenshot("settings-zh-CN.png", {
    animations: "disabled",
    fullPage: true,
  });

});

test("chat screenshot in Simplified Chinese", { tag: "@visual" }, async ({ page }) => {
  await prepareVisualPage(page, "zh-CN");

  await page.goto(`/?threadId=${threadId}#token=e2e-secret-token`);
  await expect(page.locator("main")).toHaveAttribute("data-gui-host-status", "attached");
  await expect(page.getByText("Dynamic model content stays exactly as written.")).toBeVisible();
  await expect(page).toHaveScreenshot("chat-zh-CN.png", {
    animations: "disabled",
    fullPage: true,
  });
});
