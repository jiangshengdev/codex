# Codex GUI Host 实施计划

## 1. 范围与非范围

本计划只把 `docs/superpowers/specs/2026-05-10-codex-gui-host-design.md` 中首版 `GuiHost` 边界拆成可提交的实现步骤，不重复定义或扩展该设计文档的产品、协议、安全和发布边界。

## 2. 前置确认

- 读取 `docs/superpowers/specs/2026-05-10-codex-gui-host-design.md`，后续所有设计章节引用使用该文档中的中文标题。
- 读取 `codex-rs/app-server/src/lib.rs`：transport 入口是 `run_main_with_transport_options`，它根据 `AppServerTransport::{Stdio, UnixSocket, WebSocket, Off}` 启动 acceptor；WebSocket acceptor 入口是 `start_websocket_acceptor`；主事件循环处理 `TransportEvent::{ConnectionOpened, ConnectionClosed, IncomingMessage}`；JSON-RPC request 进入 `MessageProcessor::process_request`，response/error/notification 分别进入 `process_response`、`process_error`、`process_notification`。
- 读取 `codex-rs/app-server/src/message_processor.rs`：JSON-RPC request 反序列化为 `ClientRequest` 后由 `MessageProcessor::handle_client_request` 处理，初始化后的 method dispatch 在 `MessageProcessor::dispatch_initialized_client_request` 和 `MessageProcessor::handle_initialized_client_request`。
- 读取 `codex-rs/app-server/src/transport.rs` 和 `codex-rs/app-server-transport/src/transport/mod.rs`：app-server crate 当前 re-export `TransportEvent`、`ConnectionOrigin`、`OutgoingMessage`、`QueuedOutgoingMessage`，`ConnectionState::new` 持有 `ConnectionSessionState`；`codex-app-server-transport` 当前 `ConnectionOrigin` 没有 `GuiHost` variant。
- 读取 `codex-rs/app-server-transport/src/transport/websocket.rs`：现有 remote WebSocket `start_websocket_acceptor` 使用 axum，`reject_requests_with_origin_header` 会拒绝任何 `Origin` header，`run_websocket_connection` 创建 `TransportEvent::ConnectionOpened` 并转发 text frame。
- 读取 `codex-gui/vite.config.ts`：当前未显式设置 `server.port`、`server.proxy` 或 `server.hmr`；Vite dev server 因此使用默认 `5173`，设计要求的 HMR 直连 Vite 仍需在前端配置里明确补充。
- 读取 `codex-cli/bin/codex.js`：Node CLI wrapper 通过 `vendorRoot`、`archRoot` 和 `binaryPath` 定位 Rust binary；`getUpdatedPath` 更新 `PATH`；`const env = { ...process.env, PATH: updatedPath }` 后设置 `CODEX_MANAGED_BY_NPM` 或 `CODEX_MANAGED_BY_BUN`，再把 `env` 传给 `spawn(binaryPath, process.argv.slice(2), { stdio: "inherit", env })`。
- 读取 `codex-rs/app-server/tests/suite/v2/connection_handling_websocket.rs`：可复用 `spawn_websocket_server_with_args`、`connect_websocket_with_bearer`、`websocket_request`、`read_response_for_id` 等模式，但 `GuiHost` 需要新增自己的启动 helper，因为它不是 `--listen ws://...` remote WebSocket。
- 读取 `codex-rs/app-server/tests/suite/v2/thread_projection.rs`：可复用 projection 端到端思路，包括 `ThreadProjectionAttachParams`、`ThreadProjectionAttachResponse`、`ThreadProjectionEventNotification`、`read_stream_until_notification_message("thread/projection/event")` 的断言方式。
- 读取 `codex-rs/tui/src/slash_command.rs`、`codex-rs/tui/src/chatwidget/slash_dispatch.rs`、`codex-rs/tui/src/app/thread_routing.rs`、`codex-rs/tui/src/app/app_server_events.rs`：`SlashCommand` 是 slash command 枚举；bare command 分发在 `ChatWidget::dispatch_command`；主 thread 由 `App::enqueue_primary_thread_session` 写入 `primary_thread_id`；当前 displayed thread 由 `active_thread_id` 和 `ChatWidget::thread_id()` 表示。
- 读取 `codex-gui/package.json`、`codex-gui/src/main.tsx`、`codex-gui/src/App.tsx`、`codex-gui/src/features/projection/projectionSlice.ts`、`codex-gui/e2e/app.spec.ts`：前端当前已有 Vite/React/Vitest/Playwright 工程和 projection reducer，但没有 WebSocket 客户端或 `/ws` 连接验证代码。

## 3. 分阶段实施步骤

### Phase 1: GuiHost skeleton

**目标**：在 `codex-app-server` 内新增 `GuiHost` 基础 HTTP 服务，能绑定 `127.0.0.1:0`、暴露基本页面/健康响应，并用单元测试锁定 loopback 随机端口行为。

**要改/新增的文件与符号**：

- 新增 `codex-rs/app-server/src/gui_host.rs`：`GuiHost`、`GuiHostConfig`、`GuiHostMode`、`GuiHostHandle`、`GuiHostError`、`GuiHost::start`、`GuiHostHandle::base_url`、`GuiHostHandle::shutdown`。
- 修改 `codex-rs/app-server/src/lib.rs`：新增 `mod gui_host;`，并以 `pub(crate)` 或 `#[doc(hidden)]` 暴露后续 TUI 需要的最小入口，具体名称建议为 `GuiHost` 和 `GuiHostConfig`。
- 新增 `codex-rs/app-server/src/gui_host/tests.rs` 或 `#[cfg(test)] mod tests`：`binds_loopback_ephemeral_port`、`serves_basic_http_response`。

**对应设计文档的哪一节**：`架构`、`实现边界`。

**可观测验收标准**：

- `cd codex-rs && cargo test -p codex-app-server gui_host::tests::binds_loopback_ephemeral_port -- --nocapture` 通过，并在断言中确认 `handle.local_addr().ip()` 等于 `127.0.0.1` 且端口不为 `0`。
- `cd codex-rs && cargo test -p codex-app-server gui_host::tests::serves_basic_http_response -- --nocapture` 通过，并用 `reqwest` 对 `http://127.0.0.1:<port>/` 断言 HTTP 状态码和响应体。
- 手动 smoke test 可执行：启动测试暴露的 helper 或临时 example 后运行 `curl -v http://127.0.0.1:<port>/`，输出必须包含 `HTTP/1.1 200 OK`。

**前置阶段依赖**：无。

### Phase 2: launch token generation + gui/authenticate pre-protocol

**目标**：为 `GuiHost /ws` 增加 launch token 生成、首帧 `gui/authenticate` 前置协议和认证失败关闭路径，且认证失败不创建 app-server connection。

**要改/新增的文件与符号**：

- 修改 `codex-rs/app-server/src/gui_host.rs`：新增 `LaunchToken`、`LaunchToken::generate`、`GuiHostHandle::launch_url_for_thread`、`GuiHost::ws_handler`、`GuiHost::authenticate_first_frame`、`GuiAuthenticateParams`、`GuiAuthenticateResult`。
- 修改 `codex-rs/app-server/Cargo.toml`：若现有依赖不足，添加生成 token 所需依赖；优先使用 workspace 已有 `uuid`/`base64`/系统随机能力，避免引入不必要依赖。
- 新增 `codex-rs/app-server/src/gui_host/auth_tests.rs` 或同模块测试：`generates_launch_url_with_fragment_token`、`accepts_valid_authenticate_first_frame`、`rejects_missing_token`、`rejects_wrong_token`、`rejects_business_request_before_authentication`。

**对应设计文档的哪一节**：`/gui 入口`、`WebSocket 认证`。

**可观测验收标准**：

- `cd codex-rs && cargo test -p codex-app-server gui_host::auth_tests::generates_launch_url_with_fragment_token -- --nocapture` 通过，断言 URL 形如 `http://127.0.0.1:<port>/?threadId=<id>#token=<token>`，且 token 不出现在 query。
- `cd codex-rs && cargo test -p codex-app-server gui_host::auth_tests::accepts_valid_authenticate_first_frame -- --nocapture` 通过，测试通过 `tokio_tungstenite` 发送 `{"jsonrpc":"2.0","id":1,"method":"gui/authenticate","params":{"token":"..."}}` 并收到同 id 的 `{"authenticated":true}`。
- `cd codex-rs && cargo test -p codex-app-server gui_host::auth_tests::rejects_missing_token gui_host::auth_tests::rejects_wrong_token gui_host::auth_tests::rejects_business_request_before_authentication -- --nocapture` 通过，失败路径断言 WebSocket close code 为 `1008` 或收到设计允许的 JSON-RPC error 后关闭。

**前置阶段依赖**：Phase 1。

### Phase 3: Host/Origin validation + JSON-RPC method whitelist + server-to-browser whitelist

**目标**：在 `GuiHost` transport 边界实现严格 `Host`/`Origin` 校验、browser-to-server method 白名单，以及 server-to-browser response/error 透传和 notification 限制。

**要改/新增的文件与符号**：

- 修改 `codex-rs/app-server/src/gui_host.rs`：新增 `GuiHost::validate_host_header`、`GuiHost::validate_origin_header`、`GuiHost::is_allowed_client_request_method`、`GuiHost::is_allowed_server_notification_method`、`GuiHost::forward_authenticated_message`、`GuiHost::filter_outgoing_message`。
- 修改 `codex-rs/app-server/src/transport.rs`：如需区分来源，新增或包装 `ConnectionOrigin::GuiHost` 的使用点；若不修改 `codex-app-server-transport`，则在 `GuiHost` 内部维护来源并只向主循环发送 `TransportEvent`。
- 修改 `codex-rs/app-server/src/lib.rs`：抽取现有 `TransportEvent` 处理为可复用函数，建议新增 `AppServerConnectionRouter` 或私有 helper，使 `GuiHost` 认证后能复用 `MessageProcessor::process_request`、`process_response`、`process_error`、`process_notification` 和 `MessageProcessor::connection_closed`。
- 新增 `codex-rs/app-server/src/gui_host/security_tests.rs`：`rejects_missing_host`、`rejects_localhost_host`、`rejects_wrong_origin`、`allows_exact_origin`、`rejects_non_whitelisted_request_before_processor`、`passes_response_and_error_for_allowed_request`、`filters_non_projection_notifications`。

**对应设计文档的哪一节**：`本机安全边界`、`JSON-RPC 白名单`。

**可观测验收标准**：

- `cd codex-rs && cargo test -p codex-app-server gui_host::security_tests::rejects_missing_host gui_host::security_tests::rejects_localhost_host gui_host::security_tests::rejects_wrong_origin gui_host::security_tests::allows_exact_origin -- --nocapture` 通过，断言只有 `Host: 127.0.0.1:<port>` 和 `Origin: http://127.0.0.1:<port>` 能升级 `/ws`。
- `cd codex-rs && cargo test -p codex-app-server gui_host::security_tests::rejects_non_whitelisted_request_before_processor -- --nocapture` 通过，测试发送 `thread/list` 后断言未触发 app-server processor 的可观测请求计数或 mock processor 调用。
- `cd codex-rs && cargo test -p codex-app-server gui_host::security_tests::passes_response_and_error_for_allowed_request gui_host::security_tests::filters_non_projection_notifications -- --nocapture` 通过，断言 `initialize`/`thread/projection/attach` 的 response/error 能回到浏览器，而 server notification 只有 `thread/projection/event` 被写入浏览器 WebSocket。

**前置阶段依赖**：Phase 2。

### Phase 4: prod static asset serving

**目标**：在 prod 模式中只从 `$CODEX_GUI_PACKAGE_ROOT/dist/` 解析和服务静态资源，并在缺失环境变量或 `dist/` 不存在时返回可执行的错误信息。

**要改/新增的文件与符号**：

- 修改 `codex-rs/app-server/src/gui_host.rs`：新增 `StaticAssetSource`、`GuiHostMode::Prod`、`GuiHost::resolve_prod_dist_dir`、`GuiHost::serve_static_asset`、`GuiHostError::MissingGuiPackageRoot`、`GuiHostError::MissingGuiDist`。
- 修改 `codex-cli/bin/codex.js`：新增 `const guiPackageRoot = ...` 路径解析逻辑，并在 `env` 中设置 `CODEX_GUI_PACKAGE_ROOT`；不得改变已有 `CODEX_MANAGED_BY_NPM`/`CODEX_MANAGED_BY_BUN` 语义。
- 修改 `codex-cli/scripts/build_npm_package.py`：若发布包需要携带 GUI package root，新增对应文件复制规则；如果发布结构尚未确定，只添加 wrapper 能力并在风险项保留打包未决事项。
- 新增 `codex-rs/app-server/src/gui_host/static_tests.rs`：`prod_requires_code_gui_package_root`、`prod_requires_dist_directory`、`prod_serves_index_html`、`prod_serves_asset_with_content_type`。

**对应设计文档的哪一节**：`静态资源模式`、`错误处理`。

**可观测验收标准**：

- `cd codex-rs && cargo test -p codex-app-server gui_host::static_tests::prod_requires_code_gui_package_root gui_host::static_tests::prod_requires_dist_directory -- --nocapture` 通过，断言错误文本分别包含 `CODEX_GUI_PACKAGE_ROOT` 和 `dist/`。
- `cd codex-rs && cargo test -p codex-app-server gui_host::static_tests::prod_serves_index_html gui_host::static_tests::prod_serves_asset_with_content_type -- --nocapture` 通过，测试用临时 `$CODEX_GUI_PACKAGE_ROOT/dist/index.html` 和 `assets/app.js` 验证 `/` 与 `/assets/app.js`。
- `node --check codex-cli/bin/codex.js` 通过。
- 可执行 smoke test：`CODEX_GUI_PACKAGE_ROOT=$PWD/codex-gui curl -v http://127.0.0.1:<gui-host-port>/` 返回 `HTTP/1.1 200 OK` 且响应体来自 `codex-gui/dist/index.html`。

**前置阶段依赖**：Phase 1。

### Phase 5: dev reverse proxy for Vite page assets

**目标**：在 debug/dev 模式中让浏览器仍打开 `GuiHost` URL，并由 `GuiHost` 反向代理 Vite 页面资源，同时前端 HMR 直连 Vite 而不占用 `GuiHost /ws`。

**要改/新增的文件与符号**：

- 修改 `codex-rs/app-server/src/gui_host.rs`：新增 `GuiHostMode::Dev`、`DevAssetProxyConfig`、`GuiHost::vite_origin_from_env`、`GuiHost::proxy_vite_asset`、dev-only Vite 地址环境变量读取函数。
- 修改 `codex-gui/vite.config.ts`：新增 `server: { host: "127.0.0.1", port: 5173, strictPort: true, hmr: ... }`，明确不配置 `/ws` proxy；HMR host/port 使用与 `GuiHost` dev proxy 一致的 Vite 地址配置。
- 新增 `codex-rs/app-server/src/gui_host/dev_proxy_tests.rs`：`dev_uses_default_vite_origin`、`dev_uses_env_vite_origin`、`dev_proxy_returns_actionable_error_when_vite_unavailable`、`dev_proxy_forwards_index_html`。

**对应设计文档的哪一节**：`静态资源模式`、`首版前端行为`、`错误处理`。

**可观测验收标准**：

- `cd codex-rs && cargo test -p codex-app-server gui_host::dev_proxy_tests::dev_uses_default_vite_origin gui_host::dev_proxy_tests::dev_uses_env_vite_origin -- --nocapture` 通过，默认地址断言为 `http://127.0.0.1:5173`。
- `cd codex-rs && cargo test -p codex-app-server gui_host::dev_proxy_tests::dev_proxy_returns_actionable_error_when_vite_unavailable gui_host::dev_proxy_tests::dev_proxy_forwards_index_html -- --nocapture` 通过，错误文本包含启动 Vite 的可执行提示和使用中的 Vite 地址。
- `pnpm -C codex-gui run type-check` 通过。
- 手动 smoke test：一个终端运行 `pnpm -C codex-gui dev --host 127.0.0.1 --port 5173 --strictPort`，另一个终端运行 `curl -v http://127.0.0.1:<gui-host-port>/`，输出必须包含 `HTTP/1.1 200 OK` 且 HTML 来自 Vite。
- 浏览器开发者工具 Network 中 HMR WebSocket URL 必须是 `ws://127.0.0.1:5173/...`，projection WebSocket URL 必须是 `ws://127.0.0.1:<gui-host-port>/ws`。

**前置阶段依赖**：Phase 1、Phase 4 的 resource mode 抽象。

### Phase 6: TUI /gui command, primary_thread_id read, platform opener + fallback, lazy start + session lifecycle

**目标**：在 TUI 中新增 `/gui` 命令，读取 `primary_thread_id`，懒启动并复用当前 TUI session 的 `GuiHost`，成功时调用平台 opener，失败时在 TUI 中展示可复制 URL 或错误。

**要改/新增的文件与符号**：

- 修改 `codex-rs/tui/src/slash_command.rs`：新增 `SlashCommand::Gui`、`SlashCommand::description`、`available_during_task`、`available_in_side_conversation`、`is_visible` 的匹配分支。
- 修改 `codex-rs/tui/src/chatwidget/slash_dispatch.rs`：在 `ChatWidget::dispatch_command` 中处理 `SlashCommand::Gui`，发送新的 app event。
- 修改 `codex-rs/tui/src/app_event.rs`：新增 `AppEvent::OpenGui`。
- 修改 `codex-rs/tui/src/app.rs` 或新增 `codex-rs/tui/src/app/gui.rs`：新增 `App::open_gui`、`App::ensure_gui_host`、`App::shutdown_gui_host`，字段建议为 `gui_host: Option<GuiHostHandle>`。
- 新增 `codex-rs/tui/src/gui_opener.rs`：`GuiOpener` trait、`PlatformGuiOpener`、`OpenGuiError`，平台命令为 macOS `open`、Linux `xdg-open`、Windows shell opener。
- 修改 `codex-rs/tui/src/app/thread_routing.rs`：只读取现有 `primary_thread_id`，不使用 `active_thread_id` 或 `ChatWidget::thread_id()` 作为首版 `/gui` 目标。
- 新增或修改 `codex-rs/tui/src/app/tests.rs`：`gui_command_uses_primary_thread_id_not_active_thread_id`、`gui_command_requires_primary_thread_id`、`gui_command_lazy_starts_and_reuses_host`、`gui_command_prints_url_when_opener_fails`。
- 新增或修改 `codex-rs/tui/src/chatwidget/tests/slash_commands.rs`：`gui_slash_command_is_registered`。

**对应设计文档的哪一节**：`/gui 入口`、`生命周期`、`错误处理`。

**可观测验收标准**：

- `cd codex-rs && cargo test -p codex-tui gui_slash_command_is_registered -- --nocapture` 通过，断言 `SlashCommand::from_str("gui") == Ok(SlashCommand::Gui)`。
- `cd codex-rs && cargo test -p codex-tui gui_command_uses_primary_thread_id_not_active_thread_id gui_command_requires_primary_thread_id gui_command_lazy_starts_and_reuses_host gui_command_prints_url_when_opener_fails -- --nocapture` 通过，断言 URL query 的 `threadId` 等于 `primary_thread_id`，并且连续两次 `/gui` 使用同一 host 端口。
- `cd codex-rs && cargo test -p codex-tui` 通过，并检查相关 `insta` snapshot 中 `/gui` 错误或 fallback URL 文案已被接受。
- 手动 smoke test：在 TUI session ready 后输入 `/gui`，若 opener 可用则浏览器打开 `http://127.0.0.1:<port>/?threadId=<primary>#token=...`；若将 opener mock/禁用，则 TUI 历史中出现完整 URL。

**前置阶段依赖**：Phase 2、Phase 4、Phase 5。

### Phase 7: frontend minimal connection verification

**目标**：前端首屏完成加载、清除 fragment、连接同源 `/ws`、发送 `gui/authenticate`、再发送 `initialize` 和 `thread/projection/attach`，不实现 timeline 或 projection 渲染。

**要改/新增的文件与符号**：

- 新增 `codex-gui/src/features/guiHost/guiHostClient.ts`：`readLaunchParams`、`clearLaunchTokenFragment`、`connectGuiHostWebSocket`、`authenticateGuiHost`、`initializeGuiClient`、`attachProjection`。
- 新增 `codex-gui/src/features/guiHost/guiHostClient.test.ts`：`read_launch_params_reads_thread_id_and_token`、`clear_launch_token_fragment_preserves_query`、`authenticate_sends_gui_authenticate_first`、`attach_uses_thread_id_from_query`。
- 修改 `codex-gui/src/App.tsx` 或 `codex-gui/src/main.tsx`：在应用启动时调用最小连接 verification flow，并把连接状态暴露为可测试文本或 data attribute。
- 修改 `codex-gui/vite.config.ts`：保留 Phase 5 的 HMR 直连 Vite 配置，不新增 `/ws` proxy。
- 修改 `codex-gui/e2e/app.spec.ts`：新增 `establishes_gui_host_ws_and_clears_fragment`，用 Playwright mock WebSocket 或测试 server 验证首帧和 URL fragment 清理。

**对应设计文档的哪一节**：`首版前端行为`。

**可观测验收标准**：

- `pnpm -C codex-gui run test -- src/features/guiHost/guiHostClient.test.ts` 通过，断言第一条发送消息为 `gui/authenticate`，第二阶段包含 `initialize`，attach 请求 method 为 `thread/projection/attach`。
- `pnpm -C codex-gui run type-check` 通过。
- `pnpm -C codex-gui run test:e2e -- e2e/app.spec.ts` 通过；测试断言页面加载后 `window.location.hash === ""`，并观察到 `/ws` 建立。
- 手动浏览器验收：打开 `/gui` 生成的 URL 后，地址栏不再包含 `#token=...`；DevTools Network 中 `/ws` 状态为 `101 Switching Protocols`，Frames 中第一条 client message 是 `gui/authenticate`，之后能看到 `initialize` 和 `thread/projection/attach`。

**前置阶段依赖**：Phase 3、Phase 5、Phase 6。

### Phase 8: integration acceptance

**目标**：补齐端到端验收，确认浏览器 DevTools 可见 `/ws` 建立、多 tab 可连接、多个 TUI session 的端口和 token 相互隔离。

**要改/新增的文件与符号**：

- 新增 `codex-rs/app-server/tests/suite/v2/gui_host.rs`：`gui_host_browser_flow_establishes_ws`、`gui_host_allows_multiple_tabs_with_same_token`、`gui_host_isolates_multiple_sessions`。
- 修改 `codex-rs/app-server/tests/suite/v2/mod.rs`：新增 `mod gui_host;`。
- 新增 `codex-rs/tui/tests/gui_command_smoke.rs` 或在现有 TUI integration/snapshot 测试中新增：`gui_command_opens_primary_thread_url`。
- 修改 `codex-gui/e2e/app.spec.ts`：保留 `establishes_gui_host_ws_and_clears_fragment`，并增加 `attaches_thread_from_query`.
- 如 app-server protocol schema 未改变，不修改 `codex-rs/app-server-protocol/schema/**`；若实现中改变 v2 API，则按项目规则运行 `just write-app-server-schema` 并更新 docs。

**对应设计文档的哪一节**：`测试策略`、`生命周期`。

**可观测验收标准**：

- `cd codex-rs && cargo test -p codex-app-server gui_host -- --nocapture` 通过，覆盖 app-server 侧 GuiHost integration。
- `cd codex-rs && cargo test -p codex-tui gui_command -- --nocapture` 通过，覆盖 TUI `/gui` 行为。
- `pnpm -C codex-gui run test:e2e -- e2e/app.spec.ts` 通过。
- 手动验收步骤可执行：运行 `pnpm -C codex-gui dev --host 127.0.0.1 --port 5173 --strictPort`，启动 TUI，输入 `/gui`，浏览器 DevTools Network 中确认 `http://127.0.0.1:<gui-host-port>/` 和 `ws://127.0.0.1:<gui-host-port>/ws`；复制同一 URL 到第二个 tab，两个 tab 都能建立 `/ws`；启动第二个 TUI session 后，新 URL 的 `<gui-host-port>` 和 token 与第一个 session 不同，交叉使用 token 时 `/ws` 被拒绝。
- Rust 收尾命令按变更范围执行：`cd codex-rs && just fmt`、`cd codex-rs && just fix -p codex-app-server`、`cd codex-rs && just fix -p codex-tui`；若修改 common/core/protocol，再询问是否运行完整 `cargo test`。

**前置阶段依赖**：Phase 1 至 Phase 7。

## 4. 测试清单

设计文档 `测试策略` 当前列出 10 个测试点；本清单全部映射，避免遗漏。`codex-rs/app-server/tests/` 的 integration harness 可以复用：`app_test_support::McpProcess`、mock responses server、`codex_utils_cargo_bin::cargo_bin("codex-app-server")`、`tokio_tungstenite` WebSocket helper 和 `connection_handling_websocket.rs` 的 spawn/read 模式都适合扩展到 `GuiHost`，但需要新增 `GuiHost` 专用启动 helper。

| 设计测试点 | 测试文件 | 测试用例名 | 是否复用 app-server integration harness |
| --- | --- | --- | --- |
| `/gui` 使用 `primary_thread_id`，不使用当前 displayed thread | `codex-rs/tui/src/app/tests.rs` | `gui_command_uses_primary_thread_id_not_active_thread_id` | 否，属于 TUI unit/snapshot |
| 第一次 `/gui` 启动 `GuiHost`，后续 `/gui` 复用同一 host | `codex-rs/tui/src/app/tests.rs` | `gui_command_lazy_starts_and_reuses_host` | 否，使用 TUI mock `GuiHost`/`GuiOpener` |
| `GuiHost` 绑定 loopback 随机端口 | `codex-rs/app-server/src/gui_host/tests.rs` | `binds_loopback_ephemeral_port` | 部分复用，直接用 tokio/reqwest 更轻 |
| launch URL 使用 fragment 携带 token | `codex-rs/app-server/src/gui_host/auth_tests.rs` | `generates_launch_url_with_fragment_token` | 部分复用，不需要完整 app-server process |
| `/ws` 要求第一条认证消息，认证失败不放行 JSON-RPC | `codex-rs/app-server/src/gui_host/auth_tests.rs` | `rejects_business_request_before_authentication` | 是，可复用 WebSocket connect/read 模式 |
| Host/Origin 校验拒绝非同源请求 | `codex-rs/app-server/src/gui_host/security_tests.rs` | `rejects_wrong_origin` | 是，可复用 `tokio_tungstenite::client::IntoClientRequest` 设置 header |
| 非白名单 request 不进入 app-server processor | `codex-rs/app-server/src/gui_host/security_tests.rs` | `rejects_non_whitelisted_request_before_processor` | 是，但需要测试用 processor/connection router 可观测计数 |
| server-to-browser 只放行 `thread/projection/event` | `codex-rs/app-server/src/gui_host/security_tests.rs` | `filters_non_projection_notifications` | 是，可复用 `QueuedOutgoingMessage` 写入路径或 integration WebSocket |
| dev 模式代理固定 Vite 地址，并在不可用时报错 | `codex-rs/app-server/src/gui_host/dev_proxy_tests.rs` | `dev_proxy_returns_actionable_error_when_vite_unavailable` | 部分复用，主要用 reqwest/wiremock |
| prod 模式只从 `$CODEX_GUI_PACKAGE_ROOT/dist/` 读取资源，缺失时报错 | `codex-rs/app-server/src/gui_host/static_tests.rs` | `prod_requires_code_gui_package_root`、`prod_requires_dist_directory` | 部分复用，主要用 tempfile/reqwest |

## 5. 风险与未决事项

- 设计文档 `测试策略` 实际列出 10 个测试点，而任务文本称“9 test strategy items”。建议实现和评审都按 10 个测试点覆盖，并在 PR 描述中说明该数量差异。
- JSON-RPC 白名单拒绝错误码未在设计中固定。建议首版使用 JSON-RPC 标准 `-32601 Method not found` 或现有 app-server `invalid_request` 错误码中的一种，并在实现 PR 中集中记录；明显越权或认证阶段错误仍按设计允许关闭连接。
- 首帧 `gui/authenticate` 格式错误但能解析出 `id` 时的 error payload 形状未完全指定。建议返回 JSON-RPC error 后用 close code `1008` 关闭；无法解析 request id 时直接 `1008`。
- 前端 URL 缺失 `threadId` 时行为未明确。建议页面显示连接错误且不发送 `thread/projection/attach`；不要猜测主 thread，也不要从 token 推断 thread。
- Vite HMR 的精确配置语法取决于 Vite 8 对 `server.hmr` 的类型。建议先用 `server: { host: "127.0.0.1", port: 5173, strictPort: true, hmr: { host: "127.0.0.1", port: 5173, protocol: "ws" } }`，再以 `pnpm -C codex-gui run type-check` 和浏览器 Network 验证。
- `CODEX_GUI_PACKAGE_ROOT` 的 npm package root 在发布包中的最终目录尚未由设计确定。建议 Node wrapper 先按 `path.join(__dirname, "..", "codex-gui")` 或发布脚本实际复制路径设置，并把发布结构变更放入单独 PR。
- `GuiHost` 是否需要新增 `ConnectionOrigin::GuiHost` 会影响 `codex-app-server-transport` 公共 API。建议优先在 `codex-app-server` 内部完成来源隔离；只有 tracing/analytics/cleanup 必须区分时再扩展 `ConnectionOrigin`。
- `GuiHost` 与 app-server 主循环复用的最小抽象边界需要在实现时确认。建议从 `codex-rs/app-server/src/lib.rs` 中抽出私有 connection router helper，而不是把 browser 规则塞进 `MessageProcessor` 或 `codex-app-server-transport` remote WebSocket。
- opener 失败后的 TUI 文案会影响 snapshot。建议文案只包含错误摘要和完整 URL，避免把平台命令细节写成需要长期维护的承诺。
- 手动 DevTools 验收无法完全自动化。建议 Playwright 负责自动断言 hash 清理和 WebSocket 首帧，人工验收只作为 Phase 8 release checklist。

## 6. 回退策略

每个 phase 都应作为独立 commit 合入；如果某个 phase 在 review 中被拒绝，优先 revert 该 phase 的单独 commit，并保留已经合入的下层能力。早期 `GuiHost` skeleton、认证、白名单、静态资源和 dev proxy 都应保持内部入口或测试入口，不在 TUI 暴露用户能力；只有 Phase 6 后 `/gui` 才成为用户可见入口，因此 Phase 6 及之后的回退需要同时移除 slash command 注册和 TUI 调用点，避免留下不可达或半可用的 GUI host。
