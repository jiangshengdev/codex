# Projection attach atomicity review

日期: 2026-05-19
状态: ✅ 已修复
范围: app-server projection attach、projection subscription、connection close cleanup 与 thread teardown 生命周期
优先级: 未定

## 摘要

本文记录的三个 projection attach atomicity finding 均已修复；当前实现通过 generation 条件提交、projection-only attach lease 和 delivery generation 校验收敛了原先的 teardown race。

## 问题

- Finding 1: projection attach 曾可能在 `finalize_thread_teardown` 清理 projection/thread state 后继续注册并返回成功，导致客户端拿到已 teardown thread 的成功 attach response。
- Finding 2: check-only attach 准备路径曾可能创建没有反向索引的 `ThreadStateManager` entry，connection close 无法通过 `thread_ids_by_connection` 找到并清理该 thread。
- Finding 3: projection event delivery 曾在 `ThreadProjectionManager` 锁外发送，`finalize_thread_teardown` 可先清空 head，随后旧 delivery 仍可能送达客户端。

## 证据

本记录比较当前分支与 `rust-v0.130.0` tag，聚焦当前分支新增的 `thread/projection/attach`、projection subscription、connection close cleanup 与 thread teardown 之间的异步生命周期风险。

`rust-v0.130.0` 的普通 thread subscription 路径在 `ThreadStateManager` 内部完成 `live_connections` 检查、`thread_ids_by_connection` 写入、thread entry `connection_ids` 写入和 `has_connections_watcher` 更新。这些操作发生在同一个 `ThreadStateManager` 锁保护下，语义是同 owner 的 check-and-insert，而不是先检查一个 manager，再 await 到另一个 manager 里注册。当前分支的 `ThreadStateManager::try_add_connection_to_thread` 仍保留该模式；修复前新增的 check-only attach 准备路径只做 live check 并返回 `ThreadState`，没有登记 connection/thread 关系。

Finding 1 的证据:

- 位置: `codex-rs/app-server/src/request_processors/thread_projection.rs:51`、`codex-rs/app-server/src/thread_projection_runtime.rs:67`、`codex-rs/app-server/src/thread_projection_runtime.rs:99`、`codex-rs/app-server/src/thread_projection_runtime.rs:110`、`codex-rs/app-server/src/thread_projection_runtime.rs:124`、`codex-rs/app-server/src/request_processors/thread_processor.rs:710`、`codex-rs/app-server/src/request_processors/thread_processor.rs:730`、`codex-rs/app-server/src/request_processors/thread_processor.rs:746`、`codex-rs/app-server/src/request_processors/thread_processor.rs:2243`。
- 修复前 projection attach 在 request processor 里先用 `thread_manager.get_thread` 和 `pending_thread_unloads` 做 check，然后把 `SendThreadProjectionAttachResponse` 排到 listener；listener 内再次检查 `pending_thread_unloads` 和 connection live 后，才调用 `ThreadProjectionManager::attach` 并发送 `ThreadProjectionAttachResponse`。
- 修复前如果 attach 已经拿到 snapshot，而另一个入口随后走 `finalize_thread_teardown` 清掉 projection/thread state，listener 内第二次 closing check 仍可通过；随后 `ThreadProjectionManager::attach` 会用 `thread_entry_mut(...).or_insert_with(...)` 重新建 projection entry，并向客户端返回一个已经 teardown 的 thread 的成功 attach response。
- 至少 `thread/archive` (`codex-rs/app-server/src/request_processors/thread_processor.rs:730`, `codex-rs/app-server/src/request_processors/thread_processor.rs:746`)、core 已不可见时的 `thread/unsubscribe` (`codex-rs/app-server/src/request_processors/thread_processor.rs:710`)、以及 core 已移除 thread 时的 `connection_closed` (`codex-rs/app-server/src/request_processors/thread_processor.rs:2243`) 都会进入 `finalize_thread_teardown`，且这三个入口都跳过 `pending_thread_unloads` guard。
- 与 `rust-v0.130.0` 的差异: 旧的普通 subscription 在 `ThreadStateManager` 同一锁内完成 live check 与 connection/thread 登记；当前分支新增的 projection attach 把 loaded/closing check、snapshot、projection attach 和 teardown cleanup 分散到多个 owner，且 `finalize_thread_teardown` 来源路径不参与 pending guard。

Finding 2 的证据:

- 原位置: `codex-rs/app-server/src/request_processors/thread_projection.rs:56`、`codex-rs/app-server/src/thread_state.rs:377`、`codex-rs/app-server/src/thread_state.rs:386`、`codex-rs/app-server/src/thread_projection_runtime.rs:86`。
- 修复前 `prepare_projection_attach` 调用 `try_thread_state_for_live_connection`，该 API 在确认 connection live 后执行 `state.threads.entry(thread_id).or_default()`，但不写 `thread_ids_by_connection`，也不写 `ThreadEntry.connection_ids`。
- 修复前 connection 在 `try_thread_state_for_live_connection` 返回后、listener command 完成前关闭时，`handle_projection_attach_response` 会因为 `is_live_connection` 为 false 直接跳过发送；但 `ThreadStateManager::remove_connection` 无法通过 `thread_ids_by_connection` 找到这个 thread。结果是 TSM 可能留下无 connection、无反向索引的孤立 entry，直到后续 thread unload/finalize 才收敛。
- 与 `rust-v0.130.0` 的差异: tag 上的 `try_ensure_connection_subscribed` 和 `try_add_connection_to_thread` 都在同一个 TSM 锁内把 live check 与 connection/thread 登记一起完成，connection close cleanup 能通过登记的 index 找到 thread；修复前的 check-only API 没有这个反向索引。

Finding 3 的证据:

- 位置: `codex-rs/app-server/src/outgoing_message.rs:150`、`codex-rs/app-server/src/thread_projection.rs:120`、`codex-rs/app-server/src/thread_projection.rs:129`、`codex-rs/app-server/src/thread_projection.rs:131`、`codex-rs/app-server/src/request_processors/thread_processor.rs:685`、`codex-rs/app-server/src/request_processors/thread_processor.rs:690`、`codex-rs/app-server/src/request_processors/thread_processor.rs:710`、`codex-rs/app-server/src/request_processors/thread_processor.rs:730`、`codex-rs/app-server/src/request_processors/thread_processor.rs:746`、`codex-rs/app-server/src/request_processors/thread_processor.rs:2243`。
- 修复前 typed thread notification fan-out 前新增 projection fan-out: `project_notification` 在 PM 锁内生成 commit、推进 `head_commit_id` 并 materialize `ProjectionDelivery`，随后释放 PM 锁；真正的 `send_server_notification_to_connections` 在锁外逐个 await。
- 修复前如果 delivery 已经 materialize 但还没入 outgoing queue，另一个入口先走 `finalize_thread_teardown` 并调用 `ThreadProjectionManager::remove_thread`，server 端该 thread 的 projection head 会被清空；随后旧 delivery 仍可发到客户端。客户端可能看到一个来自已 teardown subscription 的 commit，但之后重新 attach 时 server 端已经没有对应 head 可作为 reconnect/replay 基线。
- 至少 `thread/archive` (`codex-rs/app-server/src/request_processors/thread_processor.rs:730`, `codex-rs/app-server/src/request_processors/thread_processor.rs:746`)、core 已不可见时的 `thread/unsubscribe` (`codex-rs/app-server/src/request_processors/thread_processor.rs:710`)、以及 core 已移除 thread 时的 `connection_closed` (`codex-rs/app-server/src/request_processors/thread_processor.rs:2243`) 都会进入 `finalize_thread_teardown`，且这三个入口都跳过 `pending_thread_unloads` guard。
- 与 `rust-v0.130.0` 的差异: tag 上没有 projection commit chain，也没有在普通 notification fan-out 前维护独立 PM head 的状态；当前分支新增了 PM head 与 outgoing queue 之间的异步边界。

2026-07-09 当前代码补证:

- Attach 路径在 request processor 侧捕获当前 generation (`codex-rs/app-server/src/request_processors/thread_projection.rs:109`)，listener 侧先用 `capture_snapshot_cut_if_generation_matches` 校验 generation (`codex-rs/app-server/src/thread_projection_runtime.rs:90`)，最终注册前再调用 `attach_if_generation_matches` (`codex-rs/app-server/src/thread_projection_runtime.rs:153`)。
- `ThreadProjectionManager::attach_if_generation_matches` 在同一 manager 锁内比较 `thread_generations` 后才 attach (`codex-rs/app-server/src/thread_projection.rs:164`)；`remove_thread` 会先 bump generation，再移除 thread entry 和 connection index (`codex-rs/app-server/src/thread_projection.rs:210`)。
- Projection-only attach lease 仍在 attach 准备阶段登记 (`codex-rs/app-server/src/request_processors/thread_projection.rs:155`)，connection close 前后检查会释放 lease 或移除已注册 projection attach (`codex-rs/app-server/src/thread_projection_runtime.rs:123`, `codex-rs/app-server/src/thread_projection_runtime.rs:174`, `codex-rs/app-server/src/thread_projection_runtime.rs:248`)。
- Delivery 侧保留 generation 校验入口 `run_if_generation_matches` (`codex-rs/app-server/src/thread_projection.rs:150`)；回归测试 `projection_delivery_waiting_for_queue_capacity_is_dropped_after_thread_teardown` 覆盖 queue capacity 等待后 teardown 的 stale delivery 丢弃 (`codex-rs/app-server/src/thread_projection_runtime.rs:858`)。

## 判断

三个 finding 当前均为已修复状态。

Finding 1 已通过 attach 生命周期开始时捕获 `ProjectionGeneration`，并在最终注册 projection subscription 前通过 `ThreadProjectionManager::attach_if_generation_matches` 做条件提交修复；thread teardown 会通过 `ThreadProjectionManager::remove_thread` 使已捕获的 generation 失效，teardown 后继续完成的旧 attach work 不会再重新创建 projection entry 并返回成功。

Finding 2 已通过 projection-only attach lease 修复；`prepare_projection_attach` 不再调用 check-only `try_thread_state_for_live_connection`。connection close 会通过 projection 专用反向索引清理 lease，并且该 lease 不会进入 ordinary thread subscriber fanout。

Finding 3 已通过让 `ProjectionDelivery` 携带生成时的 `ProjectionGeneration` 修复；projection delivery 发送侧先等待 outgoing queue capacity，然后校验 generation，最后在没有额外 `await` 的情况下入队。teardown 如果先执行并 bump generation，旧 delivery 会在发送侧被丢弃。

## 修复记录

更新日期: 2026-05-26。

- Finding 1: 当前实现使用 `ProjectionGeneration` 和 `ThreadProjectionManager::attach_if_generation_matches` 阻止 stale attach 在 thread teardown 后重新创建 projection entry。后续 `6af70d99f Refactor app-server projection runtime test harness` 只收敛测试样板，不改变修复语义。
- Finding 2: projection attach 准备阶段现在通过 projection-only attach lease 登记 pending attach 状态；该状态使用独立反向索引，不写入 ordinary `thread_ids_by_connection` 或 `ThreadEntry.connection_ids`，并会在 attach 成功、失败、stale generation、snapshot error 和 connection close 路径显式释放。
- Finding 3: projection delivery 现在携带 materialize 时捕获的 `ProjectionGeneration`；发送侧在获得 outgoing queue capacity 后、真正入队前校验 generation。如果 teardown 已经通过 `ThreadProjectionManager::remove_thread` bump generation，旧 delivery 会被丢弃。

## 影响

修复前，对本机 app-server / GUI projection 场景，风险主要集中在 attach、走 `finalize_thread_teardown` 的 teardown、connection close 同时发生的边界:

- 成功 attach response 可能引用刚被 teardown 的 thread。
- `ThreadStateManager` 可能留下无 connection、无反向索引的孤立 entry。
- teardown 后仍可能送出已经 materialize 的旧 projection event。

如果未来把这套 app-server 投影机制用于长期运行、高并发、多租户服务器，小概率 race 会被流量放大，短暂残留也可能变成 fanout、资源、权限或计费问题。当前记录的三个具体 race 已修复；新的风险不应在本文内直接展开为 implementation plan。

## 后续处理

本文不保留旧 `建议方向` 作为当前 implementation plan。若后续发现新的 projection lifecycle 风险，需要单独进入设计/计划阶段，再决定是否创建新的 issue、设计文档或实施计划。

## 历史记录

原背景结论: `rust-v0.130.0` 已经存在 app-server 生命周期中的 best-effort guard + cleanup 模式，但普通 thread subscription 的核心路径使用了更强的同 owner / 同锁 check-and-insert。当前 projection subscription 修复前没有复用这个更强模式，而是跨 `ThreadStateManager`、`ThreadProjectionManager`、`pending_thread_unloads` 和 thread teardown 路径连续 await。`pending_thread_unloads` 能挡住 listener 自己发起的 idle unload，但挡不住任何走 `finalize_thread_teardown` 且不写入 pending set 的 teardown。

旧建议方向曾建议让 thread teardown 与 projection attach 共享同一个 lifecycle gate，或在 `ThreadProjectionManager::attach` 前后用同一个 owner 重新验证 thread 仍 loaded 且未 teardown；也曾建议不要让 projection attach 的准备阶段创建长期 TSM 状态，要么延迟创建 `ThreadState` 到真正 attach 成功时，要么创建时也登记可被 close cleanup 回收的占用关系；还曾建议把 teardown 与 projection fan-out 做成同一 owner 下的状态转换，或在发送前为 materialized delivery 保留可验证的 generation/subscription epoch，让客户端和服务端能识别 teardown 前后的旧事件。

旧的整体建议方向曾是把 projection subscription 与 connection/thread lifecycle 收回同一个状态 owner，提供类似 `rust-v0.130.0` 普通 thread subscription 的 API:

- 在同一个锁内完成 `connection live`、`thread loaded/not closing` 检查与 projection attach。
- 或让 `ThreadStateManager` 成为 connection -> projection subscription 的唯一 lifecycle owner。
- 或让 `ThreadProjectionManager::attach` 接收一个同 owner 的 live/thread capability，在单个临界区里执行 conditional attach。

旧文档还记录过如果暂时保留 best-effort 模式，至少应把测试和注释明确写成:

- attach 路径的 not-live re-check 与 close 路径 cleanup 之间的安全性，依赖 `message_processor::connection_closed` 中先调 `thread_processor.connection_closed`，再调 `thread_projection_manager().remove_connection` 的固定顺序 (`codex-rs/app-server/src/message_processor.rs:672-689`)。这只是注释保证，未来若有人调换顺序会引入 race。
- 当前实现依赖 `ThreadProjectionManager::remove_connection` 作为 connection close 的最终 cleanup。
- 当前实现不保证 attach、projection event fan-out 与走 `finalize_thread_teardown` 的 teardown 严格线性化。
