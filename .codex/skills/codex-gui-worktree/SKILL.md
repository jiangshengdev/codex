---
name: codex-gui-worktree
description: Create and prepare lightweight sparse git worktrees for codex-gui parallel frontend work in the current Codex checkout, including sparse checkout setup, local node_modules reuse, HeroUI docs links, Redux Toolkit docs links, and sibling Vitest docs access. Use when the user asks to create, prepare, bootstrap, repair, or automate a codex-gui worktree.
---

# codex-gui Worktree

## Boundaries

- Use `$action-authorization` for action scope, `$managing-work-stages` for sequencing and the preparation barrier, and the applicable `AGENTS.md` for installation policy. This skill owns only project-specific worktree creation and verification.
- Do not download documentation.
- Setup ends after creation, link setup, and verification; staging and committing are outside this skill.
- Before creation, confirm that every default sparse checkout path and every
  `--include` path exists in the selected base's Git tree.
- Do not overwrite existing branches, worktrees, files, directories, or symlinks. Stop on conflicts and print the exact blocking path.
- Creating a worktree from `dev` uses only committed content from the selected base. Uncommitted changes in the current `dev` checkout or any other worktree are not carried into the new worktree and should not be treated as blockers.

## Plan-authoring Preflight

Before writing any exact worktree command into a plan, inspect `$WORKTREE_ROOT/vitest`. If it is already a symlink, record the requested Vitest path, its direct `readlink` target, and its fully resolved physical target separately. Choose `--vitest-root` using the script's `normalize_path_preserving_leaf` and `ensure_symlink` semantics. When multiple paths resolve to the same directory but the script decides compatibility from the direct mapping, the plan must use a parameter that the existing mapping accepts. Resolve any mismatch before requesting plan confirmation; do not defer it to execution. Plan to change the existing link only when the user explicitly requests that migration.

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
.codex/skills
.agents/skills
docs/superpowers
codex-gui
codex-rs/app-server-protocol/schema/typescript
codex-rs/app-server-protocol/schema/json
codex-rs/gui-host/schema/typescript
codex-rs/gui-host/schema/json
```

These paths keep the GUI worktree's skills, work documents, sources, and schemas independent of another checkout. The schemas feed GUI type-checking, Vite, and protocol validators.

Use `--include` only for task-specific source or tool paths outside this fixed set, as in the script example below.

## Script

Use the bundled script:

```bash
bash .codex/skills/codex-gui-worktree/scripts/create-codex-gui-worktree.sh \
  --name gui-transcript-state \
  --branch codex/gui-transcript-state \
  --base dev \
  --include codex-rs/app-server
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
- readability of the fixed task control plane, including its key skill
  entrypoints, applicable `AGENTS.md` files, project work documents, and
  protocol schemas
- linked resources
- `git status --short --branch`

If verification fails, report the failing command and do not continue to implementation work.
