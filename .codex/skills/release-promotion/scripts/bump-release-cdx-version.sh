#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$script_dir/lib-release-promotion.sh"

release_branch="release"
target_version=""
message=""
dry_run=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --release)
      release_branch="${2:?missing value for --release}"
      shift 2
      ;;
    --target-version)
      target_version="${2:?missing value for --target-version}"
      shift 2
      ;;
    --message)
      message="${2:?missing value for --message}"
      shift 2
      ;;
    --dry-run)
      dry_run=true
      shift
      ;;
    *)
      rp_die "unknown argument: $1"
      ;;
  esac
done

rp_cd_repo_root
rp_require_local_branch "$release_branch"

current_version="$(rp_version_from_branch "$release_branch")"
if [[ -z "$current_version" ]]; then
  rp_die "could not read release version from $release_branch"
fi

next_version="$(rp_next_cdx_version "$current_version")"

if [[ -z "$target_version" ]]; then
  target_version="$next_version"
fi

if [[ "$target_version" != "$next_version" && "$target_version" != "$current_version" ]]; then
  rp_die "target version must be current version or the next cdx version; current=$current_version target=$target_version"
fi

if [[ -z "$message" ]]; then
  message="release: bump version to $target_version"
fi

if [[ "$dry_run" == true ]]; then
  rp_log bump-version "release=$release_branch"
  rp_log bump-version "current=$current_version"
  rp_log bump-version "target=$target_version"
  exit 0
fi

rp_require_no_in_progress_operation
rp_require_clean_worktree

rp_git switch "$release_branch"

created_commit=false
worktree_version="$(rp_version_from_file codex-rs/Cargo.toml)"
if [[ "$worktree_version" == "$target_version" ]]; then
  rp_log bump-version "version already at target: $target_version"
else
  if [[ "$worktree_version" != "$current_version" ]]; then
    rp_die "worktree version mismatch; expected $current_version got $worktree_version"
  fi

  rp_log bump-version "updating $current_version -> $target_version"
  rp_set_workspace_package_version_in_file codex-rs/Cargo.toml "$target_version"
  rp_git add codex-rs/Cargo.toml
  rp_git diff --cached --check
  rp_git commit -m "$message"
  created_commit=true
fi

if [[ "$created_commit" == true ]]; then
  changed_files="$(rp_git show --name-only --format= HEAD)"
  if [[ "$changed_files" != "codex-rs/Cargo.toml" ]]; then
    printf '%s\n' "$changed_files" >&2
    rp_die "version bump commit must only change codex-rs/Cargo.toml"
  fi
fi

if [[ "$(rp_version_from_file codex-rs/Cargo.toml)" != "$target_version" ]]; then
  rp_die "version bump did not reach target version"
fi

rp_log verify "release version is $target_version"
