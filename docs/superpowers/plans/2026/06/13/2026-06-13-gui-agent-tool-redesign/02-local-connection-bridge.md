# GUI Agent Tool Local Connection Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 GUI WebSocket 使用的 extra JSON-RPC connection 抽成 app-server-local bridge，使 stdio subprocess app-server 也能接入 GUI browser connection。

**Architecture:** 复用现有 `in_process_extra` 的低侵入思想，但让 bridge 能由 app-server runtime 自己持有和注入。`GuiTransportBackend` 不再硬依赖 `InProcessClientSender`；它依赖一个 app-server-local connection opener。

**Tech Stack:** Rust 2024, tokio mpsc, CancellationToken, codex-app-server-protocol JSON-RPC, codex-gui-host `GuiBackend`.

---

## Files

- Modify: `codex-rs/app-server/src/in_process_extra.rs`
- Create or Modify: `codex-rs/app-server/src/gui_connection_bridge.rs`
- Modify: `codex-rs/app-server/src/gui_transport.rs`
- Modify: `codex-rs/app-server/src/lib.rs`
- Modify only if needed as thin hook: `codex-rs/app-server/src/in_process.rs`
- Test: `codex-rs/app-server/src/gui_transport.rs` tests or `codex-rs/app-server/src/gui_connection_bridge.rs` tests

## Task 1: Define Bridge Trait And Handle

- [ ] **Step 1: Write failing bridge API test**

Add a test in `codex-rs/app-server/src/gui_connection_bridge.rs`:

```rust
#[cfg(test)]
mod tests {
    use codex_app_server_protocol::JSONRPC_VERSION;
    use codex_gui_host::AuthenticatedGuiConnection;
    use pretty_assertions::assert_eq;
    use tokio::time::Duration;

    use super::*;

    #[tokio::test]
    async fn local_gui_connection_round_trips_initialize() {
        let bridge = test_support::start_local_bridge_for_test().await;
        let backend = GuiConnectionBridgeBackend::new(bridge.opener());
        let (connection, inbound_tx, mut outbound_rx) = AuthenticatedGuiConnection::new();
        let task = tokio::spawn(async move { backend.connect(connection).await });

        inbound_tx
            .send(
                serde_json::json!({
                    "jsonrpc": JSONRPC_VERSION,
                    "id": 1,
                    "method": "initialize",
                    "params": {
                        "clientInfo": { "name": "gui-bridge-test", "version": "0.0.0" }
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
        let value: serde_json::Value = serde_json::from_str(&response).expect("valid JSON");
        assert_eq!(value["jsonrpc"], JSONRPC_VERSION);
        assert_eq!(value["id"], 1);
        assert!(value.get("result").is_some());

        drop(inbound_tx);
        task.await
            .expect("backend task should join")
            .expect("backend should finish cleanly");
        bridge.shutdown().await;
    }
}
```

Expected initial result: compile fails because `GuiConnectionBridgeBackend`, `test_support::start_local_bridge_for_test`, and `opener()` do not exist.

- [ ] **Step 2: Add bridge opener trait**

Create `codex-rs/app-server/src/gui_connection_bridge.rs` with this core API:

```rust
use std::io;
use std::sync::Arc;

use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;

use crate::outgoing_message::ConnectionId;

pub(crate) trait LocalGuiConnectionOpener: Send + Sync {
    fn open_gui_connection(
        &self,
        outgoing_tx: mpsc::Sender<String>,
    ) -> io::Result<LocalGuiConnectionHandle>;
}

pub(crate) struct LocalGuiConnectionHandle {
    connection_id: ConnectionId,
    disconnect_token: CancellationToken,
    close: Arc<dyn Fn(ConnectionId) + Send + Sync>,
}

impl LocalGuiConnectionHandle {
    pub(crate) fn connection_id(&self) -> ConnectionId {
        self.connection_id
    }

    pub(crate) fn disconnect_token(&self) -> CancellationToken {
        self.disconnect_token.clone()
    }
}

impl Drop for LocalGuiConnectionHandle {
    fn drop(&mut self) {
        (self.close)(self.connection_id);
        self.disconnect_token.cancel();
    }
}
```

- [ ] **Step 3: Wire module**

Edit `codex-rs/app-server/src/lib.rs`:

```rust
mod gui_connection_bridge;
```

Do not make the module public.

## Task 2: Adapt Existing Extra Connection Sender

- [ ] **Step 1: Implement opener for current in-process sender**

In `gui_connection_bridge.rs`, add an adapter that wraps existing `in_process_extra::ExtraConnectionCommandSender` or `InProcessClientSender` only at the edge:

```rust
#[derive(Clone)]
pub(crate) struct ExtraConnectionLocalGuiOpener {
    sender: crate::in_process_extra::ExtraConnectionCommandSender,
}

impl ExtraConnectionLocalGuiOpener {
    pub(crate) fn new(sender: crate::in_process_extra::ExtraConnectionCommandSender) -> Self {
        Self { sender }
    }
}

impl LocalGuiConnectionOpener for ExtraConnectionLocalGuiOpener {
    fn open_gui_connection(
        &self,
        outgoing_tx: mpsc::Sender<String>,
    ) -> io::Result<LocalGuiConnectionHandle> {
        let handle = self.sender.open(outgoing_tx)?;
        Ok(LocalGuiConnectionHandle {
            connection_id: handle.connection_id(),
            disconnect_token: handle.disconnect_token(),
            close: Arc::new({
                let sender = self.sender.clone();
                move |connection_id| sender.close_best_effort(connection_id)
            }),
        })
    }
}
```

If `ExtraConnectionCommandSender::close_best_effort` or `disconnect_token` is private, expose only crate-private methods needed by this adapter. Do not expose GUI-specific methods from `in_process_extra.rs`.

- [ ] **Step 2: Keep `InProcessClientSender` compatibility**

If TUI in-process still needs `InProcessClientSender::register_extra_connection`, keep it as a thin wrapper that delegates to the same `ExtraConnectionCommandSender`. Do not let `GuiTransportBackend` depend on it.

## Task 3: Move GUI Backend To The Bridge

- [ ] **Step 1: Replace sender dependency in `gui_transport.rs`**

Change `GuiTransportBackend` shape from `InProcessClientSender` to opener:

```rust
#[derive(Clone)]
pub(crate) struct GuiTransportBackend {
    opener: Arc<dyn crate::gui_connection_bridge::LocalGuiConnectionOpener>,
}

impl GuiTransportBackend {
    pub(crate) fn new(
        opener: Arc<dyn crate::gui_connection_bridge::LocalGuiConnectionOpener>,
    ) -> Self {
        Self { opener }
    }
}
```

The `GuiBackend::connect` implementation should:

- call `self.opener.open_gui_connection(connection.outbound_tx.clone())`;
- forward GUI inbound request/notification text into the opened connection command sender;
- ignore browser response/error messages;
- stop when GUI inbound closes or disconnect token fires.

Preserve current JSON-RPC parsing behavior and warning on invalid text.

- [ ] **Step 2: Run focused bridge tests**

Run from `codex-rs`:

```bash
just test -p codex-app-server gui_transport
```

Expected: bridge/backend tests pass. If the exact filter does not match, run the narrowest app-server test target that includes `gui_transport` or `gui_connection_bridge` tests.

## Task 4: Commit

- [ ] **Step 1: Format app-server**

Run:

```bash
cd codex-rs
just fmt
```

Expected: formatting completes.

- [ ] **Step 2: Commit bridge changes**

Run:

```bash
git status --short
git add codex-rs/app-server/src/gui_connection_bridge.rs \
  codex-rs/app-server/src/gui_transport.rs \
  codex-rs/app-server/src/in_process_extra.rs \
  codex-rs/app-server/src/in_process.rs \
  codex-rs/app-server/src/lib.rs
git commit -m "refactor(gui): add app-server local gui connection bridge"
```

Expected: one focused bridge commit. Do not include extension or TUI changes.
