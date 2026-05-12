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
- For every `register_extra_connection` call, exactly one corresponding `ExtraConnectionHandle::Drop` must run along every normal termination path (successful close, inbound parse error, backend error, `disconnect_token` cancel). Authentication failure never calls `register_extra_connection`, so no handle exists on that path — see `AuthenticatedGuiConnection` construction and the `/ws` auth reject flow in `codex-rs/gui-host/src/ws.rs`.
- Keep allowlist enforcement in `codex-gui-host` filters (request method, notification method, response/error drop). `gui_transport.rs` only bridges — no policy decisions beyond applying the existing filter helpers.

## File Structure

- Modify: `codex-rs/app-server/Cargo.toml` — add `codex-gui-host = { workspace = true }`. No `async-trait` dependency is required; the `AppServerClientGuiExt` trait uses RPITIT.
- Modify: `codex-rs/app-server/BUILD.bazel` — add `//gui-host:codex-gui-host` to deps if the file lists them explicitly.
- Modify: `codex-rs/app-server/src/lib.rs` — declare `mod gui_host;` and `mod gui_transport;`.
- Create: `codex-rs/app-server/src/gui_host.rs` — `GuiHostManager` + lazy-start + `launch_url_for_thread` + `shutdown` + sync-safe `cancel_nonblocking` (fires a shared `CancellationToken` that `GuiHost` observes; see plan 01 surface add below).
- Create: `codex-rs/app-server/src/gui_transport.rs` — `GuiTransportBackend` implementing `codex_gui_host::GuiBackend`; owns a per-manager shared `CancellationToken` that, combined with each connection's own `disconnect_token`, lets `connect(...)` exit on fleet-wide cancel.
- Modify: `codex-rs/gui-host/src/host.rs` — the current handle stores a `oneshot::Sender<()>` (see `codex-rs/gui-host/src/host.rs:25`), which is not `Clone`. Add a new cloneable, sync-firable cancel surface **without replacing** the existing oneshot shutdown path:
  - Add a field `cancel_token: tokio_util::sync::CancellationToken` to `GuiHostHandle` (cloned from an Arc-internal token produced by `GuiHost::start`).
  - Expose `pub fn cancel_token(&self) -> tokio_util::sync::CancellationToken` (returns a clone).
  - Inside the server task spawned by `GuiHost::start`, `tokio::select!` on `cancel_token.cancelled()` in addition to `shutdown_rx`. Cancelling the token triggers the same graceful server shutdown as dropping the oneshot sender, so the manager can fire `cancel_token.cancel()` synchronously from any context.
- Modify: `codex-rs/gui-host/src/lib.rs` — re-export is unnecessary; `cancel_token()` is reached via the public `GuiHostHandle`.
- Modify: `codex-rs/app-server-client/src/lib.rs` — `InProcessAppServerClient` carries `Arc<GuiHostManager>` (non-optional; the manager itself handles lazy start internally); implements `AppServerClientGuiExt` via the manager.
- Tests: `codex-rs/app-server/src/gui_transport.rs` (inline `#[cfg(test)] mod tests`).
- Tests: `codex-rs/app-server/src/gui_host.rs` (inline `#[cfg(test)] mod tests`).
- Tests: `codex-rs/app-server-client/src/lib.rs` (`gui_launch_url_returns_real_url_for_in_process` integration test).
- Verify: `codex-rs/app-server-transport/src/transport/mod.rs` — `ConnectionOrigin::GuiHost` still present, existing unit test still green.

## Task 0: Verify Plan 06 Prerequisites

- [x] **Step 1: Confirm plan 06 has landed**

Run:

```bash
cargo test -p codex-app-server -- extra_connection_request_reaches_message_processor
cargo test -p codex-app-server -- dropping_extra_handle_triggers_connection_closed
cargo test -p codex-app-server-client -- gui_launch_error_variants_are_distinct
```

Expected: all tests pass. If any test fails, stop — finish plan 06 before continuing.

- [x] **Step 2: Confirm `ConnectionOrigin::GuiHost` baseline**

```bash
cargo test -p codex-app-server-transport connection_origin_has_distinct_gui_host_variant
```

Expected: PASS. This variant was landed earlier; this step is only a pre-flight check.

## Task 0b: Expose sync-firable cancel on `GuiHostHandle`

Task 2 Step 2 calls `handle.cancel_token()` and relies on a cloneable, sync-firable cancel surface so `GuiHostManager::cancel_nonblocking` can wake the server from `Drop` (where no async context is available). The current handle at `codex-rs/gui-host/src/host.rs:22-67` only carries a non-`Clone` `oneshot::Sender<()>` gated by `axum::serve(...).with_graceful_shutdown(shutdown_rx.await)`, so there is no way to fire teardown synchronously today. Add the token **alongside** the existing oneshot path — do not replace it — so `GuiHostHandle::shutdown(self)` stays source-compatible for current callers.

**Files:**
- Modify: `codex-rs/gui-host/Cargo.toml`
- Modify: `codex-rs/gui-host/src/host.rs`

- [x] **Step 1: Add `tokio-util` to `codex-gui-host`**

The `CancellationToken` type lives in `tokio_util::sync`. Workspace pin already exists (`codex-rs/Cargo.toml:390`: `tokio-util = "0.7.18"`). In `codex-rs/gui-host/Cargo.toml` under `[dependencies]`, add:

```toml
tokio-util = { workspace = true }
```

- [x] **Step 2: Add the field + accessor, wire server `select!`**

In `codex-rs/gui-host/src/host.rs`:

```rust
use tokio_util::sync::CancellationToken;
```

Extend `GuiHostHandle`:

```rust
pub struct GuiHostHandle {
    local_addr: SocketAddr,
    launch_token: LaunchToken,
    shutdown_tx: oneshot::Sender<()>,
    cancel_token: CancellationToken,
    server_task: tokio::task::JoinHandle<io::Result<()>>,
}
```

In `GuiHost::start`, before spawning the server task:

```rust
        let (shutdown_tx, shutdown_rx) = oneshot::channel();
        let cancel_token = CancellationToken::new();
        let server_cancel = cancel_token.clone();
        let server_task = tokio::spawn(async move {
            axum::serve(listener, app)
                .with_graceful_shutdown(async move {
                    tokio::select! {
                        _ = shutdown_rx => {}
                        _ = server_cancel.cancelled() => {}
                    }
                })
                .await
        });
```

Populate the new field in the returned handle:

```rust
        Ok(GuiHostHandle {
            local_addr,
            launch_token,
            shutdown_tx,
            cancel_token,
            server_task,
        })
```

Expose the accessor on `impl GuiHostHandle`:

```rust
    /// Returns a clone of the server's cancel token. Firing it triggers the
    /// same graceful shutdown path as `shutdown(self)` but is sync-firable
    /// from any context (e.g. `Drop`). Idempotent.
    pub fn cancel_token(&self) -> CancellationToken {
        self.cancel_token.clone()
    }
```

Leave `shutdown(self)` as-is — it still fires `shutdown_tx` first, then awaits `server_task`; the server's `select!` exits on whichever signal arrives first.

- [x] **Step 3: Verify the crate compiles and existing tests still pass**

```bash
cargo test -p codex-gui-host
```

Expected: every existing test still passes. No new test is required here; `GuiHostManager::cancel_nonblocking` behavior is covered end-to-end by Task 3 Step 4 (`backend_round_trips_initialize` via manager teardown) and Task 4 Step 3b (`shutdown_drops_gui_host_manager_before_worker`).

- [x] **Step 4: Commit**

```bash
git add codex-rs/gui-host/Cargo.toml codex-rs/gui-host/src/host.rs
git commit -m "feat(gui-host): add cancel_token to GuiHostHandle"
```

## Task 1: Add `codex-gui-host` Dependency to `codex-app-server`

**Files:**
- Modify: `codex-rs/app-server/Cargo.toml`
- Modify: `codex-rs/app-server/BUILD.bazel` (if the file declares dependencies explicitly)

- [x] **Step 1: Add the workspace dependency**

In `codex-rs/app-server/Cargo.toml`, under `[dependencies]`, add (keep alphabetical with existing entries):

```toml
codex-gui-host = { workspace = true }
```

No `async-trait` dependency is added. The `AppServerClientGuiExt` trait defined in plan 06 uses RPITIT (`impl Future<...> + Send`), not `#[async_trait]`.

- [x] **Step 2: Update Bazel deps if needed**

Inspect `codex-rs/app-server/BUILD.bazel`. If it lists direct dependencies (e.g. in a `rust_library` `deps = [...]` block), add `"//gui-host:codex-gui-host"` in the same style.

- [x] **Step 3: Verify the crate still builds**

```bash
cargo build -p codex-app-server
```

Expected: compiles cleanly.

- [x] **Step 4: Regenerate Bazel lockfile**

From `codex-rs`:

```bash
just bazel-lock-update
just bazel-lock-check
```

Expected: lockfile is up-to-date.

- [x] **Step 5: Commit**

```bash
git add codex-rs/app-server/Cargo.toml codex-rs/app-server/BUILD.bazel codex-rs/Cargo.lock codex-rs/MODULE.bazel.lock
git commit -m "build(app-server): depend on codex-gui-host"
```

Drop any untouched files from `git add`.

## Task 2: `GuiHostManager` Lazy-Start

**Files:**
- Create: `codex-rs/app-server/src/gui_host.rs`
- Modify: `codex-rs/app-server/src/lib.rs` (declare the new module)

- [x] **Step 1: Create placeholder module**

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

- [x] **Step 2: Implement `GuiHostManager`**

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
use std::sync::Mutex as StdMutex;
use std::sync::atomic::AtomicBool;
use std::sync::atomic::Ordering;
use tokio::sync::Mutex as AsyncMutex;
use tokio_util::sync::CancellationToken;

use crate::gui_transport::GuiTransportBackend;
use crate::in_process::InProcessClientSender;

pub struct GuiHostManager {
    // Async-acquired during `launch_url_for_thread` (lazy start; awaits GuiHost bind).
    inner: AsyncMutex<Option<GuiHostHandle>>,
    // The GUI host's own cancel token. Stashed synchronously on lazy start so
    // `cancel_nonblocking` can fire it from any context (Drop, panic path).
    // A `OnceLock` keeps this write-once without requiring an async lock.
    host_cancel: std::sync::OnceLock<tokio_util::sync::CancellationToken>,
    stopped: AtomicBool,
    // Fleet cancel token: wakes every live `GuiTransportBackend::connect` task
    // and every bridge pump. Independent of `host_cancel` because bridge tasks
    // must exit before `GuiHost::shutdown` is awaited.
    cancel_token: CancellationToken,
    sender: InProcessClientSender,
}

impl GuiHostManager {
    pub fn new(sender: InProcessClientSender) -> Self {
        Self {
            inner: AsyncMutex::new(None),
            host_cancel: std::sync::OnceLock::new(),
            stopped: AtomicBool::new(false),
            cancel_token: CancellationToken::new(),
            sender,
        }
    }

    /// Synchronous, non-awaiting teardown trigger. Safe from `Drop`.
    /// Idempotent.
    pub fn cancel_nonblocking(&self) {
        // Flip the stopped flag so `launch_url_for_thread` short-circuits
        // afterwards, even on a racing call.
        if self.stopped.swap(true, Ordering::AcqRel) {
            return;
        }
        // Wake every bridge task that parks on the shared fleet cancel.
        self.cancel_token.cancel();
        // Poke the GUI host's own cancel surface (added by the plan 01
        // expansion above). `cancel()` on a CancellationToken is sync and
        // idempotent; the host's server loop observes the cancel in its
        // select and runs its normal graceful shutdown.
        if let Some(token) = self.host_cancel.get() {
            token.cancel();
        }
    }

    pub async fn launch_url_for_thread(
        self: &Arc<Self>,
        primary_thread_id: &str,
    ) -> anyhow::Result<String> {
        if self.stopped.load(Ordering::Acquire) {
            anyhow::bail!("gui host manager is stopped");
        }
        let mut guard = self.inner.lock().await;
        // Re-check after acquiring the lock: a racing cancel_nonblocking
        // may have flipped `stopped` while we were awaiting.
        if self.stopped.load(Ordering::Acquire) {
            anyhow::bail!("gui host manager is stopped");
        }
        if guard.is_none() {
            let mode = GuiHostMode::default_for_profile()
                .context("resolve GUI host mode")?;
            let backend = GuiTransportBackend::new(
                self.sender.clone(),
                self.cancel_token.child_token(),
            );
            let handle = GuiHost::start(GuiHostConfig { mode }, backend)
                .await
                .context("start GuiHost")?;
            // Race window: while `GuiHost::start(..).await` was parked we may
            // have just been cancelled. `cancel_nonblocking` flipped `stopped`
            // and fired `fleet_cancel`, but `host_cancel` was still unset
            // (we only publish it below), so the fresh `handle` is NOT yet
            // wired to the shutdown signal. If we stored this handle and
            // returned a URL now, a browser could authenticate against a
            // manager that the embedder already told us to tear down,
            // violating spec §500 (shutdown must stop accepting new browser
            // connections before the worker exits).
            //
            // Cancel the new handle synchronously and bail — do NOT await
            // `handle.shutdown()` while holding the async mutex (that would
            // serialize every subsequent `launch_url_for_thread` behind a
            // teardown that may itself need to reach the worker). The host's
            // server task observes the token and runs its own graceful
            // shutdown in the background; the join handle drops here.
            if self.stopped.load(Ordering::Acquire) {
                handle.cancel_token().cancel();
                drop(handle);
                anyhow::bail!("gui host manager is stopped");
            }
            // Stash the host's cancel token so cancel_nonblocking can reach
            // it without holding the async mutex. set() is a no-op on the
            // second call; the token itself is idempotent on cancel().
            let _ = self.host_cancel.set(handle.cancel_token());
            *guard = Some(handle);
        }
        let handle = guard.as_ref().expect("GuiHostHandle just ensured");
        Ok(handle.launch_url_for_thread(primary_thread_id))
    }

    pub async fn shutdown(self: Arc<Self>) {
        // Flip the stopped flag and cancel every in-flight bridge pump
        // before we start awaiting the GuiHost itself. Without this, a
        // still-live `GuiTransportBackend::connect` task could hold the
        // `GuiHost` internals busy and make the `handle.shutdown().await`
        // below race with the browser's final frames.
        self.cancel_nonblocking();
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
    use super::*;

    #[test]
    fn gui_launch_url_is_plain_http_loopback() {
        let fake = "http://127.0.0.1:4321/?threadId=t#token=x";
        assert!(fake.starts_with("http://127.0.0.1:"));
        assert!(fake.contains("#token="));
    }

    #[tokio::test]
    async fn launch_url_for_thread_reuses_single_host_and_token() {
        // Spec §生命周期 §496-499: same TUI session reuses one GUI host and
        // one launch token. Two successive launch_url_for_thread calls must
        // therefore return URLs with the same host:port and the same token
        // (threadId is free to differ).
        let manager = GuiHostManager::new_for_test().await;
        let url_a = manager.launch_url_for_thread("thread-a").await.expect("url a");
        let url_b = manager.launch_url_for_thread("thread-b").await.expect("url b");
        // Strip threadId query, compare host:port and token fragment.
        let (authority_a, token_a) = split_host_port_and_token(&url_a);
        let (authority_b, token_b) = split_host_port_and_token(&url_b);
        assert_eq!(authority_a, authority_b, "same session must reuse host:port");
        assert_eq!(token_a, token_b, "same session must reuse launch token");
        assert!(url_a.contains("threadId=thread-a"));
        assert!(url_b.contains("threadId=thread-b"));
    }

    /// Test-only constructor: stands up an in-process app-server runtime via
    /// the same helper used by `codex-rs/app-server/src/in_process.rs` tests
    /// (`start_test_client(SessionSource::Cli).await`, whose sender feeds
    /// `GuiHostManager::new`). Wrap it inside this module in a small helper so
    /// the test above is not coupled to the runtime bootstrap. Lives under
    /// `#[cfg(test)]` — do NOT expose in release builds.
    #[cfg(test)]
    impl GuiHostManager {
        pub(crate) async fn new_for_test() -> Arc<Self> { unimplemented!("wire via start_test_client") }
    }

    /// Returns `(authority, token)` where `authority = "127.0.0.1:<port>"` and
    /// `token` is the raw `#token=<value>` fragment value (URL-safe base64
    /// per `codex-rs/gui-host/src/token.rs::LaunchToken::generate`, no padding).
    #[cfg(test)]
    fn split_host_port_and_token(url: &str) -> (&str, &str) { unimplemented!("parse url") }
}
```

This keeps `codex-app-server` free of `codex-app-server-client` imports. `GuiTransportBackend` is declared by Task 3. Until that task runs, `cargo build` here will fail on that import; the test-first sequence in this task intentionally runs Task 3's stub next.

- [x] **Step 3: Do not compile yet**

Do not run `cargo test` until Task 3 Step 2 lands the `GuiTransportBackend` stub. Proceed directly to Task 3.

## Task 3: `GuiTransportBackend` Implementation

**Files:**
- Create: `codex-rs/app-server/src/gui_transport.rs`

- [x] **Step 1: Write failing allowlist test**

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

- [x] **Step 2: Implement `GuiTransportBackend`**

Replace the file contents of `codex-rs/app-server/src/gui_transport.rs` with:

```rust
//! `GuiBackend` implementation for the in-process app-server runtime.
//!
//! Each authenticated GUI connection is registered as an extra connection on
//! the in-process runtime. Inbound JSON is parsed into typed JSON-RPC messages
//! and filtered against `codex_gui_host::filter` allowlists; outbound text is
//! forwarded verbatim after an allowlist check.

use crate::in_process::ExtraConnectionCommandSender;
use crate::in_process::ExtraConnectionHandle;
use crate::in_process::InProcessClientSender;
use codex_app_server_protocol::JSONRPCMessage;
use codex_app_server_protocol::JSONRPCNotification;
use codex_app_server_protocol::JSONRPCRequest;
use codex_gui_host::AuthenticatedGuiConnection;
use codex_gui_host::GuiBackend;
use codex_gui_host::is_allowed_client_notification_method;
use codex_gui_host::is_allowed_client_request_method;
use codex_gui_host::is_allowed_server_notification_method;
use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;

#[derive(Clone)]
pub struct GuiTransportBackend {
    sender: InProcessClientSender,
    // Cancel token shared with `GuiHostManager::cancel_nonblocking` so every
    // bridge task wakes immediately on a sync-path shutdown (e.g. panic
    // unwind during Drop). Still per-connection cancel is handled by the
    // `disconnect_token` wired through `ExtraConnectionHandle`; this token is
    // additive.
    manager_cancel: tokio_util::sync::CancellationToken,
}

impl GuiTransportBackend {
    pub fn new(
        sender: InProcessClientSender,
        manager_cancel: tokio_util::sync::CancellationToken,
    ) -> Self {
        Self { sender, manager_cancel }
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
    // Mirrors the host-side envelope check at
    // `codex-rs/gui-host/src/ws.rs:268` (`is_allowed_backend_text`):
    //   - `jsonrpc == "2.0"` is required
    //   - exactly one of `result` / `error` is allowed (not both)
    //   - a response/error envelope MUST carry `id` and MUST NOT carry `method`
    //   - a notification envelope MUST carry `method`, MUST NOT carry `id`,
    //     and the method must be on the server-notification allowlist
    let Ok(value): Result<serde_json::Value, _> = serde_json::from_str(text) else {
        return false;
    };
    let Some(object) = value.as_object() else {
        return false;
    };
    if object.get("jsonrpc").and_then(|v| v.as_str()) != Some("2.0") {
        return false;
    }
    let has_result = object.contains_key("result");
    let has_error = object.contains_key("error");
    if has_result && has_error {
        return false;
    }
    if has_result || has_error {
        return object.contains_key("id") && !object.contains_key("method");
    }
    let Some(method) = object.get("method").and_then(|v| v.as_str()) else {
        return false;
    };
    !object.contains_key("id") && is_allowed_server_notification_method(method)
}

impl GuiBackend for GuiTransportBackend {
    fn connect(
        &self,
        connection: AuthenticatedGuiConnection,
    ) -> impl std::future::Future<Output = anyhow::Result<()>> + Send {
        let sender = self.sender.clone();
        // Subscribe to the fleet cancel. When `GuiHostManager::cancel_nonblocking`
        // fires (Drop path, panic unwind, explicit shutdown), every live
        // bridge task must wake and exit — even the ones parked on
        // `inbound_rx.recv()` / `outgoing_rx.recv()`.
        let manager_cancel = self.manager_cancel.clone();
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
            let mut handle = sender
                .register_extra_connection()
                .await
                .map_err(|err| anyhow::anyhow!(
                    "register_extra_connection: in-process runtime closed: {err}"
                ))?;
            let command_sender = handle.command_sender.clone();
            let disconnect_token = handle.disconnect_token.clone();
            let outgoing_tx_for_parse = handle.outgoing_tx.clone();
            // `outgoing_rx` is a bare `Receiver`, so moving it out is fine as
            // long as we replace it with a dummy receiver to satisfy `Drop`.
            let (_noop_tx, noop_rx) = mpsc::channel::<String>(1);
            let outgoing_rx =
                std::mem::replace(&mut handle.outgoing_rx, noop_rx);

            // Link manager-level cancellation to this connection's
            // `disconnect_token`. When the manager is torn down, we cancel the
            // per-connection token exactly once; both pump tasks are already
            // selecting on it, so they exit promptly.
            let bridge_cancel_task = {
                let disconnect_token = disconnect_token.clone();
                let manager_cancel = manager_cancel.clone();
                tokio::spawn(async move {
                    manager_cancel.cancelled().await;
                    disconnect_token.cancel();
                })
            };

            let mut outbound_task = {
                let outbound_tx = outbound_tx.clone();
                let disconnect_token = disconnect_token.clone();
                tokio::spawn(pump_outbound(outgoing_rx, outbound_tx, disconnect_token))
            };

            let mut inbound_task = {
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

            // When the first pump terminates (browser disconnect, parse-error
            // write failure, backend disconnect token, manager cancel), cancel
            // the token and then await the other pump to quiesce before
            // dropping the handle. This prevents the losing inbound task from
            // continuing to hold `command_sender` and pushing more
            // ExtraRequest/ExtraNotification after ExtraConnectionClosed has
            // been queued.
            let (inbound_result, outbound_result) = match tokio::select! {
                inbound = &mut inbound_task => Winner::Inbound(inbound),
                outbound = &mut outbound_task => Winner::Outbound(outbound),
            } {
                Winner::Inbound(inbound) => {
                    disconnect_token.cancel();
                    // Give the outbound pump a bounded window to drain, then
                    // abort if it hasn't exited. Spec says "drain 1s is
                    // best-effort, abort path is allowed."
                    let outbound = match tokio::time::timeout(
                        OUTBOUND_DRAIN_BUDGET,
                        &mut outbound_task,
                    )
                    .await
                    {
                        Ok(joined) => joined,
                        Err(_) => {
                            outbound_task.abort();
                            // Surface the abort join result but ignore the
                            // cancelled variant.
                            (&mut outbound_task).await
                        }
                    };
                    (inbound, outbound)
                }
                Winner::Outbound(outbound) => {
                    disconnect_token.cancel();
                    let inbound = (&mut inbound_task).await;
                    (inbound, outbound)
                }
            };

            // Stop the watcher so we don't leak a spawned task past the
            // connection's lifetime. It may already be done (if manager_cancel
            // fired above), but abort is idempotent on a completed task.
            bridge_cancel_task.abort();
            let _ = bridge_cancel_task.await;

            // Both pumps are now quiesced. Drop the handle exactly once so
            // ExtraConnectionClosed fires after all outbound traffic ceased.
            drop(handle);

            // Choose the error to surface: inbound errors are more
            // actionable (parse errors, send failures); outbound join errors
            // are logged but not returned.
            inbound_result.unwrap_or_else(|err| {
                Err(anyhow::anyhow!("inbound pump join error: {err}"))
            })?;
            if let Err(err) = outbound_result {
                tracing::warn!("outbound pump join error: {err}");
            }
            Ok(())
        }
    }
}

enum Winner<A, B> {
    Inbound(A),
    Outbound(B),
}

const OUTBOUND_DRAIN_BUDGET: std::time::Duration = std::time::Duration::from_secs(1);

async fn pump_inbound(
    inbound_rx: &mut mpsc::Receiver<String>,
    command_sender: &ExtraConnectionCommandSender,
    parse_error_tx: &mpsc::Sender<String>,
    disconnect_token: CancellationToken,
) -> anyhow::Result<()> {
    loop {
        tokio::select! {
            _ = disconnect_token.cancelled() => break,
            message = inbound_rx.recv() => {
                let Some(text) = message else { break };
                let parsed = match serde_json::from_str::<JSONRPCMessage>(&text) {
                    Ok(parsed) => parsed,
                    Err(err) => {
                        // Wrap the send in select! so a concurrent
                        // `disconnect_token.cancelled()` unblocks us even if
                        // `parse_error_tx` is at capacity (downstream pump
                        // stalled on a slow WebSocket client). Spec §269
                        // requires both bridge tasks to respect cancellation.
                        let payload = build_jsonrpc_parse_error(&err);
                        tokio::select! {
                            _ = disconnect_token.cancelled() => break,
                            send_res = parse_error_tx.send(payload) => {
                                if send_res.is_err() {
                                    break;
                                }
                                continue;
                            }
                        }
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
    disconnect_token: CancellationToken,
) {
    loop {
        tokio::select! {
            _ = disconnect_token.cancelled() => break,
            text = outgoing_rx.recv() => {
                let Some(text) = text else { break };
                if !outbound_is_allowed(&text) {
                    continue;
                }
                // See pump_inbound for rationale: a stalled WebSocket writer
                // can fill `outbound_tx` and park send() forever. Re-enter
                // select! so `disconnect_token.cancelled()` can still preempt.
                tokio::select! {
                    _ = disconnect_token.cancelled() => break,
                    send_res = outbound_tx.send(text) => {
                        if send_res.is_err() {
                            break;
                        }
                    }
                }
            }
        }
    }
}
```

- [x] **Step 3: Run the filter tests**

```bash
cargo test -p codex-app-server --lib gui_transport
```

Expected: all six filter tests pass.

- [x] **Step 4: Run the lazy-start test too**

```bash
cargo test -p codex-app-server gui_launch_url_is_plain_http_loopback
```

Expected: PASS.

- [x] **Step 5: Commit both modules**

```bash
git add codex-rs/app-server/src/gui_host.rs codex-rs/app-server/src/gui_transport.rs codex-rs/app-server/src/lib.rs
git commit -m "feat(app-server): add GUI host manager and transport bridge"
```

## Task 4: Wire `AppServerClientGuiExt` for In-Process Client

**Files:**
- Modify: `codex-rs/app-server-client/src/lib.rs`

- [x] **Step 1: Write failing integration test**

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

- [x] **Step 2: Add `GuiHostManager` handle to `InProcessAppServerClient` (with `Option<T>` reshape)**

`InProcessAppServerClient::shutdown` currently takes `self` and destructures the three owned fields (`command_tx`, `event_rx`, `worker_handle`) by move (see `codex-rs/app-server-client/src/lib.rs:757`). Adding `impl Drop for InProcessAppServerClient` is incompatible with that destructure: once the type implements `Drop`, Rust forbids destructuring it with a by-move pattern. Reshape every owned field as `Option<T>` and split the teardown into `pub async fn shutdown(mut self)` (owned, preserves the existing call shape) plus a private `shutdown_inner(&mut self)`, so `Drop::drop(&mut self)` can call the same helper via `Option::take()`.

Modify `InProcessAppServerClient` in `codex-rs/app-server-client/src/lib.rs`.

Today the struct already persists `command_tx: mpsc::Sender<ClientCommand>`, `event_rx: mpsc::Receiver<InProcessServerEvent>`, and `worker_handle: tokio::task::JoinHandle<()>` (see `codex-rs/app-server-client/src/lib.rs:757`). It does NOT persist the `InProcessClientSender` — `start` consumes that once (`let request_sender = handle.sender();` at `:489`) and moves it into the worker task. `InProcessClientSender::client_tx` is a private field inside `codex-app-server` (see `codex-rs/app-server/src/in_process.rs:192-194`), so the client crate cannot re-construct it literally — it must keep the concrete value returned by `handle.sender()` around.

Reshape to:

```rust
pub struct InProcessAppServerClient {
    // All owned fields become Option<T> so `impl Drop` can coexist with
    // `shutdown(&mut self)`. `take()` drives teardown first-wins; whichever
    // path (explicit `shutdown` or `Drop`) runs first steals the inner values,
    // the other observes `None` and skips its work.
    command_tx: Option<mpsc::Sender<ClientCommand>>,
    event_rx: Option<mpsc::Receiver<InProcessServerEvent>>,
    worker_handle: Option<tokio::task::JoinHandle<()>>,
    // Kept alive alongside the worker so `GuiHostManager` can clone it into
    // its own state without round-tripping through the worker. This is the
    // same value returned by `handle.sender()`; we persist it here instead of
    // only inside the worker closure so both sides can reach
    // `register_extra_connection` via the existing sender surface.
    request_sender: Option<codex_app_server::in_process::InProcessClientSender>,
    gui_host_manager: Option<std::sync::Arc<codex_app_server::gui_host::GuiHostManager>>,
}
```

In `start`, the existing `let request_sender = handle.sender();` stays; add a second `request_sender_for_manager = request_sender.clone()` **before** the move into the worker, so both the worker closure and the manager see live senders:

```rust
        let request_sender = handle.sender();
        let request_sender_for_manager = request_sender.clone();
        let request_sender_for_self = request_sender.clone();
        // ... existing worker spawn moves `request_sender` in unchanged ...
        let gui_host_manager = std::sync::Arc::new(
            codex_app_server::gui_host::GuiHostManager::new(request_sender_for_manager),
        );
```

Populate the new shape when returning `Self` from `start`:

```rust
        Ok(Self {
            command_tx: Some(command_tx),
            event_rx: Some(event_rx),
            worker_handle: Some(worker_handle),
            request_sender: Some(request_sender_for_self),
            gui_host_manager: Some(gui_host_manager),
        })
```

Do **not** introduce a new public `sender()` accessor. There is no existing `pub fn sender(&self)` on `InProcessAppServerClient` today (grep: no such item — `handle.sender()` in `start` is `handle: InProcessClientHandle`, not `self`). Adding one would widen the crate's public surface beyond what this plan needs; `request_sender` is used only internally by `AppServerClientGuiExt`.

`next_event()` becomes:

```rust
    pub async fn next_event(&mut self) -> Option<InProcessServerEvent> {
        self.event_rx.as_mut()?.recv().await
    }
```

Any other inherent method that read `self.command_tx` / `self.event_rx` / `self.worker_handle` directly must be rewritten to either `.as_ref()` / `.as_mut()` plus `.expect(..)` (invariant: fields are `Some` until `shutdown` or `Drop` runs). Do not introduce new public methods; keep the external surface identical.

Implement the trait at the bottom of the file:

```rust
impl crate::gui::AppServerClientGuiExt for InProcessAppServerClient {
    fn gui_launch_url(
        &self,
        primary_thread_id: &str,
    ) -> impl std::future::Future<
        Output = Result<crate::gui::GuiLaunchUrl, crate::gui::GuiLaunchError>,
    > + Send + '_ {
        let manager = std::sync::Arc::clone(
            self.gui_host_manager
                .as_ref()
                .expect("gui_host_manager available until shutdown"),
        );
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

- [x] **Step 3: Shutdown ordering**

Preserve the existing `pub async fn shutdown(self)` owned-receiver shape so the current call sites — including Step 1's `client.shutdown().await` and every other caller — keep working without a `mut` binding retrofit. The common work moves into a private `shutdown_inner(&mut self)` that both `shutdown(mut self)` and `Drop::drop(&mut self)` can call. Key changes vs the existing `shutdown(self)` at `codex-rs/app-server-client/src/lib.rs:757`:

- Fields are now `Option<T>` (Step 2 reshape), so `shutdown_inner` works by `Option::take()` instead of by-move destructure. The existing by-move destructure (`let Self { command_tx, event_rx, worker_handle } = self;`) is gone because `impl Drop` below forbids by-move destructuring.
- `GuiHostManager::shutdown` runs **before** the worker `command_tx` / `event_rx` are dropped, so live GUI bridges can finish flushing `ExtraConnectionClosed` through the still-running processor task.
- `Arc::try_unwrap` is not guaranteed (other clones may exist mid-shutdown); call `shutdown` through the owned `Arc` clone and let `cancel_nonblocking` on Drop mop up leftovers.

```rust
    /// Shuts down worker and in-process runtime with bounded wait.
    ///
    /// Keeps the owned-receiver signature to preserve existing callers.
    pub async fn shutdown(mut self) -> IoResult<()> {
        self.shutdown_inner().await
    }

    async fn shutdown_inner(&mut self) -> IoResult<()> {
        // 1. Drain the GUI host first. Any live bridge tasks need a running
        //    in-process runtime to deliver their ExtraConnectionClosed frames,
        //    so this must complete before the worker command channel closes.
        if let Some(manager) = self.gui_host_manager.take() {
            manager.shutdown().await;
        }

        // 2. Existing worker shutdown sequence — adapted to take-from-Option.
        let Some(command_tx) = self.command_tx.take() else {
            return Ok(());
        };
        let event_rx = self.event_rx.take();
        let mut worker_handle = match self.worker_handle.take() {
            Some(h) => h,
            None => return Ok(()),
        };
        // Drop the caller-facing receiver before asking the worker to shut
        // down. That unblocks any pending must-deliver `event_tx.send(..)` so
        // the worker can reach `handle.shutdown()` instead of timing out.
        drop(event_rx);

        let (response_tx, response_rx) = oneshot::channel();
        if command_tx
            .send(ClientCommand::Shutdown { response_tx })
            .await
            .is_ok()
            && let Ok(command_result) = timeout(SHUTDOWN_TIMEOUT, response_rx).await
        {
            command_result.map_err(|_| {
                IoError::new(
                    ErrorKind::BrokenPipe,
                    "in-process app-server shutdown channel is closed",
                )
            })??;
        }

        if let Err(_elapsed) = timeout(SHUTDOWN_TIMEOUT, &mut worker_handle).await {
            worker_handle.abort();
            let _ = worker_handle.await;
        }
        // `request_sender` has no explicit shutdown — dropping the Option is
        // enough; the worker has already begun tearing down above.
        let _ = self.request_sender.take();
        Ok(())
    }
```

Additionally, add an `impl Drop` fallback so the spec invariant "先 drop `GuiHostManager`，再等 worker task 结束" holds on panic / early-drop paths where `shutdown().await` never ran. Do **not** block the async runtime here — only fire the synchronous cancel:

```rust
impl Drop for InProcessAppServerClient {
    fn drop(&mut self) {
        // Best-effort: if the user never awaited `shutdown`, at least stop
        // GuiHostManager from handing out new browser connections and wake
        // every live bridge task. Do NOT block on `GuiHost::shutdown` here:
        // there is no guaranteed tokio runtime and Drop must stay sync.
        if let Some(manager) = self.gui_host_manager.take() {
            manager.cancel_nonblocking();
            // Let the Arc drop normally. If other clones exist, the next
            // shutdown sequence will wait on them; the fleet cancel fired
            // above is idempotent.
        }
        // `command_tx` / `event_rx` / `worker_handle` are left in their
        // `Option`s — standard Drop handles dropping mpsc senders/receivers
        // and detaching the JoinHandle. We intentionally do NOT block on
        // the worker here; embedders that need deterministic teardown must
        // call `shutdown().await`.
    }
}
```

`GuiHostManager::cancel_nonblocking` is the sync method defined in Task 2 Step 2: (a) sets an internal `stopped` flag so `launch_url_for_thread` returns immediately afterward, (b) fires the fleet `cancel_token` so every live `GuiTransportBackend::connect` task wakes, and (c) pokes the host's `cancel_token` if the host was already lazy-started.

- [x] **Step 3b: Write failing test — manager shutdown orders before worker**

In `codex-rs/app-server-client/src/lib.rs` tests (or a new sibling test module), add:

```rust
#[tokio::test]
async fn shutdown_drops_gui_host_manager_before_worker() {
    use codex_app_server::gui_host::test_probe;
    let client = InProcessAppServerClient::start_for_test_with_gui().await;
    // `probe.snapshot()` returns (manager_entered_at_ns, worker_exited_at_ns).
    // Both are monotonic nanosecond stamps from the same Instant epoch.
    let probe = test_probe(&client);
    client.shutdown().await.expect("shutdown should complete");
    let (manager_stamp, worker_stamp) = probe.snapshot();
    assert!(manager_stamp > 0, "manager shutdown did not run");
    assert!(worker_stamp > 0, "worker shutdown did not run");
    // Strict inequality: spec requires the manager to have started (and
    // finished) its shutdown before the worker is awaited to completion,
    // not merely on-or-after. Use '<' instead of '<='.
    assert!(manager_stamp < worker_stamp, "manager must shut down strictly before worker exit (got manager={manager_stamp}, worker={worker_stamp})");
}
```

`shutdown` keeps its owned-receiver `pub async fn shutdown(mut self)` signature (see Step 3), so the binding can stay `let client` — the inner `shutdown_inner(&mut self)` method is what actually mutates the fields. Test helpers referenced above are placeholders for the production test fixtures that must land alongside this task:

- `InProcessAppServerClient::start_for_test_with_gui()` — boots the in-process client with the default in-process GUI host manager attached. If a `start_test_client`-style helper already exists in `codex-rs/app-server-client/src/lib.rs` tests (the rest of the file uses `start_test_client(SessionSource::Cli).await`), extend it; do not invent a parallel fixture.
- `codex_app_server::gui_host::test_probe(&client)` — returns a `GuiHostShutdownProbe` whose `snapshot()` yields `(manager_entered_at_ns, worker_exited_at_ns)` captured from `Instant::now().elapsed()` markers installed inside `GuiHostManager::shutdown` and the in-process worker's exit tail. The probe stores the two stamps in `AtomicU128`-equivalent `parking_lot::Mutex<Option<u128>>` (or two `AtomicU64`s splitting the nanosecond stamp), writable only from the production shutdown path so the test never races the producer. Implementation lives behind `#[cfg(any(test, feature = "test-support"))]` so it is absent from release builds.

Expected: on initial run, FAIL (manager shutdown is not yet wired before worker). After Step 3, PASS.

- [x] **Step 4: Run the in-process integration test**

```bash
cargo test -p codex-app-server-client gui_launch_url_returns_real_url_for_in_process
```

Expected: PASS. URL matches `http://127.0.0.1:<port>/?threadId=thread-test#token=<url-safe-base64-no-pad>` (43 chars for 32 random bytes; see `codex-rs/gui-host/src/token.rs::LaunchToken::generate`). Assert url-safe token presence and minimum entropy length, not hex.

- [x] **Step 5: Re-run the existing remote test**

```bash
cargo test -p codex-app-server-client
```

Expected: all existing tests still pass and the new test passes.

- [x] **Step 6: Commit**

```bash
git add codex-rs/app-server-client/src/lib.rs
git commit -m "feat(app-server-client): wire gui launch through in-process client"
```

## Task 5: End-to-End Filter + ConnectionOrigin Verification

**Files:**
- Verify: `codex-rs/app-server-transport/src/transport/mod.rs`
- Modify: `codex-rs/app-server/src/gui_transport.rs` (add end-to-end test)

- [x] **Step 1: Add an end-to-end bridge test**

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
        let backend = GuiTransportBackend::new(sender, tokio_util::sync::CancellationToken::new());

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

- [x] **Step 2: Run the end-to-end test**

```bash
cargo test -p codex-app-server backend_round_trips_initialize
```

Expected: PASS; the parsed outbound frame is the `initialize` response.

- [x] **Step 3: Re-run `ConnectionOrigin::GuiHost` baseline**

```bash
cargo test -p codex-app-server-transport connection_origin_has_distinct_gui_host_variant
```

Expected: PASS. This confirms the future-reserved variant is still present; MVP path does not use it.

- [x] **Step 3b: Host-level allowlist enforcement (defense-in-depth)**

Spec §JSON-RPC Allowlist (spec §400) and §验收标准 (spec §610) place the authoritative allowlist rejection at `codex-gui-host`'s inbound filter (`codex-rs/gui-host/src/ws.rs:232`). `gui_transport::classify_inbound` is only a defense-in-depth duplicate. Prove the host rejects non-allowlisted frames before they reach the backend, so an implementation regression in the backend filter cannot open a bypass.

Add to `codex-rs/gui-host/tests/`:

```rust
#[tokio::test]
async fn browser_non_allowlisted_request_never_reaches_backend() {
    // Boot a GuiHost with a recording GuiBackend that fails the test if it
    // sees a non-allowlisted frame (e.g. method = "fs/readFile").
    // Drive a real /ws handshake, send the disallowed request, assert the
    // browser receives a JSON-RPC error (or WebSocket close) AND the
    // recording backend observed zero forwarded messages for that frame.
    // ...
}
```

Keep `gui_transport::classify_inbound` and its unit tests as defense-in-depth — do not remove them.

- [x] **Step 4: Commit**

```bash
git add codex-rs/app-server/src/gui_transport.rs codex-rs/gui-host/tests
git commit -m "test(app-server): end-to-end GUI bridge initialize round-trip"
```

## Task 6: Format + Scoped Lint

- [x] **Step 1: Format**

```bash
just fmt
```

- [x] **Step 2: Scoped lint**

```bash
just fix -p codex-app-server
just fix -p codex-app-server-client
```

- [x] **Step 3: Commit any auto-fixes**

```bash
git add codex-rs
git commit -m "chore(app-server): format GUI bridge modules"
```

If no files were modified, do not create an empty commit.

## Acceptance Gates

- `InProcessAppServerClient::gui_launch_url("<thread-id>")` returns a real `http://127.0.0.1:<port>/?threadId=<thread-id>#token=<url-safe-base64-no-pad>` URL for the primary thread (token shape per `codex-rs/gui-host/src/token.rs::LaunchToken::generate`, 43 chars for 32 random bytes — do NOT assert hex).
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
