# 手机访问 Codex GUI 时消息显示不完整

## 状态

- 已定位根因，未修复。
- 2026-07-01 最新复现和 instrumentation 证明：刷新或新浏览器 attach 时，后端 snapshot 在重建前已经把已落盘的 final/complete rollout items 截掉，因此前端 Redux 和渲染层只能看到缺失后的 transcript。

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

- `thread/projection/attach` snapshot 会读取完整 rollout history vector，然后执行 `history_items.truncate(cut.history_cursor.item_count())`。
- `cut.history_cursor.item_count()` 来自 live projection cursor 的计数口径；baseline 后新增的 `TurnContext` 等 physical rollout item 不随 `conversation.next_event()` 的 live cursor 推进。
- 因此 cursor-domain count 会被当成完整 physical history vector 的 index 使用，导致 attach snapshot 在重建 turns 前把尾部 final/complete items 截掉。
- 2026-07-01 最新复现 thread `019f1aef-5b84-7cd2-899a-5ae65d9a35c1` 的直接证据：
  - rollout 共 98 个 physical JSONL item。
  - attach cut 日志：`cut_history_cursor_item_count=94`。
  - snapshot truncate 日志：`history_items_before_truncate_count=98`、`history_items_after_truncate_count=94`。
  - dropped 区域包含：`event_msg.agent_message.final_answer,response_item.message.assistant,event_msg.token_count,event_msg.turn_complete`。
  - rollout line 95-98 正是 final agent message、assistant final response item、token count 和 task complete。
  - cursor advance 日志显示 final/complete 相关 events 已从 90 推进到 94；GUI attach 时 listener 匹配且没有 cursor regression。

## 需要补充的信息

- 桌面浏览器和手机浏览器在同一 thread 上看到的 transcript 差异。
- 是否还有除了 final/complete 以外的其他 item 类型会被同一截断口径影响。
- 修复后需要回归验证：手机/桌面旧 URL 刷新、web 输入后刷新、web 与 CLI/TUI 混合输入后刷新。

## 后续建议

- 进入修复设计时，优先让 attach cut 把 cursor-domain count 映射到完整 history vector 的 physical index 后再 truncate，或先过滤到 cursor-domain 序列再 replay turns。
- 不建议优先重定义 projection cursor 为 physical item count；该方向会影响 listener baseline、live append 和 head commit fanout，风险更高。
- 修复前保留当前 instrumentation，直到能用复现 thread 证明 attach snapshot 不再丢弃 final/complete。
