# Route startup 与 thread switch 重复实现 attach transaction

日期: 2026-08-24
状态: ✅ 已修复
范围: `route startup` / `thread switch` attach transaction
优先级: P2

## 摘要

Route startup 与 thread switch 已归并为唯一 `ActiveThreadSession` activation transaction；candidate 在私有 staging 中完成 attach、notification replay 与校验，只有 commit 后才发布，提交前失败保留旧 session。

## 问题

修复前，`RouteConnectionStartupCoordinator` 与 `ThreadSwitchCoordinator` 都负责把一个 thread projection 从候选状态推进为 active owner。两者分别保存 generation、thread identity、subscription identity、attach 状态和 buffered notifications，并各自实现提交前失效判断、replay、detach 失败清理和 dispose 行为。

这不是单纯的代码相似：两套流程承载的是同一类事务不变量，但采用了不同的 notification 过滤和 replay 语义。修复后，startup 与 switch 只保留不同入口，均调用同一个 activation transaction；旧的两个 coordinator 已删除。

## 证据

以下路径和行号记录 2026-08-24 修复前的静态证据；对应旧 coordinator 已经删除，保留这些记录用于说明原问题：

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
- 2026-08-24 的原始静态审阅没有运行测试；当时只确认结构性一致性风险，没有宣称已复现用户故障。

当前源码证据：

- `codex-gui/src/features/appShell/GuiHostConnectionBridge.tsx:95-117`：startup target 与 recovery startup 都进入同一个 `ActiveThreadSession` activation API；Bridge 只在 activation settle 后发布 stable session。
- `codex-gui/src/features/activeThreadSession/activeThreadSession.ts:249-341`：唯一 transaction 创建 candidate，完成 resume/attach、thread identity 校验、私有 projection replay 与 live session prepare。
- `codex-gui/src/features/activeThreadSession/activeThreadSession.ts:155-183,342-416`：candidate dispatch 先暂存在私有 adapter；currentness、notification replay 与 release handoff 全部通过后才进入 commit 并发布。
- `codex-gui/src/features/activeThreadSession/activeThreadSession.ts:577-663`：提交前失败统一 abort candidate、detach candidate projection，并保留既有 session；cleanup failure 被明确记录而不产生第二条提交路径。
- HEAD 中已不存在 `routeConnectionStartupCoordinator.ts` 或 `threadSwitchCoordinator.ts`，也没有两套 attach transaction 的 compatibility wrapper/fallback。

## 判断

问题已修复。startup 与 thread switch 现在共享唯一 activation transaction；candidate notification 在私有 staging 中归并，只有完成 identity/currentness/replay/handoff 检查后才原子发布。提交前失败保留旧 session，提交后 terminal failure 统一使 session 失效。

## 修复记录

- 设计与计划：`docs/superpowers/specs/2026/08/25/2026-08-25-codex-gui-active-thread-session-owner-design.md`、`docs/superpowers/plans/2026/08/25/2026-08-25-codex-gui-active-thread-session-owner-plan.md`。
- 设计/计划文档：`67b9779a9`；candidate projection：`82d71c644`；revisioned read model：`2fa4e795e`。
- live session：`7b16d61b7`，修正 `3de0a6986`；统一 activation：`44c2d9594`，修正 `6ff212188`。
- C1 stable capability：`1a995cc60`；session invalidation 修正：`758496ebf`；consumer cutover 与 legacy deletion：`79da9681b`。
- 独立 formatter：`9c9ae0a3b`；replan 记录：`107630d8f`；范围外 `Readonly` 类型整理的独立 inverse correction：`51e1e10c0`。

## 验证记录

- 最终 frontend CI：exit 0；unit 共 51/51 files、751/751 tests 通过。
- full Browser：exit 0；parallel 共 54/54 files、801/801 tests，sequential 共 9/9 files、21/21 tests，覆盖三种浏览器。
- V3 source/contract audit：PASS。确认 startup/switch 单一 transaction、candidate 私有 staging、commit 后发布、失败保留旧 session、legacy 删除及提交边界；工作树与 index clean。

## 影响

- 原有两套事务的语义漂移和双重审查成本已消除。
- 后续回归风险集中在唯一 transaction 的 currentness、private staging、linearization、失败清理与 terminal invalidation 不变量。
- 若未来为 startup 或 switch 重新引入独立 attach、buffer、replay 或 commit 路径，会再次形成同类结构性风险。

## 后续处理

设计、实现与验证均已完成；后续以 `activeThreadSession` transaction unit、App startup/switch Browser tests、sequential Browser tests 及 V3 source/contract audit 查询作为回归入口。若再次出现第二套 attach transaction 或绕过 candidate staging 的发布路径，应重新打开本 issue。
