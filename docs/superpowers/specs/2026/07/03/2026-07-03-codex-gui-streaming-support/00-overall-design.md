# Codex GUI streaming support 总设计

日期: 2026-07-03
状态: 00 总设计初稿
范围: Rust projection 投递语义、GUI live 数据层、最小显示层、后续流式类型扩展

## 目标

流式支持不能作为一个大功能一次设计。它需要拆成多个可以独立讨论、验证和落地的设计。

本总设计只定义拆分边界和跨阶段不变量。后续 `01` 到 `04` 每个设计都必须保持自己的目标足够小，不能把相邻阶段的实现内容提前合并。

总目标是让 GUI 能在 projection 订阅下显示 assistant 实时文本，同时保持 committed transcript 的权威性和性能边界。

## 最高约束

- 不修改通用 `item/agentMessage/delta` 接口。
- 不把 phase、final 标记或 GUI 专属字段塞进通用 delta。
- 不把 delta 放入 committed transcript chunk。
- 不让 transient delta 推进 projection `headCommitId`。
- 不让显示层决定协议顺序。
- 不在 hot path flatten 整个 transcript。
- 最终权威文本来自 `itemCompleted(agentMessage)` 或 snapshot 中的 completed item。

## 分阶段设计

### 00 总设计

当前文件。

职责:

- 定义总目标和禁止事项。
- 将流式支持拆成 `01` 到 `04`。
- 固定跨阶段不变量，避免后续设计互相越界。

不负责:

- 不规定 Rust 具体 patch。
- 不规定 GUI Redux state 最终字段名。
- 不规定 Streamdown 渲染细节。
- 不规定 thinking、tool call、exec output 的完整体验。

### 01 Rust projection 投递语义设计

目标: 只确认或补齐 Rust projection 层给 GUI 的可消费事件语义。

核心问题:

- `itemStarted` 是否足以作为 turn 内 item 顺序锚点。
- `thread/projection/delta` 是否只作为 transient progress 投递。
- `itemCompleted` 是否作为最终权威内容和 phase 入口。
- 同一 projection subscription 内，结构性 event 与 delta 的出站顺序需要满足什么最低保证。

边界:

- 不改通用 `AgentMessageDeltaNotification`。
- 不设计 GUI state。
- 不设计显示样式。
- 不支持更多 delta 类型。

预期产物:

- 一份 `01-rust-projection-semantics-design.md`。
- 明确 Rust 是否需要改动，以及如果需要，改动只属于 projection 新接口或 GUI projection 边界。

### 02 GUI live item 数据层设计

目标: 让 GUI 数据层能够表达 started、streaming、completed 三种状态，并保持 turn 内显示顺序。

核心问题:

- `itemStarted` 如何进入 renderable state，但不进入 committed chunks。
- live item slot 如何绑定 `turnId`、`itemId`、item type、状态、临时文本和 completed 后的 committed entry。
- `delta` 如何只更新对应 slot 的临时文本。
- `itemCompleted` 如何完成同一个 slot，而不是按 completed 到达顺序重新排序。
- attach、reconnect、snapshot 和 live event 如何收敛到同一数据模型。

边界:

- 不做视觉渲染。
- 不改变 committed transcript chunk 的权威内容模型。
- 不把 streaming text materialize 成 committed entry。
- 不扩大到 thinking 或工具输出的显示策略。

预期产物:

- 一份 `02-gui-live-item-data-design.md`。
- 明确 live state 与现有 `transcriptState`、`threadRuntime`、projection ingress 的职责边界。

### 03 最小 assistant 文本显示设计

目标: 基于 `02` 的 live item 数据层，只显示 assistant text streaming。

核心问题:

- started slot 在 UI 上如何占位。
- delta 到达时如何更新 Streamdown 输入。
- completed 后如何切换到 committed 权威内容。
- 如何保持 chunk-level 渲染边界和 sticky-bottom 行为。
- 如何避免临时文本更新导致整个 transcript 重渲染。

边界:

- 不设计 thinking 展示。
- 不设计 tool call、exec output、MCP progress。
- 不设计复杂折叠和动画。
- 不改变 Markdown committed rendering 的既有边界。

预期产物:

- 一份 `03-assistant-text-streaming-display-design.md`。
- 明确最小可验收体验和浏览器验证范围。

### 04 扩展流式 item 类型设计

目标: 在 `01` 到 `03` 稳定后，再评估 thinking、tool call、exec running、command output、error recovery 等扩展。

核心问题:

- 哪些 item 类型需要 started slot。
- 哪些内容可以 transient streaming，哪些必须只等 completed。
- thinking 与最终 answer 的 phase 关系如何表达。
- 长时间运行命令与后续已完成消息如何共享同一个 turn timeline。
- reconnect 后哪些 live 状态可以恢复，哪些只能等待 completed 收敛。

边界:

- 不重新设计 `01` 的投递语义。
- 不重新设计 `02` 的 turn timeline 模型。
- 不把所有扩展一次性做进最小 assistant 文本流。

预期产物:

- 一份 `04-extended-streaming-items-design.md`。
- 明确扩展顺序和每类 item 的最小协议、数据层、显示层需求。

## 跨阶段不变量

### 顺序不变量

turn 内显示顺序由 `itemStarted` 决定。后续 `delta` 和 `itemCompleted` 只能更新同一个 item slot，不能改变 slot 的位置。

这个不变量用于处理以下情况:

- 前一个命令仍在执行。
- 后一个 assistant message 已经 completed。
- UI 仍必须按 item started 顺序显示，而不是按 completed 到达顺序显示。

### 权威内容不变量

delta 永远是 transient progress。最终文本、phase 和 completed 状态以 `itemCompleted` 为权威。

如果 live delta 与 completed item 内容不一致，GUI 应以 completed 内容收敛，而不是保留 delta 累积结果作为 committed truth。

### 接口边界不变量

通用 app-server delta 接口保持稳定。GUI 需要的新语义只能放在 projection 新接口、projection 投递语义或 GUI 自己的数据层中。

### 数据层先于显示层

显示层不能直接根据 WebSocket arrival order 自行拼装完整 transcript。必须先有数据层 slot/timeline 语义，再由 UI 消费稳定的 renderable state。

### committed transcript 边界

committed chunks 只保存已完成、权威、可回放的 transcript entry。live streaming 内容属于 live state，不属于 committed chunks。

## 推荐推进顺序

先讨论并完成 `01 Rust projection 投递语义设计`。

理由:

- 它是最小的边界。
- 它决定 GUI 能否不猜协议。
- 它可以独立验证 projection event、delta、completed 的关系。
- 它不会提前牵动前端状态结构和显示细节。

只有 `01` 明确后，才进入 `02`。如果 `01` 发现 Rust projection 已经满足需求，`02` 可以只消费现有语义；如果 `01` 发现缺口，必须先在 projection 新接口或 GUI projection 边界补齐，不能让 GUI 数据层弥补协议歧义。

## 当前已知判断

- 已有 `thread/projection/delta` 用于 projection-local transient assistant message delta。
- `thread/projection/event` 仍是结构性 projection event。
- `itemStarted` 和 `itemCompleted` 属于结构性 event。
- `delta` 不应进入 commit chain，也不应推进 `headCommitId`。
- TUI 的 phase 来源是 completed item，不是 delta。
- GUI 当前 committed transcript 主要由 completed item materialize，`itemStarted` 还没有进入 renderable transcript state。

这些判断只是 `00` 的输入背景。`01` 需要重新用代码证据确认 Rust 当前是否满足目标语义。

## 非目标

- 不在 `00` 中写 implementation plan。
- 不在 `00` 中指定测试命令。
- 不在 `00` 中确定 Redux 字段名。
- 不在 `00` 中确定 UI 组件结构。
- 不在 `00` 中解决所有流式类型。

## 下一步

下一步只讨论 `01 Rust projection 投递语义设计`。

`01` 的讨论问题应保持单一: Rust projection 当前是否已经能表达 `itemStarted` 决定顺序、delta transient 更新、`itemCompleted` 权威收敛。如果不能，只讨论 projection 新接口或 GUI projection 边界需要补的最小语义。
