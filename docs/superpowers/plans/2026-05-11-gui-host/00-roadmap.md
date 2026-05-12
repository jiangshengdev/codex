# Codex GUI Host Roadmap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the TUI in-process GUI host local projection transport MVP split across focused plan files.

**Architecture:** `codex-gui-host` remains the browser-safe GUI shell. `codex-app-server` owns GUI host lifecycle **inside** the TUI's in-process app-server runtime (`codex-rs/app-server/src/in_process.rs`). Each authenticated GUI WebSocket is registered via `InProcessClientSender::register_extra_connection`, producing new `ProcessorCommand::Extra*` commands that are driven by the existing `MessageProcessor` and existing `outbound_connections` HashMap. TUI only asks `codex-app-server-client` for a launch URL and prints it. Projection scope stays small: authenticate, initialize, attach the primary thread, and prove real `thread/projection/event` delivery.

**Tech Stack:** Rust 2024, axum, tokio, app-server JSON-RPC, Vite/React/Vitest.

---

Source spec: `docs/superpowers/specs/2026-05-11-codex-gui-host-redesign.md`.

## Current State

- Branch target: `port/lazy-proj-130`.
- Tag `00-roadmap` is the original roadmap baseline.
- Tag `01-gui-host-crate` completed the `codex-gui-host` crate shell.
- The completed `01-gui-host-crate` code remains valid and should not be reverted.
- The previous `02-app-server-bridge.md` direction ("dynamic `TransportEvent` acceptor" + `GuiLaunchError::Unsupported` for in-process sessions) is obsolete and fully replaced by this roadmap.
- The prior `in_process.rs` multi-connection implementation was already reverted (see commit `c03057779 refactor(gui): remove obsolete in-process bridge`). The new bridge lands on top of that clean baseline.

## Split Map

- `01-gui-host-crate.md`: completed host shell tasks. Keep as historical execution record and behavior reference.
- `02-app-server-bridge.md`: required bridge plan. Adds `ConnectionOrigin::GuiHost` verification, `GuiHostManager`, `gui_transport.rs` `GuiBackend` implementation, and wires the app-server-client `gui_launch_url` surface. Consumes the `register_extra_connection` API landed by `06-in-process-gui-launch.md`.
- `03-tui-entry.md`: thin `/gui` TUI entry. Requests a launch URL through `codex-app-server-client::AppServerClientGuiExt::gui_launch_url` and prints it. Must not create or hold `GuiHost`.
- `04-frontend-handshake.md`: browser token recovery, WebSocket handshake, `initialize`, `thread/projection/attach`, and minimal status UI. Verified against the in-process TUI path.
- `05-packaging-verification.md`: prod asset wiring and final verification. End-to-end acceptance on the in-process TUI default path.
- `06-in-process-gui-launch.md`: foundation plan. Extends `in_process.rs` with `ProcessorCommand::Extra*`, the `register_extra_connection` API, `ExtraConnectionHandle`, and the `codex-app-server-client::gui` extension trait. Plan 02 depends on this.

## Execution Order

```text
01 (done) -> 06 -> 02 -> 03 -> 04 -> 05
```

Plan 06 lands the `in_process.rs` and `codex-app-server-client` extension points that plan 02 wires into `codex-gui-host`. Plan 03 consumes the extension trait produced by plan 06. Plans 04 and 05 validate the full path end-to-end.

## Scope Notes

- Do not add GUI code to `codex-core`.
- Do not add or modify code related to `CODEX_SANDBOX_NETWORK_DISABLED_ENV_VAR` or `CODEX_SANDBOX_ENV_VAR`.
- Do not implement LAN, mobile browser access, public relay, browser control, user turns, approval, interrupt, subagent switching, or full projection UI in this batch.
- Do not implement `open_extra_jsonrpc_connection` or `ExtraJsonRpcConnectionFactory`. The replacement is the narrow `register_extra_connection` API landed by plan 06.
- Do not copy `run_main_with_transport_options` connection maps, outbound routing, or close cleanup into `in_process.rs`. Reuse the existing HashMap-based `outbound_connections` and `route_outgoing_envelope`.
- `in_process.rs` touch points are enumerated in the spec §Bridge 形态 and plan 06; the **TUI main connection's external semantics must stay identical** (`InProcessClientHandle::request` / `notify` signatures, `ProcessorCommand::Request` / `Notification` variant semantics, `MessageProcessor::process_client_request` signature, `ConnectionSessionState` / `OutboundConnectionState` types, `route_outgoing_envelope` behavior).
- `codex-gui-host` may define the browser-side `GuiBackend` trait, but must not depend on `codex-app-server`.
- `codex-app-server` implements the backend, owns GUI host lifecycle inside the in-process runtime, and bridges authenticated WebSockets into `ProcessorCommand::Extra*`.
- `codex-tui` must not directly depend on `codex-app-server`; it receives launch URL access only through `codex-app-server-client`.
- `ConnectionOrigin::GuiHost` already lives in `codex-rs/app-server-transport/src/transport/mod.rs`. MVP in-process path does **not** use `TransportEvent` and does **not** use this variant. The variant is preserved for a future external-`codex-app-server`-process GUI backend (see spec §未来方向); plan 02 only verifies it still compiles and its unit test passes.
- After Rust changes, run `just fmt` from `codex-rs`.
- Before finalizing Rust crate changes, run scoped `just fix -p <project>` for changed projects.
- If Rust dependencies change, run `just bazel-lock-update` and `just bazel-lock-check` from `codex-rs`.

## File Structure

Already created by `01-gui-host-crate`:

- `codex-rs/gui-host/Cargo.toml`
- `codex-rs/gui-host/BUILD.bazel`
- `codex-rs/gui-host/src/lib.rs`
- `codex-rs/gui-host/src/token.rs`
- `codex-rs/gui-host/src/config.rs`
- `codex-rs/gui-host/src/url.rs`
- `codex-rs/gui-host/src/filter.rs`
- `codex-rs/gui-host/src/backend.rs`
- `codex-rs/gui-host/src/host.rs`
- `codex-rs/gui-host/src/assets.rs`
- `codex-rs/gui-host/src/ws.rs`

In-process foundation (plan 06):

- Modify: `codex-rs/app-server/src/in_process.rs`
  - Add `ProcessorCommand::ExtraConnectionOpened / ExtraRequest / ExtraNotification / ExtraConnectionClosed`.
  - Add `InProcessClientSender::register_extra_connection(&self) -> ExtraConnectionHandle` (the sender already derives `Clone`, which is the shape `GuiHostManager` needs).
  - Add `ExtraConnectionHandle { connection_id, command_sender, outgoing_tx: Sender<String>, outgoing_rx: Receiver<String>, disconnect_token: CancellationToken }` and its `Drop` that best-effort `try_send`s `ExtraConnectionClosed`.
  - Extend the processor `match ProcessorCommand` loop with the four new arms (main-connection arms kept byte-for-byte).
  - Generalize the outbound router task loop shape to drive both the main connection's outgoing drain and extra connections' control signals (functional invariants: main-connection outgoing drain semantics and throughput unchanged).
  - Generalize `thread_created_rx` dispatch from hardcoded `[IN_PROCESS_CONNECTION_ID]` to `main + initialized extra connections`.
  - Add `extra_session_states: HashMap<ConnectionId, Arc<ConnectionSessionState>>` next to `outbound_connections`.
  - Keep all naming in `in_process.rs` GUI-agnostic (no `gui`, `websocket`, `allowlist` symbols).
- Create: `codex-rs/app-server-client/src/gui.rs`
  - `pub trait AppServerClientGuiExt { async fn gui_launch_url(&self, primary_thread_id: &str) -> Result<GuiLaunchUrl, GuiLaunchError>; }`.
  - `pub struct GuiLaunchUrl { pub url: String }`.
  - `pub enum GuiLaunchError { Unsupported, Transport(std::io::Error) }`.
- Modify: `codex-rs/app-server-client/src/lib.rs`
  - `pub mod gui;` + re-export the extension trait and types.
  - `InProcessAppServerClient` carries an `Arc<GuiHostManager>`; its implementation calls `GuiHostManager::launch_url_for_thread` and returns `GuiLaunchUrl`. Remote client impl returns `GuiLaunchError::Unsupported`.

Bridge (plan 02):

- Modify: `codex-rs/app-server/Cargo.toml` — add `codex-gui-host = { workspace = true }`.
- Modify: `codex-rs/app-server/BUILD.bazel` — add the `codex-gui-host` dependency if dependencies are listed explicitly.
- Create: `codex-rs/app-server/src/gui_host.rs` — `GuiHostManager { inner: Mutex<Option<GuiHostHandle>>, sender: InProcessClientSender }` with `launch_url_for_thread(primary_thread_id) -> anyhow::Result<GuiLaunchUrl>` and `shutdown()`. Starts a single `GuiHost` on first call and reuses it thereafter.
- Create: `codex-rs/app-server/src/gui_transport.rs` — implements `codex_gui_host::GuiBackend`. For each authenticated `AuthenticatedGuiConnection`: calls `register_extra_connection`, spawns inbound and outbound bridge tasks, respects `disconnect_token`, triggers `ExtraConnectionHandle` drop on termination.
- Modify: `codex-rs/app-server/src/lib.rs` — declares the new modules. Plan 02 does not wire anything into `run_main_with_transport_options`; the GUI host manager lives on the in-process client side (plan 06).

TUI entry changes (plan 03):

- Modify: `codex-rs/tui/src/app_event.rs`
- Modify: `codex-rs/tui/src/slash_command.rs`
- Modify: `codex-rs/tui/src/chatwidget/slash_dispatch.rs`
- Create: `codex-rs/tui/src/app/gui.rs`
- Modify: `codex-rs/tui/src/app.rs`
- Modify: `codex-rs/tui/src/app/event_dispatch.rs`
- Modify: `codex-rs/tui/src/app_server_session.rs`

Frontend and packaging changes (plans 04, 05):

- Create: `codex-gui/src/features/guiHost/guiHostClient.ts`
- Create: `codex-gui/src/features/guiHost/guiHostClient.test.ts`
- Modify: `codex-gui/src/App.tsx`
- Modify: `codex-gui/vite.config.ts`
- Modify: `codex-cli/bin/codex.js`
- Modify: `codex-cli/scripts/build_npm_package.py`

## Acceptance Gates

- `/gui` prints a local URL (real URL in the TUI's in-process path, not `GUI is not available`).
- Browser opens GUI host URL and connects to same-origin `/ws`.
- `gui/authenticate` succeeds before any `register_extra_connection` call.
- `gui/authenticate` failure closes `/ws` with code `1008` and never calls `register_extra_connection`; no entry is left in `outbound_connections` or `extra_session_states`.
- Browser sends `initialize` and receives a real app-server response via `message_processor.rs` `process_request` raw path.
- Browser sends `thread/projection/attach` and receives a real app-server response.
- Browser receives at least one real `thread/projection/event` via the existing `route_outgoing_envelope`.
- Non-allowlisted browser request is rejected in `codex-gui-host` and never reaches the `gui_transport` inbound bridge, never produces a `ProcessorCommand::ExtraRequest`.
- Non-allowlisted server notification is not sent to the browser.
- Browser close, refresh, `disconnect_token` cancel, or `GuiBackend::connect` error triggers `ExtraConnectionHandle::Drop` which best-effort `try_send`s `ExtraConnectionClosed`; `in_process.rs` removes the entry and runs the existing projection subscription cleanup. Runtime abort / shutdown timeout may skip the per-connection `ExtraConnectionClosed` and rely on the existing overall cleanup.
- TUI main connection (`IN_PROCESS_CONNECTION_ID`) external behavior is unchanged (typed `ClientRequest` / `ClientNotification` path, `process_client_request` signature, `OutboundConnectionState` shape, `route_outgoing_envelope` semantics).
- `codex-tui` has no direct `codex-app-server` dependency and no `codex-gui-host` dependency.
- `in_process.rs` touch points are limited to those enumerated in spec §Bridge 形态; no `run_main_with_transport_options`-style connection map, outbound router, or close cleanup is duplicated.

## Self-Review Checklist

- `01-gui-host-crate.md` remains completed and valid.
- `02-app-server-bridge.md` lands on top of plan 06's `register_extra_connection` API; removes the `GuiLaunchError::Unsupported` shortcut for in-process sessions.
- `02-app-server-bridge.md` does not expand `in_process.rs`.
- `02-app-server-bridge.md` only verifies `ConnectionOrigin::GuiHost` still compiles and its existing unit test passes; MVP path does not consume it.
- `03-tui-entry.md` uses the `AppServerClientGuiExt::gui_launch_url` extension trait and asserts the happy path returns a real URL (not `Unsupported`).
- `04-frontend-handshake.md` keeps projection UI to transport status only.
- `05-packaging-verification.md` runs the in-process-path acceptance tests added by plan 06.
- `06-in-process-gui-launch.md` keeps `in_process.rs` naming GUI-agnostic and documents the outbound router loop invariants with behavior-equivalent tests.
- No plan step adds code to `codex-core`.
- No plan step changes sandbox environment variable code.
