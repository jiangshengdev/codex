# Projection Backpressure Closed Notification Design

## 背景

`docs/superpowers/issues/2026-05-30-01-projection-fanout-silent-invalidation.md`
记录了当前 projection fanout 的一个客户端可见正确性问题：当每线程 projection fanout queue 写满时，
`ProjectionFanoutManager::enqueue(...)` 会调用 `invalidate_thread_projection(...)`，清空该线程所有
projection subscribers、重置 `head_commit_id`，并取消当前 worker。但这个 invalidation 只改变服务端内部状态，
不会向客户端发送任何 wire signal。

结果是慢客户端仍以为自己保持 projection subscription，但此后不会再收到
`thread/projection/event`。客户端只有主动调用 `thread/projection/detach` 时才可能看到
`NotSubscribed`。

当前上游基线是 `rust-v0.136.0`。本设计把 projection 视为当前 fork 相对该 tag 的 overlay 能力。实现可以
修改当前分支相对 tag 已有的 overlay 文件；必要时也可以在上游文件中增加薄 hook 或协议注册，但不能重构
`rust-v0.136.0` 已有 ordinary thread notification、thread lifecycle、connection cleanup 或 subscribe/unsubscribe
语义。

## 已确认选择

1. 新增独立 server notification：`thread/projection/closed`。
2. 关闭原因先只支持 `reason: "backpressure"`。
3. queue full 后由 projection overlay 内部触发和发送 closed notification；上游文件只承担薄注册或薄接线。

## 目标

- queue full invalidation 不再对客户端静默发生。
- 客户端收到 `thread/projection/closed` 后能明确知道旧 `subscriptionId` 已失效，需要重新
  `thread/projection/attach` 获取新的 snapshot baseline。
- 不改变 `thread/projection/event` 的 commit chain 语义。
- 不让 projection closed notification 重新阻塞 ordinary notification path。
- 保持后续合并上游 tag 时的冲突面集中、可读、可删除。

## 非目标

- 不解决完整 transport QoS；shared outgoing channel 仍可能被慢客户端占用。
- 不把 projection fanout queue 改成 replay buffer。
- 不改变 explicit detach、thread unload、connection close 或 server shutdown 的现有行为。
- 不新增 `threadClosed`、`connectionClosed`、`serverShutdown` 等 reason。
- 不把 closed signal 塞进 `ThreadProjectionEvent`。
- 不重构 `rust-v0.136.0` 的 ordinary notification fanout 或 lifecycle 主流程。

## Wire Shape

新增 server notification：

```json
{
  "method": "thread/projection/closed",
  "params": {
    "threadId": "thr_123",
    "subscriptionId": "sub_123",
    "reason": "backpressure"
  }
}
```

新增 v2 payload：

```rust
pub struct ThreadProjectionClosedNotification {
    pub thread_id: String,
    pub subscription_id: String,
    pub reason: ThreadProjectionClosedReason,
}

pub enum ThreadProjectionClosedReason {
    Backpressure,
}
```

字段继续使用 v2 API 的 camelCase wire convention。`reason` 使用 enum，而不是裸字符串常量，便于后续确有需要时
扩展，但本设计只定义 `Backpressure`。

## 为什么不复用 `thread/projection/event`

`ThreadProjectionEventNotification` 当前携带 `commit_id` 和 `parent_commit_id`。queue full 后服务端已经选择
invalidate projection state，旧 commit chain 不能继续被视为连续。把 closed 做成 event variant 会产生两个坏选择：

- 给 closed 伪造 commit id，制造错误的连续性。
- 让 closed event 不带 commit id，从而重构现有 event notification shape。

独立 `thread/projection/closed` 更符合语义，也更低侵入。

## 状态与投递顺序

queue full 分支维持当前 fork 的核心顺序：

1. materialized projection job 无法 `try_send` 到该 thread 的 bounded fanout queue。
2. projection manager invalidate 该 thread：
   - bump generation；
   - 清空 subscribers；
   - 重置 `head_commit_id`；
   - 更新 projection-only connection index；
   - 返回被关闭的 `(connection_id, subscription_id)` 列表。
3. fanout manager cancel 当前 worker。
4. fanout manager 移除当前 worker handle。
5. fanout 层对第 2 步返回的 subscribers best-effort 发送 `thread/projection/closed`。

先 bump generation 仍是线性化关键点。它保证 queue full 后尚未完成最终 generation check 的旧
`thread/projection/event` 不会再被投递。

closed notification 不属于 commit chain，不更新 `head_commit_id`，也不携带 commit id。

## Ownership

### `ThreadProjectionManager`

`ThreadProjectionManager` 继续只管理 projection state。它不直接依赖 outgoing sender，也不构造 wire envelope。

需要调整的是 invalidation 返回值：`invalidate_thread_projection(...)` 从只产生副作用，变成返回被清掉的
projection subscriptions。建议引入小结构表达返回值，避免 tuple 语义漂移：

```rust
pub(crate) struct InvalidatedProjectionSubscriber {
    pub(crate) connection_id: ConnectionId,
    pub(crate) subscription_id: String,
}
```

### `ProjectionFanoutManager`

`ProjectionFanoutManager` 拥有 queue full 的处理语义，因此也负责把 invalidation 结果转换为
`thread/projection/closed` notification。

fanout 层可以使用已有 `mpsc::Sender<OutgoingEnvelope>` targeted 发送到对应 `connection_id`。发送是
best-effort：如果 outgoing channel 已关闭，记录 warning 后放弃即可。

### 上游文件 thin hooks

允许的上游接触点仅限：

- 在 protocol notification registry 中注册 `thread/projection/closed`。
- 更新 schema / TypeScript 生成物。
- 若编译需要，在现有 projection hook 附近增加最小 import 或 match arm。

不允许把 queue、worker、overflow、generation gate、closed delivery 逻辑写进 ordinary notification path。

## 客户端语义

客户端收到 `thread/projection/closed` 后：

1. 用 `subscriptionId` 判断该 notification 是否对应当前活跃 subscription。
2. 如果匹配，认为本地 projection stream 已终止。
3. 需要继续同步时，重新调用 `thread/projection/attach`。
4. 新 attach response 的 snapshot 是新的 baseline；旧 subscription 的后续 event 必须被忽略。

`subscriptionId` 是必要字段。它允许客户端在快速 re-attach 后忽略迟到的旧 closed notification。

## 测试策略

### Protocol tests

- `thread/projection/closed` notification 可反序列化和序列化。
- `reason: "backpressure"` 使用 camelCase wire value。
- 生成的 JSON schema 和 TypeScript 包含 closed notification、reason enum。

### Projection manager tests

- `invalidate_thread_projection(...)` 返回被清理 subscribers 的 connection id 和 subscription id。
- invalidation 后旧 generation 不匹配。
- invalidation 后 connection index 被清理。
- invalidation 后新的 attach 返回 `head_commit_id: None`。

### Fanout tests

- queue full 时发送 `thread/projection/closed`。
- queue full 后旧 generation 的 projection event 不再投递。
- closed notification targeted 到被 invalidated 的 projection connection。
- `send_server_notification(...)` 不因 closed notification delivery 而等待 shared outgoing capacity。

## 验证命令

实现后优先跑窄验证：

```sh
cd codex-rs
just test -p codex-app-server-protocol thread_projection
just test -p codex-app-server projection_fanout --no-fail-fast
just write-app-server-schema
just fmt
just fix -p codex-app-server-protocol
just fix -p codex-app-server
```

如果 schema 生成改动影响协议 fixture，再检查并接受对应生成物。除非实现触碰 common/core/protocol 以外的共享行为，
不默认扩大到完整 workspace test。

## 合并上游 TAG 的边界

本设计预期后续继续合并上游 tag。为降低冲突成本：

- projection closed 的业务逻辑集中在 fork overlay 文件。
- 上游文件中的改动保持为 thin hooks 或注册项。
- 不复制上游 lifecycle 状态。
- 不复用 ordinary subscriber index 表示 projection state。
- 不调整 `rust-v0.136.0` 已有 notification ordering。

如果未来上游也新增 projection 或类似 stream-close 机制，再以新 tag 的官方语义为准重新评估是否替换当前 fork
overlay，而不是在旧设计上继续叠加兼容层。
