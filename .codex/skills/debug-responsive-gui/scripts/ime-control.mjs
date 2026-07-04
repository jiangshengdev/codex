#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { evalJson } from './lib/playwright-cli.mjs';
import {
  ALLOWED_KEYS,
  COMMAND_VERSION,
  appendActionRecord,
  appendEventsAndUpdateMetadata,
  buildKeyAppleScript,
  buildDrainEventsExpression,
  buildLoggerCheckExpression,
  buildStartPageExpression,
  buildTypeAppleScript,
  createSessionFiles,
  generateSessionId,
  parseArgs,
  readSessionMetadata,
  sessionDirForId,
  writePlaceholderCapture,
} from './lib/ime-control-core.mjs';

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

function printFailure(code, message, details = undefined) {
  printJson({
    ok: false,
    errors: [
      {
        code,
        message,
        ...(details === undefined ? {} : { details }),
      },
    ],
  });
}

function requireEvalOk(result) {
  if (result?.ok) {
    return result;
  }
  const error = result?.error ?? {
    code: 'page_eval_failed',
    message: 'Page evaluation failed.',
  };
  throw new Error(`${error.code}: ${error.message}`);
}

function readSession(options) {
  const sessionDir = sessionDirForId(options.sessionId);
  const metadata = readSessionMetadata(sessionDir);
  if (metadata.sessionId !== options.sessionId) {
    throw new Error(`Session metadata mismatch for ${options.sessionId}`);
  }
  return { sessionDir, metadata };
}

function checkLogger(sessionId) {
  return requireEvalOk(evalJson(buildLoggerCheckExpression(sessionId)));
}

function drainEvents({ sessionId, sessionDir, lastEventId }) {
  const result = requireEvalOk(evalJson(buildDrainEventsExpression(sessionId, lastEventId)));
  const events = Array.isArray(result.events) ? result.events : [];
  const updatedLastEventId = appendEventsAndUpdateMetadata(sessionDir, events);
  return { events, lastEventId: updatedLastEventId, textarea: result.textarea ?? null };
}

function runAppleScript(source) {
  const result = spawnSync('osascript', ['-e', source], {
    encoding: 'utf8',
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || 'osascript failed').trim());
  }
  return {
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

async function startSession(options) {
  const sessionId = generateSessionId();
  const sessionDir = sessionDirForId(sessionId);
  const pageResult = requireEvalOk(evalJson(buildStartPageExpression({
    sessionId,
    preserve: options.preserve,
  })));
  const createdAt = new Date().toISOString();
  createSessionFiles({
    sessionId,
    sessionDir,
    createdAt,
    commandVersion: COMMAND_VERSION,
    page: pageResult.page,
    textarea: pageResult.textarea,
  });
  const drained = drainEvents({ sessionId, sessionDir, lastEventId: 0 });

  printJson({
    ok: true,
    command: 'start',
    sessionId,
    sessionDir,
    eventCount: drained.events.length,
  });
  return 0;
}

function actionRecordForOptions(options, phase, extra = {}) {
  return {
    phase,
    action: options.command,
    ...(options.command === 'type' ? { pinyin: options.pinyin } : {}),
    ...(options.command === 'key' ? { key: options.key, keyCode: options.keyCode } : {}),
    ...extra,
  };
}

async function runActionCommand(options) {
  const { sessionDir, metadata } = readSession(options);
  checkLogger(options.sessionId);
  appendActionRecord(sessionDir, actionRecordForOptions(options, 'before'));

  let actionError = null;
  try {
    if (options.command === 'type') {
      runAppleScript(buildTypeAppleScript(options.pinyin));
    } else {
      runAppleScript(buildKeyAppleScript(options.key));
    }
  } catch (error) {
    actionError = error;
  }

  appendActionRecord(sessionDir, actionRecordForOptions(options, 'after', {
    ok: actionError === null,
    ...(actionError === null ? {} : { error: errorMessage(actionError) }),
  }));

  const drained = drainEvents({
    sessionId: options.sessionId,
    sessionDir,
    lastEventId: metadata.lastEventId,
  });

  if (actionError) {
    throw actionError;
  }

  const capture = options.capture
    ? writePlaceholderCapture({
      sessionDir,
      sessionId: options.sessionId,
      action: options.command,
      textarea: drained.textarea,
    })
    : null;

  printJson({
    ok: true,
    command: options.command,
    sessionId: options.sessionId,
    sessionDir,
    eventCount: drained.events.length,
    lastEventId: drained.lastEventId,
    captured: options.capture,
    capture,
  });
  return 0;
}

async function runCaptureCommand(options) {
  const { sessionDir, metadata } = readSession(options);
  checkLogger(options.sessionId);
  const drained = drainEvents({
    sessionId: options.sessionId,
    sessionDir,
    lastEventId: metadata.lastEventId,
  });
  const capture = writePlaceholderCapture({
    sessionDir,
    sessionId: options.sessionId,
    action: 'capture',
    textarea: drained.textarea,
  });

  printJson({
    ok: true,
    command: options.command,
    sessionId: options.sessionId,
    sessionDir,
    eventCount: drained.events.length,
    lastEventId: drained.lastEventId,
    captured: true,
    capture,
  });
  return 0;
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

  try {
    if (options.command === 'start') {
      return await startSession(options);
    }

    if (options.command === 'capture') {
      return await runCaptureCommand(options);
    }

    return await runActionCommand(options);
  } catch (error) {
    printFailure('ime_control_failed', errorMessage(error));
    return 1;
  }
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
