# Codex GUI Host App-Server-Client Facade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `codex-app-server-client` 中暴露 GUI launch URL facade，让后续 TUI `/gui` 可以请求当前 in-process app-server session 的本机 GUI URL。

**Architecture:** 本计划执行 `00-roadmap.md` 中的 `05 app-server-client facade`，只连接 `04` 已交付的 `GuiHostManager`，不新增 TUI 命令、不改 frontend、不改 app-server protocol。GUI host manager 只作为 in-process worker 的局部状态懒创建和关闭，`InProcessAppServerClient` 结构体仍保持现有 `command_tx` / `event_rx` / `worker_handle` 形状，不改成 GUI-aware 状态机或多个 `Option<_>` 字段。

**Tech Stack:** Rust 2024, codex-app-server-client, codex-app-server `GuiHostManager`, codex-gui-host config, tokio mpsc/oneshot, codex-protocol `ThreadId`, in-process app-server runtime.

---

## Scope

本计划只实现 app-server-client facade。

允许修改：

- `codex-rs/app-server-client/Cargo.toml`
- `codex-rs/app-server-client/src/gui.rs`
- `codex-rs/app-server-client/src/lib.rs`
- `codex-rs/Cargo.lock`
- `MODULE.bazel.lock`

不允许修改：

- `codex-rs/app-server/**`
- `codex-rs/tui/**`
- `codex-gui/**`
- `codex-rs/core/**`
- `codex-rs/app-server-protocol/**`
- `codex-rs/gui-host/**`
- `docs/superpowers/plans/2026-05-30-gui-host/06-*`

停止条件：

- 如果需要修改 `codex-rs/app-server/src/gui_host.rs`、`gui_transport.rs`、`in_process_extra.rs` 或 `in_process.rs`，停止并回到 `04` 结果审计。
- 如果需要把 TUI `/gui` 命令一起实现，停止；那属于 `06-tui-gui-command.md`。
- 如果需要 app-server v2 API 新方法或 protocol shape，停止；GUI launch facade 首版只服务 in-process client。
- 如果需要让 remote app-server client 启动 GUI host，停止；remote path 首版返回 unsupported。
- 如果需要把 `InProcessAppServerClient` 字段改成多个 `Option<_>` 或 GUI-aware state machine，停止。

## Source Of Truth

解释冲突时按以下顺序：

1. `docs/superpowers/plans/2026-05-30-gui-host/00-roadmap.md`
2. `docs/superpowers/plans/2026-05-30-gui-host/03-bridge-boundary-decision.md` 的 `Decision Output`
3. `docs/superpowers/plans/2026-05-30-gui-host/04-minimal-app-server-adapter.md`
4. `docs/superpowers/specs/2026-05-30-codex-gui-host-dev-adaptation-design.md`
5. `docs/superpowers/specs/2026-05-11-codex-gui-host-redesign.md`
6. current source under `codex-rs/app-server-client/**`

## File Responsibilities

- `codex-rs/app-server-client/Cargo.toml`: add direct `codex-gui-host` dependency so the client facade can build `GuiHostConfig` without changing app-server.
- `codex-rs/app-server-client/src/gui.rs`: own public GUI facade types and methods: `GuiLaunchUrl`, `GuiLaunchError`, `AppServerClientGuiExt`, config construction, and in-process/remote launch behavior.
- `codex-rs/app-server-client/src/lib.rs`: declare/re-export `gui`, add a `ClientCommand::LaunchGui` worker command, keep `GuiHostManager` as worker-local state, and shut it down before app-server runtime shutdown.
- `codex-rs/Cargo.lock` and `MODULE.bazel.lock`: dependency-lock consequences of the direct `codex-gui-host` manifest edge, if generated tooling changes them.

## Task 1: Confirm Gate And Add Facade Module Skeleton

**Files:**
- Verify: `docs/superpowers/plans/2026-05-30-gui-host/00-roadmap.md`
- Verify: `docs/superpowers/plans/2026-05-30-gui-host/03-bridge-boundary-decision.md`
- Verify: `docs/superpowers/plans/2026-05-30-gui-host/04-minimal-app-server-adapter.md`
- Modify: `codex-rs/app-server-client/Cargo.toml`
- Modify: `codex-rs/app-server-client/src/lib.rs`
- Create: `codex-rs/app-server-client/src/gui.rs`

- [ ] **Step 1: Confirm `05` is the next roadmap step**

Run from repo root:

```bash
rg -n '05 app-server-client facade|06 TUI /gui command|codex-rs/app-server-client/src/gui.rs|remote client 返回 unsupported|TUI 只调用 app-server-client facade' \
  docs/superpowers/plans/2026-05-30-gui-host/00-roadmap.md \
  docs/superpowers/plans/2026-05-30-gui-host/03-bridge-boundary-decision.md \
  docs/superpowers/plans/2026-05-30-gui-host/04-minimal-app-server-adapter.md
```

Expected: output confirms `05` is before `06`, `app-server-client/src/gui.rs` is deferred to `05`, and TUI work remains deferred.

- [ ] **Step 2: Confirm `04` exported `GuiHostManager`**

Run from repo root:

```bash
rg -n 'pub use crate::gui_host::GuiHostManager|pub struct GuiHostManager|pub async fn launch_url_for_thread|pub async fn shutdown' \
  codex-rs/app-server/src/lib.rs \
  codex-rs/app-server/src/gui_host.rs
```

Expected: `codex-app-server` publicly exports `GuiHostManager`, and the manager exposes `launch_url_for_thread` plus async `shutdown`.

- [ ] **Step 3: Add direct `codex-gui-host` dependency**

Edit `codex-rs/app-server-client/Cargo.toml` and add this dependency near the other `codex-*` dependencies:

```toml
codex-gui-host = { workspace = true }
```

Do not add any dependency from `codex-rs/tui` to `codex-gui-host` or `codex-app-server`.

- [ ] **Step 4: Declare and re-export the facade module**

Edit `codex-rs/app-server-client/src/lib.rs`.

Near the existing module declarations:

```rust
mod gui;
mod remote;
```

Near the existing public exports:

```rust
pub use crate::gui::AppServerClientGuiExt;
pub use crate::gui::GuiLaunchError;
pub use crate::gui::GuiLaunchUrl;
```

- [ ] **Step 5: Create `gui.rs` with facade types**

Create `codex-rs/app-server-client/src/gui.rs`:

```rust
use std::error::Error;
use std::fmt;
use std::future::Future;
use std::io;
use std::io::Error as IoError;
use std::io::ErrorKind;

use codex_app_server::GuiHostManager;
use codex_app_server::in_process::InProcessClientSender;
use codex_gui_host::GuiHostConfig;
use codex_gui_host::GuiHostMode;
use codex_protocol::ThreadId;
use tokio::sync::oneshot;

use crate::AppServerClient;
use crate::ClientCommand;
use crate::InProcessAppServerClient;
use crate::RemoteAppServerClient;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GuiLaunchUrl(String);

impl GuiLaunchUrl {
    pub fn as_str(&self) -> &str {
        &self.0
    }

    pub fn into_string(self) -> String {
        self.0
    }

    pub(crate) fn new(url: String) -> Self {
        Self(url)
    }
}

impl fmt::Display for GuiLaunchUrl {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

#[derive(Debug)]
pub enum GuiLaunchError {
    Config { message: String },
    Io(io::Error),
    UnsupportedRemote,
}

impl fmt::Display for GuiLaunchError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Config { message } => write!(f, "GUI host config error: {message}"),
            Self::Io(error) => write!(f, "GUI host launch error: {error}"),
            Self::UnsupportedRemote => {
                f.write_str("GUI launch is only supported for in-process app-server sessions")
            }
        }
    }
}

impl Error for GuiLaunchError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Io(error) => Some(error),
            Self::Config { .. } | Self::UnsupportedRemote => None,
        }
    }
}

impl From<io::Error> for GuiLaunchError {
    fn from(value: io::Error) -> Self {
        Self::Io(value)
    }
}

pub trait AppServerClientGuiExt {
    fn launch_gui_for_thread(
        &self,
        thread_id: ThreadId,
    ) -> impl Future<Output = Result<GuiLaunchUrl, GuiLaunchError>> + Send;
}

pub(crate) fn new_gui_host_manager(
    sender: InProcessClientSender,
) -> Result<GuiHostManager, GuiLaunchError> {
    let mode = GuiHostMode::default_for_profile().map_err(|error| GuiLaunchError::Config {
        message: error.to_string(),
    })?;
    Ok(GuiHostManager::new(sender, GuiHostConfig { mode }))
}

impl InProcessAppServerClient {
    pub async fn launch_gui_for_thread(
        &self,
        thread_id: ThreadId,
    ) -> Result<GuiLaunchUrl, GuiLaunchError> {
        let (response_tx, response_rx) = oneshot::channel();
        self.command_tx
            .send(ClientCommand::LaunchGui {
                thread_id,
                response_tx,
            })
            .await
            .map_err(|_| {
                GuiLaunchError::Io(IoError::new(
                    ErrorKind::BrokenPipe,
                    "in-process app-server worker channel is closed",
                ))
            })?;
        response_rx.await.map_err(|_| {
            GuiLaunchError::Io(IoError::new(
                ErrorKind::BrokenPipe,
                "in-process GUI launch response channel is closed",
            ))
        })?
    }
}

impl RemoteAppServerClient {
    pub async fn launch_gui_for_thread(
        &self,
        _thread_id: ThreadId,
    ) -> Result<GuiLaunchUrl, GuiLaunchError> {
        Err(GuiLaunchError::UnsupportedRemote)
    }
}

impl AppServerClient {
    pub async fn launch_gui_for_thread(
        &self,
        thread_id: ThreadId,
    ) -> Result<GuiLaunchUrl, GuiLaunchError> {
        match self {
            Self::InProcess(client) => client.launch_gui_for_thread(thread_id).await,
            Self::Remote(client) => client.launch_gui_for_thread(thread_id).await,
        }
    }
}

impl AppServerClientGuiExt for InProcessAppServerClient {
    async fn launch_gui_for_thread(
        &self,
        thread_id: ThreadId,
    ) -> Result<GuiLaunchUrl, GuiLaunchError> {
        InProcessAppServerClient::launch_gui_for_thread(self, thread_id).await
    }
}

impl AppServerClientGuiExt for RemoteAppServerClient {
    async fn launch_gui_for_thread(
        &self,
        thread_id: ThreadId,
    ) -> Result<GuiLaunchUrl, GuiLaunchError> {
        RemoteAppServerClient::launch_gui_for_thread(self, thread_id).await
    }
}

impl AppServerClientGuiExt for AppServerClient {
    async fn launch_gui_for_thread(
        &self,
        thread_id: ThreadId,
    ) -> Result<GuiLaunchUrl, GuiLaunchError> {
        AppServerClient::launch_gui_for_thread(self, thread_id).await
    }
}
```

- [ ] **Step 6: Compile-check the module skeleton**

Run from `codex-rs`:

```bash
just test -p codex-app-server-client gui_launch_url_display
```

Expected at this point: compile fails because `ClientCommand::LaunchGui` is referenced by `gui.rs` but not added to `ClientCommand` yet. Continue to Task 2 before committing.

Do not use `cargo test` directly.

## Task 2: Add Worker Command And Local Manager State

**Files:**
- Modify: `codex-rs/app-server-client/src/lib.rs`
- Modify: `codex-rs/app-server-client/src/gui.rs`

- [ ] **Step 1: Import `ThreadId`**

Edit `codex-rs/app-server-client/src/lib.rs` imports:

```rust
use codex_protocol::ThreadId;
use codex_protocol::protocol::SessionSource;
```

Keep the existing `SessionSource` import; add `ThreadId` without changing other protocol imports.

- [ ] **Step 2: Add `LaunchGui` to `ClientCommand`**

Edit `ClientCommand` in `codex-rs/app-server-client/src/lib.rs`:

```rust
enum ClientCommand {
    Request {
        request: Box<ClientRequest>,
        response_tx: oneshot::Sender<IoResult<RequestResult>>,
    },
    Notify {
        notification: ClientNotification,
        response_tx: oneshot::Sender<IoResult<()>>,
    },
    LaunchGui {
        thread_id: ThreadId,
        response_tx: oneshot::Sender<Result<GuiLaunchUrl, GuiLaunchError>>,
    },
    ResolveServerRequest {
        request_id: RequestId,
        result: JsonRpcResult,
        response_tx: oneshot::Sender<IoResult<()>>,
    },
    RejectServerRequest {
        request_id: RequestId,
        error: JSONRPCErrorError,
        response_tx: oneshot::Sender<IoResult<()>>,
    },
    Shutdown {
        response_tx: oneshot::Sender<IoResult<()>>,
    },
}
```

This requires the `GuiLaunchUrl` and `GuiLaunchError` re-exports from Task 1.

- [ ] **Step 3: Add worker-local GUI manager state**

In `InProcessAppServerClient::start`, after `let request_sender = handle.sender();`, add:

```rust
let gui_sender = request_sender.clone();
```

Inside the spawned worker task, before `loop`, add:

```rust
let mut gui_host_manager = None::<codex_app_server::GuiHostManager>;
```

Do not add a `gui_host_manager` field to `InProcessAppServerClient`.

- [ ] **Step 4: Handle `LaunchGui` in the worker**

In the `match command` block inside the worker task, add this branch after `Notify` and before server-request branches:

```rust
Some(ClientCommand::LaunchGui {
    thread_id,
    response_tx,
}) => {
    let result = async {
        if gui_host_manager.is_none() {
            gui_host_manager = Some(crate::gui::new_gui_host_manager(gui_sender.clone())?);
        }
        let manager = gui_host_manager
            .as_ref()
            .expect("GUI host manager should exist after lazy construction");
        let url = manager.launch_url_for_thread(thread_id).await?;
        Ok(GuiLaunchUrl::new(url))
    }
    .await;
    let _ = response_tx.send(result);
}
```

Expected behavior:

- The GUI config is read only when `launch_gui_for_thread` is called.
- Invalid `CODEX_GUI_HOST_MODE` or missing prod `CODEX_GUI_PACKAGE_ROOT` fails the GUI launch call, not app-server-client startup.
- The manager is reused for later launch requests in the same worker.

- [ ] **Step 5: Shut down GUI manager before runtime shutdown**

In the same worker `match`, update both shutdown paths:

```rust
Some(ClientCommand::Shutdown { response_tx }) => {
    if let Some(manager) = gui_host_manager.take() {
        manager.shutdown().await;
    }
    let shutdown_result = handle.shutdown().await;
    let _ = response_tx.send(shutdown_result);
    break;
}
None => {
    if let Some(manager) = gui_host_manager.take() {
        manager.shutdown().await;
    }
    let _ = handle.shutdown().await;
    break;
}
```

This preserves the `04` requirement that async GUI host shutdown happens before app-server runtime teardown.

- [ ] **Step 6: Confirm no GUI-aware struct fields were added**

Run from repo root:

```bash
rg -n 'gui_host_manager|GuiHostManager|Option<.*Gui|Option<.*Host' codex-rs/app-server-client/src/lib.rs
```

Expected:

- Matches are allowed inside the worker-local code added in Task 2.
- No match should appear in the `pub struct InProcessAppServerClient` field list.
- No match should appear in `pub enum AppServerClient`.

If a GUI manager field was added to `InProcessAppServerClient`, remove it and keep the manager local to the worker task.

## Task 3: Add Focused Facade Tests

**Files:**
- Modify: `codex-rs/app-server-client/src/lib.rs`
- Modify: `codex-rs/app-server-client/src/gui.rs`

- [ ] **Step 1: Add a URL wrapper unit test**

Add this test module to the bottom of `codex-rs/app-server-client/src/gui.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use pretty_assertions::assert_eq;

    #[test]
    fn gui_launch_url_display() {
        let url = GuiLaunchUrl::new("http://127.0.0.1:1234/?threadId=t#token=x".to_string());

        assert_eq!(url.as_str(), "http://127.0.0.1:1234/?threadId=t#token=x");
        assert_eq!(
            url.to_string(),
            "http://127.0.0.1:1234/?threadId=t#token=x"
        );
        assert_eq!(
            url.into_string(),
            "http://127.0.0.1:1234/?threadId=t#token=x"
        );
    }

    #[test]
    fn unsupported_remote_error_message_is_stable() {
        assert_eq!(
            GuiLaunchError::UnsupportedRemote.to_string(),
            "GUI launch is only supported for in-process app-server sessions"
        );
    }
}
```

- [ ] **Step 2: Add in-process launch URL test imports**

In the existing `#[cfg(test)] mod tests` in `codex-rs/app-server-client/src/lib.rs`, add:

```rust
use crate::AppServerClientGuiExt;
use codex_protocol::ThreadId;
```

Do not remove existing test imports.

- [ ] **Step 3: Add in-process launch URL test**

Add this test near the existing in-process client tests in `codex-rs/app-server-client/src/lib.rs`:

```rust
#[tokio::test]
async fn in_process_launch_gui_for_thread_returns_loopback_url() {
    let client = start_test_client(SessionSource::Cli).await;
    let thread_id = ThreadId::from_string("00000000-0000-0000-0000-000000000505")
        .expect("valid thread id");

    let url = client
        .launch_gui_for_thread(thread_id)
        .await
        .expect("GUI launch URL should be created");

    assert!(url.as_str().starts_with("http://127.0.0.1:"));
    assert!(
        url.as_str()
            .contains("threadId=00000000-0000-0000-0000-000000000505")
    );
    assert!(url.as_str().contains("#token="));

    client.shutdown().await.expect("shutdown should complete");
}
```

- [ ] **Step 4: Add reuse test for same manager**

Add this test in `codex-rs/app-server-client/src/lib.rs`:

```rust
#[tokio::test]
async fn in_process_launch_gui_reuses_same_host_for_multiple_threads() {
    let client = start_test_client(SessionSource::Cli).await;
    let thread_a = ThreadId::from_string("00000000-0000-0000-0000-0000000005a1")
        .expect("valid thread id");
    let thread_b = ThreadId::from_string("00000000-0000-0000-0000-0000000005b2")
        .expect("valid thread id");

    let url_a = client
        .launch_gui_for_thread(thread_a)
        .await
        .expect("first GUI launch URL should be created");
    let url_b = client
        .launch_gui_for_thread(thread_b)
        .await
        .expect("second GUI launch URL should be created");
    let origin_a = url_a
        .as_str()
        .split("/?")
        .next()
        .expect("URL should contain query");
    let origin_b = url_b
        .as_str()
        .split("/?")
        .next()
        .expect("URL should contain query");

    assert_eq!(origin_a, origin_b);
    assert!(
        url_a
            .as_str()
            .contains("threadId=00000000-0000-0000-0000-0000000005a1")
    );
    assert!(
        url_b
            .as_str()
            .contains("threadId=00000000-0000-0000-0000-0000000005b2")
    );

    client.shutdown().await.expect("shutdown should complete");
}
```

- [ ] **Step 5: Add shutdown ordering regression test**

Add this test in `codex-rs/app-server-client/src/lib.rs`, near `shutdown_completes_promptly_without_retained_managers`:

```rust
#[tokio::test]
async fn shutdown_after_gui_launch_completes_promptly() {
    let client = start_test_client(SessionSource::Cli).await;
    let thread_id = ThreadId::from_string("00000000-0000-0000-0000-000000000505")
        .expect("valid thread id");
    let _url = client
        .launch_gui_for_thread(thread_id)
        .await
        .expect("GUI launch URL should be created before shutdown");

    timeout(Duration::from_secs(1), client.shutdown())
        .await
        .expect("shutdown should not wait for the 5s fallback timeout")
        .expect("shutdown should complete");
}
```

- [ ] **Step 6: Add remote unsupported test**

Add this test in `codex-rs/app-server-client/src/lib.rs`, near existing remote client tests:

```rust
#[tokio::test]
async fn remote_launch_gui_for_thread_is_unsupported() {
    let websocket_url = start_test_remote_server(|mut websocket| async move {
        expect_remote_initialize(&mut websocket).await;
        websocket.close(None).await.expect("close should succeed");
    })
    .await;
    let client = RemoteAppServerClient::connect(test_remote_connect_args(websocket_url))
        .await
        .expect("remote client should connect");
    let thread_id = ThreadId::from_string("00000000-0000-0000-0000-000000000505")
        .expect("valid thread id");

    let error = client
        .launch_gui_for_thread(thread_id)
        .await
        .expect_err("remote GUI launch should be unsupported");

    assert_eq!(
        error.to_string(),
        "GUI launch is only supported for in-process app-server sessions"
    );

    client.shutdown().await.expect("shutdown should complete");
}
```

- [ ] **Step 7: Run focused facade tests**

Run from `codex-rs`:

```bash
just test -p codex-app-server-client gui_launch
just test -p codex-app-server-client launch_gui
```

Expected: all selected app-server-client facade tests pass.

Do not run workspace-wide tests for this plan unless the user explicitly asks.

## Task 4: Verify Scope, Formatting, And Lints

**Files:**
- Verify: `codex-rs/app-server-client/**`
- Verify: `codex-rs/app-server-client/Cargo.toml`
- Verify: `codex-rs/Cargo.lock`
- Verify: `MODULE.bazel.lock`

- [ ] **Step 1: Confirm forbidden paths are untouched**

Run from repo root:

```bash
git diff --name-only | rg -v '^(codex-rs/app-server-client/Cargo.toml|codex-rs/app-server-client/src/gui.rs|codex-rs/app-server-client/src/lib.rs|codex-rs/Cargo.lock|MODULE.bazel.lock)$'
```

Expected: no output.

If `codex-rs/app-server/**`, `codex-rs/tui/**`, `codex-gui/**`, `codex-rs/core/**`, `codex-rs/app-server-protocol/**`, or `codex-rs/gui-host/**` appears, stop and remove the out-of-scope change.

- [ ] **Step 2: Confirm no TUI `/gui` work slipped in**

Run from repo root:

```bash
rg -n 'SlashCommand::Gui|"/gui"|app/gui.rs|GuiLaunchUrl' codex-rs/tui codex-gui
```

Expected: no new `/gui` command implementation. Existing unrelated matches, if any, must not be part of this diff.

- [ ] **Step 3: Run formatter**

Run from `codex-rs`:

```bash
just fmt
```

Expected: formatting completes. Do not rerun tests solely because `just fmt` ran.

- [ ] **Step 4: Run scoped fix**

Run from `codex-rs`:

```bash
just fix -p codex-app-server-client
```

Expected: clippy fix completes. If the command fails with an environment lock/listener error such as `failed to bind TCP listener to manage locking` or `Operation not permitted`, record the exact output and run this fallback instead:

```bash
cargo clippy -p codex-app-server-client --all-targets -- -D warnings
```

Do not rerun tests after `fix` or `fmt`.

- [ ] **Step 5: Refresh dependency locks**

Because this plan changes `codex-rs/app-server-client/Cargo.toml`, run from repo root:

```bash
just bazel-lock-update
just bazel-lock-check
```

Expected: `MODULE.bazel.lock` is up to date and the check passes.

- [ ] **Step 6: Run diff hygiene**

Run from repo root:

```bash
git diff --check
```

Expected: no whitespace or conflict-marker problems.

## Task 5: Final Commit

**Files:**
- Stage: `codex-rs/app-server-client/Cargo.toml`
- Stage: `codex-rs/app-server-client/src/gui.rs`
- Stage: `codex-rs/app-server-client/src/lib.rs`
- Stage: `codex-rs/Cargo.lock`
- Stage: `MODULE.bazel.lock`

- [ ] **Step 1: Review changed files**

Run from repo root:

```bash
git status --short
git diff --stat
```

Expected changed files are limited to:

```text
codex-rs/app-server-client/Cargo.toml
codex-rs/app-server-client/src/gui.rs
codex-rs/app-server-client/src/lib.rs
codex-rs/Cargo.lock
MODULE.bazel.lock
```

- [ ] **Step 2: Stage only `05` implementation files**

Run from repo root:

```bash
git add \
  codex-rs/app-server-client/Cargo.toml \
  codex-rs/app-server-client/src/gui.rs \
  codex-rs/app-server-client/src/lib.rs \
  codex-rs/Cargo.lock \
  MODULE.bazel.lock
```

- [ ] **Step 3: Confirm staged scope**

Run from repo root:

```bash
git diff --cached --name-only
```

Expected output is limited to the files staged in Step 2.

- [ ] **Step 4: Commit**

Run from repo root:

```bash
git commit -m "feat(app-server-client): add GUI launch facade"
```

## Acceptance Criteria

- `codex-app-server-client` exposes `GuiLaunchUrl`, `GuiLaunchError`, and `AppServerClientGuiExt`.
- In-process clients can call `launch_gui_for_thread(ThreadId)` and receive a loopback `http://127.0.0.1:<port>/?threadId=...#token=...` URL.
- Repeated in-process launch calls in the same app-server-client worker reuse one `GuiHostManager`.
- Remote app-server clients return `GuiLaunchError::UnsupportedRemote`.
- GUI host config errors are reported by the launch call, not by `InProcessAppServerClient::start`.
- `InProcessAppServerClient` struct fields remain `command_tx`, `event_rx`, and `worker_handle`; GUI manager state stays worker-local.
- Worker shutdown calls `GuiHostManager::shutdown().await` before `handle.shutdown().await`.
- No TUI `/gui`, frontend, app-server, protocol, core, or gui-host source changes are included.
- Focused `just test -p codex-app-server-client ...`, `just fmt`, scoped `just fix -p codex-app-server-client` or clippy fallback, `just bazel-lock-update`, `just bazel-lock-check`, and `git diff --check` have passed or their environment failure is recorded.

## Self-Review Checklist

- [ ] This plan executes `05` and does not start `06`.
- [ ] The plan uses `04`'s `GuiHostManager` without changing app-server.
- [ ] The remote path is unsupported rather than attempting remote GUI launch.
- [ ] The in-process worker owns shutdown ordering without adding GUI fields to `InProcessAppServerClient`.
- [ ] Tests cover URL shape, reuse, shutdown after launch, and remote unsupported behavior.
- [ ] No step uses `cargo test` directly.
- [ ] Dependency-change verification includes Bazel lock update/check.
