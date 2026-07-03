# projection ingress to live slot 设计

日期: 2026-07-03
状态: 02b 设计初稿
范围: Codex GUI projection event 和 projection delta 如何进入 02a 定义的 live slot 数据边界

## 目标

本设计只解决 `02 GUI live item 数据层` 的第二步: projection ingress 如何把 `itemStarted` 和 `thread/projection/delta` 送入 `transcriptState` 的 live slot。

`02b` 不设计 `itemCompleted` 的权威收敛、completed 后 slot 清理、attach snapshot 重建或 reconnect 恢复。这些分别留给 `02c` 和 `02d`。

继承的上游决策:

- `01` 已确认 `itemStarted` 是结构性 event，是 turn 内 item 顺序锚点。
- `01` 已确认 `thread/projection/delta` 是 transient progress，不推进 `headCommitId`。
- `01` 已确认 `itemCompleted` 是最终文本和 `phase` 的权威来源。
- `02a` 已决定 live slot 放在 `transcriptState` 的 transient live 子状态中。
- `02a` 已决定 live slot 使用 `turnId + itemId` 定位，turn 内顺序由 `slotOrder` 保存。

## 当前代码入口

当前 GUI 已有 structural event 路径:

- `GuiHostConnectionBridge` 通过 `ProjectionIngressAdapter.handleEvent` 接收 `thread/projection/event`。
- `ProjectionIngressAdapter` 检查 thread、subscription、commit chain、missing turn 和 manual reconnect 状态。
- accepted event 通过 `threadRuntimeEventBuffered` 进入 Redux。
- `transcriptState` 消费 `threadRuntimeEventBuffered`，其中 `itemStarted` 已创建 live slot。

当前缺口是 projection delta 路径:

- GUI protocol guard 尚未识别 `thread/projection/delta`。
- GUI host client 尚未暴露 `onProjectionDelta` 回调。
- `ProjectionIngressAdapter` 尚未提供 `handleDelta`。
- Redux 尚未有 accepted delta action。
- `transcriptState` 尚未把 accepted delta 追加进 existing live slot。

## 决策 1: ingress 与数据层责任切分

`thread/projection/delta` 先进入 `ProjectionIngressAdapter`。

`ProjectionIngressAdapter` 对 delta 只负责 projection ingress 判断:

- `threadId` 必须匹配当前 thread。
- `subscriptionId` 必须匹配当前 active subscription。
- 如果当前已经要求 manual reconnect，后续 delta 忽略。

accepted delta 不检查 `commitId` 或 `parentCommitId`，也不推进 `headCommitId`。delta 没有 commit chain 身份，不能进入 structural event 去重窗口。

`transcriptState` 只负责 live slot 数据更新:

- 根据 delta 内部 `turnId + itemId` 找已有 slot。
- 找到 slot 时更新 transient fields。
- 找不到 slot 时静默忽略。

理由:

- subscription 正确性属于 projection ingress，不应扩散到 `transcriptState`。
- slot 是否存在属于 `transcriptState` 的 live 数据事实。
- delta 是 transient progress，缺失不应升级为 committed transcript 变化。

## 决策 2: accepted delta 的 Redux action 边界

accepted delta 通过 `threadRuntimeSlice` 导出的 action 进入 Redux，例如:

```text
threadRuntimeDeltaAccepted({ notification })
```

`GuiHostConnectionBridge` 只 dispatch projection/runtime 层 action，不直接 dispatch `transcriptState` 私有 reducer。

`transcriptState` 通过 extra reducer 消费这个 action。

理由:

- 这与现有 `threadRuntimeAttached`、`threadRuntimeEventBuffered`、`threadRuntimeManualReconnectRequired` 的跨 slice 事件流一致。
- bridge 不需要知道 transcript live slot 的内部 reducer 名称。
- 后续如果其他 slice 需要观察 accepted delta，也可以消费同一个 runtime action。

## 决策 3: itemStarted 保持 structural event 路径

`itemStarted` 继续走现有 structural event 路径:

```text
thread/projection/event
  -> ProjectionIngressAdapter.handleEvent
  -> threadRuntimeEventBuffered
  -> transcriptState upsertStartedLiveSlot
```

不新增 `itemStarted` 专用 action，也不允许 delta 第一次到达时懒创建 slot。

理由:

- `itemStarted` 是 commit chain 中的结构性 event，已有 commit 去重、snapshot replay 和 missing turn 检查。
- turn 内顺序必须由 `itemStarted` 决定，不能由 delta 到达顺序决定。
- delta 懒创建 slot 会破坏 `02a` 的 `slotOrder` 不变量。

## 决策 4: missing slot delta

当 accepted delta 到达，但 `transcriptState` 找不到 `turnId + itemId` 对应 live slot 时，静默忽略该 delta。

不记录 committed entry，不创建 live slot，不触发 manual reconnect。

理由:

- delta 是 transient progress，不是权威内容。
- 缺失 transient delta 可以由后续 `itemCompleted` 的权威内容收敛。
- manual reconnect 应保留给 commit chain mismatch、missing turn、backpressure 等结构性问题。
- bounded diagnostic 可以后续再加，但不属于 02b 的最小数据层闭环。

## 决策 5: delta 更新 slot

accepted delta 更新已有 slot 时:

```text
slot.transientText += notification.delta
slot.status = "streaming"
slot.revision += 1
```

delta 不替换 `transientText`，也不保存 delta 数组。

理由:

- app-server 文档说明 `item/agentMessage/delta` 是 streamed text 片段，同一 `itemId` 的 delta 按顺序拼接。
- selector 已通过 slot revision 失效 live item view cache。
- 保存 delta 数组会扩大 live state，当前没有调试或回放需求。

边界:

- 02b 不根据 delta 推断 `phase`。
- 02b 不把 transient text 写进 committed transcript chunk。
- 02b 不更新 committed scroll commit key。

## 数据流

### Structural itemStarted

```text
thread/projection/event(itemStarted)
  -> guiHostClient validates event params
  -> ProjectionIngressAdapter.handleEvent
  -> eventAccepted
  -> threadRuntimeEventBuffered
  -> transcriptState creates live slot
```

### Transient agentMessage delta

```text
thread/projection/delta(agentMessage)
  -> guiHostClient validates delta params
  -> ProjectionIngressAdapter.handleDelta
  -> deltaAccepted
  -> threadRuntimeDeltaAccepted
  -> transcriptState appends transientText on existing live slot
```

## 不变量

### Delta 不进入 commit chain

delta 不写入 `appliedEventIdsById`，不写入 `appliedEventOrder`，不推进 `headCommitId`。

### Delta 不进入 committed transcript

delta 不写入 `entriesById`、`chunksById`、`entryChunkById`，也不改变 `committedScrollCommitKey`。

### 顺序仍由 itemStarted 决定

delta 只能更新已有 slot，不能创建 slot，也不能修改 `slotOrder`。

### Completed 仍是权威收敛点

如果 transient text 和后续 completed item 不一致，后续 `02c` 必须以 completed item 收敛。02b 不试图解决这种不一致。

## 非目标

- 不设计 `itemCompleted` 如何绑定、覆盖或清理 live slot。
- 不设计 completed item 与 committed transcript entry 的最终连接方式。
- 不设计 attach snapshot 如何初始化或替换 live timeline。
- 不设计 reconnect 后 transient delta 缺失如何恢复。
- 不设计 Streamdown、Markdown streaming renderer 或 UI 呈现。
- 不扩展 thinking、tool call、exec output 或其他 streaming item 类型。
- 不修改 Rust projection 协议字段。
- 不写 implementation plan。
- 不指定测试命令。

## 后续关系

`02c completed settlement` 基于本设计继续决定:

- `itemCompleted(agentMessage)` 如何绑定已有 live slot。
- completed `text` 和 `phase` 如何覆盖 transient delta 状态。
- completed 后 slot 是保留、转为 committed 引用，还是清理。

`02d attach, snapshot, reconnect and replay convergence` 基于本设计继续决定:

- attach snapshot 如何重建 live timeline。
- replay `itemStarted` 如何避免重复 slot。
- reconnect 后缺失 transient delta 时如何等待 completed 收敛。
