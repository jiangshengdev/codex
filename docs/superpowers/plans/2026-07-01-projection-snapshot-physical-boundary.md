# Projection Snapshot Head Cut Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `thread/projection/attach` reconstruct snapshots from the same physical persisted history boundary as the returned projection `headCommitId`.

**Architecture:** Replace the old listener-estimated `ProjectionHistoryCursor(usize)` with a storage-neutral physical persisted item boundary. `ThreadStore::append_items` returns an `end_boundary`, core carries that boundary on delivered `Event`s, and app-server listener binds projection commits to the event-provided boundary before attach snapshot reconstruction truncates physical history through a semantic boundary API.

**Tech Stack:** Rust, Tokio, `codex-thread-store`, `codex-core`, `codex-protocol`, `codex-app-server`, `pretty_assertions`, `just test`, `just fmt`, `just fix`.

---

## Source Of Truth

- Design: `docs/superpowers/specs/2026-05-24-projection-snapshot-head-cut-design.md`
- Issue: `docs/superpowers/issues/2026-06-30-02-codex-gui-mobile-missing-messages.md`
- Research: `docs/superpowers/research/2026-06-30-codex-gui-final-message-missing/current-findings.md`

## File Structure

- Modify: `codex-rs/thread-store/src/types.rs`
  - Add `StoredHistoryBoundary` and `AppendThreadItemsResult`.
- Modify: `codex-rs/thread-store/src/lib.rs`
  - Re-export the new types.
- Modify: `codex-rs/thread-store/src/store.rs`
  - Change `ThreadStore::append_items` to return `AppendThreadItemsResult`.
- Modify: `codex-rs/thread-store/src/in_memory.rs`
  - Return the append `end_boundary` from the in-memory history length.
  - Add focused tests for persisted, filtered, and metadata appends.
- Modify: `codex-rs/thread-store/src/local/live_writer.rs`
  - Return the append `end_boundary` after canonical items are flushed.
- Modify: `codex-rs/thread-store/src/local/mod.rs`
  - Update the trait implementation and local store tests.
- Modify: `codex-rs/thread-store/src/live_thread.rs`
  - Return `AppendThreadItemsResult` to core.
- Modify: `codex-rs/core/src/session/mod.rs`
  - Return append results from persist helpers.
  - Attach persistence boundary to delivered events.
- Modify: `codex-rs/protocol/src/protocol.rs`
  - Add `EventPersistenceBoundary` and `Event.persistence_boundary`.
- Modify: all existing `Event { id, msg }` construction sites under `codex-rs/core/src/**`
  - Mark direct non-persist event sends as `NoPersist`.
- Modify: `codex-rs/app-server/src/thread_projection_cut.rs`
  - Replace `ProjectionHistoryCursor` with `ProjectionHistoryBoundary`.
- Modify: `codex-rs/app-server/src/thread_projection.rs`
  - Store `history_boundary` in projection entries.
  - Bind projection commits to event-provided boundaries.
- Modify: `codex-rs/app-server/src/projection_fanout.rs`
  - Rename projection cursor plumbing to boundary plumbing.
- Modify: `codex-rs/app-server/src/outgoing_message.rs`
  - Carry optional projection history boundary through outgoing projection fanout.
- Modify: `codex-rs/app-server/src/request_processors/thread_lifecycle.rs`
  - Stop estimating persisted item counts from `EventMsg`.
  - Use event `persistence_boundary` to update projection cut.
- Modify: `codex-rs/app-server/src/request_processors/thread_projection.rs`
  - Truncate physical history only through `ProjectionHistoryBoundary`.
  - Add the mixed physical history regression.
- Modify: `codex-rs/app-server/src/thread_projection_runtime.rs`
  - Update attach race tests for the renamed boundary type and event boundary semantics.

## Task 1: Add Store-Level Physical Boundary Types

**Files:**
- Modify: `codex-rs/thread-store/src/types.rs`
- Modify: `codex-rs/thread-store/src/lib.rs`
- Modify: `codex-rs/thread-store/src/store.rs`

- [ ] **Step 1: Add the boundary and append result types**

In `codex-rs/thread-store/src/types.rs`, add these types after `AppendThreadItemsParams`:

```rust
/// Storage-neutral upper bound in a thread's persisted physical history.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub struct StoredHistoryBoundary {
    physical_item_count: usize,
}

impl StoredHistoryBoundary {
    /// Create a boundary from the persisted physical item count.
    pub fn new(physical_item_count: usize) -> Self {
        Self {
            physical_item_count,
        }
    }

    /// Return the persisted physical item count for diagnostics and storage-local code.
    pub fn physical_item_count_for_logs(self) -> usize {
        self.physical_item_count
    }
}

/// Result of appending rollout items to a live thread.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct AppendThreadItemsResult {
    /// Persisted physical history upper bound after the append completes.
    pub end_boundary: StoredHistoryBoundary,
}
```

- [ ] **Step 2: Re-export the new types**

In `codex-rs/thread-store/src/lib.rs`, add exports beside `AppendThreadItemsParams`:

```rust
pub use types::AppendThreadItemsResult;
pub use types::StoredHistoryBoundary;
```

- [ ] **Step 3: Change the trait return type**

In `codex-rs/thread-store/src/store.rs`, import `AppendThreadItemsResult` and change the trait method:

```rust
use crate::AppendThreadItemsResult;
```

```rust
fn append_items(
    &self,
    params: AppendThreadItemsParams,
) -> ThreadStoreFuture<'_, AppendThreadItemsResult>;
```

Update the method doc comment to say the result boundary uses the same physical item count as `StoredThreadHistory.items`.

- [ ] **Step 4: Run the compile check for the expected failures**

Run from repository root:

```sh
just test -p codex-thread-store
```

Expected: compile failures at `append_items` implementors because they still return `()`.

## Task 2: Implement Append Boundaries In Thread Stores

**Files:**
- Modify: `codex-rs/thread-store/src/in_memory.rs`
- Modify: `codex-rs/thread-store/src/local/live_writer.rs`
- Modify: `codex-rs/thread-store/src/local/mod.rs`
- Modify: `codex-rs/thread-store/src/live_thread.rs`

- [ ] **Step 1: Update the in-memory append implementation**

In `codex-rs/thread-store/src/in_memory.rs`, import:

```rust
use crate::AppendThreadItemsResult;
use crate::StoredHistoryBoundary;
```

Change `InMemoryThreadStore::append_items` to return `ThreadStoreResult<AppendThreadItemsResult>` and compute the boundary from the stored vector length:

```rust
async fn append_items(
    &self,
    params: AppendThreadItemsParams,
) -> ThreadStoreResult<AppendThreadItemsResult> {
    let canonical_items = persisted_rollout_items(params.items.as_slice());
    let mut state = self.state.lock().await;
    state.calls.append_items += 1;
    let history = state.histories.entry(params.thread_id).or_default();
    if !canonical_items.is_empty() {
        history.extend(canonical_items);
    }
    Ok(AppendThreadItemsResult {
        end_boundary: StoredHistoryBoundary::new(history.len()),
    })
}
```

Update the trait implementation wrapper to return `ThreadStoreFuture<'_, AppendThreadItemsResult>`.

- [ ] **Step 2: Update the local live writer**

In `codex-rs/thread-store/src/local/live_writer.rs`, import:

```rust
use crate::AppendThreadItemsResult;
use crate::LoadThreadHistoryParams;
use crate::StoredHistoryBoundary;
```

Change `append_items` to return `ThreadStoreResult<AppendThreadItemsResult>`. After flushing, load history and return its physical item count:

```rust
pub(super) async fn append_items(
    store: &LocalThreadStore,
    params: AppendThreadItemsParams,
) -> ThreadStoreResult<AppendThreadItemsResult> {
    let thread_id = params.thread_id;
    let canonical_items = persisted_rollout_items(params.items.as_slice());
    if !canonical_items.is_empty() {
        let recorder = store.live_recorder(thread_id).await?;
        recorder
            .record_canonical_items(canonical_items.as_slice())
            .await
            .map_err(thread_store_io_error)?;
        recorder.flush().await.map_err(thread_store_io_error)?;
    }

    let history = store
        .load_history(LoadThreadHistoryParams {
            thread_id,
            include_archived: true,
        })
        .await?;
    Ok(AppendThreadItemsResult {
        end_boundary: StoredHistoryBoundary::new(history.items.len()),
    })
}
```

Do not call the `ThreadStore` trait method from this helper. Use the inherent
`LocalThreadStore::load_history` method so this path cannot recurse through
`ThreadStore::append_items`.

- [ ] **Step 3: Update local store and live thread signatures**

In `codex-rs/thread-store/src/local/mod.rs`, update the trait implementation:

```rust
fn append_items(
    &self,
    params: AppendThreadItemsParams,
) -> ThreadStoreFuture<'_, AppendThreadItemsResult> {
    Box::pin(async move { live_writer::append_items(self, params).await })
}
```

In `codex-rs/thread-store/src/live_thread.rs`, update `LiveThread::append_items`:

```rust
pub async fn append_items(
    &self,
    items: &[RolloutItem],
) -> ThreadStoreResult<AppendThreadItemsResult> {
    self.thread_store
        .append_items(AppendThreadItemsParams {
            thread_id: self.thread_id,
            items: items.to_vec(),
        })
        .await
}
```

- [ ] **Step 4: Add store boundary tests**

Add focused tests in `codex-rs/thread-store/src/in_memory.rs` near existing in-memory tests:

```rust
#[tokio::test]
async fn append_items_returns_physical_end_boundary() {
    let store = InMemoryThreadStore::default();
    let thread_id = ThreadId::new();
    store
        .create_thread(CreateThreadParams {
            thread_id,
            metadata: ThreadPersistenceMetadata::default(),
            rollout_path: None,
        })
        .await
        .unwrap();

    let result = store
        .append_items(AppendThreadItemsParams {
            thread_id,
            items: vec![RolloutItem::EventMsg(EventMsg::UserMessage(UserMessageEvent {
                message: "hello".to_string(),
                images: None,
                kind: None,
            }))],
        })
        .await
        .unwrap();

    let history = store
        .load_history(LoadThreadHistoryParams {
            thread_id,
            include_archived: true,
        })
        .await
        .unwrap();
    assert_eq!(
        result.end_boundary.physical_item_count_for_logs(),
        history.items.len()
    );
}
```

Keep the assertion on `end_boundary` versus `history.items.len()` as the required behavior for this test.

- [ ] **Step 5: Verify thread-store**

Run from repository root:

```sh
just test -p codex-thread-store
```

Expected: all `codex-thread-store` tests pass.

## Task 3: Add Persistence Boundary To Delivered Events

**Files:**
- Modify: `codex-rs/protocol/src/protocol.rs`
- Modify: all `Event { id, msg }` construction sites under `codex-rs/core/src/**`

- [ ] **Step 1: Add event boundary types**

In `codex-rs/protocol/src/protocol.rs`, import the thread-store boundary type if protocol can depend on it. If that would create a cycle, define a protocol-local mirror with the same `physical_item_count` semantics and convert at core/app-server boundaries.

Preferred shape:

```rust
#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
pub enum EventPersistenceBoundary {
    Persisted(StoredHistoryBoundary),
    NoPersist,
}
```

Add the field to `Event`:

```rust
pub struct Event {
    /// Submission `id` that this event is correlated with.
    pub id: String,
    /// Payload
    pub msg: EventMsg,
    /// Persisted history boundary associated with this delivered event.
    pub persistence_boundary: EventPersistenceBoundary,
}
```

- [ ] **Step 2: Add constructors**

Add these constructors near `Event`:

```rust
impl Event {
    pub fn persisted(
        id: String,
        msg: EventMsg,
        boundary: StoredHistoryBoundary,
    ) -> Self {
        Self {
            id,
            msg,
            persistence_boundary: EventPersistenceBoundary::Persisted(boundary),
        }
    }

    pub fn no_persist(id: String, msg: EventMsg) -> Self {
        Self {
            id,
            msg,
            persistence_boundary: EventPersistenceBoundary::NoPersist,
        }
    }
}
```

If a protocol-local boundary mirror is required, make `Event::persisted` accept that mirror type and convert from `StoredHistoryBoundary` in core.

- [ ] **Step 3: Mark existing direct event sends as no-persist**

Run from repository root:

```sh
rg -n -e 'Event \\{' codex-rs/core/src
```

For each direct event literal that does not immediately follow a successful rollout append result, change:

```rust
Event { id, msg }
```

to:

```rust
Event::no_persist(id, msg)
```

For multi-line literals, preserve the existing `id` and `msg` expressions:

```rust
Event::no_persist(
    sub_id.clone(),
    EventMsg::Error(ErrorEvent {
        message,
    }),
)
```

- [ ] **Step 4: Run the expected compile check**

Run from repository root:

```sh
just test -p codex-core
```

Expected before Task 4: compile failures in core persist helpers because persisted events have not yet been converted to `Event::persisted`.

## Task 4: Return Append Results From Core Persist Paths

**Files:**
- Modify: `codex-rs/core/src/session/mod.rs`
- Modify: core call sites that use `persist_rollout_items`

- [ ] **Step 1: Change `persist_rollout_items` to return the append result**

In `codex-rs/core/src/session/mod.rs`, update:

```rust
pub(crate) async fn persist_rollout_items(
    &self,
    items: &[RolloutItem],
) -> Option<AppendThreadItemsResult> {
    let Some(live_thread) = self.live_thread() else {
        return None;
    };
    match live_thread.append_items(items).await {
        Ok(result) => Some(result),
        Err(e) => {
            error!("failed to record rollout items: {e:#}");
            None
        }
    }
}
```

Use `Option<AppendThreadItemsResult>` so ephemeral or unavailable live-thread paths can produce `NoPersist` events without panicking.

- [ ] **Step 2: Update `send_event_raw`**

In `send_event_raw`, persist first, then attach the boundary to the delivered event:

```rust
pub(crate) async fn send_event_raw(&self, event: Event) {
    let Event {
        id,
        msg,
        persistence_boundary: _,
    } = event;
    let boundary = self
        .persist_rollout_items(&[RolloutItem::EventMsg(msg.clone())])
        .await
        .map(|result| result.end_boundary);
    let event = match boundary {
        Some(boundary) => Event::persisted(id, msg, boundary),
        None => Event::no_persist(id, msg),
    };
    self.tx_event.send(event).await.ok();
}
```

Keep the existing send target and error handling from the current function; only replace the event construction and persistence boundary attachment.

- [ ] **Step 3: Update `record_conversation_items` and raw response delivery**

Where `record_conversation_items` persists `ResponseItem`s before `send_raw_response_items`, return the append result so the subsequent raw response event can use the same physical boundary.

For each response item delivered as `EventMsg::RawResponseItem`, construct:

```rust
let event = match append_result {
    Some(result) => Event::persisted(
        sub_id.clone(),
        EventMsg::RawResponseItem(raw_response_item_event),
        result.end_boundary,
    ),
    None => Event::no_persist(
        sub_id.clone(),
        EventMsg::RawResponseItem(raw_response_item_event),
    ),
};
self.send_event_raw(event).await;
```

If `send_event_raw` would re-persist `RawResponseItem`, add a new internal helper named `deliver_event_raw` that sends an already-bound `Event` without persisting it again. Use that helper only after the response items have already been persisted by `record_conversation_items`.

- [ ] **Step 4: Update callers that ignore persist results**

For calls like:

```rust
self.persist_rollout_items(&items).await;
```

where no event is delivered from that append, keep the append for durability and explicitly ignore the result:

```rust
let _ = self.persist_rollout_items(&items).await;
```

This documents the chosen design: non-event persisted items do not produce projection-boundary-only updates.

- [ ] **Step 5: Verify core compiles**

Run from repository root:

```sh
just test -p codex-core
```

Expected: `codex-core` tests compile and pass, or remaining failures point to missed `Event` construction sites.

## Task 5: Replace Projection Cursor With Projection History Boundary

**Files:**
- Modify: `codex-rs/app-server/src/thread_projection_cut.rs`
- Modify: `codex-rs/app-server/src/thread_projection.rs`
- Modify: `codex-rs/app-server/src/projection_fanout.rs`
- Modify: `codex-rs/app-server/src/outgoing_message.rs`

- [ ] **Step 1: Replace the cut type**

In `codex-rs/app-server/src/thread_projection_cut.rs`, replace `ProjectionHistoryCursor` with:

```rust
use codex_protocol::protocol::RolloutItem;
use codex_thread_store::StoredHistoryBoundary;

use crate::thread_projection::ProjectionGeneration;

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub(crate) struct ProjectionHistoryBoundary {
    boundary: StoredHistoryBoundary,
}

impl ProjectionHistoryBoundary {
    pub(crate) fn new(boundary: StoredHistoryBoundary) -> Self {
        Self { boundary }
    }

    pub(crate) fn truncate_history(self, history: &mut Vec<RolloutItem>) {
        history.truncate(self.boundary.physical_item_count_for_logs());
    }

    pub(crate) fn physical_item_count_for_logs(self) -> usize {
        self.boundary.physical_item_count_for_logs()
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct ProjectionSnapshotCut {
    pub(crate) generation: ProjectionGeneration,
    pub(crate) head_commit_id: Option<String>,
    pub(crate) history_boundary: ProjectionHistoryBoundary,
}
```

- [ ] **Step 2: Rename manager state**

In `codex-rs/app-server/src/thread_projection.rs`, rename:

```rust
history_cursor
```

to:

```rust
history_boundary
```

Rename manager methods:

```rust
set_history_cursor -> set_history_boundary
project_notification_at_cursor -> project_notification_at_boundary
```

The setter should accept `ProjectionHistoryBoundary`, and `ProjectionSnapshotCut` should capture `history_boundary`.

- [ ] **Step 3: Update outgoing fanout plumbing**

In `codex-rs/app-server/src/outgoing_message.rs` and `codex-rs/app-server/src/projection_fanout.rs`, rename optional fields and parameters from:

```rust
projection_history_cursor: Option<ProjectionHistoryCursor>
```

to:

```rust
projection_history_boundary: Option<ProjectionHistoryBoundary>
```

When a projection notification is faned out with a boundary, call:

```rust
project_notification_at_boundary(thread_id, notification, boundary)
```

If there is no boundary, keep the existing non-projection behavior and do not mutate projection history boundary.

- [ ] **Step 4: Verify app-server compile errors are now listener-only**

Run from repository root:

```sh
just test -p codex-app-server thread_projection
```

Expected before Task 6: compile failures remain in `thread_lifecycle.rs` where old cursor estimation is still referenced.

## Task 6: Use Event Boundaries In The Projection Listener

**Files:**
- Modify: `codex-rs/app-server/src/request_processors/thread_lifecycle.rs`
- Modify: `codex-rs/app-server/src/thread_projection_runtime.rs`

- [ ] **Step 1: Remove event persisted count estimation**

In `codex-rs/app-server/src/request_processors/thread_lifecycle.rs`, remove `projection_persisted_rollout_item_count_for_event` and the local cursor `advance_by` flow.

Replace the event handling setup with:

```rust
let history_boundary = match event.persistence_boundary {
    EventPersistenceBoundary::Persisted(boundary) => {
        let boundary = ProjectionHistoryBoundary::new(boundary);
        outgoing_for_task
            .thread_projection_manager()
            .set_history_boundary(conversation_id, boundary)
            .await;
        boundary
    }
    EventPersistenceBoundary::NoPersist => outgoing_for_task
        .thread_projection_manager()
        .current_history_boundary(conversation_id)
        .await,
};
```

If `current_history_boundary` does not exist, add it to `ThreadProjectionManager` as a read-only accessor returning the entry's current boundary.

- [ ] **Step 2: Build outgoing sender with the event boundary**

Replace:

```rust
ThreadScopedOutgoingMessageSender::with_projection_history_cursor(...)
```

with:

```rust
ThreadScopedOutgoingMessageSender::with_projection_history_boundary(
    outgoing_for_task.clone(),
    subscribed_connection_ids,
    conversation_id,
    history_boundary,
)
```

The projected notification commit should bind to this same `history_boundary`.

- [ ] **Step 3: Keep listener startup baseline physical**

When a listener starts, initialize the projection history boundary from the full persisted history length:

```rust
let boundary = ProjectionHistoryBoundary::new(StoredHistoryBoundary::new(history.items.len()));
```

This is now correct because the boundary is physical persisted item count, not cursor-domain event count.

- [ ] **Step 4: Update runtime tests**

In `codex-rs/app-server/src/thread_projection_runtime.rs`, update helpers that manually set cursor counts to set `ProjectionHistoryBoundary::new(StoredHistoryBoundary::new(count))`.

Keep the test named like `attach_snapshot_cut_excludes_persisted_event_not_processed_by_projection` and update it so the pending future event remains after the captured physical boundary.

- [ ] **Step 5: Verify focused app-server tests**

Run from repository root:

```sh
just test -p codex-app-server thread_projection
```

Expected: compile failures are limited to `read_thread_projection_snapshot_at_cut` and tests that still reference `history_cursor` or `ProjectionHistoryCursor`.

## Task 7: Make Snapshot Reconstruction Use Boundary API

**Files:**
- Modify: `codex-rs/app-server/src/request_processors/thread_projection.rs`

- [ ] **Step 1: Replace direct truncate**

In `read_thread_projection_snapshot_at_cut`, replace direct count access:

```rust
history_items.truncate(cut.history_cursor.item_count());
```

with:

```rust
cut.history_boundary.truncate_history(&mut history_items);
```

Update the returned snapshot to use `cut.head_commit_id` unchanged.

- [ ] **Step 2: Remove temporary truncation instrumentation helpers**

Remove helpers that only existed for temporary diagnostics:

```rust
projection_history_item_is_outside_cursor_domain
projection_history_item_kinds
projection_history_item_kind
```

Keep only durable logs that describe boundary values through `physical_item_count_for_logs()`.

- [ ] **Step 3: Add the mixed physical history regression**

In the existing tests module in `codex-rs/app-server/src/request_processors/thread_projection.rs`, add a test named:

```rust
projection_snapshot_at_physical_boundary_keeps_visible_final_and_excludes_pending_turn
```

The test should build history in this order:

```rust
let history = vec![
    session_meta_item(thread_id),
    user_message_item("turn-visible", "visible prompt"),
    agent_message_item("turn-visible", MessagePhase::Commentary, "working"),
    turn_context_item(thread_id),
    agent_message_item("turn-visible", MessagePhase::FinalAnswer, "visible final"),
    assistant_response_item("msg-visible-final", "visible final"),
    token_count_item("turn-visible"),
    turn_complete_item("turn-visible"),
    user_message_item("turn-pending", "pending prompt"),
];
```

Add private helpers inside the same test module for every item in the mixed history so the regression is self-contained. Define these helpers with the existing protocol constructors used by nearby tests:

```rust
fn session_meta_item(thread_id: ThreadId) -> RolloutItem {
    RolloutItem::SessionMeta(codex_protocol::protocol::SessionMetaLine {
        meta: codex_core::SessionMeta {
            id: thread_id,
            ..Default::default()
        },
    })
}

fn turn_context_item(thread_id: ThreadId) -> RolloutItem {
    RolloutItem::TurnContext(codex_protocol::protocol::TurnContextItem {
        thread_id,
        ..Default::default()
    })
}

fn assistant_response_item(id: &str, text: &str) -> RolloutItem {
    RolloutItem::ResponseItem(codex_protocol::models::ResponseItem::Message {
        id: Some(id.to_string()),
        role: "assistant".to_string(),
        content: vec![codex_protocol::models::ContentItem::OutputText {
            text: text.to_string(),
        }],
        phase: Some(MessagePhase::FinalAnswer),
    })
}
```

Set the cut boundary to the physical index immediately after `turn_complete_item("turn-visible")`:

```rust
let cut = ProjectionSnapshotCut {
    generation: fixture.projection_generation,
    head_commit_id: Some("commit-visible".to_string()),
    history_boundary: ProjectionHistoryBoundary::new(StoredHistoryBoundary::new(8)),
};
```

Assert:

```rust
assert_eq!(snapshot.thread.turns.len(), 1);
let turn = &snapshot.thread.turns[0];
assert_eq!(turn.id, "turn-visible");
assert_eq!(turn.status, TurnStatus::Completed);
assert!(
    turn.items.iter().any(|item| matches!(
        item,
        ThreadItem::AgentMessage(message)
            if message.text == "visible final"
                && message.phase == Some(MessagePhase::FinalAnswer)
    ))
);
```

The pending turn must not appear in `snapshot.thread.turns`.

- [ ] **Step 4: Run the regression**

Run from repository root:

```sh
just test -p codex-app-server projection_snapshot_at_physical_boundary_keeps_visible_final_and_excludes_pending_turn
```

Expected: the new regression passes.

## Task 8: Run Integration Verification And Clean Up

**Files:**
- Modify: only files already listed in Tasks 1-7.

- [ ] **Step 1: Run focused crate tests**

Run from repository root:

```sh
just test -p codex-thread-store
just test -p codex-core
just test -p codex-app-server thread_projection
```

Expected: all three commands pass.

- [ ] **Step 2: Run formatting**

Run from repository root:

```sh
just fmt
```

Expected: command exits successfully. Do not re-run tests solely because `just fmt` changed formatting.

- [ ] **Step 3: Run scoped clippy fix**

Run from repository root:

```sh
just fix -p codex-app-server
```

Expected: command exits successfully. If Tasks 1-4 changed `codex-thread-store`, `codex-core`, or `codex-protocol` enough to produce clippy warnings there, run the scoped equivalent for those crates:

```sh
just fix -p codex-thread-store
just fix -p codex-core
just fix -p codex-protocol
```

- [ ] **Step 4: Check diff hygiene**

Run from repository root:

```sh
git diff --check
git status --short
```

Expected: `git diff --check` has no output. `git status --short` shows only files intentionally changed for this plan and no unrelated user edits.

- [ ] **Step 5: Commit only after review approval**

After the user approves the implementation diff, commit the changed files:

```sh
git add codex-rs/thread-store/src/types.rs \
  codex-rs/thread-store/src/lib.rs \
  codex-rs/thread-store/src/store.rs \
  codex-rs/thread-store/src/in_memory.rs \
  codex-rs/thread-store/src/local/live_writer.rs \
  codex-rs/thread-store/src/local/mod.rs \
  codex-rs/thread-store/src/live_thread.rs \
  codex-rs/protocol/src/protocol.rs \
  codex-rs/core/src/session/mod.rs \
  codex-rs/app-server/src/thread_projection_cut.rs \
  codex-rs/app-server/src/thread_projection.rs \
  codex-rs/app-server/src/projection_fanout.rs \
  codex-rs/app-server/src/outgoing_message.rs \
  codex-rs/app-server/src/request_processors/thread_lifecycle.rs \
  codex-rs/app-server/src/request_processors/thread_projection.rs \
  codex-rs/app-server/src/thread_projection_runtime.rs
git commit -m "fix(app-server): bind projection snapshots to persisted history boundary"
```

Do not push.
