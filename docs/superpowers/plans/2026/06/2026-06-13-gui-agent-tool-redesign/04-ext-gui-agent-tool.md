# GUI Extension Agent Tool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增 `codex-rs/ext/gui` extension crate，按 goal extension 模式提供 `launch_gui` agent tool。

**Architecture:** `ext/gui` owns tool schema、executor、error JSON 和 install API。它只依赖一个注入的 GUI launch service capability，不依赖 app-server-client、TUI 或 `InProcessClientSender`。

**Tech Stack:** Rust 2024, codex-extension-api, codex-tools ToolSpec, serde, codex-gui-host URL types, app-server extension registry.

---

## Files

- Create: `codex-rs/ext/gui/Cargo.toml`
- Create: `codex-rs/ext/gui/BUILD.bazel`
- Create: `codex-rs/ext/gui/src/lib.rs`
- Create: `codex-rs/ext/gui/src/extension.rs`
- Create: `codex-rs/ext/gui/src/spec.rs`
- Create: `codex-rs/ext/gui/src/tool.rs`
- Modify: `codex-rs/Cargo.toml`
- Modify: `codex-rs/app-server/Cargo.toml`
- Modify: `codex-rs/app-server/src/extensions.rs`
- Modify: `codex-rs/app-server/src/message_processor.rs`
- Test: `codex-rs/ext/gui/tests/gui_extension.rs`

## Task 1: Scaffold Crate And Tool Spec

- [ ] **Step 1: Add failing schema test**

Create `codex-rs/ext/gui/tests/gui_extension.rs`:

```rust
use codex_gui_agent_extension::LAUNCH_GUI_TOOL_NAME;
use codex_gui_agent_extension::create_launch_gui_tool;
use pretty_assertions::assert_eq;

#[test]
fn launch_gui_tool_schema_is_stable() {
    let spec = create_launch_gui_tool();
    assert_eq!(LAUNCH_GUI_TOOL_NAME, "launch_gui");
    assert_eq!(spec.name, "launch_gui");
    assert!(spec.description.contains("local GUI"));
}
```

Expected initial result: compile fails because crate and functions do not exist.

- [ ] **Step 2: Add crate files**

Create `Cargo.toml` with dependencies matching goal extension style:

```toml
[package]
name = "codex-gui-agent-extension"
version = { workspace = true }
edition = { workspace = true }

[dependencies]
async-trait = { workspace = true }
codex-extension-api = { workspace = true }
codex-gui-host = { workspace = true }
codex-protocol = { workspace = true }
serde = { workspace = true }
serde_json = { workspace = true }
tracing = { workspace = true }

[dev-dependencies]
pretty_assertions = { workspace = true }
tokio = { workspace = true, features = ["macros", "rt-multi-thread"] }
```

Create `src/lib.rs`:

```rust
//! Extension crate for the `launch_gui` agent tool.

mod extension;
mod spec;
mod tool;

pub use extension::GuiExtension;
pub use extension::GuiExtensionConfig;
pub use extension::install_with_service;
pub use spec::LAUNCH_GUI_TOOL_NAME;
pub use spec::create_launch_gui_tool;
pub use tool::GuiLaunchToolErrorKind;
```

- [ ] **Step 3: Add tool spec**

Create `src/spec.rs`:

```rust
use codex_extension_api::ToolSpec;

pub const LAUNCH_GUI_TOOL_NAME: &str = "launch_gui";

pub fn create_launch_gui_tool() -> ToolSpec {
    ToolSpec::new(
        LAUNCH_GUI_TOOL_NAME,
        "Launch the local GUI for this thread and return local GUI URLs as JSON.",
        serde_json::json!({
            "type": "object",
            "properties": {},
            "additionalProperties": false
        }),
    )
}
```

If `ToolSpec::new` has a different signature, follow `codex-rs/ext/goal/src/spec.rs` exactly and keep the same schema semantics.

## Task 2: Implement Tool Executor

- [ ] **Step 1: Add success/error tests**

In `tests/gui_extension.rs`, add tests using a fake service:

```rust
#[tokio::test]
async fn launch_gui_tool_returns_urls_json() {
    let tool = codex_gui_agent_extension::test_support::launch_gui_tool_with_urls(vec![
        ("local", "Local", "http://127.0.0.1:1234/?threadId=t#token=x"),
    ]);
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
    let tool = codex_gui_agent_extension::test_support::launch_gui_tool_with_error(
        codex_gui_agent_extension::GuiLaunchToolErrorKind::Unavailable,
        "no active thread",
    );
    let output = tool
        .invoke_for_test("{}")
        .await
        .expect("tool returns model-readable error JSON");
    let value: serde_json::Value = serde_json::from_str(&output).expect("json output");
    assert_eq!(value["error"]["kind"], "unavailable");
    assert_eq!(value["error"]["message"], "no active thread");
}
```

Expected initial result: compile fails until executor/test support exists.

- [ ] **Step 2: Define extension-facing service trait**

In `tool.rs`, define an object-safe trait:

```rust
pub trait GuiLaunchToolService: Send + Sync {
    fn launch_urls_for_thread(
        &self,
        thread_id: codex_protocol::ThreadId,
    ) -> std::pin::Pin<
        Box<
            dyn std::future::Future<
                    Output = Result<codex_gui_host::GuiLaunchUrls, GuiLaunchToolError>,
                > + Send
                + '_,
        >,
    >;
}
```

Use boxed future here only for object safety at the injected extension boundary. Do not use `#[async_trait]`.

- [ ] **Step 3: Implement executor**

Implement `ToolExecutor<ToolCall>` matching goal style:

```rust
pub(crate) struct LaunchGuiToolExecutor {
    thread_id: codex_protocol::ThreadId,
    service: std::sync::Arc<dyn GuiLaunchToolService>,
}
```

`handle` should:

- parse empty arguments and reject non-empty/invalid arguments using `FunctionCallError::RespondToModel`;
- call service with the thread id;
- on success return `JsonToolOutput` containing `{"urls":[...]}`;
- on service error return `JsonToolOutput` containing `{"error":{"kind":"...","message":"..."}}`.

Do not auto-open browser and do not return plain text as the primary output.

## Task 3: Implement Extension And App-Server Install

- [ ] **Step 1: Add extension contributor**

Create `extension.rs`:

```rust
#[derive(Clone, Debug)]
pub struct GuiExtensionConfig {
    pub enabled: bool,
}

#[derive(Clone)]
pub struct GuiExtension<C> {
    service: std::sync::Arc<dyn crate::tool::GuiLaunchToolService>,
    enabled: std::sync::Arc<dyn Fn(&C) -> bool + Send + Sync>,
}
```

Implement `ThreadLifecycleContributor<C>` to store `GuiExtensionConfig` in thread store.

Implement `ToolContributor` to return `LaunchGuiToolExecutor` only when enabled and a valid thread id can be parsed from `thread_store.level_id()`.

- [ ] **Step 2: Add install function**

Expose:

```rust
pub fn install_with_service<C>(
    registry: &mut codex_extension_api::ExtensionRegistryBuilder<C>,
    service: std::sync::Arc<dyn crate::tool::GuiLaunchToolService>,
    enabled: impl Fn(&C) -> bool + Send + Sync + 'static,
)
where
    C: Send + Sync + 'static,
{
    let extension = std::sync::Arc::new(GuiExtension::new(service, enabled));
    registry.thread_lifecycle_contributor(extension.clone());
    registry.tool_contributor(extension);
}
```

- [ ] **Step 3: Install from app-server**

In `codex-rs/app-server/src/extensions.rs`, add install call beside goal install:

```rust
codex_gui_agent_extension::install_with_service(
    &mut builder,
    gui_launch_service,
    |config: &Config| config.features.enabled(codex_features::Feature::Gui),
);
```

If no `Feature::Gui` exists, use the existing `/gui` source of truth. Do not invent a new user-facing config flag in this task.

## Task 4: Run Focused Tests And Commit

- [ ] **Step 1: Run extension tests**

Run:

```bash
cd codex-rs
just test -p codex-gui-agent-extension
```

Expected: extension tests pass.

- [ ] **Step 2: Format and commit**

Run:

```bash
cd codex-rs
just fmt
git status --short
git add codex-rs/ext/gui codex-rs/Cargo.toml codex-rs/app-server/Cargo.toml \
  codex-rs/app-server/src/extensions.rs codex-rs/app-server/src/message_processor.rs
git commit -m "feat(gui): add launch gui extension tool"
```

Expected: one focused extension commit.
