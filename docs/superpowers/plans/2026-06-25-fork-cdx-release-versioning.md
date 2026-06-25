# Fork cdx Release Versioning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Support fork release versions like `0.142.1-cdx.1` while keeping ordinary CI unchanged and preserving upstream stable/alpha/beta release behavior.

**Architecture:** Keep `codex-rs/Cargo.toml` as the release version source and teach only the release-only entry points to classify `cdx.N`. The release workflow treats `cdx.N` as the fork's mainline release channel for GitHub Release and npm, while Python runtime wheels map the same release to PEP 440 `X.Y.Z.devN`. Installer validation is widened only for `cdx.N`, not arbitrary prereleases.

**Tech Stack:** GitHub Actions YAML, Bash, PowerShell, Python, pytest, SemVer, PEP 440.

---

## Scope Source

Implement only the design in:

```text
docs/superpowers/specs/2026-06-25-fork-cdx-release-versioning-design.md
```

Do not broaden the change into ordinary CI, release matrices, artifact names, TUI update logic, npm staging internals, or generic release parser abstractions.

## File Structure

- Modify `.github/workflows/rust-release.yml`: accept `rust-vX.Y.Z-cdx.N`, publish `cdx.N` npm packages to the default tag, and make `cdx.N` GitHub releases latest/non-prerelease.
- Modify `sdk/python/scripts/update_sdk_artifacts.py`: map `X.Y.Z-cdx.N` and `rust-vX.Y.Z-cdx.N` to `X.Y.Z.devN`.
- Modify `sdk/python/tests/test_artifact_workflow_and_binaries.py`: add focused coverage for the `cdx.N` Python version mapping.
- Modify `scripts/install/install.sh`: accept only `X.Y.Z-cdx.N` in addition to existing stable/alpha/beta versions.
- Modify `scripts/install/install.ps1`: mirror the shell installer validation rule.

Do not modify:

- `.github/workflows/ci.yml`
- `.github/workflows/bazel.yml`
- `.github/workflows/sdk.yml`
- `codex-cli/scripts/build_npm_package.py`
- `scripts/stage_npm_packages.py`
- `codex-rs/**` Rust source files
- package metadata files solely to bump a concrete release version

## Task 1: Release Workflow Classification

**Files:**
- Modify: `.github/workflows/rust-release.yml`

- [ ] **Step 1: Update tag validation to accept `cdx.N`**

In `.github/workflows/rust-release.yml`, replace the tag validation regex in the `Validate tag matches Cargo.toml version` step with:

```bash
[[ "${GITHUB_REF_NAME}" =~ ^rust-v[0-9]+\.[0-9]+\.[0-9]+(-(alpha|beta)(\.[0-9]+)?|-cdx\.[0-9]+)?$ ]] \
  || { echo "❌  Tag '${GITHUB_REF_NAME}' doesn't match expected format"; exit 1; }
```

Keep the existing `tag_ver="${GITHUB_REF_NAME#rust-v}"`, `cargo_ver=...`, and equality check unchanged so `rust-v0.142.1-cdx.1` must match `codex-rs/Cargo.toml` version `0.142.1-cdx.1`.

- [ ] **Step 2: Make npm publish settings publish `cdx.N` to the default tag**

In the `Determine npm publish settings` step, replace the existing `if` block with:

```bash
if [[ "${version}" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "should_publish=true" >> "$GITHUB_OUTPUT"
  echo "npm_tag=" >> "$GITHUB_OUTPUT"
elif [[ "${version}" =~ ^[0-9]+\.[0-9]+\.[0-9]+-alpha\.[0-9]+$ ]]; then
  echo "should_publish=true" >> "$GITHUB_OUTPUT"
  echo "npm_tag=alpha" >> "$GITHUB_OUTPUT"
elif [[ "${version}" =~ ^[0-9]+\.[0-9]+\.[0-9]+-cdx\.[0-9]+$ ]]; then
  echo "should_publish=true" >> "$GITHUB_OUTPUT"
  echo "npm_tag=" >> "$GITHUB_OUTPUT"
else
  echo "should_publish=false" >> "$GITHUB_OUTPUT"
  echo "npm_tag=" >> "$GITHUB_OUTPUT"
fi
```

This keeps beta releases unpublished by npm unless a later design explicitly changes that.

- [ ] **Step 3: Add a GitHub Release classification step**

Immediately after `Determine npm publish settings`, add:

```yaml
      - name: Determine GitHub release settings
        id: github_release_settings
        env:
          VERSION: ${{ steps.release_name.outputs.name }}
        run: |
          set -euo pipefail
          version="${VERSION}"

          if [[ "${version}" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
            echo "make_latest=true" >> "$GITHUB_OUTPUT"
            echo "prerelease=false" >> "$GITHUB_OUTPUT"
          elif [[ "${version}" =~ ^[0-9]+\.[0-9]+\.[0-9]+-cdx\.[0-9]+$ ]]; then
            echo "make_latest=true" >> "$GITHUB_OUTPUT"
            echo "prerelease=false" >> "$GITHUB_OUTPUT"
          else
            echo "make_latest=false" >> "$GITHUB_OUTPUT"
            echo "prerelease=true" >> "$GITHUB_OUTPUT"
          fi
```

This makes `0.142.1-cdx.1` latest/non-prerelease while leaving alpha and beta prerelease behavior intact.

- [ ] **Step 4: Wire the GitHub Release action to the new settings**

In the `Create GitHub Release` step, replace:

```yaml
          make_latest: ${{ !contains(steps.release_name.outputs.name, '-') }}
          # Mark as prerelease only when the version has a suffix after x.y.z
          # (e.g. -alpha, -beta). Otherwise publish a normal release.
          prerelease: ${{ contains(steps.release_name.outputs.name, '-') }}
```

with:

```yaml
          make_latest: ${{ steps.github_release_settings.outputs.make_latest }}
          prerelease: ${{ steps.github_release_settings.outputs.prerelease }}
```

- [ ] **Step 5: Validate YAML syntax**

Run:

```sh
cd /Users/jiangsheng/cnb/codex
ruby -e 'require "yaml"; YAML.load_file(".github/workflows/rust-release.yml"); puts "ok"'
```

Expected: prints `ok`.

- [ ] **Step 6: Validate the release classification logic locally**

Run this shell snippet without contacting git remotes:

```sh
cd /Users/jiangsheng/cnb/codex
bash <<'EOF'
set -euo pipefail

valid_tag() {
  local tag="$1"
  [[ "${tag}" =~ ^rust-v[0-9]+\.[0-9]+\.[0-9]+(-(alpha|beta)(\.[0-9]+)?|-cdx\.[0-9]+)?$ ]]
}

npm_publish() {
  local version="$1"
  if [[ "${version}" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    printf 'true:<default>\n'
  elif [[ "${version}" =~ ^[0-9]+\.[0-9]+\.[0-9]+-alpha\.[0-9]+$ ]]; then
    printf 'true:alpha\n'
  elif [[ "${version}" =~ ^[0-9]+\.[0-9]+\.[0-9]+-cdx\.[0-9]+$ ]]; then
    printf 'true:<default>\n'
  else
    printf 'false:<none>\n'
  fi
}

github_release() {
  local version="$1"
  if [[ "${version}" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    printf 'latest:not-prerelease\n'
  elif [[ "${version}" =~ ^[0-9]+\.[0-9]+\.[0-9]+-cdx\.[0-9]+$ ]]; then
    printf 'latest:not-prerelease\n'
  else
    printf 'not-latest:prerelease\n'
  fi
}

valid_tag rust-v0.142.1
valid_tag rust-v0.142.1-alpha.1
valid_tag rust-v0.142.1-beta.1
valid_tag rust-v0.142.1-cdx.1
! valid_tag rust-v0.142.1-cdx
! valid_tag rust-v0.142.1-custom.1

test "$(npm_publish 0.142.1)" = "true:<default>"
test "$(npm_publish 0.142.1-alpha.1)" = "true:alpha"
test "$(npm_publish 0.142.1-beta.1)" = "false:<none>"
test "$(npm_publish 0.142.1-cdx.1)" = "true:<default>"

test "$(github_release 0.142.1)" = "latest:not-prerelease"
test "$(github_release 0.142.1-alpha.1)" = "not-latest:prerelease"
test "$(github_release 0.142.1-beta.1)" = "not-latest:prerelease"
test "$(github_release 0.142.1-cdx.1)" = "latest:not-prerelease"
EOF
```

Expected: exit code 0 with no output.

## Task 2: Python Runtime Version Mapping

**Files:**
- Modify: `sdk/python/scripts/update_sdk_artifacts.py`
- Modify: `sdk/python/tests/test_artifact_workflow_and_binaries.py`

- [ ] **Step 1: Write the failing Python mapping test**

In `sdk/python/tests/test_artifact_workflow_and_binaries.py`, extend `test_normalize_codex_version_accepts_release_tags_and_pep440_versions` with:

```python
    assert script.normalize_codex_version("rust-v0.142.1-cdx.1") == "0.142.1.dev1"
    assert script.normalize_codex_version("0.142.1-cdx.2") == "0.142.1.dev2"
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```sh
cd /Users/jiangsheng/cnb/codex/sdk/python
/Users/jiangsheng/.local/bin/python -m pytest tests/test_artifact_workflow_and_binaries.py::test_normalize_codex_version_accepts_release_tags_and_pep440_versions -q
```

Expected: FAIL with `Could not normalize Codex version 'rust-v0.142.1-cdx.1' to a PEP 440 version`.

- [ ] **Step 3: Implement the minimal `cdx` mapping**

In `sdk/python/scripts/update_sdk_artifacts.py`, update `normalize_codex_version` so the conversion block is:

```python
    normalized = re.sub(r"-alpha\.?([0-9]+)$", r"a\1", normalized)
    normalized = re.sub(r"-beta\.?([0-9]+)$", r"b\1", normalized)
    normalized = re.sub(r"-rc\.?([0-9]+)$", r"rc\1", normalized)
    normalized = re.sub(r"-cdx\.([0-9]+)$", r".dev\1", normalized)

    if not re.fullmatch(
        r"[0-9]+(?:\.[0-9]+)*(?:(?:a|b|rc)[0-9]+|\.dev[0-9]+)?",
        normalized,
    ):
        raise RuntimeError(f"Could not normalize Codex version {version!r} to a PEP 440 version")
```

Do not accept bare `-cdx`, `-cdx0`, or arbitrary prerelease labels.

- [ ] **Step 4: Run the focused Python test and verify it passes**

Run:

```sh
cd /Users/jiangsheng/cnb/codex/sdk/python
/Users/jiangsheng/.local/bin/python -m pytest tests/test_artifact_workflow_and_binaries.py::test_normalize_codex_version_accepts_release_tags_and_pep440_versions -q
```

Expected: PASS.

## Task 3: Installer Version Validation

**Files:**
- Modify: `scripts/install/install.sh`
- Modify: `scripts/install/install.ps1`

- [ ] **Step 1: Update shell installer regex**

In `scripts/install/install.sh`, replace the `grep -Eq` regex in `validate_version` with:

```sh
'^[0-9]+\.[0-9]+\.[0-9]+(-(alpha|beta)(\.[0-9]+)?|-cdx\.[0-9]+)?$'
```

Update the error text to:

```sh
echo "Invalid Codex release version: $version. Expected latest or x.y.z[-alpha[.N]|-beta[.N]|-cdx.N]." >&2
```

- [ ] **Step 2: Update PowerShell installer regex**

In `scripts/install/install.ps1`, replace the regex in `Assert-ValidReleaseVersion` with:

```powershell
^[0-9]+\.[0-9]+\.[0-9]+(?:-(?:(?:alpha|beta)(?:\.[0-9]+)?|cdx\.[0-9]+))?$
```

Update the error text to:

```powershell
throw "Invalid Codex release version: $Version. Expected latest or x.y.z[-alpha[.N]|-beta[.N]|-cdx.N]."
```

- [ ] **Step 3: Syntax-check shell installer**

Run:

```sh
cd /Users/jiangsheng/cnb/codex
bash -n scripts/install/install.sh
```

Expected: exit code 0.

- [ ] **Step 4: Behavior-check shell installer validation without running installer main**

Run:

```sh
cd /Users/jiangsheng/cnb/codex
tmp="$(mktemp)"
awk '/^validate_version\\(\\)/,/^}/' scripts/install/install.sh > "$tmp"
bash -c ". '$tmp'; validate_version latest; validate_version 0.142.1; validate_version 0.142.1-alpha.1; validate_version 0.142.1-beta.1; validate_version 0.142.1-cdx.1"
bash -c ". '$tmp'; validate_version 0.142.1-cdx" >/tmp/cdx-invalid.out 2>/tmp/cdx-invalid.err && exit 1 || true
rm -f "$tmp" /tmp/cdx-invalid.out /tmp/cdx-invalid.err
```

Expected: exit code 0. The invalid `0.142.1-cdx` command must fail inside the guarded command.

- [ ] **Step 5: Syntax-check PowerShell installer when `pwsh` is available**

Run:

```sh
cd /Users/jiangsheng/cnb/codex
if command -v pwsh >/dev/null 2>&1; then
  pwsh -NoProfile -Command '$tokens=$null; $errors=$null; [System.Management.Automation.Language.Parser]::ParseFile("scripts/install/install.ps1", [ref]$tokens, [ref]$errors) > $null; if ($errors.Count) { $errors | ForEach-Object { Write-Error $_ }; exit 1 }'
else
  echo "pwsh not available; skipped PowerShell parser validation"
fi
```

Expected: prints either no output with exit code 0, or `pwsh not available; skipped PowerShell parser validation`.

## Task 4: Final Verification and Diff Audit

**Files:**
- Inspect: `.github/workflows/rust-release.yml`
- Inspect: `sdk/python/scripts/update_sdk_artifacts.py`
- Inspect: `sdk/python/tests/test_artifact_workflow_and_binaries.py`
- Inspect: `scripts/install/install.sh`
- Inspect: `scripts/install/install.ps1`

- [ ] **Step 1: Run the focused Python test**

Run:

```sh
cd /Users/jiangsheng/cnb/codex/sdk/python
/Users/jiangsheng/.local/bin/python -m pytest tests/test_artifact_workflow_and_binaries.py::test_normalize_codex_version_accepts_release_tags_and_pep440_versions -q
```

Expected: PASS.

- [ ] **Step 2: Re-run release workflow syntax and classification checks**

Run:

```sh
cd /Users/jiangsheng/cnb/codex
ruby -e 'require "yaml"; YAML.load_file(".github/workflows/rust-release.yml"); puts "ok"'
```

Expected: prints `ok`.

Run the classification snippet from Task 1 Step 6 again.

Expected: exit code 0 with no output.

- [ ] **Step 3: Re-run installer checks**

Run:

```sh
cd /Users/jiangsheng/cnb/codex
bash -n scripts/install/install.sh
```

Expected: exit code 0.

Run the shell validation snippet from Task 3 Step 4 again.

Expected: exit code 0.

Run the PowerShell parser command from Task 3 Step 5 again.

Expected: parser succeeds or prints the explicit `pwsh not available` skip message.

- [ ] **Step 4: Check formatting-sensitive whitespace**

Run:

```sh
cd /Users/jiangsheng/cnb/codex
git diff --check
```

Expected: no output and exit code 0.

- [ ] **Step 5: Confirm the diff stays inside the approved scope**

Run:

```sh
cd /Users/jiangsheng/cnb/codex
git diff --name-only
```

Expected output is limited to:

```text
.github/workflows/rust-release.yml
docs/superpowers/plans/2026-06-25-fork-cdx-release-versioning.md
docs/superpowers/specs/2026-06-25-fork-cdx-release-versioning-design.md
scripts/install/install.ps1
scripts/install/install.sh
sdk/python/scripts/update_sdk_artifacts.py
sdk/python/tests/test_artifact_workflow_and_binaries.py
```

If execution happens in a fresh branch where the spec/plan docs are already committed, the expected implementation-only files are:

```text
.github/workflows/rust-release.yml
scripts/install/install.ps1
scripts/install/install.sh
sdk/python/scripts/update_sdk_artifacts.py
sdk/python/tests/test_artifact_workflow_and_binaries.py
```

- [ ] **Step 6: Do not run broad suites by default**

Do not run complete `just test`, release workflow jobs, npm publish, GitHub release creation, or any git remote command as part of this plan. If broader verification is needed later, ask for a separate decision because the design explicitly preserves ordinary CI and avoids remote operations.

## Commit Guidance

If the user asks to commit after implementation, keep the implementation in one focused commit:

```sh
git add .github/workflows/rust-release.yml \
  scripts/install/install.sh \
  scripts/install/install.ps1 \
  sdk/python/scripts/update_sdk_artifacts.py \
  sdk/python/tests/test_artifact_workflow_and_binaries.py
git commit -m "Support cdx fork release versions"
```

Do not include unrelated files. Do not create or push tags. Do not operate git remotes.
