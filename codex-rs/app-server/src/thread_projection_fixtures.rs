#![cfg(unix)]

use std::collections::BTreeMap;
use std::path::Path;

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
use serde::Serialize;

const THREAD_ID: &str = "00000000-0000-0000-0000-000000000001";
const SUBSCRIPTION_ID: &str = "projection-fixture-subscription";
const REPLACEMENT_SUBSCRIPTION_ID: &str = "projection-fixture-replacement-subscription";
const REPLACEMENT_HEAD_COMMIT_ID: &str = "commit-replacement-head";
const FIXTURE_CWD: &str = "/tmp/codex-gui-projection-fixtures";

const GENERATED_FIXTURE_NAMES: &[&str] = &[
    "attach-baseline.json",
    "attach-replacement.json",
    "event-item-completed.json",
    "event-item-started.json",
    "event-subscription-replacement.json",
    "event-turn-completed.json",
    "event-turn-started.json",
];

const STALE_FIXTURE_NAMES: &[&str] = &[
    "event-large-sequence.json",
    "event-projection-reset.json",
    "event-thread-metadata-updated-null.json",
];

pub(crate) fn write(out_dir: &Path) -> Result<()> {
    let fixtures = generate_fixture_files()?;
    std::fs::create_dir_all(out_dir)
        .with_context(|| format!("failed to create {}", out_dir.display()))?;

    for stale_name in STALE_FIXTURE_NAMES {
        let path = out_dir.join(stale_name);
        if path.exists() {
            std::fs::remove_file(&path)
                .with_context(|| format!("failed to remove stale fixture {}", path.display()))?;
        }
    }

    for (name, contents) in fixtures {
        let path = out_dir.join(name);
        std::fs::write(&path, contents)
            .with_context(|| format!("failed to write {}", path.display()))?;
    }

    Ok(())
}

pub(crate) fn generate_fixture_files() -> Result<BTreeMap<&'static str, String>> {
    let mut files = BTreeMap::new();
    files.insert(
        "attach-baseline.json",
        serialize_fixture(&attach_baseline()?)?,
    );
    files.insert(
        "attach-replacement.json",
        serialize_fixture(&attach_replacement()?)?,
    );
    files.insert(
        "event-turn-started.json",
        serialize_fixture(&event_turn_started()?)?,
    );
    files.insert(
        "event-item-started.json",
        serialize_fixture(&event_item_started()?)?,
    );
    files.insert(
        "event-item-completed.json",
        serialize_fixture(&event_item_completed()?)?,
    );
    files.insert(
        "event-turn-completed.json",
        serialize_fixture(&event_turn_completed()?)?,
    );
    files.insert(
        "event-subscription-replacement.json",
        serialize_fixture(&event_subscription_replacement()?)?,
    );

    debug_assert_eq!(
        files.keys().copied().collect::<Vec<_>>(),
        GENERATED_FIXTURE_NAMES
    );

    Ok(files)
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
        parent_thread_id: None,
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

fn in_progress_turn(turn_id: &str) -> Turn {
    Turn {
        id: turn_id.to_string(),
        items: Vec::new(),
        items_view: TurnItemsView::Full,
        status: TurnStatus::InProgress,
        error: None,
        started_at: Some(1_700_000_010),
        completed_at: None,
        duration_ms: None,
    }
}

fn completed_event_turn(turn_id: &str) -> Turn {
    Turn {
        id: turn_id.to_string(),
        items: vec![plan_item("plan-item", "Implementation plan ready")],
        items_view: TurnItemsView::Full,
        status: TurnStatus::Completed,
        error: None,
        started_at: Some(1_700_000_010),
        completed_at: Some(1_700_000_016),
        duration_ms: Some(6_000),
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

fn plan_item(item_id: &str, text: &str) -> ThreadItem {
    ThreadItem::Plan {
        id: item_id.to_string(),
        text: text.to_string(),
    }
}

fn event_turn_started() -> Result<ThreadProjectionEventNotification> {
    projection_event(
        SUBSCRIPTION_ID,
        "commit-turn-started",
        None,
        ThreadProjectionEvent::TurnStarted {
            notification: TurnStartedNotification {
                thread_id: THREAD_ID.to_string(),
                turn: in_progress_turn("turn-in-progress"),
            },
        },
    )
}

fn event_item_started() -> Result<ThreadProjectionEventNotification> {
    projection_event(
        SUBSCRIPTION_ID,
        "commit-item-started",
        Some("commit-turn-started"),
        ThreadProjectionEvent::ItemStarted {
            notification: ItemStartedNotification {
                item: plan_item("plan-item", "Draft implementation plan"),
                thread_id: THREAD_ID.to_string(),
                turn_id: "turn-in-progress".to_string(),
                started_at_ms: 1_700_000_011_000,
            },
        },
    )
}

fn event_item_completed() -> Result<ThreadProjectionEventNotification> {
    projection_event(
        SUBSCRIPTION_ID,
        "commit-item-completed",
        Some("commit-item-started"),
        ThreadProjectionEvent::ItemCompleted {
            notification: ItemCompletedNotification {
                item: plan_item("plan-item", "Implementation plan ready"),
                thread_id: THREAD_ID.to_string(),
                turn_id: "turn-in-progress".to_string(),
                completed_at_ms: 1_700_000_015_000,
            },
        },
    )
}

fn event_turn_completed() -> Result<ThreadProjectionEventNotification> {
    projection_event(
        SUBSCRIPTION_ID,
        "commit-turn-completed",
        Some("commit-item-completed"),
        ThreadProjectionEvent::TurnCompleted {
            notification: TurnCompletedNotification {
                thread_id: THREAD_ID.to_string(),
                turn: completed_event_turn("turn-in-progress"),
            },
        },
    )
}

fn event_subscription_replacement() -> Result<ThreadProjectionEventNotification> {
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
) -> Result<ThreadProjectionEventNotification> {
    Ok(ThreadProjectionEventNotification {
        thread_id: THREAD_ID.to_string(),
        subscription_id: subscription_id.to_string(),
        commit_id: commit_id.to_string(),
        parent_commit_id: parent_commit_id.map(str::to_string),
        event,
    })
}

fn serialize_fixture<T: Serialize>(value: &T) -> Result<String> {
    let json = serde_json::to_string_pretty(value)?;
    Ok(format!("{json}\n"))
}

#[cfg(test)]
#[path = "thread_projection_fixtures_tests.rs"]
mod tests;
