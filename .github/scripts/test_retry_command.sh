#!/usr/bin/env bash
set -euo pipefail

run_sequence_step() {
  local counter_file="$1"
  shift

  local attempt=1
  if [[ -f "$counter_file" ]]; then
    read -r attempt <"$counter_file"
    attempt=$((attempt + 1))
  fi
  printf '%s\n' "$attempt" >"$counter_file"

  local status="${!attempt}"
  exit "$status"
}

if [[ "${1:-}" == "__sequence_step" ]]; then
  shift
  run_sequence_step "$@"
fi

readonly script_dir="${BASH_SOURCE[0]%/*}"
readonly command_path="$script_dir/retry-command.sh"
readonly test_tmp="${TMPDIR:-/tmp}/codex-retry-command-test-$$"
readonly self="${BASH_SOURCE[0]}"

mkdir -p "$test_tmp"
trap 'status=$?; rm -rf -- "$test_tmp"; exit "$status"' EXIT

assert_equal() {
  local expected="$1"
  local actual="$2"
  local description="$3"

  if [[ "$actual" != "$expected" ]]; then
    echo "FAIL: ${description}: expected ${expected}, got ${actual}" >&2
    return 1
  fi
}

assert_file_value() {
  local expected="$1"
  local path="$2"
  local description="$3"
  local actual

  read -r actual <"$path"
  assert_equal "$expected" "$actual" "$description"
}

test_no_arguments_preserves_usage_and_exit_code() {
  local stderr_file="$test_tmp/no-arguments.stderr"
  local status=0

  bash "$command_path" 2>"$stderr_file" || status=$?

  assert_equal 2 "$status" "no-arguments exit code"
  assert_file_value \
    'Usage: retry-command.sh <command> [args...]' \
    "$stderr_file" \
    "no-arguments usage"
}

test_delegates_to_retry_policy() {
  local counter_file="$test_tmp/delegated-attempts"
  local stderr_file="$test_tmp/delegated.stderr"

  RETRY_DELAYS_SECONDS='0 0' \
    bash "$command_path" bash "$self" __sequence_step "$counter_file" 19 0 \
    2>"$stderr_file"

  assert_file_value 2 "$counter_file" "delegated attempt count"
  assert_file_value \
    'Attempt 1 failed with exit code 19. Retrying in 0 seconds...' \
    "$stderr_file" \
    "delegated retry log"
}

test_bare_filename_resolves_sibling_policy() {
  local stderr_file="$test_tmp/bare-filename.stderr"
  local status=0

  (
    cd "$script_dir"
    bash retry-command.sh true
  ) 2>"$stderr_file" || status=$?

  if [[ "$status" != 0 ]]; then
    while IFS= read -r line; do
      echo "command stderr: $line" >&2
    done <"$stderr_file"
  fi
  assert_equal 0 "$status" "bare-filename invocation exit code"
}

test_absolute_path_resolves_sibling_policy() {
  (
    cd "$script_dir"
    bash "$PWD/retry-command.sh" true
  )
}

test_no_arguments_preserves_usage_and_exit_code
test_delegates_to_retry_policy
test_bare_filename_resolves_sibling_policy
test_absolute_path_resolves_sibling_policy

echo "PASS: retry command"
