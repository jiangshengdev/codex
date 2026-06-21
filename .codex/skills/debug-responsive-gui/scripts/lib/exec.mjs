#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const scriptRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

export function log(message) {
  console.log(`[debug-responsive-gui] ${message}`);
}

export function fail(message, details = undefined) {
  console.error(`[debug-responsive-gui] ERROR: ${message}`);
  if (details !== undefined && details !== '') {
    console.error(String(details));
  }
  process.exitCode = 1;
}

export function run(command, args = [], options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    env: options.env ?? process.env,
    stdio: options.stdio ?? 'pipe',
  });

  if (result.error) {
    throw result.error;
  }

  if (options.allowFailure !== true && result.status !== 0) {
    const stderr = result.stderr?.trim();
    const stdout = result.stdout?.trim();
    throw new Error(
      `${command} ${args.join(' ')} failed with exit ${result.status}\n${stderr || stdout}`,
    );
  }

  return result;
}

export function runText(command, args = [], options = {}) {
  return run(command, args, options).stdout.trim();
}

export function runJson(command, args = [], options = {}) {
  const text = runText(command, args, options);
  if (text === '') {
    return null;
  }
  return JSON.parse(text);
}
