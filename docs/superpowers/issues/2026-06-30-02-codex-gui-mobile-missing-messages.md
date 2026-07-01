# 手机访问 Codex GUI 时消息显示不完整

## 状态

- 已定位根因；当前代码静态评估显示该根因已修复，仍需真实移动端/桌面回归验证。
- 2026-07-01 复现和 instrumentation 曾证明：刷新或新浏览器 attach 时，后端 snapshot 在重建前已经把已落盘的 final/complete rollout items 截掉，因此前端 Redux 和渲染层只能看到缺失后的 transcript。
- 当前 `dev` 分支评估结论：`ProjectionSnapshotCut` 已不再携带 projection history cursor/item count；`thread/projection/attach` snapshot 现在通过 `load_thread_turns_list_history` 读取完整 persisted history 后重建 turns，并已有 `projection_snapshot_preserves_final_after_physical_only_history_item` 回归测试覆盖 physical-only history item 后 final answer 不丢失。

## 现象

用户反馈：手机访问当前 Codex GUI 时会缺消息，表现为 web 端看到的消息内容不完整或与预期不一致。

## 已确认事实

- 问题发生在手机访问 GUI 的场景。
- 已确认缺失对象至少包括最终 assistant message 和对应 completed 状态。
- 实时打开的浏览器可以通过 subscription 收到 final assistant message；刷新页面或用旧 URL 重新打开后，会通过 `thread/projection/attach` snapshot 恢复，并可能变成缺 final message、turn 状态回到 `interrupted`。
- WebSocket 捕获已确认：缺失发生在后端 `thread/projection/attach` response payload 中，不是前端 `rebuildFromSnapshot`、Redux reducer 或 DOM 渲染丢失。
- 磁盘 rollout 已包含目标 final assistant message 和 `task_complete`，因此不是 final 没有落盘。
- 复现不一定稳定，但目前关键触发特征是跨输入入口混合操作：例如先在 web GUI composer 输入并等待回复，再在 CLI/TUI 侧继续输入，之后刷新 web GUI 更容易触发。纯 CLI/TUI 输入后再打开 GUI 不是等价复现。
- 该问题与中文输入法组合态提前提交是不同问题；两者可以同时影响手机体验，但当前 final message 缺失的已定位根因在 Rust/app-server projection snapshot 路径。

## 根因结论

- 历史根因：`thread/projection/attach` snapshot 会读取完整 rollout history vector，然后执行 `history_items.truncate(cut.history_cursor.item_count())`。
- `cut.history_cursor.item_count()` 来自 live projection cursor 的计数口径；baseline 后新增的 `TurnContext` 等 physical rollout item 不随 `conversation.next_event()` 的 live cursor 推进。
- 因此 cursor-domain count 会被当成完整 physical history vector 的 index 使用，导致 attach snapshot 在重建 turns 前把尾部 final/complete items 截掉。
- 当前代码状态：该截断路径已不存在。`ProjectionSnapshotCut` 只保留 generation 和 head commit；attach snapshot 读取完整 history items，并复用 canonical turns reconstruction 路径。
- 2026-07-01 最新复现 thread `019f1aef-5b84-7cd2-899a-5ae65d9a35c1` 的直接证据：
  - rollout 共 98 个 physical JSONL item。
  - attach cut 日志：`cut_history_cursor_item_count=94`。
  - snapshot truncate 日志：`history_items_before_truncate_count=98`、`history_items_after_truncate_count=94`。
  - dropped 区域包含：`event_msg.agent_message.final_answer,response_item.message.assistant,event_msg.token_count,event_msg.turn_complete`。
  - rollout line 95-98 正是 final agent message、assistant final response item、token count 和 task complete。
  - cursor advance 日志显示 final/complete 相关 events 已从 90 推进到 94；GUI attach 时 listener 匹配且没有 cursor regression。

## 需要补充的信息

- 真实运行时回归验证：桌面浏览器和手机浏览器在同一 thread 上刷新旧 URL 后，`thread/projection/attach` payload、Redux transcript state、DOM 消息数量和文本是否一致。
- 是否还有除了 final/complete 以外的其他 item 类型曾被同一历史截断口径影响，并需要独立回归样例。
- 手机/桌面旧 URL 刷新、web 输入后刷新、web 与 CLI/TUI 混合输入后刷新这三类场景的结果记录。

## 后续建议

- 不再按历史方案继续设计 `history_cursor.item_count()` 映射修复；当前代码已移除这条截断路径。
- 下一步优先做只读回归：同一固定 thread 分别用桌面和移动端视口刷新旧 URL，抓取 `thread/projection/attach` response、Redux transcript state 和 committed transcript DOM。
- 如果 payload 已一致但 DOM 不一致，再回到 `codex-gui` 渲染层排查；如果 payload 仍缺失，则重新定位当前 app-server snapshot 生成路径。
