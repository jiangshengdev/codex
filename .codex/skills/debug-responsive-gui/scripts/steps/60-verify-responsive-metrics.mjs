#!/usr/bin/env node

import { log } from '../lib/exec.mjs';
import { isCodexGui, metricsExpression, responsiveLike, summarizeMetrics } from '../lib/metrics.mjs';
import { evalJson } from '../lib/playwright-cli.mjs';
import { updateState } from '../lib/state.mjs';

const metrics = evalJson(metricsExpression);
const summary = summarizeMetrics(metrics);
updateState({ lastMetrics: summary, discovery: { responsiveLike: responsiveLike(metrics) } });

if (!isCodexGui(metrics)) {
  console.error(JSON.stringify(summary, null, 2));
  process.exit(1);
}

log(JSON.stringify({
  codexGui: true,
  responsiveLike: responsiveLike(metrics),
  metrics: summary,
}, null, 2));
