# YOLO Single-Session Chat GUI Overall Design

## 目标

把当前 GUI 从连接状态验证面板推进为 YOLO 风格的单会话普通聊天界面。用户通过 TUI 的 `/gui` 打开当前 primary thread 后，可以在 GUI 中查看已有历史、继续发送消息、看到 assistant 回复更新、查看简化 tool activity，并在需要时中断当前 turn。

这个目标必须以 TUI 的真实分层为参考进行 GUI 侧重建。凡是 TUI 已经有明确分层的地方，GUI 只做浏览器环境下的等价实现；只有 TUI 无法直接映射的地方，才做 GUI 侧决策。

## 已确认范围

- 只支持 `/gui` 打开的单个当前会话。
- 启动后必须加载当前会话已有历史。
- 使用普通聊天模式，不复刻 TUI 的完整 transcript 模式。
- Composer 第一版只支持纯文本输入、发送和中断。
- Assistant 消息分阶段支持：`06a/06b/06c` 先建立纯文本聊天链路，`06d Basic Markdown Rendering` 再单独支持基础 Markdown：段落、列表、代码块和链接。
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

当前 `codex-gui` 入口主要展示 GUI host 连接状态：连接、鉴权、initialize、attach、事件计数和最后事件类型。现有 Redux projection slice 可以接收 `thread/projection/attach` snapshot，并用 `thread/projection/event` 增量更新 thread projection，同时维护 `commitId` / `parentCommitId` 连续性并在 `commitChainMismatch`、`missingTurn` 时判定需要重连。

这仍然是临时调试实现。它可以说明 GUI 现在如何收到 app-server projection 输出，但不能作为 YOLO GUI 的基础模型。调试 UI 和直接以 projection state 驱动界面的做法应丢弃；commit-chain 连续性校验和重连判定是协议逻辑，后续必须迁移保留。

TUI 侧已有 `/gui` 命令，负责为 primary thread 生成本地 GUI URL。这个目标继续沿用该入口，不扩大到独立 GUI 启动器或远程 GUI 会话。

## Projection 的位置

`projection` 的含义是：app-server 将 thread 事件流投影成 GUI 可消费的 snapshot/event 流。

因此 projection 是 GUI 第一版接入 app-server thread 数据的输入面，不是 GUI 自己的核心状态边界。第一版 GUI 消费 projection 三件套：

- `thread/projection/attach` 返回的 snapshot。
- `thread/projection/event` 后续增量事件。
- `thread/projection/closed` 背压断开信号。

`thread/projection/closed` 当前只有 `backpressure` reason，表示 server 端 fanout 积压导致订阅被强制断开。它不是会话结束，也不是 chat runtime 的终止信号；GUI 收到后应进入需要用户手动重连的状态。用户确认重连后，客户端再重新 attach，并用新的 snapshot 重建 runtime。

Streaming 是已知的后续扩展点。当前 projection event 只覆盖 `turnStarted`、`turnCompleted`、`itemStarted`、`itemCompleted`，不会投影逐字增量的 `item/agentMessage/delta`。Rust / app-server 侧真实流式传输方案尚未明确，因此第一版 GUI 不提前实现前端-only 的 streaming-ready message model，避免在协议语义确定后返工。projection ingress 与 thread runtime 的边界仍不能设计成封闭的唯一输入流；它需要容纳将来并联订阅普通 notification 形成第二条输入流，例如 item delta。

GUI 不应把 projection 输出直接等同于自己的长期状态模型。projection snapshot/event 进入 GUI 后，下一层应该是 GUI thread runtime，而不是直接从 projection state 派生 chat view model。

## TUI 参考分层

TUI 的关键分层是：

- App 层持有 `primary_thread_id`、`active_thread_id`、`thread_event_channels`、`active_thread_rx`。
- 每个 thread 有自己的 `ThreadEventChannel`。
- 每个 channel 持有 `ThreadEventStore`。
- `ThreadEventStore` 保存 replay/live 所需材料：`session`、`turns`、`buffer`、`active_turn_id`、`input_state`、`active`。
- `ThreadEventStore` 对 live notification 的核心职责是写入 buffer 并维护 `active_turn_id`。`TurnStarted` 设置 active turn，匹配当前 active turn 的 `TurnCompleted` 清空 active turn；`ItemStarted` / `ItemCompleted` 只作为 notification 留在 buffer，item 的语义解释不属于这一层。
- TUI 的 buffer 是有容量上限的 replay tail，不是 active UI 每次更新时从头遍历的输入源。active thread 会通过 `active_thread_rx` 只把新到达的 event 发送给当前 `ChatWidget`。
- `ChatWidget` 对 live notification 是按条增量处理：每来一条 notification，只处理这一条对当前 UI 状态的影响。只有 thread switch、resume 或 reconnect 类路径才从 snapshot turns 和 buffered events 重建可见状态。
- thread 切换或恢复时，TUI 生成 `ThreadEventSnapshot`，再 replay 到 `ChatWidget`。
- live event 和 replay event 最终都进入 `ChatWidget`，但带有不同 replay kind。`ChatWidget` 才负责解释 `ItemStarted` / `ItemCompleted`，并把它们转换成具体聊天、tool activity 或状态展示行为。
- TUI 不把 `ThreadProjectionEvent` / `ThreadProjectionClosed` 当作主线程路由或 ChatWidget 渲染基础。

GUI 第一版只支持单会话，因此不需要完整复刻 TUI 的多线程切换能力。但它仍然需要保留同样的核心边界：输入协议、thread runtime、snapshot replay、live event handling、增量聊天状态和 chat surface 分开。

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
  -> incremental chat state
  -> chat surface view model
  -> React UI
```

这条链路里的职责边界：

- `guiHostClient` 第一版负责 URL 参数、token、WebSocket、JSON-RPC handshake、projection attach/event/closed 输入，但 ingress 形状要能扩展到后续普通 notification streaming 输入。
- thread identity shell 只负责确认 launch thread id 和 attached thread id 是同一个线程。
- thread runtime store 负责保存可 replay/live 处理的 thread runtime 状态。
- snapshot replay 负责把 attach snapshot 转成初始 UI 状态。
- live event handling 负责把后续事件应用到当前 runtime，并把可展示 notification 交给增量聊天状态层。
- incremental chat state 负责把 attach snapshot 初始化结果和 live notification 按条 apply 成物化聊天状态。
- chat surface view model 只从物化聊天状态派生展示模型，不直接遍历 `snapshotTurns + eventBuffer` 作为长期渲染路径，也不直接拥有协议事实。
- React UI 只渲染 view model 和提交用户操作。

## Notification 追加与性能边界

GUI 的聊天状态必须按 notification 追加演进，不能在每次 notification 到达后从 `snapshotTurns + eventBuffer` 全量重建聊天 view model。

性能边界：

- attach snapshot 或手动 reconnect 后的新 snapshot 可以全量 replay 一次，用于建立新的 baseline。
- accepted live notification 必须按条应用到当前物化聊天状态。一次 notification 更新只能处理该 notification 影响的 turn、item、message、status 或 tool activity。
- `eventBuffer` 是 replay/reconnect 所需的有界 tail，不是 active chat surface 每次 render 或 selector 执行时从头遍历的事实源。
- selectors 可以读取已经物化的 chat state 生成轻量 view model，但不能在 steady-state live path 中反复 fold 全部 snapshot turns 和全部 event buffer。
- 如果需要从 event log 重建状态，只能发生在 attach、manual reconnect 后重新 attach、thread switch/resume 等明确 replay 场景。

这条约束覆盖 `05/06/08` 后续设计。`05` 可以保留 replay/live material 边界，但必须避免把 live path 实现成 `eventBuffer.map(...)` 后再让 `06` 每次从头 fold timeline。`06a` 的 chat text model 应是 materialized state 或等价的 incremental reducer 结果，而不是纯粹从完整 timeline 重新计算的 selector。

## 分层拆分

这个任务必须拆成极小任务，按金字塔推进：

```text
YOLO single-session chat GUI
├─ 00 overall design
├─ 01 thread identity shell
├─ 02 projection ingress adapter
├─ 03 thread runtime store
├─ 04 snapshot replay
├─ 04a projectionSlice cleanup
├─ 05 live event handling
├─ 05b incremental chat state boundary
├─ 06 basic chat surface (design grouping only)
│  ├─ 06a chat text model
│  ├─ 06b plain text chat shell
│  ├─ 06c app integration and browser coverage
│  └─ 06d basic markdown rendering
├─ 07 composer turn control
├─ 08 tool activity
└─ 09 verification and smoke
```

当前主线跳过原 `05a streaming readiness` 代码阶段，但不能从 `05 live event handling` 直接进入 UI 接入。必须先补齐 `05b incremental chat state boundary`，明确 notification 如何按条 apply 到物化聊天状态，避免 `06a/06b/06c` 固化 full recompute selector。`06 basic chat surface` 只是 `06a/06b/06c/06d` 的总设计目录，不是独立实现任务。每一层只允许依赖它下面已经完成的层。上层不能反向决定下层模型。

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

这是 `thread/projection/closed` 的新增处理工作；当前 `guiHostClient` 只有 WebSocket closed 生命周期状态，没有接好 projection closed notification。`closed(backpressure)` 应转换成需要手动重连的状态，而不是会话关闭状态或自动重连命令。

这一层保留 projection event 的 `commitId` / `parentCommitId` 连续性校验。出现 `commitChainMismatch` 或 `missingTurn` 时，adapter 应产出需要手动重连的结果；用户确认重连后，再用新 snapshot 修复本地 runtime。GUI URL 中 `threadId` 来自 query string，启动 token 来自 fragment `#token=...`，不要从 query string 读取 token。

### 03 Thread Runtime Store

建立浏览器环境下的 per-thread runtime store。单会话第一版可以只有一个 runtime，但模型必须能表达 TUI 同类职责：session、turns、buffer、active turn、subscription interrupted/error 状态。

runtime store 接收已通过 ingress 校验的 projection 输入，并保留需要手动重连的判定结果对 runtime 的影响：正常 event 进入 runtime buffer，`commitChainMismatch`、`missingTurn`、`closed(backpressure)` 进入手动重连路径。建立 runtime 后，现有 Redux `projectionSlice` 的去向是删除，而不是降级或保留；它的调试 UI 职责删除，必要的 commit-chain 校验和重连判定迁移到 projection ingress / runtime 边界。

`03` 必须对齐 TUI `ThreadEventStore`，不能沿用旧 `projectionSlice` 的 upsert 模型。attach snapshot 的 turns 只作为 runtime baseline；accepted live event 先进入 runtime buffer，并只维护 active turn：

- `turnStarted`：写入 buffer，并把该 turn 设为 active turn。
- `turnCompleted`：写入 buffer；只有当 completed turn 匹配当前 active turn 时，才清空 active turn。
- `itemStarted` / `itemCompleted`：只写入 buffer，不在 `03` 直接 upsert 到 turns/items。

`03` 不解释 item，不派生 chat view model，不触发 replay/live UI 副作用。item interpretation 必须留给 `04 Snapshot Replay`、`05 Live Event Handling` 和 `05b Incremental Chat State Boundary` 之后的边界。

`03` 的 buffer 必须有明确生命周期策略。它可以先作为 bounded replay tail 保存 accepted events，但不能成为 active chat surface 每次更新时全量遍历的输入源。若第一版暂不实现本地 cap，必须在后续设计中明确由 projection backpressure 兜底的风险和补 cap 的阶段。

### 04 Snapshot Replay

将 attach snapshot 作为 runtime 初始化材料，并明确 replay 路径和 live 路径不同。replay 不应触发 live-only UI 副作用。

### 04a ProjectionSlice Cleanup

清理旧的临时 `projectionSlice` truth model。`04` 只允许从 `threadRuntimeSlice` 的 snapshot baseline 派生 replay material，不依赖也不删除旧 `projectionSlice`；`04a` 专门负责切断 `App` 对 `projectionSlice` 的临时 dispatch、移除 store 注册和旧 projection slice 测试，并确认后续 `05/06` 不能再从旧 projection state 取数据。

这一层不新增 snapshot replay 行为，不解释 live event，不派生 chat view model，也不做 UI。它只负责把 `03` 之后残留的兼容路径清理出后续主线。

### 05 Live Event Handling

处理 attach 之后的增量事件，更新 runtime，并维持 active turn / live update / subscription interrupted 状态。

`05` 的 live path 必须按 notification 追加。它可以把 accepted event 转成 typed live input，但不能要求 `06` 在每次 notification 后重新遍历完整 `snapshotReplay + eventBuffer`。如果 `05` 提供 timeline material selector，该 selector 只能用于 replay/debug/focused tests，不能成为 active chat surface 的 steady-state 数据路径。

`closed(backpressure)` 的处理路径必须是进入需要用户手动重连的状态。UI 应显示连接中断或状态已过期，并提供明确的 `Reconnect` 动作；用户触发后才重新 attach，并用新的 attach snapshot 重建 runtime。它不能被呈现为“会话已关闭”的死胡同，也不能默认进入自动重连循环。

### 05b Incremental Chat State Boundary

`05b` 负责定义 GUI 侧等价于 TUI `ChatWidget` 物化状态的浏览器实现边界。它不渲染 React，不实现 composer，不处理 Markdown，也不实现 tool activity UI；它只规定 replay baseline 和 live notification 如何按条更新聊天状态。

状态演进规则：

- accepted attach snapshot：清空旧 chat state，并从 snapshot turns 全量构建一次 baseline。
- accepted live `turnStarted`：按条建立或标记对应 turn 的运行状态。
- accepted live `itemStarted`：按条记录后续 tool activity 或 running item 所需的最小状态；普通 user/assistant 文本第一版可以不展示 started。
- accepted live `itemCompleted`：按条把当前 item 应用到对应 turn，普通 `userMessage` / `agentMessage` 追加成消息，tool item 留给 `08`。
- accepted live `turnCompleted`：按条更新对应 turn 的完成状态。
- manual reconnect required：保留当前已物化内容，并追加或更新全局 interrupted status；新的 accepted attach 才重建 baseline。

`05b` 必须有 applied cursor 或等价幂等机制，保证同一个 accepted notification 不会被重复应用。语义必须是 incremental reducer，而不是 full timeline selector。

已确认的第一版实现形态是 Redux Toolkit `incrementalChatStateSlice`。该 slice 使用 `extraReducers` 响应 `threadRuntimeAttached`、`threadRuntimeEventBuffered` 和 `threadRuntimeManualReconnectRequired` 等事件 action，让多个 reducers 响应同一个真实事件，避免为同一个 notification 连续 dispatch 多个 setter action。它保存 serializable normalized state，例如 `turnsById`、`turnOrder`、`messagesById`、`messagesByTurnId`、`globalStatus` 和 `appliedEventIds`。纯同步状态转移不引入 listener middleware；listener middleware 只留给后续需要等待、取消、异步 workflow 或后台任务的场景。

### 05a Streaming Readiness（暂缓）

当前 projection 不支持逐字流式：projection event 只包含 turn/item 的 started/completed，逐字增量的 `item/agentMessage/delta` 不会进入 projection。真实 streaming 设计需要在 Rust / app-server contract 明确后单独补充。

由于 Rust / app-server 的真实 streaming contract 尚未明确，`05a` 不作为当前主线的前端代码阶段推进。仅在 TS 侧提前设计可 append buffer 会把 delta 顺序、重连恢复、最终文本权威性、订阅来源和去重语义都变成猜测，后续接入真实 `item/agentMessage/delta` 时仍可能回头修改 chat model。

当前主线从 `05 Live Event Handling` 先进入 `05b Incremental Chat State Boundary`，再进入 `06a Chat Text Model`。`06a/06b/06c` 只消费已经物化的普通聊天状态中的完整 `agentMessage` item 文本，按非流式、纯文本方式展示 assistant 回复。

真实逐字 streaming 应在 Rust / app-server 方案明确后作为独立端到端阶段推进。该阶段需要同时定义后端通知语义和 TS 消费模型，例如：

- delta 走 projection event 还是普通 notification。
- delta 是否参与 `commitId` / `parentCommitId` 连续性校验。
- reconnect 后如何用 snapshot 修复丢失的 delta。
- `itemStarted`、`item/agentMessage/delta`、`itemCompleted` 的顺序、去重和最终文本权威性。
- delta 是否只覆盖 `agentMessage`，还是也覆盖 reasoning / plan 等文本型 item。

### 06 Basic Chat Surface

`06 Basic Chat Surface` 是 `06a/06b/06c/06d` 的总设计分组，不是独立实现任务。不存在单独的 `06` plan 或 `06` implementation。

推进顺序固定为：

```text
06a Chat Text Model
  -> 06b Plain Text Chat Shell
  -> 06c App Integration And Browser Coverage
  -> 06d Basic Markdown Rendering
```

`06a/06b/06c` 从 `05b` 物化的聊天状态派生普通纯文本聊天 view model 和 UI，只覆盖 user message、assistant 完整文本和基础状态行。assistant 文本只读取现有 projection snapshot/event 中完整 `agentMessage.text`，不提前引入可 append buffer 或真实 delta 语义，也不渲染 Markdown。

`06a` 不得把 `snapshotReplay materials + liveEvent materials` 作为 steady-state 输入反复全量 fold。若需要保留纯函数 builder，它只能用于 attach/reconnect replay 或测试；active notification path 必须通过 `05b` 的 incremental state 更新。

`06d` 在纯文本链路稳定后单独设计基础 Markdown 渲染。

### 07 Composer Turn Control

接入纯文本 composer、`turn/start`、`turn/interrupt`，并处理发送失败、中断中、运行中状态。`turn/start.input` 是 `Vec<UserInput>`，纯文本输入要包装成单个 `Text` variant，而不是直接发送 string。

### 08 Tool Activity

从 runtime 派生 tool activity 展示。第一版只做简化详情和展开，不实现 approval/review 控制流。

### 09 Verification And Smoke

补 Playwright CLI smoke，覆盖 `/gui` 打开、attach 身份一致、snapshot 初始化、live event 更新、发送 turn、中断 turn、错误状态。浏览器行为验收默认通过 Playwright CLI 执行，不再使用泛化的 browser/e2e 表述。

## UI 形态

最终聊天界面仍然是三段式：

- 顶部：当前会话标题、连接状态、turn 状态。
- 中部：聊天消息列表，默认滚动到最新消息。
- 底部：纯文本 composer、发送按钮、Stop 按钮。

布局必须使用全局页面滚动，而不是内部消息列表滚动。顶部和底部是常驻区域，不随着消息内容滚动而滚动消失；中部消息列表仍然是主体内容，但它不应该成为独立 `overflow-y-auto` 滚动容器。历史消息变长时，滚动应体现在整个页面 / window 上。底部 composer 固定可见时，主体内容需要预留底部空间，避免最后一条消息被 composer 覆盖。

视觉风格必须保持单一白色界面。User message、assistant message、tool activity、status row、composer、代码块和后续新增模块都必须沿用浅色背景与深色文字，不能嵌入暗黑风格区块。禁止为了区分用户消息、代码片段或 primary action 引入 `bg-black`、`bg-slate-900`、`bg-slate-950`、`bg-zinc-900`、`text-white`、`text-slate-50` 等暗色/反白组合，避免白色界面中混入暗黑界面。

消息列表按普通聊天产品展示：

- User message：用户消息。
- Assistant message：assistant 文本；`06a/06b/06c` 先按纯文本展示，`06d` 再支持基础 Markdown。
- Tool activity：嵌入 assistant 区域的活动块，默认显示简化详情。
- Error/status：轻量提示行，不进入复杂 transcript 样式。

这些 UI 形态不反向约束底层 runtime。只有在 thread identity、projection ingress、runtime、replay/live 层稳定后，才进入具体渲染。

## 验收标准

总体验收：

- 从 TUI 运行 `/gui` 打开的 GUI 能显示当前会话已有历史。
- 用户可以在 GUI 输入普通文本并发送到当前会话。
- Assistant 回复能在 GUI 中更新；`06a/06b/06c` 先以纯文本呈现，`06d` 后以基础 Markdown 呈现。
- 当前 turn 运行时，用户可以点击 Stop 发起中断。
- 至少一种 tool activity 能以简化详情展示，并可展开查看更多内容。
- 历史消息很长时，顶部会话状态区和底部 composer / Stop 控制仍然固定可见；滚动发生在全局页面 / window，而不是发生在内部消息列表容器。
- 整个聊天界面保持白色风格；用户消息、代码块、composer 和后续模块没有暗黑风格嵌块。
- GUI 不要求 review/approval 能力，也不要求多会话能力。

分阶段验收：

- 每个阶段只能验收该阶段自己的边界。
- `01` 只验收 thread identity，不验收 chat。
- `02` 只验收 projection 输入适配，不验收 runtime。
- `03` 只验收 runtime store，不验收 UI。
- `04` 只验收 snapshot replay。
- `04a` 只验收旧 `projectionSlice` 兼容路径清理。
- `05` 只验收 live event handling。
- `06a` 之后才开始验收聊天 text model。
- `06b` 之后才开始验收纯文本聊天 shell。
- `06c` 之后才验收 App 集成后的纯文本聊天界面。
- `06d` 之后才验收基础 Markdown 渲染。

## 设计原则

- TUI 是主要参考，不是背景材料。
- Projection 是 app-server 的投影输出，不是 GUI 状态真理。
- 当前 GUI store 是临时调试代码，不作为后续设计依据；其中 commit-chain 连续性校验和重连判定属于协议逻辑，必须迁移保留。
- `03` 的 runtime store 只做 TUI-aligned buffer 和 active turn tracking；不能把 `projectionSlice` 的 turn/item upsert 行为迁移成新的 truth model。
- `projectionSlice` 从 `03` 开始必须被切断为临时兼容路径；`04a ProjectionSlice Cleanup` 专门删除这条旧路径，不能让它进入 `05 Live Event Handling` 或 `06 Basic Chat Surface`。
- 第一版 projection 三件套是输入面起点，不是封闭边界；后续 streaming notification 输入必须在 Rust / app-server contract 明确后再并入同一个 runtime。
- 先做线程，再做事件，再做 replay/live，再做 chat。
- 每个子设计必须足够小，可以独立实现、独立回退、独立验收。
