# Codex GUI 会话压缩控制与状态反馈设计

设计状态：已确认

设计日期：2026-09-03

修订日期：2026-09-03

## 唯一主目标

为 `codex-gui` 增加与 TUI `/compact` 功能边界一致的会话压缩控制：用户可以从现有
上下文用量 Popover 手动发起当前会话压缩；GUI 在当前连接内展示手动请求等待状态以及
手动或自动压缩的运行状态；成功后继续使用现有上下文分页，失败后继续使用现有 turn 错误
展示，并且不引入 TUI 尚不具备的服务端原子空闲保证、跨连接压缩状态恢复、自动重试或
压缩调度能力。

## 文档关系与覆盖边界

本文扩展以下既有设计：

- `docs/superpowers/specs/2026/08/15/2026-08-15-codex-gui-context-compaction-pagination-design.md`
- `docs/superpowers/specs/2026/08/18/2026-08-18-codex-gui-context-usage-design.md`

2026-08-15 设计仍是 successful canonical `itemCompleted(contextCompaction)`、上下文页、
分页选择和 `Context compressed` 边界的唯一 owner。本文不重做分页模型，只把
`itemStarted(contextCompaction)` 作为当前连接内的瞬时运行事实交给 active thread session。

2026-08-18 设计仍是 token usage 数据、百分比和数值格式的唯一 owner。本文只替代其中
“`tokenUsage == null` 时完全隐藏入口”的展示规则：压缩入口已被确认必须在可操作的空闲会话
中始终存在，因而 Popover 在用量未知时仍须渲染，并明确显示用量不可用；未知不等于零。

本文不是 implementation plan，不包含逐任务修改顺序、执行图、命令、提交拓扑或实现授权。

## 已确认的产品决策

1. 首版提供完整的手动压缩交互闭环，并让当前连接内观察到的自动压缩使用相同运行反馈。
2. 当前会话存在活动任务时禁用压缩入口；不提供“中断后压缩”，也不提供“任务结束后预约
   压缩”。
3. 手动入口位于现有 `ContextUsagePopover`，不增加 Composer 常驻压缩按钮或会话更多菜单
   入口。
4. 压缩等待或运行时，上下文用量触发器持续显示运行态；Popover 内压缩按钮同步显示
   `isPending` 并禁用。
5. 已启动压缩的执行失败继续由 transcript 中既有 `Request failed` 和 `TurnError` 呈现；
   状态收束后按钮恢复为普通压缩动作，由用户决定是否再次点击。
6. 空闲时不按 token 使用率或 context window 是否已知设置门槛。
7. 不支持 TUI 尚不支持的功能：不新增 core/app-server/projection 契约来保证跨客户端原子
   空闲，不新增压缩专用重连快照，不自动重试，不持久化或调度待压缩意图。

第 7 项是设计调查后增加的收窄约束。它修正了“GUI 本地禁用就能保证永不打断其他客户端
任务”以及“重连后仍能准确识别压缩中”的过强表述；本文在后文明确记录这两个限制，不把
当前协议做不到的结果写成保证。

## 当前事实与缺口

### app-server 已有手动压缩请求

app-server v2 已定义稳定请求：

```text
thread/compact/start({ threadId }) -> {}
```

请求只确认启动操作已经提交，不返回压缩结果或 turn ID。实际生命周期继续通过标准
projection 事件传递：

```text
turnStarted
  -> itemStarted(contextCompaction)
  -> itemCompleted(contextCompaction)
  -> turnCompleted
```

自动压缩发生在普通活动 turn 内部，但同样发出 canonical
`itemStarted(contextCompaction)` 与 `itemCompleted(contextCompaction)`。因此 GUI 不能只在
自己发出手动请求后识别压缩，也不能把 active turn 本身等同于压缩 turn。

权威定义与行为证据：

- `codex-rs/app-server-protocol/src/protocol/common.rs:773-776`
- `codex-rs/app-server-protocol/src/protocol/v2/thread.rs:1164-1174`
- `codex-rs/app-server/README.md:1002-1015`
- `codex-rs/core/src/compact.rs:246-254`
- `codex-rs/core/src/compact.rs:393-394`
- `codex-rs/core/src/session/turn.rs:1219-1298`

### GUI 已有成功结果，但没有主动命令

GUI 已经把 successful completed `contextCompaction` 作为 transcript context boundary，创建
新上下文页并显示 `Context compressed`。started item 被明确忽略，不创建页；失败 turn 的
`TurnError` 已由 `TurnErrorAlert` 显示为 `Request failed`。

现有 GUI request allowlist、`GuiHostCommands` 与 command gateway 尚未暴露
`thread/compact/start`，因此当前没有从 UI 到 app-server 的生产调用链：

- `codex-gui/src/features/guiHost/appServerProtocol.ts:17-35`
- `codex-gui/src/features/guiHost/guiHostCommandGateway.ts:49-90`
- `codex-gui/src/features/transcriptState/transcriptItemPolicy.ts:280-301`
- `codex-gui/src/features/transcriptState/transcriptItemPolicy.ts:395-396`
- `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurfaceRenderer.tsx:99-105`
- `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptTurnFragment.tsx:141-152`

deprecated `thread/compacted` 已经被生成层识别为 known notification，但 GUI 故意不消费。本文
继续使用 canonical projection item，不恢复兼容通知旁路。

### 当前 Popover 在用量未知时消失

`contextUsageModelFromTokenUsage(null)` 返回 `null`，`ComposerTurnControl` 随后完全不渲染
`ContextUsagePopover`：

- `codex-gui/src/features/composerTurnControl/contextUsageModel.ts:36-41`
- `codex-gui/src/features/composerTurnControl/ComposerTurnControl.tsx:57-58`
- `codex-gui/src/features/composerTurnControl/ComposerTurnControl.tsx:195-199`

这与已确认的“空闲时始终可用、无 token 门槛”直接冲突。实现不能把未知用量伪造成 `0%`，
而应让 Popover 接受 nullable usage，在用量未知时仍提供压缩动作。

### 前端空闲判断不是跨客户端安全保证

`LiveActiveThreadSession` 从 attach 的 `inProgress` turn 和 accepted `turnStarted` /
`turnCompleted` 维护 `activeTurnId`。它足以控制当前 GUI 的入口，但 core 的 `spawn_task` 会在
启动新任务前执行 `abort_all_tasks(Replaced)`：

- `codex-gui/src/features/activeThreadSession/liveActiveThreadSession.ts:73-100`
- `codex-gui/src/features/activeThreadSession/liveActiveThreadSession.ts:410-427`
- `codex-rs/core/src/tasks/mod.rs:271-280`

因此另一个客户端可以在 GUI 判断空闲后先启动任务，形成 TOCTOU 竞态。TUI 也只做本地
活动任务禁用，没有服务端原子 idle-only compact。按已确认的 TUI 功能边界，本文不修复该
后端竞态，只把 GUI 行为准确表述为“当前 GUI 观察到活动任务时不允许点击”。

### 当前快照不能恢复压缩运行种类

`Turn` 没有 turn kind，`ContextCompaction` item 只有 `id`；attach snapshot 不物化仍未完成的
started compaction。重连或切换回来后，GUI 最多知道存在某个活动 turn，无法区分：

- 自动压缩仍在运行；
- 自动压缩已经完成，但原 turn 仍在继续；
- 普通非压缩任务正在运行。

相关证据：

- `codex-rs/app-server-protocol/schema/typescript/v2/Turn.ts:9-33`
- `codex-rs/app-server-protocol/src/protocol/v2/item.rs:412-416`
- `codex-rs/app-server/src/request_processors/thread_projection.rs:225-290`
- `codex-rs/app-server-protocol/src/protocol/thread_history.rs:586-645`

按 TUI 对齐约束，本文不增加服务端 discriminator。重连后的 UI 只显示通用活动任务状态并
禁用压缩，不声称仍能显示压缩专用运行态。

## 权威契约与生成边界

`thread/compact/start` 的权威定义继续来自 app-server protocol 生成输入。GUI 只把现有方法
纳入 `APP_SERVER_REQUEST_METHODS`，再由现有 validator generator 机械生成 request descriptor
与 response validator：

```text
app-server client request definitions
  -> APP_SERVER_REQUEST_METHODS allowlist
  -> generated requestDescriptors / validators
  -> GuiHostCommandGateway
```

不得手写 `ThreadCompactStartParams`、空 response 类型、request descriptor、validator 或第二份
method union。协议类型改变时，生成、类型检查或构建必须继续暴露不兼容变化。

生成输入与入口：

- `codex-rs/app-server-protocol/schema/json/client-request-definitions.json:82-86`
- `codex-gui/src/features/guiHost/appServerProtocol.ts:17-28`
- `codex-gui/scripts/protocolValidators/cli.ts:313-378`
- `codex-gui/package.json:33-34`

本设计不修改 app-server API、Rust 类型、schema 输入或 deprecated notification 选择。

## Module、Seam 与 Interface

### `GuiHostCommandGateway`

`GuiHostCommands` 增加一个基于 generated request/response 类型的语义方法，例如：

```ts
compactThread(
  params: RequestParams<"thread/compact/start">,
): Promise<RequestResponse<"thread/compact/start">>
```

方法只通过 `requestDescriptors["thread/compact/start"]` 调用现有 transport。它继续保留
`GuiHostCommandError.source`、`delivery` 和 `rpcError`，不得把 `deliveryUnknown` 降级成“压缩
失败”，也不得在 gateway 内自动重试。

### Active thread compaction Module

新增一个 active-thread-private 的 compaction operation Module，由 `LiveActiveThreadSession`
唯一拥有。它封装手动请求和 accepted projection lifecycle，不把状态散落到
`ContextUsagePopover`、transcript、Redux `threadRuntimeSlice` 或 command gateway。

建议的内部状态是：

```ts
type ThreadCompactionOperationState =
  | Readonly<{ phase: "idle"; startFailure: string | null }>
  | Readonly<{ phase: "requestPending"; claimId: string; candidateTurnId: string | null }>
  | Readonly<{ phase: "deliveryUnknown"; claimId: string; candidateTurnId: string | null }>
  | Readonly<{ phase: "running"; turnId: string; itemId: string }>;
```

`startFailure` 只保存当前 session 中“请求未启动”的通用错误文本，不复制已启动 turn 的
`TurnError`。它在下一次请求、观察到 canonical compaction lifecycle、session replacement 或
dispose 时清除，不进入 transcript、Redux、rollout 或重连快照。

该 Module 的窄接口应只表达：

- 根据当前 session revision、`activeTurnId` 与 queue release readiness 判断是否可请求；
- 直接从 child queue coordinator 原子取得 release reservation 并领取一次本地 request claim，
  阻止当前 GUI 在
  `turnStarted` 前重复点击或发送普通 turn；
- 接收 command resolve、`GuiHostCommandError` reject 与 accepted projection facts；
- 产生只读 presentation view；
- 在 owner dispose 时使旧 promise、旧事件和旧回调失效。

它不拥有 token usage、上下文分页、turn error、连接重启、Composer 草稿或 pending input 内容。

### Active thread session role

`LiveActiveThreadSession` 已同时拥有 thread identity、subscription、revision、queue coordinator、
command gateway 和 accepted projection 入口。它应增加独立的 compaction role，而不是把压缩
伪装成 Composer 文本提交：

```ts
type ActiveThreadCompactionRole = Readonly<{
  requestCompaction(expectedRevision: number): ActiveThreadSessionOperationResult<...>;
}>;
```

published session snapshot 同时提供只读 compaction view。`ComposerTurnControl` 只消费该 view
并调用 role；`ContextUsagePopover` 只接收 presentation props 和 `onCompress`，不得直接读取
`AppCapabilities.commands` 或调用 RPC。

压缩可用性至少要求：

- session `phase === "active"`；
- `activeTurnId == null`；
- compaction operation 为 `idle`；
- 可以从 queue coordinator 原子取得 release reservation，即不存在本地 pending start、待发
  消息、recovery、interrupt、management 或既有 release reservation。

不能只先读取 `getReleaseReadiness()` 再异步发请求；检查后仍可能发生本地 Send。compaction
operation 必须直接持有 child `ComposerInputQueueCoordinator.reserveRelease()` 返回的
reservation，不能调用用于 thread switch 的 public `LiveActiveThreadSession.reserveRelease()`
handoff；后者会冻结 session snapshot 并长期占用 transaction。child reservation 持有到
accepted `turnStarted` 已经在
同一次 session transition 中发布 `activeTurnId`，再释放 reservation。明确未接受、连接失效、
session replacement 或 dispose 同样释放。这样 release reservation 与 `activeTurnId` 之间没有
本地可发送空窗，同时不阻止 accepted projection event observation。

这只避免本 GUI 自己的消息与压缩竞争，属于现有 queue owner 的互斥；不承诺阻止其他客户端
竞争。压缩不读取 skill validity，也不按 token usage 决定可用性。

### Transcript 与 Redux 边界

transcript 继续只拥有 durable result：

- started `contextCompaction` 不创建 entry 或页面；
- successful completed `contextCompaction` 继续创建页面边界；
- failed turn 在携带 `TurnError` 时继续由现有 `TurnErrorAlert` 呈现；interrupted turn 只沿用
  现有 turn status；
- 重复 completed、snapshot duplicate 与 reconnect replay 继续使用现有 identity 去重。

`threadRuntimeSlice` 继续只保存 thread metadata 和 token usage。瞬时 compaction operation 不进入
Redux，避免建立与 active session lifecycle 平行的第二状态 owner。

## 状态转换与竞态

### 手动请求

1. `requestCompaction(expectedRevision)` 先验证 revision、active phase、空闲事实与本地
   compaction state，再从 queue coordinator 原子取得 release reservation；reservation 获取失败
   时不发请求。
2. 验证通过后在同一 owner transition 中保存 reservation、同步进入 `requestPending` 并发布
   snapshot，再调用 `compactThread({ threadId })`。这样连续点击和当前 GUI 的 Send 都不能在
   `turnStarted` 前发出第二个 turn。
3. `{}` response 只表示 request accepted；resolve 不把状态标记为成功，也不恢复按钮。
4. request claim 生效后观察到的首个 accepted `turnStarted` 先作为 best-effort
   `candidateTurnId` 记录并发布 `activeTurnId`，随后释放手动 request 持有的 child queue
   reservation；canonical `itemStarted(contextCompaction)` 到达时，无论来源是手动还是自动，
   都进入 `running { turnId, itemId }`。
5. 匹配 `itemCompleted(contextCompaction)` 表示成功，operation 回到 `idle`；同一 completed
   同时由既有 transcript owner 建立新 context page。
6. 若同一 running turn 在没有匹配 completed 时以 failed/interrupted 结束，operation 回到
   `idle`；failed 且携带 `TurnError` 时由 transcript owner 展示 `Request failed`，interrupted
   只保留既有 `Interrupted` 状态，不伪造失败提示。
7. 若匹配 `candidateTurnId` 的 turn 在任何 `itemStarted(contextCompaction)` 前终止，claim
   best-effort 回到 `idle`。pre-compact hook 可以在 turn 已启动但 compaction item 尚未发出时返回
   `TurnAborted`；不处理该 terminal 会使当前连接永久停在 pending。

由于 response 不含 turn ID，`candidateTurnId` 只是 claim 建立后对首个 accepted turn 的本地
best-effort 关联，不能形成无歧义 request identity；其他客户端竞态仍可能使关联不准确。当前
连接中，`requestPending` 在观察到 canonical compaction item、匹配 candidate terminal、明确
请求失败、连接失效或 session dispose 前保持；不得在空 response 到达时提前恢复，避免重复压缩。

### Event-before-response

projection event 可能先于 command promise settlement 被 UI 消费。状态机必须允许：

```text
requestPending
  -> itemStarted(contextCompaction)
  -> running
  -> late command resolve (no-op)
```

晚到 resolve 不得把 `running` 倒退为 `requestPending` 或 `idle`。晚到 reject 只在它仍拥有当前
claim 时生效；旧 session、旧 revision 或已失效 claim 的 settlement 必须无操作。

### 自动压缩

自动压缩不经过 GUI command：

```text
idle + accepted itemStarted(contextCompaction)
  -> running
  -> matching itemCompleted or terminal turn
  -> idle
```

状态按 `{turnId, itemId}` 匹配，不能通过 token usage 下降、`activeTurnId`、turn 内是否存在用户
消息或 transcript 页数推断。自动压缩运行时，活动 turn 本身已经使手动入口禁用。

### 请求明确失败

若 command 在创建 turn 前明确失败且 `delivery === "definitelyNotAccepted"`，不会产生 transcript
turn。operation 回到 `idle`，并在 Popover 中显示原始通用失败文本；按钮仍使用普通“压缩
上下文”动作，不变成专用 Retry 控件。

该提示只是请求未启动的通用反馈，不建立持久失败记录、不自动重试、不分类为执行失败。
已启动后的失败继续只走 transcript `Request failed`，两种错误不能重复显示。

### Delivery unknown 与连接失效

`deliveryUnknown` 表示请求可能已被服务端接受。GUI 不得宣称成功或失败，也不得恢复按钮后
允许立即重发。当前 owner 进入 `deliveryUnknown`，随后复用现有连接丢失与
`projectionUnavailable` 流程；不增加压缩专用重连或自动重试。

session 被 replacement 或 dispose 后，旧状态和 promise 均失效。重连后的新 session 只根据
新 attach 与随后收到的 canonical events 工作：

- snapshot 已包含 completed compaction 时，现有分页显示成功边界；
- snapshot 只有 in-progress turn 时，只显示通用活动任务并禁用压缩；
- 若 reconnect replay 再次提供 canonical lifecycle，按现有 accepted event 和 identity 去重
  处理；
- 没有 canonical 事实时，不从旧本地 state 猜测压缩是否仍在进行。

这与 TUI 当前“不自动重发、重连后恢复通用输入状态”的能力边界一致。

## HeroUI、交互与可访问性

本地 HeroUI `@heroui/react` 与 `@heroui/styles` 均为 3.2.4，匹配 sibling source checkout。
Popover 沿用现有 compound API，新增动作使用 HeroUI `Button`，Popover 内的请求或运行状态
使用 Button 的 `isPending`；外层持续状态使用 HeroUI `Spinner` 与可见文本，不增加自定义按钮
或 `framer-motion`。

建议结构：

```text
Popover
  |- Button size="sm" variant="ghost" (context usage trigger)
  |    |- idle: ProgressCircle
  |    `- request/running: Spinner + Compressing
  `- Popover.Content placement="top"
       `- Popover.Dialog
            |- Popover.Heading: Context usage
            |- usage details or usage unavailable
            |- Button size="sm" variant="secondary": Compress context
            `- generic request-start failure, when present
```

交互规则：

- idle 且可请求时，压缩 Button 可点击，不检查 token 百分比；
- 当前 GUI 观察到活动 turn、本地 queue 不安全、request pending、running、delivery unknown 或
  projection unavailable 时禁用；
- `requestPending` 或 `running` 时，Popover 内 Button 使用 `isPending`，文本表达
  `Compressing context`；
- 同期将外层 context usage trigger 从 icon-only `ProgressCircle` 切换为可见的 HeroUI
  `Spinner` 与 `Compressing` 文本，并把 accessible label 改为
  `Context compression in progress`；外层 Button 仍可打开 Popover，不使用会阻止 press 的
  pending 状态；
- 自动与手动压缩使用相同运行态文案，不在 transcript 中插入临时行；
- 执行成功不增加 toast，现有 `Context compressed` boundary 是持久结果；
- 已启动执行失败不增加 Popover 错误副本，现有 `Request failed` 是持久结果；
- 明确请求未启动错误只在 Popover 中作为当前 session 的通用反馈显示，不提供自动重试或
  专用恢复流程。

当 `usage == null` 时：

- 仍渲染 context usage trigger 与 Popover；
- 不显示 `0%` 或伪造 token 数；
- trigger 和正文明确表达 context usage unavailable；
- 压缩按钮的可用性只由 session/queue/compaction facts 决定。

外层 trigger、压缩 Button、错误反馈和 pending 状态必须具有 Lingui 本地化的可见文本或
accessible name。HeroUI 原生 disabled、pending、focus-visible、键盘、触摸与 Popover dismiss
语义继续有效；不通过硬编码颜色表达唯一状态。

## TUI 对齐边界

本文参考 TUI 的协议、行为、恢复和调度能力边界，而不复制终端外观。用户已明确选择允许
GUI 使用适合图形界面的专用运行反馈与通用请求未启动错误；这些呈现不能带来 TUI 不具备的
自动化、恢复、持久化或服务端保证：

- TUI 可把任务期间输入的 `/compact` 作为 queued slash command，在活动 turn 结束后执行；GUI
  首版只提供空闲时可用的直接按钮，因此根据当前 active session 禁用该入口且不建立 queue。
- TUI 发起后先进入通用 task-running/pending-start；GUI 同样在 RPC 之前进入本地
  `requestPending`，并用 `Spinner + Compressing` 呈现这一既有操作状态。TUI 不显示压缩专用
  started 状态不限制 GUI 的原生视觉表达。
- TUI 使用同一个 `thread/compact/start`；GUI 不增加另一条压缩协议。
- TUI 支持把 `/compact` 作为 queued slash command 留到活动 turn 完成后执行；GUI 首版不实现
  这一已有能力，属于功能子集。GUI 的直接入口在观察到活动任务时仍禁用，也不建立待压缩
  意图、预约或调度状态。
- TUI 没有跨客户端原子 idle-only 保证或压缩专用重连快照；GUI 不新增。
- TUI transport unknown 使用通用断线恢复并且不重发；GUI 同样复用连接状态。
- TUI 完成后显示 `Context compacted`；GUI 继续用既有 `Context compressed` context boundary。

TUI 当前对部分 RPC reject 会向上传播错误，且个别前置失败存在 pending 状态复位缺口。GUI
不复制这些缺陷：明确未启动错误必须释放自己的本地 claim，否则入口会永久卡死；Popover
只显示同一次请求的通用错误，不提供自动重试、Retry 专用动作、跨连接恢复或持久失败记录。
状态收束与图形界面内的错误可见性是正确实现同一功能所需的 GUI 反馈，不构成新的协议、
自动化、恢复或调度能力。

## 不改变的行为

- 不改变自动压缩算法、阈值、prompt、context 内容或 provider 选择。
- 不改变 TUI `/compact` 的命令、文案、状态或错误处理。
- 不改变 `ThreadItem.contextCompaction`、`thread/compact/start` 或其他 app-server wire shape。
- 不消费 deprecated `thread/compacted`，不新增顶层 WebSocket notification。
- 不改变现有 context page 的形成、identity、分页导航、历史页选择或 snapshot replay 去重。
- 不在 transcript 中加入“正在压缩”临时 entry，也不展示压缩摘要或百分比进度。
- 不把 token usage 下降当作完成信号，不用 token 百分比决定按钮可用性。
- 不改变 Composer 草稿、发送、Guide、Stop、pending input、steer、interrupt、recovery 或 delivery
  语义。
- 不新增 Redux slice、跨线程本地缓存、持久化字段或跨设备状态。
- 不新增自动重试、Retry 专用动作、预约、排队、中断确认或低用量确认。
- 不承诺其他客户端竞态下的原子安全，也不承诺重连后恢复压缩专用运行态。

## 验证边界

后续 implementation plan 应把以下行为映射到现有单元、Browser Mode 与真实 runtime 验收，
但不得把本节视为执行授权：

- request allowlist 与 generated descriptor 使用 authoritative `thread/compact/start` 类型；
- 空闲、queue release-safe、usage 已知时可发起一次压缩；
- usage 为 `null` 时入口仍存在，不显示伪造的 `0%`，且压缩仍可用；
- active turn、pending start、queued/recovery/interrupt/management/release 状态下入口禁用；
- 手动请求在发布 `activeTurnId` 前持有 queue release reservation，期间 Send 不会启动普通
  turn；发布 active turn 或确定请求未开始后无空窗释放；
- 连续点击只发送一次 RPC；RPC resolve 不表示成功；
- ack-before-event 与 event-before-ack 两种顺序都保持同一 request claim；
- turnStarted 后、itemStarted 前的匹配 terminal 会 best-effort 清理 candidate claim，不永久 pending；
- 手动与自动 `itemStarted(contextCompaction)` 都显示统一运行态；
- matching completed 清理运行态并由现有 transcript 创建且只创建一个分页边界；
- failed terminal without completed 清理运行态，并在存在 `TurnError` 时只显示既有
  `Request failed`；interrupted terminal 清理运行态并只保留既有 `Interrupted` 状态；
- definitely-not-accepted/RPC reject 清理 claim、显示通用未启动错误且允许用户以后重新点击；
- delivery unknown 不自动重发、不宣称失败，并进入现有连接不可用路径；
- stale revision、旧 promise、旧 subscription、thread switch 与 dispose 后的 callback 不改变新
  session；
- 重连 snapshot 无压缩 discriminator 时只显示通用 active 状态，不伪造压缩中；
- 用户位于最新 context page 时继续跟随成功压缩的新页，浏览旧页时保持旧页；
- HeroUI Button/Popover/ProgressCircle 的 disabled、pending、focus-visible、键盘、触摸、ARIA 与
  Lingui 文案可被 Browser 测试观察；用量未知的 idle `ProgressCircle` 与压缩中的可见
  `Spinner + Compressing` 状态必须可区分；
- Level 1 覆盖 command/state/UI 回归，包括可控模拟的自动事件、请求拒绝、delivery unknown、
  stale callback 与重连边界；Level 2 使用当前真实 Codex runtime 验证手动触发、真实
  canonical lifecycle、运行反馈与成功分页。自动压缩、执行失败和断线只在能够由当前真实
  runtime 安全、确定地产生时追加 Level 2 观察，不为制造场景修改后端或连接状态，也不以未
  发生的真实事件替代 Level 1 证据。本功能不依赖系统窗口、IME 或跨应用焦点，Level 3 不适用。

用户可见 UI 变化需要相应的稳定视觉或结构化 Browser 覆盖；不得用只验证纯状态机或 mocked
RPC 的测试替代真实生产接线。生成 validator 必须通过现有生成与 check 入口，并对 Lingui catalog
执行提取、字段级审查和重复提取稳定性检查。

## 设计风险与明确限制

### 当前协议允许跨客户端竞态

本 GUI 只在自己观察到 idle 且本地 queue 安全时发请求。另一个客户端仍可能在检查与 core
执行之间启动任务，随后被 compact 替换。消除该竞态需要 TUI 也尚未具备的服务端原子
idle-only compact，因此明确不在本文范围内。

### 当前协议不携带手动请求 identity

空 response 没有 turn ID，GUI 只能等待 canonical item lifecycle。若另一个客户端在同一时间
操作，request pending 与具体 turn 不能完全关联。本文不复制或猜测 identity，也不改变 wire
response。

### 当前协议不能恢复压缩中状态

重连快照没有 active compaction discriminator。新 session 不读取旧 owner 的本地状态；它只
恢复通用 active/idle 和已完成的 context boundary。本文不以 GUI 跨线程 map 掩盖协议缺口。

这些限制必须在后续计划、实现复审和最终报告中继续保留。若未来要求跨客户端原子安全、
跨连接压缩运行态或可关联 request identity，应作为新的后端/TUI/GUI 共同能力单独设计，不能
在本文 implementation 中顺手扩大。

## 设计结论

本设计在不扩展 TUI 功能边界的前提下，把 app-server 已有 `thread/compact/start` 接入 GUI，
并把主动命令、当前连接内的 canonical compaction lifecycle 和 UI presentation 分配给三个
清晰 owner：generated command gateway 负责类型安全 transport，active thread compaction
Module 负责本地 claim 与瞬时状态，既有 transcript 负责成功分页和执行失败。

`ContextUsagePopover` 从“只有 usage 时存在”调整为“当前会话的上下文详情与压缩入口”，在
usage 未知时仍诚实显示未知状态。该方案复用 HeroUI `Button`、`Popover`、`ProgressCircle`
以及既有 Lingui、projection、queue release readiness、连接失效和 context pagination 能力，
同时明确拒绝 deprecated notification、token 启发式、重复状态 owner、自动重试以及无法由
当前协议证明的跨客户端和重连保证。
