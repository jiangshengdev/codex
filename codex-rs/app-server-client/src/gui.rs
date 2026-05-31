//! GUI launch URL extension for the app-server client facade.
//!
//! The TUI requests a launch URL through this client extension. The app-server
//! runtime owns the GUI host lifecycle; client surfaces do not hold a `GuiHost`
//! or raw backend handle.

/// Launch URL returned by a client that can expose the local GUI.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GuiLaunchUrl {
    pub url: String,
}

/// Error returned while requesting a GUI launch URL.
#[derive(Debug)]
pub enum GuiLaunchError {
    Unsupported,
    Transport(std::io::Error),
}

impl std::fmt::Display for GuiLaunchError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Unsupported => write!(f, "GUI is not available for this session"),
            Self::Transport(err) => write!(f, "{err}"),
        }
    }
}

impl std::error::Error for GuiLaunchError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Unsupported => None,
            Self::Transport(err) => Some(err),
        }
    }
}

/// Extension trait for app-server clients that may provide a GUI launch URL.
///
/// Implementations should return [`GuiLaunchError::Unsupported`] when the
/// current transport or session cannot host a GUI, and
/// [`GuiLaunchError::Transport`] for I/O failures while obtaining the URL.
pub trait AppServerClientGuiExt {
    fn gui_launch_url(
        &self,
        primary_thread_id: &str,
    ) -> impl std::future::Future<Output = Result<GuiLaunchUrl, GuiLaunchError>> + Send;
}

async fn gui_launch_url_for_manager(
    manager: Option<std::sync::Arc<codex_app_server::gui_host::GuiHostManager>>,
    thread_id: String,
) -> Result<GuiLaunchUrl, GuiLaunchError> {
    let Some(manager) = manager else {
        return Err(GuiLaunchError::Transport(std::io::Error::new(
            std::io::ErrorKind::BrokenPipe,
            "GUI host manager is unavailable after shutdown",
        )));
    };
    manager
        .launch_url_for_thread(&thread_id)
        .await
        .map(|url| GuiLaunchUrl { url })
        .map_err(|err| GuiLaunchError::Transport(std::io::Error::other(err.to_string())))
}

impl AppServerClientGuiExt for crate::remote::RemoteAppServerClient {
    fn gui_launch_url(
        &self,
        _primary_thread_id: &str,
    ) -> impl std::future::Future<Output = Result<GuiLaunchUrl, GuiLaunchError>> + Send {
        std::future::ready(Err(GuiLaunchError::Unsupported))
    }
}

impl AppServerClientGuiExt for crate::InProcessAppServerClient {
    fn gui_launch_url(
        &self,
        primary_thread_id: &str,
    ) -> impl std::future::Future<Output = Result<GuiLaunchUrl, GuiLaunchError>> + Send {
        let manager = self.gui_host_manager();
        let thread_id = primary_thread_id.to_string();
        gui_launch_url_for_manager(manager, thread_id)
    }
}

impl AppServerClientGuiExt for crate::AppServerClient {
    fn gui_launch_url(
        &self,
        primary_thread_id: &str,
    ) -> impl std::future::Future<Output = Result<GuiLaunchUrl, GuiLaunchError>> + Send {
        let thread_id = primary_thread_id.to_string();
        let manager = match self {
            crate::AppServerClient::InProcess(client) => Some(client.gui_host_manager()),
            crate::AppServerClient::Remote(_) => None,
        };
        async move {
            match manager {
                Some(manager) => gui_launch_url_for_manager(manager, thread_id).await,
                None => Err(GuiLaunchError::Unsupported),
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use pretty_assertions::assert_eq;

    #[test]
    fn gui_launch_error_variants_are_distinct() {
        let unsupported = GuiLaunchError::Unsupported;
        let transport = GuiLaunchError::Transport(std::io::Error::new(
            std::io::ErrorKind::BrokenPipe,
            "closed",
        ));

        assert_eq!(
            unsupported.to_string(),
            "GUI is not available for this session"
        );
        assert!(transport.to_string().contains("closed"));
    }

    #[test]
    fn remote_client_implements_gui_extension() {
        fn assert_impl<T: AppServerClientGuiExt>() {}
        assert_impl::<crate::remote::RemoteAppServerClient>();
    }

    #[test]
    fn facade_client_implements_gui_extension() {
        fn assert_impl<T: AppServerClientGuiExt>() {}
        assert_impl::<crate::AppServerClient>();
    }
}
