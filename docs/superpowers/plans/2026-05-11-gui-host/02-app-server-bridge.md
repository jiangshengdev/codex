# Codex GUI App-Server Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the GUI app-server bridge as an app-server-runtime-owned dynamic transport acceptor that turns authenticated GUI WebSockets into existing app-server `TransportEvent` traffic.

**Architecture:** `codex-gui-host` remains the browser-safe HTTP/WebSocket shell. `codex-app-server` owns GUI host lifecycle inside the runtime scope that owns `transport_event_tx`; the GUI backend emits `TransportEvent::{ConnectionOpened, IncomingMessage, ConnectionClosed}` just like `remote-control` does. `codex-rs/app-server/src/in_process.rs` must stay a single embedded TUI connection runtime and must not become a second multi-connection transport loop.

**Tech Stack:** Rust 2024, codex-app-server, codex-app-server-transport, codex-gui-host, codex-app-server-protocol, tokio.

---

Source spec: `docs/superpowers/specs/2026-05-11-codex-gui-host-redesign.md`.
Roadmap: `docs/superpowers/plans/2026-05-11-gui-host/00-roadmap.md`.

## Hard Constraints

- Do not implement `open_extra_jsonrpc_connection`.
- Do not add `ExtraJsonRpcConnectionFactory`.
- Do not expose a generic extra JSON-RPC connection API from `InProcessClientHandle`.
- Do not extend `codex-rs/app-server/src/in_process.rs` into a multi-connection transport runtime.
- Do not copy `run_main_with_transport_options` connection maps, outbound routing, or close cleanup into `in_process.rs` or another parallel processor loop.
- Keep GUI-specific lifecycle code in focused app-server modules, not in central orchestration files.
- `codex-gui-host` must not depend on `codex-app-server`.
- TUI must eventually request a launch URL; it must not own `GuiHost` or a raw backend handle.

## File Structure

- Modify: `codex-rs/app-server-transport/src/transport/mod.rs`
  - Add `ConnectionOrigin::GuiHost`.
- Modify: `codex-rs/app-server/Cargo.toml`
  - Add `codex-gui-host = { workspace = true }` if not already present.
- Modify: `codex-rs/app-server/BUILD.bazel`
  - Add the local dependency label for `codex-gui-host` if dependencies are listed explicitly.
- Create: `codex-rs/app-server/src/gui_transport.rs`
  - Implement `GuiTransportBackend`.
  - Convert `AuthenticatedGuiConnection` to real `TransportEvent` values.
  - Own GUI connection IDs and per-connection writer tasks.
- Create: `codex-rs/app-server/src/gui_host.rs`
  - Own lazy-start/reuse of `codex_gui_host::GuiHost`.
  - Return launch URLs for primary thread IDs.
  - Keep host/token lifetime scoped to app-server runtime lifetime.
- Modify: `codex-rs/app-server/src/lib.rs`
  - Declare the new modules.
  - Wire `GuiHostManager` into the runtime scope where `transport_event_tx` exists.
  - Keep the existing `TransportEvent` processor path as the only app-server request-processing path for GUI traffic.
- Modify: `codex-rs/app-server/src/in_process.rs`
  - Remove the current obsolete GUI backend/multi-connection implementation from this branch.
  - Do not add replacement GUI transport behavior here.
- Modify: `codex-rs/app-server-client/src/lib.rs`
  - Remove obsolete raw `GuiBackendHandle` exposure from this branch.
  - Do not expose raw backend handles; `03-tui-entry.md` must consume launch URL access only.

## Task 0: Remove the Obsolete `in_process.rs` Bridge Route

**Files:**
- Modify: `codex-rs/app-server/src/in_process.rs`
- Modify: `codex-rs/app-server-client/src/lib.rs`
- Modify: `codex-rs/app-server/Cargo.toml`
- Modify: `codex-rs/Cargo.lock`

- [ ] **Step 1: Inspect the obsolete branch-only changes**

Run from repo root:

```bash
git diff --stat 01-gui-host-crate..HEAD -- \
  codex-rs/app-server/src/in_process.rs \
  codex-rs/app-server-client/src/lib.rs \
  codex-rs/app-server/Cargo.toml \
  codex-rs/Cargo.lock
```

Expected: `in_process.rs` shows a large GUI-related diff. That diff is the implementation route this plan replaces.

- [ ] **Step 2: Remove obsolete in-process GUI runtime symbols**

In `codex-rs/app-server/src/in_process.rs`, remove the GUI-specific additions from the previous route:

```rust
use codex_gui_host::AuthenticatedGuiConnection;
use codex_gui_host::GuiBackend;
use tokio_util::sync::CancellationToken;
```

Remove these obsolete runtime elements if present:

```rust
OpenGuiConnection { .. }
GuiOpened { .. }
GuiIncoming { .. }
InProcessOutboundControlEvent
RuntimeEvent
GuiConnectionRuntime
GuiBackendHandle
complete_gui_connection
try_enqueue_gui_opened
enqueue_gui_incoming_message
InProcessClientHandle::gui_backend
```

Restore the embedded runtime shape to one in-process connection:

```rust
const IN_PROCESS_CONNECTION_ID: ConnectionId = ConnectionId(0);
```

The only `ProcessorCommand` variants should be the embedded client request/notification variants:

```rust
enum ProcessorCommand {
    Request(Box<ClientRequest>),
    Notification(ClientNotification),
}
```

- [ ] **Step 3: Remove raw backend exposure from app-server-client**

In `codex-rs/app-server-client/src/lib.rs`, remove obsolete imports, fields, and methods related to raw GUI backend handles:

```rust
pub use codex_app_server::in_process::GuiBackendHandle;
gui_backend: GuiBackendHandle,
pub fn gui_backend(&self) -> GuiBackendHandle
pub fn gui_backend(&self) -> Option<GuiBackendHandle>
```

`InProcessAppServerClient` should return to this ownership shape:

```rust
pub struct InProcessAppServerClient {
    command_tx: mpsc::Sender<ClientCommand>,
    event_rx: mpsc::Receiver<InProcessServerEvent>,
    worker_handle: tokio::task::JoinHandle<()>,
}
```

- [ ] **Step 4: Run compile-focused checks**

Run from `codex-rs`:

```bash
cargo check -p codex-app-server
cargo check -p codex-app-server-client
```

Expected: both crates compile after the obsolete raw backend route is removed.

- [ ] **Step 5: Commit**

```bash
git add codex-rs/app-server/src/in_process.rs codex-rs/app-server-client/src/lib.rs codex-rs/app-server/Cargo.toml codex-rs/Cargo.lock
git commit -m "refactor(gui): remove obsolete in-process GUI bridge route"
```

## Task 1: Verify `ConnectionOrigin::GuiHost`

> **Historical note:** `ConnectionOrigin::GuiHost` and its covering test were added by commit `5234462af` and are already present on this branch. This task is a verification step only — no code changes are required.

**Files:**
- Verify: `codex-rs/app-server-transport/src/transport/mod.rs`

- [ ] **Step 1: Confirm variant and test exist**

Run from `codex-rs`:

```bash
cargo test -p codex-app-server-transport connection_origin_has_distinct_gui_host_variant
```

Expected: the test passes immediately.

```text
test transport::tests::connection_origin_has_distinct_gui_host_variant ... ok
```

If the test is missing or fails, add the variant and test following the pattern in `ConnectionOrigin`'s existing `#[cfg(test)] mod tests` block before proceeding to Task 2.

## Task 2: Implement GUI Transport Backend

**Files:**
- Create: `codex-rs/app-server/src/gui_transport.rs`
- Modify: `codex-rs/app-server/src/lib.rs`
- Modify: `codex-rs/app-server/Cargo.toml`
- Modify: `codex-rs/app-server/BUILD.bazel`

- [ ] **Step 1: Add dependencies and module declaration**

In `codex-rs/app-server/Cargo.toml`, ensure:

```toml
codex-gui-host = { workspace = true }
```

In `codex-rs/app-server/src/lib.rs`, add:

```rust
mod gui_transport;
```

If `codex-rs/app-server/BUILD.bazel` lists crate dependencies explicitly, add the generated `codex-gui-host` dependency using the file-local style.

- [ ] **Step 2: Add backend lifecycle tests**

Create `codex-rs/app-server/src/gui_transport.rs` with tests first. Start with concrete helpers and assertions shaped like this:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use codex_app_server_protocol::JSONRPCRequest;
    use codex_app_server_protocol::RequestId;
    use codex_app_server_transport::OutgoingResponse;
    use crate::transport::OutgoingMessage;
    use pretty_assertions::assert_eq;
    use serde_json::json;
    use tokio::time::Duration;
    use tokio::time::timeout;

    async fn recv_event(rx: &mut mpsc::Receiver<TransportEvent>) -> TransportEvent {
        timeout(Duration::from_secs(1), rx.recv())
            .await
            .expect("transport event should arrive")
            .expect("transport event channel should remain open")
    }

    fn initialize_text() -> String {
        json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "clientInfo": { "name": "gui-test", "version": "0.0.0" },
                "capabilities": {}
            }
        })
        .to_string()
    }

    fn initialize_message() -> JSONRPCMessage {
        JSONRPCMessage::Request(JSONRPCRequest {
            id: RequestId::Integer(1),
            method: "initialize".to_string(),
            params: Some(json!({
                "clientInfo": { "name": "gui-test", "version": "0.0.0" },
                "capabilities": {}
            })),
            trace: None,
        })
    }

#[tokio::test]
async fn connect_emits_open_incoming_and_close_transport_events() {
    let (transport_event_tx, mut transport_event_rx) = mpsc::channel(8);
    let backend = GuiTransportBackend::new(transport_event_tx);
    let (connection, inbound_tx, _outbound_rx) = AuthenticatedGuiConnection::new();
    let connect_task = tokio::spawn(async move { backend.connect(connection).await });

    inbound_tx.send(initialize_text()).await.expect("send inbound");

    let connection_id = match recv_event(&mut transport_event_rx).await {
        TransportEvent::ConnectionOpened { connection_id, origin, .. } => {
            assert_eq!(origin, ConnectionOrigin::GuiHost);
            connection_id
        }
        other => panic!("expected ConnectionOpened, got {other:?}"),
    };
    match recv_event(&mut transport_event_rx).await {
        TransportEvent::IncomingMessage {
            connection_id: incoming_connection_id,
            message,
        } => {
            assert_eq!(incoming_connection_id, connection_id);
            assert_eq!(message, initialize_message());
        }
        other => panic!("expected IncomingMessage, got {other:?}"),
    }

    drop(inbound_tx);
    match recv_event(&mut transport_event_rx).await {
        TransportEvent::ConnectionClosed { connection_id: closed_connection_id } => {
            assert_eq!(closed_connection_id, connection_id);
        }
        other => panic!("expected ConnectionClosed, got {other:?}"),
    }
    connect_task.await.expect("connect task should join").expect("connect should finish");
}

#[tokio::test]
async fn outgoing_writer_serializes_jsonrpc_text_to_gui_outbound() {
    let (transport_event_tx, mut transport_event_rx) = mpsc::channel(8);
    let backend = GuiTransportBackend::new(transport_event_tx);
    let (connection, inbound_tx, mut outbound_rx) = AuthenticatedGuiConnection::new();
    let connect_task = tokio::spawn(async move { backend.connect(connection).await });

    let writer = match recv_event(&mut transport_event_rx).await {
        TransportEvent::ConnectionOpened { writer, .. } => writer,
        other => panic!("expected ConnectionOpened, got {other:?}"),
    };
    writer
        .send(QueuedOutgoingMessage::new(OutgoingMessage::Response(OutgoingResponse {
            id: RequestId::Integer(7),
            result: json!({}),
        })))
        .await
        .expect("writer should accept response");

    let text = timeout(Duration::from_secs(1), outbound_rx.recv())
        .await
        .expect("outbound text should arrive")
        .expect("outbound channel should stay open");
    let value: serde_json::Value = serde_json::from_str(&text).expect("outbound should be JSON");
    assert_eq!(value["jsonrpc"], "2.0");
    assert_eq!(value["id"], 7);

    drop(inbound_tx);
    connect_task.await.expect("connect task should join").expect("connect should finish");
}

#[tokio::test]
async fn invalid_inbound_json_is_dropped_without_closing_connection() {
    let (transport_event_tx, mut transport_event_rx) = mpsc::channel(8);
    let backend = GuiTransportBackend::new(transport_event_tx);
    let (connection, inbound_tx, _outbound_rx) = AuthenticatedGuiConnection::new();
    let connect_task = tokio::spawn(async move { backend.connect(connection).await });

    let connection_id = match recv_event(&mut transport_event_rx).await {
        TransportEvent::ConnectionOpened { connection_id, .. } => connection_id,
        other => panic!("expected ConnectionOpened, got {other:?}"),
    };
    inbound_tx.send("not json".to_string()).await.expect("send invalid");
    inbound_tx.send(initialize_text()).await.expect("send valid");
    match recv_event(&mut transport_event_rx).await {
        TransportEvent::IncomingMessage {
            connection_id: incoming_connection_id,
            message,
        } => {
            assert_eq!(incoming_connection_id, connection_id);
            assert_eq!(message, initialize_message());
        }
        other => panic!("expected IncomingMessage, got {other:?}"),
    }

    drop(inbound_tx);
    connect_task.await.expect("connect task should join").expect("connect should finish");
}

#[tokio::test]
async fn disconnect_token_closes_connection() {
    let (transport_event_tx, mut transport_event_rx) = mpsc::channel(8);
    let backend = GuiTransportBackend::new(transport_event_tx);
    let (connection, _inbound_tx, _outbound_rx) = AuthenticatedGuiConnection::new();
    let connect_task = tokio::spawn(async move { backend.connect(connection).await });

    let (connection_id, disconnect_sender) = match recv_event(&mut transport_event_rx).await {
        TransportEvent::ConnectionOpened {
            connection_id,
            disconnect_sender: Some(disconnect_sender),
            ..
        } => (connection_id, disconnect_sender),
        other => panic!("expected ConnectionOpened with disconnect sender, got {other:?}"),
    };
    disconnect_sender.cancel();
    match recv_event(&mut transport_event_rx).await {
        TransportEvent::ConnectionClosed { connection_id: closed_connection_id } => {
            assert_eq!(closed_connection_id, connection_id);
        }
        other => panic!("expected ConnectionClosed, got {other:?}"),
    }
    connect_task.await.expect("connect task should join").expect("connect should finish");
}
}
```

- [ ] **Step 3: Implement `GuiTransportBackend`**

Implement the module around this shape:

```rust
use std::sync::Arc;
use std::sync::atomic::AtomicU64;
use std::sync::atomic::Ordering;

use codex_app_server_protocol::JSONRPCMessage;
use codex_gui_host::AuthenticatedGuiConnection;
use codex_gui_host::GuiBackend;
use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;
use tracing::warn;

use crate::transport::ConnectionId;
use crate::transport::ConnectionOrigin;
use crate::transport::OutgoingMessage;
use crate::transport::QueuedOutgoingMessage;
use crate::transport::TransportEvent;

#[derive(Clone)]
pub(crate) struct GuiTransportBackend {
    transport_event_tx: mpsc::Sender<TransportEvent>,
    next_connection_id: Arc<AtomicU64>,
}

impl GuiTransportBackend {
    pub(crate) fn new(transport_event_tx: mpsc::Sender<TransportEvent>) -> Self {
        Self {
            transport_event_tx,
            next_connection_id: Arc::new(AtomicU64::new(1)),
        }
    }

    fn next_connection_id(&self) -> ConnectionId {
        ConnectionId(self.next_connection_id.fetch_add(1, Ordering::Relaxed))
    }
}

impl GuiBackend for GuiTransportBackend {
    async fn connect(&self, connection: AuthenticatedGuiConnection) -> anyhow::Result<()> {
        run_gui_transport_connection(
            self.transport_event_tx.clone(),
            self.next_connection_id(),
            connection,
        )
        .await
    }
}
```

Implement `run_gui_transport_connection` with this lifecycle:

```rust
async fn run_gui_transport_connection(
    transport_event_tx: mpsc::Sender<TransportEvent>,
    connection_id: ConnectionId,
    connection: AuthenticatedGuiConnection,
) -> anyhow::Result<()> {
    let (writer_tx, writer_rx) = mpsc::channel::<QueuedOutgoingMessage>(codex_gui_host::GUI_CONNECTION_CHANNEL_CAPACITY);
    let disconnect_token = CancellationToken::new();

    transport_event_tx
        .send(TransportEvent::ConnectionOpened {
            connection_id,
            origin: ConnectionOrigin::GuiHost,
            writer: writer_tx,
            disconnect_sender: Some(disconnect_token.clone()),
        })
        .await?;

    let close_result = pump_gui_transport(
        transport_event_tx.clone(),
        connection_id,
        connection,
        writer_rx,
        disconnect_token.clone(),
    )
    .await;
    disconnect_token.cancel();
    let _ = transport_event_tx
        .send(TransportEvent::ConnectionClosed { connection_id })
        .await;
    close_result?;
    Ok(())
}
```

`pump_gui_transport` should use a `tokio::select!` over `connection.inbound_rx.recv()`, `writer_rx.recv()`, and `disconnect_token.cancelled()`. Inbound invalid JSON is logged and dropped. Outbound serialization must emit standard JSON-RPC text. If `OutgoingMessage` serializes without the `jsonrpc` field, insert `"jsonrpc":"2.0"` before sending to the GUI outbound channel.

- [ ] **Step 4: Run backend tests**

Run from `codex-rs`:

```bash
cargo test -p codex-app-server gui_transport
```

Expected: all `gui_transport` tests pass.

- [ ] **Step 5: Commit**

```bash
git add codex-rs/app-server/src/gui_transport.rs codex-rs/app-server/src/lib.rs codex-rs/app-server/Cargo.toml codex-rs/app-server/BUILD.bazel codex-rs/Cargo.lock
git commit -m "feat(app-server): add GUI transport backend"
```

## Task 3: Add App-Server-Owned GUI Host Manager

**Files:**
- Create: `codex-rs/app-server/src/gui_host.rs`
- Modify: `codex-rs/app-server/src/lib.rs`

- [ ] **Step 1: Add manager tests**

Create tests in `codex-rs/app-server/src/gui_host.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::gui_transport::GuiTransportBackend;
    use tokio::sync::mpsc;

#[tokio::test]
async fn launch_url_starts_host_once_and_reuses_it() {
    let (transport_event_tx, _transport_event_rx) = mpsc::channel(8);
    let backend = GuiTransportBackend::new(transport_event_tx);
    let manager = GuiHostManager::new(backend);

    let first = manager
        .launch_url_for_thread("thread-a")
        .await
        .expect("first launch URL should be created");
    let second = manager
        .launch_url_for_thread("thread-b")
        .await
        .expect("second launch URL should reuse host");

    let first_url = url::Url::parse(&first).expect("first URL should parse");
    let second_url = url::Url::parse(&second).expect("second URL should parse");
    assert_eq!(first_url.origin(), second_url.origin());
    assert_eq!(first_url.fragment(), second_url.fragment());
    assert_ne!(first_url.query(), second_url.query());

    manager.shutdown().await;
}

#[tokio::test]
async fn shutdown_stops_started_host() {
    let (transport_event_tx, _transport_event_rx) = mpsc::channel(8);
    let backend = GuiTransportBackend::new(transport_event_tx);
    let manager = GuiHostManager::new(backend);

    let _url = manager
        .launch_url_for_thread("thread-a")
        .await
        .expect("launch URL should be created");
    manager.shutdown().await;
    manager.shutdown().await;
}
}
```

- [ ] **Step 2: Implement manager types**

Implement around this shape:

```rust
use std::sync::Arc;

use codex_gui_host::GuiHost;
use codex_gui_host::GuiHostConfig;
use codex_gui_host::GuiHostHandle;
use codex_gui_host::GuiHostMode;
use tokio::sync::Mutex;

use crate::gui_transport::GuiTransportBackend;

#[derive(Clone)]
pub(crate) struct GuiHostManager {
    inner: Arc<Mutex<GuiHostManagerState>>,
    backend: GuiTransportBackend,
}

struct GuiHostManagerState {
    handle: Option<GuiHostHandle>,
}

impl GuiHostManager {
    pub(crate) fn new(backend: GuiTransportBackend) -> Self {
        Self {
            inner: Arc::new(Mutex::new(GuiHostManagerState { handle: None })),
            backend,
        }
    }

    pub(crate) async fn launch_url_for_thread(
        &self,
        thread_id: impl std::fmt::Display,
    ) -> anyhow::Result<String> {
        let mut state = self.inner.lock().await;
        if state.handle.is_none() {
            let mode = GuiHostMode::default_for_profile()?;
            let handle = GuiHost::start(GuiHostConfig { mode }, self.backend.clone()).await?;
            state.handle = Some(handle);
        }
        let handle = state.handle.as_ref().expect("handle should be initialized");
        Ok(handle.launch_url_for_thread(thread_id))
    }

    pub(crate) async fn shutdown(&self) {
        let mut state = self.inner.lock().await;
        if let Some(handle) = state.handle.take() {
            handle.shutdown().await;
        }
    }
}
```

- [ ] **Step 3: Declare module**

In `codex-rs/app-server/src/lib.rs`, add:

```rust
mod gui_host;
```

- [ ] **Step 4: Run manager tests**

Run from `codex-rs`:

```bash
cargo test -p codex-app-server gui_host
```

Expected: all `gui_host` tests pass.

- [ ] **Step 5: Commit**

```bash
git add codex-rs/app-server/src/gui_host.rs codex-rs/app-server/src/lib.rs
git commit -m "feat(app-server): add GUI host manager"
```

## Task 4: Wire GUI Host Manager Into App-Server Runtime

**Files:**
- Modify: `codex-rs/app-server/src/lib.rs`
- Test: `codex-rs/app-server/src/lib.rs` or a focused new test module if file-local test organization requires it

- [ ] **Step 1: Create manager in the runtime scope**

In `run_main_with_transport_options`, after `transport_event_tx` is created, construct:

```rust
let gui_transport_backend = gui_transport::GuiTransportBackend::new(transport_event_tx.clone());
let gui_host_manager = gui_host::GuiHostManager::new(gui_transport_backend);
```

Keep this manager in the runtime scope that also owns `transport_shutdown_token`.

- [ ] **Step 2: Ensure runtime shutdown stops GUI host**

At the end of `run_main_with_transport_options`, before returning, call:

```rust
gui_host_manager.shutdown().await;
```

This must run on normal shutdown and after processor/outbound tasks are drained or aborted.

- [ ] **Step 3: Do not add GUI processing branches**

Do not add a separate GUI request-processing path to the app-server processor loop. GUI traffic must enter through the existing branch:

```rust
TransportEvent::IncomingMessage { connection_id, message } => {
    // existing request/response/notification/error handling
}
```

- [ ] **Step 4: Add runtime wiring test**

Add a focused test in `gui_transport.rs` that verifies a `GuiTransportBackend` created with the same `transport_event_tx` produces the exact `TransportEvent` variants consumed by the existing runtime loop. Do not add a broad runtime harness in this bridge task.

Run from `codex-rs`:

```bash
cargo test -p codex-app-server gui_transport
```

Expected: GUI transport tests still pass.

- [ ] **Step 5: Commit**

```bash
git add codex-rs/app-server/src/lib.rs codex-rs/app-server/src/gui_host.rs codex-rs/app-server/src/gui_transport.rs
git commit -m "feat(app-server): wire GUI host into transport runtime"
```

## Task 5: Keep App-Server-Client API Launch-URL Oriented

**Files:**
- Modify: `codex-rs/app-server-client/src/lib.rs`

- [ ] **Step 1: Remove raw backend tests from the obsolete route**

Delete obsolete tests named like:

```rust
in_process_client_exposes_gui_backend
request_handle_does_not_expose_gui_backend
```

- [ ] **Step 2: Add API shape for launch URL access**

Add a launch-oriented result type, but do not expose `GuiBackendHandle`:

```rust
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GuiLaunchUrl {
    pub url: String,
}

#[derive(Debug)]
pub enum GuiLaunchError {
    Unsupported,
    Transport(std::io::Error),
}
```

Add methods on public client facades:

```rust
impl AppServerClient {
    pub async fn gui_launch_url(
        &self,
        primary_thread_id: &str,
    ) -> Result<GuiLaunchUrl, GuiLaunchError> {
        match self {
            Self::InProcess(client) => client.gui_launch_url(primary_thread_id).await,
            Self::Remote(_) => Err(GuiLaunchError::Unsupported),
        }
    }
}
```

For this bridge plan, the in-process implementation returns `GuiLaunchError::Unsupported`. This prevents accidental raw backend exposure and keeps `03-tui-entry.md` focused on launch URL access instead of backend access.

- [ ] **Step 3: Add unsupported tests**

Add tests:

```rust
#[tokio::test]
async fn gui_launch_url_does_not_expose_raw_backend_for_in_process_client() {
    let client = start_test_client(SessionSource::Cli).await;
    let err = client
        .gui_launch_url("thread-test")
        .await
        .expect_err("bridge plan should not expose raw backend through in-process client");
    assert!(matches!(err, GuiLaunchError::Unsupported));
    client.shutdown().await.expect("shutdown");
}
```

- [ ] **Step 4: Run client tests**

Run from `codex-rs`:

```bash
cargo test -p codex-app-server-client gui_launch
```

Expected: launch API shape tests pass and no raw backend handle is exported.

- [ ] **Step 5: Commit**

```bash
git add codex-rs/app-server-client/src/lib.rs
git commit -m "refactor(app-server-client): keep GUI API launch-url oriented"
```

## Task 6: Focused Verification

**Files:**
- Verify: `codex-rs/app-server-transport/src/transport/mod.rs`
- Verify: `codex-rs/app-server/src/gui_transport.rs`
- Verify: `codex-rs/app-server/src/gui_host.rs`
- Verify: `codex-rs/app-server/src/lib.rs`
- Verify: `codex-rs/app-server/src/in_process.rs`
- Verify: `codex-rs/app-server-client/src/lib.rs`

- [ ] **Step 1: Run focused tests**

Run from `codex-rs`:

```bash
cargo test -p codex-app-server-transport connection_origin_has_distinct_gui_host_variant
cargo test -p codex-app-server gui_transport
cargo test -p codex-app-server gui_host
cargo test -p codex-app-server-client gui_launch
```

Expected: all focused tests pass.

- [ ] **Step 2: Run formatter**

Run from `codex-rs`:

```bash
just fmt
```

Expected: formatting completes successfully.

- [ ] **Step 3: Run scoped lints**

Run from `codex-rs`:

```bash
just fix -p codex-app-server-transport
just fix -p codex-app-server
just fix -p codex-app-server-client
```

Expected: no remaining lint failures.

- [ ] **Step 4: Inspect remaining `in_process.rs` diff**

Run from repo root:

```bash
git diff --stat 01-gui-host-crate..HEAD -- codex-rs/app-server/src/in_process.rs
git diff 01-gui-host-crate..HEAD -- codex-rs/app-server/src/in_process.rs
```

Expected: no GUI multi-connection runtime remains in `in_process.rs`. Any remaining diff must be unrelated to GUI bridge lifecycle.

- [ ] **Step 5: Commit verification cleanup**

If `fmt` or `fix` changed files:

```bash
git add codex-rs/app-server-transport/src/transport/mod.rs codex-rs/app-server/src/gui_transport.rs codex-rs/app-server/src/gui_host.rs codex-rs/app-server/src/lib.rs codex-rs/app-server-client/src/lib.rs
git commit -m "chore(gui): format GUI transport bridge"
```

## Handoff Notes

- `03-tui-entry.md` must be rewritten after this plan. It should request a launch URL and must not instantiate `GuiHost` in TUI.
- **Design boundary — in-process TUI path:** `GuiHostManager` is wired into `run_main_with_transport_options` (the external stdio/WebSocket runtime), which owns `transport_event_tx`. The spec (`docs/superpowers/specs/2026-05-11-codex-gui-host-redesign.md`) requires GUI host lazy-start to happen in the scope that owns `transport_event_tx`, and forbids expanding `codex-rs/app-server/src/in_process.rs` into a multi-connection transport loop or copying `run_main_with_transport_options` connection maps / outbound routing / close cleanup into another runtime. The embedded TUI runtime in `in_process.rs` deliberately has no `transport_event_tx`; it uses a single-connection `ProcessorCommand` pipeline. Consequently, `InProcessAppServerClient::gui_launch_url` returns `GuiLaunchError::Unsupported`, and the TUI `/gui` command prints "GUI is not available for this app-server session yet." on the in-process path. This is the designed behavior, not a gap: `/gui` delivers a real URL only when TUI runs against an external app-server session (stdio or WebSocket). The 04-frontend-handshake and 05-packaging end-to-end acceptance gates apply to that external-session path.
- Do not weaken the transport MVP by routing browser requests through ad hoc app-server-client request calls; browser traffic must reach app-server as `TransportEvent` traffic.
