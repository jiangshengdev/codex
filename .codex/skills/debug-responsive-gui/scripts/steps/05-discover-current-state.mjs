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
const windows = runAppleScriptJson('query-windows.applescript') ?? [];
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
