# P2 · thread_generations 永不回收，长期运行内存单调增长

日期: 2026-05-30
状态: 🔴 未修复
范围: 批次 2(核心状态)
优先级: P2

## 摘要

`thread_generations` 仍没有删除、清空或容量回收路径；当前边界是未知 thread 不会创建 generation，但已捕获 generation 或已有 projection entry 的 thread 在 `remove_thread` / `invalidate_thread_projection` 后会保留 bumped generation。

## 问题

`ThreadProjectionManagerInner::thread_generations: HashMap<ThreadId, ProjectionGeneration>` 只在未知 thread 上避免创建记录；一旦通过 generation capture、structural/delta projection 或已有 entry 进入 generation map，当前代码没有删除该 key 的路径。

该记录不能简单在 `remove_thread` 中删除，因为 stale-generation attach / snapshot-cut 防护依赖 entry 删除后的 generation bump。`invalidate_thread_projection` 也会先 bump generation，再清空 head 和 subscribers，因此保留 generation 是当前语义的一部分。

## 证据

- 2026-07-09 只读复核：仍成立，但风险边界收窄为“已捕获或已 materialize 的 thread generation 被保留”，不是任意未知 `ThreadId` 都会创建记录。
- 字段位置：`codex-rs/app-server/src/thread_projection.rs:102-107`。
- `capture_current_generation` 进入 `capture_generation`，`capture_generation` 在缺失时写入 `thread_generations.entry(thread_id).or_insert(...)`：`codex-rs/app-server/src/thread_projection.rs:134-139`、`codex-rs/app-server/src/thread_projection.rs:380-387`。
- structural/delta projection 会 capture 当前 generation 并 materialize entry：`codex-rs/app-server/src/thread_projection.rs:243-250`、`codex-rs/app-server/src/thread_projection.rs:272-279`。
- `remove_thread` 先调用 `bump_generation_if_known`，再删除 `threads` entry 和 connection index；没有删除 `thread_generations`：`codex-rs/app-server/src/thread_projection.rs:210-219`。
- `bump_generation_if_known` 对已知 generation 或已有 entry 的 thread 写入 next generation；对完全未知 thread 返回：`codex-rs/app-server/src/thread_projection.rs:390-400`。
- `invalidate_thread_projection` 对完全未知 thread 返回；否则 bump generation，清空 head/subscribers 并移除 connection index，但不删除 `thread_generations`：`codex-rs/app-server/src/thread_projection.rs:403-440`。
- grep 复核只看到 `thread_generations.insert` / `entry` / `contains_key` / `get`，没有 `thread_generations.remove` / `clear` / `retain`。
- 测试覆盖了当前语义：未知 `remove_thread` 不创建 generation，未知 `invalidate_thread_projection` 不创建 generation，已有 entry remove 后会保留 generation 用于阻止默认 generation reattach：`codex-rs/app-server/src/thread_projection.rs:938-952`、`codex-rs/app-server/src/thread_projection.rs:1046-1054`、`codex-rs/app-server/src/thread_projection.rs:1091-1107`。

## 判断

仍需处理。旧的“永不回收”判断对已知 thread generation 仍成立；但文档应区分完全未知 thread 的 no-op 语义、captured generation 的 retained generation 语义，以及 `remove_thread` / `invalidate_thread_projection` 中为 stale attach 防护保留 bumped generation 的当前行为。

## 影响

每个曾被捕获 generation、投影或拥有 projection entry 的 thread 可能在 map 中永久留下 `(ThreadId, u64)`。单条开销不大，但长生命周期 app-server 进程会随这类 thread 数量线性累积，形成真实的慢速内存泄漏；完全未知且未捕获/未 materialize 的 thread 不在当前风险范围内。

## 后续处理

进入单独设计/计划阶段，先定义 generation retention 的安全窗口、回收触发点和 stale attach 防护不变量，再决定实现范围和验证方式。

## 验证记录

- 2026-07-09：只读复核上述代码路径；未运行测试、benchmark 或修复实现。
- 2026-07-04：只读性能检测核对为仍成立；当时记录为全仓库无任何 `remove` / `clear` / `retain` 触及该 map。
