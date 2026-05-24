# Projection Snapshot Head Cut Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `thread/projection/attach` return a snapshot and `headCommitId` from the same listener-processed projection cut.

**Architecture:** Keep the fix fork-local and app-server-focused: add a small rollout persistence count helper, track a per-thread projection history cursor in the listener/PM path, capture snapshot cut inside the listener command handler, and reconstruct attach snapshots from history truncated to that cut. Keep existing `ProjectionGeneration` stale attach protection and do not change protocol or `ThreadStore` trait APIs.

**Tech Stack:** Rust, Tokio tests, `codex-rollout`, `codex-app-server`, existing `thread_projection` and `thread_projection_runtime` test helpers, `pretty_assertions`.

---

## Source Of Truth

- Design: `docs/superpowers/specs/2026-05-24-projection-snapshot-head-cut-design.md`
- Issue: `docs/superpowers/issues/2026-05-19-projection-hidden-race-review.md`
- Prior related fix: `docs/superpowers/specs/2026-05-21-projection-attach-generation-gate-design.md`

## Scope

This plan fixes only the snapshot/head cut mismatch:

- attach snapshot must not include persisted history that the listener has not processed into projection state.
- attach response must use the `headCommitId` from the same projection cut as the snapshot.
- pending persisted events remain deliverable later as `thread/projection/event`.

Do not solve in this change:

- Do not solve projection fanout backpressure.
- Do not change `ThreadStore` trait signatures.
- Do not change rollout JSONL format.
- Do not change app-server protocol schema or generated TypeScript.
- Do not change core `send_event_raw()` persist-before-deliver order.
- Do not remove the existing `ProjectionGeneration` stale attach gate.

## File Structure

- Modify: `codex-rs/rollout/src/policy.rs`
  - Add a count helper that reuses existing canonical persistence filtering.
  - Add focused tests for count behavior.
- Modify: `codex-rs/rollout/src/lib.rs`
  - Re-export the count helper.
- Create: `codex-rs/app-server/src/thread_projection_cut.rs`
  - Define `ProjectionHistoryCursor` and `ProjectionSnapshotCut`.
  - Keep cut/cursor helpers out of hot orchestration files.
- Modify: `codex-rs/app-server/src/lib.rs`
  - Wire the new module.
- Modify: `codex-rs/app-server/src/thread_projection.rs`
  - Store `history_cursor` in projection thread entries.
  - Add PM APIs for baseline cursor, cursor advancement, and cut capture.
  - Add unit tests for head/cursor behavior.
- Modify: `codex-rs/app-server/src/request_processors/thread_lifecycle.rs`
  - Initialize listener cursor at startup.
  - Advance cursor before bespoke event handling so projected commits bind to the post-event cursor.
  - Capture snapshot cut in the listener command handler, not in request processor.
- Modify: `codex-rs/app-server/src/request_processors/thread_projection.rs`
  - Replace full-history snapshot read with snapshot-at-cut reconstruction.
  - Keep request-processor-side generation capture for stale attach protection.
- Modify: `codex-rs/app-server/src/thread_projection_runtime.rs`
  - Replace prebuilt snapshot future with listener-captured snapshot cut and snapshot reader.
  - Add the race regression proving pending persisted history stays out of attach snapshot.

## Task 1: Add A Rollout Persistence Count Helper

**Files:**
- Modify: `codex-rs/rollout/src/policy.rs`
- Modify: `codex-rs/rollout/src/lib.rs`

- [ ] **Step 1: Add failing tests for count helper**

Add tests in `codex-rs/rollout/src/policy.rs` near existing policy tests. If the file has no local test module, add one at the bottom.

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use codex_protocol::protocol::EventMsg;
    use codex_protocol::protocol::RolloutItem;
    use codex_protocol::protocol::TokenCountEvent;
    use codex_protocol::protocol::TokenUsage;
    use codex_protocol::protocol::TurnStartedEvent;

    #[test]
    fn persisted_rollout_item_count_matches_filtered_items() {
        let items = vec![
            RolloutItem::EventMsg(EventMsg::TurnStarted(TurnStartedEvent {
                turn_id: "turn-1".to_string(),
                started_at: None,
            })),
            RolloutItem::EventMsg(EventMsg::TokenCount(TokenCountEvent {
                info: TokenUsage::default(),
                rate_limits: None,
            })),
        ];

        assert_eq!(
            persisted_rollout_item_count(&items, EventPersistenceMode::Limited),
            persisted_rollout_items(&items, EventPersistenceMode::Limited).len()
        );
        assert_eq!(
            persisted_rollout_item_count(&items, EventPersistenceMode::Extended),
            persisted_rollout_items(&items, EventPersistenceMode::Extended).len()
        );
    }
}
```

Expected before implementation: compile fails because `persisted_rollout_item_count` does not exist.

- [ ] **Step 2: Run the red test**

Run from `codex-rs`:

```sh
cargo test -p codex-rollout persisted_rollout_item_count_matches_filtered_items
```

Expected: compile failure naming `persisted_rollout_item_count`.

- [ ] **Step 3: Implement count helper by reusing existing policy**

Add this function in `codex-rs/rollout/src/policy.rs` next to `persisted_rollout_items`:

```rust
/// Return how many canonical rollout items would be persisted for a live append.
pub fn persisted_rollout_item_count(
    items: &[RolloutItem],
    mode: EventPersistenceMode,
) -> usize {
    items
        .iter()
        .filter(|item| is_persisted_rollout_item(item, mode))
        .count()
}
```

Do not duplicate `should_persist_event_msg` or `should_persist_response_item` match arms in app-server.

- [ ] **Step 4: Re-export helper**

Add this line in `codex-rs/rollout/src/lib.rs` beside the existing policy exports:

```rust
pub use policy::persisted_rollout_item_count;
```

- [ ] **Step 5: Verify helper test passes**

Run from `codex-rs`:

```sh
cargo test -p codex-rollout persisted_rollout_item_count_matches_filtered_items
```

Expected: test passes.

## Task 2: Add Projection Cut Types And PM Cursor State

**Files:**
- Create: `codex-rs/app-server/src/thread_projection_cut.rs`
- Modify: `codex-rs/app-server/src/lib.rs`
- Modify: `codex-rs/app-server/src/thread_projection.rs`

- [ ] **Step 1: Add the cut module**

Create `codex-rs/app-server/src/thread_projection_cut.rs`:

```rust
use crate::thread_projection::ProjectionGeneration;

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub(crate) struct ProjectionHistoryCursor {
    item_count: usize,
}

impl ProjectionHistoryCursor {
    pub(crate) fn new(item_count: usize) -> Self {
        Self { item_count }
    }

    pub(crate) fn item_count(self) -> usize {
        self.item_count
    }

    pub(crate) fn advance_by(self, item_count: usize) -> Self {
        Self {
            item_count: self.item_count.saturating_add(item_count),
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct ProjectionSnapshotCut {
    pub(crate) generation: ProjectionGeneration,
    pub(crate) head_commit_id: Option<String>,
    pub(crate) history_cursor: ProjectionHistoryCursor,
}
```

- [ ] **Step 2: Wire the module**

Add this module declaration in `codex-rs/app-server/src/lib.rs` with the other internal modules:

```rust
mod thread_projection_cut;
```

- [ ] **Step 3: Add failing PM tests for cursor/cut behavior**

Add these tests to `codex-rs/app-server/src/thread_projection.rs` in the existing test module:

```rust
#[tokio::test]
async fn capture_snapshot_cut_returns_head_and_cursor_together() {
    let manager = ThreadProjectionManager::new();
    let thread_id = ThreadId::new();
    let connection_id = ConnectionId(1);
    let baseline = ProjectionHistoryCursor::new(2);

    manager.set_history_cursor(thread_id, baseline).await;
    let generation = manager.capture_current_generation(thread_id).await;
    let attached = manager
        .attach_if_generation_matches(thread_id, connection_id, generation)
        .await;
    let ProjectionAttachAttempt::Attached(attached) = attached else {
        panic!("attach should succeed");
    };
    assert_eq!(attached.head_commit_id, None);

    let next_cursor = baseline.advance_by(1);
    let deliveries = manager
        .project_notification_at_cursor(
            thread_id,
            &turn_started_notification(thread_id, "turn-1"),
            next_cursor,
        )
        .await;

    let cut = manager.capture_snapshot_cut(thread_id).await;
    assert_eq!(cut.head_commit_id, Some(deliveries[0].notification.commit_id.clone()));
    assert_eq!(cut.history_cursor, next_cursor);
}

#[tokio::test]
async fn non_projected_persisted_event_advances_cursor_without_head() {
    let manager = ThreadProjectionManager::new();
    let thread_id = ThreadId::new();
    let baseline = ProjectionHistoryCursor::new(2);
    let next_cursor = baseline.advance_by(1);

    manager.set_history_cursor(thread_id, baseline).await;
    manager.set_history_cursor(thread_id, next_cursor).await;

    let cut = manager.capture_snapshot_cut(thread_id).await;
    assert_eq!(cut.head_commit_id, None);
    assert_eq!(cut.history_cursor, next_cursor);
}
```

Add the imports needed by these tests:

```rust
use crate::thread_projection_cut::ProjectionHistoryCursor;
```

Expected before implementation: compile failure for missing cursor APIs.

- [ ] **Step 4: Run the red PM tests**

Run from `codex-rs`:

```sh
cargo test -p codex-app-server capture_snapshot_cut_returns_head_and_cursor_together
cargo test -p codex-app-server non_projected_persisted_event_advances_cursor_without_head
```

Expected: compile failure naming missing PM cursor APIs.

- [ ] **Step 5: Add cursor to `ThreadEntry`**

In `codex-rs/app-server/src/thread_projection.rs`, import the new cut types:

```rust
use crate::thread_projection_cut::ProjectionHistoryCursor;
use crate::thread_projection_cut::ProjectionSnapshotCut;
```

Extend `ThreadEntry`:

```rust
struct ThreadEntry {
    head_commit_id: Option<String>,
    history_cursor: ProjectionHistoryCursor,
    subscribers: HashMap<ConnectionId, ProjectionSubscriber>,
    has_subscribers_tx: watch::Sender<bool>,
}
```

Update `thread_entry_mut` default entry:

```rust
ThreadEntry {
    head_commit_id: None,
    history_cursor: ProjectionHistoryCursor::default(),
    subscribers: HashMap::new(),
    has_subscribers_tx,
}
```

- [ ] **Step 6: Add PM cursor APIs**

Add these methods to `impl ThreadProjectionManager`:

```rust
pub(crate) async fn set_history_cursor(
    &self,
    thread_id: ThreadId,
    history_cursor: ProjectionHistoryCursor,
) {
    let mut inner = self.inner.lock().await;
    inner.thread_entry_mut(thread_id).history_cursor = history_cursor;
}

pub(crate) async fn capture_snapshot_cut(&self, thread_id: ThreadId) -> ProjectionSnapshotCut {
    let mut inner = self.inner.lock().await;
    let generation = inner
        .current_generation(thread_id)
        .unwrap_or_else(ProjectionGeneration::initial);
    let entry = inner.thread_entry_mut(thread_id);
    ProjectionSnapshotCut {
        generation,
        head_commit_id: entry.head_commit_id.clone(),
        history_cursor: entry.history_cursor,
    }
}

pub(crate) async fn project_notification_at_cursor(
    &self,
    thread_id: ThreadId,
    notification: &ServerNotification,
    history_cursor: ProjectionHistoryCursor,
) -> Vec<ProjectionDelivery> {
    let mut inner = self.inner.lock().await;
    let entry = inner.thread_entry_mut(thread_id);
    entry.history_cursor = history_cursor;
    let Some(event) = projection_event_from_notification(notification) else {
        return Vec::new();
    };
    let commit_id = Uuid::now_v7().to_string();
    let parent_commit_id = entry.advance_head(commit_id.clone());
    entry
        .sorted_subscribers()
        .into_iter()
        .map(|(connection_id, subscription_id)| ProjectionDelivery {
            connection_id,
            notification: ThreadProjectionEventNotification {
                thread_id: thread_id.to_string(),
                subscription_id,
                commit_id: commit_id.clone(),
                parent_commit_id: parent_commit_id.clone(),
                event: event.clone(),
            },
        })
        .collect()
}
```

Keep existing `project_notification(...)` as a wrapper for tests and existing callers:

```rust
pub(crate) async fn project_notification(
    &self,
    thread_id: ThreadId,
    notification: &ServerNotification,
) -> Vec<ProjectionDelivery> {
    let cursor = self.capture_snapshot_cut(thread_id).await.history_cursor;
    self.project_notification_at_cursor(thread_id, notification, cursor)
        .await
}
```

- [ ] **Step 7: Verify PM tests pass**

Run from `codex-rs`:

```sh
cargo test -p codex-app-server capture_snapshot_cut_returns_head_and_cursor_together
cargo test -p codex-app-server non_projected_persisted_event_advances_cursor_without_head
```

Expected: tests pass.

## Task 3: Initialize And Advance Listener Cursor

**Files:**
- Modify: `codex-rs/app-server/src/request_processors/thread_lifecycle.rs`
- Modify: `codex-rs/app-server/src/outgoing_message.rs`

- [ ] **Step 1: Add listener cursor imports**

In `codex-rs/app-server/src/request_processors/thread_lifecycle.rs`, add imports through the existing `super::*` path if available, or direct imports:

```rust
use codex_protocol::protocol::RolloutItem;
use codex_rollout::EventPersistenceMode;
use codex_rollout::persisted_rollout_item_count;
use crate::thread_projection_cut::ProjectionHistoryCursor;
```

- [ ] **Step 2: Add helper for baseline cursor**

Add this helper in `thread_lifecycle.rs` near listener startup helpers:

```rust
async fn projection_history_cursor_for_listener_start(
    conversation: &Arc<CodexThread>,
) -> ProjectionHistoryCursor {
    if conversation.config_snapshot().await.ephemeral {
        return ProjectionHistoryCursor::default();
    }

    match conversation.load_history(/*include_archived*/ true).await {
        Ok(history) => ProjectionHistoryCursor::new(history.items.len()),
        Err(err) => {
            tracing::debug!(
                "starting projection history cursor at zero because history is not available: {err}"
            );
            ProjectionHistoryCursor::default()
        }
    }
}
```

This helper intentionally does not change snapshot/read error behavior. It only initializes a best-known listener baseline for projection cut state.

- [ ] **Step 3: Initialize PM cursor before spawning listener**

In `ensure_conversation_listener(...)`, after the listener is installed and before `tokio::spawn`, compute and store baseline:

```rust
let projection_history_cursor =
    projection_history_cursor_for_listener_start(&conversation).await;
outgoing
    .thread_projection_manager()
    .set_history_cursor(conversation_id, projection_history_cursor)
    .await;
```

Also move `projection_history_cursor` into the spawned task as a mutable local:

```rust
let mut projection_history_cursor = projection_history_cursor;
tokio::spawn(async move {
    // existing loop
});
```

- [ ] **Step 4: Advance cursor before bespoke event handling**

Inside the `event = conversation.next_event()` branch, after `thread_state.track_current_turn_event(...)` and before the raw-event early-continue branch, add:

```rust
let persisted_item_count = persisted_rollout_item_count(
    &[RolloutItem::EventMsg(event.msg.clone())],
    EventPersistenceMode::Limited,
);
projection_history_cursor = projection_history_cursor.advance_by(persisted_item_count);
outgoing_for_task
    .thread_projection_manager()
    .set_history_cursor(conversation_id, projection_history_cursor)
    .await;
```

Use `EventPersistenceMode::Limited` because app-server start/resume/fork paths currently pass `persist_extended_history: false` into core thread creation and resume. Do not add a new config surface for this change.

- [ ] **Step 5: Send projected notifications at the current cursor**

Modify `ThreadScopedOutgoingMessageSender` in `codex-rs/app-server/src/outgoing_message.rs` to carry an optional cursor:

```rust
pub(crate) struct ThreadScopedOutgoingMessageSender {
    outgoing: Arc<OutgoingMessageSender>,
    connection_ids: Vec<ConnectionId>,
    thread_id: ThreadId,
    projection_history_cursor: Option<ProjectionHistoryCursor>,
}
```

Add a constructor for listener event delivery:

```rust
pub(crate) fn with_projection_history_cursor(
    outgoing: Arc<OutgoingMessageSender>,
    connection_ids: Vec<ConnectionId>,
    thread_id: ThreadId,
    projection_history_cursor: ProjectionHistoryCursor,
) -> Self {
    Self {
        outgoing,
        connection_ids,
        thread_id,
        projection_history_cursor: Some(projection_history_cursor),
    }
}
```

Keep existing `new(...)` setting `projection_history_cursor: None`.

In `send_server_notification`, replace the PM call with:

```rust
let deliveries = if let Some(cursor) = self.projection_history_cursor {
    self.outgoing
        .thread_projection_manager()
        .project_notification_at_cursor(self.thread_id, &notification, cursor)
        .await
} else {
    self.outgoing
        .thread_projection_manager()
        .project_notification(self.thread_id, &notification)
        .await
};
for delivery in deliveries {
    self.outgoing
        .send_server_notification_to_connections(
            &[delivery.connection_id],
            ServerNotification::ThreadProjectionEvent(delivery.notification),
        )
        .await;
}
```

- [ ] **Step 6: Use cursor-aware sender in listener**

In `thread_lifecycle.rs`, replace the listener event branch construction:

```rust
let thread_outgoing = ThreadScopedOutgoingMessageSender::new(
    outgoing_for_task.clone(),
    subscribed_connection_ids,
    conversation_id,
);
```

with:

```rust
let thread_outgoing = ThreadScopedOutgoingMessageSender::with_projection_history_cursor(
    outgoing_for_task.clone(),
    subscribed_connection_ids,
    conversation_id,
    projection_history_cursor,
);
```

- [ ] **Step 7: Run a compile-focused check**

Run from `codex-rs`:

```sh
cargo check -p codex-app-server --all-targets
```

Expected: app-server compiles.

## Task 4: Reconstruct Attach Snapshot At Captured Cut

**Files:**
- Modify: `codex-rs/app-server/src/request_processors/thread_projection.rs`
- Modify: `codex-rs/app-server/src/thread_projection_runtime.rs`
- Modify: `codex-rs/app-server/src/request_processors/thread_lifecycle.rs`

- [ ] **Step 1: Add snapshot-at-cut helper**

In `codex-rs/app-server/src/request_processors/thread_projection.rs`, add a new helper next to `read_thread_projection_snapshot`:

```rust
pub(super) async fn read_thread_projection_snapshot_at_cut(
    &self,
    thread_id: ThreadId,
    cut: crate::thread_projection_cut::ProjectionSnapshotCut,
) -> Result<ThreadProjectionSnapshot, ThreadReadViewError> {
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
    let mut history_items = match self.load_thread_turns_list_history(thread_id).await {
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
    history_items.truncate(cut.history_cursor.item_count());
    let thread_status = resolve_thread_status(loaded_status.clone(), has_live_in_progress_turn);

    thread.turns = reconstruct_thread_turns_for_turns_list(
        &history_items,
        loaded_status,
        has_live_running_thread,
        active_turn,
    );
    thread.status = thread_status;
    Ok(ThreadProjectionSnapshot {
        thread,
        head_commit_id: cut.head_commit_id,
    })
}
```

Keep the existing `read_thread_projection_snapshot(...)` until all callers are migrated or tests are updated.

- [ ] **Step 2: Change runtime work to capture cut in listener**

In `codex-rs/app-server/src/thread_projection_runtime.rs`, change `ProjectionAttachResponseWork` from carrying a prebuilt snapshot future to carrying a `ThreadRequestProcessor` clone. Use this concrete shape:

```rust
use crate::request_processors::thread_processor::ThreadRequestProcessor;

pub(crate) struct ProjectionAttachResponseWork {
    pub(crate) request_id: ConnectionRequestId,
    pub(crate) connection_id: ConnectionId,
    pub(crate) projection_generation: ProjectionGeneration,
    pub(crate) snapshot_processor: ThreadRequestProcessor,
}
```

`ThreadRequestProcessor` is already `Clone`; using it keeps the snapshot read logic in the same owner that currently implements `read_thread_projection_snapshot(...)`.

- [ ] **Step 3: Capture cut before snapshot read**

In `handle_projection_attach_response(...)`, after the first closing-thread check and before reading snapshot, add:

```rust
let cut = outgoing
    .thread_projection_manager()
    .capture_snapshot_cut(conversation_id)
    .await;
if cut.generation != projection_generation {
    outgoing
        .send_error(
            request_id,
            invalid_request(format!(
                "thread {conversation_id} was unloaded while attaching projection; retry thread/projection/attach after the thread is loaded"
            )),
        )
        .await;
    return;
}
```

Then replace `snapshot.await` with:

```rust
let snapshot = match snapshot_processor
    .read_thread_projection_snapshot_at_cut(conversation_id, cut)
    .await
{
    Ok(snapshot) => snapshot,
    Err(error) => {
        outgoing.send_error(request_id, error).await;
        return;
    }
};
```

Keep the final `attach_if_generation_matches(...)` call after snapshot read. The early generation check avoids expensive snapshot work when teardown already happened; the final check remains the real commit gate.

- [ ] **Step 4: Send snapshot directly**

Replace the response construction in `handle_projection_attach_response(...)` with:

```rust
outgoing
    .send_response(
        request_id,
        ThreadProjectionAttachResponse {
            subscription_id: attach_result.subscription_id,
            snapshot,
        },
    )
    .await;
```

Do not overwrite `snapshot.head_commit_id` with `attach_result.head_commit_id`; the snapshot cut is the source of truth for the response.

- [ ] **Step 5: Update enqueue path**

In `thread_projection_attach(...)`, keep this generation capture before enqueue:

```rust
let projection_generation = self
    .outgoing
    .thread_projection_manager()
    .capture_current_generation(thread_id)
    .await;
```

Replace the old snapshot future creation with passing a cloneable snapshot processor into `enqueue_projection_attach_response(...)`:

```rust
let snapshot_processor = self.clone();
```

Update `ThreadListenerCommand::SendThreadProjectionAttachResponse` construction and match forwarding in `thread_lifecycle.rs` to carry the new work shape.

- [ ] **Step 6: Run compile check**

Run from `codex-rs`:

```sh
cargo check -p codex-app-server --all-targets
```

Expected: app-server compiles.

## Task 5: Add Race Regression For Pending Persisted History

**Files:**
- Modify: `codex-rs/app-server/src/thread_projection_runtime.rs`
- Modify: `codex-rs/app-server/src/request_processors/thread_projection.rs`

- [ ] **Step 1: Add a focused snapshot-at-cut unit test**

In `codex-rs/app-server/src/request_processors/thread_projection.rs`, add a test beside existing projection snapshot tests. Use the existing `ThreadRequestProcessor` test helpers in that module to create a materialized thread with two persisted items. The test should:

```rust
#[tokio::test]
async fn projection_snapshot_at_cut_excludes_history_after_cursor() -> anyhow::Result<()> {
    let fixture = projection_snapshot_fixture_with_history(vec![
        RolloutItem::EventMsg(EventMsg::TurnStarted(TurnStartedEvent {
            turn_id: "turn-visible".to_string(),
            started_at: Some(1),
        })),
        RolloutItem::EventMsg(EventMsg::TurnStarted(TurnStartedEvent {
            turn_id: "turn-pending".to_string(),
            started_at: Some(2),
        })),
    ])
    .await?;

    let cut = ProjectionSnapshotCut {
        generation: fixture
            .processor
            .outgoing
            .thread_projection_manager()
            .capture_current_generation(fixture.thread_id)
            .await,
        head_commit_id: None,
        history_cursor: ProjectionHistoryCursor::new(1),
    };
    let snapshot = fixture
        .processor
        .read_thread_projection_snapshot_at_cut(fixture.thread_id, cut)
        .await?;

    let turn_ids = snapshot
        .thread
        .turns
        .iter()
        .map(|turn| turn.id.as_str())
        .collect::<Vec<_>>();
    assert_eq!(turn_ids, vec!["turn-visible"]);
    assert_eq!(snapshot.head_commit_id, None);
    Ok(())
}
```

Add a small test-only helper named `projection_snapshot_fixture_with_history` in the same test module when wiring this test. The helper must use the module's existing processor construction pattern and append the supplied `RolloutItem` list to the in-memory thread store.

- [ ] **Step 2: Run the red snapshot test**

Run from `codex-rs`:

```sh
cargo test -p codex-app-server projection_snapshot_at_cut_excludes_history_after_cursor --no-fail-fast
```

Expected before final wiring: compile or assertion failure until snapshot-at-cut helper is wired.

- [ ] **Step 3: Add listener/runtime race regression**

In `codex-rs/app-server/src/thread_projection_runtime.rs`, add a test that mirrors the existing stale attach teardown test shape:

```rust
#[tokio::test]
async fn attach_snapshot_cut_excludes_persisted_event_not_processed_by_projection()
-> anyhow::Result<()> {
    let thread_id = ThreadId::new();
    let connection_id = ConnectionId(1);
    let pending_thread_unloads = Arc::new(Mutex::new(HashSet::new()));
    let thread_state_manager = ThreadStateManager::new();
    thread_state_manager
        .connection_initialized(connection_id, ConnectionCapabilities::default())
        .await;
    let (outgoing_tx, mut outgoing_rx) = tokio::sync::mpsc::channel(4);
    let outgoing = Arc::new(OutgoingMessageSender::new(
        outgoing_tx,
        codex_analytics::AnalyticsEventsClient::disabled(),
    ));

    let old_cursor = ProjectionHistoryCursor::new(1);
    outgoing
        .thread_projection_manager()
        .set_history_cursor(thread_id, old_cursor)
        .await;
    let projection_generation = outgoing
        .thread_projection_manager()
        .capture_current_generation(thread_id)
        .await;

    // Build a snapshot reader whose persisted history has two events while PM cursor remains at one.
    let snapshot_processor = snapshot_processor_with_projection_history(
        thread_id,
        vec![visible_turn_started(thread_id), pending_turn_started(thread_id)],
        outgoing.clone(),
        thread_state_manager.clone(),
    )
    .await?;

    handle_projection_attach_response(
        thread_id,
        &pending_thread_unloads,
        &outgoing,
        &thread_state_manager,
        ProjectionAttachResponseWork {
            request_id: ConnectionRequestId {
                connection_id,
                request_id: RequestId::Integer(1),
            },
            connection_id,
            projection_generation,
            snapshot_processor,
        },
    )
    .await;

    let message = outgoing_rx.recv().await.expect("attach response");
    let response = match message {
        OutgoingEnvelope::ToConnection {
            message: OutgoingMessage::Response(response),
            ..
        } => response,
        other => panic!("expected attach response, got {other:?}"),
    };
    let payload: ThreadProjectionAttachResponse =
        serde_json::from_value(response.result.expect("attach result"))?;
    let turn_ids = payload
        .snapshot
        .thread
        .turns
        .iter()
        .map(|turn| turn.id.as_str())
        .collect::<Vec<_>>();
    assert_eq!(turn_ids, vec!["turn-visible"]);
    assert_eq!(payload.snapshot.head_commit_id, None);
    Ok(())
}
```

Use local test helpers for `visible_turn_started`, `pending_turn_started`, and `snapshot_processor_with_projection_history`. Keep them in the test module; do not add production-only fixture APIs.

- [ ] **Step 4: Run focused regression tests**

Run from `codex-rs`:

```sh
cargo test -p codex-app-server projection_snapshot_at_cut_excludes_history_after_cursor --no-fail-fast
cargo test -p codex-app-server attach_snapshot_cut_excludes_persisted_event_not_processed_by_projection --no-fail-fast
```

Expected: both pass.

## Task 6: Final Verification And Cleanup

**Files:**
- Verify all files touched by Tasks 1-5.

- [ ] **Step 1: Run app-server projection tests**

Run from `codex-rs`:

```sh
RUST_MIN_STACK=8388608 cargo nextest run -p codex-app-server --test-threads 4 thread_projection
```

Expected: all matching app-server projection tests pass.

- [ ] **Step 2: Run rollout helper test**

Run from `codex-rs`:

```sh
cargo test -p codex-rollout persisted_rollout_item_count_matches_filtered_items
```

Expected: test passes.

- [ ] **Step 3: Format Rust code**

Run from `codex-rs`:

```sh
just fmt
```

Expected: command exits successfully. Do not re-run tests solely because `just fmt` touched formatting.

- [ ] **Step 4: Run scoped clippy fix**

Run from `codex-rs`:

```sh
just fix -p codex-app-server
```

Expected: command exits successfully. Do not re-run tests after this command unless it reports a source-changing fix that affects behavior.

- [ ] **Step 5: Check diff cleanliness**

Run from repo root:

```sh
git diff --check
```

Expected: no whitespace errors.

- [ ] **Step 6: Review scope**

Run from repo root:

```sh
git diff --stat
```

Expected: changes are limited to rollout helper, app-server projection/listener/snapshot code, and focused tests. No protocol schema, generated TypeScript, or broad store trait changes should appear.
