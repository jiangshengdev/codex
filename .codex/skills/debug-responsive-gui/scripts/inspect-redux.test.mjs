#!/usr/bin/env node

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  buildPageExpression,
  buildReduxSummary,
  findReduxStoreFromRoot,
  parseArgs,
  readStatePath,
  safeValue,
} from './lib/inspect-redux-page.mjs';

const inspectReduxCliPath = fileURLToPath(new URL('./inspect-redux.mjs', import.meta.url));

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

describe('inspect-redux CLI exports', () => {
  it('exports parseArgs and buildPageExpression from the CLI entrypoint', async () => {
    const cli = await import('./inspect-redux.mjs');

    assert.deepEqual(cli.parseArgs(['--path', 'threadIdentity.attachStatus']), {
      maxArrayItems: 10,
      maxDepth: 2,
      maxKeys: 20,
      maxStringLength: 200,
      path: 'threadIdentity.attachStatus',
    });
    assert.equal(
      cli.buildPageExpression({ path: 'threadRuntime.current' }).includes('__reactContainer$'),
      true,
    );
  });

  it('prints invalid_argument JSON before checking for an open browser', () => {
    const result = spawnSync(process.execPath, [inspectReduxCliPath, '--unknown'], {
      encoding: 'utf8',
    });

    assert.equal(result.status, 1);
    assert.equal(result.stderr, '');
    assert.deepEqual(JSON.parse(result.stdout), {
      ok: false,
      errors: [{
        code: 'invalid_argument',
        message: 'Unknown argument: --unknown',
      }],
    });
  });

  it('bounds long invalid_argument messages without writing stderr', () => {
    const longArgument = `--${'unknown'.repeat(400)}`;
    const result = spawnSync(process.execPath, [inspectReduxCliPath, longArgument], {
      encoding: 'utf8',
    });
    const output = JSON.parse(result.stdout);

    assert.equal(result.status, 1);
    assert.equal(result.stderr, '');
    assert.equal(output.ok, false);
    assert.equal(output.errors[0].code, 'invalid_argument');
    assert.equal(output.errors[0].message.includes(longArgument), false);
    assert.equal(output.errors[0].message.length <= 2003, true);
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

  it('clamps caller-provided limits to conservative hard caps', () => {
    const value = {
      keys: Object.fromEntries(
        Array.from({ length: 150 }, (_, index) => [`key${index}`, index]),
      ),
      list: Array.from({ length: 150 }, (_, index) => index),
      label: 'x'.repeat(2500),
      nested: { level1: { level2: { level3: { level4: { level5: { level6: { level7: { level8: { level9: true } } } } } } } } },
    };

    const result = safeValue(value, {
      maxArrayItems: 1000,
      maxDepth: 1000,
      maxKeys: 1000,
      maxStringLength: 10000,
    });

    assert.equal(Object.keys(result.keys).length, 101);
    assert.equal(result.keys.__truncated, '50 keys');
    assert.equal(result.list.length, 101);
    assert.equal(result.list.at(-1), '[truncated 50 items]');
    assert.equal(result.label, `${'x'.repeat(2000)}...`);
    assert.deepEqual(result.nested, {
      level1: {
        level2: {
          level3: {
            level4: {
              level5: {
                level6: {
                  level7: '[max depth]',
                },
              },
            },
          },
        },
      },
    });
  });

  it('bounds object keys without overwriting truncated key collisions', () => {
    const firstKey = `${'first'.repeat(50)}-alpha`;
    const secondKey = `${'first'.repeat(50)}-beta`;

    assert.deepEqual(safeValue({
      [firstKey]: 1,
      [secondKey]: 2,
    }, {
      maxStringLength: 12,
    }), {
      'firstfirstfi...': 1,
      'firstfirstfi...#2': 2,
    });
  });

  it('preserves real __proto__ values as stable own output keys', () => {
    const result = safeValue(JSON.parse('{"__proto__":"user","a":1}'));

    assert.equal(Object.getPrototypeOf(result), Object.prototype);
    assert.deepEqual(result, {
      '__proto__#1': 'user',
      a: 1,
    });
  });

  it('keeps real __truncated keys when object output is truncated', () => {
    assert.deepEqual(safeValue({
      __truncated: 'real value',
      visible: true,
      hidden: false,
    }, {
      maxKeys: 2,
      maxStringLength: 20,
    }), {
      __truncated: 'real value',
      visible: true,
      '__truncated#2': '1 key',
    });
  });

  it('bounds function, bigint, and symbol string representations', () => {
    function RenderProbe() {}
    RenderProbe.displayName = `RenderProbe${'x'.repeat(80)}`;
    const longBigInt = BigInt('9'.repeat(80));
    const longSymbol = Symbol('s'.repeat(80));

    assert.equal(safeValue(RenderProbe, { maxStringLength: 12 }), '[function Re...');
    assert.equal(safeValue(longBigInt, { maxStringLength: 12 }), '999999999999...');
    assert.equal(safeValue(longSymbol, { maxStringLength: 12 }), 'Symbol(sssss...');
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

  it('bounds known codex-gui slice key lists', () => {
    const state = {
      threadIdentity: {
        launchThreadId: 'thread-1',
        attachedThreadId: 'thread-1',
        attachStatus: 'attached',
        key3: true,
        key4: true,
        key5: true,
        key6: true,
        key7: true,
        key8: true,
        key9: true,
        key10: true,
      },
    };

    const summary = buildReduxSummary(state);

    assert.equal(summary.slices.threadIdentity.keys.length, 10);
    assert.equal(summary.slices.threadIdentity.keys.includes('key10'), false);
  });

  it('bounds known slice string fields and key previews', () => {
    const longValue = 'v'.repeat(250);
    const longKey = `key-${'k'.repeat(250)}`;
    const state = {
      threadIdentity: {
        [longKey]: true,
        launchThreadId: longValue,
        attachedThreadId: longValue,
        attachStatus: longValue,
      },
      threadRuntime: {
        current: {
          activeTurnId: longValue,
          subscription: { state: longValue },
        },
      },
      transcriptState: {
        [longKey]: true,
        committedScrollCommitKey: longValue,
      },
    };

    const summary = buildReduxSummary(state);

    assert.equal(summary.slices.threadIdentity.attachStatus, `${'v'.repeat(200)}...`);
    assert.equal(summary.slices.threadIdentity.launchThreadId, `${'v'.repeat(200)}...`);
    assert.equal(summary.slices.threadIdentity.attachedThreadId, `${'v'.repeat(200)}...`);
    assert.equal(summary.slices.threadRuntime.activeTurnId, `${'v'.repeat(200)}...`);
    assert.equal(summary.slices.threadRuntime.subscriptionState, `${'v'.repeat(200)}...`);
    assert.equal(summary.slices.transcriptState.committedScrollCommitKey, `${'v'.repeat(200)}...`);
    assert.equal(summary.slices.threadIdentity.keys.includes(longKey), false);
    assert.equal(summary.slices.threadIdentity.keys.some((key) => key.length > 203), false);
    assert.equal(summary.slices.transcriptState.keys.includes(longKey), false);
    assert.equal(summary.slices.transcriptState.keys.some((key) => key.length > 203), false);
  });

  it('summarizes unknown large slices without dumping complete key lists', () => {
    const state = {
      largeUnknown: Object.fromEntries(
        Array.from({ length: 150 }, (_, index) => [`id-${index}`, { value: index }]),
      ),
    };

    assert.deepEqual(buildReduxSummary(state), {
      topKeys: ['largeUnknown'],
      slices: {
        largeUnknown: {
          keyCount: 150,
          keysPreview: [
            'id-0',
            'id-1',
            'id-2',
            'id-3',
            'id-4',
            'id-5',
            'id-6',
            'id-7',
            'id-8',
            'id-9',
          ],
          keysTruncated: 140,
          type: 'object',
        },
      },
    });
  });

  it('bounds unknown top-level slice keys in slices metadata', () => {
    const longSliceKey = `slice-${'x'.repeat(250)}`;

    const summary = buildReduxSummary({
      [longSliceKey]: { ready: true },
    });

    assert.equal(Object.hasOwn(summary.slices, longSliceKey), false);
    assert.deepEqual(Object.keys(summary.slices), [`slice-${'x'.repeat(194)}...`]);
  });

  it('preserves __proto__ top-level slice metadata under a stable replacement key', () => {
    const summary = buildReduxSummary(JSON.parse('{"__proto__":{"danger":true},"a":{"ready":true}}'));

    assert.deepEqual(Object.keys(summary.slices), ['__proto__#1', 'a']);
    assert.deepEqual(summary.slices['__proto__#1'], {
      keyCount: 1,
      keysPreview: ['danger'],
      keysTruncated: 0,
      type: 'object',
    });
    assert.equal(summary.slices.__proto__, Object.prototype);
  });

  it('keeps colliding bounded top-level slice keys from overwriting each other', () => {
    const firstKey = `${'slice'.repeat(50)}-alpha`;
    const secondKey = `${'slice'.repeat(50)}-beta`;

    const summary = buildReduxSummary({
      [firstKey]: { first: true },
      [secondKey]: { second: true },
    });

    assert.deepEqual(Object.keys(summary.slices), [
      `${'slice'.repeat(40)}...`,
      `${'slice'.repeat(40)}...#2`,
    ]);
    assert.equal(summary.slices[`${'slice'.repeat(40)}...`].keysPreview[0], 'first');
    assert.equal(summary.slices[`${'slice'.repeat(40)}...#2`].keysPreview[0], 'second');
  });

  it('bounds top-level slice metadata while preserving known slices', () => {
    const unknownSlices = Object.fromEntries(
      Array.from({ length: 150 }, (_, index) => [`unknown-${index}`, { index }]),
    );

    const summary = buildReduxSummary({
      ...unknownSlices,
      threadIdentity: {
        launchThreadId: 'thread-1',
        attachedThreadId: 'thread-1',
        attachStatus: 'attached',
      },
      threadRuntime: {
        current: {
          activeTurnId: 'turn-1',
          snapshotTurns: [],
          eventBuffer: [],
        },
      },
      transcriptState: {
        turnIds: [],
        turnsById: {},
        chunksById: {},
        entriesById: {},
        appliedEventOrder: [],
      },
    });

    assert.equal(Object.keys(summary.slices).length, 14);
    assert.equal(Object.hasOwn(summary.slices, 'unknown-0'), true);
    assert.equal(Object.hasOwn(summary.slices, 'unknown-9'), true);
    assert.equal(Object.hasOwn(summary.slices, 'unknown-10'), false);
    assert.deepEqual(summary.slices.__truncated, {
      remainingSlices: 140,
      type: 'truncated',
    });
    assert.equal(Object.hasOwn(summary.slices, 'threadIdentity'), true);
    assert.equal(Object.hasOwn(summary.slices, 'threadRuntime'), true);
    assert.equal(Object.hasOwn(summary.slices, 'transcriptState'), true);
  });

  it('keeps real __truncated top-level slices when adding truncation metadata', () => {
    const summary = buildReduxSummary({
      __truncated: { real: true },
      ...Object.fromEntries(
        Array.from({ length: 11 }, (_, index) => [`unknown-${index}`, { index }]),
      ),
    });

    assert.equal(summary.slices.__truncated.keysPreview[0], 'real');
    assert.deepEqual(summary.slices['__truncated#2'], {
      remainingSlices: 2,
      type: 'truncated',
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

  it('includes structured missingAt metadata for missing paths', () => {
    const store = { getState: () => ({ threadRuntime: { current: {} } }) };
    const provider = fiber({
      tag: 10,
      type: { displayName: 'ReactRedux' },
      memoizedProps: {
        value: { store },
      },
    });
    const rootFiber = fiber({ tag: 3, child: provider });
    const rootElement = {
      __reactContainer$test: { current: rootFiber },
    };
    const originalDocument = globalThis.document;
    const originalLocation = globalThis.location;

    globalThis.document = {
      querySelector: (selector) => selector === '#root' ? rootElement : null,
      title: 'Test Page',
    };
    globalThis.location = { href: 'http://localhost:5173/' };

    try {
      const result = JSON.parse(eval(buildPageExpression({
        path: 'threadRuntime.current.missing',
      })));

      assert.equal(result.ok, false);
      assert.deepEqual(result.path, {
        requested: 'threadRuntime.current.missing',
        found: false,
        missingAt: 'threadRuntime.current.missing',
        value: '[missing]',
      });
      assert.deepEqual(result.errors, [{
        code: 'path_not_found',
        message: 'Redux state path not found: threadRuntime.current.missing',
        missingAt: 'threadRuntime.current.missing',
      }]);
    } finally {
      globalThis.document = originalDocument;
      globalThis.location = originalLocation;
    }
  });

  it('bounds missing path requested, missingAt, and error message metadata', () => {
    const longPart = 'p'.repeat(250);
    const requestedPath = `threadRuntime.current.${longPart}`;
    const store = { getState: () => ({ threadRuntime: { current: {} } }) };
    const provider = fiber({
      tag: 10,
      type: { displayName: 'ReactRedux' },
      memoizedProps: {
        value: { store },
      },
    });
    const rootFiber = fiber({ tag: 3, child: provider });
    const rootElement = {
      __reactContainer$test: { current: rootFiber },
    };
    const originalDocument = globalThis.document;
    const originalLocation = globalThis.location;

    globalThis.document = {
      querySelector: (selector) => selector === '#root' ? rootElement : null,
      title: 'Test Page',
    };
    globalThis.location = { href: 'http://localhost:5173/' };

    try {
      const result = JSON.parse(eval(buildPageExpression({
        path: requestedPath,
      })));

      assert.equal(result.ok, false);
      assert.equal(result.path.requested, `threadRuntime.current.${'p'.repeat(178)}...`);
      assert.equal(result.path.missingAt, `threadRuntime.current.${'p'.repeat(178)}...`);
      assert.equal(result.errors[0].missingAt, `threadRuntime.current.${'p'.repeat(178)}...`);
      assert.equal(
        result.errors[0].message,
        `Redux state path not found: threadRuntime.current.${'p'.repeat(178)}...`,
      );
      assert.equal(result.path.requested.includes(longPart), false);
      assert.equal(result.errors[0].message.includes(longPart), false);
    } finally {
      globalThis.document = originalDocument;
      globalThis.location = originalLocation;
    }
  });

  it('bounds React-Redux provider and context metadata in page expression output', () => {
    const store = { getState: () => ({ threadIdentity: { attachStatus: 'attached' } }) };
    const longValueKey = `provider-${'k'.repeat(250)}`;
    const provider = fiber({
      tag: 10,
      type: { displayName: 'ReactRedux' },
      memoizedProps: {
        value: {
          store,
          ...Object.fromEntries(
            Array.from({ length: 149 }, (_, index) => [
              index === 0 ? longValueKey : `value-${index}`,
              true,
            ]),
          ),
        },
      },
    });
    const rootFiber = fiber({ tag: 3, child: provider });
    const rootElement = {
      __reactContainer$test: { current: rootFiber },
    };
    const originalDocument = globalThis.document;
    const originalLocation = globalThis.location;
    const contextKey = Symbol.for('react-redux-context');
    const hadContext = Object.prototype.hasOwnProperty.call(globalThis, contextKey);
    const originalContext = globalThis[contextKey];

    globalThis.document = {
      querySelector: (selector) => selector === '#root' ? rootElement : null,
      title: 'Test Page',
    };
    globalThis.location = { href: 'http://localhost:5173/' };
    globalThis[contextKey] = new Map(
      Array.from({ length: 150 }, (_, index) => [
        `context-${index}`,
        { displayName: `Context${index}-${'d'.repeat(250)}` },
      ]),
    );

    try {
      const result = JSON.parse(eval(buildPageExpression()));

      assert.equal(result.ok, true);
      assert.equal(result.reactRedux.provider.valueKeys.length, 10);
      assert.equal(result.reactRedux.provider.valueKeys.includes('value-148'), false);
      assert.equal(result.reactRedux.provider.valueKeys.some((key) => key.length > 203), false);
      assert.equal(result.reactRedux.provider.valueKeys.includes(longValueKey), false);
      assert.equal(result.reactRedux.displayNames.length, 10);
      assert.equal(result.reactRedux.displayNames.includes('Context149'), false);
      assert.equal(result.reactRedux.displayNames.some((name) => name.length > 203), false);
    } finally {
      globalThis.document = originalDocument;
      globalThis.location = originalLocation;
      if (hadContext) {
        globalThis[contextKey] = originalContext;
      } else {
        delete globalThis[contextKey];
      }
    }
  });

  it('bounds page url and title metadata for success and failure output', () => {
    const longUrl = `http://localhost:5173/${'u'.repeat(250)}`;
    const longTitle = `Title ${'t'.repeat(250)}`;
    const originalDocument = globalThis.document;
    const originalLocation = globalThis.location;

    try {
      globalThis.document = {
        querySelector: () => null,
        title: longTitle,
      };
      globalThis.location = { href: longUrl };

      const failure = JSON.parse(eval(buildPageExpression()));

      assert.equal(failure.ok, false);
      assert.equal(failure.page.url, `http://localhost:5173/${'u'.repeat(178)}...`);
      assert.equal(failure.page.title, `Title ${'t'.repeat(194)}...`);
      assert.equal(failure.page.url.includes('u'.repeat(250)), false);
      assert.equal(failure.page.title.includes('t'.repeat(250)), false);

      const store = { getState: () => ({ threadIdentity: { attachStatus: 'attached' } }) };
      const provider = fiber({
        tag: 10,
        type: { displayName: 'ReactRedux' },
        memoizedProps: {
          value: { store },
        },
      });
      const rootFiber = fiber({ tag: 3, child: provider });
      const rootElement = {
        __reactContainer$test: { current: rootFiber },
      };

      globalThis.document = {
        querySelector: (selector) => selector === '#root' ? rootElement : null,
        title: longTitle,
      };

      const success = JSON.parse(eval(buildPageExpression()));

      assert.equal(success.ok, true);
      assert.equal(success.page.url, `http://localhost:5173/${'u'.repeat(178)}...`);
      assert.equal(success.page.title, `Title ${'t'.repeat(194)}...`);
      assert.equal(success.page.url.includes('u'.repeat(250)), false);
      assert.equal(success.page.title.includes('t'.repeat(250)), false);
    } finally {
      globalThis.document = originalDocument;
      globalThis.location = originalLocation;
    }
  });
});
