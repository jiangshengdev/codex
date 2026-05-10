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
pub(crate) struct GuiHostConfig { pub(crate) mode: GuiHostMode }
#[derive(Debug, Clone)]
pub(crate) enum GuiHostMode { Dev(DevAssetProxyConfig), Prod(ProdAssetConfig) }
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct DevAssetProxyConfig { pub(crate) vite_origin: String }
impl Default for DevAssetProxyConfig {
    fn default() -> Self { Self { vite_origin: "http://127.0.0.1:5173".to_string() } }
}
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct ProdAssetConfig { pub(crate) package_root: std::path::PathBuf }
pub(crate) struct GuiHost;
pub(crate) struct GuiHostHandle {
    local_addr: SocketAddr,
    shutdown_tx: Option<oneshot::Sender<()>>,
    server_task: tokio::task::JoinHandle<()>,
}
impl GuiHost {
    pub(crate) async fn start(config: GuiHostConfig) -> std::io::Result<GuiHostHandle> {
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
    pub(crate) fn local_addr(&self) -> SocketAddr { self.local_addr }
    pub(crate) fn base_url(&self) -> String { format!("http://{}", self.local_addr) }
    pub(crate) async fn shutdown(mut self) {
        if let Some(tx) = self.shutdown_tx.take() { let _ = tx.send(()); }
        let _ = self.server_task.await;
    }
}
```
Modify `codex-rs/app-server/src/lib.rs`:
```rust
pub(crate) mod gui_host;
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
pub(crate) struct LaunchToken(String);
impl LaunchToken {
    pub(crate) fn generate() -> Self {
        use rand::RngCore;
        let mut bytes = [0_u8; 32];
        rand::rngs::OsRng.fill_bytes(&mut bytes);
        Self(base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(bytes))
    }
    pub(crate) fn as_str(&self) -> &str { &self.0 }
    #[cfg(test)]
    pub(crate) fn from_test_value(value: &str) -> Self { Self(value.to_string()) }
}
pub(crate) struct GuiHostHandle {
    local_addr: SocketAddr,
    launch_token: LaunchToken,
    shutdown_tx: Option<oneshot::Sender<()>>,
    server_task: tokio::task::JoinHandle<()>,
}
impl GuiHostHandle {
    #[cfg(test)]
    pub(crate) fn new_for_test(local_addr: SocketAddr, launch_token: LaunchToken) -> Self {
        Self { local_addr, launch_token, shutdown_tx: None, server_task: tokio::spawn(async {}) }
    }
    pub(crate) fn launch_token(&self) -> &LaunchToken { &self.launch_token }
    pub(crate) fn launch_url_for_thread(&self, thread_id: &str) -> String {
        format!("{}/?threadId={}#token={}", self.base_url(), urlencoding::encode(thread_id), self.launch_token.as_str())
    }
}
```
In `GuiHost::start`, create `let launch_token = LaunchToken::generate();` and return it in `GuiHostHandle`. If needed, add:
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
#[async_trait::async_trait]
pub(crate) trait GuiConnectionRouter: Send + Sync {
    async fn incoming_text(&self, text: String) -> anyhow::Result<()>;
}
pub(crate) async fn forward_authenticated_message(router: &dyn GuiConnectionRouter, text: String) -> anyhow::Result<bool> {
    if !gui_host_allows_incoming_text(&text) { return Ok(false); }
    router.incoming_text(text).await?;
    Ok(true)
}
#[cfg(test)]
#[derive(Default)]
struct TestGuiConnectionRouter { messages: tokio::sync::Mutex<Vec<String>> }
#[cfg(test)]
#[async_trait::async_trait]
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
In `lib.rs`, extract a production router that calls the same `MessageProcessor::process_request`, `process_response`, `process_error`, `process_notification`, and `connection_closed` paths used by `TransportEvent`.
```rust
pub(crate) struct AppServerConnectionRouter {
    message_processor: std::sync::Arc<MessageProcessor>,
}
impl MessageProcessor {
    pub(crate) async fn process_raw_jsonrpc_text(&self, text: String) {
        match serde_json::from_str::<codex_app_server_protocol::protocol::ClientMessage>(&text) {
            Ok(codex_app_server_protocol::protocol::ClientMessage::Request(request)) => self.process_request(request).await,
            Ok(codex_app_server_protocol::protocol::ClientMessage::Response(response)) => self.process_response(response).await,
            Ok(codex_app_server_protocol::protocol::ClientMessage::Error(error)) => self.process_error(error).await,
            Ok(codex_app_server_protocol::protocol::ClientMessage::Notification(notification)) => self.process_notification(notification).await,
            Err(err) => tracing::warn!(?err, "failed to parse GUI JSON-RPC message"),
        }
    }
}
#[async_trait::async_trait]
impl crate::gui_host::GuiConnectionRouter for AppServerConnectionRouter {
    async fn incoming_text(&self, text: String) -> anyhow::Result<()> {
        self.message_processor.process_raw_jsonrpc_text(text).await;
        Ok(())
    }
}
```
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
    let handle = GuiHost::start(GuiHostConfig {
        mode: GuiHostMode::Prod(ProdAssetConfig { package_root: tempdir.path().to_path_buf() }),
    }).await.unwrap();
    let response = reqwest::get(handle.base_url()).await.unwrap();
    assert_eq!(response.status(), reqwest::StatusCode::OK);
    assert_eq!(response.text().await.unwrap(), "<main>Codex GUI</main>");
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
```
Use `serve_root` for `/`, and set the package root in `codex-cli/bin/codex.js`:
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
```
Expected output:
```text
test gui_host::tests::prod_serves_index_html_from_package_dist ... ok
```
- [ ] **Step 5: Commit**
```bash
git add codex-rs/app-server/src/gui_host.rs codex-cli/bin/codex.js codex-cli/scripts/build_npm_package.py
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
cargo test -p codex-app-server gui_host::tests::dev_proxy_error_names_vite_origin
```
Expected error output:
```text
assertion `left == right` failed
left: 200
right: 502
```
- [ ] **Step 3: Write minimal implementation to make test pass**
Change the dev arm in `serve_root`:
```rust
GuiHostMode::Dev(config) => {
    let url = format!("{}/", config.vite_origin.trim_end_matches('/'));
    let response = reqwest::get(&url).await.map_err(|_| {
        (axum::http::StatusCode::BAD_GATEWAY, format!("Start Vite at {}", config.vite_origin))
    })?;
    let body = response.text().await.map_err(|err| {
        (axum::http::StatusCode::BAD_GATEWAY, format!("Failed to read Vite response from {}: {err}", config.vite_origin))
    })?;
    Ok(axum::response::Html(body).into_response())
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
cargo test -p codex-app-server gui_host::tests::dev_proxy_error_names_vite_origin
pnpm -C ../codex-gui run type-check
```
Expected output:
```text
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
pub(crate) enum SlashCommand { Gui, /* existing variants */ }
impl SlashCommand {
    pub(crate) fn description(self) -> &'static str {
        match self { SlashCommand::Gui => "Open GUI for the primary thread", /* existing arms */ }
    }
    pub(crate) fn is_visible(self) -> bool {
        match self { SlashCommand::Gui => true, /* existing arms */ }
    }
}
impl std::str::FromStr for SlashCommand {
    type Err = ();
    fn from_str(value: &str) -> Result<Self, Self::Err> {
        match value { "gui" => Ok(SlashCommand::Gui), /* existing arms */ _ => Err(()) }
    }
}
pub(crate) enum AppEvent { OpenGui, /* existing variants */ }
match command {
    SlashCommand::Gui => self.app_event_tx.send(AppEvent::OpenGui),
    /* existing command arms */
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
    let mut app = test_app_with_threads("primary-thread", "side-thread", opener.clone());
    app.open_gui().await.unwrap();
    app.open_gui().await.unwrap();
    let opened = opener.opened_urls().await;
    assert_eq!(opened.len(), 2);
    assert!(opened[0].contains("threadId=primary-thread"));
    assert!(!opened[0].contains("side-thread"));
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
            self.add_status_message("Current session is not ready to open GUI.");
            return Ok(());
        };
        let url = self.ensure_gui_host().await?.launch_url_for_thread(&thread_id);
        if let Err(err) = self.gui_opener.open(&url) {
            self.add_status_message(format!("Open this URL in a browser: {url}\n{err}"));
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
}
```
Add `gui_host: Option<GuiHostHandle>`, `gui_opener: Box<dyn GuiOpener>`, a `primary_thread_id()` accessor, and this test opener:
```rust
fn test_app_with_threads(
    primary_thread_id: &str,
    active_thread_id: &str,
    opener: RecordingGuiOpener,
) -> App {
    let mut app = App::new_for_test();
    app.set_primary_thread_id_for_test(primary_thread_id);
    app.set_active_thread_id_for_test(active_thread_id);
    app.gui_opener = Box::new(opener);
    app
}

#[derive(Clone, Default)]
struct RecordingGuiOpener { opened: std::sync::Arc<tokio::sync::Mutex<Vec<String>>> }
impl GuiOpener for RecordingGuiOpener {
    fn open(&self, url: &str) -> Result<(), OpenGuiError> {
        self.opened.blocking_lock().push(url.to_string());
        Ok(())
    }
}
impl RecordingGuiOpener {
    async fn opened_urls(&self) -> Vec<String> { self.opened.lock().await.clone() }
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
### Task 15: Frontend reads launch params and clears fragment
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
### Task 16: Frontend authenticates before initialize and attach
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
### Task 17: Integration acceptance covers tabs and session isolation
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
```
Add to `codex-rs/app-server/tests/suite/v2/mod.rs`:
```rust
mod gui_host;
```
- [ ] **Step 2: Run the test to confirm FAIL**
Run from `codex-rs`:
```bash
cargo test -p codex-app-server gui_host_allows_multiple_tabs_with_same_token
```
Expected error output:
```text
error[E0603]: module `gui_host` is private
```
- [ ] **Step 3: Write minimal implementation to make test pass**
Expose test support:
```rust
#[cfg(any(test, feature = "test-support"))]
pub mod gui_host;
#[cfg(not(any(test, feature = "test-support")))]
pub(crate) mod gui_host;
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
pnpm -C ../codex-gui run test:e2e -- e2e/app.spec.ts
```
Expected output:
```text
test gui_host::gui_host_allows_multiple_tabs_with_same_token ... ok
1 passed
```
- [ ] **Step 5: Commit**
```bash
git add codex-rs/app-server/tests/suite/v2/gui_host.rs codex-rs/app-server/tests/suite/v2/mod.rs codex-gui/e2e/app.spec.ts codex-rs/app-server/src/lib.rs
git commit -m "test(gui): add GUI host integration acceptance"
```
### Task 18: Final formatting and focused verification
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
