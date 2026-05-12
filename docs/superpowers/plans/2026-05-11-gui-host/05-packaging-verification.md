# Codex GUI Packaging Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Package GUI dist for prod mode and run final verification for the GUI host projection transport MVP.

**Architecture:** This plan owns package root wiring, Vite config, final Rust/frontend verification, dependency boundary checks, and lockfile checks. Verification follows the方案 B ownership split: app-server owns GUI host lifecycle and routes GUI JSON-RPC traffic through its own in-process extra-connection machinery (no new `TransportEvent` producer); TUI requests only an app-server-client launch URL and never starts `GuiHost` directly. Prod static caching (HTML no-cache vs. fingerprinted-asset immutable cache) is **out of scope** for this MVP plan — it is explicitly deferred; see Task 11 Step 5. The reserved `ConnectionOrigin::GuiHost` variant is likewise out of MVP acceptance scope per spec §Bridge shape (transport-origin policy); we keep it compiling but do not gate release on a distinct-variant regression test.

**Tech Stack:** Node CLI wrapper, Python packaging script, Vite build, Rust verification, Playwright.

---

Source spec: `docs/superpowers/specs/2026-05-11-codex-gui-host-redesign.md`.
Roadmap: `docs/superpowers/plans/2026-05-11-gui-host/00-roadmap.md`.
Bridge plan: `docs/superpowers/plans/2026-05-11-gui-host/02-app-server-bridge.md`.
TUI plan: `docs/superpowers/plans/2026-05-11-gui-host/03-tui-entry.md`.

## Verification Scope

- Do not verify or preserve the obsolete `in_process::tests::gui_backend` route.
- Do not add or require TUI direct dependencies on `codex-gui-host` or `codex-app-server`.
- Do not verify TUI direct `GuiHost::start` behavior; TUI verification must go through app-server-client launch URL access.
- Verify app-server bridge behavior through `gui_transport` and `gui_host` focused tests.
- Verify app-server-client launch API shape through `gui_launch` focused tests.

### Task 11: Add prod packaging and Vite config

**Files:**
- Modify: `codex-cli/bin/codex.js`
- Modify: `codex-cli/scripts/build_npm_package.py`
- Modify: `codex-gui/vite.config.ts`
- Test: `codex-cli/scripts/build_npm_package.py`

- [x] **Step 1: Write failing packaging test command**

Run from repo root before implementation:

```bash
python3 codex-cli/scripts/build_npm_package.py --package codex-darwin-arm64 --version 0.0.0-test --staging-dir /tmp/codex-gui-stage --vendor-src /tmp/missing-vendor
```

Expected failure before packaging support remains a missing vendor error. This establishes the script path is callable:

```text
RuntimeError: Vendor source directory not found
```

- [x] **Step 2: Implement wrapper env and dist copy**

Modify `codex-cli/bin/codex.js` near the existing `updatedPath` setup:

```js
const updatedPath = getUpdatedPath(additionalDirs);
const guiPackageRoot = path.join(vendorRoot, "codex-gui");

const env = {
  ...process.env,
  PATH: updatedPath,
  CODEX_GUI_PACKAGE_ROOT: guiPackageRoot,
};
```

Modify `codex-cli/scripts/build_npm_package.py`:

```python
CODEX_GUI_ROOT = REPO_ROOT / "codex-gui"
```

After `copy_native_binaries(...)` for platform packages:

```python
if package in CODEX_PLATFORM_PACKAGES:
    copy_gui_dist(staging_dir)
```

Add function:

```python
def copy_gui_dist(staging_dir: Path) -> None:
    gui_dist_src = CODEX_GUI_ROOT / "dist"
    if not gui_dist_src.exists():
        raise RuntimeError(f"codex-gui dist directory not found: {gui_dist_src}")

    gui_package_root = staging_dir / "vendor" / "codex-gui"
    gui_dist_dest = gui_package_root / "dist"
    if gui_dist_dest.exists():
        shutil.rmtree(gui_dist_dest)
    gui_package_root.mkdir(parents=True, exist_ok=True)
    shutil.copytree(gui_dist_src, gui_dist_dest)
```

Modify `codex-gui/vite.config.ts`:

```ts
const viteHost = process.env.CODEX_GUI_VITE_HOST ?? "127.0.0.1";
const vitePort = Number(process.env.CODEX_GUI_VITE_PORT ?? "5173");
const viteHmrHost = process.env.CODEX_GUI_VITE_HMR_HOST ?? viteHost;
const viteHmrPort = Number(process.env.CODEX_GUI_VITE_HMR_PORT ?? vitePort);

export default defineConfig({
  // keep existing plugins and resolve config
  server: {
    host: viteHost,
    port: vitePort,
    hmr: {
      host: viteHmrHost,
      port: viteHmrPort,
      clientPort: viteHmrPort,
    },
  },
});
```

- [x] **Step 3: Run focused verification**

Run from `codex-gui`:

```bash
pnpm run build
```

Expected:

```text
vite build
```

and `codex-gui/dist/index.html` exists.

- [x] **Step 4: Verify platform package staging layout**

`codex-gui/dist` is in `codex-gui/.gitignore`, so it must not be committed. Instead, assert that the packaging script actually lays out the dist under the staging package root and that the CLI wrapper points `CODEX_GUI_PACKAGE_ROOT` at that root.

`copy_native_binaries` at `codex-cli/scripts/build_npm_package.py:394-420` expects `--vendor-src` to contain a subdirectory per target triple and, inside each, subdirectories per component destination (`codex/` for the `codex` binary, `path/` for `rg`). For `--package codex-darwin-arm64` that triple is `aarch64-apple-darwin` (see `CODEX_PLATFORM_PACKAGES` at `build_npm_package.py:43-49`) and the components are `["codex", "rg"]` (mapped via `COMPONENT_DEST_DIR` to `codex/` and `path/` respectively).

Run from repo root:

```bash
rm -rf /tmp/codex-gui-stage /tmp/codex-gui-vendor
# Stand up the exact layout copy_native_binaries expects. For a smoke run,
# stub both components with a do-nothing executable — copy_native_binaries
# only checks that the files exist, not that they run.
mkdir -p /tmp/codex-gui-vendor/aarch64-apple-darwin/codex \
         /tmp/codex-gui-vendor/aarch64-apple-darwin/path
cp target/release/codex /tmp/codex-gui-vendor/aarch64-apple-darwin/codex/
# `rg` is required; if you don't have a built copy handy, any file suffices
# for the layout check:
cp "$(command -v rg || echo /bin/ls)" /tmp/codex-gui-vendor/aarch64-apple-darwin/path/rg

python3 codex-cli/scripts/build_npm_package.py \
  --package codex-darwin-arm64 \
  --version 0.0.0-test \
  --staging-dir /tmp/codex-gui-stage \
  --vendor-src /tmp/codex-gui-vendor
test -f /tmp/codex-gui-stage/vendor/codex-gui/dist/index.html
```

Expected: the `test -f` command exits 0. The prior Step 1 failure case (`RuntimeError: Vendor source directory not found`) is the negative side of this assertion.

Sanity-check that `codex-cli/bin/codex.js` passes `CODEX_GUI_PACKAGE_ROOT = <staging-dir>/vendor/codex-gui` when it spawns the codex binary from the staging layout. A grep is sufficient:

```bash
rg -n "CODEX_GUI_PACKAGE_ROOT" codex-cli/bin/codex.js
```

Expected: one match pointing at `path.join(vendorRoot, "codex-gui")`.

- [x] **Step 5: Defer prod static cache decision (out of scope)**

Prod HTML no-cache vs fingerprinted-asset `immutable` caching is **not** part of this MVP's acceptance gates. Confirm only that the prod handler serves `dist/index.html` and hashed asset files — do not change cache headers or add a cache-header test here. Capture the follow-up decision (cache policy owner + deadline) in a non-blocking note on the MVP ship PR; it lands in a later plan.

- [x] **Step 6: Commit**

```bash
git add codex-cli/bin/codex.js codex-cli/scripts/build_npm_package.py codex-gui/vite.config.ts
git commit -m "feat(gui): package built GUI assets"
```

`codex-gui/dist` is gitignored; do not `git add` it.

---

### Task 12: Final verification and lockfile updates

**Files:**
- Modify: `codex-rs/Cargo.lock`
- Modify: `codex-rs/MODULE.bazel.lock`
- Verify: Rust and GUI tests

- [x] **Step 1: Format Rust**

Run:

```bash
cd codex-rs
just fmt
```

Expected: command exits 0.

- [x] **Step 2: Run focused Rust tests**

`cargo test <filter>` accepts a single positional substring filter. To run each scoped set, group the tests under a shared name prefix and use one filter per command:

```bash
cd codex-rs
cargo test -p codex-gui-host
# Plan 06 in_process extra-connection surface (all names begin with "extra_connection_" or "register_extra_connection_" or "dropping_extra_").
cargo test -p codex-app-server -- extra_connection_
cargo test -p codex-app-server -- register_extra_connection_
cargo test -p codex-app-server -- dropping_extra_
cargo test -p codex-app-server -- processor_command_has_extra_variants
# Plan 02 GUI bridge modules.
cargo test -p codex-app-server -- gui_transport
cargo test -p codex-app-server -- gui_host
cargo test -p codex-app-server -- backend_round_trips_initialize
# App-server-client GUI extension.
cargo test -p codex-app-server-client -- gui_launch_error_variants_are_distinct
cargo test -p codex-app-server-client -- gui_launch_url_returns_real_url_for_in_process
# Invariants.
cargo test -p codex-app-server -- in_process_start_initializes_and_handles_typed_v2_request
# Non-gating sanity: ConnectionOrigin::GuiHost is reserved for future work (spec §Bridge shape).
# Running this test guards against accidental removal but a failure here alone does not block the MVP.
cargo test -p codex-app-server-transport -- connection_origin_has_distinct_gui_host_variant || echo "NOTE: reserved-variant sanity check failed; treat as follow-up, not an MVP blocker"
# TUI /gui focused tests.
cargo test -p codex-tui -- gui_command_
cargo test -p codex-tui -- launch_url_result_
cargo test -p codex-tui -- open_gui_
# Plan 05's prod hashed-asset gate is created in Step 3c below; run that
# command **after** Step 3c lands the new test target, not here. Running it
# before Step 3c will fail with `no test target named prod_serves_hashed_asset`.
```

Expected: every command listed above exits 0, **except** the `connection_origin_has_distinct_gui_host_variant` line, which is intentionally tolerated to fail via the `|| echo ...` fallback because the `GuiHost` variant is reserved out-of-MVP per spec §Bridge shape. A failure there prints the `NOTE:` line but must not be treated as a gate; every other command is a gate. The `--` separator makes the intent explicit: everything after `--` is a libtest filter. Using one filter per command avoids relying on libtest's multi-filter OR behavior, which is not part of the documented `cargo test <TESTNAME>` contract.

- [x] **Step 3: Verify dependency boundaries**

Run from repo root:

```bash
! rg -n "codex-gui-host|codex_gui_host|\\bGuiHost\\b|GuiHostHandle|GuiBackendHandle|codex-app-server\\s*=|\\bcodex_app_server::" codex-rs/tui
! rg -n "GuiHost::start|gui_backend\\(" codex-rs/tui
```

Expected:

```text
both commands exit 0 with no matches
```

The grep uses `\bcodex_app_server::` to allow `codex_app_server_client::` (which is the crate TUI is allowed to import) while rejecting the root `codex-app-server` crate path.

- [x] **Step 3b: End-to-end in-process launch check (manual, prod)**

Start a real TUI session in **prod** mode — the default `CODEX_GUI_HOST_MODE` for a debug build is `dev`, which proxies to Vite instead of serving the staged `dist/`. The MVP acceptance path is prod serving from the staging package root, so the manual check must explicitly pin that layout:

```bash
cd codex-rs
CODEX_GUI_HOST_MODE=prod \
CODEX_GUI_PACKAGE_ROOT=/tmp/codex-gui-stage/vendor/codex-gui \
cargo run -p codex-tui --bin codex-tui --release
```

Before running, the staging tree from Step 4 must exist (`/tmp/codex-gui-stage/vendor/codex-gui/dist/index.html` present). `--release` matches what the packaged CLI ships and avoids dragging in the `cfg!(debug_assertions)` branch in `codex-rs/gui-host/src/config.rs:30-34` that picks `Dev` when `CODEX_GUI_HOST_MODE` is unset. Setting `CODEX_GUI_HOST_MODE=prod` explicitly also makes the check reproducible regardless of build profile.

In the TUI, run `/gui`. Expected transcript output matches the pattern:

```text
http://127.0.0.1:<port>/?threadId=<thread-id>#token=<url-safe-base64-no-pad>
```

Open that URL in a local browser. Expected behavior:
- The GUI host serves HTTP 200 at `/`, reading `dist/index.html` from the staged package root.
- The WebSocket at `/ws` completes `gui/authenticate -> initialize -> thread/projection/attach` without errors (check browser devtools WebSocket frames).
- At least one `thread/projection/event` frame arrives after attach.
- Fetch a hashed asset directly to prove the prod static tree is wired, not only the root index:
  - Identify any fingerprinted asset produced by Vite under `codex-gui/dist/assets/` (for example `assets/index-abc123.js`). The staged copy is at `/tmp/codex-gui-stage/vendor/codex-gui/dist/assets/<that-file>`.
  - Open `http://127.0.0.1:<port>/assets/<that-file>` and confirm HTTP 200 with the expected body length (>0). No cache-header assertion; see Step 5.

This manual check corroborates the Rust unit/integration tests above and proves the default in-process path is end-to-end functional for both HTML and hashed assets **on the prod serving path**. The `dev` path (Vite proxy) is exercised indirectly by `pnpm vitest` in Step 4 and is not part of MVP acceptance here.

- [x] **Step 3c: Automated prod hashed-asset gate**

Add `codex-rs/gui-host/tests/prod_serves_hashed_asset.rs`:

```rust
#[tokio::test]
async fn prod_serves_hashed_asset_from_package_root() {
    // Stand up a GuiHost in prod mode pointed at a fixture that mirrors the
    // Vite output: `dist/index.html` plus `dist/assets/index-<hash>.js`.
    // GET /assets/index-<hash>.js and assert status=200, non-empty body.
    // Do NOT assert cache headers (cache policy is out of MVP acceptance).
}
```

This gate is necessary: existing prod host tests at `codex-rs/gui-host/src/host.rs:169-260` only exercise `/` and `/index.html`, but the spec requires prod serving from `$CODEX_GUI_PACKAGE_ROOT/dist/` which includes fingerprinted JS/CSS under `dist/assets/`.

After the file exists, run the gate from `codex-rs`:

```bash
cargo test -p codex-gui-host --test prod_serves_hashed_asset
```

Expected: exit 0. Add this command to the Step 2 rerun if you re-verify the full suite, but the canonical gate for this gate is this step.

- [x] **Step 4: Run frontend tests**

Run:

```bash
cd codex-gui
pnpm vitest --run src/features/guiHost/guiHostClient.test.ts
pnpm run type-check
```

Expected: all commands exit 0.

- [x] **Step 5: Update Bazel lock after dependency changes**

Run:

```bash
cd codex-rs
just bazel-lock-update
just bazel-lock-check
```

Expected: both commands exit 0.

- [x] **Step 6: Run scoped fixes**

Run:

```bash
cd codex-rs
just fix -p codex-gui-host
just fix -p codex-app-server-transport
just fix -p codex-app-server
just fix -p codex-app-server-client
just fix -p codex-tui
```

Expected: commands exit 0. Do not rerun tests after `fix` or `fmt` unless the command fails and you edit code again.

- [x] **Step 7: Commit verification updates**

```bash
git add codex-rs/gui-host/tests/prod_serves_hashed_asset.rs codex-rs/Cargo.lock codex-rs/MODULE.bazel.lock
git commit -m "chore(gui): update Rust locks for GUI host"
```

---

## Acceptance Gates

- Packaged CLI sets `CODEX_GUI_PACKAGE_ROOT` for prod GUI assets.
- Platform package copies `codex-gui/dist` into `vendor/codex-gui/dist`.
- Vite dev server host/HMR settings remain configurable for GUI host dev proxy.
- `codex-gui-host` focused tests pass.
- Plan 06's `extra_connection_*` and `dropping_extra_handle_triggers_connection_closed` tests pass.
- `codex-app-server` `gui_transport` tests pass (including `backend_round_trips_initialize`).
- `codex-app-server` `gui_host` tests pass.
- `codex-app-server-client` `gui_launch_error_variants_are_distinct` and `gui_launch_url_returns_real_url_for_in_process` pass.
- `codex-app-server-transport` `connection_origin_has_distinct_gui_host_variant` is run as a non-gating sanity check only (reserved variant; spec §Bridge shape marks `GuiHost` out of MVP acceptance).
- `codex-app-server` `in_process_start_initializes_and_handles_typed_v2_request` still passes (main TUI connection invariant).
- `codex-tui` `/gui` tests prove launch URL request/display behavior, not direct host ownership.
- The manual in-process e2e check (Step 3b) produces a real `http://127.0.0.1:<port>/?threadId=...#token=...` URL; the browser reaches the GUI host and completes `gui/authenticate -> initialize -> thread/projection/attach -> thread/projection/event` (at least one real event notification).
- `codex-tui` has no direct `codex-app-server` dependency.
- `codex-tui` has no `codex-gui-host` dependency.
- Final verification commands do not run `in_process::tests::gui_backend`.
