# Codex GUI TUI Command Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `codex-tui` 中新增最小 `/gui` slash command：向当前 app-server session 请求 GUI launch URL，并把本机 URL 显示在 transcript 中。

**Architecture:** TUI 只做 slash command dispatch、调用 app-server-client facade、展示结果。`codex-app-server-client::AppServerClientGuiExt` 已经由 `AppServerClient` facade enum 实现，因此 `AppServerSession` 只需要一个薄 wrapper；TUI 不拥有 `GuiHost`、不直接依赖 `codex-app-server` 或 `codex-gui-host`、不转发 GUI JSON-RPC traffic。

**Tech Stack:** Rust 2024, codex-tui, codex-app-server-client, ratatui, insta snapshots.

---

## Source Of Truth

- Roadmap: `docs/superpowers/plans/2026-05-30-gui-host/00-roadmap.md`
- App-server client facade plan: `docs/superpowers/plans/2026-05-30-gui-host/04-app-server-client-facade.md`
- 主设计：`docs/superpowers/specs/2026-05-11-codex-gui-host-redesign.md`
- 当前 `dev` 适配设计：`docs/superpowers/specs/2026-05-30-codex-gui-host-dev-adaptation-design.md`
- 旧分支参考：
  - `port/lazy-proj-130:docs/superpowers/plans/2026-05-11-gui-host/03-tui-entry.md`
  - `port/lazy-proj-130:codex-rs/tui/src/app/gui.rs`
  - `port/lazy-proj-130:codex-rs/tui/src/app_server_session.rs`
  - `port/lazy-proj-130:codex-rs/tui/src/app/event_dispatch.rs`
  - `port/lazy-proj-130:codex-rs/tui/src/slash_command.rs`
  - `port/lazy-proj-130:codex-rs/tui/src/chatwidget/slash_dispatch.rs`

旧分支计划使用 `cargo test`，当前 `dev` 必须使用 `just test`。旧分支 `AppServerSession::gui_launch_url` 手动 match `InProcess` / `Remote`；当前 `04` 已让 `AppServerClient` enum 实现 `AppServerClientGuiExt`，因此当前实现应优先调用 facade enum trait method，避免重复 match。

## Scope

### In Scope

- Create: `codex-rs/tui/src/app/gui.rs`
- Modify: `codex-rs/tui/src/app.rs`
- Modify: `codex-rs/tui/src/app_event.rs`
- Modify: `codex-rs/tui/src/app/event_dispatch.rs`
- Modify: `codex-rs/tui/src/app_server_session.rs`
- Modify: `codex-rs/tui/src/slash_command.rs`
- Modify: `codex-rs/tui/src/chatwidget/slash_dispatch.rs`
- Modify tests if needed: `codex-rs/tui/src/chatwidget/tests/slash_commands.rs`

### Out Of Scope

- 不改 `codex-rs/tui/Cargo.toml`
- 不给 `codex-tui` 添加 `codex-app-server` 或 `codex-gui-host` 依赖
- 不导入 `GuiHost`、`GuiHostHandle`、`GuiHostConfig`、`GuiHostMode`
- 不给 `App` 添加 GUI runtime ownership 字段
- 不打开系统浏览器
- 不缓存 `GuiLaunchUrl`
- 不实现 projection viewer、detach、remote GUI、LAN/mobile/public relay
- 不改 `codex-rs/app-server-client/**`
- 不改 `codex-rs/app-server/**`
- 不改 `codex-gui/**`

## Current Baseline

- `codex-rs/tui/src/app/gui.rs` 当前不存在。
- `codex-rs/tui/src/app.rs` 尚未声明 `mod gui;`。
- `AppEvent` 尚无 `OpenGui` variant。
- `SlashCommand` 尚无 `Gui` variant。
- `chatwidget/slash_dispatch.rs` 尚无 `/gui` dispatch。
- `AppServerSession` 当前持有 `AppServerClient`，而 `codex-app-server-client` 已导出：
  - `AppServerClientGuiExt`
  - `GuiLaunchError`
  - `GuiLaunchUrl`
- `codex-tui` 已依赖 `codex-app-server-client`，无需 Cargo 变更。

## Hard Constraints

- `/gui` 首版只显示本机 URL，不自动打开浏览器。
- `/gui` 每次调用都重新请求 launch URL。
- `/gui` 使用 primary thread id；如果 primary thread 尚未 ready，显示 not-ready 信息，不调用 app-server-client facade。
- `/gui` 在 side conversation 中仍可触发，但目标仍是 primary thread，不跟随 side thread。
- `/gui` 在 task running 时仍可触发。
- Remote session 必须显示 unsupported 信息，不 panic。
- Transport error 必须显示 error message。
- TUI 不转发 GUI JSON-RPC traffic。
- TUI 不新增直接 `codex-app-server` / `codex-gui-host` dependency。
- 可见 transcript 文案必须有 focused rendering/unit coverage；若实现改动已有 snapshot-covered surfaces，按 repo snapshot 流程 review/accept。

## File Boundary

### `codex-rs/tui/src/app/gui.rs`

Owns:

- `App::open_gui(&mut self, app_server: &AppServerSession)`
- `launch_result_message`
- `GuiLaunchMessage`
- small launcher/sink traits used only for tests
- focused tests for URL / unsupported / transport error / no primary thread / primary thread call

Does not own:

- slash command metadata
- event dispatch enum
- browser opening
- GUI host lifecycle

### `codex-rs/tui/src/app_server_session.rs`

Owns only:

- `AppServerSession::gui_launch_url(primary_thread_id: ThreadId)`
- local import of `AppServerClientGuiExt`, `GuiLaunchError`, `GuiLaunchUrl`

### Slash Command Wiring

- `app_event.rs` owns `AppEvent::OpenGui`
- `slash_command.rs` owns `/gui` command metadata
- `chatwidget/slash_dispatch.rs` emits `AppEvent::OpenGui`
- `app/event_dispatch.rs` routes `AppEvent::OpenGui` to `App::open_gui`

## Task 0: Baseline Verification

**Files:**
- Verify: `codex-rs/tui/src/app/gui.rs`
- Verify: `codex-rs/tui/src/app.rs`
- Verify: `codex-rs/tui/src/app_server_session.rs`
- Verify: `codex-rs/tui/src/slash_command.rs`
- Verify: `codex-rs/tui/src/chatwidget/slash_dispatch.rs`

- [ ] **Step 1: Confirm worktree is clean**

Run from repo root:

```bash
git status --short
```

Expected: no output.

- [ ] **Step 2: Confirm prerequisite facade exists**

Run from repo root:

```bash
rg -n "AppServerClientGuiExt|GuiLaunchError|GuiLaunchUrl" codex-rs/app-server-client/src
```

Expected: all three symbols exist.

- [ ] **Step 3: Confirm TUI does not already contain `/gui` wiring**

Run from repo root:

```bash
test ! -f codex-rs/tui/src/app/gui.rs
rg -n "OpenGui|SlashCommand::Gui|gui_launch_url" codex-rs/tui/src || true
```

Expected: `test ! -f` exits 0, and `rg` has no output. If any command wiring already exists, inspect before editing.

## Task 1: Register `/gui` slash command and event

**Files:**
- Modify: `codex-rs/tui/src/app_event.rs`
- Modify: `codex-rs/tui/src/slash_command.rs`
- Modify: `codex-rs/tui/src/chatwidget/slash_dispatch.rs`
- Test: `codex-rs/tui/src/slash_command.rs`
- Test: `codex-rs/tui/src/chatwidget/tests/slash_commands.rs`

- [ ] **Step 1: Add failing slash command tests**

Add to `codex-rs/tui/src/slash_command.rs` tests:

```rust
#[test]
fn gui_command_is_visible_and_available() {
    assert_eq!(SlashCommand::from_str("gui"), Ok(SlashCommand::Gui));
    assert_eq!(SlashCommand::Gui.command(), "gui");
    assert_eq!(
        SlashCommand::Gui.description(),
        "open GUI for the primary thread"
    );
    assert!(SlashCommand::Gui.available_during_task());
    assert!(SlashCommand::Gui.available_in_side_conversation());
    assert!(!SlashCommand::Gui.supports_inline_args());
}
```

Add to `codex-rs/tui/src/chatwidget/tests/slash_commands.rs`:

```rust
#[tokio::test]
async fn gui_command_emits_open_gui_event() {
    let (mut chat, mut rx, _op_rx) = make_chatwidget_manual(/*model_override*/ None).await;

    chat.dispatch_command(SlashCommand::Gui);

    assert_matches!(rx.try_recv(), Ok(AppEvent::OpenGui));
}
```

- [ ] **Step 2: Run tests and confirm RED**

Run from `codex-rs`:

```bash
just test -p codex-tui gui_command
```

Expected: FAIL with missing `SlashCommand::Gui` and `AppEvent::OpenGui`.

- [ ] **Step 3: Add app event variant**

In `codex-rs/tui/src/app_event.rs`, near other app-level open actions, add:

```rust
    /// Request a browser launch URL for the primary thread GUI.
    OpenGui,
```

- [ ] **Step 4: Add slash command metadata**

In `codex-rs/tui/src/slash_command.rs`, add `Gui` near `Fork` / `Init` in presentation order:

```rust
    Fork,
    Gui,
    Init,
```

Add description arm:

```rust
            SlashCommand::Gui => "open GUI for the primary thread",
```

Add `SlashCommand::Gui` to `available_in_side_conversation` true arm because `/gui` still targets primary thread while invoked from a side conversation.

Add `SlashCommand::Gui` to `available_during_task` true arm.

Do not add it to `supports_inline_args`.

- [ ] **Step 5: Dispatch `/gui` to app event**

In `codex-rs/tui/src/chatwidget/slash_dispatch.rs`, add:

```rust
            SlashCommand::Gui => {
                self.app_event_tx.send(AppEvent::OpenGui);
            }
```

- [ ] **Step 6: Run tests and confirm GREEN**

Run from `codex-rs`:

```bash
just test -p codex-tui gui_command
```

Expected: the slash command metadata and dispatch tests pass.

## Task 2: Add app-server session GUI wrapper

**Files:**
- Modify: `codex-rs/tui/src/app_server_session.rs`

- [ ] **Step 1: Add imports**

At the top of `codex-rs/tui/src/app_server_session.rs`, add:

```rust
use codex_app_server_client::AppServerClientGuiExt;
use codex_app_server_client::GuiLaunchError;
use codex_app_server_client::GuiLaunchUrl;
```

- [ ] **Step 2: Add wrapper method**

Inside `impl AppServerSession`, add:

```rust
    pub(crate) async fn gui_launch_url(
        &self,
        primary_thread_id: ThreadId,
    ) -> Result<GuiLaunchUrl, GuiLaunchError> {
        self.client.gui_launch_url(&primary_thread_id.to_string()).await
    }
```

Do not match `AppServerClient::InProcess` / `Remote` here; the enum facade already implements `AppServerClientGuiExt`.

- [ ] **Step 3: Verify compile through focused tests after Task 3**

No standalone test is required for this wrapper. It is covered by `app/gui.rs` tests through `GuiLauncher` and by the Task 4 event dispatch compile path.

## Task 3: Implement `App::open_gui`

**Files:**
- Create: `codex-rs/tui/src/app/gui.rs`
- Modify: `codex-rs/tui/src/app.rs`
- Test: `codex-rs/tui/src/app/gui.rs`

- [ ] **Step 1: Add module declaration**

In `codex-rs/tui/src/app.rs`, near other app submodules, add:

```rust
mod gui;
```

- [ ] **Step 2: Add failing focused tests**

Create `codex-rs/tui/src/app/gui.rs` with test scaffolding and the intended assertions:

```rust
use super::*;
use crate::app_server_session::AppServerSession;
use codex_app_server_client::GuiLaunchError;
use codex_app_server_client::GuiLaunchUrl;
use codex_protocol::ThreadId;

#[derive(Debug, PartialEq, Eq)]
enum GuiLaunchMessage {
    Info(String),
    Error(String),
}

fn launch_result_message(result: Result<GuiLaunchUrl, GuiLaunchError>) -> GuiLaunchMessage {
    match result {
        Ok(launch) => GuiLaunchMessage::Info(format!(
            "GUI ready:\n{}\nOpen this URL in a browser on this machine.",
            launch.url
        )),
        Err(GuiLaunchError::Unsupported) => GuiLaunchMessage::Info(
            "GUI is not available for this app-server session yet.".to_string(),
        ),
        Err(GuiLaunchError::Transport(err)) => {
            GuiLaunchMessage::Error(format!("Failed to open GUI: {err}"))
        }
    }
}
```

Add tests in the same file:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use pretty_assertions::assert_eq;
    use std::sync::Mutex;

    #[test]
    fn launch_url_result_renders_url_message() {
        let message = launch_result_message(Ok(GuiLaunchUrl {
            url: "http://127.0.0.1:4321/?threadId=thread-a#token=secret".to_string(),
        }));

        assert_eq!(
            message,
            GuiLaunchMessage::Info(
                "GUI ready:\nhttp://127.0.0.1:4321/?threadId=thread-a#token=secret\nOpen this URL in a browser on this machine.".to_string()
            )
        );
    }

    #[test]
    fn launch_url_result_renders_unsupported_message() {
        let message = launch_result_message(Err(GuiLaunchError::Unsupported));

        assert_eq!(
            message,
            GuiLaunchMessage::Info(
                "GUI is not available for this app-server session yet.".to_string()
            )
        );
    }

    #[test]
    fn launch_url_result_renders_transport_error() {
        let message = launch_result_message(Err(GuiLaunchError::Transport(
            std::io::Error::new(std::io::ErrorKind::BrokenPipe, "worker stopped"),
        )));

        assert_eq!(
            message,
            GuiLaunchMessage::Error("Failed to open GUI: worker stopped".to_string())
        );
    }

    #[tokio::test]
    async fn open_gui_without_primary_thread_shows_not_ready_info() {
        let launcher = StubGuiLauncher::ok("unused");
        let mut sink = RecordingSink::default();

        open_gui_inner::<_, _>(None, &launcher, &mut sink).await;

        assert!(
            launcher.calls.lock().unwrap().is_empty(),
            "must not call launcher without a primary thread"
        );
        assert!(sink.error.is_empty(), "error path not expected");
        assert_eq!(
            sink.info,
            vec!["Current session is not ready to open GUI.".to_string()]
        );
    }
}
```

- [ ] **Step 3: Run tests and confirm RED**

Run from `codex-rs`:

```bash
just test -p codex-tui open_gui_without_primary_thread_shows_not_ready_info
```

Expected: FAIL because `StubGuiLauncher`, `RecordingSink`, and `open_gui_inner` are not implemented yet.

- [ ] **Step 4: Add launcher and sink abstractions**

In `codex-rs/tui/src/app/gui.rs`, after `launch_result_message`, add:

```rust
pub(crate) trait GuiLauncher {
    fn gui_launch_url(
        &self,
        primary_thread_id: ThreadId,
    ) -> impl std::future::Future<Output = Result<GuiLaunchUrl, GuiLaunchError>> + Send;
}

impl GuiLauncher for AppServerSession {
    fn gui_launch_url(
        &self,
        primary_thread_id: ThreadId,
    ) -> impl std::future::Future<Output = Result<GuiLaunchUrl, GuiLaunchError>> + Send {
        AppServerSession::gui_launch_url(self, primary_thread_id)
    }
}

pub(crate) trait GuiMessageSink {
    fn add_info(&mut self, message: String);
    fn add_error(&mut self, message: String);
}

impl GuiMessageSink for ChatWidget {
    fn add_info(&mut self, message: String) {
        self.add_info_message(message, /*hint*/ None);
    }

    fn add_error(&mut self, message: String) {
        self.add_error_message(message);
    }
}
```

- [ ] **Step 5: Implement `open_gui_inner` and `App::open_gui`**

Add:

```rust
impl App {
    pub(crate) async fn open_gui(&mut self, app_server: &AppServerSession) {
        open_gui_inner(self.primary_thread_id, app_server, &mut self.chat_widget).await;
    }
}

pub(crate) async fn open_gui_inner<L, S>(
    primary_thread_id: Option<ThreadId>,
    launcher: &L,
    sink: &mut S,
) where
    L: GuiLauncher + ?Sized,
    S: GuiMessageSink + ?Sized,
{
    let Some(primary_thread_id) = primary_thread_id else {
        sink.add_info("Current session is not ready to open GUI.".to_string());
        return;
    };

    match launch_result_message(launcher.gui_launch_url(primary_thread_id).await) {
        GuiLaunchMessage::Info(message) => sink.add_info(message),
        GuiLaunchMessage::Error(message) => sink.add_error(message),
    }
}
```

- [ ] **Step 6: Complete `open_gui_inner` behavior tests**

Add the missing test helpers before the `open_gui_without_primary_thread_shows_not_ready_info` test:

```rust
struct StubGuiLauncher {
    calls: Mutex<Vec<ThreadId>>,
    response: Mutex<Option<Result<GuiLaunchUrl, GuiLaunchError>>>,
}

impl StubGuiLauncher {
    fn ok(url: &str) -> Self {
        Self {
            calls: Mutex::new(Vec::new()),
            response: Mutex::new(Some(Ok(GuiLaunchUrl {
                url: url.to_string(),
            }))),
        }
    }
}

impl GuiLauncher for StubGuiLauncher {
    fn gui_launch_url(
        &self,
        primary_thread_id: ThreadId,
    ) -> impl std::future::Future<Output = Result<GuiLaunchUrl, GuiLaunchError>> + Send {
        self.calls.lock().unwrap().push(primary_thread_id);
        let response = self
            .response
            .lock()
            .unwrap()
            .take()
            .expect("stub response must be primed before each call");
        async move { response }
    }
}

#[derive(Default)]
struct RecordingSink {
    info: Vec<String>,
    error: Vec<String>,
}

impl GuiMessageSink for RecordingSink {
    fn add_info(&mut self, message: String) {
        self.info.push(message);
    }

    fn add_error(&mut self, message: String) {
        self.error.push(message);
    }
}

fn test_thread_id() -> ThreadId {
    ThreadId::from_string("00000000-0000-0000-0000-000000000001").expect("valid uuid")
}
```

Append the primary-thread behavior test:

```rust

#[tokio::test]
async fn open_gui_with_primary_thread_calls_launcher_and_renders_url() {
    let thread_id = test_thread_id();
    let launcher = StubGuiLauncher::ok(
        "http://127.0.0.1:4321/?threadId=00000000-0000-0000-0000-000000000001#token=secret",
    );
    let mut sink = RecordingSink::default();

    open_gui_inner::<_, _>(Some(thread_id), &launcher, &mut sink).await;

    let calls = launcher.calls.lock().unwrap();
    assert_eq!(calls.len(), 1);
    assert_eq!(calls[0], thread_id);
    assert!(sink.error.is_empty(), "error path not expected on success");
    assert_eq!(sink.info.len(), 1, "exactly one info message expected");
    assert!(sink.info[0].contains("http://127.0.0.1:4321"));
}
```

- [ ] **Step 7: Run focused tests**

Run from `codex-rs`:

```bash
just test -p codex-tui launch_url_result
just test -p codex-tui open_gui_
```

Expected: focused presentation and behavior tests pass.

## Task 4: Route `AppEvent::OpenGui`

**Files:**
- Modify: `codex-rs/tui/src/app/event_dispatch.rs`

- [ ] **Step 1: Add event dispatch arm**

In `codex-rs/tui/src/app/event_dispatch.rs`, near other open/navigation events, add:

```rust
            AppEvent::OpenGui => {
                self.open_gui(app_server).await;
            }
```

- [ ] **Step 2: Run compile-focused tests**

Run from `codex-rs`:

```bash
just test -p codex-tui gui_command
just test -p codex-tui open_gui_
```

Expected: tests pass and `AppEvent` match remains exhaustive.

## Task 5: Final verification and implementation commit

**Files:**
- Verify: `codex-rs/tui/src/app/gui.rs`
- Verify: all TUI files in scope

- [ ] **Step 1: Run format**

Run from `codex-rs`:

```bash
just fmt
```

Expected: command succeeds.

- [ ] **Step 2: Run scoped tests**

Run from `codex-rs`:

```bash
just test -p codex-tui gui_command
just test -p codex-tui launch_url_result
just test -p codex-tui open_gui_
```

Expected: all targeted tests pass.

- [ ] **Step 3: Check snapshot impact**

Run from `codex-rs`:

```bash
cargo insta pending-snapshots -p codex-tui
```

Expected: no pending snapshots. If implementation adds or updates `.snap.new` files, inspect them and accept only intentional `codex-tui` snapshots.

- [ ] **Step 4: Run scoped lint fix**

Run from `codex-rs`:

```bash
just fix -p codex-tui
```

Expected: command succeeds. Do not re-run tests after `fix` unless it makes a functional edit that needs investigation.

- [ ] **Step 5: Check boundaries**

Run from repo root:

```bash
git diff --name-only HEAD | sort
rg -n "codex_gui_host|codex_app_server::|GuiHost|GuiHostHandle|GuiHostConfig|GuiHostMode|open::that|webbrowser" codex-rs/tui/src codex-rs/tui/Cargo.toml
```

Expected:

- `git diff --name-only HEAD | sort` lists only:
  - `codex-rs/tui/src/app/gui.rs`
  - `codex-rs/tui/src/app.rs`
  - `codex-rs/tui/src/app_event.rs`
  - `codex-rs/tui/src/app/event_dispatch.rs`
  - `codex-rs/tui/src/app_server_session.rs`
  - `codex-rs/tui/src/slash_command.rs`
  - `codex-rs/tui/src/chatwidget/slash_dispatch.rs`
  - `codex-rs/tui/src/chatwidget/tests/slash_commands.rs`
- `rg` has no output, except existing unrelated comments if inspected and confirmed.

- [ ] **Step 6: Run whitespace check**

Run from repo root:

```bash
git diff --check
```

Expected: no output.

- [ ] **Step 7: Commit implementation**

```bash
git add codex-rs/tui/src/app/gui.rs codex-rs/tui/src/app.rs codex-rs/tui/src/app_event.rs codex-rs/tui/src/app/event_dispatch.rs codex-rs/tui/src/app_server_session.rs codex-rs/tui/src/slash_command.rs codex-rs/tui/src/chatwidget/slash_dispatch.rs codex-rs/tui/src/chatwidget/tests/slash_commands.rs
git commit -m "feat(gui-host): add TUI gui command"
```

## Acceptance Gates

- `/gui` appears as a visible slash command.
- `/gui` emits `AppEvent::OpenGui`.
- `AppEvent::OpenGui` calls `App::open_gui`.
- `App::open_gui` uses `primary_thread_id`, not active side thread id.
- Missing primary thread displays not-ready info and does not call app-server-client.
- In-process success displays the returned local URL in transcript.
- Remote unsupported displays a non-error unsupported info message.
- Transport failure displays an error message.
- TUI does not open the browser automatically.
- TUI does not import or depend on `codex-gui-host` or direct `codex-app-server`.
- No GUI JSON-RPC traffic is handled in TUI.

## Self-Review Checklist

- [ ] This plan starts from current `dev` state, not old branch assumptions.
- [ ] This plan relies on `AppServerClient` facade trait from `04`, not manual transport matching.
- [ ] This plan keeps `/gui` display-only.
- [ ] This plan does not add TUI dependencies.
- [ ] This plan does not touch app-server, app-server-client, protocol, core, or frontend files.
- [ ] Verification commands use `just`, not direct `cargo test`.
