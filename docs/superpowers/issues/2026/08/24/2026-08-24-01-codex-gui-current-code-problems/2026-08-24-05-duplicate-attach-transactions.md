# Route startup 与 thread switch 重复实现 attach transaction

日期: 2026-08-24
状态: 🔴 仍需处理
范围: `route startup` / `thread switch` attach transaction
优先级: P2

## 摘要

Route startup 与 thread switch 各自维护一套 attach、candidate、notification buffering、replay、dispose 和失败清理事务，重复语义已经出现差异，但当前证据尚不足以把该差异认定为已复现 bug。

## 问题

`RouteConnectionStartupCoordinator` 与 `ThreadSwitchCoordinator` 都负责把一个 thread projection 从候选状态推进为 active owner。两者分别保存 generation、thread identity、subscription identity、attach 状态和 buffered notifications，并各自实现提交前失效判断、replay、detach 失败清理和 dispose 行为。

这不是单纯的代码相似：两套流程承载的是同一类事务不变量，但已经采用不同的 notification 过滤和 replay 语义。后续修改若只覆盖其中一条路径，可能继续扩大 startup 与 switch 的行为差异。

## 证据

- `codex-gui/src/features/appShell/routeConnectionStartupCoordinator.ts:73-90` 定义并持有 startup candidate、generation、active owner 与 dispose 状态。
- `codex-gui/src/features/appShell/routeConnectionStartupCoordinator.ts:139-177` 创建 candidate，执行 `attachThreadProjection`，记录 thread/subscription identity，检查返回 thread identity，并准备 active owner。
- `codex-gui/src/features/appShell/routeConnectionStartupCoordinator.ts:270-306` 缓冲 candidate notification；replay 时再次按 active owner 的 `subscriptionId` 过滤 notification。
- `codex-gui/src/features/appShell/routeConnectionStartupCoordinator.ts:343-390` 处理 prepared owner dispose、candidate currentness、失败 detach 和 cleanup failure。
- `codex-gui/src/features/projectionCoordination/threadSwitchCoordinator.ts:75-82` 定义另一套 candidate 状态，字段同样覆盖 generation、thread/subscription identity、attach 状态与 buffered notifications。
- `codex-gui/src/features/projectionCoordination/threadSwitchCoordinator.ts:109-120` 另行持有 active owner、candidate、transition generation、commit/dispose 与 busy 状态。
- `codex-gui/src/features/projectionCoordination/threadSwitchCoordinator.ts:256-278` 创建 switch candidate，并通过同一 `prepareActiveThreadOwner` 入口准备 owner。
- `codex-gui/src/features/projectionCoordination/threadSwitchCoordinator.ts:357-429` 独立处理三类 projection notification、candidate buffering、dispose 和 replay。
- `codex-gui/src/features/projectionCoordination/threadSwitchCoordinator.ts:431-489` 独立实现失败/阻塞收尾、candidate currentness、reservation release 与 detach cleanup failure。
- 具体差异已经出现：startup replay 在 `routeConnectionStartupCoordinator.ts:295-305` 显式按 active owner 的 `subscriptionId` 过滤；switch replay 在 `threadSwitchCoordinator.ts:419-428` 直接把 buffered notification 交给 active owner。
- switch replay 依赖下游 ingress 继续执行 identity 检查；`codex-gui/src/features/projectionIngress/projectionIngressAdapter.ts:155-171` 会按当前 cursor 的 thread/subscription identity 返回 `wrongThread` 或 `staleSubscription`。

## 判断

问题仍成立。当前代码证明 startup 与 thread switch 重复维护同类 attach transaction，而且 notification replay 的过滤位置和处理方式已经分化。

但是，本轮没有通过测试、运行日志或可重复操作证明该差异会产生错误的最终状态或用户可见故障，因此该 issue 记录的是结构性一致性风险，不是已复现 bug。

## 影响

同一事务不变量由两套 coordinator 分别维护，会增加状态切换、失败恢复和 dispose 竞态的审查成本。任何涉及 attach、buffer、replay、commit 或 cleanup 的修正都需要同时核对两条路径，否则可能只修复 startup 或 switch 之一。

现有 replay 差异还会让 subscription identity 的正确性依赖不同层级：startup 在 coordinator 内过滤，switch 依赖 ingress 拒绝 stale notification。这会增加证明两条路径等价的难度，并提高后续演进产生行为漂移的风险。

## 后续处理

需要单独进入设计阶段，先明确 route startup 与 thread switch 必须共享的 attach transaction 不变量和允许保留的入口差异，再决定共同边界。设计前应补充覆盖 startup 与 switch 的对照验证，确认 stale subscription、dispose、attach 失败与 replay 期间失效时两条路径的实际行为。

本轮未运行测试。
