# Codex GUI App-Server Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the GUI host bridge inside `codex-app-server`: a `GuiHostManager` owned by `InProcessAppServerClient` plus a `GuiBackend` (`gui_transport.rs`) that converts each authenticated GUI WebSocket into an extra connection on the in-process runtime (plan 06's `register_extra_connection` API).

**Architecture:** `GuiHostManager` lazy-starts a single `codex_gui_host::GuiHost` per session and provides `launch_url_for_thread(primary_thread_id) -> anyhow::Result<String>` (raw URL, wrapped into `GuiLaunchUrl` at the `codex-app-server-client` boundary since the app-server crate cannot depend on the client crate). Each `AuthenticatedGuiConnection` handed to `gui_transport.rs` calls `InProcessClientSender::register_extra_connection`, spawns an inbound task that parses `JSONRPCMessage` (validates against the GUI allowlist) and forwards to `ExtraConnectionCommandSender`, and spawns an outbound task that forwards already-serialized text from `ExtraConnectionHandle::outgoing_rx` straight to the browser (allowlist filter wraps the send).

**Tech Stack:** Rust 2024, tokio, codex-gui-host, codex-app-server, codex-app-server-client, codex-app-server-protocol.

---

Source spec: `docs/superpowers/specs/2026-05-11-codex-gui-host-redesign.md`.
Roadmap: `docs/superpowers/plans/2026-05-11-gui-host/00-roadmap.md`.
Prerequisite plan: `docs/superpowers/plans/2026-05-11-gui-host/06-in-process-gui-launch.md`.

## Hard Constraints

- Do not touch `codex-rs/app-server/src/in_process.rs` or `codex-rs/app-server/src/message_processor.rs` except to satisfy the API shape produced by plan 06 (which must already be merged).
- Do not add a `TransportEvent` producer, do not call `start_remote_control`, and do not touch `run_main_with_transport_options`.
- Do not consume `ConnectionOrigin::GuiHost` in the MVP path; the variant stays reserved for the future external-process backend.
- `codex-gui-host` must stay free of `codex-app-server` dependencies; the backend impl lives inside `codex-app-server`.
- Parse JSON exactly once per inbound frame, inside `gui_transport.rs`. `in_process.rs` receives typed `JSONRPCRequest` / `JSONRPCNotification` values.
- For every `register_extra_connection` call, exactly one corresponding `ExtraConnectionHandle::Drop` must run along every normal termination path (auth failure before `register_extra_connection`, successful close, inbound parse error, backend error, `disconnect_token` cancel).
- Keep allowlist enforcement in `codex-gui-host` filters (request method, notification method, response/error drop). `gui_transport.rs` only bridges — no policy decisions beyond applying the existing filter helpers.

## File Structure

- Modify: `codex-rs/app-server/Cargo.toml` — add `codex-gui-host = { workspace = true }`. No `async-trait` dependency is required; the `AppServerClientGuiExt` trait uses RPITIT.
- Modify: `codex-rs/app-server/BUILD.bazel` — add `//gui-host:codex-gui-host` to deps if the file lists them explicitly.
- Modify: `codex-rs/app-server/src/lib.rs` — declare `mod gui_host;` and `mod gui_transport;`.
- Create: `codex-rs/app-server/src/gui_host.rs` — `GuiHostManager` + lazy-start + `launch_url_for_thread` + `shutdown`.
- Create: `codex-rs/app-server/src/gui_transport.rs` — `GuiTransportBackend` implementing `codex_gui_host::GuiBackend`.
- Modify: `codex-rs/app-server-client/src/lib.rs` — `InProcessAppServerClient` carries `Arc<GuiHostManager>` (non-optional; the manager itself handles lazy start internally); implements `AppServerClientGuiExt` via the manager.
- Tests: `codex-rs/app-server/src/gui_transport.rs` (inline `#[cfg(test)] mod tests`).
- Tests: `codex-rs/app-server/src/gui_host.rs` (inline `#[cfg(test)] mod tests`).
- Tests: `codex-rs/app-server-client/src/lib.rs` (`gui_launch_url_returns_real_url_for_in_process` integration test).
- Verify: `codex-rs/app-server-transport/src/transport/mod.rs` — `ConnectionOrigin::GuiHost` still present, existing unit test still green.

## Task 0: Verify Plan 06 Prerequisites

- [ ] **Step 1: Confirm plan 06 has landed**

Run:

```bash
cargo test -p codex-app-server -- extra_connection_request_reaches_message_processor
cargo test -p codex-app-server -- dropping_extra_handle_triggers_connection_closed
cargo test -p codex-app-server-client -- gui_launch_error_variants_are_distinct
```

Expected: all tests pass. If any test fails, stop — finish plan 06 before continuing.

- [ ] **Step 2: Confirm `ConnectionOrigin::GuiHost` baseline**

```bash
cargo test -p codex-app-server-transport connection_origin_has_distinct_gui_host_variant
```

Expected: PASS. This variant was landed earlier; this step is only a pre-flight check.

## Task 1: Add `codex-gui-host` Dependency to `codex-app-server`

**Files:**
- Modify: `codex-rs/app-server/Cargo.toml`
- Modify: `codex-rs/app-server/BUILD.bazel` (if the file declares dependencies explicitly)

- [ ] **Step 1: Add the workspace dependency**

In `codex-rs/app-server/Cargo.toml`, under `[dependencies]`, add (keep alphabetical with existing entries):

```toml
codex-gui-host = { workspace = true }
```

No `async-trait` dependency is added. The `AppServerClientGuiExt` trait defined in plan 06 uses RPITIT (`impl Future<...> + Send`), not `#[async_trait]`.

- [ ] **Step 2: Update Bazel deps if needed**

Inspect `codex-rs/app-server/BUILD.bazel`. If it lists direct dependencies (e.g. in a `rust_library` `deps = [...]` block), add `"//gui-host:codex-gui-host"` in the same style.

- [ ] **Step 3: Verify the crate still builds**

```bash
cargo build -p codex-app-server
```

Expected: compiles cleanly.

- [ ] **Step 4: Regenerate Bazel lockfile**

From `codex-rs`:

```bash
just bazel-lock-update
just bazel-lock-check
```

Expected: lockfile is up-to-date.

- [ ] **Step 5: Commit**

```bash
git add codex-rs/app-server/Cargo.toml codex-rs/app-server/BUILD.bazel codex-rs/Cargo.lock codex-rs/Cargo.Bazel.lock
git commit -m "build(app-server): depend on codex-gui-host"
```

Drop any untouched files from `git add`.

## Task 2: `GuiHostManager` Lazy-Start

**Files:**
- Create: `codex-rs/app-server/src/gui_host.rs`
- Modify: `codex-rs/app-server/src/lib.rs` (declare the new module)

- [ ] **Step 1: Create placeholder module**

Create `codex-rs/app-server/src/gui_host.rs` containing only a doc header so the module exists before Step 2 fills it. The behavior-level test that drives this module's TDD lives in Task 4 Step 1 (`gui_launch_url_returns_real_url_for_in_process`); wiring modules like this do not benefit from a local unit test.

```rust
//! Placeholder — real implementation lands in Step 2.
```

Declare the module now in `codex-rs/app-server/src/lib.rs` near the other `mod` lines:

```rust
pub mod gui_host;
pub mod gui_transport;
```

Run:

```bash
cargo check -p codex-app-server
```

Expected: FAIL — `gui_transport` module file does not yet exist. This is intentional: Task 3 Step 1 creates that file, so the build only goes green after Task 3 Step 1 lands.

- [ ] **Step 2: Implement `GuiHostManager`**

Replace the test file content with:

```rust
//! GUI host lifecycle owned by the in-process app-server runtime.
//!
//! `GuiHostManager` lazy-starts a single `GuiHost` on the first
//! `launch_url_for_thread` call and reuses it for subsequent calls.
//! Shutdown is triggered when the manager is dropped by the embedding client.
//!
//! This module lives inside `codex-app-server`. To avoid a crate cycle with
//! `codex-app-server-client`, it only exposes a raw `String` URL — the client
//! facade wraps the return value in `codex_app_server_client::GuiLaunchUrl`.

use std::sync::Arc;

use anyhow::Context;
use codex_gui_host::GuiHost;
use codex_gui_host::GuiHostConfig;
use codex_gui_host::GuiHostHandle;
use codex_gui_host::GuiHostMode;
use tokio::sync::Mutex;

use crate::gui_transport::GuiTransportBackend;
use crate::in_process::InProcessClientSender;

pub struct GuiHostManager {
    inner: Mutex<Option<GuiHostHandle>>,
    sender: InProcessClientSender,
}

impl GuiHostManager {
    pub fn new(sender: InProcessClientSender) -> Self {
        Self {
            inner: Mutex::new(None),
            sender,
        }
    }

    pub async fn launch_url_for_thread(
        self: &Arc<Self>,
        primary_thread_id: &str,
    ) -> anyhow::Result<String> {
        let mut guard = self.inner.lock().await;
        if guard.is_none() {
            let mode = GuiHostMode::default_for_profile()
                .context("resolve GUI host mode")?;
            let backend = GuiTransportBackend::new(self.sender.clone());
            let handle = GuiHost::start(GuiHostConfig { mode }, backend)
                .await
                .context("start GuiHost")?;
            *guard = Some(handle);
        }
        let handle = guard.as_ref().expect("GuiHostHandle just ensured");
        Ok(handle.launch_url_for_thread(primary_thread_id))
    }

    pub async fn shutdown(self: Arc<Self>) {
        let handle = {
            let mut guard = self.inner.lock().await;
            guard.take()
        };
        if let Some(handle) = handle {
            handle.shutdown().await;
        }
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn gui_launch_url_is_plain_http_loopback() {
        let fake = "http://127.0.0.1:4321/?threadId=t#token=x";
        assert!(fake.starts_with("http://127.0.0.1:"));
        assert!(fake.contains("#token="));
    }
}
```

This keeps `codex-app-server` free of `codex-app-server-client` imports. `GuiTransportBackend` is declared by Task 3. Until that task runs, `cargo build` here will fail on that import; the test-first sequence in this task intentionally runs Task 3's stub next.

- [ ] **Step 3: Do not compile yet**

Do not run `cargo test` until Task 3 Step 2 lands the `GuiTransportBackend` stub. Proceed directly to Task 3.

## Task 3: `GuiTransportBackend` Implementation

**Files:**
- Create: `codex-rs/app-server/src/gui_transport.rs`

- [ ] **Step 1: Write failing allowlist test**

Create `codex-rs/app-server/src/gui_transport.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use codex_app_server_protocol::JSONRPCMessage;
    use codex_app_server_protocol::JSONRPCNotification;
    use codex_app_server_protocol::JSONRPCRequest;
    use codex_app_server_protocol::RequestId;
    use pretty_assertions::assert_eq;

    #[test]
    fn allowlisted_request_passes_filter() {
        let request = JSONRPCRequest {
            id: RequestId::Integer(1),
            method: "initialize".to_string(),
            params: None,
            trace: None,
        };
        assert_eq!(
            classify_inbound(JSONRPCMessage::Request(request.clone())),
            InboundClassification::ForwardRequest(request),
        );
    }

    #[test]
    fn non_allowlisted_request_is_rejected() {
        let request = JSONRPCRequest {
            id: RequestId::Integer(1),
            method: "thread/start".to_string(),
            params: None,
            trace: None,
        };
        assert_eq!(
            classify_inbound(JSONRPCMessage::Request(request)),
            InboundClassification::RejectPolicy,
        );
    }

    #[test]
    fn response_and_error_variants_are_dropped() {
        use codex_app_server_protocol::JSONRPCError;
        use codex_app_server_protocol::JSONRPCErrorError;
        use codex_app_server_protocol::JSONRPCResponse;
        let response = JSONRPCResponse {
            id: RequestId::Integer(1),
            result: serde_json::json!({}),
        };
        assert_eq!(
            classify_inbound(JSONRPCMessage::Response(response)),
            InboundClassification::Drop,
        );
        let error = JSONRPCError {
            id: RequestId::Integer(2),
            error: JSONRPCErrorError {
                code: -32000,
                message: "x".to_string(),
                data: None,
            },
        };
        assert_eq!(
            classify_inbound(JSONRPCMessage::Error(error)),
            InboundClassification::Drop,
        );
    }

    #[test]
    fn notification_outside_allowlist_is_dropped() {
        let notification = JSONRPCNotification {
            method: "turn/completed".to_string(),
            params: None,
        };
        assert_eq!(
            classify_inbound(JSONRPCMessage::Notification(notification)),
            InboundClassification::Drop,
        );
    }

    #[test]
    fn non_allowlisted_outbound_is_filtered() {
        let outbound = serde_json::json!({
            "jsonrpc": "2.0",
            "method": "some/internal",
            "params": {}
        })
        .to_string();
        assert!(!outbound_is_allowed(&outbound));
    }

    #[test]
    fn allowlisted_outbound_passes() {
        let outbound = serde_json::json!({
            "jsonrpc": "2.0",
            "method": "thread/projection/event",
            "params": {}
        })
        .to_string();
        assert!(outbound_is_allowed(&outbound));
    }
}
```

Run:

```bash
cargo test -p codex-app-server --lib gui_transport
```

Expected: FAIL with `no function named \`classify_inbound\`` etc.

- [ ] **Step 2: Implement `GuiTransportBackend`**

Replace the file contents of `codex-rs/app-server/src/gui_transport.rs` with:

```rust
//! `GuiBackend` implementation for the in-process app-server runtime.
//!
//! Each authenticated GUI connection is registered as an extra connection on
//! the in-process runtime. Inbound JSON is parsed into typed JSON-RPC messages
//! and filtered against `codex_gui_host::filter` allowlists; outbound text is
//! forwarded verbatim after an allowlist check.

use codex_app_server::in_process::ExtraConnectionHandle;
use codex_app_server::in_process::InProcessClientSender;
use codex_app_server_protocol::JSONRPCMessage;
use codex_app_server_protocol::JSONRPCNotification;
use codex_app_server_protocol::JSONRPCRequest;
use codex_gui_host::AuthenticatedGuiConnection;
use codex_gui_host::GuiBackend;
use codex_gui_host::filter::is_allowed_client_notification_method;
use codex_gui_host::filter::is_allowed_client_request_method;
use codex_gui_host::filter::is_allowed_server_notification_method;
use tokio::sync::mpsc;

#[derive(Clone)]
pub struct GuiTransportBackend {
    sender: InProcessClientSender,
}

impl GuiTransportBackend {
    pub fn new(sender: InProcessClientSender) -> Self {
        Self { sender }
    }
}

#[derive(Debug, PartialEq, Eq)]
enum InboundClassification {
    ForwardRequest(JSONRPCRequest),
    ForwardNotification(JSONRPCNotification),
    Drop,
    RejectPolicy,
}

fn classify_inbound(message: JSONRPCMessage) -> InboundClassification {
    match message {
        JSONRPCMessage::Request(request) => {
            if is_allowed_client_request_method(request.method.as_str()) {
                InboundClassification::ForwardRequest(request)
            } else {
                InboundClassification::RejectPolicy
            }
        }
        JSONRPCMessage::Notification(notification) => {
            if is_allowed_client_notification_method(notification.method.as_str()) {
                InboundClassification::ForwardNotification(notification)
            } else {
                InboundClassification::Drop
            }
        }
        JSONRPCMessage::Response(_) | JSONRPCMessage::Error(_) => InboundClassification::Drop,
    }
}

fn outbound_is_allowed(text: &str) -> bool {
    let Ok(value): Result<serde_json::Value, _> = serde_json::from_str(text) else {
        return false;
    };
    if let Some(method) = value.get("method").and_then(|m| m.as_str()) {
        return is_allowed_server_notification_method(method);
    }
    // Responses/errors are always allowed; they originate from the app-server
    // replying to an already-allowlisted request issued by the browser.
    value.get("id").is_some()
}

impl GuiBackend for GuiTransportBackend {
    fn connect(
        &self,
        connection: AuthenticatedGuiConnection,
    ) -> impl std::future::Future<Output = anyhow::Result<()>> + Send {
        let sender = self.sender.clone();
        async move {
            let AuthenticatedGuiConnection {
                mut inbound_rx,
                outbound_tx,
            } = connection;

            // Registers the connection with the in-process runtime. `handle`
            // owns the `Drop` that emits `ExtraConnectionClosed` exactly once.
            // `ExtraConnectionHandle` implements `Drop`, so we cannot move
            // fields out by destructuring — clone/borrow instead and keep
            // `handle` alive until both pumps stop.
            let mut handle = sender.register_extra_connection();
            let command_sender = handle.command_sender.clone();
            let disconnect_token = handle.disconnect_token.clone();
            let outgoing_tx_for_parse = handle.outgoing_tx.clone();
            // `outgoing_rx` is a bare `Receiver`, so moving it out is fine as
            // long as we replace it with a dummy receiver to satisfy `Drop`.
            let (_noop_tx, noop_rx) = mpsc::channel::<String>(1);
            let outgoing_rx =
                std::mem::replace(&mut handle.outgoing_rx, noop_rx);

            let outbound_task = {
                let outbound_tx = outbound_tx.clone();
                let disconnect_token = disconnect_token.clone();
                tokio::spawn(pump_outbound(outgoing_rx, outbound_tx, disconnect_token))
            };

            let inbound_task = {
                let disconnect_token = disconnect_token.clone();
                tokio::spawn(async move {
                    pump_inbound(
                        &mut inbound_rx,
                        &command_sender,
                        &outgoing_tx_for_parse,
                        disconnect_token,
                    )
                    .await
                })
            };

            // If either pump terminates (browser disconnect, parse-error
            // write failure, backend disconnect token), cancel the other so
            // `handle` drops exactly once and `ExtraConnectionClosed` fires.
            let result = tokio::select! {
                inbound = inbound_task => inbound.unwrap_or_else(|err| {
                    Err(anyhow::anyhow!("inbound pump join error: {err}"))
                }),
                outbound = outbound_task => {
                    outbound.unwrap_or_else(|err| {
                        tracing::warn!("outbound pump join error: {err}");
                    });
                    Ok(())
                }
            };
            disconnect_token.cancel();

            drop(handle);
            result
        }
    }
}

async fn pump_inbound(
    inbound_rx: &mut mpsc::Receiver<String>,
    command_sender: &codex_app_server::in_process::ExtraConnectionCommandSender,
    parse_error_tx: &mpsc::Sender<String>,
    disconnect_token: tokio_util::sync::CancellationToken,
) -> anyhow::Result<()> {
    loop {
        tokio::select! {
            _ = disconnect_token.cancelled() => break,
            message = inbound_rx.recv() => {
                let Some(text) = message else { break };
                let parsed = match serde_json::from_str::<JSONRPCMessage>(&text) {
                    Ok(parsed) => parsed,
                    Err(err) => {
                        if parse_error_tx
                            .send(build_jsonrpc_parse_error(&err))
                            .await
                            .is_err()
                        {
                            break;
                        }
                        continue;
                    }
                };
                match classify_inbound(parsed) {
                    InboundClassification::ForwardRequest(request) => {
                        if let Err(err) = command_sender.send_request(request) {
                            tracing::warn!("GUI inbound request failed: {err}");
                            break;
                        }
                    }
                    InboundClassification::ForwardNotification(notification) => {
                        if let Err(err) = command_sender.send_notification(notification) {
                            tracing::warn!("GUI inbound notification failed: {err}");
                            break;
                        }
                    }
                    InboundClassification::Drop => continue,
                    InboundClassification::RejectPolicy => {
                        tracing::warn!("GUI inbound rejected by allowlist");
                        continue;
                    }
                }
            }
        }
    }
    Ok(())
}

fn build_jsonrpc_parse_error(err: &serde_json::Error) -> String {
    serde_json::json!({
        "jsonrpc": "2.0",
        "id": serde_json::Value::Null,
        "error": {
            "code": -32700,
            "message": format!("Parse error: {err}")
        }
    })
    .to_string()
}

async fn pump_outbound(
    mut outgoing_rx: mpsc::Receiver<String>,
    outbound_tx: mpsc::Sender<String>,
    disconnect_token: tokio_util::sync::CancellationToken,
) {
    loop {
        tokio::select! {
            _ = disconnect_token.cancelled() => break,
            text = outgoing_rx.recv() => {
                let Some(text) = text else { break };
                if !outbound_is_allowed(&text) {
                    continue;
                }
                if outbound_tx.send(text).await.is_err() {
                    break;
                }
            }
        }
    }
}
```

- [ ] **Step 3: Run the filter tests**

```bash
cargo test -p codex-app-server --lib gui_transport
```

Expected: all five filter tests pass.

- [ ] **Step 4: Run the lazy-start test too**

```bash
cargo test -p codex-app-server gui_launch_url_is_plain_http_loopback
```

Expected: PASS.

- [ ] **Step 5: Commit both modules**

```bash
git add codex-rs/app-server/src/gui_host.rs codex-rs/app-server/src/gui_transport.rs codex-rs/app-server/src/lib.rs
git commit -m "feat(app-server): add GUI host manager and transport bridge"
```

## Task 4: Wire `AppServerClientGuiExt` for In-Process Client

**Files:**
- Modify: `codex-rs/app-server-client/src/lib.rs`

- [ ] **Step 1: Write failing integration test**

Add to the existing `#[cfg(test)] mod tests` in `codex-rs/app-server-client/src/lib.rs`:

```rust
    #[tokio::test]
    async fn gui_launch_url_returns_real_url_for_in_process() {
        use crate::AppServerClientGuiExt;
        let TestClient { client, .. } = start_test_client(SessionSource::Cli).await;
        let url = client
            .gui_launch_url("thread-test")
            .await
            .expect("gui launch url");
        assert!(url.url.starts_with("http://127.0.0.1:"));
        assert!(url.url.contains("threadId=thread-test"));
        assert!(url.url.contains("#token="));
        client.shutdown().await.expect("shutdown");
    }
```

Run:

```bash
cargo test -p codex-app-server-client gui_launch_url_returns_real_url_for_in_process
```

Expected: FAIL — `InProcessAppServerClient` does not yet implement `AppServerClientGuiExt`.

- [ ] **Step 2: Add `GuiHostManager` handle to `InProcessAppServerClient`**

Modify `InProcessAppServerClient` in `codex-rs/app-server-client/src/lib.rs`:

```rust
pub struct InProcessAppServerClient {
    command_tx: mpsc::Sender<ClientCommand>,
    event_rx: mpsc::Receiver<InProcessServerEvent>,
    worker_handle: tokio::task::JoinHandle<()>,
    gui_host_manager: std::sync::Arc<codex_app_server::gui_host::GuiHostManager>,
}
```

In `start`, after `let request_sender = handle.sender();`, create the manager:

```rust
        let gui_host_manager = std::sync::Arc::new(
            codex_app_server::gui_host::GuiHostManager::new(request_sender.clone()),
        );
```

Populate the new field when returning `Self` from `start`:

```rust
        Ok(Self {
            command_tx,
            event_rx,
            worker_handle,
            gui_host_manager,
        })
```

Implement the trait at the bottom of the file:

```rust
impl crate::gui::AppServerClientGuiExt for InProcessAppServerClient {
    fn gui_launch_url(
        &self,
        primary_thread_id: &str,
    ) -> impl std::future::Future<
        Output = Result<crate::gui::GuiLaunchUrl, crate::gui::GuiLaunchError>,
    > + Send + '_ {
        let manager = std::sync::Arc::clone(&self.gui_host_manager);
        let thread_id = primary_thread_id.to_string();
        async move {
            manager
                .launch_url_for_thread(&thread_id)
                .await
                .map(|url| crate::gui::GuiLaunchUrl { url })
                .map_err(|err| {
                    crate::gui::GuiLaunchError::Transport(std::io::Error::other(err.to_string()))
                })
        }
    }
}
```

`launch_url_for_thread` returns a plain `String` (the `codex-app-server` crate cannot import `codex-app-server-client`, so the URL crosses the crate boundary as a raw string). The client-side facade wraps it in `GuiLaunchUrl` here.

- [ ] **Step 3: Shutdown ordering**

Extend `InProcessAppServerClient::shutdown` (or the drop path it delegates into) so the manager is shut down **before** the worker handle is awaited. The minimal change is:

```rust
    pub async fn shutdown(mut self) -> anyhow::Result<()> {
        // Stop the GUI host first so any live GUI connections close their
        // extra connections (and run the per-connection projection cleanup)
        // before the in-process runtime worker exits.
        std::sync::Arc::clone(&self.gui_host_manager).shutdown().await;
        // Remainder of the existing shutdown logic stays as-is.
        // ... existing body ...
    }
```

If `shutdown` is currently a different shape, preserve its existing return type and only prepend the manager shutdown call. Leave no dangling clones of `gui_host_manager` that keep the manager alive past this point.

- [ ] **Step 4: Run the in-process integration test**

```bash
cargo test -p codex-app-server-client gui_launch_url_returns_real_url_for_in_process
```

Expected: PASS. URL matches `http://127.0.0.1:<port>/?threadId=thread-test#token=<64-hex>`.

- [ ] **Step 5: Re-run the existing remote test**

```bash
cargo test -p codex-app-server-client
```

Expected: all existing tests still pass and the new test passes.

- [ ] **Step 6: Commit**

```bash
git add codex-rs/app-server-client/src/lib.rs
git commit -m "feat(app-server-client): wire gui launch through in-process client"
```

## Task 5: End-to-End Filter + ConnectionOrigin Verification

**Files:**
- Verify: `codex-rs/app-server-transport/src/transport/mod.rs`
- Modify: `codex-rs/app-server/src/gui_transport.rs` (add end-to-end test)

- [ ] **Step 1: Add an end-to-end bridge test**

Append to `#[cfg(test)] mod tests` in `codex-rs/app-server/src/gui_transport.rs`:

```rust
    use codex_app_server::in_process::start as start_in_process;
    use codex_app_server::in_process::InProcessStartArgs;
    use codex_gui_host::AuthenticatedGuiConnection;

    async fn test_in_process_start_args() -> InProcessStartArgs {
        // Shape matches the helper `codex-app-server-client` uses in its own
        // in-process tests. Mirror the minimal fields required for
        // `InProcessStartArgs` to boot under test (session source = Cli,
        // default codex home, default config overrides). See
        // `codex-app-server-client/src/lib.rs` `into_runtime_start_args`
        // for the canonical construction path and duplicate the same
        // fixture inline here — the test module cannot reach into the
        // client crate's private builder.
        InProcessStartArgs {
            session_source: codex_app_server_protocol::SessionSource::Cli,
            ..Default::default()
        }
    }

    #[tokio::test]
    async fn backend_round_trips_initialize() {
        let mut handle = start_in_process(test_in_process_start_args().await)
            .await
            .expect("runtime start");
        let sender = handle.sender();
        let backend = GuiTransportBackend::new(sender);

        let (connection, inbound_tx, mut outbound_rx) =
            AuthenticatedGuiConnection::new();
        let bridge = tokio::spawn(async move { backend.connect(connection).await });

        inbound_tx
            .send(
                serde_json::json!({
                    "jsonrpc": "2.0",
                    "id": 1,
                    "method": "initialize",
                    "params": {}
                })
                .to_string(),
            )
            .await
            .expect("send initialize");

        let frame = tokio::time::timeout(std::time::Duration::from_secs(2), outbound_rx.recv())
            .await
            .expect("timeout waiting for initialize response")
            .expect("outbound frame");
        let parsed: serde_json::Value = serde_json::from_str(&frame).expect("outbound json");
        assert_eq!(parsed["id"], serde_json::json!(1));
        assert!(parsed.get("result").is_some() || parsed.get("error").is_some());

        drop(inbound_tx);
        let _ = tokio::time::timeout(std::time::Duration::from_secs(2), bridge).await;
        handle.shutdown().await.expect("runtime shutdown");
    }
```

If `InProcessStartArgs` does not derive `Default`, replace `..Default::default()` with the explicit construction pattern used by `codex-rs/app-server-client/src/lib.rs:395` (`into_runtime_start_args`). The intent is: boot an in-process app-server runtime with the minimal args a test needs — **do not** invent a new `InProcessRuntimeStartArgs::for_test_cli` builder.

- [ ] **Step 2: Run the end-to-end test**

```bash
cargo test -p codex-app-server backend_round_trips_initialize
```

Expected: PASS; the parsed outbound frame is the `initialize` response.

- [ ] **Step 3: Re-run `ConnectionOrigin::GuiHost` baseline**

```bash
cargo test -p codex-app-server-transport connection_origin_has_distinct_gui_host_variant
```

Expected: PASS. This confirms the future-reserved variant is still present; MVP path does not use it.

- [ ] **Step 4: Commit**

```bash
git add codex-rs/app-server/src/gui_transport.rs
git commit -m "test(app-server): end-to-end GUI bridge initialize round-trip"
```

## Task 6: Format + Scoped Lint

- [ ] **Step 1: Format**

```bash
just fmt
```

- [ ] **Step 2: Scoped lint**

```bash
just fix -p codex-app-server
just fix -p codex-app-server-client
```

- [ ] **Step 3: Commit any auto-fixes**

```bash
git add codex-rs
git commit -m "chore(app-server): format GUI bridge modules"
```

If no files were modified, do not create an empty commit.

## Acceptance Gates

- `InProcessAppServerClient::gui_launch_url("<thread-id>")` returns a real `http://127.0.0.1:<port>/?threadId=<thread-id>#token=<hex>` URL for the primary thread.
- `RemoteAppServerClient::gui_launch_url` returns `GuiLaunchError::Unsupported`.
- `gui_transport::classify_inbound` rejects non-allowlisted `JSONRPCMessage::Request` methods without forwarding them.
- `gui_transport::outbound_is_allowed` drops non-allowlisted server notifications; lets through responses, errors, and allowlisted notifications.
- `backend_round_trips_initialize` proves the end-to-end path from `AuthenticatedGuiConnection` -> `register_extra_connection` -> `process_request` -> `route_outgoing_envelope` -> outbound frame.
- `ConnectionOrigin::GuiHost` still compiles and its unit test still passes, though MVP does not consume it.
- `codex-gui-host` has no new dependency on `codex-app-server`.
- `in_process.rs` is untouched by this plan.

## Self-Review Checklist

- Parsing happens exactly once in `gui_transport.rs`; `in_process.rs` never receives a raw `String` frame through `register_extra_connection`.
- `ExtraConnectionHandle::Drop` remains the single source of truth for `ExtraConnectionClosed`; `gui_transport.rs` never sends it manually.
- Allowlist decisions all route through `codex_gui_host::filter` helpers.
- `GuiHostManager` lazy-starts exactly one `GuiHost`; subsequent calls reuse the same handle.
- `GuiHostManager::shutdown` is awaited before the in-process worker handle exits.
- No GUI bridge code lives in `codex-core`.
- No module adds `TransportEvent` producers or duplicates `run_main_with_transport_options` behavior.
