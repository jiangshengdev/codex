# Codex GUI Projection Fixture Low-risk Reuse Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the first low-risk set of hand-written legal projection payloads in `codex-gui` frontend tests with existing shared projection fixtures and builders.

**Architecture:** Keep Rust-generated fixture ownership in `src/features/projection/__fixtures__` and typed test access in `projectionFixtures.ts`. Use the existing `projectionTestBuilders.ts` helpers (`inProgressTurn`, `turnStarted`, `turnCompleted`) at test call sites; do not introduce a generic deep override builder in this slice.

**Tech Stack:** TypeScript, Vitest, Vitest Browser, pnpm, fnm.

---

## File Structure

- Modify: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts`
  - Replace local hand-written legal `ThreadProjectionEventNotification` derivations with `turnCompleted(...)` and `turnStarted(...)`.
- Modify: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx`
  - Replace `baseTurn(...)` plus in-progress field overrides with `inProgressTurn(...)`.
- Modify: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts`
  - Replace `baseTurn(...)` plus in-progress field overrides with `inProgressTurn(...)`.

## Execution Constraints

- Do not modify production code.
- Do not modify or move files under `/Users/jiangsheng/cnb/codex/codex-gui/src/features/projection/__fixtures__`.
- Do not change malformed payload tests, JSON-RPC envelopes, outbound request assertions, or UI/selector expected-state objects.
- Do not add a generic deep override helper in this slice.
- Do not install dependencies.
- Do not stage or commit unless the user explicitly asks.

## Tooling Setup

Before any `pnpm` command in `/Users/jiangsheng/cnb/codex/codex-gui`, initialize the user's fnm environment and verify `pnpm` is not coming from `/Users/jiangsheng/.cache/codex-runtimes/`.

- [ ] **Step 1: Print fnm environment**

Run from `/Users/jiangsheng/cnb/codex/codex-gui`:

```sh
/opt/homebrew/bin/fnm env --shell zsh
```

Expected: output contains shell environment exports for fnm.

- [ ] **Step 2: Initialize the current shell from that output**

Apply the printed fnm environment in the current shell before running `pnpm`.

- [ ] **Step 3: Verify pnpm**

Run:

```sh
which pnpm
pnpm --version
```

Expected: `which pnpm` must not point under `/Users/jiangsheng/.cache/codex-runtimes/`.

---

### Task 1: Replace Hand-written Runtime Projection Events

**Files:**

- Modify: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts`

- [ ] **Step 1: Update imports**

Change the builder import from:

```ts
import { attachWithTurns } from "@/features/projection/__tests__/projectionTestBuilders";
```

to:

```ts
import {
  attachWithTurns,
  turnCompleted,
  turnStarted,
} from "@/features/projection/__tests__/projectionTestBuilders";
```

If `ThreadProjectionEventNotification` becomes unused after this task, remove it from:

```ts
import type { ThreadProjectionEventNotification } from "@codex-protocol/v2";
```

- [ ] **Step 2: Replace the non-matching completed event**

Replace the local object in `does not clear active turn when a different turn completes`:

```ts
const nonMatchingCompleted: ThreadProjectionEventNotification = {
  ...eventTurnCompleted,
  event: {
    ...eventTurnCompleted.event,
    notification: {
      ...eventTurnCompleted.event.notification,
      turn: {
        ...eventTurnCompleted.event.notification.turn,
        id: "another-turn",
      },
    },
  },
};
```

with:

```ts
const nonMatchingCompleted = turnCompleted(eventTurnCompleted, eventTurnCompleted.commitId, {
  ...eventTurnCompleted.event.notification.turn,
  id: "another-turn",
});
```

Keep the existing fixture guard:

```ts
if (eventTurnCompleted.event.type !== "turnCompleted") {
  throw new Error("fixture must contain a turnCompleted projection event");
}
```

- [ ] **Step 3: Replace the buffer cap loop event object**

Inside `caps the event buffer as a bounded replay tail`, replace:

```ts
threadRuntimeEventBuffered({
  ...eventTurnStarted,
  commitId: `commit-buffer-${commitIndex}`,
  parentCommitId: index === 0 ? null : `commit-buffer-${parentCommitIndex}`,
  event: {
    ...eventTurnStarted.event,
    notification: {
      ...eventTurnStarted.event.notification,
      turn: {
        ...eventTurnStarted.event.notification.turn,
        id: `turn-buffer-${commitIndex}`,
      },
    },
  },
}),
```

with:

```ts
threadRuntimeEventBuffered({
  ...turnStarted(eventTurnStarted, `commit-buffer-${commitIndex}`, {
    ...eventTurnStarted.event.notification.turn,
    id: `turn-buffer-${commitIndex}`,
  }),
  parentCommitId: index === 0 ? null : `commit-buffer-${parentCommitIndex}`,
}),
```

- [ ] **Step 4: Run the focused unit test**

Run from `/Users/jiangsheng/cnb/codex/codex-gui` after fnm setup:

```sh
pnpm run test:unit -- src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts
```

Expected: the test file passes.

---

### Task 2: Reuse `inProgressTurn` in Browser Transcript Surface Test

**Files:**

- Modify: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx`

- [ ] **Step 1: Add the builder import**

In the `projectionTestBuilders` import, add `inProgressTurn`:

```ts
import {
  agentMessage,
  attachWithTurns,
  baseTurn,
  inProgressTurn,
  itemCompleted,
  itemStarted,
  textInput,
  turnStarted,
  userMessage,
} from "@/features/projection/__tests__/projectionTestBuilders";
```

- [ ] **Step 2: Replace the live turn construction**

Replace:

```ts
turnStarted(eventTurnStarted, "commit-turn-live", {
  ...baseTurn("turn-live"),
  status: "inProgress",
  completedAt: null,
  durationMs: null,
}),
```

with:

```ts
turnStarted(eventTurnStarted, "commit-turn-live", inProgressTurn("turn-live")),
```

- [ ] **Step 3: Run the focused browser test**

Run from `/Users/jiangsheng/cnb/codex/codex-gui` after fnm setup:

```sh
pnpm run test:browser -- src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx
```

Expected: the browser test file passes.

---

### Task 3: Reuse `inProgressTurn` in Transcript Live Events Tests

**Files:**

- Modify: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts`

- [ ] **Step 1: Add the builder import**

In the `projectionTestBuilders` import, add `inProgressTurn`:

```ts
import {
  agentMessage,
  attachWithTurns,
  baseTurn,
  inProgressTurn,
  itemCompleted,
  itemStarted,
  planItem,
  sleepItem,
  textInput,
  turnCompleted,
  turnStarted,
  userMessage,
} from "@/features/projection/__tests__/projectionTestBuilders";
```

- [ ] **Step 2: Replace the live itemCompleted test turn**

Replace:

```ts
turnStarted(eventTurnStarted, "commit-live-turn", {
  ...baseTurn("turn-live", []),
  status: "inProgress",
}),
```

with:

```ts
turnStarted(eventTurnStarted, "commit-live-turn", inProgressTurn("turn-live")),
```

- [ ] **Step 3: Replace the terminal status test turn**

Replace:

```ts
turnStarted(eventTurnStarted, "commit-start-done", {
  ...baseTurn("turn-done", []),
  status: "inProgress",
}),
```

with:

```ts
turnStarted(eventTurnStarted, "commit-start-done", inProgressTurn("turn-done")),
```

Keep the completed turn builder unchanged:

```ts
turnCompleted(eventTurnCompleted, "commit-complete-done", {
  ...baseTurn("turn-done", []),
  status: "completed",
}),
```

- [ ] **Step 4: Run the focused unit test**

Run from `/Users/jiangsheng/cnb/codex/codex-gui` after fnm setup:

```sh
pnpm run test:unit -- src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts
```

Expected: the test file passes.

---

### Task 4: Format and Final Verification

**Files:**

- Verify: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts`
- Verify: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx`
- Verify: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts`

- [ ] **Step 1: Format only touched test files if needed**

Run from `/Users/jiangsheng/cnb/codex/codex-gui` after fnm setup:

```sh
pnpm exec oxfmt src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts --write
```

Expected: formatter completes successfully.

- [ ] **Step 2: Run combined focused unit tests**

Run:

```sh
pnpm run test:unit -- src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts
```

Expected: both unit test files pass.

- [ ] **Step 3: Run focused browser test**

Run:

```sh
pnpm run test:browser -- src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx
```

Expected: browser test file passes.

- [ ] **Step 4: Run type-check**

Run:

```sh
pnpm run type-check
```

Expected: type-check completes successfully.

- [ ] **Step 5: Inspect the final diff**

Run from `/Users/jiangsheng/cnb/codex`:

```sh
git diff -- codex-gui/src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts codex-gui/src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts
```

Expected: diff only replaces legal projection payload construction with shared builders; no assertion semantics change.

