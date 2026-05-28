# Outgoing Message Projection Hook Convergence Design

## 背景

当前 fork 相对 `refs/tags/rust-v0.133.0^{}` 在
`ThreadScopedOutgoingMessageSender::send_server_notification(...)` 中直接展开 projection 逻辑：

1. track analytics。
2. materialize projection deliveries。
3. 逐条 await projection delivery 入 outgoing queue。
4. 如果存在 ordinary subscribers，再发送 ordinary notification。

上游 `rust-v0.133.0` 的同一函数只负责 ordinary notification path：

1. track analytics。
2. 如果没有 ordinary subscribers，直接 return。
3. 发送 ordinary notification。

当前 fork 的展开方式让上游 ordinary notification path 变成 projection orchestration path。它还让慢
projection delivery 的 outgoing queue backpressure 阻塞 ordinary notification，这正是后续
projection fanout backpressure isolation 需要解决的问题。

本设计只收口 `outgoing_message.rs` 中的 projection hook 边界，不实现 fanout worker、不新增 projection
queue，也不修改 protocol。

## 已确认选择

- ordinary notification 先走，上游 ordinary path 重新成为主路径。
- projection 逻辑在 `send_server_notification(...)` 中只保留一个薄 hook。
- `connection_ids.is_empty()` 不再让整个函数提前 return；它只控制 ordinary notification 是否发送。
- projection hook 即使没有 ordinary subscribers 也会执行，由 projection manager 自行判断是否有 projection
  subscribers 或可 materialize 的 event。
- 暂不移动 `send_projection_delivery_if_current(...)`。

## 目标

- 降低 `outgoing_message.rs` 对上游 ordinary notification path 的侵入性。
- 让 `send_server_notification(...)` 的主体结构尽量贴近 `rust-v0.133.0`：
  track analytics、ordinary send、projection hook。
- 为后续 fanout/backpressure isolation 提供一个单一、清晰的 projection hook 接缝。
- 保持当前 projection delivery generation gate 语义不变。
- 保持 current wire protocol、schema 和 generated TypeScript 不变。
- 保持 request/response、global notification、broadcast notification、error response 路径不变。

## 非目标

- 不实现 per-thread projection fanout queue。
- 不引入 projection worker、cancellation token 或 queue-full invalidation。
- 不移动 `send_projection_delivery_if_current(...)` 到新模块。
- 不重构 `OutgoingMessageSender`、`ThreadScopedOutgoingMessageSender` 或 transport outgoing queue。
- 不改变 `send_server_notification_to_connections(...)` 的 broadcast/targeted 语义。
- 不改变 projection attach/detach、listener lifecycle、thread state manager 或 unload 逻辑。

## 设计

### `send_server_notification(...)` 主流程

`ThreadScopedOutgoingMessageSender::send_server_notification(...)` 调整为：

1. track analytics。
2. 如果有 ordinary `connection_ids`，先调用现有
   `send_server_notification_to_connections(...)` 发送 ordinary notification。
3. 调用 projection 薄 hook 处理 projection notification。

示意结构：

```rust
pub(crate) async fn send_server_notification(&self, notification: ServerNotification) {
    self.outgoing
        .analytics_events_client
        .track_notification(notification.clone());

    if !self.connection_ids.is_empty() {
        self.outgoing
            .send_server_notification_to_connections(
                self.connection_ids.as_slice(),
                notification.clone(),
            )
            .await;
    }

    self.outgoing
        .send_thread_projection_notification(
            self.thread_id,
            &notification,
            self.projection_history_cursor,
        )
        .await;
}
```

这会改变当前 fork 的发送顺序：ordinary notification 不再等待 projection materialization 或 projection
delivery enqueue。这个变化是本收口的核心语义修正，不是顺手重构。

### Projection 薄 hook

`outgoing_message.rs` 中新增一个 projection-only helper，用于隐藏 materialize 和 delivery loop：

```rust
async fn send_thread_projection_notification(
    &self,
    thread_id: ThreadId,
    notification: &ServerNotification,
    projection_history_cursor: Option<ProjectionHistoryCursor>,
)
```

helper 负责：

- 根据 `projection_history_cursor` 选择 `project_notification_at_cursor(...)` 或 `project_notification(...)`。
- 遍历 materialized `ProjectionDelivery`。
- 继续调用现有 `send_projection_delivery_if_current(...)`。

`send_server_notification(...)` 不再直接知道 projection materialization 的分支细节，也不直接展开 delivery loop。

### Empty ordinary subscribers

上游的 early return 不能原样保留，因为 projection subscribers 可以独立于 ordinary subscribers 存在。

本设计只把 early return 改成 ordinary send 的局部分支：

```rust
if !self.connection_ids.is_empty() {
    // ordinary send
}

// projection hook still runs
```

这条改动只改变 `ThreadScopedOutgoingMessageSender::send_server_notification(...)` 的局部控制流。它不改变
`send_server_notification_to_connections(...)` 中 empty slice 表示 broadcast 的既有语义。

### 保留 guarded delivery helper

`send_projection_delivery_if_current(...)` 暂时保留在 `OutgoingMessageSender` 中。它仍负责：

1. 等待 outgoing queue capacity。
2. capacity 可用后检查 delivery generation。
3. generation 仍匹配时把 projection event enqueue 到目标 connection。
4. generation 不匹配时丢弃 delivery。

这次收口不改变它的位置或语义。后续实现 projection fanout backpressure isolation 时，可以再决定是否把它改造成
cancellation-aware helper，或迁入新的 projection-owned fanout 模块。

## 错误处理

- ordinary notification 发送失败继续沿用现有 warning 行为。
- projection delivery generation mismatch 继续作为正常 race cleanup，安静丢弃。
- projection delivery outgoing queue 关闭继续沿用现有 warning 行为。
- projection hook 不向客户端新增 error，也不新增 forced detach notification。

## 测试策略

本设计是接缝收口，测试重点是防止 ordinary path 再次被 projection path 阻塞或跳过：

- outgoing path 单元测试：有 ordinary subscriber 时，ordinary notification 先于 projection delivery 入队。
- outgoing path 单元测试：没有 ordinary subscriber 但有 projection subscriber 时，projection event 仍会发送。
- regression check：`send_server_notification_to_connections(...)` 的 empty slice broadcast 语义不变。

如果后续 fanout/backpressure isolation 紧接着实现，可以把第一项测试作为后续 fanout regression 的基础，但本设计本身不要求新增 fanout queue 测试。

## 验证命令

实现后使用窄范围验证：

```sh
cargo test -p codex-app-server outgoing_message --no-fail-fast
```

完成 Rust 修改后运行：

```sh
just fmt
just fix -p codex-app-server
git diff --check
```

本设计不要求全量 workspace 测试。

## Scope guard

实现时避免以下偏离：

- 不把 projection fanout backpressure isolation 并入本改动。
- 不新增 `projection_fanout.rs`。
- 不引入 queue、worker、cancellation 或 invalidation。
- 不移动 `send_projection_delivery_if_current(...)`。
- 不重排 request/response、global notification 或 broadcast notification 路径。
- 不修改 `ThreadStateManager` ordinary subscription 语义。
- 不改 app-server protocol schema。
