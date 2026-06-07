# YOLO Single-Session Chat GUI Overall Design

## 目标

把当前 GUI 从连接状态验证面板推进为 YOLO 风格的单会话普通聊天界面。用户通过 TUI 的 `/gui` 打开当前 primary thread 后，可以在 GUI 中查看已有历史、继续发送消息、看到 assistant 流式回复、查看简化 tool activity，并在需要时中断当前 turn。

这个目标必须以 TUI 的真实分层为参考进行 GUI 侧重建。凡是 TUI 已经有明确分层的地方，GUI 只做浏览器环境下的等价实现；只有 TUI 无法直接映射的地方，才做 GUI 侧决策。

## 已确认范围

- 只支持 `/gui` 打开的单个当前会话。
- 启动后必须加载当前会话已有历史。
- 使用普通聊天模式，不复刻 TUI 的完整 transcript 模式。
- Composer 第一版只支持纯文本输入、发送和中断。
- Assistant 消息第一版只支持基础 Markdown：段落、列表、代码块和链接。
- Tool activity 使用简化详情：显示工具名、状态、关键输出片段，并支持展开查看更多。
- 先不做审核、review、approval、permissions 弹窗或类似控制流。

## 非目标

- 不做多会话列表、新建会话、恢复会话、fork 会话或会话切换。
- 不做 slash command 输入体验。
- 不做 `@file` mention、图片、文件附件或粘贴附件。
- 不做 TUI keymap、Vim 模式、composer 历史搜索。
- 不做 TUI transcript renderer 的完整迁移。
- 不把现有 `codex-gui` 的临时 projection store 当成设计真理或实现 seed。

## 当前基线

当前 `codex-gui` 入口主要展示 GUI host 连接状态：连接、鉴权、initialize、attach、事件计数和最后事件类型。现有 Redux projection slice 可以接收 `thread/projection/attach` snapshot，并用 `thread/projection/event` 增量更新 thread projection，同时维护 `commitId` / `parentCommitId` 连续性并在 `commitChainMismatch`、`missingTurn` 时判定需要 reattach。

这仍然是临时调试实现。它可以说明 GUI 现在如何收到 app-server projection 输出，但不能作为 YOLO GUI 的基础模型。调试 UI 和直接以 projection state 驱动界面的做法应丢弃；commit-chain 连续性校验和 reattach 判定是协议逻辑，后续必须迁移保留。

TUI 侧已有 `/gui` 命令，负责为 primary thread 生成本地 GUI URL。这个目标继续沿用该入口，不扩大到独立 GUI 启动器或远程 GUI 会话。

## Projection 的位置

`projection` 的含义是：app-server 将 thread 事件流投影成 GUI 可消费的 snapshot/event 流。

因此 projection 是 GUI 第一版接入 app-server thread 数据的输入面，不是 GUI 自己的核心状态边界。第一版 GUI 消费 projection 三件套：

- `thread/projection/attach` 返回的 snapshot。
- `thread/projection/event` 后续增量事件。
- `thread/projection/closed` 背压断开信号。

`thread/projection/closed` 当前只有 `backpressure` reason，表示 server 端 fanout 积压导致订阅被强制断开。它不是会话结束，也不是 chat runtime 的终止信号；GUI 收到后应重新 attach，并用新的 snapshot 重建 runtime。

Streaming 是已知的后续扩展点。当前 projection event 只覆盖 `turnStarted`、`turnCompleted`、`itemStarted`、`itemCompleted`，不会投影逐字增量的 `item/agentMessage/delta`。因此 projection ingress 与 thread runtime 的边界不能设计成封闭的唯一输入流；它需要容纳将来并联订阅普通 notification 形成第二条输入流，例如 item delta。

GUI 不应把 projection 输出直接等同于自己的长期状态模型。projection snapshot/event 进入 GUI 后，下一层应该是 GUI thread runtime，而不是直接从 projection state 派生 chat view model。

## TUI 参考分层

TUI 的关键分层是：

- App 层持有 `primary_thread_id`、`active_thread_id`、`thread_event_channels`、`active_thread_rx`。
- 每个 thread 有自己的 `ThreadEventChannel`。
- 每个 channel 持有 `ThreadEventStore`。
- `ThreadEventStore` 保存 replay/live 所需材料：`session`、`turns`、`buffer`、`active_turn_id`、`input_state`、`active`。
- thread 切换或恢复时，TUI 生成 `ThreadEventSnapshot`，再 replay 到 `ChatWidget`。
- live event 和 replay event 最终都进入 `ChatWidget`，但带有不同 replay kind。
- TUI 不把 `ThreadProjectionEvent` / `ThreadProjectionClosed` 当作主线程路由或 ChatWidget 渲染基础。

GUI 第一版只支持单会话，因此不需要完整复刻 TUI 的多线程切换能力。但它仍然需要保留同样的核心边界：输入协议、thread runtime、snapshot replay、live event handling、chat surface 分开。

## 推荐架构

GUI 的长期方向是：

```text
TUI /gui launch URL
  -> GUI host WebSocket handshake
  -> app-server input ingress
     -> projection attach/event/closed
     -> future streaming notifications
  -> GUI thread identity shell
  -> GUI thread runtime store
  -> snapshot replay
  -> live event handling
  -> streaming-ready assistant message model
  -> chat surface view model
  -> React UI
```

这条链路里的职责边界：

- `guiHostClient` 第一版负责 URL 参数、token、WebSocket、JSON-RPC handshake、projection attach/event/closed 输入，但 ingress 形状要能扩展到后续普通 notification streaming 输入。
- thread identity shell 只负责确认 launch thread id 和 attached thread id 是同一个线程。
- thread runtime store 负责保存可 replay/live 处理的 thread runtime 状态。
- snapshot replay 负责把 attach snapshot 转成初始 UI 状态。
- live event handling 负责把后续事件应用到当前 runtime。
- streaming-ready assistant message model 负责把 assistant 文本建模成可增量 append 的 buffer。
- chat surface view model 只从 runtime 派生展示模型，不直接拥有协议事实。
- React UI 只渲染 view model 和提交用户操作。

## 分层拆分

这个任务必须拆成极小任务，按金字塔推进：

```text
YOLO single-session chat GUI
├─ 00 overall design
├─ 01 thread identity shell
├─ 02 projection ingress adapter
├─ 03 thread runtime store
├─ 04 snapshot replay
├─ 05 live event handling
├─ 05a streaming readiness
├─ 06 basic chat surface
├─ 07 composer turn control
├─ 08 tool activity
└─ 09 verification and smoke
```

每一层只允许依赖它下面已经完成的层。上层不能反向决定下层模型。

## 第一阶段：Thread Identity Shell

第一阶段只做线程身份外壳，不做消息、不做 turns、不做 items、不做 replay。

状态只需要表达：

```ts
type GuiThreadIdentityState = {
  launchThreadId: string | null;
  attachedThreadId: string | null;
  attachStatus: "none" | "attached" | "mismatch";
};
```

行为：

- URL `/gui` 的 `threadId` 写入 `launchThreadId`。
- `thread/projection/attach` snapshot 的 `thread.id` 写入 `attachedThreadId`。
- 两者一致时进入 `attached`。
- 两者不一致时进入 `mismatch`，停止继续推进 chat runtime。
- `mismatch` 是异常状态，不自动切换到 attached thread。UI 应显示阻塞错误，说明 launch thread 和 attached thread 不一致；用户可以重试当前 URL 的 attach，若仍不一致，则需要从 TUI 重新打开 `/gui`。

非目标：

- 不保存 `Thread`。
- 不保存 `turns`。
- 不保存 `items`。
- 不设计 chat view model。
- 不设计 composer。
- 不设计 tool activity。

第一阶段的价值是把 GUI 从临时 projection debug panel 里拆出来，先建立和 TUI 一致的 thread identity 边界。

## 后续阶段

### 02 Projection Ingress Adapter

把 `thread/projection/attach`、`thread/projection/event`、`thread/projection/closed` 变成 GUI runtime 可消费的输入事件。这里仍然不设计聊天 UI。

这是 `thread/projection/closed` 的新增处理工作；当前 `guiHostClient` 只有 WebSocket closed 生命周期状态，没有接好 projection closed notification。`closed(backpressure)` 应转换成 reattach 请求，而不是会话关闭状态。

这一层保留 projection event 的 `commitId` / `parentCommitId` 连续性校验。出现 `commitChainMismatch` 或 `missingTurn` 时，adapter 应触发 reattach，用新 snapshot 修复本地 runtime。GUI URL 中 `threadId` 来自 query string，启动 token 来自 fragment `#token=...`，不要从 query string 读取 token。

### 03 Thread Runtime Store

建立浏览器环境下的 per-thread runtime store。单会话第一版可以只有一个 runtime，但模型必须能表达 TUI 同类职责：session、turns、buffer、active turn、subscription interrupted/error 状态。

runtime store 接收已通过 ingress 校验的 projection 输入，并保留 reattach 判定结果对 runtime 的影响：正常 event 进入 live 路径，`commitChainMismatch`、`missingTurn`、`closed(backpressure)` 进入 reattach 路径。建立 runtime 后，现有 Redux `projectionSlice` 的去向是删除，而不是降级或保留；它的调试 UI 职责删除，必要的 commit-chain 校验和 reattach 判定迁移到 projection ingress / runtime 边界。

### 04 Snapshot Replay

将 attach snapshot 作为 runtime 初始化材料，并明确 replay 路径和 live 路径不同。replay 不应触发 live-only UI 副作用。

### 05 Live Event Handling

处理 attach 之后的增量事件，更新 runtime，并维持 active turn / live update / subscription interrupted 状态。

`closed(backpressure)` 的处理路径必须是触发 re-attach，并用新的 attach snapshot 重建 runtime。UI 可以短暂显示 reconnecting/status 行，但不能把它呈现为“会话已关闭”的死胡同。

### 05a Streaming Readiness

当前 projection 不支持逐字流式：projection event 只包含 turn/item 的 started/completed，逐字增量的 `item/agentMessage/delta` 不会进入 projection。后端 Rust streaming 设计推迟到实现到该处时再补。

GUI 第一版先按非流式实现：assistant 回复在 item / turn 完成时整段呈现。但 assistant message 的 view model 必须按可增量 append 的 buffer 建模，而不是只有完成态的整段 final string。这样将来接入 delta 时，UI 和 view model 形状不需要重做。

### 06 Basic Chat Surface

从 runtime 派生普通聊天 view model。只覆盖 user message、assistant text、基础 Markdown 和基础状态行。assistant 文本内部表示使用可 append buffer，渲染层只读取当前 buffer 内容。

### 07 Composer Turn Control

接入纯文本 composer、`turn/start`、`turn/interrupt`，并处理发送失败、中断中、运行中状态。`turn/start.input` 是 `Vec<UserInput>`，纯文本输入要包装成单个 `Text` variant，而不是直接发送 string。

### 08 Tool Activity

从 runtime 派生 tool activity 展示。第一版只做简化详情和展开，不实现 approval/review 控制流。

### 09 Verification And Smoke

补 browser/e2e smoke，覆盖 `/gui` 打开、attach 身份一致、snapshot 初始化、live event 更新、发送 turn、中断 turn、错误状态。

## UI 形态

最终聊天界面仍然是三段式：

- 顶部：当前会话标题、连接状态、turn 状态。
- 中部：聊天消息列表，默认滚动到最新消息。
- 底部：纯文本 composer、发送按钮、Stop 按钮。

消息列表按普通聊天产品展示：

- User message：用户消息。
- Assistant message：assistant 文本，支持基础 Markdown。
- Tool activity：嵌入 assistant 区域的活动块，默认显示简化详情。
- Error/status：轻量提示行，不进入复杂 transcript 样式。

这些 UI 形态不反向约束底层 runtime。只有在 thread identity、projection ingress、runtime、replay/live 层稳定后，才进入具体渲染。

## 验收标准

总体验收：

- 从 TUI 运行 `/gui` 打开的 GUI 能显示当前会话已有历史。
- 用户可以在 GUI 输入普通文本并发送到当前会话。
- Assistant 回复能在 GUI 中更新，并以基础 Markdown 呈现。
- 当前 turn 运行时，用户可以点击 Stop 发起中断。
- 至少一种 tool activity 能以简化详情展示，并可展开查看更多内容。
- GUI 不要求 review/approval 能力，也不要求多会话能力。

分阶段验收：

- 每个阶段只能验收该阶段自己的边界。
- `01` 只验收 thread identity，不验收 chat。
- `02` 只验收 projection 输入适配，不验收 runtime。
- `03` 只验收 runtime store，不验收 UI。
- `04` 只验收 snapshot replay。
- `05` 只验收 live event handling。
- `05a` 只验收 streaming-ready message model，不验收真实 delta 输入。
- `06` 之后才开始验收聊天展示。

## 设计原则

- TUI 是主要参考，不是背景材料。
- Projection 是 app-server 的投影输出，不是 GUI 状态真理。
- 当前 GUI store 是临时调试代码，不作为后续设计依据；其中 commit-chain 连续性校验和 reattach 判定属于协议逻辑，必须迁移保留。
- 第一版 projection 三件套是输入面起点，不是封闭边界；后续 streaming notification 输入必须能并入同一个 runtime。
- 先做线程，再做事件，再做 replay/live，再做 chat。
- 每个子设计必须足够小，可以独立实现、独立回退、独立验收。
