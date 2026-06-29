#!/usr/bin/env node

const DEFAULT_LIMITS = {
  maxArrayItems: 10,
  maxDepth: 2,
  maxKeys: 20,
  maxStringLength: 200,
};

const HARD_LIMITS = {
  maxArrayItems: 100,
  maxDepth: 8,
  maxKeys: 100,
  maxStringLength: 2000,
};

const FIBER_SEARCH_LIMIT = 10000;
const SUMMARY_KEY_PREVIEW_LIMIT = 10;
const METADATA_STRING_LIMIT = 200;
const KNOWN_SLICE_KEYS = [
  'threadIdentity',
  'threadRuntime',
  'transcriptState',
];

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
      parsed.maxArrayItems = readNonNegativeInteger(
        args,
        index,
        '--max-array-items',
      );
      index += 1;
    } else if (arg === '--max-string-length') {
      parsed.maxStringLength = readNonNegativeInteger(
        args,
        index,
        '--max-string-length',
      );
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

function clampLimit(value, fallback, hardLimit) {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(0, Math.min(value, hardLimit));
}

function clampLimits(options = {}) {
  return {
    maxArrayItems: clampLimit(
      options.maxArrayItems ?? DEFAULT_LIMITS.maxArrayItems,
      DEFAULT_LIMITS.maxArrayItems,
      HARD_LIMITS.maxArrayItems,
    ),
    maxDepth: clampLimit(
      options.maxDepth ?? DEFAULT_LIMITS.maxDepth,
      DEFAULT_LIMITS.maxDepth,
      HARD_LIMITS.maxDepth,
    ),
    maxKeys: clampLimit(
      options.maxKeys ?? DEFAULT_LIMITS.maxKeys,
      DEFAULT_LIMITS.maxKeys,
      HARD_LIMITS.maxKeys,
    ),
    maxStringLength: clampLimit(
      options.maxStringLength ?? DEFAULT_LIMITS.maxStringLength,
      DEFAULT_LIMITS.maxStringLength,
      HARD_LIMITS.maxStringLength,
    ),
  };
}

function boundedString(value, limit = METADATA_STRING_LIMIT) {
  if (typeof value !== 'string') {
    return value;
  }
  const lengthLimit = clampLimit(
    limit,
    METADATA_STRING_LIMIT,
    HARD_LIMITS.maxStringLength,
  );
  if (value.length <= lengthLimit) {
    return value;
  }
  return `${value.slice(0, lengthLimit)}...`;
}

function boundedObjectKey(key, usedKeys, limit) {
  const dangerousKeys = new Set(['__proto__', 'constructor', 'prototype']);
  const baseKey = boundedString(key, limit);
  if (dangerousKeys.has(baseKey)) {
    let suffixIndex = 1;
    let resultKey = `${baseKey}#${suffixIndex}`;
    while (usedKeys.has(resultKey)) {
      suffixIndex += 1;
      resultKey = `${baseKey}#${suffixIndex}`;
    }
    usedKeys.add(resultKey);
    return resultKey;
  }

  if (!usedKeys.has(baseKey)) {
    usedKeys.add(baseKey);
    return baseKey;
  }

  let suffixIndex = 2;
  let resultKey = `${baseKey}#${suffixIndex}`;
  while (usedKeys.has(resultKey)) {
    suffixIndex += 1;
    resultKey = `${baseKey}#${suffixIndex}`;
  }
  usedKeys.add(resultKey);
  return resultKey;
}

function boundedKeys(value, limit = SUMMARY_KEY_PREVIEW_LIMIT) {
  return objectKeys(value)
    .slice(0, limit)
    .map((key) => boundedString(key));
}

function sliceMetadata(slice) {
  const keyCount = countObjectKeys(slice);
  const keysPreview = boundedKeys(slice);
  return {
    keyCount,
    keysPreview,
    keysTruncated: keyCount === null ? null : Math.max(0, keyCount - keysPreview.length),
    type: Array.isArray(slice) ? 'array' : typeof slice,
  };
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
    if (
      !isObject(current) ||
      !Object.prototype.hasOwnProperty.call(current, part)
    ) {
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
  return boundedString(value, limits.maxStringLength);
}

export function safeValue(value, options = {}, state = {}) {
  const limits = clampLimits({ ...DEFAULT_LIMITS, ...options });
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
    const name = String(value.displayName || value.name || 'anonymous');
    return safePrimitiveValue(`[function ${name}]`, limits);
  }

  if (typeof value === 'bigint') {
    return safePrimitiveValue(`${value.toString()}n`, limits);
  }

  if (typeof value === 'symbol') {
    return safePrimitiveValue(value.toString(), limits);
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
      result.push(
        `[truncated ${remaining} ${remaining === 1 ? 'item' : 'items'}]`,
      );
    }
    return result;
  }

  const result = {};
  const resultKeys = new Set();
  const entries = Object.entries(value).slice(0, limits.maxKeys);
  for (const [key, entryValue] of entries) {
    result[boundedObjectKey(key, resultKeys, limits.maxStringLength)] = safeValue(
      entryValue,
      limits,
      { depth: depth + 1, seen },
    );
  }
  const remaining = Object.keys(value).length - entries.length;
  if (remaining > 0) {
    result[boundedObjectKey('__truncated', resultKeys, limits.maxStringLength)] =
      `${remaining} ${remaining === 1 ? 'key' : 'keys'}`;
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
    `Unknown(${String(fiber?.tag)})`
  );
}

export function findReduxStoreFromRoot(rootFiber) {
  const queue = [{ fiber: rootFiber, depth: 0, path: '0' }];
  const seen = new Set();
  let visitedFibers = 0;

  while (queue.length > 0 && visitedFibers < FIBER_SEARCH_LIMIT) {
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
          name: boundedString(String(fiberName(fiber))),
          valueKeys: boundedKeys(value),
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
    searchLimit: FIBER_SEARCH_LIMIT,
    searchTruncated: queue.length > 0,
    visitedFibers,
  };
}

export function buildReduxSummary(state) {
  const hasThreadIdentity = Object.prototype.hasOwnProperty.call(
    state,
    'threadIdentity',
  );
  const hasThreadRuntime = Object.prototype.hasOwnProperty.call(
    state,
    'threadRuntime',
  );
  const hasTranscriptState = Object.prototype.hasOwnProperty.call(
    state,
    'transcriptState',
  );
  const threadIdentity = state.threadIdentity;
  const threadRuntime = state.threadRuntime;
  const runtimeCurrent = threadRuntime?.current ?? null;
  const transcriptState = state.transcriptState;

  const slices = {};
  const sliceKeys = new Set();
  const unknownKeys = Object.keys(state).filter(
    (key) => !KNOWN_SLICE_KEYS.includes(key),
  );
  const previewKeys = unknownKeys.slice(0, SUMMARY_KEY_PREVIEW_LIMIT);
  for (const key of previewKeys) {
    const slice = state[key];
    slices[boundedObjectKey(key, sliceKeys, METADATA_STRING_LIMIT)] =
      sliceMetadata(slice);
  }
  const remainingSlices = unknownKeys.length - previewKeys.length;
  if (remainingSlices > 0) {
    slices[boundedObjectKey('__truncated', sliceKeys, METADATA_STRING_LIMIT)] = {
      remainingSlices,
      type: 'truncated',
    };
  }

  if (hasThreadIdentity) {
    slices.threadIdentity = {
      keys: boundedKeys(threadIdentity),
      attachStatus: boundedString(threadIdentity?.attachStatus ?? null),
      launchThreadId: boundedString(threadIdentity?.launchThreadId ?? null),
      attachedThreadId: boundedString(threadIdentity?.attachedThreadId ?? null),
    };
  }

  if (hasThreadRuntime) {
    slices.threadRuntime = {
      keys: boundedKeys(threadRuntime),
      hasCurrent: Boolean(runtimeCurrent),
      activeTurnId: boundedString(runtimeCurrent?.activeTurnId ?? null),
      snapshotTurnsCount: Array.isArray(runtimeCurrent?.snapshotTurns)
        ? runtimeCurrent.snapshotTurns.length
        : null,
      eventBufferCount: Array.isArray(runtimeCurrent?.eventBuffer)
        ? runtimeCurrent.eventBuffer.length
        : null,
      subscriptionState: boundedString(
        runtimeCurrent?.subscription?.state ??
        threadRuntime?.subscription?.state ??
        null,
      ),
    };
  }

  if (hasTranscriptState) {
    slices.transcriptState = {
      keys: boundedKeys(transcriptState),
      turnIdsCount: Array.isArray(transcriptState?.turnIds)
        ? transcriptState.turnIds.length
        : null,
      turnsByIdCount: countObjectKeys(transcriptState?.turnsById),
      chunksByIdCount: countObjectKeys(transcriptState?.chunksById),
      entriesByIdCount: countObjectKeys(transcriptState?.entriesById),
      appliedEventOrderCount: Array.isArray(transcriptState?.appliedEventOrder)
        ? transcriptState.appliedEventOrder.length
        : null,
      committedScrollCommitKey: boundedString(
        transcriptState?.committedScrollCommitKey ?? null,
      ),
    };
  }

  return {
    topKeys: boundedKeys(state),
    slices,
  };
}

export function buildPageExpression(options = {}) {
  return `(() => {
    const options = ${JSON.stringify(options)};
    const DEFAULT_LIMITS = ${JSON.stringify(DEFAULT_LIMITS)};
    const HARD_LIMITS = ${JSON.stringify(HARD_LIMITS)};
    const FIBER_SEARCH_LIMIT = ${JSON.stringify(FIBER_SEARCH_LIMIT)};
    const SUMMARY_KEY_PREVIEW_LIMIT = ${JSON.stringify(SUMMARY_KEY_PREVIEW_LIMIT)};
    const METADATA_STRING_LIMIT = ${JSON.stringify(METADATA_STRING_LIMIT)};
    const KNOWN_SLICE_KEYS = ${JSON.stringify(KNOWN_SLICE_KEYS)};
    ${isObject.toString()}
    ${objectKeys.toString()}
    ${countObjectKeys.toString()}
    ${clampLimit.toString()}
    ${clampLimits.toString()}
    ${boundedString.toString()}
    ${boundedObjectKey.toString()}
    ${boundedKeys.toString()}
    ${sliceMetadata.toString()}
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
          displayNames: Array.from(contextMap.values())
            .slice(0, SUMMARY_KEY_PREVIEW_LIMIT)
            .map((context) => {
              const displayName = context?.displayName ?? null;
              return displayName === null
                ? null
                : boundedString(String(displayName));
            }),
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
      return JSON.stringify({
        ok: false,
        page: { url: boundedString(location.href), title: boundedString(document.title) },
        root: metadata.root ?? { selector: '#root', found: false, containerKey: null, rootTag: null },
        reactRedux: metadata.reactRedux ?? contextSummary(),
        counts: metadata.counts ?? { visitedFibers: 0 },
        errors: [{ code, message }],
      }, null, 2);
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
    const counts = {
      visitedFibers: found.visitedFibers,
      ...(found.searchLimit === undefined ? {} : { searchLimit: found.searchLimit }),
      ...(found.searchTruncated === undefined ? {} : { searchTruncated: found.searchTruncated }),
    };
    if (!found.store) {
      return failure('redux_store_not_found', 'Could not find React-Redux Provider store', { root, reactRedux, counts });
    }

    const state = found.store.getState();
    const result = {
      ok: true,
      page: { url: boundedString(location.href), title: boundedString(document.title) },
      root,
      reactRedux,
      counts,
      state: buildReduxSummary(state),
      errors: [],
    };

    if (options.path) {
      const selected = readStatePath(state, options.path);
      const requestedPath = boundedString(options.path);
      const missingAt = boundedString(selected.missingAt);
      result.path = {
        requested: requestedPath,
        found: selected.found,
        ...(selected.missingAt === undefined ? {} : { missingAt }),
        value: selected.found ? safeValue(selected.value, options) : '[missing]',
      };
      if (!selected.found) {
        result.ok = false;
        result.errors.push({
          code: 'path_not_found',
          message: \`Redux state path not found: \${missingAt}\`,
          missingAt,
        });
      }
    }

    return JSON.stringify(result, null, 2);
  })()`;
}
