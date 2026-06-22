#!/usr/bin/env node

import { log, run } from '../lib/exec.mjs';
import { updateState } from '../lib/state.mjs';

const checks = [
  { tool: 'node', args: ['--version'] },
  { tool: 'playwright-cli', args: ['--version'] },
  { tool: 'osascript', args: ['-e', 'return "available"'] },
];

const missing = [];

for (const check of checks) {
  const result = run('/usr/bin/env', [check.tool, ...check.args], { allowFailure: true });
  if (result.status !== 0) {
    missing.push(check.tool);
  } else {
    log(`${check.tool}: ${result.stdout.trim() || 'available'}`);
  }
}

if (missing.length > 0) {
  updateState({ toolCheck: { ok: false, missing } });
  console.error(`Missing required tools: ${missing.join(', ')}`);
  process.exit(1);
}

updateState({ toolCheck: { ok: true, missing: [] } });
