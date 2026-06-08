# GUI Host Network Launch Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Propagate structured GUI launch URLs from `codex-gui-host` through app-server, app-server-client, and TUI.

**Architecture:** This plan assumes `10-default-network-access-core.md` is complete. It replaces the single `GuiLaunchUrl` facade with structured `GuiLaunchUrls`, keeps remote app-server GUI launch unsupported, updates TUI transcript rendering, and revises stale loopback-only design text.

**Tech Stack:** Rust 2024, codex-app-server, codex-app-server-client, codex-tui, insta snapshots, Markdown docs.

---

## Prerequisite

Complete and commit `docs/superpowers/plans/2026-05-30-gui-host/10-default-network-access-core.md` first.

## Source Design

- `docs/superpowers/specs/2026-06-08-codex-gui-host-default-network-access-design.md`

## Files

- Modify: `codex-rs/app-server/src/gui_host.rs`
- Modify: `codex-rs/app-server-client/src/gui.rs`
- Modify: `codex-rs/app-server-client/src/lib.rs`
- Modify: `codex-rs/tui/src/app_server_session.rs`
- Modify: `codex-rs/tui/src/app/gui.rs`
- Modify: `codex-rs/tui/src/snapshots/*gui_launch*.snap`
- Modify: `docs/superpowers/specs/2026-05-11-codex-gui-host-redesign.md`
- Modify: `docs/superpowers/specs/2026-05-30-codex-gui-host-dev-adaptation-design.md`
- Modify: `docs/superpowers/plans/2026-05-30-gui-host/00-roadmap.md`

Do not modify `codex-rs/gui-host/src/**` in this plan except to fix a direct integration compile issue discovered after Plan 10.

## Task 1: Return `GuiLaunchUrls` from App-Server Manager

**Files:**
- Modify: `codex-rs/app-server/src/gui_host.rs`

- [ ] **Step 1: Add failing manager test**

Update `launch_url_reuses_same_host_for_manager_lifetime` to expect structured URLs:

```rust
let urls_a = manager
    .launch_urls_for_thread(thread_a)
    .await
    .expect("first launch URLs should be created");
let urls_b = manager
    .launch_urls_for_thread(thread_b)
    .await
    .expect("second launch URLs should reuse host");

assert_eq!(urls_a.entries[0].kind, codex_gui_host::GuiLaunchUrlKind::Local);
assert!(urls_a.entries[0].url.contains("threadId=00000000-0000-0000-0000-0000000000a1"));
assert!(urls_b.entries[0].url.contains("threadId=00000000-0000-0000-0000-0000000000b2"));
```

- [ ] **Step 2: Run test and confirm failure**

Run from `codex-rs`:

```bash
just test -p codex-app-server gui_host
```

Expected: FAIL because `launch_urls_for_thread` is not wired through app-server yet.

- [ ] **Step 3: Update manager API**

In `gui_host.rs`:

```rust
use codex_gui_host::GuiLaunchUrls;
```

Rename:

```rust
pub async fn launch_url_for_thread(&self, thread_id: ThreadId) -> io::Result<String>
```

to:

```rust
pub async fn launch_urls_for_thread(&self, thread_id: ThreadId) -> io::Result<GuiLaunchUrls>
```

Use `handle.launch_urls_for_thread(thread_id)` everywhere inside the manager.

- [ ] **Step 4: Run app-server focused test**

Run:

```bash
just test -p codex-app-server gui_host
```

Expected: PASS.

## Task 2: Replace App-Server-Client Single URL Facade

**Files:**
- Modify: `codex-rs/app-server-client/src/gui.rs`
- Modify: `codex-rs/app-server-client/src/lib.rs`

- [ ] **Step 1: Update unit tests first**

Replace `gui_launch_url_display` with:

```rust
#[test]
fn gui_launch_urls_expose_entries() {
    let urls = GuiLaunchUrls {
        entries: vec![GuiLaunchUrlEntry::new(
            GuiLaunchUrlKind::Local,
            "Local",
            "http://127.0.0.1:1234/?threadId=t#token=x",
        )],
    };

    assert_eq!(urls.entries[0].label, "Local");
    assert_eq!(urls.entries[0].url, "http://127.0.0.1:1234/?threadId=t#token=x");
}
```

- [ ] **Step 2: Run test and confirm failure**

Run:

```bash
just test -p codex-app-server-client gui_launch_urls_expose_entries
```

Expected: FAIL while the client facade still uses `GuiLaunchUrl`.

- [ ] **Step 3: Re-export gui-host launch URL types**

In `gui.rs`, remove the local `GuiLaunchUrl` wrapper and re-export:

```rust
pub use codex_gui_host::GuiLaunchUrlEntry;
pub use codex_gui_host::GuiLaunchUrlKind;
pub use codex_gui_host::GuiLaunchUrls;
```

In `lib.rs`, update exports:

```rust
pub use crate::gui::GuiLaunchUrlEntry;
pub use crate::gui::GuiLaunchUrlKind;
pub use crate::gui::GuiLaunchUrls;
```

- [ ] **Step 4: Update trait and methods**

Change all GUI launch return types from:

```rust
Result<GuiLaunchUrl, GuiLaunchError>
```

to:

```rust
Result<GuiLaunchUrls, GuiLaunchError>
```

In worker command handling, replace:

```rust
let url = manager.launch_url_for_thread(thread_id).await?;
Ok(GuiLaunchUrl::new(url))
```

with:

```rust
manager.launch_urls_for_thread(thread_id).await.map_err(GuiLaunchError::from)
```

- [ ] **Step 5: Preserve remote unsupported behavior**

Keep:

```rust
Err(GuiLaunchError::UnsupportedRemote)
```

for `RemoteAppServerClient::launch_gui_for_thread`.

- [ ] **Step 6: Run app-server-client tests**

Run:

```bash
just test -p codex-app-server-client
```

Expected: PASS.

## Task 3: Update TUI Launch Rendering

**Files:**
- Modify: `codex-rs/tui/src/app_server_session.rs`
- Modify: `codex-rs/tui/src/app/gui.rs`
- Modify: `codex-rs/tui/src/snapshots/codex_tui__app__tests__gui_launch_url_message.snap`

- [ ] **Step 1: Update return type in app server session**

In `app_server_session.rs`, replace:

```rust
use codex_app_server_client::GuiLaunchUrl;
```

with:

```rust
use codex_app_server_client::GuiLaunchUrls;
```

Change `launch_gui_for_thread(...) -> Result<GuiLaunchUrl, GuiLaunchError>` to `Result<GuiLaunchUrls, GuiLaunchError>`.

- [ ] **Step 2: Add formatting unit test**

In `app/gui.rs`, replace the single-URL formatting test with:

```rust
#[test]
fn gui_launch_message_formats_multiple_urls() {
    let urls = GuiLaunchUrls {
        entries: vec![
            GuiLaunchUrlEntry::new(GuiLaunchUrlKind::Local, "Local", "http://127.0.0.1:12345/?threadId=t#token=x"),
            GuiLaunchUrlEntry::new(GuiLaunchUrlKind::Lan, "LAN", "http://192.168.3.165:12345/?threadId=t#token=x"),
            GuiLaunchUrlEntry::new(GuiLaunchUrlKind::Vpn, "VPN", "http://100.88.28.119:12345/?threadId=t#token=x"),
        ],
    };

    assert_eq!(
        gui_launch_success_message(&urls),
        "GUI URLs:\n  Local: http://127.0.0.1:12345/?threadId=t#token=x\n  LAN:   http://192.168.3.165:12345/?threadId=t#token=x\n  VPN:   http://100.88.28.119:12345/?threadId=t#token=x"
    );
}
```

- [ ] **Step 3: Run test and confirm failure**

Run:

```bash
just test -p codex-tui gui_launch_message_formats_multiple_urls
```

Expected: FAIL while `gui_launch_success_message` still accepts `&str`.

- [ ] **Step 4: Implement TUI formatting**

Change:

```rust
pub(super) fn gui_launch_success_message(url: &str) -> String
```

to:

```rust
pub(super) fn gui_launch_success_message(urls: &GuiLaunchUrls) -> String
```

Implementation rule:

- First line is `GUI URLs:`.
- Each entry renders as `  {label}: {url}`.
- Pad labels to the longest label width so `LAN` aligns with `Local`.

- [ ] **Step 5: Update call site**

In `launch_gui_for_primary_thread`, replace:

```rust
gui_launch_success_message(url.as_str())
```

with:

```rust
gui_launch_success_message(&urls)
```

- [ ] **Step 6: Run TUI test to generate snapshot**

Run:

```bash
just test -p codex-tui gui_launch
```

Expected: snapshot mismatch for `gui_launch_url_message`.

- [ ] **Step 7: Review and accept snapshot**

Review the `.snap.new` file, then accept only if it shows multi-line `GUI URLs`:

```bash
cargo insta pending-snapshots -p codex-tui
cargo insta accept -p codex-tui
```

Expected: snapshot updated intentionally.

## Task 4: Update Old Design and Roadmap Boundaries

**Files:**
- Modify: `docs/superpowers/specs/2026-05-11-codex-gui-host-redesign.md`
- Modify: `docs/superpowers/specs/2026-05-30-codex-gui-host-dev-adaptation-design.md`
- Modify: `docs/superpowers/plans/2026-05-30-gui-host/00-roadmap.md`

- [ ] **Step 1: Update main redesign spec**

In `2026-05-11-codex-gui-host-redesign.md`, change the old non-goal bullet `局域网访问` to point at the new spec:

```markdown
- 公网 relay。
```

Then add a short revision note near the top:

```markdown
2026-06-08 修订：默认局域网访问由 `2026-06-08-codex-gui-host-default-network-access-design.md` 覆盖；本文中 loopback-only 示例仅作为历史首版背景。
```

- [ ] **Step 2: Update adaptation design**

In `2026-05-30-codex-gui-host-dev-adaptation-design.md`, update the goal bullet:

```markdown
- `/gui` 请求结构化 GUI URLs，TUI 默认展示 Local / LAN / VPN 入口，不自动打开浏览器。
```

- [ ] **Step 3: Update roadmap**

In `00-roadmap.md`, replace:

```markdown
- `/gui` 首版不支持 LAN、mobile、公网 relay、...
```

with:

```markdown
- `/gui` 默认支持 Local / 默认 LAN / VPN URL；仍不支持 mobile-specific pairing、公网 relay、approval、interrupt、user turn、subagent switching、projection viewer。
```

- [ ] **Step 4: Check docs for stale loopback-only claims**

Run:

```bash
rg -n "不支持 LAN|loopback-only|只显示本机 URL|127\\.0\\.0\\.1:0" docs/superpowers/specs/2026-05-11-codex-gui-host-redesign.md docs/superpowers/specs/2026-05-30-codex-gui-host-dev-adaptation-design.md docs/superpowers/plans/2026-05-30-gui-host/00-roadmap.md
```

Expected: any remaining hits are explicitly framed as historical background or examples, not current default behavior.

## Task 5: Final Verification and Scope Check

**Files:**
- Verify only this plan's files changed plus snapshots.

- [ ] **Step 1: Run focused tests**

Run from `codex-rs`:

```bash
just test -p codex-app-server gui_host
just test -p codex-app-server-client
just test -p codex-tui gui_launch
```

Expected: PASS.

- [ ] **Step 2: Run formatting**

Run from `codex-rs`:

```bash
just fmt
```

Expected: PASS.

- [ ] **Step 3: Run scoped fix commands**

Run from `codex-rs`:

```bash
just fix -p codex-app-server
just fix -p codex-app-server-client
just fix -p codex-tui
```

Expected: PASS. Do not rerun tests after `fix` unless `fix` made non-format code changes requiring investigation.

- [ ] **Step 4: Scope check**

Run:

```bash
git diff --name-only
```

Expected paths:

```text
codex-rs/app-server/src/gui_host.rs
codex-rs/app-server-client/src/gui.rs
codex-rs/app-server-client/src/lib.rs
codex-rs/tui/src/app_server_session.rs
codex-rs/tui/src/app/gui.rs
codex-rs/tui/src/snapshots/codex_tui__app__tests__gui_launch_url_message.snap
docs/superpowers/specs/2026-05-11-codex-gui-host-redesign.md
docs/superpowers/specs/2026-05-30-codex-gui-host-dev-adaptation-design.md
docs/superpowers/plans/2026-05-30-gui-host/00-roadmap.md
```

- [ ] **Step 5: Commit code changes**

```bash
git add codex-rs/app-server/src/gui_host.rs codex-rs/app-server-client/src/gui.rs codex-rs/app-server-client/src/lib.rs codex-rs/tui/src/app_server_session.rs codex-rs/tui/src/app/gui.rs codex-rs/tui/src/snapshots/codex_tui__app__tests__gui_launch_url_message.snap
git commit -m "feat(gui-host): propagate network launch URLs"
```

- [ ] **Step 6: Commit docs changes**

```bash
git add docs/superpowers/specs/2026-05-11-codex-gui-host-redesign.md docs/superpowers/specs/2026-05-30-codex-gui-host-dev-adaptation-design.md docs/superpowers/plans/2026-05-30-gui-host/00-roadmap.md
git commit -m "docs(gui-host): update network access design boundaries"
```
