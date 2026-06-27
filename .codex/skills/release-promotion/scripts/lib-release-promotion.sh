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

rp_git() {
  local args=("$@")
  local index=0
  local subcommand=""

  while ((index < ${#args[@]})); do
    case "${args[$index]}" in
      -C | --git-dir | --work-tree)
        if ((index + 1 >= ${#args[@]})); then
          rp_die "git option requires a value: ${args[$index]}"
        fi
        index=$((index + 2))
        ;;
      -c)
        if ((index + 1 >= ${#args[@]})); then
          rp_die "git option requires a value: ${args[$index]}"
        fi
        if [[ "${args[$((index + 1))]}" == [Aa][Ll][Ii][Aa][Ss].*=* ]]; then
          rp_die "git alias config is forbidden: ${args[$((index + 1))]}"
        fi
        index=$((index + 2))
        ;;
      --git-dir=* | --work-tree=*)
        index=$((index + 1))
        ;;
      -*)
        rp_die "unsupported git global option: ${args[$index]}"
        ;;
      *)
        subcommand="${args[$index]}"
        break
        ;;
    esac
  done

  case "$subcommand" in
    fetch | pull | push | remote)
      rp_die "remote git command is forbidden: git $subcommand"
      ;;
  esac

  if [[ "$subcommand" == "reset" ]]; then
    local arg
    for arg in "${args[@]:$((index + 1))}"; do
      if [[ "$arg" == "--hard" ]]; then
        rp_die "git reset --hard is forbidden"
      fi
    done
  fi

  git "$@"
}

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
  rp_git show-ref --verify --quiet "refs/heads/$branch" || rp_die "local branch does not exist: $branch"
}

rp_workspace_package_version_from_stdin() {
  local source="$1"
  local versions
  versions="$(awk '
    /^\[workspace\.package\][[:space:]]*$/ {
      in_workspace_package = 1
      next
    }

    /^\[/ {
      in_workspace_package = 0
    }

    in_workspace_package && /^[[:space:]]*version[[:space:]]*=[[:space:]]*"[^"]*"[[:space:]]*$/ {
      line = $0
      sub(/^[[:space:]]*version[[:space:]]*=[[:space:]]*"/, "", line)
      sub(/"[[:space:]]*$/, "", line)
      print line
    }
  ')"

  local count
  if [[ -z "$versions" ]]; then
    count=0
  else
    count="$(printf '%s\n' "$versions" | wc -l | tr -d ' ')"
  fi

  if [[ "$count" != "1" ]]; then
    rp_die "expected exactly one [workspace.package] version in $source, found: $count"
  fi

  printf '%s\n' "$versions"
}

rp_version_from_file() {
  local file="$1"
  rp_workspace_package_version_from_stdin "$file" <"$file"
}

rp_set_workspace_package_version_in_file() {
  local file="$1"
  local version="$2"

  if [[ "$version" == *\"* || "$version" == *$'\n'* ]]; then
    rp_die "workspace package version contains invalid characters: $version"
  fi

  rp_workspace_package_version_from_stdin "$file" <"$file" >/dev/null

  local tmp
  tmp="$file.tmp.$$"

  if ! awk -v version="$version" '
    /^\[workspace\.package\][[:space:]]*$/ {
      in_workspace_package = 1
      print
      next
    }

    /^\[/ {
      in_workspace_package = 0
    }

    in_workspace_package && /^[[:space:]]*version[[:space:]]*=[[:space:]]*"[^"]*"[[:space:]]*$/ {
      match($0, /^[[:space:]]*version[[:space:]]*=[[:space:]]*"/)
      print substr($0, 1, RLENGTH) version "\""
      next
    }

    {
      print
    }
  ' "$file" >"$tmp"; then
    rm -f "$tmp"
    rp_die "failed to update workspace package version in $file"
  fi

  mv "$tmp" "$file"
}

rp_version_from_branch() {
  local branch="$1"
  local content
  content="$(rp_git show "$branch:codex-rs/Cargo.toml")"
  rp_workspace_package_version_from_stdin "$branch:codex-rs/Cargo.toml" <<<"$content"
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
