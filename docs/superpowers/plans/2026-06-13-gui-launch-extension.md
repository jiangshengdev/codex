# GUI Launch Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a model-callable `launch_gui` extension tool that only responds to explicit user requests and returns GUI URLs for the current thread.

**Architecture:** Add a focused `codex-gui-extension` crate following the `codex-goal-extension` pattern, then install it from app-server through an injected `GuiLauncher` capability. Move current-branch GUI launch ownership to an app-server shared launcher so `/gui` and the extension share the same `GuiHostManager` behavior, while keeping changes to `rust-v0.139.0` upstream files as low-intrusion additive hooks only.

**Tech Stack:** Rust 2024, `codex-extension-api`, `codex-tools`, `codex-gui-host`, app-server extension registry, in-process app-server runtime, existing `just` test/fmt workflow.

---

## Hard Constraints

- Use `rust-v0.139.0` as the upstream comparison baseline before implementation and before final review.
- Additive hooks to upstream-existing files are allowed: optional fields, optional parameters, narrow forwarding methods, and extension registration calls.
- Refactoring upstream-existing logic is prohibited. Do not move upstream responsibilities, rewrite runtime structure, or improve upstream code organization just because it looks cleaner.
- Current-branch GUI code can be moved, merged, or reshaped as needed. The current branch will not merge back upstream.
- Preserve `/gui` user-visible behavior: same command semantics, same no-browser-open behavior, same thread requirement, same remote unsupported behavior.
- The model tool must not accept `thread_id`; it always uses the current thread from extension runtime state.
- Do not add an app-server v2 RPC for GUI launch.
- Do not run full `just test` without explicit user approval.
- Do not push commits.

## File Structure

- Create `codex-rs/ext/gui/Cargo.toml`: package metadata for `codex-gui-extension`.
- Create `codex-rs/ext/gui/BUILD.bazel`: Bazel crate declaration.
- Create `codex-rs/ext/gui/src/lib.rs`: public exports for install, launcher trait, and tool constants.
- Create `codex-rs/ext/gui/src/spec.rs`: `launch_gui` Responses API tool definition.
- Create `codex-rs/ext/gui/src/tool.rs`: `GuiLauncher` trait, `GuiToolExecutor`, response serialization, and tests.
- Create `codex-rs/ext/gui/src/extension.rs`: thread lifecycle and tool contribution wiring.
- Modify `codex-rs/Cargo.toml`: add `ext/gui` workspace member and `codex-gui-extension` workspace dependency.
- Modify `codex-rs/app-server/Cargo.toml`: depend on `codex-gui-extension`.
- Modify `codex-rs/app-server/src/gui_host.rs`: add `SharedGuiHostLauncher` beside current-branch `GuiHostManager`.
- Modify `codex-rs/app-server/src/in_process.rs`: create the shared launcher, pass it to `MessageProcessor`, and expose a narrow `launch_gui_for_thread` sender method for `/gui`.
- Modify `codex-rs/app-server/src/message_processor.rs`: carry optional GUI launcher into extension registry setup.
- Modify `codex-rs/app-server/src/extensions.rs`: install `codex-gui-extension` when a launcher is present.
- Modify `codex-rs/app-server/src/lib.rs`: pass `None` for GUI launcher in non in-process transports.
- Modify `codex-rs/app-server/src/mcp_refresh.rs`: pass `None` to `thread_extensions` in test-only setup.
- Modify `codex-rs/app-server-client/src/lib.rs`: forward `/gui` launch requests to the in-process runtime sender instead of owning `GuiHostManager`.
- Modify `codex-rs/app-server-client/src/gui.rs`: keep public facade/error types and remove production `GuiHostManager` construction after app-server owns the shared launcher.

## Task 0: Preflight Baseline And Scope Guard

**Files:**
- Read: `docs/superpowers/specs/2026-06-13-gui-launch-extension-design.md`
- Read: `codex-rs/ext/goal/src/extension.rs`
- Read: `codex-rs/ext/goal/src/tool.rs`
- Read: `codex-rs/app-server/src/extensions.rs`
- Read: `codex-rs/app-server/src/gui_host.rs`
- Read: `codex-rs/app-server-client/src/lib.rs`

- [ ] **Step 1: Confirm working tree and upstream baseline**

Run:

```bash
git status --short --branch
git tag --list rust-v0.139.0
git diff --name-status rust-v0.139.0..HEAD -- codex-rs/app-server/src/gui_host.rs codex-rs/app-server-client/src/gui.rs codex-rs/tui/src/app/gui.rs
```

Expected:

```text
rust-v0.139.0
```

The diff should show the GUI files as current-branch additions or current-branch-owned edits. If unrelated user changes are present, keep them untouched.

- [ ] **Step 2: Identify upstream-existing hot files**

Run:

```bash
git ls-tree -r --name-only rust-v0.139.0 -- codex-rs/app-server/src/in_process.rs codex-rs/app-server/src/message_processor.rs codex-rs/app-server/src/extensions.rs codex-rs/app-server/src/lib.rs codex-rs/app-server-client/src/lib.rs
```

Expected: the command lists these upstream-existing files. During implementation, only add narrow hooks in these files.

- [ ] **Step 3: Commit nothing**

This task is an inspection gate. Do not commit after Task 0.

## Task 1: Scaffold `codex-gui-extension`

**Files:**
- Create: `codex-rs/ext/gui/Cargo.toml`
- Create: `codex-rs/ext/gui/BUILD.bazel`
- Create: `codex-rs/ext/gui/src/lib.rs`
- Create: `codex-rs/ext/gui/src/spec.rs`
- Modify: `codex-rs/Cargo.toml`

- [ ] **Step 1: Create the tool spec**

Create `codex-rs/ext/gui/src/spec.rs`:

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

- [ ] **Step 3: Add workspace membership**

Modify `codex-rs/Cargo.toml`:

```toml
# Add in [workspace].members near other ext crates:
"ext/gui",

# Add in [workspace.dependencies] near other extension crates:
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

## Task 2: Implement The `launch_gui` Executor

**Files:**
- Create: `codex-rs/ext/gui/src/tool.rs`
- Modify: `codex-rs/ext/gui/src/lib.rs`

- [ ] **Step 1: Create executor implementation and tests**

Create `codex-rs/ext/gui/src/tool.rs`:

```rust
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
    use std::sync::Mutex;

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
            entries: vec![GuiLaunchUrlEntry::new(
                GuiLaunchUrlKind::Local,
                "Local",
                "http://127.0.0.1:1111/?threadId=t#token=x",
            )],
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

- [ ] **Step 2: Run executor tests**

Run:

```bash
cd codex-rs
just test -p codex-gui-extension
```

Expected: PASS for spec and executor tests.

- [ ] **Step 3: Commit executor**

```bash
git add codex-rs/ext/gui/src/tool.rs codex-rs/ext/gui/src/lib.rs
git commit -m "feat(gui): add launch gui tool executor"
```

## Task 3: Add GUI Extension Wiring

**Files:**
- Create: `codex-rs/ext/gui/src/extension.rs`

- [ ] **Step 1: Create extension contributor**

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
```

- [ ] **Step 2: Add extension tests**

Append this test module to `codex-rs/ext/gui/src/extension.rs`:

```rust
#[cfg(test)]
mod tests {
    use std::sync::Mutex;

    use codex_extension_api::ExtensionRegistryBuilder;
    use codex_extension_api::ToolName;
    use codex_gui_host::GuiLaunchUrlEntry;
    use codex_gui_host::GuiLaunchUrlKind;
    use codex_gui_host::GuiLaunchUrls;
    use pretty_assertions::assert_eq;

    use crate::LAUNCH_GUI_TOOL_NAME;

    use super::*;

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

    #[test]
    fn installed_extension_contributes_launch_gui_for_normal_thread() {
        let mut builder = ExtensionRegistryBuilder::<()>::new();
        install(&mut builder, Arc::new(RecordingLauncher::default()));
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
        install(&mut builder, Arc::new(RecordingLauncher::default()));
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
}
```

- [ ] **Step 3: Run extension tests**

Run:

```bash
cd codex-rs
just test -p codex-gui-extension
```

Expected: PASS for spec, executor, and extension tests.

- [ ] **Step 4: Commit extension wiring**

```bash
git add codex-rs/ext/gui/src/extension.rs codex-rs/ext/gui/src/lib.rs
git commit -m "feat(gui): expose launch gui extension"
```

## Task 4: Add App-Server Shared GUI Launcher

**Files:**
- Modify: `codex-rs/app-server/Cargo.toml`
- Modify: `codex-rs/app-server/src/gui_host.rs`

- [ ] **Step 1: Add app-server dependency**

Modify `codex-rs/app-server/Cargo.toml`:

```toml
codex-gui-extension = { workspace = true }
```

- [ ] **Step 2: Add shared launcher beside current GUI host manager**

Modify `codex-rs/app-server/src/gui_host.rs`. Add imports:

```rust
use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;

use codex_gui_host::GuiHostMode;
```

Add `SharedGuiHostLauncher` below `GuiHostManager`:

```rust
pub struct SharedGuiHostLauncher {
    sender: InProcessClientSender,
    config: Result<GuiHostConfig, String>,
    manager: Mutex<Option<Arc<GuiHostManager>>>,
}

impl SharedGuiHostLauncher {
    pub fn new(sender: InProcessClientSender, config: GuiHostConfig) -> Self {
        Self {
            sender,
            config: Ok(config),
            manager: Mutex::new(None),
        }
    }

    pub fn default_for_profile(sender: InProcessClientSender) -> Self {
        let config = GuiHostMode::default_for_profile()
            .map(|mode| GuiHostConfig { mode })
            .map_err(|error| error.to_string());
        Self {
            sender,
            config,
            manager: Mutex::new(None),
        }
    }

    pub async fn launch_urls_for_thread(&self, thread_id: ThreadId) -> io::Result<GuiLaunchUrls> {
        let manager = {
            let mut guard = self.manager.lock().await;
            match guard.as_ref() {
                Some(manager) => Arc::clone(manager),
                None => {
                    let config = self.config.clone().map_err(|message| {
                        io::Error::new(
                            io::ErrorKind::InvalidInput,
                            format!("GUI host config error: {message}"),
                        )
                    })?;
                    let manager = Arc::new(GuiHostManager::new(
                        self.sender.clone(),
                        config,
                    ));
                    *guard = Some(Arc::clone(&manager));
                    manager
                }
            }
        };
        manager.launch_urls_for_thread(thread_id).await
    }

    pub async fn shutdown(&self) {
        let manager = self.manager.lock().await.take();
        if let Some(manager) = manager {
            manager.shutdown().await;
        }
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

- [ ] **Step 3: Add shared launcher reuse test**

Add this test to the existing test module in `codex-rs/app-server/src/gui_host.rs`:

```rust
#[tokio::test]
async fn shared_launcher_reuses_same_host_for_manager_lifetime() {
    let client = crate::in_process::tests::start_test_client_for_bridge().await;
    let launcher = SharedGuiHostLauncher::new(
        client.sender(),
        GuiHostConfig {
            mode: GuiHostMode::Dev(DevAssetProxyConfig {
                vite_origin: "http://127.0.0.1:5173".to_string(),
            }),
        },
    );
    let thread_a =
        ThreadId::from_string("00000000-0000-0000-0000-0000000004a1").expect("valid thread id");
    let thread_b =
        ThreadId::from_string("00000000-0000-0000-0000-0000000004b2").expect("valid thread id");

    let urls_a = launcher
        .launch_urls_for_thread(thread_a)
        .await
        .expect("first launch URLs should be created");
    let urls_b = launcher
        .launch_urls_for_thread(thread_b)
        .await
        .expect("second launch URLs should reuse host");

    let origin_a = urls_a.entries[0]
        .url
        .as_str()
        .split("/?")
        .next()
        .expect("URL should contain query");
    let origin_b = urls_b.entries[0]
        .url
        .as_str()
        .split("/?")
        .next()
        .expect("URL should contain query");
    assert_eq!(origin_a, origin_b);
    launcher.shutdown().await;
}
```

- [ ] **Step 4: Run app-server GUI host tests**

Run:

```bash
cd codex-rs
just test -p codex-app-server gui_host
```

Expected: PASS for existing and new GUI host tests.

- [ ] **Step 5: Commit shared launcher**

```bash
git add codex-rs/app-server/Cargo.toml codex-rs/app-server/src/gui_host.rs
git commit -m "feat(gui): add app server gui launcher"
```

## Task 5: Install GUI Extension From App-Server

**Files:**
- Modify: `codex-rs/app-server/src/message_processor.rs`
- Modify: `codex-rs/app-server/src/extensions.rs`
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

Destructure `gui_launcher` in `MessageProcessor::new` and pass it to `thread_extensions`:

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

- [ ] **Step 3: Pass launcher from in-process runtime and `None` elsewhere**

In `codex-rs/app-server/src/in_process.rs`, create the shared launcher after `client_tx` is available and before `MessageProcessor::new` receives arguments:

```rust
let runtime_sender = InProcessClientSender {
    client_tx: client_tx.clone(),
};
let gui_launcher = Arc::new(crate::gui_host::SharedGuiHostLauncher::default_for_profile(
    runtime_sender,
));
```

Pass it into `MessageProcessorArgs`:

```rust
gui_launcher: Some(gui_launcher.clone()),
```

In `codex-rs/app-server/src/lib.rs`, pass:

```rust
gui_launcher: None,
```

In `codex-rs/app-server/src/mcp_refresh.rs`, pass `None` to `thread_extensions`:

```rust
thread_extensions(
    guardian_agent_spawner(thread_manager.clone()),
    Arc::new(NoopExtensionEventSink),
    auth_manager.clone(),
    Some(state_db.clone()),
    thread_manager.clone(),
    Arc::new(codex_goal_extension::GoalService::new()),
    None,
)
```

- [ ] **Step 4: Run focused app-server tests**

Run:

```bash
cd codex-rs
just test -p codex-app-server extensions
```

Expected: PASS if the filter matches tests. If the filter reports no tests, run:

```bash
cd codex-rs
just test -p codex-app-server gui_host
```

Expected: PASS.

- [ ] **Step 5: Commit extension installation**

```bash
git add codex-rs/app-server/src/message_processor.rs codex-rs/app-server/src/extensions.rs codex-rs/app-server/src/in_process.rs codex-rs/app-server/src/lib.rs codex-rs/app-server/src/mcp_refresh.rs
git commit -m "feat(gui): install gui launch extension"
```

## Task 6: Route Existing `/gui` Through App-Server Launcher

**Files:**
- Modify: `codex-rs/app-server/src/in_process.rs`
- Modify: `codex-rs/app-server-client/src/lib.rs`
- Modify: `codex-rs/app-server-client/src/gui.rs`

- [ ] **Step 1: Add a narrow in-process launch command**

Modify `codex-rs/app-server/src/in_process.rs`. Add a message variant:

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

Add this method to `InProcessClientSender`:

```rust
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
```

Handle the new message in the `client_rx.recv()` loop by calling the same `gui_launcher` used by extensions:

```rust
Some(InProcessClientMessage::LaunchGui {
    thread_id,
    response_tx,
}) => {
    let result = gui_launcher.launch_urls_for_thread(thread_id).await;
    let _ = response_tx.send(result);
}
```

When shutdown begins, shut down the shared launcher before exiting the runtime task:

```rust
gui_launcher.shutdown().await;
```

- [ ] **Step 2: Forward app-server-client `/gui` command to the runtime**

Modify `codex-rs/app-server-client/src/lib.rs` so the worker no longer owns `GuiHostManager`. Remove:

```rust
let mut gui_host_manager = None::<codex_app_server::GuiHostManager>;
```

Replace the production `ClientCommand::LaunchGui` branch with:

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

Remove production shutdown calls that take `gui_host_manager`. The runtime now owns and shuts down the shared launcher.

- [ ] **Step 3: Keep remote unsupported and remove production manager construction**

Modify `codex-rs/app-server-client/src/gui.rs`:

- Keep `GuiLaunchError`.
- Keep `AppServerClientGuiExt`.
- Keep `RemoteAppServerClient::launch_gui_for_thread` returning `GuiLaunchError::UnsupportedRemote`.
- Remove production imports and helpers that construct `GuiHostManager`.
- Keep test-only helpers only if existing app-server-client tests still use `LaunchGuiForTest`; otherwise remove `LaunchGuiForTest` and its helper together.

The production `InProcessAppServerClient::launch_gui_for_thread` method should still send `ClientCommand::LaunchGui`.

- [ ] **Step 4: Run focused `/gui` facade tests**

Run:

```bash
cd codex-rs
just test -p codex-app-server-client gui
```

Expected: PASS for GUI launch facade tests, including remote unsupported behavior.

- [ ] **Step 5: Commit `/gui` routing**

```bash
git add codex-rs/app-server/src/in_process.rs codex-rs/app-server-client/src/lib.rs codex-rs/app-server-client/src/gui.rs
git commit -m "refactor(gui): route gui launch through app server"
```

## Task 7: Add End-To-End Tool Visibility Coverage

**Files:**
- Test: `codex-rs/app-server/tests/suite/v2/turn_start.rs` or an existing app-server suite file that already asserts model tool names.
- Modify: `codex-rs/app-server/tests/suite/v2/mod.rs` only if a new test module is created.

- [ ] **Step 1: Locate the existing tool-name assertion helper**

Run:

```bash
rg -n "tool_names|tools|CREATE_GOAL_TOOL_NAME|GET_GOAL_TOOL_NAME|UPDATE_GOAL_TOOL_NAME|function_call" codex-rs/app-server/tests codex-rs/core/suite
```

Expected: locate an existing test helper that inspects outbound Responses API tool specs. Reuse that helper instead of adding a parallel JSON parser.

- [ ] **Step 2: Add app-server visibility assertion**

Add a focused test that starts an in-process app-server-backed thread and asserts that the outbound model request includes `launch_gui` only when the app-server receives a GUI launcher. The assertion should compare the collected tool names as a whole object when possible:

```rust
assert!(tool_names.contains(&"launch_gui".to_string()));
```

If the suite already has a full expected tool-name vector, add `"launch_gui".to_string()` to that vector.

- [ ] **Step 3: Verify non in-process path does not expose the tool**

Add or update the closest existing app-server setup that constructs `MessageProcessorArgs` with `gui_launcher: None`, then assert `launch_gui` is absent:

```rust
assert!(!tool_names.contains(&"launch_gui".to_string()));
```

- [ ] **Step 4: Run focused app-server test**

Run the exact test selected in Step 1. Example command:

```bash
cd codex-rs
just test -p codex-app-server launch_gui
```

Expected: PASS for the new launch GUI extension visibility test.

- [ ] **Step 5: Commit coverage**

```bash
git add codex-rs/app-server/tests
git commit -m "test(gui): cover launch gui extension visibility"
```

## Task 8: Final Formatting, Lockfile, And Scope Review

**Files:**
- Modify only files changed by formatting or generated lock update commands.

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

Expected: lock update succeeds and lock check reports no drift. Do not edit lockfiles manually.

- [ ] **Step 4: Check final diff hygiene against upstream baseline**

Run:

```bash
git status --short
git diff --check
git diff --stat rust-v0.139.0..HEAD -- codex-rs/app-server/src/in_process.rs codex-rs/app-server/src/message_processor.rs codex-rs/app-server/src/extensions.rs codex-rs/app-server/src/lib.rs codex-rs/app-server-client/src/lib.rs
```

Expected: `git diff --check` succeeds. The upstream-existing files should show additive hook scale, not broad rewrites.

- [ ] **Step 5: Commit final mechanical updates**

If formatting, fix, or lock update changed files, commit them:

```bash
git add codex-rs
git commit -m "chore(gui): finalize gui extension wiring"
```

If no files changed, do not create an empty commit.

## Execution Notes

- Follow `codex-goal-extension` patterns for extension installation and tool contribution.
- `GuiLauncher` is the new host capability boundary. Do not put TUI or slash-command dependencies in `codex-gui-extension`.
- `codex-gui-extension` can use `async_trait` where it implements existing extension/tool traits that already require it. Do not define the new `GuiLauncher` trait with `async_trait`; use `GuiLaunchFuture`.
- Keep `launch_gui` parameters empty.
- Keep tool description explicit-request-only.
- Keep URL response structured and avoid logging launch tokens.
- Do not run the complete workspace test suite without explicit user approval.
- Do not push commits.
