# Composer draft 与 input payload 共同契约方向不清

日期: 2026-09-04
状态: 🔴 未修复
范围: `codex-gui/src/features/composerEditor`, `codex-gui/src/features/composerInputQueue`
优先级: P2

## 摘要

Composer editor draft 与 input queue payload 互相出现在对方的类型契约中，但共同契约的 owner 和允许依赖方向没有被命名。

## 问题

Draft capture 同时保存 editor draft 和 queue input payload；queue contracts 又直接引用 editor draft、capture 与 restore result。两个 feature 对同一提交、恢复和排队边界都有类型所有权，调用方需要跨 feature 内部路径才能表达一个完整操作。

当前可见引用均为 type-only，不能把它写成 JavaScript runtime cycle。问题是共同契约 seam 缺失，而不是运行时初始化顺序故障。

## 证据

- 研究基线：`f5647bb6aec9641c2346b170d9247a26d915e46e`（`docs/superpowers/research/2026/09/04/2026-09-04-codex-gui-shared-infrastructure-analysis.md`）。
- `codex-gui/src/features/composerEditor/composerDraft.ts:11-29`: editor draft 以 type-only 方式引用 queue 的 `ReadonlyComposerInputPayload`，并将 payload 放入 `ComposerDraftCapture`。
- `codex-gui/src/features/composerInputQueue/composerInputQueueContracts.ts:1-8`: queue contracts 以 type-only 方式引用 editor 的 draft、capture 与 restore result，同时引用本 feature 的 preview 和 input payload。

## 判断

问题仍成立。现有证据支持把 draft/input 的提交与恢复契约作为一个需要明确 owner 的边界，但不足以直接判定新模块位置；单纯建立 `shared/types` 会掩盖而非解决变化原因和权威归属。

## 影响

Editor 序列化、queue admission、恢复语义或 input payload 变化时，需要跨 feature 同步类型与行为。继续直接互引会扩大内部类型的事实公共面，并增加局部修改遗漏另一侧约束的风险。

## 后续处理

需要先复核 draft capture、queue admission、提交、清空与恢复的完整消费者链，再进入设计阶段确定共同契约 owner 和单向依赖；只有 draft/input payload 的权威定义和依赖方向唯一后才能关闭，之后单独编写计划。
