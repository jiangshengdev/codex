# Projection Snapshot Physical Boundary Design

## 背景

`thread/projection/attach` 返回 `ThreadProjectionAttachResponse`，其中
`snapshot.thread` 来自 persisted/live thread view reconstruction，
`snapshot.headCommitId` 来自 `ThreadProjectionManager` 已推进到的 projection commit head。

需要保证这两个值描述同一个 projection cut。core 会先把 rollout item 写入
thread store，再 deliver event 给 app-server listener。若某个 event 已经持久化，
但 listener 尚未处理并推进 projection head，attach snapshot 不能提前读到该
future event；否则客户端会先从 snapshot 看到它，随后又从
`thread/projection/event` 收到同一语义事件。

2026-05-24 旧设计选择了 app-server-local 的
`ProjectionHistoryCursor(usize)`，由 listener 按 event 的 persisted item count
推进，再让 attach snapshot 用该 count 截断 full history。2026-07-01 的复现证明
该设计有关键语义错误：cursor count 与 `StoredThreadHistory.items` 的 physical
history index 不是同一口径。baseline 后新增的 `TurnContext` 会进入 physical
history，但不会随 `conversation.next_event()` 的 live cursor 推进，导致 attach
snapshot 用 cursor-domain count 直接 `truncate` physical history 时，把尾部
final `AgentMessage` 和 `TurnComplete` 截掉。

本设计保留 snapshot cut 的边界机制，但废弃旧的裸 `usize` cursor 形态，改为
storage-neutral 的 physical persisted item boundary。

## 已确认选择

- 保留“snapshot 按 projection boundary/cut 截断”的语义。
- 使用 physical persisted item boundary，而不是 event-domain / cursor-domain count。
- boundary 由 `ThreadStore::append_items` 返回 append result；append result 只包含
  `end_boundary`。
- core 在 persist 后把 boundary 放进 delivered `Event`。
- app-server listener 使用 event 自带 boundary 推进 projection cut，不再根据
  `EventMsg` 类型估算 history cursor。
- 不产生 delivered `Event` 但会持久化的 item 不单独发送 projection-boundary-only
  update；它们由后续 delivered event 的 physical `end_boundary` 自然覆盖。
- no-persist event 显式建模：这类 event 可以推进 projection commit，但 physical
  history boundary 保持不变。
- 废弃 `ProjectionHistoryCursor` 命名，替换为 `ProjectionHistoryBoundary`。
- `ProjectionHistoryBoundary` 不向生产路径暴露通用裸 `usize` getter；snapshot 读取
  通过语义 API 使用 boundary，日志可以使用明确命名的诊断读数。
- 测试采用三层覆盖：store append result、event boundary 传递、snapshot cut
  regression。

## 目标

- `thread/projection/attach` 返回的 `snapshot.thread` 与 `snapshot.headCommitId`
  描述同一个 projection cut。
- 已持久化但 listener 尚未投影的 event 不得出现在 attach snapshot 中。
- listener 已经处理且已持久化到 physical boundary 以内的 final/completed items
  不得被 snapshot 截掉。
- 保持 projection wire schema 不变。
- 保持现有 `ProjectionGeneration` stale attach gate 不变。
- 继续复用现有 canonical thread reconstruction helper，避免维护第二套完整
  projection-owned `Thread` reducer。

## 非目标

- 不改变 rollout JSONL 文件格式。
- 不把 boundary 定义为本地 JSONL 行号、byte offset 或文件系统路径。
- 不通过 `headCommitId` 反推 history 读取边界。
- 不通过 attach 前 drain listener queue 或调整 `tokio::select!` 分支顺序修复。
- 不把 non-event persisted item 单独变成 projection event。
- 不在本设计中重构 ordinary thread subscription lifecycle。
- 不复制一套完整 `ThreadProjectionManager` 内部 snapshot state。

## 设计

### Physical persisted item boundary

新增 storage-neutral 的 history boundary 类型，用来表达 thread persisted history 的
physical item 上界。它的计数口径必须与 `StoredThreadHistory.items` 一致。

```rust
pub(crate) struct ProjectionHistoryBoundary {
    physical_item_count: usize,
}
```

`physical_item_count` 表示 snapshot reconstruction 最多可以读取 persisted physical
history 的前 N 个 `RolloutItem`。这里的 N 不是 event count、commit count、turn
count，也不是 JSONL line number 或 byte offset。

生产代码不应通过通用 `item_count()` 取得裸数字后自行解释。`ProjectionHistoryBoundary`
应提供语义方法，例如：

```rust
impl ProjectionHistoryBoundary {
    pub(crate) fn truncate_history(&self, history: &mut Vec<RolloutItem>);

    pub(crate) fn physical_item_count_for_logs(&self) -> usize;
}
```

这样 snapshot 读取路径不能再次写出
`history_items.truncate(boundary.item_count())` 这类跨域误用。

### ThreadStore append result

`ThreadStore::append_items` 当前只返回 `()`. 本设计要求它返回 append result：

```rust
pub struct AppendThreadItemsResult {
    pub end_boundary: StoredHistoryBoundary,
}
```

`StoredHistoryBoundary` 是 thread-store 层的 storage-neutral persisted history
上界，语义与 `StoredThreadHistory.items.len()` 一致。它不暴露本地 rollout 文件行号。

store 实现负责在应用共享 rollout persistence policy 后，返回本次 append 完成后的
physical persisted item boundary：

- local store：写入 canonical persisted items 并 flush 后，返回该 live thread 当前
  persisted item count。
- in-memory store：向 history vector append canonical persisted items 后，返回 vector
  长度。
- canonical persisted item 为空时，返回当前 boundary，不把空 append 当成错误。

只返回 `end_boundary`。`start_boundary` 和 `appended_count` 不进入基础 API；调用方需要
日志时可以从上下文推导。

### Boundary propagation through Event

core 在 persist 后拿到 `end_boundary`，再 deliver event。delivered `Event` 需要携带
该 event 对应的 persistence boundary：

```rust
pub enum EventPersistenceBoundary {
    Persisted(StoredHistoryBoundary),
    NoPersist,
}

pub struct Event {
    pub id: String,
    pub msg: EventMsg,
    pub persistence_boundary: EventPersistenceBoundary,
}
```

该字段表达的是“listener 处理到这个 event 时，snapshot history 最多可读到哪里”。
listener 不再调用 `projection_persisted_rollout_item_count_for_event(&event.msg)` 来估算
history cursor。

对于 no-persist event，projection commit 仍可推进，但 history boundary 保持不变。
listener 不允许为了 no-persist event 重新读取 store 当前尾部，因为那可能把 listener
尚未处理的 future history item 提前纳入 snapshot。

### Non-event persisted items

`TurnContext`、`SessionMeta` 和部分 compaction/context marker 可能作为 persisted
physical history item 存在，但不一定产生 delivered `Event`。

本设计不为这些 item 单独发送 projection-boundary-only update。原因是它们本身不是 GUI
projection 的 visible event；只要后续 delivered event 携带 physical `end_boundary`，
这个 boundary 会自然跨过它们。这样可以保留它们在 physical history 中的位置，同时避免
新增 listener side channel。

这个选择修复了当前 bug：baseline 后新增的 `TurnContext` 会进入 physical history；当后续
final `AgentMessage` / `TurnComplete` event 被 listener 处理时，event 自带的
`end_boundary` 已经覆盖该 `TurnContext` 和 final/complete tail，attach snapshot 不会再把
final/completed 截掉。

### Projection snapshot cut

`ThreadProjectionManager` 继续维护每个 thread 的 projection cut，但字段从
`history_cursor` 改为 `history_boundary`：

```rust
pub(crate) struct ProjectionSnapshotCut {
    pub(crate) generation: ProjectionGeneration,
    pub(crate) head_commit_id: Option<String>,
    pub(crate) history_boundary: ProjectionHistoryBoundary,
}
```

listener 处理 delivered event 时：

1. 读取 event 自带的 `persistence_boundary`。
2. 如果是 `Persisted(boundary)`，用该 physical boundary 更新 thread entry。
3. 如果是 `NoPersist`，保留当前 `history_boundary`。
4. 对可投影 event，在同一 manager owner 内生成 commit，并把 commit head 与当前
   `history_boundary` 绑定到同一个 cut。
5. 对不可投影但 persisted 的 event，只推进 `history_boundary`，不创建 commit。

attach 开始时捕获 `ProjectionSnapshotCut`，而不是分别捕获 generation、head 和 history
boundary。最终 response 使用同一个 cut：

- `snapshot.thread` 来自按 `history_boundary` 截断后的 reconstruction。
- `snapshot.headCommitId` 来自同一 cut 的 `head_commit_id`。
- 最终 attach 仍通过 `attach_if_generation_matches(...)` 校验 `generation`。

### Attach snapshot reconstruction

projection-only snapshot 读取路径保留现有 reconstruction 思路：

```rust
read_thread_projection_snapshot_at_cut(thread_id, cut)
```

该路径：

- metadata 仍通过 `read_thread_view(thread_id, include_turns = false)` 获取。
- history 仍通过现有 history load 路径读取，得到完整 `StoredThreadHistory.items`。
- 使用 `cut.history_boundary.truncate_history(&mut history_items)` 截断 physical history。
- 截断后的 history 传给 `reconstruct_thread_turns_for_turns_list(...)`。
- active live turn merge 不能把 snapshot 推过 captured `history_boundary`。

不允许在该路径中重新解释 event-domain count，也不允许在 attach 时读取当前 persisted history
长度作为 boundary。

## 迁移边界

旧 `ProjectionHistoryCursor(usize)` 应整体废弃，而不是只改注释。重命名的目的不是表面
整理，而是防止旧 cursor-domain 语义继续传播。

实现时应同时处理以下迁移点：

- `thread_projection_cut.rs`：定义 `ProjectionHistoryBoundary` 和新的
  `ProjectionSnapshotCut` 字段。
- `thread-store`：新增 append result 和 store-level boundary 类型。
- local / in-memory store：返回 append 后的 physical persisted item boundary。
- `LiveThread` 和 core persist path：向上返回 append result。
- protocol `Event`：携带 persisted boundary 或 no-persist 状态。
- app-server listener：删除 event persisted item count 估算，改用 event boundary。
- projection manager：用 `history_boundary` 维护 cut。
- attach snapshot read：只通过 boundary 语义 API 截断 history。

## 测试计划

### Store append result

覆盖 local store 和 in-memory store：

- append persisted item 后，`end_boundary` 与随后读取到的 `StoredThreadHistory.items.len()`
  一致。
- append 会被 persistence policy 过滤掉的 raw items 时，`end_boundary` 不前进。
- append 包含 `SessionMeta` / `TurnContext` 时，`end_boundary` 前进，因为它们属于
  physical persisted history。

### Event boundary propagation

覆盖 core persist/deliver 链路：

- 持久化 event deliver 给 listener 时，`Event` 携带 `Persisted(end_boundary)`。
- no-persist event deliver 给 listener 时，`Event` 携带 `NoPersist`，listener 不推进
  history boundary。
- listener 不再调用 event persisted item count helper 推进 projection cut。

### Snapshot cut regression

在 `codex-rs/app-server/src/request_processors/thread_projection.rs` 的现有 tests 模块中，
紧挨 `projection_snapshot_at_cut_excludes_history_after_cursor` 新增 regression。

测试构造 mixed physical history：

1. `SessionMeta`
2. visible turn 的 user / commentary / final `AgentMessage`
3. `TurnContext`
4. visible turn 的 assistant final response item / token count / `TurnComplete`
5. pending turn 的 persisted items

captured boundary 指向 visible turn 已处理完成的位置。断言：

- snapshot 包含 visible turn。
- visible turn 的 final `ThreadItem::AgentMessage` 存在。
- visible turn status 为 `Completed`。
- snapshot 不包含 pending turn。

保留现有 future-event 排除测试，确保已落盘但 listener 尚未投影的 event 不会进入 snapshot。
不要把主 regression 放到 `codex-gui` JSON fixture；该问题发生在 Rust 端 snapshot cut 与
physical history reconstruction。

### 验证命令

实现完成后从仓库根目录运行：

```sh
just test -p codex-app-server
just fmt
just fix -p codex-app-server
```

若实现修改了 shared protocol 或 thread-store crate，再补充对应 crate 的 focused test。
不要使用不存在的 `codex-rs/justfile` recipe。

## 风险与缓解

- 风险：改 `ThreadStore::append_items` 返回类型会触及 local / in-memory store、`LiveThread`、
  core persist path 和 app-server listener。
  - 缓解：append result 只包含 `end_boundary`，不引入 `start_boundary` / `appended_count`
    等额外字段。

- 风险：`Event` 增加 persistence boundary 影响序列化或外部协议。
  - 缓解：确认该 `Event` 是内部 agent event queue entry；projection wire schema 不变。

- 风险：no-persist event 的 projection commit 与 unchanged history boundary 组合不清晰。
  - 缓解：显式建模 `NoPersist`，并测试 listener 保持 history boundary 不变但仍可推进 commit。

- 风险：non-event persisted item 不单独推进 boundary，attach snapshot 短时间看不到 metadata。
  - 缓解：这些 item 不是 GUI projection visible event；后续 event boundary 会自然覆盖它们。

- 风险：未来开发者重新拿裸 count 做截断。
  - 缓解：`ProjectionHistoryBoundary` 不暴露通用 `item_count()`；snapshot 读取通过
    `truncate_history` 等语义 API 使用 boundary。

- 风险：active live turn merge 绕过 captured boundary。
  - 缓解：snapshot-at-cut 路径必须以 captured `history_boundary` 为上界；regression 同时断言
    final/completed 不丢和 pending future 不提前出现。
