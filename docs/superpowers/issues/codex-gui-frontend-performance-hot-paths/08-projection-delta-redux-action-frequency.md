# Projection delta Redux action 频率热路径

日期: 2026-07-06
状态: 🟡 部分完成，仍有 batch 内逐 notification 聚合成本
范围: `codex-gui/src/features/appShell`, `codex-gui/src/features/threadRuntime`, `codex-gui/src/features/transcriptState`
优先级: 未定

## 摘要

2026-07-09 本地提交 `232047dfb Optimize live agent delta batch accumulation` 后，该 issue 不应继续表述为每个 delta 一次 Redux action / subscription。同一 batch/live item 的实际 live item mutation、`revision` 和 `liveScrollPulse` 已收窄到每 bucket 一次；当前残留是 batch reducer 仍遍历 notifications 并按 live item 聚合，存在 `O(D)` notification 聚合成本。

## 问题

原始问题假设是: `thread/projection/delta` 接入 GUI 后，每个 transient agent message delta 都会作为一次 Redux action 进入 `transcriptState`，从而把 Redux action 投递、Immer reducer 写入和 store subscription 通知绑定到网络 delta 频率。

当前实现已改变 action 投递边界。`GuiHostConnectionBridge` 会先收集 delta notifications，再用 `requestAnimationFrame` flush 为一个 `threadRuntimeDeltasAccepted({ notifications })` batch action；attach/event/reconnect 边界前也会同步 flush pending delta。因此 action 投递和 store subscription 频率不再固定等于 delta 数 `D`，而是非空 batch flush 数 `F`。

本地提交 `232047dfb` 进一步改变 batch reducer 内的 live item 更新边界。对同一 batch/live item，`agentMessage` delta 会先按 `liveItemKey(turnId, itemId)` 聚合到 bucket，随后每个 bucket 才查找 live item 并调用一次 append。因此原“batch 内每个 agentMessage delta 都 live item lookup / mutation / revision / pulse”的表述已部分处理。

残留边界是 batch reducer 仍逐 notification 遍历并执行 bucket 聚合。同一 batch/live item 的实际 live item mutation、`revision` 和 `liveScrollPulse` 已收窄到每 bucket 一次，但 notification 聚合本身仍随 batch 内 delta 数增长。字符串拼接成本另见 `09-projection-delta-transient-text-concat.md`。

## 证据

- `codex-gui/src/features/appShell/GuiHostConnectionBridge.tsx:47`: bridge 维护 `pendingDeltaNotifications`。
- `codex-gui/src/features/appShell/GuiHostConnectionBridge.tsx:61`: `flushPendingDeltas` 将累计 notifications 作为一个 `threadRuntimeDeltasAccepted` action 投递。
- `codex-gui/src/features/appShell/GuiHostConnectionBridge.tsx:73`: `schedulePendingDeltaFlush` 使用 `requestAnimationFrame`。
- `codex-gui/src/features/appShell/GuiHostConnectionBridge.tsx:84`: `enqueueProjectionDelta` 只入队并安排 flush。
- `codex-gui/src/features/appShell/GuiHostConnectionBridge.tsx:109`: `deltaAccepted` 走 `enqueueProjectionDelta`。
- `codex-gui/src/features/threadRuntime/threadRuntimeSlice.ts:127`: 单 delta action 在 runtime slice 中是跨 slice 信号。
- `codex-gui/src/features/threadRuntime/threadRuntimeSlice.ts:131`: batch delta action 在 runtime slice 中也是跨 slice 信号。
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:308`: 新增 `applyAcceptedProjectionDeltaBatch` 处理 accepted projection delta batch。
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:315`: batch reducer 仍遍历 `notifications`，保留逐 notification 聚合成本。
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:323`: `agentMessage` delta 按 `liveItemKey(turnId, itemId)` 聚合到 bucket。
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:330`: 同一 bucket 内执行 `bucket.delta += delta`。
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:337`: 每个 bucket 才查找一次 live item。
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:339`: 每个 bucket 才调用一次 `appendDeltaToLiveItem`。
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:271`: `appendDeltaToLiveItem` 仍执行 `item.transientText += delta`。
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:273`: 每次 `appendDeltaToLiveItem` 递增 live item `revision`。
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:274`: 每次 `appendDeltaToLiveItem` 调用 `bumpLiveScrollPulse(state)`。
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:634`: batch action 调用 `applyAcceptedProjectionDeltaBatch`。
- `codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts:140`: reducer test 覆盖同一 live item batch coalescing。
- `codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts:187`: reducer test 覆盖多 live item batch isolation。
- `codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts:302`: reducer test 覆盖 wrong-thread / unsupported batch filtering。
- `codex-gui/src/__tests__/App.browser.test.tsx:293`: browser test 覆盖 projection delta RAF batch regression。
- `codex-gui/src/__tests__/App.browser.test.tsx:337`: browser test 断言 batch 后显示 `Hello world`。
- `codex-gui/src/__tests__/App.browser.test.tsx:348`: browser test 断言同一 batch/live item 后 `revision: 1`。
- `docs/superpowers/reports/2026-07-09-codex-gui-03-performance-check/01-03-hot-paths.md:19`: 03 performance check 将该切片校准为 `部分过期`。

## 判断

2026-07-09 更新:该 issue 不应继续表述为“每个 delta 一次 Redux action / subscription”。当前 action 投递和 subscription 成本为 `O(F)`，同一 batch/live item 的 actual mutation、`revision` 和 `liveScrollPulse` 更新已从逐 notification 收窄为逐 bucket。

`threadRuntimeSlice.ts` 的 delta actions 自身只是跨 slice 信号。当前未完全消除的是 `transcriptStateSlice.ts` batch reducer 内遍历 notifications 并聚合 bucket 的 `O(D)` 同步处理；它不是 Redux action / subscription 频率问题，也不是每个 raw delta 都 mutation/revision/pulse 的旧问题。

## 修复记录

- `232047dfb Optimize live agent delta batch accumulation`: 修改 `codex-gui/src/features/transcriptState/transcriptStateSlice.ts`、`codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts`、`codex-gui/src/__tests__/App.browser.test.tsx`，将 accepted projection delta batch 内同一 live item 的 delta 先聚合到 bucket，再每 bucket 更新一次 live item。

## 验证记录

- reducer test: `codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts`，30 passed。
- browser test: `codex-gui/src/__tests__/App.browser.test.tsx`，27 passed。
- type-check: pass。
- `format:oxfmt`: pass。

## 影响

原 Redux action/subscription 频率风险已收窄，同一 batch/live item 的 live item 更新频率也已收窄。但 batch reducer 内仍有按 notification 数增长的同步聚合成本，长回答或高频 delta 场景仍可能受 batch 内 `O(D)` 聚合影响。

## 后续处理

如需继续处理 batch 内逐 notification 聚合成本，应单独进入设计/计划门禁，先设计、再计划。本 issue 只记录当前复杂度边界和证据，不给代码改动方向。
