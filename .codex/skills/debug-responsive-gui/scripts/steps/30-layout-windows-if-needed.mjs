#!/usr/bin/env node

import { runAppleScript, runAppleScriptJson } from '../lib/applescript.mjs';
import { log, runJson } from '../lib/exec.mjs';
import { updateState } from '../lib/state.mjs';
import { targetLayout } from '../lib/window-layout.mjs';

function screenFrames() {
  try {
    return runJson('osascript', [
      '-l',
      'JavaScript',
      '-e',
      'ObjC.import("AppKit"); JSON.stringify($.NSScreen.screens.js.map((s, i) => ({i, frame: ObjC.deepUnwrap(s.frame), visible: ObjC.deepUnwrap(s.visibleFrame)})))',
    ]);
  } catch {
    return [];
  }
}

function codexWindowPosition() {
  try {
    return runJson('osascript', [
      '-l',
      'JavaScript',
      '-e',
      String.raw`(() => { const se = Application("System Events"); const names = ["Codex", "Codex Desktop"]; for (const name of names) { const proc = se.processes.byName(name); if (proc.exists() && proc.windows.length > 0) { const w = proc.windows[0]; const p = w.position(); return JSON.stringify({process: name, x: p[0], y: p[1]}); } } return JSON.stringify(null); })();`,
    ]);
  } catch {
    return null;
  }
}

function closeEnough(actual, expected) {
  return Math.abs(actual - expected) <= 16;
}

function layoutOk(windows, layout) {
  const browser = windows.find((window) => window.name?.includes('Google Chrome for Testing'));
  const devtools = windows.find((window) => window.name?.startsWith('DevTools'));
  if (!browser || !devtools) {
    return false;
  }
  return browser.fullscreen === false
    && devtools.fullscreen === false
    && closeEnough(browser.position[0], layout.browser.x)
    && closeEnough(browser.position[1], layout.browser.y)
    && closeEnough(devtools.position[0], layout.devtools.x)
    && closeEnough(devtools.position[1], layout.devtools.y)
    && closeEnough(browser.size[0], layout.browser.width)
    && closeEnough(browser.size[1], layout.browser.height)
    && closeEnough(devtools.size[0], layout.devtools.width)
    && closeEnough(devtools.size[1], layout.devtools.height);
}

const screens = screenFrames();
const codexPosition = codexWindowPosition();
const layout = targetLayout(screens, codexPosition);
let windows = runAppleScriptJson('query-windows.applescript') ?? [];
const hasBrowserWindow = windows.some((window) => window.name?.includes('Google Chrome for Testing'));
const hasDevToolsWindow = windows.some((window) => window.name?.startsWith('DevTools'));

if (!hasBrowserWindow || !hasDevToolsWindow) {
  updateState({
    screens,
    codexPosition,
    layout,
    windows,
    discovery: { hasBrowserWindow, hasDevToolsWindow, layoutOk: false },
  });
  console.error(JSON.stringify({
    error: 'Google Chrome for Testing browser and DevTools windows must be visible before layout',
    hasBrowserWindow,
    hasDevToolsWindow,
    windows,
  }, null, 2));
  process.exit(1);
}

if (layoutOk(windows, layout)) {
  log('skip: browser and DevTools windows already match target layout');
  updateState({ screens, codexPosition, layout, windows, discovery: { layoutOk: true } });
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

windows = runAppleScriptJson('query-windows.applescript') ?? [];
let ok = layoutOk(windows, layout);
if (!ok) {
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
  windows = runAppleScriptJson('query-windows.applescript') ?? [];
  ok = layoutOk(windows, layout);
}
updateState({ screens, codexPosition, layout, windows, discovery: { layoutOk: ok } });

if (!ok) {
  console.error(JSON.stringify({ layout, windows }, null, 2));
  process.exit(1);
}

log('windows laid out');
