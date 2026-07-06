# Codex GUI 顶部持久 Notice Sticky 设计

## 背景

当前 `codex-gui` 的启动错误由 `AppShell` 中的 `GuiHostErrorAlert` 渲染。错误来自 `GuiHostStatus.error`，例如 `Unable to start Codex GUI` 和 `GUI host WebSocket closed (code=1006)`。该 `Alert` 现在位于 `Toast.Provider` 之后、transcript `Surface` 之前，但只是普通文档流内容，页面向下滚动后会离开视口。

用户目标是让顶部报错信息 sticky。由于顶部持久信息肯定不止一条，不能让多个 notice 各自使用 `sticky top-0`，否则它们会竞争同一个粘滞位置并互相覆盖。

## 目标

- 引入页面级顶部持久 notice 区域，统一承载启动错误和未来其他顶部持久状态提示。
- sticky 行为只属于统一容器，不属于单条 notice。
- 多条 notice 在容器内部自然纵向堆叠。
- 保持现有 HeroUI `Alert` 表达错误语义。
- 不改变 GUI host 连接状态、WebSocket 错误生成、transcript 渲染或底部 composer sticky 行为。

## 非目标

- 不实现通用 toast 系统替换。
- 不合并临时 toast 和持久 notice 的生命周期。
- 不新增 notice 优先级、折叠、关闭、队列或过期机制。
- 不修改 `guiHostClient`、`GuiHostConnectionBridge` 或 Rust `gui-host`。
- 不在本设计阶段落盘 implementation plan。

## 决策

### 顶部 sticky 归属

采用 `AppShellTopNotices` 统一容器。只有该容器使用 `sticky top-0`，`GuiHostErrorAlert` 等单条 notice 不单独 sticky。

理由：

- 避免多个 `top-0` sticky 元素重叠。
- 后续新增顶部持久错误或警告时可以复用同一布局边界。
- 页面层级清晰：`AppShell` 管页面持久状态，具体 notice 组件只表达内容和语义。

### DOM 位置

`AppShellTopNotices` 放在 `Toast.Provider` 之后、transcript `Surface` 之前。

理由：

- `Toast.Provider` 继续负责临时反馈。
- 顶部 notice 是页面状态，不属于 transcript 内容。
- 位置靠近当前 `GuiHostErrorAlert`，改动面小。

### 宽度和对齐

容器本身全宽 sticky；内部内容使用 `max-w-3xl mx-auto` 与 transcript 和 composer 对齐。

理由：

- sticky 命中区域覆盖整页顶部。
- alert 视觉宽度保持现有中间列风格。
- 后续需要顶部背景或分隔线时有稳定的全宽容器边界。

### 视觉边界

sticky 容器使用页面背景和轻微底部分隔。

建议语义：

- 背景使用 `bg-background`。
- 底部分隔使用现有语义 token 对应的边框类。
- 单条 alert 保持 HeroUI `Alert status="danger"`。

理由：

- 滚动时 transcript 文本不会从 notice 后面透出。
- 多条 notice 堆叠时仍能保持一个稳定的顶部状态区。

### 多 notice 堆叠

内部使用纵向布局，例如 `grid gap-2`。

理由：

- 文案长度不可控，纵向堆叠在移动端和桌面都稳定。
- 不需要引入横向压缩、折叠或优先级机制。

### 层级

sticky 容器使用 `z-20`。

理由：

- 明确高于底部 composer 当前的 `z-10`。
- 不提升到 modal、popover 或 toast 级别，避免普通页面状态区抢占 overlay 层级。

## 组件边界

建议新增 `AppShellTopNotices`，作为 `AppShell` 内部页面布局组件。

职责：

- 负责 sticky、宽度、背景、分隔线、z-index 和 notice 堆叠。
- 接收子元素或在当前阶段直接包裹 `GuiHostErrorAlert`。

`GuiHostErrorAlert` 职责保持不变：

- 只在 `status.label === "error"` 时渲染。
- 使用 HeroUI `Alert` 表达 danger 状态。
- 显示固定标题 `Unable to start Codex GUI` 和 `status.message`。
- 不包含 sticky、top 或全页层级职责。

## 测试策略

更新现有 `App.browser.test.tsx` 的启动错误测试，优先验证结构契约：

- 页面进入 `data-gui-host-status="error"`。
- 顶部 notices 容器存在。
- 容器具有 sticky 顶部布局契约，例如 `sticky`、`top-0`、`z-20`。
- `Unable to start Codex GUI` 和错误消息位于该容器内部。
- composer 在错误状态下仍 disabled。

本阶段不建议加入真实滚动后仍可见的 browser test。滚动、viewport 和 sticky 的组合在浏览器测试中更容易受环境噪声影响；该行为适合在实现后通过手动视觉验证补充确认。

## 风险

- 如果未来顶部持久 notice 数量过多，sticky 区域会占用过多垂直空间。当前设计不处理折叠，后续可以在需求明确时增加优先级或折叠机制。
- `z-20` 需要与 HeroUI overlay 层级保持区分。实现时不要提升到过高层级。
- 容器背景和边框应使用项目现有语义 token，避免引入硬编码颜色。

## 验证范围

设计对应的实现计划应至少覆盖：

- `AppShell` 结构和 class 契约。
- `GuiHostErrorAlert` 不再承担 sticky 职责。
- `App.browser.test.tsx` 启动错误测试更新。
- focused browser test、type-check、scoped eslint、format、`git diff --check`。
