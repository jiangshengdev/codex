use super::*;
use codex_app_server_protocol::ThreadGoalStatus;
use codex_utils_absolute_path::test_support::PathExt;
use pretty_assertions::assert_eq;

#[tokio::test]
async fn completion_goal_reads_current_authoritative_status_and_distinguishes_unavailable() {
    let directory = tempfile::tempdir().unwrap();
    let state = codex_state::StateRuntime::init(
        codex_state::SqliteConfig::new_for_testing(directory.path().abs()),
        "test-provider".into(),
    )
    .await
    .unwrap();
    let thread_id = ThreadId::new();
    let metadata = codex_state::ThreadMetadataBuilder::new(
        thread_id,
        directory.path().join("rollout.jsonl"),
        chrono::Utc::now(),
        codex_protocol::protocol::SessionSource::default(),
    )
    .build("test-provider");
    state.upsert_thread(&metadata).await.unwrap();
    assert_eq!(
        read_goal_status(Some(&state), thread_id).await,
        ThreadGoalStatusSnapshot::Known { status: None }
    );
    for (persisted, expected) in [
        (
            codex_state::ThreadGoalStatus::Active,
            ThreadGoalStatus::Active,
        ),
        (
            codex_state::ThreadGoalStatus::Blocked,
            ThreadGoalStatus::Blocked,
        ),
        (
            codex_state::ThreadGoalStatus::Complete,
            ThreadGoalStatus::Complete,
        ),
        (
            codex_state::ThreadGoalStatus::Paused,
            ThreadGoalStatus::Paused,
        ),
        (
            codex_state::ThreadGoalStatus::UsageLimited,
            ThreadGoalStatus::UsageLimited,
        ),
        (
            codex_state::ThreadGoalStatus::BudgetLimited,
            ThreadGoalStatus::BudgetLimited,
        ),
    ] {
        state
            .thread_goals()
            .replace_thread_goal(
                thread_id,
                "finish task",
                persisted,
                /*token_budget*/ None,
            )
            .await
            .unwrap();
        assert_eq!(
            read_goal_status(Some(&state), thread_id).await,
            ThreadGoalStatusSnapshot::Known {
                status: Some(expected)
            }
        );
    }
    state
        .thread_goals()
        .delete_thread_goal(thread_id)
        .await
        .unwrap();
    assert_eq!(
        read_goal_status(Some(&state), thread_id).await,
        ThreadGoalStatusSnapshot::Known { status: None }
    );
    assert_eq!(
        read_goal_status(None, thread_id).await,
        ThreadGoalStatusSnapshot::Unavailable
    );
    state.close().await;
    assert_eq!(
        read_goal_status(Some(&state), thread_id).await,
        ThreadGoalStatusSnapshot::Unavailable
    );
}
