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
use codex_gui_host::GuiLaunchUrlKind;
use codex_gui_host::GuiLaunchUrls;
use codex_protocol::ThreadId;
use serde::Serialize;
use serde_json::json;

use crate::spec::LAUNCH_GUI_TOOL_NAME;
use crate::spec::create_launch_gui_tool;

/// Host capability used by the GUI agent tool to retrieve launch URLs for a thread.
pub trait GuiLaunchToolService: Send + Sync {
    fn launch_urls_for_thread(
        &self,
        thread_id: ThreadId,
    ) -> Pin<Box<dyn Future<Output = Result<GuiLaunchUrls, GuiLaunchToolError>> + Send + '_>>;
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum GuiLaunchToolErrorKind {
    ConfigError,
    LaunchError,
    Unavailable,
}

impl GuiLaunchToolErrorKind {
    fn as_str(self) -> &'static str {
        match self {
            Self::ConfigError => "config_error",
            Self::LaunchError => "launch_error",
            Self::Unavailable => "unavailable",
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct GuiLaunchToolError {
    kind: GuiLaunchToolErrorKind,
    message: String,
}

impl GuiLaunchToolError {
    pub fn new(kind: GuiLaunchToolErrorKind, message: impl Into<String>) -> Self {
        Self {
            kind,
            message: message.into(),
        }
    }
}

#[derive(Clone)]
pub struct LaunchGuiToolExecutor {
    thread_id: ThreadId,
    service: Arc<dyn GuiLaunchToolService>,
}

impl LaunchGuiToolExecutor {
    pub fn new(thread_id: ThreadId, service: Arc<dyn GuiLaunchToolService>) -> Self {
        Self { thread_id, service }
    }
}

#[async_trait]
impl ToolExecutor<ToolCall> for LaunchGuiToolExecutor {
    fn tool_name(&self) -> ToolName {
        ToolName::plain(LAUNCH_GUI_TOOL_NAME)
    }

    fn spec(&self) -> ToolSpec {
        create_launch_gui_tool()
    }

    async fn handle(&self, invocation: ToolCall) -> Result<Box<dyn ToolOutput>, FunctionCallError> {
        parse_empty_arguments(invocation.function_arguments()?)?;

        match self.service.launch_urls_for_thread(self.thread_id).await {
            Ok(urls) => Ok(Box::new(JsonToolOutput::new(json!({
                "urls": launch_urls_response(urls),
            })))),
            Err(error) => Ok(Box::new(JsonToolOutput::with_success(
                json!({
                    "error": {
                        "kind": error.kind.as_str(),
                        "message": error.message,
                    },
                }),
                Some(false),
            ))),
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LaunchUrlResponse {
    kind: &'static str,
    label: String,
    url: String,
}

fn parse_empty_arguments(arguments: &str) -> Result<(), FunctionCallError> {
    let value = serde_json::from_str::<serde_json::Value>(arguments).map_err(|err| {
        FunctionCallError::RespondToModel(format!("launch_gui arguments must be an object: {err}"))
    })?;
    match value {
        serde_json::Value::Object(object) if object.is_empty() => Ok(()),
        serde_json::Value::Object(_) => Err(FunctionCallError::RespondToModel(
            "launch_gui does not accept arguments".to_string(),
        )),
        _ => Err(FunctionCallError::RespondToModel(
            "launch_gui arguments must be an object".to_string(),
        )),
    }
}

fn launch_urls_response(urls: GuiLaunchUrls) -> Vec<LaunchUrlResponse> {
    urls.entries
        .into_iter()
        .map(|entry| LaunchUrlResponse {
            kind: launch_url_kind(entry.kind),
            label: entry.label,
            url: entry.url,
        })
        .collect()
}

fn launch_url_kind(kind: GuiLaunchUrlKind) -> &'static str {
    match kind {
        GuiLaunchUrlKind::Local => "local",
        GuiLaunchUrlKind::Lan => "lan",
        GuiLaunchUrlKind::Vpn => "vpn",
    }
}
