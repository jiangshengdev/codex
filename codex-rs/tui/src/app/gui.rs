use super::*;
use crate::app_server_session::AppServerSession;
use codex_app_server_client::GuiLaunchError;
use codex_app_server_client::GuiLaunchUrl;
use codex_protocol::ThreadId;

#[derive(Debug, PartialEq, Eq)]
enum GuiLaunchMessage {
    Info(String),
    Error(String),
}

fn launch_result_message(result: Result<GuiLaunchUrl, GuiLaunchError>) -> GuiLaunchMessage {
    match result {
        Ok(launch) => GuiLaunchMessage::Info(format!(
            "GUI ready:\n{}\nOpen this URL in a browser on this machine.",
            launch.url
        )),
        Err(GuiLaunchError::Unsupported) => GuiLaunchMessage::Info(
            "GUI is not available for this app-server session yet.".to_string(),
        ),
        Err(GuiLaunchError::Transport(err)) => {
            GuiLaunchMessage::Error(format!("Failed to open GUI: {err}"))
        }
    }
}

/// Small launcher trait so `open_gui_inner` can be unit-tested without
/// booting a real `AppServerSession`.
pub(crate) trait GuiLauncher {
    fn gui_launch_url(
        &self,
        primary_thread_id: ThreadId,
    ) -> impl std::future::Future<Output = Result<GuiLaunchUrl, GuiLaunchError>> + Send;
}

impl GuiLauncher for AppServerSession {
    fn gui_launch_url(
        &self,
        primary_thread_id: ThreadId,
    ) -> impl std::future::Future<Output = Result<GuiLaunchUrl, GuiLaunchError>> + Send {
        AppServerSession::gui_launch_url(self, primary_thread_id)
    }
}

/// Presentation sink abstraction so `open_gui_inner` can be unit-tested
/// without observing `ChatWidget` internal history state.
pub(crate) trait GuiMessageSink {
    fn add_info(&mut self, message: String);
    fn add_error(&mut self, message: String);
}

impl GuiMessageSink for ChatWidget {
    fn add_info(&mut self, message: String) {
        self.add_info_message(message, /*hint*/ None);
    }

    fn add_error(&mut self, message: String) {
        self.add_error_message(message);
    }
}

impl App {
    pub(crate) async fn open_gui(&mut self, app_server: &AppServerSession) {
        open_gui_inner(self.primary_thread_id, app_server, &mut self.chat_widget).await;
    }
}

pub(crate) async fn open_gui_inner<L, S>(
    primary_thread_id: Option<ThreadId>,
    launcher: &L,
    sink: &mut S,
) where
    L: GuiLauncher + ?Sized,
    S: GuiMessageSink + ?Sized,
{
    let Some(primary_thread_id) = primary_thread_id else {
        sink.add_info("Current session is not ready to open GUI.".to_string());
        return;
    };

    match launch_result_message(launcher.gui_launch_url(primary_thread_id).await) {
        GuiLaunchMessage::Info(message) => sink.add_info(message),
        GuiLaunchMessage::Error(message) => sink.add_error(message),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use pretty_assertions::assert_eq;
    use std::sync::Mutex;

    #[test]
    fn launch_url_result_renders_url_message() {
        let message = launch_result_message(Ok(GuiLaunchUrl {
            url: "http://127.0.0.1:4321/?threadId=thread-a#token=secret".to_string(),
        }));

        assert_eq!(
            message,
            GuiLaunchMessage::Info(
                "GUI ready:\nhttp://127.0.0.1:4321/?threadId=thread-a#token=secret\nOpen this URL in a browser on this machine.".to_string()
            )
        );
    }

    #[test]
    fn launch_url_result_renders_unsupported_message() {
        let message = launch_result_message(Err(GuiLaunchError::Unsupported));

        assert_eq!(
            message,
            GuiLaunchMessage::Info(
                "GUI is not available for this app-server session yet.".to_string()
            )
        );
    }

    #[test]
    fn launch_url_result_renders_transport_error() {
        let message = launch_result_message(Err(GuiLaunchError::Transport(std::io::Error::new(
            std::io::ErrorKind::BrokenPipe,
            "worker stopped",
        ))));

        assert_eq!(
            message,
            GuiLaunchMessage::Error("Failed to open GUI: worker stopped".to_string())
        );
    }

    struct StubGuiLauncher {
        calls: Mutex<Vec<ThreadId>>,
        response: Mutex<Option<Result<GuiLaunchUrl, GuiLaunchError>>>,
    }

    impl StubGuiLauncher {
        fn ok(url: &str) -> Self {
            Self {
                calls: Mutex::new(Vec::new()),
                response: Mutex::new(Some(Ok(GuiLaunchUrl {
                    url: url.to_string(),
                }))),
            }
        }
    }

    impl GuiLauncher for StubGuiLauncher {
        fn gui_launch_url(
            &self,
            primary_thread_id: ThreadId,
        ) -> impl std::future::Future<Output = Result<GuiLaunchUrl, GuiLaunchError>> + Send
        {
            self.calls.lock().unwrap().push(primary_thread_id);
            let response = self
                .response
                .lock()
                .unwrap()
                .take()
                .expect("stub response must be primed before each call");
            async move { response }
        }
    }

    #[derive(Default)]
    struct RecordingSink {
        info: Vec<String>,
        error: Vec<String>,
    }

    impl GuiMessageSink for RecordingSink {
        fn add_info(&mut self, message: String) {
            self.info.push(message);
        }

        fn add_error(&mut self, message: String) {
            self.error.push(message);
        }
    }

    fn test_thread_id() -> ThreadId {
        ThreadId::from_string("00000000-0000-0000-0000-000000000001").expect("valid uuid")
    }

    #[tokio::test]
    async fn open_gui_without_primary_thread_shows_not_ready_info() {
        let launcher = StubGuiLauncher::ok("unused");
        let mut sink = RecordingSink::default();

        open_gui_inner::<_, _>(None, &launcher, &mut sink).await;

        assert!(
            launcher.calls.lock().unwrap().is_empty(),
            "must not call launcher without a primary thread"
        );
        assert!(sink.error.is_empty(), "error path not expected");
        assert_eq!(
            sink.info,
            vec!["Current session is not ready to open GUI.".to_string()]
        );
    }

    #[tokio::test]
    async fn open_gui_with_primary_thread_calls_launcher_and_renders_url() {
        let thread_id = test_thread_id();
        let launcher = StubGuiLauncher::ok(
            "http://127.0.0.1:4321/?threadId=00000000-0000-0000-0000-000000000001#token=secret",
        );
        let mut sink = RecordingSink::default();

        open_gui_inner::<_, _>(Some(thread_id), &launcher, &mut sink).await;

        let calls = launcher.calls.lock().unwrap();
        assert_eq!(calls.len(), 1);
        assert_eq!(
            calls[0], thread_id,
            "launcher must be called with the primary thread id"
        );
        assert!(sink.error.is_empty(), "error path not expected on success");
        assert_eq!(sink.info.len(), 1, "exactly one info message expected");
        assert!(sink.info[0].contains("http://127.0.0.1:4321"));
    }
}
