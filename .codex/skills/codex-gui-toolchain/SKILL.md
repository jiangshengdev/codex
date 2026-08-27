---
name: codex-gui-toolchain
description: "Use when working in codex-gui before running pnpm commands, writing GUI verification steps, adding or changing package scripts, checking frontend tool versions, or ensuring the user's fnm-managed Node and pnpm are used instead of Codex runtime shims."
---

# Codex GUI Toolchain

Use this skill for `codex-gui` package-manager and script workflow.
It does not replace GUI feature skills such as `gui-launch`, `debug-responsive-gui`, `heroui-react`, `redux-toolkit`, or `vitest-react-browser-docs`.

Apply the general execution-environment preflight in `$managing-work-stages` and its
`references/execution-environment-preflight.md` first. Treat the checks below as the
frontend-specific delta; they do not replace or duplicate the general contract.

## Command Planning Check

Before writing a frontend command in a plan, verification step, or implementation note:

1. Read the live `codex-gui/package.json` and any repository-owned fixed entrypoint or recipe required by the applicable instructions or confirmed plan.
2. Confirm the named script or fixed entrypoint exists and that its target or discovery rules include the intended file, package, test, or generated target.
3. Use the repository-owned entrypoint when one exists. Do not reconstruct or bypass it with an equivalent lower-level command.

## Execution Preflight

Immediately before running a frontend command:

1. Apply the general execution-environment preflight, then repeat the command planning check against the current worktree.
2. Confirm the intended repository and `codex-gui` working directory. Do not rely on an earlier command's directory.
3. Verify the active Node and `pnpm` come from the user's fnm environment as described below.
4. Resolve the frontend-specific inputs. This includes referenced paths, generated schemas, validators, schema fixtures, and other tracked or generated inputs required by the selected target.
5. For Vitest Browser Mode, Playwright, or another frontend verification entrypoint, confirm that discovery actually collects and exercises the intended target and that output is written to the expected location. A successful command that skipped the target is not verification.

If an input is absent because a sparse worktree may be incomplete, use `codex-gui-worktree` only to inspect it. Repair it only when the user's current request or a confirmed plan explicitly authorizes that repair; otherwise stop and report the missing input. Do not duplicate the worktree skill's path list or setup procedure here.

## pnpm Environment

Before running `pnpm` in `codex-gui`, initialize the user's fnm environment for zsh:

```bash
/opt/homebrew/bin/fnm env --shell zsh
```

Then verify the active `pnpm` before running any project command.

If `pnpm` resolves under `/Users/<user>/.cache/codex-runtimes/`, stop and do not run the project command.

Known good invocation style on this machine:

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm --version
```

Use the same fnm-backed shape for project commands:

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
```

## No Installation

Never add, remove, install, rebuild, or update dependencies, runtimes, tools, or browser binaries.
This includes `pnpm add`, `pnpm install`, package manager self-updates, browser downloads, and generated runtime installs. If anything is missing, stop and suggest the user-run installation command; later permission does not authorize the assistant to install it.

## Script Existence Check

As part of the command planning check:

1. Read `codex-gui/package.json`.
2. Confirm the script exists.
3. Use the exact current script name.

If no script, repository-owned fixed entrypoint, or recipe exists, use the explicit direct command defined by the applicable frontend owner. For Vitest, this skill defines the following direct command shape:

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run <path>
```

Do not copy `pnpm run <script>` from old plans or memory without checking the live `package.json`.

## Scope

- Use `gui-launch` for ordinary `GUI 启动`, `启动 GUI`, `/gui`, or URL-only requests.
- Use `debug-responsive-gui` for visible browser debugging, screenshots, responsive checks, and reproducible browser-control traces.
- Use `heroui-react` when changing HeroUI components, variants, tokens, or local HeroUI docs.
- Use `vitest-react-browser-docs` for Vitest Browser Mode APIs and React browser tests.
