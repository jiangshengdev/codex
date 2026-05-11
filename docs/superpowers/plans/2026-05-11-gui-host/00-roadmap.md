# Codex GUI Host Roadmap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Track the GUI host local projection transport MVP split across focused plan files.

**Architecture:** `codex-gui-host` remains the browser-safe GUI shell. The app-server bridge is redesigned around app-server transport lifecycle semantics (`ConnectionOpened`, `IncomingMessage`, `ConnectionClosed`) instead of the obsolete extra in-process JSON-RPC connection API. Projection scope is intentionally small: authenticate, initialize, attach the primary thread, and prove real `thread/projection/event` delivery.

**Tech Stack:** Rust 2024, axum, tokio, app-server JSON-RPC, app-server transport lifecycle, Vite/React/Vitest.

---

Source spec: `docs/superpowers/specs/2026-05-11-codex-gui-host-redesign.md`.

## Current State

- Branch target: `port/lazy-proj-130`.
- Tag `00-roadmap` is the original roadmap baseline.
- Tag `01-gui-host-crate` completed the `codex-gui-host` crate shell.
- The completed `01-gui-host-crate` code remains valid and should not be reverted.
- The old `02-app-server-bridge.md` route using `open_extra_jsonrpc_connection`, `ExtraJsonRpcConnectionFactory`, and `app-server/src/in_process.rs` extra JSON-RPC connections is obsolete.

## Split Map

- `01-gui-host-crate.md`: completed host shell tasks. Keep as historical execution record and behavior reference.
- `02-app-server-bridge.md`: new required bridge plan. Implements GUI connection lifecycle on top of app-server transport semantics.
- `03-tui-entry.md`: thin `/gui` TUI entry. Must consume the backend handle exposed by `codex-app-server-client`.
- `04-frontend-handshake.md`: browser token recovery, WebSocket handshake, `initialize`, `thread/projection/attach`, and minimal status UI.
- `05-packaging-verification.md`: prod asset wiring and final verification.

## Scope Notes

- Do not add GUI code to `codex-core`.
- Do not add or modify code related to `CODEX_SANDBOX_NETWORK_DISABLED_ENV_VAR` or `CODEX_SANDBOX_ENV_VAR`.
- Do not implement LAN, mobile browser access, public relay, browser control, user turns, approval, interrupt, subagent switching, or full projection UI in this batch.
- Do not expose a general-purpose extra JSON-RPC connection API from `InProcessClientHandle`.
- `codex-gui-host` may define the browser-side `GuiBackend` trait, but it must not depend on `codex-app-server`.
- `codex-app-server` implements the backend and owns app-server semantics.
- `codex-tui` must not directly depend on `codex-app-server`; it receives backend access through `codex-app-server-client`.
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
- Modify: `codex-rs/app-server/src/in_process.rs`
  - Add an embedded GUI backend handle.
  - Add per-GUI-connection runtime state.
  - Route GUI JSON-RPC text through app-server request processor semantics.
  - Ensure every opened GUI connection closes exactly once.
- Modify: `codex-rs/app-server/Cargo.toml`
  - Add `codex-gui-host` dependency.
- Modify: `codex-rs/app-server/BUILD.bazel`
  - Add generated/declared dependency on `codex-gui-host` when needed.
- Modify: `codex-rs/app-server-client/src/lib.rs`
  - Re-export the embedded GUI backend handle.
  - Return `Some(handle)` for in-process sessions and `None` for remote sessions.

TUI entry changes:

- Modify: `codex-rs/tui/Cargo.toml`
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
- Invalid auth never opens an app-server connection.
- Browser sends `initialize` and receives a real app-server response.
- Browser sends `thread/projection/attach` and receives a real app-server response.
- Browser receives at least one real `thread/projection/event`.
- Non-allowlisted browser request never reaches app-server processor.
- Non-allowlisted server notification is not sent to browser.
- Browser close or refresh closes the GUI app-server connection and cleans projection subscriptions.
- `codex-tui` has no direct `codex-app-server` dependency.

## Self-Review Checklist

- `01-gui-host-crate.md` remains completed and valid.
- `02-app-server-bridge.md` marks `open_extra_jsonrpc_connection` as obsolete and does not implement it.
- `02-app-server-bridge.md` adds `ConnectionOrigin::GuiHost`.
- `02-app-server-bridge.md` guarantees one `ConnectionClosed` per opened GUI connection.
- `03-tui-entry.md` consumes an optional backend handle from `codex-app-server-client`.
- `04-frontend-handshake.md` keeps projection UI to transport status only.
- No plan step adds code to `codex-core`.
- No plan step changes sandbox environment variable code.
