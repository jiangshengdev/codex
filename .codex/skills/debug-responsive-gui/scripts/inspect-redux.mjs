#!/usr/bin/env node

import { fileURLToPath } from 'node:url';

import { buildPageExpression, parseArgs } from './lib/inspect-redux-page.mjs';
import { currentBrowser, evalJson } from './lib/playwright-cli.mjs';

export { buildPageExpression, parseArgs };

const MAX_ERROR_MESSAGE_LENGTH = 2000;

function printFailure(code, message) {
  console.log(JSON.stringify({
    ok: false,
    errors: [{ code, message }],
  }, null, 2));
}

function boundedErrorMessage(message) {
  if (message.length <= MAX_ERROR_MESSAGE_LENGTH) {
    return message;
  }
  return `${message.slice(0, MAX_ERROR_MESSAGE_LENGTH - 3)}...`;
}

function errorMessage(error) {
  const message = error instanceof Error ? error.message : String(error);
  return boundedErrorMessage(message);
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    printFailure('invalid_argument', errorMessage(error));
    process.exit(1);
  }

  if (!currentBrowser()) {
    printFailure('browser_not_open', 'No Playwright-controlled browser is open');
    process.exit(1);
  }

  const result = evalJson(buildPageExpression(options));
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) {
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    printFailure('inspect_redux_failed', errorMessage(error));
    process.exit(1);
  });
}
