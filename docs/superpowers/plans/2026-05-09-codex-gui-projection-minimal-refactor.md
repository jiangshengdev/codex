# Codex GUI Projection Minimal Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 基于最近提交 `bc42b205` 收缩 GUI projection Rust 实现的侵入面，尽量保留 `rust-v0.129.0` 历史代码结构，只保留必要 hook，并把新增逻辑提取到新文件。

**Architecture:** 保留现有 protocol/schema/test 大方向，重构 app-server runtime 层。projection 的 attach/detach/snapshot 处理移动到新的 request processor 子模块；listener 内的 attach response 处理和 unload watcher 辅助逻辑移动到 projection runtime 模块；`thread_processor.rs` 和 `thread_lifecycle.rs` 只保留薄 hook。

**Tech Stack:** Rust, codex-app-server, codex-app-server-protocol v2, tokio watch/oneshot, existing app-server integration test harness.

---

## Scope

只处理最近提交 `bc42b205^..bc42b205` 中 GUI projection 相关实现的结构重构。

保留：

- `codex-rs/app-server-protocol/src/protocol/v2/thread_projection.rs`
- `codex-rs/app-server-protocol/src/protocol/v2/mod.rs`
- `codex-rs/app-server-protocol/src/protocol/common.rs`
- generated schema/TypeScript fixtures
- `codex-rs/app-server/src/thread_projection.rs` 的 manager 主体
- `codex-rs/app-server/tests/suite/v2/thread_projection.rs`
- `codex-rs/app-server/README.md` 中 projection API 文档

收缩：

- 不改变通用 `thread/read` 行为。
- 不在 `thread_processor.rs` 中承载 projection request 主逻辑。
- 不在 `thread_lifecycle.rs` 中承载 projection attach response 的大段业务逻辑。
- 不改变 `message_processor.rs` 原有 connection close 清理顺序。
- 不把 projection 专用测试放进 `thread_lifecycle.rs` 内联测试模块。

## File Structure

Create:

- `codex-rs/app-server/src/request_processors/thread_projection.rs`
  - 负责 `thread/projection/attach` 和 `thread/projection/detach` request handler。
  - 负责 projection snapshot 构造，包括 active turn merge。
  - 负责 detach status 从 runtime state 到 API status 的映射。

- `codex-rs/app-server/src/thread_projection_runtime.rs`
  - 负责 listener command 内 attach response 的发送逻辑。
  - 负责 projection subscriber unload watcher 的小型封装。
  - 尽量避免 `thread_lifecycle.rs` 直接理解 projection attach 细节。

Modify:

- `codex-rs/app-server/src/lib.rs`
  - 增加 `mod thread_projection_runtime;`。

- `codex-rs/app-server/src/request_processors.rs`
  - 增加 `mod thread_projection;`。

- `codex-rs/app-server/src/request_processors/thread_processor.rs`
  - 移除 projection request 主逻辑。
  - 恢复 `read_thread_view` 的历史行为。
  - 只暴露新模块需要的窄 helper。

- `codex-rs/app-server/src/request_processors/thread_lifecycle.rs`
  - 移除 projection attach response 大段 helper。
  - 移除新增内联测试。
  - unload 判断只通过新 runtime helper 接入 projection subscriber 状态。

- `codex-rs/app-server/src/thread_state.rs`
  - 保留 listener command variant，但 projection-specific future type 移到 `thread_projection_runtime.rs` 或 `request_processors/thread_projection.rs` 后引用。

- `codex-rs/app-server/src/message_processor.rs`
  - 保留 projection request route。
  - 恢复原有 close cleanup 顺序，只插入 projection cleanup。

- `codex-rs/app-server/src/outgoing_message.rs`
  - 保留 typed notification tap。
  - 如有必要，把新增 tap 测试移到更聚焦的测试位置，减少该文件测试扩张。

## Task 1: Move Projection Request Handling Out Of `thread_processor.rs`

**Files:**

- Create: `codex-rs/app-server/src/request_processors/thread_projection.rs`
- Modify: `codex-rs/app-server/src/request_processors.rs`
- Modify: `codex-rs/app-server/src/request_processors/thread_processor.rs`

- [ ] **Step 1: Add the new request processor module declaration**

In `codex-rs/app-server/src/request_processors.rs`, add the module next to `thread_processor`:

```rust
mod thread_projection;
mod thread_processor;
```

- [ ] **Step 2: Create `thread_projection.rs` with attach/detach extension methods**

Move the bodies of `ThreadRequestProcessor::thread_projection_attach` and `ThreadRequestProcessor::thread_projection_detach` from `thread_processor.rs` into:

```rust
use super::*;
use crate::thread_projection::ProjectionDetachResult;
use codex_app_server_protocol::ThreadProjectionAttachParams;
use codex_app_server_protocol::ThreadProjectionDetachParams;
use codex_app_server_protocol::ThreadProjectionDetachResponse;
use codex_app_server_protocol::ThreadProjectionDetachStatus;

impl ThreadRequestProcessor {
    pub(crate) async fn thread_projection_attach(
        &self,
        request_id: &ConnectionRequestId,
        params: ThreadProjectionAttachParams,
    ) -> Result<Option<ClientResponsePayload>, JSONRPCErrorError> {
        let thread_id = ThreadId::from_string(&params.thread_id)
            .map_err(|err| invalid_request(format!("invalid thread id: {err}")))?;
        let thread = self
            .thread_manager
            .get_thread(thread_id)
            .await
            .map_err(|_| invalid_request(format!("thread not found: {thread_id}")))?;
        if self.pending_thread_unloads.lock().await.contains(&thread_id) {
            return Err(invalid_request(format!(
                "thread {thread_id} is closing; retry thread/projection/attach after the thread is closed"
            )));
        }

        let Some(thread_state) = self
            .thread_state_manager
            .try_thread_state_for_live_connection(thread_id, request_id.connection_id)
            .await
        else {
            tracing::debug!(
                thread_id = %thread_id,
                connection_id = ?request_id.connection_id,
                "skipping thread projection attach for closed connection"
            );
            return Ok(None);
        };

        self.ensure_listener_task_running(thread_id, thread, thread_state.clone())
            .await?;

        let snapshot_processor = self.clone();
        let snapshot = Box::pin(async move {
            snapshot_processor
                .read_thread_projection_snapshot(thread_id)
                .await
                .map_err(thread_read_view_error)
        });

        let listener_command_tx = {
            let thread_state = thread_state.lock().await;
            thread_state.listener_command_tx()
        };
        let Some(listener_command_tx) = listener_command_tx else {
            return Err(internal_error(format!(
                "failed to enqueue thread projection attach for thread {thread_id}: thread listener is not running"
            )));
        };

        let (completion_tx, completion_rx) = tokio::sync::oneshot::channel();
        listener_command_tx
            .send(crate::thread_state::ThreadListenerCommand::SendThreadProjectionAttachResponse {
                request_id: request_id.clone(),
                connection_id: request_id.connection_id,
                snapshot,
                completion_tx,
            })
            .map_err(|_| {
                internal_error(format!(
                    "failed to enqueue thread projection attach for thread {thread_id}: thread listener command channel is closed"
                ))
            })?;
        completion_rx.await.map_err(|err| {
            internal_error(format!(
                "failed to complete thread projection attach for thread {thread_id}: {err}"
            ))
        })?;
        Ok(None)
    }

    pub(crate) async fn thread_projection_detach(
        &self,
        request_id: &ConnectionRequestId,
        params: ThreadProjectionDetachParams,
    ) -> Result<Option<ClientResponsePayload>, JSONRPCErrorError> {
        let thread_id = ThreadId::from_string(&params.thread_id)
            .map_err(|err| invalid_request(format!("invalid thread id: {err}")))?;
        let status = if self.thread_manager.get_thread(thread_id).await.is_err() {
            ThreadProjectionDetachStatus::NotLoaded
        } else {
            match self
                .outgoing
                .thread_projection_manager()
                .detach(thread_id, request_id.connection_id)
                .await
            {
                ProjectionDetachResult::Detached => ThreadProjectionDetachStatus::Detached,
                ProjectionDetachResult::NotSubscribed | ProjectionDetachResult::NotLoaded => {
                    ThreadProjectionDetachStatus::NotSubscribed
                }
            }
        };
        Ok(Some(ThreadProjectionDetachResponse { status }.into()))
    }
}
```

- [ ] **Step 3: Remove moved projection methods from `thread_processor.rs`**

Delete the `thread_projection_attach` and `thread_projection_detach` method definitions from `thread_processor.rs`.

- [ ] **Step 4: Remove imports that only served the moved methods**

From the top of `thread_processor.rs`, remove:

```rust
use crate::thread_projection::ProjectionDetachResult;
use codex_app_server_protocol::ThreadProjectionAttachParams;
use codex_app_server_protocol::ThreadProjectionDetachParams;
use codex_app_server_protocol::ThreadProjectionDetachResponse;
use codex_app_server_protocol::ThreadProjectionDetachStatus;
```

- [ ] **Step 5: Make helper methods visible only to sibling modules**

Change these methods in `thread_processor.rs` from private to `pub(super)`:

```rust
pub(super) async fn ensure_listener_task_running(...)
pub(super) async fn read_thread_view(...)
pub(super) async fn read_thread_projection_snapshot(...)
```

Keep the signatures otherwise unchanged in this task.

- [ ] **Step 6: Verify compile boundary**

Run:

```bash
cd codex-rs
cargo test -p codex-app-server thread_projection --no-fail-fast
```

Expected: compile reaches tests. Failures from behavior are acceptable at this step if they point to later planned cleanup.

## Task 2: Restore `thread/read` Behavior And Make Snapshot Projection-Specific

**Files:**

- Modify: `codex-rs/app-server/src/request_processors/thread_processor.rs`
- Modify: `codex-rs/app-server/src/request_processors/thread_projection.rs`
- Modify: `codex-rs/app-server/src/request_processors/thread_processor_tests.rs`

- [ ] **Step 1: Restore `read_thread_view` to historical behavior**

In `thread_processor.rs`, remove the `active_turn` block added to `read_thread_view`:

```rust
let active_turn = if include_turns && loaded_thread.is_some() {
    let thread_state = self.thread_state_manager.thread_state(thread_id).await;
    let state = thread_state.lock().await;
    state.active_turn_snapshot()
} else {
    None
};
```

Restore `has_live_in_progress_turn` to:

```rust
let has_live_in_progress_turn = if let Some(loaded_thread) = loaded_thread.as_ref() {
    matches!(loaded_thread.agent_status().await, AgentStatus::Running)
} else {
    false
};
```

Remove this merge from `read_thread_view`:

```rust
if let Some(active_turn) = active_turn {
    merge_turn_history_with_active_turn(&mut thread.turns, active_turn);
}
```

- [ ] **Step 2: Move active-turn snapshot merge into projection-only path**

In `request_processors/thread_projection.rs`, add this helper method inside the same `impl ThreadRequestProcessor` block:

```rust
pub(super) async fn read_thread_projection_snapshot(
    &self,
    thread_id: ThreadId,
) -> Result<Thread, ThreadReadViewError> {
    let mut thread = match self.read_thread_view(thread_id, /*include_turns*/ true).await {
        Ok(thread) => thread,
        Err(ThreadReadViewError::InvalidRequest(message))
            if message
                == format!(
                    "thread {thread_id} is not materialized yet; includeTurns is unavailable before first user message"
                ) =>
        {
            self.read_thread_view(thread_id, /*include_turns*/ false)
                .await?
        }
        Err(err) => return Err(err),
    };

    let thread_state = self.thread_state_manager.thread_state(thread_id).await;
    let active_turn = thread_state.lock().await.active_turn_snapshot();
    let has_live_in_progress_turn = active_turn
        .as_ref()
        .is_some_and(|turn| matches!(turn.status, TurnStatus::InProgress));
    if let Some(active_turn) = active_turn {
        merge_turn_history_with_active_turn(&mut thread.turns, active_turn);
    }
    if has_live_in_progress_turn {
        thread.status = ThreadStatus::Active { active_turn_count: 1 };
    }
    Ok(thread)
}
```

If direct `ThreadStatus::Active { active_turn_count: 1 }` does not match the actual enum shape, use the existing `set_thread_status_and_interrupt_stale_turns` helper with the loaded status from `thread_watch_manager` and `has_live_in_progress_turn`.

- [ ] **Step 3: Remove the old projection snapshot helper from `thread_processor.rs`**

Delete `read_thread_projection_snapshot` from `thread_processor.rs` after adding the new version in `request_processors/thread_projection.rs`.

- [ ] **Step 4: Update the existing unit test scope**

The current test `thread_read_loaded_include_turns_merges_active_turn_snapshot` asserts changed `thread/read` behavior. Rename and move its assertion target so it verifies projection snapshot behavior instead:

```rust
let thread = processor
    .read_thread_projection_snapshot(thread_id)
    .await
    .expect("projection snapshot should include the active turn");
```

Assert:

```rust
assert_eq!(turn_user_texts(&thread.turns), vec!["persisted"]);
let active_turn = thread
    .turns
    .last()
    .expect("active turn should be merged into projection snapshot");
assert_eq!(active_turn.id, "live-turn");
assert_eq!(active_turn.status, TurnStatus::InProgress);
```

- [ ] **Step 5: Add a regression assertion that `thread/read` remains historical**

In the same test setup, call `thread_read_response_inner` and assert it does not append `live-turn`:

```rust
let read_response = processor
    .thread_read_response_inner(ThreadReadParams {
        thread_id: thread_id.to_string(),
        include_turns: true,
    })
    .await
    .expect("thread/read should keep historical behavior");
assert!(
    read_response
        .thread
        .turns
        .iter()
        .all(|turn| turn.id != "live-turn")
);
```

- [ ] **Step 6: Run focused tests**

Run:

```bash
cd codex-rs
cargo test -p codex-app-server thread_read_loaded_include_turns
cargo test -p codex-app-server thread_projection
```

Expected: both pass after test names are adjusted to the final names.

## Task 3: Extract Listener Attach Response Runtime

**Files:**

- Create: `codex-rs/app-server/src/thread_projection_runtime.rs`
- Modify: `codex-rs/app-server/src/lib.rs`
- Modify: `codex-rs/app-server/src/request_processors/thread_lifecycle.rs`
- Modify: `codex-rs/app-server/src/thread_state.rs`

- [ ] **Step 1: Add runtime module**

In `codex-rs/app-server/src/lib.rs`, add:

```rust
mod thread_projection_runtime;
```

- [ ] **Step 2: Move snapshot future type out of `thread_state.rs`**

Create in `thread_projection_runtime.rs`:

```rust
use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;

use codex_app_server_protocol::JSONRPCErrorError;
use codex_app_server_protocol::Thread;

pub(crate) type ThreadProjectionSnapshotFuture =
    Pin<Box<dyn Future<Output = Result<Thread, JSONRPCErrorError>> + Send>>;
```

Then update `thread_state.rs` command field to:

```rust
snapshot: crate::thread_projection_runtime::ThreadProjectionSnapshotFuture,
```

Remove the now-unneeded `Future`, `Pin`, `JSONRPCErrorError`, and `Thread` imports from `thread_state.rs`.

- [ ] **Step 3: Move attach response handler into runtime module**

Move `handle_thread_projection_attach_request` from `thread_lifecycle.rs` into `thread_projection_runtime.rs` as:

```rust
pub(crate) async fn handle_projection_attach_response(
    conversation_id: ThreadId,
    pending_thread_unloads: &Arc<Mutex<HashSet<ThreadId>>>,
    outgoing: &Arc<OutgoingMessageSender>,
    thread_state_manager: &ThreadStateManager,
    request_id: ConnectionRequestId,
    connection_id: ConnectionId,
    snapshot: ThreadProjectionSnapshotFuture,
) {
    // Move the existing body unchanged, except for the function name.
}
```

Use explicit imports in the new file:

```rust
use std::collections::HashSet;
use std::sync::Arc;

use codex_app_server_protocol::ThreadProjectionAttachResponse;
use codex_app_server_protocol::ThreadProjectionSnapshot;
use codex_protocol::ThreadId;
use tokio::sync::Mutex;

use crate::error_code::invalid_request;
use crate::outgoing_message::ConnectionId;
use crate::outgoing_message::ConnectionRequestId;
use crate::outgoing_message::OutgoingMessageSender;
use crate::thread_state::ThreadStateManager;
```

- [ ] **Step 4: Replace lifecycle match arm body with a thin call**

In `thread_lifecycle.rs`, the `ThreadListenerCommand::SendThreadProjectionAttachResponse` arm should only call:

```rust
crate::thread_projection_runtime::handle_projection_attach_response(
    conversation_id,
    pending_thread_unloads,
    outgoing,
    thread_state_manager,
    request_id,
    connection_id,
    snapshot,
)
.await;
let _ = completion_tx.send(());
```

- [ ] **Step 5: Remove attach response imports from `thread_lifecycle.rs`**

Remove:

```rust
use codex_app_server_protocol::ThreadProjectionAttachResponse;
use codex_app_server_protocol::ThreadProjectionSnapshot;
```

- [ ] **Step 6: Run focused compile test**

Run:

```bash
cd codex-rs
cargo test -p codex-app-server thread_projection_attach --no-fail-fast
```

Expected: projection attach tests compile and run.

## Task 4: Encapsulate Projection Unload Watch State

**Files:**

- Modify: `codex-rs/app-server/src/thread_projection_runtime.rs`
- Modify: `codex-rs/app-server/src/request_processors/thread_lifecycle.rs`

- [ ] **Step 1: Add projection subscriber watch wrapper**

In `thread_projection_runtime.rs`, add:

```rust
use std::time::Instant;

use tokio::sync::watch;

pub(crate) struct ProjectionSubscriberWatch {
    rx: watch::Receiver<bool>,
    state: (bool, Instant),
}

impl ProjectionSubscriberWatch {
    pub(crate) fn new(rx: watch::Receiver<bool>) -> Self {
        Self {
            state: (*rx.borrow(), Instant::now()),
            rx,
        }
    }

    pub(crate) fn has_subscribers(&self) -> bool {
        self.state.0
    }

    pub(crate) fn no_subscribers_since(&self) -> Instant {
        self.state.1
    }

    pub(crate) fn sync(&mut self) {
        let has_subscribers = *self.rx.borrow();
        if self.state.0 != has_subscribers {
            self.state = (has_subscribers, Instant::now());
        }
    }

    pub(crate) async fn changed(&mut self) -> Result<(), watch::error::RecvError> {
        self.rx.changed().await?;
        self.sync();
        Ok(())
    }
}
```

- [ ] **Step 2: Reduce `UnloadingState` projection fields**

In `thread_lifecycle.rs`, replace:

```rust
has_projection_subscribers_rx: watch::Receiver<bool>,
has_projection_subscribers: (bool, Instant),
```

with:

```rust
projection_subscribers: crate::thread_projection_runtime::ProjectionSubscriberWatch,
```

- [ ] **Step 3: Keep normal subscriber state close to original**

Rename `has_normal_subscribers_rx` and `has_normal_subscribers` back to:

```rust
has_subscribers_rx: watch::Receiver<bool>,
has_subscribers: (bool, Instant),
```

This restores the historical naming for the existing subscription path.

- [ ] **Step 4: Adjust `UnloadingState::new` construction**

Build the wrapper from the projection manager watch:

```rust
let projection_subscribers =
    crate::thread_projection_runtime::ProjectionSubscriberWatch::new(
        listener_task_context
            .outgoing
            .thread_projection_manager()
            .subscribe_to_has_subscribers(thread_id)
            .await,
    );
```

- [ ] **Step 5: Adjust `unloading_target` with a small projection check**

Use:

```rust
match (self.has_subscribers, self.is_active) {
    ((false, has_no_subscribers_since), (false, is_inactive_since))
        if !self.projection_subscribers.has_subscribers() =>
    {
        Some(
            std::cmp::max(
                std::cmp::max(
                    has_no_subscribers_since,
                    self.projection_subscribers.no_subscribers_since(),
                ),
                is_inactive_since,
            ) + self.delay,
        )
    }
    _ => None,
}
```

- [ ] **Step 6: Adjust sync and select**

In `sync_receiver_values`, call:

```rust
self.projection_subscribers.sync();
```

In `wait_for_unloading_trigger`, add a select branch:

```rust
changed = self.projection_subscribers.changed() => {
    if changed.is_err() {
        return false;
    }
    self.sync_receiver_values();
},
```

- [ ] **Step 7: Move lifecycle projection tests out of `thread_lifecycle.rs`**

Delete the new `#[cfg(test)] mod tests` added at the bottom of `thread_lifecycle.rs`. Keep behavior covered by `thread_projection.rs` manager tests and integration tests.

- [ ] **Step 8: Run focused unload-related tests**

Run:

```bash
cd codex-rs
cargo test -p codex-app-server thread_projection
cargo test -p codex-app-server unload
```

Expected: projection and unload tests pass. If `unload` matches no tests, record that and rely on the projection integration tests plus full app-server test run later.

## Task 5: Restore Connection Close Ordering

**Files:**

- Modify: `codex-rs/app-server/src/message_processor.rs`

- [ ] **Step 1: Restore the original processor cleanup order**

In `MessageProcessor::connection_closed`, keep the original order:

```rust
session_state.rpc_gate.shutdown().await;
self.outgoing.connection_closed(connection_id).await;
self.fs_processor.connection_closed(connection_id).await;
self.command_exec_processor
    .connection_closed(connection_id)
    .await;
self.process_exec_processor
    .connection_closed(connection_id)
    .await;
self.thread_processor.connection_closed(connection_id).await;
```

- [ ] **Step 2: Insert projection cleanup without moving existing calls**

Add projection cleanup after `outgoing.connection_closed` and before subsystem-specific cleanup, unless tests show it must be later:

```rust
let projection_threads = self
    .outgoing
    .thread_projection_manager()
    .remove_connection(connection_id)
    .await;
if !projection_threads.is_empty() {
    tracing::debug!(
        connection_id = ?connection_id,
        thread_count = projection_threads.len(),
        "removed thread projection subscriptions for closed connection"
    );
}
```

The final order should be:

```rust
session_state.rpc_gate.shutdown().await;
self.outgoing.connection_closed(connection_id).await;
projection cleanup;
self.fs_processor.connection_closed(connection_id).await;
self.command_exec_processor.connection_closed(connection_id).await;
self.process_exec_processor.connection_closed(connection_id).await;
self.thread_processor.connection_closed(connection_id).await;
```

- [ ] **Step 3: Run connection close focused tests**

Run:

```bash
cd codex-rs
cargo test -p codex-app-server connection_closed
cargo test -p codex-app-server thread_projection_attach_after_connection_close
```

Expected: existing connection cleanup tests still pass, and projection attach close race remains covered.

## Task 6: Tighten Detach Semantics In `ThreadProjectionManager`

**Files:**

- Modify: `codex-rs/app-server/src/thread_projection.rs`
- Modify: `codex-rs/app-server/src/request_processors/thread_projection.rs`

- [ ] **Step 1: Document manager-level `NotLoaded` meaning with a rename or comment**

Prefer keeping the enum to avoid broad churn, but add a local comment:

```rust
// Manager-level NotLoaded means no projection entry exists for the thread.
// API handlers must check thread loaded state before mapping this to wire status.
```

- [ ] **Step 2: Ensure API detach maps manager `NotLoaded` for loaded threads to `NotSubscribed`**

Confirm `request_processors/thread_projection.rs` maps:

```rust
ProjectionDetachResult::NotSubscribed | ProjectionDetachResult::NotLoaded => {
    ThreadProjectionDetachStatus::NotSubscribed
}
```

after it has already confirmed `thread_manager.get_thread(thread_id).await.is_ok()`.

- [ ] **Step 3: Add a manager/API regression test**

In `codex-rs/app-server/tests/suite/v2/thread_projection.rs`, add a detach-without-attach check after `start_thread`:

```rust
let detach_id = mcp
    .send_thread_projection_detach_request(ThreadProjectionDetachParams {
        thread_id: thread.id.clone(),
    })
    .await?;
let detach_response: JSONRPCResponse = timeout(
    DEFAULT_READ_TIMEOUT,
    mcp.read_stream_until_response_message(RequestId::Integer(detach_id)),
)
.await??;
let detach: ThreadProjectionDetachResponse = to_response(detach_response)?;
assert_eq!(ThreadProjectionDetachStatus::NotSubscribed, detach.status);
```

- [ ] **Step 4: Run projection integration test**

Run:

```bash
cd codex-rs
cargo test -p codex-app-server --test suite thread_projection
```

Expected: projection integration tests pass.

## Task 7: Add TUI Compile Compatibility For New Notification Variant

**Files:**

- Modify: `codex-rs/tui/src/app/app_server_event_targets.rs`
- Modify: `codex-rs/tui/src/chatwidget.rs`
- Review: `codex-rs/tui/src/**/*.rs`

- [ ] **Step 1: Confirm the exhaustive match compile failures**

Run:

```bash
cd codex-rs
cargo test -p codex-tui --no-run
```

Expected before this task is implemented: compile fails with missing `ServerNotification::ThreadProjectionEvent(_)` arms in:

- `tui/src/app/app_server_event_targets.rs`
- `tui/src/chatwidget.rs`

- [ ] **Step 2: Treat projection events as ignored by TUI routing**

In `codex-rs/tui/src/app/app_server_event_targets.rs`, add the new notification to the existing global/non-thread-targeted group:

```rust
        | ServerNotification::WindowsWorldWritableWarning(_)
        | ServerNotification::WindowsSandboxSetupCompleted(_)
        | ServerNotification::ThreadProjectionEvent(_)
        | ServerNotification::AccountLoginCompleted(_) => None,
```

Rationale: `thread/projection/event` is a GUI projection transport envelope. The TUI should not route it as a normal thread event or unwrap its inner typed notification.

- [ ] **Step 3: Ignore projection events in chat widget notification handling**

In `codex-rs/tui/src/chatwidget.rs`, add the new notification to the existing no-op notification group:

```rust
            | ServerNotification::WindowsWorldWritableWarning(_)
            | ServerNotification::WindowsSandboxSetupCompleted(_)
            | ServerNotification::ThreadProjectionEvent(_)
            | ServerNotification::AccountLoginCompleted(_) => {}
```

Rationale: projection events are only for GUI clients that explicitly attach to projection subscriptions. The TUI already receives and handles the underlying `turn/started`, `item/completed`, and related typed notifications through the existing stream.

- [ ] **Step 4: Search for other exhaustive notification matches**

Run:

```bash
cd codex-rs
rg -n "match notification|match &notification|ServerNotification::" tui/src -g '*.rs'
```

Inspect any exhaustive matches over `ServerNotification` that do not use `_ =>`. If another compile error appears for `ThreadProjectionEvent`, handle it the same way: explicit no-op/ignored arm, with no behavior change.

- [ ] **Step 5: Run TUI compile check**

Run:

```bash
cd codex-rs
cargo test -p codex-tui --no-run
```

Expected: `codex-tui` compiles. Do not update TUI snapshots unless this task unexpectedly changes visible UI; it should not.

## Task 8: Final Formatting, Lint, And Verification

**Files:** Review all changed files.

- [ ] **Step 1: Format Rust code**

Run:

```bash
cd codex-rs
just fmt
```

Expected: rustfmt completes successfully.

- [ ] **Step 2: Run focused app-server tests**

Run:

```bash
cd codex-rs
cargo test -p codex-app-server thread_projection
cargo test -p codex-app-server --test suite thread_projection
```

Expected: both pass.

- [ ] **Step 3: Run protocol tests**

Run:

```bash
cd codex-rs
cargo test -p codex-app-server-protocol
```

Expected: protocol tests pass.

- [ ] **Step 4: Run TUI compile check**

Run:

```bash
cd codex-rs
cargo test -p codex-tui --no-run
```

Expected: TUI compiles with the new `ThreadProjectionEvent` variant explicitly ignored.

- [ ] **Step 5: Run scoped lint fix**

Run:

```bash
cd codex-rs
just fix -p codex-app-server
```

Expected: clippy fixes complete. Do not re-run tests after `fix` or `fmt`, per repository instruction.

- [ ] **Step 6: Review final diff shape**

Run:

```bash
git diff --stat HEAD^..HEAD -- ':!codex-rs/app-server-protocol/schema/**'
git diff --numstat HEAD^..HEAD -- ':!codex-rs/app-server-protocol/schema/**' | sort -nr
```

Expected:

- `thread_processor.rs` net additions are substantially lower than current `+140`.
- `thread_lifecycle.rs` net additions are substantially lower than current `+321/-15`.
- New projection-specific runtime/request files carry most of the implementation.
- No unrelated files outside the latest projection commit are changed.

- [ ] **Step 7: Review for forbidden implementation patterns**

Run:

```bash
rg -n "ProjectionEventPayload|latestSequence|projectionInstanceId|catch-up|catchup" codex-rs/app-server codex-rs/app-server-protocol
```

Expected: no implementation use of old lazy projection concepts.

## Risks To Watch

- `thread/read` must remain historical; active turn merge belongs only to projection snapshot.
- Attach response must remain ordered through listener command.
- Projection subscriber cleanup must not depend on normal thread subscription cleanup.
- Connection close ordering should preserve historical subsystem cleanup order.
- Generated schema files should not be regenerated unless protocol shapes change during refactor.
- Keep `codex-rs/core` untouched.
- TUI handling for `ThreadProjectionEvent` must be explicit no-op only; do not unwrap or replay inner projection notifications in TUI.

## Completion Criteria

- Projection API behavior from `bc42b205` remains covered and passing.
- Existing `thread/read` behavior is no longer changed by projection implementation.
- `thread_processor.rs` and `thread_lifecycle.rs` contain only thin hooks for projection.
- Projection-specific logic lives in `request_processors/thread_projection.rs`, `thread_projection.rs`, and `thread_projection_runtime.rs`.
- TUI compiles with `ThreadProjectionEvent` explicitly ignored.
- `just fmt`, focused app-server tests, and protocol tests have been run.
