# Projection Cursor Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove `ProjectionHistoryCursor` from app-server production behavior so projection attach snapshots read complete persisted history and no longer truncate persisted final / complete items.

**Architecture:** Keep projection generation, head commit, subscriber attach/detach, fanout, and backpressure intact. Remove only the app-server cursor plumbing that estimated persisted history position and used it to cut attach snapshots. Tests should document the new intended behavior: snapshot may be ahead of projection head, and final / complete must remain visible.

**Tech Stack:** Rust app-server crates in `codex-rs`, `tokio` async tests, app-server projection manager/runtime tests, repo `just` recipes from the repository root.

---

## File Structure

- Modify: `codex-rs/app-server/src/thread_projection_cut.rs`
  - Owns `ProjectionSnapshotCut`; after this change it contains only `generation` and `head_commit_id`.
- Modify: `codex-rs/app-server/src/thread_projection.rs`
  - Owns projection manager state and projection delivery. Remove cursor state and cursor-specific APIs while preserving commit chain behavior.
- Modify: `codex-rs/app-server/src/request_processors/thread_projection.rs`
  - Owns projection attach snapshot reconstruction. Remove history truncation and update snapshot tests.
- Modify: `codex-rs/app-server/src/request_processors/thread_lifecycle.rs`
  - Owns per-thread listener loop. Remove cursor initialization, cursor advancement, persisted item count helper, and its unit test.
- Modify: `codex-rs/app-server/src/outgoing_message.rs`
  - Owns thread-scoped outgoing notification sender. Remove cursor field and `with_projection_history_cursor`.
- Modify: `codex-rs/app-server/src/projection_fanout.rs`
  - Owns projection fanout. Remove cursor parameter and branch.
- Modify: `codex-rs/app-server/src/thread_projection_runtime.rs`
  - Owns projection attach runtime tests. Rewrite old hidden-race cut test into new snapshot-ahead semantics.

Do not modify `codex-rs/core`, `codex-rs/thread-store`, `codex-rs/app-server-protocol`, or `codex-gui`.

## Task 1: Rewrite Snapshot Tests For New Semantics

**Files:**
- Modify: `codex-rs/app-server/src/request_processors/thread_projection.rs`
- Modify: `codex-rs/app-server/src/thread_projection_runtime.rs`

- [ ] **Step 1: Change the direct snapshot test to expect full persisted history**

In `codex-rs/app-server/src/request_processors/thread_projection.rs`, replace `projection_snapshot_at_cut_excludes_history_after_cursor` with this new test shape:

```rust
#[tokio::test]
async fn projection_snapshot_at_cut_includes_full_persisted_history() -> Result<()> {
    let fixture = projection_snapshot_fixture_with_history(vec![
        RolloutItem::EventMsg(EventMsg::TurnStarted(
            codex_protocol::protocol::TurnStartedEvent {
                turn_id: "turn-visible".to_string(),
                trace_id: None,
                started_at: Some(1),
                model_context_window: None,
                collaboration_mode_kind: Default::default(),
            },
        )),
        RolloutItem::EventMsg(EventMsg::TurnStarted(
            codex_protocol::protocol::TurnStartedEvent {
                turn_id: "turn-pending".to_string(),
                trace_id: None,
                started_at: Some(2),
                model_context_window: None,
                collaboration_mode_kind: Default::default(),
            },
        )),
    ])
    .await?;

    let cut = crate::thread_projection_cut::ProjectionSnapshotCut {
        generation: fixture
            .processor
            .outgoing
            .thread_projection_manager()
            .capture_current_generation(fixture.thread_id)
            .await,
        head_commit_id: None,
    };
    let snapshot = fixture
        .processor
        .read_thread_projection_snapshot_at_cut(fixture.thread_id, cut)
        .await
        .unwrap_or_else(|_| panic!("projection snapshot at cut should read materialized history"));

    let turn_ids = snapshot
        .thread
        .turns
        .iter()
        .map(|turn| turn.id.as_str())
        .collect::<Vec<_>>();
    assert_eq!(turn_ids, vec!["turn-visible", "turn-pending"]);
    assert_eq!(snapshot.head_commit_id, None);
    Ok(())
}
```

- [ ] **Step 2: Add the final / complete regression test**

In the same test module, add a focused test after the full-history test. Use existing `projection_snapshot_fixture_with_history` and existing protocol event types:

```rust
#[tokio::test]
async fn projection_snapshot_preserves_final_after_physical_only_history_item() -> Result<()> {
    let fixture = projection_snapshot_fixture_with_history(vec![
        RolloutItem::EventMsg(EventMsg::TurnStarted(
            codex_protocol::protocol::TurnStartedEvent {
                turn_id: "turn-final".to_string(),
                trace_id: None,
                started_at: Some(1),
                model_context_window: None,
                collaboration_mode_kind: Default::default(),
            },
        )),
        RolloutItem::EventMsg(EventMsg::ContextCompacted(
            codex_protocol::protocol::ContextCompactedEvent,
        )),
        RolloutItem::EventMsg(EventMsg::AgentMessage(
            codex_protocol::protocol::AgentMessageEvent {
                message: "final answer".to_string(),
                phase: None,
                memory_citation: None,
            },
        )),
        RolloutItem::EventMsg(EventMsg::TurnComplete(
            codex_protocol::protocol::TurnCompleteEvent {
                turn_id: "turn-final".to_string(),
                last_agent_message: Some("final answer".to_string()),
                completed_at: Some(2),
                duration_ms: None,
                time_to_first_token_ms: None,
            },
        )),
    ])
    .await?;

    let cut = crate::thread_projection_cut::ProjectionSnapshotCut {
        generation: fixture
            .processor
            .outgoing
            .thread_projection_manager()
            .capture_current_generation(fixture.thread_id)
            .await,
        head_commit_id: None,
    };
    let snapshot = fixture
        .processor
        .read_thread_projection_snapshot_at_cut(fixture.thread_id, cut)
        .await
        .unwrap_or_else(|_| panic!("projection snapshot should preserve final answer"));

    assert_eq!(snapshot.thread.turns.len(), 1);
    let turn = &snapshot.thread.turns[0];
    assert_eq!(turn.id, "turn-final");
    assert_eq!(turn.status, TurnStatus::Completed);
    assert!(turn.items.iter().any(|item| {
        matches!(
            item,
            ThreadItem::AgentMessage { text, .. } if text == "final answer"
        )
    }));
    assert_eq!(snapshot.head_commit_id, None);
    Ok(())
}
```

If field names on `TurnCompleteEvent` differ in the current checkout, inspect `codex-rs/protocol/src/protocol.rs` and update only this fixture construction; keep the assertion intent unchanged.

- [ ] **Step 3: Rewrite the runtime attach test**

In `codex-rs/app-server/src/thread_projection_runtime.rs`, rename `attach_snapshot_cut_excludes_persisted_event_not_processed_by_projection` to:

```rust
attach_snapshot_can_include_persisted_event_not_processed_by_projection
```

Remove the `harness.set_history_cursor(...)` call and change the expected turn ids:

```rust
assert_eq!(turn_ids, vec!["turn-visible", "turn-pending"]);
assert_eq!(payload.snapshot.head_commit_id, None);
```

Keep `harness.assert_no_projection_attach_lease().await;` so the test still verifies attach cleanup.

- [ ] **Step 4: Run focused tests and confirm the intended failure**

Run from repository root:

```bash
just test -p codex-app-server projection_snapshot_at_cut_includes_full_persisted_history projection_snapshot_preserves_final_after_physical_only_history_item attach_snapshot_can_include_persisted_event_not_processed_by_projection
```

Expected before implementation: compile failures for removed/changed `ProjectionSnapshotCut` fields still referenced by production code, or test assertion failures caused by current `history_items.truncate(...)`.

## Task 2: Remove Cursor From Snapshot Cut And Projection Manager

**Files:**
- Modify: `codex-rs/app-server/src/thread_projection_cut.rs`
- Modify: `codex-rs/app-server/src/thread_projection.rs`

- [ ] **Step 1: Remove `ProjectionHistoryCursor`**

Replace `codex-rs/app-server/src/thread_projection_cut.rs` with:

```rust
use crate::thread_projection::ProjectionGeneration;

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct ProjectionSnapshotCut {
    pub(crate) generation: ProjectionGeneration,
    pub(crate) head_commit_id: Option<String>,
}
```

- [ ] **Step 2: Remove cursor state from `ThreadEntry`**

In `codex-rs/app-server/src/thread_projection.rs`, remove this import:

```rust
use crate::thread_projection_cut::ProjectionHistoryCursor;
```

Change `ThreadEntry` to:

```rust
struct ThreadEntry {
    head_commit_id: Option<String>,
    subscribers: HashMap<ConnectionId, ProjectionSubscriber>,
    has_subscribers_tx: watch::Sender<bool>,
}
```

- [ ] **Step 3: Simplify snapshot cut capture**

Update `capture_snapshot_cut` and `capture_snapshot_cut_if_generation_matches` so they construct only `generation` and `head_commit_id`:

```rust
ProjectionSnapshotCut {
    generation,
    head_commit_id: entry.head_commit_id.clone(),
}
```

and:

```rust
Some(ProjectionSnapshotCut {
    generation: expected_generation,
    head_commit_id: entry.head_commit_id.clone(),
})
```

- [ ] **Step 4: Collapse projection notification APIs**

Delete `set_history_cursor`.

Delete `project_notification_at_cursor` as a public helper. Move its body into `project_notification` with no cursor assignment:

```rust
pub(crate) async fn project_notification(
    &self,
    thread_id: ThreadId,
    notification: &ServerNotification,
) -> Vec<ProjectionDelivery> {
    let Some(event) = projection_event_from_notification(notification) else {
        return Vec::new();
    };
    let mut inner = self.inner.lock().await;
    let generation = inner.capture_generation(thread_id);
    let entry = inner.thread_entry_mut(thread_id);
    let commit_id = Uuid::now_v7().to_string();
    let parent_commit_id = entry.advance_head(commit_id.clone());
    entry
        .sorted_subscribers()
        .into_iter()
        .map(|(connection_id, subscription_id)| ProjectionDelivery {
            connection_id,
            generation,
            notification: ThreadProjectionEventNotification {
                thread_id: thread_id.to_string(),
                subscription_id,
                parent_commit_id: parent_commit_id.clone(),
                commit_id: commit_id.clone(),
                event: event.clone(),
            },
        })
        .collect()
}
```

- [ ] **Step 5: Update projection manager unit tests**

Remove the old cursor tests:

```rust
capture_snapshot_cut_returns_head_and_cursor_together
non_projected_persisted_event_advances_cursor_without_head
```

Add or rename a focused test that preserves head behavior without cursor:

```rust
#[tokio::test]
async fn capture_snapshot_cut_returns_generation_and_head() {
    let manager = ThreadProjectionManager::new();
    let thread_id = ThreadId::new();
    let connection_id = ConnectionId(1);

    let cut = manager.capture_snapshot_cut(thread_id).await;
    let attached = manager
        .attach_if_generation_matches(thread_id, connection_id, cut.generation)
        .await;
    let ProjectionAttachAttempt::Attached(attached) = attached else {
        panic!("attach should succeed");
    };
    assert_eq!(attached.head_commit_id, None);

    let deliveries = manager
        .project_notification(thread_id, &turn_started_notification(thread_id, "turn-1"))
        .await;

    let cut = manager.capture_snapshot_cut(thread_id).await;
    assert_eq!(
        cut.head_commit_id,
        Some(deliveries[0].notification.commit_id.clone())
    );
}
```

- [ ] **Step 6: Run manager focused tests**

Run from repository root:

```bash
just test -p codex-app-server capture_snapshot_cut_returns_generation_and_head capture_snapshot_cut_with_stale_generation_does_not_create_entry projected_delivery_wraps_the_whitelisted_event
```

Expected: compile failures in call sites not yet updated, or these tests pass if call sites are already fixed by this task.

## Task 3: Remove Cursor From Snapshot Reconstruction

**Files:**
- Modify: `codex-rs/app-server/src/request_processors/thread_projection.rs`

- [ ] **Step 1: Delete snapshot history truncation**

In `read_thread_projection_snapshot_at_cut`, change:

```rust
let mut history_items = match self.load_thread_turns_list_history(thread_id).await {
```

to:

```rust
let history_items = match self.load_thread_turns_list_history(thread_id).await {
```

Delete:

```rust
history_items.truncate(cut.history_cursor.item_count());
```

Update the comment above preview from:

```rust
// The thread store only exposes current metadata, so reconcile the
// visible preview from the same truncated history used for turns.
```

to:

```rust
// The thread store only exposes current metadata, so reconcile the
// visible preview from the same persisted history used for turns.
```

- [ ] **Step 2: Update every `ProjectionSnapshotCut` literal in this file**

Remove `history_cursor: ...` from test literals. A valid literal now looks like:

```rust
let cut = crate::thread_projection_cut::ProjectionSnapshotCut {
    generation: fixture
        .processor
        .outgoing
        .thread_projection_manager()
        .capture_current_generation(fixture.thread_id)
        .await,
    head_commit_id: None,
};
```

- [ ] **Step 3: Run snapshot focused tests**

Run from repository root:

```bash
just test -p codex-app-server projection_snapshot_at_cut_includes_full_persisted_history projection_snapshot_preserves_final_after_physical_only_history_item
```

Expected: both tests pass after Tasks 2 and 3.

## Task 4: Remove Cursor From Listener, Outgoing Sender, And Fanout

**Files:**
- Modify: `codex-rs/app-server/src/request_processors/thread_lifecycle.rs`
- Modify: `codex-rs/app-server/src/outgoing_message.rs`
- Modify: `codex-rs/app-server/src/projection_fanout.rs`

- [ ] **Step 1: Remove listener cursor imports and helpers**

In `thread_lifecycle.rs`, remove:

```rust
use crate::thread_projection_cut::ProjectionHistoryCursor;
use codex_protocol::protocol::RolloutItem;
use codex_rollout::persisted_rollout_items;
```

Delete these helper functions:

```rust
projection_history_cursor_for_listener_start
projection_persisted_rollout_item_count_for_event
```

Delete the `#[cfg(test)] mod tests` block that only tests `projection_persisted_rollout_item_count_for_event`.

- [ ] **Step 2: Remove listener cursor setup and advancement**

In `ensure_listener_task_running` listener setup, delete:

```rust
let projection_history_cursor =
    projection_history_cursor_for_listener_start(&conversation).await;
outgoing
    .thread_projection_manager()
    .set_history_cursor(conversation_id, projection_history_cursor)
    .await;
let mut projection_history_cursor = projection_history_cursor;
```

Inside the `event = conversation.next_event()` branch, delete:

```rust
let persisted_item_count =
    projection_persisted_rollout_item_count_for_event(&event.msg);
projection_history_cursor =
    projection_history_cursor.advance_by(persisted_item_count);
outgoing_for_task
    .thread_projection_manager()
    .set_history_cursor(conversation_id, projection_history_cursor)
    .await;
```

Replace:

```rust
let thread_outgoing =
    ThreadScopedOutgoingMessageSender::with_projection_history_cursor(
        outgoing_for_task.clone(),
        subscribed_connection_ids,
        conversation_id,
        projection_history_cursor,
    );
```

with:

```rust
let thread_outgoing = ThreadScopedOutgoingMessageSender::new(
    outgoing_for_task.clone(),
    subscribed_connection_ids,
    conversation_id,
);
```

- [ ] **Step 3: Remove cursor field and constructor from outgoing sender**

In `outgoing_message.rs`, remove:

```rust
use crate::thread_projection_cut::ProjectionHistoryCursor;
```

Change `ThreadScopedOutgoingMessageSender` to:

```rust
pub(crate) struct ThreadScopedOutgoingMessageSender {
    outgoing: Arc<OutgoingMessageSender>,
    connection_ids: Arc<Vec<ConnectionId>>,
    thread_id: ThreadId,
}
```

Remove `projection_history_cursor: None` from `new`.

Delete `with_projection_history_cursor`.

Change `send_server_notification` to call:

```rust
self.outgoing
    .send_thread_projection_notification(self.thread_id, &notification)
    .await;
```

Update `OutgoingMessageSender::send_thread_projection_notification` so it no longer takes `Option<ProjectionHistoryCursor>` and forwards only sender, thread id, and notification.

- [ ] **Step 4: Simplify fanout**

In `projection_fanout.rs`, remove:

```rust
use crate::thread_projection_cut::ProjectionHistoryCursor;
```

Change `ThreadProjectionFacade::enqueue_notification` signature to:

```rust
pub(crate) async fn enqueue_notification(
    &self,
    sender: mpsc::Sender<OutgoingEnvelope>,
    thread_id: ThreadId,
    notification: &ServerNotification,
)
```

Replace the cursor branch with:

```rust
let deliveries = self
    .manager
    .project_notification(thread_id, notification)
    .await;
```

Update tests in this file by removing the `/*projection_history_cursor*/ None` argument from every `enqueue_notification` call.

- [ ] **Step 5: Search for cursor leftovers**

Run from repository root:

```bash
rg -n -e 'ProjectionHistoryCursor|history_cursor|historyCursor|set_history_cursor|project_notification_at_cursor|with_projection_history_cursor|projection_persisted_rollout_item_count_for_event' codex-rs/app-server/src
```

Expected: no production references. If test names or comments intentionally mention old cursor semantics, remove or rewrite them so the search returns no app-server hits.

## Task 5: Update Runtime Attach Test And Run App-Server Verification

**Files:**
- Modify: `codex-rs/app-server/src/thread_projection_runtime.rs`

- [ ] **Step 1: Remove test harness cursor helper**

Delete `ProjectionAttachHarness::set_history_cursor`.

Ensure the rewritten runtime test no longer calls it and asserts:

```rust
assert_eq!(turn_ids, vec!["turn-visible", "turn-pending"]);
assert_eq!(payload.snapshot.head_commit_id, None);
```

- [ ] **Step 2: Run thread projection focused tests**

Run from repository root:

```bash
just test -p codex-app-server thread_projection
```

Expected: all `codex-app-server` tests matching `thread_projection` pass.

- [ ] **Step 3: Run app-server projection runtime focused test if needed**

If Step 2 output does not include the renamed runtime attach test, run it explicitly:

```bash
just test -p codex-app-server attach_snapshot_can_include_persisted_event_not_processed_by_projection
```

Expected: pass.

- [ ] **Step 4: Run formatting and clippy fix**

Run from repository root:

```bash
just fmt
just fix -p codex-app-server
```

Expected: both commands complete successfully. Do not rerun tests after `fmt` or `fix` unless the command output shows a compile error that required manual code changes.

- [ ] **Step 5: Run diff whitespace check**

Run from repository root:

```bash
git diff --check
```

Expected: no output and exit code 0.

- [ ] **Step 6: Final code search**

Run from repository root:

```bash
rg -n -e 'ProjectionHistoryCursor|history_cursor|historyCursor|set_history_cursor|project_notification_at_cursor|with_projection_history_cursor|projection_persisted_rollout_item_count_for_event' codex-rs/app-server/src
```

Expected: no matches.

## Notes For Execution

- Do not stage or commit unless the user explicitly asks.
- Do not operate git remotes.
- Keep the implementation inside `codex-rs/app-server`.
- If a test fixture fails to compile because protocol struct fields changed, inspect the current struct in `codex-rs/protocol/src/protocol.rs` and update only the fixture construction.
- Do not add frontend dedupe, reconnect repair, protocol fields, thread-store append results, or core event boundary changes.
