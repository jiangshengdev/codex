#!/usr/bin/env node

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import * as state from './lib/state.mjs';

describe('parseGuiHttpUrl', () => {
  it('accepts local, LAN, and VPN HTTP GUI URLs', () => {
    for (const url of [
      'http://127.0.0.1:52949/?threadId=t#token=x',
      'http://192.168.3.203:52949/?threadId=t#token=x',
      'http://100.88.28.119:52949/?threadId=t#token=x',
      'https://gui.example.test/?threadId=t#token=x',
    ]) {
      assert.equal(state.parseGuiHttpUrl(url).href, url);
    }
  });

  it('rejects non-HTTP and credentialed URLs', () => {
    for (const url of [
      'file:///tmp/codex-gui.html',
      'ws://127.0.0.1:52949/?threadId=t',
      'http://',
      'http://user:pass@127.0.0.1:52949/?threadId=t',
    ]) {
      assert.throws(() => state.parseGuiHttpUrl(url), /GUI URL must be an HTTP\(S\) URL without credentials/);
    }
  });
});
