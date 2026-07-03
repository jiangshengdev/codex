#!/usr/bin/env bash
set -u

if [[ $# -eq 0 ]]; then
  echo "Usage: retry-command.sh <command> [args...]" >&2
  exit 2
fi

for attempt in 1 2 3; do
  "$@" && exit 0
  status=$?

  if [[ "$attempt" == 3 ]]; then
    exit "$status"
  fi

  echo "Attempt ${attempt} failed with exit code ${status}. Retrying in 10 seconds..." >&2
  sleep 10
done
