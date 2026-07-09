# Projection delta transientText 字符串累加热路径

日期: 2026-07-06
状态: 🟡 部分完成，仍有 batch 内字符串累加边界
范围: `codex-gui/src/features/transcriptState`, `codex-gui/src/features/committedTranscriptSurface`
优先级: 未定

## 摘要

2026-07-09 本地提交 `232047dfb Optimize live agent delta batch accumulation` 后，该字符串累加热路径已收窄但未完全修复。同一 batch/live item 的 raw delta 不再逐个直接执行 `item.transientText += delta`，但 batch 内仍用 `bucket.delta += delta` 聚合，最终每个 bucket 仍调用一次 `item.transientText += delta`。

## 问题

原始问题是 live `agentMessage` delta 会追加到 renderable live item 的 `transientText` 字符串:

```ts
item.transientText += delta;
item.status = "streaming";
item.revision += 1;
```

本地提交 `232047dfb` 后，不再是每个 raw delta 都直接执行 `item.transientText += delta`。当前 batch reducer 会先按 live item 聚合，同一 batch/live item 的 delta 先通过 `bucket.delta += delta` 合并，随后每个 bucket 调用一次 `appendDeltaToLiveItem`，并在其中执行一次 `item.transientText += delta`。

JS 字符串不可变。该改动减少了同一 batch/live item 对 live item 长字符串的 append 次数，但仍保留 batch 内 bucket 字符串累加，以及最终每 bucket 一次的 `transientText` 长字符串追加。因此字符串累加风险被收窄但未完全修复，不能标记为已完成。

该问题只描述 text accumulation cost。`LiveMarkdownText` / `Streamdown` 的 Markdown rendering cost 是独立消费成本, 当前 issue 不把它扩展成已确认 finding。

## 证据

- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:80`: `TranscriptRenderableLiveItem.transientText` 当前仍是 `string`。
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:234`: live item 创建时 `transientText` 初始化为空字符串。
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:271`: `appendDeltaToLiveItem` 仍执行 `item.transientText += delta`。
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:308`: `applyAcceptedProjectionDeltaBatch` 处理 accepted projection delta batch。
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:315`: batch reducer 仍遍历 `notifications`。
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:323`: `agentMessage` delta 按 `liveItemKey(turnId, itemId)` 聚合到 bucket。
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:330`: 同一 batch/live item 内仍通过 `bucket.delta += delta` 做字符串累加。
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:337`: 每个 bucket 才查找一次 live item。
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:339`: 每个 bucket 才调用一次 `appendDeltaToLiveItem`，最终每 bucket 追加一次 `transientText`。
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:634`: batch action 调用 `applyAcceptedProjectionDeltaBatch`。
- `codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts:140`: reducer test 覆盖同一 live item batch coalescing。
- `codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts:187`: reducer test 覆盖多 live item batch isolation。
- `codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts:302`: reducer test 覆盖 wrong-thread / unsupported batch filtering。
- `codex-gui/src/__tests__/App.browser.test.tsx:293`: browser test 覆盖 projection delta RAF batch regression。
- `codex-gui/src/__tests__/App.browser.test.tsx:337`: browser test 断言 batch 后显示 `Hello world`。
- `codex-gui/src/__tests__/App.browser.test.tsx:348`: browser test 断言同一 batch/live item 后 `revision: 1`。
- `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx:195`: live assistant entry 将 `item.transientText` 传给 `LiveMarkdownText source`。
- `codex-gui/src/features/committedTranscriptSurface/LiveMarkdownText.tsx:11`: `source` 作为 `LiveMarkdownText` 入参。
- `codex-gui/src/features/committedTranscriptSurface/LiveMarkdownText.tsx:26`: `source` 作为 `Streamdown` children 渲染。
- `docs/superpowers/reports/2026-07-09-codex-gui-03-performance-check/01-03-hot-paths.md:65`: 03 performance check 将该切片校准为 `仍成立`。

## 判断

2026-07-09 更新:这个问题独立于 Redux action 投递频率。即使 action 投递已被 batch flush 改变，text accumulation 仍需要单独判断。

本地提交 `232047dfb` 后，同一 batch/live item 的 raw delta 已先聚合到 bucket，不再逐个直接追加到 live item 的 `transientText`。但当前仍有两类字符串追加边界: batch 内同一 bucket 的 `bucket.delta += delta`，以及最终每 bucket 一次的 `item.transientText += delta`。因此该 issue 应标记为部分完成，而不是 `✅ 已修复`。

复杂度变量仍包括 accumulated live text length、delta count、batch 分布和 live item bucket 数。Markdown rendering cost 只作为消费边界记录，不计入本 issue 的 text accumulation finding。

## 修复记录

- `232047dfb Optimize live agent delta batch accumulation`: 修改 `codex-gui/src/features/transcriptState/transcriptStateSlice.ts`、`codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts`、`codex-gui/src/__tests__/App.browser.test.tsx`，将同一 batch/live item 的 raw delta 先聚合到 bucket，再每 bucket 追加一次 live item `transientText`。

## 验证记录

- reducer test: `codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts`，30 passed。
- browser test: `codex-gui/src/__tests__/App.browser.test.tsx`，27 passed。
- type-check: pass。
- `format:oxfmt`: pass。

## 影响

长文本 streaming 在小 delta 高频追加时的 live item 长字符串追加次数已减少，但 batch 内 bucket 字符串累加和最终每 bucket 一次的长字符串追加仍可能产生复制成本。Markdown rendering 是独立消费成本，不能替代该 text accumulation 风险判断。

## 后续处理

如需继续处理 batch 内字符串累加边界，应单独进入设计/计划门禁，先设计、再计划。本 issue 只记录当前复杂度边界和证据，不给代码改动方向。
