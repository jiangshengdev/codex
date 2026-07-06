# projection delta RAF batch 设计

日期: 2026-07-06
状态: 02f 设计
范围: Codex GUI `thread/projection/delta` 进入 Redux 前的按帧批处理；修正 frontend performance hot path 08 的 Redux action 频率问题

## 目标

本设计降低 agent message streaming delta 对 Redux 和 React subscription 链路的触发频率。

当前 GUI 每收到一条 `thread/projection/delta(agentMessage)`，都会同步 dispatch 一次
`threadRuntimeDeltaAccepted`，随后 `transcriptState` reducer 写入一次 live render state。这会把
Redux action、Immer 写入和 store subscription 通知频率绑定到网络 delta 频率。

本设计改为在 `GuiHostConnectionBridge` 中缓存已通过 ingress 判定的 delta notification，并按
`requestAnimationFrame` flush 成批量 Redux action。

## 被修正的问题边界

本设计只修正 hot path 08:

- `thread/projection/delta` 逐条进入 Redux action。
- 高频 delta 导致高频 Immer reducer 写入。
- 高频 delta 导致高频 store subscription 通知。

本设计不再把 selector materialization 作为 08 的核心问题。02e 已经把 live agent message render state
改成 reducer 写入时维护，`selectTranscriptLiveItemsForTurn` 应直接读取 `liveItemsByTurnId[turnId]`。

## 决策 1: buffer 放在 `GuiHostConnectionBridge`

`guiHostClient` 继续逐条解析 WebSocket JSON-RPC notification。

`ProjectionIngressAdapter` 继续只做同步语义判定:

- thread 是否匹配。
- subscription 是否匹配。
- 当前是否已经要求 manual reconnect。
- delta 是否可以被当前 projection subscription 接受。

`ProjectionIngressAdapter` 不持有 delta buffer，也不负责按帧调度。

`GuiHostConnectionBridge` 是最窄的调度边界。它已经把 `ProjectionIngressOutcome` 转换成 Redux action，
所以 delta batching 应该发生在这里，而不是污染 ingress adapter 的协议语义。

## 决策 2: 新增批量 cross-slice action

新增 action:

```text
threadRuntimeDeltasAccepted({ notifications })
```

其中 `notifications` 保留原始 `ThreadProjectionDeltaNotification[]`，顺序与 bridge 接收并接受的顺序一致。

保留现有单条 action:

```text
threadRuntimeDeltaAccepted({ notification })
```

理由:

- 单条 action 仍可用于已有测试和窄路径。
- 批量 action 语义明确，不把单条 payload 改成 union。
- `threadRuntime` 仍只作为 cross-slice signal，不把 transient delta 存入 runtime buffer。
- `transcriptState` 可以同时处理单条和批量 action，批量 reducer 内按原始顺序 apply。

## 决策 3: 按 `requestAnimationFrame` flush

bridge 收到 `deltaAccepted` 后，不立即 dispatch。它把 notification 追加到 pending buffer，并确保存在一个
pending animation frame callback。

frame callback 执行时:

1. 读取并清空 pending buffer。
2. 如果 buffer 非空，dispatch 一次 `threadRuntimeDeltasAccepted({ notifications })`。
3. 保持 notifications 内部顺序不变。

如果环境没有可用的 `requestAnimationFrame`，实现可以使用同等的下一帧调度抽象，但语义仍应是 UI frame
节奏，而不是 microtask 级别 flush。

## 决策 4: 结构性消息前必须同步 flush

为了保持 projection 顺序语义，bridge 在处理以下 outcome 前必须先同步 flush pending deltas:

- `attachAccepted`
- `eventAccepted`
- `manualReconnectRequired`
- `closed` 触发的 manual reconnect outcome

特别是 `eventAccepted(itemCompleted)` 前必须 flush 已缓存 delta，避免 store 中出现 completed 先处理、前序
delta 后处理的顺序反转。

同步 flush 不等待下一帧。它只把当前 pending buffer 立即 dispatch 成一次批量 action，然后继续处理结构性
outcome。

## 决策 5: 批量 action 不合并文本

`threadRuntimeDeltasAccepted` 不按 `turnId + itemId` 合并文本，不提前拼接 `delta` 字符串。

批量 action 内保留每条原始 notification，`transcriptState` 逐条执行与单条 action 相同的 apply 逻辑。

理由:

- 08 只降低 Redux dispatch 和 subscription 频率。
- 09 的 `transientText += delta` 字符串累加成本需要单独设计。
- bridge 不应理解 agent message payload 的文本合并策略。
- 保留每条 notification 有利于测试顺序、thread/subscription 过滤和未来 delta 类型扩展。

## 数据流

### 普通 delta burst

```text
thread/projection/delta
  -> guiHostClient onProjectionDelta(notification)
  -> ProjectionIngressAdapter.handleDelta(notification)
  -> deltaAccepted(notification)
  -> GuiHostConnectionBridge pendingDeltaNotifications.push(notification)
  -> requestAnimationFrame
  -> dispatch threadRuntimeDeltasAccepted({ notifications })
  -> transcriptState apply notifications in order
```

### delta 后跟 itemCompleted

```text
thread/projection/delta accepted
  -> pending buffer

thread/projection/event(itemCompleted)
  -> flush pending deltas synchronously
  -> dispatch threadRuntimeDeltasAccepted({ notifications })
  -> process eventAccepted(itemCompleted)
  -> dispatch threadRuntimeEventBuffered(...)
```

### cleanup

component unmount 或 connection cleanup 时，bridge 必须取消 pending frame，并清空 pending buffer。

如果 cleanup 前需要保留已收到但未写入 store 的 delta，必须先同步 flush；否则 cleanup 后不得再 dispatch 到已卸载的
bridge。

## 不变量

### projection 顺序不反转

同一 connection 中，已被接受的 delta 不得越过后续结构性 event 写入 store。

### ingress adapter 保持同步纯判定

`ProjectionIngressAdapter` 不持有 UI frame buffer，不调度 timer，不 dispatch Redux action。

### runtime 不保存 transient delta

`threadRuntimeSlice` 的 delta action 仍是 cross-slice signal。runtime 自身不把 delta 放进 event buffer。

### completed 仍是权威收敛点

`itemCompleted(agentMessage)` 仍是最终文本和 phase 的权威来源。批处理不能让 delta 写入 committed transcript。

### 批量 action 内顺序稳定

`threadRuntimeDeltasAccepted.notifications` 内部顺序必须等于 bridge 接受 delta 的顺序。

## 错误和生命周期边界

- malformed JSON-RPC payload 仍由 `guiHostClient` 处理，不进入 bridge buffer。
- stale subscription、wrong thread 和 manual reconnect 后的 delta 仍由 `ProjectionIngressAdapter` 忽略，不进入 buffer。
- manual reconnect required 前必须同步 flush 已接受 delta，再 dispatch reconnect status。
- unmount 后不得执行 pending RAF dispatch。
- 如果 flush 时 buffer 为空，不 dispatch 批量 action。

## 验证关注点

后续 implementation plan 应覆盖以下行为:

- 多条 accepted delta 在同一 frame 内只产生一次批量 action。
- `eventAccepted(itemCompleted)` 前会同步 flush pending delta。
- `attachAccepted` 和 manual reconnect outcome 前会同步 flush pending delta。
- cleanup 后 pending frame 不会 dispatch。
- `transcriptState` 对单条和批量 action 的处理结果一致。

## 非目标

- 不修改 Rust projection 实现。
- 不修改 app-server v2 协议字段。
- 不修改 `thread/projection/delta` wire shape。
- 不设计 09 的字符串累加结构。
- 不把 delta 写入 committed transcript。
- 不设计 assistant text UI、Streamdown 或 Markdown streaming renderer。
- 不设计 thinking、tool call、exec output 或 command output streaming。
- 不编写 implementation plan。
- 不指定具体测试命令。
