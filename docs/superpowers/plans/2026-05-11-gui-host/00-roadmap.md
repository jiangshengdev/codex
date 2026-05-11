# Codex GUI Host Roadmap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Track the GUI host local projection transport MVP split across focused plan files.

**Architecture:** `codex-gui-host` remains the browser-safe GUI shell. The app-server bridge is an app-server-runtime-owned dynamic transport acceptor that converts authenticated GUI WebSockets into `TransportEvent::{ConnectionOpened, IncomingMessage, ConnectionClosed}`. TUI only asks `codex-app-server-client` for a launch URL and prints it; it does not own `GuiHost`, hold a backend handle, or forward projection traffic. Projection scope is intentionally small: authenticate, initialize, attach the primary thread, and prove real `thread/projection/event` delivery.

**Tech Stack:** Rust 2024, axum, tokio, app-server JSON-RPC, app-server transport lifecycle, Vite/React/Vitest.

---

Source spec: `docs/superpowers/specs/2026-05-11-codex-gui-host-redesign.md`.

## Current State

- Branch target: `port/lazy-proj-130`.
- Tag `00-roadmap` is the original roadmap baseline.
- Tag `01-gui-host-crate` completed the `codex-gui-host` crate shell.
- The completed `01-gui-host-crate` code remains valid and should not be reverted.
- The old `02-app-server-bridge.md` route using `open_extra_jsonrpc_connection`, `ExtraJsonRpcConnectionFactory`, and `app-server/src/in_process.rs` extra JSON-RPC connections is obsolete.
- The current branch contains an over-invasive `in_process.rs` multi-connection implementation. Rewrite work must remove that route and replace it with an app-server runtime transport acceptor.

## Split Map

- `01-gui-host-crate.md`: completed host shell tasks. Keep as historical execution record and behavior reference.
- `02-app-server-bridge.md`: new required bridge plan. Implements GUI host lifecycle and GUI connection lifecycle as app-server runtime transport plumbing.
- `03-tui-entry.md`: thin `/gui` TUI entry. Must request a launch URL through `codex-app-server-client`; it must not create or hold `GuiHost`.
- `04-frontend-handshake.md`: browser token recovery, WebSocket handshake, `initialize`, `thread/projection/attach`, and minimal status UI.
- `05-packaging-verification.md`: prod asset wiring and final verification.

## Scope Notes

- Do not add GUI code to `codex-core`.
- Do not add or modify code related to `CODEX_SANDBOX_NETWORK_DISABLED_ENV_VAR` or `CODEX_SANDBOX_ENV_VAR`.
- Do not implement LAN, mobile browser access, public relay, browser control, user turns, approval, interrupt, subagent switching, or full projection UI in this batch.
- Do not expose a general-purpose extra JSON-RPC connection API from `InProcessClientHandle`.
- Do not extend `codex-rs/app-server/src/in_process.rs` into a multi-connection transport loop.
- Do not copy `run_main_with_transport_options` connection maps, outbound routing, or close cleanup into another runtime.
- `codex-gui-host` may define the browser-side `GuiBackend` trait, but it must not depend on `codex-app-server`.
- `codex-app-server` implements the backend, owns GUI host lifecycle, owns app-server semantics, and emits real `TransportEvent` values into the existing app-server transport pipeline.
- `codex-tui` must not directly depend on `codex-app-server`; it receives only launch URL access through `codex-app-server-client`.
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

Bridge and runtime changes:

- Modify: `codex-rs/app-server-transport/src/transport/mod.rs`
  - Add `ConnectionOrigin::GuiHost`.
- Modify: `codex-rs/app-server/Cargo.toml`
  - Add `codex-gui-host` dependency.
- Modify: `codex-rs/app-server/BUILD.bazel`
  - Add generated/declared dependency on `codex-gui-host` when needed.
- Create: `codex-rs/app-server/src/gui_transport.rs`
  - Implement `codex_gui_host::GuiBackend` as a `TransportEvent` producer.
  - Convert authenticated GUI inbound text to `TransportEvent::IncomingMessage`.
  - Convert app-server outbound `QueuedOutgoingMessage` to GUI outbound JSON text.
  - Guarantee one `ConnectionClosed` per opened GUI connection.
- Create: `codex-rs/app-server/src/gui_host.rs`
  - Own lazy-start/reuse of `codex_gui_host::GuiHost` inside the active app-server runtime.
  - Build launch URLs for requested primary thread IDs.
  - Keep launch token and host lifecycle scoped to the app-server session.
- Modify: `codex-rs/app-server/src/lib.rs`
  - Wire GUI host lifecycle into the runtime scope that owns `transport_event_tx`.
  - Avoid adding GUI connection processing branches to the main processor loop beyond the existing `TransportEvent` path.
- Modify: `codex-rs/app-server-client/src/lib.rs`
  - Expose a launch URL request API for local embedded app-server sessions.
  - Return an unsupported result for remote sessions.

TUI entry changes:

- Modify: `codex-rs/tui/src/app_event.rs`
- Modify: `codex-rs/tui/src/slash_command.rs`
- Modify: `codex-rs/tui/src/chatwidget/slash_dispatch.rs`
- Create: `codex-rs/tui/src/app/gui.rs`
- Modify: `codex-rs/tui/src/app.rs`
- Modify: `codex-rs/tui/src/app/event_dispatch.rs`
- Modify: `codex-rs/tui/src/lib.rs`

Frontend and packaging changes:

- Create: `codex-gui/src/features/guiHost/guiHostClient.ts`
- Create: `codex-gui/src/features/guiHost/guiHostClient.test.ts`
- Modify: `codex-gui/src/App.tsx`
- Modify: `codex-gui/vite.config.ts`
- Modify: `codex-cli/bin/codex.js`
- Modify: `codex-cli/scripts/build_npm_package.py`

## Acceptance Gates

- `/gui` prints a local URL.
- Browser opens GUI host URL and connects to same-origin `/ws`.
- `gui/authenticate` succeeds before any app-server connection is opened.
- `gui/authenticate` failure closes `/ws` with code `1008` and never emits `TransportEvent::ConnectionOpened`.
- Invalid auth never opens an app-server connection.
- Browser sends `initialize` and receives a real app-server response.
- Browser sends `thread/projection/attach` and receives a real app-server response.
- Browser receives at least one real `thread/projection/event`.
- Non-allowlisted browser request never reaches app-server processor.
- Non-allowlisted server notification is not sent to browser.
- Browser close or refresh closes the GUI app-server connection and cleans projection subscriptions.
- `codex-tui` has no direct `codex-app-server` dependency.
- `codex-tui` does not directly depend on `codex-gui-host` for runtime ownership.
- `codex-rs/app-server/src/in_process.rs` is not expanded into a GUI multi-connection runtime.

## Self-Review Checklist

- `01-gui-host-crate.md` remains completed and valid.
- `02-app-server-bridge.md` marks `open_extra_jsonrpc_connection` as obsolete and does not implement it.
- `02-app-server-bridge.md` explicitly removes the current `in_process.rs` multi-connection direction.
- `02-app-server-bridge.md` adds `ConnectionOrigin::GuiHost`.
- `02-app-server-bridge.md` implements GUI bridge as an app-server runtime `TransportEvent` producer.
- `02-app-server-bridge.md` guarantees one `ConnectionClosed` per opened GUI connection.
- `03-tui-entry.md` requests a launch URL from `codex-app-server-client` and does not consume a backend handle.
- `04-frontend-handshake.md` keeps projection UI to transport status only.
- No plan step adds code to `codex-core`.
- No plan step changes sandbox environment variable code.
