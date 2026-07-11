# 03 Projection Ingress 与 Thread Runtime

状态：完成

## 审计范围

状态：完成。

计划范围：projection ingress、thread runtime、thread identity 与 reconnect 契约。

Bridge application coordination、adapter filtering/reconnect、thread runtime state/action 与 thread identity/reconnect 四个覆盖域均已完成审计。

## 范围交界

状态：完成。

- [RA-02-001](./02-gui-host-transport-and-protocol.md#ra-02-001)、[RA-02-002](./02-gui-host-transport-and-protocol.md#ra-02-002) 与 [RA-02-003](./02-gui-host-transport-and-protocol.md#ra-02-003) 拥有 launch、wire decoding、transport 与 connection/notification 输入交界；本报告从 typed handoff 之后开始，不复制 wire、handshake 或 transport 论证。
- [RA-04-001](./04-timeline-materials-and-domain-models.md#ra-04-001) 拥有 snapshot/live timeline material producer 与领域转换；本报告只确认 accepted event/runtime state 是其上游输入，不进入 timeline material 内部。
- [RA-05-001](./05-transcript-state-and-materialization.md#ra-05-001) 拥有 transcript action consumer、Redux state/materialization 与既有 transcript 专项设计；本报告只核对 runtime action source 交界，不复制 transcript reducer 或拆分论证。
- 禁止扩张：协议重设计、timeline owner、transcript 内部拆分及相邻报告已拥有的专项设计。

## 审计进度

| 微阶段 | 状态 | 压缩结论 | Finding ID / 覆盖状态 | 关键证据 |
| --- | --- | --- | --- | --- |
| Bridge → ingress handoff | 已完成 | Bridge 同时承担连接与 adapter 生命周期、身份预检、outcome 到 Redux 映射、snapshot replay 分类、delta RAF batching/flush 和 teardown，形成 application coordination 职责集中；adapter 自身依赖方向清晰。 | RA-03-001 | `GuiHostConnectionBridge.tsx:41-203`、`projectionIngressAdapter.ts:20-190`、`App.browser.test.tsx:55-64,259-415,746-889` |
| Adapter filtering/batching/reconnect 契约 owner | 已完成 | Adapter 内聚拥有 thread/subscription/commit/known-turn/manual-reconnect filtering，并以判别联合输出结果；类型 owner 与依赖方向合理。RAF batching 归 RA-03-001，单条 delta action 交界由 RA-03-003 覆盖。 | RA-03-005；已由现有抽象覆盖/非 finding | `projectionIngressAdapter.ts:9-190`、`projectionIngressAdapter.test.ts:60-258`、production 类型消费者 |
| thread runtime 与 identity state 边界 | 已完成 | Runtime Redux state 与 Bridge-local replay index 重复持有同一 snapshot index，且 Redux 字段无生产读取者；identity 与 runtime 主生命周期分工清晰。 | RA-03-002；RA-03-004 已由现有抽象覆盖/非 finding | `threadRuntimeSlice.ts:41-50,72-83,111-124`、`GuiHostConnectionBridge.tsx:46,97-107,132-154`、`codex-gui/src` production 引用与生命周期测试 |
| runtime delta action owner | 已完成 | 单条 `threadRuntimeDeltaAccepted` 已无生产 dispatch，但仍作为 transcript 类型来源和测试兼容入口；batch action 当前 owner 证据不足，保留为非 finding。 | RA-03-003；batch action 非 finding | `threadRuntimeSlice.ts:127-134,202-208`、`GuiHostConnectionBridge.tsx:47-50,61-71,84-89`、transcript action consumers |
| 报告完成门禁 | 已完成 | Bridge、adapter、thread runtime、thread identity/reconnect 四个覆盖域及测试文件覆盖状态均已核对；相邻 owner 与排除范围明确。 | RA-03-001 至 RA-03-005；001-003 确认重构点，004-005 已由现有抽象覆盖/非 finding | 本报告“Findings”“测试文件覆盖状态”“已排除项”章节 |

## Findings

状态：完成。

### RA-03-001 Bridge 集中承担 projection application coordination

- **Finding ID：** `RA-03-001`。
- **主报告：** `03-projection-ingress-and-thread-runtime.md`。
- **Evidence owner：** `03-projection-ingress-and-thread-runtime`。
- **状态：** 确认重构点。
- **重构优先级：** P2。
- **结论摘要：** `GuiHostConnectionBridge` 不只是连接和 notification 的薄 handoff。它在同一个 React effect 中同时拥有连接与 `ProjectionIngressAdapter` 生命周期、launch/attach 身份预检、adapter outcome 到 Redux action 的映射、snapshot replay 分类、projection delta 的 RAF batching/flush 以及连接和 pending frame teardown，形成 application coordination 职责集中。`ProjectionIngressAdapter` 自身只依赖生成协议类型并维护 ingress cursor，依赖方向清晰；本 finding 不声称当前存在功能 bug。
- **当前 owner 与当前职责：** `GuiHostConnectionBridge` 启动和清理 GUI host connection，依据 launch thread 构造并持有 adapter，观察 attached identity，在进入 adapter 前拦截不匹配 attach，持有 snapshot replay index，将 adapter outcome 转换为 thread identity/thread runtime Redux action，并通过 animation frame 批量投递 delta、在 attach/event/manual reconnect 前刷新 pending delta。`ProjectionIngressAdapter` 负责 thread/subscription/commit chain/known turn/manual reconnect cursor，以及 attach/event/delta/closed 的 accepted、ignored 或 manual reconnect 判定。
- **问题类型：** application coordination 职责集中、生命周期混合、具体依赖耦合；不是 adapter 的依赖倒置、循环依赖或 wire protocol 问题。
- **影响文件、定义侧、构造方、调用方和消费方：**
  - 定义侧：`codex-gui/src/features/projectionIngress/projectionIngressAdapter.ts:20-54` 定义 outcome、ignored/manual reconnect reason 与 ingress cursor；同文件 `56-190` 定义 adapter 及四类 ingress 处理。
  - 构造方：`codex-gui/src/features/appShell/GuiHostConnectionBridge.tsx:127-138` 启动连接，并在 launch params 到达时按 thread ID 构造 adapter、重置 snapshot replay index 和记录 launch identity。
  - 调用方：`GuiHostConnectionBridge.tsx:139-176` 观察 attached identity、执行 attach 预检，并调用 `handleAttach`、`handleEvent`、`handleDelta`、`handleClosed`。
  - 协调与映射方：`GuiHostConnectionBridge.tsx:52-125` 拥有 delta RAF queue/flush、snapshot replay 分类以及 outcome 到 thread runtime action 的映射；同文件 `196-203` 同时清理 frame 与 transport connection。
  - 消费方：thread identity 与 thread runtime Redux action 消费 accepted outcome；`App.browser.test.tsx:259-415` 通过真实 Bridge、adapter 和 store 验证 attach/event/delta handoff，`746-831` 验证 mismatch 与 manual reconnect，`833-889` 验证 connection/frame teardown。
- **共同语义或变化原因：** adapter 判定、Redux runtime 推进、snapshot replay 分类与 delta 顺序共同决定一条 notification 是否被接受、以何种 replay 语义投递，以及结构事件或 reconnect 前是否必须先提交 pending delta；这些属于同一 application ingress coordination 流程。React 连接挂载、commands/status handoff 和 WebSocket transport 则有不同变化原因，只在当前 Bridge 中与该流程共享生命周期容器。
- **推荐边界、建议 owner 和允许的依赖方向：** application coordination owner 应统一拥有 adapter 生命周期、accepted outcome 的顺序语义、snapshot replay classification、delta batching/flush 与 runtime dispatch 契约；React Bridge 只负责挂载/卸载连接并把 typed connection/notification 输入交给该 owner。依赖方向应保持 wire/transport input → application coordination → projection ingress 与 Redux runtime ports；`ProjectionIngressAdapter` 继续保持对 React、Redux、app shell 和 GUI host transport 无感。本报告只描述职责边界，不指定具体类、hook、文件或实现技术。
- **预期收益：** 将协议 ingress 判定之后的顺序和状态推进集中为可识别的 application boundary，降低 React lifecycle、transport callback、replay 语义与 Redux action 变化互相牵动的范围；保留 adapter 的纯领域依赖方向，并使 connection teardown 与 projection ordering 的审查边界更明确。
- **建议变更范围、最小可审查批次和明确排除范围：** 最小批次只移动或封装 Bridge 当前已有的 application coordination 职责，保持公开 connection callbacks、adapter accepted/ignored/manual reconnect 语义、Redux action payload、delta RAF 批次与 flush 顺序、identity observation 和 teardown 行为不变。明确排除 timeline material、transcript reducer、wire shape、RPC 方法、runtime protocol decoder 和服务端协议重设计。
- **风险：** 边界调整可能改变 pending delta 与 attach/event/closed 的相对顺序，导致 completion/reconnect 前 transient delta 丢失或延迟；也可能破坏 mismatch attach 下“记录 attached identity 但不推进 runtime”、manual reconnect 后抑制后续 notification、adapter 随 launch thread 重建，以及卸载时同时取消 frame 和关闭 connection 的行为。
- **后续实施时建议的验证范围：** 保持现有 App browser 覆盖，并验证 accepted attach/event 进入 runtime、同一 frame delta 合并、结构事件和 closed/manual reconnect 前 flush、mismatch attach 不推进 runtime、manual reconnect 后忽略后续 event、unmount 取消 pending frame 且只清理一次 connection。本轮未运行测试。
- **关键证据：** `GuiHostConnectionBridge.tsx:41-50` 同时持有 connection cleanup、adapter、snapshot index 与 delta queue；`:52-89` 管理 RAF batching/flush；`:91-125` 映射 outcome、计算 replay 并控制 flush；`:127-181` 组合 connection callbacks、adapter 构造与四类 ingress；`:196-203` 执行联合 teardown。`projectionIngressAdapter.ts:56-67` 仅初始化 ingress cursor，`:69-135` 处理 attach/event/delta/closed，`:137-190` 封装 notification identity、manual reconnect 与 known turn 规则。
- **关联的既有报告、issue 或专项设计：** [RA-02-001](./02-gui-host-transport-and-protocol.md#ra-02-001)、[RA-02-002](./02-gui-host-transport-and-protocol.md#ra-02-002) 与 [RA-02-003](./02-gui-host-transport-and-protocol.md#ra-02-003) 拥有 launch/transport/protocol 及 connection/notification 输入侧交界；本 finding 接续 typed handoff，不复制其证据。无直接关联 issue 或专项设计。
- **已排除项：** 排除“production handoff 缺少测试覆盖”。`App.browser.test.tsx:55-64` 只 mock `startGuiHostConnection` facade，实际挂载真实 App、Bridge、adapter 和 Redux store；同文件 `259-291` 覆盖 accepted attach/event handoff，`293-415` 覆盖 delta batching 与结构事件前 flush，`746-831` 覆盖 mismatch/closed/manual reconnect，`833-889` 覆盖 transport 与 pending frame teardown。未发现 adapter 反向依赖 React、Redux、app shell 或 GUI host transport；不将职责集中解释为已复现功能 bug。
- **报告建议：** 保留为 `RA-03-001`、状态“确认重构点”、优先级 P2；后续设计只确定 application coordination 的职责和依赖方向，不能据此进入 timeline material、transcript reducer 或协议重设计。

### RA-03-002 Snapshot replay index 在 Bridge 与 Redux runtime 重复持有

- **Finding ID：** `RA-03-002`。
- **主报告：** `03-projection-ingress-and-thread-runtime.md`。
- **Evidence owner：** `03-projection-ingress-and-thread-runtime`。
- **状态：** 确认重构点。
- **重构优先级：** P2。
- **结论摘要：** `ThreadRuntimeRecord.snapshotReplayIndex` 在 accepted attach 时由 Redux slice 构造并保留，同时 `GuiHostConnectionBridge` 为实际 event replay classification 单独构造和持有同内容 index。对 `codex-gui/src` 的 production 引用核对（排除测试代码）表明 Redux record 字段没有生产读取者，实际分类只使用 Bridge-local index；这是重复状态与 owner 不唯一的重构点，不是已复现功能 bug，也不作为性能 finding。
- **当前 owner 与当前职责：** `threadRuntimeSlice` 定义 `SnapshotReplayIndex`、构造函数与 `replayForProjectionEvent`，并在 `threadRuntimeAttached` 中把 index 存入 `ThreadRuntimeRecord`。Bridge 在 effect 内另持有 nullable index，在 launch 时清空、accepted attach 时从 snapshot turns 重建，并在每个 accepted event 进入 Redux 前调用同一 classification helper。Redux runtime 的其他生产消费者读取 `snapshotTurns`、thread identity、event buffer、active turn 与 subscription，但不读取 record 内的 `snapshotReplayIndex`。
- **问题类型：** 重复状态、生命周期 owner 不唯一、无生产消费者的 retained Redux 字段；不是 replay 算法错误或性能回归。
- **影响文件、定义侧、构造方、调用方和消费方：**
  - 定义侧：`codex-gui/src/features/threadRuntime/threadRuntimeSlice.ts:41-50` 把 `snapshotReplayIndex` 定义为 runtime record 字段；`:72-83` 定义 index shape 与 snapshot 构造；`:85-105` 定义 replay classification。
  - Redux 构造方：`threadRuntimeSlice.ts:111-124` 在 accepted attach reducer 中从 `snapshotTurns` 构造并保存 index。
  - 实际生产构造与调用方：`codex-gui/src/features/appShell/GuiHostConnectionBridge.tsx:46` 持有 local index；`:97-107` 使用它分类 accepted event；`:132-154` 在 launch/accepted attach 边界重置或重建。
  - 生产消费者核对：`codex-gui/src` 中排除测试代码的 `snapshotReplayIndex` 引用，除 slice 字段构造外只剩 Bridge-local index；`snapshotReplay.ts:54-97` 从 runtime record 消费 `snapshotTurns` 与 `threadId`，不读取该字段。
  - 测试构造与断言：`projectionTestBuilders.ts:98` 为测试 runtime fixture 构造该字段；`threadRuntimeSlice.test.ts:71-93` 断言 attach 后的完整 record。其余 `threadRuntimeSlice.test.ts:235-345` 直接构造 local index 测试 replay helper，不构成 Redux 字段的生产读取者。
- **共同语义或变化原因：** 两份 index 都由同一 accepted attach snapshot 派生，并服务于 snapshot duplicate 与 live event 的分类；其生命周期应随当前 attach/replay baseline 一致变化。当前一份跟随 Bridge effect，另一份跟随 Redux runtime record，但只有前者参与生产 classification。
- **推荐边界、建议 owner 和允许的依赖方向：** replay classification 应只有一个职责 owner，并只维护一份与当前 accepted attach baseline 同生命周期的 index。application coordination 与 thread runtime 只能通过该单一 replay classification 边界获得分类结果；本报告不指定 index 最终位于 Bridge、Redux、独立 owner 或其他具体实现。
- **预期收益：** 消除无生产读取的 Redux retained 字段和双重 snapshot index 构造，使 replay baseline 的重置、替换与读取路径只有一个事实来源，降低后续 attach/reconnect 生命周期调整时两份状态漂移的审查风险。
- **建议变更范围、最小可审查批次和明确排除范围：** 最小批次只统一 replay index owner 与生命周期，保持 `ThreadRuntimeEventReplay` 值域、`replayForProjectionEvent` 分类规则、accepted event payload、snapshot materials 和 Redux runtime 其余 state shape/selector 行为不变。明确排除 timeline material、transcript reducer、wire protocol 与 replay 算法重设计。
- **风险：** 清理重复字段时可能误删实际 classification 所需的 local baseline、改变 launch/attach replacement 时的 reset 顺序，或让 snapshot-ahead event 从 `snapshotDuplicate` 变为 `live`。测试 fixture 的完整对象断言也会随 state shape 调整，需要与生产引用清理区分。
- **后续实施时建议的验证范围：** 验证 accepted attach 建立唯一 replay baseline、new launch 清空旧 baseline、snapshot-ahead turn/item event 分类保持不变、mismatch attach 不建立 runtime/replay baseline，并核对所有生产 selector/material consumer 不依赖被清理字段。本轮未运行测试。
- **关键证据：** `threadRuntimeSlice.ts:41-50,72-105,111-124`；`GuiHostConnectionBridge.tsx:46,97-107,132-154`；`snapshotReplay.ts:54-97`；`projectionTestBuilders.ts:98`；`threadRuntimeSlice.test.ts:71-93,235-345`。`codex-gui/src` production 引用核对（排除测试代码）没有发现 `ThreadRuntimeRecord.snapshotReplayIndex` 读取；App browser 只作为直接 handoff 测试证据，不扩张 replay owner。
- **关联的既有报告、issue 或专项设计：** [历史 retained-state 报告](../2026-07-09-codex-gui-system-performance-check/05-retained-state.md) 曾记录 Bridge 与 Redux 重复 retained snapshot id map，但当时因消费者范围不明而未建立 finding；该历史报告不是本条 Evidence owner。本轮通过 production 引用核对补足证据；无直接关联 issue 或专项设计。
- **已排除项：** 不把 `snapshotTurns`、snapshot materialization 或 replay helper 本身判为错误 owner；不进入 timeline producer 或 transcript consumer 内部；不把测试 fixture/断言计为生产读取，也不声称重复 index 已导致状态错误或可测性能问题。
- **报告建议：** 保留为 `RA-03-002`、状态“确认重构点”、优先级 P2；后续设计只确定 replay classification 的单一职责 owner 与单一 index 生命周期，不指定具体实现代码。

### RA-03-003 单条 runtime delta action 已成为生产遗留与类型耦合

- **Finding ID：** `RA-03-003`。
- **主报告：** `03-projection-ingress-and-thread-runtime.md`。
- **Evidence owner：** `03-projection-ingress-and-thread-runtime`。
- **状态：** 确认重构点。
- **重构优先级：** P3。
- **结论摘要：** `threadRuntimeDeltaAccepted` 已没有生产 dispatch；生产 Bridge 只 dispatch `threadRuntimeDeltasAccepted` batch action。单条 action 仍由 thread runtime 导出，被 transcript reducer 注册为运行时 case、被 delta helper 用作参数类型来源，并被大量测试作为兼容入口 dispatch。这是局部生产遗留与类型耦合清理机会，不泛化为所有 no-op cross-slice action owner 错误，也不声称存在功能 bug。
- **当前 owner 与当前职责：** `threadRuntimeSlice` 同时定义并导出单条、批量 accepted delta no-op action，作为 transcript cross-slice signal。Bridge 的 queue 类型来自 batch action、flush 只 dispatch batch action，但 enqueue 参数仍通过单条 action payload 反推。`transcriptStateSlice` 同时消费两种 action；`transcriptLiveProjection` 的单条与批量 helper 也分别从两种 action payload 推导 notification 类型。
- **问题类型：** 无生产 dispatch 的兼容 action、跨 feature 类型耦合、局部遗留 API；batch action owner 证据不足，不属于本 finding。
- **影响文件、定义侧、生产方、消费方和测试：**
  - 定义与导出：`codex-gui/src/features/threadRuntime/threadRuntimeSlice.ts:127-134,202-208` 定义并导出单条和批量 no-op cross-slice action。
  - 唯一生产路径：`codex-gui/src/features/appShell/GuiHostConnectionBridge.tsx:47-50` 以 batch payload 定义 pending queue；`:61-71` 只 dispatch `threadRuntimeDeltasAccepted`；`:84-89` 的单条 action 引用仅用于 enqueue 参数类型，不产生运行时 action。
  - transcript 消费：`codex-gui/src/features/transcriptState/transcriptStateSlice.ts:137-142` 同时注册单条与批量 action；`transcriptLiveProjection.ts:106-125` 分别从两种 action 推导单条 notification 和 batch notifications 类型。
  - 测试兼容入口：`threadRuntimeSlice.test.ts:196-223` 验证两种 no-op action；`CommittedTranscriptSurface.browser.test.tsx:23,273` 及多个 `transcriptState` 测试直接 dispatch 单条 action。对 `codex-gui/src` 的 production 引用核对（排除测试代码）表明单条 action 没有运行时 dispatch；这些 transcript/App 测试只作为直接测试或消费交界证据，不扩张 action owner。
- **共同语义或变化原因：** 两种 action 都表达“projection ingress 已接受 delta，thread runtime 本身不改变 buffer，由 transcript 消费”的 cross-slice signal。随着 production handoff 改为 RAF batch，生产触发语义已经收敛为 batch；单条 action 只继续承担旧行为兼容与类型锚点。
- **推荐边界、建议 owner 和允许的依赖方向：** production accepted-delta signal 与其 payload 类型应反映当前唯一生产投递边界；transcript helper 应依赖稳定的 projection delta payload/type contract，而不是依赖无生产 dispatch action 反推类型。batch action 是否仍应由 thread runtime 拥有，当前证据不足，后续只能在保持现有 cross-slice 方向的前提下单独判断。本报告不指定具体类型文件或 action 删除方式。
- **预期收益：** 收敛生产 action surface，解除 transcript helper 与已无生产 dispatch action creator 的类型绑定，并区分真实 batch production contract 与测试兼容入口，减少后续 action owner 或 payload 调整时的双路径维护。
- **建议变更范围、最小可审查批次和明确排除范围：** 最小批次只核对并清理单条 action 的生产遗留、类型引用和测试兼容入口，保持 batch payload 顺序、RAF flush、transcript delta 行为与 batch action dispatch 不变。明确排除 transcript state 内部拆分、delta accumulation 算法、所有 no-op cross-slice action 的统一迁移，以及 batch action owner 重定性。
- **风险：** 直接移除单条 action 可能破坏大量测试 fixture、隐藏单条 delta 行为回归，或误把 helper 类型改为宽泛 payload；若同时调整 batch owner，则会扩大为跨 feature action 架构变更。清理必须区分测试兼容价值和生产 API 必要性。
- **后续实施时建议的验证范围：** 重新核对生产代码无单条 dispatch，验证 Bridge 仍只投递 batch action、batch 内顺序和同 item 聚合行为不变，并将现有单条 transcript 行为覆盖迁移到不依赖遗留 action creator 的输入边界。本轮未运行测试。
- **关键证据：** `threadRuntimeSlice.ts:127-134,202-208`；`GuiHostConnectionBridge.tsx:47-50,61-71,84-89`；`transcriptStateSlice.ts:137-142`；`transcriptLiveProjection.ts:106-125`。`codex-gui/src` production 引用核对（排除测试代码）显示单条 action 仅保留 type reference/consumer registration，没有 production dispatch；transcript 只作为 action consumer 交界证据，不扩张其 owner。
- **关联的既有报告、issue 或专项设计：** [live agent delta accumulation 计划](../../plans/2026-07-09-codex-gui-live-agent-delta-accumulation.md) 曾有意保留单条 action 作为 compatibility baseline，并在 batch action 中优化同 item delta；该历史计划不是本条 Evidence owner。本 finding 不否定该设计，只记录 production handoff 完全转为 batch 后的局部清理机会；无直接关联 issue。
- **已排除项：** 不把 `threadRuntimeDeltasAccepted` 判为错误 owner；不把所有 no-op cross-slice action 泛化为架构问题；不进入 transcript reducer/helper 的专项拆分；不重复 `RA-03-001` 的 RAF batching/flush finding，也不把测试中的单条 dispatch 误报为生产路径。
- **报告建议：** 保留为 `RA-03-003`、状态“确认重构点”、优先级 P3；后续设计仅处理单条 action 的生产遗留与类型耦合，batch action 保持非 finding，除非新增独立生产 owner 证据。

### RA-03-004 Thread identity 与 runtime 主生命周期边界已由现有抽象覆盖

- **Finding ID：** `RA-03-004`。
- **主报告：** `03-projection-ingress-and-thread-runtime.md`。
- **Evidence owner：** `03-projection-ingress-and-thread-runtime`。
- **状态：** 已由现有抽象覆盖。
- **重构优先级：** 非 finding。
- **结论摘要：** Thread identity 只维护 launch/observed/match 状态，thread runtime 只在 accepted attach 后维护 snapshot/event buffer/active turn/subscription；mismatch 不推进 runtime，composer 同时要求 identity 与 runtime subscription 可用。职责与生命周期边界清晰，不需要新增抽象或重构 finding。
- **当前 owner 与当前职责：** `threadIdentitySlice.ts:4-40` 拥有 current launch thread ID、observed attached thread ID 与 `none/attached/mismatch`，并在 new launch 时重置 observed identity。`threadRuntimeSlice.ts:41-67,107-188` 在 accepted attach 后拥有 current snapshot、bounded event buffer、active turn 与 active/manual-reconnect subscription。Bridge 负责按 accepted/mismatch 结果连接两者，Composer 只组合 selector 结果判断 availability。
- **问题类型或为何不是问题：** identity 的变化原因是 launch/attach 一致性，runtime 的变化原因是 accepted projection lifecycle；二者没有复制同一状态，也没有反向依赖。通过消费侧组合两个独立 gate 比合并 slice 或新增共享 lifecycle owner 更直接，因此为非 finding。
- **影响文件、定义侧、构造方、调用方和消费方：**
  - 定义侧：`codex-gui/src/features/threadIdentity/threadIdentitySlice.ts:4-47` 定义 identity state/action/selector；`codex-gui/src/features/threadRuntime/threadRuntimeSlice.ts:41-67,107-215` 定义 runtime state/action/selector。
  - 构造方：`GuiHostConnectionBridge.tsx:132-154` 记录 launch/attached identity，并只在 `attachAccepted` 后 dispatch runtime attach。
  - 调用方：Bridge 调用 identity/runtime actions；adapter outcome 是 accepted/mismatch 推进边界，不由 identity slice 解释协议。
  - 消费方：`ComposerTurnControl.tsx:43-55` 与 `composerTurnControlModel.ts:5-23` 组合 identity、runtime thread/subscription、commands/status；App browser 和 Composer tests 仅作为直接行为证据，不扩张 identity/runtime owner。
- **共同语义或变化原因：** identity 与 runtime 共同服务“当前连接是否可以推进同一 thread”，但分别表达一致性 gate 与 accepted runtime lifecycle；共同消费不要求共同存储。
- **推荐边界与保持现状：** 保持 identity slice、runtime slice 与 composer availability 的单向组合；Bridge 继续确保 mismatch 只记录 identity、不建立 runtime。不要合并 slices，也不要新增宽泛 session/lifecycle manager。
- **收益或避免的抽象成本：** 保持当前边界可避免把固定大小 identity state、runtime projection state 与 UI availability 混成新的共享 owner，减少 selector、action 和测试迁移成本。
- **建议范围与明确排除：** 保持现状；只在实施 `RA-03-002/003` 时验证既有 gates。明确排除 composer 内部重构、timeline material、transcript reducer、wire/transport 和新 lifecycle 抽象。
- **风险：** 后续 runtime state/action 调整可能误使 mismatch 建立 runtime、new launch 保留旧 identity、manual reconnect 继续允许推进，或只检查 identity 而漏掉 runtime subscription gate。
- **后续验证范围：** 保持 launch/matching/mismatch/reset slice tests、accepted attach/event/reconnect runtime tests、App mismatch/reconnect integration tests，以及 Composer 对 identity false、thread 缺失和 subscription 非 active 的 gate 测试。本轮未运行测试。
- **关键证据：** `threadIdentitySlice.ts:4-47`；`threadRuntimeSlice.ts:41-67,107-215`；`GuiHostConnectionBridge.tsx:91-96,132-154`；`ComposerTurnControl.tsx:43-55`；`composerTurnControlModel.ts:5-23`；`threadIdentitySlice.test.ts:16-72`；`threadRuntimeSlice.test.ts:53-193`；`App.browser.test.tsx:746-831`；`composerTurnControlModel.test.ts:24-69`。
- **关联的既有报告、issue 或专项设计：** [历史 retained-state 报告](../2026-07-09-codex-gui-system-performance-check/05-retained-state.md) 记录 thread identity 为固定大小 retained state，但不是本条 Evidence owner。[RA-03-001](./03-projection-ingress-and-thread-runtime.md#ra-03-001)、[RA-03-002](./03-projection-ingress-and-thread-runtime.md#ra-03-002) 与 [RA-03-003](./03-projection-ingress-and-thread-runtime.md#ra-03-003) 分别拥有 Bridge coordination、重复 replay index 与单条 delta action，不改变 identity/runtime 主生命周期结论；无直接关联 issue 或专项设计。
- **已排除项：** 不把 App browser 或 Composer test 当作 owner 证据；不把双门禁误报为重复状态；不因两个 slice 共同参与 connection usability 就建议合并。
- **报告建议：** 记录为 `RA-03-004`，状态“已由现有抽象覆盖”，重构优先级“非 finding”；保持现有 identity/runtime 生命周期边界。

### RA-03-005 Adapter filtering/reconnect 契约已由现有抽象覆盖

- **Finding ID：** `RA-03-005`。
- **主报告：** `03-projection-ingress-and-thread-runtime.md`。
- **Evidence owner：** `03-projection-ingress-and-thread-runtime`。
- **状态：** 已由现有抽象覆盖。
- **重构优先级：** 非 finding。
- **结论摘要：** `ProjectionIngressAdapter` 内聚拥有 thread/subscription/commit/known-turn/manual-reconnect filtering，并以判别联合输出 accepted/ignored/reconnect 结果；它不直接依赖 Redux、React 或 transport，输出类型 owner 与依赖方向合理。
- **当前 owner 与当前职责：** Adapter cursor 保存 thread ID、subscription ID、head commit ID、known turn IDs 与 manual reconnect 状态；四类入口统一执行 filtering、commit continuity、known-turn 前置条件和 reconnect 闭锁。`ProjectionIngressOutcome` 与 `ProjectionManualReconnectReason` 由 projectionIngress feature 定义，下游只穷举、透传或消费。
- **问题类型或为何不是问题：** filtering 状态与四类输入判定围绕“一条 projection 输入能否进入 application runtime”共同变化，职责内聚；判别联合形成稳定输出边界，adapter 没有反向依赖。仅因类型与 class 位于同一文件不构成 owner 问题，因此为非 finding。
- **影响文件、定义侧、构造方、调用方和消费方：**
  - 定义侧：`codex-gui/src/features/projectionIngress/projectionIngressAdapter.ts:9-54` 定义 reason/outcome/cursor，`:56-190` 定义 adapter 与 filtering/reconnect 规则。
  - 构造方：`GuiHostConnectionBridge.tsx:132-138` 按 launch thread 构造 adapter。
  - 调用方：`GuiHostConnectionBridge.tsx:139-176` 调用 attach/event/delta/closed 四类入口，并在 `:91-125` 穷举 outcome。
  - 消费方：`threadRuntimeSlice.ts:3,12-18,56-60` 透传 reconnect reason；`transcriptStateModel.ts:1,51-56` 与 `liveEventHandling.ts:11,44-50` 消费 interruption reason。transcript 只作为类型消费交界证据，不扩张 adapter owner。
- **共同语义或变化原因：** thread/subscription/commit/known-turn/manual-reconnect cursor 共同决定 projection 输入是否有效以及是否需要人工重连；这些规则随 ingress contract 一起变化。
- **推荐边界与保持现状：** 保持 adapter 对 generated projection payload 的单向依赖、判别联合输出以及 projectionIngress feature 的 reason/outcome type owner；Bridge 继续作为 application consumer。不要把 filtering 分散到 Redux、React 或 transport。
- **收益或避免的抽象成本：** 保持当前抽象避免新增宽泛 protocol/common 层、重复 cursor 或跨 feature filtering helper，也避免下游重新定义 reason/outcome 值域。
- **建议范围与明确排除：** 保持 adapter filtering/reconnect 边界；RAF batching 归 `RA-03-001`，单条 delta action 归 `RA-03-003`。明确排除 Bridge coordination、runtime action owner、timeline material、transcript reducer 与 wire protocol 重设计。
- **风险：** 后续若移动 adapter 或输出类型，可能破坏 replacement attach reset、delta 不推进 commit head、manual reconnect 后抑制后续 notification，或让下游不再穷举 outcome。
- **后续验证范围：** 保持 attach/contiguous event、matching delta、identity filtering、duplicate/commit mismatch、missing turn、reconnect suppression/reset 与 closed backpressure adapter tests；Bridge RAF 行为继续由 App browser 测试覆盖。本轮未运行测试。
- **关键证据：** `projectionIngressAdapter.ts:9-190`；`projectionIngressAdapter.test.ts:60-258`；`GuiHostConnectionBridge.tsx:91-125,132-176`；`threadRuntimeSlice.ts:3,12-18,56-60`；`transcriptStateModel.ts:1,51-56`；`liveEventHandling.ts:11,44-50`。
- **关联的既有报告、issue 或专项设计：** [RA-03-001](./03-projection-ingress-and-thread-runtime.md#ra-03-001) 已把 Bridge RAF batching/application coordination 与 adapter filtering 分开；[RA-03-003](./03-projection-ingress-and-thread-runtime.md#ra-03-003) 已拥有单条 delta action coupling。本 finding 只确认 adapter 现有 filtering/reconnect 抽象合理，不复制相邻 owner 论证；无直接关联 issue 或专项设计。
- **已排除项：** 不声称 adapter tests 覆盖 Bridge 私有 RAF；不因 reason/outcome 定义在 adapter 文件而报告类型归属问题；不把 transcript/Composer/App browser 消费或测试交界当作 adapter owner。
- **报告建议：** 记录为 `RA-03-005`，状态“已由现有抽象覆盖”，重构优先级“非 finding”；保持现有 adapter filtering/reconnect 边界。

## 测试文件覆盖状态

状态：完成。

| 文件 | 已读取行为范围 | Finding / 覆盖结论 |
| --- | --- | --- |
| `codex-gui/src/features/projectionIngress/__tests__/projectionIngressAdapter.test.ts` | attach/contiguous event、matching delta、wrong-thread/stale-subscription filtering、duplicate/commit mismatch、missing turn、manual reconnect 闭锁与 replacement attach reset、closed backpressure | `RA-03-005` 已由现有抽象覆盖；支持 `RA-03-001` 的 handoff 风险边界，不单独覆盖 Bridge RAF batching |
| `codex-gui/src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts` | 空 runtime、accepted attach baseline、active turn/event buffer、单条与批量 accepted delta no-op action | 支持 `RA-03-002` 的 Redux record 构造证据与 `RA-03-003` 的 action compatibility 证据；测试构造/断言不算生产读取或生产 dispatch |
| `codex-gui/src/features/threadIdentity/__tests__/threadIdentitySlice.test.ts` | launch identity、matching attach、mismatch、new launch reset 与 store 初始状态 | `RA-03-004` 已由现有抽象覆盖/非 finding |
| `codex-gui/src/__tests__/App.browser.test.tsx` | 真实 App/Bridge/adapter/Redux handoff、accepted attach/event、delta RAF batch/flush、mismatch 不推进 runtime、manual reconnect、composer disable、connection/frame teardown | `RA-03-001` 的 production handoff 集成证据，并支持 `RA-03-004`；明确排除“production handoff 缺少测试覆盖”，不扩张 owner |

## 已排除项

状态：完成。

- 已排除“production handoff 缺少测试覆盖”；现有 `App.browser.test.tsx` 覆盖真实 Bridge、adapter 与 Redux handoff。
- `RA-03-005` 已排除 `ProjectionIngressAdapter` 存在反向依赖或循环依赖；其依赖限定为生成协议类型。
- `RA-03-005` 已排除仅因 `ProjectionIngressOutcome` 与 `ProjectionManualReconnectReason` 定义在 adapter 文件就判定类型归属不当；两者表达 ingress 输出语义，production 消费者仅穷举、透传或消费。
- `RA-03-005` 的 adapter 单测不覆盖 Bridge 私有 RAF batching/flush，但该行为已有 `RA-03-001` 所列 App browser 覆盖；不将其重复记录为测试缺口 finding。
- 已排除把 `ThreadRuntimeRecord.snapshotReplayIndex` 的测试构造/完整对象断言计为 production 读取；`codex-gui/src` production 引用核对（排除测试代码）确认实际 replay classification 使用 Bridge-local index。
- 不把 `RA-03-002` 泛化为 snapshot turns、snapshot materials 或 replay 算法错误，也不把重复 index 写成性能 finding。
- 不把 `RA-03-003` 泛化为所有 no-op cross-slice action owner 问题；batch action 当前 owner 证据不足并保持非 finding。
- `RA-03-004` 记录 thread identity 与 runtime 主生命周期分工、mismatch 不推进 runtime 和 composer identity/runtime 双门禁已由现有抽象覆盖/非 finding。
- `02` 只拥有 wire/transport 输入交界；本报告不重复 transport、handshake 或 runtime protocol findings。
- `04` 拥有 timeline material producer，`05` 拥有 transcript action consumer 与既有 transcript 专项设计；本报告不复制其内部论证。
- 不进入 timeline material、transcript reducer、既有 transcript state 拆分设计或协议重设计。

## 风险

状态：完成。

- `RA-03-001` 后续边界调整必须保持 delta batching/flush、attach identity、manual reconnect suppression 和 teardown 的既有顺序与行为。
- `RA-03-005` 后续若调整 adapter 或其输出类型，必须保持 thread/subscription filtering、commit continuity、known-turn 前置条件、replacement attach reset、manual reconnect 闭锁和判别联合穷举消费。
- `RA-03-002` 后续统一 replay index owner 时必须保持 launch/attach replacement reset 与 snapshot duplicate classification，不得误删实际生产 baseline。
- `RA-03-003` 后续清理单条 action 时必须区分生产遗留与测试兼容价值，不得连带改变 batch dispatch、delta 顺序或 transcript 行为。
- `RA-03-004` 为非 finding；任何相关 state/action 调整仍必须保持 mismatch、manual reconnect 与 composer 双门禁。
