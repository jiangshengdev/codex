# Codex GUI Host NPM Packaging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the GUI host npm packaging policy so managed npm installs include GUI prod assets and `/gui` can resolve `$CODEX_GUI_PACKAGE_ROOT/dist/`.

**Architecture:** This plan implements `docs/superpowers/specs/2026-06-06-codex-gui-host-npm-packaging-design.md`. The root `@jiangshengdev/codex` package owns `dist/`; `build_npm_package.py --package codex` builds and stages `codex-gui/dist`; the Node wrapper supplies a default `CODEX_GUI_PACKAGE_ROOT` without overriding user-provided values.

**Tech Stack:** Node.js ESM launcher, Python npm staging script, pnpm, npm pack, tarball inspection.

---

## Source Of Truth

Read these before editing:

- `docs/superpowers/specs/2026-06-06-codex-gui-host-npm-packaging-design.md`
- `docs/superpowers/specs/2026-05-11-codex-gui-host-redesign.md`
- `docs/superpowers/plans/2026-05-30-gui-host/08-packaging-e2e-verification.md`

The new packaging design wins for npm package ownership, `CODEX_GUI_PACKAGE_ROOT` defaulting, staged package layout, and tarball verification. The old `08-packaging-e2e-verification.md` is useful for GUI host/frontend e2e context, but it does not contain the npm packaging implementation scope.

## File Responsibilities

- `codex-cli/bin/codex.js`: set `CODEX_GUI_PACKAGE_ROOT` to the root package realpath only when the user has not set it.
- `codex-cli/package.json`: include `dist` in root package `files`.
- `codex-cli/scripts/build_npm_package.py`: build `codex-gui`, copy `codex-gui/dist` into staged root package `dist`, and write staged root `files` as `["bin/codex.js", "dist"]`.
- `docs/superpowers/plans/2026-05-30-gui-host/09-npm-packaging-implementation.md`: record execution notes only.

Do not modify:

- `codex-rs/gui-host/src/**`
- `codex-rs/app-server/**`
- `codex-rs/app-server-client/**`
- `codex-rs/tui/**`
- `codex-gui/src/**`
- `codex-gui/package.json`
- `codex-gui/pnpm-lock.yaml`
- `codex-gui/pnpm-workspace.yaml`
- `Cargo.toml`, `Cargo.lock`, or `MODULE.bazel.lock`

## Task 1: Wire Runtime Package Root Default

**Files:**

- Modify: `codex-cli/bin/codex.js`
- Modify: `codex-cli/package.json`

- [ ] **Step 1: Update the Node wrapper env wiring**

In `codex-cli/bin/codex.js`, replace the managed package root assignment block:

```js
env[packageManagerEnvVar] = "1";
env.CODEX_MANAGED_PACKAGE_ROOT = realpathSync(path.join(__dirname, ".."));
```

with:

```js
env[packageManagerEnvVar] = "1";
const packageRoot = realpathSync(path.join(__dirname, ".."));
env.CODEX_MANAGED_PACKAGE_ROOT = packageRoot;
if (!env.CODEX_GUI_PACKAGE_ROOT) {
  env.CODEX_GUI_PACKAGE_ROOT = packageRoot;
}
```

This preserves a user-provided `CODEX_GUI_PACKAGE_ROOT` and supplies the managed root package path only when the variable is unset or empty.

- [ ] **Step 2: Include `dist` in the root package file list**

In `codex-cli/package.json`, change:

```json
"files": [
  "bin/codex.js"
],
```

to:

```json
"files": [
  "bin/codex.js",
  "dist"
],
```

- [ ] **Step 3: Format JS/JSON files**

Run from repo root:

```bash
pnpm prettier --write codex-cli/bin/codex.js codex-cli/package.json
```

Expected: prettier exits 0 and only formats the two listed files.

- [ ] **Step 4: Verify the static launcher diff**

Run from repo root:

```bash
git diff -- codex-cli/bin/codex.js codex-cli/package.json
```

Expected: diff shows `packageRoot`, conditional `CODEX_GUI_PACKAGE_ROOT`, and `dist` in `files`.

## Task 2: Stage GUI Dist Into Root NPM Package

**Files:**

- Modify: `codex-cli/scripts/build_npm_package.py`

- [ ] **Step 1: Add the GUI package root constant**

Near the existing constants:

```python
RESPONSES_API_PROXY_NPM_ROOT = REPO_ROOT / "codex-rs" / "responses-api-proxy" / "npm"
CODEX_SDK_ROOT = REPO_ROOT / "sdk" / "typescript"
CODEX_NPM_NAME = "@jiangshengdev/codex"
```

insert:

```python
CODEX_GUI_ROOT = REPO_ROOT / "codex-gui"
```

The resulting block should be:

```python
RESPONSES_API_PROXY_NPM_ROOT = REPO_ROOT / "codex-rs" / "responses-api-proxy" / "npm"
CODEX_SDK_ROOT = REPO_ROOT / "sdk" / "typescript"
CODEX_GUI_ROOT = REPO_ROOT / "codex-gui"
CODEX_NPM_NAME = "@jiangshengdev/codex"
```

- [ ] **Step 2: Call GUI dist staging for the root package**

In `stage_sources`, inside the `if package == "codex":` branch, after the README copy block:

```python
readme_src = REPO_ROOT / "README.md"
if readme_src.exists():
    shutil.copy2(readme_src, staging_dir / "README.md")

package_json_path = CODEX_CLI_ROOT / "package.json"
```

insert:

```python
stage_codex_gui_dist(staging_dir)
```

The resulting branch should be:

```python
readme_src = REPO_ROOT / "README.md"
if readme_src.exists():
    shutil.copy2(readme_src, staging_dir / "README.md")

stage_codex_gui_dist(staging_dir)

package_json_path = CODEX_CLI_ROOT / "package.json"
```

- [ ] **Step 3: Include `dist` in the staged root package metadata**

In `stage_sources`, change the root package metadata override:

```python
if package == "codex":
    package_json["files"] = ["bin/codex.js"]
```

to:

```python
if package == "codex":
    package_json["files"] = ["bin/codex.js", "dist"]
```

- [ ] **Step 4: Add the GUI dist staging helper**

Add this helper after `run_command` and before `stage_codex_sdk_sources`:

```python
def stage_codex_gui_dist(staging_dir: Path) -> None:
    run_command(["pnpm", "--dir", str(CODEX_GUI_ROOT), "run", "build"], cwd=REPO_ROOT)

    dist_src = CODEX_GUI_ROOT / "dist"
    index_html = dist_src / "index.html"
    if not index_html.is_file():
        raise RuntimeError(
            "codex-gui build did not produce dist/index.html. "
            "Run `pnpm --dir codex-gui run build` and check the Vite output."
        )

    dist_dest = staging_dir / "dist"
    if dist_dest.exists():
        shutil.rmtree(dist_dest)
    shutil.copytree(dist_src, dist_dest)
```

This helper intentionally does not run `pnpm install`. CI must install dependencies before staging.

- [ ] **Step 5: Verify Python syntax**

Run from repo root:

```bash
python3 -m py_compile codex-cli/scripts/build_npm_package.py
```

Expected: command exits 0.

## Task 3: Verify Staged Root Package Contents

**Files:**

- Verify: `codex-cli/scripts/build_npm_package.py`
- Verify: `codex-gui/dist/**`
- Verify: staged temp directory

- [ ] **Step 1: Ensure JavaScript dependencies are installed**

Run from repo root:

```bash
pnpm install --frozen-lockfile
```

Expected: command exits 0. In CI this should already be true before package staging, but run it locally for the focused staging verification.

- [ ] **Step 2: Stage the root npm package**

Run from repo root:

```bash
STAGING_DIR="$(mktemp -d)"
python3 codex-cli/scripts/build_npm_package.py \
  --package codex \
  --version 0.0.0-gui-packaging-test \
  --staging-dir "$STAGING_DIR"
```

Expected: command exits 0 and prints `Staged package in ...`.

- [ ] **Step 3: Verify staged files exist**

Run from repo root in the same shell:

```bash
test -f "$STAGING_DIR/bin/codex.js"
test -f "$STAGING_DIR/dist/index.html"
find "$STAGING_DIR/dist/assets" -maxdepth 1 -type f | grep -q .
```

Expected: all commands exit 0.

- [ ] **Step 4: Verify staged package metadata includes `dist`**

Run from repo root in the same shell:

```bash
STAGING_DIR="$STAGING_DIR" node -e '
const fs = require("fs");
const pkg = JSON.parse(fs.readFileSync(process.env.STAGING_DIR + "/package.json", "utf8"));
const files = pkg.files || [];
if (!files.includes("bin/codex.js") || !files.includes("dist")) {
  console.error(JSON.stringify(files));
  process.exit(1);
}
'
```

Expected: command exits 0.

- [ ] **Step 5: Clean up staged directory**

Run:

```bash
rm -rf "$STAGING_DIR"
```

Expected: temp staging directory is removed.

## Task 4: Verify NPM Tarball Contents

**Files:**

- Verify: `codex-cli/scripts/build_npm_package.py`
- Verify: generated npm tarball

- [ ] **Step 1: Build an npm tarball for the root package**

Run from repo root:

```bash
PACK_DIR="$(mktemp -d)"
PACK_OUTPUT="$PACK_DIR/codex-npm-gui-packaging-test.tgz"
STAGING_DIR="$PACK_DIR/stage"
python3 codex-cli/scripts/build_npm_package.py \
  --package codex \
  --version 0.0.0-gui-packaging-test \
  --staging-dir "$STAGING_DIR" \
  --pack-output "$PACK_OUTPUT"
```

Expected: command exits 0 and prints `npm pack output written to ...`.

- [ ] **Step 2: Verify tarball entries**

Run from repo root in the same shell:

```bash
tar -tzf "$PACK_OUTPUT" | sort > "$PACK_DIR/entries.txt"
grep -Fx 'package/bin/codex.js' "$PACK_DIR/entries.txt"
grep -Fx 'package/dist/index.html' "$PACK_DIR/entries.txt"
grep -E '^package/dist/assets/.+' "$PACK_DIR/entries.txt"
```

Expected: all `grep` commands find a match.

- [ ] **Step 3: Clean up tarball temp directory**

Run:

```bash
rm -rf "$PACK_DIR"
```

Expected: temp directory is removed.

## Task 5: Verify Wrapper Env Behavior With A Fake Native Binary

**Files:**

- Verify: `codex-cli/bin/codex.js`
- Verify: staged temp directory

- [ ] **Step 1: Stage the root npm package**

Run from repo root:

```bash
WRAPPER_STAGE="$(mktemp -d)"
python3 codex-cli/scripts/build_npm_package.py \
  --package codex \
  --version 0.0.0-gui-packaging-test \
  --staging-dir "$WRAPPER_STAGE"
```

Expected: command exits 0.

- [ ] **Step 2: Add a fake native binary that records env**

Run from repo root in the same shell:

```bash
TARGET="$(node - <<'NODE'
const { platform, arch } = process;
if (platform === "darwin" && arch === "arm64") console.log("aarch64-apple-darwin");
else if (platform === "darwin" && arch === "x64") console.log("x86_64-apple-darwin");
else if ((platform === "linux" || platform === "android") && arch === "x64") console.log("x86_64-unknown-linux-musl");
else if ((platform === "linux" || platform === "android") && arch === "arm64") console.log("aarch64-unknown-linux-musl");
else if (platform === "win32" && arch === "x64") console.log("x86_64-pc-windows-msvc");
else if (platform === "win32" && arch === "arm64") console.log("aarch64-pc-windows-msvc");
else process.exit(1);
NODE
)"
mkdir -p "$WRAPPER_STAGE/vendor/$TARGET/bin"
cat > "$WRAPPER_STAGE/vendor/$TARGET/bin/codex" <<'SH'
#!/bin/sh
printf '%s\n' "$CODEX_GUI_PACKAGE_ROOT" > "$CODEX_ENV_CAPTURE"
exit 0
SH
chmod +x "$WRAPPER_STAGE/vendor/$TARGET/bin/codex"
```

Expected: fake binary exists at `$WRAPPER_STAGE/vendor/$TARGET/bin/codex`.

- [ ] **Step 3: Verify default package root is supplied**

Run from repo root in the same shell:

```bash
ENV_CAPTURE="$WRAPPER_STAGE/env-default.txt"
CODEX_ENV_CAPTURE="$ENV_CAPTURE" \
  env -u CODEX_GUI_PACKAGE_ROOT \
  node "$WRAPPER_STAGE/bin/codex.js" --version
EXPECTED_ROOT="$(cd "$WRAPPER_STAGE" && pwd -P)"
test "$(cat "$ENV_CAPTURE")" = "$EXPECTED_ROOT"
```

Expected: command exits 0; captured `CODEX_GUI_PACKAGE_ROOT` equals staged package realpath.

- [ ] **Step 4: Verify user override is preserved**

Run from repo root in the same shell:

```bash
ENV_CAPTURE="$WRAPPER_STAGE/env-override.txt"
CODEX_ENV_CAPTURE="$ENV_CAPTURE" \
  CODEX_GUI_PACKAGE_ROOT="/tmp/codex-gui-override" \
  node "$WRAPPER_STAGE/bin/codex.js" --version
test "$(cat "$ENV_CAPTURE")" = "/tmp/codex-gui-override"
```

Expected: command exits 0; captured value is the user override.

- [ ] **Step 5: Clean up wrapper stage**

Run:

```bash
rm -rf "$WRAPPER_STAGE"
```

Expected: temp directory is removed.

## Task 6: Run Focused Final Checks

**Files:**

- Verify: `codex-cli/bin/codex.js`
- Verify: `codex-cli/package.json`
- Verify: `codex-cli/scripts/build_npm_package.py`
- Verify: `docs/superpowers/specs/2026-06-06-codex-gui-host-npm-packaging-design.md`

- [ ] **Step 1: Check formatting**

Run from repo root:

```bash
pnpm prettier --check codex-cli/bin/codex.js codex-cli/package.json docs/superpowers/specs/2026-06-06-codex-gui-host-npm-packaging-design.md docs/superpowers/plans/2026-05-30-gui-host/09-npm-packaging-implementation.md
```

Expected: command exits 0.

- [ ] **Step 2: Check Python syntax again**

Run from repo root:

```bash
python3 -m py_compile codex-cli/scripts/build_npm_package.py
```

Expected: command exits 0.

- [ ] **Step 3: Verify there are no unintended Rust or lockfile changes**

Run from repo root:

```bash
if git diff --name-only | rg '^(codex-rs/|codex-gui/src/|codex-gui/package.json|codex-gui/pnpm-lock.yaml|codex-gui/pnpm-workspace.yaml|Cargo.lock|Cargo.toml|MODULE.bazel.lock)'; then
  exit 1
fi
```

Expected: command exits 0 because this plan should not modify Rust runtime code, frontend source, or lockfiles.

- [ ] **Step 4: Review final diff**

Run from repo root:

```bash
git diff -- codex-cli/bin/codex.js codex-cli/package.json codex-cli/scripts/build_npm_package.py docs/superpowers/specs/2026-06-06-codex-gui-host-npm-packaging-design.md docs/superpowers/plans/2026-05-30-gui-host/09-npm-packaging-implementation.md
```

Expected: diff is limited to npm packaging implementation, the new packaging design, and this plan.

## Execution Notes

Append task results here during execution. Use `PASS` / `BLOCKED` lines with exact command output summaries and file paths.

- PASS Task 1: updated `codex-cli/bin/codex.js` and `codex-cli/package.json`; pre-edit wrapper env check captured empty `CODEX_GUI_PACKAGE_ROOT`, post-edit check captured staged package root by default and preserved `/custom/gui-root` override; `pnpm prettier --write codex-cli/bin/codex.js codex-cli/package.json` exited 0.
- PASS Task 2: updated `codex-cli/scripts/build_npm_package.py`; pre-edit AST check confirmed `CODEX_GUI_ROOT` and `stage_codex_gui_dist` were absent and staged root `files` was only `["bin/codex.js"]`; `python3 -m py_compile codex-cli/scripts/build_npm_package.py` and `git diff --check -- codex-cli/scripts/build_npm_package.py` exited 0.
- PASS Task 3: `pnpm install --frozen-lockfile` exited 0; `build_npm_package.py --package codex --version 0.0.0-gui-packaging-test --staging-dir "$STAGING_DIR"` exited 0; staged package contained `bin/codex.js`, `dist/index.html`, `dist/assets/*`, and package metadata files including `bin/codex.js` and `dist`.
- PASS Task 4: `build_npm_package.py --package codex --version 0.0.0-gui-packaging-test --staging-dir "$STAGING_DIR" --pack-output "$PACK_OUTPUT"` exited 0; tarball entries included `package/bin/codex.js`, `package/dist/index.html`, and `package/dist/assets/*`.
- PASS Task 5: staged wrapper with fake native binary exited 0; default run with `env -u CODEX_GUI_PACKAGE_ROOT` captured staged package realpath; override run captured `/tmp/codex-gui-override`.
- PASS Task 6: `pnpm prettier --check codex-cli/bin/codex.js codex-cli/package.json docs/superpowers/specs/2026-06-06-codex-gui-host-npm-packaging-design.md docs/superpowers/plans/2026-05-30-gui-host/09-npm-packaging-implementation.md` exited 0 after formatting the two docs files; `python3 -m py_compile codex-cli/scripts/build_npm_package.py` exited 0; unintended Rust/frontend source/lockfile diff check exited 0.
