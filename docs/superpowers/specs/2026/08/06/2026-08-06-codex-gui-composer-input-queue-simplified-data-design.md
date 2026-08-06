# Codex GUI Composer 输入队列简化数据设计

状态：设计已确认

日期：2026-08-06

## 目标

第三版是第二版的简化落地设计，不推翻第二版已经确认的产品决策。第二版的问题是一次性实现的内部复杂度过高，而不是产品决策错误。

本设计保留第二版对消息所有权、异步 identity、start settlement、terminal outcome 和 recovery 的正确性约束，只截取 ordinary next-turn queue 的最小数据闭环。首批不预实现 steer、队列管理、UI 或真实接线所需的未来状态。

## 代码证据与问题判断

### 第一版：公开 reducer，但 identity 和失败语义不足

提交 `584f505c8` 新增了 `codex-gui/src/features/composerTurnControl/composerMessageQueue.ts`，生产文件共 248 行：

- `composerMessageQueueReducer`、state、action 和 selector 均公开导出，是一个公开 reducer（第 3-65、161-248 行）。
- 正在启动的消息仅由 `startingItemId: string | null` 表示，start 成败也只携带 `itemId: string`，异步回调依赖可复用字符串 identity（第 16-23、36-39、170-193 行）。
- `failed` 与 `interrupted` 都把队列切换到 `paused`（第 116-139 行）。
- reducer 没有 command caller、runtime adapter 或 effect runner；提交只包含 reducer 及其测试，没有真实 GUI 接线。

第一版证明了 FIFO reducer 可以保持较小，但没有充分表达异步请求所有权，也把 `failed` 和 `interrupted` 合并成了同一种暂停行为。

### 第二版：修正 identity，但纯 Module 过深

提交 `9859a755f` 完成了 `codex-gui/src/features/composerInputQueue/composerInputQueue.ts`，生产文件共 1078 行：

- 使用不可伪造的 `StartClaim`、`SteerClaim`、`SteerAttempt` 对象 identity，并分别保存 settlement、runtime fact 与 commit fact（第 3-29、157-193、263-287 行）。
- `RecoveryBatch` 和 `recover` 是纯数据 effect，不包含 React、Redux 或 UI 行为（第 31-43 行）。
- Module 同时实现 ordinary queue、steer retry/rejection、delivery unknown、terminal recovery、edit/delete/clear/undo 和 view（第 145-150、442-665、983-1075 行）。
- 生产代码直接依赖 Redux slice 导出的 `ThreadRuntimeLiveTurnCompletion`（第 1、129-137 行），扩大了数据 Module 与应用状态层之间的耦合。
- 该实现同样没有真实 command caller、runtime adapter 或 effect runner；三个生产提交只建立了纯 TS Module 及测试，没有让功能在 GUI 中可达。

第二版修正了第一版的 owner 和异步 identity 根因，但把 steer、ordinary queue、recovery 和 management 的最终状态一次性实现，导致纯 Module 复杂度过高。第三版应保留其语义约束，通过缩小首批范围解决复杂度，而不是退回第一版的字符串请求 identity。

## 已确认边界

- 只做数据，不做界面。
- 第二版的产品决策优先；第三版仅简化首批落地范围。
- 首批只包含 ordinary next-turn queue；steer 整体延期。
- 队列没有固定容量上限。
- `failed` 释放当前 turn，并自动继续 FIFO 队首一条。
- `interrupted` 将仍由本地持有的消息生成一个纯数据 `RecoveryBatch`，且不自动执行下一次 start。
- start `definitelyNotAccepted` 为该 start claim 的消息生成 `RecoveryBatch`，释放 single-flight，再让剩余 FIFO 继续。
- 页面切换、页面刷新和持久化均不是首批目标。
- 首批不包含 React、Redux、UI、effect runner 或真实 command/runtime adapter，因此不声称产品功能已经可达。

## 首批数据语义

### 消息与 ordinary FIFO

`ComposerQueueMessage` 至少包含稳定的本地 `id` 与 `text`。`ordinary` 保存仍由本地 queue owner 持有的消息，顺序就是后续 start 顺序。

队列无固定容量上限。空白消息属于无效输入；相同 identity 在本地仍持有期间不得再次进入队列。

### 唯一 owner 与 known identity

每条消息在任一时刻只能有一个 owner：

- ordinary FIFO；
- 当前 `StartClaim`；
- server/runtime 已确认接管；
- `RecoveryBatch`；
- 已从本地数据结构明确释放。

内部维护 known identity，用于拒绝重复提交并验证 owner 守恒。identity 只有在 server/runtime 明确接管、消息进入 recovery 或消息被明确释放时才可从本地 owner 集合移除。不能用文本相等推断消息归属。

### active turn 与单一 pending start

`activeTurnId` 表示当前阻塞 ordinary drain 的权威 active turn。任一时刻最多存在一个 `pendingStart`，从而保证 single-flight。

`pendingStart` 有三个阶段：

- `issuing`：已发出 `performStart`，尚未获得 settlement；
- `acceptedAwaitingStart`：command 已接受并给出 turn identity，但仍等待匹配的 runtime start、commit 或 terminal 事实完成交接；
- `deliveryUnknown`：command 是否被接收未知，本地必须继续持有 owner 并阻塞自动 drain，直到权威 runtime/commit 事实使状态收敛。

首批 `StartClaim` 只持有一条 `message`。第二版的 `messages[]` 是 rejected steer 批量回退 ordinary start 所需；steer 延期后，ordinary drain 每次只启动一条，无需保留批量 start 形状。

### 乱序事实与有界分类

runtime observation 和 `userMessageCommitted` 可以先于 start settlement 到达。内部必须把先到达的事实绑定到准确的 `StartClaim`，不能仅绑定可复用字符串，也不能覆盖属于另一个 turn 或 claim 的事实。

内部保留有界的最近 settlement、terminal 和 commit identity，用于把输入分类为：

- exact replay：同一 identity 与同一事实的重复到达；
- stale：已失效、迟到或与既有结果冲突的事实；
- foreign/ownership mismatch：事实不属于当前 owner。

这些记录必须有硬边界；不能为了历史判定无限累积 runtime 事件。

### RecoveryBatch

`RecoveryBatch` 是纯数据：包含 recovery 原因和按原顺序排列的 `messages[]`。数组必须保留每条消息的 identity 与边界，禁止为了方便 consumer 而合并文本。

`recover` effect 只表示本地 owner 已原子地转移到 recovery consumer。首批不定义 consumer 如何保存、展示、重新入队或恢复到 Composer。

## 小而深的公开 Interface

Module 只公开四个入口：

```ts
createComposerInputQueue({ activeTurnId })
submit(message)
settleStart(settlement)
observe(observation)
```

每个入口返回：

```ts
type Transition = Readonly<{
  result: Result;
  effects: readonly Effect[];
}>;
```

首批 effect 只有：

```ts
type Effect =
  | Readonly<{ type: "performStart"; claim: StartClaim }>
  | Readonly<{ type: "recover"; batch: RecoveryBatch }>;
```

caller 只需要知道四个入口、effect 的消费责任，以及 ordering/error invariants。owner 集合、claim capability、single-flight、乱序事实归并和 replay/stale/foreign 分类全部隐藏在 Module 内部。

首批不保留以下空扩展点：

- `submit({ intent: "queue", ... })`；只有 ordinary submit，不需要 intent。
- steer 相关类型、入口或 effect。
- `manage`、`view` 或 management capability。
- 为未来 adapter、consumer 或兼容路径预留的 optional callback。

## 协议权威契约

协议事实的权威来源是 `@codex-protocol/v2` 生成类型，例如 `Turn`、`ThreadProjectionEventNotification` 及其事件成员。frontend domain type 只表达 queue 自身语义，不手写复制协议 union。

当 queue 只需要协议类型的部分字段时，使用 TypeScript 的索引访问、`Extract`、`Pick` 等方式从权威生成类型机械派生。例如 terminal status、turn identity 和 projection event payload 都应从生成类型导出，而不是重新声明一个可能漂移的字符串 union。

数据 Module 不依赖 Redux slice 的 `ThreadRuntimeLiveTurnCompletion`。Redux 或 projection ingress 若需要把协议事件映射为 `observe` 输入，该映射属于后续真实 adapter 的职责；首批 Module 的输入类型仍从协议权威类型机械派生。

## Transition 语义

### Submit

#### Idle submit

当 `activeTurnId == null`、没有 `pendingStart` 且 ordinary 为空时：

- 校验消息非空且 identity 未被本地持有；
- 创建只持有该消息的不可伪造 `StartClaim`；
- `pendingStart` 进入 `issuing`；
- 返回一个 `performStart` effect。

同一 submit 只能产生一次 start claim。

#### Busy submit

当存在 active turn、pending start 或已有 ordinary 消息时：

- 新消息追加到 ordinary FIFO 尾部；
- 不产生 outbound effect；
- 不改变当前 active/pending owner。

### Start settlement

#### Accepted

`accepted` 必须携带原 `StartClaim` 和权威 turn identity。

- 若匹配的 `turnStarted`、`userMessageCommitted` 或 terminal observation 已先到达，立即按该事实完成 owner 交接或 terminal 处理。
- 否则进入 `acceptedAwaitingStart`，继续保持 single-flight。
- settlement 的 exact replay 不重复交接、不重复 drain。
- foreign claim、冲突 settlement 或错误 turn identity 只返回分类结果，不改变当前 owner。

#### Definitely not accepted

- 只有当前 `issuing` claim 的匹配 settlement 可以生效。
- 将 claim 的单条消息转移到 `RecoveryBatch(reason: "startDefinitelyNotAccepted")`。
- 释放该 pending start 的 single-flight 与本地 queue identity。
- 若 ordinary 非空，立即只为队首一条产生新的 `performStart`。
- recovery 与下一次 start 可以出现在同一个 transition 的 effects 中，但消息 owner 不得重叠。

#### Delivery unknown

- `pendingStart` 进入 `deliveryUnknown`，继续持有 claim 与消息 owner。
- ordinary drain 保持阻塞。
- 匹配的 runtime start、commit 或 terminal 事实可以使其收敛到已被 server 接管或已完成。
- 缺少权威事实时，不得自动 recovery、重试或启动下一条。

### Runtime observation

#### turnStarted

- 与 `acceptedAwaitingStart` 的 turn identity 匹配时，pending owner 转移为 active owner，释放本地消息 identity。
- 在 `issuing` 或 `deliveryUnknown` 期间先到达时，事实绑定当前 claim 暂存，等待 settlement 或 commit 归并。
- 与当前 owner 不匹配的 turn 不得替换 active/pending 状态。

#### userMessageCommitted

- observation 通过消息的 client identity 与 turn identity 证明 server 已接管该 start 消息。
- 在 settlement 前到达时，事实绑定当前 claim 暂存。
- 在 `deliveryUnknown` 期间到达时，解除未知交付状态，并结合已暂存的 runtime fact 决定进入 active 还是直接处理 terminal。
- 重复 commit 只做 idempotent replay 分类；相同 commit identity 指向不同消息或 turn 时属于 ownership mismatch。

#### turnCompleted: completed

- 只有与 active/pending owner 匹配的 terminal 可以生效。
- 释放匹配的 active/pending turn owner。
- 记录 terminal identity，防止重复 completion 再次 drain。
- ordinary 非空时，只为 FIFO 队首一条产生 `performStart`。

#### turnCompleted: failed

处理与 `completed` 相同：释放匹配 owner，并只 drain FIFO 队首一条。`failed` 不暂停队列，也不生成 recovery。

#### turnCompleted: interrupted

- 释放匹配的 active/pending turn owner。
- 将所有仍由 ordinary 本地持有的消息按 FIFO 顺序原子地转移到一个 `RecoveryBatch(reason: "interrupted")`。
- 清空这些消息的 queue owner。
- 只产生 `recover` effect，不产生 `performStart`。
- 若没有本地消息需要恢复，只记录 terminal，不产生空 recovery effect。

#### 不匹配、重复与迟到 observation

- exact replay 返回 idempotent 分类，不重复 effect。
- 已由更新事实取代的 observation 返回 stale。
- 与当前 claim/turn/commit owner 冲突的 observation 返回 ownership mismatch。
- 任何分类结果都不得为错误 owner 释放 identity、清空队列或触发 drain。

## 整体延期范围

下列能力整体延期，不属于首批 Module：

- 全部 steer claim、attempt、pending、rejected、order、retry、expected-turn mismatch 和 steer delivery-unknown 状态与 transition；
- edit、delete、clear、undo，以及 `manage`、management view 和 undo record；
- UI、React、Redux、effect runner、真实 command caller 和 runtime adapter；
- recovery consumer；
- 持久化、页面切换恢复、刷新恢复和跨 thread 数据迁移；
- 附件及附件 owner/recovery 语义。

延期不等于取消第二版的最终产品语义。未来扩展必须重新以当时的真实 caller 和协议事实为证据接入；首批不预埋兼容层、双路径、空 Interface、adapter 占位符或未来状态字段。

## 深 Module 与 seam

这个 Module 的深度来自小 Interface 背后的正确性约束，而不是公开更多状态：

- caller 只知道 submit、start settlement、runtime observation 和 effects；
- Module 隐藏 owner 守恒、identity capability、single-flight 和乱序归并；
- ordering invariant 保证 ordinary FIFO 不越过 pending/active owner；
- error invariant 保证 foreign、stale 和 replay 输入不会改变权威状态；
- `recover` 只是数据 effect，是 owner 转移 seam，不包含 recovery consumer 的产品语义。

因此首批 seam 位于“数据状态机决定 effect”和“外部 consumer 执行 effect”之间。首批只设计前者，不假设后者的 React、Redux 或 command 形状。

## 复杂度硬边界

首批生产 Module 目标低于 500 行。

如果完整表达本设计的 ordinary queue 数据闭环需要超过约 500 行，必须停止并回到设计拆分。不能通过以下方式伪造达标：

- 把同一状态机机械拆成多个空洞小文件；
- 引入兼容层、adapter 或重复类型转移复杂度；
- 删除 owner、identity、乱序、replay/stale/foreign 验证；
- 减少测试或放宽断言来隐藏复杂度。

行数是复杂度报警线，不是压缩代码或牺牲正确性的目标。

## 验证设计

验证只通过四个公开入口驱动事件序列，断言完整 transition、effects 和可观察结果，不访问内部状态或新增 test-only helper。

公开 Interface 的序列测试必须覆盖：

- idle submit、busy enqueue、严格 FIFO 和一次只启动一条；
- single-flight 与消息 owner 守恒；
- duplicate identity 和空消息分类；
- `accepted`、`definitelyNotAccepted`、`deliveryUnknown` 三种 start settlement；
- `completed`、`failed`、`interrupted` 三种 terminal；
- runtime observation 先于 settlement，以及 settlement 先于 observation 的等价收敛；
- `turnStarted`、`userMessageCommitted`、terminal 的匹配与不匹配 identity；
- exact replay、stale、foreign/ownership mismatch；
- start rejection recovery 只包含当前 claim 消息，且剩余 FIFO 继续；
- interrupted recovery 保留全部 ordinary 消息边界和 FIFO，且没有 outbound start；
- terminal replay 不重复 drain，recovery 不重复产生。

由于首批没有 UI 和真实接线，不添加 UI 或 browser 测试，也不通过 Module 测试声称产品功能可达。测试只能证明数据闭环和不变量。

## 风险与限制

- 首批仍是没有 caller 的纯 Module，只能证明 ordinary queue 数据语义闭环。
- `performStart` 与 `recover` 尚无真实 consumer，effect 是否能按预期到达 command/runtime 层不在本设计证明范围内。
- 真实 GUI 的事件入口、线程切换、断线和生命周期可能暴露新的 adapter 约束；不得提前猜测并写入当前 Module。
- 从 `@codex-protocol/v2` 机械派生类型可以防止协议 union 漂移，但不能替代后续 adapter 对事件顺序和 thread identity 的验证。
- `deliveryUnknown` 在没有权威 runtime/commit 事实时会有意阻塞队列；首批不引入超时、猜测重试或静默 recovery。
- 无固定容量上限只表示数据语义不拒绝第 N 条消息，不代表未来 UI、内存治理或持久化无需单独设计。

真实 GUI 可达性必须由后续独立接线设计处理。该设计需要以当时存在的 command caller、projection/runtime 入口和 lifecycle 证据为基础，不能从本纯 Module 反推。

## 验收标准

- 第三版明确定位为第二版的简化落地设计，没有推翻已确认产品语义。
- 公开面只有 `createComposerInputQueue`、`submit`、`settleStart`、`observe`，输出统一为 `{ result, effects }`。
- effect 只有 `performStart` 与 `recover`；`StartClaim` 首批只持有一条消息。
- ordinary FIFO、single-flight、唯一 owner、三阶段 pending start、乱序事实归并和有界 replay/stale/foreign 分类均有明确契约。
- `failed` 自动继续一条；`interrupted` 只 recovery、不 start；`definitelyNotAccepted` recovery 当前 claim 后继续剩余 FIFO。
- `RecoveryBatch` 保留逐条消息 identity 和边界，不包含任何 UI 或恢复操作语义。
- 协议字段从 `@codex-protocol/v2` 权威生成类型机械派生，数据 Module 不依赖 Redux slice 的 completion type。
- 生产 Module 低于 500 行，且没有通过空文件拆分、兼容层或削弱验证隐藏复杂度。
- 测试只经公开 Interface 验证数据不变量，不声称真实产品路径可达。

## 非目标

- 不实现或设计 recovery UI、Composer 恢复交互或 recovery consumer。
- 不实现 steer 或为 steer 预留状态、入口和兼容路径。
- 不实现 edit、delete、clear、undo、manage 或 view。
- 不实现 React、Redux、effect runner、command caller 或 runtime adapter。
- 不实现附件、持久化、跨页面、跨刷新或跨 thread 生命周期。
- 不修改 app-server 协议或增加新的外部 API。
- 不证明 GUI 产品可达性，不把纯 Module 测试当作端到端验证。
- 不包含实施任务、实施顺序、提交策略或计划内容。
