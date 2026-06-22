# codex-gui Worktree Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a repo-local Codex skill that creates lightweight `codex-gui` sparse worktrees and links the local dependencies and documentation caches needed for frontend work.

**Architecture:** The skill lives under `.codex/skills/codex-gui-worktree`. `SKILL.md` defines when and how agents should use the workflow, while one Bash script performs deterministic setup and verification. The script is conservative: it refuses to overwrite existing state, does not install or download anything, and reports exact conflicts.

**Tech Stack:** Codex skills, Bash, git worktree, git sparse-checkout, symlinks.

---

## File Structure

- Create: `/Users/jiangsheng/cnb/codex/.codex/skills/codex-gui-worktree/SKILL.md`
  - Repo-local skill instructions and trigger metadata.
- Create: `/Users/jiangsheng/cnb/codex/.codex/skills/codex-gui-worktree/scripts/create-codex-gui-worktree.sh`
  - Deterministic sparse worktree creation, local symlink setup, and verification.
- Create: `/Users/jiangsheng/cnb/codex/.codex/skills/codex-gui-worktree/agents/openai.yaml`
  - Generated UI metadata from `skill-creator`.

## Task 1: Initialize the Skill Skeleton

**Files:**
- Create: `/Users/jiangsheng/cnb/codex/.codex/skills/codex-gui-worktree/SKILL.md`
- Create: `/Users/jiangsheng/cnb/codex/.codex/skills/codex-gui-worktree/agents/openai.yaml`
- Create: `/Users/jiangsheng/cnb/codex/.codex/skills/codex-gui-worktree/scripts/`

- [ ] **Step 1: Verify the target skill directory does not exist**

Run:

```bash
test ! -e /Users/jiangsheng/cnb/codex/.codex/skills/codex-gui-worktree
```

Expected: command exits with status `0`.

- [ ] **Step 2: Initialize the skill with the official helper**

Run:

```bash
python3 /Users/jiangsheng/.codex/skills/.system/skill-creator/scripts/init_skill.py \
  codex-gui-worktree \
  --path /Users/jiangsheng/cnb/codex/.codex/skills \
  --resources scripts \
  --interface display_name="Codex GUI Worktree" \
  --interface short_description="Create sparse codex-gui worktrees and link local dependencies/docs." \
  --interface default_prompt="Create a codex-gui sparse worktree and link the local frontend dependencies and docs."
```

Expected: the helper creates `/Users/jiangsheng/cnb/codex/.codex/skills/codex-gui-worktree`.

- [ ] **Step 3: Inspect generated files**

Run:

```bash
find /Users/jiangsheng/cnb/codex/.codex/skills/codex-gui-worktree -maxdepth 3 -type f | sort
```

Expected output includes:

```text
/Users/jiangsheng/cnb/codex/.codex/skills/codex-gui-worktree/SKILL.md
/Users/jiangsheng/cnb/codex/.codex/skills/codex-gui-worktree/agents/openai.yaml
```

## Task 2: Write the Skill Instructions

**Files:**
- Modify: `/Users/jiangsheng/cnb/codex/.codex/skills/codex-gui-worktree/SKILL.md`

- [ ] **Step 1: Replace `SKILL.md` with final instructions**

Write this content:

```markdown
---
name: codex-gui-worktree
description: Create and prepare lightweight sparse git worktrees for codex-gui parallel frontend work in /Users/jiangsheng/cnb/codex, including sparse checkout setup, local node_modules reuse, HeroUI docs links, Redux Toolkit docs links, and sibling Vitest docs access. Use when the user asks to create, prepare, bootstrap, repair, or automate a codex-gui worktree.
---

# codex-gui Worktree

Use this skill to create or prepare sparse `codex-gui` worktrees for parallel frontend work in `/Users/jiangsheng/cnb/codex`.

## Rules

- Before creating a worktree or symlink, print the exact command and target paths and wait for user confirmation, unless the user explicitly says to execute directly.
- Do not install dependencies.
- Do not download documentation.
- Do not stage or commit.
- Do not overwrite existing branches, worktrees, files, directories, or symlinks.
- Stop on conflicts and print the exact path that blocks progress.

## Default Layout

Defaults:

```text
repo root: /Users/jiangsheng/cnb/codex
worktree root: /Users/jiangsheng/cnb/codex/.worktrees
base branch: dev
```

Default sparse checkout paths:

```text
codex-gui
codex-rs/app-server-protocol/schema/typescript
```

Add task-specific paths with `--include`, for example:

```text
docs/superpowers/plans/2026-06-22-codex-gui-frontend-refactor
```

## Script

Use the bundled script:

```bash
bash /Users/jiangsheng/cnb/codex/.codex/skills/codex-gui-worktree/scripts/create-codex-gui-worktree.sh \
  --name gui-transcript-state \
  --branch codex/gui-transcript-state \
  --base dev \
  --include docs/superpowers/plans/2026-06-22-codex-gui-frontend-refactor
```

The script creates the sparse worktree, links local dependency and documentation caches, and verifies the result.

## Linked Resources

The script links these resources:

```text
codex-gui/node_modules
  -> /Users/jiangsheng/cnb/codex/codex-gui/node_modules

codex-gui/.heroui-docs/react
  -> /Users/jiangsheng/cnb/codex/codex-gui/.heroui-docs/react

codex-gui/.redux-toolkit-docs/redux
  -> /Users/jiangsheng/cnb/codex/codex-gui/.redux-toolkit-docs/redux

codex-gui/.redux-toolkit-docs/toolkit
  -> /Users/jiangsheng/cnb/codex/codex-gui/.redux-toolkit-docs/toolkit

/Users/jiangsheng/cnb/codex/.worktrees/vitest
  -> /Users/jiangsheng/cnb/vitest
```

For `.heroui-docs` and `.redux-toolkit-docs`, keep the ignored root directories as real directories and link their children. Directory-level symlinks appear as untracked files because the existing `.gitignore` rules are directory rules.

## Verification

After running the script, report:

- worktree path
- branch
- sparse checkout list
- linked resources
- `git status --short --branch`

If verification fails, report the failing command and do not continue to implementation work.
```

- [ ] **Step 2: Check for incomplete markers**

Run:

```bash
rg -n "TODO|TBD|fill in|implement later|待定|占位" /Users/jiangsheng/cnb/codex/.codex/skills/codex-gui-worktree/SKILL.md
```

Expected: no matches.

## Task 3: Implement the Worktree Creation Script

**Files:**
- Create: `/Users/jiangsheng/cnb/codex/.codex/skills/codex-gui-worktree/scripts/create-codex-gui-worktree.sh`

- [ ] **Step 1: Create the script**

Write this content:

```bash
#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="/Users/jiangsheng/cnb/codex"
WORKTREE_ROOT="$REPO_ROOT/.worktrees"
DEFAULT_BASE="dev"
DEFAULT_SPARSE_PATHS=(
  "codex-gui"
  "codex-rs/app-server-protocol/schema/typescript"
)

usage() {
  cat <<'EOF'
Usage:
  create-codex-gui-worktree.sh --name NAME --branch BRANCH [--base BASE] [--include PATH ...]

Creates a sparse codex-gui worktree under /Users/jiangsheng/cnb/codex/.worktrees,
then links local node_modules and frontend documentation caches.

Required:
  --name NAME       Worktree directory name under .worktrees
  --branch BRANCH   New branch name to create for the worktree

Optional:
  --base BASE       Base branch or commit. Defaults to dev
  --include PATH    Additional sparse checkout path. Can be repeated
  --help            Show this help
EOF
}

die() {
  printf 'error: %s\n' "$*" >&2
  exit 1
}

info() {
  printf '%s\n' "$*"
}

require_path_exists() {
  local path="$1"
  [[ -e "$path" ]] || die "required path does not exist: $path"
}

ensure_absent() {
  local path="$1"
  [[ ! -e "$path" && ! -L "$path" ]] || die "target already exists: $path"
}

ensure_symlink() {
  local source="$1"
  local target="$2"
  require_path_exists "$source"

  if [[ -L "$target" ]]; then
    local current
    current="$(readlink "$target")"
    if [[ "$current" == "$source" ]]; then
      info "already linked: $target -> $source"
      return
    fi
    die "symlink points to unexpected target: $target -> $current"
  fi

  if [[ -e "$target" ]]; then
    die "target exists and is not a symlink: $target"
  fi

  ln -s "$source" "$target"
  info "linked: $target -> $source"
}

NAME=""
BRANCH=""
BASE="$DEFAULT_BASE"
INCLUDE_PATHS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --name)
      [[ $# -ge 2 ]] || die "--name requires a value"
      NAME="$2"
      shift 2
      ;;
    --branch)
      [[ $# -ge 2 ]] || die "--branch requires a value"
      BRANCH="$2"
      shift 2
      ;;
    --base)
      [[ $# -ge 2 ]] || die "--base requires a value"
      BASE="$2"
      shift 2
      ;;
    --include)
      [[ $# -ge 2 ]] || die "--include requires a value"
      INCLUDE_PATHS+=("$2")
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      die "unknown argument: $1"
      ;;
  esac
done

[[ -n "$NAME" ]] || die "--name is required"
[[ -n "$BRANCH" ]] || die "--branch is required"
[[ "$NAME" != */* ]] || die "--name must be a single directory name, got: $NAME"

cd "$REPO_ROOT"

ACTUAL_ROOT="$(git rev-parse --show-toplevel)"
[[ "$ACTUAL_ROOT" == "$REPO_ROOT" ]] || die "unexpected repo root: $ACTUAL_ROOT"

require_path_exists "$WORKTREE_ROOT"
git check-ignore -q "$WORKTREE_ROOT" || die "$WORKTREE_ROOT is not ignored by git"

WORKTREE_PATH="$WORKTREE_ROOT/$NAME"
ensure_absent "$WORKTREE_PATH"

if git show-ref --verify --quiet "refs/heads/$BRANCH"; then
  die "branch already exists: $BRANCH"
fi

for sparse_path in "${DEFAULT_SPARSE_PATHS[@]}" "${INCLUDE_PATHS[@]}"; do
  require_path_exists "$REPO_ROOT/$sparse_path"
done

require_path_exists "$REPO_ROOT/codex-gui/node_modules"
require_path_exists "$REPO_ROOT/codex-gui/.heroui-docs/react"
require_path_exists "$REPO_ROOT/codex-gui/.redux-toolkit-docs/redux"
require_path_exists "$REPO_ROOT/codex-gui/.redux-toolkit-docs/toolkit"
require_path_exists "/Users/jiangsheng/cnb/vitest/docs"

git worktree add --no-checkout "$WORKTREE_PATH" -b "$BRANCH" "$BASE"

cd "$WORKTREE_PATH"
git sparse-checkout init --cone
git sparse-checkout set "${DEFAULT_SPARSE_PATHS[@]}" "${INCLUDE_PATHS[@]}"
git checkout

ensure_symlink "$REPO_ROOT/codex-gui/node_modules" "$WORKTREE_PATH/codex-gui/node_modules"

mkdir -p "$WORKTREE_PATH/codex-gui/.heroui-docs"
ensure_symlink "$REPO_ROOT/codex-gui/.heroui-docs/react" "$WORKTREE_PATH/codex-gui/.heroui-docs/react"

mkdir -p "$WORKTREE_PATH/codex-gui/.redux-toolkit-docs"
ensure_symlink "$REPO_ROOT/codex-gui/.redux-toolkit-docs/redux" "$WORKTREE_PATH/codex-gui/.redux-toolkit-docs/redux"
ensure_symlink "$REPO_ROOT/codex-gui/.redux-toolkit-docs/toolkit" "$WORKTREE_PATH/codex-gui/.redux-toolkit-docs/toolkit"

ensure_symlink "/Users/jiangsheng/cnb/vitest" "$WORKTREE_ROOT/vitest"

test -d "$WORKTREE_PATH/codex-gui/node_modules"
test -d "$WORKTREE_PATH/codex-gui/.heroui-docs/react/components"
test -f "$WORKTREE_PATH/codex-gui/.redux-toolkit-docs/redux/style-guide.md"
test -f "$WORKTREE_PATH/codex-gui/.redux-toolkit-docs/toolkit/api/createSlice.mdx"
test -d "$WORKTREE_PATH/../vitest/docs/api/browser"
test -d "$WORKTREE_PATH/../vitest/docs/guide/browser"
test -d "$WORKTREE_PATH/../vitest/docs/config/browser"

info ""
info "Worktree ready:"
info "  path: $WORKTREE_PATH"
info "  branch: $BRANCH"
info ""
info "Sparse checkout:"
git sparse-checkout list
info ""
info "Git status:"
git status --short --branch
```

- [ ] **Step 2: Make the script executable**

Run:

```bash
chmod +x /Users/jiangsheng/cnb/codex/.codex/skills/codex-gui-worktree/scripts/create-codex-gui-worktree.sh
```

Expected: command exits with status `0`.

## Task 4: Validate Script Non-Mutating Paths

**Files:**
- Test: `/Users/jiangsheng/cnb/codex/.codex/skills/codex-gui-worktree/scripts/create-codex-gui-worktree.sh`

- [ ] **Step 1: Verify help output**

Run:

```bash
bash /Users/jiangsheng/cnb/codex/.codex/skills/codex-gui-worktree/scripts/create-codex-gui-worktree.sh --help
```

Expected: output starts with:

```text
Usage:
  create-codex-gui-worktree.sh --name NAME --branch BRANCH
```

- [ ] **Step 2: Verify missing arguments fail before mutation**

Run:

```bash
bash /Users/jiangsheng/cnb/codex/.codex/skills/codex-gui-worktree/scripts/create-codex-gui-worktree.sh
```

Expected: command fails with:

```text
error: --name is required
```

- [ ] **Step 3: Verify no worktree was created by validation**

Run:

```bash
git -C /Users/jiangsheng/cnb/codex worktree list --porcelain
```

Expected: no new worktree appears from Task 4.

## Task 5: Validate the Skill

**Files:**
- Test: `/Users/jiangsheng/cnb/codex/.codex/skills/codex-gui-worktree`

- [ ] **Step 1: Run skill validation**

Run:

```bash
python3 /Users/jiangsheng/.codex/skills/.system/skill-creator/scripts/quick_validate.py \
  /Users/jiangsheng/cnb/codex/.codex/skills/codex-gui-worktree
```

Expected: validation passes.

- [ ] **Step 2: Inspect final status**

Run:

```bash
git -C /Users/jiangsheng/cnb/codex status --short -- .codex/skills/codex-gui-worktree
```

Expected: only the new skill files are listed.

## Task 6: Optional Live Smoke Test

**Files:**
- Test: `/Users/jiangsheng/cnb/codex/.codex/skills/codex-gui-worktree/scripts/create-codex-gui-worktree.sh`

- [ ] **Step 1: Ask before creating a real smoke-test worktree**

Print this exact proposed command and wait for confirmation:

```bash
bash /Users/jiangsheng/cnb/codex/.codex/skills/codex-gui-worktree/scripts/create-codex-gui-worktree.sh \
  --name gui-worktree-smoke \
  --branch codex/gui-worktree-smoke \
  --base dev
```

Expected: do not run it until the user confirms.

- [ ] **Step 2: Run the smoke test only after confirmation**

Run the command from Step 1.

Expected output includes:

```text
Worktree ready:
  path: /Users/jiangsheng/cnb/codex/.worktrees/gui-worktree-smoke
  branch: codex/gui-worktree-smoke
```

- [ ] **Step 3: Report cleanup command instead of deleting automatically**

Print:

```bash
git -C /Users/jiangsheng/cnb/codex worktree remove /Users/jiangsheng/cnb/codex/.worktrees/gui-worktree-smoke
git -C /Users/jiangsheng/cnb/codex branch -D codex/gui-worktree-smoke
```

Expected: do not remove the smoke-test worktree unless the user explicitly asks.
