# GUI Projection Fixture Generator Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 从 `port/lazy-proj-130` 迁移 GUI projection fixture 生成器，让 `codex-gui/src/features/projection/__fixtures__` 重新由当前 Rust `ThreadProjection*` 协议类型生成。

**Architecture:** 保留旧分支有价值的 CLI 外壳和 writer 行为，但按当前分支的 `ThreadProjectionAttachResponse` / `ThreadProjectionEventNotification` 重写生成逻辑。Rust generator 负责确定性构造、pretty JSON 序列化、stale fixture 清理和 committed fixture golden 校验；前端只继续消费生成后的 fixture，不在本计划中重写 reducer 协议模型。

**Tech Stack:** Rust, `codex-app-server`, `codex-app-server-protocol`, `serde_json`, `clap`, `anyhow`, `tempfile`, `pretty_assertions`, Vitest, TypeScript.

---

## Scope

本计划只迁移 generator 和 generator-owned fixture。

允许修改：

- `codex-rs/app-server/src/bin/write_gui_projection_fixtures.rs`
- `codex-rs/app-server/src/thread_projection_fixtures.rs`
- `codex-rs/app-server/src/lib.rs`
- `codex-gui/.prettierignore`
- `codex-gui/src/features/projection/__fixtures__/*.json`

只在 fixture shape 需要随 generator 输出同步时修改：

- `codex-gui/src/features/projection/__tests__/projectionFixtures.test.ts`
- `codex-gui/src/features/projection/__tests__/projectionSlice.test.ts`

禁止修改：

- `Cargo.toml`
- `Cargo.lock`
- `MODULE.bazel.lock`
- root `pnpm-lock.yaml`
- `codex-gui/pnpm-lock.yaml`
- `codex-gui/src/features/projection/projectionSlice.ts`
- `codex-rs/app-server-protocol/src/protocol/v2/thread_projection.rs`

当前 `codex-app-server` 已有本计划所需依赖，不需要 dependency 或 lockfile 变更。

## Current State Notes

`port/lazy-proj-130` 中 generator 的有价值入口是：

```text
codex-rs/app-server/src/bin/write_gui_projection_fixtures.rs
codex-rs/app-server/src/thread_projection_fixtures.rs
```

当前分支中 `codex-gui` 已经使用 current protocol envelope：

```text
ThreadProjectionAttachResponse {
  subscriptionId,
  snapshot: { thread, headCommitId },
}

ThreadProjectionEventNotification {
  threadId,
  subscriptionId,
  commitId,
  parentCommitId,
  event,
}
```

迁移重点不是恢复旧 projection model，也不是重写前端 store。当前手写 fixture 缺少最新 `Thread` wire shape 中的 `parentThreadId` 字段，因此运行 generator 后预期 fixture 会出现稳定 JSON 更新。

## File Structure

Create:

- `codex-rs/app-server/src/bin/write_gui_projection_fixtures.rs`: CLI wrapper，支持 `--out-dir`，默认输出到 GUI projection fixture 目录。
- `codex-rs/app-server/src/thread_projection_fixtures.rs`: unix-gated deterministic generator、writer 和 unit tests。

Modify:

- `codex-rs/app-server/src/lib.rs`: unix-gated module 和 hidden re-export。
- `codex-gui/.prettierignore`: 排除 generator-owned JSON fixture，避免 Prettier 和 Rust pretty JSON 抢格式所有权。
- `codex-gui/src/features/projection/__fixtures__/*.json`: 由 generator 重写。

## Task 1: Add Rust Generator Entry Points

**Files:**

- Modify: `codex-rs/app-server/src/lib.rs`
- Create: `codex-rs/app-server/src/bin/write_gui_projection_fixtures.rs`

- [ ] **Step 1: Add unix-gated module in `lib.rs`**

在 `codex-rs/app-server/src/lib.rs` 的 module list 中，靠近现有 projection modules 加入：

```rust
#[cfg(unix)]
mod thread_projection_fixtures;
```

- [ ] **Step 2: Add hidden generator export in `lib.rs`**

在 `pub use` 区域后加入：

```rust
#[cfg(unix)]
#[doc(hidden)]
pub fn write_gui_projection_fixtures(out_dir: &std::path::Path) -> anyhow::Result<()> {
    thread_projection_fixtures::write(out_dir)
}
```

这个 export 只服务 binary 和 tests，不是 app-server public API。

- [ ] **Step 3: Create CLI wrapper**

创建 `codex-rs/app-server/src/bin/write_gui_projection_fixtures.rs`：

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

不要在 non-unix stub 中输出文本；`codex-app-server` 目前 deny `clippy::print_stdout` 和 `clippy::print_stderr`。

## Task 2: Implement Deterministic Fixture Generator

**Files:**

- Create: `codex-rs/app-server/src/thread_projection_fixtures.rs`

- [ ] **Step 1: Create module shell, constants, writer, and file generation map**

创建 `codex-rs/app-server/src/thread_projection_fixtures.rs`：

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

追加：

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
        parent_thread_id: None,
        preview: "Projection fixture thread".to_string(),
        ephemeral: false,
        model_provider: "openai".to_string(),
        created_at: 1_700_000_000,
        updated_at: 1_700_000_030,
        status: ThreadStatus::Idle,
        path: None,
        cwd: AbsolutePathBuf::from_absolute_path(FIXTURE_CWD)
            .context("fixture cwd must be absolute")?,
        cli_version: "projection-fixture".to_string(),
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

- [ ] **Step 3: Add turn and item builders**

追加：

```rust
fn completed_turn(turn_id: &str, item_id: &str, item_text: &str) -> Turn {
    Turn {
        id: turn_id.to_string(),
        items: vec![plan_item(item_id, item_text)],
        items_view: TurnItemsView::Full,
        status: TurnStatus::Completed,
        error: None,
        started_at: Some(1_700_000_001),
        completed_at: Some(1_700_000_005),
        duration_ms: Some(4_000),
    }
}

fn in_progress_turn(turn_id: &str) -> Turn {
    Turn {
        id: turn_id.to_string(),
        items: Vec::new(),
        items_view: TurnItemsView::Full,
        status: TurnStatus::InProgress,
        error: None,
        started_at: Some(1_700_000_010),
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
        started_at: Some(1_700_000_010),
        completed_at: Some(1_700_000_016),
        duration_ms: Some(6_000),
    }
}

fn replacement_turn() -> Turn {
    Turn {
        id: "replacement-turn".to_string(),
        items: Vec::new(),
        items_view: TurnItemsView::Full,
        status: TurnStatus::InProgress,
        error: None,
        started_at: Some(1_700_000_020),
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

- [ ] **Step 4: Add event fixture builders**

追加：

```rust
fn event_turn_started() -> Result<ThreadProjectionEventNotification> {
    projection_event(
        SUBSCRIPTION_ID,
        "commit-turn-started",
        None,
        ThreadProjectionEvent::TurnStarted {
            notification: TurnStartedNotification {
                thread_id: THREAD_ID.to_string(),
                turn: in_progress_turn("turn-in-progress"),
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
                thread_id: THREAD_ID.to_string(),
                turn_id: "turn-in-progress".to_string(),
                item: plan_item("plan-item", "Draft implementation plan"),
                started_at_ms: 1_700_000_011_000,
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
                thread_id: THREAD_ID.to_string(),
                turn_id: "turn-in-progress".to_string(),
                item: plan_item("plan-item", "Implementation plan ready"),
                completed_at_ms: 1_700_000_015_000,
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
                turn: completed_event_turn("turn-in-progress"),
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
```

- [ ] **Step 5: Add serializer**

追加 serializer：

```rust
fn serialize_fixture<T: Serialize>(value: &T) -> Result<String> {
    let json = serde_json::to_string_pretty(value)?;
    Ok(format!("{json}\n"))
}
```

- [ ] **Step 6: Check binary target**

Run:

```bash
cd codex-rs
cargo check -p codex-app-server --bin write_gui_projection_fixtures
```

Expected: PASS.

## Task 3: Add Rust Tests Before Updating Committed Fixtures

**Files:**

- Modify: `codex-rs/app-server/src/thread_projection_fixtures.rs`

- [ ] **Step 1: Add test module, fixture set tests, shape tests, and stale field checks**

追加：

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

    #[test]
    fn generated_fixtures_match_current_projection_shape() -> Result<()> {
        let fixtures = generate_fixture_files()?;
        let attach: Value = serde_json::from_str(&fixtures["attach-baseline.json"])?;
        let event: Value = serde_json::from_str(&fixtures["event-turn-started.json"])?;

        assert!(attach.get("subscriptionId").is_some());
        assert!(attach.get("snapshot").is_some());
        assert!(attach["snapshot"].get("thread").is_some());
        assert!(attach["snapshot"].get("headCommitId").is_some());
        assert_eq!(attach["snapshot"]["thread"]["parentThreadId"], Value::Null);
        assert_eq!(attach["snapshot"]["thread"]["status"]["type"], "idle");

        assert_eq!(event["threadId"], THREAD_ID);
        assert_eq!(event["subscriptionId"], SUBSCRIPTION_ID);
        assert_eq!(event["commitId"], "commit-turn-started");
        assert_eq!(event["parentCommitId"], Value::Null);
        assert_eq!(event["event"]["type"], "turnStarted");

        for contents in fixtures.values() {
            let value: Value = serde_json::from_str(contents)?;
            for field in [
                "projectionInstanceId",
                "latestSequence",
                "sequence",
                "eventId",
                "payload",
            ] {
                assert_absent_recursive(&value, field);
            }
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
}
```

- [ ] **Step 2: Add protocol round-trip and commit-chain tests**

在同一个 `tests` module 内追加：

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

- [ ] **Step 3: Add writer behavior test**

在同一个 `tests` module 内追加：

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

- [ ] **Step 4: Run focused Rust tests**

Run:

```bash
just test -p codex-app-server thread_projection_fixtures
```

Expected: PASS.

- [ ] **Step 5: Verify binary writes only to tempdir**

Run:

```bash
cd codex-rs
tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT
cargo run -p codex-app-server --bin write_gui_projection_fixtures -- --out-dir "$tmpdir"
find "$tmpdir" -maxdepth 1 -type f -name '*.json' -exec basename {} \; | sort
```

Expected:

```text
attach-baseline.json
attach-replacement.json
event-item-completed.json
event-item-started.json
event-subscription-replacement.json
event-turn-completed.json
event-turn-started.json
```

## Task 4: Update Committed GUI Fixtures And Add Golden Test

**Files:**

- Modify: `codex-gui/src/features/projection/__fixtures__/*.json`
- Modify: `codex-gui/.prettierignore`
- Modify: `codex-rs/app-server/src/thread_projection_fixtures.rs`

- [ ] **Step 1: Add fixture directory to Prettier ignore**

Modify `codex-gui/.prettierignore`:

```text
# Ignore artifacts:
build
coverage

# Ignore lockfiles:
pnpm-lock.yaml

# Rust-generated projection fixtures:
src/features/projection/__fixtures__/
```

- [ ] **Step 2: Run generator against default GUI fixture directory**

Run:

```bash
cd codex-rs
cargo run -p codex-app-server --bin write_gui_projection_fixtures
```

Expected: generator rewrites the seven JSON fixtures under:

```text
codex-gui/src/features/projection/__fixtures__/
```

Expected stable notable diff:

```json
"parentThreadId": null
```

appears in generated `snapshot.thread` objects because current `Thread` protocol includes `parent_thread_id`.

- [ ] **Step 3: Add committed-file golden test**

在 `codex-rs/app-server/src/thread_projection_fixtures.rs` 的 `tests` module 内追加：

```rust
    #[test]
    fn generated_fixtures_match_committed_files() -> Result<()> {
        let fixtures = generate_fixture_files()?;
        let committed_dir = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../codex-gui/src/features/projection/__fixtures__");

        for (name, generated_contents) in fixtures {
            let committed_path = committed_dir.join(name);
            let committed_contents = std::fs::read_to_string(&committed_path).with_context(|| {
                format!(
                    "failed to read committed projection fixture {}; re-run cargo run -p codex-app-server --bin write_gui_projection_fixtures and commit the fixture changes",
                    committed_path.display()
                )
            })?;
            assert_eq!(
                committed_contents,
                generated_contents,
                "committed projection fixture {name} is stale; re-run cargo run -p codex-app-server --bin write_gui_projection_fixtures and commit the fixture changes"
            );
        }

        Ok(())
    }
```

- [ ] **Step 4: Run Rust generator tests with committed golden enabled**

Run:

```bash
just test -p codex-app-server thread_projection_fixtures
```

Expected: PASS.

- [ ] **Step 5: Confirm no stale historical fixtures remain**

Run:

```bash
find codex-gui/src/features/projection/__fixtures__ -maxdepth 1 -type f | sort
```

Expected:

```text
codex-gui/src/features/projection/__fixtures__/attach-baseline.json
codex-gui/src/features/projection/__fixtures__/attach-replacement.json
codex-gui/src/features/projection/__fixtures__/event-item-completed.json
codex-gui/src/features/projection/__fixtures__/event-item-started.json
codex-gui/src/features/projection/__fixtures__/event-subscription-replacement.json
codex-gui/src/features/projection/__fixtures__/event-turn-completed.json
codex-gui/src/features/projection/__fixtures__/event-turn-started.json
```

## Task 5: Frontend Fixture Verification

**Files:**

- Verify: `codex-gui/src/features/projection/__tests__/projectionFixtures.test.ts`
- Verify: `codex-gui/src/features/projection/__tests__/projectionSlice.test.ts`

- [ ] **Step 1: Run projection-focused frontend tests**

Run:

```bash
cd codex-gui
pnpm test -- src/features/projection/__tests__/projectionFixtures.test.ts src/features/projection/__tests__/projectionSlice.test.ts
```

Expected: PASS.

- [ ] **Step 2: If fixture tests fail only because generated fixture strings changed, update test expectations narrowly**

允许的 test expectation 更新示例：

```ts
expect(attachBaseline.snapshot.thread.parentThreadId).toBeNull();
```

不要修改 `projectionSlice.ts`。如果 reducer 行为失败，先判断 generator fixture event chain 是否偏离当前 tests，而不是把 reducer 改成适配 generator。

- [ ] **Step 3: Run frontend type-check**

Run:

```bash
cd codex-gui
pnpm type-check
```

Expected: PASS.

## Task 6: Final Formatting And Scoped Verification

**Files:**

- Verify all changed files.

- [ ] **Step 1: Run Rust formatter**

Run from repo root:

```bash
just fmt
```

Expected: PASS.

- [ ] **Step 2: Run app-server focused tests**

Run:

```bash
just test -p codex-app-server thread_projection_fixtures
```

Expected: PASS.

- [ ] **Step 3: Run binary check**

Run:

```bash
cd codex-rs
cargo check -p codex-app-server --bin write_gui_projection_fixtures
```

Expected: PASS.

- [ ] **Step 4: Run scoped clippy fix**

Run from repo root:

```bash
just fix -p codex-app-server
```

Expected: PASS or no actionable changes beyond formatter/clippy fixes.

Do not re-run tests after `just fix`, per repo instructions.

- [ ] **Step 5: Confirm lockfiles were not modified**

Run:

```bash
git status --short -- Cargo.lock codex-rs/Cargo.lock MODULE.bazel.lock pnpm-lock.yaml codex-gui/pnpm-lock.yaml
```

Expected: no output.

- [ ] **Step 6: Confirm final changed file scope**

Run:

```bash
git status --short
```

Expected changed files are limited to:

```text
codex-rs/app-server/src/bin/write_gui_projection_fixtures.rs
codex-rs/app-server/src/lib.rs
codex-rs/app-server/src/thread_projection_fixtures.rs
codex-gui/.prettierignore
codex-gui/src/features/projection/__fixtures__/attach-baseline.json
codex-gui/src/features/projection/__fixtures__/attach-replacement.json
codex-gui/src/features/projection/__fixtures__/event-item-completed.json
codex-gui/src/features/projection/__fixtures__/event-item-started.json
codex-gui/src/features/projection/__fixtures__/event-subscription-replacement.json
codex-gui/src/features/projection/__fixtures__/event-turn-completed.json
codex-gui/src/features/projection/__fixtures__/event-turn-started.json
docs/superpowers/plans/2026-06-07-gui-projection-fixture-generator-migration.md
```

If `projectionFixtures.test.ts` changes because of `parentThreadId`, include that file too. If any unrelated file appears, inspect before staging.

## Commit Guidance

Recommended commit split:

```bash
git add docs/superpowers/plans/2026-06-07-gui-projection-fixture-generator-migration.md
git commit -m "docs(gui): plan projection fixture generator migration"
```

Implementation commit after executing this plan:

```bash
git add codex-rs/app-server/src/bin/write_gui_projection_fixtures.rs \
  codex-rs/app-server/src/lib.rs \
  codex-rs/app-server/src/thread_projection_fixtures.rs \
  codex-gui/.prettierignore \
  codex-gui/src/features/projection/__fixtures__
git commit -m "feat(app-server): add GUI projection fixture generator"
```

If frontend tests require a narrow expectation update:

```bash
git add codex-gui/src/features/projection/__tests__/projectionFixtures.test.ts
git commit -m "test(gui): validate generated projection fixtures"
```

## Self-Review

- Spec coverage: generator entry, deterministic protocol construction, stale fixture cleanup, committed golden test, GUI fixture update, and frontend verification are all covered.
- Placeholder scan: the plan avoids open-ended implementation steps; every code step includes concrete snippets and exact commands.
- Type consistency: all fixture payloads use current `ThreadProjectionAttachResponse`, `ThreadProjectionEventNotification`, `ThreadProjectionEvent`, `Thread`, `Turn`, and `ThreadItem::Plan` fields from the current branch.
