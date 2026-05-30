# Codex GUI In-Process Extra Connection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `codex-app-server` 中加入 GUI-agnostic extra in-process connection API，让后续 `gui_transport.rs` 能把认证后的 browser WebSocket 接入现有 `MessageProcessor` / `outbound_connections`。

**Architecture:** 当前 `dev` 直接采用 low-intrusion 形态：`in_process_extra.rs` 承载 extra connection 的 ID、handle、command sender、outbound control、writer bridge 和 per-connection session state；`in_process.rs` 只保留 thin hook：注册入口、processor command 分派、outbound control 分支、thread-created listener 的 connection id 扩展。这个计划不写 GUI、WebSocket、Origin、token、allowlist，也不碰 `codex-app-server-client` facade。

**Tech Stack:** Rust 2024, tokio, codex-app-server, codex-app-server-protocol.

---

## Source Of Truth

- Roadmap: `docs/superpowers/plans/2026-05-30-gui-host/00-roadmap.md`
- 主设计：`docs/superpowers/specs/2026-05-11-codex-gui-host-redesign.md`
- low-intrusion 设计：
  - `docs/superpowers/specs/2026-05-13-gui-host-low-intrusion-refactor-design.md`
  - `docs/superpowers/specs/2026-05-13-gui-host-extra-open-hook-thinning-design.md`
- 旧分支基础计划：`port/lazy-proj-130:docs/superpowers/plans/2026-05-11-gui-host/06-in-process-gui-launch.md`
- 旧分支薄化计划：`port/lazy-proj-130:docs/superpowers/plans/2026-05-11-gui-host/07-low-intrusion-refactor.md`
- 旧分支最终实现：
  - `port/lazy-proj-130:codex-rs/app-server/src/in_process_extra.rs`
  - `port/lazy-proj-130:codex-rs/app-server/src/in_process.rs`

## Scope

### In Scope

- Create: `codex-rs/app-server/src/in_process_extra.rs`
- Modify: `codex-rs/app-server/src/in_process.rs`
- Modify: `codex-rs/app-server/src/lib.rs`

### Out Of Scope

- 不写 `codex-rs/app-server/src/gui_host.rs`
- 不写 `codex-rs/app-server/src/gui_transport.rs`
- 不写 `codex-rs/app-server-client/src/gui.rs`
- 不改 `codex-rs/app-server-client/src/lib.rs`
- 不写 TUI `/gui`
- 不改 `codex-gui/**`
- 不使用 `TransportEvent`
- 不实现 detach/viewer/recovery

## Hard Constraints

- `in_process.rs` 中新增符号必须是 GUI-agnostic：不能出现 `gui`、`websocket`、`origin`、`token`、`allowlist`、`browser`。
- 不改变主 TUI in-process connection 的外部行为：
  - `InProcessClientHandle::{request, notify, respond_to_server_request, fail_server_request, next_event, shutdown, sender}`
  - `InProcessClientSender::{request, notify, respond_to_server_request, fail_server_request}`
  - `ProcessorCommand::Request`
  - `ProcessorCommand::Notification`
- 不复制 `run_main_with_transport_options` 的 connection map / outbound router / close cleanup。
- 复用现有 `outbound_connections`、`route_outgoing_envelope`、`MessageProcessor`。
- extra connection ID 从 `1` 开始，不能和 `IN_PROCESS_CONNECTION_ID = ConnectionId(0)` 冲突。
- `ExtraConnectionHandle::Drop` 对 `Closed` 做 best-effort delivery，正常路径至多发送一次 close。
- `Closed` 后不得继续处理同一个 connection id 的 extra request / notification。
- 本地按无网络/网络不可靠处理：不要运行 Bazel、Bazel lock、remote test、CI matrix；CI 操作留给 CI。

## Target File Boundary

`codex-rs/app-server/src/in_process_extra.rs` owns:

- `ExtraConnectionHandle`
- `ExtraConnectionCommandSender`
- `ExtraConnectionCommand`
- `OutboundControl`
- `PreparedExtraConnectionOpen`
- `OpenedExtraConnection`
- `ExtraConnectionState`
- `next_extra_connection_id`
- `prepare_opened_connection`
- `handle_outbound_control`
- `spawn_extra_writer_bridge`

`codex-rs/app-server/src/in_process.rs` keeps only:

- `pub use crate::in_process_extra::{ExtraConnectionCommandSender, ExtraConnectionHandle};`
- `InProcessClientMessage::Extra(...)`
- `ProcessorCommand::ExtraConnectionOpened(...)`
- `ProcessorCommand::Extra(...)`
- `InProcessClientSender::register_extra_connection`
- outbound router select branch for `OutboundControl`
- processor loop branch for extra commands
- client loop forwarding branch for extra commands

## Task 0: Baseline Verification

**Files:**
- Verify: `codex-rs/app-server/src/in_process.rs`
- Verify: `codex-rs/app-server/src/lib.rs`

- [ ] **Step 1: Confirm the current branch is clean**

Run from repo root:

```bash
git status --short
```

Expected: no output before implementation starts.

- [ ] **Step 2: Confirm the old final helper module exists**

Run from repo root:

```bash
git show port/lazy-proj-130:codex-rs/app-server/src/in_process_extra.rs | sed -n '1,40p'
```

Expected: output starts with imports for `HashMap`, `JSONRPCRequest`, `JSONRPCNotification`, `CancellationToken`, and app-server `ConnectionSessionState`.

- [ ] **Step 3: Confirm current `in_process.rs` is still single-connection baseline**

Run from repo root:

```bash
rg -n "in_process_extra|ExtraConnection|register_extra_connection|InProcessClientMessage::Extra" codex-rs/app-server/src/in_process.rs
```

Expected: no output.

## Task 1: Add `in_process_extra.rs`

**Files:**
- Create: `codex-rs/app-server/src/in_process_extra.rs`
- Modify: `codex-rs/app-server/src/lib.rs`

- [ ] **Step 1: Restore the helper module from the old branch**

Run from repo root:

```bash
git restore --source port/lazy-proj-130 -- codex-rs/app-server/src/in_process_extra.rs
```

Expected: `codex-rs/app-server/src/in_process_extra.rs` appears as a new file.

- [ ] **Step 2: Wire the module into app-server**

In `codex-rs/app-server/src/lib.rs`, add the crate-private module next to the existing `in_process` module:

```rust
pub mod in_process;
mod in_process_extra;
```

- [ ] **Step 3: Keep the helper module GUI-neutral**

Run from repo root:

```bash
rg -n "gui|websocket|origin|token|allowlist|browser" codex-rs/app-server/src/in_process_extra.rs
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add codex-rs/app-server/src/in_process_extra.rs codex-rs/app-server/src/lib.rs
git commit -m "feat(app-server): add in-process extra connection module"
```

## Task 2: Add Thin Public Registration Surface

**Files:**
- Modify: `codex-rs/app-server/src/in_process.rs`
- Test: `codex-rs/app-server/src/in_process_extra.rs`

- [ ] **Step 1: Re-export neutral handle types**

Near the existing in-process public exports, add:

```rust
pub use crate::in_process_extra::ExtraConnectionCommandSender;
pub use crate::in_process_extra::ExtraConnectionHandle;
```

- [ ] **Step 2: Extend client messages and processor commands**

Add one neutral client message variant:

```rust
pub(crate) enum InProcessClientMessage {
    Request {
        request: Box<ClientRequest>,
        response_tx: oneshot::Sender<PendingClientRequestResponse>,
    },
    Notification {
        notification: ClientNotification,
    },
    Extra(crate::in_process_extra::ExtraConnectionCommand),
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

Add processor variants without changing existing `Request` / `Notification` semantics:

```rust
enum ProcessorCommand {
    Request(Box<ClientRequest>),
    Notification(ClientNotification),
    ExtraConnectionOpened(crate::in_process_extra::OpenedExtraConnection),
    Extra(crate::in_process_extra::ExtraConnectionCommand),
}
```

- [ ] **Step 3: Add `register_extra_connection`**

Add this method to `impl InProcessClientSender`:

```rust
pub async fn register_extra_connection(&self) -> IoResult<ExtraConnectionHandle> {
    let connection_id =
        crate::in_process_extra::next_extra_connection_id(IN_PROCESS_CONNECTION_ID);
    let (outgoing_tx, outgoing_rx) =
        mpsc::channel(DEFAULT_IN_PROCESS_CHANNEL_CAPACITY);
    let disconnect_token = CancellationToken::new();
    self.client_tx
        .send(InProcessClientMessage::Extra(
            crate::in_process_extra::ExtraConnectionCommand::Opened {
                connection_id,
                outgoing_tx: outgoing_tx.clone(),
                disconnect_token: disconnect_token.clone(),
            },
        ))
        .await
        .map_err(|err| {
            IoError::new(
                ErrorKind::BrokenPipe,
                format!("in-process app-server runtime is closed: {err}"),
            )
        })?;

    Ok(ExtraConnectionHandle {
        connection_id,
        command_sender: crate::in_process_extra::ExtraConnectionCommandSender::new(
            self.client_tx.clone(),
            connection_id,
            tokio::runtime::Handle::try_current().ok(),
        ),
        outgoing_tx,
        outgoing_rx,
        disconnect_token,
    })
}
```

If the current implementation uses `channel_capacity` rather than `DEFAULT_IN_PROCESS_CHANNEL_CAPACITY` for extra outgoing channels, preserve the current runtime capacity by passing it through the open command; do not introduce GUI-specific parameters.

- [ ] **Step 4: Run module-level tests**

Run from `codex-rs`:

```bash
just test -p codex-app-server in_process_extra
```

Expected: helper module tests pass.

- [ ] **Step 5: Commit**

```bash
git add codex-rs/app-server/src/in_process.rs codex-rs/app-server/src/in_process_extra.rs
git commit -m "feat(app-server): add extra connection registration"
```

## Task 3: Wire Outbound Control Without Replacing Main Routing

**Files:**
- Modify: `codex-rs/app-server/src/in_process.rs`

- [ ] **Step 1: Add outbound control channel**

In `start_uninitialized`, create an outbound control channel next to `outgoing_rx`:

```rust
let (outbound_control_tx, mut outbound_control_rx) =
    mpsc::channel::<crate::in_process_extra::OutboundControl>(channel_capacity);
```

- [ ] **Step 2: Extend the outbound router select loop**

Replace the current single `while let Some(envelope)` loop with a `tokio::select!` that preserves existing envelope routing:

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
                crate::in_process_extra::handle_outbound_control(
                    &mut outbound_connections,
                    control,
                );
            }
        }
    }
});
```

- [ ] **Step 3: Forward opened/closed extra commands from the client loop**

In the outer client loop, add an `InProcessClientMessage::Extra(command)` branch:

```rust
Some(InProcessClientMessage::Extra(command)) => {
    match command {
        crate::in_process_extra::ExtraConnectionCommand::Opened {
            connection_id,
            outgoing_tx,
            disconnect_token,
        } => {
            let prepared = crate::in_process_extra::prepare_opened_connection(
                connection_id,
                outgoing_tx,
                disconnect_token,
                channel_capacity,
            );
            let _ = outbound_control_tx.send(prepared.outbound_control).await;
            if processor_tx
                .send(ProcessorCommand::ExtraConnectionOpened(prepared.processor_open))
                .await
                .is_err()
            {
                break;
            }
        }
        crate::in_process_extra::ExtraConnectionCommand::Request { .. }
        | crate::in_process_extra::ExtraConnectionCommand::Notification { .. } => {
            if processor_tx.send(ProcessorCommand::Extra(command)).await.is_err() {
                break;
            }
        }
        crate::in_process_extra::ExtraConnectionCommand::Closed { connection_id } => {
            if processor_tx.send(ProcessorCommand::Extra(command)).await.is_err() {
                break;
            }
            let _ = outbound_control_tx
                .send(crate::in_process_extra::OutboundControl::Unregister { connection_id })
                .await;
        }
    }
}
```

- [ ] **Step 4: Run targeted tests**

Run from `codex-rs`:

```bash
just test -p codex-app-server register_extra_connection
just test -p codex-app-server in_process_start_initializes_and_handles_typed_v2_request
```

Expected: tests pass, and the main in-process handshake still works.

- [ ] **Step 5: Commit**

```bash
git add codex-rs/app-server/src/in_process.rs
git commit -m "feat(app-server): route extra connection outbound state"
```

## Task 4: Wire Processor-Side Extra Connection State

**Files:**
- Modify: `codex-rs/app-server/src/in_process.rs`
- Test: `codex-rs/app-server/src/in_process.rs`

- [ ] **Step 1: Create processor-side extra state**

Inside the processor task, after main `session` creation, add:

```rust
let mut extra_connections = crate::in_process_extra::ExtraConnectionState::new();
```

- [ ] **Step 2: Handle extra processor commands**

Extend the processor command match:

```rust
Some(ProcessorCommand::ExtraConnectionOpened(opened)) => {
    extra_connections.register_opened(opened);
}
Some(ProcessorCommand::Extra(command)) => {
    extra_connections
        .handle_processor_command(&processor, command)
        .await;
}
```

Keep existing `Request` and `Notification` arms behavior-equivalent.

- [ ] **Step 3: Include initialized extra connections in thread-created listener**

Replace the main-only connection id list:

```rust
let connection_ids = if session.initialized() {
    vec![IN_PROCESS_CONNECTION_ID]
} else {
    Vec::<ConnectionId>::new()
};
```

with:

```rust
let connection_ids = extra_connections.initialized_connection_ids(
    IN_PROCESS_CONNECTION_ID,
    session.initialized(),
);
```

- [ ] **Step 4: Add integration coverage for request and close**

Add or port tests from old branch covering:

- `register_extra_connection_returns_broken_pipe_after_shutdown`
- `register_extra_connection_request_reaches_message_processor`
- `dropping_extra_handle_triggers_connection_closed`
- `main_connection_still_handles_typed_request_with_extra_connection_present`

Use `pretty_assertions::assert_eq` for object comparisons where possible.

- [ ] **Step 5: Run targeted tests**

Run from `codex-rs`:

```bash
just test -p codex-app-server register_extra_connection
just test -p codex-app-server extra_connection
just test -p codex-app-server in_process_start_initializes_and_handles_typed_v2_request
```

Expected: all targeted app-server tests pass.

- [ ] **Step 6: Commit**

```bash
git add codex-rs/app-server/src/in_process.rs codex-rs/app-server/src/in_process_extra.rs
git commit -m "feat(app-server): process extra in-process connections"
```

## Task 5: Final Verification

**Files:**
- Verify: `codex-rs/app-server/src/in_process.rs`
- Verify: `codex-rs/app-server/src/in_process_extra.rs`
- Verify: `codex-rs/app-server/src/lib.rs`

- [ ] **Step 1: Confirm GUI-specific terms did not enter the in-process runtime**

Run from repo root:

```bash
rg -n "gui|websocket|origin|token|allowlist|browser" \
  codex-rs/app-server/src/in_process.rs \
  codex-rs/app-server/src/in_process_extra.rs
```

Expected: no output.

- [ ] **Step 2: Run formatting**

Run from `codex-rs`:

```bash
just fmt
```

Expected: formatting completes successfully.

- [ ] **Step 3: Run focused tests**

Run from `codex-rs`:

```bash
just test -p codex-app-server in_process
just test -p codex-app-server extra_connection
```

Expected: focused app-server tests pass.

- [ ] **Step 4: Run scoped lint fix**

Run from `codex-rs`:

```bash
just fix -p codex-app-server
```

Expected: scoped fix completes. Do not run Bazel or CI-style commands locally.

- [ ] **Step 5: Final boundary diff check**

Run from repo root:

```bash
git diff --name-only HEAD~4..HEAD | sort
```

Expected: changed code files are limited to:

```text
codex-rs/app-server/src/in_process.rs
codex-rs/app-server/src/in_process_extra.rs
codex-rs/app-server/src/lib.rs
```

plus any test snapshot or lockfile changes directly required by these files.

## Acceptance Gates

- `InProcessClientSender::register_extra_connection` returns a neutral `ExtraConnectionHandle`.
- Extra connection IDs never collide with `ConnectionId(0)`.
- Extra request path reaches existing `MessageProcessor::process_request`.
- Extra notification path reaches existing raw notification processor.
- Extra close path calls `MessageProcessor::connection_closed` and unregisters outbound state.
- `thread_created_rx` attaches listeners for initialized main and initialized extra connections.
- Main TUI connection behavior remains unchanged.
- `in_process.rs` contains only thin hooks; implementation detail lives in `in_process_extra.rs`.
- No GUI/WebSocket/security policy symbols are introduced into in-process runtime files.
- Local verification uses `just fmt`, `just test -p codex-app-server ...`, and `just fix -p codex-app-server`; Bazel/CI checks are left to CI.

## Self-Review Checklist

- [ ] `02` did not implement `GuiHostManager`.
- [ ] `02` did not implement `gui_transport.rs`.
- [ ] `02` did not implement `app-server-client/src/gui.rs`.
- [ ] `02` did not touch TUI or frontend files.
- [ ] Existing main connection request/notification arm bodies are behavior-equivalent.
- [ ] The new module is reusable by later GUI bridge without naming GUI concepts.
