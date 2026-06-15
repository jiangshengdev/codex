# ProjectionSlice Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delete the legacy `projectionSlice` truth model and keep the GUI data path on `ProjectionIngressAdapter -> threadRuntime -> snapshotReplay`.

**Architecture:** Remove the Redux projection slice, its reducer registration, and the duplicate `App` dispatches. Keep protocol fixtures under `features/projection/__fixtures__`, keep the existing GUI host debug panel unchanged, and verify the active data path through `App.browser`, `threadRuntime`, `snapshotReplay`, and `projectionIngress` focused tests.

**Tech Stack:** TypeScript, React, Redux Toolkit, Vitest Browser Mode, Vitest, pnpm.

---

## Scope

This plan implements only `04a ProjectionSlice Cleanup`.

It deletes:

- `codex-gui/src/features/projection/projectionSlice.ts`
- `codex-gui/src/features/projection/__tests__/projectionSlice.test.ts`

It modifies:

- `codex-gui/src/App.tsx`
- `codex-gui/src/__tests__/App.browser.test.tsx`
- `codex-gui/src/app/store.ts`

It keeps:

- `codex-gui/src/features/projection/__fixtures__/*.json`
- `codex-gui/src/features/projection/__tests__/projectionFixtures.test.ts`
- The current GUI host debug panel UI text and layout.

It does not implement live event handling, chat UI, reconnect UI, composer behavior, tool activity, or fixture directory migration.

## File Structure

- Modify: `codex-gui/src/__tests__/App.browser.test.tsx`
  - Remove `projectionSlice` selectors from browser tests.
  - Assert `App -> threadRuntime -> snapshotReplay` instead.
- Modify: `codex-gui/src/App.tsx`
  - Remove `projectionAttached` and `projectionEventReceived` dispatches.
  - Keep `threadRuntimeAttached`, `threadRuntimeEventBuffered`, and `threadRuntimeManualReconnectRequired`.
- Modify: `codex-gui/src/app/store.ts`
  - Remove `projectionSlice` registration.
- Delete: `codex-gui/src/features/projection/projectionSlice.ts`
  - Remove the old projection Redux truth model.
- Delete: `codex-gui/src/features/projection/__tests__/projectionSlice.test.ts`
  - Remove reducer tests for the deleted truth model.

---

### Task 1: Move App Browser Tests To Runtime And SnapshotReplay

**Files:**
- Modify: `codex-gui/src/__tests__/App.browser.test.tsx`

- [x] **Step 1: Update imports away from `projectionSlice`**

In `codex-gui/src/__tests__/App.browser.test.tsx`, remove this import:

```ts
import {
  selectProjectionByThreadId,
  selectProjectionReattachByThreadId,
} from "@/features/projection/projectionSlice";
```

Add this import near the other feature imports:

```ts
import {
  buildSnapshotReplayMaterials,
  selectSnapshotReplayMaterials,
} from "@/features/snapshotReplay/snapshotReplay";
```

- [x] **Step 2: Replace the accepted attach/event browser test assertions**

In `codex-gui/src/__tests__/App.browser.test.tsx`, replace the entire test named `"App dispatches GUI host projection payloads into Redux"` with:

```ts
test("App dispatches accepted GUI host projection payloads into thread runtime", async () => {
  const { store } = await renderWithProviders(<App />);
  const projectionEvent = eventTurnStartedJson as ThreadProjectionEventNotification;
  const threadId = attachResponse.snapshot.thread.id;
  if (projectionEvent.event.type !== "turnStarted") {
    throw new Error("fixture must contain a turnStarted projection event");
  }

  const options = startGuiHostConnectionMock.mock.calls[0]?.[0];
  options?.onProjectionAttached?.(attachResponse);
  options?.onProjectionEvent?.(projectionEvent);

  expect(selectThreadIdentityState(store.getState())).toStrictEqual({
    launchThreadId: threadId,
    attachedThreadId: threadId,
    attachStatus: "attached",
  });

  const runtime = selectThreadRuntimeRecord(store.getState());
  expect(runtime?.threadId).toBe(threadId);
  expect(runtime?.sessionId).toBe(attachResponse.snapshot.thread.sessionId);
  expect(runtime?.snapshotTurns).toStrictEqual(attachResponse.snapshot.thread.turns);
  expect(runtime?.activeTurnId).toBe(projectionEvent.event.notification.turn.id);
  expect(runtime?.eventBuffer).toStrictEqual([
    { type: "projectionEvent", notification: projectionEvent },
  ]);
  expect(selectThreadRuntimeSubscription(store.getState())).toStrictEqual({
    state: "active",
  });
  expect(selectSnapshotReplayMaterials(store.getState())).toStrictEqual(
    buildSnapshotReplayMaterials(runtime),
  );
});
```

- [x] **Step 3: Replace the mismatched attach test assertions**

In `codex-gui/src/__tests__/App.browser.test.tsx`, replace the entire test named `"App records mismatched attach identity without advancing projection state"` with:

```ts
test("App records mismatched attach identity without advancing runtime state", async () => {
  const { store } = await renderWithProviders(<App />);
  const mismatchedThreadId = "00000000-0000-0000-0000-000000000999";
  const mismatchedAttachResponse: ThreadProjectionAttachResponse = {
    ...attachResponse,
    snapshot: {
      ...attachResponse.snapshot,
      thread: {
        ...attachResponse.snapshot.thread,
        id: mismatchedThreadId,
      },
    },
  };

  const options = startGuiHostConnectionMock.mock.calls[0]?.[0];
  options?.onProjectionAttached?.(mismatchedAttachResponse);

  expect(selectThreadIdentityState(store.getState())).toStrictEqual({
    launchThreadId,
    attachedThreadId: mismatchedThreadId,
    attachStatus: "mismatch",
  });
  expect(selectThreadRuntimeRecord(store.getState())).toBeNull();
  expect(selectThreadRuntimeSubscription(store.getState())).toBeNull();
  expect(selectThreadRuntimeEventBuffer(store.getState())).toStrictEqual([]);
  expect(selectSnapshotReplayMaterials(store.getState())).toStrictEqual([]);
});
```

- [x] **Step 4: Replace the backpressure browser test assertions**

In `codex-gui/src/__tests__/App.browser.test.tsx`, replace the entire test named `"App stops forwarding projection events after backpressure requires manual reconnect"` with:

```ts
test("App stops forwarding runtime events after backpressure requires manual reconnect", async () => {
  const { store } = await renderWithProviders(<App />);
  const projectionEvent = eventTurnStartedJson as ThreadProjectionEventNotification;
  const projectionClosed = closedBackpressureJson as ThreadProjectionClosedNotification;

  const options = startGuiHostConnectionMock.mock.calls[0]?.[0];
  options?.onProjectionAttached?.(attachResponse);
  options?.onProjectionClosed?.(projectionClosed);
  options?.onProjectionEvent?.(projectionEvent);

  const runtime = selectThreadRuntimeRecord(store.getState());
  expect(runtime?.threadId).toBe(launchThreadId);
  expect(runtime?.snapshotTurns).toStrictEqual(attachResponse.snapshot.thread.turns);
  expect(selectThreadRuntimeSubscription(store.getState())).toStrictEqual({
    state: "manualReconnectRequired",
    reason: "backpressure",
    subscriptionId: attachResponse.subscriptionId,
  });
  expect(selectThreadRuntimeEventBuffer(store.getState())).toStrictEqual([]);
  expect(selectSnapshotReplayMaterials(store.getState())).toStrictEqual(
    buildSnapshotReplayMaterials(runtime),
  );
});
```

- [x] **Step 5: Run the focused App browser test and confirm it still passes before deleting the slice**

Run:

```bash
pnpm --dir codex-gui exec vitest --config=vitest.browser.config.ts --run src/__tests__/App.browser.test.tsx
```

Expected result: PASS. The test still passes because `projectionSlice` remains registered for now, but `App.browser.test.tsx` no longer imports or asserts through it.

- [x] **Step 6: Commit the browser test retargeting**

Run:

```bash
git add codex-gui/src/__tests__/App.browser.test.tsx
git commit -m "test(gui): retarget app projection assertions to runtime"
```

Expected result: one commit that only modifies `codex-gui/src/__tests__/App.browser.test.tsx`.

---

### Task 2: Delete ProjectionSlice And Its App Wiring

**Files:**
- Modify: `codex-gui/src/App.tsx`
- Modify: `codex-gui/src/app/store.ts`
- Delete: `codex-gui/src/features/projection/projectionSlice.ts`
- Delete: `codex-gui/src/features/projection/__tests__/projectionSlice.test.ts`

- [x] **Step 1: Remove duplicate projection dispatches from App**

In `codex-gui/src/App.tsx`, delete this import:

```ts
import { projectionAttached, projectionEventReceived } from "./features/projection/projectionSlice";
```

In `dispatchProjectionOutcome`, change the accepted attach and event cases to:

```ts
        case "attachAccepted":
          dispatch(threadRuntimeAttached(outcome.response));
          return;
        case "eventAccepted":
          dispatch(threadRuntimeEventBuffered(outcome.notification));
          return;
```

Leave the `manualReconnectRequired` and `ignored` cases unchanged.

- [x] **Step 2: Remove projection reducer registration from the app store**

In `codex-gui/src/app/store.ts`, delete this import:

```ts
import projectionSlice from "@/features/projection/projectionSlice";
```

Change the `rootReducer` declaration to:

```ts
const rootReducer = combineSlices(counterSlice, threadIdentitySlice, threadRuntimeSlice);
```

- [x] **Step 3: Delete the legacy projection slice files**

Run:

```bash
rm codex-gui/src/features/projection/projectionSlice.ts
rm codex-gui/src/features/projection/__tests__/projectionSlice.test.ts
```

Expected result: the old projection Redux truth model and its reducer tests are removed. Do not delete `codex-gui/src/features/projection/__fixtures__` or `codex-gui/src/features/projection/__tests__/projectionFixtures.test.ts`.

- [x] **Step 4: Run TypeScript and focused tests for the deletion**

Run:

```bash
pnpm --dir codex-gui exec vitest --config=vitest.browser.config.ts --run src/__tests__/App.browser.test.tsx
pnpm --dir codex-gui exec vitest --run src/features/projectionIngress/__tests__/projectionIngressAdapter.test.ts
pnpm --dir codex-gui exec vitest --run src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts
pnpm --dir codex-gui exec vitest --run src/features/snapshotReplay/__tests__/snapshotReplay.test.ts
pnpm --dir codex-gui exec vitest --run src/features/projection/__tests__/projectionFixtures.test.ts
pnpm --dir codex-gui run type-check
```

Expected result: all commands PASS. If TypeScript reports any remaining `projectionSlice` import, remove that import instead of adding a replacement projection abstraction.

- [x] **Step 5: Format changed frontend files**

Run:

```bash
pnpm --dir codex-gui run format
```

Expected result: PASS. If formatting changes files, include only the files in this task's scope.

- [x] **Step 6: Commit the cleanup**

Run:

```bash
git add codex-gui/src/App.tsx \
  codex-gui/src/app/store.ts \
  codex-gui/src/features/projection/projectionSlice.ts \
  codex-gui/src/features/projection/__tests__/projectionSlice.test.ts
git commit -m "refactor(gui): remove legacy projection slice"
```

Expected result: one implementation commit removing the old slice and app/store wiring.

---

### Task 3: Final Scope Verification

**Files:**
- No source edits expected unless verification finds a narrow issue in Task 2 scope.

- [x] **Step 1: Confirm only protocol fixtures remain under `features/projection`**

Run:

```bash
find codex-gui/src/features/projection -maxdepth 3 -type f | sort
```

Expected output:

```text
codex-gui/src/features/projection/__fixtures__/attach-baseline.json
codex-gui/src/features/projection/__fixtures__/attach-replacement.json
codex-gui/src/features/projection/__fixtures__/closed-backpressure.json
codex-gui/src/features/projection/__fixtures__/event-item-completed.json
codex-gui/src/features/projection/__fixtures__/event-item-started.json
codex-gui/src/features/projection/__fixtures__/event-subscription-replacement.json
codex-gui/src/features/projection/__fixtures__/event-turn-completed.json
codex-gui/src/features/projection/__fixtures__/event-turn-started.json
codex-gui/src/features/projection/__tests__/projectionFixtures.test.ts
```

- [x] **Step 2: Confirm the remaining `projectionSlice` references are gone**

Run:

```bash
rg -n "projectionSlice|projectionAttached|projectionEventReceived|selectProjection" codex-gui/src
```

Expected result: no output and exit code 1.

- [x] **Step 3: Run the focused verification suite again**

Run:

```bash
pnpm --dir codex-gui exec vitest --config=vitest.browser.config.ts --run src/__tests__/App.browser.test.tsx
pnpm --dir codex-gui exec vitest --run src/features/projectionIngress/__tests__/projectionIngressAdapter.test.ts
pnpm --dir codex-gui exec vitest --run src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts
pnpm --dir codex-gui exec vitest --run src/features/snapshotReplay/__tests__/snapshotReplay.test.ts
pnpm --dir codex-gui exec vitest --run src/features/projection/__tests__/projectionFixtures.test.ts
pnpm --dir codex-gui run type-check
```

Expected result: all commands PASS.

- [x] **Step 4: Review committed diff**

Run:

```bash
git status --short
git log --oneline -3
git diff HEAD~2..HEAD --stat
git diff HEAD~2..HEAD -- codex-gui/src/App.tsx codex-gui/src/app/store.ts codex-gui/src/__tests__/App.browser.test.tsx codex-gui/src/features/projection
```

Expected result:

- `git status --short` is empty.
- The latest two implementation commits are:
  - `test(gui): retarget app projection assertions to runtime`
  - `refactor(gui): remove legacy projection slice`
- The diff only modifies `App.browser.test.tsx`, `App.tsx`, `store.ts`, and deletes the two projection slice files.
- `codex-gui/src/features/projection/__fixtures__/*.json` remain unchanged.
- `codex-gui/src/features/projection/__tests__/projectionFixtures.test.ts` remains unchanged.

- [x] **Step 5: Commit plan completion separately after implementation**

After Tasks 1-3 pass, update this plan file's checkboxes and add an `Execution Results` section with the commits and verification outcomes.

Then run:

```bash
git add docs/superpowers/plans/2026-06-07-yolo-single-session-chat/04a-projection-slice-cleanup/plan-04a-projection-slice-cleanup.md
git commit -m "docs(gui): mark projection slice cleanup plan complete"
```

Expected result: a docs-only completion commit. Do not mix this plan-status commit with source changes.

## Execution Results

Implementation commits:

- `468858f6e test(gui): retarget app projection assertions to runtime`
- `7784630f1 refactor(gui): remove legacy projection slice`

Review results:

- Task 1 spec compliance review passed.
- Task 1 code quality review passed with no issues.
- Task 2 spec compliance review passed.
- Task 2 code quality review passed with no issues.

Final verification:

- `find codex-gui/src/features/projection -maxdepth 3 -type f | sort` shows only protocol fixtures and `projectionFixtures.test.ts`.
- `rg -n "projectionSlice|projectionAttached|projectionEventReceived|selectProjection" codex-gui/src` returns no matches.
- `pnpm --dir codex-gui exec vitest --config=vitest.browser.config.ts --run src/__tests__/App.browser.test.tsx` passed: 3 files, 21 tests.
- `pnpm --dir codex-gui exec vitest --run src/features/projectionIngress/__tests__/projectionIngressAdapter.test.ts` passed: 1 file, 10 tests.
- `pnpm --dir codex-gui exec vitest --run src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts` passed: 1 file, 10 tests.
- `pnpm --dir codex-gui exec vitest --run src/features/snapshotReplay/__tests__/snapshotReplay.test.ts` passed: 1 file, 5 tests.
- `pnpm --dir codex-gui exec vitest --run src/features/projection/__tests__/projectionFixtures.test.ts` passed: 1 file, 6 tests.
- `pnpm --dir codex-gui run type-check` passed.
