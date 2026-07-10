#!/usr/bin/env bash

retry_wait_after_failure() {
  local attempt="$1"
  local status="${2-}"
  local delays_value="${RETRY_DELAYS_SECONDS-10 30}"
  local -a delays=()
  if [[ -n "$delays_value" ]]; then
    read -r -a delays <<<"$delays_value"
  fi

  if ((attempt < 1 || attempt > ${#delays[@]})); then
    return 1
  fi

  local wait_seconds="${delays[attempt - 1]}"
  if [[ $# -ge 2 ]]; then
    echo "Attempt ${attempt} failed with exit code ${status}. Retrying in ${wait_seconds} seconds..." >&2
  else
    echo "Attempt ${attempt} failed. Retrying in ${wait_seconds} seconds..." >&2
  fi
  sleep "$wait_seconds"
}

retry_run() {
  local attempt=1
  local status

  while true; do
    "$@" && return 0
    status=$?

    if ! retry_wait_after_failure "$attempt" "$status"; then
      return "$status"
    fi

    attempt=$((attempt + 1))
  done
}
