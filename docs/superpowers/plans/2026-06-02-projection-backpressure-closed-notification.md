# Projection Backpressure Closed Notification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Notify projection clients when server-side backpressure invalidates their projection subscription.

**Architecture:** Keep the fix in the fork projection overlay. Add a v2 `thread/projection/closed` notification with `reason: "backpressure"`, make projection invalidation return the removed subscribers, and have the projection fanout overflow path send targeted closed notifications without waiting on shared outgoing capacity. Upstream `rust-v0.136.0` paths should only receive thin registration or hook changes.

**Tech Stack:** Rust, Tokio `mpsc`, `codex-app-server-protocol`, `codex-app-server`, existing projection fanout and generation gate tests.

---

## Source Of Truth

- Design: `docs/superpowers/specs/2026-06-02-projection-backpressure-closed-notification-design.md`
- Issue: `docs/superpowers/issues/2026-05-30-01-projection-fanout-silent-invalidation.md`
- Upstream merge-safety baseline: `refs/tags/rust-v0.136.0^{}`

## Scope

Implement only the confirmed A/A/A decisions:

- independent server notification `thread/projection/closed`
- only one close reason, `backpressure`
- queue-full closed delivery owned by projection overlay

Do not implement:

- `ThreadProjectionEvent::Closed`
- extra reasons such as `threadClosed`, `connectionClosed`, or `serverShutdown`
- replay buffers or per-subscription queues
- ordinary thread notification, lifecycle, subscribe/unsubscribe, or connection cleanup rewrites

## File Structure

- Modify: `codex-rs/app-server-protocol/src/protocol/v2/thread_projection.rs`
  - Add `ThreadProjectionClosedNotification`.
  - Add `ThreadProjectionClosedReason`.
  - Add protocol serialization test.
- Modify: `codex-rs/app-server-protocol/src/protocol/common.rs`
  - Register `ThreadProjectionClosed => "thread/projection/closed"`.
- Modify generated schema files under `codex-rs/app-server-protocol/schema/`
  - Regenerate with `just write-app-server-schema`.
- Modify: `codex-rs/app-server/src/thread_projection.rs`
  - Add `InvalidatedProjectionSubscriber`.
  - Change `invalidate_thread_projection(...)` to return removed subscribers.
  - Update invalidation tests.
- Modify: `codex-rs/app-server/src/projection_fanout.rs`
  - Send `thread/projection/closed` from the queue-full path.
  - Add focused overflow tests.
- Modify: `codex-rs/app-server/README.md`
  - Document `thread/projection/closed` and backpressure recovery behavior.
- Modify: `docs/superpowers/issues/2026-05-30-01-projection-fanout-silent-invalidation.md`
  - Mark fixed only after implementation and focused verification pass.

## Task 1: Add Projection Closed Protocol Surface

**Files:**
- Modify: `codex-rs/app-server-protocol/src/protocol/v2/thread_projection.rs`
- Modify: `codex-rs/app-server-protocol/src/protocol/common.rs`

- [ ] **Step 1: Add the failing protocol test**

Add this test in `codex-rs/app-server-protocol/src/protocol/v2/thread_projection.rs` inside the existing `#[cfg(test)] mod tests`:

```rust
#[test]
fn deserialize_thread_projection_closed_notification() -> Result<()> {
    let notification: ServerNotification = serde_json::from_value(json!({
        "method": "thread/projection/closed",
        "params": {
            "threadId": "thr_123",
            "subscriptionId": "sub_123",
            "reason": "backpressure"
        }
    }))?;

    assert_eq!(
        serde_json::to_value(&notification)?,
        json!({
            "method": "thread/projection/closed",
            "params": {
                "threadId": "thr_123",
                "subscriptionId": "sub_123",
                "reason": "backpressure"
            }
        })
    );
    Ok(())
}
```

- [ ] **Step 2: Run the focused protocol test and confirm red**

Run from `codex-rs`:

```sh
just test -p codex-app-server-protocol deserialize_thread_projection_closed_notification
```

Expected: compile or deserialize failure because `thread/projection/closed` is not registered yet.

- [ ] **Step 3: Add the v2 payload types**

Add these types near `ThreadProjectionEventNotification` in `codex-rs/app-server-protocol/src/protocol/v2/thread_projection.rs`:

```rust
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export_to = "v2/")]
pub struct ThreadProjectionClosedNotification {
    pub thread_id: String,
    pub subscription_id: String,
    pub reason: ThreadProjectionClosedReason,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase", export_to = "v2/")]
pub enum ThreadProjectionClosedReason {
    Backpressure,
}
```

- [ ] **Step 4: Register the server notification**

Add the notification in `codex-rs/app-server-protocol/src/protocol/common.rs` next to the existing projection event notification:

```rust
ThreadProjectionEvent => "thread/projection/event" (v2::ThreadProjectionEventNotification),
ThreadProjectionClosed => "thread/projection/closed" (v2::ThreadProjectionClosedNotification),
```

- [ ] **Step 5: Run the focused protocol test and confirm green**

Run from `codex-rs`:

```sh
just test -p codex-app-server-protocol deserialize_thread_projection_closed_notification
```

Expected: test passes.

## Task 2: Return Invalidated Projection Subscribers

**Files:**
- Modify: `codex-rs/app-server/src/thread_projection.rs`

- [ ] **Step 1: Add the invalidated subscriber return type**

Add this near `ProjectionDelivery`:

```rust
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct InvalidatedProjectionSubscriber {
    pub(crate) connection_id: ConnectionId,
    pub(crate) subscription_id: String,
}
```

- [ ] **Step 2: Update invalidation tests to assert returned subscribers**

In `invalidate_thread_projection_clears_subscribers_head_and_generation`, bind attach results and assert the return value:

```rust
let ProjectionAttachAttempt::Attached(first_result) = first_attach else {
    panic!("current generation should attach");
};
let ProjectionAttachAttempt::Attached(second_result) = second_attach else {
    panic!("current generation should attach");
};

let invalidated = manager.invalidate_thread_projection(thread_id).await;
assert_eq!(
    vec![
        InvalidatedProjectionSubscriber {
            connection_id: first_connection_id,
            subscription_id: first_result.subscription_id,
        },
        InvalidatedProjectionSubscriber {
            connection_id: second_connection_id,
            subscription_id: second_result.subscription_id,
        },
    ],
    invalidated
);
```

In `invalidate_unknown_thread_has_no_projection_side_effects`, assert the empty return:

```rust
let invalidated = manager.invalidate_thread_projection(thread_id).await;
assert_eq!(Vec::<InvalidatedProjectionSubscriber>::new(), invalidated);
```

- [ ] **Step 3: Run the focused manager tests and confirm red**

Run from `codex-rs`:

```sh
just test -p codex-app-server invalidate_thread_projection
```

Expected: compile failure because `invalidate_thread_projection(...)` still returns `()`.

- [ ] **Step 4: Change the public manager invalidation API**

Replace the current manager method with:

```rust
pub(crate) async fn invalidate_thread_projection(
    &self,
    thread_id: ThreadId,
) -> Vec<InvalidatedProjectionSubscriber> {
    let mut inner = self.inner.lock().await;
    inner.invalidate_thread_projection(thread_id)
}
```

- [ ] **Step 5: Change the inner invalidation implementation**

Replace `ThreadProjectionManagerInner::invalidate_thread_projection(...)` with:

```rust
fn invalidate_thread_projection(
    &mut self,
    thread_id: ThreadId,
) -> Vec<InvalidatedProjectionSubscriber> {
    if !self.thread_generations.contains_key(&thread_id) && !self.threads.contains_key(&thread_id)
    {
        return Vec::new();
    }

    self.bump_generation_if_known(thread_id);

    let subscribers = {
        let Some(entry) = self.threads.get_mut(&thread_id) else {
            return Vec::new();
        };

        let subscribers = entry
            .sorted_subscribers()
            .into_iter()
            .map(
                |(connection_id, subscription_id)| InvalidatedProjectionSubscriber {
                    connection_id,
                    subscription_id,
                },
            )
            .collect::<Vec<_>>();
        entry.head_commit_id = None;
        entry.subscribers.clear();
        let _ = entry.has_subscribers_tx.send(false);
        subscribers
    };

    for subscriber in &subscribers {
        self.remove_connection_thread_index(subscriber.connection_id, thread_id);
    }

    subscribers
}
```

- [ ] **Step 6: Run the focused manager tests and confirm green**

Run from `codex-rs`:

```sh
just test -p codex-app-server invalidate_thread_projection
```

Expected: all invalidation tests pass.

## Task 3: Send Closed Notifications On Fanout Overflow

**Files:**
- Modify: `codex-rs/app-server/src/projection_fanout.rs`

- [ ] **Step 1: Add protocol imports**

Add imports near the existing protocol imports:

```rust
use codex_app_server_protocol::ThreadProjectionClosedNotification;
use codex_app_server_protocol::ThreadProjectionClosedReason;
```

Add the invalidated subscriber import:

```rust
use crate::thread_projection::InvalidatedProjectionSubscriber;
```

- [ ] **Step 2: Replace the existing queue-full test**

Replace `queue_full_invalidates_generation_and_drops_current_job` with this stricter test:

```rust
#[tokio::test]
async fn queue_full_sends_closed_notification_and_drops_current_job() {
    let manager = ThreadProjectionManager::new();
    let fanout = ProjectionFanoutManager::new_with_capacity(manager.clone(), /*capacity*/ 1);
    let facade = ThreadProjectionFacade {
        manager: manager.clone(),
        fanout,
    };
    let thread_id = ThreadId::new();
    let connection_id = ConnectionId(9);
    attach_projection(&facade, thread_id, connection_id).await;
    let generation = manager.capture_current_generation(thread_id).await;

    let (tx, mut rx) = mpsc::channel::<OutgoingEnvelope>(1);
    tx.send(capacity_holder())
        .await
        .expect("capacity holder should enqueue");

    facade
        .enqueue_notification(
            tx.clone(),
            thread_id,
            &turn_started_notification(thread_id, "turn-1"),
            /*projection_history_cursor*/ None,
        )
        .await;
    tokio::task::yield_now().await;
    facade
        .enqueue_notification(
            tx.clone(),
            thread_id,
            &turn_started_notification(thread_id, "turn-2"),
            /*projection_history_cursor*/ None,
        )
        .await;
    facade
        .enqueue_notification(
            tx,
            thread_id,
            &turn_started_notification(thread_id, "turn-3"),
            /*projection_history_cursor*/ None,
        )
        .await;

    assert!(!manager.generation_matches(thread_id, generation).await);
    assert_eq!(Vec::<ThreadId>::new(), manager.remove_connection(connection_id).await);

    let _capacity_holder = rx.recv().await.expect("capacity holder should exist");
    let envelope = timeout(Duration::from_secs(1), rx.recv())
        .await
        .expect("closed notification should arrive")
        .expect("closed notification should exist");
    let OutgoingEnvelope::ToConnection {
        connection_id: delivered_connection_id,
        message:
            OutgoingMessage::AppServerNotification(ServerNotification::ThreadProjectionClosed(
                notification,
            )),
        write_complete_tx,
    } = envelope
    else {
        panic!("expected targeted projection closed notification");
    };
    assert_eq!(connection_id, delivered_connection_id);
    assert_eq!(thread_id.to_string(), notification.thread_id);
    assert_eq!(ThreadProjectionClosedReason::Backpressure, notification.reason);
    assert!(write_complete_tx.is_none());

    assert!(
        timeout(Duration::from_millis(50), rx.recv()).await.is_err(),
        "old generation projection delivery should not enqueue after invalidation"
    );
}
```

- [ ] **Step 3: Add a nonblocking overflow test**

Add this test in the same module:

```rust
#[tokio::test]
async fn queue_full_closed_notification_does_not_wait_for_outgoing_capacity() {
    let manager = ThreadProjectionManager::new();
    let fanout = ProjectionFanoutManager::new_with_capacity(manager.clone(), /*capacity*/ 1);
    let facade = ThreadProjectionFacade {
        manager,
        fanout,
    };
    let thread_id = ThreadId::new();
    attach_projection(&facade, thread_id, ConnectionId(9)).await;

    let (tx, _rx) = mpsc::channel::<OutgoingEnvelope>(1);
    tx.send(capacity_holder())
        .await
        .expect("capacity holder should enqueue");

    facade
        .enqueue_notification(
            tx.clone(),
            thread_id,
            &turn_started_notification(thread_id, "turn-1"),
            /*projection_history_cursor*/ None,
        )
        .await;
    tokio::task::yield_now().await;
    facade
        .enqueue_notification(
            tx.clone(),
            thread_id,
            &turn_started_notification(thread_id, "turn-2"),
            /*projection_history_cursor*/ None,
        )
        .await;

    timeout(
        Duration::from_secs(1),
        facade.enqueue_notification(
            tx,
            thread_id,
            &turn_started_notification(thread_id, "turn-3"),
            /*projection_history_cursor*/ None,
        ),
    )
    .await
    .expect("queue-full handling must not wait for outgoing capacity");
}
```

- [ ] **Step 4: Run fanout tests and confirm red**

Run from `codex-rs`:

```sh
just test -p codex-app-server projection_fanout
```

Expected: compile failure naming missing `ThreadProjectionClosed` variant or assertion failure because overflow does not send closed yet.

- [ ] **Step 5: Add closed notification spawning helper**

Add this helper near `send_projection_delivery_if_current_or_cancelled(...)`:

```rust
fn spawn_projection_closed_notifications(
    sender: mpsc::Sender<OutgoingEnvelope>,
    thread_id: ThreadId,
    subscribers: Vec<InvalidatedProjectionSubscriber>,
) {
    if subscribers.is_empty() {
        return;
    }

    tokio::spawn(async move {
        for subscriber in subscribers {
            let message = OutgoingMessage::AppServerNotification(
                ServerNotification::ThreadProjectionClosed(ThreadProjectionClosedNotification {
                    thread_id: thread_id.to_string(),
                    subscription_id: subscriber.subscription_id,
                    reason: ThreadProjectionClosedReason::Backpressure,
                }),
            );
            if let Err(err) = sender
                .send(OutgoingEnvelope::ToConnection {
                    connection_id: subscriber.connection_id,
                    message,
                    write_complete_tx: None,
                })
                .await
            {
                warn!("failed to send projection closed notification to client: {err:?}");
                break;
            }
        }
    });
}
```

- [ ] **Step 6: Use the helper from the queue-full branch**

Change the full branch in `ProjectionFanoutManager::enqueue(...)` to keep the returned job and send closed after invalidation and cancellation:

```rust
Err(mpsc::error::TrySendError::Full(job)) => {
    warn!("projection fanout queue full; invalidating projection stream for {thread_id}");
    let invalidated_subscribers = self.manager.invalidate_thread_projection(thread_id).await;
    handle.cancellation.cancel();
    self.remove_handle(thread_id, handle.worker_id).await;
    spawn_projection_closed_notifications(job.sender, thread_id, invalidated_subscribers);
}
```

- [ ] **Step 7: Run fanout tests and confirm green**

Run from `codex-rs`:

```sh
just test -p codex-app-server projection_fanout
```

Expected: fanout tests pass, including the closed notification overflow tests.

## Task 4: Docs, Schema, Issue Status, And Focused Verification

**Files:**
- Modify: `codex-rs/app-server/README.md`
- Modify generated files under `codex-rs/app-server-protocol/schema/`
- Modify: `docs/superpowers/issues/2026-05-30-01-projection-fanout-silent-invalidation.md`

- [ ] **Step 1: Update the README method list**

Add this bullet after `thread/projection/event` in `codex-rs/app-server/README.md`:

```markdown
- `thread/projection/closed` — notification emitted when the server terminates a projection subscription. Currently `reason` is `backpressure`, which means the per-thread projection fanout queue filled and the client must call `thread/projection/attach` again to get a fresh snapshot baseline.
```

- [ ] **Step 2: Update the projection example text**

After the paragraph that starts with `` `thread/projection/detach` is not a transport drain barrier.``, add:

```markdown
If a projection subscriber falls behind far enough to fill the server-side fanout queue, the server invalidates that projection stream and emits `thread/projection/closed` with `{ threadId, subscriptionId, reason: "backpressure" }`. Clients should ignore the closed notification if its `subscriptionId` is no longer current; otherwise they should attach again and use the returned snapshot as the new baseline.
```

- [ ] **Step 3: Regenerate app-server protocol schema**

Run from `codex-rs`:

```sh
just write-app-server-schema
```

Expected: generated JSON schema and TypeScript files include `ThreadProjectionClosedNotification` and `ThreadProjectionClosedReason`.

- [ ] **Step 4: Run focused protocol tests**

Run from `codex-rs`:

```sh
just test -p codex-app-server-protocol thread_projection
```

Expected: protocol projection tests pass.

- [ ] **Step 5: Run focused app-server tests**

Run from `codex-rs`:

```sh
just test -p codex-app-server projection_fanout
```

Expected: projection fanout tests pass.

- [ ] **Step 6: Run formatting and scoped fixes**

Run from `codex-rs`:

```sh
just fmt
just fix -p codex-app-server-protocol
just fix -p codex-app-server
```

Expected: formatting and scoped lints complete without requiring semantic changes.

- [ ] **Step 7: Check generated/schema/docs diff**

Run from repo root:

```sh
git diff --check
git diff --stat -- codex-rs/app-server-protocol codex-rs/app-server docs/superpowers/issues/2026-05-30-01-projection-fanout-silent-invalidation.md
```

Expected: no whitespace errors; diff is limited to the protocol closed notification, projection invalidation return value, fanout overflow closed delivery, README, generated schema/TS, and issue status.

- [ ] **Step 8: Mark the issue fixed**

After Steps 3-7 pass, append this status note to `docs/superpowers/issues/2026-05-30-01-projection-fanout-silent-invalidation.md`:

```markdown
## 状态

已修复。queue full invalidation 现在会向被服务端清理的 projection subscribers 发送
`thread/projection/closed`，`reason` 为 `backpressure`。客户端收到后应重新
`thread/projection/attach` 获取新的 snapshot baseline。
```

- [ ] **Step 9: Commit the implementation**

Use a Conventional Commits message:

```sh
git add codex-rs/app-server-protocol codex-rs/app-server docs/superpowers/issues/2026-05-30-01-projection-fanout-silent-invalidation.md
git commit -m "fix(app-server): notify projection subscribers on backpressure close"
```

Expected: one implementation commit containing code, generated schema/TS, README, and issue status.
