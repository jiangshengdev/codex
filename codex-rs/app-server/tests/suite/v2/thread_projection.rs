use std::collections::BTreeMap;
use std::time::Duration;

use anyhow::Result;
use app_test_support::TestAppServer;
use app_test_support::create_final_assistant_message_sse_response;
use app_test_support::create_mock_responses_server_sequence_unchecked;
use app_test_support::create_streaming_assistant_message_sse_response;
use app_test_support::create_streaming_reasoning_sse_response;
use app_test_support::to_response;
use app_test_support::write_mock_responses_config_toml;
use codex_app_server_protocol::JSONRPCNotification;
use codex_app_server_protocol::JSONRPCResponse;
use codex_app_server_protocol::RequestId;
use codex_app_server_protocol::ServerRequest;
use codex_app_server_protocol::ThreadHistoryMode;
use codex_app_server_protocol::ThreadItem;
use codex_app_server_protocol::ThreadProjectionAttachParams;
use codex_app_server_protocol::ThreadProjectionAttachResponse;
use codex_app_server_protocol::ThreadProjectionDelta;
use codex_app_server_protocol::ThreadProjectionDeltaNotification;
use codex_app_server_protocol::ThreadProjectionDetachParams;
use codex_app_server_protocol::ThreadProjectionDetachResponse;
use codex_app_server_protocol::ThreadProjectionDetachStatus;
use codex_app_server_protocol::ThreadProjectionEvent;
use codex_app_server_protocol::ThreadProjectionEventNotification;
use codex_app_server_protocol::ThreadStartParams;
use codex_app_server_protocol::ThreadStartResponse;
use codex_app_server_protocol::TurnCompletedNotification;
use codex_app_server_protocol::TurnItemsView;
use codex_app_server_protocol::TurnStartParams;
use codex_app_server_protocol::TurnStartResponse;
use codex_app_server_protocol::TurnStatus;
use codex_app_server_protocol::UserInput;
use codex_protocol::config_types::CollaborationMode;
use codex_protocol::config_types::ModeKind;
use codex_protocol::config_types::Settings;
use codex_protocol::openai_models::ReasoningEffort;
use core_test_support::responses;
use pretty_assertions::assert_eq;
use tempfile::TempDir;
use tokio::time::timeout;

const DEFAULT_READ_TIMEOUT: Duration = Duration::from_secs(10);

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn thread_projection_attach_returns_snapshot_and_detach_status() -> Result<()> {
    let codex_home = TempDir::new()?;
    let server = create_mock_responses_server_sequence_unchecked(Vec::new()).await;
    write_mock_responses_config_toml(
        codex_home.path(),
        &server.uri(),
        &BTreeMap::new(),
        /*auto_compact_limit*/ 1024,
        /*requires_openai_auth*/ None,
        "mock_provider",
        "compact",
    )?;

    let mut mcp = TestAppServer::builder()
        .with_codex_home(codex_home.path())
        .without_auto_env()
        .build()
        .await?;
    timeout(DEFAULT_READ_TIMEOUT, mcp.initialize()).await??;
    let thread = start_thread(&mut mcp).await?;

    let detach_without_attach_id = mcp
        .send_thread_projection_detach_request(ThreadProjectionDetachParams {
            thread_id: thread.id.clone(),
        })
        .await?;
    let detach_without_attach_response: JSONRPCResponse = timeout(
        DEFAULT_READ_TIMEOUT,
        mcp.read_stream_until_response_message(RequestId::Integer(detach_without_attach_id)),
    )
    .await??;
    let detach_without_attach: ThreadProjectionDetachResponse =
        to_response(detach_without_attach_response)?;
    assert_eq!(
        ThreadProjectionDetachStatus::NotSubscribed,
        detach_without_attach.status
    );

    let attach_id = mcp
        .send_thread_projection_attach_request(ThreadProjectionAttachParams {
            thread_id: thread.id.clone(),
        })
        .await?;
    let attach_response: JSONRPCResponse = timeout(
        DEFAULT_READ_TIMEOUT,
        mcp.read_stream_until_response_message(RequestId::Integer(attach_id)),
    )
    .await??;
    let attach: ThreadProjectionAttachResponse = to_response(attach_response)?;
    assert!(!attach.subscription_id.is_empty());
    assert_eq!(thread.id, attach.snapshot.thread.id);
    assert_eq!(None, attach.snapshot.head_commit_id);

    let detach_id = mcp
        .send_thread_projection_detach_request(ThreadProjectionDetachParams {
            thread_id: thread.id,
        })
        .await?;
    let detach_response: JSONRPCResponse = timeout(
        DEFAULT_READ_TIMEOUT,
        mcp.read_stream_until_response_message(RequestId::Integer(detach_id)),
    )
    .await??;
    let detach: ThreadProjectionDetachResponse = to_response(detach_response)?;
    assert_eq!(ThreadProjectionDetachStatus::Detached, detach.status);
    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn thread_projection_attach_includes_token_usage_baseline() -> Result<()> {
    let codex_home = TempDir::new()?;
    let server = create_mock_responses_server_sequence_unchecked(vec![token_usage_sse_response(
        "response-1",
        "message-1",
        "done",
        120,
    )])
    .await;
    write_mock_responses_config_toml(
        codex_home.path(),
        &server.uri(),
        &BTreeMap::new(),
        /*auto_compact_limit*/ 1024,
        /*requires_openai_auth*/ None,
        "mock_provider",
        "compact",
    )?;

    let mut mcp = TestAppServer::builder()
        .with_codex_home(codex_home.path())
        .build()
        .await?;
    timeout(DEFAULT_READ_TIMEOUT, mcp.initialize()).await??;
    let thread = start_thread_with_auto_env(&mut mcp).await?;

    let initial_attach = attach_projection(&mut mcp, &thread.id).await?;
    assert_eq!(None, initial_attach.snapshot.token_usage);

    send_turn(&mut mcp, &thread.id, "run once").await?;
    let completed: TurnCompletedNotification = timeout(
        DEFAULT_READ_TIMEOUT,
        mcp.read_notification("turn/completed"),
    )
    .await??;
    assert_eq!(TurnStatus::Completed, completed.turn.status);

    let reattach = attach_projection(&mut mcp, &thread.id).await?;
    let token_usage = reattach
        .snapshot
        .token_usage
        .expect("completed turn should establish token usage baseline");
    assert_eq!(120, token_usage.last.total_tokens);
    assert_eq!(120, token_usage.total.total_tokens);
    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn thread_projection_token_usage_event_advances_commit_chain() -> Result<()> {
    let codex_home = TempDir::new()?;
    let request_user_input_arguments = serde_json::to_string(&serde_json::json!({
        "questions": [{
            "id": "confirm_path",
            "header": "Confirm",
            "question": "Proceed with the plan?",
            "options": [{
                "label": "Yes (Recommended)",
                "description": "Continue the current plan."
            }, {
                "label": "No",
                "description": "Stop and revisit the approach."
            }]
        }]
    }))?;
    let server = create_mock_responses_server_sequence_unchecked(vec![
        responses::sse(vec![
            responses::ev_response_created("response-1"),
            responses::ev_function_call(
                "request-user-input-1",
                "request_user_input",
                &request_user_input_arguments,
            ),
            responses::ev_completed_with_tokens("response-1", 120),
        ]),
        token_usage_sse_response("response-2", "message-2", "second done", 80),
    ])
    .await;
    write_mock_responses_config_toml(
        codex_home.path(),
        &server.uri(),
        &BTreeMap::new(),
        /*auto_compact_limit*/ 1024,
        /*requires_openai_auth*/ None,
        "mock_provider",
        "compact",
    )?;

    let mut mcp = TestAppServer::builder()
        .with_codex_home(codex_home.path())
        .build()
        .await?;
    timeout(DEFAULT_READ_TIMEOUT, mcp.initialize()).await??;
    let thread = start_thread_with_auto_env(&mut mcp).await?;

    let turn_id = mcp
        .send_turn_start_request(TurnStartParams {
            thread_id: thread.id.clone(),
            input: vec![UserInput::Text {
                text: "ask before continuing".to_string(),
                text_elements: Vec::new(),
            }],
            model: Some("mock-model".to_string()),
            effort: Some(ReasoningEffort::Medium),
            collaboration_mode: Some(CollaborationMode {
                mode: ModeKind::Plan,
                settings: Settings {
                    model: "mock-model".to_string(),
                    reasoning_effort: Some(ReasoningEffort::Medium),
                    developer_instructions: None,
                },
            }),
            ..Default::default()
        })
        .await?;
    let turn_response: TurnStartResponse = to_response(
        timeout(
            DEFAULT_READ_TIMEOUT,
            mcp.read_stream_until_response_message(RequestId::Integer(turn_id)),
        )
        .await??,
    )?;

    let server_request = timeout(
        DEFAULT_READ_TIMEOUT,
        mcp.read_stream_until_request_message(),
    )
    .await??;
    let ServerRequest::ToolRequestUserInput { request_id, params } = server_request else {
        anyhow::bail!("expected ToolRequestUserInput, got {server_request:?}");
    };
    assert_eq!(thread.id, params.thread_id);
    assert_eq!(turn_response.turn.id, params.turn_id);
    assert_eq!("request-user-input-1", params.item_id);
    assert!(params.is_blocking);

    let attach = attach_projection(&mut mcp, &thread.id).await?;
    let snapshot_token_usage = attach
        .snapshot
        .token_usage
        .clone()
        .expect("completed response should be visible in the attach snapshot");
    assert_eq!(120, snapshot_token_usage.last.total_tokens);
    assert_eq!(120, snapshot_token_usage.total.total_tokens);

    mcp.send_response(
        request_id,
        serde_json::json!({
            "answers": {
                "confirm_path": { "answers": ["yes"] }
            }
        }),
    )
    .await?;

    let usage_event = read_projection_event(&mut mcp).await?;
    assert_eq!(thread.id, usage_event.thread_id);
    assert_eq!(attach.subscription_id, usage_event.subscription_id);
    assert_eq!(attach.snapshot.head_commit_id, usage_event.parent_commit_id);
    let ThreadProjectionEvent::TokenUsageUpdated { notification } = &usage_event.event else {
        anyhow::bail!("expected TokenUsageUpdated, got {:?}", usage_event.event);
    };
    assert_eq!(snapshot_token_usage, notification.token_usage);

    let next_event = read_projection_event(&mut mcp).await?;
    assert_eq!(thread.id, next_event.thread_id);
    assert_eq!(attach.subscription_id, next_event.subscription_id);
    assert_eq!(Some(usage_event.commit_id), next_event.parent_commit_id);
    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn thread_projection_attach_returns_empty_paginated_live_thread() -> Result<()> {
    let codex_home = TempDir::new()?;
    let server = create_mock_responses_server_sequence_unchecked(Vec::new()).await;
    write_mock_responses_config_toml(
        codex_home.path(),
        &server.uri(),
        &BTreeMap::new(),
        /*auto_compact_limit*/ 1024,
        /*requires_openai_auth*/ None,
        "mock_provider",
        "compact",
    )?;

    let mut mcp = TestAppServer::builder()
        .with_codex_home(codex_home.path())
        .without_auto_env()
        .build()
        .await?;
    timeout(DEFAULT_READ_TIMEOUT, mcp.initialize()).await??;

    let start_id = mcp
        .send_thread_start_request(ThreadStartParams {
            model: Some("mock-model".to_string()),
            history_mode: Some(ThreadHistoryMode::Paginated),
            ..Default::default()
        })
        .await?;
    let ThreadStartResponse { thread, .. } = to_response(
        timeout(
            DEFAULT_READ_TIMEOUT,
            mcp.read_stream_until_response_message(RequestId::Integer(start_id)),
        )
        .await??,
    )?;
    let rollout_path = thread.path.clone().expect("thread path");
    assert!(
        !rollout_path.exists(),
        "fresh paginated thread rollout should not be materialized yet"
    );

    let attach_id = mcp
        .send_thread_projection_attach_request(ThreadProjectionAttachParams {
            thread_id: thread.id.clone(),
        })
        .await?;
    let attach: ThreadProjectionAttachResponse = to_response(
        timeout(
            DEFAULT_READ_TIMEOUT,
            mcp.read_stream_until_response_message(RequestId::Integer(attach_id)),
        )
        .await??,
    )?;

    assert!(
        !rollout_path.exists(),
        "projection attach should not materialize a paginated thread rollout"
    );
    assert_eq!(thread.id, attach.snapshot.thread.id);
    assert_eq!(
        ThreadHistoryMode::Paginated,
        attach.snapshot.thread.history_mode
    );
    assert!(attach.snapshot.thread.turns.is_empty());
    assert!(attach.snapshot.thread.preview.is_empty());
    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn thread_projection_attach_returns_paginated_thread_history() -> Result<()> {
    let codex_home = TempDir::new()?;
    let server = create_mock_responses_server_sequence_unchecked(vec![
        create_final_assistant_message_sse_response("paginated done")?,
    ])
    .await;
    write_mock_responses_config_toml(
        codex_home.path(),
        &server.uri(),
        &BTreeMap::new(),
        /*auto_compact_limit*/ 1024,
        /*requires_openai_auth*/ None,
        "mock_provider",
        "compact",
    )?;

    let mut mcp = TestAppServer::builder()
        .with_codex_home(codex_home.path())
        .without_auto_env()
        .build()
        .await?;
    timeout(DEFAULT_READ_TIMEOUT, mcp.initialize()).await??;

    let start_id = mcp
        .send_thread_start_request(ThreadStartParams {
            model: Some("mock-model".to_string()),
            history_mode: Some(ThreadHistoryMode::Paginated),
            ..Default::default()
        })
        .await?;
    let ThreadStartResponse { thread, .. } = to_response(
        timeout(
            DEFAULT_READ_TIMEOUT,
            mcp.read_stream_until_response_message(RequestId::Integer(start_id)),
        )
        .await??,
    )?;
    assert_eq!(ThreadHistoryMode::Paginated, thread.history_mode);

    let turn_id = mcp
        .send_turn_start_request(TurnStartParams {
            thread_id: thread.id.clone(),
            input: vec![UserInput::Text {
                text: "paginated prompt".to_string(),
                text_elements: Vec::new(),
            }],
            model: Some("mock-model".to_string()),
            ..Default::default()
        })
        .await?;
    let _turn_response: TurnStartResponse = to_response(
        timeout(
            DEFAULT_READ_TIMEOUT,
            mcp.read_stream_until_response_message(RequestId::Integer(turn_id)),
        )
        .await??,
    )?;
    let completed: TurnCompletedNotification = timeout(
        DEFAULT_READ_TIMEOUT,
        mcp.read_notification("turn/completed"),
    )
    .await??;
    assert_eq!(TurnStatus::Completed, completed.turn.status);

    let attach_id = mcp
        .send_thread_projection_attach_request(ThreadProjectionAttachParams {
            thread_id: thread.id.clone(),
        })
        .await?;
    let attach: ThreadProjectionAttachResponse = to_response(
        timeout(
            DEFAULT_READ_TIMEOUT,
            mcp.read_stream_until_response_message(RequestId::Integer(attach_id)),
        )
        .await??,
    )?;

    assert_eq!(thread.id, attach.snapshot.thread.id);
    assert_eq!(
        ThreadHistoryMode::Paginated,
        attach.snapshot.thread.history_mode
    );
    assert_eq!("paginated prompt", attach.snapshot.thread.preview);
    let [snapshot_turn] = attach.snapshot.thread.turns.as_slice() else {
        anyhow::bail!(
            "expected one materialized paginated turn, got {:?}",
            attach.snapshot.thread.turns
        );
    };
    assert_eq!(completed.turn.id, snapshot_turn.id);
    assert_eq!(TurnStatus::Completed, snapshot_turn.status);
    assert_eq!(TurnItemsView::Full, snapshot_turn.items_view);
    assert!(matches!(
        snapshot_turn.items.as_slice(),
        [
            ThreadItem::UserMessage { content, .. },
            ThreadItem::AgentMessage { text, .. },
        ] if content == &vec![UserInput::Text {
            text: "paginated prompt".to_string(),
            text_elements: Vec::new(),
        }] && text == "paginated done"
    ));
    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn thread_projection_emits_commit_chain() -> Result<()> {
    let codex_home = TempDir::new()?;
    let server = create_mock_responses_server_sequence_unchecked(vec![
        create_final_assistant_message_sse_response("done")?,
    ])
    .await;
    write_mock_responses_config_toml(
        codex_home.path(),
        &server.uri(),
        &BTreeMap::new(),
        /*auto_compact_limit*/ 1024,
        /*requires_openai_auth*/ None,
        "mock_provider",
        "compact",
    )?;

    let mut mcp = TestAppServer::builder()
        .with_codex_home(codex_home.path())
        .without_auto_env()
        .build()
        .await?;
    timeout(DEFAULT_READ_TIMEOUT, mcp.initialize()).await??;
    let thread = start_thread(&mut mcp).await?;

    let attach_id = mcp
        .send_thread_projection_attach_request(ThreadProjectionAttachParams {
            thread_id: thread.id.clone(),
        })
        .await?;
    let attach_response: JSONRPCResponse = timeout(
        DEFAULT_READ_TIMEOUT,
        mcp.read_stream_until_response_message(RequestId::Integer(attach_id)),
    )
    .await??;
    let attach: ThreadProjectionAttachResponse = to_response(attach_response)?;

    let turn_id = mcp
        .send_turn_start_request(TurnStartParams {
            thread_id: thread.id.clone(),
            input: vec![UserInput::Text {
                text: "run once".to_string(),
                text_elements: Vec::new(),
            }],
            model: Some("mock-model".to_string()),
            ..Default::default()
        })
        .await?;
    let _turn_response: TurnStartResponse = to_response(
        timeout(
            DEFAULT_READ_TIMEOUT,
            mcp.read_stream_until_response_message(RequestId::Integer(turn_id)),
        )
        .await??,
    )?;

    let first = read_projection_event(&mut mcp).await?;
    assert_eq!(thread.id, first.thread_id);
    assert_eq!(attach.subscription_id, first.subscription_id);
    assert_eq!(attach.snapshot.head_commit_id, first.parent_commit_id);

    let second = read_projection_event(&mut mcp).await?;
    assert_eq!(thread.id, second.thread_id);
    assert_eq!(attach.subscription_id, second.subscription_id);
    assert_eq!(Some(first.commit_id), second.parent_commit_id);
    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn thread_projection_emits_transient_agent_message_delta_without_advancing_head() -> Result<()>
{
    let codex_home = TempDir::new()?;
    let server = create_mock_responses_server_sequence_unchecked(vec![
        create_streaming_assistant_message_sse_response("msg-1", "streamed ", "streamed done")?,
    ])
    .await;
    write_mock_responses_config_toml(
        codex_home.path(),
        &server.uri(),
        &BTreeMap::new(),
        /*auto_compact_limit*/ 1024,
        /*requires_openai_auth*/ None,
        "mock_provider",
        "compact",
    )?;

    let mut mcp = TestAppServer::builder()
        .with_codex_home(codex_home.path())
        .without_auto_env()
        .build()
        .await?;
    timeout(DEFAULT_READ_TIMEOUT, mcp.initialize()).await??;
    let thread = start_thread(&mut mcp).await?;

    let attach_id = mcp
        .send_thread_projection_attach_request(ThreadProjectionAttachParams {
            thread_id: thread.id.clone(),
        })
        .await?;
    let attach_response: JSONRPCResponse = timeout(
        DEFAULT_READ_TIMEOUT,
        mcp.read_stream_until_response_message(RequestId::Integer(attach_id)),
    )
    .await??;
    let attach: ThreadProjectionAttachResponse = to_response(attach_response)?;

    let turn_id = mcp
        .send_turn_start_request(TurnStartParams {
            thread_id: thread.id.clone(),
            input: vec![UserInput::Text {
                text: "stream once".to_string(),
                text_elements: Vec::new(),
            }],
            model: Some("mock-model".to_string()),
            ..Default::default()
        })
        .await?;
    let _turn_response: TurnStartResponse = to_response(
        timeout(
            DEFAULT_READ_TIMEOUT,
            mcp.read_stream_until_response_message(RequestId::Integer(turn_id)),
        )
        .await??,
    )?;

    let item_started = read_projection_event_until_item_started(
        &mut mcp,
        &thread.id,
        &attach.subscription_id,
        "msg-1",
    )
    .await?;
    assert_eq!(thread.id, item_started.thread_id);
    assert_eq!(attach.subscription_id, item_started.subscription_id);
    let ThreadProjectionEvent::ItemStarted {
        notification: started,
    } = &item_started.event
    else {
        anyhow::bail!("expected ItemStarted, got {:?}", item_started.event);
    };
    assert_eq!("msg-1", started.item.id());

    let delta = read_projection_delta(&mut mcp).await?;
    assert_eq!(thread.id, delta.thread_id);
    assert_eq!(attach.subscription_id, delta.subscription_id);
    let ThreadProjectionDelta::AgentMessage { notification } = &delta.delta else {
        anyhow::bail!("expected AgentMessage delta, got {:?}", delta.delta);
    };
    assert_eq!(thread.id, notification.thread_id);
    assert_eq!("msg-1", notification.item_id);
    assert_eq!("streamed ", notification.delta);

    let item_completed =
        projection_event_from_notification(read_next_projection_notification(&mut mcp).await?)?;
    assert_eq!(thread.id, item_completed.thread_id);
    assert_eq!(attach.subscription_id, item_completed.subscription_id);
    let ThreadProjectionEvent::ItemCompleted {
        notification: completed,
    } = &item_completed.event
    else {
        anyhow::bail!("expected ItemCompleted, got {:?}", item_completed.event);
    };
    assert_eq!("msg-1", completed.item.id());
    assert_eq!(
        Some(item_started.commit_id),
        item_completed.parent_commit_id
    );
    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn thread_projection_emits_reasoning_lifecycle_and_deltas() -> Result<()> {
    let codex_home = TempDir::new()?;
    let server = create_mock_responses_server_sequence_unchecked(vec![
        create_streaming_reasoning_sse_response(
            "reasoning-1",
            "summary delta",
            "raw delta",
            "final summary",
            "final raw",
        )?,
    ])
    .await;
    write_mock_responses_config_toml(
        codex_home.path(),
        &server.uri(),
        &BTreeMap::new(),
        /*auto_compact_limit*/ 1024,
        /*requires_openai_auth*/ None,
        "mock_provider",
        "compact",
    )?;

    let mut mcp = TestAppServer::builder()
        .with_codex_home(codex_home.path())
        .without_auto_env()
        .build()
        .await?;
    timeout(DEFAULT_READ_TIMEOUT, mcp.initialize()).await??;
    let thread = start_thread(&mut mcp).await?;

    let attach_id = mcp
        .send_thread_projection_attach_request(ThreadProjectionAttachParams {
            thread_id: thread.id.clone(),
        })
        .await?;
    let attach_response: JSONRPCResponse = timeout(
        DEFAULT_READ_TIMEOUT,
        mcp.read_stream_until_response_message(RequestId::Integer(attach_id)),
    )
    .await??;
    let attach: ThreadProjectionAttachResponse = to_response(attach_response)?;

    let turn_id = mcp
        .send_turn_start_request(TurnStartParams {
            thread_id: thread.id.clone(),
            input: vec![UserInput::Text {
                text: "think once".to_string(),
                text_elements: Vec::new(),
            }],
            model: Some("mock-model".to_string()),
            ..Default::default()
        })
        .await?;
    let _turn_response: TurnStartResponse = to_response(
        timeout(
            DEFAULT_READ_TIMEOUT,
            mcp.read_stream_until_response_message(RequestId::Integer(turn_id)),
        )
        .await??,
    )?;

    let item_started = read_projection_event_until_item_started(
        &mut mcp,
        &thread.id,
        &attach.subscription_id,
        "reasoning-1",
    )
    .await?;
    assert_eq!(thread.id, item_started.thread_id);
    assert_eq!(attach.subscription_id, item_started.subscription_id);
    let ThreadProjectionEvent::ItemStarted {
        notification: started,
    } = &item_started.event
    else {
        anyhow::bail!("expected ItemStarted, got {:?}", item_started.event);
    };
    assert_eq!("reasoning-1", started.item.id());
    assert!(matches!(&started.item, ThreadItem::Reasoning { .. }));

    let summary_delta = read_projection_delta(&mut mcp).await?;
    assert_eq!(thread.id, summary_delta.thread_id);
    assert_eq!(attach.subscription_id, summary_delta.subscription_id);
    let ThreadProjectionDelta::ReasoningSummaryText { notification } = &summary_delta.delta else {
        anyhow::bail!(
            "expected ReasoningSummaryText delta, got {:?}",
            summary_delta.delta
        );
    };
    assert_eq!(thread.id, notification.thread_id);
    assert_eq!("reasoning-1", notification.item_id);
    assert_eq!("summary delta", notification.delta);
    assert_eq!(0, notification.summary_index);

    let summary_part_added = read_projection_delta(&mut mcp).await?;
    assert_eq!(thread.id, summary_part_added.thread_id);
    assert_eq!(attach.subscription_id, summary_part_added.subscription_id);
    let ThreadProjectionDelta::ReasoningSummaryPartAdded { notification } =
        &summary_part_added.delta
    else {
        anyhow::bail!(
            "expected ReasoningSummaryPartAdded delta, got {:?}",
            summary_part_added.delta
        );
    };
    assert_eq!(thread.id, notification.thread_id);
    assert_eq!("reasoning-1", notification.item_id);
    assert_eq!(1, notification.summary_index);

    let raw_delta = read_projection_delta(&mut mcp).await?;
    assert_eq!(thread.id, raw_delta.thread_id);
    assert_eq!(attach.subscription_id, raw_delta.subscription_id);
    let ThreadProjectionDelta::ReasoningText { notification } = &raw_delta.delta else {
        anyhow::bail!("expected ReasoningText delta, got {:?}", raw_delta.delta);
    };
    assert_eq!(thread.id, notification.thread_id);
    assert_eq!("reasoning-1", notification.item_id);
    assert_eq!("raw delta", notification.delta);
    assert_eq!(0, notification.content_index);

    let item_completed =
        projection_event_from_notification(read_next_projection_notification(&mut mcp).await?)?;
    assert_eq!(thread.id, item_completed.thread_id);
    assert_eq!(attach.subscription_id, item_completed.subscription_id);
    let ThreadProjectionEvent::ItemCompleted {
        notification: completed,
    } = &item_completed.event
    else {
        anyhow::bail!("expected ItemCompleted, got {:?}", item_completed.event);
    };
    assert_eq!("reasoning-1", completed.item.id());
    assert!(matches!(&completed.item, ThreadItem::Reasoning { .. }));
    assert_eq!(
        Some(item_started.commit_id),
        item_completed.parent_commit_id
    );
    Ok(())
}

async fn start_thread(mcp: &mut TestAppServer) -> Result<codex_app_server_protocol::Thread> {
    let start_id = mcp
        .send_thread_start_request(ThreadStartParams {
            model: Some("mock-model".to_string()),
            ..Default::default()
        })
        .await?;
    let start_response: JSONRPCResponse = timeout(
        DEFAULT_READ_TIMEOUT,
        mcp.read_stream_until_response_message(RequestId::Integer(start_id)),
    )
    .await??;
    let ThreadStartResponse { thread, .. } = to_response(start_response)?;
    Ok(thread)
}

fn token_usage_sse_response(
    response_id: &str,
    message_id: &str,
    text: &str,
    total_tokens: i64,
) -> String {
    responses::sse(vec![
        responses::ev_response_created(response_id),
        responses::ev_assistant_message(message_id, text),
        responses::ev_completed_with_tokens(response_id, total_tokens),
    ])
}

async fn start_thread_with_auto_env(
    mcp: &mut TestAppServer,
) -> Result<codex_app_server_protocol::Thread> {
    let start_id = mcp
        .send_thread_start_request_with_auto_env(ThreadStartParams {
            model: Some("mock-model".to_string()),
            ..Default::default()
        })
        .await?;
    let start_response: JSONRPCResponse = timeout(
        DEFAULT_READ_TIMEOUT,
        mcp.read_stream_until_response_message(RequestId::Integer(start_id)),
    )
    .await??;
    let ThreadStartResponse { thread, .. } = to_response(start_response)?;
    Ok(thread)
}

async fn attach_projection(
    mcp: &mut TestAppServer,
    thread_id: &str,
) -> Result<ThreadProjectionAttachResponse> {
    let attach_id = mcp
        .send_thread_projection_attach_request(ThreadProjectionAttachParams {
            thread_id: thread_id.to_string(),
        })
        .await?;
    let attach_response: JSONRPCResponse = timeout(
        DEFAULT_READ_TIMEOUT,
        mcp.read_stream_until_response_message(RequestId::Integer(attach_id)),
    )
    .await??;
    to_response(attach_response)
}

async fn send_turn(mcp: &mut TestAppServer, thread_id: &str, text: &str) -> Result<()> {
    let turn_id = mcp
        .send_turn_start_request(TurnStartParams {
            thread_id: thread_id.to_string(),
            input: vec![UserInput::Text {
                text: text.to_string(),
                text_elements: Vec::new(),
            }],
            model: Some("mock-model".to_string()),
            ..Default::default()
        })
        .await?;
    let _turn_response: TurnStartResponse = to_response(
        timeout(
            DEFAULT_READ_TIMEOUT,
            mcp.read_stream_until_response_message(RequestId::Integer(turn_id)),
        )
        .await??,
    )?;
    Ok(())
}

async fn read_projection_event(
    mcp: &mut TestAppServer,
) -> Result<ThreadProjectionEventNotification> {
    let notification: JSONRPCNotification = timeout(
        DEFAULT_READ_TIMEOUT,
        mcp.read_stream_until_notification_message("thread/projection/event"),
    )
    .await??;
    projection_event_from_notification(notification)
}

async fn read_next_projection_notification(mcp: &mut TestAppServer) -> Result<JSONRPCNotification> {
    let notification: JSONRPCNotification = timeout(
        DEFAULT_READ_TIMEOUT,
        mcp.read_stream_until_matching_notification(
            "thread/projection event or delta",
            |notification| {
                matches!(
                    notification.method.as_str(),
                    "thread/projection/event" | "thread/projection/delta"
                )
            },
        ),
    )
    .await??;
    Ok(notification)
}

async fn read_projection_event_until_item_started(
    mcp: &mut TestAppServer,
    thread_id: &str,
    subscription_id: &str,
    item_id: &str,
) -> Result<ThreadProjectionEventNotification> {
    const MAX_PRELUDE_PROJECTION_NOTIFICATIONS: usize = 8;

    for _ in 0..MAX_PRELUDE_PROJECTION_NOTIFICATIONS {
        let projection = read_next_projection_notification(mcp).await?;
        let event = projection_event_from_notification(projection)?;
        assert_eq!(thread_id, event.thread_id);
        assert_eq!(subscription_id, event.subscription_id);

        match &event.event {
            ThreadProjectionEvent::ItemStarted { notification }
                if notification.item.id() == item_id =>
            {
                return Ok(event);
            }
            ThreadProjectionEvent::ItemStarted { notification }
                if matches!(&notification.item, ThreadItem::UserMessage { .. }) => {}
            ThreadProjectionEvent::ItemStarted { notification } => {
                anyhow::bail!(
                    "unexpected projection item/event before assistant itemStarted: {:?}",
                    notification.item
                );
            }
            ThreadProjectionEvent::ItemCompleted { notification }
                if notification.item.id() == item_id =>
            {
                anyhow::bail!("assistant itemCompleted arrived before itemStarted");
            }
            ThreadProjectionEvent::ItemCompleted { notification }
                if matches!(&notification.item, ThreadItem::UserMessage { .. }) => {}
            ThreadProjectionEvent::ItemCompleted { notification } => {
                anyhow::bail!(
                    "unexpected projection item/event before assistant itemStarted: {:?}",
                    notification.item
                );
            }
            ThreadProjectionEvent::TurnStarted { .. } => {}
            other => {
                anyhow::bail!(
                    "unexpected projection item/event before assistant itemStarted: {other:?}"
                );
            }
        }
    }

    anyhow::bail!("assistant itemStarted did not arrive before projection notification limit");
}

fn projection_event_from_notification(
    notification: JSONRPCNotification,
) -> Result<ThreadProjectionEventNotification> {
    if notification.method != "thread/projection/event" {
        anyhow::bail!(
            "expected thread/projection/event, got {}",
            notification.method
        );
    }
    let Some(params) = notification.params else {
        anyhow::bail!("thread/projection/event notification missing params");
    };
    Ok(serde_json::from_value(params)?)
}

async fn read_projection_delta(
    mcp: &mut TestAppServer,
) -> Result<ThreadProjectionDeltaNotification> {
    let notification = read_next_projection_notification(mcp).await?;
    projection_delta_from_notification(notification)
}

fn projection_delta_from_notification(
    notification: JSONRPCNotification,
) -> Result<ThreadProjectionDeltaNotification> {
    if notification.method != "thread/projection/delta" {
        anyhow::bail!(
            "expected thread/projection/delta, got {}",
            notification.method
        );
    }
    let Some(params) = notification.params else {
        anyhow::bail!("thread/projection/delta notification missing params");
    };
    Ok(serde_json::from_value(params)?)
}
