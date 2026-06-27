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
