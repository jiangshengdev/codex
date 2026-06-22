#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runAppleScript, runAppleScriptJson } from '../lib/applescript.mjs';
import { log } from '../lib/exec.mjs';
import { closeBrowserAllowFailure, currentBrowser, openChromeForTesting } from '../lib/playwright-cli.mjs';
import { readState, updateState } from '../lib/state.mjs';

const browser = currentBrowser();
const windows = runAppleScriptJson('query-windows.applescript') ?? [];
const hasDevToolsWindow = windows.some((window) => window.name?.startsWith('DevTools'));
if (browser?.browserType === 'chrome-for-testing' && browser?.headed === true) {
  if (hasDevToolsWindow) {
    log('skip: existing headed chrome-for-testing browser with DevTools is available');
    updateState({ browser, windows, discovery: { hasDevToolsWindow: true } });
    process.exit(0);
  }
  log('existing headed chrome-for-testing lacks DevTools; restarting with DevTools auto-open');
  closeBrowserAllowFailure();
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
  }, null, 2)}\n`,
);

updateState({
  ...state,
  profile,
  config,
});

openChromeForTesting({ profile, config, url: 'about:blank' });
try {
  runAppleScript('close-restore-dialog.applescript');
} catch {}
const nextBrowser = currentBrowser();
const nextWindows = runAppleScriptJson('query-windows.applescript') ?? [];
const nextHasDevToolsWindow = nextWindows.some((window) => window.name?.startsWith('DevTools'));
const startedOk = nextBrowser?.browserType === 'chrome-for-testing' && nextBrowser?.headed === true;
updateState({
  browser: nextBrowser,
  windows: nextWindows,
  discovery: {
    isChromeForTesting: nextBrowser?.browserType === 'chrome-for-testing',
    isHeaded: nextBrowser?.headed === true,
    hasDevToolsWindow: nextHasDevToolsWindow,
  },
});
if (!startedOk || !nextHasDevToolsWindow) {
  console.error(JSON.stringify({
    error: 'started browser did not verify as headed chrome-for-testing with DevTools window',
    browser: nextBrowser,
    hasDevToolsWindow: nextHasDevToolsWindow,
    windows: nextWindows,
  }, null, 2));
  process.exit(1);
}
log(`started chrome-for-testing with profile ${profile}`);
