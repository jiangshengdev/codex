# GUI Agent Tool Focused Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 对 GUI agent tool 重做进行聚焦验证，确保 subprocess path、TUI `/gui`、extension tool 和 lock/schema 状态可 review。

**Architecture:** 只运行与改动 crate 相关的窄测试和格式化/fix。禁止全量测试。根据实际改动处理 Cargo/Bazel lock 和 app-server schema。

**Tech Stack:** just, cargo, cargo-insta, app-server protocol schema generation, git.

---

## Files

- Verify: `codex-rs/ext/gui/**`
- Verify: `codex-rs/app-server/**`
- Verify: `codex-rs/app-server-client/**`
- Verify: `codex-rs/tui/**`
- Maybe Modify: `codex-rs/Cargo.lock`
- Maybe Modify: `MODULE.bazel.lock`
- Maybe Modify: app-server schema/TypeScript generated fixtures if v2 API changed

## Task 1: Format And Focused Fix

- [ ] **Step 1: Run formatter**

Run:

```bash
cd codex-rs
just fmt
```

Expected: formatting completes.

- [ ] **Step 2: Run focused fix for changed crates**

Run only for crates changed by implementation:

```bash
cd codex-rs
just fix -p codex-app-server
just fix -p codex-app-server-client
just fix -p codex-tui
just fix -p codex-gui-agent-extension
```

Expected: commands complete or skip nonexistent package if the package name differs. Do not run workspace-wide `just fix` unless the user explicitly authorizes it.

## Task 2: Run Focused Tests

- [ ] **Step 1: Run extension tests**

Run:

```bash
cd codex-rs
just test -p codex-gui-agent-extension
```

Expected: `launch_gui` schema, success JSON, and error JSON tests pass.

- [ ] **Step 2: Run app-server focused tests**

Run:

```bash
cd codex-rs
just test -p codex-app-server gui_connection_bridge
just test -p codex-app-server gui_transport
just test -p codex-app-server gui_launch_service
```

Expected: local connection bridge round-trip, GUI transport parsing, and launch service tests pass.

- [ ] **Step 3: Run app-server-client focused tests**

Run:

```bash
cd codex-rs
just test -p codex-app-server-client launch_gui
```

Expected: in-process client facade launches via app-server service or returns the expected unsupported error for remote sessions.

- [ ] **Step 4: Run TUI focused tests**

Run:

```bash
cd codex-rs
just test -p codex-tui gui_launch
just test -p codex-tui slash_gui
```

Expected: `/gui` command dispatch and transcript URL formatting pass.

## Task 3: Generated Files And Lockfiles

- [ ] **Step 1: If Rust dependencies changed, update Bazel lock**

Run only if `Cargo.toml` or `Cargo.lock` changed:

```bash
cd codex-rs
just bazel-lock-update
just bazel-lock-check
```

Expected: `MODULE.bazel.lock` is updated if needed and lock check passes.

- [ ] **Step 2: If app-server v2 protocol changed, regenerate schema**

Run only if `codex-rs/app-server-protocol/src/protocol/v2.rs` or related API docs changed:

```bash
cd codex-rs
just write-app-server-schema
just test -p codex-app-server-protocol
```

Expected: generated schema/TypeScript fixtures are updated and protocol tests pass.

- [ ] **Step 3: If TUI snapshots changed, inspect and accept narrowly**

Run only if `*.snap.new` exists under `codex-rs/tui`:

```bash
cd codex-rs
cargo insta pending-snapshots -p codex-tui
cargo insta show -p codex-tui path/to/relevant.snap.new
cargo insta accept -p codex-tui
```

Expected: only intentional `/gui` snapshots are accepted.

## Task 4: Final Review Checks

- [ ] **Step 1: Search for forbidden old concepts**

Run:

```bash
rg -n "SharedGuiHostLauncher|struct GuiLauncher|codex_gui_extension|codex-gui-extension" codex-rs
```

Expected: no active source uses the old `codex-gui-extension` crate name. `SharedGuiHostLauncher` and `struct GuiLauncher` must not appear in active source.

- [ ] **Step 2: Confirm `ext/gui` dependency direction**

Run:

```bash
rg -n "app-server-client|InProcessClientSender|codex_tui|codex-tui" codex-rs/ext/gui
```

Expected: no matches in `ext/gui`.

- [ ] **Step 3: Confirm working tree and commits**

Run:

```bash
git status --short --branch
git log --oneline --max-count=12
```

Expected: working tree clean after final commit; recent commits are split by bridge, service, extension, client/TUI, and verification/lockfile if needed.

## Task 5: Final Commit If Needed

- [ ] **Step 1: Commit verification-only artifacts**

If formatting, lockfile, schema, or snapshots changed after focused verification, commit them separately:

```bash
git add codex-rs/Cargo.lock MODULE.bazel.lock codex-rs/app-server-protocol codex-rs/tui/src/snapshots
git commit -m "chore(gui): update generated files for gui agent tool"
```

Expected: commit contains only generated/format/snapshot artifacts that are consequences of earlier source commits.
