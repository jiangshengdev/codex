# completed settlement 设计

日期: 2026-07-03
状态: 02c 设计初稿
范围: Codex GUI `itemCompleted(agentMessage)` 如何收敛 02a/02b 定义的 live slot

## 目标

本设计只解决 `02 GUI live item 数据层` 的第三步: `itemCompleted(agentMessage)` 如何把同一个 live slot 从 started 或 streaming 状态收敛为 completed 状态。

`02c` 不设计 attach snapshot、reconnect、replay convergence、bounded cleanup、视觉显示或 Markdown streaming renderer。这些分别留给 `02d` 和后续显示层设计。

继承的上游决策:

- `01` 已确认 `itemCompleted` 是最终文本和 `phase` 的权威来源。
- `02a` 已决定 live slot 放在 `transcriptState` 的 transient live 子状态中。
- `02a` 已决定 live slot 使用 `turnId + itemId` 定位，并保存 `initialItem`、`transientText` 和 `completedItem`。
- `02b` 已决定 `itemStarted` 创建 slot，`thread/projection/delta` 只追加已有 slot 的 transient text。
- `02b` 已决定 delta 不写入 committed transcript chunk，不推进 `headCommitId`，也不改变 committed scroll commit key。

## 当前代码入口

当前 GUI 已有 completed materialization 路径:

- `ProjectionIngressAdapter.handleEvent` 接受 commit-chain 连续的 `thread/projection/event`。
- accepted event 通过 `threadRuntimeEventBuffered` 进入 Redux。
- `transcriptState` 消费 `threadRuntimeEventBuffered`。
- `itemCompleted` 分支调用 `materializeTranscriptItem(item, turnId)`。
- materialized entry 非空时，`upsertLiveCommittedEntry` 写入 committed transcript，并把 `committedScrollCommitKey` 设置为 `event:<commitId>`。

当前缺口是 completed settlement:

- `itemStarted` 已能创建 live slot。
- delta 已能更新 live slot 的 `transientText`。
- `itemCompleted` 还没有把同一个 `turnId + item.id` live slot 标记为 completed。

## 决策 1: 保留 settled live slot

`itemCompleted(agentMessage)` 到达后，如果存在 `turnId + item.id` 对应的 live slot，保留该 slot，并把它更新为 settled 状态。

settled slot 至少更新:

```text
slot.status = "completed"
slot.completedItem = item
slot.revision += 1
```

理由:

- `itemStarted`、delta 和 `itemCompleted` 应更新同一个 slot，形成完整 lifecycle。
- 后续显示层可以明确消费 completed live item，而不是从 committed transcript 反推 live 状态。
- selector 可以表达 started、streaming、completed 三种状态的稳定数据形状。

边界:

- 保留 settled slot 不改变 committed transcript 的权威模型。
- completed 后的清理时机不在 02c 决定。

## 决策 2: completed item 是权威显示源

当 `completedItem` 与 `transientText` 不一致时，以 completed item 为权威。

`transientText` 原样保留，不用 completed text 覆盖，也不清空。

语义:

- `completedItem.text` 是最终文本来源。
- `completedItem.phase` 是最终 phase 来源。
- committed transcript entry 由 completed item materialize。
- `transientText` 只表示曾收到过的 transient progress。

理由:

- delta 是 transient progress，不是最终内容。
- completed item 是权威收敛点。
- 保留 `transientText` 可以表达 live 过程，但不会污染 committed truth。

边界:

- 02c 不新增 mismatch diagnostic 标记。
- 02c 不把 `transientText` 写入 committed transcript。
- 02c 不从 delta 推断 `phase`。

## 决策 3: 缺失 live slot 时不补建 slot

当 `itemCompleted` 到达但找不到 `turnId + item.id` 对应 live slot 时，不补建 live slot。

仍然按现有路径写 committed transcript:

```text
itemCompleted
  -> materializeTranscriptItem(item, turnId)
  -> upsertLiveCommittedEntry(entry)
```

理由:

- completed 是权威内容，不能因为缺少 live slot 而丢弃。
- live slot 的顺序必须由 `itemStarted` 决定。
- 由 completed 懒创建 slot 会让 `slotOrder` 受 completed arrival order 影响。
- reconnect、snapshot 和 missing started 的完整收敛属于 02d。

边界:

- 缺失 slot 不触发 manual reconnect。
- 缺失 slot 不创建 `slotOrder` 项。
- 缺失 slot 不阻止 committed materialization。

## 决策 4: 02c 不清理 settled slot

02c 不在 completed 后立即删除 live slot。

settled slot 保留到后续 attach、snapshot、reconnect 或 bounded cleanup 规则处理。

理由:

- cleanup 涉及恢复边界、内存上限、revision 更新和 UI 过渡时机。
- 这些规则需要和 attach/reconnect 统一设计，属于 02d。
- 立即删除会破坏 settled live slot 的可消费状态。

## 决策 5: settlement 与 materialization 在同一 reducer 分支完成

同一个 `itemCompleted` reducer 分支内原子完成两件事:

1. 用 completed item settle live slot。
2. 沿用现有 `materializeTranscriptItem()` 写 committed transcript。

推荐执行顺序:

```text
ensureTurnExists(turnId)
settleLiveSlotIfPresent(turnId, item)
entry = materializeTranscriptItem(item, turnId)
if entry != null:
  upsertLiveCommittedEntry(entry)
  committedScrollCommitKey = event:<commitId>
```

理由:

- 一个 accepted projection event 对应一次数据层收敛。
- live state 与 committed state 不会在一次 action 内短暂分裂。
- 保留现有 committed transcript materialization 和 scroll 语义。

边界:

- 只有 materialized entry 非空时才更新 `committedScrollCommitKey`。
- 非 message item 或空文本 item 可以 settle live slot，但不会产生 committed entry。
- `threadRuntimeEventBuffered` 的 commit 去重和 snapshot duplicate 过滤仍按现有规则执行。

## 数据流

### 有 live slot 的 completed agent message

```text
thread/projection/event(itemCompleted(agentMessage))
  -> ProjectionIngressAdapter.handleEvent
  -> threadRuntimeEventBuffered
  -> transcriptState
  -> settle existing live slot as completed
  -> materialize completed item into committed transcript entry
```

### 缺失 live slot 的 completed agent message

```text
thread/projection/event(itemCompleted(agentMessage))
  -> ProjectionIngressAdapter.handleEvent
  -> threadRuntimeEventBuffered
  -> transcriptState
  -> no live slot is created
  -> materialize completed item into committed transcript entry
```

## 不变量

### Completed 是权威收敛点

最终文本、最终 phase 和 committed transcript entry 都来自 completed item。

如果 delta 累积文本与 completed item 不一致，GUI 数据层必须以 completed item 收敛。

### Delta 仍是 transient

delta 只更新 `transientText`。

delta 不写入 committed transcript，不产生 committed entry，不推进 `headCommitId`，也不更新 `committedScrollCommitKey`。

### 顺序仍由 itemStarted 决定

`slotOrder` 只由 `itemStarted` 建立。

`itemCompleted` 可以 settle 已有 slot，但不能创建 slot，也不能改变 `slotOrder`。

### Committed transcript 仍是权威历史

settled live slot 不替代 committed transcript。

committed chunks 仍只保存已完成、权威、可回放的 transcript entry。

## 非目标

- 不设计 attach snapshot 如何初始化或替换 live timeline。
- 不设计 replay `itemStarted` 或 `itemCompleted` 如何避免重复 slot。
- 不设计 reconnect 后 transient delta 缺失如何恢复。
- 不设计 settled slot 的 bounded cleanup。
- 不设计 UI 如何从 streaming 切换到 completed。
- 不设计 Streamdown 或 Markdown streaming renderer。
- 不扩展 thinking、tool call、exec output 或其他 streaming item 类型。
- 不修改 Rust projection 协议字段。
- 不写 implementation plan。
- 不指定测试命令。

## 后续关系

`02d attach, snapshot, reconnect and replay convergence` 基于本设计继续决定:

- attach snapshot 如何重建 committed transcript 和 live timeline。
- replay `itemStarted` 时如何避免重复 slot。
- replay 或 reconnect 场景中 completed item 如何与 existing settled slot 收敛。
- settled slot 何时清理，以及 cleanup 如何保持 bounded。

后续 implementation plan 可以基于本设计决定具体代码修改范围和验证范围。
