#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$script_dir/lib-release-promotion.sh"

test_branch="test"
release_branch="release"
message="merge(release): sync test"
dry_run=false
continue_mode=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --test)
      test_branch="${2:?missing value for --test}"
      shift 2
      ;;
    --release)
      release_branch="${2:?missing value for --release}"
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
rp_require_local_branch "$test_branch"
rp_require_local_branch "$release_branch"

release_version="$(rp_version_from_branch "$release_branch")"
if [[ -z "$release_version" ]]; then
  rp_die "could not read release version from $release_branch"
fi

if [[ "$dry_run" == true ]]; then
  rp_log preflight "dry-run only; no branch switch, merge, stage, or commit"
  rp_log preflight "test=$test_branch $(rp_git rev-parse --short "$test_branch")"
  rp_log preflight "release=$release_branch $(rp_git rev-parse --short "$release_branch")"
  rp_log merge-test-to-release "release version: $release_version"
  rp_git diff --name-status "$release_branch..$test_branch" || true
  exit 0
fi

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

  local current_branch
  current_branch="$(rp_git branch --show-current)"
  if [[ "$current_branch" != "$release_branch" ]]; then
    rp_die "--continue must run on $release_branch; current branch: ${current_branch:-detached HEAD}"
  fi
}

rp_require_merge_head_matches_test() {
  local git_dir
  git_dir="$(rp_git_dir)"

  if [[ ! -e "$git_dir/MERGE_HEAD" ]]; then
    rp_die "expected MERGE_HEAD before committing merge"
  fi

  local test_commit
  test_commit="$(rp_git rev-parse "$test_branch")"

  local merge_head
  merge_head="$(rp_git rev-parse MERGE_HEAD)"

  if [[ "$merge_head" != "$test_commit" ]]; then
    rp_die "MERGE_HEAD does not match $test_branch: MERGE_HEAD=$merge_head $test_branch=$test_commit"
  fi
}

rp_require_head_merge_parent_matches_test() {
  local test_commit
  test_commit="$(rp_git rev-parse "$test_branch")"

  local parent_line
  parent_line="$(rp_git rev-list --parents -n 1 HEAD)"

  local -a commits
  read -r -a commits <<< "$parent_line"
  if (( ${#commits[@]} < 3 )); then
    rp_die "HEAD is not a merge commit: $(rp_git rev-parse --short HEAD)"
  fi

  local parent
  for parent in "${commits[@]:1}"; do
    if [[ "$parent" == "$test_commit" ]]; then
      return 0
    fi
  done

  rp_die "HEAD merge commit does not include $test_branch as a parent"
}

if [[ "$continue_mode" != true ]]; then
  rp_require_no_in_progress_operation
  rp_require_clean_worktree
else
  rp_require_no_incompatible_continue_operation
  rp_require_continue_merge_state
fi

preserve_release_version() {
  local current_version
  current_version="$(rp_version_from_file codex-rs/Cargo.toml)"
  if [[ "$current_version" == "$release_version" ]]; then
    return 0
  fi

  rp_log merge-test-to-release "restoring release version $release_version in codex-rs/Cargo.toml"
  rp_set_workspace_package_version_in_file codex-rs/Cargo.toml "$release_version"
  rp_git add codex-rs/Cargo.toml
}

if [[ "$continue_mode" == true ]]; then
  rp_log merge-test-to-release "continuing existing merge"
else
  rp_log merge-test-to-release "switching to $release_branch"
  rp_git switch "$release_branch"
  rp_log merge-test-to-release "merging $test_branch into $release_branch without committing"
  if ! rp_git merge --no-ff --no-commit "$test_branch"; then
    rp_unmerged_paths >&2
    rp_print_conflict_guidance "$0"
    exit 1
  fi
fi

if rp_has_unmerged_paths; then
  rp_unmerged_paths >&2
  rp_print_conflict_guidance "$0"
  exit 1
fi

preserve_release_version

if [[ "$(rp_version_from_file codex-rs/Cargo.toml)" != "$release_version" ]]; then
  rp_die "release version was not preserved"
fi

rp_log verify "checking staged diff"
rp_git diff --cached --check

rp_log verify "checking MERGE_HEAD matches $test_branch"
rp_require_merge_head_matches_test

rp_log merge-test-to-release "committing merge"
rp_git commit -m "$message"
rp_git merge-base --is-ancestor "$test_branch" HEAD

rp_log verify "checking HEAD merge parent includes $test_branch"
rp_require_head_merge_parent_matches_test

if [[ "$(rp_version_from_file codex-rs/Cargo.toml)" != "$release_version" ]]; then
  rp_die "post-commit release version changed unexpectedly"
fi

rp_log verify "test-to-release merge complete: $(rp_git rev-parse --short HEAD)"
