# P2 · Projection 已知风险路径无端到端测试覆盖

日期: 2026-05-30
状态: 🔴 仍需处理
范围: 批次 5(Projection 测试)
优先级: P2

## 摘要

fanout/backpressure 核心问题已修复，但真实 app-server v2 端到端慢客户端链路仍未确认有回归覆盖。

## 问题

两个投影集成测试(`tests/suite/v2/thread_projection.rs`)自身确定性良好，但 projection 最容易回归的几条路径在集成层没有闭环覆盖，仍主要依赖 manager 单测间接把守。

高价值缺口包括：detach 后不再投递、慢客户端 queue full 后收到关闭信号并能重新 attach、事件负载内容正确。

## 证据

- 2026-07-04 只读性能检测核对：仍需回归覆盖。
- fanout/backpressure 的核心 silent invalidation 问题已由 `thread/projection/closed(reason=backpressure)` 路径修复。
- 本次限定范围内没有确认真实 app-server v2 端到端慢客户端链路已经闭环覆盖。
- 2026-07-09 当前限定代码补证：可见覆盖仍主要落在 runtime / manager / outgoing 层；例如 connection close 后 attach 不会订阅的 runtime 回归测试 (`codex-rs/app-server/src/thread_projection_runtime.rs:701`)、manager invalidation 清理 subscriber/head/generation 的单测 (`codex-rs/app-server/src/thread_projection.rs:955`)、projection backpressure 不阻塞 ordinary notification 的 outgoing 层测试 (`codex-rs/app-server/src/outgoing_message.rs:1411`)。
- 2026-07-09 限定路径未见真实 app-server v2 端到端慢客户端闭环：本轮只核对 `thread_projection.rs`、`thread_projection_runtime.rs`、`request_processors/thread_projection.rs`、`outgoing_message.rs`，未看到从 v2 request attach、慢客户端 backpressure、server closed notification、重新 attach snapshot baseline 到客户端可观察结果的完整测试链路。
- detach 缺口：现有测试没有覆盖「attach → 收事件 → detach → 再跑 turn → 断言该订阅收不到新事件」。
- backpressure 缺口：生产路径 `projection_fanout.rs:132-139` 原先只有合成容量单测 `queue_full_invalidates_generation_and_drops_current_job` 间接覆盖。
- 事件负载缺口：`thread_projection.rs:144-159` 只校验 `thread_id` / `subscription_id` / `commit_id` 与 `parent_commit_id` 链，不断言首事件为 `ThreadProjectionEvent::TurnStarted`，也不断言 turn/item 负载。
- 映射风险点：`projection_event_from_notification`(`thread_projection.rs:428`) 若发错事件种类或 payload 错配，只要 commit id 链连续，测试可能仍通过。
- 本次核对未运行测试、benchmark 或修复实现。

## 判断

仍需处理。既有修复降低了 backpressure 行为风险，当前限定证据也显示关键内部层已有回归测试；但真实 app-server v2 端到端慢客户端链路仍未在限定范围内看到闭环覆盖，因此测试覆盖缺口仍成立。

## 影响

这些缺口覆盖的是「客户端与线程保持同步」的核心契约：退订是否生效、背压满后如何处置、事件内容是否正确。缺少端到端覆盖时，相关回归可能在 CI 中静默通过。

## 后续处理

进入测试设计/计划阶段，优先定义慢客户端 backpressure、detach 后不投递、重新 attach baseline、多 subscriber / 多 connection 和事件 payload 的端到端验证入口。

## 历史记录

- `thread_projection.rs:147` 的 `assert_eq!(attach.snapshot.head_commit_id, first.parent_commit_id)` 在 attach 发生于任何事件前时等价于 `None == None`，未覆盖 head=Some 的非平凡场景。
- per-thread listener task 在 thread unload/remove 时的生命周期、多订阅者 fanout 路由，旧记录显示均仅单测覆盖。
- `turn_interrupt.rs:58` 曾把既有 abort 测试切到 `create_config_toml_excluding_tmp_roots`，改动了被中断工具的沙箱面；该项仅作信息记录。
