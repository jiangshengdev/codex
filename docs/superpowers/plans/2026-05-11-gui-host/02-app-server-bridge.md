# Codex GUI App-Server Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect authenticated GUI JSON-RPC traffic to the existing app-server projection pipeline.

**Architecture:** This plan is copied from original Tasks 6-7 and 9. It owns app-server connection adaptation, bridge implementation, and browser-style projection integration tests.

**Tech Stack:** Rust 2024, codex-app-server, codex-app-server-client, codex-app-server-transport, codex-app-server-protocol, tokio.

---

Source: split from `docs/superpowers/plans/2026-05-11-codex-gui-host-redesign.md`. The source file is deleted after this split because these files replace it.

### Task 6: Add app-server extra JSON-RPC connection support

**Files:**
- Modify: `codex-rs/app-server-transport/src/transport/mod.rs`
- Modify: `codex-rs/app-server/src/in_process.rs`
- Test: `codex-rs/app-server/src/in_process.rs`

- [ ] **Step 1: Write a failing test**

Add this test to `codex-rs/app-server/src/in_process.rs` tests:

```rust
#[tokio::test]
async fn extra_jsonrpc_connection_handles_initialize_request() {
    let mut client = start_test_client(SessionSource::Cli).await;
    let connection = client
        .open_extra_jsonrpc_connection()
        .expect("extra connection should open");

    connection
        .send_text(
            r#"{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"clientInfo":{"name":"gui-test","version":"0.0.0"},"capabilities":{}}}"#,
        )
        .await
        .expect("initialize should send");

    let response = connection
        .recv_text()
        .await
        .expect("initialize response should arrive");
    assert!(response.contains(r#""id":1"#));
    assert!(response.contains(r#""result":"#));

    client.shutdown().await.expect("shutdown");
}
```

- [ ] **Step 2: Run the test to confirm FAIL**

Run:

```bash
cargo test -p codex-app-server in_process::tests::extra_jsonrpc_connection_handles_initialize_request
```

Expected failure:

```text
error[E0599]: no method named `open_extra_jsonrpc_connection` found for struct `InProcessClientHandle`
```

- [ ] **Step 3: Implement extra connection API**

Add `GuiHost` to `ConnectionOrigin` in `codex-rs/app-server-transport/src/transport/mod.rs`:

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ConnectionOrigin {
    Stdio,
    InProcess,
    WebSocket,
    RemoteControl,
    GuiHost,
}
```

In `codex-rs/app-server/src/in_process.rs`, add an extra connection command:

```rust
enum InProcessClientMessage {
    Request {
        request: Box<ClientRequest>,
        response_tx: oneshot::Sender<PendingClientRequestResponse>,
    },
    Notification {
        notification: ClientNotification,
    },
    ServerRequestResponse {
        request_id: RequestId,
        result: Result,
    },
    ServerRequestError {
        request_id: RequestId,
        error: JSONRPCErrorError,
    },
    OpenExtraJsonRpcConnection {
        response_tx: oneshot::Sender<IoResult<ExtraJsonRpcConnection>>,
    },
    Shutdown {
        done_tx: oneshot::Sender<()>,
    },
}
```

Add public connection handle types:

```rust
#[derive(Clone)]
pub struct ExtraJsonRpcConnectionSender {
    tx: mpsc::Sender<String>,
}

pub struct ExtraJsonRpcConnection {
    sender: ExtraJsonRpcConnectionSender,
    rx: mpsc::Receiver<String>,
}

impl ExtraJsonRpcConnection {
    pub async fn send_text(&self, text: impl Into<String>) -> IoResult<()> {
        self.sender
            .tx
            .send(text.into())
            .await
            .map_err(|err| IoError::new(ErrorKind::BrokenPipe, err.to_string()))
    }

    pub async fn recv_text(&mut self) -> IoResult<String> {
        self.rx
            .recv()
            .await
            .ok_or_else(|| IoError::new(ErrorKind::BrokenPipe, "extra JSON-RPC connection closed"))
    }
}
```

Add method:

```rust
impl InProcessClientHandle {
    pub async fn open_extra_jsonrpc_connection(&self) -> IoResult<ExtraJsonRpcConnection> {
        let (response_tx, response_rx) = oneshot::channel();
        self.client.try_send_client_message(
            InProcessClientMessage::OpenExtraJsonRpcConnection { response_tx },
        )?;
        response_rx.await.map_err(|err| {
            IoError::new(
                ErrorKind::BrokenPipe,
                format!("extra connection response channel closed: {err}"),
            )
        })?
    }
}
```

Inside the `start_uninitialized` runtime task, maintain a map:

```rust
let mut extra_connection_next_id = 1_u64;
let mut extra_connection_writers =
    HashMap::<ConnectionId, mpsc::Sender<QueuedOutgoingMessage>>::new();
let mut extra_connection_sessions =
    HashMap::<ConnectionId, Arc<ConnectionSessionState>>::new();
```

Handle `OpenExtraJsonRpcConnection` by creating:

```rust
let connection_id = ConnectionId(extra_connection_next_id);
extra_connection_next_id += 1;
let session = Arc::new(ConnectionSessionState::new());
let (incoming_tx, mut incoming_rx) = mpsc::channel::<String>(channel_capacity);
let (outgoing_text_tx, outgoing_text_rx) = mpsc::channel::<String>(channel_capacity);
let (writer_tx, mut writer_rx) = mpsc::channel::<QueuedOutgoingMessage>(channel_capacity);
let outbound_initialized = Arc::new(AtomicBool::new(false));
let outbound_experimental_api_enabled = Arc::new(AtomicBool::new(false));
let outbound_opted_out_notification_methods = Arc::new(RwLock::new(HashSet::new()));

outbound_connections.insert(
    connection_id,
    OutboundConnectionState::new(
        writer_tx.clone(),
        Arc::clone(&outbound_initialized),
        Arc::clone(&outbound_experimental_api_enabled),
        Arc::clone(&outbound_opted_out_notification_methods),
        /*disconnect_sender*/ None,
    ),
);
extra_connection_writers.insert(connection_id, writer_tx);
extra_connection_sessions.insert(connection_id, Arc::clone(&session));
```

Spawn one task to forward incoming JSON text into the same processor path used by in-process requests. Parse with `serde_json::from_str::<codex_app_server_protocol::JSONRPCMessage>(&text)`, then for requests call `processor.process_request(...)` using `AppServerTransport::Off` as the transport marker and update initialized/experimental/notification state exactly like the main transport loop does. For responses/errors/notifications call `processor.process_response`, `processor.process_error`, or `processor.process_notification`.

Spawn one task to serialize `QueuedOutgoingMessage` from `writer_rx` with `serde_json::to_string(&queued_message.message)` and send it to `outgoing_text_tx`; complete `write_complete_tx` after sending.

The response to `OpenExtraJsonRpcConnection` is:

```rust
let _ = response_tx.send(Ok(ExtraJsonRpcConnection {
    sender: ExtraJsonRpcConnectionSender { tx: incoming_tx },
    rx: outgoing_text_rx,
}));
```

When either task exits, remove the connection from `outbound_connections`, call `processor.connection_closed(connection_id, &session).await`, and remove it from the extra maps.

- [ ] **Step 4: Run the test to verify PASS**

Run:

```bash
cargo test -p codex-app-server in_process::tests::extra_jsonrpc_connection_handles_initialize_request
```

Expected:

```text
test in_process::tests::extra_jsonrpc_connection_handles_initialize_request ... ok
```

- [ ] **Step 5: Commit**

```bash
git add codex-rs/app-server-transport/src/transport/mod.rs codex-rs/app-server/src/in_process.rs
git commit -m "feat(app-server): support extra JSON-RPC connections"
```

---

### Task 7: Implement app-server GUI bridge

**Files:**
- Modify: `codex-rs/app-server/Cargo.toml`
- Modify: `codex-rs/app-server/src/lib.rs`
- Create: `codex-rs/app-server/src/gui_bridge.rs`
- Modify: `codex-rs/app-server-client/src/lib.rs`
- Test: `codex-rs/app-server/src/gui_bridge.rs`

- [ ] **Step 1: Write failing test**

Create `codex-rs/app-server/src/gui_bridge.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn bridge_forwards_initialize_response() {
        let mut client = crate::in_process::tests::start_test_client_for_gui_bridge().await;
        let backend = AppServerGuiBackend::new(client.extra_jsonrpc_connection_factory());
        let (connection, inbound_tx, mut outbound_rx) =
            codex_gui_host::AuthenticatedGuiConnection::new();

        let task = tokio::spawn(async move { backend.connect(connection).await });
        inbound_tx
            .send(
                r#"{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"clientInfo":{"name":"gui-test","version":"0.0.0"},"capabilities":{}}}"#
                    .to_string(),
            )
            .await
            .unwrap();

        let response = outbound_rx.recv().await.expect("response");
        assert!(response.contains(r#""id":1"#));
        assert!(response.contains(r#""result":"#));

        task.abort();
        client.shutdown().await.expect("shutdown");
    }
}
```

- [ ] **Step 2: Run the test to verify FAIL**

Run:

```bash
cargo test -p codex-app-server gui_bridge::tests::bridge_forwards_initialize_response
```

Expected failures include unresolved `codex_gui_host`, `AppServerGuiBackend`, and `extra_jsonrpc_connection_factory`.

- [ ] **Step 3: Implement bridge**

Modify `codex-rs/app-server/Cargo.toml`:

```toml
[dependencies]
codex-gui-host = { workspace = true }
```

Modify `codex-rs/app-server/src/lib.rs`:

```rust
pub mod gui_bridge;
```

Replace `codex-rs/app-server/src/gui_bridge.rs`:

```rust
use std::sync::Arc;

use codex_gui_host::AuthenticatedGuiConnection;
use codex_gui_host::GuiBackend;

use crate::in_process::ExtraJsonRpcConnectionFactory;

#[derive(Clone)]
pub struct AppServerGuiBackend {
    factory: Arc<ExtraJsonRpcConnectionFactory>,
}

impl AppServerGuiBackend {
    pub fn new(factory: ExtraJsonRpcConnectionFactory) -> Self {
        Self {
            factory: Arc::new(factory),
        }
    }
}

impl GuiBackend for AppServerGuiBackend {
    async fn connect(&self, mut connection: AuthenticatedGuiConnection) -> anyhow::Result<()> {
        let mut app_connection = self.factory.open().await?;
        loop {
            tokio::select! {
                inbound = connection.inbound_rx.recv() => {
                    let Some(text) = inbound else {
                        break;
                    };
                    app_connection.send_text(text).await?;
                }
                outbound = app_connection.recv_text() => {
                    let text = outbound?;
                    if connection.outbound_tx.send(text).await.is_err() {
                        break;
                    }
                }
            }
        }
        Ok(())
    }
}
```

In `codex-rs/app-server/src/in_process.rs`, add:

```rust
#[derive(Clone)]
pub struct ExtraJsonRpcConnectionFactory {
    client: InProcessClientSender,
}

impl ExtraJsonRpcConnectionFactory {
    pub async fn open(&self) -> IoResult<ExtraJsonRpcConnection> {
        let (response_tx, response_rx) = oneshot::channel();
        self.client.try_send_client_message(
            InProcessClientMessage::OpenExtraJsonRpcConnection { response_tx },
        )?;
        response_rx.await.map_err(|err| {
            IoError::new(
                ErrorKind::BrokenPipe,
                format!("extra connection response channel closed: {err}"),
            )
        })?
    }
}

impl InProcessClientHandle {
    pub fn extra_jsonrpc_connection_factory(&self) -> ExtraJsonRpcConnectionFactory {
        ExtraJsonRpcConnectionFactory {
            client: self.client.clone(),
        }
    }
}
```

In `codex-rs/app-server-client/src/lib.rs`, expose backend only for in-process clients:

```rust
impl InProcessAppServerClient {
    pub fn gui_backend(&self) -> codex_app_server::gui_bridge::AppServerGuiBackend {
        codex_app_server::gui_bridge::AppServerGuiBackend::new(
            self.raw_handle().extra_jsonrpc_connection_factory(),
        )
    }
}
```

If `InProcessAppServerClient` does not currently retain the raw handle needed for `raw_handle()`, add a cloneable `ExtraJsonRpcConnectionFactory` field to `InProcessAppServerClient` at startup and return it from `gui_backend()`.

- [ ] **Step 4: Run bridge test to verify PASS**

Run:

```bash
cargo test -p codex-app-server gui_bridge::tests::bridge_forwards_initialize_response
```

Expected:

```text
test gui_bridge::tests::bridge_forwards_initialize_response ... ok
```

- [ ] **Step 5: Commit**

```bash
git add codex-rs/app-server codex-rs/app-server-client codex-rs/Cargo.lock
git commit -m "feat(app-server): add GUI backend bridge"
```

---

### Task 9: Add app-server GUI bridge integration tests

**Files:**
- Create: `codex-rs/app-server/tests/suite/v2/gui_host_bridge.rs`
- Modify: `codex-rs/app-server/tests/suite/v2/mod.rs`
- Test: `codex-rs/app-server/tests/suite/v2/gui_host_bridge.rs`

- [ ] **Step 1: Write failing integration test**

Create `codex-rs/app-server/tests/suite/v2/gui_host_bridge.rs`:

```rust
use anyhow::Context;
use anyhow::Result;
use codex_app_server::gui_bridge::AppServerGuiBackend;
use codex_app_server::in_process;
use codex_app_server_protocol::ClientInfo;
use codex_app_server_protocol::InitializeCapabilities;
use codex_app_server_protocol::InitializeParams;
use codex_app_server_protocol::RequestId;
use codex_config::CloudRequirementsLoader;
use codex_config::LoaderOverrides;
use codex_config::NoopThreadConfigLoader;
use codex_core::config::Config;
use codex_exec_server::EnvironmentManager;
use codex_feedback::CodexFeedback;
use codex_gui_host::AuthenticatedGuiConnection;
use codex_gui_host::GuiBackend;
use codex_protocol::protocol::SessionSource;
use pretty_assertions::assert_eq;
use serde_json::Value;
use std::sync::Arc;
use tempfile::TempDir;

#[tokio::test]
async fn gui_backend_returns_initialize_response() -> Result<()> {
    let tempdir = TempDir::new()?;
    let config = Arc::new(
        Config::load_default_with_cli_overrides_for_codex_home(
            tempdir.path().to_path_buf(),
            Vec::new(),
        )
        .await?,
    );
    let client = in_process::start(in_process::InProcessStartArgs {
        arg0_paths: Default::default(),
        config,
        cli_overrides: Vec::new(),
        loader_overrides: LoaderOverrides::default(),
        cloud_requirements: CloudRequirementsLoader::default(),
        thread_config_loader: Arc::new(NoopThreadConfigLoader),
        feedback: CodexFeedback::new(),
        log_db: None,
        state_db: None,
        environment_manager: Arc::new(EnvironmentManager::default_for_tests()),
        config_warnings: Vec::new(),
        session_source: SessionSource::Cli,
        enable_codex_api_key_env: false,
        initialize: InitializeParams {
            client_info: ClientInfo {
                name: "test-bootstrap".to_string(),
                title: None,
                version: "0.0.0".to_string(),
            },
            capabilities: Some(InitializeCapabilities {
                experimental_api: false,
                opt_out_notification_methods: None,
            }),
        },
        channel_capacity: in_process::DEFAULT_IN_PROCESS_CHANNEL_CAPACITY,
    })
    .await?;

    let backend = AppServerGuiBackend::new(client.extra_jsonrpc_connection_factory());
    let (connection, inbound_tx, mut outbound_rx) = AuthenticatedGuiConnection::new();
    let task = tokio::spawn(async move { backend.connect(connection).await });

    inbound_tx
        .send(
            r#"{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"clientInfo":{"name":"gui-test","version":"0.0.0"},"capabilities":{}}}"#
                .to_string(),
        )
        .await?;
    let response = outbound_rx.recv().await.context("response")?;
    let value: Value = serde_json::from_str(&response)?;
    assert_eq!(value["id"], Value::from(1));
    assert!(value.get("result").is_some());

    task.abort();
    client.shutdown().await?;
    Ok(())
}
```

Modify `codex-rs/app-server/tests/suite/v2/mod.rs`:

```rust
mod gui_host_bridge;
```

- [ ] **Step 2: Run test to verify FAIL**

Run:

```bash
cargo test -p codex-app-server gui_backend_returns_initialize_response
```

Expected failure before Task 7 is implemented:

```text
unresolved import `codex_app_server::gui_bridge`
```

If Task 7 is complete, this test should fail only if the bridge does not forward responses.

- [ ] **Step 3: Keep implementation in app-server bridge**

No new business logic belongs in this integration test task. If the test fails, fix `codex-rs/app-server/src/gui_bridge.rs` or `codex-rs/app-server/src/in_process.rs` so the bridge forwards raw JSON-RPC into the existing app-server runtime.

- [ ] **Step 4: Run test to verify PASS**

Run:

```bash
cargo test -p codex-app-server gui_backend_returns_initialize_response
```

Expected:

```text
test suite::v2::gui_host_bridge::gui_backend_returns_initialize_response ... ok
```

- [ ] **Step 5: Commit**

```bash
git add codex-rs/app-server/tests/suite/v2 codex-rs/app-server/src
git commit -m "test(app-server): cover GUI bridge JSON-RPC transport"
```

---
