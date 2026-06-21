#!/usr/bin/env node

import { run, runJson, runText } from './exec.mjs';

export function listBrowsers() {
  try {
    return runJson('playwright-cli', ['list', '--json'], { allowFailure: false }) ?? {};
  } catch {
    return {};
  }
}

export function currentBrowser() {
  const listed = listBrowsers();
  const browsers = listed.browsers ?? [];
  return browsers.find((browser) => browser.name === 'default') ?? browsers[0] ?? null;
}

export function evalJson(expression) {
  const text = runText('playwright-cli', ['--raw', 'eval', expression]);
  const parsed = JSON.parse(text);
  if (typeof parsed === 'string') {
    return JSON.parse(parsed);
  }
  return parsed;
}

export function gotoUrl(url) {
  run('playwright-cli', ['goto', url], { stdio: 'inherit' });
}

export function reloadPage() {
  run('playwright-cli', ['reload'], { stdio: 'inherit' });
}

export function closeBrowserAllowFailure() {
  run('playwright-cli', ['close'], { allowFailure: true });
}

export function openChromeForTesting({ profile, config, url }) {
  run(
    'playwright-cli',
    ['open', '--browser=chromium', '--headed', `--profile=${profile}`, '--config', config, url],
    { stdio: 'inherit' },
  );
}
