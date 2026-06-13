# GUI Agent Tool Boundary Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在写代码前锁定 `rust-v0.139.0..dev` 的可改边界，防止实现误入已回退旧方案或侵入上游基线。

**Architecture:** 本阶段只读调查并更新计划注记，不实现功能。输出是允许修改文件表、禁止修改文件表、现有增量资产判断和停止条件。

**Tech Stack:** Git, ripgrep, Rust source audit, Markdown.

---

## Files

- Read: `docs/superpowers/specs/2026-06-13-gui-agent-tool-redesign-design.md`
- Read: `codex-rs/ext/goal/src/extension.rs`
- Read: `codex-rs/ext/goal/src/tool.rs`
- Read: `codex-rs/app-server/src/extensions.rs`
- Read: `codex-rs/app-server/src/message_processor.rs`
- Read: `codex-rs/app-server/src/gui_host.rs`
- Read: `codex-rs/app-server/src/gui_transport.rs`
- Read: `codex-rs/app-server/src/in_process_extra.rs`
- Read: `codex-rs/app-server-client/src/gui.rs`
- Read: `codex-rs/tui/src/app/gui.rs`
- Modify only if findings differ from this plan: `docs/superpowers/plans/2026-06-13-gui-agent-tool-redesign/01-boundary-audit.md`

## Task 1: Confirm Branch And Tag Baseline

- [ ] **Step 1: Confirm branch state**

Run from repo root:

```bash
git status --short --branch
git tag --list rust-v0.139.0
git log --oneline --decorate --max-count=30 dev
```

Expected:

- Current branch is `dev`.
- `rust-v0.139.0` exists.
- Recent log contains individual `Revert "..."` commits for the old GUI launch extension series.

- [ ] **Step 2: Confirm only known plan/design docs are currently dirty**

Run:

```bash
git status --short
```

Expected: either clean, or only docs under `docs/superpowers/plans/2026-06-13-gui-agent-tool-redesign/` if this plan set is still uncommitted.

Stop if implementation files are dirty and the user did not authorize using them.

## Task 2: Audit `rust-v0.139.0..dev` GUI/App-Server Delta

- [ ] **Step 1: List relevant changed files**

Run:

```bash
git diff --name-status rust-v0.139.0..dev -- \
  codex-rs/app-server \
  codex-rs/app-server-client \
  codex-rs/gui-host \
  codex-rs/tui/src \
  codex-rs/ext/goal
```

Expected: output includes current GUI host/app-server/TUI increment files, including `codex-rs/gui-host/**`, `app-server/src/gui_host.rs`, `app-server/src/gui_transport.rs`, `app-server/src/in_process_extra.rs`, `app-server-client/src/gui.rs`, and `tui/src/app/gui.rs`.

- [ ] **Step 2: Confirm old reverted concepts are not present as active code**

Run:

```bash
rg -n "SharedGuiHostLauncher|struct GuiLauncher|codex_gui_extension|codex-gui-extension" \
  codex-rs docs/superpowers/specs docs/superpowers/plans
```

Expected: matches are absent from Rust source, or appear only in docs as negative references. Stop if active Rust source contains these as implementation types.

## Task 3: Lock Allowed File Groups

- [ ] **Step 1: Use this allowed source list for implementation plans**

Allowed source groups:

```text
codex-rs/ext/gui/**
codex-rs/app-server/src/gui_launch_service.rs
codex-rs/app-server/src/gui_connection_bridge.rs
codex-rs/app-server/src/gui_host.rs
codex-rs/app-server/src/gui_transport.rs
codex-rs/app-server/src/in_process_extra.rs
codex-rs/app-server/src/in_process.rs
codex-rs/app-server/src/extensions.rs
codex-rs/app-server/src/message_processor.rs
codex-rs/app-server/src/lib.rs
codex-rs/app-server-client/src/gui.rs
codex-rs/app-server-client/src/lib.rs
codex-rs/tui/src/app/gui.rs
codex-rs/tui/src/app_server_session.rs
codex-rs/tui/src/app/thread_routing.rs
codex-rs/tui/src/app_command.rs
codex-rs/tui/src/chatwidget/slash_dispatch.rs
codex-rs/tui/src/slash_command.rs
codex-rs/Cargo.toml
codex-rs/Cargo.lock
codex-rs/**/Cargo.toml
codex-rs/**/BUILD.bazel
MODULE.bazel.lock
```

Any implementation plan that needs files outside this list must stop and ask for design review.

Audit note: `codex-rs/app-server/src/in_process.rs` is included as a thin
compatibility hook because the current extra-connection bridge is driven by
`InProcessClientMessage::Extra` / `ProcessorCommand::Extra` there. Follow-up
implementation may need to preserve the in-process TUI path while moving GUI
browser registration to an app-server-local bridge. GUI-specific host, token,
URL, browser, or WebSocket logic should still stay out of `in_process.rs`.

- [ ] **Step 2: Use this forbidden direction list**

Forbidden directions:

```text
modify closed-source Codex App
restore old codex-gui-extension wiring
restore GuiLauncher / SharedGuiHostLauncher
make ext/gui depend on app-server-client
make ext/gui depend on InProcessClientSender
make TUI own GuiHostHandle
route browser GUI traffic through TUI
auto-open a browser from launch_gui
run full tests
```

## Task 4: Commit Boundary

- [ ] **Step 1: Commit only if this audit file was changed**

If the audit found a mismatch and you edited this plan, commit only that doc change:

```bash
git add docs/superpowers/plans/2026-06-13-gui-agent-tool-redesign/01-boundary-audit.md
git commit -m "docs(gui): update gui agent tool boundary audit"
```

Expected: one docs-only commit.

If no audit doc changes were needed, do not commit.
