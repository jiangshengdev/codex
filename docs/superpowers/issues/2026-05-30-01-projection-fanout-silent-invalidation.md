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
- 2026-07-09 当前限定代码补证：`ThreadProjectionManager::invalidate_thread_projection` 现在返回 `Vec<InvalidatedProjectionSubscriber>`，而不是只做内部状态清理 (`codex-rs/app-server/src/thread_projection.rs:221`, `codex-rs/app-server/src/thread_projection.rs:403`)。
- 2026-07-09 当前限定测试补证：`invalidate_thread_projection_clears_subscribers_head_and_generation` 断言 invalidation 返回被清理 subscriber、旧 generation 失效、connection index 被清空，并且重新 attach 后 head 归零 (`codex-rs/app-server/src/thread_projection.rs:955`)。
- 本轮允许代码路径内未包含发送 `thread/projection/closed` 的 facade / fanout 调用点；因此本文只补 manager 层当前证据，不把 closed notification 发送链路重新判定为已端到端复核。

## 判断

已修复。客户端收到 `thread/projection/closed(reason=backpressure)` 后应重新 `thread/projection/attach` 获取新的 snapshot baseline。2026-07-09 的限定复核只确认 manager invalidation 会返回被清理 subscriber 并重置 projection baseline；closed notification 的实际发送调用不在本轮允许代码路径内，仍以后续更宽范围复核或既有修复记录为准。

## 修复记录

- queue full invalidation 增加 `thread/projection/closed` 通知。
- backpressure 场景使用 `reason=backpressure` 表达服务端主动关闭原因。

## 影响

修复前这是客户端可见的正确性问题：静默丢流且无重同步信号等价于静默数据丢失。修复后主要风险转为回归风险，需要确保 closed 事件、重新 attach 和 snapshot baseline 语义持续被覆盖。

## 后续处理

后续如调整 projection fanout、backpressure 或 closed 事件协议，需要复核慢客户端 queue full 链路，并确认客户端仍能收到关闭原因和重新 attach。若要再次声明端到端已覆盖，需要扩大到 facade / fanout / protocol 发送路径。
