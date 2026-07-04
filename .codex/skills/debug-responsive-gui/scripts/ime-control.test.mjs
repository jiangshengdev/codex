import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  assignCandidateIndexes,
  appendActionRecord,
  appendEventsAndUpdateMetadata,
  buildKeyAppleScript,
  buildDrainEventsExpression,
  buildLoggerCheckExpression,
  buildStartPageExpression,
  buildTypeAppleScript,
  createSessionFiles,
  generateSessionId,
  inferCandidateMode,
  isVisibleCandidate,
  keyCodeForKey,
  nextCapturePaths,
  normalizeKeyName,
  parseArgs,
  sessionDirForId,
  sortCandidatesForIndex,
  validatePinyin,
  writePlaceholderCapture,
} from './lib/ime-control-core.mjs';

const allowedKeys = [
  ['arrow-up', 126],
  ['arrow-down', 125],
  ['arrow-left', 123],
  ['arrow-right', 124],
  ['digit-1', 18],
  ['digit-2', 19],
  ['digit-3', 20],
  ['digit-4', 21],
  ['digit-5', 23],
  ['digit-6', 22],
  ['digit-7', 26],
  ['digit-8', 28],
  ['digit-9', 25],
  ['space', 49],
  ['enter', 36],
  ['escape', 53],
];

test('parseArgs accepts valid first-version commands', () => {
  assert.deepEqual(parseArgs(['start']), { command: 'start', preserve: false, capture: true });
  assert.deepEqual(parseArgs(['start', '--preserve']), { command: 'start', preserve: true, capture: true });
  assert.deepEqual(parseArgs(['type', 'nihao', '--session', 'session-1']), {
    command: 'type',
    pinyin: 'nihao',
    sessionId: 'session-1',
    capture: true,
  });
  assert.deepEqual(parseArgs(['key', 'arrow-down', '--session', 'session-1']), {
    command: 'key',
    key: 'arrow-down',
    keyCode: 125,
    sessionId: 'session-1',
    capture: true,
  });
  assert.deepEqual(parseArgs(['capture', '--session', 'session-1']), {
    command: 'capture',
    sessionId: 'session-1',
    capture: true,
  });
});

test('parseArgs rejects invalid commands and missing required values', () => {
  assert.throws(() => parseArgs([]), /command is required/);
  assert.throws(() => parseArgs(['unknown']), /unknown command/);
  assert.throws(() => parseArgs(['start', '--session', 'session-1']), /does not accept --session/);
  assert.throws(() => parseArgs(['type', '--session', 'session-1']), /requires pinyin/);
  assert.throws(() => parseArgs(['type', 'nihao']), /requires --session/);
  assert.throws(() => parseArgs(['key', 'arrow-down']), /requires --session/);
  assert.throws(() => parseArgs(['capture']), /requires --session/);
  assert.throws(() => parseArgs(['type', 'nihao', '--session']), /requires a value/);
  assert.throws(() => parseArgs(['capture', '--unexpected']), /unknown option/);
});

test('parseArgs parses --no-capture for action commands only', () => {
  assert.deepEqual(parseArgs(['type', 'nihao', '--session', 'session-1', '--no-capture']), {
    command: 'type',
    pinyin: 'nihao',
    sessionId: 'session-1',
    capture: false,
  });
  assert.deepEqual(parseArgs(['key', 'enter', '--session', 'session-1', '--no-capture']), {
    command: 'key',
    key: 'enter',
    keyCode: 36,
    sessionId: 'session-1',
    capture: false,
  });
  assert.throws(() => parseArgs(['start', '--no-capture']), /only valid for action commands/);
});

test('validatePinyin accepts lowercase ASCII letters only', () => {
  assert.equal(validatePinyin('nihao'), 'nihao');
  assert.throws(() => validatePinyin(''), /lowercase ASCII letters/);
  assert.throws(() => validatePinyin('NiHao'), /lowercase ASCII letters/);
  assert.throws(() => validatePinyin('ni3hao'), /lowercase ASCII letters/);
  assert.throws(() => validatePinyin('ni hao'), /lowercase ASCII letters/);
});

test('key helpers normalize and map all first-version keys', () => {
  assert.equal(normalizeKeyName(' Arrow-Down '), 'arrow-down');
  for (const [key, keyCode] of allowedKeys) {
    assert.equal(keyCodeForKey(key), keyCode);
  }
  assert.throws(() => normalizeKeyName('tab'), /allowed keys: arrow-up/);
  assert.throws(() => keyCodeForKey('digit-0'), /allowed keys: arrow-up/);
});

test('AppleScript helpers activate Chrome for Testing and emit key codes only', () => {
  const typeScript = buildTypeAppleScript('abc', { delaySeconds: 0.02 });
  assert.match(typeScript, /tell application "Google Chrome for Testing" to activate/);
  assert.match(typeScript, /key code 0/);
  assert.match(typeScript, /key code 11/);
  assert.match(typeScript, /key code 8/);
  assert.doesNotMatch(typeScript, /key code 49/);
  assert.doesNotMatch(typeScript, /key code 36/);

  const keyScript = buildKeyAppleScript('arrow-down', { delaySeconds: 0.01 });
  assert.match(keyScript, /tell application "Google Chrome for Testing" to activate/);
  assert.match(keyScript, /key code 125/);
});

test('session paths are shaped under the IME temp root', () => {
  assert.equal(sessionDirForId('abc-123'), '/tmp/codex-ime-control/abc-123');
  assert.throws(() => sessionDirForId('../abc'), /filesystem-safe/);
  assert.throws(() => sessionDirForId(''), /filesystem-safe/);

  assert.deepEqual(nextCapturePaths('/tmp/codex-ime-control/abc-123'), {
    index: 1,
    jsonPath: '/tmp/codex-ime-control/abc-123/captures/0001-candidate.json',
    pngPath: '/tmp/codex-ime-control/abc-123/captures/0001-candidate.png',
  });
  assert.deepEqual(nextCapturePaths('/tmp/codex-ime-control/abc-123', ['0001-candidate.json']), {
    index: 2,
    jsonPath: '/tmp/codex-ime-control/abc-123/captures/0002-candidate.json',
    pngPath: '/tmp/codex-ime-control/abc-123/captures/0002-candidate.png',
  });
});

test('generateSessionId returns filesystem-safe unique ids', () => {
  const first = generateSessionId();
  const second = generateSessionId();

  assert.notEqual(first, second);
  assert.match(first, /^[A-Za-z0-9._-]+$/);
  assert.equal(sessionDirForId(first), `/tmp/codex-ime-control/${first}`);
});

test('createSessionFiles creates metadata and empty jsonl files', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ime-control-test-'));
  const sessionId = 'session-create-test';
  const sessionDir = path.join(root, sessionId);

  const result = createSessionFiles({
    sessionId,
    sessionDir,
    createdAt: '2026-07-04T00:00:00.000Z',
    commandVersion: 'test-version',
    page: { url: 'http://localhost:3000' },
    textarea: { value: '', focused: true, selectionStart: 0, selectionEnd: 0 },
  });

  assert.deepEqual(result, {
    sessionId,
    sessionDir,
    capturesDir: path.join(sessionDir, 'captures'),
  });
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(sessionDir, 'metadata.json'), 'utf8')), {
    sessionId,
    createdAt: '2026-07-04T00:00:00.000Z',
    commandVersion: 'test-version',
    page: { url: 'http://localhost:3000' },
    textarea: { value: '', focused: true, selectionStart: 0, selectionEnd: 0 },
    lastEventId: 0,
  });
  assert.equal(fs.readFileSync(path.join(sessionDir, 'events.jsonl'), 'utf8'), '');
  assert.equal(fs.readFileSync(path.join(sessionDir, 'actions.jsonl'), 'utf8'), '');
  assert.equal(fs.statSync(path.join(sessionDir, 'captures')).isDirectory(), true);
});

test('appendEventsAndUpdateMetadata appends jsonl and advances last event id', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ime-control-test-'));
  const sessionDir = path.join(root, 'session-events-test');
  createSessionFiles({
    sessionId: 'session-events-test',
    sessionDir,
    createdAt: '2026-07-04T00:00:00.000Z',
    commandVersion: 'test-version',
    page: {},
    textarea: {},
  });

  assert.equal(appendEventsAndUpdateMetadata(sessionDir, [
    { id: 1, type: 'input' },
    { id: 3, type: 'compositionend' },
  ]), 3);
  assert.equal(appendEventsAndUpdateMetadata(sessionDir, []), 3);
  assert.equal(
    fs.readFileSync(path.join(sessionDir, 'events.jsonl'), 'utf8'),
    '{"id":1,"type":"input"}\n{"id":3,"type":"compositionend"}\n',
  );
  assert.equal(JSON.parse(fs.readFileSync(path.join(sessionDir, 'metadata.json'), 'utf8')).lastEventId, 3);
});

test('appendActionRecord appends stable before and after action jsonl records', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ime-control-test-'));
  const sessionDir = path.join(root, 'session-actions-test');
  createSessionFiles({
    sessionId: 'session-actions-test',
    sessionDir,
    createdAt: '2026-07-04T00:00:00.000Z',
    commandVersion: 'test-version',
    page: {},
    textarea: {},
  });

  appendActionRecord(sessionDir, {
    phase: 'before',
    action: 'type',
    pinyin: 'nihao',
    at: 10,
  });
  appendActionRecord(sessionDir, {
    phase: 'after',
    action: 'key',
    key: 'enter',
    keyCode: 36,
    at: 11,
  });

  assert.deepEqual(
    fs.readFileSync(path.join(sessionDir, 'actions.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line)),
    [
      { type: 'ime-control-action', phase: 'before', action: 'type', pinyin: 'nihao', at: 10 },
      { type: 'ime-control-action', phase: 'after', action: 'key', key: 'enter', keyCode: 36, at: 11 },
    ],
  );
});

test('writePlaceholderCapture records a stable not implemented capture artifact', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ime-control-test-'));
  const sessionDir = path.join(root, 'session-capture-test');
  createSessionFiles({
    sessionId: 'session-capture-test',
    sessionDir,
    createdAt: '2026-07-04T00:00:00.000Z',
    commandVersion: 'test-version',
    page: {},
    textarea: {},
  });

  const capture = writePlaceholderCapture({
    sessionDir,
    sessionId: 'session-capture-test',
    action: 'key',
    textarea: { value: 'nihao', focused: true },
    at: 123,
  });

  assert.equal(capture.present, false);
  assert.equal(capture.status, 'not_implemented');
  assert.equal(capture.screenshot, null);
  assert.equal(capture.textarea.value, 'nihao');
  assert.equal(fs.existsSync(path.join(sessionDir, 'latest-candidate.json')), true);
  assert.deepEqual(
    JSON.parse(fs.readFileSync(path.join(sessionDir, 'captures', '0001-candidate.json'), 'utf8')),
    capture,
  );
});

test('logger expressions contain the event contract and session marker', () => {
  const startExpression = buildStartPageExpression({ sessionId: 'session-marker', preserve: false });
  assert.match(startExpression, /__codexImeControl/);
  assert.match(startExpression, /session-marker/);
  assert.match(startExpression, /textarea\[placeholder="Message Codex"\]/);
  for (const eventName of [
    'compositionstart',
    'compositionupdate',
    'compositionend',
    'keydown',
    'keyup',
    'beforeinput',
    'input',
    'change',
  ]) {
    assert.match(startExpression, new RegExp(eventName));
  }
  assert.match(startExpression, /HTMLTextAreaElement\.prototype/);
  assert.match(startExpression, /dispatchEvent\(new InputEvent\('input'/);

  const preserveExpression = buildStartPageExpression({ sessionId: 'session-marker', preserve: true });
  assert.doesNotMatch(preserveExpression, /dispatchEvent\(new InputEvent\('input'/);

  assert.match(buildLoggerCheckExpression('session-marker'), /session-marker/);
  assert.match(buildLoggerCheckExpression('session-marker'), /session_mismatch/);
  assert.match(buildDrainEventsExpression('session-marker', 7), /drainEvents\(7\)/);
});

test('candidate helpers filter visible candidates and sort by row-major frame order', () => {
  const candidates = [
    { text: '三', frame: { x: 50, y: 20, width: 10, height: 10 } },
    { text: '', frame: { x: 10, y: 10, width: 10, height: 10 } },
    { text: '一', frame: { x: 10, y: 10, width: 10, height: 10 } },
    { text: '二', frame: { x: 30, y: 10, width: 10, height: 10 } },
    { text: 'hidden', frame: { x: 40, y: 10, width: 0, height: 10 } },
  ];

  assert.equal(isVisibleCandidate(candidates[0]), true);
  assert.equal(isVisibleCandidate(candidates[1]), false);
  assert.equal(isVisibleCandidate(candidates[4]), false);
  assert.deepEqual(sortCandidatesForIndex(candidates).map((candidate) => candidate.text), ['一', '二', '三']);
  assert.deepEqual(assignCandidateIndexes(candidates), [
    { index: 1, text: '一', visible: true, frame: { x: 10, y: 10, width: 10, height: 10 } },
    { index: 2, text: '二', visible: true, frame: { x: 30, y: 10, width: 10, height: 10 } },
    { index: 3, text: '三', visible: true, frame: { x: 50, y: 20, width: 10, height: 10 } },
  ]);
});

test('inferCandidateMode distinguishes no candidates, compact row, and expanded rows', () => {
  assert.equal(inferCandidateMode(null, []), 'none');
  assert.equal(inferCandidateMode({ width: 100, height: 30 }, [
    { text: '一', frame: { x: 10, y: 10, width: 10, height: 10 } },
    { text: '二', frame: { x: 30, y: 10, width: 10, height: 10 } },
  ]), 'compact');
  assert.equal(inferCandidateMode({ width: 100, height: 80 }, [
    { text: '一', frame: { x: 10, y: 10, width: 10, height: 10 } },
    { text: '二', frame: { x: 10, y: 30, width: 10, height: 10 } },
  ]), 'expanded');
});
