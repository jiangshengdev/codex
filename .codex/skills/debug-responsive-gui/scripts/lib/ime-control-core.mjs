import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const SESSION_ROOT = '/tmp/codex-ime-control';
export const COMMAND_VERSION = 'ime-control-task-4';
const CHROME_FOR_TESTING_OWNER = 'Google Chrome for Testing';

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

const LETTER_KEY_CODES = new Map([
  ['a', 0],
  ['b', 11],
  ['c', 8],
  ['d', 2],
  ['e', 14],
  ['f', 3],
  ['g', 5],
  ['h', 4],
  ['i', 34],
  ['j', 38],
  ['k', 40],
  ['l', 37],
  ['m', 46],
  ['n', 45],
  ['o', 31],
  ['p', 35],
  ['q', 12],
  ['r', 15],
  ['s', 1],
  ['t', 17],
  ['u', 32],
  ['v', 9],
  ['w', 13],
  ['x', 7],
  ['y', 16],
  ['z', 6],
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

function delayLine(delaySeconds) {
  const delay = Number(delaySeconds);
  return Number.isFinite(delay) && delay > 0 ? `  delay ${delay}` : null;
}

function buildAppleScriptForKeyCodes(keyCodes, { delaySeconds = 0.03 } = {}) {
  const lines = [
    'tell application "Google Chrome for Testing" to activate',
    'delay 0.05',
    'tell application "System Events"',
  ];
  for (const keyCode of keyCodes) {
    lines.push(`  key code ${keyCode}`);
    const delay = delayLine(delaySeconds);
    if (delay) {
      lines.push(delay);
    }
  }
  lines.push('end tell');
  return `${lines.join('\n')}\n`;
}

export function buildTypeAppleScript(pinyin, options = {}) {
  const text = validatePinyin(pinyin);
  const keyCodes = [...text].map((letter) => LETTER_KEY_CODES.get(letter));
  return buildAppleScriptForKeyCodes(keyCodes, options);
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

export function buildKeyAppleScript(key, options = {}) {
  return buildAppleScriptForKeyCodes([keyCodeForKey(key)], options);
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

export function appendActionRecord(sessionDir, actionRecord) {
  const record = {
    type: 'ime-control-action',
    phase: actionRecord.phase,
    action: actionRecord.action,
    ...(actionRecord.pinyin === undefined ? {} : { pinyin: actionRecord.pinyin }),
    ...(actionRecord.key === undefined ? {} : { key: actionRecord.key }),
    ...(actionRecord.keyCode === undefined ? {} : { keyCode: actionRecord.keyCode }),
    at: actionRecord.at ?? Date.now(),
    ...(actionRecord.ok === undefined ? {} : { ok: actionRecord.ok }),
    ...(actionRecord.error === undefined ? {} : { error: actionRecord.error }),
  };
  fs.appendFileSync(path.join(sessionDir, 'actions.jsonl'), `${JSON.stringify(record)}\n`);
  return record;
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

export function buildTextareaStateExpression() {
  return `(() => {
    const preferred = document.querySelector('textarea[placeholder="Message Codex"]');
    const textareas = Array.from(document.querySelectorAll('textarea'));
    const target = preferred ?? (textareas.length === 1 ? textareas[0] : null);
    if (!target) {
      return {
        ok: false,
        error: {
          code: 'textarea_not_found',
          message: 'Could not find textarea[placeholder="Message Codex"] or a unique fallback textarea.',
        },
      };
    }
    return {
      ok: true,
      textarea: {
        value: target.value,
        focused: document.activeElement === target,
        selectionStart: target.selectionStart,
        selectionEnd: target.selectionEnd,
      },
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

export function relativePath(fromDir, targetPath) {
  return path.relative(fromDir, targetPath).split(path.sep).join('/');
}

export function buildScreencaptureArgs(windowId, pngPath) {
  if (!Number.isInteger(windowId) || windowId <= 0) {
    throw new Error('screencapture window id must be a positive integer');
  }
  return ['-x', '-o', '-l', String(windowId), pngPath];
}

export function writeCandidateCapture({
  sessionDir,
  sessionId,
  action,
  capture,
  at = Date.now(),
}) {
  const capturesDir = path.join(sessionDir, 'captures');
  const capturePaths = nextCapturePaths(sessionDir, fs.readdirSync(capturesDir));
  const candidate = {
    type: 'ime-control-capture',
    sessionId,
    action,
    at,
    ...capture,
  };
  fs.writeFileSync(capturePaths.jsonPath, `${JSON.stringify(candidate, null, 2)}\n`);
  fs.writeFileSync(path.join(sessionDir, 'latest-candidate.json'), `${JSON.stringify(candidate, null, 2)}\n`);
  return {
    candidate,
    paths: capturePaths,
  };
}

export function shapeCandidateCapture({
  sessionDir,
  capturePaths,
  textarea,
  axResult,
  screenshotCaptured = false,
  screenshotError = null,
}) {
  const notes = [
    'index is inferred from visible candidate order, not exposed by AX',
  ];
  const candidateWindow = axResult?.candidateWindow ?? null;
  const rawCandidates = Array.isArray(candidateWindow?.candidates) ? candidateWindow.candidates : [];
  const candidates = assignCandidateIndexes(rawCandidates);
  const windowFrame = candidateWindow?.frame ?? null;
  const windowId = Number.isInteger(candidateWindow?.windowId) ? candidateWindow.windowId : null;
  if (axResult?.note) {
    notes.push(axResult.note);
  }
  for (const note of axResult?.notes ?? []) {
    notes.push(note);
  }

  if (!candidateWindow) {
    return {
      present: false,
      window: null,
      mode: 'none',
      candidates: [],
      textarea,
      screenshot: null,
      notes,
    };
  }

  if (windowId === null) {
    notes.push('AX candidate window was found, but no matching CGWindow id was found for screenshot capture.');
  }
  if (screenshotError) {
    notes.push(`screencapture failed: ${screenshotError}`);
  }

  return {
    present: true,
    window: {
      id: windowId,
      frame: windowFrame,
    },
    mode: inferCandidateMode(windowFrame, candidates),
    candidates,
    textarea,
    screenshot: screenshotCaptured ? relativePath(sessionDir, capturePaths.pngPath) : null,
    notes,
  };
}

export function buildCandidateCaptureSwiftSource() {
  return `import AppKit
import ApplicationServices
import CoreGraphics
import Foundation

let targetOwner = "${CHROME_FOR_TESTING_OWNER}"
let frameTolerance: Double = 12

struct Rect: Codable {
  let x: Double
  let y: Double
  let width: Double
  let height: Double
}

struct Candidate: Codable {
  let text: String
  let title: String?
  let description: String?
  let frame: Rect
}

struct CandidateWindow: Codable {
  let title: String
  let frame: Rect
  let windowId: Int?
  let candidates: [Candidate]
}

struct Output: Codable {
  let ok: Bool
  let candidateWindow: CandidateWindow?
  let notes: [String]
}

func stringAttribute(_ element: AXUIElement, _ attribute: String) -> String? {
  var value: CFTypeRef?
  let result = AXUIElementCopyAttributeValue(element, attribute as CFString, &value)
  guard result == .success else { return nil }
  return value as? String
}

func children(_ element: AXUIElement) -> [AXUIElement] {
  var value: CFTypeRef?
  let result = AXUIElementCopyAttributeValue(element, kAXChildrenAttribute as CFString, &value)
  guard result == .success else { return [] }
  return value as? [AXUIElement] ?? []
}

func rectForElement(_ element: AXUIElement) -> Rect? {
  var positionValue: CFTypeRef?
  var sizeValue: CFTypeRef?
  guard AXUIElementCopyAttributeValue(element, kAXPositionAttribute as CFString, &positionValue) == .success,
        AXUIElementCopyAttributeValue(element, kAXSizeAttribute as CFString, &sizeValue) == .success,
        let positionAx = positionValue,
        let sizeAx = sizeValue else {
    return nil
  }
  var point = CGPoint.zero
  var size = CGSize.zero
  guard AXValueGetValue(positionAx as! AXValue, .cgPoint, &point),
        AXValueGetValue(sizeAx as! AXValue, .cgSize, &size) else {
    return nil
  }
  return Rect(x: point.x, y: point.y, width: size.width, height: size.height)
}

func role(_ element: AXUIElement) -> String {
  stringAttribute(element, kAXRoleAttribute) ?? ""
}

func collectButtons(_ element: AXUIElement) -> [AXUIElement] {
  var result: [AXUIElement] = []
  for child in children(element) {
    if role(child) == kAXButtonRole as String {
      result.append(child)
    }
    result.append(contentsOf: collectButtons(child))
  }
  return result
}

func candidatesInWindow(_ window: AXUIElement) -> [Candidate] {
  var buttons: [AXUIElement] = []
  for child in children(window) {
    if role(child) == kAXListRole as String {
      buttons.append(contentsOf: collectButtons(child))
    }
  }
  return buttons.compactMap { button in
    let title = stringAttribute(button, kAXTitleAttribute)
    let description = stringAttribute(button, kAXDescriptionAttribute)
    let text = (title?.isEmpty == false ? title : description) ?? ""
    guard let frame = rectForElement(button) else { return nil }
    return Candidate(text: text, title: title, description: description, frame: frame)
  }
}

func close(_ left: Double, _ right: Double) -> Bool {
  abs(left - right) <= frameTolerance
}

func scoreCgWindow(_ info: [String: Any], frame: Rect) -> Int? {
  guard (info[kCGWindowOwnerName as String] as? String) == targetOwner,
        let bounds = info[kCGWindowBounds as String] as? [String: Any] else {
    return nil
  }
  let x = bounds["X"] as? Double ?? bounds["x"] as? Double ?? 0
  let y = bounds["Y"] as? Double ?? bounds["y"] as? Double ?? 0
  let width = bounds["Width"] as? Double ?? bounds["width"] as? Double ?? 0
  let height = bounds["Height"] as? Double ?? bounds["height"] as? Double ?? 0
  guard close(x, frame.x), close(y, frame.y), close(width, frame.width), close(height, frame.height) else {
    return nil
  }
  let layer = info[kCGWindowLayer as String] as? Int ?? 0
  return (layer > 0 ? 1000 : 0) - Int(abs(width * height - frame.width * frame.height))
}

func matchingWindowId(frame: Rect) -> Int? {
  guard let list = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] else {
    return nil
  }
  let matches = list.compactMap { info -> (id: Int, score: Int)? in
    guard let id = info[kCGWindowNumber as String] as? Int,
          let score = scoreCgWindow(info, frame: frame) else {
      return nil
    }
    return (id, score)
  }
  return matches.sorted { $0.score > $1.score }.first?.id
}

let app = NSWorkspace.shared.runningApplications.first { $0.localizedName == targetOwner }
guard let processIdentifier = app?.processIdentifier else {
  let output = Output(ok: true, candidateWindow: nil, notes: ["Google Chrome for Testing is not running."])
  let data = try JSONEncoder().encode(output)
  print(String(data: data, encoding: .utf8)!)
  exit(0)
}

let axApp = AXUIElementCreateApplication(processIdentifier)
var windowsValue: CFTypeRef?
guard AXUIElementCopyAttributeValue(axApp, kAXWindowsAttribute as CFString, &windowsValue) == .success,
      let windows = windowsValue as? [AXUIElement] else {
  let output = Output(ok: true, candidateWindow: nil, notes: ["AX windows were unavailable for Google Chrome for Testing."])
  let data = try JSONEncoder().encode(output)
  print(String(data: data, encoding: .utf8)!)
  exit(0)
}

let candidates = windows.compactMap { window -> CandidateWindow? in
  guard role(window) == kAXWindowRole as String else { return nil }
  let title = stringAttribute(window, kAXTitleAttribute) ?? ""
  guard title.isEmpty, let frame = rectForElement(window) else { return nil }
  let candidates = candidatesInWindow(window)
  guard !candidates.isEmpty else { return nil }
  return CandidateWindow(title: title, frame: frame, windowId: matchingWindowId(frame: frame), candidates: candidates)
}

let preferred = candidates.sorted {
  let leftId = $0.windowId == nil ? 0 : 1
  let rightId = $1.windowId == nil ? 0 : 1
  if leftId != rightId { return leftId > rightId }
  return $0.candidates.count > $1.candidates.count
}.first

let output = Output(ok: true, candidateWindow: preferred, notes: [])
let data = try JSONEncoder().encode(output)
print(String(data: data, encoding: .utf8)!)
`;
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
