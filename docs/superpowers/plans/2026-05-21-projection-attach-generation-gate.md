# Projection Attach Generation Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent stale `thread/projection/attach` work that started before thread teardown from recreating projection subscriptions after `ThreadProjectionManager::remove_thread`.

**Architecture:** Add a server-internal projection lifecycle generation owned by `ThreadProjectionManager`. Capture the generation when attach enters the listener-ordered flow, bump it on `remove_thread`, and perform final subscriber registration through a PM-locked conditional attach API.

**Tech Stack:** Rust, Tokio tests, `codex-app-server`, `pretty_assertions`, existing projection runtime test helpers.

---

## Source Of Truth

- Design: `docs/superpowers/specs/2026-05-21-projection-attach-generation-gate-design.md`
- Issue context: `docs/superpowers/issues/2026-05-19-projection-atomicity-review.md`

## Scope

This plan fixes Finding 1 only: stale projection attach must not recreate projection state after teardown.

Do not solve these in this change:

- Do not remove or redesign `ThreadStateManager::try_thread_state_for_live_connection`.
- Do not add projection subscriptions to ordinary `ThreadStateManager` subscription indexes.
- Do not change `thread/unsubscribe` or `thread/projection/detach` wire behavior.
- Do not change app-server protocol schemas or generated TypeScript fixtures.
- Do not solve projection event delivery/head cleanup after teardown.

## File Structure

- Modify: `codex-rs/app-server/src/thread_projection.rs`
  - Add PM-owned `ProjectionGeneration`.
  - Add conditional attach result/API.
  - Bump generation from `remove_thread`.
  - Add PM unit tests for stale generation behavior.
- Modify: `codex-rs/app-server/src/thread_state.rs`
  - Add `projection_generation` to `ThreadListenerCommand::SendThreadProjectionAttachResponse`.
- Modify: `codex-rs/app-server/src/request_processors/thread_projection.rs`
  - Capture current PM generation when enqueueing projection attach response.
  - Pass expected generation into the listener command.
- Modify: `codex-rs/app-server/src/request_processors/thread_lifecycle.rs`
  - Forward expected generation from listener command into projection runtime.
- Modify: `codex-rs/app-server/src/thread_projection_runtime.rs`
  - Use conditional attach.
  - Return `invalid_request` for stale generation.
  - Add runtime regression test for blocked snapshot + teardown interleaving.

## Task 1: Add ThreadProjectionManager Generation API And Unit Tests

**Files:**
- Modify: `codex-rs/app-server/src/thread_projection.rs`

- [ ] **Step 1: Add the failing PM unit tests**

Add tests inside the existing `#[cfg(test)] mod tests` in `codex-rs/app-server/src/thread_projection.rs`.

Use these test bodies:

```rust
#[tokio::test]
async fn remove_thread_without_entry_invalidates_captured_generation() {
    let manager = ThreadProjectionManager::new();
    let thread_id = ThreadId::new();
    let connection_id = ConnectionId(1);

    let generation = manager.current_generation(thread_id).await;
    manager.remove_thread(thread_id).await;

    assert_eq!(
        ProjectionAttachAttempt::StaleThreadGeneration,
        manager
            .attach_if_generation_matches(thread_id, connection_id, generation)
            .await
    );
    assert!(!manager.has_thread_entry(thread_id).await);
    assert_eq!(
        manager.remove_connection(connection_id).await,
        Vec::<ThreadId>::new()
    );
}

#[tokio::test]
async fn conditional_attach_with_current_generation_preserves_attach_behavior() {
    let manager = ThreadProjectionManager::new();
    let thread_id = ThreadId::new();
    let connection_id = ConnectionId(1);

    let generation = manager.current_generation(thread_id).await;
    let first = manager
        .attach_if_generation_matches(thread_id, connection_id, generation)
        .await;
    let ProjectionAttachAttempt::Attached(first) = first else {
        panic!("current generation should attach");
    };

    let deliveries = manager
        .project_notification(thread_id, &turn_started_notification(thread_id, "turn-1"))
        .await;
    assert_eq!(deliveries.len(), 1);

    let second_generation = manager.current_generation(thread_id).await;
    let second = manager
        .attach_if_generation_matches(thread_id, connection_id, second_generation)
        .await;
    let ProjectionAttachAttempt::Attached(second) = second else {
        panic!("unchanged generation should attach again");
    };

    assert_ne!(first.subscription_id, second.subscription_id);
    assert_eq!(second.head_commit_id, Some(deliveries[0].notification.commit_id.clone()));
}
```

Expected before implementation: compile fails because `ProjectionAttachAttempt`,
`current_generation`, `attach_if_generation_matches`, and `has_thread_entry` do not exist.

- [ ] **Step 2: Run the focused PM tests to confirm red**

Run from `codex-rs`:

```bash
cargo test -p codex-app-server remove_thread_without_entry_invalidates_captured_generation
cargo test -p codex-app-server conditional_attach_with_current_generation_preserves_attach_behavior
```

Expected before implementation: compile failure naming the missing generation API. This is the red step.

- [ ] **Step 3: Add generation types and PM state**

In `codex-rs/app-server/src/thread_projection.rs`, add these types near `ProjectionAttachResult`:

```rust
#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub(crate) struct ProjectionGeneration(u64);

impl ProjectionGeneration {
    fn next(self) -> Self {
        Self(self.0.wrapping_add(1))
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum ProjectionAttachAttempt {
    Attached(ProjectionAttachResult),
    StaleThreadGeneration,
}
```

Update `ThreadProjectionManagerInner`:

```rust
#[derive(Default)]
struct ThreadProjectionManagerInner {
    threads: HashMap<ThreadId, ThreadEntry>,
    connection_index: HashMap<ConnectionId, HashSet<ThreadId>>,
    thread_generations: HashMap<ThreadId, ProjectionGeneration>,
}
```

- [ ] **Step 4: Add PM generation and conditional attach methods**

In `impl ThreadProjectionManager`, replace the current `attach` implementation with a wrapper around an inner helper, then add `current_generation` and `attach_if_generation_matches`.

Use this shape:

```rust
pub(crate) async fn attach(
    &self,
    thread_id: ThreadId,
    connection_id: ConnectionId,
) -> ProjectionAttachResult {
    let mut inner = self.inner.lock().await;
    inner.attach_locked(thread_id, connection_id)
}

pub(crate) async fn current_generation(
    &self,
    thread_id: ThreadId,
) -> ProjectionGeneration {
    self.inner.lock().await.current_generation(thread_id)
}

pub(crate) async fn attach_if_generation_matches(
    &self,
    thread_id: ThreadId,
    connection_id: ConnectionId,
    expected_generation: ProjectionGeneration,
) -> ProjectionAttachAttempt {
    let mut inner = self.inner.lock().await;
    if inner.current_generation(thread_id) != expected_generation {
        return ProjectionAttachAttempt::StaleThreadGeneration;
    }

    ProjectionAttachAttempt::Attached(inner.attach_locked(thread_id, connection_id))
}
```

Do not implement unconditional `attach` by calling `current_generation(...).await` followed by
`attach_if_generation_matches(...).await`; that introduces an unnecessary await boundary between
reading generation and attaching.

- [ ] **Step 5: Update remove_thread to bump generation even without an entry**

Modify `ThreadProjectionManager::remove_thread`:

```rust
pub(crate) async fn remove_thread(&self, thread_id: ThreadId) {
    let mut inner = self.inner.lock().await;
    inner.bump_generation(thread_id);
    let Some(entry) = inner.threads.remove(&thread_id) else {
        return;
    };
    for connection_id in entry.subscribers.into_keys() {
        inner.remove_connection_thread_index(connection_id, thread_id);
    }
}
```

Add helper methods in `impl ThreadProjectionManagerInner`:

```rust
fn current_generation(&self, thread_id: ThreadId) -> ProjectionGeneration {
    self.thread_generations
        .get(&thread_id)
        .copied()
        .unwrap_or_default()
}

fn bump_generation(&mut self, thread_id: ThreadId) {
    let next_generation = self.current_generation(thread_id).next();
    self.thread_generations.insert(thread_id, next_generation);
}

fn attach_locked(
    &mut self,
    thread_id: ThreadId,
    connection_id: ConnectionId,
) -> ProjectionAttachResult {
    let entry = self.thread_entry_mut(thread_id);
    let subscription_id = Uuid::now_v7().to_string();
    let head_commit_id = entry.attach(connection_id, subscription_id.clone());
    self.add_connection_thread_index(connection_id, thread_id);
    ProjectionAttachResult {
        subscription_id,
        head_commit_id,
    }
}
```

- [ ] **Step 6: Add the test-only entry inspection helper**

In `impl ThreadProjectionManager`, add:

```rust
#[cfg(test)]
async fn has_thread_entry(&self, thread_id: ThreadId) -> bool {
    self.inner.lock().await.threads.contains_key(&thread_id)
}
```

This helper exists only to prove stale attach does not recreate a PM thread entry.

- [ ] **Step 7: Run PM tests**

Run from `codex-rs`:

```bash
cargo test -p codex-app-server remove_thread_without_entry_invalidates_captured_generation
cargo test -p codex-app-server conditional_attach_with_current_generation_preserves_attach_behavior
```

Expected: both tests pass.

- [ ] **Step 8: Commit Task 1**

```bash
git add codex-rs/app-server/src/thread_projection.rs
git commit -m "fix(app-server): gate projection attach by generation"
```

Expected: commit contains only PM generation API and unit tests.

## Task 2: Wire Projection Generation Through Attach Response Flow

**Files:**
- Modify: `codex-rs/app-server/src/thread_state.rs`
- Modify: `codex-rs/app-server/src/request_processors/thread_projection.rs`
- Modify: `codex-rs/app-server/src/request_processors/thread_lifecycle.rs`
- Modify: `codex-rs/app-server/src/thread_projection_runtime.rs`

- [ ] **Step 1: Add generation to the listener command**

In `codex-rs/app-server/src/thread_state.rs`, import the generation type:

```rust
use crate::thread_projection::ProjectionGeneration;
```

Update the `SendThreadProjectionAttachResponse` variant:

```rust
SendThreadProjectionAttachResponse {
    request_id: ConnectionRequestId,
    connection_id: ConnectionId,
    projection_generation: ProjectionGeneration,
    snapshot: crate::thread_projection_runtime::ThreadProjectionSnapshotFuture,
    completion_tx: oneshot::Sender<()>,
},
```

- [ ] **Step 2: Capture generation before enqueueing attach response**

In `ThreadRequestProcessor::thread_projection_attach`, capture generation after successful prepare and before creating/enqueueing the listener command:

```rust
let projection_generation = self
    .outgoing
    .thread_projection_manager()
    .current_generation(thread_id)
    .await;
let snapshot = Box::pin(async move {
    snapshot_processor
        .read_thread_projection_snapshot(thread_id)
        .await
        .map_err(thread_read_view_error)
});
enqueue_projection_attach_response(
    attach.thread_state,
    attach.thread_id,
    request_id.clone(),
    projection_generation,
    snapshot,
)
.await?;
```

Keep `prepare_projection_attach` unchanged in this task. Do not touch
`try_thread_state_for_live_connection`.

- [ ] **Step 3: Pass generation through enqueue_projection_attach_response**

Update the helper signature in `codex-rs/app-server/src/request_processors/thread_projection.rs`:

```rust
async fn enqueue_projection_attach_response(
    thread_state: Arc<Mutex<crate::thread_state::ThreadState>>,
    thread_id: ThreadId,
    request_id: ConnectionRequestId,
    projection_generation: crate::thread_projection::ProjectionGeneration,
    snapshot: crate::thread_projection_runtime::ThreadProjectionSnapshotFuture,
) -> Result<(), JSONRPCErrorError> {
```

Include `projection_generation` in the command send:

```rust
listener_command_tx
    .send(crate::thread_state::ThreadListenerCommand::SendThreadProjectionAttachResponse {
        request_id: request_id.clone(),
        connection_id: request_id.connection_id,
        projection_generation,
        snapshot,
        completion_tx,
    })
```

- [ ] **Step 4: Forward generation from the listener command**

In `codex-rs/app-server/src/request_processors/thread_lifecycle.rs`, update the match arm:

```rust
ThreadListenerCommand::SendThreadProjectionAttachResponse {
    request_id,
    connection_id,
    projection_generation,
    snapshot,
    completion_tx,
} => {
    crate::thread_projection_runtime::handle_projection_attach_response(
        conversation_id,
        pending_thread_unloads,
        outgoing,
        thread_state_manager,
        request_id,
        connection_id,
        projection_generation,
        snapshot,
    )
    .await;
    let _ = completion_tx.send(());
}
```

- [ ] **Step 5: Update projection runtime signature**

In `codex-rs/app-server/src/thread_projection_runtime.rs`, import conditional attach types:

```rust
use crate::thread_projection::ProjectionAttachAttempt;
use crate::thread_projection::ProjectionGeneration;
```

Update `handle_projection_attach_response`:

```rust
pub(crate) async fn handle_projection_attach_response(
    conversation_id: ThreadId,
    pending_thread_unloads: &Arc<Mutex<HashSet<ThreadId>>>,
    outgoing: &Arc<OutgoingMessageSender>,
    thread_state_manager: &ThreadStateManager,
    request_id: ConnectionRequestId,
    connection_id: ConnectionId,
    projection_generation: ProjectionGeneration,
    snapshot: ThreadProjectionSnapshotFuture,
) {
```

Update existing direct test calls in this file by passing:

```rust
let projection_generation = outgoing
    .thread_projection_manager()
    .current_generation(thread_id)
    .await;
```

before each `handle_projection_attach_response(...)` call.

- [ ] **Step 6: Replace unconditional attach with conditional attach**

In `handle_projection_attach_response`, replace:

```rust
let attach_result = outgoing
    .thread_projection_manager()
    .attach(conversation_id, connection_id)
    .await;
```

with:

```rust
let attach_result = match outgoing
    .thread_projection_manager()
    .attach_if_generation_matches(conversation_id, connection_id, projection_generation)
    .await
{
    ProjectionAttachAttempt::Attached(attach_result) => attach_result,
    ProjectionAttachAttempt::StaleThreadGeneration => {
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
};
```

This consumes `request_id` on stale error and returns immediately. The existing success path still
uses `request_id` later in `send_response`.

- [ ] **Step 7: Run compile-focused tests**

Run from `codex-rs`:

```bash
cargo test -p codex-app-server attach_response_after_connection_close_does_not_subscribe
cargo test -p codex-app-server connection_close_interleaving_does_not_leave_projection_subscription
cargo test -p codex-app-server late_connection_close_cleanup_removes_projection_attach_race
```

Expected: all three tests pass after their call sites include `projection_generation`.

- [ ] **Step 8: Commit Task 2**

```bash
git add codex-rs/app-server/src/thread_state.rs \
  codex-rs/app-server/src/request_processors/thread_projection.rs \
  codex-rs/app-server/src/request_processors/thread_lifecycle.rs \
  codex-rs/app-server/src/thread_projection_runtime.rs
git commit -m "fix(app-server): use projection generation for attach responses"
```

Expected: commit wires generation through the attach response path and updates existing tests.

## Task 3: Add Runtime Regression For Teardown During Snapshot

**Files:**
- Modify: `codex-rs/app-server/src/thread_projection_runtime.rs`

- [ ] **Step 1: Add the blocked snapshot regression test**

Add this test in the existing `#[cfg(test)] mod tests` in
`codex-rs/app-server/src/thread_projection_runtime.rs`:

```rust
#[tokio::test]
async fn attach_response_after_thread_teardown_does_not_recreate_projection_subscription()
-> anyhow::Result<()> {
    let thread_id = ThreadId::new();
    let connection_id = ConnectionId(1);
    let request_id = ConnectionRequestId {
        connection_id,
        request_id: RequestId::Integer(1),
    };
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
    let projection_generation = outgoing
        .thread_projection_manager()
        .current_generation(thread_id)
        .await;
    let (snapshot_tx, snapshot_rx) = oneshot::channel();
    let snapshot = Box::pin(async move {
        snapshot_rx
            .await
            .expect("snapshot sender should resolve the future")
    });

    let attach_task = tokio::spawn({
        let pending_thread_unloads = pending_thread_unloads.clone();
        let outgoing = outgoing.clone();
        let thread_state_manager = thread_state_manager.clone();
        async move {
            handle_projection_attach_response(
                thread_id,
                &pending_thread_unloads,
                &outgoing,
                &thread_state_manager,
                request_id,
                connection_id,
                projection_generation,
                snapshot,
            )
            .await;
        }
    });

    outgoing
        .thread_projection_manager()
        .remove_thread(thread_id)
        .await;
    snapshot_tx
        .send(Ok(test_thread(thread_id)))
        .expect("snapshot receiver should be waiting");
    timeout(Duration::from_secs(1), attach_task)
        .await
        .expect("attach task should finish")
        .expect("attach task should not panic");

    let message = outgoing_rx
        .recv()
        .await
        .expect("stale attach should send an error response");
    let error = match message.message {
        codex_app_server_transport::OutgoingMessage::Error(error) => error.error,
        other => panic!("expected stale attach error response, got {other:?}"),
    };
    assert!(error.message.contains("was unloaded while attaching projection"));

    let projection_cleanup = outgoing
        .thread_projection_manager()
        .remove_connection(connection_id)
        .await;
    assert_eq!(projection_cleanup, Vec::new());

    let deliveries = outgoing
        .thread_projection_manager()
        .project_notification(thread_id, &turn_started_notification(thread_id))
        .await;
    assert_eq!(deliveries, Vec::new());
    Ok(())
}
```

This assertion is intentionally against `OutgoingMessage::Error`: stale attach should complete the
JSON-RPC request with an error, not with a successful `ThreadProjectionAttachResponse`.

- [ ] **Step 2: Run the new regression test**

Run from `codex-rs`:

```bash
cargo test -p codex-app-server attach_response_after_thread_teardown_does_not_recreate_projection_subscription -- --nocapture
```

Expected after Task 2: test passes. If it fails because no error response is observed, inspect
`OutgoingMessageSender::send_error` and assert against the actual outgoing envelope shape rather
than dropping the response assertion.

- [ ] **Step 3: Run all projection runtime tests**

Run from `codex-rs`:

```bash
cargo test -p codex-app-server thread_projection_runtime
```

Expected: all projection runtime tests pass.

- [ ] **Step 4: Commit Task 3**

```bash
git add codex-rs/app-server/src/thread_projection_runtime.rs
git commit -m "test(app-server): cover stale projection attach teardown"
```

Expected: commit contains only the runtime regression test.

## Task 4: Final Verification And Cleanup

**Files:**
- Review all files touched by Tasks 1-3.

- [ ] **Step 1: Run formatter**

Run from `codex-rs`:

```bash
just fmt
```

Expected: formatting completes.

- [ ] **Step 2: Run focused projection tests**

Run from `codex-rs`:

```bash
cargo test -p codex-app-server thread_projection
```

Expected: all thread projection tests pass.

- [ ] **Step 3: Run scoped lint fix**

Run from `codex-rs`:

```bash
just fix -p codex-app-server
```

Expected: lint fix completes. Per repo guidance, do not re-run tests after `fix` or `fmt` unless
the command reports a source change that clearly invalidates prior test output.

- [ ] **Step 4: Review diff scope**

Run from repo root:

```bash
git diff --stat HEAD~3..HEAD
git diff --check
rg -n "ProjectionGeneration|ProjectionAttachAttempt|attach_if_generation_matches|current_generation" codex-rs/app-server/src
```

Expected:

- Diffs are limited to `codex-rs/app-server/src/thread_projection.rs`,
  `codex-rs/app-server/src/thread_state.rs`,
  `codex-rs/app-server/src/request_processors/thread_projection.rs`,
  `codex-rs/app-server/src/request_processors/thread_lifecycle.rs`, and
  `codex-rs/app-server/src/thread_projection_runtime.rs`.
- `git diff --check` has no output.
- Generation appears only in app-server internals, not in app-server protocol crate or generated fixtures.

- [ ] **Step 5: Confirm non-goals stayed untouched**

Run:

```bash
git diff HEAD~3..HEAD -- codex-rs/app-server/src/thread_state.rs
git diff HEAD~3..HEAD -- codex-rs/app-server-protocol
```

Expected:

- `thread_state.rs` diff only adds and forwards `projection_generation` in the listener command.
- No app-server protocol schema/type changes.
- No changes to ordinary subscription methods:
  - `try_ensure_connection_subscribed`
  - `try_thread_state_for_live_connection`
  - `try_add_connection_to_thread`
  - `remove_connection`
  - `unsubscribe_connection_from_thread`

- [ ] **Step 6: Report final status**

Report:

- Commit SHAs for Tasks 1-3.
- Exact verification commands and pass/fail status.
- Whether `just fix -p codex-app-server` changed files.
- Any residual risk, especially that Finding 2 remains intentionally unsolved.
