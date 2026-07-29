# Projection Snapshot Head Cut Design

## 背景

`thread/projection/attach` 返回 `ThreadProjectionAttachResponse`，其中 `snapshot.thread`
来自 persisted/live thread view reconstruction，`snapshot.headCommitId` 来自
`ThreadProjectionManager` 已推进到的 projection commit head。

当前风险是这两个值可能不是同一个时间切片。core 的 `send_event_raw()` 会先把 event 写入
rollout/thread store，再 deliver 给 app-server listener。若某个 event 已经持久化，但 listener
尚未处理并推进 projection head，此时 attach command 先被 listener 处理，snapshot 可能读到该
event，而 `headCommitId` 仍停在旧 commit。随后 listener 再处理同一个 event，客户端会再收到一条
`thread/projection/event`，造成同一语义事件先出现在 snapshot、后又作为 projection event 到达。

本设计面向 fork-only 代码。当前 fork 需要持续从 upstream tag 合并代码，并且 projection 修复不会
回到 upstream。因此设计应尽量压低对 upstream 高变动面的侵入。

## 已确认选择

采用 B-local 方案：

- 保留“snapshot 按 projection watermark/cut 截断”的语义。
- 不修改 `ThreadStore` trait。
- 不修改 core persist/deliver 顺序。
- 不引入跨 crate storage watermark API。
- 允许在已有代码中添加小方法或 helper，但不改变原有功能语义。
- 将主要状态与行为限制在 app-server projection / listener 路径内。

为了避免 app-server-local 复制 persistence 规则漂移，允许新增一个很小的共享 helper，用来计算
某个 event 会追加多少个 canonical `RolloutItem`。这个 helper 不应改变任何写入行为，只暴露现有
规则供 listener 侧 cursor 推进复用。

## 目标

- `thread/projection/attach` 返回的 `snapshot.thread` 与 `snapshot.headCommitId` 描述同一个
  projection cut。
- 已持久化但 listener 尚未投影的 event 不得出现在 attach snapshot 中。
- 后续 listener 处理该 event 时，仍正常发送对应 `thread/projection/event`。
- 继续复用现有 canonical thread reconstruction helper，避免维护第二套完整 projection-owned
  `Thread` reducer。
- 保持 projection wire schema 不变。
- 保持现有 `ProjectionGeneration` stale attach gate 不变。
- 尽量把 diff 收敛在 app-server projection 层和一个小 helper 上，降低后续 upstream tag merge
  冲突面。

## 非目标

- 不解决 projection fanout 对 ordinary thread notification 的 backpressure 问题。
- 不重构 `ThreadStore` 为正式 watermark/index API。
- 不改变 rollout JSONL 文件格式。
- 不改变 core 的 `send_event_raw()` 顺序。
- 不改变 ordinary thread subscription lifecycle。
- 不复制一套完整 `ThreadProjectionManager` 内部 snapshot state。
- 不通过调整 `tokio::select!` 分支顺序或 attach 前 drain ready events 作为修复。

## 设计

### Projection history cursor

新增内部 cursor，表示 listener 已处理到的 canonical history item 上界：

```rust
pub(crate) struct ProjectionHistoryCursor {
    item_count: usize,
}
```

`item_count` 的语义是：snapshot reconstruction 只能使用 persisted history 的前
`item_count` 个 `RolloutItem`。它不是 commit id、event id、turn id，也不暴露到 protocol。

cursor 由 listener 拥有并按 listener 实际处理进度推进。不能在 attach 时直接读取当前 persisted
history 长度，因为那会把“已 persist 但 listener 尚未处理”的 event 也包含进去，问题会原样存在。

### 初始化 cursor

listener 启动时初始化 cursor：

- 对已有 persisted thread：读取当前 canonical history 长度，作为 baseline cursor。
- 对尚未 materialized 的新 thread：cursor 从 0 开始。

这个 baseline 表示 listener 启动前已经存在、且应被视为当前 projection baseline 的 history。之后
listener 只按自己实际处理的 events 推进 cursor。

如果读取 baseline history 失败，应沿用当前 snapshot/read 的错误语义，不引入后台静默失败状态。

### 推进 cursor

listener 每处理一个 `conversation.next_event()` 后，根据该 event 对 canonical history 的持久化贡献
推进 cursor。

新增一个小 helper，例如：

```rust
pub(crate) fn canonical_rollout_item_count_for_event(msg: &EventMsg) -> usize
```

或等价 API。该 helper 必须复用当前 persistence 过滤规则，只暴露计数，不执行写入。它的用途是让
listener cursor 与 core/thread-store 的实际 canonical persistence 规则保持一致。

推进顺序要求：

1. listener 将 event 转成 typed notification。
2. `ThreadProjectionManager::project_notification(...)` 对可投影 notification 生成 commit，并在同一
   PM owner 内把该 commit head 绑定到推进后的 cursor。
3. 普通 notification delivery 保持现有行为。

对不可投影但会持久化的 event，cursor 仍应推进；PM 的 `headCommitId` 不变，但 snapshot cut 的
history cursor 可以前进。这样 attach snapshot 能包含已由 listener 处理过、但不产生 projection
event 的 persisted history。

### Projection snapshot cut

`ThreadProjectionManager` 扩展内部状态，记录当前 snapshot cut：

```rust
pub(crate) struct ProjectionSnapshotCut {
    pub(crate) generation: ProjectionGeneration,
    pub(crate) head_commit_id: Option<String>,
    pub(crate) history_cursor: ProjectionHistoryCursor,
}
```

attach 开始时捕获 cut，而不是分别捕获 generation 和 head：

- `generation` 继续用于 stale attach gate。
- `head_commit_id` 是返回给客户端的 projection head。
- `history_cursor` 是 snapshot reconstruction 的 persisted history 上界。

PM 中每个 thread entry 需要记录当前 `history_cursor`。可投影 event 推进 head 时同步推进 cursor；
不可投影但已处理的 persisted event 只推进 cursor，不创建 commit。

### Attach snapshot reconstruction

新增 projection-only snapshot 读取路径，例如：

```rust
read_thread_projection_snapshot_at_cut(thread_id, cut)
```

该路径保留现有 reconstruction 思路：

- metadata 仍通过 `read_thread_view(thread_id, include_turns = false)` 获取。
- history 仍通过现有 history load 路径读取。
- 读取到 full history 后，在 app-server 内按 `cut.history_cursor.item_count` 截断。
- 截断后的 history 传给 `reconstruct_thread_turns_for_turns_list(...)`。
- active live turn merge 只能包含 listener 已经处理进 `ThreadState` 的 active turn 状态；若 active
  turn 会把 snapshot 推过 cursor，必须以 cursor 为准，不能把 pending persisted event 提前暴露。

最终 response 使用同一个 cut：

- `snapshot.thread` 来自 `history_cursor` 截断后的 reconstruction。
- `snapshot.headCommitId` 来自同一 cut 的 `head_commit_id`。
- 最终 attach 仍通过 `attach_if_generation_matches(...)` 校验 `generation`。

### 不使用 queue drain 作为修复

不采用“attach 前 drain listener queue”或“改变 `tokio::select!` 顺序”。这类做法只能覆盖 event 已经
到达 listener queue 的窗口，无法覆盖 event 已 persist 但尚未 deliver 到 listener 的窗口。cursor
必须反映 listener 已处理进度，而不是 queue ready 状态。

## 侵入性控制

允许新增方法，但应避免破坏或重塑 upstream 高变动 API：

- 不改 `ThreadStore` trait 签名。
- 不改 Local / InMemory store 的外部行为。
- 不改 protocol schema。
- 不改 core event delivery 顺序。
- 新 helper 只暴露 persistence 计数规则，不改变写入路径。
- app-server 热文件只增加薄 hook，cursor/cut 细节优先放在新模块中。

建议新增模块：

- `app-server/src/thread_projection_cut.rs`：`ProjectionHistoryCursor`、
  `ProjectionSnapshotCut` 及小型状态方法。
- 或者若代码量很小，先放在 `thread_projection.rs` 附近，但避免继续膨胀 listener / processor 热文件。

## 测试计划

### 单元测试

- `ThreadProjectionManager`：
  - 可投影 event 同时推进 head 和 cursor。
  - 不可投影但 persisted event 只推进 cursor，不改变 head。
  - `capture_snapshot_cut` 返回同一个临界区内的 generation/head/cursor。
  - `remove_thread` 后 stale generation 仍阻止旧 attach 成功。

- persistence count helper：
  - 覆盖会持久化为 canonical `RolloutItem` 的代表性 `EventMsg`。
  - 覆盖不会持久化的 event 返回 0。
  - 与现有 persistence filtering 共享规则，避免测试只复制另一份错误逻辑。

### Race regression

构造关键 interleaving：

1. persisted history 已经包含 pending event。
2. listener / PM cursor 仍停在该 event 之前。
3. 执行 `thread/projection/attach`。
4. 断言 attach snapshot 不包含 pending event。
5. 断言 returned `headCommitId` 是 cursor 对应的旧 head。
6. 推进 listener 处理 pending event。
7. 断言客户端收到对应 `thread/projection/event`，且客户端不会从 snapshot 与 event 中重复 apply
   同一语义事件。

### 验证命令

实现完成后优先跑窄范围验证：

```sh
RUST_MIN_STACK=8388608 cargo nextest run -p codex-app-server --test-threads 4 thread_projection
```

若修改了共享 helper 所在 crate，再补对应 crate 的 targeted test。完成 Rust 代码修改后按仓库规则跑：

```sh
just fmt
just fix -p codex-app-server
```

## 风险与缓解

- 风险：cursor 推进规则与 actual persistence 规则漂移。
  - 缓解：新增 helper 复用 persistence filtering 规则，只暴露计数，不在 app-server 复制 match。

- 风险：active live turn merge 绕过 cursor，把 pending event 提前带入 snapshot。
  - 缓解：snapshot-at-cut 路径必须以 cursor 为上界；测试覆盖 active turn 与 persisted pending event
    同时存在的场景。

- 风险：baseline cursor 初始化读取 full history 有额外成本。
  - 缓解：只在 listener startup / resume 时执行；attach 本来已读取 history，新增成本主要是记录长度。

- 风险：后续 upstream merge 改了 persistence 规则。
  - 缓解：helper 位于规则 owner 附近，merge 冲突集中在小范围；测试用 projection attach race 保护最终
    observable contract。
