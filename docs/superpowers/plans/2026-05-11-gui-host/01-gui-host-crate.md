# Codex GUI Host Crate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the new `codex-gui-host` crate with token, config, assets, auth, allowlists, lifecycle, and bridge contract.

**Architecture:** This plan is copied from original Tasks 1-5. It owns the host shell and must not depend on `codex-app-server` or implement projection business logic.

**Tech Stack:** Rust 2024, axum, tokio, tokio-tungstenite, tower-http, reqwest, serde_json, base64/rand.

---

Source: split from `docs/superpowers/plans/2026-05-11-codex-gui-host-redesign.md`. The source file is deleted after this split because these files replace it.

### Task 1: Add `codex-gui-host` crate skeleton

**Files:**
- Modify: `codex-rs/Cargo.toml`
- Create: `codex-rs/gui-host/Cargo.toml`
- Create: `codex-rs/gui-host/BUILD.bazel`
- Create: `codex-rs/gui-host/src/lib.rs`
- Test: `codex-rs/gui-host/src/lib.rs`

- [x] **Step 1: Write the failing test**

Create `codex-rs/gui-host/src/lib.rs` with only the crate-level test first:

```rust
#[cfg(test)]
mod tests {
    use crate::GuiHostMode;

    #[test]
    fn crate_exports_gui_host_mode() {
        unsafe {
            std::env::set_var("CODEX_GUI_HOST_MODE", "dev");
        }
        let mode = GuiHostMode::default_for_profile().expect("mode should resolve");
        assert!(matches!(mode, GuiHostMode::Dev(_) | GuiHostMode::Prod(_)));
    }
}
```

- [x] **Step 2: Run the test to confirm FAIL**

Run from `codex-rs`:

```bash
cargo test -p codex-gui-host crate_exports_gui_host_mode
```

Expected failure:

```text
error: package ID specification `codex-gui-host` did not match any packages
```

- [x] **Step 3: Add workspace member and crate files**

Modify `codex-rs/Cargo.toml`:

```toml
[workspace]
members = [
    "aws-auth",
    "analytics",
    "agent-graph-store",
    "agent-identity",
    "backend-client",
    "builtin-mcps",
    "bwrap",
    "ansi-escape",
    "async-utils",
    "app-server",
    "app-server-transport",
    "app-server-client",
    "app-server-protocol",
    "app-server-test-client",
    "debug-client",
    "apply-patch",
    "arg0",
    "feedback",
    "features",
    "install-context",
    "codex-backend-openapi-models",
    "code-mode",
    "cloud-requirements",
    "cloud-tasks",
    "cloud-tasks-client",
    "cloud-tasks-mock-client",
    "cli",
    "collaboration-mode-templates",
    "connectors",
    "config",
    "shell-command",
    "shell-escalation",
    "skills",
    "core",
    "core-api",
    "core-plugins",
    "core-skills",
    "hooks",
    "secrets",
    "exec",
    "file-system",
    "exec-server",
    "execpolicy",
    "execpolicy-legacy",
    "external-agent-migration",
    "external-agent-sessions",
    "keyring-store",
    "file-search",
    "gui-host",
    "linux-sandbox",
    # keep the remaining existing members unchanged
]

[workspace.dependencies]
codex-gui-host = { path = "gui-host" }
```

When editing the members list, insert `"gui-host"` near `"file-search"` as shown and leave the rest of the existing list unchanged.

Create `codex-rs/gui-host/Cargo.toml`:

```toml
[package]
name = "codex-gui-host"
version.workspace = true
edition.workspace = true
license.workspace = true

[lib]
name = "codex_gui_host"
path = "src/lib.rs"
doctest = false

[lints]
workspace = true

[dependencies]
anyhow = { workspace = true }

[dev-dependencies]
pretty_assertions = { workspace = true }
```

Create `codex-rs/gui-host/BUILD.bazel`:

```python
load("//:defs.bzl", "codex_rust_crate")

codex_rust_crate(
    name = "gui-host",
    crate_name = "codex_gui_host",
)
```

Replace `codex-rs/gui-host/src/lib.rs` with:

```rust
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum GuiHostMode {
    Dev(DevAssetProxyConfig),
    Prod(ProdAssetConfig),
}

impl GuiHostMode {
    pub fn default_for_profile() -> anyhow::Result<Self> {
        if cfg!(debug_assertions) {
            Ok(Self::Dev(DevAssetProxyConfig::default()))
        } else {
            Ok(Self::Prod(ProdAssetConfig::from_env()?))
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DevAssetProxyConfig {
    pub vite_origin: String,
}

impl Default for DevAssetProxyConfig {
    fn default() -> Self {
        Self {
            vite_origin: "http://127.0.0.1:5173".to_string(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProdAssetConfig {
    pub package_root: std::path::PathBuf,
}

impl ProdAssetConfig {
    pub fn from_env() -> anyhow::Result<Self> {
        let Some(package_root) = std::env::var_os("CODEX_GUI_PACKAGE_ROOT") else {
            anyhow::bail!("CODEX_GUI_PACKAGE_ROOT is not set");
        };
        Ok(Self {
            package_root: std::path::PathBuf::from(package_root),
        })
    }
}

#[cfg(test)]
mod tests {
    use crate::GuiHostMode;

    #[test]
    fn crate_exports_gui_host_mode() {
        unsafe {
            std::env::set_var("CODEX_GUI_HOST_MODE", "dev");
        }
        let mode = GuiHostMode::default_for_profile().expect("mode should resolve");
        assert!(matches!(mode, GuiHostMode::Dev(_) | GuiHostMode::Prod(_)));
    }
}
```

- [x] **Step 4: Run the test to confirm PASS**

Run from `codex-rs`:

```bash
cargo test -p codex-gui-host crate_exports_gui_host_mode
```

Expected:

```text
test tests::crate_exports_gui_host_mode ... ok
```

- [x] **Step 5: Commit**

```bash
git add codex-rs/Cargo.toml codex-rs/gui-host
git commit -m "feat(gui-host): add crate skeleton"
```

---

### Task 2: Add config, launch token, and launch URL

**Files:**
- Modify: `codex-rs/gui-host/Cargo.toml`
- Modify: `codex-rs/gui-host/src/lib.rs`
- Create: `codex-rs/gui-host/src/config.rs`
- Create: `codex-rs/gui-host/src/token.rs`
- Create: `codex-rs/gui-host/src/url.rs`
- Test: `codex-rs/gui-host/src/token.rs`
- Test: `codex-rs/gui-host/src/url.rs`
- Test: `codex-rs/gui-host/src/config.rs`

- [ ] **Step 1: Write failing tests**

Replace `codex-rs/gui-host/src/lib.rs` with:

```rust
mod config;
mod token;
mod url;

pub use config::DevAssetProxyConfig;
pub use config::GuiHostConfig;
pub use config::GuiHostMode;
pub use config::ProdAssetConfig;
pub use token::LaunchToken;
pub use url::launch_url_for_thread;
```

Create `codex-rs/gui-host/src/token.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn generated_token_is_url_safe_and_has_entropy_length() {
        let token = LaunchToken::generate().expect("token generation should work");
        assert!(token.as_str().len() >= 22);
        assert!(
            token
                .as_str()
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_')
        );
    }
}
```

Create `codex-rs/gui-host/src/url.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::LaunchToken;
    use std::net::SocketAddr;

    #[test]
    fn launch_url_uses_thread_query_and_fragment_token() {
        let addr: SocketAddr = "127.0.0.1:4321".parse().unwrap();
        let token = LaunchToken::from_test_value("secret-token");
        let url = launch_url_for_thread(addr, "thread abc/#", &token);
        assert_eq!(
            url,
            "http://127.0.0.1:4321/?threadId=thread%20abc%2F%23#token=secret-token"
        );
        assert!(!url.contains("?token="));
    }
}
```

Create `codex-rs/gui-host/src/config.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dev_config_uses_default_vite_origin() {
        unsafe {
            std::env::remove_var("CODEX_GUI_VITE_URL");
        }
        assert_eq!(
            DevAssetProxyConfig::default().vite_origin,
            "http://127.0.0.1:5173"
        );
    }

    #[test]
    fn explicit_config_stores_mode() {
        let config = GuiHostConfig {
            mode: GuiHostMode::Dev(DevAssetProxyConfig::default()),
        };
        assert!(matches!(config.mode, GuiHostMode::Dev(_)));
    }
}
```

- [ ] **Step 2: Run tests to verify FAIL**

Run from `codex-rs`:

```bash
cargo test -p codex-gui-host token::tests::generated_token_is_url_safe_and_has_entropy_length url::tests::launch_url_uses_thread_query_and_fragment_token config::tests::dev_config_uses_default_vite_origin
```

Expected failures include unresolved types/functions such as `LaunchToken`, `GuiHostConfig`, and `launch_url_for_thread`.

- [ ] **Step 3: Implement token/config/url**

Modify `codex-rs/gui-host/Cargo.toml`:

```toml
[dependencies]
anyhow = { workspace = true }
base64 = { workspace = true }
rand = { workspace = true }
urlencoding = { workspace = true }
```

Replace `codex-rs/gui-host/src/config.rs` with:

```rust
use std::path::PathBuf;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GuiHostConfig {
    pub mode: GuiHostMode,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum GuiHostMode {
    Dev(DevAssetProxyConfig),
    Prod(ProdAssetConfig),
}

impl GuiHostMode {
    pub fn default_for_profile() -> anyhow::Result<Self> {
        match std::env::var("CODEX_GUI_HOST_MODE").ok().as_deref() {
            Some("dev") => Ok(Self::Dev(DevAssetProxyConfig::from_env())),
            Some("prod") => Ok(Self::Prod(ProdAssetConfig::from_env()?)),
            Some(value) => anyhow::bail!("invalid CODEX_GUI_HOST_MODE: {value}"),
            None if cfg!(debug_assertions) => Ok(Self::Dev(DevAssetProxyConfig::from_env())),
            None => Ok(Self::Prod(ProdAssetConfig::from_env()?)),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DevAssetProxyConfig {
    pub vite_origin: String,
}

impl DevAssetProxyConfig {
    pub fn from_env() -> Self {
        Self {
            vite_origin: std::env::var("CODEX_GUI_VITE_URL")
                .unwrap_or_else(|_| "http://127.0.0.1:5173".to_string()),
        }
    }
}

impl Default for DevAssetProxyConfig {
    fn default() -> Self {
        Self::from_env()
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProdAssetConfig {
    pub package_root: PathBuf,
}

impl ProdAssetConfig {
    pub fn from_env() -> anyhow::Result<Self> {
        let Some(package_root) = std::env::var_os("CODEX_GUI_PACKAGE_ROOT") else {
            anyhow::bail!("CODEX_GUI_PACKAGE_ROOT is not set");
        };
        Ok(Self {
            package_root: PathBuf::from(package_root),
        })
    }

    pub fn dist_dir(&self) -> PathBuf {
        self.package_root.join("dist")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dev_config_uses_default_vite_origin() {
        unsafe {
            std::env::remove_var("CODEX_GUI_VITE_URL");
        }
        assert_eq!(
            DevAssetProxyConfig::default().vite_origin,
            "http://127.0.0.1:5173"
        );
    }

    #[test]
    fn explicit_config_stores_mode() {
        let config = GuiHostConfig {
            mode: GuiHostMode::Dev(DevAssetProxyConfig::default()),
        };
        assert!(matches!(config.mode, GuiHostMode::Dev(_)));
    }
}
```

Replace `codex-rs/gui-host/src/token.rs` with:

```rust
use base64::Engine;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LaunchToken(String);

impl LaunchToken {
    pub fn generate() -> std::io::Result<Self> {
        use rand::TryRngCore;

        let mut bytes = [0_u8; 32];
        rand::rngs::OsRng
            .try_fill_bytes(&mut bytes)
            .map_err(std::io::Error::other)?;
        Ok(Self(
            base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(bytes),
        ))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }

    #[cfg(test)]
    pub(crate) fn from_test_value(value: &str) -> Self {
        Self(value.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn generated_token_is_url_safe_and_has_entropy_length() {
        let token = LaunchToken::generate().expect("token generation should work");
        assert!(token.as_str().len() >= 22);
        assert!(
            token
                .as_str()
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_')
        );
    }
}
```

Replace `codex-rs/gui-host/src/url.rs` with:

```rust
use std::net::SocketAddr;

use crate::LaunchToken;

pub fn launch_url_for_thread(
    local_addr: SocketAddr,
    thread_id: impl std::fmt::Display,
    launch_token: &LaunchToken,
) -> String {
    let thread_id = thread_id.to_string();
    format!(
        "http://127.0.0.1:{}/?threadId={}#token={}",
        local_addr.port(),
        urlencoding::encode(&thread_id),
        launch_token.as_str()
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::LaunchToken;
    use std::net::SocketAddr;

    #[test]
    fn launch_url_uses_thread_query_and_fragment_token() {
        let addr: SocketAddr = "127.0.0.1:4321".parse().unwrap();
        let token = LaunchToken::from_test_value("secret-token");
        let url = launch_url_for_thread(addr, "thread abc/#", &token);
        assert_eq!(
            url,
            "http://127.0.0.1:4321/?threadId=thread%20abc%2F%23#token=secret-token"
        );
        assert!(!url.contains("?token="));
    }
}
```

- [ ] **Step 4: Run tests to verify PASS**

Run from `codex-rs`:

```bash
cargo test -p codex-gui-host token::tests::generated_token_is_url_safe_and_has_entropy_length url::tests::launch_url_uses_thread_query_and_fragment_token config::tests::dev_config_uses_default_vite_origin
```

Expected:

```text
test token::tests::generated_token_is_url_safe_and_has_entropy_length ... ok
test url::tests::launch_url_uses_thread_query_and_fragment_token ... ok
test config::tests::dev_config_uses_default_vite_origin ... ok
```

- [ ] **Step 5: Commit**

```bash
git add codex-rs/gui-host codex-rs/Cargo.toml codex-rs/Cargo.lock
git commit -m "feat(gui-host): add launch config and token"
```

---

### Task 3: Add JSON-RPC allowlists and bridge API

**Files:**
- Modify: `codex-rs/gui-host/Cargo.toml`
- Modify: `codex-rs/gui-host/src/lib.rs`
- Create: `codex-rs/gui-host/src/filter.rs`
- Create: `codex-rs/gui-host/src/backend.rs`
- Test: `codex-rs/gui-host/src/filter.rs`
- Test: `codex-rs/gui-host/src/backend.rs`

- [ ] **Step 1: Write failing tests**

Create `codex-rs/gui-host/src/filter.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn client_allowlist_contains_only_projection_bootstrap_requests() {
        assert!(is_allowed_client_request_method("initialize"));
        assert!(is_allowed_client_request_method("thread/projection/attach"));
        assert!(is_allowed_client_request_method("thread/projection/detach"));
        assert!(!is_allowed_client_request_method("thread/list"));
        assert!(!is_allowed_client_request_method("gui/authenticate"));
    }

    #[test]
    fn server_notification_allowlist_contains_only_projection_event() {
        assert!(is_allowed_server_notification_method("thread/projection/event"));
        assert!(!is_allowed_server_notification_method("thread/updated"));
        assert!(!is_allowed_server_notification_method("session/configured"));
    }

    #[test]
    fn client_notifications_are_rejected() {
        assert!(!is_allowed_client_notification_method("initialized"));
    }
}
```

Create `codex-rs/gui-host/src/backend.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn authenticated_connection_channels_round_trip_text() {
        let (mut connection, inbound_tx, mut outbound_rx) =
            AuthenticatedGuiConnection::new_for_test();

        inbound_tx.try_send("{\"jsonrpc\":\"2.0\"}".to_string()).unwrap();
        assert_eq!(
            connection.inbound_rx.try_recv().unwrap(),
            "{\"jsonrpc\":\"2.0\"}"
        );

        connection
            .outbound_tx
            .try_send("{\"jsonrpc\":\"2.0\",\"id\":1,\"result\":{}}".to_string())
            .unwrap();
        assert_eq!(
            outbound_rx.try_recv().unwrap(),
            "{\"jsonrpc\":\"2.0\",\"id\":1,\"result\":{}}"
        );
    }
}
```

Modify `codex-rs/gui-host/src/lib.rs` to include:

```rust
mod backend;
mod config;
mod filter;
mod token;
mod url;

pub use backend::AuthenticatedGuiConnection;
pub use backend::GuiBackend;
pub use config::DevAssetProxyConfig;
pub use config::GuiHostConfig;
pub use config::GuiHostMode;
pub use config::ProdAssetConfig;
pub use filter::is_allowed_client_notification_method;
pub use filter::is_allowed_client_request_method;
pub use filter::is_allowed_server_notification_method;
pub use token::LaunchToken;
pub use url::launch_url_for_thread;
```

- [ ] **Step 2: Run tests to verify FAIL**

Run:

```bash
cargo test -p codex-gui-host filter::tests backend::tests
```

Expected failures include unresolved allowlist functions and `AuthenticatedGuiConnection`.

- [ ] **Step 3: Implement allowlists and bridge channel API**

Modify `codex-rs/gui-host/Cargo.toml`:

```toml
[dependencies]
anyhow = { workspace = true }
base64 = { workspace = true }
rand = { workspace = true }
tokio = { workspace = true, features = ["sync"] }
urlencoding = { workspace = true }
```

Replace `codex-rs/gui-host/src/filter.rs` with:

```rust
pub fn is_allowed_client_request_method(method: &str) -> bool {
    matches!(
        method,
        "initialize" | "thread/projection/attach" | "thread/projection/detach"
    )
}

pub fn is_allowed_client_notification_method(_method: &str) -> bool {
    false
}

pub fn is_allowed_server_notification_method(method: &str) -> bool {
    method == "thread/projection/event"
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn client_allowlist_contains_only_projection_bootstrap_requests() {
        assert!(is_allowed_client_request_method("initialize"));
        assert!(is_allowed_client_request_method("thread/projection/attach"));
        assert!(is_allowed_client_request_method("thread/projection/detach"));
        assert!(!is_allowed_client_request_method("thread/list"));
        assert!(!is_allowed_client_request_method("gui/authenticate"));
    }

    #[test]
    fn server_notification_allowlist_contains_only_projection_event() {
        assert!(is_allowed_server_notification_method("thread/projection/event"));
        assert!(!is_allowed_server_notification_method("thread/updated"));
        assert!(!is_allowed_server_notification_method("session/configured"));
    }

    #[test]
    fn client_notifications_are_rejected() {
        assert!(!is_allowed_client_notification_method("initialized"));
    }
}
```

Replace `codex-rs/gui-host/src/backend.rs` with:

```rust
use tokio::sync::mpsc;

pub const GUI_CONNECTION_CHANNEL_CAPACITY: usize = 128;

/// A browser WebSocket connection after GUI launch-token authentication.
pub struct AuthenticatedGuiConnection {
    pub inbound_rx: mpsc::Receiver<String>,
    pub outbound_tx: mpsc::Sender<String>,
}

impl AuthenticatedGuiConnection {
    pub fn new() -> (Self, mpsc::Sender<String>, mpsc::Receiver<String>) {
        let (inbound_tx, inbound_rx) = mpsc::channel(GUI_CONNECTION_CHANNEL_CAPACITY);
        let (outbound_tx, outbound_rx) = mpsc::channel(GUI_CONNECTION_CHANNEL_CAPACITY);
        (
            Self {
                inbound_rx,
                outbound_tx,
            },
            inbound_tx,
            outbound_rx,
        )
    }

    #[cfg(test)]
    pub(crate) fn new_for_test() -> (Self, mpsc::Sender<String>, mpsc::Receiver<String>) {
        Self::new()
    }
}

/// Backend that connects an authenticated GUI JSON-RPC stream to an app-server.
pub trait GuiBackend: Send + Sync + 'static {
    fn connect(
        &self,
        connection: AuthenticatedGuiConnection,
    ) -> impl std::future::Future<Output = anyhow::Result<()>> + Send;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn authenticated_connection_channels_round_trip_text() {
        let (mut connection, inbound_tx, mut outbound_rx) =
            AuthenticatedGuiConnection::new_for_test();

        inbound_tx.try_send("{\"jsonrpc\":\"2.0\"}".to_string()).unwrap();
        assert_eq!(
            connection.inbound_rx.try_recv().unwrap(),
            "{\"jsonrpc\":\"2.0\"}"
        );

        connection
            .outbound_tx
            .try_send("{\"jsonrpc\":\"2.0\",\"id\":1,\"result\":{}}".to_string())
            .unwrap();
        assert_eq!(
            outbound_rx.try_recv().unwrap(),
            "{\"jsonrpc\":\"2.0\",\"id\":1,\"result\":{}}"
        );
    }
}
```

- [ ] **Step 4: Run tests to verify PASS**

Run:

```bash
cargo test -p codex-gui-host filter::tests backend::tests
```

Expected:

```text
test filter::tests::client_allowlist_contains_only_projection_bootstrap_requests ... ok
test filter::tests::server_notification_allowlist_contains_only_projection_event ... ok
test filter::tests::client_notifications_are_rejected ... ok
test backend::tests::authenticated_connection_channels_round_trip_text ... ok
```

- [ ] **Step 5: Commit**

```bash
git add codex-rs/gui-host codex-rs/Cargo.toml codex-rs/Cargo.lock
git commit -m "feat(gui-host): add bridge API and allowlists"
```

---

### Task 4: Implement GuiHost HTTP assets and lifecycle

**Files:**
- Modify: `codex-rs/Cargo.toml`
- Modify: `codex-rs/gui-host/Cargo.toml`
- Modify: `codex-rs/gui-host/src/lib.rs`
- Create: `codex-rs/gui-host/src/host.rs`
- Create: `codex-rs/gui-host/src/assets.rs`
- Test: `codex-rs/gui-host/src/host.rs`
- Test: `codex-rs/gui-host/src/assets.rs`

- [ ] **Step 1: Write failing tests**

Create `codex-rs/gui-host/src/host.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::DevAssetProxyConfig;
    use crate::GuiHostConfig;
    use crate::GuiHostMode;

    #[tokio::test]
    async fn binds_loopback_ephemeral_port() {
        let backend = crate::test_support::NoopBackend;
        let handle = GuiHost::start(
            GuiHostConfig {
                mode: GuiHostMode::Dev(DevAssetProxyConfig::default()),
            },
            backend,
        )
        .await
        .expect("host should start");

        assert_eq!(handle.local_addr().ip().to_string(), "127.0.0.1");
        assert_ne!(handle.local_addr().port(), 0);
        handle.shutdown().await;
    }
}
```

Create `codex-rs/gui-host/src/assets.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::ProdAssetConfig;

    #[tokio::test]
    async fn prod_dist_dir_requires_existing_dist() {
        let tempdir = tempfile::tempdir().unwrap();
        let config = ProdAssetConfig {
            package_root: tempdir.path().to_path_buf(),
        };
        let error = prod_dist_dir(&config).unwrap_err();
        assert!(
            error
                .to_string()
                .contains("GUI dist directory is missing")
        );
    }
}
```

Modify `codex-rs/gui-host/src/lib.rs` to include:

```rust
mod assets;
mod backend;
mod config;
mod filter;
mod host;
mod token;
mod url;

pub use backend::AuthenticatedGuiConnection;
pub use backend::GuiBackend;
pub use config::DevAssetProxyConfig;
pub use config::GuiHostConfig;
pub use config::GuiHostMode;
pub use config::ProdAssetConfig;
pub use filter::is_allowed_client_notification_method;
pub use filter::is_allowed_client_request_method;
pub use filter::is_allowed_server_notification_method;
pub use host::GuiHost;
pub use host::GuiHostHandle;
pub use token::LaunchToken;
pub use url::launch_url_for_thread;

#[cfg(test)]
pub(crate) mod test_support {
    use crate::AuthenticatedGuiConnection;
    use crate::GuiBackend;

    #[derive(Clone, Copy)]
    pub(crate) struct NoopBackend;

    impl GuiBackend for NoopBackend {
        async fn connect(&self, _connection: AuthenticatedGuiConnection) -> anyhow::Result<()> {
            Ok(())
        }
    }

    #[derive(Clone, Default)]
    pub(crate) struct RecordingBackend {
        received: std::sync::Arc<std::sync::Mutex<Vec<String>>>,
    }

    impl RecordingBackend {
        pub(crate) fn new() -> Self {
            Self::default()
        }

        pub(crate) fn received(&self) -> Vec<String> {
            self.received.lock().unwrap().clone()
        }
    }

    impl GuiBackend for RecordingBackend {
        async fn connect(&self, mut connection: AuthenticatedGuiConnection) -> anyhow::Result<()> {
            while let Some(text) = connection.inbound_rx.recv().await {
                let method = serde_json::from_str::<serde_json::Value>(&text)
                    .ok()
                    .and_then(|value| value["method"].as_str().map(str::to_owned))
                    .unwrap_or(text);
                self.received.lock().unwrap().push(method);
            }
            Ok(())
        }
    }
}
```

- [ ] **Step 2: Run tests to verify FAIL**

Run:

```bash
cargo test -p codex-gui-host host::tests::binds_loopback_ephemeral_port assets::tests::prod_dist_dir_requires_existing_dist
```

Expected failures include unresolved `GuiHost`, `GuiHostHandle`, and `prod_dist_dir`.

- [ ] **Step 3: Implement host lifecycle and asset helpers**

Modify `codex-rs/Cargo.toml` if `tower-http` is not already in `[workspace.dependencies]`:

```toml
tower-http = { version = "0.6", features = ["fs"] }
```

Modify `codex-rs/gui-host/Cargo.toml`:

```toml
[dependencies]
anyhow = { workspace = true }
axum = { workspace = true, default-features = false, features = ["http1", "tokio", "ws"] }
base64 = { workspace = true }
rand = { workspace = true }
reqwest = { workspace = true, features = ["rustls-tls"] }
tokio = { workspace = true, features = ["fs", "macros", "net", "rt-multi-thread", "sync"] }
tower-http = { workspace = true }
tracing = { workspace = true }
urlencoding = { workspace = true }

[dev-dependencies]
pretty_assertions = { workspace = true }
tempfile = { workspace = true }
```

`reqwest` is used only for the dev Vite reverse proxy in this first pass. This is acceptable for v1, but keep the proxy isolated in `assets.rs` so a later optimization can replace it with a lighter HTTP client without touching host lifecycle or WebSocket code.

Create `codex-rs/gui-host/src/assets.rs`:

```rust
use std::path::PathBuf;

use axum::body::Body;
use axum::http::StatusCode;
use axum::http::Uri;
use axum::http::header;
use axum::response::Html;
use axum::response::IntoResponse;
use axum::response::Response;
use tower_http::services::ServeDir;

use crate::DevAssetProxyConfig;
use crate::ProdAssetConfig;

pub(crate) fn prod_dist_dir(config: &ProdAssetConfig) -> anyhow::Result<PathBuf> {
    let dist = config.dist_dir();
    if !dist.is_dir() {
        anyhow::bail!("GUI dist directory is missing: {}", dist.display());
    }
    Ok(dist)
}

pub(crate) fn prod_assets_service(config: &ProdAssetConfig) -> ServeDir {
    ServeDir::new(config.dist_dir()).append_index_html_on_directories(true)
}

pub(crate) async fn serve_prod_index(config: &ProdAssetConfig) -> Result<Response, (StatusCode, String)> {
    let dist = prod_dist_dir(config).map_err(internal_server_error)?;
    let html = tokio::fs::read_to_string(dist.join("index.html"))
        .await
        .map_err(|err| (StatusCode::INTERNAL_SERVER_ERROR, err.to_string()))?;
    Ok(with_security_headers(Html(html).into_response()))
}

pub(crate) async fn proxy_vite(
    config: &DevAssetProxyConfig,
    uri: Uri,
) -> Result<Response, (StatusCode, String)> {
    let path_and_query = uri.path_and_query().map_or("/", |value| value.as_str());
    let url = format!("{}{}", config.vite_origin.trim_end_matches('/'), path_and_query);
    let response = reqwest::get(&url).await.map_err(|_| {
        (
            StatusCode::BAD_GATEWAY,
            format!("Start Vite at {}", config.vite_origin),
        )
    })?;
    let status = response.status();
    let content_type = response.headers().get(header::CONTENT_TYPE).cloned();
    let body = response
        .bytes()
        .await
        .map_err(|err| (StatusCode::BAD_GATEWAY, err.to_string()))?;
    let mut builder = Response::builder().status(status);
    if let Some(content_type) = content_type {
        builder = builder.header(header::CONTENT_TYPE, content_type);
    }
    builder
        .body(Body::from(body))
        .map(with_security_headers)
        .map_err(|err| (StatusCode::BAD_GATEWAY, err.to_string()))
}

pub(crate) fn with_security_headers(mut response: Response) -> Response {
    let headers = response.headers_mut();
    headers.insert(header::X_FRAME_OPTIONS, header::HeaderValue::from_static("DENY"));
    headers.insert(
        header::CONTENT_SECURITY_POLICY,
        header::HeaderValue::from_static("frame-ancestors 'none'"),
    );
    response
}

fn internal_server_error(err: anyhow::Error) -> (StatusCode, String) {
    (StatusCode::INTERNAL_SERVER_ERROR, err.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ProdAssetConfig;

    #[tokio::test]
    async fn prod_dist_dir_requires_existing_dist() {
        let tempdir = tempfile::tempdir().unwrap();
        let config = ProdAssetConfig {
            package_root: tempdir.path().to_path_buf(),
        };
        let error = prod_dist_dir(&config).unwrap_err();
        assert!(
            error
                .to_string()
                .contains("GUI dist directory is missing")
        );
    }
}
```

Create `codex-rs/gui-host/src/host.rs`:

```rust
use std::net::SocketAddr;
use std::sync::Arc;

use axum::Router;
use axum::extract::State;
use axum::http::Uri;
use axum::response::Response;
use axum::routing::get;
use tokio::net::TcpListener;
use tokio::sync::oneshot;

use crate::GuiBackend;
use crate::GuiHostConfig;
use crate::GuiHostMode;
use crate::LaunchToken;
use crate::assets;
use crate::launch_url_for_thread;

pub struct GuiHost;

pub struct GuiHostHandle {
    local_addr: SocketAddr,
    launch_token: LaunchToken,
    shutdown_tx: Option<oneshot::Sender<()>>,
    server_task: Option<tokio::task::JoinHandle<()>>,
}

#[derive(Clone)]
pub(crate) struct GuiHostState<B> {
    pub(crate) local_addr: SocketAddr,
    pub(crate) launch_token: LaunchToken,
    pub(crate) mode: GuiHostMode,
    pub(crate) backend: B,
}

impl GuiHost {
    pub async fn start<B>(config: GuiHostConfig, backend: B) -> std::io::Result<GuiHostHandle>
    where
        B: GuiBackend + Clone,
    {
        let listener = TcpListener::bind(("127.0.0.1", 0)).await?;
        let local_addr = listener.local_addr()?;
        let launch_token = LaunchToken::generate()?;
        let state = Arc::new(GuiHostState {
            local_addr,
            launch_token: launch_token.clone(),
            mode: config.mode,
            backend,
        });
        let app = router_for_state(state);
        let (shutdown_tx, shutdown_rx) = oneshot::channel();
        let server_task = tokio::spawn(async move {
            let server = axum::serve(listener, app).with_graceful_shutdown(async move {
                let _ = shutdown_rx.await;
            });
            if let Err(err) = server.await {
                tracing::warn!(?err, "GuiHost exited");
            }
        });

        Ok(GuiHostHandle {
            local_addr,
            launch_token,
            shutdown_tx: Some(shutdown_tx),
            server_task: Some(server_task),
        })
    }
}

impl GuiHostHandle {
    pub fn local_addr(&self) -> SocketAddr {
        self.local_addr
    }

    pub fn launch_token(&self) -> &LaunchToken {
        &self.launch_token
    }

    pub fn launch_url_for_thread(&self, thread_id: impl std::fmt::Display) -> String {
        launch_url_for_thread(self.local_addr, thread_id, &self.launch_token)
    }

    pub async fn shutdown(mut self) {
        if let Some(tx) = self.shutdown_tx.take() {
            let _ = tx.send(());
        }
        if let Some(server_task) = self.server_task.take() {
            let _ = server_task.await;
        }
    }
}

fn router_for_state<B>(state: Arc<GuiHostState<B>>) -> Router
where
    B: GuiBackend + Clone,
{
    match &state.mode {
        GuiHostMode::Dev(_) => Router::new()
            .fallback(get(dev_fallback::<B>))
            .with_state(state),
        GuiHostMode::Prod(config) => Router::new()
            .route("/", get(prod_root::<B>))
            .fallback_service(assets::prod_assets_service(config))
            .with_state(state),
    }
}

async fn dev_fallback<B>(
    State(state): State<Arc<GuiHostState<B>>>,
    uri: Uri,
) -> Result<Response, (axum::http::StatusCode, String)>
where
    B: GuiBackend + Clone,
{
    let GuiHostMode::Dev(config) = &state.mode else {
        return Err((axum::http::StatusCode::INTERNAL_SERVER_ERROR, "invalid GUI host mode".to_string()));
    };
    assets::proxy_vite(config, uri).await
}

async fn prod_root<B>(
    State(state): State<Arc<GuiHostState<B>>>,
) -> Result<Response, (axum::http::StatusCode, String)>
where
    B: GuiBackend + Clone,
{
    let GuiHostMode::Prod(config) = &state.mode else {
        return Err((axum::http::StatusCode::INTERNAL_SERVER_ERROR, "invalid GUI host mode".to_string()));
    };
    assets::serve_prod_index(config).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::DevAssetProxyConfig;
    use crate::GuiHostConfig;
    use crate::GuiHostMode;

    #[tokio::test]
    async fn binds_loopback_ephemeral_port() {
        let backend = crate::test_support::NoopBackend;
        let handle = GuiHost::start(
            GuiHostConfig {
                mode: GuiHostMode::Dev(DevAssetProxyConfig::default()),
            },
            backend,
        )
        .await
        .expect("host should start");

        assert_eq!(handle.local_addr().ip().to_string(), "127.0.0.1");
        assert_ne!(handle.local_addr().port(), 0);
        handle.shutdown().await;
    }
}
```

- [ ] **Step 4: Run tests to verify PASS**

Run:

```bash
cargo test -p codex-gui-host host::tests::binds_loopback_ephemeral_port assets::tests::prod_dist_dir_requires_existing_dist
```

Expected:

```text
test host::tests::binds_loopback_ephemeral_port ... ok
test assets::tests::prod_dist_dir_requires_existing_dist ... ok
```

- [ ] **Step 5: Commit**

```bash
git add codex-rs/Cargo.toml codex-rs/Cargo.lock codex-rs/gui-host
git commit -m "feat(gui-host): add host lifecycle and assets"
```

---

### Task 5: Add `/ws` authentication and WebSocket pump

**Files:**
- Modify: `codex-rs/gui-host/Cargo.toml`
- Modify: `codex-rs/gui-host/src/lib.rs`
- Modify: `codex-rs/gui-host/src/host.rs`
- Create: `codex-rs/gui-host/src/ws.rs`
- Test: `codex-rs/gui-host/src/ws.rs`
- Test: `codex-rs/gui-host/src/host.rs`

- [ ] **Step 1: Write failing tests**

Create `codex-rs/gui-host/src/ws.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::LaunchToken;
    use std::net::SocketAddr;

    #[test]
    fn validates_exact_host_and_origin() {
        let addr: SocketAddr = "127.0.0.1:4567".parse().unwrap();
        assert!(validate_host_header(&addr, "127.0.0.1:4567"));
        assert!(!validate_host_header(&addr, "localhost:4567"));
        assert!(validate_origin_header(&addr, Some("http://127.0.0.1:4567")));
        assert!(!validate_origin_header(&addr, Some("http://localhost:4567")));
        assert!(!validate_origin_header(&addr, None));
    }

    #[test]
    fn parses_valid_authenticate_request() {
        let token = LaunchToken::from_test_value("secret");
        let request = parse_authenticate_request(
            r#"{"jsonrpc":"2.0","id":1,"method":"gui/authenticate","params":{"token":"secret"}}"#,
            &token,
        )
        .expect("auth should parse");
        assert_eq!(request.id, serde_json::json!(1));
    }
}
```

Add a host-level integration test to `codex-rs/gui-host/src/host.rs`:

```rust
#[tokio::test]
async fn websocket_accepts_valid_authenticate_first_frame() {
    use futures::SinkExt;
    use futures::StreamExt;
    use tokio_tungstenite::tungstenite::Message as TungsteniteMessage;
    use tokio_tungstenite::tungstenite::client::IntoClientRequest;

    let backend = crate::test_support::NoopBackend;
    let handle = GuiHost::start(
        GuiHostConfig {
            mode: GuiHostMode::Dev(DevAssetProxyConfig::default()),
        },
        backend,
    )
    .await
    .unwrap();
    let mut request = format!("ws://{}/ws", handle.local_addr())
        .into_client_request()
        .unwrap();
    request.headers_mut().insert(
        "origin",
        format!("http://{}", handle.local_addr()).parse().unwrap(),
    );
    let (mut ws, _) = tokio_tungstenite::connect_async(request).await.unwrap();
    ws.send(TungsteniteMessage::Text(
        serde_json::json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "gui/authenticate",
            "params": { "token": handle.launch_token().as_str() },
        })
        .to_string()
        .into(),
    ))
    .await
    .unwrap();
    assert_eq!(
        ws.next().await.unwrap().unwrap().into_text().unwrap(),
        r#"{"id":1,"jsonrpc":"2.0","result":{"authenticated":true}}"#
    );
    handle.shutdown().await;
}

#[tokio::test]
async fn websocket_closes_1008_for_invalid_first_frame() {
    use futures::SinkExt;
    use futures::StreamExt;
    use tokio_tungstenite::tungstenite::Message as TungsteniteMessage;
    use tokio_tungstenite::tungstenite::client::IntoClientRequest;

    let backend = crate::test_support::NoopBackend;
    let handle = GuiHost::start(
        GuiHostConfig {
            mode: GuiHostMode::Dev(DevAssetProxyConfig::default()),
        },
        backend,
    )
    .await
    .unwrap();
    let mut request = format!("ws://{}/ws", handle.local_addr())
        .into_client_request()
        .unwrap();
    request.headers_mut().insert(
        "origin",
        format!("http://{}", handle.local_addr()).parse().unwrap(),
    );
    let (mut ws, _) = tokio_tungstenite::connect_async(request).await.unwrap();
    ws.send(TungsteniteMessage::Text(
        r#"{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}"#.into(),
    ))
    .await
    .unwrap();
    let close = ws.next().await.unwrap().unwrap();
    let close = close.into_close().expect("close frame");
    assert_eq!(close.code, 1008);
    handle.shutdown().await;
}

#[tokio::test]
async fn websocket_does_not_forward_rejected_client_method() {
    use futures::SinkExt;
    use futures::StreamExt;
    use tokio_tungstenite::tungstenite::Message as TungsteniteMessage;
    use tokio_tungstenite::tungstenite::client::IntoClientRequest;

    let backend = crate::test_support::RecordingBackend::new();
    let recorder = backend.clone();
    let handle = GuiHost::start(
        GuiHostConfig {
            mode: GuiHostMode::Dev(DevAssetProxyConfig::default()),
        },
        backend,
    )
    .await
    .unwrap();
    let mut request = format!("ws://{}/ws", handle.local_addr())
        .into_client_request()
        .unwrap();
    request.headers_mut().insert(
        "origin",
        format!("http://{}", handle.local_addr()).parse().unwrap(),
    );
    let (mut ws, _) = tokio_tungstenite::connect_async(request).await.unwrap();
    ws.send(TungsteniteMessage::Text(
        serde_json::json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "gui/authenticate",
            "params": { "token": handle.launch_token().as_str() },
        })
        .to_string()
        .into(),
    ))
    .await
    .unwrap();
    let _ = ws.next().await.unwrap().unwrap();
    ws.send(TungsteniteMessage::Text(
        r#"{"jsonrpc":"2.0","id":2,"method":"thread/list","params":{}}"#.into(),
    ))
    .await
    .unwrap();
    let _ = ws.next().await;
    assert!(recorder.received().is_empty());
    handle.shutdown().await;
}

#[tokio::test]
async fn two_browser_tabs_can_reuse_the_same_launch_token() {
    use futures::SinkExt;
    use futures::StreamExt;
    use tokio_tungstenite::tungstenite::Message as TungsteniteMessage;
    use tokio_tungstenite::tungstenite::client::IntoClientRequest;

    let backend = crate::test_support::NoopBackend;
    let handle = GuiHost::start(
        GuiHostConfig {
            mode: GuiHostMode::Dev(DevAssetProxyConfig::default()),
        },
        backend,
    )
    .await
    .unwrap();

    for _ in 0..2 {
        let mut request = format!("ws://{}/ws", handle.local_addr())
            .into_client_request()
            .unwrap();
        request.headers_mut().insert(
            "origin",
            format!("http://{}", handle.local_addr()).parse().unwrap(),
        );
        let (mut ws, _) = tokio_tungstenite::connect_async(request).await.unwrap();
        ws.send(TungsteniteMessage::Text(
            serde_json::json!({
                "jsonrpc": "2.0",
                "id": 1,
                "method": "gui/authenticate",
                "params": { "token": handle.launch_token().as_str() },
            })
            .to_string()
            .into(),
        ))
        .await
        .unwrap();
        assert_eq!(
            ws.next().await.unwrap().unwrap().into_text().unwrap(),
            r#"{"id":1,"jsonrpc":"2.0","result":{"authenticated":true}}"#
        );
    }
    handle.shutdown().await;
}
```

- [ ] **Step 2: Run tests to verify FAIL**

Run:

```bash
cargo test -p codex-gui-host ws::tests::validates_exact_host_and_origin ws::tests::parses_valid_authenticate_request host::tests::websocket_accepts_valid_authenticate_first_frame host::tests::websocket_closes_1008_for_invalid_first_frame host::tests::websocket_does_not_forward_rejected_client_method host::tests::two_browser_tabs_can_reuse_the_same_launch_token
```

Expected failures include unresolved `validate_host_header`, `parse_authenticate_request`, missing `/ws` route, and missing recording backend test support.

- [ ] **Step 3: Implement auth and pump**

Modify `codex-rs/gui-host/Cargo.toml`:

```toml
[dependencies]
anyhow = { workspace = true }
axum = { workspace = true, default-features = false, features = ["http1", "tokio", "ws"] }
base64 = { workspace = true }
futures = { workspace = true }
rand = { workspace = true }
reqwest = { workspace = true, features = ["rustls-tls"] }
serde = { workspace = true, features = ["derive"] }
serde_json = { workspace = true }
tokio = { workspace = true, features = ["fs", "macros", "net", "rt-multi-thread", "sync", "time"] }
tokio-util = { workspace = true }
tower-http = { workspace = true }
tracing = { workspace = true }
urlencoding = { workspace = true }

[dev-dependencies]
pretty_assertions = { workspace = true }
tempfile = { workspace = true }
tokio-tungstenite = { workspace = true }
```

Create `codex-rs/gui-host/src/ws.rs`:

```rust
use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Duration;

use axum::extract::State;
use axum::extract::ws::CloseFrame;
use axum::extract::ws::Message;
use axum::extract::ws::WebSocket;
use axum::extract::ws::WebSocketUpgrade;
use axum::extract::ws::close_code;
use axum::http::HeaderMap;
use axum::http::StatusCode;
use axum::http::header;
use axum::response::IntoResponse;
use axum::response::Response;
use futures::SinkExt;
use futures::StreamExt;
use serde::Deserialize;
use serde_json::json;
use tokio::time::timeout;

use crate::AuthenticatedGuiConnection;
use crate::GuiBackend;
use crate::LaunchToken;
use crate::filter;
use crate::host::GuiHostState;

const AUTH_TIMEOUT: Duration = Duration::from_secs(5);

#[derive(Debug)]
pub(crate) struct AuthenticatedRequest {
    pub(crate) id: serde_json::Value,
}

#[derive(Debug, Deserialize)]
struct GuiAuthenticateRequest {
    jsonrpc: String,
    id: serde_json::Value,
    method: String,
    params: GuiAuthenticateParams,
}

#[derive(Debug, Deserialize)]
struct GuiAuthenticateParams {
    token: Option<String>,
}

#[derive(Debug, Deserialize)]
struct JsonRpcMethodProbe {
    id: Option<serde_json::Value>,
    method: Option<String>,
}

pub(crate) async fn ws_handler<B>(
    State(state): State<Arc<GuiHostState<B>>>,
    headers: HeaderMap,
    ws: WebSocketUpgrade,
) -> Response
where
    B: GuiBackend + Clone,
{
    let host = headers
        .get(header::HOST)
        .and_then(|value| value.to_str().ok())
        .unwrap_or_default();
    let origin = headers
        .get(header::ORIGIN)
        .and_then(|value| value.to_str().ok());
    if !validate_host_header(&state.local_addr, host)
        || !validate_origin_header(&state.local_addr, origin)
    {
        return StatusCode::FORBIDDEN.into_response();
    }
    ws.on_upgrade(move |socket| authenticate_and_bridge(socket, state))
        .into_response()
}

pub(crate) fn validate_host_header(local_addr: &SocketAddr, host: &str) -> bool {
    host == format!("127.0.0.1:{}", local_addr.port())
}

pub(crate) fn validate_origin_header(local_addr: &SocketAddr, origin: Option<&str>) -> bool {
    origin == Some(format!("http://127.0.0.1:{}", local_addr.port()).as_str())
}

pub(crate) fn parse_authenticate_request(
    text: &str,
    expected_token: &LaunchToken,
) -> anyhow::Result<AuthenticatedRequest> {
    let request = serde_json::from_str::<GuiAuthenticateRequest>(text)?;
    if request.jsonrpc != "2.0"
        || request.method != "gui/authenticate"
        || request.params.token.as_deref() != Some(expected_token.as_str())
    {
        anyhow::bail!("invalid GUI authentication request");
    }
    Ok(AuthenticatedRequest { id: request.id })
}

async fn authenticate_and_bridge<B>(mut socket: WebSocket, state: Arc<GuiHostState<B>>)
where
    B: GuiBackend + Clone,
{
    let Some(Ok(Message::Text(text))) = timeout(AUTH_TIMEOUT, socket.recv())
        .await
        .ok()
        .flatten()
    else {
        close_policy_violation(&mut socket).await;
        return;
    };
    let Ok(request) = parse_authenticate_request(&text, &state.launch_token) else {
        close_policy_violation(&mut socket).await;
        return;
    };
    let response = json!({
        "id": request.id,
        "jsonrpc": "2.0",
        "result": { "authenticated": true },
    });
    if socket
        .send(Message::Text(response.to_string().into()))
        .await
        .is_err()
    {
        return;
    }

    let (connection, inbound_tx, mut outbound_rx) = AuthenticatedGuiConnection::new();
    let backend_task = tokio::spawn({
        let backend = state.backend.clone();
        async move { backend.connect(connection).await }
    });

    let (mut writer, mut reader) = socket.split();
    loop {
        tokio::select! {
            maybe_message = reader.next() => {
                match maybe_message {
                    Some(Ok(Message::Text(text))) if allows_incoming_text(&text) => {
                        if inbound_tx.send(text.to_string()).await.is_err() {
                            break;
                        }
                    }
                    Some(Ok(Message::Text(_))) => {
                        break;
                    }
                    Some(Ok(Message::Close(_))) | None | Some(Err(_)) => break,
                    Some(Ok(_)) => {}
                }
            }
            maybe_text = outbound_rx.recv() => {
                let Some(text) = maybe_text else {
                    break;
                };
                if allows_outgoing_text(&text)
                    && writer.send(Message::Text(text.into())).await.is_err()
                {
                    break;
                }
            }
        }
    }
    backend_task.abort();
}

async fn close_policy_violation(socket: &mut WebSocket) {
    // Sending a Close frame and returning lets axum finish closing the socket.
    let _ = socket
        .send(Message::Close(Some(CloseFrame {
            code: close_code::POLICY,
            reason: "GUI authentication failed".into(),
        })))
        .await;
}

fn allows_incoming_text(text: &str) -> bool {
    let Ok(probe) = serde_json::from_str::<JsonRpcMethodProbe>(text) else {
        return false;
    };
    match (probe.id, probe.method.as_deref()) {
        (Some(_), Some(method)) => filter::is_allowed_client_request_method(method),
        (None, Some(method)) => filter::is_allowed_client_notification_method(method),
        (_, None) => true,
    }
}

fn allows_outgoing_text(text: &str) -> bool {
    let Ok(probe) = serde_json::from_str::<JsonRpcMethodProbe>(text) else {
        return false;
    };
    match (probe.id, probe.method.as_deref()) {
        (Some(_), _) => true,
        (None, Some(method)) => filter::is_allowed_server_notification_method(method),
        (None, None) => true,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::LaunchToken;
    use std::net::SocketAddr;

    #[test]
    fn validates_exact_host_and_origin() {
        let addr: SocketAddr = "127.0.0.1:4567".parse().unwrap();
        assert!(validate_host_header(&addr, "127.0.0.1:4567"));
        assert!(!validate_host_header(&addr, "localhost:4567"));
        assert!(validate_origin_header(&addr, Some("http://127.0.0.1:4567")));
        assert!(!validate_origin_header(&addr, Some("http://localhost:4567")));
        assert!(!validate_origin_header(&addr, None));
    }

    #[test]
    fn parses_valid_authenticate_request() {
        let token = LaunchToken::from_test_value("secret");
        let request = parse_authenticate_request(
            r#"{"jsonrpc":"2.0","id":1,"method":"gui/authenticate","params":{"token":"secret"}}"#,
            &token,
        )
        .expect("auth should parse");
        assert_eq!(request.id, serde_json::json!(1));
    }
}
```

Modify `codex-rs/gui-host/src/lib.rs` to add:

```rust
mod ws;
```

Modify `router_for_state` in `codex-rs/gui-host/src/host.rs` so both modes route `/ws`:

```rust
GuiHostMode::Dev(_) => Router::new()
    .route("/ws", get(crate::ws::ws_handler::<B>))
    .fallback(get(dev_fallback::<B>))
    .with_state(state),
GuiHostMode::Prod(config) => Router::new()
    .route("/", get(prod_root::<B>))
    .route("/ws", get(crate::ws::ws_handler::<B>))
    .fallback_service(assets::prod_assets_service(config))
    .with_state(state),
```

- [ ] **Step 4: Run tests to verify PASS**

Run:

```bash
cargo test -p codex-gui-host ws::tests::validates_exact_host_and_origin ws::tests::parses_valid_authenticate_request host::tests::websocket_accepts_valid_authenticate_first_frame host::tests::websocket_closes_1008_for_invalid_first_frame host::tests::websocket_does_not_forward_rejected_client_method host::tests::two_browser_tabs_can_reuse_the_same_launch_token
```

Expected:

```text
test ws::tests::validates_exact_host_and_origin ... ok
test ws::tests::parses_valid_authenticate_request ... ok
test host::tests::websocket_accepts_valid_authenticate_first_frame ... ok
test host::tests::websocket_closes_1008_for_invalid_first_frame ... ok
test host::tests::websocket_does_not_forward_rejected_client_method ... ok
test host::tests::two_browser_tabs_can_reuse_the_same_launch_token ... ok
```

- [ ] **Step 5: Commit**

```bash
git add codex-rs/gui-host codex-rs/Cargo.toml codex-rs/Cargo.lock
git commit -m "feat(gui-host): authenticate browser websocket"
```

---
