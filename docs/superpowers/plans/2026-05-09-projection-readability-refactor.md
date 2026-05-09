# Projection Readability Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 重构当前分支相对 `rust-v0.130.0` 引入的 GUI projection 手写代码，让核心流程更易读，同时不扩大对上游代码的侵入。

**Architecture:** 保持 projection 主体逻辑在当前分支新增文件中。对复杂函数做同模块内局部提取，让既有上游文件继续只承担薄挂接点。行为、协议、schema 和测试语义保持不变。

**Tech Stack:** Rust, Tokio, app-server v2 JSON-RPC protocol, Cargo tests, `just fmt`.

---

## 全局约束

- 不修改 `codex-rs/app-server-protocol/schema/**`。
- 不修改 `rust-v0.130.0` 原始无关代码。
- 不重构上游既有主体流程。
- 不引入 trait、泛型参数对象、复杂 service 层或跨模块大搬迁。
- helper 只在明显提升可读性时添加。
- 每个任务完成后运行指定的局部测试或格式化检查。

## Task 1: 重构 `thread_projection_attach` 主流程

**Files:**
- Modify: `codex-rs/app-server/src/request_processors/thread_projection.rs`

- [ ] **Step 1: 记录当前测试基线**

Run:

```bash
cd codex-rs
cargo test -p codex-app-server thread_projection_attach
```

Expected: 如果没有精确匹配测试，Cargo 会报告过滤后测试数量；这一步只用于确认命令可运行，不要求新增测试。

- [ ] **Step 2: 提取 attach 目标解析**

在 `thread_projection.rs` 中新增同模块 helper：

```rust
async fn load_projection_thread(
    processor: &ThreadRequestProcessor,
    params: ThreadProjectionAttachParams,
) -> Result<(ThreadId, Arc<CodexThread>), JSONRPCErrorError> {
    let thread_id = ThreadId::from_string(&params.thread_id)
        .map_err(|err| invalid_request(format!("invalid thread id: {err}")))?;
    let thread = processor
        .thread_manager
        .get_thread(thread_id)
        .await
        .map_err(|_| invalid_request(format!("thread not found: {thread_id}")))?;
    Ok((thread_id, thread))
}
```

`get_thread` 当前返回 `Arc<CodexThread>`；如果编译缺少导入，只在本文件添加 `use codex_core::CodexThread;`。

- [ ] **Step 3: 提取卸载状态检查**

只有在不需要扩大可见性或新增复杂导入时才新增 helper：

```rust
async fn reject_projection_attach_if_thread_is_closing(
    pending_thread_unloads: &Arc<Mutex<HashSet<ThreadId>>>,
    thread_id: ThreadId,
) -> Result<(), JSONRPCErrorError> {
    if pending_thread_unloads.lock().await.contains(&thread_id) {
        return Err(invalid_request(format!(
            "thread {thread_id} is closing; retry thread/projection/attach after the thread is closed"
        )));
    }
    Ok(())
}
```

- [ ] **Step 4: 提取 live thread state 获取**

新增 helper：

```rust
async fn thread_state_for_projection_attach(
    processor: &ThreadRequestProcessor,
    thread_id: ThreadId,
    connection_id: ConnectionId,
) -> Option<Arc<Mutex<crate::thread_state::ThreadState>>> {
    processor
        .thread_state_manager
        .try_thread_state_for_live_connection(thread_id, connection_id)
        .await
}
```

如果这个 helper 需要引入额外可见性调整，放弃此 helper，保留原有 `let Some(thread_state) = ... else` 结构；不要为了这个 helper 修改上游类型可见性。

- [ ] **Step 5: 提取 listener command 投递**

新增 helper，把 `listener_command_tx` 获取、oneshot 创建、command send 和 completion await 放在一起：

```rust
async fn enqueue_projection_attach_response(
    thread_state: Arc<Mutex<crate::thread_state::ThreadState>>,
    thread_id: ThreadId,
    request_id: ConnectionRequestId,
    snapshot: crate::thread_projection_runtime::ThreadProjectionSnapshotFuture,
) -> Result<(), JSONRPCErrorError> {
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
    Ok(())
}
```

This preserves the current thread-specific error messages.

- [ ] **Step 6: Rewrite `thread_projection_attach` as a linear orchestration function**

Target shape:

```rust
pub(crate) async fn thread_projection_attach(
    &self,
    request_id: &ConnectionRequestId,
    params: ThreadProjectionAttachParams,
) -> Result<Option<ClientResponsePayload>, JSONRPCErrorError> {
    let (thread_id, thread) = load_projection_thread(self, params).await?;
    reject_projection_attach_if_thread_is_closing(&self.pending_thread_unloads, thread_id).await?;

    let Some(thread_state) =
        thread_state_for_projection_attach(self, thread_id, request_id.connection_id).await
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

    let snapshot = self.thread_projection_snapshot_future(thread_id);
    enqueue_projection_attach_response(thread_state, thread_id, request_id.clone(), snapshot)
        .await?;
    Ok(None)
}
```

如果新增 `thread_projection_snapshot_future` 会导致只用一次的小 helper，保留原来的 `Box::pin(async move { ... })`，不要过度拆分。

- [ ] **Step 7: Run focused tests**

Run:

```bash
cd codex-rs
cargo test -p codex-app-server thread_projection
```

Expected: projection 相关 app-server 测试通过。

## Task 2: 重构 projection snapshot 构造

**Files:**
- Modify: `codex-rs/app-server/src/request_processors/thread_projection.rs`

- [ ] **Step 1: 提取基础 thread view 读取**

新增 helper：

```rust
async fn read_projection_base_thread_view(
    processor: &ThreadRequestProcessor,
    thread_id: ThreadId,
) -> Result<Thread, ThreadReadViewError> {
    match processor.read_thread_view(thread_id, /*include_turns*/ true).await {
        Ok(thread) => Ok(thread),
        Err(ThreadReadViewError::InvalidRequest(message))
            if message
                == format!(
                    "thread {thread_id} is not materialized yet; includeTurns is unavailable before first user message"
                ) =>
        {
            processor
                .read_thread_view(thread_id, /*include_turns*/ false)
                .await
        }
        Err(err) => Err(err),
    }
}
```

- [ ] **Step 2: 提取 live active turn 合并**

新增 helper：

```rust
async fn merge_live_projection_state(
    processor: &ThreadRequestProcessor,
    thread_id: ThreadId,
    thread: &mut Thread,
) {
    let thread_state = processor.thread_state_manager.thread_state(thread_id).await;
    let active_turn = thread_state.lock().await.active_turn_snapshot();
    let has_live_in_progress_turn = active_turn
        .as_ref()
        .is_some_and(|turn| matches!(turn.status, TurnStatus::InProgress));
    if let Some(active_turn) = active_turn {
        merge_turn_history_with_active_turn(&mut thread.turns, active_turn);
    }
    if has_live_in_progress_turn {
        let thread_status = processor
            .thread_watch_manager
            .loaded_status_for_thread(&thread.id)
            .await;
        set_thread_status_and_interrupt_stale_turns(
            thread,
            thread_status,
            has_live_in_progress_turn,
        );
    }
}
```

- [ ] **Step 3: Simplify `read_thread_projection_snapshot`**

Target shape:

```rust
pub(super) async fn read_thread_projection_snapshot(
    &self,
    thread_id: ThreadId,
) -> Result<Thread, ThreadReadViewError> {
    let mut thread = read_projection_base_thread_view(self, thread_id).await?;
    merge_live_projection_state(self, thread_id, &mut thread).await;
    Ok(thread)
}
```

- [ ] **Step 4: Run focused tests**

Run:

```bash
cd codex-rs
cargo test -p codex-app-server thread_read_loaded_include_turns_preserves_history_and_projection_merges_active_turn
```

Expected: test passes.

## Task 3: 重构 `handle_projection_attach_response`

**Files:**
- Modify: `codex-rs/app-server/src/thread_projection_runtime.rs`

- [ ] **Step 1: 提取 closing 检查**

新增 helper：

```rust
async fn projection_thread_is_closing(
    pending_thread_unloads: &Arc<Mutex<HashSet<ThreadId>>>,
    conversation_id: ThreadId,
) -> bool {
    pending_thread_unloads.lock().await.contains(&conversation_id)
}
```

- [ ] **Step 2: 提取 closing error 发送**

新增 helper：

```rust
async fn send_projection_attach_closing_error(
    outgoing: &Arc<OutgoingMessageSender>,
    request_id: ConnectionRequestId,
    conversation_id: ThreadId,
) {
    outgoing
        .send_error(
            request_id,
            invalid_request(format!(
                "thread {conversation_id} is closing; retry thread/projection/attach after the thread is closed"
            )),
        )
        .await;
}
```

- [ ] **Step 3: 提取 attach 后连接关闭清理**

新增 helper：

```rust
async fn remove_projection_attach_for_closed_connection(
    outgoing: &Arc<OutgoingMessageSender>,
    conversation_id: ThreadId,
    connection_id: ConnectionId,
) {
    let _ = outgoing
        .thread_projection_manager()
        .detach(conversation_id, connection_id)
        .await;
    tracing::debug!(
        thread_id = %conversation_id,
        connection_id = ?connection_id,
        "removed thread projection attach after connection closed"
    );
}
```

- [ ] **Step 4: Rewrite function to show the race checks linearly**

Keep the same order:

1. closing check before snapshot
2. await snapshot
3. live connection check
4. closing check after snapshot
5. attach
6. live connection check after attach
7. send response

- [ ] **Step 5: Run focused tests**

Run:

```bash
cd codex-rs
cargo test -p codex-app-server attach_response_after_connection_close_does_not_subscribe
```

Expected: test passes.

## Task 4: 整理 `ThreadProjectionManager`

**Files:**
- Modify: `codex-rs/app-server/src/thread_projection.rs`

- [ ] **Step 1: 提取 subscriber state update helper**

新增私有 helper，用于在 subscriber 数量从 0 到非 0 或非 0 到 0 时发送 watch：

```rust
impl ThreadEntry {
    fn update_has_subscribers(&self) {
        let _ = self.has_subscribers_tx.send(!self.subscribers.is_empty());
    }
}
```

Implementation note: 如果会导致重复发送但不影响行为，可接受；如果希望保持原行为，只在 attach/detach/remove_connection 中保留 `had_subscribers` 判断。

- [ ] **Step 2: 提取 connection index 操作**

在 `ThreadProjectionManagerInner` 中新增：

```rust
fn add_connection_thread_index(&mut self, connection_id: ConnectionId, thread_id: ThreadId) {
    self.connection_index
        .entry(connection_id)
        .or_default()
        .insert(thread_id);
}

fn remove_connection_thread_index(&mut self, connection_id: ConnectionId, thread_id: ThreadId) {
    if let Some(thread_ids) = self.connection_index.get_mut(&connection_id) {
        thread_ids.remove(&thread_id);
        if thread_ids.is_empty() {
            self.connection_index.remove(&connection_id);
        }
    }
}
```

- [ ] **Step 3: Use helpers in attach/detach/remove_thread**

Keep data structure unchanged. Only replace repeated index manipulation with helpers.

- [ ] **Step 4: Keep `project_notification` behavior unchanged**

Do not split event mapping unless it clearly improves readability without adding indirection. If split, use one helper:

```rust
fn projection_event_from_notification(
    notification: &ServerNotification,
) -> Option<ThreadProjectionEvent> {
    match notification {
        ServerNotification::TurnStarted(notification) => Some(ThreadProjectionEvent::TurnStarted {
            notification: notification.clone(),
        }),
        ServerNotification::TurnCompleted(notification) => {
            Some(ThreadProjectionEvent::TurnCompleted {
                notification: notification.clone(),
            })
        }
        ServerNotification::ItemStarted(notification) => Some(ThreadProjectionEvent::ItemStarted {
            notification: notification.clone(),
        }),
        ServerNotification::ItemCompleted(notification) => {
            Some(ThreadProjectionEvent::ItemCompleted {
                notification: notification.clone(),
            })
        }
        _ => None,
    }
}
```

- [ ] **Step 5: Run manager tests**

Run:

```bash
cd codex-rs
cargo test -p codex-app-server thread_projection::
```

Expected: module tests compile and pass. If Cargo filter does not match module path as expected, run `cargo test -p codex-app-server projection`.

## Task 5: Simplify projection unload readability without rewriting lifecycle

**Files:**
- Modify: `codex-rs/app-server/src/request_processors/thread_lifecycle.rs`

- [ ] **Step 1: Extract unload target calculation**

Inside `impl UnloadingState`, add:

```rust
fn inactive_since_if_unloadable(&self) -> Option<Instant> {
    match (self.has_subscribers, self.is_active) {
        ((false, has_no_subscribers_since), (false, is_inactive_since)) => self
            .projection_subscribers
            .no_subscribers_since()
            .map(|has_no_projection_subscribers_since| {
                std::cmp::max(
                    std::cmp::max(has_no_subscribers_since, has_no_projection_subscribers_since),
                    is_inactive_since,
                )
            }),
        _ => None,
    }
}
```

- [ ] **Step 2: Make `unloading_target` one line of intent**

Rewrite:

```rust
fn unloading_target(&self) -> Option<Instant> {
    self.inactive_since_if_unloadable()
        .map(|inactive_since| inactive_since + self.delay)
}
```

- [ ] **Step 3: Do not otherwise change lifecycle logic**

No changes to select loop, pending unload map, cancellation, or thread removal except formatting caused by rustfmt.

- [ ] **Step 4: Run lifecycle-related projection tests**

Run:

```bash
cd codex-rs
cargo test -p codex-app-server thread_projection
```

Expected: projection tests pass.

## Task 6: Review thin upstream hook points

**Files:**
- Inspect only unless a hook has become unnecessarily complex:
  - `codex-rs/app-server/src/message_processor.rs`
  - `codex-rs/app-server/src/outgoing_message.rs`
  - `codex-rs/app-server/src/thread_state.rs`
  - `codex-rs/app-server/src/request_processors/thread_processor.rs`
  - `codex-rs/tui/src/app/app_server_event_targets.rs`
  - `codex-rs/tui/src/chatwidget.rs`

- [ ] **Step 1: Check hook size**

Run:

```bash
git diff --unified=20 rust-v0.130.0^{}..HEAD -- \
  codex-rs/app-server/src/message_processor.rs \
  codex-rs/app-server/src/outgoing_message.rs \
  codex-rs/app-server/src/thread_state.rs \
  codex-rs/app-server/src/request_processors/thread_processor.rs \
  codex-rs/tui/src/app/app_server_event_targets.rs \
  codex-rs/tui/src/chatwidget.rs
```

- [ ] **Step 2: Only thin hooks may remain**

Acceptable hook shapes:

- one match arm forwarding `thread/projection/*`
- one call to projection cleanup on connection close
- one projection fanout call in thread-scoped notification send
- one enum command for ordered attach response
- one TUI ignore branch

If a hook contains more complex projection logic, move only that projection-specific logic into an existing projection module.

- [ ] **Step 3: Do not refactor unrelated upstream code**

No changes to original message routing, TUI notification handling, thread read logic, or request processor structure.

## Task 7: Format and verify

**Files:**
- All modified Rust files.

- [ ] **Step 1: Format**

Run:

```bash
cd codex-rs
just fmt
```

Expected: command exits 0.

- [ ] **Step 2: App-server protocol tests**

Run:

```bash
cd codex-rs
cargo test -p codex-app-server-protocol
```

Expected: tests pass.

- [ ] **Step 3: App-server projection tests**

Run:

```bash
cd codex-rs
cargo test -p codex-app-server thread_projection
```

Expected: tests pass.

- [ ] **Step 4: Diff review**

Run:

```bash
git diff --stat rust-v0.130.0^{}..HEAD -- ':!codex-rs/app-server-protocol/schema/**'
git diff --check
```

Expected:

- no whitespace errors
- no generated schema changes from manual edits
- upstream hook files are not substantially larger than before

## Task 8: Final review checklist

- [ ] `thread_projection_attach` reads as a short orchestration function.
- [ ] snapshot construction is split into base read plus live-state merge.
- [ ] attach response race handling is clear and still ordered by listener command.
- [ ] `ThreadProjectionManager` keeps the same data structure and behavior.
- [ ] lifecycle unload condition is clearer without rewriting the state machine.
- [ ] no unrelated `rust-v0.130.0` code was refactored.
- [ ] no generated files were manually edited.
- [ ] verification commands from Task 7 were run and their results recorded.
