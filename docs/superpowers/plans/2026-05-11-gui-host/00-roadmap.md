# Codex GUI Host Roadmap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Track the full GUI host redesign split across focused plan files without losing the original implementation detail.

**Architecture:** This roadmap owns scope notes, file structure, task mapping, and self-review. Implementation details live in the numbered child plans, copied from the original single-file plan by task boundary.

**Tech Stack:** Rust 2024, axum, tokio, app-server JSON-RPC, Vite/React/Vitest/Playwright.

---

Source: split from `docs/superpowers/plans/2026-05-11-codex-gui-host-redesign.md`. The source file is deleted after this split because these files replace it.

## Split Map

- `01-gui-host-crate.md`: original Tasks 1-5.
- `02-app-server-bridge.md`: original Tasks 6-7 and 9.
- `03-tui-entry.md`: original Task 8.
- `04-frontend-handshake.md`: original Task 10.
- `05-packaging-verification.md`: original Tasks 11-12.

## Scope Notes

- This plan targets branch `port/lazy-proj-130`.
- Do not copy the current `port/gui-host` implementation wholesale. Use it only as a behavior reference.
- Do not add GUI code to `codex-core`.
- Do not add or modify code related to `CODEX_SANDBOX_NETWORK_DISABLED_ENV_VAR` or `CODEX_SANDBOX_ENV_VAR`.
- e2e 验证留到后续迭代；本批计划只做 unit/integration 覆盖，不修改 `codex-gui/e2e/app.spec.ts`。
- If `Cargo.toml` or `Cargo.lock` changes, the intermediate task commits may leave Bazel lockfiles temporarily stale. Task 12 is the required final alignment point: run `just bazel-lock-update` and `just bazel-lock-check` from `codex-rs`, then commit `MODULE.bazel.lock` with the final lockfile update.
- After Rust changes, run `just fmt` from `codex-rs`.
- Before finalizing Rust crate changes, run `just fix -p <project>` for changed projects. For this plan, prefer `codex-gui-host`, `codex-app-server`, and `codex-tui` scoped runs.

## File Structure

- Create: `codex-rs/gui-host/Cargo.toml`
  - Defines crate `codex-gui-host`.
- Create: `codex-rs/gui-host/BUILD.bazel`
  - Adds Bazel target for the new crate.
- Create: `codex-rs/gui-host/src/lib.rs`
  - Public API exports and module declarations.
- Create: `codex-rs/gui-host/src/token.rs`
  - `LaunchToken` generation and test constructor.
- Create: `codex-rs/gui-host/src/config.rs`
  - `GuiHostConfig`, `GuiHostMode`, `DevAssetProxyConfig`, `ProdAssetConfig`, env-based mode resolution.
- Create: `codex-rs/gui-host/src/url.rs`
  - Launch URL formatting.
- Create: `codex-rs/gui-host/src/filter.rs`
  - Browser request and server notification allowlists.
- Create: `codex-rs/gui-host/src/backend.rs`
  - `GuiBackend`, `AuthenticatedGuiConnection`, inbound/outbound channel types.
- Create: `codex-rs/gui-host/src/host.rs`
  - `GuiHost`, `GuiHostHandle`, bind/shutdown lifecycle.
- Create: `codex-rs/gui-host/src/assets.rs`
  - dev Vite proxy and prod dist static serving.
- Create: `codex-rs/gui-host/src/ws.rs`
  - WebSocket upgrade, Host/Origin validation, auth first frame, pump.
- Modify: `codex-rs/Cargo.toml`
  - Adds workspace member and dependency `codex-gui-host`, and `tower-http` if not already present.
- Modify: `codex-rs/app-server-transport/src/transport/mod.rs`
  - Adds `ConnectionOrigin::GuiHost`.
- Modify: `codex-rs/app-server/src/in_process.rs`
  - Adds support for extra JSON-RPC connections used by GUI host.
- Create: `codex-rs/app-server/src/gui_bridge.rs`
  - Implements `codex_gui_host::GuiBackend` using the embedded app-server runtime handle.
- Modify: `codex-rs/app-server/src/lib.rs`
  - Registers and exports bridge entry points as needed.
- Modify: `codex-rs/app-server/Cargo.toml`
  - Adds `codex-gui-host` dependency.
- Modify: `codex-rs/app-server/BUILD.bazel`
  - Picks up new dependency through Cargo/Bazel generation.
- Modify: `codex-rs/app-server-client/src/lib.rs`
  - Exposes optional embedded GUI backend handle to TUI without making TUI depend on `codex-app-server`.
- Modify: `codex-rs/tui/Cargo.toml`
  - Adds `codex-gui-host` dependency only.
- Modify: `codex-rs/tui/src/app_event.rs`
  - Adds `OpenGui`.
- Modify: `codex-rs/tui/src/slash_command.rs`
  - Adds visible `/gui`.
- Modify: `codex-rs/tui/src/chatwidget/slash_dispatch.rs`
  - Dispatches `/gui` to `AppEvent::OpenGui`.
- Create: `codex-rs/tui/src/app/gui.rs`
  - `App::open_gui`, host reuse, URL transcript message, shutdown.
- Modify: `codex-rs/tui/src/app.rs`
  - Stores `gui_host: Option<GuiHostHandle>` and optional backend handle from `AppServerSession`.
- Modify: `codex-rs/tui/src/lib.rs`
  - Wires embedded app-server GUI backend into `App::run`; remote app-server disables `/gui`.
- Modify: `codex-cli/bin/codex.js`
  - Sets `CODEX_GUI_PACKAGE_ROOT` for prod package runtime.
- Modify: `codex-cli/scripts/build_npm_package.py`
  - Copies `codex-gui/dist` into platform package vendor root.
- Create: `codex-gui/src/features/guiHost/guiHostClient.ts`
  - Launch params, token storage, WebSocket message sequence, status.
- Create: `codex-gui/src/features/guiHost/guiHostClient.test.ts`
  - Unit tests for token/sessionStorage/message order/status.
- Modify: `codex-gui/src/App.tsx`
  - Shows simple GUI host connection state.
- Modify: `codex-gui/vite.config.ts`
  - Pins dev host/port/HMR to Vite.
- Create: `codex-rs/app-server/tests/suite/v2/gui_host_bridge.rs`
  - End-to-end browser-style projection transport tests.
- Modify: `codex-rs/app-server/tests/suite/v2/mod.rs`
  - Registers `gui_host_bridge`.

---

## Self-Review Checklist

- Spec coverage:
  - New `codex-gui-host` crate: Tasks 1-5.
  - TUI thin `/gui` entry and URL-only behavior: Task 8.
  - App-server bridge to existing runtime: Tasks 6-9.
  - Frontend status without store integration: Task 10.
  - dev/prod resource behavior and packaging: Tasks 4 and 11.
  - token fragment + `sessionStorage`: Task 10.
  - tests near owning crate/module: Tasks 1-10.
- No plan step asks to add code to `codex-core`.
- No plan step changes sandbox environment variable code.
- The bridge avoids a second projection processor by forwarding JSON-RPC into app-server runtime.
- TUI does not directly depend on `codex-app-server`; it uses `codex-gui-host` and `codex-app-server-client`.
