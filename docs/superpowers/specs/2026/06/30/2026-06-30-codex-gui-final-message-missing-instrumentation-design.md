# Codex GUI final message missing instrumentation 设计

## 目标

为 Codex GUI 刷新旧 URL 后丢失最后 assistant final message 的问题添加一组临时 Rust 端 instrumentation，用一次可复现刷新验证 projection cursor 在哪里丢失或回退。

本设计只覆盖诊断日志，不改变 `thread/projection/attach`、listener、rollout 持久化、turn reconstruction 或 GUI Redux 行为。日志用于区分运行时事实，不作为长期产品功能。

## 背景

当前已复现的现象是：浏览器实时打开时能看到最后 assistant final message；刷新或用旧 URL 重新打开后，`thread/projection/attach` 返回的 snapshot 中目标 turn 变为 `interrupted`，且 `finalAssistantEntryIds` 为空。

已确认的关键事实：

- 目标 rollout 已包含 final 与完成事件：
  - line 241：`event_msg/agent_message`，`phase = "final_answer"`。
  - line 242：assistant `response_item/message`。
  - line 244：同一 turn 的 `event_msg/task_complete`。
- attach snapshot 会用 projection manager 内存态 cut 截断 history：
  - `history_items.truncate(cut.history_cursor.item_count())`。
- 目标 attach snapshot 表现最符合 `history_cursor.item_count() <= 240`，但现有日志没有记录 attach cut cursor 的实际值。
- `ThreadProjectionManager::set_history_cursor` 当前无单调递增保护。
- `thread/projection/attach` 会进入 `ensure_listener_task_running`；只有 `listener_matches` 失败时才会重建 listener 并写入 listener start baseline。
- `listener_matches` 使用 `Arc::ptr_eq` 判断同一个 `CodexThread` Arc，不按 thread id 判断。

因此当前不是要证明“rollout 未落盘”，而是验证 projection cursor 是否在内存态停在 final 之前、被 baseline 覆盖，或 attach capture 看到 stale cut。

## 设计原则

- 只记录能区分假设的运行时数值，不记录完整消息文本或完整 rollout item。
- 日志点数量保持最少，优先覆盖 Rust projection cut 和 listener cursor 生命周期。
- 日志应包含 `thread_id`，便于从 `/Users/jiangsheng/.codex/logs_2.sqlite` 按目标 thread 过滤。
- 日志应能判断 cursor 是否前进、倒退、或 attach 时已经低于 rollout tail。
- instrumentation 是临时诊断代码；验证完成后应删除，除非后续另行设计长期 tracing。

## 诊断问题

本轮 instrumentation 需要回答四个问题：

1. `thread/projection/attach` 捕获 snapshot cut 时，`history_cursor.item_count()` 是多少。
2. attach 进入 `ensure_listener_task_running` 时，当前 listener 是否匹配；如果不匹配，失败原因是什么。
3. listener start baseline 是多少，是否小于目标 rollout tail `244`。
4. 是否出现 `set_history_cursor` 将 cursor 从较大值写回较小值。

如果这四个问题都有日志证据，就能区分：

- attach cut 本身已停在 line 240 或更早。
- listener 重建 baseline 小于 rollout tail。
- event path 曾把 cursor 推到 tail，但随后被旧值覆盖。
- cursor 已经到 tail，但 snapshot reconstruction 仍然丢 final。

## 日志点

### 1. attach cut 捕获

位置：

- `codex-rs/app-server/src/thread_projection_runtime.rs`
- `handle_projection_attach_response`
- 在 `capture_snapshot_cut_if_generation_matches` 成功返回 cut 后记录。

字段：

- `thread_id`
- `connection_id`
- `request_id`
- `projection_generation`
- `cut_history_cursor_item_count`
- `cut_head_commit_id`

回答的问题：

- attach snapshot 的输入 cut 是否已经 `<= 240`。
- 如果这里已经低于 rollout tail，问题在 Rust projection cut 或更早，不需要继续怀疑前端 Redux rebuild。

### 2. listener match / 重建决策

位置：

- `codex-rs/app-server/src/request_processors/thread_lifecycle.rs`
- `ensure_listener_task_running`
- 在检查 `listener_matches(&conversation)` 前后记录。

字段：

- `thread_id`
- `listener_generation`
- `listener_present`
- `listener_weak_upgrade_ok`
- `listener_arc_matches`
- `will_rebuild_listener`
- 可选 `source`，标记来源是 `thread/projection/attach`、resume、thread_created auto attach 或其他入口。

回答的问题：

- 旧 URL attach 是否只是 ensure，还是实际进入 listener 重建。
- 如果发生重建，是因为无 listener、Weak 失效，还是同 thread id 但不同 `CodexThread` Arc。

约束：

- 如果现有封装无法直接暴露三段 match 结果，可以先增加一个只供日志使用的内部 inspection helper，返回结构化 match 状态。
- helper 不应改变 `listener_matches` 的业务语义。

### 3. listener start baseline

位置：

- `codex-rs/app-server/src/request_processors/thread_lifecycle.rs`
- `projection_history_cursor_for_listener_start` 或其调用方
- 在 listener start 写入 projection manager 前记录。

字段：

- `thread_id`
- `is_ephemeral`
- `load_history_ok`
- `history_item_count`
- `baseline_cursor_item_count`

回答的问题：

- listener 重建时 baseline 是否小于目标 rollout tail `244`。
- 如果 baseline 为 `240` 或更小，再结合 `set_history_cursor` old/new，就能验证 cursor 覆盖假设。

约束：

- `projection_history_cursor_for_listener_start` 当前不直接接收 `thread_id`。优先在调用方记录返回值；只有调用方字段不足时才轻微调整函数签名。

### 4. cursor 写入集中点

位置：

- `codex-rs/app-server/src/thread_projection.rs`
- `ThreadProjectionManager::set_history_cursor`
- 在覆盖 `ThreadEntry.history_cursor` 前后记录。

字段：

- `thread_id`
- `old_history_cursor_item_count`
- `new_history_cursor_item_count`
- `old_head_commit_id`
- `subscriber_count`
- 可选 `is_cursor_regression = new < old`

回答的问题：

- 是否发生 cursor 从 `244` 或更大写回 `240` 或更小。
- 哪些写入需要再与 listener start / event cursor 日志关联。

约束：

- 该函数不知道调用来源。第一版可用相邻日志按时间关联；若不足，再在 callsite 增加 source 字段，不在第一版扩大侵入面。

### 5. event cursor 推进

位置：

- `codex-rs/app-server/src/request_processors/thread_lifecycle.rs`
- listener event loop 中调用 `projection_persisted_rollout_item_count_for_event(&event.msg)` 后、`advance_by` 前后。

字段：

- `thread_id`
- `event_id`
- `event_msg_type`
- `persisted_item_count`
- `cursor_before_item_count`
- `cursor_after_item_count`

回答的问题：

- listener 是否实际处理了 line 241 final `agent_message`、line 242 assistant `RawResponseItem`、line 244 `task_complete` 对应的 live event。
- 如果 event path 把 cursor 推到 tail，但 attach cut 仍低，重点转向后续覆盖或 generation/capture 时序。

约束：

- 不记录完整 event payload，只记录事件类型摘要和计数。

## 日志级别与过滤

使用现有 tracing 日志机制，优先采用 `info` 或当前 app-server 会进入 `logs_2.sqlite` 的等价级别。日志 target 应集中在 Rust app-server projection/listener 相关模块，字段名保持稳定，便于用 SQLite 查询。

建议统一使用可搜索前缀或 event 名称，例如：

- `projection_attach_cut`
- `projection_listener_match`
- `projection_listener_baseline`
- `projection_cursor_set`
- `projection_event_cursor_advance`

日志必须能通过目标 `thread_id = 019f1824-3181-79a2-8553-e4ae29576184` 过滤。

## 验证流程

1. 启动包含临时 instrumentation 的 app-server / GUI。
2. 打开旧 LAN URL。
3. 保持浏览器实时打开，确认 final assistant message 曾通过 subscription 出现。
4. 刷新页面或用旧 URL 新开浏览器，复现 attach snapshot 缺 final/status。
5. 查询 `logs_2.sqlite` 中目标 thread 的 instrumentation 日志。
6. 对齐目标 rollout tail：
   - line 241：final `agent_message`。
   - line 242：assistant final `response_item`。
   - line 244：`task_complete`。

## 判定矩阵

- attach cut cursor `<= 240`：
  - 确认 snapshot 输入已经截断在 final 前。
  - 下一步看 listener baseline 和 `set_history_cursor` 是否解释该 cursor。
- listener baseline `<= 240`，且 `set_history_cursor` old/new 出现大到小：
  - cursor 回退假设获得运行时证据。
- event cursor 曾推进到 `244`，随后 `set_history_cursor` 写回较小值：
  - 优先排查 listener 重建 baseline 覆盖或旧 listener 写回。
- attach cut cursor `244`，但 snapshot 仍缺 final/status：
  - 当前 cursor 假设被削弱，回到 `reconstruct_thread_turns_for_turns_list` / reconstruction 输入输出继续查。
- listener match 始终 true，且无 cursor 回退：
  - 重建覆盖假设被削弱，转向 event path 未推进、generation/capture 时序或 projection notification 写入路径。

## 非目标

- 不修复 cursor 回退。
- 不添加单调递增保护。
- 不改变 `listener_matches` 的业务语义。
- 不改变 rollout 持久化策略。
- 不从 assistant `response_item` 或 `task_complete.last_agent_message` 合成 final item。
- 不新增前端 Redux / browser 日志。
- 不记录完整 final message 文本。

## 风险

- 临时日志过多会增加噪声。通过只记录目标字段和可搜索 event 名称控制范围。
- `set_history_cursor` 集中点没有调用来源。第一版靠时间相邻日志关联；如果不够，再补 callsite source。
- listener match 分解可能需要新增内部 inspection helper。helper 必须只读，不改变状态。
- 如果复现依赖旧 URL 和当前内存态，重启服务可能改变复现条件；执行前需要保留旧 URL 和目标 rollout 信息。

## 后续处理

验证完成后有两条路径：

- 如果确认 cursor 回退，另起修复设计，讨论是否让 projection cursor 单调递增、是否给 listener generation 加写入保护、以及 baseline 应如何与 rollout tail 对齐。
- 如果未确认 cursor 回退，保留 instrumentation 结果，继续排查 event path、generation/capture 时序或 reconstruction 输入输出。

临时 instrumentation 不应长期保留在最终修复中，除非后续明确设计为低噪声诊断日志。
