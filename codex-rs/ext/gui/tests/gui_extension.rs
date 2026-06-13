use codex_extension_api::ExtensionData;
use codex_extension_api::ExtensionRegistryBuilder;
use codex_extension_api::FunctionCallError;
use codex_extension_api::NoopTurnItemEmitter;
use codex_extension_api::ThreadStartInput;
use codex_extension_api::ToolCall;
use codex_extension_api::ToolExecutor;
use codex_extension_api::ToolName;
use codex_extension_api::ToolPayload;
use codex_gui_agent_extension::GuiLaunchToolError;
use codex_gui_agent_extension::GuiLaunchToolErrorKind;
use codex_gui_agent_extension::GuiLaunchToolService;
use codex_gui_agent_extension::LAUNCH_GUI_TOOL_NAME;
use codex_gui_agent_extension::LaunchGuiToolExecutor;
use codex_gui_agent_extension::create_launch_gui_tool;
use codex_gui_host::GuiLaunchUrlEntry;
use codex_gui_host::GuiLaunchUrlKind;
use codex_gui_host::GuiLaunchUrls;
use codex_protocol::ThreadId;
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
    let tool = launch_gui_tool_with_urls(vec![(
        "local",
        "Local",
        "http://127.0.0.1:1234/?threadId=t#token=x",
    )]);
    let output = tool
        .invoke_for_test("{}")
        .await
        .expect("tool should succeed");
    let value: serde_json::Value = serde_json::from_str(&output).expect("json output");
    assert_eq!(value["urls"][0]["kind"], "local");
    assert_eq!(value["urls"][0]["label"], "Local");
}

#[tokio::test]
async fn launch_gui_tool_returns_structured_unavailable_error() {
    let tool = launch_gui_tool_with_error(GuiLaunchToolErrorKind::Unavailable, "no active thread");
    let output = tool
        .invoke_for_test("{}")
        .await
        .expect("tool returns model-readable error JSON");
    let value: serde_json::Value = serde_json::from_str(&output).expect("json output");
    assert_eq!(value["error"]["kind"], "unavailable");
    assert_eq!(value["error"]["message"], "no active thread");
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
                    Output = Result<GuiLaunchUrls, codex_gui_agent_extension::GuiLaunchToolError>,
                > + Send
                + '_,
        >,
    > {
        Box::pin(std::future::ready(Ok(GuiLaunchUrls {
            entries: Vec::new(),
        })))
    }
}

struct TestLaunchGuiTool {
    executor: LaunchGuiToolExecutor,
}

impl TestLaunchGuiTool {
    async fn invoke_for_test(&self, arguments: &str) -> Result<String, FunctionCallError> {
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

        Ok(output.code_mode_result(&payload).to_string())
    }
}

fn launch_gui_tool_with_urls(urls: Vec<(&str, &str, &str)>) -> TestLaunchGuiTool {
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
    result: Result<GuiLaunchUrls, GuiLaunchToolError>,
}

impl GuiLaunchToolService for FakeGuiLaunchToolService {
    fn launch_urls_for_thread(
        &self,
        _thread_id: ThreadId,
    ) -> Pin<Box<dyn Future<Output = Result<GuiLaunchUrls, GuiLaunchToolError>> + Send + '_>> {
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
