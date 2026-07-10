#!/usr/bin/env bash
set -u

if [[ $# -eq 0 ]]; then
  echo "Usage: retry-command.sh <command> [args...]" >&2
  exit 2
fi

script_path="${BASH_SOURCE[0]}"
if [[ "$script_path" != */* ]]; then
  script_path="./$script_path"
fi
readonly script_path
readonly script_dir="${script_path%/*}"

# shellcheck source=/dev/null
source "$script_dir/retry-policy.sh"

retry_run "$@"
