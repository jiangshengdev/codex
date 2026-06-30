# Transcript revision invalidation invariant

日期:2026-06-28
状态:一般路径已确认, 兜底保留
范围:`codex-gui/src/features/transcriptState`, `codex-gui/src/features/committedTranscriptSurface`

## 问题摘要

`codex-gui` 的 transcript `revision` 不是 Rust/protocol 层提供的版本号, 而是前端在
`transcriptState` 内部自造的缓存失效 token。它只有在以下不变量成立时才有价值:

> 任何会影响某个 transcript chunk view 渲染结果的写入, 都必须 bump 对应 entry revision,
> 并 bump 所属 chunk revision。

`areTranscriptChunkViewsEqual` 可以继续在 `id` / `revision` 之外比较 `role`、`source`、
`sourceKind`、`phase`、`status` 等渲染字段作为 defensive guard, 但正常 reducer 写路径不应依赖
这些字段级比较来发现变化。正常路径应该先通过 entry revision 或 chunk revision 变化完成失效。

## 背景

`selectTranscriptChunk` 的缓存设计使用:

- `TranscriptChunk` object identity 区分 snapshot rebuild 后的同 id / 同 revision chunk。
- `chunk.revision` 作为同一 chunk object 内部的 view 失效条件。

该设计目标是避免无关 Redux 更新时反复 materialize `entries`, 让 unchanged chunk 能返回稳定
`TranscriptChunkView` 引用。

## 当前判断

`areTranscriptChunkViewsEqual` 在 entry `id` 和 `revision` 相同的情况下, 继续比较部分渲染字段:

- message: `role`、`source`、`sourceKind`、`phase`
- status: `status`

这能补住异常情况下的 UI stale render, 但不应该成为正常更新链路的一部分: selector 仍应依赖
`chunk.revision`, render equality 的字段快照只作为防御兜底。

2026-06-29 只读复核没有发现当前 `transcriptState` 写路径存在严重 revision bump 漏洞:

- existing live committed entry update 会 bump entry revision 和所属 chunk revision。
- live append 会 bump chunk revision。
- snapshot rebuild 使用 fresh chunk object, 不会复用旧 WeakMap cache entry。

2026-06-30 补充测试确认了一般 live update 路径不会依赖字段级兜底:

- 同一 middle chunk entry id 的 live update 改变 `phase` 时, entry revision 会递增。
- 同一更新会 bump 所属 chunk revision。
- 因此正常 `selectTranscriptChunk` 缓存失效会先由 chunk revision 覆盖, 而不是靠
  `areTranscriptChunkViewsEqual` 在同 id / 同 revision 下比较 `phase`。

剩余问题不是必须删除字段级兜底, 而是未来新增 transcript entry 类型或渲染字段时, 要继续确认正常写
路径会 bump 对应 revision, 避免兜底变成主要 invalidation 机制。

## 建议方向

1. 保留 `revision`, 不直接删除。
2. 保留字段级 equality 兜底也可以接受, 但它只能是 defensive guard。
3. 对正常 live committed entry update, 继续用 focused tests 锁住 entry revision 和 chunk revision
   都递增的规则。
4. 未来新增 transcript entry 类型或渲染字段时, 同步确认 revision bump 规则; 如果某类 entry 没有真实
   写路径, 不需要强行补 reducer 测试。
