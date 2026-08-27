---
name: debug-responsive-gui
description: Use when debugging or validating affected Codex GUI behavior with playwright-cli in a visible Google Chrome for Testing browser, including real GUI acceptance, DevTools, responsive layout checks, screenshots, browser opening, visual verification, or reproducible browser-control traces. Do not use for ordinary `GUI 启动`, `启动 GUI`, `/gui`, or URL-only output; use gui-launch for those.
---

# Debug Responsive GUI

## Core Rules

- Use `gui-launch` for ordinary `GUI 启动`, `启动 GUI`, `/gui`, or URL-only requests. Use this skill for explicit debugging, responsive checks, screenshots, browser opening, visual verification, reproducible browser-control traces, or when `codex-gui/AGENTS.md` requires real GUI acceptance for an affected scenario.
- Prefer `playwright-cli` for browser lifecycle control.
- Use `Google Chrome for Testing` for debugging, not the system `Google Chrome`.
- Keep the browser visible; launch it with `--headed`.
- Do not use Computer Use.
- Do not click by coordinates.
- Do not automatically choose or verify a specific device model.
- Use AppleScript only to activate `Google Chrome for Testing`, query windows, move windows, close recognizable restore dialogs, send the allowed `Command+Shift+M` shortcut in the DevTools window, and drive IME keyboard actions through `ime-control.mjs`.
- Query state or take a screenshot when the visual state is unclear. Do not guess.

## Real GUI Acceptance Contract

- Derive the smallest acceptance scenario set from the changed behavior. Do not run an unrelated fixed exhaustive checklist.
- Record Codex runtime availability, GUI URL acquisition, visible-browser environment readiness, automated regression results, and affected real GUI scenario results separately. None substitutes for another.
- A screenshot is supporting evidence only; it does not prove acceptance without the relevant interaction and state checks.
- If every triggered scenario has not passed, do not claim that real GUI acceptance or the overall task is complete. When the environment is unavailable or the user explicitly prohibits validation, report `真实 GUI 未验收`.

## Codex Runtime Handoff

- First determine whether a usable Codex runtime already exists.
- If none exists, ask the user to run the exact command `j c`. Do not execute that command. Wait for the user to explicitly confirm that it has started before continuing.
- Once the runtime is available, obtain the complete current GUI URL from `/gui` or outer `launch_gui`. Do not hand-write, guess, splice, or reuse an old URL.
- Successful `j c` startup proves only that the user-side runtime prerequisite is available. It does not prove that a GUI URL was obtained, the page opened, the browser environment is ready, or acceptance passed.

## Automation Entrypoint

Script path:

```bash
.codex/skills/debug-responsive-gui/scripts/debug-responsive-gui.mjs
```

Stable usage:

```bash
node .codex/skills/debug-responsive-gui/scripts/debug-responsive-gui.mjs --gui-url '<VPN or LAN URL returned by launch_gui; use Local URL only when VPN/LAN is unavailable>'
```

## React inspector

Read the React fiber tree from the current page controlled by `playwright-cli`:

```bash
node .codex/skills/debug-responsive-gui/scripts/inspect-react.mjs
node .codex/skills/debug-responsive-gui/scripts/inspect-react.mjs --max-depth 4
node .codex/skills/debug-responsive-gui/scripts/inspect-react.mjs --component AppShell --max-depth 4
node .codex/skills/debug-responsive-gui/scripts/inspect-react.mjs --path 0.1.3 --max-depth 4
node .codex/skills/debug-responsive-gui/scripts/inspect-react.mjs --component AppShell --include-values
```

The script only inspects the currently open page. It does not launch, navigate, or close the browser. It writes JSON only to stdout. Use the default output for shallow discovery; it does not hard-code `codex-gui` component names. Use `--component`, `--path`, and `--max-depth` for deeper inspection. This script is React-only; use the separate Redux entrypoint below for Redux inspection.

## Redux inspector

Read the Redux store state from the current page controlled by `playwright-cli`:

```bash
node .codex/skills/debug-responsive-gui/scripts/inspect-redux.mjs
node .codex/skills/debug-responsive-gui/scripts/inspect-redux.mjs --path threadRuntime.current
node .codex/skills/debug-responsive-gui/scripts/inspect-redux.mjs --path transcriptState.entriesById --max-depth 2 --max-keys 40
```

The script only inspects the current page controlled by `playwright-cli`. It does not launch, navigate, or close the browser. It writes JSON only to stdout. It enters the React fiber tree through `#root.__reactContainer$...`, finds the React-Redux Provider at `memoizedProps.value.store`, then reads `store.getState()`. It does not depend on the Redux DevTools extension or on `__REACT_DEVTOOLS_GLOBAL_HOOK__.getFiberRoots()`.

The default output is a safe summary, not the full store. Use `--path <dot.path>` for a specific state subtree. Output is still bounded by `--max-depth`, `--max-keys`, `--max-array-items`, and `--max-string-length`.

## IME control

Use `ime-control.mjs` when testing macOS Simplified Pinyin input, IME candidate windows, or IME Enter behavior in visible `Google Chrome for Testing`.

```bash
node .codex/skills/debug-responsive-gui/scripts/ime-control.mjs start
node .codex/skills/debug-responsive-gui/scripts/ime-control.mjs type nihao --session <session-id>
node .codex/skills/debug-responsive-gui/scripts/ime-control.mjs key arrow-down --session <session-id>
node .codex/skills/debug-responsive-gui/scripts/ime-control.mjs key digit-3 --session <session-id>
```

Read `/tmp/codex-ime-control/<session-id>/latest-candidate.json` first. Open `candidate.png` only when AX output is suspicious or visual verification is needed.

## Workflow

- After completing the Codex runtime handoff, use the complete current GUI URL from `/gui` or outer `launch_gui`.
- Select URLs in this order by default: VPN -> LAN -> Local. If `launch_gui` returns a VPN URL, pass that VPN URL to `--gui-url`. Use the LAN URL only when no VPN URL exists, the VPN URL is explicitly unavailable, or the user explicitly asks for a LAN address. Use the Local URL only when no VPN/LAN URL exists, VPN/LAN is explicitly unavailable, or the user explicitly asks for a local address.
- Preserve the full `threadId` and `token` in the URL. Do not hand-write, guess, or splice URLs from old values.
- The entrypoint script runs discovery, CFT start/reuse, GUI navigation, window layout, responsive mode, reload, and metrics verification in order by default.
- Each step checks the real current state first. If the target state is already satisfied, it prints `skip` and exits 0; otherwise it performs that step.
- The state file is `/tmp/codex-debug-responsive-gui/current.json`.
- Always use the full URL returned by the current `launch_gui` call. Default to VPN -> LAN -> Local; use Local only as a fallback or when explicitly requested by the user.

## Scenario Acceptance

For each affected scenario:

- Enter the real target route and establish the state required to exercise the changed behavior.
- Use representative desktop or narrow viewports only when those geometries are affected; do not require a named device model.
- Perform the relevant pointer and keyboard paths with semantic roles or otherwise reviewable locators. Do not click by coordinates.
- Check affected geometry, overflow, occlusion, clipping, scrolling, and overlay direction.
- Check focus location and `focus-visible` before and after the relevant interactions.
- Check affected default, hover, disabled, invalid, and other changed visual states.
- Exercise real Codex-backed behavior when static fixtures or isolated DOM state cannot prove the integration result.
- Query page state or take screenshots when evidence is unclear. Record passed, failed, and unexecuted checks with their evidence.

## Restarting Or Recovering The GUI

When the user says "重启 GUI", "重启后端", or "GUI 不可用", or when the page shows `Codex GUI dev server unavailable`, first call outer `launch_gui` again to get the current GUI URL. Then choose the URL in VPN -> LAN -> Local order. Use the Local URL only when no VPN/LAN URL exists, VPN/LAN is explicitly unavailable, or the user explicitly asks for a local address.

Do not interpret "重启 GUI" as restarting the `codex-gui` Vite frontend by default. Do not start by killing `codex app-server`, inspecting processes, or restarting the Codex App. `launch_gui` is the recovery entrypoint for the GUI backend/proxy.

If the page still shows `Codex GUI dev server unavailable` after calling `launch_gui` again and opening the URL, then confirm or start the Vite dev server and refresh the same `launch_gui` URL.

If a `launch_gui` URL returns HTTP 502, it usually means the proxied `codex-gui` Vite dev server is not running or is unreachable. First check whether the default Vite dev server port, or the port specified by `CODEX_GUI_VITE_PORT`, is already listening. If the user already started Vite and kept it running, do not start another one. If nothing is listening, use `$codex-gui-toolchain` from the repository's `codex-gui` directory to resolve and run the current repository-owned frontend dev-server entrypoint in a foreground session with the required fnm-backed Node and `pnpm` environment.

Keep that Vite session running, then refresh the same `launch_gui` URL. Do not treat the `debug-responsive-gui` automation script as a Vite lifecycle manager; it only opens and verifies the GUI. Do not use `nohup` or a background shell to keep Vite alive by default unless the user explicitly asks for a background daemon approach and accepts the extra verification.

## Step Recovery

After a failure, rerun the failed step script directly:

```bash
node .codex/skills/debug-responsive-gui/scripts/steps/00-check-tools.mjs
node .codex/skills/debug-responsive-gui/scripts/steps/05-discover-current-state.mjs
node .codex/skills/debug-responsive-gui/scripts/steps/10-start-cft-if-needed.mjs
node .codex/skills/debug-responsive-gui/scripts/steps/20-open-gui-if-needed.mjs --gui-url '<VPN or LAN URL returned by launch_gui; use Local URL only when VPN/LAN is unavailable>'
node .codex/skills/debug-responsive-gui/scripts/steps/30-layout-windows-if-needed.mjs
node .codex/skills/debug-responsive-gui/scripts/steps/40-enter-responsive-if-needed.mjs
node .codex/skills/debug-responsive-gui/scripts/steps/50-reload-page.mjs
node .codex/skills/debug-responsive-gui/scripts/steps/60-verify-responsive-metrics.mjs
```

If a step fails, read stderr and `/tmp/codex-debug-responsive-gui/current.json` first. Do not switch to Computer Use, coordinate clicks, or the system `Google Chrome` because one step failed.

## Verification Boundary

The automation entrypoint verifies only workflow environment state. Its success means the real GUI acceptance environment is ready; it does not mean any affected product scenario passed:

- `playwright-cli` is connected.
- The browser is headed `chrome-for-testing`.
- The page is `codex-gui`.
- DevTools and browser windows can be queried and arranged through AX.
- The responsive step sends `Command+Shift+M` only when metrics are not responsive-like.
- After reload, metrics still prove that the page is `codex-gui`.

The script does not verify:

- The target route's user-visible behavior.
- Relevant pointer and keyboard interactions.
- Affected geometry, overflow, occlusion, clipping, scrolling, or overlay direction.
- Focus flow or `focus-visible` state.
- Affected component visual states.
- Real Codex-backed integration behavior.
- Specific device models.
- The current selection in the DevTools device dropdown.
- iPhone SE, iPhone XR, or any other device profile.

## Result Reporting

Report these separately:

- Automated regression results.
- Visible-browser environment status.
- Each executed real GUI scenario and its result.
- Every acceptance item not executed because of environment, authorization, or an explicit user restriction.

Only report real GUI acceptance as passed when every triggered scenario has passed.

## Common Validation Commands

```bash
find .codex/skills/debug-responsive-gui/scripts -name '*.mjs' -print0 | xargs -0 -n1 node --check
node .codex/skills/debug-responsive-gui/scripts/steps/00-check-tools.mjs
osascript .codex/skills/debug-responsive-gui/scripts/applescript/query-windows.applescript
node .codex/skills/debug-responsive-gui/scripts/steps/60-verify-responsive-metrics.mjs
```
