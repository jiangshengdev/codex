# GUI Launch Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 app-server 内实现共享 `GuiLaunchService`，让 agent tool 和 TUI `/gui` 后续都使用同一个 GUI host lifecycle。

**Architecture:** app-server owns GUI host lifecycle。`GuiLaunchService` 包装 `GuiHostManager`、GUI host config、local connection bridge opener 和错误映射；不依赖 TUI，不依赖 app-server-client，不自动打开浏览器。

**Tech Stack:** Rust 2024, codex-gui-host, tokio Mutex, codex-protocol ThreadId, app-server local connection bridge.

---

## Files

- Create: `codex-rs/app-server/src/gui_launch_service.rs`
- Modify: `codex-rs/app-server/src/gui_host.rs`
- Modify: `codex-rs/app-server/src/lib.rs`
- Modify: `codex-rs/app-server/src/message_processor.rs`
- Modify: `codex-rs/app-server/src/extensions.rs` only to pass service later if needed by Plan 04
- Test: `codex-rs/app-server/src/gui_launch_service.rs`

## Task 1: Define Service API And Errors

- [ ] **Step 1: Add failing service tests**

Create tests in `gui_launch_service.rs`:

```rust
#[cfg(test)]
mod tests {
    use codex_gui_host::DevAssetProxyConfig;
    use codex_gui_host::GuiHostMode;
    use codex_protocol::ThreadId;
    use pretty_assertions::assert_eq;

    use super::*;

    #[tokio::test]
    async fn launch_service_returns_urls_for_thread() {
        let service = test_support::new_test_gui_launch_service(GuiHostMode::Dev(
            DevAssetProxyConfig {
                vite_origin: "http://127.0.0.1:5173".to_string(),
            },
        ))
        .await;
        let thread_id = ThreadId::from_string("00000000-0000-0000-0000-0000000000a1")
            .expect("valid thread id");

        let urls = service
            .launch_urls_for_thread(thread_id)
            .await
            .expect("launch should succeed");

        assert_eq!(urls.entries[0].kind, codex_gui_host::GuiLaunchUrlKind::Local);
        assert!(urls.entries[0].url.contains("threadId=00000000-0000-0000-0000-0000000000a1"));
        service.shutdown().await;
    }
}
```

Expected initial result: compile fails because `GuiLaunchService` and test support do not exist.

- [ ] **Step 2: Implement error type**

Add:

```rust
#[derive(Debug)]
pub enum GuiLaunchServiceError {
    Config { message: String },
    Launch { message: String },
    Unavailable { message: String },
}

impl std::fmt::Display for GuiLaunchServiceError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Config { message } => write!(f, "GUI host config error: {message}"),
            Self::Launch { message } => write!(f, "GUI host launch error: {message}"),
            Self::Unavailable { message } => write!(f, "GUI launch unavailable: {message}"),
        }
    }
}

impl std::error::Error for GuiLaunchServiceError {}
```

- [ ] **Step 3: Implement service trait**

Use native RPITIT with explicit `Send` future bound:

```rust
pub trait GuiLaunchService: Send + Sync {
    fn launch_urls_for_thread(
        &self,
        thread_id: codex_protocol::ThreadId,
    ) -> impl std::future::Future<
        Output = Result<codex_gui_host::GuiLaunchUrls, GuiLaunchServiceError>,
    > + Send;
}
```

If object safety is needed for `Arc<dyn ...>`, use a concrete `AppServerGuiLaunchService` handle in app-server and a separate extension-facing trait in Plan 04. Do not add `#[async_trait]`.

## Task 2: Move Host Lifecycle Behind Service

- [ ] **Step 1: Adjust `GuiHostManager` constructor**

In `gui_host.rs`, change manager construction so it accepts the app-server-local opener, not `InProcessClientSender`:

```rust
pub struct GuiHostManager {
    opener: Arc<dyn crate::gui_connection_bridge::LocalGuiConnectionOpener>,
    config: GuiHostConfig,
    handle: Mutex<Option<GuiHostHandle>>,
}
```

`launch_urls_for_thread` should construct `GuiTransportBackend::new(Arc::clone(&self.opener))`.

- [ ] **Step 2: Add `AppServerGuiLaunchService`**

In `gui_launch_service.rs`:

```rust
pub struct AppServerGuiLaunchService {
    manager: GuiHostManager,
}

impl AppServerGuiLaunchService {
    pub fn new(manager: GuiHostManager) -> Self {
        Self { manager }
    }

    pub async fn shutdown(&self) {
        self.manager.shutdown().await;
    }
}
```

Implement `GuiLaunchService` for it and map `io::Error` to `GuiLaunchServiceError::Launch`.

- [ ] **Step 3: Expose app-server service types**

In `lib.rs`, expose only the stable types needed by app-server-client and extension install:

```rust
pub use crate::gui_launch_service::AppServerGuiLaunchService;
pub use crate::gui_launch_service::GuiLaunchServiceError;
```

Keep bridge internals crate-private.

## Task 3: Install Service In MessageProcessor Runtime

- [ ] **Step 1: Add service field to `MessageProcessor`**

In `message_processor.rs`, add:

```rust
gui_launch_service: Arc<AppServerGuiLaunchService>,
```

Construct it after local connection bridge/opener is available. The exact opener source must come from Plan 02, not `InProcessClientSender`.

- [ ] **Step 2: Shutdown host with app-server runtime**

In `MessageProcessor::clear_runtime_references`, call:

```rust
self.gui_launch_service.shutdown();
```

If `clear_runtime_references` is sync today, expose a cancellation-style shutdown on the manager or schedule async shutdown from the owning runtime. Do not block a sync drop path on async code.

- [ ] **Step 3: Run focused app-server tests**

Run:

```bash
cd codex-rs
just test -p codex-app-server gui_launch_service
```

Expected: service tests pass.

## Task 4: Commit

- [ ] **Step 1: Format**

Run:

```bash
cd codex-rs
just fmt
```

- [ ] **Step 2: Commit service changes**

Run:

```bash
git status --short
git add codex-rs/app-server/src/gui_launch_service.rs \
  codex-rs/app-server/src/gui_host.rs \
  codex-rs/app-server/src/lib.rs \
  codex-rs/app-server/src/message_processor.rs \
  codex-rs/app-server/src/extensions.rs
git commit -m "feat(gui): add app-server gui launch service"
```

Expected: one focused app-server service commit.
