# GUI Host Network Access Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `codex-gui-host` default to network-reachable local GUI URLs while preserving exact Host / Origin and token security.

**Architecture:** This plan is limited to `codex-gui-host`. It adds structured launch URL entries, private-interface address discovery, `0.0.0.0` binding, HTTP Host validation, and WebSocket Host / Origin validation. Upper-layer app-server/client/TUI propagation stays in `11-default-network-launch-integration.md`.

**Tech Stack:** Rust 2024, axum, tokio, libc `getifaddrs` on Unix, `windows-sys` Win32 IP Helper API on Windows, reqwest, tokio-tungstenite, pretty_assertions.

---

## Source Design

- `docs/superpowers/specs/2026-06-08-codex-gui-host-default-network-access-design.md`

## Files

- Modify: `codex-rs/gui-host/Cargo.toml`
- Create: `codex-rs/gui-host/src/net.rs`
- Modify: `codex-rs/gui-host/src/url.rs`
- Modify: `codex-rs/gui-host/src/host.rs`
- Modify: `codex-rs/gui-host/src/ws.rs`
- Modify: `codex-rs/gui-host/src/lib.rs`

Do not modify app-server, app-server-client, TUI, frontend, or old design docs in this plan.

## Task 1: Add Structured Launch URL Types

**Files:**
- Modify: `codex-rs/gui-host/src/url.rs`
- Modify: `codex-rs/gui-host/src/lib.rs`

- [ ] **Step 1: Add failing URL type tests**

In `url.rs` tests, add coverage for Local/LAN/VPN ordering and shared token:

```rust
#[test]
fn launch_urls_use_advertised_hosts_in_order() {
    let token = LaunchToken::from_test_value("test-token");
    let hosts = vec![
        AdvertisedHost::new(GuiLaunchUrlKind::Local, "Local", "127.0.0.1"),
        AdvertisedHost::new(GuiLaunchUrlKind::Lan, "LAN", "192.168.3.165"),
        AdvertisedHost::new(GuiLaunchUrlKind::Vpn, "VPN", "100.88.28.119"),
    ];

    let urls = launch_urls_for_thread(4567, &hosts, "thread abc/#", &token);

    assert_eq!(
        urls.entries,
        vec![
            GuiLaunchUrlEntry::new(GuiLaunchUrlKind::Local, "Local", "http://127.0.0.1:4567/?threadId=thread%20abc%2F%23#token=test-token"),
            GuiLaunchUrlEntry::new(GuiLaunchUrlKind::Lan, "LAN", "http://192.168.3.165:4567/?threadId=thread%20abc%2F%23#token=test-token"),
            GuiLaunchUrlEntry::new(GuiLaunchUrlKind::Vpn, "VPN", "http://100.88.28.119:4567/?threadId=thread%20abc%2F%23#token=test-token"),
        ]
    );
}
```

- [ ] **Step 2: Run test and confirm failure**

Run from `codex-rs`:

```bash
just test -p codex-gui-host launch_urls_use_advertised_hosts_in_order
```

Expected: FAIL because `AdvertisedHost`, `GuiLaunchUrls`, and `launch_urls_for_thread` do not exist yet.

- [ ] **Step 3: Implement URL types**

In `url.rs`, define:

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GuiLaunchUrlKind {
    Local,
    Lan,
    Vpn,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AdvertisedHost {
    pub kind: GuiLaunchUrlKind,
    pub label: String,
    pub host: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GuiLaunchUrlEntry {
    pub kind: GuiLaunchUrlKind,
    pub label: String,
    pub url: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GuiLaunchUrls {
    pub entries: Vec<GuiLaunchUrlEntry>,
}
```

Add constructors for `AdvertisedHost::new(...)` and `GuiLaunchUrlEntry::new(...)`.

Add:

```rust
pub fn launch_urls_for_thread(
    port: u16,
    hosts: &[AdvertisedHost],
    thread_id: impl std::fmt::Display,
    token: &LaunchToken,
) -> GuiLaunchUrls
```

Keep existing `launch_url_for_thread(...) -> String` for compatibility with upper layers until Plan 11.

- [ ] **Step 4: Export new URL types**

In `lib.rs`, export:

```rust
pub use url::AdvertisedHost;
pub use url::GuiLaunchUrlEntry;
pub use url::GuiLaunchUrlKind;
pub use url::GuiLaunchUrls;
pub use url::launch_urls_for_thread;
```

- [ ] **Step 5: Run focused URL tests**

Run:

```bash
just test -p codex-gui-host launch_url
```

Expected: PASS.

## Task 2: Add Address Classification and Discovery

**Files:**
- Modify: `codex-rs/gui-host/Cargo.toml`
- Create: `codex-rs/gui-host/src/net.rs`
- Modify: `codex-rs/gui-host/src/lib.rs`

- [ ] **Step 1: Add platform-specific network dependencies**

In `codex-rs/gui-host/Cargo.toml`, add:

```toml
[target.'cfg(unix)'.dependencies]
libc = { workspace = true }

[target.'cfg(windows)'.dependencies]
windows-sys = { version = "0.52", features = [
    "Win32_Foundation",
    "Win32_NetworkManagement_IpHelper",
    "Win32_Networking_WinSock",
] }
```

Expected: `Cargo.lock` may add these dependencies to the `codex-gui-host` package dependency list, but should not introduce new resolved versions already present elsewhere in the workspace lockfile.

- [ ] **Step 2: Create `net.rs` with pure classification tests**

Create `codex-rs/gui-host/src/net.rs` with tests for:

```rust
#[test]
fn classifies_private_lan_ipv4() { /* 192.168.3.165 -> Lan */ }

#[test]
fn classifies_cgnat_ipv4_as_vpn() { /* 100.88.28.119 -> Vpn */ }

#[test]
fn classifies_ula_ipv6_as_vpn_candidate() { /* fd7a:... -> Vpn */ }

#[test]
fn rejects_public_and_link_local_addresses() { /* 8.8.8.8, 169.254.1.1, fe80::1 */ }

#[test]
fn selects_one_lan_and_one_vpn_candidate() { /* Local -> LAN -> VPN */ }

#[test]
fn selects_lan_fallback_when_default_route_unknown() { /* first active RFC1918 IPv4 */ }

#[test]
fn does_not_advertise_ula_when_ipv6_disabled() { /* ULA classified but no URL */ }
```

- [ ] **Step 3: Implement pure classification**

Add internal types:

```rust
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct InterfaceAddress {
    pub(crate) name: String,
    pub(crate) ip: std::net::IpAddr,
    pub(crate) is_default_route: bool,
    pub(crate) is_active: bool,
    pub(crate) is_loopback: bool,
}
```

Add functions:

```rust
pub(crate) fn advertised_hosts_from_interfaces(
    interfaces: &[InterfaceAddress],
    include_ipv6: bool,
) -> Vec<AdvertisedHost>
```

Rules:

- Always include `Local`.
- Pick LAN from `is_default_route == true` and RFC1918 IPv4.
- If no default-route LAN is available, pick the first active RFC1918 IPv4 as LAN.
- Pick VPN from CGNAT IPv4 first. ULA IPv6 is only eligible when `include_ipv6` is true.
- Return entries sorted Local -> LAN -> VPN.

- [ ] **Step 4: Implement platform discovery collectors**

Add platform collectors that return `Vec<InterfaceAddress>`:

- `#[cfg(unix)]`: use `libc::getifaddrs` to gather active IPv4/IPv6 interface addresses.
- `#[cfg(windows)]`: use Win32 IP Helper API `GetAdaptersAddresses` to gather active adapter IPv4/IPv6 addresses.
- Other platforms or collector errors: return an empty list and let selection fall back to Local.

For MVP default-route detection, collectors may leave `is_default_route = false` when reliable platform route lookup is not available. The pure selector must then choose the first active RFC1918 IPv4 as LAN. Tests must cover selection via injected `InterfaceAddress` so real host networking is not required for correctness.

Expose:

```rust
pub(crate) fn discover_advertised_hosts(include_ipv6: bool) -> Vec<AdvertisedHost>
```

On discovery error, return only `Local`.

- [ ] **Step 5: Wire module**

In `lib.rs`, add:

```rust
mod net;
```

- [ ] **Step 6: Run net tests**

Run:

```bash
just test -p codex-gui-host net::
```

Expected: PASS.

## Task 3: Bind to All IPv4 Interfaces and Store Advertised Hosts

**Files:**
- Modify: `codex-rs/gui-host/src/host.rs`
- Modify: `codex-rs/gui-host/src/url.rs`

- [ ] **Step 1: Update bind test**

Rename `binds_loopback_ephemeral_port` to `binds_unspecified_ipv4_ephemeral_port` and change the assertion:

```rust
assert_eq!(handle.local_addr().ip(), std::net::Ipv4Addr::UNSPECIFIED);
```

- [ ] **Step 2: Run test and confirm failure**

Run:

```bash
just test -p codex-gui-host binds_unspecified_ipv4_ephemeral_port
```

Expected: FAIL while `GuiHost::start` still binds loopback.

- [ ] **Step 3: Update host state**

Add to `GuiHostHandle` and `GuiHostState`:

```rust
advertised_hosts: Vec<AdvertisedHost>,
```

Add handle method:

```rust
pub fn launch_urls_for_thread(&self, thread_id: impl Display) -> GuiLaunchUrls
```

Keep `launch_url_for_thread` returning the first entry URL for compatibility until Plan 11.

- [ ] **Step 4: Bind `0.0.0.0`**

Change:

```rust
TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, 0)).await?
```

to:

```rust
TcpListener::bind((std::net::Ipv4Addr::UNSPECIFIED, 0)).await?
```

After obtaining `local_addr`, call `net::discover_advertised_hosts(/*include_ipv6*/ false)`.

- [ ] **Step 5: Add deterministic test start helper**

Under `#[cfg(test)]`, add:

```rust
async fn start_with_advertised_hosts_for_test<B>(
    config: GuiHostConfig,
    backend: B,
    advertised_hosts: Vec<AdvertisedHost>,
) -> io::Result<GuiHostHandle>
where
    B: GuiBackend + Clone
```

Use this helper for tests that need stable Local/LAN/VPN entries.

- [ ] **Step 6: Run host bind test**

Run:

```bash
just test -p codex-gui-host binds_unspecified_ipv4_ephemeral_port
```

Expected: PASS.

## Task 4: Enforce HTTP Host and WebSocket Host / Origin Allowlist

**Files:**
- Modify: `codex-rs/gui-host/src/host.rs`
- Modify: `codex-rs/gui-host/src/ws.rs`

- [ ] **Step 1: Add allowlist tests**

Add tests that start a host with Local/LAN/VPN advertised hosts and assert:

- prod root succeeds with `Host: 127.0.0.1:<port>`
- prod root returns `403` with `Host: localhost:<port>`
- `/ws` succeeds only when Host and Origin match the same advertised origin
- `/ws` rejects missing Origin
- `/ws` rejects unadvertised private IP

- [ ] **Step 2: Run tests and confirm failure**

Run:

```bash
just test -p codex-gui-host host_rejects_unadvertised_http_host
just test -p codex-gui-host ws_rejects_unadvertised_origin
```

Expected: FAIL because current HTTP assets do not validate Host and `/ws` only checks `127.0.0.1`.

- [ ] **Step 3: Add Host allowlist helper**

In `host.rs`, add a request middleware that reads `Host` and checks it against `state.advertised_hosts` plus the runtime port.

Expected behavior:

- missing Host -> `403`
- Host not in advertised entries -> `403`
- matching Host -> continue

- [ ] **Step 4: Update WebSocket validation**

Replace `validate_host_and_origin(local_addr, host, origin)` with:

```rust
pub(crate) fn validate_host_and_origin(
    advertised_hosts: &[AdvertisedHost],
    port: u16,
    host: &str,
    origin: Option<&str>,
) -> bool
```

The function must require Host and Origin to match the same advertised origin exactly.

- [ ] **Step 5: Run allowlist tests**

Run:

```bash
just test -p codex-gui-host host_
just test -p codex-gui-host ws_
```

Expected: PASS.

## Task 5: Final Verification and Scope Check

**Files:**
- Verify only this plan's files changed.

- [ ] **Step 1: Run focused crate tests**

Run from `codex-rs`:

```bash
just test -p codex-gui-host
```

Expected: PASS.

- [ ] **Step 2: Run formatting**

Run from `codex-rs`:

```bash
just fmt
```

Expected: PASS.

- [ ] **Step 3: Run scoped fix**

Run from `codex-rs`:

```bash
just fix -p codex-gui-host
```

Expected: PASS. If this fails with the known `failed to bind TCP listener to manage locking` environment error, record the error and run plain scoped clippy instead:

```bash
cargo clippy -p codex-gui-host --all-targets -- -D warnings
```

- [ ] **Step 4: Refresh lockfiles if needed**

Because this plan changes `codex-rs/gui-host/Cargo.toml`, run from repo root:

```bash
just bazel-lock-update
just bazel-lock-check
```

Expected: PASS.

- [ ] **Step 5: Scope check**

Run:

```bash
git diff --name-only
```

Expected paths for this plan only:

```text
MODULE.bazel.lock
codex-rs/Cargo.lock
codex-rs/gui-host/Cargo.toml
codex-rs/gui-host/src/lib.rs
codex-rs/gui-host/src/net.rs
codex-rs/gui-host/src/url.rs
codex-rs/gui-host/src/host.rs
codex-rs/gui-host/src/ws.rs
```

- [ ] **Step 6: Commit**

```bash
git add MODULE.bazel.lock codex-rs/Cargo.lock codex-rs/gui-host/Cargo.toml codex-rs/gui-host/src/lib.rs codex-rs/gui-host/src/net.rs codex-rs/gui-host/src/url.rs codex-rs/gui-host/src/host.rs codex-rs/gui-host/src/ws.rs
git commit -m "feat(gui-host): add default network access core"
```
