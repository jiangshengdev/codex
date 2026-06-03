# Codex GUI Host Crate Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 收口 `codex-gui-host` host shell，使它在当前 `dev` / `rust-v0.136.0` 边界内提供 browser-safe HTTP assets、same-origin `/ws`、launch token、Host / Origin 校验和 JSON-RPC allowlist。

**Architecture:** 本计划只恢复和验证 `codex-rs/gui-host` crate 及必要 workspace wiring。`codex-gui-host` 只定义 host shell、launch URL、security boundary 和 `GuiBackend` contract，不依赖 `codex-app-server`，也不接入 app-server runtime。认证后的 app-server bridge、app-server-client facade、TUI `/gui` 和 frontend follow-up 均留给后续计划。

**Tech Stack:** Rust 2024, axum, tokio, tokio-tungstenite, tower-http, reqwest, base64, rand, serde_json, Bazel crate metadata.

---

## Scope

本计划执行 `00-roadmap.md` 中的 `02 gui-host crate recovery`，并以 `01-gui-host-crate.md` 的 `Audit Results` 为 gate 输入。

允许修改：

- `codex-rs/Cargo.toml`
- `codex-rs/Cargo.lock`
- `MODULE.bazel.lock`
- `codex-rs/gui-host/Cargo.toml`
- `codex-rs/gui-host/BUILD.bazel`
- `codex-rs/gui-host/src/lib.rs`
- `codex-rs/gui-host/src/backend.rs`
- `codex-rs/gui-host/src/token.rs`
- `codex-rs/gui-host/src/config.rs`
- `codex-rs/gui-host/src/url.rs`
- `codex-rs/gui-host/src/filter.rs`
- `codex-rs/gui-host/src/assets.rs`
- `codex-rs/gui-host/src/host.rs`
- `codex-rs/gui-host/src/ws.rs`
- `codex-rs/gui-host/tests/prod_serves_hashed_asset.rs`

不允许修改：

- `codex-rs/app-server/**`
- `codex-rs/app-server-client/**`
- `codex-rs/tui/**`
- `codex-gui/**`
- `codex-rs/core/**`
- `docs/superpowers/plans/2026-05-30-gui-host/03-*`

停止条件：

- 如果需要让 `codex-gui-host` 依赖 `codex-app-server`，停止。
- 如果需要在本计划中实现 app-server bridge、extra connection、`GuiHostManager` 或 `/gui` TUI 命令，停止。
- 如果需要恢复 `open_extra_jsonrpc_connection`、`ExtraJsonRpcConnectionFactory` 或旧 `02-in-process-extra-connection.md`，停止。
- 如果实现要求重构 `rust-v0.136.0` app-server/runtime/projection 代码，停止。

## File Responsibilities

- `codex-rs/Cargo.toml`: workspace member 和 workspace dependency wiring；只允许加入 `gui-host` 及 host crate 所需 workspace dependencies。
- `codex-rs/gui-host/Cargo.toml`: `codex-gui-host` crate manifest；不得依赖 `codex-app-server`。
- `codex-rs/gui-host/BUILD.bazel`: Bazel crate target metadata；如新增 compile-time assets 或 test data，必须同步声明。
- `src/lib.rs`: private modules and explicit public exports。
- `src/backend.rs`: `AuthenticatedGuiConnection` text channels and `GuiBackend` RPITIT trait contract。
- `src/token.rs`: high-entropy URL-safe launch token generation。
- `src/config.rs`: dev/prod asset mode selection and environment parsing。
- `src/url.rs`: browser launch URL shape with query `threadId` and fragment token。
- `src/filter.rs`: JSON-RPC method allowlists for browser-to-server and server-to-browser traffic。
- `src/assets.rs`: dev Vite proxy, prod static asset serving, and frame protection headers。
- `src/host.rs`: loopback-only axum server lifecycle and route assembly。
- `src/ws.rs`: Host / Origin validation, first-frame `gui/authenticate`, allowlist filtering, and socket pump。
- `tests/prod_serves_hashed_asset.rs`: integration coverage for prod package-root static asset serving。

## Task 1: Confirm Baseline And Crate Boundary

**Files:**
- Verify: `docs/superpowers/plans/2026-05-30-gui-host/00-roadmap.md`
- Verify: `docs/superpowers/plans/2026-05-30-gui-host/01-gui-host-crate.md`
- Verify: `codex-rs/Cargo.toml`
- Verify: `codex-rs/gui-host/**`

- [x] **Step 1: Confirm prior gate recommends this plan**

Run from repo root:

```bash
rg -n "Recommended next plan: `02-gui-host-crate.md`|Not allowed yet: app-server bridge implementation" \
  docs/superpowers/plans/2026-05-30-gui-host/01-gui-host-crate.md
```

Expected: output includes both the `02-gui-host-crate.md` recommendation and the app-server bridge prohibition.

- [x] **Step 2: Confirm expected host crate files are present**

Run from repo root:

```bash
for f in \
  codex-rs/gui-host/Cargo.toml \
  codex-rs/gui-host/BUILD.bazel \
  codex-rs/gui-host/src/lib.rs \
  codex-rs/gui-host/src/backend.rs \
  codex-rs/gui-host/src/token.rs \
  codex-rs/gui-host/src/config.rs \
  codex-rs/gui-host/src/url.rs \
  codex-rs/gui-host/src/filter.rs \
  codex-rs/gui-host/src/assets.rs \
  codex-rs/gui-host/src/host.rs \
  codex-rs/gui-host/src/ws.rs; do
  test -s "$f" && echo "ok $f" || echo "missing $f"
done
```

Expected: every line starts with `ok`.

- [x] **Step 3: Confirm workspace wiring exists**

Run from repo root:

```bash
rg -n '"gui-host"|codex-gui-host = \{ path = "gui-host" \}|tower-http|tokio-tungstenite|urlencoding' codex-rs/Cargo.toml
```

Expected: output shows `gui-host` in workspace members, `codex-gui-host` in workspace dependencies, and the dependencies used by the host crate.

- [x] **Step 4: Confirm host crate does not depend on app-server**

Run from repo root:

```bash
rg -n "codex-app-server|codex_app_server|app-server-client|codex-app-server-client|codex-tui|codex-core" codex-rs/gui-host
```

Expected: no output.

If this command returns matches outside comments or plan text, stop and remove that dependency direction before continuing.

## Task 2: Public API And Backend Contract

**Files:**
- Modify: `codex-rs/gui-host/src/lib.rs`
- Modify: `codex-rs/gui-host/src/backend.rs`

- [x] **Step 1: Confirm public exports are explicit**

Run from repo root:

```bash
sed -n '1,80p' codex-rs/gui-host/src/lib.rs
```

Expected: modules are private except `pub(crate) mod ws`, and public API is exported with explicit `pub use` statements for `AuthenticatedGuiConnection`, `GuiBackend`, config types, filter helpers, `GuiHost`, `GuiHostHandle`, `LaunchToken`, and `launch_url_for_thread`.

- [x] **Step 2: If exports are missing, update `lib.rs` to this shape**

```rust
mod assets;
mod backend;
mod config;
mod filter;
mod host;
mod token;
mod url;
pub(crate) mod ws;

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
```

- [x] **Step 3: Confirm `GuiBackend` uses RPITIT with explicit `Send` future bound**

Run from repo root:

```bash
sed -n '1,120p' codex-rs/gui-host/src/backend.rs
```

Expected: `GuiBackend` has a doc comment and this method shape:

```rust
pub trait GuiBackend: Send + Sync + 'static {
    fn connect(
        &self,
        connection: AuthenticatedGuiConnection,
    ) -> impl std::future::Future<Output = anyhow::Result<()>> + Send;
}
```

Do not use `#[async_trait]`. Do not add `#[allow(async_fn_in_trait)]`.

- [x] **Step 4: Run the focused backend contract test**

Run from `codex-rs`:

```bash
just test -p codex-gui-host authenticated_connection_channels_round_trip_text
```

Expected: the selected test passes.

## Task 3: Token, Config, And Launch URL Semantics

**Files:**
- Modify: `codex-rs/gui-host/src/token.rs`
- Modify: `codex-rs/gui-host/src/config.rs`
- Modify: `codex-rs/gui-host/src/url.rs`

- [x] **Step 1: Confirm launch token API and entropy source**

Run from repo root:

```bash
sed -n '1,120p' codex-rs/gui-host/src/token.rs
```

Expected: `LaunchToken::generate() -> std::io::Result<Self>` fills 32 random bytes with `OsRng.try_fill_bytes`, encodes with `URL_SAFE_NO_PAD`, and exposes `as_str()`.

- [x] **Step 2: Confirm config mode behavior**

Run from repo root:

```bash
sed -n '1,140p' codex-rs/gui-host/src/config.rs
```

Expected:

- `CODEX_GUI_HOST_MODE=dev` selects `GuiHostMode::Dev`.
- `CODEX_GUI_HOST_MODE=prod` selects `GuiHostMode::Prod`.
- invalid Unicode values return an error naming `CODEX_GUI_HOST_MODE`.
- missing or non-Unicode env values are treated like unset.
- debug builds default to dev, release builds default to prod.
- `CODEX_GUI_PACKAGE_ROOT` is required only for prod.

- [x] **Step 3: If config tests are incomplete, add these tests**

Add to `codex-rs/gui-host/src/config.rs` tests:

```rust
#[test]
fn invalid_mode_returns_error() {
    let error = GuiHostMode::for_profile_with_mode(Some("invalid".to_string()))
        .expect_err("invalid mode should fail");

    assert!(
        error
            .to_string()
            .contains("invalid CODEX_GUI_HOST_MODE value"),
        "{error:#}"
    );
}
```

Do not mutate process environment in tests.

- [x] **Step 4: Confirm launch URL shape**

Run from repo root:

```bash
sed -n '1,120p' codex-rs/gui-host/src/url.rs
```

Expected: launch URLs use `http://127.0.0.1:<port>/?threadId=<encoded>#token=<token>`. Token must stay in the fragment, not the query string.

- [x] **Step 5: Run focused token/config/url tests**

Run from `codex-rs`:

```bash
just test -p codex-gui-host generated_token_is_url_safe_and_has_entropy_length
just test -p codex-gui-host generate_returns_io_result
just test -p codex-gui-host invalid_mode_returns_error
just test -p codex-gui-host launch_url_uses_thread_query_and_fragment_token
```

Expected: all selected tests pass. If `invalid_mode_returns_error` was already covered under a different exact test name, run that exact test instead and record the substitution in the task summary.

## Task 4: Assets And Security Headers

**Files:**
- Modify: `codex-rs/gui-host/src/assets.rs`
- Modify: `codex-rs/gui-host/src/host.rs`
- Modify: `codex-rs/gui-host/tests/prod_serves_hashed_asset.rs`

- [x] **Step 1: Confirm prod assets use `package_root/dist`**

Run from repo root:

```bash
sed -n '1,80p' codex-rs/gui-host/src/assets.rs
```

Expected: `prod_dist_dir` and `prod_assets_service` derive paths from `ProdAssetConfig::dist_dir()`, and `ProdAssetConfig::dist_dir()` joins `package_root/dist`.

- [x] **Step 2: Confirm security headers are applied to prod root and static fallback**

Run from repo root:

```bash
rg -n "with_security_headers|add_security_headers|X_FRAME_OPTIONS|CONTENT_SECURITY_POLICY|fallback_service|map_response" \
  codex-rs/gui-host/src/assets.rs \
  codex-rs/gui-host/src/host.rs
```

Expected: prod root responses and `ServeDir` fallback responses receive `X-Frame-Options: DENY` and `Content-Security-Policy: frame-ancestors 'none'`.

- [x] **Step 3: Confirm dev mode remains a GUI-host origin proxy**

Run from repo root:

```bash
rg -n "proxy_vite|vite_origin|fallback|get\\(move \\|uri: Uri\\|" \
  codex-rs/gui-host/src/assets.rs \
  codex-rs/gui-host/src/host.rs
```

Expected: browser URL remains the GUI host URL, while dev assets proxy to `CODEX_GUI_VITE_URL` or `http://127.0.0.1:5173`.

- [x] **Step 4: Run focused asset tests**

Run from `codex-rs`:

```bash
just test -p codex-gui-host prod_dist_dir_requires_existing_dist
just test -p codex-gui-host prod_root_serves_index_with_security_headers
just test -p codex-gui-host prod_static_index_serves_security_headers
just test -p codex-gui-host prod_serves_hashed_asset_from_package_root
```

Expected: all selected tests pass.

## Task 5: WebSocket Authentication And Allowlist Semantics

**Files:**
- Modify: `codex-rs/gui-host/src/filter.rs`
- Modify: `codex-rs/gui-host/src/ws.rs`
- Modify: `codex-rs/gui-host/src/host.rs`

- [x] **Step 1: Confirm request and notification allowlists**

Run from repo root:

```bash
sed -n '1,120p' codex-rs/gui-host/src/filter.rs
```

Expected:

- browser request allowlist contains exactly `initialize`, `thread/projection/attach`, and `thread/projection/detach`.
- browser notifications are all rejected.
- server notification allowlist contains `thread/projection/event`.
- `gui/authenticate` is not in the app-server allowlist because it is local first-frame auth.

- [x] **Step 2: Confirm Host / Origin validation**

Run from repo root:

```bash
rg -n "validate_host_and_origin|expected_host|expected_origin|StatusCode::FORBIDDEN" codex-rs/gui-host/src/ws.rs
```

Expected: Host must be exactly `127.0.0.1:<port>` and Origin must be exactly `http://127.0.0.1:<port>`; missing or mismatched values return `403`.

- [x] **Step 3: Confirm first-frame authentication**

Run from repo root:

```bash
rg -n "AUTH_TIMEOUT|gui/authenticate|POLICY_VIOLATION|parse_authenticate_request|authenticate_response|auth_timeout" codex-rs/gui-host/src/ws.rs
```

Expected:

- production auth timeout is 5 seconds.
- first text frame must be `gui/authenticate`.
- valid auth returns `{"authenticated": true}` using the browser-provided id.
- invalid/missing/wrong-token auth closes with policy violation `1008`.
- failed auth does not construct `AuthenticatedGuiConnection` and does not call `GuiBackend::connect`.

- [x] **Step 4: Confirm post-auth browser filtering semantics**

Run from repo root:

```bash
rg -n "BrowserTextDisposition|RejectRequest|DropNotification|METHOD_NOT_FOUND|method_not_found_response|classify_browser_text" codex-rs/gui-host/src/ws.rs
```

Expected:

- non-allowlisted browser requests receive JSON-RPC `-32601` and the WebSocket stays open.
- non-allowlisted browser notifications are dropped without closing.
- browser Response/Error frames and malformed JSON-RPC close with policy violation.

- [x] **Step 5: Confirm backend-to-browser filtering semantics**

Run from repo root:

```bash
rg -n "is_allowed_backend_text|is_allowed_server_notification_method|has_result|has_error" codex-rs/gui-host/src/ws.rs
```

Expected:

- backend Response/Error messages with an `id` are forwarded.
- backend notification `thread/projection/event` is forwarded.
- other backend notifications are dropped.
- malformed backend text is dropped.

- [x] **Step 6: Run focused WebSocket tests**

Run from `codex-rs`:

```bash
just test -p codex-gui-host validates_exact_host_and_origin
just test -p codex-gui-host websocket_accepts_valid_authenticate_first_frame
just test -p codex-gui-host websocket_closes_1008_for_invalid_first_frame
just test -p codex-gui-host websocket_closes_1008_when_authenticate_times_out
just test -p codex-gui-host websocket_returns_403_when_origin_is_missing
just test -p codex-gui-host websocket_returns_403_when_host_does_not_match
just test -p codex-gui-host websocket_returns_403_when_origin_does_not_match
just test -p codex-gui-host browser_non_allowlisted_request_never_reaches_backend
just test -p codex-gui-host websocket_drops_disallowed_client_notification_without_closing
just test -p codex-gui-host two_browser_tabs_can_reuse_the_same_launch_token
```

Expected: all selected tests pass. Do not rewrite allowlist rejection into close-on-reject semantics.

## Task 6: Crate-Level Verification And Formatting

**Files:**
- Verify: `codex-rs/gui-host/**`
- Verify: `codex-rs/Cargo.toml`
- Verify: `codex-rs/Cargo.lock`
- Verify: `MODULE.bazel.lock`

- [x] **Step 1: Confirm no out-of-scope source files changed**

Run from repo root:

```bash
git diff --name-only | rg -v '^(codex-rs/Cargo.toml|codex-rs/Cargo.lock|MODULE.bazel.lock|codex-rs/gui-host/|docs/superpowers/plans/2026-05-30-gui-host/02-gui-host-crate.md)$'
```

Expected: no output.

- [x] **Step 2: Format Rust changes**

Run from `codex-rs`:

```bash
just fmt
```

Expected: command exits successfully. Do not rerun tests solely because `fmt` ran.

- [x] **Step 3: Run full gui-host crate tests**

Run from `codex-rs`:

```bash
just test -p codex-gui-host
```

Expected: all `codex-gui-host` tests pass.

- [x] **Step 4: Run scoped fix for gui-host**

Run from `codex-rs`:

```bash
just fix -p codex-gui-host
```

Expected: command exits successfully.

If this fails with `failed to bind TCP listener to manage locking` or `Operation not permitted (os error 1)`, treat it as an environment limitation and run this non-fixing fallback instead:

```bash
cargo clippy -p codex-gui-host --all-targets -- -D warnings
```

Expected fallback: clippy exits successfully.

Do not rerun tests after `fix` or `fmt`.

- [x] **Step 5: If dependency files changed, refresh and check Bazel lock**

Only run this step if `codex-rs/Cargo.toml` or `codex-rs/Cargo.lock` changed in this task.

Run from repo root:

```bash
just bazel-lock-update
just bazel-lock-check
```

Expected: both commands exit successfully, and `MODULE.bazel.lock` is included if it changes.

## Task 7: Completion Boundary

**Files:**
- Modify: `docs/superpowers/plans/2026-05-30-gui-host/02-gui-host-crate.md`

- [x] **Step 1: Record verification evidence in the implementation summary**

At execution time, the implementer must report:

- exact files changed.
- whether `codex-rs/Cargo.toml`, `codex-rs/Cargo.lock`, or `MODULE.bazel.lock` changed.
- exact verification commands run and their pass/fail status.
- if `just fix -p codex-gui-host` used the fallback clippy path, include the exact failure text that triggered the fallback.

- [x] **Step 2: Stop before bridge work**

After this plan is complete, stop. Do not create or execute app-server bridge changes in the same task.

Allowed next plan after this one:

- `03-bridge-boundary-decision.md`

Not allowed as part of this plan:

- `codex-rs/app-server/src/gui_host.rs`
- `codex-rs/app-server/src/gui_transport.rs`
- changes to `codex-rs/app-server/src/in_process.rs`
- changes to `codex-rs/app-server-client/src/gui.rs`
- changes to `codex-rs/tui/**`

## Implementation Summary

- Task 1 baseline confirmed: `01-gui-host-crate.md` gate output recommends `02-gui-host-crate.md` and still forbids app-server bridge implementation; expected gui-host files and workspace wiring exist; `codex-rs/gui-host` has no app-server, TUI, or core dependency matches.
- Task 2 required no code changes: `lib.rs` / `backend.rs` already satisfy explicit public exports and the RPITIT `GuiBackend` contract. `cd codex-rs && just test -p codex-gui-host authenticated_connection_channels_round_trip_text` passed; `just fmt` passed.
- Task 3 changed `codex-rs/gui-host/src/config.rs` and `codex-rs/gui-host/src/token.rs`; `url.rs` required no changes. Focused token/config/url tests passed: `generated_token_is_url_safe_and_has_entropy_length`, `generate_returns_io_result`, `invalid_mode_returns_error`, and `launch_url_uses_thread_query_and_fragment_token`. Follow-up config verification also passed: `invalid_mode_returns_error`, `non_unicode_mode_is_treated_like_unset`, and `unset_mode_resolves_for_build_profile`.
- Task 4 changed `codex-rs/gui-host/tests/prod_serves_hashed_asset.rs` to assert `x-frame-options` and `content-security-policy` on hashed asset responses; `assets.rs` / `host.rs` required no changes. Focused asset tests passed: `prod_dist_dir_requires_existing_dist`, `prod_root_serves_index_with_security_headers`, `prod_static_index_serves_security_headers`, and `prod_serves_hashed_asset_from_package_root`.
- Task 5 required no code changes: `filter.rs` / `ws.rs` / `host.rs` already satisfy allowlist, auth, and filtering semantics. All Task 5 focused WebSocket tests passed; `just fmt` passed.
- Task 6 fresh verification passed: `cd codex-rs && just fmt`; `cd codex-rs && just test -p codex-gui-host` with 43 tests run, 43 passed, 0 skipped, and bench smoke completed; `cd codex-rs && just fix -p codex-gui-host` passed without fallback clippy; `git diff --check` passed.
- Dependency files were not modified: `codex-rs/Cargo.toml`, `codex-rs/Cargo.lock`, and `MODULE.bazel.lock` stayed unchanged, so `just bazel-lock-update` and `just bazel-lock-check` were not run.
- Final code change set for this plan is limited to `codex-rs/gui-host/src/config.rs`, `codex-rs/gui-host/src/token.rs`, and `codex-rs/gui-host/tests/prod_serves_hashed_asset.rs`.
- Stop boundary preserved: no app-server bridge, app-server-client, TUI, or frontend work was executed.
