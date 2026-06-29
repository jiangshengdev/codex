# Codex GUI Temporary Module ID Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Change committed transcript temporary module ids so they are based on the first temporary entry id instead of the full temporary entry membership list.

**Architecture:** Keep display grouping in `committedTranscriptDisplayGroups.ts`. Preserve `entries` as the source of membership and use the temporary module `id` only as a stable React key for the grouped display item.

**Tech Stack:** React 19, TypeScript, Vitest unit tests, pnpm scripts from `codex-gui/package.json`.

---

## File Structure

- Modify: `codex-gui/src/features/committedTranscriptSurface/committedTranscriptDisplayGroups.ts`
  - Change `temporaryModuleId` to accept the first temporary entry and return `temporary:${entry.id}`.
- Modify: `codex-gui/src/features/committedTranscriptSurface/__tests__/committedTranscriptDisplayGroups.test.ts`
  - Update the multi-commentary test to expect the first temporary entry id only.

## Environment Setup For Verification

Before running any `pnpm` command, initialize the user-managed fnm environment in `codex-gui` and confirm `pnpm` is not coming from `/Users/jiangsheng/.cache/codex-runtimes/`.

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
eval "$(/opt/homebrew/bin/fnm env --shell zsh)"
which pnpm
pnpm --version
```

Expected:

- `which pnpm` does not print a path under `/Users/jiangsheng/.cache/codex-runtimes/`.
- `pnpm --version` prints the project pnpm version from the user environment.

The required scripts were checked in `codex-gui/package.json`:

- `format:prettier:fix`
- `format:prettier`
- `test:unit`

## Task 1: Make Temporary Module ID Stable

**Files:**

- Modify: `codex-gui/src/features/committedTranscriptSurface/__tests__/committedTranscriptDisplayGroups.test.ts`
- Modify: `codex-gui/src/features/committedTranscriptSurface/committedTranscriptDisplayGroups.ts`

- [ ] **Step 1: Write the failing test expectation**

In `codex-gui/src/features/committedTranscriptSurface/__tests__/committedTranscriptDisplayGroups.test.ts`, update the expected id in `groups multiple pre-final commentary entries into one temporary module`.

Change:

```ts
id: "temporary:commentary-1:commentary-2",
```

To:

```ts
id: "temporary:commentary-1",
```

- [ ] **Step 2: Run the focused unit test and verify it fails**

Run:

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
eval "$(/opt/homebrew/bin/fnm env --shell zsh)"
pnpm run test:unit -- src/features/committedTranscriptSurface/__tests__/committedTranscriptDisplayGroups.test.ts
```

Expected: FAIL because implementation still returns `temporary:commentary-1:commentary-2`.

- [ ] **Step 3: Change the temporary module id helper**

In `codex-gui/src/features/committedTranscriptSurface/committedTranscriptDisplayGroups.ts`, replace:

```ts
const temporaryModuleId = (entries: TranscriptEntry[]): string =>
  `temporary:${entries.map((entry) => entry.id).join(":")}`;
```

With:

```ts
const temporaryModuleId = (entry: TranscriptEntry): string => `temporary:${entry.id}`;
```

- [ ] **Step 4: Change the helper call site**

In the `temporaryModule` display item creation branch, replace:

```ts
id: temporaryModuleId(temporaryEntries),
```

With:

```ts
id: temporaryModuleId(temporaryEntries[0]),
```

This branch already checks `temporaryEntries.length > 0`, so `temporaryEntries[0]` is available.

- [ ] **Step 5: Run the focused unit test and verify it passes**

Run:

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
eval "$(/opt/homebrew/bin/fnm env --shell zsh)"
pnpm run test:unit -- src/features/committedTranscriptSurface/__tests__/committedTranscriptDisplayGroups.test.ts
```

Expected: PASS for `committedTranscriptDisplayGroups.test.ts`.

- [ ] **Step 6: Format the touched files**

Run:

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
eval "$(/opt/homebrew/bin/fnm env --shell zsh)"
pnpm run format:prettier:fix -- src/features/committedTranscriptSurface/committedTranscriptDisplayGroups.ts src/features/committedTranscriptSurface/__tests__/committedTranscriptDisplayGroups.test.ts
```

Expected: Prettier completes successfully and only formats the two touched files.

- [ ] **Step 7: Run final focused verification**

Run:

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
eval "$(/opt/homebrew/bin/fnm env --shell zsh)"
pnpm run format:prettier -- src/features/committedTranscriptSurface/committedTranscriptDisplayGroups.ts src/features/committedTranscriptSurface/__tests__/committedTranscriptDisplayGroups.test.ts
pnpm run test:unit -- src/features/committedTranscriptSurface/__tests__/committedTranscriptDisplayGroups.test.ts
```

Expected:

- `format:prettier` reports both touched files are formatted.
- The focused Vitest unit test file passes.

## Self-Review

- Spec coverage: the plan implements the design decision from `docs/superpowers/specs/2026-06-29-codex-gui-temporary-module-id-design.md`.
- Scope control: the plan changes only temporary module id generation and the corresponding unit test expectation.
- Type consistency: `temporaryModuleId` takes a `TranscriptEntry`, matching `temporaryEntries[0]`, and still returns `string` for the `TranscriptTurnDisplayItem` id.
- Command validation: `format:prettier:fix`, `format:prettier`, and `test:unit` exist in `codex-gui/package.json`.
