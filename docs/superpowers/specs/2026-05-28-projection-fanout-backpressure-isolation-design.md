# Projection Fanout Backpressure Isolation Design

## 背景

`docs/superpowers/issues/2026-05-19-projection-hidden-race-review.md` 的 Finding 2 仍开放：
projection fanout 的 outgoing queue backpressure 仍可能阻塞普通 thread notification delivery。

本设计以 `refs/tags/rust-v0.133.0^{}` 作为上游基线。该 tag 的
`ThreadScopedOutgoingMessageSender::send_server_notification(...)` 只负责 ordinary notification path：

1. track analytics。
2. 如果没有 ordinary subscribers，直接 return。
3. 发送 ordinary notification。

当前 fork 已通过 `docs/superpowers/specs/2026-05-28-outgoing-message-projection-hook-convergence-design.md`
收敛了 outgoing hook 边界：ordinary notification 先发送，projection 逻辑进入
`send_thread_projection_notification(...)` 薄 hook。这个重构降低了对上游 ordinary path 的侵入，但还没有完整解决
backpressure：listener 仍会 await projection delivery 入 shared outgoing queue；如果 projection delivery 卡在
capacity，后续 listener event 的 ordinary notification 仍可能被上一条 projection fanout 阻塞。

本设计只解决 projection fanout backpressure isolation，不重新设计 projection commit chain，不继续重构上游
ordinary notification path。

## 已确认选择

- 新增 projection-owned facade。`outgoing_message.rs` 只调用 facade，不直接持有 fanout queue、worker、
  invalidation 或 cleanup 细节。
- 每个 thread 使用一个 bounded projection fanout queue 和一个顺序 worker。
- projection queue 满时，先 invalidate projection state / bump generation，再 cancel worker，最后丢弃当前 job。
- thread teardown 通过 projection facade 的统一 cleanup 取消 fanout worker 并清理 projection manager state。
- 继续复用现有 `ProjectionDelivery.generation` 与发送前 generation gate。
- 不引入 per-subscription queue。
- 不修改 app-server protocol schema。

## 目标

- `send_thread_projection_notification(...)` 不再 await 每条 projection delivery 实际入 shared outgoing queue。
- ordinary thread notification path 保持 hook convergence 后的形状，不再被新的 fanout 细节污染。
- 同一 thread 内 projection jobs 由单个 worker 顺序消费，避免多个后台 task 竞争导致同一 thread 的 projection event
  发送顺序漂移。
- projection fanout 堆积有明确上限；超过上限时不无声丢弃 projection commit chain 中的一段事件。
- queue full 时明确失效该 thread 的 projection stream，客户端必须重新 `thread/projection/attach` 获得新的
  snapshot baseline。
- 保持 ordinary thread subscription state、thread lifecycle 主流程、protocol payload 和 generated TypeScript 不变。

## 非目标

- 不保证 projection traffic 永远不能占用 shared outgoing channel capacity。本设计隔离的是 listener / ordinary
  notification path 对 projection fanout completion 的等待，不是完整 transport QoS。
- 不新增 forced-detach notification。queue full 后服务端侧 projection subscription 失效；显式 wire signal 不属于本设计。
- 不改变 `thread/projection/event` wire shape。
- 不为每个 projection subscription 建立独立队列。
- 不改变 ordinary notification 的 payload、analytics、request/response、global notification 或 broadcast notification
  路径。
- 不把 projection fanout queue 扩展成 replay buffer。
- 不改 `ThreadStateManager` ordinary subscription 语义。

## Upstream Scope Guard

本设计的实现必须遵守以下边界：

- 不再重排 `ThreadScopedOutgoingMessageSender::send_server_notification(...)` 的 ordinary notification 主流程。
- 不把 queue、worker、overflow、cancellation 或 invalidation 逻辑写进 `send_server_notification(...)`。
- 不在 `thread_processor.rs` / `thread_lifecycle.rs` 中散落 fanout worker cancel 细节。
- 不复用 ordinary subscriber indexes 表示 projection state。
- 不改变 `send_server_notification_to_connections(...)` 的 empty-slice broadcast 语义。

允许的 outgoing 接缝只有一个：`send_thread_projection_notification(...)` 调用 projection facade。

## 设计

### Projection facade

新增 projection-owned facade，用于收口 notification fanout、queue overflow、worker lifecycle 和 thread cleanup。
本文统一称它为 `ThreadProjectionFacade`：

```rust
pub(crate) struct ThreadProjectionFacade {
    manager: ThreadProjectionManager,
    fanout: ProjectionFanoutManager,
}
```

facade 对外只提供少量语义 API：

```rust
impl ThreadProjectionFacade {
    pub(crate) async fn enqueue_notification(
        &self,
        sender: mpsc::Sender<OutgoingEnvelope>,
        thread_id: ThreadId,
        notification: &ServerNotification,
        projection_history_cursor: Option<ProjectionHistoryCursor>,
    );

    pub(crate) async fn remove_thread(&self, thread_id: ThreadId);
}
```

`OutgoingMessageSender` 可以持有这个 facade，也可以通过现有 projection runtime owner 间接访问它；但
`outgoing_message.rs` 不应直接管理 fanout worker map。

`send_thread_projection_notification(...)` 的职责收窄为：

```rust
self.thread_projection_facade
    .enqueue_notification(self.sender.clone(), thread_id, notification, projection_history_cursor)
    .await;
```

它不再展开 materialization 分支，也不再逐条 await delivery send。

### Fanout manager

facade 内部使用 `ProjectionFanoutManager` 按 `ThreadId` 管理 worker：

```rust
struct ProjectionFanoutManager {
    threads: Mutex<HashMap<ThreadId, ThreadFanoutHandle>>,
}

struct ThreadFanoutHandle {
    tx: mpsc::Sender<ProjectionFanoutJob>,
    cancellation: CancellationToken,
    worker_id: u64,
}

struct ProjectionFanoutJob {
    deliveries: Vec<ProjectionDelivery>,
}
```

fanout queue 使用 bounded channel。容量按“每个 thread 的 notification jobs”计数，而不是按单个 subscriber
delivery 计数。一个 job 内仍可包含多个 `ProjectionDelivery`。

初始容量使用内部常量，例如：

```rust
const PROJECTION_FANOUT_QUEUE_CAPACITY: usize = 32;
```

容量值不是 protocol contract，后续可以只在内部调优。

### Notification flow

hook convergence 后的 ordinary flow 保持不变：

1. `send_server_notification(...)` track analytics。
2. 如果有 ordinary subscribers，先发送 ordinary notification。
3. 调用 `send_thread_projection_notification(...)`。
4. projection hook 调用 facade。

facade 的 `enqueue_notification(...)` 执行：

1. 根据 `projection_history_cursor` 调用 `project_notification_at_cursor(...)` 或 `project_notification(...)`。
2. 如果 materialized `deliveries` 为空，直接返回。
3. 将 deliveries 作为一个 `ProjectionFanoutJob` 用 `try_send` 放入该 thread 的 bounded queue。
4. `try_send` 成功后立即返回，不等待 worker 把 delivery 放入 shared outgoing queue。
5. `try_send` 返回 full 时触发 queue-full invalidation。

这个 flow 允许当前 ordinary notification 先发送，也避免本次 listener event 在 projection delivery send 上继续等待。

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

1. 等待 shared outgoing queue capacity。
2. capacity 可用后校验 delivery generation。
3. generation 匹配时立即 enqueue envelope。
4. generation 不匹配时丢弃 delivery。

为了支持 queue full 和 thread teardown 后快速停止，发送 helper 在等待 outgoing capacity 时同时监听 cancellation：

```rust
tokio::select! {
    permit = sender.reserve() => { /* generation check then send */ }
    _ = cancellation.cancelled() => return,
}
```

取消 worker 不向客户端发送错误。已经进入 shared outgoing queue 的 delivery 视为已完成发送侧线性化；尚未通过最后
generation check 的旧 delivery 必须被丢弃。

### Queue full invalidation

`enqueue_notification(...)` 必须使用 `try_send`，不得 await queue capacity。若 queue 已满，顺序必须是：

1. 通过 projection manager invalidate 该 thread 的 projection state，并 bump generation。
2. cancel current worker，阻止它继续等待或发送旧 projection jobs。
3. 从 fanout manager map 中移除该 thread 的 current worker handle。
4. 丢弃当前 job。

先 bump generation 是线性化关键点。它保证 queue full 后，还没有完成最后 generation check 的旧 delivery 都会失效。
如果先 cancel 再 bump generation，worker 可能在两个动作之间拿到 outgoing permit，并用旧 generation 通过检查。

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

### Thread cleanup

facade 提供统一 thread cleanup：

```rust
pub(crate) async fn remove_thread(&self, thread_id: ThreadId) {
    self.fanout.cancel_thread(thread_id).await;
    self.manager.remove_thread(thread_id).await;
}
```

现有调用 `ThreadProjectionManager::remove_thread(...)` 的 teardown 接缝应改为调用 facade cleanup。调用点仍只看到一个
projection-owned cleanup hook；fanout worker cancel 和 PM state cleanup 不散落到上游 lifecycle / processor 流程里。

connection close 仍通过 PM 移除相关 projection subscription；它不 cancel 整个 thread fanout worker，除非该 close
触发 thread teardown 或 queue-full invalidation。

### Worker exit cleanup

worker 正常退出时从 fanout manager map 中移除自己的 handle。为了避免新 worker 被旧 worker 误删，map entry 带
`worker_id`；只有当前 entry 的 `worker_id` 等于退出 worker 的 id 时才删除。

## 错误处理

- queue full 是 projection stream 失效条件，记录 warning，并执行 invalidation。
- generation mismatch 是正常 race cleanup，继续安静丢弃旧 delivery。
- outgoing channel 关闭时沿用现有 warning 行为，worker 退出。
- cancellation 是 fanout lifecycle 控制，不向客户端暴露错误。
- projection materialization 返回空 delivery 是正常情况，不记录 warning。

## 测试策略

### Facade / fanout manager tests

- `enqueue_notification(...)` materialize 后使用 `try_send`，queue 未满时不等待 worker 实际发送完成。
- 同一 thread 多次 enqueue 后，由单个 worker 按 job 顺序发送 projection deliveries。
- queue full 时先 invalidation / generation bump，再 cancel worker，并丢弃当前 job。
- queue full 后再次 attach 并 enqueue 新 generation delivery 时，新 worker 可以发送新 delivery。
- worker 退出不会删除同一 thread 的 newer worker handle。

### ThreadProjectionManager tests

- `invalidate_thread_projection(...)` bump generation，使旧 delivery generation 不再匹配。
- invalidation 清空 subscribers、connection index 和 head。
- invalidation 保留 history cursor。
- invalidation 把 existing has-subscribers watcher 更新为 `false`，且不关闭 watcher。
- unknown thread invalidation 不创建 projection entry 或 generation entry。

### Outgoing path regression

- 构造 projection worker 卡在 shared outgoing queue capacity 的场景；调用 `send_server_notification(...)` 时，
  ordinary notification 仍先进入 outgoing queue，并且函数不等待 projection delivery send 完成。
- 没有 ordinary subscribers 但存在 projection subscribers 时，projection hook 仍 enqueue projection job。
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
cargo test -p codex-app-server projection_fanout --no-fail-fast
cargo test -p codex-app-server thread_projection --no-fail-fast
cargo test -p codex-app-server outgoing_message --no-fail-fast
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
- 不继续重构 `send_server_notification(...)` 或 `send_server_notification_to_connections(...)`。
- 不把 fanout cleanup 拆成多个 lifecycle 调用点。
