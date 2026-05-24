# Fork npm Update Channel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the npm/bun update channel for this fork point at `jiangshengdev/codex` and `@jiangshengdev/codex`, without changing brew, standalone, doctor, workflow, docs, or unrelated upstream references.

**Architecture:** Keep the existing update flow and directly replace only the hardcoded strings that participate in the TUI npm/bun update path. The flow remains GitHub latest release first, npm registry readiness second, then TUI prompt/update action. No new abstraction, runtime config, package.json lookup, or cache migration is introduced.

**Tech Stack:** Rust, Codex TUI, npm registry metadata, GitHub releases API, insta snapshots.

---

## Scope Source

Implement only the design in:

```text
docs/superpowers/specs/2026-05-22-fork-npm-update-channel-design.md
```

Do not broaden the change beyond that spec. In particular, do not run a repo-wide replacement of `openai`.

## File Structure

- Modify `codex-rs/tui/src/updates.rs`: change the GitHub latest release API URL used by the release update check.
- Modify `codex-rs/tui/src/npm_registry.rs`: change the npm package metadata URL and keep the local metadata fixture aligned with the fork package.
- Modify `codex-rs/tui/src/update_action.rs`: change only npm/bun update commands; keep brew and standalone commands unchanged.
- Modify `codex-rs/tui/src/update_prompt.rs`: change the update modal release notes URL.
- Modify `codex-rs/tui/src/history_cell/notices.rs`: change the history/update notice release notes URL.
- Modify `codex-rs/tui/src/snapshots/codex_tui__update_prompt__tests__update_prompt_modal.snap`: update the modal snapshot.
- Modify `codex-rs/tui/src/chatwidget/snapshots/codex_tui__chatwidget__tests__update_popup.snap`: update the update popup snapshot.

Do not modify:

- `codex-rs/cli/src/doctor/updates.rs`
- `codex-rs/cli/src/doctor.rs`
- `codex-cli/package.json`
- `.github/**`
- `.cnb/**`
- docs outside this implementation plan/spec pair
- brew or standalone installer strings

### Task 1: Write Red Expectations

**Files:**
- Modify: `codex-rs/tui/src/update_action.rs`
- Modify: `codex-rs/tui/src/npm_registry.rs`
- Modify: `codex-rs/tui/src/snapshots/codex_tui__update_prompt__tests__update_prompt_modal.snap`
- Modify: `codex-rs/tui/src/chatwidget/snapshots/codex_tui__chatwidget__tests__update_popup.snap`

- [ ] **Step 1: Add direct unit coverage for npm/bun update commands**

In `codex-rs/tui/src/update_action.rs`, inside the existing `#[cfg(test)] mod tests`, insert this test before `standalone_update_commands_rerun_latest_installer`:

```rust
    #[test]
    fn npm_and_bun_update_commands_install_fork_package() {
        assert_eq!(
            UpdateAction::NpmGlobalLatest.command_args(),
            ("npm", &["install", "-g", "@jiangshengdev/codex"][..])
        );
        assert_eq!(
            UpdateAction::BunGlobalLatest.command_args(),
            ("bun", &["install", "-g", "@jiangshengdev/codex"][..])
        );
    }
```

- [ ] **Step 2: Align the npm metadata fixture with the fork package**

In `codex-rs/tui/src/npm_registry.rs`, change only the tarball string inside `version_json`:

```rust
                "tarball": format!("https://registry.npmjs.org/@jiangshengdev/codex/-/codex-{version}.tgz"),
```

This fixture is not a production URL source, but it belongs to the npm readiness tests and should not keep showing the upstream package in update-path test data.

- [ ] **Step 3: Update the update modal snapshot expectation**

In `codex-rs/tui/src/snapshots/codex_tui__update_prompt__tests__update_prompt_modal.snap`, make the expected output contain:

```text
  Release notes: https://github.com/jiangshengdev/codex/releases/latest

› 1. Update now (runs `npm install -g @jiangshengdev/codex@latest`)                
```

Keep the surrounding snapshot content unchanged.

- [ ] **Step 4: Update the chatwidget update popup snapshot expectation**

In `codex-rs/tui/src/chatwidget/snapshots/codex_tui__chatwidget__tests__update_popup.snap`, make the expected output contain:

```text
  Full release notes: https://github.com/jiangshengdev/codex/releases/latest
```

Keep the surrounding snapshot content unchanged.

- [ ] **Step 5: Run focused tests and verify RED**

Run:

```sh
cd /Users/jiangsheng/cnb/codex/codex-rs
cargo test -p codex-tui update_action::tests::npm_and_bun_update_commands_install_fork_package
```

Expected: FAIL because `UpdateAction::NpmGlobalLatest.command_args()` and `UpdateAction::BunGlobalLatest.command_args()` still return `@openai/codex`.

Then run:

```sh
cd /Users/jiangsheng/cnb/codex/codex-rs
cargo test -p codex-tui update_prompt::tests::update_prompt_snapshot
```

Expected: FAIL because `update_prompt.rs` still renders the upstream release notes URL and upstream npm package command.

### Task 2: Change the Minimal Production Strings

**Files:**
- Modify: `codex-rs/tui/src/updates.rs`
- Modify: `codex-rs/tui/src/npm_registry.rs`
- Modify: `codex-rs/tui/src/update_action.rs`
- Modify: `codex-rs/tui/src/update_prompt.rs`
- Modify: `codex-rs/tui/src/history_cell/notices.rs`

- [ ] **Step 1: Point the TUI GitHub release probe at the fork**

In `codex-rs/tui/src/updates.rs`, change the existing constant to:

```rust
const LATEST_RELEASE_URL: &str = "https://api.github.com/repos/jiangshengdev/codex/releases/latest";
```

Do not change `HOMEBREW_CASK_API_URL`.

- [ ] **Step 2: Point the npm readiness probe at the fork package**

In `codex-rs/tui/src/npm_registry.rs`, change the existing package URL to:

```rust
pub(crate) const PACKAGE_URL: &str = "https://registry.npmjs.org/@jiangshengdev%2fcodex";
```

Do not add owner validation, tarball host validation, or package.json parsing.

- [ ] **Step 3: Change only npm/bun update commands**

In `codex-rs/tui/src/update_action.rs`, change the enum comments and `command_args` npm/bun arms to:

```rust
    /// Update via `npm install -g @jiangshengdev/codex@latest`.
    NpmGlobalLatest,
    /// Update via `bun install -g @jiangshengdev/codex@latest`.
    BunGlobalLatest,
```

and:

```rust
            UpdateAction::NpmGlobalLatest => ("npm", &["install", "-g", "@jiangshengdev/codex"]),
            UpdateAction::BunGlobalLatest => ("bun", &["install", "-g", "@jiangshengdev/codex"]),
```

Leave these arms unchanged:

```rust
            UpdateAction::BrewUpgrade => ("brew", &["upgrade", "--cask", "codex"]),
            UpdateAction::StandaloneUnix => (
                "sh",
                &["-c", "curl -fsSL https://chatgpt.com/codex/install.sh | sh"],
            ),
            UpdateAction::StandaloneWindows => (
                "powershell",
                &["-c", "irm https://chatgpt.com/codex/install.ps1|iex"],
            ),
```

- [ ] **Step 4: Change the update modal release notes URL**

In `codex-rs/tui/src/update_prompt.rs`, change the URL span to:

```rust
                "https://github.com/jiangshengdev/codex/releases/latest"
                    .dim()
                    .underlined(),
```

- [ ] **Step 5: Change the history/update notice release notes URL**

In `codex-rs/tui/src/history_cell/notices.rs`, change both displayed and raw release notes strings to:

```rust
                "https://github.com/jiangshengdev/codex/releases/latest"
```

and:

```rust
            Line::from("https://github.com/jiangshengdev/codex/releases/latest"),
```

Do not change the fallback install-options URL:

```rust
"https://github.com/openai/codex"
```

That fallback is not part of the npm/bun update execution path.

- [ ] **Step 6: Run focused tests and verify GREEN**

Run:

```sh
cd /Users/jiangsheng/cnb/codex/codex-rs
cargo test -p codex-tui update_action::tests::npm_and_bun_update_commands_install_fork_package
```

Expected: PASS.

Run:

```sh
cd /Users/jiangsheng/cnb/codex/codex-rs
cargo test -p codex-tui update_prompt::tests::update_prompt_snapshot
```

Expected: PASS.

### Task 3: Verify Snapshots and Scope

**Files:**
- Verify: `codex-rs/tui/src/**`
- Verify: `codex-rs/tui/src/snapshots/**`
- Verify: `codex-rs/tui/src/chatwidget/snapshots/**`

- [ ] **Step 1: Run the project test required for TUI changes**

Run:

```sh
cd /Users/jiangsheng/cnb/codex/codex-rs
cargo test -p codex-tui
```

Expected: PASS. If insta writes `.snap.new` files, inspect the generated files directly and accept only the intended update prompt snapshots.

- [ ] **Step 2: Run Rust formatting**

Run:

```sh
cd /Users/jiangsheng/cnb/codex/codex-rs
just fmt
```

Expected: exit 0. Do not re-run tests solely because `just fmt` ran.

- [ ] **Step 3: Audit that only update-path upstream strings changed**

Run:

```sh
cd /Users/jiangsheng/cnb/codex
rg -n "api.github.com/repos/openai/codex/releases/latest|registry.npmjs.org/@openai%2fcodex|npm install -g @openai/codex|bun install -g @openai/codex|github.com/openai/codex/releases/latest" codex-rs/tui/src -S
```

Expected: no matches in `codex-rs/tui/src/updates.rs`, `codex-rs/tui/src/npm_registry.rs`, `codex-rs/tui/src/update_action.rs`, `codex-rs/tui/src/update_prompt.rs`, or `codex-rs/tui/src/history_cell/notices.rs`.

It is acceptable for unrelated `openai/codex` strings outside this command's exact update-path patterns to remain.

- [ ] **Step 4: Confirm excluded files were not touched**

Run:

```sh
cd /Users/jiangsheng/cnb/codex
git diff --name-only
```

Expected implementation diff contains only:

```text
codex-rs/tui/src/history_cell/notices.rs
codex-rs/tui/src/npm_registry.rs
codex-rs/tui/src/snapshots/codex_tui__update_prompt__tests__update_prompt_modal.snap
codex-rs/tui/src/chatwidget/snapshots/codex_tui__chatwidget__tests__update_popup.snap
codex-rs/tui/src/update_action.rs
codex-rs/tui/src/update_prompt.rs
codex-rs/tui/src/updates.rs
docs/superpowers/plans/2026-05-22-fork-npm-update-channel.md
docs/superpowers/specs/2026-05-22-fork-npm-update-channel-design.md
```

If the user asks to commit only implementation code later, stage only the TUI files and snapshots. Do not stage the spec/plan documents unless the user asks to include them.

## Final Handoff

When implementation is complete, report:

- Whether `cargo test -p codex-tui` passed.
- Whether `just fmt` passed.
- Whether the update-path `rg` audit had no target-pattern matches.
- Whether any excluded file was modified.

Do not claim brew, standalone, doctor, workflow, or npm publishing behavior changed.
