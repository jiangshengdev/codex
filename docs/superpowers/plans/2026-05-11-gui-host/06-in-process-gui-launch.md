# Codex GUI In-Process Launch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the TUI's in-process app-server runtime (`codex-rs/app-server/src/in_process.rs`) with a minimal, GUI-agnostic extra-connection registration API so that plan 02's `gui_transport.rs` can attach authenticated GUI WebSockets to the existing `MessageProcessor` and `outbound_connections`. Expose launch-URL access through a new `codex-app-server-client::gui` extension trait.

**Architecture:** The extension point is four new `ProcessorCommand::Extra*` variants plus an `ExtraConnectionHandle` returned by `InProcessClientSender::register_extra_connection`. The processor `match` loop calls the existing raw `MessageProcessor::process_request` (see `codex-rs/app-server/src/message_processor.rs:477-534`) for `ExtraRequest`, calls `message_processor.process_notification` for `ExtraNotification` (the raw path at `codex-rs/app-server/src/lib.rs:959`; the typed main-connection arm that wraps `process_client_notification` at `codex-rs/app-server/src/in_process.rs:475` stays untouched), and delegates `ExtraConnectionClosed` to the existing projection subscription cleanup path via `message_processor.connection_closed` + `outbound_connections` removal. The main TUI connection's external semantics stay byte-for-byte identical.

**Tech Stack:** Rust 2024, tokio, codex-app-server, codex-app-server-client, codex-app-server-protocol.

---

Source spec: `docs/superpowers/specs/2026-05-11-codex-gui-host-redesign.md` §Bridge 形态.
Roadmap: `docs/superpowers/plans/2026-05-11-gui-host/00-roadmap.md`.

## Hard Constraints

- Keep all symbols added to `in_process.rs` GUI-agnostic. No `gui`, `websocket`, `allowlist`, `auth`, or `browser` in the public surface of the registration API.
- Do not change the signature or external behavior of `InProcessClientHandle::request`, `InProcessClientHandle::notify`, `InProcessClientHandle::respond_to_server_request`, `InProcessClientHandle::fail_server_request`, `InProcessClientHandle::next_event`, `InProcessClientHandle::shutdown`, `InProcessClientHandle::sender`, or `InProcessClientSender::{request,notify,respond_to_server_request,fail_server_request}`.
- Do not change `ProcessorCommand::Request` / `Notification` arm bodies; only add new arms.
- Do not copy `run_main_with_transport_options` connection maps, outbound router, or close cleanup. Reuse the existing `HashMap<ConnectionId, OutboundConnectionState>` already owned by the runtime task and `route_outgoing_envelope`.
- Main connection `ConnectionId(0)` (`IN_PROCESS_CONNECTION_ID`) must never collide with extra connection IDs. Extra IDs are allocated from a local `AtomicU64` starting at `1`.
- `ExtraConnectionClosed` for a given `connection_id` is delivered **at most once** under normal operation (guaranteed by `ExtraConnectionHandle::Drop::try_send`). Under runtime abort / shutdown timeout it may be skipped, in which case the runtime-end cleanup tears down all remaining entries.
- After `ExtraConnectionClosed` is processed, the runtime must not dispatch any further `ExtraRequest` or `ExtraNotification` for that `connection_id`.

## File Structure

- Modify: `codex-rs/app-server/src/in_process.rs`
  - Add `ProcessorCommand::ExtraConnectionOpened`, `ExtraRequest`, `ExtraNotification`, `ExtraConnectionClosed`.
  - Add `ExtraConnectionHandle` with `Drop` best-effort `try_send(ExtraConnectionClosed)`.
  - Add `InProcessClientSender::register_extra_connection(&self) -> IoResult<ExtraConnectionHandle>` (async; fail-visible — returns `ErrorKind::BrokenPipe` if the runtime task is gone instead of handing back a half-registered handle).
  - Add `extra_connections: HashMap<ConnectionId, ExtraConnectionEntry>` in the processor task (each entry owns the connection's `ConnectionSessionState` plus clones of the outbound gating Arcs shared with the router).
  - Extend processor `match ProcessorCommand` loop with four new arms.
  - Generalize `thread_created_rx` dispatch list to include initialized extra connections.
  - Insert/remove `OutboundConnectionState` entries for extra connections in the outer runtime task (owner of `outbound_connections` via the outbound router spawn closure — see Task 3 for exact placement).
- Create: `codex-rs/app-server-client/src/gui.rs`
  - `AppServerClientGuiExt` trait, `GuiLaunchUrl`, `GuiLaunchError`.
- Modify: `codex-rs/app-server-client/src/lib.rs`
  - `pub mod gui;` + re-exports.
  - `RemoteAppServerClient` `AppServerClientGuiExt` impl returns `GuiLaunchError::Unsupported`.
  - Plan 06 does **not** add any field on `InProcessAppServerClient`, does **not** depend on `codex-app-server::gui_host`, and does **not** implement `AppServerClientGuiExt` for `InProcessAppServerClient`. Plan 02 owns that wiring (it depends on the types this plan introduces; see roadmap §Dependencies-and-Cross-References).
- Tests: `codex-rs/app-server/src/in_process.rs` (new `#[cfg(test)] mod extra_connection_tests`).
- Tests: `codex-rs/app-server-client/src/gui.rs` (unit test for `Unsupported` wiring through the facade).

## Task 0: Baseline Verification

**Files:**
- Verify: `codex-rs/app-server/src/in_process.rs`
- Verify: `codex-rs/app-server-client/src/lib.rs`

- [x] **Step 1: Confirm the obsolete multi-connection bridge is already reverted**

Run from repo root:

```bash
git log --oneline --grep "remove obsolete in-process bridge" -1
```

Expected: returns `c03057779 refactor(gui): remove obsolete in-process bridge` (or a later commit with that message). If empty, stop — this plan assumes `in_process.rs` is back to the single-connection baseline before extending it.

- [x] **Step 2: Confirm main runtime handshake is intact**

Run from `codex-rs`:

```bash
cargo test -p codex-app-server in_process_start_initializes_and_handles_typed_v2_request
```

Expected: test passes. This is the invariant that plan 06 must not break.

## Task 1: Introduce `ExtraConnectionHandle` Types and Commands

**Files:**
- Modify: `codex-rs/app-server/src/in_process.rs`

- [x] **Step 1: Write the failing test for command variants**

Add to `codex-rs/app-server/src/in_process.rs` inside `#[cfg(test)] mod tests`:

```rust
    #[test]
    fn processor_command_has_extra_variants() {
        fn requires_send<T: Send>() {}
        requires_send::<ProcessorCommand>();
        let _opened = ProcessorCommand::ExtraConnectionOpened {
            connection_id: ConnectionId(7),
            outbound_initialized: Arc::new(AtomicBool::new(false)),
            outbound_experimental_api_enabled: Arc::new(AtomicBool::new(false)),
            outbound_opted_out_notification_methods: Arc::new(RwLock::new(HashSet::new())),
        };
        let _closed = ProcessorCommand::ExtraConnectionClosed {
            connection_id: ConnectionId(7),
        };
    }
```

Run:

```bash
cargo test -p codex-app-server processor_command_has_extra_variants
```

Expected: FAIL with `no variant or associated item named \`ExtraConnectionOpened\``.

- [x] **Step 2: Add the new `ProcessorCommand` variants**

In `codex-rs/app-server/src/in_process.rs`, extend the enum:

```rust
enum ProcessorCommand {
    Request(Box<ClientRequest>),
    Notification(ClientNotification),
    ExtraConnectionOpened {
        connection_id: ConnectionId,
        outbound_initialized: Arc<AtomicBool>,
        outbound_experimental_api_enabled: Arc<AtomicBool>,
        outbound_opted_out_notification_methods: Arc<RwLock<HashSet<String>>>,
    },
    ExtraRequest {
        connection_id: ConnectionId,
        request: Box<codex_app_server_protocol::JSONRPCRequest>,
    },
    ExtraNotification {
        connection_id: ConnectionId,
        notification: codex_app_server_protocol::JSONRPCNotification,
    },
    ExtraConnectionClosed {
        connection_id: ConnectionId,
    },
}
```

`JSONRPCRequest` / `JSONRPCNotification` come from `codex_app_server_protocol`; keep the existing `use codex_app_server_protocol::*` cluster at the top of the file and add imports there if needed (prefer module-qualified paths in the enum body to avoid polluting the file's top-level import surface).

- [x] **Step 3: Re-run the test to verify PASS**

```bash
cargo test -p codex-app-server processor_command_has_extra_variants
```

Expected:

```text
test tests::processor_command_has_extra_variants ... ok
```

- [x] **Step 4: Commit**

```bash
git add codex-rs/app-server/src/in_process.rs
git commit -m "feat(app-server): add ExtraConnection ProcessorCommand variants"
```

## Task 2: Add `ExtraConnectionHandle` + `register_extra_connection`

**Files:**
- Modify: `codex-rs/app-server/src/in_process.rs`

- [x] **Step 1: Write failing tests for the handle shape and ID allocation**

Add to `codex-rs/app-server/src/in_process.rs` inside `#[cfg(test)] mod tests`:

```rust
    #[tokio::test]
    async fn register_extra_connection_allocates_ids_starting_above_main() {
        let client = start_test_client(SessionSource::Cli).await;
        let sender = client.sender();

        let first = sender
            .register_extra_connection()
            .await
            .expect("register first extra connection");
        let second = sender
            .register_extra_connection()
            .await
            .expect("register second extra connection");

        assert_ne!(first.connection_id, IN_PROCESS_CONNECTION_ID);
        assert_ne!(second.connection_id, IN_PROCESS_CONNECTION_ID);
        assert_ne!(first.connection_id, second.connection_id);
        assert!(first.connection_id.0 >= 1);
        assert!(second.connection_id.0 >= 1);

        drop(first);
        drop(second);
        client.shutdown().await.expect("shutdown");
    }

    #[tokio::test]
    async fn dropping_extra_connection_handle_sends_closed_command() {
        let client = start_test_client(SessionSource::Cli).await;
        let sender = client.sender();
        let handle = sender
            .register_extra_connection()
            .await
            .expect("register_extra_connection");
        let connection_id = handle.connection_id;
        drop(handle);

        client.shutdown().await.expect("shutdown");
        let _ = connection_id;
    }

    // Defense-in-depth for the Drop path: even if the processor channel is
    // saturated when `Drop` runs, `ExtraConnectionClosed` must still be
    // delivered before the runtime shuts down. The Drop impl falls back to a
    // detached async `send(...).await` when `try_send` returns Full; this
    // test exercises that fallback.
    #[tokio::test]
    async fn drop_under_backpressure_still_delivers_closed() {
        // A tiny channel capacity makes `try_send` from Drop reliably hit
        // Full: the processor task will be busy enough that the sender's
        // queue fills before Drop fires. `start_test_client_with_channel_capacity`
        // is a new test helper (Step 6b) that pins `channel_capacity` to
        // this value without changing production defaults.
        let client =
            start_test_client_with_channel_capacity(SessionSource::Cli, 1).await;
        let sender = client.sender();

        // Register and send enough traffic to saturate the processor's
        // client channel. We send N ExtraNotification frames via the
        // handle's command sender while the processor is still parked on
        // the first iteration; once the channel is saturated, Drop will
        // observe `Full` on try_send.
        let mut handle = sender
            .register_extra_connection()
            .await
            .expect("register_extra_connection");
        let sender_for_flood = handle.command_sender.clone();
        for _ in 0..64 {
            // Don't unwrap: at some point try_send starts returning Full —
            // that's exactly the saturation we want for the Drop path.
            let _ = sender_for_flood.try_send_notification(JSONRPCNotification {
                method: "initialized".into(),
                params: None,
            });
        }

        // Take a test probe that the processor increments each time it
        // sees an ExtraConnectionClosed for this connection_id.
        let closed_probe = client.extra_closed_probe(handle.connection_id);

        // Dropping now must deliver ExtraConnectionClosed exactly once via
        // the detached async fallback.
        drop(handle);

        // Give the runtime a generous but bounded budget to deliver Closed.
        let observed = tokio::time::timeout(
            std::time::Duration::from_millis(500),
            closed_probe.wait_for_close(),
        )
        .await
        .expect("ExtraConnectionClosed did not arrive within 500ms");
        assert_eq!(observed, 1, "ExtraConnectionClosed must fire exactly once");

        client.shutdown().await.expect("shutdown");
    }

    // `start_test_client_with_channel_capacity` and `extra_closed_probe`
    // land alongside this test; they are not exposed in non-test builds.
    // If adding the probe is infeasible without production-side changes
    // beyond this plan, replace it with a direct observation through the
    // test helper's recorded ProcessorCommand log and keep this test
    // executable — do NOT regress to `#[ignore]`.
```

Run:

```bash
cargo test -p codex-app-server -- register_extra_connection_
cargo test -p codex-app-server -- dropping_extra_connection_handle_
```

Expected: FAIL with `no method named \`register_extra_connection\``.

- [x] **Step 2: Define `ExtraConnectionHandle`**

In `codex-rs/app-server/src/in_process.rs`, add near the other public types:

```rust
use tokio_util::sync::CancellationToken;

/// Handle returned by [`InProcessClientSender::register_extra_connection`].
///
/// Dropping the handle issues a best-effort `ProcessorCommand::ExtraConnectionClosed`
/// so callers can rely on `Drop` as the cleanup path when their bridge task exits.
///
/// Naming is intentionally neutral — `in_process.rs` does not model HTTP,
/// WebSocket, authentication, or allowlist semantics. Callers layer those
/// concerns on top and hand typed `JSONRPCRequest` / `JSONRPCNotification`
/// values in via `command_sender`.
pub struct ExtraConnectionHandle {
    pub connection_id: ConnectionId,
    pub command_sender: ExtraConnectionCommandSender,
    pub outgoing_tx: mpsc::Sender<String>,
    pub outgoing_rx: mpsc::Receiver<String>,
    pub disconnect_token: CancellationToken,
}

#[derive(Clone)]
pub struct ExtraConnectionCommandSender {
    inner: mpsc::Sender<InProcessClientMessage>,
    connection_id: ConnectionId,
}

impl ExtraConnectionCommandSender {
    pub fn send_request(
        &self,
        request: codex_app_server_protocol::JSONRPCRequest,
    ) -> IoResult<()> {
        self.try_send(InProcessClientMessage::ExtraRequest {
            connection_id: self.connection_id,
            request: Box::new(request),
        })
    }

    pub fn send_notification(
        &self,
        notification: codex_app_server_protocol::JSONRPCNotification,
    ) -> IoResult<()> {
        self.try_send(InProcessClientMessage::ExtraNotification {
            connection_id: self.connection_id,
            notification,
        })
    }

    /// Non-blocking variant used by tests that want to observe saturation.
    /// Returns `ErrorKind::WouldBlock` without logging when the queue is
    /// full, so tests can flood the channel to force the Drop path's
    /// `Full` branch (`drop_under_backpressure_still_delivers_closed`).
    /// Not used by production callers.
    pub fn try_send_notification(
        &self,
        notification: codex_app_server_protocol::JSONRPCNotification,
    ) -> IoResult<()> {
        self.try_send(InProcessClientMessage::ExtraNotification {
            connection_id: self.connection_id,
            notification,
        })
    }

    fn try_send(&self, message: InProcessClientMessage) -> IoResult<()> {
        match self.inner.try_send(message) {
            Ok(()) => Ok(()),
            Err(mpsc::error::TrySendError::Full(_)) => Err(IoError::new(
                ErrorKind::WouldBlock,
                "in-process extra connection queue is full",
            )),
            Err(mpsc::error::TrySendError::Closed(_)) => Err(IoError::new(
                ErrorKind::BrokenPipe,
                "in-process app-server runtime is closed",
            )),
        }
    }
}

impl Drop for ExtraConnectionHandle {
    fn drop(&mut self) {
        // Close delivery must not depend on the processor queue having
        // headroom — normal backpressure on a busy session can fill it. Try
        // the fast path first, and on `Full` fall back to an async send on
        // a detached task so the Close message reliably lands exactly once.
        let close_msg = InProcessClientMessage::ExtraConnectionClosed {
            connection_id: self.connection_id,
        };
        match self.command_sender.inner.try_send(close_msg) {
            Ok(()) => {}
            Err(mpsc::error::TrySendError::Full(msg)) => {
                // Detached async retry. The processor task owns the other
                // end of `inner`, so `send(...).await` completes once the
                // processor consumes a message. If the sender is Closed by
                // then, the runtime is shutting down and the Drop is moot.
                let sender = self.command_sender.inner.clone();
                tokio::spawn(async move {
                    let _ = sender.send(msg).await;
                });
            }
            Err(mpsc::error::TrySendError::Closed(_)) => {
                // Runtime already torn down; nothing to clean up.
            }
        }
    }
}
```

> **Invariant:** `ExtraConnectionHandle::Drop` delivers `ExtraConnectionClosed` under every live-runtime condition, including full backpressure on the processor channel. The `Closed` branch is the only silent one, and it only fires after the runtime has already shut down. This is exercised by `drop_under_backpressure_still_delivers_closed` in Task 2 Step 2.

- [x] **Step 3: Extend `InProcessClientMessage`**

Add four new variants next to existing request/notification variants:

```rust
enum InProcessClientMessage {
    // ... existing variants ...
    ExtraConnectionOpened {
        connection_id: ConnectionId,
        outgoing_tx: mpsc::Sender<String>,
        disconnect_token: CancellationToken,
    },
    ExtraRequest {
        connection_id: ConnectionId,
        request: Box<codex_app_server_protocol::JSONRPCRequest>,
    },
    ExtraNotification {
        connection_id: ConnectionId,
        notification: codex_app_server_protocol::JSONRPCNotification,
    },
    ExtraConnectionClosed {
        connection_id: ConnectionId,
    },
}
```

`ExtraConnectionOpened::outgoing_tx` reaches the outer runtime task (not the processor) so the runtime can register a new entry in `outbound_connections` (Task 3) wired to the caller's `outgoing_tx`. `ExtraConnectionOpened::disconnect_token` is passed through to `OutboundConnectionState::new(..., Some(token))` so `route_outgoing_envelope` uses the non-blocking `try_send` fast path and disconnects slow extras via the token — instead of `writer.send(...).await` blocking the shared router on any other connection (see `codex-rs/app-server/src/transport.rs:145` vs `:158`).

- [x] **Step 4: Implement `register_extra_connection` on `InProcessClientSender`**

Keep main connection reserved with `ConnectionId(0)`; extras start at `1`. **Registration must not silently succeed if `ExtraConnectionOpened` cannot be enqueued — a returned handle with no corresponding `outbound_connections` entry would desync the runtime.** Therefore the method is `async` and returns `IoResult<ExtraConnectionHandle>`, using `send(...).await` for the Opened message. On `SendError` the runtime is closed; no handle is returned.

```rust
use std::sync::atomic::AtomicU64;
use std::sync::atomic::Ordering;

static EXTRA_CONNECTION_ID_COUNTER: AtomicU64 = AtomicU64::new(1);

impl InProcessClientSender {
    pub async fn register_extra_connection(&self) -> IoResult<ExtraConnectionHandle> {
        let connection_id =
            ConnectionId(EXTRA_CONNECTION_ID_COUNTER.fetch_add(1, Ordering::Relaxed));
        let (outgoing_tx, outgoing_rx) = mpsc::channel::<String>(CHANNEL_CAPACITY);
        let disconnect_token = CancellationToken::new();

        // Fail-visible. If this send errors, the runtime task is gone; the
        // caller learns immediately instead of getting a half-registered
        // handle that the processor never sees.
        self.client_tx
            .send(InProcessClientMessage::ExtraConnectionOpened {
                connection_id,
                outgoing_tx: outgoing_tx.clone(),
                disconnect_token: disconnect_token.clone(),
            })
            .await
            .map_err(|_| IoError::new(
                ErrorKind::BrokenPipe,
                "in-process app-server runtime is closed",
            ))?;

        Ok(ExtraConnectionHandle {
            connection_id,
            command_sender: ExtraConnectionCommandSender {
                inner: self.client_tx.clone(),
                connection_id,
            },
            outgoing_tx,
            outgoing_rx,
            disconnect_token,
        })
    }
}
```

The local `AtomicU64` avoids sharing ID space with `codex-app-server-transport`'s private `next_connection_id` and guarantees `ConnectionId(0)` is reserved for the main connection.

- [x] **Step 5: Run tests**

```bash
cargo test -p codex-app-server -- register_extra_connection_
cargo test -p codex-app-server -- dropping_extra_connection_handle_
```

Expected: both tests pass. `dropping_extra_connection_handle_sends_closed_command` does not yet observe `ExtraConnectionClosed` processing — it only proves the sender survives a `drop` without panicking; Task 3 verifies the loop actually consumes it.

- [x] **Step 6: Commit**

```bash
git add codex-rs/app-server/src/in_process.rs
git commit -m "feat(app-server): add register_extra_connection API"
```

## Task 3: Dispatch Extra Connection Commands in the Runtime Loop

**Files:**
- Modify: `codex-rs/app-server/src/in_process.rs`

Plan 06 Task 3 is the biggest single change in `in_process.rs`. Follow each sub-step exactly; do not refactor the main connection arms.

- [x] **Step 1: Write failing integration tests for the request / notification / close round-trip**

Add to `#[cfg(test)] mod tests` (reuse the existing test helpers):

```rust
    use codex_app_server_protocol::JSONRPCNotification;
    use codex_app_server_protocol::JSONRPCRequest;
    use codex_app_server_protocol::RequestId;
    use std::time::Duration;
    use tokio::time::timeout;

    #[tokio::test]
    async fn extra_connection_request_reaches_message_processor() {
        let client = start_test_client(SessionSource::Cli).await;
        let sender = client.sender();
        let mut handle = sender
            .register_extra_connection()
            .await
            .expect("register_extra_connection");

        handle
            .command_sender
            .send_request(JSONRPCRequest {
                id: RequestId::Integer(42),
                method: "config/requirements/read".to_string(),
                params: None,
                trace: None,
            })
            .expect("extra request should enqueue");

        let outgoing = timeout(Duration::from_secs(2), handle.outgoing_rx.recv())
            .await
            .expect("extra outgoing should arrive within timeout")
            .expect("extra outgoing channel should stay open");
        let parsed: serde_json::Value =
            serde_json::from_str(&outgoing).expect("extra outgoing must be JSON");
        assert_eq!(parsed["id"], serde_json::json!(42));
        assert!(
            parsed.get("result").is_some() || parsed.get("error").is_some(),
            "response envelope must contain result or error: {parsed}"
        );

        drop(handle);
        client.shutdown().await.expect("shutdown");
    }

    #[tokio::test]
    async fn extra_connection_notification_is_accepted() {
        let client = start_test_client(SessionSource::Cli).await;
        let sender = client.sender();
        let handle = sender
            .register_extra_connection()
            .await
            .expect("register_extra_connection");

        handle
            .command_sender
            .send_notification(JSONRPCNotification {
                method: "initialized".to_string(),
                params: None,
            })
            .expect("extra notification should enqueue");

        drop(handle);
        client.shutdown().await.expect("shutdown");
    }
```

Run:

```bash
cargo test -p codex-app-server -- extra_connection_request_reaches_message_processor
cargo test -p codex-app-server -- extra_connection_notification_is_accepted
```

Expected: FAIL because the processor loop does not yet have arms for the new commands; `outgoing_rx.recv()` times out.

- [x] **Step 2: Extend the outer runtime task to register extra `OutboundConnectionState` entries**

The outbound router task in `start_uninitialized` owns `outbound_connections` via its spawn closure. Refactor so the map is owned by an extra task ("outbound router supervisor") that also handles `ExtraConnectionOpened` / `ExtraConnectionClosed` registration requests.

Replace the existing block:

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
            while let Some(envelope) = outgoing_rx.recv().await {
                route_outgoing_envelope(&mut outbound_connections, envelope).await;
            }
        });
```

with:

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
        // Control channel used by the client-message task to register and
        // unregister extra connection writer entries without blocking the
        // processor. Outbound gating state (initialized / experimental /
        // opted-out) is NOT mirrored through this channel — it is shared
        // directly via `Arc`s between processor and router (see the
        // `Invariants` block below).
        let (outbound_control_tx, mut outbound_control_rx) =
            mpsc::channel::<OutboundControl>(channel_capacity);
        let mut outbound_handle = tokio::spawn(async move {
            // Starvation-safe scheduler. Before each envelope drain we make
            // a bounded number of non-blocking attempts to drain control
            // messages. This keeps envelope routing as the hot path (the
            // single-source drain shape at
            // `codex-rs/app-server/src/in_process.rs:401` is preserved)
            // while guaranteeing that a saturated `outgoing_rx` — which a
            // plain `biased; envelope; control;` select would let win every
            // poll — can still service Register/Unregister quickly. Control
            // handling is cheap (HashMap insert/remove).
            const CONTROL_BURST: usize = 8;
            loop {
                // 1) Opportunistic control drain. `try_recv` never parks, so
                //    an idle control channel is a few cheap atomics.
                for _ in 0..CONTROL_BURST {
                    match outbound_control_rx.try_recv() {
                        Ok(control) => {
                            handle_outbound_control(&mut outbound_connections, control);
                        }
                        Err(mpsc::error::TryRecvError::Empty) => break,
                        Err(mpsc::error::TryRecvError::Disconnected) => {
                            // Control channel closed implies the client
                            // task exited; let the final envelope recv
                            // observe the matching outgoing_rx close.
                            break;
                        }
                    }
                }
                // 2) Fair select between the next envelope and the next
                //    control message. No `biased;`: we rely on the bounded
                //    drain above to keep control latency low without
                //    skewing the outcome when both channels are ready.
                tokio::select! {
                    envelope = outgoing_rx.recv() => {
                        let Some(envelope) = envelope else { break };
                        route_outgoing_envelope(&mut outbound_connections, envelope).await;
                    }
                    control = outbound_control_rx.recv() => {
                        match control {
                            Some(OutboundControl::Register {
                                connection_id,
                                writer,
                                initialized,
                                experimental_api_enabled,
                                opted_out_notification_methods,
                                disconnect_sender,
                            }) => {
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
                            Some(OutboundControl::Unregister { connection_id }) => {
                                outbound_connections.remove(&connection_id);
                            }
                            None => break,
                        }
                    }
                }
            }
        });
```

```rust
fn handle_outbound_control(
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
        OutboundControl::Unregister { connection_id } => {
            outbound_connections.remove(&connection_id);
        }
    }
}
```

The inline `control = outbound_control_rx.recv()` match arm above should delegate to `handle_outbound_control` for the `Some(control)` case, keeping register/unregister logic in one place. The `None =>` arm still breaks the router loop.

Regression test for this starvation-safe scheduler belongs in the same test module as `extra_connection_request_reaches_message_processor`:

```rust
#[tokio::test]
async fn register_and_unregister_progress_under_sustained_outgoing_load() {
    use std::sync::Arc;
    use std::sync::atomic::AtomicBool;
    use std::sync::atomic::Ordering;
    use std::time::Duration;
    use tokio::time::timeout;

    // Spin up the in-process runtime and register the main connection the
    // same way the standard test client does.
    let client = start_test_client(SessionSource::Cli).await;
    let main_sender = client.sender();

    // Sustained load on the main connection's outgoing path. Any notification
    // method accepted by the raw notification path works; `Initialized` is
    // intentionally cheap and is a unit variant in the protocol. The loop
    // exits when `stop_flag` flips.
    //
    // `InProcessClientSender::notify` is `pub fn notify(..) -> IoResult<()>`
    // (sync) — see `codex-rs/app-server/src/in_process.rs:211` — so there is
    // no `.await` here. An explicit `tokio::task::yield_now().await` gives
    // the runtime a chance to schedule the router and processor tasks when
    // the flood task is otherwise tight-looped.
    let stop_flag = Arc::new(AtomicBool::new(false));
    let flood_flag = Arc::clone(&stop_flag);
    let flood_sender = main_sender.clone();
    let flood_task = tokio::spawn(async move {
        while !flood_flag.load(Ordering::Acquire) {
            // Ignore backpressure; tight loop so `outgoing_rx` stays hot.
            let _ = flood_sender.notify(ClientNotification::Initialized);
            tokio::task::yield_now().await;
        }
    });

    // While the flood is live, a naive `biased; envelope; control;` router
    // would never serve register/unregister. The starvation-safe scheduler
    // must deliver Opened + Closed within a bounded window.
    let extra = timeout(Duration::from_millis(500), main_sender.register_extra_connection())
        .await
        .expect("register_extra_connection must complete under outgoing load within 500ms")
        .expect("register_extra_connection must succeed (runtime not torn down)");
    let connection_id = extra.connection_id;
    // Drop inside the flood; Drop's fast path try_send goes onto the same
    // processor channel, so the scheduler must still make progress.
    drop(extra);

    // The connection-id probe mirrors the one used by
    // `drop_under_backpressure_still_delivers_closed`: it increments when the
    // processor observes the matching ExtraConnectionClosed.
    let closed_probe = client.extra_closed_probe(connection_id);
    let observed = timeout(Duration::from_millis(500), closed_probe.wait_for_close())
        .await
        .expect("ExtraConnectionClosed must arrive within 500ms under load");
    assert_eq!(observed, 1, "ExtraConnectionClosed must fire exactly once");

    stop_flag.store(true, Ordering::Release);
    flood_task.await.expect("flood task joins cleanly");
    client.shutdown().await.expect("shutdown");
}
```

Add the control type next to `InProcessClientMessage`:

```rust
enum OutboundControl {
    Register {
        connection_id: ConnectionId,
        writer: mpsc::Sender<QueuedOutgoingMessage>,
        initialized: Arc<AtomicBool>,
        experimental_api_enabled: Arc<AtomicBool>,
        opted_out_notification_methods: Arc<RwLock<HashSet<String>>>,
        // Per-extra disconnect token. Forwarded to
        // `OutboundConnectionState::new(.., Some(token))`; enables the
        // non-blocking try_send + disconnect path in
        // `route_outgoing_envelope` (transport.rs:145).
        disconnect_sender: Option<tokio_util::sync::CancellationToken>,
    },
    Unregister {
        connection_id: ConnectionId,
    },
}
```

The 3 Arcs (`initialized`, `experimental_api_enabled`, `opted_out_notification_methods`) are allocated once per extra connection in the `ExtraConnectionOpened` handling (Step 4) and cloned into **two** places: (a) the outbound router via `OutboundControl::Register`, and (b) the processor task via `ProcessorCommand::ExtraConnectionOpened` payload fields. Router and processor share the same underlying `AtomicBool` / `RwLock<HashSet<String>>`, so when the processor stores new values after `process_request` (Step 5), the outbound router's subsequent `load` in `route_outgoing_envelope` sees them via the atomic's Acquire/Release ordering — exactly the same synchronization shape websocket callers use in `codex-rs/app-server/src/lib.rs:915-949`. No cross-task control message is required for state mirroring. The main connection's existing Arcs (`outbound_initialized`, etc.) stay reserved for `IN_PROCESS_CONNECTION_ID` and are never shared with extras.

**Invariants after this change:**
- `outgoing_rx.recv()` is still the primary source of outgoing traffic; main-connection throughput and ordering are unchanged.
- `OutboundControl::Register` is only reachable via `ExtraConnectionOpened` handling (Step 4), so the main connection's writer slot is never overwritten.
- `OutboundControl::Unregister` is only reachable via `ExtraConnectionClosed` handling (Step 4); `IN_PROCESS_CONNECTION_ID` is never passed in.
- Outbound gating state (initialized / experimental / opted-out) is shared by Arc between processor and router, so the processor's post-request `store` is immediately visible to the next outbound envelope routed for that connection — no async control message race exists.

- [x] **Step 3: Bridge `writer_rx` payloads into `ExtraConnectionHandle::outgoing_rx`**

Extra connection writer channels live in `outbound_connections`, so their `QueuedOutgoingMessage` payloads flow through the existing `writer_rx` (which is owned by the client-message select loop below — **that loop still expects only the main connection's writes on `writer_rx`**). Keep the main `writer_rx` scoped to `IN_PROCESS_CONNECTION_ID` only, and give each extra connection its own writer channel connected to the caller's `outgoing_tx: Sender<String>`.

To do this, add a helper that owns the per-extra serializer bridge. In `start_uninitialized`, declare a bridge-spawn helper and use it from the `ExtraConnectionOpened` arm:

```rust
use crate::outgoing_message::OutgoingMessage;
use crate::outgoing_message::QueuedOutgoingMessage;

fn spawn_extra_writer_bridge(
    connection_id: ConnectionId,
    outgoing_tx: mpsc::Sender<String>,
    mut writer_rx: mpsc::Receiver<QueuedOutgoingMessage>,
) {
    tokio::spawn(async move {
        while let Some(queued) = writer_rx.recv().await {
            let serialized = match queued.message {
                OutgoingMessage::Response(_)
                | OutgoingMessage::Error(_)
                | OutgoingMessage::Request(_)
                | OutgoingMessage::AppServerNotification(_) => {
                    match serde_json::to_string(&queued.message) {
                        Ok(text) => text,
                        Err(err) => {
                            tracing::error!(
                                connection_id = ?connection_id,
                                "failed to serialize extra outgoing message: {err}",
                            );
                            continue;
                        }
                    }
                }
            };
            if outgoing_tx.send(serialized).await.is_err() {
                break;
            }
            if let Some(done) = queued.write_complete_tx {
                let _ = done.send(());
            }
        }
    });
}
```

`OutgoingMessage` already derives `Serialize` (it is what stdio / websocket transports serialize today); reusing `serde_json::to_string` keeps the on-wire shape identical to the external app-server.

- [x] **Step 4: Add `InProcessClientMessage` arms in the client-message select loop**

Inside the main `loop { tokio::select! { ... } }` arm `message = client_rx.recv()`, extend `match message { ... }` with four new arms **before** the trailing `None => break` arm:

```rust
                        Some(InProcessClientMessage::ExtraConnectionOpened {
                            connection_id,
                            outgoing_tx,
                            disconnect_token,
                        }) => {
                            let (writer_tx, writer_rx) =
                                mpsc::channel::<QueuedOutgoingMessage>(channel_capacity);
                            spawn_extra_writer_bridge(connection_id, outgoing_tx, writer_rx);
                            let initialized = Arc::new(AtomicBool::new(false));
                            let experimental_api_enabled = Arc::new(AtomicBool::new(false));
                            let opted_out_notification_methods =
                                Arc::new(RwLock::new(HashSet::new()));
                            if outbound_control_tx
                                .send(OutboundControl::Register {
                                    connection_id,
                                    writer: writer_tx,
                                    initialized: Arc::clone(&initialized),
                                    experimental_api_enabled: Arc::clone(
                                        &experimental_api_enabled,
                                    ),
                                    opted_out_notification_methods: Arc::clone(
                                        &opted_out_notification_methods,
                                    ),
                                    // Per-extra token. Makes route_outgoing_envelope
                                    // use the non-blocking try_send + disconnect path
                                    // (transport.rs:145), isolating slow extras from
                                    // the shared outbound router.
                                    disconnect_sender: Some(disconnect_token.clone()),
                                })
                                .await
                                .is_err()
                            {
                                break;
                            }
                            if processor_tx
                                .send(ProcessorCommand::ExtraConnectionOpened {
                                    connection_id,
                                    outbound_initialized: initialized,
                                    outbound_experimental_api_enabled: experimental_api_enabled,
                                    outbound_opted_out_notification_methods:
                                        opted_out_notification_methods,
                                })
                                .await
                                .is_err()
                            {
                                break;
                            }
                        }
                        Some(InProcessClientMessage::ExtraRequest {
                            connection_id,
                            request,
                        }) => {
                            if processor_tx
                                .send(ProcessorCommand::ExtraRequest {
                                    connection_id,
                                    request,
                                })
                                .await
                                .is_err()
                            {
                                break;
                            }
                        }
                        Some(InProcessClientMessage::ExtraNotification {
                            connection_id,
                            notification,
                        }) => {
                            if processor_tx
                                .send(ProcessorCommand::ExtraNotification {
                                    connection_id,
                                    notification,
                                })
                                .await
                                .is_err()
                            {
                                break;
                            }
                        }
                        Some(InProcessClientMessage::ExtraConnectionClosed { connection_id }) => {
                            if processor_tx
                                .send(ProcessorCommand::ExtraConnectionClosed { connection_id })
                                .await
                                .is_err()
                            {
                                break;
                            }
                            let _ = outbound_control_tx
                                .send(OutboundControl::Unregister { connection_id })
                                .await;
                        }
```

Use `send().await` instead of `try_send`: extra-connection registration and teardown must not be dropped silently. Back-pressure is acceptable since a blocked registration simply throttles new browser connections.

- [x] **Step 5: Add processor-side arms**

Inside the processor task `tokio::select!`, extend the `match command { ... }` inside `Some(ProcessorCommand::...)` with four new arms. Track per-connection state (session state + outbound gating Arcs) in a new map declared alongside the existing `session` binding:

```rust
            struct ExtraConnectionEntry {
                session_state: Arc<ConnectionSessionState>,
                outbound_initialized: Arc<AtomicBool>,
                outbound_experimental_api_enabled: Arc<AtomicBool>,
                outbound_opted_out_notification_methods: Arc<RwLock<HashSet<String>>>,
            }
            let mut extra_connections: HashMap<ConnectionId, ExtraConnectionEntry> =
                HashMap::new();
```

Then add these arms immediately after `Some(ProcessorCommand::Notification(notification))`:

```rust
                            Some(ProcessorCommand::ExtraConnectionOpened {
                                connection_id,
                                outbound_initialized,
                                outbound_experimental_api_enabled,
                                outbound_opted_out_notification_methods,
                            }) => {
                                extra_connections.insert(
                                    connection_id,
                                    ExtraConnectionEntry {
                                        session_state: Arc::new(ConnectionSessionState::new()),
                                        outbound_initialized,
                                        outbound_experimental_api_enabled,
                                        outbound_opted_out_notification_methods,
                                    },
                                );
                            }
                            Some(ProcessorCommand::ExtraRequest {
                                connection_id,
                                request,
                            }) => {
                                let Some(entry) = extra_connections.get(&connection_id) else {
                                    tracing::warn!(
                                        ?connection_id,
                                        "dropping extra request for unknown connection",
                                    );
                                    continue;
                                };
                                let session_state = Arc::clone(&entry.session_state);
                                let outbound_initialized = Arc::clone(&entry.outbound_initialized);
                                let outbound_experimental_api_enabled =
                                    Arc::clone(&entry.outbound_experimental_api_enabled);
                                let outbound_opted_out_notification_methods = Arc::clone(
                                    &entry.outbound_opted_out_notification_methods,
                                );
                                processor
                                    .process_request(
                                        connection_id,
                                        *request,
                                        &crate::transport::AppServerTransport::Off,
                                        Arc::clone(&session_state),
                                    )
                                    .await;
                                // Mirror session state into the outbound Arcs
                                // synchronously, identical to the shape used by
                                // websocket callers in
                                // `codex-rs/app-server/src/lib.rs:915-949`.
                                // The processor passes `None` for
                                // `outbound_initialized` inside
                                // `process_request` on purpose
                                // (`message_processor.rs:511-524`); the caller
                                // — here, this arm — is responsible for the
                                // mirror. Because the outbound router shares
                                // these same `Arc<AtomicBool>` /
                                // `Arc<RwLock<_>>` instances (see Step 4), its
                                // next `load` observes the new values via
                                // Release/Acquire ordering before any
                                // subsequent envelope for this connection is
                                // routed.
                                let opted_out_snapshot =
                                    session_state.opted_out_notification_methods();
                                if let Ok(mut opted_out) =
                                    outbound_opted_out_notification_methods.write()
                                {
                                    *opted_out = opted_out_snapshot;
                                } else {
                                    tracing::warn!(
                                        ?connection_id,
                                        "failed to mirror extra connection opted-out list",
                                    );
                                }
                                outbound_experimental_api_enabled.store(
                                    session_state.experimental_api_enabled(),
                                    Ordering::Release,
                                );
                                let was_initialized = outbound_initialized
                                    .swap(session_state.initialized(), Ordering::AcqRel);
                                let is_initialized = session_state.initialized();
                                if !was_initialized && is_initialized {
                                    // Extra connections go through the raw
                                    // `process_request` path with
                                    // `outbound_initialized: None` (the
                                    // caller — this arm — owns the mirror),
                                    // so the typed main-connection branch
                                    // in `message_processor.rs:711-725` does
                                    // NOT run `connection_initialized` for
                                    // this connection. Without this call,
                                    // `thread/projection/attach` rejects the
                                    // connection as not-live at
                                    // `request_processors/thread_projection.rs:67`.
                                    // Call it here exactly once on the
                                    // false->true transition.
                                    processor
                                        .connection_initialized(connection_id)
                                        .await;
                                }
                                // Extra connections intentionally do NOT
                                // trigger `send_initialize_notifications`
                                // on first initialize: that method broadcasts
                                // one-time startup notifications that only
                                // make sense for the main connection. Extra
                                // connections rely on the `thread_created_rx`
                                // fan-out (Step 6) and on responses to the
                                // requests they themselves issued.
                            }
                            Some(ProcessorCommand::ExtraNotification {
                                connection_id,
                                notification,
                            }) => {
                                if !extra_connections.contains_key(&connection_id) {
                                    tracing::warn!(
                                        ?connection_id,
                                        "dropping extra notification for unknown connection",
                                    );
                                    continue;
                                }
                                processor.process_notification(notification).await;
                            }
                            Some(ProcessorCommand::ExtraConnectionClosed { connection_id }) => {
                                if let Some(entry) = extra_connections.remove(&connection_id) {
                                    processor
                                        .connection_closed(connection_id, &entry.session_state)
                                        .await;
                                } else {
                                    tracing::warn!(
                                        ?connection_id,
                                        "ExtraConnectionClosed for unknown connection",
                                    );
                                }
                            }
```

`process_request` takes `transport: &AppServerTransport` only for tracing labels; `AppServerTransport::Off` is the correct neutral marker here — this is not a Unix / WebSocket / Stdio pipe.

- [x] **Step 6: Generalize `thread_created_rx` dispatch**

Today:

```rust
                                let connection_ids = if session.initialized() {
                                    vec![IN_PROCESS_CONNECTION_ID]
                                } else {
                                    Vec::<ConnectionId>::new()
                                };
```

Replace with:

```rust
                                let mut connection_ids = Vec::new();
                                if session.initialized() {
                                    connection_ids.push(IN_PROCESS_CONNECTION_ID);
                                }
                                for (extra_connection_id, extra_entry) in
                                    extra_connections.iter()
                                {
                                    if extra_entry.session_state.initialized() {
                                        connection_ids.push(*extra_connection_id);
                                    }
                                }
```

This makes projection event fan-out follow the allowlisted browser connections once they complete `initialize`.

- [x] **Step 7: Run the Task 3 failing tests**

```bash
cargo test -p codex-app-server -- extra_connection_request_reaches_message_processor
cargo test -p codex-app-server -- extra_connection_notification_is_accepted
```

Expected: both tests pass.

- [x] **Step 8: Re-run the main-connection invariant tests**

```bash
cargo test -p codex-app-server -- in_process_start_initializes_and_handles_typed_v2_request
cargo test -p codex-app-server -- in_process_start_uses_requested_session_source_for_thread_start
cargo test -p codex-app-server -- in_process_start_clamps_zero_channel_capacity
cargo test -p codex-app-server -- guaranteed_delivery_helpers_cover_terminal_server_notifications
```

Expected: all four tests still pass.

- [x] **Step 9: Commit**

```bash
git add codex-rs/app-server/src/in_process.rs
git commit -m "feat(app-server): dispatch extra connection commands"
```

## Task 4: Close-path Cleanup and Shutdown Ordering

**Files:**
- Modify: `codex-rs/app-server/src/in_process.rs`

- [x] **Step 1: Write failing close-path test**

Add to `#[cfg(test)] mod tests`:

```rust
    #[tokio::test]
    async fn dropping_extra_handle_triggers_connection_closed() {
        let client = start_test_client(SessionSource::Cli).await;
        let sender = client.sender();
        let mut handle = sender
            .register_extra_connection()
            .await
            .expect("register_extra_connection");
        let connection_id = handle.connection_id;

        // Send a request so the connection is definitely registered and the
        // writer pipeline has flowed once.
        handle
            .command_sender
            .send_request(JSONRPCRequest {
                id: RequestId::Integer(1),
                method: "config/requirements/read".to_string(),
                params: None,
                trace: None,
            })
            .expect("send request");

        // Drain the response so we know the processor finished this call
        // *before* we drop the handle. Without this wait, the drop may race
        // the request, and `ExtraConnectionClosed` could be processed before
        // `ExtraRequest`.
        let _response = timeout(Duration::from_secs(2), handle.outgoing_rx.recv())
            .await
            .expect("outgoing response within timeout")
            .expect("outgoing channel still open for response");

        // Move the receiver out of `handle` so we can still observe the
        // channel after `Drop` fires. Replacing with a dummy receiver is
        // necessary because `ExtraConnectionHandle` itself implements `Drop`.
        let (_noop_tx, noop_rx) = mpsc::channel::<String>(1);
        let mut outgoing_rx = std::mem::replace(&mut handle.outgoing_rx, noop_rx);
        drop(handle);

        // After drop, `outgoing_rx` must close because the writer bridge
        // task exits once its writer channel is removed from
        // `outbound_connections`. A timeout counts as failure — close must
        // complete within 2s for this path to prove cleanup.
        let result = timeout(Duration::from_secs(2), outgoing_rx.recv()).await;
        assert!(
            matches!(result, Ok(None)),
            "expected Ok(None) (channel closed) after drop, got {result:?}",
        );

        client.shutdown().await.expect("shutdown");
        let _ = connection_id;
    }
```

Run:

```bash
cargo test -p codex-app-server dropping_extra_handle_triggers_connection_closed
```

Expected: test must PASS against the Task 3 implementation. If it fails, the likely cause is that `OutboundControl::Unregister` is not closing the writer-rx path; use the diagnostic below.

- [x] **Step 2: Confirm per-connection drop removes the writer**

Trace logic:
1. `ExtraConnectionHandle::Drop` -> `ExtraConnectionClosed`.
2. Client-message loop arm -> processor `ExtraConnectionClosed` + `outbound_control_tx` `Unregister`.
3. Outbound router removes the entry from `outbound_connections`, which drops the `writer` (`mpsc::Sender<QueuedOutgoingMessage>`).
4. `writer_rx` owned by `spawn_extra_writer_bridge` observes `None`, exits, and drops its captured `outgoing_tx`.
5. Caller's `outgoing_rx.recv()` returns `None`.

If the test fails, inspect which of these five steps is missing.

- [x] **Step 3: Shutdown-timeout safety note (no code change)**

If the runtime task hits `SHUTDOWN_TIMEOUT` and aborts the processor handle, per-connection `ExtraConnectionClosed` may not run. This is acceptable because the runtime task's shutdown tail already drops `outgoing_message_sender` and the writer pipeline, tearing down any remaining extra connections' outbound channels. Document this in a short code comment above the client-message loop's extra arms:

```rust
// Runtime-abort path: if `SHUTDOWN_TIMEOUT` fires before all
// ExtraConnectionClosed commands are drained, remaining extra connections are
// torn down indirectly via the existing shutdown tail (outgoing_message_sender
// drop + processor abort). Per-connection projection cleanup may be skipped in
// that case; the runtime-end cleanup is the safety net.
```

- [x] **Step 4: Commit**

```bash
git add codex-rs/app-server/src/in_process.rs
git commit -m "test(app-server): extra connection close path cleanup"
```

## Task 5: `codex-app-server-client::gui` Extension Trait

**Files:**
- Create: `codex-rs/app-server-client/src/gui.rs`
- Modify: `codex-rs/app-server-client/src/lib.rs`

- [x] **Step 1: Write failing test for the Remote `Unsupported` path**

Add to `codex-rs/app-server-client/src/gui.rs` (new file) at the bottom:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use pretty_assertions::assert_eq;

    #[test]
    fn gui_launch_error_variants_are_distinct() {
        let unsupported = GuiLaunchError::Unsupported;
        let transport = GuiLaunchError::Transport(std::io::Error::new(
            std::io::ErrorKind::BrokenPipe,
            "closed",
        ));
        assert_eq!(unsupported.to_string(), "GUI is not available for this session");
        assert!(transport.to_string().contains("closed"));
    }
}
```

- [x] **Step 2: Implement the extension surface**

Write `codex-rs/app-server-client/src/gui.rs`:

```rust
//! GUI launch URL extension for the app-server client facade.
//!
//! Plan 06 lands the trait, the public types, and the remote implementation
//! (which returns [`GuiLaunchError::Unsupported`] because GUI launch across a
//! remote app-server process is out of MVP scope).
//!
//! The in-process implementation is added by plan 02: plan 02 introduces
//! `codex-app-server::gui_host::GuiHostManager`, stores an `Arc<GuiHostManager>`
//! on `InProcessAppServerClient`, and writes the in-process
//! `AppServerClientGuiExt` impl there. Plan 06 does not depend on
//! `codex-app-server` and does not start a `GuiHost` itself.

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GuiLaunchUrl {
    pub url: String,
}

#[derive(Debug)]
pub enum GuiLaunchError {
    Unsupported,
    Transport(std::io::Error),
}

impl std::fmt::Display for GuiLaunchError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Unsupported => write!(f, "GUI is not available for this session"),
            Self::Transport(err) => write!(f, "{err}"),
        }
    }
}

impl std::error::Error for GuiLaunchError {}

pub trait AppServerClientGuiExt {
    fn gui_launch_url(
        &self,
        primary_thread_id: &str,
    ) -> impl std::future::Future<Output = Result<GuiLaunchUrl, GuiLaunchError>> + Send;
}
```

Then in `codex-rs/app-server-client/src/lib.rs`:

```rust
pub mod gui;
pub use crate::gui::AppServerClientGuiExt;
pub use crate::gui::GuiLaunchError;
pub use crate::gui::GuiLaunchUrl;
```

And add the `Unsupported` remote implementation at the end of the file:

```rust
impl crate::gui::AppServerClientGuiExt for crate::remote::RemoteAppServerClient {
    fn gui_launch_url(
        &self,
        _primary_thread_id: &str,
    ) -> impl std::future::Future<
        Output = Result<crate::gui::GuiLaunchUrl, crate::gui::GuiLaunchError>,
    > + Send {
        std::future::ready(Err(crate::gui::GuiLaunchError::Unsupported))
    }
}
```

The `InProcessAppServerClient` implementation lands in plan 02 once `GuiHostManager` exists. Plan 06 intentionally stops at the remote-side stub so 02 can wire the in-process side.

RPITIT (`impl Future<...> + Send` return type in a trait method) is used here to match the style of `codex_gui_host::GuiBackend::connect` and avoid introducing an `async-trait` dependency. No `Cargo.toml` or Bazel lockfile change is required.

- [x] **Step 3: Run the new test**

```bash
cargo test -p codex-app-server-client gui_launch_error_variants_are_distinct
```

Expected: PASS.

- [x] **Step 4: Run the broader client test suite for regression safety**

```bash
cargo test -p codex-app-server-client
```

Expected: all existing tests still pass.

- [x] **Step 5: Commit**

```bash
git add codex-rs/app-server-client/src/gui.rs codex-rs/app-server-client/src/lib.rs
git commit -m "feat(app-server-client): add gui launch extension trait"
```

## Task 6: Format + Scoped Lint

**Files:**
- Verify: `codex-rs/app-server/src`
- Verify: `codex-rs/app-server-client/src`

- [x] **Step 1: Format**

From `codex-rs`:

```bash
just fmt
```

- [x] **Step 2: Scoped lint**

```bash
just fix -p codex-app-server
just fix -p codex-app-server-client
```

Expected: no errors; the tools may apply auto-fixes.

- [x] **Step 3: Commit any auto-fixes**

```bash
git add codex-rs/app-server/src codex-rs/app-server-client/src
git commit -m "chore(app-server): format extra-connection plumbing"
```

Narrow the `git add` scope to the crates this plan touches so unrelated workspace noise (other crates' formatting drift, Bazel files, fixtures) is not swept into this commit. If no files were modified, do not create an empty commit.

## Acceptance Gates

- New `ProcessorCommand::Extra*` variants compile and route through the processor `match` loop.
- `InProcessClientSender::register_extra_connection` allocates unique `ConnectionId` values starting at `1`, never colliding with `IN_PROCESS_CONNECTION_ID`.
- `ExtraConnectionHandle::Drop` emits `ExtraConnectionClosed` exactly once under normal operation.
- `process_request` raw path is reused for `ExtraRequest` without duplicating typed `ClientRequest` handling.
- Main TUI connection keeps its typed `ClientRequest` path and existing tests green.
- `thread_created_rx` dispatch fans out to both the main connection and initialized extra connections.
- `codex-app-server-client::gui::AppServerClientGuiExt` trait and `RemoteAppServerClient` `Unsupported` impl compile and their unit test passes.

## Self-Review Checklist

- `in_process.rs` public surface added: `ExtraConnectionHandle`, `ExtraConnectionCommandSender`, `InProcessClientSender::register_extra_connection`. No `gui`, `browser`, `websocket`, `auth`, or `allowlist` names in these symbols.
- `ProcessorCommand::Request` / `Notification` arms are byte-for-byte unchanged.
- `OutboundConnectionState::new` argument list is unchanged.
- `route_outgoing_envelope` is called from the same place as before (inside the outbound router task) for all envelopes, including extra connections.
- The outbound router loop now also serves `OutboundControl` messages; main-connection throughput invariants are preserved (primary source is still `outgoing_rx.recv()`).
- No `run_main_with_transport_options`-style connection map, outbound router, or close cleanup is duplicated.
- Shutdown / abort fallback is documented inline.
- `codex-app-server-client::gui` defines only the trait + types + remote `Unsupported` impl; in-process impl is deferred to plan 02 to keep layering clean.
