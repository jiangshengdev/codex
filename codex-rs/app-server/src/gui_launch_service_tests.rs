use std::sync::Arc;

use codex_analytics::AnalyticsEventsClient;
use codex_analytics::AppServerRpcTransport;
use codex_arg0::Arg0DispatchPaths;
use codex_config::CloudConfigBundleLoader;
use codex_config::LoaderOverrides;
use codex_exec_server::EnvironmentManager;
use codex_feedback::CodexFeedback;
use codex_gui_agent_extension::GuiLaunchToolService;
use codex_gui_host::DevAssetProxyConfig;
use codex_gui_host::GuiHostConfig;
use codex_gui_host::GuiHostMode;
use codex_login::AuthManager;
use codex_protocol::ThreadId;
use codex_protocol::protocol::SessionSource;
use core_test_support::load_default_config_for_test;
use pretty_assertions::assert_eq;
use tempfile::TempDir;
use tokio::sync::mpsc;

use crate::config_manager::ConfigManager;
use crate::message_processor::MessageProcessor;
use crate::message_processor::MessageProcessorArgs;
use crate::outgoing_message::OutgoingMessageSender;

#[tokio::test]
async fn app_server_gui_launch_service_returns_tool_urls() {
    let service = crate::gui_launch_service::test_support::new_test_gui_launch_service(
        GuiHostMode::Dev(DevAssetProxyConfig {
            vite_origin: "http://127.0.0.1:5173".to_string(),
        }),
    )
    .await;
    let thread_id =
        ThreadId::from_string("00000000-0000-0000-0000-0000000000a7").expect("valid thread id");

    let urls = GuiLaunchToolService::launch_urls_for_thread(&*service, thread_id)
        .await
        .expect("launch should return tool URLs");

    assert_eq!(
        urls.entries[0].kind,
        codex_gui_agent_extension::GuiLaunchToolEntryKind::Local
    );
    assert!(
        urls.entries[0]
            .url
            .contains("threadId=00000000-0000-0000-0000-0000000000a7")
    );
    service.shutdown().await;
}

#[tokio::test]
async fn clear_runtime_references_cancels_gui_launch_service() {
    let codex_home = TempDir::new().expect("tempdir");
    let config = Arc::new(load_default_config_for_test(&codex_home).await);
    let gui_bridge =
        crate::gui_connection_bridge::test_support::start_local_bridge_for_test().await;
    let gui_launch_service = Arc::new(crate::gui_launch_service::AppServerGuiLaunchService::new(
        crate::gui_host::GuiHostManager::new_with_opener(
            gui_bridge.opener(),
            GuiHostConfig {
                mode: GuiHostMode::Dev(DevAssetProxyConfig {
                    vite_origin: "http://127.0.0.1:5173".to_string(),
                }),
            },
        ),
    ));
    let processor =
        build_test_processor(Arc::clone(&config), Arc::clone(&gui_launch_service)).await;
    let thread_id =
        ThreadId::from_string("00000000-0000-0000-0000-0000000000c3").expect("valid thread id");

    gui_launch_service
        .launch_urls_for_thread(thread_id)
        .await
        .expect("launch should succeed");
    assert!(gui_launch_service.has_active_host_for_test().await);

    processor.clear_runtime_references();

    assert!(!gui_launch_service.has_active_host_for_test().await);
    gui_bridge.shutdown().await;
}

async fn build_test_processor(
    config: Arc<codex_core::config::Config>,
    gui_launch_service: Arc<crate::gui_launch_service::AppServerGuiLaunchService>,
) -> Arc<MessageProcessor> {
    let (outgoing_tx, _outgoing_rx) = mpsc::channel(16);
    let auth_manager =
        AuthManager::shared_from_config(config.as_ref(), /*enable_codex_api_key_env*/ false).await;
    let config_manager = ConfigManager::new(
        config.codex_home.to_path_buf(),
        Vec::new(),
        LoaderOverrides::default(),
        /*strict_config*/ false,
        CloudConfigBundleLoader::default(),
        Arg0DispatchPaths::default(),
        Arc::new(codex_config::NoopThreadConfigLoader),
    );
    let analytics_events_client = AnalyticsEventsClient::disabled();
    let outgoing = Arc::new(OutgoingMessageSender::new(
        outgoing_tx,
        analytics_events_client.clone(),
    ));

    Arc::new(MessageProcessor::new(MessageProcessorArgs {
        outgoing,
        analytics_events_client,
        arg0_paths: Arg0DispatchPaths::default(),
        config,
        config_manager,
        environment_manager: Arc::new(EnvironmentManager::default_for_tests()),
        feedback: CodexFeedback::new(),
        log_db: None,
        state_db: None,
        config_warnings: Vec::new(),
        session_source: SessionSource::VSCode,
        auth_manager,
        installation_id: "11111111-1111-4111-8111-111111111111".to_string(),
        rpc_transport: AppServerRpcTransport::Stdio,
        remote_control_handle: None,
        plugin_startup_tasks: crate::PluginStartupTasks::Start,
        gui_launch_service,
    }))
}
