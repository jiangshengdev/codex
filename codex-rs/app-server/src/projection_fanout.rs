use std::collections::HashMap;
use std::sync::Arc;

use codex_protocol::ThreadId;
use tokio::sync::Mutex;
use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;
use tracing::warn;

use crate::outgoing_message::OutgoingMessageSender;
use crate::thread_projection::ProjectionDelivery;

pub(crate) const PROJECTION_FANOUT_QUEUE_CAPACITY: usize = 32;

#[derive(Clone, Default)]
pub(crate) struct ProjectionFanoutManager {
    inner: Arc<Mutex<ProjectionFanoutManagerInner>>,
}

#[derive(Default)]
struct ProjectionFanoutManagerInner {
    threads: HashMap<ThreadId, ThreadFanoutHandle>,
    next_worker_id: u64,
}

struct ThreadFanoutHandle {
    worker_id: u64,
    tx: mpsc::Sender<ProjectionFanoutJob>,
    cancellation: CancellationToken,
}

struct ProjectionFanoutJob {
    deliveries: Vec<ProjectionDelivery>,
}

impl ProjectionFanoutManager {
    pub(crate) fn new() -> Self {
        Self::default()
    }

    pub(crate) async fn enqueue_projection_fanout(
        &self,
        outgoing: Arc<OutgoingMessageSender>,
        thread_id: ThreadId,
        deliveries: Vec<ProjectionDelivery>,
    ) {
        if deliveries.is_empty() {
            return;
        }

        let mut job = ProjectionFanoutJob { deliveries };
        loop {
            let mut inner = self.inner.lock().await;
            let tx = inner
                .thread_handle(thread_id, self.clone(), outgoing.clone())
                .tx
                .clone();
            match tx.try_send(job) {
                Ok(()) => return,
                Err(mpsc::error::TrySendError::Full(returned_job)) => {
                    let removed = inner.threads.remove(&thread_id);
                    drop(inner);
                    if let Some(handle) = removed {
                        handle.cancellation.cancel();
                    }
                    warn!(
                        "projection fanout queue full for thread {thread_id}; invalidating projection subscriptions"
                    );
                    outgoing
                        .thread_projection_manager()
                        .invalidate_thread_projection(thread_id)
                        .await;
                    drop(returned_job);
                    return;
                }
                Err(mpsc::error::TrySendError::Closed(returned_job)) => {
                    inner.threads.remove(&thread_id);
                    drop(inner);
                    job = returned_job;
                    continue;
                }
            }
        }
    }

    pub(crate) async fn cancel_thread(&self, thread_id: ThreadId) {
        let mut inner = self.inner.lock().await;
        let handle = inner.threads.remove(&thread_id);
        drop(inner);
        if let Some(handle) = handle {
            handle.cancellation.cancel();
        }
    }

    async fn finish_worker(&self, thread_id: ThreadId, worker_id: u64) {
        let mut inner = self.inner.lock().await;
        if inner
            .threads
            .get(&thread_id)
            .is_some_and(|handle| handle.worker_id == worker_id)
        {
            inner.threads.remove(&thread_id);
        }
    }
}

impl ProjectionFanoutManagerInner {
    fn thread_handle(
        &mut self,
        thread_id: ThreadId,
        manager: ProjectionFanoutManager,
        outgoing: Arc<OutgoingMessageSender>,
    ) -> &ThreadFanoutHandle {
        if !self.threads.contains_key(&thread_id) {
            let (tx, rx) = mpsc::channel(PROJECTION_FANOUT_QUEUE_CAPACITY);
            let cancellation = CancellationToken::new();
            let worker_id = self.next_worker_id;
            self.next_worker_id = self.next_worker_id.wrapping_add(1);
            tokio::spawn(run_projection_fanout_worker(
                manager,
                outgoing,
                thread_id,
                worker_id,
                cancellation.clone(),
                rx,
            ));
            self.threads.insert(
                thread_id,
                ThreadFanoutHandle {
                    worker_id,
                    tx,
                    cancellation,
                },
            );
        }

        self.threads
            .get(&thread_id)
            .expect("thread handle should exist after insertion")
    }
}

async fn run_projection_fanout_worker(
    manager: ProjectionFanoutManager,
    outgoing: Arc<OutgoingMessageSender>,
    thread_id: ThreadId,
    worker_id: u64,
    cancellation: CancellationToken,
    mut rx: mpsc::Receiver<ProjectionFanoutJob>,
) {
    loop {
        if cancellation.is_cancelled() {
            break;
        }
        tokio::select! {
            biased;
            _ = cancellation.cancelled() => break,
            job = rx.recv() => {
                let Some(job) = job else {
                    break;
                };
                for delivery in job.deliveries {
                    if cancellation.is_cancelled() {
                        break;
                    }
                    outgoing
                        .send_projection_delivery_if_current_or_cancelled(
                            thread_id,
                            delivery,
                            &cancellation,
                        )
                        .await;
                }
            }
        }
    }

    manager.finish_worker(thread_id, worker_id).await;
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;
    use std::time::Duration;

    use codex_app_server_protocol::ServerNotification;
    use codex_app_server_protocol::Turn;
    use codex_app_server_protocol::TurnItemsView;
    use codex_app_server_protocol::TurnStartedNotification;
    use codex_app_server_protocol::TurnStatus;
    use codex_protocol::ThreadId;
    use pretty_assertions::assert_eq;
    use tokio::sync::mpsc;
    use tokio::time::timeout;

    use super::PROJECTION_FANOUT_QUEUE_CAPACITY;
    use super::ProjectionFanoutManager;
    use crate::outgoing_message::ConnectionId;
    use crate::outgoing_message::OutgoingEnvelope;
    use crate::outgoing_message::OutgoingMessage;
    use crate::outgoing_message::OutgoingMessageSender;
    use crate::thread_projection::ProjectionAttachAttempt;
    use crate::thread_projection::ProjectionDelivery;

    #[tokio::test]
    async fn enqueue_projection_fanout_returns_before_worker_has_capacity() {
        let (outgoing, _rx) = outgoing_with_full_channel().await;
        let manager = ProjectionFanoutManager::new();
        let thread_id = ThreadId::new();
        let delivery =
            attach_and_materialize_delivery(outgoing.clone(), thread_id, ConnectionId(1)).await;

        timeout(
            Duration::from_secs(1),
            manager.enqueue_projection_fanout(outgoing, thread_id, vec![delivery]),
        )
        .await
        .expect("enqueue should not wait for outgoing capacity");
    }

    #[tokio::test]
    async fn queue_full_invalidates_thread_projection() {
        let (outgoing, _rx) = outgoing_with_full_channel().await;
        let manager = ProjectionFanoutManager::new();
        let thread_id = ThreadId::new();
        let connection_id = ConnectionId(1);
        let delivery =
            attach_and_materialize_delivery(outgoing.clone(), thread_id, connection_id).await;
        let old_generation = delivery.generation;

        manager
            .enqueue_projection_fanout(outgoing.clone(), thread_id, vec![delivery.clone()])
            .await;
        wait_for_empty_thread_queue(&manager, thread_id).await;
        for _ in 0..PROJECTION_FANOUT_QUEUE_CAPACITY {
            manager
                .enqueue_projection_fanout(outgoing.clone(), thread_id, vec![delivery.clone()])
                .await;
        }

        manager
            .enqueue_projection_fanout(outgoing.clone(), thread_id, vec![delivery])
            .await;

        assert!(
            !outgoing
                .thread_projection_manager()
                .generation_matches(thread_id, old_generation)
                .await
        );
        assert_eq!(
            Vec::<ThreadId>::new(),
            outgoing
                .thread_projection_manager()
                .remove_connection(connection_id)
                .await
        );
    }

    #[tokio::test]
    async fn cancel_thread_stops_worker_before_capacity_is_available() {
        let (outgoing, mut rx) = outgoing_with_full_channel().await;
        let manager = ProjectionFanoutManager::new();
        let thread_id = ThreadId::new();
        let delivery =
            attach_and_materialize_delivery(outgoing.clone(), thread_id, ConnectionId(1)).await;

        manager
            .enqueue_projection_fanout(outgoing, thread_id, vec![delivery])
            .await;
        manager.cancel_thread(thread_id).await;
        let _capacity_holder = rx.recv().await.expect("capacity holder should be present");

        match timeout(Duration::from_millis(50), rx.recv()).await {
            Err(_) | Ok(None) => {}
            Ok(Some(envelope)) => panic!(
                "cancelled fanout worker should not deliver queued projection event: {envelope:?}"
            ),
        }
    }

    async fn outgoing_with_full_channel()
    -> (Arc<OutgoingMessageSender>, mpsc::Receiver<OutgoingEnvelope>) {
        let (tx, rx) = mpsc::channel::<OutgoingEnvelope>(1);
        tx.send(OutgoingEnvelope::Broadcast {
            message: OutgoingMessage::AppServerNotification(turn_started_notification(
                ThreadId::new(),
                "capacity-holder",
            )),
        })
        .await
        .expect("capacity holder should enqueue");
        (
            Arc::new(OutgoingMessageSender::new(
                tx,
                codex_analytics::AnalyticsEventsClient::disabled(),
            )),
            rx,
        )
    }

    async fn attach_and_materialize_delivery(
        outgoing: Arc<OutgoingMessageSender>,
        thread_id: ThreadId,
        connection_id: ConnectionId,
    ) -> ProjectionDelivery {
        let generation = outgoing
            .thread_projection_manager()
            .capture_current_generation(thread_id)
            .await;
        let attach = outgoing
            .thread_projection_manager()
            .attach_if_generation_matches(thread_id, connection_id, generation)
            .await;
        let ProjectionAttachAttempt::Attached(_) = attach else {
            panic!("current generation should attach");
        };
        outgoing
            .thread_projection_manager()
            .project_notification(thread_id, &turn_started_notification(thread_id, "turn-1"))
            .await
            .pop()
            .expect("projection subscriber should receive delivery")
    }

    async fn wait_for_empty_thread_queue(manager: &ProjectionFanoutManager, thread_id: ThreadId) {
        timeout(Duration::from_secs(1), async {
            loop {
                let inner = manager.inner.lock().await;
                let is_empty = inner
                    .threads
                    .get(&thread_id)
                    .is_some_and(|handle| handle.tx.capacity() == PROJECTION_FANOUT_QUEUE_CAPACITY);
                drop(inner);
                if is_empty {
                    return;
                }
                tokio::task::yield_now().await;
            }
        })
        .await
        .expect("worker should consume the first fanout job");
    }

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
}
