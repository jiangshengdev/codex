use std::error::Error;
use std::fmt;
use std::future::Future;
use std::io;
use std::io::Error as IoError;
use std::io::ErrorKind;

use codex_app_server::GuiHostManager;
use codex_app_server::in_process::InProcessClientSender;
#[cfg(test)]
use codex_gui_host::DevAssetProxyConfig;
use codex_gui_host::GuiHostConfig;
use codex_gui_host::GuiHostMode;
use codex_protocol::ThreadId;
use tokio::sync::oneshot;

use crate::AppServerClient;
use crate::ClientCommand;
use crate::InProcessAppServerClient;
use crate::RemoteAppServerClient;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GuiLaunchUrl(String);

impl GuiLaunchUrl {
    pub fn as_str(&self) -> &str {
        &self.0
    }

    pub fn into_string(self) -> String {
        self.0
    }

    pub(crate) fn new(url: String) -> Self {
        Self(url)
    }
}

impl fmt::Display for GuiLaunchUrl {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

#[derive(Debug)]
pub enum GuiLaunchError {
    Config { message: String },
    Io(io::Error),
    UnsupportedRemote,
}

impl fmt::Display for GuiLaunchError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Config { message } => write!(f, "GUI host config error: {message}"),
            Self::Io(error) => write!(f, "GUI host launch error: {error}"),
            Self::UnsupportedRemote => {
                f.write_str("GUI launch is only supported for in-process app-server sessions")
            }
        }
    }
}

impl Error for GuiLaunchError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Io(error) => Some(error),
            Self::Config { .. } | Self::UnsupportedRemote => None,
        }
    }
}

impl From<io::Error> for GuiLaunchError {
    fn from(value: io::Error) -> Self {
        Self::Io(value)
    }
}

#[cfg(test)]
fn default_gui_host_mode() -> Result<GuiHostMode, GuiLaunchError> {
    Ok(test_dev_mode())
}

#[cfg(not(test))]
fn default_gui_host_mode() -> Result<GuiHostMode, GuiLaunchError> {
    GuiHostMode::default_for_profile().map_err(|error| GuiLaunchError::Config {
        message: error.to_string(),
    })
}

#[cfg(test)]
pub(crate) fn test_dev_mode() -> GuiHostMode {
    GuiHostMode::Dev(DevAssetProxyConfig {
        vite_origin: "http://127.0.0.1:5173".to_string(),
    })
}

#[cfg(test)]
pub(crate) fn new_gui_host_manager_for_test(
    sender: InProcessClientSender,
    mode_result: Result<GuiHostMode, String>,
) -> Result<GuiHostManager, GuiLaunchError> {
    let mode = mode_result.map_err(|message| GuiLaunchError::Config { message })?;
    Ok(GuiHostManager::new(sender, GuiHostConfig { mode }))
}

/// Extension facade for surfaces that need a local GUI launch URL.
///
/// Implementations should return a usable GUI URL for in-process app-server
/// sessions and a clear unsupported error for remote sessions.
pub trait AppServerClientGuiExt {
    fn launch_gui_for_thread(
        &self,
        thread_id: ThreadId,
    ) -> impl Future<Output = Result<GuiLaunchUrl, GuiLaunchError>> + Send;
}

pub(crate) fn new_gui_host_manager(
    sender: InProcessClientSender,
) -> Result<GuiHostManager, GuiLaunchError> {
    let mode = default_gui_host_mode()?;
    Ok(GuiHostManager::new(sender, GuiHostConfig { mode }))
}

impl InProcessAppServerClient {
    pub async fn launch_gui_for_thread(
        &self,
        thread_id: ThreadId,
    ) -> Result<GuiLaunchUrl, GuiLaunchError> {
        let (response_tx, response_rx) = oneshot::channel();
        self.command_tx
            .send(ClientCommand::LaunchGui {
                thread_id,
                response_tx,
            })
            .await
            .map_err(|_| {
                GuiLaunchError::Io(IoError::new(
                    ErrorKind::BrokenPipe,
                    "in-process app-server worker channel is closed",
                ))
            })?;
        response_rx.await.map_err(|_| {
            GuiLaunchError::Io(IoError::new(
                ErrorKind::BrokenPipe,
                "in-process GUI launch response channel is closed",
            ))
        })?
    }
}

impl RemoteAppServerClient {
    pub async fn launch_gui_for_thread(
        &self,
        _thread_id: ThreadId,
    ) -> Result<GuiLaunchUrl, GuiLaunchError> {
        Err(GuiLaunchError::UnsupportedRemote)
    }
}

impl AppServerClient {
    pub async fn launch_gui_for_thread(
        &self,
        thread_id: ThreadId,
    ) -> Result<GuiLaunchUrl, GuiLaunchError> {
        match self {
            Self::InProcess(client) => client.launch_gui_for_thread(thread_id).await,
            Self::Remote(client) => client.launch_gui_for_thread(thread_id).await,
        }
    }
}

impl AppServerClientGuiExt for InProcessAppServerClient {
    fn launch_gui_for_thread(
        &self,
        thread_id: ThreadId,
    ) -> impl Future<Output = Result<GuiLaunchUrl, GuiLaunchError>> + Send {
        InProcessAppServerClient::launch_gui_for_thread(self, thread_id)
    }
}

impl AppServerClientGuiExt for RemoteAppServerClient {
    fn launch_gui_for_thread(
        &self,
        thread_id: ThreadId,
    ) -> impl Future<Output = Result<GuiLaunchUrl, GuiLaunchError>> + Send {
        RemoteAppServerClient::launch_gui_for_thread(self, thread_id)
    }
}

impl AppServerClientGuiExt for AppServerClient {
    fn launch_gui_for_thread(
        &self,
        thread_id: ThreadId,
    ) -> impl Future<Output = Result<GuiLaunchUrl, GuiLaunchError>> + Send {
        AppServerClient::launch_gui_for_thread(self, thread_id)
    }
}

#[cfg(test)]
mod tests {
    use pretty_assertions::assert_eq;

    use super::*;

    #[test]
    fn gui_launch_url_display() {
        let url = GuiLaunchUrl::new("http://127.0.0.1:1234/?threadId=t#token=x".to_string());

        assert_eq!(url.as_str(), "http://127.0.0.1:1234/?threadId=t#token=x");
        assert_eq!(url.to_string(), "http://127.0.0.1:1234/?threadId=t#token=x");
        assert_eq!(
            url.into_string(),
            "http://127.0.0.1:1234/?threadId=t#token=x"
        );
    }

    #[test]
    fn unsupported_remote_error_message_is_stable() {
        assert_eq!(
            GuiLaunchError::UnsupportedRemote.to_string(),
            "GUI launch is only supported for in-process app-server sessions"
        );
    }
}
