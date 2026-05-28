# Outgoing Message Projection Hook Convergence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Narrow `outgoing_message.rs` so ordinary thread notifications follow the upstream `rust-v0.133.0` path first, with projection handled through a single thin hook afterward.

**Architecture:** Keep `ThreadScopedOutgoingMessageSender::send_server_notification(...)` as the only behavior-changing call site. Send ordinary notification first when ordinary subscribers exist, then call a projection-only helper that hides projection materialization and delivery iteration. Leave `send_projection_delivery_if_current(...)` in place for this change.

**Tech Stack:** Rust, Tokio tests, `codex-app-server`, existing projection generation gate, existing outgoing message test harness.

---

## Source Of Truth

- Design: `docs/superpowers/specs/2026-05-28-outgoing-message-projection-hook-convergence-design.md`
- Upstream baseline: `refs/tags/rust-v0.133.0^{}`

## Scope

This plan only converges the `outgoing_message.rs` projection hook boundary:

- ordinary notification is sent before projection materialization/delivery.
- projection logic is hidden behind one helper.
- no ordinary-subscriber early return skips projection.
- existing guarded projection delivery helper remains unchanged.

Do not include these changes:

- Do not implement projection fanout backpressure isolation.
- Do not create `projection_fanout.rs`.
- Do not add queues, workers, cancellation tokens, or invalidation.
- Do not move `send_projection_delivery_if_current(...)`.
- Do not change app-server protocol schemas or generated TypeScript.
- Do not change `ThreadStateManager`, listener lifecycle, projection attach/detach, or unload logic.

## File Structure

- Modify: `codex-rs/app-server/src/outgoing_message.rs`
  - Add a focused ordering regression test.
  - Add a projection-only helper on `OutgoingMessageSender`.
  - Change `ThreadScopedOutgoingMessageSender::send_server_notification(...)` to send ordinary notification first and then call the helper.

## Task 1: Add Ordering Regression Test

**Files:**
- Modify: `codex-rs/app-server/src/outgoing_message.rs`

- [ ] **Step 1: Add failing ordinary-before-projection test**

Add this test in the existing `#[cfg(test)] mod tests`, near
`thread_scoped_notification_fans_out_projection_event_without_normal_subscribers`.

```rust
#[tokio::test]
async fn thread_scoped_notification_sends_ordinary_before_projection() {
    let (tx, mut rx) = mpsc::channel::<OutgoingEnvelope>(4);
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

    thread_outgoing
        .send_server_notification(turn_started_notification(thread_id, "turn-1"))
        .await;

    let ordinary_envelope = timeout(Duration::from_secs(1), rx.recv())
        .await
        .expect("ordinary envelope should arrive before timeout")
        .expect("channel should contain ordinary envelope");
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

    let projection_envelope = timeout(Duration::from_secs(1), rx.recv())
        .await
        .expect("projection envelope should arrive before timeout")
        .expect("channel should contain projection envelope");
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
    assert!(rx.try_recv().is_err());
}
```

Expected before implementation: test fails because the current code sends projection delivery before ordinary notification.

- [ ] **Step 2: Run the focused test to confirm red**

Run from `codex-rs`:

```bash
cargo test -p codex-app-server thread_scoped_notification_sends_ordinary_before_projection --no-fail-fast
```

Expected before implementation: test fails with the first envelope targeting `projection_connection_id` or carrying `ThreadProjectionEvent` instead of ordinary `TurnStarted`.

## Task 2: Add Thin Projection Hook And Reorder Ordinary Send

**Files:**
- Modify: `codex-rs/app-server/src/outgoing_message.rs`

- [ ] **Step 1: Add projection-only helper**

Add this helper inside `impl OutgoingMessageSender`, near `thread_projection_manager()` or near
`send_projection_delivery_if_current(...)`:

```rust
    async fn send_thread_projection_notification(
        &self,
        thread_id: ThreadId,
        notification: &ServerNotification,
        projection_history_cursor: Option<ProjectionHistoryCursor>,
    ) {
        let deliveries = if let Some(cursor) = projection_history_cursor {
            self.thread_projection_manager()
                .project_notification_at_cursor(thread_id, notification, cursor)
                .await
        } else {
            self.thread_projection_manager()
                .project_notification(thread_id, notification)
                .await
        };

        for delivery in deliveries {
            self.send_projection_delivery_if_current(thread_id, delivery)
                .await;
        }
    }
```

This helper must not introduce queues, workers, cancellation, invalidation, or protocol changes.

- [ ] **Step 2: Replace the expanded projection block in `send_server_notification(...)`**

Update `ThreadScopedOutgoingMessageSender::send_server_notification(...)` to this shape:

```rust
    pub(crate) async fn send_server_notification(&self, notification: ServerNotification) {
        self.outgoing
            .analytics_events_client
            .track_notification(notification.clone());
        if !self.connection_ids.is_empty() {
            self.outgoing
                .send_server_notification_to_connections(
                    self.connection_ids.as_slice(),
                    notification.clone(),
                )
                .await;
        }
        self.outgoing
            .send_thread_projection_notification(
                self.thread_id,
                &notification,
                self.projection_history_cursor,
            )
            .await;
    }
```

Do not modify `send_server_notification_to_connections(...)`. Its empty-slice broadcast behavior must remain unchanged.

- [ ] **Step 3: Run the focused ordering test**

Run from `codex-rs`:

```bash
cargo test -p codex-app-server thread_scoped_notification_sends_ordinary_before_projection --no-fail-fast
```

Expected: test passes.

- [ ] **Step 4: Run the no-ordinary-subscriber projection regression**

Run from `codex-rs`:

```bash
cargo test -p codex-app-server thread_scoped_notification_fans_out_projection_event_without_normal_subscribers --no-fail-fast
```

Expected: test passes, proving projection hook still runs when ordinary `connection_ids` is empty.

## Task 3: Scope And Formatting Verification

**Files:**
- Verify only: `codex-rs/app-server/src/outgoing_message.rs`

- [ ] **Step 1: Verify the changed file scope**

Run from repo root:

```bash
git diff --name-only
```

Expected implementation diff should include only:

```text
codex-rs/app-server/src/outgoing_message.rs
docs/superpowers/plans/2026-05-28-outgoing-message-projection-hook-convergence.md
docs/superpowers/specs/2026-05-28-outgoing-message-projection-hook-convergence-design.md
```

If prior docs are already committed or excluded from the implementation branch, the Rust implementation itself should still only touch `codex-rs/app-server/src/outgoing_message.rs`.

- [ ] **Step 2: Run the focused outgoing tests**

Run from `codex-rs`:

```bash
cargo test -p codex-app-server outgoing_message --no-fail-fast
```

Expected: all `outgoing_message` tests pass.

- [ ] **Step 3: Format and lint the changed Rust crate**

Run from `codex-rs`:

```bash
just fmt
just fix -p codex-app-server
```

Expected: both commands exit successfully. Do not run full workspace tests unless explicitly requested.

- [ ] **Step 4: Final diff hygiene**

Run from repo root:

```bash
git diff --check
git status --short
```

Expected: `git diff --check` has no output. `git status --short` shows only the intended files.

## Implementation Notes

- This plan intentionally changes current fork behavior by sending ordinary notification before projection. That is the point of the convergence.
- This plan intentionally does not solve full projection fanout backpressure isolation. It only creates the narrow hook needed before that work.
- Do not refactor surrounding notification, response, request, broadcast, or transport code.
