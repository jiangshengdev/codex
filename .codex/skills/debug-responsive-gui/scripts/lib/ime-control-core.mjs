import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const SESSION_ROOT = '/tmp/codex-ime-control';
export const COMMAND_VERSION = 'ime-control-task-2';

const KEY_CODES = new Map([
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
]);

export const ALLOWED_KEYS = [...KEY_CODES.keys()];

function allowedKeysMessage() {
  return `allowed keys: ${ALLOWED_KEYS.join(', ')}`;
}

function requireValue(args, index, flag) {
  const value = args[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

function parseOptions(args, startIndex) {
  const options = {
    preserve: false,
    capture: true,
    sessionId: null,
  };
  let index = startIndex;
  while (index < args.length) {
    const arg = args[index];
    if (arg === '--preserve') {
      options.preserve = true;
      index += 1;
    } else if (arg === '--no-capture') {
      options.capture = false;
      index += 1;
    } else if (arg === '--session') {
      options.sessionId = requireValue(args, index, '--session');
      index += 2;
    } else {
      throw new Error(`unknown option: ${arg}`);
    }
  }
  return options;
}

function requireSession(command, sessionId) {
  if (!sessionId) {
    throw new Error(`${command} requires --session <id>`);
  }
  return sessionId;
}

export function parseArgs(argv) {
  if (argv.includes('--help') || argv.includes('-h')) {
    return { command: 'help' };
  }

  const [command] = argv;
  if (!command) {
    throw new Error('command is required');
  }

  if (command === 'start') {
    const options = parseOptions(argv, 1);
    if (options.sessionId) {
      throw new Error('start does not accept --session');
    }
    if (!options.capture) {
      throw new Error('--no-capture is only valid for action commands');
    }
    return { command, preserve: options.preserve, capture: true };
  }

  if (command === 'type') {
    const pinyin = argv[1];
    if (!pinyin || pinyin.startsWith('--')) {
      throw new Error('type requires pinyin');
    }
    const options = parseOptions(argv, 2);
    if (options.preserve) {
      throw new Error('type does not accept --preserve');
    }
    return {
      command,
      pinyin: validatePinyin(pinyin),
      sessionId: requireSession(command, options.sessionId),
      capture: options.capture,
    };
  }

  if (command === 'key') {
    const key = argv[1];
    if (!key || key.startsWith('--')) {
      throw new Error('key requires a key name');
    }
    const options = parseOptions(argv, 2);
    if (options.preserve) {
      throw new Error('key does not accept --preserve');
    }
    const normalizedKey = normalizeKeyName(key);
    return {
      command,
      key: normalizedKey,
      keyCode: keyCodeForKey(normalizedKey),
      sessionId: requireSession(command, options.sessionId),
      capture: options.capture,
    };
  }

  if (command === 'capture') {
    const options = parseOptions(argv, 1);
    if (options.preserve) {
      throw new Error('capture does not accept --preserve');
    }
    if (!options.capture) {
      throw new Error('--no-capture is only valid for action commands');
    }
    return {
      command,
      sessionId: requireSession(command, options.sessionId),
      capture: true,
    };
  }

  throw new Error(`unknown command: ${command}`);
}

export function validatePinyin(text) {
  if (!/^[a-z]+$/.test(text)) {
    throw new Error('pinyin must contain lowercase ASCII letters only');
  }
  return text;
}

export function normalizeKeyName(key) {
  const normalized = key.trim().toLowerCase();
  if (!KEY_CODES.has(normalized)) {
    throw new Error(`unknown key: ${key}; ${allowedKeysMessage()}`);
  }
  return normalized;
}

export function keyCodeForKey(key) {
  const normalized = normalizeKeyName(key);
  return KEY_CODES.get(normalized);
}

export function sessionDirForId(sessionId) {
  if (!/^[A-Za-z0-9._-]+$/.test(sessionId) || sessionId === '.' || sessionId === '..') {
    throw new Error('session id must be filesystem-safe');
  }
  return path.join(SESSION_ROOT, sessionId);
}

export function generateSessionId(now = new Date()) {
  const timestamp = now.toISOString().replace(/[^0-9A-Za-z]/g, '').slice(0, 17);
  return `${timestamp}-${crypto.randomBytes(6).toString('hex')}`;
}

export function createSessionFiles({
  sessionId,
  sessionDir,
  createdAt,
  commandVersion,
  page,
  textarea,
}) {
  const capturesDir = path.join(sessionDir, 'captures');
  fs.mkdirSync(capturesDir, { recursive: true });
  const metadata = {
    sessionId,
    createdAt,
    commandVersion,
    page,
    textarea,
    lastEventId: 0,
  };
  fs.writeFileSync(path.join(sessionDir, 'metadata.json'), `${JSON.stringify(metadata, null, 2)}\n`, { flag: 'wx' });
  fs.writeFileSync(path.join(sessionDir, 'events.jsonl'), '', { flag: 'wx' });
  fs.writeFileSync(path.join(sessionDir, 'actions.jsonl'), '', { flag: 'wx' });
  return { sessionId, sessionDir, capturesDir };
}

export function readSessionMetadata(sessionDir) {
  return JSON.parse(fs.readFileSync(path.join(sessionDir, 'metadata.json'), 'utf8'));
}

function writeSessionMetadata(sessionDir, metadata) {
  fs.writeFileSync(path.join(sessionDir, 'metadata.json'), `${JSON.stringify(metadata, null, 2)}\n`);
}

export function appendEventsAndUpdateMetadata(sessionDir, events) {
  const metadata = readSessionMetadata(sessionDir);
  let lastEventId = Number(metadata.lastEventId) || 0;
  if (events.length > 0) {
    const jsonl = events.map((event) => JSON.stringify(event)).join('\n');
    fs.appendFileSync(path.join(sessionDir, 'events.jsonl'), `${jsonl}\n`);
    for (const event of events) {
      if (Number.isInteger(event.id)) {
        lastEventId = Math.max(lastEventId, event.id);
      }
    }
  }
  metadata.lastEventId = lastEventId;
  writeSessionMetadata(sessionDir, metadata);
  return lastEventId;
}

function jsonLiteral(value) {
  return JSON.stringify(value);
}

export function buildStartPageExpression({ sessionId, preserve }) {
  return `(() => {
    const sessionId = ${jsonLiteral(sessionId)};
    const page = {
      url: window.location.href,
      title: document.title,
    };
    const preferred = document.querySelector('textarea[placeholder="Message Codex"]');
    const textareas = Array.from(document.querySelectorAll('textarea'));
    const target = preferred ?? (textareas.length === 1 ? textareas[0] : null);
    if (!target) {
      return {
        ok: false,
        page,
        error: {
          code: 'textarea_not_found',
          message: 'Could not find textarea[placeholder="Message Codex"] or a unique fallback textarea.',
        },
      };
    }

    target.focus();
    ${preserve ? '' : `
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      if (typeof valueSetter !== 'function') {
        return {
          ok: false,
          page,
          error: {
            code: 'textarea_value_setter_missing',
            message: 'Could not locate the native textarea value setter.',
          },
        };
      }
      valueSetter.call(target, '');
      target.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        cancelable: false,
        data: null,
        inputType: 'deleteContentBackward',
      }));
    `}

    if (window.__codexImeControl?.dispose) {
      window.__codexImeControl.dispose();
    }

    let nextId = 0;
    const events = [];
    const eventNames = [
      'compositionstart',
      'compositionupdate',
      'compositionend',
      'keydown',
      'keyup',
      'beforeinput',
      'input',
      'change',
    ];
    const textareaState = () => ({
      value: target.value,
      focused: document.activeElement === target,
      selectionStart: target.selectionStart,
      selectionEnd: target.selectionEnd,
    });
    const record = (event) => {
      events.push({
        id: ++nextId,
        type: event.type,
        key: 'key' in event ? event.key : null,
        code: 'code' in event ? event.code : null,
        isComposing: typeof event.isComposing === 'boolean' ? event.isComposing : null,
        inputType: 'inputType' in event ? event.inputType : null,
        data: 'data' in event ? event.data : null,
        value: target.value,
        selectionStart: target.selectionStart,
        selectionEnd: target.selectionEnd,
        timeStamp: event.timeStamp,
        performanceNow: performance.now(),
        defaultPrevented: event.defaultPrevented,
      });
    };
    for (const eventName of eventNames) {
      target.addEventListener(eventName, record);
    }

    window.__codexImeControl = {
      marker: 'codex-ime-control',
      sessionId,
      eventNames,
      drainEvents(afterId) {
        const numericAfterId = Number(afterId) || 0;
        return events.filter((event) => event.id > numericAfterId);
      },
      textareaState,
      dispose() {
        for (const eventName of eventNames) {
          target.removeEventListener(eventName, record);
        }
      },
    };

    return {
      ok: true,
      page,
      textarea: textareaState(),
      sessionId,
    };
  })()`;
}

export function buildLoggerCheckExpression(sessionId) {
  return `(() => {
    const sessionId = ${jsonLiteral(sessionId)};
    const logger = window.__codexImeControl;
    if (!logger || logger.marker !== 'codex-ime-control') {
      return {
        ok: false,
        error: {
          code: 'logger_missing',
          message: 'IME control logger is missing. Run start again for this page before continuing.',
        },
      };
    }
    if (logger.sessionId !== sessionId) {
      return {
        ok: false,
        error: {
          code: 'session_mismatch',
          message: 'IME control logger belongs to a different session. Run start again for this page before continuing.',
          actualSessionId: logger.sessionId,
          expectedSessionId: sessionId,
        },
      };
    }
    return {
      ok: true,
      sessionId,
      textarea: typeof logger.textareaState === 'function' ? logger.textareaState() : null,
    };
  })()`;
}

export function buildDrainEventsExpression(sessionId, lastEventId) {
  return `(() => {
    const sessionId = ${jsonLiteral(sessionId)};
    const logger = window.__codexImeControl;
    if (!logger || logger.marker !== 'codex-ime-control') {
      return {
        ok: false,
        error: {
          code: 'logger_missing',
          message: 'IME control logger is missing. Run start again for this page before continuing.',
        },
      };
    }
    if (logger.sessionId !== sessionId) {
      return {
        ok: false,
        error: {
          code: 'session_mismatch',
          message: 'IME control logger belongs to a different session. Run start again for this page before continuing.',
          actualSessionId: logger.sessionId,
          expectedSessionId: sessionId,
        },
      };
    }
    return {
      ok: true,
      sessionId,
      events: logger.drainEvents(${jsonLiteral(lastEventId)}),
      textarea: typeof logger.textareaState === 'function' ? logger.textareaState() : null,
    };
  })()`;
}

export function nextCapturePaths(sessionDir, existingCaptureFileNames = []) {
  const highestIndex = existingCaptureFileNames.reduce((highest, fileName) => {
    const match = /^(\d{4})-candidate\.json$/.exec(fileName);
    if (!match) {
      return highest;
    }
    return Math.max(highest, Number(match[1]));
  }, 0);
  const index = highestIndex + 1;
  const paddedIndex = String(index).padStart(4, '0');
  const capturesDir = path.join(sessionDir, 'captures');
  return {
    index,
    jsonPath: path.join(capturesDir, `${paddedIndex}-candidate.json`),
    pngPath: path.join(capturesDir, `${paddedIndex}-candidate.png`),
  };
}

function frameOf(candidate) {
  return candidate?.frame ?? {};
}

export function isVisibleCandidate(candidate) {
  const text = typeof candidate?.text === 'string' ? candidate.text.trim() : '';
  const frame = frameOf(candidate);
  return Boolean(text) && Number(frame.width) > 0 && Number(frame.height) > 0;
}

export function sortCandidatesForIndex(candidates) {
  return candidates
    .filter(isVisibleCandidate)
    .toSorted((left, right) => {
      const leftFrame = frameOf(left);
      const rightFrame = frameOf(right);
      return (Number(leftFrame.y) || 0) - (Number(rightFrame.y) || 0)
        || (Number(leftFrame.x) || 0) - (Number(rightFrame.x) || 0);
    });
}

export function assignCandidateIndexes(candidates) {
  return sortCandidatesForIndex(candidates).map((candidate, index) => ({
    ...candidate,
    index: index + 1,
    visible: true,
  }));
}

export function inferCandidateMode(windowFrame, candidates) {
  const visibleCandidates = sortCandidatesForIndex(candidates);
  if (!windowFrame || visibleCandidates.length === 0) {
    return 'none';
  }

  const rowYs = [];
  for (const candidate of visibleCandidates) {
    const y = Number(frameOf(candidate).y) || 0;
    if (!rowYs.some((rowY) => Math.abs(rowY - y) <= 4)) {
      rowYs.push(y);
    }
  }
  return rowYs.length > 1 ? 'expanded' : 'compact';
}
