# Codex GUI Projection Redesign

日期：2026-05-08

状态：设计方向已收敛

## 目标

GUI projection 的目标是让浏览器客户端能够把 thread 信息显示给用户，并在多 tab / 多 thread 场景下降低不必要的实时事件传输。

本质限制是：TUI 的实时 fanout 是本地进程内数据传递；GUI 的实时 fanout 是跨网络连接传输。因此 TUI 可以实时维护所有已跟踪 thread，GUI 不应该让每个 browser tab 都实时订阅所有 thread。

GUI 应该只对当前需要实时显示的 thread 建立 projection subscription。其他 thread 可以依赖本地缓存、重新 attach snapshot，以及未来 catch-up 来恢复最新状态。

## 总体方向

重复 TUI 不是问题，关键是重复的位置。

正确方向是：

```text
TUI 在客户端有 ThreadEventStore
GUI 也应该在客户端有 TUI-style thread store
```

server 不应该实现 GUI/TUI store，也不应该维护显示状态。server 只提供按需实时传输能力：

```text
server:
  attach/detach projection subscription
  attach 返回 snapshot
  只向 projection subscribers 发送 projection envelope

GUI:
  per-thread local store
  snapshot 初始化
  realtime event apply
  replay / render state
  多 tab / 多 thread attach 策略
```

server 不判断 foreground/background，不理解 tab 策略，也不决定哪些 thread 应该实时显示。GUI 自己决定哪些 thread 需要 attach。

## 和 `port/lazy-projections` 的取舍

`port/lazy-projections` 可以保留的方向：

- `thread/projection/attach`
- `thread/projection/detach`
- per-connection subscriber fanout
- attach 进入 listener command 保序
- projection subscribers 参与 thread unloading 判断
- connection close 清理 projection subscription

`port/lazy-projections` 需要收缩的方向：

- 不再使用 `ProjectionEventPayload` 作为新的 domain event。
- 不从底层 `EventMsg` 手写 projection reducer。
- 不在 server projection state 里维护 `ThreadHistoryBuilder`。
- 不用 projection 自己读 rollout summary 拼 snapshot。
- 不使用 `latestSequence` / `projectionInstanceId` 作为第一版协议语义。

新的设计把 projection event 定义为 transport envelope：它包装已有 typed notification，并附带 projection 传输元数据。

## 第一版范围

第一版只验证架构可行性，不做完整追赶。

支持：

```text
thread/projection/attach
thread/projection/detach
thread/projection/event
```

第一版只投影四类 typed notification：

```text
TurnStarted
TurnCompleted
ItemStarted
ItemCompleted
```

第一版不做：

- catch-up
- commit log
- pending requests
- server requests
- server request resolved
- thread name update
- thread closed
- error projection
- GUI 显示层设计

## Protocol Shape

`attach`：

```text
thread/projection/attach({ threadId })
```

返回：

```text
ThreadProjectionAttachResponse {
  subscriptionId: string,
  snapshot: {
    thread: Thread,
    headCommitId: string | null,
  },
}
```

> 包一层 `snapshot` 是为未来 catch-up 留扩展点。catch-up 版本会把 `snapshot` 变成 `snapshot | missedCommits` 的二选一，不用破坏外层结构。

## Attach 错误路径

attach 可能失败的场景：thread 不存在、无权限、thread 正在 unload、snapshot 构造失败。

失败时：

- 返回标准 error，不生成 subscriptionId。
- server 不创建 ProjectionSubscriber。
- GUI 不进入已订阅状态，也不更新本地 headCommitId。

`detach`：

```text
thread/projection/detach({ threadId })
```

返回状态保留：

```text
Detached
NotSubscribed
NotLoaded
```

GUI 可以把三者都当作成功结果处理。

`event`：

```text
ThreadProjectionEventNotification {
  threadId: string,
  subscriptionId: string,
  commitId: string,
  parentCommitId: string | null,
  event: ThreadProjectionEvent,
}
```

第一版 `ThreadProjectionEvent` 是白名单 union：

```text
ThreadProjectionEvent =
  | { type: "turnStarted", notification: TurnStartedNotification }
  | { type: "turnCompleted", notification: TurnCompletedNotification }
  | { type: "itemStarted", notification: ItemStartedNotification }
  | { type: "itemCompleted", notification: ItemCompletedNotification }
```

这里的 notification payload 复用现有 v2 typed notification。GUI 解包后得到的事件模型应尽量接近 TUI 接收的 typed notification。

## Commit 链

每个 thread 有一条独立 projection commit 链。

server per thread 第一版只保存：

```text
headCommitId
projection subscribers
```

只有白名单 projection event 才生成 commit 并推进 `headCommitId`。

`headCommitId` 表示 server 已经 emit 过的最新 projection commit。`snapshot.thread` 来自 thread 的最新可读持久化视图。两者不保证刚好截止在同一事件上：core 先 persist 再 deliver event，所以 snapshot 可能已经包含还没经 tap 推进 head 的事件。

这意味着 GUI 收到 attach response 后，第一条 projection event 可能对应 snapshot 里已经反映过的 turn 或 item。GUI reducer 对 `TurnStarted / TurnCompleted / ItemStarted / ItemCompleted` 的 apply 必须幂等且单调：重复 apply 不应破坏状态，旧状态不覆盖新状态。

commit 链只保证 projection event stream 连续性（`parentCommitId == local.headCommitId` 说明中间没有漏事件），不表示 snapshot 内容精确边界。

```text
parentCommitId = old headCommitId
commitId = uuid-v7
headCommitId = commitId
```

第一版 `commitId` 是 opaque id，不做内容寻址 hash。客户端只保存和比较，不解析。

GUI 处理规则：

```text
if event.subscriptionId != local.subscriptionId:
  ignore
else if event.parentCommitId != local.headCommitId:
  mark stale
  reattach snapshot
else:
  apply event
  local.headCommitId = event.commitId
```

第一版发现断链后不补事件，直接重新 attach snapshot。

reattach 成功后，GUI 对该 thread 的 store 做整棵替换，不 merge：

```text
replace per-thread store from snapshot
replace headCommitId
replace subscriptionId
```

## Subscription Id

`subscriptionId` 是一次 attach 生命周期的身份，用来处理 detach / reattach 竞态和在路上的旧事件。

server 内部状态：

```text
ProjectionThreadEntry {
  headCommitId: Option<String>,
  subscribers: HashMap<ConnectionId, ProjectionSubscriber>,
}

ProjectionSubscriber {
  subscriptionId: String,
}
```

规则：

- 每次 attach 成功都生成新的 `subscriptionId`；`subscriptionId` 与 `commitId` 均使用 uuid-v7，保持 id 策略一致，方便日志按时间排序。
- 同一 connection 对同一 thread 重复 attach，会替换旧 subscription。
- event envelope 带当前 subscription 的 `subscriptionId`。
- detach 移除当前 connection 的 subscriber。
- 旧 subscription 的迟到 event 由 GUI 忽略。

`subscriptionId` 是 connection-local 的订阅身份；`commitId` 是 thread-local 的 stream 位置。两者互不替代。

## Snapshot

attach 返回的 `thread` 应尽量复用 `thread/read includeTurns` 的结果。

为了降低后续追上游 `0.130` 的冲突，第一版不重构 `thread/read`，不抽大型 `ThreadViewBuilder`。优先策略是：

- 新增 projection 代码。
- 对现有 `read_thread_view` 做最小可见性调整。
- projection attach 在 listener command 内调用现有 thread read view 能力。
- 不让 projection 自己维护 history reducer。

attach 必须在 listener command 内完成：

```text
1. build snapshot
2. read current headCommitId
3. register projection subscriber
4. send attach response
```

这样可以保证 attach response 的 `headCommitId` 与后续第一条 projection event 的 `parentCommitId` 接上。

由于 snapshot 和 headCommitId 不保证严格对齐（见 Commit 链），第一版 GUI reducer 必须满足：

- 幂等：同一 notification 重复 apply 得到相同状态。
- 单调：新状态只覆盖更早或相同的状态，`ItemCompleted` 不会退回到 `ItemStarted`。

第一版不引入 server-side shadow state 去对齐 snapshot 边界。对齐职责完全放在 GUI reducer。

## Event Source

projection event 来源是 typed notification tap，不是底层 `EventMsg` reducer。

目标流程：

```text
EventMsg
  -> 0.129 existing bespoke_event_handling
  -> ServerNotification::TurnStarted / ItemStarted / ...
  -> projection envelope
  -> projection subscribers
```

实现前置检查：

开工前必须用 grep/test 覆盖 `TurnStarted / TurnCompleted / ItemStarted / ItemCompleted` 四类 typed notification 的所有生产路径，确认它们全部经过 `ThreadScopedOutgoingMessageSender`。若有任何路径绕过这一层（例如 error/completion 特殊路径直接写连接 channel），必须先把它们收束到这一层，否则 tap 会漏事件、commit 链会断。

tap 位置优先放在 `ThreadScopedOutgoingMessageSender` 层：

- 这一层已有 thread scope。
- 能覆盖 thread-scoped typed notification 出口。
- 不需要修改每个 `bespoke_event_handling` 分支。
- projection 只接收已经成型的 typed notification。

Head 推进的原子性：同一 thread 内，"advance headCommitId + build projection envelope + capture current subscriber snapshot" 必须在 `ProjectionManager` 的同一同步区间（同一把锁）内完成。envelope 往连接 outgoing 队列的入队可以在锁外做，但 commit/head 生成不能被同 thread 的另一个 projection event 穿插，否则 subscriber 之间会看到不同的 head 序列。

## Thread Subscription 分离

普通 thread subscription 和 projection subscription 分离：

```text
thread/resume or thread subscribe:
  原有实时流，给 TUI/CLI 使用

thread/projection/attach:
  projection 实时流，给 GUI 按需显示使用
```

两者互不影响：

- detach projection 不取消普通 thread subscription。
- unsubscribe thread 不取消 projection subscription。
- connection close 清理两边。
- thread unloading 判断需要同时考虑两边。

只要有 projection subscriber，thread 应暂时保持 loaded，避免 GUI 正在显示的 thread 丢失实时事件。

Thread unload 判定必须显式同时考虑两类 subscriber：

```text
thread_can_unload = normal_subscribers.is_empty()
                 && projection_subscribers.is_empty()
```

任一类有订阅者，thread 保持 loaded。

## Connection Close 与 重连

connection close 时：

- 清空该 connection 下所有 normal thread subscription。
- 清空该 connection 下所有 projection subscription（释放 `ProjectionSubscriber`）。
- thread 再次落入 unload 判定。

第一版不做 grace period / 续订窗口。短暂网络抖动后，GUI 重连必须重新走 `thread/projection/attach`，拿新的 subscriptionId 和新的 snapshot。旧 subscriptionId 在 server 侧已随 connection 销毁，不再复用。

detach 的三种返回（`Detached / NotSubscribed / NotLoaded`）GUI 一律视为"本地已解除订阅"：清掉本地 `subscriptionId`，停止对该 thread 的 event apply。

## 后续方向

未来 catch-up 可以在第一版基础上扩展：

```text
attach({ threadId, knownCommitId })
```

返回：

```text
snapshot
```

或：

```text
missed commits
```

第一版不实现 commit log。未来如果需要追赶，再为每个 thread 增加 bounded log：

```text
knownCommitId 是 head 的祖先 -> 返回 missed commits
否则 -> 返回 snapshot
```

第一版的 `commitId` / `parentCommitId` / `subscriptionId` 已经为这个方向预留了协议基础。
