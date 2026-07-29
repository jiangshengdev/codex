# Rust projection streaming semantics 设计

日期: 2026-07-03
状态: 01 设计初稿
范围: `codex-rs/app-server` projection 投递语义与 app-server v2 projection 协议边界

## 目标

本阶段只确认 Rust projection 层是否已经给 GUI 提供足够清晰的流式语义。

设计结论是: Rust projection 现有三段语义基本满足 GUI 后续数据层设计需要。

三段语义为:

- `thread/projection/event` 中的 `itemStarted` 是 turn 内 item 顺序锚点。
- `thread/projection/delta` 是 transient progress，只更新对应 `turnId/itemId` 的临时内容。
- `thread/projection/event` 中的 `itemCompleted` 是最终权威内容和 `phase` 来源。

## 非目标

- 不修改通用 `item/agentMessage/delta`。
- 不给 `AgentMessageDeltaNotification` 增加 `phase`、`final` 或 GUI 专属字段。
- 不把 delta 放进 committed transcript chunk。
- 不把 delta 加入 projection commit chain。
- 不设计 GUI Redux state。
- 不设计 GUI 显示层。
- 不扩展 thinking、tool call、exec output 或其他 streaming 类型。

## 当前 Rust 语义

### projection delivery 已分离 event 与 delta

`ProjectionDeliveryPayload` 当前已经分成:

```rust
Event(Box<ThreadProjectionEventNotification>)
Delta(ThreadProjectionDeltaNotification)
```

这让 Rust 投递层可以明确区分结构性事件和 transient delta。

### structural event 推进 head

`project_structural_event` 为每个结构性 event 生成 `commitId`，调用 `advance_head`，并带上 `parentCommitId`。

结构性 event 包括:

- `turnStarted`
- `turnCompleted`
- `itemStarted`
- `itemCompleted`

这些 event 构成 projection head chain。GUI 后续可以把 `itemStarted` 当作稳定顺序锚点，因为它是结构性 event，而不是 transient delta。

### delta 不推进 head

`project_delta` 只构造 `ThreadProjectionDeltaNotification`，携带:

- `threadId`
- `subscriptionId`
- `delta`

它不生成 `commitId`，不带 `parentCommitId`，也不调用 `advance_head`。

这符合流式文本的 transient 性质。delta 缺失或乱序不能通过 head chain 修复，最终必须由 `itemCompleted` 收敛。

### completed item 携带最终内容和 phase

`ThreadItem::AgentMessage` 包含:

- `id`
- `text`
- `phase`
- `memoryCitation`

因此 `phase` 的来源是 completed item，不是 delta。GUI 后续不能从 delta 推断最终消息、commentary/final answer 或折叠语义。

## 与 TUI 的关系

TUI 可以证明两个协议事实:

- delta 是临时进度。
- phase 来自 completed item。

但 TUI 的状态模型不适合直接复制到 GUI。

TUI 使用的是:

```text
history cells + active tool/command cell + one current assistant stream controller
```

`item/agentMessage/delta` 到达后，TUI 只取 `delta` 文本进入当前 stream controller。TUI 不用 agent message 的 `itemStarted` 建 slot，也不使用 delta 的 `turnId/itemId` 做 per-item 定位。

GUI 需要的是:

```text
turn timeline + itemStarted slot + delta update slot + itemCompleted settle slot
```

原因是 GUI 需要支持 Redux state、selector cache、chunk-level 渲染、projection subscription、snapshot/reconnect 和 completed 后权威内容收敛。它不能只用一个当前 stream controller 表达所有 live item。

因此 01 只吸收 TUI 的协议语义，不复制 TUI 的状态模型。

## GUI 后续可依赖的不变量

### 顺序

GUI 后续数据层应把 `itemStarted` 作为 turn 内 item slot 的创建和排序事件。

`delta` 和 `itemCompleted` 必须更新同一个 slot，不能改变 slot 的位置。

### 临时内容

`thread/projection/delta` 只能更新 live 临时文本。

它不进入 committed transcript，不产生 committed entry，不改变 projection `headCommitId`。

### 权威完成

`itemCompleted(agentMessage)` 到达后，GUI 应以 completed item 的 `text` 和 `phase` 为权威状态。

如果 completed 内容与 delta 累积内容不同，GUI 后续数据层必须以 completed 内容收敛。

### subscription

GUI 必须按 `subscriptionId` 过滤 projection delta。stale subscription 的 delta 应被忽略。

### item 定位

GUI 后续数据层应使用 delta 内部的 `turnId + itemId` 定位 live item slot。

这不同于 TUI 的单 current stream controller，也避免多个 live item 或 reconnect 场景下的隐式状态错误。

## Rust 是否需要改动

当前设计判断: 不需要新增 Rust 协议字段，也不需要修改通用接口。

可选的 Rust 改动只有两类:

- 补一条非常窄的测试，明确 `itemStarted -> delta -> itemCompleted` 的 projection 顺序和 head chain 关系。
- 补 README 或协议注释，明确 GUI projection consumer 应以 completed item 为权威内容和 phase 来源。

如果后续 `02 GUI live item 数据层设计` 发现 Rust 语义仍有缺口，缺口只能在 projection 新接口或 GUI projection 边界补齐，不能回头修改通用 `item/agentMessage/delta`。

## 证据入口

- `codex-rs/app-server/src/thread_projection.rs`
  - `ProjectionDeliveryPayload` 区分 `Event` 与 `Delta`。
  - `project_structural_event` 推进 `headCommitId`。
  - `project_delta` 不推进 `headCommitId`。
  - `projection_event_from_notification` 把 `ItemStarted` 和 `ItemCompleted` 映射为 structural event。
  - `projection_delta_from_notification` 把 `AgentMessageDelta` 映射为 projection delta。
- `codex-rs/app-server-protocol/src/protocol/v2/thread_projection.rs`
  - `ThreadProjectionDeltaNotification` 不含 `commitId` / `parentCommitId`。
  - `ThreadProjectionEvent` 包含 `itemStarted` / `itemCompleted`。
  - `ThreadProjectionDelta` 当前只有 `agentMessage`。
- `codex-rs/app-server-protocol/src/protocol/v2/item.rs`
  - `ThreadItem::AgentMessage` 包含 `phase`。
- `codex-rs/tui/src/chatwidget`
  - TUI delta 只进入 stream controller。
  - TUI agent message phase 来自 completed item。
  - TUI 不为 agent `itemStarted` 建 per-item slot。

## 下一阶段边界

`02 GUI live item 数据层设计` 才讨论:

- live item slot 放在哪个 GUI state slice。
- `itemStarted` 如何进入 renderable state。
- `delta` 如何更新 slot 临时文本。
- `itemCompleted` 如何绑定或替换 committed entry。
- snapshot/reconnect 如何重建或收敛 live timeline。

01 不提前决定这些 GUI 数据结构。
