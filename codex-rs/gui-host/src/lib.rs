mod assets;
mod backend;
mod browser_contract;
mod browser_contract_fixtures;
mod config;
mod filter;
mod host;
mod net;
mod token;
mod url;
pub(crate) mod ws;

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
pub use url::AdvertisedHost;
pub use url::GuiLaunchUrlEntry;
pub use url::GuiLaunchUrlKind;
pub use url::GuiLaunchUrls;
pub use url::launch_url_for_thread;
pub use url::launch_urls_for_thread;

#[doc(hidden)]
pub use browser_contract_fixtures::generate_browser_contract_fixture_tree_for_tests;
#[doc(hidden)]
pub use browser_contract_fixtures::write_browser_contract_fixtures;

#[cfg(test)]
pub(crate) mod test_support {
    use std::sync::Arc;
    use std::sync::Mutex;
    use std::time::Duration;

    use tokio::sync::watch;

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
    #[derive(Clone)]
    pub(crate) struct RecordingBackend {
        received: Arc<Mutex<Vec<String>>>,
        received_tx: watch::Sender<Vec<String>>,
    }

    #[allow(dead_code)]
    impl RecordingBackend {
        pub(crate) fn new() -> Self {
            let (received_tx, _received_rx) = watch::channel(Vec::new());
            Self {
                received: Arc::new(Mutex::new(Vec::new())),
                received_tx,
            }
        }

        pub(crate) fn received(&self) -> Vec<String> {
            self.received
                .lock()
                .expect("recording backend mutex should not be poisoned")
                .clone()
        }

        pub(crate) async fn wait_for_received(&self, expected: &[&str]) -> Vec<String> {
            let expected: Vec<String> = expected
                .iter()
                .map(std::string::ToString::to_string)
                .collect();
            let mut received_rx = self.received_tx.subscribe();
            tokio::time::timeout(Duration::from_secs(1), async {
                loop {
                    let received = received_rx.borrow_and_update().clone();
                    if received == expected {
                        return received;
                    }
                    received_rx
                        .changed()
                        .await
                        .expect("recording backend watch channel should stay open");
                }
            })
            .await
            .expect("recording backend should receive expected methods")
        }
    }

    impl GuiBackend for RecordingBackend {
        async fn connect(&self, mut connection: AuthenticatedGuiConnection) -> anyhow::Result<()> {
            while let Some(text) = connection.inbound_rx.recv().await {
                let method = serde_json::from_str::<serde_json::Value>(&text)
                    .ok()
                    .and_then(|value| value["method"].as_str().map(str::to_owned))
                    .unwrap_or(text);
                let received = {
                    let mut received = self
                        .received
                        .lock()
                        .expect("recording backend mutex should not be poisoned");
                    received.push(method);
                    received.clone()
                };
                let _ = self.received_tx.send(received);
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
        let mode = GuiHostMode::for_profile_with_mode(Some("dev".to_string()))
            .expect("mode should resolve");
        assert!(matches!(mode, GuiHostMode::Dev(_) | GuiHostMode::Prod(_)));
    }
}
