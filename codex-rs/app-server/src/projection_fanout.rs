use std::collections::HashMap;
use std::sync::Arc;

use codex_app_server_protocol::ServerNotification;
use codex_app_server_protocol::ThreadProjectionClosedNotification;
use codex_app_server_protocol::ThreadProjectionClosedReason;
use codex_protocol::ThreadId;
use tokio::sync::Mutex;
use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;
use tracing::warn;

use crate::outgoing_message::OutgoingEnvelope;
use crate::outgoing_message::OutgoingMessage;
use crate::thread_projection::InvalidatedProjectionSubscriber;
use crate::thread_projection::ProjectionDelivery;
use crate::thread_projection::ProjectionDeliveryPayload;
use crate::thread_projection::ThreadProjectionManager;

pub(crate) const PROJECTION_FANOUT_QUEUE_CAPACITY: usize = 32;

#[derive(Clone)]
pub(crate) struct ThreadProjectionFacade {
    manager: ThreadProjectionManager,
    fanout: ProjectionFanoutManager,
}

impl ThreadProjectionFacade {
    pub(crate) fn new() -> Self {
        let manager = ThreadProjectionManager::new();
        Self {
            manager: manager.clone(),
            fanout: ProjectionFanoutManager::new(manager),
        }
    }

    pub(crate) fn manager(&self) -> ThreadProjectionManager {
        self.manager.clone()
    }

    pub(crate) async fn enqueue_notification(
        &self,
        sender: mpsc::Sender<OutgoingEnvelope>,
        thread_id: ThreadId,
        notification: &ServerNotification,
    ) {
        let deliveries = self
            .manager
            .project_notification(thread_id, notification)
            .await;

        if deliveries.is_empty() {
            return;
        }

        self.fanout.enqueue(sender, thread_id, deliveries).await;
    }

    pub(crate) async fn remove_thread(&self, thread_id: ThreadId) {
        self.fanout.cancel_thread(thread_id).await;
        self.manager.remove_thread(thread_id).await;
    }
}

#[derive(Clone)]
struct ProjectionFanoutManager {
    inner: Arc<Mutex<ProjectionFanoutManagerInner>>,
    manager: ThreadProjectionManager,
}

struct ProjectionFanoutManagerInner {
    threads: HashMap<ThreadId, ThreadFanoutHandle>,
    next_worker_id: u64,
    capacity: usize,
}

impl Default for ProjectionFanoutManagerInner {
    fn default() -> Self {
        Self {
            threads: HashMap::new(),
            next_worker_id: 0,
            capacity: PROJECTION_FANOUT_QUEUE_CAPACITY,
        }
    }
}

struct ThreadFanoutHandle {
    tx: mpsc::Sender<ProjectionFanoutJob>,
    cancellation: CancellationToken,
    worker_id: u64,
}

struct ProjectionFanoutJob {
    sender: mpsc::Sender<OutgoingEnvelope>,
    deliveries: Vec<ProjectionDelivery>,
}

impl ProjectionFanoutManager {
    fn new(manager: ThreadProjectionManager) -> Self {
        Self {
            inner: Arc::new(Mutex::new(ProjectionFanoutManagerInner::default())),
            manager,
        }
    }

    #[cfg(test)]
    fn new_with_capacity(manager: ThreadProjectionManager, capacity: usize) -> Self {
        Self {
            inner: Arc::new(Mutex::new(ProjectionFanoutManagerInner {
                capacity,
                ..ProjectionFanoutManagerInner::default()
            })),
            manager,
        }
    }

    async fn enqueue(
        &self,
        sender: mpsc::Sender<OutgoingEnvelope>,
        thread_id: ThreadId,
        deliveries: Vec<ProjectionDelivery>,
    ) {
        let handle = self.thread_handle(thread_id).await;
        match handle
            .tx
            .try_send(ProjectionFanoutJob { sender, deliveries })
        {
            Ok(()) => {}
            Err(mpsc::error::TrySendError::Full(job)) => {
                warn!(
                    "projection fanout queue full; invalidating projection stream for {thread_id}"
                );
                let invalidated_subscribers =
                    self.manager.invalidate_thread_projection(thread_id).await;
                handle.cancellation.cancel();
                self.remove_handle(thread_id, handle.worker_id).await;
                spawn_projection_closed_notifications(
                    job.sender,
                    thread_id,
                    invalidated_subscribers,
                );
            }
            Err(mpsc::error::TrySendError::Closed(_job)) => {
                warn!("projection fanout worker stopped before delivery for {thread_id}");
                self.remove_handle(thread_id, handle.worker_id).await;
            }
        }
    }

    async fn cancel_thread(&self, thread_id: ThreadId) {
        let handle = self.inner.lock().await.threads.remove(&thread_id);
        if let Some(handle) = handle {
            handle.cancellation.cancel();
        }
    }

    async fn thread_handle(&self, thread_id: ThreadId) -> ThreadFanoutHandle {
        let mut inner = self.inner.lock().await;
        if let Some(handle) = inner.threads.get(&thread_id) {
            return handle.clone();
        }

        let worker_id = inner.next_worker_id;
        inner.next_worker_id = inner.next_worker_id.wrapping_add(1);
        let capacity = inner.capacity;
        let (tx, rx) = mpsc::channel(capacity);
        let cancellation = CancellationToken::new();
        let handle = ThreadFanoutHandle {
            tx,
            cancellation: cancellation.clone(),
            worker_id,
        };
        inner.threads.insert(thread_id, handle.clone());

        tokio::spawn(run_projection_fanout_worker(
            self.clone(),
            thread_id,
            worker_id,
            rx,
            cancellation,
        ));

        handle
    }

    async fn remove_handle(&self, thread_id: ThreadId, worker_id: u64) {
        let mut inner = self.inner.lock().await;
        let should_remove = inner
            .threads
            .get(&thread_id)
            .is_some_and(|handle| handle.worker_id == worker_id);
        if should_remove {
            inner.threads.remove(&thread_id);
        }
    }
}

impl Clone for ThreadFanoutHandle {
    fn clone(&self) -> Self {
        Self {
            tx: self.tx.clone(),
            cancellation: self.cancellation.clone(),
            worker_id: self.worker_id,
        }
    }
}

async fn run_projection_fanout_worker(
    manager: ProjectionFanoutManager,
    thread_id: ThreadId,
    worker_id: u64,
    mut rx: mpsc::Receiver<ProjectionFanoutJob>,
    cancellation: CancellationToken,
) {
    loop {
        tokio::select! {
            _ = cancellation.cancelled() => break,
            job = rx.recv() => {
                let Some(job) = job else {
                    break;
                };
                for delivery in job.deliveries {
                    send_projection_delivery_if_current_or_cancelled(
                        &manager.manager,
                        job.sender.clone(),
                        thread_id,
                        delivery,
                        &cancellation,
                    )
                    .await;
                    if cancellation.is_cancelled() {
                        break;
                    }
                }
            }
        }
    }

    manager.remove_handle(thread_id, worker_id).await;
}

async fn send_projection_delivery_if_current_or_cancelled(
    manager: &ThreadProjectionManager,
    sender: mpsc::Sender<OutgoingEnvelope>,
    thread_id: ThreadId,
    delivery: ProjectionDelivery,
    cancellation: &CancellationToken,
) {
    let ProjectionDelivery {
        connection_id,
        generation,
        payload,
    } = delivery;
    let notification = match payload {
        ProjectionDeliveryPayload::Event(notification) => {
            ServerNotification::ThreadProjectionEvent(*notification)
        }
        ProjectionDeliveryPayload::Delta(notification) => {
            ServerNotification::ThreadProjectionDelta(notification)
        }
    };
    let outgoing_message = OutgoingMessage::AppServerNotification(notification);
    let permit = tokio::select! {
        permit = sender.reserve() => match permit {
            Ok(permit) => permit,
            Err(err) => {
                warn!("failed to send projection delivery to client: {err:?}");
                return;
            }
        },
        _ = cancellation.cancelled() => return,
    };

    manager
        .run_if_generation_matches(thread_id, generation, || {
            permit.send(OutgoingEnvelope::ToConnection {
                connection_id,
                message: outgoing_message,
                write_complete_tx: None,
            });
        })
        .await;
}

fn spawn_projection_closed_notifications(
    sender: mpsc::Sender<OutgoingEnvelope>,
    thread_id: ThreadId,
    subscribers: Vec<InvalidatedProjectionSubscriber>,
) {
    if subscribers.is_empty() {
        return;
    }

    tokio::spawn(async move {
        for subscriber in subscribers {
            let message = OutgoingMessage::AppServerNotification(
                ServerNotification::ThreadProjectionClosed(ThreadProjectionClosedNotification {
                    thread_id: thread_id.to_string(),
                    subscription_id: subscriber.subscription_id,
                    reason: ThreadProjectionClosedReason::Backpressure,
                }),
            );
            if let Err(err) = sender
                .send(OutgoingEnvelope::ToConnection {
                    connection_id: subscriber.connection_id,
                    message,
                    write_complete_tx: None,
                })
                .await
            {
                warn!("failed to send projection closed notification to client: {err:?}");
                break;
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use std::time::Duration;

    use codex_app_server_protocol::AgentMessageDeltaNotification;
    use codex_app_server_protocol::ConfigWarningNotification;
    use codex_app_server_protocol::ThreadProjectionDelta;
    use codex_app_server_protocol::ThreadProjectionEvent;
    use codex_app_server_protocol::Turn;
    use codex_app_server_protocol::TurnItemsView;
    use codex_app_server_protocol::TurnStartedNotification;
    use codex_app_server_protocol::TurnStatus;
    use pretty_assertions::assert_eq;
    use tokio::time::timeout;

    use crate::outgoing_message::ConnectionId;
    use crate::thread_projection::ProjectionAttachAttempt;

    use super::*;

    fn turn_started_notification(thread_id: ThreadId, turn_id: &str) -> ServerNotification {
        ServerNotification::TurnStarted(TurnStartedNotification {
            thread_id: thread_id.to_string(),
            turn: Turn {
                id: turn_id.to_string(),
                items: Vec::new(),
                items_view: TurnItemsView::Full,
                status: TurnStatus::InProgress,
                error: None,
                started_at: Some(1),
                completed_at: None,
                duration_ms: None,
            },
        })
    }

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

    fn capacity_holder() -> OutgoingEnvelope {
        OutgoingEnvelope::Broadcast {
            message: OutgoingMessage::AppServerNotification(ServerNotification::ConfigWarning(
                ConfigWarningNotification {
                    summary: "hold capacity".to_string(),
                    details: None,
                    path: None,
                    range: None,
                },
            )),
        }
    }

    async fn attach_projection(
        facade: &ThreadProjectionFacade,
        thread_id: ThreadId,
        connection_id: ConnectionId,
    ) -> String {
        let generation = facade.manager.capture_current_generation(thread_id).await;
        let attach = facade
            .manager
            .attach_if_generation_matches(thread_id, connection_id, generation)
            .await;
        let ProjectionAttachAttempt::Attached(result) = attach else {
            panic!("current generation should attach");
        };
        result.subscription_id
    }

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
                OutgoingMessage::AppServerNotification(ServerNotification::ThreadProjectionEvent(event)),
            ..
        } = first
        else {
            panic!("expected first projection event");
        };
        assert!(matches!(
            event.event,
            ThreadProjectionEvent::TurnStarted { .. }
        ));

        let OutgoingEnvelope::ToConnection {
            message:
                OutgoingMessage::AppServerNotification(ServerNotification::ThreadProjectionDelta(delta)),
            ..
        } = second
        else {
            panic!("expected second projection delta");
        };

        assert_eq!(subscription_id, delta.subscription_id);
        assert_eq!(thread_id.to_string(), delta.thread_id);
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

    #[tokio::test]
    async fn enqueue_notification_returns_before_worker_has_outgoing_capacity() {
        let facade = ThreadProjectionFacade::new();
        let thread_id = ThreadId::new();
        attach_projection(&facade, thread_id, ConnectionId(7)).await;

        let (tx, mut rx) = mpsc::channel::<OutgoingEnvelope>(1);
        tx.send(capacity_holder())
            .await
            .expect("capacity holder should enqueue");

        timeout(
            Duration::from_secs(1),
            facade.enqueue_notification(
                tx.clone(),
                thread_id,
                &turn_started_notification(thread_id, "turn-1"),
            ),
        )
        .await
        .expect("enqueue should not wait for outgoing capacity");

        let _capacity_holder = rx.recv().await.expect("capacity holder should be present");
        let envelope = timeout(Duration::from_secs(1), rx.recv())
            .await
            .expect("worker should send after capacity is released")
            .expect("projection envelope should exist");
        let OutgoingEnvelope::ToConnection {
            connection_id,
            message,
            ..
        } = envelope
        else {
            panic!("expected targeted projection envelope");
        };
        assert_eq!(ConnectionId(7), connection_id);
        assert!(matches!(
            message,
            OutgoingMessage::AppServerNotification(ServerNotification::ThreadProjectionEvent(_))
        ));
    }

    #[tokio::test]
    async fn fanout_worker_preserves_thread_job_order() {
        let facade = ThreadProjectionFacade::new();
        let thread_id = ThreadId::new();
        attach_projection(&facade, thread_id, ConnectionId(3)).await;
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
                &turn_started_notification(thread_id, "turn-2"),
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
                    first_notification,
                )),
            ..
        } = first
        else {
            panic!("expected first projection event");
        };
        let OutgoingEnvelope::ToConnection {
            message:
                OutgoingMessage::AppServerNotification(ServerNotification::ThreadProjectionEvent(
                    second_notification,
                )),
            ..
        } = second
        else {
            panic!("expected second projection event");
        };

        assert!(matches!(
            first_notification.event,
            ThreadProjectionEvent::TurnStarted { .. }
        ));
        assert_eq!(
            first_notification.commit_id,
            second_notification
                .parent_commit_id
                .expect("second event should link to first")
        );
    }

    #[tokio::test]
    async fn queue_full_sends_closed_notification_and_drops_current_job() {
        let manager = ThreadProjectionManager::new();
        let fanout =
            ProjectionFanoutManager::new_with_capacity(manager.clone(), /*capacity*/ 1);
        let facade = ThreadProjectionFacade {
            manager: manager.clone(),
            fanout,
        };
        let thread_id = ThreadId::new();
        let connection_id = ConnectionId(9);
        let subscription_id = attach_projection(&facade, thread_id, connection_id).await;
        let generation = manager.capture_current_generation(thread_id).await;

        let (tx, mut rx) = mpsc::channel::<OutgoingEnvelope>(1);
        tx.send(capacity_holder())
            .await
            .expect("capacity holder should enqueue");

        facade
            .enqueue_notification(
                tx.clone(),
                thread_id,
                &turn_started_notification(thread_id, "turn-1"),
            )
            .await;
        tokio::task::yield_now().await;
        facade
            .enqueue_notification(
                tx.clone(),
                thread_id,
                &turn_started_notification(thread_id, "turn-2"),
            )
            .await;
        facade
            .enqueue_notification(
                tx.clone(),
                thread_id,
                &turn_started_notification(thread_id, "turn-3"),
            )
            .await;

        assert!(!manager.generation_matches(thread_id, generation).await);
        assert_eq!(
            Vec::<ThreadId>::new(),
            manager.remove_connection(connection_id).await
        );

        let _capacity_holder = rx.recv().await.expect("capacity holder should exist");
        let envelope = timeout(Duration::from_secs(1), rx.recv())
            .await
            .expect("closed notification should arrive")
            .expect("closed notification should exist");
        let OutgoingEnvelope::ToConnection {
            connection_id: delivered_connection_id,
            message:
                OutgoingMessage::AppServerNotification(ServerNotification::ThreadProjectionClosed(
                    notification,
                )),
            write_complete_tx,
        } = envelope
        else {
            panic!("expected targeted projection closed notification");
        };
        assert_eq!(connection_id, delivered_connection_id);
        assert_eq!(thread_id.to_string(), notification.thread_id);
        assert_eq!(subscription_id, notification.subscription_id);
        assert_eq!(
            ThreadProjectionClosedReason::Backpressure,
            notification.reason
        );
        assert!(write_complete_tx.is_none());

        assert!(
            timeout(Duration::from_millis(50), rx.recv()).await.is_err(),
            "old generation projection delivery should not enqueue after invalidation"
        );
    }

    #[tokio::test]
    async fn delta_backpressure_closes_projection() {
        let manager = ThreadProjectionManager::new();
        let fanout =
            ProjectionFanoutManager::new_with_capacity(manager.clone(), /*capacity*/ 1);
        let facade = ThreadProjectionFacade { manager, fanout };
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
        tokio::task::yield_now().await;
        facade
            .enqueue_notification(
                tx.clone(),
                thread_id,
                &agent_message_delta_notification(thread_id, "turn-1", "item-1", "second"),
            )
            .await;
        facade
            .enqueue_notification(
                tx.clone(),
                thread_id,
                &agent_message_delta_notification(thread_id, "turn-1", "item-1", "third"),
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
            write_complete_tx,
        } = envelope
        else {
            panic!("expected projection closed notification");
        };

        assert_eq!(ConnectionId(9), connection_id);
        assert_eq!(thread_id.to_string(), closed.thread_id);
        assert_eq!(subscription_id, closed.subscription_id);
        assert_eq!(ThreadProjectionClosedReason::Backpressure, closed.reason);
        assert!(write_complete_tx.is_none());
    }

    #[tokio::test]
    async fn queue_full_closed_notification_does_not_wait_for_outgoing_capacity() {
        let manager = ThreadProjectionManager::new();
        let fanout =
            ProjectionFanoutManager::new_with_capacity(manager.clone(), /*capacity*/ 1);
        let facade = ThreadProjectionFacade { manager, fanout };
        let thread_id = ThreadId::new();
        attach_projection(&facade, thread_id, ConnectionId(9)).await;

        let (tx, _rx) = mpsc::channel::<OutgoingEnvelope>(1);
        tx.send(capacity_holder())
            .await
            .expect("capacity holder should enqueue");

        facade
            .enqueue_notification(
                tx.clone(),
                thread_id,
                &turn_started_notification(thread_id, "turn-1"),
            )
            .await;
        tokio::task::yield_now().await;
        timeout(
            Duration::from_secs(1),
            facade.enqueue_notification(
                tx.clone(),
                thread_id,
                &turn_started_notification(thread_id, "turn-2"),
            ),
        )
        .await
        .expect("queue-full handling must not wait for outgoing capacity");

        timeout(
            Duration::from_secs(1),
            facade.enqueue_notification(
                tx,
                thread_id,
                &turn_started_notification(thread_id, "turn-3"),
            ),
        )
        .await
        .expect("queue-full handling must not wait for outgoing capacity");
    }

    #[tokio::test]
    async fn remove_thread_cancels_worker_and_invalidates_projection_state() {
        let facade = ThreadProjectionFacade::new();
        let thread_id = ThreadId::new();
        let connection_id = ConnectionId(5);
        attach_projection(&facade, thread_id, connection_id).await;
        let generation = facade.manager.capture_current_generation(thread_id).await;

        let (tx, mut rx) = mpsc::channel::<OutgoingEnvelope>(1);
        tx.send(capacity_holder())
            .await
            .expect("capacity holder should enqueue");

        facade
            .enqueue_notification(
                tx,
                thread_id,
                &turn_started_notification(thread_id, "turn-1"),
            )
            .await;
        facade.remove_thread(thread_id).await;

        assert!(
            !facade
                .manager
                .generation_matches(thread_id, generation)
                .await
        );
        assert_eq!(
            Vec::<ThreadId>::new(),
            facade.manager.remove_connection(connection_id).await
        );

        let _capacity_holder = rx.recv().await.expect("capacity holder should exist");
        match timeout(Duration::from_millis(50), rx.recv()).await {
            Err(_) | Ok(None) => {}
            Ok(Some(_)) => {
                panic!("worker should be cancelled before sending blocked projection delivery")
            }
        }
    }

    #[tokio::test]
    async fn stale_projection_delivery_waiting_for_capacity_is_dropped() {
        let manager = ThreadProjectionManager::new();
        let thread_id = ThreadId::new();
        let connection_id = ConnectionId(7);
        let generation = manager.capture_current_generation(thread_id).await;
        let attach = manager
            .attach_if_generation_matches(thread_id, connection_id, generation)
            .await;
        let ProjectionAttachAttempt::Attached(_) = attach else {
            panic!("current generation should attach");
        };
        let delivery = manager
            .project_notification(thread_id, &turn_started_notification(thread_id, "turn-1"))
            .await
            .pop()
            .expect("projection subscriber should receive delivery");

        let (tx, mut rx) = mpsc::channel::<OutgoingEnvelope>(1);
        tx.send(capacity_holder())
            .await
            .expect("capacity holder should enqueue");

        let send_task = tokio::spawn({
            let manager = manager.clone();
            let cancellation = CancellationToken::new();
            async move {
                send_projection_delivery_if_current_or_cancelled(
                    &manager,
                    tx,
                    thread_id,
                    delivery,
                    &cancellation,
                )
                .await;
            }
        });
        tokio::task::yield_now().await;

        manager.remove_thread(thread_id).await;
        let _capacity_holder = rx.recv().await.expect("capacity holder should exist");

        timeout(Duration::from_secs(1), send_task)
            .await
            .expect("send task should finish")
            .expect("send task should not panic");
        match timeout(Duration::from_millis(50), rx.recv()).await {
            Err(_) | Ok(None) => {}
            Ok(Some(_)) => panic!("stale projection delivery should not enqueue"),
        }
    }

    #[tokio::test]
    async fn current_projection_delivery_enqueues_after_capacity_is_available() {
        let manager = ThreadProjectionManager::new();
        let thread_id = ThreadId::new();
        let connection_id = ConnectionId(7);
        let generation = manager.capture_current_generation(thread_id).await;
        let attach = manager
            .attach_if_generation_matches(thread_id, connection_id, generation)
            .await;
        let ProjectionAttachAttempt::Attached(_) = attach else {
            panic!("current generation should attach");
        };
        let delivery = manager
            .project_notification(thread_id, &turn_started_notification(thread_id, "turn-1"))
            .await
            .pop()
            .expect("projection subscriber should receive delivery");

        let (tx, mut rx) = mpsc::channel::<OutgoingEnvelope>(1);
        tx.send(capacity_holder())
            .await
            .expect("capacity holder should enqueue");

        let send_task = tokio::spawn({
            let manager = manager.clone();
            let cancellation = CancellationToken::new();
            async move {
                send_projection_delivery_if_current_or_cancelled(
                    &manager,
                    tx,
                    thread_id,
                    delivery,
                    &cancellation,
                )
                .await;
            }
        });
        tokio::task::yield_now().await;

        let _capacity_holder = rx.recv().await.expect("capacity holder should exist");
        timeout(Duration::from_secs(1), send_task)
            .await
            .expect("send task should finish")
            .expect("send task should not panic");

        let envelope = timeout(Duration::from_secs(1), rx.recv())
            .await
            .expect("projection delivery should enqueue")
            .expect("channel should remain open");
        let OutgoingEnvelope::ToConnection {
            connection_id: delivered_connection_id,
            message,
            write_complete_tx,
        } = envelope
        else {
            panic!("expected targeted projection delivery");
        };
        assert_eq!(delivered_connection_id, connection_id);
        assert!(write_complete_tx.is_none());
        assert!(matches!(
            message,
            OutgoingMessage::AppServerNotification(ServerNotification::ThreadProjectionEvent(_))
        ));
    }
}
