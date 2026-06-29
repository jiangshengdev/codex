# Transcript revision invalidation invariant

日期:2026-06-28
状态:未收束
范围:`codex-gui/src/features/transcriptState`, `codex-gui/src/features/committedTranscriptSurface`

## 问题摘要

`codex-gui` 的 transcript `revision` 不是 Rust/protocol 层提供的版本号, 而是前端在
`transcriptState` 内部自造的缓存失效 token。它只有在以下不变量成立时才有价值:

> 任何会影响某个 transcript chunk view 渲染结果的写入, 都必须 bump 对应 entry revision,
> 并 bump 所属 chunk revision。

如果 equality 逻辑在 `id` / `revision` 之外继续比较 `role`、`source`、`sourceKind`、
`phase`、`status` 等渲染字段, 等于承认 `revision` 不能单独表达渲染等价性。

## 背景

`selectTranscriptChunk` 的缓存设计使用:

- `TranscriptChunk` object identity 区分 snapshot rebuild 后的同 id / 同 revision chunk。
- `chunk.revision` 作为同一 chunk object 内部的 view 失效条件。

该设计目标是避免无关 Redux 更新时反复 materialize `entries`, 让 unchanged chunk 能返回稳定
`TranscriptChunkView` 引用。

## 当前矛盾

`areTranscriptChunkViewsEqual` 在 entry `id` 和 `revision` 相同的情况下, 继续比较部分渲染字段:

- message: `role`、`source`、`sourceKind`、`phase`
- status: `status`

这能补住某些 UI stale render, 但也让 cache invalidation 规则变得分裂: selector 依赖
`chunk.revision`, render equality 又依赖字段快照。

2026-06-29 只读复核没有发现当前 `transcriptState` 写路径存在严重 revision bump 漏洞:

- existing live committed entry update 会 bump entry revision 和所属 chunk revision。
- live append 会 bump chunk revision。
- snapshot rebuild 使用 fresh chunk object, 不会复用旧 WeakMap cache entry。

剩余问题是设计和维护性: equality 仍在字段级兜底, `revision` invariant 没有收束为唯一边界。

## 建议方向

1. 保留 `revision`, 不直接删除。
2. 用 focused tests 覆盖同一 entry id 的 live update 改变 `phase`、`source`、`status` 时,
   entry revision 和 chunk revision 都递增。
3. 在 invariant 被测试锁住后, 删除字段级 equality 补丁, 让 `areTranscriptChunkViewsEqual`
   回到依赖 entry `id` / `revision` 的语义。
4. 未来新增 transcript entry 类型或渲染字段时, 同步确认 revision bump 规则。
