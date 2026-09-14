import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readlinkSync, realpathSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const script = fileURLToPath(new URL('./create-codex-gui-worktree.sh', import.meta.url));
const requiredFiles = [
  'AGENTS.md', '.codex/skills/codex-gui-toolchain/SKILL.md',
  '.agents/skills/lingui-best-practices/SKILL.md', 'codex-gui/AGENTS.md',
  'docs/agents/issue-tracker.md', 'docs/agents/triage-labels.md', 'docs/agents/domain.md',
  'codex-rs/app-server-protocol/schema/typescript/index.ts',
  'codex-rs/app-server-protocol/schema/json/codex_app_server_protocol.schemas.json',
  'codex-rs/gui-host/schema/typescript/browserContract.ts',
  'codex-rs/gui-host/schema/json/GuiAuthenticateParams.json',
];
function put(root, path, content = 'fixture\n') {
  const target = join(root, path);
  mkdirSync(join(target, '..'), { recursive: true });
  writeFileSync(target, content);
}
function fixture(t, { omit, domain = true } = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'codex-worktree-test-')));
  t.after(() => rmSync(root, { recursive: true }));
  const repo = join(root, 'repo');
  const worktrees = join(root, 'worktrees');
  const vitest = join(root, 'vitest');
  mkdirSync(repo);
  mkdirSync(worktrees);
  const git = (...args) => {
    const result = spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  git('init', '-b', 'dev');
  git('config', 'user.name', 'Worktree test');
  git('config', 'user.email', 'worktree-test@example.invalid');
  git('config', 'commit.gpgsign', 'false');
  git('config', 'core.hooksPath', '/dev/null');
  put(repo, '.gitignore', 'docs/superpowers/\nnode_modules\ncodex-gui/.heroui-docs/\ncodex-gui/.redux-toolkit-docs/\n');
  for (const path of requiredFiles) if (path !== omit) put(repo, path);
  if (domain) {
    put(repo, 'CONTEXT.md', 'Shared terms\n');
    put(repo, 'docs/adr/accepted.md', 'Accepted decision\n');
  }
  git('add', '.');
  git('commit', '-m', 'fixture');
  put(repo, 'docs/superpowers/local-history.md', 'preserve local history\n');
  for (const path of ['codex-gui/node_modules/fixture', 'codex-gui/.heroui-docs/react/components/fixture',
    'codex-gui/.redux-toolkit-docs/redux/style-guide.md', 'codex-gui/.redux-toolkit-docs/toolkit/api/createSlice.mdx']) put(repo, path);
  for (const path of ['docs/api/browser/fixture', 'docs/guide/browser/fixture', 'docs/config/browser/fixture']) put(vitest, path);
  const target = join(worktrees, 'task');
  const run = (...extra) => spawnSync('bash', [script, '--name', 'task', '--branch', 'codex/task',
    '--repo-root', repo, '--worktree-root', worktrees, '--vitest-root', vitest, ...extra], { encoding: 'utf8' });
  return { repo, worktrees, vitest, target, git, run };
}

test('creates a usable CNB worktree without copying or changing local history', t => {
  const f = fixture(t);
  const result = f.run();
  assert.equal(result.status, 0, result.stderr);
  for (const path of [...requiredFiles, 'CONTEXT.md', 'docs/adr/accepted.md'])
    assert.equal(readFileSync(join(f.target, path), 'utf8'), readFileSync(join(f.repo, path), 'utf8'));
  assert.equal(readlinkSync(join(f.target, 'codex-gui/node_modules')), join(f.repo, 'codex-gui/node_modules'));
  assert.equal(readFileSync(join(f.repo, 'docs/superpowers/local-history.md'), 'utf8'), 'preserve local history\n');
  assert.equal(existsSync(join(f.target, 'docs/superpowers')), false);
  assert.equal(f.git('-C', f.target, 'status', '--porcelain'), '');
});

test('domain documents remain optional', t => {
  const f = fixture(t, { domain: false });
  const result = f.run();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(existsSync(join(f.target, 'CONTEXT.md')), false);
  assert.equal(existsSync(join(f.target, 'docs/adr')), false);
});

test('rejects missing required sparse inputs before creating a branch', t => {
  const f = fixture(t, { omit: 'codex-rs/gui-host/schema/typescript/browserContract.ts' });
  const result = f.run();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /sparse checkout path does not exist.*codex-rs\/gui-host\/schema\/typescript/);
  assert.equal(existsSync(f.target), false);
  assert.equal(f.git('branch', '--list', 'codex/task'), '');
});

test('rejects missing CNB configuration instead of reporting a ready worktree', t => {
  const f = fixture(t, { omit: 'docs/agents/issue-tracker.md' });
  const result = f.run();
  assert.notEqual(result.status, 0);
  assert.doesNotMatch(result.stdout, /Worktree ready:/);
});

test('rejects missing local dependencies before creating a worktree', t => {
  const f = fixture(t);
  rmSync(join(f.repo, 'codex-gui/node_modules'), { recursive: true });
  const result = f.run();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /required path does not exist: .*node_modules/);
  assert.equal(existsSync(f.target), false);
});

test('rejects an existing worktree target without changing its files', t => {
  const f = fixture(t);
  put(f.target, 'keep.txt', 'existing target\n');
  const result = f.run();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /target already exists:/);
  assert.equal(readFileSync(join(f.target, 'keep.txt'), 'utf8'), 'existing target\n');
});

test('rejects an existing branch without moving it', t => {
  const f = fixture(t);
  f.git('branch', 'codex/task');
  const before = f.git('rev-parse', 'codex/task');
  const result = f.run();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /branch already exists: codex\/task/);
  assert.equal(f.git('rev-parse', 'codex/task'), before);
  assert.equal(existsSync(f.target), false);
});

test('rejects an incompatible documentation link without replacing it', t => {
  const f = fixture(t);
  const other = join(f.worktrees, 'other');
  mkdirSync(other);
  const link = join(f.worktrees, 'vitest');
  symlinkSync(other, link);
  const result = f.run();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /symlink points to unexpected target:/);
  assert.equal(readlinkSync(link), other);
  assert.doesNotMatch(result.stdout, /Worktree ready:/);
});
