use codex_extension_api::ExtensionData;
use codex_extension_api::ExtensionRegistryBuilder;
use codex_extension_api::FunctionCallError;
use codex_extension_api::NoopTurnItemEmitter;
use codex_extension_api::ThreadStartInput;
use codex_extension_api::ToolCall;
use codex_extension_api::ToolExecutor;
use codex_extension_api::ToolName;
use codex_extension_api::ToolOutput;
use codex_extension_api::ToolPayload;
use codex_gui_agent_extension::GuiLaunchToolEntryKind;
use codex_gui_agent_extension::GuiLaunchToolError;
use codex_gui_agent_extension::GuiLaunchToolErrorKind;
use codex_gui_agent_extension::GuiLaunchToolService;
use codex_gui_agent_extension::GuiLaunchToolUrlEntry;
use codex_gui_agent_extension::GuiLaunchToolUrls;
use codex_gui_agent_extension::LAUNCH_GUI_TOOL_NAME;
use codex_gui_agent_extension::LaunchGuiToolExecutor;
use codex_gui_agent_extension::create_launch_gui_tool;
use codex_protocol::ThreadId;
use codex_protocol::models::FunctionCallOutputBody;
use codex_protocol::models::ResponseInputItem;
use codex_protocol::protocol::SessionSource;
use codex_protocol::protocol::TruncationPolicy;
use codex_tools::ToolSpec;
use pretty_assertions::assert_eq;
use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;

#[test]
fn launch_gui_tool_schema_is_stable() {
    let spec = create_launch_gui_tool();
    assert_eq!(LAUNCH_GUI_TOOL_NAME, "launch_gui");
    assert_eq!(spec.name(), "launch_gui");
    let ToolSpec::Function(function) = spec else {
        panic!("launch_gui should be a function tool");
    };
    assert!(function.description.contains("local GUI"));
}

#[tokio::test]
async fn launch_gui_tool_returns_urls_json() {
    let tool = launch_gui_tool_with_urls(vec![GuiLaunchToolUrlEntry {
        kind: GuiLaunchToolEntryKind::Local,
        label: "Local".to_string(),
        url: "http://127.0.0.1:1234/?threadId=t#token=x".to_string(),
    }]);
    let output = tool
        .invoke_for_test("{}")
        .await
        .expect("tool should succeed");
    let value: serde_json::Value = serde_json::from_str(&output).expect("json output");
    assert_eq!(
        serde_json::json!({
            "urls": [
                {
                    "kind": "local",
                    "label": "Local",
                    "url": "http://127.0.0.1:1234/?threadId=t#token=x",
                },
            ],
        }),
        value
    );
}

#[tokio::test]
async fn launch_gui_tool_returns_structured_unavailable_error() {
    let tool = launch_gui_tool_with_error(GuiLaunchToolErrorKind::Unavailable, "no active thread");
    let output = tool
        .invoke_for_test("{}")
        .await
        .expect("tool returns model-readable error JSON");
    let value: serde_json::Value = serde_json::from_str(&output).expect("json output");
    assert_eq!(
        serde_json::json!({
            "error": {
                "kind": "unavailable",
                "message": "no active thread",
            },
        }),
        value
    );

    let response = tool
        .invoke_response_for_test("{}")
        .await
        .expect("tool returns model-readable error JSON");
    assert_eq!(Some(false), response.success);
}

#[tokio::test]
async fn launch_gui_tool_rejects_invalid_arguments() {
    let tool = launch_gui_tool_with_urls(Vec::new());

    for arguments in [r#"{"x":1}"#, "[]", "{"] {
        let error = tool
            .invoke_for_test(arguments)
            .await
            .expect_err("invalid arguments should be reported to the model");
        assert!(matches!(error, FunctionCallError::RespondToModel(_)));
    }
}

#[tokio::test]
async fn installed_extension_exposes_launch_gui_when_enabled_for_valid_thread() {
    let thread_id = ThreadId::default().to_string();
    let harness = GuiExtensionHarness::start(TestConfig { enabled: true }, &thread_id).await;

    let config = harness
        .thread_store
        .get::<codex_gui_agent_extension::GuiExtensionConfig>()
        .expect("gui config should be stored");
    assert!(config.enabled);
    assert_eq!(tool_names(&harness), vec!["launch_gui".to_string()]);
}

#[tokio::test]
async fn installed_extension_hides_launch_gui_when_disabled() {
    let thread_id = ThreadId::default().to_string();
    let harness = GuiExtensionHarness::start(TestConfig { enabled: false }, &thread_id).await;

    let config = harness
        .thread_store
        .get::<codex_gui_agent_extension::GuiExtensionConfig>()
        .expect("gui config should be stored");
    assert!(!config.enabled);
    assert_eq!(tool_names(&harness), Vec::<String>::new());
}

#[tokio::test]
async fn installed_extension_hides_launch_gui_for_invalid_thread_id() {
    let harness = GuiExtensionHarness::start(TestConfig { enabled: true }, "not-a-thread-id").await;

    assert_eq!(tool_names(&harness), Vec::<String>::new());
}

#[tokio::test]
async fn config_change_can_hide_and_show_launch_gui_tool() {
    let thread_id = ThreadId::default().to_string();
    let harness = GuiExtensionHarness::start(TestConfig { enabled: true }, &thread_id).await;
    assert_eq!(tool_names(&harness), vec!["launch_gui".to_string()]);

    harness.change_config(TestConfig { enabled: true }, TestConfig { enabled: false });
    assert_eq!(tool_names(&harness), Vec::<String>::new());

    harness.change_config(TestConfig { enabled: false }, TestConfig { enabled: true });
    assert_eq!(tool_names(&harness), vec!["launch_gui".to_string()]);
}

#[derive(Clone, Copy)]
struct TestConfig {
    enabled: bool,
}

struct GuiExtensionHarness {
    registry: codex_extension_api::ExtensionRegistry<TestConfig>,
    session_store: ExtensionData,
    thread_store: ExtensionData,
}

impl GuiExtensionHarness {
    async fn start(config: TestConfig, thread_id: &str) -> Self {
        let mut builder = ExtensionRegistryBuilder::<TestConfig>::new();
        codex_gui_agent_extension::install_with_service(
            &mut builder,
            Arc::new(EmptyGuiLaunchToolService),
            |config: &TestConfig| config.enabled,
        );
        let registry = builder.build();
        let session_store = ExtensionData::new("session-test");
        let thread_store = ExtensionData::new(thread_id);
        let source = SessionSource::Cli;

        for contributor in registry.thread_lifecycle_contributors() {
            contributor
                .on_thread_start(ThreadStartInput {
                    config: &config,
                    session_source: &source,
                    persistent_thread_state_available: true,
                    session_store: &session_store,
                    thread_store: &thread_store,
                })
                .await;
        }

        Self {
            registry,
            session_store,
            thread_store,
        }
    }

    fn change_config(&self, previous_config: TestConfig, new_config: TestConfig) {
        for contributor in self.registry.config_contributors() {
            contributor.on_config_changed(
                &self.session_store,
                &self.thread_store,
                &previous_config,
                &new_config,
            );
        }
    }
}

fn tool_names(harness: &GuiExtensionHarness) -> Vec<String> {
    harness
        .registry
        .tool_contributors()
        .iter()
        .flat_map(|contributor| contributor.tools(&harness.session_store, &harness.thread_store))
        .map(|tool| tool.tool_name().name)
        .collect()
}

struct EmptyGuiLaunchToolService;

impl codex_gui_agent_extension::GuiLaunchToolService for EmptyGuiLaunchToolService {
    fn launch_urls_for_thread(
        &self,
        _thread_id: ThreadId,
    ) -> Pin<
        Box<
            dyn Future<
                    Output = Result<
                        GuiLaunchToolUrls,
                        codex_gui_agent_extension::GuiLaunchToolError,
                    >,
                > + Send
                + '_,
        >,
    > {
        Box::pin(std::future::ready(Ok(GuiLaunchToolUrls {
            entries: Vec::new(),
        })))
    }
}

struct TestToolResponse {
    text: String,
    success: Option<bool>,
}

struct TestLaunchGuiTool {
    executor: LaunchGuiToolExecutor,
}

impl TestLaunchGuiTool {
    async fn invoke_for_test(&self, arguments: &str) -> Result<String, FunctionCallError> {
        Ok(self.invoke_response_for_test(arguments).await?.text)
    }

    async fn invoke_response_for_test(
        &self,
        arguments: &str,
    ) -> Result<TestToolResponse, FunctionCallError> {
        let payload = ToolPayload::Function {
            arguments: arguments.to_string(),
        };
        let output = self
            .executor
            .handle(ToolCall {
                turn_id: "turn-test".to_string(),
                call_id: "call-test".to_string(),
                tool_name: ToolName::plain(LAUNCH_GUI_TOOL_NAME),
                model: "test-model".to_string(),
                truncation_policy: TruncationPolicy::Bytes(4096),
                conversation_history: codex_extension_api::ConversationHistory::default(),
                turn_item_emitter: Arc::new(NoopTurnItemEmitter),
                payload: payload.clone(),
            })
            .await?;

        Ok(response_from_tool_output(output, &payload))
    }
}

fn response_from_tool_output(
    output: Box<dyn ToolOutput>,
    payload: &ToolPayload,
) -> TestToolResponse {
    match output.to_response_item("call-test", payload) {
        ResponseInputItem::FunctionCallOutput { output, .. } => {
            let FunctionCallOutputBody::Text(text) = output.body else {
                panic!("expected text function output");
            };
            TestToolResponse {
                text,
                success: output.success,
            }
        }
        other => panic!("unexpected response item: {other:?}"),
    }
}

fn launch_gui_tool_with_urls(entries: Vec<GuiLaunchToolUrlEntry>) -> TestLaunchGuiTool {
    TestLaunchGuiTool {
        executor: LaunchGuiToolExecutor::new(
            ThreadId::default(),
            Arc::new(FakeGuiLaunchToolService {
                result: Ok(GuiLaunchToolUrls { entries }),
            }),
        ),
    }
}

fn launch_gui_tool_with_error(
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
    result: Result<GuiLaunchToolUrls, GuiLaunchToolError>,
}

impl GuiLaunchToolService for FakeGuiLaunchToolService {
    fn launch_urls_for_thread(
        &self,
        _thread_id: ThreadId,
    ) -> Pin<Box<dyn Future<Output = Result<GuiLaunchToolUrls, GuiLaunchToolError>> + Send + '_>>
    {
        Box::pin(std::future::ready(self.result.clone()))
    }
}
