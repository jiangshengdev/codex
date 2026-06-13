use std::fmt;
use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;

use codex_gui_host::GuiHostConfig;
use codex_gui_host::GuiHostMode;
use codex_gui_host::GuiLaunchUrls;
use codex_protocol::ThreadId;

use crate::gui_connection_bridge::LocalGuiConnectionOpener;
use crate::gui_host::GuiHostManager;

#[derive(Clone, Debug)]
pub enum GuiLaunchServiceError {
    Config { message: String },
    Launch { message: String },
    Unavailable { message: String },
}

impl fmt::Display for GuiLaunchServiceError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Config { message } => write!(f, "GUI host config error: {message}"),
            Self::Launch { message } => write!(f, "GUI host launch error: {message}"),
            Self::Unavailable { message } => write!(f, "GUI launch unavailable: {message}"),
        }
    }
}

impl std::error::Error for GuiLaunchServiceError {}

/// Launches GUI URLs for app-server threads without opening a browser.
pub trait GuiLaunchService: Send + Sync {
    fn launch_urls_for_thread(
        &self,
        thread_id: ThreadId,
    ) -> impl Future<Output = Result<GuiLaunchUrls, GuiLaunchServiceError>> + Send;
}

pub struct AppServerGuiLaunchService {
    state: GuiLaunchState,
}

enum GuiLaunchState {
    Available(GuiHostManager),
    Unavailable(GuiLaunchServiceError),
}

impl AppServerGuiLaunchService {
    pub fn new(manager: GuiHostManager) -> Self {
        Self {
            state: GuiLaunchState::Available(manager),
        }
    }

    #[cfg(test)]
    pub(crate) fn unavailable(message: impl Into<String>) -> Self {
        Self {
            state: GuiLaunchState::Unavailable(GuiLaunchServiceError::Unavailable {
                message: message.into(),
            }),
        }
    }

    pub(crate) fn config_error(message: impl Into<String>) -> Self {
        Self {
            state: GuiLaunchState::Unavailable(GuiLaunchServiceError::Config {
                message: message.into(),
            }),
        }
    }

    pub(crate) fn new_with_default_config(opener: Arc<dyn LocalGuiConnectionOpener>) -> Self {
        match GuiHostMode::default_for_profile() {
            Ok(mode) => Self::new(GuiHostManager::new_with_opener(
                opener,
                GuiHostConfig { mode },
            )),
            Err(error) => Self::config_error(error.to_string()),
        }
    }

    pub async fn launch_urls_for_thread(
        &self,
        thread_id: ThreadId,
    ) -> Result<GuiLaunchUrls, GuiLaunchServiceError> {
        GuiLaunchService::launch_urls_for_thread(self, thread_id).await
    }

    pub async fn shutdown(&self) {
        if let GuiLaunchState::Available(manager) = &self.state {
            manager.shutdown().await;
        }
    }

    pub fn shutdown_best_effort(&self) {
        if let GuiLaunchState::Available(manager) = &self.state {
            manager.cancel();
        }
    }

    #[cfg(test)]
    pub(crate) async fn has_active_host_for_test(&self) -> bool {
        match &self.state {
            GuiLaunchState::Available(manager) => manager.has_active_host_for_test().await,
            GuiLaunchState::Unavailable(_) => false,
        }
    }
}

impl GuiLaunchService for AppServerGuiLaunchService {
    async fn launch_urls_for_thread(
        &self,
        thread_id: ThreadId,
    ) -> Result<GuiLaunchUrls, GuiLaunchServiceError> {
        match &self.state {
            GuiLaunchState::Available(manager) => manager
                .launch_urls_for_thread(thread_id)
                .await
                .map_err(|error| GuiLaunchServiceError::Launch {
                    message: error.to_string(),
                }),
            GuiLaunchState::Unavailable(error) => Err(error.clone()),
        }
    }
}

impl From<GuiLaunchServiceError> for codex_gui_agent_extension::GuiLaunchToolError {
    fn from(value: GuiLaunchServiceError) -> Self {
        match value {
            GuiLaunchServiceError::Config { message } => Self::new(
                codex_gui_agent_extension::GuiLaunchToolErrorKind::ConfigError,
                message,
            ),
            GuiLaunchServiceError::Launch { message } => Self::new(
                codex_gui_agent_extension::GuiLaunchToolErrorKind::LaunchError,
                message,
            ),
            GuiLaunchServiceError::Unavailable { message } => Self::new(
                codex_gui_agent_extension::GuiLaunchToolErrorKind::Unavailable,
                message,
            ),
        }
    }
}

impl codex_gui_agent_extension::GuiLaunchToolService for AppServerGuiLaunchService {
    fn launch_urls_for_thread(
        &self,
        thread_id: ThreadId,
    ) -> Pin<
        Box<
            dyn Future<
                    Output = Result<GuiLaunchUrls, codex_gui_agent_extension::GuiLaunchToolError>,
                > + Send
                + '_,
        >,
    > {
        Box::pin(async move {
            AppServerGuiLaunchService::launch_urls_for_thread(self, thread_id)
                .await
                .map_err(Into::into)
        })
    }
}

#[cfg(test)]
mod tests {
    use codex_gui_host::DevAssetProxyConfig;
    use codex_gui_host::GuiHostConfig;
    use codex_gui_host::GuiHostMode;
    use codex_protocol::ThreadId;
    use pretty_assertions::assert_eq;

    use super::*;

    mod test_support {
        use tokio::sync::Mutex;

        use super::*;

        pub(crate) struct TestGuiLaunchService {
            service: AppServerGuiLaunchService,
            bridge: Mutex<Option<crate::gui_connection_bridge::test_support::TestLocalGuiBridge>>,
        }

        impl TestGuiLaunchService {
            pub(crate) async fn shutdown(&self) {
                self.service.shutdown().await;
                if let Some(bridge) = self.bridge.lock().await.take() {
                    bridge.shutdown().await;
                }
            }
        }

        impl GuiLaunchService for TestGuiLaunchService {
            async fn launch_urls_for_thread(
                &self,
                thread_id: ThreadId,
            ) -> Result<GuiLaunchUrls, GuiLaunchServiceError> {
                self.service.launch_urls_for_thread(thread_id).await
            }
        }

        pub(crate) async fn new_test_gui_launch_service(mode: GuiHostMode) -> TestGuiLaunchService {
            let bridge =
                crate::gui_connection_bridge::test_support::start_local_bridge_for_test().await;
            let manager = GuiHostManager::new_with_opener(bridge.opener(), GuiHostConfig { mode });

            TestGuiLaunchService {
                service: AppServerGuiLaunchService::new(manager),
                bridge: Mutex::new(Some(bridge)),
            }
        }
    }

    #[tokio::test]
    async fn unavailable_service_returns_unavailable_error() {
        let service = AppServerGuiLaunchService::unavailable("not available");
        let error = service
            .launch_urls_for_thread(ThreadId::default())
            .await
            .expect_err("unavailable service should not launch");

        match error {
            GuiLaunchServiceError::Unavailable { message } => {
                assert_eq!(message, "not available");
                assert_eq!(
                    GuiLaunchServiceError::Unavailable { message }.to_string(),
                    "GUI launch unavailable: not available"
                );
            }
            other => panic!("expected unavailable error, got {other:?}"),
        }
    }

    #[tokio::test]
    async fn launch_service_returns_urls_for_thread() {
        let service =
            test_support::new_test_gui_launch_service(GuiHostMode::Dev(DevAssetProxyConfig {
                vite_origin: "http://127.0.0.1:5173".to_string(),
            }))
            .await;
        let thread_id =
            ThreadId::from_string("00000000-0000-0000-0000-0000000000a1").expect("valid thread id");

        let urls = service
            .launch_urls_for_thread(thread_id)
            .await
            .expect("launch should succeed");

        assert_eq!(
            urls.entries[0].kind,
            codex_gui_host::GuiLaunchUrlKind::Local
        );
        assert!(
            urls.entries[0]
                .url
                .contains("threadId=00000000-0000-0000-0000-0000000000a1")
        );
        service.shutdown().await;
    }
}
