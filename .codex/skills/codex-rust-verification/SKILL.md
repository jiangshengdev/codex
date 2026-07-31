---
name: codex-rust-verification
description: "Use when choosing, writing, or running Rust verification commands in the openai/codex checkout, especially for codex-rs changes, TUI/app-server/core/protocol tests, Rust lint or fix commands, snapshot tests, config schema updates, dependency lock checks, and avoiding full Rust test or lint sweeps."
---

# Codex Rust Verification

Use this skill to choose narrow Rust validation for Codex repository changes.
It does not allow installs, full Rust test suites, full lint sweeps, or git remote operations unless the user explicitly authorizes the forbidden scope.
For regular Rust formatting, fix, dependency, schema, snapshot, and app-server validation rules, read the project `AGENTS.md`.

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

When writing plan or verification commands, first inspect the live `justfile`, `Cargo.toml`, or project docs that define the command.
Do not copy command names from old plans or memory without checking that they still exist.
