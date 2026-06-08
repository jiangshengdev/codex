use super::App;
use crate::app_server_session::AppServerSession;
use codex_app_server_client::GuiLaunchUrls;
use codex_protocol::ThreadId;
use ratatui::style::Stylize;
use ratatui::text::Line;

pub(super) const GUI_NO_PRIMARY_THREAD_MESSAGE: &str =
    "A thread must start before /gui can launch.";

pub(super) fn gui_launch_success_lines(urls: &GuiLaunchUrls) -> Vec<Line<'static>> {
    let max_label_width = urls
        .entries
        .iter()
        .map(|entry| entry.label.len())
        .max()
        .unwrap_or(0);
    let mut lines: Vec<Line<'static>> = vec![vec!["• ".dim(), "GUI URLs:".into()].into()];
    for entry in &urls.entries {
        let padding = " ".repeat(max_label_width.saturating_sub(entry.label.len()) + 1);
        lines.push(format!("  {}:{}{}", entry.label, padding, entry.url).into());
    }
    lines
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
                .add_plain_history_lines(gui_launch_success_lines(&urls)),
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
            line_texts(gui_launch_success_lines(&urls)),
            vec![
                "• GUI URLs:",
                "  Local: http://127.0.0.1:12345/?threadId=t#token=x",
                "  LAN:   http://192.168.3.165:12345/?threadId=t#token=x",
                "  VPN:   http://100.88.28.119:12345/?threadId=t#token=x",
            ]
        );
    }

    #[test]
    fn gui_launch_message_lines_do_not_embed_newlines() {
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

        let lines = gui_launch_success_lines(&urls);

        assert_eq!(lines.len(), 4);
        assert!(
            lines
                .iter()
                .flat_map(|line| &line.spans)
                .all(|span| !span.content.contains('\n'))
        );
    }

    fn line_texts(lines: Vec<Line<'static>>) -> Vec<String> {
        lines
            .into_iter()
            .map(|line| {
                line.spans
                    .into_iter()
                    .map(|span| span.content.into_owned())
                    .collect()
            })
            .collect()
    }
}
