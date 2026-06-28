# React Inspector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a pure React inspector entry to `debug-responsive-gui` that reads the current Playwright-controlled page, traverses React fiber from `#root.__reactContainer$...`, and prints stable JSON.

**Architecture:** Implement one CLI script with exported pure helper functions so Node's built-in test runner can verify argument parsing, fiber summarization, tree slicing, path/component matching, and value serialization without launching a browser. The CLI path reuses the existing `evalJson()` helper from `scripts/lib/playwright-cli.mjs`, prints only JSON to stdout, and exits non-zero for structured recoverable failures.

**Tech Stack:** Node.js ESM, Node built-in `node:test`, existing `playwright-cli` wrapper, existing skill validation script.

---

## File Structure

- Create: `.codex/skills/debug-responsive-gui/scripts/inspect-react.mjs`
  - CLI entry and pure exported helpers for React inspection.
  - Imports `evalJson()` from `.codex/skills/debug-responsive-gui/scripts/lib/playwright-cli.mjs`.
  - Does not import or use `.codex/skills/debug-responsive-gui/scripts/lib/state.mjs`.
- Create: `.codex/skills/debug-responsive-gui/scripts/inspect-react.test.mjs`
  - Unit tests for pure helpers using Node's built-in test runner.
  - Does not launch a browser and does not require a live GUI.
- Modify: `.codex/skills/debug-responsive-gui/SKILL.md`
  - Add a short React inspector entry with commands, parameters, JSON output rule, and the boundary that Redux inspection should be designed separately instead of mixed into this script.

## Task 1: Add Pure Helper Tests

**Files:**
- Create: `.codex/skills/debug-responsive-gui/scripts/inspect-react.test.mjs`
- Create: `.codex/skills/debug-responsive-gui/scripts/inspect-react.mjs`

- [ ] **Step 1: Create the initial failing helper test file**

Create `.codex/skills/debug-responsive-gui/scripts/inspect-react.test.mjs` with these tests:

```javascript
#!/usr/bin/env node

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  collectTree,
  parseArgs,
  safeValue,
  summarizeFiber,
} from './inspect-react.mjs';

function fiber({ tag = 0, type = undefined, elementType = undefined, key = null, memoizedProps = {}, memoizedState = null, child = null, sibling = null } = {}) {
  return {
    tag,
    type,
    elementType,
    key,
    memoizedProps,
    memoizedState,
    child,
    sibling,
  };
}

describe('parseArgs', () => {
  it('uses safe defaults', () => {
    assert.deepEqual(parseArgs([]), {
      components: [],
      includeValues: false,
      maxDepth: 4,
      path: null,
    });
  });

  it('accepts repeated components and depth controls', () => {
    assert.deepEqual(parseArgs(['--component', 'AppShell', '--component', 'Pane', '--max-depth', '2', '--path', '0.1', '--include-values']), {
      components: ['AppShell', 'Pane'],
      includeValues: true,
      maxDepth: 2,
      path: '0.1',
    });
  });
});

describe('summarizeFiber', () => {
  it('summarizes component identity without values by default', () => {
    function AppShell() {}
    const node = fiber({
      type: AppShell,
      memoizedProps: { children: [], active: true },
      memoizedState: { count: 1 },
    });

    assert.deepEqual(summarizeFiber(node, { depth: 3, path: '0.1.0', includeValues: false }), {
      depth: 3,
      hookCount: 0,
      key: null,
      name: 'AppShell',
      path: '0.1.0',
      propsKeys: ['children', 'active'],
      stateKeys: ['count'],
      tag: 0,
      tagName: 'FunctionComponent',
    });
  });

  it('counts hook list nodes without inventing state names', () => {
    function Composer() {}
    const node = fiber({
      type: Composer,
      memoizedState: { memoizedState: 'a', next: { memoizedState: 'b', next: null } },
    });

    assert.equal(summarizeFiber(node, { depth: 0, path: '0', includeValues: false }).hookCount, 2);
    assert.deepEqual(summarizeFiber(node, { depth: 0, path: '0', includeValues: false }).stateKeys, []);
  });
});

describe('collectTree', () => {
  it('collects named component tree by depth and stable child indexes', () => {
    function App() {}
    function Shell() {}
    function Leaf() {}
    const leaf = fiber({ type: Leaf });
    const shell = fiber({ type: Shell, child: leaf });
    const app = fiber({ type: App, child: shell });

    assert.deepEqual(collectTree(app, { includeValues: false, maxDepth: 1, startPath: '0' }), [
      {
        depth: 0,
        hookCount: 0,
        key: null,
        name: 'App',
        path: '0',
        propsKeys: [],
        stateKeys: [],
        tag: 0,
        tagName: 'FunctionComponent',
        children: [
          {
            depth: 1,
            hookCount: 0,
            key: null,
            name: 'Shell',
            path: '0.0',
            propsKeys: [],
            stateKeys: [],
            tag: 0,
            tagName: 'FunctionComponent',
          },
        ],
      },
    ]);
  });
});

describe('safeValue', () => {
  it('limits nested JSON-safe values', () => {
    assert.deepEqual(safeValue({
      label: 'x'.repeat(205),
      list: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
      nested: { a: { b: { c: 1 } } },
    }), {
      label: `${'x'.repeat(200)}...`,
      list: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, '[truncated 1 item]'],
      nested: { a: { b: '[max depth]' } },
    });
  });
});
```

- [ ] **Step 2: Create a minimal TDD stub script so the test imports the intended module**

Create `.codex/skills/debug-responsive-gui/scripts/inspect-react.mjs` with only exported stubs:

```javascript
#!/usr/bin/env node

export function parseArgs() {
  return {};
}

export function summarizeFiber() {
  return {};
}

export function collectTree() {
  return [];
}

export function safeValue(value) {
  return value;
}
```

- [ ] **Step 3: Run the helper tests and verify they fail for missing behavior**

Run:

```bash
node --test .codex/skills/debug-responsive-gui/scripts/inspect-react.test.mjs
```

Expected: FAIL. At least `parseArgs uses safe defaults` fails because the temporary TDD stub returns `{}`.

## Task 2: Implement React Inspector Core

**Files:**
- Modify: `.codex/skills/debug-responsive-gui/scripts/inspect-react.mjs`
- Test: `.codex/skills/debug-responsive-gui/scripts/inspect-react.test.mjs`

- [ ] **Step 1: Implement argument parsing, tag names, name resolution, hook counting, safe value serialization, and tree collection**

Replace `.codex/skills/debug-responsive-gui/scripts/inspect-react.mjs` with a complete implementation that follows this structure:

```javascript
#!/usr/bin/env node

const DEFAULT_MAX_DEPTH = 4;

const FIBER_TAG_NAMES = new Map([
  [0, 'FunctionComponent'],
  [1, 'ClassComponent'],
  [2, 'IndeterminateComponent'],
  [3, 'HostRoot'],
  [4, 'HostPortal'],
  [5, 'HostComponent'],
  [6, 'HostText'],
  [7, 'Fragment'],
  [8, 'Mode'],
  [9, 'ContextConsumer'],
  [10, 'ContextProvider'],
  [11, 'ForwardRef'],
  [12, 'Profiler'],
  [13, 'SuspenseComponent'],
  [14, 'MemoComponent'],
  [15, 'SimpleMemoComponent'],
  [16, 'LazyComponent'],
  [17, 'IncompleteClassComponent'],
  [18, 'DehydratedFragment'],
  [19, 'SuspenseListComponent'],
  [20, 'ScopeComponent'],
  [21, 'OffscreenComponent'],
  [22, 'LegacyHiddenComponent'],
  [23, 'CacheComponent'],
  [24, 'TracingMarkerComponent'],
]);

export function parseArgs(args) {
  const parsed = {
    components: [],
    includeValues: false,
    maxDepth: DEFAULT_MAX_DEPTH,
    path: null,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--component') {
      const value = args[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error('--component requires a value');
      }
      parsed.components.push(value);
      index += 1;
    } else if (arg === '--max-depth') {
      const value = Number(args[index + 1]);
      if (!Number.isInteger(value) || value < 0) {
        throw new Error('--max-depth requires a non-negative integer');
      }
      parsed.maxDepth = value;
      index += 1;
    } else if (arg === '--path') {
      const value = args[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error('--path requires a value');
      }
      parsed.path = value;
      index += 1;
    } else if (arg === '--include-values') {
      parsed.includeValues = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return parsed;
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype;
}

function objectKeys(value) {
  return isPlainObject(value) ? Object.keys(value) : [];
}

function isHookList(value) {
  return isPlainObject(value) && Object.hasOwn(value, 'memoizedState') && Object.hasOwn(value, 'next');
}

function countHooks(value) {
  if (!isHookList(value)) {
    return 0;
  }

  let count = 0;
  let current = value;
  const seen = new Set();
  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current);
    count += 1;
    current = current.next;
  }
  return count;
}

function tagName(tag) {
  return FIBER_TAG_NAMES.get(tag) ?? `Unknown(${tag})`;
}

function displayNameFromType(type) {
  if (typeof type === 'string') {
    return type;
  }
  if (typeof type === 'function') {
    return type.displayName || type.name || null;
  }
  if (type && typeof type === 'object') {
    return type.displayName || type.name || null;
  }
  return null;
}

function fiberName(fiber) {
  return (
    displayNameFromType(fiber?.type) ||
    displayNameFromType(fiber?.elementType) ||
    tagName(fiber?.tag)
  );
}

export function safeValue(value, options = {}, state = {}) {
  const limits = {
    maxArrayItems: options.maxArrayItems ?? 10,
    maxDepth: options.maxDepth ?? 2,
    maxKeys: options.maxKeys ?? 20,
    maxStringLength: options.maxStringLength ?? 200,
  };
  const depth = state.depth ?? 0;
  const seen = state.seen ?? new Set();

  if (value === null || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    if (value.length <= limits.maxStringLength) {
      return value;
    }
    return `${value.slice(0, limits.maxStringLength)}...`;
  }

  if (typeof value === 'undefined') {
    return '[undefined]';
  }

  if (typeof value === 'function') {
    return `[function ${value.name || 'anonymous'}]`;
  }

  if (typeof value !== 'object') {
    return `[${typeof value}]`;
  }

  if (seen.has(value)) {
    return '[circular]';
  }

  if (depth >= limits.maxDepth) {
    return '[max depth]';
  }

  if (value.nodeType && value.nodeName) {
    return `[DOM ${value.nodeName}]`;
  }

  if (value.$$typeof) {
    return '[react element]';
  }

  seen.add(value);

  if (Array.isArray(value)) {
    const sliced = value.slice(0, limits.maxArrayItems).map((item) =>
      safeValue(item, limits, { depth: depth + 1, seen }),
    );
    if (value.length > limits.maxArrayItems) {
      sliced.push(`[truncated ${value.length - limits.maxArrayItems} item]`);
    }
    return sliced;
  }

  const result = {};
  const entries = Object.entries(value).slice(0, limits.maxKeys);
  for (const [key, entryValue] of entries) {
    result[key] = safeValue(entryValue, limits, { depth: depth + 1, seen });
  }
  const remaining = Object.keys(value).length - entries.length;
  if (remaining > 0) {
    result.__truncated = `${remaining} keys`;
  }
  return result;
}

export function summarizeFiber(fiber, { depth, includeValues, path }) {
  const hooks = countHooks(fiber?.memoizedState);
  const summary = {
    path,
    tag: fiber?.tag,
    tagName: tagName(fiber?.tag),
    name: fiberName(fiber),
    key: fiber?.key ?? null,
    depth,
    propsKeys: objectKeys(fiber?.memoizedProps),
    stateKeys: hooks > 0 ? [] : objectKeys(fiber?.memoizedState),
    hookCount: hooks,
  };

  if (includeValues) {
    summary.props = safeValue(fiber?.memoizedProps ?? null);
    summary.state = hooks > 0 ? '[hook list]' : safeValue(fiber?.memoizedState ?? null);
  }

  return summary;
}

function childFibers(fiber) {
  const children = [];
  let child = fiber?.child ?? null;
  while (child) {
    children.push(child);
    child = child.sibling ?? null;
  }
  return children;
}

export function collectTree(fiber, { includeValues, maxDepth, startPath = '0', startDepth = 0 }) {
  if (!fiber) {
    return [];
  }

  const node = summarizeFiber(fiber, {
    depth: startDepth,
    includeValues,
    path: startPath,
  });

  if (startDepth < maxDepth) {
    const children = childFibers(fiber).map((child, index) =>
      collectTree(child, {
        includeValues,
        maxDepth,
        startDepth: startDepth + 1,
        startPath: `${startPath}.${index}`,
      })[0],
    ).filter(Boolean);
    if (children.length > 0) {
      node.children = children;
    }
  }

  return [node];
}

function walkFibers(root) {
  const queue = [{ fiber: root, depth: 0, path: '0' }];
  const visited = [];
  const seen = new Set();

  while (queue.length > 0) {
    const item = queue.shift();
    if (!item?.fiber || seen.has(item.fiber)) {
      continue;
    }
    seen.add(item.fiber);
    visited.push(item);

    const children = childFibers(item.fiber);
    for (let index = 0; index < children.length; index += 1) {
      queue.push({
        depth: item.depth + 1,
        fiber: children[index],
        path: `${item.path}.${index}`,
      });
    }
  }

  return visited;
}

function matchesComponent(name, components) {
  return components.length > 0 && components.includes(name);
}

export function buildResultFromRoot(rootFiber, metadata, options) {
  const visited = walkFibers(rootFiber);
  const byPath = new Map(visited.map((item) => [item.path, item]));
  const selectedRoot = options.path ? byPath.get(options.path)?.fiber : rootFiber;

  if (options.path && !selectedRoot) {
    return {
      ok: false,
      errors: [{ code: 'path_not_found', message: `Could not find fiber path ${options.path}` }],
      reactHook: metadata.reactHook,
      root: metadata.root,
      counts: { visitedFibers: visited.length },
      tree: [],
      matches: [],
    };
  }

  const matches = visited
    .filter((item) => matchesComponent(fiberName(item.fiber), options.components))
    .map((item) => ({
      ...summarizeFiber(item.fiber, {
        depth: item.depth,
        includeValues: options.includeValues,
        path: item.path,
      }),
      tree: collectTree(item.fiber, {
        includeValues: options.includeValues,
        maxDepth: options.maxDepth,
        startDepth: item.depth,
        startPath: item.path,
      }),
    }));

  return {
    ok: true,
    errors: [],
    reactHook: metadata.reactHook,
    root: metadata.root,
    counts: { visitedFibers: visited.length },
    tree: collectTree(selectedRoot, {
      includeValues: options.includeValues,
      maxDepth: options.maxDepth,
      startDepth: options.path ? byPath.get(options.path).depth : 0,
      startPath: options.path ?? '0',
    }),
    matches,
  };
}
```

- [ ] **Step 2: Run helper tests and verify they pass**

Run:

```bash
node --test .codex/skills/debug-responsive-gui/scripts/inspect-react.test.mjs
```

Expected: PASS.

- [ ] **Step 3: Run syntax checks**

Run:

```bash
node --check .codex/skills/debug-responsive-gui/scripts/inspect-react.mjs
node --check .codex/skills/debug-responsive-gui/scripts/inspect-react.test.mjs
```

Expected: both commands exit 0.

## Task 3: Wire Browser Evaluation and Structured Errors

**Files:**
- Modify: `.codex/skills/debug-responsive-gui/scripts/inspect-react.mjs`
- Test: `.codex/skills/debug-responsive-gui/scripts/inspect-react.test.mjs`

- [ ] **Step 1: Add the CLI wrapper and a single self-contained page expression**

In `.codex/skills/debug-responsive-gui/scripts/inspect-react.mjs`, make the CLI build one expression string that:

- Computes `reactHook`.
- Finds `#root`.
- Finds `__reactContainer$...`.
- Gets `rootFiber`.
- Defines page-local copies of `tagName`, `fiberName`, `safeValue`, `summarizeFiber`, `collectTree`, and traversal helpers.
- Calls `buildResultFromRoot(rootFiber, metadata, options)`.
- Returns `JSON.stringify(result)`.

The expression must receive `options` through `JSON.stringify(options)` so no shell quoting is needed.

- [ ] **Step 2: Preserve structured JSON for all recoverable failures**

Ensure these failure cases return stdout JSON and a non-zero exit:

```json
{ "ok": false, "errors": [{ "code": "root_element_not_found" }] }
{ "ok": false, "errors": [{ "code": "react_root_not_found" }] }
{ "ok": false, "errors": [{ "code": "react_fiber_not_found" }] }
{ "ok": false, "errors": [{ "code": "path_not_found" }] }
{ "ok": false, "errors": [{ "code": "invalid_args" }] }
```

- [ ] **Step 3: Run helper tests again**

Run:

```bash
node --test .codex/skills/debug-responsive-gui/scripts/inspect-react.test.mjs
```

Expected: PASS.

## Task 4: Document the React Inspector Entry

**Files:**
- Modify: `.codex/skills/debug-responsive-gui/SKILL.md`

- [ ] **Step 1: Add a short React inspector section after the existing automation script entry**

Add this section after the stable `debug-responsive-gui.mjs` usage block:

```markdown
## React inspector

读取当前 `playwright-cli` 控制页面的 React fiber tree 时，使用：

```bash
node .codex/skills/debug-responsive-gui/scripts/inspect-react.mjs
node .codex/skills/debug-responsive-gui/scripts/inspect-react.mjs --max-depth 4
node .codex/skills/debug-responsive-gui/scripts/inspect-react.mjs --component AppShell --max-depth 4
node .codex/skills/debug-responsive-gui/scripts/inspect-react.mjs --path 0.1.3 --max-depth 4
node .codex/skills/debug-responsive-gui/scripts/inspect-react.mjs --component AppShell --include-values
```

该脚本只检查当前已打开页面，不启动、不导航、不关闭浏览器；stdout 只输出 JSON。默认做通用浅层发现，不内置 codex-gui 组件名；需要继续深入时使用 `--component`、`--path` 和 `--max-depth` 再次调用。当前脚本只负责 React inspection；Redux inspection 后续独立设计，不混入这个入口。
```

- [ ] **Step 2: Validate the skill metadata**

Run:

```bash
python3 /Users/jiangsheng/.codex/skills/.system/skill-creator/scripts/quick_validate.py .codex/skills/debug-responsive-gui
```

Expected: validation exits 0.

## Task 5: Runtime Verification

**Files:**
- Verify: `.codex/skills/debug-responsive-gui/scripts/inspect-react.mjs`
- Verify: `.codex/skills/debug-responsive-gui/SKILL.md`

- [ ] **Step 1: Run all `.mjs` syntax checks for the skill**

Run:

```bash
find .codex/skills/debug-responsive-gui/scripts -name '*.mjs' -print0 | xargs -0 -n1 node --check
```

Expected: all files exit 0.

- [ ] **Step 2: Run the unit tests**

Run:

```bash
node --test .codex/skills/debug-responsive-gui/scripts/inspect-react.test.mjs
```

Expected: PASS.

- [ ] **Step 3: Run the inspector against the current browser page**

Run:

```bash
node .codex/skills/debug-responsive-gui/scripts/inspect-react.mjs --max-depth 4
```

Expected when a React GUI page is open: stdout is JSON with `ok: true`, a `reactHook` object, non-null `root.containerKey`, `counts.visitedFibers` greater than `0`, and `tree` containing React node summaries.

Expected when no compatible page is open: stdout is JSON with `ok: false`, `errors[0].code` describing the missing page/root condition, and the process exits non-zero. Do not open or navigate a browser from this script to make the command pass.

- [ ] **Step 4: Run a focused depth check if a component name is visible in the previous tree**

Run with a component name observed in Step 3:

```bash
node .codex/skills/debug-responsive-gui/scripts/inspect-react.mjs --component AppShell --max-depth 2
```

Expected: stdout is JSON. If the component exists, `matches` contains at least one entry whose `name` is `AppShell`; if it does not exist on the current page, `matches` is an empty array and `ok` remains `true`.

## Task 6: Review and Commit

**Files:**
- Review: `.codex/skills/debug-responsive-gui/scripts/inspect-react.mjs`
- Review: `.codex/skills/debug-responsive-gui/scripts/inspect-react.test.mjs`
- Review: `.codex/skills/debug-responsive-gui/SKILL.md`
- Review: `docs/superpowers/specs/2026-06-28-debug-responsive-gui-react-inspector-design.md`
- Review: `docs/superpowers/plans/2026-06-28-debug-responsive-gui-react-inspector.md`

- [ ] **Step 1: Check the exact changed files**

Run:

```bash
git status --short
```

Expected: changes are limited to the design doc, this plan doc, `inspect-react.mjs`, `inspect-react.test.mjs`, and `debug-responsive-gui/SKILL.md`, unless the user intentionally added other work.

- [ ] **Step 2: Review the diff for accidental Redux implementation**

Run:

```bash
git diff -- .codex/skills/debug-responsive-gui/scripts/inspect-react.mjs .codex/skills/debug-responsive-gui/SKILL.md
```

Expected: the inspector code does not call `store.getState()`, does not use Redux DevTools globals, and keeps Redux inspection as a separate future design.

- [ ] **Step 3: Commit only after the user has accepted the plan and allowed implementation**

Run only when the user has explicitly allowed commit:

```bash
git add docs/superpowers/specs/2026-06-28-debug-responsive-gui-react-inspector-design.md docs/superpowers/plans/2026-06-28-debug-responsive-gui-react-inspector.md .codex/skills/debug-responsive-gui/scripts/inspect-react.mjs .codex/skills/debug-responsive-gui/scripts/inspect-react.test.mjs .codex/skills/debug-responsive-gui/SKILL.md
git commit -m "feat: add debug responsive React inspector"
```

Expected: one local commit. Do not push or fetch.
