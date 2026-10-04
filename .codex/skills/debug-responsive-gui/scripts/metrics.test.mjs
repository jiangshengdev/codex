#!/usr/bin/env node

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import vm from 'node:vm';

import {
  isCodexGui,
  metricsExpression,
  summarizeMetrics,
} from './lib/metrics.mjs';

function guiMetrics(overrides = {}) {
  return {
    url: 'http://127.0.0.1:61823/task/thread-id#token=secret',
    title: 'Current task · Codex',
    rootRendered: true,
    ...overrides,
  };
}

function evaluateMetricsExpression(root) {
  const document = {
    body: { clientWidth: 390 },
    documentElement: { clientWidth: 390 },
    title: 'Current task · Codex',
    querySelector(selector) {
      if (selector === '#root') {
        return root;
      }
      if (selector === 'meta[name=viewport]') {
        return { getAttribute: () => 'width=device-width, initial-scale=1.0' };
      }
      return null;
    },
  };

  return JSON.parse(vm.runInNewContext(metricsExpression, {
    devicePixelRatio: 2,
    document,
    innerHeight: 844,
    innerWidth: 390,
    location: { href: 'http://127.0.0.1:61823/task/thread-id#token=secret' },
    navigator: { maxTouchPoints: 5, userAgent: 'Mobile' },
    outerHeight: 900,
    outerWidth: 430,
    visualViewport: null,
  }));
}

describe('isCodexGui', () => {
  it('accepts rendered GUI titles that are dynamic, localized, or not updated yet', () => {
    for (const title of ['Current task · Codex', '当前任务 · Codex', 'Codex']) {
      assert.equal(isCodexGui(guiMetrics({ title })), true);
    }
  });

  it('rejects an empty shell, the old static title, an unrelated title, and a missing URL', () => {
    for (const metrics of [
      guiMetrics({ title: 'Codex', rootRendered: false }),
      guiMetrics({ title: 'codex-gui' }),
      guiMetrics({ title: 'Example page' }),
      guiMetrics({ url: null }),
    ]) {
      assert.equal(isCodexGui(metrics), false);
    }
  });
});

describe('metricsExpression', () => {
  it('reports whether #root has an element child', () => {
    assert.equal(evaluateMetricsExpression({ childElementCount: 1 }).rootRendered, true);
    assert.equal(evaluateMetricsExpression({ childElementCount: 0 }).rootRendered, false);
  });
});

describe('summarizeMetrics', () => {
  it('preserves rootRendered in the diagnostic summary', () => {
    assert.deepEqual(summarizeMetrics({
      bodyClientWidth: 390,
      documentElementClientWidth: 390,
      dpr: 2,
      innerHeight: 844,
      innerWidth: 390,
      maxTouchPoints: 5,
      outerHeight: 900,
      outerWidth: 430,
      rootRendered: true,
      title: '当前任务 · Codex',
      ua: 'Mobile',
      url: 'http://127.0.0.1:61823/task/thread-id#token=secret',
    }), {
      bodyClientWidth: 390,
      documentElementClientWidth: 390,
      dpr: 2,
      innerHeight: 844,
      innerWidth: 390,
      maxTouchPoints: 5,
      outerHeight: 900,
      outerWidth: 430,
      responsiveLike: true,
      rootRendered: true,
      title: '当前任务 · Codex',
      url: 'http://127.0.0.1:61823/task/thread-id#token=secret',
    });
  });
});
