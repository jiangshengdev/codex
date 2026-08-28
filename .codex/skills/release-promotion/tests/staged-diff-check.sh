#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$script_dir/../scripts/lib-release-promotion.sh"

tmp_root="$(mktemp -d)"
trap 'rm -rf "$tmp_root"' EXIT

fail() {
  printf '[test error] %s\n' "$*" >&2
  exit 1
}

new_repo() {
  local name="$1"
  local repo="$tmp_root/$name"
  mkdir -p "$repo"
  git -C "$repo" init -q --initial-branch=base
  git -C "$repo" config user.name test
  git -C "$repo" config user.email test@example.com
  printf 'base\n' >"$repo/README.md"
  git -C "$repo" add README.md
  git -C "$repo" commit -qm base
  printf '%s\n' "$repo"
}

stage_source_snapshot() {
  local repo="$1"
  local expression="$2"
  local rendered_line="$3"
  local path="codex-rs/tui/src/bottom_pane/snapshots/test.snap"

  git -C "$repo" switch -qc source
  mkdir -p "$repo/$(dirname "$path")"
  printf '%s\n' '---' "expression: \"$expression\"" '---' "$rendered_line" >"$repo/$path"
  git -C "$repo" add "$path"
  git -C "$repo" commit -qm source
  local source_commit
  source_commit="$(git -C "$repo" rev-parse HEAD)"
  git -C "$repo" switch -q base
  git -C "$repo" checkout source -- "$path"
  printf '%s\n' "$source_commit"
}

expect_pass() {
  local name="$1"
  local repo="$2"
  local source_commit="$3"
  (
    cd "$repo"
    rp_require_staged_diff_check_for_merge "$source_commit"
  ) || fail "$name should pass"
}

expect_fail() {
  local name="$1"
  local repo="$2"
  local source_commit="$3"
  if (
    cd "$repo"
    rp_require_staged_diff_check_for_merge "$source_commit"
  ) >/dev/null 2>&1; then
    fail "$name should fail"
  fi
}

repo="$(new_repo valid)"
source_commit="$(stage_source_snapshot "$repo" 'render_lines(&view, 10)' 'row       ')"
expect_pass valid "$repo" "$source_commit"

repo="$(new_repo source-whitespace)"
source_commit="$(stage_source_snapshot "$repo" 'render_lines(&view, 10)' 'row       ')"
printf 'bad   \n' >"$repo/bad.rs"
git -C "$repo" add bad.rs
expect_fail source-whitespace "$repo" "$source_commit"

repo="$(new_repo ordinary-snapshot)"
source_commit="$(stage_source_snapshot "$repo" 'other_renderer(10)' 'row       ')"
expect_fail ordinary-snapshot "$repo" "$source_commit"

repo="$(new_repo short-row)"
source_commit="$(stage_source_snapshot "$repo" 'render_lines(&view, 10)' 'row      ')"
expect_fail short-row "$repo" "$source_commit"

repo="$(new_repo long-row)"
source_commit="$(stage_source_snapshot "$repo" 'render_lines(&view, 10)' 'row        ')"
expect_fail long-row "$repo" "$source_commit"

repo="$(new_repo index-diverged)"
source_commit="$(stage_source_snapshot "$repo" 'render_lines(&view, 10)' 'row       ')"
snapshot_path="codex-rs/tui/src/bottom_pane/snapshots/test.snap"
printf '%s\n' '---' 'expression: "render_lines(&view, 10)"' '---' 'edit      ' >"$repo/$snapshot_path"
git -C "$repo" add "$snapshot_path"
expect_fail index-diverged "$repo" "$source_commit"

repo="$(new_repo space-before-tab)"
source_commit="$(stage_source_snapshot "$repo" 'render_lines(&view, 10)' $' \trow')"
expect_fail space-before-tab "$repo" "$source_commit"

printf '[test] staged merge diff checks passed\n'
