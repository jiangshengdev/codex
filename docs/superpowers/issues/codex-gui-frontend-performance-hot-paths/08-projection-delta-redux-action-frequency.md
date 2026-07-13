# Projection delta Redux action 频率热路径

日期: 2026-07-06
状态: 📏 原始问题已修复，残留成本待量化
范围: `codex-gui/src/features/appShell`, `codex-gui/src/features/threadRuntime`, `codex-gui/src/features/transcriptState`
优先级: 未定

## 摘要

2026-07-09 本地提交 `232047dfb Optimize live agent delta batch accumulation` 后，每个 delta 一次 Redux action / subscription 的原始问题已经修复。同一 batch/live item 的实际 live item mutation、`revision` 和 `liveScrollPulse` 已收窄到每 bucket 一次；当前只残留 batch 内遍历 notifications 并按 live item 分桶的 `O(D)` 基础处理成本，尚无 profiling 或 benchmark 证明它是独立性能热点。

## 问题

原始问题假设是: `thread/projection/delta` 接入 GUI 后，每个 transient agent message delta 都会作为一次 Redux action 进入 `transcriptState`，从而把 Redux action 投递、Immer reducer 写入和 store subscription 通知绑定到网络 delta 频率。

当前实现已改变 action 投递边界。`GuiHostConnectionBridge` 会先收集 delta notifications，再用 `requestAnimationFrame` flush 为一个 `threadRuntimeDeltasAccepted({ notifications })` batch action；attach/event/reconnect 边界前也会同步 flush pending delta。因此 action 投递和 store subscription 频率不再固定等于 delta 数 `D`，而是非空 batch flush 数 `F`。

本地提交 `232047dfb` 进一步改变 batch reducer 内的 live item 更新边界。对同一 batch/live item，`agentMessage` delta 会先按 `liveItemKey(turnId, itemId)` 聚合到 bucket，随后每个 bucket 才查找 live item 并调用一次 append。因此原“batch 内每个 agentMessage delta 都 live item lookup / mutation / revision / pulse”的表述也已经修复。

残留边界只是 batch reducer 仍逐 notification 遍历并执行 bucket 聚合。这段处理随 batch 内 notification 数 `D` 线性增长，但读取和过滤 `D` 条输入本身至少需要 `O(D)` 工作；当前没有 profiling、benchmark 或帧时间数据证明这段基础遍历构成独立性能问题。`bucket.delta += delta` 和 `item.transientText += delta` 的字符串拼接成本另见 `09-projection-delta-transient-text-concat.md`，不在本 issue 重复认定。

## 证据

- `codex-gui/src/features/appShell/GuiHostConnectionBridge.tsx:47`: bridge 维护 `pendingDeltaNotifications`。
- `codex-gui/src/features/appShell/GuiHostConnectionBridge.tsx:61`: `flushPendingDeltas` 将累计 notifications 作为一个 `threadRuntimeDeltasAccepted` action 投递。
- `codex-gui/src/features/appShell/GuiHostConnectionBridge.tsx:73`: `schedulePendingDeltaFlush` 使用 `requestAnimationFrame`。
- `codex-gui/src/features/appShell/GuiHostConnectionBridge.tsx:84`: `enqueueProjectionDelta` 只入队并安排 flush。
- `codex-gui/src/features/appShell/GuiHostConnectionBridge.tsx:109`: `deltaAccepted` 走 `enqueueProjectionDelta`。
- `codex-gui/src/features/threadRuntime/threadRuntimeSlice.ts:127`: 单 delta action 在 runtime slice 中是跨 slice 信号。
- `codex-gui/src/features/threadRuntime/threadRuntimeSlice.ts:131`: batch delta action 在 runtime slice 中也是跨 slice 信号。
- `codex-gui/src/features/transcriptState/transcriptLiveProjection.ts:81`: `appendDeltaToLiveItem` 对命中的 bucket 执行 `transientText`、`status`、`revision` 和 `liveScrollPulse` 更新。
- `codex-gui/src/features/transcriptState/transcriptLiveProjection.ts:123`: `applyAcceptedProjectionDeltaBatch` 处理 accepted projection delta batch。
- `codex-gui/src/features/transcriptState/transcriptLiveProjection.ts:130`: batch 实现遍历 `notifications`。
- `codex-gui/src/features/transcriptState/transcriptLiveProjection.ts:138`: `agentMessage` delta 按 `liveItemKey(turnId, itemId)` 聚合到 bucket。
- `codex-gui/src/features/transcriptState/transcriptLiveProjection.ts:145`: 同一 bucket 内执行 `bucket.delta += delta`；该字符串成本归 09。
- `codex-gui/src/features/transcriptState/transcriptLiveProjection.ts:151`: 每个 bucket 才查找一次 live item，并在命中时调用一次 `appendDeltaToLiveItem`。
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:140`: batch action 的 transcript reducer 入口调用 `applyAcceptedProjectionDeltaBatch`。
- `codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveStreaming.test.ts:123`: reducer test 覆盖同一 live item batch coalescing。
- `codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveStreaming.test.ts:170`: reducer test 覆盖多 live item batch isolation。
- `codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveStreaming.test.ts:285`: reducer test 覆盖 wrong-thread / unsupported batch filtering。
- `codex-gui/src/__tests__/App.browser.test.tsx:293`: browser test 覆盖 projection delta RAF batch regression。
- `codex-gui/src/__tests__/App.browser.test.tsx:337`: browser test 断言 batch 后显示 `Hello world`。
- `codex-gui/src/__tests__/App.browser.test.tsx:348`: browser test 断言同一 batch/live item 后 `revision: 1`。
- `docs/superpowers/reports/2026-07-09-codex-gui-03-performance-check/01-03-hot-paths.md:19`: 03 performance check 将该切片校准为 `部分过期`。

## 判断

2026-07-09 更新：该 issue 的原始问题已经修复，不应继续表述为“每个 delta 一次 Redux action / subscription”。当前 action 投递和 subscription 成本为 `O(F)`，同一 batch/live item 的 actual mutation、`revision` 和 `liveScrollPulse` 更新已从逐 notification 收窄为逐 bucket。

`threadRuntimeSlice.ts` 的 delta actions 自身只是跨 slice 信号。当前残留的是 `transcriptLiveProjection.ts` 内遍历 notifications 并聚合 bucket 的 `O(D)` 同步处理；它不是 Redux action / subscription 频率问题，也不是每个 raw delta 都 mutation/revision/pulse 的旧问题。由于尚无 profiling 或 benchmark 证明基础 `O(D)` 输入处理是可观测瓶颈，本 issue 将其标记为待量化，而不是继续认定为已确认热点。

## 修复记录

- `232047dfb Optimize live agent delta batch accumulation`: 当时修改 `codex-gui/src/features/transcriptState/transcriptStateSlice.ts`、`codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts`、`codex-gui/src/__tests__/App.browser.test.tsx`，将 accepted projection delta batch 内同一 live item 的 delta 先聚合到 bucket，再每 bucket 更新一次 live item。后续代码整理已将 batch 实现移至 `transcriptLiveProjection.ts`，相关 reducer test 移至 `transcriptStateLiveStreaming.test.ts`。

## 验证记录

- 以下均为 2026-07-09 的历史验证结果，不代表本次文档更新对当前 HEAD 重新运行了验证。
- reducer test：当时 30 passed；相关测试当前位于 `codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveStreaming.test.ts`。
- browser test：`codex-gui/src/__tests__/App.browser.test.tsx`，当时 27 passed。
- type-check：当时 pass。
- `format:oxfmt`：当时 pass。

## 影响

原 Redux action/subscription 频率风险已经消除，同一 batch/live item 的 live item 更新频率也已收窄。残留的 `O(D)` 遍历和分桶是当前实现的基础输入处理成本；在没有量化数据前，不能据此判断长回答或高频 delta 场景存在独立性能退化。把它继续描述为已确认热点会夸大本 issue 的当前影响，并与 09 的字符串拼接风险重叠。

## 后续处理

如需继续评估 batch 内逐 notification 聚合成本，应先通过 profiling、benchmark 或帧时间数据确认它是否构成可观测瓶颈。只有量化结果证明值得独立优化时，才单独进入设计/计划门禁；字符串拼接成本继续在 09 中跟踪。本 issue 只记录当前复杂度边界和证据，不给代码改动方向。
