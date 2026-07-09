# P2 · thread_generations 永不回收，长期运行内存单调增长

日期: 2026-05-30
状态: 🔴 未修复
范围: 批次 2(核心状态)
优先级: P2

## 摘要

`thread_generations` 仍无回收路径，长期内存上界随 distinct `ThreadId` 数量线性增长。

## 问题

`ThreadProjectionManagerInner::thread_generations: HashMap<ThreadId, ProjectionGeneration>` 只增不减。被 projection 捕获 generation 或 materialize projection entry 的线程，即使实体已删除，generation 记录也会继续保留。

该记录不能简单在 `remove_thread` 中删除，因为 stale-generation attach 防护依赖 entry 删除后的 generation bump。

## 证据

- 2026-07-04 只读性能检测核对：仍成立。
- 字段位置：`codex-rs/app-server/src/thread_projection.rs:67`。
- 插入/更新路径：`codex-rs/app-server/src/thread_projection.rs:339-359`。
- 已 grep 验证：全仓库无任何 `remove` / `clear` / `retain` 触及该 map。
- 对比：`threads`、`connection_index` 都在 `remove_thread` / `remove_connection` / `invalidate_thread_projection` 中清理。
- `remove_thread`(`172-181`) 会故意调用 `bump_generation_if_known` 再删除 entry，用于让 in-flight attach 检测 stale generation。
- 本次核对未运行测试、benchmark 或修复实现。

## 判断

仍需处理。当前问题不是单点清理缺失，而是需要设计 generation retention 的安全窗口和回收触发点，避免破坏 stale-generation attach 防护。

## 影响

每个曾被投影或移除过的 thread 会在 map 中永久留下 `(ThreadId, u64)`。单条开销不大，但长生命周期 app-server 进程会随会话数线性累积，形成真实的慢速内存泄漏。

## 后续处理

进入单独设计/计划阶段，先定义 generation retention 的安全窗口、回收触发点和 stale attach 防护不变量，再决定实现范围和验证方式。
