# Transcript rendering audit

## 审计范围

- turn/chunk/entry render boundary。
- 长 transcript DOM。
- collapsed hidden content。
- full-turn flatten/grouping。
- chunk-level memo boundary。

## 审计条目

## 审计条目：long transcript mounted rendering

## 结论

`04-long-transcript-no-windowing.md` 仍成立。当前源码仍按完整 `turnIds`、展开的 `chunkIds`、chunk entries、final entries 渲染，没有静态可见的窗口化或渲染裁剪。浏览器 layout/paint/FPS 影响不在本轮静态审计内；本条只归因源码层面的 DOM/React tree 随历史线性增长路径。

## 审计字段

- 关联 issue: `docs/superpowers/issues/codex-gui-frontend-performance-hot-paths/04-long-transcript-no-windowing.md`
- 触发源: transcript surface render、Redux selector 订阅更新、turn/chunk/entry 追加或更新、snapshot rebuild 后首次渲染
- 触发频率: 每次 surface render 遍历 mounted turn 列表；每个 mounted/expanded chunk selector 随 store update 运行
- 单次同步工作: `turnIds.map` 为 `O(T)`；expanded middle module 为 `O(C_turn)`；chunk entry render 为 `O(E_chunk)`；final assistant selector/render 为 `O(F_turn)`
- 规模变量: turns、chunks、entries、mounted DOM nodes、expanded modules、final assistant entries
- 累计复杂度: 长 transcript mounted DOM 和 render traversal 随 visible committed entries 线性增长；collapsed 且已有 final answer 的 middle entries 不计入 mounted DOM，但展开后按 chunks/entries 线性挂载
- 复杂度优先级: P1
- 当前状态: 已有 issue 仍成立

## 关键证据路径/行号

- `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx:265`: surface 读取 `turnIds` 与状态。
- `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx:313`: 对完整 `turnIds.map(...)` 渲染 turn 列表。
- `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx:155`: 展开时按 `chunkIds.map(...)` 挂载 middle chunks。
- `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx:108`: chunk 内对 `chunk.entries.map(...)` 渲染完整 chunk entries。
- `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx:169`: final assistant selector 对 `entryIds.flatMap(...)` 取 entry。
- `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx:182`: final assistant entries 完整 map 渲染。

## 已排除项

- 未把 browser layout、paint、FPS、实际滚动卡顿作为直接结论。
- 未把 collapsed 且已有 final answer 的 hidden middle entries 计入 mounted DOM。

## 风险

`04` 的性能严重度仍缺少真实 DOM 数、layout 时间和长会话交互指标；当前优先级按源码路径评为 `P1`，不是浏览器实测结论。

## 报告建议

报告中明确区分：源码可归因的是 mounted DOM / render traversal 随 `T/C/E/F` 增长；layout/paint/FPS 不属于本轮静态审计结论。

## 审计条目：temporary grouping and collapsed hidden content

## 结论

`06-temporary-grouping-full-turn-scan.md` 已修复。限定源码内未见旧的 render-time full-turn grouping/flatten 路径；temporary label 由 `middleEntryCount` 提供，collapsed 且已有 final answer 时不会挂载 hidden middle entries。

## 审计字段

- 关联 issue: `docs/superpowers/issues/codex-gui-frontend-performance-hot-paths/06-temporary-grouping-full-turn-scan.md`
- 触发源: temporary middle module render
- 触发频率: mounted turn render 或 expand/collapse 状态变化
- 单次同步工作: label 直接使用 `middleEntryCount`；collapsed 且已有 final answer 时不渲染 entries；展开后按 chunk/entry 线性挂载
- 规模变量: middle chunks、middle entries、expanded modules、collapsed hidden entries
- 累计复杂度: 旧 full-turn grouping 累计二次形态未在当前源码中成立
- 复杂度优先级: 非 finding
- 当前状态: 已修复

## 关键证据路径/行号

- `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx:117`: temporary module 以 turn 的 `chunkIds`、`middleEntryCount` 为输入。
- `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx:127`: label 直接来自 `middleEntryCount`，不是扫描 entries。
- `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx:128`: `shouldShowEntries = !hasFinalAnswer || isExpanded`。
- `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx:153`: collapsed 且已有 final answer 时不渲染 entries。
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:437`: append middle entry 时递增 `middleEntryCount`。

## 已排除项

- 旧 `committedTranscriptDisplayGroups` / `groupTranscriptEntriesForDisplay` full-turn grouping：限定当前源码未见调用入口。
- collapsed hidden middle content DOM：已有 final answer 且未展开时不挂载 `MiddleTranscriptChunk`。

## 风险

若窗口化、CSS containment 或外层裁剪在其他文件实现，本轮限定文件不能归因；本条只判断旧 grouping/hidden content 路径。

## 报告建议

将 `06` 标记为已修复，复杂度优先级为 `非 finding`。

## 审计条目：chunk view selector rebuild

## 结论

`02-transcript-chunk-selector-view-rebuild.md` 已修复。chunk selector 通过 `WeakMap` + `chunk.revision` 缓存 view；未变化 chunk 不再每次重建 entries view。剩余 equality 线性比较只在引用未命中或变化路径上成立，不构成原 issue。

## 审计字段

- 关联 issue: `docs/superpowers/issues/codex-gui-frontend-performance-hot-paths/02-transcript-chunk-selector-view-rebuild.md`
- 触发源: mounted/expanded chunk selector on store update
- 触发频率: store updates、chunk cache miss、chunk revision changes
- 单次同步工作: chunk cache hit 为 `O(1)`；cache miss 为 `O(E_chunk)`；equality 非同引用且基础字段相同时逐 entry 比较
- 规模变量: chunks、entries per chunk、chunk revision、mounted chunk selectors
- 累计复杂度: 不再是每次 store update 对 mounted chunk 重建 entries view；materialization 限定在 cache miss 或 revision 变化路径
- 复杂度优先级: 非 finding
- 当前状态: 已修复

## 关键证据路径/行号

- `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx:96`: `MiddleTranscriptChunk` 是 memo 边界。
- `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx:97`: chunk selector 使用 `selectTranscriptChunk`。
- `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx:99`: selector equality 使用 `areTranscriptChunkViewsEqual`。
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:106`: chunk view cache 为 `WeakMap<TranscriptChunk, TranscriptChunkViewCacheEntry>`。
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:520`: selector 按 chunk object 读缓存。
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:521`: revision 命中时返回旧 view。
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:529`: cache miss 时才 `chunk.entryIds.flatMap(...)`。
- `codex-gui/src/features/committedTranscriptSurface/committedTranscriptChunkEquality.ts:38`: chunk view 引用相同直接相等。
- `codex-gui/src/features/committedTranscriptSurface/committedTranscriptChunkEquality.ts:46`: id、turnId、revision、entries length 不同即不等。
- `codex-gui/src/features/committedTranscriptSurface/committedTranscriptChunkEquality.ts:55`: 非同引用且基础字段相同后逐 entry 比较。

## 已排除项

- `02` 的每次 store update 重建 chunk view：当前 `WeakMap` + `revision` cache 命中路径排除该问题。
- selector 定义层面的 `02` 结论也在 state/projection 报告中记录；本处只保留 rendering 消费侧证据。

## 风险

chunk equality 的线性 fallback 仍存在于非同引用且基础字段一致的路径，但当前证据不足以把它归为原 `02` finding。

## 报告建议

将 `02` 标记为已修复，复杂度优先级为 `非 finding`。
