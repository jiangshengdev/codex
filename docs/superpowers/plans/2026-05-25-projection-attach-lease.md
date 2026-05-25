# Projection Attach Lease Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix Atomicity Finding 2 by making projection attach preparation register a projection-only lease that connection close cleanup can find, without changing ordinary thread subscription semantics.

**Architecture:** Add projection-only pending attach state to `ThreadStateManager`: a forward `ThreadEntry.projection_attach_leases` set plus a separate `projection_attach_thread_ids_by_connection` reverse index. `thread/projection/attach` begins that lease before enqueueing listener work and explicitly releases it on every attach-response exit path, while ordinary `connection_ids` and `thread_ids_by_connection` remain untouched.

**Tech Stack:** Rust, Tokio tests, `codex-app-server`, existing app-server projection runtime harness, `pretty_assertions`.

---

## Source Of Truth

- Design: `docs/superpowers/specs/2026-05-25-projection-attach-lease-design.md`
- Issue context: `docs/superpowers/issues/2026-05-19-projection-atomicity-review.md`

## Scope

This plan fixes only Atomicity Finding 2:

- `prepare_projection_attach` must no longer create a long-lived TSM entry with no projection cleanup index.
- projection attach pending state must not enter ordinary thread subscription state.
- connection close must release projection attach pending state.

Do not include these changes:

- Do not modify `thread_ids_by_connection` semantics; it stays ordinary-subscription-only.
- Do not put projection attach leases into `ThreadEntry.connection_ids`.
- Do not change app-server protocol schemas or generated TypeScript.
- Do not solve projection delivery backpressure or Finding 3.
- Do not redesign listener command ownership.
- Do not use `Drop` for async cleanup.

## File Structure

- Modify: `codex-rs/app-server/src/thread_state.rs`
  - Add projection attach lease storage and APIs.
  - Keep ordinary subscription APIs behaviorally unchanged.
  - Add focused unit tests for lease isolation, cleanup, idempotence, and `remove_connection` return semantics.
- Modify: `codex-rs/app-server/src/request_processors/thread_projection.rs`
  - Begin a projection attach lease in `prepare_projection_attach`.
  - Release it if listener startup or enqueueing fails.
- Modify: `codex-rs/app-server/src/thread_projection_runtime.rs`
  - Release projection attach leases on every attach-response exit path.
  - Update the projection runtime harness to model production lease creation.
  - Add a connection-close-during-snapshot regression test.
- Modify: `docs/superpowers/issues/2026-05-19-projection-atomicity-review.md`
  - Mark Finding 2 fixed after implementation and verification.

## Task 1: Add ThreadStateManager Projection Lease API

**Files:**
- Modify: `codex-rs/app-server/src/thread_state.rs`

- [ ] **Step 1: Add failing ThreadStateManager tests**

Add these tests inside the existing `#[cfg(test)] mod tests` in `codex-rs/app-server/src/thread_state.rs`.

```rust
#[tokio::test]
async fn projection_attach_lease_does_not_subscribe_connection() {
    let manager = ThreadStateManager::new();
    let thread_id = ThreadId::new();
    let connection_id = ConnectionId(1);
    manager
        .connection_initialized(connection_id, ConnectionCapabilities::default())
        .await;

    let thread_state = manager
        .try_begin_projection_attach(thread_id, connection_id)
        .await
        .expect("live connection should begin projection attach");

    assert_eq!(
        thread_state.lock().await.listener_generation,
        ThreadState::default().listener_generation
    );
    assert_eq!(
        manager.subscribed_connection_ids(thread_id).await,
        Vec::<ConnectionId>::new()
    );
    assert!(!manager.has_subscribers(thread_id).await);
    assert!(
        manager
            .has_projection_attach_lease(thread_id, connection_id)
            .await
    );
}

#[tokio::test]
async fn projection_attach_lease_requires_live_connection() {
    let manager = ThreadStateManager::new();
    let thread_id = ThreadId::new();
    let connection_id = ConnectionId(1);

    let thread_state = manager
        .try_begin_projection_attach(thread_id, connection_id)
        .await;

    assert!(thread_state.is_none());
    assert!(!manager.has_thread_entry(thread_id).await);
}

#[tokio::test]
async fn release_projection_attach_lease_is_idempotent() {
    let manager = ThreadStateManager::new();
    let thread_id = ThreadId::new();
    let connection_id = ConnectionId(1);
    manager
        .connection_initialized(connection_id, ConnectionCapabilities::default())
        .await;
    manager
        .try_begin_projection_attach(thread_id, connection_id)
        .await
        .expect("live connection should begin projection attach");

    manager
        .release_projection_attach_lease(thread_id, connection_id)
        .await;
    manager
        .release_projection_attach_lease(thread_id, connection_id)
        .await;

    assert!(
        !manager
            .has_projection_attach_lease(thread_id, connection_id)
            .await
    );
    assert_eq!(manager.remove_connection(connection_id).await, Vec::new());
}

#[tokio::test]
async fn remove_connection_cleans_projection_attach_lease() {
    let manager = ThreadStateManager::new();
    let thread_id = ThreadId::new();
    let connection_id = ConnectionId(1);
    manager
        .connection_initialized(connection_id, ConnectionCapabilities::default())
        .await;
    manager
        .try_begin_projection_attach(thread_id, connection_id)
        .await
        .expect("live connection should begin projection attach");

    assert_eq!(manager.remove_connection(connection_id).await, vec![thread_id]);
    assert!(
        !manager
            .has_projection_attach_lease(thread_id, connection_id)
            .await
    );
    assert_eq!(
        manager.subscribed_connection_ids(thread_id).await,
        Vec::<ConnectionId>::new()
    );
}

#[tokio::test]
async fn remove_connection_deduplicates_ordinary_and_projection_cleanup() {
    let manager = ThreadStateManager::new();
    let thread_id = ThreadId::new();
    let connection_id = ConnectionId(1);
    manager
        .connection_initialized(connection_id, ConnectionCapabilities::default())
        .await;
    assert!(
        manager
            .try_add_connection_to_thread(thread_id, connection_id)
            .await
    );
    manager
        .try_begin_projection_attach(thread_id, connection_id)
        .await
        .expect("live connection should begin projection attach");

    assert_eq!(manager.remove_connection(connection_id).await, vec![thread_id]);
    assert!(
        !manager
            .has_projection_attach_lease(thread_id, connection_id)
            .await
    );
    assert_eq!(
        manager.subscribed_connection_ids(thread_id).await,
        Vec::<ConnectionId>::new()
    );
}

#[tokio::test]
async fn remove_connection_keeps_thread_with_other_ordinary_subscribers_out_of_reconciliation() {
    let manager = ThreadStateManager::new();
    let thread_id = ThreadId::new();
    let projection_connection_id = ConnectionId(1);
    let ordinary_connection_id = ConnectionId(2);
    manager
        .connection_initialized(
            projection_connection_id,
            ConnectionCapabilities::default(),
        )
        .await;
    manager
        .connection_initialized(ordinary_connection_id, ConnectionCapabilities::default())
        .await;
    assert!(
        manager
            .try_add_connection_to_thread(thread_id, ordinary_connection_id)
            .await
    );
    manager
        .try_begin_projection_attach(thread_id, projection_connection_id)
        .await
        .expect("live connection should begin projection attach");

    assert_eq!(
        manager.remove_connection(projection_connection_id).await,
        Vec::<ThreadId>::new()
    );
    assert_eq!(
        manager.subscribed_connection_ids(thread_id).await,
        vec![ordinary_connection_id]
    );
}

#[tokio::test]
async fn remove_thread_state_cleans_projection_attach_lease_index() {
    let manager = ThreadStateManager::new();
    let thread_id = ThreadId::new();
    let connection_id = ConnectionId(1);
    manager
        .connection_initialized(connection_id, ConnectionCapabilities::default())
        .await;
    manager
        .try_begin_projection_attach(thread_id, connection_id)
        .await
        .expect("live connection should begin projection attach");

    manager.remove_thread_state(thread_id).await;

    assert!(
        !manager
            .has_projection_attach_lease(thread_id, connection_id)
            .await
    );
    assert_eq!(manager.remove_connection(connection_id).await, Vec::new());
}
```

Expected before implementation: compile fails because `try_begin_projection_attach`,
`release_projection_attach_lease`, `has_projection_attach_lease`, and `has_thread_entry` do not exist.

- [ ] **Step 2: Run the focused ThreadStateManager tests to confirm red**

Run from `codex-rs`:

```bash
cargo test -p codex-app-server projection_attach_lease --no-fail-fast
cargo test -p codex-app-server remove_connection_cleans_projection_attach_lease --no-fail-fast
cargo test -p codex-app-server remove_thread_state_cleans_projection_attach_lease_index --no-fail-fast
```

Expected before implementation: compile failure naming the missing projection attach lease APIs.

- [ ] **Step 3: Add projection lease fields**

In `codex-rs/app-server/src/thread_state.rs`, update `ThreadEntry`:

```rust
struct ThreadEntry {
    state: Arc<Mutex<ThreadState>>,
    connection_ids: HashSet<ConnectionId>,
    projection_attach_leases: HashSet<ConnectionId>,
    has_connections_watcher: watch::Sender<bool>,
}
```

Update its `Default` implementation:

```rust
impl Default for ThreadEntry {
    fn default() -> Self {
        Self {
            state: Arc::new(Mutex::new(ThreadState::default())),
            connection_ids: HashSet::new(),
            projection_attach_leases: HashSet::new(),
            has_connections_watcher: watch::channel(false).0,
        }
    }
}
```

Update `ThreadStateManagerInner`:

```rust
#[derive(Default)]
struct ThreadStateManagerInner {
    live_connections: HashMap<ConnectionId, ConnectionCapabilities>,
    threads: HashMap<ThreadId, ThreadEntry>,
    thread_ids_by_connection: HashMap<ConnectionId, HashSet<ThreadId>>,
    projection_attach_thread_ids_by_connection: HashMap<ConnectionId, HashSet<ThreadId>>,
}
```

- [ ] **Step 4: Add begin and release APIs**

Add these methods in `impl ThreadStateManager`, near `try_thread_state_for_live_connection`:

```rust
pub(crate) async fn try_begin_projection_attach(
    &self,
    thread_id: ThreadId,
    connection_id: ConnectionId,
) -> Option<Arc<Mutex<ThreadState>>> {
    let mut state = self.state.lock().await;
    if !state.live_connections.contains_key(&connection_id) {
        return None;
    }
    state
        .projection_attach_thread_ids_by_connection
        .entry(connection_id)
        .or_default()
        .insert(thread_id);
    let thread_entry = state.threads.entry(thread_id).or_default();
    thread_entry.projection_attach_leases.insert(connection_id);
    Some(thread_entry.state.clone())
}

pub(crate) async fn release_projection_attach_lease(
    &self,
    thread_id: ThreadId,
    connection_id: ConnectionId,
) {
    let mut state = self.state.lock().await;
    if let Some(thread_entry) = state.threads.get_mut(&thread_id) {
        thread_entry.projection_attach_leases.remove(&connection_id);
    }
    if let Some(thread_ids) = state
        .projection_attach_thread_ids_by_connection
        .get_mut(&connection_id)
    {
        thread_ids.remove(&thread_id);
        if thread_ids.is_empty() {
            state
                .projection_attach_thread_ids_by_connection
                .remove(&connection_id);
        }
    }
}
```

Do not call `update_has_connections()` from either method.

- [ ] **Step 5: Update remove_thread_state cleanup**

In `remove_thread_state`, after the existing `thread_ids_by_connection.retain(...)` block, add cleanup for projection lease reverse indexes:

```rust
state
    .projection_attach_thread_ids_by_connection
    .retain(|_, thread_ids| {
        thread_ids.remove(&thread_id);
        !thread_ids.is_empty()
    });
```

- [ ] **Step 6: Update remove_connection cleanup and return semantics**

Replace the body of `remove_connection` with this shape:

```rust
pub(crate) async fn remove_connection(&self, connection_id: ConnectionId) -> Vec<ThreadId> {
    {
        let mut state = self.state.lock().await;
        state.live_connections.remove(&connection_id);

        let ordinary_thread_ids = state
            .thread_ids_by_connection
            .remove(&connection_id)
            .unwrap_or_default();
        for thread_id in &ordinary_thread_ids {
            if let Some(thread_entry) = state.threads.get_mut(thread_id) {
                thread_entry.connection_ids.remove(&connection_id);
                thread_entry.update_has_connections();
            }
        }

        let projection_attach_thread_ids = state
            .projection_attach_thread_ids_by_connection
            .remove(&connection_id)
            .unwrap_or_default();
        for thread_id in &projection_attach_thread_ids {
            if let Some(thread_entry) = state.threads.get_mut(thread_id) {
                thread_entry.projection_attach_leases.remove(&connection_id);
            }
        }

        ordinary_thread_ids
            .into_iter()
            .chain(projection_attach_thread_ids)
            .collect::<HashSet<_>>()
            .into_iter()
            .filter(|thread_id| {
                state
                    .threads
                    .get(thread_id)
                    .is_some_and(|thread_entry| thread_entry.connection_ids.is_empty())
            })
            .collect::<Vec<_>>()
    }
}
```

The filter must remain based on `connection_ids.is_empty()`. Do not inspect
`projection_attach_leases` when deciding whether ordinary teardown reconciliation is needed.

- [ ] **Step 7: Add test-only inspection helpers**

Add these helpers in `impl ThreadStateManager`:

```rust
#[cfg(test)]
pub(crate) async fn has_thread_entry(&self, thread_id: ThreadId) -> bool {
    self.state.lock().await.threads.contains_key(&thread_id)
}

#[cfg(test)]
pub(crate) async fn has_projection_attach_lease(
    &self,
    thread_id: ThreadId,
    connection_id: ConnectionId,
) -> bool {
    self.state
        .lock()
        .await
        .threads
        .get(&thread_id)
        .is_some_and(|thread_entry| {
            thread_entry.projection_attach_leases.contains(&connection_id)
        })
}
```

- [ ] **Step 8: Run ThreadStateManager tests**

Run from `codex-rs`:

```bash
cargo test -p codex-app-server projection_attach_lease --no-fail-fast
cargo test -p codex-app-server remove_connection_cleans_projection_attach_lease --no-fail-fast
cargo test -p codex-app-server remove_thread_state_cleans_projection_attach_lease_index --no-fail-fast
```

Expected after implementation: all targeted tests pass.

- [ ] **Step 9: Commit Task 1**

Commit only the `thread_state.rs` changes:

```bash
git add codex-rs/app-server/src/thread_state.rs
git commit -m "fix(app-server): track projection attach leases"
```

## Task 2: Integrate Leases Into Projection Attach Preparation

**Files:**
- Modify: `codex-rs/app-server/src/request_processors/thread_projection.rs`

- [ ] **Step 1: Replace check-only thread state acquisition**

In `prepare_projection_attach`, replace:

```rust
.try_thread_state_for_live_connection(thread_id, request_id.connection_id)
```

with:

```rust
.try_begin_projection_attach(thread_id, request_id.connection_id)
```

Keep the existing closed-connection `Ok(None)` behavior and debug log.

- [ ] **Step 2: Release the lease if listener startup fails**

Change the listener startup block from:

```rust
self.ensure_listener_task_running(thread_id, thread, thread_state.clone())
    .await?;
```

to:

```rust
if let Err(error) = self
    .ensure_listener_task_running(thread_id, thread, thread_state.clone())
    .await
{
    self.thread_state_manager
        .release_projection_attach_lease(thread_id, request_id.connection_id)
        .await;
    return Err(error);
}
```

- [ ] **Step 3: Release the lease if enqueueing fails**

In `thread_projection_attach`, replace the direct `enqueue_projection_attach_response(...).await?`
with explicit error handling:

```rust
let enqueue_result = enqueue_projection_attach_response(
    attach.thread_state,
    attach.thread_id,
    request_id.clone(),
    projection_generation,
    snapshot_processor,
)
.await;
if let Err(error) = enqueue_result {
    self.thread_state_manager
        .release_projection_attach_lease(thread_id, request_id.connection_id)
        .await;
    return Err(error);
}
```

Keep `Ok(None)` after the enqueue succeeds.

- [ ] **Step 4: Run targeted compile check**

Run from `codex-rs`:

```bash
cargo test -p codex-app-server projection_attach_lease --no-fail-fast
```

Expected after implementation: the ThreadStateManager lease tests from Task 1 still pass and the
request processor compiles against `try_begin_projection_attach(...)`.

- [ ] **Step 5: Commit Task 2**

Commit only the request-processor integration:

```bash
git add codex-rs/app-server/src/request_processors/thread_projection.rs
git commit -m "fix(app-server): release projection attach lease on enqueue failure"
```

## Task 3: Release Leases In Projection Attach Runtime

**Files:**
- Modify: `codex-rs/app-server/src/thread_projection_runtime.rs`

- [ ] **Step 1: Update the runtime harness to create production-like leases**

In `ProjectionAttachHarness::new`, after `projection_runtime_harness(...)` returns and before
capturing `projection_generation`, begin the projection attach lease:

```rust
thread_state_manager
    .try_begin_projection_attach(runtime.thread_id, connection_id)
    .await
    .expect("live connection should begin projection attach");
```

Add this helper to `impl ProjectionAttachHarness`:

```rust
async fn assert_no_projection_attach_lease(&self) {
    assert!(
        !self
            .thread_state_manager
            .has_projection_attach_lease(self.thread_id(), self.connection_id)
            .await
    );
}
```

Change `remove_connection` to return the cleanup result so tests can assert it:

```rust
async fn remove_connection(&self) -> Vec<ThreadId> {
    self.thread_state_manager
        .remove_connection(self.connection_id)
        .await
}
```

- [ ] **Step 2: Add a failing connection-close-during-snapshot regression test**

Add this test near the existing projection attach runtime tests:

```rust
#[tokio::test]
async fn attach_response_after_connection_close_during_snapshot_read_releases_lease()
-> anyhow::Result<()> {
    let mut harness = ProjectionAttachHarness::new().await?;
    let (entered_tx, entered_rx) = oneshot::channel();
    let (resume_tx, resume_rx) = oneshot::channel();
    let _hook = ThreadRequestProcessor::install_projection_snapshot_read_test_hook(
        harness.thread_id(),
        entered_tx,
        resume_rx,
    );

    let attach_task = harness.spawn_handle_attach();

    timeout(Duration::from_secs(1), entered_rx)
        .await
        .expect("handler should enter snapshot read")
        .expect("snapshot read hook should signal entry");
    assert!(
        harness
            .thread_state_manager
            .has_projection_attach_lease(harness.thread_id(), harness.connection_id)
            .await
    );
    let cleanup = harness.remove_connection().await;
    assert_eq!(cleanup, vec![harness.thread_id()]);
    resume_tx
        .send(())
        .expect("snapshot read hook should still be waiting");
    timeout(Duration::from_secs(1), attach_task)
        .await
        .expect("attach task should finish")
        .expect("attach task should not panic");

    harness.assert_no_projection_attach_lease().await;
    let projection_cleanup = harness.remove_projection_connection().await;
    assert_eq!(projection_cleanup, Vec::new());
    harness.assert_no_projection_delivery().await;
    assert!(
        timeout(Duration::from_millis(50), harness.outgoing_rx.recv())
            .await
            .is_err(),
        "closed connection path should not send an attach response"
    );
    Ok(())
}
```

Expected before runtime release implementation: this test may fail because the lease remains when
`skip_projection_attach_after_connection_closed(...)` returns.

- [ ] **Step 3: Release leases on all early returns**

In `handle_projection_attach_response`, call:

```rust
thread_state_manager
    .release_projection_attach_lease(conversation_id, connection_id)
    .await;
```

before each return in these branches:

- first `reject_projection_attach_for_closing_thread(...)`
- `capture_snapshot_cut_if_generation_matches(...)` stale branch
- snapshot read `Err(error)` branch
- `skip_projection_attach_after_connection_closed(...)`
- second `reject_projection_attach_for_closing_thread(...)`
- `ProjectionAttachAttempt::StaleThreadGeneration`

For example, the first branch should become:

```rust
if reject_projection_attach_for_closing_thread(
    pending_thread_unloads,
    outgoing,
    request_id.clone(),
    conversation_id,
)
.await
{
    thread_state_manager
        .release_projection_attach_lease(conversation_id, connection_id)
        .await;
    return;
}
```

Apply the same explicit release pattern to every branch listed above.

- [ ] **Step 4: Release lease after successful PM attach**

Immediately after `attach_if_generation_matches(...)` returns `Attached(attach_result)` and before
`remove_projection_attach_after_connection_closed(...)`, release the lease:

```rust
thread_state_manager
    .release_projection_attach_lease(conversation_id, connection_id)
    .await;
```

Keep the existing late connection-close cleanup after that release. It must still detach the
projection subscription from `ThreadProjectionManager` if the connection closed after PM attach.

- [ ] **Step 5: Update existing runtime assertions**

In existing runtime tests that call `harness.handle_attach().await`, add
`harness.assert_no_projection_attach_lease().await` after the attach path finishes. At minimum update:

```rust
attach_snapshot_cut_excludes_persisted_event_not_processed_by_projection
attach_response_after_connection_close_does_not_subscribe
connection_close_interleaving_does_not_leave_projection_subscription
attach_response_after_thread_teardown_does_not_recreate_projection_subscription
attach_response_after_thread_teardown_during_snapshot_read_does_not_subscribe
late_connection_close_cleanup_removes_projection_attach_race
```

If any test intentionally checks the lease while attach is still blocked, assert the lease exists
before the close and is absent after the task finishes.

- [ ] **Step 6: Run projection runtime tests**

Run from `codex-rs`:

```bash
cargo test -p codex-app-server attach_response_after_connection_close_during_snapshot_read_releases_lease --no-fail-fast
cargo test -p codex-app-server thread_projection_runtime --no-fail-fast
```

Expected after implementation: all targeted runtime tests pass.

- [ ] **Step 7: Commit Task 3**

Commit only the runtime integration:

```bash
git add codex-rs/app-server/src/thread_projection_runtime.rs
git commit -m "fix(app-server): clear projection attach leases in runtime"
```

## Task 4: Update Issue Status And Run Final Verification

**Files:**
- Modify: `docs/superpowers/issues/2026-05-19-projection-atomicity-review.md`

- [ ] **Step 1: Update Finding 2 status**

In `docs/superpowers/issues/2026-05-19-projection-atomicity-review.md`, change the top status bullet for Finding 2 from open to fixed. Use wording like:

```markdown
- Finding 2：已修复。projection attach 准备阶段现在通过 projection-only attach lease
  登记 pending attach 状态；该状态使用独立反向索引，不写入 ordinary
  `thread_ids_by_connection` 或 `ThreadEntry.connection_ids`，并会在 attach 成功、失败、
  stale generation、snapshot error 和 connection close 路径显式释放。
```

In the Finding 2 section, add a short “状态：已修复” paragraph above the old analysis:

```markdown
状态：已修复。`prepare_projection_attach` 不再调用 check-only
`try_thread_state_for_live_connection`。它改为创建 projection-only attach lease；connection close
会通过 projection 专用反向索引清理 lease，并且该 lease 不会进入 ordinary thread subscriber fanout。
```

Do not mark Finding 3 fixed.

- [ ] **Step 2: Run formatting**

Run from `codex-rs` after all Rust edits:

```bash
just fmt
```

Expected: command exits 0.

- [ ] **Step 3: Run targeted app-server projection tests**

Run from `codex-rs`:

```bash
cargo test -p codex-app-server projection_attach_lease --no-fail-fast
cargo test -p codex-app-server attach_response_after_connection_close_during_snapshot_read_releases_lease --no-fail-fast
cargo test -p codex-app-server thread_projection --no-fail-fast
```

Expected: all commands exit 0.

- [ ] **Step 4: Run scoped lint fix**

Run from `codex-rs`:

```bash
just fix -p codex-app-server
```

Expected: command exits 0 or applies only codex-app-server lint fixes. Do not rerun tests after `fix` per repo instruction.

- [ ] **Step 5: Check diff hygiene**

Run from repo root:

```bash
git diff --check
git status --short
```

Expected: `git diff --check` exits 0. `git status --short` shows only the intended files:

```text
 M codex-rs/app-server/src/thread_state.rs
 M codex-rs/app-server/src/request_processors/thread_projection.rs
 M codex-rs/app-server/src/thread_projection_runtime.rs
 M docs/superpowers/issues/2026-05-19-projection-atomicity-review.md
```

- [ ] **Step 6: Commit Task 4**

Commit the final issue update and any formatting/lint adjustments:

```bash
git add codex-rs/app-server/src/thread_state.rs \
  codex-rs/app-server/src/request_processors/thread_projection.rs \
  codex-rs/app-server/src/thread_projection_runtime.rs \
  docs/superpowers/issues/2026-05-19-projection-atomicity-review.md
git commit -m "test(app-server): cover projection attach lease cleanup"
```

If Tasks 1-3 were already committed cleanly and Task 4 only changes the issue document, use:

```bash
git add docs/superpowers/issues/2026-05-19-projection-atomicity-review.md
git commit -m "docs(app-server): mark projection attach lease fixed"
```

## Final Review Checklist

- [ ] `thread_ids_by_connection` remains ordinary-subscription-only.
- [ ] `ThreadEntry.connection_ids` remains ordinary-subscription-only.
- [ ] `subscribed_connection_ids(...)` ignores projection attach leases.
- [ ] `has_connections_watcher` is not updated by projection attach leases.
- [ ] `remove_connection(...)` cleans projection attach leases and deduplicates returned thread ids.
- [ ] `remove_connection(...)` does not return a thread merely because a projection lease was removed while another ordinary subscriber remains.
- [ ] Every `handle_projection_attach_response(...)` return path after lease creation releases the lease.
- [ ] Successful attach releases the lease while leaving the PM projection subscription intact.
- [ ] Finding 3 remains open in the issue document.
