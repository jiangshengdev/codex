# Codex GUI App-Server Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `codex-app-server` 内新增 GUI host lifecycle 与 transport bridge，把认证后的 `codex-gui-host` browser connection 接到已落地的 extra in-process connection API。

**Architecture:** `GuiHostManager` 负责 lazy-start / reuse / shutdown `codex_gui_host::GuiHost`，并返回 raw launch URL；它持有 `InProcessClientSender`，不接触 `MessageProcessor` 细节。`gui_transport.rs` 实现 `codex_gui_host::GuiBackend`，每个 authenticated GUI connection 调用 `InProcessClientSender::register_extra_connection`，把 browser inbound JSON-RPC request/notification 转成 `ExtraConnectionCommandSender` 调用，把 app-server outbound text 转回 browser outbound channel。`codex-app-server-client` facade、TUI `/gui`、frontend handshake 仍留给后续计划。

**Tech Stack:** Rust 2024, tokio, tokio-util, codex-gui-host, codex-app-server, codex-app-server-protocol.

---

## Source Of Truth

- Roadmap: `docs/superpowers/plans/2026-05-30-gui-host/00-roadmap.md`
- Host crate plan: `docs/superpowers/plans/2026-05-30-gui-host/01-gui-host-crate.md`
- Extra connection plan: `docs/superpowers/plans/2026-05-30-gui-host/02-in-process-extra-connection.md`
- 主设计：`port/lazy-proj-130:docs/superpowers/specs/2026-05-11-codex-gui-host-redesign.md`
- 当前 `dev` 适配设计：`docs/superpowers/specs/2026-05-30-codex-gui-host-dev-adaptation-design.md`
- low-intrusion 设计：`docs/superpowers/specs/2026-05-13-gui-host-low-intrusion-refactor-design.md`
- 旧分支基础计划：`port/lazy-proj-130:docs/superpowers/plans/2026-05-11-gui-host/02-app-server-bridge.md`
- 旧分支最终实现：
  - `port/lazy-proj-130:codex-rs/app-server/src/gui_host.rs`
  - `port/lazy-proj-130:codex-rs/app-server/src/gui_transport.rs`

旧分支 `02-app-server-bridge.md` 同时包含 app-server-client wiring；当前 roadmap 已把这部分拆到 `04-app-server-client-facade.md`。本计划只覆盖 app-server bridge。

## Scope

### In Scope

- Modify: `codex-rs/app-server/Cargo.toml`
- Modify: `codex-rs/Cargo.lock`
- Modify if needed: `codex-rs/app-server/BUILD.bazel`
- Modify: `codex-rs/app-server/src/lib.rs`
- Create: `codex-rs/app-server/src/gui_host.rs`
- Create: `codex-rs/app-server/src/gui_transport.rs`

### Out Of Scope

- 不改 `codex-rs/app-server/src/in_process.rs`
- 不改 `codex-rs/app-server/src/in_process_extra.rs`
- 不改 `codex-rs/app-server-client/src/lib.rs`
- 不写 `codex-rs/app-server-client/src/gui.rs`
- 不写 TUI `/gui`
- 不改 `codex-gui/**`
- 不使用 `TransportEvent`
- 不实现 external app-server process GUI backend
- 不实现 projection detach/viewer/recovery

## Current Baseline

- `codex-rs/gui-host/**` 已存在。
- `codex-rs/app-server/src/in_process_extra.rs` 已存在。
- `codex-rs/app-server/src/in_process.rs` 已暴露：
  - `pub use crate::in_process_extra::ExtraConnectionCommandSender;`
  - `pub use crate::in_process_extra::ExtraConnectionHandle;`
  - `InProcessClientSender::register_extra_connection(&self) -> IoResult<ExtraConnectionHandle>`
- `codex-rs/app-server` 还没有 dependency on `codex-gui-host`。
- `codex-rs/app-server/src/gui_host.rs` 和 `codex-rs/app-server/src/gui_transport.rs` 还不存在。

## Hard Constraints

- `codex-gui-host` 必须继续不依赖 `codex-app-server`。
- `codex-app-server` owns `GuiHostManager` 和 `GuiBackend` implementation。
- `gui_host.rs` 不接触 `MessageProcessor`、`OutboundConnectionState`、projection internals 或 raw request dispatch。
- `gui_transport.rs` 不访问 `in_process_extra` internal state，只使用 `InProcessClientSender`、`ExtraConnectionCommandSender`、`ExtraConnectionHandle` public surface。
- 不在 MVP in-process path 使用 `TransportEvent`、`ConnectionOrigin::GuiHost`、`start_remote_control`、`run_main_with_transport_options`。
- 不把 GUI/WebSocket/Origin/token/allowlist 概念加到 `in_process.rs`。
- 每个 successful `register_extra_connection` 正常路径必须让 `ExtraConnectionHandle` drop，从而触发 extra close cleanup。
- `gui/authenticate` 失败路径由 `codex-gui-host` 处理；本计划中的 `GuiBackend::connect` 只会收到 authenticated connection。
- JSON 解析在 `gui_transport.rs` 中完成一次；`in_process.rs` 继续接收 typed `JSONRPCRequest` / `JSONRPCNotification`。
- allowlist policy 仍以 `codex-gui-host` 为安全边界。`gui_transport.rs` 可做 defense-in-depth classification/filtering，但不能成为唯一安全边界。
- 本地按无网络/网络不可靠处理：不要运行 Bazel、Bazel lock、remote test、CI matrix；CI 操作留给 CI。

## File Boundary

### `codex-rs/app-server/src/gui_host.rs`

Owns:

- `pub struct GuiHostManager`
- `GuiHostManager::new(sender: InProcessClientSender) -> Self`
- `GuiHostManager::launch_url_for_thread(self: &Arc<Self>, primary_thread_id: &str) -> anyhow::Result<String>`
- `GuiHostManager::shutdown(self: Arc<Self>)`
- `GuiHostManager::cancel_nonblocking(&self)`

Does not own:

- app-server-client facade
- TUI display
- request/notification dispatch
- projection store logic

### `codex-rs/app-server/src/gui_transport.rs`

Owns:

- `pub(crate) struct GuiTransportBackend`
- `impl codex_gui_host::GuiBackend for GuiTransportBackend`
- inbound JSON-RPC parsing and classification
- outbound JSON-RPC normalization/filtering
- bridge lifecycle around `ExtraConnectionHandle`

Does not own:

- host lifecycle
- launch URL formatting
- `MessageProcessor` internals
- browser auth/token validation

## Task 0: Baseline Verification

**Files:**
- Verify: `codex-rs/gui-host/**`
- Verify: `codex-rs/app-server/src/in_process.rs`
- Verify: `codex-rs/app-server/src/in_process_extra.rs`
- Verify: `codex-rs/app-server/Cargo.toml`

- [ ] **Step 1: Confirm worktree is clean**

Run from repo root:

```bash
git status --short
```

Expected: no output.

- [ ] **Step 2: Confirm prerequisite files exist**

Run from repo root:

```bash
test -f codex-rs/gui-host/src/backend.rs
test -f codex-rs/app-server/src/in_process_extra.rs
rg -n "register_extra_connection|ExtraConnectionCommandSender|ExtraConnectionHandle" codex-rs/app-server/src/in_process.rs
```

Expected: both `test -f` commands exit 0, and `rg` shows `register_extra_connection` plus the two extra connection re-exports.

- [ ] **Step 3: Confirm bridge files are not already present**

Run from repo root:

```bash
test ! -f codex-rs/app-server/src/gui_host.rs
test ! -f codex-rs/app-server/src/gui_transport.rs
```

Expected: both commands exit 0. If either file exists, stop and inspect before overwriting user or previous-agent work.

## Task 1: Add app-server dependency and module hooks

**Files:**
- Modify: `codex-rs/app-server/Cargo.toml`
- Modify if needed: `codex-rs/app-server/BUILD.bazel`
- Modify: `codex-rs/app-server/src/lib.rs`

- [ ] **Step 1: Add the workspace dependency**

In `codex-rs/app-server/Cargo.toml`, add this dependency in the existing `[dependencies]` list near the other `codex-*` entries:

```toml
codex-gui-host = { workspace = true }
```

Do not add `async-trait`; `GuiBackend` already uses RPITIT with explicit `Send` future bounds.

- [ ] **Step 2: Inspect Bazel rule shape**

Run from repo root:

```bash
sed -n '1,120p' codex-rs/app-server/BUILD.bazel
```

Expected current shape: `codex_rust_crate(...)` has no explicit Rust dependency list. If this is still true, do not edit `BUILD.bazel`. If the file has gained an explicit deps list before implementation, add the `codex-gui-host` dependency in that list using the file-local style.

- [ ] **Step 3: Declare app-server bridge modules**

In `codex-rs/app-server/src/lib.rs`, add these module declarations near the other `mod` lines:

```rust
pub mod gui_host;
mod gui_transport;
```

`gui_host` is public because `app-server-client` will use `GuiHostManager` in the next plan. `gui_transport` stays crate-private because only `gui_host.rs` needs to construct `GuiTransportBackend`.

- [ ] **Step 4: Create temporary empty module files**

Create `codex-rs/app-server/src/gui_host.rs`:

```rust
//! GUI host lifecycle owned by the app-server runtime.
```

Create `codex-rs/app-server/src/gui_transport.rs`:

```rust
//! GUI backend bridge for the in-process app-server runtime.
```

- [ ] **Step 5: Verify module wiring compiles far enough**

Run from `codex-rs`:

```bash
just test -p codex-app-server gui_host
```

Expected: command may report no matching tests at this point, but the crate should compile far enough to discover tests. If it fails because `codex-gui-host` cannot be resolved, fix dependency wiring before continuing.

## Task 2: Implement `GuiTransportBackend` filters and pumps

**Files:**
- Modify: `codex-rs/app-server/src/gui_transport.rs`

- [ ] **Step 1: Restore old branch implementation as the starting point**

Run from repo root:

```bash
git restore --source port/lazy-proj-130 -- codex-rs/app-server/src/gui_transport.rs
```

Expected: `codex-rs/app-server/src/gui_transport.rs` is populated from the old branch.

- [ ] **Step 2: Adapt visibility to current roadmap**

In `codex-rs/app-server/src/gui_transport.rs`, keep `GuiTransportBackend` visible only inside the crate:

```rust
#[derive(Clone)]
pub(crate) struct GuiTransportBackend {
    sender: InProcessClientSender,
    manager_cancel: CancellationToken,
}
```

Keep its constructor crate-private:

```rust
impl GuiTransportBackend {
    pub(crate) fn new(sender: InProcessClientSender, manager_cancel: CancellationToken) -> Self {
        Self {
            sender,
            manager_cancel,
        }
    }
}
```

- [ ] **Step 3: Keep inbound classification behavior**

Ensure `classify_inbound` has this behavior:

```rust
fn classify_inbound(message: JSONRPCMessage) -> InboundClassification {
    match message {
        JSONRPCMessage::Request(request) => {
            if is_allowed_client_request_method(request.method.as_str()) {
                InboundClassification::ForwardRequest(request)
            } else {
                InboundClassification::RejectPolicy
            }
        }
        JSONRPCMessage::Notification(notification) => {
            if is_allowed_client_notification_method(notification.method.as_str()) {
                InboundClassification::ForwardNotification(notification)
            } else {
                InboundClassification::Drop
            }
        }
        JSONRPCMessage::Response(_) | JSONRPCMessage::Error(_) => InboundClassification::Drop,
    }
}
```

- [ ] **Step 4: Keep outbound normalization behavior**

Ensure `normalize_outbound_text` accepts app-server response/error envelopes, adds missing `jsonrpc: "2.0"`, accepts only allowlisted server notifications, and returns `None` for malformed or policy-rejected text:

```rust
fn normalize_outbound_text(text: &str) -> Option<String> {
    let value = serde_json::from_str::<Value>(text).ok()?;
    let Value::Object(mut object) = value else {
        return None;
    };

    match object.get("jsonrpc").and_then(Value::as_str) {
        Some(JSONRPC_VERSION) => {}
        Some(_) => return None,
        None => {
            object.insert(
                "jsonrpc".to_string(),
                Value::String(JSONRPC_VERSION.to_string()),
            );
        }
    }

    if outbound_object_is_allowed(&object) {
        Some(Value::Object(object).to_string())
    } else {
        None
    }
}
```

- [ ] **Step 5: Keep bridge lifecycle around handle drop**

Ensure `GuiBackend::connect` follows this shape:

```rust
impl GuiBackend for GuiTransportBackend {
    fn connect(
        &self,
        connection: AuthenticatedGuiConnection,
    ) -> impl std::future::Future<Output = anyhow::Result<()>> + Send {
        let sender = self.sender.clone();
        let manager_cancel = self.manager_cancel.clone();

        async move {
            let AuthenticatedGuiConnection {
                mut inbound_rx,
                outbound_tx,
            } = connection;

            let mut handle = tokio::select! {
                _ = manager_cancel.cancelled() => return Ok(()),
                result = sender.register_extra_connection() => result.map_err(|err| {
                    anyhow::anyhow!("register GUI extra connection failed: {err}")
                })?,
            };

            let command_sender = handle.command_sender.clone();
            let outgoing_tx_for_parse_error = handle.outgoing_tx.clone();
            let disconnect_token = handle.disconnect_token.clone();
            let (_noop_tx, noop_rx) = mpsc::channel::<String>(1);
            let outgoing_rx = std::mem::replace(&mut handle.outgoing_rx, noop_rx);

            let mut inbound_task = tokio::spawn({
                let disconnect_token = disconnect_token.clone();
                let manager_cancel = manager_cancel.clone();
                async move {
                    pump_inbound(
                        &mut inbound_rx,
                        &command_sender,
                        &outgoing_tx_for_parse_error,
                        disconnect_token,
                        manager_cancel,
                    )
                    .await
                }
            });

            let mut outbound_task = tokio::spawn(pump_outbound(
                outgoing_rx,
                outbound_tx,
                disconnect_token.clone(),
                manager_cancel,
            ));

            let (inbound_result, outbound_result) = match tokio::select! {
                inbound = &mut inbound_task => PumpWinner::Inbound(inbound),
                outbound = &mut outbound_task => PumpWinner::Outbound(outbound),
            } {
                PumpWinner::Inbound(inbound) => {
                    disconnect_token.cancel();
                    let outbound =
                        match tokio::time::timeout(OUTBOUND_DRAIN_BUDGET, &mut outbound_task).await
                        {
                            Ok(joined) => joined,
                            Err(_) => {
                                outbound_task.abort();
                                (&mut outbound_task).await
                            }
                        };
                    (inbound, outbound)
                }
                PumpWinner::Outbound(outbound) => {
                    disconnect_token.cancel();
                    let inbound = (&mut inbound_task).await;
                    (inbound, outbound)
                }
            };

            drop(handle);

            match inbound_result {
                Ok(Ok(())) => {}
                Ok(Err(err)) => return Err(err),
                Err(err) => return Err(anyhow::anyhow!("GUI inbound pump join error: {err}")),
            }
            if let Err(err) = outbound_result
                && !err.is_cancelled()
            {
                tracing::warn!("GUI outbound pump join error: {err}");
            }
            Ok(())
        }
    }
}
```

- [ ] **Step 6: Verify unit filters**

Run from `codex-rs`:

```bash
just test -p codex-app-server allowlisted_request_passes_filter
just test -p codex-app-server outbound_app_server_response_is_normalized_for_browser
just test -p codex-app-server outbound_allowlisted_notification_is_normalized_for_browser
```

Expected: all three targeted tests pass.

## Task 3: Implement `GuiTransportBackend` runtime bridge tests

**Files:**
- Modify: `codex-rs/app-server/src/gui_transport.rs`

- [ ] **Step 1: Keep the initialize roundtrip test**

Ensure `codex-rs/app-server/src/gui_transport.rs` includes this test:

```rust
#[tokio::test]
async fn backend_round_trips_initialize() {
    let TestRuntime {
        client,
        _codex_home,
    } = start_test_runtime(SessionSource::Cli).await;
    let backend = GuiTransportBackend::new(client.sender(), CancellationToken::new());
    let (connection, inbound_tx, mut outbound_rx) = AuthenticatedGuiConnection::new();
    let backend_task = tokio::spawn(async move { backend.connect(connection).await });

    inbound_tx
        .send(
            serde_json::json!({
                "jsonrpc": "2.0",
                "id": 7,
                "method": "initialize",
                "params": {
                    "clientInfo": {
                        "name": "gui-transport-test",
                        "title": null,
                        "version": "0.0.0"
                    },
                    "capabilities": null
                }
            })
            .to_string(),
        )
        .await
        .expect("send initialize");

    let outbound = tokio::time::timeout(Duration::from_secs(2), outbound_rx.recv())
        .await
        .expect("outbound response should arrive")
        .expect("outbound channel should stay open");
    let parsed: serde_json::Value =
        serde_json::from_str(&outbound).expect("outbound should be JSON");
    assert_eq!(parsed["jsonrpc"], serde_json::json!("2.0"));
    assert_eq!(parsed["id"], serde_json::json!(7));
    assert!(
        parsed.get("result").is_some() || parsed.get("error").is_some(),
        "initialize response must be a response or error: {parsed}"
    );

    drop(inbound_tx);
    backend_task
        .await
        .expect("backend task should join")
        .expect("backend should exit cleanly");
    client.shutdown().await.expect("runtime shutdown");
}
```

- [ ] **Step 2: Keep the malformed inbound frame test**

Ensure the same test module includes:

```rust
#[tokio::test]
async fn backend_exits_after_parse_error_for_invalid_inbound_frame() {
    let TestRuntime {
        client,
        _codex_home,
    } = start_test_runtime(SessionSource::Cli).await;
    let backend = GuiTransportBackend::new(client.sender(), CancellationToken::new());
    let (connection, inbound_tx, mut outbound_rx) = AuthenticatedGuiConnection::new();
    let backend_task = tokio::spawn(async move { backend.connect(connection).await });

    inbound_tx
        .send("{not-json".to_string())
        .await
        .expect("send invalid JSON");

    let outbound = tokio::time::timeout(Duration::from_secs(2), outbound_rx.recv())
        .await
        .expect("parse error should arrive")
        .expect("outbound channel should stay open");
    let parsed: serde_json::Value =
        serde_json::from_str(&outbound).expect("parse error should be JSON");
    assert_eq!(parsed["jsonrpc"], serde_json::json!("2.0"));
    assert_eq!(parsed["id"], serde_json::Value::Null);
    assert_eq!(parsed["error"]["code"], serde_json::json!(-32700));

    tokio::time::timeout(Duration::from_secs(2), backend_task)
        .await
        .expect("backend task should exit after parse error")
        .expect("backend task should join")
        .expect("backend should exit cleanly");
    assert!(
        inbound_tx
            .send(
                serde_json::json!({
                    "jsonrpc": "2.0",
                    "id": 8,
                    "method": "initialize",
                    "params": {}
                })
                .to_string()
            )
            .await
            .is_err(),
        "backend should drop the inbound receiver after parse error",
    );
    assert_eq!(outbound_rx.recv().await, None);
    client.shutdown().await.expect("runtime shutdown");
}
```

- [ ] **Step 3: Adapt test runtime construction to current `InProcessStartArgs`**

The old branch test helper must include the current `strict_config` field:

```rust
let args = InProcessStartArgs {
    arg0_paths: Arg0DispatchPaths::default(),
    config,
    cli_overrides: Vec::new(),
    loader_overrides: LoaderOverrides::default(),
    strict_config: false,
    cloud_requirements: CloudRequirementsLoader::default(),
    thread_config_loader: Arc::new(codex_config::NoopThreadConfigLoader),
    feedback: CodexFeedback::new(),
    log_db: None,
    state_db: Some(state_db),
    environment_manager: Arc::new(EnvironmentManager::default_for_tests()),
    config_warnings: Vec::new(),
    session_source,
    enable_codex_api_key_env: false,
    initialize: InitializeParams {
        client_info: ClientInfo {
            name: "gui-transport-test".to_string(),
            title: None,
            version: "0.0.0".to_string(),
        },
        capabilities: None,
    },
    channel_capacity: DEFAULT_IN_PROCESS_CHANNEL_CAPACITY,
};
```

- [ ] **Step 4: Verify runtime bridge behavior**

Run from `codex-rs`:

```bash
just test -p codex-app-server backend_round_trips_initialize
just test -p codex-app-server backend_exits_after_parse_error_for_invalid_inbound_frame
```

Expected: both tests pass.

## Task 4: Implement `GuiHostManager`

**Files:**
- Modify: `codex-rs/app-server/src/gui_host.rs`

- [ ] **Step 1: Restore old branch implementation as the starting point**

Run from repo root:

```bash
git restore --source port/lazy-proj-130 -- codex-rs/app-server/src/gui_host.rs
```

Expected: `codex-rs/app-server/src/gui_host.rs` is populated from the old branch.

- [ ] **Step 2: Keep manager public API limited**

Ensure `GuiHostManager` exposes only the lifecycle surface needed by later app-server-client facade wiring:

```rust
pub struct GuiHostManager {
    inner: AsyncMutex<GuiHostInner>,
    host_cancel: OnceLock<CancellationToken>,
    stopped: AtomicBool,
    cancel_token: CancellationToken,
    sender: InProcessClientSender,
}
```

Required public methods:

```rust
impl GuiHostManager {
    pub fn new(sender: InProcessClientSender) -> Self;

    pub fn cancel_nonblocking(&self);

    pub async fn launch_url_for_thread(
        self: &Arc<Self>,
        primary_thread_id: &str,
    ) -> anyhow::Result<String>;

    pub async fn shutdown(self: Arc<Self>);
}
```

No app-server-client type appears in this file.

- [ ] **Step 3: Preserve lazy-start / reuse behavior**

Ensure `launch_url_for_thread` returns a URL from an already-ready host without restarting:

```rust
GuiHostState::Ready(handle) => {
    return Ok(handle.launch_url_for_thread(primary_thread_id));
}
```

Ensure the start path constructs the bridge backend with a child cancellation token:

```rust
let backend = GuiTransportBackend::new(
    self.sender.clone(),
    self.cancel_token.child_token(),
);
let start_result = GuiHost::start(GuiHostConfig { mode }, backend)
    .await
    .context("start GUI host");
```

- [ ] **Step 4: Preserve nonblocking cancellation**

Ensure `cancel_nonblocking` cancels both the manager token and the host cancel token if a host has started:

```rust
pub fn cancel_nonblocking(&self) {
    if self.stopped.swap(true, Ordering::AcqRel) {
        return;
    }
    self.cancel_token.cancel();
    if let Some(host_cancel) = self.host_cancel.get() {
        host_cancel.cancel();
    }
}
```

- [ ] **Step 5: Adapt test runtime construction to current `InProcessStartArgs`**

As in `gui_transport.rs`, add `strict_config: false` to the `InProcessStartArgs` used by `gui_host.rs` tests.

- [ ] **Step 6: Verify manager behavior**

Run from `codex-rs`:

```bash
just test -p codex-app-server launch_url_for_thread_reuses_single_host_and_token
```

Expected: test passes and proves same host/port/token reused while `threadId` differs per call.

## Task 5: Final verification and implementation commit

**Files:**
- Verify: `codex-rs/app-server/Cargo.toml`
- Verify: `codex-rs/app-server/src/lib.rs`
- Verify: `codex-rs/app-server/src/gui_host.rs`
- Verify: `codex-rs/app-server/src/gui_transport.rs`

- [ ] **Step 1: Run format**

Run from `codex-rs`:

```bash
just fmt
```

Expected: command succeeds.

- [ ] **Step 2: Run scoped tests**

Run from `codex-rs`:

```bash
just test -p codex-app-server gui_transport
just test -p codex-app-server gui_host
just test -p codex-app-server backend_round_trips_initialize
just test -p codex-app-server launch_url_for_thread_reuses_single_host_and_token
```

Expected: all targeted tests pass. If a filter matches no tests, inspect test names before broadening.

- [ ] **Step 3: Run scoped lint fix**

Run from `codex-rs`:

```bash
just fix -p codex-app-server
```

Expected: command succeeds. Do not re-run tests after `fix` unless the command makes a functional edit that needs investigation.

- [ ] **Step 4: Check boundaries**

Run from repo root:

```bash
git diff --name-only HEAD | sort
rg -n "TransportEvent|ConnectionOrigin::GuiHost|start_remote_control|run_main_with_transport_options" codex-rs/app-server/src/gui_host.rs codex-rs/app-server/src/gui_transport.rs
rg -n "gui|websocket|origin|token|allowlist|browser" codex-rs/app-server/src/in_process.rs
```

Expected:

- `git diff --name-only HEAD | sort` lists only:
  - `codex-rs/Cargo.lock`
  - `codex-rs/app-server/Cargo.toml`
  - `codex-rs/app-server/src/gui_host.rs`
  - `codex-rs/app-server/src/gui_transport.rs`
  - `codex-rs/app-server/src/lib.rs`
  - `codex-rs/app-server/BUILD.bazel` only if explicit deps required an edit
- first `rg` has no output
- second `rg` has no new GUI/security-policy hits introduced by this plan; existing comments unrelated to GUI host may be ignored after inspection

- [ ] **Step 5: Run whitespace check**

Run from repo root:

```bash
git diff --check
```

Expected: no output.

- [ ] **Step 6: Commit implementation**

```bash
git add codex-rs/Cargo.lock codex-rs/app-server/Cargo.toml codex-rs/app-server/src/lib.rs codex-rs/app-server/src/gui_host.rs codex-rs/app-server/src/gui_transport.rs
git add codex-rs/app-server/BUILD.bazel
git commit -m "feat(gui-host): add app-server bridge"
```

If `BUILD.bazel` is unchanged, omit it from `git add`.

## Acceptance Gates

- `codex-app-server` depends on `codex-gui-host`; `codex-gui-host` still has no app-server dependency.
- `GuiHostManager` lazy-starts a single local GUI host and reuses host/port/token across multiple `threadId` launch URLs.
- `GuiHostManager::cancel_nonblocking` is sync-safe and wakes manager/host shutdown.
- `GuiTransportBackend` calls `register_extra_connection` only after `codex-gui-host` has authenticated the browser connection.
- Inbound `initialize` reaches existing in-process app-server runtime and produces a response/error envelope.
- Malformed browser JSON gets one JSON-RPC parse error then terminates the bridge.
- Outbound app-server responses are normalized with `jsonrpc: "2.0"` for browser consumption.
- Outbound server notifications are filtered to `thread/projection/event`.
- The bridge drops `ExtraConnectionHandle` on normal termination paths.
- No `TransportEvent` producer, `ConnectionOrigin::GuiHost` path, external process backend, app-server-client facade, TUI command, or frontend code is added by this plan.
- `in_process.rs` remains GUI-agnostic and contains no new GUI/WebSocket/Origin/token/allowlist/browser concepts.

## Self-Review Checklist

- [ ] This plan starts from current `dev` state, not old branch assumptions.
- [ ] App-server-client wiring is not included; it belongs to `04-app-server-client-facade.md`.
- [ ] TUI `/gui` wiring is not included; it belongs to `05-tui-gui-command.md`.
- [ ] Frontend handshake/store work is not included; it belongs to `06-frontend-handshake-and-store.md`.
- [ ] `gui_transport.rs` uses public extra connection surface only.
- [ ] `gui_host.rs` does not import app-server-client or TUI types.
- [ ] Verification commands use `just`, not direct `cargo test`.
- [ ] No Bazel or remote verification is required locally for this plan.
