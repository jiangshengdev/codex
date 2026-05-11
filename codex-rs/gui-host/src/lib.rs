mod backend;
mod config;
mod filter;
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
pub use token::LaunchToken;
pub use url::launch_url_for_thread;

#[cfg(test)]
mod tests {
    use crate::GuiHostMode;

    #[test]
    fn crate_exports_gui_host_mode() {
        let mode = GuiHostMode::default_for_profile().expect("mode should resolve");
        assert!(matches!(mode, GuiHostMode::Dev(_) | GuiHostMode::Prod(_)));
    }
}
