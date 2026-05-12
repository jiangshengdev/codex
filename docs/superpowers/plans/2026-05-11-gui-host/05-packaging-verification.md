# Codex GUI Packaging Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Package GUI dist for prod mode and run final verification for the GUI host projection transport MVP.

**Architecture:** This plan owns package root wiring, Vite config, final Rust/frontend verification, dependency boundary checks, and lockfile checks. Verification follows the方案 B ownership split: app-server owns GUI host lifecycle and emits transport events; TUI requests only an app-server-client launch URL and never starts `GuiHost` directly. Prod static caching details remain outside the transport MVP acceptance criteria and can be finalized during packaging implementation.

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

- [ ] **Step 1: Write failing packaging test command**

Run from repo root before implementation:

```bash
python3 codex-cli/scripts/build_npm_package.py --package codex-darwin-arm64 --version 0.0.0-test --staging-dir /tmp/codex-gui-stage --vendor-src /tmp/missing-vendor
```

Expected failure before packaging support remains a missing vendor error. This establishes the script path is callable:

```text
RuntimeError: Vendor source directory not found
```

- [ ] **Step 2: Implement wrapper env and dist copy**

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

- [ ] **Step 3: Run focused verification**

Run from `codex-gui`:

```bash
pnpm run build
```

Expected:

```text
vite build
```

and `codex-gui/dist/index.html` exists.

- [ ] **Step 4: Commit**

```bash
git add codex-cli/bin/codex.js codex-cli/scripts/build_npm_package.py codex-gui/vite.config.ts codex-gui/dist
git commit -m "feat(gui): package built GUI assets"
```

---

### Task 12: Final verification and lockfile updates

**Files:**
- Modify: `codex-rs/Cargo.lock`
- Modify: `codex-rs/MODULE.bazel.lock`
- Verify: Rust and GUI tests

- [ ] **Step 1: Format Rust**

Run:

```bash
cd codex-rs
just fmt
```

Expected: command exits 0.

- [ ] **Step 2: Run focused Rust tests**

Run:

```bash
cd codex-rs
cargo test -p codex-gui-host
cargo test -p codex-app-server extra_connection_request_reaches_message_processor extra_connection_notification_is_accepted dropping_extra_handle_triggers_connection_closed register_extra_connection_allocates_ids_starting_above_main processor_command_has_extra_variants
cargo test -p codex-app-server gui_transport
cargo test -p codex-app-server gui_host
cargo test -p codex-app-server backend_round_trips_initialize
cargo test -p codex-app-server-client gui_launch_error_variants_are_distinct gui_launch_url_returns_real_url_for_in_process
cargo test -p codex-app-server in_process_start_initializes_and_handles_typed_v2_request
cargo test -p codex-app-server-transport connection_origin_has_distinct_gui_host_variant
cargo test -p codex-tui gui_command_is_visible_and_available gui_command_emits_open_gui_event launch_url_result_renders_url_message launch_url_result_renders_unsupported_message launch_url_result_renders_transport_error
```

Expected: all commands exit 0.

- [ ] **Step 3: Verify dependency boundaries**

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

- [ ] **Step 3b: End-to-end in-process launch check**

From `codex-rs`:

```bash
cargo run -p codex-tui --bin codex -- --listen stdio:// --gui-e2e-one-shot
```

(If no `--gui-e2e-one-shot` flag exists, run a real interactive TUI session, execute `/gui`, and paste the printed URL into a browser.)

Expected: TUI prints a line matching `http://127.0.0.1:\d+/\?threadId=[^#]+#token=[0-9a-f]+`. Opening that URL in a local browser reaches the GUI host, returns HTTP 200 for `/`, and the WebSocket at `/ws` successfully completes `gui/authenticate -> initialize -> thread/projection/attach`. This manual check corroborates the Rust unit/integration tests above and proves the default in-process path is end-to-end functional.

- [ ] **Step 4: Run frontend tests**

Run:

```bash
cd codex-gui
pnpm vitest --run src/features/guiHost/guiHostClient.test.ts
pnpm run type-check
```

Expected: all commands exit 0.

- [ ] **Step 5: Update Bazel lock after dependency changes**

Run:

```bash
cd codex-rs
just bazel-lock-update
just bazel-lock-check
```

Expected: both commands exit 0.

- [ ] **Step 6: Run scoped fixes**

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

- [ ] **Step 7: Commit verification updates**

```bash
git add codex-rs/Cargo.lock codex-rs/MODULE.bazel.lock
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
- `codex-app-server-transport` `connection_origin_has_distinct_gui_host_variant` passes (reserved variant intact).
- `codex-app-server` `in_process_start_initializes_and_handles_typed_v2_request` still passes (main TUI connection invariant).
- `codex-tui` `/gui` tests prove launch URL request/display behavior, not direct host ownership.
- The manual in-process e2e check (Step 3b) produces a real `http://127.0.0.1:<port>/?threadId=...#token=...` URL; the browser reaches the GUI host and completes `gui/authenticate -> initialize -> thread/projection/attach`.
- `codex-tui` has no direct `codex-app-server` dependency.
- `codex-tui` has no `codex-gui-host` dependency.
- Final verification commands do not run `in_process::tests::gui_backend`.
