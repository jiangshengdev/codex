#!/usr/bin/env node

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import vm from 'node:vm';

import * as inspectReact from './inspect-react.mjs';
import {
  buildResultFromRoot,
  buildPageExpression,
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

  it('rejects invalid arguments with useful messages', () => {
    assert.throws(() => parseArgs(['--max-depth', 'abc']), /--max-depth requires a non-negative integer/);
    assert.throws(() => parseArgs(['--component']), /--component requires a value/);
    assert.throws(() => parseArgs(['--unknown']), /Unknown argument: --unknown/);
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

describe('buildResultFromRoot', () => {
  it('builds a path slice using maxDepth relative to the selected subtree', () => {
    function App() {}
    function A() {}
    function B() {}
    function C() {}
    const c = fiber({ type: C });
    const b = fiber({ type: B, child: c });
    const a = fiber({ type: A, child: b });
    const app = fiber({ type: App, child: a });

    const result = buildResultFromRoot(app, {}, {
      components: [],
      includeValues: false,
      maxDepth: 1,
      path: '0.0.0',
    });

    assert.equal(result.ok, true);
    assert.equal(result.tree[0].name, 'B');
    assert.equal(result.tree[0].depth, 2);
    assert.equal(result.tree[0].path, '0.0.0');
    assert.equal(result.tree[0].children[0].name, 'C');
    assert.equal(result.tree[0].children[0].depth, 3);
    assert.equal(result.tree[0].children[0].path, '0.0.0.0');
  });

  it('reports path_not_found for an invalid path', () => {
    function App() {}
    const app = fiber({ type: App });

    const result = buildResultFromRoot(app, {}, {
      components: [],
      includeValues: false,
      maxDepth: 2,
      path: '9.9',
    });

    assert.equal(result.ok, false);
    assert.equal(result.errors[0].code, 'path_not_found');
    assert.equal(result.counts.visitedFibers > 0, true);
    assert.deepEqual(result.tree, []);
    assert.deepEqual(result.matches, []);
  });

  it('includes component matches with their own tree slices', () => {
    function App() {}
    function Shell() {}
    function Leaf() {}
    const leaf = fiber({ type: Leaf });
    const shell = fiber({ type: Shell, child: leaf });
    const app = fiber({ type: App, child: shell });

    const result = buildResultFromRoot(app, {}, {
      components: ['Shell'],
      includeValues: false,
      maxDepth: 2,
      path: null,
    });

    assert.equal(result.ok, true);
    assert.equal(result.matches.length > 0, true);
    assert.equal(result.matches[0].name, 'Shell');
    assert.equal(result.matches[0].path, '0.0');
    assert.equal(result.matches[0].tree[0].path, '0.0');
  });

  it('stops fiber traversal at the configured hard limit', () => {
    function App() {}
    const root = fiber({ type: App });
    let current = root;
    for (let index = 0; index < 5; index += 1) {
      current.child = fiber({ type: App });
      current = current.child;
    }

    const result = buildResultFromRoot(root, {}, {
      components: [],
      includeValues: false,
      maxDepth: 5,
      maxVisitedFibers: 3,
      path: null,
    });

    assert.equal(result.ok, true);
    assert.equal(result.counts.visitedFibers, 3);
    assert.equal(result.counts.truncatedFibers, true);
  });

  it('bounds component matches independently from traversal', () => {
    function Row() {}
    const third = fiber({ type: Row });
    const second = fiber({ type: Row, sibling: third });
    const first = fiber({ type: Row, sibling: second });
    const root = fiber({ type: Row, child: first });

    const result = buildResultFromRoot(root, {}, {
      components: ['Row'],
      includeValues: false,
      maxDepth: 1,
      maxMatches: 2,
      path: null,
    });

    assert.equal(result.ok, true);
    assert.equal(result.matches.length, 2);
    assert.equal(result.counts.matchedFibers, 2);
    assert.equal(result.counts.truncatedMatches, true);
  });
});

describe('browser session failures', () => {
  it('reports a missing browser session without leaking local paths or eval details', () => {
    assert.equal(typeof inspectReact.resultForMissingBrowserSession, 'function');

    const macUserPathPrefix = ['', 'Users', ''].join('/');
    const result = inspectReact.resultForMissingBrowserSession();
    const text = JSON.stringify(result);

    assert.deepEqual(result, {
      ok: false,
      errors: [
        {
          code: 'browser_not_open',
          message: 'No playwright-cli browser session is open.',
        },
      ],
      reactHook: null,
      root: null,
      counts: { visitedFibers: 0 },
      tree: [],
      matches: [],
    });
    assert.equal(text.includes(macUserPathPrefix), false);
    assert.equal(text.includes('inspectReactPage'), false);
    assert.equal(text.includes('at '), false);
  });

  it('reports browser eval errors with a short sanitized message', () => {
    assert.equal(typeof inspectReact.resultForBrowserEvalError, 'function');

    const macLikeUserPath = ['', 'Users', 'example', 'cnb', 'codex', '.codex', 'skills', 'debug-responsive-gui', 'scripts', 'lib', 'playwright-cli.mjs'].join('/');
    const macUserPathPrefix = ['', 'Users', ''].join('/');
    const result = inspectReact.resultForBrowserEvalError(new Error(`Browser 'default' is not open
Expression: (function inspectReactPage() { return window.__REACT_DEVTOOLS_GLOBAL_HOOK__; })()
    at evalJson (${macLikeUserPath}:18:15)`));
    const text = JSON.stringify(result);

    assert.equal(result.ok, false);
    assert.equal(result.errors[0].code, 'browser_not_open');
    assert.equal(result.errors[0].message, 'No playwright-cli browser session is open.');
    assert.equal(text.includes(macUserPathPrefix), false);
    assert.equal(text.includes('inspectReactPage'), false);
    assert.equal(text.includes('Expression:'), false);
    assert.equal(text.includes('at evalJson'), false);
  });
});

function runPageExpression(options, { rootElement, reactHook } = {}) {
  const context = vm.createContext({
    document: {
      querySelector(selector) {
        assert.equal(selector, '#root');
        return rootElement ?? null;
      },
    },
    window: {
      __REACT_DEVTOOLS_GLOBAL_HOOK__: reactHook,
    },
  });
  const script = new vm.Script(buildPageExpression(options));
  return script.runInContext(context);
}

describe('page expression', () => {
  it('reports root_element_not_found without a browser', () => {
    const result = runPageExpression(parseArgs([]));

    assert.equal(result.ok, false);
    assert.equal(result.errors[0].code, 'root_element_not_found');
    assert.equal(result.root.found, false);
    assert.equal(result.counts.visitedFibers, 0);
  });

  it('reports react_root_not_found without a browser', () => {
    const result = runPageExpression(parseArgs([]), { rootElement: {} });

    assert.equal(result.ok, false);
    assert.equal(result.errors[0].code, 'react_root_not_found');
    assert.equal(result.root.found, true);
    assert.equal(result.root.containerKey, null);
  });

  it('reports react_fiber_not_found without a browser', () => {
    const rootElement = { '__reactContainer$test': null };

    const result = runPageExpression(parseArgs([]), { rootElement });

    assert.equal(result.ok, false);
    assert.equal(result.errors[0].code, 'react_fiber_not_found');
    assert.equal(result.root.containerKey, '__reactContainer$test');
  });

  it('returns bounded tree and matches from a fake React fiber root', () => {
    function App() {}
    function Pane() {}
    function Leaf() {}
    const leaf = fiber({ type: Leaf });
    const pane = fiber({ type: Pane, child: leaf });
    const app = fiber({ type: App, child: pane });
    const rootElement = { '__reactContainer$test': app };

    const result = runPageExpression({
      components: ['Pane'],
      includeValues: false,
      maxDepth: 1,
      path: '0.0',
    }, {
      reactHook: { renderers: { 1: {} }, supportsFiber: true },
      rootElement,
    });

    assert.equal(result.ok, true);
    assert.equal(result.reactHook.present, true);
    assert.equal(result.reactHook.rendererCount, 1);
    assert.equal(result.reactHook.supportsFiber, true);
    assert.equal(result.tree[0].name, 'Pane');
    assert.equal(result.tree[0].depth, 1);
    assert.equal(result.tree[0].children[0].name, 'Leaf');
    assert.equal(result.tree[0].children[0].depth, 2);
    assert.equal(result.matches.length, 1);
    assert.equal(result.matches[0].name, 'Pane');
  });
});

describe('runInspectReact', () => {
  it('does not evaluate the page expression when no browser session exists', async () => {
    assert.equal(typeof inspectReact.runInspectReact, 'function');
    let evalCalled = false;

    const result = await inspectReact.runInspectReact({
      args: ['--max-depth', '2'],
      currentBrowserFn: () => null,
      evalJsonFn: () => {
        evalCalled = true;
        return { ok: true };
      },
    });

    assert.equal(evalCalled, false);
    assert.equal(result.exitCode, 1);
    assert.equal(result.result.ok, false);
    assert.equal(result.result.errors[0].code, 'browser_not_open');
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
