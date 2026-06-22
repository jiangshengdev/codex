use std::sync::Arc;

use codex_extension_api::ConfigContributor;
use codex_extension_api::ExtensionData;
use codex_extension_api::ExtensionFuture;
use codex_extension_api::ExtensionRegistryBuilder;
use codex_extension_api::ThreadLifecycleContributor;
use codex_extension_api::ThreadStartInput;
use codex_extension_api::ToolCall;
use codex_extension_api::ToolContributor;
use codex_extension_api::ToolExecutor;
use codex_protocol::ThreadId;

use crate::tool::GuiLaunchToolService;
use crate::tool::LaunchGuiToolExecutor;

#[derive(Clone, Debug)]
pub struct GuiExtensionConfig {
    pub enabled: bool,
}

impl GuiExtensionConfig {
    fn from_enabled(enabled: bool) -> Self {
        Self { enabled }
    }
}

#[derive(Clone)]
pub struct GuiExtension<C> {
    service: Arc<dyn GuiLaunchToolService>,
    enabled: Arc<dyn Fn(&C) -> bool + Send + Sync>,
}

impl<C> std::fmt::Debug for GuiExtension<C> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("GuiExtension").finish_non_exhaustive()
    }
}

impl<C> ThreadLifecycleContributor<C> for GuiExtension<C>
where
    C: Send + Sync + 'static,
{
    fn on_thread_start<'a>(&'a self, input: ThreadStartInput<'a, C>) -> ExtensionFuture<'a, ()> {
        Box::pin(async move {
            input
                .thread_store
                .insert(GuiExtensionConfig::from_enabled((self.enabled)(
                    input.config,
                )));
        })
    }
}

impl<C> ConfigContributor<C> for GuiExtension<C>
where
    C: Send + Sync + 'static,
{
    fn on_config_changed(
        &self,
        _session_store: &ExtensionData,
        thread_store: &ExtensionData,
        _previous_config: &C,
        new_config: &C,
    ) {
        thread_store.insert(GuiExtensionConfig::from_enabled((self.enabled)(new_config)));
    }
}

impl<C> ToolContributor for GuiExtension<C>
where
    C: Send + Sync + 'static,
{
    fn tools(
        &self,
        _session_store: &ExtensionData,
        thread_store: &ExtensionData,
    ) -> Vec<Arc<dyn ToolExecutor<ToolCall>>> {
        let Some(config) = thread_store.get::<GuiExtensionConfig>() else {
            return Vec::new();
        };
        if !config.enabled {
            return Vec::new();
        }
        let Ok(thread_id) = ThreadId::from_string(thread_store.level_id()) else {
            return Vec::new();
        };

        vec![Arc::new(LaunchGuiToolExecutor::new(
            thread_id,
            Arc::clone(&self.service),
        ))]
    }
}

pub fn install_with_service<C>(
    registry: &mut ExtensionRegistryBuilder<C>,
    service: Arc<dyn GuiLaunchToolService>,
    enabled: impl Fn(&C) -> bool + Send + Sync + 'static,
) where
    C: Send + Sync + 'static,
{
    let extension = Arc::new(GuiExtension {
        service,
        enabled: Arc::new(enabled),
    });
    registry.thread_lifecycle_contributor(extension.clone());
    registry.config_contributor(extension.clone());
    registry.tool_contributor(extension);
}
