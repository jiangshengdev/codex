# attach, snapshot, reconnect and replay convergence 设计

日期: 2026-07-03
状态: 02d 设计初稿
范围: Codex GUI live item 数据层中 attach、snapshot、reconnect 和 replay 场景如何收敛到同一 timeline 模型

## 目标

本设计只解决 `02 GUI live item 数据层` 的第四步: 非连续 live event 场景如何与 `02a`、`02b`、`02c` 定义的 live slot 数据模型收敛。

`02d` 不恢复 transient delta，不设计 UI 过渡，不扩展 streaming item 类型，也不引入复杂错误恢复 UI。它只定义 attach snapshot、snapshot duplicate replay、manual reconnect 和 bounded cleanup 的最低数据层规则。

继承的上游决策:

- `01` 已确认 `thread/projection/delta` 是 transient progress，不推进 projection head。
- `01` 已确认 `itemCompleted` 是最终文本和 `phase` 的权威来源。
- `02a` 已决定 live slot 放在 `transcriptState` 的 transient live 子状态中。
- `02b` 已决定 delta 只更新已有 live slot，缺失 slot 时静默忽略。
- `02c` 已决定 completed 可 settle 已有 live slot，但缺失 slot 时不补建 live slot，仍然写 committed transcript。

## 当前代码入口

当前 GUI 已有恢复和重放边界:

- `GuiHostConnectionBridge` 在 attach 成功后 dispatch `threadRuntimeAttached`，并用 snapshot turns 建立 `snapshotReplayIndex`。
- `ProjectionIngressAdapter.handleAttach()` 用 attach snapshot 重置 `subscriptionId`、`headCommitId`、`knownTurnIds` 和 manual reconnect 状态。
- `threadRuntimeSlice` 在 attach 时保存 `snapshotTurns`、`snapshotReplayIndex`、bounded `eventBuffer`、`activeTurnId` 和 active subscription 状态。
- `replayForProjectionEvent()` 根据 snapshot turn status 和 item id 把后续 projection event 标为 `live` 或 `snapshotDuplicate`。
- `transcriptState` 在 `threadRuntimeAttached` 时全量 rebuild committed transcript。
- `transcriptState` 在 `threadRuntimeEventBuffered` 中遇到 `snapshotDuplicate` 时直接跳过。
- `transcriptState` 在 manual reconnect 时只写 `subscriptionInterrupted` global status，不修改 committed transcript 或 live slot。

当前缺口是把这些已有行为明确成 live item 数据层的不变量，避免后续实现为了视觉连续性把 snapshot、completed 或旧 subscription 状态反推回 streaming live slot。

## 决策 1: attach snapshot 是 live timeline 的全量替换边界

`thread/projection/attach` 到达并被接受后，GUI 数据层以 attach snapshot 为新的权威恢复点。

attach snapshot 必须:

- 全量重建 committed transcript。
- 清空旧 `liveTurnsById` 和 `liveSlotsByKey`。
- 清空旧 `globalStatus`。
- 清空旧 `appliedEventIdsById` 和 `appliedEventOrder`。
- 更新 `threadId`、`subscriptionId` 和 attach scroll commit key。

attach snapshot 不生成 settled live slot。snapshot 中已经完成的 items 只进入 committed transcript。

理由:

- snapshot 是恢复后的权威历史，不是 live lifecycle event。
- live slot 表达当前 subscription 内的 transient lifecycle，不应跨 attach 继承。
- 旧 streaming text 可能来自已断开的 subscription，保留会产生过期 transient 状态。
- committed transcript 已经保存权威 completed 内容，不需要用 settled live slot 重复表达。

边界:

- attach replacement 不依赖 event buffer 重放来修正 live slot。
- attach 不从 snapshot completed item 反推 streaming text。
- attach 不试图保留旧 subscription 的 partial delta。

## 决策 2: snapshotDuplicate item event 不触碰 live slot

`replayForProjectionEvent()` 判定为 `snapshotDuplicate` 的 projection event 只表示 snapshot 后续重复到达的结构性事件。

对 `snapshotDuplicate`:

- `itemStarted` 不创建 live slot。
- `itemCompleted` 不 settle live slot。
- 不更新 committed transcript。
- 不更新 committed scroll commit key。
- 不记录 applied event id。

理由:

- attach snapshot 已经是权威状态，duplicate event 不应产生第二次数据层副作用。
- 如果 duplicate `itemStarted` 创建 slot，会把历史 snapshot item 重新变成 live item。
- 如果 duplicate `itemCompleted` settle slot，会让 snapshot replay 路径重新拥有 live 状态写权限。

边界:

- duplicate 判断仍由 `threadRuntime` 的 snapshot replay index 提供。
- `transcriptState` 只消费 `replay` 分类，不重新计算 snapshot membership。
- live event 和 snapshot duplicate event 不共享 reducer 副作用。

## 决策 3: reconnect 后不恢复 transient delta

manual reconnect 或重新 attach 后，GUI 不恢复丢失的 `thread/projection/delta`。

如果 reconnect 期间 delta 缺失:

- 不请求 delta replay。
- 不从 completed item 反推 `transientText`。
- 不从 snapshot item 反推 `transientText`。
- 不用 committed transcript entry 补建 live slot。
- 后续 live `itemCompleted` 或下一次 attach snapshot 作为权威收敛点。

理由:

- delta 是 transient progress，不是可恢复的 commit-chain 历史。
- completed item 和 snapshot item 是最终权威内容，把它们伪装成 streaming text 会混淆数据语义。
- 当前 projection ingress 已经把 commit-chain mismatch、missing turn 和 backpressure 升级为 manual reconnect；delta 缺失不应引入第二套恢复机制。

边界:

- live `itemCompleted` 缺 slot 时仍按 `02c` 写 committed transcript，但不补建 live slot。
- 缺失 delta 不触发新的 reconnect reason。
- event buffer 只作为 bounded runtime tail，不作为完整恢复日志。

## 决策 4: settled live slot 的最低 cleanup 和 revision 规则

`02d` 不引入定时 cleanup 或数量上限 cleanup。

最低 cleanup 规则:

- live `itemCompleted` settle 的 slot 保留到下一次 accepted attach replacement。
- accepted attach replacement 清空所有 live turns 和 live slots。
- `snapshotDuplicate` 不创建、不更新、也不清理 live slot。
- manual reconnect 不清理 live slot；它只增加 global interrupted status，等待下一次 attach replacement 收敛。

最低 revision 规则:

- slot 内容变化时递增 slot revision。
- live turn `slotOrder` 变化时递增 live turn revision。
- attach replacement 通过全量 state replacement 让 selector cache 自然失效。
- duplicate replay 不递增 live slot 或 live turn revision。
- delta 缺失不产生 revision 变化。

理由:

- attach 是自然的恢复和清理边界。
- completed 后立即删除 slot 会破坏 `02c` 定义出的 settled live item 可消费状态。
- 数量上限 cleanup 需要额外 UI 时机和内存策略，不是 assistant text streaming 数据层闭环的必要条件。

## 数据流

### Accepted attach snapshot

```text
thread/projection/attach
  -> ProjectionIngressAdapter.handleAttach
  -> threadRuntimeAttached
  -> transcriptState rebuilds committed transcript from snapshot
  -> transcriptState clears live turns, live slots, global status, applied event window
```

### Snapshot duplicate item event

```text
thread/projection/event(itemStarted or itemCompleted)
  -> ProjectionIngressAdapter.handleEvent
  -> replayForProjectionEvent returns snapshotDuplicate
  -> threadRuntimeEventBuffered
  -> transcriptState ignores the event
```

### Reconnect with missing delta

```text
thread/projection/closed or structural mismatch
  -> manual reconnect state
  -> transient delta may be lost
  -> no delta replay or live text reconstruction
  -> next itemCompleted or attach snapshot provides authoritative content
```

## 不变量

### Attach 是恢复边界

accepted attach snapshot 替换 GUI 当前 transcript 数据层状态。旧 live slot 不跨 attach 保留。

### Snapshot 只重建 committed transcript

snapshot items 不创建 settled live slot。history 由 committed transcript 表达，live lifecycle 由 live event 表达。

### Duplicate replay 没有副作用

`snapshotDuplicate` event 不写 committed transcript，不写 live slot，不更新 scroll key，也不推进 live revision。

### Delta 不可恢复

delta 丢失后不补算。GUI 等待 completed event 或下一次 attach snapshot 收敛。

### Completed 仍是权威收敛点

live completed item 可以 settle existing slot，并 materialize committed transcript。缺 slot 时只 materialize committed transcript。

## 非目标

- 不设计自动 reconnect loop。
- 不设计 `thread/projection/detach`。
- 不恢复或 replay transient delta。
- 不从 snapshot 或 completed item 反推 streaming text。
- 不把 snapshot item 生成 settled live slot。
- 不设计 UI 如何显示 interrupted、streaming 或 completed 过渡。
- 不设计 Streamdown 或 Markdown streaming renderer。
- 不扩展 thinking、tool call、exec output 或其他 streaming item 类型。
- 不修改 Rust projection 协议字段。
- 不写 implementation plan。
- 不指定测试命令。

## 后续关系

后续 implementation plan 可以基于本设计决定具体代码修改和验证范围:

- 现有 attach rebuild 路径是否已经满足清空 live state 的要求。
- `snapshotDuplicate` item event 是否有测试覆盖其不触碰 live slot。
- reconnect 后 missing delta 是否有测试覆盖其不补建 live slot。
- attach replacement 是否有测试覆盖其清理 settled live slot 和 interrupted status。

这些验证属于 implementation plan，不在本设计文档中指定具体命令。
