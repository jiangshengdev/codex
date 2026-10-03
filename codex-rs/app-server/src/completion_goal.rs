use codex_app_server_protocol::ThreadGoalStatusSnapshot;
use codex_core::CodexThread;
use codex_features::Feature;
use codex_protocol::ThreadId;

pub(crate) async fn read_completion_goal(
    thread: &CodexThread,
    thread_id: ThreadId,
) -> ThreadGoalStatusSnapshot {
    let config = thread.config().await;
    if !config.features.enabled(Feature::Goals) || config.ephemeral {
        return ThreadGoalStatusSnapshot::Known { status: None };
    }
    read_goal_status(thread.state_db().as_deref(), thread_id).await
}

async fn read_goal_status(
    state_db: Option<&codex_state::StateRuntime>,
    thread_id: ThreadId,
) -> ThreadGoalStatusSnapshot {
    let Some(state_db) = state_db else {
        tracing::warn!(%thread_id, "goal state unavailable while publishing completed turn");
        return ThreadGoalStatusSnapshot::Unavailable;
    };
    match state_db.thread_goals().get_thread_goal(thread_id).await {
        Ok(goal) => ThreadGoalStatusSnapshot::Known {
            status: goal
                .map(|goal| crate::request_processors::api_thread_goal_from_state(goal).status),
        },
        Err(error) => {
            tracing::warn!(%thread_id, %error, "failed to read goal while publishing completed turn");
            ThreadGoalStatusSnapshot::Unavailable
        }
    }
}

#[cfg(test)]
#[path = "completion_goal_read_tests.rs"]
mod tests;
