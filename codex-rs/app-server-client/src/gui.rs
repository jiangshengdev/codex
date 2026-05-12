//! GUI launch URL extension for the app-server client facade.
//!
//! Plan 06 lands the trait, the public types, and the remote implementation
//! (which returns [`GuiLaunchError::Unsupported`] because GUI launch across a
//! remote app-server process is out of MVP scope).
//!
//! The in-process implementation is added by plan 02: plan 02 introduces
//! `codex-app-server::gui_host::GuiHostManager`, stores an
//! `Arc<GuiHostManager>` on `InProcessAppServerClient`, and writes the
//! in-process [`AppServerClientGuiExt`] impl there. Plan 06 does not depend on
//! `codex-app-server` and does not start a `GuiHost` itself.

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
}
