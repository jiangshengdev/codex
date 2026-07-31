use super::*;

use anyhow::Context;
use codex_app_server_protocol::ThreadProjectionClosedNotification;
use codex_app_server_protocol::ThreadProjectionClosedReason;
use codex_app_server_protocol::ThreadProjectionDelta;
use codex_app_server_protocol::ThreadProjectionDeltaNotification;
use pretty_assertions::assert_eq;
use serde::de::DeserializeOwned;
use serde_json::Value;

#[test]
fn generated_fixture_set_is_stable() -> Result<()> {
    let fixtures = generate_fixture_files()?;
    let actual = fixtures.keys().copied().collect::<Vec<_>>();
    assert_eq!(actual, GENERATED_FIXTURE_NAMES);
    Ok(())
}

#[test]
fn generated_fixture_set_excludes_stale_historical_files() -> Result<()> {
    let fixtures = generate_fixture_files()?;
    for stale_name in STALE_FIXTURE_NAMES {
        assert!(
            !fixtures.contains_key(stale_name),
            "stale historical fixture should not be generated: {stale_name}"
        );
    }
    Ok(())
}

#[test]
fn generated_fixtures_match_current_projection_shape() -> Result<()> {
    let fixtures = generate_fixture_files()?;
    let attach: Value = serde_json::from_str(&fixtures["attach-baseline.json"])?;
    let event: Value = serde_json::from_str(&fixtures["event-turn-started.json"])?;
    let closed: Value = serde_json::from_str(&fixtures["closed-backpressure.json"])?;

    assert!(attach.get("subscriptionId").is_some());
    assert!(attach.get("snapshot").is_some());
    assert!(attach["snapshot"].get("thread").is_some());
    assert!(attach["snapshot"].get("headCommitId").is_some());
    assert_eq!(attach["snapshot"]["thread"]["parentThreadId"], Value::Null);
    assert_eq!(attach["snapshot"]["thread"]["status"]["type"], "idle");

    assert_eq!(event["threadId"], THREAD_ID);
    assert_eq!(event["subscriptionId"], SUBSCRIPTION_ID);
    assert_eq!(event["commitId"], "commit-turn-started");
    assert_eq!(event["parentCommitId"], Value::Null);
    assert_eq!(event["event"]["type"], "turnStarted");

    assert_eq!(closed["threadId"], THREAD_ID);
    assert_eq!(closed["subscriptionId"], SUBSCRIPTION_ID);
    assert_eq!(closed["reason"], "backpressure");

    for contents in fixtures.values() {
        let value: Value = serde_json::from_str(contents)?;
        for field in [
            "projectionInstanceId",
            "latestSequence",
            "sequence",
            "eventId",
            "payload",
        ] {
            assert_absent_recursive(&value, field);
        }
    }

    Ok(())
}

fn assert_absent_recursive(value: &Value, key: &str) {
    match value {
        Value::Object(map) => {
            assert!(!map.contains_key(key), "unexpected historical field {key}");
            for child in map.values() {
                assert_absent_recursive(child, key);
            }
        }
        Value::Array(items) => {
            for child in items {
                assert_absent_recursive(child, key);
            }
        }
        Value::Null | Value::Bool(_) | Value::Number(_) | Value::String(_) => {}
    }
}

#[test]
fn generated_fixtures_round_trip_through_protocol_types() -> Result<()> {
    let fixtures = generate_fixture_files()?;

    assert_round_trips::<ThreadProjectionAttachResponse>(&fixtures["attach-baseline.json"])?;
    assert_round_trips::<ThreadProjectionAttachResponse>(&fixtures["attach-replacement.json"])?;
    assert_round_trips::<ThreadProjectionClosedNotification>(
        &fixtures["closed-backpressure.json"],
    )?;
    for name in [
        "event-agent-message-delta.json",
        "event-reasoning-summary-text-delta.json",
        "event-reasoning-summary-part-added-delta.json",
        "event-reasoning-text-delta.json",
    ] {
        assert_round_trips::<ThreadProjectionDeltaNotification>(&fixtures[name])?;
    }

    for name in [
        "event-turn-started.json",
        "event-item-started.json",
        "event-item-completed.json",
        "event-reasoning-item-started.json",
        "event-reasoning-item-completed.json",
        "event-turn-completed.json",
        "event-subscription-replacement.json",
    ] {
        assert_round_trips::<ThreadProjectionEventNotification>(&fixtures[name])?;
    }

    Ok(())
}

#[test]
fn generated_closed_backpressure_fixture_uses_current_subscription() -> Result<()> {
    let fixtures = generate_fixture_files()?;
    let closed: ThreadProjectionClosedNotification =
        serde_json::from_str(&fixtures["closed-backpressure.json"])?;

    assert_eq!(
        closed,
        ThreadProjectionClosedNotification {
            thread_id: THREAD_ID.to_string(),
            subscription_id: SUBSCRIPTION_ID.to_string(),
            reason: ThreadProjectionClosedReason::Backpressure,
        }
    );

    Ok(())
}

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

fn assert_round_trips<T>(contents: &str) -> Result<()>
where
    T: DeserializeOwned + Serialize,
{
    let value: T = serde_json::from_str(contents)?;
    assert_eq!(serialize_fixture(&value)?, contents);
    Ok(())
}

#[test]
fn generated_commit_chain_is_contiguous() -> Result<()> {
    let fixtures = generate_fixture_files()?;
    let turn_started: ThreadProjectionEventNotification =
        serde_json::from_str(&fixtures["event-turn-started.json"])?;
    let item_started: ThreadProjectionEventNotification =
        serde_json::from_str(&fixtures["event-item-started.json"])?;
    let item_completed: ThreadProjectionEventNotification =
        serde_json::from_str(&fixtures["event-item-completed.json"])?;
    let reasoning_item_started: ThreadProjectionEventNotification =
        serde_json::from_str(&fixtures["event-reasoning-item-started.json"])?;
    let reasoning_item_completed: ThreadProjectionEventNotification =
        serde_json::from_str(&fixtures["event-reasoning-item-completed.json"])?;
    let turn_completed: ThreadProjectionEventNotification =
        serde_json::from_str(&fixtures["event-turn-completed.json"])?;
    let replacement: ThreadProjectionEventNotification =
        serde_json::from_str(&fixtures["event-subscription-replacement.json"])?;

    assert_eq!(turn_started.parent_commit_id, None);
    assert_eq!(item_started.parent_commit_id, Some(turn_started.commit_id));
    assert_eq!(
        item_completed.parent_commit_id,
        Some(item_started.commit_id)
    );
    assert_eq!(
        reasoning_item_started.parent_commit_id,
        Some(item_completed.commit_id)
    );
    assert_eq!(
        reasoning_item_completed.parent_commit_id,
        Some(reasoning_item_started.commit_id)
    );
    assert_eq!(
        turn_completed.parent_commit_id,
        Some(reasoning_item_completed.commit_id)
    );
    assert_eq!(
        replacement.parent_commit_id,
        Some(REPLACEMENT_HEAD_COMMIT_ID.to_string())
    );
    assert_eq!(replacement.subscription_id, REPLACEMENT_SUBSCRIPTION_ID);

    Ok(())
}

#[test]
fn write_preserves_unrelated_files_and_removes_stale_generated_files() -> Result<()> {
    let temp_dir = tempfile::TempDir::new()?;
    let out_dir = temp_dir.path().join("fixtures");
    std::fs::create_dir(&out_dir)?;

    let unrelated_path = out_dir.join("keep.txt");
    std::fs::write(&unrelated_path, "do not remove")?;

    let stale_path = out_dir.join("event-large-sequence.json");
    std::fs::write(&stale_path, "stale historical fixture")?;

    let generated_path = out_dir.join("attach-baseline.json");
    std::fs::write(&generated_path, "stale generated fixture")?;

    write(&out_dir)?;

    let fixtures = generate_fixture_files()?;
    assert_eq!(std::fs::read_to_string(&unrelated_path)?, "do not remove");
    assert!(!stale_path.exists());
    assert_eq!(
        std::fs::read_to_string(&generated_path)?,
        fixtures["attach-baseline.json"]
    );
    Ok(())
}

#[test]
fn generated_fixtures_match_committed_files() -> Result<()> {
    let fixtures = generate_fixture_files()?;
    let committed_dir =
        codex_utils_cargo_bin::repo_root()?.join("codex-gui/src/features/projection/__fixtures__");

    for (name, generated_contents) in fixtures {
        let committed_path = committed_dir.join(name);
        let committed_contents = std::fs::read_to_string(&committed_path).with_context(|| {
            format!(
                "failed to read committed projection fixture {}; re-run cargo run -p codex-app-server --bin write_gui_projection_fixtures and commit the fixture changes",
                committed_path.display()
            )
        })?;
        assert_eq!(
            committed_contents, generated_contents,
            "committed projection fixture {name} is stale; re-run cargo run -p codex-app-server --bin write_gui_projection_fixtures and commit the fixture changes"
        );
    }

    Ok(())
}
