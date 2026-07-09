# Retained state audit

## 审计范围

- map/cache/event window/pending queue。
- live state/thread state/projection state。
- owner、key、增长路径和 cleanup lifecycle。

## 审计条目

## 审计条目：retained structures and cleanup lifecycle

## 结论

本切片未确认新的 P0/P1 retained-state 泄漏。当前代码中多数 retained 结构都有明确替换、窗口上限或 cleanup 证据；生命周期不完整但不能确认为 finding 的点主要有两个，均标记为 `证据不足`：RAF pending delta queue 缺少硬上限证据，以及 manual reconnect/closed 后 detached live slot cleanup 证据不足。

## 审计字段

- 关联 issue: `03-item-started-dirties-transcript-state.md` 为 `已修复`；`07-transcript-revision-invariant.md` 在 retained cache 角度为 `非 finding`；`10-live-slot-selector-cache-invalidation.md` 的旧 live selector cache 路径为 `已修复`，残留 live consumption 扫描不属于本轮 retained lifecycle 角度
- 触发源: GUI host RPC、projection attach/event/delta/closed、RAF delta flush、Redux attach/event/delta/manual reconnect reducer、transcript selectors
- 触发频率: attach 低频；projection event/delta 高频；selector 随 store/render 消费；cleanup 随 response、socket close、effect unmount、attach reset、item completion、窗口上限触发
- 单次同步工作: retained 结构写入多为 `O(1)`；delta batch 聚合为 `O(batch size)`；snapshot/rebuild 为 `O(snapshot turns/items)`；chunk view materialization 为 `O(chunk entry count)` 且缓存
- 规模变量: turns、items、entries、chunks、event ids、pending deltas、live items、accumulated live text、snapshot ids、cache entries
- 累计复杂度: 已确认窗口为 `eventBuffer <= 500`、`appliedEventOrder <= 500`；current transcript/state 随当前 thread 增长；pending delta queue 随 flush 前 delta 数增长；live item/text 随未完成 live item 和 delta text 增长
- 复杂度优先级: P2
- 当前状态: 证据不足

## Retained Structure Table

| retained 结构 | owner | key | 增长路径 | cleanup 路径 | 判断 |
|---|---|---|---|---|---|
| `pendingRequests` | `startGuiHostConnection` closure | JSON-RPC request id | 每个 outbound request `set` | response/error/close/cleanup `delete` 或 `clear` | cleanup 证据充分，非 finding |
| `pendingDeltaNotifications` | `GuiHostConnectionBridge` effect | 顺序队列，无显式 key | projection delta 入队，RAF 前累积 | RAF flush、attach/event/manual reconnect 前 flush、unmount 清空 | 正常窗口有 cleanup；延迟 RAF 下硬上限证据不足 |
| `ProjectionIngressAdapter.cursor.knownTurnIds` | projection ingress adapter | `turn.id` | attach snapshot + live turn event | attach 替换 cursor、effect cleanup 丢弃 adapter | 当前 thread 生命周期内 `O(turns)`，旧 attachment cleanup 充分，非 finding |
| bridge `snapshotReplayIndex` | `GuiHostConnectionBridge` effect | turn id / item id | attach 后按 snapshot 构建 | 新 launch 置空、effect cleanup 丢弃 | 固定 snapshot 尺寸，非 finding |
| `threadRuntime.current` / `snapshotTurns` / `snapshotReplayIndex` | Redux `threadRuntime` | 单个 current thread | attach 时保存 snapshot | 下一次 attach 整体替换 | 单 current record，不是 thread map；非 finding |
| `threadRuntime.eventBuffer` | Redux `threadRuntime` | event order | 每个 accepted projection event push | 超过 500 后 splice；attach 替换 | cleanup 证据充分，非 finding |
| transcript maps | Redux `transcriptState` | turn/chunk/entry id | snapshot rebuild + live committed entries | attach rebuild/reset 整体替换 | 当前 transcript 数据本身，非本轮 retained leak |
| live item maps/index/text | Redux `transcriptState` | `turnId:itemId` | `itemStarted` 创建，delta 累加 text | `itemCompleted` 删除，attach reset | 正常完成路径充分；manual reconnect/closed 后 detached live slot 生命周期证据不足 |
| applied-event window | Redux `transcriptState` | `commitId` | accepted event 记录 | 超过 500 后 shift + delete；attach reset | cleanup 证据充分，`03` 已修复 |
| `transcriptChunkViewCache` | module `WeakMap` | `TranscriptChunk` object | selector materialize chunk view | chunk revision invalidation；旧 chunk 依赖 WeakMap GC | 旧 snapshot cache 不强保留，非 finding |

## 关键证据路径/行号

- `docs/superpowers/specs/2026-07-09-codex-gui-system-performance-check-design.md:73`: 空间风险要求 owner、key、生命周期、cleanup 边界。
- `docs/superpowers/specs/2026-07-09-codex-gui-system-performance-check-design.md:199`: retained-state-memory 切片范围。
- `codex-gui/src/features/guiHost/guiHostClient.ts:116`: `pendingRequests` map。
- `codex-gui/src/features/guiHost/guiHostClient.ts:134`: pending request reject + clear。
- `codex-gui/src/features/guiHost/guiHostClient.ts:248`: response path deletes pending request。
- `codex-gui/src/features/guiHost/guiHostClient.ts:370`: connection cleanup clears pending requests and handlers。
- `codex-gui/src/features/appShell/GuiHostConnectionBridge.tsx:47`: `pendingDeltaNotifications` queue。
- `codex-gui/src/features/appShell/GuiHostConnectionBridge.tsx:61`: queue flush clears array。
- `codex-gui/src/features/appShell/GuiHostConnectionBridge.tsx:196`: unmount clears pending deltas and cancels RAF。
- `codex-gui/src/features/projectionIngress/projectionIngressAdapter.ts:48`: projection cursor retains `knownTurnIds` set。
- `codex-gui/src/features/projectionIngress/projectionIngressAdapter.ts:75`: attach replaces cursor and snapshot turn ids。
- `codex-gui/src/features/projectionIngress/projectionIngressAdapter.ts:180`: live turn events add known turn id。
- `codex-gui/src/features/threadRuntime/threadRuntimeSlice.ts:67`: event buffer cap is 500。
- `codex-gui/src/features/threadRuntime/threadRuntimeSlice.ts:115`: attach replaces `current` runtime record。
- `codex-gui/src/features/threadRuntime/threadRuntimeSlice.ts:143`: event buffer push and cap enforcement。
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:84`: transcript retained maps and live indexes。
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:162`: applied-event window records and evicts。
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:223`: live item creation keyed by `turnId:itemId`。
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:344`: live item removal and index repair。
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:491`: snapshot rebuild creates fresh state and reset。
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:516`: chunk view WeakMap cache by chunk object/revision。
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:637`: manual reconnect sets global status but does not clear live items in this file。

## 已排除项

- `snapshotReplay.ts` 和 `liveEventHandling.ts` 主要按 current runtime materialize arrays，没有在本文件内新增 retained store。
- `bucketByKey` / `buckets` 是 `applyAcceptedProjectionDeltaBatch` 的 reducer-local 临时聚合，不是 retained cache。
- `threadIdentity` 只保留 current launch/attached thread id 和状态，固定大小。
- `sessionStorage` launch token 是固定单 key 覆盖，不随 threads/events 增长。
- 未把 `10` 的 live consumption `.some()` / `.filter()` 扫描重复报告为 retained lifecycle finding。

## 风险

- `pendingDeltaNotifications` 没有硬数量上限；正常 cleanup 依赖 RAF 或同步 flush。若 RAF 长时间不运行，静态证据不足以证明 pending queue 始终有界。
- live item 正常 completion 会清理，但 manual reconnect/closed 只看到 global status 写入，未在允许文件内看到 detached live items 的明确清理；不能确认泄漏，只能标记生命周期证据不足。
- `threadRuntime.snapshotReplayIndex` 与 bridge-local `snapshotReplayIndex` 在允许文件内可见为重复 retained snapshot id map；是否被允许范围外消费者使用，本轮不能确认。
- Redux current transcript/state 在 connection cleanup 时未看到显式清空；但它是 current thread 数据，store teardown 或页面生命周期不在允许文件内，不能据此确认 leak。

## 报告建议

记录为：本切片无确认 P0/P1 retained-state finding；`03` 已修复，`07`/`10` 在 retained lifecycle 角度不新增结论。保留两个 `证据不足` 观察项：RAF pending delta queue 缺少硬上限证据，以及 manual reconnect/closed 后 detached live slot cleanup 证据不足。
