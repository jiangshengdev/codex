---
name: codex-gui-toolchain
description: "Use when working in codex-gui before running pnpm commands, writing GUI verification steps, adding or changing package scripts, checking frontend tool versions, or ensuring the user's fnm-managed Node and pnpm are used instead of Codex runtime shims."
---

# Codex GUI Toolchain

Use this skill for `codex-gui` package-manager and script workflow.
It does not replace GUI feature skills such as `gui-launch`, `debug-responsive-gui`, `heroui-react`, `redux-toolkit`, or `vitest-react-browser-docs`.

## pnpm Environment

Before running `pnpm` in `codex-gui`, initialize the user's fnm environment for zsh:

```bash
/opt/homebrew/bin/fnm env --shell zsh
```

Then verify the active `pnpm` before running any command that could install, delete, rebuild, or otherwise modify dependencies.

If `pnpm` resolves under `/Users/<user>/.cache/codex-runtimes/`, stop and do not continue with dependency-changing commands.

Known good invocation style on this machine:

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm --version
```

Use the same fnm-backed shape for project commands when practical:

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
```

## No Install Without Permission

Do not add, remove, install, rebuild, or update dependencies unless the user explicitly authorized that operation.
This includes `pnpm add`, `pnpm install`, package manager self-updates, browser downloads, and generated runtime installs.

## Script Existence Check

Before writing or running any frontend command in a plan, verification step, or implementation note:

1. Read `codex-gui/package.json`.
2. Confirm the script exists.
3. Use the exact current script name.

If no script exists, use an explicit equivalent command such as:

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run <path>
```

Do not copy `pnpm run <script>` from old plans or memory without checking the live `package.json`.

## Scope

- Use `gui-launch` for ordinary `GUI 启动`, `启动 GUI`, `/gui`, or URL-only requests.
- Use `debug-responsive-gui` for visible browser debugging, screenshots, responsive checks, and reproducible browser-control traces.
- Use `heroui-react` when changing HeroUI components, variants, tokens, or local HeroUI docs.
- Use `vitest-react-browser-docs` for Vitest Browser Mode APIs and React browser tests.
