#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
DEFAULT_REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel 2>/dev/null || true)"
DEFAULT_BASE="dev"
DEFAULT_SPARSE_PATHS=(
  "codex-gui"
  "codex-rs/app-server-protocol/schema/typescript"
)

usage() {
  cat <<'EOF'
Usage:
  create-codex-gui-worktree.sh --name NAME --branch BRANCH [options]

Creates a sparse codex-gui worktree, then links local node_modules and
frontend documentation caches.

Required:
  --name NAME       Worktree directory name under .worktrees
  --branch BRANCH   New branch name to create for the worktree

Optional:
  --base BASE          Base branch or commit. Defaults to dev
  --include PATH       Additional sparse checkout path. Can be repeated
  --repo-root PATH     Codex repo root. Defaults to this script's git root
  --worktree-root PATH Worktree parent. Defaults to <repo-root>/.worktrees
  --vitest-root PATH   Vitest checkout. Defaults to <repo-root>/../vitest
  --help               Show this help

Environment overrides:
  CODEX_GUI_WORKTREE_REPO_ROOT
  CODEX_GUI_WORKTREE_ROOT
  CODEX_GUI_WORKTREE_VITEST_ROOT
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

require_dir_exists() {
  local path="$1"
  [[ -d "$path" ]] || die "required directory does not exist: $path"
}

normalize_path_preserving_leaf() {
  local path="$1"
  local parent
  local leaf
  parent="$(dirname "$path")"
  leaf="$(basename "$path")"
  parent="$(cd "$parent" && pwd -P)"
  printf '%s/%s\n' "$parent" "$leaf"
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
REPO_ROOT="${CODEX_GUI_WORKTREE_REPO_ROOT:-}"
WORKTREE_ROOT="${CODEX_GUI_WORKTREE_ROOT:-}"
VITEST_ROOT="${CODEX_GUI_WORKTREE_VITEST_ROOT:-}"
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
    --repo-root)
      [[ $# -ge 2 ]] || die "--repo-root requires a value"
      REPO_ROOT="$2"
      shift 2
      ;;
    --worktree-root)
      [[ $# -ge 2 ]] || die "--worktree-root requires a value"
      WORKTREE_ROOT="$2"
      shift 2
      ;;
    --vitest-root)
      [[ $# -ge 2 ]] || die "--vitest-root requires a value"
      VITEST_ROOT="$2"
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
if [[ -z "$REPO_ROOT" ]]; then
  [[ -n "$DEFAULT_REPO_ROOT" ]] || die "unable to infer repo root; pass --repo-root or set CODEX_GUI_WORKTREE_REPO_ROOT"
  REPO_ROOT="$DEFAULT_REPO_ROOT"
fi

WORKTREE_ROOT="${WORKTREE_ROOT:-$REPO_ROOT/.worktrees}"
VITEST_ROOT="${VITEST_ROOT:-$REPO_ROOT/../vitest}"
require_dir_exists "$REPO_ROOT"
REPO_ROOT="$(cd "$REPO_ROOT" && pwd -P)"
require_dir_exists "$WORKTREE_ROOT"
WORKTREE_ROOT="$(cd "$WORKTREE_ROOT" && pwd -P)"

SPARSE_PATHS=("${DEFAULT_SPARSE_PATHS[@]}")
if ((${#INCLUDE_PATHS[@]} > 0)); then
  SPARSE_PATHS+=("${INCLUDE_PATHS[@]}")
fi

cd "$REPO_ROOT"

ACTUAL_ROOT="$(git rev-parse --show-toplevel)"
[[ "$ACTUAL_ROOT" == "$REPO_ROOT" ]] || die "unexpected repo root: $ACTUAL_ROOT"

case "$WORKTREE_ROOT/" in
  "$REPO_ROOT"/*)
    git check-ignore -q "$WORKTREE_ROOT" || die "$WORKTREE_ROOT is not ignored by git"
    ;;
esac

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
if [[ ! -d "$VITEST_ROOT/docs" ]]; then
  die "required directory does not exist: $VITEST_ROOT/docs; pass --vitest-root or set CODEX_GUI_WORKTREE_VITEST_ROOT"
fi
VITEST_ROOT="$(normalize_path_preserving_leaf "$VITEST_ROOT")"

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

ensure_symlink "$VITEST_ROOT" "$WORKTREE_ROOT/vitest"

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
