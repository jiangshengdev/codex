# Projection hidden race review

## 状态

更新日期：2026-05-27。

- Finding 1：已修复。`c810a3dc7 feat(app-server): cut projection snapshots at history cursor`
  通过 listener 侧 projection history cursor 捕获 snapshot cut，使
  `thread/projection/attach` 返回的 `snapshot.thread` 与 `headCommitId` 来自同一个
  listener 已处理的 projection cut。随后 `4ba8af0c8 fix(app-server): preserve rollout preview derivation`
  回退了共享 preview helper 的语义扩张，避免影响上游 read 路径。后续
  `6af70d99f Refactor app-server projection runtime test harness` 只重构 runtime 测试样板，
  不改变修复状态。
- Finding 2：已修复。projection fanout 现在通过 per-thread bounded queue 和 worker
  与 ordinary thread notification path 半隔离；ordinary notification 不再等待 projection
  delivery 实际入 outgoing queue。queue full 会失效该 thread 当前 projection subscriptions，
  并要求客户端重新 attach。

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

状态：已修复。修复提交为
`c810a3dc7 feat(app-server): cut projection snapshots at history cursor`，后续
`4ba8af0c8 fix(app-server): preserve rollout preview derivation` 回退了会改变上游
`preview_from_rollout_items` 行为的附带改动。`6af70d99f Refactor app-server projection runtime test harness`
仅收敛测试内部样板，保持同一组 runtime race regression 覆盖。

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

状态：已修复。`84a664b5a fix(app-server): isolate projection fanout backpressure`
将 projection fanout 移入 per-thread bounded queue 和 worker；ordinary notification 先走原有
发送路径，projection delivery 后续通过 fanout queue 入队。queue full 会 bump projection
generation、清空该 thread 的 projection subscribers，并要求客户端重新 attach。

修复前当前分支引入的具体改动：`ThreadScopedOutgoingMessageSender::send_server_notification()`
在发送原始 thread notification 之前，先调用
`ThreadProjectionManager::project_notification()`，然后对每个 projection delivery 串行
`await send_server_notification_to_connections(...)`。只有 projection delivery 全部入队后，
才继续发送原始 `turn/started`、`item/completed` 等 notification。

修复前可观察坏结果：一个 projection subscriber 的 outgoing 队列积压，会先阻塞 projection event
入队，再阻塞普通 thread notification。多个 projection subscriber 会把每个 thread event 放大成
N+1 条 outgoing envelope，并且 projection 的 N 条排在普通订阅者前面。内部 outgoing channel
容量只有 128，慢 projection consumer 因而可以对原本独立的普通 thread event delivery 形成
head-of-line blocking。

与 `rust-v0.130.0` 的差异：tag 上普通 thread notification 直接发给普通订阅 connection，没有
新增 projection fanout 这层前置 await。当前分支把 projection transport backpressure 耦合进了
旧有普通 thread event path。

采用方向：projection delivery 不再在普通 notification 前串行 await。当前实现先发送原始
notification，再用 per-thread fanout worker 顺序投递 projection event；fanout queue 使用
`try_send`，满队列时通过 projection generation invalidation 丢弃旧 stream，而不是无声丢失
commit chain 中间段。

## 风险判断

第一个问题已通过 projection snapshot cut 修复，当前继续保留本节作为历史背景和回归风险说明。
第二个问题已通过 per-thread bounded fanout queue 半隔离。剩余边界是设计中明确的非目标：
projection traffic 仍可能占用 shared outgoing channel capacity；本修复隔离的是
`send_server_notification(...)` 中 projection fanout 的 await 和任务堆积。
