# Live slot selector cache 高频失效

日期: 2026-07-06
状态: 🟡 部分过期
范围: `codex-gui/src/features/transcriptState`, `codex-gui/src/features/committedTranscriptSurface`
优先级: 未定

## 摘要

2026-07-09 更新后，旧 selector cache invalidation 路径已消除；本地提交 `232047dfb Optimize live agent delta batch accumulation` 还把同一 batch/live item 的 `revision` / `liveScrollPulse` 更新收窄到每 bucket 一次。当前 issue 仍保留收窄后的 live consumption 扫描边界。

## 问题

原始问题假设是: `selectCachedLiveItemsForTurn` 依赖 `liveTurn.revision`、`slotKeys` 和 `slotRevisions` 判断缓存是否可复用，每个 projection delta bump `slot.revision` 后都会让当前 turn 的 live item view cache 失效，并重新 materialize `TranscriptRenderableLiveItem[]`。

当前 02e/03 实现已改变该边界。`transcriptState` 直接保存 reducer-owned `liveItemsByTurnId: Record<string, TranscriptRenderableLiveItem[]>`, `selectTranscriptLiveItemsForTurn` 只返回 `transcriptState.liveItemsByTurnId[turnId] ?? EMPTY_LIVE_ITEMS`。当前代码没有旧 `selectCachedLiveItemsForTurn`、`liveTurn.revision`、`slotKeys`、`slotRevisions` 或 `slotOrder` 驱动的 read-time materialization / revision comparison / key scan。

该 issue 因此不应继续表述为 selector cache 高频失效仍存在。本地提交 `232047dfb` 后，也不应继续写成每个 raw delta 都 bump live item `revision` / `liveScrollPulse`；当前 batch reducer 会先按 live item bucket 聚合，随后每个 bucket 才更新一次 live item。当前仅保留为收窄后的 03 live consumption 边界: `CommittedTranscriptSurface` 在消费 live items 时仍会执行 `.some()`、`.filter()` 和 empty-surface scan。

## 证据

2026-07-09 当前代码复核:

- 限定范围内搜索 `selectCachedLiveItemsForTurn` / `liveTurn` / `slotKeys` / `slotRevisions` / `slotOrder` 未命中，旧 selector cache / slot revision 路径未见。
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:80`: 当前 live item 已是 reducer state 中的 `TranscriptRenderableLiveItem`。
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:94`: 当前 state 直接保存 `liveItemsByTurnId: Record<string, TranscriptRenderableLiveItem[]>`。
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:206`: `ensureLiveItemsForTurn` 只创建并保存 reducer-owned live item array。
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:253`: 当前 delta 通过 key/index 找到 live item。
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:308`: `applyAcceptedProjectionDeltaBatch` 处理 accepted projection delta batch。
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:315`: batch reducer 仍遍历 `notifications`。
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:323`: batch 内按 `liveItemKey(turnId, itemId)` 聚合 bucket。
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:330`: 同一 bucket 内执行 `bucket.delta += delta`。
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:337`: 每个 bucket 才查找一次 live item。
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:339`: 每个 bucket 才调用一次 `appendDeltaToLiveItem`。
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:271`: `appendDeltaToLiveItem` 更新 `transientText`。
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:273`: `appendDeltaToLiveItem` 递增 live item `revision`；batch action 中同一 live item 已收窄为每 bucket 一次。
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:274`: `appendDeltaToLiveItem` 调用 `bumpLiveScrollPulse(state)`；batch action 中同一 live item 已收窄为每 bucket 一次。
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:634`: batch action 调用 `applyAcceptedProjectionDeltaBatch`。
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:512`: `selectTranscriptLiveItemsForTurn` 直接返回 live item array 引用或 `EMPTY_LIVE_ITEMS`。
- `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx:205`: `LiveAssistantMessages` 对 live items 执行 `.filter(isLiveAgentMessage)`。
- `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx:228`: 当前 turn 判空对 live items 执行 `.some(isLiveAgentMessage)`。
- `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx:268`: surface-level `hasSurfaceContent` 扫描 turns。
- `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx:276`: `hasSurfaceContent` 在需要时调用 `selectTranscriptLiveItemsForTurn(...).some(isLiveAgentMessage)`。
- `codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts:140`: reducer test 覆盖同一 live item batch coalescing。
- `codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts:187`: reducer test 覆盖多 live item batch isolation。
- `codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts:302`: reducer test 覆盖 wrong-thread / unsupported batch filtering。
- `codex-gui/src/__tests__/App.browser.test.tsx:293`: browser test 覆盖 projection delta RAF batch regression。
- `codex-gui/src/__tests__/App.browser.test.tsx:337`: browser test 断言 batch 后显示 `Hello world`。
- `codex-gui/src/__tests__/App.browser.test.tsx:348`: browser test 断言同一 batch/live item 后 `revision: 1`。
- `docs/superpowers/reports/2026-07-09-codex-gui-03-performance-check/01-03-hot-paths.md:108`: 03 performance check 将该切片校准为 `部分过期`。

## 判断

2026-07-09 更新:旧 selector cache invalidation 路径已消除: `selectTranscriptLiveItemsForTurn` 的 read-time materialization 成本为 `O(1)` 读取。本地提交 `232047dfb` 后，同一 batch/live item 的 live item `revision` / `liveScrollPulse` 更新已收窄为每 bucket 一次，不再是每个 raw delta 都 bump。

当前残留边界属于 03 live consumption。每次 batch bucket 更新后仍会产生 live item state 变化，消费侧仍可能执行 current-turn `.some()` / `.filter()` 扫描，以及 `hasSurfaceContent` 空状态判断扫描。该边界随 batch flush、live item bucket 数、当前 turn live item 数、turn 数和 surface live item 数变化，而不是旧 selector cache 失效路径。

这个边界独立于 `09-projection-delta-transient-text-concat.md` 的字符串累加成本。

## 修复记录

- `232047dfb Optimize live agent delta batch accumulation`: 将 accepted projection delta batch 内同一 live item 的 mutation、`revision` 和 `liveScrollPulse` 更新收窄到每 bucket 一次；未修复本 issue 保留的 live consumption 扫描边界。

## 验证记录

- reducer test: `codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts`，30 passed。
- browser test: `codex-gui/src/__tests__/App.browser.test.tsx`，27 passed。
- type-check: pass。
- `format:oxfmt`: pass。

## 影响

旧 read-time materialization 风险已过期，同一 batch/live item 的 revision/pulse 更新频率也已收窄。但 live consumption 扫描仍可能随 batch flush、live item bucket 数、当前 turn live item 数、turn 数和 surface live item 数增长。

## 后续处理

如需继续处理收窄后的 live consumption 扫描边界，应单独进入设计/计划门禁，先设计、再计划。本 issue 只记录当前复杂度边界和证据，不给代码改动方向。
