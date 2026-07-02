# Projection Streaming Delta Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Rust/app-server projection-only transient assistant-message delta notification so GUI projection subscribers can receive live assistant text without advancing projection head commits.

**Architecture:** Keep `thread/projection/event` as the structural commit-chain stream and add sibling notification `thread/projection/delta` for transient stream progress. `ThreadProjectionManager` will return a delivery enum: structural events keep `commitId/parentCommitId`, while deltas reuse the current subscriber/generation fanout path without calling `advance_head`.

**Tech Stack:** Rust, app-server v2 protocol, serde, ts-rs, schemars, app-server projection fanout, JSON fixtures, nextest via root `justfile`.

---

## Design Source

Implement from `docs/superpowers/specs/2026-07-02-projection-streaming-delta-design.md`.

Important decisions:

- New method: `thread/projection/delta`.
- Payload: `ThreadProjectionDeltaNotification { threadId, subscriptionId, delta }`.
- Delta union: `ThreadProjectionDelta::AgentMessage { notification: AgentMessageDeltaNotification }`.
- No `commitId` or `parentCommitId` on delta notifications.
- First stage supports only `agentMessage`.
- Do not change core event types, snapshot cut, thread store, or GUI rendering behavior.

## File Structure

- Modify: `codex-rs/app-server-protocol/src/protocol/v2/thread_projection.rs`
  - Owns `ThreadProjectionAttachResponse`, structural `ThreadProjectionEventNotification`, and new `ThreadProjectionDeltaNotification`.
  - Add serde tests for `thread/projection/delta`.

- Modify: `codex-rs/app-server-protocol/src/protocol/common.rs`
  - Register `ThreadProjectionDelta => "thread/projection/delta"`.

- Generated: `codex-rs/app-server-protocol/schema/**`
  - Refresh with `just write-app-server-schema`.

- Modify: `codex-rs/app-server/src/thread_projection.rs`
  - Change `ProjectionDelivery` to carry a payload enum.
  - Keep structural events advancing head.
  - Add projection delta mapping for `ServerNotification::AgentMessageDelta` that does not advance head.
  - Add unit tests for delta delivery and head stability.

- Modify: `codex-rs/app-server/src/projection_fanout.rs`
  - Send either `ServerNotification::ThreadProjectionEvent` or `ServerNotification::ThreadProjectionDelta` based on delivery payload.
  - Keep the same queue, generation gate, and backpressure behavior.
  - Add unit tests for ordered event/delta fanout and backpressure closure.

- Modify: `codex-rs/app-server/src/thread_projection_fixtures.rs`
  - Add one Rust-generated fixture for projection delta.

- Modify: `codex-rs/app-server/src/thread_projection_fixtures_tests.rs`
  - Add round-trip and shape assertions for the delta fixture.

- Generated: `codex-gui/src/features/projection/__fixtures__/event-agent-message-delta.json`
  - Refresh with `just write-gui-projection-fixtures`.

- Modify: `codex-rs/app-server/tests/suite/v2/thread_projection.rs`
  - Add integration coverage for `itemStarted -> projection delta -> itemCompleted`.

- Modify: `codex-rs/app-server/tests/common/responses.rs`
  - Add a streaming assistant-message SSE helper for the integration test.

- Modify: `codex-rs/app-server/README.md`
  - Document that projection subscribers receive structural `thread/projection/event` plus transient `thread/projection/delta`.

## Task 1: Protocol Type and Serialization

**Files:**
- Modify: `codex-rs/app-server-protocol/src/protocol/v2/thread_projection.rs`
- Modify: `codex-rs/app-server-protocol/src/protocol/common.rs`
- Test: `codex-rs/app-server-protocol/src/protocol/v2/thread_projection.rs`

- [ ] **Step 1: Add the failing serde test**

In `codex-rs/app-server-protocol/src/protocol/v2/thread_projection.rs`, extend the existing `#[cfg(test)] mod tests` with:

```rust
#[test]
fn deserialize_thread_projection_delta_notification() -> Result<()> {
    let notification: ServerNotification = serde_json::from_value(json!({
        "method": "thread/projection/delta",
        "params": {
            "threadId": "thr_123",
            "subscriptionId": "sub_123",
            "delta": {
                "type": "agentMessage",
                "notification": {
                    "threadId": "thr_123",
                    "turnId": "turn_123",
                    "itemId": "item_123",
                    "delta": "hello"
                }
            }
        }
    }))?;

    assert_eq!(
        serde_json::to_value(&notification)?,
        json!({
            "method": "thread/projection/delta",
            "params": {
                "threadId": "thr_123",
                "subscriptionId": "sub_123",
                "delta": {
                    "type": "agentMessage",
                    "notification": {
                        "threadId": "thr_123",
                        "turnId": "turn_123",
                        "itemId": "item_123",
                        "delta": "hello"
                    }
                }
            }
        })
    );
    Ok(())
}
```

- [ ] **Step 2: Run the focused protocol test and confirm it fails**

Run from repository root:

```bash
just test -p codex-app-server-protocol deserialize_thread_projection_delta_notification
```

Expected: FAIL because `thread/projection/delta`, `ThreadProjectionDeltaNotification`, and `ThreadProjectionDelta` are not defined.

- [ ] **Step 3: Add protocol types**

In `codex-rs/app-server-protocol/src/protocol/v2/thread_projection.rs`, add the import:

```rust
use super::AgentMessageDeltaNotification;
```

After `ThreadProjectionEventNotification`, add:

```rust
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export_to = "v2/")]
pub struct ThreadProjectionDeltaNotification {
    pub thread_id: String,
    pub subscription_id: String,
    pub delta: ThreadProjectionDelta,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, JsonSchema, TS)]
#[serde(tag = "type", rename_all = "camelCase")]
#[ts(tag = "type", rename_all = "camelCase", export_to = "v2/")]
pub enum ThreadProjectionDelta {
    AgentMessage {
        notification: AgentMessageDeltaNotification,
    },
}
```

Do not derive `Eq`; `AgentMessageDeltaNotification` currently derives `PartialEq` but not `Eq`.

- [ ] **Step 4: Register the server notification method**

In `codex-rs/app-server-protocol/src/protocol/common.rs`, add the new server notification beside the existing projection notifications:

```rust
ThreadProjectionEvent => "thread/projection/event" (v2::ThreadProjectionEventNotification),
ThreadProjectionDelta => "thread/projection/delta" (v2::ThreadProjectionDeltaNotification),
ThreadProjectionClosed => "thread/projection/closed" (v2::ThreadProjectionClosedNotification),
```

- [ ] **Step 5: Run the focused protocol test and confirm it passes**

Run:

```bash
just test -p codex-app-server-protocol deserialize_thread_projection_delta_notification
```

Expected: PASS.

- [ ] **Step 6: Commit protocol type work**

```bash
git add codex-rs/app-server-protocol/src/protocol/v2/thread_projection.rs codex-rs/app-server-protocol/src/protocol/common.rs
git commit -m "feat(app-server): add projection delta protocol"
```

## Task 2: Projection Manager Delivery Semantics

**Files:**
- Modify: `codex-rs/app-server/src/thread_projection.rs`
- Test: `codex-rs/app-server/src/thread_projection.rs`

- [ ] **Step 1: Add failing manager tests**

In `codex-rs/app-server/src/thread_projection.rs` test module, add imports:

```rust
use codex_app_server_protocol::AgentMessageDeltaNotification;
use codex_app_server_protocol::ThreadProjectionDelta;
```

Add this helper:

```rust
fn agent_message_delta_notification(
    thread_id: ThreadId,
    turn_id: &str,
    item_id: &str,
    delta: &str,
) -> ServerNotification {
    ServerNotification::AgentMessageDelta(AgentMessageDeltaNotification {
        thread_id: thread_id.to_string(),
        turn_id: turn_id.to_string(),
        item_id: item_id.to_string(),
        delta: delta.to_string(),
    })
}
```

Add this test:

```rust
#[tokio::test]
async fn agent_message_delta_delivers_without_advancing_head() {
    let manager = ThreadProjectionManager::new();
    let thread_id = ThreadId::new();
    let connection_id = ConnectionId(1);

    let attach = manager.attach(thread_id, connection_id).await;
    let delta = manager
        .project_notification(
            thread_id,
            &agent_message_delta_notification(thread_id, "turn-1", "item-1", "hello"),
        )
        .await;
    let second_attach = manager.attach(thread_id, connection_id).await;
    let event = manager
        .project_notification(thread_id, &turn_started_notification(thread_id, "turn-1"))
        .await;

    assert_eq!(1, delta.len());
    assert_eq!(connection_id, delta[0].connection_id);
    assert_eq!(attach.subscription_id, delta[0].subscription_id());
    assert_eq!(attach.head_commit_id, second_attach.head_commit_id);
    assert_eq!(1, event.len());
    assert_eq!(None, event[0].event_notification().parent_commit_id);

    let ProjectionDeliveryPayload::Delta(notification) = &delta[0].payload else {
        panic!("expected projection delta delivery");
    };
    assert_eq!(thread_id.to_string(), notification.thread_id);
    assert_eq!(attach.subscription_id, notification.subscription_id);
    assert_eq!(
        ThreadProjectionDelta::AgentMessage {
            notification: AgentMessageDeltaNotification {
                thread_id: thread_id.to_string(),
                turn_id: "turn-1".to_string(),
                item_id: "item-1".to_string(),
                delta: "hello".to_string(),
            },
        },
        notification.delta
    );
}
```

Add this test:

```rust
#[tokio::test]
async fn two_subscribers_receive_projection_delta_with_distinct_subscription_ids() {
    let manager = ThreadProjectionManager::new();
    let thread_id = ThreadId::new();
    let first = manager.attach(thread_id, ConnectionId(1)).await;
    let second = manager.attach(thread_id, ConnectionId(2)).await;

    let deliveries = manager
        .project_notification(
            thread_id,
            &agent_message_delta_notification(thread_id, "turn-1", "item-1", "hello"),
        )
        .await;

    assert_eq!(2, deliveries.len());
    assert_eq!(first.subscription_id, deliveries[0].subscription_id());
    assert_eq!(second.subscription_id, deliveries[1].subscription_id());
    assert_eq!(
        deliveries[0].delta_notification().delta,
        deliveries[1].delta_notification().delta
    );
}
```

- [ ] **Step 2: Run the focused manager tests and confirm they fail**

Run:

```bash
just test -p codex-app-server thread_projection::tests::agent_message_delta_delivers_without_advancing_head thread_projection::tests::two_subscribers_receive_projection_delta_with_distinct_subscription_ids
```

Expected: FAIL because `ProjectionDeliveryPayload`, delta delivery accessors, and delta mapping are not implemented.

- [ ] **Step 3: Add a delivery payload enum**

In `codex-rs/app-server/src/thread_projection.rs`, update imports:

```rust
use codex_app_server_protocol::ThreadProjectionDelta;
use codex_app_server_protocol::ThreadProjectionDeltaNotification;
```

Replace `ProjectionDelivery` with:

```rust
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct ProjectionDelivery {
    pub(crate) connection_id: ConnectionId,
    pub(crate) generation: ProjectionGeneration,
    pub(crate) payload: ProjectionDeliveryPayload,
}

#[derive(Debug, Clone, PartialEq)]
pub(crate) enum ProjectionDeliveryPayload {
    Event(ThreadProjectionEventNotification),
    Delta(ThreadProjectionDeltaNotification),
}

impl ProjectionDelivery {
    #[cfg(test)]
    pub(crate) fn subscription_id(&self) -> &str {
        match &self.payload {
            ProjectionDeliveryPayload::Event(notification) => &notification.subscription_id,
            ProjectionDeliveryPayload::Delta(notification) => &notification.subscription_id,
        }
    }

    #[cfg(test)]
    pub(crate) fn event_notification(&self) -> &ThreadProjectionEventNotification {
        let ProjectionDeliveryPayload::Event(notification) = &self.payload else {
            panic!("expected projection event delivery");
        };
        notification
    }

    #[cfg(test)]
    pub(crate) fn delta_notification(&self) -> &ThreadProjectionDeltaNotification {
        let ProjectionDeliveryPayload::Delta(notification) = &self.payload else {
            panic!("expected projection delta delivery");
        };
        notification
    }
}
```

- [ ] **Step 4: Keep structural events on the commit-chain path**

Update `project_notification` so it branches:

```rust
pub(crate) async fn project_notification(
    &self,
    thread_id: ThreadId,
    notification: &ServerNotification,
) -> Vec<ProjectionDelivery> {
    if let Some(event) = projection_event_from_notification(notification) {
        return self.project_structural_event(thread_id, event).await;
    }
    if let Some(delta) = projection_delta_from_notification(notification) {
        return self.project_delta(thread_id, delta).await;
    }
    Vec::new()
}
```

Add private helpers:

```rust
async fn project_structural_event(
    &self,
    thread_id: ThreadId,
    event: ThreadProjectionEvent,
) -> Vec<ProjectionDelivery> {
    let mut inner = self.inner.lock().await;
    let generation = inner.capture_generation(thread_id);
    let entry = inner.thread_entry_mut(thread_id);
    let commit_id = Uuid::now_v7().to_string();
    let parent_commit_id = entry.advance_head(commit_id.clone());
    entry
        .sorted_subscribers()
        .into_iter()
        .map(|(connection_id, subscription_id)| ProjectionDelivery {
            connection_id,
            generation,
            payload: ProjectionDeliveryPayload::Event(ThreadProjectionEventNotification {
                thread_id: thread_id.to_string(),
                subscription_id,
                parent_commit_id: parent_commit_id.clone(),
                commit_id: commit_id.clone(),
                event: event.clone(),
            }),
        })
        .collect()
}

async fn project_delta(
    &self,
    thread_id: ThreadId,
    delta: ThreadProjectionDelta,
) -> Vec<ProjectionDelivery> {
    let mut inner = self.inner.lock().await;
    let generation = inner.capture_generation(thread_id);
    let entry = inner.thread_entry_mut(thread_id);
    entry
        .sorted_subscribers()
        .into_iter()
        .map(|(connection_id, subscription_id)| ProjectionDelivery {
            connection_id,
            generation,
            payload: ProjectionDeliveryPayload::Delta(ThreadProjectionDeltaNotification {
                thread_id: thread_id.to_string(),
                subscription_id,
                delta: delta.clone(),
            }),
        })
        .collect()
}
```

- [ ] **Step 5: Add delta mapping**

Add after `projection_event_from_notification`:

```rust
fn projection_delta_from_notification(
    notification: &ServerNotification,
) -> Option<ThreadProjectionDelta> {
    match notification {
        ServerNotification::AgentMessageDelta(notification) => {
            Some(ThreadProjectionDelta::AgentMessage {
                notification: notification.clone(),
            })
        }
        _ => None,
    }
}
```

- [ ] **Step 6: Update existing tests to use event accessors**

In `codex-rs/app-server/src/thread_projection.rs` tests, replace direct `.notification` access on `ProjectionDelivery` with `.event_notification()` where the test expects structural events.

Examples:

```rust
let first = first[0].event_notification();
let second = second[0].event_notification();
```

and:

```rust
deliveries[0].event_notification().commit_id
```

- [ ] **Step 7: Run the focused manager tests**

Run:

```bash
just test -p codex-app-server thread_projection::tests
```

Expected: PASS for the thread projection unit tests.

- [ ] **Step 8: Commit manager delivery work**

```bash
git add codex-rs/app-server/src/thread_projection.rs
git commit -m "feat(app-server): project agent message deltas"
```

## Task 3: Projection Fanout Sends Event and Delta Deliveries

**Files:**
- Modify: `codex-rs/app-server/src/projection_fanout.rs`
- Test: `codex-rs/app-server/src/projection_fanout.rs`

- [ ] **Step 1: Add failing fanout tests**

In `codex-rs/app-server/src/projection_fanout.rs` test module, add imports:

```rust
use codex_app_server_protocol::AgentMessageDeltaNotification;
use codex_app_server_protocol::ThreadProjectionDelta;
```

Add helper:

```rust
fn agent_message_delta_notification(
    thread_id: ThreadId,
    turn_id: &str,
    item_id: &str,
    delta: &str,
) -> ServerNotification {
    ServerNotification::AgentMessageDelta(AgentMessageDeltaNotification {
        thread_id: thread_id.to_string(),
        turn_id: turn_id.to_string(),
        item_id: item_id.to_string(),
        delta: delta.to_string(),
    })
}
```

Add this test:

```rust
#[tokio::test]
async fn fanout_worker_preserves_event_and_delta_order() {
    let facade = ThreadProjectionFacade::new();
    let thread_id = ThreadId::new();
    let subscription_id = attach_projection(&facade, thread_id, ConnectionId(3)).await;
    let (tx, mut rx) = mpsc::channel::<OutgoingEnvelope>(8);

    facade
        .enqueue_notification(
            tx.clone(),
            thread_id,
            &turn_started_notification(thread_id, "turn-1"),
        )
        .await;
    facade
        .enqueue_notification(
            tx.clone(),
            thread_id,
            &agent_message_delta_notification(thread_id, "turn-1", "item-1", "hello"),
        )
        .await;

    let first = timeout(Duration::from_secs(1), rx.recv())
        .await
        .expect("first projection envelope should arrive")
        .expect("first projection envelope should exist");
    let second = timeout(Duration::from_secs(1), rx.recv())
        .await
        .expect("second projection envelope should arrive")
        .expect("second projection envelope should exist");

    let OutgoingEnvelope::ToConnection {
        message:
            OutgoingMessage::AppServerNotification(ServerNotification::ThreadProjectionEvent(
                event,
            )),
        ..
    } = first
    else {
        panic!("expected first projection event");
    };
    let OutgoingEnvelope::ToConnection {
        message:
            OutgoingMessage::AppServerNotification(ServerNotification::ThreadProjectionDelta(
                delta,
            )),
        ..
    } = second
    else {
        panic!("expected second projection delta");
    };

    assert!(matches!(event.event, ThreadProjectionEvent::TurnStarted { .. }));
    assert_eq!(subscription_id, delta.subscription_id);
    assert_eq!(
        ThreadProjectionDelta::AgentMessage {
            notification: AgentMessageDeltaNotification {
                thread_id: thread_id.to_string(),
                turn_id: "turn-1".to_string(),
                item_id: "item-1".to_string(),
                delta: "hello".to_string(),
            },
        },
        delta.delta
    );
}
```

- [ ] **Step 2: Run the focused fanout test and confirm it fails**

Run:

```bash
just test -p codex-app-server projection_fanout::tests::fanout_worker_preserves_event_and_delta_order
```

Expected: FAIL because fanout still hardcodes `ThreadProjectionEvent`.

- [ ] **Step 3: Send based on delivery payload**

In `codex-rs/app-server/src/projection_fanout.rs`, import:

```rust
use crate::thread_projection::ProjectionDeliveryPayload;
```

Replace the hardcoded outgoing message in `send_projection_delivery_if_current_or_cancelled` with:

```rust
let outgoing_message = match delivery.payload {
    ProjectionDeliveryPayload::Event(notification) => {
        OutgoingMessage::AppServerNotification(ServerNotification::ThreadProjectionEvent(
            notification,
        ))
    }
    ProjectionDeliveryPayload::Delta(notification) => {
        OutgoingMessage::AppServerNotification(ServerNotification::ThreadProjectionDelta(
            notification,
        ))
    }
};
```

Keep `run_if_generation_matches` around both variants. Delta delivery is not a head commit, but it must still be canceled when a projection generation is invalidated.

- [ ] **Step 4: Add a backpressure regression for deltas**

Add this test in `projection_fanout.rs`:

```rust
#[tokio::test]
async fn delta_backpressure_closes_projection() {
    let manager = ThreadProjectionManager::new();
    let fanout = ProjectionFanoutManager::new_with_capacity(manager.clone(), 1);
    let facade = ThreadProjectionFacade {
        manager,
        fanout,
    };
    let thread_id = ThreadId::new();
    let subscription_id = attach_projection(&facade, thread_id, ConnectionId(9)).await;
    let (tx, mut rx) = mpsc::channel::<OutgoingEnvelope>(1);
    tx.send(capacity_holder())
        .await
        .expect("capacity holder should enqueue");

    facade
        .enqueue_notification(
            tx.clone(),
            thread_id,
            &agent_message_delta_notification(thread_id, "turn-1", "item-1", "first"),
        )
        .await;
    facade
        .enqueue_notification(
            tx.clone(),
            thread_id,
            &agent_message_delta_notification(thread_id, "turn-1", "item-1", "second"),
        )
        .await;

    let _capacity_holder = rx.recv().await.expect("capacity holder should be present");
    let envelope = timeout(Duration::from_secs(1), rx.recv())
        .await
        .expect("closed notification should arrive")
        .expect("closed notification should exist");

    let OutgoingEnvelope::ToConnection {
        connection_id,
        message:
            OutgoingMessage::AppServerNotification(ServerNotification::ThreadProjectionClosed(
                closed,
            )),
        ..
    } = envelope
    else {
        panic!("expected projection closed notification");
    };

    assert_eq!(ConnectionId(9), connection_id);
    assert_eq!(thread_id.to_string(), closed.thread_id);
    assert_eq!(subscription_id, closed.subscription_id);
}
```

- [ ] **Step 5: Run fanout tests**

Run:

```bash
just test -p codex-app-server projection_fanout::tests
```

Expected: PASS.

- [ ] **Step 6: Commit fanout work**

```bash
git add codex-rs/app-server/src/projection_fanout.rs
git commit -m "feat(app-server): fan out projection deltas"
```

## Task 4: Projection Fixtures and Generated Artifacts

**Files:**
- Modify: `codex-rs/app-server/src/thread_projection_fixtures.rs`
- Modify: `codex-rs/app-server/src/thread_projection_fixtures_tests.rs`
- Generated: `codex-rs/app-server-protocol/schema/**`
- Generated: `codex-gui/src/features/projection/__fixtures__/event-agent-message-delta.json`
- Test: `codex-rs/app-server/src/thread_projection_fixtures_tests.rs`

- [ ] **Step 1: Add failing fixture tests**

In `codex-rs/app-server/src/thread_projection_fixtures_tests.rs`, import:

```rust
use codex_app_server_protocol::ThreadProjectionDelta;
use codex_app_server_protocol::ThreadProjectionDeltaNotification;
```

Add `"event-agent-message-delta.json"` to the round-trip list, using `ThreadProjectionDeltaNotification`:

```rust
assert_round_trips::<ThreadProjectionDeltaNotification>(
    &fixtures["event-agent-message-delta.json"],
)?;
```

Add this shape test:

```rust
#[test]
fn generated_delta_fixture_is_transient_and_subscription_scoped() -> Result<()> {
    let fixtures = generate_fixture_files()?;
    let raw: Value = serde_json::from_str(&fixtures["event-agent-message-delta.json"])?;
    assert_absent_recursive(&raw, "commitId");
    assert_absent_recursive(&raw, "parentCommitId");

    let delta: ThreadProjectionDeltaNotification =
        serde_json::from_str(&fixtures["event-agent-message-delta.json"])?;
    assert_eq!(delta.thread_id, THREAD_ID.to_string());
    assert_eq!(delta.subscription_id, SUBSCRIPTION_ID.to_string());
    assert_eq!(
        delta.delta,
        ThreadProjectionDelta::AgentMessage {
            notification: codex_app_server_protocol::AgentMessageDeltaNotification {
                thread_id: THREAD_ID.to_string(),
                turn_id: "turn-in-progress".to_string(),
                item_id: "assistant-message".to_string(),
                delta: "streamed text".to_string(),
            },
        }
    );

    Ok(())
}
```

- [ ] **Step 2: Run fixture tests and confirm they fail**

Run:

```bash
just test -p codex-app-server thread_projection_fixtures_tests
```

Expected: FAIL because `event-agent-message-delta.json` is not generated.

- [ ] **Step 3: Add fixture generation**

In `codex-rs/app-server/src/thread_projection_fixtures.rs`, import:

```rust
use codex_app_server_protocol::AgentMessageDeltaNotification;
use codex_app_server_protocol::ThreadProjectionDelta;
use codex_app_server_protocol::ThreadProjectionDeltaNotification;
```

Add `"event-agent-message-delta.json"` to `GENERATED_FIXTURE_NAMES` in sorted order with the other event fixtures.

In `generate_fixture_files`, insert:

```rust
files.insert(
    "event-agent-message-delta.json",
    serialize_fixture(&event_agent_message_delta()?)?,
);
```

Add helper:

```rust
fn event_agent_message_delta() -> Result<ThreadProjectionDeltaNotification> {
    Ok(ThreadProjectionDeltaNotification {
        thread_id: THREAD_ID.to_string(),
        subscription_id: SUBSCRIPTION_ID.to_string(),
        delta: ThreadProjectionDelta::AgentMessage {
            notification: AgentMessageDeltaNotification {
                thread_id: THREAD_ID.to_string(),
                turn_id: "turn-in-progress".to_string(),
                item_id: "assistant-message".to_string(),
                delta: "streamed text".to_string(),
            },
        },
    })
}
```

- [ ] **Step 4: Generate schema artifacts**

Run:

```bash
just write-app-server-schema
```

Expected: schema and TypeScript files under `codex-rs/app-server-protocol/schema/**` update to include `ThreadProjectionDeltaNotification`, `ThreadProjectionDelta`, and `thread/projection/delta`.

- [ ] **Step 5: Generate GUI projection fixtures**

Run:

```bash
just write-gui-projection-fixtures
```

Expected: `codex-gui/src/features/projection/__fixtures__/event-agent-message-delta.json` is created and stale fixture checks pass after generation.

- [ ] **Step 6: Run fixture and protocol tests**

Run:

```bash
just test -p codex-app-server-protocol
just test -p codex-app-server thread_projection_fixtures_tests
```

Expected: PASS.

- [ ] **Step 7: Commit fixture and generated artifacts**

```bash
git add codex-rs/app-server/src/thread_projection_fixtures.rs codex-rs/app-server/src/thread_projection_fixtures_tests.rs codex-rs/app-server-protocol/schema codex-gui/src/features/projection/__fixtures__/event-agent-message-delta.json
git commit -m "test(app-server): add projection delta fixtures"
```

## Task 5: App-Server Integration Test

**Files:**
- Modify: `codex-rs/app-server/tests/common/responses.rs`
- Modify: `codex-rs/app-server/tests/common/lib.rs`
- Modify: `codex-rs/app-server/tests/suite/v2/thread_projection.rs`
- Test: `codex-rs/app-server/tests/suite/v2/thread_projection.rs`

- [ ] **Step 1: Add a streaming SSE test helper**

In `codex-rs/app-server/tests/common/responses.rs`, add:

```rust
pub fn create_streaming_assistant_message_sse_response(
    item_id: &str,
    delta: &str,
    final_message: &str,
) -> anyhow::Result<String> {
    Ok(responses::sse(vec![
        responses::ev_response_created("resp-1"),
        responses::ev_output_item_added_message(item_id),
        responses::ev_output_text_delta(delta),
        responses::ev_output_item_done_message(item_id, final_message),
        responses::ev_completed("resp-1"),
    ]))
}
```

If helper names differ in `core_test_support::responses`, use the existing constructors for output item added, output text delta, output item done, and response completed. Do not hand-write SSE JSON unless the constructors are absent.

In `codex-rs/app-server/tests/common/lib.rs`, export it:

```rust
pub use responses::create_streaming_assistant_message_sse_response;
```

- [ ] **Step 2: Add failing integration test**

In `codex-rs/app-server/tests/suite/v2/thread_projection.rs`, add imports:

```rust
use app_test_support::create_streaming_assistant_message_sse_response;
use codex_app_server_protocol::ThreadProjectionDelta;
use codex_app_server_protocol::ThreadProjectionDeltaNotification;
```

Add helper:

```rust
async fn read_projection_delta(mcp: &mut McpProcess) -> Result<ThreadProjectionDeltaNotification> {
    let notification: JSONRPCNotification = timeout(
        DEFAULT_READ_TIMEOUT,
        mcp.read_stream_until_notification_message("thread/projection/delta"),
    )
    .await??;
    let Some(params) = notification.params else {
        anyhow::bail!("thread/projection/delta notification missing params");
    };
    Ok(serde_json::from_value(params)?)
}
```

Add test:

```rust
#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn thread_projection_emits_transient_agent_message_delta_without_advancing_head() -> Result<()> {
    let codex_home = TempDir::new()?;
    let server = create_mock_responses_server_sequence_unchecked(vec![
        create_streaming_assistant_message_sse_response("msg-1", "streamed ", "streamed done")?,
    ])
    .await;
    write_mock_responses_config_toml(
        codex_home.path(),
        &server.uri(),
        &BTreeMap::new(),
        /*auto_compact_limit*/ 1024,
        /*requires_openai_auth*/ None,
        "mock_provider",
        "compact",
    )?;

    let mut mcp = McpProcess::new(codex_home.path()).await?;
    timeout(DEFAULT_READ_TIMEOUT, mcp.initialize()).await??;
    let thread = start_thread(&mut mcp).await?;

    let attach_id = mcp
        .send_thread_projection_attach_request(ThreadProjectionAttachParams {
            thread_id: thread.id.clone(),
        })
        .await?;
    let attach_response: JSONRPCResponse = timeout(
        DEFAULT_READ_TIMEOUT,
        mcp.read_stream_until_response_message(RequestId::Integer(attach_id)),
    )
    .await??;
    let attach: ThreadProjectionAttachResponse = to_response(attach_response)?;

    let turn_id = mcp
        .send_turn_start_request(TurnStartParams {
            thread_id: thread.id.clone(),
            input: vec![UserInput::Text {
                text: "stream once".to_string(),
                text_elements: Vec::new(),
            }],
            model: Some("mock-model".to_string()),
            ..Default::default()
        })
        .await?;
    let _turn_response: TurnStartResponse = to_response(
        timeout(
            DEFAULT_READ_TIMEOUT,
            mcp.read_stream_until_response_message(RequestId::Integer(turn_id)),
        )
        .await??,
    )?;

    let item_started = read_projection_event(&mut mcp).await?;
    assert_eq!(thread.id, item_started.thread_id);
    assert_eq!(attach.subscription_id, item_started.subscription_id);

    let delta = read_projection_delta(&mut mcp).await?;
    assert_eq!(thread.id, delta.thread_id);
    assert_eq!(attach.subscription_id, delta.subscription_id);
    let ThreadProjectionDelta::AgentMessage { notification } = delta.delta;
    assert_eq!(thread.id, notification.thread_id);
    assert_eq!("msg-1", notification.item_id);
    assert_eq!("streamed ", notification.delta);

    let item_completed = read_projection_event(&mut mcp).await?;
    assert_eq!(thread.id, item_completed.thread_id);
    assert_eq!(attach.subscription_id, item_completed.subscription_id);
    assert_eq!(
        Some(item_started.commit_id),
        item_completed.parent_commit_id
    );
    Ok(())
}
```

- [ ] **Step 3: Run the integration test and confirm it fails before implementation**

Run:

```bash
just test -p codex-app-server thread_projection_emits_transient_agent_message_delta_without_advancing_head
```

Expected before Tasks 1-3 are complete: FAIL. Expected after Tasks 1-3: PASS.

- [ ] **Step 4: Run the projection integration tests**

Run:

```bash
just test -p codex-app-server thread_projection
```

Expected: PASS.

- [ ] **Step 5: Commit integration coverage**

```bash
git add codex-rs/app-server/tests/common/responses.rs codex-rs/app-server/tests/common/lib.rs codex-rs/app-server/tests/suite/v2/thread_projection.rs
git commit -m "test(app-server): cover projection agent message deltas"
```

## Task 6: README and Final Verification

**Files:**
- Modify: `codex-rs/app-server/README.md`
- Verification only: repository root

- [ ] **Step 1: Update projection README text**

In `codex-rs/app-server/README.md`, update the projection summary around the existing `thread/projection/event` section to include:

```markdown
- `thread/projection/delta` — notification emitted to projection subscribers for transient stream progress that does not advance `headCommitId`. The first supported delta is `{ type: "agentMessage", notification }`, where `notification` has the same shape as `item/agentMessage/delta`.
```

Update the detailed projection section to say:

```markdown
Projection subscribers receive two live notification classes. `thread/projection/event` carries structural events with `commitId` and `parentCommitId`; clients use those events to advance `headCommitId`. `thread/projection/delta` carries transient progress for the same `subscriptionId` and does not include commit fields. Clients should ignore stale `subscriptionId` deltas and use the final `item/completed` event as the authoritative assistant message content.
```

- [ ] **Step 2: Run final Rust verification**

Run:

```bash
just test -p codex-app-server-protocol
just test -p codex-app-server thread_projection
just fmt
just fix -p codex-app-server -p codex-app-server-protocol
git diff --check
```

Expected: all commands pass. Do not rerun tests after `fmt` or `fix` unless `fix` reports semantic changes that need explicit checking.

- [ ] **Step 3: If GUI generated files changed, verify commands before running GUI checks**

Before writing or running any GUI command, read `codex-gui/package.json`:

```bash
sed -n '1,220p' codex-gui/package.json
```

Then run only scripts that exist in that file. At minimum, if TypeScript schema or projection fixture imports are touched manually, run the existing type-check or unit-test script for codex-gui after initializing fnm:

```bash
eval "$(/opt/homebrew/bin/fnm env --shell zsh)"
pnpm --version
```

If `pnpm --version` resolves to a binary under `/Users/jiangsheng/.cache/codex-runtimes/`, stop and fix the shell environment before running GUI commands.

- [ ] **Step 4: Commit docs and verification follow-up**

```bash
git add codex-rs/app-server/README.md
git commit -m "docs(app-server): document projection deltas"
```

If `fmt` or `fix` changed files from earlier tasks, include those files in the matching preceding commit or create a small follow-up commit that names the formatting/lint scope.

## Self-Review Checklist

- [ ] Spec coverage: protocol shape, delivery semantics, snapshot behavior, fanout/backpressure, tests, generated artifacts, and README are all mapped to tasks.
- [ ] Scope guard: no task modifies core event types, thread store, persisted history, snapshot cut, or GUI rendering.
- [ ] Placeholder scan: no step contains unfinished marker wording.
- [ ] Type consistency: `ThreadProjectionDeltaNotification`, `ThreadProjectionDelta`, `ProjectionDeliveryPayload`, and `thread/projection/delta` names are used consistently.
- [ ] Command validation: `just test`, `just fmt`, `just fix`, `just write-app-server-schema`, and `just write-gui-projection-fixtures` exist in the root `justfile`.
