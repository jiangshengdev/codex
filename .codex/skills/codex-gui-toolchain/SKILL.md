---
name: codex-gui-toolchain
description: "Use when working in codex-gui before running pnpm commands, planning or running browser verification, performing headless acceptance against a real Codex runtime, adding or changing package scripts, checking frontend tool versions, or ensuring the user's fnm-managed Node and pnpm are used instead of Codex runtime shims."
---

# Codex GUI Toolchain

Apply the general execution-environment preflight in `$managing-work-stages` and its
`references/execution-environment-preflight.md` first. Treat the checks below as the
frontend-specific delta; they do not replace or duplicate the general contract.

## Command Planning Check

Before writing a frontend command in a plan, verification step, or implementation note:

Read the live `codex-gui/package.json` and required repository-owned entrypoints or recipes. Trace their CI and consumer chain to confirm authority and intended target discovery under the general preflight. Existing scripts, configuration, and history alone do not establish authority; overlapping formatters must have one authoritative owner without conflicting gates. Use the repository-owned entrypoint when one exists; do not reconstruct or bypass it with a lower-level command.

## Execution Preflight

Immediately before execution, repeat the planning check and general preflight against the current worktree: confirm the repository and `codex-gui` cwd, required paths, generated schemas, validators and fixtures, actual target collection and execution, and output location. Do not rely on an earlier command's directory. Verify that Node and `pnpm` use the fnm environment below.

If an input is absent because a sparse worktree may be incomplete, use `codex-gui-worktree` only to inspect it. Repair it only when the user's current request or a confirmed plan explicitly authorizes that repair; otherwise stop and report the missing input. Do not duplicate the worktree skill's path list or setup procedure here.

## Headless GUI Verification

Browser verification performed while executing a confirmed plan defaults to headless operation. Classify each required scenario by what it must prove; do not choose a visible browser merely because the behavior is user-facing.

### Level 1: Automated Regression

Level 1 covers isolated or test-environment browser automation such as Playwright E2E and Vitest Browser Mode. Use the repository-owned headless entrypoint verified by the command planning check. For Playwright Test, set `PLAYWRIGHT_HTML_OPEN=never` so the HTML reporter cannot open a window:

```bash
PLAYWRIGHT_HTML_OPEN=never /opt/homebrew/bin/fnm exec --using-file pnpm run test:e2e
```

Do not automatically open an HTML report or trace viewer. Record the collected target and its result; a successful command that collected no intended target is not Level 1 evidence.

### Level 2: Real Codex Runtime Acceptance

Level 2 uses a headless browser against the real Codex runtime. Obtain the complete current GUI URL from `/gui` or outer `launch_gui`; preserve its route, thread identifier, and token, and do not guess, splice, or reuse an old URL. When no repository-owned Level 2 entrypoint exists and the execution preflight permits a direct command, open that URL without `--headed`:

```bash
playwright-cli open '<complete current GUI URL>'
playwright-cli list --json
```

After opening, use the actual `list --json` output to identify the controlled session and verify that it is explicitly non-headed. A missing or ambiguous headed-state field is not proof of headless execution. Then establish and record all of the following:

- the usable Codex runtime and current full URL;
- the intended route and real application state;
- the relevant pointer, keyboard, focus, accessibility, layout, scrolling, overflow, or integration interactions;
- each required scenario's observed result.

Opening the page, taking a screenshot, exercising an isolated fixture, or passing Level 1 tests does not by itself prove Level 2 acceptance.

### Failure And Level 3 Routing

If the required headless entrypoint, current URL, runtime, session-state evidence, target discovery, or scenario evidence is unavailable, mark the affected level or scenario `unexecuted`. Do not silently switch to `test:e2e:headed`, add `--headed`, open a report or trace viewer, or invoke `$debug-responsive-gui` as a fallback.

Route to `$debug-responsive-gui` only when evidence shows that the result itself depends on visible desktop state, such as operating-system windows, cross-application desktop focus, DevTools window behavior, or a system IME. That Level 3 skill owns its separate visible-window authorization and acceptance workflow.

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

## Direct Command Fallback

If no script, repository-owned fixed entrypoint, or recipe exists, use the explicit direct command defined by the applicable frontend owner. For Vitest, this skill defines the following direct command shape:

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run <path>
```

## Local Frontend Dependency Docs

Before using local HeroUI, Redux Toolkit, or Vitest documentation, read
[Local frontend dependency docs](references/local-frontend-dependency-docs.md)
for the shared offline navigation contract. The applicable feature skill remains
the owner of its exact documentation root, preferred subtrees, search terms, and
domain API rules. `codex-gui-worktree` owns provisioning those local resources;
this skill does not create or repair their links.

## Related Skills

- Use `gui-launch` for ordinary `GUI 启动`, `启动 GUI`, `/gui`, or URL-only requests.
- Use `debug-responsive-gui` only for Level 3 visible-desktop acceptance or explicitly requested visible debugging, screenshots, responsive checks, and reproducible browser-control traces.
- Use `heroui-react` when changing HeroUI components, variants, tokens, or local HeroUI docs.
- Use `redux-toolkit` for Redux Toolkit APIs, architecture, or local Redux documentation.
- Use `vitest-react-browser-docs` for Vitest Browser Mode APIs and React browser tests.
