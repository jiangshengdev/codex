# Projection Connection Close Race Test Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a focused regression test that proves a projection attach cannot survive connection close interleavings.

**Architecture:** The test targets the smallest reliable surface: `thread_projection_runtime::handle_projection_attach_response` plus the same `ThreadStateManager` and `ThreadProjectionManager` cleanup calls used by production. It explicitly simulates the close ordering window where projection cleanup runs before the live connection is removed.

**Tech Stack:** Rust, Tokio async tests, `pretty_assertions`, existing app-server test helpers in `thread_projection_runtime.rs`.

---

### File Structure

- Modify: `codex-rs/app-server/src/thread_projection_runtime.rs`
  - Add one focused Tokio unit test under the existing `#[cfg(test)] mod tests`.
  - Reuse existing helpers: `test_thread`, `turn_started_notification`, `OutgoingMessageSender`, `ThreadStateManager`.
- No docs or schema changes.

### Task 1: Prove Connection Close Interleaving Does Not Leave Projection Subscription

**Files:**
- Modify: `codex-rs/app-server/src/thread_projection_runtime.rs`
- Test: `codex-rs/app-server/src/thread_projection_runtime.rs`

- [ ] **Step 1: Add the failing regression test**

Append this test in the existing `#[cfg(test)] mod tests` in `codex-rs/app-server/src/thread_projection_runtime.rs`, near the other connection-close projection attach race tests:

```rust
    #[tokio::test]
    async fn connection_close_interleaving_does_not_leave_projection_subscription()
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
            .connection_initialized(connection_id)
            .await;
        let outgoing = Arc::new(OutgoingMessageSender::new(
            tokio::sync::mpsc::channel(1).0,
            codex_analytics::AnalyticsEventsClient::disabled(),
        ));
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
                    snapshot,
                )
                .await;
            }
        });

        // This mirrors the current production close ordering: projection cleanup
        // can run before ThreadStateManager marks the connection closed.
        let early_projection_cleanup = outgoing
            .thread_projection_manager()
            .remove_connection(connection_id)
            .await;
        assert_eq!(early_projection_cleanup, Vec::new());

        snapshot_tx
            .send(Ok(test_thread(thread_id)))
            .expect("snapshot receiver should be waiting");
        timeout(Duration::from_secs(1), attach_task)
            .await
            .expect("attach task should finish")
            .expect("attach task should not panic");

        thread_state_manager.remove_connection(connection_id).await;

        let deliveries = outgoing
            .thread_projection_manager()
            .project_notification(thread_id, &turn_started_notification(thread_id))
            .await;
        assert_eq!(deliveries, Vec::new());
        Ok(())
    }
```

- [ ] **Step 2: Run only this test and confirm it fails on the current branch**

Run from `codex-rs`:

```bash
cargo test -p codex-app-server connection_close_interleaving_does_not_leave_projection_subscription
```

Expected result on the current branch:

```text
FAILED thread_projection_runtime::tests::connection_close_interleaving_does_not_leave_projection_subscription
assertion failed: left == right
left: [ProjectionDelivery { ... }]
right: []
```

This failure is the proof: a closed connection can still have a projection subscriber if attach lands between early projection cleanup and `ThreadStateManager::remove_connection`.

- [ ] **Step 3: Record the finding with exact production references**

Use this review finding text:

```markdown
1. `codex-rs/app-server/src/message_processor.rs:667` closes projection subscriptions before `thread_processor.connection_closed()` removes the connection from `ThreadStateManager`. A listener-queued `thread/projection/attach` can pass `is_live_connection()` in `thread_projection_runtime.rs:86` / `:111` after the early projection cleanup and re-register a subscriber. Because production does not run projection cleanup again after `ThreadStateManager::remove_connection`, later projection events can still target the closed connection. The regression test `connection_close_interleaving_does_not_leave_projection_subscription` demonstrates this by leaving one `ProjectionDelivery` after the close sequence.
```

- [ ] **Step 4: After a fix is proposed, rerun the same test**

Run from `codex-rs`:

```bash
cargo test -p codex-app-server connection_close_interleaving_does_not_leave_projection_subscription
```

Expected result after the fix:

```text
test thread_projection_runtime::tests::connection_close_interleaving_does_not_leave_projection_subscription ... ok
```

- [ ] **Step 5: Run the projection-adjacent app-server tests**

Run from `codex-rs`:

```bash
cargo test -p codex-app-server thread_projection
```

Expected result:

```text
test result: ok
```

---

### Task 2: Optional E2E Coverage For User-Visible Behavior

**Files:**
- Modify: `codex-rs/app-server/tests/suite/v2/thread_projection.rs`

- [ ] **Step 1: Defer this unless the unit proof is disputed**

Do not add an e2e test first. The race requires a narrow interleaving inside `MessageProcessor::connection_closed`, and the existing MCP harness does not expose a deterministic hook between projection cleanup and `ThreadStateManager` cleanup. A unit regression test is the correct first proof because it is deterministic and directly exercises the two state machines involved.

- [ ] **Step 2: If an e2e is still required, add it only after production exposes a test hook or the cleanup order is refactored behind a small helper**

The e2e assertion should be:

```rust
// Pseudocode only for future helper-backed e2e:
// 1. Start a thread.
// 2. Begin projection attach and block snapshot completion.
// 3. Trigger connection close and pause after projection cleanup.
// 4. Release snapshot.
// 5. Finish connection close.
// 6. Start a turn on the thread from another connection.
// 7. Assert no thread/projection/event is emitted to the closed connection.
```

Do not implement this pseudocode without a deterministic pause point; otherwise the test will be flaky.

---

### Self-Review

- Spec coverage: Covers spec section “Connection Close 与 重连”: connection close must clear all projection subscriptions and first version has no grace period.
- Placeholder scan: No implementation placeholders in Task 1. Task 2 is explicitly deferred and marked optional because deterministic e2e support is not currently present.
- Type consistency: Uses existing types already imported in `thread_projection_runtime.rs` test module: `ThreadId`, `ConnectionId`, `ConnectionRequestId`, `RequestId`, `ThreadStateManager`, `OutgoingMessageSender`, `oneshot`, `timeout`, `Duration`.
