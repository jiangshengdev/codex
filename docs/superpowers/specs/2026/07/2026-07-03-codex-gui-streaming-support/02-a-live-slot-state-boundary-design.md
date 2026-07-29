# live slot state boundary 设计

日期: 2026-07-03
状态: 02a 设计初稿
范围: Codex GUI live item 数据层中 live slot 的 state 边界、slot 结构、turn timeline 存储和 selector 输出

## 目标

本设计只解决 `02 GUI live item 数据层` 的第一步: live slot 应该属于哪个 GUI state 边界，以及这个边界需要暴露什么稳定数据形状。

`02a` 不实现 projection delta ingress，也不设计 completed 收敛细节。它为后续步骤提供一个可以被 `itemStarted`、delta 和 `itemCompleted` 共同更新的 state 形状。

已继承的历史决策:

- live slot key 使用 `turnId + itemId`。
- slot 保存完整 `itemStarted.item`。
- `itemStarted` 到达后立即进入 renderable timeline。
- started 和 streaming 阶段不写入 committed transcript chunk。
- delta 和 completed 后续更新同一个 slot。
- 不采用 TUI 的 single stream controller 模型。

## 背景

`00-overall-design.md` 要求 `02` 只覆盖 GUI live item 数据层，不进入视觉渲染，也不扩大到 thinking、tool call、exec output 等扩展显示策略。

`01-rust-projection-semantics-design.md` 已确认 Rust projection 语义:

- `itemStarted` 是 turn 内 item 顺序锚点。
- `thread/projection/delta` 是 transient progress，不推进 projection head。
- `itemCompleted` 是最终权威内容和 phase 来源。

TUI 当前不为 agent message 的 `itemStarted` 建 per-item slot。TUI 使用单个 current stream controller 处理 assistant delta，completed item 负责最终收敛。GUI 不能复制这个模型，因为 GUI 需要 projection subscription、Redux state、selector cache、turn timeline 和 reconnect 收敛。

## 代码证据

当前 GUI state 边界支持把 live slot 放进 `transcriptState`:

- `transcriptStateSlice.ts` 已经维护 `turnIds`、`turnsById`、`chunksById`、`entriesById`、revision 和 selector cache。
- `transcriptStateSlice.ts` 已经从 attach snapshot 重建 committed transcript，并消费 accepted projection event。
- `itemCompleted` 当前已经在 `transcriptState` 中 materialize committed transcript entry。
- `itemStarted` 当前在 `transcriptState` 中是 no-op，只是缺少 renderable live state。

当前 `threadRuntime` 不适合作为 live slot owner:

- `threadRuntimeSlice.ts` 保存 subscription、active turn、snapshot replay index 和 bounded event buffer。
- `threadRuntimeEventBuffered` 只 buffer accepted event，并维护 active turn。
- `itemStarted` 和 `itemCompleted` 在 `threadRuntime` 中不更新 transcript 内容。

projection ingress 也不适合作为 owner:

- `ProjectionIngressAdapter` 负责 thread、subscription、commit chain 和 missing turn 检查。
- delta 是 transient，不应推进 `headCommitId`，也没有 `commitId` 可写入 `appliedEventIdsById`。

## 决策 1: state 边界

live slot 放在 `transcriptState`。

理由:

- live slot 是当前可渲染 transcript state 的一部分。
- turn timeline、chunk/entry revision 和 selector cache 已经由 `transcriptState` 管理。
- `threadRuntime` 当前职责是订阅和运行时 buffer，不拥有 renderable transcript 内容。
- 新建 slice 会增加同步和 selector 成本，目前没有必要。

边界:

- live slot 必须放在 `transcriptState` 的 transient live 子状态中。
- live slot 不写入 committed `entriesById` 或 `chunksById`。
- delta 不写入 `appliedEventIdsById`，因为 delta 没有 `commitId`。
- `threadRuntime` 继续负责 subscription、active turn、snapshot replay index 和 event buffer。

## 决策 2: slot 状态结构

live slot 使用单一对象，字段可选。

slot 至少表达:

- `turnId`
- `itemId`
- 完整 `initialItem`
- `status`
- transient text
- completed item

`status` 表达 live 生命周期:

- `started`
- `streaming`
- `completed`

理由:

- `itemStarted`、delta 和 `itemCompleted` 都更新同一个 slot。
- 单一对象比多 map 更容易保持生命周期闭环。
- 字段可选的代价小于多结构拼接带来的 selector 复杂度。

边界:

- `completed` 字段只作为同一 slot 的权威收敛占位。
- completed 后是否清理 slot、保留 settled state 或转为 committed 引用，留给 `02c completed settlement` 决定。

## 决策 3: turn timeline 存储形状

live turn timeline 使用 turn 内 order 加全局 slots map。

语义形状:

```text
liveTurnsById[turnId].slotOrder = [itemId, ...]
liveSlotsByKey[turnId:itemId] = slot
```

理由:

- turn 内顺序由 `itemStarted` 决定，必须显式保存。
- delta 和 completed 按 `turnId + itemId` 更新 slot 时可以 O(1) 定位。
- 形状贴近现有 `turnIds + turnsById + entriesById` 的 normalized state 模式。
- 比 turn 内 slot 数组更容易做去重、replay 收敛和 revision 更新。

边界:

- `slotOrder` 只表达 live renderable order，不代表 committed transcript chunk order。
- committed transcript chunk 的 materialization 和 scroll commit key 仍由现有 committed transcript 路径控制。

## 决策 4: selector 输出边界

selector 输出 renderable live item，而不是原始 live slot。

理由:

- 后续 `03` 显示层不应该依赖 `transcriptState` 内部 map/order 结构。
- selector 可以隐藏 transient slot 的内部字段和 normalized state 细节。
- 后续如果 slot 存储形状变化，只要 renderable live item contract 稳定，显示层不需要跟着重写。

renderable live item 至少表达:

- `turnId`
- `itemId`
- 当前 lifecycle status
- 初始 item
- transient text
- completed item

边界:

- selector 不把 started/streaming 状态伪装成 committed `TranscriptEntry`。
- selector 不决定具体 UI 组件、loading 文案或 Streamdown 输入。

## 非目标

- 不设计 `thread/projection/delta` 如何进入 GUI host 或 projection ingress。
- 不设计 stale subscription delta 的处理。
- 不设计缺失 slot 的 delta 如何处理。
- 不设计 `itemCompleted` 如何最终清理或收敛 slot。
- 不设计 attach、snapshot、reconnect 和 replay 的完整恢复。
- 不修改 committed transcript chunk 权威内容模型。
- 不设计具体视觉呈现。
- 不编写 implementation plan。
- 不指定测试命令。

## 后续关系

`02b projection ingress to live slot` 基于本设计决定:

- `itemStarted` 如何创建 live slot。
- `thread/projection/delta` 如何更新同一个 slot。
- stale subscription delta 如何忽略。
- 缺失 slot 的 delta 如何处理。

`02c completed settlement` 基于本设计决定:

- `itemCompleted` 如何以 completed item 权威收敛 slot。
- completed 后 slot 如何清理、保留或连接 committed transcript entry。

`02d attach, snapshot, reconnect and replay convergence` 基于本设计决定:

- snapshot 和 replay 如何重建或跳过 live slot。
- reconnect 后 transient delta 缺失时如何等待 completed 收敛。
