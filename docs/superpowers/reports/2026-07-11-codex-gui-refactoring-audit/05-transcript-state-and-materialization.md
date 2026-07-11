# 05 Transcript State 与 Materialization

状态：complete

## 审计范围

状态：complete。设计映射、materialization、输入/输出边界与去重汇聚均已完成。

计划范围：transcript Redux state、item materialization、reducer/selector 定义侧，以及 snapshot/live/committed 投影的跨 feature 交界。

## 范围交界

状态：complete。

- Transcript State 内部模块拆分与测试拆分属于已有专项设计；本报告只核对覆盖关系、跨 feature 交界与未覆盖残余点，不重复审计或改写该设计。
- 允许交界：thread runtime action source、timeline material、rendering selector consumer。
- 禁止扩张：既有 Transcript State 内部拆分设计。

## 审计进度

| 微阶段 | 状态 | 压缩结论 | Finding ID / 覆盖状态 | 关键证据 |
| --- | --- | --- | --- | --- |
| `R05-DESIGN-MAP` | complete | 既有专项设计与当前 production/测试拆分逐项对应；内部拆分全部标记“已有专项设计”，没有 production 残余。500 项 event-id 淘汰缺少直接测试，只能记录为专项设计内测试覆盖残余。 | `RA-05-001`；已有专项设计；非 finding | 设计：`docs/superpowers/specs/2026-07-11-codex-gui-transcript-state-split-design.md:39-116,118-171,186-225`；实现：`transcriptStateModel.ts:4-141`、`transcriptEventDedup.ts:1-18`、`transcriptLiveProjection.ts:8-194`、`transcriptCommittedProjection.ts:13-183`、`transcriptStateSelectors.ts:9-53`、`transcriptStateSlice.ts:1-172`；测试题目分布为 `6/5/3/4/3/9` |
| `R05-MATERIALIZATION` | complete | `TranscriptEntry` 由 model 定义，`materializeTranscriptItem` 由 materialization 模块实现，全部 production 直接调用集中在 committed projection 的 live completion 与 snapshot rebuild；无残余反向依赖或未覆盖跨模块重构点。 | `RA-05-001`；已有专项设计；非 finding | `transcriptStateModel.ts:30-49,62,83`；`transcriptEntryMaterialization.ts:1-2,19-77`；`transcriptCommittedProjection.ts:1-11,145-183`；`transcriptStateSlice.ts:23-30,41-52,67-68` |
| `R05-BOUNDARIES/ACTION-TIMELINE` | complete | `threadRuntime` actions 是 Transcript State 的真实输入；R04 timeline materials 是从 runtime record 派生的并行只读材料，缺少 attach 元数据、event identity/replay 和 delta 语义，且当前无 production consumer，不能直接替代 action 边界。 | 引用 R04 未接入边界；R05 不另建 finding，优先级继承 R04 | `threadRuntimeSlice.ts:20-60,111-188,202-208`；`transcriptStateSlice.ts:1-8,84-156`；`snapshotReplay.ts:8-29,54-97`；`liveEventHandling.ts:14-55,77-156` |
| `R05-BOUNDARIES/SELECTOR-REACT` | complete | TranscriptState 拥有 state-aware selectors 与 chunk identity/revision cache；CommittedTranscriptSurface 仅通过公开 facade 单向消费，UI equality 独立承担渲染等价判断。 | 已有专项设计；R05 非 finding，优先级：非 finding | `transcriptStateSelectors.ts:9-53`；`transcriptStateSlice.ts:23-35,58-80,160-170`；`CommittedTranscriptSurface.tsx:3-14,84-100,166-174,220-279`；`committedTranscriptChunkEquality.ts:1-59` |
| `R05-BOUNDARIES` | complete | 输入侧只引用 R04 未接入边界；输出侧 selector/view cache 与 UI equality 保持单向职责。两个子阶段均未发现新的跨 feature 重构点。 | R04/R06 交界引用；R05 非 finding | ACTION-TIMELINE 与 SELECTOR-REACT 两个子阶段证据 |
| `R05-DEDUP` | complete | R05 只保留 `RA-05-001`：内部拆分由已有专项设计拥有。500 项 oldest-first 淘汰缺少直接测试是验证残余，不改变 owner、职责、依赖或模块边界，不建立新 finding。 | `RA-05-001`；已有专项设计；优先级：非 finding | 本报告设计映射、materialization 与 boundaries 汇聚证据 |

依赖：`SCAFFOLD-COMMITTED`。

### 已有专项设计映射

- Model、dedup、live projection、committed projection、selector cache、slice 稳定 facade 与 materialization 类型依赖方向均已按专项设计落位；`transcriptStateSlice.ts:37-52` 保留常量和类型兼容导出，`:82-156` 保留 action 路由及事件接受顺序。
- 原 30 个 live-event 测试已按 Streaming、Lifecycle、Index、Scroll、Replay/Dedup、Committed 六类分布到当前 sibling tests；测试入口继续从 `../transcriptStateSlice` 使用公开 facade。
- 专项设计要求 event-id 去重窗口按顺序淘汰并保持 500 项硬上限（设计 `:52-60,186-193`），实现位于 `transcriptStateModel.ts:4-5,88-89` 与 `transcriptEventDedup.ts:6-18`；当前测试仅覆盖普通重复 commit（`transcriptStateReplayDedup.test.ts:104`），未直接覆盖窗口淘汰。
- `TranscriptEntry` 的 model owner、materialization 的 type-only 依赖、committed projection 的两个直接调用点，以及 slice facade 的兼容 re-export 构成单向依赖闭包；`materializeTranscriptItem` 没有其他 production 调用方。

### 输入边界

- `threadRuntimeAttached`、event、single/batched delta 与 reconnect actions 由 `transcriptStateSlice.extraReducers` 直接消费；这是 05 当前完整输入边界。
- R04 的 snapshot/live/subscription materials 仅由 selectors 从 `threadRuntime` 已存状态生成；聚合 selector 当前没有 production consumer。材料未保留 `subscriptionId`、`headCommitId`、`commitId`、`replay` 或 delta，因此其未接入只能引用 R04 边界，不能在 05 重复建立 finding。

### 输出边界

- TranscriptState 内部 selector helper 以 chunk identity/revision 缓存 view，再由 slice facade 统一导出；CommittedTranscriptSurface 不读取内部 model、cache 或 Redux state shape。
- `committedTranscriptChunkEquality.ts` 只依赖公开 `TranscriptChunkView`，负责 UI 渲染等价；selector cache 测试覆盖稳定 view、变更失效和 reattach，新旧文本切换另有 browser 覆盖。

## Findings

状态：complete。

### RA-05-001 Transcript State 内部拆分已有专项设计

- Finding ID：`RA-05-001`
- 标题：Transcript State 内部拆分已有专项设计
- 主报告：`docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/05-transcript-state-and-materialization.md`
- Evidence owner：本报告 `05-transcript-state-and-materialization.md`
- 状态：已有专项设计
- 优先级：非 finding
- 结论摘要：当前 production、测试和公开 facade 与专项设计逐项对应；没有未覆盖的内部或跨 feature 重构点。
- 当前 owner / 职责：`transcriptState` feature 拥有领域模型、事件去重、live/committed projection、materialization、selector cache、Redux action 路由与稳定公开 facade。
- 问题类型：已有专项设计覆盖；非问题、非重构 finding。
- 影响文件：
  - `codex-gui/src/features/transcriptState/transcriptStateModel.ts`
  - `codex-gui/src/features/transcriptState/transcriptEventDedup.ts`
  - `codex-gui/src/features/transcriptState/transcriptLiveProjection.ts`
  - `codex-gui/src/features/transcriptState/transcriptCommittedProjection.ts`
  - `codex-gui/src/features/transcriptState/transcriptStateSelectors.ts`
  - `codex-gui/src/features/transcriptState/transcriptEntryMaterialization.ts`
  - `codex-gui/src/features/transcriptState/transcriptStateSlice.ts`
  - `codex-gui/src/features/transcriptState/__tests__/**`
- 定义方 / 构造方 / 调用方 / 消费者：
  - 定义方：`transcriptStateModel.ts` 定义 state 与 entry/view 类型；`transcriptEntryMaterialization.ts` 定义 item 到 entry 的转换；`transcriptStateSelectors.ts` 定义缓存 helper。
  - 构造方：live/committed projection 构造对应状态投影，slice 通过 `threadRuntime` actions 路由调用。
  - 调用方：`transcriptStateSlice.ts` 调用 projection、dedup 与 selector helpers；`transcriptCommittedProjection.ts` 调用 `materializeTranscriptItem`。
  - 消费者：`CommittedTranscriptSurface.tsx` 仅通过 `transcriptStateSlice.ts` 导出的 selectors/types 消费，UI equality 使用公开 `TranscriptChunkView`。
- 共同语义 / 为何不再抽象：这些模块共同维护 transcript 投影，但 model、dedup、live、committed、materialization、selector 与 facade 已按状态生命周期拆开；继续抽象不会消除重复语义，反而会重新耦合职责或扩大跨 feature 协议。
- 保留边界 / 允许依赖方向：
  - `threadRuntime actions -> transcriptStateSlice -> dedup/live/committed projection -> model state -> selectors -> UI consumer`。
  - `transcriptEntryMaterialization -> transcriptStateModel` 为 type-only 依赖；`transcriptCommittedProjection -> materialization/model`；UI 只依赖 slice facade。
  - 禁止 model 反向依赖 slice/projection、materialization 反向依赖 slice，以及 UI 直接读取内部 selector cache 或 state shape。
- 保持现状收益：稳定旧 import 路径和 Redux shape，维持 event 接受顺序、chunk identity/revision cache、live batch 合并与有界去重窗口，同时避免 consumer import churn。
- 最小批次：无。
- 排除范围：不修改 production owner、职责、依赖、state shape、action 协议、UI 组件或公开 import；不把验证残余升级为重构建议。
- 风险：
  - 行为风险：event 接受顺序、snapshot/live materialization 或 item settlement 顺序若被改动，可能改变 transcript 可见结果。
  - 契约风险：slice facade 的 selector/type/constant re-export 与 UI comparator 必须随公开类型语义同步。
  - 状态风险：Redux shape、500 项 event-id 上限和 oldest-first 淘汰必须保持。
  - 性能风险：chunk cache 不得退化为 full-turn flatten，delta batch 不得退化为逐 delta revision/pulse 更新。
  - 测试风险：500 项 oldest-first 淘汰缺少直接测试；该项仅是专项设计内验证残余，不构成新架构 finding。
- 后续验证：继续以 transcriptState focused tests、selector cache/reattach 覆盖和 type-check 锁定公开边界；可补 event-id 窗口达到上限后的 oldest-first 淘汰回归测试，但不进入重构建议批次。
- 关键证据：
  - 专项设计 production/test/兼容边界：`docs/superpowers/specs/2026-07-11-codex-gui-transcript-state-split-design.md:39-116,118-171,186-225`。
  - Model 与有界状态：`transcriptStateModel.ts:4-141`；dedup 实现：`transcriptEventDedup.ts:1-18`。
  - Materialization 单向依赖与调用：`transcriptEntryMaterialization.ts:1-77`、`transcriptCommittedProjection.ts:1-11,145-183`。
  - Selector/cache 与 facade：`transcriptStateSelectors.ts:9-53`、`transcriptStateSlice.ts:23-80,160-170`。
  - UI consumer/equality：`CommittedTranscriptSurface.tsx:3-14,84-100,166-174,220-279`、`committedTranscriptChunkEquality.ts:1-59`。
  - 六类测试分布：Streaming/Lifecycle/Index/Scroll/Replay-Dedup/Committed 为 `6/5/3/4/3/9`。
- 关联专项设计：`docs/superpowers/specs/2026-07-11-codex-gui-transcript-state-split-design.md`。
- 已排除项：R04 timeline materials 的采用状态、R06 组件/Markdown/sticky 拆分、03 action dispatch 实现、历史测试体逐字等价与本轮未运行的工具链验证。
- 报告建议：保留为“已有专项设计／非 finding”，不进入重构建议批次；只在后续验证清单记录 event-id 窗口直接测试。

#### R04 交界

- 交界引用: [RA-04-001](./04-timeline-materials-and-domain-models.md#ra-04-001)
- 本报告仅使用的交界事实: R04 timeline materials 当前无 production consumer，且缺少 Transcript State 所需的 attach 元数据、event identity/replay 与 delta 语义；R05 只引用该未接入边界，不重复建立 finding。
- Evidence owner: `04-timeline-materials-and-domain-models.md`

#### R06 交界

- 交界引用: [RA-06-001](./06-transcript-rendering-streaming-and-scroll.md#ra-06-001)
- 本报告仅使用的交界事实: R05 只确认公开 selectors/view cache 到 UI equality 的单向依赖；组件拆分、Markdown、sticky 与渲染组织由 R06 拥有。
- Evidence owner: `06-transcript-rendering-streaming-and-scroll.md`

## 已排除项

状态：已记录。

- 未审计 03/04/06 跨 feature 边界、UI/consumer、thread runtime 或 projection ingress 语义。
- 未运行测试、build、type-check、lint、format，也未核对删除前测试体的历史等价性。
- `R05-MATERIALIZATION` 仅通过精确 production import/call 搜索确认外部 React consumer 的存在，未读取或判断其实现，也未把公开 facade 消费误记为反向依赖。
- `R05-BOUNDARIES/ACTION-TIMELINE` 未读取 03 action dispatch 实现，未进入 projection 算法或 selector-to-React，也未预判后续子阶段。
- `R05-BOUNDARIES/SELECTOR-REACT` 未重审 R06 组件拆分、Markdown、sticky、具体 UI 布局或 reducer/projection 算法。

## 风险

状态：已记录。

- 当前映射只能确认结构、职责和测试题目分布，不能替代运行时验证，也不能仅凭当前文件证明原 30 个测试断言逐字迁移。
- 500 项 event-id oldest-first 淘汰缺少直接测试时，只能记为专项设计内验证残余；后续可补直接回归锁，但不能据此推导新的 production 设计缺口，也不进入建议批次。
- Materialization 结论基于静态定义、导入和直接调用闭包；本节点未运行 type-check。外部 consumer 继续依赖 slice facade 属于既有兼容策略，不构成待迁移 import path。
- 若未来让 timeline materials 成为 Transcript State 输入，必须补回 attach、event identity/replay 和 delta 语义，属于新的 03/04/05 联合设计；不能把当前未接入状态当作 05 内部清理直接实施。
- `committedTranscriptChunkEquality.ts` 与 `TranscriptEntry` 可渲染字段存在显式契约；未来新增 entry variant 或渲染字段时必须同步审查 comparator。当前 message/status 字段均已覆盖，该维护风险不形成 finding。
