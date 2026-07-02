# Projection streaming delta 设计草案

## 状态

本文是设计草案，只记录当前已经确认的决策。它不包含实施计划，也不代表可以开始改代码。

## 背景

`thread/projection/attach` 和后续 `thread/projection/event` 为 GUI 提供一个带 snapshot baseline 的 projection stream。当前 projection live event 只覆盖结构性事件：

- `turnStarted`
- `turnCompleted`
- `itemStarted`
- `itemCompleted`

Rust 侧普通 app-server 通知已经支持 assistant 文本流式增量：

- 普通通知方法：`item/agentMessage/delta`
- payload 类型：`AgentMessageDeltaNotification`
- 字段：`threadId`、`turnId`、`itemId`、`delta`

缺口是 projection 订阅者目前无法只通过 projection stream 收到 assistant 文本 delta。

## 已确认决策

### 1. 第一阶段只支持 assistant 文本 delta

第一阶段只投影 `agentMessage` 的流式文本增量。

不在第一阶段支持：

- plan delta
- reasoning delta
- command / process / file output delta
- GUI 渲染实现

### 2. 新增 projection transient delta 通知

新增通知方法：

```text
thread/projection/delta
```

该通知是 projection subscription 下的 transient progress，不是推进 projection head 的结构性事件。

### 3. Delta 不进入 projection commit 链

`thread/projection/delta` 不携带：

- `commitId`
- `parentCommitId`

它也不更新 snapshot 的 `headCommitId`。

`thread/projection/event` 继续表示会推进 projection head 的结构性事件。`thread/projection/delta` 只表示同一 subscription 下的实时文本进度。

### 4. Payload 使用包装形态

`thread/projection/delta` 的 payload 使用和 `thread/projection/event` 类似的包装风格：

```json
{
  "threadId": "thr_123",
  "subscriptionId": "sub_123",
  "delta": {
    "type": "agentMessage",
    "notification": {
      "threadId": "thr_123",
      "turnId": "turn_123",
      "itemId": "item_123",
      "delta": "hello"
    }
  }
}
```

Rust 类型形态预期为：

```rust
pub struct ThreadProjectionDeltaNotification {
    pub thread_id: String,
    pub subscription_id: String,
    pub delta: ThreadProjectionDelta,
}

#[serde(tag = "type", rename_all = "camelCase")]
#[ts(tag = "type", rename_all = "camelCase", export_to = "v2/")]
pub enum ThreadProjectionDelta {
    AgentMessage {
        notification: AgentMessageDeltaNotification,
    },
}
```

### 5. 最终权威内容仍来自 item completed

`thread/projection/delta` 只用于 live progress。最终 assistant 内容仍由后续 `itemCompleted` 的 `agentMessage` item 落定。

客户端应按以下语义处理：

- `itemStarted(agentMessage)` 建立可挂载的 in-progress item。
- `thread/projection/delta` 按 `turnId + itemId` 追加 transient text。
- `itemCompleted(agentMessage)` 使用最终 item 内容替换或完成该 in-progress item。
- 如果没有收到任何 delta，`itemCompleted(agentMessage)` 仍能单独生成最终内容。

## 与 TUI 模型的关系

TUI 不使用 projection commit/head 来合并流式输出。它消费普通通知流：

- `item/started`
- `item/agentMessage/delta`
- `item/completed`

TUI 的 delta 进入本地 stream controller；最终 `itemCompleted(agentMessage)` 到达时，如果已有 stream controller，最终 payload 被视为已累计 delta 的完成信号，否则最终 message 可以作为非流式内容渲染。

本设计对 projection 保持相同的核心语义：delta 是 transient progress，最终权威内容来自 completed item。区别是 GUI projection 需要 subscription 边界，因此使用 `thread/projection/delta` 包装普通 `AgentMessageDeltaNotification`。

## 当前不做的事

本草案不引入：

- delta commit chain
- projection snapshot 中的 delta 重建
- delta 持久化语义变更
- 多种 item delta 的通用框架
- GUI transcript / runtime reducer 实现
- reconnect 后 delta replay

## 待后续设计确认

后续如果进入完整设计或实施计划，还需要确认：

- `thread/projection/delta` 是否参与 projection fanout backpressure 关闭逻辑，还是使用独立阈值。
- 客户端收到 delta 但尚未看到对应 `itemStarted` 时的处理策略。
- schema / TypeScript fixture 更新范围。
- Rust integration test 的最小事件序列。
