use std::sync::Arc;

use codex_extension_api::ExtensionData;
use codex_extension_api::ExtensionRegistryBuilder;
use codex_extension_api::ThreadLifecycleContributor;
use codex_extension_api::ThreadStartInput;
use codex_extension_api::ToolCall;
use codex_extension_api::ToolContributor;
use codex_extension_api::ToolExecutor;
use codex_protocol::ThreadId;
use codex_protocol::protocol::SessionSource;
use codex_protocol::protocol::SubAgentSource;

use crate::tool::GuiLauncher;
use crate::tool::GuiToolExecutor;

#[derive(Clone)]
struct GuiExtension {
    launcher: Arc<dyn GuiLauncher>,
}

#[derive(Clone, Debug)]
struct GuiExtensionConfig {
    available: bool,
    thread_id: ThreadId,
}

#[async_trait::async_trait]
impl<C> ThreadLifecycleContributor<C> for GuiExtension
where
    C: Send + Sync + 'static,
{
    async fn on_thread_start(&self, input: ThreadStartInput<'_, C>) {
        let Ok(thread_id) = ThreadId::from_string(input.thread_store.level_id()) else {
            return;
        };
        let available = !matches!(
            input.session_source,
            SessionSource::SubAgent(SubAgentSource::Review)
        );
        input.thread_store.insert(GuiExtensionConfig {
            available,
            thread_id,
        });
    }
}

impl ToolContributor for GuiExtension {
    fn tools(
        &self,
        _session_store: &ExtensionData,
        thread_store: &ExtensionData,
    ) -> Vec<Arc<dyn ToolExecutor<ToolCall>>> {
        let Some(config) = thread_store.get::<GuiExtensionConfig>() else {
            return Vec::new();
        };
        if !config.available {
            return Vec::new();
        }

        vec![Arc::new(GuiToolExecutor::new(
            config.thread_id,
            Arc::clone(&self.launcher),
        ))]
    }
}

pub fn install<C>(registry: &mut ExtensionRegistryBuilder<C>, launcher: Arc<dyn GuiLauncher>)
where
    C: Send + Sync + 'static,
{
    let extension = Arc::new(GuiExtension { launcher });
    registry.thread_lifecycle_contributor(extension.clone());
    registry.tool_contributor(extension);
}

#[cfg(test)]
mod tests {
    use std::sync::Mutex;

    use codex_extension_api::ConversationHistory;
    use codex_extension_api::ExtensionData;
    use codex_extension_api::NoopTurnItemEmitter;
    use codex_extension_api::ThreadStartInput;
    use codex_extension_api::ToolName;
    use codex_extension_api::ToolPayload;
    use codex_gui_host::GuiLaunchUrls;
    use codex_protocol::protocol::SessionSource;
    use codex_protocol::protocol::SubAgentSource;
    use codex_protocol::protocol::TruncationPolicy;
    use pretty_assertions::assert_eq;
    use serde_json::json;

    use super::*;
    use crate::LAUNCH_GUI_TOOL_NAME;

    #[tokio::test]
    async fn installed_extension_contributes_launch_gui_for_normal_thread() {
        let registry = installed_registry();
        let session_store = ExtensionData::new("session");
        let thread_id = test_thread_id();
        let thread_store = ExtensionData::new(thread_id.to_string());
        start_thread(&registry, &session_store, &thread_store, SessionSource::Cli).await;

        let tool_names = tool_names(&registry, &session_store, &thread_store);

        assert_eq!(tool_names, vec![ToolName::plain(LAUNCH_GUI_TOOL_NAME)]);
    }

    #[tokio::test]
    async fn installed_extension_contributes_no_tool_for_review_subagent() {
        let registry = installed_registry();
        let session_store = ExtensionData::new("session");
        let thread_store = ExtensionData::new(test_thread_id().to_string());
        start_thread(
            &registry,
            &session_store,
            &thread_store,
            SessionSource::SubAgent(SubAgentSource::Review),
        )
        .await;

        let tool_names = tool_names(&registry, &session_store, &thread_store);

        assert_eq!(tool_names, Vec::<ToolName>::new());
    }

    #[test]
    fn installed_extension_contributes_no_tool_when_unavailable() {
        let registry = installed_registry();
        let session_store = ExtensionData::new("session");
        let thread_store = ExtensionData::new(test_thread_id().to_string());
        thread_store.insert(GuiExtensionConfig {
            available: false,
            thread_id: test_thread_id(),
        });

        let tool_names = tool_names(&registry, &session_store, &thread_store);

        assert_eq!(tool_names, Vec::<ToolName>::new());
    }

    #[tokio::test]
    async fn contributed_tool_launches_with_current_thread_id() {
        let launcher = Arc::new(FakeGuiLauncher::default());
        let mut builder = ExtensionRegistryBuilder::<()>::new();
        install(&mut builder, launcher.clone());
        let registry = builder.build();
        let session_store = ExtensionData::new("session");
        let thread_id = test_thread_id();
        let thread_store = ExtensionData::new(thread_id.to_string());
        thread_store.insert(GuiExtensionConfig {
            available: true,
            thread_id,
        });
        let tool = registry.tool_contributors()[0]
            .tools(&session_store, &thread_store)
            .into_iter()
            .next()
            .expect("launch_gui tool should be contributed");

        let output = tool
            .handle(tool_call(json!({})))
            .await
            .expect("launch_gui should succeed");

        assert_eq!(launcher.recorded_thread_id(), Some(thread_id));
        assert_eq!(
            output.code_mode_result(&tool_call(json!({})).payload),
            json!({ "urls": [] })
        );
    }

    fn installed_registry() -> codex_extension_api::ExtensionRegistry<()> {
        let mut builder = ExtensionRegistryBuilder::<()>::new();
        install(&mut builder, Arc::new(FakeGuiLauncher::default()));
        builder.build()
    }

    async fn start_thread(
        registry: &codex_extension_api::ExtensionRegistry<()>,
        session_store: &ExtensionData,
        thread_store: &ExtensionData,
        session_source: SessionSource,
    ) {
        for contributor in registry.thread_lifecycle_contributors() {
            contributor
                .on_thread_start(ThreadStartInput {
                    config: &(),
                    session_source: &session_source,
                    persistent_thread_state_available: true,
                    session_store,
                    thread_store,
                })
                .await;
        }
    }

    fn tool_names(
        registry: &codex_extension_api::ExtensionRegistry<()>,
        session_store: &ExtensionData,
        thread_store: &ExtensionData,
    ) -> Vec<ToolName> {
        registry
            .tool_contributors()
            .iter()
            .flat_map(|contributor| contributor.tools(session_store, thread_store))
            .map(|tool| tool.tool_name())
            .collect()
    }

    #[derive(Debug, Default)]
    struct FakeGuiLauncher {
        recorded_thread_id: Mutex<Option<ThreadId>>,
    }

    impl FakeGuiLauncher {
        fn recorded_thread_id(&self) -> Option<ThreadId> {
            *self
                .recorded_thread_id
                .lock()
                .expect("recorded thread id lock should not be poisoned")
        }
    }

    impl GuiLauncher for FakeGuiLauncher {
        fn launch_gui_for_thread(&self, thread_id: ThreadId) -> crate::GuiLaunchFuture<'_> {
            *self
                .recorded_thread_id
                .lock()
                .expect("recorded thread id lock should not be poisoned") = Some(thread_id);
            Box::pin(std::future::ready(Ok(GuiLaunchUrls {
                entries: Vec::new(),
            })))
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
