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

print_cleanup_hint() {
  cat >&2 <<EOF
error: setup failed after worktree creation. Inspect or clean up with:
  git -C "$REPO_ROOT" worktree remove --force "$WORKTREE_PATH"
  git -C "$REPO_ROOT" branch -D "$BRANCH"
EOF
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

SPARSE_PATHS=("${DEFAULT_SPARSE_PATHS[@]}")
if ((${#INCLUDE_PATHS[@]} > 0)); then
  SPARSE_PATHS+=("${INCLUDE_PATHS[@]}")
fi

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

REMOTE_BRANCH="$(git for-each-ref --format='%(refname:short)' "refs/remotes/*/$BRANCH" | head -n 1)"
if [[ -n "$REMOTE_BRANCH" ]]; then
  die "remote branch already exists: $REMOTE_BRANCH"
fi

for sparse_path in "${SPARSE_PATHS[@]}"; do
  require_path_exists "$REPO_ROOT/$sparse_path"
done

require_path_exists "$REPO_ROOT/codex-gui/node_modules"
require_path_exists "$REPO_ROOT/codex-gui/.heroui-docs/react"
require_path_exists "$REPO_ROOT/codex-gui/.redux-toolkit-docs/redux"
require_path_exists "$REPO_ROOT/codex-gui/.redux-toolkit-docs/toolkit"
require_path_exists "/Users/jiangsheng/cnb/vitest/docs"

git worktree add --no-checkout "$WORKTREE_PATH" -b "$BRANCH" "$BASE"
trap print_cleanup_hint ERR

cd "$WORKTREE_PATH"
git sparse-checkout init --cone
git sparse-checkout set "${SPARSE_PATHS[@]}"
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
trap - ERR
