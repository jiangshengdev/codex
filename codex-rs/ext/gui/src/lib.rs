mod extension;
mod spec;
mod tool;

pub use extension::GuiExtension;
pub use extension::GuiExtensionConfig;
pub use extension::install_with_service;
pub use spec::LAUNCH_GUI_TOOL_NAME;
pub use spec::create_launch_gui_tool;
pub use tool::GuiLaunchToolError;
pub use tool::GuiLaunchToolErrorKind;
pub use tool::GuiLaunchToolService;
pub use tool::LaunchGuiToolExecutor;

pub mod test_support {
    use std::future::Future;
    use std::pin::Pin;
    use std::sync::Arc;

    use codex_extension_api::ConversationHistory;
    use codex_extension_api::FunctionCallError;
    use codex_extension_api::NoopTurnItemEmitter;
    use codex_extension_api::ToolCall;
    use codex_extension_api::ToolExecutor;
    use codex_extension_api::ToolName;
    use codex_extension_api::ToolPayload;
    use codex_gui_host::GuiLaunchUrlEntry;
    use codex_gui_host::GuiLaunchUrlKind;
    use codex_gui_host::GuiLaunchUrls;
    use codex_protocol::ThreadId;
    use codex_utils_output_truncation::TruncationPolicy;

    use crate::GuiLaunchToolError;
    use crate::GuiLaunchToolErrorKind;
    use crate::GuiLaunchToolService;
    use crate::LaunchGuiToolExecutor;

    pub struct TestLaunchGuiTool {
        executor: LaunchGuiToolExecutor,
    }

    impl TestLaunchGuiTool {
        pub async fn invoke_for_test(&self, arguments: &str) -> Result<String, FunctionCallError> {
            let payload = ToolPayload::Function {
                arguments: arguments.to_string(),
            };
            let output = self
                .executor
                .handle(ToolCall {
                    turn_id: "turn-test".to_string(),
                    call_id: "call-test".to_string(),
                    tool_name: ToolName::plain(crate::LAUNCH_GUI_TOOL_NAME),
                    model: "test-model".to_string(),
                    truncation_policy: TruncationPolicy::Bytes(4096),
                    conversation_history: ConversationHistory::default(),
                    turn_item_emitter: Arc::new(NoopTurnItemEmitter),
                    payload: payload.clone(),
                })
                .await?;

            Ok(output.code_mode_result(&payload).to_string())
        }
    }

    pub fn launch_gui_tool_with_urls(urls: Vec<(&str, &str, &str)>) -> TestLaunchGuiTool {
        let entries = urls
            .into_iter()
            .map(|(kind, label, url)| {
                GuiLaunchUrlEntry::new(kind_from_str(kind), label.to_string(), url.to_string())
            })
            .collect();
        TestLaunchGuiTool {
            executor: LaunchGuiToolExecutor::new(
                ThreadId::default(),
                Arc::new(FakeGuiLaunchToolService {
                    result: Ok(GuiLaunchUrls { entries }),
                }),
            ),
        }
    }

    pub fn launch_gui_tool_with_error(
        kind: GuiLaunchToolErrorKind,
        message: impl Into<String>,
    ) -> TestLaunchGuiTool {
        TestLaunchGuiTool {
            executor: LaunchGuiToolExecutor::new(
                ThreadId::default(),
                Arc::new(FakeGuiLaunchToolService {
                    result: Err(GuiLaunchToolError::new(kind, message)),
                }),
            ),
        }
    }

    #[derive(Clone)]
    struct FakeGuiLaunchToolService {
        result: Result<GuiLaunchUrls, GuiLaunchToolError>,
    }

    impl GuiLaunchToolService for FakeGuiLaunchToolService {
        fn launch_urls_for_thread(
            &self,
            _thread_id: ThreadId,
        ) -> Pin<Box<dyn Future<Output = Result<GuiLaunchUrls, GuiLaunchToolError>> + Send + '_>>
        {
            Box::pin(std::future::ready(self.result.clone()))
        }
    }

    fn kind_from_str(kind: &str) -> GuiLaunchUrlKind {
        match kind {
            "local" => GuiLaunchUrlKind::Local,
            "lan" => GuiLaunchUrlKind::Lan,
            "vpn" => GuiLaunchUrlKind::Vpn,
            other => panic!("unsupported test URL kind: {other}"),
        }
    }
}
