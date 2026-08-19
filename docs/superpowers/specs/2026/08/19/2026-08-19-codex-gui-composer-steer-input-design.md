# Codex GUI Composer 信息引导设计

状态：已确认

日期：2026-08-19

## 唯一主目标

为 Codex GUI Composer 增加信息引导能力：当前 regular turn 运行时，用户可以把新输入作为 same-turn `turn/steer` 发送，使其在下一次模型请求边界进入当前 turn；普通 next-turn 消息继续独立排队，两类输入拥有不同的 FIFO、优先级、失败恢复和用户反馈。

本设计中的“引导”不表示抢占当前 sampling，也不表示中断正在执行的工具。它只使用 app-server 已有的 `turn/steer` 语义。

## 背景与当前代码证据

### GUI 已有 ordinary FIFO，但 Composer 只会普通排队

`codex-gui/src/features/composerInputQueue/composerInputQueue.ts` 当前只拥有普通 next-turn 消息：

- `ComposerQueueMessage` 保存稳定的本地消息身份和消息内容。
- active turn 或 pending start 存在时，`submit` 只把消息追加到 ordinary FIFO。
- 没有 active turn 时，ordinary 队首取得 `StartClaim`，由协调层执行 `turn/start`。
- `acceptedAwaitingRuntime` 与 `deliveryUnknown` 继续占有 claim；只有权威 runtime/commit 事实才能最终释放。
- interruption 会把未发送消息转入显式 recovery，不会自动继续。

`codex-gui/src/features/composerTurnControl/ComposerTurnControl.tsx` 的 Enter 和发送按钮都调用相同的普通 `submit`。因此当前用户在 active turn 中提交的内容只能等待当前 turn 结束，不能进入当前 turn。

### GUI 已具备 `turn/steer` 传输能力，但未接入 Composer owner

现有生成协议和 GUI Host command gateway 已包含 `turn/steer`：

- `TurnSteerParams` 要求 `threadId`、`input` 和 `expectedTurnId`，并支持 `clientUserMessageId`。
- `GuiHostCommands.steerTurn` 可以发送 `turn/steer`。
- GUI Host allowlist 已允许该方法。

当前缺口位于产品所有权链：`activeThreadOwner` 只把 `startTurn` 交给 Composer queue coordinator，Composer 与 queue module 都没有 steer 入口、steer FIFO、pending steer 对账或 rejected steer 恢复。

### app-server 的 steer 是 same-turn 追加，不是抢占

app-server 在同一 active turn 锁内核验：

- `expectedTurnId` 必须等于当前 active turn。
- 只有 regular turn 可 steer；review 与 compact 明确拒绝。
- 接受后，输入追加到 core pending input。
- pending input 在下一次模型请求构建前 drain；当前 sampling 不会被 steer 请求强行终止。

成功 RPC 响应只证明输入已被 core 接受。只有 projection 中出现匹配 `clientUserMessageId` 的 committed user message，GUI 才能把该输入当作已进入权威历史。

### TUI 提供行为参考，但不决定 GUI 交互

TUI 使用三个独立 `VecDeque` 表达输入生命周期：

- `queued_user_messages`：普通 next-turn FIFO。
- `pending_steers`：已提交但尚未看到 committed user message 的 steer FIFO。
- `rejected_steers_queue`：因 active turn 不可 steer 而明确拒绝、等待优先重提的 FIFO。

TUI 的 rejected steers 在 turn 结束后优先于 ordinary queue，按原顺序整体合并为一个新 turn。这个状态语义可复用。

GUI 不复制 TUI 的 Enter/Tab、Footer 或 Esc 操作，也不复制 TUI 仅依靠队首和浅内容比较的 commit 对账。GUI 使用自己的按钮和快捷键，并以稳定 `clientUserMessageId` 关联权威 projection。

## 已确认产品决策

设计访谈预计并完成了 15 项实质决策：

1. “插队”表示 same-turn steer，在下一模型请求边界生效，不抢占当前 sampling。
2. GUI 不对齐 TUI 交互，只参考其状态模型和失败迁移。
3. 用户可见操作文案使用两个字的 `引导`。
4. `引导`使用独立按钮，与现有普通发送按钮并列。
5. 当前状态不可引导时，输入不丢失，改走普通新 turn 路径。
6. fallback 后明确提示 `当前无法引导，已加入队列`。
7. 尚未权威 commit 的引导内容在 transcript 外预览；不能乐观写入正式记录。
8. 普通 Enter 继续发送/排队；主修饰键加 Enter 提交引导。
9. 输入框为空时，主修饰键加 Enter 只能提升 ordinary 队首，不能提升队尾。
10. 输入框为空时，`引导`按钮禁用；提升 ordinary 队首仅由快捷键触发。
11. 输入框非空时，显式引导可以越过已有 ordinary queue；ordinary queue 自身仍严格 FIFO。
12. 允许连续提交多条引导；引导通道内部保持提交顺序。
13. 明确拒绝的 steers 按 FIFO 全部取出、保持顺序合并，优先于 ordinary queue 启动新 turn。
14. 系统异常中断时自动把未 commit steers 转入 rejected 恢复；用户主动停止时必须等待明确继续。
15. GUI 使用一个统一待处理区域，分段表达引导中、将优先发送和 ordinary 聚合数量。

## 范围

本设计包含：

- Composer 的独立 `引导`按钮和主修饰键加 Enter 快捷键。
- ordinary、待发送 steer、pending steer 与 rejected steer 的独立 FIFO/生命周期容器。
- `turn/steer` command 接线、`expectedTurnId` 和 `clientUserMessageId` 所有权。
- steer 接受、明确拒绝、delivery unknown、commit、normal terminal 与 interruption 的状态迁移。
- GUI transport 对 app-server 结构化 JSON-RPC error data 的保真传递；不新增或修改 app-server wire shape。
- empty-composer 快捷键对 ordinary 队首的原子提升。
- transcript 外的引导内容预览、rejected 优先发送提示和 ordinary 聚合数量。
- fallback、状态未知和显式恢复反馈。
- 对应的 module、coordinator、lifecycle 与 Browser 行为验证。

## 非目标

- 立即中断当前 sampling 或当前工具执行。
- 复制 TUI 的 Enter/Tab、Footer、Esc 或终端布局。
- 修改 app-server `turn/steer` wire shape 或 core pending-input 语义。
- 把 ordinary 与 steer 合并为一个带优先级字段的单队列。
- ordinary 消息列表、任意项选择、拖动、排序、删除或完整队列管理器。
- 从 ordinary 队尾提升消息。
- queued/pending 消息的 optimistic transcript append。
- 用超时猜测 delivery unknown、盲目重发或静默丢弃。
- 页面刷新、跨页面、跨 thread、跨客户端或进程重启后的队列持久化。

## Composer 交互

### 普通发送

- Enter 与现有发送按钮继续调用 ordinary submit。
- active turn 存在时，普通消息追加到 ordinary FIFO。
- idle 时，普通消息沿用现有 `turn/start` 路径。
- 普通发送不因新增引导功能而改变快捷键或默认含义。

### 引导按钮

- active turn 存在时显示独立的 `引导`按钮；没有 active turn 时隐藏，避免与普通发送形成两个等价入口。
- 输入框非空时按钮可操作，点击后把当前输入提交到 steer FIFO。
- 输入框为空时按钮禁用；按钮不能隐式选择 ordinary queue 中的消息。
- 提交被本地 owner 接受后才清空与本次提交相同的草稿；异步期间产生的新编辑不得被旧 settlement 清除。
- GUI 当前不能从 active turn projection 预知 regular/review/compact kind，因此不做基于猜测的 preflight。请求收到结构化 `ActiveTurnNotSteerable` 后，输入进入 rejected/fallback 路径，并显示 `当前无法引导，已加入队列`。

### 快捷键

- macOS 使用 `⌘ Enter`；Windows/Linux 使用平台主修饰键对应的 `Ctrl+Enter`。
- 输入框非空时，快捷键把当前输入追加到 steer FIFO，即使 ordinary queue 已有消息也允许显式越过。
- 输入框为空且 ordinary FIFO 非空时，快捷键原子提升 ordinary 队首：从 ordinary owner 转移到 steer FIFO 队尾。
- 输入框为空且 ordinary FIFO 为空时不执行操作。
- 不能提升 pending start、recovery batch、ordinary 队尾或任意选中项。

按钮 tooltip、快捷键说明和辅助技术名称必须表达 `引导`，不能只显示无法被读屏理解的图标。

## 多队列状态模型

### 独立生命周期容器

实现必须至少保持以下容器独立，禁止折叠成一个带 `kind` 或 `priority` 的统一消息队列：

```ts
type ComposerInputState = Readonly<{
  ordinaryQueue: readonly OrdinaryMessage[];
  steerQueue: readonly SteerIntent[];
  pendingSteers: readonly PendingSteer[];
  rejectedSteersQueue: readonly RejectedSteer[];
}>;
```

具体可变容器、私有类和 transition 类型属于计划阶段的技术判断，但必须维持以下语义：

- `ordinaryQueue`：尚未取得 `turn/start` 所有权的 next-turn FIFO。
- `steerQueue`：已由 Composer owner 接受、尚未发起 `turn/steer` 的 FIFO。
- `pendingSteers`：已经发起 `turn/steer`、尚未由权威 commit 释放的 FIFO。
- `rejectedSteersQueue`：已明确无法进入目标 turn、等待优先转成新 turn 的 FIFO。

现有 start claim、ordinary recovery batch 与 release blocker 可以继续作为 owner/恢复状态，但不能成为 steer 与 ordinary 共用的第二套消息来源。

### 消息身份与目标

每条 steer 至少稳定保存：

- 本地 message identity。
- 与协议对应的 `clientUserMessageId`。
- immutable input payload。
- 入队时捕获的 `expectedTurnId`。
- 来源：当前 Composer 直接引导，或从 ordinary 队首提升。

`expectedTurnId` 不得在发送时静默替换成新的 active turn。目标 turn 已变化时，该消息已经不能保持原 steer 语义，必须进入明确拒绝/恢复路径。

payload 类型必须机械派生自生成的 `TurnSteerParams["input"]` 与 ordinary `TurnStartParams["input"]`。如果其他已确认工作先把 Composer queue 升级为结构化 `UserInput[]`，本功能必须直接复用同一 immutable payload owner，禁止重新降级成 text-only 双路径。

### ordinary FIFO 与显式优先级

- ordinary queue 内部永远 `push_back` / `pop_front`。
- empty-composer 提升只能从 ordinary `front` 转移，保持“普通队列首先是 FIFO”的约束。
- 被提升项进入 steer FIFO 的队尾；不能越过更早的 steer。
- 非空输入形成新的 steer intent，可以显式越过整个 ordinary queue；这是用户选择的优先级，不是 ordinary queue 重排。
- steer FIFO 内部同样保持提交顺序。

## steer 调度与所有权迁移

### 发起请求

steer coordinator 只从 `steerQueue` 队首取得发送权，并原子转移到 `pendingSteers`。请求使用该 entry 已保存的：

- `threadId`。
- immutable `input`。
- `expectedTurnId`。
- `clientUserMessageId`。

同一请求不得同时留在 `steerQueue` 与 `pendingSteers`。React、Redux 和组件本地 state 不得复制可重发 payload。

在前一请求仍处于 issuing 时，不发起后继 steer。前一请求得到明确 accepted 后，可以继续发起 steerQueue 队首；已 accepted 但尚未 commit 的多个条目继续按顺序保存在 `pendingSteers`。

### settlement 分类

settlement 必须沿用现有 transport 证据分类，而不是根据错误字符串猜测：

- `accepted`：RPC 返回匹配的 active turn identity；entry 转为 accepted-awaiting-commit，不能立即删除。
- `definitelyNotAccepted`：只有证据证明服务端未接受时才能释放发送状态。
- `deliveryUnknown`：请求可能已发送但结果未知；entry 保留在 `pendingSteers`，不得重试、fallback 或让后继未知地越过。

`clientUserMessageId` 只用于权威 projection 关联，不假定为服务端幂等键。即使用同一 ID 重发，也可能造成重复输入。

当前 GUI transport 会把 JSON-RPC error 压缩成只有 code/message 的普通 `Error`，并丢弃 `error.data`。本功能必须在 GUI Host transport/gateway 边界保真携带生成协议已经提供的结构化 error data，使 coordinator 能机械识别 `ActiveTurnNotSteerable`。这只是消费现有 app-server wire data，不修改 server 协议。

expected-turn mismatch 与 no-active-turn 当前没有结构化 error variant，禁止解析错误消息。此类 generic `definitelyNotAccepted` 不能冒充已确认的 rejected-steer 事实；entry 必须由现有 recovery owner 保留，并等待 active-turn/terminal projection 收敛或向用户暴露明确恢复，不能丢失或盲目重试。

### commit

projection 出现相同 thread、相同 turn 且 `clientId` 匹配的 committed user message 时：

- 从 `pendingSteers` 释放对应 owner。
- 把权威 user message 交给现有 transcript/projection 渲染。
- 移除 transcript 外的对应 pending preview。

重复内容不能只靠 text 比较关联。缺少或不匹配的 identity 不得释放另一条 pending steer。

### 明确不可 steer

以下权威事实表示原目标不能再接受 steer：

- RPC 返回结构化 `ActiveTurnNotSteerable`，证明 active turn 是 review 或 compact。
- 顺序 projection 已处理目标 turn 的全部先前 commit 后，目标 turn 到达 terminal。
- 当前权威 active-turn projection 已明确变为另一个 turn，且旧目标的 terminal 已完成收敛。

entry 按原提交顺序进入 `rejectedSteersQueue`，并显示 fallback 提示。它没有丢失，也没有被描述成已进入当前 turn。

这条规则不适用于单纯的 transport unavailable。连接不可用时，普通发送同样不可达，必须保留 owner 并等待现有连接/recovery 语义，不能谎称已完成 fallback。

## rejected steers 与 ordinary queue

### normal terminal

同一 thread 的 projection 事件必须由 owner 顺序处理。当前 turn 正常结束时，严格执行：

1. 先应用 terminal 之前已经到达的全部 committed user-message observations，释放匹配的 pending owner。
2. terminal 是该 turn 的顺序权威边界；此前仍未 commit 的 `pendingSteers` 不再可能进入该 turn，按原顺序转入 `rejectedSteersQueue`，包括先前处于 accepted-awaiting-commit 或 delivery-unknown 的条目。
3. 再把仍绑定该终止 turn 的 `steerQueue` 条目按原顺序转入 `rejectedSteersQueue`；这些未发条目晚于已经进入 pending 的条目，不得排到它们前面。
4. 若 `rejectedSteersQueue` 非空，按 FIFO drain 全部条目。
5. 保持原消息顺序和各自 payload 顺序，合并成一个新 turn 输入。
6. 该合并输入优先于 `ordinaryQueue` 发起 `turn/start`。
7. 只有 rejected 合并输入取得 start owner 后，ordinary FIFO 才继续正常 drain。

合并是为了尽量还原“这些输入本应一起进入刚才同一个 turn”的原意。不得倒序、只取最后一条或把 rejected 追加到 ordinary 队尾。

terminal 不得与 commit 并行应用，也不得在迁移 unresolved steer 之前让 ordinary 队首取得 start claim。只有同一 projection owner 的顺序事实使 terminal 成为安全的负面确认；本地超时或连接断开本身不能替代该事实。

### start settlement

rejected 合并输入转为普通 `turn/start` 后，复用现有 start claim、accepted-awaiting-runtime、delivery-unknown 与 recovery 语义。不得为通过设计而新增静默重试或第二条兼容 start 路径。

## interruption 与恢复

### 系统异常中断

GUI 当前收到的 v2 terminal projection 只有 `status: interrupted`，不包含 core abort reason。本设计所称“系统异常中断”在可实现边界内精确定义为：没有匹配本 GUI、本 thread、本 turn 的本地 interrupt request owner，却收到了顺序权威的 interrupted terminal。该事实证明 server 已清理未消费 pending input 后：

- 尚未 commit 的 pending steers 按原顺序转入 `rejectedSteersQueue`。
- 尚未发出的 steer intents 同样保持顺序进入 rejected 恢复。
- 按 rejected 优先规则合并为一个新 turn。
- ordinary queue 保持自身 FIFO，不与 rejected 混排。

### 用户主动停止

本 GUI 发起 `interruptTurn` 时，coordinator 必须为当前 thread/turn 记录一次性 local user-stop owner。只有匹配 owner 的 interrupted terminal 才能证明本设计中的“用户主动停止”；用户主动停止表示“不要立刻继续运行”，因此：

- pending steers、尚未发出的 steer intents 和 ordinary messages 都不得自动触发新 turn。
- 它们进入显式待恢复 owner，保持各自原始顺序和类别。
- 用户点击明确的继续操作后，先恢复 rejected/steer 意图，再恢复 ordinary FIFO。
- 恢复不得覆盖当前 Composer 草稿，也不得因为草稿非空而合并或丢弃消息。

local user-stop owner 必须随 thread/connection generation 失效，且只能消费一次。没有该 owner 的 interrupted terminal 一律走非本地 interruption 路径；本设计不声称能区分来自另一客户端的用户停止、budget exhaustion、replacement 或其他 core abort reason。若未来产品要求区分这些来源，必须另行设计 app-server v2 abort-reason 协议扩展。

## GUI 投影

### 统一待处理区域

Composer 内使用一个统一的待处理区域，按以下顺序展示：

1. `引导中`：先显示 `pendingSteers`，再显示尚未发送的 `steerQueue`，保持跨容器的原提交顺序。
2. `将优先发送`：显示 `rejectedSteersQueue` 的内容预览。
3. `已排队 N 条`：ordinary queue 只展示聚合数量，不展示内容列表。

引导内容预览位于 transcript 外，每条内容有稳定边界和有界行数；超长内容截断显示，但 owner 保存完整 payload。预览不得把 path、内部 identity 或 transport 详情暴露为用户文案。

UI projection 必须由同一个 queue/coordinator owner 机械产生。React 不保存第二份 steer/ordinary FIFO，也不能通过渲染顺序反向决定发送顺序。

### 状态反馈

- 已知不可 steer：显示 `当前无法引导，已加入队列`，并在 `将优先发送` 中展示内容。
- issuing/accepted：显示在 `引导中`，不写入 transcript。
- delivery unknown：保留内容并明确显示 `引导状态未知`；不提供可能造成重复提交的重试按钮。
- user-stop recovery：显示待恢复数量和明确继续操作；不自动开始。
- commit：移除 pending preview，由权威 transcript item 取代。

状态不能只靠颜色表达。分段标题、按钮 accessible name、status 文案和快捷键说明必须可被辅助技术读取；状态更新不得抢走 Composer focus。

## owner 与生命周期

queue/coordinator owner 绑定当前 active thread identity、connection generation 和投影订阅：

- replacement attach 必须匹配 thread identity。
- thread/connection generation 改变后，旧 RPC settlement 和旧 projection event 必须失效。
- dispose 后不得继续 drain ordinary 或 steer queue。
- thread 切换不能把旧 steer 重新绑定到新 active turn。
- read-only history 页面不得创建 steer owner，也不得暴露可交互的 Composer 引导入口。

本设计不要求跨刷新持久化；但在当前页面生命周期内，owner 必须保持消息、顺序和 delivery unknown 事实，不能因 React remount 丢失。

## 国际化与可访问性

- JSX 文案使用 Lingui `Trans`/`Plural`；属性、toast 和非 JSX 字符串使用 `useLingui`。
- 中文核心文案为 `引导`、`引导中`、`将优先发送`、`当前无法引导，已加入队列`、`引导状态未知`。
- ordinary 数量继续使用可翻译 plural，不拼接固定中文数字单位。
- `引导`按钮必须具有明确 accessible name；禁用原因和 fallback 状态不能只放在 hover-only tooltip。
- `⌘ Enter` / `Ctrl+Enter` 的可见提示与实际平台一致。
- pending/rejected 内容区域使用合适的 status/list 语义，但不得制造多个重复 live-region 播报。

## 验证边界

### 数据状态机

定向测试至少证明：

- ordinary、steer、pending 和 rejected 容器相互独立，不存在同一消息双重所有权。
- ordinary 与 steer 各自严格 FIFO。
- 非空快捷键形成 steer 并越过 ordinary；empty 快捷键只提升 ordinary 队首。
- 多条 steer 按提交顺序发起并用稳定 identity commit。
- accepted 不会提前从 pending 删除。
- delivery unknown 不重试、不 fallback、不继续错误 drain。
- 明确不可 steer 转入 rejected。
- rejected 全量按顺序合并并优先于 ordinary。
- terminal 迁移保持跨 `pendingSteers → steerQueue` 的全局提交顺序。
- user stop 与系统异常 interruption 走不同恢复路径。

### 协调层与生命周期

验证：

- `turn/steer` 使用捕获的 `expectedTurnId`、immutable input 和 `clientUserMessageId`。
- GUI transport 保留结构化 `ActiveTurnNotSteerable` error data，coordinator 不解析 error message。
- turn identity 改变时不会静默改绑。
- transport classification 与 runtime observation 回到同一个 owner。
- 多个 accepted pending steer 可按 client identity 逐项收敛。
- dispose、replacement attach 和旧 async settlement 不会继续发送。
- read-only history owner 不产生 steer command。
- local interrupt owner 只把匹配 thread/turn 的 terminal 分类为本 GUI user stop；其余 interrupted terminal 走非本地恢复。
- normal terminal 先处理先前 commit，再迁移 unresolved steer，然后启动 rejected 合并输入，最后才允许 ordinary drain。

### Browser 纵向路径

Browser 测试至少覆盖：

- active regular turn 中显示独立 `引导`按钮；idle 时不显示。
- 点击按钮提交非空输入并显示 transcript 外的 `引导中`预览。
- Enter 仍普通排队，不会调用 `turn/steer`。
- macOS 主修饰键加 Enter 提交当前非空输入为 steer；空输入时只提升 ordinary 队首。
- empty composer 时 `引导`按钮禁用。
- ordinary 已有多条时，非空显式 steer 可越过，但 ordinary 内部顺序不变。
- committed projection 到达前不出现正式 transcript item；匹配 commit 后完成替换。
- review/compact 等明确拒绝显示 fallback 和 `将优先发送`。
- rejected steers 按顺序合并并优先于 ordinary 启动。
- delivery unknown 显示不可操作状态且不重复请求。
- 用户停止不会自动重启；系统异常中断按设计恢复。

测试断言稳定行为、快捷键、内容归属、顺序、可访问文本和 command 调用，不锁定 padding、gap、颜色或阴影等主观视觉数值。

## 完成标准

只有以下纵向路径全部可达，才能称信息引导功能完成：

```text
Composer button / shortcut
  → distinct steer FIFO
  → turn/steer(expectedTurnId, clientUserMessageId)
  → pending steer projection
  → authoritative committed user message
  → transcript
```

同时必须证明：ordinary queue 仍保持 FIFO；empty shortcut 只提升 ordinary 队首；明确拒绝不会丢失并优先转成新 turn；delivery unknown 不会重复发送；用户主动停止不会被自动恢复绕过。

只有组件按钮、toast、纯 module 单测或未消费的 command effect，均不足以满足完成标准。
