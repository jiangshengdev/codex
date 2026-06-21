#!/usr/bin/env node

import path from 'node:path';
import { runText, scriptRoot } from './exec.mjs';

export function appleScriptPath(name) {
  return path.join(scriptRoot, 'applescript', name);
}

export function runAppleScript(name, args = []) {
  return runText('osascript', [appleScriptPath(name), ...args]);
}

export function runAppleScriptJson(name, args = []) {
  const text = runAppleScript(name, args);
  return text === '' ? null : JSON.parse(text);
}
