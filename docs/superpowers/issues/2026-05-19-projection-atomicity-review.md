# Projection attach atomicity review

## 状态

更新日期：2026-05-25。

- Finding 1：已修复。当前实现使用 `ProjectionGeneration` 和
  `ThreadProjectionManager::attach_if_generation_matches` 阻止 stale attach 在 thread teardown 后
  重新创建 projection entry。后续 `6af70d99f Refactor app-server projection runtime test harness`
  只收敛测试样板，不改变修复语义。
- Finding 2：仍开放。`prepare_projection_attach` 仍通过
  `try_thread_state_for_live_connection` 获取/创建 `ThreadState`，该路径仍不写
  `thread_ids_by_connection` 或 `ThreadEntry.connection_ids`。
- Finding 3：仍开放。projection delivery 仍在普通 thread notification 前串行入队，teardown 与
  已 materialized delivery 之间仍没有同 owner 的线性化。

## 背景

本记录比较当前分支与 `rust-v0.130.0` tag，聚焦当前分支新增的
`thread/projection/attach`、projection subscription、connection close cleanup 与 thread
teardown 之间的异步生命周期风险。

结论：`rust-v0.130.0` 已经存在 app-server 生命周期中的 best-effort guard + cleanup
模式，但普通 thread subscription 的核心路径使用了更强的同 owner / 同锁
check-and-insert。当前 projection subscription 没有复用这个更强模式，而是跨
`ThreadStateManager`、`ThreadProjectionManager`、`pending_thread_unloads` 和
thread teardown 路径连续 await。`pending_thread_unloads` 能挡住 listener 自己发起的
idle unload，但挡不住任何走 `finalize_thread_teardown` 且不写入 pending set 的 teardown。

## `rust-v0.130.0` 中的更好模式

`rust-v0.130.0` 的普通 thread subscription 路径在 `ThreadStateManager` 内部完成：

- 检查 `live_connections` 是否包含 connection。
- 写入 `thread_ids_by_connection`。
- 写入 thread entry 的 `connection_ids`。
- 更新 `has_connections_watcher`。

这些操作发生在同一个 `ThreadStateManager` 锁保护下。也就是说，普通 thread
subscription 的关键语义是同 owner 的 check-and-insert，而不是先检查一个 manager，
再 await 到另一个 manager 里注册。

当前分支的 `ThreadStateManager::try_add_connection_to_thread` 仍然保留了这个模式。
新增的 `ThreadStateManager::try_thread_state_for_live_connection` 则只做 live check
并返回 `ThreadState`，没有登记 connection/thread 关系。

## Findings

### 1. Projection attach 可以在 finalize teardown 后注册并返回成功

状态：已修复。当前实现已经改为在 attach 生命周期开始时捕获
`ProjectionGeneration`，并在最终注册 projection subscription 前通过
`ThreadProjectionManager::attach_if_generation_matches` 做条件提交；thread teardown 会通过
`ThreadProjectionManager::remove_thread` 使已捕获的 generation 失效。因此 teardown 后继续完成的
旧 attach work 不会再重新创建 projection entry 并返回成功。

位置：`codex-rs/app-server/src/request_processors/thread_projection.rs:51`、
`codex-rs/app-server/src/thread_projection_runtime.rs:67`、
`codex-rs/app-server/src/thread_projection_runtime.rs:99`、
`codex-rs/app-server/src/thread_projection_runtime.rs:110`、
`codex-rs/app-server/src/thread_projection_runtime.rs:124`、
`codex-rs/app-server/src/request_processors/thread_processor.rs:710`、
`codex-rs/app-server/src/request_processors/thread_processor.rs:730`、
`codex-rs/app-server/src/request_processors/thread_processor.rs:746`、
`codex-rs/app-server/src/request_processors/thread_processor.rs:2243`。

当前分支引入的具体改动：projection attach 在 request processor 里先用
`thread_manager.get_thread` 和 `pending_thread_unloads` 做 check，然后把
`SendThreadProjectionAttachResponse` 排到 listener；listener 内再次检查
`pending_thread_unloads` 和 connection live 后，才调用 `ThreadProjectionManager::attach`
并发送 `ThreadProjectionAttachResponse`。

可观察坏结果：如果 attach 已经拿到 snapshot，而另一个入口随后走
`finalize_thread_teardown` 清掉 projection/thread state，listener 内第二次 closing check 仍可
通过；随后 `ThreadProjectionManager::attach` 会用
`thread_entry_mut(...).or_insert_with(...)` 重新建 projection entry，并向客户端返回一个已经
teardown 的 thread 的成功 attach response。至少 `thread/archive`
(`codex-rs/app-server/src/request_processors/thread_processor.rs:730`,
`codex-rs/app-server/src/request_processors/thread_processor.rs:746`)、core 已不可见时的
`thread/unsubscribe` (`codex-rs/app-server/src/request_processors/thread_processor.rs:710`)、
以及 core 已移除 thread 时的 `connection_closed`
(`codex-rs/app-server/src/request_processors/thread_processor.rs:2243`) 都会进入
`finalize_thread_teardown`，且这三个入口都跳过 `pending_thread_unloads` guard。

与 `rust-v0.130.0` 的差异：旧的普通 subscription 在 `ThreadStateManager` 同一锁内完成
live check 与 connection/thread 登记；当前分支新增的 projection attach 把 loaded/closing
check、snapshot、projection attach 和 teardown cleanup 分散到多个 owner，且
`finalize_thread_teardown` 来源路径不参与 pending guard。

建议方向：让 thread teardown 与 projection attach 共享同一个 lifecycle gate，或在
`ThreadProjectionManager::attach` 前后用同一个 owner 重新验证 thread 仍 loaded 且未
teardown。

### 2. check-only attach 准备路径会留下没有反向索引的 TSM entry

状态：仍开放。当前实现仍在 `prepare_projection_attach` 中调用
`ThreadStateManager::try_thread_state_for_live_connection`；该 API 只检查
`live_connections`，随后返回 `state.threads.entry(thread_id).or_default().state.clone()`，
没有登记 connection -> thread 的反向索引。

位置：`codex-rs/app-server/src/request_processors/thread_projection.rs:56`、
`codex-rs/app-server/src/thread_state.rs:377`、
`codex-rs/app-server/src/thread_state.rs:386`、
`codex-rs/app-server/src/thread_projection_runtime.rs:86`。

当前分支引入的具体改动：`prepare_projection_attach` 调用
`try_thread_state_for_live_connection`，该 API 在确认 connection live 后执行
`state.threads.entry(thread_id).or_default()`，但不写
`thread_ids_by_connection`，也不写 `ThreadEntry.connection_ids`。

可观察坏结果：connection 在 `try_thread_state_for_live_connection` 返回后、listener command
完成前关闭时，`handle_projection_attach_response` 会因为 `is_live_connection` 为 false
直接跳过发送；但 `ThreadStateManager::remove_connection` 无法通过
`thread_ids_by_connection` 找到这个 thread。结果是 TSM 可能留下无 connection、无反向索引的
孤立 entry，直到后续 thread unload/finalize 才收敛。

与 `rust-v0.130.0` 的差异：tag 上的 `try_ensure_connection_subscribed` 和
`try_add_connection_to_thread` 都在同一个 TSM 锁内把 live check 与 connection/thread 登记
一起完成，connection close cleanup 能通过登记的 index 找到 thread；当前分支新增的
check-only API 没有这个反向索引。

建议方向：不要让 projection attach 的准备阶段创建长期 TSM 状态；要么延迟创建
`ThreadState` 到真正 attach 成功时，要么创建时也登记可被 close cleanup 回收的占用关系。

### 3. Projection event delivery 在 PM 锁外发送，finalize teardown 可先清空 head

状态：仍开放。当前 `ThreadScopedOutgoingMessageSender::send_server_notification` 仍先 await
projection delivery 入队，再发送普通 thread notification；`c810a3dc7` 的 snapshot/head cut 修复
没有改变这条 delivery/teardown 边界。

位置：`codex-rs/app-server/src/outgoing_message.rs:150`、
`codex-rs/app-server/src/thread_projection.rs:120`、
`codex-rs/app-server/src/thread_projection.rs:129`、
`codex-rs/app-server/src/thread_projection.rs:131`、
`codex-rs/app-server/src/request_processors/thread_processor.rs:685`、
`codex-rs/app-server/src/request_processors/thread_processor.rs:690`、
`codex-rs/app-server/src/request_processors/thread_processor.rs:710`、
`codex-rs/app-server/src/request_processors/thread_processor.rs:730`、
`codex-rs/app-server/src/request_processors/thread_processor.rs:746`、
`codex-rs/app-server/src/request_processors/thread_processor.rs:2243`。

当前分支引入的具体改动：typed thread notification fan-out 前新增 projection fan-out：
`project_notification` 在 PM 锁内生成 commit、推进 `head_commit_id` 并 materialize
`ProjectionDelivery`，随后释放 PM 锁；真正的
`send_server_notification_to_connections` 在锁外逐个 await。

可观察坏结果：如果 delivery 已经 materialize 但还没入 outgoing queue，另一个入口先走
`finalize_thread_teardown` 并调用 `ThreadProjectionManager::remove_thread`，server 端该 thread
的 projection head 会被清空；随后旧 delivery 仍可发到客户端。客户端可能看到一个来自已
teardown subscription 的 commit，但之后重新 attach 时 server 端已经没有对应 head 可作为
reconnect/replay 基线。至少 `thread/archive`
(`codex-rs/app-server/src/request_processors/thread_processor.rs:730`,
`codex-rs/app-server/src/request_processors/thread_processor.rs:746`)、core 已不可见时的
`thread/unsubscribe` (`codex-rs/app-server/src/request_processors/thread_processor.rs:710`)、
以及 core 已移除 thread 时的 `connection_closed`
(`codex-rs/app-server/src/request_processors/thread_processor.rs:2243`) 都会进入
`finalize_thread_teardown`，且这三个入口都跳过 `pending_thread_unloads` guard。

与 `rust-v0.130.0` 的差异：tag 上没有 projection commit chain，也没有在普通 notification
fan-out 前维护独立 PM head 的状态；当前分支新增了 PM head 与 outgoing queue 之间的异步边界。

建议方向：把 teardown 与 projection fan-out 做成同一 owner 下的状态转换，或在发送前为
materialized delivery 保留可验证的 generation/subscription epoch，让客户端和服务端能识别
teardown 前后的旧事件。

## 风险判断

对本机 app-server / GUI projection 场景，风险主要集中在 attach、走
`finalize_thread_teardown` 的 teardown、connection close 同时发生的边界：

- 成功 attach response 可能引用刚被 teardown 的 thread。
- `ThreadStateManager` 可能留下无 connection、无反向索引的孤立 entry。
- teardown 后仍可能送出已经 materialize 的旧 projection event。

如果未来把这套 app-server 投影机制用于长期运行、高并发、多租户服务器，则当前模式不够强。
小概率 race 会被流量放大，短暂残留也可能变成 fanout、资源、权限或计费问题。

## 建议方向

如果要提高保证，优先考虑把 projection subscription 与 connection/thread lifecycle 收回同一个
状态 owner，提供类似 `rust-v0.130.0` 普通 thread subscription 的 API：

- 在同一个锁内完成 `connection live`、`thread loaded/not closing` 检查与 projection attach。
- 或让 `ThreadStateManager` 成为 connection -> projection subscription 的唯一 lifecycle owner。
- 或让 `ThreadProjectionManager::attach` 接收一个同 owner 的 live/thread capability，在单个
  临界区里执行 conditional attach。

如果暂时保留当前 best-effort 模式，建议至少把测试和注释明确写成：

- 当前 attach 路径的 not-live re-check 与 close 路径 cleanup 之间的安全性，依赖
  `message_processor::connection_closed` 中先调 `thread_processor.connection_closed`，再调
  `thread_projection_manager().remove_connection` 的固定顺序
  (`codex-rs/app-server/src/message_processor.rs:672-689`)。这只是注释保证，未来若有人调换
  顺序会引入 race。
- 当前实现依赖 `ThreadProjectionManager::remove_connection` 作为 connection close 的最终
  cleanup。
- 当前实现不保证 attach、projection event fan-out 与走 `finalize_thread_teardown` 的 teardown
  严格线性化。
