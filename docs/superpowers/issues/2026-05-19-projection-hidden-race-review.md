# Projection hidden race review

日期: 2026-05-19
状态: ✅ 已修复
范围: app-server projection snapshot cut、projection fanout 与 ordinary thread notification delivery
优先级: 未定

## 摘要

本文记录的两个 projection hidden race finding 均已修复；snapshot/head 时间切片问题已通过 listener 侧 projection history cursor 收敛，projection fanout 阻塞普通 notification 的问题已通过 projection-owned per-thread fanout queue 收敛。

## 问题

- Finding 1: attach response 的 `snapshot.thread` 与 `headCommitId` 曾可能来自不同时间切片，导致同一语义事件先出现在 snapshot 中，随后又以 `thread/projection/event` 形式出现。
- Finding 2: projection fanout 曾在普通 thread notification 前串行 await，慢 projection consumer 可通过 shared outgoing capacity 阻塞普通 `turn/started`、`item/completed` 等 notification delivery。

## 证据

本记录比较当前分支与 `rust-v0.130.0` tag，聚焦 `docs/superpowers/issues/2026-05-19-projection-atomicity-review.md` 未覆盖的新增风险。既有 atomicity 文档已经覆盖 projection attach 在 `finalize_thread_teardown` 后注册并返回成功、check-only attach 准备路径留下没有反向索引的 `ThreadStateManager` entry、projection event delivery 在 `ThreadProjectionManager` 锁外发送且 teardown 可先清空 head 等问题。

Finding 1 的证据:

- 位置: `codex-rs/core/src/session/mod.rs:1666`、`codex-rs/core/src/session/mod.rs:1673`、`codex-rs/app-server/src/request_processors/thread_lifecycle.rs:277`、`codex-rs/app-server/src/request_processors/thread_lifecycle.rs:283`、`codex-rs/app-server/src/request_processors/thread_lifecycle.rs:300`、`codex-rs/app-server/src/thread_projection_runtime.rs:78`、`codex-rs/app-server/src/request_processors/thread_projection.rs:119`、`codex-rs/app-server/src/thread_projection_runtime.rs:110`、`codex-rs/app-server/src/thread_projection.rs:120`。
- 原严重程度: Blocker。
- 修复前 projection attach 通过 listener command 返回 snapshot，但 snapshot 的数据源是 `read_thread_projection_snapshot()` 读取的 persisted/live thread view；projection commit head 的数据源则是 listener 处理 typed notification 时调用的 `ThreadProjectionManager::project_notification()`。
- 修复前 core 在 `send_event_raw()` 中先调用 `persist_rollout_items(...)`，之后才 `deliver_event_raw(...)`。因此某个 turn/item event 可能已经进入 rollout/thread store，并且已经排到 `rx_event`，但 app-server listener 尚未处理该 event。此时如果 `thread/projection/attach` command 先进入 listener，由于 `tokio::select!` 使用 `biased;` 且 `listener_command_rx.recv()` 排在 `conversation.next_event()` 前，attach command 可以先执行。
- 修复前 attach response 的 snapshot 会从 store 读到这个尚未投影的 event，但 `ThreadProjectionManager` 的 head 还没有为该 event 生成 commit。随后 listener 再处理同一个 pending event，`project_notification()` 会把它作为新的 `thread/projection/event` 发给客户端。客户端会看到同一语义事件先出现在 snapshot 里，随后又以 projection event 形式出现；同时 `headCommitId` 仍只描述 PM 已投影的 head，不描述 snapshot 中实际已经包含的最新事件。
- 与 `rust-v0.130.0` 的差异: tag 上没有 projection commit chain，也没有把一个 thread view snapshot 与独立 PM head 组合成同一个 attach response。当前分支新增了这两个数据源之间的异步边界，但修复前没有把 snapshot 读取、listener event drain、PM head 推进线性化。

Finding 2 的证据:

- 位置: `codex-rs/app-server/src/outgoing_message.rs:150`、`codex-rs/app-server/src/outgoing_message.rs:156`、`codex-rs/app-server/src/outgoing_message.rs:163`、`codex-rs/app-server/src/outgoing_message.rs:547`、`codex-rs/app-server/src/outgoing_message.rs:569`、`codex-rs/app-server/src/outgoing_message.rs:571`、`codex-rs/app-server-transport/src/transport/mod.rs:21`。
- 原严重程度: Important。
- 修复前 `ThreadScopedOutgoingMessageSender::send_server_notification()` 在发送原始 thread notification 之前，先调用 `ThreadProjectionManager::project_notification()`，然后对每个 projection delivery 串行 `await send_server_notification_to_connections(...)`。只有 projection delivery 全部入队后，才继续发送原始 `turn/started`、`item/completed` 等 notification。
- 修复前一个 projection subscriber 的 outgoing 队列积压，会先阻塞 projection event 入队，再阻塞普通 thread notification。多个 projection subscriber 会把每个 thread event 放大成 N+1 条 outgoing envelope，并且 projection 的 N 条排在普通订阅者前面。内部 outgoing channel 容量只有 128，慢 projection consumer 因而可以对原本独立的普通 thread event delivery 形成 head-of-line blocking。
- 与 `rust-v0.130.0` 的差异: tag 上普通 thread notification 直接发给普通订阅 connection，没有新增 projection fanout 这层前置 await。当前分支修复前把 projection transport backpressure 耦合进了旧有普通 thread event path。

## 判断

两个 finding 当前均为已修复状态。

Finding 1 已通过 `c810a3dc7 feat(app-server): cut projection snapshots at history cursor` 修复。该修复通过 listener 侧 projection history cursor 捕获 snapshot cut，使 `thread/projection/attach` 返回的 `snapshot.thread` 与 `headCommitId` 来自同一个 listener 已处理的 projection cut。

Finding 2 已通过 projection-owned fanout facade 和 per-thread bounded fanout queue 修复。普通 turn/item notification 仍可能和 projection delivery 共享最终 outgoing channel capacity，但 listener / ordinary notification path 不再等待 projection delivery 完成入队；projection queue full 时会 invalidate 该 thread 的 projection stream，而不是无声丢弃 commit chain 中间事件。

## 修复记录

更新日期: 2026-05-28。

- Finding 1: `c810a3dc7 feat(app-server): cut projection snapshots at history cursor` 通过 listener 侧 projection history cursor 捕获 snapshot cut，使 `thread/projection/attach` 返回的 `snapshot.thread` 与 `headCommitId` 来自同一个 listener 已处理的 projection cut。随后 `4ba8af0c8 fix(app-server): preserve rollout preview derivation` 回退了共享 preview helper 的语义扩张，避免影响上游 read 路径。后续 `6af70d99f Refactor app-server projection runtime test harness` 只重构 runtime 测试样板，不改变修复状态。
- Finding 2: `8ea5570b1 fix(app-server): route projection hook through fanout` 将 projection hook 接到 projection-owned fanout facade；`d31209dd3 fix(app-server): centralize projection cleanup` 将 thread teardown 的 projection cleanup 收口到同一 facade。

## 验证记录

- `3cf943e88 test(app-server): cover projection fanout backpressure` 覆盖普通 thread notification 不再等待 projection delivery shared outgoing capacity 的回归，验证 shared outgoing capacity 被 projection delivery 占满时，普通 thread notification 仍先完成发送且 `send_server_notification(...)` 不等待 projection delivery 入队。
- `6af70d99f Refactor app-server projection runtime test harness` 仅收敛测试内部样板，保持同一组 runtime race regression 覆盖。

## 影响

修复前，Finding 1 会使客户端无法用 `headCommitId` 准确解释 attach snapshot 的内容边界，并可能看到重复语义事件。Finding 2 会让慢 projection consumer 对普通 thread notification delivery 形成 head-of-line blocking。

修复后，本文继续保留这些内容作为历史背景和回归风险说明；当前记录的两个具体 race 已修复，新的风险不应在本文内直接展开为 implementation plan。

## 后续处理

本文不保留旧 `建议方向` 作为当前 implementation plan。若后续发现新的 projection snapshot、fanout 或 backpressure 风险，需要单独进入设计/计划阶段，再决定是否创建新的 issue、设计文档或实施计划。

## 历史记录

旧建议方向曾要求 attach 前把 listener 已排队的可投影事件 drain 到 PM head，或让 snapshot 与 head 来自同一个 projection-owned 状态源；至少不能返回“包含 store 中新事件，但 head 仍停在旧 PM commit”的 attach response。

旧建议方向还曾要求 projection delivery 不应在普通 notification 前串行 await。候选方向包括先发送原始 notification，再异步/独立队列投递 projection event；或者让 projection fanout 使用不会阻塞 ordinary thread subscribers 的隔离队列与 backpressure 策略。
