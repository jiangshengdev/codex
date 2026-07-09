# State and projection ingest audit

## 审计范围

- GUI host event 投递、过滤、合批和 fanout。
- Redux/store update。
- selector materialization 和 cache invalidation。
- 无关更新扩散。

## Projection ingest

### 审计条目：projection event 顶层 state fanout

## 结论

`01-projection-event-top-level-react-state.md` 按当前入口代码复核为已修复。projection event、delta、closed 现在通过 projection callbacks 进入 ingress 和 Redux 路径，未再走 `onStatus` 顶层 lifecycle state。

## 审计字段

- 关联 issue: `docs/superpowers/issues/codex-gui-frontend-performance-hot-paths/01-projection-event-top-level-react-state.md`
- 触发源: WebSocket `onmessage` 中的 `thread/projection/event`、`thread/projection/delta`、`thread/projection/closed`
- 触发频率: projection event 为 `E` 次 accepted event；delta 为 `D` 次 notification 入队；closed accepted 时触发一次 manual reconnect 边界
- 单次同步工作: host parse/type guard 后调用 projection callback；ingress 做 thread/subscription/manualReconnect/commit-chain 检查
- 规模变量: projection events、delta notifications、thread identity checks、known turn ids、snapshot replay index size、fanout targets
- 累计复杂度: 旧 `O(projection events * mounted shell subtree)` 顶层 React state fanout 未在当前 projection callback 路径中成立
- 复杂度优先级: 非 finding
- 当前状态: 已修复

## 关键证据路径/行号

- `codex-gui/src/features/guiHost/guiHostClient.ts:330`: `thread/projection/event` 校验后调用 `onProjectionEvent`。
- `codex-gui/src/features/guiHost/guiHostClient.ts:343`: `thread/projection/delta` 校验后调用 `onProjectionDelta`。
- `codex-gui/src/features/guiHost/guiHostClient.ts:356`: `thread/projection/closed` 校验后调用 `onProjectionClosed`。
- `docs/superpowers/issues/codex-gui-frontend-performance-hot-paths/01-projection-event-top-level-react-state.md:23`: 旧记录也指出当前 projection payload 不再推动顶层 lifecycle status。

## 已排除项

- 排除旧顶层 React state 热路径：projection event/delta/closed 当前未写入 `onStatus`。
- 未扩展到 selector、transcript rendering 或 live text accumulation，这些由其他切片覆盖。

## 风险

本切片只确认 projection ingress 到 Redux action 边界；Redux subscribers 的真实 fanout 由 selector 切片单独判断。

## 报告建议

报告中将 `01` 作为已修复基线记录，不列为当前复杂度 finding。

### 审计条目：projection delta action/subscription frequency

## 结论

`08-projection-delta-redux-action-frequency.md` 的旧“每个 delta 一次 Redux action/subscription”表述已修复。当前 delta ingress 通过 pending queue 和 RAF/manual flush 合批投递 `threadRuntimeDeltasAccepted`，Redux action/subscription 频率随 flush 次数 `F` 增长，不随 raw delta 数 `D` 逐条增长。

## 审计字段

- 关联 issue: `docs/superpowers/issues/codex-gui-frontend-performance-hot-paths/08-projection-delta-redux-action-frequency.md`
- 触发源: accepted projection delta notification
- 触发频率: delta notification 入队 `D` 次；非空 flush `F` 次；每批大小 `B` 且 `D = sum(B)`
- 单次同步工作: delta 入队 `O(1)`；flush 做数组交换并 dispatch 一个 batch action；`threadRuntimeDeltasAccepted` 在 runtime slice 自身 reducer 为空
- 规模变量: delta notifications、RAF/manual boundary flushes、batch size、pending delta queue length、downstream Redux subscribers
- 累计复杂度: Redux action/subscription 频率为 `O(F)`，不是旧的 `O(D)`；delta ingress 入队总成本为 `O(D)`；下游 batch reducer 聚合由 live-streaming-text 切片单独记录
- 复杂度优先级: 非 finding
- 当前状态: 已修复

## 关键证据路径/行号

- `codex-gui/src/features/appShell/GuiHostConnectionBridge.tsx:47`: bridge 维护 `pendingDeltaNotifications`。
- `codex-gui/src/features/appShell/GuiHostConnectionBridge.tsx:61`: flush 将 pending deltas 合并为一次 `threadRuntimeDeltasAccepted` dispatch。
- `codex-gui/src/features/appShell/GuiHostConnectionBridge.tsx:73`: delta flush 使用 `requestAnimationFrame` 调度。
- `codex-gui/src/features/appShell/GuiHostConnectionBridge.tsx:91`: attach/event/manualReconnect 边界会先 `flushPendingDeltas`。
- `codex-gui/src/features/appShell/GuiHostConnectionBridge.tsx:109`: `deltaAccepted` 只入队，不立即 dispatch 单 delta action。
- `codex-gui/src/features/projectionIngress/projectionIngressAdapter.ts:113`: delta ingress 通过 thread/subscription/manualReconnect 过滤后返回 `deltaAccepted`。
- `codex-gui/src/features/threadRuntime/threadRuntimeSlice.ts:127`: 单 delta action 仍存在但 reducer 为空，作为 cross-slice signal。
- `codex-gui/src/features/threadRuntime/threadRuntimeSlice.ts:131`: batch delta action reducer 为空，runtime slice 自身不做 batch 内处理。
- `docs/superpowers/issues/codex-gui-frontend-performance-hot-paths/08-projection-delta-redux-action-frequency.md:16`: 旧记录已把 action/subscription 边界改写为 `F` 次 batch flush。

## 已排除项

- 排除“每个 delta 一次 Redux action/subscription”的旧表述。
- 排除 runtime slice 自身的 batch 内 reducer热点：`threadRuntimeDeltasAccepted` reducer 为空。
- 下游 transcript reducer 的 batch 聚合成本不在本 projection-ingest 条目重复归因。

## 风险

`pendingDeltaNotifications` 在当前源码中没有显式长度上限；实际 queue length 取决于一帧内 delta 到达率和 flush 边界。这个生命周期角度由 retained-state-memory 切片记录。

## 报告建议

报告口径把 `08` 拆成两层：Redux action/subscription frequency 记为已修复；batch-internal reducer work 交给 live-streaming-text 切片记录，不复用旧 action-frequency finding。

## Redux/store update and selectors

### 审计条目：chunk selector materialization

## 结论

`02-transcript-chunk-selector-view-rebuild.md` 已修复。当前 `selectTranscriptChunk` 通过 module-private `WeakMap` 和 `chunk.revision` 缓存 chunk view；cache hit 时不重新 materialize entries。

## 审计字段

- 关联 issue: `docs/superpowers/issues/codex-gui-frontend-performance-hot-paths/02-transcript-chunk-selector-view-rebuild.md`
- 触发源: store update 后 mounted chunk selector invocation
- 触发频率: `U = store updates`，`M = mounted selectors`
- 单次同步工作: cache hit 为 `O(1)`；cache miss 为 `O(Ec)`，`Ec = entries per chunk`
- 规模变量: store updates、mounted selectors、chunks、entries per chunk、cache entries、retained selector views
- 累计复杂度: chunk view materialization 当前为 `O(cache_misses * Ec)`，不再是 `O(U * mountedChunks * Ec)`
- 复杂度优先级: 非 finding
- 当前状态: 已修复

## 关键证据路径/行号

- `docs/superpowers/issues/codex-gui-frontend-performance-hot-paths/02-transcript-chunk-selector-view-rebuild.md:24`-`30`: issue 记录当前代码已用 `WeakMap` + `chunk.revision` 缓存 chunk view。
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:106`: `transcriptChunkViewCache` 是 module-private `WeakMap`。
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:516`-`536`: chunk view cache hit 直接返回旧 view；miss 才 `flatMap` materialize `entries` 并写 cache。
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:550`-`556`: `selectTranscriptChunk` 经由 cached view。

## 已排除项

- 未发现 `selectTranscriptChunk` 在 cache hit 时重新 `flatMap` entries。
- React render 和 chunk equality 的消费侧行为由 transcript-rendering 切片记录。

## 风险

`chunk.revision` 仍是缓存失效核心 token；未来新增 transcript entry 类型或渲染字段时，如果 reducer 写路径漏 bump，cache stale 风险会重新出现。

## 报告建议

将 `02` 记录为已修复，优先级为 `非 finding`。

### 审计条目：itemStarted dirty transcript state

## 结论

`03-item-started-dirties-transcript-state.md` 的重复 live `itemStarted` dirty `transcriptState` 窄边界已修复。首次 live item started 仍会创建可见 live state；重复 started 在 `recordAppliedEvent` 前 no-op。

## 审计字段

- 关联 issue: `docs/superpowers/issues/codex-gui-frontend-performance-hot-paths/03-item-started-dirties-transcript-state.md`
- 触发源: live `itemStarted` projection event
- 触发频率: live item start events
- 单次同步工作: 首次创建 renderable live item；重复 live item started 不再写 applied-event window 或 dirty transcript state
- 规模变量: live items、event ids、store updates、applied-event window
- 累计复杂度: 重复 `itemStarted` 不再累积 transcript state writes；首次 visible live state write 属于正常可见状态维护
- 复杂度优先级: 非 finding
- 当前状态: 已修复

## 关键证据路径/行号

- `docs/superpowers/issues/codex-gui-frontend-performance-hot-paths/03-item-started-dirties-transcript-state.md:52`-`54`: 记录重复 live `itemStarted` 已在 `recordAppliedEvent` 前返回。
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:598`-`605`: 已存在 live item 的 `itemStarted` 在 `recordAppliedEvent` 前 no-op。
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:223`-`242`: 首次 live `itemStarted` 会创建 renderable live item。

## 已排除项

- 未把首次可见 live item 创建计为问题。
- 未重复讨论 live item cleanup；cleanup 生命周期由 retained-state-memory 切片记录。

## 风险

本条只覆盖重复 `itemStarted` dirty state 的窄边界，不代表所有 live item lifecycle 都已可证明有界。

## 报告建议

将 `03` 记录为已修复，优先级为 `非 finding`。

### 审计条目：revision invalidation invariant

## 结论

`07-transcript-revision-invariant.md` 作为 revision invalidation invariant 仍成立，但当前限定代码内未看到一般 reducer 写路径遗漏 entry/chunk revision bump。本轮不把它列为已证实复杂度 finding。

## 审计字段

- 关联 issue: `docs/superpowers/issues/codex-gui-frontend-performance-hot-paths/07-transcript-revision-invariant.md`
- 触发源: future transcript entry or render field updates that rely on cached chunk views
- 触发频率: future reducer write paths
- 单次同步工作: current reducer append/update paths bump chunk or entry revision; invariant requires future writes to keep cache invalidation aligned
- 规模变量: chunks、entries、revision tokens、cached selector views
- 累计复杂度: 当前代码没有确认 stale cache path；风险是 future write path invariant，不是当前热路径
- 复杂度优先级: 非 finding
- 当前状态: 已有 issue 仍成立

## 关键证据路径/行号

- `docs/superpowers/issues/codex-gui-frontend-performance-hot-paths/07-transcript-revision-invariant.md:83`-`84`: issue 当前保留为未来新增 entry/字段时的 invariant 风险。
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:438`-`439`: append 到 middle chunk 会 bump chunk revision。
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:476`-`487`: existing committed entry update bump entry revision，并 bump 所属 chunk revision。

## 已排除项

- 未把 invariant 风险升级为当前 confirmed finding。
- 未提出代码修改方案。

## 风险

该风险依赖未来 reducer 写路径；本轮静态审计只能记录 invariant 仍需要维护。

## 报告建议

将 `07` 保持为已有 issue 仍成立，但复杂度优先级为 `非 finding`。

### 审计条目：live selector cache invalidation

## 结论

`10-live-slot-selector-cache-invalidation.md` 的旧 selector cache invalidation / read-time materialization 形态已修复。当前 `selectTranscriptLiveItemsForTurn` 直接返回 reducer-owned array 或 frozen empty array；消费侧 `.some()` / `.filter()` 扫描由 live/scroll 报告归因，不在本 selector 条目重复计为旧 cache finding。

## 审计字段

- 关联 issue: `docs/superpowers/issues/codex-gui-frontend-performance-hot-paths/10-live-slot-selector-cache-invalidation.md`
- 触发源: mounted live item selectors on store update
- 触发频率: `U = store updates`，`M_live = mounted live selectors`
- 单次同步工作: selector 直接返回 existing array 或 `EMPTY_LIVE_ITEMS`，为 `O(1)`
- 规模变量: store updates、mounted live selectors、live items、turns
- 累计复杂度: live items selector invocation 为 `O(U * M_live)` calls，但每次 selector read 为 `O(1)`；旧 read-time materialization 不成立
- 复杂度优先级: 非 finding
- 当前状态: 已修复

## 关键证据路径/行号

- `docs/superpowers/issues/codex-gui-frontend-performance-hot-paths/10-live-slot-selector-cache-invalidation.md:14`-`18`: 旧 live selector cache invalidation 表述已过期。
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:565`-`569`: `selectTranscriptLiveItemsForTurn` 直接返回 state array 或 `EMPTY_LIVE_ITEMS`。
- `codex-gui/src/app/store.ts:15`-`22`: `makeStore` 创建 Redux store，`store` 被导出。
- `codex-gui/src/app/hooks.ts:7`-`12`: `useAppSelector` 是 typed `useSelector`，mounted selector 会订阅 store update。

## 已排除项

- 未发现旧 `selectCachedLiveItemsForTurn`、`liveTurn`、`slotKeys`、`slotRevisions`、`slotOrder` 路径。
- 未把消费侧 `.some()` / `.filter()` 扫描重复报告为 selector cache invalidation。

## 风险

限定文件无法验证所有 selector 调用点、equality function 和 React render 行为；本条只判断 store/slice/selector 定义层。

## 报告建议

将旧 `10` selector cache invalidation 记录为已修复；消费侧扫描残留交给 `04-live-streaming-input-scroll.md`。
