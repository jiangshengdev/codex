# Projection hidden race review

## 背景

本记录比较当前分支与 `rust-v0.130.0` tag，聚焦
`docs/superpowers/issues/2026-05-19-projection-atomicity-review.md` 未覆盖的新增风险。

既有文档已经覆盖以下问题，本文不复述：

- projection attach 可以在 `finalize_thread_teardown` 后注册并返回成功。
- check-only attach 准备路径会留下没有反向索引的 `ThreadStateManager` entry。
- projection event delivery 在 `ThreadProjectionManager` 锁外发送，teardown 可先清空 head。

## Findings

### 1. Attach snapshot 与 projection commit head 不是同一个时间切片

位置：`codex-rs/core/src/session/mod.rs:1666`、
`codex-rs/core/src/session/mod.rs:1673`、
`codex-rs/app-server/src/request_processors/thread_lifecycle.rs:277`、
`codex-rs/app-server/src/request_processors/thread_lifecycle.rs:283`、
`codex-rs/app-server/src/request_processors/thread_lifecycle.rs:300`、
`codex-rs/app-server/src/thread_projection_runtime.rs:78`、
`codex-rs/app-server/src/request_processors/thread_projection.rs:119`、
`codex-rs/app-server/src/thread_projection_runtime.rs:110`、
`codex-rs/app-server/src/thread_projection.rs:120`。

严重程度：Blocker。

当前分支引入的具体改动：projection attach 通过 listener command 返回 snapshot，但
snapshot 的数据源是 `read_thread_projection_snapshot()` 读取的 persisted/live thread
view；projection commit head 的数据源则是 listener 处理 typed notification 时调用的
`ThreadProjectionManager::project_notification()`。

可观察坏结果：core 在 `send_event_raw()` 中先调用 `persist_rollout_items(...)`，之后才
`deliver_event_raw(...)`。因此某个 turn/item event 可能已经进入 rollout/thread store，并且
已经排到 `rx_event`，但 app-server listener 尚未处理该 event。此时如果
`thread/projection/attach` command 先进入 listener，由于 `tokio::select!` 使用 `biased;` 且
`listener_command_rx.recv()` 排在 `conversation.next_event()` 前，attach command 可以先执行。

这时 attach response 的 snapshot 会从 store 读到这个尚未投影的 event，但
`ThreadProjectionManager` 的 head 还没有为该 event 生成 commit。随后 listener 再处理同一个
pending event，`project_notification()` 会把它作为新的 `thread/projection/event` 发给客户端。
客户端会看到同一语义事件先出现在 snapshot 里，随后又以 projection event 形式出现；同时
`headCommitId` 仍只描述 PM 已投影的 head，不描述 snapshot 中实际已经包含的最新事件。

与 `rust-v0.130.0` 的差异：tag 上没有 projection commit chain，也没有把一个 thread view
snapshot 与独立 PM head 组合成同一个 attach response。当前分支新增了这两个数据源之间的
异步边界，但没有把 snapshot 读取、listener event drain、PM head 推进线性化。

建议方向：attach 前需要把 listener 已排队的可投影事件 drain 到 PM head，或让 snapshot 与
head 来自同一个 projection-owned 状态源。至少不能返回“包含 store 中新事件，但 head 仍停在旧
PM commit”的 attach response。

### 2. Projection fanout 会阻塞普通 thread notification delivery

位置：`codex-rs/app-server/src/outgoing_message.rs:150`、
`codex-rs/app-server/src/outgoing_message.rs:156`、
`codex-rs/app-server/src/outgoing_message.rs:163`、
`codex-rs/app-server/src/outgoing_message.rs:547`、
`codex-rs/app-server/src/outgoing_message.rs:569`、
`codex-rs/app-server/src/outgoing_message.rs:571`、
`codex-rs/app-server-transport/src/transport/mod.rs:21`。

严重程度：Important。

当前分支引入的具体改动：`ThreadScopedOutgoingMessageSender::send_server_notification()`
在发送原始 thread notification 之前，先调用
`ThreadProjectionManager::project_notification()`，然后对每个 projection delivery 串行
`await send_server_notification_to_connections(...)`。只有 projection delivery 全部入队后，
才继续发送原始 `turn/started`、`item/completed` 等 notification。

可观察坏结果：一个 projection subscriber 的 outgoing 队列积压，会先阻塞 projection event
入队，再阻塞普通 thread notification。多个 projection subscriber 会把每个 thread event 放大成
N+1 条 outgoing envelope，并且 projection 的 N 条排在普通订阅者前面。内部 outgoing channel
容量只有 128，慢 projection consumer 因而可以对原本独立的普通 thread event delivery 形成
head-of-line blocking。

与 `rust-v0.130.0` 的差异：tag 上普通 thread notification 直接发给普通订阅 connection，没有
新增 projection fanout 这层前置 await。当前分支把 projection transport backpressure 耦合进了
旧有普通 thread event path。

建议方向：projection delivery 不应在普通 notification 前串行 await。可以考虑先发送原始
notification，再异步/独立队列投递 projection event；或者让 projection fanout 使用不会阻塞
ordinary thread subscribers 的隔离队列与 backpressure 策略。

## 风险判断

第一个问题会破坏 attach response 的 snapshot/head 一致性，并可能让客户端对同一事件做重复
apply。第二个问题主要是 backpressure 隔离问题：低速 projection client 会放大普通 turn/item
事件延迟，尤其在多 projection 订阅或 websocket consumer 积压时更明显。
