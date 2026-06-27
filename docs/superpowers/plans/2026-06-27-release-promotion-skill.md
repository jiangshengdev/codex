# Release Promotion Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a repo-local release-promotion skill that automates `dev -> test` without `docs/superpowers/**`, then `test -> release`, then a `release` `X.Y.Z-cdx.N+1` version bump.

**Architecture:** Implement the workflow as Bash scripts under `.codex/skills/release-promotion/scripts/`, with one shared library for git safety checks, logging, version parsing, and verification helpers. Each phase script is independently runnable; the wrapper script orchestrates the phases, supports `--dry-run` and `--continue`, and relies on git topology rather than a state file.

**Tech Stack:** Bash, git, repo-local Codex skills, Markdown documentation.

---

## File Structure

Create these files:

- `.codex/skills/release-promotion/SKILL.md`
  - Skill entrypoint for Codex and human users.
  - Documents when to use the skill, commands, safety boundaries, dry-run, continue, and conflict recovery.
- `.codex/skills/release-promotion/scripts/lib-release-promotion.sh`
  - Shared Bash library.
  - Owns logging, argument helpers, safe git wrapper, repo-root detection, clean preflight, merge-state detection, branch checks, version parsing, and verification helpers.
- `.codex/skills/release-promotion/scripts/merge-dev-to-test-without-superpowers.sh`
  - Phase 1 script.
  - Performs or continues the `dev -> test` merge while excluding `docs/superpowers/**`.
- `.codex/skills/release-promotion/scripts/merge-test-to-release.sh`
  - Phase 2 script.
  - Performs or continues the `test -> release` merge while preserving release branch version state.
- `.codex/skills/release-promotion/scripts/bump-release-cdx-version.sh`
  - Phase 3 script.
  - Updates `codex-rs/Cargo.toml` from `X.Y.Z-cdx.N` to `X.Y.Z-cdx.N+1`, or to `--target-version`.
- `.codex/skills/release-promotion/scripts/promote-dev-to-release.sh`
  - Wrapper script.
  - Runs all phases, computes the target version once, supports dry-run and continue.

Modify no existing source files.

## Task 1: Create Skill Entrypoint

**Files:**
- Create: `.codex/skills/release-promotion/SKILL.md`

- [ ] **Step 1: Create the skill directory**

Run:

```bash
mkdir -p .codex/skills/release-promotion/scripts
```

Expected: command exits 0 and creates the target directories.

- [ ] **Step 2: Write the skill entrypoint**

Create `.codex/skills/release-promotion/SKILL.md` with this structure and concrete command examples:

```markdown
---
name: release-promotion
description: Promote local codex branches from dev to test without docs/superpowers, merge test to release, and bump the release cdx version using repo-local Bash scripts.
---

# Release Promotion

Use this skill when the user asks to automate or run the local release-promotion flow:

1. Merge `dev` into `test` while excluding `docs/superpowers/**`.
2. Merge `test` into `release` while preserving the release branch version in `codex-rs/Cargo.toml`.
3. Bump `release` from `X.Y.Z-cdx.N` to `X.Y.Z-cdx.N+1`.

## Safety Boundaries

- These scripts operate only on local branches.
- They do not run `git fetch`, `git pull`, `git push`, or `git remote`.
- They do not tag releases.
- They do not run tests, formatters, installs, or publish commands.
- They require a clean worktree before starting a new phase.
- If a non-excluded merge conflict occurs, they stop in the conflict state for manual resolution.
- They never run `git reset --hard`.

## Commands

Dry-run the full flow:

```bash
.codex/skills/release-promotion/scripts/promote-dev-to-release.sh --dry-run
```

Run the full flow:

```bash
.codex/skills/release-promotion/scripts/promote-dev-to-release.sh
```

Continue the wrapper after manual conflict resolution:

```bash
.codex/skills/release-promotion/scripts/promote-dev-to-release.sh --continue --target-version 0.142.0-cdx.4
```

Run one phase:

```bash
.codex/skills/release-promotion/scripts/merge-dev-to-test-without-superpowers.sh
.codex/skills/release-promotion/scripts/merge-test-to-release.sh
.codex/skills/release-promotion/scripts/bump-release-cdx-version.sh
```

## Conflict Recovery

If a phase stops with conflicts:

1. Resolve conflicts manually.
2. Stage the resolved files with `git add`.
3. Run the same phase script with `--continue`.

For example:

```bash
.codex/skills/release-promotion/scripts/merge-test-to-release.sh --continue
```
```

- [ ] **Step 3: Verify the skill entrypoint**

Run:

```bash
test -f .codex/skills/release-promotion/SKILL.md
rg -n 'git fetch|git pull|git push|git remote|reset --hard' .codex/skills/release-promotion/SKILL.md
```

Expected:

- First command exits 0.
- Second command prints only safety-boundary text, not executable instructions to run those commands.

## Task 2: Implement Shared Bash Library

**Files:**
- Create: `.codex/skills/release-promotion/scripts/lib-release-promotion.sh`

- [ ] **Step 1: Write the library header and logging helpers**

Create `.codex/skills/release-promotion/scripts/lib-release-promotion.sh` with this initial content:

```bash
#!/usr/bin/env bash

set -euo pipefail

rp_log() {
  local stage="$1"
  shift
  printf '[%s] %s\n' "$stage" "$*"
}

rp_die() {
  local message="$1"
  printf '[error] %s\n' "$message" >&2
  exit 1
}
```

- [ ] **Step 2: Add safe git wrapper**

Append this helper and use it for all git operations in later scripts:

```bash
rp_git() {
  local subcommand="${1:-}"
  case "$subcommand" in
    fetch|pull|push|remote)
      rp_die "remote git command is forbidden: git $subcommand"
      ;;
  esac

  git "$@"
}
```

- [ ] **Step 3: Add repo and preflight helpers**

Append:

```bash
rp_repo_root() {
  rp_git rev-parse --show-toplevel
}

rp_git_dir() {
  rp_git rev-parse --git-dir
}

rp_cd_repo_root() {
  local root
  root="$(rp_repo_root)"
  cd "$root"
}

rp_require_clean_worktree() {
  local status
  status="$(rp_git status --porcelain)"
  if [[ -n "$status" ]]; then
    printf '%s\n' "$status" >&2
    rp_die "worktree must be clean before starting this phase"
  fi
}

rp_require_no_in_progress_operation() {
  local git_dir
  git_dir="$(rp_git_dir)"

  if [[ -e "$git_dir/MERGE_HEAD" ]]; then
    rp_die "merge is already in progress; resolve it manually or use the matching --continue mode"
  fi
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

rp_require_local_branch() {
  local branch="$1"
  rp_git show-ref --verify --quiet "refs/heads/$branch" ||
    rp_die "local branch does not exist: $branch"
}
```

- [ ] **Step 4: Add version helpers**

Append:

```bash
rp_version_from_file() {
  local file="$1"
  sed -n 's/^version = "\(.*\)"$/\1/p' "$file" | head -n 1
}

rp_version_from_branch() {
  local branch="$1"
  rp_git show "$branch:codex-rs/Cargo.toml" |
    sed -n 's/^version = "\(.*\)"$/\1/p' |
    head -n 1
}

rp_next_cdx_version() {
  local version="$1"
  if [[ ! "$version" =~ ^([0-9]+)\.([0-9]+)\.([0-9]+)-cdx\.([0-9]+)$ ]]; then
    rp_die "release version must match X.Y.Z-cdx.N, got: $version"
  fi

  local major="${BASH_REMATCH[1]}"
  local minor="${BASH_REMATCH[2]}"
  local patch="${BASH_REMATCH[3]}"
  local cdx="${BASH_REMATCH[4]}"
  printf '%s.%s.%s-cdx.%s\n' "$major" "$minor" "$patch" "$((cdx + 1))"
}
```

- [ ] **Step 5: Add merge and diff helpers**

Append:

```bash
rp_unmerged_paths() {
  rp_git diff --name-only --diff-filter=U
}

rp_has_unmerged_paths() {
  [[ -n "$(rp_unmerged_paths)" ]]
}

rp_print_conflict_guidance() {
  local script="$1"
  rp_log error "merge stopped with conflicts."
  rp_log error "Resolve conflicts manually, stage the resolved files, then run:"
  rp_log error "  $script --continue"
}

rp_require_no_staged_superpowers_diff() {
  local diff
  diff="$(rp_git diff --cached --name-status -- docs/superpowers)"
  if [[ -n "$diff" ]]; then
    printf '%s\n' "$diff" >&2
    rp_die "docs/superpowers must not be staged in the dev-to-test merge"
  fi
}

rp_require_head_superpowers_diff_empty() {
  local diff
  diff="$(rp_git diff --name-status HEAD^1..HEAD -- docs/superpowers)"
  if [[ -n "$diff" ]]; then
    printf '%s\n' "$diff" >&2
    rp_die "merge commit contains docs/superpowers changes"
  fi
}
```

- [ ] **Step 6: Verify shell syntax**

Run:

```bash
bash -n .codex/skills/release-promotion/scripts/lib-release-promotion.sh
```

Expected: exits 0.

## Task 3: Implement dev-to-test Phase Script

**Files:**
- Create: `.codex/skills/release-promotion/scripts/merge-dev-to-test-without-superpowers.sh`
- Modify: `.codex/skills/release-promotion/scripts/lib-release-promotion.sh` if a missing helper is discovered

- [ ] **Step 1: Create script with argument parsing**

Create `.codex/skills/release-promotion/scripts/merge-dev-to-test-without-superpowers.sh`:

```bash
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
    -h|--help)
      sed -n '1,120p' "$0"
      exit 0
      ;;
    *)
      rp_die "unknown argument: $1"
      ;;
  esac
done
```

- [ ] **Step 2: Add preflight and dry-run**

Append:

```bash
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

if [[ "$continue_mode" != true ]]; then
  rp_require_no_in_progress_operation
  rp_require_clean_worktree
fi
```

- [ ] **Step 3: Add docs/superpowers exclusion helper inside the script**

Append:

```bash
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
    rp_git restore --source=HEAD --staged --worktree -- docs/superpowers || true
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
```

- [ ] **Step 4: Add merge execution and continue flow**

Append:

```bash
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

rp_log merge-dev-to-test "committing merge"
rp_git commit -m "$message"

rp_log verify "checking $dev_branch is ancestor of HEAD"
rp_git merge-base --is-ancestor "$dev_branch" HEAD
rp_require_head_superpowers_diff_empty
rp_log verify "dev-to-test merge complete: $(rp_git rev-parse --short HEAD)"
```

- [ ] **Step 5: Verify shell syntax**

Run:

```bash
bash -n .codex/skills/release-promotion/scripts/merge-dev-to-test-without-superpowers.sh
```

Expected: exits 0.

- [ ] **Step 6: Verify dry-run is read-only**

Run from any branch:

```bash
before_branch="$(git branch --show-current)"
before_status="$(git status --short --branch)"
.codex/skills/release-promotion/scripts/merge-dev-to-test-without-superpowers.sh --dry-run
after_branch="$(git branch --show-current)"
after_status="$(git status --short --branch)"
test "$before_branch" = "$after_branch"
test "$before_status" = "$after_status"
```

Expected: all commands exit 0.

## Task 4: Implement test-to-release Phase Script

**Files:**
- Create: `.codex/skills/release-promotion/scripts/merge-test-to-release.sh`

- [ ] **Step 1: Create script with argument parsing**

Create `.codex/skills/release-promotion/scripts/merge-test-to-release.sh`:

```bash
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
```

- [ ] **Step 2: Add preflight and dry-run**

Append:

```bash
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

if [[ "$continue_mode" != true ]]; then
  rp_require_no_in_progress_operation
  rp_require_clean_worktree
fi
```

- [ ] **Step 3: Add version preservation helper**

Append:

```bash
preserve_release_version() {
  local current_version
  current_version="$(rp_version_from_file codex-rs/Cargo.toml)"
  if [[ "$current_version" == "$release_version" ]]; then
    return 0
  fi

  rp_log merge-test-to-release "restoring release version $release_version in codex-rs/Cargo.toml"
  perl -0pi -e "s/^version = \".*\"/version = \"$release_version\"/m" codex-rs/Cargo.toml
  rp_git add codex-rs/Cargo.toml
}
```

- [ ] **Step 4: Add merge execution and continue flow**

Append:

```bash
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

rp_git diff --cached --check
rp_git commit -m "$message"
rp_git merge-base --is-ancestor "$test_branch" HEAD

if [[ "$(rp_version_from_file codex-rs/Cargo.toml)" != "$release_version" ]]; then
  rp_die "post-commit release version changed unexpectedly"
fi

rp_log verify "test-to-release merge complete: $(rp_git rev-parse --short HEAD)"
```

- [ ] **Step 5: Verify shell syntax and dry-run**

Run:

```bash
bash -n .codex/skills/release-promotion/scripts/merge-test-to-release.sh
.codex/skills/release-promotion/scripts/merge-test-to-release.sh --dry-run
```

Expected: both commands exit 0, and dry-run does not change branch or status.

## Task 5: Implement release cdx Version Bump Script

**Files:**
- Create: `.codex/skills/release-promotion/scripts/bump-release-cdx-version.sh`

- [ ] **Step 1: Create script with argument parsing**

Create `.codex/skills/release-promotion/scripts/bump-release-cdx-version.sh`:

```bash
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
```

- [ ] **Step 2: Add version computation and dry-run**

Append:

```bash
rp_cd_repo_root
rp_require_local_branch "$release_branch"

current_version="$(rp_version_from_branch "$release_branch")"
if [[ -z "$current_version" ]]; then
  rp_die "could not read release version from $release_branch"
fi

if [[ -z "$target_version" ]]; then
  target_version="$(rp_next_cdx_version "$current_version")"
fi

if [[ "$target_version" != "$(rp_next_cdx_version "$current_version")" && "$target_version" != "$current_version" ]]; then
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
```

- [ ] **Step 3: Add update, commit, and verification**

Append:

```bash
rp_git switch "$release_branch"

worktree_version="$(rp_version_from_file codex-rs/Cargo.toml)"
if [[ "$worktree_version" == "$target_version" ]]; then
  rp_log bump-version "version already at target: $target_version"
else
  if [[ "$worktree_version" != "$current_version" ]]; then
    rp_die "worktree version mismatch; expected $current_version got $worktree_version"
  fi

  rp_log bump-version "updating $current_version -> $target_version"
  perl -0pi -e "s/^version = \"\Q$current_version\E\"/version = \"$target_version\"/m" codex-rs/Cargo.toml
  rp_git add codex-rs/Cargo.toml
  rp_git diff --cached --check
  rp_git commit -m "$message"
fi

changed_files="$(rp_git show --name-only --format= HEAD)"
if [[ "$changed_files" != "codex-rs/Cargo.toml" ]]; then
  printf '%s\n' "$changed_files" >&2
  rp_die "version bump commit must only change codex-rs/Cargo.toml"
fi

if [[ "$(rp_version_from_file codex-rs/Cargo.toml)" != "$target_version" ]]; then
  rp_die "version bump did not reach target version"
fi

rp_log verify "release version is $target_version"
```

- [ ] **Step 4: Verify shell syntax and dry-run**

Run:

```bash
bash -n .codex/skills/release-promotion/scripts/bump-release-cdx-version.sh
.codex/skills/release-promotion/scripts/bump-release-cdx-version.sh --dry-run
```

Expected: both commands exit 0, and dry-run prints current and target versions.

## Task 6: Implement Full Wrapper Script

**Files:**
- Create: `.codex/skills/release-promotion/scripts/promote-dev-to-release.sh`

- [ ] **Step 1: Create wrapper with argument parsing**

Create `.codex/skills/release-promotion/scripts/promote-dev-to-release.sh`:

```bash
#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$script_dir/lib-release-promotion.sh"

dev_branch="dev"
test_branch="test"
release_branch="release"
target_version=""
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
```

- [ ] **Step 2: Add target version computation**

Append:

```bash
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

if [[ "$continue_mode" == true && -z "$target_version" ]]; then
  rp_die "--continue requires --target-version"
fi
```

- [ ] **Step 3: Add dry-run orchestration**

Append:

```bash
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
```

- [ ] **Step 4: Add phase skip helpers**

Append:

```bash
dev_is_in_test() {
  rp_git merge-base --is-ancestor "$dev_branch" "$test_branch"
}

test_is_in_release() {
  rp_git merge-base --is-ancestor "$test_branch" "$release_branch"
}

release_is_target_version() {
  [[ "$(rp_version_from_branch "$release_branch")" == "$target_version" ]]
}
```

- [ ] **Step 5: Add wrapper execution**

Append:

```bash
rp_require_no_in_progress_operation
rp_require_clean_worktree

if dev_is_in_test; then
  rp_log merge-dev-to-test "already complete; $dev_branch is ancestor of $test_branch"
else
  "$script_dir/merge-dev-to-test-without-superpowers.sh" --dev "$dev_branch" --test "$test_branch"
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
```

- [ ] **Step 6: Verify shell syntax and dry-run**

Run:

```bash
bash -n .codex/skills/release-promotion/scripts/promote-dev-to-release.sh
.codex/skills/release-promotion/scripts/promote-dev-to-release.sh --dry-run
```

Expected: both commands exit 0 and dry-run leaves branch and status unchanged.

## Task 7: Make Scripts Executable and Add Static Validation

**Files:**
- Modify permissions:
  - `.codex/skills/release-promotion/scripts/merge-dev-to-test-without-superpowers.sh`
  - `.codex/skills/release-promotion/scripts/merge-test-to-release.sh`
  - `.codex/skills/release-promotion/scripts/bump-release-cdx-version.sh`
  - `.codex/skills/release-promotion/scripts/promote-dev-to-release.sh`

- [ ] **Step 1: Mark runnable scripts executable**

Run:

```bash
chmod +x \
  .codex/skills/release-promotion/scripts/merge-dev-to-test-without-superpowers.sh \
  .codex/skills/release-promotion/scripts/merge-test-to-release.sh \
  .codex/skills/release-promotion/scripts/bump-release-cdx-version.sh \
  .codex/skills/release-promotion/scripts/promote-dev-to-release.sh
```

Expected: exits 0.

- [ ] **Step 2: Run syntax checks**

Run:

```bash
for script in .codex/skills/release-promotion/scripts/*.sh; do
  bash -n "$script"
done
```

Expected: exits 0.

- [ ] **Step 3: Verify forbidden remote commands are not used directly**

Run:

```bash
rg -n '\bgit (fetch|pull|push|remote)\b' .codex/skills/release-promotion
```

Expected: no executable script line directly invokes those commands. Safety-boundary documentation mentions are acceptable in `SKILL.md`.

- [ ] **Step 4: Verify hygiene**

Run:

```bash
git diff --check -- .codex/skills/release-promotion docs/superpowers/specs/2026-06-27-release-promotion-skill-design.md docs/superpowers/plans/2026-06-27-release-promotion-skill.md
```

Expected: exits 0.

## Task 8: Manual Fixture Verification

**Files:**
- Verify only; do not modify production branches unless the user explicitly asks to run the real flow.

- [ ] **Step 1: Verify dry-run leaves current branch untouched**

Run:

```bash
before_branch="$(git branch --show-current)"
before_status="$(git status --short --branch)"
.codex/skills/release-promotion/scripts/promote-dev-to-release.sh --dry-run
after_branch="$(git branch --show-current)"
after_status="$(git status --short --branch)"
test "$before_branch" = "$after_branch"
test "$before_status" = "$after_status"
```

Expected: exits 0.

- [ ] **Step 2: Verify dirty workspace rejection**

Run:

```bash
tmp_file=".codex/skills/release-promotion/.dirty-check"
printf 'dirty\n' > "$tmp_file"
if .codex/skills/release-promotion/scripts/promote-dev-to-release.sh >/tmp/release-promotion-dirty.out 2>&1; then
  rm -f "$tmp_file"
  echo "expected dirty workspace rejection" >&2
  exit 1
fi
rm -f "$tmp_file"
rg -n 'worktree must be clean' /tmp/release-promotion-dirty.out
```

Expected: exits 0 and prints the clean-worktree rejection message.

- [ ] **Step 3: Verify version parser rejects non-cdx versions in an isolated shell**

Run:

```bash
bash -c 'source .codex/skills/release-promotion/scripts/lib-release-promotion.sh; rp_next_cdx_version 0.142.1' >/tmp/release-promotion-version.out 2>&1 && exit 1 || true
rg -n 'must match X.Y.Z-cdx.N' /tmp/release-promotion-version.out
```

Expected: exits 0 and prints the version-shape rejection.

## Task 9: Final Review and Commit Boundary

**Files:**
- Review:
  - `.codex/skills/release-promotion/SKILL.md`
  - `.codex/skills/release-promotion/scripts/lib-release-promotion.sh`
  - `.codex/skills/release-promotion/scripts/merge-dev-to-test-without-superpowers.sh`
  - `.codex/skills/release-promotion/scripts/merge-test-to-release.sh`
  - `.codex/skills/release-promotion/scripts/bump-release-cdx-version.sh`
  - `.codex/skills/release-promotion/scripts/promote-dev-to-release.sh`
  - `docs/superpowers/specs/2026-06-27-release-promotion-skill-design.md`
  - `docs/superpowers/plans/2026-06-27-release-promotion-skill.md`

- [ ] **Step 1: Inspect changed files**

Run:

```bash
git status --short
git diff -- .codex/skills/release-promotion docs/superpowers/specs/2026-06-27-release-promotion-skill-design.md docs/superpowers/plans/2026-06-27-release-promotion-skill.md
```

Expected: only the release-promotion skill files and design/plan docs are changed.

- [ ] **Step 2: Commit only after user asks**

If the user asks to commit, stage only:

```bash
git add \
  .codex/skills/release-promotion \
  docs/superpowers/specs/2026-06-27-release-promotion-skill-design.md \
  docs/superpowers/plans/2026-06-27-release-promotion-skill.md
```

Suggested commit message:

```text
docs: plan release promotion skill
```

Do not push.

## Self-Review Notes

- Spec coverage: the plan covers the repo-local skill, the four scripts, dry-run, continue, conflict behavior, local-only git safety, version parsing, version preservation, and final verification.
- Scope: the plan does not add tests, formatters, remote operations, tags, lockfile changes, or publish workflow changes.
- Implementation boundary: this plan only creates documentation when written. The actual skill and scripts are created in later implementation tasks after the user approves this plan.
- Risk: the shell snippets are intentionally narrow and should be reviewed during implementation, especially `docs/superpowers` exclusion and wrapper idempotency checks.
