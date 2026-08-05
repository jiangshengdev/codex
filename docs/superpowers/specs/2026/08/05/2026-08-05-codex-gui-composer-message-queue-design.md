# Codex GUI Composer 纯消息队列设计

日期：2026-08-05

状态：已确认

设计分支：`dev`

设计时 HEAD：`6645f6c5dccc438b2268f96d127969fe48e657cd`

关联文档：

- 历史设计：`docs/superpowers/specs/2026/08/04/2026-08-04-codex-gui-message-queue-and-steering-design.md`
- 被回退状态机研究：`docs/superpowers/research/2026/08/05/2026-08-05-codex-gui-reverted-message-queue-state-machine-analysis/current-findings.md`
- Composer 基线：`docs/superpowers/specs/2026/06/17/2026-06-17-yolo-single-session-chat-performance-v2/07-composer-turn-control/design.md`

## 唯一主目标

为 Codex GUI 设计一个不包含页面或其他 UI、以 TUI 队列模型为顶层基线的纯消息队列，使无固定条数上限、出队所有权转移、`Failed` 后继续和 `Interrupted` 后恢复等已确认语义形成一致且可验证的 Module。

本设计只定义纯队列的领域模型、Interface、所有权、排序、异步结果、失败恢复和验证边界。它不是 implementation plan，不定义任务顺序、提交拆分或执行命令，也不授权修改产品代码。

## 与历史设计的关系

2026-08-04 的历史设计同时覆盖队列、引导、ButtonGroup、快捷键、列表、Toast 和本地化。本设计不覆盖其中的 UI 内容，只替换其纯队列顶层模型与生命周期语义。

以下历史结论不再适用于未来队列：

- 20 条固定容量；
- 围绕第 20 个名额建立 Guide reservation；
- `Failed` 后切换为 paused；
- 用一个 `items` 数组同时承载普通 queued message 与 rejected steer；
- 用 `waitingTurnId`、`startingItemId`、`mode` 等可自由组合字段让 caller 自行维持状态约束；
- 用未变化 state 同时表示幂等、stale、拒绝和非法调用。

历史文档继续作为当时 UI 决策和被回退实现来源的证据，不被覆盖或删除。

## 当前代码与为什么需要新的 Module

当前 `ComposerTurnControl` 只持有 `draft`、`isSending` 和 `isStopping`，发送路径直接调用 `commands.startTurn(...)`。它没有 future queue、pending steer、rejected steer、pending start 或 recovery owner。

当前 `threadRuntime` 已能提供：

- 权威 `activeTurnId`；
- live completion 的 `status`、`turnId` 与 `commitId`；
- projection event buffer 中 committed `userMessage` 的 `clientId`。

当前 GUI Host command gateway 已提供 typed `startTurn` 与 `steerTurn`，但 transport pending map 只保存 Promise settlement，不保存原消息。因此：

- `threadRuntime` 能回答 turn 事实，但不能拥有 GUI 本地消息；
- GUI Host 能执行请求，但不能承担消息恢复；
- Composer 能持有 draft，但不应同时实现所有队列 owner、竞态和恢复算法；
- 被回退的浅 reducer 不能表达一条消息跨 queue、claim、RPC 与 server 的唯一所有权。

最小缺失机制是一个 in-process 深 Module：在 Composer 编排与 GUI Host command 之间集中管理消息所有权，接收 runtime 事实，返回需要执行的 claim 或 recovery result。

## 已确认的产品决策

本次单次设计共包含 5 项实质决策，未超过 15 项上限：

1. TUI 是纯队列的顶层设计基线；GUI 差异只用于交互方式和客户端异步生命周期适配。
2. 队列不设置固定条数上限，沿用 TUI `VecDeque` 按需增长的产品语义。
3. 复用 TUI 的出队所有权模型：消息出队后由请求调用方持有，`pending start` 只负责 single-flight 与请求身份。
4. 当前 turn `Failed` 后，剩余 FIFO 自动继续，不进入 paused。
5. 常规 `Interrupted` 后，把本地未提交消息按稳定顺序转为 recovery batch，清空对应 queue owner，不自动重提。

## 设计原则

### 消息守恒

除用户明确执行删除或清空外，每条消息在任一时刻必须恰有一个逻辑 owner：

- composer draft；
- ordinary queued；
- pending steer claim；
- rejected steer；
- pending start claim；
- delivery unknown claim；
- recovery batch；
- server。

状态转换只能移动 owner，不能复制或静默删除消息。

### Server 事实优先

`threadRuntime.activeTurnId`、live `turnCompleted`、committed `userMessage.clientId` 和 typed RPC result 是权威事实。队列不得从 DOM、Toast、文本内容、Promise 完成先后或 `activeTurnId == null` 的表象猜测 turn 结果。

### 显式结果

每次 Interface 调用必须返回可区分的结果。至少区分：

- applied；
- queued；
- claim issued；
- recovery produced；
- idempotent replay；
- stale observation；
- invalid input；
- duplicate identity；
- ownership mismatch；
- delivery unknown。

禁止用单纯的 unchanged state 同时表达这些情况。

## Deep Module seam

Module 名称使用 `ComposerInputQueue`。它位于以下 seam：

```text
Composer intent / queue management command
  → ComposerInputQueue
      → performStart(StartClaim)
      → performSteer(SteerClaim)
      → recover(RecoveryBatch)
  → caller-owned GuiHostCommands execution
  → typed settlement / threadRuntime observation
  → ComposerInputQueue
```

依赖类别是 in-process：Module 只做确定性的内存状态转换，不执行 I/O，不需要 transport port 或 mock Adapter。

seam 外的 Adapter 负责：

- 把 `StartClaim` 转换为 `commands.startTurn(...)`；
- 把 `SteerClaim` 转换为 `commands.steerTurn(...)`；
- 把 typed RPC result 或 failure classification 转换为 settlement；
- 把 thread projection event 转换为 runtime observation；
- 消费 recovery batch，但不把其呈现方式反向塞进队列 Module。

## Interface

以下 TypeScript 只表达 Interface 形状，不是最终源码或 implementation plan：

```ts
type ComposerQueueMessage = Readonly<{
  id: string;
  text: string;
}>;

type ComposerInputIntent = "queue" | "steer";

interface ComposerInputQueue {
  submit(input: SubmitInput): QueueTransition;
  settle(settlement: ClaimSettlement): QueueTransition;
  observe(observation: RuntimeObservation): QueueTransition;
  manage(command: QueueManagementCommand): QueueTransition;
  view(): ComposerInputQueueView;
}
```

状态字段不属于 public Interface。caller 只能通过命名 transition 和只读 view 使用 Module，不能直接改数组、phase、turn identity 或 Undo。

`QueueTransition` 返回新的可观察结果和零个或多个 effect：

```ts
type QueueEffect =
  | { type: "performStart"; claim: StartClaim }
  | { type: "performSteer"; claim: SteerClaim }
  | { type: "recover"; batch: RecoveryBatch }
  | { type: "report"; problem: QueueProblem };
```

一个 transition 最多产生一个新的 start claim。`Interrupted` transition 不得产生 start claim。

## Claim 与 pending start

`StartClaim` 和 `SteerClaim` 是 opaque、不可变、只能 settle 一次的 capability。claim 携带执行 RPC 所需的消息与身份，但不是第二个消息 owner。

`pendingStart` 具有明确 phase：

```text
issuing
  → acceptedAwaitingStart
  → server-owned

issuing
  → definitelyNotAccepted
  → recovery-owned

issuing / acceptedAwaitingStart
  → deliveryUnknown
```

规则如下：

- 同一时刻最多存在一个 start claim；
- claim 发出时，消息已经离开 ordinary/rejected queue；
- caller 必须把同一个 claim 连同 settlement 交回；
- RPC accepted 后仍保留 single-flight，直到 `turnStarted`、匹配 terminal observation 或其他权威 server 事实收敛；
- `deliveryUnknown` 禁止自动重发，避免 server 已接受但 response 丢失时产生重复消息；
- `deliveryUnknown` 是请求生命周期，不是用户可见 paused mode。

## 普通排队流程

### active turn 存在

`submit({ intent: "queue" })` 把消息追加到 ordinary queue 队尾，并记录当前权威 active turn 对 FIFO 的阻塞关系。队列不调用 RPC。

### 当前 idle

若没有 active turn、pending start 或 delivery unknown，`submit({ intent: "queue" })` 可以直接产生一条 start claim，等价于 TUI 在 idle 时直接提交当前消息。

### 自动 drain

每次合法 drain 按以下顺序选择：

1. rejected steers；
2. ordinary queued messages。

多个 rejected steers 沿用 TUI 语义，按 FIFO 组成一个 start claim；每条消息在 claim 中仍保持独立边界。ordinary queue 每次只取一条，产生 claim 后立即停止 drain。

## Steer 生命周期

active turn 存在时，`submit({ intent: "steer" })` 产生 `SteerClaim`，同一条消息进入 pending steer owner。

settlement 与 observation 规则：

- RPC accepted：消息继续由 pending steer claim 持有，不能仅凭 Promise 成功认定 committed；
- projection 出现相同 `clientUserMessageId` 的 `userMessage.clientId`：所有权转给 server，并移除对应 pending steer；
- typed non-steerable rejection：同一消息转移到 rejected steer 队尾；
- typed no-active：同一消息转换为 start claim；
- expected-turn mismatch：使用 server 报告的 actual turn ID 对同一 claim 做受限重试，消息 owner 不变；
- 明确的其他 rejection：消息转为 recovery result；
- transport/decode 等不确定结果：消息进入 delivery unknown，不得自动复制或重发。

GUI 使用消息自身的 `id` 作为 `clientUserMessageId`，并用 committed `userMessage.clientId` 关联确认，不复制 TUI 的文本 compare key。

## Terminal outcome

### `completed`

- 结束匹配 turn 对 FIFO 的阻塞关系；
- 尚未 committed 的 pending steers 转为 rejected steers，避免 server 已结束 turn 后本地消息失去 owner；
- 按 rejected-first 规则尝试产生一条 start claim。

### `failed`

- 使用与 `completed` 相同的本地所有权收束；
- 当前 turn 的失败只结束当前 turn；
- 剩余 FIFO 自动继续；
- 不创建 paused 或 Continue 语义。

### `interrupted`

常规 `Interrupted` 原子执行：

1. 收集 rejected steers；
2. 收集 pending steers；
3. 收集 ordinary queued messages；
4. 保持每个 owner 内的 FIFO 和每条消息的独立边界；
5. 生成一个 recovery batch；
6. 清空上述本地 owner；
7. 不产生 start claim。

composer draft 仍由 Composer 持有，不进入该 recovery batch。未来 UI 可以决定如何呈现或合并 recovery，但不能要求队列提前丢失消息边界。

TUI 的“Esc 且存在 pending steers 时立即合并重提”属于交互层特殊路径，本次纯队列设计不包含它。

## 请求失败与恢复

### 明确未接受

当 start claim 被 server 明确拒绝时：

- claim 中消息转移到 recovery batch；
- pending start single-flight 被释放；
- 当前失败消息不在同一 transition 中自动重试；
- 剩余 FIFO 可以继续选择下一条；
- caller 获得明确 problem/recovery result，不得静默丢失当前消息。

### 结果不确定

当 transport、decode、connection loss 或进程边界导致无法证明 server 是否接受时：

- claim 保持唯一 owner；
- phase 变为 delivery unknown；
- 自动 drain 停止；
- 后续 committed message、turn observation 或连接恢复事实可以收敛该状态；
- 没有权威证据前不得通过普通 retry 重发。

这种行为解决的是“不重复”和“不丢失”的根因，不是通过吞掉异常隐藏问题。

## 队列管理

纯队列 Module 可以提供 `edit`、`delete`、`clear` 与 `undo` domain command，但不定义对应页面或控件。

这些 command 只作用于 ordinary queued messages：

- pending steer、rejected steer、start claim 和 delivery unknown 中的消息不可编辑或删除；
- edit 不改变 FIFO 位置；
- delete 和 clear 是用户明确授权的消息移除，可以产生一次性 Undo；
- Undo 不受固定容量影响；
- 后续 membership mutation 会明确使旧 Undo 过期；
- 空文本、未知 ID、locked owner、重复 Undo 或过期 Undo 必须返回明确结果。

不提供拖动排序、任意插入位置、从中间项开始执行或批量编辑。

## 内部状态约束

具体 state type 属于 implementation，但必须能证明：

- ordinary、pending steer、rejected steer 各自严格 FIFO；
- message ID 在所有本地 owner 中唯一；
- 一个消息不能同时存在于 queue 与 claim；
- start claim 同时最多一个；
- pending start 与自动 drain 互斥；
- stale claim、旧 turn completion 和重复 settlement 不能覆盖新事实；
- exact replay 可显式幂等，identity mismatch 必须显式拒绝；
- `Interrupted` 的 recovery 与 queue 清空属于同一个原子 transition；
- 无固定条数上限；
- 单条文本仍服从 `MAX_USER_INPUT_TEXT_CHARS = 1 << 20`；
- 运行时资源耗尽作为真实异常传播，不能伪装成成功或合法 no-op。

## Queue view

只读 view 只暴露 caller 与未来 UI 真正需要的信息：

- ordinary queued messages 的稳定顺序；
- pending/rejected/recovery-unknown 的数量或明确状态；
- 哪些 ordinary item 当前允许 edit/delete；
- 是否存在 pending start 或 delivery unknown；
- 当前 Undo 是否可用。

view 不暴露 claim nonce、内部 phase 转换表、历史 commit 去重结构或可变数组引用。

## 验证设计

测试通过同一个 public Interface 驱动完整序列，不直接断言 implementation 字段。

必须覆盖：

1. active turn 中入队，匹配 completion 后只产生一个 start claim；
2. 多条 ordinary message 保持 FIFO，start single-flight 期间不重复 drain；
3. rejected steers 优先于 ordinary queue；
4. steer accepted 后保持 pending，直到匹配 `userMessage.clientId` committed；
5. non-steerable、no-active 与 mismatch 均移动同一条消息，不复制 draft；
6. `Failed` 后继续下一条，不进入 paused；
7. `Interrupted` 按 `rejected → pending → queued` 生成 recovery、清空 owner 且不产生 outbound claim；
8. 明确 start rejection 返回 recovery，剩余 FIFO 不丢失；
9. delivery unknown 保留唯一 owner 并阻止自动重发；
10. duplicate message ID、重复 settlement、stale completion 和错序 observation 返回明确结果；
11. edit/delete/clear/undo 不作用于 locked owner，不产生容量竞态；
12. 长事件序列结束后，每条未被用户删除的消息仍恰有一个 owner。

验证以消息守恒、FIFO、single-flight 和显式结果为断言，不再测试 20 条硬上限、capacity reservation、paused/Continue 或被删除的旧 reducer 行为。

## 方案比较与选择

评估过三种 Interface：

- 单入口 actor：方法数量最少，但 `QueueSignal` 会形成庞大的隐式事件协议，caller 容易传入无效组合；
- 通用 `dispatch + snapshot`：扩展性高，但泛型 payload 与公开 snapshot 会提前扩大当前纯文本范围并泄漏 implementation；
- claim/capability：用不可重复 settle 的 claim 表达出队 owner，常见调用直观，同时把 single-flight、失败恢复和迟到结果隐藏在 Module 内。

本设计采用 claim/capability 方案，并吸收 actor 方案对 delivery unknown 的显式表达。该组合在 Interface depth、locality 和 seam placement 上最符合当前代码。

## 非目标

- 不设计 ButtonGroup、Dropdown、队列列表、Dialog、Toast、快捷键或文案。
- 不决定 recovery batch 在 GUI 中如何展示或写回 composer。
- 不处理页面刷新、URL 切换、对话切换、GUI 重启或持久化。
- 不建立 GUI 与 TUI 的跨客户端全局 FIFO、优先级或 lease。
- 不修改 app-server/core protocol，也不新增 server-side queue RPC。
- 不复制、读取或修改 TUI 本地 queue。
- 不引入图片、音频、文件或其他新输入类型；当前 message 仍是纯文本。
- 不处理 TUI 的 Esc 特殊交互。
- 不创建 implementation plan，不修改产品代码。

## 验收标准

设计被满足时，应能从 public Interface 与序列测试证明：

- 用户消息不会因 capacity、rejection、late result、completion 或 connection failure 静默消失；
- 同一消息不会同时由两个 owner 持有；
- ordinary FIFO 和 rejected-first 顺序稳定；
- `Failed` 自动继续，`Interrupted` 产生 recovery 且停止自动执行；
- delivery unknown 不被误判为 definite failure；
- caller 无需理解内部 queue 数组、phase 组合或 Undo 存储即可正确驱动 Module；
- UI、transport、runtime fact 与 queue ownership 仍由不同 owner 承担。

## 后续门禁

本文档落盘后仍处于设计阶段。用户明确确认设计之前，不得创建或更新 implementation plan；计划被明确确认之前，不得修改产品代码、测试、生成物或配置。
