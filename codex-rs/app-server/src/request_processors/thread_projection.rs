use super::thread_processor::ThreadReadViewError;
use super::thread_processor::preview_from_rollout_items;
use super::thread_processor::reconstruct_thread_turns_for_turns_list;
use super::thread_processor::thread_read_view_error;
use super::*;
use crate::thread_projection::ProjectionDetachResult;
use codex_app_server_protocol::ThreadProjectionAttachParams;
use codex_app_server_protocol::ThreadProjectionDetachParams;
use codex_app_server_protocol::ThreadProjectionDetachResponse;
use codex_app_server_protocol::ThreadProjectionDetachStatus;
use codex_app_server_protocol::ThreadProjectionSnapshot;
#[cfg(test)]
use codex_goal_extension::GoalService;
use std::sync::Arc;
#[cfg(test)]
use std::sync::OnceLock;

struct PreparedProjectionAttach {
    thread_id: ThreadId,
    thread_state: Arc<Mutex<crate::thread_state::ThreadState>>,
}

#[cfg(test)]
struct ProjectionSnapshotReadTestHook {
    thread_id: ThreadId,
    entered_tx: std::sync::Mutex<Option<tokio::sync::oneshot::Sender<()>>>,
    resume_rx: tokio::sync::Mutex<Option<tokio::sync::oneshot::Receiver<()>>>,
}

#[cfg(test)]
static PROJECTION_SNAPSHOT_READ_TEST_HOOK: OnceLock<
    std::sync::Mutex<Option<Arc<ProjectionSnapshotReadTestHook>>>,
> = OnceLock::new();

#[cfg(test)]
pub(crate) struct ProjectionSnapshotReadTestHookGuard;

#[cfg(test)]
impl Drop for ProjectionSnapshotReadTestHookGuard {
    fn drop(&mut self) {
        *projection_snapshot_read_test_hook_slot()
            .lock()
            .expect("snapshot read test hook mutex should not be poisoned") = None;
    }
}

#[cfg(test)]
fn projection_snapshot_read_test_hook_slot()
-> &'static std::sync::Mutex<Option<Arc<ProjectionSnapshotReadTestHook>>> {
    PROJECTION_SNAPSHOT_READ_TEST_HOOK.get_or_init(|| std::sync::Mutex::new(None))
}

#[cfg(test)]
async fn run_projection_snapshot_read_test_hook(thread_id: ThreadId) {
    let hook = {
        projection_snapshot_read_test_hook_slot()
            .lock()
            .expect("snapshot read test hook mutex should not be poisoned")
            .clone()
    };
    let Some(hook) = hook else {
        return;
    };
    if hook.thread_id != thread_id {
        return;
    }
    if let Some(entered_tx) = hook
        .entered_tx
        .lock()
        .expect("snapshot read entered sender mutex should not be poisoned")
        .take()
    {
        let _ = entered_tx.send(());
    }
    let resume_rx = hook.resume_rx.lock().await.take();
    if let Some(resume_rx) = resume_rx {
        let _ = resume_rx.await;
    }
}

impl ThreadRequestProcessor {
    #[cfg(test)]
    pub(crate) fn install_projection_snapshot_read_test_hook(
        thread_id: ThreadId,
        entered_tx: tokio::sync::oneshot::Sender<()>,
        resume_rx: tokio::sync::oneshot::Receiver<()>,
    ) -> ProjectionSnapshotReadTestHookGuard {
        *projection_snapshot_read_test_hook_slot()
            .lock()
            .expect("snapshot read test hook mutex should not be poisoned") =
            Some(Arc::new(ProjectionSnapshotReadTestHook {
                thread_id,
                entered_tx: std::sync::Mutex::new(Some(entered_tx)),
                resume_rx: tokio::sync::Mutex::new(Some(resume_rx)),
            }));
        ProjectionSnapshotReadTestHookGuard
    }

    pub(crate) async fn thread_projection_attach(
        &self,
        request_id: &ConnectionRequestId,
        params: ThreadProjectionAttachParams,
    ) -> Result<Option<ClientResponsePayload>, JSONRPCErrorError> {
        let Some(attach) = self.prepare_projection_attach(request_id, params).await? else {
            return Ok(None);
        };

        let thread_id = attach.thread_id;
        let projection_generation = self
            .outgoing
            .thread_projection_manager()
            .capture_current_generation(thread_id)
            .await;
        let snapshot_processor = self.clone();
        let enqueue_result = enqueue_projection_attach_response(
            attach.thread_state,
            attach.thread_id,
            request_id.clone(),
            projection_generation,
            snapshot_processor,
        )
        .await;
        if let Err(error) = enqueue_result {
            self.thread_state_manager
                .release_projection_attach_lease(thread_id, request_id.connection_id)
                .await;
            return Err(error);
        }
        Ok(None)
    }

    async fn prepare_projection_attach(
        &self,
        request_id: &ConnectionRequestId,
        params: ThreadProjectionAttachParams,
    ) -> Result<Option<PreparedProjectionAttach>, JSONRPCErrorError> {
        let thread_id = ThreadId::from_string(&params.thread_id)
            .map_err(|err| invalid_request(format!("invalid thread id: {err}")))?;
        let thread = self
            .thread_manager
            .get_thread(thread_id)
            .await
            .map_err(|_| invalid_request(format!("thread not found: {thread_id}")))?;
        if self
            .pending_thread_unloads
            .lock()
            .await
            .contains(&thread_id)
        {
            return Err(invalid_request(format!(
                "thread {thread_id} is closing; retry thread/projection/attach after the thread is closed"
            )));
        }

        let Some(thread_state) = self
            .thread_state_manager
            .try_begin_projection_attach(thread_id, request_id.connection_id)
            .await
        else {
            tracing::debug!(
                thread_id = %thread_id,
                connection_id = ?request_id.connection_id,
                "skipping thread projection attach for closed connection"
            );
            return Ok(None);
        };

        if let Err(error) = self
            .ensure_listener_task_running(thread_id, thread, thread_state.clone())
            .await
        {
            self.thread_state_manager
                .release_projection_attach_lease(thread_id, request_id.connection_id)
                .await;
            return Err(error);
        }

        Ok(Some(PreparedProjectionAttach {
            thread_id,
            thread_state,
        }))
    }

    pub(crate) async fn thread_projection_detach(
        &self,
        request_id: &ConnectionRequestId,
        params: ThreadProjectionDetachParams,
    ) -> Result<Option<ClientResponsePayload>, JSONRPCErrorError> {
        let thread_id = ThreadId::from_string(&params.thread_id)
            .map_err(|err| invalid_request(format!("invalid thread id: {err}")))?;
        let status = if self.thread_manager.get_thread(thread_id).await.is_err() {
            ThreadProjectionDetachStatus::NotLoaded
        } else {
            match self
                .outgoing
                .thread_projection_manager()
                .detach(thread_id, request_id.connection_id)
                .await
            {
                ProjectionDetachResult::Detached => ThreadProjectionDetachStatus::Detached,
                ProjectionDetachResult::NotSubscribed
                | ProjectionDetachResult::NoProjectionEntry => {
                    ThreadProjectionDetachStatus::NotSubscribed
                }
            }
        };
        Ok(Some(ThreadProjectionDetachResponse { status }.into()))
    }

    pub(super) async fn read_thread_projection_snapshot_at_cut(
        &self,
        thread_id: ThreadId,
        cut: crate::thread_projection_cut::ProjectionSnapshotCut,
    ) -> Result<ThreadProjectionSnapshot, ThreadReadViewError> {
        let mut thread = self
            .read_thread_view(thread_id, /*include_turns*/ false)
            .await?;
        let loaded_thread = self.thread_manager.get_thread(thread_id).await.ok();
        let has_live_running_thread = match loaded_thread.as_ref() {
            Some(thread) => matches!(thread.agent_status().await, AgentStatus::Running),
            None => false,
        };
        let active_turn = if loaded_thread.is_some() {
            let thread_state = self.thread_state_manager.thread_state(thread_id).await;
            thread_state.lock().await.active_turn_snapshot()
        } else {
            None
        };
        let has_live_in_progress_turn = has_live_running_thread
            || active_turn
                .as_ref()
                .is_some_and(|turn| matches!(turn.status, TurnStatus::InProgress));
        let loaded_status = self
            .thread_watch_manager
            .loaded_status_for_thread(&thread.id)
            .await;
        let history_items = match self.load_thread_turns_list_history(thread_id).await {
            Ok(items) => items,
            Err(ThreadReadViewError::InvalidRequest(message))
                if message
                    == format!(
                        "thread {thread_id} is not materialized yet; thread/turns/list is unavailable before first user message"
                    ) =>
            {
                Vec::new()
            }
            Err(err) => return Err(err),
        };
        let thread_status = resolve_thread_status(loaded_status.clone(), has_live_in_progress_turn);

        // The thread store only exposes current metadata, so reconcile the
        // visible preview from the same persisted history used for turns.
        thread.preview = preview_from_rollout_items(&history_items);

        thread.turns = reconstruct_thread_turns_for_turns_list(
            &history_items,
            loaded_status,
            has_live_running_thread,
            active_turn,
        );
        thread.status = thread_status;
        Ok(ThreadProjectionSnapshot {
            thread,
            head_commit_id: cut.head_commit_id,
        })
    }

    pub(crate) async fn read_thread_projection_snapshot_at_cut_for_attach(
        &self,
        thread_id: ThreadId,
        cut: crate::thread_projection_cut::ProjectionSnapshotCut,
    ) -> Result<ThreadProjectionSnapshot, JSONRPCErrorError> {
        #[cfg(test)]
        run_projection_snapshot_read_test_hook(thread_id).await;

        self.read_thread_projection_snapshot_at_cut(thread_id, cut)
            .await
            .map_err(thread_read_view_error)
    }
}

async fn enqueue_projection_attach_response(
    thread_state: Arc<Mutex<crate::thread_state::ThreadState>>,
    thread_id: ThreadId,
    request_id: ConnectionRequestId,
    projection_generation: crate::thread_projection::ProjectionGeneration,
    snapshot_processor: ThreadRequestProcessor,
) -> Result<(), JSONRPCErrorError> {
    let listener_command_tx = {
        let thread_state = thread_state.lock().await;
        thread_state.listener_command_tx()
    };
    let Some(listener_command_tx) = listener_command_tx else {
        return Err(internal_error(format!(
            "failed to enqueue thread projection attach for thread {thread_id}: thread listener is not running"
        )));
    };

    let (completion_tx, completion_rx) = tokio::sync::oneshot::channel();
    listener_command_tx
        .send(crate::thread_state::ThreadListenerCommand::SendThreadProjectionAttachResponse {
            request_id: request_id.clone(),
            connection_id: request_id.connection_id,
            projection_generation,
            snapshot_processor: Box::new(snapshot_processor),
            completion_tx,
        })
        .map_err(|_| {
            internal_error(format!(
                "failed to enqueue thread projection attach for thread {thread_id}: thread listener command channel is closed"
            ))
        })?;
    completion_rx.await.map_err(|err| {
        internal_error(format!(
            "failed to complete thread projection attach for thread {thread_id}: {err}"
        ))
    })?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use anyhow::Result;
    use codex_config::CloudConfigBundleLoader;
    use codex_config::LoaderOverrides;
    use codex_config::NoopThreadConfigLoader;
    use codex_core::config::ConfigBuilder;
    use codex_protocol::models::ImageDetail;
    use codex_protocol::protocol::SessionSource;
    use codex_thread_store::AppendThreadItemsParams;
    use codex_thread_store::InMemoryThreadStore;
    use codex_thread_store::ThreadStore;
    use pretty_assertions::assert_eq;
    use std::path::Path;
    use std::path::PathBuf;
    use std::sync::Arc;
    use tempfile::TempDir;

    #[tokio::test]
    async fn projection_snapshot_turns_match_canonical_reconstruction_for_live_active_turn()
    -> Result<()> {
        let temp_dir = TempDir::new()?;
        let store_id = uuid::Uuid::new_v4().to_string();
        write_in_memory_thread_store_config(temp_dir.path(), &store_id)?;
        let store = InMemoryThreadStore::for_id(store_id.clone());
        let _store_guard = InMemoryThreadStoreId { store_id };
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
            Arc::new(codex_core::test_support::EmptyUserInstructionsProvider),
            /*analytics_events_client*/ None,
            thread_store.clone(),
            /*state_db*/ None,
            uuid::Uuid::new_v4().to_string(),
            /*attestation_provider*/ None,
            /*external_time_provider*/ None,
        ));
        let (outgoing_tx, _outgoing_rx) = tokio::sync::mpsc::channel(8);
        let outgoing = Arc::new(OutgoingMessageSender::new(
            outgoing_tx,
            codex_analytics::AnalyticsEventsClient::disabled(),
        ));
        let thread_state_manager = ThreadStateManager::new();
        let thread_goal_processor = ThreadGoalRequestProcessor::new(
            thread_manager.clone(),
            outgoing.clone(),
            config.clone(),
            thread_state_manager.clone(),
            /*state_db*/ None,
            Arc::new(GoalService::new()),
        );
        let skills_watcher = SkillsWatcher::new(thread_manager.skills_service(), outgoing.clone());
        let processor = ThreadRequestProcessor::new(
            auth_manager,
            thread_manager.clone(),
            outgoing,
            Arg0DispatchPaths::default(),
            config.clone(),
            ConfigManager::new(
                temp_dir.path().to_path_buf(),
                Vec::new(),
                loader_overrides,
                /*strict_config*/ false,
                CloudConfigBundleLoader::default(),
                Arg0DispatchPaths::default(),
                Arc::new(NoopThreadConfigLoader),
            ),
            thread_store,
            Arc::new(Mutex::new(HashSet::new())),
            thread_state_manager.clone(),
            ThreadWatchManager::new(),
            Arc::new(Semaphore::new(1)),
            thread_goal_processor,
            /*state_db*/ None,
            /*log_db*/ None,
            skills_watcher,
            /*initial_config_warnings*/ Vec::new(),
        );

        let new_thread = thread_manager.start_thread(config.as_ref().clone()).await?;
        let thread_id = new_thread.thread_id;
        let persisted_items = persisted_in_progress_history_items("persisted-turn", "persisted");
        store
            .append_items(AppendThreadItemsParams {
                thread_id,
                items: persisted_items.clone(),
            })
            .await?;
        {
            let state = thread_state_manager.thread_state(thread_id).await;
            state.lock().await.track_current_turn_event(
                "live-turn",
                &EventMsg::TurnStarted(codex_protocol::protocol::TurnStartedEvent {
                    turn_id: "live-turn".to_string(),
                    trace_id: None,
                    started_at: None,
                    model_context_window: None,
                    collaboration_mode_kind: Default::default(),
                }),
            );
        }

        let read_response = processor
            .thread_read(ThreadReadParams {
                thread_id: thread_id.to_string(),
                include_turns: true,
            })
            .await
            .expect("thread/read should include turns for materialized loaded thread");
        let Some(ClientResponsePayload::ThreadRead(read_response)) = read_response else {
            panic!("thread/read should return a thread read response");
        };

        assert_eq!(
            turn_user_texts(&read_response.thread.turns),
            vec!["persisted"]
        );
        assert!(
            read_response
                .thread
                .turns
                .iter()
                .all(|turn| turn.id != "live-turn"),
            "thread/read should not merge the active turn snapshot"
        );

        let loaded_status = processor
            .thread_watch_manager
            .loaded_status_for_thread(&thread_id.to_string())
            .await;
        let state = thread_state_manager.thread_state(thread_id).await;
        let active_turn = state.lock().await.active_turn_snapshot();
        let expected_turns =
            super::super::thread_processor::reconstruct_thread_turns_for_turns_list(
                &persisted_items,
                loaded_status,
                /*has_live_running_thread*/ false,
                active_turn,
            );

        let cut = crate::thread_projection_cut::ProjectionSnapshotCut {
            generation: processor
                .outgoing
                .thread_projection_manager()
                .capture_current_generation(thread_id)
                .await,
            head_commit_id: None,
        };
        let snapshot = processor
            .read_thread_projection_snapshot_at_cut(thread_id, cut)
            .await
            .unwrap_or_else(|_| panic!("projection snapshot should include the active turn"));
        let thread = snapshot.thread;

        assert_eq!(thread.turns, expected_turns);
        let persisted_turn = thread
            .turns
            .iter()
            .find(|turn| turn.id == "persisted-turn")
            .expect("projection snapshot should preserve persisted turn");
        assert_eq!(
            persisted_turn.items,
            vec![ThreadItem::UserMessage {
                id: "item-1".to_string(),
                client_id: None,
                content: vec![
                    V2UserInput::Text {
                        text: "persisted".to_string(),
                        text_elements: Vec::new(),
                    },
                    V2UserInput::Image {
                        url: "https://example.com/projection.png".to_string(),
                        detail: Some(ImageDetail::Original),
                    },
                    V2UserInput::LocalImage {
                        path: PathBuf::from("/tmp/projection-local.png"),
                        detail: Some(ImageDetail::Original),
                    },
                ],
            }]
        );

        new_thread.thread.shutdown_and_wait().await?;
        let _ = thread_manager.remove_thread(&thread_id).await;
        Ok(())
    }

    #[tokio::test]
    async fn projection_snapshot_at_cut_includes_full_persisted_history() -> Result<()> {
        let fixture = projection_snapshot_fixture_with_history(vec![
            RolloutItem::EventMsg(EventMsg::TurnStarted(
                codex_protocol::protocol::TurnStartedEvent {
                    turn_id: "turn-visible".to_string(),
                    trace_id: None,
                    started_at: Some(1),
                    model_context_window: None,
                    collaboration_mode_kind: Default::default(),
                },
            )),
            RolloutItem::EventMsg(EventMsg::TurnStarted(
                codex_protocol::protocol::TurnStartedEvent {
                    turn_id: "turn-pending".to_string(),
                    trace_id: None,
                    started_at: Some(2),
                    model_context_window: None,
                    collaboration_mode_kind: Default::default(),
                },
            )),
        ])
        .await?;

        let cut = crate::thread_projection_cut::ProjectionSnapshotCut {
            generation: fixture
                .processor
                .outgoing
                .thread_projection_manager()
                .capture_current_generation(fixture.thread_id)
                .await,
            head_commit_id: None,
        };
        let snapshot = fixture
            .processor
            .read_thread_projection_snapshot_at_cut(fixture.thread_id, cut)
            .await
            .unwrap_or_else(|_| {
                panic!("projection snapshot at cut should read materialized history")
            });

        let turn_ids = snapshot
            .thread
            .turns
            .iter()
            .map(|turn| turn.id.as_str())
            .collect::<Vec<_>>();
        assert_eq!(turn_ids, vec!["turn-visible", "turn-pending"]);
        assert_eq!(snapshot.head_commit_id, None);
        Ok(())
    }

    #[tokio::test]
    async fn projection_snapshot_preserves_final_after_physical_only_history_item() -> Result<()> {
        let fixture = projection_snapshot_fixture_with_history(vec![
            RolloutItem::EventMsg(EventMsg::TurnStarted(
                codex_protocol::protocol::TurnStartedEvent {
                    turn_id: "turn-final".to_string(),
                    trace_id: None,
                    started_at: Some(1),
                    model_context_window: None,
                    collaboration_mode_kind: Default::default(),
                },
            )),
            RolloutItem::EventMsg(EventMsg::ContextCompacted(
                codex_protocol::protocol::ContextCompactedEvent,
            )),
            RolloutItem::EventMsg(EventMsg::AgentMessage(
                codex_protocol::protocol::AgentMessageEvent {
                    message: "final answer".to_string(),
                    phase: None,
                    memory_citation: None,
                },
            )),
            RolloutItem::EventMsg(EventMsg::TurnComplete(
                codex_protocol::protocol::TurnCompleteEvent {
                    turn_id: "turn-final".to_string(),
                    last_agent_message: Some("final answer".to_string()),
                    completed_at: Some(2),
                    duration_ms: None,
                    time_to_first_token_ms: None,
                },
            )),
        ])
        .await?;

        let cut = crate::thread_projection_cut::ProjectionSnapshotCut {
            generation: fixture
                .processor
                .outgoing
                .thread_projection_manager()
                .capture_current_generation(fixture.thread_id)
                .await,
            head_commit_id: None,
        };
        let snapshot = fixture
            .processor
            .read_thread_projection_snapshot_at_cut(fixture.thread_id, cut)
            .await
            .unwrap_or_else(|_| panic!("projection snapshot should preserve final answer"));

        assert_eq!(snapshot.thread.turns.len(), 1);
        let turn = &snapshot.thread.turns[0];
        assert_eq!(turn.id, "turn-final");
        assert_eq!(turn.status, TurnStatus::Completed);
        assert!(turn.items.iter().any(|item| {
            matches!(
                item,
                ThreadItem::AgentMessage { text, .. } if text == "final answer"
            )
        }));
        assert_eq!(snapshot.head_commit_id, None);
        Ok(())
    }

    struct ProjectionSnapshotFixture {
        processor: ThreadRequestProcessor,
        thread_id: ThreadId,
        _temp_dir: TempDir,
        _store_guard: InMemoryThreadStoreId,
    }

    async fn projection_snapshot_fixture_with_history(
        history_items: Vec<RolloutItem>,
    ) -> Result<ProjectionSnapshotFixture> {
        let temp_dir = TempDir::new()?;
        let store_id = uuid::Uuid::new_v4().to_string();
        write_in_memory_thread_store_config(temp_dir.path(), &store_id)?;
        let store = InMemoryThreadStore::for_id(store_id.clone());
        let store_guard = InMemoryThreadStoreId { store_id };
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
            Arc::new(codex_core::test_support::EmptyUserInstructionsProvider),
            /*analytics_events_client*/ None,
            thread_store.clone(),
            /*state_db*/ None,
            uuid::Uuid::new_v4().to_string(),
            /*attestation_provider*/ None,
            /*external_time_provider*/ None,
        ));
        let (outgoing_tx, _outgoing_rx) = tokio::sync::mpsc::channel(8);
        let outgoing = Arc::new(OutgoingMessageSender::new(
            outgoing_tx,
            codex_analytics::AnalyticsEventsClient::disabled(),
        ));
        let thread_state_manager = ThreadStateManager::new();
        let thread_goal_processor = ThreadGoalRequestProcessor::new(
            thread_manager.clone(),
            outgoing.clone(),
            config.clone(),
            thread_state_manager.clone(),
            /*state_db*/ None,
            Arc::new(GoalService::new()),
        );
        let skills_watcher = SkillsWatcher::new(thread_manager.skills_service(), outgoing.clone());
        let processor = ThreadRequestProcessor::new(
            auth_manager,
            thread_manager.clone(),
            outgoing,
            Arg0DispatchPaths::default(),
            config.clone(),
            ConfigManager::new(
                temp_dir.path().to_path_buf(),
                Vec::new(),
                loader_overrides,
                /*strict_config*/ false,
                CloudConfigBundleLoader::default(),
                Arg0DispatchPaths::default(),
                Arc::new(NoopThreadConfigLoader),
            ),
            thread_store,
            Arc::new(Mutex::new(HashSet::new())),
            thread_state_manager,
            ThreadWatchManager::new(),
            Arc::new(Semaphore::new(1)),
            thread_goal_processor,
            /*state_db*/ None,
            /*log_db*/ None,
            skills_watcher,
            /*initial_config_warnings*/ Vec::new(),
        );

        let thread_id = thread_manager
            .start_thread(config.as_ref().clone())
            .await?
            .thread_id;
        store
            .append_items(AppendThreadItemsParams {
                thread_id,
                items: history_items,
            })
            .await?;

        Ok(ProjectionSnapshotFixture {
            processor,
            thread_id,
            _temp_dir: temp_dir,
            _store_guard: store_guard,
        })
    }

    fn persisted_in_progress_history_items(turn_id: &str, message: &str) -> Vec<RolloutItem> {
        vec![
            RolloutItem::EventMsg(EventMsg::TurnStarted(
                codex_protocol::protocol::TurnStartedEvent {
                    turn_id: turn_id.to_string(),
                    trace_id: None,
                    started_at: None,
                    model_context_window: None,
                    collaboration_mode_kind: Default::default(),
                },
            )),
            RolloutItem::EventMsg(EventMsg::UserMessage(
                codex_protocol::protocol::UserMessageEvent {
                    client_id: None,
                    message: message.to_string(),
                    images: Some(vec!["https://example.com/projection.png".to_string()]),
                    image_details: vec![Some(ImageDetail::Original)],
                    local_images: vec![PathBuf::from("/tmp/projection-local.png")],
                    local_image_details: vec![Some(ImageDetail::Original)],
                    text_elements: Vec::new(),
                },
            )),
        ]
    }

    fn turn_user_texts(turns: &[Turn]) -> Vec<&str> {
        turns
            .iter()
            .filter_map(|turn| match turn.items.first()? {
                ThreadItem::UserMessage { content, .. } => match content.first()? {
                    V2UserInput::Text { text, .. } => Some(text.as_str()),
                    V2UserInput::Image { .. }
                    | V2UserInput::LocalImage { .. }
                    | V2UserInput::Skill { .. }
                    | V2UserInput::Mention { .. } => None,
                },
                _ => None,
            })
            .collect()
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
}
