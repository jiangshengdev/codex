# GUI Launch Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a model-callable `launch_gui` extension tool that only responds to explicit user requests and returns GUI URLs for the current thread.

**Architecture:** Add a focused `codex-gui-extension` crate that owns the Responses API tool spec and executor. Move GUI launch ownership into the in-process app-server runtime as a shared launcher so both the extension tool and existing `/gui` command use the same `GuiHostManager` path. Install the extension only when the runtime can provide that launcher.

**Tech Stack:** Rust 2024, `codex-extension-api`, `codex-gui-host`, in-process app-server runtime, existing `just` test/fmt workflow.

---

## File Structure

- Create `codex-rs/ext/gui/Cargo.toml`: package metadata for `codex-gui-extension`.
- Create `codex-rs/ext/gui/BUILD.bazel`: Bazel crate declaration.
- Create `codex-rs/ext/gui/src/lib.rs`: public exports for install, launcher trait, and tool constants.
- Create `codex-rs/ext/gui/src/spec.rs`: `launch_gui` Responses API tool definition.
- Create `codex-rs/ext/gui/src/tool.rs`: `GuiLauncher` trait, `GuiToolExecutor`, response serialization, and tests.
- Create `codex-rs/ext/gui/src/extension.rs`: thread lifecycle and tool contribution wiring.
- Modify `codex-rs/Cargo.toml`: add `ext/gui` workspace member and `codex-gui-extension` workspace dependency.
- Modify `codex-rs/app-server/Cargo.toml`: depend on `codex-gui-extension`.
- Modify `codex-rs/app-server/src/gui_host.rs`: add shared launcher wrapper that lazily creates and reuses `GuiHostManager`.
- Modify `codex-rs/app-server/src/in_process.rs`: expose an in-process `LaunchGui` runtime command and pass the shared launcher into `MessageProcessor`.
- Modify `codex-rs/app-server/src/message_processor.rs`: carry optional GUI launcher into extension registry setup.
- Modify `codex-rs/app-server/src/extensions.rs`: install `codex-gui-extension` when a launcher is present.
- Modify `codex-rs/app-server/src/lib.rs`: pass `None` for GUI launcher in non in-process transports.
- Modify `codex-rs/app-server/src/mcp_refresh.rs`: pass `None` in test-only thread manager setup.
- Modify `codex-rs/app-server-client/src/lib.rs`: forward GUI launch requests to the in-process runtime instead of owning a separate `GuiHostManager`.
- Modify `codex-rs/app-server-client/src/gui.rs`: keep public facade and remote unsupported behavior; remove client-owned manager construction after runtime ownership moves.

## Task 1: Scaffold `codex-gui-extension`

**Files:**
- Create: `codex-rs/ext/gui/Cargo.toml`
- Create: `codex-rs/ext/gui/BUILD.bazel`
- Create: `codex-rs/ext/gui/src/lib.rs`
- Create: `codex-rs/ext/gui/src/spec.rs`
- Modify: `codex-rs/Cargo.toml`

- [ ] **Step 1: Write the failing spec tests**

Create `codex-rs/ext/gui/src/spec.rs` with the tool definition and tests. The first run should fail because the crate is not yet wired into the workspace.

```rust
//! Responses API tool definition for launching the local GUI.

use codex_tools::JsonSchema;
use codex_tools::ResponsesApiTool;
use codex_tools::ToolSpec;
use std::collections::BTreeMap;

pub const LAUNCH_GUI_TOOL_NAME: &str = "launch_gui";

pub fn create_launch_gui_tool() -> ToolSpec {
    ToolSpec::Function(ResponsesApiTool {
        name: LAUNCH_GUI_TOOL_NAME.to_string(),
        description: "Launch or reuse the local GUI for the current thread and return GUI URLs. Use this tool only when the user explicitly requests opening the GUI, such as `open GUI`, `launch GUI`, or `use GUI for this thread`. Do not infer GUI launch from ordinary coding tasks."
            .to_string(),
        strict: false,
        defer_loading: None,
        parameters: JsonSchema::object(BTreeMap::new(), Some(Vec::new()), Some(false.into())),
        output_schema: None,
    })
}

#[cfg(test)]
mod tests {
    use codex_tools::ToolSpec;
    use pretty_assertions::assert_eq;

    use super::LAUNCH_GUI_TOOL_NAME;
    use super::create_launch_gui_tool;

    #[test]
    fn launch_gui_tool_has_empty_parameters_and_explicit_trigger_text() {
        let ToolSpec::Function(tool) = create_launch_gui_tool() else {
            panic!("launch_gui should be a function tool");
        };

        assert_eq!(tool.name, LAUNCH_GUI_TOOL_NAME);
        assert!(tool.description.contains("only when the user explicitly requests"));
        assert!(tool.description.contains("Do not infer GUI launch"));
    }
}
```

- [ ] **Step 2: Add crate metadata**

Create `codex-rs/ext/gui/Cargo.toml`:

```toml
[package]
edition.workspace = true
license.workspace = true
name = "codex-gui-extension"
version.workspace = true

[lib]
name = "codex_gui_extension"
path = "src/lib.rs"
test = false
doctest = false

[lints]
workspace = true

[dependencies]
async-trait = { workspace = true }
codex-extension-api = { workspace = true }
codex-gui-host = { workspace = true }
codex-protocol = { workspace = true }
codex-tools = { workspace = true }
serde = { workspace = true, features = ["derive"] }
serde_json = { workspace = true }

[dev-dependencies]
pretty_assertions = { workspace = true }
tokio = { workspace = true, features = ["macros", "rt-multi-thread"] }
```

Create `codex-rs/ext/gui/BUILD.bazel`:

```python
load("//:defs.bzl", "codex_rust_crate")

codex_rust_crate(
    name = "gui",
    crate_name = "codex_gui_extension",
)
```

Create `codex-rs/ext/gui/src/lib.rs`:

```rust
mod extension;
mod spec;
mod tool;

pub use extension::install;
pub use spec::LAUNCH_GUI_TOOL_NAME;
pub use tool::GuiLaunchFuture;
pub use tool::GuiLauncher;
```

- [ ] **Step 3: Add workspace membership and dependency**

Modify `codex-rs/Cargo.toml`:

```toml
# Add in [workspace].members near the other ext crates:
"ext/gui",

# Add in [workspace.dependencies] near the other extension crates:
codex-gui-extension = { path = "ext/gui" }
```

- [ ] **Step 4: Run the crate test**

Run:

```bash
cd codex-rs
just test -p codex-gui-extension
```

Expected: PASS for `launch_gui_tool_has_empty_parameters_and_explicit_trigger_text`.

- [ ] **Step 5: Commit scaffold**

```bash
git add codex-rs/Cargo.toml codex-rs/ext/gui
git commit -m "feat(gui): scaffold gui extension"
```

## Task 2: Implement the `launch_gui` executor

**Files:**
- Create: `codex-rs/ext/gui/src/tool.rs`
- Modify: `codex-rs/ext/gui/src/lib.rs`

- [ ] **Step 1: Write executor tests with a fake launcher**

Create `codex-rs/ext/gui/src/tool.rs` with tests first. The first test should fail until the executor implementation is completed in the next step.

```rust
use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;
use std::sync::Mutex;

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
use serde::Serialize;

use crate::spec::LAUNCH_GUI_TOOL_NAME;
use crate::spec::create_launch_gui_tool;

pub type GuiLaunchFuture<'a> =
    Pin<Box<dyn Future<Output = Result<GuiLaunchUrls, String>> + Send + 'a>>;

/// Launches or reuses the local GUI host for a specific thread.
///
/// Implementations are host-owned. They must not infer a thread from model
/// input; callers pass the current thread explicitly.
pub trait GuiLauncher: Send + Sync {
    fn launch_gui_for_thread(&self, thread_id: ThreadId) -> GuiLaunchFuture<'_>;
}

#[derive(Clone)]
pub(crate) struct GuiToolExecutor {
    thread_id: ThreadId,
    launcher: Arc<dyn GuiLauncher>,
}

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
        let _ = invocation.function_arguments()?;
        let urls = self
            .launcher
            .launch_gui_for_thread(self.thread_id)
            .await
            .map_err(|err| FunctionCallError::RespondToModel(format!("failed to launch GUI: {err}")))?;
        let value = serde_json::to_value(GuiLaunchResponse::from(urls))
            .map_err(|err| FunctionCallError::Fatal(err.to_string()))?;
        Ok(Box::new(JsonToolOutput::new(value)))
    }
}

impl From<GuiLaunchUrls> for GuiLaunchResponse {
    fn from(value: GuiLaunchUrls) -> Self {
        Self {
            urls: value
                .entries
                .into_iter()
                .map(GuiLaunchUrlResponse::from)
                .collect(),
        }
    }
}

impl From<GuiLaunchUrlEntry> for GuiLaunchUrlResponse {
    fn from(value: GuiLaunchUrlEntry) -> Self {
        Self {
            kind: gui_launch_url_kind(value.kind),
            label: value.label,
            url: value.url,
        }
    }
}

fn gui_launch_url_kind(kind: GuiLaunchUrlKind) -> &'static str {
    match kind {
        GuiLaunchUrlKind::Local => "local",
        GuiLaunchUrlKind::Lan => "lan",
        GuiLaunchUrlKind::Vpn => "vpn",
    }
}

#[cfg(test)]
mod tests {
    use codex_extension_api::ToolCall;
    use codex_tools::ToolOutput;
    use pretty_assertions::assert_eq;
    use serde_json::json;

    use super::*;

    #[derive(Default)]
    struct FakeLauncher {
        seen_thread_ids: Mutex<Vec<ThreadId>>,
        result: Mutex<Result<GuiLaunchUrls, String>>,
    }

    impl FakeLauncher {
        fn with_result(result: Result<GuiLaunchUrls, String>) -> Self {
            Self {
                seen_thread_ids: Mutex::new(Vec::new()),
                result: Mutex::new(result),
            }
        }
    }

    impl GuiLauncher for FakeLauncher {
        fn launch_gui_for_thread(&self, thread_id: ThreadId) -> GuiLaunchFuture<'_> {
            self.seen_thread_ids.lock().expect("lock").push(thread_id);
            let result = self.result.lock().expect("lock").clone();
            Box::pin(async move { result })
        }
    }

    #[tokio::test]
    async fn executor_launches_current_thread_and_serializes_urls() {
        let thread_id = ThreadId::new();
        let launcher = Arc::new(FakeLauncher::with_result(Ok(GuiLaunchUrls {
            entries: vec![
                GuiLaunchUrlEntry::new(
                    GuiLaunchUrlKind::Local,
                    "Local",
                    "http://127.0.0.1:1111/?threadId=t#token=x",
                ),
                GuiLaunchUrlEntry::new(
                    GuiLaunchUrlKind::Lan,
                    "LAN",
                    "http://192.168.1.10:1111/?threadId=t#token=x",
                ),
            ],
        })));
        let executor = GuiToolExecutor::new(thread_id, launcher.clone());

        let output = executor
            .handle(ToolCall {
                call_id: "call-1".to_string(),
                name: LAUNCH_GUI_TOOL_NAME.to_string(),
                arguments: "{}".to_string(),
            })
            .await
            .expect("tool should launch GUI");

        assert_eq!(
            output.to_json_value().expect("json output"),
            json!({
                "urls": [
                    {
                        "kind": "local",
                        "label": "Local",
                        "url": "http://127.0.0.1:1111/?threadId=t#token=x"
                    },
                    {
                        "kind": "lan",
                        "label": "LAN",
                        "url": "http://192.168.1.10:1111/?threadId=t#token=x"
                    }
                ]
            })
        );
        assert_eq!(
            launcher.seen_thread_ids.lock().expect("lock").as_slice(),
            &[thread_id]
        );
    }

    #[tokio::test]
    async fn executor_returns_model_readable_launch_error() {
        let thread_id = ThreadId::new();
        let launcher = Arc::new(FakeLauncher::with_result(Err(
            "GUI launch is not configured".to_string(),
        )));
        let executor = GuiToolExecutor::new(thread_id, launcher);

        let error = executor
            .handle(ToolCall {
                call_id: "call-1".to_string(),
                name: LAUNCH_GUI_TOOL_NAME.to_string(),
                arguments: "{}".to_string(),
            })
            .await
            .expect_err("tool should surface launch failure");

        assert_eq!(
            error.to_string(),
            "failed to launch GUI: GUI launch is not configured"
        );
    }
}
```

- [ ] **Step 2: Export the executor only inside the crate**

Ensure `codex-rs/ext/gui/src/lib.rs` exports only the public host-facing pieces:

```rust
mod extension;
mod spec;
mod tool;

pub use extension::install;
pub use spec::LAUNCH_GUI_TOOL_NAME;
pub use tool::GuiLaunchFuture;
pub use tool::GuiLauncher;
```

- [ ] **Step 3: Run executor tests**

Run:

```bash
cd codex-rs
just test -p codex-gui-extension
```

Expected: PASS for the spec and executor tests.

- [ ] **Step 4: Commit executor**

```bash
git add codex-rs/ext/gui/src
git commit -m "feat(gui): add launch gui tool executor"
```

## Task 3: Add GUI extension wiring

**Files:**
- Create: `codex-rs/ext/gui/src/extension.rs`
- Modify: `codex-rs/ext/gui/src/lib.rs`

- [ ] **Step 1: Write extension contribution tests**

Create `codex-rs/ext/gui/src/extension.rs`:

```rust
use std::sync::Arc;

use async_trait::async_trait;
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

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct GuiExtensionConfig {
    available: bool,
    thread_id: ThreadId,
}

#[async_trait]
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
        input
            .thread_store
            .insert(GuiExtensionConfig { available, thread_id });
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
            self.launcher.clone(),
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
    use codex_extension_api::ExtensionRegistryBuilder;
    use codex_extension_api::ToolName;
    use codex_gui_host::GuiLaunchUrls;
    use pretty_assertions::assert_eq;

    use crate::LAUNCH_GUI_TOOL_NAME;

    use super::*;

    struct NoopLauncher;

    impl GuiLauncher for NoopLauncher {
        fn launch_gui_for_thread(&self, _thread_id: ThreadId) -> crate::GuiLaunchFuture<'_> {
            Box::pin(async { Ok(GuiLaunchUrls { entries: Vec::new() }) })
        }
    }

    #[test]
    fn installed_extension_contributes_launch_gui_for_normal_thread() {
        let mut builder = ExtensionRegistryBuilder::<()>::new();
        install(&mut builder, Arc::new(NoopLauncher));
        let registry = builder.build();
        let session_store = ExtensionData::new("session");
        let thread_id = ThreadId::new();
        let thread_store = ExtensionData::new(thread_id.to_string());
        thread_store.insert(GuiExtensionConfig {
            available: true,
            thread_id,
        });

        let tool_names = registry
            .tool_contributors()
            .iter()
            .flat_map(|contributor| contributor.tools(&session_store, &thread_store))
            .map(|tool| tool.tool_name())
            .collect::<Vec<_>>();

        assert_eq!(tool_names, vec![ToolName::plain(LAUNCH_GUI_TOOL_NAME)]);
    }

    #[test]
    fn installed_extension_contributes_no_tool_when_unavailable() {
        let mut builder = ExtensionRegistryBuilder::<()>::new();
        install(&mut builder, Arc::new(NoopLauncher));
        let registry = builder.build();
        let session_store = ExtensionData::new("session");
        let thread_id = ThreadId::new();
        let thread_store = ExtensionData::new(thread_id.to_string());
        thread_store.insert(GuiExtensionConfig {
            available: false,
            thread_id,
        });

        let tool_names = registry
            .tool_contributors()
            .iter()
            .flat_map(|contributor| contributor.tools(&session_store, &thread_store))
            .map(|tool| tool.tool_name())
            .collect::<Vec<_>>();

        assert_eq!(tool_names, Vec::<ToolName>::new());
    }
}
```

- [ ] **Step 2: Run extension tests**

Run:

```bash
cd codex-rs
just test -p codex-gui-extension
```

Expected: PASS for spec, executor, and extension tests.

- [ ] **Step 3: Commit extension wiring**

```bash
git add codex-rs/ext/gui/src/extension.rs codex-rs/ext/gui/src/lib.rs
git commit -m "feat(gui): expose launch gui extension"
```

## Task 4: Move GUI host ownership into the in-process runtime

**Files:**
- Modify: `codex-rs/app-server/Cargo.toml`
- Modify: `codex-rs/app-server/src/gui_host.rs`
- Modify: `codex-rs/app-server/src/in_process.rs`
- Modify: `codex-rs/app-server-client/src/lib.rs`
- Modify: `codex-rs/app-server-client/src/gui.rs`

- [ ] **Step 1: Add app-server dependency**

Modify `codex-rs/app-server/Cargo.toml`:

```toml
codex-gui-extension = { workspace = true }
```

- [ ] **Step 2: Add a shared runtime launcher**

Modify `codex-rs/app-server/src/gui_host.rs` by adding `SharedGuiHostLauncher` below `GuiHostManager`.

```rust
use std::future::Future;
use std::pin::Pin;

use codex_gui_host::GuiHostMode;

pub struct SharedGuiHostLauncher {
    sender: InProcessClientSender,
    handle: Mutex<Option<GuiHostManager>>,
    mode_override: Option<GuiHostMode>,
}

impl SharedGuiHostLauncher {
    pub fn new(sender: InProcessClientSender) -> Self {
        Self {
            sender,
            handle: Mutex::new(None),
            mode_override: None,
        }
    }

    #[cfg(test)]
    pub fn new_for_test(sender: InProcessClientSender, mode: GuiHostMode) -> Self {
        Self {
            sender,
            handle: Mutex::new(None),
            mode_override: Some(mode),
        }
    }

    pub async fn launch_urls_for_thread(&self, thread_id: ThreadId) -> io::Result<GuiLaunchUrls> {
        let mut guard = self.handle.lock().await;
        if guard.is_none() {
            let mode = match self.mode_override.clone() {
                Some(mode) => mode,
                None => GuiHostMode::default_for_profile().map_err(|error| {
                    io::Error::new(
                        io::ErrorKind::InvalidInput,
                        format!("GUI host config error: {error}"),
                    )
                })?,
            };
            *guard = Some(GuiHostManager::new(
                self.sender.clone(),
                GuiHostConfig { mode },
            ));
        }
        let manager = guard
            .as_ref()
            .expect("GUI host manager should be initialized");
        manager.launch_urls_for_thread(thread_id).await
    }
}

impl codex_gui_extension::GuiLauncher for SharedGuiHostLauncher {
    fn launch_gui_for_thread(
        &self,
        thread_id: ThreadId,
    ) -> Pin<Box<dyn Future<Output = Result<GuiLaunchUrls, String>> + Send + '_>> {
        Box::pin(async move {
            self.launch_urls_for_thread(thread_id)
                .await
                .map_err(|err| err.to_string())
        })
    }
}
```

- [ ] **Step 3: Add in-process runtime command**

Modify `codex-rs/app-server/src/in_process.rs`:

```rust
pub(crate) enum InProcessClientMessage {
    Request {
        request: Box<ClientRequest>,
        response_tx: oneshot::Sender<PendingClientRequestResponse>,
    },
    Notification {
        notification: ClientNotification,
    },
    LaunchGui {
        thread_id: codex_protocol::ThreadId,
        response_tx: oneshot::Sender<io::Result<codex_gui_host::GuiLaunchUrls>>,
    },
    Extra(Box<in_process_extra::ExtraConnectionCommand>),
    ServerRequestResponse {
        request_id: RequestId,
        result: Result,
    },
    ServerRequestError {
        request_id: RequestId,
        error: JSONRPCErrorError,
    },
    Shutdown {
        done_tx: oneshot::Sender<()>,
    },
}
```

Add a public sender method:

```rust
impl InProcessClientSender {
    pub async fn launch_gui_for_thread(
        &self,
        thread_id: codex_protocol::ThreadId,
    ) -> io::Result<codex_gui_host::GuiLaunchUrls> {
        let (response_tx, response_rx) = oneshot::channel();
        self.try_send_client_message(InProcessClientMessage::LaunchGui {
            thread_id,
            response_tx,
        })?;
        response_rx.await.map_err(|err| {
            IoError::new(
                ErrorKind::BrokenPipe,
                format!("in-process GUI launch response channel closed: {err}"),
            )
        })?
    }
}
```

In `start_uninitialized`, create the shared launcher before `MessageProcessor::new`:

```rust
let runtime_sender = InProcessClientSender {
    client_tx: client_tx.clone(),
};
let gui_launcher = Arc::new(crate::gui_host::SharedGuiHostLauncher::new(runtime_sender));
```

Handle the new command in the runtime loop:

```rust
InProcessClientMessage::LaunchGui {
    thread_id,
    response_tx,
} => {
    let result = gui_launcher.launch_urls_for_thread(thread_id).await;
    let _ = response_tx.send(result);
}
```

- [ ] **Step 4: Update app-server-client facade**

Modify `codex-rs/app-server-client/src/lib.rs` so `ClientCommand::LaunchGui` forwards to the low-level in-process sender instead of holding `gui_host_manager`.

```rust
Some(ClientCommand::LaunchGui {
    thread_id,
    response_tx,
}) => {
    let request_sender = request_sender.clone();
    tokio::spawn(async move {
        let result = request_sender
            .launch_gui_for_thread(thread_id)
            .await
            .map_err(GuiLaunchError::from);
        let _ = response_tx.send(result);
    });
}
```

Remove the worker-local `let mut gui_host_manager = None::<codex_app_server::GuiHostManager>;` because the shared app-server runtime owns the manager now.

Modify `codex-rs/app-server-client/src/gui.rs` to remove `new_gui_host_manager` from production code if it is no longer used. Keep `RemoteAppServerClient::launch_gui_for_thread` returning `GuiLaunchError::UnsupportedRemote`.

- [ ] **Step 5: Run focused GUI facade tests**

Run:

```bash
cd codex-rs
just test -p codex-app-server-client gui
```

Expected: PASS for existing GUI launch facade tests, including remote unsupported behavior and host reuse.

- [ ] **Step 6: Commit runtime ownership move**

```bash
git add codex-rs/app-server/Cargo.toml codex-rs/app-server/src/gui_host.rs codex-rs/app-server/src/in_process.rs codex-rs/app-server-client/src/lib.rs codex-rs/app-server-client/src/gui.rs
git commit -m "refactor(gui): share gui launcher in app server runtime"
```

## Task 5: Install the GUI extension from app-server

**Files:**
- Modify: `codex-rs/app-server/src/extensions.rs`
- Modify: `codex-rs/app-server/src/message_processor.rs`
- Modify: `codex-rs/app-server/src/in_process.rs`
- Modify: `codex-rs/app-server/src/lib.rs`
- Modify: `codex-rs/app-server/src/mcp_refresh.rs`

- [ ] **Step 1: Add optional launcher to message processor args**

Modify `codex-rs/app-server/src/message_processor.rs`:

```rust
pub(crate) struct MessageProcessorArgs {
    pub(crate) outgoing: Arc<OutgoingMessageSender>,
    pub(crate) analytics_events_client: AnalyticsEventsClient,
    pub(crate) arg0_paths: Arg0DispatchPaths,
    pub(crate) config: Arc<Config>,
    pub(crate) config_manager: ConfigManager,
    pub(crate) environment_manager: Arc<EnvironmentManager>,
    pub(crate) feedback: CodexFeedback,
    pub(crate) log_db: Option<LogDbLayer>,
    pub(crate) state_db: Option<StateDbHandle>,
    pub(crate) config_warnings: Vec<ConfigWarningNotification>,
    pub(crate) session_source: SessionSource,
    pub(crate) auth_manager: Arc<AuthManager>,
    pub(crate) installation_id: String,
    pub(crate) rpc_transport: AppServerRpcTransport,
    pub(crate) remote_control_handle: Option<RemoteControlHandle>,
    pub(crate) plugin_startup_tasks: crate::PluginStartupTasks,
    pub(crate) gui_launcher: Option<Arc<dyn codex_gui_extension::GuiLauncher>>,
}
```

Pass `gui_launcher` into `thread_extensions`:

```rust
thread_extensions(
    guardian_agent_spawner(thread_manager.clone()),
    app_server_extension_event_sink(outgoing.clone(), thread_state_manager.clone()),
    auth_manager.clone(),
    state_db.clone(),
    thread_manager.clone(),
    Arc::clone(&goal_service),
    gui_launcher.clone(),
)
```

- [ ] **Step 2: Install GUI extension when launcher exists**

Modify `codex-rs/app-server/src/extensions.rs`:

```rust
pub(crate) fn thread_extensions<S>(
    guardian_agent_spawner: S,
    event_sink: Arc<dyn ExtensionEventSink>,
    auth_manager: Arc<AuthManager>,
    state_db: Option<StateDbHandle>,
    thread_manager: Weak<ThreadManager>,
    goal_service: Arc<GoalService>,
    gui_launcher: Option<Arc<dyn codex_gui_extension::GuiLauncher>>,
) -> Arc<ExtensionRegistry<Config>>
where
    S: AgentSpawner<StartThreadOptions, Spawned = NewThread, Error = CodexErr> + 'static,
{
    let mut builder = ExtensionRegistryBuilder::<Config>::with_event_sink(event_sink);
    if let Some(state_db) = state_db {
        codex_goal_extension::install_with_backend(
            &mut builder,
            state_db,
            codex_otel::global(),
            thread_manager,
            goal_service,
            |config: &Config| config.features.enabled(codex_features::Feature::Goals),
        );
    }
    if let Some(gui_launcher) = gui_launcher {
        codex_gui_extension::install(&mut builder, gui_launcher);
    }
    codex_guardian::install(&mut builder, guardian_agent_spawner);
    codex_memories_extension::install(&mut builder, codex_otel::global());
    codex_web_search_extension::install(&mut builder, auth_manager.clone());
    codex_image_generation_extension::install(&mut builder, auth_manager);
    Arc::new(builder.build())
}
```

- [ ] **Step 3: Pass launcher from in-process runtime and None elsewhere**

In `codex-rs/app-server/src/in_process.rs`, pass `Some(gui_launcher.clone())` into `MessageProcessorArgs`.

```rust
let processor = Arc::new(MessageProcessor::new(MessageProcessorArgs {
    outgoing: Arc::clone(&processor_outgoing),
    analytics_events_client,
    arg0_paths: args.arg0_paths,
    config: args.config,
    config_manager,
    environment_manager: args.environment_manager,
    feedback: args.feedback,
    log_db: args.log_db,
    state_db: args.state_db,
    config_warnings: args.config_warnings,
    session_source: args.session_source,
    auth_manager,
    installation_id,
    rpc_transport: AppServerRpcTransport::InProcess,
    remote_control_handle: None,
    plugin_startup_tasks: crate::PluginStartupTasks::Start,
    gui_launcher: Some(gui_launcher.clone()),
}));
```

In `codex-rs/app-server/src/lib.rs`, pass `gui_launcher: None` when constructing `MessageProcessorArgs` for socket/stdout transports.

In `codex-rs/app-server/src/mcp_refresh.rs`, pass `None` to `thread_extensions`.

- [ ] **Step 4: Run focused app-server compile/tests**

Run:

```bash
cd codex-rs
just test -p codex-app-server extensions
```

Expected: PASS for extension-related tests. If no test filter matches, run:

```bash
cd codex-rs
just test -p codex-app-server
```

Expected: PASS for `codex-app-server`.

- [ ] **Step 5: Commit extension installation**

```bash
git add codex-rs/app-server/src/extensions.rs codex-rs/app-server/src/message_processor.rs codex-rs/app-server/src/in_process.rs codex-rs/app-server/src/lib.rs codex-rs/app-server/src/mcp_refresh.rs
git commit -m "feat(gui): install gui launch extension"
```

## Task 6: Add integration coverage for tool visibility and launch behavior

**Files:**
- Modify: `codex-rs/app-server-client/src/lib.rs`
- Modify: `codex-rs/app-server/src/gui_host.rs`
- Test: existing app-server-client tests in `codex-rs/app-server-client/src/lib.rs`
- Test: existing extension tests in `codex-rs/ext/gui/src/extension.rs`

- [ ] **Step 1: Add app-server-client regression test for single shared host**

Add or update a test in `codex-rs/app-server-client/src/lib.rs` near existing GUI tests:

```rust
#[tokio::test]
async fn in_process_launch_gui_reuses_runtime_host_for_multiple_threads() {
    let client = start_test_client(SessionSource::Cli).await;
    let thread_a =
        ThreadId::from_string("00000000-0000-0000-0000-0000000005a1").expect("valid thread id");
    let thread_b =
        ThreadId::from_string("00000000-0000-0000-0000-0000000005b2").expect("valid thread id");

    let urls_a = client
        .launch_gui_for_thread(thread_a)
        .await
        .expect("first launch should start GUI host");
    let urls_b = client
        .launch_gui_for_thread(thread_b)
        .await
        .expect("second launch should reuse GUI host");

    let local_a = urls_a
        .entries
        .iter()
        .find(|entry| entry.kind == GuiLaunchUrlKind::Local)
        .expect("local URL for first thread");
    let local_b = urls_b
        .entries
        .iter()
        .find(|entry| entry.kind == GuiLaunchUrlKind::Local)
        .expect("local URL for second thread");

    assert!(local_a.url.contains(&thread_a.to_string()));
    assert!(local_b.url.contains(&thread_b.to_string()));
    assert_eq!(
        local_a.url.split('/').nth(2),
        local_b.url.split('/').nth(2),
        "runtime should reuse the same host authority"
    );
    client.shutdown().await.expect("shutdown should complete");
}
```

- [ ] **Step 2: Add extension launch behavior test**

Add a test in `codex-rs/ext/gui/src/extension.rs` that obtains the contributed tool and calls it with a fake launcher:

```rust
#[tokio::test]
async fn contributed_tool_launches_with_current_thread_id() {
    let thread_id = ThreadId::new();
    let launcher = Arc::new(RecordingLauncher::default());
    let mut builder = ExtensionRegistryBuilder::<()>::new();
    install(&mut builder, launcher.clone());
    let registry = builder.build();
    let session_store = ExtensionData::new("session");
    let thread_store = ExtensionData::new(thread_id.to_string());
    thread_store.insert(GuiExtensionConfig {
        available: true,
        thread_id,
    });

    let tool = registry
        .tool_contributors()
        .iter()
        .flat_map(|contributor| contributor.tools(&session_store, &thread_store))
        .next()
        .expect("launch_gui tool should be contributed");

    let _ = tool
        .handle(ToolCall {
            call_id: "call-1".to_string(),
            name: LAUNCH_GUI_TOOL_NAME.to_string(),
            arguments: "{}".to_string(),
        })
        .await
        .expect("launch should succeed");

    assert_eq!(
        launcher.seen_thread_ids.lock().expect("lock").as_slice(),
        &[thread_id]
    );
}
```

Define `RecordingLauncher` in the same test module:

```rust
#[derive(Default)]
struct RecordingLauncher {
    seen_thread_ids: Mutex<Vec<ThreadId>>,
}

impl GuiLauncher for RecordingLauncher {
    fn launch_gui_for_thread(&self, thread_id: ThreadId) -> crate::GuiLaunchFuture<'_> {
        self.seen_thread_ids.lock().expect("lock").push(thread_id);
        Box::pin(async {
            Ok(GuiLaunchUrls {
                entries: vec![GuiLaunchUrlEntry::new(
                    GuiLaunchUrlKind::Local,
                    "Local",
                    "http://127.0.0.1:1234/?threadId=t#token=x",
                )],
            })
        })
    }
}
```

- [ ] **Step 3: Run focused tests**

Run:

```bash
cd codex-rs
just test -p codex-gui-extension
just test -p codex-app-server-client gui
```

Expected: both commands pass.

- [ ] **Step 4: Commit integration coverage**

```bash
git add codex-rs/ext/gui/src/extension.rs codex-rs/app-server-client/src/lib.rs codex-rs/app-server/src/gui_host.rs
git commit -m "test(gui): cover launch gui extension"
```

## Task 7: Final formatting, linting, and lockfile checks

**Files:**
- Modify only generated or formatting changes produced by commands.

- [ ] **Step 1: Format Rust code**

Run:

```bash
cd codex-rs
just fmt
```

Expected: command completes successfully. Do not rerun tests solely because `just fmt` ran.

- [ ] **Step 2: Run scoped fixes**

Run:

```bash
cd codex-rs
just fix -p codex-gui-extension
just fix -p codex-app-server
just fix -p codex-app-server-client
```

Expected: commands complete successfully. Do not rerun tests after `just fix`.

- [ ] **Step 3: Refresh Bazel lockfiles after Cargo manifest changes**

Because this plan adds a workspace crate and dependency entries, run:

```bash
cd codex-rs
just bazel-lock-update
just bazel-lock-check
```

Expected: lock update succeeds and lock check reports no drift.

- [ ] **Step 4: Check final diff hygiene**

Run:

```bash
git status --short
git diff --check
```

Expected: only intended Rust/Bazel/Cargo files are modified, and `git diff --check` exits successfully.

- [ ] **Step 5: Commit final mechanical updates**

If formatting, fix, or lock update changed files, commit them:

```bash
git add codex-rs
git commit -m "chore(gui): finalize gui extension wiring"
```

If no files changed, do not create an empty commit.

## Execution Notes

- Do not run the full `just test` suite unless the user explicitly authorizes it.
- Do not push commits.
- Do not modify `Cargo.lock` manually. If lockfiles change, they must be produced by the documented commands.
- Keep `/gui` slash command behavior unchanged from the user's perspective.
- The model tool must not accept a `thread_id` argument.
- The tool description must remain explicit-request-only.
