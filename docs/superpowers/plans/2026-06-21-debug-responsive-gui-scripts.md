# Debug Responsive GUI Scripts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build resumable `debug-responsive-gui` skill scripts that discover current GUI/browser state, fill missing pieces, and avoid repeated or destructive browser actions.

**Architecture:** Use Node.js `.mjs` modules for orchestration, state, JSON parsing, metrics, and `playwright-cli` calls. Keep AppleScript in standalone files for macOS window and keyboard operations. Each step is independently runnable and idempotent, backed by `/tmp/codex-debug-responsive-gui/current.json`.

**Tech Stack:** Node.js ESM, built-in Node modules only, `playwright-cli`, `osascript`, AppleScript, Git.

---

## Scope

This plan implements the script system described in `docs/superpowers/specs/2026-06-21-debug-responsive-gui-scripts-design.md`.

Do not touch `.codex/skills/debug-responsive-gui/SKILL.md` until the scripts pass verification. Do not stage or commit `.codex/skills/debug-responsive-gui/` unless the task explicitly says so. Do not install dependencies.

## File Structure

- Create: `.codex/skills/debug-responsive-gui/scripts/debug-responsive-gui.mjs`  
  Entry point. Parses flags, validates `--gui-url`, runs steps in order, and forwards exit codes.
- Create: `.codex/skills/debug-responsive-gui/scripts/lib/exec.mjs`  
  Shell command wrapper, JSON command helper, logging, repository path helpers.
- Create: `.codex/skills/debug-responsive-gui/scripts/lib/state.mjs`  
  Read, write, merge, and reset `/tmp/codex-debug-responsive-gui/current.json`.
- Create: `.codex/skills/debug-responsive-gui/scripts/lib/playwright-cli.mjs`  
  Typed wrappers for `playwright-cli list --json`, `eval`, `goto`, `reload`, `open`, and `close`.
- Create: `.codex/skills/debug-responsive-gui/scripts/lib/metrics.mjs`  
  Browser metrics expression and response-state classification.
- Create: `.codex/skills/debug-responsive-gui/scripts/lib/applescript.mjs`  
  Runs AppleScript files and parses JSON returned by JavaScript for Automation where applicable.
- Create: `.codex/skills/debug-responsive-gui/scripts/steps/*.mjs`  
  One independently runnable step per workflow action.
- Create: `.codex/skills/debug-responsive-gui/scripts/applescript/*.applescript`  
  AppleScript and JavaScript for Automation used by the step scripts.
- Modify after script verification: `.codex/skills/debug-responsive-gui/SKILL.md`  
  Add only stable script entry usage and constraints.

## Task 1: Create Script Skeleton

**Files:**
- Create: `.codex/skills/debug-responsive-gui/scripts/debug-responsive-gui.mjs`
- Create: `.codex/skills/debug-responsive-gui/scripts/lib/exec.mjs`
- Create: `.codex/skills/debug-responsive-gui/scripts/lib/state.mjs`
- Create: `.codex/skills/debug-responsive-gui/scripts/lib/playwright-cli.mjs`
- Create: `.codex/skills/debug-responsive-gui/scripts/lib/metrics.mjs`
- Create: `.codex/skills/debug-responsive-gui/scripts/lib/applescript.mjs`
- Create: `.codex/skills/debug-responsive-gui/scripts/steps/00-check-tools.mjs`
- Create: `.codex/skills/debug-responsive-gui/scripts/steps/05-discover-current-state.mjs`
- Create: `.codex/skills/debug-responsive-gui/scripts/steps/10-start-cft-if-needed.mjs`
- Create: `.codex/skills/debug-responsive-gui/scripts/steps/20-open-gui-if-needed.mjs`
- Create: `.codex/skills/debug-responsive-gui/scripts/steps/30-layout-windows-if-needed.mjs`
- Create: `.codex/skills/debug-responsive-gui/scripts/steps/40-enter-responsive-if-needed.mjs`
- Create: `.codex/skills/debug-responsive-gui/scripts/steps/50-reload-page.mjs`
- Create: `.codex/skills/debug-responsive-gui/scripts/steps/60-verify-responsive-metrics.mjs`
- Create: `.codex/skills/debug-responsive-gui/scripts/applescript/query-windows.applescript`
- Create: `.codex/skills/debug-responsive-gui/scripts/applescript/layout-windows.applescript`
- Create: `.codex/skills/debug-responsive-gui/scripts/applescript/enter-responsive.applescript`
- Create: `.codex/skills/debug-responsive-gui/scripts/applescript/close-restore-dialog.applescript`

- [ ] **Step 1: Create directories**

Run:

```bash
mkdir -p .codex/skills/debug-responsive-gui/scripts/lib
mkdir -p .codex/skills/debug-responsive-gui/scripts/steps
mkdir -p .codex/skills/debug-responsive-gui/scripts/applescript
```

Expected: directories exist and `git status --short -- .codex/skills/debug-responsive-gui/scripts` shows no files until file creation.

- [ ] **Step 2: Create placeholder-safe module files**

Use `apply_patch` to create the files with executable module headers and no business logic. Each file should export or import enough to pass syntax checks.

```js
#!/usr/bin/env node
```

For step files, use this minimal pattern:

```js
#!/usr/bin/env node

console.log('step skeleton');
```

Expected: every `.mjs` file exists and contains valid ESM syntax.

- [ ] **Step 3: Run syntax check**

Run:

```bash
find .codex/skills/debug-responsive-gui/scripts -name '*.mjs' -print0 | xargs -0 -n1 node --check
```

Expected: every file reports no syntax errors.

## Task 2: Implement Shared Execution and State Libraries

**Files:**
- Modify: `.codex/skills/debug-responsive-gui/scripts/lib/exec.mjs`
- Modify: `.codex/skills/debug-responsive-gui/scripts/lib/state.mjs`

- [ ] **Step 1: Implement `exec.mjs`**

Replace the file with:

```js
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const scriptRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

export function log(message) {
  console.log(`[debug-responsive-gui] ${message}`);
}

export function fail(message, details = undefined) {
  console.error(`[debug-responsive-gui] ERROR: ${message}`);
  if (details !== undefined && details !== '') {
    console.error(String(details));
  }
  process.exitCode = 1;
}

export function run(command, args = [], options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    stdio: options.stdio ?? 'pipe',
    env: options.env ?? process.env,
  });

  if (result.error) {
    throw result.error;
  }

  if (options.allowFailure !== true && result.status !== 0) {
    const stderr = result.stderr?.trim();
    const stdout = result.stdout?.trim();
    throw new Error(
      `${command} ${args.join(' ')} failed with exit ${result.status}\n${stderr || stdout}`,
    );
  }

  return result;
}

export function runText(command, args = [], options = {}) {
  return run(command, args, options).stdout.trim();
}

export function runJson(command, args = [], options = {}) {
  const text = runText(command, args, options);
  if (text === '') {
    return null;
  }
  return JSON.parse(text);
}
```

- [ ] **Step 2: Implement `state.mjs`**

Replace the file with:

```js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const stateDir = path.join(os.tmpdir(), 'codex-debug-responsive-gui');
export const statePath = path.join(stateDir, 'current.json');

export function readState() {
  try {
    return JSON.parse(fs.readFileSync(statePath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') {
      return {};
    }
    throw error;
  }
}

export function writeState(state) {
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
}

export function updateState(patch) {
  const current = readState();
  const next = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  writeState(next);
  return next;
}

export function resetState(patch = {}) {
  const next = {
    runId: new Date().toISOString(),
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  writeState(next);
  return next;
}

export function stripFragment(url) {
  const parsed = new URL(url);
  parsed.hash = '';
  return parsed.toString();
}
```

- [ ] **Step 3: Run syntax check**

Run:

```bash
node --check .codex/skills/debug-responsive-gui/scripts/lib/exec.mjs
node --check .codex/skills/debug-responsive-gui/scripts/lib/state.mjs
```

Expected: both commands pass.

## Task 3: Implement Playwright and Metrics Libraries

**Files:**
- Modify: `.codex/skills/debug-responsive-gui/scripts/lib/playwright-cli.mjs`
- Modify: `.codex/skills/debug-responsive-gui/scripts/lib/metrics.mjs`

- [ ] **Step 1: Implement `playwright-cli.mjs`**

Replace the file with:

```js
import { run, runJson, runText } from './exec.mjs';

export function listBrowsers() {
  try {
    return runJson('playwright-cli', ['list', '--json'], { allowFailure: false }) ?? {};
  } catch {
    return {};
  }
}

export function currentBrowser() {
  const listed = listBrowsers();
  const browsers = listed.browsers ?? [];
  return browsers.find((browser) => browser.name === 'default') ?? browsers[0] ?? null;
}

export function evalJson(expression) {
  const text = runText('playwright-cli', ['--raw', 'eval', expression]);
  return JSON.parse(text);
}

export function gotoUrl(url) {
  run('playwright-cli', ['goto', url], { stdio: 'inherit' });
}

export function reloadPage() {
  run('playwright-cli', ['reload'], { stdio: 'inherit' });
}

export function closeBrowserAllowFailure() {
  run('playwright-cli', ['close'], { allowFailure: true });
}

export function openChromeForTesting({ profile, config, url }) {
  run(
    'playwright-cli',
    ['open', '--browser=chromium', '--headed', `--profile=${profile}`, '--config', config, url],
    { stdio: 'inherit' },
  );
}
```

- [ ] **Step 2: Implement `metrics.mjs`**

Replace the file with:

```js
export const metricsExpression = `JSON.stringify({
  url: location.href,
  title: document.title,
  innerWidth,
  innerHeight,
  outerWidth,
  outerHeight,
  dpr: devicePixelRatio,
  visualViewport: visualViewport
    ? { width: visualViewport.width, height: visualViewport.height, scale: visualViewport.scale }
    : null,
  documentElementClientWidth: document.documentElement.clientWidth,
  bodyClientWidth: document.body ? document.body.clientWidth : null,
  maxTouchPoints: navigator.maxTouchPoints,
  ua: navigator.userAgent,
  viewportMeta: document.querySelector('meta[name=viewport]')?.getAttribute('content') || null
})`;

export function isCodexGui(metrics) {
  return metrics?.title === 'codex-gui' && typeof metrics?.url === 'string';
}

export function responsiveLike(metrics) {
  if (!metrics) {
    return false;
  }
  const width = metrics.documentElementClientWidth ?? metrics.bodyClientWidth ?? metrics.innerWidth;
  const hasMobileWidth = typeof width === 'number' && width > 0 && width <= 500;
  const hasTouch = Number(metrics.maxTouchPoints) > 0;
  const mobileUa = /Mobile|iPhone|Android/i.test(metrics.ua ?? '');
  return hasMobileWidth && (hasTouch || mobileUa);
}

export function summarizeMetrics(metrics) {
  return {
    url: metrics?.url ?? null,
    title: metrics?.title ?? null,
    innerWidth: metrics?.innerWidth ?? null,
    innerHeight: metrics?.innerHeight ?? null,
    outerWidth: metrics?.outerWidth ?? null,
    outerHeight: metrics?.outerHeight ?? null,
    dpr: metrics?.dpr ?? null,
    documentElementClientWidth: metrics?.documentElementClientWidth ?? null,
    bodyClientWidth: metrics?.bodyClientWidth ?? null,
    maxTouchPoints: metrics?.maxTouchPoints ?? null,
    responsiveLike: responsiveLike(metrics),
  };
}
```

- [ ] **Step 3: Run syntax check**

Run:

```bash
node --check .codex/skills/debug-responsive-gui/scripts/lib/playwright-cli.mjs
node --check .codex/skills/debug-responsive-gui/scripts/lib/metrics.mjs
```

Expected: both commands pass.

## Task 4: Implement AppleScript Integration

**Files:**
- Modify: `.codex/skills/debug-responsive-gui/scripts/lib/applescript.mjs`
- Modify: `.codex/skills/debug-responsive-gui/scripts/applescript/query-windows.applescript`
- Modify: `.codex/skills/debug-responsive-gui/scripts/applescript/layout-windows.applescript`
- Modify: `.codex/skills/debug-responsive-gui/scripts/applescript/enter-responsive.applescript`
- Modify: `.codex/skills/debug-responsive-gui/scripts/applescript/close-restore-dialog.applescript`

- [ ] **Step 1: Implement AppleScript runner**

Replace `applescript.mjs` with:

```js
import path from 'node:path';
import { runText, scriptRoot } from './exec.mjs';

export function appleScriptPath(name) {
  return path.join(scriptRoot, 'applescript', name);
}

export function runAppleScript(name, args = []) {
  return runText('osascript', [appleScriptPath(name), ...args]);
}

export function runAppleScriptJson(name, args = []) {
  const text = runAppleScript(name, args);
  return text === '' ? null : JSON.parse(text);
}
```

- [ ] **Step 2: Implement `query-windows.applescript`**

Write:

```applescript
use framework "Foundation"
use scripting additions

on jsonString(value)
  set dataValue to current application's NSJSONSerialization's dataWithJSONObject:value options:0 |error|:(missing value)
  return (current application's NSString's alloc()'s initWithData:dataValue encoding:(current application's NSUTF8StringEncoding)) as text
end jsonString

set output to {}
tell application "System Events"
  if exists process "Google Chrome for Testing" then
    tell process "Google Chrome for Testing"
      repeat with w in windows
        set end of output to {name:(name of w), fullscreen:(value of attribute "AXFullScreen" of w), position:(position of w), size:(size of w)}
      end repeat
    end tell
  end if
end tell

return my jsonString(output)
```

- [ ] **Step 3: Implement `layout-windows.applescript`**

Write:

```applescript
on parseInteger(valueText)
  return valueText as integer
end parseInteger

set browserX to my parseInteger(item 1 of argv)
set browserY to my parseInteger(item 2 of argv)
set browserW to my parseInteger(item 3 of argv)
set browserH to my parseInteger(item 4 of argv)
set devtoolsX to my parseInteger(item 5 of argv)
set devtoolsY to my parseInteger(item 6 of argv)
set devtoolsW to my parseInteger(item 7 of argv)
set devtoolsH to my parseInteger(item 8 of argv)

tell application "Google Chrome for Testing" to activate
tell application "System Events"
  tell process "Google Chrome for Testing"
    repeat with w in windows
      set windowName to name of w
      set value of attribute "AXFullScreen" of w to false
      if windowName starts with "DevTools" then
        set position of w to {devtoolsX, devtoolsY}
        set size of w to {devtoolsW, devtoolsH}
      else if windowName contains "Google Chrome for Testing" then
        set position of w to {browserX, browserY}
        set size of w to {browserW, browserH}
      end if
    end repeat
  end tell
end tell
```

- [ ] **Step 4: Implement `enter-responsive.applescript`**

Write:

```applescript
tell application "Google Chrome for Testing" to activate
tell application "System Events"
  tell process "Google Chrome for Testing"
    set targetWindow to missing value
    repeat with w in windows
      if name of w starts with "DevTools" then
        set targetWindow to w
        exit repeat
      end if
    end repeat
    if targetWindow is missing value then error "DevTools window not found"
    perform action "AXRaise" of targetWindow
    set value of attribute "AXFocused" of targetWindow to true
    delay 0.2
    keystroke "m" using {command down, shift down}
  end tell
end tell
```

- [ ] **Step 5: Implement `close-restore-dialog.applescript`**

Write:

```applescript
on pressClose(e)
  tell application "System Events"
    try
      if role of e is "AXButton" and description of e is "关闭" then
        perform action "AXPress" of e
        return true
      end if
    end try
    try
      repeat with c in UI elements of e
        if my pressClose(c) then return true
      end repeat
    end try
    return false
  end tell
end pressClose

tell application "System Events"
  if exists process "Google Chrome for Testing" then
    tell process "Google Chrome for Testing"
      repeat with w in windows
        if name of w is "要恢复页面吗？" then
          return my pressClose(w)
        end if
      end repeat
    end tell
  end if
end tell
return false
```

- [ ] **Step 6: Run syntax checks**

Run:

```bash
node --check .codex/skills/debug-responsive-gui/scripts/lib/applescript.mjs
osascript .codex/skills/debug-responsive-gui/scripts/applescript/query-windows.applescript
```

Expected: Node syntax passes. `query-windows.applescript` returns JSON array text; it may be `[]` if CFT is not open.

## Task 5: Implement Tool Check and Discovery Steps

**Files:**
- Modify: `.codex/skills/debug-responsive-gui/scripts/steps/00-check-tools.mjs`
- Modify: `.codex/skills/debug-responsive-gui/scripts/steps/05-discover-current-state.mjs`

- [ ] **Step 1: Implement `00-check-tools.mjs`**

Replace the file with:

```js
#!/usr/bin/env node

import { run, log } from '../lib/exec.mjs';

const tools = ['node', 'playwright-cli', 'osascript'];
const missing = [];

for (const tool of tools) {
  const result = run('/usr/bin/env', [tool, '--version'], { allowFailure: true });
  if (result.status !== 0) {
    missing.push(tool);
  } else {
    log(`${tool}: ${result.stdout.trim() || 'available'}`);
  }
}

if (missing.length > 0) {
  console.error(`Missing required tools: ${missing.join(', ')}`);
  process.exit(1);
}
```

- [ ] **Step 2: Implement `05-discover-current-state.mjs`**

Replace the file with:

```js
#!/usr/bin/env node

import { runAppleScriptJson } from '../lib/applescript.mjs';
import { log } from '../lib/exec.mjs';
import { metricsExpression, responsiveLike, summarizeMetrics } from '../lib/metrics.mjs';
import { currentBrowser, evalJson } from '../lib/playwright-cli.mjs';
import { updateState } from '../lib/state.mjs';

function readMetrics() {
  try {
    return evalJson(metricsExpression);
  } catch {
    return null;
  }
}

const browser = currentBrowser();
const windows = runAppleScriptJson('query-windows.applescript');
const metrics = readMetrics();
const hasDevToolsWindow = windows.some((window) => window.name?.startsWith('DevTools'));
const hasBrowserWindow = windows.some((window) => window.name?.includes('Google Chrome for Testing'));

const discovery = {
  hasBrowser: browser !== null,
  isChromeForTesting: browser?.browserType === 'chrome-for-testing',
  isHeaded: browser?.headed === true,
  hasBrowserWindow,
  hasDevToolsWindow,
  isCodexGui: metrics?.title === 'codex-gui',
  responsiveLike: responsiveLike(metrics),
};

updateState({
  browser,
  windows,
  discovery,
  lastMetrics: metrics ? summarizeMetrics(metrics) : null,
});

log(JSON.stringify({ discovery, lastMetrics: metrics ? summarizeMetrics(metrics) : null }, null, 2));
```

- [ ] **Step 3: Run discovery dry-run**

Run:

```bash
node .codex/skills/debug-responsive-gui/scripts/steps/00-check-tools.mjs
node .codex/skills/debug-responsive-gui/scripts/steps/05-discover-current-state.mjs
```

Expected: tool check passes. Discovery prints JSON and writes `/tmp/codex-debug-responsive-gui/current.json`; it must not start or close browsers.

## Task 6: Implement Browser Startup Step

**Files:**
- Modify: `.codex/skills/debug-responsive-gui/scripts/steps/10-start-cft-if-needed.mjs`

- [ ] **Step 1: Implement `10-start-cft-if-needed.mjs`**

Replace the file with:

```js
#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { log } from '../lib/exec.mjs';
import { currentBrowser, openChromeForTesting } from '../lib/playwright-cli.mjs';
import { readState, updateState } from '../lib/state.mjs';

const browser = currentBrowser();
if (browser?.browserType === 'chrome-for-testing' && browser?.headed === true) {
  log('skip: existing headed chrome-for-testing browser is available');
  updateState({ browser });
  process.exit(0);
}

const state = readState();
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-cft-profile.'));
const defaultDir = path.join(profile, 'Default');
fs.mkdirSync(defaultDir, { recursive: true });
fs.writeFileSync(
  path.join(defaultDir, 'Preferences'),
  `${JSON.stringify({
    devtools: {
      preferences: {
        currentDockState: '"undocked"',
        'disable-locale-info-bar': 'true',
      },
    },
  }, null, 2)}\n`,
);

const config = path.join(os.tmpdir(), `codex-cft-devtools.${Date.now()}.json`);
fs.writeFileSync(
  config,
  `${JSON.stringify({
    browser: {
      launchOptions: {
        args: ['--auto-open-devtools-for-tabs'],
      },
    },
  })}\n`,
);

updateState({
  ...state,
  profile,
  config,
});

openChromeForTesting({ profile, config, url: 'about:blank' });
updateState({ browser: currentBrowser() });
log(`started chrome-for-testing with profile ${profile}`);
```

- [ ] **Step 2: Run syntax check**

Run:

```bash
node --check .codex/skills/debug-responsive-gui/scripts/steps/10-start-cft-if-needed.mjs
```

Expected: syntax passes.

- [ ] **Step 3: Run only when browser mutation is intended**

Run:

```bash
node .codex/skills/debug-responsive-gui/scripts/steps/10-start-cft-if-needed.mjs
```

Expected: if a headed `chrome-for-testing` is already connected, output starts with `skip`. Otherwise it starts visible CFT using a temp profile.

## Task 7: Implement GUI Navigation Step

**Files:**
- Modify: `.codex/skills/debug-responsive-gui/scripts/steps/20-open-gui-if-needed.mjs`

- [ ] **Step 1: Implement `20-open-gui-if-needed.mjs`**

Replace the file with:

```js
#!/usr/bin/env node

import { log, run } from '../lib/exec.mjs';
import { isCodexGui, metricsExpression } from '../lib/metrics.mjs';
import { evalJson, gotoUrl } from '../lib/playwright-cli.mjs';
import { readState, stripFragment, updateState } from '../lib/state.mjs';

const guiUrlArgIndex = process.argv.indexOf('--gui-url');
const guiUrlFromArg = guiUrlArgIndex >= 0 ? process.argv[guiUrlArgIndex + 1] : undefined;
const state = readState();
const guiUrl = guiUrlFromArg ?? state.guiUrl;

if (!guiUrl) {
  console.error('Missing --gui-url and state.guiUrl. Call launch_gui outside this script and pass --gui-url.');
  process.exit(1);
}

const guiUrlNoFragment = stripFragment(guiUrl);
let metrics = null;
try {
  metrics = evalJson(metricsExpression);
} catch {}

if (isCodexGui(metrics) && metrics.url === guiUrl) {
  log('skip: current page is already the requested codex-gui URL');
  updateState({ guiUrl, guiUrlNoFragment, lastMetrics: metrics });
  process.exit(0);
}

gotoUrl(guiUrl);
run('curl', ['-sI', guiUrlNoFragment], { allowFailure: false });
metrics = evalJson(metricsExpression);

if (!isCodexGui(metrics)) {
  console.error(JSON.stringify(metrics, null, 2));
  process.exit(1);
}

updateState({ guiUrl, guiUrlNoFragment, lastMetrics: metrics });
log(`opened ${guiUrl}`);
```

- [ ] **Step 2: Run syntax check**

Run:

```bash
node --check .codex/skills/debug-responsive-gui/scripts/steps/20-open-gui-if-needed.mjs
```

Expected: syntax passes.

- [ ] **Step 3: Verify missing URL fails clearly**

Run:

```bash
rm -f /tmp/codex-debug-responsive-gui/current.json
node .codex/skills/debug-responsive-gui/scripts/steps/20-open-gui-if-needed.mjs
```

Expected: exits non-zero with `Missing --gui-url`.

## Task 8: Implement Window Layout Step

**Files:**
- Modify: `.codex/skills/debug-responsive-gui/scripts/steps/30-layout-windows-if-needed.mjs`

- [ ] **Step 1: Implement `30-layout-windows-if-needed.mjs`**

Replace the file with:

```js
#!/usr/bin/env node

import { runAppleScript, runAppleScriptJson } from '../lib/applescript.mjs';
import { log, runJson } from '../lib/exec.mjs';
import { updateState } from '../lib/state.mjs';

function screenFrames() {
  return runJson('osascript', [
    '-l',
    'JavaScript',
    '-e',
    'ObjC.import("AppKit"); JSON.stringify($.NSScreen.screens.js.map((s, i) => ({i, frame: ObjC.deepUnwrap(s.frame), visible: ObjC.deepUnwrap(s.visibleFrame)})))',
  ]);
}

function targetLayout(screens) {
  const sorted = [...screens].sort((a, b) => a.visible.x - b.visible.x);
  const target = sorted[0] ?? { visible: { x: -1920, y: 0, width: 1920, height: 1080 } };
  const x = Math.trunc(target.visible.x);
  const y = Math.trunc(target.visible.y + 30);
  const width = Math.trunc(target.visible.width);
  const height = Math.trunc(target.visible.height - 30);
  const half = Math.trunc(width / 2);
  return {
    browser: { x, y, width: half, height },
    devtools: { x: x + half, y, width: width - half, height },
  };
}

function layoutOk(windows, layout) {
  const browser = windows.find((window) => window.name?.includes('Google Chrome for Testing'));
  const devtools = windows.find((window) => window.name?.startsWith('DevTools'));
  if (!browser || !devtools) {
    return false;
  }
  return browser.position[0] === layout.browser.x
    && devtools.position[0] === layout.devtools.x
    && browser.size[0] === layout.browser.width
    && devtools.size[0] === layout.devtools.width;
}

const screens = screenFrames();
const layout = targetLayout(screens);
let windows = runAppleScriptJson('query-windows.applescript');

if (layoutOk(windows, layout)) {
  log('skip: browser and DevTools windows already match target layout');
  updateState({ screens, layout, windows, discovery: { layoutOk: true } });
  process.exit(0);
}

runAppleScript('layout-windows.applescript', [
  layout.browser.x,
  layout.browser.y,
  layout.browser.width,
  layout.browser.height,
  layout.devtools.x,
  layout.devtools.y,
  layout.devtools.width,
  layout.devtools.height,
].map(String));

windows = runAppleScriptJson('query-windows.applescript');
const ok = layoutOk(windows, layout);
updateState({ screens, layout, windows, discovery: { layoutOk: ok } });

if (!ok) {
  console.error(JSON.stringify({ layout, windows }, null, 2));
  process.exit(1);
}

log('windows laid out');
```

- [ ] **Step 2: Run syntax check**

Run:

```bash
node --check .codex/skills/debug-responsive-gui/scripts/steps/30-layout-windows-if-needed.mjs
```

Expected: syntax passes.

## Task 9: Implement Responsive, Reload, and Verify Steps

**Files:**
- Modify: `.codex/skills/debug-responsive-gui/scripts/steps/40-enter-responsive-if-needed.mjs`
- Modify: `.codex/skills/debug-responsive-gui/scripts/steps/50-reload-page.mjs`
- Modify: `.codex/skills/debug-responsive-gui/scripts/steps/60-verify-responsive-metrics.mjs`

- [ ] **Step 1: Implement `40-enter-responsive-if-needed.mjs`**

Replace the file with:

```js
#!/usr/bin/env node

import { runAppleScript } from '../lib/applescript.mjs';
import { log } from '../lib/exec.mjs';
import { metricsExpression, responsiveLike, summarizeMetrics } from '../lib/metrics.mjs';
import { evalJson } from '../lib/playwright-cli.mjs';
import { updateState } from '../lib/state.mjs';

let metrics = evalJson(metricsExpression);
if (responsiveLike(metrics)) {
  log('skip: page metrics already look responsive');
  updateState({ lastMetrics: summarizeMetrics(metrics) });
  process.exit(0);
}

runAppleScript('enter-responsive.applescript');
metrics = evalJson(metricsExpression);
updateState({ lastMetrics: summarizeMetrics(metrics) });
log(JSON.stringify(summarizeMetrics(metrics), null, 2));
```

- [ ] **Step 2: Implement `50-reload-page.mjs`**

Replace the file with:

```js
#!/usr/bin/env node

import { log } from '../lib/exec.mjs';
import { reloadPage } from '../lib/playwright-cli.mjs';

reloadPage();
log('page reloaded');
```

- [ ] **Step 3: Implement `60-verify-responsive-metrics.mjs`**

Replace the file with:

```js
#!/usr/bin/env node

import { log } from '../lib/exec.mjs';
import { isCodexGui, metricsExpression, responsiveLike, summarizeMetrics } from '../lib/metrics.mjs';
import { evalJson } from '../lib/playwright-cli.mjs';
import { updateState } from '../lib/state.mjs';

const metrics = evalJson(metricsExpression);
const summary = summarizeMetrics(metrics);
updateState({ lastMetrics: summary });

if (!isCodexGui(metrics)) {
  console.error(JSON.stringify(summary, null, 2));
  process.exit(1);
}

log(JSON.stringify({
  codexGui: true,
  responsiveLike: responsiveLike(metrics),
  metrics: summary,
}, null, 2));
```

- [ ] **Step 4: Run syntax checks**

Run:

```bash
node --check .codex/skills/debug-responsive-gui/scripts/steps/40-enter-responsive-if-needed.mjs
node --check .codex/skills/debug-responsive-gui/scripts/steps/50-reload-page.mjs
node --check .codex/skills/debug-responsive-gui/scripts/steps/60-verify-responsive-metrics.mjs
```

Expected: all commands pass.

## Task 10: Implement Entry Point

**Files:**
- Modify: `.codex/skills/debug-responsive-gui/scripts/debug-responsive-gui.mjs`

- [ ] **Step 1: Implement `debug-responsive-gui.mjs`**

Replace the file with:

```js
#!/usr/bin/env node

import path from 'node:path';
import { log, run, scriptRoot } from './lib/exec.mjs';
import { resetState, stripFragment, updateState } from './lib/state.mjs';

const stepNames = [
  '00-check-tools.mjs',
  '05-discover-current-state.mjs',
  '10-start-cft-if-needed.mjs',
  '20-open-gui-if-needed.mjs',
  '30-layout-windows-if-needed.mjs',
  '40-enter-responsive-if-needed.mjs',
  '50-reload-page.mjs',
  '60-verify-responsive-metrics.mjs',
];

const args = process.argv.slice(2);
const fresh = args.includes('--fresh');
const guiUrlIndex = args.indexOf('--gui-url');
const guiUrl = guiUrlIndex >= 0 ? args[guiUrlIndex + 1] : undefined;

if (guiUrlIndex >= 0 && !guiUrl) {
  console.error('--gui-url requires a value');
  process.exit(1);
}

if (fresh) {
  resetState(guiUrl ? { guiUrl, guiUrlNoFragment: stripFragment(guiUrl) } : {});
} else if (guiUrl) {
  updateState({ guiUrl, guiUrlNoFragment: stripFragment(guiUrl) });
}

for (const stepName of stepNames) {
  const stepPath = path.join(scriptRoot, 'steps', stepName);
  const stepArgs = stepName === '20-open-gui-if-needed.mjs' && guiUrl ? ['--gui-url', guiUrl] : [];
  log(`running ${stepName}`);
  run('node', [stepPath, ...stepArgs], { stdio: 'inherit' });
}
```

- [ ] **Step 2: Run syntax check**

Run:

```bash
node --check .codex/skills/debug-responsive-gui/scripts/debug-responsive-gui.mjs
```

Expected: syntax passes.

- [ ] **Step 3: Verify missing URL is allowed until navigation step**

Run:

```bash
node .codex/skills/debug-responsive-gui/scripts/debug-responsive-gui.mjs --fresh
```

Expected: the flow reaches `20-open-gui-if-needed.mjs` and fails with `Missing --gui-url` if no URL is in state. This is acceptable because `launch_gui` must be called outside the script.

## Task 11: Full Syntax and Dry Verification

**Files:**
- Test: `.codex/skills/debug-responsive-gui/scripts/**/*.mjs`
- Test: `.codex/skills/debug-responsive-gui/scripts/applescript/*.applescript`

- [ ] **Step 1: Run all Node syntax checks**

Run:

```bash
find .codex/skills/debug-responsive-gui/scripts -name '*.mjs' -print0 | xargs -0 -n1 node --check
```

Expected: all `.mjs` files pass.

- [ ] **Step 2: Run non-mutating step checks**

Run:

```bash
node .codex/skills/debug-responsive-gui/scripts/steps/00-check-tools.mjs
node .codex/skills/debug-responsive-gui/scripts/steps/05-discover-current-state.mjs
```

Expected: tool check passes; discovery writes state and does not mutate browser state.

- [ ] **Step 3: Run AppleScript query check**

Run:

```bash
osascript .codex/skills/debug-responsive-gui/scripts/applescript/query-windows.applescript
```

Expected: command returns a JSON array.

- [ ] **Step 4: Run representative GUI flow only after `launch_gui` URL exists**

Get a GUI URL via Codex `launch_gui`, then run:

```bash
node .codex/skills/debug-responsive-gui/scripts/debug-responsive-gui.mjs --gui-url '<local-gui-url>'
```

Expected: existing qualified CFT is reused when present; otherwise visible CFT starts. The page opens to `codex-gui`, windows are arranged, responsive mode is only toggled when metrics do not already look responsive, the page reloads, and final metrics print.

## Task 12: Update Skill Text After Script Verification

**Files:**
- Modify: `.codex/skills/debug-responsive-gui/SKILL.md`

- [ ] **Step 1: Add stable script usage section**

After Task 11 passes, add a concise section to `SKILL.md`:

````markdown
## 自动化脚本入口

脚本路径：

```bash
.codex/skills/debug-responsive-gui/scripts/debug-responsive-gui.mjs
```

稳定用法：

```bash
node .codex/skills/debug-responsive-gui/scripts/debug-responsive-gui.mjs --gui-url '<launch_gui 返回的 Local URL>'
```

规则：

- 先由 Codex 外层调用 `launch_gui` 获取当前 GUI URL，再传入 `--gui-url`。
- 脚本默认先 discovery，满足目标的步骤会跳过。
- 失败后可以直接运行失败的单步脚本继续。
- 脚本不自动选择或验证具体设备型号。
- 脚本不使用 Computer Use，不使用坐标点击。
````

- [ ] **Step 2: Run final validation**

Run:

```bash
find .codex/skills/debug-responsive-gui/scripts -name '*.mjs' -print0 | xargs -0 -n1 node --check
rg -n "自动化脚本入口|debug-responsive-gui.mjs|不自动选择或验证具体设备型号" .codex/skills/debug-responsive-gui/SKILL.md
```

Expected: syntax checks pass; `rg` finds the new stable script section.

## Task 13: Commit Script Implementation

**Files:**
- Stage: `.codex/skills/debug-responsive-gui/SKILL.md`
- Stage: `.codex/skills/debug-responsive-gui/scripts/`
- Stage: `docs/superpowers/plans/2026-06-21-debug-responsive-gui-scripts.md`

- [ ] **Step 1: Review status**

Run:

```bash
git status --short -- .codex/skills/debug-responsive-gui docs/superpowers/plans/2026-06-21-debug-responsive-gui-scripts.md
```

Expected: only the intended skill files, scripts, and plan document appear.

- [ ] **Step 2: Stage intended files**

Run:

```bash
git add .codex/skills/debug-responsive-gui/SKILL.md
git add .codex/skills/debug-responsive-gui/scripts
git add docs/superpowers/plans/2026-06-21-debug-responsive-gui-scripts.md
```

Expected: no unrelated files are staged.

- [ ] **Step 3: Commit**

Run:

```bash
git commit -m "Add debug responsive GUI scripts"
```

Expected: commit succeeds and contains only the script implementation, final skill text update, and plan document.

## Self-Review Checklist

- [ ] Every design goal has a task.
- [ ] `SKILL.md` is modified only after script verification.
- [ ] No task installs dependencies.
- [ ] No task uses Computer Use or coordinate clicking.
- [ ] No task auto-selects or validates a concrete device model.
- [ ] Every browser mutation is behind a detection step.
- [ ] The plan keeps the temporary skill directory unstaged until the implementation task explicitly stages it.
