# Transcript chunk selector 重建 view 热路径

日期: 2026-06-23
状态: ✅ 已修复
范围: `codex-gui/src/features/transcriptState`, `codex-gui/src/features/committedTranscriptSurface`
优先级: 未定

## 摘要

该 selector view 重建热路径已在 2026-06-27 通过 chunk view 缓存修复。

## 问题

旧实现中, 每个 transcript chunk selector 在每次 store 更新时都会返回新的
`{ id, turnId, revision, entries }` 对象, 并通过 `chunk.entryIds.flatMap(...)` 重建
`entries`。

自定义 equality function 可以阻止 React 子树重渲染, 但不能阻止 selector 本身和 equality
比较在每次 store 更新时运行。长 transcript 中已经挂载多个 chunk 后, 每条事件都可能产生
`O(已挂载 chunk 数 * 每 chunk entry 数)` 的同步工作。

## 证据

2026-07-09 当前代码复核:

- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:106`: `transcriptChunkViewCache` 仍是 module-private `WeakMap<TranscriptChunk, TranscriptChunkViewCacheEntry>`。
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:463`: `selectCachedTranscriptChunkView` 按 chunk object 读取缓存。
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:467`: `cachedEntry?.revision === chunk.revision` 时直接返回旧 view。
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:482`: cache miss 后写回 `{ revision, view }`。
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:503`: `selectTranscriptChunk` 仍经由 `selectCachedTranscriptChunkView`。

历史修复前证据:

- `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx:59`
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:259`
- `codex-gui/src/features/committedTranscriptSurface/committedTranscriptChunkEquality.ts:24`

## 判断

已修复。2026-07-09 复核确认 unchanged chunk 在无关 Redux 更新后仍不会重复 materialize `entries`。

## 修复记录

2026-06-27 已修复:

- `selectTranscriptChunk` 通过 module-private `WeakMap` 按 `TranscriptChunk` object identity
  和 `chunk.revision` 缓存 `TranscriptChunkView`。
- unchanged chunk 在无关 Redux 更新后不再重复 materialize `entries`。

## 验证记录

覆盖测试已加入 `codex-gui/src/features/transcriptState/__tests__/transcriptStateSlice.test.ts`,
包括:

- unchanged chunk 引用稳定。
- chunk 变更后缓存失效。
- snapshot reattach 不复用旧 view。

当时验证通过:`pnpm run ci`。

## 影响

修复前长 transcript 中多个已挂载 chunk 会放大每次 store update 的 selector 同步工作。修复后该 issue 记录的 read-time view 重建成本已消除。

## 后续处理

无需继续处理该 issue。未来如新增 transcript chunk view 字段，应复核缓存失效条件和引用稳定性。
