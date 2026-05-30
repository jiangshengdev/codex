#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: update-docs.sh [REPO_ROOT]

Refresh codex-gui/.redux-toolkit-docs from official Redux repositories.

Arguments:
  REPO_ROOT  Repository root that contains codex-gui/. Defaults to git root.

Environment:
  REDUX_REF  reduxjs/redux ref to download. Defaults to master.
  RTK_REF    reduxjs/redux-toolkit ref to download. Defaults to master.
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    printf 'error: required command not found: %s\n' "$1" >&2
    exit 1
  fi
}

require_command gh
require_command tar
require_command rsync
require_command mktemp

if [[ $# -gt 1 ]]; then
  usage >&2
  exit 1
fi

repo_root="${1:-}"
if [[ -z "$repo_root" ]]; then
  repo_root="$(git rev-parse --show-toplevel 2>/dev/null || true)"
fi

if [[ -z "$repo_root" || ! -d "$repo_root/codex-gui" ]]; then
  printf 'error: could not find repository root containing codex-gui\n' >&2
  exit 1
fi

docs_root="$repo_root/codex-gui/.redux-toolkit-docs"
redux_ref="${REDUX_REF:-master}"
rtk_ref="${RTK_REF:-master}"
tmpdir="$(mktemp -d "${TMPDIR:-/tmp}/redux-toolkit-docs.XXXXXX")"

cleanup() {
  rm -rf "$tmpdir"
}
trap cleanup EXIT

download_archive() {
  local repo="$1"
  local ref="$2"
  local output="$3"

  printf 'Downloading %s@%s...\n' "$repo" "$ref"
  gh api "/repos/$repo/tarball/$ref" > "$output"
}

extract_archive() {
  local archive="$1"
  local output_dir="$2"

  mkdir -p "$output_dir"
  tar -xzf "$archive" -C "$output_dir"
  find "$output_dir" -maxdepth 1 -mindepth 1 -type d | head -n 1
}

redux_archive="$tmpdir/redux.tgz"
rtk_archive="$tmpdir/redux-toolkit.tgz"

download_archive reduxjs/redux "$redux_ref" "$redux_archive"
download_archive reduxjs/redux-toolkit "$rtk_ref" "$rtk_archive"

redux_checkout="$(extract_archive "$redux_archive" "$tmpdir/redux")"
rtk_checkout="$(extract_archive "$rtk_archive" "$tmpdir/redux-toolkit")"

if [[ ! -f "$redux_checkout/docs/style-guide/style-guide.md" ]]; then
  printf 'error: Redux style guide not found in archive\n' >&2
  exit 1
fi

if [[ ! -d "$rtk_checkout/docs" ]]; then
  printf 'error: Redux Toolkit docs directory not found in archive\n' >&2
  exit 1
fi

mkdir -p "$docs_root/toolkit" "$docs_root/redux"
rsync -a --delete "$rtk_checkout/docs/" "$docs_root/toolkit/"
cp "$redux_checkout/docs/style-guide/style-guide.md" "$docs_root/redux/style-guide.md"

printf 'Updated %s\n' "$docs_root"
find "$docs_root" -type f | wc -l | awk '{printf "Files: %s\n", $1}'
