# Projection Protocol And App-Server Runtime Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the projection protocol and app-server runtime on top of the official 0.131 baseline.

**Architecture:** Keep projection logic in dedicated modules and add only thin hooks to official 0.131 choke points. The runtime owns projection subscriptions, per-thread commit chains, snapshot attachment, event projection, unload participation, detach semantics, and connection cleanup.

**Tech Stack:** Rust, `codex-app-server-protocol`, `codex-app-server`, Tokio, app-server v2 tests.

---

## Files

- Create or modify: `codex-rs/app-server-protocol/src/protocol/v2/thread_projection.rs`
- Modify: `codex-rs/app-server-protocol/src/protocol/v2/mod.rs`
- Modify: `codex-rs/app-server-protocol/src/protocol/common.rs`
- Create or modify: `codex-rs/app-server/src/thread_projection.rs`
- Create or modify: `codex-rs/app-server/src/thread_projection_runtime.rs`
- Create or modify: `codex-rs/app-server/src/request_processors/thread_projection.rs`
- Modify: `codex-rs/app-server/src/lib.rs`
- Modify: `codex-rs/app-server/src/request_processors.rs`
- Modify: `codex-rs/app-server/src/thread_state.rs`
- Modify: `codex-rs/app-server/src/request_processors/thread_lifecycle.rs`
- Modify: `codex-rs/app-server/src/outgoing_message.rs`
- Modify: `codex-rs/app-server/src/message_processor.rs`
- Modify or create: `codex-rs/app-server/tests/suite/v2/thread_projection.rs`

## Task 1: Restore Protocol Surface

- [ ] **Step 1: Add v2 projection types**

Ensure `codex-rs/app-server-protocol/src/protocol/v2/thread_projection.rs` defines:

- `ThreadProjectionAttachParams`
- `ThreadProjectionAttachResponse`
- `ThreadProjectionSnapshot`
- `ThreadProjectionDetachParams`
- `ThreadProjectionDetachResponse`
- `ThreadProjectionDetachStatus`
- `ThreadProjectionEventNotification`
- `ThreadProjectionEvent`

Required wire fields:

```text
attach params: threadId
attach response: subscriptionId, snapshot
snapshot: thread, headCommitId
event notification: threadId, subscriptionId, commitId, parentCommitId, event
detach status: detached, notSubscribed, notLoaded
```

- [ ] **Step 2: Export v2 projection module**

In `codex-rs/app-server-protocol/src/protocol/v2/mod.rs`, ensure the projection module is private and explicitly re-exported:

```rust
mod thread_projection;
pub use thread_projection::*;
```

- [ ] **Step 3: Register methods**

In `codex-rs/app-server-protocol/src/protocol/common.rs`, register:

```text
thread/projection/attach
thread/projection/detach
thread/projection/event
```

Expected:

- attach and detach are `ClientRequest` methods.
- event is a `ServerNotification`.

- [ ] **Step 4: Add protocol shape tests**

Add or restore tests in `thread_projection.rs` that deserialize and serialize:

- attach request,
- detach response status,
- event notification with `parentCommitId`.

- [ ] **Step 5: Verify protocol crate narrowly**

Run from `codex-rs`:

```bash
cargo test -p codex-app-server-protocol thread_projection
```

Expected: projection protocol tests pass.

- [ ] **Step 6: Commit protocol source**

Run:

```bash
git add codex-rs/app-server-protocol/src/protocol/common.rs \
  codex-rs/app-server-protocol/src/protocol/v2/mod.rs \
  codex-rs/app-server-protocol/src/protocol/v2/thread_projection.rs
git commit -m "feat(app-server-protocol): restore thread projection API"
```

Expected: commit contains only handwritten protocol source and protocol tests, not generated schema.

## Task 2: Restore Projection Manager

- [ ] **Step 1: Add manager module**

Create or restore `codex-rs/app-server/src/thread_projection.rs`.

Required responsibilities:

- track per-thread projection entries,
- track connection-to-thread projection index,
- generate `subscriptionId`,
- maintain per-thread `headCommitId`,
- generate per-thread full-order `commitId`,
- map thread notifications into four projection event variants,
- expose projection subscriber watch for unload,
- detach connection and remove thread state.

- [ ] **Step 2: Encode commit chain invariant**

Ensure manager behavior matches:

- per-thread chain,
- all subscribers for the same thread receive the same `commitId` and `parentCommitId`,
- repeated attach replaces only that connection's subscription,
- detach does not clear thread head,
- thread teardown clears the projection entry,
- non-whitelisted notifications do not advance head.

- [ ] **Step 3: Add manager unit tests**

Unit tests in `thread_projection.rs` must cover:

```text
first event has no parent and second event parents to first commit
two subscribers receive the same commit
repeated attach replaces subscription for same connection and thread
detach removes only matching connection
remove_connection removes all subscriptions and updates watch
remove_thread clears head and subscribers
non-whitelisted notifications do not deliver or advance head
```

- [ ] **Step 4: Register app-server modules**

In `codex-rs/app-server/src/lib.rs`, add:

```rust
mod thread_projection;
mod thread_projection_runtime;
```

Expected:

- Preserve all official 0.131 modules.
- Do not remove official `attestation`, `environment`, `extensions`, `skills_watcher`, or `remote_control` modules if present.

## Task 3: Restore Request Processor And Snapshot

- [ ] **Step 1: Add projection request processor module**

Create or restore `codex-rs/app-server/src/request_processors/thread_projection.rs`.

Required public methods on `ThreadRequestProcessor`:

```text
thread_projection_attach
thread_projection_detach
read_thread_projection_snapshot
```

- [ ] **Step 2: Use dedicated live connection access**

Attach must use a dedicated live-connection / thread-state access path, not ordinary subscribe.

Required behavior:

- invalid thread id returns invalid request,
- unloaded or missing thread returns invalid request for attach,
- closed connection silently skips attach response,
- attach does not create ordinary thread subscription.

- [ ] **Step 3: Build snapshot from 0.131 reconstruction**

Default path:

- call official thread reconstruction entry where possible,
- include turns,
- merge live active turn through the same semantic rules as 0.131 reconstruction,
- preserve projection `headCommitId` separately.

Fallback path:

- only use independent code when `headCommitId` wrapping, listener ordering, or loaded-thread fallback prevents direct reuse,
- add focused equivalence test proving field semantics match 0.131 reconstruction for persisted history + live active turn.

- [ ] **Step 4: Implement detach status mapping**

Required status mapping:

```text
thread not loaded -> notLoaded
loaded but no projection entry -> notSubscribed
loaded but connection not subscribed -> notSubscribed
loaded and subscription removed -> detached
```

- [ ] **Step 5: Wire request dispatch**

In `codex-rs/app-server/src/request_processors.rs` and `codex-rs/app-server/src/message_processor.rs`, dispatch:

```text
ClientRequest::ThreadProjectionAttach
ClientRequest::ThreadProjectionDetach
```

Expected:

- Dispatch only delegates to `request_processors/thread_projection.rs`.
- No projection business logic is added inline to `message_processor.rs`.

## Task 4: Restore Listener-Ordered Attach Runtime

- [ ] **Step 1: Add listener command**

In `codex-rs/app-server/src/thread_state.rs`, add a command equivalent to:

```text
SendThreadProjectionAttachResponse {
  request_id,
  connection_id,
  snapshot,
  completion_tx
}
```

- [ ] **Step 2: Handle listener command**

In `codex-rs/app-server/src/request_processors/thread_lifecycle.rs`, handle the command by delegating to `thread_projection_runtime::handle_projection_attach_response`.

Expected ordering:

```text
closing-thread guard
snapshot await
live connection check
closing-thread guard
attach subscriber
late-close cleanup
send response
```

- [ ] **Step 3: Add attach race tests**

Runtime tests must cover:

- closed connection before attach response does not leave projection subscription,
- late connection close after attach registration removes the projection subscription,
- first event after attach has `parentCommitId == snapshot.headCommitId`.

## Task 5: Restore Fanout And Lifecycle Hooks

- [ ] **Step 1: Add projection manager to outgoing sender**

In `codex-rs/app-server/src/outgoing_message.rs`, ensure `OutgoingMessageSender` owns `ThreadProjectionManager` and exposes a clone accessor.

- [ ] **Step 2: Add fanout thin hook**

In `ThreadScopedOutgoingMessageSender::send_server_notification`, project the typed notification before ordinary send.

Required behavior:

- projection event goes only to projection subscribers,
- ordinary notification still goes to ordinary subscribers,
- no official ordinary notification target set changes,
- non-whitelisted notifications do not create projection events.

- [ ] **Step 3: Add unload participation**

In `codex-rs/app-server/src/request_processors/thread_lifecycle.rs`, extend unload state with projection subscriber watch.

Unload requires all of:

```text
no ordinary subscribers
no projection subscribers
thread not active
idle delay elapsed
```

- [ ] **Step 4: Add connection close cleanup**

In `codex-rs/app-server/src/message_processor.rs`, append projection cleanup after official close processors and after `thread_processor.connection_closed(connection_id)`.

Required behavior:

- do not reorder official close processors,
- cleanup only projection subscriptions,
- removed projection subscribers wake unload watch.

## Task 6: Add App-Server Focused Tests

- [ ] **Step 1: Add integration tests**

In `codex-rs/app-server/tests/suite/v2/thread_projection.rs`, cover:

- attach returns snapshot and `subscriptionId`,
- detach without attach returns `notSubscribed`,
- detach after attach returns `detached`,
- projection emits commit chain,
- first event parent equals attach snapshot head,
- repeated attach makes old `subscriptionId` inactive,
- connection close removes projection subscriptions,
- ordinary `thread/unsubscribe` does not detach projection.

- [ ] **Step 2: Add snapshot equivalence test**

In `codex-rs/app-server/src/request_processors/thread_projection.rs` tests, cover:

- persisted history exists,
- thread is loaded,
- live active turn exists,
- projection snapshot contains persisted turns plus live active turn,
- fields match 0.131 reconstruction semantics for the same inputs.

- [ ] **Step 3: Run focused app-server tests**

Run from `codex-rs`:

```bash
cargo test -p codex-app-server thread_projection --no-fail-fast
```

Expected: projection-focused app-server tests pass.

- [ ] **Step 4: Run formatter**

Run from `codex-rs`:

```bash
just fmt
```

Expected: formatting completes.

- [ ] **Step 5: Commit app-server runtime**

Run:

```bash
git add codex-rs/app-server/src/lib.rs \
  codex-rs/app-server/src/request_processors.rs \
  codex-rs/app-server/src/thread_state.rs \
  codex-rs/app-server/src/request_processors/thread_lifecycle.rs \
  codex-rs/app-server/src/outgoing_message.rs \
  codex-rs/app-server/src/message_processor.rs \
  codex-rs/app-server/src/thread_projection.rs \
  codex-rs/app-server/src/thread_projection_runtime.rs \
  codex-rs/app-server/src/request_processors/thread_projection.rs \
  codex-rs/app-server/tests/suite/v2/thread_projection.rs
git commit -m "feat(app-server): restore thread projection runtime"
```

Expected: commit contains app-server projection source and focused tests.
