# P1 · Projection 流满后静默失效，客户端无任何信号

日期: 2026-05-30
状态: ✅ 已修复
范围: 批次 3(Fanout)/批次 2(核心)
优先级: P1

## 摘要

Projection fanout 队列满后曾静默解除订阅；当前已通过 `thread/projection/closed(reason=backpressure)` 向客户端暴露重同步信号。

## 问题

projection fanout 每线程队列容量固定为 32(`PROJECTION_FANOUT_QUEUE_CAPACITY`)。当队列写满时，`ProjectionFanoutManager::enqueue` 曾在 `TrySendError::Full` 分支中清理该线程所有 subscriber、重置 `head_commit_id` 并取消 worker，但客户端没有收到任何服务端主动关闭信号。

慢客户端持续背压时，客户端仍以为自己保持订阅，实际却不会再收到 `thread/projection/event`，只能在之后主动 `thread/projection/detach` 时看到 `NotSubscribed`。

## 证据

- 原始风险路径：`codex-rs/app-server/src/projection_fanout.rs:132` 附近的 queue full 分支。
- 原始清理路径：`codex-rs/app-server/src/thread_projection.rs:362-382` 的 `invalidate_thread_projection` 只做 generation bump、清 subscribers 和内部 `has_subscribers_tx.send(false)`。
- 原始协议缺口：`v2/thread_projection.rs` 当时只有 Attach/Detach/Event/Snapshot，没有 server 主动 dropped/closed 变体。
- 当前修复记录显示：queue full invalidation 现在会向被服务端清理的 projection subscribers 发送 `thread/projection/closed`，`reason` 为 `backpressure`。

## 判断

已修复。客户端收到 `thread/projection/closed(reason=backpressure)` 后应重新 `thread/projection/attach` 获取新的 snapshot baseline。

## 修复记录

- queue full invalidation 增加 `thread/projection/closed` 通知。
- backpressure 场景使用 `reason=backpressure` 表达服务端主动关闭原因。

## 影响

修复前这是客户端可见的正确性问题：静默丢流且无重同步信号等价于静默数据丢失。修复后主要风险转为回归风险，需要确保 closed 事件、重新 attach 和 snapshot baseline 语义持续被覆盖。

## 后续处理

后续如调整 projection fanout、backpressure 或 closed 事件协议，需要复核慢客户端 queue full 链路，并确认客户端仍能收到关闭原因和重新 attach。
