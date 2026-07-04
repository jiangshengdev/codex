# TUI GUI Boundary

后续任务填充 TUI GUI boundary 性能检测结果。

## GUI launch boundary

状态：无明显风险

结论：`/gui` 在 TUI 侧只经过 slash command 分发、`AppCommand::LaunchGui` 路由、一次 `app_server.launch_gui_for_thread(thread_id).await`，然后把返回的 GUI URL 列表格式化为历史输出。当前检查未发现 TUI 侧通用渲染性能路径、循环轮询、缓存堆积或跨 GUI 前端的额外工作；相对 `rust-v0.142.0`，这条边界是当前 dev 新增，但未发现可归因到该新增路径的明显性能风险。

规模变量：`n = urls.entries.len()`，`L = label/url` 字符串总长度。命令分发、`AppCommand` 构造和 thread routing 为常数成本；成功输出格式化先扫描一次 label 最大宽度，再遍历 entries 生成 `n + 1` 行，时间复杂度为 `O(n + L)`，输出空间为 `O(n + L)`。每次 `/gui` 会追加一次历史输出块；本次只在 TUI 边界内看到按返回 URL 条目线性增长，没有发现 TUI 自身的无界后台增长。

关键证据：

- `codex-rs/tui/src/slash_command.rs:52` 新增 `SlashCommand::Gui`，`codex-rs/tui/src/slash_command.rs:108` 仅提供命令描述，`codex-rs/tui/src/slash_command.rs:224` 将其列为会话内可用命令。
- `codex-rs/tui/src/chatwidget/slash_dispatch.rs:451` 到 `codex-rs/tui/src/chatwidget/slash_dispatch.rs:453` 将 `/gui` 转为 `self.submit_op(AppCommand::launch_gui())`；`codex-rs/tui/src/chatwidget/slash_dispatch.rs:1041` 到 `codex-rs/tui/src/chatwidget/slash_dispatch.rs:1050` 说明 queued command drain 只把它当作普通可继续 drain 的命令类型处理。
- `codex-rs/tui/src/app_command.rs:92` 定义 `LaunchGui`，`codex-rs/tui/src/app_command.rs:251` 到 `codex-rs/tui/src/app_command.rs:252` 只是返回枚举值，常数成本。
- `codex-rs/tui/src/app/thread_routing.rs:683` 到 `codex-rs/tui/src/app/thread_routing.rs:685` 将 `LaunchGui` 路由到 `launch_gui_for_primary_thread(app_server).await` 后返回 `Ok(true)`，未见额外循环或 fanout。
- `codex-rs/tui/src/app/gui.rs:11` 到 `codex-rs/tui/src/app/gui.rs:23` 的 `gui_launch_success_lines` 对 `urls.entries` 做两次线性遍历并生成输出行；`codex-rs/tui/src/app/gui.rs:35` 到 `codex-rs/tui/src/app/gui.rs:51` 先校验 primary thread，再调用 `launch_gui_for_thread`，成功时追加 `GUI URLs:` 输出，失败时追加错误消息。
- 本地 `git diff --stat rust-v0.142.0 --` 显示上述 5 个文件相对 tag 共新增 183 行，其中 `codex-rs/tui/src/app/gui.rs` 为新文件，说明 `/gui` TUI launch boundary 可归因到当前 dev 新增；但风险判断仍基于当前文件内可见成本。

已排除项：

- 未分析 `codex-gui/**`、GUI host、WebSocket bridge、静态资源服务或 app-server 内部 URL 构造成本。
- 未分析 TUI 通用渲染、scrollback、history 存储压缩或 snapshot 输出。
- 未运行测试、snapshot、benchmark、schema 生成、格式化或安装命令。

风险/下一步：TUI helper 对 `urls.entries` 和字符串长度没有本地 hard cap；如果上游将来返回异常大量 URL 或超长 URL，历史输出会按 `O(n + L)` 增长。当前边界预期 URL 条目数量很小，建议仅在后续需要更严格防御时，为 app-server 返回条目数量/长度约束或 TUI 回归覆盖补证据。

## Projection routing boundary

状态：无明显风险

结论：限定范围内，`ThreadProjectionEvent`、`ThreadProjectionDelta`、`ThreadProjectionClosed` 被 TUI app-server 事件目标归类为 `Global`，不是 thread-scoped notification；即使后续误入 `ChatWidget::handle_server_notification`，对应分支也是空操作。当前检查未发现 projection 通知进入 TUI 展示热路径、active thread buffer、thread snapshot replay 或 chatwidget delta 渲染状态。相对 `rust-v0.142.0`，projection 边界可归因到当前 dev 新增的 3 个 target arm 和 3 个 chatwidget 空处理 arm；`app_server_session.rs` 与 `thread_routing.rs` 在本次限定范围内只显示 GUI launch 相关新增，未发现 projection 专用入口。

规模变量：`p = projection notification` 数量，`s = 单条 projection payload` 大小。`server_notification_thread_target` 对单条 notification 只做枚举匹配，projection 三类直接返回 `None` 后落到 `Global`，单条成本 `O(1)`，不解析 payload，不按 thread 数量 fanout，也不创建/扩展 `ThreadEventChannel` 或 `ThreadEventStore`。若 projection notification 被错误送入 chatwidget，匹配到空 arm 后也是单条 `O(1)` 常数成本；限定文件内未见随 `p` 无界累积的 TUI 展示状态。

关键证据：

- `codex-rs/tui/src/app/app_server_event_targets.rs:164` 到 `codex-rs/tui/src/app/app_server_event_targets.rs:185` 将全局/非 thread-scoped 通知合并为 `None`，其中 `ThreadProjectionEvent`、`ThreadProjectionDelta`、`ThreadProjectionClosed` 位于同一组；`codex-rs/tui/src/app/app_server_event_targets.rs:188` 到 `codex-rs/tui/src/app/app_server_event_targets.rs:194` 对 `None` 返回 `ServerNotificationThreadTarget::Global`。
- `codex-rs/tui/src/chatwidget/protocol.rs:191` 到 `codex-rs/tui/src/chatwidget/protocol.rs:228` 对多类非展示通知执行空处理，projection 三类位于该空处理组内，没有调用 `on_agent_message_delta`、`on_plan_delta`、`on_exec_command_output_delta` 或其他展示状态更新。
- `codex-rs/tui/src/app/thread_routing.rs:869` 到 `codex-rs/tui/src/app/thread_routing.rs:927` 是 thread-scoped notification 入队路径，会写入 per-thread store、按 active 状态发送到 active receiver；projection 在 target helper 中被归为 `Global`，因此不应进入该 thread-scoped 路径。
- `codex-rs/tui/src/app/thread_routing.rs:1251` 到 `codex-rs/tui/src/app/thread_routing.rs:1277` 只 drain active thread receiver；`codex-rs/tui/src/app/thread_routing.rs:1431` 到 `codex-rs/tui/src/app/thread_routing.rs:1462` 才把 active thread notification 交给 chatwidget；projection 不归为 thread target，因此不进入这条展示热路径。
- `codex-rs/tui/src/app/thread_routing.rs:1306` 到 `codex-rs/tui/src/app/thread_routing.rs:1341` 的 snapshot replay 只重放 `ThreadEventSnapshot.events`；projection 不进入 thread event store 时不会成为 thread snapshot replay 内容。
- `codex-rs/tui/src/app_server_session.rs` 中 `rg -n -e 'ThreadProjection|projection|Projection'` 无匹配；`codex-rs/tui/src/app_server_session.rs:432` 到 `codex-rs/tui/src/app_server_session.rs:437` 的本地新增入口是 `launch_gui_for_thread`，不是 projection 订阅或展示入口。
- 本地 `git diff --stat rust-v0.142.0 --` 显示限定 4 文件相对 tag 共新增 20 行；`git diff --unified=0 rust-v0.142.0 -- ... | rg -n -e 'ThreadProjection|...'` 显示 projection 相关新增集中在 `app_server_event_targets.rs` 的 3 个 target arm 和 `chatwidget/protocol.rs` 的 3 个空处理 arm。

已排除项：

- 未分析通用 TUI 渲染、ratatui 绘制、scrollback、snapshot accept 或测试输出。
- 未分析 app-server 协议定义、GUI 前端、WebSocket bridge 或 projection payload 生产端。
- 未运行测试、benchmark、schema 生成、snapshot accept、格式化、install，也未访问 git remote。
- `app_server_session.rs` 与 `thread_routing.rs` 中相对 `rust-v0.142.0` 的新增 GUI launch 路径属于 Task 13 边界，本小节不重复归因到 projection。

风险/下一步：限定范围内状态为无明显风险。剩余风险是本次按任务范围未读取全局 notification dispatcher 的最终消费点；如果后续要证明 projection 在全局处理侧也没有积压，应单独检查全局 app-server event 分发处，并补一条回归覆盖，断言 projection notification 不进入 thread event buffer 或 chatwidget 展示状态。
