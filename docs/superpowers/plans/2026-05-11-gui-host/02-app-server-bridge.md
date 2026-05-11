# Codex GUI App-Server Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect authenticated GUI JSON-RPC traffic to the existing app-server projection pipeline.

**Architecture:** This plan is copied from original Tasks 6-7 and 9. It owns app-server connection adaptation, bridge implementation, and browser-style projection integration tests.

**Tech Stack:** Rust 2024, codex-app-server, codex-app-server-client, codex-app-server-transport, codex-app-server-protocol, tokio.

---

Source: split from `docs/superpowers/plans/2026-05-11-codex-gui-host-redesign.md`. The source file is deleted after this split because these files replace it.

### Task 6a: Add app-server extra JSON-RPC connection types

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
    let mut connection = client
        .open_extra_jsonrpc_connection()
        .await
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

- [ ] **Step 3: Implement extra connection type skeleton**

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

Add a cloneable factory that can be retained by `app-server-client` without exposing a raw
`InProcessClientHandle`:

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

Inside the `start_uninitialized` runtime task, handle
`InProcessClientMessage::OpenExtraJsonRpcConnection` by creating channel pairs and returning the
handle. The first pass may return the handle before the forwarding loop exists:

```rust
let (incoming_tx, _incoming_rx) = mpsc::channel::<String>(channel_capacity);
let (_outgoing_text_tx, outgoing_text_rx) = mpsc::channel::<String>(channel_capacity);
let _ = response_tx.send(Ok(ExtraJsonRpcConnection {
    sender: ExtraJsonRpcConnectionSender { tx: incoming_tx },
    rx: outgoing_text_rx,
}));
```

- [ ] **Step 4: Run the test to verify the planned FAIL**

Run:

```bash
cargo test -p codex-app-server in_process::tests::extra_jsonrpc_connection_handles_initialize_request
```

Expected failure now moves from missing API to no response because the forward loop is not wired:

```text
initialize response should arrive
```

- [ ] **Step 5: Commit**

```bash
git add codex-rs/app-server-transport/src/transport/mod.rs codex-rs/app-server/src/in_process.rs
git commit -m "feat(app-server): add extra JSON-RPC connection handles"
```

---

### Task 6b: Wire extra JSON-RPC connections into in-process runtime

**Files:**
- Modify: `codex-rs/app-server/src/in_process.rs`
- Test: `codex-rs/app-server/src/in_process.rs`

- [ ] **Step 1: Write failing cleanup test**

Add this test next to `extra_jsonrpc_connection_handles_initialize_request`:

```rust
#[tokio::test]
async fn extra_jsonrpc_connection_close_runs_connection_cleanup() {
    let mut client = start_test_client(SessionSource::Cli).await;
    let mut connection = client
        .open_extra_jsonrpc_connection()
        .await
        .expect("extra connection should open");

    connection
        .send_text(
            r#"{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"clientInfo":{"name":"gui-test","version":"0.0.0"},"capabilities":{}}}"#,
        )
        .await
        .expect("initialize should send");
    let _ = connection.recv_text().await.expect("initialize response");

    drop(connection);
    client
        .wait_for_extra_connection_cleanup_for_test()
        .await
        .expect("cleanup should run");
    client.shutdown().await.expect("shutdown");
}
```

- [ ] **Step 2: Run tests to verify FAIL**

Run:

```bash
cargo test -p codex-app-server in_process::tests::extra_jsonrpc_connection_handles_initialize_request in_process::tests::extra_jsonrpc_connection_close_runs_connection_cleanup
```

Expected failures:

```text
initialize response should arrive
no method named `wait_for_extra_connection_cleanup_for_test`
```

- [ ] **Step 3: Implement runtime forwarding and cleanup**

Near the other module-private runtime message types, add control events for extra connection
registration and cleanup. Then route extra GUI connections through the same outbound router shape
used by app-server websocket connections:

```rust
enum InProcessOutboundControlEvent {
    Opened {
        connection_id: ConnectionId,
        writer: mpsc::Sender<QueuedOutgoingMessage>,
        initialized: Arc<AtomicBool>,
        experimental_api_enabled: Arc<AtomicBool>,
        opted_out_notification_methods: Arc<RwLock<HashSet<String>>>,
    },
    Closed {
        connection_id: ConnectionId,
    },
}

enum ExtraConnectionRuntimeEvent {
    Closed {
        connection_id: ConnectionId,
    },
}

let (outbound_control_tx, mut outbound_control_rx) =
    mpsc::channel::<InProcessOutboundControlEvent>(channel_capacity);
let (extra_connection_runtime_tx, mut extra_connection_runtime_rx) =
    mpsc::channel::<ExtraConnectionRuntimeEvent>(channel_capacity);
let mut extra_connection_next_id = 1_u64;
```

Create the channels above inside `start_uninitialized` before spawning the outbound router.

Update the existing outbound router task so `route_outgoing_envelope` remains the only place that
fans out `OutgoingEnvelope` values. This is the channel topology:

- `incoming_tx` is returned as `ExtraJsonRpcConnectionSender.tx`; dropping it means browser/backend
  input closed.
- `incoming_rx` is consumed by the per-connection task and forwarded into
  `MessageProcessor::process_request/process_response/process_error/process_notification`.
- `writer_tx` is registered in `outbound_connections` as an `OutboundConnectionState` writer.
- `writer_rx` is consumed by the per-connection task and serialized to `outgoing_text_tx`.
- `outgoing_text_rx` is returned as `ExtraJsonRpcConnection.rx`; dropping it means the browser/backend
  output side closed.

```rust
let mut outbound_handle = tokio::spawn(async move {
    let mut outbound_connections = HashMap::<ConnectionId, OutboundConnectionState>::new();
    outbound_connections.insert(
        IN_PROCESS_CONNECTION_ID,
        OutboundConnectionState::new(
            writer_tx,
            Arc::clone(&outbound_initialized),
            Arc::clone(&outbound_experimental_api_enabled),
            Arc::clone(&outbound_opted_out_notification_methods),
            /*disconnect_sender*/ None,
        ),
    );

    loop {
        tokio::select! {
            control = outbound_control_rx.recv() => {
                let Some(control) = control else {
                    break;
                };
                match control {
                    InProcessOutboundControlEvent::Opened {
                        connection_id,
                        writer,
                        initialized,
                        experimental_api_enabled,
                        opted_out_notification_methods,
                    } => {
                        outbound_connections.insert(
                            connection_id,
                            OutboundConnectionState::new(
                                writer,
                                initialized,
                                experimental_api_enabled,
                                opted_out_notification_methods,
                                /*disconnect_sender*/ None,
                            ),
                        );
                    }
                    InProcessOutboundControlEvent::Closed { connection_id } => {
                        outbound_connections.remove(&connection_id);
                    }
                }
            }
            envelope = outgoing_rx.recv() => {
                let Some(envelope) = envelope else {
                    break;
                };
                route_outgoing_envelope(&mut outbound_connections, envelope).await;
            }
        }
    }
});
```

Add this complete helper near `start_uninitialized`. It is intentionally aligned with
`ConnectionSessionState`, `OutboundConnectionState`, and `route_outgoing_envelope`: request handling
updates the per-connection session, initialize marks only this outbound connection ready, and cleanup
removes the connection after `processor.connection_closed(...)` has run.

```rust
fn spawn_extra_connection(
    connection_id: ConnectionId,
    channel_capacity: usize,
    processor: Arc<MessageProcessor>,
    outbound_control_tx: mpsc::Sender<InProcessOutboundControlEvent>,
    cleanup_tx: mpsc::Sender<ExtraConnectionRuntimeEvent>,
) -> IoResult<ExtraJsonRpcConnection> {
    let session = Arc::new(ConnectionSessionState::new());
    let (incoming_tx, mut incoming_rx) = mpsc::channel::<String>(channel_capacity);
    let (outgoing_text_tx, outgoing_text_rx) = mpsc::channel::<String>(channel_capacity);
    let (writer_tx, mut writer_rx) = mpsc::channel::<QueuedOutgoingMessage>(channel_capacity);
    let outbound_initialized = Arc::new(AtomicBool::new(false));
    let outbound_experimental_api_enabled = Arc::new(AtomicBool::new(false));
    let outbound_opted_out_notification_methods = Arc::new(RwLock::new(HashSet::new()));

    outbound_control_tx
        .try_send(InProcessOutboundControlEvent::Opened {
            connection_id,
            writer: writer_tx,
            initialized: Arc::clone(&outbound_initialized),
            experimental_api_enabled: Arc::clone(&outbound_experimental_api_enabled),
            opted_out_notification_methods: Arc::clone(&outbound_opted_out_notification_methods),
        })
        .map_err(|err| IoError::new(ErrorKind::WouldBlock, err.to_string()))?;

    let cleanup_tx_for_task = cleanup_tx.clone();
    let outbound_control_tx_for_task = outbound_control_tx.clone();
    tokio::spawn(async move {
        loop {
            tokio::select! {
                inbound = incoming_rx.recv() => {
                    let Some(text) = inbound else {
                        break;
                    };
                    let Ok(message) =
                        serde_json::from_str::<codex_app_server_protocol::JSONRPCMessage>(&text)
                    else {
                        continue;
                    };
                    match message {
                        codex_app_server_protocol::JSONRPCMessage::Request(request) => {
                            let was_initialized = session.initialized();
                            processor
                                .process_request(
                                    connection_id,
                                    request,
                                    &AppServerTransport::Off,
                                    Arc::clone(&session),
                                )
                                .await;

                            if let Ok(mut opted_out_notification_methods) =
                                outbound_opted_out_notification_methods.write()
                            {
                                *opted_out_notification_methods =
                                    session.opted_out_notification_methods();
                            } else {
                                warn!("failed to update GUI outbound opted-out notifications");
                            }
                            outbound_experimental_api_enabled
                                .store(session.experimental_api_enabled(), Ordering::Release);

                            if !was_initialized && session.initialized() {
                                processor
                                    .send_initialize_notifications_to_connection(connection_id)
                                    .await;
                                processor.connection_initialized(connection_id).await;
                                outbound_initialized.store(true, Ordering::Release);
                            }
                        }
                        codex_app_server_protocol::JSONRPCMessage::Response(response) => {
                            processor.process_response(response).await;
                        }
                        codex_app_server_protocol::JSONRPCMessage::Error(error) => {
                            processor.process_error(error).await;
                        }
                        codex_app_server_protocol::JSONRPCMessage::Notification(notification) => {
                            processor.process_notification(notification).await;
                        }
                    }
                }
                outgoing = writer_rx.recv() => {
                    let Some(queued_message) = outgoing else {
                        break;
                    };
                    let serialized = serde_json::to_string(&queued_message.message);
                    if let Ok(text) = serialized
                        && outgoing_text_tx.send(text).await.is_err()
                    {
                        let _ = queued_message.write_complete_tx.send(());
                        break;
                    }
                    let _ = queued_message.write_complete_tx.send(());
                }
            }
        }

        processor.connection_closed(connection_id, &session).await;
        let _ = outbound_control_tx_for_task
            .send(InProcessOutboundControlEvent::Closed { connection_id })
            .await;
        let _ = cleanup_tx_for_task
            .send(ExtraConnectionRuntimeEvent::Closed { connection_id })
            .await;
    });

    Ok(ExtraJsonRpcConnection {
        sender: ExtraJsonRpcConnectionSender { tx: incoming_tx },
        rx: outgoing_text_rx,
    })
}
```

Handle `OpenExtraJsonRpcConnection` by calling the helper and returning the channel handle:

```rust
let connection_id = ConnectionId(extra_connection_next_id);
extra_connection_next_id += 1;
let connection = spawn_extra_connection(
    connection_id,
    channel_capacity,
    Arc::clone(&processor),
    outbound_control_tx.clone(),
    extra_connection_runtime_tx.clone(),
);
let _ = response_tx.send(connection);
```

Drain cleanup events in the main runtime select. The test hook should wait for this event, which is
sent only after both `processor.connection_closed(connection_id, &session).await` and removal from
`outbound_connections` have been requested:

```rust
extra_closed = extra_connection_runtime_rx.recv() => {
    if let Some(ExtraConnectionRuntimeEvent::Closed { connection_id: _ }) = extra_closed {
        if let Some(done_tx) = pending_extra_cleanup_waiters.pop() {
            let _ = done_tx.send(());
        }
    }
}
```

For test hooks, store a pending oneshot sender and complete it from the cleanup event path. Add
helpers for cleanup waiting, projection subscription count, and emitting a non-allowlisted
notification:

```rust
enum InProcessClientMessage {
    // existing variants ...
    WaitForExtraConnectionCleanupForTest {
        done_tx: oneshot::Sender<()>,
    },
    ProjectionSubscriptionCountForTest {
        thread_id: codex_protocol::ThreadId,
        response_tx: oneshot::Sender<usize>,
    },
    SendServerNotificationForTest {
        notification: ServerNotification,
        response_tx: oneshot::Sender<()>,
    },
}

impl InProcessClientHandle {
    #[cfg(test)]
    pub async fn wait_for_extra_connection_cleanup_for_test(&self) -> IoResult<()> {
        let (done_tx, done_rx) = oneshot::channel();
        self.client.try_send_client_message(
            InProcessClientMessage::WaitForExtraConnectionCleanupForTest { done_tx },
        )?;
        done_rx.await.map_err(|err| IoError::new(ErrorKind::BrokenPipe, err.to_string()))
    }

    #[cfg(test)]
    pub async fn projection_subscription_count_for_test(
        &self,
        thread_id: &codex_protocol::ThreadId,
    ) -> usize {
        let (response_tx, response_rx) = oneshot::channel();
        self.client
            .try_send_client_message(
                InProcessClientMessage::ProjectionSubscriptionCountForTest {
                    thread_id: *thread_id,
                    response_tx,
                },
            )
            .expect("test hook should send");
        response_rx.await.expect("test hook should respond")
    }

    #[cfg(test)]
    pub async fn send_server_notification_for_test(
        &self,
        notification: ServerNotification,
    ) -> IoResult<()> {
        let (response_tx, response_rx) = oneshot::channel();
        self.client.try_send_client_message(
            InProcessClientMessage::SendServerNotificationForTest {
                notification,
                response_tx,
            },
        )?;
        response_rx.await.map_err(|err| IoError::new(ErrorKind::BrokenPipe, err.to_string()))
    }
}

// In the main select:
Some(InProcessClientMessage::WaitForExtraConnectionCleanupForTest { done_tx }) => {
    pending_extra_cleanup_waiters.push(done_tx);
}
Some(InProcessClientMessage::ProjectionSubscriptionCountForTest { thread_id, response_tx }) => {
    let count = outgoing_message_sender
        .thread_projection_manager()
        .subscriber_count_for_test(thread_id)
        .await;
    let _ = response_tx.send(count);
}
Some(InProcessClientMessage::SendServerNotificationForTest {
    notification,
    response_tx,
}) => {
    outgoing_message_sender
        .send_server_notification(notification)
        .await;
    let _ = response_tx.send(());
}
```

Add the matching test-only helper to `codex-rs/app-server/src/thread_projection.rs`:

```rust
impl ThreadProjectionManager {
    #[cfg(test)]
    pub(crate) async fn subscriber_count_for_test(&self, thread_id: ThreadId) -> usize {
        let inner = self.inner.lock().await;
        inner
            .threads
            .get(&thread_id)
            .map(|entry| entry.subscribers.len())
            .unwrap_or(0)
    }
}
```

Drop/refresh cleanup timing is explicit: dropping `ExtraJsonRpcConnectionSender` closes
`incoming_rx`, dropping `ExtraJsonRpcConnection.rx` makes `outgoing_text_tx.send(...)` fail, and
either condition exits the spawned task. The task then calls `processor.connection_closed`, sends
`InProcessOutboundControlEvent::Closed`, and completes the cleanup hook.

- [ ] **Step 4: Run the test to verify PASS**

Run:

```bash
cargo test -p codex-app-server in_process::tests::extra_jsonrpc_connection_handles_initialize_request in_process::tests::extra_jsonrpc_connection_close_runs_connection_cleanup
```

Expected:

```text
test in_process::tests::extra_jsonrpc_connection_handles_initialize_request ... ok
test in_process::tests::extra_jsonrpc_connection_close_runs_connection_cleanup ... ok
```

- [ ] **Step 5: Commit**

```bash
git add codex-rs/app-server/src/in_process.rs
git commit -m "feat(app-server): route extra JSON-RPC connections"
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

Use the `ExtraJsonRpcConnectionFactory` and
`InProcessClientHandle::extra_jsonrpc_connection_factory()` added in Task 6a; do not introduce a
second factory type in `gui_bridge.rs`.

In `codex-rs/app-server-client/src/lib.rs`, add the explicit re-export and expose the backend only
for in-process clients:

```rust
pub use codex_app_server::gui_bridge::AppServerGuiBackend as GuiBackendHandle;

impl InProcessAppServerClient {
    pub fn gui_backend(&self) -> GuiBackendHandle {
        GuiBackendHandle::new(self.extra_jsonrpc_connection_factory.clone())
    }
}
```

Also expose an enum-level helper for TUI callers that may be connected to a remote app-server:

```rust
impl AppServerClient {
    pub fn gui_backend(&self) -> Option<GuiBackendHandle> {
        match self {
            AppServerClient::InProcess(client) => Some(client.gui_backend()),
            _ => None,
        }
    }
}
```

`InProcessClientHandle` does not expose a `raw_handle()` API. Add a cloneable
`extra_jsonrpc_connection_factory: codex_app_server::in_process::ExtraJsonRpcConnectionFactory`
field to `InProcessAppServerClient` when it is constructed from the in-process handle, and return
that field from `gui_backend()`. Remote app-server clients do not expose a GUI backend.

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
use codex_app_server::in_process;
use codex_app_server_protocol::ClientInfo;
use codex_app_server_protocol::ClientRequest;
use codex_app_server_protocol::InitializeCapabilities;
use codex_app_server_protocol::InitializeParams;
use codex_app_server_protocol::RequestId;
use codex_app_server_protocol::ServerNotification;
use codex_app_server_protocol::ThreadInjectItemsParams;
use codex_app_server_protocol::ThreadInjectItemsResponse;
use codex_app_server_protocol::ThreadStartParams;
use codex_app_server_protocol::ThreadStartResponse;
use codex_app_server_protocol::ThreadStatus;
use codex_app_server_protocol::ThreadStatusChangedNotification;
use codex_config::CloudRequirementsLoader;
use codex_config::LoaderOverrides;
use codex_config::NoopThreadConfigLoader;
use codex_core::config::Config;
use codex_exec_server::EnvironmentManager;
use codex_feedback::CodexFeedback;
use codex_gui_host::DevAssetProxyConfig;
use codex_gui_host::GuiHost;
use codex_gui_host::GuiHostConfig;
use codex_gui_host::GuiHostMode;
use codex_protocol::ThreadId;
use codex_protocol::models::ContentItem;
use codex_protocol::models::ResponseItem;
use codex_protocol::protocol::SessionSource;
use futures::SinkExt;
use futures::StreamExt;
use pretty_assertions::assert_eq;
use serde_json::Value;
use std::sync::Arc;
use tempfile::TempDir;
use tokio::time::Duration;
use tokio::time::timeout;
use tokio_tungstenite::connect_async;
use tokio_tungstenite::tungstenite::Message as TungsteniteMessage;
use tokio_tungstenite::tungstenite::client::IntoClientRequest;

struct GuiBridgeFixture {
    client: in_process::InProcessClientHandle,
    host: codex_gui_host::GuiHostHandle,
}

impl GuiBridgeFixture {
    async fn shutdown(self) -> Result<()> {
        self.host.shutdown().await;
        self.client.shutdown().await?;
        Ok(())
    }
}

async fn start_gui_bridge_for_test() -> Result<GuiBridgeFixture> {
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

    let backend =
        codex_app_server::gui_bridge::AppServerGuiBackend::new(client.extra_jsonrpc_connection_factory());
    let host = GuiHost::start(
        GuiHostConfig {
            mode: GuiHostMode::Dev(DevAssetProxyConfig::default()),
        },
        backend,
    )
    .await?;
    Ok(GuiBridgeFixture { client, host })
}

async fn start_thread_for_test(client: &in_process::InProcessClientHandle) -> Result<ThreadId> {
    let result = client
        .request(ClientRequest::ThreadStart {
            request_id: RequestId::Integer(100),
            params: ThreadStartParams {
                model: Some("mock-model".to_string()),
                ..Default::default()
            },
        })
        .await??;
    let response: ThreadStartResponse = serde_json::from_value(result)?;
    Ok(ThreadId::from_string(&response.thread.id)?)
}

async fn append_test_thread_item(
    client: &in_process::InProcessClientHandle,
    thread_id: &ThreadId,
) -> Result<()> {
    let result = client
        .request(ClientRequest::ThreadInjectItems {
            request_id: RequestId::Integer(101),
            params: ThreadInjectItemsParams {
                thread_id: thread_id.to_string(),
                items: vec![serde_json::to_value(ResponseItem::Message {
                    id: None,
                    role: "assistant".to_string(),
                    content: vec![ContentItem::OutputText {
                        text: "projection update".to_string(),
                    }],
                    phase: None,
                })?],
            },
        })
        .await??;
    let _: ThreadInjectItemsResponse = serde_json::from_value(result)?;
    Ok(())
}

async fn emit_thread_status_changed_for_test(
    client: &in_process::InProcessClientHandle,
    thread_id: &ThreadId,
) -> Result<()> {
    client
        .send_server_notification_for_test(ServerNotification::ThreadStatusChanged(
            ThreadStatusChangedNotification {
                thread_id: thread_id.to_string(),
                status: ThreadStatus::Idle,
            },
        ))
        .await?;
    Ok(())
}

async fn open_authenticated_ws(
    host: &codex_gui_host::GuiHostHandle,
) -> Result<tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>>>
{
    let mut request = format!("ws://{}/ws", host.local_addr()).into_client_request()?;
    request.headers_mut().insert(
        "origin",
        format!("http://{}", host.local_addr()).parse()?,
    );
    let (mut ws, _) = connect_async(request).await?;
    ws.send(TungsteniteMessage::Text(
        serde_json::json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "gui/authenticate",
            "params": { "token": host.launch_token().as_str() },
        })
        .to_string()
        .into(),
    ))
    .await?;
    let auth = ws.next().await.context("auth response")??;
    let auth: Value = serde_json::from_str(&auth.into_text()?)?;
    assert_eq!(auth["id"], Value::from(1));
    assert_eq!(auth["result"]["authenticated"], Value::from(true));
    Ok(ws)
}

async fn initialize_and_attach(
    ws: &mut tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>>,
    thread_id: &ThreadId,
) -> Result<()> {
    ws.send(TungsteniteMessage::Text(
        r#"{"jsonrpc":"2.0","id":2,"method":"initialize","params":{"clientInfo":{"name":"gui-test","version":"0.0.0"},"capabilities":{}}}"#
            .to_string()
            .into(),
    ))
    .await?;
    let initialize = ws.next().await.context("initialize response")??;
    let initialize: Value = serde_json::from_str(&initialize.into_text()?)?;
    assert_eq!(initialize["id"], Value::from(2));
    assert!(initialize.get("result").is_some());

    ws.send(TungsteniteMessage::Text(
        serde_json::json!({
            "jsonrpc": "2.0",
            "id": 3,
            "method": "thread/projection/attach",
            "params": { "threadId": thread_id.to_string() },
        })
        .to_string()
        .into(),
    ))
    .await?;
    let attach = ws.next().await.context("attach response")??;
    let attach: Value = serde_json::from_str(&attach.into_text()?)?;
    assert_eq!(attach["id"], Value::from(3));
    assert!(attach.get("result").is_some());
    Ok(())
}

#[tokio::test]
async fn gui_backend_returns_initialize_response() -> Result<()> {
    let fixture = start_gui_bridge_for_test().await?;
    let mut ws = open_authenticated_ws(&fixture.host).await?;
    ws.send(TungsteniteMessage::Text(
        r#"{"jsonrpc":"2.0","id":2,"method":"initialize","params":{"clientInfo":{"name":"gui-test","version":"0.0.0"},"capabilities":{}}}"#
            .to_string()
            .into(),
    ))
    .await?;
    let response = ws.next().await.context("initialize response")??;
    let value: Value = serde_json::from_str(&response.into_text()?)?;
    assert_eq!(value["id"], Value::from(2));
    assert!(value.get("result").is_some());

    fixture.shutdown().await?;
    Ok(())
}

#[tokio::test]
async fn gui_backend_attach_receives_projection_event() -> Result<()> {
    let fixture = start_gui_bridge_for_test().await?;
    let mut ws = open_authenticated_ws(&fixture.host).await?;
    let thread_id = start_thread_for_test(&fixture.client).await?;
    initialize_and_attach(&mut ws, &thread_id).await?;

    append_test_thread_item(&fixture.client, &thread_id)
        .await
        .context("projection update should be produced")?;
    let event = timeout(Duration::from_secs(1), ws.next())
        .await
        .context("projection event timed out")?
        .context("projection event")??;
    let event: Value = serde_json::from_str(&event.into_text()?)?;
    assert_eq!(event["method"], Value::from("thread/projection/event"));

    fixture.shutdown().await?;
    Ok(())
}

#[tokio::test]
async fn gui_backend_close_cleans_projection_subscription() -> Result<()> {
    let fixture = start_gui_bridge_for_test().await?;
    let mut ws = open_authenticated_ws(&fixture.host).await?;
    let thread_id = start_thread_for_test(&fixture.client).await?;
    initialize_and_attach(&mut ws, &thread_id).await?;

    ws.close(None).await?;
    fixture
        .client
        .wait_for_extra_connection_cleanup_for_test()
        .await?;
    assert_eq!(
        fixture
            .client
            .projection_subscription_count_for_test(&thread_id)
            .await,
        0
    );
    fixture.shutdown().await?;
    Ok(())
}

#[tokio::test]
async fn gui_backend_does_not_send_non_allowlisted_notifications() -> Result<()> {
    let fixture = start_gui_bridge_for_test().await?;
    let mut ws = open_authenticated_ws(&fixture.host).await?;
    let thread_id = start_thread_for_test(&fixture.client).await?;
    initialize_and_attach(&mut ws, &thread_id).await?;

    emit_thread_status_changed_for_test(&fixture.client, &thread_id)
        .await
        .context("status notification should be produced")?;

    let read = timeout(Duration::from_millis(200), ws.next()).await;
    if let Ok(Some(Ok(message))) = read {
        let value: Value = serde_json::from_str(&message.into_text()?)?;
        assert_ne!(value["method"], Value::from("thread/status/changed"));
    }

    fixture.shutdown().await?;
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
cargo test -p codex-app-server gui_backend_returns_initialize_response gui_backend_attach_receives_projection_event gui_backend_close_cleans_projection_subscription gui_backend_does_not_send_non_allowlisted_notifications
```

Expected failure before Task 7 is implemented:

```text
unresolved import `codex_app_server::gui_bridge`
```

If Task 7 is complete, remaining failures should identify missing browser-style auth, attach/event,
cleanup, projection-count hook, or notification-filter behavior rather than missing symbols.

- [ ] **Step 3: Keep implementation in app-server bridge**

No new business logic belongs in this integration test task. If the test fails, fix `codex-rs/app-server/src/gui_bridge.rs` or `codex-rs/app-server/src/in_process.rs` so the bridge forwards raw JSON-RPC into the existing app-server runtime.

- [ ] **Step 4: Run test to verify PASS**

Run:

```bash
cargo test -p codex-app-server gui_backend_returns_initialize_response gui_backend_attach_receives_projection_event gui_backend_close_cleans_projection_subscription gui_backend_does_not_send_non_allowlisted_notifications
```

Expected:

```text
test suite::v2::gui_host_bridge::gui_backend_returns_initialize_response ... ok
test suite::v2::gui_host_bridge::gui_backend_attach_receives_projection_event ... ok
test suite::v2::gui_host_bridge::gui_backend_close_cleans_projection_subscription ... ok
test suite::v2::gui_host_bridge::gui_backend_does_not_send_non_allowlisted_notifications ... ok
```

- [ ] **Step 5: Commit**

```bash
git add codex-rs/app-server/tests/suite/v2 codex-rs/app-server/src
git commit -m "test(app-server): cover GUI bridge JSON-RPC transport"
```

---
