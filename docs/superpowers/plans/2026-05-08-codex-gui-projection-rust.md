# Codex GUI Projection Rust Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `rust-v0.129.0` 基础上实现 GUI projection 的 Rust 侧最小版本：attach/detach/snapshot/typed notification envelope。

**Architecture:** app-server-protocol 新增 projection v2 API 类型；app-server 新增 `ThreadProjectionManager` 管理 projection subscriber、thread-local head commit 和 fanout。snapshot 在 thread listener 顺序内读取，projection event 只包装现有 typed notification，不新增 server-side GUI store。

**Tech Stack:** Rust, codex-app-server-protocol v2, codex-app-server, JSON-RPC schema export, tokio, uuid v7, existing app-server integration test harness.

---

## Scope

只做 Rust 侧。不实现前端 GUI store、GUI reducer、GUI tab 策略、catch-up、commit log、server request projection、thread name/status/error projection。

第一版只包装四类 notification：

- `ServerNotification::TurnStarted`
- `ServerNotification::TurnCompleted`
- `ServerNotification::ItemStarted`
- `ServerNotification::ItemCompleted`

## File Structure

Create:

- `codex-rs/app-server-protocol/src/protocol/v2/thread_projection.rs`: v2 request/response/notification payload types.
- `codex-rs/app-server/src/thread_projection.rs`: projection manager, subscriber state, commit id generation, notification filtering/envelope creation.
- `codex-rs/app-server/tests/suite/v2/thread_projection.rs`: Rust-side protocol/runtime integration tests.

Modify:

- `codex-rs/app-server-protocol/src/protocol/v2/mod.rs`: export `thread_projection`.
- `codex-rs/app-server-protocol/src/protocol/common.rs`: register `thread/projection/attach`, `thread/projection/detach`, and `thread/projection/event`.
- `codex-rs/app-server/src/lib.rs`: add `mod thread_projection;`.
- `codex-rs/app-server/src/outgoing_message.rs`: let `ThreadScopedOutgoingMessageSender` tap whitelisted typed notifications and route projection envelopes.
- `codex-rs/app-server/src/message_processor.rs`: route new client requests to thread processor and ensure connection close cleans projection subscriptions.
- `codex-rs/app-server/src/thread_state.rs`: add listener command variant for projection attach response ordering.
- `codex-rs/app-server/src/request_processors/thread_lifecycle.rs`: handle projection attach command inside listener order; include projection subscriptions in unload watch.
- `codex-rs/app-server/src/request_processors/thread_processor.rs`: implement attach/detach handlers and expose narrow snapshot read path.
- `codex-rs/app-server/tests/common/mcp_process.rs`: add helper methods for projection attach/detach requests.
- `codex-rs/app-server/tests/suite/v2/mod.rs`: include `thread_projection`.
- Generated schema/TS fixture files under `codex-rs/app-server-protocol/schema/json/**` after `just write-app-server-schema`.

Do not modify `codex-rs/core`.

## Task 1: Protocol Types And Methods

**Files:**

- Create: `codex-rs/app-server-protocol/src/protocol/v2/thread_projection.rs`
- Modify: `codex-rs/app-server-protocol/src/protocol/v2/mod.rs`
- Modify: `codex-rs/app-server-protocol/src/protocol/common.rs`

- [ ] **Step 1: Add protocol payload types**

Create `thread_projection.rs` with these public types. Keep all IDs as plain `String`.

```rust
use super::ItemCompletedNotification;
use super::ItemStartedNotification;
use super::Thread;
use super::TurnCompletedNotification;
use super::TurnStartedNotification;
use schemars::JsonSchema;
use serde::Deserialize;
use serde::Serialize;
use ts_rs::TS;

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export_to = "v2/")]
pub struct ThreadProjectionAttachParams {
    pub thread_id: String,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export_to = "v2/")]
pub struct ThreadProjectionAttachResponse {
    pub subscription_id: String,
    pub snapshot: ThreadProjectionSnapshot,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export_to = "v2/")]
pub struct ThreadProjectionSnapshot {
    pub thread: Thread,
    pub head_commit_id: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export_to = "v2/")]
pub struct ThreadProjectionDetachParams {
    pub thread_id: String,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase", export_to = "v2/")]
pub enum ThreadProjectionDetachStatus {
    Detached,
    NotSubscribed,
    NotLoaded,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export_to = "v2/")]
pub struct ThreadProjectionDetachResponse {
    pub status: ThreadProjectionDetachStatus,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export_to = "v2/")]
pub struct ThreadProjectionEventNotification {
    pub thread_id: String,
    pub subscription_id: String,
    pub commit_id: String,
    pub parent_commit_id: Option<String>,
    pub event: ThreadProjectionEvent,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, JsonSchema, TS)]
#[serde(tag = "type", rename_all = "camelCase")]
#[ts(tag = "type", rename_all = "camelCase", export_to = "v2/")]
pub enum ThreadProjectionEvent {
    TurnStarted { notification: TurnStartedNotification },
    TurnCompleted { notification: TurnCompletedNotification },
    ItemStarted { notification: ItemStartedNotification },
    ItemCompleted { notification: ItemCompletedNotification },
}
```

- [ ] **Step 2: Export the module**

In `codex-rs/app-server-protocol/src/protocol/v2/mod.rs` add:

```rust
mod thread_projection;
pub use thread_projection::*;
```

- [ ] **Step 3: Register request/notification methods**

In `client_request_definitions!` near other `Thread*` methods:

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

In `server_notification_definitions!` near other thread notifications:

```rust
ThreadProjectionEvent => "thread/projection/event" (v2::ThreadProjectionEventNotification),
```

- [ ] **Step 4: Verify protocol compile failure/success boundary**

Run:

```bash
cd codex-rs
cargo test -p codex-app-server-protocol
```

Expected before app-server routing exists: protocol crate passes. If this fails, fix only protocol type/export issues.

- [ ] **Step 5: Commit**

```bash
git add codex-rs/app-server-protocol/src/protocol/v2/thread_projection.rs \
        codex-rs/app-server-protocol/src/protocol/v2/mod.rs \
        codex-rs/app-server-protocol/src/protocol/common.rs
git commit -m "feat(app-server): add thread projection protocol"
```

## Task 2: Projection Manager

**Files:**

- Create: `codex-rs/app-server/src/thread_projection.rs`
- Modify: `codex-rs/app-server/src/lib.rs`
- Modify: `codex-rs/app-server/src/outgoing_message.rs`

- [ ] **Step 1: Add unit-tested manager**

Create `thread_projection.rs` with:

- `ThreadProjectionManager`
- per-thread `head_commit_id`
- per-connection `subscription_id`
- `attach`, `detach`, `remove_connection`
- `project_notification`
- `subscribe_to_has_subscribers`

Core API shape:

```rust
#[derive(Clone, Default)]
pub(crate) struct ThreadProjectionManager {
    inner: Arc<Mutex<ThreadProjectionManagerInner>>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum ProjectionDetachResult {
    Detached,
    NotSubscribed,
    NotLoaded,
}

impl ThreadProjectionManager {
    pub(crate) fn new() -> Self;

    pub(crate) async fn attach(
        &self,
        thread_id: ThreadId,
        connection_id: ConnectionId,
    ) -> ProjectionAttachResult;

    pub(crate) async fn detach(
        &self,
        thread_id: ThreadId,
        connection_id: ConnectionId,
    ) -> ProjectionDetachResult;

    pub(crate) async fn remove_connection(&self, connection_id: ConnectionId) -> Vec<ThreadId>;

    pub(crate) async fn project_notification(
        &self,
        thread_id: ThreadId,
        notification: &ServerNotification,
    ) -> Vec<ProjectionDelivery>;

    pub(crate) async fn subscribe_to_has_subscribers(
        &self,
        thread_id: ThreadId,
    ) -> watch::Receiver<bool>;
}
```

`project_notification` must:

1. ignore non-whitelisted notifications;
2. advance one `commit_id` per source notification, not per subscriber;
3. capture current subscribers in the same lock section as head advancement;
4. return one `ProjectionDelivery` per subscriber.

- [ ] **Step 2: Add manager to outgoing sender**

In `OutgoingMessageSender`, add a field:

```rust
thread_projection_manager: ThreadProjectionManager,
```

Initialize it in `OutgoingMessageSender::new`:

```rust
thread_projection_manager: ThreadProjectionManager::new(),
```

Add accessor:

```rust
pub(crate) fn thread_projection_manager(&self) -> ThreadProjectionManager {
    self.thread_projection_manager.clone()
}
```

- [ ] **Step 3: Wire module**

In `codex-rs/app-server/src/lib.rs` add:

```rust
mod thread_projection;
```

- [ ] **Step 4: Unit test manager ordering**

In `thread_projection.rs`, add tests that assert:

- first event has `parent_commit_id == None`;
- second event has `parent_commit_id == first.commit_id`;
- two subscribers receive the same `commit_id`;
- detach removes only that connection;
- non-whitelisted notifications produce no deliveries and do not advance head.

Run:

```bash
cd codex-rs
cargo test -p codex-app-server thread_projection
```

Expected: manager tests pass.

- [ ] **Step 5: Commit**

```bash
git add codex-rs/app-server/src/thread_projection.rs \
        codex-rs/app-server/src/lib.rs \
        codex-rs/app-server/src/outgoing_message.rs
git commit -m "feat(app-server): add thread projection manager"
```

## Task 3: Attach/Detach Runtime Path

**Files:**

- Modify: `codex-rs/app-server/src/thread_state.rs`
- Modify: `codex-rs/app-server/src/request_processors/thread_lifecycle.rs`
- Modify: `codex-rs/app-server/src/request_processors/thread_processor.rs`
- Modify: `codex-rs/app-server/src/message_processor.rs`

- [ ] **Step 1: Add listener command for attach ordering**

Add a `ThreadListenerCommand` variant that lets the listener build snapshot, read projection head, register subscriber, and send the attach response before later events are processed:

```rust
SendThreadProjectionAttachResponse {
    request_id: ConnectionRequestId,
    completion_tx: oneshot::Sender<()>,
}
```

The handler must use `include_turns: true` snapshot semantics.

- [ ] **Step 2: Add processor methods**

In `ThreadRequestProcessor`, add:

```rust
pub(crate) async fn thread_projection_attach(
    &self,
    request_id: &ConnectionRequestId,
    params: ThreadProjectionAttachParams,
) -> Result<Option<ClientResponsePayload>, JSONRPCErrorError>;

pub(crate) async fn thread_projection_detach(
    &self,
    request_id: &ConnectionRequestId,
    params: ThreadProjectionDetachParams,
) -> Result<Option<ClientResponsePayload>, JSONRPCErrorError>;
```

Attach flow:

1. parse `thread_id`;
2. fail if thread does not exist or is in `pending_thread_unloads`;
3. ensure listener task is running without adding a normal thread subscriber;
4. send listener command;
5. listener command builds `ThreadProjectionAttachResponse`;
6. attach failure returns standard JSON-RPC error and does not create a subscriber.

Detach flow:

1. parse `thread_id`;
2. call `ThreadProjectionManager::detach`;
3. map manager status to protocol status;
4. return `Some(response.into())`.

- [ ] **Step 3: Route client requests**

In `MessageProcessor::process_typed_request`, add:

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

- [ ] **Step 4: Test attach/detach response shape**

Add an integration test that:

1. starts a thread;
2. calls `thread/projection/attach`;
3. asserts `subscriptionId` is non-empty;
4. asserts `snapshot.thread.id == thread_id`;
5. asserts `snapshot.headCommitId == None` before any projected event;
6. calls `thread/projection/detach`;
7. asserts status is `detached`.

Run:

```bash
cd codex-rs
cargo test -p codex-app-server thread_projection_attach_returns_snapshot
```

Expected: test passes.

- [ ] **Step 5: Commit**

```bash
git add codex-rs/app-server/src/thread_state.rs \
        codex-rs/app-server/src/request_processors/thread_lifecycle.rs \
        codex-rs/app-server/src/request_processors/thread_processor.rs \
        codex-rs/app-server/src/message_processor.rs \
        codex-rs/app-server/tests/suite/v2/thread_projection.rs \
        codex-rs/app-server/tests/suite/v2/mod.rs
git commit -m "feat(app-server): attach thread projection"
```

## Task 4: Typed Notification Tap And Fanout

**Files:**

- Modify: `codex-rs/app-server/src/outgoing_message.rs`
- Modify: `codex-rs/app-server/src/thread_projection.rs`
- Modify: `codex-rs/app-server/tests/suite/v2/thread_projection.rs`

- [ ] **Step 1: Tap thread-scoped notifications**

In `ThreadScopedOutgoingMessageSender::send_server_notification`, before returning for empty normal subscribers, project whitelisted notifications:

```rust
let projection_deliveries = self
    .outgoing
    .thread_projection_manager()
    .project_notification(self.thread_id, &notification)
    .await;
```

Then keep existing analytics and normal subscriber send behavior unchanged.

- [ ] **Step 2: Send projection envelopes**

For each `ProjectionDelivery`, send `ServerNotification::ThreadProjectionEvent(delivery.notification)` to `delivery.connection_id` through `OutgoingMessageSender::send_server_notification_to_connections`.

Do not send projection envelopes to normal thread subscribers unless they also attached projection.

- [ ] **Step 3: Add runtime fanout test**

Add a test that:

1. starts a thread;
2. attaches projection;
3. starts a turn against a mock model;
4. reads `thread/projection/event`;
5. asserts the event is one of the whitelisted variants;
6. asserts `subscriptionId` equals attach response;
7. asserts `parentCommitId == snapshot.headCommitId`;
8. reads the next projection event and asserts its `parentCommitId == previous.commitId`.

Run:

```bash
cd codex-rs
cargo test -p codex-app-server thread_projection_emits_commit_chain
```

Expected: test passes and normal `turn/started` notifications still exist for normal subscribers.

- [ ] **Step 4: Commit**

```bash
git add codex-rs/app-server/src/outgoing_message.rs \
        codex-rs/app-server/src/thread_projection.rs \
        codex-rs/app-server/tests/suite/v2/thread_projection.rs
git commit -m "feat(app-server): emit thread projection events"
```

## Task 5: Unload And Connection Close

**Files:**

- Modify: `codex-rs/app-server/src/message_processor.rs`
- Modify: `codex-rs/app-server/src/request_processors/thread_lifecycle.rs`
- Modify: `codex-rs/app-server/src/thread_projection.rs`
- Modify: `codex-rs/app-server/tests/suite/v2/thread_projection.rs`

- [ ] **Step 1: Clean projection subscriptions on connection close**

In `MessageProcessor::connection_closed`, call:

```rust
let projection_threads = self
    .outgoing
    .thread_projection_manager()
    .remove_connection(connection_id)
    .await;
```

Then let unload watches observe the projection subscriber state change.

- [ ] **Step 2: Include projection subscribers in unloading**

Update `UnloadingState` to watch both normal subscribers and projection subscribers. A thread can unload only when both are false and the thread is inactive.

Effective predicate:

```rust
!has_normal_subscribers && !has_projection_subscribers && !is_active
```

- [ ] **Step 3: Add unload test**

Add an integration test that:

1. starts a thread;
2. unsubscribes normal thread subscription;
3. attaches projection;
4. waits briefly and asserts `thread/closed` is not emitted;
5. detaches projection;
6. asserts the thread is allowed to unload after the existing unload delay path.

Run:

```bash
cd codex-rs
cargo test -p codex-app-server thread_projection_subscription_keeps_thread_loaded
```

Expected: test passes.

- [ ] **Step 4: Commit**

```bash
git add codex-rs/app-server/src/message_processor.rs \
        codex-rs/app-server/src/request_processors/thread_lifecycle.rs \
        codex-rs/app-server/src/thread_projection.rs \
        codex-rs/app-server/tests/suite/v2/thread_projection.rs
git commit -m "feat(app-server): keep projected threads loaded"
```

## Task 6: Schema, Test Support, And Docs

**Files:**

- Modify: `codex-rs/app-server/tests/common/mcp_process.rs`
- Modify: `codex-rs/app-server/README.md`
- Modify/generated: `codex-rs/app-server-protocol/schema/json/**`

- [ ] **Step 1: Add test helper request methods**

In `McpProcess`, add:

```rust
pub async fn send_thread_projection_attach_request(
    &mut self,
    params: ThreadProjectionAttachParams,
) -> anyhow::Result<i64> {
    self.send_request("thread/projection/attach", params).await
}

pub async fn send_thread_projection_detach_request(
    &mut self,
    params: ThreadProjectionDetachParams,
) -> anyhow::Result<i64> {
    self.send_request("thread/projection/detach", params).await
}
```

- [ ] **Step 2: Document API briefly**

In `codex-rs/app-server/README.md`, add a short v2 section:

```markdown
### Thread projection

`thread/projection/attach` returns a snapshot plus a projection subscription id.
The server only emits `thread/projection/event` notifications to projection subscribers.
The first version wraps `turn/started`, `turn/completed`, `item/started`, and `item/completed`.
`thread/projection/detach` removes the projection subscription without changing the normal thread subscription.
```

- [ ] **Step 3: Generate schema fixtures**

Run:

```bash
cd codex-rs
just write-app-server-schema
```

Expected: schema files include the two new methods and one new notification.

- [ ] **Step 4: Run focused tests**

Run:

```bash
cd codex-rs
cargo test -p codex-app-server-protocol
cargo test -p codex-app-server thread_projection
```

Expected: both pass.

- [ ] **Step 5: Format and lint**

Run:

```bash
cd codex-rs
just fmt
just fix -p codex-app-server-protocol
just fix -p codex-app-server
```

Expected: commands finish without requiring unrelated changes.

- [ ] **Step 6: Commit**

```bash
git add codex-rs/app-server/tests/common/mcp_process.rs \
        codex-rs/app-server/README.md \
        codex-rs/app-server-protocol/schema/json
git commit -m "docs(app-server): document thread projection API"
```

## Task 7: Final Review Checklist

**Files:**

- Review only; no new files expected.

- [ ] **Step 1: Verify no GUI/frontend changes**

Run:

```bash
git diff --stat rust-v0.129.0...HEAD
```

Expected: changed files are limited to `codex-rs/app-server*`, docs, and generated schema files.

- [ ] **Step 2: Verify no server-side GUI store was introduced**

Run:

```bash
rg -n "ThreadHistoryBuilder|ProjectionEventPayload|latestSequence|projectionInstanceId|catch-up|catchup" codex-rs/app-server codex-rs/app-server-protocol
```

Expected: no new implementation depends on old `ProjectionEventPayload`, `latestSequence`, or server-side thread history reducer.

- [ ] **Step 3: Verify tap coverage**

Run:

```bash
rg -n "ServerNotification::(TurnStarted|TurnCompleted|ItemStarted|ItemCompleted)" codex-rs/app-server/src
```

Expected: all four notification families pass through `ThreadScopedOutgoingMessageSender::send_server_notification`.

- [ ] **Step 4: Final focused verification**

Run:

```bash
cd codex-rs
cargo test -p codex-app-server-protocol
cargo test -p codex-app-server thread_projection
```

Expected: both pass.

- [ ] **Step 5: Final commit if needed**

Only commit if review fixes changed files:

```bash
git add <changed-files>
git commit -m "test(app-server): cover thread projection transport"
```

## Risks To Watch During Implementation

- Snapshot and `headCommitId` must be produced in listener order. Do not build snapshot before a listener barrier and then read a newer head; that can skip an event in first-version no-catch-up mode.
- Projection commit chain is only a transport continuity check, not a snapshot content boundary.
- `subscriptionId` is connection-local; `commitId` is thread-local. Do not reuse one for the other.
- Projection subscribers must not receive raw `turn/started` etc. They receive only `thread/projection/event`.
- Normal thread unsubscribe must not detach projection, and projection detach must not normal-unsubscribe the thread.
- Do not add code to `codex-rs/core`.
