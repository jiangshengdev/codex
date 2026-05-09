# rust-v0.130.0 Projection Merge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge `rust-v0.130.0` into `port/lazy-proj-129` with a merge commit while preserving the current branch's GUI thread projection feature.

**Architecture:** Treat `rust-v0.130.0` as the source of truth for upstream infrastructure and treat projection as the local feature to reapply at the app-server/app-server-protocol seams. Resolve generated schema conflicts by regenerating app-server schema after source conflicts are resolved. Keep projection semantics unchanged: attach/detach/snapshot/typed notification envelope only.

**Tech Stack:** Git merge commit, Rust, codex-app-server-protocol v2, codex-app-server, codex-thread-store, `just write-app-server-schema`, Cargo tests.

---

## File Structure

Modify during conflict resolution:

- `codex-rs/app-server-protocol/src/protocol/common.rs`: keep 130 request/notification definitions and re-add projection request/notification definitions.
- `codex-rs/app-server-protocol/src/protocol/v2/mod.rs`: keep 130 modules and re-export `thread_projection`.
- `codex-rs/app-server-protocol/src/protocol/v2/thread_projection.rs`: keep branch-added projection protocol types and tests.
- `codex-rs/app-server/src/lib.rs`: keep 130 modules and re-add projection runtime modules.
- `codex-rs/app-server/src/request_processors.rs`: keep 130 processor modules and re-add `thread_projection`.
- `codex-rs/app-server/src/message_processor.rs`: keep 130 routing/cleanup and re-add projection attach/detach routing plus projection connection cleanup.
- `codex-rs/app-server/src/outgoing_message.rs`: keep 130 outgoing behavior and re-add projection manager/tap.
- `codex-rs/app-server/src/thread_state.rs`: keep 130 state and re-add `SendThreadProjectionAttachResponse`.
- `codex-rs/app-server/src/request_processors/thread_lifecycle.rs`: keep 130 lifecycle behavior and re-add projection subscriber unload watcher plus attach response command handling.
- `codex-rs/app-server/src/request_processors/thread_processor.rs`: keep 130 read/pagination behavior and expose only the helper methods needed by `thread_projection.rs`.
- `codex-rs/app-server/src/request_processors/thread_projection.rs`: keep branch-added projection attach/detach/snapshot implementation and adjust to 130 helper signatures as needed.
- `codex-rs/app-server/tests/common/mcp_process.rs`: keep 130 helpers and projection attach/detach helpers.
- `codex-rs/app-server/tests/suite/v2/mod.rs`: keep 130 test modules and projection test module.
- `codex-rs/app-server/tests/suite/v2/thread_projection.rs`: keep branch-added integration tests.
- `codex-rs/app-server/README.md`: keep 130 docs and projection API docs.
- `codex-rs/thread-store/**`: accept 130 thread-store contract/removal changes unless a projection compile error proves a targeted adjustment is needed.
- `codex-rs/app-server-protocol/schema/**`: regenerate after source conflicts are resolved.

Delete/accept upstream removals:

- `codex-rs/app-server-protocol/src/protocol/v2/device_key.rs`
- `codex-rs/app-server/src/request_processors/device_key_processor.rs`
- `codex-rs/app-server/tests/suite/v2/device_key.rs`
- `codex-rs/device-key/**`
- `codex-rs/state/src/runtime/device_key.rs`
- `codex-rs/state/src/runtime/device_key_tests.rs`
- `codex-rs/thread-store/src/remote/**`
- `codex-rs/thread-store/examples/generate-proto.rs`
- `codex-rs/thread-store/scripts/generate-proto.sh`
- generated device-key schema/TypeScript files

## Task 1: Start The Merge Safely

**Files:**

- Review: repository state only.
- Modify: git index/worktree via merge.

- [ ] **Step 1: Verify the working tree is clean**

Run:

```bash
git status --short --branch
```

Expected output starts with:

```text
## port/lazy-proj-129
```

Expected: no modified, deleted, untracked, or staged files. If files are present, stop and inspect them before merging.

- [ ] **Step 2: Record the pre-merge safety point**

Run:

```bash
git rev-parse HEAD
git rev-parse rust-v0.130.0
git merge-base HEAD rust-v0.130.0
git rev-list --left-right --count HEAD...rust-v0.130.0
```

Expected current HEAD is the design commit `ab18532ec...` or a later intentional planning commit. Expected merge-base is `a8488fec5ef27216cae96e24eec2f18ef2374ed7`.

- [ ] **Step 3: Start the merge without auto-commit**

Run:

```bash
git merge --no-commit rust-v0.130.0
```

Expected: merge stops with conflicts. Do not commit yet.

- [ ] **Step 4: List conflicted files**

Run:

```bash
git diff --name-only --diff-filter=U
```

Expected: conflicts include app-server/app-server-protocol files such as:

```text
codex-rs/app-server-protocol/src/protocol/common.rs
codex-rs/app-server-protocol/src/protocol/v2/mod.rs
codex-rs/app-server/src/message_processor.rs
codex-rs/app-server/src/outgoing_message.rs
codex-rs/app-server/src/request_processors.rs
codex-rs/app-server/src/request_processors/thread_processor.rs
codex-rs/app-server/tests/common/mcp_process.rs
codex-rs/app-server/tests/suite/v2/mod.rs
```

The exact list may include generated schema files and upstream removals.

## Task 2: Resolve Upstream Removals And Generated Files

**Files:**

- Delete or accept upstream deletion for device-key files.
- Delete or accept upstream deletion for remote thread-store files.
- Temporarily resolve generated schema files by taking either side; final content will be regenerated in Task 8.

- [ ] **Step 1: Accept upstream deletion for removed source files**

Run:

```bash
git rm -f \
  codex-rs/app-server-protocol/src/protocol/v2/device_key.rs \
  codex-rs/app-server/src/request_processors/device_key_processor.rs \
  codex-rs/app-server/tests/suite/v2/device_key.rs \
  codex-rs/state/src/runtime/device_key.rs \
  codex-rs/state/src/runtime/device_key_tests.rs
```

Expected: files are removed or already absent.

- [ ] **Step 2: Accept upstream deletion for the device-key crate**

Run:

```bash
git rm -rf codex-rs/device-key
```

Expected: `codex-rs/device-key` is removed or already absent.

- [ ] **Step 3: Accept upstream deletion for remote thread-store implementation**

Run:

```bash
git rm -rf \
  codex-rs/thread-store/src/remote \
  codex-rs/thread-store/examples/generate-proto.rs \
  codex-rs/thread-store/scripts/generate-proto.sh
```

Expected: remote thread-store implementation files are removed or already absent.

- [ ] **Step 4: Resolve generated schema conflicts as temporary upstream files**

Run:

```bash
git diff --name-only --diff-filter=U -- codex-rs/app-server-protocol/schema \
  | xargs -r git checkout --theirs --
git diff --name-only --diff-filter=U -- codex-rs/app-server-protocol/schema \
  | xargs -r git add --
```

Expected: schema conflicts are staged in a temporary state. Task 8 will regenerate them from source and replace this content.

- [ ] **Step 5: Confirm source conflicts remain**

Run:

```bash
git diff --name-only --diff-filter=U
```

Expected: only source/docs/test conflicts remain; generated schema conflicts should be gone.

## Task 3: Resolve app-server-protocol Source Conflicts

**Files:**

- Modify: `codex-rs/app-server-protocol/src/protocol/common.rs`
- Modify: `codex-rs/app-server-protocol/src/protocol/v2/mod.rs`
- Keep: `codex-rs/app-server-protocol/src/protocol/v2/thread_projection.rs`

- [ ] **Step 1: Resolve `common.rs` request definitions**

Open `codex-rs/app-server-protocol/src/protocol/common.rs` around the `client_request_definitions!` block. Keep 130 definitions and ensure all of these entries exist once:

```rust
    ThreadProjectionAttach => "thread/projection/attach" {
        params: v2::ThreadProjectionAttachParams,
        serialization: thread_id(params.thread_id),
        response: v2::ThreadProjectionAttachResponse,
    },
    ThreadProjectionDetach => "thread/projection/detach" {
        params: v2::ThreadProjectionDetachParams,
        serialization: thread_id(params.thread_id),
        response: v2::ThreadProjectionDetachResponse,
    },
```

Also keep 130's `ThreadTurnsItemsList` entry:

```rust
    #[experimental("thread/turns/items/list")]
    ThreadTurnsItemsList => "thread/turns/items/list" {
        params: v2::ThreadTurnsItemsListParams,
        serialization: None,
        response: v2::ThreadTurnsItemsListResponse,
    },
```

Do not restore `DeviceKeyCreate`, `DeviceKeyPublic`, or `DeviceKeySign`.

- [ ] **Step 2: Resolve `common.rs` notification definitions**

In the `server_notification_definitions!` block, keep 130 notifications and ensure this projection notification exists once near the other thread notifications:

```rust
    ThreadProjectionEvent => "thread/projection/event" (v2::ThreadProjectionEventNotification),
```

Do not remove 130 notification additions such as guardian review fields, plugin/share notifications, or remote-control notifications.

- [ ] **Step 3: Resolve `v2/mod.rs`**

Open `codex-rs/app-server-protocol/src/protocol/v2/mod.rs`. Keep 130 module layout and ensure these projection lines exist:

```rust
mod thread_projection;
pub use thread_projection::*;
```

Do not restore:

```rust
mod device_key;
pub use device_key::*;
```

- [ ] **Step 4: Keep projection protocol source and tests**

Run:

```bash
test -f codex-rs/app-server-protocol/src/protocol/v2/thread_projection.rs
rg -n "ThreadProjectionAttachParams|ThreadProjectionEventNotification|deserialize_thread_projection_attach_request" codex-rs/app-server-protocol/src/protocol/v2/thread_projection.rs
```

Expected: file exists and all three symbols are found.

- [ ] **Step 5: Stage protocol source conflicts**

Run:

```bash
git add \
  codex-rs/app-server-protocol/src/protocol/common.rs \
  codex-rs/app-server-protocol/src/protocol/v2/mod.rs \
  codex-rs/app-server-protocol/src/protocol/v2/thread_projection.rs
```

Expected: these files no longer appear in `git diff --name-only --diff-filter=U`.

## Task 4: Resolve app-server Module And Request Routing Conflicts

**Files:**

- Modify: `codex-rs/app-server/src/lib.rs`
- Modify: `codex-rs/app-server/src/request_processors.rs`
- Modify: `codex-rs/app-server/src/message_processor.rs`

- [ ] **Step 1: Resolve `lib.rs` module declarations**

Open `codex-rs/app-server/src/lib.rs`. Keep 130 module declarations and ensure projection modules exist:

```rust
mod thread_projection;
mod thread_projection_runtime;
```

Do not add `device_key` modules.

- [ ] **Step 2: Resolve `request_processors.rs` module declarations**

Open `codex-rs/app-server/src/request_processors.rs`. Keep 130 declarations and ensure projection processor exists:

```rust
mod thread_projection;
```

Do not restore:

```rust
mod device_key_processor;
```

- [ ] **Step 3: Resolve `message_processor.rs` connection close cleanup**

Open `codex-rs/app-server/src/message_processor.rs` and locate `connection_closed`. Keep 130 cleanup order. Include projection cleanup once, after `self.outgoing.connection_closed(connection_id).await;` and before per-processor cleanup:

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

Remove duplicate projection cleanup if the merge produced two copies.

- [ ] **Step 4: Resolve `message_processor.rs` request dispatch**

In `handle_initialized_request`, ensure these match arms exist once near `ThreadUnsubscribe` / other thread routes:

```rust
            ClientRequest::ThreadProjectionAttach { params, .. } => {
                self.thread_processor
                    .thread_projection_attach(&request_id, params)
                    .await
            }
            ClientRequest::ThreadProjectionDetach { params, .. } => {
                self.thread_processor
                    .thread_projection_detach(&request_id, params)
                    .await
            }
```

Also keep 130's `ThreadTurnsItemsList` route:

```rust
            ClientRequest::ThreadTurnsItemsList { params, .. } => {
                self.thread_processor.thread_turns_items_list(params).await
            }
```

Do not restore device-key request routes.

- [ ] **Step 5: Stage module/routing files**

Run:

```bash
git add \
  codex-rs/app-server/src/lib.rs \
  codex-rs/app-server/src/request_processors.rs \
  codex-rs/app-server/src/message_processor.rs
```

Expected: these files no longer appear in `git diff --name-only --diff-filter=U`.

## Task 5: Resolve Projection Runtime Integration Conflicts

**Files:**

- Modify: `codex-rs/app-server/src/outgoing_message.rs`
- Modify: `codex-rs/app-server/src/thread_state.rs`
- Modify: `codex-rs/app-server/src/request_processors/thread_lifecycle.rs`
- Keep: `codex-rs/app-server/src/thread_projection.rs`
- Keep: `codex-rs/app-server/src/thread_projection_runtime.rs`

- [ ] **Step 1: Resolve `outgoing_message.rs` imports and struct field**

Open `codex-rs/app-server/src/outgoing_message.rs`. Ensure the projection manager import exists:

```rust
use crate::thread_projection::ThreadProjectionManager;
```

Ensure `OutgoingMessageSender` has this field:

```rust
    thread_projection_manager: ThreadProjectionManager,
```

Ensure `OutgoingMessageSender::new` initializes it:

```rust
            thread_projection_manager: ThreadProjectionManager::new(),
```

Ensure this accessor exists:

```rust
    pub(crate) fn thread_projection_manager(&self) -> ThreadProjectionManager {
        self.thread_projection_manager.clone()
    }
```

- [ ] **Step 2: Resolve `ThreadScopedOutgoingMessageSender::send_server_notification`**

Ensure `send_server_notification` tracks analytics, sends projection envelopes, and then sends the original notification to regular thread subscribers:

```rust
    pub(crate) async fn send_server_notification(&self, notification: ServerNotification) {
        self.outgoing
            .analytics_events_client
            .track_notification(notification.clone());
        for delivery in self
            .outgoing
            .thread_projection_manager()
            .project_notification(self.thread_id, &notification)
            .await
        {
            self.outgoing
                .send_server_notification_to_connections(
                    &[delivery.connection_id],
                    ServerNotification::ThreadProjectionEvent(delivery.notification),
                )
                .await;
        }
        if self.connection_ids.is_empty() {
            return;
        }
        self.outgoing
            .send_server_notification_to_connections(self.connection_ids.as_slice(), notification)
            .await;
    }
```

If 130 added extra logic in this method, preserve it unless it changes this ordering. Projection envelope must be sent before regular typed notification for the same event.

- [ ] **Step 3: Resolve `thread_state.rs` listener command**

Open `codex-rs/app-server/src/thread_state.rs`. Ensure `ThreadListenerCommand` includes:

```rust
    SendThreadProjectionAttachResponse {
        request_id: ConnectionRequestId,
        connection_id: ConnectionId,
        snapshot: crate::thread_projection_runtime::ThreadProjectionSnapshotFuture,
        completion_tx: oneshot::Sender<()>,
    },
```

Keep all 130 variants. Do not remove `ResolveServerRequest`, goal variants, or resume variants.

- [ ] **Step 4: Resolve `thread_lifecycle.rs` unloading state**

Open `codex-rs/app-server/src/request_processors/thread_lifecycle.rs`. Ensure `UnloadingState` includes projection subscribers:

```rust
    projection_subscribers: crate::thread_projection_runtime::ProjectionSubscriberWatch,
```

Ensure `UnloadingState::new` subscribes through the projection manager:

```rust
        let has_projection_subscribers_rx = listener_task_context
            .outgoing
            .thread_projection_manager()
            .subscribe_to_has_subscribers(thread_id)
            .await;
        let projection_subscribers =
            crate::thread_projection_runtime::ProjectionSubscriberWatch::new(
                has_projection_subscribers_rx,
            );
```

Ensure `unloading_target`, `sync_receiver_values`, and `wait_for_unloading_trigger` include `projection_subscribers`, so a projection subscriber prevents unload.

- [ ] **Step 5: Resolve `thread_lifecycle.rs` unload cleanup**

Ensure `unload_thread_without_subscribers` removes projection state before removing thread state:

```rust
    outgoing
        .thread_projection_manager()
        .remove_thread(thread_id)
        .await;
    thread_state_manager.remove_thread_state(thread_id).await;
```

Keep 130's pending request cancellation and thread shutdown behavior.

- [ ] **Step 6: Resolve `thread_lifecycle.rs` listener command handling**

In `handle_thread_listener_command`, keep 130 command handling and add:

```rust
        ThreadListenerCommand::SendThreadProjectionAttachResponse {
            request_id,
            connection_id,
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
                snapshot,
            )
            .await;
            let _ = completion_tx.send(());
        }
```

The function signature must include:

```rust
    pending_thread_unloads: &Arc<Mutex<HashSet<ThreadId>>>,
```

because projection attach needs to re-check pending unload state in listener order.

- [ ] **Step 7: Keep projection runtime files**

Run:

```bash
test -f codex-rs/app-server/src/thread_projection.rs
test -f codex-rs/app-server/src/thread_projection_runtime.rs
rg -n "ThreadProjectionManager|ProjectionSubscriberWatch|handle_projection_attach_response" codex-rs/app-server/src/thread_projection.rs codex-rs/app-server/src/thread_projection_runtime.rs
```

Expected: both files exist and symbols are found.

- [ ] **Step 8: Stage projection runtime integration files**

Run:

```bash
git add \
  codex-rs/app-server/src/outgoing_message.rs \
  codex-rs/app-server/src/thread_state.rs \
  codex-rs/app-server/src/request_processors/thread_lifecycle.rs \
  codex-rs/app-server/src/thread_projection.rs \
  codex-rs/app-server/src/thread_projection_runtime.rs
```

Expected: these files no longer appear in `git diff --name-only --diff-filter=U`.

## Task 6: Resolve Thread Processor And Projection Processor Conflicts

**Files:**

- Modify: `codex-rs/app-server/src/request_processors/thread_processor.rs`
- Keep/modify: `codex-rs/app-server/src/request_processors/thread_projection.rs`

- [ ] **Step 1: Keep 130 thread read and pagination behavior**

Open `codex-rs/app-server/src/request_processors/thread_processor.rs`. Keep 130's:

- `thread_turns_items_list` method returning method-not-found/unsupported.
- `ThreadTurnsListParams { items_view, .. }` handling.
- `ThreadStore` read/list updates.
- helper functions for `ThreadTurnsItemsListParams` even if unsupported.

Do not move projection attach/detach implementations into this file.

- [ ] **Step 2: Ensure projection processor can call helper methods**

In `thread_processor.rs`, make these helper methods visible to sibling modules if they are private after merge:

```rust
pub(super) async fn ensure_listener_task_running(...)
pub(super) async fn read_thread_view(...)
```

Keep their 130 signatures. Do not alter behavior except visibility.

- [ ] **Step 3: Keep projection attach/detach/snapshot in `thread_projection.rs`**

Open `codex-rs/app-server/src/request_processors/thread_projection.rs`. Ensure these methods still exist:

```rust
pub(crate) async fn thread_projection_attach(
    &self,
    request_id: &ConnectionRequestId,
    params: ThreadProjectionAttachParams,
) -> Result<Option<ClientResponsePayload>, JSONRPCErrorError>

pub(crate) async fn thread_projection_detach(
    &self,
    request_id: &ConnectionRequestId,
    params: ThreadProjectionDetachParams,
) -> Result<Option<ClientResponsePayload>, JSONRPCErrorError>

pub(super) async fn read_thread_projection_snapshot(
    &self,
    thread_id: ThreadId,
) -> Result<Thread, ThreadReadViewError>
```

If 130 changed `ThreadReadViewError` visibility or helper names, adjust imports in `thread_projection.rs` to use the 130 names without changing projection behavior.

- [ ] **Step 4: Keep projection snapshot test close to implementation**

Ensure `codex-rs/app-server/src/request_processors/thread_projection.rs` still contains the test:

```rust
thread_read_loaded_include_turns_preserves_history_and_projection_merges_active_turn
```

Expected behavior:

- `thread/read` with `include_turns: true` returns persisted history only.
- `read_thread_projection_snapshot` merges the active in-progress turn.

- [ ] **Step 5: Stage processor files**

Run:

```bash
git add \
  codex-rs/app-server/src/request_processors/thread_processor.rs \
  codex-rs/app-server/src/request_processors/thread_projection.rs
```

Expected: these files no longer appear in `git diff --name-only --diff-filter=U`.

## Task 7: Resolve Tests, Docs, And Remaining Conflicts

**Files:**

- Modify: `codex-rs/app-server/tests/common/mcp_process.rs`
- Modify: `codex-rs/app-server/tests/suite/v2/mod.rs`
- Keep: `codex-rs/app-server/tests/suite/v2/thread_projection.rs`
- Modify: `codex-rs/app-server/README.md`
- Resolve any remaining conflicted files reported by git.

- [ ] **Step 1: Keep projection test helpers in `mcp_process.rs`**

Open `codex-rs/app-server/tests/common/mcp_process.rs`. Keep 130 helpers and ensure projection helpers exist:

```rust
pub async fn send_thread_projection_attach_request(
    &mut self,
    params: ThreadProjectionAttachParams,
) -> Result<i64>

pub async fn send_thread_projection_detach_request(
    &mut self,
    params: ThreadProjectionDetachParams,
) -> Result<i64>
```

Use the file's existing helper style for sending JSON-RPC requests.

- [ ] **Step 2: Keep projection integration test module**

Open `codex-rs/app-server/tests/suite/v2/mod.rs`. Keep 130 test modules and ensure:

```rust
mod thread_projection;
```

Do not restore:

```rust
mod device_key;
```

- [ ] **Step 3: Keep projection integration tests**

Run:

```bash
test -f codex-rs/app-server/tests/suite/v2/thread_projection.rs
rg -n "thread_projection_attach_returns_snapshot_and_detach_status|thread_projection_emits_commit_chain" codex-rs/app-server/tests/suite/v2/thread_projection.rs
```

Expected: file exists and both tests are found.

- [ ] **Step 4: Resolve README**

Open `codex-rs/app-server/README.md`. Keep 130 README additions and projection API documentation. Ensure these method names appear:

```bash
rg -n "thread/projection/attach|thread/projection/detach|thread/projection/event" codex-rs/app-server/README.md
```

Expected: all three names are present.

- [ ] **Step 5: Resolve all remaining conflicted files**

Run:

```bash
git diff --name-only --diff-filter=U
```

For each remaining file:

- If it is an upstream-deleted device-key or remote thread-store file, accept deletion with `git rm`.
- If it is a projection-added file, keep the projection file with `git add`.
- If it is a shared source file, apply the design rule: keep 130 infrastructure and re-add projection seam.
- If it is generated schema, stage temporary content and allow Task 8 to regenerate.

Repeat until:

```bash
git diff --name-only --diff-filter=U
```

prints nothing.

- [ ] **Step 6: Stage tests/docs**

Run:

```bash
git add \
  codex-rs/app-server/tests/common/mcp_process.rs \
  codex-rs/app-server/tests/suite/v2/mod.rs \
  codex-rs/app-server/tests/suite/v2/thread_projection.rs \
  codex-rs/app-server/README.md
```

Expected: no unresolved conflicts remain.

## Task 8: Regenerate Schema And Format

**Files:**

- Modify: generated files under `codex-rs/app-server-protocol/schema/**`
- Modify: Rust formatting across changed Rust files.

- [ ] **Step 1: Confirm no unresolved conflicts**

Run:

```bash
git diff --name-only --diff-filter=U
```

Expected: no output.

- [ ] **Step 2: Format Rust code**

Run:

```bash
cd codex-rs
just fmt
```

Expected: command exits successfully.

- [ ] **Step 3: Regenerate app-server schema**

Run:

```bash
cd codex-rs
just write-app-server-schema
```

Expected: command exits successfully and updates schema/TypeScript fixtures.

- [ ] **Step 4: Check projection schema exists and device-key schema is absent**

Run:

```bash
test -f codex-rs/app-server-protocol/schema/json/v2/ThreadProjectionAttachParams.json
test -f codex-rs/app-server-protocol/schema/json/v2/ThreadProjectionEventNotification.json
test -f codex-rs/app-server-protocol/schema/typescript/v2/ThreadProjectionAttachParams.ts
test -f codex-rs/app-server-protocol/schema/typescript/v2/ThreadProjectionEventNotification.ts
test ! -e codex-rs/app-server-protocol/schema/json/v2/DeviceKeyCreateParams.json
test ! -e codex-rs/app-server-protocol/schema/typescript/v2/DeviceKeyCreateParams.ts
```

Expected: all `test` commands exit successfully.

- [ ] **Step 5: Stage formatting and schema output**

Run:

```bash
git add codex-rs
```

Expected: all resolved merge changes are staged.

## Task 9: Run Focused Verification

**Files:**

- Test only. No intentional source edits unless a command reveals a failure.

- [ ] **Step 1: Run protocol tests**

Run:

```bash
cd codex-rs
cargo test -p codex-app-server-protocol
```

Expected: tests pass.

- [ ] **Step 2: Run projection-focused app-server tests**

Run:

```bash
cd codex-rs
cargo test -p codex-app-server thread_projection --no-fail-fast
```

Expected: projection unit/integration tests pass.

- [ ] **Step 3: Run app-server tests**

Run:

```bash
cd codex-rs
cargo test -p codex-app-server --no-fail-fast
```

Expected: app-server tests pass. If unrelated flaky tests fail, capture exact test names and failure text before deciding whether to retry.

- [ ] **Step 4: Run scoped fix**

Run:

```bash
cd codex-rs
just fix -p codex-app-server
```

Expected: command exits successfully. Per repository instruction, do not re-run tests after `fix` unless it reports changes that clearly require manual inspection.

- [ ] **Step 5: Stage any fix output**

Run:

```bash
git add codex-rs
```

Expected: any formatting/lint-fix changes are staged.

## Task 10: Final Merge Commit Review And Commit

**Files:**

- Review all staged changes.
- Commit merge.

- [ ] **Step 1: Review staged conflict resolution summary**

Run:

```bash
git status --short
git diff --cached --stat
```

Expected:

- no `UU`, `AA`, `DD`, `DU`, or `UD` entries.
- projection files exist.
- device-key and remote thread-store removals are staged.
- generated schema changes are staged.

- [ ] **Step 2: Check key projection hooks**

Run:

```bash
rg -n "ThreadProjectionAttach|ThreadProjectionDetach|ThreadProjectionEvent" codex-rs/app-server-protocol/src/protocol/common.rs codex-rs/app-server/src/message_processor.rs
rg -n "thread_projection_manager|project_notification" codex-rs/app-server/src/outgoing_message.rs
rg -n "ProjectionSubscriberWatch|SendThreadProjectionAttachResponse|handle_projection_attach_response" codex-rs/app-server/src/request_processors/thread_lifecycle.rs codex-rs/app-server/src/thread_state.rs
```

Expected: all symbols are found in the listed files.

- [ ] **Step 3: Check upstream removals stayed removed**

Run:

```bash
test ! -e codex-rs/app-server-protocol/src/protocol/v2/device_key.rs
test ! -e codex-rs/app-server/src/request_processors/device_key_processor.rs
test ! -e codex-rs/app-server/tests/suite/v2/device_key.rs
test ! -e codex-rs/thread-store/src/remote
```

Expected: all `test` commands exit successfully.

- [ ] **Step 4: Commit the merge**

Run:

```bash
git commit
```

Use the default merge commit message if it clearly states `Merge tag 'rust-v0.130.0'` or `Merge rust-v0.130.0`. If Git opens an editor, keep the message concise:

```text
Merge rust-v0.130.0 into projection branch
```

Expected: merge commit is created.

- [ ] **Step 5: Confirm final graph**

Run:

```bash
git log --oneline --decorate --graph -n 8
git status --short --branch
```

Expected:

- top commit is a merge commit with parents from current branch and `rust-v0.130.0`.
- working tree is clean.

## Task 11: Optional Full Workspace Verification

**Files:**

- Test only.

- [ ] **Step 1: Ask before running full test suite**

Full workspace tests are intentionally not automatic for this merge because the repository instructions say to ask before complete test suite runs after common/core/protocol changes.

Ask:

```text
Focused verification passed. Do you want me to run the complete codex-rs test suite now?
```

- [ ] **Step 2: If approved, run the full test command**

If approved and `cargo-nextest` is installed, run:

```bash
cd codex-rs
just test
```

If `cargo-nextest` is not installed, run:

```bash
cd codex-rs
cargo test
```

Expected: full suite passes or failures are reported with exact test names and failure output.
