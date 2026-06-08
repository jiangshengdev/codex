use super::App;
use crate::app_server_session::AppServerSession;
use codex_app_server_client::GuiLaunchUrls;
use codex_protocol::ThreadId;

pub(super) const GUI_NO_PRIMARY_THREAD_MESSAGE: &str =
    "A thread must start before /gui can launch.";

pub(super) fn gui_launch_success_message(urls: &GuiLaunchUrls) -> String {
    let max_label_width = urls
        .entries
        .iter()
        .map(|entry| entry.label.len())
        .max()
        .unwrap_or(0);
    let mut message = String::from("GUI URLs:");
    for entry in &urls.entries {
        let padding = " ".repeat(max_label_width.saturating_sub(entry.label.len()) + 1);
        message.push_str(&format!("\n  {}:{}{}", entry.label, padding, entry.url));
    }
    message
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
            Ok(urls) => self
                .chat_widget
                .add_info_message(gui_launch_success_message(&urls), /*hint*/ None),
            Err(error) => self
                .chat_widget
                .add_error_message(gui_launch_error_message(&error)),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use codex_app_server_client::GuiLaunchUrlEntry;
    use codex_app_server_client::GuiLaunchUrlKind;
    use codex_app_server_client::GuiLaunchUrls;
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
    fn gui_launch_message_formats_multiple_urls() {
        let urls = GuiLaunchUrls {
            entries: vec![
                GuiLaunchUrlEntry::new(
                    GuiLaunchUrlKind::Local,
                    "Local",
                    "http://127.0.0.1:12345/?threadId=t#token=x",
                ),
                GuiLaunchUrlEntry::new(
                    GuiLaunchUrlKind::Lan,
                    "LAN",
                    "http://192.168.3.165:12345/?threadId=t#token=x",
                ),
                GuiLaunchUrlEntry::new(
                    GuiLaunchUrlKind::Vpn,
                    "VPN",
                    "http://100.88.28.119:12345/?threadId=t#token=x",
                ),
            ],
        };

        assert_eq!(
            gui_launch_success_message(&urls),
            "GUI URLs:\n  Local: http://127.0.0.1:12345/?threadId=t#token=x\n  LAN:   http://192.168.3.165:12345/?threadId=t#token=x\n  VPN:   http://100.88.28.119:12345/?threadId=t#token=x"
        );
    }
}
