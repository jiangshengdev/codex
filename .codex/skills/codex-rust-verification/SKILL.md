---
name: codex-rust-verification
description: "Use when choosing, writing, or running Rust verification commands in the openai/codex checkout, especially for codex-rs changes, TUI/app-server/core/protocol tests, Rust lint or fix commands, snapshot tests, config schema updates, dependency lock checks, and avoiding full Rust test or lint sweeps."
---

# Codex Rust Verification

Use this skill to choose narrow Rust validation for Codex repository changes.
It does not allow installs, full Rust test suites, full lint sweeps, or git remote operations unless the user explicitly authorizes the forbidden scope.

## Hard Limits

- Do not run `cargo test` directly.
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

## Formatting

After code changes anywhere in this repository, run Rust formatting from `codex-rs`:

```bash
just fmt
```

Do this automatically after Rust code edits. Do not rerun tests after a final `fmt` or `fix` unless there is a concrete reason.

## Fix And Lint

Before finalizing a large `codex-rs` change, prefer the narrow package form:

```bash
just fix -p <project>
```

Use package scope only when the changed crate is clear.
If the change touches shared crates or the correct lint scope is unclear, ask before running broader commands.

## Dependency And Generated Files

- If `Cargo.toml` or `Cargo.lock` changes, run `just bazel-lock-update` from the repo root and include `MODULE.bazel.lock`.
- After dependency changes, run `just bazel-lock-check` from the repo root.
- If `ConfigToml` or nested config types change, run `just write-config-schema`.
- If app-server protocol API shapes change, run `just write-app-server-schema`; include `--experimental` only when experimental fixtures are affected.
- If Rust compile-time file access is added through `include_str!`, `include_bytes!`, `sqlx::migrate!`, or similar, update the crate's Bazel data wiring.

## Snapshot Tests

For user-visible TUI output changes:

1. Run only the narrow test that generates the relevant snapshot when possible.
2. Inspect generated `*.snap.new` files directly.
3. Accept snapshots only when the UI change is intentional.

Do not install `cargo-insta` unless the user explicitly authorizes installation.

## Planning Verification Steps

When writing plan or verification commands, first inspect the live `justfile`, `Cargo.toml`, or project docs that define the command.
Do not copy command names from old plans or memory without checking that they still exist.
