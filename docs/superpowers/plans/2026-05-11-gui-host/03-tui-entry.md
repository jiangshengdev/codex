# Codex GUI TUI Entry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the `/gui` slash command as a thin TUI entry that starts or reuses the local GUI host and prints a URL.

**Architecture:** TUI owns command dispatch and GUI host lifecycle only; it must not parse or forward projection data. The GUI backend is available only for embedded app-server sessions through `codex-app-server-client`; remote app-server sessions return `None` and `/gui` prints an explanatory message.

**Tech Stack:** Rust 2024, codex-tui, codex-gui-host, codex-app-server-client.

---

Source spec: `docs/superpowers/specs/2026-05-11-codex-gui-host-redesign.md`.

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
- Modify: `codex-rs/tui/src/app_server_session.rs`
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
    async fn open_gui_with_primary_thread_but_no_backend_prints_local_only_message() {
        let mut app = make_test_app().await;
        let thread_id = ThreadId::from_string("00000000-0000-0000-0000-000000000001").unwrap();
        app.primary_thread_id = Some(thread_id);
        app.open_gui().await.unwrap();
        assert!(app.gui_host.is_none());
    }
}
```

- [ ] **Step 2: Run tests to verify FAIL**

Run:

```bash
cargo test -p codex-tui gui_slash_command_is_registered gui_command_emits_open_gui_event open_gui_without_primary_thread_prints_not_ready
```

Expected failures include missing `SlashCommand::Gui`, `AppEvent::OpenGui`, `app/gui.rs`, and `gui_host` field.

Do not add a production no-op backend just for TUI tests. The app-server-client bridge tests in `02-app-server-bridge.md` cover real backend connectivity.

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

`GuiBackendHandle` is introduced and re-exported by `codex-rs/app-server-client/src/lib.rs` in Task 7. `codex-tui` must use that app-server-client type and must not add a direct `codex-app-server` dependency.

Initialize both fields in all `App` constructors/test helpers:

- `codex-rs/tui/src/app.rs:864-912` (primary `App::new` constructor)
- `codex-rs/tui/src/app/test_support.rs:10-17` (`make_test_app`)
- `codex-rs/tui/src/app/tests.rs:3859` — `tests.rs` 内 `make_test_app`
- `codex-rs/tui/src/app/tests.rs:3922` — `tests.rs` 内第二处 `App { ... }` 字面量

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

Add a getter to `codex-rs/tui/src/app_server_session.rs`:

```rust
impl AppServerSession {
    pub(crate) fn gui_backend(&self) -> Option<codex_app_server_client::GuiBackendHandle> {
        self.client.gui_backend()
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

In `codex-rs/tui/src/lib.rs`, after starting `AppServerSession`, obtain the backend handle and pass it into `App::new`:

```rust
let gui_backend = app_server.gui_backend();
let mut app = App::new(/* existing args */, gui_backend);
```

Add `gui_backend: Option<codex_app_server_client::GuiBackendHandle>` as a new parameter to `App::new` (defined in `codex-rs/tui/src/app.rs`). Assign it directly in the constructor body:

```rust
gui_backend,
```

Remote app-server sessions pass `None` from `codex-rs/tui/src/lib.rs`. The four constructor sites listed above must all be updated to supply the new parameter (pass `None` for test helpers and inline test constructors).

Remote app-server sessions must return `None`, so `/gui` prints:

```text
GUI is available only for local embedded app-server sessions.
```

- [ ] **Step 4: Run tests to verify PASS**

Run:

```bash
cargo test -p codex-tui gui_slash_command_is_registered gui_command_emits_open_gui_event open_gui_without_primary_thread_prints_not_ready open_gui_with_primary_thread_but_no_backend_prints_local_only_message
```

Expected:

```text
test gui_slash_command_is_registered ... ok
test gui_command_emits_open_gui_event ... ok
test app::gui::tests::open_gui_without_primary_thread_prints_not_ready ... ok
test app::gui::tests::open_gui_with_primary_thread_but_no_backend_prints_local_only_message ... ok
```

- [ ] **Step 5: Commit**

```bash
git add codex-rs/tui codex-rs/Cargo.lock
git commit -m "feat(tui): add thin GUI launch entry"
```

---
