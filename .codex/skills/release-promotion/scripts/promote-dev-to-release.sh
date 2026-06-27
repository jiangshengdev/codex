#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$script_dir/lib-release-promotion.sh"

dev_branch="dev"
test_branch="test"
release_branch="release"
target_version=""
target_version_provided=false
dry_run=false
continue_mode=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dev)
      dev_branch="${2:?missing value for --dev}"
      shift 2
      ;;
    --test)
      test_branch="${2:?missing value for --test}"
      shift 2
      ;;
    --release)
      release_branch="${2:?missing value for --release}"
      shift 2
      ;;
    --target-version)
      target_version="${2:?missing value for --target-version}"
      target_version_provided=true
      shift 2
      ;;
    --dry-run)
      dry_run=true
      shift
      ;;
    --continue)
      continue_mode=true
      shift
      ;;
    *)
      rp_die "unknown argument: $1"
      ;;
  esac
done

rp_cd_repo_root
rp_require_local_branch "$dev_branch"
rp_require_local_branch "$test_branch"
rp_require_local_branch "$release_branch"

release_version="$(rp_version_from_branch "$release_branch")"
if [[ -z "$release_version" ]]; then
  rp_die "could not read release version"
fi

computed_target="$(rp_next_cdx_version "$release_version")"
if [[ -z "$target_version" ]]; then
  target_version="$computed_target"
fi

if [[ "$continue_mode" == true && "$target_version_provided" != true ]]; then
  rp_die "--continue requires --target-version"
fi

if [[ "$dry_run" == true ]]; then
  rp_log preflight "dry-run only; wrapper will not switch branches or write files"
  rp_log preflight "dev=$dev_branch $(rp_git rev-parse --short "$dev_branch")"
  rp_log preflight "test=$test_branch $(rp_git rev-parse --short "$test_branch")"
  rp_log preflight "release=$release_branch $(rp_git rev-parse --short "$release_branch")"
  rp_log bump-version "release version: $release_version"
  rp_log bump-version "target version: $target_version"
  "$script_dir/merge-dev-to-test-without-superpowers.sh" --dev "$dev_branch" --test "$test_branch" --dry-run
  "$script_dir/merge-test-to-release.sh" --test "$test_branch" --release "$release_branch" --dry-run
  "$script_dir/bump-release-cdx-version.sh" --release "$release_branch" --target-version "$target_version" --dry-run
  exit 0
fi

dev_is_in_test() {
  rp_git merge-base --is-ancestor "$dev_branch" "$test_branch"
}

test_is_in_release() {
  rp_git merge-base --is-ancestor "$test_branch" "$release_branch"
}

release_is_target_version() {
  [[ "$(rp_version_from_branch "$release_branch")" == "$target_version" ]]
}

rp_require_no_incompatible_continue_operation() {
  local git_dir
  git_dir="$(rp_git_dir)"

  if [[ -e "$git_dir/CHERRY_PICK_HEAD" ]]; then
    rp_die "cherry-pick is already in progress; resolve it manually first"
  fi

  if [[ -e "$git_dir/REBASE_HEAD" || -d "$git_dir/rebase-merge" || -d "$git_dir/rebase-apply" ]]; then
    rp_die "rebase is already in progress; resolve it manually first"
  fi

  if [[ -e "$git_dir/BISECT_LOG" ]]; then
    rp_die "bisect is active; finish it before running release promotion"
  fi
}

rp_require_continue_merge_state() {
  local git_dir
  git_dir="$(rp_git_dir)"

  if [[ ! -e "$git_dir/MERGE_HEAD" ]]; then
    rp_die "--continue requires an in-progress merge"
  fi
}

continue_release_promotion() {
  rp_require_no_incompatible_continue_operation
  rp_require_continue_merge_state

  local current_branch
  current_branch="$(rp_git branch --show-current)"

  if [[ "$current_branch" == "$test_branch" ]]; then
    "$script_dir/merge-dev-to-test-without-superpowers.sh" --dev "$dev_branch" --test "$test_branch" --continue
  elif [[ "$current_branch" == "$release_branch" ]]; then
    "$script_dir/merge-test-to-release.sh" --test "$test_branch" --release "$release_branch" --continue
  else
    rp_die "--continue must run on $test_branch or $release_branch; current branch: ${current_branch:-detached HEAD}"
  fi
}

if [[ "$continue_mode" == true ]]; then
  continue_release_promotion
else
  rp_require_no_in_progress_operation
  rp_require_clean_worktree

  if dev_is_in_test; then
    rp_log merge-dev-to-test "already complete; $dev_branch is ancestor of $test_branch"
  else
    "$script_dir/merge-dev-to-test-without-superpowers.sh" --dev "$dev_branch" --test "$test_branch"
  fi
fi

if test_is_in_release; then
  rp_log merge-test-to-release "already complete; $test_branch is ancestor of $release_branch"
else
  "$script_dir/merge-test-to-release.sh" --test "$test_branch" --release "$release_branch"
fi

if release_is_target_version; then
  rp_log bump-version "already at target version $target_version"
else
  "$script_dir/bump-release-cdx-version.sh" --release "$release_branch" --target-version "$target_version"
fi

rp_git switch "$release_branch"
rp_git merge-base --is-ancestor "$dev_branch" "$test_branch"
rp_git merge-base --is-ancestor "$test_branch" "$release_branch"

if [[ "$(rp_version_from_file codex-rs/Cargo.toml)" != "$target_version" ]]; then
  rp_die "final release version mismatch"
fi

rp_require_clean_worktree
rp_log verify "release promotion complete at $(rp_git rev-parse --short HEAD)"
