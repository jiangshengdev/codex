# Projection delta transientText 字符串累加热路径

日期: 2026-07-06
状态: 🔴 仍成立
范围: `codex-gui/src/features/transcriptState`, `codex-gui/src/features/committedTranscriptSurface`
优先级: 未定

## 摘要

2026-07-09 更新后，该字符串累加热路径仍成立，并独立于 Redux action 投递频率。

## 问题

当前 03 实现仍把 live `agentMessage` delta 追加到 renderable live item 的 `transientText` 字符串:

```ts
item.transientText += delta;
item.status = "streaming";
item.revision += 1;
```

JS 字符串不可变。长回答如果按小 delta 高频追加, `transientText += delta` 会反复复制已有文本。随着 accumulated live text length 增长, 单次追加成本也会增长；最终文本长度为 `N`、delta 数为 `D` 时, 累积复制成本是前缀长度求和, 小 delta 场景下可接近 `O(N^2)`。

该问题只描述 text accumulation cost。`LiveMarkdownText` / `Streamdown` 的 Markdown rendering cost 是独立消费成本, 当前 issue 不把它扩展成已确认 finding。

## 证据

- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:80`: `TranscriptRenderableLiveItem.transientText` 当前仍是 `string`。
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:234`: live item 创建时 `transientText` 初始化为空字符串。
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:268`: `appendAgentMessageDeltaToLiveItem` 执行 `item.transientText += delta`。
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:285`: `agentMessage` delta 分支把 `delta` 交给 append 函数。
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:572`: 单个 accepted delta 进入 `applyAcceptedProjectionDelta`。
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:574`: 批量 accepted delta action 遍历 notifications。
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:576`: 批量 action 内每个 notification 都进入 `applyAcceptedProjectionDelta`。
- `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx:195`: live assistant entry 将 `item.transientText` 传给 `LiveMarkdownText source`。
- `codex-gui/src/features/committedTranscriptSurface/LiveMarkdownText.tsx:11`: `source` 作为 `LiveMarkdownText` 入参。
- `codex-gui/src/features/committedTranscriptSurface/LiveMarkdownText.tsx:26`: `source` 作为 `Streamdown` children 渲染。
- `docs/superpowers/reports/2026-07-09-codex-gui-03-performance-check/01-03-hot-paths.md:65`: 03 performance check 将该切片校准为 `仍成立`。

## 判断

2026-07-09 更新:这个问题独立于 Redux action 投递频率。即使 action 投递已被 batch flush 改变, 只要 accepted `agentMessage` delta 在 reducer 内仍用长字符串反复 `+=`, 长文本 streaming 仍可能在 text accumulation 点产生前缀复制成本。

复杂度变量是 accumulated live text length 与 delta count。Markdown rendering cost 只作为消费边界记录, 不计入本 issue 的 text accumulation finding。

## 影响

长文本 streaming 在小 delta 高频追加时可能产生前缀复制成本，最坏情况下累积成本接近 `O(N^2)`。Markdown rendering 是独立消费成本，不能替代该 text accumulation 风险判断。

## 后续处理

如需继续处理该 text accumulation 风险, 应单独进入设计/计划门禁，先设计、再计划。本 issue 只记录当前复杂度边界和证据, 不给代码改动方向。
