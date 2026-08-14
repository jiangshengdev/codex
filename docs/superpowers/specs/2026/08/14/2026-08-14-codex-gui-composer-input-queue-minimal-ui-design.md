# Codex GUI Composer 输入队列最小交互设计

状态：已确认

日期：2026-08-14

## 主目标

为已经完成的 `composerInputQueue` 纯数据 Module 增加最小可达用户交互，只满足消息排队需求：当前 turn 运行期间，用户仍可提交纯文本消息；消息按 ordinary FIFO 等待并自动开始；界面只展示必要的队列数量和恢复入口。

本设计不把“数据 Module 已完成”误写成“产品功能已完成”。当前仍缺少 Composer、command、runtime 与队列之间的生产接线，这些接线是实现本交互的必要组成部分。

## 当前代码证据

### 数据 Module 已完成但没有生产调用方

`codex-gui/src/features/composerInputQueue/composerInputQueue.ts` 已实现 499 行纯内存 Module：

- 公开 `createComposerInputQueue({ activeTurnId })`；实例只公开 `submit`、`settleStart`、`observe`。
- ordinary FIFO、唯一 owner、不可伪造 `StartClaim` 与 single-flight 已由 Module 负责。
- `completed` 和 `failed` 会自动 drain FIFO 队首一条。
- `interrupted` 会把仍由 ordinary owner 持有的消息按原顺序转移到 `RecoveryBatch`，且不自动继续。
- start `definitelyNotAccepted` 会为当前 claim 生成 `RecoveryBatch`，释放 single-flight，再继续其余 FIFO。
- `deliveryUnknown` 会保留 owner 并阻塞 drain，直到权威 runtime/commit 事实收敛；不得由界面猜测重试。

当前 `codex-gui/src` 中没有该 Module 的生产调用方，也没有 effect runner、runtime adapter 或 UI snapshot。现有单元测试只能证明数据不变量，不能证明 GUI 可达。

### Composer 当前无法排队

`codex-gui/src/features/composerTurnControl/ComposerTurnControl.tsx` 当前在 `submit` 中直接调用 `commands.startTurn`。`composerTurnControlModel.ts` 的 `canSend` 又要求 `activeTurnId == null`，因此 active turn 存在时发送按钮被禁用。

要实现消息排队，不能只增加展示组件；提交入口必须改为经过队列 Module，并补齐 `performStart`、start settlement 和 runtime observation 的生产接线。

### 当前 Module 没有 UI 投影

Module 故意没有 `view`、`getState`、订阅或管理入口。React 无法读取 ordinary 队列数量。若界面持续显示 `已排队 N 条`，必须由同一权威 Module 提供最小只读投影，不能在 React 或 Redux 中复制第二份消息列表或状态机。

## 已确认的产品决策

### 正常排队反馈

用户选择只持续显示排队数量：

- 显示 `已排队 N 条`。
- 不展示排队消息内容。
- 不提供编辑、删除、排序、清空、暂停或 Undo。

`N` 表示仍在 ordinary FIFO 中等待发送的消息数。已经进入当前 `StartClaim` 的消息不计入 `N`，避免把“正在发起 start”描述成“仍在排队”。

### interruption 恢复

用户停止当前运行并使 ordinary 消息进入 `RecoveryBatch(reason: "interrupted")` 后：

- 不自动恢复或继续发送。
- 显示 `N 条消息尚未发送`。
- 提供一个 `继续发送` 按钮。
- 用户点击后，按 `RecoveryBatch.messages` 的原 FIFO 顺序整体恢复并继续。

恢复批次不覆盖当前 Composer 草稿，也不把未提交消息写入 transcript。

### recovery 存在时的普通发送

同一时刻只允许一个 recovery owner。存在尚未处理的 `RecoveryBatch` 时：

- 普通发送暂时禁用，避免新消息再次产生第二个 recovery batch。
- TextArea 保持可编辑，用户草稿不被清空或覆盖。
- 用户必须先点击 `继续发送`；批次按原顺序交回队列 owner 后，普通发送恢复可用。

不支持多个 recovery batch，也不定义批次合并、覆盖或跨批次排序。

## 最小用户交互

### 提交

Composer 继续复用现有 `TextArea` 和主发送按钮，不增加 split button 或第二种提交模式。

- connection 可用、草稿非空且没有正在处理同一次提交时，发送可用，不再因 `activeTurnId != null` 而禁用。
- 存在 recovery batch 时发送禁用，但 TextArea 保持可编辑。
- 用户按 Enter 或点击 `发送`，当前草稿提交给队列 Module。
- idle submit 由 Module 产生 `performStart`；active turn、pending start 或已有 ordinary 消息时，Module 将消息追加到 FIFO。
- Module 接受该消息后才清空与本次提交完全相同的草稿；用户在异步期间继续编辑的新草稿不得被覆盖。
- busy submit 成功进入 FIFO 后，队列数量立即更新。

### 持续状态

在现有 Composer `Surface` 内、输入区和操作栏之间显示 HeroUI v3 `Chip`：

- ordinary count 大于零时显示 `已排队 N 条`。
- ordinary count 为零时不显示 Chip，不保留空占位。
- Chip 只承担持续状态展示，不可点击，也不承载瞬时错误。
- 不新增独立 Card、Modal、队列抽屉或 transcript item。

### 恢复状态

存在未处理的 `RecoveryBatch` 时，在同一 Composer `Surface` 内显示紧凑恢复提示：

- 文案为 `N 条消息尚未发送`。
- HeroUI `Button` 文案为 `继续发送`，使用普通主操作语义，不使用 destructive 或 danger variant。
- 点击一次后，协调层按原顺序重新提交整个批次；成功交回队列 owner 后关闭该恢复提示。
- 恢复执行期间按钮禁用，防止重复恢复。
- 恢复与普通草稿彼此独立：恢复不读取、不清空、不替换 TextArea。

同一时刻只持有一个 recovery batch。协调层必须在 recovery 存在时拒绝普通 submit；恢复批次交回 queue owner 后，才重新开放普通 submit。若内部 effect 链在没有新用户 submit 的情况下仍产生第二个 batch，必须停止实现并回到设计，而不是合并、覆盖或丢弃批次。

## 状态与所有权设计

### 单一权威 owner

`composerInputQueue` 继续是 queue message、ordinary FIFO、pending start 与 active turn 协调语义的唯一 owner。React 只消费从该 Module 导出的只读 UI 投影，不保存可独立变化的队列副本。

最小投影只需要表达：

```ts
type ComposerInputQueueView = Readonly<{
  queuedCount: number;
}>;
```

具体方法名和通知机制属于实现细节，但必须满足：

- 投影由 Module 内部权威状态直接产生。
- 不暴露 ordinary 消息数组或 `StartClaim`。
- 不允许调用方通过投影修改状态。
- count 在每个 transition 完成后与 owner 转移保持一致。

### 薄协调层

新增 Composer queue 协调层，负责把现有边界连接起来：

```text
Composer submit
  → composerInputQueue.submit
  → performStart effect
  → commands.startTurn
  → settleStart
  → projection facts / observe
  → terminal 后下一条 performStart
```

协调层负责：

- 为 Composer 消息生成稳定的本地 message id。
- 持有与当前 thread 绑定的 queue 实例。
- 顺序消费 Module 返回的 effects。
- 将 `performStart.claim` 映射为现有 `turn/start` 参数，包括 Module 生成的 `clientUserMessageId`。
- 将 command 结果分类并回送 `settleStart`。
- 将权威 projection 事件机械映射为 `RuntimeObservation` 并调用 `observe`。
- 持有已经从 Module 转移出来的 `RecoveryBatch`，向 Composer 提供恢复状态与恢复命令。
- 若同一 transition 在 `recover` 后还返回 `performStart`，在 recovery 处理完成前暂缓该 start effect；不得提前启动、丢弃或改写 claim。
- 在 transition 后发布最小只读 UI 投影。

协调层不得实现第二套 FIFO、owner、重试、terminal 判定或 delivery-unknown 超时。

### thread 生命周期

队列实例只属于页面启动时固定的 `launchParams.threadId`。当前产品路径在一个页面生命周期内没有切换到另一 thread 的入口；replacement attach 仍须匹配该固定 identity，不匹配的 attach 不得替换 queue owner。

页面刷新、跨页面、跨 thread、跨客户端与进程重启恢复均不在本次范围。cleanup 后到达的旧 command settlement 或 projection event 必须失效，且不得触发新 start；本设计不把旧 thread 消息转移给其他 thread。

## start settlement 与错误语义

`turn/start` 成功返回时，使用响应中的权威 turn identity 构造 `accepted`。失败不能一律映射为“确定未接收”：

- 只有 transport 能证明请求未被接受时，才构造 `definitelyNotAccepted`。
- 请求可能已经发出但响应未知时，必须构造 `deliveryUnknown`，继续阻塞 FIFO 并等待 projection/commit 事实。
- RPC、缺失结果、畸形结果、send、unavailable 等现有 transport failure source 如何落入上述两类，必须由 command/transport 证据逐项确定，不能在 UI 中用一个 catch 猜测。

`definitelyNotAccepted` 产生的 `RecoveryBatch` 也必须由相同 recovery owner 安全保存，不能 toast 后丢弃。首批复用同一个 `N 条消息尚未发送` 与 `继续发送` 入口，避免为 recovery reason 建立第二套交互；错误原因仍可通过现有 toast 提示，但 toast 不是消息 owner。

`deliveryUnknown` 首批不增加专用可操作 UI、不提供重试按钮，也不静默恢复。若持续状态需要用户可见提示，应在计划阶段限定为不可操作的连接/发送状态，不能改变数据语义。

## 协议与契约边界

- `Turn`、`TurnStartParams`、`ThreadItem`、`ThreadProjectionEventNotification` 等协议事实继续以 `@codex-protocol/v2` 生成类型为权威来源。
- runtime adapter 通过 `Extract`、索引访问或 `Pick` 等机械方式派生所需字段。
- 禁止在 Composer、协调层或 Redux 中手写协议 union、重复 settlement 字符串集合或复制 `StartClaim` 形状。
- 不新增 app-server RPC，不修改 server-side queue 语义。
- queued message 在权威 commit 前不得进入 transcript、projection snapshot 或 runtime record。

## HeroUI 与视觉层级

- 复用现有 Composer 的 HeroUI `Surface` 和 `TextArea`。
- 普通排队状态使用 HeroUI `Chip`，采用低强调的 default/secondary 或 soft 语义 token；最终 variant 按现有 Composer 视觉层级在实现时确定。
- `继续发送` 使用 HeroUI `Button` 和 `onPress`，作为恢复区的唯一主操作。
- 不使用硬编码颜色，不新增独立强色状态面板。
- 恢复区与普通 queue count 都位于 Composer 内，不改变 transcript 的 chunk 或渲染边界。

## 国际化与可访问性

- JSX 文案使用 `Trans` 或 `Plural`；属性、toast 与非 JSX 字符串使用 `useLingui`。
- 数量文案必须使用 Lingui plural，而不是字符串拼接，确保英语与其他语言的单复数可翻译。
- 中文目标文案：`已排队 N 条`、`N 条消息尚未发送`、`继续发送`。
- queue count 作为持续状态可被辅助技术读取；恢复提示与按钮需要明确关联，不能只靠颜色表达状态。
- 提交后焦点保持在 TextArea；显示或更新 Chip 不抢焦点。
- 恢复完成后不强制移动焦点，避免打断正在编辑的新草稿。

## 验证边界

### 数据 Module

补充或调整定向测试以证明：

- `queuedCount` 只统计 ordinary FIFO。
- busy submit 增加 count。
- terminal drain 把队首转成 claim 时减少 count。
- interruption 清空 ordinary count 并产生保持原顺序的 recovery batch。
- 投影只读且不暴露消息内容。

### 协调层

验证：

- 一个 transition 中 effects 按顺序且各执行一次。
- `performStart` 使用 claim 的 message 和 `clientUserMessageId`。
- command settlement 与 projection observation 回到同一个 queue owner。
- `completed` / `failed` 只启动下一条。
- `deliveryUnknown` 不重试、不 drain。
- recovery batch 在用户点击前保持 owner；点击后按原 FIFO 顺序回交，重复点击不重复提交。
- recovery 存在时普通 submit 被拒绝，但草稿仍可编辑；恢复完成后普通 submit 重新可用。
- thread identity 改变时不会把旧消息提交到新 thread。

### Browser 纵向路径

更新现有 Composer Browser 测试，并至少覆盖：

- active turn 期间输入纯文本，发送按钮可用。
- 提交后草稿清空并显示 `已排队 1 条`。
- 再提交一条后显示 `已排队 2 条`。
- 收到当前 turn 的 terminal projection event 后，只发起队首一次 `turn/start`，count 相应减少。
- interruption 后显示 `N 条消息尚未发送`，不会自动发起下一条。
- 点击 `继续发送` 后按原顺序恢复，且不覆盖当前草稿。
- recovery 提示存在时发送按钮禁用、TextArea 仍可编辑；恢复交回队列后发送重新可用。

测试断言稳定的用户行为和可访问文本，不锁定 padding、gap、颜色或 Chip 的具体视觉数值。

## 明确排除

- steer、guide 或 `turn/steer`。
- 排队消息内容列表或摘要。
- 编辑、删除、清空、拖动、排序、Undo。
- 暂停/继续普通队列；`继续发送` 只处理明确的 recovery batch。
- 固定容量或 20 条上限。
- 附件及混合 `UserInput`。
- 队列持久化、localStorage、刷新恢复、跨页面、跨 thread、跨客户端或跨进程恢复。
- queued message 的 optimistic transcript append。
- delivery-unknown 超时、猜测重试或静默 fallback。
- 新增协议 RPC、server-side queue 或兼容双路径。

## 完成标准

本设计完成后的产品结果是：用户可在当前 turn 运行时连续提交纯文本消息，界面持续显示等待数量；正常 terminal 后消息按 FIFO 自动开始；停止导致未发送消息被回收时，用户看到一个整体恢复入口，消息不会静默丢失。

只有 Browser 纵向测试证明 `Composer → queue → command → runtime → next-start/recovery` 可达后，才能称消息排队产品功能完成。纯 Module 单测、静态 Chip 或未消费的 effects 均不足以满足完成标准。
