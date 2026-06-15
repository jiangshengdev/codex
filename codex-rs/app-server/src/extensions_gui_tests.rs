use std::io;
use std::sync::Arc;
use std::sync::Weak;

use codex_analytics::AnalyticsEventsClient;
use codex_exec_server::EnvironmentManager;
use codex_extension_api::ExtensionData;
use codex_extension_api::NoopExtensionEventSink;
use codex_extension_api::ThreadStartInput;
use codex_gui_host::DevAssetProxyConfig;
use codex_gui_host::GuiHostConfig;
use codex_gui_host::GuiHostMode;
use codex_login::AuthManager;
use codex_protocol::ThreadId;
use codex_protocol::protocol::SessionSource;
use core_test_support::load_default_config_for_test;
use pretty_assertions::assert_eq;
use tokio::sync::mpsc;

use super::ThreadExtensionDependencies;
use super::guardian_agent_spawner;
use super::thread_extensions;

struct UnusedGuiOpener;

impl crate::gui_connection_bridge::LocalGuiConnectionOpener for UnusedGuiOpener {
    fn open_gui_connection(
        &self,
        _outgoing_tx: mpsc::Sender<String>,
    ) -> io::Result<crate::gui_connection_bridge::LocalGuiConnectionHandle> {
        Err(io::Error::other(
            "extension registry availability tests do not launch GUI connections",
        ))
    }
}

#[tokio::test]
async fn thread_extensions_hide_launch_gui_tool_when_gui_service_unavailable() {
    let codex_home = tempfile::TempDir::new().expect("tempdir");
    let config = load_default_config_for_test(&codex_home).await;
    let gui_launch_service = Arc::new(
        crate::gui_launch_service::AppServerGuiLaunchService::unavailable(
            "GUI launch is unavailable in this test",
        ),
    );

    assert_eq!(
        Vec::<String>::new(),
        launch_gui_tool_names_for_service(&config, gui_launch_service).await
    );
}

#[tokio::test]
async fn thread_extensions_install_launch_gui_tool_when_gui_service_available() {
    let codex_home = tempfile::TempDir::new().expect("tempdir");
    let config = load_default_config_for_test(&codex_home).await;
    let gui_launch_service = Arc::new(crate::gui_launch_service::AppServerGuiLaunchService::new(
        crate::gui_host::GuiHostManager::new_with_opener(
            Arc::new(UnusedGuiOpener),
            GuiHostConfig {
                mode: GuiHostMode::Dev(DevAssetProxyConfig {
                    vite_origin: "http://127.0.0.1:5173".to_string(),
                }),
            },
        ),
    ));

    assert_eq!(
        vec!["launch_gui".to_string()],
        launch_gui_tool_names_for_service(&config, gui_launch_service).await
    );
}

async fn launch_gui_tool_names_for_service(
    config: &codex_core::config::Config,
    gui_launch_service: Arc<crate::gui_launch_service::AppServerGuiLaunchService>,
) -> Vec<String> {
    let auth_manager =
        AuthManager::shared_from_config(config, /*enable_codex_api_key_env*/ false).await;
    let environment_manager = Arc::new(EnvironmentManager::default_for_tests());
    let executor_skill_provider: Arc<dyn codex_skills_extension::SkillProvider> = Arc::new(
        codex_skills_extension::ExecutorSkillProvider::new_with_restriction_product(
            environment_manager,
            SessionSource::Cli.restriction_product(),
        ),
    );
    let registry = thread_extensions(
        guardian_agent_spawner(Weak::new()),
        ThreadExtensionDependencies {
            event_sink: Arc::new(NoopExtensionEventSink),
            auth_manager,
            state_db: None,
            analytics_events_client: AnalyticsEventsClient::disabled(),
            thread_manager: Weak::new(),
            goal_service: Arc::new(codex_goal_extension::GoalService::new()),
            executor_skill_provider,
            gui_launch_service,
            thread_store: codex_core::thread_store_from_config(config, /*state_db*/ None),
        },
    );
    let session_store = ExtensionData::new("session-test");
    let thread_id = ThreadId::default();
    let thread_store = ExtensionData::new(thread_id.to_string());
    let source = SessionSource::Cli;

    for contributor in registry.thread_lifecycle_contributors() {
        contributor
            .on_thread_start(ThreadStartInput {
                config,
                session_source: &source,
                persistent_thread_state_available: true,
                session_store: &session_store,
                thread_store: &thread_store,
            })
            .await;
    }

    registry
        .tool_contributors()
        .iter()
        .flat_map(|contributor| contributor.tools(&session_store, &thread_store))
        .map(|tool| tool.tool_name().name)
        .filter(|name| name == "launch_gui")
        .collect()
}
