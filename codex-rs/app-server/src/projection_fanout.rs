use std::collections::HashMap;
use std::sync::Arc;

use codex_app_server_protocol::ServerNotification;
use codex_protocol::ThreadId;
use tokio::sync::Mutex;
use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;
use tracing::warn;

use crate::outgoing_message::OutgoingEnvelope;
use crate::outgoing_message::OutgoingMessage;
use crate::thread_projection::ProjectionDelivery;
use crate::thread_projection::ThreadProjectionManager;
use crate::thread_projection_cut::ProjectionHistoryCursor;

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
        projection_history_cursor: Option<ProjectionHistoryCursor>,
    ) {
        let deliveries = if let Some(cursor) = projection_history_cursor {
            self.manager
                .project_notification_at_cursor(thread_id, notification, cursor)
                .await
        } else {
            self.manager
                .project_notification(thread_id, notification)
                .await
        };

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

#[derive(Default)]
struct ProjectionFanoutManagerInner {
    threads: HashMap<ThreadId, ThreadFanoutHandle>,
    next_worker_id: u64,
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
            Err(mpsc::error::TrySendError::Full(_job)) => {
                warn!(
                    "projection fanout queue full; invalidating projection stream for {thread_id}"
                );
                self.manager.invalidate_thread_projection(thread_id).await;
                handle.cancellation.cancel();
                self.remove_handle(thread_id, handle.worker_id).await;
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
        let (tx, rx) = mpsc::channel(PROJECTION_FANOUT_QUEUE_CAPACITY);
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
    let outgoing_message = OutgoingMessage::AppServerNotification(
        ServerNotification::ThreadProjectionEvent(delivery.notification),
    );
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
        .run_if_generation_matches(thread_id, delivery.generation, || {
            permit.send(OutgoingEnvelope::ToConnection {
                connection_id: delivery.connection_id,
                message: outgoing_message,
                write_complete_tx: None,
            });
        })
        .await;
}
