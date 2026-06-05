# Codex GUI Host TUI `/gui` Command Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `codex-tui` 中新增 `/gui` slash command，让用户可以为 primary thread 请求并显示本机 GUI launch URL。

**Architecture:** 本计划执行 `00-roadmap.md` 中的 `06 TUI /gui command`。TUI 只通过 `codex-app-server-client` facade 请求 URL 并显示，不直接依赖 `codex-app-server` 或 `codex-gui-host`，不转发 browser JSON-RPC traffic，也不自动打开浏览器。实际处理逻辑放进新的 `codex-rs/tui/src/app/gui.rs`，避免继续扩大 central app/thread routing 文件。

**Tech Stack:** Rust 2024, codex-tui, codex-app-server-client `AppServerClientGuiExt`, slash commands, ratatui history cells, insta snapshots, `just test`.

---

## Scope

本计划只实现 TUI `/gui` command。

允许修改：

- `codex-rs/tui/src/app.rs`
- `codex-rs/tui/src/app/gui.rs`
- `codex-rs/tui/src/app/thread_routing.rs`
- `codex-rs/tui/src/app/tests.rs`
- `codex-rs/tui/src/app_command.rs`
- `codex-rs/tui/src/app_server_session.rs`
- `codex-rs/tui/src/chatwidget/slash_dispatch.rs`
- `codex-rs/tui/src/chatwidget/tests/slash_commands.rs`
- `codex-rs/tui/src/slash_command.rs`
- `codex-rs/tui/src/snapshots/**` only for intentional `/gui` UI snapshot updates

不允许修改：

- `codex-rs/app-server/**`
- `codex-rs/app-server-client/**`
- `codex-rs/gui-host/**`
- `codex-rs/app-server-protocol/**`
- `codex-rs/core/**`
- `codex-gui/**`
- `codex-rs/Cargo.toml`
- `codex-rs/Cargo.lock`
- `MODULE.bazel.lock`
- `docs/superpowers/plans/2026-05-30-gui-host/07-*`

停止条件：

- 如果需要新增 app-server protocol v2 API，停止；`06` 只能使用 `05` 已交付的 app-server-client facade。
- 如果需要让 TUI 直接依赖 `codex-app-server` 或 `codex-gui-host`，停止。
- 如果需要自动打开浏览器、增加 `/gui --open`、`/gui --current` 或 `/gui <threadId>`，停止；这些不是首版行为。
- 如果需要修改 GUI frontend、projection store 或 browser handshake，停止；这些属于 `07-frontend-handshake-store-verification.md`。
- 如果 primary thread 还不存在，`/gui` 必须显示错误，不得创建新 thread 或选择 active subagent thread 作为替代。

## Source Of Truth

解释冲突时按以下顺序：

1. `docs/superpowers/plans/2026-05-30-gui-host/00-roadmap.md`
2. `docs/superpowers/specs/2026-05-11-codex-gui-host-redesign.md`
3. `docs/superpowers/plans/2026-05-30-gui-host/05-app-server-client-facade.md`
4. current source under `codex-rs/tui/**`

`00-roadmap.md` 的固定要求：

- `/gui` 首版使用 primary thread。
- `/gui` 首版只显示本机 URL。
- TUI 不转发 browser JSON-RPC traffic。
- TUI 不直接依赖 `codex-app-server` 或 `codex-gui-host`。

## File Responsibilities

- `codex-rs/tui/src/app_server_session.rs`: expose a small TUI-local wrapper around `AppServerClientGuiExt::launch_gui_for_thread`.
- `codex-rs/tui/src/app/gui.rs`: own `/gui` app behavior: choose primary thread, call `AppServerSession`, and render success/error transcript messages.
- `codex-rs/tui/src/app.rs`: declare the new `gui` module only.
- `codex-rs/tui/src/app/thread_routing.rs`: route `AppCommand::LaunchGui` into `App::launch_gui_for_primary_thread`; do not add URL formatting here.
- `codex-rs/tui/src/app_command.rs`: add the local app command variant and constructor.
- `codex-rs/tui/src/slash_command.rs`: register `SlashCommand::Gui`, popup description, task availability, and side-conversation availability.
- `codex-rs/tui/src/chatwidget/slash_dispatch.rs`: dispatch `/gui` to `AppCommand::launch_gui()`.
- `codex-rs/tui/src/chatwidget/tests/slash_commands.rs`: prove `/gui` submits the right app op and remains non-inline.
- `codex-rs/tui/src/app/tests.rs`: snapshot the user-visible `/gui` transcript messages.

## Task 1: Confirm `05` Facade And Add TUI Session Wrapper

**Files:**
- Verify: `docs/superpowers/plans/2026-05-30-gui-host/00-roadmap.md`
- Verify: `docs/superpowers/plans/2026-05-30-gui-host/05-app-server-client-facade.md`
- Verify: `codex-rs/app-server-client/src/gui.rs`
- Modify: `codex-rs/tui/src/app_server_session.rs`

- [ ] **Step 1: Confirm `06` is the current roadmap step**

Run from repo root:

```bash
rg -n '05 app-server-client facade|06 TUI /gui command|07 frontend handshake/store verification|/gui` 首版使用 primary thread|不自动打开浏览器|TUI 只请求 launch URL' \
  docs/superpowers/plans/2026-05-30-gui-host/00-roadmap.md
```

Expected: output confirms `06 TUI /gui command` comes after `05`, `/gui` uses primary thread, and TUI only requests/displays the URL.

- [ ] **Step 2: Confirm app-server-client facade exists**

Run from repo root:

```bash
rg -n 'pub trait AppServerClientGuiExt|pub struct GuiLaunchUrl|pub enum GuiLaunchError|pub async fn launch_gui_for_thread|UnsupportedRemote' \
  codex-rs/app-server-client/src/gui.rs
```

Expected: output includes the public extension trait, URL type, error type, in-process launch method, and remote unsupported path.

- [ ] **Step 3: Add facade imports to `app_server_session.rs`**

Edit `codex-rs/tui/src/app_server_session.rs` near the existing `codex_app_server_client` imports:

```rust
use codex_app_server_client::AppServerClientGuiExt;
use codex_app_server_client::GuiLaunchError;
use codex_app_server_client::GuiLaunchUrl;
```

- [ ] **Step 4: Add the TUI-local GUI launch wrapper**

Edit `impl AppServerSession` in `codex-rs/tui/src/app_server_session.rs`, near the other one-call session facade methods:

```rust
    pub(crate) async fn launch_gui_for_thread(
        &self,
        thread_id: ThreadId,
    ) -> Result<GuiLaunchUrl, GuiLaunchError> {
        self.client.launch_gui_for_thread(thread_id).await
    }
```

Do not add an app-server protocol request. Do not expose `GuiHostManager`.

- [ ] **Step 5: Run the focused wrapper compile check**

Run from `codex-rs`:

```bash
just test -p codex-tui gui_launch_message
```

Expected: this may initially fail because `gui_launch_message` does not exist yet. There must be no error saying `AppServerClientGuiExt`, `GuiLaunchError`, or `GuiLaunchUrl` is unresolved after Task 1 imports and method are added.

## Task 2: Add Slash Command And AppCommand Surface

**Files:**
- Modify: `codex-rs/tui/src/app_command.rs`
- Modify: `codex-rs/tui/src/slash_command.rs`
- Modify: `codex-rs/tui/src/chatwidget/slash_dispatch.rs`
- Modify: `codex-rs/tui/src/chatwidget/tests/slash_commands.rs`

- [ ] **Step 1: Add `LaunchGui` to `AppCommand`**

Edit `codex-rs/tui/src/app_command.rs`.

Add the variant near the other local command variants:

```rust
    LaunchGui,
```

Add this constructor in `impl AppCommand` near `compact()` / `set_thread_name()`:

```rust
    pub(crate) fn launch_gui() -> Self {
        Self::LaunchGui
    }
```

- [ ] **Step 2: Register `/gui` in `SlashCommand`**

Edit `codex-rs/tui/src/slash_command.rs`.

Add the enum variant near `Status`, because it is a session utility command:

```rust
    Gui,
```

Add the popup description:

```rust
            SlashCommand::Gui => "show the local GUI URL for this chat",
```

Do not add `SlashCommand::Gui` to `supports_inline_args`; `/gui` takes no args in this plan.

Do not add `SlashCommand::Gui` to `available_in_side_conversation`;首版 must use the primary thread, not a side conversation.

Add `SlashCommand::Gui` to the `available_during_task` true group with `Status` and `Diff`:

```rust
            | SlashCommand::Gui
```

- [ ] **Step 3: Dispatch bare `/gui`**

Edit `codex-rs/tui/src/chatwidget/slash_dispatch.rs`.

In `dispatch_command`, add this arm near `SlashCommand::Status`:

```rust
            SlashCommand::Gui => {
                self.submit_op(AppCommand::launch_gui());
            }
```

In `queued slash` drain classification near the commands that can continue after dispatch, add:

```rust
            | SlashCommand::Gui
```

Do not add an inline-args branch for `SlashCommand::Gui`.

- [ ] **Step 4: Add slash dispatch test**

Edit `codex-rs/tui/src/chatwidget/tests/slash_commands.rs` and add:

```rust
#[tokio::test]
async fn slash_gui_submits_launch_gui_op() {
    let (mut chat, _rx, mut op_rx) = make_chatwidget_manual(/*model_override*/ None).await;

    chat.dispatch_command(SlashCommand::Gui);

    assert_matches!(op_rx.try_recv(), Ok(Op::LaunchGui));
}
```

- [ ] **Step 5: Run the focused slash command test**

Run from `codex-rs`:

```bash
just test -p codex-tui slash_gui_submits_launch_gui_op
```

Expected: the test passes.

## Task 3: Add TUI `/gui` Behavior Module

**Files:**
- Modify: `codex-rs/tui/src/app.rs`
- Create: `codex-rs/tui/src/app/gui.rs`
- Modify: `codex-rs/tui/src/app/tests.rs`

- [ ] **Step 1: Declare the new module**

Edit `codex-rs/tui/src/app.rs` in the module list:

```rust
mod gui;
```

Place it near `event_dispatch` / `history_ui`; do not make it public.

- [ ] **Step 2: Create `app/gui.rs` with message helpers and behavior**

Create `codex-rs/tui/src/app/gui.rs`:

```rust
use super::App;
use crate::app_server_session::AppServerSession;
use codex_protocol::ThreadId;

pub(super) const GUI_NO_PRIMARY_THREAD_MESSAGE: &str =
    "A thread must start before /gui can launch.";

pub(super) fn gui_launch_success_message(url: &str) -> String {
    format!("GUI URL: {url}")
}

pub(super) fn gui_launch_error_message(error: &impl std::fmt::Display) -> String {
    format!("Failed to launch GUI: {error}")
}

fn primary_thread_for_gui(primary_thread_id: Option<ThreadId>) -> Result<ThreadId, &'static str> {
    primary_thread_id.ok_or(GUI_NO_PRIMARY_THREAD_MESSAGE)
}

impl App {
    pub(super) async fn launch_gui_for_primary_thread(
        &mut self,
        app_server: &AppServerSession,
    ) {
        let thread_id = match primary_thread_for_gui(self.primary_thread_id) {
            Ok(thread_id) => thread_id,
            Err(message) => {
                self.chat_widget.add_error_message(message.to_string());
                return;
            }
        };

        match app_server.launch_gui_for_thread(thread_id).await {
            Ok(url) => self
                .chat_widget
                .add_info_message(gui_launch_success_message(url.as_str()), /*hint*/ None),
            Err(error) => self
                .chat_widget
                .add_error_message(gui_launch_error_message(&error)),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn primary_thread_for_gui_requires_primary_thread() {
        assert_eq!(
            primary_thread_for_gui(None),
            Err(GUI_NO_PRIMARY_THREAD_MESSAGE)
        );
    }

    #[test]
    fn primary_thread_for_gui_returns_primary_thread() {
        let thread_id = ThreadId::new();

        assert_eq!(
            primary_thread_for_gui(Some(thread_id)),
            Ok(thread_id)
        );
    }

    #[test]
    fn gui_launch_message_formats_url_without_opening_browser() {
        assert_eq!(
            gui_launch_success_message(
                "http://127.0.0.1:12345/?threadId=00000000-0000-0000-0000-000000000606#token=test"
            ),
            "GUI URL: http://127.0.0.1:12345/?threadId=00000000-0000-0000-0000-000000000606#token=test"
        );
    }
}
```

The success message deliberately only displays the URL. Do not add browser-opening code.

- [ ] **Step 3: Add app-level snapshots for rendered messages**

Edit `codex-rs/tui/src/app/tests.rs` and add these tests near other simple snapshot tests:

```rust
#[test]
fn gui_launch_url_message_snapshot() {
    let rendered = lines_to_single_string(
        &history_cell::new_info_event(
            gui::gui_launch_success_message(
                "http://127.0.0.1:12345/?threadId=00000000-0000-0000-0000-000000000606#token=test",
            ),
            /*hint*/ None,
        )
        .display_lines(/*width*/ 100),
    );

    assert_app_snapshot!("gui_launch_url_message", rendered);
}

#[test]
fn gui_launch_missing_primary_thread_message_snapshot() {
    let rendered = lines_to_single_string(
        &history_cell::new_error_event(gui::GUI_NO_PRIMARY_THREAD_MESSAGE.to_string())
            .display_lines(/*width*/ 100),
    );

    assert_app_snapshot!("gui_launch_missing_primary_thread_message", rendered);
}
```

If the compiler cannot access `gui::...` from `app/tests.rs`, use `super::gui::...` exactly where the module path requires it; keep the helper names unchanged.

- [ ] **Step 4: Run helper and snapshot tests**

Run from `codex-rs`:

```bash
just test -p codex-tui gui_launch
```

Expected: tests pass or generate new `.snap.new` files for the two new snapshots.

- [ ] **Step 5: Review and accept intended snapshots**

If `.snap.new` files were produced, inspect them:

```bash
cargo insta pending-snapshots -p codex-tui
cargo insta show -p codex-tui tui/src/snapshots/codex_tui__app__tests__gui_launch_url_message.snap.new
cargo insta show -p codex-tui tui/src/snapshots/codex_tui__app__tests__gui_launch_missing_primary_thread_message.snap.new
```

Expected: snapshots show only the intended `/gui` success and missing-primary-thread transcript messages.

Accept only after reviewing:

```bash
cargo insta accept -p codex-tui
```

## Task 4: Wire AppCommand To App Behavior

**Files:**
- Modify: `codex-rs/tui/src/app/thread_routing.rs`
- Test: `codex-rs/tui/src/app/gui.rs`
- Test: `codex-rs/tui/src/chatwidget/tests/slash_commands.rs`

- [ ] **Step 1: Route `AppCommand::LaunchGui`**

Edit `codex-rs/tui/src/app/thread_routing.rs` in `try_submit_active_thread_op_via_app_server`.

Add this arm before `AppCommand::UserTurn { .. }`:

```rust
            AppCommand::LaunchGui => {
                self.launch_gui_for_primary_thread(app_server).await;
                Ok(true)
            }
```

This handler intentionally ignores the active `thread_id` argument and uses `self.primary_thread_id` inside `app/gui.rs`.

- [ ] **Step 2: Confirm no direct GUI host dependencies entered TUI**

Run from repo root:

```bash
rg -n 'codex_gui_host|codex-gui-host|codex_app_server::GuiHostManager|codex-app-server =|GuiHostManager' codex-rs/tui
```

Expected: no output. TUI may mention `GuiLaunchUrl` or `AppServerClientGuiExt`, but it must not mention `codex_gui_host`, `GuiHostManager`, or a direct `codex-app-server` dependency.

- [ ] **Step 3: Run focused TUI command tests**

Run from `codex-rs`:

```bash
just test -p codex-tui slash_gui_submits_launch_gui_op
just test -p codex-tui gui_launch
```

Expected: both commands pass.

## Task 5: Final Verification And Handoff

**Files:**
- Verify: all files changed in this plan
- Verify: `codex-rs/tui/src/snapshots/**` if snapshots changed

- [ ] **Step 1: Confirm scope**

Run from repo root:

```bash
git status --short | rg -v '^( M| A|AM|MM|\\?\\?) (codex-rs/tui/src/app\.rs|codex-rs/tui/src/app/gui\.rs|codex-rs/tui/src/app/thread_routing\.rs|codex-rs/tui/src/app/tests\.rs|codex-rs/tui/src/app_command\.rs|codex-rs/tui/src/app_server_session\.rs|codex-rs/tui/src/chatwidget/slash_dispatch\.rs|codex-rs/tui/src/chatwidget/tests/slash_commands\.rs|codex-rs/tui/src/slash_command\.rs|codex-rs/tui/src/snapshots/.*\.snap)$'
```

Expected: no output. If any app-server, app-server-client, gui-host, frontend, protocol, Cargo, Bazel, unrelated docs path, or unexpected untracked file appears, stop and remove or explicitly account for it.

- [ ] **Step 2: Run scoped TUI tests**

Run from `codex-rs`:

```bash
just test -p codex-tui slash_gui
just test -p codex-tui gui_launch
```

Expected: both pass.

Do not run naked `cargo test`.

- [ ] **Step 3: Format Rust changes**

Run from `codex-rs`:

```bash
just fmt
```

Expected: formatting completes. Do not rerun tests solely because `just fmt` ran.

- [ ] **Step 4: Run scoped fix**

Run from `codex-rs`:

```bash
just fix -p codex-tui
```

Expected: lint fixes complete or any environment failure is recorded. Do not rerun tests solely because `just fix` ran.

- [ ] **Step 5: Check textual diff hygiene**

Run from repo root:

```bash
git diff --check
```

Expected: no whitespace errors.

- [ ] **Step 6: Stop before frontend work**

After `06` implementation is complete, stop. Do not write or implement `07` in the same task unless the user explicitly asks after reviewing `/gui`.

Allowed next plan after this one:

- `07-frontend-handshake-store-verification.md`

Not allowed as part of this plan:

- `codex-gui/**`
- `codex-rs/app-server/**`
- `codex-rs/app-server-client/**`
- `codex-rs/gui-host/**`
- app-server protocol v2 API changes
- browser auto-open behavior
- `/gui --open`, `/gui --current`, or `/gui <threadId>`

## Self-Review Checklist

- [x] This plan only implements TUI `/gui`.
- [x] This plan uses `05` app-server-client facade instead of direct app-server/gui-host dependencies.
- [x] This plan keeps `/gui` primary-thread-only.
- [x] This plan displays the launch URL and never opens a browser.
- [x] This plan does not add protocol, frontend, app-server, app-server-client, gui-host, Cargo, or lockfile changes.
- [x] This plan includes snapshot coverage for user-visible `/gui` output.
- [x] This plan uses `just test -p codex-tui ...`, `just fmt`, and `just fix -p codex-tui`; it does not use naked `cargo test`.
