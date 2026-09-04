# Active-thread projection 与 thread runtime 契约方向不清

日期: 2026-09-04
状态: 🔴 未修复
范围: `codex-gui/src/features/activeThreadSession`, `codex-gui/src/features/threadRuntime`
优先级: P2

## 摘要

Active-thread projection 依赖 thread runtime replay 机制，而 thread runtime 又依赖 active-thread read-model action 和 projection fact 类型，两个 feature 的权威边界没有形成清晰的单向契约。

## 问题

Projection fact、replay 判定、session action 与 Redux read model 分散在两个 feature 中，并沿两个方向互相引用。调用关系表达了共同契约，却没有一个可从变化原因和生产入口解释的单一 owner。

这里不能描述成 JavaScript runtime cycle：`threadRuntimeSlice.ts` 对 `ActiveThreadProjectionReadModelFact` 的反向引用是 type-only。准确问题是 feature 级契约方向和 owner 不清，而不是已经证实的文件级运行时循环。

## 证据

- 研究基线：`f5647bb6aec9641c2346b170d9247a26d915e46e`（`docs/superpowers/research/2026/09/04/2026-09-04-codex-gui-shared-infrastructure-analysis.md`）。
- `codex-gui/src/features/activeThreadSession/activeThreadProjection.ts:1-9`: projection 模块在运行时导入 `threadRuntimeSlice` 的 `replayForProjectionEvent` 与 `snapshotReplayIndexFromTurns`。
- `codex-gui/src/features/activeThreadSession/activeThreadProjection.ts:17-33`: accepted queue fact 和 read-model fact 直接携带 replay 结果。
- `codex-gui/src/features/threadRuntime/threadRuntimeSlice.ts:1-3`: runtime slice 在运行时导入 active-thread read-model action，并以 type-only 方式导入 `ActiveThreadProjectionReadModelFact`。
- `codex-gui/src/features/threadRuntime/threadRuntimeSlice.ts:11-16`: replay 类型与 projection event payload 由 thread runtime 定义。

## 判断

问题仍成立。当前证据足以确认契约归属含混，但不足以在 issue 阶段决定 seam 应归 active-thread session、thread runtime 还是新的窄领域模块；也不能把移动类型文件本身当作根因修复。

## 影响

Projection 接入、replay 语义、session 状态和 Redux read model 的修改可能跨两个 feature 扩散。若只搬迁 import 而不确认权威链，依赖图可能表面单向化，实际 owner 与变化责任仍保持分裂。

## 后续处理

需要在设计前先复核生成协议 → projection ingress → session fact → Redux read model 的生产链和消费者，再由设计阶段确定唯一权威方向；只有权威定义与单向消费关系均可核验后才能关闭，确认后另行编写计划。
