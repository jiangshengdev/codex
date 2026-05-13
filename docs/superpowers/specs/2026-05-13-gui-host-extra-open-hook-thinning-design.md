# GUI Host Extra Open Hook 降侵入设计

日期：2026-05-13

状态：设计草案。本文是 `2026-05-13-gui-host-low-intrusion-refactor-design.md` 的后续补充，只收窄 `codex-rs/app-server/src/in_process.rs` 中 extra connection open hook 的剩余实现细节；不改变 `2026-05-11-codex-gui-host-redesign.md` 定义的 GUI host ownership model、runtime 路径或安全边界。

## 背景

GUI host MVP 的核心架构已经确定：

- TUI 只通过 `codex-app-server-client` 请求 GUI launch URL。
- app-server runtime owns GUI host lifecycle。
- TUI 不持有 `GuiHost`、`GuiHostHandle` 或 raw backend handle。
- 认证后的 browser `/ws` traffic 作为 extra in-process connection 接入现有 `MessageProcessor` 和 `outbound_connections`。

第一轮低侵入重构已经把大部分 extra connection 逻辑移到 `codex-rs/app-server/src/in_process_extra.rs`，把 GUI launch facade 逻辑移到 `codex-rs/app-server-client/src/gui.rs`。当前 `in_process.rs` 不包含 GUI / WebSocket / allowlist / Origin 概念，已经符合“旧文件只保留 hook”的主要方向。

剩余问题是：`in_process.rs` 的 extra connection open 路径仍直接知道 opened connection 需要哪些 outbound/session state 字段，并在 `ProcessorCommand::ExtraConnectionOpened` 上展开这些字段。后续上游如果继续演进 `OutboundConnectionState`、`ConnectionSessionState` 或 connection capabilities，当前 fork 仍容易在 `in_process.rs` 里反复适配字段漂移。

本文目标是把这部分字段知识继续下沉到 `in_process_extra.rs`，让 `in_process.rs` 只负责 runtime 编排与 channel 转发。

## 目标

- 进一步压薄 `codex-rs/app-server/src/in_process.rs` 中 extra connection open 的实现细节。
- 让 `ProcessorCommand::ExtraConnectionOpened` 不再暴露多组 outbound/session Arc 字段。
- 将 opened connection 的 outbound control、processor registration state、writer bridge 构造集中到 `in_process_extra.rs`。
- 保持 `in_process.rs` 继续拥有 runtime task、`MessageProcessor` 构造、主连接 writer、`outbound_connections` HashMap 和 shutdown ordering。
- 保持主连接外部行为不变：`InProcessClientHandle::{request, notify, sender}`、`InProcessClientSender::{request, notify, respond_to_server_request, fail_server_request}`、`ProcessorCommand::{Request, Notification}` 的语义不变。
- 保持 GUI host 产品行为、安全边界、allowlist、launch URL shape 和 ownership model 不变。

## 非目标

- 不切换到 `TransportEvent`。
- 不新增第二套 app-server runtime 或第二套 outbound router。
- 不把 GUI / WebSocket / allowlist / Origin 概念移入 `in_process.rs`。
- 不把 GUI traffic 通过 TUI 转发。
- 不改变 `GuiHostManager` 所属位置。
- 不重排 `codex-app-server-client/src/lib.rs` 的整体 facade 结构。
- 不引入通用 virtual connection framework；当前只处理 GUI MVP 已需要的 extra in-process connection open hook。

## 当前剩余侵入点

当前 `in_process.rs` 中仍有三类可继续压缩的细节：

1. `ProcessorCommand::ExtraConnectionOpened` 展开持有：
   - `connection_id`
   - `outbound_initialized`
   - `outbound_experimental_api_enabled`
   - `outbound_opted_out_notification_methods`

2. `InProcessClientMessage::Extra(ExtraConnectionCommand::Opened { ... })` 分支直接构造：
   - `mpsc::channel::<QueuedOutgoingMessage>(channel_capacity)`
   - extra writer bridge
   - per-connection initialized / experimental / opted-out state
   - `OutboundControl::Register`
   - `ProcessorCommand::ExtraConnectionOpened`

3. `ExtraConnectionState::register_opened(...)` 仍以多个字段参数接收 opened state。

这些细节本质上属于 extra connection lifecycle，不属于 `in_process.rs` 的 runtime 编排职责。

## 设计原则

1. `in_process.rs` 只保留 runtime 编排：创建主 runtime channel、持有 `outbound_connections`、select loop、向 processor / outbound router 转发命令。
2. `in_process_extra.rs` 拥有 opened connection state 的具体字段。未来 upstream 对 outbound/session capabilities 增字段，优先只改这里。
3. 新类型必须中性命名，不包含 GUI / WebSocket / browser 字样。
4. 不为一次性代码制造空抽象。新增类型必须同时减少 `ProcessorCommand` payload 泄漏和 open 分支构造细节。
5. 不改变 close / backpressure / request roundtrip 语义。

## 目标形态

### 新增聚合类型

在 `codex-rs/app-server/src/in_process_extra.rs` 中新增 crate-private 聚合类型：

```rust
pub(crate) struct PreparedExtraConnectionOpen {
    pub(crate) connection_id: ConnectionId,
    pub(crate) outbound_control: OutboundControl,
    pub(crate) processor_open: OpenedExtraConnection,
}
```

`PreparedExtraConnectionOpen` 是 runtime open 分支的返回包。它把 `in_process.rs` 必须发送到两个 runtime 子系统的内容聚合在一起：

- `outbound_control` 发给 outbound router task，用于注册 writer 和 outbound state。
- `processor_open` 发给 processor task，用于注册 per-extra `ConnectionSessionState` 和 mirror outbound state。

### 新增 processor-side opened state

在 `in_process_extra.rs` 中新增：

```rust
pub(crate) struct OpenedExtraConnection {
    connection_id: ConnectionId,
    outbound_initialized: Arc<AtomicBool>,
    outbound_experimental_api_enabled: Arc<AtomicBool>,
    outbound_opted_out_notification_methods: Arc<RwLock<HashSet<String>>>,
}
```

字段保持私有。`in_process.rs` 不再解构这些字段。

`ExtraConnectionState` 提供注册方法：

```rust
impl ExtraConnectionState {
    pub(crate) fn register_opened(&mut self, opened: OpenedExtraConnection);
}
```

`register_opened` 在 `in_process_extra.rs` 内部解构 `OpenedExtraConnection`，并创建 `ExtraConnectionEntry { session_state, ... }`。

### 新增 prepare helper

在 `in_process_extra.rs` 中新增：

```rust
pub(crate) fn prepare_opened_connection(
    connection_id: ConnectionId,
    outgoing_tx: mpsc::Sender<String>,
    disconnect_token: CancellationToken,
    channel_capacity: usize,
) -> PreparedExtraConnectionOpen;
```

该 helper 负责：

1. 创建 `mpsc::channel::<QueuedOutgoingMessage>(channel_capacity)`。
2. 调用 `spawn_extra_writer_bridge(connection_id, outgoing_tx, extra_writer_rx)`。
3. 创建 per-connection outbound state：
   - `initialized = Arc::new(AtomicBool::new(false))`
   - `experimental_api_enabled = Arc::new(AtomicBool::new(false))`
   - `opted_out_notification_methods = Arc::new(RwLock::new(HashSet::new()))`
4. 构造 `OutboundControl::Register { ... }`。
5. 构造 `OpenedExtraConnection { ... }`。
6. 返回 `PreparedExtraConnectionOpen`。

`prepare_opened_connection` 不发送 channel，不访问 `MessageProcessor`，不访问 `outbound_connections`。它只准备 open 所需的数据。

### `ProcessorCommand` 收窄

`codex-rs/app-server/src/in_process.rs` 中的 processor command 从多字段形态：

```rust
ExtraConnectionOpened {
    connection_id: ConnectionId,
    outbound_initialized: Arc<AtomicBool>,
    outbound_experimental_api_enabled: Arc<AtomicBool>,
    outbound_opted_out_notification_methods: Arc<RwLock<HashSet<String>>>,
}
```

收窄为：

```rust
ExtraConnectionOpened(crate::in_process_extra::OpenedExtraConnection)
```

processor loop 对应 arm 收窄为：

```rust
Some(ProcessorCommand::ExtraConnectionOpened(opened)) => {
    extra_connections.register_opened(opened);
}
```

这样 `in_process.rs` 不再知道 opened state 的字段列表。

### open 分支收窄

`in_process.rs` 中 `ExtraConnectionCommand::Opened` 分支目标形态：

```rust
let prepared = crate::in_process_extra::prepare_opened_connection(
    connection_id,
    outgoing_tx,
    disconnect_token,
    channel_capacity,
);

if outbound_control_tx
    .send(prepared.outbound_control)
    .await
    .is_err()
{
    break;
}

if processor_tx
    .send(ProcessorCommand::ExtraConnectionOpened(prepared.processor_open))
    .await
    .is_err()
{
    break;
}
```

该分支仍然负责两个 runtime channel 的发送顺序。顺序保持：先注册 outbound state，再注册 processor state。这样避免 processor 先处理 request 时对应 outbound connection 尚未注册。

### request / notification / close 分支不做大改

`ExtraConnectionCommand::Request` / `Notification` 继续转发为 `ProcessorCommand::Extra(command)`。

`ExtraConnectionCommand::Closed` 继续先发送 processor close，再发送 outbound unregister。这样保留当前 cleanup 语义：

1. processor 先运行 `connection_closed(connection_id, session_state)`。
2. outbound router 再移除 writer state。

如果后续实现发现 close 顺序需要调整，必须由现有 close/backpressure 测试驱动，不属于本文默认设计。

## 数据流

认证后的 GUI connection open 数据流保持不变，只是 open 准备细节下沉：

```text
GuiTransportBackend
  -> InProcessClientSender::register_extra_connection
  -> InProcessClientMessage::Extra(Opened { connection_id, outgoing_tx, disconnect_token })
  -> in_process.rs runtime loop
  -> in_process_extra::prepare_opened_connection(...)
       -> spawn extra writer bridge
       -> build OutboundControl::Register
       -> build OpenedExtraConnection
  -> outbound_control_tx.send(Register)
  -> processor_tx.send(ExtraConnectionOpened(OpenedExtraConnection))
  -> ExtraConnectionState::register_opened(opened)
```

request / notification / close 数据流保持当前形态。

## 错误与 shutdown 语义

- 如果 `outbound_control_tx.send(...)` 失败，runtime loop 退出，行为等价于当前分支遇到 outbound router 关闭。
- 如果 `processor_tx.send(...)` 失败，runtime loop 退出，行为等价于当前分支遇到 processor task 关闭。
- `prepare_opened_connection` 启动 writer bridge 后，如果后续发送失败，writer bridge 会随 channel drop 自然退出；不新增补偿路径。
- `ExtraConnectionHandle::Drop` 的 best-effort close 语义不变。
- runtime abort / shutdown timeout 路径仍允许缺失单个 `ExtraConnectionClosed`，由整体 task cleanup 兜底。

## 测试策略

本设计不要求新增产品行为测试，但实施时必须保持并复跑现有覆盖：

- `codex-app-server` in-process main connection tests。
- extra connection request roundtrip test。
- extra connection notification accepted test。
- dropping extra handle triggers connection closed test。
- register/unregister progress under sustained outgoing load test。
- register extra connection after shutdown returns `BrokenPipe` test。
- `codex-app-server-client` GUI launch URL and shutdown ordering tests。

建议新增或调整一个小的 unit test，验证 `prepare_opened_connection` 的结构性输出：

- 返回的 `connection_id` 等于输入。
- `outbound_control` 是 `OutboundControl::Register`。
- `processor_open.connection_id()` 或等价测试 helper 返回同一 `ConnectionId`。

如果 `OpenedExtraConnection` 字段保持私有，可以为测试提供 `#[cfg(test)]` accessor，而不是公开字段。

## 验收标准

- `ProcessorCommand::ExtraConnectionOpened` 只持有 `OpenedExtraConnection` 一个 payload。
- `in_process.rs` 不直接构造 extra writer bridge。
- `in_process.rs` 不直接创建 extra connection 的 `AtomicBool` / `RwLock<HashSet<String>>` outbound state。
- `in_process.rs` 的 `ExtraConnectionCommand::Opened` 分支只保留 prepare helper 调用和两个 channel send。
- `ExtraConnectionState::register_opened` 接收 `OpenedExtraConnection`，不接收多参数 outbound state。
- `in_process_extra.rs` 仍不依赖 `codex-gui-host`。
- `in_process.rs` 仍不包含 GUI / WebSocket / allowlist / Origin 概念。
- 主连接外部语义不变。
- 所有现有 app-server extra connection 和 app-server-client GUI launch/shutdown 测试保持通过。

## 未来上游同步收益

完成后，未来上游如果对 connection capabilities、outbound initialized gating、opt-out notification method storage 或 `OutboundConnectionState::new(...)` 参数继续演进，fork 主要在 `in_process_extra.rs` 中适配字段变化。

`in_process.rs` 中的长期 fork-local 改动将更接近稳定 hook：

- extra command enum wrapper。
- `register_extra_connection` 入口。
- outbound control select 分支。
- processor extra branch。
- thread listener connection ids expansion。

这些 hook 是为满足 GUI host MVP 目标不可避免的触达面；本文不试图消除它们，只消除 hook 内部不必要暴露的字段知识。
