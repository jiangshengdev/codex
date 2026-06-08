# Projection on rust-v0.131.0 Analysis Temp

## 背景

本文件记录只读分析结论：当前 `test` 分支的 thread projection 功能在官方 `rust-v0.131.0` 基础上应如何重新实现。

本轮不修改生产代码，不执行迁移，只分析 projection 原始依赖在 0.131 中的变化，以及 0.131 是否提供了新的支撑能力。

## 总结

projection 仍然需要作为独立 overlay 实现，不能被 `rust-v0.131.0` 的官方功能替代。

`rust-v0.131.0` 新增或强化了与 thread history 相关的能力，例如 `thread/read(includeTurns)`、`thread/turns/list` 和 live `active_turn_snapshot()` 合并逻辑。这些能力可以支撑 projection snapshot 的实现，但不能提供 projection 的 subscription、commit chain、connection-scoped fanout 和 lifecycle 语义。

因此迁移方向应是：以 0.131 官方结构为底座，复用官方 thread history / live-turn reconstruction 能力，重新接回 projection 的独立 API、runtime、fanout 和 lifecycle。

## 0.131 不能替代 projection 的部分

`rust-v0.131.0` 没有官方等价实现：

- 没有 `thread/projection/attach`。
- 没有 `thread/projection/detach`。
- 没有 `thread/projection/event`。
- 没有 `subscriptionId`。
- 没有 `headCommitId`。
- 没有 `commitId` / `parentCommitId` commit chain。
- 没有 projection subscription lifecycle。
- 没有 connection-scoped projection fanout。

`thread/read`、`thread/turns/list` 和普通 turn/item notification stream 只能提供相邻能力，不能组合成等价 projection API。

## 0.131 可复用的新支撑

### thread history reconstruction

0.131 的 `thread/turns/list` 路径已经包含重建 turns、处理 pagination、合并 live active turn 的逻辑。

关键能力：

- 从 stored rollout history 构造 API turns。
- 读取 live `ThreadState::active_turn_snapshot()`。
- 将 live active turn 合并到 persisted turns。
- 根据 thread loaded status 修正 stale in-progress turn。

这与 projection snapshot 的“基于持久历史，再叠加 live active turn”需求高度重叠。

迁移时不应把 0.130 时代 projection snapshot 的 live-turn 合并逻辑原样硬搬。应优先复用或对齐 0.131 的 reconstruction 语义，避免 projection snapshot 与官方 `thread/turns/list` 对同一 live turn 给出不同状态。

### listener command ordering

0.131 仍保留 `ThreadListenerCommand` 和 listener task。projection attach 仍应通过 listener command 串行完成，而不是同步直接返回。

projection attach 需要保持这些顺序约束：

- closing-thread guard。
- snapshot read。
- connection live check。
- projection attach。
- late close cleanup。
- response send。

### outgoing notification path

0.131 的 `ThreadScopedOutgoingMessageSender::send_server_notification` 仍是 typed thread notification fanout 的关键出口。

projection 应在这里额外投影：

- `turn/started`
- `turn/completed`
- `item/started`
- `item/completed`

普通 notification 仍按 0.131 官方路径发给普通 subscribers；projection event 只发给 projection subscribers。

## 需要保留的 projection runtime

以下能力在 0.131 中没有替代物，需要保留为 fork overlay：

- `ThreadProjectionManager`
- per-thread projection entry
- connection -> thread projection index
- projection subscriber map
- `subscriptionId`
- `headCommitId`
- `commitId` / `parentCommitId`
- projection event wrapping
- projection subscriber watch
- connection close cleanup
- thread teardown cleanup

`project_notification` 仍应只投影四类 notification：

- `TurnStarted`
- `TurnCompleted`
- `ItemStarted`
- `ItemCompleted`

## 过时或需要重接的 0.130 依赖

### ThreadStateManager access

当前 projection 依赖专用的 live connection / thread state access，例如：

- `try_thread_state_for_live_connection`
- `is_live_connection`

0.131 官方普通 subscription 路径是 `try_ensure_connection_subscribed`，它会把连接加入普通 thread subscription。

projection 不能复用这个方法作为 attach 前置条件，否则 `thread/projection/attach` 会隐式订阅普通 thread stream，破坏 projection lifecycle 与普通 thread lifecycle 独立的原则。

因此需要在 0.131 上保留或重建小而专用的 live-connection check / thread-state access。

### ThreadListenerCommand

0.131 的 `ThreadListenerCommand` 没有 projection variant。

需要追加 projection attach response command，用于让 attach response 在 listener 顺序里完成。

### UnloadingState

0.131 的 unload watcher 只考虑：

- 普通 thread subscribers。
- thread active status。

projection 迁移后还必须考虑：

- projection subscribers。

否则普通 subscribers 清空、thread idle 后，即使仍有 projection subscriber，thread 也可能被 unload。

### connection close cleanup

0.131 的 connection close 顺序到 `thread_processor.connection_closed(connection_id)` 结束。

projection cleanup 应作为尾部步骤追加：

1. 先让 official processors 完成 close。
2. `thread_processor.connection_closed` 标记连接不再 live。
3. 再从 `ThreadProjectionManager` 移除 projection subscription。

这个顺序能保留官方 close 行为，同时避免 attach / close race 造成断开连接后仍注册 projection subscription。

### TUI notification handling

0.131 已把 TUI server notification handling 拆到新位置，例如 `chatwidget/protocol.rs` 和 `app/app_server_event_targets.rs`。

迁移时不能再按旧 0.130 思路只改大文件 `chatwidget.rs`。

`ThreadProjectionEvent` 对 TUI 不是 actionable notification，应在 0.131 的真实 exhaustive match 位置作为 no-op / global-none 处理。

## 建议实现路径

### protocol 层

在 0.131 的 protocol registry 上追加：

- `ClientRequest::ThreadProjectionAttach`
- `ClientRequest::ThreadProjectionDetach`
- `ServerNotification::ThreadProjectionEvent`

新增或恢复 v2 projection types：

- `ThreadProjectionAttachParams`
- `ThreadProjectionAttachResponse`
- `ThreadProjectionSnapshot`
- `ThreadProjectionDetachParams`
- `ThreadProjectionDetachResponse`
- `ThreadProjectionDetachStatus`
- `ThreadProjectionEventNotification`
- `ThreadProjectionEvent`

保持 wire method：

- `thread/projection/attach`
- `thread/projection/detach`
- `thread/projection/event`

### app-server 层

新增 overlay modules：

- `thread_projection`
- `thread_projection_runtime`
- `request_processors/thread_projection`

这些模块应接入 0.131 当前结构，不覆盖官方 `attestation`、`environment`、`extensions`、`skills_watcher`、`remote_control` 等新增模块。

### snapshot 层

projection snapshot 应基于 0.131 的 `thread/read` / turn reconstruction 语义实现。

建议方向：

- 复用 `read_thread_view(thread_id, include_turns: true)` 作为 base view。
- 对未 materialized 但 loaded 的 thread，fallback 到 metadata-only view。
- 合并 live active turn 时，优先复用或对齐 0.131 `thread/turns/list` 的 reconstruction helper。
- 不让 projection snapshot 与官方 `thread/turns/list` 对 live active turn 的状态产生分叉。

### attach 层

projection attach 应保持 listener-ordered：

- request processor 只准备 thread id、thread state、snapshot future。
- attach response 通过 `ThreadListenerCommand` 进入 listener task。
- listener task 内完成 snapshot、attach、race guard 和 response。

### fanout 层

在 `ThreadScopedOutgoingMessageSender::send_server_notification` 上添加 projection fanout：

- 先从 original `ServerNotification` 生成 projection event。
- 给 projection subscribers 发送 `ThreadProjectionEvent`。
- 再保持官方普通 notification fanout。

不要改变官方普通 notification 的目标连接集合。

### lifecycle 层

projection subscribers 必须参与 unload 判断。

unload 条件应同时满足：

- 没有普通 thread subscribers。
- 没有 projection subscribers。
- thread 非 active。
- idle 时间达到 unload delay。

projection detach、connection close、thread teardown 都需要更新 projection subscriber watch。

### close cleanup 层

connection close 后追加 projection cleanup。

关键原则：

- 不改变 0.131 official processors 的 close 顺序。
- `thread_processor.connection_closed` 必须先于 projection manager cleanup。
- projection cleanup 只处理 projection subscriptions，不混入 ordinary thread unsubscribe。

## 主要风险

### snapshot 语义分叉

0.131 已经有官方 live active turn 合并逻辑。projection snapshot 如果继续使用旧的独立合并路径，可能与 `thread/turns/list` 对同一 thread 给出不同 turn status 或不同 turn order。

处理：

- 正式设计中明确 projection snapshot 对齐 0.131 turn reconstruction。
- 增加 focused test 覆盖 loaded thread + includeTurns + active turn 场景。

### lifecycle 混合

不能让 `thread/projection/attach` 隐式普通 subscribe，也不能让 `thread/unsubscribe` 隐式 projection detach。

处理：

- projection attach 使用专用 live connection check。
- detach 只走 `thread/projection/detach`、connection close 或 thread teardown。

### generated schema 冲突

0.131 protocol surface 变化大，generated schema / TypeScript diff 容易把官方新增类型和 projection 类型互相覆盖。

处理：

- 先迁移手写 Rust 源码。
- 再运行 schema generator。
- generated files 单独提交。

### TUI exhaustive match 位置变化

0.131 TUI 已拆分 notification handling。

处理：

- 迁移时用 `rg "ServerNotification::"` 定位真实 exhaustive match。
- 在 0.131 新 owner 文件处理 `ThreadProjectionEvent`。
- 不按 0.130 的旧 `chatwidget.rs` 位置硬套。

## 当前分析结论

projection 在 0.131 上的正确实现不是旧 diff 的机械搬运，而是：

1. 保留 projection 独立 API 和 runtime。
2. 复用 0.131 官方 thread history / live-turn reconstruction 能力。
3. 在 0.131 的 listener、outgoing、unload、connection close 结构上重新接线。
4. 保证 projection lifecycle 不污染 ordinary thread subscription lifecycle。
5. 让 generated schema 后置生成。
