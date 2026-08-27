---
name: codex-rust-verification
description: "Use when choosing, writing, or running Rust verification commands in the openai/codex checkout, especially for codex-rs changes, TUI/app-server/core/protocol tests, Rust lint or fix commands, snapshot tests, config schema updates, dependency lock checks, and avoiding full Rust test or lint sweeps."
---

# Codex Rust Verification

Use this skill to choose narrow Rust validation for Codex repository changes.
It does not allow installs, full Rust test suites, full lint sweeps, or git remote operations unless the user explicitly authorizes the forbidden scope.
For regular Rust formatting, fix, dependency, schema, snapshot, and app-server validation rules, read the project `AGENTS.md`.
Apply the general execution-environment preflight in `$managing-work-stages` and
its `references/execution-environment-preflight.md` before choosing, writing, or
running a Rust verification command. The rules below are the Rust-specific delta.

## Hard Limits

- Do not run `just test` without a narrow filter.
- Do not run crate-wide tests such as `just test -p codex-tui` unless the user explicitly authorized that exact broad scope.
- Do not run workspace-wide or crate-wide lint commands.
- Do not run `just argument-comment-lint` for the full repo.
- If a Rust test or lint command might enumerate a whole crate, workspace, or many unrelated targets, ask first.

Allowed shape:

```bash
just test -p codex-tui app_server_event_targets
```

Forbidden shape unless explicitly authorized:

```bash
just test
cargo test
just test -p codex-tui
just argument-comment-lint
```

## Planning Verification Steps

After the general preflight, use the live `justfile`, relevant `Cargo.toml`, or
project documentation to resolve the Rust-specific entrypoint and filter, then
apply the Hard Limits above.
