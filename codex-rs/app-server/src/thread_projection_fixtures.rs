use anyhow::Context;
use anyhow::Result;
use codex_app_server_protocol::ItemCompletedNotification;
use codex_app_server_protocol::ItemStartedNotification;
use codex_app_server_protocol::SessionSource;
use codex_app_server_protocol::Thread;
use codex_app_server_protocol::ThreadItem;
use codex_app_server_protocol::ThreadProjectionAttachResponse;
use codex_app_server_protocol::ThreadProjectionEvent;
use codex_app_server_protocol::ThreadProjectionEventNotification;
use codex_app_server_protocol::ThreadProjectionSnapshot;
use codex_app_server_protocol::ThreadStatus;
use codex_app_server_protocol::Turn;
use codex_app_server_protocol::TurnCompletedNotification;
use codex_app_server_protocol::TurnItemsView;
use codex_app_server_protocol::TurnStartedNotification;
use codex_app_server_protocol::TurnStatus;
use codex_utils_absolute_path::AbsolutePathBuf;
use std::collections::BTreeMap;
use std::fs;
use std::path::Path;

const THREAD_ID: &str = "00000000-0000-0000-0000-000000000001";
const SUBSCRIPTION_ID: &str = "projection-fixture-subscription";
const REPLACEMENT_SUBSCRIPTION_ID: &str = "projection-fixture-replacement-subscription";
const REPLACEMENT_HEAD_COMMIT_ID: &str = "commit-replacement-head";
const FIXTURE_CWD: &str = "/tmp/codex-gui-projection-fixtures";

const GENERATED_FIXTURE_NAMES: [&str; 7] = [
    "attach-baseline.json",
    "attach-replacement.json",
    "event-item-completed.json",
    "event-item-started.json",
    "event-subscription-replacement.json",
    "event-turn-completed.json",
    "event-turn-started.json",
];

const STALE_FIXTURE_NAMES: [&str; 3] = [
    "event-large-sequence.json",
    "event-projection-reset.json",
    "event-thread-metadata-updated-null.json",
];

const IN_PROGRESS_TURN_ID: &str = "turn-in-progress";
const TURN_STARTED_COMMIT_ID: &str = "commit-turn-started";
const ITEM_STARTED_COMMIT_ID: &str = "commit-item-started";
const ITEM_COMPLETED_COMMIT_ID: &str = "commit-item-completed";
const TURN_COMPLETED_COMMIT_ID: &str = "commit-turn-completed";

pub(crate) fn write(out_dir: &Path) -> Result<()> {
    fs::create_dir_all(out_dir)
        .with_context(|| format!("failed to create fixture directory {}", out_dir.display()))?;

    for name in STALE_FIXTURE_NAMES {
        let path = out_dir.join(name);
        if path.exists() {
            fs::remove_file(&path)
                .with_context(|| format!("failed to remove stale fixture {}", path.display()))?;
        }
    }

    let fixtures = generate_fixture_files()?;
    for name in GENERATED_FIXTURE_NAMES {
        let contents = fixtures
            .get(name)
            .with_context(|| format!("missing generated fixture {name}"))?;
        let path = out_dir.join(name);
        fs::write(&path, contents)
            .with_context(|| format!("failed to write fixture {}", path.display()))?;
    }

    Ok(())
}

pub(crate) fn generate_fixture_files() -> Result<BTreeMap<&'static str, String>> {
    let mut fixtures = BTreeMap::new();
    fixtures.insert(
        "attach-baseline.json",
        serialize_fixture(&attach_baseline()?)?,
    );
    fixtures.insert(
        "attach-replacement.json",
        serialize_fixture(&attach_replacement()?)?,
    );
    fixtures.insert(
        "event-item-completed.json",
        serialize_fixture(&event_item_completed())?,
    );
    fixtures.insert(
        "event-item-started.json",
        serialize_fixture(&event_item_started())?,
    );
    fixtures.insert(
        "event-subscription-replacement.json",
        serialize_fixture(&event_subscription_replacement())?,
    );
    fixtures.insert(
        "event-turn-completed.json",
        serialize_fixture(&event_turn_completed())?,
    );
    fixtures.insert(
        "event-turn-started.json",
        serialize_fixture(&event_turn_started())?,
    );
    Ok(fixtures)
}

fn attach_baseline() -> Result<ThreadProjectionAttachResponse> {
    Ok(ThreadProjectionAttachResponse {
        subscription_id: SUBSCRIPTION_ID.to_string(),
        snapshot: ThreadProjectionSnapshot {
            thread: thread(
                THREAD_ID,
                Some("Projection fixture".to_string()),
                vec![completed_turn(
                    "baseline-turn",
                    "baseline-plan",
                    "Projection state inspected",
                )],
            )?,
            head_commit_id: None,
        },
    })
}

fn attach_replacement() -> Result<ThreadProjectionAttachResponse> {
    Ok(ThreadProjectionAttachResponse {
        subscription_id: REPLACEMENT_SUBSCRIPTION_ID.to_string(),
        snapshot: ThreadProjectionSnapshot {
            thread: thread(
                THREAD_ID,
                Some("Replacement projection fixture".to_string()),
                vec![completed_turn(
                    "replacement-baseline-turn",
                    "replacement-plan",
                    "Replacement projection state inspected",
                )],
            )?,
            head_commit_id: Some(REPLACEMENT_HEAD_COMMIT_ID.to_string()),
        },
    })
}

fn thread(thread_id: &str, name: Option<String>, turns: Vec<Turn>) -> Result<Thread> {
    Ok(Thread {
        id: thread_id.to_string(),
        session_id: thread_id.to_string(),
        forked_from_id: None,
        preview: "Projection fixture thread".to_string(),
        ephemeral: false,
        model_provider: "openai".to_string(),
        created_at: 1_700_000_000,
        updated_at: 1_700_000_030,
        status: ThreadStatus::Idle,
        path: None,
        cwd: AbsolutePathBuf::from_absolute_path(FIXTURE_CWD)
            .context("fixture cwd must be absolute")?,
        cli_version: "projection-fixture".to_string(),
        source: SessionSource::AppServer,
        thread_source: None,
        agent_nickname: None,
        agent_role: None,
        git_info: None,
        name,
        turns,
    })
}

fn completed_turn(turn_id: &str, item_id: &str, item_text: &str) -> Turn {
    Turn {
        id: turn_id.to_string(),
        items: vec![plan_item(item_id, item_text)],
        items_view: TurnItemsView::Full,
        status: TurnStatus::Completed,
        error: None,
        started_at: Some(1_700_000_001),
        completed_at: Some(1_700_000_005),
        duration_ms: Some(4_000),
    }
}

fn in_progress_turn() -> Turn {
    Turn {
        id: IN_PROGRESS_TURN_ID.to_string(),
        items: Vec::new(),
        items_view: TurnItemsView::Full,
        status: TurnStatus::InProgress,
        error: None,
        started_at: Some(1_700_000_010),
        completed_at: None,
        duration_ms: None,
    }
}

fn completed_event_turn() -> Turn {
    Turn {
        id: IN_PROGRESS_TURN_ID.to_string(),
        items: vec![plan_item("event-plan", "Stream projection event updates")],
        items_view: TurnItemsView::Full,
        status: TurnStatus::Completed,
        error: None,
        started_at: Some(1_700_000_010),
        completed_at: Some(1_700_000_014),
        duration_ms: Some(4_000),
    }
}

fn replacement_turn() -> Turn {
    Turn {
        id: "replacement-turn".to_string(),
        items: Vec::new(),
        items_view: TurnItemsView::Full,
        status: TurnStatus::InProgress,
        error: None,
        started_at: Some(1_700_000_020),
        completed_at: None,
        duration_ms: None,
    }
}

fn plan_item(id: &str, text: &str) -> ThreadItem {
    ThreadItem::Plan {
        id: id.to_string(),
        text: text.to_string(),
    }
}

fn event_turn_started() -> ThreadProjectionEventNotification {
    projection_event(
        SUBSCRIPTION_ID,
        TURN_STARTED_COMMIT_ID,
        None,
        ThreadProjectionEvent::TurnStarted {
            notification: TurnStartedNotification {
                thread_id: THREAD_ID.to_string(),
                turn: in_progress_turn(),
            },
        },
    )
}

fn event_item_started() -> ThreadProjectionEventNotification {
    projection_event(
        SUBSCRIPTION_ID,
        ITEM_STARTED_COMMIT_ID,
        Some(TURN_STARTED_COMMIT_ID),
        ThreadProjectionEvent::ItemStarted {
            notification: ItemStartedNotification {
                item: plan_item("event-plan", "Stream projection event updates"),
                thread_id: THREAD_ID.to_string(),
                turn_id: IN_PROGRESS_TURN_ID.to_string(),
                started_at_ms: 1_700_000_011_000,
            },
        },
    )
}

fn event_item_completed() -> ThreadProjectionEventNotification {
    projection_event(
        SUBSCRIPTION_ID,
        ITEM_COMPLETED_COMMIT_ID,
        Some(ITEM_STARTED_COMMIT_ID),
        ThreadProjectionEvent::ItemCompleted {
            notification: ItemCompletedNotification {
                item: plan_item("event-plan", "Stream projection event updates"),
                thread_id: THREAD_ID.to_string(),
                turn_id: IN_PROGRESS_TURN_ID.to_string(),
                completed_at_ms: 1_700_000_013_000,
            },
        },
    )
}

fn event_turn_completed() -> ThreadProjectionEventNotification {
    projection_event(
        SUBSCRIPTION_ID,
        TURN_COMPLETED_COMMIT_ID,
        Some(ITEM_COMPLETED_COMMIT_ID),
        ThreadProjectionEvent::TurnCompleted {
            notification: TurnCompletedNotification {
                thread_id: THREAD_ID.to_string(),
                turn: completed_event_turn(),
            },
        },
    )
}

fn event_subscription_replacement() -> ThreadProjectionEventNotification {
    projection_event(
        REPLACEMENT_SUBSCRIPTION_ID,
        "commit-replacement-next",
        Some(REPLACEMENT_HEAD_COMMIT_ID),
        ThreadProjectionEvent::TurnStarted {
            notification: TurnStartedNotification {
                thread_id: THREAD_ID.to_string(),
                turn: replacement_turn(),
            },
        },
    )
}

fn projection_event(
    subscription_id: &str,
    commit_id: &str,
    parent_commit_id: Option<&str>,
    event: ThreadProjectionEvent,
) -> ThreadProjectionEventNotification {
    ThreadProjectionEventNotification {
        thread_id: THREAD_ID.to_string(),
        subscription_id: subscription_id.to_string(),
        commit_id: commit_id.to_string(),
        parent_commit_id: parent_commit_id.map(str::to_string),
        event,
    }
}

fn serialize_fixture<T: serde::Serialize>(value: &T) -> Result<String> {
    let mut json = serde_json::to_string_pretty(value)?;
    json.push('\n');
    Ok(json)
}

#[cfg(test)]
mod tests {
    use super::*;
    use pretty_assertions::assert_eq;
    use serde::de::DeserializeOwned;
    use serde_json::Value;

    #[test]
    fn generated_fixture_set_is_stable() -> Result<()> {
        let fixtures = generate_fixture_files()?;
        let fixture_names: Vec<&str> = fixtures.keys().copied().collect();

        assert_eq!(fixture_names, GENERATED_FIXTURE_NAMES);
        Ok(())
    }

    #[test]
    fn generated_fixture_set_excludes_stale_historical_files() -> Result<()> {
        let fixtures = generate_fixture_files()?;

        for stale_fixture_name in STALE_FIXTURE_NAMES {
            assert!(!fixtures.contains_key(stale_fixture_name));
        }
        Ok(())
    }

    #[test]
    fn generated_fixtures_match_committed_files() -> Result<()> {
        let fixtures = generate_fixture_files()?;
        let committed_dir = codex_utils_cargo_bin::find_resource!(
            "../../codex-gui/src/features/projection/__fixtures__/attach-baseline.json"
        )?
        .parent()
        .context("committed fixture path should have a parent directory")?
        .to_path_buf();

        for (name, generated_contents) in fixtures {
            let committed_path = committed_dir.join(name);
            let committed_contents = fs::read_to_string(&committed_path).with_context(|| {
                format!(
                    "failed to read committed fixture {}; re-run cargo run -p codex-app-server --bin write_gui_projection_fixtures and commit the fixture changes",
                    committed_path.display()
                )
            })?;

            assert_eq!(
                committed_contents, generated_contents,
                "committed fixture {name} is stale; re-run cargo run -p codex-app-server --bin write_gui_projection_fixtures and commit the fixture changes"
            );
        }

        Ok(())
    }

    #[test]
    fn generated_fixtures_match_current_projection_shape() -> Result<()> {
        let fixtures = generate_fixture_files()?;
        let attach: Value = deserialize_fixture(&fixtures["attach-baseline.json"])?;
        let event: Value = deserialize_fixture(&fixtures["event-turn-started.json"])?;

        assert!(attach.get("subscriptionId").is_some());
        assert!(attach.get("snapshot").is_some());
        assert!(attach["snapshot"].get("thread").is_some());
        assert!(attach["snapshot"].get("headCommitId").is_some());
        assert_eq!(attach["snapshot"]["thread"]["status"]["type"], "idle");
        assert_eq!(
            event,
            serde_json::json!({
                "threadId": THREAD_ID,
                "subscriptionId": SUBSCRIPTION_ID,
                "commitId": TURN_STARTED_COMMIT_ID,
                "parentCommitId": null,
                "event": {
                    "type": "turnStarted",
                    "notification": {
                        "threadId": THREAD_ID,
                        "turn": {
                            "id": IN_PROGRESS_TURN_ID,
                            "items": [],
                            "itemsView": "full",
                            "status": "inProgress",
                            "error": null,
                            "startedAt": 1_700_000_010,
                            "completedAt": null,
                            "durationMs": null
                        }
                    }
                }
            })
        );

        for fixture in fixtures.values() {
            let value: Value = deserialize_fixture(fixture)?;
            for stale_field in [
                "projectionInstanceId",
                "latestSequence",
                "sequence",
                "eventId",
                "payload",
            ] {
                assert_absent_recursive(&value, stale_field);
            }
        }
        Ok(())
    }

    #[test]
    fn generated_fixtures_round_trip_through_current_protocol_types() -> Result<()> {
        let fixtures = generate_fixture_files()?;

        for attach_fixture_name in ["attach-baseline.json", "attach-replacement.json"] {
            assert_fixture_round_trips::<ThreadProjectionAttachResponse>(
                &fixtures[attach_fixture_name],
            )?;
        }

        for event_fixture_name in [
            "event-item-completed.json",
            "event-item-started.json",
            "event-subscription-replacement.json",
            "event-turn-completed.json",
            "event-turn-started.json",
        ] {
            assert_fixture_round_trips::<ThreadProjectionEventNotification>(
                &fixtures[event_fixture_name],
            )?;
        }
        Ok(())
    }

    #[test]
    fn generated_event_commit_chain_is_stable() -> Result<()> {
        let fixtures = generate_fixture_files()?;
        let turn_started: ThreadProjectionEventNotification =
            deserialize_fixture(&fixtures["event-turn-started.json"])?;
        let item_started: ThreadProjectionEventNotification =
            deserialize_fixture(&fixtures["event-item-started.json"])?;
        let item_completed: ThreadProjectionEventNotification =
            deserialize_fixture(&fixtures["event-item-completed.json"])?;
        let turn_completed: ThreadProjectionEventNotification =
            deserialize_fixture(&fixtures["event-turn-completed.json"])?;
        let replacement: ThreadProjectionEventNotification =
            deserialize_fixture(&fixtures["event-subscription-replacement.json"])?;

        assert_eq!(
            vec![
                (
                    turn_started.commit_id.as_str(),
                    turn_started.parent_commit_id.as_deref(),
                    turn_started.subscription_id.as_str(),
                ),
                (
                    item_started.commit_id.as_str(),
                    item_started.parent_commit_id.as_deref(),
                    item_started.subscription_id.as_str(),
                ),
                (
                    item_completed.commit_id.as_str(),
                    item_completed.parent_commit_id.as_deref(),
                    item_completed.subscription_id.as_str(),
                ),
                (
                    turn_completed.commit_id.as_str(),
                    turn_completed.parent_commit_id.as_deref(),
                    turn_completed.subscription_id.as_str(),
                ),
                (
                    replacement.commit_id.as_str(),
                    replacement.parent_commit_id.as_deref(),
                    replacement.subscription_id.as_str(),
                ),
            ],
            vec![
                (TURN_STARTED_COMMIT_ID, None, SUBSCRIPTION_ID),
                (
                    ITEM_STARTED_COMMIT_ID,
                    Some(TURN_STARTED_COMMIT_ID),
                    SUBSCRIPTION_ID,
                ),
                (
                    ITEM_COMPLETED_COMMIT_ID,
                    Some(ITEM_STARTED_COMMIT_ID),
                    SUBSCRIPTION_ID,
                ),
                (
                    TURN_COMPLETED_COMMIT_ID,
                    Some(ITEM_COMPLETED_COMMIT_ID),
                    SUBSCRIPTION_ID,
                ),
                (
                    "commit-replacement-next",
                    Some(REPLACEMENT_HEAD_COMMIT_ID),
                    REPLACEMENT_SUBSCRIPTION_ID,
                ),
            ]
        );
        Ok(())
    }

    #[test]
    fn write_preserves_unrelated_files_removes_stale_files_and_replaces_generated_files()
    -> Result<()> {
        let temp_dir = tempfile::tempdir()?;
        let out_dir = temp_dir.path();
        let keep_path = out_dir.join("keep.txt");

        fs::write(&keep_path, "keep me")?;
        for stale_fixture_name in STALE_FIXTURE_NAMES {
            fs::write(out_dir.join(stale_fixture_name), "stale")?;
        }
        for generated_fixture_name in GENERATED_FIXTURE_NAMES {
            fs::write(out_dir.join(generated_fixture_name), "old generated")?;
        }

        write(out_dir)?;

        assert_eq!(fs::read_to_string(&keep_path)?, "keep me");
        for stale_fixture_name in STALE_FIXTURE_NAMES {
            assert!(!out_dir.join(stale_fixture_name).exists());
        }
        for (generated_fixture_name, expected_contents) in generate_fixture_files()? {
            assert_eq!(
                fs::read_to_string(out_dir.join(generated_fixture_name))?,
                expected_contents
            );
        }
        Ok(())
    }

    fn assert_fixture_round_trips<T>(contents: &str) -> Result<()>
    where
        T: serde::Serialize + DeserializeOwned,
    {
        let value: T = deserialize_fixture(contents)?;

        assert_eq!(serialize_fixture(&value)?, contents);
        Ok(())
    }

    fn deserialize_fixture<T: DeserializeOwned>(contents: &str) -> Result<T> {
        Ok(serde_json::from_str(contents)?)
    }

    fn assert_absent_recursive(value: &Value, field_name: &str) {
        match value {
            Value::Null | Value::Bool(_) | Value::Number(_) | Value::String(_) => {}
            Value::Array(values) => {
                for value in values {
                    assert_absent_recursive(value, field_name);
                }
            }
            Value::Object(fields) => {
                assert!(!fields.contains_key(field_name));
                for value in fields.values() {
                    assert_absent_recursive(value, field_name);
                }
            }
        }
    }
}
