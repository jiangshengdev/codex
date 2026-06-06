use super::App;
use crate::app_server_session::AppServerSession;
use codex_protocol::ThreadId;

pub(super) const GUI_NO_PRIMARY_THREAD_MESSAGE: &str =
    "A thread must start before /gui can launch.";

pub(super) fn gui_launch_success_message(url: &str) -> String {
    format!("GUI URL: {url}")
}

pub(super) fn gui_launch_error_message(error: &impl std::fmt::Display) -> String {
    format!("Failed to launch GUI: {error}")
}

fn primary_thread_for_gui(primary_thread_id: Option<ThreadId>) -> Result<ThreadId, &'static str> {
    primary_thread_id.ok_or(GUI_NO_PRIMARY_THREAD_MESSAGE)
}

impl App {
    pub(super) async fn launch_gui_for_primary_thread(&mut self, app_server: &AppServerSession) {
        let thread_id = match primary_thread_for_gui(self.primary_thread_id) {
            Ok(thread_id) => thread_id,
            Err(message) => {
                self.chat_widget.add_error_message(message.to_string());
                return;
            }
        };

        match app_server.launch_gui_for_thread(thread_id).await {
            Ok(url) => self
                .chat_widget
                .add_info_message(gui_launch_success_message(url.as_str()), /*hint*/ None),
            Err(error) => self
                .chat_widget
                .add_error_message(gui_launch_error_message(&error)),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use pretty_assertions::assert_eq;

    #[test]
    fn primary_thread_for_gui_requires_primary_thread() {
        assert_eq!(
            primary_thread_for_gui(/*primary_thread_id*/ None),
            Err(GUI_NO_PRIMARY_THREAD_MESSAGE)
        );
    }

    #[test]
    fn primary_thread_for_gui_returns_primary_thread() {
        let thread_id = ThreadId::new();

        assert_eq!(primary_thread_for_gui(Some(thread_id)), Ok(thread_id));
    }

    #[test]
    fn gui_launch_message_formats_url_without_opening_browser() {
        assert_eq!(
            gui_launch_success_message(
                "http://127.0.0.1:12345/?threadId=00000000-0000-0000-0000-000000000606#token=test"
            ),
            "GUI URL: http://127.0.0.1:12345/?threadId=00000000-0000-0000-0000-000000000606#token=test"
        );
    }
}
