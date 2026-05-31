# Codex GUI App-Server Client Facade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `codex-app-server-client` 中新增 GUI launch facade，让 in-process client 能通过 `GuiHostManager` 返回本机 GUI URL，并让 remote client 明确返回 unsupported。

**Architecture:** `app-server-client/src/gui.rs` 拥有 GUI facade 类型和 trait；`app-server-client/src/lib.rs` 只做薄 wiring：导出 facade、在 `InProcessAppServerClient` 生命周期内持有 `Arc<GuiHostManager>`、显式 shutdown 时先关闭 GUI host 再关闭 worker。`RemoteAppServerClient` 不启动本地 GUI host，只实现同一 trait 并返回 `GuiLaunchError::Unsupported`。

**Tech Stack:** Rust 2024, tokio, codex-app-server-client, codex-app-server, codex-app-server-protocol.

---

## Source Of Truth

- Roadmap: `docs/superpowers/plans/2026-05-30-gui-host/00-roadmap.md`
- App-server bridge plan: `docs/superpowers/plans/2026-05-30-gui-host/03-app-server-bridge.md`
- 主设计：`docs/superpowers/specs/2026-05-11-codex-gui-host-redesign.md`
- 当前 `dev` 适配设计：`docs/superpowers/specs/2026-05-30-codex-gui-host-dev-adaptation-design.md`
- low-intrusion 设计：`docs/superpowers/specs/2026-05-13-gui-host-low-intrusion-refactor-design.md`
- 旧分支参考实现：
  - `port/lazy-proj-130:codex-rs/app-server-client/src/gui.rs`
  - `port/lazy-proj-130:codex-rs/app-server-client/src/lib.rs`
  - `port/lazy-proj-130:docs/superpowers/plans/2026-05-11-gui-host/02-app-server-bridge.md`

旧分支 `02-app-server-bridge.md` 把 app-server bridge、client facade、TUI 入口混在一起。当前计划只覆盖 `codex-app-server-client` facade；TUI `/gui` 留给 `05-tui-gui-command.md`。

## Scope

### In Scope

- Create: `codex-rs/app-server-client/src/gui.rs`
- Modify: `codex-rs/app-server-client/src/lib.rs`

### Out Of Scope

- 不改 `codex-rs/app-server/src/gui_host.rs`
- 不改 `codex-rs/app-server/src/gui_transport.rs`
- 不改 `codex-rs/app-server/src/in_process.rs`
- 不改 `codex-rs/tui/**`
- 不改 `codex-gui/**`
- 不实现 `/gui` slash command
- 不实现 external app-server process GUI backend
- 不新增 app-server v2 RPC 方法
- 不修改 `CODEX_SANDBOX_NETWORK_DISABLED_ENV_VAR` 或 `CODEX_SANDBOX_ENV_VAR` 相关代码

## Current Baseline

- `codex-rs/app-server/src/gui_host.rs` 已提供：
  - `pub struct GuiHostManager`
  - `GuiHostManager::new(sender: InProcessClientSender) -> Self`
  - `GuiHostManager::launch_url_for_thread(self: &Arc<Self>, primary_thread_id: &str) -> anyhow::Result<String>`
  - `GuiHostManager::shutdown(self: Arc<Self>)`
  - `GuiHostManager::cancel_nonblocking(&self)`
- `codex-rs/app-server-client/src/gui.rs` 当前不存在。
- `codex-rs/app-server-client/src/lib.rs` 当前只有 `mod remote;`，没有 GUI module/export。
- `InProcessAppServerClient` 当前直接持有：

```rust
pub struct InProcessAppServerClient {
    command_tx: mpsc::Sender<ClientCommand>,
    event_rx: mpsc::Receiver<InProcessServerEvent>,
    worker_handle: tokio::task::JoinHandle<()>,
}
```

- `InProcessAppServerClient::shutdown(self)` 当前通过 by-move destructure 取出字段。加入 `Drop` 后不能继续 by-move destructure，因此本计划需要把 owned fields 改成 `Option<T>`，并把共同 shutdown 逻辑下沉到 `shutdown_inner(&mut self)`。
- 当前 `dev` 的 `lib.rs` 比旧分支更新，必须保留这些当前导出和 imports：
  - `pub use codex_app_server::app_server_control_socket_path;`
  - `pub use crate::remote::RemoteAppServerEndpoint;`
  - `pub use codex_exec_server::EnvironmentManager;`
  - `pub use codex_exec_server::ExecServerRuntimePaths;`
- 不要照抄旧分支导致移除当前分支已有 remote endpoint / socket path 行为。

## Hard Constraints

- `codex-app-server-client` owns launch URL facade；TUI 后续只调用 facade。
- `app-server-client/src/lib.rs` 只保留 module export、re-export、manager construction、shutdown/drop wiring，不承载 URL wrapper 或 error enum 定义。
- `GuiLaunchUrl` 只包装 raw URL 字符串，不解析、不打开浏览器。
- `RemoteAppServerClient::gui_launch_url` 必须返回 `GuiLaunchError::Unsupported`。
- `InProcessAppServerClient::gui_launch_url` 必须调用 `GuiHostManager::launch_url_for_thread`，并把 returned `String` 包装成 `GuiLaunchUrl`。
- 显式 `InProcessAppServerClient::shutdown(self)` 必须先 await `GuiHostManager::shutdown()`，再关闭 worker command channel / event receiver / worker task。
- `Drop for InProcessAppServerClient` 只能做同步 best-effort cancel：调用 `GuiHostManager::cancel_nonblocking()`，不能 block、不能 await、不能启动浏览器。
- 不新增 `#[async_trait]` 或 `#[allow(async_fn_in_trait)]`；`AppServerClientGuiExt` 使用 RPITIT 并显式 `Send` future bound。
- 不新增 public `sender()` accessor 暴露 `InProcessClientSender`；client facade 内部持有 clone 即可。
- 不改 remote transport handshake、request routing、server version、Unix socket endpoint 逻辑。
- 不改 app-server protocol schema。

## File Boundary

### `codex-rs/app-server-client/src/gui.rs`

Owns:

- `pub struct GuiLaunchUrl`
- `pub enum GuiLaunchError`
- `impl Display/Error for GuiLaunchError`
- `pub trait AppServerClientGuiExt`
- `impl AppServerClientGuiExt for crate::remote::RemoteAppServerClient`
- `impl AppServerClientGuiExt for crate::InProcessAppServerClient`
- facade-only unit tests

Does not own:

- manager lifecycle storage
- worker shutdown sequence
- TUI display text
- browser opening
- app-server JSON-RPC transport

### `codex-rs/app-server-client/src/lib.rs`

Owns only:

- `pub mod gui;`
- `pub use crate::gui::{AppServerClientGuiExt, GuiLaunchError, GuiLaunchUrl};`
- `InProcessAppServerClient` field reshape to `Option<T>`
- creation of `Arc<codex_app_server::gui_host::GuiHostManager>`
- explicit shutdown ordering
- Drop fallback cancellation
- app-server-client tests proving in-process URL and shutdown behavior

## Task 0: Baseline Verification

**Files:**
- Verify: `codex-rs/app-server-client/src/lib.rs`
- Verify: `codex-rs/app-server-client/src/gui.rs`
- Verify: `codex-rs/app-server/src/gui_host.rs`

- [ ] **Step 1: Confirm worktree is clean**

Run from repo root:

```bash
git status --short
```

Expected: no output.

- [ ] **Step 2: Confirm prerequisite manager exists**

Run from repo root:

```bash
rg -n "pub struct GuiHostManager|launch_url_for_thread|cancel_nonblocking|pub async fn shutdown" codex-rs/app-server/src/gui_host.rs
```

Expected: all four symbols are present.

- [ ] **Step 3: Confirm facade file is not already present**

Run from repo root:

```bash
test ! -f codex-rs/app-server-client/src/gui.rs
```

Expected: command exits 0. If the file exists, stop and inspect before overwriting user or previous-agent work.

## Task 1: Create GUI facade module

**Files:**
- Create: `codex-rs/app-server-client/src/gui.rs`

- [ ] **Step 1: Create `gui.rs` with facade types and tests**

Create `codex-rs/app-server-client/src/gui.rs`:

```rust
//! GUI launch URL extension for the app-server client facade.
//!
//! The TUI requests a launch URL through this client extension. The app-server
//! runtime owns the GUI host lifecycle; client surfaces do not hold a `GuiHost`
//! or raw backend handle.

/// Launch URL returned by a client that can expose the local GUI.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GuiLaunchUrl {
    pub url: String,
}

/// Error returned while requesting a GUI launch URL.
#[derive(Debug)]
pub enum GuiLaunchError {
    Unsupported,
    Transport(std::io::Error),
}

impl std::fmt::Display for GuiLaunchError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Unsupported => write!(f, "GUI is not available for this session"),
            Self::Transport(err) => write!(f, "{err}"),
        }
    }
}

impl std::error::Error for GuiLaunchError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Unsupported => None,
            Self::Transport(err) => Some(err),
        }
    }
}

/// Extension trait for app-server clients that may provide a GUI launch URL.
///
/// Implementations should return [`GuiLaunchError::Unsupported`] when the
/// current transport or session cannot host a GUI, and
/// [`GuiLaunchError::Transport`] for I/O failures while obtaining the URL.
pub trait AppServerClientGuiExt {
    fn gui_launch_url(
        &self,
        primary_thread_id: &str,
    ) -> impl std::future::Future<Output = Result<GuiLaunchUrl, GuiLaunchError>> + Send;
}

impl AppServerClientGuiExt for crate::remote::RemoteAppServerClient {
    fn gui_launch_url(
        &self,
        _primary_thread_id: &str,
    ) -> impl std::future::Future<Output = Result<GuiLaunchUrl, GuiLaunchError>> + Send {
        std::future::ready(Err(GuiLaunchError::Unsupported))
    }
}

impl AppServerClientGuiExt for crate::InProcessAppServerClient {
    fn gui_launch_url(
        &self,
        primary_thread_id: &str,
    ) -> impl std::future::Future<Output = Result<GuiLaunchUrl, GuiLaunchError>> + Send {
        let manager = self.gui_host_manager();
        let thread_id = primary_thread_id.to_string();
        async move {
            let Some(manager) = manager else {
                return Err(GuiLaunchError::Transport(std::io::Error::new(
                    std::io::ErrorKind::BrokenPipe,
                    "GUI host manager is unavailable after shutdown",
                )));
            };
            manager
                .launch_url_for_thread(&thread_id)
                .await
                .map(|url| GuiLaunchUrl { url })
                .map_err(|err| GuiLaunchError::Transport(std::io::Error::other(err.to_string())))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use pretty_assertions::assert_eq;

    #[test]
    fn gui_launch_error_variants_are_distinct() {
        let unsupported = GuiLaunchError::Unsupported;
        let transport = GuiLaunchError::Transport(std::io::Error::new(
            std::io::ErrorKind::BrokenPipe,
            "closed",
        ));

        assert_eq!(
            unsupported.to_string(),
            "GUI is not available for this session"
        );
        assert!(transport.to_string().contains("closed"));
    }

    #[test]
    fn remote_client_implements_gui_extension() {
        fn assert_impl<T: AppServerClientGuiExt>() {}
        assert_impl::<crate::remote::RemoteAppServerClient>();
    }
}
```

- [ ] **Step 2: Verify the expected compile failure**

Run from `codex-rs`:

```bash
just test -p codex-app-server-client gui_launch_error_variants_are_distinct
```

Expected: FAIL because `lib.rs` has not yet declared `pub mod gui`, and `InProcessAppServerClient::gui_host_manager` does not exist.

## Task 2: Wire module exports and manager storage

**Files:**
- Modify: `codex-rs/app-server-client/src/lib.rs`

- [ ] **Step 1: Add module and re-exports**

At the top of `codex-rs/app-server-client/src/lib.rs`, keep current remote module and add GUI module:

```rust
pub mod gui;
mod remote;
```

Near the current remote re-exports, add:

```rust
pub use crate::gui::AppServerClientGuiExt;
pub use crate::gui::GuiLaunchError;
pub use crate::gui::GuiLaunchUrl;
```

Do not remove these current `dev` exports:

```rust
pub use codex_app_server::app_server_control_socket_path;
pub use crate::remote::RemoteAppServerEndpoint;
```

- [ ] **Step 2: Reshape `InProcessAppServerClient` fields**

Replace the current struct with:

```rust
pub struct InProcessAppServerClient {
    command_tx: Option<mpsc::Sender<ClientCommand>>,
    event_rx: Option<mpsc::Receiver<InProcessServerEvent>>,
    worker_handle: Option<tokio::task::JoinHandle<()>>,
    gui_host_manager: Option<Arc<codex_app_server::gui_host::GuiHostManager>>,
}
```

Reason: `Drop` must be able to `take()` the GUI manager synchronously; `shutdown(self)` must still keep its owned receiver public shape.

- [ ] **Step 3: Clone sender for manager before spawning worker**

In `InProcessAppServerClient::start`, after:

```rust
let request_sender = handle.sender();
```

add:

```rust
let request_sender_for_manager = request_sender.clone();
```

After the worker task is created, construct the manager:

```rust
let gui_host_manager = Arc::new(codex_app_server::gui_host::GuiHostManager::new(
    request_sender_for_manager,
));
```

Return:

```rust
Ok(Self {
    command_tx: Some(command_tx),
    event_rx: Some(event_rx),
    worker_handle: Some(worker_handle),
    gui_host_manager: Some(gui_host_manager),
})
```

- [ ] **Step 4: Add private manager accessor for `gui.rs`**

Add this inherent method inside `impl InProcessAppServerClient`:

```rust
pub(crate) fn gui_host_manager(
    &self,
) -> Option<Arc<codex_app_server::gui_host::GuiHostManager>> {
    self.gui_host_manager.as_ref().cloned()
}
```

Do not add a public `sender()` accessor.

- [ ] **Step 5: Adapt existing methods to `Option<T>`**

Update call sites that use `self.command_tx`:

```rust
self.command_tx
    .as_ref()
    .ok_or_else(|| {
        IoError::new(
            ErrorKind::BrokenPipe,
            "in-process app-server client is shut down",
        )
    })?
    .send(...)
```

Update `next_event`:

```rust
pub async fn next_event(&mut self) -> Option<InProcessServerEvent> {
    let event_rx = self.event_rx.as_mut()?;
    event_rx.recv().await
}
```

Preserve existing method names, error kinds, and public signatures.

## Task 3: Implement shutdown ordering and Drop fallback

**Files:**
- Modify: `codex-rs/app-server-client/src/lib.rs`

- [ ] **Step 1: Replace `shutdown(self)` body with shared inner shutdown**

Keep the public owned receiver signature:

```rust
pub async fn shutdown(mut self) -> IoResult<()> {
    self.shutdown_inner().await
}
```

Add:

```rust
async fn shutdown_inner(&mut self) -> IoResult<()> {
    if let Some(manager) = self.gui_host_manager.take() {
        manager.shutdown().await;
    }

    let Some(command_tx) = self.command_tx.take() else {
        return Ok(());
    };
    let Some(event_rx) = self.event_rx.take() else {
        return Ok(());
    };
    let Some(mut worker_handle) = self.worker_handle.take() else {
        return Ok(());
    };

    drop(event_rx);
    let (response_tx, response_rx) = oneshot::channel();
    if command_tx
        .send(ClientCommand::Shutdown { response_tx })
        .await
        .is_ok()
        && let Ok(command_result) = timeout(SHUTDOWN_TIMEOUT, response_rx).await
    {
        command_result.map_err(|_| {
            IoError::new(
                ErrorKind::BrokenPipe,
                "in-process app-server shutdown channel is closed",
            )
        })??;
    }

    if let Err(_elapsed) = timeout(SHUTDOWN_TIMEOUT, &mut worker_handle).await {
        worker_handle.abort();
        let _ = worker_handle.await;
    }
    Ok(())
}
```

The manager shutdown must stay before dropping `event_rx` and before sending `ClientCommand::Shutdown`.

- [ ] **Step 2: Add Drop fallback**

After `impl InProcessAppServerClient`, add:

```rust
impl Drop for InProcessAppServerClient {
    fn drop(&mut self) {
        if let Some(manager) = self.gui_host_manager.take() {
            manager.cancel_nonblocking();
        }
    }
}
```

Do not block in Drop and do not await worker shutdown in Drop.

## Task 4: Add in-process GUI launch test

**Files:**
- Modify: `codex-rs/app-server-client/src/lib.rs`

- [ ] **Step 1: Add test for real in-process URL**

In the existing `#[cfg(test)] mod tests`, add:

```rust
#[tokio::test]
async fn gui_launch_url_returns_real_url_for_in_process() {
    let client = start_test_client(SessionSource::Cli).await;

    let launch = client
        .gui_launch_url("thread-test")
        .await
        .expect("gui launch url");
    let parsed = url::Url::parse(&launch.url).expect("launch URL should parse");

    assert_eq!(parsed.scheme(), "http");
    assert_eq!(parsed.host_str(), Some("127.0.0.1"));
    assert_eq!(
        parsed.query_pairs().find(|(key, _)| key == "threadId"),
        Some(("threadId".into(), "thread-test".into()))
    );
    let fragment = parsed.fragment().expect("launch URL should include token");
    let token = fragment
        .strip_prefix("token=")
        .expect("launch URL fragment should be token=<value>");
    assert_eq!(token.len(), 43);

    client.shutdown().await.expect("shutdown");
}
```

Do not assert a hard-coded port or token value.

- [ ] **Step 2: Run targeted tests**

Run from `codex-rs`:

```bash
just test -p codex-app-server-client gui_launch_error_variants_are_distinct
just test -p codex-app-server-client remote_client_implements_gui_extension
just test -p codex-app-server-client gui_launch_url_returns_real_url_for_in_process
```

Expected: all three tests pass.

## Task 5: Final verification and implementation commit

**Files:**
- Verify: `codex-rs/app-server-client/src/gui.rs`
- Verify: `codex-rs/app-server-client/src/lib.rs`

- [ ] **Step 1: Run format**

Run from `codex-rs`:

```bash
just fmt
```

Expected: command succeeds.

- [ ] **Step 2: Run scoped tests**

Run from `codex-rs`:

```bash
just test -p codex-app-server-client gui
just test -p codex-app-server-client gui_launch_url_returns_real_url_for_in_process
```

Expected: targeted tests pass. If `gui` matches unrelated tests, inspect the selected tests before broadening.

- [ ] **Step 3: Run scoped lint fix**

Run from `codex-rs`:

```bash
just fix -p codex-app-server-client
```

Expected: command succeeds. Do not re-run tests after `fix` unless it makes a functional edit that needs investigation.

- [ ] **Step 4: Check boundaries**

Run from repo root:

```bash
git diff --name-only HEAD | sort
rg -n "TransportEvent|ConnectionOrigin::GuiHost|start_remote_control|run_main_with_transport_options" codex-rs/app-server-client/src
rg -n "pub fn sender\\(|pub async fn sender\\(" codex-rs/app-server-client/src/lib.rs
```

Expected:

- `git diff --name-only HEAD | sort` lists only:
  - `codex-rs/app-server-client/src/gui.rs`
  - `codex-rs/app-server-client/src/lib.rs`
- first `rg` has no output
- second `rg` has no output

- [ ] **Step 5: Run whitespace check**

Run from repo root:

```bash
git diff --check
```

Expected: no output.

- [ ] **Step 6: Commit implementation**

```bash
git add codex-rs/app-server-client/src/gui.rs codex-rs/app-server-client/src/lib.rs
git commit -m "feat(gui-host): add app-server client facade"
```

## Acceptance Gates

- `codex-rs/app-server-client/src/gui.rs` defines `GuiLaunchUrl`, `GuiLaunchError`, and `AppServerClientGuiExt`.
- `RemoteAppServerClient` implements `AppServerClientGuiExt` and returns `GuiLaunchError::Unsupported`.
- `InProcessAppServerClient` implements `AppServerClientGuiExt` through `GuiHostManager::launch_url_for_thread`.
- In-process launch returns `http://127.0.0.1:<port>/?threadId=<thread-id>#token=<token>` with a URL-safe 43-character token value.
- `InProcessAppServerClient::shutdown(self)` awaits `GuiHostManager::shutdown()` before worker shutdown.
- `Drop for InProcessAppServerClient` calls `cancel_nonblocking()` only; it does not block.
- `app-server-client/src/lib.rs` keeps current `dev` remote exports and socket path exports intact.
- No TUI, frontend, app-server protocol, app-server transport, or `codex-core` code is changed by this plan.

## Self-Review Checklist

- [ ] This plan starts from current `dev` state, not old branch assumptions.
- [ ] The plan preserves `RemoteAppServerEndpoint` and `app_server_control_socket_path` exports.
- [ ] The plan does not modify TUI `/gui`; that belongs to `05-tui-gui-command.md`.
- [ ] The plan does not add browser opening behavior.
- [ ] The plan keeps URL/error/trait definitions out of `lib.rs`.
- [ ] The plan avoids public `sender()` accessors.
- [ ] Verification commands use `just`, not direct `cargo test`.
- [ ] No Bazel or remote verification is required locally for this plan.
