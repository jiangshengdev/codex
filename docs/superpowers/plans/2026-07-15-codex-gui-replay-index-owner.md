# Codex GUI Replay Index Single Owner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the unused Redux copy of the snapshot replay index while preserving the existing Bridge-owned replay classification lifecycle and all external behavior.

**Architecture:** `GuiHostConnectionBridge` remains the only runtime owner of the replay baseline. `threadRuntimeSlice.ts` continues to define the replay types and pure classification helpers, but `ThreadRuntimeRecord` no longer retains the derived index. Characterization tests lock replacement, mismatch, and new-launch-plus-attach behavior before the state-shape cleanup.

**Tech Stack:** React 19, TypeScript 6, Redux Toolkit 2, Vitest 4 unit tests, Vitest Browser Mode with Playwright providers, pnpm through the user's fnm-managed Node runtime.

---

状态：待确认

设计依据：`docs/superpowers/specs/2026-07-15-codex-gui-replay-index-owner-design.md`

## Scope And File Map

Implementation changes are limited to these files:

- Modify: `codex-gui/src/__tests__/App.browser.test.tsx`
  - Add Bridge-level characterization coverage for accepted replacement attach, mismatched attach after a valid baseline, and new launch followed by a new attach.
- Modify: `codex-gui/src/features/projection/__tests__/projectionTestBuilders.ts`
  - Add one shared legal attach builder for replacing the thread ID.
  - Remove the obsolete Redux index field from `runtimeFromAttach` after the production state shape changes.
- Modify: `codex-gui/src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts`
  - Make the accepted-attach deep-equality assertion describe the reduced runtime record without `snapshotReplayIndex`.
  - Preserve the existing pure replay classification matrix.
- Modify: `codex-gui/src/features/threadRuntime/threadRuntimeSlice.ts`
  - Remove `ThreadRuntimeRecord.snapshotReplayIndex` and the duplicate construction in `threadRuntimeAttached`.

Files explicitly inspected but not modified:

- `codex-gui/src/features/appShell/GuiHostConnectionBridge.tsx`
  - Already owns the only production-used index, resets it on new launch, replaces it after accepted attach, and classifies accepted events.
- `codex-gui/src/features/projectionIngress/projectionIngressAdapter.ts`
  - Acceptance, commit-chain, subscription, and manual reconnect behavior remain unchanged.
- `codex-gui/src/features/snapshotReplay/__tests__/snapshotReplay.test.ts`
  - Continues consuming `runtimeFromAttach`; targeted unit verification protects its fixture shape.
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts`
  - Continues consuming the existing `{ notification, replay }` action payload without changes.

Run all commands in `/Users/jiangsheng/cnb/codex/codex-gui`. Use the exact fnm-backed command prefix shown below. Do not install dependencies or browser binaries. If a required browser binary is missing, stop and report the missing prerequisite.

## Task 1: Lock The Existing Bridge Replay Lifecycle

**Files:**

- Modify: `codex-gui/src/features/projection/__tests__/projectionTestBuilders.ts:76-88`
- Modify: `codex-gui/src/__tests__/App.browser.test.tsx:20-53`
- Modify: `codex-gui/src/__tests__/App.browser.test.tsx:418-448`
- Modify: `codex-gui/src/__tests__/App.browser.test.tsx:746-772`

These are characterization tests for an existing behavior-preserving refactor. They are expected to pass before the production state-shape change.

- [ ] **Step 1: Add a shared legal attach builder for mismatch coverage**

Add this next to `attachWithTurns` in `projectionTestBuilders.ts`:

```ts
export const attachWithThreadId = (
  attach: ThreadProjectionAttachResponse,
  threadId: string,
): ThreadProjectionAttachResponse => ({
  ...attach,
  snapshot: {
    ...attach.snapshot,
    thread: {
      ...attach.snapshot.thread,
      id: threadId,
    },
  },
});
```

Do not add this helper to `appBrowserTestSupport.ts`; projection payload construction remains owned by the shared projection builders.

- [ ] **Step 2: Import the existing replacement fixtures and the new builder**

Extend the projection fixture imports in `App.browser.test.tsx`:

```ts
import {
  attachReplacement,
  closedBackpressure,
  eventAgentMessageDelta,
  eventItemCompleted,
  eventItemStarted,
  eventSubscriptionReplacement,
  eventTurnStarted,
} from "@/features/projection/__tests__/projectionFixtures";
```

Extend the builder imports:

```ts
import {
  agentMessageDelta,
  agentMessage,
  attachWithThreadId,
  attachWithTurns,
  baseTurn,
  inProgressTurn,
  itemCompleted,
  itemStarted,
  turnStarted,
} from "@/features/projection/__tests__/projectionTestBuilders";
```

- [ ] **Step 3: Add accepted replacement baseline coverage**

Add this test beside the existing snapshot-ahead replay test:

```ts
test("App replaces the replay baseline after an accepted replacement attach", async () => {
  const { store } = await renderWithProviders(<App />);
  if (eventSubscriptionReplacement.event.type !== "turnStarted") {
    throw new Error("fixture must contain a replacement turnStarted projection event");
  }

  const oldOnlyTurn = inProgressTurn("old-baseline-only");
  const replacementTurn = eventSubscriptionReplacement.event.notification.turn;
  const oldAttach = attachWithTurns(attachResponse, [oldOnlyTurn]);
  const replacementAttach = attachWithTurns(attachReplacement, [replacementTurn]);
  const options = getHostOptions(startGuiHostConnectionMock);

  attachProjection(options, oldAttach);
  attachProjection(options, replacementAttach);

  const oldOnlyEvent = {
    ...turnStarted(eventSubscriptionReplacement, "commit-old-baseline-only", oldOnlyTurn),
    parentCommitId: replacementAttach.snapshot.headCommitId,
  };
  emitProjectionEvent(options, oldOnlyEvent);

  expect(selectThreadRuntimeEventBuffer(store.getState())).toStrictEqual([
    { type: "projectionEvent", notification: oldOnlyEvent, replay: "live" },
  ]);

  attachProjection(options, replacementAttach);
  emitProjectionEvent(options, eventSubscriptionReplacement);

  expect(selectThreadRuntimeRecord(store.getState())?.snapshotTurns).toStrictEqual([
    replacementTurn,
  ]);
  expect(selectThreadRuntimeEventBuffer(store.getState())).toStrictEqual([
    {
      type: "projectionEvent",
      notification: eventSubscriptionReplacement,
      replay: "snapshotDuplicate",
    },
  ]);
});
```

The second accepted attach intentionally resets the runtime event buffer and adapter head so the new-baseline duplicate assertion remains independent of the old-ID live assertion.

- [ ] **Step 4: Strengthen mismatch coverage around an existing legal baseline**

Replace `App records mismatched attach identity without advancing runtime state` with:

```ts
test("App keeps the accepted replay baseline after a mismatched attach", async () => {
  const { store } = await renderWithProviders(<App />);
  if (eventTurnStarted.event.type !== "turnStarted") {
    throw new Error("fixture must contain a turnStarted projection event");
  }

  const validAttach = attachWithTurns(attachResponse, [eventTurnStarted.event.notification.turn]);
  const validAttachWithOldHead: ThreadProjectionAttachResponse = {
    ...validAttach,
    snapshot: {
      ...validAttach.snapshot,
      headCommitId: eventTurnStarted.parentCommitId,
    },
  };
  const mismatchedThreadId = "00000000-0000-0000-0000-000000000999";
  const mismatchedAttach = attachWithThreadId(attachResponse, mismatchedThreadId);
  const options = getHostOptions(startGuiHostConnectionMock);

  attachProjection(options, validAttachWithOldHead);
  const runtimeBeforeMismatch = selectThreadRuntimeRecord(store.getState());
  attachProjection(options, mismatchedAttach);

  expect(selectThreadIdentityState(store.getState())).toStrictEqual({
    launchThreadId,
    attachedThreadId: mismatchedThreadId,
    attachStatus: "mismatch",
  });
  expect(selectThreadRuntimeRecord(store.getState())).toStrictEqual(runtimeBeforeMismatch);

  emitProjectionEvent(options, eventTurnStarted);

  expect(selectThreadRuntimeEventBuffer(store.getState())).toStrictEqual([
    { type: "projectionEvent", notification: eventTurnStarted, replay: "snapshotDuplicate" },
  ]);
  expect(selectLiveEventMaterials(store.getState())).toStrictEqual([]);
});
```

Do not retain the old `runtime === null` assertions; this scenario intentionally establishes a valid baseline before the mismatch.

- [ ] **Step 5: Add new-launch-plus-attach combination coverage**

Add this test beside the replacement test:

```ts
test("App classifies from the new snapshot after new launch params and attach", async () => {
  const { store } = await renderWithProviders(<App />);
  if (eventSubscriptionReplacement.event.type !== "turnStarted") {
    throw new Error("fixture must contain a replacement turnStarted projection event");
  }

  const oldOnlyTurn = inProgressTurn("old-launch-baseline-only");
  const replacementTurn = eventSubscriptionReplacement.event.notification.turn;
  const options = getHostOptions(startGuiHostConnectionMock);

  attachProjection(options, attachWithTurns(attachResponse, [oldOnlyTurn]));
  options.onLaunchParams?.({ threadId: launchThreadId, token: "replacement-secret" });

  const replacementAttach = attachWithTurns(attachReplacement, [replacementTurn]);
  attachProjection(options, replacementAttach);

  const oldOnlyEvent = {
    ...turnStarted(eventSubscriptionReplacement, "commit-old-launch-baseline", oldOnlyTurn),
    parentCommitId: replacementAttach.snapshot.headCommitId,
  };
  emitProjectionEvent(options, oldOnlyEvent);

  expect(selectThreadRuntimeEventBuffer(store.getState())).toStrictEqual([
    { type: "projectionEvent", notification: oldOnlyEvent, replay: "live" },
  ]);

  options.onLaunchParams?.({ threadId: launchThreadId, token: "replacement-secret-2" });
  attachProjection(options, replacementAttach);
  emitProjectionEvent(options, eventSubscriptionReplacement);

  expect(selectThreadRuntimeEventBuffer(store.getState())).toStrictEqual([
    {
      type: "projectionEvent",
      notification: eventSubscriptionReplacement,
      replay: "snapshotDuplicate",
    },
  ]);
});
```

This is intentionally a combination test. Do not add a classifier, test seam, or public reset API merely to observe the effect-local assignment directly.

- [ ] **Step 6: Format the Task 1 files with the project formatter**

Run:

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt:fix
```

Expected: command exits successfully. Review the worktree immediately; only the two Task 1 files may change. If the formatter changes unrelated files, stop and restore the task boundary before continuing.

- [ ] **Step 7: Run the formatted App browser characterization file**

Run:

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --config=vitest.browser.config.ts --run src/__tests__/App.browser.test.tsx
```

Expected: PASS in every browser instance configured by `vitest.browser.config.ts`. If a browser binary is unavailable, stop and report it; do not install it.

- [ ] **Step 8: Commit the characterization coverage only**

Review and stage only the two test-support files:

```bash
git diff -- src/__tests__/App.browser.test.tsx src/features/projection/__tests__/projectionTestBuilders.ts
git add src/__tests__/App.browser.test.tsx src/features/projection/__tests__/projectionTestBuilders.ts
git diff --cached --check
git diff --cached -- src/__tests__/App.browser.test.tsx src/features/projection/__tests__/projectionTestBuilders.ts
git commit -m "test(gui): cover replay baseline lifecycle"
```

Do not stage the design or plan documents in this task.

## Task 2: Remove The Redux Replay Index Copy

**Files:**

- Modify: `codex-gui/src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts:71-93`
- Modify: `codex-gui/src/features/threadRuntime/threadRuntimeSlice.ts:41-50`
- Modify: `codex-gui/src/features/threadRuntime/threadRuntimeSlice.ts:111-125`
- Modify: `codex-gui/src/features/projection/__tests__/projectionTestBuilders.ts:1-12`
- Modify: `codex-gui/src/features/projection/__tests__/projectionTestBuilders.ts:90-104`
- Verify: `codex-gui/src/features/snapshotReplay/__tests__/snapshotReplay.test.ts`

- [ ] **Step 1: Change the deep-equality test first**

In `threadRuntimeSlice.test.ts`, update `creates a runtime baseline from an accepted attach` so its expected object is:

```ts
expect(state.current).toStrictEqual({
  threadId: attachBaseline.snapshot.thread.id,
  sessionId: attachBaseline.snapshot.thread.sessionId,
  thread: threadMetadata,
  snapshotTurns,
  eventBuffer: [],
  activeTurnId: null,
  subscription: { state: "active" },
});
```

Keep the `snapshotReplayIndexFromTurns` import because the pure classification tests later in the same file still use it.

- [ ] **Step 2: Run the focused unit test and verify RED**

Run:

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run test:unit -- src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts
```

Expected: FAIL in `creates a runtime baseline from an accepted attach`, with the received object containing the extra `snapshotReplayIndex` field. If it fails for another reason, stop and diagnose before editing production code.

- [ ] **Step 3: Remove the retained field from the production runtime record**

Update `ThreadRuntimeRecord` in `threadRuntimeSlice.ts` to:

```ts
export type ThreadRuntimeRecord = {
  threadId: string;
  sessionId: string;
  thread: Omit<Thread, "turns">;
  snapshotTurns: Turn[];
  eventBuffer: ThreadRuntimeBufferedEvent[];
  activeTurnId: string | null;
  subscription: ThreadRuntimeSubscription;
};
```

Update the `threadRuntimeAttached` reducer assignment to:

```ts
state.current = {
  threadId: thread.id,
  sessionId: thread.sessionId,
  thread,
  snapshotTurns,
  eventBuffer: [],
  activeTurnId: activeTurnIdFromSnapshot(snapshotTurns),
  subscription: { state: "active" },
};
```

Do not remove or move these exports; Bridge and the classification matrix still require them:

```ts
export type SnapshotReplayIndex = { /* existing shape */ };
export const snapshotReplayIndexFromTurns = /* existing implementation */;
export const replayForProjectionEvent = /* existing implementation */;
```

- [ ] **Step 4: Align the shared runtime fixture with the production state shape**

In `projectionTestBuilders.ts`, replace the combined import with a type-only import:

```ts
import type { ThreadRuntimeRecord } from "@/features/threadRuntime/threadRuntimeSlice";
```

Update `runtimeFromAttach` to:

```ts
export const runtimeFromAttach = (attach: ThreadProjectionAttachResponse): ThreadRuntimeRecord => {
  const { turns: snapshotTurns, ...thread } = attach.snapshot.thread;

  return {
    threadId: thread.id,
    sessionId: thread.sessionId,
    thread,
    snapshotTurns,
    eventBuffer: [],
    activeTurnId:
      snapshotTurns.toReversed().find((turn) => turn.status === "inProgress")?.id ?? null,
    subscription: { state: "active" },
  };
};
```

Keep `runtimeFromAttach` in its current owner. Moving this helper belongs to conditional B08 and is outside this plan.

- [ ] **Step 5: Run focused unit tests and verify GREEN**

Run:

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run test:unit -- src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts src/features/snapshotReplay/__tests__/snapshotReplay.test.ts
```

Expected: PASS. This verifies the new runtime record shape and the unchanged snapshot replay consumers.

- [ ] **Step 6: Re-run the Bridge characterization tests**

Run:

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --config=vitest.browser.config.ts --run src/__tests__/App.browser.test.tsx
```

Expected: PASS in all configured browser instances, with replacement, mismatch, and new-launch-plus-attach classification unchanged.

- [ ] **Step 7: Format the changed frontend files**

Run:

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt:fix
```

Expected: command exits successfully. Review the diff and stop if unrelated files were changed.
If this command changes either Task 1 file after its commit, stop and return to the Task 1 boundary instead of carrying that change into the Task 2 commit.

- [ ] **Step 8: Re-run focused verification after formatting**

Run:

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run test:unit -- src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts src/features/snapshotReplay/__tests__/snapshotReplay.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --config=vitest.browser.config.ts --run src/__tests__/App.browser.test.tsx
```

Expected: both commands PASS. This is the final test run for Task 2; do not rerun these tests after the commit unless the staged diff changes.

- [ ] **Step 9: Commit the state-shape cleanup**

Review and stage only the B04 implementation files:

```bash
git diff -- src/features/threadRuntime/threadRuntimeSlice.ts src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts src/features/projection/__tests__/projectionTestBuilders.ts
git add src/features/threadRuntime/threadRuntimeSlice.ts src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts src/features/projection/__tests__/projectionTestBuilders.ts
git diff --cached --check
git diff --cached -- src/features/threadRuntime/threadRuntimeSlice.ts src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts src/features/projection/__tests__/projectionTestBuilders.ts
git commit -m "refactor(gui): remove duplicate replay index state"
```

Do not stage the design or plan documents in this task.

## Task 3: Run Final Frontend Verification

**Files:**

- Verify: `codex-gui/package.json`
- Verify: all files changed by Tasks 1-2

- [ ] **Step 1: Confirm the fnm-managed pnpm runtime**

Run:

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm --version
```

Expected: a pnpm version from the user's fnm-managed environment. If the executable resolves under `/Users/jiangsheng/.cache/codex-runtimes/`, stop.

- [ ] **Step 2: Run the canonical frontend CI script**

Run:

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run ci
```

Expected: `format:oxfmt`, `lint`, `type-check`, and the complete unit suite all PASS.

- [ ] **Step 3: Run the targeted Browser Mode regression file**

Run:

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --config=vitest.browser.config.ts --run src/__tests__/App.browser.test.tsx
```

Expected: PASS in every configured browser instance. Do not install missing browser binaries.

- [ ] **Step 4: Confirm the single-owner structure and final worktree state**

Run:

```bash
rg -n -e 'snapshotReplayIndex' src/features/threadRuntime src/features/appShell/GuiHostConnectionBridge.tsx src/features/projection/__tests__/projectionTestBuilders.ts
git status --short
```

Expected structural result:

- `snapshotReplayIndex` remains in the pure type/helper definitions, pure classification tests, and the Bridge-local lifecycle.
- No `ThreadRuntimeRecord` field, attach reducer assignment, or `runtimeFromAttach` fixture property remains.
- Only the already-authorized design and plan documents may remain untracked; no source or test changes remain unstaged or uncommitted.

No commit is created in Task 3 unless verification itself changes files. If verification changes files, stop, inspect the scope, and return to the relevant task rather than making an unplanned cleanup commit.

## Plan Boundaries

- Do not modify `GuiHostConnectionBridge.tsx`; its current local owner is the selected design.
- Do not modify `ProjectionIngressAdapter`, adapter outcomes, commit-chain rules, subscription filtering, or manual reconnect behavior.
- Do not modify runtime action payloads, event buffer semantics, transcript reducers, snapshot/live materialization, transport, wire protocol, or Rust code.
- Do not add a classifier, coordinator, hook, service, listener, thunk, middleware, test seam, or public reset API.
- Do not move `runtimeFromAttach`; conditional B08 owns any future helper relocation.
- Do not add UI snapshots, e2e coverage, build verification, full Browser Mode runs, dependency installation, or browser installation.
- Do not stage or commit the design and plan documents as part of implementation tasks unless the user separately requests their submission.
- Do not use Git remote commands.

## Completion Criteria

- The three App-level lifecycle scenarios pass before and after the state-shape cleanup.
- `ThreadRuntimeRecord` no longer contains `snapshotReplayIndex`.
- `threadRuntimeAttached` no longer constructs or stores the Redux index copy.
- `runtimeFromAttach` matches the new runtime record shape without moving owners.
- The pure classification helpers and their existing matrix remain unchanged.
- `pnpm run ci` passes under fnm-managed pnpm.
- The targeted `App.browser.test.tsx` Browser Mode run passes in all configured instances.
- The final structural search shows exactly one production-retained index: the Bridge-local lifecycle owner.
