#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

export const stateDir = '/tmp/codex-debug-responsive-gui';
export const statePath = path.join(stateDir, 'current.json');

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function mergeState(current, patch) {
  const next = { ...current };
  for (const [key, value] of Object.entries(patch)) {
    if (isPlainObject(value) && isPlainObject(next[key])) {
      next[key] = mergeState(next[key], value);
    } else {
      next[key] = value;
    }
  }
  return next;
}

export function readState() {
  try {
    return JSON.parse(fs.readFileSync(statePath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') {
      return {};
    }
    throw error;
  }
}

export function writeState(state) {
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
}

export function updateState(patch) {
  const current = readState();
  const next = mergeState(current, {
    ...patch,
    updatedAt: new Date().toISOString(),
  });
  writeState(next);
  return next;
}

export function resetState(patch = {}) {
  const next = {
    runId: new Date().toISOString(),
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  writeState(next);
  return next;
}

export function stripFragment(url) {
  const parsed = new URL(url);
  parsed.hash = '';
  return parsed.toString();
}

export function parseLocalHttpUrl(url) {
  const parsed = new URL(url);
  const allowedHosts = new Set(['localhost', '127.0.0.1', '[::1]']);
  if (!['http:', 'https:'].includes(parsed.protocol) || !allowedHosts.has(parsed.hostname)) {
    throw new Error(`GUI URL must be a local HTTP URL: ${url}`);
  }
  return parsed;
}

export function requireFlagValue(args, flagName) {
  const index = args.indexOf(flagName);
  if (index < 0) {
    return undefined;
  }
  const value = args[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`${flagName} requires a value`);
  }
  return value;
}
