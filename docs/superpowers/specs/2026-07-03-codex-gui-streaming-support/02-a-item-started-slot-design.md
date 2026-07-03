# itemStarted live slot 设计

日期: 2026-07-03
状态: 02-a 设计初稿
范围: Codex GUI live item 数据层中 `itemStarted` 创建通用 live item slot 的语义

## 目标

本设计只解决一个问题: `thread/projection/event` 中的 `itemStarted` 到达 GUI 数据层后，如何创建通用 live item slot。

`itemStarted` 是 live item 生命周期的起点。它不产生最终内容，不进入 committed transcript chunk，但它必须为后续 delta 和 completed 建立稳定的数据锚点。

本阶段确认三件事:

- slot key 使用 `turnId + itemId`。
- slot 保存完整 `itemStarted.item`，并附加 live slot 元数据。
- `itemStarted` 立即创建 renderable slot，但具体是否显示由后续显示层设计决定。

## 背景

`00-overall-design.md` 要求 turn 内显示顺序由 `itemStarted` 决定，delta 和 completed 只能更新同一个 slot。

`01-rust-projection-semantics-design.md` 已确认 Rust projection 语义:

- `itemStarted` 是结构性 projection event。
- `itemStarted` 携带 `turnId` 和初始 `item`。
- delta 是 transient progress，不带 commit 字段。
- `itemCompleted` 是最终权威内容、状态和 phase 来源。

因此 GUI 数据层不能等 delta 或 completed 到达后才决定 item 位置。slot 必须在 `itemStarted` 阶段建立。

## 决策 1: slot key 与归属

live slot 使用 `turnId + itemId` 定位，并归属于对应 turn 的 timeline。

理由:

- projection delta 的定位字段是 `turnId + itemId`，slot key 与 wire shape 保持一致。
- turn 内顺序由 `itemStarted` 决定，slot 需要属于具体 turn，而不是全局漂浮 item。
- 后续 delta 和 completed 可以精确更新同一个 turn 下的同一个 slot。
- 多 turn、reconnect、snapshot replay 场景下不依赖隐式 active turn。

明确不采用:

- 只用 `itemId` 的全局 slot map。这样会弱化 turn timeline 边界，后续 selector 仍需要反查 turn。
- 使用 current active turn 加 `itemId`。这依赖隐式状态，不适合多个 live item 或 replay/reconnect 场景。

## 决策 2: slot 初始内容

slot 保存完整 `itemStarted.item`，并附加 live slot 元数据。

完整 initial item 是协议给出的初始事实。`02-a` 不裁剪 item 字段，也不按 item type 提前拆字段。

slot 元数据至少表达以下语义:

- slot 所属 `turnId`。
- slot 对应 `itemId`。
- slot 当前处于 started/live 生命周期。
- slot 在 turn timeline 中的顺序来自 `itemStarted` 到达顺序。
- slot 后续可以被 delta 和 completed 更新。

具体 TypeScript 字段名、Redux slice 落点和 selector 形状不在本设计中决定，留给后续 `02-c-live-slot-runtime-state-design.md`。

明确不采用:

- 只保存 `itemId`、`turnId`、`item.type` 等最小字段。后续 plan、command、thinking 或 tool progress 可能需要 initial item 的其他字段，过早裁剪会导致返工。
- 按 item type 分别提取初始字段。`02-a` 只定义通用 slot，不提前设计各流式类型的 payload。

## 决策 3: slot 顺序与可见性

`itemStarted` 到达后，GUI 数据层立即创建 renderable slot。

这里的 renderable 表示 slot 进入稳定 turn timeline，可被后续 UI selector 消费；它不表示 UI 必须立刻显示一个可见组件。

理由:

- 数据层必须先固定顺序，显示层不能靠 WebSocket 到达顺序拼装 transcript。
- 没有 delta 的 slot 也可能需要占住 turn 内位置，避免后续 completed 按完成顺序插入。
- 显示层可以在后续设计中决定空 slot 是隐藏、显示 loading，还是等首个 delta 后显示。

明确不采用:

- 等 delta 或 completed 到达后再把 slot 放进 renderable timeline。这样会让显示顺序重新受后续事件到达顺序影响。
- 只让特定 item type 立即 renderable。`02-a` 的 slot 是通用模型，不能写死 assistant message。

## 数据层语义

`itemStarted` 创建 slot 后，slot 只代表一个 live item 已经在 turn timeline 中占位。

它不会:

- 创建 committed transcript entry。
- 写入 committed transcript chunk。
- 生成最终 assistant text、command output、thinking 内容或 tool result。
- 推进 projection `headCommitId` 之外的额外 GUI commit 语义。
- 决定具体 UI 组件、折叠、loading 文案或 Markdown 渲染方式。

后续事件的职责边界为:

- `thread/projection/delta` 只更新同一个 slot 的 transient progress。
- `itemCompleted` 以 completed item 权威收敛同一个 slot。

## 与后续细化设计的关系

`02-a` 只定义 slot 如何由 `itemStarted` 创建。

后续设计继续拆分:

- `02-b-projection-delta-ingress-design.md`
  - 讨论 `thread/projection/delta` 如何进入 GUI host、projection ingress 和 runtime。
- `02-c-live-slot-runtime-state-design.md`
  - 讨论 live slot 放在哪个 state 边界、如何存储、如何做 selector 和 revision。
- `02-d-completed-settlement-design.md`
  - 讨论 `itemCompleted` 如何用权威 completed item 收敛 slot。
- `02-e-snapshot-reconnect-recovery-design.md`
  - 讨论 attach、snapshot、reconnect 后 live slot 如何重建或放弃。

## 非目标

- 不设计 `thread/projection/delta` ingress。
- 不决定 live slot 放在 `threadRuntime`、`transcriptState` 或新 slice。
- 不决定 TypeScript 字段名。
- 不设计 completed 收敛和 slot 清理。
- 不设计 snapshot/reconnect 恢复。
- 不设计 assistant message、plan、thinking、command output 或 tool progress 的显示方式。
- 不修改 committed transcript chunk 模型。
- 不编写 implementation plan。
- 不指定测试命令。
