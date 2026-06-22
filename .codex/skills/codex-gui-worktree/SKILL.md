---
name: codex-gui-worktree
description: Create and prepare lightweight sparse git worktrees for codex-gui parallel frontend work in /Users/jiangsheng/cnb/codex, including sparse checkout setup, local node_modules reuse, HeroUI docs links, Redux Toolkit docs links, and sibling Vitest docs access. Use when the user asks to create, prepare, bootstrap, repair, or automate a codex-gui worktree.
---

# codex-gui Worktree

Use this skill to create or prepare sparse `codex-gui` worktrees for parallel frontend work in `/Users/jiangsheng/cnb/codex`.

## Rules

- Before creating a worktree or symlink, print the exact command and target paths and wait for user confirmation, unless the user explicitly says to execute directly.
- Do not install dependencies.
- Do not download documentation.
- Do not stage or commit.
- Do not overwrite existing branches, worktrees, files, directories, or symlinks.
- Stop on conflicts and print the exact path that blocks progress.

## Default Layout

Defaults:

```text
repo root: /Users/jiangsheng/cnb/codex
worktree root: /Users/jiangsheng/cnb/codex/.worktrees
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
bash /Users/jiangsheng/cnb/codex/.codex/skills/codex-gui-worktree/scripts/create-codex-gui-worktree.sh \
  --name gui-transcript-state \
  --branch codex/gui-transcript-state \
  --base dev \
  --include docs/superpowers/plans/2026-06-22-codex-gui-frontend-refactor
```

The script creates the sparse worktree, links local dependency and documentation caches, and verifies the result.

## Linked Resources

The script links these resources:

```text
codex-gui/node_modules
  -> /Users/jiangsheng/cnb/codex/codex-gui/node_modules

codex-gui/.heroui-docs/react
  -> /Users/jiangsheng/cnb/codex/codex-gui/.heroui-docs/react

codex-gui/.redux-toolkit-docs/redux
  -> /Users/jiangsheng/cnb/codex/codex-gui/.redux-toolkit-docs/redux

codex-gui/.redux-toolkit-docs/toolkit
  -> /Users/jiangsheng/cnb/codex/codex-gui/.redux-toolkit-docs/toolkit

/Users/jiangsheng/cnb/codex/.worktrees/vitest
  -> /Users/jiangsheng/cnb/vitest
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
