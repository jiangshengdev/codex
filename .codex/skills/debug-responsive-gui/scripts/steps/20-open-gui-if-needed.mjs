#!/usr/bin/env node

import { log } from '../lib/exec.mjs';
import { isCodexGui, metricsExpression, summarizeMetrics } from '../lib/metrics.mjs';
import { evalJson, gotoUrl } from '../lib/playwright-cli.mjs';
import { parseGuiHttpUrl, readState, requireFlagValue, stripFragment, updateState } from '../lib/state.mjs';

async function verifyHttpReachable(url) {
  let response;
  try {
    response = await fetch(url, { method: 'HEAD' });
    if (response.status === 405) {
      response = await fetch(url, { method: 'GET' });
    }
  } catch (error) {
    throw new Error(`Failed to reach ${url}: ${error.message}`);
  }
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`Unexpected HTTP status for ${url}: ${response.status}`);
  }
}

function failStep(message, patch = {}) {
  updateState({
    ...patch,
    navigation: {
      ok: false,
      error: message,
    },
  });
  console.error(message);
  process.exit(1);
}

let guiUrlFromArg;
try {
  guiUrlFromArg = requireFlagValue(process.argv.slice(2), '--gui-url');
} catch (error) {
  failStep(error.message);
}
const state = readState();
const guiUrl = guiUrlFromArg ?? state.guiUrl;

if (!guiUrl) {
  failStep('Missing --gui-url and state.guiUrl. Call launch_gui outside this script and pass --gui-url.');
}

try {
  parseGuiHttpUrl(guiUrl);
} catch (error) {
  failStep(error.message, { guiUrl });
}
const guiUrlNoFragment = stripFragment(guiUrl);
let metrics = null;
try {
  metrics = evalJson(metricsExpression);
} catch {}

if (isCodexGui(metrics) && stripFragment(metrics.url) === guiUrlNoFragment) {
  log('skip: current page is already the requested codex-gui URL');
  updateState({ guiUrl, guiUrlNoFragment, lastMetrics: summarizeMetrics(metrics), navigation: { ok: true } });
  process.exit(0);
}

try {
  await verifyHttpReachable(guiUrlNoFragment);
} catch (error) {
  failStep(error.message, { guiUrl, guiUrlNoFragment });
}
gotoUrl(guiUrl);
metrics = evalJson(metricsExpression);

if (!isCodexGui(metrics)) {
  updateState({
    guiUrl,
    guiUrlNoFragment,
    lastMetrics: summarizeMetrics(metrics),
    navigation: {
      ok: false,
      error: 'opened page is not codex-gui',
    },
  });
  console.error(JSON.stringify(summarizeMetrics(metrics), null, 2));
  process.exit(1);
}

updateState({ guiUrl, guiUrlNoFragment, lastMetrics: summarizeMetrics(metrics), navigation: { ok: true } });
log(`opened ${guiUrl}`);
