# turn_start_zsh_fork Nextest Isolation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `turn_start_zsh_fork` run serially under the local nextest profile so local `just test` no longer flakes on app-server subprocess startup.

**Architecture:** Keep the fix at the nextest runner configuration layer. Add a narrow local test group for `turn_start_zsh_fork` with `max-threads = 1`, while preserving the existing local `max-threads = 4` group for other `codex-app-server` integration tests. Do not change Rust test code or app-server behavior.

**Tech Stack:** `cargo-nextest`, `codex-rs/.config/nextest.toml`, `just test`, Rust integration tests.

---

## File Structure

- Modify: `codex-rs/.config/nextest.toml`
  - Add one local-only test group for `turn_start_zsh_fork`.
  - Add one local profile override that maps `package(codex-app-server) & kind(test) & test(turn_start_zsh_fork)` to that group.
  - If nextest override precedence prevents the narrow override from taking effect, adjust the broader local app-server override to exclude `turn_start_zsh_fork`.

- Do not modify:
  - `codex-rs/app-server/tests/suite/v2/turn_start_zsh_fork.rs`
  - Rust app-server implementation files.
  - Timeout constants.
  - `serial_test` usage.

## Task 1: Add Local Nextest Isolation For `turn_start_zsh_fork`

**Files:**
- Modify: `codex-rs/.config/nextest.toml`

- [ ] **Step 1: Inspect the current local app-server nextest configuration**

Run:

```sh
cd codex-rs
sed -n '1,70p' .config/nextest.toml
```

Expected current relevant content:

```toml
[test-groups.app_server_integration]
max-threads = 1

# Higher concurrency causes integration test timeouts under resource contention
# on common developer machines.
[test-groups.app_server_integration_local]
max-threads = 4

[[profile.default.overrides]]
# These integration tests spawn a fresh app-server subprocess per case.
# Keep the library unit tests parallel.
filter = 'package(codex-app-server) & kind(test)'
test-group = 'app_server_integration'

[[profile.local.overrides]]
# Use up to four app-server subprocesses locally. The global nextest pool still
# limits this to the machine's logical CPU count.
filter = 'package(codex-app-server) & kind(test)'
test-group = 'app_server_integration_local'
```

- [ ] **Step 2: Add the new local-only test group**

Add this group immediately after `app_server_integration_local`:

```toml
# These tests copy and launch a fake packaged app-server with a vendored zsh.
# Keep them serial locally to avoid subprocess startup contention.
[test-groups.app_server_zsh_fork_integration_local]
max-threads = 1
```

The top section should become:

```toml
[test-groups.app_server_integration]
max-threads = 1

# Higher concurrency causes integration test timeouts under resource contention
# on common developer machines.
[test-groups.app_server_integration_local]
max-threads = 4

# These tests copy and launch a fake packaged app-server with a vendored zsh.
# Keep them serial locally to avoid subprocess startup contention.
[test-groups.app_server_zsh_fork_integration_local]
max-threads = 1
```

- [ ] **Step 3: Add the narrow local override**

Add this local override after the existing broad `profile.local.overrides` block for `package(codex-app-server) & kind(test)`:

```toml
[[profile.local.overrides]]
# The zsh-fork tests are heavier than most app-server integration tests because
# each case copies and launches a fake packaged app-server plus vendored zsh.
filter = 'package(codex-app-server) & kind(test) & test(turn_start_zsh_fork)'
test-group = 'app_server_zsh_fork_integration_local'
```

The local app-server override area should become:

```toml
[[profile.local.overrides]]
# Use up to four app-server subprocesses locally. The global nextest pool still
# limits this to the machine's logical CPU count.
filter = 'package(codex-app-server) & kind(test)'
test-group = 'app_server_integration_local'

[[profile.local.overrides]]
# The zsh-fork tests are heavier than most app-server integration tests because
# each case copies and launches a fake packaged app-server plus vendored zsh.
filter = 'package(codex-app-server) & kind(test) & test(turn_start_zsh_fork)'
test-group = 'app_server_zsh_fork_integration_local'
```

- [ ] **Step 4: Run the narrow verification**

Run:

```sh
cd codex-rs
just test -p codex-app-server turn_start_zsh_fork --test-threads 2
```

Expected result:

```text
4 tests run: 4 passed
```

Acceptable details:

- Individual test durations may remain several seconds.
- Nextest may still print skipped test counts.
- The command must not report `deadline has elapsed`.
- The command must not report wiremock `/responses` matched 0.

- [ ] **Step 5: If verification passes, stop and report**

Do not run broader tests in this plan. Report:

```text
Implemented nextest local isolation for turn_start_zsh_fork.
Verified with: just test -p codex-app-server turn_start_zsh_fork --test-threads 2
Result: 4 passed
```

Do not stage or commit unless the user explicitly asks.

## Task 2: Fallback If The Narrow Override Does Not Take Effect

Only perform this task if Task 1 Step 4 still shows concurrent initialize timeouts or `/responses` matched 0.

**Files:**
- Modify: `codex-rs/.config/nextest.toml`

- [ ] **Step 1: Make the broad local override exclude `turn_start_zsh_fork`**

Change the broad local app-server override from:

```toml
[[profile.local.overrides]]
# Use up to four app-server subprocesses locally. The global nextest pool still
# limits this to the machine's logical CPU count.
filter = 'package(codex-app-server) & kind(test)'
test-group = 'app_server_integration_local'
```

to:

```toml
[[profile.local.overrides]]
# Use up to four app-server subprocesses locally. The global nextest pool still
# limits this to the machine's logical CPU count.
filter = 'package(codex-app-server) & kind(test) & not test(turn_start_zsh_fork)'
test-group = 'app_server_integration_local'
```

Keep the narrow `turn_start_zsh_fork` override from Task 1:

```toml
[[profile.local.overrides]]
# The zsh-fork tests are heavier than most app-server integration tests because
# each case copies and launches a fake packaged app-server plus vendored zsh.
filter = 'package(codex-app-server) & kind(test) & test(turn_start_zsh_fork)'
test-group = 'app_server_zsh_fork_integration_local'
```

- [ ] **Step 2: Run the same narrow verification again**

Run:

```sh
cd codex-rs
just test -p codex-app-server turn_start_zsh_fork --test-threads 2
```

Expected result:

```text
4 tests run: 4 passed
```

Failure handling:

- If the same initialize timeout remains after this fallback, stop.
- Do not add `serial_test`.
- Do not increase timeouts.
- Do not change app-server startup code.
- Report that nextest local isolation did not address the current failure and return to root-cause investigation.

- [ ] **Step 3: Stop and report**

If verification passes, report:

```text
Implemented nextest local isolation for turn_start_zsh_fork with broad override exclusion.
Verified with: just test -p codex-app-server turn_start_zsh_fork --test-threads 2
Result: 4 passed
```

Do not stage or commit unless the user explicitly asks.

## Self-Review Checklist

- Spec coverage:
  - The plan modifies only `codex-rs/.config/nextest.toml`.
  - The plan keeps Rust tests and app-server implementation unchanged.
  - The plan preserves local concurrency for non-`turn_start_zsh_fork` app-server integration tests.
  - The plan verifies only the agreed target module command.

- Placeholder scan:
  - The plan contains exact file paths, exact TOML snippets, exact commands, and expected outcomes.
  - The plan does not use placeholder markers.

- Scope check:
  - The plan does not include broad app-server test runs.
  - The plan does not include full `just test`.
  - The plan does not include git stage or commit steps.
