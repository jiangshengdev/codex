# Projection Attach Lease Design

## 背景

`thread/projection/attach` 的准备阶段需要拿到 `ThreadState`，以便启动或复用 thread listener，
再把 `SendThreadProjectionAttachResponse` 排进 listener command queue。当前实现通过
`ThreadStateManager::try_thread_state_for_live_connection(...)` 完成这个动作。

这个 API 只检查 connection 是否 live，然后执行 `state.threads.entry(thread_id).or_default()` 并返回
`ThreadState`。它不会写入 ordinary thread subscription 的反向索引，也不会写入
`ThreadEntry.connection_ids`。因此如果 connection 在 attach 准备完成后、listener command 完成前关闭，
`ThreadStateManager::remove_connection(...)` 无法通过反向索引找到这个 thread。结果是 attach 准备阶段
创建的 TSM entry 可能变成没有 connection、没有反向索引的孤立 entry，只能等后续 thread unload 或
teardown 才收敛。

不能直接把 projection attach 准备路径改成 `try_add_connection_to_thread(...)`。该 API 写入的是 ordinary
thread subscription 状态：`thread_ids_by_connection`、`ThreadEntry.connection_ids` 和
`has_connections_watcher`。如果 projection-only connection 走这条路径，后续
`subscribed_connection_ids(...)` 会把它当成普通 thread subscriber，普通 thread notification fanout
会被污染。

本设计只解决 `docs/superpowers/issues/2026-05-19-projection-atomicity-review.md` 中的 Finding 2。

## 已确认选择

- 不改 `thread_ids_by_connection` 的上游语义；它继续只表示 ordinary thread subscription 的反向索引。
- 新增 projection 专用反向索引，例如 `projection_attach_thread_ids_by_connection`。
- 在 `ThreadEntry` 中新增 `projection_attach_leases: HashSet<ConnectionId>`。
- lease 释放采用显式 async release；所有 attach response 退出分支都必须释放。
- `ThreadStateManager::remove_connection(...)` 继续返回 `Vec<ThreadId>`，但实现中会把 ordinary cleanup
  和 projection attach lease cleanup 触达的 thread 去重后返回给上层 reconciliation。
- 测试采用单元测试加 request/runtime 级 race 回归测试。

## 目标

- projection attach 准备阶段创建的 TSM entry 必须能被 connection close cleanup 找到。
- projection attach pending 状态不得进入 ordinary subscription 集合。
- projection-only connection 不得出现在 `subscribed_connection_ids(...)` 返回值中。
- projection attach pending 状态不得触发 ordinary `has_connections_watcher`。
- attach 成功、失败、stale generation、snapshot error、connection closed 等路径都必须释放 lease。
- 保持 projection protocol schema 不变。
- 保持 `ThreadProjectionManager` 的 generation gate 不变。
- 保持 ordinary thread subscription lifecycle 的上游语义不变。

## 非目标

- 不解决 projection event delivery 在普通 thread notification 前串行 await 的 backpressure 问题。
- 不解决 materialized projection delivery 与 `finalize_thread_teardown(...)` 之间的 head/replay 线性化问题。
- 不把 projection subscription 改为由 `ThreadStateManager` 长期拥有。
- 不改 `thread/projection/attach`、`thread/projection/detach` 或 `thread/projection/event` 的 wire shape。
- 不重构 listener command queue。
- 不重命名或扩展 `thread_ids_by_connection` 的语义。

## 设计

### Projection attach lease

新增 projection-only lease，表示某个 live connection 已经进入 `thread/projection/attach` 准备阶段，但
listener 还没有完成 attach response work。lease 是短期状态，只覆盖 request processor 准备完成到
listener attach response work 结束之间的窗口。

lease 不是 ordinary thread subscription：

- 不进入 `ThreadEntry.connection_ids`。
- 不进入 `thread_ids_by_connection`。
- 不影响 `has_connections_watcher`。
- 不影响 `subscribed_connection_ids(...)`。
- 不代表客户端已经成功订阅 projection event。

长期 projection subscription 仍由 `ThreadProjectionManager` 的 subscriber map 管理。

### ThreadStateManager state

`ThreadEntry` 新增正向集合：

```rust
projection_attach_leases: HashSet<ConnectionId>
```

`ThreadStateManagerInner` 新增 projection 专用反向索引：

```rust
projection_attach_thread_ids_by_connection: HashMap<ConnectionId, HashSet<ThreadId>>
```

这两个字段只服务 projection attach pending cleanup。它们不参与 ordinary subscription fanout，不作为
ordinary connection state 的事实来源。

### Begin attach lease API

新增 API 替代 projection attach path 上的 `try_thread_state_for_live_connection(...)`：

```rust
pub(crate) async fn try_begin_projection_attach(
    &self,
    thread_id: ThreadId,
    connection_id: ConnectionId,
) -> Option<Arc<Mutex<ThreadState>>>
```

语义：

- 在同一个 `ThreadStateManager` 锁内检查 `live_connections`。
- connection 不 live 时返回 `None`，不创建 `ThreadEntry`。
- connection live 时创建或复用 `ThreadEntry`。
- 写入 `ThreadEntry.projection_attach_leases`。
- 写入 `projection_attach_thread_ids_by_connection`。
- 返回 `ThreadEntry.state.clone()`。

这个 API 不写 `thread_ids_by_connection`，不写 `connection_ids`，不调用 `update_has_connections()`。

### Release attach lease API

新增幂等 release API：

```rust
pub(crate) async fn release_projection_attach_lease(
    &self,
    thread_id: ThreadId,
    connection_id: ConnectionId,
)
```

语义：

- 从 `ThreadEntry.projection_attach_leases` 移除 `connection_id`。
- 从 `projection_attach_thread_ids_by_connection[connection_id]` 移除 `thread_id`。
- 如果对应 set 为空，删除该 map entry。
- 对已经释放、thread 已移除、connection 已关闭的情况保持幂等。
- 不修改 `ThreadEntry.connection_ids`。
- 不调用 `update_has_connections()`。

lease release 只表示 pending attach window 结束；不影响 `ThreadProjectionManager` 中已经成功建立的
projection subscription。

### remove_connection cleanup

`ThreadStateManager::remove_connection(connection_id)` 继续负责 connection close cleanup。实现需要同时清理：

- ordinary subscription：现有 `thread_ids_by_connection` 和 `ThreadEntry.connection_ids`。
- projection attach pending lease：新增 `projection_attach_thread_ids_by_connection` 和
  `ThreadEntry.projection_attach_leases`。

返回值继续是 `Vec<ThreadId>`，但实现必须对 ordinary cleanup 和 projection lease cleanup 触达的 thread
去重。返回集合表示：connection close cleanup 触达过，且清理后已经没有 ordinary subscriber、可能需要上层做
thread teardown reconciliation 的 thread ids。若同一个 thread 仍有其他 ordinary subscriber，则不应仅因为
projection attach lease 被清理就返回该 thread。

上层 `thread_processor.connection_closed(...)` 可以继续使用现有逻辑：对返回的 thread ids 检查 core
thread 是否仍 loaded；如果 core 已不可见，则调用 `finalize_thread_teardown(...)`。

### remove_thread_state cleanup

`remove_thread_state(thread_id)` 移除整个 `ThreadEntry` 时，还必须从
`projection_attach_thread_ids_by_connection` 中删除该 thread。这样 archive、unsubscribe、core missing 等
teardown 路径不会留下 projection lease 反向索引。

这部分可以通过遍历 projection 反向索引完成。Finding 2 的规模很小，projection attach pending lease 数量也
很小；为此新增更复杂的数据结构没有必要。

### attach path integration

`ThreadRequestProcessor::prepare_projection_attach(...)` 改为调用
`try_begin_projection_attach(thread_id, connection_id)`。返回 `None` 时保持当前 closed connection 的
silent skip 语义。

一旦 begin 成功，后续所有退出路径都必须显式 release lease：

- `enqueue_projection_attach_response(...)` 失败时 release。
- `handle_projection_attach_response(...)` 中 closing-thread check 命中时 release。
- `capture_snapshot_cut_if_generation_matches(...)` 返回 stale 时 release。
- `read_thread_projection_snapshot_at_cut_for_attach(...)` 返回 error 时 release。
- `skip_projection_attach_after_connection_closed(...)` 命中时 release。
- 第二次 closing-thread check 命中时 release。
- `attach_if_generation_matches(...)` 返回 stale 时 release。
- `attach_if_generation_matches(...)` 成功后 release。
- post-attach connection close cleanup 分支 release 后仍按现有逻辑 detach PM subscription。

release 必须发生在发送最终 response 或 error 前后都可接受，但每个分支应保持一致、易读，并避免遗漏。

### ordinary subscription isolation

`subscribed_connection_ids(thread_id)` 继续只读取 `ThreadEntry.connection_ids`。projection attach lease 不得出现在
这里。

`has_subscribers(thread_id)` 这类测试 helper 如果表达 ordinary subscription，也应继续只看
`connection_ids`。如果需要测试 projection lease，应新增 projection-specific test helper，而不是改变现有 helper
语义。

`subscribe_to_has_connections(thread_id)` 继续只反映 ordinary `connection_ids` 是否为空。projection attach lease
不能延迟 idle unload watcher 的 ordinary subscriber 判断；projection subscription 自身仍由
`ThreadProjectionManager::subscribe_to_has_subscribers(...)` 参与 unload 判断。

## 错误处理

lease release 是 cleanup 操作，不应向客户端暴露新的 error shape。release 幂等，因此即使 connection close
已经先清理 lease，attach response path 再 release 也应安静成功。

如果 attach 最终成功，客户端仍收到当前的 `ThreadProjectionAttachResponse`。如果 attach 在 snapshot 期间遇到
stale generation，继续使用现有 generation gate 的 `invalid_request` 语义。Finding 2 不新增协议级错误。

## 测试策略

### ThreadStateManager 单元测试

新增 focused tests，覆盖 projection lease 数据结构语义：

- live connection 下 `try_begin_projection_attach(...)` 返回 `ThreadState`。
- closed connection 下 `try_begin_projection_attach(...)` 返回 `None`，且不创建 entry。
- projection attach lease 不出现在 `subscribed_connection_ids(thread_id)` 中。
- projection attach lease 不触发 ordinary `has_connections_watcher`。
- `release_projection_attach_lease(...)` 幂等。
- `remove_connection(connection_id)` 会清理 projection attach lease 并返回对应 thread id。
- 同一个 connection 同时有 ordinary subscription 和 projection attach lease 时，`remove_connection(...)`
  返回去重后的 thread id。
- projection attach lease 被清理但 thread 仍有其他 ordinary subscriber 时，`remove_connection(...)` 不返回该
  thread id。
- `remove_thread_state(thread_id)` 会清理 projection attach lease 反向索引。

### Request/runtime race regression

新增 production-path 回归测试，使用现有 projection snapshot hook 卡住 attach：

1. 创建 loaded thread 和 initialized connection。
2. 发起 `thread/projection/attach`。
3. hook 确认 snapshot read 已进入。
4. 模拟 connection close。
5. 放行 snapshot read。
6. 断言不会发送成功 `ThreadProjectionAttachResponse`。
7. 断言 `ThreadStateManager` 不再持有 projection attach lease。
8. 断言 `ThreadProjectionManager` 不留下该 connection 的 projection subscription。

这个测试保护真实 interleaving：lease 在 request processor 侧创建，connection close 在 listener command
完成前发生，attach response path 最终必须 cleanly exit。

### 验证命令

实现后优先跑窄范围验证：

```sh
cargo test -p codex-app-server thread_projection --no-fail-fast
```

如果测试分散在 `thread_state` 相关模块，也可以加更窄的 test filter。完成 Rust 代码修改后按仓库规则运行：

```sh
just fmt
just fix -p codex-app-server
```

不需要为本设计运行全量 workspace 测试，除非 implementation 额外触碰 common/core/protocol 等共享 crate。

## Scope guard

实现时应避免以下偏离：

- 不把 projection attach lease 写入 `thread_ids_by_connection`。
- 不把 projection attach lease 写入 `ThreadEntry.connection_ids`。
- 不让 projection-only connection 收到 ordinary thread notifications。
- 不用 RAII `Drop` 做 async cleanup。
- 不把 Finding 3 的 projection delivery / teardown 线性化并入本改动。
- 不改 protocol schema 或 generated TypeScript。
