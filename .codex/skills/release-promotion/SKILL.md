---
name: release-promotion
description: Promote local codex branches from dev to test without docs/superpowers, merge test to release, and bump the release cdx version using repo-local Bash scripts.
---

# Release Promotion

Promote local Codex branches with the bundled scripts:

1. Merge `dev` into `test` while excluding `docs/superpowers/**`.
2. Merge `test` into `release` while preserving the release branch version in `codex-rs/Cargo.toml`.
3. Bump `release` from `X.Y.Z-cdx.N` to `X.Y.Z-cdx.N+1`.

## Safety Boundaries

- Use `$action-authorization` before running or resuming a phase; this skill does not redefine authorization.
- These scripts operate only on local branches and require a clean worktree before starting a new phase.
- They do not run `git fetch`, `git pull`, `git push`, or `git remote`.
- They do not tag releases.
- They do not run tests, formatters, installs, or publish commands.
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

If a phase stops with conflicts, leave it in the conflict state and use `$resolving-merge-conflicts` to resolve and stage files with `git add`. Then run the same phase script with `--continue`.

For example:
```bash
.codex/skills/release-promotion/scripts/merge-test-to-release.sh --continue
```
