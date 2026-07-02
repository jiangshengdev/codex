---
name: debug-responsive-gui
description: Use only when debugging the Codex GUI with playwright-cli in a visible Google Chrome for Testing browser, including DevTools, responsive layout checks, screenshots, browser opening, visual verification, or reproducible browser-control step records. Do not use for ordinary `GUI 启动`, `启动 GUI`, `/gui`, or URL-only output; use gui-launch for those.
---

# Debug Responsive GUI

## Core Rules

- Use `gui-launch` for ordinary `GUI 启动`, `启动 GUI`, `/gui`, or URL-only requests. Use this skill only for explicit debugging, responsive checks, screenshots, browser opening, visual verification, or reproducible browser-control traces.
- Prefer `playwright-cli` for browser lifecycle control.
- Use `Google Chrome for Testing` for debugging, not the system `Google Chrome`.
- Keep the browser visible; launch it with `--headed`.
- Do not use Computer Use.
- Do not click by coordinates.
- Do not automatically choose or verify a specific device model.
- Use AppleScript only to activate `Google Chrome for Testing`, query windows, move windows, close recognizable restore dialogs, and send the allowed `Command+Shift+M` shortcut in the DevTools window.
- Query state or take a screenshot when the visual state is unclear. Do not guess.

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

## Workflow

- First call outer `launch_gui` to get the current GUI URL.
- Select URLs in this order by default: VPN -> LAN -> Local. If `launch_gui` returns a VPN URL, pass that VPN URL to `--gui-url`. Use the LAN URL only when no VPN URL exists, the VPN URL is explicitly unavailable, or the user explicitly asks for a LAN address. Use the Local URL only when no VPN/LAN URL exists, VPN/LAN is explicitly unavailable, or the user explicitly asks for a local address.
- Preserve the full `threadId` and `token` in the URL. Do not hand-write, guess, or splice URLs from old values.
- The entrypoint script runs discovery, CFT start/reuse, GUI navigation, window layout, responsive mode, reload, and metrics verification in order by default.
- Each step checks the real current state first. If the target state is already satisfied, it prints `skip` and exits 0; otherwise it performs that step.
- The state file is `/tmp/codex-debug-responsive-gui/current.json`.
- Always use the full URL returned by the current `launch_gui` call. Default to VPN -> LAN -> Local; use Local only as a fallback or when explicitly requested by the user.

## Restarting Or Recovering The GUI

When the user says "重启 GUI", "重启后端", or "GUI 不可用", or when the page shows `Codex GUI dev server unavailable`, first call outer `launch_gui` again to get the current GUI URL. Then choose the URL in VPN -> LAN -> Local order. Use the Local URL only when no VPN/LAN URL exists, VPN/LAN is explicitly unavailable, or the user explicitly asks for a local address.

Do not interpret "重启 GUI" as restarting the `codex-gui` Vite frontend by default. Do not start by killing `codex app-server`, inspecting processes, or restarting the Codex App. `launch_gui` is the recovery entrypoint for the GUI backend/proxy.

If the page still shows `Codex GUI dev server unavailable` after calling `launch_gui` again and opening the URL, then confirm or start the Vite dev server and refresh the same `launch_gui` URL.

If a `launch_gui` URL returns HTTP 502, it usually means the proxied `codex-gui` Vite dev server is not running or is unreachable. First check whether the default Vite dev server port, or the port specified by `CODEX_GUI_VITE_PORT`, is already listening. If the user already started Vite and kept it running, do not start another one. If nothing is listening, start a foreground session from the repo's `codex-gui` directory:

```bash
pnpm run dev
```

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

The script verifies workflow state:

- `playwright-cli` is connected.
- The browser is headed `chrome-for-testing`.
- The page is `codex-gui`.
- DevTools and browser windows can be queried and arranged through AX.
- The responsive step sends `Command+Shift+M` only when metrics are not responsive-like.
- After reload, metrics still prove that the page is `codex-gui`.

The script does not verify:

- Specific device models.
- The current selection in the DevTools device dropdown.
- iPhone SE, iPhone XR, or any other device profile.

## Common Validation Commands

```bash
find .codex/skills/debug-responsive-gui/scripts -name '*.mjs' -print0 | xargs -0 -n1 node --check
node .codex/skills/debug-responsive-gui/scripts/steps/00-check-tools.mjs
osascript .codex/skills/debug-responsive-gui/scripts/applescript/query-windows.applescript
node .codex/skills/debug-responsive-gui/scripts/steps/60-verify-responsive-metrics.mjs
```
