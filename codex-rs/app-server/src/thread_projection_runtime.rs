use crate::error_code::invalid_request;
use crate::outgoing_message::ConnectionId;
use crate::outgoing_message::ConnectionRequestId;
use crate::outgoing_message::OutgoingMessageSender;
use crate::thread_state::ThreadStateManager;
use codex_app_server_protocol::JSONRPCErrorError;
use codex_app_server_protocol::Thread;
use codex_app_server_protocol::ThreadProjectionAttachResponse;
use codex_app_server_protocol::ThreadProjectionSnapshot;
use codex_protocol::ThreadId;
use std::collections::HashSet;
use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;
use std::time::Instant;
use tokio::sync::Mutex;
use tokio::sync::watch;

pub(crate) type ThreadProjectionSnapshotFuture =
    Pin<Box<dyn Future<Output = Result<Thread, JSONRPCErrorError>> + Send>>;

pub(crate) struct ProjectionSubscriberWatch {
    has_subscribers_rx: watch::Receiver<bool>,
    has_subscribers: (bool, Instant),
}

impl ProjectionSubscriberWatch {
    pub(crate) fn new(has_subscribers_rx: watch::Receiver<bool>) -> Self {
        let has_subscribers = (*has_subscribers_rx.borrow(), Instant::now());
        Self {
            has_subscribers,
            has_subscribers_rx,
        }
    }

    fn has_subscribers(&self) -> bool {
        self.has_subscribers.0
    }

    pub(crate) fn no_subscribers_since(&self) -> Option<Instant> {
        (!self.has_subscribers()).then_some(self.has_subscribers.1)
    }

    pub(crate) fn sync(&mut self) {
        let has_subscribers = *self.has_subscribers_rx.borrow();
        if self.has_subscribers.0 != has_subscribers {
            self.has_subscribers = (has_subscribers, Instant::now());
        }
    }

    pub(crate) async fn changed(&mut self) -> Result<(), watch::error::RecvError> {
        self.has_subscribers_rx.changed().await?;
        self.sync();
        Ok(())
    }
}

pub(crate) async fn handle_projection_attach_response(
    conversation_id: ThreadId,
    pending_thread_unloads: &Arc<Mutex<HashSet<ThreadId>>>,
    outgoing: &Arc<OutgoingMessageSender>,
    thread_state_manager: &ThreadStateManager,
    request_id: ConnectionRequestId,
    connection_id: ConnectionId,
    snapshot: ThreadProjectionSnapshotFuture,
) {
    if reject_projection_attach_for_closing_thread(
        pending_thread_unloads,
        outgoing,
        request_id.clone(),
        conversation_id,
    )
    .await
    {
        return;
    }

    let thread = match snapshot.await {
        Ok(thread) => thread,
        Err(error) => {
            outgoing.send_error(request_id, error).await;
            return;
        }
    };

    if skip_projection_attach_after_connection_closed(
        thread_state_manager,
        conversation_id,
        connection_id,
    )
    .await
    {
        // Connection is already closed; outgoing will drop any response, so we
        // skip sending. Unlike the closing-thread path, there is no live client
        // to receive an error.
        return;
    }

    if reject_projection_attach_for_closing_thread(
        pending_thread_unloads,
        outgoing,
        request_id.clone(),
        conversation_id,
    )
    .await
    {
        return;
    }

    let attach_result = outgoing
        .thread_projection_manager()
        .attach(conversation_id, connection_id)
        .await;
    if remove_projection_attach_after_connection_closed(
        outgoing,
        thread_state_manager,
        conversation_id,
        connection_id,
    )
    .await
    {
        return;
    }
    outgoing
        .send_response(
            request_id,
            ThreadProjectionAttachResponse {
                subscription_id: attach_result.subscription_id,
                snapshot: ThreadProjectionSnapshot {
                    thread,
                    head_commit_id: attach_result.head_commit_id,
                },
            },
        )
        .await;
}

async fn reject_projection_attach_for_closing_thread(
    pending_thread_unloads: &Arc<Mutex<HashSet<ThreadId>>>,
    outgoing: &Arc<OutgoingMessageSender>,
    request_id: ConnectionRequestId,
    conversation_id: ThreadId,
) -> bool {
    if pending_thread_unloads
        .lock()
        .await
        .contains(&conversation_id)
    {
        send_projection_attach_closing_error(outgoing, request_id, conversation_id).await;
        true
    } else {
        false
    }
}

async fn send_projection_attach_closing_error(
    outgoing: &Arc<OutgoingMessageSender>,
    request_id: ConnectionRequestId,
    conversation_id: ThreadId,
) {
    outgoing
        .send_error(
            request_id,
            invalid_request(format!(
                "thread {conversation_id} is closing; retry thread/projection/attach after the thread is closed"
            )),
        )
        .await;
}

async fn skip_projection_attach_after_connection_closed(
    thread_state_manager: &ThreadStateManager,
    conversation_id: ThreadId,
    connection_id: ConnectionId,
) -> bool {
    if thread_state_manager.is_live_connection(connection_id).await {
        return false;
    }

    tracing::debug!(
        thread_id = %conversation_id,
        connection_id = ?connection_id,
        "skipping thread projection attach after connection closed"
    );
    true
}

async fn remove_projection_attach_after_connection_closed(
    outgoing: &Arc<OutgoingMessageSender>,
    thread_state_manager: &ThreadStateManager,
    conversation_id: ThreadId,
    connection_id: ConnectionId,
) -> bool {
    if thread_state_manager.is_live_connection(connection_id).await {
        return false;
    }

    let _ = outgoing
        .thread_projection_manager()
        .detach(conversation_id, connection_id)
        .await;
    tracing::debug!(
        thread_id = %conversation_id,
        connection_id = ?connection_id,
        "removed thread projection attach after connection closed"
    );
    true
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::outgoing_message::OutgoingMessageSender;
    use codex_app_server_protocol::RequestId;
    use codex_app_server_protocol::ServerNotification;
    use codex_app_server_protocol::SessionSource;
    use codex_app_server_protocol::ThreadStatus;
    use codex_app_server_protocol::Turn;
    use codex_app_server_protocol::TurnStartedNotification;
    use codex_app_server_protocol::TurnStatus;
    use codex_protocol::ThreadId;
    use codex_utils_absolute_path::test_support::test_path_buf;
    use core_test_support::PathBufExt;
    use pretty_assertions::assert_eq;
    use tokio::sync::oneshot;
    use tokio::time::Duration;
    use tokio::time::timeout;

    fn test_thread(thread_id: ThreadId) -> Thread {
        Thread {
            id: thread_id.to_string(),
            session_id: thread_id.to_string(),
            forked_from_id: None,
            preview: String::new(),
            ephemeral: false,
            model_provider: "mock-provider".to_string(),
            created_at: 0,
            updated_at: 0,
            status: ThreadStatus::Idle,
            path: None,
            cwd: test_path_buf("/tmp").abs(),
            cli_version: "test".to_string(),
            source: SessionSource::AppServer,
            thread_source: None,
            agent_nickname: None,
            agent_role: None,
            git_info: None,
            name: None,
            turns: Vec::new(),
        }
    }

    fn turn_started_notification(thread_id: ThreadId) -> ServerNotification {
        ServerNotification::TurnStarted(TurnStartedNotification {
            thread_id: thread_id.to_string(),
            turn: Turn {
                id: "turn-1".to_string(),
                items: Vec::new(),
                items_view: codex_app_server_protocol::TurnItemsView::Full,
                status: TurnStatus::InProgress,
                error: None,
                started_at: Some(1),
                completed_at: None,
                duration_ms: None,
            },
        })
    }

    #[tokio::test]
    async fn attach_response_after_connection_close_does_not_subscribe() -> anyhow::Result<()> {
        let thread_id = ThreadId::new();
        let connection_id = ConnectionId(1);
        let request_id = ConnectionRequestId {
            connection_id,
            request_id: RequestId::Integer(1),
        };
        let pending_thread_unloads = Arc::new(Mutex::new(HashSet::new()));
        let thread_state_manager = ThreadStateManager::new();
        thread_state_manager
            .connection_initialized(connection_id)
            .await;
        let outgoing = Arc::new(OutgoingMessageSender::new(
            tokio::sync::mpsc::channel(1).0,
            codex_analytics::AnalyticsEventsClient::disabled(),
        ));
        let (snapshot_tx, snapshot_rx) = oneshot::channel();
        let snapshot = Box::pin(async move {
            snapshot_rx
                .await
                .expect("snapshot sender should resolve the future")
        });

        let task = tokio::spawn({
            let pending_thread_unloads = pending_thread_unloads.clone();
            let outgoing = outgoing.clone();
            let thread_state_manager = thread_state_manager.clone();
            async move {
                handle_projection_attach_response(
                    thread_id,
                    &pending_thread_unloads,
                    &outgoing,
                    &thread_state_manager,
                    request_id,
                    connection_id,
                    snapshot,
                )
                .await;
            }
        });
        thread_state_manager.remove_connection(connection_id).await;
        snapshot_tx
            .send(Ok(test_thread(thread_id)))
            .expect("snapshot receiver should be waiting");
        timeout(Duration::from_secs(1), task)
            .await
            .expect("attach task should finish")
            .expect("attach task should not panic");

        let deliveries = outgoing
            .thread_projection_manager()
            .project_notification(thread_id, &turn_started_notification(thread_id))
            .await;
        assert_eq!(deliveries, Vec::new());
        Ok(())
    }

    #[tokio::test]
    async fn connection_close_interleaving_does_not_leave_projection_subscription()
    -> anyhow::Result<()> {
        let thread_id = ThreadId::new();
        let connection_id = ConnectionId(1);
        let request_id = ConnectionRequestId {
            connection_id,
            request_id: RequestId::Integer(1),
        };
        let pending_thread_unloads = Arc::new(Mutex::new(HashSet::new()));
        let thread_state_manager = ThreadStateManager::new();
        thread_state_manager
            .connection_initialized(connection_id)
            .await;
        let outgoing = Arc::new(OutgoingMessageSender::new(
            tokio::sync::mpsc::channel(1).0,
            codex_analytics::AnalyticsEventsClient::disabled(),
        ));
        let (snapshot_tx, snapshot_rx) = oneshot::channel();
        let snapshot = Box::pin(async move {
            snapshot_rx
                .await
                .expect("snapshot sender should resolve the future")
        });

        let attach_task = tokio::spawn({
            let pending_thread_unloads = pending_thread_unloads.clone();
            let outgoing = outgoing.clone();
            let thread_state_manager = thread_state_manager.clone();
            async move {
                handle_projection_attach_response(
                    thread_id,
                    &pending_thread_unloads,
                    &outgoing,
                    &thread_state_manager,
                    request_id,
                    connection_id,
                    snapshot,
                )
                .await;
            }
        });

        // Production close handling must mark the connection closed before the
        // final projection cleanup so a listener-queued attach observes the
        // closed connection and does not register a subscriber.
        thread_state_manager.remove_connection(connection_id).await;

        snapshot_tx
            .send(Ok(test_thread(thread_id)))
            .expect("snapshot receiver should be waiting");
        timeout(Duration::from_secs(1), attach_task)
            .await
            .expect("attach task should finish")
            .expect("attach task should not panic");

        let projection_cleanup = outgoing
            .thread_projection_manager()
            .remove_connection(connection_id)
            .await;
        assert_eq!(projection_cleanup, Vec::new());

        let deliveries = outgoing
            .thread_projection_manager()
            .project_notification(thread_id, &turn_started_notification(thread_id))
            .await;
        assert_eq!(deliveries, Vec::new());
        Ok(())
    }

    #[tokio::test]
    async fn late_connection_close_cleanup_removes_projection_attach_race() -> anyhow::Result<()> {
        let thread_id = ThreadId::new();
        let connection_id = ConnectionId(1);
        let request_id = ConnectionRequestId {
            connection_id,
            request_id: RequestId::Integer(1),
        };
        let pending_thread_unloads = Arc::new(Mutex::new(HashSet::new()));
        let thread_state_manager = ThreadStateManager::new();
        thread_state_manager
            .connection_initialized(connection_id)
            .await;
        let outgoing = Arc::new(OutgoingMessageSender::new(
            tokio::sync::mpsc::channel(1).0,
            codex_analytics::AnalyticsEventsClient::disabled(),
        ));

        let initial_cleanup = outgoing
            .thread_projection_manager()
            .remove_connection(connection_id)
            .await;
        assert_eq!(initial_cleanup, Vec::new());

        let snapshot = Box::pin(async move { Ok(test_thread(thread_id)) });
        handle_projection_attach_response(
            thread_id,
            &pending_thread_unloads,
            &outgoing,
            &thread_state_manager,
            request_id,
            connection_id,
            snapshot,
        )
        .await;

        let deliveries_before_late_cleanup = outgoing
            .thread_projection_manager()
            .project_notification(thread_id, &turn_started_notification(thread_id))
            .await;
        assert_eq!(deliveries_before_late_cleanup.len(), 1);

        thread_state_manager.remove_connection(connection_id).await;
        let late_cleanup = outgoing
            .thread_projection_manager()
            .remove_connection(connection_id)
            .await;
        assert_eq!(late_cleanup, vec![thread_id]);

        let deliveries_after_late_cleanup = outgoing
            .thread_projection_manager()
            .project_notification(thread_id, &turn_started_notification(thread_id))
            .await;
        assert_eq!(deliveries_after_late_cleanup, Vec::new());
        Ok(())
    }
}
