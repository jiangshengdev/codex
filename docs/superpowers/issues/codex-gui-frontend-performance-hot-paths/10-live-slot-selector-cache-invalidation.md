# Live slot selector cache 高频失效

日期:2026-07-06
更新:2026-07-09
状态:部分过期
范围:`codex-gui/src/features/transcriptState`, `codex-gui/src/features/committedTranscriptSurface`

## 问题摘要

原始问题假设是: `selectCachedLiveItemsForTurn` 依赖 `liveTurn.revision`、`slotKeys` 和 `slotRevisions` 判断缓存是否可复用, 每个 projection delta bump `slot.revision` 后都会让当前 turn 的 live item view cache 失效, 并重新 materialize `TranscriptRenderableLiveItem[]`。

当前 02e/03 实现已改变该边界。`transcriptState` 直接保存 reducer-owned `liveItemsByTurnId: Record<string, TranscriptRenderableLiveItem[]>`, `selectTranscriptLiveItemsForTurn` 只返回 `transcriptState.liveItemsByTurnId[turnId] ?? EMPTY_LIVE_ITEMS`。当前代码没有旧 `selectCachedLiveItemsForTurn`、`liveTurn.revision`、`slotKeys`、`slotRevisions` 或 `slotOrder` 驱动的 read-time materialization / revision comparison / key scan。

该 issue 因此不应继续表述为 selector cache 高频失效仍存在。当前仅保留为收窄后的 03 live consumption 边界: `CommittedTranscriptSurface` 在消费 live items 时仍会执行 `.some()`、`.filter()` 和 empty-surface scan。

## 当前证据

- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:74`: 当前 live item 已是 reducer state 中的 `TranscriptRenderableLiveItem`。
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:94`: 当前 state 直接保存 `liveItemsByTurnId: Record<string, TranscriptRenderableLiveItem[]>`。
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:206`: `ensureLiveItemsForTurn` 只创建并保存 reducer-owned live item array。
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:257`: 当前 delta 通过 key/index 找到 live item 后原地更新 `transientText`、`status`、`revision` 和 `liveScrollPulse`。
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:512`: `selectTranscriptLiveItemsForTurn` 直接返回 live item array 引用或 `EMPTY_LIVE_ITEMS`。
- `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx:205`: `LiveAssistantMessages` 对 live items 执行 `.filter(isLiveAgentMessage)`。
- `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx:228`: 当前 turn 判空对 live items 执行 `.some(isLiveAgentMessage)`。
- `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx:268`: surface-level `hasSurfaceContent` 扫描 turns。
- `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx:276`: `hasSurfaceContent` 在需要时调用 `selectTranscriptLiveItemsForTurn(...).some(isLiveAgentMessage)`。
- `docs/superpowers/reports/2026-07-09-codex-gui-03-performance-check/01-03-hot-paths.md:108`: 03 performance check 将该切片校准为 `部分过期`。

## 当前判断

旧 selector cache invalidation 路径已消除: `selectTranscriptLiveItemsForTurn` 的 read-time materialization 成本为 `O(1)` 读取。当前残留边界属于 03 live consumption, 可能产生 `O(D * Lt)` 的 current-turn `.some()` / `.filter()` 扫描, 以及 `O(D * (T + Ls))` 的 `hasSurfaceContent` 空状态判断扫描。

这个边界独立于 `09-projection-delta-transient-text-concat.md` 的字符串累加成本。

## 后续处理

如需继续处理收窄后的 live consumption 扫描边界, 应单独进入设计或计划阶段。本 issue 只记录当前复杂度边界和证据, 不给代码改动方向。
