# Codex GUI Projection Snapshot Replay Recovery Design

## 背景

`thread/projection/attach` 的原始 hidden race 是：core 先 persist event，再 deliver 给 app-server listener。若 attach 在 listener 处理该 event 前执行，snapshot 可能已经读到这个 persisted future semantic event，但 `snapshot.headCommitId` 仍停在旧 projection head。随后 listener 再发送同一语义的 `thread/projection/event`。

这个 race 目前只有代码级 interleaving 和构造型测试证据，没有真实运行日志证明它发生过。最近 final message 缺失复现不是这个 race，而是 cursor-domain count 被当作 physical history index 截断。

因此本设计不继续推进 server same-cut / physical boundary 方案，也不把未证实 race 升级为跨 core、protocol、store、app-server 的改造。本设计只让 GUI 在该 race 真的发生时具备前端恢复能力。

相关历史设计：

- `docs/superpowers/specs/2026-05-24-projection-snapshot-head-cut-design.md`
- `docs/superpowers/specs/2026-07-01-projection-snapshot-physical-boundary-design.md`

## 目标

- 允许 attach snapshot 临时 ahead：snapshot 可以包含 listener 尚未处理的 future semantic event。
- 后续 live projection event 到达时，如果 commit chain 连续，前端接受 event 并推进本地 protocol cursor。
- 如果该 event 的 turn/item 已经来自 attach snapshot，GUI 不重复 materialize UI 内容，不触发 scroll 副作用，不要求 manual reconnect。
- 改动范围限定在 `codex-gui` 前端 runtime / transcript / timeline 状态处理。

## 非目标

- 不修改 app-server attach snapshot 行为。
- 不修改 `ProjectionHistoryCursor`、snapshot cut、physical persisted boundary、thread store 或 core event delivery。
- 不证明 hidden race 已真实发生。
- 不做自动 reconnect。
- 不处理普通 live stream 中的同 id update / duplicate；本设计只处理 attach snapshot 初始内容与后续 live event 的语义重放。

## 设计

### 1. Ingress 继续只维护协议连续性

`ProjectionIngressAdapter` 不负责 UI 去重，也不检查 snapshot 是否已经包含同 turn/item。

规则保持为：

- `commitId === headCommitId`：重复 commit，忽略。
- `parentCommitId !== headCommitId`：commit chain mismatch，进入 `manualReconnectRequired`。
- `parentCommitId === headCommitId`：接受 event，推进 `headCommitId`。

这保证 snapshot ahead 后到达的 live event 仍能推进 protocol cursor，而不是被误判为需要重连。

### 2. Runtime 维护 attach snapshot 初始语义索引

`threadRuntime` 在 accepted attach 时，从 `snapshot.thread.turns` 建立只读语义索引：

- `snapshotTurnIds`
- `snapshotItemIds`

该索引只来自 attach snapshot 初始内容。后续 accepted live events 不写入这些集合。

原因：

- 本设计只解决 snapshot ahead replay。
- 后续 live stream 的同 id update 可能是正常修订，不应被这个索引误判为 duplicate。
- 索引边界越窄，越不容易影响现有 live event 行为。

### 3. Runtime buffer entry 增加 replay 分类

`threadRuntime.eventBuffer` 中的 projection event entry 增加分类字段：

```ts
{
  type: "projectionEvent",
  notification,
  replay: "live" | "snapshotDuplicate"
}
```

含义：

- `live`：正常新增 live event。
- `snapshotDuplicate`：commit chain 已接受并推进，但该 event 的 turn/item 已在 attach snapshot 初始内容中出现。

分类规则：

- `turnStarted` / `turnCompleted`：如果 `event.notification.turn.id` 在 `snapshotTurnIds` 中，则为 `snapshotDuplicate`。
- `itemStarted` / `itemCompleted`：如果 `event.notification.item.id` 在 `snapshotItemIds` 中，则为 `snapshotDuplicate`。
- 其他情况为 `live`。

event 仍保留在 buffer 中，便于诊断和测试确认该 race 是否真的发生过；但消费者必须根据 `replay` 避免 UI 副作用。

### 4. 消费方跳过 snapshotDuplicate

`snapshotDuplicate` 是协议追赶事件，不是新 UI 内容。

消费规则：

- `threadRuntime` 不因 `snapshotDuplicate` 更新 `activeTurnId`。
- `transcriptState` 不对 `snapshotDuplicate` 执行 live materialization。
- `transcriptState` 不因 `snapshotDuplicate` bump entry/chunk revision。
- `transcriptState` 不因 `snapshotDuplicate` 更新 `committedScrollCommitKey`。
- `liveEventHandling` 不从 `snapshotDuplicate` 生成 live timeline material。

普通 `live` event 保持现有行为。

## 数据流

1. attach accepted。
2. `threadRuntimeAttached` 重建 runtime baseline 和 transcript snapshot。
3. runtime 从 attach snapshot 初始 turns/items 建立 `snapshotTurnIds` / `snapshotItemIds`。
4. 后续 projection event 到达。
5. ingress 验证 commit chain 连续并接受 event。
6. runtime 根据初始 snapshot index 把 event 分类为 `live` 或 `snapshotDuplicate`。
7. `live` event 继续驱动 active turn、transcript、timeline。
8. `snapshotDuplicate` event 只保留为已接受的 buffered event，不产生 UI materialization。

## 测试范围

测试只覆盖前端，不新增 app-server 构造测试。

应覆盖：

- `projectionIngressAdapter`：snapshot 已含 turn/item、`headCommitId` 仍旧、后续同语义 event 的 `parentCommitId` 接旧 head 时，event 被 accepted，而不是 `commitChainMismatch`。
- `threadRuntimeSlice`：attach snapshot 初始已有 turn/item 时，后续同语义 accepted event 被标记为 `snapshotDuplicate`。
- `threadRuntimeSlice`：普通 live event 仍标记为 `live`，并保持现有 active turn 行为。
- `transcriptStateSlice`：`snapshotDuplicate` 不重复 append entry，不 bump revision，不更新 `committedScrollCommitKey`。
- `liveEventHandling`：`snapshotDuplicate` 不生成 live event material。

## 风险

- 如果某个 live event 与 snapshot 中同 item id 但内容不同，本设计会保留 snapshot 内容并跳过 live update。这符合 snapshot replay duplicate 的语义，但要求分类索引只能来自 attach snapshot，不能扩展到普通 live 流。
- 如果未来有新的消费者直接读取 `eventBuffer`，必须明确处理 `replay` 字段，否则可能重新暴露 duplicate UI。
- 如果后续真实日志证明 server 产生的不是“snapshot ahead + parent 接旧 head”，而是 commit chain 本身断裂，本设计不会掩盖该问题，仍会进入 manual reconnect。

## 验证

预期验证命令以当前 `codex-gui/package.json` 实际脚本为准。实施计划落盘前必须重新读取 `codex-gui/package.json` 确认命令存在。

本设计阶段不运行测试。
