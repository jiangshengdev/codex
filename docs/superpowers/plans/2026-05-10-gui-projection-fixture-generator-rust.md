# GUI Projection Fixture Generator Rust Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the Rust-only GUI projection fixture generator for the current `ThreadProjection*` protocol without modifying frontend files.

**Architecture:** Implement a unix-gated app-server fixture module that constructs deterministic `codex_app_server_protocol` structs and serializes them to JSON. Expose it through a unix-gated hidden lib function and a unix-safe binary wrapper; tests cover fixture shape, round-trip serde, commit chain topology, and writer behavior using tempdirs only.

**Tech Stack:** Rust, `codex-app-server`, `codex-app-server-protocol`, `serde_json`, `clap`, `anyhow`, `tempfile`, `pretty_assertions`.

---

## Scope

This plan is Rust-only.

Do not modify:

- `codex-gui/src/features/projection/__fixtures__/*.json`
- `codex-gui/.prettierignore`
- `codex-gui/src/features/projection/projectionSlice.ts`
- `codex-gui/src/features/projection/__tests__/*`
- root `pnpm-lock.yaml`
- `codex-gui/pnpm-lock.yaml`

This Rust-only slice creates the generator and Rust unit coverage. The committed-files golden test from the design is intentionally deferred until the follow-up fixture/frontend slice, because enabling it now would require changing `codex-gui` fixture files.

## File Structure

Create:

- `codex-rs/app-server/src/thread_projection_fixtures.rs`: unix-only fixture generator, serializer, writer, and unit tests.
- `codex-rs/app-server/src/bin/write_gui_projection_fixtures.rs`: CLI wrapper with unix implementation and non-unix stub that compiles without referencing the unix-only lib export.

Modify:

- `codex-rs/app-server/src/lib.rs`: add unix-gated module and hidden re-export.

Do not modify `codex-rs/app-server/Cargo.toml`: Cargo auto-discovers binaries under `src/bin/`.

## Deferred To Frontend/Fixture Slice

Do not implement these in this Rust-only plan:

- Writing generated JSON into `codex-gui/src/features/projection/__fixtures__/`.
- Deleting old frontend fixture files from the working tree.
- Adding `codex-gui/.prettierignore`.
- Enabling `generated_fixtures_match_committed_files`.

When frontend fixture files are allowed to change, add the committed-file golden test and run the binary to update `codex-gui`.

## Task 1: Unix-Gated Public Entry And CLI

**Files:**

- Modify: `codex-rs/app-server/src/lib.rs`
- Create: `codex-rs/app-server/src/bin/write_gui_projection_fixtures.rs`

- [ ] **Step 1: Add the unix-gated module and hidden re-export**

In `codex-rs/app-server/src/lib.rs`, add the module near the existing projection modules:

```rust
#[cfg(unix)]
mod thread_projection_fixtures;
```

Add the hidden export near other `pub use` entries:

```rust
#[cfg(unix)]
#[doc(hidden)]
pub fn write_gui_projection_fixtures(out_dir: &std::path::Path) -> anyhow::Result<()> {
    thread_projection_fixtures::write(out_dir)
}
```

- [ ] **Step 2: Create the binary wrapper**

Create `codex-rs/app-server/src/bin/write_gui_projection_fixtures.rs`:

```rust
#[cfg(unix)]
use std::path::PathBuf;

#[cfg(unix)]
use anyhow::Result;
#[cfg(unix)]
use clap::Parser;

#[cfg(unix)]
#[derive(Debug, Parser)]
#[command(about = "Regenerate GUI projection JSON fixtures")]
struct Args {
    /// Output directory for generated GUI projection fixtures.
    #[arg(long = "out-dir", value_name = "DIR")]
    out_dir: Option<PathBuf>,
}

#[cfg(unix)]
fn main() -> Result<()> {
    let args = Args::parse();
    let out_dir = args.out_dir.unwrap_or_else(default_out_dir);

    codex_app_server::write_gui_projection_fixtures(&out_dir)
}

#[cfg(unix)]
fn default_out_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../codex-gui/src/features/projection/__fixtures__")
}

#[cfg(not(unix))]
fn main() {
    std::process::exit(1);
}
```

- [ ] **Step 3: Verify the binary is discoverable without running it**

Run:

```bash
cd codex-rs
cargo check -p codex-app-server --bin write_gui_projection_fixtures
```

Expected before Task 2 implementation: FAIL because `thread_projection_fixtures` does not exist yet.
This is an early discoverability check only. If running this task strictly before Task 2, skip this command or accept that failure; do not treat it as a blocker until the unix-gated module exists.

- [ ] **Step 4: Commit the entry scaffolding after Task 2 compiles**

Do not commit until Task 2 adds the module and `cargo check -p codex-app-server --bin write_gui_projection_fixtures` passes.

## Task 2: Deterministic Fixture Generator

**Files:**

- Create: `codex-rs/app-server/src/thread_projection_fixtures.rs`

- [ ] **Step 1: Create the unix-only module with fixture constants and writer shell**

Create `codex-rs/app-server/src/thread_projection_fixtures.rs`:

```rust
#![cfg(unix)]

use std::collections::BTreeMap;
use std::path::Path;

use anyhow::Context;
use anyhow::Result;
use codex_app_server_protocol::ItemCompletedNotification;
use codex_app_server_protocol::ItemStartedNotification;
use codex_app_server_protocol::SessionSource;
use codex_app_server_protocol::Thread;
use codex_app_server_protocol::ThreadItem;
use codex_app_server_protocol::ThreadProjectionAttachResponse;
use codex_app_server_protocol::ThreadProjectionEvent;
use codex_app_server_protocol::ThreadProjectionEventNotification;
use codex_app_server_protocol::ThreadProjectionSnapshot;
use codex_app_server_protocol::ThreadStatus;
use codex_app_server_protocol::Turn;
use codex_app_server_protocol::TurnCompletedNotification;
use codex_app_server_protocol::TurnItemsView;
use codex_app_server_protocol::TurnStartedNotification;
use codex_app_server_protocol::TurnStatus;
use codex_utils_absolute_path::AbsolutePathBuf;
use serde::Serialize;

const THREAD_ID: &str = "00000000-0000-0000-0000-000000000001";
const SUBSCRIPTION_ID: &str = "projection-fixture-subscription";
const REPLACEMENT_SUBSCRIPTION_ID: &str = "projection-fixture-replacement-subscription";
const REPLACEMENT_HEAD_COMMIT_ID: &str = "commit-replacement-head";
const FIXTURE_CWD: &str = "/tmp/codex-gui-projection-fixtures";

const GENERATED_FIXTURE_NAMES: &[&str] = &[
    "attach-baseline.json",
    "attach-replacement.json",
    "event-item-completed.json",
    "event-item-started.json",
    "event-subscription-replacement.json",
    "event-turn-completed.json",
    "event-turn-started.json",
];

const STALE_FIXTURE_NAMES: &[&str] = &[
    "event-large-sequence.json",
    "event-projection-reset.json",
    "event-thread-metadata-updated-null.json",
];

pub(crate) fn write(out_dir: &Path) -> Result<()> {
    let fixtures = generate_fixture_files()?;
    std::fs::create_dir_all(out_dir)
        .with_context(|| format!("failed to create {}", out_dir.display()))?;

    for stale_name in STALE_FIXTURE_NAMES {
        let path = out_dir.join(stale_name);
        if path.exists() {
            std::fs::remove_file(&path)
                .with_context(|| format!("failed to remove stale fixture {}", path.display()))?;
        }
    }

    for (name, contents) in fixtures {
        let path = out_dir.join(name);
        std::fs::write(&path, contents)
            .with_context(|| format!("failed to write {}", path.display()))?;
    }

    Ok(())
}

pub(crate) fn generate_fixture_files() -> Result<BTreeMap<&'static str, String>> {
    let mut files = BTreeMap::new();

    files.insert("attach-baseline.json", serialize_fixture(&attach_baseline()?)?);
    files.insert(
        "attach-replacement.json",
        serialize_fixture(&attach_replacement()?)?,
    );
    files.insert(
        "event-turn-started.json",
        serialize_fixture(&event_turn_started()?)?,
    );
    files.insert(
        "event-item-started.json",
        serialize_fixture(&event_item_started()?)?,
    );
    files.insert(
        "event-item-completed.json",
        serialize_fixture(&event_item_completed()?)?,
    );
    files.insert(
        "event-turn-completed.json",
        serialize_fixture(&event_turn_completed()?)?,
    );
    files.insert(
        "event-subscription-replacement.json",
        serialize_fixture(&event_subscription_replacement()?)?,
    );

    Ok(files)
}
```

- [ ] **Step 2: Add attach fixture builders**

Append to `thread_projection_fixtures.rs`:

```rust
fn attach_baseline() -> Result<ThreadProjectionAttachResponse> {
    Ok(ThreadProjectionAttachResponse {
        subscription_id: SUBSCRIPTION_ID.to_string(),
        snapshot: ThreadProjectionSnapshot {
            thread: thread(
                THREAD_ID,
                Some("Projection fixture".to_string()),
                vec![completed_turn("baseline-turn", "baseline-plan", "Projection state inspected")],
            )?,
            head_commit_id: None,
        },
    })
}

fn attach_replacement() -> Result<ThreadProjectionAttachResponse> {
    Ok(ThreadProjectionAttachResponse {
        subscription_id: REPLACEMENT_SUBSCRIPTION_ID.to_string(),
        snapshot: ThreadProjectionSnapshot {
            thread: thread(
                THREAD_ID,
                Some("Replacement projection fixture".to_string()),
                vec![completed_turn(
                    "replacement-baseline-turn",
                    "replacement-plan",
                    "Replacement projection state inspected",
                )],
            )?,
            head_commit_id: Some(REPLACEMENT_HEAD_COMMIT_ID.to_string()),
        },
    })
}

fn thread(thread_id: &str, name: Option<String>, turns: Vec<Turn>) -> Result<Thread> {
    Ok(Thread {
        id: thread_id.to_string(),
        session_id: thread_id.to_string(),
        forked_from_id: None,
        preview: "Projection fixture preview".to_string(),
        ephemeral: false,
        model_provider: "mock_provider".to_string(),
        created_at: 1_700_000_000,
        updated_at: 1_700_000_060,
        status: ThreadStatus::Idle,
        path: None,
        cwd: AbsolutePathBuf::from_absolute_path(FIXTURE_CWD)
            .context("fixture cwd must be absolute")?,
        cli_version: "test-fixture".to_string(),
        source: SessionSource::AppServer,
        thread_source: None,
        agent_nickname: None,
        agent_role: None,
        git_info: None,
        name,
        turns,
    })
}
```

- [ ] **Step 3: Confirm current `Turn` and `ThreadItem` protocol fields**

Before writing the builders, read the current protocol structs:

```bash
sed -n '153,190p' codex-rs/app-server-protocol/src/protocol/v2/thread_data.rs
sed -n '212,236p' codex-rs/app-server-protocol/src/protocol/v2/item.rs
```

Current expected `Turn` fields are:

- `id`
- `items`
- `items_view`
- `status`
- `error`
- `started_at`
- `completed_at`
- `duration_ms`

If the source definition has changed, update the builder struct literals to explicitly set every field. Do not use `..Default::default()` for fixture structs; default drift would silently change fixture semantics.

The first fixture version intentionally uses only `ThreadItem::Plan { id, text }`. `Plan` is marked experimental in the protocol, but it matches the historical GUI projection fixtures and avoids `AgentMessage` fields with `#[serde(default)]` that can create round-trip field drift. If the protocol removes or renames `Plan`, update the builders and tests in the same change.

- [ ] **Step 4: Add turn and item builders**

Append:

```rust
fn completed_turn(turn_id: &str, item_id: &str, item_text: &str) -> Turn {
    Turn {
        id: turn_id.to_string(),
        items: vec![plan_item(item_id, item_text)],
        items_view: TurnItemsView::Full,
        status: TurnStatus::Completed,
        error: None,
        started_at: Some(1_700_000_010),
        completed_at: Some(1_700_000_060),
        duration_ms: Some(50_000),
    }
}

fn in_progress_turn(turn_id: &str) -> Turn {
    Turn {
        id: turn_id.to_string(),
        items: Vec::new(),
        items_view: TurnItemsView::Full,
        status: TurnStatus::InProgress,
        error: None,
        started_at: Some(1_700_000_100),
        completed_at: None,
        duration_ms: None,
    }
}

fn completed_event_turn(turn_id: &str) -> Turn {
    Turn {
        id: turn_id.to_string(),
        items: vec![plan_item("plan-item", "Implementation plan ready")],
        items_view: TurnItemsView::Full,
        status: TurnStatus::Completed,
        error: None,
        started_at: Some(1_700_000_100),
        completed_at: Some(1_700_000_160),
        duration_ms: Some(60_000),
    }
}

fn replacement_turn() -> Turn {
    Turn {
        id: "replacement-turn".to_string(),
        items: Vec::new(),
        items_view: TurnItemsView::Full,
        status: TurnStatus::InProgress,
        error: None,
        started_at: Some(1_700_000_200),
        completed_at: None,
        duration_ms: None,
    }
}

fn plan_item(item_id: &str, text: &str) -> ThreadItem {
    ThreadItem::Plan {
        id: item_id.to_string(),
        text: text.to_string(),
    }
}
```

- [ ] **Step 5: Add event fixture builders**

Append:

```rust
fn event_turn_started() -> Result<ThreadProjectionEventNotification> {
    projection_event(
        SUBSCRIPTION_ID,
        "commit-turn-started",
        None,
        ThreadProjectionEvent::TurnStarted {
            notification: TurnStartedNotification {
                thread_id: THREAD_ID.to_string(),
                turn: in_progress_turn("turn-event"),
            },
        },
    )
}

fn event_item_started() -> Result<ThreadProjectionEventNotification> {
    projection_event(
        SUBSCRIPTION_ID,
        "commit-item-started",
        Some("commit-turn-started"),
        ThreadProjectionEvent::ItemStarted {
            notification: ItemStartedNotification {
                item: plan_item("plan-item", "Draft implementation plan"),
                thread_id: THREAD_ID.to_string(),
                turn_id: "turn-event".to_string(),
                started_at_ms: 1_700_000_110_000,
            },
        },
    )
}

fn event_item_completed() -> Result<ThreadProjectionEventNotification> {
    projection_event(
        SUBSCRIPTION_ID,
        "commit-item-completed",
        Some("commit-item-started"),
        ThreadProjectionEvent::ItemCompleted {
            notification: ItemCompletedNotification {
                item: plan_item("plan-item", "Implementation plan ready"),
                thread_id: THREAD_ID.to_string(),
                turn_id: "turn-event".to_string(),
                completed_at_ms: 1_700_000_150_000,
            },
        },
    )
}

fn event_turn_completed() -> Result<ThreadProjectionEventNotification> {
    projection_event(
        SUBSCRIPTION_ID,
        "commit-turn-completed",
        Some("commit-item-completed"),
        ThreadProjectionEvent::TurnCompleted {
            notification: TurnCompletedNotification {
                thread_id: THREAD_ID.to_string(),
                turn: completed_event_turn("turn-event"),
            },
        },
    )
}

fn event_subscription_replacement() -> Result<ThreadProjectionEventNotification> {
    projection_event(
        REPLACEMENT_SUBSCRIPTION_ID,
        "commit-replacement-next",
        Some(REPLACEMENT_HEAD_COMMIT_ID),
        ThreadProjectionEvent::TurnStarted {
            notification: TurnStartedNotification {
                thread_id: THREAD_ID.to_string(),
                turn: replacement_turn(),
            },
        },
    )
}

fn projection_event(
    subscription_id: &str,
    commit_id: &str,
    parent_commit_id: Option<&str>,
    event: ThreadProjectionEvent,
) -> Result<ThreadProjectionEventNotification> {
    Ok(ThreadProjectionEventNotification {
        thread_id: THREAD_ID.to_string(),
        subscription_id: subscription_id.to_string(),
        commit_id: commit_id.to_string(),
        parent_commit_id: parent_commit_id.map(str::to_string),
        event,
    })
}

fn serialize_fixture<T: Serialize>(value: &T) -> Result<String> {
    let json = serde_json::to_string_pretty(value)?;
    Ok(format!("{json}\n"))
}
```

- [ ] **Step 6: Run check**

Run:

```bash
cd codex-rs
cargo check -p codex-app-server --bin write_gui_projection_fixtures
```

Expected: PASS.

Do not run `cargo run -p codex-app-server --bin write_gui_projection_fixtures` without an `--out-dir` in this Rust-only plan, because the default output directory is under `codex-gui`.

## Task 3: Unit Tests For Generated Shape And Serde

**Files:**

- Modify: `codex-rs/app-server/src/thread_projection_fixtures.rs`

- [ ] **Step 1: Add fixture set and stale-file tests**

Append to `thread_projection_fixtures.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use pretty_assertions::assert_eq;
    use serde::de::DeserializeOwned;
    use serde_json::Value;

    #[test]
    fn generated_fixture_set_is_stable() -> Result<()> {
        let fixtures = generate_fixture_files()?;
        let actual = fixtures.keys().copied().collect::<Vec<_>>();
        assert_eq!(actual, GENERATED_FIXTURE_NAMES);
        Ok(())
    }

    #[test]
    fn generated_fixture_set_excludes_stale_historical_files() -> Result<()> {
        let fixtures = generate_fixture_files()?;
        for stale_name in STALE_FIXTURE_NAMES {
            assert!(
                !fixtures.contains_key(stale_name),
                "stale historical fixture should not be generated: {stale_name}"
            );
        }
        Ok(())
    }
}
```

- [ ] **Step 2: Run tests and confirm failure/pass state**

Run:

```bash
cd codex-rs
cargo test -p codex-app-server thread_projection_fixtures::tests::generated_fixture_set_is_stable -- --nocapture
cargo test -p codex-app-server thread_projection_fixtures::tests::generated_fixture_set_excludes_stale_historical_files -- --nocapture
```

Expected: PASS.

- [ ] **Step 3: Add shape and old-field assertions**

Inside the same `tests` module append:

```rust
    #[test]
    fn generated_fixtures_match_current_projection_shape() -> Result<()> {
        let fixtures = generate_fixture_files()?;
        let attach: Value = serde_json::from_str(&fixtures["attach-baseline.json"])?;
        let event: Value = serde_json::from_str(&fixtures["event-turn-started.json"])?;

        assert!(attach.get("subscriptionId").is_some());
        assert!(attach.get("snapshot").is_some());
        assert!(attach["snapshot"].get("thread").is_some());
        assert!(attach["snapshot"].get("headCommitId").is_some());
        assert_eq!(attach["snapshot"]["thread"]["status"]["type"], "idle");

        assert_eq!(event["threadId"], THREAD_ID);
        assert_eq!(event["subscriptionId"], SUBSCRIPTION_ID);
        assert_eq!(event["commitId"], "commit-turn-started");
        assert_eq!(event["parentCommitId"], Value::Null);
        assert_eq!(event["event"]["type"], "turnStarted");

        for contents in fixtures.values() {
            let value: Value = serde_json::from_str(contents)?;
            assert_absent_recursive(&value, "projectionInstanceId");
            assert_absent_recursive(&value, "latestSequence");
            assert_absent_recursive(&value, "sequence");
            assert_absent_recursive(&value, "eventId");
            assert_absent_recursive(&value, "payload");
        }

        Ok(())
    }

    fn assert_absent_recursive(value: &Value, key: &str) {
        match value {
            Value::Object(map) => {
                assert!(!map.contains_key(key), "unexpected historical field {key}");
                for child in map.values() {
                    assert_absent_recursive(child, key);
                }
            }
            Value::Array(items) => {
                for child in items {
                    assert_absent_recursive(child, key);
                }
            }
            Value::Null | Value::Bool(_) | Value::Number(_) | Value::String(_) => {}
        }
    }
```

- [ ] **Step 4: Add protocol round-trip tests**

Inside `tests` append:

```rust
    #[test]
    fn generated_fixtures_round_trip_through_protocol_types() -> Result<()> {
        let fixtures = generate_fixture_files()?;

        assert_round_trips::<ThreadProjectionAttachResponse>(&fixtures["attach-baseline.json"])?;
        assert_round_trips::<ThreadProjectionAttachResponse>(&fixtures["attach-replacement.json"])?;

        for name in [
            "event-turn-started.json",
            "event-item-started.json",
            "event-item-completed.json",
            "event-turn-completed.json",
            "event-subscription-replacement.json",
        ] {
            assert_round_trips::<ThreadProjectionEventNotification>(&fixtures[name])?;
        }

        Ok(())
    }

    fn assert_round_trips<T>(contents: &str) -> Result<()>
    where
        T: DeserializeOwned + Serialize,
    {
        let value: T = serde_json::from_str(contents)?;
        assert_eq!(serialize_fixture(&value)?, contents);
        Ok(())
    }
```

- [ ] **Step 5: Add commit-chain test**

Inside `tests` append:

```rust
    #[test]
    fn generated_commit_chain_is_contiguous() -> Result<()> {
        let fixtures = generate_fixture_files()?;
        let turn_started: ThreadProjectionEventNotification =
            serde_json::from_str(&fixtures["event-turn-started.json"])?;
        let item_started: ThreadProjectionEventNotification =
            serde_json::from_str(&fixtures["event-item-started.json"])?;
        let item_completed: ThreadProjectionEventNotification =
            serde_json::from_str(&fixtures["event-item-completed.json"])?;
        let turn_completed: ThreadProjectionEventNotification =
            serde_json::from_str(&fixtures["event-turn-completed.json"])?;
        let replacement: ThreadProjectionEventNotification =
            serde_json::from_str(&fixtures["event-subscription-replacement.json"])?;

        assert_eq!(turn_started.parent_commit_id, None);
        assert_eq!(item_started.parent_commit_id, Some(turn_started.commit_id));
        assert_eq!(item_completed.parent_commit_id, Some(item_started.commit_id));
        assert_eq!(turn_completed.parent_commit_id, Some(item_completed.commit_id));
        assert_eq!(
            replacement.parent_commit_id,
            Some(REPLACEMENT_HEAD_COMMIT_ID.to_string())
        );
        assert_eq!(replacement.subscription_id, REPLACEMENT_SUBSCRIPTION_ID);

        Ok(())
    }
```

- [ ] **Step 6: Run focused tests**

Run:

```bash
cd codex-rs
cargo test -p codex-app-server thread_projection_fixtures -- --nocapture
```

Expected: PASS.

## Task 4: Writer Behavior Tests

**Files:**

- Modify: `codex-rs/app-server/src/thread_projection_fixtures.rs`

- [ ] **Step 1: Add tempdir writer test**

Inside the existing `tests` module append:

```rust
    #[test]
    fn write_preserves_unrelated_files_and_removes_stale_generated_files() -> Result<()> {
        let temp_dir = tempfile::TempDir::new()?;
        let out_dir = temp_dir.path().join("fixtures");
        std::fs::create_dir(&out_dir)?;

        let unrelated_path = out_dir.join("keep.txt");
        std::fs::write(&unrelated_path, "do not remove")?;

        let stale_path = out_dir.join("event-large-sequence.json");
        std::fs::write(&stale_path, "stale historical fixture")?;

        let generated_path = out_dir.join("attach-baseline.json");
        std::fs::write(&generated_path, "stale generated fixture")?;

        write(&out_dir)?;

        let fixtures = generate_fixture_files()?;
        assert_eq!(std::fs::read_to_string(&unrelated_path)?, "do not remove");
        assert!(!stale_path.exists());
        assert_eq!(
            std::fs::read_to_string(&generated_path)?,
            fixtures["attach-baseline.json"]
        );
        Ok(())
    }
```

- [ ] **Step 2: Run writer test**

Run:

```bash
cd codex-rs
cargo test -p codex-app-server thread_projection_fixtures::tests::write_preserves_unrelated_files_and_removes_stale_generated_files -- --nocapture
```

Expected: PASS.

- [ ] **Step 3: Verify binary writes only to tempdir**

Run:

```bash
cd codex-rs
tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT
cargo run -p codex-app-server --bin write_gui_projection_fixtures -- --out-dir "$tmpdir"
find "$tmpdir" -maxdepth 1 -type f -name '*.json' -exec basename {} \; | sort
```

Expected output includes exactly:

```text
attach-baseline.json
attach-replacement.json
event-item-completed.json
event-item-started.json
event-subscription-replacement.json
event-turn-completed.json
event-turn-started.json
```

Do not run the binary without `--out-dir` in this Rust-only plan.

## Task 5: Final Rust Verification

**Files:**

- Verify only.

- [ ] **Step 1: Format Rust**

Run:

```bash
cd codex-rs
just fmt
```

Expected: PASS.

- [ ] **Step 2: Run focused app-server tests**

Run:

```bash
cd codex-rs
cargo test -p codex-app-server thread_projection_fixtures --no-fail-fast
```

Expected: PASS.

- [ ] **Step 3: Check binary target**

Run:

```bash
cd codex-rs
cargo check -p codex-app-server --bin write_gui_projection_fixtures
```

Expected: PASS.

- [ ] **Step 4: Run scoped clippy fix**

The repository root `justfile` defines `fix *args` as `cargo clippy --fix --tests --allow-dirty "$@"`, so `-p codex-app-server` is passed through to Cargo. If that recipe changes before implementation, use the current scoped clippy-fix recipe that targets only `codex-app-server`.

Run:

```bash
cd codex-rs
just fix -p codex-app-server
```

Expected: PASS or no actionable changes beyond rustfmt/clippy fixes.

Do not re-run tests after `just fix`, per repo instructions.

- [ ] **Step 5: Confirm no frontend files changed**

Run:

```bash
git status --short
```

Expected: only Rust files and this plan file are modified. There must be no `codex-gui/` entries.

## Expected Commit Split

Use frequent commits:

1. `feat(app-server): add GUI projection fixture generator`
   - `codex-rs/app-server/src/lib.rs`
   - `codex-rs/app-server/src/bin/write_gui_projection_fixtures.rs`
   - `codex-rs/app-server/src/thread_projection_fixtures.rs`

2. `test(app-server): validate GUI projection fixture generation`
   - same Rust module if tests are added after implementation

If implementation and tests land together cleanly, a single commit is acceptable:

```bash
git add codex-rs/app-server/src/lib.rs \
  codex-rs/app-server/src/bin/write_gui_projection_fixtures.rs \
  codex-rs/app-server/src/thread_projection_fixtures.rs
git commit -m "feat(app-server): add GUI projection fixture generator"
```

Do not include `codex-gui/` files in the Rust-only commit.

## Follow-Up Plan Needed

After this Rust-only plan is implemented, create a separate frontend/fixture plan for:

- Running the generator without `--out-dir` to update committed GUI fixture JSON.
- Adding `codex-gui/.prettierignore`.
- Enabling `generated_fixtures_match_committed_files`.
- Updating `projectionSlice.ts` and frontend tests.
