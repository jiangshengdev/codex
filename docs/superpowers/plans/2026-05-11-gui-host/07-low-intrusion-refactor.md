# GUI Host Low-Intrusion Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganize the landed GUI host in-process bridge so the unavoidable changes in upstream-hot files stay as thin hooks while extra-connection and GUI launch details live in focused new modules.

**Architecture:** Keep the existing GUI host behavior and ownership model unchanged: TUI requests only a launch URL through `codex-app-server-client`, app-server owns `GuiHostManager`, and authenticated browser traffic enters the existing in-process app-server pipeline as extra connections. Move extra-connection lifecycle code from `in_process.rs` into a new crate-private module and move GUI client facade logic from `app-server-client/src/lib.rs` into `app-server-client/src/gui.rs`, leaving the old files with only module exports, construction, and dispatch hooks.

**Tech Stack:** Rust 2024, tokio, codex-app-server, codex-app-server-client, codex-app-server-protocol, codex-gui-host.

---

Source design: `docs/superpowers/specs/2026-05-13-gui-host-low-intrusion-refactor-design.md`.
Original GUI host spec: `docs/superpowers/specs/2026-05-11-codex-gui-host-redesign.md`.
Prior implementation plan: `docs/superpowers/plans/2026-05-11-gui-host/06-in-process-gui-launch.md`.

## Hard Constraints

- Do not change the GUI host product behavior, security boundary, allowlist, launch URL shape, or ownership model.
- Do not move GUI / WebSocket / allowlist / Origin concepts into `codex-rs/app-server/src/in_process.rs`.
- Do not route GUI traffic through TUI.
- Do not switch the MVP in-process path to `TransportEvent`.
- Do not change the public behavior of the TUI main connection:
  - `InProcessClientHandle::request`
  - `InProcessClientHandle::notify`
  - `InProcessClientHandle::sender`
  - `InProcessClientSender::{request, notify, respond_to_server_request, fail_server_request}`
  - `ProcessorCommand::Request`
  - `ProcessorCommand::Notification`
- Do not reduce test coverage for extra connection close, backpressure, request roundtrip, or GUI launch URL behavior.
- Keep `codex-rs/app-server/src/in_process.rs` as the runtime owner of `MessageProcessor` and `outbound_connections`; the new module may provide helper types and functions but must not create a parallel runtime.

## File Structure

- Create: `codex-rs/app-server/src/in_process_extra.rs`
  - Owns `ExtraConnectionHandle`, `ExtraConnectionCommandSender`, `ExtraConnectionCommand`, `OutboundControl`, ID allocation, extra connection state, outbound control handling, writer bridge, and focused unit tests.
- Modify: `codex-rs/app-server/src/lib.rs`
  - Adds crate-private `mod in_process_extra;`.
- Modify: `codex-rs/app-server/src/in_process.rs`
  - Re-exports public extra connection handle types.
  - Keeps `InProcessClientSender::register_extra_connection`.
  - Keeps runtime hook points for processor dispatch, outbound control, and thread listener connection id expansion.
  - Removes extra connection implementation details that move to `in_process_extra.rs`.
- Modify: `codex-rs/app-server-client/src/gui.rs`
  - Owns `AppServerClientGuiExt` impls for `InProcessAppServerClient` and `RemoteAppServerClient`.
  - Keeps public `GuiLaunchUrl` and `GuiLaunchError`.
- Modify: `codex-rs/app-server-client/src/lib.rs`
  - Keeps module export and re-exports.
  - Constructs `GuiHostManager`.
  - Exposes a small crate-private GUI manager accessor.
  - Replaces scattered `Option` fields with one internal state holder if needed for `Drop` + `shutdown(self)`.

## Target Diff Shape

After this plan, `git diff rust-v0.130.0 -- codex-rs/app-server/src/in_process.rs` should still show necessary hook changes, but not the full extra connection implementation. `git diff rust-v0.130.0 -- codex-rs/app-server-client/src/lib.rs` should no longer show every request / notify / resolve / reject callsite changed solely to support per-field `Option`.

The new files carry the bulk of the refactor:

- `codex-rs/app-server/src/in_process_extra.rs`
- expanded `codex-rs/app-server-client/src/gui.rs`

## Task 0: Baseline Characterization

**Files:**
- Verify: `codex-rs/app-server/src/in_process.rs`
- Verify: `codex-rs/app-server-client/src/lib.rs`
- Verify: `codex-rs/app-server-client/src/gui.rs`
- Verify: `codex-rs/app-server/src/gui_transport.rs`

- [ ] **Step 1: Confirm the current branch is clean except planned docs**

Run from repo root:

```bash
git status --short
```

Expected: no code changes. Untracked or modified docs from the planning work are acceptable; code files should not be dirty before the refactor starts.

- [ ] **Step 2: Capture the current invasive diff size**

Run from repo root:

```bash
git diff --stat rust-v0.130.0 -- \
  codex-rs/app-server/src/in_process.rs \
  codex-rs/app-server-client/src/lib.rs
```

Expected today: `in_process.rs` and `app-server-client/src/lib.rs` show large diffs. Save the output in the implementation notes for comparison after Task 5.

- [ ] **Step 3: Run current app-server-client GUI tests**

Run from `codex-rs`:

```bash
cargo test -p codex-app-server-client gui_launch_url_returns_real_url_for_in_process
cargo test -p codex-app-server-client shutdown_drops_gui_host_manager_before_worker
```

Expected: both tests pass before refactoring. If either fails, stop and diagnose before moving code.

- [ ] **Step 4: Run current in-process extra connection tests**

Run from `codex-rs`:

```bash
cargo test -p codex-app-server register_extra_connection
cargo test -p codex-app-server extra_connection
cargo test -p codex-app-server dropping_extra_handle_triggers_connection_closed
```

Expected: tests matching these names pass. If a filter matches no tests, run:

```bash
cargo test -p codex-app-server in_process
```

Expected: the in-process runtime tests pass.

- [ ] **Step 5: Commit nothing**

This is a baseline task only. Do not commit.

## Task 1: Move GUI Client Extension Logic Out of `lib.rs`

**Files:**
- Modify: `codex-rs/app-server-client/src/gui.rs`
- Modify: `codex-rs/app-server-client/src/lib.rs`
- Test: `codex-rs/app-server-client/src/gui.rs`
- Test: `codex-rs/app-server-client/src/lib.rs`

- [ ] **Step 1: Add or confirm remote unsupported coverage in `gui.rs`**

In `codex-rs/app-server-client/src/gui.rs`, keep the existing unit test and add this test if it does not already exist after moving the remote impl:

```rust
    #[tokio::test]
    async fn remote_gui_launch_url_returns_unsupported() {
        struct UnsupportedRemote;

        impl AppServerClientGuiExt for UnsupportedRemote {
            fn gui_launch_url(
                &self,
                _primary_thread_id: &str,
            ) -> impl std::future::Future<Output = Result<GuiLaunchUrl, GuiLaunchError>> + Send
            {
                std::future::ready(Err(GuiLaunchError::Unsupported))
            }
        }

        let err = UnsupportedRemote
            .gui_launch_url("thread-1")
            .await
            .expect_err("remote GUI launch should be unsupported");
        assert_eq!(err.to_string(), "GUI is not available for this session");
    }
```

This test is intentionally local to `gui.rs`; it verifies the error contract without constructing a remote transport.

- [ ] **Step 2: Move the remote impl from `lib.rs` to `gui.rs`**

Move this implementation out of `codex-rs/app-server-client/src/lib.rs`:

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

Add this equivalent implementation to `codex-rs/app-server-client/src/gui.rs` after the trait definition:

```rust
impl AppServerClientGuiExt for crate::remote::RemoteAppServerClient {
    fn gui_launch_url(
        &self,
        _primary_thread_id: &str,
    ) -> impl std::future::Future<Output = Result<GuiLaunchUrl, GuiLaunchError>> + Send {
        std::future::ready(Err(GuiLaunchError::Unsupported))
    }
}
```

- [ ] **Step 3: Add a crate-private manager accessor in `lib.rs`**

In `impl InProcessAppServerClient`, add a small accessor near `request_handle`:

```rust
    pub(crate) fn gui_host_manager(
        &self,
    ) -> Option<Arc<codex_app_server::gui_host::GuiHostManager>> {
        self.state().gui_host_manager.as_ref().map(Arc::clone)
    }
```

If Task 2 has not introduced `state()` yet, temporarily use the current field shape:

```rust
    pub(crate) fn gui_host_manager(
        &self,
    ) -> Option<Arc<codex_app_server::gui_host::GuiHostManager>> {
        self.gui_host_manager.as_ref().map(Arc::clone)
    }
```

Task 2 will normalize this to the final state helper.

- [ ] **Step 4: Move the in-process GUI extension impl to `gui.rs`**

Remove this implementation from `codex-rs/app-server-client/src/lib.rs`:

```rust
impl crate::gui::AppServerClientGuiExt for InProcessAppServerClient {
    fn gui_launch_url(
        &self,
        primary_thread_id: &str,
    ) -> impl std::future::Future<
        Output = Result<crate::gui::GuiLaunchUrl, crate::gui::GuiLaunchError>,
    > + Send {
        let manager = self.gui_host_manager.as_ref().map(Arc::clone);
        let thread_id = primary_thread_id.to_string();
        async move {
            let Some(manager) = manager else {
                return Err(crate::gui::GuiLaunchError::Transport(std::io::Error::new(
                    ErrorKind::BrokenPipe,
                    "GUI host manager is unavailable after shutdown",
                )));
            };
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

Add this implementation to `codex-rs/app-server-client/src/gui.rs`:

```rust
impl AppServerClientGuiExt for crate::InProcessAppServerClient {
    fn gui_launch_url(
        &self,
        primary_thread_id: &str,
    ) -> impl std::future::Future<Output = Result<GuiLaunchUrl, GuiLaunchError>> + Send {
        let manager = self.gui_host_manager();
        let thread_id = primary_thread_id.to_string();
        async move {
            let Some(manager) = manager else {
                return Err(GuiLaunchError::Transport(std::io::Error::new(
                    std::io::ErrorKind::BrokenPipe,
                    "GUI host manager is unavailable after shutdown",
                )));
            };
            manager
                .launch_url_for_thread(&thread_id)
                .await
                .map(|url| GuiLaunchUrl { url })
                .map_err(|err| GuiLaunchError::Transport(std::io::Error::other(err.to_string())))
        }
    }
}
```

- [ ] **Step 5: Run app-server-client tests**

Run from `codex-rs`:

```bash
cargo test -p codex-app-server-client gui
cargo test -p codex-app-server-client gui_launch_url_returns_real_url_for_in_process
```

Expected: tests pass.

- [ ] **Step 6: Commit Task 1**

```bash
git add codex-rs/app-server-client/src/gui.rs codex-rs/app-server-client/src/lib.rs
git commit -m "refactor(gui): move app-server-client GUI extension"
```

## Task 2: Collapse `InProcessAppServerClient` State Into One Holder

**Files:**
- Modify: `codex-rs/app-server-client/src/lib.rs`
- Test: `codex-rs/app-server-client/src/lib.rs`

- [ ] **Step 1: Introduce `InProcessAppServerClientState`**

Replace the current scattered optional fields:

```rust
pub struct InProcessAppServerClient {
    command_tx: Option<mpsc::Sender<ClientCommand>>,
    event_rx: Option<mpsc::Receiver<InProcessServerEvent>>,
    worker_handle: Option<tokio::task::JoinHandle<()>>,
    gui_host_manager: Option<Arc<codex_app_server::gui_host::GuiHostManager>>,
    #[cfg(test)]
    shutdown_order_probe: Option<ShutdownOrderProbe>,
}
```

with:

```rust
struct InProcessAppServerClientState {
    command_tx: mpsc::Sender<ClientCommand>,
    event_rx: mpsc::Receiver<InProcessServerEvent>,
    worker_handle: tokio::task::JoinHandle<()>,
    gui_host_manager: Option<Arc<codex_app_server::gui_host::GuiHostManager>>,
}

pub struct InProcessAppServerClient {
    state: Option<InProcessAppServerClientState>,
    #[cfg(test)]
    shutdown_order_probe: Option<ShutdownOrderProbe>,
}
```

This preserves a single top-level `Option` for the `Drop` + `shutdown(self)` ownership boundary. `gui_host_manager` remains optional inside the state so lightweight tests can build an `InProcessAppServerClient` without starting a real in-process runtime solely to satisfy GUI manager construction; production `start` always sets it to `Some`.

- [ ] **Step 2: Add state access helpers**

Inside `impl InProcessAppServerClient`, replace `command_tx()` with:

```rust
    fn state(&self) -> &InProcessAppServerClientState {
        self.state
            .as_ref()
            .expect("in-process app-server client state is available until shutdown")
    }

    fn state_mut(&mut self) -> Option<&mut InProcessAppServerClientState> {
        self.state.as_mut()
    }
```

Update the `gui_host_manager` accessor from Task 1 to:

```rust
    pub(crate) fn gui_host_manager(
        &self,
    ) -> Option<Arc<codex_app_server::gui_host::GuiHostManager>> {
        self.state
            .as_ref()
            .and_then(|state| state.gui_host_manager.as_ref().map(Arc::clone))
    }
```

- [ ] **Step 3: Update `start` to construct the state holder**

Replace the `Ok(Self { ... })` block in `InProcessAppServerClient::start` with:

```rust
        Ok(Self {
            state: Some(InProcessAppServerClientState {
                command_tx,
                event_rx,
                worker_handle,
                gui_host_manager: Some(gui_host_manager),
            }),
            #[cfg(test)]
            shutdown_order_probe: None,
        })
```

- [ ] **Step 4: Update request-path callsites to use one state helper**

Use `self.state().command_tx.clone()` or `&self.state().command_tx` instead of a per-field `Option` helper.

Expected shapes:

```rust
    pub fn request_handle(&self) -> InProcessAppServerRequestHandle {
        InProcessAppServerRequestHandle {
            command_tx: self.state().command_tx.clone(),
        }
    }
```

```rust
        self.state()
            .command_tx
            .send(ClientCommand::Request {
                request: Box::new(request),
                response_tx,
            })
            .await
```

Apply the same pattern to:

- `request`
- `notify`
- `resolve_server_request`
- `reject_server_request`

- [ ] **Step 5: Update `next_event`**

Replace:

```rust
        self.event_rx.as_mut()?.recv().await
```

with:

```rust
        self.state_mut()?.event_rx.recv().await
```

This keeps the "None after shutdown" behavior centralized in the single state holder.

- [ ] **Step 6: Update shutdown to take the state once**

Replace `shutdown_inner` with:

```rust
    async fn shutdown_inner(&mut self) -> IoResult<()> {
        let Some(state) = self.state.take() else {
            return Ok(());
        };
        let InProcessAppServerClientState {
            command_tx,
            event_rx,
            mut worker_handle,
            gui_host_manager,
        } = state;

        #[cfg(test)]
        if let Some(probe) = &self.shutdown_order_probe {
            probe.record_manager_shutdown_started();
        }
        if let Some(gui_host_manager) = gui_host_manager {
            gui_host_manager.shutdown().await;
        }

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
        #[cfg(test)]
        if let Some(probe) = &self.shutdown_order_probe {
            probe.record_worker_exited();
        }
        Ok(())
    }
```

- [ ] **Step 7: Update Drop**

Replace the current Drop implementation with:

```rust
impl Drop for InProcessAppServerClient {
    fn drop(&mut self) {
        if let Some(state) = self.state.take() {
            if let Some(gui_host_manager) = state.gui_host_manager {
                gui_host_manager.cancel_nonblocking();
            }
        }
    }
}
```

This keeps non-async cancellation for callers that drop without explicit shutdown.

- [ ] **Step 8: Update tests that manually construct `InProcessAppServerClient`**

For `next_event_surfaces_lagged_markers`, replace the manual struct construction with the single state holder and no GUI manager:

```rust
        let mut client = InProcessAppServerClient {
            state: Some(InProcessAppServerClientState {
                command_tx,
                event_rx,
                worker_handle,
                gui_host_manager: None,
            }),
            shutdown_order_probe: None,
        };
```

If multiple tests need this shape, add a test-only constructor instead:

```rust
    #[cfg(test)]
    fn from_parts_for_test(
        command_tx: mpsc::Sender<ClientCommand>,
        event_rx: mpsc::Receiver<InProcessServerEvent>,
        worker_handle: tokio::task::JoinHandle<()>,
    ) -> Self {
        Self {
            state: Some(InProcessAppServerClientState {
                command_tx,
                event_rx,
                worker_handle,
                gui_host_manager: None,
            }),
            shutdown_order_probe: None,
        }
    }
```

Prefer a small test helper only if it avoids duplicating construction in multiple tests. Do not add a production helper used only once.

- [ ] **Step 9: Run app-server-client tests**

Run from `codex-rs`:

```bash
cargo test -p codex-app-server-client
```

Expected: all app-server-client tests pass.

- [ ] **Step 10: Commit Task 2**

```bash
git add codex-rs/app-server-client/src/lib.rs codex-rs/app-server-client/src/gui.rs
git commit -m "refactor(app-server-client): isolate GUI client state"
```

## Task 3: Create `in_process_extra.rs` and Move Handle Types

**Files:**
- Create: `codex-rs/app-server/src/in_process_extra.rs`
- Modify: `codex-rs/app-server/src/lib.rs`
- Modify: `codex-rs/app-server/src/in_process.rs`
- Test: `codex-rs/app-server/src/in_process_extra.rs`

- [ ] **Step 1: Add module declaration**

In `codex-rs/app-server/src/lib.rs`, add a crate-private module declaration next to `pub mod in_process;`:

```rust
mod in_process_extra;
pub mod in_process;
```

If rustfmt reorders adjacent module lines, keep `in_process_extra` private and `in_process` public.

- [ ] **Step 2: Create the new module with moved public handle types**

Create `codex-rs/app-server/src/in_process_extra.rs` with the moved handle and sender definitions:

```rust
use std::io::Error as IoError;
use std::io::ErrorKind;
use std::io::Result as IoResult;
use std::sync::atomic::AtomicU64;
use std::sync::atomic::Ordering;

use codex_app_server_protocol::JSONRPCNotification;
use codex_app_server_protocol::JSONRPCRequest;
use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;
use tracing::warn;

use crate::outgoing_message::ConnectionId;

static EXTRA_CONNECTION_ID_COUNTER: AtomicU64 = AtomicU64::new(1);

pub(crate) fn next_extra_connection_id(main_connection_id: ConnectionId) -> ConnectionId {
    loop {
        let raw = EXTRA_CONNECTION_ID_COUNTER.fetch_add(1, Ordering::Relaxed);
        if raw != main_connection_id.0 {
            break ConnectionId(raw);
        }
    }
}

pub enum ExtraConnectionCommand {
    Opened {
        connection_id: ConnectionId,
        outgoing_tx: mpsc::Sender<String>,
        disconnect_token: CancellationToken,
    },
    Request {
        connection_id: ConnectionId,
        request: Box<JSONRPCRequest>,
    },
    Notification {
        connection_id: ConnectionId,
        notification: JSONRPCNotification,
    },
    Closed {
        connection_id: ConnectionId,
    },
}

/// Handle returned by `InProcessClientSender::register_extra_connection`.
///
/// Dropping the handle issues a best-effort close command for this extra
/// connection. Transport-specific concerns belong in callers layered above this
/// neutral registration API.
pub struct ExtraConnectionHandle {
    pub connection_id: ConnectionId,
    pub command_sender: ExtraConnectionCommandSender,
    pub outgoing_tx: mpsc::Sender<String>,
    pub outgoing_rx: mpsc::Receiver<String>,
    pub disconnect_token: CancellationToken,
}

#[derive(Clone)]
pub struct ExtraConnectionCommandSender {
    inner: mpsc::Sender<crate::in_process::InProcessClientMessage>,
    connection_id: ConnectionId,
    runtime_handle: Option<tokio::runtime::Handle>,
}
```

If `InProcessClientMessage` remains private to `in_process.rs`, change its visibility to `pub(crate)` in Step 3. Keep it crate-private, not public API.

- [ ] **Step 3: Make `InProcessClientMessage` crate-visible**

In `codex-rs/app-server/src/in_process.rs`, change:

```rust
enum InProcessClientMessage {
```

to:

```rust
pub(crate) enum InProcessClientMessage {
```

This is required only because `ExtraConnectionCommandSender` now lives in a sibling module.

- [ ] **Step 4: Finish sender and Drop implementations in the new module**

Add to `in_process_extra.rs`:

```rust
impl ExtraConnectionCommandSender {
    pub(crate) fn new(
        inner: mpsc::Sender<crate::in_process::InProcessClientMessage>,
        connection_id: ConnectionId,
        runtime_handle: Option<tokio::runtime::Handle>,
    ) -> Self {
        Self {
            inner,
            connection_id,
            runtime_handle,
        }
    }

    pub fn send_request(&self, request: JSONRPCRequest) -> IoResult<()> {
        self.try_send(crate::in_process::InProcessClientMessage::Extra(
            ExtraConnectionCommand::Request {
                connection_id: self.connection_id,
                request: Box::new(request),
            },
        ))
    }

    pub fn send_notification(&self, notification: JSONRPCNotification) -> IoResult<()> {
        self.try_send(crate::in_process::InProcessClientMessage::Extra(
            ExtraConnectionCommand::Notification {
                connection_id: self.connection_id,
                notification,
            },
        ))
    }

    fn try_send(&self, message: crate::in_process::InProcessClientMessage) -> IoResult<()> {
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
        let close_msg = crate::in_process::InProcessClientMessage::Extra(
            ExtraConnectionCommand::Closed {
                connection_id: self.connection_id,
            },
        );
        match self.command_sender.inner.try_send(close_msg) {
            Ok(()) => {}
            Err(mpsc::error::TrySendError::Full(msg)) => {
                let sender = self.command_sender.inner.clone();
                if let Some(runtime_handle) = self.command_sender.runtime_handle.as_ref() {
                    runtime_handle.spawn(async move {
                        let _ = sender.send(msg).await;
                    });
                } else {
                    warn!(
                        connection_id = ?self.connection_id,
                        "dropping extra connection close command without Tokio runtime handle"
                    );
                }
            }
            Err(mpsc::error::TrySendError::Closed(_)) => {}
        }
    }
}
```

- [ ] **Step 5: Re-export handle types from `in_process.rs`**

At the top of `codex-rs/app-server/src/in_process.rs`, add:

```rust
pub use crate::in_process_extra::ExtraConnectionCommandSender;
pub use crate::in_process_extra::ExtraConnectionHandle;
```

Remove the moved struct definitions from `in_process.rs`.

- [ ] **Step 6: Replace explicit client-message variants with one wrapper**

In `InProcessClientMessage`, replace:

```rust
    ExtraConnectionOpened { ... },
    ExtraRequest { ... },
    ExtraNotification { ... },
    ExtraConnectionClosed { ... },
```

with:

```rust
    Extra(crate::in_process_extra::ExtraConnectionCommand),
```

Update all local matches and sends to use the wrapper. If this causes excessive churn during implementation, keep the explicit variants for this task and move to the wrapper in Task 4.

- [ ] **Step 7: Update `register_extra_connection` to use moved helpers**

In `InProcessClientSender::register_extra_connection`, use:

```rust
        let connection_id =
            crate::in_process_extra::next_extra_connection_id(IN_PROCESS_CONNECTION_ID);
```

Construct the command sender with:

```rust
            command_sender: crate::in_process_extra::ExtraConnectionCommandSender::new(
                self.client_tx.clone(),
                connection_id,
                runtime_handle,
            ),
```

Send open with:

```rust
            .send(InProcessClientMessage::Extra(
                crate::in_process_extra::ExtraConnectionCommand::Opened {
                    connection_id,
                    outgoing_tx: outgoing_tx.clone(),
                    disconnect_token: disconnect_token.clone(),
                },
            ))
```

- [ ] **Step 8: Move handle-focused tests**

Move these tests from `in_process.rs` to `in_process_extra.rs` where possible:

- `register_extra_connection_allocates_ids_starting_above_main`
- `dropping_extra_connection_handle_sends_closed_command`
- `dropping_extra_connection_handle_under_backpressure_still_delivers_closed`

Tests that require `start_test_client` can remain in `in_process.rs` until Task 5.

- [ ] **Step 9: Run focused tests**

Run from `codex-rs`:

```bash
cargo test -p codex-app-server dropping_extra_connection_handle_sends_closed_command
cargo test -p codex-app-server dropping_extra_connection_handle_under_backpressure_still_delivers_closed
cargo test -p codex-app-server register_extra_connection_allocates_ids_starting_above_main
```

Expected: tests pass.

- [ ] **Step 10: Commit Task 3**

```bash
git add codex-rs/app-server/src/lib.rs codex-rs/app-server/src/in_process.rs codex-rs/app-server/src/in_process_extra.rs
git commit -m "refactor(app-server): move extra connection handles"
```

## Task 4: Move Outbound Control and Writer Bridge

**Files:**
- Modify: `codex-rs/app-server/src/in_process_extra.rs`
- Modify: `codex-rs/app-server/src/in_process.rs`
- Test: `codex-rs/app-server/src/in_process_extra.rs`
- Test: `codex-rs/app-server/src/in_process.rs`

- [ ] **Step 1: Move `OutboundControl` to the new module**

Add to `in_process_extra.rs`:

```rust
use std::collections::HashMap;
use std::collections::HashSet;
use std::sync::Arc;
use std::sync::RwLock;
use std::sync::atomic::AtomicBool;

use crate::outgoing_message::QueuedOutgoingMessage;
use crate::transport::OutboundConnectionState;

pub(crate) enum OutboundControl {
    Register {
        connection_id: ConnectionId,
        writer: mpsc::Sender<QueuedOutgoingMessage>,
        initialized: Arc<AtomicBool>,
        experimental_api_enabled: Arc<AtomicBool>,
        opted_out_notification_methods: Arc<RwLock<HashSet<String>>>,
        disconnect_sender: Option<CancellationToken>,
    },
    Unregister {
        connection_id: ConnectionId,
    },
}
```

Remove the old `OutboundControl` enum from `in_process.rs`.

- [ ] **Step 2: Move outbound control handler**

Add to `in_process_extra.rs`:

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

In `in_process.rs`, update calls to:

```rust
crate::in_process_extra::handle_outbound_control(&mut outbound_connections, control);
```

- [ ] **Step 3: Move writer bridge**

Add to `in_process_extra.rs`:

```rust
pub(crate) fn spawn_extra_writer_bridge(
    connection_id: ConnectionId,
    outgoing_tx: mpsc::Sender<String>,
    mut writer_rx: mpsc::Receiver<QueuedOutgoingMessage>,
) {
    tokio::spawn(async move {
        while let Some(queued) = writer_rx.recv().await {
            let serialized = match serde_json::to_string(&queued.message) {
                Ok(text) => text,
                Err(err) => {
                    tracing::error!(
                        connection_id = ?connection_id,
                        "failed to serialize extra outgoing message: {err}",
                    );
                    continue;
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

Remove the old `spawn_extra_writer_bridge` from `in_process.rs`.

- [ ] **Step 4: Update open / close branches in `in_process.rs`**

Use module-qualified types:

```rust
let (outbound_control_tx, mut outbound_control_rx) =
    mpsc::channel::<crate::in_process_extra::OutboundControl>(channel_capacity);
```

When opening an extra connection, send:

```rust
crate::in_process_extra::OutboundControl::Register { ... }
```

When closing an extra connection, send:

```rust
crate::in_process_extra::OutboundControl::Unregister { connection_id }
```

- [ ] **Step 5: Run focused runtime tests**

Run from `codex-rs`:

```bash
cargo test -p codex-app-server extra_connection_request_reaches_message_processor
cargo test -p codex-app-server register_and_unregister_progress_under_sustained_outgoing_load
cargo test -p codex-app-server dropping_extra_handle_triggers_connection_closed
```

Expected: tests pass.

- [ ] **Step 6: Commit Task 4**

```bash
git add codex-rs/app-server/src/in_process.rs codex-rs/app-server/src/in_process_extra.rs
git commit -m "refactor(app-server): move extra outbound routing"
```

## Task 5: Move Processor-Side Extra Connection State

**Files:**
- Modify: `codex-rs/app-server/src/in_process_extra.rs`
- Modify: `codex-rs/app-server/src/in_process.rs`
- Test: `codex-rs/app-server/src/in_process.rs`

- [ ] **Step 1: Add `ExtraConnectionState`**

In `in_process_extra.rs`, add:

```rust
use crate::message_processor::ConnectionSessionState;
use crate::message_processor::MessageProcessor;

pub(crate) struct ExtraConnectionState {
    entries: HashMap<ConnectionId, ExtraConnectionEntry>,
    #[cfg(test)]
    closed_probe_tx: Option<mpsc::Sender<ConnectionId>>,
}

struct ExtraConnectionEntry {
    session_state: Arc<ConnectionSessionState>,
    outbound_initialized: Arc<AtomicBool>,
    outbound_experimental_api_enabled: Arc<AtomicBool>,
    outbound_opted_out_notification_methods: Arc<RwLock<HashSet<String>>>,
}
```

- [ ] **Step 2: Add constructors**

Add:

```rust
impl ExtraConnectionState {
    pub(crate) fn new() -> Self {
        Self {
            entries: HashMap::new(),
            #[cfg(test)]
            closed_probe_tx: None,
        }
    }

    #[cfg(test)]
    pub(crate) fn with_closed_probe(closed_probe_tx: mpsc::Sender<ConnectionId>) -> Self {
        Self {
            entries: HashMap::new(),
            closed_probe_tx: Some(closed_probe_tx),
        }
    }
}
```

- [ ] **Step 3: Add `initialized_connection_ids` helper**

Add:

```rust
    pub(crate) fn initialized_connection_ids(
        &self,
        main_connection_id: ConnectionId,
        main_initialized: bool,
    ) -> Vec<ConnectionId> {
        let mut connection_ids = Vec::new();
        if main_initialized {
            connection_ids.push(main_connection_id);
        }
        for (connection_id, entry) in &self.entries {
            if entry.session_state.initialized() {
                connection_ids.push(*connection_id);
            }
        }
        connection_ids
    }
```

- [ ] **Step 4: Add processor command handler**

Add:

```rust
    pub(crate) async fn handle_processor_command(
        &mut self,
        processor: &Arc<MessageProcessor>,
        command: ExtraConnectionCommand,
    ) {
        match command {
            ExtraConnectionCommand::Opened { .. } => {
                unreachable!("open commands are expanded before processor dispatch");
            }
            ExtraConnectionCommand::Request {
                connection_id,
                request,
            } => {
                let Some(entry) = self.entries.get(&connection_id) else {
                    tracing::warn!(?connection_id, "dropping extra request for unknown connection");
                    return;
                };
                let session_state = Arc::clone(&entry.session_state);
                let outbound_initialized = Arc::clone(&entry.outbound_initialized);
                let outbound_experimental_api_enabled =
                    Arc::clone(&entry.outbound_experimental_api_enabled);
                let outbound_opted_out_notification_methods =
                    Arc::clone(&entry.outbound_opted_out_notification_methods);

                processor
                    .process_request(
                        connection_id,
                        *request,
                        &crate::transport::AppServerTransport::Off,
                        Arc::clone(&session_state),
                    )
                    .await;

                let opted_out_snapshot = session_state.opted_out_notification_methods();
                if let Ok(mut opted_out) = outbound_opted_out_notification_methods.write() {
                    *opted_out = opted_out_snapshot;
                } else {
                    tracing::warn!(
                        ?connection_id,
                        "failed to mirror extra connection opted-out list"
                    );
                }
                outbound_experimental_api_enabled.store(
                    session_state.experimental_api_enabled(),
                    Ordering::Release,
                );
                let is_initialized = session_state.initialized();
                let was_initialized = outbound_initialized.swap(is_initialized, Ordering::AcqRel);
                if !was_initialized && is_initialized {
                    processor.connection_initialized(connection_id).await;
                }
            }
            ExtraConnectionCommand::Notification {
                connection_id,
                notification,
            } => {
                if !self.entries.contains_key(&connection_id) {
                    tracing::warn!(
                        ?connection_id,
                        "dropping extra notification for unknown connection"
                    );
                    return;
                }
                processor.process_notification(notification).await;
            }
            ExtraConnectionCommand::Closed { connection_id } => {
                if let Some(entry) = self.entries.remove(&connection_id) {
                    processor
                        .connection_closed(connection_id, &entry.session_state)
                        .await;
                    #[cfg(test)]
                    if let Some(closed_probe_tx) = &self.closed_probe_tx {
                        let _ = closed_probe_tx.try_send(connection_id);
                    }
                } else {
                    tracing::warn!(?connection_id, "ExtraConnectionClosed for unknown connection");
                }
            }
        }
    }
```

- [ ] **Step 5: Add open registration helper**

Add:

```rust
    pub(crate) fn register_opened(
        &mut self,
        connection_id: ConnectionId,
        outbound_initialized: Arc<AtomicBool>,
        outbound_experimental_api_enabled: Arc<AtomicBool>,
        outbound_opted_out_notification_methods: Arc<RwLock<HashSet<String>>>,
    ) {
        self.entries.insert(
            connection_id,
            ExtraConnectionEntry {
                session_state: Arc::new(ConnectionSessionState::new()),
                outbound_initialized,
                outbound_experimental_api_enabled,
                outbound_opted_out_notification_methods,
            },
        );
    }
```

- [ ] **Step 6: Use `ExtraConnectionState` in `in_process.rs`**

Replace local inline state:

```rust
            struct ExtraConnectionEntry { ... }
            let mut extra_connections = HashMap::<ConnectionId, ExtraConnectionEntry>::new();
```

with:

```rust
            let mut extra_connections = {
                #[cfg(test)]
                {
                    crate::in_process_extra::ExtraConnectionState::with_closed_probe(
                        extra_connection_closed_probe_tx,
                    )
                }
                #[cfg(not(test))]
                {
                    crate::in_process_extra::ExtraConnectionState::new()
                }
            };
```

If `cfg` expression placement is awkward, create the state before spawning the processor task and move it into the task.

- [ ] **Step 7: Delegate extra processor commands**

In the processor `match`, replace the extra request / notification / closed arms with:

```rust
                            Some(ProcessorCommand::Extra(command)) => {
                                extra_connections
                                    .handle_processor_command(&processor, command)
                                    .await;
                            }
```

For open, either keep a small explicit arm:

```rust
                            Some(ProcessorCommand::ExtraConnectionOpened {
                                connection_id,
                                outbound_initialized,
                                outbound_experimental_api_enabled,
                                outbound_opted_out_notification_methods,
                            }) => {
                                extra_connections.register_opened(
                                    connection_id,
                                    outbound_initialized,
                                    outbound_experimental_api_enabled,
                                    outbound_opted_out_notification_methods,
                                );
                            }
```

or model it as an `ExtraConnectionCommand::OpenedForProcessor` if that is cleaner. Do not keep request / notification / close bodies inline.

- [ ] **Step 8: Use connection id helper for thread creation**

Replace:

```rust
                                let mut connection_ids = Vec::new();
                                if session.initialized() {
                                    connection_ids.push(IN_PROCESS_CONNECTION_ID);
                                }
                                for (extra_connection_id, extra_entry) in &extra_connections {
                                    if extra_entry.session_state.initialized() {
                                        connection_ids.push(*extra_connection_id);
                                    }
                                }
```

with:

```rust
                                let connection_ids = extra_connections.initialized_connection_ids(
                                    IN_PROCESS_CONNECTION_ID,
                                    session.initialized(),
                                );
```

- [ ] **Step 9: Run app-server tests**

Run from `codex-rs`:

```bash
cargo test -p codex-app-server extra_connection_request_reaches_message_processor
cargo test -p codex-app-server extra_connection_notification_is_accepted
cargo test -p codex-app-server dropping_extra_handle_triggers_connection_closed
cargo test -p codex-app-server in_process_start_initializes_and_handles_typed_v2_request
```

Expected: all pass.

- [ ] **Step 10: Commit Task 5**

```bash
git add codex-rs/app-server/src/in_process.rs codex-rs/app-server/src/in_process_extra.rs
git commit -m "refactor(app-server): isolate extra connection state"
```

## Task 6: Move Remaining Tests and Verify Diff Reduction

**Files:**
- Modify: `codex-rs/app-server/src/in_process.rs`
- Modify: `codex-rs/app-server/src/in_process_extra.rs`
- Modify: `codex-rs/app-server-client/src/lib.rs`
- Modify: `codex-rs/app-server-client/src/gui.rs`

- [ ] **Step 1: Move unit-only tests out of `in_process.rs`**

Move tests that do not require the full in-process runtime into `in_process_extra.rs`.

Keep these in `in_process.rs` because they exercise the full runtime:

- `extra_connection_request_reaches_message_processor`
- `extra_connection_notification_is_accepted`
- `register_and_unregister_progress_under_sustained_outgoing_load`
- `dropping_extra_handle_triggers_connection_closed`
- existing main-connection tests

- [ ] **Step 2: Run rustfmt**

Run from `codex-rs`:

```bash
just fmt
```

Expected: formatting succeeds.

- [ ] **Step 3: Run app-server-client tests**

Run from `codex-rs`:

```bash
cargo test -p codex-app-server-client
```

Expected: all tests pass.

- [ ] **Step 4: Run app-server focused tests**

Run from `codex-rs`:

```bash
cargo test -p codex-app-server in_process
cargo test -p codex-app-server extra_connection
```

Expected: all matching tests pass. If a filter matches no tests because names moved, run:

```bash
cargo test -p codex-app-server register_extra_connection
cargo test -p codex-app-server dropping_extra
```

Expected: all matching tests pass.

- [ ] **Step 5: Run scoped lint for touched projects**

Run from `codex-rs`:

```bash
just fix -p codex-app-server-client
just fix -p codex-app-server
```

Expected: lint completes or applies small formatting/clippy fixes. Do not rerun tests after `just fix`, per repo instruction.

If `just fix` fails with Cargo locking / TCP bind environment errors, run:

```bash
cargo clippy --tests -p codex-app-server-client
cargo clippy --tests -p codex-app-server
```

Expected: clippy passes, or the environment limitation is recorded in the final notes.

- [ ] **Step 6: Check old-file diff shape**

Run from repo root:

```bash
git diff --stat rust-v0.130.0 -- \
  codex-rs/app-server/src/in_process.rs \
  codex-rs/app-server-client/src/lib.rs
```

Expected: diff size is materially smaller than the baseline from Task 0, especially in `app-server-client/src/lib.rs`.

Then run:

```bash
git diff --unified=20 rust-v0.130.0 -- \
  codex-rs/app-server/src/in_process.rs \
  codex-rs/app-server-client/src/lib.rs
```

Expected:

- `in_process.rs` shows hook points and delegation, not full extra connection implementation.
- `app-server-client/src/lib.rs` shows module exports, manager construction, state holder, shutdown ordering, and accessor; it does not show repeated callsite churn for every command path.

- [ ] **Step 7: Check for forbidden GUI terms in `in_process.rs`**

Run from repo root:

```bash
rg -n "gui|Gui|websocket|WebSocket|allowlist|Origin|browser" codex-rs/app-server/src/in_process.rs
```

Expected: no matches, except comments or test names that pre-existed and are not part of the extra connection registration API. If new matches exist, move that logic to `gui_host.rs`, `gui_transport.rs`, or tests outside `in_process.rs`.

- [ ] **Step 8: Check whitespace**

Run from repo root:

```bash
git diff --check
```

Expected: no whitespace errors.

- [ ] **Step 9: Commit Task 6**

```bash
git add codex-rs/app-server/src/in_process.rs \
  codex-rs/app-server/src/in_process_extra.rs \
  codex-rs/app-server-client/src/lib.rs \
  codex-rs/app-server-client/src/gui.rs
git commit -m "refactor(gui): reduce in-process bridge intrusion"
```

## Task 7: Final Self-Review Against the Design

**Files:**
- Verify: `docs/superpowers/specs/2026-05-13-gui-host-low-intrusion-refactor-design.md`
- Verify: `codex-rs/app-server/src/in_process.rs`
- Verify: `codex-rs/app-server/src/in_process_extra.rs`
- Verify: `codex-rs/app-server-client/src/lib.rs`
- Verify: `codex-rs/app-server-client/src/gui.rs`

- [ ] **Step 1: Verify old-file responsibilities**

Read `codex-rs/app-server/src/in_process.rs`.

Expected:

- It owns the runtime task.
- It owns the `MessageProcessor` construction.
- It owns the existing `outbound_connections` HashMap.
- Extra connection implementation details are delegated to `crate::in_process_extra`.
- It contains no GUI-specific concepts.

- [ ] **Step 2: Verify new module responsibilities**

Read `codex-rs/app-server/src/in_process_extra.rs`.

Expected:

- It does not depend on `codex-gui-host`.
- It owns extra connection handle, command sender, state, outbound control, and writer bridge.
- It uses raw `JSONRPCRequest` / `JSONRPCNotification` for extra traffic.
- It does not create a separate `MessageProcessor` or separate outbound router.

- [ ] **Step 3: Verify client facade responsibilities**

Read `codex-rs/app-server-client/src/lib.rs`.

Expected:

- It exports `gui`.
- It constructs `GuiHostManager` from `handle.sender()`.
- It provides a small crate-private accessor for `gui.rs`.
- It preserves existing request / notify / resolve / reject semantics.
- GUI shutdown happens before worker shutdown.

- [ ] **Step 4: Verify GUI extension responsibilities**

Read `codex-rs/app-server-client/src/gui.rs`.

Expected:

- It defines `GuiLaunchUrl`, `GuiLaunchError`, and `AppServerClientGuiExt`.
- It implements remote unsupported behavior.
- It implements in-process launch URL behavior through the accessor.
- It does not own worker shutdown logic.

- [ ] **Step 5: Generate final diff summary**

Run from repo root:

```bash
git diff --stat rust-v0.130.0 -- \
  codex-rs/app-server/src/in_process.rs \
  codex-rs/app-server/src/in_process_extra.rs \
  codex-rs/app-server-client/src/lib.rs \
  codex-rs/app-server-client/src/gui.rs
```

Expected: most new complexity is visible in `in_process_extra.rs` and `gui.rs`, not the two old files.

- [ ] **Step 6: Final commit if needed**

If Task 7 found only review/doc note changes, commit them:

```bash
git add docs/superpowers/plans/2026-05-11-gui-host/07-low-intrusion-refactor.md
git commit -m "docs(gui-host): add low-intrusion refactor plan"
```

If no files changed during Task 7, do not create an empty commit.

## Acceptance Gates

- `codex-rs/app-server/src/in_process_extra.rs` exists and owns extra connection implementation details.
- `codex-rs/app-server/src/in_process.rs` has no GUI / WebSocket / allowlist / Origin logic.
- `codex-rs/app-server-client/src/gui.rs` owns the GUI extension trait impls.
- `codex-rs/app-server-client/src/lib.rs` no longer has scattered `Option` fields for `command_tx`, `event_rx`, and `worker_handle`; `gui_host_manager` is optional only inside the single state holder.
- `cargo test -p codex-app-server-client` passes.
- App-server targeted in-process / extra connection tests pass.
- `just fmt` has been run.
- `just fix -p codex-app-server-client` and `just fix -p codex-app-server` have been run, or an environment-specific blocker is documented.
- `git diff --check` passes.
- The old-file diff shape is materially smaller and easier to merge during future upstream tag sync.

## Self-Review Checklist

- [ ] The plan keeps the original GUI host ownership model.
- [ ] The plan does not ask workers to route GUI traffic through TUI.
- [ ] The plan does not introduce a second app-server runtime or second outbound router.
- [ ] Every new file has a clear single responsibility.
- [ ] Every old-file change is a hook, accessor, construction point, or test.
- [ ] Tests protect both main connection behavior and extra connection behavior.
- [ ] No task requires modifying `CODEX_SANDBOX_NETWORK_DISABLED_ENV_VAR` or `CODEX_SANDBOX_ENV_VAR`.
