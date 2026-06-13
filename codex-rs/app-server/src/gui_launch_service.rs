use std::fmt;
use std::future::Future;
use std::sync::Arc;

use codex_gui_host::GuiHostConfig;
use codex_gui_host::GuiHostMode;
use codex_gui_host::GuiLaunchUrls;
use codex_protocol::ThreadId;

use crate::gui_connection_bridge::LocalGuiConnectionOpener;
use crate::gui_host::GuiHostManager;

#[derive(Debug)]
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
    manager: Option<GuiHostManager>,
    unavailable_message: Option<String>,
}

impl AppServerGuiLaunchService {
    pub fn new(manager: GuiHostManager) -> Self {
        Self {
            manager: Some(manager),
            unavailable_message: None,
        }
    }

    pub(crate) fn unavailable(message: impl Into<String>) -> Self {
        Self {
            manager: None,
            unavailable_message: Some(message.into()),
        }
    }

    pub(crate) fn new_with_default_config(opener: Arc<dyn LocalGuiConnectionOpener>) -> Self {
        match GuiHostMode::default_for_profile() {
            Ok(mode) => Self::new(GuiHostManager::new_with_opener(
                opener,
                GuiHostConfig { mode },
            )),
            Err(error) => Self::unavailable(error.to_string()),
        }
    }

    pub async fn launch_urls_for_thread(
        &self,
        thread_id: ThreadId,
    ) -> Result<GuiLaunchUrls, GuiLaunchServiceError> {
        GuiLaunchService::launch_urls_for_thread(self, thread_id).await
    }

    pub async fn shutdown(&self) {
        if let Some(manager) = &self.manager {
            manager.shutdown().await;
        }
    }

    pub fn shutdown_best_effort(&self) {
        if let Some(manager) = &self.manager {
            manager.cancel();
        }
    }

    #[cfg(test)]
    pub(crate) async fn has_active_host_for_test(&self) -> bool {
        match &self.manager {
            Some(manager) => manager.has_active_host_for_test().await,
            None => false,
        }
    }
}

impl GuiLaunchService for AppServerGuiLaunchService {
    async fn launch_urls_for_thread(
        &self,
        thread_id: ThreadId,
    ) -> Result<GuiLaunchUrls, GuiLaunchServiceError> {
        let Some(manager) = &self.manager else {
            return Err(GuiLaunchServiceError::Config {
                message: self
                    .unavailable_message
                    .clone()
                    .unwrap_or_else(|| "GUI launch service is unavailable".to_string()),
            });
        };
        manager
            .launch_urls_for_thread(thread_id)
            .await
            .map_err(|error| GuiLaunchServiceError::Launch {
                message: error.to_string(),
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
