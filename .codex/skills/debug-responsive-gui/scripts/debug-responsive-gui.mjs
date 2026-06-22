#!/usr/bin/env node

import path from 'node:path';
import { log, run, scriptRoot } from './lib/exec.mjs';
import { parseLocalHttpUrl, requireFlagValue, resetState, stripFragment, updateState } from './lib/state.mjs';

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
let guiUrl;

try {
  guiUrl = requireFlagValue(args, '--gui-url');
  if (guiUrl) {
    parseLocalHttpUrl(guiUrl);
  }
} catch (error) {
  console.error(error.message);
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
  const result = run('node', [stepPath, ...stepArgs], { allowFailure: true, stdio: 'inherit' });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
