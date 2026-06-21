#!/usr/bin/env node

import { log } from '../lib/exec.mjs';
import { metricsExpression, summarizeMetrics } from '../lib/metrics.mjs';
import { evalJson, reloadPage } from '../lib/playwright-cli.mjs';
import { readState, updateState } from '../lib/state.mjs';

const state = readState();
let metrics = evalJson(metricsExpression);
const currentUrl = metrics?.url ?? null;

if (state.lastReload?.runId === state.runId && state.lastReload?.url === currentUrl) {
  log('skip: current page was already reloaded in this run');
  updateState({ lastMetrics: summarizeMetrics(metrics) });
  process.exit(0);
}

reloadPage();
metrics = evalJson(metricsExpression);
updateState({
  lastMetrics: summarizeMetrics(metrics),
  lastReload: {
    runId: state.runId ?? null,
    url: metrics?.url ?? currentUrl,
    at: new Date().toISOString(),
  },
});
log('page reloaded');
