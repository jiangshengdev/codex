---
name: debug-responsive-gui
description: Use only for tier-three visible desktop acceptance or explicitly requested headed Codex GUI debugging with playwright-cli, including Google Chrome for Testing and DevTools window behavior, visible responsive-window checks, macOS IME, or reproducible visible browser-control traces. Do not use for tier-one automated regression, tier-two headless real-application acceptance, ordinary `GUI 启动`, `启动 GUI`, `/gui`, or URL-only output; use the applicable headless owner or gui-launch instead.
---

# Debug Responsive GUI

## Core Rules

- Use this skill only when the result depends on visible desktop state that headless browser automation cannot observe or prove equivalently, or when the user directly requests headed debugging for the current task.
- Before starting or reusing any visible browser, DevTools, or related desktop window, confirm that the user explicitly authorized the visible impact for this instance. A current direct request for headed debugging can provide that authorization; plan confirmation, design confirmation, a general request to continue, or an existing acceptance requirement cannot.
- Without that authorization, do not call this skill's automation entrypoint or any other command that starts or reuses visible desktop windows. Report `可见桌面验收未执行` and identify the blocked tier-three scenarios; continue only work that does not depend on them.
- Prefer `playwright-cli` for browser lifecycle control.
- Use `Google Chrome for Testing` for debugging, not the system `Google Chrome`.
- Keep the browser visible; launch it with `--headed`.
- Do not use Computer Use.
- Do not click by coordinates.
- Do not automatically choose or verify a specific device model.
- Use AppleScript only to activate `Google Chrome for Testing`, query windows, move windows, close recognizable restore dialogs, send the allowed `Command+Shift+M` shortcut in the DevTools window, and drive IME keyboard actions through `ime-control.mjs`.
- Query state or take a screenshot when the visual state is unclear; do not guess.

## Tier-Three Visible Desktop Acceptance Contract

- Derive the smallest tier-three scenario set from behavior that actually depends on visible desktop state. Do not route tier-one automated regression or tier-two headless real-application acceptance through this skill, and do not run an unrelated fixed exhaustive checklist.
- Browser or DevTools environment readiness, screenshots, and DOM assertions are supporting evidence only; none proves a tier-three scenario without the relevant visible desktop interaction and state checks.
- If every triggered tier-three scenario has not passed, do not claim that visible desktop acceptance or the overall task is complete. When authorization or the environment is unavailable, report `可见桌面验收未执行` and the blocked scenarios.

## Codex Runtime Handoff

- First determine whether a usable Codex runtime already exists.
- If none exists, ask the user to run the exact command `j c`. Do not execute that command. Wait for the user to explicitly confirm that it has started before continuing.
- Once the runtime is available, obtain the complete current GUI URL from `/gui` or outer `launch_gui`, preserving `threadId` and `token`. Do not hand-write, guess, splice, or reuse an old URL.
- Successful `j c` startup proves only that the user-side runtime prerequisite is available. It does not prove that a GUI URL was obtained, the page opened, the browser environment is ready, or acceptance passed.

## Automation Entrypoint

Stable usage:

```bash
node .codex/skills/debug-responsive-gui/scripts/debug-responsive-gui.mjs --gui-url '<VPN or LAN URL returned by launch_gui; use Local URL only when VPN/LAN is unavailable>'
```

## Inspectors

Both inspectors only read the current page controlled by `playwright-cli`, write JSON only to stdout, and do not launch, navigate, or close the browser.

### React inspector

Read the React fiber tree from the current page controlled by `playwright-cli`:

```bash
node .codex/skills/debug-responsive-gui/scripts/inspect-react.mjs
node .codex/skills/debug-responsive-gui/scripts/inspect-react.mjs --max-depth 4
node .codex/skills/debug-responsive-gui/scripts/inspect-react.mjs --component AppShell --max-depth 4
node .codex/skills/debug-responsive-gui/scripts/inspect-react.mjs --path 0.1.3 --max-depth 4
node .codex/skills/debug-responsive-gui/scripts/inspect-react.mjs --component AppShell --include-values
```

Use the default output for shallow discovery; it does not hard-code `codex-gui` component names. Use `--component`, `--path`, and `--max-depth` for deeper inspection. This script is React-only; use the Redux entrypoint below for Redux inspection.

### Redux inspector

Read the Redux store state from the current page controlled by `playwright-cli`:

```bash
node .codex/skills/debug-responsive-gui/scripts/inspect-redux.mjs
node .codex/skills/debug-responsive-gui/scripts/inspect-redux.mjs --path threadRuntime.current
node .codex/skills/debug-responsive-gui/scripts/inspect-redux.mjs --path transcriptState.entriesById --max-depth 2 --max-keys 40
```

The script enters the React fiber tree through `#root.__reactContainer$...`, finds the React-Redux Provider at `memoizedProps.value.store`, then reads `store.getState()`. It does not depend on the Redux DevTools extension or on `__REACT_DEVTOOLS_GLOBAL_HOOK__.getFiberRoots()`.

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

- Select URLs in this order by default: VPN -> LAN -> Local. If `launch_gui` returns a VPN URL, pass that VPN URL to `--gui-url`. Use the LAN URL only when no VPN URL exists, the VPN URL is explicitly unavailable, or the user explicitly asks for a LAN address. Use the Local URL only when no VPN/LAN URL exists, VPN/LAN is explicitly unavailable, or the user explicitly asks for a local address.
- The entrypoint script runs discovery, CFT start/reuse, GUI navigation, window layout, responsive mode, reload, and metrics verification in order by default.
- Each step checks the real current state first. If the target state is already satisfied, it prints `skip` and exits 0; otherwise it performs that step.
- The state file is `/tmp/codex-debug-responsive-gui/current.json`.

## Tier-Three Scenario Acceptance

For each affected tier-three scenario:

- Enter the real target route and establish the state required to exercise the changed behavior.
- Use representative desktop or narrow viewports only when those geometries are affected; do not require a named device model.
- Perform the relevant pointer and keyboard paths with semantic roles or otherwise reviewable locators.
- Check affected geometry, overflow, occlusion, clipping, scrolling, and overlay direction.
- Check focus location and `focus-visible` before and after the relevant interactions.
- Check affected default, hover, disabled, invalid, and other changed visual states.
- Exercise real Codex-backed behavior when static fixtures or isolated DOM state cannot prove the integration result.
- Query page state or take screenshots when evidence is unclear. Record passed, failed, and unexecuted checks with their evidence.

## Restarting Or Recovering The GUI

When the user says "重启 GUI", "重启后端", or "GUI 不可用", or when the page shows `Codex GUI dev server unavailable`, first call outer `launch_gui` again to get the current GUI URL, then apply the Workflow URL order above.

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

If a step fails, read stderr and `/tmp/codex-debug-responsive-gui/current.json` first. Failure does not relax the Core Rules.

## Verification Boundary

The automation entrypoint checks only environment readiness:

- `playwright-cli` is connected.
- The browser is headed `chrome-for-testing`.
- The page is `codex-gui`.
- DevTools and browser windows can be queried and arranged through AX.
- The responsive step sends `Command+Shift+M` only when metrics are not responsive-like.
- After reload, metrics still prove that the page is `codex-gui`.

It does not verify the product scenarios in Tier-Three Scenario Acceptance, the DevTools device selection, or any specific device profile.

## Result Reporting

Report these separately; none substitutes for another or makes environment readiness, screenshots, or DOM results sufficient for tier-three acceptance:

- Codex runtime availability and GUI URL acquisition.
- Automated regression results.
- Visible-browser environment status.
- Each executed tier-three visible desktop scenario and its result.
- Every tier-three acceptance item not executed because of environment, authorization, or an explicit user restriction, using `可见桌面验收未执行` when any applicable scenario remains blocked.

## Common Validation Commands

```bash
find .codex/skills/debug-responsive-gui/scripts -name '*.mjs' -print0 | xargs -0 -n1 node --check
node .codex/skills/debug-responsive-gui/scripts/steps/00-check-tools.mjs
osascript .codex/skills/debug-responsive-gui/scripts/applescript/query-windows.applescript
node .codex/skills/debug-responsive-gui/scripts/steps/60-verify-responsive-metrics.mjs
```
