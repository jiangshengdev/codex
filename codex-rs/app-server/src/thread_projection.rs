use std::collections::HashMap;
use std::collections::HashSet;
use std::sync::Arc;

use codex_app_server_protocol::ServerNotification;
use codex_app_server_protocol::ThreadProjectionEvent;
use codex_app_server_protocol::ThreadProjectionEventNotification;
use codex_protocol::ThreadId;
use tokio::sync::Mutex;
use tokio::sync::watch;
use uuid::Uuid;

use crate::outgoing_message::ConnectionId;

#[derive(Clone, Default)]
pub(crate) struct ThreadProjectionManager {
    inner: Arc<Mutex<ThreadProjectionManagerInner>>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum ProjectionDetachResult {
    Detached,
    NotSubscribed,
    // Manager-level NotLoaded means no projection entry exists for the thread.
    // API handlers must check thread loaded state before mapping this to wire status.
    NotLoaded,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct ProjectionAttachResult {
    pub(crate) subscription_id: String,
    pub(crate) head_commit_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq)]
pub(crate) struct ProjectionDelivery {
    pub(crate) connection_id: ConnectionId,
    pub(crate) notification: ThreadProjectionEventNotification,
}

#[derive(Default)]
struct ThreadProjectionManagerInner {
    threads: HashMap<ThreadId, ThreadEntry>,
    connection_index: HashMap<ConnectionId, HashSet<ThreadId>>,
}

struct ThreadEntry {
    head_commit_id: Option<String>,
    subscribers: HashMap<ConnectionId, ProjectionSubscriber>,
    has_subscribers_tx: watch::Sender<bool>,
}

struct ProjectionSubscriber {
    subscription_id: String,
}

impl ThreadProjectionManager {
    pub(crate) fn new() -> Self {
        Self::default()
    }

    pub(crate) async fn attach(
        &self,
        thread_id: ThreadId,
        connection_id: ConnectionId,
    ) -> ProjectionAttachResult {
        let mut inner = self.inner.lock().await;
        let entry = inner.thread_entry_mut(thread_id);
        let had_subscribers = !entry.subscribers.is_empty();
        let subscription_id = Uuid::now_v7().to_string();
        let head_commit_id = entry.head_commit_id.clone();
        entry.subscribers.insert(
            connection_id,
            ProjectionSubscriber {
                subscription_id: subscription_id.clone(),
            },
        );
        if !had_subscribers {
            let _ = entry.has_subscribers_tx.send(true);
        }
        inner.add_connection_thread_index(connection_id, thread_id);
        ProjectionAttachResult {
            subscription_id,
            head_commit_id,
        }
    }

    pub(crate) async fn detach(
        &self,
        thread_id: ThreadId,
        connection_id: ConnectionId,
    ) -> ProjectionDetachResult {
        let mut inner = self.inner.lock().await;
        let Some(entry) = inner.threads.get_mut(&thread_id) else {
            return ProjectionDetachResult::NotLoaded;
        };
        if entry.subscribers.remove(&connection_id).is_none() {
            return ProjectionDetachResult::NotSubscribed;
        }
        if entry.subscribers.is_empty() {
            let _ = entry.has_subscribers_tx.send(false);
        }
        inner.remove_connection_thread_index(connection_id, thread_id);
        ProjectionDetachResult::Detached
    }

    pub(crate) async fn remove_connection(&self, connection_id: ConnectionId) -> Vec<ThreadId> {
        let mut inner = self.inner.lock().await;
        let Some(thread_ids) = inner.connection_index.remove(&connection_id) else {
            return Vec::new();
        };
        let mut removed_thread_ids = Vec::with_capacity(thread_ids.len());
        for thread_id in thread_ids {
            if let Some(entry) = inner.threads.get_mut(&thread_id)
                && entry.subscribers.remove(&connection_id).is_some()
            {
                if entry.subscribers.is_empty() {
                    let _ = entry.has_subscribers_tx.send(false);
                }
                removed_thread_ids.push(thread_id);
            }
        }
        removed_thread_ids
    }

    pub(crate) async fn remove_thread(&self, thread_id: ThreadId) {
        let mut inner = self.inner.lock().await;
        let Some(entry) = inner.threads.remove(&thread_id) else {
            return;
        };
        for connection_id in entry.subscribers.into_keys() {
            inner.remove_connection_thread_index(connection_id, thread_id);
        }
    }

    pub(crate) async fn project_notification(
        &self,
        thread_id: ThreadId,
        notification: &ServerNotification,
    ) -> Vec<ProjectionDelivery> {
        let mut inner = self.inner.lock().await;
        let Some(event) = projection_event_from_notification(notification) else {
            return Vec::new();
        };
        let entry = inner.thread_entry_mut(thread_id);
        let commit_id = Uuid::now_v7().to_string();
        let parent_commit_id = entry.head_commit_id.replace(commit_id.clone());
        let mut subscribers = entry
            .subscribers
            .iter()
            .map(|(connection_id, subscriber)| (*connection_id, subscriber.subscription_id.clone()))
            .collect::<Vec<_>>();
        subscribers.sort_by_key(|(connection_id, _)| connection_id.0);
        subscribers
            .into_iter()
            .map(|(connection_id, subscription_id)| ProjectionDelivery {
                connection_id,
                notification: ThreadProjectionEventNotification {
                    thread_id: thread_id.to_string(),
                    subscription_id,
                    commit_id: commit_id.clone(),
                    parent_commit_id: parent_commit_id.clone(),
                    event: event.clone(),
                },
            })
            .collect()
    }

    pub(crate) async fn subscribe_to_has_subscribers(
        &self,
        thread_id: ThreadId,
    ) -> watch::Receiver<bool> {
        self.inner
            .lock()
            .await
            .thread_entry_mut(thread_id)
            .has_subscribers_tx
            .subscribe()
    }
}

impl ThreadProjectionManagerInner {
    fn add_connection_thread_index(&mut self, connection_id: ConnectionId, thread_id: ThreadId) {
        self.connection_index
            .entry(connection_id)
            .or_default()
            .insert(thread_id);
    }

    fn remove_connection_thread_index(&mut self, connection_id: ConnectionId, thread_id: ThreadId) {
        if let Some(thread_ids) = self.connection_index.get_mut(&connection_id) {
            thread_ids.remove(&thread_id);
            if thread_ids.is_empty() {
                self.connection_index.remove(&connection_id);
            }
        }
    }

    fn thread_entry_mut(&mut self, thread_id: ThreadId) -> &mut ThreadEntry {
        self.threads.entry(thread_id).or_insert_with(|| {
            let (has_subscribers_tx, _) = watch::channel(false);
            ThreadEntry {
                head_commit_id: None,
                subscribers: HashMap::new(),
                has_subscribers_tx,
            }
        })
    }
}

fn projection_event_from_notification(
    notification: &ServerNotification,
) -> Option<ThreadProjectionEvent> {
    match notification {
        ServerNotification::TurnStarted(notification) => Some(ThreadProjectionEvent::TurnStarted {
            notification: notification.clone(),
        }),
        ServerNotification::TurnCompleted(notification) => {
            Some(ThreadProjectionEvent::TurnCompleted {
                notification: notification.clone(),
            })
        }
        ServerNotification::ItemStarted(notification) => Some(ThreadProjectionEvent::ItemStarted {
            notification: notification.clone(),
        }),
        ServerNotification::ItemCompleted(notification) => {
            Some(ThreadProjectionEvent::ItemCompleted {
                notification: notification.clone(),
            })
        }
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use codex_app_server_protocol::ServerNotification;
    use codex_app_server_protocol::ThreadArchivedNotification;
    use codex_app_server_protocol::ThreadProjectionEvent;
    use codex_app_server_protocol::Turn;
    use codex_app_server_protocol::TurnItemsView;
    use codex_app_server_protocol::TurnStartedNotification;
    use codex_app_server_protocol::TurnStatus;
    use codex_protocol::ThreadId;
    use pretty_assertions::assert_eq;

    use crate::outgoing_message::ConnectionId;

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

    fn non_whitelisted_notification(thread_id: ThreadId) -> ServerNotification {
        ServerNotification::ThreadArchived(ThreadArchivedNotification {
            thread_id: thread_id.to_string(),
        })
    }

    #[tokio::test]
    async fn first_event_has_no_parent_and_second_event_parents_to_first_commit() {
        let manager = ThreadProjectionManager::new();
        let thread_id = ThreadId::new();
        let connection_id = ConnectionId(1);

        manager.attach(thread_id, connection_id).await;

        let first = manager
            .project_notification(thread_id, &turn_started_notification(thread_id, "turn-1"))
            .await;
        let second = manager
            .project_notification(thread_id, &turn_started_notification(thread_id, "turn-2"))
            .await;

        assert_eq!(1, first.len());
        assert_eq!(1, second.len());
        let first = &first[0].notification;
        let second = &second[0].notification;
        assert_eq!(None, first.parent_commit_id);
        assert_eq!(Some(first.commit_id.clone()), second.parent_commit_id);
    }

    #[tokio::test]
    async fn two_subscribers_receive_the_same_commit() {
        let manager = ThreadProjectionManager::new();
        let thread_id = ThreadId::new();
        manager.attach(thread_id, ConnectionId(1)).await;
        manager.attach(thread_id, ConnectionId(2)).await;

        let deliveries = manager
            .project_notification(thread_id, &turn_started_notification(thread_id, "turn-1"))
            .await;

        assert_eq!(2, deliveries.len());
        assert_eq!(
            deliveries[0].notification.commit_id,
            deliveries[1].notification.commit_id
        );
        assert_eq!(
            deliveries[0].notification.parent_commit_id,
            deliveries[1].notification.parent_commit_id
        );
    }

    #[tokio::test]
    async fn detach_removes_only_the_matching_connection() {
        let manager = ThreadProjectionManager::new();
        let thread_id = ThreadId::new();
        let first = manager.attach(thread_id, ConnectionId(1)).await;
        let second = manager.attach(thread_id, ConnectionId(2)).await;

        assert_eq!(
            ProjectionDetachResult::Detached,
            manager.detach(thread_id, ConnectionId(1)).await
        );

        let deliveries = manager
            .project_notification(thread_id, &turn_started_notification(thread_id, "turn-1"))
            .await;
        assert_eq!(1, deliveries.len());
        assert_eq!(ConnectionId(2), deliveries[0].connection_id);
        assert_eq!(
            second.subscription_id,
            deliveries[0].notification.subscription_id
        );
        assert_ne!(
            first.subscription_id,
            deliveries[0].notification.subscription_id
        );
    }

    #[tokio::test]
    async fn non_whitelisted_notifications_do_not_deliver_or_advance_head() {
        let manager = ThreadProjectionManager::new();
        let thread_id = ThreadId::new();
        let connection_id = ConnectionId(1);

        let attach = manager.attach(thread_id, connection_id).await;
        let ignored = manager
            .project_notification(thread_id, &non_whitelisted_notification(thread_id))
            .await;
        let second_attach = manager.attach(thread_id, connection_id).await;
        let delivered = manager
            .project_notification(thread_id, &turn_started_notification(thread_id, "turn-1"))
            .await;

        assert_eq!(Vec::<ProjectionDelivery>::new(), ignored);
        assert_eq!(attach.head_commit_id, second_attach.head_commit_id);
        assert_eq!(1, delivered.len());
        assert_eq!(None, delivered[0].notification.parent_commit_id);
    }

    #[tokio::test]
    async fn repeated_attach_replaces_the_subscription_for_the_same_connection_and_thread() {
        let manager = ThreadProjectionManager::new();
        let thread_id = ThreadId::new();
        let connection_id = ConnectionId(1);

        let first = manager.attach(thread_id, connection_id).await;
        let second = manager.attach(thread_id, connection_id).await;
        let deliveries = manager
            .project_notification(thread_id, &turn_started_notification(thread_id, "turn-1"))
            .await;

        assert_ne!(first.subscription_id, second.subscription_id);
        assert_eq!(1, deliveries.len());
        assert_eq!(
            second.subscription_id,
            deliveries[0].notification.subscription_id
        );
    }

    #[tokio::test]
    async fn remove_connection_removes_all_subscriptions_and_updates_has_subscribers() {
        let manager = ThreadProjectionManager::new();
        let first_thread_id = ThreadId::new();
        let second_thread_id = ThreadId::new();
        let connection_id = ConnectionId(1);
        let other_connection_id = ConnectionId(2);

        let mut first_has_subscribers = manager.subscribe_to_has_subscribers(first_thread_id).await;
        let mut second_has_subscribers =
            manager.subscribe_to_has_subscribers(second_thread_id).await;
        assert!(!*first_has_subscribers.borrow());
        assert!(!*second_has_subscribers.borrow());

        manager.attach(first_thread_id, connection_id).await;
        manager.attach(second_thread_id, connection_id).await;
        manager.attach(second_thread_id, other_connection_id).await;
        first_has_subscribers.changed().await.expect("watch open");
        second_has_subscribers.changed().await.expect("watch open");
        assert!(*first_has_subscribers.borrow());
        assert!(*second_has_subscribers.borrow());

        let removed = manager.remove_connection(connection_id).await;

        assert!(removed.contains(&first_thread_id));
        assert!(removed.contains(&second_thread_id));
        first_has_subscribers.changed().await.expect("watch open");
        assert!(!*first_has_subscribers.borrow());
        assert!(*second_has_subscribers.borrow());

        let first_deliveries = manager
            .project_notification(
                first_thread_id,
                &turn_started_notification(first_thread_id, "turn-1"),
            )
            .await;
        let second_deliveries = manager
            .project_notification(
                second_thread_id,
                &turn_started_notification(second_thread_id, "turn-2"),
            )
            .await;
        assert_eq!(Vec::<ProjectionDelivery>::new(), first_deliveries);
        assert_eq!(1, second_deliveries.len());
        assert_eq!(other_connection_id, second_deliveries[0].connection_id);
    }

    #[tokio::test]
    async fn remove_thread_clears_head_and_subscribers() {
        let manager = ThreadProjectionManager::new();
        let thread_id = ThreadId::new();
        let connection_id = ConnectionId(1);

        manager.attach(thread_id, connection_id).await;
        let deliveries = manager
            .project_notification(thread_id, &turn_started_notification(thread_id, "turn-1"))
            .await;
        assert_eq!(1, deliveries.len());

        manager.remove_thread(thread_id).await;

        let attach = manager.attach(thread_id, connection_id).await;
        assert_eq!(None, attach.head_commit_id);
        let deliveries = manager
            .project_notification(thread_id, &turn_started_notification(thread_id, "turn-2"))
            .await;
        assert_eq!(1, deliveries.len());
        assert_eq!(None, deliveries[0].notification.parent_commit_id);
    }

    #[tokio::test]
    async fn projected_delivery_wraps_the_whitelisted_event() {
        let manager = ThreadProjectionManager::new();
        let thread_id = ThreadId::new();
        manager.attach(thread_id, ConnectionId(1)).await;

        let deliveries = manager
            .project_notification(thread_id, &turn_started_notification(thread_id, "turn-1"))
            .await;

        assert_eq!(1, deliveries.len());
        assert!(matches!(
            deliveries[0].notification.event,
            ThreadProjectionEvent::TurnStarted { .. }
        ));
    }
}
