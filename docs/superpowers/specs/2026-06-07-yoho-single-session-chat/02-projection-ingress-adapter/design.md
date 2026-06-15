# Projection Ingress Adapter Design

## 目标

`02 Projection Ingress Adapter` 负责把 app-server projection 输入转换成 GUI 后续 runtime 可消费的结构化结果。

这一层位于 `01 Thread Identity Shell` 之后、`03 Thread Runtime Store` 之前。它只做 projection 协议边界处理：接收 `attach`、`event`、`closed`，校验 thread/subscription/commit 连续性，并判断输入是可接受、应忽略，还是需要用户手动重连。

## 范围

这一层处理：

- `thread/projection/attach` 返回的 `ThreadProjectionAttachResponse`。
- `thread/projection/event` 推送的 `ThreadProjectionEventNotification`。
- `thread/projection/closed` 推送的 `ThreadProjectionClosedNotification`。
- `subscriptionId` 与 `headCommitId` 组成的最小协议游标。
- `commitChainMismatch`、`missingTurn`、`backpressure` 三类需要手动重连的原因。

这一层不处理：

- 不保存完整 `Thread` runtime。
- 不长期维护 turns/items 状态。
- 不做 snapshot replay。
- 不做 live event 应用。
- 不做 chat view model。
- 不做 composer 或 tool activity。
- 不自动发起新的 attach request。

## 设计决策

**A. 层级边界**

02 是 adapter-only，但允许持有协议判断所需的最小 cursor。cursor 只包含当前 thread、当前 subscription、当前 head commit、已知 turn id 索引和手动重连状态，不包含 GUI runtime。

**B. 输出模型**

Adapter 输出结构化 `ProjectionIngressOutcome`，不直接 dispatch 现有 `projectionSlice` action，也不绑定未来 runtime store。

**C. 手动重连判定**

只有 projection baseline 断裂才产出 `manualReconnectRequired`：

- `commitChainMismatch`
- `missingTurn`
- `backpressure`

wrong thread、stale subscription、duplicate commit 只产出 `ignored`。

**D. `thread/projection/closed` 归属**

`guiHostClient` 只负责识别和转发 closed notification。thread/subscription 匹配、reason 解释、是否需要手动重连，都由 adapter 判断。

**E. 恢复策略**

02 不做自动重连循环。`manualReconnectRequired` 表示 GUI 状态已过期，需要后续 UI 提供 `Reconnect` 动作，由用户确认后重新 attach。

自动重连可作为未来增强，但不属于 02 默认策略。

## TUI Alignment And Known Difference

`02 Projection Ingress Adapter` 没有 TUI 中的直接等价层。TUI 接收的是普通 app-server thread
notifications，并通过 thread routing 把 notification 放入 `ThreadEventStore` 和 active thread channel。
TUI 不维护 projection `subscriptionId`、`headCommitId`、`parentCommitId` 或 `knownTurnIds` cursor。

GUI 需要 `02`，是因为 `/gui` 第一版的输入面不是普通 thread notification stream，而是 app-server
projection API：

```text
thread/projection/attach
thread/projection/event
thread/projection/closed
```

因此 `02` 对齐的是 TUI routing 之前的输入保护职责：只让同一 thread、同一 subscription、commit
chain 连续、parent turn 已知的 projection 输入进入后续 runtime。真正对齐 TUI `ThreadEventStore`
的层是 `03 Thread Runtime Store`，不是 `02`。

Projection cursor 是 GUI-only 协议 cursor：

- `subscriptionId` 只用于识别当前 projection subscription。
- `headCommitId` / `parentCommitId` 只用于判断 projection event 是否连续。
- `knownTurnIds` 只用于判断 item event 是否缺少 parent turn。
- `manualReconnect` 只表示当前 projection baseline 已不可继续增量消费。

这些字段不能流入 `03` 成为 runtime truth model，也不能被 `04/05/06` 当作聊天状态、turn 状态或 UI
状态。`02` 只能向后输出 accepted attach/event 或 manual reconnect signal。

`thread/projection/closed(backpressure)` 也不是 TUI `ThreadClosed`，不是 WebSocket closed，也不是
TUI event channel backpressure。它只表示 server 端 projection fanout 已丢弃当前订阅，GUI 不能再用
当前 snapshot/event baseline 继续增量应用。正确后续语义是进入 manual reconnect path，而不是把 thread
视为关闭或尝试静默修复。

## 输入边界

`guiHostClient` 仍负责 WebSocket、JSON-RPC handshake、URL 参数和 launch token。

它应该向上游暴露三类 projection 回调：

```ts
type ProjectionTransportCallbacks = {
  onProjectionAttached?: (response: ThreadProjectionAttachResponse) => void;
  onProjectionEvent?: (notification: ThreadProjectionEventNotification) => void;
  onProjectionClosed?: (notification: ThreadProjectionClosedNotification) => void;
};
```

`guiHostClient` 的职责到 payload shape 校验为止。它不读取 adapter cursor，不判断 commit chain，不决定是否重连。

## Adapter 状态

Adapter 可以持有最小协议游标：

```ts
type ProjectionIngressCursor = {
  threadId: string;
  subscriptionId: string | null;
  headCommitId: string | null;
  knownTurnIds: Set<string>;
  manualReconnect: ProjectionManualReconnect | null;
};

type ProjectionManualReconnect = {
  reason: "commitChainMismatch" | "missingTurn" | "backpressure";
};
```

字段含义：

- `threadId` 是已经通过 `01` identity gate 的 thread。
- `subscriptionId` 来自最近一次 accepted attach。
- `headCommitId` 来自最近一次 accepted attach 或 accepted event。
- `knownTurnIds` 只保存已通过 adapter 的 turn id，用于判断 item event 是否缺少 parent turn。
- `manualReconnect` 表示当前 projection baseline 已不可继续消费，后续 event 应忽略，直到用户触发重连并获得新的 attach snapshot。

这个 cursor 不是 runtime store。它不保存 session、完整 turns、items、active turn、buffer 或 UI 状态。

## 输出模型

Adapter 输出：

```ts
type ProjectionIngressOutcome =
  | {
      type: "attachAccepted";
      response: ThreadProjectionAttachResponse;
    }
  | {
      type: "eventAccepted";
      notification: ThreadProjectionEventNotification;
    }
  | {
      type: "manualReconnectRequired";
      reason: "commitChainMismatch" | "missingTurn" | "backpressure";
      threadId: string;
      subscriptionId: string | null;
    }
  | {
      type: "ignored";
      reason:
        | "wrongThread"
        | "staleSubscription"
        | "duplicateCommit"
        | "alreadyRequiresManualReconnect";
    };
```

后续 `03 Thread Runtime Store` 只消费 `attachAccepted` 和 `eventAccepted` 这类已通过 adapter 校验的输入。`manualReconnectRequired` 由后续 UI/runtime 状态展示成需要用户操作的中断状态。

## Attach 处理

Attach 输入必须先通过 `01` identity gate。identity mismatch 由 01 硬阻塞，02 不接收 mismatched attach。

处理规则：

- attach snapshot 的 `thread.id` 与 launch thread 一致：产出 `attachAccepted`。
- accepted attach 更新 cursor：
  - `threadId = snapshot.thread.id`
  - `subscriptionId = response.subscriptionId`
  - `headCommitId = snapshot.headCommitId`
  - `knownTurnIds = new Set(snapshot.thread.turns.map((turn) => turn.id))`
  - `manualReconnect = null`

新的 accepted attach 会清除旧的手动重连状态。它代表用户已经触发重连并获得新的 baseline。

## Event 处理

Event 输入只在 cursor 可继续消费时处理。

处理规则：

- `notification.threadId !== cursor.threadId`：产出 `ignored(wrongThread)`。
- `notification.subscriptionId !== cursor.subscriptionId`：产出 `ignored(staleSubscription)`。
- `cursor.manualReconnect !== null`：产出 `ignored(alreadyRequiresManualReconnect)`。
- `notification.commitId === cursor.headCommitId`：产出 `ignored(duplicateCommit)`。
- `notification.parentCommitId !== cursor.headCommitId`：产出 `manualReconnectRequired(commitChainMismatch)`。
- event 是 `itemStarted` 或 `itemCompleted`，但 `knownTurnIds` 中不存在对应 `turnId`：产出 `manualReconnectRequired(missingTurn)`。
- 其他连续 event：产出 `eventAccepted`，把 `headCommitId` 更新为 `notification.commitId`，并在 `turnStarted` / `turnCompleted` 时把对应 turn id 写入 `knownTurnIds`。

`missingTurn` 的判断只依赖 turn id 索引。02 不能为了这个判断保存完整 turns/items，也不能把 turns/items 变成长期 GUI runtime。

## Closed 处理

Closed notification 的当前 reason 只有 `backpressure`。

处理规则：

- `notification.threadId !== cursor.threadId`：产出 `ignored(wrongThread)`。
- `notification.subscriptionId !== cursor.subscriptionId`：产出 `ignored(staleSubscription)`。
- `cursor.manualReconnect !== null`：产出 `ignored(alreadyRequiresManualReconnect)`。
- `notification.reason === "backpressure"`：产出 `manualReconnectRequired(backpressure)`。

`closed(backpressure)` 表示 server 端 projection fanout 已丢弃当前订阅。它不是 thread closed，也不是 WebSocket closed。GUI 应展示“状态已过期，需要重连”，并等待用户点击 `Reconnect`。

## 手动重连语义

`manualReconnectRequired` 是状态信号，不是命令。

进入该状态后：

- Adapter 不再接受当前 subscription 的后续 event。
- GUI 不自动重新 attach。
- UI 后续应显示明确的 `Reconnect` 动作。
- 用户触发 `Reconnect` 后，transport 层重新发送 `thread/projection/attach`。
- 新 attach 被 accepted 后，adapter cursor 用新 snapshot 重置。

这个策略避免隐藏 projection 断裂，也避免在持续 backpressure 或错误 baseline 下进入自动重连循环。

## 与相邻阶段的边界

`01 Thread Identity Shell`：

- 01 决定 launch thread 和 attach thread 是否匹配。
- 02 只消费已经通过 identity gate 的 attach。
- identity mismatch 是硬阻塞，不由 02 修复。

`03 Thread Runtime Store`：

- 03 接收 02 的 accepted attach/event。
- 03 保存 session、turns、buffer、active turn、subscription interrupted/error 状态。
- 03 决定如何把 `manualReconnectRequired` 呈现为 runtime 状态。

`04 Snapshot Replay` 和 `05 Live Event Handling`：

- 04 只处理 accepted attach snapshot。
- 05 只处理 accepted live event。
- replay/live 副作用不能反向进入 02。

## 现有实现迁移方向

当前 `projectionSlice` 同时承担了临时 store、commit-chain 校验、event 应用和 reattach 标记。

02 的实现计划应把协议逻辑迁移到新 adapter：

- 保留并迁移 `subscriptionId` 校验。
- 保留并迁移 duplicate commit 忽略。
- 保留并迁移 `parentCommitId` 连续性校验。
- 保留并迁移 `missingTurn` 判定。
- 新增 `thread/projection/closed` 输入。
- 把 reattach 标记改为 `manualReconnectRequired`。

`projectionSlice` 的长期去向仍是删除。02 不能把它升级成 GUI truth model。

## 验收标准

02 只验收 projection ingress：

- `guiHostClient` 能转发 `thread/projection/closed`。
- matching attach 产出 `attachAccepted` 并设置 cursor。
- mismatched attach 不进入 adapter 后续层。
- contiguous event 产出 `eventAccepted` 并推进 `headCommitId`。
- duplicate commit 产出 `ignored(duplicateCommit)`。
- stale subscription 产出 `ignored(staleSubscription)`。
- wrong thread 产出 `ignored(wrongThread)`。
- parent commit 不连续产出 `manualReconnectRequired(commitChainMismatch)`。
- item event 缺少 parent turn 产出 `manualReconnectRequired(missingTurn)`。
- matching `closed(backpressure)` 产出 `manualReconnectRequired(backpressure)`。
- 进入手动重连状态后，当前 subscription 的后续 event 不再被 accepted。

不在 02 验收：

- 真实点击 `Reconnect` 后的 attach loop。
- runtime store 持久化。
- snapshot replay。
- live event UI 更新。
- chat surface。
- composer。
- tool activity。

## 设计原则

- Projection 是输入协议，不是 GUI 状态真理。
- Adapter 只拥有协议 cursor，不拥有 thread runtime。
- `manualReconnectRequired` 默认需要用户确认，不默认自动重连。
- 可恢复断裂必须显式暴露给用户，不能静默修复或静默丢弃。
- 每个 outcome 都必须可独立测试。
