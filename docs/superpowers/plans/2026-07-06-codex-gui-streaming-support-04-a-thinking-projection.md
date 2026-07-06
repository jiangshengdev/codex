# Thinking Projection Streaming Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose thinking/reasoning lifecycle events and transient deltas through Rust `thread/projection/event` and `thread/projection/delta`.

**Architecture:** Keep lifecycle on the existing generic `ItemStarted` / `ItemCompleted` projection event path. Extend only the projection-local delta union so the three existing reasoning notifications are delivered to projection subscribers without changing the underlying `item/reasoning/*` notification payloads or committed transcript semantics.

**Tech Stack:** Rust app-server v2 protocol, `serde`/`schemars`/`ts-rs` exported API types, app-server projection fanout, app-server JSON fixtures, nextest via repository `just` recipes.

---

## Scope

Implement only the accepted design in `docs/superpowers/specs/2026-07-03-codex-gui-streaming-support/04-a-thinking-projection-design.md`.

In scope:

- Add three `ThreadProjectionDelta` variants for reasoning summary text, reasoning summary part added, and raw/detail reasoning text.
- Map existing `ServerNotification::ReasoningSummaryTextDelta`, `ServerNotification::ReasoningSummaryPartAdded`, and `ServerNotification::ReasoningTextDelta` into `thread/projection/delta`.
- Add explicit Rust coverage that `ThreadItem::Reasoning` lifecycle events reach projection subscribers.
- Add projection fixture coverage for the new delta variants.
- Regenerate app-server protocol schema and GUI projection fixtures.
- Update app-server API README to document the new projection delta variants.

Out of scope:

- Do not add `ReasoningStarted` or `ReasoningCompleted`.
- Do not change `ReasoningSummaryTextDeltaNotification`, `ReasoningSummaryPartAddedNotification`, or `ReasoningTextDeltaNotification`.
- Do not change `ThreadHistoryBuilder`, rollout replay, committed transcript materialization, GUI Redux state, or visual rendering.
- Do not make reasoning delta advance `headCommitId`.

## File Structure

- Modify: `codex-rs/app-server-protocol/src/protocol/v2/thread_projection.rs`
  - Owns the `ThreadProjectionDelta` wire union and its serde/TS/schema export.
- Modify: `codex-rs/app-server/src/thread_projection.rs`
  - Owns projection delivery conversion from ordinary `ServerNotification` into projection event/delta notifications.
- Modify: `codex-rs/app-server/tests/common/responses.rs`
  - Add a compact app-server test helper that emits a reasoning SSE sequence.
- Modify: `codex-rs/app-server/tests/common/lib.rs`
  - Re-export the new reasoning SSE helper for integration tests.
- Modify: `codex-rs/app-server/tests/suite/v2/thread_projection.rs`
  - Add an end-to-end projection subscriber test for reasoning lifecycle and all three reasoning deltas.
- Modify: `codex-rs/app-server/src/thread_projection_fixtures.rs`
  - Add generated GUI projection JSON fixtures for the three new delta variants and reasoning lifecycle events.
- Modify: `codex-rs/app-server/src/thread_projection_fixtures_tests.rs`
  - Assert new fixtures round-trip and remain transient, with no `commitId` or `parentCommitId`.
- Modify generated schema/fixture outputs:
  - `codex-rs/app-server-protocol/schema/**`
  - GUI projection fixture output directory written by `just write-gui-projection-fixtures`
- Modify: `codex-rs/app-server/README.md`
  - Document the new `thread/projection/delta` reasoning variants.

## Task 1: Extend Projection Delta Protocol Type

**Files:**

- Modify: `codex-rs/app-server-protocol/src/protocol/v2/thread_projection.rs`

- [ ] **Step 1: Write the protocol type change**

In `codex-rs/app-server-protocol/src/protocol/v2/thread_projection.rs`, add imports for the existing reasoning notification payloads near the existing `AgentMessageDeltaNotification` import:

```rust
use super::AgentMessageDeltaNotification;
use super::ReasoningSummaryPartAddedNotification;
use super::ReasoningSummaryTextDeltaNotification;
use super::ReasoningTextDeltaNotification;
```

Then extend `ThreadProjectionDelta`:

```rust
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, JsonSchema, TS)]
#[serde(tag = "type", rename_all = "camelCase")]
#[ts(tag = "type", rename_all = "camelCase", export_to = "v2/")]
pub enum ThreadProjectionDelta {
    AgentMessage {
        notification: AgentMessageDeltaNotification,
    },
    ReasoningSummaryText {
        notification: ReasoningSummaryTextDeltaNotification,
    },
    ReasoningSummaryPartAdded {
        notification: ReasoningSummaryPartAddedNotification,
    },
    ReasoningText {
        notification: ReasoningTextDeltaNotification,
    },
}
```

Expected wire `type` values from `rename_all = "camelCase"`:

- `agentMessage`
- `reasoningSummaryText`
- `reasoningSummaryPartAdded`
- `reasoningText`

- [ ] **Step 2: Add focused serialization coverage**

In the existing `#[cfg(test)] mod tests` in the same file, add a test that serializes one `ThreadProjectionDeltaNotification` per new variant and compares the entire JSON value. Use the already exported notification structs and `serde_json::json`.

Example body for the `reasoningSummaryText` case:

```rust
let notification = ThreadProjectionDeltaNotification {
    thread_id: "thread-1".to_string(),
    subscription_id: "sub-1".to_string(),
    delta: ThreadProjectionDelta::ReasoningSummaryText {
        notification: ReasoningSummaryTextDeltaNotification {
            thread_id: "thread-1".to_string(),
            turn_id: "turn-1".to_string(),
            item_id: "reasoning-1".to_string(),
            delta: "considering".to_string(),
            summary_index: 0,
        },
    },
};

assert_eq!(
    serde_json::to_value(notification)?,
    json!({
        "threadId": "thread-1",
        "subscriptionId": "sub-1",
        "delta": {
            "type": "reasoningSummaryText",
            "notification": {
                "threadId": "thread-1",
                "turnId": "turn-1",
                "itemId": "reasoning-1",
                "delta": "considering",
                "summaryIndex": 0
            }
        }
    })
);
```

Add equivalent assertions for:

```rust
ThreadProjectionDelta::ReasoningSummaryPartAdded {
    notification: ReasoningSummaryPartAddedNotification {
        thread_id: "thread-1".to_string(),
        turn_id: "turn-1".to_string(),
        item_id: "reasoning-1".to_string(),
        summary_index: 1,
    },
}
```

and:

```rust
ThreadProjectionDelta::ReasoningText {
    notification: ReasoningTextDeltaNotification {
        thread_id: "thread-1".to_string(),
        turn_id: "turn-1".to_string(),
        item_id: "reasoning-1".to_string(),
        delta: "raw detail".to_string(),
        content_index: 0,
    },
}
```

- [ ] **Step 3: Run the narrow protocol test**

Run from the repository root:

```bash
just test -p codex-app-server-protocol thread_projection_delta
```

Expected: the new focused test passes. If the test name differs after implementation, use the exact test function name as the final filter.

- [ ] **Step 4: Commit Task 1**

```bash
git add codex-rs/app-server-protocol/src/protocol/v2/thread_projection.rs
git diff --cached -- codex-rs/app-server-protocol/src/protocol/v2/thread_projection.rs
git commit -m "feat(app-server): add reasoning projection delta types"
```

Expected: one local commit containing only the protocol type and its focused serialization test.

## Task 2: Map Reasoning Notifications Into Projection Delta

**Files:**

- Modify: `codex-rs/app-server/src/thread_projection.rs`

- [ ] **Step 1: Write the failing mapper tests**

In `codex-rs/app-server/src/thread_projection.rs`, extend the existing test module imports with:

```rust
use codex_app_server_protocol::ReasoningSummaryPartAddedNotification;
use codex_app_server_protocol::ReasoningSummaryTextDeltaNotification;
use codex_app_server_protocol::ReasoningTextDeltaNotification;
```

Add focused tests around `projection_delta_from_notification()` for all three ordinary reasoning notifications. Use whole-object equality:

```rust
#[test]
fn projection_delta_wraps_reasoning_summary_text_delta() {
    let notification = ServerNotification::ReasoningSummaryTextDelta(
        ReasoningSummaryTextDeltaNotification {
            thread_id: "thread-1".to_string(),
            turn_id: "turn-1".to_string(),
            item_id: "reasoning-1".to_string(),
            delta: "considering".to_string(),
            summary_index: 0,
        },
    );

    assert_eq!(
        projection_delta_from_notification(&notification),
        Some(ThreadProjectionDelta::ReasoningSummaryText {
            notification: ReasoningSummaryTextDeltaNotification {
                thread_id: "thread-1".to_string(),
                turn_id: "turn-1".to_string(),
                item_id: "reasoning-1".to_string(),
                delta: "considering".to_string(),
                summary_index: 0,
            },
        })
    );
}
```

Add equivalent tests for:

```rust
ServerNotification::ReasoningSummaryPartAdded(ReasoningSummaryPartAddedNotification {
    thread_id: "thread-1".to_string(),
    turn_id: "turn-1".to_string(),
    item_id: "reasoning-1".to_string(),
    summary_index: 1,
})
```

and:

```rust
ServerNotification::ReasoningTextDelta(ReasoningTextDeltaNotification {
    thread_id: "thread-1".to_string(),
    turn_id: "turn-1".to_string(),
    item_id: "reasoning-1".to_string(),
    delta: "raw detail".to_string(),
    content_index: 0,
})
```

- [ ] **Step 2: Run the failing mapper test**

Run:

```bash
just test -p codex-app-server projection_delta_wraps_reasoning
```

Expected before implementation: FAIL because `projection_delta_from_notification()` still returns `None` for reasoning notifications.

- [ ] **Step 3: Implement the mapper**

Update `projection_delta_from_notification()`:

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
        ServerNotification::ReasoningSummaryTextDelta(notification) => {
            Some(ThreadProjectionDelta::ReasoningSummaryText {
                notification: notification.clone(),
            })
        }
        ServerNotification::ReasoningSummaryPartAdded(notification) => {
            Some(ThreadProjectionDelta::ReasoningSummaryPartAdded {
                notification: notification.clone(),
            })
        }
        ServerNotification::ReasoningTextDelta(notification) => {
            Some(ThreadProjectionDelta::ReasoningText {
                notification: notification.clone(),
            })
        }
        _ => None,
    }
}
```

- [ ] **Step 4: Run the mapper tests again**

Run:

```bash
just test -p codex-app-server projection_delta_wraps_reasoning
```

Expected: PASS.

- [ ] **Step 5: Commit Task 2**

```bash
git add codex-rs/app-server/src/thread_projection.rs
git diff --cached -- codex-rs/app-server/src/thread_projection.rs
git commit -m "feat(app-server): project reasoning deltas"
```

Expected: one local commit containing only the projection mapper and its focused tests.

## Task 3: Add End-to-End Projection Subscriber Coverage

**Files:**

- Modify: `codex-rs/app-server/tests/common/responses.rs`
- Modify: `codex-rs/app-server/tests/common/lib.rs`
- Modify: `codex-rs/app-server/tests/suite/v2/thread_projection.rs`

- [ ] **Step 1: Add an app-server SSE helper**

In `codex-rs/app-server/tests/common/responses.rs`, add:

```rust
pub fn create_streaming_reasoning_sse_response(
    item_id: &str,
    summary_delta: &str,
    raw_delta: &str,
    final_summary: &str,
    final_raw: &str,
) -> anyhow::Result<String> {
    Ok(responses::sse(vec![
        responses::ev_response_created("resp-1"),
        responses::ev_reasoning_item_added(item_id, &[""]),
        responses::ev_reasoning_summary_text_delta(summary_delta),
        serde_json::json!({
            "type": "response.reasoning_summary_part.added",
            "summary_index": 1,
        }),
        responses::ev_reasoning_text_delta(raw_delta),
        responses::ev_reasoning_item(item_id, &[final_summary], &[final_raw]),
        responses::ev_completed("resp-1"),
    ]))
}
```

This helper intentionally uses existing `core_test_support::responses` helpers for the common reasoning events and local JSON only for `response.reasoning_summary_part.added`, which has no current helper.

- [ ] **Step 2: Re-export the helper**

In `codex-rs/app-server/tests/common/lib.rs`, add:

```rust
pub use responses::create_streaming_reasoning_sse_response;
```

- [ ] **Step 3: Add imports in the integration test**

In `codex-rs/app-server/tests/suite/v2/thread_projection.rs`, add:

```rust
use app_test_support::create_streaming_reasoning_sse_response;
```

The file already imports `ThreadItem`, `ThreadProjectionDelta`, and projection notification types.

- [ ] **Step 4: Add the e2e test**

Add a new test near `thread_projection_emits_transient_agent_message_delta_without_advancing_head`:

```rust
#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn thread_projection_emits_reasoning_lifecycle_and_deltas() -> Result<()> {
    let codex_home = TempDir::new()?;
    let server = create_mock_responses_server_sequence_unchecked(vec![
        create_streaming_reasoning_sse_response(
            "reasoning-1",
            "summary delta",
            "raw delta",
            "final summary",
            "final raw",
        )?,
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
                text: "think once".to_string(),
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

    let item_started = read_projection_event_until_item_started(
        &mut mcp,
        &thread.id,
        &attach.subscription_id,
        "reasoning-1",
    )
    .await?;
    let ThreadProjectionEvent::ItemStarted {
        notification: started,
    } = &item_started.event
    else {
        anyhow::bail!("expected ItemStarted, got {:?}", item_started.event);
    };
    assert!(matches!(started.item, ThreadItem::Reasoning { .. }));

    let summary_delta = read_projection_delta(&mut mcp).await?;
    assert_eq!(thread.id, summary_delta.thread_id);
    assert_eq!(attach.subscription_id, summary_delta.subscription_id);
    let ThreadProjectionDelta::ReasoningSummaryText { notification } =
        summary_delta.delta
    else {
        anyhow::bail!("expected ReasoningSummaryText delta");
    };
    assert_eq!(thread.id, notification.thread_id);
    assert_eq!("reasoning-1", notification.item_id);
    assert_eq!("summary delta", notification.delta);
    assert_eq!(0, notification.summary_index);

    let part_added = read_projection_delta(&mut mcp).await?;
    let ThreadProjectionDelta::ReasoningSummaryPartAdded { notification } =
        part_added.delta
    else {
        anyhow::bail!("expected ReasoningSummaryPartAdded delta");
    };
    assert_eq!(thread.id, notification.thread_id);
    assert_eq!("reasoning-1", notification.item_id);
    assert_eq!(1, notification.summary_index);

    let raw_delta = read_projection_delta(&mut mcp).await?;
    let ThreadProjectionDelta::ReasoningText { notification } = raw_delta.delta else {
        anyhow::bail!("expected ReasoningText delta");
    };
    assert_eq!(thread.id, notification.thread_id);
    assert_eq!("reasoning-1", notification.item_id);
    assert_eq!("raw delta", notification.delta);
    assert_eq!(0, notification.content_index);

    let item_completed =
        projection_event_from_notification(read_next_projection_notification(&mut mcp).await?)?;
    let ThreadProjectionEvent::ItemCompleted {
        notification: completed,
    } = &item_completed.event
    else {
        anyhow::bail!("expected ItemCompleted, got {:?}", item_completed.event);
    };
    assert!(matches!(completed.item, ThreadItem::Reasoning { .. }));
    assert_eq!(
        Some(item_started.commit_id),
        item_completed.parent_commit_id
    );

    Ok(())
}
```

- [ ] **Step 5: Run the focused e2e test**

Run:

```bash
just test -p codex-app-server thread_projection_emits_reasoning_lifecycle_and_deltas
```

Expected: PASS.

- [ ] **Step 6: Commit Task 3**

```bash
git add \
  codex-rs/app-server/tests/common/responses.rs \
  codex-rs/app-server/tests/common/lib.rs \
  codex-rs/app-server/tests/suite/v2/thread_projection.rs
git diff --cached --stat
git commit -m "test(app-server): cover reasoning projection stream"
```

Expected: one local commit containing only the app-server test helper and integration test.

## Task 4: Update Fixtures, Schema, And README

**Files:**

- Modify: `codex-rs/app-server/src/thread_projection_fixtures.rs`
- Modify: `codex-rs/app-server/src/thread_projection_fixtures_tests.rs`
- Modify generated GUI projection fixture files written by `just write-gui-projection-fixtures`
  - Default output directory: `codex-gui/src/features/projection/__fixtures__/`
- Modify generated app-server protocol schema files written by `just write-app-server-schema`
- Modify: `codex-rs/app-server/README.md`

- [ ] **Step 1: Add fixture imports**

In `codex-rs/app-server/src/thread_projection_fixtures.rs`, add imports:

```rust
use codex_app_server_protocol::ReasoningSummaryPartAddedNotification;
use codex_app_server_protocol::ReasoningSummaryTextDeltaNotification;
use codex_app_server_protocol::ReasoningTextDeltaNotification;
```

- [ ] **Step 2: Add fixture names**

Extend `GENERATED_FIXTURE_NAMES` with:

```rust
"event-reasoning-item-completed.json",
"event-reasoning-item-started.json",
"event-reasoning-summary-part-added-delta.json",
"event-reasoning-summary-text-delta.json",
"event-reasoning-text-delta.json",
```

Keep the list sorted in the same style as the existing names if the file already maintains sorted output.

- [ ] **Step 3: Add fixture generators**

Add three delta generator functions:

```rust
fn event_reasoning_summary_text_delta() -> Result<ThreadProjectionDeltaNotification> {
    Ok(ThreadProjectionDeltaNotification {
        thread_id: THREAD_ID.to_string(),
        subscription_id: SUBSCRIPTION_ID.to_string(),
        delta: ThreadProjectionDelta::ReasoningSummaryText {
            notification: ReasoningSummaryTextDeltaNotification {
                thread_id: THREAD_ID.to_string(),
                turn_id: "turn-in-progress".to_string(),
                item_id: "reasoning-item".to_string(),
                delta: "thinking summary".to_string(),
                summary_index: 0,
            },
        },
    })
}

fn event_reasoning_summary_part_added_delta() -> Result<ThreadProjectionDeltaNotification> {
    Ok(ThreadProjectionDeltaNotification {
        thread_id: THREAD_ID.to_string(),
        subscription_id: SUBSCRIPTION_ID.to_string(),
        delta: ThreadProjectionDelta::ReasoningSummaryPartAdded {
            notification: ReasoningSummaryPartAddedNotification {
                thread_id: THREAD_ID.to_string(),
                turn_id: "turn-in-progress".to_string(),
                item_id: "reasoning-item".to_string(),
                summary_index: 1,
            },
        },
    })
}

fn event_reasoning_text_delta() -> Result<ThreadProjectionDeltaNotification> {
    Ok(ThreadProjectionDeltaNotification {
        thread_id: THREAD_ID.to_string(),
        subscription_id: SUBSCRIPTION_ID.to_string(),
        delta: ThreadProjectionDelta::ReasoningText {
            notification: ReasoningTextDeltaNotification {
                thread_id: THREAD_ID.to_string(),
                turn_id: "turn-in-progress".to_string(),
                item_id: "reasoning-item".to_string(),
                delta: "raw reasoning".to_string(),
                content_index: 0,
            },
        },
    })
}
```

Add reasoning lifecycle fixtures using `ThreadItem::Reasoning`:

```rust
fn reasoning_item(id: &str, summary: &str, content: &str) -> ThreadItem {
    ThreadItem::Reasoning {
        id: id.to_string(),
        summary: vec![summary.to_string()],
        content: vec![content.to_string()],
    }
}
```

Use that helper in `event_reasoning_item_started()` and `event_reasoning_item_completed()` with existing `ItemStartedNotification` / `ItemCompletedNotification` shapes.

- [ ] **Step 4: Insert fixtures into `generate_fixture_files()`**

Add entries:

```rust
files.insert(
    "event-reasoning-item-started.json",
    serialize_fixture(&event_reasoning_item_started()?)?,
);
files.insert(
    "event-reasoning-item-completed.json",
    serialize_fixture(&event_reasoning_item_completed()?)?,
);
files.insert(
    "event-reasoning-summary-text-delta.json",
    serialize_fixture(&event_reasoning_summary_text_delta()?)?,
);
files.insert(
    "event-reasoning-summary-part-added-delta.json",
    serialize_fixture(&event_reasoning_summary_part_added_delta()?)?,
);
files.insert(
    "event-reasoning-text-delta.json",
    serialize_fixture(&event_reasoning_text_delta()?)?,
);
```

- [ ] **Step 5: Extend fixture tests**

In `codex-rs/app-server/src/thread_projection_fixtures_tests.rs`, extend `generated_fixtures_round_trip_through_protocol_types()`:

```rust
for name in [
    "event-agent-message-delta.json",
    "event-reasoning-summary-text-delta.json",
    "event-reasoning-summary-part-added-delta.json",
    "event-reasoning-text-delta.json",
] {
    assert_round_trips::<ThreadProjectionDeltaNotification>(&fixtures[name])?;
}
```

Extend the event round-trip list with:

```rust
"event-reasoning-item-started.json",
"event-reasoning-item-completed.json",
```

Add a transient assertion test for all reasoning delta fixtures:

```rust
#[test]
fn generated_reasoning_delta_fixtures_are_transient_and_subscription_scoped() -> Result<()> {
    let fixtures = generate_fixture_files()?;

    for name in [
        "event-reasoning-summary-text-delta.json",
        "event-reasoning-summary-part-added-delta.json",
        "event-reasoning-text-delta.json",
    ] {
        let raw: Value = serde_json::from_str(&fixtures[name])?;
        assert_absent_recursive(&raw, "commitId");
        assert_absent_recursive(&raw, "parentCommitId");

        let delta: ThreadProjectionDeltaNotification = serde_json::from_str(&fixtures[name])?;
        assert_eq!(delta.thread_id, THREAD_ID.to_string());
        assert_eq!(delta.subscription_id, SUBSCRIPTION_ID.to_string());
    }

    Ok(())
}
```

- [ ] **Step 6: Regenerate generated outputs**

Run from the repository root:

```bash
just write-app-server-schema
just write-gui-projection-fixtures
```

Expected:

- `codex-rs/app-server-protocol/schema/**` updates include the three new `ThreadProjectionDelta` variants.
- GUI projection fixtures include the five new reasoning fixture JSON files.

- [ ] **Step 7: Update README**

In `codex-rs/app-server/README.md`, update the `thread/projection/delta` bullet near the method list so it names all supported projection delta variants:

```markdown
- `thread/projection/delta` — notification emitted to projection subscribers for transient stream progress that does not advance `headCommitId`. Supported deltas are `{ type: "agentMessage", notification }`, `{ type: "reasoningSummaryText", notification }`, `{ type: "reasoningSummaryPartAdded", notification }`, and `{ type: "reasoningText", notification }`. Each `notification` has the same shape as the matching ordinary item delta notification. Projection deltas are not final content and do not carry phase; clients get authoritative completed content from the later `item/completed` event.
```

In the attach example paragraph, preserve the existing distinction that `thread/projection/event` carries `commitId` and `parentCommitId`, while `thread/projection/delta` carries transient progress for the same `subscriptionId` and does not include commit fields.

- [ ] **Step 8: Run fixture and protocol checks**

Run:

```bash
just test -p codex-app-server-protocol schema_fixtures
just test -p codex-app-server generated_fixtures_round_trip_through_protocol_types
just test -p codex-app-server generated_reasoning_delta_fixtures_are_transient_and_subscription_scoped
```

Expected: all pass.

- [ ] **Step 9: Commit Task 4**

```bash
git add \
  codex-rs/app-server/src/thread_projection_fixtures.rs \
  codex-rs/app-server/src/thread_projection_fixtures_tests.rs \
  codex-rs/app-server-protocol/schema \
  codex-gui/src/features/projection/__fixtures__ \
  codex-rs/app-server/README.md
git diff --cached --stat
git commit -m "docs(app-server): document reasoning projection deltas"
```

If `git status --short` shows generated projection fixture changes outside `codex-gui/src/features/projection/__fixtures__/`, inspect `codex-rs/app-server/src/bin/write_gui_projection_fixtures.rs` before staging and stage only the actual generated projection fixture files.

Expected: one local commit containing fixture generator changes, generated fixture/schema outputs, and README updates.

## Task 5: Final Formatting And Focused Verification

**Files:**

- Verify all files changed by Tasks 1-4.

- [ ] **Step 1: Format Rust and docs**

Run:

```bash
just fmt
```

Expected: exits 0. This may update Rust formatting and generated-format-adjacent files.

- [ ] **Step 2: Run the focused Rust checks**

Run:

```bash
just test -p codex-app-server-protocol thread_projection_delta
just test -p codex-app-server projection_delta_wraps_reasoning
just test -p codex-app-server thread_projection_emits_reasoning_lifecycle_and_deltas
just test -p codex-app-server generated_reasoning_delta_fixtures_are_transient_and_subscription_scoped
```

Expected: all pass.

- [ ] **Step 3: Run scoped fix for changed Rust crates**

Run after tests:

```bash
just fix -p codex-app-server-protocol
just fix -p codex-app-server
```

Expected: exits 0. Do not re-run tests after `fix` unless `fix` changes code materially and the executor decides the extra time is worth it.

- [ ] **Step 4: Inspect final diff**

Run:

```bash
git status --short
git diff --stat
git diff --check
```

Expected:

- No whitespace errors from `git diff --check`.
- Changes are limited to protocol delta types, projection mapping/tests, fixtures/schema, and app-server README.
- No changes under `ThreadHistoryBuilder`, rollout materialization, GUI Redux state, or GUI rendering.

- [ ] **Step 5: Commit final formatting if needed**

If `just fmt` or `just fix` created additional changes not included in prior task commits:

```bash
git status --short
git add codex-rs/app-server-protocol/src/protocol/v2/thread_projection.rs
git add codex-rs/app-server/src/thread_projection.rs
git add codex-rs/app-server/tests/common/responses.rs
git add codex-rs/app-server/tests/common/lib.rs
git add codex-rs/app-server/tests/suite/v2/thread_projection.rs
git add codex-rs/app-server/src/thread_projection_fixtures.rs
git add codex-rs/app-server/src/thread_projection_fixtures_tests.rs
git diff --cached --stat
git commit -m "chore: format reasoning projection changes"
```

Expected: either no commit is needed, or one local commit containing only mechanical formatting/fix output. If `git status --short` shows a file not listed above, inspect it before staging; do not stage unrelated user changes.

## Final Report

Report these items after implementation:

- The commit hashes created for each task.
- The exact `ThreadProjectionDelta` variants added.
- The exact app-server tests run and their pass/fail result.
- The generated schema and GUI projection fixture files that changed.
- Confirmation that reasoning lifecycle still uses `ItemStarted` / `ItemCompleted`.
- Confirmation that reasoning deltas do not include `commitId` / `parentCommitId` and do not advance `headCommitId`.
