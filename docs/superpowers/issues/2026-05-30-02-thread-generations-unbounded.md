# P2 · thread_generations 永不回收,长期运行内存单调增长

日期:2026-05-30
范围:批次 2(核心状态)
优先级:中高(资源泄漏,长期累积)

## 问题

`ThreadProjectionManagerInner::thread_generations: HashMap<ThreadId, ProjectionGeneration>`
只增不减。全仓库无任何 `remove` / `clear` / `retain` 触及该 map(已 grep 验证)。

- 位置:`codex-rs/app-server/src/thread_projection.rs:67`(字段),`339-359`(只插入/更新)
- 对比:`threads`、`connection_index` 都在 `remove_thread` / `remove_connection` /
  `invalidate_thread_projection` 中清理;唯独 `thread_generations` 没有。
- `remove_thread`(`172-181`)反而**故意**调 `bump_generation_if_known` 先写一笔再删 entry —
  这是为了让 in-flight attach 检测到 stale generation(语义正确),但副作用是即使线程实体已删除,
  `thread_generations` 仍永久保留一条记录。

## 为何是风险

每个曾被投影/移除过的 thread 在该 map 里留一条 `(ThreadId, u64)` 永不释放。
长生命周期的 app-server 进程(常驻服务)随会话数线性累积,无上界。
`ThreadId` 是 UUID,单条开销不大,但永不回收意味着这是一个真实的慢速内存泄漏。

注意:把记录留到 entry 删除之后是有意为之(stale-generation 检测依赖它),所以不能简单地在
`remove_thread` 里删 generation。这正是它难处理的原因 —— 需要一个独立的回收时机/策略,而当前完全没有。
