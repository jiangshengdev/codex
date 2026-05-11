# Codex GUI Packaging Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Package GUI dist for prod mode and run final verification for the full GUI host redesign.

**Architecture:** This plan is copied from original Tasks 11-12. It owns package root wiring, Vite config, final Rust/frontend verification, and lockfile checks.

**Tech Stack:** Node CLI wrapper, Python packaging script, Vite build, Rust verification, Playwright.

---

Source: split from `docs/superpowers/plans/2026-05-11-codex-gui-host-redesign.md`. The source file is deleted after this split because these files replace it.

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
cargo test -p codex-app-server gui_host_bridge
cargo test -p codex-tui gui
```

Expected: all commands exit 0.

- [ ] **Step 3: Run frontend tests**

Run:

```bash
cd codex-gui
pnpm vitest --run src/features/guiHost/guiHostClient.test.ts
pnpm run type-check
```

Expected: all commands exit 0.

- [ ] **Step 4: Update Bazel lock after dependency changes**

Run:

```bash
cd codex-rs
just bazel-lock-update
just bazel-lock-check
```

Expected: both commands exit 0.

- [ ] **Step 5: Run scoped fixes**

Run:

```bash
cd codex-rs
just fix -p codex-gui-host
just fix -p codex-app-server
just fix -p codex-tui
```

Expected: commands exit 0. Do not rerun tests after `fix` or `fmt` unless the command fails and you edit code again.

- [ ] **Step 6: Commit verification updates**

```bash
git add codex-rs/Cargo.lock codex-rs/MODULE.bazel.lock
git commit -m "chore(gui): update Rust locks for GUI host"
```

---
