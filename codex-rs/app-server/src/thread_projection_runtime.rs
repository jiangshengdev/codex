use crate::error_code::invalid_request;
use crate::outgoing_message::ConnectionId;
use crate::outgoing_message::ConnectionRequestId;
use crate::outgoing_message::OutgoingMessageSender;
use crate::request_processors::ThreadRequestProcessor;
use crate::thread_projection::ProjectionAttachAttempt;
use crate::thread_projection::ProjectionGeneration;
use crate::thread_state::ThreadStateManager;
use codex_app_server_protocol::ThreadProjectionAttachResponse;
use codex_protocol::ThreadId;
use std::collections::HashSet;
use std::sync::Arc;
use std::time::Instant;
use tokio::sync::Mutex;
use tokio::sync::watch;

pub(crate) struct ProjectionAttachResponseWork {
    pub(crate) request_id: ConnectionRequestId,
    pub(crate) connection_id: ConnectionId,
    pub(crate) projection_generation: ProjectionGeneration,
    pub(crate) snapshot_processor: ThreadRequestProcessor,
}

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
    attach_response: ProjectionAttachResponseWork,
) {
    let ProjectionAttachResponseWork {
        request_id,
        connection_id,
        projection_generation,
        snapshot_processor,
    } = attach_response;

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

    let Some(cut) = outgoing
        .thread_projection_manager()
        .capture_snapshot_cut_if_generation_matches(conversation_id, projection_generation)
        .await
    else {
        outgoing
            .send_error(
                request_id,
                invalid_request(format!(
                    "thread {conversation_id} was unloaded while attaching projection; retry thread/projection/attach after the thread is loaded"
                )),
            )
            .await;
        return;
    };

    let snapshot = match snapshot_processor
        .read_thread_projection_snapshot_at_cut_for_attach(conversation_id, cut)
        .await
    {
        Ok(snapshot) => snapshot,
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

    let attach_result = match outgoing
        .thread_projection_manager()
        .attach_if_generation_matches(conversation_id, connection_id, projection_generation)
        .await
    {
        ProjectionAttachAttempt::Attached(attach_result) => attach_result,
        ProjectionAttachAttempt::StaleThreadGeneration => {
            outgoing
                .send_error(
                    request_id,
                    invalid_request(format!(
                        "thread {conversation_id} was unloaded while attaching projection; retry thread/projection/attach after the thread is loaded"
                    )),
                )
                .await;
            return;
        }
    };
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
                snapshot,
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
    use crate::config_manager::ConfigManager;
    use crate::outgoing_message::OutgoingEnvelope;
    use crate::outgoing_message::OutgoingMessage;
    use crate::outgoing_message::OutgoingMessageSender;
    use crate::request_processors::ThreadGoalRequestProcessor;
    use crate::thread_state::ConnectionCapabilities;
    use crate::thread_status::ThreadWatchManager;
    use codex_app_server_protocol::RequestId;
    use codex_app_server_protocol::ServerNotification;
    use codex_app_server_protocol::Turn;
    use codex_app_server_protocol::TurnStartedNotification;
    use codex_app_server_protocol::TurnStatus;
    use codex_arg0::Arg0DispatchPaths;
    use codex_config::CloudRequirementsLoader;
    use codex_config::LoaderOverrides;
    use codex_config::NoopThreadConfigLoader;
    use codex_core::ThreadManager;
    use codex_core::config::ConfigBuilder;
    use codex_exec_server::EnvironmentManager;
    use codex_login::AuthManager;
    use codex_login::CodexAuth;
    use codex_protocol::ThreadId;
    use codex_protocol::protocol::EventMsg;
    use codex_protocol::protocol::RolloutItem;
    use codex_protocol::protocol::SessionSource;
    use codex_thread_store::AppendThreadItemsParams;
    use codex_thread_store::InMemoryThreadStore;
    use codex_thread_store::ThreadStore;
    use pretty_assertions::assert_eq;
    use std::path::Path;
    use tempfile::TempDir;
    use tokio::sync::oneshot;
    use tokio::time::Duration;
    use tokio::time::timeout;

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

    struct ProjectionRuntimeHarness {
        processor: ThreadRequestProcessor,
        thread_id: ThreadId,
        store: Arc<InMemoryThreadStore>,
        _temp_dir: TempDir,
        _store_guard: InMemoryThreadStoreId,
    }

    async fn projection_runtime_harness(
        outgoing: Arc<OutgoingMessageSender>,
        thread_state_manager: ThreadStateManager,
    ) -> anyhow::Result<ProjectionRuntimeHarness> {
        let temp_dir = TempDir::new()?;
        let store_id = uuid::Uuid::new_v4().to_string();
        write_in_memory_thread_store_config(temp_dir.path(), &store_id)?;
        let _store_guard = InMemoryThreadStoreId {
            store_id: store_id.clone(),
        };
        let loader_overrides = LoaderOverrides::without_managed_config_for_tests();
        let config = Arc::new(
            ConfigBuilder::default()
                .codex_home(temp_dir.path().to_path_buf())
                .fallback_cwd(Some(temp_dir.path().to_path_buf()))
                .loader_overrides(loader_overrides.clone())
                .build()
                .await?,
        );
        let auth_manager = AuthManager::from_auth_for_testing(CodexAuth::from_api_key("dummy"));
        let thread_store = codex_core::thread_store_from_config(&config, /*state_db*/ None);
        let thread_manager = Arc::new(ThreadManager::new(
            &config,
            auth_manager.clone(),
            SessionSource::Cli,
            Arc::new(EnvironmentManager::default_for_tests()),
            Arc::new(codex_extension_api::ExtensionRegistryBuilder::new().build()),
            /*analytics_events_client*/ None,
            thread_store.clone(),
            /*state_db*/ None,
            uuid::Uuid::new_v4().to_string(),
            /*attestation_provider*/ None,
        ));
        let thread_goal_processor = ThreadGoalRequestProcessor::new(
            thread_manager.clone(),
            outgoing.clone(),
            config.clone(),
            thread_state_manager.clone(),
            /*state_db*/ None,
        );
        let processor = ThreadRequestProcessor::new(
            auth_manager,
            thread_manager.clone(),
            outgoing.clone(),
            Arg0DispatchPaths::default(),
            config.clone(),
            ConfigManager::new(
                temp_dir.path().to_path_buf(),
                Vec::new(),
                loader_overrides,
                /*strict_config*/ false,
                CloudRequirementsLoader::default(),
                Arg0DispatchPaths::default(),
                Arc::new(NoopThreadConfigLoader),
            ),
            thread_store,
            Arc::new(Mutex::new(HashSet::new())),
            thread_state_manager,
            ThreadWatchManager::new(),
            Arc::new(tokio::sync::Semaphore::new(1)),
            thread_goal_processor,
            /*state_db*/ None,
            crate::skills_watcher::SkillsWatcher::new(thread_manager.skills_manager(), outgoing),
        );
        let thread_id = thread_manager
            .start_thread(config.as_ref().clone())
            .await?
            .thread_id;
        Ok(ProjectionRuntimeHarness {
            processor,
            thread_id,
            store: InMemoryThreadStore::for_id(store_id),
            _temp_dir: temp_dir,
            _store_guard,
        })
    }

    fn write_in_memory_thread_store_config(
        codex_home: &Path,
        store_id: &str,
    ) -> std::io::Result<()> {
        std::fs::write(
            codex_home.join("config.toml"),
            format!(
                r#"
model = "mock-model"
approval_policy = "never"
sandbox_mode = "read-only"
experimental_thread_store = {{ type = "in_memory", id = "{store_id}" }}

model_provider = "mock_provider"

[model_providers.mock_provider]
name = "Mock provider for test"
base_url = "http://127.0.0.1:1/v1"
wire_api = "responses"
request_max_retries = 0
stream_max_retries = 0
"#
            ),
        )
    }

    struct InMemoryThreadStoreId {
        store_id: String,
    }

    impl Drop for InMemoryThreadStoreId {
        fn drop(&mut self) {
            InMemoryThreadStore::remove_id(&self.store_id);
        }
    }

    fn visible_turn_started() -> RolloutItem {
        RolloutItem::EventMsg(EventMsg::TurnStarted(
            codex_protocol::protocol::TurnStartedEvent {
                turn_id: "turn-visible".to_string(),
                started_at: Some(1),
                model_context_window: None,
                collaboration_mode_kind: Default::default(),
            },
        ))
    }

    fn pending_turn_started() -> RolloutItem {
        RolloutItem::EventMsg(EventMsg::TurnStarted(
            codex_protocol::protocol::TurnStartedEvent {
                turn_id: "turn-pending".to_string(),
                started_at: Some(2),
                model_context_window: None,
                collaboration_mode_kind: Default::default(),
            },
        ))
    }

    struct ProjectionAttachHarness {
        connection_id: ConnectionId,
        request_id: ConnectionRequestId,
        pending_thread_unloads: Arc<Mutex<HashSet<ThreadId>>>,
        thread_state_manager: ThreadStateManager,
        outgoing: Arc<OutgoingMessageSender>,
        outgoing_rx: tokio::sync::mpsc::Receiver<OutgoingEnvelope>,
        runtime: ProjectionRuntimeHarness,
        projection_generation: ProjectionGeneration,
    }

    impl ProjectionAttachHarness {
        async fn new() -> anyhow::Result<Self> {
            let connection_id = ConnectionId(1);
            let request_id = ConnectionRequestId {
                connection_id,
                request_id: RequestId::Integer(1),
            };
            let pending_thread_unloads = Arc::new(Mutex::new(HashSet::new()));
            let thread_state_manager = ThreadStateManager::new();
            thread_state_manager
                .connection_initialized(connection_id, ConnectionCapabilities::default())
                .await;
            let (outgoing_tx, outgoing_rx) = tokio::sync::mpsc::channel(4);
            let outgoing = Arc::new(OutgoingMessageSender::new(
                outgoing_tx,
                codex_analytics::AnalyticsEventsClient::disabled(),
            ));
            let runtime =
                projection_runtime_harness(outgoing.clone(), thread_state_manager.clone()).await?;
            let projection_generation = outgoing
                .thread_projection_manager()
                .capture_current_generation(runtime.thread_id)
                .await;
            Ok(Self {
                connection_id,
                request_id,
                pending_thread_unloads,
                thread_state_manager,
                outgoing,
                outgoing_rx,
                runtime,
                projection_generation,
            })
        }

        fn thread_id(&self) -> ThreadId {
            self.runtime.thread_id
        }

        fn processor(&self) -> ThreadRequestProcessor {
            self.runtime.processor.clone()
        }

        fn attach_work(&self) -> ProjectionAttachResponseWork {
            ProjectionAttachResponseWork {
                request_id: self.request_id.clone(),
                connection_id: self.connection_id,
                projection_generation: self.projection_generation,
                snapshot_processor: self.processor(),
            }
        }

        async fn handle_attach(&self) {
            handle_projection_attach_response(
                self.thread_id(),
                &self.pending_thread_unloads,
                &self.outgoing,
                &self.thread_state_manager,
                self.attach_work(),
            )
            .await;
        }

        fn spawn_handle_attach(&self) -> tokio::task::JoinHandle<()> {
            let thread_id = self.thread_id();
            let pending_thread_unloads = self.pending_thread_unloads.clone();
            let outgoing = self.outgoing.clone();
            let thread_state_manager = self.thread_state_manager.clone();
            let attach_work = self.attach_work();
            tokio::spawn(async move {
                handle_projection_attach_response(
                    thread_id,
                    &pending_thread_unloads,
                    &outgoing,
                    &thread_state_manager,
                    attach_work,
                )
                .await;
            })
        }

        async fn remove_connection(&self) {
            self.thread_state_manager
                .remove_connection(self.connection_id)
                .await;
        }

        async fn remove_thread(&self) {
            self.outgoing
                .thread_projection_manager()
                .remove_thread(self.thread_id())
                .await;
        }

        async fn remove_projection_connection(&self) -> Vec<ThreadId> {
            self.outgoing
                .thread_projection_manager()
                .remove_connection(self.connection_id)
                .await
        }

        async fn set_history_cursor(&self, item_count: usize) {
            self.outgoing
                .thread_projection_manager()
                .set_history_cursor(
                    self.thread_id(),
                    crate::thread_projection_cut::ProjectionHistoryCursor::new(item_count),
                )
                .await;
        }

        async fn append_history(&self, history_items: Vec<RolloutItem>) -> anyhow::Result<()> {
            self.runtime
                .store
                .append_items(AppendThreadItemsParams {
                    thread_id: self.thread_id(),
                    items: history_items,
                })
                .await?;
            Ok(())
        }

        async fn recv_attach_response(&mut self) -> anyhow::Result<ThreadProjectionAttachResponse> {
            let message = timeout(Duration::from_secs(1), self.outgoing_rx.recv())
                .await
                .expect("attach should send a response")
                .expect("attach response channel should remain open");
            let response = match message {
                OutgoingEnvelope::ToConnection {
                    message: OutgoingMessage::Response(response),
                    ..
                } => response,
                other => panic!("expected attach response, got {other:?}"),
            };
            Ok(serde_json::from_value(response.result)?)
        }

        async fn recv_attach_error_message(&mut self) -> String {
            let message = self
                .outgoing_rx
                .recv()
                .await
                .expect("stale attach should send an error response");
            match message {
                OutgoingEnvelope::ToConnection {
                    message: OutgoingMessage::Error(error),
                    ..
                } => error.error.message,
                other => panic!("expected stale attach error response, got {other:?}"),
            }
        }

        async fn assert_no_projection_delivery(&self) {
            let deliveries = self
                .outgoing
                .thread_projection_manager()
                .project_notification(
                    self.thread_id(),
                    &turn_started_notification(self.thread_id()),
                )
                .await;
            assert_eq!(deliveries, Vec::new());
        }

        async fn assert_one_projection_delivery(&self) {
            let deliveries = self
                .outgoing
                .thread_projection_manager()
                .project_notification(
                    self.thread_id(),
                    &turn_started_notification(self.thread_id()),
                )
                .await;
            assert_eq!(deliveries.len(), 1);
        }

        async fn assert_projection_entry_removed(&self) {
            assert!(
                !self
                    .outgoing
                    .thread_projection_manager()
                    .has_thread_entry(self.thread_id())
                    .await
            );
        }
    }

    #[tokio::test]
    async fn attach_snapshot_cut_excludes_persisted_event_not_processed_by_projection()
    -> anyhow::Result<()> {
        let mut harness = ProjectionAttachHarness::new().await?;
        harness.set_history_cursor(/*item_count*/ 1).await;
        harness
            .append_history(vec![visible_turn_started(), pending_turn_started()])
            .await?;

        harness.handle_attach().await;

        let payload = harness.recv_attach_response().await?;
        let turn_ids = payload
            .snapshot
            .thread
            .turns
            .iter()
            .map(|turn| turn.id.as_str())
            .collect::<Vec<_>>();
        assert_eq!(turn_ids, vec!["turn-visible"]);
        assert_eq!(payload.snapshot.head_commit_id, None);
        Ok(())
    }

    #[tokio::test]
    async fn attach_response_after_connection_close_does_not_subscribe() -> anyhow::Result<()> {
        let harness = ProjectionAttachHarness::new().await?;

        harness.remove_connection().await;
        harness.handle_attach().await;

        harness.assert_no_projection_delivery().await;
        Ok(())
    }

    #[tokio::test]
    async fn connection_close_interleaving_does_not_leave_projection_subscription()
    -> anyhow::Result<()> {
        let harness = ProjectionAttachHarness::new().await?;

        // Production close handling must mark the connection closed before the
        // final projection cleanup so a listener-queued attach observes the
        // closed connection and does not register a subscriber.
        harness.remove_connection().await;
        harness.handle_attach().await;

        let projection_cleanup = harness.remove_projection_connection().await;
        assert_eq!(projection_cleanup, Vec::new());
        harness.assert_no_projection_delivery().await;
        Ok(())
    }

    #[tokio::test]
    async fn attach_response_after_thread_teardown_does_not_recreate_projection_subscription()
    -> anyhow::Result<()> {
        let mut harness = ProjectionAttachHarness::new().await?;

        harness.remove_thread().await;
        timeout(Duration::from_secs(1), harness.handle_attach())
            .await
            .expect("attach task should finish");

        let error = harness.recv_attach_error_message().await;
        assert!(error.contains("was unloaded while attaching projection"));
        harness.assert_projection_entry_removed().await;

        let projection_cleanup = harness.remove_projection_connection().await;
        assert_eq!(projection_cleanup, Vec::new());
        harness.assert_no_projection_delivery().await;
        Ok(())
    }

    #[tokio::test]
    async fn attach_response_after_thread_teardown_during_snapshot_read_does_not_subscribe()
    -> anyhow::Result<()> {
        let mut harness = ProjectionAttachHarness::new().await?;
        let (entered_tx, entered_rx) = oneshot::channel();
        let (resume_tx, resume_rx) = oneshot::channel();
        let _hook = ThreadRequestProcessor::install_projection_snapshot_read_test_hook(
            harness.thread_id(),
            entered_tx,
            resume_rx,
        );

        let attach_task = harness.spawn_handle_attach();

        timeout(Duration::from_secs(1), entered_rx)
            .await
            .expect("handler should enter snapshot read")
            .expect("snapshot read hook should signal entry");
        harness.remove_thread().await;
        resume_tx
            .send(())
            .expect("snapshot read hook should still be waiting");
        timeout(Duration::from_secs(1), attach_task)
            .await
            .expect("attach task should finish")
            .expect("attach task should not panic");

        let error = harness.recv_attach_error_message().await;
        assert!(error.contains("was unloaded while attaching projection"));
        harness.assert_projection_entry_removed().await;

        let projection_cleanup = harness.remove_projection_connection().await;
        assert_eq!(projection_cleanup, Vec::new());
        harness.assert_no_projection_delivery().await;
        Ok(())
    }

    #[tokio::test]
    async fn late_connection_close_cleanup_removes_projection_attach_race() -> anyhow::Result<()> {
        let harness = ProjectionAttachHarness::new().await?;

        let initial_cleanup = harness.remove_projection_connection().await;
        assert_eq!(initial_cleanup, Vec::new());

        harness.handle_attach().await;
        harness.assert_one_projection_delivery().await;

        harness.remove_connection().await;
        let late_cleanup = harness.remove_projection_connection().await;
        assert_eq!(late_cleanup, vec![harness.thread_id()]);

        harness.assert_no_projection_delivery().await;
        Ok(())
    }
}
