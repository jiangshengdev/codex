# Codex GUI Thread Switch 终态结果设计

状态：已确认

确认日期：2026-08-24

日期：2026-08-24

## 唯一主目标

为 Codex GUI 的 thread switch 建立可信的终态结果契约：目标 owner 在结果交付时仍然可用，才允许报告成功并导航；如果连接生命周期已经结束，则根据切换是否提交返回准确、可理解且可恢复的失败信息；如果目标 owner 可用而只有旧资源清理失败，则继续成功并以非阻断警告告知用户。

本设计修复的是 `ThreadSwitchCoordinator.continueThread()` 的 interface 与 history continue 消费语义，不承诺 owner 在结果返回后的未来生命周期中永不失效。

## 关联问题

- Issue：`docs/superpowers/issues/2026/08/24/2026-08-24-01-codex-gui-current-code-problems/2026-08-24-01-thread-switch-returns-disposed-owner.md`
- 既有历史任务设计：`docs/superpowers/specs/2026/08/16/2026-08-16-codex-gui-thread-history-list-design.md`
- 既有连接生命周期设计：`docs/superpowers/specs/2026/07/17/2026-07-17-codex-gui-connection-lifecycle-owners-design.md`

## 当前问题与证据校准

### 结果契约自相矛盾

当前 `ThreadSwitchOutcome` 的 `current` 与 `switched` 都携带 `ActiveThreadOwnerHandle`。`ThreadHistoryDetailPage` 对两种结果执行同一种行为：读取 `activeOwner.threadId` 并导航到当前任务页。

但 `ThreadSwitchCoordinator` 允许提交期间的 `dispose()` 延迟到 commit 后执行。延迟销毁完成后，当前实现仍无条件返回 `switched`。现有协调器测试明确固定了以下组合：

- outcome 是 `switched`；
- 返回 owner 的 queue readiness 已被 `disposed` 阻塞；
- pending input 读取返回 `ownerGone`。

因此，调用方目前不能把 `switched` 理解为“结果交付时存在可用 owner”。

### issue 中的生产可达性需要修正

现有测试通过 dispatch 或 `publishActiveOwner` mock 同步重入 `dispose()`。当前生产调用图中没有发现对应的同步重入来源：

- `publishActiveOwner` 只发布 active owner 并提交 browser authorization session；
- Redux dispatch 路径没有发现同步销毁 coordinator 的 listener；
- WebSocket error/close 与 React effect cleanup 不能插入同一段同步 JavaScript 调用栈。

所以，测试证明的是状态机与 interface 缺陷，不能单独证明该同步竞态已经在生产路径可复现。

不过，成功提交后还会 `await detachThreadProjection(previousOwner)`。等待期间，WebSocket error、close 或 connection cleanup 可以使 commands 失效，并经 `GuiHostConnectionBridge` 销毁 `ThreadSwitchCoordinator` 和 active owner。当前代码在 await 返回后仍可能报告 `switched`。这是一条符合生产生命周期的异步窗口，说明终态契约仍需要修复，且不能只针对现有同步测试加特判。

## 已确认产品决策

设计访谈及实施中纠偏共完成了 4 项实质决策：

1. 连接中断必须区分提交前与提交后。提交后要明确告诉用户“任务切换已提交，但连接已中断，当前无法打开”，不能伪装成操作完全没有发生。
2. 提交后连接中断时保留历史详情页并显示错误，不导航到没有可用 owner 的当前任务页。
3. 目标 owner 仍可用但旧 owner 的 detach 等收尾清理失败时，切换继续成功并导航，同时显示非阻断警告。
4. `postCommitDegraded` 与 `previousOwnerCleanupFailed` 同时发生时，`ready` 携带 `warnings` 数组，页面分别显示两个 Toast，完整保留两类诊断；不得把两类错误合并成一个 warning。

第 4 项是实施中发现原设计单值 `warning` 无法表达两类降级同时发生后的纠偏。用户选择原文：`A`；纠偏落盘与继续执行确认原文：`确认`。

## 设计原则

### 成功是可依赖的终态

`ready` 是唯一允许导航的结果。它必须满足：

- 目标 thread 已成为 Redux 当前 Provider store 中的权威 active thread；
- 目标 owner 已完成 commit 与 publish；
- coordinator 在结果分类前没有待处理的 dispose；
- Bridge 从当前 Provider store 读取的权威 active thread identity 仍是本次目标 thread；
- owner 尚未被 dispose；
- 所有会让出 JavaScript 执行权的必要收尾步骤完成后，最终生命周期门禁仍通过。

该不变量只覆盖结果交付时点。结果返回后发生新的连接关闭，仍按正常连接生命周期销毁 owner。

coordinator 内部保存的 owner identity、projection owner identity 或 publication 布尔值只能作为过程事实，不能单独证明 Redux commit 已生效。Bridge 必须向 coordinator 提供读取当前 Provider store 权威 active-thread 状态的 callback；terminal gate 通过该 callback 验证 commit 结果。该 seam 保持在既有 `ThreadSwitchCoordinator` 与 `GuiHostConnectionBridge` 两个 production 文件内，不向 `activeThreadOwner.ts` 增加公开 liveness probe。

### 失败不携带 owner

任何不能证明 owner 可用的结果都不得携带 `ActiveThreadOwnerHandle`。页面不得通过 queue readiness、projection owner、disposed flag 或其他内部状态对结果做二次体检。

### 可以继续使用就不判失败

旧 projection detach、旧 owner 清理或其他 post-commit 收尾失败，如果没有破坏目标 owner 的可用性，不得把切换降级为失败。这类情况返回成功与非阻断 warning。

如果异常使 coordinator 无法证明目标 owner 仍可用，则必须返回失败；不能为了减少错误展示而保留模糊成功。

## 结果 interface

对外 seam 继续只有一个操作：

```ts
continueThread(threadId: string): Promise<ContinueThreadOutcome>
```

结果采用面向调用方终态的 interface，形状示意如下：

```ts
type ContinueThreadOutcome =
  | Readonly<{
      type: "ready";
      threadId: string;
      warnings: readonly ThreadSwitchWarning[];
    }>
  | Readonly<{
      type: "unavailable";
      failure: ContinueThreadFailure;
    }>;

type ContinueThreadFailure =
  | Readonly<{ type: "switchInProgress" }>
  | Readonly<{
      type: "currentThreadUnresolved";
      blockers: readonly ComposerInputQueueCoordinatorReleaseBlocker[];
      activeThreadId: string | null;
    }>
  | Readonly<{
      type: "connectionLost";
      progress: "beforeCommit" | "afterCommit";
      threadId: string;
      cleanupError: unknown | null;
    }>
  | Readonly<{
      type: "operationFailed";
      phase: "admission" | "resume" | "attach" | "activate";
      error: unknown;
      cleanupError: unknown | null;
    }>;

type ThreadSwitchWarning =
  | Readonly<{
      type: "previousOwnerCleanupFailed";
      error: unknown;
    }>
  | Readonly<{
      type: "postCommitDegraded";
      operation: "publishAuthorization" | "replay";
      error: unknown;
    }>;
```

具体类型名可在计划与实现阶段按文件局部惯例调整，但以下语义不得改变：

- 只有 `ready` 可以导航；
- `ready` 只携带权威 `threadId`，不向 history 页面暴露 owner；
- `current` 与 `switched` 合并为 `ready`，因为两者对调用方产生相同用户结果；
- connection loss 保留 `beforeCommit` 与 `afterCommit` 的产品差异；
- 执行失败保留 admission、resume、attach、activate 的可诊断阶段；
- warnings 与目标 owner 是否可用正交；没有降级时数组为空，两类降级同时发生时保留两个不同 discriminant；
- 失败结果在类型层面不可能携带可被误用的 owner。

不采用完整 lifecycle receipt。`resumed`、`attached`、`replacementActivated`、`replacementReleased`、generation 和 dispose request 等事实属于 coordinator implementation；把它们全部暴露给页面会扩大 interface，并迫使调用方理解内部状态机。

## Coordinator implementation 语义

`ThreadSwitchCoordinator` 继续作为深 module，在 `continueThread` seam 后隐藏 admission、resume、attach、commit、publish、replay、cleanup 与生命周期协调。

### 阶段与收敛

内部流程按以下语义收敛：

1. Admission：处理 already-current、busy、queue release blockers 与已终止 coordinator。
2. Prepare：resume 目标 thread，attach projection，校验 thread/subscription identity，构造 candidate owner。
3. Activate：commit candidate，并发布新的 active owner。
4. Reconcile：处理 commit/publish/replay 中观察到的异常与 dispose 请求。
5. Cleanup：释放旧 owner，并尝试 detach 旧 projection。
6. Terminal gate：在所有必要 await 之后再次核验 coordinator generation、disposed 状态，并通过 Bridge callback 读取当前 Provider store 的权威 active-thread identity；不得用 coordinator 内部 owner 或 projection owner identity 代替 Redux commit proof。
7. Classification：只有 terminal gate 证明 owner 可用时返回 `ready`；否则返回准确的 `unavailable`。

终态分类必须集中在 coordinator 内部的单一收敛点。不得让各分支分别拼装含义相近但不变量不同的成功结果。

### Dispose 的语义

当前生产代码中的 `dispose()` 表示整代 GUI host connection/owner capability 已经结束，不是取消一次 switch 后还能复用同一 coordinator：

- coordinator 永久进入 disposed；
- active owner 的 queue、skill catalog 与 projection owner 被销毁；
- bridge 清除 commands、active owner 与 `continueThread` capability；
- 同一 coordinator 上的后续 retry 不可能恢复。

因此，commit 期间或 commit 后收到 dispose 时不能通过延迟销毁到 Promise 交付之后来制造成功。若目标 owner 已被销毁，结果必须是 `connectionLost`。

未来如果产品需要“取消单次切换但保留连接与当前 owner”，必须另行设计不同的操作；不能复用现有 `dispose()`。

### Post-commit 异常

异常按 owner 最终可用性分类，而不是只按发生位置分类：

- 目标 owner 可用，旧 owner detach/cleanup 失败：`ready` 的 `warnings` 包含 `previousOwnerCleanupFailed`。
- commit 或 publish 抛错，但 reconciliation 通过当前 Provider store 权威状态证明目标 thread 已提交且 owner 仍可用：允许 `ready` 的 `warnings` 包含对应 `postCommitDegraded`。
- 无法证明 commit 生效，或目标 owner 已终止：`operationFailed.activate` 或 `connectionLost`。
- cleanup error 不能覆盖主要失败原因；需要作为次级诊断信息保留。
- 两类 warning 独立累积；同时发生时按 lifecycle 顺序返回 `[postCommitDegraded, previousOwnerCleanupFailed]`，不能拼接 error 后伪装成单一分类。

## History continue 用户界面

### 普通成功

收到 `ready` 后，history detail 使用结果中的权威 `threadId` replace 到 current task 路由。页面不读取 owner，也不区分目标原本已是 current 还是刚完成 switch。

### 提交前连接中断

页面留在 history detail，保留只读 transcript，不导航。

错误信息表达：

- 标题：`无法继续此任务`
- 说明：`连接在任务切换完成前中断。重新连接后请重试。`

旧 capability 已永久失效，页面不得继续调用同一个 `continueThread`。按钮是否可用只跟随 `AppCapabilities` 当前是否提供新的 continuation capability，不在页面保存 stale callback。

### 提交后连接中断

页面同样留在 history detail，保留只读 transcript，不导航，也不提供指向已失效 active owner 的“返回当前任务”按钮。

错误信息表达：

- 标题：`任务已切换，但当前无法打开`
- 说明：`任务切换已提交，但连接已中断。重新连接后请确认当前任务。`

这条信息保留 partial-commit 事实，避免用户把重复操作理解为无副作用 retry。

### Busy 与 queue blockers

这些状态没有结束 connection capability，仍属于可恢复的暂时阻塞：

- `switchInProgress` 提示另一项切换正在进行，稍后可重试。
- `currentThreadUnresolved` 提示当前任务仍有排队或状态未确定的消息，并在 `activeThreadId` 存在时允许返回当前任务。

不得把 connection loss 与这两类阻塞共用同一恢复按钮，因为 stale coordinator 无法重试。

### 操作失败

resume、attach 或 activate 失败时保留 history detail。页面显示翻译后的阶段摘要，并保留底层 error 作为诊断详情；cleanup error 作为次级信息呈现，不得与主错误并列成两个无法区分的原始字符串。

### 成功后的非阻断警告

目标 owner 可用而旧资源清理失败时，先正常导航，再使用 AppShell 已有的 HeroUI `Toast.Provider` 调用 `toast.warning()`：

- 标题：`任务已打开`
- 说明：`上一任务的连接清理未完成，后续状态可能受到影响。`

Toast 使用 warning 语义，不阻止 current task 操作。用户文案使用 Lingui macro；底层 error 留在诊断信息中，不直接堆叠进短暂 Toast。

如果 owner 可用，但 authorization session persistence 或 replay reconciliation 失败，则使用独立 warning，不能错误复用“上一任务清理未完成”：

- 标题：`任务已打开`
- 说明：`任务已打开，但部分状态同步未完成。`

这两类 warning 都是 success-with-warning，但必须保留不同 discriminant 和诊断 operation，页面不能从原始 Error 文本猜分类。页面按 `warnings` 数组逐项调用 `toast.warning()`；两类同时发生时分别显示两个 Toast。

## 状态所有权

- `ThreadSwitchCoordinator` 唯一拥有 switch 进行状态、candidate、generation、commit/replay 与终态分类。
- `GuiHostConnectionBridge` 继续拥有当前 connection generation、commands/owner capability 发布与失效。
- `ThreadHistoryDetailPage` 只拥有本次按钮请求的 pending/展示状态，不保存 owner，不复制 coordinator 生命周期状态。
- `AppShell` 现有 Toast queue 承载跨导航的非阻断 warning；不为该 warning 新建 Redux slice 或第二个全局通知 owner。

## HeroUI 与国际化

- history detail 的阻塞与失败继续使用 HeroUI `Alert`，按 warning/danger 语义区分。
- 成功后的 cleanup warning 使用已有 HeroUI v3 `Toast.Provider` 与 `toast.warning()`；不手写 toast、timer、portal 或 queue。
- 所有新增用户文案通过 Lingui `Trans` 或 `useLingui`/`t` macro 标记。
- 非 JSX 的 `toast.warning()` 文案使用 `useLingui` 提供的 `t`。
- connection loss 的提交前/提交后差异必须通过文本表达，不能只靠颜色或图标。
- Alert 保持 `role="alert"`；Toast 使用组件库既有可访问语义。

## 失败与恢复矩阵

| 最终事实 | 结果 | 导航 | 页面反馈 | 恢复 |
| --- | --- | --- | --- | --- |
| 目标 owner 可用，无异常 | `ready` | 导航 | 无 | 正常使用 |
| 目标 owner 可用，旧资源清理失败 | `ready + warnings[previousOwnerCleanupFailed]` | 导航 | 一个 warning Toast | 正常使用；保留诊断信息 |
| 目标 owner 可用，两类降级同时发生 | `ready + warnings[postCommitDegraded, previousOwnerCleanupFailed]` | 导航 | 两个独立 warning Toast | 正常使用；分别保留诊断信息 |
| 另一切换正在执行 | `unavailable.switchInProgress` | 不导航 | 暂时阻塞 Alert | 稍后重试 |
| 当前队列不能安全释放 | `unavailable.currentThreadUnresolved` | 不导航 | 阻塞 Alert | 返回当前任务处理 |
| 提交前 connection generation 终止 | `unavailable.connectionLost.beforeCommit` | 不导航 | 失败 Alert | 重新连接后重试 |
| 提交后 connection generation 终止 | `unavailable.connectionLost.afterCommit` | 不导航 | partial-commit 失败 Alert | 重新连接后确认当前任务 |
| admission/resume/attach/activate 失败且无可用目标 owner | `unavailable.operationFailed` | 不导航 | 失败 Alert | 按当前 capability 状态重试 |

## 排除方案

### 页面检查 owner readiness

拒绝。页面只能检查某个内部子系统的瞬时状态，无法证明整个 owner、connection generation 与 projection subscription 一致；这会把生命周期知识扩散到调用方，并隐藏 coordinator 输出了矛盾结果的根因。

### 已提交就始终导航

拒绝。commit 事实不等于 owner 仍可用。导航到没有 owner 的 current task 会继续制造“看起来成功、实际不能操作”的状态。

### 把 post-commit connection loss 伪装成 attach 失败

拒绝。attach 已经完成，甚至 commit 已经发生。复用 attach failure 会给用户和诊断系统提供错误事实。

### 同一 disposed coordinator 上立即重试

拒绝。现有 dispose 是永久 connection-generation termination；重复调用只能再次得到 disposed，不构成恢复。

### 暴露完整 lifecycle receipt

拒绝。history 页面只需要知道能否导航、失败原因与恢复动作。公开 resumed/attached/committed/released 等内部事实会扩大 interface，使 module 变浅。

## 范围

本设计包含：

- `ThreadSwitchOutcome` 的终态语义收敛；
- coordinator 在同步重入与异步 cleanup 窗口后的最终生命周期门禁；
- history continue 对 ready、阻塞、连接中断和执行失败的展示；
- success-with-warning 的跨导航 Toast；
- 对应 coordinator、Browser Mode 与纵向 App 行为验证；
- 新用户文案的 Lingui catalog 更新。

## 非目标

- 新增 GUI host 自动重连机制。
- 保证 owner 在结果返回后的未来永不失效。
- 新增用户取消单次 thread switch 的能力。
- 修改 app-server RPC、wire contract、generated protocol types 或 GUI Host allowlist。
- 修改 thread resume、projection attach/detach 的服务端语义。
- 重构整个 `GuiHostConnectionBridge` 或其他无关 connection owner。
- 把所有内部 cleanup error 都提升为阻断用户的全局错误。
- 顺带处理与本 issue 无关的 history、Composer 或 projection 问题。

## 验证边界

### Coordinator interface

定向测试至少证明：

- already-current 与普通 switch 都只返回 `ready` 和权威 `threadId`；
- dispatch/publish 同步重入 dispose 不再返回成功；
- previous detach pending 期间 dispose 不再返回成功；
- connection loss 在 commit 前后返回不同 progress；
- 任一 unavailable 结果在类型和运行结果中都不携带 owner；
- 目标 owner 可用且只有 previous detach/cleanup 失败时，`ready.warnings` 只包含 `previousOwnerCleanupFailed`；
- activate 异常只有在最终能证明 owner 可用时才允许成功；
- cleanup error 不覆盖主要失败原因；
- admission、reservation release 与本地 owner cleanup 抛错不会越过统一终态分类；
- previous-owner cleanup warning 与 post-commit degradation warning 使用不同 discriminant 和文案；
- dispatch 在 Redux commit 生效前抛错时，coordinator 不得凭内部 owner/projection identity 报告 `ready`；
- 两类 warning 同时发生时返回包含两项的 `warnings` 数组，不丢失或合并任一诊断；
- disposed coordinator 不能在同一 generation 上恢复。

### ThreadHistoryDetailPage Browser Mode

组件测试至少证明：

- `ready` replace 到结果中的权威 task path；
- 提交前 connection loss 留在 history detail 并显示对应文案；
- 提交后 connection loss 留在 history detail，显示 partial-commit 文案且不提供失效 owner 导航；
- connection loss 后不会调用 stale continuation capability；
- busy 与 queue blocker 保留各自恢复行为；
- resume/attach/activate 失败保留 history transcript，并能在当前 capability 仍有效时重试；
- warnings 不阻止导航；两类 warning 同时存在时分别显示两个 Toast。

### App 纵向行为

App 级验证至少证明：

- connection invalidation 会清除旧 `continueThread`，旧结果不会触发导航；
- 新 connection generation 提供 capability 后，history 页面只调用新 capability；
- warnings 在 history 页面卸载并进入 current task 后仍通过现有 Toast provider 可见；
- 普通成功的 `warnings` 为空；
- 两类 warning 同时存在时，两个 Toast 都跨详情页卸载保持可见；
- connection error 的全局状态与局部 switch 失败信息不会互相覆盖或产生错误成功提示。

### 可见 GUI 验证

可见界面检查至少覆盖：

- history transcript 在各类失败后保持可读；
- 提交前/提交后连接中断的文案差异清楚，不依赖颜色理解；
- bottom continue action 与 Alert 在桌面和窄屏下不遮挡；
- warning Toast 在 current task 页面可见、可关闭且不阻断操作；
- 中英文文案不会造成横向溢出。

## 完成标准

只有以下条件同时满足，后续实现才符合本设计：

- `ready` 在结果交付时可靠地代表可用目标 owner；
- connection loss 不再产生携带 disposed owner 的成功结果；
- 提交前与提交后 failure 对用户保持不同且准确的事实；
- 失败不导航，成功才导航；
- 可用目标 owner 不因旧资源清理失败而被错误判失败；
- cleanup 降级通过非阻断警告可见；
- terminal success 由当前 Provider store 的权威 Redux 状态证明，不由 coordinator 内部 owner identity 自证；
- 同时发生的不同 warning 均被保留并分别展示；
- 页面无需理解或探测 owner 生命周期内部状态；
- 未扩大到自动重连、服务端协议或无关 GUI 重构。
