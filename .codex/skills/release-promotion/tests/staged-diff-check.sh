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

stage_snapshot() {
  local repo="$1"
  local path="fixtures/test.snap"

  mkdir -p "$repo/$(dirname "$path")"
  printf '%s\n' '---' 'expression: rendered' '---' 'row       ' >"$repo/$path"
  git -C "$repo" add "$path"
}

expect_pass() {
  local name="$1"
  local repo="$2"
  (
    cd "$repo"
    rp_require_staged_diff_check_for_merge
  ) || fail "$name should pass"
}

expect_fail() {
  local name="$1"
  local repo="$2"
  if (
    cd "$repo"
    rp_require_staged_diff_check_for_merge
  ) >/dev/null 2>&1; then
    fail "$name should fail"
  fi
}

repo="$(new_repo snapshot-whitespace)"
stage_snapshot "$repo"
expect_pass snapshot-whitespace "$repo"

repo="$(new_repo source-whitespace)"
printf 'bad   \n' >"$repo/bad.rs"
git -C "$repo" add bad.rs
expect_fail source-whitespace "$repo"

printf '[test] staged merge diff checks passed\n'
