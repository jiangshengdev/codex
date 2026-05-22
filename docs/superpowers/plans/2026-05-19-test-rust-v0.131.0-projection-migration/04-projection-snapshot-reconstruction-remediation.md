# Projection Snapshot Reconstruction Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix projection snapshots so their turns are reconstructed through the official 0.131 app-server reconstruction path instead of the old projection-local compatibility merge.

**Architecture:** Keep official 0.131 code authoritative and avoid upstream refactoring. The only allowed upstream-file change is a minimal `pub(super)` visibility exposure for the existing history loader and reconstruction helper; projection-specific behavior stays in `request_processors/thread_projection.rs`.

**Tech Stack:** Rust, `codex-app-server`, app-server v2 `Thread` / `Turn` protocol types, Tokio tests.

---

## Source Of Truth

- Design: `docs/superpowers/specs/2026-05-19-test-rust-v0.131.0-projection-migration-design.md`
- Original plan: `docs/superpowers/plans/2026-05-19-test-rust-v0.131.0-projection-migration/02-projection-protocol-app-server-runtime.md`

This is a remediation plan for a missed implementation detail in Plan 02. Do not create a new design document unless implementation proves the current design wrong.

## Hard Constraints

- Do not refactor official 0.131 reconstruction code.
- Do not move `reconstruct_thread_turns_for_turns_list`.
- Do not move `load_thread_turns_list_history`.
- Do not change the body or call sites of `thread/turns/list`.
- Do not extract a shared module.
- Do not call paginated `thread/turns/list` as a substitute for reconstruction.
- Do not preserve `read_thread_view(thread_id, true) + merge_live_projection_state(...)` as the projection snapshot turn source.
- Keep projection `headCommitId`, listener ordering, generation gate, detach, fanout, and lifecycle behavior out of scope unless a compile error forces a mechanical import adjustment.

## File Structure

- Modify: `codex-rs/app-server/src/request_processors/thread_processor.rs`
  - Only change visibility on existing items:
    - `load_thread_turns_list_history`
    - `reconstruct_thread_turns_for_turns_list`
- Modify: `codex-rs/app-server/src/request_processors/thread_projection.rs`
  - Replace old snapshot turn construction.
  - Strengthen the focused snapshot equivalence test.
- Do not modify protocol files, generated schema, TUI files, README docs, or projection runtime files.

## Task 1: Add A Failing Canonical Reconstruction Test

**Files:**
- Modify: `codex-rs/app-server/src/request_processors/thread_projection.rs`

- [ ] **Step 1: Rename and strengthen the existing snapshot test**

In `codex-rs/app-server/src/request_processors/thread_projection.rs`, replace the test name:

```rust
async fn thread_read_loaded_include_turns_preserves_history_and_projection_merges_active_turn()
```

with:

```rust
async fn projection_snapshot_turns_match_canonical_reconstruction_for_live_active_turn()
```

Inside the test, keep the existing setup but replace the final projection assertions with a whole-object comparison against the official helper. The final section of the test should have this shape:

```rust
let read_response = processor
    .thread_read(ThreadReadParams {
        thread_id: thread_id.to_string(),
        include_turns: true,
    })
    .await
    .expect("thread/read should include turns for materialized loaded thread");
let Some(ClientResponsePayload::ThreadRead(read_response)) = read_response else {
    panic!("thread/read should return a thread read response");
};

assert_eq!(
    turn_user_texts(&read_response.thread.turns),
    vec!["persisted"]
);
assert!(
    read_response
        .thread
        .turns
        .iter()
        .all(|turn| turn.id != "live-turn"),
    "thread/read should not merge the active turn snapshot"
);

let loaded_status = processor
    .thread_watch_manager
    .loaded_status_for_thread(&thread_id.to_string())
    .await;
let state = thread_state_manager.thread_state(thread_id).await;
let active_turn = state.lock().await.active_turn_snapshot();
let expected_turns = super::super::thread_processor::reconstruct_thread_turns_for_turns_list(
    &persisted_history_items("persisted"),
    loaded_status,
    /*has_live_running_thread*/ false,
    active_turn,
);

let thread = processor
    .read_thread_projection_snapshot(thread_id)
    .await
    .expect("projection snapshot should include the active turn");

assert_eq!(thread.turns, expected_turns);
```

Expected: this test may fail to compile at first because `reconstruct_thread_turns_for_turns_list` is still private to `thread_processor.rs`. That is the intended first failure.

- [ ] **Step 2: Add a stale persisted in-progress case to make the old path fail semantically**

In the same test, change the persisted history append from:

```rust
items: persisted_history_items("persisted"),
```

to:

```rust
items: persisted_in_progress_history_items("persisted-turn", "persisted"),
```

Then change the expected helper call from:

```rust
&persisted_history_items("persisted"),
```

to:

```rust
&persisted_in_progress_history_items("persisted-turn", "persisted"),
```

Add this helper next to `persisted_history_items`:

```rust
fn persisted_in_progress_history_items(turn_id: &str, message: &str) -> Vec<RolloutItem> {
    vec![
        RolloutItem::EventMsg(EventMsg::TurnStarted(
            codex_protocol::protocol::TurnStartedEvent {
                turn_id: turn_id.to_string(),
                started_at: None,
                model_context_window: None,
                collaboration_mode_kind: Default::default(),
            },
        )),
        RolloutItem::EventMsg(EventMsg::UserMessage(
            codex_protocol::protocol::UserMessageEvent {
                message: message.to_string(),
                images: None,
                local_images: Vec::new(),
                text_elements: Vec::new(),
            },
        )),
    ]
}
```

Expected: after helper visibility is fixed, the old implementation should fail this test because it normalizes persisted turns before merging the live active turn.

- [ ] **Step 3: Run the focused failing test**

Run from `codex-rs`:

```bash
cargo test -p codex-app-server projection_snapshot_turns_match_canonical_reconstruction_for_live_active_turn --no-fail-fast
```

Expected now: FAIL. The first acceptable failure is a Rust privacy/visibility error for `reconstruct_thread_turns_for_turns_list`. After visibility is fixed, the acceptable failure is an assertion diff between projection snapshot turns and the canonical expected turns.

Do not proceed if the test passes before implementation. If it passes, strengthen the fixture before changing production code.

## Task 2: Expose Existing 0.131 Reconstruction Inputs Without Refactoring

**Files:**
- Modify: `codex-rs/app-server/src/request_processors/thread_processor.rs`

- [ ] **Step 1: Expose the existing history loader**

In `codex-rs/app-server/src/request_processors/thread_processor.rs`, change only the visibility of the existing method:

```rust
async fn load_thread_turns_list_history(
    &self,
    thread_id: ThreadId,
) -> Result<Vec<RolloutItem>, ThreadReadViewError> {
```

to:

```rust
pub(super) async fn load_thread_turns_list_history(
    &self,
    thread_id: ThreadId,
) -> Result<Vec<RolloutItem>, ThreadReadViewError> {
```

Do not change the method body.

- [ ] **Step 2: Expose the existing reconstruction helper**

In the same file, change only the visibility of the existing helper:

```rust
fn reconstruct_thread_turns_for_turns_list(
    items: &[RolloutItem],
    loaded_status: ThreadStatus,
    has_live_running_thread: bool,
    active_turn: Option<Turn>,
) -> Vec<Turn> {
```

to:

```rust
pub(super) fn reconstruct_thread_turns_for_turns_list(
    items: &[RolloutItem],
    loaded_status: ThreadStatus,
    has_live_running_thread: bool,
    active_turn: Option<Turn>,
) -> Vec<Turn> {
```

Do not change the helper body.

- [ ] **Step 3: Inspect upstream-file diff**

Run:

```bash
git diff -- codex-rs/app-server/src/request_processors/thread_processor.rs
```

Expected: the diff contains exactly two visibility changes in `thread_processor.rs`; no moved code, no new helper, no changed function body, and no changed `thread/turns/list` control flow.

## Task 3: Rebuild Projection Snapshot From Canonical Reconstruction

**Files:**
- Modify: `codex-rs/app-server/src/request_processors/thread_projection.rs`

- [ ] **Step 1: Import the canonical reconstruction helper**

At the top of `codex-rs/app-server/src/request_processors/thread_projection.rs`, add the helper import next to the existing `thread_processor` imports:

```rust
use super::thread_processor::ThreadReadViewError;
use super::thread_processor::reconstruct_thread_turns_for_turns_list;
use super::thread_processor::thread_read_view_error;
```

- [ ] **Step 2: Replace snapshot turn construction**

Replace the existing snapshot methods:

```rust
pub(super) async fn read_thread_projection_snapshot(
    &self,
    thread_id: ThreadId,
) -> Result<Thread, ThreadReadViewError> {
    let mut thread = self.read_projection_base_thread_view(thread_id).await?;
    self.merge_live_projection_state(thread_id, &mut thread)
        .await;
    Ok(thread)
}

async fn read_projection_base_thread_view(
    &self,
    thread_id: ThreadId,
) -> Result<Thread, ThreadReadViewError> {
    match self
        .read_thread_view(thread_id, /*include_turns*/ true)
        .await
    {
        Ok(thread) => Ok(thread),
        Err(ThreadReadViewError::InvalidRequest(message))
            if message
                == format!(
                    "thread {thread_id} is not materialized yet; includeTurns is unavailable before first user message"
                ) =>
        {
            self.read_thread_view(thread_id, /*include_turns*/ false)
                .await
        }
        Err(err) => Err(err),
    }
}

async fn merge_live_projection_state(&self, thread_id: ThreadId, thread: &mut Thread) {
    let thread_state = self.thread_state_manager.thread_state(thread_id).await;
    let active_turn = thread_state.lock().await.active_turn_snapshot();
    let has_live_in_progress_turn = active_turn
        .as_ref()
        .is_some_and(|turn| matches!(turn.status, TurnStatus::InProgress));
    if let Some(active_turn) = active_turn {
        merge_turn_history_with_active_turn(&mut thread.turns, active_turn);
    }
    if has_live_in_progress_turn {
        let thread_status = self
            .thread_watch_manager
            .loaded_status_for_thread(&thread.id)
            .await;
        set_thread_status_and_interrupt_stale_turns(
            thread,
            thread_status,
            has_live_in_progress_turn,
        );
    }
}
```

with:

```rust
pub(super) async fn read_thread_projection_snapshot(
    &self,
    thread_id: ThreadId,
) -> Result<Thread, ThreadReadViewError> {
    let mut thread = self
        .read_thread_view(thread_id, /*include_turns*/ false)
        .await?;
    let loaded_thread = self.thread_manager.get_thread(thread_id).await.ok();
    let has_live_running_thread = match loaded_thread.as_ref() {
        Some(thread) => matches!(thread.agent_status().await, AgentStatus::Running),
        None => false,
    };
    let active_turn = if loaded_thread.is_some() {
        let thread_state = self.thread_state_manager.thread_state(thread_id).await;
        thread_state.lock().await.active_turn_snapshot()
    } else {
        None
    };
    let has_live_in_progress_turn = has_live_running_thread
        || active_turn
            .as_ref()
            .is_some_and(|turn| matches!(turn.status, TurnStatus::InProgress));
    let loaded_status = self
        .thread_watch_manager
        .loaded_status_for_thread(&thread.id)
        .await;
    let history_items = match self.load_thread_turns_list_history(thread_id).await {
        Ok(items) => items,
        Err(ThreadReadViewError::InvalidRequest(message))
            if message
                == format!(
                    "thread {thread_id} is not materialized yet; thread/turns/list is unavailable before first user message"
                ) =>
        {
            Vec::new()
        }
        Err(err) => return Err(err),
    };

    thread.turns = reconstruct_thread_turns_for_turns_list(
        &history_items,
        loaded_status,
        has_live_running_thread,
        active_turn,
    );
    thread.status = resolve_thread_status(loaded_status, has_live_in_progress_turn);
    Ok(thread)
}
```

Expected: projection snapshot gets metadata from `thread/read(includeTurns=false)` and turns from the same history loader plus reconstruction helper used by `thread/turns/list`.

- [ ] **Step 3: Remove obsolete helper imports if the compiler reports them**

If Rust reports unused imports from the old projection-local merge path, remove only the unused imports. Likely removed dependencies include direct use of:

```rust
merge_turn_history_with_active_turn
set_thread_status_and_interrupt_stale_turns
```

Do not remove helpers from `thread_lifecycle.rs`; they are still used by official and resume paths.

- [ ] **Step 4: Run the focused test**

Run from `codex-rs`:

```bash
cargo test -p codex-app-server projection_snapshot_turns_match_canonical_reconstruction_for_live_active_turn --no-fail-fast
```

Expected: PASS.

## Task 4: Add A Regression Gate For The Old Compatibility Shape

**Files:**
- Modify: `codex-rs/app-server/src/request_processors/thread_projection.rs`

- [ ] **Step 1: Run a source-shape grep**

Run:

```bash
rg -n "read_projection_base_thread_view|merge_live_projection_state|read_thread_view\\(thread_id, /\\*include_turns\\*/ true\\)" \
  codex-rs/app-server/src/request_processors/thread_projection.rs
```

Expected: no output.

- [ ] **Step 2: Keep the ordinary read assertion**

Confirm the strengthened test still includes this assertion:

```rust
assert!(
    read_response
        .thread
        .turns
        .iter()
        .all(|turn| turn.id != "live-turn"),
    "thread/read should not merge the active turn snapshot"
);
```

Expected: the test continues to prove that ordinary `thread/read(includeTurns=true)` is not the source of projection live-turn semantics.

- [ ] **Step 3: Inspect projection diff**

Run:

```bash
git diff -- codex-rs/app-server/src/request_processors/thread_projection.rs
```

Expected:

- `read_thread_projection_snapshot` uses `read_thread_view(thread_id, false)` for metadata.
- `read_thread_projection_snapshot` calls `load_thread_turns_list_history`.
- `read_thread_projection_snapshot` calls `reconstruct_thread_turns_for_turns_list`.
- The old projection-local merge helper method is gone.
- The test compares `thread.turns` with `expected_turns` using `assert_eq!`.

## Task 5: Focused Verification And Commit

**Files:**
- Modify: `codex-rs/app-server/src/request_processors/thread_processor.rs`
- Modify: `codex-rs/app-server/src/request_processors/thread_projection.rs`

- [ ] **Step 1: Run app-server projection tests**

Run from `codex-rs`:

```bash
cargo test -p codex-app-server thread_projection --no-fail-fast
```

Expected: projection-focused app-server tests pass.

- [ ] **Step 2: Run formatter**

Run from `codex-rs`:

```bash
just fmt
```

Expected: formatting completes.

- [ ] **Step 3: Run scoped Clippy fix**

Run from `codex-rs`:

```bash
just fix -p codex-app-server
```

Expected: scoped Clippy fix completes. Do not re-run tests after `fix` or `fmt` unless `fix` changes behavior-bearing code unexpectedly.

- [ ] **Step 4: Inspect final diff boundaries**

Run:

```bash
git diff --stat
git diff -- codex-rs/app-server/src/request_processors/thread_processor.rs
git diff -- codex-rs/app-server/src/request_processors/thread_projection.rs
```

Expected:

- `thread_processor.rs` contains only visibility changes for the two existing official helpers.
- `thread_projection.rs` contains the projection snapshot remediation and focused test update.
- No protocol, schema, TUI, README, or runtime lifecycle files changed.

- [ ] **Step 5: Commit**

Run:

```bash
git add codex-rs/app-server/src/request_processors/thread_processor.rs \
  codex-rs/app-server/src/request_processors/thread_projection.rs
git commit -m "fix(app-server): reuse canonical projection snapshot reconstruction"
```

Expected: one focused remediation commit. The commit must not include this plan document unless the user explicitly asks to commit planning docs together with implementation.

## Self-Review Checklist

- [ ] The plan does not alter the existing design source of truth.
- [ ] The plan explains why touching `thread_processor.rs` is allowed: visibility only, no refactor.
- [ ] The implementation path prevents the old `read_thread_view(includeTurns=true) + merge_live_projection_state` shape.
- [ ] The test compares complete `Vec<Turn>` values rather than selected fields.
- [ ] Verification includes a source-shape grep for the old compatibility path.
