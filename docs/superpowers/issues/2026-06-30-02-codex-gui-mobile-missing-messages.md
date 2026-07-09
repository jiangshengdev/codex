# 手机访问 Codex GUI 时消息显示不完整

日期: 2026-06-30
状态: 🟡 静态截断路径已移除，仍需真实端回归
范围: Codex GUI / app-server projection snapshot
优先级: 未定

## 摘要

消息缺失根因已定位到 app-server projection attach snapshot 的历史截断口径；当前代码静态评估显示该截断路径已移除，但仍需桌面和移动端真实回归。

## 问题

用户反馈手机访问 Codex GUI 时消息显示不完整。已确认缺失对象至少包括最终 assistant message 和对应 completed 状态；实时浏览器可通过 subscription 收到 final assistant message，但刷新页面或用旧 URL 重新打开后可能通过 `thread/projection/attach` snapshot 恢复成缺 final message、turn 状态回到 `interrupted`。

## 证据

- WebSocket 捕获确认：缺失发生在后端 `thread/projection/attach` response payload 中，不是前端 `rebuildFromSnapshot`、Redux reducer 或 DOM 渲染丢失。
- 磁盘 rollout 已包含目标 final assistant message 和 `task_complete`，因此不是 final 没有落盘。
- 复现不一定稳定，关键触发特征是跨输入入口混合操作，例如先在 web GUI composer 输入并等待回复，再在 CLI/TUI 侧继续输入，之后刷新 web GUI 更容易触发。
- 该问题与中文输入法组合态提前提交是不同问题；当前 final message 缺失的已定位根因在 Rust/app-server projection snapshot 路径。
- 2026-07-01 复现和 instrumentation 曾证明：刷新或新浏览器 attach 时，后端 snapshot 在重建前已经把已落盘的 final/complete rollout items 截掉。
- 最新复现 thread：`019f1aef-5b84-7cd2-899a-5ae65d9a35c1`。
- 该 thread rollout 共 98 个 physical JSONL item。
- attach cut 日志：`cut_history_cursor_item_count=94`。
- snapshot truncate 日志：`history_items_before_truncate_count=98`、`history_items_after_truncate_count=94`。
- dropped 区域包含：`event_msg.agent_message.final_answer,response_item.message.assistant,event_msg.token_count,event_msg.turn_complete`。
- rollout line 95-98 是 final agent message、assistant final response item、token count 和 task complete。
- cursor advance 日志显示 final/complete 相关 events 已从 90 推进到 94；GUI attach 时 listener 匹配且没有 cursor regression。
- 当前 `codex-rs/app-server/src/thread_projection_cut.rs:4` 至 `:7` 显示 `ProjectionSnapshotCut` 只携带 `generation` 和 `head_commit_id`，已不再携带 projection history cursor/item count。
- `codex-rs/app-server/src/thread_projection.rs:295` 至 `:308` 捕获 snapshot cut 时只保存 generation 和 head commit。
- 当前 `thread/projection/attach` snapshot 通过 `codex-rs/app-server/src/request_processors/thread_projection.rs:237` 调用 `load_thread_turns_list_history` 读取 persisted history，并在 `:255` 至 `:260` 用 `reconstruct_thread_turns_for_turns_list` 重建 turns。
- `codex-rs/app-server/src/request_processors/thread_projection.rs:575` 的 `projection_snapshot_preserves_final_after_physical_only_history_item` 回归测试覆盖 physical-only history item 后 final answer 不丢失，`:608` 至 `:624` 断言 snapshot 可保留 final turn。
- `codex-gui/src/features/guiHost/guiHostClient.ts:301` 至 `:303` 在初始化完成后发送 `thread/projection/attach`，`:323` 至 `:326` 在 attach response 合法后进入 attached/commands ready。
- `codex-gui/src/features/appShell/GuiHostConnectionBridge.tsx:91` 至 `:96` 收到 attach accepted 后 dispatch `threadRuntimeAttached`。
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:438` 至 `:460` 的 `rebuildFromSnapshot` 从 snapshot turns 重建 transcript baseline，`:522` 至 `:529` 在 `threadRuntimeAttached` 时调用该路径。

## 判断

部分完成。历史根因对应的 projection snapshot 截断路径静态看已不存在，但尚未记录桌面浏览器和手机浏览器在真实运行时刷新旧 URL 后的 attach payload、Redux transcript state 和 DOM 一致性回归。

## 修复记录

- `ProjectionSnapshotCut` 不再携带 projection history cursor/item count。
- `thread/projection/attach` snapshot 读取完整 persisted history，并复用 canonical turns reconstruction 路径。

## 验证记录

- 静态评估确认旧的 `history_items.truncate(cut.history_cursor.item_count())` 截断路径已移除。
- 已记录回归测试名：`projection_snapshot_preserves_final_after_physical_only_history_item`。
- 当前只读核对确认 GUI attach response 会进入 `threadRuntimeAttached` 并由 `rebuildFromSnapshot` 重建 transcript baseline；尚未做真实浏览器 payload/Redux/DOM 三点对照。

## 影响

修复前，刷新或重新打开旧 URL 后可能缺失 final assistant message 和 completed 状态，导致 GUI transcript 与磁盘 rollout 或实时 subscription 状态不一致。手机场景更容易被用户观察到，但根因位于 app-server projection snapshot。

## 后续处理

做只读回归：同一固定 thread 分别用桌面和移动端视口刷新旧 URL，抓取 `thread/projection/attach` response、Redux transcript state 和 committed transcript DOM。若 payload 已一致但 DOM 不一致，再回到 `codex-gui` 渲染层排查；若 payload 仍缺失，则重新定位当前 app-server snapshot 生成路径。
