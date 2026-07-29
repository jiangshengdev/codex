# GUI Host 降侵入重排设计

状态：设计草案。本文是 `2026-05-11-codex-gui-host-redesign.md` 的实现组织补充，不改变 GUI host MVP 的产品目标、crate ownership 或安全边界。

## 背景

当前 GUI host MVP 要求 TUI 通过 `codex-app-server-client` 请求 launch URL，`codex-app-server` 在 TUI 同进程的 in-process app-server runtime 内 lazy-start / reuse `codex-gui-host`，浏览器认证后的 `/ws` traffic 作为额外连接接入现有 app-server projection pipeline。

这个目标决定了 `codex-rs/app-server/src/in_process.rs` 不能完全零改动：GUI 连接必须与 TUI 主连接平级进入同一个 `MessageProcessor`、同一个 `outbound_connections` routing、同一套 thread/projection attach 与 cleanup 语义。

但当前实现把大量 extra connection 细节直接写进两个上游热点文件：

- `codex-rs/app-server/src/in_process.rs`
- `codex-rs/app-server-client/src/lib.rs`

后续继续同步上游 tag 时，这种形态容易在 runtime loop、shutdown、client facade、dependency wiring 和测试区域产生人工冲突。本文目标是把必要触达面保留为薄 hook，把实现细节迁入新文件。

## 目标

- 保留原 GUI host ownership model：TUI 只请求 launch URL；app-server runtime owns GUI host lifecycle；TUI 不持有 `GuiHost`、`GuiHostHandle` 或 raw backend handle。
- 保留浏览器连接接入现有 app-server pipeline 的语义：raw JSON-RPC request 走 `MessageProcessor::process_request`，outbound fanout 走 `route_outgoing_envelope` 与 `OutboundConnectionState`。
- 显著降低 `in_process.rs` 和 `app-server-client/src/lib.rs` 的 diff 面积与语义侵入。
- 让未来上游同步时的冲突集中在少数 hook 行，而不是分散在数百行 runtime / client lifecycle 实现中。
- 保持主连接外部行为不变：`InProcessClientHandle::request` / `notify`、`ProcessorCommand::Request` / `Notification`、`MessageProcessor::process_client_request`、`ConnectionSessionState`、`OutboundConnectionState` 与 `route_outgoing_envelope` 的语义不因 GUI 连接改变。

## 非目标

- 不重新设计 GUI host 安全边界、allowlist、Host / Origin 校验或 `/ws` 首帧认证。
- 不把 TUI 变成浏览器 traffic 转发层。
- 不把 GUI host daemon 化。
- 不把 MVP in-process 路径改成 `TransportEvent` producer。独立 app-server process 的 `TransportEvent::ConnectionOpened { origin: ConnectionOrigin::GuiHost }` 路径仍属于未来扩展。
- 不为了降侵入而牺牲 projection fanout、per-connection session state 或 cleanup 语义。

## 设计原则

1. 新逻辑默认进新文件。旧文件只保留必要的创建、分派和调用点。
2. 旧文件里的修改应是可枚举 hook，而不是大块业务实现。
3. hook 必须保持中性命名。`in_process.rs` 不出现 GUI、WebSocket、allowlist、Origin 等概念。
4. 对主连接路径做行为等价保护。所有重排都要有测试证明主连接 initialize、typed request、event forwarding 和 shutdown 仍按原语义工作。
5. 不使用一次性 helper 抽象。新模块边界必须承载真实复杂度，例如 extra connection lifecycle、outbound control、writer bridge 或 app-server-client GUI extension。

## 目标文件结构

### `codex-rs/app-server/src/in_process.rs`

保留 runtime 主体和必要 hook。目标是让该文件只知道有一种中性的 extra in-process connection，不知道 GUI host。

允许保留的改动：

- `mod in_process_extra;` 或 `mod in_process;` 子模块声明，具体命名以现有 module 布局为准。
- `pub use` 导出 `ExtraConnectionHandle` / `ExtraConnectionCommandSender`，供 `gui_transport.rs` 使用。
- `InProcessClientSender::register_extra_connection` 薄方法，委托给 extra connection 模块构造 handle 和注册命令。
- `InProcessClientMessage` / `ProcessorCommand` 的 extra variants，优先收敛成 wrapper variant：

  ```rust
  Extra(ExtraConnectionCommand)
  ```

  如果 wrapper 引入 borrow / ownership 复杂度超过收益，可以保留四个 explicit variants，但 variant payload 类型应来自新模块。

- outbound router loop 增加一条 control 分支；control 类型与处理函数来自新模块。
- processor loop 增加一个 delegated branch；具体 request / notification / close 行为由新模块 helper 执行。
- `thread_created_rx` 分发时通过 helper 生成 connection ids：

  ```rust
  let connection_ids = extra_connections.initialized_connection_ids(session.initialized());
  ```

  helper 内部负责追加 initialized extra connection ids。

不应继续留在 `in_process.rs` 的内容：

- `ExtraConnectionHandle` 的完整 struct / Drop 实现。
- `ExtraConnectionCommandSender` 的完整发送逻辑。
- extra connection ID counter 与分配函数。
- outbound control enum 及其注册 / 注销细节。
- extra writer bridge 的 serialization loop。
- extra connection tests 的大部分测试体。

### `codex-rs/app-server/src/in_process_extra.rs`

新增文件，承载 extra in-process connection 的实现细节。该文件不依赖 `codex-gui-host`。

职责：

- 定义 `ExtraConnectionHandle`。
- 定义 `ExtraConnectionCommandSender`。
- 定义 `ExtraConnectionCommand`，表示 open / request / notification / close。
- 定义 `OutboundControl`，表示 outbound router 的 register / unregister。
- 管理 `AtomicU64` connection id 分配，保证不与 `IN_PROCESS_CONNECTION_ID` 冲突。
- 管理 per-extra `ConnectionSessionState`、outbound initialized flag、experimental flag 和 opted-out notification methods。
- 提供 processor loop 可调用的 helper：

  ```rust
  impl ExtraConnectionState {
      async fn handle_processor_command(
          &mut self,
          processor: &Arc<MessageProcessor>,
          command: ExtraConnectionCommand,
      );

      fn initialized_connection_ids(&self, include_main: bool) -> Vec<ConnectionId>;
  }
  ```

- 提供 outbound router 可调用的 helper：

  ```rust
  fn handle_outbound_control(
      outbound_connections: &mut HashMap<ConnectionId, OutboundConnectionState>,
      control: OutboundControl,
  );
  ```

- 提供 writer bridge：

  ```rust
  fn spawn_extra_writer_bridge(
      connection_id: ConnectionId,
      outgoing_tx: mpsc::Sender<String>,
      writer_rx: mpsc::Receiver<QueuedOutgoingMessage>,
  );
  ```

测试迁移：

- ID 分配测试。
- handle drop 发送 close command。
- backpressure 下 close command 仍尽力投递。
- extra request 到达 `MessageProcessor::process_request`。
- extra close 触发 `MessageProcessor::connection_closed`。
- sustained outgoing load 下 register / unregister 有进展。

这些测试可以放在 `in_process_extra.rs` 的 `#[cfg(test)]` 模块中；只有需要完整 runtime 的 integration-style 测试留在 `in_process.rs`。

### `codex-rs/app-server/src/gui_host.rs`

继续负责 GUI host lifecycle。该文件保留现有方向：

- `GuiHostManager` 持有 `InProcessClientSender`，不持有 `InProcessClientHandle`。
- `launch_url_for_thread` lazy-start / reuse `GuiHost`。
- `shutdown` 负责 async graceful shutdown。
- `cancel_nonblocking` 负责 Drop 路径的同步取消。

该文件不应接触 `MessageProcessor`、`OutboundConnectionState` 或 app-server request dispatch 细节。

### `codex-rs/app-server/src/gui_transport.rs`

继续负责 `GuiBackend` 实现和 browser WebSocket 到 extra connection 的桥接。

职责保持：

- 认证后调用 `InProcessClientSender::register_extra_connection`。
- inbound pump 解析 `JSONRPCMessage`。
- browser-to-server allowlist 后，只转发允许的 request / notification。
- parse error 直接通过 `ExtraConnectionHandle.outgoing_tx` 写回本连接。
- outbound pump 从 `ExtraConnectionHandle.outgoing_rx` 写到 `AuthenticatedGuiConnection.outbound_tx`。
- bridge 任务响应 `disconnect_token` 和 manager cancel。

该文件可以依赖 `in_process_extra` 暴露的 public handle / command sender，但不应访问 extra connection internal state。

### `codex-rs/app-server-client/src/gui.rs`

扩展为 GUI client facade 的主要承载文件。

职责：

- 定义 `GuiLaunchUrl`。
- 定义 `GuiLaunchError`。
- 定义 `AppServerClientGuiExt`。
- 实现 remote client 的 unsupported path。
- 尽量承载 in-process client 的 extension impl。

如果 Rust orphan / visibility 约束允许，`impl AppServerClientGuiExt for InProcessAppServerClient` 应从 `lib.rs` 迁入本文件。若需要访问 private field，可以在 `InProcessAppServerClient` 上提供一个小的 crate-private accessor：

```rust
pub(crate) fn gui_host_manager(
    &self,
) -> Option<Arc<codex_app_server::gui_host::GuiHostManager>>;
```

该 accessor 是 `lib.rs` 的最小 hook，具体 launch URL 逻辑仍留在 `gui.rs`。

### `codex-rs/app-server-client/src/lib.rs`

目标是回退当前 `Option` reshape。字段保持接近上游基线：

```rust
pub struct InProcessAppServerClient {
    command_tx: mpsc::Sender<ClientCommand>,
    event_rx: mpsc::Receiver<InProcessServerEvent>,
    worker_handle: tokio::task::JoinHandle<()>,
    gui_host_manager: Arc<codex_app_server::gui_host::GuiHostManager>,
}
```

允许保留的改动：

- `pub mod gui;`
- `pub use crate::gui::{AppServerClientGuiExt, GuiLaunchError, GuiLaunchUrl};`
- `start` 中从 `handle.sender()` clone 构造 `GuiHostManager`。
- `shutdown(self)` 中先 shutdown GUI manager，再执行原有 worker shutdown 逻辑。
- `Drop` 中调用 `gui_host_manager.cancel_nonblocking()`。
- 一个 crate-private accessor，供 `gui.rs` 实现 extension trait。

不应保留的改动：

- `command_tx: Option<_>`。
- `event_rx: Option<_>`。
- `worker_handle: Option<_>`。
- `command_tx()` panic helper。
- 为了支持 `Option` reshape 而修改所有 request / notify / resolve / reject callsite。
- `next_event` 从 `self.event_rx.recv().await` 改为 `self.event_rx.as_mut()?.recv().await`。

`shutdown(self)` 可以保持消耗 self 的签名。为了先 shutdown manager 后仍能移动其它字段，可以解构 self：

```rust
pub async fn shutdown(self) -> IoResult<()> {
    let Self {
        command_tx,
        event_rx,
        worker_handle,
        gui_host_manager,
    } = self;

    gui_host_manager.shutdown().await;

    // continue with existing shutdown sequence
}
```

如果 `Drop` 与 moving fields 的约束导致不能直接 move out of a Drop type，应使用一个小的 internal state struct 承载 fields，或者使用 `ManuallyDrop` 的局部模式。优先选择 internal state struct，因为它更容易 review：

```rust
struct InProcessAppServerClientState {
    command_tx: mpsc::Sender<ClientCommand>,
    event_rx: mpsc::Receiver<InProcessServerEvent>,
    worker_handle: tokio::task::JoinHandle<()>,
    gui_host_manager: Arc<codex_app_server::gui_host::GuiHostManager>,
}

pub struct InProcessAppServerClient {
    state: Option<InProcessAppServerClientState>,
}
```

这个 fallback 只允许集中在一个 field 上，不允许把所有 public methods 都改成 scattered `Option` access。正常 request path 可通过 `self.state.as_ref().expect("client is active")` 的一个 helper 访问；但推荐先尝试无 `Drop` move 问题的更小形态。

## 最小旧文件触达面

### `in_process.rs`

必须触达：

- command enum：增加 extra command 入口。
- `InProcessClientSender`：增加 `register_extra_connection`。
- outbound router task：增加 control channel 与 control branch。
- processor task：持有 `ExtraConnectionState` 并委托处理 extra command。
- `thread_created_rx`：用 helper 生成主连接 + initialized extra 连接列表。
- tests：保留少数完整 runtime 行为测试。

可以迁出：

- extra handle / sender / state / outbound control / writer bridge / 大部分 tests。

### `app-server-client/src/lib.rs`

必须触达：

- module export。
- re-export。
- `InProcessAppServerClient::start` 构造 `GuiHostManager`。
- `InProcessAppServerClient::shutdown` 的 ordering。
- Drop cancellation。
- crate-private manager accessor。

可以回退：

- 全字段 `Option` 化。
- 全 callsite `command_tx()` 改写。
- `next_event` 行为改写。
- extension trait impl 主体。

## 行为不变量

- 主连接 `IN_PROCESS_CONNECTION_ID` 的 initialize / initialized 顺序不变。
- 主连接 typed request 仍走 `process_client_request`。
- extra connection raw request 走 `process_request`，以保留 unknown method / malformed request 的 JSON-RPC error 行为。
- extra connection 初始化前，非 initialize request 仍由 app-server 既有 session gate 返回标准 error。
- `thread/projection/event` 只 fanout 给 initialized connection。
- 浏览器认证失败不调用 `register_extra_connection`。
- browser close / refresh / host shutdown 触发 `ExtraConnectionHandle::Drop`，正常路径至多一次投递 close。
- runtime abort / shutdown timeout 路径允许缺失 per-connection close，由整体 task cleanup 兜底。
- TUI 退出时 GUI manager shutdown / cancel 发生在 worker task 结束之前或同时。

## 迁移顺序

### Phase 1：收窄 app-server-client 侵入

1. 为当前 GUI launch URL 行为补测试，覆盖 in-process success、remote unsupported、shutdown ordering。
2. 把 `AppServerClientGuiExt` 的 impl 迁入 `app-server-client/src/gui.rs`，必要时新增 crate-private accessor。
3. 回退 `InProcessAppServerClient` 的 scattered `Option` reshape。
4. 保留 `shutdown` 中 GUI manager 先停、worker 后停的 ordering。
5. 跑 `cargo test -p codex-app-server-client`。

### Phase 2：抽出 extra connection 模块

1. 新建 `codex-rs/app-server/src/in_process_extra.rs`。
2. 迁移 `ExtraConnectionHandle`、`ExtraConnectionCommandSender`、ID 分配、outbound control、writer bridge。
3. 迁移 extra connection 单元测试。
4. 在 `in_process.rs` 中保留薄 hook，使用 helper 处理 open / request / notification / close。
5. 跑 `cargo test -p codex-app-server in_process` 或具体 test names，确认主连接与 extra connection 行为不变。

### Phase 3：差异面检查

1. 运行 `git diff --stat rust-v0.130.0 -- codex-rs/app-server/src/in_process.rs codex-rs/app-server-client/src/lib.rs`。
2. 运行 `git diff --unified=20 rust-v0.130.0 -- codex-rs/app-server/src/in_process.rs codex-rs/app-server-client/src/lib.rs`，人工检查旧文件是否只剩 hook。
3. 运行 `git diff --check`。
4. 对照本文的“最小旧文件触达面”检查是否有实现细节残留在旧文件。

## 测试策略

### app-server-client

- `gui_launch_url_returns_real_url_for_in_process`
- `remote_gui_launch_url_returns_unsupported`
- `shutdown_stops_gui_host_before_worker`
- existing typed request tests
- existing `next_event_surfaces_lagged_markers`

### app-server in-process

- 主连接 initialize + typed v2 request 仍通过。
- extra connection 分配非主连接 ID。
- extra connection request 收到 JSON-RPC response / error envelope。
- extra notification 可投递。
- drop handle 触发 close command。
- close 后 outgoing channel 关闭。
- sustained outgoing load 下 register / unregister 有进展。
- thread created dispatch 包含 initialized extra connections，不包含未 initialized extra connections。

### GUI bridge

- 认证成功后才注册 extra connection。
- parse error 不进入 processor，直接写回当前 connection。
- 不在 allowlist 的 request 不进入 processor。
- server-to-browser notification filter 保持只放行 `thread/projection/event`。

## 风险与处理

- `in_process.rs` 的 outbound router loop 仍必须改形状。处理方式是把 control 类型与处理细节迁入新模块，旧文件只保留一个 select branch。
- `Drop` + `shutdown(self)` 在 app-server-client 中可能限制直接 move fields。处理方式是优先保持非 `Drop` move 形态；若编译器禁止，则集中引入单一 `state: Option<InProcessAppServerClientState>`，避免散布多个 `Option` 字段。
- 抽模块可能碰到 private type visibility。处理方式是让 `in_process_extra.rs` 作为同 crate module 使用 `pub(crate)` API，不扩大 public crate surface。
- 测试迁移可能暂时增加 diff。处理方式是先迁代码再迁测试，确保行为测试覆盖不减少。

## 验收标准

- `codex-rs/app-server/src/in_process.rs` 不包含 GUI / WebSocket / allowlist / Origin 语义。
- `in_process.rs` 中 extra connection 相关实现细节主要迁入 `in_process_extra.rs`。
- `codex-rs/app-server-client/src/lib.rs` 不再因为 GUI 接入改写所有 request / notify / resolve / reject callsite。
- `AppServerClientGuiExt` 的主要实现位于 `app-server-client/src/gui.rs`。
- `git diff --stat rust-v0.130.0 -- codex-rs/app-server/src/in_process.rs codex-rs/app-server-client/src/lib.rs` 相比当前分支显著收敛。
- scoped tests 通过：`cargo test -p codex-app-server-client`，以及 app-server in-process / GUI bridge 相关 targeted tests。
- 主连接外部行为与 GUI 连接注册 / 关闭互不影响。
