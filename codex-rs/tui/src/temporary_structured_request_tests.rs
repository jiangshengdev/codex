use super::STRUCTURED_RESPONSE_MAX_BYTES;
use super::TemporaryStructuredThreadOptions;
use super::collect_structured_response;
use super::start_temporary_thread;
use crate::legacy_core::config::ConfigBuilder;
use crate::test_support::PathBufExt;
use codex_app_server_client::AppServerClient;
use codex_app_server_protocol::AskForApproval;
use codex_app_server_protocol::ItemCompletedNotification;
use codex_app_server_protocol::SandboxPolicy;
use codex_app_server_protocol::ServerNotification;
use codex_app_server_protocol::ThreadItem;
use codex_app_server_protocol::ThreadSource;
use codex_app_server_protocol::Turn;
use codex_app_server_protocol::TurnCompletedNotification;
use codex_app_server_protocol::TurnStatus;
use codex_config::LoaderOverrides;
use codex_exec_server::EnvironmentManager;
use futures::SinkExt;
use futures::StreamExt;
use pretty_assertions::assert_eq;
use std::sync::Arc;
use tempfile::tempdir;
use tokio::sync::mpsc::unbounded_channel;
use tokio_tungstenite::tungstenite::Message;

#[tokio::test]
async fn tool_isolation_requires_an_effectively_ephemeral_thread() -> color_eyre::Result<()> {
    let (chat_widget, _, _, _) =
        crate::chatwidget::tests::make_chatwidget_manual_with_sender().await;
    let config = chat_widget.config_ref();
    let app_server = crate::start_embedded_app_server_for_picker(config).await?;
    for (disable_tools, ephemeral) in [(false, false), (true, false), (true, true)] {
        let result = app_server
            .request_handle()
            .request_typed::<codex_app_server_protocol::ThreadStartResponse>(
                codex_app_server_protocol::ClientRequest::ThreadStart {
                    request_id: codex_app_server_protocol::RequestId::String(format!(
                        "tool-isolation-{disable_tools}-{ephemeral}"
                    )),
                    params: codex_app_server_protocol::ThreadStartParams {
                        disable_tools,
                        ephemeral: Some(ephemeral),
                        ..Default::default()
                    },
                },
            )
            .await;
        if disable_tools && !ephemeral {
            assert!(
                result
                    .expect_err("durable threads cannot retain the startup restriction")
                    .to_string()
                    .contains("disableTools is only supported for ephemeral threads")
            );
        } else {
            let response = result?;
            assert_eq!(response.tools_disabled, disable_tools);
            assert_eq!(response.thread.ephemeral, ephemeral);
        }
    }
    app_server.shutdown().await?;
    Ok(())
}

#[tokio::test]
async fn requires_tool_isolation_confirmation_and_unsubscribes_unconfirmed_threads()
-> color_eyre::Result<()> {
    for confirmation in [None, Some(false), Some(true)] {
        let cwd = tempdir()?;
        let mut thread_response = serde_json::json!({
            "thread": {
                "id": "temporary-thread",
                "sessionId": "temporary-session",
                "preview": "",
                "ephemeral": true,
                "modelProvider": "openai",
                "createdAt": 0,
                "updatedAt": 0,
                "status": {"type": "idle"},
                "cwd": cwd.path(),
                "cliVersion": "0.0.0",
                "source": "cli",
                "turns": []
            },
            "model": "gpt-5.2",
            "modelProvider": "openai",
            "cwd": cwd.path(),
            "approvalPolicy": "never",
            "approvalsReviewer": "user",
            "sandbox": {"type": "readOnly", "networkAccess": false}
        });
        if let Some(confirmation) = confirmation {
            thread_response["toolsDisabled"] = confirmation.into();
        }
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await?;
        let websocket_url = format!("ws://{}", listener.local_addr()?);
        let server = tokio::spawn(async move {
            let (stream, _) = listener.accept().await.unwrap();
            let mut socket = tokio_tungstenite::accept_async(stream).await.unwrap();
            let mut methods = Vec::new();
            while let Some(Ok(Message::Text(text))) = socket.next().await {
                let request: serde_json::Value = serde_json::from_str(&text).unwrap();
                if request["id"].is_null() {
                    continue;
                }
                let method = request["method"].as_str().unwrap();
                let result = match method {
                    "initialize" => serde_json::json!({"userAgent": "tool-isolation-test"}),
                    "config/read" => serde_json::json!({"config": {}, "origins": {}}),
                    "thread/start" => {
                        assert_eq!(request["params"]["disableTools"], true);
                        assert_eq!(request["params"]["ephemeral"], true);
                        thread_response.clone()
                    }
                    "thread/unsubscribe" => {
                        assert_eq!(
                            request["params"],
                            serde_json::json!({"threadId": "temporary-thread"})
                        );
                        serde_json::json!({"status": "unsubscribed"})
                    }
                    _ => panic!("unexpected request: {request}"),
                };
                methods.push(method.to_string());
                socket
                    .send(Message::Text(
                        serde_json::json!({"id": request["id"], "result": result})
                            .to_string()
                            .into(),
                    ))
                    .await
                    .unwrap();
            }
            methods
        });
        let client = crate::connect_remote_app_server(crate::RemoteAppServerEndpoint::WebSocket {
            websocket_url,
            auth_token: None,
        })
        .await?;
        let result = start_temporary_thread(
            &client.request_handle(),
            TemporaryStructuredThreadOptions {
                thread_source: ThreadSource::Feature("thread_title".to_string()),
                model: "gpt-5.2".to_string(),
                model_provider: "openai".to_string(),
                cwd: cwd.path().display().to_string(),
                active_permission_profile: None,
                mcp_server_names: Vec::new(),
            },
        )
        .await;
        client.shutdown().await?;
        let methods = server.await?;
        let mut expected_methods = vec!["initialize", "config/read", "thread/start"];
        if confirmation == Some(true) {
            assert!(result?.tools_disabled);
        } else {
            assert_eq!(
                result
                    .expect_err("tool isolation must be confirmed")
                    .to_string(),
                "temporary structured thread did not confirm tools are disabled"
            );
            expected_methods.push("thread/unsubscribe");
        }
        assert_eq!(methods, expected_methods);
    }
    Ok(())
}

fn agent_message_notification(turn_id: &str, text: &str) -> ServerNotification {
    ServerNotification::ItemCompleted(ItemCompletedNotification {
        item: ThreadItem::AgentMessage {
            id: "message-1".to_string(),
            text: text.to_string(),
            phase: None,
            memory_citation: None,
            delivery: None,
            questions: None,
        },
        thread_id: "thread-1".to_string(),
        turn_id: turn_id.to_string(),
        completed_at_ms: 0,
    })
}

fn turn_completed_notification(turn_id: &str, status: TurnStatus) -> ServerNotification {
    ServerNotification::TurnCompleted(TurnCompletedNotification {
        thread_id: "thread-1".to_string(),
        turn: Turn {
            id: turn_id.to_string(),
            items: Vec::new(),
            items_view: Default::default(),
            status,
            error: None,
            started_at: None,
            completed_at: None,
            duration_ms: None,
        },
    })
}

#[tokio::test]
async fn managed_workspace_default_respects_read_only_availability() -> color_eyre::Result<()> {
    for read_only_allowed in [true, false] {
        let codex_home = tempdir()?;
        let requirements_path = codex_home.path().join("requirements.toml");
        std::fs::write(
            &requirements_path,
            format!(
                "default_permissions = \":workspace\"\n\n\
                 [allowed_permission_profiles]\n\
                 \":read-only\" = {read_only_allowed}\n\
                 \":workspace\" = true\n"
            ),
        )?;
        let loader_overrides = LoaderOverrides {
            system_requirements_path: Some(requirements_path),
            ignore_project_config: true,
            ..LoaderOverrides::without_managed_config_for_tests()
        };
        let config = ConfigBuilder::default()
            .codex_home(codex_home.path().to_path_buf())
            .fallback_cwd(Some(codex_home.path().to_path_buf()))
            .loader_overrides(loader_overrides.clone())
            .build()
            .await?;
        let options = TemporaryStructuredThreadOptions {
            thread_source: ThreadSource::Feature("thread_title".to_string()),
            model: "gpt-5.2".to_string(),
            model_provider: config.model_provider_id.clone(),
            cwd: config.cwd.to_string_lossy().into_owned(),
            active_permission_profile: config
                .permissions
                .active_permission_profile()
                .map(|profile| profile.id),
            mcp_server_names: Vec::new(),
        };
        let client = crate::start_embedded_app_server(
            Default::default(),
            config,
            Vec::new(),
            loader_overrides,
            /*strict_config*/ false,
            Default::default(),
            codex_feedback::CodexFeedback::new(),
            /*log_db*/ None,
            /*state_db*/ None,
            Arc::new(EnvironmentManager::default_for_tests()),
            Default::default(),
        )
        .await?;
        let app_server = AppServerClient::InProcess(client);
        let result = start_temporary_thread(&app_server.request_handle(), options).await;
        app_server.shutdown().await?;

        if read_only_allowed {
            let response = result?;
            assert_eq!(
                (
                    response.active_permission_profile.map(|profile| profile.id),
                    response.approval_policy,
                    response.sandbox,
                ),
                (
                    Some(":read-only".to_string()),
                    AskForApproval::Never,
                    SandboxPolicy::ReadOnly {
                        network_access: false,
                    },
                ),
            );
        } else {
            assert_eq!(
                result.expect_err("read-only must be allowed").to_string(),
                "temporary structured thread did not start with read-only permissions",
            );
        }
    }
    Ok(())
}

#[tokio::test]
async fn preserves_custom_permissions_and_disables_required_mcp_servers() -> color_eyre::Result<()>
{
    let (chat_widget, _, _, _) =
        crate::chatwidget::tests::make_chatwidget_manual_with_sender().await;
    let mut config = chat_widget.config_ref().clone();
    let codex_home = tempdir()?;
    let denied_path = codex_home.path().join("denied");
    let denied_key = toml::Value::String(denied_path.display().to_string());
    std::fs::write(
        codex_home.path().join("config.toml"),
        format!(
            "default_permissions = \"title-restricted\"\n\n\
             [permissions.title-restricted.filesystem]\n\
             \":root\" = \"read\"\n\
             {denied_key} = \"deny\"\n\n\
             [mcp_servers.forbidden]\n\
             command = \"codex-auto-title-missing-mcp\"\n\
             required = true\n"
        ),
    )?;
    config.codex_home = codex_home.path().to_path_buf().abs();
    config.sqlite =
        codex_state::SqliteConfig::new_for_testing(codex_home.path().to_path_buf().abs());

    let app_server = crate::start_embedded_app_server_for_picker(&config).await?;
    let response = start_temporary_thread(
        &app_server.request_handle(),
        TemporaryStructuredThreadOptions {
            thread_source: ThreadSource::Feature("thread_title".to_string()),
            model: "gpt-5.2".to_string(),
            model_provider: config.model_provider_id.clone(),
            cwd: config.cwd.display().to_string(),
            active_permission_profile: Some("title-restricted".to_string()),
            mcp_server_names: vec!["forbidden".to_string()],
        },
    )
    .await?;

    assert_eq!(
        (
            response.active_permission_profile.map(|profile| profile.id),
            response.model_provider,
            response.thread.ephemeral,
            response.thread.thread_source,
        ),
        (
            Some("title-restricted".to_string()),
            config.model_provider_id,
            true,
            Some(ThreadSource::Feature("thread_title".to_string())),
        )
    );

    app_server.shutdown().await?;
    Ok(())
}

#[tokio::test]
async fn returns_latest_matching_assistant_message() {
    let (sender, receiver) = unbounded_channel();
    sender
        .send(agent_message_notification("other-turn", "ignore me"))
        .expect("send unrelated assistant message");
    sender
        .send(turn_completed_notification(
            "other-turn",
            TurnStatus::Completed,
        ))
        .expect("send unrelated completion");
    sender
        .send(agent_message_notification("turn-1", "first"))
        .expect("send first assistant message");
    sender
        .send(agent_message_notification("turn-1", "final"))
        .expect("send final assistant message");
    sender
        .send(turn_completed_notification("turn-1", TurnStatus::Completed))
        .expect("send matching completion");

    let response = collect_structured_response(receiver, "turn-1")
        .await
        .expect("collect structured response");

    assert_eq!(response, "final");
}

#[tokio::test]
async fn rejects_failed_turn() {
    let (sender, receiver) = unbounded_channel();
    sender
        .send(turn_completed_notification("turn-1", TurnStatus::Failed))
        .expect("send failed completion");

    let error = collect_structured_response(receiver, "turn-1")
        .await
        .expect_err("failed turn should not produce a response");

    assert_eq!(
        error.to_string(),
        "temporary structured turn ended with status Failed"
    );
}

#[tokio::test]
async fn rejects_completion_without_assistant_message() {
    let (sender, receiver) = unbounded_channel();
    sender
        .send(turn_completed_notification("turn-1", TurnStatus::Completed))
        .expect("send completion");

    let error = collect_structured_response(receiver, "turn-1")
        .await
        .expect_err("completion without assistant message should fail");

    assert_eq!(
        error.to_string(),
        "temporary structured turn completed without a response"
    );
}

#[tokio::test]
async fn rejects_closed_notification_channel() {
    let (sender, receiver) = unbounded_channel();
    drop(sender);

    let error = collect_structured_response(receiver, "turn-1")
        .await
        .expect_err("closed notification channel should fail");

    assert_eq!(
        error.to_string(),
        "temporary structured turn notification channel closed"
    );
}

#[tokio::test]
async fn rejects_oversized_assistant_message() {
    let (sender, receiver) = unbounded_channel();
    let oversized = "x".repeat(STRUCTURED_RESPONSE_MAX_BYTES + 1);
    sender
        .send(agent_message_notification("turn-1", &oversized))
        .expect("send oversized assistant message");
    sender
        .send(turn_completed_notification("turn-1", TurnStatus::Completed))
        .expect("send matching completion");

    let error = collect_structured_response(receiver, "turn-1")
        .await
        .expect_err("oversized assistant message should be rejected");

    assert_eq!(
        error.to_string(),
        "temporary structured response exceeds 8192 bytes"
    );
}
