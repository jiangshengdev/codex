---
name: codex-gui-worktree
description: Create and prepare lightweight sparse git worktrees for codex-gui parallel frontend work in the current Codex checkout, including sparse checkout setup, local node_modules reuse, HeroUI docs links, Redux Toolkit docs links, and sibling Vitest docs access. Use when the user asks to create, prepare, bootstrap, repair, or automate a codex-gui worktree.
---

# codex-gui Worktree

Use this skill to create or prepare sparse `codex-gui` worktrees for parallel frontend work in the current Codex checkout.

## Rules

- Before creating a worktree or symlink, print the exact command and target paths and wait for user confirmation, unless the user explicitly says to execute directly.
- Do not install dependencies.
- Do not download documentation.
- Do not stage or commit.
- Do not overwrite existing branches, worktrees, files, directories, or symlinks.
- Stop on conflicts and print the exact path that blocks progress.
- Creating a worktree from `dev` uses only committed content from the selected base. Uncommitted changes in the current `dev` checkout or any other worktree are not carried into the new worktree and should not be treated as blockers.

## Default Layout

Defaults:

```text
repo root: inferred from this skill's git checkout
worktree root: $REPO_ROOT/.worktrees
vitest root: $REPO_ROOT/../vitest
base branch: dev
```

Default sparse checkout paths:

```text
codex-gui
codex-rs/app-server-protocol/schema/typescript
```

Add task-specific paths with `--include`, for example:

```text
docs/superpowers/plans/2026-06-22-codex-gui-frontend-refactor
```

## Script

Use the bundled script:

```bash
bash .codex/skills/codex-gui-worktree/scripts/create-codex-gui-worktree.sh \
  --name gui-transcript-state \
  --branch codex/gui-transcript-state \
  --base dev \
  --include docs/superpowers/plans/2026-06-22-codex-gui-frontend-refactor
```

The script creates the sparse worktree, links local dependency and documentation caches, and verifies the result.

Path overrides are available when the checkout layout differs from the defaults:

```bash
bash .codex/skills/codex-gui-worktree/scripts/create-codex-gui-worktree.sh \
  --name gui-transcript-state \
  --branch codex/gui-transcript-state \
  --repo-root <repo-root> \
  --worktree-root <worktree-root> \
  --vitest-root <vitest-root>
```

Environment overrides are also supported: `CODEX_GUI_WORKTREE_REPO_ROOT`, `CODEX_GUI_WORKTREE_ROOT`, and `CODEX_GUI_WORKTREE_VITEST_ROOT`.

## Linked Resources

The script links these resources:

```text
codex-gui/node_modules
  -> $REPO_ROOT/codex-gui/node_modules

codex-gui/.heroui-docs/react
  -> $REPO_ROOT/codex-gui/.heroui-docs/react

codex-gui/.redux-toolkit-docs/redux
  -> $REPO_ROOT/codex-gui/.redux-toolkit-docs/redux

codex-gui/.redux-toolkit-docs/toolkit
  -> $REPO_ROOT/codex-gui/.redux-toolkit-docs/toolkit

$WORKTREE_ROOT/vitest
  -> $VITEST_ROOT
```

For `.heroui-docs` and `.redux-toolkit-docs`, keep the ignored root directories as real directories and link their children. Directory-level symlinks appear as untracked files because the existing `.gitignore` rules are directory rules.

## Verification

After running the script, report:

- worktree path
- branch
- sparse checkout list
- linked resources
- `git status --short --branch`

If verification fails, report the failing command and do not continue to implementation work.
