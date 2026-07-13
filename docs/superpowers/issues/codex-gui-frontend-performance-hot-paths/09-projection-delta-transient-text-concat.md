# Projection delta transientText 字符串累加热路径

日期: 2026-07-06
状态: 🟡 部分完成，仍有 transientText 长字符串追加边界
范围: `codex-gui/src/features/transcriptState`, `codex-gui/src/features/committedTranscriptSurface`
优先级: 未定

## 摘要

2026-07-13 当前工作区改造后，同一 batch/live item 的 raw delta 已改为数组收集：单 delta 直接取值，多 delta 只执行一次 `join("")`。batch 内连续字符串拼接已移除，但每个有效 bucket 仍调用一次 `appendDeltaToLiveItem`，并在其中执行一次 `item.transientText += delta`，因此该热路径仍为部分完成。

## 问题

原始问题是 live `agentMessage` delta 会追加到 renderable live item 的 `transientText` 字符串：

```ts
item.transientText += delta;
item.status = "streaming";
item.revision += 1;
```

本地提交 `232047dfb` 先将同一 batch/live item 的 raw delta 聚合到 bucket，避免每个 raw delta 都直接追加 live item 长字符串。2026-07-13 当前工作区进一步将 bucket 内部改为有序 `deltas` 数组：创建 bucket 时保存首个 delta，后续 delta 使用 `push` 收集；找到 live item 后，单元素直接取 `deltas[0]`，多元素只执行一次 `deltas.join("")`。

当前 batch 内已不再连续拼接字符串，并且 missing live item 会在物化合并文本之前跳过。剩余边界是每个有效 bucket 仍向完整 `transientText` 追加一次合并后的 delta。JS 字符串不可变，因此累计 live text 较长、batch 较多时，这个长字符串追加边界仍需要保留，不能标记为已修复。

该问题只描述 text accumulation cost。`LiveMarkdownText` / `Streamdown` 仍消费完整字符串，其 Markdown rendering cost 是独立的下游边界，当前 issue 不把它扩展成已确认 finding。

## 证据

- `codex-gui/src/features/transcriptState/transcriptStateModel.ts:65`: `TranscriptRenderableLiveItem` 数据模型定义。
- `codex-gui/src/features/transcriptState/transcriptStateModel.ts:71`: `transientText` 当前仍是 `string`。
- `codex-gui/src/features/transcriptState/transcriptLiveProjection.ts:41`: live item 创建时 `transientText` 初始化为空字符串。
- `codex-gui/src/features/transcriptState/transcriptLiveProjection.ts:75`: `AgentMessageDeltaBucket` 定义在 projection 模块中。
- `codex-gui/src/features/transcriptState/transcriptLiveProjection.ts:78`: bucket 使用非空 `deltas: [string, ...string[]]`。
- `codex-gui/src/features/transcriptState/transcriptLiveProjection.ts:81`: `appendDeltaToLiveItem` 处理有效 live item 的追加。
- `codex-gui/src/features/transcriptState/transcriptLiveProjection.ts:86`: 每个有效 bucket 最终仍执行一次 `item.transientText += delta`。
- `codex-gui/src/features/transcriptState/transcriptLiveProjection.ts:123`: `applyAcceptedProjectionDeltaBatch` 处理 accepted projection delta batch。
- `codex-gui/src/features/transcriptState/transcriptLiveProjection.ts:130`: batch reducer 遍历 `notifications`。
- `codex-gui/src/features/transcriptState/transcriptLiveProjection.ts:141`: 新 bucket 以 `[delta]` 初始化。
- `codex-gui/src/features/transcriptState/transcriptLiveProjection.ts:145`: 同一 batch/live item 的后续 delta 使用 `bucket.deltas.push(delta)` 收集。
- `codex-gui/src/features/transcriptState/transcriptLiveProjection.ts:153`: 每个 bucket 先查找对应 live item。
- `codex-gui/src/features/transcriptState/transcriptLiveProjection.ts:154`: missing live item 在合并文本物化前跳过。
- `codex-gui/src/features/transcriptState/transcriptLiveProjection.ts:158`: 单 delta 直接取值，多 delta 只执行一次 `deltas.join("")`。
- `codex-gui/src/features/transcriptState/transcriptLiveProjection.ts:159`: 每个有效 bucket 调用一次 `appendDeltaToLiveItem`。
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:140`: batch action 交给 `applyAcceptedProjectionDeltaBatch`。
- `codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveStreaming.test.ts:123`: reducer test 覆盖同一 live item 的多 delta 顺序合并，以及每 bucket 一次 `revision` / `liveScrollPulse` 更新。
- `codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveStreaming.test.ts:170`: reducer test 覆盖单 delta batch 路径。
- `codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveStreaming.test.ts:219`: reducer test 覆盖多 live item batch isolation。
- `codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveStreaming.test.ts:334`: reducer test 覆盖 missing live item batch。
- `codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveStreaming.test.ts:365`: reducer test 覆盖 wrong-thread / unsupported batch filtering。
- `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx:195`: live assistant entry 将完整 `item.transientText` 传给 `LiveMarkdownText source`。
- `codex-gui/src/features/committedTranscriptSurface/LiveMarkdownText.tsx:11`: `source` 仍是 `string` 入参。
- `codex-gui/src/features/committedTranscriptSurface/LiveMarkdownText.tsx:26`: 完整 `source` 仍作为 `Streamdown` children 渲染。
- `docs/superpowers/reports/2026-07-09-codex-gui-03-performance-check/01-03-hot-paths.md:65`: 03 performance check 将该切片校准为 `仍成立`。

## 判断

2026-07-09 更新：这个问题独立于 Redux action 投递频率。即使 action 投递已被 batch flush 改变，text accumulation 仍需要单独判断。

2026-07-13 当前工作区已经移除 batch 内同一 bucket 的连续字符串拼接。batch 聚合成本现在是按顺序收集 delta 引用，并在确认 live item 存在后按 bucket 最多物化一次合并文本。单 delta bucket 不执行 `join`，多 delta bucket 只执行一次 `join`。

剩余字符串边界是每个有效 bucket 一次 `item.transientText += delta`，以及下游继续消费完整 `transientText` 字符串。因此该 issue 应继续标记为部分完成，而不是 `✅ 已修复`。复杂度变量仍包括 accumulated live text length、有效 live item bucket 数和 batch 分布；raw delta count 不再通过 bucket 内连续字符串拼接放大当前 issue 的成本。

Markdown rendering cost 只作为消费边界记录，不计入本 issue 的 text accumulation finding。

## 修复记录

- `232047dfb Optimize live agent delta batch accumulation`: 修改 `codex-gui/src/features/transcriptState/transcriptStateSlice.ts`、`codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts`、`codex-gui/src/__tests__/App.browser.test.tsx`，将同一 batch/live item 的 raw delta 先聚合到 bucket，再每 bucket 追加一次 live item `transientText`。
- 2026-07-13 当前工作区改造：`AgentMessageDeltaBucket` 改为非空 `deltas` 数组，新 bucket 保存首个 delta，后续 delta 使用 `push`；missing live item 不物化合并文本，单元素直接取值，多元素执行一次 `join("")`。当前尚无对应 commit hash。

## 验证记录

- 聚焦 reducer test: `codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveStreaming.test.ts`，8 passed。
- type-check: pass。
- `oxfmt --check`: `transcriptLiveProjection.ts` 与 `transcriptStateLiveStreaming.test.ts`，pass。
- 历史验证：`codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts`，30 passed；`codex-gui/src/__tests__/App.browser.test.tsx`，27 passed；type-check pass；`format:oxfmt` pass。

## 影响

同一 batch/live item 内不会再形成连续字符串拼接链，且 missing live item 不会产生无用的合并字符串。长文本 streaming 仍会按有效 bucket 向不断增长的 `transientText` 追加一次，后续 `LiveMarkdownText` / `Streamdown` 仍接收完整字符串，因此本次改造收窄了时间片内部成本，但没有消除完整 live text 的追加与消费边界。

## 后续处理

后续如需继续优化，应聚焦每个有效 bucket 的 `transientText` 长字符串追加，以及 `LiveMarkdownText` / `Streamdown` 的完整字符串输入边界。进一步改动仍需单独进入设计与计划阶段。
