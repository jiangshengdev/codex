use std::collections::BTreeMap;
use std::time::Duration;

use anyhow::Result;
use app_test_support::McpProcess;
use app_test_support::create_final_assistant_message_sse_response;
use app_test_support::create_mock_responses_server_sequence_unchecked;
use app_test_support::to_response;
use app_test_support::write_mock_responses_config_toml;
use codex_app_server_protocol::JSONRPCNotification;
use codex_app_server_protocol::JSONRPCResponse;
use codex_app_server_protocol::RequestId;
use codex_app_server_protocol::ThreadProjectionAttachParams;
use codex_app_server_protocol::ThreadProjectionAttachResponse;
use codex_app_server_protocol::ThreadProjectionDetachParams;
use codex_app_server_protocol::ThreadProjectionDetachResponse;
use codex_app_server_protocol::ThreadProjectionDetachStatus;
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
    let Some(params) = notification.params else {
        anyhow::bail!("thread/projection/event notification missing params");
    };
    Ok(serde_json::from_value(params)?)
}
