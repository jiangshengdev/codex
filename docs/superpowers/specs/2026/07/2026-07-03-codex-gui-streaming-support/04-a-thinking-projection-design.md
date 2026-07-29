# Thinking projection streaming 设计

日期: 2026-07-06
状态: 正式设计
范围: Rust projection 对 thinking/reasoning live stream 的数据契约

## 背景

当前 Rust projection 已经为 agent message 打通了 projection-local delta:

- `thread/projection/event` 承载结构性 lifecycle event。
- `thread/projection/delta` 承载 transient progress。
- agent message 的 `itemStarted -> delta -> itemCompleted` 已有 Rust 集成测试证明。

本设计定义 thinking/reasoning 作为 `04 扩展流式 item 类型设计` 的第一个子集如何进入 Rust projection。它只收敛 Rust 侧 projection 数据契约，不进入 GUI 显示策略、Redux 字段设计或实施计划。

## 既有设计边界

本项属于 `04 扩展流式 item 类型设计` 中的 thinking 子集，不重新设计 `01` 或 `02`。

必须沿用既有不变量:

- turn 内顺序由 `itemStarted` 决定。
- delta 只表示 transient progress。
- `itemCompleted` 是最终权威内容。
- delta 不进入 projection commit chain，不推进 `headCommitId`。
- 通用 app-server delta 接口保持稳定。
- GUI 需要的新语义只能放在 projection 新接口、projection 投递语义或 GUI 数据层中。
- 数据层先于显示层；本设计不设计 thinking 的具体 UI 展示。

## 设计决策

### 范围

本轮只放开 thinking/reasoning，不合并 plan、command output、tool call streaming。

理由:

- 当前需求是“再添加放开思考”。
- `04` 虽然包含多种扩展 item，但既有总设计要求不要把所有扩展一次性做进最小 assistant 文本流。
- thinking/reasoning 已经有完整普通 notification 基础，适合作为 `04` 的第一个子集。

### lifecycle event

reasoning 的结构性 lifecycle event 复用现有 projection event:

```text
thread/projection/event(ItemStarted { item: ThreadItem::Reasoning })
thread/projection/event(ItemCompleted { item: ThreadItem::Reasoning })
```

不新增 `ReasoningStarted` / `ReasoningCompleted`。

理由:

- `ItemStarted` / `ItemCompleted` 已经是 projection 的结构性 lifecycle event。
- thinking 的顺序锚点与最终收敛语义和 agent message 一致。
- 专用 reasoning event 会重复表达 item lifecycle，并扩大协议表面。

设计要求:

- Rust projection 必须显式覆盖 `ThreadItem::Reasoning` 的 `ItemStarted` / `ItemCompleted` 投递。
- 测试和 fixture 不能只隐含依赖通用路径，必须证明 reasoning lifecycle event 会到达 projection subscriber。

### transient delta

在 `ThreadProjectionDelta` 中新增三个独立 reasoning delta 分支，分别包装现有 reasoning notification:

```text
ThreadProjectionDelta::ReasoningSummaryText {
    notification: ReasoningSummaryTextDeltaNotification
}

ThreadProjectionDelta::ReasoningSummaryPartAdded {
    notification: ReasoningSummaryPartAddedNotification
}

ThreadProjectionDelta::ReasoningText {
    notification: ReasoningTextDeltaNotification
}
```

不采用单个统一 `reasoning` 分支再用内部 `kind` 区分。

理由:

- 本项不是设计新的 reasoning payload，而是把已有三种 reasoning delta 放进 projection delta 通道。
- 直接包装现有 notification 可以保持 `item/reasoning/*` 与 `thread/projection/delta` 的数据结构可追踪。
- 避免额外定义 projection-specific payload，减少 Rust/TS wire shape 的重复维护。

## Rust 当前链路

### lifecycle event 现状

Responses reasoning item 当前已经走通用 item lifecycle:

```text
response.output_item.added(reasoning)
  -> ResponseEvent::OutputItemAdded
  -> TurnItem::Reasoning
  -> EventMsg::ItemStarted
  -> ServerNotification::ItemStarted
  -> thread/projection/event(ItemStarted)

response.output_item.done(reasoning)
  -> ResponseEvent::OutputItemDone
  -> TurnItem::Reasoning
  -> EventMsg::ItemCompleted
  -> ServerNotification::ItemCompleted
  -> thread/projection/event(ItemCompleted)
```

`ThreadProjectionEvent` 已经复用通用 `ItemStarted` / `ItemCompleted`，而 `ThreadItem` 已经包含 `Reasoning { id, summary, content }`。

因此 lifecycle 的设计缺口不是新增 reasoning 专用 event 分支，而是补齐 projection 层对 reasoning lifecycle 的显式覆盖和验证。

### transient delta 现状

Responses reasoning streaming 当前已映射为三种普通 app-server notification:

```text
ResponseEvent::ReasoningSummaryDelta
  -> EventMsg::ReasoningContentDelta
  -> ServerNotification::ReasoningSummaryTextDelta
  -> item/reasoning/summaryTextDelta

ResponseEvent::ReasoningSummaryPartAdded
  -> EventMsg::AgentReasoningSectionBreak
  -> ServerNotification::ReasoningSummaryPartAdded
  -> item/reasoning/summaryPartAdded

ResponseEvent::ReasoningContentDelta
  -> EventMsg::ReasoningRawContentDelta
  -> ServerNotification::ReasoningTextDelta
  -> item/reasoning/textDelta
```

当前 projection 缺口明确:

- `ThreadProjectionDelta` 只有 `AgentMessage`。
- `projection_delta_from_notification()` 只包装 `ServerNotification::AgentMessageDelta`。
- 三种 reasoning notification 当前不会进入 `thread/projection/delta`。

## 三种 reasoning delta 的含义

- `ReasoningSummaryTextDelta`: 向 `ThreadItem::Reasoning.summary[summaryIndex]` 追加摘要文本。
- `ReasoningSummaryPartAdded`: 新增一个 summary part，只提供 `summaryIndex` 结构边界。
- `ReasoningTextDelta`: 向 `ThreadItem::Reasoning.content[contentIndex]` 追加 raw/detail reasoning 文本。

数据层完整放开 thinking 时，三种都纳入 projection delta。前端后续可以选择只显示 summary，不显示 raw content；但 Rust projection 的数据契约不裁剪 raw/detail delta。

## Projection 数据流

目标数据流如下:

```text
response.output_item.added(reasoning)
  -> thread/projection/event(ItemStarted { item: ThreadItem::Reasoning })

response.reasoning_summary_text.delta
  -> item/reasoning/summaryTextDelta
  -> thread/projection/delta(ReasoningSummaryText)

response.reasoning_summary_part.added
  -> item/reasoning/summaryPartAdded
  -> thread/projection/delta(ReasoningSummaryPartAdded)

response.reasoning_text.delta
  -> item/reasoning/textDelta
  -> thread/projection/delta(ReasoningText)

response.output_item.done(reasoning)
  -> thread/projection/event(ItemCompleted { item: ThreadItem::Reasoning })
```

顺序语义沿用 `01`:

- `ItemStarted` 决定 turn 内 reasoning item 的位置。
- 三种 reasoning delta 只更新同一个 reasoning item 的 transient live state。
- `ItemCompleted` 携带最终权威 `ThreadItem::Reasoning`。
- 如果 live delta 累积结果与 completed item 不一致，消费者必须以后者收敛。

## 验收要求

正式实现完成后，Rust 侧必须能证明:

- `ThreadItem::Reasoning` 的 `ItemStarted` 会作为 `thread/projection/event` 投递。
- `ThreadItem::Reasoning` 的 `ItemCompleted` 会作为 `thread/projection/event` 投递。
- 三种 reasoning notification 会分别进入 `thread/projection/delta`。
- reasoning delta 不推进 `headCommitId`。
- reasoning delta 不进入 committed transcript materialization。
- GUI host Rust 边界继续按 method 放行 `thread/projection/event` / `thread/projection/delta` / `thread/projection/closed`，无需解析新增 payload。

## 非目标

- 不修改通用 `item/reasoning/*` notification shape。
- 不修改 `ThreadHistoryBuilder` 的 rollout replay/materialization 语义。
- 不设计 GUI Redux 字段名。
- 不设计 thinking 的视觉呈现、折叠方式或 raw/detail 开关。
- 不把 plan、command output、tool call streaming 合并到本轮。
- 不让 reasoning delta 推进 projection `headCommitId`。
- 不把 reasoning delta materialize 进 committed transcript。

## 证据入口

- `codex-rs/core/src/session/turn.rs`
  - `OutputItemAdded` 对 reasoning item 发 `ItemStarted`。
  - `ReasoningSummaryDelta` / `ReasoningSummaryPartAdded` / `ReasoningContentDelta` 发三种 core reasoning delta event。
- `codex-rs/core/src/stream_events_utils.rs`
  - `OutputItemDone` 对 reasoning item 发 `ItemCompleted`。
- `codex-rs/core/src/event_mapping.rs`
  - `ResponseItem::Reasoning` 转 `TurnItem::Reasoning`。
- `codex-rs/app-server-protocol/src/protocol/event_mapping.rs`
  - core reasoning delta event 转三种 app-server reasoning notification。
  - `ItemStarted` / `ItemCompleted` 转通用 item notification。
- `codex-rs/app-server-protocol/src/protocol/v2/item.rs`
  - `ThreadItem::Reasoning { id, summary, content }` 已存在。
  - `ReasoningSummaryTextDeltaNotification`、`ReasoningSummaryPartAddedNotification`、`ReasoningTextDeltaNotification` 已存在。
- `codex-rs/app-server-protocol/src/protocol/v2/thread_projection.rs`
  - `ThreadProjectionEvent` 已包含 `ItemStarted` / `ItemCompleted`。
  - `ThreadProjectionDelta` 当前只有 `AgentMessage`。
- `codex-rs/app-server/src/thread_projection.rs`
  - `projection_event_from_notification()` 已包装通用 item lifecycle。
  - `projection_delta_from_notification()` 当前只包装 agent message delta。
- `codex-rs/gui-host/src/filter.rs`
  - GUI host Rust 边界只按 method 放行 `thread/projection/event` / `thread/projection/delta` / `thread/projection/closed`。
