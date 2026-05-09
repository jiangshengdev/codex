use super::thread_processor::ThreadReadViewError;
use super::thread_processor::thread_read_view_error;
use super::*;
use crate::thread_projection::ProjectionDetachResult;
use codex_app_server_protocol::ThreadProjectionAttachParams;
use codex_app_server_protocol::ThreadProjectionDetachParams;
use codex_app_server_protocol::ThreadProjectionDetachResponse;
use codex_app_server_protocol::ThreadProjectionDetachStatus;

impl ThreadRequestProcessor {
    pub(crate) async fn thread_projection_attach(
        &self,
        request_id: &ConnectionRequestId,
        params: ThreadProjectionAttachParams,
    ) -> Result<Option<ClientResponsePayload>, JSONRPCErrorError> {
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
            .try_thread_state_for_live_connection(thread_id, request_id.connection_id)
            .await
        else {
            tracing::debug!(
                thread_id = %thread_id,
                connection_id = ?request_id.connection_id,
                "skipping thread projection attach for closed connection"
            );
            return Ok(None);
        };

        self.ensure_listener_task_running(thread_id, thread, thread_state.clone())
            .await?;

        let snapshot_processor = self.clone();
        let snapshot = Box::pin(async move {
            snapshot_processor
                .read_thread_projection_snapshot(thread_id)
                .await
                .map_err(thread_read_view_error)
        });

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
                snapshot,
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
        Ok(None)
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
                ProjectionDetachResult::NotSubscribed | ProjectionDetachResult::NotLoaded => {
                    ThreadProjectionDetachStatus::NotSubscribed
                }
            }
        };
        Ok(Some(ThreadProjectionDetachResponse { status }.into()))
    }

    pub(super) async fn read_thread_projection_snapshot(
        &self,
        thread_id: ThreadId,
    ) -> Result<Thread, ThreadReadViewError> {
        let mut thread = match self
            .read_thread_view(thread_id, /*include_turns*/ true)
            .await
        {
            Ok(thread) => thread,
            Err(ThreadReadViewError::InvalidRequest(message))
                if message
                    == format!(
                        "thread {thread_id} is not materialized yet; includeTurns is unavailable before first user message"
                    ) =>
            {
                self.read_thread_view(thread_id, /*include_turns*/ false)
                    .await?
            }
            Err(err) => return Err(err),
        };

        let thread_state = self.thread_state_manager.thread_state(thread_id).await;
        let active_turn = thread_state.lock().await.active_turn_snapshot();
        let has_live_in_progress_turn = active_turn
            .as_ref()
            .is_some_and(|turn| matches!(turn.status, TurnStatus::InProgress));
        if let Some(active_turn) = active_turn {
            merge_turn_history_with_active_turn(&mut thread.turns, active_turn);
        }
        if has_live_in_progress_turn {
            let thread_status = self
                .thread_watch_manager
                .loaded_status_for_thread(&thread.id)
                .await;
            set_thread_status_and_interrupt_stale_turns(
                &mut thread,
                thread_status,
                has_live_in_progress_turn,
            );
        }
        Ok(thread)
    }
}
