use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;

use async_trait::async_trait;
use codex_extension_api::FunctionCallError;
use codex_extension_api::JsonToolOutput;
use codex_extension_api::ToolCall;
use codex_extension_api::ToolExecutor;
use codex_extension_api::ToolName;
use codex_extension_api::ToolOutput;
use codex_extension_api::ToolSpec;
use codex_gui_host::GuiLaunchUrlEntry;
use codex_gui_host::GuiLaunchUrlKind;
use codex_gui_host::GuiLaunchUrls;
use codex_protocol::ThreadId;
use serde::Deserialize;
use serde::Serialize;

use crate::spec::LAUNCH_GUI_TOOL_NAME;
use crate::spec::create_launch_gui_tool;

pub type GuiLaunchFuture<'a> =
    Pin<Box<dyn Future<Output = Result<GuiLaunchUrls, String>> + Send + 'a>>;

/// Launches or reuses the local GUI host for a specific thread.
///
/// Implementations are host-owned. They receive the current thread from the
/// extension runtime and must not derive it from model input.
pub trait GuiLauncher: Send + Sync {
    fn launch_gui_for_thread(&self, thread_id: ThreadId) -> GuiLaunchFuture<'_>;
}

#[derive(Clone)]
pub(crate) struct GuiToolExecutor {
    thread_id: ThreadId,
    launcher: Arc<dyn GuiLauncher>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct LaunchGuiArgs {}

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
struct GuiLaunchResponse {
    urls: Vec<GuiLaunchUrlResponse>,
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
struct GuiLaunchUrlResponse {
    kind: &'static str,
    label: String,
    url: String,
}

impl GuiToolExecutor {
    pub(crate) fn new(thread_id: ThreadId, launcher: Arc<dyn GuiLauncher>) -> Self {
        Self {
            thread_id,
            launcher,
        }
    }
}

#[async_trait]
impl ToolExecutor<ToolCall> for GuiToolExecutor {
    fn tool_name(&self) -> ToolName {
        ToolName::plain(LAUNCH_GUI_TOOL_NAME)
    }

    fn spec(&self) -> ToolSpec {
        create_launch_gui_tool()
    }

    async fn handle(&self, invocation: ToolCall) -> Result<Box<dyn ToolOutput>, FunctionCallError> {
        let _args: LaunchGuiArgs = parse_arguments(invocation.function_arguments()?)?;
        let urls = self
            .launcher
            .launch_gui_for_thread(self.thread_id)
            .await
            .map_err(|err| {
                FunctionCallError::RespondToModel(format!("failed to launch GUI: {err}"))
            })?;
        let value = serde_json::to_value(GuiLaunchResponse::from(urls))
            .map_err(|err| FunctionCallError::Fatal(err.to_string()))?;
        Ok(Box::new(JsonToolOutput::new(value)))
    }
}

impl From<GuiLaunchUrls> for GuiLaunchResponse {
    fn from(value: GuiLaunchUrls) -> Self {
        Self {
            urls: value.entries.into_iter().map(Into::into).collect(),
        }
    }
}

impl From<GuiLaunchUrlEntry> for GuiLaunchUrlResponse {
    fn from(value: GuiLaunchUrlEntry) -> Self {
        Self {
            kind: match value.kind {
                GuiLaunchUrlKind::Local => "local",
                GuiLaunchUrlKind::Lan => "lan",
                GuiLaunchUrlKind::Vpn => "vpn",
            },
            label: value.label,
            url: value.url,
        }
    }
}

fn parse_arguments<T>(arguments: &str) -> Result<T, FunctionCallError>
where
    T: for<'de> Deserialize<'de>,
{
    serde_json::from_str(arguments)
        .map_err(|err| FunctionCallError::RespondToModel(err.to_string()))
}

#[cfg(test)]
mod tests {
    use std::sync::Mutex;

    use codex_extension_api::ConversationHistory;
    use codex_extension_api::NoopTurnItemEmitter;
    use codex_extension_api::ToolPayload;
    use codex_protocol::protocol::TruncationPolicy;
    use pretty_assertions::assert_eq;
    use serde_json::json;

    use super::*;

    #[tokio::test]
    async fn executor_launches_current_thread_and_serializes_urls() {
        let thread_id = test_thread_id();
        let launcher = Arc::new(FakeGuiLauncher::success(GuiLaunchUrls {
            entries: vec![GuiLaunchUrlEntry::new(
                GuiLaunchUrlKind::Local,
                "Local",
                "http://127.0.0.1:4567/?threadId=thread#token=test-token",
            )],
        }));
        let executor = GuiToolExecutor::new(thread_id, launcher.clone());
        let invocation = tool_call(json!({}));

        let output = executor
            .handle(invocation.clone())
            .await
            .expect("launch_gui should succeed");

        assert_eq!(launcher.recorded_thread_id(), Some(thread_id));
        assert_eq!(
            output.code_mode_result(&invocation.payload),
            json!({
                "urls": [
                    {
                        "kind": "local",
                        "label": "Local",
                        "url": "http://127.0.0.1:4567/?threadId=thread#token=test-token",
                    },
                ],
            })
        );
    }

    #[tokio::test]
    async fn executor_returns_model_readable_launch_error() {
        let thread_id = test_thread_id();
        let executor = GuiToolExecutor::new(
            thread_id,
            Arc::new(FakeGuiLauncher::failure(
                "GUI launch is not configured".to_string(),
            )),
        );

        let error = match executor.handle(tool_call(json!({}))).await {
            Ok(_) => panic!("launch_gui should fail"),
            Err(error) => error,
        };

        assert_eq!(
            error.to_string(),
            "failed to launch GUI: GUI launch is not configured"
        );
    }

    #[derive(Debug)]
    enum FakeLaunchResult {
        Success(GuiLaunchUrls),
        Failure(String),
    }

    #[derive(Debug)]
    struct FakeGuiLauncher {
        result: Mutex<FakeLaunchResult>,
        recorded_thread_id: Mutex<Option<ThreadId>>,
    }

    impl FakeGuiLauncher {
        fn success(urls: GuiLaunchUrls) -> Self {
            Self {
                result: Mutex::new(FakeLaunchResult::Success(urls)),
                recorded_thread_id: Mutex::new(None),
            }
        }

        fn failure(error: String) -> Self {
            Self {
                result: Mutex::new(FakeLaunchResult::Failure(error)),
                recorded_thread_id: Mutex::new(None),
            }
        }

        fn recorded_thread_id(&self) -> Option<ThreadId> {
            *self
                .recorded_thread_id
                .lock()
                .expect("recorded thread id lock should not be poisoned")
        }
    }

    impl GuiLauncher for FakeGuiLauncher {
        fn launch_gui_for_thread(&self, thread_id: ThreadId) -> GuiLaunchFuture<'_> {
            *self
                .recorded_thread_id
                .lock()
                .expect("recorded thread id lock should not be poisoned") = Some(thread_id);
            let result = match &*self
                .result
                .lock()
                .expect("result lock should not be poisoned")
            {
                FakeLaunchResult::Success(urls) => Ok(urls.clone()),
                FakeLaunchResult::Failure(error) => Err(error.clone()),
            };
            Box::pin(std::future::ready(result))
        }
    }

    fn tool_call(arguments: serde_json::Value) -> ToolCall {
        ToolCall {
            turn_id: "turn-1".to_string(),
            call_id: "call-1".to_string(),
            tool_name: ToolName::plain(LAUNCH_GUI_TOOL_NAME),
            model: "gpt-test".to_string(),
            truncation_policy: TruncationPolicy::Bytes(1024),
            conversation_history: ConversationHistory::default(),
            turn_item_emitter: Arc::new(NoopTurnItemEmitter),
            payload: ToolPayload::Function {
                arguments: arguments.to_string(),
            },
        }
    }

    fn test_thread_id() -> ThreadId {
        ThreadId::from_string("11111111-1111-4111-8111-111111111111")
            .expect("test thread id should parse")
    }
}
