# App Shell Composer 集成实施计划

> **给 agentic workers:** 必须使用 `superpowers:subagent-driven-development`（推荐）或 `superpowers:executing-plans` 按任务执行本计划。步骤使用 checkbox (`- [ ]`) 语法跟踪。

**目标:** 将 `ComposerTurnControl` 挂载到 `App` shell, 并保持 committed transcript surface 的只读边界。

**架构:** `App` 继续负责 host connection、projection ingress 和 Redux dispatch, 新增 `GuiHostCommands | null` state 并传给 composer。页面用 window/page 滚动, fixed composer 通过 main padding bottom 避免遮挡末尾 transcript。

**技术栈:** React, HeroUI `Surface`, Redux, Vitest Browser。

---

## 文件结构

**修改:**

- `/Users/sheng/cnb/codex/codex-gui/src/App.tsx`
  - 保存 `GuiHostCommands | null`。
  - 把 `onCommandsReady` / `onCommandsUnavailable` 接到 `startGuiHostConnection`。
  - 在 `CommittedTranscriptSurface` 后挂载 `ComposerTurnControl`。
  - 挂载一次 `Toast.Provider placement="top center"`。
  - 给 `main` 或 transcript wrapper 增加底部空间。

- `/Users/sheng/cnb/codex/codex-gui/src/__tests__/App.browser.test.tsx`
  - 更新 mock 类型。
  - 覆盖 composer 可见、attach 后发送、active turn stop、manual reconnect disabled。

**不要修改:**

- `/Users/sheng/cnb/codex/codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx`

## Task 1: 扩展 App browser test mock

**文件:**

- 修改: `/Users/sheng/cnb/codex/codex-gui/src/__tests__/App.browser.test.tsx`

- [ ] **Step 1: 引入 command 类型**

在 import 中加入:

```ts
import type { GuiHostCommands } from "@/features/guiHost/guiHostClient";
```

如果已有同源 import, 合并到现有 import block。

- [ ] **Step 2: 修改 hoisted mock 类型使用**

确保 `StartGuiHostConnectionOptions` 类型中包含 `onCommandsReady` 和 `onCommandsUnavailable`。如果 TypeScript
报错, 回到 `01-gui-host-command-api.md` 完成 options 扩展。

- [ ] **Step 3: 新增 command helper**

在 fixture helper 附近加入:

```ts
const createCommands = (): GuiHostCommands => ({
  startTurn: vi.fn().mockResolvedValue({
    turn: {
      id: "turn-started-from-app",
      items: [],
      itemsView: "full",
      status: "inProgress",
      error: null,
      startedAt: 1700000100,
      completedAt: null,
      durationMs: null,
    },
  }),
  interruptTurn: vi.fn().mockResolvedValue({}),
});
```

## Task 2: 写 App 集成失败测试

**文件:**

- 修改: `/Users/sheng/cnb/codex/codex-gui/src/__tests__/App.browser.test.tsx`

- [ ] **Step 1: 测 composer shell 出现且 debug UI 不回归**

新增测试:

```tsx
test("App renders composer in the shell without visible host debug details", async () => {
  const screen = await renderWithProviders(<App />);

  await expect.element(screen.getByRole("region", { name: "Committed transcript" })).toBeVisible();
  await expect.element(screen.getByRole("region", { name: "Message composer" })).toBeVisible();
  await expect.element(screen.getByPlaceholder("Message Codex")).toBeDisabled();
  await expect.element(screen.getByText("GUI host")).not.toBeInTheDocument();
});
```

- [ ] **Step 2: 测 commands ready 后发送**

新增测试:

```tsx
test("App passes ready commands to composer and sends plain text", async () => {
  const commandHandle = createCommands();
  const screen = await renderWithProviders(<App />);

  const options = startGuiHostConnectionMock.mock.calls[0]?.[0];
  options?.onProjectionAttached?.(attachResponse);
  options?.onStatus?.({ label: "attached", eventCount: 0, lastEventType: null });
  options?.onCommandsReady?.(commandHandle);

  await screen.getByPlaceholder("Message Codex").fill("Hello from App composer");
  await screen.getByRole("button", { name: "Send" }).click();

  expect(commandHandle.startTurn).toHaveBeenCalledWith({
    threadId: launchThreadId,
    clientUserMessageId: null,
    input: [{ type: "text", text: "Hello from App composer", text_elements: [] }],
  });
});
```

- [ ] **Step 3: 测 active turn 后 Stop**

新增测试:

```tsx
test("App enables Stop for the current active turn", async () => {
  const commandHandle = createCommands();
  const screen = await renderWithProviders(<App />);
  const projectionEvent = eventTurnStartedJson as ThreadProjectionEventNotification;

  const options = startGuiHostConnectionMock.mock.calls[0]?.[0];
  options?.onProjectionAttached?.(attachResponse);
  options?.onStatus?.({ label: "attached", eventCount: 0, lastEventType: null });
  options?.onCommandsReady?.(commandHandle);
  options?.onProjectionEvent?.(projectionEvent);

  if (projectionEvent.event.type !== "turnStarted") {
    throw new Error("fixture must contain a turnStarted projection event");
  }

  await expect.element(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  await expect.element(screen.getByRole("button", { name: "Stop" })).toBeEnabled();
  await screen.getByRole("button", { name: "Stop" }).click();

  expect(commandHandle.interruptTurn).toHaveBeenCalledWith({
    threadId: launchThreadId,
    turnId: projectionEvent.event.notification.turn.id,
  });
});
```

- [ ] **Step 4: 测 manual reconnect 禁用操作**

新增测试:

```tsx
test("App disables composer after projection backpressure requires reconnect", async () => {
  const commandHandle = createCommands();
  const screen = await renderWithProviders(<App />);
  const projectionClosed = closedBackpressureJson as ThreadProjectionClosedNotification;

  const options = startGuiHostConnectionMock.mock.calls[0]?.[0];
  options?.onProjectionAttached?.(attachResponse);
  options?.onStatus?.({ label: "attached", eventCount: 0, lastEventType: null });
  options?.onCommandsReady?.(commandHandle);
  options?.onProjectionClosed?.(projectionClosed);

  await expect.element(screen.getByPlaceholder("Message Codex")).toBeDisabled();
  await expect.element(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  await expect.element(screen.getByRole("button", { name: "Stop" })).toBeDisabled();
});
```

- [ ] **Step 5: 运行 App browser tests 确认失败**

运行:

```bash
cd /Users/sheng/cnb/codex/codex-gui
pnpm run test:browser -- src/__tests__/App.browser.test.tsx
```

预期: FAIL, 因为 `App` 还没有挂载 composer / command state。

## Task 3: 实现 App shell 集成

**文件:**

- 修改: `/Users/sheng/cnb/codex/codex-gui/src/App.tsx`

- [ ] **Step 1: 引入 composer 和 command 类型**

Modify imports:

```tsx
import { useEffect, useState } from "react";
import { Surface, Toast } from "@heroui/react";
import { ComposerTurnControl } from "./features/composerTurnControl/ComposerTurnControl";
import type { GuiHostCommands, GuiHostStatus } from "./features/guiHost/guiHostClient";
```

Keep existing `startGuiHostConnection` import.

- [ ] **Step 2: 新增 command state**

Inside `App`:

```tsx
const [commands, setCommands] = useState<GuiHostCommands | null>(null);
```

- [ ] **Step 3: 连接 host callbacks**

在 `startGuiHostConnection` options 中加入 callbacks:

```tsx
onCommandsReady: setCommands,
onCommandsUnavailable: () => setCommands(null),
```

In the catch path that sets status error, also ensure commands unavailable:

```tsx
setCommands(null);
```

In cleanup return, set commands null before cleanup:

```tsx
setCommands(null);
cleanupConnection?.();
```

- [ ] **Step 4: 挂载 composer 并预留底部空间**

Change return to:

```tsx
return (
  <main
    className="min-h-svh w-full px-4 py-6 pb-44 sm:px-6 lg:px-8"
    data-gui-host-status={status.label}
  >
    <Toast.Provider placement="top center" />
    <Surface className="mx-auto grid w-full max-w-6xl content-start p-4 sm:p-6" variant="default">
      <CommittedTranscriptSurface />
    </Surface>
    <ComposerTurnControl commands={commands} guiHostStatus={status} />
  </main>
);
```

如果后续 visual QA 显示 composer 高度可能超过 `pb-44`, 只调整底部 padding token, 并保持 page/window scroll。

- [ ] **Step 5: 运行 App browser tests**

运行:

```bash
cd /Users/sheng/cnb/codex/codex-gui
pnpm run test:browser -- src/__tests__/App.browser.test.tsx
```

预期: PASS。

## Task 4: 验证 transcript 不 optimistic append

**文件:**

- 修改: `/Users/sheng/cnb/codex/codex-gui/src/__tests__/App.browser.test.tsx`

- [ ] **Step 1: 写 no optimistic message test**

新增测试:

```tsx
test("App does not render optimistic user messages after send", async () => {
  const commandHandle = createCommands();
  const screen = await renderWithProviders(<App />);

  const options = startGuiHostConnectionMock.mock.calls[0]?.[0];
  options?.onProjectionAttached?.(attachResponse);
  options?.onStatus?.({ label: "attached", eventCount: 0, lastEventType: null });
  options?.onCommandsReady?.(commandHandle);

  await screen.getByPlaceholder("Message Codex").fill("Not optimistic");
  await screen.getByRole("button", { name: "Send" }).click();

  await expect.element(screen.getByText("Not optimistic")).not.toBeInTheDocument();
  await expect.element(screen.getByText("No committed messages yet.")).toBeVisible();
});
```

- [ ] **Step 2: 运行 App browser tests**

运行:

```bash
cd /Users/sheng/cnb/codex/codex-gui
pnpm run test:browser -- src/__tests__/App.browser.test.tsx
```

预期: PASS。

## Task 5: 局部验证与提交

- [ ] **Step 1: 运行 focused test set**

运行:

```bash
cd /Users/sheng/cnb/codex/codex-gui
pnpm vitest --run src/features/guiHost/guiHostClient.test.ts src/features/composerTurnControl/__tests__/composerTurnControlModel.test.ts
pnpm run test:browser -- src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx src/__tests__/App.browser.test.tsx
```

预期: PASS。

- [ ] **Step 2: 运行 lint/type-check**

运行:

```bash
cd /Users/sheng/cnb/codex/codex-gui
pnpm run lint
pnpm run type-check
```

预期: 两个命令 exit 0。

- [ ] **Step 3: 提交**

运行:

```bash
cd /Users/sheng/cnb/codex
git add codex-gui/src/App.tsx codex-gui/src/__tests__/App.browser.test.tsx
git commit -m "feat(gui): mount composer in chat shell"
```
