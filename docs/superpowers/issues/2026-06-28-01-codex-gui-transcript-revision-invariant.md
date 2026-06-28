# codex-gui transcript revision invariant issue

## 问题摘要

`codex-gui` 的 transcript `revision` 不是 Rust/protocol 层提供的版本号, 而是前端在
`transcriptState` 内部自造的缓存失效 token。它只有在以下不变量成立时才有价值:

> 任何会影响某个 transcript chunk view 渲染结果的写入, 都必须 bump 对应 entry revision,
> 并 bump 所属 chunk revision。

如果 equality 逻辑在 `id` / `revision` 之外继续比较 `role`、`source`、`sourceKind`、
`phase`、`status` 等渲染字段, 等于承认 `revision` 不能单独表达渲染等价性。这会让
`revision` 从缓存失效边界退化成辅助字段, 并误导后续维护者。

## 背景

`selectTranscriptChunk` 的缓存设计使用:

- `TranscriptChunk` object identity 区分 snapshot rebuild 后的同 id / 同 revision chunk。
- `chunk.revision` 作为同一 chunk object 内部的 view 失效条件。

该设计目标是避免无关 Redux 更新时反复 materialize `entries`, 让 unchanged chunk 能返回稳定
`TranscriptChunkView` 引用。

因此 `revision` 的语义不应只是 display hint, 而应是前端内部 render/cache invalidation
contract。

## 当前矛盾

今天的 equality 改动让 `areTranscriptChunkViewsEqual` 在 entry `id` 和 `revision` 相同的情况下,
继续比较部分渲染字段:

- message: `role`、`source`、`sourceKind`、`phase`
- status: `status`

这能补住某些 UI stale render, 但同时暴露出更底层的问题:

- 如果这些字段会影响渲染, 它们变化时本应 bump entry revision。
- 如果 entry revision 没有 bump, 所属 chunk revision 也不可靠。
- 如果 equality 必须常态化补比这些字段, entry revision 的存在价值会明显下降。

换句话说, 字段级 equality 是症状修补, 不是对 `revision` 设计的强化。

## 影响

- 维护者会误以为 `revision` 是可靠的渲染版本边界, 但 equality 又在绕过它补比字段。
- cache invalidation 规则变得分裂: selector 依赖 `chunk.revision`, render equality 又依赖字段快照。
- 后续新增 transcript entry 字段时, 很容易忘记同时更新 equality 和 revision bump 规则。
- 如果 `revision` 语义不能重新收束, 它会变成多余甚至危险的状态字段。

## 推荐方向

选择继续使用 `revision`, 不直接删除。

原因是 `revision` 对 `selectTranscriptChunk` 的 WeakMap 缓存仍有明确价值: 它可以让 unchanged
chunk 在无关 store 更新后直接复用旧 view, 避免重新 materialize `entries`。

但需要把设计重新收紧:

1. 删除字段级 equality 补丁, 让 `areTranscriptChunkViewsEqual` 回到依赖 entry `id` /
   `revision` 的语义。
2. 明确 `entry revision` 覆盖所有会影响 entry 渲染的字段。
3. 明确任何 existing entry update 必须 bump entry revision, 并 bump 所属 chunk revision。
4. 用测试覆盖 `phase`、`source`、`status` 等渲染字段变化时 revision 会递增。

## 后续验证点

- 检查 snapshot rebuild 和 live `itemCompleted` 两条写路径是否都满足 revision invariant。
- 确认不会存在绕过 `upsertLiveCommittedEntry` 直接改写 `entriesById` 的路径。
- 如果未来新增 transcript entry 类型或渲染字段, 必须同步确认 revision bump 规则。
- 如果无法保证这个 invariant, 再回到设计层讨论删除 `revision` 并重做缓存失效机制。
