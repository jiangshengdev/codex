# Thread Runtime Store Design

## 目标

`03 Thread Runtime Store` 建立 GUI 单会话聊天的 runtime 状态层。

这一层位于 `02 Projection Ingress Adapter` 之后、`04 Snapshot Replay` 和
`05 Live Event Handling` 之前。它只接收已经通过 identity gate 和 projection ingress
校验的输入，并把这些输入保存成后续 replay/live 阶段可消费的 runtime 材料。

`03` 的设计必须对齐 TUI `ThreadEventStore`，不能沿用现有临时 `projectionSlice` 的
turn/item upsert 模型。runtime store 的职责是保存 baseline、buffer、active turn 和订阅状态，
不是解释 item、生成聊天消息或驱动 UI。

## 范围

这一层处理：

- `ProjectionIngressOutcome.attachAccepted`。
- `ProjectionIngressOutcome.eventAccepted`。
- `ProjectionIngressOutcome.manualReconnectRequired`。
- attach snapshot 中的 thread metadata 和 snapshot turns。
- accepted live event 的 runtime buffer。
- active turn tracking。
- subscription active / manual reconnect required 状态。

这一层不处理：

- 不校验 commit chain、subscription 或 missing turn；这些属于 `02`。
- 不把 item upsert 到 turns/items。
- 不解释 `itemStarted` / `itemCompleted`。
- 不做 snapshot replay。
- 不做 live event handling 的 UI 副作用。
- 不派生 chat view model。
- 不设计 composer、tool activity 或 reconnect button。
- 不自动重新 attach。

## TUI 对齐点

TUI 的 `ThreadEventStore` 保存 `session`、`turns`、`buffer`、`active_turn_id`、
`input_state` 和 `active`。对 live notification，它的核心行为是：

- 把 notification 放入 buffer。
- `TurnStarted` 设置 `active_turn_id`。
- 只有匹配当前 active turn 的 `TurnCompleted` 才清空 `active_turn_id`。
- `ItemStarted` / `ItemCompleted` 留在 buffer，语义解释交给 `ChatWidget`。

GUI `03` 只实现这条边界在浏览器 Redux store 中的等价形状。由于 GUI 第一版只支持
单会话，可以先只有一个 runtime record；但 record 内部必须保留 TUI 的职责分离，不能把
runtime store 做成 chat truth model。

## 设计决策

**A. Runtime Store State Boundary**

`03` 使用最小 runtime record。它保存当前 single-session thread runtime 的事实，而不是
聊天展示模型。

**B. Temporary `projectionSlice` Replacement Window**

新增 `threadRuntimeSlice`。旧 `projectionSlice` 可以在 `03` 实现期间为了兼容测试或旧调试面板
短暂共存，但它不是 truth model。

`projectionSlice` 的删除窗口：

- 最早：`04 Snapshot Replay`。
- 最晚：`05 Live Event Handling` 完成前。

它不能进入 `06 Basic Chat Surface`。

**C. Attach Snapshot Baseline**

`attachAccepted` 建立 runtime baseline。baseline 保存 thread metadata 和 snapshot turns，并从
snapshot turns 中倒序找到最后一个 `status === "inProgress"` 的 turn 作为 `activeTurnId`。

这一步只建立 runtime state，不触发 replay 副作用，不派生聊天消息。

**D. Event Buffer Model**

accepted live event 只进入 runtime `eventBuffer`，并按 TUI 规则维护 `activeTurnId`：

- `turnStarted`：写入 buffer，并设置 `activeTurnId = notification.turn.id`。
- `turnCompleted`：写入 buffer；只有 `notification.turn.id === activeTurnId` 时清空
  `activeTurnId`。
- `itemStarted`：只写入 buffer，不更新 snapshot turns，不 upsert item。
- `itemCompleted`：只写入 buffer，不更新 snapshot turns，不 upsert item。

**E. Manual Reconnect State**

`manualReconnectRequired` 进入 runtime subscription state。进入该状态后，后续 accepted event
不能继续改变 runtime baseline、buffer 或 active turn。新的 accepted attach 会重建 baseline，并恢复
active subscription。

## 状态模型

推荐实现形状：

```ts
type ThreadRuntimeSubscription =
  | { state: "active" }
  | {
      state: "manualReconnectRequired";
      reason: "commitChainMismatch" | "missingTurn" | "backpressure";
      subscriptionId: string | null;
    };

type ThreadRuntimeBufferedEvent =
  | {
      type: "projectionEvent";
      notification: ThreadProjectionEventNotification;
    };

type ThreadRuntimeRecord = {
  threadId: string;
  sessionId: string;
  thread: Omit<Thread, "turns">;
  snapshotTurns: Turn[];
  eventBuffer: ThreadRuntimeBufferedEvent[];
  activeTurnId: string | null;
  subscription: ThreadRuntimeSubscription;
};

type ThreadRuntimeState = {
  current: ThreadRuntimeRecord | null;
};
```

字段含义：

- `threadId` 是已经通过 `01` 和 `02` 的当前 thread。
- `sessionId` 来自 attach snapshot 的 `thread.sessionId`，方便后续与 TUI `session` 概念对齐。
- `thread` 保存不含 `turns` 的 thread metadata，避免 baseline turns 和 live event buffer 出现重复所有权。
- `snapshotTurns` 是 attach snapshot 的 turns baseline。
- `eventBuffer` 保存 accepted live event，后续 `05` 可以按 live path 消费。
- `activeTurnId` 是 runtime active turn cache，不是聊天 UI 状态。
- `subscription` 表达当前 projection baseline 是否仍可继续消费。

`eventBuffer` 使用通用命名，而不是 `projectionEventBuffer`，是为了给后续普通 notification streaming
并入同一 runtime 留出口。`03` 第一版只需要保存 projection event variant。

## 输入处理

### Attach Accepted

`attachAccepted` 表示 `02` 已经确认 snapshot 可以作为新的 baseline。

处理规则：

- 从 `response.snapshot.thread` 拆出 `thread` metadata 和 `snapshotTurns`。
- 清空旧 `eventBuffer`。
- 从 `snapshotTurns` 倒序找到最后一个 `status === "inProgress"` 的 turn。
- 设置 `subscription = { state: "active" }`。
- 替换 `current` runtime record。

新的 attach 总是完整重建 runtime baseline。它也是手动重连后的恢复入口。

### Event Accepted

`eventAccepted` 表示 `02` 已经确认 event 与当前 subscription、commit chain 和 known turn 索引连续。

处理规则：

- 如果 `current == null`，忽略 event。
- 如果 `current.subscription.state !== "active"`，忽略 event。
- 否则把 event 包装成 `ThreadRuntimeBufferedEvent` 追加到 `eventBuffer`。
- 根据 event 类型维护 `activeTurnId`：
  - `turnStarted` 设置 active turn。
  - matching `turnCompleted` 清空 active turn。
  - item event 不改变 active turn。

`03` 不从 `turnCompleted.notification.turn` 替换 snapshot turn，也不从 item notification 修改任何
turn items。完整解释留给后续 replay/live 层。

### Manual Reconnect Required

`manualReconnectRequired` 表示 projection baseline 已断裂或订阅因 backpressure 失效。

处理规则：

- 如果 `current == null`，忽略该 outcome；没有 runtime baseline 时，不创建无 thread 的 interrupted
  state。
- 如果有 current runtime，设置：

```ts
subscription = {
  state: "manualReconnectRequired",
  reason,
  subscriptionId,
};
```

- 不清空 `snapshotTurns` 或 `eventBuffer`。
- 不自动重新 attach。
- 不继续接受后续 event 对 runtime 的改变。

保留旧 baseline 的原因是后续 UI 可以在显示“状态已过期，需要重连”时继续展示已有内容。真正恢复发生在
新的 `attachAccepted`。

## Selectors

`03` 只需要提供 runtime 基础 selectors，不提供 chat view model：

- `selectThreadRuntimeRecord(state): ThreadRuntimeRecord | null`
- `selectThreadRuntimeActiveTurnId(state): string | null`
- `selectThreadRuntimeSubscription(state): ThreadRuntimeSubscription | null`
- `selectThreadRuntimeEventBuffer(state): ThreadRuntimeBufferedEvent[]`

这些 selectors 供 `04/05` 和测试使用。`06` 之后的 chat surface 不能直接把它们当最终 UI 模型，
必须通过后续 view model 层派生。

## 与相邻阶段的边界

`01 Thread Identity Shell`：

- 01 决定 launch thread 和 attach thread 是否一致。
- 03 只接收已经通过 identity gate 的 attach outcome。
- identity mismatch 不由 03 修复。

`02 Projection Ingress Adapter`：

- 02 负责 thread/subscription/commit/missing turn 校验。
- 03 不重复这些协议判断。
- 02 产出的 `manualReconnectRequired` 由 03 保存成 runtime subscription state。

`04 Snapshot Replay`：

- 04 消费 `snapshotTurns` 和 thread metadata，建立 replay path。
- 04 决定 replay kind 和 replay-only 副作用隔离。
- 03 不把 snapshot turns 转成聊天消息。

`05 Live Event Handling`：

- 05 消费 `eventBuffer`，按 live path 解释 live event。
- 05 决定 itemStarted/itemCompleted 如何进入 assistant/tool activity 模型。
- 03 不解释 item，也不维护 tool activity。

`05a Streaming Readiness`：

- 05a 可以扩展 `ThreadRuntimeBufferedEvent`，让 future streaming notification 与 projection event 共用
  runtime 边界。
- 03 的 `eventBuffer` 命名和 union 形状为这个扩展预留空间。

## 现有实现迁移方向

当前 `App.tsx` 在 adapter accepted 后仍会把 attach/event 转发给旧 `projectionSlice`。`03` 的实现计划
应该新增 `threadRuntimeSlice`，并把 `02` outcome 同步接入 runtime：

- `attachAccepted` dispatch 到 runtime baseline reducer。
- `eventAccepted` dispatch 到 runtime event buffer reducer。
- `manualReconnectRequired` dispatch 到 runtime subscription reducer。

旧 `projectionSlice` 在 `03` 可以短暂共存，但只能作为临时兼容路径。新测试和后续设计不能继续以
`projectionSlice` 的 upsert 结果作为 truth model。

## 验收标准

`03` 只验收 runtime store：

- accepted attach 能建立 `current` runtime record。
- runtime record 保存 thread metadata、`sessionId` 和 `snapshotTurns`。
- accepted attach 能从 snapshot turns 派生 `activeTurnId`。
- accepted attach 会清空旧 event buffer，并恢复 active subscription。
- accepted `turnStarted` 会进入 `eventBuffer` 并设置 `activeTurnId`。
- accepted matching `turnCompleted` 会进入 `eventBuffer` 并清空 `activeTurnId`。
- accepted non-matching `turnCompleted` 会进入 `eventBuffer`，但不清空当前 `activeTurnId`。
- accepted `itemStarted` / `itemCompleted` 只进入 `eventBuffer`，不 upsert turns/items。
- `manualReconnectRequired` 会进入 runtime subscription state。
- manual reconnect state 后的 event 不再改变 runtime。
- 新 accepted attach 会重建 baseline 并清除 manual reconnect state。
- App wiring 能证明 `02` outcome 已接到 runtime store。

不在 `03` 验收：

- 可见 reconnect UI。
- snapshot replay 结果。
- live event 渲染结果。
- chat message view model。
- assistant streaming buffer。
- composer 发送或中断。
- tool activity 展示。

## 设计原则

- TUI `ThreadEventStore` 是 `03` 的直接参考。
- Runtime store 保存 replay/live 材料，不解释 replay/live 行为。
- Baseline turns 和 live event buffer 分开保存，避免 destructive replacement。
- `ItemStarted` / `ItemCompleted` 在 `03` 只是 buffered event。
- `projectionSlice` 不能成为新的 truth model，也不能进入 chat surface 阶段。
