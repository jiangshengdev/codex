# Codex GUI 运行时错误熔断设计

## 背景

当前问题不是“如何避免错误 endpoint 被打开”，而是“错误 endpoint 已经进入浏览器后，页面不能卡死，不能无限报错”。

既有调研已经排除这些方向：

- `AppShell` 的单个 Alert 不是无限 DOM 或错误提示来源。
- `guiHostClient` 业务 WebSocket 没有自动重连风暴。
- React UI 当前没有无限 append 错误状态或 toast。

真正需要处理的运行时风险是：

- Vite dev client 在 HMR WebSocket 已连接后断开时，会持续 ping 等待 server 恢复。
- 普通前端应用代码可以观察 Vite/HMR 事件，但不能可靠取消 Vite dev client 自己的恢复流程。
- 如果页面继续停留在已加载 `@vite/client` 的错误状态中，浏览器可能被 Vite dev runtime 的恢复行为拖垮。

因此，项目本体需要提供一个错误状态下的稳定失败路径：错误可以发生，但必须从 Vite runtime 中退出。

## 已确认决策

主题：熔断位置

A. 采用项目本体双点熔断。

`codex-gui` 负责观察 Vite/HMR 错误。`codex-rs/gui-host` 负责提供不经过 Vite proxy 的稳定错误页。

主题：触发条件

A. 第一阶段只监听 Vite/HMR 关键事件。

触发条件限定为 `vite:ws:disconnect` 和 `vite:error`。

主题：错误页行为

A. 稳定显示，不自动恢复。

错误页不加载 Vite、不自动刷新、不定时探测。用户手动刷新或重新打开 GUI 才会重试。

主题：第一阶段范围

A. 只做项目本体根治。

修改范围限定在 `codex-rs/gui-host` 和 `codex-gui`。不依赖也不修改 `.codex/skills/debug-responsive-gui`。

## 目标

- 错误 endpoint 可以被打开。
- 页面已经进入 Vite dev runtime 后，HMR 断线或 Vite error 能触发一次性熔断。
- 熔断后浏览器离开加载了 `@vite/client` 的页面。
- 稳定错误页不自动刷新、不轮询、不触发新的恢复循环。
- 正常 GUI dev proxy 路径保持不变。
- 业务 WebSocket 错误处理保持独立，不和 Vite/HMR 熔断混在一起。

## 非目标

- 不修改 `node_modules/vite`。
- 不 monkey-patch 全局 `WebSocket`。
- 不在 `AppShell` 中实现 retry、reload 或 reconnect loop。
- 不把普通 React 错误、业务 WebSocket close、console error 都纳入第一阶段熔断。
- 不依赖 `.codex/skills/debug-responsive-gui` 作为解决方案。
- 不在第一阶段解决“如何尽量不进入错误 endpoint”。

## 架构

### `gui-host` 稳定错误页

`codex-rs/gui-host` 增加一个固定 dev error route，例如：

```text
/__codex-gui/dev-error
```

该 route 只在 GUI host dev mode 中提供，由 GUI host 直接响应，不走 Vite proxy。

错误页要求：

- 不包含 Vite 注入脚本。
- 不引用 Vite dev server 资源。
- 不自动刷新。
- 不定时探测。
- 不自动跳回原页面。
- 显示当前错误类型、Vite origin 和简短恢复说明。

现有 `embedded_pages/dev_proxy_error.html` 可以复用样式或抽取共享渲染逻辑，但新 route 的语义应是“运行时 dev error 熔断页”，不只是“proxy upstream unavailable”。

### `codex-gui` dev-only HMR observer

`codex-gui` 在 dev 环境下尽早注册 Vite HMR observer。

observer 监听：

```text
vite:ws:disconnect
vite:error
```

触发后只执行一次导航：

```text
location.replace('/__codex-gui/dev-error?...')
```

使用 `replace` 而不是 `assign`，避免浏览器历史里保留会立即重新进入 Vite 错误 runtime 的页面。

observer 不负责：

- reload。
- retry。
- toast。
- append 错误列表。
- 业务 WebSocket 重连。
- 全局 `WebSocket` 拦截。

## 状态机

初始状态：`active`

页面正常运行，Vite dev client 已加载。

事件：`vite:ws:disconnect`

进入 `tripped`。记录错误类型为 `hmrDisconnected`，发起一次 `location.replace` 到稳定错误页。

事件：`vite:error`

进入 `tripped`。记录错误类型为 `viteError`，发起一次 `location.replace` 到稳定错误页。

终态：`tripped`

本页面生命周期内不再触发第二次导航。由于页面会被替换为 GUI host 错误页，原页面的 Vite dev client 随页面卸载停止运行。

错误页状态：`stableError`

错误页不加载 `@vite/client`，不自动恢复。用户显式刷新或重新打开 GUI 才会重新尝试正常路径。

## 防循环规则

- observer 必须有本页内一次性 guard。
- 稳定错误页路径本身不能被 Vite proxy fallback 捕获。
- 稳定错误页不能加载 `codex-gui` bundle。
- 稳定错误页不能执行自动 `reload`、自动 `goto` 或自动轮询。
- observer 触发时如果当前路径已经是 `/__codex-gui/dev-error`，必须直接跳过。
- 传给错误页的 query 参数必须 bounded，只允许短枚举和短消息摘要，不能传完整 stack 或无界 payload。

## 错误页内容

错误页应显示：

- 标题：`Codex GUI dev runtime stopped`
- 错误类型：`hmrDisconnected` 或 `viteError`
- Vite origin。
- 一句说明：GUI host 仍在运行，但 dev runtime 已停止以避免浏览器卡死。
- 手动恢复方式：修复或重启 Vite 后刷新页面。

错误页不显示：

- 大段 stack trace。
- 无界 console log。
- 自动恢复倒计时。
- 会自动打开新地址的按钮。

## 测试策略

### `codex-gui`

增加 focused test 覆盖 dev-only observer：

- 收到 `vite:ws:disconnect` 后调用一次 `location.replace`。
- 收到 `vite:error` 后调用一次 `location.replace`。
- 多次事件只触发一次导航。
- 当前已在 `/__codex-gui/dev-error` 时不导航。
- 非 dev 环境不注册 observer。

### `gui-host`

增加 focused test 覆盖稳定错误页：

- dev mode 下 `/__codex-gui/dev-error` 返回 HTML。
- 响应不经过 Vite proxy。
- HTML 不包含 `@vite/client`、`/src/main.tsx` 或自动刷新逻辑。
- query 参数会被 HTML escape。
- route 不影响 `/ws` 和普通 Vite proxy fallback。

## 风险和取舍

### 会牺牲自动恢复

第一阶段故意不做自动恢复。这样可以先保证错误状态稳定，不再引入新的恢复循环。

### 只能覆盖已加载应用后的 Vite runtime 错误

如果初始请求 Vite 就失败，仍由现有 dev proxy error page 处理。新设计补的是“页面已经加载后 Vite/HMR 出错”的路径。

### 不能阻止 Vite 内部逻辑本身存在

项目不会修改 Vite 源码。解决方式是页面级卸载：从加载了 `@vite/client` 的页面导航到不含 Vite client 的稳定错误页。

## 后续可选工作

- 单独设计 `.codex/skills/debug-responsive-gui` 的 timeout 和自保熔断。
- 为错误页增加手动 Retry 按钮，但仍不做自动恢复。
- 增加更丰富的诊断信息，但必须保持 bounded。
