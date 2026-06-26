# codex-gui 启动错误显示设计

## 背景

`codex-gui` 通过 GUI host 提供的 launch URL 启动。当前 launch URL 使用 query 传递 `threadId`，使用 fragment 传递 launch token：

```text
/?threadId=<thread-id>#token=<launch-token>
```

前端启动时，`readLaunchParams()` 会读取这两个参数，并在缺少必要参数时抛错。`GuiHostConnectionBridge` 已经会捕获这些错误并设置 `GuiHostStatus.error`。例如，直接打开 Vite dev URL 且没有 `#token=` 时，会得到：

```text
Missing launch token fragment
```

当前问题是 `AppShell` 只把状态写入 `data-gui-host-status`，没有把 `GuiHostStatus.error.message` 渲染成用户可见内容。因此前端开发环境里缺 token 时虽然状态已经变成 error，但页面没有清晰报错。

## 目标

- 在 `codex-gui` 页面中可见显示所有 `GuiHostStatus.error.message`。
- 缺少 launch token 时，页面显示明确错误信息。
- 复用现有 GUI host 状态流，不新增 token 专用状态。
- 使用 HeroUI React v3 组件和现有 `AppShell` 布局风格。
- 保持 transcript 和 composer 的现有结构，不为错误状态重写页面主流程。

## 已确认决策

- 错误覆盖范围：显示所有 `GuiHostStatus.error.message`，包括缺 token、缺 `threadId`、WebSocket 握手失败和协议错误。
- 显示位置：在页面顶部显示持久错误提示，不替换 transcript 区域，不只使用 transient toast。
- 文案形态：使用固定标题加原始错误详情。
- HeroUI 组件：使用 `Alert` 的 compound API。

## 非目标

- 不修改 `codex-rs/gui-host`。
- 不尝试在 Rust host 层判断缺少 token。token 位于 URL fragment，浏览器不会把 fragment 发送给服务端。
- 不新增 token 专用错误类型或状态。
- 不增加错误文案映射表。
- 不自动恢复 token、重新跳转或重新生成 launch URL。
- 不改变 WebSocket 首帧 `gui/authenticate` 协议。
- 不改变 composer 的禁用逻辑。
- 不引入新依赖。

## 当前数据流

当前错误路径已经存在：

```text
readLaunchParams()
  -> throw Error("Missing launch token fragment")
  -> GuiHostConnectionBridge catch
  -> setStatus({ label: "error", message })
  -> AppShell receives GuiHostStatus.error
```

`ComposerTurnControl` 已经把 `guiHostStatus.label === "error"` 视为不可用连接状态，因此错误发生后 composer 会保持禁用。本设计只补齐页面级可见错误显示。

## UI 设计

`AppShell` 在 transcript `Surface` 上方渲染一个 HeroUI `Alert status="danger"`：

```tsx
<Alert status="danger">
  <Alert.Indicator />
  <Alert.Content>
    <Alert.Title>Unable to start Codex GUI</Alert.Title>
    <Alert.Description>{status.message}</Alert.Description>
  </Alert.Content>
</Alert>
```

布局要求：

- `Alert` 位于主内容顶部，使用现有 `main` 的页面 padding 和 `max-w-6xl` 对齐。
- `Alert` 是持久内容，只要 `status.label === "error"` 就显示。
- `Alert` 不覆盖 composer，不替换 transcript，不隐藏已有 empty transcript 状态。
- 非 error 状态不渲染该提示，避免正常连接状态下增加页面噪音。

## 组件边界

推荐把错误提示直接放在 `AppShell`：

- `AppShell` 已经接收完整 `GuiHostStatus`。
- `AppShell` 已经拥有页面主布局和 `data-gui-host-status` 测试钩子。
- `GuiHostConnectionBridge` 继续只负责连接生命周期和状态转换。
- `guiHostClient` 继续只负责读取 launch params、WebSocket 握手和协议校验。

如果 JSX 变长，可以在同文件内抽出私有小组件，例如 `GuiHostErrorAlert`。只有当 `AppShell` 可读性明显下降时才抽出；不为单次使用新增独立文件。

## 测试设计

在 `codex-gui/src/__tests__/App.browser.test.tsx` 增加 browser test：

- 模拟 `startGuiHostConnection` 在 render 阶段抛出 `Missing launch token fragment`。
- 断言页面显示 `Unable to start Codex GUI`。
- 断言页面显示 `Missing launch token fragment`。
- 断言 `main` 仍有 `data-gui-host-status="error"`。
- 断言 composer 仍禁用，确保错误状态没有绕开现有连接可用性逻辑。

已有 `appBrowserTestSupport` 默认 mock 成功启动连接。该测试可以在单个 test 内覆盖 mock implementation，让 `GuiHostConnectionBridge` 走现有 catch 分支。

不需要为 `readLaunchParams()` 增加新测试，因为缺 token 抛错已有 `guiHostClient` 单元测试覆盖。本设计关注的是 App 层是否可见显示错误。

## 验证

实现阶段应从 `codex-gui` 目录运行：

```sh
pnpm run test:browser -- src/__tests__/App.browser.test.tsx
pnpm run type-check
pnpm run lint
```

如果只修改 `AppShell` 和 App browser test，不需要运行 Rust 测试，也不需要更新 app-server schema。

## 风险与缓解

- **错误提示过度打扰正常页面**：只在 `status.label === "error"` 时渲染，不影响 connecting、authenticated、initialized、attached 或 received event 状态。
- **错误文案过度抽象**：详情直接显示原始 `status.message`，保留调试价值。
- **布局和 composer 冲突**：错误提示放在正常文档流顶部，不使用 fixed、modal 或 toast。
- **错误状态被后续 clean close 覆盖**：现有 `guiHostClient` 已有 terminal error 保护；本设计不改变状态机。

