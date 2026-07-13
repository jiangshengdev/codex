# Live slot selector cache 高频失效

日期: 2026-07-06
状态: 📏 待量化，旧问题已过期但仍有消费侧扫描
范围: `codex-gui/src/features/transcriptState`, `codex-gui/src/features/committedTranscriptSurface`
优先级: 未定

## 摘要

旧 live slot selector cache invalidation 路径已不存在，当前按 turn 读取 live items 的 selector 链为 `O(1)`。仍需量化的是 `CommittedTranscriptSurface` 在 batch dispatch 后执行的 turn、assistant item 和 live item 消费侧扫描。

## 问题

原始问题假设是 `selectCachedLiveItemsForTurn` 依赖 `liveTurn.revision`、`slotKeys` 和 `slotRevisions` 判断缓存是否可复用，每个 projection delta 都可能使当前 turn 的 live item view cache 失效并重新 materialize `TranscriptRenderableLiveItem[]`。当前实现已经移除这条 read-time materialization 路径，因此不能继续把问题描述为 selector cache 高频失效。

当前残留问题位于消费侧。每个 RAF flush 最多 dispatch 一个 `threadRuntimeDeltasAccepted` action，action 内可以包含多个 bucket；Redux 消费者接收的是整个 batch action 产生的 state 更新，不是逐 bucket 通知。batch reducer 会按 live item 聚合 delta，同一 item 的字符串片段在 bucket 末尾一次 `join`，并且每个 bucket 只 append 一次、递增一次 `revision`、更新一次 `liveScrollPulse`。

batch state 更新后，`CommittedTranscriptSurface` 仍会执行 current-turn `.some()`、渲染 `.filter()`，以及 surface-level `turnIds.some()` 和按需 live `.some()`。消费侧总成本约为 batch dispatch / RAF flush 次数 × 每次扫描规模；每次扫描规模由受影响 turn 数、surface turn 数，以及相关 turn 的 live item / assistant item 数决定。bucket 数只有在影响更多 turn 时才会间接扩大消费范围，不会产生逐 bucket Redux 通知。

## 证据

- `codex-gui/src/features/transcriptState/transcriptStateModel.ts:75-86`: transcript state model 定义并保存 reducer-owned `liveItemsByTurnId`。
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:54-81`: transcript state slice 暴露 slice selectors。
- `codex-gui/src/features/transcriptState/transcriptStateSelectors.ts:44-53`: `selectTranscriptLiveItemsForTurn` 通过 `transcriptLiveItemsForTurn` 读取 turn 对应数组。
- `codex-gui/src/features/transcriptState/transcriptLiveProjection.ts:8,70-73`: 该模块提供共享的 `EMPTY_LIVE_ITEMS`，`liveItemsForTurn` 直接返回 `state.liveItemsByTurnId[turnId] ?? EMPTY_LIVE_ITEMS`；selector 链 `selectTranscriptLiveItemsForTurn -> transcriptLiveItemsForTurn -> liveItemsForTurn -> state.liveItemsByTurnId[turnId] ?? EMPTY_LIVE_ITEMS` 为 `O(1)`。
- `codex-gui/src/features/appShell/GuiHostConnectionBridge.tsx:61-81`: projection deltas 进入 RAF batch，每个 flush 最多 dispatch 一个 `threadRuntimeDeltasAccepted` action，多个 bucket 位于同一个 reducer action 内。
- `codex-gui/src/features/transcriptState/transcriptLiveProjection.ts:123-160`: batch reducer 按 live item 建 bucket；同一 item 的 deltas 先保存在数组中，在 bucket 末尾一次 `join`，每个 bucket 只执行一次 append、`revision` 和 `liveScrollPulse` 更新。
- `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx:200-228`: current-turn 判空使用 `.some()`，live assistant message 渲染使用 `.filter()`。
- `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx:265-279`: surface-level 判空使用 `turnIds.some()`，并在需要时对该 turn 的 live items 执行 `.some()`。
- `codex-gui/src/features/transcriptState/__tests__/transcriptStateSelectorCache.test.ts:175-305`: 覆盖当前 selector 引用与 cache 行为。
- `codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveStreaming.test.ts:123-310`: 覆盖 live streaming batch 聚合、item 隔离与过滤行为。
- `codex-gui/src/__tests__/App.browser.test.tsx:293-349`: browser regression 覆盖 projection delta RAF batch，并断言同一 batch/live item 的合并文本和单次 revision 更新。
- `docs/superpowers/reports/2026-07-09-codex-gui-03-performance-check/01-03-hot-paths.md:108`: 既有性能复核已将原始问题校准为部分过期。

## 判断

原始 selector cache invalidation 问题已过期：当前 selector 不再执行 revision comparison、key scan 或 read-time materialization，按 turn 读取 live items 是 `O(1)`。

仍成立但尚未量化的是消费侧扫描。其触发频率取决于 batch dispatch / RAF flush 次数；单次成本取决于受影响 turn 数、surface turn 数，以及相关 turn 内的 live item / assistant item 数。现有证据不足以判断这些扫描是否构成值得优化的实际热路径，因此状态为待量化。

该边界与 `09-projection-delta-transient-text-concat.md` 记录的字符串累加成本不同。`d7a554d9c` 改进的是 delta bucket 内的字符串聚合，并未修复或消除这里的消费侧扫描。

## 修复记录

- `232047dfb Optimize live agent delta batch accumulation`: 将 accepted projection delta batch 内同一 live item 的 mutation、`revision` 和 `liveScrollPulse` 更新收窄为每 bucket 一次。
- `d7a554d9c Optimize live delta batching and add regression tests`: 将同一 delta bucket 的字符串片段改为数组聚合并在 bucket 末尾一次 `join`；该提交不视为消费侧扫描修复。

## 验证记录

- 历史 reducer test: `codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts`，30 passed；该文件现已拆分，当前相关测试锚点为 `transcriptStateSelectorCache.test.ts:175-305` 和 `transcriptStateLiveStreaming.test.ts:123-310`。
- browser test: `codex-gui/src/__tests__/App.browser.test.tsx`，27 passed；当前相关 regression 位于 `App.browser.test.tsx:293-349`。
- type-check: pass。
- `format:oxfmt`: pass。

## 影响

继续沿用旧问题表述会把已经消失的 selector cache invalidation 当成当前瓶颈，并把一个 batch action 内的多个 bucket 误解为逐 bucket Redux 通知。当前真实风险是 batch dispatch 后的消费侧线性扫描可能随 surface turn 数及相关 turn 的 live item / assistant item 数增长，但在缺少 profiler 和计数证据时，无法判断其用户可见影响或优化优先级。

## 后续处理

先通过 profiler 和计数量化 surface selector 求值频率、扫描的 turn 前缀长度，以及受影响 turn 的 live item / assistant item 数。取得量化结果后，再决定是否将消费侧扫描作为独立问题进入单独设计与计划；本 issue 不预设具体代码修改方向。
