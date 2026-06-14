# GUI Thin Hook Followups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 收紧 `05-tui-and-client-convergence.md` 落地后的 GUI hook 厚度，隔离 GUI-specific 测试改动，并恢复 TUI/client facade 的 `unavailable` 错误语义。

**Architecture:** 这不是新功能阶段，只处理 review follow-up。新增 `codex-rs/app-server/src/in_process/gui.rs` 承接 in-process GUI launch 的 command plumbing、service 构造和 queue error 映射；`in_process.rs` 只保留枚举入口、sender 委托和 match 委托分支。`extensions.rs` 的生产 install hook 保留，但 GUI registry/service integration 测试迁到专属测试文件，避免原始 app-server 测试 helper 变成 GUI-aware。`codex-app-server-client` 保留现有 facade API，但把 `GuiLaunchServiceError::Unavailable` 映射成独立错误分支，而不是降级成 launch IO error。

**Tech Stack:** Rust 2024, tokio mpsc/oneshot, codex-app-server, codex-app-server-client, codex-tui, just focused tests.

---

## Files

- Create: `codex-rs/app-server/src/in_process/gui.rs`
- Create: `codex-rs/app-server/src/extensions_gui_tests.rs`
- Create if needed: `codex-rs/app-server/src/gui_launch_service_tests.rs`
- Modify: `codex-rs/app-server/src/in_process.rs`
- Modify: `codex-rs/app-server/src/extensions.rs`
- Modify: `codex-rs/app-server/src/gui_launch_service.rs`
- Modify: `codex-rs/app-server/src/message_processor_tracing_tests.rs`
- Modify: `codex-rs/app-server-client/src/gui.rs`
- Modify if TUI message test is added: `codex-rs/tui/src/app/gui.rs`
- Verify with existing plan: `docs/superpowers/plans/2026-06-13-gui-agent-tool-redesign/06-focused-verification.md`

## Task 1: Move In-Process GUI Launch Plumbing Out Of `in_process.rs`

- [ ] **Step 1: Add the in-process GUI submodule declaration**

In `codex-rs/app-server/src/in_process.rs`, add a child module near the other internal module usage:

```rust
mod gui;
```

Create the file path expected by that declaration:

```text
codex-rs/app-server/src/in_process/gui.rs
```

Expected: the new file is a child module of `in_process`, so it can use parent-private runtime types without making them crate-public.

- [ ] **Step 2: Move GUI response and command shapes into the submodule**

In `codex-rs/app-server/src/in_process/gui.rs`, define the GUI-specific command types:

```rust
use std::io;
use std::io::Error as IoError;
use std::io::ErrorKind;
use std::sync::Arc;

use codex_gui_host::GuiLaunchUrls;
use codex_protocol::ThreadId;
use tokio::sync::mpsc;
use tokio::sync::oneshot;

use crate::gui_connection_bridge::ExtraConnectionLocalGuiOpener;
use crate::gui_launch_service::AppServerGuiLaunchService;
use crate::gui_launch_service::GuiLaunchService;
use crate::gui_launch_service::GuiLaunchServiceError;
use crate::in_process_extra::ExtraConnectionCommandSender;

use super::InProcessClientMessage;
use super::ProcessorCommand;

pub(super) type PendingResponse = Result<GuiLaunchUrls, GuiLaunchServiceError>;

pub(super) enum ClientCommand {
    Launch {
        thread_id: ThreadId,
        response_tx: oneshot::Sender<PendingResponse>,
    },
}

pub(super) enum ProcessorGuiCommand {
    Launch {
        thread_id: ThreadId,
        response_tx: oneshot::Sender<PendingResponse>,
    },
}
```

Then change `codex-rs/app-server/src/in_process.rs` from GUI-specific fields:

```rust
LaunchGui {
    thread_id: ThreadId,
    response_tx: oneshot::Sender<PendingGuiLaunchResponse>,
},
```

to a single delegated variant:

```rust
Gui(gui::ClientCommand),
```

and change `ProcessorCommand::LaunchGui` to:

```rust
Gui(gui::ProcessorGuiCommand),
```

Expected: `in_process.rs` no longer owns `PendingGuiLaunchResponse` or GUI command field layout.

- [ ] **Step 3: Move sender-side launch request logic into the submodule**

In `codex-rs/app-server/src/in_process/gui.rs`, add:

```rust
pub(super) async fn launch_for_thread(
    client_tx: &mpsc::Sender<InProcessClientMessage>,
    thread_id: ThreadId,
) -> io::Result<PendingResponse> {
    let (response_tx, response_rx) = oneshot::channel();
    client_tx
        .try_send(InProcessClientMessage::Gui(ClientCommand::Launch {
            thread_id,
            response_tx,
        }))
        .map_err(|err| match err {
            mpsc::error::TrySendError::Full(_) => {
                IoError::new(ErrorKind::WouldBlock, "in-process GUI launch queue is full")
            }
            mpsc::error::TrySendError::Closed(_) => IoError::new(
                ErrorKind::BrokenPipe,
                "in-process app-server runtime is closed",
            ),
        })?;

    response_rx.await.map_err(|err| {
        IoError::new(
            ErrorKind::BrokenPipe,
            format!("in-process GUI launch response channel closed: {err}"),
        )
    })
}
```

Then reduce `InProcessClientSender::launch_gui_for_thread` in `codex-rs/app-server/src/in_process.rs` to:

```rust
pub async fn launch_gui_for_thread(
    &self,
    thread_id: ThreadId,
) -> IoResult<Result<GuiLaunchUrls, GuiLaunchServiceError>> {
    gui::launch_for_thread(&self.client_tx, thread_id).await
}
```

Expected: `InProcessClientSender` keeps the public-ish facade method, but the GUI queue send details live in `gui.rs`.

- [ ] **Step 4: Move GUI service construction into the submodule**

In `codex-rs/app-server/src/in_process/gui.rs`, add:

```rust
pub(super) fn launch_service(
    client_tx: mpsc::Sender<InProcessClientMessage>,
) -> Arc<AppServerGuiLaunchService> {
    Arc::new(AppServerGuiLaunchService::new_with_default_config(Arc::new(
        ExtraConnectionLocalGuiOpener::new(ExtraConnectionCommandSender::new(client_tx)),
    )))
}
```

Then replace the inline construction in `codex-rs/app-server/src/in_process.rs`:

```rust
let gui_launch_service = Arc::new(
    crate::gui_launch_service::AppServerGuiLaunchService::new_with_default_config(
        Arc::new(
            crate::gui_connection_bridge::ExtraConnectionLocalGuiOpener::new(
                crate::in_process_extra::ExtraConnectionCommandSender::new(
                    client_tx_for_gui,
                ),
            ),
        ),
    ),
);
```

with:

```rust
let gui_launch_service = gui::launch_service(client_tx_for_gui);
```

Expected: `in_process.rs` no longer names `ExtraConnectionLocalGuiOpener`, `ExtraConnectionCommandSender`, or `AppServerGuiLaunchService::new_with_default_config` in the main runtime body.

- [ ] **Step 5: Move client-loop GUI forwarding and queue error mapping**

In `codex-rs/app-server/src/in_process/gui.rs`, add:

```rust
#[derive(Debug, PartialEq, Eq)]
pub(super) enum ForwardOutcome {
    Continue,
    Break,
}

pub(super) fn forward_to_processor(
    command: ClientCommand,
    processor_tx: &mpsc::Sender<ProcessorCommand>,
) -> ForwardOutcome {
    let ClientCommand::Launch {
        thread_id,
        response_tx,
    } = command;

    match processor_tx.try_send(ProcessorCommand::Gui(ProcessorGuiCommand::Launch {
        thread_id,
        response_tx,
    })) {
        Ok(()) => ForwardOutcome::Continue,
        Err(mpsc::error::TrySendError::Full(ProcessorCommand::Gui(
            ProcessorGuiCommand::Launch { response_tx, .. },
        ))) => {
            let _ = response_tx.send(Err(GuiLaunchServiceError::Unavailable {
                message: "in-process app-server request queue is full".to_string(),
            }));
            ForwardOutcome::Continue
        }
        Err(mpsc::error::TrySendError::Full(_)) => {
            unreachable!("GUI launch send returned a different command")
        }
        Err(mpsc::error::TrySendError::Closed(ProcessorCommand::Gui(
            ProcessorGuiCommand::Launch { response_tx, .. },
        ))) => {
            let _ = response_tx.send(Err(GuiLaunchServiceError::Unavailable {
                message: "in-process app-server request processor is closed".to_string(),
            }));
            ForwardOutcome::Break
        }
        Err(mpsc::error::TrySendError::Closed(_)) => {
            unreachable!("GUI launch send returned a different command")
        }
    }
}
```

Then replace the large `InProcessClientMessage::LaunchGui` branch in `codex-rs/app-server/src/in_process.rs` with:

```rust
Some(InProcessClientMessage::Gui(command)) => {
    if gui::forward_to_processor(command, &processor_tx) == gui::ForwardOutcome::Break {
        break;
    }
}
```

Expected: the queue-full and queue-closed GUI-specific `Unavailable` strings move out of `in_process.rs`.

- [ ] **Step 6: Move processor-loop service invocation**

In `codex-rs/app-server/src/in_process/gui.rs`, add:

```rust
pub(super) async fn handle_processor_command(
    service: &AppServerGuiLaunchService,
    command: ProcessorGuiCommand,
) {
    let ProcessorGuiCommand::Launch {
        thread_id,
        response_tx,
    } = command;
    let result = service.launch_urls_for_thread(thread_id).await;
    let _ = response_tx.send(result);
}
```

Then replace the `ProcessorCommand::LaunchGui` branch in `codex-rs/app-server/src/in_process.rs` with:

```rust
Some(ProcessorCommand::Gui(command)) => {
    gui::handle_processor_command(&gui_launch_service, command).await;
}
```

Expected: `in_process.rs` keeps one small GUI branch in each loop, and all GUI-specific behavior is in `in_process/gui.rs`.

- [ ] **Step 7: Run the focused app-server regression test**

Run:

```bash
cd codex-rs
just test -p codex-app-server in_process_launch_gui_for_thread_uses_app_server_service
```

Expected: the existing launch path still returns a loopback URL containing the requested `threadId`.

## Task 2: Preserve `Unavailable` As A Distinct Client Error

- [ ] **Step 1: Add an explicit unavailable client error**

In `codex-rs/app-server-client/src/gui.rs`, change:

```rust
pub enum GuiLaunchError {
    Config { message: String },
    Io(io::Error),
    UnsupportedRemote,
}
```

to:

```rust
pub enum GuiLaunchError {
    Config { message: String },
    Io(io::Error),
    Unavailable { message: String },
    UnsupportedRemote,
}
```

Update `Display`:

```rust
Self::Unavailable { message } => write!(f, "GUI launch unavailable: {message}"),
```

Update `Error::source`:

```rust
Self::Config { .. } | Self::Unavailable { .. } | Self::UnsupportedRemote => None,
```

Expected: client callers can distinguish unsupported remote, unavailable local capability, config errors, and launch IO errors.

- [ ] **Step 2: Fix service error mapping**

In `impl From<GuiLaunchServiceError> for GuiLaunchError`, replace the combined launch/unavailable mapping:

```rust
GuiLaunchServiceError::Launch { message }
| GuiLaunchServiceError::Unavailable { message } => Self::Io(IoError::other(message)),
```

with:

```rust
GuiLaunchServiceError::Launch { message } => Self::Io(IoError::other(message)),
GuiLaunchServiceError::Unavailable { message } => Self::Unavailable { message },
```

Expected: `GuiLaunchServiceError::Unavailable` renders as `GUI launch unavailable: ...`, not `GUI host launch error: ...`.

- [ ] **Step 3: Add focused app-server-client regression tests**

In the existing test module in `codex-rs/app-server-client/src/gui.rs`, add:

```rust
#[test]
fn unavailable_service_error_message_is_stable() {
    let error = GuiLaunchError::from(GuiLaunchServiceError::Unavailable {
        message: "session does not expose GUI launch".to_string(),
    });

    assert_eq!(
        error.to_string(),
        "GUI launch unavailable: session does not expose GUI launch"
    );
    assert!(error.source().is_none());
}

#[test]
fn launch_service_error_remains_launch_error() {
    let error = GuiLaunchError::from(GuiLaunchServiceError::Launch {
        message: "port is already in use".to_string(),
    });

    assert_eq!(
        error.to_string(),
        "GUI host launch error: port is already in use"
    );
    assert!(error.source().is_some());
}
```

Expected: the new unavailable test fails before the mapping fix and passes after it.

- [ ] **Step 4: Run app-server-client focused tests**

Run:

```bash
cd codex-rs
just test -p codex-app-server-client unavailable_service_error_message_is_stable
just test -p codex-app-server-client launch_service_error_remains_launch_error
just test -p codex-app-server-client remote_launch_gui_for_thread_is_unsupported
```

Expected: unavailable, launch, and remote unsupported semantics are all distinct.

## Task 3: Keep TUI `/gui` Error Text Clear

- [ ] **Step 1: Add a TUI formatting regression if the enum is consumed directly**

If `codex-rs/tui/src/app/gui.rs` still formats `GuiLaunchError` through `gui_launch_error_message`, add this test in the existing test module:

```rust
#[test]
fn gui_launch_error_message_preserves_unavailable_text() {
    let error = codex_app_server_client::GuiLaunchError::Unavailable {
        message: "session does not expose GUI launch".to_string(),
    };

    assert_eq!(
        gui_launch_error_message(&error),
        "Failed to launch GUI: GUI launch unavailable: session does not expose GUI launch"
    );
}
```

Expected: TUI transcript text remains user-facing and does not say `GUI host launch error` for unavailable cases.

- [ ] **Step 2: Run the TUI focused formatting test**

Run:

```bash
cd codex-rs
just test -p codex-tui gui_launch_error_message_preserves_unavailable_text
```

Expected: the focused TUI test passes. If this change creates `*.snap.new` files, inspect and accept only `/gui` related snapshots following `06-focused-verification.md`.

## Task 4: Move GUI-Specific Extension Tests Out Of `extensions.rs`

- [ ] **Step 1: Keep only the production extension hook in `extensions.rs`**

Keep this production code in `codex-rs/app-server/src/extensions.rs`:

```rust
let gui_launch_availability = Arc::clone(&gui_launch_service);
codex_gui_agent_extension::install_with_service(
    &mut builder,
    gui_launch_service,
    move |_config: &Config| gui_launch_availability.is_available(),
);
```

Expected: the app-server extension registry still installs `launch_gui` through the shared app-server service. Do not move this production hook.

- [ ] **Step 2: Add a sibling GUI test module for app-server extension wiring**

In `codex-rs/app-server/src/extensions.rs`, add this sibling test module declaration near the existing `#[cfg(test)] mod tests`:

```rust
#[cfg(test)]
#[path = "extensions_gui_tests.rs"]
mod gui_tests;
```

Expected: GUI-specific extension wiring tests can live outside the original `extensions.rs` test module.

- [ ] **Step 3: Move lightweight registry tests into `extensions_gui_tests.rs`**

Create `codex-rs/app-server/src/extensions_gui_tests.rs` with tests that verify app-server wiring only. Move `thread_extensions_hide_launch_gui_tool_when_gui_service_unavailable` and a light version of `thread_extensions_install_launch_gui_tool_when_gui_service_available` into this file.

Use this structure:

```rust
use std::sync::Arc;
use std::sync::Weak;

use codex_extension_api::ExtensionData;
use codex_extension_api::NoopExtensionEventSink;
use codex_extension_api::ThreadStartInput;
use codex_goal_extension::GoalService;
use codex_login::AuthManager;
use codex_protocol::ThreadId;
use codex_protocol::protocol::SessionSource;
use core_test_support::load_default_config_for_test;
use pretty_assertions::assert_eq;

use crate::extensions::guardian_agent_spawner;
use crate::extensions::thread_extensions;

#[tokio::test]
async fn thread_extensions_hide_launch_gui_tool_when_gui_service_unavailable() {
    let codex_home = tempfile::TempDir::new().expect("tempdir");
    let config = load_default_config_for_test(&codex_home).await;
    let gui_launch_service = Arc::new(
        crate::gui_launch_service::AppServerGuiLaunchService::unavailable(
            "GUI launch is unavailable in this test",
        ),
    );

    assert_eq!(
        Vec::<String>::new(),
        launch_gui_tool_names_for_service(&config, gui_launch_service).await
    );
}

#[tokio::test]
async fn thread_extensions_install_launch_gui_tool_when_gui_service_available() {
    let codex_home = tempfile::TempDir::new().expect("tempdir");
    let config = load_default_config_for_test(&codex_home).await;
    let gui_launch_service = Arc::new(
        crate::gui_launch_service::test_support::new_test_gui_launch_service(
            codex_gui_host::GuiHostMode::Dev(codex_gui_host::DevAssetProxyConfig {
                vite_origin: "http://127.0.0.1:5173".to_string(),
            }),
        )
        .await
        .into_service(),
    );

    assert_eq!(
        vec!["launch_gui".to_string()],
        launch_gui_tool_names_for_service(&config, gui_launch_service).await
    );
}

async fn launch_gui_tool_names_for_service(
    config: &codex_core::config::Config,
    gui_launch_service: Arc<crate::gui_launch_service::AppServerGuiLaunchService>,
) -> Vec<String> {
    let auth_manager =
        AuthManager::shared_from_config(config, /*enable_codex_api_key_env*/ false).await;
    let registry = thread_extensions(
        guardian_agent_spawner(Weak::new()),
        Arc::new(NoopExtensionEventSink),
        auth_manager,
        /*state_db*/ None,
        Weak::new(),
        Arc::new(GoalService::new()),
        gui_launch_service,
    );
    let session_store = ExtensionData::new("session-test");
    let thread_id = ThreadId::default();
    let thread_store = ExtensionData::new(thread_id.to_string());
    let source = SessionSource::Cli;

    for contributor in registry.thread_lifecycle_contributors() {
        contributor
            .on_thread_start(ThreadStartInput {
                config,
                session_source: &source,
                persistent_thread_state_available: true,
                session_store: &session_store,
                thread_store: &thread_store,
            })
            .await;
    }

    registry
        .tool_contributors()
        .iter()
        .flat_map(|contributor| contributor.tools(&session_store, &thread_store))
        .map(|tool| tool.tool_name().name)
        .filter(|name| name == "launch_gui")
        .collect()
}
```

Expected: `extensions_gui_tests.rs` tests registry availability only; it does not call `tool.handle(...)`, does not parse function-call output JSON, and does not assert host active state.

- [ ] **Step 4: Add a helper that exposes test service without leaking bridge details**

In `codex-rs/app-server/src/gui_launch_service.rs` test support, if needed, extend `TestGuiLaunchService`:

```rust
impl TestGuiLaunchService {
    pub(crate) fn into_service(self) -> AppServerGuiLaunchService {
        self.service
    }
}
```

Expected: app-server extension wiring tests can get an available service without constructing `GuiHostManager` and local bridge directly in `extensions.rs`.

- [ ] **Step 5: Move tool execution coverage to GUI launch service tests**

If the removed `extensions.rs` test was the only app-server-level coverage that proves `AppServerGuiLaunchService` adapts to `codex_gui_agent_extension::GuiLaunchToolService`, move that assertion to `codex-rs/app-server/src/gui_launch_service_tests.rs`.

In `codex-rs/app-server/src/gui_launch_service.rs`, add:

```rust
#[cfg(test)]
#[path = "gui_launch_service_tests.rs"]
mod gui_launch_service_tests;
```

Then create `codex-rs/app-server/src/gui_launch_service_tests.rs`:

```rust
use std::sync::Arc;

use codex_gui_agent_extension::GuiLaunchToolService;
use codex_gui_host::DevAssetProxyConfig;
use codex_gui_host::GuiHostMode;
use codex_protocol::ThreadId;
use pretty_assertions::assert_eq;

#[tokio::test]
async fn app_server_gui_launch_service_returns_tool_urls() {
    let service = crate::gui_launch_service::test_support::new_test_gui_launch_service(
        GuiHostMode::Dev(DevAssetProxyConfig {
            vite_origin: "http://127.0.0.1:5173".to_string(),
        }),
    )
    .await;
    let thread_id =
        ThreadId::from_string("00000000-0000-0000-0000-0000000000a7").expect("valid thread id");

    let urls = GuiLaunchToolService::launch_urls_for_thread(&service, thread_id)
        .await
        .expect("launch should return tool URLs");

    assert_eq!(urls.entries[0].kind, codex_gui_agent_extension::GuiLaunchToolEntryKind::Local);
    assert!(urls.entries[0].url.contains("threadId=00000000-0000-0000-0000-0000000000a7"));
    service.shutdown().await;
}
```

Expected: tool execution coverage sits beside the app-server GUI service adapter, not in `extensions.rs`.

- [ ] **Step 6: Run focused tests for migrated extension coverage**

Run:

```bash
cd codex-rs
just test -p codex-app-server thread_extensions_hide_launch_gui_tool_when_gui_service_unavailable
just test -p codex-app-server thread_extensions_install_launch_gui_tool_when_gui_service_available
just test -p codex-app-server app_server_gui_launch_service_returns_tool_urls
```

Expected: migrated extension and service-adapter tests pass with the same behavior, but `extensions.rs` no longer carries GUI host/tool execution details.

## Task 5: Restore `message_processor_tracing_tests.rs` To Tracing-Only

- [ ] **Step 1: Remove GUI shutdown coverage from tracing tests**

In `codex-rs/app-server/src/message_processor_tracing_tests.rs`, remove GUI-specific helpers and test:

```rust
build_test_processor_with_gui_bridge
build_test_processor_with_service
clear_runtime_references_cancels_gui_launch_service
```

Expected: no test in `message_processor_tracing_tests.rs` starts a GUI bridge, constructs `GuiHostManager`, launches GUI URLs, or asserts GUI host active state.

- [ ] **Step 2: Keep tracing harness service injection minimal**

Keep `build_test_processor` simple by constructing an unavailable GUI service inline only to satisfy `MessageProcessorArgs`:

```rust
let gui_launch_service = Arc::new(
    crate::gui_launch_service::AppServerGuiLaunchService::unavailable(
        "GUI launch service is not needed for tracing tests",
    ),
);
```

Expected: tracing tests keep the `MessageProcessorArgs` compatibility shim, but do not expose helper variants that make tracing tests GUI-aware.

- [ ] **Step 3: Move shutdown coverage to a GUI-focused test module**

Move shutdown coverage to `codex-rs/app-server/src/gui_launch_service_tests.rs` or another `gui_*` test module if the coverage is still needed:

```rust
#[tokio::test]
async fn clear_runtime_references_cancels_gui_launch_service() -> anyhow::Result<()> {
    // Build a MessageProcessor with an available test GUI service, launch once,
    // call clear_runtime_references(), and assert the service no longer has an active host.
}
```

Expected: tracing tests remain about tracing; GUI lifecycle tests live in GUI-focused test modules.

- [ ] **Step 4: Run focused tests for migrated tracing coverage**

Run:

```bash
cd codex-rs
just test -p codex-app-server clear_runtime_references_cancels_gui_launch_service
just test -p codex-app-server app_server_request_span_links_to_remote_traceparent
```

Expected: migrated GUI lifecycle coverage passes in the GUI-focused test module, and an existing tracing test still passes after the harness simplification.

## Task 6: Thin-Hook Review Check

- [ ] **Step 1: Confirm `in_process.rs` only has small GUI entry points**

Run:

```bash
rg -n "Gui|gui|LaunchGui|GuiLaunchServiceError|ExtraConnectionLocalGuiOpener|new_with_default_config|request queue is full|request processor is closed" codex-rs/app-server/src/in_process.rs
```

Expected: matches in `in_process.rs` are limited to imports, `mod gui`, `InProcessClientMessage::Gui`, `ProcessorCommand::Gui`, `launch_gui_for_thread` delegation, service construction delegation, and two small match branches that call `gui::*`.

- [ ] **Step 2: Confirm GUI-specific plumbing moved to the new module**

Run:

```bash
rg -n "ForwardOutcome|launch_service|forward_to_processor|handle_processor_command|GUI launch unavailable|request queue is full|request processor is closed" codex-rs/app-server/src/in_process/gui.rs
```

Expected: GUI service construction, queue-full mapping, queue-closed mapping, and processor invocation all live in `in_process/gui.rs`.

- [ ] **Step 3: Confirm extension boundary remains unchanged**

Run:

```bash
rg -n "app-server-client|InProcessClientSender|codex_tui|codex-tui" codex-rs/ext/gui
```

Expected: no matches in `codex-rs/ext/gui`.

- [ ] **Step 4: Confirm original app-server test files are no longer GUI-heavy**

Run:

```bash
rg -n "DevAssetProxyConfig|GuiHostConfig|GuiHostMode|ToolCall|ToolPayload|FunctionCallOutputBody|build_test_processor_with_gui_bridge|clear_runtime_references_cancels_gui_launch_service" codex-rs/app-server/src/extensions.rs codex-rs/app-server/src/message_processor_tracing_tests.rs
```

Expected: no matches. GUI-specific test construction should live in `extensions_gui_tests.rs`, `gui_launch_service_tests.rs`, or another `gui_*` test module.

## Task 7: Format, Fix, And Handoff To Focused Verification

- [ ] **Step 1: Format Rust changes**

Run:

```bash
cd codex-rs
just fmt
```

Expected: formatter completes.

- [ ] **Step 2: Run scoped fixes for touched crates**

Run:

```bash
cd codex-rs
just fix -p codex-app-server
just fix -p codex-app-server-client
just fix -p codex-tui
```

Expected: scoped fixes complete. Do not run workspace-wide `just fix`.

- [ ] **Step 3: Apply the existing focused verification plan**

After Tasks 1-6 pass, continue with:

```text
docs/superpowers/plans/2026-06-13-gui-agent-tool-redesign/06-focused-verification.md
```

Expected: `06-focused-verification.md` remains the final verification stage; this `05a` plan only handles the review follow-up code changes.

- [ ] **Step 4: Commit the follow-up separately**

Run:

```bash
git status --short
git add codex-rs/app-server/src/in_process.rs \
  codex-rs/app-server/src/in_process/gui.rs \
  codex-rs/app-server/src/extensions.rs \
  codex-rs/app-server/src/extensions_gui_tests.rs \
  codex-rs/app-server/src/gui_launch_service.rs \
  codex-rs/app-server/src/gui_launch_service_tests.rs \
  codex-rs/app-server/src/message_processor_tracing_tests.rs \
  codex-rs/app-server-client/src/gui.rs \
  codex-rs/tui/src/app/gui.rs
git commit -m "refactor(gui): thin launch hooks"
```

Expected: commit contains only hook-thinning, GUI test isolation, and unavailable-error follow-up changes. Verification-only generated artifacts, if any, stay separate and are handled by `06-focused-verification.md`.
