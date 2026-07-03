# GUI live item 数据层设计入口

日期: 2026-07-03
状态: 02 设计入口初稿
范围: Codex GUI live item 数据层设计拆分入口

## 目标

`02` 不直接完成完整 GUI live item 数据层设计。

本文件只作为 `02` 阶段入口，定义 live item 数据层的总目标、边界、拆分方式和跨细化设计不变量。具体设计决策必须放到后续 `02-*` 细化设计中逐个讨论、确认和落盘。

`02` 阶段的总体目标是让 GUI 具备表达 live item 生命周期的稳定数据层:

- `itemStarted` 创建 turn 内稳定 live item slot。
- `thread/projection/delta` 更新同一个 live item slot 的 transient progress。
- `itemCompleted` 以权威 completed item 收敛同一个 slot。
- snapshot、reconnect 和 live event 最终收敛到同一条 turn timeline。

## 与 00 和 01 的关系

`00-overall-design.md` 已经定义流式支持的阶段边界和跨阶段不变量。

`01-rust-projection-semantics-design.md` 已经确认 Rust projection 语义:

- `thread/projection/event` 中的 `itemStarted` 是 turn 内 item 顺序锚点。
- `thread/projection/delta` 是 transient progress，不进入 projection commit chain。
- `itemCompleted` 是最终权威内容和 phase 来源。

`02` 只消费这些语义，不重新设计 Rust projection 协议。

## 设计拆分

`02` 需要拆成多个细化设计分别决策。入口文件不做具体取舍，只固定问题边界。

建议细化设计包括:

- `02-a-item-started-slot-design.md`
  - 决定 `itemStarted` 如何创建通用 live item slot。
  - 讨论 slot key、turn 内顺序、初始 item、item type 和状态字段。
- `02-b-projection-delta-ingress-design.md`
  - 决定 `thread/projection/delta` 如何进入 GUI host、projection ingress 和 runtime。
  - 讨论 type guard、callback、subscription 过滤和 stale delta 处理。
- `02-c-live-slot-runtime-state-design.md`
  - 决定 live slot state 放在哪个 GUI state 边界。
  - 讨论 slot map、revision、selector、bounded cleanup 和 performance boundary。
- `02-d-completed-settlement-design.md`
  - 决定 `itemCompleted` 如何收敛 live slot。
  - 讨论 completed item 覆盖规则、slot 清理、committed transcript materialization 和 scroll commit key。
- `02-e-snapshot-reconnect-recovery-design.md`
  - 决定 attach、snapshot、reconnect 后 live slot 如何重建、丢弃或等待 completed 收敛。
  - 讨论哪些 live state 可恢复，哪些只能作为 transient state 放弃。

具体文件名可以在开始对应细化设计时调整，但每个细化设计必须保持单一决策主题。

## 跨细化设计不变量

### 通用 live item slot

`02` 的 live item slot 必须是通用模型，不能只服务 assistant message。

后续计划、命令行输出、thinking、tool progress 等流式 item 类型应能复用同一套生命周期:

```text
itemStarted -> zero or more deltas -> itemCompleted
```

不同 item 类型的 payload 归一化和显示策略可以在后续细化设计或后续阶段讨论，但 `02` 的基础 slot 模型不能把 agent message 写死成唯一形态。

### 顺序由 itemStarted 决定

turn 内显示顺序由 `itemStarted` 决定。delta 和 completed 只能更新同一个 slot，不能按到达顺序重新排序。

### Delta 是 transient

`thread/projection/delta` 只表示 live progress。

delta 不进入 committed transcript chunk，不产生 committed entry，不推进 `headCommitId`，也不能作为最终内容来源。

### Completed 是权威收敛点

`itemCompleted` 中的 completed item 是最终内容、状态和 phase 的权威来源。

如果 live delta 累积内容与 completed item 不一致，GUI 数据层必须以 completed item 收敛。

### 数据层先于显示层

`02` 只讨论 GUI 数据层，不设计具体视觉呈现。

显示层不能直接根据 WebSocket 到达顺序拼装 transcript。UI 必须消费 `02` 定义出的稳定 live item/timeline state。

## 非目标

- 不修改 Rust projection 实现。
- 不修改 app-server v2 协议字段。
- 不重新设计 `thread/projection/delta` wire shape。
- 不决定具体 Redux 字段名。
- 不设计 Streamdown 或 Markdown streaming renderer。
- 不设计 assistant message、plan、thinking、command output 或 tool progress 的最终 UI。
- 不修改 committed transcript chunk 的权威内容模型。
- 不编写 implementation plan。
- 不指定测试命令。

## 后续推进方式

后续每个 `02-*` 细化设计都必须单独完成:

- 先说明该细化设计要解决的唯一问题。
- 再列出候选方案和取舍。
- 然后确认一个方案。
- 最后再落盘对应设计文档。

只有相关 `02-*` 细化设计被确认后，才能编写 `02` 阶段的 implementation plan。
