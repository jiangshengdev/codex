#!/usr/bin/env node

import { fileURLToPath } from 'node:url';

import { ALLOWED_KEYS, parseArgs } from './lib/ime-control-core.mjs';

const usage = [
  'node .codex/skills/debug-responsive-gui/scripts/ime-control.mjs start [--preserve]',
  'node .codex/skills/debug-responsive-gui/scripts/ime-control.mjs type <pinyin> --session <session-id> [--no-capture]',
  'node .codex/skills/debug-responsive-gui/scripts/ime-control.mjs key <name> --session <session-id> [--no-capture]',
  'node .codex/skills/debug-responsive-gui/scripts/ime-control.mjs capture --session <session-id>',
];

function printJson(value) {
  console.log(JSON.stringify(value, null, 2));
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function printHelp() {
  printJson({
    ok: true,
    command: 'help',
    usage,
    commands: ['start', 'type', 'key', 'capture'],
    allowedKeys: ALLOWED_KEYS,
  });
}

function printInvalidArgument(error) {
  printJson({
    ok: false,
    errors: [
      {
        code: 'invalid_argument',
        message: errorMessage(error),
      },
    ],
  });
}

function printNotImplemented(options) {
  printJson({
    ok: false,
    command: options.command,
    parsed: options,
    errors: [
      {
        code: 'not_implemented',
        message: `${options.command} is not implemented in Task 1`,
      },
    ],
  });
}

export async function main(argv = process.argv.slice(2)) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    printInvalidArgument(error);
    return 1;
  }

  if (options.command === 'help') {
    printHelp();
    return 0;
  }

  printNotImplemented(options);
  return 2;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().then((exitCode) => {
    process.exit(exitCode);
  }, (error) => {
    printJson({
      ok: false,
      errors: [
        {
          code: 'ime_control_failed',
          message: errorMessage(error),
        },
      ],
    });
    process.exit(1);
  });
}
