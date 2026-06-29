# Redux Inspector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a standalone Redux inspector to `debug-responsive-gui` that reads the current Playwright-controlled Codex GUI page, finds the React-Redux Provider through React fiber, and prints bounded JSON state summaries.

**Architecture:** Keep Redux inspection separate from the existing React inspector. Add a small CLI entrypoint, move browser-page expression logic into a pure library module, and cover argument parsing, path reading, store discovery, summary building, and value bounding with Node's built-in test runner.

**Tech Stack:** Node.js ESM, Node built-in `node:test`, existing `playwright-cli` wrapper, existing `debug-responsive-gui` skill validation script.

---

## File Structure

- Create: `.codex/skills/debug-responsive-gui/scripts/inspect-redux.mjs`
  - CLI entrypoint.
  - Parses flags.
  - Calls `currentBrowser()` and `evalJson()`.
  - Prints only JSON to stdout.
- Create: `.codex/skills/debug-responsive-gui/scripts/lib/inspect-redux-page.mjs`
  - Pure helper module.
  - Builds the browser-side expression.
  - Exports argument parsing, dot-path reading, bounded value serialization, Provider search, and result shaping helpers.
- Create: `.codex/skills/debug-responsive-gui/scripts/inspect-redux.test.mjs`
  - Unit tests for pure helpers.
  - Does not launch a browser.
- Modify: `.codex/skills/debug-responsive-gui/SKILL.md`
  - Add a short Redux inspector section.
  - Keep `inspect-react.mjs` documented as React-only.
  - Record that Redux inspection does not depend on Redux DevTools extension or `getFiberRoots()`.

## Task 1: Add Failing Tests And CLI Stub

**Files:**
- Create: `.codex/skills/debug-responsive-gui/scripts/inspect-redux.test.mjs`
- Create: `.codex/skills/debug-responsive-gui/scripts/inspect-redux.mjs`
- Create: `.codex/skills/debug-responsive-gui/scripts/lib/inspect-redux-page.mjs`

- [ ] **Step 1: Write the failing test file**

Create `.codex/skills/debug-responsive-gui/scripts/inspect-redux.test.mjs`:

```javascript
#!/usr/bin/env node

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildPageExpression,
  buildReduxSummary,
  findReduxStoreFromRoot,
  parseArgs,
  readStatePath,
  safeValue,
} from './lib/inspect-redux-page.mjs';

function fiber({
  tag = 0,
  type = undefined,
  elementType = undefined,
  key = null,
  memoizedProps = {},
  child = null,
  sibling = null,
} = {}) {
  return {
    tag,
    type,
    elementType,
    key,
    memoizedProps,
    child,
    sibling,
  };
}

describe('parseArgs', () => {
  it('uses safe defaults', () => {
    assert.deepEqual(parseArgs([]), {
      maxArrayItems: 10,
      maxDepth: 2,
      maxKeys: 20,
      maxStringLength: 200,
      path: null,
    });
  });

  it('accepts path and value limits', () => {
    assert.deepEqual(parseArgs([
      '--path',
      'transcriptState.entriesById',
      '--max-depth',
      '3',
      '--max-keys',
      '7',
      '--max-array-items',
      '4',
      '--max-string-length',
      '12',
    ]), {
      maxArrayItems: 4,
      maxDepth: 3,
      maxKeys: 7,
      maxStringLength: 12,
      path: 'transcriptState.entriesById',
    });
  });

  it('rejects invalid arguments', () => {
    assert.throws(() => parseArgs(['--path']), /--path requires a value/);
    assert.throws(() => parseArgs(['--max-depth', 'abc']), /--max-depth requires a non-negative integer/);
    assert.throws(() => parseArgs(['--unknown']), /Unknown argument: --unknown/);
  });
});

describe('readStatePath', () => {
  const state = {
    threadRuntime: { current: { activeTurnId: 'turn-1' } },
    transcriptState: { entriesById: { entry1: { phase: 'final_answer' } } },
  };

  it('returns root state without a path', () => {
    assert.deepEqual(readStatePath(state, null), {
      found: true,
      value: state,
    });
  });

  it('reads a dot path', () => {
    assert.deepEqual(readStatePath(state, 'threadRuntime.current.activeTurnId'), {
      found: true,
      value: 'turn-1',
    });
  });

  it('reports missing paths', () => {
    assert.deepEqual(readStatePath(state, 'threadRuntime.current.missing'), {
      found: false,
      missingAt: 'threadRuntime.current.missing',
      value: undefined,
    });
  });
});

describe('safeValue', () => {
  it('bounds large and cyclic values', () => {
    const value = {
      label: 'x'.repeat(15),
      list: [1, 2, 3, 4],
      nested: { a: { b: { c: 1 } } },
    };
    value.self = value;

    assert.deepEqual(safeValue(value, {
      maxArrayItems: 2,
      maxDepth: 2,
      maxKeys: 4,
      maxStringLength: 10,
    }), {
      label: 'xxxxxxxxxx...',
      list: [1, 2, '[truncated 2 items]'],
      nested: { a: '[max depth]' },
      self: '[circular]',
    });
  });
});

describe('findReduxStoreFromRoot', () => {
  it('finds a React-Redux Provider store through fiber BFS', () => {
    const store = { getState: () => ({ threadIdentity: { attachStatus: 'attached' } }) };
    const provider = fiber({
      tag: 10,
      type: { displayName: 'ReactRedux' },
      memoizedProps: {
        value: {
          store,
          subscription: {},
          getServerState: null,
        },
      },
    });
    const app = fiber({ type: function App() {}, child: provider });
    const root = fiber({ tag: 3, child: app });

    assert.deepEqual(findReduxStoreFromRoot(root), {
      store,
      provider: {
        depth: 2,
        name: 'ReactRedux',
        path: '0.0.0',
        tag: 10,
        valueKeys: ['store', 'subscription', 'getServerState'],
      },
      visitedFibers: 3,
    });
  });
});

describe('buildReduxSummary', () => {
  it('summarizes known codex-gui slices without dumping state', () => {
    const state = {
      threadIdentity: {
        launchThreadId: 'thread-1',
        attachedThreadId: 'thread-1',
        attachStatus: 'attached',
      },
      threadRuntime: {
        current: {
          activeTurnId: 'turn-2',
          snapshotTurns: [{ id: 'turn-1' }, { id: 'turn-2' }],
          eventBuffer: [{ id: 'event-1' }],
          subscription: { state: 'active' },
        },
      },
      transcriptState: {
        turnIds: ['turn-1'],
        turnsById: { 'turn-1': {} },
        chunksById: { chunk1: {} },
        entriesById: { entry1: {} },
        appliedEventOrder: ['event-1'],
        committedScrollCommitKey: 'event:event-1',
      },
    };

    assert.deepEqual(buildReduxSummary(state), {
      topKeys: ['threadIdentity', 'threadRuntime', 'transcriptState'],
      slices: {
        threadIdentity: {
          keys: ['launchThreadId', 'attachedThreadId', 'attachStatus'],
          attachStatus: 'attached',
          launchThreadId: 'thread-1',
          attachedThreadId: 'thread-1',
        },
        threadRuntime: {
          keys: ['current'],
          hasCurrent: true,
          activeTurnId: 'turn-2',
          snapshotTurnsCount: 2,
          eventBufferCount: 1,
          subscriptionState: 'active',
        },
        transcriptState: {
          keys: [
            'turnIds',
            'turnsById',
            'chunksById',
            'entriesById',
            'appliedEventOrder',
            'committedScrollCommitKey',
          ],
          turnIdsCount: 1,
          turnsByIdCount: 1,
          chunksByIdCount: 1,
          entriesByIdCount: 1,
          appliedEventOrderCount: 1,
          committedScrollCommitKey: 'event:event-1',
        },
      },
    });
  });
});

describe('buildPageExpression', () => {
  it('embeds the Redux Provider lookup without Redux DevTools dependency', () => {
    const expression = buildPageExpression({ path: 'threadRuntime.current' });

    assert.equal(expression.includes('__reactContainer$'), true);
    assert.equal(expression.includes('memoizedProps'), true);
    assert.equal(expression.includes('getState'), true);
    assert.equal(expression.includes('__REDUX_DEVTOOLS_EXTENSION__'), false);
    assert.equal(expression.includes('getFiberRoots'), false);
  });
});
```

- [ ] **Step 2: Add temporary TDD stubs**

Create `.codex/skills/debug-responsive-gui/scripts/lib/inspect-redux-page.mjs`:

```javascript
#!/usr/bin/env node

export function parseArgs() {
  return {};
}

export function readStatePath() {
  return { found: false, value: undefined };
}

export function safeValue(value) {
  return value;
}

export function findReduxStoreFromRoot() {
  return null;
}

export function buildReduxSummary() {
  return {};
}

export function buildPageExpression() {
  return '';
}
```

Create `.codex/skills/debug-responsive-gui/scripts/inspect-redux.mjs`:

```javascript
#!/usr/bin/env node

import { fileURLToPath } from 'node:url';

import { buildPageExpression, parseArgs } from './lib/inspect-redux-page.mjs';
import { currentBrowser, evalJson } from './lib/playwright-cli.mjs';

export { buildPageExpression, parseArgs };

async function main() {
  if (!currentBrowser()) {
    console.log(JSON.stringify({
      ok: false,
      errors: [{ code: 'browser_not_open', message: 'No Playwright-controlled browser is open' }],
    }, null, 2));
    process.exit(1);
  }

  const options = parseArgs(process.argv.slice(2));
  const result = evalJson(buildPageExpression(options));
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) {
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
```

- [ ] **Step 3: Run tests and verify red**

Run:

```bash
node --test .codex/skills/debug-responsive-gui/scripts/inspect-redux.test.mjs
```

Expected: FAIL. The first failure should show `parseArgs([])` returning `{}` instead of the expected safe defaults.

## Task 2: Implement Pure Redux Inspector Helpers

**Files:**
- Modify: `.codex/skills/debug-responsive-gui/scripts/lib/inspect-redux-page.mjs`
- Test: `.codex/skills/debug-responsive-gui/scripts/inspect-redux.test.mjs`

- [ ] **Step 1: Implement the helper module**

Replace `.codex/skills/debug-responsive-gui/scripts/lib/inspect-redux-page.mjs` with:

```javascript
#!/usr/bin/env node

const DEFAULT_LIMITS = {
  maxArrayItems: 10,
  maxDepth: 2,
  maxKeys: 20,
  maxStringLength: 200,
};

function readOptionValue(args, index, name) {
  const value = args[index + 1];
  if (value === undefined || value === '' || value.startsWith('--')) {
    throw new Error(`${name} requires a value`);
  }
  return value;
}

function readNonNegativeInteger(args, index, name) {
  const value = readOptionValue(args, index, name);
  if (!/^\d+$/.test(value)) {
    throw new Error(`${name} requires a non-negative integer`);
  }
  return Number(value);
}

export function parseArgs(args = []) {
  const parsed = {
    ...DEFAULT_LIMITS,
    path: null,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--path') {
      parsed.path = readOptionValue(args, index, '--path');
      index += 1;
    } else if (arg === '--max-depth') {
      parsed.maxDepth = readNonNegativeInteger(args, index, '--max-depth');
      index += 1;
    } else if (arg === '--max-keys') {
      parsed.maxKeys = readNonNegativeInteger(args, index, '--max-keys');
      index += 1;
    } else if (arg === '--max-array-items') {
      parsed.maxArrayItems = readNonNegativeInteger(args, index, '--max-array-items');
      index += 1;
    } else if (arg === '--max-string-length') {
      parsed.maxStringLength = readNonNegativeInteger(args, index, '--max-string-length');
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return parsed;
}

function isObject(value) {
  return value !== null && typeof value === 'object';
}

function objectKeys(value) {
  return isObject(value) ? Object.keys(value) : [];
}

function countObjectKeys(value) {
  return isObject(value) ? Object.keys(value).length : null;
}

export function readStatePath(state, path) {
  if (!path) {
    return { found: true, value: state };
  }

  const parts = path.split('.');
  let current = state;
  const consumed = [];

  for (const part of parts) {
    consumed.push(part);
    if (!isObject(current) || !Object.prototype.hasOwnProperty.call(current, part)) {
      return {
        found: false,
        missingAt: consumed.join('.'),
        value: undefined,
      };
    }
    current = current[part];
  }

  return { found: true, value: current };
}

function safePrimitiveValue(value, limits) {
  if (typeof value === 'string' && value.length > limits.maxStringLength) {
    return `${value.slice(0, limits.maxStringLength)}...`;
  }
  return value;
}

export function safeValue(value, options = {}, state = {}) {
  const limits = {
    ...DEFAULT_LIMITS,
    ...options,
  };
  const depth = state.depth ?? 0;
  const seen = state.seen ?? new Set();

  if (
    value === null ||
    typeof value === 'boolean' ||
    typeof value === 'number' ||
    typeof value === 'string'
  ) {
    return safePrimitiveValue(value, limits);
  }

  if (typeof value === 'undefined') {
    return '[undefined]';
  }

  if (typeof value === 'function') {
    return `[function ${value.displayName || value.name || 'anonymous'}]`;
  }

  if (typeof value === 'bigint') {
    return `${value.toString()}n`;
  }

  if (typeof value === 'symbol') {
    return value.toString();
  }

  if (!isObject(value)) {
    return `[${typeof value}]`;
  }

  if (value.nodeType && value.nodeName) {
    return `[DOM ${value.nodeName}]`;
  }

  if (value.$$typeof) {
    return '[react element]';
  }

  if (seen.has(value)) {
    return '[circular]';
  }

  if (depth >= limits.maxDepth) {
    return '[max depth]';
  }

  seen.add(value);

  if (Array.isArray(value)) {
    const result = value
      .slice(0, limits.maxArrayItems)
      .map((item) => safeValue(item, limits, { depth: depth + 1, seen }));
    const remaining = value.length - result.length;
    if (remaining > 0) {
      result.push(`[truncated ${remaining} ${remaining === 1 ? 'item' : 'items'}]`);
    }
    return result;
  }

  const result = {};
  const entries = Object.entries(value).slice(0, limits.maxKeys);
  for (const [key, entryValue] of entries) {
    result[key] = safeValue(entryValue, limits, { depth: depth + 1, seen });
  }
  const remaining = Object.keys(value).length - entries.length;
  if (remaining > 0) {
    result.__truncated = `${remaining} ${remaining === 1 ? 'key' : 'keys'}`;
  }
  return result;
}

function displayNameFromType(type) {
  if (typeof type === 'string') {
    return type;
  }
  if (typeof type === 'function') {
    return type.displayName || type.name || null;
  }
  if (!isObject(type)) {
    return null;
  }
  return type.displayName || type.name || displayNameFromType(type.render) || displayNameFromType(type.type) || null;
}

function fiberName(fiber) {
  return displayNameFromType(fiber?.type) || displayNameFromType(fiber?.elementType) || `Unknown(${String(fiber?.tag)})`;
}

export function findReduxStoreFromRoot(rootFiber) {
  const queue = [{ fiber: rootFiber, depth: 0, path: '0' }];
  const seen = new Set();
  let visitedFibers = 0;

  while (queue.length > 0 && visitedFibers < 10000) {
    const current = queue.shift();
    const fiber = current?.fiber;
    if (!fiber || seen.has(fiber)) {
      continue;
    }
    seen.add(fiber);
    visitedFibers += 1;

    const value = fiber.memoizedProps?.value;
    if (value?.store && typeof value.store.getState === 'function') {
      return {
        store: value.store,
        provider: {
          path: current.path,
          depth: current.depth,
          tag: fiber.tag,
          name: fiberName(fiber),
          valueKeys: Object.keys(value),
        },
        visitedFibers,
      };
    }

    let child = fiber.child;
    let index = 0;
    while (child) {
      queue.push({
        fiber: child,
        depth: current.depth + 1,
        path: `${current.path}.${index}`,
      });
      child = child.sibling;
      index += 1;
    }
  }

  return {
    store: null,
    provider: null,
    visitedFibers,
  };
}

export function buildReduxSummary(state) {
  const threadIdentity = state.threadIdentity;
  const threadRuntime = state.threadRuntime ?? {};
  const runtimeCurrent = threadRuntime.current ?? null;
  const transcriptState = state.transcriptState;

  const slices = {};
  for (const key of Object.keys(state)) {
    const slice = state[key];
    slices[key] = { keys: objectKeys(slice) };
  }

  if (threadIdentity) {
    slices.threadIdentity = {
      keys: objectKeys(threadIdentity),
      attachStatus: threadIdentity.attachStatus ?? null,
      launchThreadId: threadIdentity.launchThreadId ?? null,
      attachedThreadId: threadIdentity.attachedThreadId ?? null,
    };
  }

  if (threadRuntime) {
    slices.threadRuntime = {
      keys: objectKeys(threadRuntime),
      hasCurrent: Boolean(runtimeCurrent),
      activeTurnId: runtimeCurrent?.activeTurnId ?? null,
      snapshotTurnsCount: Array.isArray(runtimeCurrent?.snapshotTurns) ? runtimeCurrent.snapshotTurns.length : null,
      eventBufferCount: Array.isArray(runtimeCurrent?.eventBuffer) ? runtimeCurrent.eventBuffer.length : null,
      subscriptionState: runtimeCurrent?.subscription?.state ?? threadRuntime.subscription?.state ?? null,
    };
  }

  if (transcriptState) {
    slices.transcriptState = {
      keys: objectKeys(transcriptState),
      turnIdsCount: Array.isArray(transcriptState.turnIds) ? transcriptState.turnIds.length : null,
      turnsByIdCount: countObjectKeys(transcriptState.turnsById),
      chunksByIdCount: countObjectKeys(transcriptState.chunksById),
      entriesByIdCount: countObjectKeys(transcriptState.entriesById),
      appliedEventOrderCount: Array.isArray(transcriptState.appliedEventOrder) ? transcriptState.appliedEventOrder.length : null,
      committedScrollCommitKey: transcriptState.committedScrollCommitKey ?? null,
    };
  }

  return {
    topKeys: Object.keys(state),
    slices,
  };
}

export function buildPageExpression(options = {}) {
  return `(() => {
    const options = ${JSON.stringify(options)};
    const DEFAULT_LIMITS = ${JSON.stringify(DEFAULT_LIMITS)};
    ${isObject.toString()}
    ${objectKeys.toString()}
    ${countObjectKeys.toString()}
    ${readStatePath.toString()}
    ${safePrimitiveValue.toString()}
    ${safeValue.toString()}
    ${displayNameFromType.toString()}
    ${fiberName.toString()}
    ${findReduxStoreFromRoot.toString()}
    ${buildReduxSummary.toString()}

    function contextSummary() {
      const contextMap = globalThis[Symbol.for('react-redux-context')];
      if (contextMap instanceof Map) {
        return {
          contextPresent: true,
          contextType: 'Map',
          contextSize: contextMap.size,
          displayNames: Array.from(contextMap.values()).map((context) => context?.displayName ?? null),
        };
      }
      return {
        contextPresent: Boolean(contextMap),
        contextType: typeof contextMap,
        contextSize: null,
        displayNames: [],
      };
    }

    function failure(code, message, metadata = {}) {
      return {
        ok: false,
        page: { url: location.href, title: document.title },
        root: metadata.root ?? { selector: '#root', found: false, containerKey: null, rootTag: null },
        reactRedux: metadata.reactRedux ?? contextSummary(),
        counts: metadata.counts ?? { visitedFibers: 0 },
        errors: [{ code, message }],
      };
    }

    const rootElement = document.querySelector('#root');
    const root = { selector: '#root', found: Boolean(rootElement), containerKey: null, rootTag: null };
    if (!rootElement) {
      return failure('root_element_not_found', 'Could not find #root', { root });
    }

    const containerKey = Object.getOwnPropertyNames(rootElement).find((key) => key.startsWith('__reactContainer$')) ?? null;
    root.containerKey = containerKey;
    if (!containerKey) {
      return failure('react_root_not_found', 'Could not find #root.__reactContainer$...', { root });
    }

    const rootFiber = rootElement[containerKey]?.current ?? rootElement[containerKey];
    root.rootTag = rootFiber?.tag ?? null;
    if (!rootFiber) {
      return failure('react_root_not_found', 'React root fiber is empty', { root });
    }

    const found = findReduxStoreFromRoot(rootFiber);
    const reactRedux = {
      ...contextSummary(),
      provider: found.provider,
    };
    const counts = { visitedFibers: found.visitedFibers };
    if (!found.store) {
      return failure('redux_store_not_found', 'Could not find React-Redux Provider store', { root, reactRedux, counts });
    }

    const state = found.store.getState();
    const result = {
      ok: true,
      page: { url: location.href, title: document.title },
      root,
      reactRedux,
      counts,
      state: buildReduxSummary(state),
      errors: [],
    };

    if (options.path) {
      const selected = readStatePath(state, options.path);
      result.path = {
        requested: options.path,
        found: selected.found,
        value: selected.found ? safeValue(selected.value, options) : '[missing]',
      };
      if (!selected.found) {
        result.ok = false;
        result.errors.push({
          code: 'path_not_found',
          message: \`Redux state path not found: \${selected.missingAt}\`,
        });
      }
    }

    return JSON.stringify(result, null, 2);
  })()`;
}
```

- [ ] **Step 2: Run helper tests and verify green**

Run:

```bash
node --test .codex/skills/debug-responsive-gui/scripts/inspect-redux.test.mjs
```

Expected: PASS. All tests in `inspect-redux.test.mjs` pass.

## Task 3: Finish CLI Behavior And Error JSON

**Files:**
- Modify: `.codex/skills/debug-responsive-gui/scripts/inspect-redux.mjs`
- Test: `.codex/skills/debug-responsive-gui/scripts/inspect-redux.test.mjs`

- [ ] **Step 1: Add CLI tests for exported parser and expression**

Append this test block to `.codex/skills/debug-responsive-gui/scripts/inspect-redux.test.mjs`:

```javascript
describe('CLI exports', () => {
  it('exports parser and page expression builder through the CLI module', async () => {
    const cli = await import('./inspect-redux.mjs');

    assert.deepEqual(cli.parseArgs(['--path', 'threadIdentity.attachStatus']), {
      maxArrayItems: 10,
      maxDepth: 2,
      maxKeys: 20,
      maxStringLength: 200,
      path: 'threadIdentity.attachStatus',
    });
    assert.equal(cli.buildPageExpression({ path: 'threadRuntime.current' }).includes('__reactContainer$'), true);
  });
});
```

- [ ] **Step 2: Run test and verify it passes with the current CLI stub**

Run:

```bash
node --test .codex/skills/debug-responsive-gui/scripts/inspect-redux.test.mjs
```

Expected: PASS. The CLI already re-exports `parseArgs` and `buildPageExpression`.

- [ ] **Step 3: Harden CLI argument and browser errors**

Replace `.codex/skills/debug-responsive-gui/scripts/inspect-redux.mjs` with:

```javascript
#!/usr/bin/env node

import { fileURLToPath } from 'node:url';

import { buildPageExpression, parseArgs } from './lib/inspect-redux-page.mjs';
import { currentBrowser, evalJson } from './lib/playwright-cli.mjs';

export { buildPageExpression, parseArgs };

function printFailure(code, message) {
  console.log(JSON.stringify({
    ok: false,
    errors: [{ code, message }],
  }, null, 2));
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    printFailure('invalid_argument', error.message);
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
    printFailure('inspect_redux_failed', error.message);
    process.exit(1);
  });
}
```

- [ ] **Step 4: Run tests again**

Run:

```bash
node --test .codex/skills/debug-responsive-gui/scripts/inspect-redux.test.mjs
```

Expected: PASS.

## Task 4: Document Redux Inspector In The Skill

**Files:**
- Modify: `.codex/skills/debug-responsive-gui/SKILL.md`

- [ ] **Step 1: Add a Redux inspector section after the React inspector section**

In `.codex/skills/debug-responsive-gui/SKILL.md`, after the existing React inspector commands and explanation, add:

```markdown
## Redux inspector

读取当前 `playwright-cli` 控制页面的 Redux store 摘要：

```bash
node .codex/skills/debug-responsive-gui/scripts/inspect-redux.mjs
node .codex/skills/debug-responsive-gui/scripts/inspect-redux.mjs --path threadRuntime.current
node .codex/skills/debug-responsive-gui/scripts/inspect-redux.mjs --path transcriptState.entriesById --max-depth 2 --max-keys 40
```

脚本只检查当前已打开页面，不启动、不导航、不关闭浏览器；stdout 只输出 JSON。它从 `#root.__reactContainer$...` 进入 React fiber，查找 React-Redux Provider 的 `memoizedProps.value.store`，再读取 `store.getState()`。不要依赖 Redux DevTools extension，也不要依赖 `__REACT_DEVTOOLS_GLOBAL_HOOK__.getFiberRoots()`。

默认输出安全摘要，不打印完整 store。需要读取局部 state 时使用 `--path <dot.path>`；输出仍受 `--max-depth`、`--max-keys`、`--max-array-items` 和 `--max-string-length` 限制。
```

- [ ] **Step 2: Run skill validation**

Run:

```bash
/usr/bin/python3 /Users/jiangsheng/.codex/skills/.system/skill-creator/scripts/quick_validate.py .codex/skills/debug-responsive-gui
```

Expected: PASS with `Skill is valid!`.

## Task 5: Run Static And Unit Verification

**Files:**
- Verify: `.codex/skills/debug-responsive-gui/scripts/*.mjs`
- Verify: `.codex/skills/debug-responsive-gui/SKILL.md`

- [ ] **Step 1: Syntax-check all debug-responsive-gui scripts**

Run:

```bash
find .codex/skills/debug-responsive-gui/scripts -name '*.mjs' -print0 | xargs -0 -n1 node --check
```

Expected: exit 0 with no syntax errors.

- [ ] **Step 2: Run React and Redux inspector tests together**

Run:

```bash
node --test .codex/skills/debug-responsive-gui/scripts/inspect-react.test.mjs .codex/skills/debug-responsive-gui/scripts/inspect-redux.test.mjs .codex/skills/debug-responsive-gui/scripts/state.test.mjs
```

Expected: PASS. Existing React inspector and state parser tests continue passing, and Redux inspector tests pass.

- [ ] **Step 3: Confirm no accidental local-only Redux assumptions**

Run:

```bash
rg -n -e '__REDUX_DEVTOOLS_EXTENSION__|getFiberRoots|dispatch\\(|subscribe\\(' .codex/skills/debug-responsive-gui/scripts/inspect-redux.mjs .codex/skills/debug-responsive-gui/scripts/lib/inspect-redux-page.mjs
```

Expected: no matches. The Redux inspector must not depend on Redux DevTools roots and must not mutate or subscribe to the store.

## Task 6: Run Real GUI Smoke Verification

**Files:**
- Verify: `.codex/skills/debug-responsive-gui/scripts/inspect-redux.mjs`

- [ ] **Step 1: Ensure the GUI is open in the debug browser**

Use the existing `debug-responsive-gui` workflow with a fresh `launch_gui` URL. Prefer VPN, then LAN, then Local according to `SKILL.md`.

Expected: `debug-responsive-gui.mjs` exits 0 and reports `codexGui: true`.

- [ ] **Step 2: Read the default Redux summary**

Run:

```bash
node .codex/skills/debug-responsive-gui/scripts/inspect-redux.mjs
```

Expected: JSON with:

```json
{
  "ok": true,
  "state": {
    "topKeys": ["threadIdentity", "threadRuntime", "transcriptState"]
  }
}
```

The exact counts may vary with the active thread.

- [ ] **Step 3: Read a primitive path**

Run:

```bash
node .codex/skills/debug-responsive-gui/scripts/inspect-redux.mjs --path threadIdentity.attachStatus
```

Expected: JSON with `ok: true`, `path.found: true`, and `path.value` equal to a string such as `attached`.

- [ ] **Step 4: Read a bounded large path**

Run:

```bash
node .codex/skills/debug-responsive-gui/scripts/inspect-redux.mjs --path transcriptState.entriesById --max-depth 2 --max-keys 5
```

Expected: JSON with `ok: true`, `path.found: true`, and a bounded `path.value` that may include `__truncated`.

- [ ] **Step 5: Verify missing path failure is structured**

Run:

```bash
node .codex/skills/debug-responsive-gui/scripts/inspect-redux.mjs --path transcriptState.__missing__
```

Expected: exit non-zero with JSON containing `ok: false` and an error with `code: "path_not_found"`.

## Task 7: Final Diff Review

**Files:**
- Review: `.codex/skills/debug-responsive-gui/scripts/inspect-redux.mjs`
- Review: `.codex/skills/debug-responsive-gui/scripts/lib/inspect-redux-page.mjs`
- Review: `.codex/skills/debug-responsive-gui/scripts/inspect-redux.test.mjs`
- Review: `.codex/skills/debug-responsive-gui/SKILL.md`
- Review: `docs/superpowers/plans/2026-06-29-debug-responsive-gui-redux-inspector.md`

- [ ] **Step 1: Inspect the diff**

Run:

```bash
git diff -- .codex/skills/debug-responsive-gui docs/superpowers/plans/2026-06-29-debug-responsive-gui-redux-inspector.md
```

Expected: diff only contains Redux inspector implementation, tests, skill docs, and this plan.

- [ ] **Step 2: Inspect worktree status**

Run:

```bash
git status --short
```

Expected: only intentional files are modified or untracked. Do not stage or commit unless the user explicitly asks.
