import assert from 'node:assert/strict';
import test from 'node:test';

import { targetLayout } from './lib/window-layout.mjs';

test('uses the full visible frame below a MacBook camera housing', () => {
  const screens = [{
    i: 0,
    frame: {
      origin: { x: 0, y: 0 },
      size: { width: 1512, height: 982 },
    },
    visible: {
      origin: { x: 0, y: 0 },
      size: { width: 1512, height: 949 },
    },
  }];

  assert.deepEqual(targetLayout(screens, null), {
    reason: 'codex-screen-undetected-fallback',
    browser: { x: 0, y: 33, width: 756, height: 949 },
    devtools: { x: 756, y: 33, width: 756, height: 949 },
  });
});

test('uses the full visible frame on a top-aligned external display', () => {
  const screens = [
    {
      i: 0,
      frame: {
        origin: { x: 0, y: 0 },
        size: { width: 1512, height: 982 },
      },
      visible: {
        origin: { x: 0, y: 0 },
        size: { width: 1512, height: 949 },
      },
    },
    {
      i: 1,
      frame: {
        origin: { x: -1920, y: -98 },
        size: { width: 1920, height: 1080 },
      },
      visible: {
        origin: { x: -1920, y: -98 },
        size: { width: 1920, height: 1080 },
      },
    },
  ];

  assert.deepEqual(targetLayout(screens, { x: 0, y: 0 }), {
    reason: 'non-codex-screen-1',
    browser: { x: -1920, y: 0, width: 960, height: 1080 },
    devtools: { x: -960, y: 0, width: 960, height: 1080 },
  });
});
