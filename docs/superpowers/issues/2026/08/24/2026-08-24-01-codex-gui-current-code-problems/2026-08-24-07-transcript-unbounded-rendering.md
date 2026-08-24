# Transcript 部分聚合与渲染路径缺少规模上界

日期: 2026-08-24
状态: 📏 待量化
范围: Transcript state / selectors / rendering hot path
优先级: P2

## 摘要

Transcript 的 middle entries 分块和折叠卸载已经有效，但 final answers、当前 context page 与 last-fragment topology 仍存在随 task 历史增长的聚合路径；当前尚未量化真实耗时、重渲染频率和 DOM 规模。

## 问题

Transcript state 对普通 middle entries 设置了固定 chunk 上限，渲染层也会在 final answer 出现后卸载折叠的中间内容，并只挂载当前 context page。这些机制已经限制了部分 state 更新和 DOM 成本，不能据此把整个 Transcript 实现判断为无界或失效。

剩余风险集中在三个窄边界：单个 fragment 的 `finalAssistantEntryIds` 没有本地数量上限；单个当前 context page 的 `turnFragmentIds` 会在下一次 context compaction 前持续追加；last-fragment selector 在 topology cache miss 时会遍历全部 context pages 及其 fragments。渲染层随后映射当前页的全部 fragments，并为每个 fragment 聚合、渲染全部 final assistant entries。

因此，长 task 可能在这些路径上产生更大的 selector 扫描、数组聚合、React 渲染与 DOM 常驻成本。但是本轮没有证明这些增长已经达到可感知的性能故障，也没有得到触发阈值。

## 证据

- `codex-gui/src/features/transcriptState/transcriptStateModel.ts:16-42` 中，`TranscriptTurn`、`TranscriptTurnFragment` 和 `TranscriptContextPage` 分别持有 `finalAssistantEntryIds`、`middleChunkIds` 与 `turnFragmentIds` 数组；这些 topology 字段自身没有数量上限。
- `codex-gui/src/features/transcriptState/transcriptStateImplementation.ts:178-198` 通过 `TARGET_TRANSCRIPT_CHUNK_ENTRY_LIMIT` 为 middle entries 创建固定大小的 chunk，说明 middle entry state 已有明确分块边界。
- `codex-gui/src/features/transcriptState/transcriptStateImplementation.ts:272-281` 把 final assistant entry 持续追加到 turn 和当前 fragment 的 `finalAssistantEntryIds`，该路径没有对应的分块或上限。
- `codex-gui/src/features/transcriptState/transcriptContextPages.ts:72-91` 只在 context boundary 到来时创建新 page；当前 page 在此之前可继续接收 turn fragments。
- `codex-gui/src/features/transcriptState/transcriptStateSelectors.ts:54-82` 缓存 last-fragment 映射，但在 `contextPagesById` topology identity 变化导致 cache miss 时，会遍历全部 page IDs 以及每页的全部 fragment IDs 来重建结果。
- `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurfaceRenderer.tsx:28-32` 在 surface 顶层订阅完整 page ID 列表和 last-fragment 映射。
- `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurfaceRenderer.tsx:115-123` 映射当前 page 的全部 `turnFragmentIds`，没有对单页 fragment 数量做窗口化。
- `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx:730-780` 以 chunk 为单位渲染 middle entries，并在存在 final answer 且折叠时不挂载 chunk 内容；这是已经有效的边界保护。
- `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx:783-803` 对传入 fragment 的全部 `finalAssistantEntryIds` 执行 selector 聚合和逐项渲染。
- `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx:820-833` 每个 fragment 都读取自身 topology 和对应 turn，并使用全局 last-fragment 映射判断状态。
- `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx:879-896` 当前页内的每个 fragment 都挂载 leading、middle module、全部 final messages 以及适用的错误状态。
- `codex-gui/src/features/transcriptState/__tests__/transcriptStateSelectorCache.test.ts:63-83` 验证同一 transcript topology 下 last-fragment selector 的引用缓存有效，但没有覆盖大规模 topology 变化时的扫描耗时。
- `codex-gui/src/features/committedTranscriptSurface/__tests__/TranscriptContextPagination.browser.test.tsx:51-75` 验证切换 context page 会卸载上一页，说明非当前页不会持续留在 DOM。
- `codex-gui/src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx:1210-1232,1257-1283` 验证存在 final answer 时 middle content 默认折叠且不会预先挂载 Markdown；现有测试未测量大量 final answers、单页 fragments 或完整 last-fragment topology 的成本。

## 判断

当前结论是待量化的性能与规模风险，不是已复现 bug。代码证据确认了 final answers、当前 context page 和 last-fragment topology 缺少局部规模上界，但没有证明真实 task 会形成足够大的数据集，也没有测得 selector 耗时、React commit 耗时、内存或 DOM 节点数。

middle chunk 的 100 项分块、final answer 后折叠内容卸载，以及 context page 切换时卸载非当前页均已由实现和现有测试支持，不属于本 issue 的问题范围。

## 影响

如果长 task 在单个 context page 中累积大量 fragments，或在 fragment 中累积大量 final assistant entries，当前页渲染成本和常驻 DOM 可能随数据量增长。topology 变化还可能触发 last-fragment 映射的全历史重建，从而把历史规模带入热更新路径。

在没有量化前直接进行窗口化、拆分 topology 或改变渲染模型，可能优化一个并未形成实际瓶颈的路径，并引入 transcript 顺序、状态标记或 context pagination 回归。因此该风险当前不应作为“大型重构”的既定依据。

## 后续处理

先用代表性长 task fixture 或受控基准分别量化：last-fragment selector 在 topology 变化时的耗时、当前 page 不同 fragment 数量下的 React render/commit 耗时、final assistant entries 增长时的 DOM 节点数与内存，以及现有 middle collapse/context page 卸载机制的实际效果。

量化结果若达到用户可感知或测试可稳定复现的阈值，再单独进入设计与计划阶段，确定需要施加上界的具体路径；不要把已有效的 middle chunk 和非当前页卸载机制一并重写。

本轮未运行测试。
