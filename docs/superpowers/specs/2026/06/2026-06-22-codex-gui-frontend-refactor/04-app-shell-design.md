# Codex GUI App Shell Refactor Design

日期: 2026-06-22
状态: 设计已确认
范围: codex-gui App shell 行为保持型重构

## 目标

`04` 阶段纳入本轮必做范围。目标是降低 `codex-gui/src/App.tsx` 的职责复杂度, 同时保持
用户可见行为、UI 结构、projection runtime 派发语义和 host connection 语义不变。

本阶段不做:

- 不调整页面布局、滚动边界、composer 位置或 transcript 视觉结构。
- 不改变 `startGuiHostConnection` 的连接生命周期语义。
- 不改变 projection attach/event/closed 到 Redux action 的派发顺序。
- 不新增 app-server API 或改变 JSON-RPC payload。
- 不默认修改 `codex-gui/e2e/app.spec.ts`。

## 现状问题

`App.tsx` 同时承担以下职责:

- 组合页面 shell、transcript surface、composer 和 toast provider。
- 持有 host connection effect。
- 处理 launch params、projection attached/event/closed callbacks。
- 管理 `GuiHostCommands | null` 状态。
- 驱动 `ProjectionIngressAdapter` 并把 outcome 映射为 runtime Redux actions。

这些职责都属于 App shell 运行时边界, 但不需要全部堆在同一个组件文件里。`04` 的重点是把
布局组合和 host wiring 分开, 让 `App.tsx` 回到轻量组合层。

## 设计边界

本阶段拆两个生产边界, 但必须分两个小切片实施。

### `AppShell`

`AppShell` 负责页面布局和固定 UI 区域:

- 挂载 `CommittedTranscriptSurface`。
- 挂载 composer turn control。
- 保留当前 toast provider 位置和 props。
- 保留当前 shell className、padding、宽度、底部边界和可访问性行为。

`AppShell` 不负责:

- 启动 WebSocket connection。
- 读取 launch params。
- 处理 projection runtime outcome。
- 创建或持有 `ProjectionIngressAdapter`。

`AppShell` 的 props 只表达 shell 渲染所需数据, 例如 host commands、active turn id、thread id 或
composer disabled state。具体 prop 形状由实施计划基于现有 `App.tsx` 代码确定, 但不得引入新的
Redux 状态或 UI 行为。

### `GuiHostConnectionBridge`

`GuiHostConnectionBridge` 负责 host connection wiring:

- 持有 `startGuiHostConnection` 的 React effect 生命周期。
- 接收当前 location、history replaceState 和必要 callbacks。
- 处理 `onLaunchParams`、`onProjectionAttached`、`onProjectionEvent`、`onProjectionClosed`、
  `onCommandsReady` 和 `onCommandsUnavailable`。
- 维护现有 `GuiHostCommands | null` ready/unavailable 行为。
- 按现有逻辑驱动 `ProjectionIngressAdapter` outcome 到 Redux runtime actions。

`GuiHostConnectionBridge` 不负责:

- 渲染 transcript 或 composer UI。
- 改变 projection ingress validation 规则。
- 抽象成非 React controller。
- 新增 command API 或 protocol guard。

## Redux 和 runtime 派发

Redux/runtime 派发边界保持现状, 只移动代码位置。

本阶段允许把当前 App 内的 dispatch wiring 移动到 `GuiHostConnectionBridge`, 但不新增
`useProjectionRuntimeDispatch` 这类 hook, 也不把 `ProjectionIngressAdapter` 管理拆成独立
controller。这样可以避免和 `03-gui-host-protocol-design.md` 的协议边界重叠。

必须保持:

- attach accepted 时的 runtime action 语义不变。
- event accepted 时的 runtime action 语义不变。
- manual reconnect required 时的 runtime action 语义不变。
- ignored outcome 的处理语义不变。
- host commands ready/unavailable 对 composer 可用性的影响不变。

## 测试策略

本阶段先拆 `App.browser.test.tsx` test support, 再改 `App.tsx`。

测试 helper 拆分目标:

- 整理 mocked host connection。
- 整理 render helpers。
- 整理 fixture builders。
- 不改变测试断言语义。
- 不新增 e2e 依赖。

生产代码拆分后, 主验证仍是现有 `App.browser.test.tsx`。只有当拆出的 `AppShell` 或
`GuiHostConnectionBridge` 出现无法通过现有 browser tests 锁住的分支时, 才考虑新增更小的测试。

## e2e 范围

`04` 不默认编辑 `codex-gui/e2e/app.spec.ts`。

现有 e2e 可作为最终烟测运行, 用于确认真实 WebSocket route、launch token、mobile viewport、
`turn/start` 和 `turn/interrupt` payload 没有被 App shell 拆分破坏。是否运行 e2e 由实施计划按
风险和成本决定。

## 实施顺序

本阶段实施计划应按以下顺序拆小步:

1. 拆 `App.browser.test.tsx` test support, 保持测试语义不变。
2. 抽 `AppShell`, 保持 UI shell DOM/class/可访问性行为不变。
3. 抽 `GuiHostConnectionBridge`, 将 host connection effect 生命周期下沉。
4. 跑 `App.browser.test.tsx`。
5. 跑 `type-check`。
6. 视风险决定是否跑现有 e2e 烟测。

## 停止条件

本阶段停止条件是职责清楚, 不追求行数阈值。

完成后应满足:

- `App.tsx` 只剩组合和状态衔接职责。
- `AppShell` 只表达页面 shell。
- `GuiHostConnectionBridge` 只表达 host connection wiring。
- 测试 helper 位于测试目录内, 不污染生产模块边界。
- 现有 App browser tests 继续验证 host status hook、composer enabled/disabled、Send/Stop、
  attach mismatch、backpressure、unmount cleanup 和 no optimistic message。

如果继续拆分需要新增抽象、改变状态所有权或触碰 e2e 语义, 必须停止并重新设计。
