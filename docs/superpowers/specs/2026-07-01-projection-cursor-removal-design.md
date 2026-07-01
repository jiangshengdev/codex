# Projection cursor removal 设计

## 背景

当前 `thread/projection/attach` 的 snapshot 会通过 `ProjectionHistoryCursor` 截断 persisted history：

- listener 启动和处理 event 时维护一个 `usize` cursor。
- projection attach 捕获 `ProjectionSnapshotCut { generation, headCommitId, historyCursor }`。
- snapshot 读取执行 `history_items.truncate(cut.history_cursor.item_count())`。

这个机制原本用于避免一个 hidden race：core 先 persist event，再 deliver 给 app-server listener；如果 attach 在 listener 处理该 event 前发生，snapshot 可能读到 listener 尚未投影的 persisted item，而 `headCommitId` 仍停在旧 commit。

但目前证据显示：

- 这个 hidden race 只有代码级可构造和测试级构造，没有真实运行复现证据。
- cursor 自身造成的 physical/domain 截断问题已经真实复现：已持久化的 final / complete 会从 attach snapshot 里被截掉。
- 这种失败会让刷新后的历史状态错误，比偶发重复渲染更严重。

本设计替代并废弃 `2026-07-01-projection-snapshot-physical-boundary-design.md` 的大重构方向。新的目标是移除 cursor 的生产职责，而不是把 cursor 升级为跨 store/core/protocol/app-server 的 physical boundary。

## 决策

采用“移除 `ProjectionHistoryCursor` 生产职责”的方案。

具体决策：

- `ProjectionSnapshotCut` 只表达 projection attach 所需的 `generation` 和 `headCommitId`。
- attach snapshot 读取完整 persisted history，不再用 cursor 截断。
- 保留 projection commit chain：后续 live projection event 仍通过 `parentCommitId` / `commitId` 推进客户端 head。
- 保留 generation gate，避免 stale attach。
- 保留 projection subscriber attach、detach、fanout、backpressure 机制。
- 不做前端重复去重，不做自动修复。
- 若 snapshot 偶尔 ahead 于 projection head，接受其作为临时可观察状态；如果真实出现重复显示，再单独做窄范围 UI 或 ingress 处理。

## 范围

本次应移除 app-server 内 cursor plumbing：

- 删除 `ProjectionHistoryCursor` 类型。
- 删除 `ProjectionSnapshotCut.history_cursor`。
- 删除 `ThreadEntry.history_cursor`。
- 删除 listener 中用于 projection snapshot 的 persisted item count 估算与推进。
- 删除 `ThreadProjectionManager::set_history_cursor`。
- 删除 `project_notification_at_cursor` 的 cursor 参数，或将其合并回普通 `project_notification` 语义。
- 删除 `ThreadScopedOutgoingMessageSender::with_projection_history_cursor` 中的 cursor 传递。
- 删除 `ProjectionFanout` 对 cursor 参数的处理。

不在本次范围内：

- 不修改 core persistence / delivery 顺序。
- 不修改 app-server protocol 字段。
- 不重构 thread store append API。
- 不实现前端全局幂等。
- 不增加自动 reconnect 或自动 repair。

## 行为语义

attach 的语义改为：

1. 请求仍进入 per-thread listener command queue。
2. listener 内捕获当前 projection generation 和 head commit。
3. snapshot 从 persisted history 重建完整 thread turns。
4. subscriber 在同一 listener ordering 下 attach。
5. response 返回 snapshot 和捕获到的 `headCommitId`。

如果 persisted history 已经包含 listener 尚未投影的 item，snapshot 可以包含该 item，而 `headCommitId` 仍保持旧 head。后续 listener 处理该 event 时，live projection event 会以旧 head 为 parent 推进 commit chain。

这是有意的取舍：不再为了避免未证实的 snapshot-ahead 重复风险，而裁掉已持久化历史。

## 测试设计

测试覆盖两类行为。

第一类是新语义表征：

- 改写旧的 `attach_snapshot_cut_excludes_persisted_event_not_processed_by_projection`。
- 新断言应表达：attach snapshot 可以包含 listener 尚未投影的 persisted history。
- `snapshot.headCommitId` 仍保持旧 projection head。
- 测试名称应体现新语义，而不是“排除 cursor 后历史”。

第二类是 final 丢失回归：

- 构造 persisted history 中存在 physical-only / non-projectable item，并让它出现在 final / complete 前。
- attach snapshot 必须保留 final / complete。
- 断言刷新后的 reconstructed turns 不会因为旧 cursor/domain count 与 physical history 不一致而丢失 final。

需要同步调整或删除保护旧语义的测试：

- `projection_snapshot_at_cut_excludes_history_after_cursor`
- `attach_snapshot_cut_excludes_persisted_event_not_processed_by_projection`
- `capture_snapshot_cut_returns_head_and_cursor_together`
- `non_projected_persisted_event_advances_cursor_without_head`

这些测试不应以 ignored 形式保留，因为它们表达的是已废弃的 correctness model。

## 风险

主要风险是 snapshot ahead 后，同语义 live projection event 随后到达，可能造成 UI 重复或短暂状态跳跃。

接受该风险的原因：

- 原始 hidden race 没有真实运行复现证据。
- 重复显示通常是可观察、可局部兜底的 UI 问题。
- 当前 cursor 截断已经造成真实的历史可见性错误。
- 彻底修正 cursor 为 physical boundary 会扩大到多 crate 大重构，不符合当前问题的风险收益。

若后续确实观察到重复，应优先做窄范围表征和修复：

- 记录 attach snapshot 尾部语义 item、`headCommitId`、后续 projection event 的 `parentCommitId` / `commitId`。
- 只在确认重复发生后，考虑 frontend ingress 或 transcript 层按 turn/item id 做幂等。

## 验证

实现后至少从仓库根目录运行：

- `just test -p codex-app-server thread_projection`
- `just fmt`
- `just fix -p codex-app-server`
- `git diff --check`

如果改动触及共享 app-server projection fanout 行为，可补跑相关 app-server focused tests。
