# Projection Fanout Backpressure Isolation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix Hidden-race Finding 2 by moving projection fanout out of the ordinary thread notification await path while preserving projection commit-chain correctness.

**Architecture:** Add a per-thread bounded projection fanout queue and worker owned by `OutgoingMessageSender`. Ordinary notifications are sent first; projection deliveries are queued with `try_send`, consumed sequentially by the thread worker, and invalidated on queue overflow by bumping projection generation and clearing subscriptions.

**Tech Stack:** Rust, Tokio `mpsc`, `CancellationToken`, `codex-app-server`, existing projection generation gate, focused app-server tests.

---

## Source Of Truth

- Design: `docs/superpowers/specs/2026-05-27-projection-fanout-backpressure-isolation-design.md`
- Issue context: `docs/superpowers/issues/2026-05-19-projection-hidden-race-review.md`

## Scope

This plan fixes only Hidden-race Finding 2:

- ordinary thread notification must not wait for projection delivery sends.
- projection fanout must have bounded per-thread queueing.
- queue full invalidates that thread's projection stream instead of silently dropping part of the commit chain.
- existing generation gate remains the final send-side stale-delivery check.

Do not include these changes:

- Do not add per-subscription queues.
- Do not add app-server protocol fields or notifications.
- Do not change `thread/projection/event` wire shape.
- Do not rewrite snapshot cut, commit materialization, or projection history cursor logic.
- Do not change ordinary thread subscription state.
- Do not redesign shared outgoing transport QoS or priority scheduling.

## File Structure

- Modify: `codex-rs/app-server/src/lib.rs`
  - Register the new `projection_fanout` module.
- Modify: `codex-rs/app-server/src/thread_projection.rs`
  - Add `invalidate_thread_projection(...)`.
  - Preserve projection subscriber watcher while clearing subscribers and head.
  - Add focused unit tests for invalidation semantics.
- Create: `codex-rs/app-server/src/projection_fanout.rs`
  - Add `ProjectionFanoutManager`, per-thread queue handles, worker lifecycle, queue-full invalidation, and focused unit tests.
- Modify: `codex-rs/app-server/src/outgoing_message.rs`
  - Add `projection_fanout_manager` field.
  - Route projection deliveries through `enqueue_projection_fanout(...)`.
  - Send ordinary notification before projection enqueue.
  - Add cancellation-aware projection delivery send helper.
  - Add outgoing path regression tests.
- Modify: `codex-rs/app-server/src/request_processors/thread_processor.rs`
  - Cancel fanout worker on thread teardown paths that already remove projection state.
- Modify: `codex-rs/app-server/src/thread_projection_runtime.rs`
  - Add or extend runtime regression coverage for real listener behavior.
- Modify: `docs/superpowers/issues/2026-05-19-projection-hidden-race-review.md`
  - After implementation and verification, mark Finding 2 fixed.

## Task 1: Add Projection Invalidation To PM

**Files:**
- Modify: `codex-rs/app-server/src/thread_projection.rs`

- [ ] **Step 1: Add failing invalidation tests**

Add these tests inside the existing `#[cfg(test)] mod tests` in `codex-rs/app-server/src/thread_projection.rs`.

```rust
#[tokio::test]
async fn invalidate_thread_projection_clears_subscribers_head_and_generation() {
    let manager = ThreadProjectionManager::new();
    let thread_id = ThreadId::new();
    let first_connection_id = ConnectionId(1);
    let second_connection_id = ConnectionId(2);
    let generation = manager.capture_current_generation(thread_id).await;

    let first_attach = manager
        .attach_if_generation_matches(thread_id, first_connection_id, generation)
        .await;
    let ProjectionAttachAttempt::Attached(_) = first_attach else {
        panic!("current generation should attach");
    };
    let second_attach = manager
        .attach_if_generation_matches(thread_id, second_connection_id, generation)
        .await;
    let ProjectionAttachAttempt::Attached(_) = second_attach else {
        panic!("current generation should attach");
    };

    let deliveries = manager
        .project_notification(thread_id, &turn_started_notification(thread_id, "turn-1"))
        .await;
    assert_eq!(2, deliveries.len());

    manager.invalidate_thread_projection(thread_id).await;

    assert!(
        !manager
            .generation_matches(thread_id, deliveries[0].generation)
            .await
    );
    assert_eq!(
        Vec::<ThreadId>::new(),
        manager.remove_connection(first_connection_id).await
    );
    assert_eq!(
        Vec::<ThreadId>::new(),
        manager.remove_connection(second_connection_id).await
    );

    let new_generation = manager.capture_current_generation(thread_id).await;
    let new_attach = manager
        .attach_if_generation_matches(thread_id, first_connection_id, new_generation)
        .await;
    let ProjectionAttachAttempt::Attached(result) = new_attach else {
        panic!("new generation should attach after invalidation");
    };
    assert_eq!(None, result.head_commit_id);
}

#[tokio::test]
async fn invalidate_thread_projection_preserves_has_subscribers_watcher() {
    let manager = ThreadProjectionManager::new();
    let thread_id = ThreadId::new();
    let connection_id = ConnectionId(1);
    let mut has_subscribers = manager.subscribe_to_has_subscribers(thread_id).await;
    let generation = manager.capture_current_generation(thread_id).await;

    let attach = manager
        .attach_if_generation_matches(thread_id, connection_id, generation)
        .await;
    let ProjectionAttachAttempt::Attached(_) = attach else {
        panic!("current generation should attach");
    };
    has_subscribers.changed().await.expect("watch open");
    assert!(*has_subscribers.borrow());

    manager.invalidate_thread_projection(thread_id).await;

    has_subscribers.changed().await.expect("watch should stay open");
    assert!(!*has_subscribers.borrow());
}

#[tokio::test]
async fn invalidate_unknown_thread_has_no_projection_side_effects() {
    let manager = ThreadProjectionManager::new();
    let thread_id = ThreadId::new();

    manager.invalidate_thread_projection(thread_id).await;

    assert!(!manager.has_thread_entry(thread_id).await);
    assert!(!manager.has_thread_generation(thread_id).await);
}
```

Expected before implementation: compile failure because `invalidate_thread_projection` does not exist.

- [ ] **Step 2: Run the focused PM tests to confirm red**

Run from `codex-rs`:

```bash
cargo test -p codex-app-server invalidate_thread_projection --no-fail-fast
```

Expected before implementation: compile failure naming the missing method.

- [ ] **Step 3: Add PM invalidation API**

Add this method to `impl ThreadProjectionManager`:

```rust
pub(crate) async fn invalidate_thread_projection(&self, thread_id: ThreadId) {
    let mut inner = self.inner.lock().await;
    inner.invalidate_thread_projection(thread_id);
}
```

Add this helper to `impl ThreadProjectionManagerInner`:

```rust
fn invalidate_thread_projection(&mut self, thread_id: ThreadId) {
    if !self.thread_generations.contains_key(&thread_id)
        && !self.threads.contains_key(&thread_id)
    {
        return;
    }

    self.bump_generation_if_known(thread_id);
    let Some(entry) = self.threads.get_mut(&thread_id) else {
        return;
    };

    let connection_ids = entry.subscribers.keys().copied().collect::<Vec<_>>();
    entry.head_commit_id = None;
    entry.subscribers.clear();
    let _ = entry.has_subscribers_tx.send(false);

    for connection_id in connection_ids {
        self.remove_connection_thread_index(connection_id, thread_id);
    }
}
```

Do not call `remove_thread(...)` from this method. Queue full is projection stream invalidation, not thread teardown; the existing `has_subscribers_tx` must remain open.

- [ ] **Step 4: Verify PM tests pass**

Run from `codex-rs`:

```bash
cargo test -p codex-app-server invalidate_thread_projection --no-fail-fast
```

Expected: all invalidation tests pass.

## Task 2: Add The Projection Fanout Manager

**Files:**
- Modify: `codex-rs/app-server/src/lib.rs`
- Create: `codex-rs/app-server/src/projection_fanout.rs`

- [ ] **Step 1: Register the module**

Add this module declaration near the other app-server modules in `codex-rs/app-server/src/lib.rs`:

```rust
mod projection_fanout;
```

- [ ] **Step 2: Create the fanout manager skeleton**

Create `codex-rs/app-server/src/projection_fanout.rs` with this structure:

```rust
use std::collections::HashMap;
use std::sync::Arc;

use codex_protocol::ThreadId;
use tokio::sync::Mutex;
use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;
use tracing::warn;

use crate::outgoing_message::OutgoingMessageSender;
use crate::thread_projection::ProjectionDelivery;

pub(crate) const PROJECTION_FANOUT_QUEUE_CAPACITY: usize = 32;

#[derive(Clone, Default)]
pub(crate) struct ProjectionFanoutManager {
    inner: Arc<Mutex<ProjectionFanoutManagerInner>>,
}

#[derive(Default)]
struct ProjectionFanoutManagerInner {
    threads: HashMap<ThreadId, ThreadFanoutHandle>,
    next_worker_id: u64,
}

struct ThreadFanoutHandle {
    worker_id: u64,
    tx: mpsc::Sender<ProjectionFanoutJob>,
    cancellation: CancellationToken,
}

struct ProjectionFanoutJob {
    deliveries: Vec<ProjectionDelivery>,
}
```

Use a private `ProjectionFanoutJob`; only the manager should decide how jobs are queued.

- [ ] **Step 3: Add enqueue and worker lifecycle**

Add these methods to `ProjectionFanoutManager`:

```rust
impl ProjectionFanoutManager {
    pub(crate) fn new() -> Self {
        Self::default()
    }

    pub(crate) async fn enqueue_projection_fanout(
        &self,
        outgoing: Arc<OutgoingMessageSender>,
        thread_id: ThreadId,
        deliveries: Vec<ProjectionDelivery>,
    ) {
        if deliveries.is_empty() {
            return;
        }

        let mut job = ProjectionFanoutJob { deliveries };
        loop {
            let mut inner = self.inner.lock().await;
            let tx = inner
                .thread_handle(thread_id, self.clone(), outgoing.clone())
                .tx
                .clone();
            match tx.try_send(job) {
                Ok(()) => return,
                Err(mpsc::error::TrySendError::Full(returned_job)) => {
                    let removed = inner.threads.remove(&thread_id);
                    drop(inner);
                    if let Some(handle) = removed {
                        handle.cancellation.cancel();
                    }
                    warn!(
                        "projection fanout queue full for thread {thread_id}; invalidating projection subscriptions"
                    );
                    outgoing
                        .thread_projection_manager()
                        .invalidate_thread_projection(thread_id)
                        .await;
                    drop(returned_job);
                    return;
                }
                Err(mpsc::error::TrySendError::Closed(returned_job)) => {
                    inner.threads.remove(&thread_id);
                    drop(inner);
                    job = returned_job;
                    continue;
                }
            }
        }
    }

    pub(crate) async fn cancel_thread(&self, thread_id: ThreadId) {
        let mut inner = self.inner.lock().await;
        let handle = inner.threads.remove(&thread_id);
        drop(inner);
        if let Some(handle) = handle {
            handle.cancellation.cancel();
        }
    }

    async fn finish_worker(&self, thread_id: ThreadId, worker_id: u64) {
        let mut inner = self.inner.lock().await;
        if inner
            .threads
            .get(&thread_id)
            .is_some_and(|handle| handle.worker_id == worker_id)
        {
            inner.threads.remove(&thread_id);
        }
    }
}
```

The `Closed` branch retries the same job against a fresh worker. It still does not await queue capacity.

- [ ] **Step 4: Add inner handle creation**

Add this method to `ProjectionFanoutManagerInner`:

```rust
impl ProjectionFanoutManagerInner {
    fn thread_handle(
        &mut self,
        thread_id: ThreadId,
        manager: ProjectionFanoutManager,
        outgoing: Arc<OutgoingMessageSender>,
    ) -> &ThreadFanoutHandle {
        if !self.threads.contains_key(&thread_id) {
            let (tx, rx) = mpsc::channel(PROJECTION_FANOUT_QUEUE_CAPACITY);
            let cancellation = CancellationToken::new();
            let worker_id = self.next_worker_id;
            self.next_worker_id = self.next_worker_id.wrapping_add(1);
            tokio::spawn(run_projection_fanout_worker(
                manager,
                outgoing,
                thread_id,
                worker_id,
                cancellation.clone(),
                rx,
            ));
            self.threads.insert(
                thread_id,
                ThreadFanoutHandle {
                    worker_id,
                    tx,
                    cancellation,
                },
            );
        }

        self.threads
            .get(&thread_id)
            .expect("thread handle should exist after insertion")
    }
}
```

The returned handle is only used while the manager lock is held. Do not expose it outside the manager.

- [ ] **Step 5: Add the worker**

Add this worker function:

```rust
async fn run_projection_fanout_worker(
    manager: ProjectionFanoutManager,
    outgoing: Arc<OutgoingMessageSender>,
    thread_id: ThreadId,
    worker_id: u64,
    cancellation: CancellationToken,
    mut rx: mpsc::Receiver<ProjectionFanoutJob>,
) {
    loop {
        tokio::select! {
            _ = cancellation.cancelled() => break,
            job = rx.recv() => {
                let Some(job) = job else {
                    break;
                };
                for delivery in job.deliveries {
                    if cancellation.is_cancelled() {
                        break;
                    }
                    outgoing
                        .send_projection_delivery_if_current_or_cancelled(
                            thread_id,
                            delivery,
                            &cancellation,
                        )
                        .await;
                }
            }
        }
    }

    manager.finish_worker(thread_id, worker_id).await;
}
```

This requires Task 3 to add `send_projection_delivery_if_current_or_cancelled(...)`.

- [ ] **Step 6: Add manager tests**

Add tests in `projection_fanout.rs` under `#[cfg(test)] mod tests`.

Add these tests:

```rust
#[tokio::test]
async fn enqueue_projection_fanout_returns_before_worker_has_capacity() {
    // Arrange: create an OutgoingMessageSender with mpsc capacity 1, fill the
    // outgoing channel, attach a projection subscriber, and materialize one
    // projection delivery.
    // Act: call enqueue_projection_fanout.
    // Assert: the call returns within a short timeout while the outgoing
    // channel is still full.
}

#[tokio::test]
async fn queue_full_invalidates_thread_projection() {
    // Arrange: block this thread's worker on outgoing capacity, then enqueue
    // PROJECTION_FANOUT_QUEUE_CAPACITY jobs for the same thread.
    // Act: enqueue one additional job.
    // Assert: the old delivery generation no longer matches, and
    // remove_connection for the projection subscriber returns no thread ids.
}

#[tokio::test]
async fn cancel_thread_stops_worker_before_capacity_is_available() {
    // Arrange: block the worker on outgoing capacity with one pending
    // projection delivery.
    // Act: cancel the thread fanout worker, then free outgoing capacity.
    // Assert: no ThreadProjectionEvent is received.
}
```

Create local helper functions in the test module for creating `OutgoingMessageSender`, attaching projection subscribers, and materializing `ProjectionDelivery`; keep them test-only.

- [ ] **Step 7: Run fanout tests**

Run from `codex-rs`:

```bash
cargo test -p codex-app-server projection_fanout --no-fail-fast
```

Expected: fanout manager tests pass after Task 3 wiring compiles.

## Task 3: Wire Fanout Into OutgoingMessageSender

**Files:**
- Modify: `codex-rs/app-server/src/outgoing_message.rs`

- [ ] **Step 1: Add fanout manager imports and field**

Add this import:

```rust
use crate::projection_fanout::ProjectionFanoutManager;
```

Add this field to `OutgoingMessageSender`:

```rust
projection_fanout_manager: ProjectionFanoutManager,
```

Initialize it in `OutgoingMessageSender::new(...)`:

```rust
projection_fanout_manager: ProjectionFanoutManager::new(),
```

- [ ] **Step 2: Add outgoing helper accessors**

Add these methods to `impl OutgoingMessageSender`:

```rust
pub(crate) fn projection_fanout_manager(&self) -> ProjectionFanoutManager {
    self.projection_fanout_manager.clone()
}

pub(crate) async fn enqueue_projection_fanout(
    self: &Arc<Self>,
    thread_id: ThreadId,
    deliveries: Vec<ProjectionDelivery>,
) {
    self.projection_fanout_manager
        .enqueue_projection_fanout(self.clone(), thread_id, deliveries)
        .await;
}

pub(crate) async fn cancel_projection_fanout(&self, thread_id: ThreadId) {
    self.projection_fanout_manager.cancel_thread(thread_id).await;
}
```

Use `self: &Arc<Self>` for `enqueue_projection_fanout(...)` so the worker can receive an `Arc<OutgoingMessageSender>` without creating a weak upgrade path.

- [ ] **Step 3: Add cancellation-aware projection send helper**

Replace the body of `send_projection_delivery_if_current(...)` with a call to a new helper:

```rust
pub(crate) async fn send_projection_delivery_if_current(
    &self,
    thread_id: ThreadId,
    delivery: ProjectionDelivery,
) {
    let cancellation = CancellationToken::new();
    self.send_projection_delivery_if_current_or_cancelled(thread_id, delivery, &cancellation)
        .await;
}
```

Add this method:

```rust
pub(crate) async fn send_projection_delivery_if_current_or_cancelled(
    &self,
    thread_id: ThreadId,
    delivery: ProjectionDelivery,
    cancellation: &CancellationToken,
) {
    let outgoing_message = OutgoingMessage::AppServerNotification(
        ServerNotification::ThreadProjectionEvent(delivery.notification),
    );
    let permit = tokio::select! {
        permit = self.sender.reserve() => match permit {
            Ok(permit) => permit,
            Err(err) => {
                warn!("failed to send projection delivery to client: {err:?}");
                return;
            }
        },
        _ = cancellation.cancelled() => return,
    };

    self.thread_projection_manager
        .run_if_generation_matches(thread_id, delivery.generation, || {
            permit.send(OutgoingEnvelope::ToConnection {
                connection_id: delivery.connection_id,
                message: outgoing_message,
                write_complete_tx: None,
            });
        })
        .await;
}
```

Keep the existing no-`await` rule between generation check and `permit.send(...)`.

- [ ] **Step 4: Reorder `ThreadScopedOutgoingMessageSender::send_server_notification(...)`**

Change the method to this structure:

```rust
pub(crate) async fn send_server_notification(&self, notification: ServerNotification) {
    self.outgoing
        .analytics_events_client
        .track_notification(notification.clone());
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

    if !self.connection_ids.is_empty() {
        self.outgoing
            .send_server_notification_to_connections(self.connection_ids.as_slice(), notification)
            .await;
    }

    self.outgoing
        .enqueue_projection_fanout(self.thread_id, deliveries)
        .await;
}
```

This intentionally removes the early return on empty `connection_ids`; projection-only subscribers must still receive projection events.

- [ ] **Step 5: Add outgoing path regression tests**

Add or update tests in `codex-rs/app-server/src/outgoing_message.rs`.

Test 1: ordinary notification is not blocked by projection worker capacity.

```rust
#[tokio::test]
async fn ordinary_notification_does_not_wait_for_projection_delivery_capacity() {
    // Arrange: use outgoing channel capacity 1, fill the channel, create a
    // ThreadScopedOutgoingMessageSender with an ordinary connection id and one
    // projection subscriber, and spawn send_server_notification(...).
    // Act: free exactly one outgoing slot.
    // Assert: the next envelope is the ordinary notification for the ordinary
    // connection, not ThreadProjectionEvent.
}
```

Test 2: projection-only subscribers still receive projection events when there are no ordinary subscribers.

```rust
#[tokio::test]
async fn projection_only_subscriber_receives_event_without_ordinary_subscribers() {
    // Arrange: create ThreadScopedOutgoingMessageSender with empty
    // connection_ids and attach a projection subscriber.
    // Act: send a projectable notification.
    // Assert: outgoing channel receives ThreadProjectionEvent.
}
```

Test 3: cancellation prevents delivery while waiting for capacity.

```rust
#[tokio::test]
async fn cancelled_projection_delivery_wait_does_not_enqueue_after_capacity_returns() {
    // Arrange: fill outgoing channel and start
    // send_projection_delivery_if_current_or_cancelled(...).
    // Act: cancel the token, then drain the capacity holder.
    // Assert: no projection delivery arrives.
}
```

Keep assertions structured around `OutgoingEnvelope` and `ServerNotification::ThreadProjectionEvent`, matching nearby tests.

- [ ] **Step 6: Run outgoing tests**

Run from `codex-rs`:

```bash
cargo test -p codex-app-server ordinary_notification_does_not_wait_for_projection_delivery_capacity
cargo test -p codex-app-server projection_only_subscriber_receives_event_without_ordinary_subscribers
cargo test -p codex-app-server cancelled_projection_delivery_wait_does_not_enqueue_after_capacity_returns
```

Expected: all three tests pass.

## Task 4: Cancel Fanout On Thread Teardown

**Files:**
- Modify: `codex-rs/app-server/src/request_processors/thread_processor.rs`
- Modify: `codex-rs/app-server/src/outgoing_message.rs`

- [ ] **Step 1: Locate teardown helper**

Find `finalize_thread_teardown(...)` or the local helper that already calls:

```rust
self.outgoing.thread_projection_manager().remove_thread(thread_id).await;
```

Do not move existing teardown order for ordinary thread cleanup.

- [ ] **Step 2: Cancel projection fanout when projection state is removed**

In the same teardown path that removes projection state, add:

```rust
self.outgoing.cancel_projection_fanout(thread_id).await;
```

Place it next to `ThreadProjectionManager::remove_thread(...)` so teardown cancels both projection state and projection fanout worker. Preserve existing ordinary notification and thread-state ordering.

- [ ] **Step 3: Add a focused teardown cancellation test**

Add this focused test in `codex-rs/app-server/src/thread_projection_runtime.rs`.

Test shape:

```rust
#[tokio::test]
async fn thread_teardown_cancels_pending_projection_fanout_worker() {
    // Arrange: attach a projection subscriber and trigger a projection event
    // while outgoing capacity is held.
    // Act: trigger the teardown path that removes projection state, then
    // release outgoing capacity.
    // Assert: the old ThreadProjectionEvent is not sent.
}
```

- [ ] **Step 4: Run the focused teardown test**

Run from `codex-rs` with the exact test name added in Step 3:

```bash
cargo test -p codex-app-server thread_teardown_cancels_pending_projection_fanout_worker --no-fail-fast
```

Expected: test passes.

## Task 5: Add Runtime Regression Coverage

**Files:**
- Modify: `codex-rs/app-server/src/thread_projection_runtime.rs`

- [ ] **Step 1: Reuse existing projection runtime harness**

Open `codex-rs/app-server/src/thread_projection_runtime.rs` and reuse the existing test-only `ProjectionAttachHarness` for connection ids, request ids, attach responses, and projection delivery assertions.

- [ ] **Step 2: Add ordinary-notification-not-blocked regression**

Add a runtime regression with this behavior:

```rust
#[tokio::test]
async fn projection_fanout_backpressure_does_not_block_ordinary_notification() {
    // Arrange: set up a loaded thread with ordinary and projection
    // subscriptions, then saturate outgoing capacity so the projection fanout
    // worker cannot send.
    // Act: trigger a projectable thread notification through the listener path
    // and release one outgoing slot.
    // Assert: the ordinary thread notification is delivered without waiting
    // for projection fanout.
}
```

The assertion should distinguish ordinary notification from `ServerNotification::ThreadProjectionEvent`.

- [ ] **Step 3: Add queue-full invalidation regression**

Add a runtime or focused integration regression with this behavior:

```rust
#[tokio::test]
async fn full_projection_fanout_queue_invalidates_subscription_until_reattach() {
    // Arrange: attach projection subscriber, capture its subscription id, and
    // block the per-thread fanout worker.
    // Act: enqueue PROJECTION_FANOUT_QUEUE_CAPACITY projectable notifications,
    // then send one more projectable notification to trigger invalidation.
    // Assert: the old subscription no longer receives a continuous projection
    // stream; reattach succeeds with a fresh snapshot baseline.
}
```

Do not assert a new forced-detach wire event; this design intentionally does not add one.

- [ ] **Step 4: Run runtime projection tests**

Run from `codex-rs`:

```bash
RUST_MIN_STACK=8388608 cargo nextest run -p codex-app-server --test-threads 4 thread_projection_runtime
```

Expected: runtime projection tests pass. If `cargo-nextest` is not installed, run:

```bash
RUST_MIN_STACK=8388608 cargo test -p codex-app-server thread_projection_runtime -- --test-threads=4
```

## Task 6: Update Issue Status And Run Final Verification

**Files:**
- Modify: `docs/superpowers/issues/2026-05-19-projection-hidden-race-review.md`

- [ ] **Step 1: Update issue status after code passes focused tests**

In `docs/superpowers/issues/2026-05-19-projection-hidden-race-review.md`, update the status block:

```markdown
- Finding 2：已修复。projection fanout 现在通过 per-thread bounded queue 和 worker 与 ordinary
  thread notification path 半隔离；ordinary notification 不再等待 projection delivery 实际入
  outgoing queue。queue full 会失效该 thread 当前 projection subscriptions，并要求客户端重新 attach。
```

Update Finding 2's body status from `仍开放` to `已修复` and mention the new fanout manager / queue-full invalidation.

- [ ] **Step 2: Run focused tests**

Run from `codex-rs`:

```bash
cargo test -p codex-app-server invalidate_thread_projection --no-fail-fast
cargo test -p codex-app-server projection_fanout --no-fail-fast
cargo test -p codex-app-server ordinary_notification_does_not_wait_for_projection_delivery_capacity
cargo test -p codex-app-server projection_only_subscriber_receives_event_without_ordinary_subscribers
cargo test -p codex-app-server cancelled_projection_delivery_wait_does_not_enqueue_after_capacity_returns
RUST_MIN_STACK=8388608 cargo nextest run -p codex-app-server --test-threads 4 thread_projection_runtime
```

Expected: all focused tests pass.

- [ ] **Step 3: Format and lint**

Run from `codex-rs`:

```bash
just fmt
just fix -p codex-app-server
```

Per repo instructions, do not re-run tests after `just fix` or `just fmt` unless the commands report a real code change that requires targeted follow-up.

- [ ] **Step 4: Final diff hygiene**

Run from repo root:

```bash
git diff --check
git status --short
```

Expected:

- no whitespace errors.
- changed files are limited to the implementation files, focused tests, this plan's issue status update, and existing uncommitted design/plan docs.
- no generated schema or TypeScript changes.

## Commit Boundary

Use one implementation commit after verification unless the diff grows unexpectedly large:

```bash
git add \
  codex-rs/app-server/src/lib.rs \
  codex-rs/app-server/src/thread_projection.rs \
  codex-rs/app-server/src/projection_fanout.rs \
  codex-rs/app-server/src/outgoing_message.rs \
  codex-rs/app-server/src/request_processors/thread_processor.rs \
  codex-rs/app-server/src/thread_projection_runtime.rs \
  docs/superpowers/issues/2026-05-19-projection-hidden-race-review.md
git commit -m "fix(app-server): isolate projection fanout backpressure"
```

Do not stage unrelated files. If the user wants the design and plan committed separately, commit:

```bash
git add \
  docs/superpowers/specs/2026-05-27-projection-fanout-backpressure-isolation-design.md \
  docs/superpowers/plans/2026-05-27-projection-fanout-backpressure-isolation.md
git commit -m "docs(app-server): plan projection fanout backpressure isolation"
```

## Self-Review Checklist

- [ ] The plan implements all confirmed design choices: semi-isolation, per-thread bounded queue, queue-full invalidation, no protocol changes.
- [ ] Queue enqueue uses `try_send`; ordinary path never awaits projection queue capacity.
- [ ] Worker send still uses generation gate immediately before enqueue.
- [ ] Queue full bumps generation and clears subscriptions instead of silently dropping a middle commit.
- [ ] Teardown cancels projection fanout worker without changing ordinary thread cleanup ordering.
- [ ] Tests cover PM invalidation, queue-full invalidation, ordinary-notification non-blocking behavior, projection-only delivery, cancellation, and runtime path behavior.
- [ ] Verification remains scoped to `codex-app-server` projection paths.
