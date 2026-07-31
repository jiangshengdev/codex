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
readonly policy_path="$script_dir/retry-policy.sh"
readonly test_tmp="${TMPDIR:-/tmp}/codex-retry-policy-test-$$"
readonly self="${BASH_SOURCE[0]}"

mkdir -p "$test_tmp"
trap 'status=$?; rm -rf -- "$test_tmp"; exit "$status"' EXIT

if [[ ! -f "$policy_path" ]]; then
  echo "FAIL: retry policy does not exist: $policy_path" >&2
  exit 1
fi

# shellcheck source=/dev/null
source "$policy_path"

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

assert_file_lines() {
  local path="$1"
  local description="$2"
  shift 2

  local -a actual_lines=()
  local line
  while IFS= read -r line; do
    actual_lines+=("$line")
  done <"$path"

  assert_equal "$#" "${#actual_lines[@]}" "$description line count"

  local index=0
  local expected
  for expected in "$@"; do
    assert_equal "$expected" "${actual_lines[index]}" "$description line $((index + 1))"
    index=$((index + 1))
  done
}

test_first_attempt_success() {
  local counter_file="$test_tmp/first-attempt"

  RETRY_DELAYS_SECONDS='0 0' retry_run bash "$self" __sequence_step "$counter_file" 0

  assert_file_value 1 "$counter_file" "first-attempt success attempt count"
}

test_second_attempt_success() {
  local counter_file="$test_tmp/second-attempt"

  RETRY_DELAYS_SECONDS='0 0' retry_run bash "$self" __sequence_step "$counter_file" 17 0

  assert_file_value 2 "$counter_file" "second-attempt success attempt count"
}

test_third_attempt_success() {
  local counter_file="$test_tmp/third-attempt"

  RETRY_DELAYS_SECONDS='0 0' retry_run bash "$self" __sequence_step "$counter_file" 17 23 0

  assert_file_value 3 "$counter_file" "third-attempt success attempt count"
}

test_all_attempts_fail_with_last_exit_code() {
  local counter_file="$test_tmp/all-fail"
  local status=0

  RETRY_DELAYS_SECONDS='0 0' \
    retry_run bash "$self" __sequence_step "$counter_file" 17 23 41 || status=$?

  assert_equal 41 "$status" "exhausted retry exit code"
  assert_file_value 3 "$counter_file" "exhausted retry attempt count"
}

test_default_backoff_sequence() {
  local counter_file="$test_tmp/default-backoff-attempts"
  local sleep_file="$test_tmp/default-backoff-sleeps"

  (
    unset RETRY_DELAYS_SECONDS
    # retry_run resolves this test double dynamically.
    # shellcheck disable=SC2329
    sleep() {
      printf '%s\n' "$1" >>"$sleep_file"
    }
    retry_run bash "$self" __sequence_step "$counter_file" 17 23 0
  )

  assert_file_value 3 "$counter_file" "default backoff attempt count"
  assert_file_lines "$sleep_file" "default backoff sequence" 10 30
}

test_wait_after_failure() {
  local sleep_file="$test_tmp/wait-after-failure-sleeps"
  local stderr_file="$test_tmp/wait-after-failure.stderr"
  local exhausted_status_file="$test_tmp/wait-after-failure-exhausted-status"

  if ! declare -F retry_wait_after_failure >/dev/null; then
    echo "FAIL: retry_wait_after_failure is not defined" >&2
    return 1
  fi

  (
    unset RETRY_DELAYS_SECONDS
    # retry_wait_after_failure resolves this test double dynamically.
    # shellcheck disable=SC2329
    sleep() {
      printf '%s\n' "$1" >>"$sleep_file"
    }

    retry_wait_after_failure 1 2>"$stderr_file"
    retry_wait_after_failure 2 23 2>>"$stderr_file"

    local exhausted_status=0
    retry_wait_after_failure 3 2>>"$stderr_file" || exhausted_status=$?
    printf '%s\n' "$exhausted_status" >"$exhausted_status_file"
  )

  assert_file_lines "$sleep_file" "wait-after-failure sleeps" 10 30
  assert_file_lines \
    "$stderr_file" \
    "wait-after-failure logs" \
    'Attempt 1 failed. Retrying in 10 seconds...' \
    'Attempt 2 failed with exit code 23. Retrying in 30 seconds...'
  assert_file_value 1 "$exhausted_status_file" "exhausted wait exit code"
}

test_first_attempt_success
test_second_attempt_success
test_third_attempt_success
test_all_attempts_fail_with_last_exit_code
test_default_backoff_sequence
test_wait_after_failure

echo "PASS: retry policy"
