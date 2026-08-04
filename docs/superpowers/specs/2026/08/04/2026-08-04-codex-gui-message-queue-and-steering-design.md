# Codex GUI 消息排队与引导设计

日期：2026-08-04

状态：已确认

设计分支：`dev`

设计时 HEAD：`6a751d4aeedb2b72e20100d17c9d322a372cf5fd`

关联文档：

- Composer 基线：`docs/superpowers/specs/2026/06/17/2026-06-17-yolo-single-session-chat-performance-v2/07-composer-turn-control/design.md`
- IME Enter 防误发：`docs/superpowers/specs/2026/07/04/2026-07-04-codex-gui-ime-enter-guard-design.md`
- 浏览器语言本地化：`docs/superpowers/specs/2026/08/03/2026-08-03-codex-gui-browser-language-localization-design.md`

## 唯一主目标

为 Codex GUI 设计客户端本地的消息排队与引导功能，在不承诺与 TUI 统一排序的前提下，落实已确认的
GUI 交互和生命周期语义。

本设计只定义产品行为、权威来源、状态 owner、协议边界、UI seam、失败语义和验证边界。它不是
implementation plan，不定义任务顺序、提交拆分或执行命令，也不授权修改产品代码。

## 当前代码与为什么需要改动

当前 `ComposerTurnControl` 只有三组本地状态：`draft`、`isSending` 和 `isStopping`。发送能力由
`canSend` 派生，而 `canSend` 明确要求 `activeTurnId == null`。因此 active turn 运行期间：

- `Send` 被禁用；
- 用户不能把消息保存为后续 turn；
- 用户不能通过正式的 same-turn steer API 引导当前 turn；
- Composer 不拥有队列、暂停、恢复、编辑、删除、Undo 或容量语义。

当前发送路径只有 `commands.startTurn(...)`，中断路径只有 `commands.interruptTurn(...)`。
`GuiHostCommands`、生成的 request descriptors 和前端选定协议方法集合均不包含 `turn/steer`。

app-server v2 已经把 `turn/steer` 定义为正式权威接口，并要求 `expectedTurnId`。但是 Rust
`gui-host` 的浏览器请求 allowlist 当前明确拒绝 `turn/steer`。所以本功能不能只在 Composer 中增加一个
按钮，也不能用 `turn/start` 模拟“引导”；它必须打通一条受 GUI Host 控制、由 app-server schema
机械生成类型和 validator 的 `turn/steer` 命令路径。

`threadRuntime` 当前只保留 `activeTurnId`。live `turnCompleted` 到达时，不论最终状态是
`completed`、`interrupted` 还是 `failed`，它都会把匹配的 `activeTurnId` 清空。仅观察
`activeTurnId: string | null` 无法实现以下已确认差异：

- 正常完成后自动发送下一条；
- Stop 或失败后保留并暂停队列；
- snapshot/replay 不能误触发本地自动发送。

因此最小缺失机制不是“看到空闲就出队”，而是：GUI-local 队列状态机、live terminal outcome 信号、
正式 `turn/steer` 命令和与这些语义对应的 GUI 控件。

## 与旧 Composer 设计的关系

2026-06-17 的 Composer 设计仍是以下约束的基线：

- Composer 与只读 transcript surface 分离；
- 用户消息只在 projection 中成为 committed transcript，不做 optimistic transcript append；
- UI 不直接调用 `socket.send`，请求继续经过 `GuiHostCommands`；
- 草稿和局部交互状态不进入 transcript state；
- 业务 RPC 失败只拒绝对应 Promise，不把可恢复错误升级为 host terminal error；
- IME composition guard、`Shift+Enter` 换行和空白 draft 禁止提交继续有效。

本设计只替换旧设计中的两项限制：

1. active turn 时不再一律禁用发送控件；
2. “第一版不调用 `turn/steer`、不做本地队列”不再成立。

其他 transcript、projection、连接和错误传播边界保持不变。

## 已确认的产品决策

1. 队列是当前 GUI 页面、当前 URL、当前打开对话内的客户端本地 FIFO。
2. 第一版不处理 URL 切换、对话切换、刷新或 GUI 重启后的队列保留。
3. GUI 队列与 TUI 队列互不可见，不承诺跨客户端统一 FIFO，也不定义 GUI/TUI 优先级。
4. 每条对话最多保存 20 条 queued message。
5. 空闲时显示普通 `发送` 按钮；active turn 运行时切换为 split button。
6. split button 主操作为 `排队`；下拉操作为 `引导`。
7. `引导` 的说明为 `在下次工具调用后发送`。
8. active turn 中，`Enter` 排队；macOS 使用 `⌘Enter`、其他平台使用 `Ctrl+Enter` 引导；
   `Shift+Enter` 继续换行。
9. 队列在 Composer 内、主输入框上方显示；固定高度最多同时展示 3 条，更多内容在该区域内滚动。
10. 每条 queued message 的 `…` 菜单提供编辑和删除；不提供拖动排序。
11. 编辑使用 Dialog；删除立即生效，并通过 Toast 提供 Undo。
12. 队列标题区提供 `清空`；立即清空，并通过 Toast 提供 Undo。
13. 正常完成后自动执行下一条，任一时刻最多发起一个 queued `turn/start`。
14. Stop 或 turn 失败后保留并暂停队列；队列标题区显示 `继续`，点击后从队首恢复。
15. 当前 turn 拒绝引导时，消息插入 GUI 队首，并提示
    `当前运行无法引导，消息已加入队列`。

## 目标

- 在 active turn 中让用户明确选择“排队到后续 turn”或“引导当前 turn”。
- 用一个有界、可测试的 GUI-local FIFO 保存最多 20 条纯文本消息。
- 严格区分正常完成、Stop、失败、连接不可用和 snapshot replay，避免错误自动续发。
- 保持 queued message 与 committed transcript 的语义边界：未发送内容不进入 transcript。
- 使用 app-server v2 的正式 `turn/steer` contract，不手写或镜像 wire DTO。
- 保留用户输入：确定的引导拒绝进入队首；不确定的传输结果不制造第二份消息。
- 使用 HeroUI v3 的 ButtonGroup、Dropdown、Modal、Button、TextArea 和 Toast 组合已确认交互。
- 使用 Lingui 管理所有新增固定文案，English source copy 与 `zh-CN` 翻译分离，用户文本保持原文。

## 非目标

- 不把 GUI 队列下沉到 app-server/core，也不新增 server-side queue RPC。
- 不迁移、读取、展示、编辑或清空 TUI 的本地队列。
- 不建立 GUI/TUI client lease、owner lock、优先级或跨客户端 FIFO。
- 不提供跨 URL、跨对话、刷新、重启或断线后的持久恢复承诺。
- 不把 queued message 写入 Redux transcript、projection snapshot、rollout、localStorage 或其他持久层。
- 不做 optimistic transcript append，不为 queued message 伪造 `Turn` 或 `ThreadItem`。
- 不提供图片、音频、文件或其他新输入类型；队列沿用当前 Composer 的纯文本范围。
- 不提供任意排序、拖动、批量编辑或从中间项开始执行。
- 不改变 TUI 的 Enter/Tab 快捷键、队列 UI、Stop 恢复草稿或错误后续发行为。
- 不修改 app-server 的 `turn/start`、`turn/steer` 或 `turn/interrupt` 语义。
- 不手写 generated TypeScript、request descriptor、runtime validator 或协议错误 shape。
- 不创建或落盘 implementation plan，不修改产品代码。

## 权威来源与所有权

### 运行中的 thread 与 turn

`threadRuntime` 继续是当前 thread、subscription 和 active turn 的唯一运行事实 owner：

- `threadId` 决定 `turn/start`、`turn/steer` 和 `turn/interrupt` 的目标；
- `activeTurnId` 决定 active/idle UI 以及 `expectedTurnId`；
- subscription 与 GUI Host status 决定连接是否可用；
- accepted live `turnCompleted` 的权威 `Turn.status` 决定自动续发或暂停。

队列不得从 transcript 文案、DOM、Toast、请求 Promise 完成顺序或 `activeTurnId` 从非空变空这一表象反推
turn outcome。

### 协议 contract

app-server schema 和生成的 `@codex-protocol` 类型是以下 contract 的唯一权威来源：

- `TurnStartParams` / `TurnStartResponse`；
- `TurnSteerParams` / `TurnSteerResponse`；
- `TurnInterruptParams` / `TurnInterruptResponse`；
- `ThreadProjectionEventNotification`；
- `TurnStatus`；
- `UserInput`。

前端可以通过 `RequestParams<"turn/steer">` 和 `RequestResponse<"turn/steer">` 机械引用 contract，
但不得声明 GUI-owned 的 `TurnSteerParams`、response interface、字符串 union 或 validator。

### GUI-local 队列

队列状态由 `composerTurnControl` feature 内的新状态机唯一拥有。它不进入 Redux，因为当前确认范围只有一个
页面内 Composer consumer，并且不需要跨 URL 或重挂载恢复。

状态机保存 GUI 自有语义，而不是 wire payload：

```ts
type QueuedComposerMessage = {
  id: string;
  text: string;
};

type ComposerQueueMode = "running" | "paused";

type ComposerQueueState = {
  items: readonly QueuedComposerMessage[];
  mode: ComposerQueueMode;
  waitingTurnId: string | null;
  startingItemId: string | null;
  undo: QueueUndo | null;
};
```

精确命名属于后续计划的实现细节，但必须保留这些不变量：

- `items.length <= 20`；
- `items` 的数组顺序就是 FIFO 顺序；
- `startingItemId` 同时最多一个；
- `waitingTurnId` 只等待一个权威 live terminal outcome；
- queued item 只有在对应 `turn/start` 成功返回后才从队首移除；
- 队列消息在命令边界通过现有 `buildPlainTextInput` 转换为 generated `UserInput`。

React 可以使用 feature-local reducer/hook 承载状态机，但 `ComposerTurnControl.tsx` 不应堆叠所有队列转换、
Undo、terminal outcome 和 UI 细节。新 module 必须对外提供小而完整的操作面，让 Composer 只负责编排草稿、
命令和可见控件。

### terminal outcome 信号

`threadRuntime` 在接受 `replay: "live"` 的 `turnCompleted` 时，机械派生最近一次 live completion：

```ts
type LiveTurnCompletion = {
  commitId: string;
  turnId: string;
  status: Extract<TurnStatus, "completed" | "interrupted" | "failed">;
};
```

该值属于 thread runtime fact，不拥有队列。attach 时重置为 `null`，`snapshotDuplicate` 不更新它。
`commitId` 是一次性消费 token，防止 React rerender 重复触发。队列只处理与 `waitingTurnId` 匹配且尚未消费的
completion：

- `completed`：开始一个队首项；
- `interrupted` / `failed`：保持全部 items 并切换为 `paused`；
- 不匹配或重复 commit：no-op。

这比扫描 transcript 或监听 `activeTurnId == null` 更深：它保留权威 outcome 和 replay 边界，同时不让
`threadRuntime` 接管队列内容。

## Deep module seam

```text
accepted thread projection event
  → threadRuntime live terminal fact
  → composer-local queue state machine
  → GuiHostCommands
      → generated request descriptor / validator
      → GUI Host method allowlist
      → app-server turn/start or turn/steer
```

职责固定如下：

| 职责 | 唯一 owner |
| --- | --- |
| thread、subscription、active turn、live terminal outcome | `threadRuntime` |
| FIFO、20 条上限、暂停、Undo、starting/waiting | composer-local queue state machine |
| 草稿、IME composition、键盘意图路由 | `ComposerTurnControl` |
| ButtonGroup、列表、菜单、Modal、Toast presentation | composer feature React surface |
| request method、params、response 类型 | generated app-server protocol |
| request lifecycle 与 failure source | GUI Host transport session / command gateway |
| 浏览器可调用方法的安全边界 | Rust `gui-host` allowlist |
| committed user message | projection → transcript state |

不得把 queue mode 写进 `threadRuntime`，不得把 turn outcome 复制进队列作为第二份 runtime owner，也不得让
transport、gateway 或 Rust GUI Host 持有 GUI 队列。

## 排队数据流

### active turn 中加入队列

1. 用户在主输入框输入非空纯文本。
2. 用户点击 `排队` 或按 Enter。
3. 队列未满且没有冲突请求时，状态机在尾部追加 `{id, text}`。
4. 仅当当前 draft 仍等于本次提交 snapshot 时清空主输入框；用户在异步边界后的新编辑不得被清空。
5. 入队不调用 app-server，不创建 transcript item。
6. 状态机把当前 `activeTurnId` 记为 `waitingTurnId`，等待其 live terminal outcome。

连续排队保持 `pushBack` 语义。当前 turn `completed` 后只取一个队首项调用 `turn/start`；其余消息等待新
turn 再完成，因此不会并行启动多个 turn。

### queued `turn/start`

开始队首项前先设置 `startingItemId`，从而同时禁用重复 Continue、自动 drain 和空闲 Send 竞态。

- request 成功：从队首移除该 item，并以 response turn ID / 随后的权威 runtime active turn 继续等待；
- 明确失败：item 保持队首，队列切换为 `paused`，Toast 暴露原始错误说明；
- 连接不可用或 manual reconnect required：不调用 request，保持队列并暂停。

状态机不在 request 发出前 `popFront`，也不在失败后把相同 text 复制成第二条 item。

### 正常手动发送

当 `activeTurnId == null` 时，Composer 保持现有普通 `发送` 行为。若存在 paused queue，用户仍可以发送当前
草稿；paused queue 不抢占该手动 turn，也不会在它结束后自动恢复，除非用户点击队列标题区的 `继续`。

当队列正在发起 queued `turn/start` 时，普通 Send 暂时禁用，避免两个 `turn/start` 争用同一 idle 边界。

## 引导数据流

### 正式 API

引导必须调用：

```ts
commands.steerTurn({
  threadId,
  expectedTurnId: activeTurnId,
  clientUserMessageId: null,
  input: [buildPlainTextInput(submittedDraft)],
});
```

可选 protocol 字段保持 omitted，不传 consumer-owned defaults。`expectedTurnId` 必须来自当前
`threadRuntime`，不能从 request response、transcript 或 DOM 缓存。

### 成功与失败

- 成功：仅当当前 draft 仍等于 submitted snapshot 时清空；消息最终由 projection 进入 transcript。
- 确定的 JSON-RPC 拒绝：把 submitted snapshot 插入 GUI 队首；若当前 draft 未被用户改写则清空；显示
  `当前运行无法引导，消息已加入队列`，并等待当前 active turn 的 terminal outcome。
- send/unavailable、缺失 result 或 malformed result：结果不确定，不自动复制到队列；保留当前草稿并显示
  发送失败详情，连接不可用时暂停已有队列。

区分这些情况需要 transport 保留已有 `TransportRequestFailure.source` 到 command consumer。不能解析 error
message 字符串，也不能把所有 Promise rejection 当成同一种业务拒绝。RPC error 的原始 message 可以作为
动态详情显示，但固定外层文案由 GUI/Lingui 拥有。

### 满队列边界

20 条是硬上限，任何路径都不得产生第 21 条、静默删除尾项或暂时扩大上限。

因为确定的引导拒绝必须自动插入队首，所以当队列已有 20 条时：

- `排队` 禁用并提示队列已满；
- `引导` 同样禁用，说明队列已满，无法保证拒绝后的无损回退；
- 用户删除或清空至少一项后恢复这两个动作。

这是由“硬上限 + 拒绝自动回退 + 禁止丢消息”共同推出的安全行为，不通过覆盖尾项隐藏冲突。

## 队列生命周期

```text
active turn + queue items + running
  ├─ turn completed   → start exactly one head item
  ├─ turn failed      → keep items, paused
  ├─ turn interrupted → keep items, paused
  ├─ Stop pressed     → paused immediately, then request interrupt
  └─ connection lost  → keep items, paused

paused + idle
  └─ Continue → start exactly one head item → running
```

Stop 一经用户触发就先暂停队列，再调用 `turn/interrupt`。即使 interrupt request 因竞态失败，用户明确表达的
“停止后不要自动继续”仍然成立。后续 terminal event 不能把 paused 自动改回 running。

队列为空时不显示 paused presentation；暂停事实可以保留到下一次显式 Continue，也可以在空队列时归一化为
running，精确 reducer 形状属于计划阶段，但不得让旧暂停状态意外阻止未来新队列。

## 编辑、删除、清空与 Undo

### 编辑

队列项的 `…` Dropdown 提供 `编辑` 和 `删除`。编辑打开 HeroUI `Modal`，其中使用 `Modal.Dialog`、
`TextArea`、取消和保存 Button：

- Modal 使用 item ID 定位，不使用可变数组 index 作为 identity；
- 保存后保持原 FIFO 位置；
- trim 后为空时禁用保存；
- 编辑只影响 queued item，不覆盖主 Composer draft；
- 正在 `startingItemId` 的项不可编辑或删除。

### 单条删除与清空

删除和清空都是立即生效的本地操作，不打开确认 Dialog：

- 单条删除保存被删除 item 及原位置；
- 清空保存整个有序队列 snapshot；
- Toast 使用 `actionProps` 提供 `撤销`；
- Undo 恢复稳定 ID、文本和原 FIFO 顺序。

第一版只保留一个 pending Undo。任何后续会改变队列 membership 的操作（再次排队、确定的引导回退、
删除、清空、queued start 成功或 Undo）都会先结算并关闭旧 Undo，再执行新操作。这样既不保留无界历史，
也不会在队列重新填满后通过 Undo 产生第 21 条。

纯文本编辑不改变 membership，可以保留当前 Undo；如果被编辑项与待恢复 snapshot 存在 identity 冲突，
稳定 ID 规则必须让 reducer 拒绝重复恢复并暴露开发期 invariant，而不是复制 item。

## UI 与键盘交互

### 空闲状态

- action row 保持 `Stop` 与普通 `发送` Button；
- `发送` 使用现有语义和 variant；
- paused queue 的标题区额外显示 `继续`，但主发送按钮仍发送当前 draft；
- 空白 draft、请求 pending、连接不可用和 IME guard 规则不变。

### active turn 状态

发送控件使用 HeroUI v3 split button：

```text
ButtonGroup
  ├─ Button: 排队
  └─ Dropdown trigger Button: ChevronDown + ButtonGroup.Separator
       └─ Dropdown.Menu
            └─ Dropdown.Item
                 ├─ Label: 引导
                 └─ Description: 在下次工具调用后发送
```

`ButtonGroup` 与两个直接 Button 使用统一非 destructive variant；Dropdown trigger 使用 `isIconOnly` 和完整
`aria-label`。`Stop` 继续使用 `danger-soft`。下拉项不是选择持久化设置，不记录“上次动作”，也不改变主按钮
默认行为。

### 队列列表

队列列表位于现有 Composer `Surface` 内、主 `TextArea` 上方：

- 使用语义 `section` + `ol` 表达标题和 FIFO 顺序；这里不使用 ListBox，因为队列不是 selection widget；
- 使用 `bg-surface` / `border-border` / `text-muted` 等语义 token，不新增硬编码颜色；
- 固定高度最多可见 3 条，超出后只让队列区域滚动，不改变页面 transcript 的 window scroll owner；
- 每条显示有界文本 preview 和 `…` Dropdown；完整文本在编辑 Modal 中可见；
- 标题区显示数量、paused 状态、`继续` 和 `清空`；没有 item 时整个区域不渲染；
- `清空` 是 dismissive action，item `删除` 使用 danger menu variant；编辑保持普通 action。

### 键盘

现有 IME 事件顺序优先于所有发送快捷键：

1. composition 中或需要 suppress 的 Enter 不执行排队、引导或普通发送；
2. `Shift+Enter` 插入换行；
3. idle 的普通 Enter 执行 `发送`；
4. active turn 的普通 Enter 执行 `排队`；
5. active turn 的 `Meta+Enter` 在 macOS 执行 `引导`；
6. active turn 的 `Ctrl+Enter` 在非 macOS 执行 `引导`；
7. 修饰键判定使用已有 runtime 平台判断 seam，不通过 User-Agent 字符串在多个组件重复猜测。

快捷键与按钮使用同一 command handler 和 availability predicate，禁止出现按钮禁用但快捷键仍提交的旁路。

## 文案与本地化

所有固定文案在 React render seam 使用 Lingui macro。English msgid 是 source copy，`zh-CN` catalog 使用
已确认中文。建议的对应关系如下：

| English source | `zh-CN` |
| --- | --- |
| `Send` | `发送` |
| `Queue` | `排队` |
| `Guide` | `引导` |
| `Send after the next tool call` | `在下次工具调用后发送` |
| `Queued messages` | `已排队消息` |
| `Continue` | `继续` |
| `Clear` | `清空` |
| `Edit` | `编辑` |
| `Delete` | `删除` |
| `Edit queued message` | `编辑排队消息` |
| `Undo` | `撤销` |
| `The current run cannot be guided. Message queued.` | `当前运行无法引导，消息已加入队列` |
| `Queue is full` | `队列已满` |

用户草稿、queued message 文本和 RPC error message 保持原文，不作为 msgid，也不翻译。

## TUI 共存边界

TUI 与 GUI 都连接同一个 app-server thread runtime，但它们的客户端本地队列是两个独立 owner：

- TUI 排队时只写 TUI 的 `VecDeque`；
- GUI 排队时只写当前页面的 local reducer；
- TUI 和 GUI 的引导都调用正式 `turn/steer`；
- app-server 不提供 GUI 优先、TUI 优先或跨客户端队列仲裁。

若两个客户端在同一个 turn 完成后同时 drain，本设计只承诺各自客户端内部 FIFO。app-server 按实际收到的
请求顺序处理；后到的输入可能进入已经启动的新 active turn。GUI 不在前端伪造全局顺序，也不显示误导性的
“全局第 N 条”。

跨客户端统一 FIFO 需要未来把 queue owner 下沉到 app-server/core，属于新的产品目标和协议设计，不得作为
本设计的隐式后续任务。

## 连接、失败与数据安全语义

- GUI Host error、closed、manual reconnect required 时禁用排队、引导、继续和普通发送，保留现有草稿与队列。
- 连接进入不可用状态时队列切为 paused；重连不会自动恢复，必须由用户点击 `继续`。
- `turn/start` 请求失败不删除队首 item。
- `turn/steer` 的确定 RPC rejection 才执行已确认的自动入队；结果不确定时保留草稿，避免同一消息同时存在于
  core 和 GUI 队列。
- queue item ID 是 GUI identity，不宣称是 server idempotency key，也不提供跨断线 exactly-once 保证。
- 所有列表、Undo snapshot 和 preview 均受 20 条上限约束；单条文本继续受 app-server v2 input limit 约束。

## GUI Host 安全边界

开放 `turn/steer` 只扩展一个已有 app-server v2 request：

- Rust `gui-host` client request allowlist 增加精确字符串 `turn/steer`；
- allowlist 单元测试改为接受该方法，仍拒绝未列出的 request 和全部 client notification；
- 前端 `APP_SERVER_REQUEST_METHODS` 增加 `turn/steer`；
- descriptor、response validator 和导出文件由现有 protocol generator 从 schema 机械更新；
- `GuiHostCommandGateway` 增加 typed `steerTurn`，继续服从 attach 后 ready / disconnect 后 invalidated 生命周期；
- 不开放额外 thread、account、config、filesystem 或任意透传方法。

该变化不改变 app-server API 本身，也不允许 GUI 直接发送 allowlist 外请求。

## 验证设计

### 纯状态模型

状态模型覆盖以下不变量，而不是逐字段测试实现细节：

- 多条 pushBack 与单条 popFront 保持 FIFO；
- 第 20 条可入队，第 21 条被 availability 阻止；
- 任一时刻只有一个 `startingItemId`；
- `completed` 只启动一条，duplicate commit 不重复启动；
- `failed` / `interrupted` / Stop / connection unavailable 保留并暂停；
- paused 状态只有显式 Continue 恢复；
- 删除、清空、Undo 保持稳定 ID 和顺序；
- 后续 membership mutation 结算旧 Undo，不超过 20 条；
- 满队列禁用 guide fallback 路径。

### Browser Mode

使用真实 HeroUI 组件验证用户可见行为：

- idle 普通 Send 与 active split button 切换；
- Enter 排队、平台 modifier Enter 引导、Shift+Enter 换行和 IME guard；
- 队列区域最多 3 条可见并可滚动；
- item `…` 菜单打开编辑 Modal，保存后原位更新；
- 删除与清空 Toast 的 Undo；
- Stop 后显示 paused + Continue，且不自动发送；
- completed 自动开始一条，failed/interrupted 暂停；
- 引导 RPC rejection 插入队首并显示确认文案；
- 不确定 transport failure 保留草稿，不复制队列项；
- queue/start pending 时真实触发第二次操作仍只有一个 command call；
- queued message 在 projection 前不出现在 committed transcript。

测试通过 role、accessible name、菜单 item、Dialog heading 和稳定结构定位，不把 CSS 数值或 English copy
当作跨 locale 唯一 locator。固定高度和滚动只验证有价值的可感知约束，不锁死具体 padding、颜色或阴影。

### 协议与 GUI Host

- generated descriptor/validator 检查包含 `turn/steer` 且仍直接依赖 app-server schema；
- command gateway 验证 request params 原样发送、response 经 generated validator、RPC 失败只拒绝对应 Promise；
- transport 验证 failure source 能到达 consumer，且不把 RPC error 变成 host terminal failure；
- Rust GUI Host allowlist 验证只新增 `turn/steer`，未知方法仍被拒绝；
- 现有 `turn/start`、`turn/interrupt`、attach 和 disconnect 生命周期测试保持通过。

### 本地化

- 新增固定文案完成 Lingui extract/compile；
- English 与 `zh-CN` catalog 均覆盖新增 production msgid；
- 用户文本、RPC 动态详情和协议字段保持原文。

## 预期影响范围

后续 implementation plan 预计会涉及以下 owner，但本设计不预先固定精确文件拆分：

- `codex-gui/src/features/composerTurnControl/**`：local queue state machine、split button、列表、Modal、Toast、键盘；
- `codex-gui/src/features/threadRuntime/**`：accepted live terminal outcome 的最小 runtime fact；
- `codex-gui/src/features/guiHost/**`：`turn/steer` typed command 与 failure classification；
- `codex-gui/src/generated/appServerProtocol/**`：由项目 generator 机械生成的 descriptor/validator；
- `codex-gui/src/locales/**`：Lingui catalog；
- `codex-rs/gui-host/**`：精确开放 `turn/steer` 的安全 allowlist 与测试。

不预计修改 app-server、core、TUI、transcript state、projection ingress contract 或 package dependencies。若后续
计划证据证明必须越过这些边界，应回到设计阶段重新确认，而不是在实施中扩大范围。

## 风险与刻意限制

1. GUI/TUI 双本地队列不存在统一 FIFO；这是用户明确选择的范围，不通过客户端优先级假象掩盖。
2. 客户端本地队列没有跨刷新 durability，也不承诺断线 exactly-once。
3. `turn/steer` 的处理时机由 core 决定；文案“在下次工具调用后发送”是当前 TUI/产品语义，不表示 GUI
   自己寻找 tool-call boundary。
4. 满队列时禁用 Guide 是硬上限和无损回退的必要结果，不通过第 21 条或覆盖尾项解决。
5. 单步 Undo 会在后续 membership mutation 前结算；不建立无界撤销历史。
6. Composer UI 增加固定高度局部滚动区，但 transcript 仍保持现有 window scroll 和 sticky-bottom owner。
7. 打开 `turn/steer` 扩大 GUI Host request surface，因此必须保持精确 allowlist、generated contract 和 focused
   Rust 测试，不能泛化为任意 request proxy。

## 验收标准

- 文档中的所有已确认产品行为均有唯一 owner 和明确失败语义。
- 设计不依赖手写 wire DTO、runtime validator、error message parsing 或 `turn/start` 模拟引导。
- 20 条上限、guide fallback 和 Undo 在所有路径上不冲突、不丢消息、不产生第 21 条。
- snapshot/replay、Stop、失败和连接不可用不会触发意外自动续发。
- queued message 在真正提交前只存在于 Composer feature，不污染 transcript 或 runtime facts。
- GUI Host 只精确增加 `turn/steer`，不扩大其他浏览器权限。
- GUI 与 TUI 共存限制被明确记录，不声称不存在的全局优先级。

## 后续门禁

本设计落盘后仍处于“待确认”。在用户明确确认本设计前，不得创建或修改 implementation plan。

设计确认后，下一轮只能编写并落盘实施计划；计划再次获得明确确认后，才允许修改产品代码、生成 artifacts、
运行格式化或验证并按计划创建本地提交。
