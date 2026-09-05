# Active-thread projection 与 thread runtime 契约方向不清

日期: 2026-09-04
状态: ✅ 已修复
范围: `codex-gui/src/features/activeThreadSession`, `codex-gui/src/features/threadRuntime`
优先级: P2

## 摘要

2026-09-05 已修复：回放判断与事实契约统一归 active-thread session，thread runtime、transcript 与输入队列消费同一事实定义，原有事件接受与状态更新行为保持不变。

## 问题

修复前，projection fact、replay 判定、session action 与 Redux read model 分散在两个 feature 中，并沿两个方向互相引用。调用关系表达了共同契约，却没有一个可从变化原因和生产入口解释的单一 owner。

这里不能描述成 JavaScript runtime cycle：`threadRuntimeSlice.ts` 对 `ActiveThreadProjectionReadModelFact` 的反向引用是 type-only。准确问题是 feature 级契约方向和 owner 不清，而不是已经证实的文件级运行时循环。

## 证据

- `codex-gui/src/features/activeThreadSession/activeThreadProjectionFacts.ts:8`: 统一定义 replay 分类、`ActiveThreadProjectionAcceptedEvent` 与 `ActiveThreadProjectionReadModelFact`，直接引用生成协议类型。
- `codex-gui/src/features/activeThreadSession/activeThreadProjectionReplay.ts:12`: 快照索引构造和回放判断由会话内部模块实现；`activeThreadProjection.ts:67` 持有索引，`:85` 在 ingress 接受事件后计算 replay。
- `codex-gui/src/features/activeThreadSession/liveActiveThreadSession.ts:486`: 同一 accepted event 交给输入队列、当前轮次和压缩流程；session transition 继续统一驱动读模型更新。
- `codex-gui/src/features/threadRuntime/threadRuntimeSlice.ts:1`: runtime 消费会话 action 和事实契约；`:29` 仅维护元信息与 token 用量，不再定义或提供 replay 规则。
- `codex-gui/src/features/transcriptState/transcriptProjection.ts:1` 与 `codex-gui/src/features/composerInputQueue/composerInputQueueRuntimeObservation.ts:1`: 下游直接引用同一会话事实契约。旧事实类型与旧 replay 出口已删除，没有兼容转发。

## 判断

已修复。事实定义、回放判断和生产入口归同一 session owner，下游消费结果；修复同时迁移实现、契约及全部消费者，消除了 session 对 runtime 回放实现的反向依赖。

该结论针对本 issue 的契约归属，不表示所有 feature 依赖均无环，也不表示队列的导入范围目前有自动检查保障。

## 修复记录

- `077138264`: 迁移会话事实契约、回放实现及生产和测试消费者。
- `eb61a220c`: 新增 10 个通过真实 projection 入口的回归案例，覆盖快照重复、新事件、状态变化与 token 更新，并验证两路事实使用同一 payload。
- `4fc0a4912`: 当时同步调整 feature boundary policy 的公开出口与依赖方向。
- 后续提交 `ecef28880` 移除了 feature boundary checker 及其 policy；当前源码归属修复仍保留，但不再把该检查器作为现有保障。

## 验证记录

2026-09-05 实施阶段，在 `4fc0a4912` 对应的最终代码状态完成：

- 相关单元测试：43 个文件、489 个测试通过，包含当时的 feature boundary checker 测试。
- 完整类型检查、lint、oxfmt 格式检查通过；独立只读复核未发现需修正问题。
- Level 1：上述自动化回归通过；Browser 测试仅迁移类型引用，由完整类型检查覆盖，未执行 Browser 行为测试。
- Level 2 / Level 3：本次内部契约重构不适用，未执行真实 GUI 或可见桌面验收。

本次文档更新复核了 `ecef28880` 后的源码与提交记录，未重新运行上述测试；489 个测试通过是 checker 移除前的历史验证结果。

## 影响

修复前，projection 接入、replay 语义、session 状态和 Redux read model 的修改可能跨两个 feature 扩散。修复后，回放规则的维护集中在会话层，下游使用统一结果；事件归属与顺序检查、快照判重、批次顺序、版本检查及失效处理保持原有语义。

## 后续处理

本 issue 关闭，无剩余实施任务。后续修改回放语义时，以会话事实契约及其真实 projection 入口测试为依据；新的检查工具需求另行讨论。

## 历史记录

2026-09-04 原始研究基线：`f5647bb6aec9641c2346b170d9247a26d915e46e`（`docs/superpowers/research/2026/09/04/2026-09-04-codex-gui-shared-infrastructure-analysis.md`）。以下行号仅对应该历史基线：

- `codex-gui/src/features/activeThreadSession/activeThreadProjection.ts:1-9`: projection 在运行时导入 `threadRuntimeSlice` 的两个 replay helper。
- 同文件 `:17-33`: accepted queue fact 和 read-model fact 携带 replay 结果。
- `codex-gui/src/features/threadRuntime/threadRuntimeSlice.ts:1-3`: runtime 导入 session action，并以 type-only 方式导入 projection fact。
- 同文件 `:11-16`: replay 类型与 projection event payload 由 thread runtime 定义。

当时仅确认归属含混，尚未确定唯一 owner；要求先追踪生产链及消费者，不能只移动类型文件就视为根因修复。该调查与设计已在 2026-09-05 完成，结论由上述修复记录取代。
