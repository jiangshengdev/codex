# Projection Fanout Backpressure Isolation Design

## 背景

`docs/superpowers/issues/2026-05-19-projection-hidden-race-review.md` 的 Finding 2 仍开放：
`ThreadScopedOutgoingMessageSender::send_server_notification(...)` 会先 materialize projection
delivery，然后逐条 await projection delivery 入 outgoing queue，最后才发送 ordinary thread
notification。慢 projection consumer 因此可以把 projection fanout 的 backpressure 带回 ordinary
thread notification path。

当前 atomicity 相关 finding 已通过 generation gate 修复。本设计只处理 projection fanout 对 ordinary
notification 的阻塞问题，不重新设计 projection commit chain。

## 已确认选择

- 采用半隔离方案：ordinary notification path 不再等待 projection delivery 实际入 outgoing queue。
- 每个 thread 使用一个 bounded projection fanout queue 和一个顺序 worker。
- projection queue 满时，失效该 thread 当前 projection subscriptions，并要求客户端重新 attach。
- 继续复用现有 `ProjectionDelivery.generation` 与发送前 generation gate。
- 不引入 per-subscription queue。
- 不修改 app-server protocol schema。

## 目标

- `send_server_notification(...)` 不再串行 await 每条 projection delivery 发送完成后才发送 ordinary
  notification。
- 同一 thread 内 projection jobs 由单个 worker 顺序消费，避免多个后台 task 竞争导致同一 thread 的
  projection event 发送顺序漂移。
- projection fanout 堆积有明确上限；超过上限时不无声丢弃 projection commit chain 中的一段事件。
- queue full 时 bump projection generation，使已 materialized 但尚未线性化入队的旧 delivery 被现有
  generation gate 丢弃。
- queue full 时清理该 thread 的 projection subscriptions 和 connection index，后续客户端必须重新
  `thread/projection/attach` 才能获得新的 snapshot baseline。
- 保持 ordinary thread subscription state、thread lifecycle、protocol payload 和 generated TypeScript 不变。

## 非目标

- 不保证 projection traffic 永远不能占用 shared outgoing channel capacity。本设计隔离的是
  `send_server_notification(...)` 中的 projection fanout await 和任务堆积，不是完整 transport QoS。
- 不新增 forced-detach notification。queue full 后服务端侧 projection subscription 失效；显式 wire signal
  不属于本设计。
- 不改变 `thread/projection/event` wire shape。
- 不为每个 projection subscription 建立独立队列。
- 不改变 ordinary notification 的 payload、analytics 或 request/response 发送路径。
- 不把 projection fanout queue 扩展成 replay buffer。

## 设计

### Fanout manager

新增一个 app-server 内部组件 `ProjectionFanoutManager`，由 `OutgoingMessageSender` 持有。
它按 `ThreadId` 管理 projection fanout worker：

```rust
struct ProjectionFanoutManager {
    threads: Mutex<HashMap<ThreadId, ThreadFanoutHandle>>,
}

struct ThreadFanoutHandle {
    tx: mpsc::Sender<ProjectionFanoutJob>,
    cancellation: CancellationToken,
}

struct ProjectionFanoutJob {
    deliveries: Vec<ProjectionDelivery>,
}
```

组件放在新的 `codex-rs/app-server/src/projection_fanout.rs`，避免继续扩大
`outgoing_message.rs`。`OutgoingMessageSender` 只暴露薄调用点：

```rust
async fn enqueue_projection_fanout(
    self: &Arc<Self>,
    thread_id: ThreadId,
    deliveries: Vec<ProjectionDelivery>,
)
```

fanout queue 使用 bounded channel。初始容量使用内部常量：

```rust
const PROJECTION_FANOUT_QUEUE_CAPACITY: usize = 32;
```

容量按“每个 thread 的 notification jobs”计数，而不是按单个 subscriber delivery 计数。一个 job 内仍可包含多个
`ProjectionDelivery`。

### Sending flow

`ThreadScopedOutgoingMessageSender::send_server_notification(...)` 调整为：

1. track analytics。
2. 通过 `ThreadProjectionManager::project_notification(...)` 或
   `project_notification_at_cursor(...)` materialize projection deliveries。
3. 如果存在 ordinary `connection_ids`，先发送 ordinary thread notification。
4. 将 projection deliveries 交给 `ProjectionFanoutManager::enqueue_projection_fanout(...)`。

关键点是 ordinary notification 不再等待 projection deliveries 逐条发送。即使没有 ordinary subscribers，
projection deliveries 也仍会 enqueue 给 fanout worker；不能因为 `connection_ids.is_empty()` 提前返回。

projection delivery 相对 ordinary notification 的 wire arrival order 不再保证。设计只要求 ordinary path 不被当前
projection fanout 串行 await 阻塞。

### Worker behavior

每个 thread 同时最多一个 fanout worker。worker 顺序处理该 thread 的 jobs：

```rust
while let Some(job) = rx.recv().await {
    for delivery in job.deliveries {
        send_projection_delivery_if_current_or_cancelled(thread_id, delivery, cancellation).await;
    }
}
```

worker 发送 projection delivery 时继续遵守 generation gate：

1. 等待 outgoing queue capacity。
2. capacity 可用后校验 delivery generation。
3. generation 匹配时立即 enqueue envelope。
4. generation 不匹配时丢弃 delivery。

为了支持 queue full 后取消旧 worker，projection fanout worker 使用 cancellation token。发送 helper 需要在等待
outgoing capacity 时同时监听 cancellation：

```rust
tokio::select! {
    permit = sender.reserve() => { /* generation check then send */ }
    _ = cancellation.cancelled() => return,
}
```

取消 worker 时不向客户端发送错误。旧 worker 中尚未发送的 delivery 被丢弃；已经入 outgoing queue 的 delivery
视为已完成发送侧线性化。

### Queue full invalidation

`enqueue_projection_fanout(...)` 使用 `try_send`，不得 await queue capacity。若 queue 已满：

1. 从 fanout manager map 中移除该 thread 的 current worker handle。
2. cancel 该 worker，阻止它继续等待或发送旧 projection jobs。
3. 调用 projection manager 失效该 thread 的 projection subscriptions。
4. 丢弃当前 job。

PM 侧新增语义明确的方法，而不是在调用点直接复用 teardown 名称：

```rust
pub(crate) async fn invalidate_thread_projection(&self, thread_id: ThreadId)
```

该方法在 PM 锁内完成：

- bump 已知 `ProjectionGeneration`。
- 清空该 thread 的 projection subscribers。
- 清理 `connection_index` 中对应 thread 的反向索引。
- 清空 `head_commit_id`，让下一次 attach 以新 snapshot baseline 开始。
- 保留该 thread 的 `history_cursor` 和 `has_subscribers` watcher，并把 `has_subscribers` 更新为 `false`。

保留 watcher 很重要：queue full 不是 thread teardown，thread 仍可能 loaded。不能因为 projection invalidation
关闭 listener lifecycle 正在监听的 projection subscriber watch。

如果该 thread 没有 projection entry 且没有 generation entry，`invalidate_thread_projection(...)` 是 no-op。

### New attach after invalidation

queue full 后，旧 subscriptions 已失效，旧 generation 的 delivery 会被丢弃。客户端如果继续需要 projection：

1. 发起新的 `thread/projection/attach`。
2. attach 路径捕获新的 generation。
3. 返回新的 snapshot 和 `headCommitId`。
4. 后续 projection events 从新的 commit chain baseline 开始。

本设计不新增 wire-level forced detach signal。因此“要求重新 attach”是服务端 projection stream 语义：旧
subscription 不再产生可靠连续 events；显式通知客户端失效原因不属于本设计。

### Cleanup

worker 正常退出时从 fanout manager map 中移除自己的 handle。为了避免新 worker 被旧 worker 误删，map entry
带 `worker_id`；只有当前 entry 的 `worker_id` 等于退出 worker 的 id 时才删除。

connection close 和 thread teardown 仍走现有 PM cleanup。若 thread teardown 调用
`ThreadProjectionManager::remove_thread(...)`，同一 teardown path 必须 cancel 对应 thread worker，避免旧 task
继续等待 shared outgoing queue capacity。connection close 只通过 PM 移除相关 subscription；它不 cancel 整个
thread fanout worker，除非该 close 触发 thread teardown。

## 错误处理

- queue full 是 projection stream 失效条件，记录 warning，并执行 invalidation。
- generation mismatch 是正常 race cleanup，继续安静丢弃旧 delivery。
- outgoing channel 关闭时沿用现有 warning 行为，worker 退出。
- cancellation 是 fanout lifecycle 控制，不向客户端暴露错误。

## 测试策略

### Fanout manager 单元测试

- 同一 thread 多次 enqueue 后，由单个 worker 按 job 顺序发送 projection deliveries。
- queue 未满时 `enqueue_projection_fanout(...)` 不等待 worker 实际发送完成。
- queue full 时 cancel 旧 worker、调用 projection invalidation，并丢弃当前 job。
- queue full 后再次 attach 并 enqueue 新 generation delivery 时，新 worker 可以发送新 delivery。

### ThreadProjectionManager 单元测试

- `invalidate_thread_projection(...)` bump generation，使旧 delivery generation 不再匹配。
- invalidation 清空 subscribers、connection index 和 head。
- invalidation 保留 history cursor。
- invalidation 把 existing has-subscribers watcher 更新为 `false`，且不关闭 watcher。
- unknown thread invalidation 不创建 projection entry 或 generation entry。

### Outgoing path regression

- 构造 projection worker 卡在 outgoing queue capacity 的场景；调用 `send_server_notification(...)` 时，
  ordinary notification 仍先进入 outgoing queue，不等待 projection worker 完成。
- 填满某 thread 的 projection fanout queue；下一次 enqueue 触发 invalidation，旧 projection delivery 不再发送。
- 多 subscriber 的同一 projection job 仍按 `ProjectionDelivery` 中已有排序顺序处理。

### Runtime regression

新增或扩展 `thread_projection_runtime` 覆盖真实 listener path：

1. 建立 ordinary thread subscriber 和 projection subscriber。
2. 让 projection fanout worker 在发送 projection delivery 时阻塞。
3. 触发新的 thread notification。
4. 断言 ordinary notification 不等待被阻塞的 projection delivery。
5. 填满 projection fanout queue。
6. 断言旧 projection subscription 失效，重新 attach 后获得新的 snapshot baseline。

## 验证命令

实现完成后优先跑窄范围验证：

```sh
RUST_MIN_STACK=8388608 cargo nextest run -p codex-app-server --test-threads 4 thread_projection
```

如果测试落在 `outgoing_message` 或新增 `projection_fanout` 模块，补对应 filter：

```sh
cargo test -p codex-app-server projection_fanout --no-fail-fast
```

完成 Rust 修改后运行：

```sh
just fmt
just fix -p codex-app-server
git diff --check
```

本设计不要求全量 workspace 测试，除非实现额外触碰 common、core、protocol 等共享 crate。

## Scope guard

实现时避免以下偏离：

- 不把 per-subscription queue 并入本改动。
- 不新增 protocol notification 或 schema 字段。
- 不把 projection fanout queue 做成 replay buffer。
- 不改变 ordinary subscription lifecycle。
- 不改变 thread persistence、snapshot cut 或 projection commit materialization 规则。
- 不把 shared outgoing channel 改成 priority scheduler；完整 transport QoS 是后续独立设计。
