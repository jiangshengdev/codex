# Codex GUI Host Implementation Plan
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
**Goal:** Build the first local-only Codex GUI host so TUI `/gui` opens a browser page that authenticates to same-origin `/ws` and attaches to the primary thread projection.
**Architecture:** `GuiHost` lives inside `codex-app-server`, binds `127.0.0.1:0`, serves or proxies GUI assets, and exposes browser-safe `/ws`. It uses a reusable CSPRNG `LaunchToken`, first-frame `gui/authenticate`, strict Host/Origin checks, browser and server method whitelists, and the existing app-server handler chain. TUI only starts the host and opens the URL; projection JSON-RPC, fanout, and connection cleanup remain owned by app-server.
**Tech Stack:** Rust (axum / tokio / tokio-tungstenite), codex-app-server, codex-tui, codex-gui (Vite/React), Playwright, Vitest.
---
### File Structure
- Create: `codex-rs/app-server/src/gui_host.rs`
  - Owns `GuiHost`, `GuiHostConfig`, `GuiHostMode`, `GuiHostHandle`, `LaunchToken`, `/ws` authentication, Host/Origin validation, JSON-RPC filtering, prod static assets, and dev Vite proxying.
- Modify: `codex-rs/app-server/src/lib.rs`
  - Registers `gui_host` and exposes the minimum crate-internal entry points needed by TUI and app-server integration tests.
- Modify: `codex-rs/app-server/Cargo.toml`
  - Adds only dependencies required for token generation, asset serving, HTTP proxy tests, or temporary files if not already present.
- Create: `codex-rs/app-server/tests/suite/v2/gui_host.rs`
  - Covers running-host acceptance: multiple tabs with one token, isolated sessions, and browser-style authentication.
- Modify: `codex-rs/app-server/tests/suite/v2/mod.rs`
  - Registers the `gui_host` integration test module.
- Modify: `codex-cli/bin/codex.js`
  - Sets `CODEX_GUI_PACKAGE_ROOT` for the Rust binary while preserving existing npm/bun environment semantics.
- Modify: `codex-cli/scripts/build_npm_package.py`
  - Copies GUI `dist/` into the package root when the implementation PR finalizes package layout.
- Modify: `codex-rs/tui/src/slash_command.rs`
  - Adds visible `/gui` slash command metadata and availability.
- Modify: `codex-rs/tui/src/chatwidget/slash_dispatch.rs`
  - Converts `/gui` into `AppEvent::OpenGui`.
- Modify: `codex-rs/tui/src/app_event.rs`
  - Adds `AppEvent::OpenGui`.
- Create: `codex-rs/tui/src/gui_opener.rs`
  - Defines `GuiOpener`, `PlatformGuiOpener`, and `OpenGuiError`.
- Create: `codex-rs/tui/src/app/gui.rs`
  - Owns `App::open_gui`, host reuse, URL generation, opener fallback text, and shutdown.
- Modify: `codex-rs/tui/src/app.rs`
  - Stores `gui_host: Option<GuiHostHandle>` and delegates `OpenGui`.
- Modify: `codex-rs/tui/src/app/thread_routing.rs`
  - Exposes read-only access to `primary_thread_id` if needed.
- Modify: `codex-rs/tui/src/chatwidget/tests/slash_commands.rs`
  - Tests `/gui` command registration.
- Modify: `codex-rs/tui/src/app/tests.rs`
  - Tests primary-thread selection, missing primary thread, host reuse, and opener fallback.
- Create: `codex-gui/src/features/guiHost/guiHostClient.ts`
  - Reads launch params, clears `#token`, connects `/ws`, authenticates, initializes, and attaches projection.
- Create: `codex-gui/src/features/guiHost/guiHostClient.test.ts`
  - Tests launch parsing, fragment clearing, message order, and attach params.
- Modify: `codex-gui/src/App.tsx`
  - Starts the minimal connection verification flow and exposes status for tests.
- Modify: `codex-gui/vite.config.ts`
  - Pins dev host/port/HMR to Vite and leaves projection `/ws` on `GuiHost`.
- Modify: `codex-gui/e2e/app.spec.ts`
  - Adds Playwright coverage for hash clearing and connection verification.

**通用说明:** Step 2 的 Expected 输出描述 FAIL 的性质（编译错误类别/断言失败语义）；实际运行文字可能因 Rust、axum、tungstenite 等版本不同而有出入，只要呈现对应 FAIL 即可，不视为 plan 偏差。

**前置确认:** 开始 Task 1 前先在 repo root 运行依赖核实，避免重复 pin 或遗漏 workspace pin：
```bash
rg -n '^(base64|rand|urlencoding|tempfile|reqwest|async-trait|thiserror|futures|tower-http|tokio-tungstenite|axum) ' codex-rs/Cargo.toml
```
本计划按当前仓库核实结果编写：`base64`、`rand`、`urlencoding`、`tempfile`、`reqwest`、`async-trait`、`thiserror`、`futures`、`tokio-tungstenite`、`axum` 已有 workspace pin；`tower-http` 未 pin，Task 11 首次使用时补 `[workspace.dependencies] tower-http`。

**模块可见性策略:** `codex-rs/app-server/src/lib.rs` 从 Task 1 起使用 `#[doc(hidden)] pub mod gui_host;`，因为 Task 14 的 TUI 非测试代码需要跨 crate 使用 `codex_app_server::gui_host::{...}`。`gui_host` 只公开 TUI 和 integration tests 必需的 `GuiHost`、`GuiHostConfig`、`GuiHostMode`、`DevAssetProxyConfig`、`ProdAssetConfig`、`GuiHostHandle`、`LaunchToken` 及其必要方法；后续 Task 不再调整模块可见性，也不加 conditional pub gate。
### Task 1: GuiHost binds loopback and serves root
**Files:**
- Create: `codex-rs/app-server/src/gui_host.rs`
- Modify: `codex-rs/app-server/src/lib.rs`
- Test: `codex-rs/app-server/src/gui_host.rs`
- [ ] **Step 1: Write a failing test**
```rust
#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn binds_loopback_ephemeral_port_and_serves_root() {
        let handle = GuiHost::start(GuiHostConfig {
            mode: GuiHostMode::Dev(DevAssetProxyConfig::default()),
        })
        .await
        .expect("GuiHost should start");
        assert_eq!(handle.local_addr().ip().to_string(), "127.0.0.1");
        assert_ne!(handle.local_addr().port(), 0);
        let response = reqwest::get(handle.base_url()).await.unwrap();
        assert_eq!(response.status(), reqwest::StatusCode::OK);
        assert_eq!(response.text().await.unwrap(), "Codex GUI Host");
        handle.shutdown().await;
    }
}
```
- [ ] **Step 2: Run the test to confirm FAIL**
Run from `codex-rs`:
```bash
cargo test -p codex-app-server gui_host::tests::binds_loopback_ephemeral_port_and_serves_root
```
Expected error output:
```text
error[E0433]: failed to resolve: use of undeclared type `GuiHost`
error[E0422]: cannot find struct, variant or union type `GuiHostConfig` in this scope
```
- [ ] **Step 3: Write minimal implementation to make test pass**
Create `codex-rs/app-server/src/gui_host.rs`:
```rust
use std::net::SocketAddr;
use axum::{routing::get, Router};
use tokio::{net::TcpListener, sync::oneshot};
#[derive(Debug, Clone)]
pub struct GuiHostConfig { pub mode: GuiHostMode }
#[derive(Debug, Clone)]
pub enum GuiHostMode { Dev(DevAssetProxyConfig), Prod(ProdAssetConfig) }
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DevAssetProxyConfig { pub vite_origin: String }
impl Default for DevAssetProxyConfig {
    fn default() -> Self { Self { vite_origin: "http://127.0.0.1:5173".to_string() } }
}
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProdAssetConfig { pub package_root: std::path::PathBuf }
pub struct GuiHost;
pub struct GuiHostHandle {
    local_addr: SocketAddr,
    shutdown_tx: Option<oneshot::Sender<()>>,
    server_task: tokio::task::JoinHandle<()>,
}
impl GuiHost {
    pub async fn start(config: GuiHostConfig) -> std::io::Result<GuiHostHandle> {
        let listener = TcpListener::bind(("127.0.0.1", 0)).await?;
        let local_addr = listener.local_addr()?;
        let app = Router::new().route("/", get(|| async { "Codex GUI Host" }));
        let (shutdown_tx, shutdown_rx) = oneshot::channel();
        let server_task = tokio::spawn(async move {
            let server = axum::serve(listener, app).with_graceful_shutdown(async move {
                let _ = shutdown_rx.await;
            });
            if let Err(err) = server.await { tracing::warn!(?err, "GuiHost exited"); }
            drop(config);
        });
        Ok(GuiHostHandle { local_addr, shutdown_tx: Some(shutdown_tx), server_task })
    }
}
impl GuiHostHandle {
    pub fn local_addr(&self) -> SocketAddr { self.local_addr }
    pub fn base_url(&self) -> String { format!("http://{}", self.local_addr) }
    pub async fn shutdown(mut self) {
        if let Some(tx) = self.shutdown_tx.take() { let _ = tx.send(()); }
        let _ = self.server_task.await;
    }
}
```
Modify `codex-rs/app-server/src/lib.rs`:
```rust
#[doc(hidden)]
pub mod gui_host;
```
If `reqwest` is missing for tests, add to `codex-rs/app-server/Cargo.toml`:
```toml
[dev-dependencies]
reqwest = { workspace = true }
```
- [ ] **Step 4: Run test to confirm PASS**
Run from `codex-rs`:
```bash
cargo test -p codex-app-server gui_host::tests::binds_loopback_ephemeral_port_and_serves_root
```
Expected output:
```text
test gui_host::tests::binds_loopback_ephemeral_port_and_serves_root ... ok
```
- [ ] **Step 5: Commit**
```bash
git add codex-rs/app-server/src/gui_host.rs codex-rs/app-server/src/lib.rs codex-rs/app-server/Cargo.toml
git commit -m "feat(app-server): add GUI host skeleton"
```
### Task 2: LaunchToken generation and URL formatting
**Files:**
- Modify: `codex-rs/app-server/src/gui_host.rs`
- Test: `codex-rs/app-server/src/gui_host.rs`
- [ ] **Step 1: Write a failing test**
```rust
#[test]
fn generates_launch_url_with_fragment_token() {
    let addr: SocketAddr = "127.0.0.1:4567".parse().unwrap();
    let token = LaunchToken::from_test_value("0123456789abcdef0123456789abcdef");
    let handle = GuiHostHandle::new_for_test(addr, token.clone());
    let url = handle.launch_url_for_thread("thread-abc");
    assert_eq!(url, "http://127.0.0.1:4567/?threadId=thread-abc#token=0123456789abcdef0123456789abcdef");
    assert!(!url.contains("?token="));
    assert_eq!(token.as_str(), "0123456789abcdef0123456789abcdef");
}
```
- [ ] **Step 2: Run the test to confirm FAIL**
Run from `codex-rs`:
```bash
cargo test -p codex-app-server gui_host::tests::generates_launch_url_with_fragment_token
```
Expected error output:
```text
error[E0433]: failed to resolve: use of undeclared type `LaunchToken`
error[E0599]: no method named `launch_url_for_thread` found for struct `GuiHostHandle`
```
- [ ] **Step 3: Write minimal implementation to make test pass**
Add to `gui_host.rs`:
```rust
use base64::Engine;
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LaunchToken(String);
impl LaunchToken {
    pub fn generate() -> Self {
        use rand::RngCore;
        let mut bytes = [0_u8; 32];
        rand::rngs::OsRng.fill_bytes(&mut bytes);
        Self(base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(bytes))
    }
    pub fn as_str(&self) -> &str { &self.0 }
    #[cfg(test)]
    pub(crate) fn from_test_value(value: &str) -> Self { Self(value.to_string()) }
}
pub struct GuiHostHandle {
    local_addr: SocketAddr,
    launch_token: LaunchToken,
    shutdown_tx: Option<oneshot::Sender<()>>,
    server_task: Option<tokio::task::JoinHandle<()>>,
}
impl GuiHostHandle {
    #[cfg(test)]
    pub(crate) fn new_for_test(local_addr: SocketAddr, launch_token: LaunchToken) -> Self {
        Self { local_addr, launch_token, shutdown_tx: None, server_task: None }
    }
    pub fn launch_token(&self) -> &LaunchToken { &self.launch_token }
    pub fn launch_url_for_thread(&self, thread_id: impl std::fmt::Display) -> String {
        let thread_id = thread_id.to_string();
        format!("{}/?threadId={}#token={}", self.base_url(), urlencoding::encode(&thread_id), self.launch_token.as_str())
    }
    pub async fn shutdown(mut self) {
        if let Some(tx) = self.shutdown_tx.take() { let _ = tx.send(()); }
        if let Some(server_task) = self.server_task.take() { let _ = server_task.await; }
    }
}
```
In `GuiHost::start`, create `let launch_token = LaunchToken::generate();` and return it in `GuiHostHandle` as `server_task: Some(server_task)`. If needed, add:
```toml
[dependencies]
base64 = { workspace = true }
rand = { workspace = true }
urlencoding = { workspace = true }
```
- [ ] **Step 4: Run test to confirm PASS**
Run from `codex-rs`:
```bash
cargo test -p codex-app-server gui_host::tests::generates_launch_url_with_fragment_token
```
Expected output:
```text
test gui_host::tests::generates_launch_url_with_fragment_token ... ok
```
- [ ] **Step 5: Commit**
```bash
git add codex-rs/app-server/src/gui_host.rs codex-rs/app-server/Cargo.toml
git commit -m "feat(app-server): add GUI launch token URL"
```
### Task 3: /ws accepts valid gui/authenticate first frame
**Files:**
- Modify: `codex-rs/app-server/src/gui_host.rs`
- Test: `codex-rs/app-server/src/gui_host.rs`
- [ ] **Step 1: Write a failing test**
```rust
async fn websocket_url(handle: &GuiHostHandle) -> String {
    format!("ws://{}/ws", handle.local_addr())
}
#[tokio::test]
async fn accepts_valid_authenticate_first_frame() {
    let handle = GuiHost::start(GuiHostConfig { mode: GuiHostMode::Dev(DevAssetProxyConfig::default()) }).await.unwrap();
    let (mut ws, _) = tokio_tungstenite::connect_async(websocket_url(&handle).await).await.unwrap();
    ws.send(tokio_tungstenite::tungstenite::Message::Text(format!(
        r#"{{"jsonrpc":"2.0","id":1,"method":"gui/authenticate","params":{{"token":"{}"}}}}"#,
        handle.launch_token().as_str()
    ))).await.unwrap();
    assert_eq!(ws.next().await.unwrap().unwrap().into_text().unwrap(), r#"{"jsonrpc":"2.0","id":1,"result":{"authenticated":true}}"#);
    handle.shutdown().await;
}
```
- [ ] **Step 2: Run the test to confirm FAIL**
Run from `codex-rs`:
```bash
cargo test -p codex-app-server gui_host::tests::accepts_valid_authenticate_first_frame
```
Expected error output:
```text
WebSocket protocol error: Handshake not finished
```
- [ ] **Step 3: Write minimal implementation to make test pass**
Add to `gui_host.rs`:
```rust
use axum::{extract::{ws::{Message, WebSocket, WebSocketUpgrade}, State}, response::IntoResponse};
use futures::{SinkExt, StreamExt};
use serde::Deserialize;
use serde_json::json;
use std::sync::Arc;
#[derive(Clone)]
struct GuiHostState { local_addr: SocketAddr, launch_token: LaunchToken, mode: GuiHostMode }
#[derive(Debug, Deserialize)]
struct GuiAuthenticateRequest {
    jsonrpc: String,
    id: serde_json::Value,
    method: String,
    params: GuiAuthenticateParams,
}
#[derive(Debug, Deserialize)]
pub(crate) struct GuiAuthenticateParams { pub(crate) token: Option<String> }
impl GuiHost {
    async fn ws_handler(State(state): State<Arc<GuiHostState>>, ws: WebSocketUpgrade) -> impl IntoResponse {
        ws.on_upgrade(move |socket| authenticate_first_frame(socket, state))
    }
}
async fn authenticate_first_frame(mut socket: WebSocket, state: Arc<GuiHostState>) {
    let Some(Ok(Message::Text(text))) = socket.recv().await else { let _ = socket.close().await; return; };
    let Ok(request) = serde_json::from_str::<GuiAuthenticateRequest>(&text) else { let _ = socket.close().await; return; };
    if request.jsonrpc == "2.0" && request.method == "gui/authenticate" && request.params.token.as_deref() == Some(state.launch_token.as_str()) {
        let response = json!({"jsonrpc":"2.0","id":request.id,"result":{"authenticated":true}});
        let _ = socket.send(Message::Text(response.to_string())).await;
    } else {
        let _ = socket.close().await;
    }
}
```
Build the router with state:
```rust
let launch_token = LaunchToken::generate();
let state = Arc::new(GuiHostState { local_addr, launch_token: launch_token.clone(), mode: config.mode.clone() });
let app = Router::new()
    .route("/", get(|| async { "Codex GUI Host" }))
    .route("/ws", get(GuiHost::ws_handler))
    .with_state(state);
```
- [ ] **Step 4: Run test to confirm PASS**
Run from `codex-rs`:
```bash
cargo test -p codex-app-server gui_host::tests::accepts_valid_authenticate_first_frame
```
Expected output:
```text
test gui_host::tests::accepts_valid_authenticate_first_frame ... ok
```
- [ ] **Step 5: Commit**
```bash
git add codex-rs/app-server/src/gui_host.rs
git commit -m "feat(app-server): authenticate GUI host websocket"
```
### Task 4: /ws rejects missing token in first frame
**Files:**
- Modify: `codex-rs/app-server/src/gui_host.rs`
- Test: `codex-rs/app-server/src/gui_host.rs`
- [ ] **Step 1: Write a failing test**
```rust
#[tokio::test]
async fn rejects_missing_token_in_first_frame() {
    let handle = GuiHost::start(GuiHostConfig { mode: GuiHostMode::Dev(DevAssetProxyConfig::default()) }).await.unwrap();
    let (mut ws, _) = tokio_tungstenite::connect_async(websocket_url(&handle).await).await.unwrap();
    ws.send(tokio_tungstenite::tungstenite::Message::Text(
        r#"{"jsonrpc":"2.0","id":7,"method":"gui/authenticate","params":{}}"#.to_string(),
    )).await.unwrap();
    assert!(ws.next().await.unwrap().unwrap().is_close());
    handle.shutdown().await;
}
```
- [ ] **Step 2: Run the test to confirm FAIL**
Run from `codex-rs`:
```bash
cargo test -p codex-app-server gui_host::tests::rejects_missing_token_in_first_frame
```
Expected error output:
```text
thread 'gui_host::tests::rejects_missing_token_in_first_frame' panicked at 'assertion failed: message.is_close()'
```
- [ ] **Step 3: Write minimal implementation to make test pass**
Use policy close for auth failure:
```rust
async fn close_policy_violation(socket: &mut WebSocket) {
    let _ = socket.send(Message::Close(Some(axum::extract::ws::CloseFrame {
        code: axum::extract::ws::close_code::POLICY,
        reason: "GUI authentication failed".into(),
    }))).await;
}
async fn authenticate_first_frame(mut socket: WebSocket, state: Arc<GuiHostState>) {
    let Some(Ok(Message::Text(text))) = socket.recv().await else { close_policy_violation(&mut socket).await; return; };
    let Ok(request) = serde_json::from_str::<GuiAuthenticateRequest>(&text) else { close_policy_violation(&mut socket).await; return; };
    if request.jsonrpc == "2.0" && request.method == "gui/authenticate" && request.params.token.as_deref() == Some(state.launch_token.as_str()) {
        let response = json!({"jsonrpc":"2.0","id":request.id,"result":{"authenticated":true}});
        let _ = socket.send(Message::Text(response.to_string())).await;
    } else {
        close_policy_violation(&mut socket).await;
    }
}
```
- [ ] **Step 4: Run test to confirm PASS**
Run from `codex-rs`:
```bash
cargo test -p codex-app-server gui_host::tests::rejects_missing_token_in_first_frame
```
Expected output:
```text
test gui_host::tests::rejects_missing_token_in_first_frame ... ok
```
- [ ] **Step 5: Commit**
```bash
git add codex-rs/app-server/src/gui_host.rs
git commit -m "feat(app-server): reject GUI websocket missing token"
```
### Task 5: /ws rejects wrong token in first frame
**Files:**
- Modify: `codex-rs/app-server/src/gui_host.rs`
- Test: `codex-rs/app-server/src/gui_host.rs`
- [ ] **Step 1: Write a failing test**
```rust
#[tokio::test]
async fn rejects_wrong_token_in_first_frame() {
    let handle = GuiHost::start(GuiHostConfig { mode: GuiHostMode::Dev(DevAssetProxyConfig::default()) }).await.unwrap();
    let (mut ws, _) = tokio_tungstenite::connect_async(websocket_url(&handle).await).await.unwrap();
    ws.send(tokio_tungstenite::tungstenite::Message::Text(
        r#"{"jsonrpc":"2.0","id":8,"method":"gui/authenticate","params":{"token":"wrong"}}"#.to_string(),
    )).await.unwrap();
    assert!(ws.next().await.unwrap().unwrap().is_close());
    handle.shutdown().await;
}
```
- [ ] **Step 2: Run the test to confirm FAIL**
Run from `codex-rs`:
```bash
cargo test -p codex-app-server gui_host::tests::rejects_wrong_token_in_first_frame
```
Expected error output:
```text
thread 'gui_host::tests::rejects_wrong_token_in_first_frame' panicked at 'assertion failed: message.is_close()'
```
- [ ] **Step 3: Write minimal implementation to make test pass**
Keep token comparison opaque and exact:
```rust
fn token_matches(expected: &LaunchToken, actual: Option<&str>) -> bool {
    actual == Some(expected.as_str())
}
async fn authenticate_first_frame(mut socket: WebSocket, state: Arc<GuiHostState>) {
    let Some(Ok(Message::Text(text))) = socket.recv().await else { close_policy_violation(&mut socket).await; return; };
    let Ok(request) = serde_json::from_str::<GuiAuthenticateRequest>(&text) else { close_policy_violation(&mut socket).await; return; };
    if request.jsonrpc == "2.0" && request.method == "gui/authenticate" && token_matches(&state.launch_token, request.params.token.as_deref()) {
        let response = json!({"jsonrpc":"2.0","id":request.id,"result":{"authenticated":true}});
        let _ = socket.send(Message::Text(response.to_string())).await;
    } else {
        close_policy_violation(&mut socket).await;
    }
}
```
- [ ] **Step 4: Run test to confirm PASS**
Run from `codex-rs`:
```bash
cargo test -p codex-app-server gui_host::tests::rejects_wrong_token_in_first_frame
```
Expected output:
```text
test gui_host::tests::rejects_wrong_token_in_first_frame ... ok
```
- [ ] **Step 5: Commit**
```bash
git add codex-rs/app-server/src/gui_host.rs
git commit -m "feat(app-server): reject GUI websocket wrong token"
```
### Task 6: /ws rejects business requests before authentication
**Files:**
- Modify: `codex-rs/app-server/src/gui_host.rs`
- Test: `codex-rs/app-server/src/gui_host.rs`
- [ ] **Step 1: Write a failing test**
```rust
#[tokio::test]
async fn rejects_business_request_before_authentication() {
    let handle = GuiHost::start(GuiHostConfig { mode: GuiHostMode::Dev(DevAssetProxyConfig::default()) }).await.unwrap();
    let (mut ws, _) = tokio_tungstenite::connect_async(websocket_url(&handle).await).await.unwrap();
    ws.send(tokio_tungstenite::tungstenite::Message::Text(
        r#"{"jsonrpc":"2.0","id":9,"method":"initialize","params":{}}"#.to_string(),
    )).await.unwrap();
    assert!(ws.next().await.unwrap().unwrap().is_close());
    handle.shutdown().await;
}
```
- [ ] **Step 2: Run the test to confirm FAIL**
Run from `codex-rs`:
```bash
cargo test -p codex-app-server gui_host::tests::rejects_business_request_before_authentication
```
Expected error output:
```text
thread 'gui_host::tests::rejects_business_request_before_authentication' panicked at 'assertion failed: message.is_close()'
```
- [ ] **Step 3: Write minimal implementation to make test pass**
Name the auth method gate:
```rust
fn is_authenticate_method(method: &str) -> bool { method == "gui/authenticate" }
async fn authenticate_first_frame(mut socket: WebSocket, state: Arc<GuiHostState>) {
    let Some(Ok(Message::Text(text))) = socket.recv().await else { close_policy_violation(&mut socket).await; return; };
    let Ok(request) = serde_json::from_str::<GuiAuthenticateRequest>(&text) else { close_policy_violation(&mut socket).await; return; };
    if request.jsonrpc == "2.0" && is_authenticate_method(&request.method) && token_matches(&state.launch_token, request.params.token.as_deref()) {
        let response = json!({"jsonrpc":"2.0","id":request.id,"result":{"authenticated":true}});
        let _ = socket.send(Message::Text(response.to_string())).await;
    } else {
        close_policy_violation(&mut socket).await;
    }
}
```
- [ ] **Step 4: Run test to confirm PASS**
Run from `codex-rs`:
```bash
cargo test -p codex-app-server gui_host::tests::rejects_business_request_before_authentication
```
Expected output:
```text
test gui_host::tests::rejects_business_request_before_authentication ... ok
```
- [ ] **Step 5: Commit**
```bash
git add codex-rs/app-server/src/gui_host.rs
git commit -m "feat(app-server): require GUI websocket authentication first"
```
### Task 7: Host and Origin validation
**Files:**
- Modify: `codex-rs/app-server/src/gui_host.rs`
- Test: `codex-rs/app-server/src/gui_host.rs`
- [ ] **Step 1: Write a failing test**
```rust
#[test]
fn validates_exact_host_and_origin() {
    let addr: SocketAddr = "127.0.0.1:4567".parse().unwrap();
    assert!(GuiHost::validate_host_header(&addr, "127.0.0.1:4567"));
    assert!(!GuiHost::validate_host_header(&addr, "localhost:4567"));
    assert!(!GuiHost::validate_host_header(&addr, "evil.example:4567"));
    assert!(!GuiHost::validate_host_header(&addr, ""));
    assert!(GuiHost::validate_origin_header(&addr, Some("http://127.0.0.1:4567")));
    assert!(!GuiHost::validate_origin_header(&addr, Some("http://localhost:4567")));
    assert!(!GuiHost::validate_origin_header(&addr, None));
}
```
- [ ] **Step 2: Run the test to confirm FAIL**
Run from `codex-rs`:
```bash
cargo test -p codex-app-server gui_host::tests::validates_exact_host_and_origin
```
Expected error output:
```text
error[E0599]: no function or associated item named `validate_host_header` found for struct `GuiHost`
error[E0599]: no function or associated item named `validate_origin_header` found for struct `GuiHost`
```
- [ ] **Step 3: Write minimal implementation to make test pass**
```rust
impl GuiHost {
    pub(crate) fn validate_host_header(local_addr: &SocketAddr, host: &str) -> bool {
        host == format!("127.0.0.1:{}", local_addr.port())
    }
    pub(crate) fn validate_origin_header(local_addr: &SocketAddr, origin: Option<&str>) -> bool {
        origin == Some(format!("http://127.0.0.1:{}", local_addr.port()).as_str())
    }
    async fn ws_handler(
        State(state): State<Arc<GuiHostState>>,
        headers: axum::http::HeaderMap,
        ws: WebSocketUpgrade,
    ) -> impl IntoResponse {
        let host = headers.get(axum::http::header::HOST).and_then(|v| v.to_str().ok()).unwrap_or_default();
        let origin = headers.get(axum::http::header::ORIGIN).and_then(|v| v.to_str().ok());
        if !Self::validate_host_header(&state.local_addr, host) || !Self::validate_origin_header(&state.local_addr, origin) {
            return axum::http::StatusCode::FORBIDDEN.into_response();
        }
        ws.on_upgrade(move |socket| authenticate_first_frame(socket, state)).into_response()
    }
}
```
- [ ] **Step 4: Run test to confirm PASS**
Run from `codex-rs`:
```bash
cargo test -p codex-app-server gui_host::tests::validates_exact_host_and_origin
```
Expected output:
```text
test gui_host::tests::validates_exact_host_and_origin ... ok
```
- [ ] **Step 5: Commit**
```bash
git add codex-rs/app-server/src/gui_host.rs
git commit -m "feat(app-server): validate GUI host origin"
```
### Task 8: Browser-to-server method whitelist
**Files:**
- Modify: `codex-rs/app-server/src/gui_host.rs`
- Test: `codex-rs/app-server/src/gui_host.rs`
- [ ] **Step 1: Write a failing test**
```rust
#[test]
fn allows_only_gui_browser_request_methods() {
    assert!(GuiHost::is_allowed_client_request_method("initialize"));
    assert!(GuiHost::is_allowed_client_request_method("thread/projection/attach"));
    assert!(GuiHost::is_allowed_client_request_method("thread/projection/detach"));
    assert!(!GuiHost::is_allowed_client_request_method("thread/list"));
    assert!(!GuiHost::is_allowed_client_request_method("gui/authenticate"));
}
```
- [ ] **Step 2: Run the test to confirm FAIL**
Run from `codex-rs`:
```bash
cargo test -p codex-app-server gui_host::tests::allows_only_gui_browser_request_methods
```
Expected error output:
```text
error[E0599]: no function or associated item named `is_allowed_client_request_method` found for struct `GuiHost`
```
- [ ] **Step 3: Write minimal implementation to make test pass**
```rust
impl GuiHost {
    pub(crate) fn is_allowed_client_request_method(method: &str) -> bool {
        matches!(method, "initialize" | "thread/projection/attach" | "thread/projection/detach")
    }
}
#[derive(Debug, Deserialize)]
struct JsonRpcMethodProbe { method: Option<String> }
fn gui_host_allows_incoming_text(text: &str) -> bool {
    let Ok(probe) = serde_json::from_str::<JsonRpcMethodProbe>(text) else { return false; };
    probe.method.as_deref().is_none_or(GuiHost::is_allowed_client_request_method)
}
```
- [ ] **Step 4: Run test to confirm PASS**
Run from `codex-rs`:
```bash
cargo test -p codex-app-server gui_host::tests::allows_only_gui_browser_request_methods
```
Expected output:
```text
test gui_host::tests::allows_only_gui_browser_request_methods ... ok
```
- [ ] **Step 5: Commit**
```bash
git add codex-rs/app-server/src/gui_host.rs
git commit -m "feat(app-server): restrict GUI browser request methods"
```
### Task 9: Server-to-browser notification whitelist
**Files:**
- Modify: `codex-rs/app-server/src/gui_host.rs`
- Test: `codex-rs/app-server/src/gui_host.rs`
- [ ] **Step 1: Write a failing test**
```rust
#[test]
fn filters_server_notifications_for_gui_browser() {
    assert!(GuiHost::is_allowed_server_notification_method("thread/projection/event"));
    assert!(!GuiHost::is_allowed_server_notification_method("thread/updated"));
    assert!(!GuiHost::is_allowed_server_notification_method("session/configured"));
}
```
- [ ] **Step 2: Run the test to confirm FAIL**
Run from `codex-rs`:
```bash
cargo test -p codex-app-server gui_host::tests::filters_server_notifications_for_gui_browser
```
Expected error output:
```text
error[E0599]: no function or associated item named `is_allowed_server_notification_method` found for struct `GuiHost`
```
- [ ] **Step 3: Write minimal implementation to make test pass**
```rust
impl GuiHost {
    pub(crate) fn is_allowed_server_notification_method(method: &str) -> bool {
        method == "thread/projection/event"
    }
}
fn gui_host_allows_outgoing_text(text: &str) -> bool {
    let Ok(value) = serde_json::from_str::<serde_json::Value>(text) else { return false; };
    value.get("method").and_then(serde_json::Value::as_str)
        .is_none_or(GuiHost::is_allowed_server_notification_method)
}
```
- [ ] **Step 4: Run test to confirm PASS**
Run from `codex-rs`:
```bash
cargo test -p codex-app-server gui_host::tests::filters_server_notifications_for_gui_browser
```
Expected output:
```text
test gui_host::tests::filters_server_notifications_for_gui_browser ... ok
```
- [ ] **Step 5: Commit**
```bash
git add codex-rs/app-server/src/gui_host.rs
git commit -m "feat(app-server): filter GUI browser notifications"
```
### Task 10: Authenticated traffic reuses app-server connection handling
**Files:**
- Modify: `codex-rs/app-server/src/lib.rs`
- Modify: `codex-rs/app-server/src/gui_host.rs`
- Test: `codex-rs/app-server/src/gui_host.rs`
- [ ] **Step 1: Write a failing test**
```rust
#[tokio::test]
async fn authenticated_allowed_request_reaches_router() {
    let router = TestGuiConnectionRouter::default();
    let allowed = r#"{"jsonrpc":"2.0","id":10,"method":"initialize","params":{}}"#;
    let blocked = r#"{"jsonrpc":"2.0","id":11,"method":"thread/list","params":{}}"#;
    assert!(forward_authenticated_message(&router, allowed.to_string()).await.unwrap());
    assert!(!forward_authenticated_message(&router, blocked.to_string()).await.unwrap());
    assert_eq!(router.messages().await, vec![allowed.to_string()]);
}
```
- [ ] **Step 2: Run the test to confirm FAIL**
Run from `codex-rs`:
```bash
cargo test -p codex-app-server gui_host::tests::authenticated_allowed_request_reaches_router
```
Expected error output:
```text
error[E0433]: failed to resolve: use of undeclared type `TestGuiConnectionRouter`
error[E0425]: cannot find function `forward_authenticated_message` in this scope
```
- [ ] **Step 3: Write minimal implementation to make test pass**
```rust
pub(crate) trait GuiConnectionRouter: Send + Sync {
    fn incoming_text(&self, text: String) -> impl std::future::Future<Output = anyhow::Result<()>> + Send;
}
pub(crate) async fn forward_authenticated_message(router: &impl GuiConnectionRouter, text: String) -> anyhow::Result<bool> {
    if !gui_host_allows_incoming_text(&text) { return Ok(false); }
    router.incoming_text(text).await?;
    Ok(true)
}
#[cfg(test)]
#[derive(Default)]
struct TestGuiConnectionRouter { messages: tokio::sync::Mutex<Vec<String>> }
#[cfg(test)]
impl GuiConnectionRouter for TestGuiConnectionRouter {
    async fn incoming_text(&self, text: String) -> anyhow::Result<()> {
        self.messages.lock().await.push(text);
        Ok(())
    }
}
#[cfg(test)]
impl TestGuiConnectionRouter {
    async fn messages(&self) -> Vec<String> { self.messages.lock().await.clone() }
}
```
In `lib.rs`, extract a production router that calls the same `MessageProcessor::process_request`, `process_response`, `process_error`, `process_notification`, and `connection_closed` paths used by the current websocket `TransportEvent::IncomingMessage` loop. The real message enum is `codex_app_server_protocol::JSONRPCMessage` (re-exported from `jsonrpc_lite.rs`), not `protocol::ClientMessage`; its variants are `Request`, `Notification`, `Response`, and `Error`. The real processor signatures include `ConnectionId`, `AppServerTransport`, and `Arc<ConnectionSessionState>`.
```rust
use std::collections::HashSet;
use std::sync::Arc;
use std::sync::atomic::AtomicBool;

use codex_app_server_protocol::JSONRPCMessage;

pub(crate) struct AppServerConnectionRouter {
    connection_id: ConnectionId,
    processor: Arc<MessageProcessor>,
    transport: AppServerTransport,
    session: Arc<ConnectionSessionState>,
    outbound_initialized: Arc<AtomicBool>,
    outbound_experimental_api_enabled: Arc<AtomicBool>,
    outbound_opted_out_notification_methods: Arc<RwLock<HashSet<String>>>,
}
impl AppServerConnectionRouter {
    pub(crate) async fn process_jsonrpc_text(&self, text: String) -> anyhow::Result<()> {
        match serde_json::from_str::<JSONRPCMessage>(&text) {
            Ok(JSONRPCMessage::Request(request)) => {
                let was_initialized = self.session.initialized();
                self.processor
                    .process_request(
                        self.connection_id,
                        request,
                        &self.transport,
                        Arc::clone(&self.session),
                    )
                    .await;
                if let Ok(mut opted_out) = self.outbound_opted_out_notification_methods.write() {
                    *opted_out = self.session.opted_out_notification_methods();
                } else {
                    tracing::warn!("failed to update GUI outbound opted-out notifications");
                }
                self.outbound_experimental_api_enabled.store(
                    self.session.experimental_api_enabled(),
                    std::sync::atomic::Ordering::Release,
                );
                if !was_initialized && self.session.initialized() {
                    self.processor
                        .send_initialize_notifications_to_connection(self.connection_id)
                        .await;
                    self.processor.connection_initialized(self.connection_id).await;
                    self.outbound_initialized.store(true, std::sync::atomic::Ordering::Release);
                }
            }
            Ok(JSONRPCMessage::Response(response)) => {
                self.processor.process_response(response).await;
            }
            Ok(JSONRPCMessage::Notification(notification)) => {
                self.processor.process_notification(notification).await;
            }
            Ok(JSONRPCMessage::Error(err)) => {
                self.processor.process_error(err).await;
            }
            Err(err) => tracing::warn!(?err, "failed to parse GUI JSON-RPC message"),
        }
        Ok(())
    }
}
impl crate::gui_host::GuiConnectionRouter for AppServerConnectionRouter {
    async fn incoming_text(&self, text: String) -> anyhow::Result<()> {
        self.process_jsonrpc_text(text).await
    }
}
```
When a GUI websocket closes, call `processor.connection_closed(connection_id, &session).await` from the GUI websocket task after the read/write loop ends, matching the app-server connection cleanup path rather than adding TUI-side cleanup.
- [ ] **Step 4: Run test to confirm PASS**
Run from `codex-rs`:
```bash
cargo test -p codex-app-server gui_host::tests::authenticated_allowed_request_reaches_router
```
Expected output:
```text
test gui_host::tests::authenticated_allowed_request_reaches_router ... ok
```
- [ ] **Step 5: Commit**
```bash
git add codex-rs/app-server/src/gui_host.rs codex-rs/app-server/src/lib.rs
git commit -m "feat(app-server): route authenticated GUI messages"
```
### Task 11: Prod mode serves CODEX_GUI_PACKAGE_ROOT dist
**Files:**
- Modify: `codex-rs/app-server/src/gui_host.rs`
- Modify: `codex-cli/bin/codex.js`
- Modify: `codex-cli/scripts/build_npm_package.py`
- Test: `codex-rs/app-server/src/gui_host.rs`
- [ ] **Step 1: Write a failing test**
```rust
#[tokio::test]
async fn prod_serves_index_html_from_package_dist() {
    let tempdir = tempfile::tempdir().unwrap();
    let dist = tempdir.path().join("dist");
    std::fs::create_dir(&dist).unwrap();
    std::fs::write(dist.join("index.html"), "<main>Codex GUI</main>").unwrap();
    std::fs::create_dir(dist.join("assets")).unwrap();
    std::fs::write(dist.join("assets/app.js"), "console.log('codex gui');").unwrap();
    let handle = GuiHost::start(GuiHostConfig {
        mode: GuiHostMode::Prod(ProdAssetConfig { package_root: tempdir.path().to_path_buf() }),
    }).await.unwrap();
    let response = reqwest::get(handle.base_url()).await.unwrap();
    assert_eq!(response.status(), reqwest::StatusCode::OK);
    assert_eq!(response.text().await.unwrap(), "<main>Codex GUI</main>");
    let asset = reqwest::get(format!("{}/assets/app.js", handle.base_url())).await.unwrap();
    assert_eq!(asset.status(), reqwest::StatusCode::OK);
    assert_eq!(asset.text().await.unwrap(), "console.log('codex gui');");
    handle.shutdown().await;
}
```
- [ ] **Step 2: Run the test to confirm FAIL**
Run from `codex-rs`:
```bash
cargo test -p codex-app-server gui_host::tests::prod_serves_index_html_from_package_dist
```
Expected error output:
```text
assertion `left == right` failed
left: "Codex GUI Host"
right: "<main>Codex GUI</main>"
```
- [ ] **Step 3: Write minimal implementation to make test pass**
```rust
fn prod_dist_dir(config: &ProdAssetConfig) -> anyhow::Result<std::path::PathBuf> {
    let dist = config.package_root.join("dist");
    if !dist.is_dir() { anyhow::bail!("GUI dist directory is missing: {}", dist.display()); }
    Ok(dist)
}
async fn serve_root(State(state): State<Arc<GuiHostState>>) -> Result<axum::response::Response, (axum::http::StatusCode, String)> {
    match &state.mode {
        GuiHostMode::Prod(config) => {
            let html = tokio::fs::read_to_string(prod_dist_dir(config).map_err(internal_server_error)?.join("index.html"))
                .await
                .map_err(|err| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, err.to_string()))?;
            Ok(axum::response::Html(html).into_response())
        }
        GuiHostMode::Dev(_) => Ok("Codex GUI Host".into_response()),
    }
}
fn internal_server_error(err: anyhow::Error) -> (axum::http::StatusCode, String) {
    (axum::http::StatusCode::INTERNAL_SERVER_ERROR, err.to_string())
}
fn prod_router(state: Arc<GuiHostState>, dist: std::path::PathBuf) -> Router {
    Router::new()
        .route("/ws", get(GuiHost::ws_handler))
        .nest_service("/assets", tower_http::services::ServeDir::new(dist.join("assets")))
        .fallback_service(tower_http::services::ServeDir::new(dist).append_index_html_on_directories(true))
        .with_state(state)
}
```
Use `serve_root` for `/` and `tower_http::services::ServeDir` as the fallback service for the entire `$CODEX_GUI_PACKAGE_ROOT/dist/` tree so Vite-built `/assets/**` files are served by the same origin. Add `tower-http` at first use because the preflight grep shows it is not pinned:
```toml
[workspace.dependencies]
tower-http = { version = "0.6", features = ["fs"] }

[dependencies]
tower-http = { workspace = true }
```
Set the package root in `codex-cli/bin/codex.js`:
```javascript
const guiPackageRoot = path.join(vendorRoot, "codex-gui");
const env = { ...process.env, PATH: updatedPath, CODEX_GUI_PACKAGE_ROOT: guiPackageRoot };
```
In `codex-cli/scripts/build_npm_package.py`, copy `codex-gui/dist` into the package root path used above:
```python
copytree(repo_root / "codex-gui" / "dist", package_root / "codex-gui" / "dist")
```
- [ ] **Step 4: Run test to confirm PASS**
Run from `codex-rs`:
```bash
cargo test -p codex-app-server gui_host::tests::prod_serves_index_html_from_package_dist
node --check ../codex-cli/bin/codex.js
node -e "const path=require('node:path'); const vendorRoot=process.cwd(); const env={...process.env, CODEX_GUI_PACKAGE_ROOT:path.join(vendorRoot,'codex-gui')}; if (!env.CODEX_GUI_PACKAGE_ROOT) process.exit(1); console.log(env.CODEX_GUI_PACKAGE_ROOT)"
```
Expected output:
```text
test gui_host::tests::prod_serves_index_html_from_package_dist ... ok
.../codex-gui
```
- [ ] **Step 5: Commit**
```bash
git add codex-rs/Cargo.toml codex-rs/app-server/Cargo.toml codex-rs/app-server/src/gui_host.rs codex-cli/bin/codex.js codex-cli/scripts/build_npm_package.py
git commit -m "feat(app-server): serve packaged GUI assets"
```
### Task 12: Dev mode proxies Vite and keeps HMR on Vite
**Files:**
- Modify: `codex-rs/app-server/src/gui_host.rs`
- Modify: `codex-gui/vite.config.ts`
- Test: `codex-rs/app-server/src/gui_host.rs`
- [ ] **Step 1: Write a failing test**
```rust
#[test]
fn dev_uses_default_vite_origin() {
    assert_eq!(DevAssetProxyConfig::default().vite_origin, "http://127.0.0.1:5173");
}
#[tokio::test]
async fn dev_proxies_all_non_ws_paths_to_vite() {
    let vite = axum::Router::new()
        .route("/", axum::routing::get(|| async { "<main>Vite</main>" }))
        .route("/assets/app.js", axum::routing::get(|| async { "console.log('vite');" }));
    let listener = tokio::net::TcpListener::bind(("127.0.0.1", 0)).await.unwrap();
    let vite_addr = listener.local_addr().unwrap();
    let vite_task = tokio::spawn(async move {
        axum::serve(listener, vite).await.unwrap();
    });
    let handle = GuiHost::start(GuiHostConfig {
        mode: GuiHostMode::Dev(DevAssetProxyConfig { vite_origin: format!("http://{vite_addr}") }),
    }).await.unwrap();
    let root = reqwest::get(handle.base_url()).await.unwrap();
    assert_eq!(root.status(), reqwest::StatusCode::OK);
    assert_eq!(root.text().await.unwrap(), "<main>Vite</main>");
    let asset = reqwest::get(format!("{}/assets/app.js", handle.base_url())).await.unwrap();
    assert_eq!(asset.status(), reqwest::StatusCode::OK);
    assert_eq!(asset.text().await.unwrap(), "console.log('vite');");
    handle.shutdown().await;
    vite_task.abort();
}
#[tokio::test]
async fn dev_proxy_error_names_vite_origin() {
    let handle = GuiHost::start(GuiHostConfig {
        mode: GuiHostMode::Dev(DevAssetProxyConfig { vite_origin: "http://127.0.0.1:9".to_string() }),
    }).await.unwrap();
    let response = reqwest::get(handle.base_url()).await.unwrap();
    assert_eq!(response.status(), reqwest::StatusCode::BAD_GATEWAY);
    assert!(response.text().await.unwrap().contains("Start Vite at http://127.0.0.1:9"));
    handle.shutdown().await;
}
```
- [ ] **Step 2: Run the test to confirm FAIL**
Run from `codex-rs`:
```bash
cargo test -p codex-app-server gui_host::tests::dev_proxies_all_non_ws_paths_to_vite gui_host::tests::dev_proxy_error_names_vite_origin
```
Expected error output:
```text
assertion `left == right` failed
left: 200
right: 502
```
- [ ] **Step 3: Write minimal implementation to make test pass**
Change the dev arm in `serve_root` and the router fallback so every non-`/ws` request is proxied to Vite with the original path and query. Do not proxy the Vite HMR websocket: HMR remains a direct connection from browser to `ws://127.0.0.1:5173` as configured in `codex-gui/vite.config.ts`.
```rust
async fn proxy_vite(
    State(state): State<Arc<GuiHostState>>,
    uri: axum::http::Uri,
) -> Result<axum::response::Response, (axum::http::StatusCode, String)> {
    let GuiHostMode::Dev(config) = &state.mode else {
        return serve_root(State(state)).await;
    };
    let path_and_query = uri.path_and_query().map(|pq| pq.as_str()).unwrap_or("/");
    let url = format!("{}{}", config.vite_origin.trim_end_matches('/'), path_and_query);
    let response = reqwest::get(&url).await.map_err(|_| {
        (axum::http::StatusCode::BAD_GATEWAY, format!("Start Vite at {}", config.vite_origin))
    })?;
    let status = response.status();
    let content_type = response.headers().get(axum::http::header::CONTENT_TYPE).cloned();
    let body = response.bytes().await.map_err(|err| {
        (axum::http::StatusCode::BAD_GATEWAY, format!("Failed to read Vite response from {}: {err}", config.vite_origin))
    })?;
    let mut builder = axum::response::Response::builder().status(status);
    if let Some(content_type) = content_type {
        builder = builder.header(axum::http::header::CONTENT_TYPE, content_type);
    }
    builder
        .body(axum::body::Body::from(body))
        .map_err(|err| (axum::http::StatusCode::BAD_GATEWAY, err.to_string()))
}
fn dev_router(state: Arc<GuiHostState>) -> Router {
    Router::new()
        .route("/ws", get(GuiHost::ws_handler))
        .fallback(get(proxy_vite))
        .with_state(state)
}
```
Set `codex-gui/vite.config.ts`:
```typescript
export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    hmr: { protocol: "ws", host: "127.0.0.1", port: 5173 },
  },
});
```
- [ ] **Step 4: Run test to confirm PASS**
Run from `codex-rs` and repo root:
```bash
cargo test -p codex-app-server gui_host::tests::dev_proxies_all_non_ws_paths_to_vite gui_host::tests::dev_proxy_error_names_vite_origin
pnpm -C ../codex-gui run type-check
```
Expected output:
```text
test gui_host::tests::dev_proxies_all_non_ws_paths_to_vite ... ok
test gui_host::tests::dev_proxy_error_names_vite_origin ... ok
```
- [ ] **Step 5: Commit**
```bash
git add codex-rs/app-server/src/gui_host.rs codex-gui/vite.config.ts
git commit -m "feat(app-server): proxy GUI dev assets"
```
### Task 13: TUI registers /gui and emits OpenGui
**Files:**
- Modify: `codex-rs/tui/src/slash_command.rs`
- Modify: `codex-rs/tui/src/chatwidget/slash_dispatch.rs`
- Modify: `codex-rs/tui/src/app_event.rs`
- Test: `codex-rs/tui/src/chatwidget/tests/slash_commands.rs`
- [ ] **Step 1: Write a failing test**
```rust
#[test]
fn gui_slash_command_is_registered() {
    use std::str::FromStr;
    assert_eq!(SlashCommand::from_str("gui").unwrap(), SlashCommand::Gui);
    assert!(SlashCommand::Gui.description().contains("Open GUI"));
    assert!(SlashCommand::Gui.is_visible());
}
```
- [ ] **Step 2: Run the test to confirm FAIL**
Run from `codex-rs`:
```bash
cargo test -p codex-tui gui_slash_command_is_registered
```
Expected error output:
```text
error[E0599]: no variant or associated item named `Gui` found for enum `SlashCommand`
```
- [ ] **Step 3: Write minimal implementation to make test pass**
```rust
#[derive(
    Debug, Clone, Copy, PartialEq, Eq, Hash, EnumString, EnumIter, AsRefStr, IntoStaticStr,
)]
#[strum(serialize_all = "kebab-case")]
pub enum SlashCommand {
    // DO NOT ALPHA-SORT! Enum order is presentation order in the popup, so
    // more frequently used commands should be listed first.
    Model,
    Fast,
    Ide,
    Gui,
    Permissions,
    Keymap,
    Vim,
    #[strum(serialize = "setup-default-sandbox")]
    ElevateSandbox,
    #[strum(serialize = "sandbox-add-read-dir")]
    SandboxReadRoot,
    Experimental,
    #[strum(to_string = "approve")]
    AutoReview,
    Memories,
    Skills,
    Hooks,
    Review,
    Rename,
    New,
    Resume,
    Fork,
    Init,
    Compact,
    Plan,
    Goal,
    Collab,
    Agent,
    Side,
    Copy,
    Raw,
    Diff,
    Mention,
    Status,
    DebugConfig,
    Title,
    Statusline,
    Theme,
    Mcp,
    Apps,
    Plugins,
    Logout,
    Quit,
    Exit,
    Feedback,
    Rollout,
    Ps,
    #[strum(to_string = "stop", serialize = "clean")]
    Stop,
    Clear,
    Personality,
    Realtime,
    Settings,
    TestApproval,
    #[strum(serialize = "subagents")]
    MultiAgents,
    #[strum(serialize = "debug-m-drop")]
    MemoryDrop,
    #[strum(serialize = "debug-m-update")]
    MemoryUpdate,
}
```
`FromStr` remains generated by the existing `EnumString` derive and `#[strum(serialize_all = "kebab-case")]`, so adding `Gui` makes `SlashCommand::from_str("gui")` work without a manual parser.

Update `description` with the complete current match:
```rust
pub fn description(self) -> &'static str {
    match self {
        SlashCommand::Feedback => "send logs to maintainers",
        SlashCommand::New => "start a new chat during a conversation",
        SlashCommand::Init => "create an AGENTS.md file with instructions for Codex",
        SlashCommand::Compact => "summarize conversation to prevent hitting the context limit",
        SlashCommand::Review => "review my current changes and find issues",
        SlashCommand::Rename => "rename the current thread",
        SlashCommand::Resume => "resume a saved chat",
        SlashCommand::Clear => "clear the terminal and start a new chat",
        SlashCommand::Fork => "fork the current chat",
        SlashCommand::Quit | SlashCommand::Exit => "exit Codex",
        SlashCommand::Copy => "copy last response as markdown",
        SlashCommand::Raw => "toggle raw scrollback mode for copy-friendly terminal selection",
        SlashCommand::Diff => "show git diff (including untracked files)",
        SlashCommand::Mention => "mention a file",
        SlashCommand::Skills => "use skills to improve how Codex performs specific tasks",
        SlashCommand::Hooks => "view and manage lifecycle hooks",
        SlashCommand::Status => "show current session configuration and token usage",
        SlashCommand::DebugConfig => "show config layers and requirement sources for debugging",
        SlashCommand::Title => "configure which items appear in the terminal title",
        SlashCommand::Statusline => "configure which items appear in the status line",
        SlashCommand::Theme => "choose a syntax highlighting theme",
        SlashCommand::Ps => "list background terminals",
        SlashCommand::Stop => "stop all background terminals",
        SlashCommand::MemoryDrop => "DO NOT USE",
        SlashCommand::MemoryUpdate => "DO NOT USE",
        SlashCommand::Model => "choose what model and reasoning effort to use",
        SlashCommand::Fast => {
            "toggle Fast mode to enable fastest inference with increased plan usage"
        }
        SlashCommand::Ide => {
            "include current selection, open files, and other context from your IDE"
        }
        SlashCommand::Gui => "Open GUI for the primary thread",
        SlashCommand::Personality => "choose a communication style for Codex",
        SlashCommand::Realtime => "toggle realtime voice mode (experimental)",
        SlashCommand::Settings => "configure realtime microphone/speaker",
        SlashCommand::Plan => "switch to Plan mode",
        SlashCommand::Goal => "set or view the goal for a long-running task",
        SlashCommand::Collab => "change collaboration mode (experimental)",
        SlashCommand::Agent | SlashCommand::MultiAgents => "switch the active agent thread",
        SlashCommand::Side => "start a side conversation in an ephemeral fork",
        SlashCommand::Permissions => "choose what Codex is allowed to do",
        SlashCommand::Keymap => "remap TUI shortcuts",
        SlashCommand::Vim => "toggle Vim mode for the composer",
        SlashCommand::ElevateSandbox => "set up elevated agent sandbox",
        SlashCommand::SandboxReadRoot => {
            "let sandbox read a directory: /sandbox-add-read-dir <absolute_path>"
        }
        SlashCommand::Experimental => "toggle experimental features",
        SlashCommand::AutoReview => "approve one retry of a recent auto-review denial",
        SlashCommand::Memories => "configure memory use and generation",
        SlashCommand::Mcp => "list configured MCP tools; use /mcp verbose for details",
        SlashCommand::Apps => "manage apps",
        SlashCommand::Plugins => "browse plugins",
        SlashCommand::Logout => "log out of Codex",
        SlashCommand::Rollout => "print the rollout file path",
        SlashCommand::TestApproval => "test approval request",
    }
}
```

Update `is_visible` with the complete current match:
```rust
fn is_visible(self) -> bool {
    match self {
        SlashCommand::SandboxReadRoot => cfg!(target_os = "windows"),
        SlashCommand::Copy => !cfg!(target_os = "android"),
        SlashCommand::Rollout | SlashCommand::TestApproval => cfg!(debug_assertions),
        SlashCommand::Gui
        | SlashCommand::Feedback
        | SlashCommand::New
        | SlashCommand::Init
        | SlashCommand::Compact
        | SlashCommand::Review
        | SlashCommand::Rename
        | SlashCommand::Resume
        | SlashCommand::Clear
        | SlashCommand::Fork
        | SlashCommand::Quit
        | SlashCommand::Exit
        | SlashCommand::Raw
        | SlashCommand::Diff
        | SlashCommand::Mention
        | SlashCommand::Skills
        | SlashCommand::Hooks
        | SlashCommand::Status
        | SlashCommand::DebugConfig
        | SlashCommand::Title
        | SlashCommand::Statusline
        | SlashCommand::Theme
        | SlashCommand::Ps
        | SlashCommand::Stop
        | SlashCommand::MemoryDrop
        | SlashCommand::MemoryUpdate
        | SlashCommand::Model
        | SlashCommand::Fast
        | SlashCommand::Ide
        | SlashCommand::Personality
        | SlashCommand::Realtime
        | SlashCommand::Settings
        | SlashCommand::Plan
        | SlashCommand::Goal
        | SlashCommand::Collab
        | SlashCommand::Agent
        | SlashCommand::MultiAgents
        | SlashCommand::Side
        | SlashCommand::Permissions
        | SlashCommand::Keymap
        | SlashCommand::Vim
        | SlashCommand::ElevateSandbox
        | SlashCommand::Experimental
        | SlashCommand::AutoReview
        | SlashCommand::Memories
        | SlashCommand::Mcp
        | SlashCommand::Apps
        | SlashCommand::Plugins
        | SlashCommand::Logout => true,
    }
}
```

Add `OpenGui` to `codex-rs/tui/src/app_event.rs` immediately after `OpenAgentPicker`:
```rust
#[derive(Debug)]
pub(crate) enum AppEvent {
    /// Open the agent picker for switching active threads.
    OpenAgentPicker,
    /// Open the browser GUI for the primary thread.
    OpenGui,
    /// Switch the active thread to the selected agent.
    SelectAgentThread(ThreadId),
}
```

Update the complete `ChatWidget::dispatch_command` match in `codex-rs/tui/src/chatwidget/slash_dispatch.rs` by inserting `SlashCommand::Gui` and keeping all current real branches:
```rust
match cmd {
    SlashCommand::Feedback => {
        if !self.config.feedback_enabled {
            let params = crate::bottom_pane::feedback_disabled_params();
            self.bottom_pane.show_selection_view(params);
            self.request_redraw();
            return;
        }
        let params = crate::bottom_pane::feedback_selection_params(self.app_event_tx.clone());
        self.bottom_pane.show_selection_view(params);
        self.request_redraw();
    }
    SlashCommand::New => {
        self.app_event_tx.send(AppEvent::NewSession);
    }
    SlashCommand::Clear => {
        self.app_event_tx.send(AppEvent::ClearUi);
    }
    SlashCommand::Resume => {
        self.app_event_tx.send(AppEvent::OpenResumePicker);
    }
    SlashCommand::Fork => {
        self.app_event_tx.send(AppEvent::ForkCurrentSession);
    }
    SlashCommand::Init => {
        let init_target = self.config.cwd.join(DEFAULT_AGENTS_MD_FILENAME);
        if init_target.exists() {
            let message = format!(
                "{DEFAULT_AGENTS_MD_FILENAME} already exists here. Skipping /init to avoid overwriting it."
            );
            self.add_info_message(message, /*hint*/ None);
            return;
        }
        const INIT_PROMPT: &str = include_str!("../../prompt_for_init_command.md");
        self.submit_user_message(INIT_PROMPT.to_string().into());
    }
    SlashCommand::Compact => {
        self.clear_token_usage();
        if !self.bottom_pane.is_task_running() {
            self.bottom_pane.set_task_running(/*running*/ true);
        }
        self.app_event_tx.compact();
    }
    SlashCommand::Review => {
        self.open_review_popup();
    }
    SlashCommand::Rename => {
        self.session_telemetry
            .counter("codex.thread.rename", /*inc*/ 1, &[]);
        self.show_rename_prompt();
    }
    SlashCommand::Model => {
        self.open_model_popup();
    }
    SlashCommand::Fast => {
        self.toggle_fast_mode_from_ui();
    }
    SlashCommand::Realtime => {
        if !self.realtime_conversation_enabled() {
            return;
        }
        if self.realtime_conversation.is_live() {
            self.stop_realtime_conversation_from_ui();
        } else {
            self.start_realtime_conversation();
        }
    }
    SlashCommand::Settings => {
        if !self.realtime_audio_device_selection_enabled() {
            return;
        }
        self.open_realtime_audio_popup();
    }
    SlashCommand::Personality => {
        self.open_personality_popup();
    }
    SlashCommand::Plan => {
        self.apply_plan_slash_command();
    }
    SlashCommand::Goal => {
        if !self.config.features.enabled(Feature::Goals) {
            return;
        }
        if let Some(thread_id) = self.thread_id {
            self.app_event_tx
                .send(AppEvent::OpenThreadGoalMenu { thread_id });
        } else {
            self.add_info_message(
                GOAL_USAGE.to_string(),
                Some(GOAL_USAGE_HINT.to_string()),
            );
        }
    }
    SlashCommand::Collab => {
        if !self.collaboration_modes_enabled() {
            self.add_info_message(
                "Collaboration modes are disabled.".to_string(),
                Some("Enable collaboration modes to use /collab.".to_string()),
            );
            return;
        }
        self.open_collaboration_modes_popup();
    }
    SlashCommand::Side => {
        self.request_empty_side_conversation();
    }
    SlashCommand::Agent | SlashCommand::MultiAgents => {
        self.app_event_tx.send(AppEvent::OpenAgentPicker);
    }
    SlashCommand::Permissions => {
        self.open_permissions_popup();
    }
    SlashCommand::Vim => {
        self.toggle_vim_mode_and_notify();
    }
    SlashCommand::Keymap => {
        self.open_keymap_picker();
    }
    SlashCommand::ElevateSandbox => {
        #[cfg(target_os = "windows")]
        {
            let windows_sandbox_level = WindowsSandboxLevel::from_config(&self.config);
            let windows_degraded_sandbox_enabled =
                matches!(windows_sandbox_level, WindowsSandboxLevel::RestrictedToken);
            if !windows_degraded_sandbox_enabled
                || !crate::legacy_core::windows_sandbox::ELEVATED_SANDBOX_NUX_ENABLED
            {
                return;
            }
            let Some(preset) = builtin_approval_presets()
                .into_iter()
                .find(|preset| preset.id == "auto")
            else {
                self.add_error_message(
                    "Internal error: missing the 'auto' approval preset.".to_string(),
                );
                return;
            };
            if let Err(err) = self
                .config
                .permissions
                .approval_policy
                .can_set(&preset.approval)
            {
                self.add_error_message(err.to_string());
                return;
            }
            self.session_telemetry.counter(
                "codex.windows_sandbox.setup_elevated_sandbox_command",
                /*inc*/ 1,
                &[],
            );
            self.app_event_tx
                .send(AppEvent::BeginWindowsSandboxElevatedSetup { preset });
        }
        #[cfg(not(target_os = "windows"))]
        {
            let _ = &self.session_telemetry;
        }
    }
    SlashCommand::SandboxReadRoot => {
        self.add_error_message(
            "Usage: /sandbox-add-read-dir <absolute-directory-path>".to_string(),
        );
    }
    SlashCommand::Experimental => {
        self.open_experimental_popup();
    }
    SlashCommand::AutoReview => {
        self.open_auto_review_denials_popup();
    }
    SlashCommand::Memories => {
        self.open_memories_popup();
    }
    SlashCommand::Quit | SlashCommand::Exit => {
        self.request_quit_without_confirmation();
    }
    SlashCommand::Logout => {
        self.app_event_tx.send(AppEvent::Logout);
    }
    SlashCommand::Copy => {
        self.copy_last_agent_markdown();
    }
    SlashCommand::Raw => {
        let enabled = self.toggle_raw_output_mode_and_notify();
        self.emit_raw_output_mode_changed(enabled);
    }
    SlashCommand::Diff => {
        self.add_diff_in_progress();
        let tx = self.app_event_tx.clone();
        let runner = self.workspace_command_runner.clone();
        let cwd = self
            .current_cwd
            .clone()
            .unwrap_or_else(|| self.config.cwd.to_path_buf());
        tokio::spawn(async move {
            let text = match runner {
                Some(runner) => match get_git_diff(runner.as_ref(), &cwd).await {
                    Ok((is_git_repo, diff_text)) => {
                        if is_git_repo {
                            diff_text
                        } else {
                            "`/diff` — _not inside a git repository_".to_string()
                        }
                    }
                    Err(e) => format!("Failed to compute diff: {e}"),
                },
                None => "Failed to compute diff: workspace command runner unavailable".to_string(),
            };
            tx.send(AppEvent::DiffResult(text));
        });
    }
    SlashCommand::Mention => {
        self.insert_str("@");
    }
    SlashCommand::Skills => {
        self.open_skills_menu();
    }
    SlashCommand::Hooks => {
        self.add_hooks_output();
    }
    SlashCommand::Status => {
        if self.should_prefetch_rate_limits() {
            let request_id = self.next_status_refresh_request_id;
            self.next_status_refresh_request_id =
                self.next_status_refresh_request_id.wrapping_add(1);
            self.add_status_output(/*refreshing_rate_limits*/ true, Some(request_id));
            self.app_event_tx.send(AppEvent::RefreshRateLimits {
                origin: RateLimitRefreshOrigin::StatusCommand { request_id },
            });
        } else {
            self.add_status_output(/*refreshing_rate_limits*/ false, /*request_id*/ None);
        }
    }
    SlashCommand::Ide => {
        self.handle_ide_command();
    }
    SlashCommand::Gui => {
        self.app_event_tx.send(AppEvent::OpenGui);
    }
    SlashCommand::DebugConfig => {
        self.add_debug_config_output();
    }
    SlashCommand::Title => {
        self.open_terminal_title_setup();
    }
    SlashCommand::Statusline => {
        self.open_status_line_setup();
    }
    SlashCommand::Theme => {
        self.open_theme_picker();
    }
    SlashCommand::Ps => {
        self.add_ps_output();
    }
    SlashCommand::Stop => {
        self.clean_background_terminals();
    }
    SlashCommand::MemoryDrop => {
        self.add_app_server_stub_message("Memory maintenance");
    }
    SlashCommand::MemoryUpdate => {
        self.add_app_server_stub_message("Memory maintenance");
    }
    SlashCommand::Mcp => {
        self.add_mcp_output(McpServerStatusDetail::ToolsAndAuthOnly);
    }
    SlashCommand::Apps => {
        self.add_connectors_output();
    }
    SlashCommand::Plugins => {
        self.add_plugins_output();
    }
    SlashCommand::Rollout => {
        if let Some(path) = self.rollout_path() {
            self.add_info_message(
                format!("Current rollout path: {}", path.display()),
                /*hint*/ None,
            );
        } else {
            self.add_info_message(
                "Rollout path is not available yet.".to_string(),
                /*hint*/ None,
            );
        }
    }
    SlashCommand::TestApproval => {
        use std::collections::HashMap;
        use crate::approval_events::ApplyPatchApprovalRequestEvent;
        use crate::diff_model::FileChange;
        self.on_apply_patch_approval_request(
            "1".to_string(),
            ApplyPatchApprovalRequestEvent {
                call_id: "1".to_string(),
                turn_id: "turn-1".to_string(),
                changes: HashMap::from([
                    (
                        PathBuf::from("/tmp/test.txt"),
                        FileChange::Add { content: "test".to_string() },
                    ),
                    (
                        PathBuf::from("/tmp/test2.txt"),
                        FileChange::Update {
                            unified_diff: "+test\n-test2".to_string(),
                            move_path: None,
                        },
                    ),
                ]),
                reason: None,
                grant_root: Some(PathBuf::from("/tmp")),
            },
        );
    }
}
```
- [ ] **Step 4: Run test to confirm PASS**
Run from `codex-rs`:
```bash
cargo test -p codex-tui gui_slash_command_is_registered
```
Expected output:
```text
test chatwidget::tests::slash_commands::gui_slash_command_is_registered ... ok
```
- [ ] **Step 5: Commit**
```bash
git add codex-rs/tui/src/slash_command.rs codex-rs/tui/src/chatwidget/slash_dispatch.rs codex-rs/tui/src/app_event.rs codex-rs/tui/src/chatwidget/tests/slash_commands.rs
git commit -m "feat(tui): register gui slash command"
```
### Task 14: TUI opens primary_thread_id and reuses GuiHost
**Files:**
- Create: `codex-rs/tui/src/gui_opener.rs`
- Create: `codex-rs/tui/src/app/gui.rs`
- Modify: `codex-rs/tui/src/app.rs`
- Modify: `codex-rs/tui/src/app/thread_routing.rs`
- Test: `codex-rs/tui/src/app/tests.rs`
- [ ] **Step 1: Write a failing test**
```rust
#[tokio::test]
async fn gui_command_uses_primary_thread_id_and_reuses_host() {
    let opener = RecordingGuiOpener::default();
    let primary_thread_id = "00000000-0000-0000-0000-000000000001";
    let side_thread_id = "00000000-0000-0000-0000-000000000002";
    let mut app = test_app_with_threads(primary_thread_id, side_thread_id, opener.clone()).await;
    app.open_gui().await.unwrap();
    app.open_gui().await.unwrap();
    let opened = opener.opened_urls().await;
    assert_eq!(opened.len(), 2);
    assert!(opened[0].contains(primary_thread_id));
    assert!(!opened[0].contains(side_thread_id));
    assert_eq!(opened[0].split('#').next().unwrap(), opened[1].split('#').next().unwrap());
}
```
- [ ] **Step 2: Run the test to confirm FAIL**
Run from `codex-rs`:
```bash
cargo test -p codex-tui gui_command_uses_primary_thread_id_and_reuses_host
```
Expected error output:
```text
error[E0599]: no method named `open_gui` found for struct `App`
error[E0433]: failed to resolve: use of undeclared type `RecordingGuiOpener`
```
- [ ] **Step 3: Write minimal implementation to make test pass**
Create `gui_opener.rs`:
```rust
#[derive(Debug, thiserror::Error)]
pub(crate) enum OpenGuiError { #[error("failed to open browser: {0}")] CommandFailed(String) }
pub(crate) trait GuiOpener: Send + Sync { fn open(&self, url: &str) -> Result<(), OpenGuiError>; }
pub(crate) struct PlatformGuiOpener;
impl GuiOpener for PlatformGuiOpener {
    fn open(&self, url: &str) -> Result<(), OpenGuiError> {
        #[cfg(target_os = "macos")] let mut command = std::process::Command::new("open");
        #[cfg(target_os = "linux")] let mut command = std::process::Command::new("xdg-open");
        #[cfg(target_os = "windows")] let mut command = { let mut c = std::process::Command::new("cmd"); c.arg("/C").arg("start").arg(""); c };
        command.arg(url).spawn().map(|_| ()).map_err(|err| OpenGuiError::CommandFailed(err.to_string()))
    }
}
```
Create `app/gui.rs`:
```rust
use codex_app_server::gui_host::{DevAssetProxyConfig, GuiHost, GuiHostConfig, GuiHostHandle, GuiHostMode};
impl App {
    pub(crate) async fn open_gui(&mut self) -> anyhow::Result<()> {
        let Some(thread_id) = self.primary_thread_id() else {
            self.add_info_message(
                "Current session is not ready to open GUI.".to_string(),
                /*hint*/ None,
            );
            return Ok(());
        };
        let url = self.ensure_gui_host().await?.launch_url_for_thread(&thread_id);
        if let Err(err) = self.gui_opener.open(&url) {
            self.add_info_message(
                format!("Open this URL in a browser: {url}\n{err}"),
                /*hint*/ None,
            );
        }
        Ok(())
    }
    async fn ensure_gui_host(&mut self) -> anyhow::Result<&GuiHostHandle> {
        if self.gui_host.is_none() {
            self.gui_host = Some(GuiHost::start(GuiHostConfig {
                mode: GuiHostMode::Dev(DevAssetProxyConfig::default()),
            }).await?);
        }
        Ok(self.gui_host.as_ref().unwrap())
    }
    pub(crate) async fn shutdown_gui_host(&mut self) {
        if let Some(handle) = self.gui_host.take() {
            handle.shutdown().await;
        }
    }
}
```
Add `gui_host: Option<GuiHostHandle>`, `gui_opener: Box<dyn GuiOpener>`, a `primary_thread_id()` accessor, and this test opener:
```rust
// In codex-rs/tui/src/app.rs App fields:
gui_host: Option<GuiHostHandle>,
gui_opener: Box<dyn GuiOpener>,

// In the real App::run Self initializer:
let mut app = Self {
    model_catalog,
    session_telemetry: session_telemetry.clone(),
    app_event_tx,
    chat_widget,
    workspace_command_runner: Some(workspace_command_runner),
    config,
    state_db,
    active_profile,
    cli_kv_overrides,
    harness_overrides,
    runtime_approval_policy_override: None,
    runtime_permission_profile_override: None,
    file_search,
    enhanced_keys_supported,
    keymap: runtime_keymap,
    transcript_cells: Vec::new(),
    overlay: None,
    deferred_history_lines: Vec::new(),
    has_emitted_history_lines: false,
    transcript_reflow: TranscriptReflowState::default(),
    initial_history_replay_buffer: None,
    commit_anim_running: Arc::new(AtomicBool::new(false)),
    status_line_invalid_items_warned: status_line_invalid_items_warned.clone(),
    terminal_title_invalid_items_warned: terminal_title_invalid_items_warned.clone(),
    backtrack: BacktrackState::default(),
    backtrack_render_pending: false,
    feedback: feedback.clone(),
    feedback_audience,
    environment_manager,
    remote_app_server_url,
    remote_app_server_auth_token,
    pending_update_action: None,
    pending_shutdown_exit_thread_id: None,
    windows_sandbox: WindowsSandboxState::default(),
    thread_event_channels: HashMap::new(),
    thread_event_listener_tasks: HashMap::new(),
    agent_navigation: AgentNavigationState::default(),
    side_threads: HashMap::new(),
    active_thread_id: None,
    active_thread_rx: None,
    primary_thread_id: None,
    last_subagent_backfill_attempt: None,
    primary_session_configured: None,
    pending_primary_events: VecDeque::new(),
    pending_app_server_requests: PendingAppServerRequests::default(),
    pending_plugin_enabled_writes: HashMap::new(),
    pending_hook_enabled_writes: HashMap::new(),
    gui_host: None,
    gui_opener: Box::new(PlatformGuiOpener),
};

// In codex-rs/tui/src/app/thread_routing.rs:
impl App {
    pub(crate) fn primary_thread_id(&self) -> Option<ThreadId> {
        self.primary_thread_id
    }
}

// In codex-rs/tui/src/app/test_support.rs and codex-rs/tui/src/app/tests.rs,
// update every existing App { ... } test fixture initializer, including
// make_test_app() and make_test_app_with_channels(), with:
gui_host: None,
gui_opener: Box::new(PlatformGuiOpener),

// In codex-rs/tui/src/app/tests.rs, use the existing async make_test_app()
// helper instead of adding another App fixture constructor:
async fn test_app_with_threads(
    primary_thread_id: &str,
    active_thread_id: &str,
    opener: RecordingGuiOpener,
) -> App {
    let mut app = make_test_app().await;
    app.set_primary_thread_id_for_test(ThreadId::from_string(primary_thread_id).unwrap());
    app.set_active_thread_id_for_test(ThreadId::from_string(active_thread_id).unwrap());
    app.gui_opener = Box::new(opener);
    app
}

#[derive(Clone, Default)]
struct RecordingGuiOpener {
    opened: std::sync::Arc<std::sync::Mutex<Vec<String>>>,
}
impl GuiOpener for RecordingGuiOpener {
    fn open(&self, url: &str) -> Result<(), OpenGuiError> {
        self.opened.lock().unwrap().push(url.to_string());
        Ok(())
    }
}
impl RecordingGuiOpener {
    async fn opened_urls(&self) -> Vec<String> { self.opened.lock().unwrap().clone() }
}

#[cfg(test)]
impl App {
    fn set_primary_thread_id_for_test(&mut self, thread_id: ThreadId) {
        self.primary_thread_id = Some(thread_id);
    }

    fn set_active_thread_id_for_test(&mut self, thread_id: ThreadId) {
        self.active_thread_id = Some(thread_id);
    }
}
```
- [ ] **Step 4: Run test to confirm PASS**
Run from `codex-rs`:
```bash
cargo test -p codex-tui gui_command_uses_primary_thread_id_and_reuses_host
```
Expected output:
```text
test app::tests::gui_command_uses_primary_thread_id_and_reuses_host ... ok
```
- [ ] **Step 5: Commit**
```bash
git add codex-rs/tui/src/gui_opener.rs codex-rs/tui/src/app/gui.rs codex-rs/tui/src/app.rs codex-rs/tui/src/app/thread_routing.rs codex-rs/tui/src/app/tests.rs
git commit -m "feat(tui): open GUI for primary thread"
```
### Task 15: TUI shuts down GuiHost with the session
**Files:**
- Modify: `codex-rs/tui/src/app/gui.rs`
- Modify: `codex-rs/tui/src/app.rs`
- Test: `codex-rs/tui/src/app/tests.rs`
- [ ] **Step 1: Write a failing test**
```rust
#[tokio::test]
async fn shutdown_gui_host_stops_ws_and_server_task() {
    let opener = RecordingGuiOpener::default();
    let mut app = test_app_with_threads(
        "00000000-0000-0000-0000-000000000001",
        "00000000-0000-0000-0000-000000000002",
        opener,
    )
    .await;
    app.open_gui().await.unwrap();
    let addr = app.gui_host.as_ref().unwrap().local_addr();
    app.shutdown_gui_host().await;
    assert!(app.gui_host.is_none());
    let ws_url = format!("ws://{addr}/ws");
    assert!(tokio_tungstenite::connect_async(ws_url).await.is_err());
}
```
- [ ] **Step 2: Run the test to confirm FAIL**
Run from `codex-rs`:
```bash
cargo test -p codex-tui shutdown_gui_host_stops_ws_and_server_task
```
Expected error output:
```text
error[E0599]: no method named `shutdown_gui_host` found for struct `App`
```
- [ ] **Step 3: Write minimal implementation to make test pass**
`App::shutdown_gui_host` was introduced in Task 14's `app/gui.rs`; wire it into every TUI exit path that returns from `App::run`, including normal exit and Ctrl-C/quit branches:
```rust
// Before returning from App::run after the app loop has decided to exit:
app.shutdown_gui_host().await;
app_server
    .shutdown()
    .await
    .inspect_err(|err| {
        tracing::warn!("app-server shutdown failed: {err}");
    })
    .ok();
return Ok(exit_info);
```
Keep `server_task` private. Put the websocket failure assertion in TUI and the `server_task.await` completion assertion in `codex-rs/app-server/src/gui_host.rs` as a focused unit test:
```rust
#[tokio::test]
async fn shutdown_completes_server_task_and_rejects_later_ws() {
    let handle = GuiHost::start(GuiHostConfig {
        mode: GuiHostMode::Dev(DevAssetProxyConfig::default()),
    })
    .await
    .unwrap();
    let addr = handle.local_addr();
    let mut handle = handle;
    if let Some(tx) = handle.shutdown_tx.take() { let _ = tx.send(()); }
    if let Some(server_task) = handle.server_task.take() {
        server_task.await.unwrap();
    } else {
        panic!("running GuiHost should have a server task");
    }
    assert!(tokio_tungstenite::connect_async(format!("ws://{addr}/ws")).await.is_err());
}
```
- [ ] **Step 4: Run test to confirm PASS**
Run from `codex-rs`:
```bash
cargo test -p codex-tui shutdown_gui_host_stops_ws_and_server_task
cargo test -p codex-app-server gui_host::tests::shutdown_completes_server_task_and_rejects_later_ws
```
Expected output:
```text
test app::tests::shutdown_gui_host_stops_ws_and_server_task ... ok
test gui_host::tests::shutdown_completes_server_task_and_rejects_later_ws ... ok
```
- [ ] **Step 5: Commit**
```bash
git add codex-rs/tui/src/app/gui.rs codex-rs/tui/src/app.rs codex-rs/tui/src/app/tests.rs codex-rs/app-server/src/gui_host.rs
git commit -m "feat(tui): shut down GUI host on exit"
```
### Task 16: Frontend reads launch params and clears fragment
**Files:**
- Create: `codex-gui/src/features/guiHost/guiHostClient.ts`
- Create: `codex-gui/src/features/guiHost/guiHostClient.test.ts`
- [ ] **Step 1: Write a failing test**
```typescript
import { describe, expect, it, vi } from "vitest";
import { clearLaunchTokenFragment, readLaunchParams } from "./guiHostClient";
describe("guiHostClient launch params", () => {
  it("reads thread id from query and token from fragment", () => {
    expect(readLaunchParams(new URL("http://127.0.0.1:4567/?threadId=thread-abc#token=secret"))).toEqual({
      threadId: "thread-abc",
      token: "secret",
    });
  });
  it("clears token fragment while preserving query", () => {
    const replaceState = vi.fn();
    clearLaunchTokenFragment(new URL("http://127.0.0.1:4567/?threadId=thread-abc#token=secret"), replaceState);
    expect(replaceState).toHaveBeenCalledWith(null, "", "/?threadId=thread-abc");
  });
});
```
- [ ] **Step 2: Run the test to confirm FAIL**
Run from repo root:
```bash
pnpm -C codex-gui run test -- src/features/guiHost/guiHostClient.test.ts
```
Expected error output:
```text
Failed to resolve import "./guiHostClient"
```
- [ ] **Step 3: Write minimal implementation to make test pass**
```typescript
export type LaunchParams = { threadId: string; token: string };
export function readLaunchParams(url: URL): LaunchParams {
  const threadId = url.searchParams.get("threadId");
  const token = new URLSearchParams(url.hash.replace(/^#/, "")).get("token");
  if (!threadId) throw new Error("Missing threadId query parameter");
  if (!token) throw new Error("Missing launch token fragment");
  return { threadId, token };
}
export function clearLaunchTokenFragment(location: URL, replaceState: History["replaceState"]): void {
  replaceState(null, "", `${location.pathname}${location.search}`);
}
```
- [ ] **Step 4: Run test to confirm PASS**
Run from repo root:
```bash
pnpm -C codex-gui run test -- src/features/guiHost/guiHostClient.test.ts
```
Expected output:
```text
✓ src/features/guiHost/guiHostClient.test.ts
```
- [ ] **Step 5: Commit**
```bash
git add codex-gui/src/features/guiHost/guiHostClient.ts codex-gui/src/features/guiHost/guiHostClient.test.ts
git commit -m "feat(gui): read GUI host launch params"
```
### Task 17: Frontend authenticates before initialize and attach
**Files:**
- Modify: `codex-gui/src/features/guiHost/guiHostClient.ts`
- Modify: `codex-gui/src/features/guiHost/guiHostClient.test.ts`
- Modify: `codex-gui/src/App.tsx`
- [ ] **Step 1: Write a failing test**
```typescript
import { startGuiHostConnection } from "./guiHostClient";
class RecordingWebSocket {
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  constructor(public readonly url: string) {}
  send(message: string): void { this.sent.push(message); }
}
it("sends authenticate before initialize and attach", async () => {
  const socket = new RecordingWebSocket("ws://127.0.0.1:4567/ws");
  const connection = startGuiHostConnection({
    location: new URL("http://127.0.0.1:4567/?threadId=thread-abc#token=secret"),
    replaceState: vi.fn(),
    createWebSocket: (url) => {
      expect(url).toBe("ws://127.0.0.1:4567/ws");
      return socket as unknown as WebSocket;
    },
  });
  socket.onopen?.();
  socket.onmessage?.({ data: JSON.stringify({ jsonrpc: "2.0", id: 1, result: { authenticated: true } }) });
  await connection;
  expect(socket.sent.map((message) => JSON.parse(message).method)).toEqual([
    "gui/authenticate",
    "initialize",
    "thread/projection/attach",
  ]);
  expect(JSON.parse(socket.sent[2]).params).toEqual({ threadId: "thread-abc" });
});
```
- [ ] **Step 2: Run the test to confirm FAIL**
Run from repo root:
```bash
pnpm -C codex-gui run test -- src/features/guiHost/guiHostClient.test.ts
```
Expected error output:
```text
No matching export in "src/features/guiHost/guiHostClient.ts" for import "startGuiHostConnection"
```
- [ ] **Step 3: Write minimal implementation to make test pass**
```typescript
type StartGuiHostConnectionOptions = {
  location: URL;
  replaceState: History["replaceState"];
  createWebSocket?: (url: string) => WebSocket;
};
export async function startGuiHostConnection({
  location,
  replaceState,
  createWebSocket = (url) => new WebSocket(url),
}: StartGuiHostConnectionOptions): Promise<void> {
  const { threadId, token } = readLaunchParams(location);
  clearLaunchTokenFragment(location, replaceState);
  const socket = createWebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`);
  await new Promise<void>((resolve, reject) => {
    socket.onopen = () => socket.send(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "gui/authenticate", params: { token } }));
    socket.onerror = () => reject(new Error("GUI host WebSocket failed"));
    socket.onmessage = (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id === 1 && message.result?.authenticated === true) {
        socket.send(JSON.stringify({ jsonrpc: "2.0", id: 2, method: "initialize", params: {} }));
        socket.send(JSON.stringify({ jsonrpc: "2.0", id: 3, method: "thread/projection/attach", params: { threadId } }));
        resolve();
      }
    };
  });
}
```
Use it in `App.tsx`:
```tsx
import { useEffect, useState } from "react";
import { startGuiHostConnection } from "./features/guiHost/guiHostClient";
export default function App() {
  const [status, setStatus] = useState("connecting");
  useEffect(() => {
    startGuiHostConnection({
      location: new URL(window.location.href),
      replaceState: window.history.replaceState.bind(window.history),
    }).then(() => setStatus("connected")).catch((error) => setStatus(`error: ${error.message}`));
  }, []);
  return <main data-gui-host-status={status}>{status}</main>;
}
```
- [ ] **Step 4: Run test to confirm PASS**
Run from repo root:
```bash
pnpm -C codex-gui run test -- src/features/guiHost/guiHostClient.test.ts
```
Expected output:
```text
✓ src/features/guiHost/guiHostClient.test.ts
```
- [ ] **Step 5: Commit**
```bash
git add codex-gui/src/features/guiHost/guiHostClient.ts codex-gui/src/features/guiHost/guiHostClient.test.ts codex-gui/src/App.tsx
git commit -m "feat(gui): authenticate GUI host websocket"
```
### Task 18: Integration acceptance covers tabs and session isolation
**Files:**
- Create: `codex-rs/app-server/tests/suite/v2/gui_host.rs`
- Modify: `codex-rs/app-server/tests/suite/v2/mod.rs`
- Modify: `codex-gui/e2e/app.spec.ts`
- [ ] **Step 1: Write a failing test**
```rust
use codex_app_server::gui_host::{DevAssetProxyConfig, GuiHost, GuiHostConfig, GuiHostMode};
use futures::{SinkExt, StreamExt};
use tokio_tungstenite::tungstenite::Message;
#[tokio::test]
async fn gui_host_allows_multiple_tabs_with_same_token() {
    let handle = GuiHost::start(GuiHostConfig { mode: GuiHostMode::Dev(DevAssetProxyConfig::default()) }).await.unwrap();
    let ws_url = format!("ws://{}/ws", handle.local_addr());
    for id in [1, 2] {
        let (mut ws, _) = tokio_tungstenite::connect_async(&ws_url).await.unwrap();
        ws.send(Message::Text(format!(
            r#"{{"jsonrpc":"2.0","id":{id},"method":"gui/authenticate","params":{{"token":"{}"}}}}"#,
            handle.launch_token().as_str()
        ))).await.unwrap();
        assert!(ws.next().await.unwrap().unwrap().into_text().unwrap().contains(r#""authenticated":true"#));
    }
    handle.shutdown().await;
}
#[tokio::test]
async fn gui_host_isolates_multiple_sessions() {
    let host_a = GuiHost::start(GuiHostConfig { mode: GuiHostMode::Dev(DevAssetProxyConfig::default()) }).await.unwrap();
    let host_b = GuiHost::start(GuiHostConfig { mode: GuiHostMode::Dev(DevAssetProxyConfig::default()) }).await.unwrap();
    assert_ne!(host_a.local_addr().port(), host_b.local_addr().port());
    assert_ne!(host_a.launch_token().as_str(), host_b.launch_token().as_str());
    let ws_url_b = format!("ws://{}/ws", host_b.local_addr());
    let (mut ws, _) = tokio_tungstenite::connect_async(&ws_url_b).await.unwrap();
    ws.send(Message::Text(format!(
        r#"{{"jsonrpc":"2.0","id":9,"method":"gui/authenticate","params":{{"token":"{}"}}}}"#,
        host_a.launch_token().as_str()
    ))).await.unwrap();
    assert!(ws.next().await.unwrap().unwrap().is_close());
    host_a.shutdown().await;
    host_b.shutdown().await;
}
```
Add to `codex-rs/app-server/tests/suite/v2/mod.rs`:
```rust
mod gui_host;
```
- [ ] **Step 2: Run the test to confirm FAIL**
Run from `codex-rs`:
```bash
cargo test -p codex-app-server gui_host_allows_multiple_tabs_with_same_token gui_host_isolates_multiple_sessions
```
Expected error output:
```text
error[E0432]: unresolved import `codex_app_server::gui_host`
```
- [ ] **Step 3: Write minimal implementation to make test pass**
Do not add a conditional public gate here. Task 1 already made `gui_host` `#[doc(hidden)] pub mod gui_host;` because TUI production code imports it cross-crate; keep that visibility unchanged and only add the integration tests and e2e coverage.
```rust
#[doc(hidden)]
pub mod gui_host;
```
Add Playwright coverage to `codex-gui/e2e/app.spec.ts`:
```typescript
import { expect, test } from "@playwright/test";
test("establishes gui host ws and clears fragment", async ({ page }) => {
  await page.goto("http://127.0.0.1:4567/?threadId=thread-abc#token=secret");
  await expect(page).toHaveURL("http://127.0.0.1:4567/?threadId=thread-abc");
  await expect(page.locator("main")).toHaveAttribute("data-gui-host-status", /connected|error/);
});
```
Connection close cleanup must use the same app-server `ConnectionClosed` path reached by `AppServerConnectionRouter`; do not add a TUI data-forwarding cleanup path.
- [ ] **Step 4: Run test to confirm PASS**
Run from `codex-rs` and repo root:
```bash
cargo test -p codex-app-server gui_host_allows_multiple_tabs_with_same_token
cargo test -p codex-app-server gui_host_isolates_multiple_sessions
pnpm -C ../codex-gui run test:e2e -- e2e/app.spec.ts
```
Expected output:
```text
test gui_host::gui_host_allows_multiple_tabs_with_same_token ... ok
test gui_host::gui_host_isolates_multiple_sessions ... ok
1 passed
```
- [ ] **Step 5: Commit**
```bash
git add codex-rs/app-server/tests/suite/v2/gui_host.rs codex-rs/app-server/tests/suite/v2/mod.rs codex-gui/e2e/app.spec.ts codex-rs/app-server/src/lib.rs
git commit -m "test(gui): add GUI host integration acceptance"
```
### Task 19: Final formatting and focused verification
**Files:**
- Modify: all changed Rust, TypeScript, JavaScript, and Python files from previous tasks.
- [ ] **Step 1: Write a failing verification gate**
Add this checklist to the PR description:
```markdown
Verification gate:
- `cd codex-rs && just fmt` exits 0.
- `cd codex-rs && cargo test -p codex-app-server gui_host` exits 0.
- `cd codex-rs && cargo test -p codex-tui gui_command` exits 0.
- `pnpm -C codex-gui run test -- src/features/guiHost/guiHostClient.test.ts` exits 0.
- `pnpm -C codex-gui run test:e2e -- e2e/app.spec.ts` exits 0.
- `node --check codex-cli/bin/codex.js` exits 0.
```
- [ ] **Step 2: Run the test to confirm FAIL**
Run from repo root before final formatting:
```bash
cd codex-rs && just fmt --check
```
Expected error output if formatting drift exists:
```text
Diff in ...
```
- [ ] **Step 3: Write minimal implementation to make test pass**
Run:
```bash
cd codex-rs && just fmt
cd codex-rs && just fix -p codex-app-server
cd codex-rs && just fix -p codex-tui
pnpm -C codex-gui run type-check
node --check codex-cli/bin/codex.js
```
If Rust dependencies changed, also run:
```bash
cd codex-rs && just bazel-lock-update
cd codex-rs && just bazel-lock-check
```
- [ ] **Step 4: Run test to confirm PASS**
Run:
```bash
cd codex-rs && cargo test -p codex-app-server gui_host
cd codex-rs && cargo test -p codex-tui gui_command
pnpm -C codex-gui run test -- src/features/guiHost/guiHostClient.test.ts
pnpm -C codex-gui run test:e2e -- e2e/app.spec.ts
```
Expected output:
```text
test result: ok
✓ src/features/guiHost/guiHostClient.test.ts
1 passed
```
- [ ] **Step 5: Commit**
```bash
git add codex-rs/app-server codex-rs/tui codex-gui codex-cli/bin/codex.js codex-cli/scripts/build_npm_package.py
git commit -m "chore(gui): verify GUI host implementation"
```
## 风险与未决事项
- 设计文档 `测试策略` 列出 10 个测试点；实现和评审按 10 个测试点覆盖。
- JSON-RPC 白名单拒绝错误码未在设计中固定。实现 PR 需要在测试中固定返回 JSON-RPC error 还是关闭连接；认证阶段失败使用 WebSocket close code `1008`。
- 首帧 `gui/authenticate` 格式错误但能解析出 `id` 时的 error payload 形状未完全指定。首版可以直接关闭连接，避免创建 app-server connection。
- 前端 URL 缺失 `threadId` 时首版显示连接错误并且不发送 `thread/projection/attach`。
- Vite HMR 配置语法可能随 Vite 版本变化。用 `pnpm -C codex-gui run type-check` 和浏览器 Network 验证 HMR 指向 `ws://127.0.0.1:5173/...`。
- `CODEX_GUI_PACKAGE_ROOT` 在 npm 发布包中的最终目录需要实现 PR 根据实际复制路径确认；运行时语义保持为 package root，`dist/` 固定在其下方。
- `GuiHost` 是否新增 `ConnectionOrigin::GuiHost` 取决于 connection router 抽取结果。首选在 `codex-app-server` 内部隔离来源，只有 tracing、analytics 或 cleanup 必须区分时再扩展 transport origin。
- opener 失败后的 TUI 文案会影响 snapshot。文案只包含错误摘要和完整 URL。
- 手动 DevTools 验收不能完全自动化。Playwright 负责 hash 清理和首帧顺序，人工验收负责确认 `/ws` 和 Vite HMR 连接分离。
## 回退策略
Each task should land as its own commit. Tasks 1 through 12 add internal app-server and asset-serving capability that can be reverted independently before `/gui` becomes user-visible. Tasks 13 and 14 expose `/gui`; reverting them must remove the slash command, `AppEvent::OpenGui`, TUI `gui_host` field, and opener path together so no partial command remains. Tasks 15 through 17 are browser and acceptance layers; they can be reverted while leaving the TUI command disabled or while preserving internal `GuiHost` tests. If a release issue appears after `/gui` ships, revert the TUI exposure commit first, then revert frontend connection commits if the internal host needs to remain available for diagnostics.
## Self-Review
- Spec coverage: background and goals map to Tasks 1, 10, 13, 14, 15, 16, and 17. `/gui` entry maps to Tasks 2, 13, and 14. WebSocket authentication maps to Tasks 3 through 6. Local security boundary maps to Task 7. JSON-RPC whitelist maps to Tasks 8 through 10. Static resource modes map to Tasks 11 and 12. Lifecycle maps to Tasks 14 and 17. First frontend behavior maps to Tasks 15 and 16. Error handling maps to Tasks 4, 5, 6, 11, 12, and 14.
- Placeholder scan: no banned placeholder phrases remain; each task has Steps 1-5, concrete code, exact commands, expected output, and commit commands.
- Type consistency: `LaunchToken`, `GuiHostHandle::launch_url_for_thread`, `GuiAuthenticateParams`, `GuiHost`, `GuiHostConfig`, `GuiHostMode`, `DevAssetProxyConfig`, `ProdAssetConfig`, `GuiConnectionRouter`, and `PlatformGuiOpener` are named consistently across tasks.
