# Projection attach atomicity review

## 背景

本记录比较当前分支与 `rust-v0.130.0` tag，聚焦当前分支新增的
`thread/projection/attach`、projection subscription、connection close cleanup 与 thread
unload 之间的异步生命周期风险。

结论：`rust-v0.130.0` 已经存在 app-server 生命周期中的 best-effort guard + cleanup
模式，但普通 thread subscription 的核心路径使用了更强的同 owner / 同锁
check-and-insert。当前 projection subscription 没有复用这个更强模式，而是跨
`ThreadStateManager`、`ThreadProjectionManager`、`pending_thread_unloads` 连续 await
并依赖后续 cleanup 收敛。

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

### 1. Projection attach 跨 manager 注册，无法提供原子 live-check + attach

当前 `handle_projection_attach_response` 的关键流程是：

1. 检查 thread 是否 closing。
2. `await` snapshot。
3. 通过 `ThreadStateManager::is_live_connection` 检查 connection 是否 live。
4. 再次检查 thread 是否 closing。
5. 通过 `ThreadProjectionManager::attach` 注册 projection subscription。
6. 再次检查 connection 是否 live，必要时 detach cleanup。
7. 发送 `ThreadProjectionAttachResponse`。

这里的 connection live 状态由 `ThreadStateManager` 管理，projection subscription
状态由 `ThreadProjectionManager` 管理。live check 和 attach 不在同一个锁、同一个
状态 owner、或同一个不可中断临界区内完成，因此只能提供 best-effort 语义。

极端 interleaving 下可能出现短暂残留：

1. attach 前检查 connection 仍 live。
2. `ThreadProjectionManager::attach` 注册 subscription。
3. 连接在 attach 后、response 前关闭。
4. projection subscription 短暂存在。
5. 后续 connection closed cleanup 调用 `ThreadProjectionManager::remove_connection`
   收敛状态。

这类残留通常会被 cleanup 清掉，但它不是 `rust-v0.130.0` 普通 subscription 那种
同锁 check-and-insert 的强保证。

### 2. `prepare_projection_attach` 引入 check-only API，扩大 TOCTOU 窗口

`prepare_projection_attach` 先调用 `ThreadStateManager::try_thread_state_for_live_connection`
确认 connection live 并拿到 `ThreadState`。这个 API 不登记普通 thread subscription，
也不把后续 projection attach 纳入同一个 manager 的锁保护。

后续实际 projection subscription 是通过 listener command 排队，再在
`handle_projection_attach_response` 中调用 `ThreadProjectionManager::attach` 完成。
从 live check 到实际 attach 之间经过：

- listener task 确保/启动。
- snapshot future 构造。
- command enqueue。
- listener command 执行。
- snapshot await。
- 再次检查与 attach。

这些步骤中间都可能与 connection close 或 thread unload interleave。当前代码补了
多次 guard，但没有恢复 `rust-v0.130.0` 普通 subscription 的原子边界。

### 3. Projection manager 会为无 subscriber 的事件创建 entry

`ThreadScopedOutgoingMessageSender::send_server_notification` 会先调用
`ThreadProjectionManager::project_notification`。`project_notification` 对 whitelisted
notification 会调用 `thread_entry_mut`，即使当前没有 projection subscriber，也会创建
thread entry 并推进 head commit。

这不是跨锁 TOCTOU 问题，但它是当前分支新增的资源保留面：没有 projection subscriber
的 thread 也可能在 projection manager 里留下 entry，直到 thread unload 或
finalize cleanup 调用 `ThreadProjectionManager::remove_thread`。

## 风险判断

对本机 app-server / GUI projection 场景，这通常是可接受的工程折中：

- 连接数量有限。
- 进程生命周期通常较短。
- 残留 subscription 大多会被 connection closed cleanup 或 thread unload cleanup 收敛。
- 风险主要是短暂状态不一致或临时多占资源，而不是数据破坏。

如果未来把这套 app-server 投影机制用于长期运行、高并发、多租户服务器，则当前模式不够强。
小概率 race 会被流量放大，短暂残留也可能变成 fanout、资源、权限或计费问题。

## 建议方向

如果要提高保证，优先考虑把 projection subscription 与 connection live 状态收回同一个
状态 owner，提供类似 `rust-v0.130.0` 普通 thread subscription 的 API：

- 在同一个锁内完成 `connection live` 检查与 projection attach。
- 或让 `ThreadStateManager` 成为 connection -> projection subscription 的唯一
  lifecycle owner。
- 或让 `ThreadProjectionManager::attach` 接收一个同 owner 的 live-check capability，
  在单个临界区里执行 conditional attach。

如果暂时保留当前 best-effort 模式，建议至少把测试和注释明确写成：

- 当前实现依赖 `thread_processor.connection_closed` 先标记 connection closed。
- 当前实现依赖 `ThreadProjectionManager::remove_connection` 作为最终 cleanup。
- 当前实现不保证 attach 与 connection close 严格线性化。
