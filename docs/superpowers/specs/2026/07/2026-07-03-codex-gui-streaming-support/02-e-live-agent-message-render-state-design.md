# live agent message render state 修正设计

日期: 2026-07-06
状态: 02e 修正设计
范围: Codex GUI agent message delta 的数据层修正；明确覆盖 02a/02b/02c/02d 中与本文件冲突的结论

## 目标

本设计修正 `02 GUI live item 数据层` 中 agent message delta 的 store/read 边界。

核心目标是让 agent message delta 进入 store 时就维护好可渲染 live state，selector 只做 O(1)
读取，不在每次 select 时重新用 normalized live slot 数据拼装 renderable view。

本文件只覆盖 agent message delta。命令行输出、exec output、tool output、thinking 和其他 streaming
item 类型不属于本次设计。

## 被修正的旧结论

本设计保留 02a/02b/02c/02d 中未冲突的 projection 语义，但覆盖以下旧结论:

- 不再以 `liveTurnsById + liveSlotsByKey + selector 拼装 renderable live item` 作为最终数据形态。
- 不再要求 selector 扫描 `slotOrder`、查 `liveSlotsByKey`、比较每个 slot revision 后再生成 view。
- 不再把 completed live slot 保留到下一次 attach 作为数据层稳定状态。
- 不再把 completed 状态作为 live list 长期可消费状态。

后续 implementation plan 若与旧 02a/02b/02c/02d 冲突，以本文件为准。

## 背景

现有实现把 live 数据拆成:

```text
liveTurnsById[turnId].slotOrder = [itemId, ...]
liveSlotsByKey[turnId:itemId] = slot
```

然后 selector 每次读取时从 `slotOrder` 反查 `liveSlotsByKey`，再 materialize
`TranscriptRenderableLiveItem[]`。

这和 committed transcript 的已有数据层方向不一致。committed transcript 在 reducer 写入时维护
`turnIds`、`turnsById`、`middleChunkIds`、`chunksById` 和 `entryIds`，selector 主要读取已经维护好的
结构。agent message delta 也应该遵循同一原则: 写入时维护读路径需要的数据，而不是每次 select 再计算。

TUI 可作为 agent message delta 的概念参考: TUI 的代理消息 delta 进入当前 stream controller，控制器维护
当前可显示状态；但本设计不引入 TUI 的 stable/tail 双区、commit tick、表格 holdback 或命令行输出模型。

## 决策 1: 范围只覆盖 agent message delta

本设计只处理 projection delta 中的 agent message:

```text
thread/projection/delta(agentMessage)
```

不处理命令行输出和 exec output。

理由:

- agent message delta 和命令行输出的生命周期、吞吐量、显示形态不同。
- 命令行输出需要单独优化，不能污染 assistant text 的简单数据层。
- 当前 02 的目标是 assistant 文本 streaming 数据闭环。

## 决策 2: reducer 写入时维护可渲染 live list

agent message live state 应在 `transcriptState` 写入路径中直接维护可渲染 live list。

语义形状:

```text
liveItemsByTurnId[turnId] = TranscriptRenderableLiveItem[]
liveItemIndexByKey[turnId:itemId] = { turnId, index }
```

字段名可以在实现计划中调整，但必须满足:

- `itemStarted` append 一个 renderable live item。
- delta 通过 `turnId + itemId` 定位 existing live item 并更新其可渲染字段。
- `itemCompleted` 写 committed transcript 后，从 live list 移除对应 live item。
- selector 不再从多个内部表重新拼装 renderable view。

理由:

- 数据进入 store 时就改变全局可渲染状态。
- selector 调用次数增加时，不会重复支付 live item 拼装成本。
- 该模式更接近已有 committed transcript 的写入时维护结构。

## 决策 3: selector 必须是 O(1) 读取

`selectTranscriptLiveItemsForTurn(state, turnId)` 的目标契约是:

```text
return state.liveItemsByTurnId[turnId] ?? EMPTY_LIVE_ITEMS
```

selector 不应:

- 扫描 live item order。
- 反查 live slot map。
- 构造 `slotKeys` 或 `slotRevisions`。
- 比较每个 live item revision。
- materialize 新的 renderable item 数组。

理由:

- selector 是读取路径，会被多个组件和多次 store update 调用。
- read-time materialization 会导致 select 越多越慢。
- reducer 写入是状态变化发生点，更适合维护可渲染结构。

## 决策 4: itemStarted 创建 live render item

`itemStarted(agentMessage)` 仍然走 structural projection event 路径，并由 reducer append live render item。

live render item 至少包含:

- `key`
- `turnId`
- `itemId`
- `initialItem`
- `status`
- `transientText`
- `revision`

`itemStarted` 不写 committed transcript chunk。

理由:

- `itemStarted` 是 turn 内顺序锚点。
- live list 顺序必须由 `itemStarted` 决定。
- delta 不能懒创建 live item，否则顺序会由 delta 到达顺序决定。

## 决策 5: delta 更新 existing live render item

accepted agent message delta 只更新 existing live render item。

语义:

```text
item.transientText += delta
item.status = "streaming"
item.revision += 1
```

如果找不到 `turnId + itemId` 对应 live item，静默忽略 delta。

本设计不要求把 `transientText` 改成 delta 数组。单独改数组不能解决读取路径问题；如果每次显示仍然
`join`，只是把成本从写入转移到读取。文本累积结构可以在后续性能证据明确后再单独评估。

## 决策 6: completed 后从 live list 移除

`itemCompleted(agentMessage)` 到达后，数据层在同一个 reducer 分支内完成:

1. 用 completed item materialize committed transcript entry。
2. 更新 committed transcript 和 scroll commit key。
3. 从 live list 移除对应 live item。

completed item 是最终文本和 phase 的权威来源。live state 只表示 transient streaming 期间的可渲染状态。

理由:

- 避免同一个 item 长期同时存在于 live list 和 committed transcript。
- 数据层不承担 UI 过渡动画。
- attach/reconnect 不需要保留 settled live slot 来表达历史完成状态。

边界:

- 如果 completed 到达时缺少 live item，仍然写 committed transcript，不补建 live item。
- snapshot 中已完成的 item 只进入 committed transcript，不生成 live item。
- attach replacement 仍清空所有 live state。

## 决策 7: 不引入 live chunk

agent message delta 不需要复制 committed transcript chunk 模型。

理由:

- chunk 解决的是长历史 committed transcript 的读取和渲染分块问题。
- agent message live state 通常只覆盖当前 active turn 的少量 live items。
- completed 后 live item 会移出 live list，最终内容进入 committed transcript chunk。

本次需要借鉴的是 committed transcript 的写入时维护原则，而不是 chunk 结构本身。

## 数据流

### itemStarted

```text
thread/projection/event(itemStarted(agentMessage))
  -> threadRuntimeEventBuffered
  -> transcriptState append live render item
```

### agent message delta

```text
thread/projection/delta(agentMessage)
  -> threadRuntimeDeltaAccepted
  -> transcriptState update existing live render item
```

### itemCompleted

```text
thread/projection/event(itemCompleted(agentMessage))
  -> threadRuntimeEventBuffered
  -> transcriptState materialize committed entry
  -> transcriptState remove matching live render item
```

## 不变量

### 读取路径不做 materialization

live item 的可渲染列表由 reducer 写入时维护。selector 只返回已存在的数组或稳定空数组。

### 顺序仍由 itemStarted 决定

delta 不能创建 live item，也不能改变 live list 顺序。

### Delta 仍是 transient

delta 不写 committed transcript，不推进 `headCommitId`，不更新 committed scroll commit key。

### Completed 仍是权威收敛点

completed item 写入 committed transcript。completed 后 live item 从 live list 移除。

### Attach 是恢复边界

accepted attach snapshot 全量重建 committed transcript，并清空 live render state。snapshot item 不生成 live item。

## 非目标

- 不修改 Rust projection 实现。
- 不修改 app-server v2 协议字段。
- 不重新设计 `thread/projection/delta` wire shape。
- 不设计命令行输出、exec output 或 tool output streaming。
- 不引入 TUI 的 stable/tail、commit tick 或 table holdback。
- 不设计视觉过渡动画。
- 不设计 Streamdown 或 Markdown streaming renderer。
- 不编写 implementation plan。
- 不指定测试命令。
