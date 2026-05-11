# Codex GUI TUI Entry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the `/gui` slash command as a thin TUI entry that starts or reuses the local GUI host and prints a URL.

**Architecture:** This plan is copied from original Task 8. TUI owns command dispatch and host lifecycle only; it must not parse or forward projection data.

**Tech Stack:** Rust 2024, codex-tui, codex-gui-host, codex-app-server-client.

---

Source: split from `docs/superpowers/plans/2026-05-11-codex-gui-host-redesign.md`. The source file is deleted after this split because these files replace it.

### Task 8: Wire `/gui` thin entry in TUI

**Files:**
- Modify: `codex-rs/tui/Cargo.toml`
- Modify: `codex-rs/tui/src/app_event.rs`
- Modify: `codex-rs/tui/src/slash_command.rs`
- Modify: `codex-rs/tui/src/chatwidget/slash_dispatch.rs`
- Create: `codex-rs/tui/src/app/gui.rs`
- Modify: `codex-rs/tui/src/app.rs`
- Modify: `codex-rs/tui/src/app/event_dispatch.rs`
- Modify: `codex-rs/tui/src/lib.rs`
- Test: `codex-rs/tui/src/chatwidget/tests/slash_commands.rs`
- Test: `codex-rs/tui/src/app/gui.rs`

- [ ] **Step 1: Write failing tests**

Add to `codex-rs/tui/src/chatwidget/tests/slash_commands.rs`:

```rust
#[test]
fn gui_slash_command_is_registered() {
    assert_eq!(SlashCommand::from_str("gui"), Ok(SlashCommand::Gui));
    assert!(SlashCommand::Gui.description().contains("Open GUI"));
    assert!(SlashCommand::Gui.is_visible());
}

#[tokio::test]
async fn gui_command_emits_open_gui_event() {
    let (mut chat, mut rx, _op_rx) = make_chatwidget_manual(/*model_override*/ None).await;
    chat.dispatch_command(SlashCommand::Gui);
    assert_matches!(rx.try_recv(), Ok(AppEvent::OpenGui));
}
```

Create `codex-rs/tui/src/app/gui.rs`:

```rust
#[cfg(test)]
mod tests {
    use crate::app::test_support::make_test_app;
    use codex_protocol::ThreadId;

    #[tokio::test]
    async fn open_gui_without_primary_thread_prints_not_ready() {
        let mut app = make_test_app().await;
        app.open_gui().await.unwrap();
        assert!(app.gui_host.is_none());
    }

    #[tokio::test]
    async fn open_gui_prints_url_for_primary_thread() {
        let mut app = make_test_app().await;
        let thread_id = ThreadId::from_string("00000000-0000-0000-0000-000000000001").unwrap();
        app.primary_thread_id = Some(thread_id);
        app.open_gui().await.unwrap();
        assert!(app.gui_host.is_some());
    }
}
```

- [ ] **Step 2: Run tests to verify FAIL**

Run:

```bash
cargo test -p codex-tui gui_slash_command_is_registered gui_command_emits_open_gui_event open_gui_without_primary_thread_prints_not_ready
```

Expected failures include missing `SlashCommand::Gui`, `AppEvent::OpenGui`, `app/gui.rs`, and `gui_host` field.

- [ ] **Step 3: Implement TUI thin entry**

Modify `codex-rs/tui/Cargo.toml`:

```toml
[dependencies]
codex-gui-host = { workspace = true }
```

Add to `AppEvent` in `codex-rs/tui/src/app_event.rs`:

```rust
OpenGui,
```

Add `Gui` to `SlashCommand` and metadata in `codex-rs/tui/src/slash_command.rs`:

```rust
Gui,
```

Description:

```rust
SlashCommand::Gui => "Open GUI for the primary thread",
```

Dispatch in `codex-rs/tui/src/chatwidget/slash_dispatch.rs`:

```rust
SlashCommand::Gui => {
    self.app_event_tx.send(AppEvent::OpenGui);
}
```

Add `mod gui;` to the app module list in `codex-rs/tui/src/app.rs`.

Add fields to `App`:

```rust
gui_host: Option<codex_gui_host::GuiHostHandle>,
gui_backend: Option<codex_app_server_client::GuiBackendHandle>,
```

Initialize both fields in all `App` constructors/test helpers:

```rust
gui_host: None,
gui_backend: None,
```

Replace `codex-rs/tui/src/app/gui.rs` with:

```rust
use super::*;
use codex_gui_host::GuiHost;
use codex_gui_host::GuiHostConfig;
use codex_gui_host::GuiHostMode;

impl App {
    pub(crate) async fn open_gui(&mut self) -> anyhow::Result<()> {
        let Some(thread_id) = self.primary_thread_id else {
            self.chat_widget.add_info_message(
                "Current session is not ready to open GUI.".to_string(),
                /*hint*/ None,
            );
            return Ok(());
        };

        let Some(backend) = self.gui_backend.clone() else {
            self.chat_widget.add_info_message(
                "GUI is available only for local embedded app-server sessions.".to_string(),
                /*hint*/ None,
            );
            return Ok(());
        };

        if self.gui_host.is_none() {
            let mode = GuiHostMode::default_for_profile()?;
            self.gui_host = Some(GuiHost::start(GuiHostConfig { mode }, backend).await?);
        }
        let url = self
            .gui_host
            .as_ref()
            .expect("GUI host should exist")
            .launch_url_for_thread(thread_id);
        self.chat_widget.add_info_message(
            format!("GUI ready:\n{url}\nOpen this URL in a browser on this machine."),
            /*hint*/ None,
        );
        Ok(())
    }

    pub(crate) async fn shutdown_gui_host(&mut self) {
        if let Some(handle) = self.gui_host.take() {
            handle.shutdown().await;
        }
    }
}
```

Handle event in `codex-rs/tui/src/app/event_dispatch.rs`:

```rust
AppEvent::OpenGui => {
    if let Err(err) = self.open_gui().await {
        self.chat_widget
            .add_error_message(format!("Failed to open GUI: {err}"));
    }
}
```

In `codex-rs/tui/src/lib.rs`, after starting `AppServerSession`, set GUI backend for embedded sessions:

```rust
let gui_backend = app_server.gui_backend();
```

Pass that optional backend into `App::run` or set it on `App` immediately after construction. Remote app-server sessions must return `None`.

- [ ] **Step 4: Run tests to verify PASS**

Run:

```bash
cargo test -p codex-tui gui_slash_command_is_registered gui_command_emits_open_gui_event open_gui_without_primary_thread_prints_not_ready
```

Expected:

```text
test gui_slash_command_is_registered ... ok
test gui_command_emits_open_gui_event ... ok
test app::gui::tests::open_gui_without_primary_thread_prints_not_ready ... ok
```

- [ ] **Step 5: Commit**

```bash
git add codex-rs/tui codex-rs/Cargo.lock
git commit -m "feat(tui): add thin GUI launch entry"
```

---
