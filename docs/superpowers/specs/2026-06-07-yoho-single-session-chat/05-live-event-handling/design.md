# Live Event Handling Design

## 目标

`05 Live Event Handling` 负责把 `threadRuntime.eventBuffer` 中的 accepted live projection events 转成后续聊天界面可消费的 live material，并把 `threadRuntime.subscription` 中的手动重连状态转成 live status material。

这一层位于 `04a ProjectionSlice Cleanup` 之后、`05a Streaming Readiness` 和 `06 Basic Chat Surface` 之前。它只建立 replay/live 统一输入流，不解释聊天内容，不派生 chat view model，不实现 composer、reconnect button 或 tool activity UI。

完成后，后续 `06 Basic Chat Surface` 可以从一个组合 selector 读取 ordered timeline material：

```text
snapshotReplay materials
  + liveEventHandling materials
  + live subscription status material
```

## 已确认决策

**决策 1：纯 selector 派生层**

`05` 只新增纯派生层，不新增 Redux state，不修改 `threadRuntimeSlice` 的 reducer 职责。

- `threadRuntimeSlice` 继续保存 runtime baseline、event buffer、active turn 和 subscription state。
- `liveEventHandling` 从 `threadRuntime.eventBuffer` 和 `threadRuntime.subscription` 派生 material。
- `liveEventHandling` 不消费、不清空、不重排 `eventBuffer`。

**决策 2：复用 replay material 的语义形状**

Live material 与 `04 Snapshot Replay` 的 material 保持同一语义层级，但用 `source` 区分来源。

- replay material 使用 `source: "snapshotReplay"`。
- live material 使用 `source: "liveEvent"`。
- 后续 `06` 可以把 replay 和 live 当成同一 timeline 输入处理，同时仍能识别来源，避免 replay 触发 live-only 副作用。

**决策 3：保留 item lifecycle 差异**

`itemStarted` 和 `itemCompleted` 在 `05` 中保留为不同 material。

`05` 不合并同一个 item 的 started/completed lifecycle，不判断 item 的最终文本，也不判断它属于 assistant message、tool activity 或 status row。这些解释留给 `06 Basic Chat Surface` 和 `08 Tool Activity`。

**决策 4：manual reconnect 进入 live status material**

当 `threadRuntime.subscription.state === "manualReconnectRequired"` 时，`05` 派生一个 live status material，表达当前 projection subscription 已中断并需要用户手动重连。

该 material 只表达状态，不实现重连按钮，不自动重新 attach，也不改变当前 GUI host debug panel。

**决策 5：提供 replay + live 组合 selector**

`05` 除了提供 live-only selectors，也提供一个组合 selector，把 `selectSnapshotReplayMaterials` 与 live materials 拼成统一 timeline material。

`05` 不迁移 `snapshotReplay` 模块，不重写 replay 逻辑，只组合现有 replay selector 的输出和新增 live material。

## 范围

这一层处理：

- 从 `threadRuntime.eventBuffer` 派生 live turn lifecycle material。
- 从 `threadRuntime.eventBuffer` 派生 live item lifecycle material。
- 从 `threadRuntime.subscription` 派生 manual reconnect status material。
- 提供 replay/live 组合 selector，供后续 chat surface 消费。
- 保留 replay 与 live 的 source 信息。

这一层不处理：

- 不新增 Redux state。
- 不修改 `threadRuntimeSlice` 的 reducer 语义。
- 不消费或清空 `threadRuntime.eventBuffer`。
- 不合并 `itemStarted` 和 `itemCompleted`。
- 不解释 `ThreadItem` 的内容类型。
- 不派生 user / assistant / tool 的 chat view model。
- 不渲染 UI。
- 不修改当前 GUI host debug panel。
- 不实现 reconnect button。
- 不自动重新 attach。
- 不接入 streaming delta notification。
- 不处理 composer、`turn/start` 或 `turn/interrupt`。

## 当前基线

`03 Thread Runtime Store` 已经把 accepted live projection events 写入 `threadRuntime.eventBuffer`，并只维护 active turn：

```text
turnStarted   -> buffer event, set active turn
turnCompleted -> buffer event, clear active turn only when matching
itemStarted   -> buffer event only
itemCompleted -> buffer event only
```

`04 Snapshot Replay` 已经从 `threadRuntime.snapshotTurns` 派生 replay material，并明确不会消费 live event buffer。

`04a ProjectionSlice Cleanup` 已经删除旧 `projectionSlice` truth model。后续 `05/06/08` 不能再沿旧的 turn/item upsert 模型推进。

因此 `05` 的输入事实只有：

```text
selectThreadRuntimeEventBuffer(state)
selectThreadRuntimeSubscription(state)
selectSnapshotReplayMaterials(state)
```

## TUI Alignment

`05` 对齐的是 TUI 中 `ThreadEventStore` 之后、`ChatWidget` 之前的 replay/live 输入边界，而不是复刻 TUI 的命令式 `ChatWidget.handle_server_notification` 调用方式。

TUI 的 `ThreadEventStore` 负责保存 per-thread session、turns、buffer、active turn 和 input state；live notification 进入 store 后只更新 active turn 并留在 buffer。thread switch 或恢复时，TUI 从 store 生成 `ThreadEventSnapshot`，再把 saved turns 和 buffered events replay 到新的 `ChatWidget`。

GUI 的等价边界是：

```text
threadRuntime.snapshotTurns -> snapshotReplay materials
threadRuntime.eventBuffer   -> liveEventHandling materials
```

TUI live path 会立即执行 UI side effects；GUI 在 `05` 中只派生 material，把具体 UI side effects 和 item 内容解释延后到 `06 Basic Chat Surface` 和 `08 Tool Activity`。这是浏览器/Redux 环境下的等价实现方式，不表示 `05` 要承担 TUI `ChatWidget` 的渲染职责。

`manualReconnectRequired` 没有 TUI 直接对应物。它来自 GUI projection subscription 的 commit-chain、missing-turn 和 backpressure 语义，是 GUI projection 输入面的专属中断状态。`05` 只把该状态表示成 live status material，不把它混同为 TUI thread close 或 turn completion。

## 目标架构

`05` 完成后的数据流是：

```text
ProjectionIngressAdapter
  -> threadRuntimeSlice
     -> snapshotTurns
        -> snapshotReplay materials
     -> eventBuffer
        -> liveEventHandling materials
     -> subscription
        -> live subscription status material
  -> combined timeline selector
```

推荐新增模块：

```text
codex-gui/src/features/liveEventHandling/liveEventHandling.ts
codex-gui/src/features/liveEventHandling/__tests__/liveEventHandling.test.ts
```

`liveEventHandling.ts` 负责导出：

```ts
type TimelineMaterial =
  | SnapshotReplayMaterial
  | LiveEventMaterial
  | LiveSubscriptionMaterial;

selectLiveEventMaterials(state): LiveEventMaterial[]
selectLiveSubscriptionMaterials(state): LiveSubscriptionMaterial[]
selectThreadTimelineMaterials(state): TimelineMaterial[]
```

命名可以在实施时按 TypeScript 类型复用情况微调，但职责边界不能改变。

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

`itemStarted` 和 `itemCompleted` material 可以携带原始 `ThreadItem`，但不能在 `05` 中解释 item type。后续 `06/08` 根据 item type 决定如何展示 user message、assistant message、tool activity 或 status。

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

组合 selector 的输出顺序为：

```text
snapshotReplay materials
then liveEvent materials in eventBuffer order
then live subscription status material when present
```

理由：

- attach snapshot 是 runtime baseline，必须先 replay。
- accepted live events 按 `eventBuffer` append 顺序处理。
- manual reconnect status 表达当前订阅状态，作为 timeline 尾部 status material 供后续 UI 展示最新中断状态。

`05` 不根据 timestamp 重排 material，也不尝试把 live event 插回 snapshot turn 内部。

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
selectThreadTimelineMaterials(state) -> []
```

如果 runtime 已经进入 manual reconnect required，`threadRuntimeSlice` 会阻止后续 events 进入 buffer；`05` 不需要重复实现该保护，只按当前 runtime state 派生输出。

## 测试策略

Focused tests 覆盖 `liveEventHandling` 的派生行为：

- 无 runtime 时，live selectors 和组合 selector 返回空数组。
- `turnStarted` event 派生 live turnStarted material。
- `itemStarted` 和 `itemCompleted` 派生不同 live material，并保留原始 item。
- `turnCompleted` 派生 live turnCompleted material。
- live materials 保持 `eventBuffer` 顺序。
- snapshot replay material 出现在组合 selector 的 live material 之前。
- subscription active 时不产生 status material。
- manual reconnect required 时产生 subscription interrupted material。
- manual reconnect status material 出现在组合 selector 末尾。
- live selectors 不修改 runtime state，不消费 `eventBuffer`。

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
- replay/live 组合 selector 按 snapshot first、live event second、subscription status last 的顺序输出。
- live material 使用 `source: "liveEvent"`。
- replay material 继续使用 `source: "snapshotReplay"`。
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

## 后续阶段边界

`05a Streaming Readiness` 负责设计 assistant message 的 append buffer 形状，并为未来非 projection delta 输入预留入口。`05` 不接入 delta，也不假设 projection event 能提供逐字流式内容。

`06 Basic Chat Surface` 才消费组合 timeline material，并把 replay/live material 解释成普通聊天 view model。`06` 可以决定 user message、assistant message、基础 Markdown、status row 的展示，但不能反向修改 `05` 的 runtime/material 边界。

`08 Tool Activity` 才解释 tool item 并派生简化 tool activity 展示。`05` 只保留 item lifecycle 和原始 item。
