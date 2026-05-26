# Projection Delivery Generation Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix Atomicity Finding 3 by preventing projection events materialized before teardown from entering the outgoing queue after teardown has invalidated the projection head.

**Architecture:** Reuse `ThreadProjectionManager`'s existing `ProjectionGeneration`. Each `ProjectionDelivery` records the generation captured while PM materializes the event; `OutgoingMessageSender` waits for queue capacity, checks that generation immediately before enqueue, then synchronously sends into the reserved slot.

**Tech Stack:** Rust, Tokio tests, `codex-app-server`, existing projection runtime harness, `pretty_assertions`.

---

## Source Of Truth

- Design: `docs/superpowers/specs/2026-05-26-projection-delivery-generation-gate-design.md`
- Issue context: `docs/superpowers/issues/2026-05-19-projection-atomicity-review.md`

## Scope

This plan fixes only Atomicity Finding 3:

- teardown before projection delivery enqueue must invalidate the old delivery.
- generation check and enqueue must have no `await` between them.
- already-enqueued delivery is considered linearized before later teardown.

Do not include these changes:

- Do not solve projection fanout backpressure.
- Do not introduce a projection delivery queue.
- Do not reorder ordinary thread notification and projection notification.
- Do not change app-server protocol schemas or generated TypeScript.
- Do not modify `ThreadStateManager` ordinary subscription state.
- Do not introduce a new subscription epoch.

## File Structure

- Modify: `codex-rs/app-server/src/thread_projection.rs`
  - Add `ProjectionDelivery.generation`.
  - Capture generation while materializing projection delivery.
  - Add a non-mutating `generation_matches` API.
  - Add focused PM unit tests.
- Modify: `codex-rs/app-server/src/outgoing_message.rs`
  - Add projection-only guarded enqueue helper using `mpsc::Sender::reserve`.
  - Route projection deliveries through the helper.
  - Add outgoing tests for stale delivery drop and current delivery enqueue.
- Modify: `codex-rs/app-server/src/thread_projection_runtime.rs`
  - Add production-path regression for teardown while delivery waits for outgoing queue capacity.
- Modify: `docs/superpowers/issues/2026-05-19-projection-atomicity-review.md`
  - After implementation and verification, mark Finding 3 fixed and reference the generation gate.

## Task 1: Add Delivery Generation And PM Match API

**Files:**
- Modify: `codex-rs/app-server/src/thread_projection.rs`

- [ ] **Step 1: Add failing PM unit tests**

Add these tests inside the existing `#[cfg(test)] mod tests` in `codex-rs/app-server/src/thread_projection.rs`.

```rust
#[tokio::test]
async fn projection_delivery_carries_current_generation() {
    let manager = ThreadProjectionManager::new();
    let thread_id = ThreadId::new();
    let connection_id = ConnectionId(1);
    let generation = manager.capture_current_generation(thread_id).await;

    let attach = manager
        .attach_if_generation_matches(thread_id, connection_id, generation)
        .await;
    let ProjectionAttachAttempt::Attached(_) = attach else {
        panic!("current generation should attach");
    };

    let deliveries = manager
        .project_notification(thread_id, &turn_started_notification(thread_id, "turn-1"))
        .await;

    assert_eq!(deliveries.len(), 1);
    assert_eq!(deliveries[0].generation, generation);
    assert!(manager.generation_matches(thread_id, generation).await);
}

#[tokio::test]
async fn remove_thread_invalidates_materialized_delivery_generation() {
    let manager = ThreadProjectionManager::new();
    let thread_id = ThreadId::new();
    let connection_id = ConnectionId(1);
    let generation = manager.capture_current_generation(thread_id).await;

    let attach = manager
        .attach_if_generation_matches(thread_id, connection_id, generation)
        .await;
    let ProjectionAttachAttempt::Attached(_) = attach else {
        panic!("current generation should attach");
    };

    let deliveries = manager
        .project_notification(thread_id, &turn_started_notification(thread_id, "turn-1"))
        .await;
    let delivery_generation = deliveries[0].generation;

    manager.remove_thread(thread_id).await;

    assert!(!manager.generation_matches(thread_id, delivery_generation).await);
    assert!(!manager.has_thread_entry(thread_id).await);
}

#[tokio::test]
async fn generation_match_for_unknown_thread_does_not_create_entry() {
    let manager = ThreadProjectionManager::new();
    let thread_id = ThreadId::new();
    let generation = ProjectionGeneration::initial();

    assert!(!manager.generation_matches(thread_id, generation).await);
    assert!(!manager.has_thread_entry(thread_id).await);
}
```

Expected before implementation: compile fails because `ProjectionDelivery.generation` and
`ThreadProjectionManager::generation_matches` do not exist.

- [ ] **Step 2: Run the focused PM tests to confirm red**

Run from `codex-rs`:

```bash
cargo test -p codex-app-server projection_delivery_carries_current_generation
cargo test -p codex-app-server remove_thread_invalidates_materialized_delivery_generation
cargo test -p codex-app-server generation_match_for_unknown_thread_does_not_create_entry
```

Expected before implementation: compile failure naming the missing field or method.

- [ ] **Step 3: Add generation to `ProjectionDelivery`**

Update `ProjectionDelivery` in `codex-rs/app-server/src/thread_projection.rs`:

```rust
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct ProjectionDelivery {
    pub(crate) connection_id: ConnectionId,
    pub(crate) generation: ProjectionGeneration,
    pub(crate) notification: ThreadProjectionEventNotification,
}
```

- [ ] **Step 4: Capture generation while materializing delivery**

Update `project_notification_at_cursor` so generation is captured under the same PM lock as head advancement:

```rust
pub(crate) async fn project_notification_at_cursor(
    &self,
    thread_id: ThreadId,
    notification: &ServerNotification,
    history_cursor: ProjectionHistoryCursor,
) -> Vec<ProjectionDelivery> {
    let mut inner = self.inner.lock().await;
    let generation = inner.capture_generation(thread_id);
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
            generation,
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

Keep the `projection_event_from_notification` early return in `project_notification` unchanged so non-projectable notifications do not create projection entries.

- [ ] **Step 5: Add non-mutating generation match API**

Add this method to `impl ThreadProjectionManager`:

```rust
pub(crate) async fn generation_matches(
    &self,
    thread_id: ThreadId,
    generation: ProjectionGeneration,
) -> bool {
    self.inner.lock().await.current_generation(thread_id) == Some(generation)
}
```

This must call `current_generation`, not `capture_generation`, so unknown threads remain unknown.

- [ ] **Step 6: Verify PM tests pass**

Run from `codex-rs`:

```bash
cargo test -p codex-app-server projection_delivery_carries_current_generation
cargo test -p codex-app-server remove_thread_invalidates_materialized_delivery_generation
cargo test -p codex-app-server generation_match_for_unknown_thread_does_not_create_entry
```

Expected: all three tests pass.

## Task 2: Add Guarded Projection Delivery Enqueue

**Files:**
- Modify: `codex-rs/app-server/src/outgoing_message.rs`

- [ ] **Step 1: Add failing outgoing enqueue tests**

Add these tests inside the existing `#[cfg(test)] mod tests` in `codex-rs/app-server/src/outgoing_message.rs`.

```rust
#[tokio::test]
async fn stale_projection_delivery_waiting_for_capacity_is_dropped() {
    let (tx, mut rx) = mpsc::channel::<OutgoingEnvelope>(1);
    tx.send(OutgoingEnvelope::Broadcast {
        message: OutgoingMessage::AppServerNotification(ServerNotification::ConfigWarning(
            ConfigWarningNotification {
                message: "hold capacity".to_string(),
            },
        )),
    })
    .await
    .expect("capacity holder should enqueue");

    let outgoing = Arc::new(OutgoingMessageSender::new(
        tx,
        codex_analytics::AnalyticsEventsClient::disabled(),
    ));
    let thread_id = ThreadId::new();
    let connection_id = ConnectionId(7);
    let generation = outgoing
        .thread_projection_manager()
        .capture_current_generation(thread_id)
        .await;
    let attach = outgoing
        .thread_projection_manager()
        .attach_if_generation_matches(thread_id, connection_id, generation)
        .await;
    let ProjectionAttachAttempt::Attached(_) = attach else {
        panic!("current generation should attach");
    };
    let delivery = outgoing
        .thread_projection_manager()
        .project_notification(thread_id, &turn_started_notification(thread_id, "turn-1"))
        .await
        .pop()
        .expect("projection subscriber should receive delivery");

    let send_task = tokio::spawn({
        let outgoing = outgoing.clone();
        async move {
            outgoing
                .send_projection_delivery_if_current(thread_id, delivery)
                .await;
        }
    });
    tokio::task::yield_now().await;

    outgoing.thread_projection_manager().remove_thread(thread_id).await;
    let _capacity_holder = rx.recv().await.expect("capacity holder should be present");

    timeout(Duration::from_secs(1), send_task)
        .await
        .expect("send task should finish")
        .expect("send task should not panic");
    assert!(
        timeout(Duration::from_millis(50), rx.recv()).await.is_err(),
        "stale projection delivery should not enqueue"
    );
}

#[tokio::test]
async fn current_projection_delivery_enqueues_after_capacity_is_available() {
    let (tx, mut rx) = mpsc::channel::<OutgoingEnvelope>(1);
    tx.send(OutgoingEnvelope::Broadcast {
        message: OutgoingMessage::AppServerNotification(ServerNotification::ConfigWarning(
            ConfigWarningNotification {
                message: "hold capacity".to_string(),
            },
        )),
    })
    .await
    .expect("capacity holder should enqueue");

    let outgoing = Arc::new(OutgoingMessageSender::new(
        tx,
        codex_analytics::AnalyticsEventsClient::disabled(),
    ));
    let thread_id = ThreadId::new();
    let connection_id = ConnectionId(7);
    let generation = outgoing
        .thread_projection_manager()
        .capture_current_generation(thread_id)
        .await;
    let attach = outgoing
        .thread_projection_manager()
        .attach_if_generation_matches(thread_id, connection_id, generation)
        .await;
    let ProjectionAttachAttempt::Attached(_) = attach else {
        panic!("current generation should attach");
    };
    let delivery = outgoing
        .thread_projection_manager()
        .project_notification(thread_id, &turn_started_notification(thread_id, "turn-1"))
        .await
        .pop()
        .expect("projection subscriber should receive delivery");

    let send_task = tokio::spawn({
        let outgoing = outgoing.clone();
        async move {
            outgoing
                .send_projection_delivery_if_current(thread_id, delivery)
                .await;
        }
    });
    tokio::task::yield_now().await;

    let _capacity_holder = rx.recv().await.expect("capacity holder should be present");
    timeout(Duration::from_secs(1), send_task)
        .await
        .expect("send task should finish")
        .expect("send task should not panic");

    let envelope = timeout(Duration::from_secs(1), rx.recv())
        .await
        .expect("projection delivery should enqueue")
        .expect("channel should remain open");
    let OutgoingEnvelope::ToConnection {
        connection_id: delivered_connection_id,
        message,
        write_complete_tx,
    } = envelope
    else {
        panic!("expected targeted projection delivery");
    };
    assert_eq!(delivered_connection_id, connection_id);
    assert!(write_complete_tx.is_none());
    assert!(matches!(
        message,
        OutgoingMessage::AppServerNotification(ServerNotification::ThreadProjectionEvent(_))
    ));
}
```

Add missing imports in the test module as needed:

```rust
use std::sync::Arc;
use codex_app_server_protocol::ConfigWarningNotification;
use crate::thread_projection::ProjectionAttachAttempt;
```

If `outgoing_message.rs` does not already have a local turn notification helper, add this helper
inside its test module:

```rust
fn turn_started_notification(thread_id: ThreadId, turn_id: &str) -> ServerNotification {
    ServerNotification::TurnStarted(TurnStartedNotification {
        thread_id: thread_id.to_string(),
        turn: Turn {
            id: turn_id.to_string(),
            items: Vec::new(),
            items_view: TurnItemsView::Full,
            status: TurnStatus::InProgress,
            error: None,
            started_at: Some(1),
            completed_at: None,
            duration_ms: None,
        },
    })
}
```

Expected before implementation: compile failure because `send_projection_delivery_if_current`
does not exist.

- [ ] **Step 2: Run the focused outgoing tests to confirm red**

Run from `codex-rs`:

```bash
cargo test -p codex-app-server stale_projection_delivery_waiting_for_capacity_is_dropped
cargo test -p codex-app-server current_projection_delivery_enqueues_after_capacity_is_available
```

Expected before implementation: compile failure naming the missing helper.

- [ ] **Step 3: Add guarded enqueue helper**

Add this method to `impl OutgoingMessageSender` in `codex-rs/app-server/src/outgoing_message.rs`:

```rust
pub(crate) async fn send_projection_delivery_if_current(
    &self,
    thread_id: ThreadId,
    delivery: ProjectionDelivery,
) {
    let outgoing_message = OutgoingMessage::AppServerNotification(
        ServerNotification::ThreadProjectionEvent(delivery.notification),
    );
    let permit = match self.sender.reserve().await {
        Ok(permit) => permit,
        Err(err) => {
            warn!("failed to send projection delivery to client: {err:?}");
            return;
        }
    };

    if !self
        .thread_projection_manager
        .generation_matches(thread_id, delivery.generation)
        .await
    {
        return;
    }

    permit.send(OutgoingEnvelope::ToConnection {
        connection_id: delivery.connection_id,
        message: outgoing_message,
        write_complete_tx: None,
    });
}
```

Add this import near the other crate imports:

```rust
use crate::thread_projection::ProjectionDelivery;
```

This method intentionally waits for queue capacity before checking generation. There must be no
`await` between `generation_matches(...).await` and `permit.send(...)`.

- [ ] **Step 4: Verify outgoing tests pass**

Run from `codex-rs`:

```bash
cargo test -p codex-app-server stale_projection_delivery_waiting_for_capacity_is_dropped
cargo test -p codex-app-server current_projection_delivery_enqueues_after_capacity_is_available
```

Expected: both tests pass.

## Task 3: Route Projection Fanout Through The Guarded Enqueue

**Files:**
- Modify: `codex-rs/app-server/src/outgoing_message.rs`
- Modify: `codex-rs/app-server/src/thread_projection_runtime.rs`

- [ ] **Step 1: Add runtime regression for teardown while delivery waits for queue capacity**

Add this test inside the existing `#[cfg(test)] mod tests` in `codex-rs/app-server/src/thread_projection_runtime.rs`.

```rust
#[tokio::test]
async fn projection_delivery_waiting_for_queue_capacity_is_dropped_after_thread_teardown()
-> anyhow::Result<()> {
    let mut harness = ProjectionAttachHarness::new().await?;
    harness.handle_attach().await;
    let _attach_response = harness.recv_attach_response().await?;

    // Fill the bounded outgoing queue so projection delivery fanout must wait
    // before it can enqueue.
    for index in 0..4 {
        harness
            .outgoing
            .send_server_notification(ServerNotification::ConfigWarning(
                ConfigWarningNotification {
                    message: format!("hold capacity {index}"),
                },
            ))
            .await;
    }

    let outgoing = harness.outgoing.clone();
    let thread_id = harness.thread_id();
    let send_task = tokio::spawn(async move {
        let sender = ThreadScopedOutgoingMessageSender::new(
            outgoing,
            vec![ConnectionId(99)],
            thread_id,
        );
        sender
            .send_server_notification(turn_started_notification(thread_id))
            .await;
    });
    tokio::task::yield_now().await;

    harness.remove_thread().await;

    for _ in 0..4 {
        let _ = harness
            .outgoing_rx
            .recv()
            .await
            .expect("capacity holder should be present");
    }

    timeout(Duration::from_secs(1), send_task)
        .await
        .expect("send task should finish")
        .expect("send task should not panic");

    while let Ok(Some(envelope)) = timeout(Duration::from_millis(50), harness.outgoing_rx.recv()).await
    {
        if let OutgoingEnvelope::ToConnection {
            message:
                OutgoingMessage::AppServerNotification(
                    ServerNotification::ThreadProjectionEvent(_),
                ),
            ..
        } = envelope
        {
            panic!("stale projection delivery should not enqueue after teardown");
        }
    }

    Ok(())
}
```

Add imports if missing:

```rust
use codex_app_server_protocol::ConfigWarningNotification;
use crate::outgoing_message::ThreadScopedOutgoingMessageSender;
```

Expected before routing implementation: the test fails because stale `ThreadProjectionEvent`
can still enqueue after teardown.

- [ ] **Step 2: Run the runtime regression to confirm red**

Run from `codex-rs`:

```bash
cargo test -p codex-app-server projection_delivery_waiting_for_queue_capacity_is_dropped_after_thread_teardown -- --nocapture
```

Expected before implementation: test fails with `stale projection delivery should not enqueue after teardown`.

- [ ] **Step 3: Route projection deliveries through guarded enqueue**

In `ThreadScopedOutgoingMessageSender::send_server_notification`, replace the projection delivery loop:

```rust
for delivery in deliveries {
    self.outgoing
        .send_projection_delivery_if_current(self.thread_id, delivery)
        .await;
}
```

Remove the old call to `send_server_notification_to_connections` for projection deliveries only.
Leave the ordinary notification send at the end unchanged:

```rust
if self.connection_ids.is_empty() {
    return;
}
self.outgoing
    .send_server_notification_to_connections(self.connection_ids.as_slice(), notification)
    .await;
```

- [ ] **Step 4: Verify runtime regression passes**

Run from `codex-rs`:

```bash
cargo test -p codex-app-server projection_delivery_waiting_for_queue_capacity_is_dropped_after_thread_teardown -- --nocapture
```

Expected: test passes and no stale `ThreadProjectionEvent` is observed.

## Task 4: Update Issue State And Run Focused Verification

**Files:**
- Modify: `docs/superpowers/issues/2026-05-19-projection-atomicity-review.md`

- [ ] **Step 1: Run the projection-focused test filter**

Run from `codex-rs`:

```bash
cargo test -p codex-app-server thread_projection --no-fail-fast
```

Expected: projection-related app-server tests pass.

- [ ] **Step 2: Update Atomicity Finding 3 status**

In `docs/superpowers/issues/2026-05-19-projection-atomicity-review.md`, update the status summary:

```markdown
- Finding 3：已修复。projection delivery 现在携带 materialize 时捕获的
  `ProjectionGeneration`；发送侧在获得 outgoing queue capacity 后、真正入队前校验 generation。
  如果 teardown 已经通过 `ThreadProjectionManager::remove_thread` bump generation，旧 delivery 会被丢弃。
```

In the Finding 3 section, replace `状态：仍开放。` with a fixed-status paragraph:

```markdown
状态：已修复。当前实现让 `ProjectionDelivery` 携带生成时的 `ProjectionGeneration`。
projection delivery 发送侧先等待 outgoing queue capacity，然后校验 generation，最后在没有额外
`await` 的情况下入队。teardown 如果先执行并 bump generation，旧 delivery 会在发送侧被丢弃。
```

Keep the historical explanation below it unless it becomes inaccurate; it is useful issue context.

- [ ] **Step 3: Run formatter**

Run from `codex-rs`:

```bash
just fmt
```

Expected: formatting completes successfully. Do not re-run tests only because `just fmt` touched formatting.

- [ ] **Step 4: Run scoped fix**

Run from `codex-rs`:

```bash
just fix -p codex-app-server
```

Expected: Clippy/fix completes successfully for `codex-app-server`. Do not re-run tests after this step.

- [ ] **Step 5: Check final diff hygiene**

Run from repo root:

```bash
git diff --check
git status --short
```

Expected: `git diff --check` reports no whitespace errors. `git status --short` shows only the intended files:

```text
 M codex-rs/app-server/src/outgoing_message.rs
 M codex-rs/app-server/src/thread_projection.rs
 M codex-rs/app-server/src/thread_projection_runtime.rs
 M docs/superpowers/issues/2026-05-19-projection-atomicity-review.md
?? docs/superpowers/specs/2026-05-26-projection-delivery-generation-gate-design.md
?? docs/superpowers/plans/2026-05-26-projection-delivery-generation-gate.md
```

If unrelated files appear, leave them alone and report them separately.

## Commit Plan

Use one implementation commit after verification:

```bash
git add \
  codex-rs/app-server/src/outgoing_message.rs \
  codex-rs/app-server/src/thread_projection.rs \
  codex-rs/app-server/src/thread_projection_runtime.rs \
  docs/superpowers/issues/2026-05-19-projection-atomicity-review.md \
  docs/superpowers/specs/2026-05-26-projection-delivery-generation-gate-design.md \
  docs/superpowers/plans/2026-05-26-projection-delivery-generation-gate.md
git commit -m "fix(app-server): gate projection delivery by generation"
```

Do not stage unrelated files.
