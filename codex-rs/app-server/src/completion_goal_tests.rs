use super::*;
use codex_app_server_protocol::ThreadGoalStatus;
use codex_app_server_protocol::ThreadGoalStatusSnapshot;
use codex_app_server_protocol::ThreadProjectionEvent;
use codex_app_server_protocol::Turn;
use codex_app_server_protocol::TurnCompletedNotification;
use codex_app_server_protocol::TurnItemsView;
use codex_app_server_protocol::TurnStatus;
use pretty_assertions::assert_eq;

#[tokio::test]
async fn completed_turn_projection_carries_goal_without_changing_ordinary_notification() {
    for goal in [
        ThreadGoalStatusSnapshot::Known { status: None },
        ThreadGoalStatusSnapshot::Known {
            status: Some(ThreadGoalStatus::Active),
        },
        ThreadGoalStatusSnapshot::Known {
            status: Some(ThreadGoalStatus::Complete),
        },
        ThreadGoalStatusSnapshot::Known {
            status: Some(ThreadGoalStatus::Blocked),
        },
        ThreadGoalStatusSnapshot::Unavailable,
    ] {
        let (tx, mut rx) = mpsc::channel(4);
        let outgoing = Arc::new(OutgoingMessageSender::new(
            tx,
            AnalyticsEventsClient::disabled(),
        ));
        let thread_id = ThreadId::new();
        outgoing
            .thread_projection_manager()
            .attach(thread_id, ConnectionId(2))
            .await;
        let sender =
            ThreadScopedOutgoingMessageSender::new(outgoing, vec![ConnectionId(1)], thread_id)
                .with_completion_goal(goal.clone());
        let notification = TurnCompletedNotification {
            thread_id: thread_id.to_string(),
            turn: Turn {
                id: "turn".into(),
                items: Vec::new(),
                items_view: TurnItemsView::NotLoaded,
                status: TurnStatus::Completed,
                error: None,
                started_at: Some(1),
                completed_at: Some(2),
                duration_ms: Some(1000),
            },
        };
        sender
            .send_server_notification(ServerNotification::TurnCompleted(notification.clone()))
            .await;
        let ordinary = tokio::time::timeout(std::time::Duration::from_secs(1), rx.recv())
            .await
            .unwrap()
            .unwrap();
        let OutgoingEnvelope::ToConnection {
            connection_id,
            message: OutgoingMessage::AppServerNotification(envelope),
            ..
        } = ordinary
        else {
            panic!("expected ordinary notification")
        };
        assert_eq!(connection_id, ConnectionId(1));
        let ServerNotification::TurnCompleted(ordinary) = envelope.notification else {
            panic!("expected ordinary completed turn");
        };
        assert_eq!(ordinary, notification);

        let projection = tokio::time::timeout(std::time::Duration::from_secs(1), rx.recv())
            .await
            .unwrap()
            .unwrap();
        let OutgoingEnvelope::ToConnection {
            connection_id,
            message: OutgoingMessage::AppServerNotification(envelope),
            ..
        } = projection
        else {
            panic!("expected projection notification")
        };
        assert_eq!(connection_id, ConnectionId(2));
        let ServerNotification::ThreadProjectionEvent(event) = envelope.notification else {
            panic!("expected projection event")
        };
        assert_eq!(
            event.event,
            ThreadProjectionEvent::TurnCompleted { notification, goal }
        );
    }
}
