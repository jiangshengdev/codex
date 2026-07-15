# Codex GUI Replay Index 单一 Owner 设计

状态：已确认

## 背景

Codex GUI 重构审计的 B04 / `RA-03-002` 发现，snapshot replay classification 使用的 index 当前被重复构造和持有：

- `GuiHostConnectionBridge` 在连接生命周期内维护一份 nullable index，并用它对 accepted projection event 分类。
- `threadRuntimeSlice` 在处理 accepted attach 时，从同一份 snapshot turns 构造另一份 index，并将其保存在 `ThreadRuntimeRecord`。
- production 路径没有读取 Redux record 中的 index；实际分类只使用 Bridge-local index。

这不是已复现的功能错误，也不要求改变 replay 算法。问题在于同一份派生状态存在两个 owner，生命周期需要依靠两条路径保持一致，增加了后续 application coordination 重构的歧义。

## 目标

- 将 snapshot replay baseline index 收敛为一个运行时实例。
- 由当前 `GuiHostConnectionBridge` coordination 生命周期继续持有唯一 index。
- 删除 Redux runtime record 中没有 production 消费者的重复 retained state。
- 保持 projection ingress、replay classification、runtime action、transcript consumer 和用户可见行为不变。
- 保持 B04 与 B05 独立；本设计不提前抽取新的 application coordination owner。

## 非目标

- 不抽取新的 coordinator、hook、service、controller 或 classifier 对象。
- 不把 replay classification 移入 `ProjectionIngressAdapter`、Redux listener、thunk 或 reducer 内部。
- 不修改 adapter 的 thread、subscription、commit-chain、known-turn 或 manual reconnect 判定。
- 不修改 delta batching、RAF flush、transport callback 或 connection teardown。
- 不修改 `ThreadRuntimeEventReplay` 的值域或分类算法。
- 不修改 `threadRuntimeEventBuffered` 的 payload、event buffer 或 consumer 行为。
- 不修改 `snapshotTurns`、active turn、subscription 或现有 selectors。
- 不进入 B05 application coordination 抽取、B06 单条 delta action 清理、B07 timeline-material 管道或 B08 test helper owner 迁移。
- 不修改 wire protocol、Rust app-server、attach snapshot 或 snapshot physical boundary。
- 不创建宽泛的 `shared`、`common`、`utils` 或通用 lifecycle 抽象。

## 已确认方案

采用 Bridge 最小收敛方案：

- `GuiHostConnectionBridge` 的 local `snapshotReplayIndex` 是唯一运行时 owner。
- `ThreadRuntimeRecord` 不再保存 `snapshotReplayIndex`。
- `threadRuntimeAttached` 不再从 snapshot turns 构造或写入 Redux index。
- `SnapshotReplayIndex`、`snapshotReplayIndexFromTurns` 和 `replayForProjectionEvent` 继续位于 `threadRuntimeSlice.ts`，因为它们仍定义 thread runtime replay action 使用的领域语义。
- 不新增模块、action、middleware 或对象封装。

未采用的替代方案：

- 独立 classifier：能够显式封装 `reset / replaceBaseline / classify`，但当前只有一个消费者，会为 B04 过早增加抽象，并提前影响 B05 的 owner 设计。
- `ProjectionIngressAdapter` 持有 index：能够把 attach 与 event 串行状态集中到同一对象，但会把 runtime/transcript replay 语义引入 ingress acceptance 边界。
- Redux 持有并在 listener/thunk 中分类：需要新增 raw/classified 两阶段 action 或 middleware；仅靠一个 reducer 无法为同时消费 action 的 `transcriptState` 补充 replay 值。

## Owner 与数据流

当前数据流保持为：

```text
protocol attach/event
  -> GuiHostConnectionBridge 执行现有 thread identity pre-gate
  -> ProjectionIngressAdapter 接受或拒绝进入其边界的输入
  -> GuiHostConnectionBridge 维护唯一 snapshot replay baseline
  -> replayForProjectionEvent 生成 live | snapshotDuplicate
  -> threadRuntimeEventBuffered({ notification, replay })
  -> threadRuntimeSlice 与 transcriptStateSlice 消费同一个已分类 action
```

职责边界如下：

- `GuiHostConnectionBridge` 继续在调用 adapter 前执行现有 launch/attached thread identity pre-gate。
- `ProjectionIngressAdapter` 只决定进入其边界的输入是否 accepted、ignored 或需要 manual reconnect，不拥有 replay baseline。
- `GuiHostConnectionBridge` 继续负责在 accepted attach 与 accepted event 之间维持当前 replay baseline 生命周期。
- `threadRuntimeSlice.ts` 继续定义 replay 类型、纯 index 构造和纯分类算法，但 Redux state 不持有 index。
- `threadRuntimeSlice` 与 `transcriptStateSlice` 只消费 caller 已经分类的 event，不重新分类。

## 生命周期不变量

### New launch

收到新的 launch params 时，Bridge 必须清除旧的 local baseline。此行为只重置 replay classification 的 local 状态，不扩大为清除 Redux runtime record 或改变 connection 生命周期。

### Accepted attach

只有 attach 先通过 Bridge 现有 thread identity pre-gate，并由 `ProjectionIngressAdapter` 返回 `attachAccepted` 时，Bridge 才能从 `response.snapshot.thread.turns` 构造 index。

新的 accepted attach 必须完整替换旧 baseline，不得与旧 baseline 合并。替换后：

- 新 snapshot 中存在的 turn/item 可以被分类为 `snapshotDuplicate`。
- 只存在于旧 snapshot 的 turn/item 必须按当前新 baseline 分类，不能继续命中旧 index。

### Rejected or mismatched attach

未通过 Bridge thread identity pre-gate 的 wrong-thread attach，以及未获得 `attachAccepted` outcome 的 attach，不得建立或替换 baseline。本设计不新增 stale attach 概念，也不改变现有 pre-gate 与 adapter 的职责分配。

如果此前已有合法 baseline，未接受的 attach 之后仍继续使用该合法 baseline；不能把 mismatch 当作 reset。

### Accepted event

事件必须先通过 ingress acceptance，之后才进入 replay classification。

- 没有 baseline 时，accepted event 继续分类为 `live`。
- 有 baseline 时，Bridge 使用 `replayForProjectionEvent` 生成 replay 值。
- ignored、commit mismatch、missing turn 或 manual reconnect 闭锁期间的 event 不得仅因本设计而被分类或 dispatch。

## 分类语义

现有算法保持不变：

- `turnStarted`：snapshot 中存在同 ID turn 时为 `snapshotDuplicate`。
- `turnCompleted`：snapshot 中存在同 ID turn，且 snapshot status 与 event status 相同时为 `snapshotDuplicate`；snapshot 为 `inProgress`、event 为 completed 时仍为 `live`。
- `itemStarted` / `itemCompleted`：snapshot 中存在同 ID item 时为 `snapshotDuplicate`。
- 其他未命中的 accepted event 为 `live`。

`snapshotDuplicate` 仍进入 thread runtime event buffer，但不得按 live event 再推进 active turn 或 transcript projection。`live` event 的现有处理保持不变。

## Redux State 收敛

`ThreadRuntimeRecord` 删除 `snapshotReplayIndex` 后，其余 shape 保持不变：

- `threadId`
- `sessionId`
- `thread`
- `snapshotTurns`
- `eventBuffer`
- `activeTurnId`
- `subscription`

`snapshotTurns` 继续作为原始 snapshot 数据供现有消费者使用。本设计不以 selector 重新派生 index，因为 production classification 不从 Redux 发起；Redux 不应保留无法被 production 消费的派生副本。

测试 fixture 和完整对象断言必须随 state shape 删除该字段，但这属于结构性更新，不代表行为语义变化。

## 错误与异常边界

本设计不新增错误类型或恢复路径。所有异常行为继续由现有层负责：

- ingress continuity 或 subscription 问题由 `ProjectionIngressAdapter` 返回 ignored 或 manual reconnect outcome。
- connection/transport 错误继续由 GUI Host connection 路径处理。
- replay classifier 仍是纯函数，不抛出新的业务错误。

如果实施时发现必须修改 adapter outcome、runtime action payload、transcript consumer 或 connection teardown，视为超出 B04，必须停止并重新确认设计。

## 测试设计

测试目标是证明“状态 owner 收敛，外部行为零变化”。

### 保留的回归基线

- 保留纯分类矩阵，覆盖 turn started、turn completed status 差异、item started/completed、命中与未命中 baseline。
- 保留现有 App 级 snapshot-ahead handoff 覆盖，证明 accepted contiguous event 仍能被标记为 `snapshotDuplicate`。
- 保留 runtime 对 `snapshotDuplicate` 和 `live` 的既有消费差异测试。

### 定向补齐的生命周期覆盖

- replacement baseline：先建立旧 baseline，再接受 replacement attach；证明新 baseline 命中 duplicate，旧 baseline 独有 ID 已变为 live。
- mismatch 保留：已有合法 baseline 后收到未接受的 attach；证明 runtime 与原 baseline 均未被替换。
- new launch reset：通过代码结构验收确认 new launch 仍显式清除 Bridge-local baseline；通过“new launch 后接受新 attach”的组合覆盖证明后续 classification 只使用新 snapshot。由于 local index 不可从现有黑盒接口独立观察，本设计不为 reset 单独新增 seam、classifier 或测试 API，也不把该断言扩大为 launch 自动清空 Redux runtime。

新增合法 projection payload 变体时，继续复用或扩展共享 projection fixtures/builders，不在测试中手写完整协议对象。

### 结构性验收

- production `ThreadRuntimeRecord` 不再 retained `snapshotReplayIndex`。
- production classification 只使用 Bridge-local index。
- 测试 fixture 和完整对象断言不再构造 Redux index 字段。

## 与 B05 的关系

B04 完成后，Bridge 仍拥有 adapter、replay baseline、delta queue、outcome mapping 和 teardown 等 coordination 职责。本设计只固定 replay baseline 的唯一 owner，不判断 B05 最终采用 hook、service、controller 或其他协调结构。

B05 后续可以把已经收敛的 replay baseline 生命周期随整体 application coordination 一起迁移，但不得重新引入第二份 retained index。B04 只约束单一 owner 和既有外部分类语义，不冻结 B05 的内部接口形态；如需改变外部分类语义，必须另行设计确认。

## 风险与控制

- **误删分类算法：** 只删除 Redux record 字段和 attach reducer 中的重复构造；纯类型与算法保留。
- **replacement 仍携带旧 membership：** 用 replacement baseline 集成覆盖锁定完整替换语义。
- **mismatch 意外 reset：** 用已有合法 baseline 后的 mismatch 覆盖锁定“不替换、不清除”。
- **launch reset 范围扩大：** 使用代码结构验收和 new-launch-plus-replacement 组合覆盖，不为不可观察的 local reset 新增测试 seam，也不新增 runtime reset 契约。
- **提前进入 B05：** 不新增 coordination 抽象，不移动 adapter 生命周期、batching、dispatch mapping 或 teardown。
- **Redux fixture 漂移：** 统一更新共享 builder 和完整对象断言，不保留 test-only index 字段。

## 接受标准

- `GuiHostConnectionBridge` 是唯一 snapshot replay baseline 运行时 owner。
- `ThreadRuntimeRecord` 与 attach reducer 不再保存或构造 `snapshotReplayIndex`。
- replay 类型、分类函数、action payload、event buffer 和 transcript consumer 语义不变。
- new launch、accepted replacement attach、mismatched attach 和 accepted event 的生命周期符合本设计。
- production 中不存在第二份 retained replay index。
- 定向生命周期测试与现有 replay 回归覆盖通过。
- 未引入新的模块、action、middleware、coordination 抽象或跨批次修改。

## 参考

- `docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/00-summary.md`
- `docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/03-projection-ingress-and-thread-runtime.md`
- `docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/09-cross-cutting-boundaries-and-exclusions.md`
- `docs/superpowers/specs/2026-07-01-codex-gui-projection-snapshot-replay-recovery-design.md`
- `codex-gui/src/features/appShell/GuiHostConnectionBridge.tsx`
- `codex-gui/src/features/projectionIngress/projectionIngressAdapter.ts`
- `codex-gui/src/features/threadRuntime/threadRuntimeSlice.ts`
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts`
