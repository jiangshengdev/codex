---
name: codex-gui-worktree
description: Create and prepare lightweight sparse git worktrees for codex-gui parallel frontend work in the current Codex checkout, including sparse checkout setup, local node_modules reuse, HeroUI docs links, Redux Toolkit docs links, and sibling Vitest docs access. Use when the user asks to create, prepare, bootstrap, repair, or automate a codex-gui worktree.
---

# codex-gui Worktree

Use this skill to create or prepare sparse `codex-gui` worktrees for parallel frontend work in the current Codex checkout.

## Rules

- Before printing paths, resolve the worktree path plus every symlink path and target with the same physical-path and root-directory resolution semantics used by the bundled script.
- Before executing the creation command, print the complete command unchanged, the canonical worktree target path, and every symlink the script will actually create as an exact canonical `link path -> target` mapping. If a requested path alias differs from its resolved path, print the requested alias alongside the actual canonical path or mapping.
- A direct user request to create, prepare, bootstrap, or repair a `codex-gui` worktree authorizes that operation. After the required pre-execution disclosure, execute it without another confirmation; an earlier plan that omitted the worktree or said not to create one does not override the current request.
- A confirmed plan that lists the worktree's exact name, branch, base, target path, include scope, and command also authorizes execution without another confirmation. It never waives the pre-execution disclosure.
- Wait for confirmation only when the user is discussing rather than requesting the operation, the assistant proposed it, a required parameter cannot be inferred safely, or the target path, branch, file, directory, or symlink conflicts with existing state or risks an overwrite. Parameter drift beyond the current direct request or confirmed plan also requires confirmation.
- When a confirmed plan declares multiple worktrees, the coordinating agent must create and verify all of them before any implementation edit, generation, artifact verification, or task commit begins.
- Do not install dependencies.
- Do not download documentation.
- This setup skill does not stage or commit. Later nodes may stage or commit in the prepared worktree only when separately authorized by a confirmed plan.
- Do not overwrite existing branches, worktrees, files, directories, or symlinks.
- Before creation, confirm that every default sparse checkout path and every
  `--include` path exists in the selected base's Git tree.
- Stop on conflicts and print the exact path that blocks progress.
- Creating a worktree from `dev` uses only committed content from the selected base. Uncommitted changes in the current `dev` checkout or any other worktree are not carried into the new worktree and should not be treated as blockers.

## Plan-authoring Preflight

Before writing any exact worktree command into a plan, inspect `$WORKTREE_ROOT/vitest`. If it is already a symlink, record the requested Vitest path, its direct `readlink` target, and its fully resolved physical target separately. Choose `--vitest-root` using the script's `normalize_path_preserving_leaf` and `ensure_symlink` semantics. When multiple paths resolve to the same directory but the script decides compatibility from the direct mapping, the plan must use a parameter that the existing mapping accepts. Resolve any mismatch before requesting plan confirmation; do not defer it to execution. Plan to change the existing link only when the user explicitly requests that migration.

## Pre-execution Disclosure Gate

This disclosure is a durable informed record, not a second confirmation gate. When the current direct request or a matching confirmed plan already authorizes the operation, invoke the script after emitting the complete disclosure in the same turn.

For each worktree, before any tool call that can create the worktree or a symlink, emit one complete, durable disclosure record containing:

- the complete command verbatim
- every requested path alias
- the canonical worktree path
- every canonical `link path -> target` mapping the script will actually create, including the shared Vitest link

If any field is missing, stop and do not invoke the script. Record each planned worktree separately. Output produced after execution cannot backfill or replace this preflight record.

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

These paths form the fixed task control plane for GUI worktrees: they keep the
repository-local skills, project work documents, GUI sources, and generated
protocol schemas available without depending on another checkout. The schema
paths are direct inputs to GUI type-checking, Vite, and protocol validators.

Use `--include` only for additional task-specific source or tool paths outside
that fixed control plane, for example:

```text
codex-rs/app-server
```

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
