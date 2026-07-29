# Projection streaming delta 设计

## 背景

当前 app-server 已经有普通流式文本通知：

- core 产生 `EventMsg::AgentMessageContentDelta`。
- app-server v2 将其映射为 `item/agentMessage/delta`。
- payload 带 `threadId`、`turnId`、`itemId` 和 `delta`。
- 最终权威内容仍由 `item/completed` 中的 `agentMessage` 给出。

但 GUI projection 订阅目前只收到 `thread/projection/event`。该事件包装结构性通知：

- `turn/started`
- `turn/completed`
- `item/started`
- `item/completed`

因此只消费 projection 的客户端可以看到 item 生命周期和最终文本，但看不到 assistant 文本的实时 delta。

本设计基于 `2026-07-01-projection-cursor-removal-design.md` 之后的投影基线：`ProjectionSnapshotCut` 只表达 `generation + headCommitId`，projection commit chain 仍用于结构性 live events。本文不恢复 cursor，不修改 snapshot cut 语义。

## 决策

新增 projection transient delta 通知：

```text
thread/projection/delta
```

该通知只表示同一 projection subscription 下的实时文本进度，不推进 projection head，不携带 `commitId` 或 `parentCommitId`。

第一阶段只支持 assistant message 文本流：

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

设计要点：

- `thread/projection/event` 继续表示结构性 projection event，并继续推进 `headCommitId`。
- `thread/projection/delta` 表示 transient progress，不进入 commit chain。
- `thread/projection/delta` 必须带 `subscriptionId`，让客户端只接收当前 projection subscription 对应的 delta。
- `delta.notification` 复用现有 `AgentMessageDeltaNotification`，避免重新定义同一份 `threadId/turnId/itemId/delta` payload。
- `delta.type` 当前只有 `agentMessage`。第一阶段不加入 plan、reasoning、exec output 或其他 delta。

## 与 TUI 的关系

TUI 不依赖 projection `commitId/headCommitId` 合并流式 delta 和最终 item。它消费普通 notification stream：

1. `item/started` 建立 item 生命周期。
2. `item/agentMessage/delta` 追加到本地 stream controller。
3. `item/completed(agentMessage)` 到达后，若已有 stream controller，则最终文本被视为已由 delta 累积，只触发 flush 和 consolidation；若没有 stream controller，则把最终文本作为一次完整消息渲染。

projection 不能直接照搬 TUI 的普通通知流，因为 projection 订阅还有 subscription 隔离、snapshot baseline 和结构性 head 链。但 delta 不进入 head 链这一点应与 TUI 对齐：delta 是实时进度，最终 item 才是权威内容。

## 协议形态

在 app-server v2 协议中新增：

- `ThreadProjectionDeltaNotification`
- `ThreadProjectionDelta`

建议 Rust 形态：

```rust
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export_to = "v2/")]
pub struct ThreadProjectionDeltaNotification {
    pub thread_id: String,
    pub subscription_id: String,
    pub delta: ThreadProjectionDelta,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, JsonSchema, TS)]
#[serde(tag = "type", rename_all = "camelCase")]
#[ts(tag = "type", rename_all = "camelCase", export_to = "v2/")]
pub enum ThreadProjectionDelta {
    AgentMessage {
        notification: AgentMessageDeltaNotification,
    },
}
```

`ThreadProjectionDeltaNotification` 不包含 `commit_id` 或 `parent_commit_id`。这使客户端可以明确区分：

- `thread/projection/event`：结构性、可推进 head、可参与 parent-chain 校验。
- `thread/projection/delta`：临时流式进度、按 delivery 顺序消费、最终由 `itemCompleted` 收敛。

## 服务端投递语义

`ThreadProjectionManager` 需要为 delta 提供与 structural event 分离的投递路径。

结构性 event 现有路径保持不变：

```text
ServerNotification::{TurnStarted, ItemStarted, ItemCompleted, TurnCompleted}
  -> ThreadProjectionEventNotification { commitId, parentCommitId, event }
  -> projection fanout
```

新增 delta 路径：

```text
ServerNotification::AgentMessageDelta
  -> ThreadProjectionDeltaNotification { threadId, subscriptionId, delta }
  -> projection fanout
```

该路径应复用现有 projection subscriber、detach、connection cleanup 和 backpressure 机制，但不调用 `advance_head`，不修改 `ThreadEntry.head_commit_id`。

如果同一 connection 同时有普通 thread subscription 和 projection subscription，普通 `item/agentMessage/delta` 与 projection `thread/projection/delta` 是两类独立通知。GUI projection 客户端应消费 projection delta；普通客户端可以继续消费普通 delta。

## Snapshot 语义

Snapshot 不包含 delta。

原因：

- delta 是 transient progress，不是最终权威历史。
- `thread/projection/attach` snapshot 已经从 persisted history 和 active turn snapshot 重建当前 thread view。
- 最终 assistant 文本由 `item/completed(agentMessage)` 或 snapshot 中已完成的 turn item 表达。

如果 attach 时 assistant message 正在 streaming：

- snapshot 可以包含已有的 in-progress turn 和已知 item 状态。
- attach 之后新到达的文本增量通过 `thread/projection/delta` 发送。
- 如果 attach 前已经发送过一些 delta，新 subscriber 不要求补齐这些 delta；它以 snapshot 为 baseline，只消费 attach 之后的 live delta。
- 最终 `itemCompleted(agentMessage)` 仍通过 `thread/projection/event` 到达，并作为权威内容收敛临时文本。

## 顺序和一致性

`thread/projection/delta` 应在同一个 projection fanout ordering 中投递，保证同一 subscription 上的结构性 events 和 deltas 按服务端处理顺序出站。

但客户端不应把 delta 当作 head chain 的一部分：

- 收到 stale `subscriptionId` 的 delta，应忽略。
- 收到当前 `subscriptionId` 的 delta，可以按 arrival order 追加到对应 `turnId/itemId` 的临时文本。
- 收到 `itemCompleted(agentMessage)` 后，应以最终 item 内容为权威状态，清理或替换临时文本。
- 如果 `itemCompleted` 先于部分 delta 到达，后续同 `itemId` delta 应被忽略或丢弃，因为该 item 已完成。

这与 TUI 当前模型接近，但 GUI 后续实现应使用 `turnId/itemId` 做归并边界，而不是只依赖单一 active stream。

## 范围

第一阶段包含：

- 在 app-server protocol v2 中新增 `thread/projection/delta` 通知和对应 TS/schema 导出。
- 在 projection manager/fanout 中新增 delta delivery 路径。
- 将 `ServerNotification::AgentMessageDelta` 投递给当前 thread 的 projection subscribers。
- 更新 app-server projection fixture 生成和 GUI projection fixtures，使新协议形态可被类型检查。
- 更新 app-server README 中 projection 章节，说明 `event` 与 `delta` 的区别。
- 增加 Rust 测试覆盖 delta 不推进 head、带 subscription、保持 fanout/backpressure 语义。

第一阶段不包含：

- 不实现 GUI 渲染流式文本。
- 不支持 `item/plan/delta`、reasoning delta、exec output delta、file change delta 或 MCP progress。
- 不修改 core event 类型。
- 不修改 persisted history 或 thread store。
- 不把 delta 写入 snapshot。
- 不改变 `thread/projection/event` 的 `commitId/parentCommitId` 语义。

## 测试设计

需要覆盖以下行为：

1. 协议序列化
   - `thread/projection/delta` 能序列化为预期 JSON。
   - `delta.type = "agentMessage"`。
   - payload 包含 `threadId`、`subscriptionId` 和原始 `AgentMessageDeltaNotification`。
   - 不包含 `commitId` 或 `parentCommitId`。

2. projection manager 行为
   - 已订阅 connection 收到 `AgentMessageDelta` 时会产生 projection delta delivery。
   - 未订阅 connection 不收到 projection delta。
   - stale/detached subscription 后不再产生新的 delta delivery。
   - delta delivery 不调用 `advance_head`，不会改变下一条 structural event 的 `parentCommitId`。

3. fanout/backpressure
   - projection delta 使用与 structural event 相同的 fanout 队列。
   - 队列满时仍触发 `thread/projection/closed`，客户端需要重新 attach。

4. integration
   - 构造顺序：`itemStarted(agentMessage)` -> `agentMessageDelta` -> `itemCompleted(agentMessage)`。
   - projection subscriber 收到 structural `itemStarted`，随后收到 `thread/projection/delta`，最终收到 structural `itemCompleted`。
   - `itemStarted` 和 `itemCompleted` 的 commit chain 连续性不被 delta 改变。

## 风险

主要风险：

- 高频 delta 会增加 projection fanout 队列压力，更容易触发 backpressure close。
- delta 不进 commit chain 后，客户端不能用 `headCommitId` 判断 delta 缺失；它只能用最终 `itemCompleted` 收敛。
- attach 前已经发送的 delta 不补发，新 subscriber 在最终 item 到来前可能只看到 snapshot 里的当前状态和 attach 后增量。

这些风险是有意取舍：

- TUI 也把 delta 当作 transient progress，而不是可持久回放的权威历史。
- 将每个 delta 纳入 commit chain 会显著放大 head 链长度和断链处理成本。
- 第一阶段目标是让 projection subscriber 看到实时 assistant text，而不是提供可重放 delta log。

## 验证

实现后至少从仓库根目录运行：

- `just write-app-server-schema`
- `just test -p codex-app-server-protocol`
- `just test -p codex-app-server thread_projection`
- `just fmt`
- `just fix -p codex-app-server -p codex-app-server-protocol`
- `git diff --check`

如果实现修改了 GUI fixture 类型或生成的 TypeScript，再补充运行 codex-gui 对应的类型检查和 projection fixture 测试；具体命令需要先读取当时的 `codex-gui/package.json` 后再写入计划或执行。
