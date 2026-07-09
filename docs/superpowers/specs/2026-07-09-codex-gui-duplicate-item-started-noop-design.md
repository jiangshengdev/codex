# Codex GUI 重复 itemStarted no-op 设计

日期: 2026-07-09
状态: 设计已落盘，待计划
范围: `codex-gui/src/features/transcriptState`

## 背景

`itemStarted` 原本被认为是无可见 transcript 变化的 no-op。后续 live item 数据层落地后，首次
`itemStarted` 已经不再是 no-op: 它会创建 `turnId + item.id` keyed live slot，并作为可渲染
live state 暴露给 UI。

当前残留边界只剩一种情况: 同一个 `turnId + item.id` 的 live slot 已经存在，但又收到另一个不同
`commitId` 的 live `itemStarted`。当前 reducer 会先记录 `appliedEventIdsById` /
`appliedEventOrder`，再发现 live slot 已存在并跳过插入。这不会改变可见 transcript 内容，但会让
`transcriptState` dirty。

## 相关语义

`ProjectionHistoryCursor` 移除后，`attach` snapshot 可以 ahead 于 projection head。后续同语义
projection event 可能以不同 `commitId` 到达，用于推进 commit chain。这个场景已经由
`threadRuntime` 的 `snapshotDuplicate` 分类处理: snapshot 初始内容已有的 item 对应的
`itemStarted` / `itemCompleted` 不会进入 `transcriptState` materialization。

因此本设计不处理 snapshot replay duplicate。它只处理普通 live 流里已经存在 live slot 后又收到
重复 `itemStarted` 的窄边界。

## 决策

重复 live `itemStarted` 采用完全 no-op 语义。

如果 `transcriptState` 已经存在同一个 `turnId + item.id` 的 live slot，后续 live `itemStarted`:

- 不更新已有 live item。
- 不覆盖 `initialItem`。
- 不更新 `status`、`transientText` 或 `revision`。
- 不 bump `liveScrollPulse`。
- 不写入 `appliedEventIdsById` / `appliedEventOrder`。
- 不触发 committed transcript entry、chunk 或 scroll commit key 更新。

`itemStarted` 在 `transcriptState` 中只表示 live slot 的首次创建。已有 slot 后再收到 started，应被
视为幂等重复事件，而不是对已有 live item 的更新事件。

## 边界

处理边界放在 `transcriptState` 内部。

`ProjectionIngressAdapter` 继续只负责 subscription、thread id 和 commit-chain 连续性，不按 UI
item id 做过滤。`threadRuntime` 继续只负责 attach snapshot replay 分类，不新增重复 live started
分类。

`transcriptState` 在处理 live `itemStarted` 时，应在写入 applied event window 之前判断目标 live
slot 是否已存在。若存在，直接返回。

## 非目标

- 不改变 `snapshotDuplicate` 语义。
- 不修改 app-server 或 core 的 `ServerNotification::ItemStarted` 生产路径。
- 不在本轮追查上游为何可能重复发送 started。
- 不实现字段级 merge 或 payload 覆盖。
- 不改变 `itemCompleted` 作为最终权威内容的收敛语义。

## 风险

如果重复 `itemStarted` 的 payload 实际携带了更“新”的 item 字段，本设计会忽略这些字段。这是有意
取舍: started 是生命周期边沿事件，不应与 delta 或 completed 竞争更新职责。

若未来真实观测到重复 started 且 payload 差异有业务含义，应单独排查上游生产链路，而不是让
`transcriptState` 对 started payload 做模糊 merge。

## 验证期望

后续计划应覆盖:

- 首次 `itemStarted` 仍创建 live slot。
- 重复 live `itemStarted` 不改变 live item 列表。
- 重复 live `itemStarted` 不写入 applied event window。
- `snapshotDuplicate` item event 仍直接跳过 transcript materialization。

## Issue 状态更新

本设计落盘时不更新 issue 状态。

对应 issue `docs/superpowers/issues/codex-gui-frontend-performance-hot-paths/03-item-started-dirties-transcript-state.md`
应在后续实施计划执行完成、验证通过后，作为最后一步更新状态和修复记录。
