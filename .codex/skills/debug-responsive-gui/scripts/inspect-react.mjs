#!/usr/bin/env node

import { fileURLToPath } from 'node:url';

import { currentBrowser, evalJson } from './lib/playwright-cli.mjs';

const DEFAULT_MAX_DEPTH = 4;
export const DEFAULT_MAX_VISITED_FIBERS = 2000;
export const DEFAULT_MAX_MATCHES = 50;

export const FIBER_TAG_NAMES = new Map([
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

export function parseArgs(args = []) {
  const parsed = {
    components: [],
    includeValues: false,
    maxDepth: DEFAULT_MAX_DEPTH,
    path: null,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--component') {
      const value = readOptionValue(args, index, '--component');
      parsed.components.push(value);
      index += 1;
    } else if (arg === '--max-depth') {
      const value = readOptionValue(args, index, '--max-depth');
      if (!/^\d+$/.test(value)) {
        throw new Error('--max-depth requires a non-negative integer');
      }
      parsed.maxDepth = Number(value);
      index += 1;
    } else if (arg === '--path') {
      parsed.path = readOptionValue(args, index, '--path');
      index += 1;
    } else if (arg === '--include-values') {
      parsed.includeValues = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return parsed;
}

function readOptionValue(args, index, name) {
  const value = args[index + 1];
  if (value === undefined || value === '' || value.startsWith('--')) {
    throw new Error(`${name} requires a value`);
  }
  return value;
}

function isObject(value) {
  return value !== null && typeof value === 'object';
}

function isPlainObject(value) {
  if (!isObject(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function objectKeys(value) {
  return isPlainObject(value) ? Object.keys(value) : [];
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function isHookList(value) {
  return isObject(value) && hasOwn(value, 'memoizedState') && hasOwn(value, 'next');
}

function countHooks(value) {
  if (!isHookList(value)) {
    return 0;
  }

  let count = 0;
  let current = value;
  const seen = new Set();

  while (isObject(current) && !seen.has(current)) {
    seen.add(current);
    count += 1;
    current = current.next;
  }

  return count;
}

function tagName(tag) {
  return FIBER_TAG_NAMES.get(tag) ?? `Unknown(${String(tag)})`;
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

  return (
    type.displayName ||
    type.name ||
    displayNameFromType(type.render) ||
    displayNameFromType(type.type) ||
    null
  );
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

  if (isDomNode(value)) {
    return `[DOM ${value.nodeName}]`;
  }

  if (isReactElement(value)) {
    return '[react element]';
  }

  if (seen.has(value)) {
    return '[circular]';
  }

  if (depth > limits.maxDepth) {
    return '[max depth]';
  }

  seen.add(value);

  let result;
  if (Array.isArray(value)) {
    result = safeArrayValue(value, limits, depth, seen);
  } else {
    result = safeObjectValue(value, limits, depth, seen);
  }

  seen.delete(value);
  return result;
}

function safePrimitiveValue(value, limits) {
  if (typeof value === 'number' && !Number.isFinite(value)) {
    return String(value);
  }

  if (typeof value === 'string' && value.length > limits.maxStringLength) {
    return `${value.slice(0, limits.maxStringLength)}...`;
  }

  return value;
}

function isDomNode(value) {
  return Boolean(value?.nodeType && value?.nodeName);
}

function isReactElement(value) {
  return Boolean(value?.$$typeof);
}

function safeArrayValue(value, limits, depth, seen) {
  const result = value
    .slice(0, limits.maxArrayItems)
    .map((item) => safeValue(item, limits, { depth: depth + 1, seen }));

  if (value.length > limits.maxArrayItems) {
    const remaining = value.length - limits.maxArrayItems;
    result.push(`[truncated ${remaining} ${remaining === 1 ? 'item' : 'items'}]`);
  }

  return result;
}

function safeObjectValue(value, limits, depth, seen) {
  const result = {};
  const entries = Object.entries(value).slice(0, limits.maxKeys);

  for (const [key, entryValue] of entries) {
    result[key] = safeValue(entryValue, limits, { depth: depth + 1, seen });
  }

  const remaining = Object.keys(value).length - entries.length;
  if (remaining > 0) {
    result.__truncated = `[truncated ${remaining} ${remaining === 1 ? 'key' : 'keys'}]`;
  }

  return result;
}

export function summarizeFiber(fiber, { depth, includeValues, path }) {
  const hookCount = countHooks(fiber?.memoizedState);
  const summary = {
    path,
    tag: fiber?.tag,
    tagName: tagName(fiber?.tag),
    name: fiberName(fiber),
    key: fiber?.key ?? null,
    depth,
    propsKeys: objectKeys(fiber?.memoizedProps),
    stateKeys: hookCount > 0 ? [] : objectKeys(fiber?.memoizedState),
    hookCount,
  };

  if (includeValues) {
    summary.props = safeValue(fiber?.memoizedProps);
    summary.state = hookCount > 0 ? '[hook list]' : safeValue(fiber?.memoizedState);
  }

  return summary;
}

function childFibers(fiber) {
  const children = [];
  const seen = new Set();
  let child = fiber?.child ?? null;

  while (child && !seen.has(child)) {
    seen.add(child);
    children.push(child);
    child = child.sibling ?? null;
  }

  return children;
}

export function collectTree(
  fiber,
  {
    includeValues,
    maxDepth = DEFAULT_MAX_DEPTH,
    relativeDepth = 0,
    startPath = '0',
    startDepth = 0,
  },
) {
  if (!fiber) {
    return [];
  }

  const node = summarizeFiber(fiber, {
    depth: startDepth,
    includeValues,
    path: startPath,
  });

  if (relativeDepth < maxDepth) {
    const children = childFibers(fiber)
      .flatMap((child, index) =>
        collectTree(child, {
          includeValues,
          maxDepth,
          relativeDepth: relativeDepth + 1,
          startDepth: startDepth + 1,
          startPath: `${startPath}.${index}`,
        }),
      );

    if (children.length > 0) {
      node.children = children;
    }
  }

  return [node];
}

function walkFibers(root, { maxVisitedFibers = DEFAULT_MAX_VISITED_FIBERS } = {}) {
  const queue = [{ depth: 0, fiber: root, path: '0' }];
  const seen = new Set();
  const visited = [];
  let truncatedFibers = false;

  while (queue.length > 0) {
    const item = queue.shift();
    if (!item?.fiber || seen.has(item.fiber)) {
      continue;
    }

    if (visited.length >= maxVisitedFibers) {
      truncatedFibers = true;
      break;
    }

    seen.add(item.fiber);
    visited.push(item);

    childFibers(item.fiber).forEach((child, index) => {
      queue.push({
        depth: item.depth + 1,
        fiber: child,
        path: `${item.path}.${index}`,
      });
    });
  }

  return { truncatedFibers, visited };
}

function componentMatches(name, components) {
  return components.length > 0 && components.includes(name);
}

export function buildResultFromRoot(rootFiber, metadata = {}, options = parseArgs([])) {
  const { truncatedFibers, visited } = walkFibers(rootFiber, {
    maxVisitedFibers: options.maxVisitedFibers,
  });
  const counts = { visitedFibers: visited.length };
  if (truncatedFibers) {
    counts.truncatedFibers = true;
  }
  const byPath = new Map(visited.map((item) => [item.path, item]));
  const selected = options.path ? byPath.get(options.path) : byPath.get('0');

  if (!selected) {
    return {
      ok: false,
      errors: [
        {
          code: 'path_not_found',
          message: `Could not find fiber path ${options.path}`,
        },
      ],
      reactHook: metadata.reactHook,
      root: metadata.root,
      counts,
      tree: [],
      matches: [],
    };
  }

  const { matches, truncatedMatches } = buildMatches(visited, options);
  counts.matchedFibers = matches.length;
  if (truncatedMatches) {
    counts.truncatedMatches = true;
  }

  return {
    ok: true,
    errors: [],
    reactHook: metadata.reactHook,
    root: metadata.root,
    counts,
    tree: collectTree(selected.fiber, {
      includeValues: options.includeValues,
      maxDepth: options.maxDepth,
      startDepth: selected.depth,
      startPath: selected.path,
    }),
    matches,
  };
}

function buildMatches(visited, options) {
  const maxMatches = options.maxMatches ?? DEFAULT_MAX_MATCHES;
  const matches = [];
  let truncatedMatches = false;

  for (const item of visited) {
    if (!componentMatches(fiberName(item.fiber), options.components)) {
      continue;
    }

    if (matches.length >= maxMatches) {
      truncatedMatches = true;
      break;
    }

    matches.push({
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
    });
  }

  return { matches, truncatedMatches };
}

export function buildPageExpression(options) {
  return `(${inspectReactPage.toString()})(${JSON.stringify(options)})`;
}

export function resultForMissingBrowserSession() {
  return {
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
  };
}

export function resultForBrowserEvalError(error) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("Browser 'default' is not open")) {
    return resultForMissingBrowserSession();
  }

  return {
    ok: false,
    errors: [
      {
        code: 'browser_eval_failed',
        message: 'Browser evaluation failed.',
      },
    ],
    reactHook: null,
    root: null,
    counts: { visitedFibers: 0 },
    tree: [],
    matches: [],
  };
}

function inspectReactPage(options) {
  const DEFAULT_MAX_VISITED_FIBERS = 2000;
  const DEFAULT_MAX_MATCHES = 50;
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

  function isObject(value) {
    return value !== null && typeof value === 'object';
  }

  function isPlainObject(value) {
    if (!isObject(value)) {
      return false;
    }
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  function objectKeys(value) {
    return isPlainObject(value) ? Object.keys(value) : [];
  }

  function hasOwn(value, key) {
    return Object.prototype.hasOwnProperty.call(value, key);
  }

  function isHookList(value) {
    return isObject(value) && hasOwn(value, 'memoizedState') && hasOwn(value, 'next');
  }

  function countHooks(value) {
    if (!isHookList(value)) {
      return 0;
    }

    let count = 0;
    let current = value;
    const seen = new Set();

    while (isObject(current) && !seen.has(current)) {
      seen.add(current);
      count += 1;
      current = current.next;
    }

    return count;
  }

  function tagName(tag) {
    return FIBER_TAG_NAMES.get(tag) ?? `Unknown(${String(tag)})`;
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

    return (
      type.displayName ||
      type.name ||
      displayNameFromType(type.render) ||
      displayNameFromType(type.type) ||
      null
    );
  }

  function fiberName(fiber) {
    return (
      displayNameFromType(fiber?.type) ||
      displayNameFromType(fiber?.elementType) ||
      tagName(fiber?.tag)
    );
  }

  function safeValue(value, safeOptions = {}, state = {}) {
    const limits = {
      maxArrayItems: safeOptions.maxArrayItems ?? 10,
      maxDepth: safeOptions.maxDepth ?? 2,
      maxKeys: safeOptions.maxKeys ?? 20,
      maxStringLength: safeOptions.maxStringLength ?? 200,
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

    if (isDomNode(value)) {
      return `[DOM ${value.nodeName}]`;
    }

    if (isReactElement(value)) {
      return '[react element]';
    }

    if (seen.has(value)) {
      return '[circular]';
    }

    if (depth > limits.maxDepth) {
      return '[max depth]';
    }

    seen.add(value);

    let result;
    if (Array.isArray(value)) {
      result = safeArrayValue(value, limits, depth, seen);
    } else {
      result = safeObjectValue(value, limits, depth, seen);
    }

    seen.delete(value);
    return result;
  }

  function safePrimitiveValue(value, limits) {
    if (typeof value === 'number' && !Number.isFinite(value)) {
      return String(value);
    }

    if (typeof value === 'string' && value.length > limits.maxStringLength) {
      return `${value.slice(0, limits.maxStringLength)}...`;
    }

    return value;
  }

  function isDomNode(value) {
    return Boolean(value?.nodeType && value?.nodeName);
  }

  function isReactElement(value) {
    return Boolean(value?.$$typeof);
  }

  function safeArrayValue(value, limits, depth, seen) {
    const result = value
      .slice(0, limits.maxArrayItems)
      .map((item) => safeValue(item, limits, { depth: depth + 1, seen }));

    if (value.length > limits.maxArrayItems) {
      const remaining = value.length - limits.maxArrayItems;
      result.push(`[truncated ${remaining} ${remaining === 1 ? 'item' : 'items'}]`);
    }

    return result;
  }

  function safeObjectValue(value, limits, depth, seen) {
    const result = {};
    const entries = Object.entries(value).slice(0, limits.maxKeys);

    for (const [key, entryValue] of entries) {
      result[key] = safeValue(entryValue, limits, { depth: depth + 1, seen });
    }

    const remaining = Object.keys(value).length - entries.length;
    if (remaining > 0) {
      result.__truncated = `[truncated ${remaining} ${remaining === 1 ? 'key' : 'keys'}]`;
    }

    return result;
  }

  function summarizeFiber(fiber, { depth, includeValues, path }) {
    const hookCount = countHooks(fiber?.memoizedState);
    const summary = {
      path,
      tag: fiber?.tag,
      tagName: tagName(fiber?.tag),
      name: fiberName(fiber),
      key: fiber?.key ?? null,
      depth,
      propsKeys: objectKeys(fiber?.memoizedProps),
      stateKeys: hookCount > 0 ? [] : objectKeys(fiber?.memoizedState),
      hookCount,
    };

    if (includeValues) {
      summary.props = safeValue(fiber?.memoizedProps);
      summary.state = hookCount > 0 ? '[hook list]' : safeValue(fiber?.memoizedState);
    }

    return summary;
  }

  function childFibers(fiber) {
    const children = [];
    const seen = new Set();
    let child = fiber?.child ?? null;

    while (child && !seen.has(child)) {
      seen.add(child);
      children.push(child);
      child = child.sibling ?? null;
    }

    return children;
  }

  function collectTree(
    fiber,
    {
      includeValues,
      maxDepth = 4,
      relativeDepth = 0,
      startPath = '0',
      startDepth = 0,
    },
  ) {
    if (!fiber) {
      return [];
    }

    const node = summarizeFiber(fiber, {
      depth: startDepth,
      includeValues,
      path: startPath,
    });

    if (relativeDepth < maxDepth) {
      const children = childFibers(fiber)
        .flatMap((child, index) =>
          collectTree(child, {
            includeValues,
            maxDepth,
            relativeDepth: relativeDepth + 1,
            startDepth: startDepth + 1,
            startPath: `${startPath}.${index}`,
          }),
        );

      if (children.length > 0) {
        node.children = children;
      }
    }

    return [node];
  }

  function walkFibers(root, { maxVisitedFibers = DEFAULT_MAX_VISITED_FIBERS } = {}) {
    const queue = [{ depth: 0, fiber: root, path: '0' }];
    const seen = new Set();
    const visited = [];
    let truncatedFibers = false;

    while (queue.length > 0) {
      const item = queue.shift();
      if (!item?.fiber || seen.has(item.fiber)) {
        continue;
      }

      if (visited.length >= maxVisitedFibers) {
        truncatedFibers = true;
        break;
      }

      seen.add(item.fiber);
      visited.push(item);

      childFibers(item.fiber).forEach((child, index) => {
        queue.push({
          depth: item.depth + 1,
          fiber: child,
          path: `${item.path}.${index}`,
        });
      });
    }

    return { truncatedFibers, visited };
  }

  function componentMatches(name, components) {
    return components.length > 0 && components.includes(name);
  }

  function buildResultFromRoot(rootFiber, metadata = {}, resultOptions = {}) {
    const { truncatedFibers, visited } = walkFibers(rootFiber, {
      maxVisitedFibers: resultOptions.maxVisitedFibers,
    });
    const counts = { visitedFibers: visited.length };
    if (truncatedFibers) {
      counts.truncatedFibers = true;
    }
    const byPath = new Map(visited.map((item) => [item.path, item]));
    const selected = resultOptions.path ? byPath.get(resultOptions.path) : byPath.get('0');

    if (!selected) {
      return {
        ok: false,
        errors: [
          {
            code: 'path_not_found',
            message: `Could not find fiber path ${resultOptions.path}`,
          },
        ],
        reactHook: metadata.reactHook,
        root: metadata.root,
        counts,
        tree: [],
        matches: [],
      };
    }

    const { matches, truncatedMatches } = buildMatches(visited, resultOptions);
    counts.matchedFibers = matches.length;
    if (truncatedMatches) {
      counts.truncatedMatches = true;
    }

    return {
      ok: true,
      errors: [],
      reactHook: metadata.reactHook,
      root: metadata.root,
      counts,
      tree: collectTree(selected.fiber, {
        includeValues: resultOptions.includeValues,
        maxDepth: resultOptions.maxDepth,
        startDepth: selected.depth,
        startPath: selected.path,
      }),
      matches,
    };
  }

  function buildMatches(visited, resultOptions) {
    const maxMatches = resultOptions.maxMatches ?? DEFAULT_MAX_MATCHES;
    const matches = [];
    let truncatedMatches = false;

    for (const item of visited) {
      if (!componentMatches(fiberName(item.fiber), resultOptions.components)) {
        continue;
      }

      if (matches.length >= maxMatches) {
        truncatedMatches = true;
        break;
      }

      matches.push({
        ...summarizeFiber(item.fiber, {
          depth: item.depth,
          includeValues: resultOptions.includeValues,
          path: item.path,
        }),
        tree: collectTree(item.fiber, {
          includeValues: resultOptions.includeValues,
          maxDepth: resultOptions.maxDepth,
          startDepth: item.depth,
          startPath: item.path,
        }),
      });
    }

    return { matches, truncatedMatches };
  }

  function reactHookMetadata() {
    const hook = window.__REACT_DEVTOOLS_GLOBAL_HOOK__;
    if (!hook) {
      return { present: false, rendererCount: 0 };
    }

    const renderers = hook.renderers;
    let rendererCount = 0;
    if (renderers instanceof Map) {
      rendererCount = renderers.size;
    } else if (renderers && typeof renderers === 'object') {
      rendererCount = Object.keys(renderers).length;
    }

    return {
      present: true,
      rendererCount,
      supportsFiber: Boolean(hook.supportsFiber),
    };
  }

  function failure(code, metadata, message) {
    const error = message ? { code, message } : { code };
    return {
      ok: false,
      errors: [error],
      reactHook: metadata.reactHook,
      root: metadata.root,
      counts: { visitedFibers: 0 },
      tree: [],
      matches: [],
    };
  }

  const rootElement = document.querySelector('#root');
  const metadata = {
    reactHook: reactHookMetadata(),
    root: { selector: '#root', found: Boolean(rootElement), containerKey: null },
  };

  if (!rootElement) {
    return failure('root_element_not_found', metadata);
  }

  const containerKey = Object.getOwnPropertyNames(rootElement)
    .find((key) => key.startsWith('__reactContainer$')) ?? null;
  metadata.root.containerKey = containerKey;

  if (!containerKey) {
    return failure('react_root_not_found', metadata);
  }

  const rootFiber = rootElement[containerKey];
  if (!rootFiber) {
    return failure('react_fiber_not_found', metadata);
  }

  return buildResultFromRoot(rootFiber, metadata, options);
}

function printJson(result) {
  console.log(JSON.stringify(result, null, 2));
}

async function runCli(args) {
  const { exitCode, result } = await runInspectReact({ args });
  printJson(result);
  process.exitCode = exitCode;
}

export async function runInspectReact({
  args,
  currentBrowserFn = currentBrowser,
  evalJsonFn = evalJson,
}) {
  let options;
  try {
    options = parseArgs(args);
  } catch (error) {
    return {
      exitCode: 1,
      result: {
      ok: false,
      errors: [
        {
          code: 'invalid_args',
          message: error instanceof Error ? error.message : String(error),
        },
      ],
      },
    };
  }

  if (!currentBrowserFn()) {
    return {
      exitCode: 1,
      result: resultForMissingBrowserSession(),
    };
  }

  let result;
  try {
    result = evalJsonFn(buildPageExpression(options));
  } catch (error) {
    return {
      exitCode: 1,
      result: resultForBrowserEvalError(error),
    };
  }

  return {
    exitCode: result?.ok ? 0 : 1,
    result,
  };
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  await runCli(process.argv.slice(2));
}
