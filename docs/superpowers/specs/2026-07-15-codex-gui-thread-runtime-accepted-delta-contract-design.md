# Codex GUI Thread Runtime Accepted Delta Contract 设计

状态：已确认

## 背景

Codex GUI 重构审计的 B06 / `RA-03-003` 发现，`threadRuntimeDeltaAccepted` 已没有 production dispatch。当前 production projection 路径由 `ProjectionApplicationCoordinator` 收集 accepted delta，并在 RAF 或同步 flush boundary 上只 dispatch `threadRuntimeDeltasAccepted({ notifications })`。

单条 action 仍存在于以下位置：

- `threadRuntimeSlice` 中的 no-op cross-slice action 定义与导出；
- `ProjectionApplicationCoordinator` 和 Transcript State helper 的 notification 类型锚点；
- Transcript State 的单条 action reducer case；
- Thread Runtime、Transcript State 和 browser tests 中的兼容输入。

这形成了两个 accepted-delta Redux contract，但只有 batch contract 对应当前 production 投递边界。B05 已完成 projection application coordinator 抽取，并明确没有把 B06 并入其设计、计划、提交或验收。

这不是已复现的功能错误。本设计只清理无 production dispatch 的兼容 contract，不改变 delta batching、Transcript State、scroll 或渲染行为。

## 目标

- 删除无 production dispatch 的 `threadRuntimeDeltaAccepted`。
- 以 `threadRuntimeDeltasAccepted` 作为唯一 accepted-delta Redux contract。
- 让 coordinator 和 Transcript State 内部逻辑直接使用 generated protocol 的 `ThreadProjectionDeltaNotification` 类型，不再从 Redux action creator 反推 notification 类型。
- 将测试中的单条 accepted delta 输入改为单元素 batch，同时保持原 dispatch 边界和断言语义。
- 保持现有 batch 顺序、同 item 聚合、跨 item 隔离、缺失 live item no-op、revision、scroll signal 和渲染结果不变。

## 非目标

- 不修改 B05 `ProjectionApplicationCoordinator` 的职责、生命周期、flush boundary 或 teardown 顺序。
- 不修改 `ProjectionIngressAdapter` 的 acceptance、commit chain、known turn 或 manual reconnect 契约。
- 不修改 generated protocol、transport、WebSocket、Rust app-server 或 wire payload。
- 不改变 `threadRuntimeDeltasAccepted` 的 action 名称、payload shape 或 owner。
- 不重新设计 Transcript State 数据模型、delta bucket、selector、timeline material、Markdown 或 rendering pipeline。
- 不合并测试中原本独立的相邻单条 dispatch。
- 不更新旧设计或计划中记录的历史实现状态；这些文档继续作为当时决策的历史证据。
- 不并入 B01、B02、B03、B07、B08、B09 或 B10。

## 已确认决策

### Batch action 是唯一 Redux contract

删除 `threadRuntimeDeltaAccepted` 的 reducer 定义、action creator 导出和单条 payload type。`threadRuntimeSlice` 继续导出 `threadRuntimeDeltasAccepted`，作为 accepted projection delta 跨 slice signal 的唯一 Redux 表达。

`threadRuntimeDeltasAccepted` 继续是 no-op Thread Runtime reducer action。它的职责是描述 coordinator 已接受并形成投递批次的 delta event，实际 Transcript State 更新仍由额外 reducer 响应该 action 完成。

### 内部 notification 使用协议类型

Coordinator 的 pending queue 已直接持有 `ThreadProjectionDeltaNotification[]`。`enqueueProjectionDelta` 的单条参数继续直接使用 `ThreadProjectionDeltaNotification`，不从 batch payload 或 action creator 派生。

Transcript State 的 batch helper 同样直接使用 generated protocol 的 `ThreadProjectionDeltaNotification` 元素类型。Redux payload type 只描述 action envelope，不成为 projection notification 的领域类型 owner。

目标依赖方向为：

```text
generated ThreadProjectionDeltaNotification
                 ↓
ProjectionApplicationCoordinator pending queue
                 ↓
threadRuntimeDeltasAccepted batch action
                 ↓
Transcript State batch reducer/helper
```

不得重新引入单条 Redux action、兼容 action alias 或只为替代旧 action type anchor 而新增的本地 delta 类型别名。

### 测试使用单元素 batch 保持原 dispatch 边界

每个原有：

```text
threadRuntimeDeltaAccepted({ notification })
```

改为：

```text
threadRuntimeDeltasAccepted({ notifications: [notification] })
```

这是逐 dispatch 的机械 contract 迁移。若测试原本连续 dispatch 两个单条 action，迁移后仍 dispatch 两个独立的单元素 batch，不能合并为一个双元素 batch。

原因是现有 Transcript State batch reducer 会按一个 batch 内触达的 live item 聚合：同一 item 的两个 notification 放入一个 batch 时只增加一次 `revision` 和一次 `liveScrollPulse`；保留两个单元素 batch 才能保持原测试所表达的两次 Redux 投递语义。

专门验证 batch coalescing 的测试继续使用多元素 batch，不退化为多个单元素 batch。

## 组件边界

### Thread Runtime

`threadRuntimeSlice` 删除：

- `ThreadRuntimeProjectionDeltaPayload`；
- `threadRuntimeDeltaAccepted` reducer；
- `threadRuntimeDeltaAccepted` action creator 导出。

保留 `ThreadRuntimeProjectionDeltasPayload` 和 `threadRuntimeDeltasAccepted`。Thread Runtime state、event buffer、active turn 和 subscription 行为不变。

### Projection Coordination

`ProjectionApplicationCoordinator` 删除对 `threadRuntimeDeltaAccepted` 的 type-only import。

`enqueueProjectionDelta` 直接接受 `ThreadProjectionDeltaNotification`。Pending queue、RAF schedule、同步 flush、notification 顺序和 batch dispatch 逻辑不变。

### Transcript State

`transcriptStateSlice` 删除 `threadRuntimeDeltaAccepted` import 和对应 `addCase`。

`transcriptLiveProjection` 删除只服务单条 Redux contract 的 `applyAcceptedProjectionDelta` 及其单条 append wrapper。保留 `applyAcceptedProjectionDeltaBatch`、delta bucket、一次 materialization 与 `appendDeltaToLiveItem` 路径。

Batch helper 的输入元素直接依赖 `ThreadProjectionDeltaNotification`。它继续：

- 忽略其他 thread 的 notification；
- 只处理支持的 `agentMessage` delta；
- 按 notification 顺序收集同 item delta；
- 对每个有效 live item 每 batch append 一次；
- 对缺失 live item 保持 no-op；
- 每个有效 item 每 batch 增加一次 `revision` 和一次 `liveScrollPulse`。

## 数据流

Production 数据流保持：

```text
projection delta callback
  -> ProjectionIngressAdapter.handleDelta
  -> deltaAccepted outcome
  -> coordinator pending queue
  -> RAF or synchronous flush
  -> threadRuntimeDeltasAccepted({ notifications })
  -> Transcript State batch reducer
  -> live item state and rendering
```

本设计只删除 production 数据流之外的单条 Redux 入口，不改变上述任一步骤的执行顺序或状态语义。

## 错误与异常边界

- Adapter 返回 `ignored` 或 `manualReconnectRequired` 的处理方式不变。
- 空 pending queue、disposed coordinator、mismatch thread 和缺失 live item 的行为不变。
- 不新增 fallback、兼容 dispatch、runtime warning 或迁移期双写。
- 如果实现发现任何 production caller 仍 dispatch 单条 action，应停止 B06 并回到设计确认，而不是静默保留双 contract。

## 测试设计

### Thread Runtime contract

- 删除单条 action 的 no-op reducer/export 测试与类型断言。
- 保留 batch action payload 类型与 no-op Thread Runtime state 断言。
- Reducer test action union 只包含仍存在的 action creators。

### Transcript State

将现有单条 action 输入逐一改为单元素 batch，继续覆盖：

- live streaming 文本追加；
- 连续独立 dispatch 的顺序、`revision` 和 scroll pulse；
- selector cache 失效边界；
- live item lifecycle；
- reconnect 后 live delta；
- 缺失 live item no-op；
- committed scroll key 不受 live delta 影响。

现有多元素 batch tests 继续覆盖：

- 同 item notification order 与 coalescing；
- 跨 item 隔离；
- wrong-thread 与 unsupported delta 过滤；
- 每个有效 item 每 batch 一次 revision/scroll 更新。

### Projection Coordination 与 Browser

Coordinator tests 继续验证只 dispatch `threadRuntimeDeltasAccepted`、RAF batching 和 structural action 前同步 flush。

现有 committed transcript browser test 的直接单条输入改为单元素 batch，继续验证 Markdown 可见输出和 committed scroll key 不变。本次没有 UI 设计变化，不新增或更新 snapshot。

## 建议文件边界

预期 implementation 只涉及：

- `codex-gui/src/features/threadRuntime/threadRuntimeSlice.ts`；
- `codex-gui/src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts`；
- `codex-gui/src/features/projectionCoordination/projectionApplicationCoordinator.ts`；
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts`；
- `codex-gui/src/features/transcriptState/transcriptLiveProjection.ts`；
- 当前直接使用 `threadRuntimeDeltaAccepted` 的 Transcript State 和 committed transcript browser tests。

不应修改 projection ingress、GUI host transport、render components、styles、protocol generated files、Rust、旧 specs/plans 或审计报告。

具体文件清单、执行顺序、验证命令和提交边界属于后续 implementation plan，不在本设计中展开。

## 风险与控制

- **测试迁移误改 batching 语义：** 每个旧单条 dispatch 独立迁移为单元素 batch；禁止顺手合并相邻 dispatch。
- **类型依赖继续锚定 Redux：** coordinator 与 Transcript State helper 显式使用 `ThreadProjectionDeltaNotification`；删除 action creator 反推类型。
- **误删 batch 优化：** 保留现有 `applyAcceptedProjectionDeltaBatch`、ordered buckets 和一次 materialization 路径。
- **行为范围扩大：** revision、scroll pulse、selector、rendering、flush boundary 或 payload shape 发生变化时停止实施并回到设计确认。
- **历史文档 churn：** 旧 specs 和 plans 保留原始内容；B06 的当前决策只记录在本设计及后续独立计划中。

## 接受标准

- Production 与测试代码中不再引用或导出 `threadRuntimeDeltaAccepted`。
- `ThreadRuntimeProjectionDeltaPayload` 和单条 Transcript State reducer/helper 路径被删除。
- `threadRuntimeDeltasAccepted` 是唯一 accepted-delta Redux contract。
- Coordinator 和 Transcript State 内部 notification 类型直接使用 `ThreadProjectionDeltaNotification`。
- 原单条测试输入全部改为单元素 batch，且原 dispatch 边界保持不变。
- 多元素 batch 的 notification order、同 item coalescing、跨 item 隔离和过滤行为不变。
- Transcript State 的 `transientText`、`revision`、`liveScrollPulse`、selector cache 与 committed scroll key 语义不变。
- Browser 可见 Markdown 渲染结果不变。
- B05 coordinator、projection ingress、transport、protocol、timeline 和 rendering 边界不变。
- B06 拥有独立设计、计划、实现、提交与验收边界。

## 参考

- `docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/00-summary.md`
- `docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/03-projection-ingress-and-thread-runtime.md`
- `docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/09-cross-cutting-boundaries-and-exclusions.md`
- `docs/superpowers/specs/2026-07-15-codex-gui-projection-application-coordination-design.md`
- `docs/superpowers/specs/2026-07-09-codex-gui-live-agent-delta-accumulation-design.md`
- `codex-gui/src/features/projectionCoordination/projectionApplicationCoordinator.ts`
- `codex-gui/src/features/threadRuntime/threadRuntimeSlice.ts`
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts`
- `codex-gui/src/features/transcriptState/transcriptLiveProjection.ts`
