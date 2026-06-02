# P1 · Projection 流满后静默失效,客户端无任何信号

日期:2026-05-30
范围:批次 3(Fanout)/ 批次 2(核心)
优先级:高(客户端可见的正确性问题)

## 问题

projection fanout 每线程队列容量固定 32(`PROJECTION_FANOUT_QUEUE_CAPACITY`)。当队列写满,
`ProjectionFanoutManager::enqueue` 走 `TrySendError::Full` 分支:调用
`invalidate_thread_projection` 清空该线程**所有** subscriber、把 `head_commit_id` 重置为
`None`、取消 worker(`projection_fanout.rs:132-139`)。

- 位置:`codex-rs/app-server/src/projection_fanout.rs:132`
- `invalidate_thread_projection` 只 `bump generation` + 清 subscribers + 发内部
  `has_subscribers_tx.send(false)`,**不向客户端发送任何通知**
  (`thread_projection.rs:362-382`)。
- 协议侧没有「投影被服务端中止」的事件:`v2/thread_projection.rs` 只有
  Attach/Detach/Event/Snapshot,没有 server 主动发起的 dropped/closed 变体。

## 为何是风险

慢客户端(消费 < 生产)持续背压 → 队列填满 → 服务端单方面解除其订阅。客户端仍以为自己在订阅中,
但此后永远收不到 `thread/projection/event`,且 `head_commit_id` 已被重置。客户端无法察觉
(无 error 通知、无强制 detach 事件,只有一行服务端 `warn!` 日志,客户端看不到)。

对一个「让客户端与线程保持同步」的特性,静默丢流且无重新同步信号,等于静默数据丢失。
客户端下次 `thread/projection/detach` 会得到 `NotSubscribed`,但那是它主动问才知道。

## 状态

已修复。queue full invalidation 现在会向被服务端清理的 projection subscribers 发送
`thread/projection/closed`，`reason` 为 `backpressure`。客户端收到后应重新
`thread/projection/attach` 获取新的 snapshot baseline。
