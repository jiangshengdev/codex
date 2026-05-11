mod assets;
mod backend;
mod config;
mod filter;
mod host;
mod token;
mod url;

pub use backend::AuthenticatedGuiConnection;
pub use backend::GuiBackend;
pub use config::DevAssetProxyConfig;
pub use config::GuiHostConfig;
pub use config::GuiHostMode;
pub use config::ProdAssetConfig;
pub use filter::is_allowed_client_notification_method;
pub use filter::is_allowed_client_request_method;
pub use filter::is_allowed_server_notification_method;
pub use host::GuiHost;
pub use host::GuiHostHandle;
pub use token::LaunchToken;
pub use url::launch_url_for_thread;

#[cfg(test)]
pub(crate) mod test_support {
    use std::sync::Arc;
    use std::sync::Mutex;

    use crate::AuthenticatedGuiConnection;
    use crate::GuiBackend;

    #[derive(Clone)]
    pub(crate) struct NoopBackend;

    impl GuiBackend for NoopBackend {
        async fn connect(&self, _connection: AuthenticatedGuiConnection) -> anyhow::Result<()> {
            Ok(())
        }
    }

    #[allow(dead_code)]
    #[derive(Clone, Default)]
    pub(crate) struct RecordingBackend {
        received: Arc<Mutex<Vec<String>>>,
    }

    #[allow(dead_code)]
    impl RecordingBackend {
        pub(crate) fn new() -> Self {
            Self::default()
        }

        pub(crate) fn received(&self) -> Vec<String> {
            self.received
                .lock()
                .expect("recording backend mutex should not be poisoned")
                .clone()
        }
    }

    impl GuiBackend for RecordingBackend {
        async fn connect(&self, mut connection: AuthenticatedGuiConnection) -> anyhow::Result<()> {
            while let Some(text) = connection.inbound_rx.recv().await {
                let method = serde_json::from_str::<serde_json::Value>(&text)
                    .ok()
                    .and_then(|value| value["method"].as_str().map(str::to_owned))
                    .unwrap_or(text);
                self.received
                    .lock()
                    .expect("recording backend mutex should not be poisoned")
                    .push(method);
            }
            Ok(())
        }
    }
}

#[cfg(test)]
mod tests {
    use crate::GuiHostMode;

    #[test]
    fn crate_exports_gui_host_mode() {
        let mode = GuiHostMode::default_for_profile().expect("mode should resolve");
        assert!(matches!(mode, GuiHostMode::Dev(_) | GuiHostMode::Prod(_)));
    }
}
