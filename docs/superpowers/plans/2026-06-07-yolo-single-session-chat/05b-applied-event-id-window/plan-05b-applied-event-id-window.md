# Applied Event ID Window Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `incrementalChatStateSlice`'s unbounded `appliedEventIds` array scan with a serializable bounded idempotency window.

**Architecture:** Keep `incrementalChatStateSlice` as the owner of active chat facts and reducer-level event idempotency. Store applied commit ids as `Record<string, true>` for O(1) membership checks, plus a bounded `appliedEventOrder` array used only for eviction. This window is a local reducer guard; `ProjectionIngressAdapter` remains responsible for protocol-level commit chain, stale subscription, and duplicate filtering.

**Tech Stack:** TypeScript, Redux Toolkit / Immer reducers, Vitest, pnpm.

---

## Scope

This plan fixes only the `appliedEventIds` performance issue from
`docs/superpowers/issues/2026-06-16-01-gui-incremental-chat-array-scans.md`.

It modifies:

- `codex-gui/src/features/incrementalChatState/incrementalChatStateSlice.ts`
- `codex-gui/src/features/incrementalChatState/__tests__/incrementalChatStateSlice.test.ts`

It does not modify:

- `codex-gui/src/features/threadRuntime/threadRuntimeSlice.ts`
- `codex-gui/src/features/liveEventHandling/liveEventHandling.ts`
- `codex-gui/src/features/snapshotReplay/snapshotReplay.ts`
- `codex-gui/src/features/chatTextModel/chatTextModel.ts`
- `codex-gui/src/App.tsx`
- the `turnOrder.includes(...)`, `turnMessages.includes(...)`, or legacy timeline selector issues.

## File Structure

- Modify: `codex-gui/src/features/incrementalChatState/incrementalChatStateSlice.ts`
  - Replace `appliedEventIds: string[]` with `appliedEventIdsById: Record<string, true>` and `appliedEventOrder: string[]`.
  - Add `MAX_APPLIED_EVENT_ID_WINDOW_LENGTH = 500`.
  - Add helpers for O(1) membership and bounded insertion.
  - Update reset and live event handling paths to use the new fields.
- Modify: `codex-gui/src/features/incrementalChatState/__tests__/incrementalChatStateSlice.test.ts`
  - Keep the existing duplicate commit behavior test.
  - Add a regression test proving the applied event id window is capped and evicts from the lookup table.

## State Shape Decision

Use this state shape:

```ts
appliedEventIdsById: Record<string, true>;
appliedEventOrder: string[];
```

Meanings:

- `appliedEventIdsById` is the membership index used by `threadRuntimeEventBuffered`.
- `appliedEventOrder` preserves insertion order only so the oldest id can be evicted.
- The window length is capped at 500 to match `threadRuntime.eventBuffer`.
- Once an id falls out of this window, `incrementalChatStateSlice` no longer promises to dedupe it. That is acceptable because normal input has already passed `ProjectionIngressAdapter`.

---

### Task 1: Add Applied Event Window Regression Coverage

**Files:**
- Modify: `codex-gui/src/features/incrementalChatState/__tests__/incrementalChatStateSlice.test.ts`

- [ ] **Step 1: Add a capped id window test**

Append this test inside `describe("incremental chat state reducer", () => { ... })`:

```ts
  it("keeps applied event id dedupe state bounded", () => {
    let state = incrementalChatStateSlice.reducer(
      undefined,
      threadRuntimeAttached(attachWithTurns([])),
    );

    for (let index = 0; index < 501; index += 1) {
      state = incrementalChatStateSlice.reducer(
        state,
        threadRuntimeEventBuffered(
          itemCompleted(
            `commit-window-${index}`,
            `turn-window-${index}`,
            agentMessage(`agent-window-${index}`, `Window ${index}`),
          ),
        ),
      );
    }

    expect(state.appliedEventOrder).toHaveLength(500);
    expect(state.appliedEventOrder[0]).toBe("commit-window-1");
    expect(state.appliedEventOrder.at(-1)).toBe("commit-window-500");
    expect(state.appliedEventIdsById["commit-window-0"]).toBeUndefined();
    expect(state.appliedEventIdsById["commit-window-1"]).toBe(true);
    expect(state.appliedEventIdsById["commit-window-500"]).toBe(true);
  });
```

- [ ] **Step 2: Run the focused test and confirm it fails**

Run:

```bash
pnpm --dir codex-gui exec vitest --run src/features/incrementalChatState/__tests__/incrementalChatStateSlice.test.ts
```

Expected result: FAIL at TypeScript/runtime level because `appliedEventOrder` and
`appliedEventIdsById` do not exist yet.

---

### Task 2: Replace The Unbounded Array With A Bounded Lookup Window

**Files:**
- Modify: `codex-gui/src/features/incrementalChatState/incrementalChatStateSlice.ts`

- [ ] **Step 1: Update the state type**

Replace:

```ts
  appliedEventIds: string[];
```

with:

```ts
  appliedEventIdsById: Record<string, true>;
  appliedEventOrder: string[];
```

- [ ] **Step 2: Update initial and empty state creation**

Replace each `appliedEventIds: []` entry in `initialState` and `createEmptyState()` with:

```ts
  appliedEventIdsById: {},
  appliedEventOrder: [],
```

- [ ] **Step 3: Update resetState**

Replace:

```ts
  state.appliedEventIds = nextState.appliedEventIds;
```

with:

```ts
  state.appliedEventIdsById = nextState.appliedEventIdsById;
  state.appliedEventOrder = nextState.appliedEventOrder;
```

- [ ] **Step 4: Add the cap constant and helpers**

Add this near the initial state definitions:

```ts
const MAX_APPLIED_EVENT_ID_WINDOW_LENGTH = 500;

const hasAppliedEvent = (state: IncrementalChatState, commitId: string): boolean =>
  state.appliedEventIdsById[commitId] === true;

const recordAppliedEvent = (state: IncrementalChatState, commitId: string) => {
  state.appliedEventIdsById[commitId] = true;
  state.appliedEventOrder.push(commitId);

  if (state.appliedEventOrder.length <= MAX_APPLIED_EVENT_ID_WINDOW_LENGTH) {
    return;
  }

  const removedCommitId = state.appliedEventOrder.shift();
  if (removedCommitId != null) {
    Reflect.deleteProperty(state.appliedEventIdsById, removedCommitId);
  }
};
```

- [ ] **Step 5: Update live event idempotency handling**

Replace:

```ts
        if (state.appliedEventIds.includes(action.payload.commitId)) {
          return;
        }

        state.appliedEventIds.push(action.payload.commitId);
```

with:

```ts
        if (hasAppliedEvent(state, action.payload.commitId)) {
          return;
        }

        recordAppliedEvent(state, action.payload.commitId);
```

- [ ] **Step 6: Run focused tests and confirm they pass**

Run:

```bash
pnpm --dir codex-gui exec vitest --run src/features/incrementalChatState/__tests__/incrementalChatStateSlice.test.ts
```

Expected result: PASS.

---

### Task 3: Verify Formatting And GUI Checks

**Files:**
- Modify: `codex-gui/src/features/incrementalChatState/incrementalChatStateSlice.ts`
- Modify: `codex-gui/src/features/incrementalChatState/__tests__/incrementalChatStateSlice.test.ts`

- [ ] **Step 1: Run GUI formatting/checks**

Run:

```bash
pnpm --dir codex-gui run ci
```

Expected result: PASS.

- [ ] **Step 2: Inspect the final diff**

Run:

```bash
git diff -- codex-gui/src/features/incrementalChatState/incrementalChatStateSlice.ts codex-gui/src/features/incrementalChatState/__tests__/incrementalChatStateSlice.test.ts
```

Expected result:

- The only production state shape change is replacing unbounded `appliedEventIds` with `appliedEventIdsById` and `appliedEventOrder`.
- The live event reducer no longer calls `Array.includes(...)` for commit id membership.
- No changes appear in runtime, UI, snapshot replay, live event handling, or chat text model files.

- [ ] **Step 3: Commit the focused fix**

Run:

```bash
git add codex-gui/src/features/incrementalChatState/incrementalChatStateSlice.ts codex-gui/src/features/incrementalChatState/__tests__/incrementalChatStateSlice.test.ts
git commit -m "fix(gui): bound incremental chat event dedupe window"
```
