# Live Event Handling Design

## 目标

`05 Live Event Handling` 负责把 `threadRuntime.eventBuffer` 中的 accepted live projection events 转成结构化 live material，并把 `threadRuntime.subscription` 中的手动重连状态转成 live status material。

这一层位于 `04a ProjectionSlice Cleanup` 之后、`05b Incremental Chat State Boundary` 之前。它是 replay/debug/test 可复用的材料边界，不是 active chat surface 的 steady-state 状态边界。

`05` 不能让后续聊天界面在每个 notification 到达后从 `snapshotReplay + eventBuffer` 全量 fold 出 UI model。active chat surface 必须走 `05b` 的物化增量状态。

## 范围

这一层处理：

- 从 `threadRuntime.eventBuffer` 派生 live turn lifecycle material。
- 从 `threadRuntime.eventBuffer` 派生 live item lifecycle material。
- 从 `threadRuntime.subscription` 派生 manual reconnect status material。
- 保留 replay 与 live 的 source 信息，供 replay/debug/focused tests 和后续增量 reducer 复用。

这一层不处理：

- 不新增 Redux state。
- 不修改 `threadRuntimeSlice` 的 reducer 语义。
- 不消费或清空 `threadRuntime.eventBuffer`。
- 不把 `eventBuffer` 当作 active chat surface 每次 render 或 selector 的事实源。
- 不合并 `itemStarted` 和 `itemCompleted`。
- 不解释 `ThreadItem` 的内容类型。
- 不派生 user / assistant / tool 的 chat view model。
- 不渲染 UI。
- 不实现 reconnect button。
- 不自动重新 attach。
- 不接入 streaming delta notification。
- 不处理 composer、`turn/start` 或 `turn/interrupt`。

## 已确认决策

**决策 1：纯材料转换层**

`05` 只新增纯派生层，不新增 Redux state。它可以从 `threadRuntime.eventBuffer` 生成 typed live material，方便 focused tests、debug 或后续 `05b` 复用转换逻辑。

`05` 不消费、不清空、不重排 `eventBuffer`。

**决策 2：`eventBuffer` 是 replay tail，不是 live UI 输入源**

`threadRuntime.eventBuffer` 的定位是 bounded replay/reconnect tail。它保留 accepted live events，供明确 replay 场景、debug 和 focused tests 使用。

后续 active chat surface 不能从 `eventBuffer.map(...)` 或 `snapshotReplay + eventBuffer` 每次全量重建。`05` 提供的 selectors 不能被 `06a/06b/06c` 当作 steady-state chat 输入。

**决策 3：保留 live material 类型**

Live material 与 `04 Snapshot Replay` 的 material 保持同一语义层级，但用 `source` 区分来源：

- replay material 使用 `source: "snapshotReplay"`。
- live material 使用 `source: "liveEvent"`。

这条 source 边界用于 replay/debug/focused tests 和 `05b` apply 输入。它不意味着 UI 可以每次组合 replay/live materials 后 full fold。

**决策 4：保留 item lifecycle 差异**

`itemStarted` 和 `itemCompleted` 在 `05` 中保留为不同 material。

`05` 不合并同一个 item 的 started/completed lifecycle，不判断 item 的最终文本，也不判断它属于 assistant message、tool activity 或 status row。这些解释留给 `05b Incremental Chat State Boundary` 和 `08 Tool Activity`。

**决策 5：manual reconnect 进入 status material**

当 `threadRuntime.subscription.state === "manualReconnectRequired"` 时，`05` 可以派生一个 live status material，表达当前 projection subscription 已中断并需要用户手动重连。

该 material 只表达状态，不实现重连按钮，不自动重新 attach，也不改变当前 GUI host debug panel。

**决策 6：组合 timeline selector 只能用于 replay/debug/test**

`05` 可以保留 replay + live 的组合 selector，用于 focused tests、debug 或明确 replay material inspection。

该 selector 不属于 active chat surface 的长期数据路径。`06a Chat Text Model` 必须改为消费 `05b` 的 prepared chat facts selectors，而不是消费 `selectThreadTimelineMaterials(state)`。

## 当前基线

`03 Thread Runtime Store` 已经把 accepted live projection events 写入 `threadRuntime.eventBuffer`，并只维护 active turn：

```text
turnStarted   -> buffer event, set active turn
turnCompleted -> buffer event, clear active turn only when matching
itemStarted   -> buffer event only
itemCompleted -> buffer event only
```

`04 Snapshot Replay` 已经从 `threadRuntime.snapshotTurns` 派生 replay material，并明确不会消费 live event buffer。

`04a ProjectionSlice Cleanup` 已经删除旧 `projectionSlice` truth model。后续 `05/05b/06/08` 不能再沿旧的 turn/item upsert 模型推进。

因此 `05` 的输入事实只有：

```text
selectThreadRuntimeEventBuffer(state)
selectThreadRuntimeSubscription(state)
selectSnapshotReplayMaterials(state)
```

这些输入可以产生 material，但不能成为 active chat surface 的 steady-state truth。

## TUI Alignment

TUI 的 live path 是：

```text
ServerNotification
  -> ThreadEventStore.push_notification(notification)
  -> if thread active: send same event to active_thread_rx
  -> drain active receiver
  -> ChatWidget.handle_server_notification(notification, None)
```

`ThreadEventStore.buffer` 是 bounded replay tail。live render 不读取 `ThreadEventStore.snapshot()`，也不从 `turns + buffer` 每次 fold UI。

TUI 的 replay path 是：

```text
ThreadEventStore.snapshot()
  -> rebuild ChatWidget
  -> replay_thread_turns(snapshot.turns, ThreadSnapshot)
  -> handle_thread_event_replay(snapshot.events, ThreadSnapshot)
```

GUI 的 `05` 只覆盖 `ThreadEventStore.buffer` 到 typed material 的数据解释前置层。GUI 还必须补 `05b`，作为浏览器侧 active chat facts owner。`05b` 只对齐 `ChatWidget` 按条处理 notification 的 chat fact materialization subset，不承载完整 render-ready transcript cells 或 streaming tail。

## 目标架构

`05` 完成后的数据流是：

```text
ProjectionIngressAdapter
  -> threadRuntimeSlice
     -> eventBuffer
        -> liveEventHandling materials
     -> subscription
        -> live subscription status material
  -> replay/debug/focused tests
  -> 05b incremental chat state apply input
```

active chat UI 的长期数据流必须是：

```text
ProjectionIngressAdapter
  -> threadRuntimeSlice event action
  -> 05b incrementalChatStateSlice extraReducers
  -> 06a chat text model selectors
  -> React UI
```

推荐模块保持：

```text
codex-gui/src/features/liveEventHandling/liveEventHandling.ts
codex-gui/src/features/liveEventHandling/__tests__/liveEventHandling.test.ts
```

`liveEventHandling.ts` 可以导出：

```ts
type TimelineMaterial =
  | SnapshotReplayMaterial
  | LiveEventMaterial
  | LiveSubscriptionMaterial;

selectLiveEventMaterials(state): LiveEventMaterial[]
selectLiveSubscriptionMaterials(state): LiveSubscriptionMaterial[]
selectThreadTimelineMaterialsForReplayDebug(state): TimelineMaterial[]
```

如果保留旧名 `selectThreadTimelineMaterials`，文档和测试必须明确它不是 chat surface selector。实施阶段可以选择重命名来降低误用风险。

## Material 语义

Live event material 必须保留 projection event 的 lifecycle 信息：

```text
turnStarted   -> live turnStarted material
itemStarted   -> live itemStarted material
itemCompleted -> live itemCompleted material
turnCompleted -> live turnCompleted material
```

Live source 固定为：

```text
"liveEvent"
```

Replay source 继续由 `snapshotReplay` 模块负责，固定为：

```text
"snapshotReplay"
```

`turnCompleted` material 应保留与 replay 侧一致的 turn summary 语义：不需要携带完整 `items` 列表，因为 item lifecycle 已通过单独 material 表达。

`itemStarted` 和 `itemCompleted` material 可以携带原始 `ThreadItem`，但不能在 `05` 中解释 item type。`05b/08` 根据 item type 决定如何展示 user message、assistant message、tool activity 或 status。

Manual reconnect status material 的语义是：

```text
subscriptionInterrupted(source=liveEvent, reason, subscriptionId)
```

其中 `reason` 来自 projection ingress 的 manual reconnect reason：

```text
commitChainMismatch
missingTurn
backpressure
```

## Ordering

Live-only selectors 保持 `eventBuffer` append 顺序。

如果提供 replay/debug 组合 selector，输出顺序为：

```text
snapshotReplay materials
then liveEvent materials in eventBuffer order
then live subscription status material when present
```

该顺序只描述 replay/debug material inspection，不授权 active chat surface 每次按这个序列 full fold UI。

## Error And Reconnect Handling

`05` 只表达手动重连状态，不执行重连。

当 subscription active 时：

```text
selectLiveSubscriptionMaterials(state) -> []
```

当 subscription manual reconnect required 时：

```text
selectLiveSubscriptionMaterials(state) -> [subscriptionInterrupted]
```

如果 runtime 不存在：

```text
selectLiveEventMaterials(state) -> []
selectLiveSubscriptionMaterials(state) -> []
selectThreadTimelineMaterialsForReplayDebug(state) -> []
```

如果 runtime 已经进入 manual reconnect required，`threadRuntimeSlice` 会阻止后续 events 进入 buffer；`05` 不需要重复实现该保护，只按当前 runtime state 派生输出。

## 测试策略

Focused tests 覆盖 `liveEventHandling` 的派生行为：

- 无 runtime 时，live selectors 和 replay/debug 组合 selector 返回空数组。
- `turnStarted` event 派生 live turnStarted material。
- `itemStarted` 和 `itemCompleted` 派生不同 live material，并保留原始 item。
- `turnCompleted` 派生 live turnCompleted material。
- live materials 保持 `eventBuffer` 顺序。
- replay/debug 组合 selector 中 snapshot replay material 出现在 live material 之前。
- subscription active 时不产生 status material。
- manual reconnect required 时产生 subscription interrupted material。
- manual reconnect status material 出现在 replay/debug 组合 selector 末尾。
- live selectors 不修改 runtime state，不消费 `eventBuffer`。
- tests 命名或断言必须明确该组合 selector 不是 active chat surface 输入。

常规验证命令：

```bash
pnpm --dir codex-gui exec vitest --run src/features/liveEventHandling/__tests__/liveEventHandling.test.ts
pnpm --dir codex-gui exec vitest --run src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts
pnpm --dir codex-gui exec vitest --run src/features/snapshotReplay/__tests__/snapshotReplay.test.ts
pnpm --dir codex-gui run type-check
```

实现阶段如果 `05` 改动影响 GUI package，最终还需要按 GUI 变更规则补跑：

```bash
pnpm --dir codex-gui run ci
```

## 验收标准

`05` 完成后：

- 存在独立 `liveEventHandling` 边界。
- `threadRuntime.eventBuffer` 可以派生 live turn lifecycle material。
- `threadRuntime.eventBuffer` 可以派生 live item lifecycle material。
- `itemStarted` 和 `itemCompleted` 在 live material 中保持不同类型。
- `threadRuntime.subscription` 可以派生 manual reconnect status material。
- live material 使用 `source: "liveEvent"`。
- replay material 继续使用 `source: "snapshotReplay"`。
- replay/debug 组合 selector 如保留，必须标注不能作为 active chat surface steady-state 输入。
- `05` 不新增 Redux state。
- `05` 不修改或消费 `eventBuffer`。
- `05` 不解释 item 内容类型。
- `05` 不派生 chat view model。
- `05` 不改变 GUI host debug panel。
- focused tests 和 type-check 通过。

不以以下事项作为 `05` 验收：

- 不要求聊天 UI 出现。
- 不要求 assistant message 渲染。
- 不要求 tool activity 展示。
- 不要求 reconnect button 出现。
- 不要求自动重连。
- 不要求 streaming delta 输入。
- 不要求 composer 可发送消息。
- 不要求 active chat surface 消费 `selectThreadTimelineMaterials`。

## 后续阶段边界

`05b Incremental Chat State Boundary` 负责建立浏览器侧 chat facts owner。它从 attach snapshot 建 baseline，并按 accepted live notification 增量 apply。

`06a Chat Text Model` 只消费 `05b` 的 prepared chat facts selectors，不直接解释 `TimelineMaterial`，也不从 `snapshotReplay + eventBuffer` full fold。

`08 Tool Activity` 才解释 tool item 并派生简化 tool activity 展示。`05` 只保留 item lifecycle 和原始 item。
