use std::collections::BTreeMap;
use std::time::Duration;

use anyhow::Result;
use app_test_support::TestAppServer as McpProcess;
use app_test_support::create_final_assistant_message_sse_response;
use app_test_support::create_mock_responses_server_sequence_unchecked;
use app_test_support::create_streaming_assistant_message_sse_response;
use app_test_support::create_streaming_reasoning_sse_response;
use app_test_support::to_response;
use app_test_support::write_mock_responses_config_toml;
use codex_app_server_protocol::JSONRPCNotification;
use codex_app_server_protocol::JSONRPCResponse;
use codex_app_server_protocol::RequestId;
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
use codex_app_server_protocol::TurnStartParams;
use codex_app_server_protocol::TurnStartResponse;
use codex_app_server_protocol::UserInput;
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

    let mut mcp = McpProcess::new(codex_home.path()).await?;
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

    let mut mcp = McpProcess::new(codex_home.path()).await?;
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

    let mut mcp = McpProcess::new(codex_home.path()).await?;
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

    let mut mcp = McpProcess::new(codex_home.path()).await?;
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

async fn start_thread(mcp: &mut McpProcess) -> Result<codex_app_server_protocol::Thread> {
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

async fn read_projection_event(mcp: &mut McpProcess) -> Result<ThreadProjectionEventNotification> {
    let notification: JSONRPCNotification = timeout(
        DEFAULT_READ_TIMEOUT,
        mcp.read_stream_until_notification_message("thread/projection/event"),
    )
    .await??;
    projection_event_from_notification(notification)
}

async fn read_next_projection_notification(mcp: &mut McpProcess) -> Result<JSONRPCNotification> {
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
    mcp: &mut McpProcess,
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

async fn read_projection_delta(mcp: &mut McpProcess) -> Result<ThreadProjectionDeltaNotification> {
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
