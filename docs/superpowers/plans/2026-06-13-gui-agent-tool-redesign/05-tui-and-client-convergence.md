# TUI And App-Server Client GUI Convergence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 TUI `/gui` 继续在对话中展示 GUI URLs，但不再由 app-server-client 自己持有 GUI host；它应请求 app-server 内部共享 `GuiLaunchService`。

**Architecture:** TUI 保持 `/gui` command UX。`codex-app-server-client` 保留 `AppServerClientGuiExt` facade，但实现改为调用 app-server request/local command，最终落到 app-server-owned service。agent tool 和 TUI 共用 host lifecycle。

**Tech Stack:** Rust 2024, codex-app-server-client, codex-tui, app-server JSON-RPC/client command, ratatui snapshots.

---

## Files

- Modify: `codex-rs/app-server-client/src/gui.rs`
- Modify: `codex-rs/app-server-client/src/lib.rs`
- Modify if needed: `codex-rs/app-server/src/message_processor.rs`
- Modify if app-server protocol method is needed: `codex-rs/app-server-protocol/src/protocol/v2.rs`
- Modify if app-server protocol method is needed: `codex-rs/app-server/README.md`
- Modify: `codex-rs/tui/src/app/gui.rs`
- Test: `codex-rs/app-server-client/src/lib.rs` tests
- Test: `codex-rs/tui/src/app/gui.rs` tests and existing snapshots

## Task 1: Pick Client Request Shape

- [ ] **Step 1: Prefer internal client command if no public app-server API is needed**

Use an internal app-server-client command when TUI is the only non-agent caller:

```rust
ClientCommand::LaunchGui {
    thread_id,
    response_tx,
}
```

But the command must route to app-server-owned `GuiLaunchService`, not construct `GuiHostManager` inside app-server-client.

- [ ] **Step 2: Use v2 API only if Codex App needs to call `/gui` directly**

If implementation requires a public app-server API, add a v2 method such as `gui/launch` with:

```rust
pub struct GuiLaunchParams {
    pub thread_id: String,
}

pub struct GuiLaunchResponse {
    pub urls: Vec<GuiLaunchUrlEntry>,
}
```

If adding v2 API, follow app-server API rules in `AGENTS.md`, update `app-server/README.md`, run `just write-app-server-schema`, and include generated schema/TS changes. Do not add v1 API.

Stop and ask for design review before adding public API if an internal command is enough.

## Task 2: Update App-Server Client Facade

- [ ] **Step 1: Add regression test**

In `app-server-client/src/lib.rs` tests, update or add:

```rust
#[tokio::test]
async fn in_process_launch_gui_uses_app_server_service() {
    let client = tests::start_in_process_client().await;
    let thread_id = codex_protocol::ThreadId::from_string(
        "00000000-0000-0000-0000-0000000000a1",
    )
    .expect("valid thread id");

    let urls = client
        .launch_gui_for_thread(thread_id)
        .await
        .expect("launch should succeed");

    assert!(urls.entries[0].url.contains("threadId=00000000-0000-0000-0000-0000000000a1"));
}
```

Expected initial result before implementation: fail or hit old client-owned manager path.

- [ ] **Step 2: Remove client-owned host manager state**

In `app-server-client/src/lib.rs`, remove `gui_host_manager` state from the worker loop if present.

`ClientCommand::LaunchGui` should send a request/command into app-server runtime and await response. It must not call:

```rust
new_gui_host_manager(...)
GuiHostManager::new(...)
GuiHost::start(...)
```

from app-server-client.

- [ ] **Step 3: Keep public facade stable**

Keep this API shape in `app-server-client/src/gui.rs`:

```rust
pub trait AppServerClientGuiExt {
    fn launch_gui_for_thread(
        &self,
        thread_id: ThreadId,
    ) -> impl Future<Output = Result<GuiLaunchUrls, GuiLaunchError>> + Send;
}
```

The error message for remote unsupported sessions may change only if subprocess support now makes remote usable. If remote remains unsupported, keep a clear `UnsupportedRemote` error.

## Task 3: Preserve TUI Transcript Behavior

- [ ] **Step 1: Keep `/gui` command entry**

Verify these existing paths still dispatch:

```text
codex-rs/tui/src/slash_command.rs
codex-rs/tui/src/chatwidget/slash_dispatch.rs
codex-rs/tui/src/app_command.rs
codex-rs/tui/src/app/thread_routing.rs
codex-rs/tui/src/app/gui.rs
```

Do not change user-facing command name.

- [ ] **Step 2: Keep message formatting tests**

Run:

```bash
cd codex-rs
just test -p codex-tui gui_launch
```

Expected: tests for missing primary thread and URL line formatting pass. If snapshots are intentionally updated, inspect `.snap.new` files and accept only `codex-tui` snapshots relevant to `/gui`.

## Task 4: Commit

- [ ] **Step 1: Format**

Run:

```bash
cd codex-rs
just fmt
```

- [ ] **Step 2: Commit client/TUI convergence**

Run:

```bash
git status --short
git add codex-rs/app-server-client/src/gui.rs \
  codex-rs/app-server-client/src/lib.rs \
  codex-rs/tui/src/app/gui.rs \
  codex-rs/tui/src/app_server_session.rs \
  codex-rs/tui/src/app/thread_routing.rs \
  codex-rs/tui/src/app_command.rs \
  codex-rs/tui/src/chatwidget/slash_dispatch.rs \
  codex-rs/tui/src/slash_command.rs
git commit -m "refactor(gui): route tui gui launch through app-server service"
```

If app-server protocol/schema files changed, include them in the same commit only if they are required for this facade.
