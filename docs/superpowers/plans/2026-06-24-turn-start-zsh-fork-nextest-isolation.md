# turn_start_zsh_fork Nextest Isolation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the remaining `turn_start_zsh_fork` retry flake under full local `just test` while preserving local app-server integration concurrency for other tests.

**Architecture:** Keep the fix at the nextest runner configuration layer. Phase 1 added a narrow local test group for `turn_start_zsh_fork` and excluded it from the broader local app-server group; this made the target module verification pass but did not eliminate full-suite retry flakes. Phase 2 should make the same narrow local override consume all available nextest test threads with `threads-required = "num-test-threads"` so zsh-fork tests are globally isolated without lowering concurrency for other `codex-app-server` integration tests.

**Tech Stack:** `cargo-nextest`, `codex-rs/.config/nextest.toml`, `just test`, Rust integration tests.

---

## File Structure

- Modify: `codex-rs/.config/nextest.toml`
  - Keep the local-only test group for `turn_start_zsh_fork`.
  - Keep the broad local app-server override exclusion for `turn_start_zsh_fork`.
  - Add `threads-required = "num-test-threads"` to the narrow local `turn_start_zsh_fork` override.

- Do not modify:
  - `codex-rs/app-server/tests/suite/v2/turn_start_zsh_fork.rs`
  - Rust app-server implementation files.
  - Timeout constants.
  - `serial_test` usage.

## Latest Evidence

The previously implemented local test group and broad override exclusion passed the target module verification:

```text
4 tests run: 4 passed, 990 skipped
```

The subsequent full local `just test` summary still showed retry flakes:

```text
FLAKY 2/2 codex-app-server::all suite::v2::turn_start_zsh_fork::turn_start_shell_zsh_fork_exec_approval_cancel_v2
FLAKY 2/2 codex-app-server::all suite::v2::turn_start_zsh_fork::turn_start_shell_zsh_fork_executes_command_v2
```

That full run failed because of a separate timeout:

```text
TRY 2 TMT codex-app-server config::external_agent_config::tests::import_plugins_infers_external_official_marketplace_when_missing_from_settings
```

Interpretation:

- The current zsh-fork nextest group serializes zsh-fork tests against each other.
- It does not prevent zsh-fork tests from running concurrently with other test groups.
- The `external_agent_config` timeout is a separate hard-failure track and is out of scope for this zsh-fork plan.

Local nextest evidence:

- `threads-required = "num-test-threads"` is accepted by nextest.
- nextest changelog states this can declare a test mutually exclusive with all other tests globally.

## Task 1: Add Local Nextest Isolation For `turn_start_zsh_fork`

Status: Completed. Keep this task as historical baseline for the currently modified `codex-rs/.config/nextest.toml`.

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

Status: Completed. This fallback was needed because nextest uses first matching override wins for `test-group`, so the broad local app-server override must exclude `turn_start_zsh_fork`.

Only perform this task when reconstructing the baseline from a clean checkout.

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

## Task 3: Make `turn_start_zsh_fork` Globally Exclusive Under Local Nextest

Only perform this task after Task 1 and Task 2 are already present in `codex-rs/.config/nextest.toml`.

**Files:**
- Modify: `codex-rs/.config/nextest.toml`

- [ ] **Step 1: Inspect the current local zsh-fork override**

Run:

```sh
cd codex-rs
sed -n '20,72p' .config/nextest.toml
```

Expected current relevant content:

```toml
# Higher concurrency causes integration test timeouts under resource contention
# on common developer machines.
[test-groups.app_server_integration_local]
max-threads = 4

# These tests copy and launch a fake packaged app-server with a vendored zsh.
# Keep them serial locally to avoid subprocess startup contention.
[test-groups.app_server_zsh_fork_integration_local]
max-threads = 1

[[profile.default.overrides]]
# These integration tests spawn a fresh app-server subprocess per case.
# Keep the library unit tests parallel.
filter = 'package(codex-app-server) & kind(test)'
test-group = 'app_server_integration'

[[profile.local.overrides]]
# Use up to four app-server subprocesses locally. The global nextest pool still
# limits this to the machine's logical CPU count.
filter = 'package(codex-app-server) & kind(test) & not test(turn_start_zsh_fork)'
test-group = 'app_server_integration_local'

[[profile.local.overrides]]
# The zsh-fork tests are heavier than most app-server integration tests because
# each case copies and launches a fake packaged app-server plus vendored zsh.
filter = 'package(codex-app-server) & kind(test) & test(turn_start_zsh_fork)'
test-group = 'app_server_zsh_fork_integration_local'
```

- [ ] **Step 2: Add global thread reservation to the narrow local override**

Change the narrow local override from:

```toml
[[profile.local.overrides]]
# The zsh-fork tests are heavier than most app-server integration tests because
# each case copies and launches a fake packaged app-server plus vendored zsh.
filter = 'package(codex-app-server) & kind(test) & test(turn_start_zsh_fork)'
test-group = 'app_server_zsh_fork_integration_local'
```

to:

```toml
[[profile.local.overrides]]
# The zsh-fork tests are heavier than most app-server integration tests because
# each case copies and launches a fake packaged app-server plus vendored zsh.
filter = 'package(codex-app-server) & kind(test) & test(turn_start_zsh_fork)'
test-group = 'app_server_zsh_fork_integration_local'
threads-required = "num-test-threads"
```

Rationale:

- `test-group = 'app_server_zsh_fork_integration_local'` keeps zsh-fork tests serial with each other.
- `threads-required = "num-test-threads"` makes each zsh-fork test occupy the full local nextest thread pool while it runs.
- Other `codex-app-server` integration tests remain in `app_server_integration_local` with `max-threads = 4`.

- [ ] **Step 3: Run the target module verification**

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

- [ ] **Step 4: Run one full local verification to check zsh-fork flake status**

Run:

```sh
cd codex-rs
just test
```

Expected zsh-fork absence check:

```text
turn_start_zsh_fork
```

must not appear in any `FLAKY`, `FAIL`, or `TMT` summary line.

Known independent failure handling:

- If `external_agent_config::tests::import_plugins_infers_external_official_marketplace_when_missing_from_settings` still times out, record it as the remaining hard failure.
- Do not treat that timeout as a failure of this zsh-fork isolation plan unless a zsh-fork test also appears as `FLAKY`, `FAIL`, or `TMT`.
- Do not fix `external_agent_config` in this plan.

- [ ] **Step 5: Stop and report**

If the target module verification passes and full local verification no longer reports zsh-fork `FLAKY`, `FAIL`, or `TMT`, report:

When `external_agent_config` still times out:

```text
Implemented global local nextest isolation for turn_start_zsh_fork.
Verified with: just test -p codex-app-server turn_start_zsh_fork --test-threads 2
Full just test zsh-fork status: no zsh-fork FLAKY/FAIL/TMT summary entries
Remaining hard failures: external_agent_config::tests::import_plugins_infers_external_official_marketplace_when_missing_from_settings timed out
```

When the full local run has no remaining hard failures:

```text
Implemented global local nextest isolation for turn_start_zsh_fork.
Verified with: just test -p codex-app-server turn_start_zsh_fork --test-threads 2
Full just test zsh-fork status: no zsh-fork FLAKY/FAIL/TMT summary entries
Remaining hard failures: none
```

Do not stage or commit unless the user explicitly asks.

## Self-Review Checklist

- Spec coverage:
  - The plan modifies only `codex-rs/.config/nextest.toml`.
  - The plan keeps Rust tests and app-server implementation unchanged.
  - The plan preserves local concurrency for non-`turn_start_zsh_fork` app-server integration tests.
  - The plan uses `threads-required = "num-test-threads"` only on the narrow local zsh-fork override.
  - The plan separates zsh-fork retry flakes from the independent `external_agent_config` timeout.

- Placeholder scan:
  - The plan contains exact file paths, exact TOML snippets, exact commands, and expected outcomes.
  - The plan does not use placeholder markers.

- Scope check:
  - The plan includes one full `just test` only to determine whether zsh-fork still appears in summary lines.
  - The plan does not include app-server implementation changes.
  - The plan does not include git stage or commit steps.
