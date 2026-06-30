# Codex GUI Large Test Files Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the two largest `codex-gui` test files into focused sibling test files without changing production behavior.

**Architecture:** Keep production modules unchanged. Move existing test cases into behavior-domain test files, reusing existing test support and adding only a small test-only helper if duplicated setup becomes noisy.

**Tech Stack:** Vitest, TypeScript, React Browser tests only where already present, `pnpm` scripts from `codex-gui/package.json`.

---

## Preconditions

- Current branch must be `dev` before editing these docs or executing this plan.
- Do not access git remotes.
- Do not install dependencies.
- Before running any `pnpm` command in `codex-gui`, initialize the user's fnm environment with `/opt/homebrew/bin/fnm env --shell zsh` and confirm `pnpm` does not resolve under `/Users/jiangsheng/.cache/codex-runtimes/`.

## Files

Create:

- `codex-gui/src/features/transcriptState/__tests__/transcriptStateSnapshot.test.ts`
- `codex-gui/src/features/transcriptState/__tests__/transcriptStateSelectorCache.test.ts`
- `codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts`
- `codex-gui/src/features/transcriptState/__tests__/transcriptStateReconnect.test.ts`
- `codex-gui/src/features/guiHost/__tests__/guiHostLaunchParams.test.ts`
- `codex-gui/src/features/guiHost/__tests__/guiHostHandshake.test.ts`
- `codex-gui/src/features/guiHost/__tests__/guiHostCommands.test.ts`
- `codex-gui/src/features/guiHost/__tests__/guiHostProtocolErrors.test.ts`

Modify or delete:

- `codex-gui/src/features/transcriptState/__tests__/transcriptStateSlice.test.ts`
- `codex-gui/src/features/guiHost/__tests__/guiHostClient.test.ts`

Create only if needed:

- `codex-gui/src/features/transcriptState/__tests__/transcriptStateTestSupport.ts`

Do not modify production source files unless a test import path exposes a pre-existing compile issue. If that happens, stop and report the exact issue before widening scope.

## Task 1: Preflight

- [ ] Check current worktree.

Run from repo root:

```bash
git status --short
git branch --show-current
```

Expected:

- Branch is `dev`.
- Any dirty files are understood before editing.

- [ ] Initialize fnm and verify `pnpm`.

Run from `codex-gui` in a shell with fnm initialized:

```bash
pnpm --version
which pnpm
```

Expected:

- `pnpm --version` exits 0.
- `which pnpm` does not print a path under `/Users/jiangsheng/.cache/codex-runtimes/`.

## Task 2: Split transcriptState Tests

- [ ] Read the source test file and identify the import block and shared setup.

File:

- `codex-gui/src/features/transcriptState/__tests__/transcriptStateSlice.test.ts`

Move the existing test cases into these files:

- `transcriptStateSnapshot.test.ts`
  - `registers transcript state in the app store`
  - `rebuilds committed transcript chunks from an accepted attach snapshot`
  - `classifies leading prompt, middle entries, and final answers from snapshot entries`
  - `leaves leading prompt empty when the first visible entry is assistant commentary`
  - `leaves leading prompt empty when the first visible entry is a final assistant answer`
  - `stores multiple final assistant answers outside middle chunks`
  - `preserves assistant message phase in snapshot transcript entries`
  - `filters empty text, non-text user inputs, and non-chat snapshot items`
- `transcriptStateSelectorCache.test.ts`
  - `returns a stable transcript chunk view while the chunk is unchanged`
  - `returns a new transcript chunk view when that chunk changes`
  - `does not reuse transcript chunk views across snapshot reattach`
- `transcriptStateLiveEvents.test.ts`
  - `preserves assistant message phase in live completed transcript entries`
  - `sets the committed scroll commit key from accepted attach snapshots`
  - `applies live itemCompleted messages into committed transcript chunks`
  - `advances the committed scroll commit key only when live events change committed transcript DOM`
  - `updates turn terminal status from live turnCompleted`
  - `filters empty text and non-chat live item completions`
  - `uses commitId to avoid applying the same live notification twice`
  - `updates an existing committed entry and bumps only its chunk revision`
  - `bumps entry and chunk revisions when an existing middle entry phase changes`
  - `updates an existing final assistant entry without creating a middle chunk`
  - `chunks only middle entries after the committed chunk entry limit`
- `transcriptStateReconnect.test.ts`
  - `preserves committed transcript and sets global status on manual reconnect`
  - `clears interrupted status and applied event ids on the next attach`

- [ ] Preserve assertions exactly unless import names must change.

Implementation notes:

- If repeated setup exceeds a few imports/builders per file, move only duplicated test setup into `transcriptStateTestSupport.ts`.
- Do not change selectors or reducer behavior.

- [ ] Delete or empty the original large file.

Preferred outcome:

- Delete `transcriptStateSlice.test.ts` after all cases are moved.
- If deletion is risky during patch review, leave a short comment-free file only if Vitest requires it. It should not contain duplicated cases.

## Task 3: Verify transcriptState Split

- [ ] Run focused tests.

Run from `codex-gui` with fnm initialized:

```bash
pnpm run test:unit -- src/features/transcriptState/__tests__
```

Expected:

- Vitest exits 0.

- [ ] If failures are import-only failures, fix the new test file imports and rerun the same command.

Do not edit production code for this task.

## Task 4: Split guiHostClient Tests

- [ ] Read the source test file and existing support.

Files:

- `codex-gui/src/features/guiHost/__tests__/guiHostClient.test.ts`
- `codex-gui/src/features/guiHost/__tests__/guiHostClientTestSupport.ts`

Move the existing test cases into these files:

- `guiHostLaunchParams.test.ts`
  - `stores app-server launch URL fragment token and restores it after refresh`
  - `throws when launch URL is missing required launch params`
  - `clears the fragment and authenticates when launch token storage fails`
- `guiHostHandshake.test.ts`
  - `sends authenticate, initialize, attach, and forwards projection payloads`
  - `reports malformed projection attach payloads without forwarding them`
  - `reports malformed projection event payloads without forwarding them`
  - `reports malformed projection closed payloads without forwarding them`
- `guiHostCommands.test.ts`
  - `sends turn/start through the ready command API`
  - `sends turn/interrupt through the ready command API`
  - `rejects command JSON-RPC errors without closing the socket`
  - `rejects pending command requests during cleanup`
  - `rejects pending command requests and marks commands unavailable on socket error`
  - `rejects pending command requests and marks commands unavailable on socket close`
  - `closes the socket and marks commands unavailable on terminal projection protocol errors`
- `guiHostProtocolErrors.test.ts`
  - `closes the socket and suppresses later status updates during cleanup`
  - `surfaces JSON-RPC errors on initialize/attach instead of advancing`
  - `keeps terminal error state even after clean close fires afterwards`
  - `keeps terminal error state when socket error is followed by clean close`
  - `reports malformed JSON-RPC messages as errors and closes cleanly`
  - `reports policy-close as error`

- [ ] Keep reusing `guiHostClientTestSupport.ts`.

Implementation notes:

- Preserve request id order assertions.
- Preserve pending request rejection assertions.
- Preserve terminal error suppression assertions.
- Do not move or rewrite `guiHostProtocol.ts`.

- [ ] Delete or empty the original large file.

Preferred outcome:

- Delete `guiHostClient.test.ts` after all cases are moved.
- Do not duplicate test cases between old and new files.

## Task 5: Verify guiHost Split

- [ ] Run focused tests.

Run from `codex-gui` with fnm initialized:

```bash
pnpm run test:unit -- src/features/guiHost/__tests__
```

Expected:

- Vitest exits 0.

- [ ] If failures are import-only failures, fix the new test file imports and rerun the same command.

Do not edit production code for this task.

## Task 6: Final Verification

- [ ] Run type-check.

Run from `codex-gui` with fnm initialized:

```bash
pnpm run type-check
```

Expected:

- TypeScript exits 0.

- [ ] Rerun both focused test directories.

Run from `codex-gui` with fnm initialized:

```bash
pnpm run test:unit -- src/features/transcriptState/__tests__ src/features/guiHost/__tests__
```

Expected:

- Vitest exits 0.

- [ ] Inspect large-file ranking without writing the report.

Run from `codex-gui` with fnm initialized:

```bash
pnpm run analyze:large-files
```

Expected:

- The output shows the two original test files are no longer the largest single test files.
- Do not write changes to `codex-gui/.reports/large-files.md` unless separately requested.

## Task 7: Review and Report

- [ ] Inspect git status.

Run from repo root:

```bash
git status --short
```

Expected:

- Only the planned test split files and any explicitly necessary test helper are changed.

- [ ] Summarize:
  - Files created.
  - Files deleted or reduced.
  - Verification commands and results.
  - Any remaining large-file candidates left for a later batch.
