import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const scripts = fileURLToPath(new URL('../scripts/', import.meta.url));
const env = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0' };

function run(repo, command, args, expected = 0) {
  const result = spawnSync(command, args, { cwd: repo, env, encoding: 'utf8' });
  assert.equal(result.status, expected, result.stdout + result.stderr);
  return result.stdout + result.stderr;
}

function git(repo, ...args) { return run(repo, 'git', args).trim(); }
function phase(repo, name, args = [], expected = 0) { return run(repo, 'bash', [join(scripts, name), ...args], expected); }
function put(repo, path, content) {
  mkdirSync(join(repo, path, '..'), { recursive: true });
  writeFileSync(join(repo, path), content);
}
function commit(repo, message) { git(repo, 'add', '.'); git(repo, 'commit', '-qm', message); }
function fixture(t, historical = false) {
  const repo = mkdtempSync(join(tmpdir(), 'codex-promotion-'));
  t.after(() => rmSync(repo, { recursive: true, force: true }));
  git(repo, 'init', '-q', '--initial-branch=dev');
  git(repo, 'config', 'user.name', 'test');
  git(repo, 'config', 'user.email', 'test@example.com');
  put(repo, 'codex-rs/Cargo.toml', '[workspace.package]\nversion = "0.0.0"\n');
  put(repo, 'source.txt', 'base\n');
  if (historical) put(repo, 'docs/superpowers/old.md', 'historical\n');
  commit(repo, 'base');
  git(repo, 'branch', 'test');
  git(repo, 'switch', '-qc', 'release');
  put(repo, 'codex-rs/Cargo.toml', '[workspace.package]\nversion = "1.2.3-cdx.4"\n');
  commit(repo, 'release version');
  git(repo, 'switch', '-q', 'dev');
  if (historical) git(repo, 'rm', '-r', '--', 'docs/superpowers');
  put(repo, '.gitignore', 'docs/superpowers/\n');
  put(repo, 'feature.txt', 'new feature\n');
  commit(repo, 'migrate');
  return repo;
}

test('promotion propagates committed historical document removal through test and release', t => {
  const repo = fixture(t, true);
  phase(repo, 'promote-dev-to-release.sh');
  for (const branch of ['dev', 'test', 'release']) {
    assert.equal(git(repo, 'ls-tree', '-r', '--name-only', branch, '--', 'docs/superpowers'), '');
  }
  assert.match(git(repo, 'show', 'test:codex-rs/Cargo.toml'), /version = "0.0.0"/);
  assert.match(git(repo, 'show', 'release:codex-rs/Cargo.toml'), /version = "1.2.3-cdx.5"/);
});

test('promotion without tracked historical documents preserves ignored local history', t => {
  const repo = fixture(t);
  put(repo, 'docs/superpowers/private.md', 'keep local\n');
  const before = git(repo, 'rev-parse', 'HEAD');
  const preview = phase(repo, 'promote-dev-to-release.sh', ['--dry-run']);
  assert.equal(git(repo, 'rev-parse', 'HEAD'), before);
  assert.doesNotMatch(preview, /exclude-superpowers|non-superpowers|restore.*failed/i);
  phase(repo, 'promote-dev-to-release.sh');
  assert.equal(readFileSync(join(repo, 'docs/superpowers/private.md'), 'utf8'), 'keep local\n');
  assert.equal(git(repo, 'status', '--porcelain'), '');
  assert.match(git(repo, 'show', 'dev:codex-rs/Cargo.toml'), /version = "0.0.0"/);
});

test('conflicts block promotion and unresolved continue; resolved continue finishes wrapper', t => {
  const repo = fixture(t);
  put(repo, 'source.txt', 'dev\n');
  commit(repo, 'dev change');
  git(repo, 'switch', 'test');
  put(repo, 'source.txt', 'test\n');
  commit(repo, 'test change');
  phase(repo, 'promote-dev-to-release.sh', [], 1);
  assert.equal(git(repo, 'diff', '--name-only', '--diff-filter=U'), 'source.txt');
  phase(repo, 'promote-dev-to-release.sh', ['--continue', '--target-version', '1.2.3-cdx.5'], 1);
  put(repo, 'source.txt', 'resolved\n');
  assert.doesNotMatch(readFileSync(join(repo, 'source.txt'), 'utf8'), /^(<<<<<<<|=======|>>>>>>>)/m);
  git(repo, 'diff', '--check', '--', 'source.txt');
  git(repo, 'add', '--', 'source.txt');
  phase(repo, 'promote-dev-to-release.sh', ['--continue', '--target-version', '1.2.3-cdx.5']);
  assert.equal(git(repo, 'show', 'release:source.txt'), 'resolved');
  assert.equal(git(repo, 'status', '--porcelain'), '');
});

test('invalid dev version blocks promotion before branch mutation', t => {
  const repo = fixture(t);
  put(repo, 'codex-rs/Cargo.toml', '[workspace.package]\nversion = "9.9.9"\n');
  commit(repo, 'invalid version');
  const testHead = git(repo, 'rev-parse', 'test');
  phase(repo, 'promote-dev-to-release.sh', [], 1);
  assert.equal(git(repo, 'rev-parse', 'test'), testHead);
});

test('promotion refuses to overwrite ignored history when target still tracks that path', t => {
  const repo = fixture(t, true);
  put(repo, 'docs/superpowers/old.md', 'private local history\n');
  const target = git(repo, 'rev-parse', 'test');
  phase(repo, 'promote-dev-to-release.sh', [], 1);
  assert.equal(readFileSync(join(repo, 'docs/superpowers/old.md'), 'utf8'), 'private local history\n');
  assert.equal(git(repo, 'rev-parse', 'test'), target);
  assert.equal(git(repo, 'branch', '--show-current'), 'dev');
});

test('historical document modify-delete conflicts remain unresolved for manual review', t => {
  const repo = fixture(t, true);
  git(repo, 'switch', 'test');
  put(repo, 'docs/superpowers/old.md', 'target update\n');
  commit(repo, 'edit history');
  phase(repo, 'merge-dev-to-test.sh', [], 1);
  assert.equal(git(repo, 'diff', '--name-only', '--diff-filter=U'), 'docs/superpowers/old.md');
  assert.equal(readFileSync(join(repo, 'docs/superpowers/old.md'), 'utf8'), 'target update\n');
  phase(repo, 'merge-dev-to-test.sh', ['--continue'], 1);
  git(repo, 'rm', '--', 'docs/superpowers/old.md');
  phase(repo, 'merge-dev-to-test.sh', ['--continue']);
  assert.equal(git(repo, 'ls-tree', '-r', '--name-only', 'test', '--', 'docs/superpowers'), '');
});

test('continue refuses a staged nonzero workspace version before committing', t => {
  const repo = fixture(t);
  git(repo, 'switch', 'test');
  git(repo, 'merge', '--no-ff', '--no-commit', 'dev');
  const head = git(repo, 'rev-parse', 'HEAD');
  put(repo, 'codex-rs/Cargo.toml', '[workspace.package]\nversion = "8.0.0"\n');
  git(repo, 'add', '--', 'codex-rs/Cargo.toml');
  phase(repo, 'merge-dev-to-test.sh', ['--continue'], 1);
  assert.equal(git(repo, 'rev-parse', 'HEAD'), head);
  assert.equal(git(repo, 'rev-parse', 'MERGE_HEAD'), git(repo, 'rev-parse', 'dev'));
});

test('direct release phase rejects invalid test version before changing release', t => {
  const repo = fixture(t);
  git(repo, 'switch', 'test');
  put(repo, 'codex-rs/Cargo.toml', '[workspace.package]\nversion = "8.0.0"\n');
  commit(repo, 'invalid test version');
  const release = git(repo, 'rev-parse', 'release');
  phase(repo, 'merge-test-to-release.sh', [], 1);
  assert.equal(git(repo, 'rev-parse', 'release'), release);
  assert.equal(git(repo, 'branch', '--show-current'), 'test');
});

test('merge collision preserves ignored files and directs a fresh retry', t => {
  const repo = fixture(t);
  git(repo, 'switch', 'test');
  put(repo, '.git/info/exclude', 'feature.txt\n');
  put(repo, 'feature.txt', 'private local copy\n');
  const output = phase(repo, 'merge-dev-to-test.sh', [], 1);
  assert.match(output, /would overwrite ignored local data/);
  assert.match(output, /preserve it before retrying/);
  assert.equal(readFileSync(join(repo, 'feature.txt'), 'utf8'), 'private local copy\n');
  assert.equal(git(repo, 'status', '--porcelain'), '');
});

test('promotion excludes new context and ADR documents while retaining them on dev', t => {
  const repo = fixture(t);
  put(repo, 'CONTEXT.md', 'dev context\n');
  put(repo, 'docs/adr/nested/decision.md', 'dev decision\n');
  put(repo, 'docs/adr-other/keep.md', 'normal document\n');
  commit(repo, 'documents');
  const before = git(repo, 'rev-parse', 'HEAD');
  const preview = phase(repo, 'merge-dev-to-test.sh', ['--dry-run']);
  const [included, excluded] = preview.split('excluded paths (preserving test state):');
  assert.doesNotMatch(included, /[AM]\s+(CONTEXT\.md|docs\/adr\/)/);
  assert.match(excluded, /CONTEXT\.md/);
  assert.match(excluded, /docs\/adr\/nested\/decision\.md/);
  assert.equal(git(repo, 'rev-parse', 'HEAD'), before);
  assert.equal(git(repo, 'status', '--porcelain'), '');
  phase(repo, 'promote-dev-to-release.sh');
  for (const branch of ['test', 'release']) {
    assert.equal(git(repo, 'ls-tree', '-r', '--name-only', branch, '--', 'CONTEXT.md', 'docs/adr'), '');
    assert.equal(git(repo, 'show', `${branch}:docs/adr-other/keep.md`), 'normal document');
    assert.equal(git(repo, 'show', `${branch}:feature.txt`), 'new feature');
  }
  assert.equal(git(repo, 'show', 'dev:CONTEXT.md'), 'dev context');
  assert.equal(git(repo, 'show', 'dev:docs/adr/nested/decision.md'), 'dev decision');
  assert.equal(git(repo, 'status', '--porcelain'), '');
});

test('continue preserves target documents despite incoming edits, additions and deletions', t => {
  const repo = fixture(t);
  put(repo, 'CONTEXT.md', 'base context\n');
  put(repo, 'docs/adr/old.md', 'base decision\n');
  commit(repo, 'base documents');
  git(repo, 'switch', 'test');
  git(repo, 'merge', '--ff-only', 'dev');
  const target = git(repo, 'rev-parse', 'HEAD');
  git(repo, 'switch', 'dev');
  put(repo, 'CONTEXT.md', 'updated context\n');
  git(repo, 'rm', '--', 'docs/adr/old.md');
  put(repo, 'docs/adr/new.md', 'new decision\n');
  put(repo, 'source.txt', 'updated code\n');
  commit(repo, 'updates');
  git(repo, 'switch', 'test');
  git(repo, 'merge', '--no-ff', '--no-commit', 'dev');
  phase(repo, 'merge-dev-to-test.sh', ['--continue']);
  assert.equal(git(repo, 'diff', target, 'test', '--', 'CONTEXT.md', 'docs/adr'), '');
  assert.equal(git(repo, 'show', 'test:source.txt'), 'updated code');
  assert.equal(git(repo, 'status', '--porcelain'), '');
});

function deletedTargetDocuments(t, sourceConflict = false) {
  const repo = fixture(t);
  put(repo, 'CONTEXT.md', 'base context\n');
  put(repo, 'docs/adr/old.md', 'base decision\n');
  commit(repo, 'base documents');
  git(repo, 'switch', 'test');
  git(repo, 'merge', '--ff-only', 'dev');
  git(repo, 'rm', '--', 'CONTEXT.md', 'docs/adr/old.md');
  if (sourceConflict) put(repo, 'source.txt', 'test change\n');
  commit(repo, 'target document removal');
  git(repo, 'switch', 'dev');
  put(repo, 'CONTEXT.md', 'updated context\n');
  put(repo, 'docs/adr/old.md', 'updated decision\n');
  put(repo, 'docs/adr/new.md', 'new decision\n');
  if (sourceConflict) put(repo, 'source.txt', 'dev change\n');
  commit(repo, 'incoming updates');
  return repo;
}

test('excluded modify-delete conflicts do not block promotion', t => {
  const repo = deletedTargetDocuments(t);
  phase(repo, 'promote-dev-to-release.sh');
  for (const branch of ['test', 'release']) {
    assert.equal(git(repo, 'ls-tree', '-r', '--name-only', branch, '--', 'CONTEXT.md', 'docs/adr'), '');
  }
  assert.equal(git(repo, 'show', 'dev:CONTEXT.md'), 'updated context');
  assert.equal(git(repo, 'show', 'dev:docs/adr/old.md'), 'updated decision');
  assert.equal(git(repo, 'status', '--porcelain'), '');
});

test('continue restores excluded conflicts but leaves source conflicts for manual resolution', t => {
  const repo = deletedTargetDocuments(t, true);
  git(repo, 'switch', 'test');
  run(repo, 'git', ['merge', '--no-ff', '--no-commit', 'dev'], 1);
  const target = git(repo, 'rev-parse', 'HEAD');
  phase(repo, 'merge-dev-to-test.sh', ['--continue'], 1);
  assert.equal(git(repo, 'diff', '--name-only', '--diff-filter=U'), 'source.txt');
  assert.equal(git(repo, 'diff', '--cached', 'HEAD', '--', 'CONTEXT.md', 'docs/adr'), '');
  assert.equal(git(repo, 'rev-parse', 'HEAD'), target);
  put(repo, 'source.txt', 'resolved\n');
  git(repo, 'diff', '--check', '--', 'source.txt');
  git(repo, 'add', '--', 'source.txt');
  phase(repo, 'merge-dev-to-test.sh', ['--continue']);
  assert.equal(git(repo, 'show', 'test:source.txt'), 'resolved');
  assert.equal(git(repo, 'ls-tree', '-r', '--name-only', 'test', '--', 'CONTEXT.md', 'docs/adr'), '');
  assert.equal(git(repo, 'status', '--porcelain'), '');
});

test('initial merge restores excluded conflicts before reporting source conflicts', t => {
  const repo = deletedTargetDocuments(t, true);
  phase(repo, 'merge-dev-to-test.sh', [], 1);
  assert.equal(git(repo, 'diff', '--name-only', '--diff-filter=U'), 'source.txt');
  assert.equal(git(repo, 'diff', '--cached', 'HEAD', '--', 'CONTEXT.md', 'docs/adr'), '');
});
