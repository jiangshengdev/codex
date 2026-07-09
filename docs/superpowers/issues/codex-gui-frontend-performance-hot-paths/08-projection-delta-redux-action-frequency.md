# Projection delta Redux action 频率热路径

日期: 2026-07-06
状态: 🟡 部分过期
范围: `codex-gui/src/features/appShell`, `codex-gui/src/features/threadRuntime`, `codex-gui/src/features/transcriptState`
优先级: 未定

## 摘要

2026-07-09 更新后，该 issue 不应继续表述为每个 delta 一次 Redux action；当前残留是 batch 内逐 delta reducer 处理。

## 问题

原始问题假设是: `thread/projection/delta` 接入 GUI 后, 每个 transient agent message delta 都会作为一次 Redux action 进入 `transcriptState`, 从而把 Redux action 投递、Immer reducer 写入和 store subscription 通知绑定到网络 delta 频率。

当前 03 实现已改变 action 投递边界。`GuiHostConnectionBridge` 会先收集 delta notifications, 再用 `requestAnimationFrame` flush 为一个 `threadRuntimeDeltasAccepted({ notifications })` batch action；attach/event/reconnect 边界前也会同步 flush pending delta。因此 action 投递和 store subscription 频率不再固定等于 delta 数 `D`, 而是非空 batch flush 数 `F`。

残留边界是 batch reducer 内仍逐 notification 应用 delta。对 `agentMessage` delta, `transcriptStateSlice` 仍会查找 live item, 拼接 `transientText`, 更新 `status`, 递增 item `revision` 和 `liveScrollPulse`。因此该 issue 的原 action-frequency finding 已部分过期, 但 batch 内仍存在 `O(D)` 次同步 reducer 处理；字符串拼接成本另见 `09-projection-delta-transient-text-concat.md`。

## 证据

- `codex-gui/src/features/appShell/GuiHostConnectionBridge.tsx:47`: bridge 维护 `pendingDeltaNotifications`。
- `codex-gui/src/features/appShell/GuiHostConnectionBridge.tsx:61`: `flushPendingDeltas` 将累计 notifications 作为一个 `threadRuntimeDeltasAccepted` action 投递。
- `codex-gui/src/features/appShell/GuiHostConnectionBridge.tsx:73`: `schedulePendingDeltaFlush` 使用 `requestAnimationFrame`。
- `codex-gui/src/features/appShell/GuiHostConnectionBridge.tsx:84`: `enqueueProjectionDelta` 只入队并安排 flush。
- `codex-gui/src/features/appShell/GuiHostConnectionBridge.tsx:109`: `deltaAccepted` 走 `enqueueProjectionDelta`。
- `codex-gui/src/features/threadRuntime/threadRuntimeSlice.ts:127`: 单 delta action 在 runtime slice 中是跨 slice 信号。
- `codex-gui/src/features/threadRuntime/threadRuntimeSlice.ts:131`: batch delta action 在 runtime slice 中也是跨 slice 信号。
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:268`: 每个 `agentMessage` delta 仍在 reducer 内拼接 `transientText`。
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:270`: 每个 `agentMessage` delta 递增 live item `revision`。
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:271`: 每个 `agentMessage` delta 递增 `liveScrollPulse`。
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:574`: batch action reducer 仍遍历 `action.payload.notifications`。
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:576`: batch 内逐 notification 调用 `applyAcceptedProjectionDelta`。
- `docs/superpowers/reports/2026-07-09-codex-gui-03-performance-check/01-03-hot-paths.md:19`: 03 performance check 将该切片校准为 `部分过期`。

## 判断

2026-07-09 更新:该 issue 不应继续表述为“每个 delta 一次 Redux action / subscription”。当前 action 投递和 subscription 成本为 `O(F)`, reducer 内逐 delta 应用仍为 `O(D)` 次同步处理。

`threadRuntimeSlice.ts` 的 delta actions 自身只是跨 slice 信号；真正的 per-delta transcript 写入发生在 `transcriptStateSlice.ts` 的 batch reducer 循环内。

## 影响

原 Redux action/subscription 频率风险已收窄，但 batch reducer 内仍有按 delta 数增长的同步处理成本。长回答或高频 delta 场景仍可能受 reducer 内逐项处理影响。

## 后续处理

如需继续处理 batch 内 per-delta 同步 reducer 成本, 应单独进入设计/计划门禁，先设计、再计划。本 issue 只记录当前复杂度边界和证据, 不给代码改动方向。
