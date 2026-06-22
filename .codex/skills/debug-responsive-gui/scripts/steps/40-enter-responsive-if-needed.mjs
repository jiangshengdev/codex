#!/usr/bin/env node

import { runAppleScript, runAppleScriptJson } from '../lib/applescript.mjs';
import { log } from '../lib/exec.mjs';
import { metricsExpression, responsiveLike, summarizeMetrics } from '../lib/metrics.mjs';
import { evalJson } from '../lib/playwright-cli.mjs';
import { updateState } from '../lib/state.mjs';

let metrics = evalJson(metricsExpression);
if (responsiveLike(metrics)) {
  log('skip: page metrics already look responsive');
  updateState({ lastMetrics: summarizeMetrics(metrics), discovery: { responsiveLike: true } });
  process.exit(0);
}

const windows = runAppleScriptJson('query-windows.applescript') ?? [];
const hasDevToolsWindow = windows.some((window) => window.name?.startsWith('DevTools'));
if (!hasDevToolsWindow) {
  updateState({ windows, discovery: { hasDevToolsWindow: false } });
  console.error(JSON.stringify({
    error: 'DevTools window not found; cannot send Command+Shift+M',
    windows,
  }, null, 2));
  process.exit(1);
}

runAppleScript('enter-responsive.applescript');
metrics = evalJson(metricsExpression);
const summary = summarizeMetrics(metrics);
updateState({ lastMetrics: summary, discovery: { responsiveLike: responsiveLike(metrics) } });
if (!responsiveLike(metrics)) {
  console.error(JSON.stringify({
    error: 'page metrics still do not look responsive after Command+Shift+M',
    metrics: summary,
  }, null, 2));
  process.exit(1);
}
log(JSON.stringify(summary, null, 2));
