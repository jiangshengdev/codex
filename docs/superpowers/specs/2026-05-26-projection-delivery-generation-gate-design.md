# Projection Delivery Generation Gate Design

## 背景

`docs/superpowers/issues/2026-05-19-projection-atomicity-review.md` 的 Finding 3 仍开放：
projection notification 在 `ThreadProjectionManager` 锁内生成 commit、推进 `head_commit_id`，
并 materialize `ProjectionDelivery`。随后调用方释放 PM 锁，在锁外把 delivery 逐条 await
发送到 outgoing queue。

这个窗口里如果另一个入口先执行 thread teardown，并调用 `ThreadProjectionManager::remove_thread(...)`，
PM 会清掉该 thread 的 projection head。之后旧的 materialized delivery 仍可能进入 outgoing queue，
客户端会收到一个 server 端已经无法再用 head/replay 状态解释的 projection event。

当前代码已经有 `ProjectionGeneration`：attach 路径用它阻止 stale attach，`remove_thread(...)`
会在 teardown 时 bump generation。本设计复用这套 generation 语义，只解决 Finding 3。

## 已确认选择

- 复用现有 `ProjectionGeneration`。
- `ProjectionDelivery` 携带生成该 delivery 时的 generation。
- projection delivery 真正入 outgoing queue 前校验 generation。
- generation 过期时丢弃旧 projection delivery。
- 不修改 ordinary thread notification 的发送顺序。
- 不解决 projection fanout backpressure 隔离问题。

## 目标

- 如果 teardown 先于 projection delivery 入 outgoing queue，旧 delivery 不得再发送给客户端。
- 如果 projection delivery 已经入 outgoing queue，再发生 teardown，则该 delivery 视为已经完成发送侧线性化。
- 最终 generation 校验与入 outgoing queue 之间不得再有 `await`。
- 保持 existing projection attach generation gate 的语义不变。
- 保持 protocol schema 和 generated TypeScript 不变。
- 保持 ordinary thread subscription state 不变。

## 非目标

- 不解决 `projection fanout` 阻塞 ordinary notification 的 backpressure 问题。
- 不引入 projection delivery 独立队列。
- 不重排 ordinary thread notification 与 projection notification。
- 不让 `ThreadStateManager` 拥有 projection delivery lifecycle。
- 不改变 `thread/projection/event` wire shape。
- 不为 detach、connection close 或 replay 设计新的 subscription epoch。

## 设计

### Delivery 携带 generation

`ProjectionDelivery` 增加 generation 字段：

```rust
pub(crate) struct ProjectionDelivery {
    pub(crate) connection_id: ConnectionId,
    pub(crate) generation: ProjectionGeneration,
    pub(crate) notification: ThreadProjectionEventNotification,
}
```

`ThreadProjectionManager::project_notification_at_cursor(...)` 在持有 PM 锁时捕获当前
`ProjectionGeneration`。同一轮 notification materialize 出来的 delivery 使用同一个 generation。

如果该 thread 还没有 generation entry，materialize projection delivery 时应像 attach cut 一样捕获并保存
initial generation。这样后续 `remove_thread(...)` 能 bump 这个 generation，并让已 materialized 但尚未入队的
delivery 失效。

### Generation gate

`ThreadProjectionManager` 新增一个小的查询 API，用于判断 generation 是否仍是当前 generation：

```rust
pub(crate) async fn generation_matches(
    &self,
    thread_id: ThreadId,
    generation: ProjectionGeneration,
) -> bool
```

语义：

- 当前 generation 等于 delivery generation 时返回 `true`。
- thread 已 teardown、generation 已 bump、或 generation entry 不存在时返回 `false`。
- 该 API 不创建 thread entry，不推进 head，不修改 subscriber state。

### 入队线性化点

不能只在调用 `send_server_notification_to_connections(...)` 前检查 generation，因为该发送函数内部会
`await` bounded mpsc queue capacity。若校验之后、实际入队之前发生 teardown，旧 delivery 仍可能发送。

因此 projection delivery 需要一条 guarded enqueue 路径：

1. 先等待 outgoing queue capacity。
2. capacity 可用后，校验 delivery generation 是否仍匹配。
3. 如果匹配，立即把 envelope 同步放入已获得的 queue slot。
4. 如果不匹配，丢弃 delivery，并释放 queue slot。

第 2 步和第 3 步之间不得有 `await`。这让 outgoing queue enqueue 成为线性化点：

- teardown 先发生：generation mismatch，delivery 被丢弃。
- enqueue 先发生：delivery 已经进入 transport queue，后续 teardown 不再追溯取消它。

实现可以在 `OutgoingMessageSender` 内增加 projection-only helper，例如：

```rust
async fn send_projection_delivery_if_current(
    &self,
    thread_id: ThreadId,
    delivery: ProjectionDelivery,
)
```

该 helper 只服务 projection delivery，不改变普通 notification、response、error 的发送路径。

### Fanout 行为

`ThreadScopedOutgoingMessageSender::send_server_notification(...)` 仍按当前顺序工作：

1. track analytics。
2. project notification，生成 projection deliveries。
3. 逐条 guarded enqueue projection delivery。
4. 发送 ordinary thread notification。

这保持现有 fanout 顺序和 backpressure 行为。慢 projection client 仍可能延迟 ordinary notification；
这是 Hidden-race Finding 2 的独立问题，不在本设计中修复。

同一轮 notification 的多个 delivery 可以逐条 guarded enqueue。若 teardown 发生在部分 delivery 入队之后，
已经入队的 delivery 视为 teardown 前线性化，尚未入队的 delivery 会因为 generation mismatch 被丢弃。
本设计不额外保证跨 subscriber 的 all-or-nothing fanout。

## 错误处理

generation mismatch 是 teardown race cleanup，不向客户端暴露错误。旧 projection delivery 被安静丢弃。

如果 outgoing queue 已关闭，沿用现有 warning 行为。该情况不新增协议级 error。

## 测试策略

### ThreadProjectionManager 单元测试

- `project_notification_at_cursor(...)` 生成的 delivery 携带当前 generation。
- `remove_thread(...)` 后旧 delivery generation 不再匹配。
- unknown thread generation 不匹配，且查询不创建 projection entry。
- generation mismatch 不改变 head、subscriber 或 connection index。

### Outgoing guarded enqueue 测试

- delivery 等待 outgoing queue capacity 时，先执行 `remove_thread(...)`，放行 capacity 后不应入队旧
  `ThreadProjectionEvent`。
- delivery 获得 capacity 后、generation 仍匹配时，应正常入队。
- generation mismatch 只丢弃 projection delivery，不影响随后 ordinary notification 的现有发送逻辑。

### Runtime race regression

新增或扩展 `thread_projection_runtime` 回归测试，覆盖真实路径：

1. 建立 projection subscriber。
2. 触发一个会 materialize projection delivery 的 thread notification。
3. 阻塞 projection delivery 入 outgoing queue。
4. 执行 thread teardown，使 PM bump generation 并清 head。
5. 放行 outgoing queue capacity。
6. 断言旧 `ThreadProjectionEvent` 未发送。
7. 断言 ordinary notification 路径未被本修复重排或替换。

## 验证命令

实现后优先使用窄范围验证：

```sh
cargo test -p codex-app-server thread_projection --no-fail-fast
```

完成 Rust 修改后运行：

```sh
just fmt
just fix -p codex-app-server
```

本设计不要求全量 workspace 测试，除非实现额外触碰 common、core、protocol 等共享 crate。

## Scope guard

实现时避免以下偏离：

- 不把 backpressure 隔离并入本改动。
- 不把 projection delivery 改成独立 queue。
- 不改变 ordinary notification 的发送顺序。
- 不改变 app-server protocol schema。
- 不修改 `ThreadStateManager` ordinary subscription 语义。
- 不把 generation gate 设计扩展成新的 subscription epoch。
