# GUI live item 数据层拆分设计

日期: 2026-07-03
状态: 02 拆分设计
范围: Codex GUI live item 数据层的分步实现边界

## 目标

`02` 负责把 GUI live item 数据层拆成多个可独立设计、计划、实现和验证的步骤。

本文件不决定具体 Redux 字段名、state slice 落点或 reducer 代码形状。它只决定 `02` 应该如何拆，以及每一步必须解决什么数据层问题。

`02` 阶段的总体目标是让 GUI 具备表达 live item 生命周期的稳定数据层:

- `itemStarted` 创建 turn 内稳定 live item slot。
- `thread/projection/delta` 更新同一个 live item slot 的 transient progress。
- `itemCompleted` 以权威 completed item 收敛同一个 slot。
- attach、snapshot、reconnect 和 live event 最终收敛到同一条 turn timeline。

## 与 00 和 01 的关系

`00-overall-design.md` 已经定义流式支持的阶段边界和跨阶段不变量。

`01-rust-projection-semantics-design.md` 已经确认 Rust projection 语义:

- `thread/projection/event` 中的 `itemStarted` 是 turn 内 item 顺序锚点。
- `thread/projection/delta` 是 transient progress，不进入 projection commit chain。
- `itemCompleted` 是最终权威内容和 phase 来源。

`02` 只消费这些语义，不重新设计 Rust projection 协议。

## 拆分原则

`02` 不能按协议事件横向拆成 `itemStarted`、delta、completed 等孤立设计。孤立事件设计不能独立实现，会造成只写文档、无法改代码的阶段。

`02` 应按数据层闭环的依赖顺序拆。每个细化设计都必须满足:

- 只覆盖 GUI 数据层，不进入 `03` 的视觉渲染。
- 有明确决策点，而不是只描述一个协议事实。
- 决策完成后能写 implementation plan 并进入代码实现。
- 不扩大到 thinking、tool call、exec output 或其他扩展显示策略。
- 不把 streaming text 写进 committed transcript chunk。

## 02 分步

### 02a: live slot state boundary

目标: 决定 live slot 属于哪个 GUI 数据边界，以及 selector 应该暴露什么稳定数据形状。

必须决策:

- live slot 放在 `threadRuntime`、`transcriptState` 还是新 state 边界。
- slot 如何以 `turnId + itemId` 定位。
- slot 保存哪些协议事实和 transient 字段。
- selector 输出如何表达 started、streaming、completed 三种状态。
- 数据层如何保持 turn 内顺序，但不 materialize committed entry。

不决策:

- 具体视觉组件。
- Streamdown 输入。
- thinking、tool call、exec output 的显示策略。

### 02b: projection ingress to live slot

目标: 决定 projection event 和 projection delta 如何进入 `02a` 定义的数据边界。

必须决策:

- `itemStarted` 如何创建 slot。
- `thread/projection/delta` 如何按 `subscriptionId + turnId + itemId` 更新 slot。
- stale subscription delta 如何忽略。
- 缺失 slot 的 delta 如何处理。
- live delta 为什么不能进入 committed transcript chunk。

不决策:

- completed 后的权威收敛规则。
- reconnect 后的重建策略。

### 02c: completed settlement

目标: 决定 `itemCompleted(agentMessage)` 如何收敛同一个 live slot。

必须决策:

- completed item 如何绑定已有 slot。
- completed `text` 和 `phase` 如何覆盖 transient delta 状态。
- delta 累积文本与 completed 文本不一致时如何收敛。
- slot 与 committed transcript materialization 的边界。
- completed 后 slot 是保留为 settled state、转为 committed 引用，还是清理。

不决策:

- UI 如何切换显示。
- Markdown streaming renderer。

### 02d: attach, snapshot, reconnect and replay convergence

目标: 决定非连续 live event 场景如何收敛到同一数据模型。

必须决策:

- attach snapshot 如何初始化或替换 live timeline。
- replay `itemStarted` 时如何避免重复 slot。
- reconnect 后 transient delta 缺失时如何等待 completed 收敛。
- 已完成 item 如何从 snapshot 或 completed event 进入同一 timeline。
- bounded cleanup 和 revision 更新的最低规则。

不决策:

- 扩展流式 item 类型。
- 复杂错误恢复 UI。

## 跨步骤不变量

### 顺序由 itemStarted 决定

turn 内显示顺序由 `itemStarted` 决定。delta 和 completed 只能更新同一个 slot，不能按到达顺序重新排序。

### Delta 是 transient

`thread/projection/delta` 只表示 live progress。

delta 不进入 committed transcript chunk，不产生 committed entry，不推进 `headCommitId`，也不能作为最终权威内容来源。

### Completed 是权威收敛点

`itemCompleted` 中的 completed item 是最终内容、状态和 phase 的权威来源。

如果 live delta 累积内容与 completed item 不一致，GUI 数据层必须以 completed item 收敛。

### 数据层先于显示层

`02` 只讨论 GUI 数据层，不设计具体视觉呈现。

显示层不能直接根据 WebSocket 到达顺序拼装 transcript。UI 必须消费 `02` 定义出的稳定 live item/timeline state。

### 不扩展显示类型

`02` 的目标是 assistant 文本 streaming 所需的数据层闭环。thinking、tool call、exec output 和其他扩展显示策略属于 `04`，不能提前合并进 `02`。

## 非目标

- 不修改 Rust projection 实现。
- 不修改 app-server v2 协议字段。
- 不重新设计 `thread/projection/delta` wire shape。
- 不在本文件决定具体 Redux 字段名。
- 不设计 Streamdown 或 Markdown streaming renderer。
- 不设计 assistant message、plan、thinking、command output 或 tool progress 的最终 UI。
- 不修改 committed transcript chunk 的权威内容模型。
- 不编写 implementation plan。
- 不指定测试命令。

## 后续推进方式

后续按 `02a` 到 `02d` 顺序推进。每一步都必须单独完成:

- 先说明该步骤要解决的唯一数据层问题。
- 再列出候选方案和取舍。
- 然后确认一个方案。
- 最后落盘对应细化设计文档。

每个步骤的设计被确认后，可以为该步骤编写 implementation plan 并进入代码实现。不需要等全部 `02a` 到 `02d` 设计完成后才开始实现。
