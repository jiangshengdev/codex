# P2 · Projection cursor 无条件初始化和维护影响旧 listener 路径

日期: 2026-06-01
状态: 🟡 部分过期，仍有窄边界
范围: app-server thread lifecycle / projection 接入点
优先级: P2

## 摘要

原始 history-size 和 per-event cursor 成本已过期；当前只保留 projection subscriber watcher 进入普通 listener 生命周期的窄边界风险。

## 问题

原始问题是 `thread_lifecycle.rs` 在 listener 启动和事件循环中无条件维护 projection history cursor，即使当前没有 projection subscriber，也可能让普通 `thread/subscribe` / resume 承担 projection 的额外 history 读取和 per-event 账本成本。

当前复核显示，这条具体 cursor 成本路径已不再成立；剩余问题收窄为普通 listener 生命周期仍有 projection subscriber watcher 的常数级成本。

## 证据

- 2026-07-04 只读性能检测核对：已过期。
- 当前 `thread_lifecycle.rs` / `thread_processor.rs` 入口中未见 `ProjectionHistoryCursor`、`projection_history_cursor_for_listener_start` 或 `history_cursor`。
- listener 启动没有为 projection cursor 读取完整 history。
- event loop 中也未见每个 event 推进 projection cursor。
- 当前仍有 projection subscriber watcher 进入普通 listener 生命周期，但本次核对只发现常数级 watcher 成本。
- 2026-07-09 当前限定路径复核：`thread_projection.rs`、`thread_projection_runtime.rs`、`request_processors/thread_projection.rs`、`outgoing_message.rs`、`doctor/updates.rs` 中未见 `ProjectionHistoryCursor`、`history_cursor` 或 `projection_history_cursor_for_listener_start`。
- 当前 snapshot cut API 是按 attach generation 捕获 head 的窄接口 (`codex-rs/app-server/src/thread_projection.rs:295`)；watcher API 仍由 `subscribe_to_has_subscribers` 暴露，并会为 thread entry 创建或复用 `has_subscribers` watch receiver (`codex-rs/app-server/src/thread_projection.rs:311`)。
- `invalidate_thread_projection_preserves_has_subscribers_watcher` 显示 invalidation 后 watcher 保持打开并收到 false，这支持“剩余边界是 watcher 生命周期/常数成本”而不是原始 history cursor 成本 (`codex-rs/app-server/src/thread_projection.rs:1019`)。
- 本次核对未运行测试、benchmark 或修复实现。

## 判断

部分过期。原 issue 描述的 history-size 或 per-event cursor 成本不再成立；当前残留边界收窄为 projection subscriber watcher 的生命周期和固定开销，需要更宽范围量化后再判断是否值得处理。

## 影响

原始风险会让未使用 projection 的旧 app-server 客户端承担完整 history load、event clone、计数和 projection manager lock 成本。当前已收窄为常数级 watcher 成本，影响范围和优先级都低于原始描述。

## 后续处理

先做量化复核：确认 projection subscriber watcher 在普通 listener 生命周期中的固定开销、触发次数和是否影响旧客户端关键路径。只有量化后仍值得处理，再进入设计/计划阶段。

## 历史记录

- 原始建议方向：将 `projection_history_cursor_for_listener_start` 改为 lazy；只有存在 projection attach/subscriber 或即将生成 projection snapshot/event 时才读取历史并初始化 cursor。
- 原始建议方向：事件循环中只有 projection manager 当前需要 cursor 时才更新 projection cursor，没有 projection subscriber 时避免 event clone 和 manager lock。
- 原始正确性约束：保留 `RawResponseItem` 对应 persisted `ResponseItem` 的计数语义，不退回到只数 `EventMsg`。
- 关联观察：`thread_processor.rs` 的历史功能风险较低，主要行为改动是 teardown 时调用 `remove_thread_projection(thread_id)` 清理 projection 状态。
- 关联观察：`message_processor.rs` 只是接入 attach/detach dispatch 和 connection close 清理，风险主要在下游 projection 生命周期闭环。
- 关联观察：`outgoing_message.rs` 的普通通知仍先于 projection fanout 发送，且 projection 队列满时使用非阻塞路径，不像主要历史回归来源。
- 关联观察：`thread_state.rs` 将 projection attach lease 与普通 subscriber 集合隔离，旧订阅语义基本不变；剩余风险在调用方是否可靠释放 lease/subscriber。
