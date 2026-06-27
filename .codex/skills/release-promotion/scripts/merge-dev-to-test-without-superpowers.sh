#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$script_dir/lib-release-promotion.sh"

dev_branch="dev"
test_branch="test"
message="merge(test): sync dev without superpowers"
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
    -h | --help)
      sed -n '1,120p' "$0"
      exit 0
      ;;
    *)
      rp_die "unknown argument: $1"
      ;;
  esac
done

rp_cd_repo_root
rp_require_local_branch "$dev_branch"
rp_require_local_branch "$test_branch"

if [[ "$dry_run" == true ]]; then
  rp_log preflight "dry-run only; no branch switch, merge, stage, or commit"
  rp_log preflight "dev=$dev_branch $(rp_git rev-parse --short "$dev_branch")"
  rp_log preflight "test=$test_branch $(rp_git rev-parse --short "$test_branch")"
  rp_log merge-dev-to-test "non-superpowers diff:"
  rp_git diff --name-status "$test_branch..$dev_branch" -- . ':(exclude)docs/superpowers/**' || true
  rp_log exclude-superpowers "excluded docs/superpowers diff:"
  rp_git diff --name-status "$test_branch..$dev_branch" -- docs/superpowers || true
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
  if [[ "$current_branch" != "$test_branch" ]]; then
    rp_die "--continue must run on $test_branch; current branch: ${current_branch:-detached HEAD}"
  fi
}

rp_require_merge_head_matches_dev() {
  local git_dir
  git_dir="$(rp_git_dir)"

  if [[ ! -e "$git_dir/MERGE_HEAD" ]]; then
    rp_die "expected MERGE_HEAD before committing merge"
  fi

  local dev_commit
  dev_commit="$(rp_git rev-parse "$dev_branch")"

  local merge_head
  merge_head="$(rp_git rev-parse MERGE_HEAD)"

  if [[ "$merge_head" != "$dev_commit" ]]; then
    rp_die "MERGE_HEAD does not match $dev_branch: MERGE_HEAD=$merge_head $dev_branch=$dev_commit"
  fi
}

rp_require_head_merge_parent_matches_dev() {
  local dev_commit
  dev_commit="$(rp_git rev-parse "$dev_branch")"

  local parent_line
  parent_line="$(rp_git rev-list --parents -n 1 HEAD)"

  local -a commits
  read -r -a commits <<< "$parent_line"
  if (( ${#commits[@]} < 3 )); then
    rp_die "HEAD is not a merge commit: $(rp_git rev-parse --short HEAD)"
  fi

  local parent
  for parent in "${commits[@]:1}"; do
    if [[ "$parent" == "$dev_commit" ]]; then
      return 0
    fi
  done

  rp_die "HEAD merge commit does not include $dev_branch as a parent"
}

if [[ "$continue_mode" != true ]]; then
  rp_require_no_in_progress_operation
  rp_require_clean_worktree
else
  rp_require_no_incompatible_continue_operation
  rp_require_continue_merge_state
fi

exclude_superpowers_from_merge() {
  local unmerged
  unmerged="$(rp_git diff --name-only --diff-filter=U -- docs/superpowers || true)"
  if [[ -n "$unmerged" ]]; then
    while IFS= read -r path; do
      [[ -n "$path" ]] || continue
      rp_log exclude-superpowers "removing unmerged docs/superpowers path: $path"
      rp_git rm --ignore-unmatch "$path" >/dev/null
    done <<< "$unmerged"
  fi

  if rp_git ls-tree -d --name-only HEAD -- docs/superpowers >/dev/null 2>&1; then
    local restore_error
    if ! restore_error="$(rp_git restore --source=HEAD --staged --worktree -- docs/superpowers 2>&1)"; then
      rp_log exclude-superpowers "restore from HEAD for docs/superpowers failed; staged-docs check will validate exclusion"
      printf '%s\n' "$restore_error" >&2
    fi
  else
    rp_log exclude-superpowers "HEAD has no docs/superpowers tree; skipping restore from HEAD"
  fi

  local staged_docs
  staged_docs="$(rp_git diff --cached --name-only -- docs/superpowers || true)"
  if [[ -n "$staged_docs" ]]; then
    while IFS= read -r path; do
      [[ -n "$path" ]] || continue
      rp_log exclude-superpowers "unstaging excluded docs/superpowers path: $path"
      rp_git restore --staged -- "$path" || true
      rm -rf -- "$path"
    done <<< "$staged_docs"
  fi
}

if [[ "$continue_mode" == true ]]; then
  rp_log merge-dev-to-test "continuing existing merge"
else
  rp_log merge-dev-to-test "switching to $test_branch"
  rp_git switch "$test_branch"
  rp_log merge-dev-to-test "merging $dev_branch into $test_branch without committing"
  if ! rp_git merge --no-ff --no-commit "$dev_branch"; then
    rp_log merge-dev-to-test "merge reported conflicts; applying docs/superpowers exclusion"
  fi
fi

exclude_superpowers_from_merge

if rp_has_unmerged_paths; then
  rp_unmerged_paths >&2
  rp_print_conflict_guidance "$0"
  exit 1
fi

rp_require_no_staged_superpowers_diff

rp_log verify "checking staged diff"
rp_git diff --cached --check

rp_log verify "checking MERGE_HEAD matches $dev_branch"
rp_require_merge_head_matches_dev

rp_log merge-dev-to-test "committing merge"
rp_git commit -m "$message"

rp_log verify "checking HEAD merge parent includes $dev_branch"
rp_require_head_merge_parent_matches_dev
rp_require_head_superpowers_diff_empty
rp_log verify "dev-to-test merge complete: $(rp_git rev-parse --short HEAD)"
