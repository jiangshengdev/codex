# Codex GUI Host Redesign

日期：2026-05-11

状态：设计草案。本文替代 `2026-05-10-codex-gui-host-design.md` 作为当前 GUI host 方案的规范来源。

## 背景

GUI 的长期定位是 Codex 的浏览器界面。它可以先服务本机浏览器，后续再扩展到局域网、手机浏览器、PC 浏览器和控制能力。`codex-gui-host` 这个命名保留：它就是负责承载 GUI 的 host。

当前分支已经完成 `codex-gui-host` crate 的第一阶段代码，包括本机 host shell、launch token、Host / Origin 校验、`/ws` 首帧认证、JSON-RPC allowlist、dev proxy 和 prod static 的基础结构。这部分仍然有意义。

需要重新设计的是 app-server bridge。原计划在 `codex-app-server` / `in_process.rs` 中增加 `open_extra_jsonrpc_connection`、`ExtraJsonRpcConnectionFactory` 等额外 JSON-RPC 连接 API。这个方向和 `rust-v0.130.0` 上游（具体 commit 未在本文 pin；读者可通过 git log 查找对应 tag）已有 `remote-control` 的实现发生了重复设计。

`remote-control` 已经证明 app-server 可以通过 transport lifecycle 接入虚拟连接：

```text
TransportEvent::ConnectionOpened
TransportEvent::IncomingMessage
TransportEvent::ConnectionClosed
QueuedOutgoingMessage writer
disconnect_sender cleanup
```

GUI bridge 应复用或对齐这个生命周期，而不是新增一套 parallel in-process JSON-RPC connection API。

## 目标

首版目标是验证 GUI host 可以把本机浏览器安全地接入 app-server projection pipeline。

首版完成时应支持：

- 在 TUI 中通过 `/gui` 请求 app-server session 启动或复用本机 `codex-gui-host`。
- `/gui` 显示本机 URL，不自动打开浏览器。
- 浏览器从 GUI host 同源加载页面资源，并连接同源 `/ws`。
- `/ws` 使用 launch token 做首帧 `gui/authenticate` 认证。
- 认证后的 WebSocket 通过 app-server bridge 接入现有 app-server JSON-RPC pipeline。
- 浏览器发送 `initialize` 和 `thread/projection/attach` 到 primary thread。
- 浏览器接收真实的 `thread/projection/event` notification。
- 前端只显示连接阶段、attach 状态和收到 event 的最小状态。

首版 projection 目标是 transport MVP，不是完整 projection viewer。

## 非目标

首版不实现：

- 局域网访问。
- 手机浏览器访问。
- 公网 relay。
- 直接使用上游闭源 remote-control 客户端。
- 复用 remote-control 的 enrollment、relay、ack/replay、segment wire protocol。
- 浏览器控制 Codex。
- 发送 user turn。
- approval、interrupt、exec、file write、MCP/tool 调用。
- 子代理切换。
- 多 thread projection。
- projection snapshot 还原。
- commit graph、timeline、diff UI。
- projection 数据写入 Redux/store。
- 完整 app-server v2 gateway。
- `/gui --open`、`/gui --current`、`/gui <threadId>`。
- 自动打开浏览器。
- Vite 自动启动、端口扫描或 dev/prod 自动 fallback。
- GUI host 独立 daemon 化。

这些能力可以作为后续方向，但不进入首版 projection transport MVP。

## 架构

新增并保留 crate：

```text
codex-rs/gui-host
  crate name: codex-gui-host
```

依赖方向保持：

```text
codex-tui        -> codex-app-server-client
codex-app-server -> codex-gui-host
codex-gui-host   -> does not depend on codex-app-server
```

`codex-gui-host` 定义 browser host shell 和最小 backend trait。`codex-app-server` 拥有 GUI host 生命周期，实现这个 backend，并把认证后的 GUI WebSocket 适配为 app-server transport connection。

运行结构：

```text
TUI
  ├─ handles /gui
  ├─ asks app-server session to lazy-start/reuse GuiHost
  ├─ passes primary_thread_id to app-server-client
  └─ prints URL in transcript

codex-gui-host
  ├─ binds 127.0.0.1:0
  ├─ serves/proxies GUI assets
  ├─ exposes same-origin /ws
  ├─ validates Host and Origin
  ├─ authenticates first frame with launch token
  ├─ filters browser-to-server JSON-RPC methods
  ├─ filters server-to-browser notifications
  └─ delegates authenticated traffic to a GuiBackend bridge

codex-app-server
  ├─ lazy-starts/reuses GuiHost inside the TUI's in-process app-server runtime
  ├─ implements GuiBackend
  ├─ registers each authenticated GUI WebSocket as an extra in-process connection
  ├─ owns request processing via the existing MessageProcessor
  ├─ owns thread/projection attach and detach
  ├─ owns projection notification fanout through outbound_connections
  └─ owns connection cleanup semantics

Browser GUI
  ├─ loads page from GuiHost
  ├─ reads launch token from URL fragment or sessionStorage
  ├─ authenticates on /ws
  ├─ sends initialize
  ├─ sends thread/projection/attach for primary thread
  └─ displays minimal transport/projection status
```

TUI 不作为数据转发层。TUI 不解析 projection event，不参与 browser data forwarding。

`codex-gui-host` 不处理 app-server 业务。它只负责 browser-safe HTTP/WebSocket shell、安全边界和 allowlist。业务语义必须来自 app-server 现有 pipeline。

## Crate 边界

`codex-gui-host` 拥有：

- `GuiHost`
- `GuiHostConfig`
- `GuiHostMode`
- `DevAssetProxyConfig`
- `ProdAssetConfig`
- `GuiHostHandle`
- `LaunchToken`
- launch URL formatting
- HTTP asset serving
- dev Vite proxy
- `/ws` upgrade
- Host / Origin validation
- `gui/authenticate` first-frame auth
- client method allowlist
- server notification allowlist
- WebSocket pump framework
- bridge trait definitions

`codex-gui-host` 不拥有：

- app-server request processors
- thread store
- projection subscription state
- projection fanout implementation
- app-server protocol schema
- TUI state
- remote-control enrollment / relay protocol
- npm packaging policy

`codex-app-server` owns:

- GUI host lifecycle within the TUI's in-process app-server session
- `GuiBackend` implementation
- registration of each authenticated GUI connection as an extra connection in `in_process.rs`
- projection subscription cleanup through existing close semantics

`codex-tui` owns:

- `/gui` slash command surface
- primary thread selection
- requesting a launch URL from `codex-app-server-client`
- transcript message containing the returned launch URL

## Bridge 形态

`codex-gui-host` 暴露 generic backend trait。具体 signature 可在实现计划中细化，但职责边界固定：

```rust
/// Backend that connects an authenticated GUI JSON-RPC stream to an application server.
pub trait GuiBackend: Send + Sync {
    fn connect(
        &self,
        connection: AuthenticatedGuiConnection,
    ) -> impl std::future::Future<Output = anyhow::Result<()>> + Send;
}
```

MVP 的唯一宿主是 **TUI 同进程**的 `codex-rs/app-server/src/in_process.rs` runtime（目标 §1 要求 TUI 通过 `/gui` 请求本机 app-server session 启动或复用 `codex-gui-host`，且「关 TUI 就关 GUI」）。`GuiBackend` 的 app-server 实现必须把认证后的 GUI WebSocket 接入 `in_process.rs` 的现有 `MessageProcessor` 和 `outbound_connections` HashMap，让 GUI 连接与 TUI 主连接平级地看到同一套 thread store 和 projection fanout。

为支持 N 条并发浏览器连接（PC + 手机 tab 同时访问）与 TUI 主连接共存，`in_process.rs` 做**纯加法**扩展：

- `ProcessorCommand` 新增四个 variant：`ExtraConnectionOpened { connection_id, writer, session, disconnect_sender }`、`ExtraRequest { connection_id, request }`、`ExtraNotification { connection_id, notification }`、`ExtraConnectionClosed { connection_id }`。TUI 主连接（`IN_PROCESS_CONNECTION_ID`）保留原有 `Request` / `Notification` 路径，零改动。
- `InProcessClientHandle` 新增中性 API `register_extra_connection(&self) -> ExtraConnectionHandle`。handle 暴露 `connection_id`、`incoming_tx: Sender<JSONRPCMessage>`、`outgoing_rx: Receiver<QueuedOutgoingMessage>`、`disconnect_token: CancellationToken`。`ExtraConnectionHandle::Drop` 自动发 `ExtraConnectionClosed`（`try_send` 幂等）。
- extra 连接使用独立 `HashMap<ConnectionId, Arc<ConnectionSessionState>>` 查表，与主连接共享同一个 `MessageProcessor`、同一个 `outbound_connections` HashMap 和 `route_outgoing_envelope` 派发。
- `in_process.rs` 本体**不认识** GUI / WebSocket / allowlist / Origin 概念；`register_extra_connection` 命名中性，API 不包含 GUI 字样。

GUI 专属逻辑全部在 fork-only（不回流 upstream）的文件中：

- `codex-rs/app-server/src/gui_host.rs`：`GuiHostManager` 持有 `Mutex<Option<GuiHostHandle>>`，负责 lazy-start / 复用 `GuiHost`，提供 `launch_url(primary_thread_id) -> GuiLaunchUrl`。`InProcessAppServerClient` 启动时构造并持有 `Arc<GuiHostManager>`；关闭时 drop 触发 host shutdown。
- `codex-rs/app-server/src/gui_transport.rs`：`GuiBackend` 的实现。对每条认证通过的 `AuthenticatedGuiConnection` 调一次 `register_extra_connection`，spawn 两条零状态桥接任务：入向把 `AuthenticatedGuiConnection.inbound_rx` 的 `JSONRPCMessage` 转发到 `handle.incoming_tx`；出向把 `handle.outgoing_rx` 的 `QueuedOutgoingMessage` 序列化后写回 `AuthenticatedGuiConnection.outbound_tx`。桥接 loop 不维护 session 状态——未初始化前的非 `initialize` 请求由 `MessageProcessor` 的既有逻辑返回标准 JSON-RPC error。
- `codex-rs/app-server-client/src/gui.rs`：extension trait `AppServerClientGuiExt::gui_launch_url`，以及 `GuiLaunchUrl` / `GuiLaunchError` 公开类型。`codex-app-server-client/src/lib.rs` 的 upstream 触达面限于 `pub mod gui;` + re-export + `InProcessClientStartArgs` / `InProcessAppServerClient` 加一个 `Arc<GuiHostManager>` 可选字段。

数据流（认证通过之后）：

```text
authenticated GUI websocket frame
  -> AuthenticatedGuiConnection.inbound_rx
  -> gui_transport inbound task
  -> ExtraConnectionHandle.incoming_tx
  -> ProcessorCommand::ExtraRequest / ExtraNotification
  -> MessageProcessor::process_client_request(connection_id, ...)

MessageProcessor / projection fanout outbound
  -> outbound_connections[connection_id].writer  (复用既有路径)
  -> ExtraConnectionHandle.outgoing_rx
  -> gui_transport outbound task
  -> AuthenticatedGuiConnection.outbound_tx
  -> GUI host server-side allowlist
  -> browser WebSocket text frame
```

关闭路径：

- 浏览器关闭或 `GuiHost::shutdown` 触发 → `AuthenticatedGuiConnection.inbound_rx` close 或 `disconnect_token` 取消。
- `gui_transport::connect` 退出 → `ExtraConnectionHandle` drop → `ExtraConnectionClosed` 自动发出 → `in_process.rs` 从 session HashMap / outbound_connections 移除该 entry，走既有 projection subscription cleanup。
- 关闭前让出向任务 drain 残留消息（writer drop 后 mpsc 天然 drain 到空，`gui_transport::connect` 用 `tokio::time::timeout(~1s, outbound_task)` 等 join）。
- 认证失败的 `/ws` 永远不调用 `register_extra_connection`，不分配 `ConnectionId`，不会在 `outbound_connections` 留痕。

**Bridge 生命周期不变量**：

- GUI 连接的注册（`register_extra_connection` 调用）当且仅当 `gui/authenticate` 成功后发生；认证失败不注册。
- 每次注册对应恰好一次 `ExtraConnectionClosed`，包括：browser 关闭/刷新、host shutdown、`GuiBackend::connect` 返回 `Err`、以及任何错误路径。由 `ExtraConnectionHandle::Drop` 保证。
- `ExtraConnectionClosed` 到达后，`in_process.rs` 不得再为同一 `connection_id` 派发 `ExtraRequest` / `ExtraNotification`；桥接任务在 drop handle 前停止读入方向，出方向 drain 后自然退出。
- 桥接任务必须监听 `disconnect_token` 的取消信号；收到取消时主动停止读浏览器帧、drain 出方向、退出 `connect`。

**与 remote-control 的关系**：语义上对齐，路径上不对齐。remote-control 在 `run_main_with_transport_options` 里走 `TransportEvent::{ConnectionOpened,IncomingMessage,ConnectionClosed}` 作为它的连接注入点——那是它宿主（独立 `codex-app-server` 进程的 run_main runtime）本来的连接入口。MVP GUI 的宿主是 `in_process.rs`，这个 runtime 的连接入口是 `ProcessorCommand` 命令总线，不是 `transport_event_tx`。GUI bridge 沿用 remote-control 的**思想**（认证先行、per-connection `ConnectionSessionState`、`ExtraConnectionHandle` 幂等 close、`disconnect_token` 取消传播），但**不复刻**它的 `TransportEvent` 路径。在 `in_process.rs` 里复刻 `run_main_with_transport_options` 的 connection map / outbound router / close cleanup 是被禁止的——既有的 HashMap 和 `route_outgoing_envelope` 已经是 per-connection 形态，直接复用即可。

**ConnectionOrigin::GuiHost**：该 variant 已在 `codex-rs/app-server-transport/src/transport/mod.rs` landed，但 MVP in-process 路径不使用 `TransportEvent`，因此也不使用这个 variant。variant 保留在代码中作为未来扩展预留（例如若未来允许独立 `codex-app-server` 进程也挂 GUI host），不在 MVP 验收范围内。

首版不把 `remote-control` 的 envelope protocol 直接暴露给浏览器。GUI browser 仍发送普通 app-server JSON-RPC，`gui/authenticate` 是 GUI host local handshake，不进入 app-server processor。

## `/gui` 入口

`/gui` 首版始终打开主 thread：

```text
threadId = primary_thread_id
```

它不跟随当前 TUI 显示的子代理、side conversation 或临时视图。未来可以新增 `/gui --current` 或 `/gui <threadId>`，但不属于首版。

第一次执行 `/gui` 时，TUI 通过 `codex-app-server-client` 请求当前 app-server session 懒启动 `GuiHost`。同一 app-server session 内后续 `/gui` 复用同一个 host、同一个随机端口和同一个 launch token。

TUI 显示的 URL 形如：

```text
http://127.0.0.1:<port>/?threadId=<primary-thread-id>#token=<launch-token>
```

`threadId` 放在 query 中，因为它不是认证 secret。写入 URL 前必须做 URL encoding。`launch-token` 放在 fragment 中，避免随着普通 HTTP 请求发送到 server 或进入常规 HTTP access log。

如果 `primary_thread_id` 尚不可用，`/gui` 直接在 TUI 中提示当前 session 尚未准备好打开 GUI，不向 app-server 请求启动空 host。

首版 `/gui` 不自动打开浏览器。TUI transcript 显示完整 URL，并提示用户在本机浏览器中打开。

## WebSocket 认证

浏览器连接：

```text
ws://127.0.0.1:<port>/ws
```

认证流程：

1. App-server session 为当前 `GuiHost` 生成或复用 launch token。
2. TUI 显示 app-server 返回的、带 `#token=...` 的 GUI URL。
3. 前端读取 `location.hash`。
4. 前端把 token 写入 `sessionStorage`。
5. 前端调用 `history.replaceState` 清除 URL fragment。
6. 前端建立同源 `/ws`。
7. `/ws` 建立后，前端发送第一条认证消息。
8. GUI host 验证 token 成功后，才把后续 traffic 交给 bridge。

第一条 WebSocket text frame 必须是 JSON-RPC 2.0 request：

```json
{"jsonrpc":"2.0","id":1,"method":"gui/authenticate","params":{"token":"<launch-token>"}}
```

认证成功返回：

```json
{"jsonrpc":"2.0","id":1,"result":{"authenticated":true}}
```

`gui/authenticate` 的 `id` 属于 GUI host 本地 handshake，不进入 app-server processor。因此认证 request 的 id 空间与 app-server id 空间不重叠：即使浏览器随后对 `initialize` 复用 `id:1`，两个 id 空间也不会冲突。合规测试必须验证此不重叠性。

认证失败、首帧不是 `gui/authenticate`、payload 格式错误或 token 缺失时，GUI host 以 WebSocket close code `1008` 关闭连接。失败路径不得创建 app-server connection。

`/ws` upgrade 成功后，GUI host 必须对第一条 text frame 设置接收超时。首版建议 5 秒；超时按认证失败处理。

launch token 使用系统 CSPRNG 生成，至少 128 位熵，使用 base64url 或等价 URL-safe 编码。token 对 server 是 opaque 字符串，只做直接匹配。

launch token 在同一 app-server session 内可复用，支持刷新页面、多次 `/gui` 和多个本机 browser tab。token 随 `GuiHost` / app-server session 退出失效。首版不要求 token 单次使用。

## 本机安全边界

首版安全模型：

```text
loopback bind + short-lived launch token + strict Host/Origin + JSON-RPC allowlist
```

GUI host 只绑定：

```text
127.0.0.1:0
```

所有 HTTP 请求和 WebSocket upgrade 都必须校验 `Host`，只接受严格等于：

```text
127.0.0.1:<port>
```

默认不接受 `localhost:<port>`、其他 loopback 名称、缺失 Host 或任意可解析到 loopback 的 DNS 名称。

WebSocket `Origin` 必须严格等于：

```text
http://127.0.0.1:<port>
```

缺失或不匹配的 Origin 默认拒绝。

GUI host 控制的页面和静态资源响应应发送 `X-Frame-Options: DENY`，并通过 CSP `frame-ancestors 'none'` 禁止被其它页面 iframe。dev 模式下 Vite 反向代理响应不要求追加这些 header；dev 环境不需要 clickjack 防护。

## JSON-RPC Allowlist

Allowlist 按方向分别定义：

**Browser → server（入方向）：**

- 只允许 method 在以下列表中的 request：
  ```text
  initialize
  thread/projection/attach
  thread/projection/detach
  ```
- browser-to-server notification 首版全部拒绝，不进入 app-server processor。未来如需发送 notification，必须在 allowlist 中显式新增 method 和测试。
- browser-to-server response 和 error 不存在（browser 是 client，不发送 response/error）；如收到此类帧，直接丢弃。

**Server → browser（出方向）：**

- 只允许 method 为 `thread/projection/event` 的 notification。其它 server notification 不发送到 browser。
- 对已允许入方向 request 的 response 和 error 正常放行。
- `gui/authenticate` 的 response 由 GUI host 本地生成，不经过 allowlist 机制；参见 §WebSocket 认证。

GUI host 不是完整 app-server v2 gateway。任何不在 allowlist 中的 browser-to-server request 都不得进入 app-server processor。

## Projection MVP

首版 projection 只验证传输链路，不做完整 projection viewer。

浏览器启动后按顺序执行：

```text
gui/authenticate
initialize
thread/projection/attach(primary_thread_id)
wait for thread/projection/event
```

页面只显示最小状态：

```text
connecting
authenticated
initialized
attached
received event count
last event type
error
```

首版不做：

- projection snapshot 还原。
- commit chain 展示。
- timeline UI。
- diff UI。
- 子代理树。
- 多 thread projection。
- Redux/store 持久化。
- 复杂事件解释。

验收以 WebSocket frames 和最小页面状态为准：

```text
gui/authenticate response is visible
initialize response is visible
thread/projection/attach response is visible
at least one thread/projection/event is visible
page reaches attached / received event state
```

## 静态资源模式

GUI host 支持 dev 和 prod 两种资源来源。模式由 build profile 默认决定：

```text
debug build   -> dev
release build -> prod
```

可以用 `CODEX_GUI_HOST_MODE=dev|prod` 覆盖 build profile 默认值。该覆盖不做自动 fallback；非法值直接报错。

### Dev

dev 模式只使用 Vite dev server。默认地址：

```text
http://127.0.0.1:5173
```

允许 dev-only 环境变量 `CODEX_GUI_VITE_URL` 覆盖 Vite 地址。GUI host 不扫描常见端口，不自动发现 Vite，不自动运行 npm/pnpm。

浏览器仍然打开 GUI host URL，而不是 Vite URL。GUI host 反向代理 Vite 页面资源，使页面和 projection `/ws` 保持同源。

Vite HMR 首版不经 GUI host `/ws`，避免与 projection WebSocket 混用。dev 前端配置应把 HMR WebSocket 显式指向 Vite dev server。

### Prod

prod 模式只按 npm 包目录结构相对路径读取 GUI 构建产物。npm package root 由 Node CLI wrapper 启动 Rust binary 时通过内部环境变量传递：

```text
CODEX_GUI_PACKAGE_ROOT
```

prod 下 GUI dist 固定为：

```text
$CODEX_GUI_PACKAGE_ROOT/dist/
```

prod 模式不依赖 cwd，不优先依赖 executable path，也不 fallback 到 Vite。`CODEX_GUI_PACKAGE_ROOT` 缺失或 `dist/` 不存在时，`/gui` 报错并提示当前安装缺少 GUI package root 或 GUI 构建产物。

prod 静态资源缓存策略（HTML entry no-cache、带 fingerprint 的 JS/CSS immutable long-cache 等）推迟到 Task 05 packaging 阶段确定，不属于首版 transport MVP 的验收范围。

## 生命周期

GUI host 生命周期绑定 TUI 同进程的 app-server session：

- TUI 启动时不启动 GUI host。
- 第一次 `/gui` 通过 `codex-app-server-client` 的 `AppServerClientGuiExt::gui_launch_url` 请求 `GuiHostManager` 懒启动。
- 同一 TUI 进程（= 同一 in-process app-server session）复用同一个 GUI host 和同一个 launch token。
- 每个 TUI 进程拥有独立 host、随机端口和 launch token。
- 多个本机 browser tab（以及未来 LAN 场景下的 PC + 手机浏览器）可以同时连接同一个 host，各自走独立 `register_extra_connection` 路径。
- TUI 退出时 `InProcessAppServerClient` drop，`GuiHostManager` drop 触发 `GuiHostHandle::shutdown`，所有浏览器连接以 WebSocket close 关闭，token 失效。
- 浏览器连接关闭时，`ExtraConnectionHandle::Drop` 发 `ExtraConnectionClosed`，`in_process.rs` 从 session HashMap / `outbound_connections` 移除 entry，走既有 projection subscription cleanup。

## 错误处理

首版需要覆盖：

- `primary_thread_id` 不存在：TUI 提示当前 session 尚未准备好打开 GUI。
- dev Vite 不可用：TUI 或页面请求返回开发者可执行提示，包含 Vite 地址。
- prod `CODEX_GUI_PACKAGE_ROOT` 缺失：TUI 提示当前安装缺少 GUI package root。
- prod `dist/` 缺失或不可读：TUI 提示 GUI 构建产物缺失或不可读。
- Host/Origin 校验失败：GUI host 拒绝请求。
- launch token 缺失或错误：GUI host 关闭 `/ws`，不创建 app-server connection。
- JSON-RPC method 不在 allowlist：GUI host 拒绝，且不进入 app-server processor。
- app-server bridge 失败：browser 收到 JSON-RPC error 或连接关闭，页面显示 error 状态。

## 测试策略

测试靠近所属 crate/module，避免把 GUI 生命周期测试集中放进 TUI 大型测试文件。

### `codex-gui-host`

覆盖：

- loopback ephemeral bind。
- launch URL 使用 query `threadId` 和 fragment token。
- CSPRNG token 生成格式和最低熵约束。
- Host/Origin strict validation。
- `gui/authenticate` 成功和失败路径。
- 认证失败不创建 backend connection。
- client request allowlist。
- server notification allowlist。
- dev Vite proxy。
- prod `$CODEX_GUI_PACKAGE_ROOT/dist` static serving。
- shutdown 后 server task 结束。

### `codex-app-server`

覆盖 GUI bridge 到 in-process app-server runtime：

- `GuiHostManager` 懒启动，同一 session 复用同一个 host；返回的 launch URL 指向本机 GUI host。
- `register_extra_connection` 为每条认证通过的 GUI WebSocket 分配独立 `ConnectionId` 和独立 `ConnectionSessionState`。
- `ProcessorCommand::ExtraRequest` 派发到 `MessageProcessor::process_client_request(connection_id, ...)`，`initialize` 返回真实 app-server response。
- `thread/projection/attach` 返回真实 app-server response；thread 产生 projection update 后，browser 通过 `outbound_connections[connection_id]` 收到 `thread/projection/event`。
- 非 allowlist request 被 `codex-gui-host` 在 GUI host 层拒绝，不进入 `register_extra_connection`、不产生 `ExtraRequest`。
- browser close / refresh / host shutdown / `GuiBackend::connect` 返回 `Err` 都触发 `ExtraConnectionHandle::Drop` → 唯一一次 `ExtraConnectionClosed` → projection subscription cleanup。
- TUI 主连接（`IN_PROCESS_CONNECTION_ID`）不受 GUI 连接注册 / 关闭影响。

### `codex-tui`

只覆盖薄入口：

- `/gui` slash command 可见并 dispatch。
- `AppEvent::OpenGui` 处理后向 app-server-client 请求 launch URL。
- `primary_thread_id` 不存在时显示提示。
- 有 primary thread 时 transcript 显示 launch URL。

TUI 不测试 WebSocket 细节，不依赖 `tokio-tungstenite`。

### `codex-gui`

覆盖：

- launch params 读取。
- token 写入 `sessionStorage`。
- fragment 清理。
- refresh 后从 `sessionStorage` 恢复 token。
- WebSocket message order：`gui/authenticate` -> `initialize` -> `thread/projection/attach`。
- 页面状态更新到 `attached` / `received event`。

## 计划调整

当前 `01-gui-host-crate` tag 的代码成果保留，不回退。

计划文件调整：

- `00-roadmap.md`：更新目标描述，明确 GUI host 首版是 TUI 同进程 in-process app-server runtime 的本机 browser projection transport MVP；Split Map 新增 `06-in-process-gui-launch.md`。
- `01-gui-host-crate.md`：保持已完成状态；该任务提供有效的 browser host shell。
- `02-app-server-bridge.md`：重写为「`register_extra_connection` + `GuiHostManager` + `gui_transport.rs` 实现 `GuiBackend`」的任务分解。删除「作为 `TransportEvent` producer」的方向。`in_process.rs` 多连接实现已通过 refactor 提交回退（见 `git log --grep "remove obsolete in-process bridge"`），02 计划以此为起点实现新的 in-process extra-connection 接入点。
- `03-tui-entry.md`：保留 `/gui` primary thread URL 入口方向；TUI 通过 `AppServerClientGuiExt::gui_launch_url` 拿 URL。
- `04-frontend-handshake.md`：保留 handshake，但明确前端只显示最小 transport/projection 状态。
- `05-packaging-verification.md`：基本保留；端到端验收覆盖 in-process 默认 TUI 路径下 `/gui` 打通 projection event。
- `06-in-process-gui-launch.md`：新建，承接 `in_process.rs` 的 `ProcessorCommand::Extra*` 扩展、`register_extra_connection` API、`GuiHostManager` wiring、`codex-app-server-client` 的 `gui.rs` extension trait。

## 未来方向

后续可以在同一 GUI host 架构上扩展：

- 局域网访问（放宽 `GuiHost` 的 bind / Host / Origin 策略为配置化，保留 loopback 为默认值）。
- 手机浏览器访问（需要 token 分发机制，例如 QR 或短码 pair）。
- 多 thread / 子代理切换。
- 浏览器控制能力（需要单独设计控制权、权限边界和多客户端语义）。
- 若未来允许独立 `codex-app-server` 进程也挂 GUI host，可在其 `run_main_with_transport_options` 中添加基于 `TransportEvent::ConnectionOpened { origin: ConnectionOrigin::GuiHost }` 的第二条 `GuiBackend` 实现，与 in-process 实现共用 `codex-gui-host` 的 HTTP/WS shell。两条实现共存不相互依赖。

这些方向不属于首版 projection transport MVP。新增控制能力前必须单独设计控制权、权限边界和多客户端语义。

## 验收标准

首版完成时必须满足：

- `/gui` 在 TUI 中显示本机 URL。
- 浏览器打开 URL 后页面连接同源 `/ws`。
- URL fragment token 被清理，刷新后同 tab 仍可通过 `sessionStorage` 连接。
- 无效 token 或首帧不是 `gui/authenticate` 时，连接以 `1008` 关闭，且没有调用 `register_extra_connection`，没有在 `outbound_connections` 留痕。
- WebSocket frames 中可见：
  - `gui/authenticate` response
  - `initialize` response
  - `thread/projection/attach` response
  - 至少一个 `thread/projection/event` notification
- 页面显示至少 `attached`，收到 event 后显示 `received event` 或等价状态。
- 非 allowlist browser-to-server request 不进入 `register_extra_connection`，不产生 `ExtraRequest`。
- 非 allowlist server-to-browser notification 不发送到 browser。
- browser close / refresh 触发 `ExtraConnectionHandle::Drop` → 唯一一次 `ExtraConnectionClosed` → projection subscription cleanup。
- TUI 主连接（`IN_PROCESS_CONNECTION_ID`）的行为和 session state 不受 GUI 连接注册 / 关闭影响。
- `codex-tui` 不直接依赖 `codex-app-server` 也不直接依赖 `codex-gui-host`；GUI launch URL 只经 `codex-app-server-client::AppServerClientGuiExt::gui_launch_url`。
- GUI host 生命周期由 `GuiHostManager` 管理，TUI 不直接持有 `GuiHost` 或 `GuiHostHandle`。
- GUI host 主体代码位于 `codex-gui-host` crate。
- `in_process.rs` 的改动限于纯加法：新增 `register_extra_connection` API、`ProcessorCommand::Extra*` 四个 variant、extra session HashMap；TUI 主连接原路径零改动。不重复实现 `run_main_with_transport_options` 的 connection map、outbound router 或 close cleanup。
