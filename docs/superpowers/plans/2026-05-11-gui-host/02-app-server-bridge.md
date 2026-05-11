# Codex GUI App-Server Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect authenticated GUI JSON-RPC traffic to the existing app-server projection pipeline using app-server transport lifecycle semantics.

**Architecture:** GUI connections are not modeled as a new general-purpose extra JSON-RPC API. The embedded app-server runtime exposes a `GuiBackendHandle` that implements `codex_gui_host::GuiBackend`; each authenticated GUI WebSocket becomes a separate app-server connection with `ConnectionOrigin::GuiHost`, per-connection session state, outbound writer routing, disconnect cancellation, and exactly-once close cleanup.

**Tech Stack:** Rust 2024, codex-app-server, codex-app-server-client, codex-app-server-transport, codex-gui-host, codex-app-server-protocol, tokio.

---

Source spec: `docs/superpowers/specs/2026-05-11-codex-gui-host-redesign.md`.

## Design Notes

- Do not implement `open_extra_jsonrpc_connection`.
- Do not add `ExtraJsonRpcConnectionFactory`.
- Do not expose a generic extra JSON-RPC connection API from `InProcessClientHandle`.
- The bridge exists only to satisfy `codex_gui_host::GuiBackend`.
- `codex-gui-host` remains independent from `codex-app-server`.
- The embedded runtime in `codex-rs/app-server/src/in_process.rs` must support multiple connection states: the existing TUI in-process connection plus zero or more GUI observer connections.
- The embedded runtime should mirror the transport lifecycle already used in `codex-rs/app-server/src/lib.rs`: opened connection state, incoming JSON-RPC processing, outbound routing via `QueuedOutgoingMessage`, and closed connection cleanup.

### Task 6a: Add `ConnectionOrigin::GuiHost`

**Files:**
- Modify: `codex-rs/app-server-transport/src/transport/mod.rs`
- Test: `codex-rs/app-server-transport/src/transport/mod.rs`

- [ ] **Step 1: Write the failing test**

Add this test inside the existing `#[cfg(test)] mod tests` in `codex-rs/app-server-transport/src/transport/mod.rs`:

```rust
#[test]
fn connection_origin_has_distinct_gui_host_variant() {
    assert_ne!(ConnectionOrigin::GuiHost, ConnectionOrigin::InProcess);
    assert_ne!(ConnectionOrigin::GuiHost, ConnectionOrigin::WebSocket);
    assert_ne!(ConnectionOrigin::GuiHost, ConnectionOrigin::RemoteControl);
}
```

- [ ] **Step 2: Run the test to confirm FAIL**

Run from `codex-rs`:

```bash
cargo test -p codex-app-server-transport connection_origin_has_distinct_gui_host_variant
```

Expected failure:

```text
error[E0599]: no variant or associated item named `GuiHost` found for enum `ConnectionOrigin`
```

- [ ] **Step 3: Add the variant**

Modify `ConnectionOrigin` in `codex-rs/app-server-transport/src/transport/mod.rs`:

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

- [ ] **Step 4: Run the test to confirm PASS**

Run from `codex-rs`:

```bash
cargo test -p codex-app-server-transport connection_origin_has_distinct_gui_host_variant
```

Expected:

```text
test transport::tests::connection_origin_has_distinct_gui_host_variant ... ok
```

- [ ] **Step 5: Commit**

```bash
git add codex-rs/app-server-transport/src/transport/mod.rs
git commit -m "feat(app-server-transport): add GUI host connection origin"
```

---

### Task 6b: Add embedded GUI backend handle skeleton

**Files:**
- Modify: `codex-rs/app-server/Cargo.toml`
- Modify: `codex-rs/app-server/BUILD.bazel`
- Modify: `codex-rs/app-server/src/in_process.rs`
- Test: `codex-rs/app-server/src/in_process.rs`

- [ ] **Step 1: Write the failing test**

Add this test inside `codex-rs/app-server/src/in_process.rs` tests:

```rust
#[tokio::test]
async fn gui_backend_handle_is_available_for_embedded_runtime() {
    let client = start_test_client(SessionSource::Cli).await;
    let _backend = client.gui_backend();
    client.shutdown().await.expect("shutdown");
}
```

- [ ] **Step 2: Run the test to confirm FAIL**

Run from `codex-rs`:

```bash
cargo test -p codex-app-server in_process::tests::gui_backend_handle_is_available_for_embedded_runtime
```

Expected failure:

```text
error[E0599]: no method named `gui_backend` found for struct `InProcessClientHandle`
```

- [ ] **Step 3: Add dependencies and public handle skeleton**

Modify `codex-rs/app-server/Cargo.toml`:

```toml
[dependencies]
codex-gui-host = { workspace = true }
```

If `codex-rs/app-server/BUILD.bazel` explicitly lists dependencies, add the generated label for `codex-gui-host` following file-local dependency style.

Add imports to `codex-rs/app-server/src/in_process.rs`:

```rust
use codex_app_server_protocol::JSONRPCMessage;
use codex_gui_host::AuthenticatedGuiConnection;
use codex_gui_host::GuiBackend;
use tokio_util::sync::CancellationToken;
```

Add this type near `InProcessClientHandle`:

```rust
#[derive(Clone)]
pub struct GuiBackendHandle {
    command_tx: mpsc::Sender<InProcessClientMessage>,
}

impl GuiBackend for GuiBackendHandle {
    async fn connect(&self, _connection: AuthenticatedGuiConnection) -> anyhow::Result<()> {
        anyhow::bail!("GUI backend connection runtime is not wired yet")
    }
}
```

Add the method to `InProcessClientHandle`:

```rust
impl InProcessClientHandle {
    pub fn gui_backend(&self) -> GuiBackendHandle {
        GuiBackendHandle {
            command_tx: self.client.client_tx.clone(),
        }
    }
}
```

The field access is inside the same module, so `self.client.client_tx` is available.

- [ ] **Step 4: Run the test to confirm PASS**

Run from `codex-rs`:

```bash
cargo test -p codex-app-server in_process::tests::gui_backend_handle_is_available_for_embedded_runtime
```

Expected:

```text
test in_process::tests::gui_backend_handle_is_available_for_embedded_runtime ... ok
```

- [ ] **Step 5: Commit**

```bash
git add codex-rs/app-server/Cargo.toml codex-rs/app-server/BUILD.bazel codex-rs/app-server/src/in_process.rs codex-rs/Cargo.lock
git commit -m "feat(app-server): expose embedded GUI backend handle"
```

---

### Task 6c: Add multi-connection runtime plumbing

**Files:**
- Modify: `codex-rs/app-server/src/in_process.rs`
- Test: `codex-rs/app-server/src/in_process.rs`

- [ ] **Step 1: Write the failing initialize test**

Add these helpers and test inside `codex-rs/app-server/src/in_process.rs` tests:

```rust
async fn send_gui_text(tx: &mpsc::Sender<String>, text: impl Into<String>) {
    tx.send(text.into()).await.expect("GUI inbound should send");
}

async fn recv_gui_json(rx: &mut mpsc::Receiver<String>) -> serde_json::Value {
    let text = tokio::time::timeout(Duration::from_secs(1), rx.recv())
        .await
        .expect("GUI response should arrive before timeout")
        .expect("GUI response channel should stay open");
    serde_json::from_str(&text).expect("GUI outbound should be JSON")
}

fn new_gui_test_connection() -> (
    AuthenticatedGuiConnection,
    mpsc::Sender<String>,
    mpsc::Receiver<String>,
) {
    let (inbound_tx, inbound_rx) =
        mpsc::channel(codex_gui_host::GUI_CONNECTION_CHANNEL_CAPACITY);
    let (outbound_tx, outbound_rx) =
        mpsc::channel(codex_gui_host::GUI_CONNECTION_CHANNEL_CAPACITY);
    (
        AuthenticatedGuiConnection {
            inbound_rx,
            outbound_tx,
        },
        inbound_tx,
        outbound_rx,
    )
}

#[tokio::test]
async fn gui_backend_handles_initialize_request() {
    let client = start_test_client(SessionSource::Cli).await;
    let backend = client.gui_backend();
    let (connection, inbound_tx, mut outbound_rx) = new_gui_test_connection();
    let connect_task = tokio::spawn(async move { backend.connect(connection).await });

    send_gui_text(
        &inbound_tx,
        r#"{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"clientInfo":{"name":"gui-test","version":"0.0.0"},"capabilities":{}}}"#,
    )
    .await;

    let response = recv_gui_json(&mut outbound_rx).await;
    assert_eq!(response["id"], 1);
    assert!(response.get("result").is_some());

    drop(inbound_tx);
    connect_task
        .await
        .expect("connect task should join")
        .expect("connect should finish cleanly");
    client.shutdown().await.expect("shutdown");
}
```

- [ ] **Step 2: Run the test to confirm FAIL**

Run from `codex-rs`:

```bash
cargo test -p codex-app-server in_process::tests::gui_backend_handles_initialize_request
```

Expected failure:

```text
GUI backend connection runtime is not wired yet
```

- [ ] **Step 3: Add runtime event types**

Add imports:

```rust
use crate::transport::AppServerTransport;
use crate::transport::ConnectionOrigin;
use crate::transport::ConnectionState;
```

Extend `InProcessClientMessage`:

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
    OpenGuiConnection {
        connection: AuthenticatedGuiConnection,
        done_tx: oneshot::Sender<anyhow::Result<()>>,
    },
    Shutdown {
        done_tx: oneshot::Sender<()>,
    },
}
```

Replace `ProcessorCommand` with:

```rust
enum ProcessorCommand {
    Request(Box<ClientRequest>),
    Notification(ClientNotification),
    GuiOpened {
        connection_id: ConnectionId,
        initialized: Arc<AtomicBool>,
        experimental_api_enabled: Arc<AtomicBool>,
        opted_out_notification_methods: Arc<RwLock<HashSet<String>>>,
    },
    GuiIncoming {
        connection_id: ConnectionId,
        message: JSONRPCMessage,
    },
    GuiClosed {
        connection_id: ConnectionId,
    },
}
```

Add outbound and runtime control events:

```rust
enum InProcessOutboundControlEvent {
    Opened {
        connection_id: ConnectionId,
        writer: mpsc::Sender<QueuedOutgoingMessage>,
        initialized: Arc<AtomicBool>,
        experimental_api_enabled: Arc<AtomicBool>,
        opted_out_notification_methods: Arc<RwLock<HashSet<String>>>,
        disconnect_sender: Option<CancellationToken>,
    },
    Closed {
        connection_id: ConnectionId,
    },
}

enum RuntimeEvent {
    GuiClosed {
        connection_id: ConnectionId,
    },
}
```

- [ ] **Step 4: Convert the in-process outbound router to use control events**

Inside `start_uninitialized`, after creating `outgoing_tx`, create:

```rust
let (outbound_control_tx, mut outbound_control_rx) =
    mpsc::channel::<InProcessOutboundControlEvent>(channel_capacity);
```

Replace the current `outbound_connections.insert(...)` plus `outbound_handle` setup with:

```rust
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

let mut outbound_handle = tokio::spawn(async move {
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
                        disconnect_sender,
                    } => {
                        outbound_connections.insert(
                            connection_id,
                            OutboundConnectionState::new(
                                writer,
                                initialized,
                                experimental_api_enabled,
                                opted_out_notification_methods,
                                disconnect_sender,
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

- [ ] **Step 5: Convert processor state to a connection map**

Before spawning the processor task, create:

```rust
let (runtime_event_tx, mut runtime_event_rx) = mpsc::channel::<RuntimeEvent>(channel_capacity);
```

Inside the processor task, replace the single `session` variable with:

```rust
let mut connections = HashMap::<ConnectionId, ConnectionState>::new();
connections.insert(
    IN_PROCESS_CONNECTION_ID,
    ConnectionState::new(
        ConnectionOrigin::InProcess,
        Arc::clone(&outbound_initialized),
        Arc::clone(&outbound_experimental_api_enabled),
        Arc::clone(&outbound_opted_out_notification_methods),
    ),
);
```

Update the existing `ProcessorCommand::Request` path to use the in-process connection state:

```rust
Some(ProcessorCommand::Request(request)) => {
    let connection_state = connections
        .get_mut(&IN_PROCESS_CONNECTION_ID)
        .expect("in-process connection should exist");
    let was_initialized = connection_state.session.initialized();
    processor
        .process_client_request(
            IN_PROCESS_CONNECTION_ID,
            *request,
            Arc::clone(&connection_state.session),
            &connection_state.outbound_initialized,
        )
        .await;
    let opted_out_notification_methods_snapshot =
        connection_state.session.opted_out_notification_methods();
    let experimental_api_enabled =
        connection_state.session.experimental_api_enabled();
    if let Ok(mut opted_out_notification_methods) =
        connection_state.outbound_opted_out_notification_methods.write()
    {
        *opted_out_notification_methods = opted_out_notification_methods_snapshot;
    } else {
        warn!("failed to update outbound opted-out notifications");
    }
    connection_state
        .outbound_experimental_api_enabled
        .store(experimental_api_enabled, Ordering::Release);
    if !was_initialized && connection_state.session.initialized() {
        processor.send_initialize_notifications().await;
    }
}
```

Update the thread-created listener handling:

```rust
let connection_ids = connections
    .iter()
    .filter_map(|(connection_id, connection_state)| {
        connection_state.session.initialized().then_some(*connection_id)
    })
    .collect::<Vec<_>>();
processor
    .try_attach_thread_listener(thread_id, connection_ids)
    .await;
```

At processor shutdown, preserve the existing shutdown sequence and close every remaining connection:

```rust
processor.clear_runtime_references();
processor.cancel_active_login().await;
for (connection_id, connection_state) in connections.drain() {
    processor
        .connection_closed(connection_id, &connection_state.session)
        .await;
}
processor.clear_all_thread_listeners().await;
processor.drain_background_tasks().await;
processor.shutdown_threads().await;
```

- [ ] **Step 6: Handle GUI opened and incoming messages in the processor**

Add these match arms to the processor task:

```rust
Some(ProcessorCommand::GuiOpened {
    connection_id,
    initialized,
    experimental_api_enabled,
    opted_out_notification_methods,
}) => {
    connections.insert(
        connection_id,
        ConnectionState::new(
            ConnectionOrigin::GuiHost,
            initialized,
            experimental_api_enabled,
            opted_out_notification_methods,
        ),
    );
}
Some(ProcessorCommand::GuiIncoming { connection_id, message }) => {
    match message {
        JSONRPCMessage::Request(request) => {
            let Some(connection_state) = connections.get_mut(&connection_id) else {
                warn!("dropping GUI request from unknown connection: {connection_id:?}");
                continue;
            };
            let was_initialized = connection_state.session.initialized();
            processor
                .process_request(
                    connection_id,
                    request,
                    &AppServerTransport::Off,
                    Arc::clone(&connection_state.session),
                )
                .await;
            let opted_out_notification_methods_snapshot =
                connection_state.session.opted_out_notification_methods();
            let experimental_api_enabled =
                connection_state.session.experimental_api_enabled();
            let is_initialized = connection_state.session.initialized();
            if let Ok(mut opted_out_notification_methods) =
                connection_state.outbound_opted_out_notification_methods.write()
            {
                *opted_out_notification_methods = opted_out_notification_methods_snapshot;
            } else {
                warn!("failed to update GUI outbound opted-out notifications");
            }
            connection_state
                .outbound_experimental_api_enabled
                .store(experimental_api_enabled, Ordering::Release);
            if !was_initialized && is_initialized {
                processor
                    .send_initialize_notifications_to_connection(connection_id)
                    .await;
                processor.connection_initialized(connection_id).await;
                connection_state
                    .outbound_initialized
                    .store(true, Ordering::Release);
            }
        }
        JSONRPCMessage::Notification(notification) => {
            if connections.contains_key(&connection_id) {
                processor.process_notification(notification).await;
            }
        }
        JSONRPCMessage::Response(response) => {
            if connections.contains_key(&connection_id) {
                processor.process_response(response).await;
            }
        }
        JSONRPCMessage::Error(err) => {
            if connections.contains_key(&connection_id) {
                processor.process_error(err).await;
            }
        }
    }
}
```

- [ ] **Step 7: Handle GUI closed exactly once**

Add this processor task match arm:

```rust
Some(ProcessorCommand::GuiClosed { connection_id }) => {
    let Some(connection_state) = connections.remove(&connection_id) else {
        continue;
    };
    processor
        .connection_closed(connection_id, &connection_state.session)
        .await;
    let _ = runtime_event_tx
        .send(RuntimeEvent::GuiClosed { connection_id })
        .await;
}
```

In the outer runtime loop, create:

```rust
let mut next_gui_connection_id = 1_u64;
let mut gui_done_txs = HashMap::<ConnectionId, oneshot::Sender<anyhow::Result<()>>>::new();
```

Add a `runtime_event_rx.recv()` branch:

```rust
runtime_event = runtime_event_rx.recv() => {
    match runtime_event {
        Some(RuntimeEvent::GuiClosed { connection_id }) => {
            let _ = outbound_control_tx
                .send(InProcessOutboundControlEvent::Closed { connection_id })
                .await;
            if let Some(done_tx) = gui_done_txs.remove(&connection_id) {
                let _ = done_tx.send(Ok(()));
            }
        }
        None => break,
    }
}
```

- [ ] **Step 8: Handle `OpenGuiConnection` in the outer runtime**

Add this match arm in the outer runtime loop:

```rust
Some(InProcessClientMessage::OpenGuiConnection { connection, done_tx }) => {
    let connection_id = ConnectionId(next_gui_connection_id);
    next_gui_connection_id = next_gui_connection_id.saturating_add(1);

    let (writer_tx, mut writer_rx) = mpsc::channel::<QueuedOutgoingMessage>(channel_capacity);
    let disconnect_token = CancellationToken::new();
    let mut inbound_rx = connection.inbound_rx;
    let gui_outbound_tx = connection.outbound_tx.clone();

    let initialized = Arc::new(AtomicBool::new(false));
    let experimental_api_enabled = Arc::new(AtomicBool::new(false));
    let opted_out_notification_methods = Arc::new(RwLock::new(HashSet::new()));

    gui_done_txs.insert(connection_id, done_tx);

    if outbound_control_tx
        .send(InProcessOutboundControlEvent::Opened {
            connection_id,
            writer: writer_tx,
            initialized: Arc::clone(&initialized),
            experimental_api_enabled: Arc::clone(&experimental_api_enabled),
            opted_out_notification_methods: Arc::clone(&opted_out_notification_methods),
            disconnect_sender: Some(disconnect_token.clone()),
        })
        .await
        .is_err()
    {
        if let Some(done_tx) = gui_done_txs.remove(&connection_id) {
            let _ = done_tx.send(Err(anyhow::anyhow!("outbound router is closed")));
        }
        continue;
    }

    if processor_tx
        .send(ProcessorCommand::GuiOpened {
            connection_id,
            initialized,
            experimental_api_enabled,
            opted_out_notification_methods,
        })
        .await
        .is_err()
    {
        let _ = outbound_control_tx
            .send(InProcessOutboundControlEvent::Closed { connection_id })
            .await;
        if let Some(done_tx) = gui_done_txs.remove(&connection_id) {
            let _ = done_tx.send(Err(anyhow::anyhow!("request processor is closed")));
        }
        continue;
    }

    let processor_tx_for_inbound = processor_tx.clone();
    let disconnect_token_for_inbound = disconnect_token.clone();
    tokio::spawn(async move {
        loop {
            tokio::select! {
                _ = disconnect_token_for_inbound.cancelled() => break,
                inbound = inbound_rx.recv() => {
                    let Some(text) = inbound else {
                        break;
                    };
                    match serde_json::from_str::<JSONRPCMessage>(&text) {
                        Ok(message) => {
                            if processor_tx_for_inbound
                                .send(ProcessorCommand::GuiIncoming { connection_id, message })
                                .await
                                .is_err()
                            {
                                break;
                            }
                        }
                        Err(err) => {
                            tracing::warn!(%err, "dropping invalid GUI JSON-RPC message");
                        }
                    }
                }
            }
        }
        let _ = processor_tx_for_inbound
            .send(ProcessorCommand::GuiClosed { connection_id })
            .await;
    });

    let disconnect_token_for_outbound = disconnect_token.clone();
    tokio::spawn(async move {
        loop {
            tokio::select! {
                _ = disconnect_token_for_outbound.cancelled() => break,
                queued = writer_rx.recv() => {
                    let Some(queued) = queued else {
                        break;
                    };
                    let text = match serde_json::to_string(&queued.message) {
                        Ok(text) => text,
                        Err(err) => {
                            tracing::warn!(%err, "failed to serialize GUI outbound message");
                            continue;
                        }
                    };
                    if gui_outbound_tx.send(text).await.is_err() {
                        break;
                    }
                    if let Some(write_complete_tx) = queued.write_complete_tx {
                        let _ = write_complete_tx.send(());
                    }
                }
            }
        }
        disconnect_token_for_outbound.cancel();
    });
}
```

- [ ] **Step 9: Implement `GuiBackendHandle::connect`**

Replace the skeleton implementation:

```rust
impl GuiBackend for GuiBackendHandle {
    async fn connect(&self, connection: AuthenticatedGuiConnection) -> anyhow::Result<()> {
        let (done_tx, done_rx) = oneshot::channel();
        self.command_tx
            .send(InProcessClientMessage::OpenGuiConnection { connection, done_tx })
            .await
            .map_err(|_| anyhow::anyhow!("in-process app-server runtime is closed"))?;
        done_rx
            .await
            .map_err(|err| anyhow::anyhow!("GUI connection completion channel closed: {err}"))?
    }
}
```

- [ ] **Step 10: Run the initialize test to confirm PASS**

Run from `codex-rs`:

```bash
cargo test -p codex-app-server in_process::tests::gui_backend_handles_initialize_request
```

Expected:

```text
test in_process::tests::gui_backend_handles_initialize_request ... ok
```

- [ ] **Step 11: Commit**

```bash
git add codex-rs/app-server/src/in_process.rs
git commit -m "feat(app-server): route GUI backend through embedded runtime"
```

---

### Task 6d: Add bridge cleanup tests

**Files:**
- Modify: `codex-rs/app-server/src/in_process.rs`
- Test: `codex-rs/app-server/src/in_process.rs`

- [ ] **Step 1: Write cleanup and invalid JSON tests**

Add these tests inside `codex-rs/app-server/src/in_process.rs` tests:

```rust
#[tokio::test]
async fn gui_backend_connect_finishes_when_browser_closes() {
    let client = start_test_client(SessionSource::Cli).await;
    let backend = client.gui_backend();
    let (connection, inbound_tx, _outbound_rx) = new_gui_test_connection();
    let connect_task = tokio::spawn(async move { backend.connect(connection).await });

    drop(inbound_tx);

    tokio::time::timeout(Duration::from_secs(1), connect_task)
        .await
        .expect("connect should finish after GUI inbound closes")
        .expect("connect task should join")
        .expect("connect should finish cleanly");
    client.shutdown().await.expect("shutdown");
}

#[tokio::test]
async fn gui_backend_drops_invalid_json_without_closing_connection() {
    let client = start_test_client(SessionSource::Cli).await;
    let backend = client.gui_backend();
    let (connection, inbound_tx, mut outbound_rx) = new_gui_test_connection();
    let connect_task = tokio::spawn(async move { backend.connect(connection).await });

    send_gui_text(&inbound_tx, "not json").await;
    send_gui_text(
        &inbound_tx,
        r#"{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"clientInfo":{"name":"gui-test","version":"0.0.0"},"capabilities":{}}}"#,
    )
    .await;

    let response = recv_gui_json(&mut outbound_rx).await;
    assert_eq!(response["id"], 1);

    drop(inbound_tx);
    connect_task
        .await
        .expect("connect task should join")
        .expect("connect should finish cleanly");
    client.shutdown().await.expect("shutdown");
}
```

- [ ] **Step 2: Run tests to verify PASS**

Run from `codex-rs`:

```bash
cargo test -p codex-app-server in_process::tests::gui_backend
```

Expected output includes:

```text
test in_process::tests::gui_backend_handles_initialize_request ... ok
test in_process::tests::gui_backend_connect_finishes_when_browser_closes ... ok
test in_process::tests::gui_backend_drops_invalid_json_without_closing_connection ... ok
```

- [ ] **Step 3: Commit**

```bash
git add codex-rs/app-server/src/in_process.rs
git commit -m "test(app-server): cover GUI backend connection cleanup"
```

---

### Task 7: Expose GUI backend through `codex-app-server-client`

**Files:**
- Modify: `codex-rs/app-server-client/src/lib.rs`
- Test: `codex-rs/app-server-client/src/lib.rs`

- [ ] **Step 1: Write failing tests**

Add these tests inside `codex-rs/app-server-client/src/lib.rs` tests:

```rust
#[tokio::test]
async fn in_process_client_exposes_gui_backend() {
    let client = start_test_client(SessionSource::Cli).await;
    assert!(client.gui_backend().is_some());
    client.shutdown().await.expect("shutdown");
}

#[tokio::test]
async fn request_handle_does_not_expose_gui_backend() {
    let client = start_test_client(SessionSource::Cli).await;
    let handle = client.request_handle();
    assert!(handle.gui_backend().is_none());
    client.shutdown().await.expect("shutdown");
}
```

- [ ] **Step 2: Run tests to verify FAIL**

Run from `codex-rs`:

```bash
cargo test -p codex-app-server-client gui_backend
```

Expected failure:

```text
error[E0599]: no method named `gui_backend` found
```

- [ ] **Step 3: Re-export the handle and add accessors**

Add near the existing in-process re-exports:

```rust
pub use codex_app_server::in_process::GuiBackendHandle;
```

Add a field to `InProcessAppServerClient`:

```rust
gui_backend: GuiBackendHandle,
```

In `InProcessAppServerClient::start`, after `let request_sender = handle.sender();`, capture:

```rust
let gui_backend = handle.gui_backend();
```

Include it in the returned struct:

```rust
Ok(Self {
    command_tx,
    event_rx,
    worker_handle,
    gui_backend,
})
```

Add methods:

```rust
impl InProcessAppServerClient {
    pub fn gui_backend(&self) -> GuiBackendHandle {
        self.gui_backend.clone()
    }
}

impl InProcessAppServerRequestHandle {
    pub fn gui_backend(&self) -> Option<GuiBackendHandle> {
        None
    }
}

impl AppServerClient {
    pub fn gui_backend(&self) -> Option<GuiBackendHandle> {
        match self {
            Self::InProcess(client) => Some(client.gui_backend()),
            Self::Remote(_) => None,
        }
    }
}

impl AppServerRequestHandle {
    pub fn gui_backend(&self) -> Option<GuiBackendHandle> {
        match self {
            Self::InProcess(_) | Self::Remote(_) => None,
        }
    }
}
```

Request handles intentionally do not expose GUI backend access because they do not own the embedded runtime handle.

- [ ] **Step 4: Run tests to verify PASS**

Run from `codex-rs`:

```bash
cargo test -p codex-app-server-client gui_backend
```

Expected output includes:

```text
test tests::in_process_client_exposes_gui_backend ... ok
test tests::request_handle_does_not_expose_gui_backend ... ok
```

- [ ] **Step 5: Commit**

```bash
git add codex-rs/app-server-client/src/lib.rs
git commit -m "feat(app-server-client): expose GUI backend for embedded sessions"
```

---

### Task 9: Bridge verification sweep

**Files:**
- Verify: `codex-rs/app-server-transport/src/transport/mod.rs`
- Verify: `codex-rs/app-server/src/in_process.rs`
- Verify: `codex-rs/app-server-client/src/lib.rs`

- [ ] **Step 1: Run focused bridge tests**

Run from `codex-rs`:

```bash
cargo test -p codex-app-server-transport connection_origin_has_distinct_gui_host_variant
cargo test -p codex-app-server in_process::tests::gui_backend
cargo test -p codex-app-server-client gui_backend
```

Expected: all commands exit 0.

- [ ] **Step 2: Format Rust**

Run from `codex-rs`:

```bash
just fmt
```

Expected: command exits 0.

- [ ] **Step 3: Run scoped fix**

Run from `codex-rs`:

```bash
just fix -p codex-app-server-transport
just fix -p codex-app-server
just fix -p codex-app-server-client
```

Expected: commands exit 0. Do not rerun tests after `fix` or `fmt` unless you edit code again.

- [ ] **Step 4: Commit any formatting or lint updates**

If `just fmt` or `just fix` modified files, commit them:

```bash
git add codex-rs/app-server-transport/src/transport/mod.rs codex-rs/app-server/src/in_process.rs codex-rs/app-server-client/src/lib.rs
git commit -m "chore(gui): format GUI bridge runtime changes"
```

If there are no changes after `just fmt` and `just fix`, record that in the execution notes and skip this commit.
