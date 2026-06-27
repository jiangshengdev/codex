# codex-gui Transcript Chunk Selector Cache Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `selectTranscriptChunk` return a stable `TranscriptChunkView` reference for unchanged chunks so unrelated Redux updates do not rematerialize chunk entries.

**Architecture:** Keep the current normalized transcript state and `CommittedTranscriptChunk` per-chunk subscription model. Add a module-private `WeakMap` cache in `transcriptStateSlice.ts`, keyed by `TranscriptChunk` object identity and invalidated by `chunk.revision`. Lock the behavior with selector/reducer tests in `transcriptStateSlice.test.ts`.

**Tech Stack:** React 19, Redux Toolkit slice selectors, Immer-backed reducer state, Vitest, existing projection fixtures/builders.

---

## File Structure

- Modify: `codex-gui/src/features/transcriptState/__tests__/transcriptStateSlice.test.ts`
  - Add selector reference-stability tests for unchanged chunks, unrelated store updates, changed chunks, and snapshot reattach.
- Modify: `codex-gui/src/features/transcriptState/transcriptStateSlice.ts`
  - Add a module-private `WeakMap<TranscriptChunk, TranscriptChunkViewCacheEntry>`.
  - Update `selectTranscriptChunk` to reuse cached views when the chunk object and revision match.
- Do not modify:
  - `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx`
  - `codex-gui/src/features/committedTranscriptSurface/committedTranscriptChunkEquality.ts`
  - `codex-gui/src/features/threadRuntime/threadRuntimeSlice.ts`
  - `codex-gui/src/features/transcriptState/transcriptEntryMaterialization.ts`
  - `codex-gui/src/features/projectionIngress/*`

## Task 1: Add Failing Selector Reference-Stability Tests

**Files:**
- Modify: `codex-gui/src/features/transcriptState/__tests__/transcriptStateSlice.test.ts`

- [ ] **Step 1: Add a test for unchanged chunk reference stability**

Add this test near the other chunk selector tests, after `rebuilds committed transcript chunks from an accepted attach snapshot`:

```ts
it("returns a stable transcript chunk view while the chunk is unchanged", () => {
  const store = makeStore();

  store.dispatch(
    threadRuntimeAttached(
      attachWithTurns(attachBaseline, [
        baseTurn("turn-cached", [agentMessage("agent-cached", "Cached answer")]),
      ]),
    ),
  );

  const firstChunk = selectTranscriptChunk(store.getState(), "turn-cached:chunk:0");

  expect(firstChunk).not.toBeNull();
  expect(selectTranscriptChunk(store.getState(), "turn-cached:chunk:0")).toBe(firstChunk);

  store.dispatch(
    threadRuntimeEventBuffered(
      itemStarted(
        eventItemStarted,
        "commit-other-started",
        "turn-other",
        agentMessage("agent-other-started", "Started should not affect cached chunk"),
      ),
    ),
  );

  expect(selectTranscriptChunk(store.getState(), "turn-cached:chunk:0")).toBe(firstChunk);

  store.dispatch(
    threadRuntimeEventBuffered(
      itemCompleted(
        eventItemCompleted,
        "commit-other-completed",
        "turn-other",
        agentMessage("agent-other-completed", "Other turn answer"),
      ),
    ),
  );

  expect(selectTranscriptChunk(store.getState(), "turn-cached:chunk:0")).toBe(firstChunk);
});
```

- [ ] **Step 2: Add a test for changed chunk invalidation**

Add this test after the unchanged-reference test:

```ts
it("returns a new transcript chunk view when that chunk changes", () => {
  const store = makeStore();

  store.dispatch(
    threadRuntimeAttached(
      attachWithTurns(attachBaseline, [
        baseTurn("turn-cached", [agentMessage("agent-cached", "Cached answer")]),
      ]),
    ),
  );

  const beforeUpdateChunk = selectTranscriptChunk(store.getState(), "turn-cached:chunk:0");

  store.dispatch(
    threadRuntimeEventBuffered(
      itemCompleted(
        eventItemCompleted,
        "commit-cached-append",
        "turn-cached",
        agentMessage("agent-cached-live", "Live answer"),
      ),
    ),
  );

  const afterUpdateChunk = selectTranscriptChunk(store.getState(), "turn-cached:chunk:0");

  expect(afterUpdateChunk).not.toBe(beforeUpdateChunk);
  expect(afterUpdateChunk).toStrictEqual({
    id: "turn-cached:chunk:0",
    turnId: "turn-cached",
    revision: (beforeUpdateChunk?.revision ?? 0) + 1,
    entries: [
      {
        type: "message",
        id: "agent-cached",
        turnId: "turn-cached",
        role: "assistant",
        source: "Cached answer",
        sourceKind: "plainText",
        revision: 0,
      },
      {
        type: "message",
        id: "agent-cached-live",
        turnId: "turn-cached",
        role: "assistant",
        source: "Live answer",
        sourceKind: "plainText",
        revision: 0,
      },
    ],
  });
});
```

- [ ] **Step 3: Add a test for snapshot reattach not reusing old views**

Add this test after the changed-chunk test:

```ts
it("does not reuse transcript chunk views across snapshot reattach", () => {
  const store = makeStore();

  store.dispatch(
    threadRuntimeAttached(
      attachWithTurns(attachBaseline, [
        baseTurn("turn-reattach", [agentMessage("agent-reattach", "Before reconnect")]),
      ]),
    ),
  );

  const beforeReattachChunk = selectTranscriptChunk(store.getState(), "turn-reattach:chunk:0");

  store.dispatch(
    threadRuntimeAttached(
      attachWithTurns(attachReplacement, [
        baseTurn("turn-reattach", [agentMessage("agent-reattach", "After reconnect")]),
      ]),
    ),
  );

  const afterReattachChunk = selectTranscriptChunk(store.getState(), "turn-reattach:chunk:0");

  expect(afterReattachChunk).not.toBe(beforeReattachChunk);
  expect(afterReattachChunk).toStrictEqual({
    id: "turn-reattach:chunk:0",
    turnId: "turn-reattach",
    revision: 0,
    entries: [
      {
        type: "message",
        id: "agent-reattach",
        turnId: "turn-reattach",
        role: "assistant",
        source: "After reconnect",
        sourceKind: "plainText",
        revision: 0,
      },
    ],
  });
});
```

- [ ] **Step 4: Run the focused test file and verify RED**

Initialize the project Node environment and confirm `pnpm` is not the Codex runtime copy:

```sh
cd /Users/jiangsheng/cnb/codex/codex-gui
source <(/opt/homebrew/bin/fnm env --shell zsh)
pnpm --version
which pnpm
```

Expected: `which pnpm` does not print a path under `/Users/jiangsheng/.cache/codex-runtimes/`.

Run:

```sh
pnpm run test -- src/features/transcriptState/__tests__/transcriptStateSlice.test.ts
```

Expected: FAIL on `returns a stable transcript chunk view while the chunk is unchanged`, because repeated `selectTranscriptChunk` calls currently return fresh objects.

## Task 2: Implement WeakMap-Based Chunk View Caching

**Files:**
- Modify: `codex-gui/src/features/transcriptState/transcriptStateSlice.ts`

- [ ] **Step 1: Add the cache entry type and WeakMap**

Add this immediately after `TranscriptState`:

```ts
type TranscriptChunkViewCacheEntry = {
  revision: number;
  view: TranscriptChunkView;
};

const transcriptChunkViewCache = new WeakMap<TranscriptChunk, TranscriptChunkViewCacheEntry>();
```

- [ ] **Step 2: Add the cache materialization helper**

Add this helper before `transcriptStateSlice`:

```ts
const selectCachedTranscriptChunkView = (
  transcriptState: TranscriptState,
  chunk: TranscriptChunk,
): TranscriptChunkView => {
  const cachedEntry = transcriptChunkViewCache.get(chunk);
  if (cachedEntry != null && cachedEntry.revision === chunk.revision) {
    return cachedEntry.view;
  }

  const view: TranscriptChunkView = {
    id: chunk.id,
    turnId: chunk.turnId,
    revision: chunk.revision,
    entries: chunk.entryIds.flatMap((entryId) => {
      const entry = transcriptState.entriesById[entryId];
      return entry == null ? [] : [entry];
    }),
  };

  transcriptChunkViewCache.set(chunk, { revision: chunk.revision, view });
  return view;
};
```

- [ ] **Step 3: Use the cached helper in `selectTranscriptChunk`**

Replace the current `selectTranscriptChunk` implementation:

```ts
selectTranscriptChunk: (transcriptState, chunkId: string): TranscriptChunkView | null => {
  const chunk = transcriptState.chunksById[chunkId];
  if (chunk == null) {
    return null;
  }

  return {
    id: chunk.id,
    turnId: chunk.turnId,
    revision: chunk.revision,
    entries: chunk.entryIds.flatMap((entryId) => {
      const entry = transcriptState.entriesById[entryId];
      return entry == null ? [] : [entry];
    }),
  };
},
```

with:

```ts
selectTranscriptChunk: (transcriptState, chunkId: string): TranscriptChunkView | null => {
  const chunk = transcriptState.chunksById[chunkId];
  if (chunk == null) {
    return null;
  }

  return selectCachedTranscriptChunkView(transcriptState, chunk);
},
```

- [ ] **Step 4: Run the focused test file and verify GREEN**

Run with the already-initialized shell:

```sh
pnpm run test -- src/features/transcriptState/__tests__/transcriptStateSlice.test.ts
```

Expected: PASS for the full `transcriptStateSlice.test.ts` file.

## Task 3: Verify Formatting, Types, and Diff Scope

**Files:**
- Verify: `codex-gui/src/features/transcriptState/__tests__/transcriptStateSlice.test.ts`
- Verify: `codex-gui/src/features/transcriptState/transcriptStateSlice.ts`

- [ ] **Step 1: Run Prettier for the touched files**

Run:

```sh
pnpm exec prettier --write src/features/transcriptState/__tests__/transcriptStateSlice.test.ts src/features/transcriptState/transcriptStateSlice.ts
```

Expected: Prettier completes and only formats the two touched files.

- [ ] **Step 2: Run the focused test file again**

Run:

```sh
pnpm run test -- src/features/transcriptState/__tests__/transcriptStateSlice.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run TypeScript checking**

Run:

```sh
pnpm run type-check
```

Expected: PASS.

- [ ] **Step 4: Inspect the final diff scope**

Run:

```sh
cd /Users/jiangsheng/cnb/codex
git diff -- codex-gui/src/features/transcriptState/__tests__/transcriptStateSlice.test.ts codex-gui/src/features/transcriptState/transcriptStateSlice.ts
```

Expected: the diff only adds selector cache tests and the `WeakMap`-backed chunk view cache. It does not modify committed transcript components, equality logic, projection ingress, runtime buffering, materialization, or GUI host code.

## Commit Boundary

Do not stage or commit while executing this plan unless the user explicitly asks for it. If the user asks for a commit after verification passes, stage only:

```text
codex-gui/src/features/transcriptState/__tests__/transcriptStateSlice.test.ts
codex-gui/src/features/transcriptState/transcriptStateSlice.ts
```

Use a focused commit message such as:

```text
gui: cache transcript chunk selector views
```

## Self-Review Notes

- Spec coverage: Task 1 covers unchanged chunk stability, unrelated update stability, changed chunk invalidation, and snapshot reattach safety.
- Selector contract: Task 2 caches only derived `TranscriptChunkView` objects and does not write view data into Redux state.
- React boundary: the plan does not touch `CommittedTranscriptChunk` or `areTranscriptChunkViewsEqual`; existing per-chunk subscriptions remain intact.
- Scope: the plan does not address transcript windowing, entry-level subscriptions, `itemStarted` duplicate-window writes, or equality simplification.
- Verification: the focused test file proves the selector contract, and `pnpm run type-check` catches TypeScript integration issues.
