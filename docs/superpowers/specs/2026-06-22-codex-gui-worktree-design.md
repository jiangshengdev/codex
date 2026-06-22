# codex-gui Worktree Skill Design

## Status

Design accepted on 2026-06-22. This document defines a project-local Codex skill for creating lightweight `codex-gui` sparse worktrees and wiring the local dependency and documentation caches required by frontend work.

## Problem

`codex-gui` is small, but the repository that contains it is large. Full `git worktree` checkouts are expensive when the goal is parallel frontend work. A sparse worktree solves most of the disk and checkout cost, but repeated setup is easy to get wrong because frontend work needs local, ignored resources that sparse checkout does not materialize:

- `codex-gui/node_modules`
- `codex-gui/.heroui-docs/react`
- `codex-gui/.redux-toolkit-docs/redux`
- `codex-gui/.redux-toolkit-docs/toolkit`
- `../vitest/docs` from the worktree root, for the `vitest-react-browser-docs` skill

The setup should be repeatable, conservative, and explicit before changing filesystem state.

## Goals

- Create `codex-gui` sparse worktrees under `/Users/jiangsheng/cnb/codex/.worktrees`.
- Keep the default checkout small by including only the frontend and generated protocol TypeScript types.
- Support extra sparse paths for task-specific plan documents or tightly scoped repo files.
- Reuse existing local dependency and documentation caches through symlinks.
- Avoid installing dependencies, downloading documentation, staging files, committing files, or overwriting existing user state.
- Provide verification output that proves the worktree is ready for frontend work.

## Non-Goals

- Do not split `codex-gui` into a separate git repository.
- Do not replace the general `superpowers:using-git-worktrees` skill.
- Do not install or update npm dependencies.
- Do not fetch HeroUI, Redux Toolkit, or Vitest documentation.
- Do not manage Rust-side fixture generation beyond including paths when explicitly requested.

## Skill Shape

Create a repo-local skill:

```text
/Users/jiangsheng/cnb/codex/.codex/skills/codex-gui-worktree/
  SKILL.md
  scripts/create-codex-gui-worktree.sh
```

The skill triggers when a user asks Codex to create, prepare, bootstrap, or repair a lightweight `codex-gui` worktree, especially for parallel frontend work.

## Default Worktree Contract

Defaults:

```text
repo root: /Users/jiangsheng/cnb/codex
worktree root: /Users/jiangsheng/cnb/codex/.worktrees
base branch: dev
worktree path: /Users/jiangsheng/cnb/codex/.worktrees/<name>
```

Default sparse checkout paths:

```text
codex-gui
codex-rs/app-server-protocol/schema/typescript
```

The script accepts additional sparse paths, such as:

```text
docs/superpowers/plans/2026-06-22-codex-gui-frontend-refactor
```

## Automation Behavior

The script accepts:

```bash
create-codex-gui-worktree.sh \
  --name gui-transcript-state \
  --branch codex/gui-transcript-state \
  --base dev \
  --include docs/superpowers/plans/2026-06-22-codex-gui-frontend-refactor
```

Execution flow:

1. Verify the repo root is `/Users/jiangsheng/cnb/codex`.
2. Verify `.worktrees/` exists and is ignored by git.
3. Verify the target worktree path does not already exist.
4. Verify the target branch does not already exist.
5. Create the worktree with `git worktree add --no-checkout`.
6. Initialize cone-mode sparse checkout.
7. Set sparse checkout to the default paths plus any `--include` paths.
8. Check out the sparse worktree.
9. Link local frontend dependency and documentation caches.
10. Verify sparse paths, symlinks, docs roots, and git status.

## Symlink Contract

Create this link inside the new worktree:

```text
codex-gui/node_modules
  -> /Users/jiangsheng/cnb/codex/codex-gui/node_modules
```

For HeroUI and Redux Toolkit docs, do not create directory-level symlinks for the ignored root directories. Git treats a directory-level symlink as an untracked file, so the existing `.gitignore` directory rules do not hide it. Instead, create real ignored directories and link their children:

```text
codex-gui/.heroui-docs/
codex-gui/.heroui-docs/react
  -> /Users/jiangsheng/cnb/codex/codex-gui/.heroui-docs/react

codex-gui/.redux-toolkit-docs/
codex-gui/.redux-toolkit-docs/redux
  -> /Users/jiangsheng/cnb/codex/codex-gui/.redux-toolkit-docs/redux
codex-gui/.redux-toolkit-docs/toolkit
  -> /Users/jiangsheng/cnb/codex/codex-gui/.redux-toolkit-docs/toolkit
```

For Vitest docs, create one shared sibling link under `.worktrees`:

```text
/Users/jiangsheng/cnb/codex/.worktrees/vitest
  -> /Users/jiangsheng/cnb/vitest
```

This makes `../vitest/docs` resolve correctly from any worktree under `/Users/jiangsheng/cnb/codex/.worktrees/<name>`.

## Safety Rules

- Print the full command and target paths before execution unless the user explicitly asks to execute directly.
- Do not install dependencies.
- Do not download documentation.
- Do not stage or commit.
- Do not overwrite existing files, directories, symlinks, branches, or worktrees.
- If a target exists and already points to the expected source, report it as already correct and continue.
- If a target exists but is wrong, stop and print the exact conflict.
- If a required source path is missing, stop and print the missing path.

## Verification

After setup, verify:

```bash
git sparse-checkout list
git status --short --branch
test -d codex-gui/node_modules
test -d codex-gui/.heroui-docs/react/components
test -f codex-gui/.redux-toolkit-docs/redux/style-guide.md
test -f codex-gui/.redux-toolkit-docs/toolkit/api/createSlice.mdx
test -d ../vitest/docs/api/browser
test -d ../vitest/docs/guide/browser
test -d ../vitest/docs/config/browser
```

The final report should include the worktree path, branch, sparse checkout list, linked resources, and git status.
