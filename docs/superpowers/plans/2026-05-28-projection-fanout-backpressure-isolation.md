# Projection Fanout Backpressure Isolation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix projection hidden-race Finding 2 by isolating projection fanout backpressure from ordinary thread notification delivery without further restructuring the upstream ordinary notification path.

**Architecture:** Keep `ThreadScopedOutgoingMessageSender::send_server_notification(...)` in its hook-converged shape: ordinary notification first, then one projection hook. Add a projection-owned facade that materializes projection deliveries, enqueues them into a per-thread bounded fanout queue with `try_send`, owns queue-full invalidation, and centralizes thread cleanup. Worker-side delivery keeps the existing generation gate, with cancellation while waiting for shared outgoing capacity.

**Tech Stack:** Rust, Tokio `mpsc`, `tokio_util::sync::CancellationToken`, `codex-app-server`, existing projection generation gate, focused app-server tests.

---

## Source Of Truth

- Design: `docs/superpowers/specs/2026-05-28-projection-fanout-backpressure-isolation-design.md`
- Issue context: `docs/superpowers/issues/2026-05-19-projection-hidden-race-review.md`
- Upstream baseline for merge-safety: `refs/tags/rust-v0.133.0^{}`

## Scope

This plan fixes only Hidden-race Finding 2:

- projection fanout must not make listener / ordinary notification delivery wait for projection delivery send completion.
- projection fanout must have bounded per-thread queueing.
- queue full invalidates that thread's projection stream instead of silently dropping part of the commit chain.
- thread teardown must cancel fanout workers through a single projection-owned cleanup hook.

Do not include these changes:

- Do not add per-subscription queues.
- Do not add app-server protocol fields or notifications.
- Do not change `thread/projection/event` wire shape.
- Do not rewrite snapshot cut, commit materialization, or projection history cursor logic.
- Do not change ordinary thread subscription state.
- Do not redesign shared outgoing transport QoS or priority scheduling.
- Do not further restructure `ThreadScopedOutgoingMessageSender::send_server_notification(...)`.
- Do not change `send_server_notification_to_connections(...)` broadcast/targeted behavior.

## File Structure

- Modify: `codex-rs/app-server/src/lib.rs`
  - Register the new `projection_fanout` module.
- Modify: `codex-rs/app-server/src/thread_projection.rs`
  - Add `invalidate_thread_projection(...)`.
  - Preserve projection subscriber watcher while clearing subscribers and head.
  - Add focused unit tests for invalidation semantics.
- Create: `codex-rs/app-server/src/projection_fanout.rs`
  - Add `ThreadProjectionFacade`, `ProjectionFanoutManager`, per-thread queue handles, worker lifecycle, cancellation-aware delivery, queue-full invalidation, and focused unit tests.
- Modify: `codex-rs/app-server/src/outgoing_message.rs`
  - Replace the direct `ThreadProjectionManager` field with `ThreadProjectionFacade`.
  - Keep `thread_projection_manager()` as a thin accessor for existing attach/detach callers.
  - Route `send_thread_projection_notification(...)` through facade enqueue.
  - Remove direct delivery-loop ownership from `outgoing_message.rs`.
  - Preserve `send_server_notification(...)` ordinary-first shape.
- Modify: `codex-rs/app-server/src/request_processors/thread_processor.rs`
  - Replace the existing projection manager teardown call with facade cleanup.
- Modify: `codex-rs/app-server/src/request_processors/thread_lifecycle.rs`
  - Replace the existing projection manager teardown call with facade cleanup.
- Modify: `codex-rs/app-server/src/outgoing_message.rs`
  - Add an exact regression proving `send_server_notification(...)` returns after ordinary delivery even when projection delivery is blocked behind shared outgoing capacity.
- Modify: `docs/superpowers/issues/2026-05-19-projection-hidden-race-review.md`
  - After implementation and verification, mark Finding 2 fixed.

## Task 1: Add Projection Invalidation To ThreadProjectionManager

**Files:**
- Modify: `codex-rs/app-server/src/thread_projection.rs`

- [ ] **Step 1: Add failing invalidation tests**

Add these tests inside the existing `#[cfg(test)] mod tests` in `codex-rs/app-server/src/thread_projection.rs`:

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

- [ ] **Step 2: Run focused tests to confirm red**

Run from `codex-rs`:

```bash
cargo test -p codex-app-server invalidate_thread_projection --no-fail-fast
```

Expected before implementation: compile failure naming missing method `invalidate_thread_projection`.

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

Do not call `remove_thread(...)` from this method. Queue full is projection stream invalidation, not thread teardown.

- [ ] **Step 4: Verify PM tests pass**

Run from `codex-rs`:

```bash
cargo test -p codex-app-server invalidate_thread_projection --no-fail-fast
```

Expected: all invalidation tests pass.

- [ ] **Step 5: Commit PM invalidation**

Run from repo root:

```bash
git add codex-rs/app-server/src/thread_projection.rs
git commit -m "fix(app-server): add projection invalidation"
```

Expected: commit includes only `codex-rs/app-server/src/thread_projection.rs`.

## Task 2: Add Projection Fanout Facade And Manager

**Files:**
- Modify: `codex-rs/app-server/src/lib.rs`
- Create: `codex-rs/app-server/src/projection_fanout.rs`

- [ ] **Step 1: Register the module**

Add this module declaration near the existing projection modules in `codex-rs/app-server/src/lib.rs`:

```rust
mod projection_fanout;
```

- [ ] **Step 2: Create the projection fanout module skeleton**

Create `codex-rs/app-server/src/projection_fanout.rs` with this content:

```rust
use std::collections::HashMap;
use std::sync::Arc;

use codex_app_server_protocol::ServerNotification;
use codex_protocol::ThreadId;
use tokio::sync::Mutex;
use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;
use tracing::warn;

use crate::outgoing_message::OutgoingEnvelope;
use crate::outgoing_message::OutgoingMessage;
use crate::thread_projection::ProjectionDelivery;
use crate::thread_projection::ThreadProjectionManager;
use crate::thread_projection_cut::ProjectionHistoryCursor;

pub(crate) const PROJECTION_FANOUT_QUEUE_CAPACITY: usize = 32;

#[derive(Clone)]
pub(crate) struct ThreadProjectionFacade {
    manager: ThreadProjectionManager,
    fanout: ProjectionFanoutManager,
}

impl ThreadProjectionFacade {
    pub(crate) fn new() -> Self {
        let manager = ThreadProjectionManager::new();
        Self {
            manager: manager.clone(),
            fanout: ProjectionFanoutManager::new(manager),
        }
    }

    pub(crate) fn manager(&self) -> ThreadProjectionManager {
        self.manager.clone()
    }

    pub(crate) async fn enqueue_notification(
        &self,
        sender: mpsc::Sender<OutgoingEnvelope>,
        thread_id: ThreadId,
        notification: &ServerNotification,
        projection_history_cursor: Option<ProjectionHistoryCursor>,
    ) {
        let deliveries = if let Some(cursor) = projection_history_cursor {
            self.manager
                .project_notification_at_cursor(thread_id, notification, cursor)
                .await
        } else {
            self.manager
                .project_notification(thread_id, notification)
                .await
        };

        if deliveries.is_empty() {
            return;
        }

        self.fanout.enqueue(sender, thread_id, deliveries).await;
    }

    pub(crate) async fn remove_thread(&self, thread_id: ThreadId) {
        self.fanout.cancel_thread(thread_id).await;
        self.manager.remove_thread(thread_id).await;
    }
}

#[derive(Clone)]
struct ProjectionFanoutManager {
    inner: Arc<Mutex<ProjectionFanoutManagerInner>>,
    manager: ThreadProjectionManager,
}

#[derive(Default)]
struct ProjectionFanoutManagerInner {
    threads: HashMap<ThreadId, ThreadFanoutHandle>,
    next_worker_id: u64,
}

struct ThreadFanoutHandle {
    tx: mpsc::Sender<ProjectionFanoutJob>,
    cancellation: CancellationToken,
    worker_id: u64,
}

struct ProjectionFanoutJob {
    sender: mpsc::Sender<OutgoingEnvelope>,
    deliveries: Vec<ProjectionDelivery>,
}

impl ProjectionFanoutManager {
    fn new(manager: ThreadProjectionManager) -> Self {
        Self {
            inner: Arc::new(Mutex::new(ProjectionFanoutManagerInner::default())),
            manager,
        }
    }

    async fn enqueue(
        &self,
        sender: mpsc::Sender<OutgoingEnvelope>,
        thread_id: ThreadId,
        deliveries: Vec<ProjectionDelivery>,
    ) {
        let handle = self.thread_handle(thread_id).await;
        match handle.tx.try_send(ProjectionFanoutJob { sender, deliveries }) {
            Ok(()) => {}
            Err(mpsc::error::TrySendError::Full(_job)) => {
                warn!("projection fanout queue full; invalidating projection stream for {thread_id}");
                self.manager.invalidate_thread_projection(thread_id).await;
                handle.cancellation.cancel();
                self.remove_handle(thread_id, handle.worker_id).await;
            }
            Err(mpsc::error::TrySendError::Closed(_job)) => {
                warn!("projection fanout worker stopped before delivery for {thread_id}");
                self.remove_handle(thread_id, handle.worker_id).await;
            }
        }
    }

    async fn cancel_thread(&self, thread_id: ThreadId) {
        let handle = self.inner.lock().await.threads.remove(&thread_id);
        if let Some(handle) = handle {
            handle.cancellation.cancel();
        }
    }

    async fn thread_handle(&self, thread_id: ThreadId) -> ThreadFanoutHandle {
        let mut inner = self.inner.lock().await;
        if let Some(handle) = inner.threads.get(&thread_id) {
            return handle.clone();
        }

        let worker_id = inner.next_worker_id;
        inner.next_worker_id = inner.next_worker_id.wrapping_add(1);
        let (tx, rx) = mpsc::channel(PROJECTION_FANOUT_QUEUE_CAPACITY);
        let cancellation = CancellationToken::new();
        let handle = ThreadFanoutHandle {
            tx,
            cancellation: cancellation.clone(),
            worker_id,
        };
        inner.threads.insert(thread_id, handle.clone());

        tokio::spawn(run_projection_fanout_worker(
            self.clone(),
            thread_id,
            worker_id,
            rx,
            cancellation,
        ));

        handle
    }

    async fn remove_handle(&self, thread_id: ThreadId, worker_id: u64) {
        let mut inner = self.inner.lock().await;
        let should_remove = inner
            .threads
            .get(&thread_id)
            .is_some_and(|handle| handle.worker_id == worker_id);
        if should_remove {
            inner.threads.remove(&thread_id);
        }
    }
}

impl Clone for ThreadFanoutHandle {
    fn clone(&self) -> Self {
        Self {
            tx: self.tx.clone(),
            cancellation: self.cancellation.clone(),
            worker_id: self.worker_id,
        }
    }
}

async fn run_projection_fanout_worker(
    manager: ProjectionFanoutManager,
    thread_id: ThreadId,
    worker_id: u64,
    mut rx: mpsc::Receiver<ProjectionFanoutJob>,
    cancellation: CancellationToken,
) {
    loop {
        tokio::select! {
            _ = cancellation.cancelled() => break,
            job = rx.recv() => {
                let Some(job) = job else {
                    break;
                };
                for delivery in job.deliveries {
                    send_projection_delivery_if_current_or_cancelled(
                        &manager.manager,
                        job.sender.clone(),
                        thread_id,
                        delivery,
                        &cancellation,
                    )
                    .await;
                    if cancellation.is_cancelled() {
                        break;
                    }
                }
            }
        }
    }

    manager.remove_handle(thread_id, worker_id).await;
}

async fn send_projection_delivery_if_current_or_cancelled(
    manager: &ThreadProjectionManager,
    sender: mpsc::Sender<OutgoingEnvelope>,
    thread_id: ThreadId,
    delivery: ProjectionDelivery,
    cancellation: &CancellationToken,
) {
    let outgoing_message = OutgoingMessage::AppServerNotification(
        ServerNotification::ThreadProjectionEvent(delivery.notification),
    );
    let permit = tokio::select! {
        permit = sender.reserve() => match permit {
            Ok(permit) => permit,
            Err(err) => {
                warn!("failed to send projection delivery to client: {err:?}");
                return;
            }
        },
        _ = cancellation.cancelled() => return,
    };

    manager
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

- [ ] **Step 3: Compile to expose missing imports or visibility issues**

Run from `codex-rs`:

```bash
cargo test -p codex-app-server projection_fanout --no-fail-fast
```

Expected at this point: compile may fail if the module needs visibility adjustments. Fix only compile errors in `projection_fanout.rs`, `lib.rs`, or `thread_projection.rs`.

- [ ] **Step 4: Commit facade skeleton**

Run from repo root:

```bash
git add codex-rs/app-server/src/lib.rs codex-rs/app-server/src/projection_fanout.rs
git commit -m "feat(app-server): add projection fanout facade"
```

Expected: commit creates `projection_fanout.rs` and registers the module.

## Task 3: Add Fanout Manager Unit Tests

**Files:**
- Modify: `codex-rs/app-server/src/projection_fanout.rs`

- [ ] **Step 1: Add tests for nonblocking enqueue and ordered delivery**

Append this test module to `codex-rs/app-server/src/projection_fanout.rs`:

```rust
#[cfg(test)]
mod tests {
    use std::time::Duration;

    use codex_app_server_protocol::ThreadProjectionEvent;
    use codex_app_server_protocol::Turn;
    use codex_app_server_protocol::TurnStartedNotification;
    use codex_app_server_protocol::TurnStatus;
    use pretty_assertions::assert_eq;
    use tokio::time::timeout;

    use super::*;
    use crate::outgoing_message::ConnectionId;

    fn turn_started_notification(thread_id: ThreadId, turn_id: &str) -> ServerNotification {
        ServerNotification::TurnStarted(TurnStartedNotification {
            thread_id: thread_id.to_string(),
            turn: Turn {
                id: turn_id.to_string(),
                items: Vec::new(),
                items_view: codex_app_server_protocol::TurnItemsView::Full,
                status: TurnStatus::InProgress,
                error: None,
                started_at: Some(1),
                completed_at: None,
                duration_ms: None,
            },
        })
    }

    async fn attach_projection(
        facade: &ThreadProjectionFacade,
        thread_id: ThreadId,
        connection_id: ConnectionId,
    ) {
        let generation = facade.manager.capture_current_generation(thread_id).await;
        let attach = facade
            .manager
            .attach_if_generation_matches(thread_id, connection_id, generation)
            .await;
        let crate::thread_projection::ProjectionAttachAttempt::Attached(_) = attach else {
            panic!("current generation should attach");
        };
    }

    #[tokio::test]
    async fn enqueue_notification_returns_before_worker_has_outgoing_capacity() {
        let facade = ThreadProjectionFacade::new();
        let thread_id = ThreadId::new();
        attach_projection(&facade, thread_id, ConnectionId(7)).await;

        let (tx, mut rx) = mpsc::channel::<OutgoingEnvelope>(1);
        tx.send(OutgoingEnvelope::Broadcast {
            message: OutgoingMessage::AppServerNotification(ServerNotification::ConfigWarning(
                codex_app_server_protocol::ConfigWarningNotification {
                    summary: "hold capacity".to_string(),
                    details: None,
                    path: None,
                    range: None,
                },
            )),
        })
        .await
        .expect("capacity holder should enqueue");

        timeout(
            Duration::from_secs(1),
            facade.enqueue_notification(
                tx.clone(),
                thread_id,
                &turn_started_notification(thread_id, "turn-1"),
                None,
            ),
        )
        .await
        .expect("enqueue should not wait for outgoing capacity");

        let _capacity_holder = rx.recv().await.expect("capacity holder should be present");
        let envelope = timeout(Duration::from_secs(1), rx.recv())
            .await
            .expect("worker should send after capacity is released")
            .expect("projection envelope should exist");
        let OutgoingEnvelope::ToConnection { connection_id, message, .. } = envelope else {
            panic!("expected targeted projection envelope");
        };
        assert_eq!(ConnectionId(7), connection_id);
        assert!(matches!(
            message,
            OutgoingMessage::AppServerNotification(ServerNotification::ThreadProjectionEvent(_))
        ));
    }

    #[tokio::test]
    async fn fanout_worker_preserves_thread_job_order() {
        let facade = ThreadProjectionFacade::new();
        let thread_id = ThreadId::new();
        attach_projection(&facade, thread_id, ConnectionId(3)).await;
        let (tx, mut rx) = mpsc::channel::<OutgoingEnvelope>(8);

        facade
            .enqueue_notification(
                tx.clone(),
                thread_id,
                &turn_started_notification(thread_id, "turn-1"),
                None,
            )
            .await;
        facade
            .enqueue_notification(
                tx,
                thread_id,
                &turn_started_notification(thread_id, "turn-2"),
                None,
            )
            .await;

        let first = timeout(Duration::from_secs(1), rx.recv())
            .await
            .expect("first projection envelope should arrive")
            .expect("first projection envelope should exist");
        let second = timeout(Duration::from_secs(1), rx.recv())
            .await
            .expect("second projection envelope should arrive")
            .expect("second projection envelope should exist");

        let OutgoingEnvelope::ToConnection {
            message: OutgoingMessage::AppServerNotification(
                ServerNotification::ThreadProjectionEvent(first_notification),
            ),
            ..
        } = first else {
            panic!("expected first projection event");
        };
        let OutgoingEnvelope::ToConnection {
            message: OutgoingMessage::AppServerNotification(
                ServerNotification::ThreadProjectionEvent(second_notification),
            ),
            ..
        } = second else {
            panic!("expected second projection event");
        };

        assert!(matches!(
            first_notification.event,
            ThreadProjectionEvent::TurnStarted { .. }
        ));
        assert_eq!(
            first_notification.commit_id,
            second_notification.parent_commit_id.expect("second event should link to first")
        );
    }
}
```

- [ ] **Step 2: Run tests and address compiler diagnostics**

Run from `codex-rs`:

```bash
cargo test -p codex-app-server projection_fanout --no-fail-fast
```

Expected: tests compile and pass. If the compiler reports an import, visibility, or type mismatch in the new module, adjust only `projection_fanout.rs`, `lib.rs`, or `thread_projection.rs` to match the actual local API.

- [ ] **Step 3: Commit fanout manager tests**

Run from repo root:

```bash
git add codex-rs/app-server/src/projection_fanout.rs
git commit -m "test(app-server): cover projection fanout queue"
```

Expected: commit touches only `projection_fanout.rs`.

## Task 4: Add Queue-Full Invalidation Tests

**Files:**
- Modify: `codex-rs/app-server/src/projection_fanout.rs`

- [ ] **Step 1: Add a test-only capacity constructor**

Inside `impl ProjectionFanoutManager`, add this test-only constructor:

```rust
#[cfg(test)]
fn new_with_capacity(manager: ThreadProjectionManager, capacity: usize) -> Self {
    Self {
        inner: Arc::new(Mutex::new(ProjectionFanoutManagerInner {
            capacity,
            ..ProjectionFanoutManagerInner::default()
        })),
        manager,
    }
}
```

Then replace `#[derive(Default)]` on `ProjectionFanoutManagerInner` with an explicit `Default` implementation and store capacity:

```rust
struct ProjectionFanoutManagerInner {
    threads: HashMap<ThreadId, ThreadFanoutHandle>,
    next_worker_id: u64,
    capacity: usize,
}

impl Default for ProjectionFanoutManagerInner {
    fn default() -> Self {
        Self {
            threads: HashMap::new(),
            next_worker_id: 0,
            capacity: PROJECTION_FANOUT_QUEUE_CAPACITY,
        }
    }
}
```

Update `thread_handle(...)` to use `inner.capacity`:

```rust
let capacity = inner.capacity;
let (tx, rx) = mpsc::channel(capacity);
```

- [ ] **Step 2: Add a queue-full invalidation test**

Add this test to the `projection_fanout` test module:

```rust
#[tokio::test]
async fn queue_full_invalidates_generation_and_drops_current_job() {
    let manager = ThreadProjectionManager::new();
    let fanout = ProjectionFanoutManager::new_with_capacity(manager.clone(), 1);
    let facade = ThreadProjectionFacade {
        manager: manager.clone(),
        fanout,
    };
    let thread_id = ThreadId::new();
    let connection_id = ConnectionId(9);
    attach_projection(&facade, thread_id, connection_id).await;
    let generation = manager.capture_current_generation(thread_id).await;

    let (tx, mut rx) = mpsc::channel::<OutgoingEnvelope>(1);
    tx.send(OutgoingEnvelope::Broadcast {
        message: OutgoingMessage::AppServerNotification(ServerNotification::ConfigWarning(
            codex_app_server_protocol::ConfigWarningNotification {
                summary: "hold capacity".to_string(),
                details: None,
                path: None,
                range: None,
            },
        )),
    })
    .await
    .expect("capacity holder should enqueue");

    facade
        .enqueue_notification(
            tx.clone(),
            thread_id,
            &turn_started_notification(thread_id, "turn-1"),
            None,
        )
        .await;
    facade
        .enqueue_notification(
            tx,
            thread_id,
            &turn_started_notification(thread_id, "turn-2"),
            None,
        )
        .await;

    assert!(!manager.generation_matches(thread_id, generation).await);
    assert_eq!(Vec::<ThreadId>::new(), manager.remove_connection(connection_id).await);

    let _capacity_holder = rx.recv().await.expect("capacity holder should exist");
    assert!(
        timeout(Duration::from_millis(50), rx.recv()).await.is_err(),
        "old generation projection delivery should not enqueue after invalidation"
    );
}
```

- [ ] **Step 3: Run queue-full tests**

Run from `codex-rs`:

```bash
cargo test -p codex-app-server queue_full_invalidates_generation_and_drops_current_job --no-fail-fast
```

Expected: test passes, proving generation is invalidated before any blocked old delivery can enqueue.

- [ ] **Step 4: Commit queue-full behavior**

Run from repo root:

```bash
git add codex-rs/app-server/src/projection_fanout.rs
git commit -m "test(app-server): cover projection fanout overflow"
```

Expected: commit touches only `projection_fanout.rs`.

## Task 5: Route Outgoing Projection Hook Through Facade

**Files:**
- Modify: `codex-rs/app-server/src/outgoing_message.rs`
- Modify: `codex-rs/app-server/src/projection_fanout.rs`

- [ ] **Step 1: Replace direct manager field with facade field**

In `codex-rs/app-server/src/outgoing_message.rs`, replace imports:

```rust
use crate::projection_fanout::ThreadProjectionFacade;
use crate::thread_projection::ThreadProjectionManager;
use crate::thread_projection_cut::ProjectionHistoryCursor;
```

Remove the `ProjectionDelivery` import from `outgoing_message.rs` once direct delivery helper is moved or no longer referenced outside tests.

Change the field in `OutgoingMessageSender`:

```rust
thread_projection_facade: ThreadProjectionFacade,
```

Update `OutgoingMessageSender::new(...)`:

```rust
thread_projection_facade: ThreadProjectionFacade::new(),
```

Update `thread_projection_manager()`:

```rust
pub(crate) fn thread_projection_manager(&self) -> ThreadProjectionManager {
    self.thread_projection_facade.manager()
}
```

Add this cleanup accessor for teardown call sites:

```rust
pub(crate) async fn remove_thread_projection(&self, thread_id: ThreadId) {
    self.thread_projection_facade.remove_thread(thread_id).await;
}
```

- [ ] **Step 2: Route `send_thread_projection_notification(...)` through facade**

Replace the body of `send_thread_projection_notification(...)` with:

```rust
async fn send_thread_projection_notification(
    &self,
    thread_id: ThreadId,
    notification: &ServerNotification,
    projection_history_cursor: Option<ProjectionHistoryCursor>,
) {
    self.thread_projection_facade
        .enqueue_notification(
            self.sender.clone(),
            thread_id,
            notification,
            projection_history_cursor,
        )
        .await;
}
```

Do not change `ThreadScopedOutgoingMessageSender::send_server_notification(...)`.

- [ ] **Step 3: Remove or privatize direct projection delivery helper**

If no production code or tests in `outgoing_message.rs` still need `send_projection_delivery_if_current(...)`, delete it from `outgoing_message.rs`.

If a test still needs direct generation-gate coverage, move that coverage to `projection_fanout.rs` by asserting the worker drops stale delivery after `remove_thread(...)`.

Do not keep two production delivery paths.

- [ ] **Step 4: Run outgoing tests**

Run from `codex-rs`:

```bash
cargo test -p codex-app-server outgoing_message --no-fail-fast
```

Expected: existing outgoing tests pass. `thread_scoped_notification_sends_ordinary_before_projection` still proves ordinary notification is first.

- [ ] **Step 5: Run projection fanout tests**

Run from `codex-rs`:

```bash
cargo test -p codex-app-server projection_fanout --no-fail-fast
```

Expected: fanout tests pass.

- [ ] **Step 6: Commit outgoing hook routing**

Run from repo root:

```bash
git add codex-rs/app-server/src/outgoing_message.rs codex-rs/app-server/src/projection_fanout.rs
git commit -m "fix(app-server): route projection hook through fanout"
```

Expected: commit does not touch `send_server_notification_to_connections(...)` and does not further reorder `send_server_notification(...)`.

## Task 6: Centralize Thread Projection Cleanup Through Facade

**Files:**
- Modify: `codex-rs/app-server/src/request_processors/thread_processor.rs`
- Modify: `codex-rs/app-server/src/request_processors/thread_lifecycle.rs`
- Modify: `codex-rs/app-server/src/projection_fanout.rs`
- Modify: `codex-rs/app-server/src/outgoing_message.rs`

- [ ] **Step 1: Replace teardown calls**

In `codex-rs/app-server/src/request_processors/thread_processor.rs`, replace:

```rust
self.outgoing
    .thread_projection_manager()
    .remove_thread(thread_id)
    .await;
```

with:

```rust
self.outgoing.remove_thread_projection(thread_id).await;
```

In `codex-rs/app-server/src/request_processors/thread_lifecycle.rs`, replace:

```rust
outgoing
    .thread_projection_manager()
    .remove_thread(thread_id)
    .await;
```

with:

```rust
outgoing.remove_thread_projection(thread_id).await;
```

- [ ] **Step 2: Add facade cleanup test**

Add this test to `projection_fanout.rs` test module:

```rust
#[tokio::test]
async fn remove_thread_cancels_worker_and_invalidates_projection_state() {
    let facade = ThreadProjectionFacade::new();
    let thread_id = ThreadId::new();
    let connection_id = ConnectionId(5);
    attach_projection(&facade, thread_id, connection_id).await;
    let generation = facade.manager.capture_current_generation(thread_id).await;

    let (tx, mut rx) = mpsc::channel::<OutgoingEnvelope>(1);
    tx.send(OutgoingEnvelope::Broadcast {
        message: OutgoingMessage::AppServerNotification(ServerNotification::ConfigWarning(
            codex_app_server_protocol::ConfigWarningNotification {
                summary: "hold capacity".to_string(),
                details: None,
                path: None,
                range: None,
            },
        )),
    })
    .await
    .expect("capacity holder should enqueue");

    facade
        .enqueue_notification(
            tx,
            thread_id,
            &turn_started_notification(thread_id, "turn-1"),
            None,
        )
        .await;
    facade.remove_thread(thread_id).await;

    assert!(!facade.manager.generation_matches(thread_id, generation).await);
    assert_eq!(Vec::<ThreadId>::new(), facade.manager.remove_connection(connection_id).await);

    let _capacity_holder = rx.recv().await.expect("capacity holder should exist");
    assert!(
        timeout(Duration::from_millis(50), rx.recv()).await.is_err(),
        "worker should be cancelled before sending blocked projection delivery"
    );
}
```

- [ ] **Step 3: Run cleanup tests**

Run from `codex-rs`:

```bash
cargo test -p codex-app-server remove_thread_cancels_worker_and_invalidates_projection_state --no-fail-fast
```

Expected: test passes.

- [ ] **Step 4: Commit cleanup routing**

Run from repo root:

```bash
git add codex-rs/app-server/src/request_processors/thread_processor.rs codex-rs/app-server/src/request_processors/thread_lifecycle.rs codex-rs/app-server/src/projection_fanout.rs codex-rs/app-server/src/outgoing_message.rs
git commit -m "fix(app-server): centralize projection cleanup"
```

Expected: lifecycle/processor files contain one projection-owned cleanup call each, not fanout-specific logic.

## Task 7: Add Outgoing Backpressure Regression

**Files:**
- Modify: `codex-rs/app-server/src/outgoing_message.rs`

- [ ] **Step 1: Add outgoing regression test**

Add this test inside the existing `#[cfg(test)] mod tests` in `codex-rs/app-server/src/outgoing_message.rs`:

```rust
#[tokio::test]
async fn thread_projection_fanout_backpressure_does_not_block_ordinary_notification() {
    let (tx, mut rx) = mpsc::channel::<OutgoingEnvelope>(1);
    let outgoing = Arc::new(OutgoingMessageSender::new(
        tx,
        codex_analytics::AnalyticsEventsClient::disabled(),
    ));
    let thread_id = ThreadId::new();
    let ordinary_connection_id = ConnectionId(1);
    let projection_connection_id = ConnectionId(2);
    let attach = outgoing
        .thread_projection_manager()
        .attach(thread_id, projection_connection_id)
        .await;
    let thread_outgoing = ThreadScopedOutgoingMessageSender::new(
        outgoing,
        vec![ordinary_connection_id],
        thread_id,
    );

    let send_task = tokio::spawn(async move {
        thread_outgoing
            .send_server_notification(turn_started_notification(thread_id, "turn-1"))
            .await;
    });

    let ordinary_envelope = timeout(Duration::from_secs(1), rx.recv())
        .await
        .expect("ordinary notification should not wait for blocked projection delivery")
        .expect("ordinary envelope should exist");
    let OutgoingEnvelope::ToConnection {
        connection_id,
        message,
        ..
    } = ordinary_envelope
    else {
        panic!("expected targeted ordinary notification envelope");
    };
    assert_eq!(ordinary_connection_id, connection_id);
    let OutgoingMessage::AppServerNotification(ServerNotification::TurnStarted(notification)) =
        message
    else {
        panic!("expected ordinary turn started notification");
    };
    assert_eq!(thread_id.to_string(), notification.thread_id);

    timeout(Duration::from_secs(1), send_task)
        .await
        .expect("send_server_notification should return without waiting for projection delivery")
        .expect("send task should not panic");

    let projection_envelope = timeout(Duration::from_secs(1), rx.recv())
        .await
        .expect("projection envelope should arrive after ordinary capacity is released")
        .expect("projection envelope should exist");
    let OutgoingEnvelope::ToConnection {
        connection_id,
        message,
        ..
    } = projection_envelope
    else {
        panic!("expected targeted projection notification envelope");
    };
    assert_eq!(projection_connection_id, connection_id);
    let OutgoingMessage::AppServerNotification(ServerNotification::ThreadProjectionEvent(
        notification,
    )) = message
    else {
        panic!("expected thread projection event notification");
    };
    assert_eq!(thread_id.to_string(), notification.thread_id);
    assert_eq!(attach.subscription_id, notification.subscription_id);
    assert!(matches!(
        notification.event,
        ThreadProjectionEvent::TurnStarted { .. }
    ));
}
```

This test must fail before Task 5 because `send_server_notification(...)` still waits for direct projection delivery send completion after ordinary delivery fills the one-slot outgoing queue.

- [ ] **Step 2: Run outgoing regression**

Run from `codex-rs`:

```bash
cargo test -p codex-app-server thread_projection_fanout_backpressure_does_not_block_ordinary_notification --no-fail-fast
```

Expected: test passes and fails if `send_thread_projection_notification(...)` awaits projection delivery send completion.

- [ ] **Step 3: Commit outgoing regression**

Run from repo root:

```bash
git add codex-rs/app-server/src/outgoing_message.rs
git commit -m "test(app-server): cover projection fanout backpressure"
```

Expected: commit touches only `codex-rs/app-server/src/outgoing_message.rs`.

## Task 8: Update Issue Status And Run Focused Verification

**Files:**
- Modify: `docs/superpowers/issues/2026-05-19-projection-hidden-race-review.md`

- [ ] **Step 1: Update issue status**

Before editing, collect the implementation evidence:

```bash
git log --oneline --grep='route projection hook through fanout' -1
git log --oneline --grep='centralize projection cleanup' -1
git log --oneline --grep='cover projection fanout backpressure' -1
```

Update the top status section so Finding 2 is marked fixed and cites those exact commit hashes. Also update the Finding 2 section's `状态：仍开放。` paragraph to `状态：已修复。` with the same evidence.

- [ ] **Step 2: Run focused verification**

Run from `codex-rs`:

```bash
cargo test -p codex-app-server projection_fanout --no-fail-fast
cargo test -p codex-app-server thread_projection --no-fail-fast
cargo test -p codex-app-server outgoing_message --no-fail-fast
cargo test -p codex-app-server thread_projection_fanout_backpressure_does_not_block_ordinary_notification --no-fail-fast
just fmt
just fix -p codex-app-server
git diff --check
git status --short
```

Expected:

- All focused tests pass.
- `just fmt` and `just fix -p codex-app-server` complete successfully.
- `git diff --check` produces no output.
- `git status --short` shows only intended files.

Do not run full workspace tests unless this implementation unexpectedly touches common, core, protocol, or dependency files.

- [ ] **Step 3: Commit issue status**

Run from repo root:

```bash
git add docs/superpowers/issues/2026-05-19-projection-hidden-race-review.md
git commit -m "docs(app-server): mark projection fanout isolation fixed"
```

Expected: commit touches only the issue doc.

## Final Review Checklist

- `ThreadScopedOutgoingMessageSender::send_server_notification(...)` still has the hook-converged shape: analytics, ordinary send if subscribers exist, projection hook.
- `send_server_notification_to_connections(...)` is unchanged.
- `outgoing_message.rs` does not contain fanout worker map, queue overflow handling, or cancellation logic.
- fanout queue full invalidates/bump generation before cancelling worker.
- thread teardown calls exactly one projection cleanup hook.
- no app-server protocol schema or generated TypeScript files changed.
- no lockfiles changed.
- no unrelated formatting or upstream-path refactors are included.
