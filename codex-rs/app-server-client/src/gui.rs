use std::error::Error;
use std::fmt;
use std::future::Future;
use std::io;
use std::io::Error as IoError;
use std::io::ErrorKind;

#[cfg(test)]
use codex_app_server::GuiHostManager;
#[cfg(test)]
use codex_app_server::in_process::InProcessClientSender;
#[cfg(test)]
use codex_gui_host::GuiHostConfig;
#[cfg(test)]
use codex_gui_host::GuiHostMode;
use codex_protocol::ThreadId;
use tokio::sync::oneshot;

use crate::AppServerClient;
use crate::ClientCommand;
use crate::InProcessAppServerClient;
use crate::RemoteAppServerClient;

pub use codex_gui_host::GuiLaunchUrlEntry;
pub use codex_gui_host::GuiLaunchUrlKind;
pub use codex_gui_host::GuiLaunchUrls;

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
pub(crate) fn new_gui_host_manager_for_test(
    sender: InProcessClientSender,
    mode_result: Result<GuiHostMode, String>,
) -> Result<GuiHostManager, GuiLaunchError> {
    let mode = mode_result.map_err(|message| GuiLaunchError::Config { message })?;
    Ok(GuiHostManager::new(sender, GuiHostConfig { mode }))
}

/// Extension facade for surfaces that need local GUI launch URLs.
///
/// Implementations should return usable GUI URLs for in-process app-server
/// sessions and a clear unsupported error for remote sessions.
pub trait AppServerClientGuiExt {
    fn launch_gui_for_thread(
        &self,
        thread_id: ThreadId,
    ) -> impl Future<Output = Result<GuiLaunchUrls, GuiLaunchError>> + Send;
}

impl InProcessAppServerClient {
    pub async fn launch_gui_for_thread(
        &self,
        thread_id: ThreadId,
    ) -> Result<GuiLaunchUrls, GuiLaunchError> {
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
    ) -> Result<GuiLaunchUrls, GuiLaunchError> {
        Err(GuiLaunchError::UnsupportedRemote)
    }
}

impl AppServerClient {
    pub async fn launch_gui_for_thread(
        &self,
        thread_id: ThreadId,
    ) -> Result<GuiLaunchUrls, GuiLaunchError> {
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
    ) -> impl Future<Output = Result<GuiLaunchUrls, GuiLaunchError>> + Send {
        InProcessAppServerClient::launch_gui_for_thread(self, thread_id)
    }
}

impl AppServerClientGuiExt for RemoteAppServerClient {
    fn launch_gui_for_thread(
        &self,
        thread_id: ThreadId,
    ) -> impl Future<Output = Result<GuiLaunchUrls, GuiLaunchError>> + Send {
        RemoteAppServerClient::launch_gui_for_thread(self, thread_id)
    }
}

impl AppServerClientGuiExt for AppServerClient {
    fn launch_gui_for_thread(
        &self,
        thread_id: ThreadId,
    ) -> impl Future<Output = Result<GuiLaunchUrls, GuiLaunchError>> + Send {
        AppServerClient::launch_gui_for_thread(self, thread_id)
    }
}

#[cfg(test)]
mod tests {
    use pretty_assertions::assert_eq;

    use super::*;

    #[test]
    fn gui_launch_urls_expose_entries() {
        let urls = GuiLaunchUrls {
            entries: vec![GuiLaunchUrlEntry::new(
                GuiLaunchUrlKind::Local,
                "Local",
                "http://127.0.0.1:1234/?threadId=t#token=x",
            )],
        };

        assert_eq!(urls.entries[0].label, "Local");
        assert_eq!(
            urls.entries[0].url,
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
