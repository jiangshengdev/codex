# Composer E2E 与验证实施计划

> **给 agentic workers:** 必须使用 `superpowers:subagent-driven-development`（推荐）或 `superpowers:executing-plans` 按任务执行本计划。步骤使用 checkbox (`- [ ]`) 语法跟踪。

**目标:** 用 Playwright 和完整前端检查验证 composer `Send` / `Stop` 行为。

**架构:** 扩展现有 `/ws` route mock, 在真实浏览器路径中完成 authenticate / initialize / attach 后操作 composer。E2E 只断言用户行为和 JSON-RPC payload, 不断言 HeroUI 内部 DOM。

**技术栈:** Playwright, Vite dev server through Playwright config, JSON-RPC WebSocket route, pnpm scripts。

---

## 文件结构

**修改:**

- `/Users/jiangsheng/cnb/codex/codex-gui/e2e/app.spec.ts`
  - 扩展 WebSocket request capture, 保存完整 request。
  - 为 route mock 增加可选 active turn event, 让 Send 和 Stop tests 使用不同 fixture 状态。
  - 新增 send/stop e2e tests。

**本计划不修改 production files。**

## Task 1: 扩展 e2e WebSocket capture

**文件:**

- 修改: `/Users/jiangsheng/cnb/codex/codex-gui/e2e/app.spec.ts`

- [ ] **Step 1: 保存完整 requests 并加入 route options**

Replace:

```ts
async function routeGuiHostWebSocket(page: Page): Promise<string[]> {
  const sentMethods: string[] = [];
```

替换为:

```ts
type RouteGuiHostWebSocketOptions = {
  emitActiveTurnEvent?: boolean;
};

async function routeGuiHostWebSocket(
  page: Page,
  options: RouteGuiHostWebSocketOptions = {},
): Promise<RpcRequest[]> {
  const emitActiveTurnEvent = options.emitActiveTurnEvent ?? true;
  const sentRequests: RpcRequest[] = [];
```

Inside `ws.onMessage`, replace:

```ts
sentMethods.push(request.method);
```

替换为:

```ts
sentRequests.push(request);
```

At the end, return:

```ts
return sentRequests;
```

Inside the `thread/projection/attach` branch, replace the unconditional projection event send:

```ts
ws.send(
  JSON.stringify({
    jsonrpc: "2.0",
    method: "thread/projection/event",
    params: projectionEvent,
  }),
);
```

with:

```ts
if (emitActiveTurnEvent) {
  ws.send(
    JSON.stringify({
      jsonrpc: "2.0",
      method: "thread/projection/event",
      params: projectionEvent,
    }),
  );
}
```

- [ ] **Step 2: 更新现有 expectation**

Replace:

```ts
const sentMethods = await routeGuiHostWebSocket(page);
```

替换为:

```ts
const sentRequests = await routeGuiHostWebSocket(page);
```

Replace:

```ts
expect.poll(() => sentMethods).toEqual(["gui/authenticate", "initialize", "thread/projection/attach"]);
```

替换为:

```ts
await expect
  .poll(() => sentRequests.map((request) => request.method))
  .toEqual(["gui/authenticate", "initialize", "thread/projection/attach"]);
```

## Task 2: 让 route mock 响应 turn commands

**文件:**

- 修改: `/Users/jiangsheng/cnb/codex/codex-gui/e2e/app.spec.ts`

- [ ] **Step 1: 添加 turn/start handler**

Before fallback unexpected method response, add:

```ts
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
```

- [ ] **Step 2: 添加 turn/interrupt handler**

在 `turn/start` handler 后加入:

```ts
if (request.method === "turn/interrupt") {
  ws.send(JSON.stringify({ jsonrpc: "2.0", id: request.id, result: {} }));
  return;
}
```

## Task 3: 写 Send e2e test

**文件:**

- 修改: `/Users/jiangsheng/cnb/codex/codex-gui/e2e/app.spec.ts`

- [ ] **Step 1: 添加测试**

```ts
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
```

- [ ] **Step 2: 运行 e2e test, 必要时确认实现前失败**

如果 `01`-`03` 尚未实现, 运行:

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
pnpm run test:e2e -- e2e/app.spec.ts -g "sends plain text through turn/start"
```

实现前预期: FAIL, 因为 composer 不存在或处于 disabled。

实现后预期: PASS。

## Task 4: 写 Stop e2e test

**文件:**

- 修改: `/Users/jiangsheng/cnb/codex/codex-gui/e2e/app.spec.ts`

- [ ] **Step 1: 添加测试**

```ts
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
```

- [ ] **Step 2: 运行 e2e test**

运行:

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
pnpm run test:e2e -- e2e/app.spec.ts -g "interrupts active turn through turn/interrupt"
```

实现后预期: PASS。

## Task 5: 最终检查

- [ ] **Step 1: 运行 unit tests**

运行:

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
pnpm run test
```

预期: PASS。

- [ ] **Step 2: 运行 browser tests**

运行:

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
pnpm run test:browser
```

预期: PASS。

- [ ] **Step 3: 运行 e2e tests**

运行:

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
pnpm run test:e2e
```

预期: PASS。

- [ ] **Step 4: 运行 lint/type-check**

运行:

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
pnpm run lint
pnpm run type-check
```

预期: 两个命令 exit 0。

- [ ] **Step 5: 提交**

运行:

```bash
cd /Users/jiangsheng/cnb/codex
git add codex-gui/e2e/app.spec.ts
git commit -m "test(gui): cover composer send and stop e2e"
```
