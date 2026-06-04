# Codex GUI Host Minimal App-Server Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按 `03-bridge-boundary-decision.md` 的 gate 结论，在 `codex-app-server` 内实现认证后 GUI `/ws` 到当前 in-process app-server runtime 的最小 adapter。

**Architecture:** 本计划执行已锁定的方案 A：薄 hook + 旁路模块。GUI 专属 lifecycle 和 browser bridge 分别进入 `gui_host.rs` / `gui_transport.rs`，extra connection runtime 细节进入 `in_process_extra.rs`，`in_process.rs` 只保留中性注册、分派、outbound control 和 thread listener hook。本计划不改 app-server-client facade、不改 TUI、不改 frontend，也不重新选择 bridge 架构。

**Tech Stack:** Rust 2024, tokio, mpsc, CancellationToken, codex-app-server-protocol JSON-RPC, codex-gui-host `GuiBackend`, in-process app-server runtime, existing `MessageProcessor` / `route_outgoing_envelope`.

---

## Scope

本计划只实现 `00-roadmap.md` 中的 `04 minimal app-server adapter`，且必须执行 `03-bridge-boundary-decision.md` 的 `Decision Output`。

允许修改：

- `codex-rs/app-server/Cargo.toml`
- `codex-rs/app-server/src/lib.rs`
- `codex-rs/app-server/src/gui_host.rs`
- `codex-rs/app-server/src/gui_transport.rs`
- `codex-rs/app-server/src/in_process_extra.rs`
- `codex-rs/app-server/src/in_process.rs`
- `codex-rs/Cargo.lock`
- `MODULE.bazel.lock`

不允许修改：

- `codex-rs/app-server-client/**`
- `codex-rs/tui/**`
- `codex-gui/**`
- `codex-rs/core/**`
- `codex-rs/app-server-protocol/**`
- `codex-rs/gui-host/**`
- `docs/superpowers/specs/**`
- `docs/superpowers/plans/2026-05-30-gui-host/05-*`
- `docs/superpowers/plans/2026-05-30-gui-host/06-*`

停止条件：

- 如果实现需要在 `in_process.rs` 中引入 GUI、WebSocket、browser、token、Host、Origin、allowlist 或 launch URL 概念，停止。
- 如果实现需要重写 `route_outgoing_envelope`、`MessageProcessor`、projection fanout 或 thread lifecycle 语义，停止。
- 如果实现需要把 `InProcessAppServerClient` 改成 GUI-aware lifecycle state 或多个 `Option<_>` 字段，停止并回到 `05` 设计边界。
- 如果实现需要恢复 `open_extra_jsonrpc_connection`、`ExtraJsonRpcConnectionFactory` 或 cherry-pick 被 revert 的 extra-connection commits，停止。
- 如果 `codex-gui-host` 需要依赖 `codex-app-server`，停止。只允许 `codex-app-server` 依赖 `codex-gui-host`。
- 如果 `04` 无法在不修改 app-server-client facade / TUI 的情况下编译，停止并记录 BLOCKED，不要扩大本计划范围。

## Source Of Truth

解释冲突时按以下顺序：

1. `docs/superpowers/plans/2026-05-30-gui-host/03-bridge-boundary-decision.md` 的 `Decision Output`
2. `docs/superpowers/specs/2026-05-30-codex-gui-host-dev-adaptation-design.md`
3. `docs/superpowers/specs/2026-05-13-gui-host-low-intrusion-refactor-design.md`
4. `docs/superpowers/specs/2026-05-13-gui-host-extra-open-hook-thinning-design.md`
5. current source under `codex-rs/app-server/**` and `codex-rs/gui-host/**`
6. reverted commits, only as negative evidence

## File Responsibilities

- `codex-rs/app-server/Cargo.toml`: add `codex-gui-host = { workspace = true }` so app-server can implement `GuiBackend`. This is a dependency change and requires Bazel lock refresh.
- `codex-rs/app-server/src/lib.rs`: declare new app-server modules and expose only `GuiHostManager` for later `05`; no app-server-client wiring and no app-server-client facade type.
- `codex-rs/app-server/src/in_process_extra.rs`: own neutral extra connection lifecycle, ID allocation, command sender, close-on-drop, processor-side state, outbound control, writer bridge, JSON-RPC 2.0 text serialization, and tests for those details. Must not depend on `codex-gui-host`.
- `codex-rs/app-server/src/in_process.rs`: add only neutral hook points: `InProcessClientSender::register_extra_connection`, `InProcessClientMessage::Extra`, `ProcessorCommand::Extra`, outbound control branch, processor-loop delegation, and `thread_created_rx` connection-id helper. No GUI terms.
- `codex-rs/app-server/src/gui_transport.rs`: implement `codex_gui_host::GuiBackend` for an app-server backend that registers an extra connection after authentication and pumps validated JSON-RPC text between `AuthenticatedGuiConnection` and `in_process_extra`.
- `codex-rs/app-server/src/gui_host.rs`: own app-server-side `GuiHostManager` lifecycle around `codex_gui_host::GuiHost`; lazy start / reuse / shutdown. It must not touch `MessageProcessor`, `OutboundConnectionState`, or request dispatch details.
- `codex-rs/Cargo.lock` and `MODULE.bazel.lock`: lockfile consequences of adding the app-server dependency on `codex-gui-host`.

## Task 1: Confirm Gate And Add App-Server Module Wiring

**Files:**
- Verify: `docs/superpowers/plans/2026-05-30-gui-host/03-bridge-boundary-decision.md`
- Modify: `codex-rs/app-server/Cargo.toml`
- Modify: `codex-rs/app-server/src/lib.rs`
- Create: `codex-rs/app-server/src/gui_host.rs`
- Create: `codex-rs/app-server/src/gui_transport.rs`
- Create: `codex-rs/app-server/src/in_process_extra.rs`

- [ ] **Step 1: Confirm `03` gate passed**

Run from repo root:

```bash
git rev-parse HEAD > /tmp/codex-gui-host-04-base
rg -n '`03` gate passes|create `gui_host.rs`|create `gui_transport.rs`|create `in_process_extra.rs`|do not modify app-server-client facade or TUI yet|locked to方案 A' \
  docs/superpowers/plans/2026-05-30-gui-host/03-bridge-boundary-decision.md
```

Expected: `/tmp/codex-gui-host-04-base` contains the pre-implementation commit SHA; `rg` output includes the pass decision, all three allowed files, app-server-client/TUI deferral, and方案 A lock.

- [ ] **Step 2: Add app-server dependency on `codex-gui-host`**

Edit `codex-rs/app-server/Cargo.toml` and add this dependency in the existing `[dependencies]` list near other `codex-*` dependencies:

```toml
codex-gui-host = { workspace = true }
```

Do not add any dependency from `codex-rs/gui-host/Cargo.toml` back to `codex-app-server`.

- [ ] **Step 3: Add crate modules**

Edit `codex-rs/app-server/src/lib.rs` module declarations near `fs_watch` / `fuzzy_file_search` / `in_process`:

```rust
mod gui_host;
mod gui_transport;
mod in_process_extra;
pub mod in_process;
```

Expose only the manager that `05-app-server-client-facade.md` will need:

```rust
pub use crate::gui_host::GuiHostManager;
```

Do not expose `in_process_extra` or `gui_transport` publicly.

- [ ] **Step 4: Create empty module shells that compile only after later tasks**

Create `codex-rs/app-server/src/in_process_extra.rs` with this header and imports scaffold:

```rust
use std::collections::HashMap;
use std::collections::HashSet;
use std::io;
use std::io::ErrorKind;
use std::sync::Arc;
use std::sync::RwLock;
use std::sync::atomic::AtomicBool;
use std::sync::atomic::AtomicU64;
use std::sync::atomic::Ordering;

use codex_app_server_protocol::JSONRPCMessage;
use codex_app_server_protocol::JSONRPCNotification;
use codex_app_server_protocol::JSONRPCRequest;
use serde_json::Value;
use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;
use tracing::warn;

use crate::message_processor::ConnectionSessionState;
use crate::message_processor::MessageProcessor;
use crate::outgoing_message::ConnectionId;
use crate::outgoing_message::QueuedOutgoingMessage;
use crate::transport::AppServerTransport;
use crate::transport::OutboundConnectionState;
```

Create `codex-rs/app-server/src/gui_transport.rs` with this header scaffold:

```rust
use std::io;
use std::sync::Arc;

use codex_app_server_protocol::JSONRPCMessage;
use codex_app_server_protocol::JSONRPC_VERSION;
use codex_gui_host::AuthenticatedGuiConnection;
use codex_gui_host::GuiBackend;
use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;
use tracing::warn;

use crate::in_process::InProcessClientSender;
use crate::in_process_extra::ExtraConnectionCommandSender;
```

Create `codex-rs/app-server/src/gui_host.rs` with this header scaffold:

```rust
use std::io;
use std::sync::Arc;

use codex_gui_host::GuiHost;
use codex_gui_host::GuiHostConfig;
use codex_gui_host::GuiHostHandle;
use codex_protocol::ThreadId;
use tokio::sync::Mutex;

use crate::gui_transport::GuiTransportBackend;
use crate::in_process::InProcessClientSender;
```

- [ ] **Step 5: Run a narrow compile check and expect unresolved items**

Run from `codex-rs`:

```bash
cargo check -p codex-app-server
```

Expected: unresolved item errors from the new module shells are acceptable at this point. There must be no Cargo dependency cycle and no error involving `codex-gui-host` depending on `codex-app-server`.

Do not commit this task if the unresolved errors are the only compile state; continue to Task 2 before committing.

## Task 2: Implement Neutral Extra Connection Module

**Files:**
- Modify: `codex-rs/app-server/src/in_process_extra.rs`
- Later hook use: `codex-rs/app-server/src/in_process.rs`

- [ ] **Step 1: Add command and handle types**

In `codex-rs/app-server/src/in_process_extra.rs`, add these public-to-crate types:

```rust
pub(crate) enum ExtraConnectionCommand {
    Opened {
        connection_id: ConnectionId,
        outgoing_tx: mpsc::Sender<String>,
        disconnect_token: CancellationToken,
    },
    Request {
        connection_id: ConnectionId,
        request: JSONRPCRequest,
    },
    Notification {
        connection_id: ConnectionId,
        notification: JSONRPCNotification,
    },
    Closed {
        connection_id: ConnectionId,
    },
}

pub(crate) enum ExtraProcessorCommand {
    Opened(OpenedExtraConnection),
    Request {
        connection_id: ConnectionId,
        request: JSONRPCRequest,
    },
    Notification {
        connection_id: ConnectionId,
        notification: JSONRPCNotification,
    },
    Closed {
        connection_id: ConnectionId,
    },
}

pub(crate) enum OutboundControl {
    Register {
        connection_id: ConnectionId,
        writer: mpsc::Sender<QueuedOutgoingMessage>,
        initialized: Arc<AtomicBool>,
        experimental_api_enabled: Arc<AtomicBool>,
        opted_out_notification_methods: Arc<RwLock<HashSet<String>>>,
        disconnect_token: CancellationToken,
    },
    Unregister {
        connection_id: ConnectionId,
    },
}
```

Add `ExtraConnectionHandle` and `ExtraConnectionCommandSender`:

```rust
pub(crate) struct ExtraConnectionHandle {
    connection_id: ConnectionId,
    command_sender: ExtraConnectionCommandSender,
    disconnect_token: CancellationToken,
}

impl ExtraConnectionHandle {
    pub(crate) fn connection_id(&self) -> ConnectionId {
        self.connection_id
    }

    pub(crate) fn command_sender(&self) -> ExtraConnectionCommandSender {
        self.command_sender.clone()
    }

    pub(crate) fn disconnect_token(&self) -> CancellationToken {
        self.disconnect_token.clone()
    }
}

impl Drop for ExtraConnectionHandle {
    fn drop(&mut self) {
        self.command_sender.close_best_effort(self.connection_id);
    }
}

#[derive(Clone)]
pub(crate) struct ExtraConnectionCommandSender {
    client_tx: mpsc::Sender<crate::in_process::InProcessClientMessage>,
}
```

Make `InProcessClientMessage` `pub(crate)` in Task 3 so this sender can use it without exposing any GUI concepts.

- [ ] **Step 2: Add ID allocation and open helper**

Add neutral ID allocation and open construction:

```rust
static NEXT_EXTRA_CONNECTION_ID: AtomicU64 = AtomicU64::new(1);

fn next_connection_id() -> ConnectionId {
    ConnectionId(NEXT_EXTRA_CONNECTION_ID.fetch_add(1, Ordering::Relaxed))
}

impl ExtraConnectionCommandSender {
    pub(crate) fn new(client_tx: mpsc::Sender<crate::in_process::InProcessClientMessage>) -> Self {
        Self { client_tx }
    }

    pub(crate) fn open(
        &self,
        outgoing_tx: mpsc::Sender<String>,
    ) -> io::Result<ExtraConnectionHandle> {
        let connection_id = next_connection_id();
        let disconnect_token = CancellationToken::new();
        self.try_send(ExtraConnectionCommand::Opened {
            connection_id,
            outgoing_tx,
            disconnect_token: disconnect_token.clone(),
        })?;
        Ok(ExtraConnectionHandle {
            connection_id,
            command_sender: self.clone(),
            disconnect_token,
        })
    }

    pub(crate) fn request(
        &self,
        connection_id: ConnectionId,
        request: JSONRPCRequest,
    ) -> io::Result<()> {
        self.try_send(ExtraConnectionCommand::Request {
            connection_id,
            request,
        })
    }

    pub(crate) fn notification(
        &self,
        connection_id: ConnectionId,
        notification: JSONRPCNotification,
    ) -> io::Result<()> {
        self.try_send(ExtraConnectionCommand::Notification {
            connection_id,
            notification,
        })
    }

    fn close_best_effort(&self, connection_id: ConnectionId) {
        let _ = self.try_send(ExtraConnectionCommand::Closed { connection_id });
    }

    fn try_send(&self, command: ExtraConnectionCommand) -> io::Result<()> {
        self.client_tx
            .try_send(crate::in_process::InProcessClientMessage::Extra(command))
            .map_err(|err| match err {
                mpsc::error::TrySendError::Full(_) => {
                    io::Error::new(ErrorKind::WouldBlock, "extra connection queue is full")
                }
                mpsc::error::TrySendError::Closed(_) => {
                    io::Error::new(ErrorKind::BrokenPipe, "in-process app-server runtime is closed")
                }
            })
    }
}
```

- [ ] **Step 3: Add prepared-open state**

Add:

```rust
pub(crate) struct PreparedExtraConnectionOpen {
    pub(crate) connection_id: ConnectionId,
    pub(crate) outbound_control: OutboundControl,
    pub(crate) processor_command: ExtraProcessorCommand,
}

pub(crate) struct OpenedExtraConnection {
    connection_id: ConnectionId,
    outbound_initialized: Arc<AtomicBool>,
    outbound_experimental_api_enabled: Arc<AtomicBool>,
    outbound_opted_out_notification_methods: Arc<RwLock<HashSet<String>>>,
}

pub(crate) fn prepare_opened_connection(
    connection_id: ConnectionId,
    outgoing_tx: mpsc::Sender<String>,
    disconnect_token: CancellationToken,
    channel_capacity: usize,
) -> PreparedExtraConnectionOpen {
    let (writer_tx, writer_rx) = mpsc::channel::<QueuedOutgoingMessage>(channel_capacity);
    spawn_extra_writer_bridge(connection_id, outgoing_tx, writer_rx);
    let outbound_initialized = Arc::new(AtomicBool::new(false));
    let outbound_experimental_api_enabled = Arc::new(AtomicBool::new(false));
    let outbound_opted_out_notification_methods = Arc::new(RwLock::new(HashSet::new()));
    PreparedExtraConnectionOpen {
        connection_id,
        outbound_control: OutboundControl::Register {
            connection_id,
            writer: writer_tx,
            initialized: Arc::clone(&outbound_initialized),
            experimental_api_enabled: Arc::clone(&outbound_experimental_api_enabled),
            opted_out_notification_methods: Arc::clone(&outbound_opted_out_notification_methods),
            disconnect_token,
        },
        processor_command: ExtraProcessorCommand::Opened(OpenedExtraConnection {
            connection_id,
            outbound_initialized,
            outbound_experimental_api_enabled,
            outbound_opted_out_notification_methods,
        }),
    }
}
```

- [ ] **Step 4: Add processor-side state**

Add:

```rust
struct ExtraConnectionEntry {
    session: Arc<ConnectionSessionState>,
    outbound_initialized: Arc<AtomicBool>,
    outbound_experimental_api_enabled: Arc<AtomicBool>,
    outbound_opted_out_notification_methods: Arc<RwLock<HashSet<String>>>,
}

#[derive(Default)]
pub(crate) struct ExtraConnectionState {
    entries: HashMap<ConnectionId, ExtraConnectionEntry>,
}

impl ExtraConnectionState {
    pub(crate) fn register_opened(&mut self, opened: OpenedExtraConnection) {
        self.entries.insert(
            opened.connection_id,
            ExtraConnectionEntry {
                session: Arc::new(ConnectionSessionState::new()),
                outbound_initialized: opened.outbound_initialized,
                outbound_experimental_api_enabled: opened.outbound_experimental_api_enabled,
                outbound_opted_out_notification_methods: opened
                    .outbound_opted_out_notification_methods,
            },
        );
    }

    pub(crate) fn initialized_connection_ids(&self, include_main: bool) -> Vec<ConnectionId> {
        let mut connection_ids = Vec::new();
        if include_main {
            connection_ids.push(crate::in_process::IN_PROCESS_CONNECTION_ID);
        }
        connection_ids.extend(
            self.entries
                .iter()
                .filter_map(|(connection_id, entry)| {
                    entry.session.initialized().then_some(*connection_id)
                }),
        );
        connection_ids
    }
}
```

Make `IN_PROCESS_CONNECTION_ID` `pub(crate)` in Task 3.

- [ ] **Step 5: Add processor command delegation**

Add:

```rust
impl ExtraConnectionState {
    pub(crate) async fn handle_processor_command(
        &mut self,
        processor: &Arc<MessageProcessor>,
        command: ExtraProcessorCommand,
    ) {
        match command {
            ExtraProcessorCommand::Opened(opened) => self.register_opened(opened),
            ExtraProcessorCommand::Request {
                connection_id,
                request,
            } => {
                let Some(entry) = self.entries.get(&connection_id) else {
                    warn!("dropping request from unknown extra connection: {connection_id:?}");
                    return;
                };
                let was_initialized = entry.session.initialized();
                processor
                    .process_request(
                        connection_id,
                        request,
                        &AppServerTransport::Stdio,
                        Arc::clone(&entry.session),
                    )
                    .await;
                mirror_session_state(entry);
                if !was_initialized && entry.session.initialized() {
                    processor
                        .send_initialize_notifications_to_connection(connection_id)
                        .await;
                    processor
                        .connection_initialized(
                            connection_id,
                            entry.session.request_attestation(),
                        )
                        .await;
                    entry
                        .outbound_initialized
                        .store(true, Ordering::Release);
                }
            }
            ExtraProcessorCommand::Notification {
                connection_id,
                notification,
            } => {
                if self.entries.contains_key(&connection_id) {
                    processor.process_notification(notification).await;
                } else {
                    warn!("dropping notification from unknown extra connection: {connection_id:?}");
                }
            }
            ExtraProcessorCommand::Closed { connection_id } => {
                if let Some(entry) = self.entries.remove(&connection_id) {
                    processor.connection_closed(connection_id, &entry.session).await;
                }
            }
        }
    }
}

fn mirror_session_state(entry: &ExtraConnectionEntry) {
    if let Ok(mut opted_out_notification_methods) =
        entry.outbound_opted_out_notification_methods.write()
    {
        *opted_out_notification_methods = entry.session.opted_out_notification_methods();
    } else {
        warn!("failed to update extra outbound opted-out notifications");
    }
    entry.outbound_experimental_api_enabled.store(
        entry.session.experimental_api_enabled(),
        Ordering::Release,
    );
}
```

- [ ] **Step 6: Add outbound control helper and writer bridge**

Add:

```rust
pub(crate) fn handle_outbound_control(
    outbound_connections: &mut HashMap<ConnectionId, OutboundConnectionState>,
    control: OutboundControl,
) {
    match control {
        OutboundControl::Register {
            connection_id,
            writer,
            initialized,
            experimental_api_enabled,
            opted_out_notification_methods,
            disconnect_token,
        } => {
            outbound_connections.insert(
                connection_id,
                OutboundConnectionState::new(
                    writer,
                    initialized,
                    experimental_api_enabled,
                    opted_out_notification_methods,
                    Some(disconnect_token),
                ),
            );
        }
        OutboundControl::Unregister { connection_id } => {
            outbound_connections.remove(&connection_id);
        }
    }
}

fn spawn_extra_writer_bridge(
    connection_id: ConnectionId,
    outgoing_tx: mpsc::Sender<String>,
    mut writer_rx: mpsc::Receiver<QueuedOutgoingMessage>,
) {
    tokio::spawn(async move {
        while let Some(queued) = writer_rx.recv().await {
            let Some(text) = serialize_outgoing_text(queued.message) else {
                continue;
            };
            if outgoing_tx.send(text).await.is_err() {
                break;
            }
            if let Some(write_complete_tx) = queued.write_complete_tx {
                let _ = write_complete_tx.send(());
            }
        }
        tracing::debug!(?connection_id, "extra connection writer bridge stopped");
    });
}

fn serialize_outgoing_text(
    message: codex_app_server_transport::OutgoingMessage,
) -> Option<String> {
    let mut value = match serde_json::to_value(message) {
        Ok(value) => value,
        Err(error) => {
            warn!(%error, "failed to serialize extra outgoing message");
            return None;
        }
    };
    if let Value::Object(object) = &mut value {
        object.insert(
            "jsonrpc".to_string(),
            Value::String(codex_app_server_protocol::JSONRPC_VERSION.to_string()),
        );
    }
    match serde_json::to_string(&value) {
        Ok(text) => Some(text),
        Err(error) => {
            warn!(%error, "failed to encode extra outgoing message");
            None
        }
    }
}
```

This helper must be covered by a test that asserts outgoing browser text includes `"jsonrpc":"2.0"`.

- [ ] **Step 7: Add unit tests for neutral module details**

In `in_process_extra.rs`, add focused unit tests:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use codex_app_server_protocol::JSONRPC_VERSION;
    use codex_app_server_transport::OutgoingMessage;
    use codex_app_server_transport::OutgoingResponse;
    use pretty_assertions::assert_eq;

    #[test]
    fn extra_connection_ids_do_not_use_main_connection_id() {
        assert_ne!(next_connection_id(), crate::in_process::IN_PROCESS_CONNECTION_ID);
    }

    #[test]
    fn serialize_outgoing_text_adds_jsonrpc_version() {
        let text = serialize_outgoing_text(OutgoingMessage::Response(OutgoingResponse {
            id: codex_app_server_protocol::RequestId::Integer(7),
            result: serde_json::json!({"ok": true}),
        }))
        .expect("response should serialize");
        let value: serde_json::Value =
            serde_json::from_str(&text).expect("text should be JSON");
        assert_eq!(value["jsonrpc"], JSONRPC_VERSION);
        assert_eq!(value["id"], 7);
        assert_eq!(value["result"], serde_json::json!({"ok": true}));
    }

    #[tokio::test]
    async fn prepared_open_registers_outbound_and_processor_payloads() {
        let (outgoing_tx, _outgoing_rx) = mpsc::channel(1);
        let connection_id = ConnectionId(42);
        let prepared = prepare_opened_connection(
            connection_id,
            outgoing_tx,
            CancellationToken::new(),
            1,
        );
        assert_eq!(prepared.connection_id, connection_id);
        match prepared.outbound_control {
            OutboundControl::Register {
                connection_id: registered,
                ..
            } => assert_eq!(registered, connection_id),
            OutboundControl::Unregister { .. } => {
                panic!("prepared open should register outbound state")
            }
        }
        match prepared.processor_command {
            ExtraProcessorCommand::Opened(opened) => {
                assert_eq!(opened.connection_id, connection_id);
            }
            _ => panic!("prepared open should create processor opened command"),
        }
    }
}
```

- [ ] **Step 8: Run unit tests for module compile progress**

Run from `codex-rs`:

```bash
cargo test -p codex-app-server in_process_extra
```

Expected: tests compile and pass after Task 3 wires visibility, or fail only because `InProcessClientMessage::Extra` / `IN_PROCESS_CONNECTION_ID` visibility is not yet wired. Continue to Task 3 before committing if those visibility errors remain.

## Task 3: Wire `in_process.rs` Neutral Hooks

**Files:**
- Modify: `codex-rs/app-server/src/in_process.rs`
- Modify: `codex-rs/app-server/src/in_process_extra.rs`

- [ ] **Step 1: Make neutral types visible to sibling module**

In `codex-rs/app-server/src/in_process.rs`, change:

```rust
const IN_PROCESS_CONNECTION_ID: ConnectionId = ConnectionId(0);
enum InProcessClientMessage {
```

to:

```rust
pub(crate) const IN_PROCESS_CONNECTION_ID: ConnectionId = ConnectionId(0);
pub(crate) enum InProcessClientMessage {
```

Do not make these public API.

- [ ] **Step 2: Add neutral extra client message and processor command**

Change `InProcessClientMessage`:

```rust
pub(crate) enum InProcessClientMessage {
    Request {
        request: Box<ClientRequest>,
        response_tx: oneshot::Sender<PendingClientRequestResponse>,
    },
    Notification {
        notification: ClientNotification,
    },
    Extra(in_process_extra::ExtraConnectionCommand),
    ServerRequestResponse {
        request_id: RequestId,
        result: Result,
    },
    ServerRequestError {
        request_id: RequestId,
        error: JSONRPCErrorError,
    },
    Shutdown {
        done_tx: oneshot::Sender<()>,
    },
}
```

Change `ProcessorCommand`:

```rust
enum ProcessorCommand {
    Request(Box<ClientRequest>),
    Notification(ClientNotification),
    Extra(in_process_extra::ExtraProcessorCommand),
}
```

- [ ] **Step 3: Add registration entry point on `InProcessClientSender`**

Add:

```rust
impl InProcessClientSender {
    pub(crate) fn register_extra_connection(
        &self,
        outgoing_tx: mpsc::Sender<String>,
    ) -> IoResult<in_process_extra::ExtraConnectionHandle> {
        in_process_extra::ExtraConnectionCommandSender::new(self.client_tx.clone())
            .open(outgoing_tx)
    }
}
```

Keep the method name neutral. Do not mention GUI in `in_process.rs`.

- [ ] **Step 4: Add outbound control channel and branch**

Near the existing `outbound_connections` setup, add:

```rust
let (outbound_control_tx, mut outbound_control_rx) =
    mpsc::channel::<in_process_extra::OutboundControl>(channel_capacity);
```

Change the outbound task from:

```rust
let mut outbound_handle = tokio::spawn(async move {
    while let Some(envelope) = outgoing_rx.recv().await {
        route_outgoing_envelope(&mut outbound_connections, envelope).await;
    }
});
```

to:

```rust
let mut outbound_handle = tokio::spawn(async move {
    loop {
        tokio::select! {
            envelope = outgoing_rx.recv() => {
                let Some(envelope) = envelope else {
                    break;
                };
                route_outgoing_envelope(&mut outbound_connections, envelope).await;
            }
            control = outbound_control_rx.recv() => {
                let Some(control) = control else {
                    break;
                };
                in_process_extra::handle_outbound_control(
                    &mut outbound_connections,
                    control,
                );
            }
        }
    }
});
```

- [ ] **Step 5: Add processor state and delegated branch**

Inside the processor task, after the main `session` creation, add:

```rust
let mut extra_connections = in_process_extra::ExtraConnectionState::default();
```

Add a `ProcessorCommand::Extra(command)` arm:

```rust
Some(ProcessorCommand::Extra(command)) => {
    extra_connections
        .handle_processor_command(&processor, command)
        .await;
}
```

Change `thread_created_rx` connection IDs from:

```rust
let connection_ids = if session.initialized() {
    vec![IN_PROCESS_CONNECTION_ID]
} else {
    Vec::<ConnectionId>::new()
};
```

to:

```rust
let connection_ids =
    extra_connections.initialized_connection_ids(session.initialized());
```

- [ ] **Step 6: Add client-loop extra command forwarding**

In the runtime client loop, add an `InProcessClientMessage::Extra(command)` arm before server request response handling:

```rust
Some(InProcessClientMessage::Extra(command)) => {
    match command {
        in_process_extra::ExtraConnectionCommand::Opened {
            connection_id,
            outgoing_tx,
            disconnect_token,
        } => {
            let prepared = in_process_extra::prepare_opened_connection(
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
                .send(ProcessorCommand::Extra(prepared.processor_command))
                .await
                .is_err()
            {
                break;
            }
        }
        in_process_extra::ExtraConnectionCommand::Request {
            connection_id,
            request,
        } => {
            if processor_tx
                .try_send(ProcessorCommand::Extra(
                    in_process_extra::ExtraProcessorCommand::Request {
                        connection_id,
                        request,
                    },
                ))
                .is_err()
            {
                warn!("dropping extra connection request (processor queue unavailable)");
            }
        }
        in_process_extra::ExtraConnectionCommand::Notification {
            connection_id,
            notification,
        } => {
            if processor_tx
                .try_send(ProcessorCommand::Extra(
                    in_process_extra::ExtraProcessorCommand::Notification {
                        connection_id,
                        notification,
                    },
                ))
                .is_err()
            {
                warn!("dropping extra connection notification (processor queue unavailable)");
            }
        }
        in_process_extra::ExtraConnectionCommand::Closed { connection_id } => {
            let _ = processor_tx
                .send(ProcessorCommand::Extra(
                    in_process_extra::ExtraProcessorCommand::Closed { connection_id },
                ))
                .await;
            let _ = outbound_control_tx
                .send(in_process_extra::OutboundControl::Unregister { connection_id })
                .await;
        }
    }
}
```

If clippy reports the nested match can be simplified, collapse it while preserving the order: outbound register before processor open; processor close before outbound unregister.

- [ ] **Step 7: Add in-process extra registration tests**

In `codex-rs/app-server/src/in_process.rs`, make the existing test module available to sibling module tests:

```rust
#[cfg(test)]
pub(crate) mod tests {
```

Inside that test module, add a crate-private bridge helper next to `start_test_client`:

```rust
pub(crate) async fn start_test_client_for_bridge() -> InProcessClientHandle {
    start_test_client(SessionSource::Cli).await
}
```

Then add:

```rust
#[tokio::test]
async fn register_extra_connection_after_shutdown_returns_broken_pipe() {
    let sender = {
        let client = start_test_client(SessionSource::Cli).await;
        let sender = client.sender();
        client
            .shutdown()
            .await
            .expect("in-process runtime should shutdown cleanly");
        sender
    };
    let (outgoing_tx, _outgoing_rx) = mpsc::channel(1);
    let error = sender
        .register_extra_connection(outgoing_tx)
        .expect_err("closed runtime should reject extra registration");
    assert_eq!(error.kind(), ErrorKind::BrokenPipe);
}
```

Add a main-path regression test if any existing `start_test_client` test needed code movement:

```rust
#[tokio::test]
async fn main_connection_still_handles_typed_request_after_extra_hooks() {
    let client = start_test_client(SessionSource::Cli).await;
    let response = client
        .request(ClientRequest::ConfigRequirementsRead {
            request_id: RequestId::Integer(41),
            params: None,
        })
        .await
        .expect("request transport should work")
        .expect("request should succeed");
    assert!(response.is_object());
    client
        .shutdown()
        .await
        .expect("in-process runtime should shutdown cleanly");
}
```

- [ ] **Step 8: Run app-server focused tests**

Run from `codex-rs`:

```bash
cargo test -p codex-app-server in_process
cargo test -p codex-app-server in_process_extra
```

Expected: both commands pass.

- [ ] **Step 9: Commit neutral runtime hooks**

Run from repo root:

```bash
git add codex-rs/app-server/src/in_process.rs codex-rs/app-server/src/in_process_extra.rs
git commit -m "feat(app-server): add neutral in-process extra connection hooks"
```

Commit only if tests in Step 8 pass and no out-of-scope files are staged.

## Task 4: Implement GUI Transport Backend

**Files:**
- Modify: `codex-rs/app-server/src/gui_transport.rs`
- Test via: `codex-rs/app-server/src/gui_transport.rs` unit tests

- [ ] **Step 1: Define backend type**

In `gui_transport.rs`, add:

```rust
#[derive(Clone)]
pub(crate) struct GuiTransportBackend {
    sender: InProcessClientSender,
}

impl GuiTransportBackend {
    pub(crate) fn new(sender: InProcessClientSender) -> Self {
        Self { sender }
    }
}
```

- [ ] **Step 2: Implement `GuiBackend`**

Add:

```rust
impl GuiBackend for GuiTransportBackend {
    async fn connect(&self, connection: AuthenticatedGuiConnection) -> anyhow::Result<()> {
        connect_authenticated_gui(self.sender.clone(), connection).await?;
        Ok(())
    }
}
```

Add the internal function:

```rust
async fn connect_authenticated_gui(
    sender: InProcessClientSender,
    mut connection: AuthenticatedGuiConnection,
) -> io::Result<()> {
    let handle = sender.register_extra_connection(connection.outbound_tx.clone())?;
    let command_sender = handle.command_sender();
    let connection_id = handle.connection_id();
    let disconnect_token = handle.disconnect_token();

    loop {
        tokio::select! {
            inbound = connection.inbound_rx.recv() => {
                let Some(text) = inbound else {
                    break;
                };
                match serde_json::from_str::<JSONRPCMessage>(&text) {
                    Ok(JSONRPCMessage::Request(request)) => {
                        command_sender.request(connection_id, request)?;
                    }
                    Ok(JSONRPCMessage::Notification(notification)) => {
                        command_sender.notification(connection_id, notification)?;
                    }
                    Ok(JSONRPCMessage::Response(_)) | Ok(JSONRPCMessage::Error(_)) => {}
                    Err(error) => {
                        warn!(%error, "dropping invalid GUI JSON-RPC text");
                    }
                }
            }
            _ = disconnect_token.cancelled() => {
                break;
            }
        }
    }

    drop(handle);
    Ok(())
}
```

This function must not duplicate browser allowlist logic. Browser allowlist already lives in `codex-gui-host`; `gui_transport.rs` only handles authenticated, filtered text.

- [ ] **Step 3: Add direct transport tests**

Add tests in `gui_transport.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use codex_app_server_protocol::JSONRPC_VERSION;
    use codex_app_server_protocol::RequestId;
    use pretty_assertions::assert_eq;
    use tokio::time::Duration;

    #[tokio::test]
    async fn authenticated_gui_initialize_round_trips_with_jsonrpc_version() {
        let client = crate::in_process::tests::start_test_client_for_bridge().await;
        let backend = GuiTransportBackend::new(client.sender());
        let (connection, inbound_tx, mut outbound_rx) =
            AuthenticatedGuiConnection::new();
        let task = tokio::spawn(async move { backend.connect(connection).await });

        inbound_tx
            .send(
                serde_json::json!({
                    "jsonrpc": JSONRPC_VERSION,
                    "id": 11,
                    "method": "initialize",
                    "params": {
                        "clientInfo": {
                            "name": "gui-bridge-test",
                            "version": "0.0.0"
                        }
                    }
                })
                .to_string(),
            )
            .await
            .expect("GUI inbound send should succeed");

        let response = tokio::time::timeout(Duration::from_secs(2), outbound_rx.recv())
            .await
            .expect("response should arrive")
            .expect("response channel should stay open");
        let value: serde_json::Value =
            serde_json::from_str(&response).expect("response should be JSON");
        assert_eq!(value["jsonrpc"], JSONRPC_VERSION);
        assert_eq!(value["id"], 11);
        assert!(value.get("result").is_some());

        drop(inbound_tx);
        task.await
            .expect("backend task should join")
            .expect("backend should finish cleanly");
        client
            .shutdown()
            .await
            .expect("in-process runtime should shutdown cleanly");
    }

    #[tokio::test]
    async fn authenticated_gui_ignores_browser_response_messages() {
        let client = crate::in_process::tests::start_test_client_for_bridge().await;
        let backend = GuiTransportBackend::new(client.sender());
        let (connection, inbound_tx, mut outbound_rx) =
            AuthenticatedGuiConnection::new();
        let task = tokio::spawn(async move { backend.connect(connection).await });

        inbound_tx
            .send(
                serde_json::json!({
                    "jsonrpc": JSONRPC_VERSION,
                    "id": 12,
                    "result": {}
                })
                .to_string(),
            )
            .await
            .expect("GUI inbound send should succeed");
        assert!(
            tokio::time::timeout(Duration::from_millis(100), outbound_rx.recv())
                .await
                .is_err()
        );

        drop(inbound_tx);
        task.await
            .expect("backend task should join")
            .expect("backend should finish cleanly");
        client
            .shutdown()
            .await
            .expect("in-process runtime should shutdown cleanly");
    }
}
```

- [ ] **Step 4: Run GUI transport tests**

Run from `codex-rs`:

```bash
cargo test -p codex-app-server gui_transport
```

Expected: tests pass and the initialize response contains `"jsonrpc":"2.0"`.

- [ ] **Step 5: Commit GUI transport backend**

Run from repo root:

```bash
git add codex-rs/app-server/src/gui_transport.rs codex-rs/app-server/src/in_process.rs codex-rs/app-server/src/in_process_extra.rs
git commit -m "feat(app-server): bridge authenticated GUI traffic to in-process runtime"
```

Commit only if Task 4 tests pass.

## Task 5: Implement App-Server GUI Host Manager

**Files:**
- Modify: `codex-rs/app-server/src/gui_host.rs`
- Modify: `codex-rs/app-server/src/lib.rs`

- [ ] **Step 1: Define manager**

In `gui_host.rs`, add:

```rust
pub struct GuiHostManager {
    sender: InProcessClientSender,
    config: GuiHostConfig,
    handle: Mutex<Option<GuiHostHandle>>,
}

impl GuiHostManager {
    pub fn new(sender: InProcessClientSender, config: GuiHostConfig) -> Self {
        Self {
            sender,
            config,
            handle: Mutex::new(None),
        }
    }
}
```

- [ ] **Step 2: Add lazy start / reuse**

Add:

```rust
impl GuiHostManager {
    pub async fn launch_url_for_thread(
        &self,
        thread_id: ThreadId,
    ) -> io::Result<String> {
        let mut guard = self.handle.lock().await;
        if guard.is_none() {
            let backend = GuiTransportBackend::new(self.sender.clone());
            let handle = GuiHost::start(self.config.clone(), backend).await?;
            *guard = Some(handle);
        }
        let handle = guard
            .as_ref()
            .expect("GUI host handle should exist after lazy start");
        Ok(handle.launch_url_for_thread(thread_id))
    }

    pub async fn shutdown(&self) {
        let handle = self.handle.lock().await.take();
        if let Some(handle) = handle {
            handle.shutdown().await;
        }
    }
}
```

Do not implement app-server-client facade methods here. `05` will decide how `InProcessAppServerClient` owns and drops `GuiHostManager`.

- [ ] **Step 3: Add Drop cancellation without async blocking**

Because `Drop` cannot await, add nonblocking cancellation:

```rust
impl Drop for GuiHostManager {
    fn drop(&mut self) {
        if let Ok(mut handle) = self.handle.try_lock() {
            if let Some(handle) = handle.take() {
                handle.cancel_token().cancel();
            }
        }
    }
}
```

This is best-effort only; `05` must still make app-server-client call async shutdown before worker teardown.

- [ ] **Step 4: Add manager tests**

Add tests in `gui_host.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use codex_gui_host::DevAssetProxyConfig;
    use codex_gui_host::GuiHostMode;
    use codex_protocol::ThreadId;
    use pretty_assertions::assert_eq;

    #[tokio::test]
    async fn launch_url_reuses_same_host_for_manager_lifetime() {
        let client = crate::in_process::tests::start_test_client_for_bridge().await;
        let manager = GuiHostManager::new(
            client.sender(),
            GuiHostConfig {
                mode: GuiHostMode::Dev(DevAssetProxyConfig {
                    vite_origin: "http://127.0.0.1:5173".to_string(),
                }),
            },
        );
        let thread_a = ThreadId::from_string("00000000-0000-0000-0000-0000000000a1")
            .expect("valid thread id");
        let thread_b = ThreadId::from_string("00000000-0000-0000-0000-0000000000b2")
            .expect("valid thread id");
        let url_a = manager
            .launch_url_for_thread(thread_a)
            .await
            .expect("first launch URL should be created");
        let url_b = manager
            .launch_url_for_thread(thread_b)
            .await
            .expect("second launch URL should reuse host");
        let origin_a = url_a
            .as_str()
            .split("/?")
            .next()
            .expect("URL should contain query");
        let origin_b = url_b
            .as_str()
            .split("/?")
            .next()
            .expect("URL should contain query");
        assert_eq!(origin_a, origin_b);
        assert!(
            url_a
                .as_str()
                .contains("threadId=00000000-0000-0000-0000-0000000000a1")
        );
        assert!(
            url_b
                .as_str()
                .contains("threadId=00000000-0000-0000-0000-0000000000b2")
        );
        manager.shutdown().await;
        client
            .shutdown()
            .await
            .expect("in-process runtime should shutdown cleanly");
    }
}
```

- [ ] **Step 5: Run manager tests**

Run from `codex-rs`:

```bash
cargo test -p codex-app-server gui_host
```

Expected: tests pass and no `codex-rs/app-server-client/**` changes are needed.

- [ ] **Step 6: Commit GUI host manager**

Run from repo root:

```bash
git add codex-rs/app-server/src/gui_host.rs codex-rs/app-server/src/lib.rs
git commit -m "feat(app-server): add GUI host lifecycle manager"
```

Commit only if Task 5 tests pass.

## Task 6: Final App-Server Adapter Verification And Locks

**Files:**
- Verify: `codex-rs/app-server/**`
- Verify: `codex-rs/app-server/Cargo.toml`
- Verify: `codex-rs/Cargo.lock`
- Verify: `MODULE.bazel.lock`

- [ ] **Step 1: Run scoped app-server tests**

Run from `codex-rs`:

```bash
just test -p codex-app-server
```

Expected: app-server crate tests pass.

- [ ] **Step 2: Run formatter**

Run from `codex-rs`:

```bash
just fmt
```

Expected: formatting completes. Do not rerun tests solely because `just fmt` ran.

- [ ] **Step 3: Run scoped fix**

Run from `codex-rs`:

```bash
just fix -p codex-app-server
```

Expected: clippy fix completes. If the command fails with an environment lock/listener error such as `failed to bind TCP listener to manage locking` or `Operation not permitted`, record the exact output and run this fallback instead:

```bash
cargo clippy -p codex-app-server --all-targets -- -D warnings
```

Do not rerun tests after `fix` or `fmt`.

- [ ] **Step 4: Refresh dependency locks**

Because this plan adds `codex-gui-host` as a dependency of `codex-app-server`, run from repo root:

```bash
just bazel-lock-update
just bazel-lock-check
```

Expected: `MODULE.bazel.lock` is up to date and the check passes.

- [ ] **Step 5: Confirm scope stayed inside `04`**

Run from repo root:

```bash
git diff --name-only "$(cat /tmp/codex-gui-host-04-base)"..HEAD
```

Expected output paths are limited to:

```text
codex-rs/app-server/Cargo.toml
codex-rs/app-server/src/lib.rs
codex-rs/app-server/src/gui_host.rs
codex-rs/app-server/src/gui_transport.rs
codex-rs/app-server/src/in_process_extra.rs
codex-rs/app-server/src/in_process.rs
codex-rs/Cargo.lock
MODULE.bazel.lock
```

If any `app-server-client`, `tui`, `codex-gui`, `core`, `app-server-protocol`, or `gui-host` source path appears, stop and remove or explicitly justify the out-of-scope change before proceeding.

- [ ] **Step 6: Confirm forbidden symbols are absent from `in_process.rs`**

Run from repo root:

```bash
rg -n 'Gui|WebSocket|browser|token|Host|Origin|allowlist|launch_url|open_extra_jsonrpc_connection|ExtraJsonRpcConnectionFactory' \
  codex-rs/app-server/src/in_process.rs
```

Expected: no output.

- [ ] **Step 7: Final commit for lockfiles or verification-only changes**

If Task 6 changed lockfiles or formatting after the previous commits, run from repo root:

```bash
git add codex-rs/app-server/Cargo.toml codex-rs/Cargo.lock MODULE.bazel.lock codex-rs/app-server/src
git commit -m "chore(app-server): finalize GUI host adapter wiring"
```

If no files changed, skip this commit and record that no final commit was necessary.

## Acceptance Criteria

- `codex-app-server` depends on `codex-gui-host`; `codex-gui-host` still does not depend on `codex-app-server`.
- `codex-rs/app-server/src/in_process_extra.rs` owns extra connection state, ID allocation, writer bridge, outbound control, and close cleanup details.
- `codex-rs/app-server/src/in_process.rs` contains only neutral extra connection hooks and no GUI/WebSocket/browser/token/Host/Origin/allowlist/launch URL concepts.
- `gui_transport.rs` implements `GuiBackend` and forwards authenticated JSON-RPC request / notification text into extra in-process connection commands.
- Outbound GUI text includes `"jsonrpc":"2.0"` so `codex-gui-host` backend filtering does not drop valid app-server responses or projection notifications.
- `gui_host.rs` owns lazy start / reuse / shutdown of `codex_gui_host::GuiHost`.
- No app-server-client facade, TUI command, frontend, protocol shape, or core changes are included in `04`.
- `just test -p codex-app-server`, `just fmt`, scoped `just fix -p codex-app-server` or clippy fallback, `just bazel-lock-update`, and `just bazel-lock-check` have been run or their environment failure has been recorded.

## Self-Review Checklist

- [ ] This plan executes `03` instead of reopening bridge architecture.
- [ ] Every new GUI-specific concept is outside `in_process.rs`.
- [ ] `in_process_extra.rs` has no dependency on `codex-gui-host`.
- [ ] No step modifies `codex-rs/app-server-client/**`, `codex-rs/tui/**`, `codex-gui/**`, `codex-rs/core/**`, or `codex-rs/app-server-protocol/**`.
- [ ] Tests cover both neutral extra connection serialization and the real authenticated GUI backend path.
- [ ] The plan includes lockfile commands for the app-server dependency change.
- [ ] The plan stops before `05-app-server-client-facade.md`.
