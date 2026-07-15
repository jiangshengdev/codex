# Thread Runtime Accepted Delta Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the unused single-delta Redux action so `threadRuntimeDeltasAccepted` is the only accepted-delta contract, while preserving batching, Transcript State, scroll, selector, and rendering behavior.

**Architecture:** Keep the current production path from `ProjectionApplicationCoordinator` through one batch action into the Transcript State batch reducer. Replace test-only single action inputs with singleton batches, make internal projection helpers depend directly on `ThreadProjectionDeltaNotification`, and delete the obsolete single-action reducer/helper path without changing the batch algorithm.

**Tech Stack:** TypeScript 6, Redux Toolkit, React 19, Vitest Node tests, Vitest Browser Mode with Playwright, pnpm through the repository's fnm-managed toolchain.

---

状态：已确认

设计依据：`docs/superpowers/specs/2026-07-15-codex-gui-thread-runtime-accepted-delta-contract-design.md`

## Scope And File Map

Modify production code:

- `codex-gui/src/features/threadRuntime/threadRuntimeSlice.ts`
  - Removes the single-delta payload, reducer, and action export; retains the batch signal.
- `codex-gui/src/features/projectionCoordination/projectionApplicationCoordinator.ts`
  - Uses `ThreadProjectionDeltaNotification` directly for the enqueue parameter.
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts`
  - Removes the single-delta extra reducer case.
- `codex-gui/src/features/transcriptState/transcriptLiveProjection.ts`
  - Removes the single-delta helper path and types the batch helper directly from the generated protocol notification.

Modify tests:

- `codex-gui/src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts`
- `codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveItemLifecycle.test.ts`
- `codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveStreaming.test.ts`
- `codex-gui/src/features/transcriptState/__tests__/transcriptStateReconnect.test.ts`
- `codex-gui/src/features/transcriptState/__tests__/transcriptStateScrollSignals.test.ts`
- `codex-gui/src/features/transcriptState/__tests__/transcriptStateSelectorCache.test.ts`
- `codex-gui/src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx`

Validate without modifying:

- `codex-gui/src/features/projectionCoordination/__tests__/projectionApplicationCoordinator.test.ts`
  - Confirms production coordination still emits only batch actions with unchanged flush behavior.

Do not modify:

- `codex-gui/src/features/projectionIngress/**`
- `codex-gui/src/features/guiHost/**`
- Transcript State models, selectors, committed projection, render components, or styles
- generated protocol files, Rust, timeline material, old specs/plans, or audit reports

All pnpm commands below use `cwd=/Users/jiangsheng/cnb/codex/codex-gui` and the fnm-managed runtime. Do not install or update dependencies.

This is a behavior-preserving contract cleanup. Do not add a negative test that only asserts the deleted symbol is absent. Existing behavioral tests are migrated to the surviving contract, and the final source search verifies that the obsolete contract has no remaining code references.

## Task 1: Migrate Tests And Remove The Single-Delta Contract

**Files:**

- Modify: `codex-gui/src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts`
- Modify: `codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveItemLifecycle.test.ts`
- Modify: `codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveStreaming.test.ts`
- Modify: `codex-gui/src/features/transcriptState/__tests__/transcriptStateReconnect.test.ts`
- Modify: `codex-gui/src/features/transcriptState/__tests__/transcriptStateScrollSignals.test.ts`
- Modify: `codex-gui/src/features/transcriptState/__tests__/transcriptStateSelectorCache.test.ts`
- Modify: `codex-gui/src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx`
- Modify: `codex-gui/src/features/threadRuntime/threadRuntimeSlice.ts`
- Modify: `codex-gui/src/features/projectionCoordination/projectionApplicationCoordinator.ts`
- Modify: `codex-gui/src/features/transcriptState/transcriptStateSlice.ts`
- Modify: `codex-gui/src/features/transcriptState/transcriptLiveProjection.ts`
- Validate: `codex-gui/src/features/projectionCoordination/__tests__/projectionApplicationCoordinator.test.ts`

- [ ] **Step 1: Migrate Thread Runtime contract tests to the batch-only surface**

In `threadRuntimeSlice.test.ts`, remove `threadRuntimeDeltaAccepted` from the import and the local action union:

```ts
const reduce = (
  state: ThreadRuntimeState | undefined,
  action:
    | ReturnType<typeof threadRuntimeAttached>
    | ReturnType<typeof threadRuntimeDeltasAccepted>
    | ReturnType<typeof threadRuntimeEventBuffered>
    | ReturnType<typeof threadRuntimeManualReconnectRequired>,
) => threadRuntimeSlice.reducer(state, action);
```

Delete the test named `exports accepted projection delta actions without mutating runtime buffers`. Keep the existing batch action test and its `ThreadRuntimeProjectionDeltasPayload` type assertion unchanged.

- [ ] **Step 2: Migrate every test-only single delta input to a singleton batch**

In each listed Transcript State and browser test, replace the action import with `threadRuntimeDeltasAccepted`. Replace each dispatch independently using this exact shape:

```ts
store.dispatch(
  threadRuntimeDeltasAccepted({
    notifications: [
      agentMessageDelta(
        eventAgentMessageDelta,
        "turn-id",
        "item-id",
        "delta text",
      ),
    ],
  }),
);
```

Apply the wrapper to the existing notification expression rather than replacing fixture values. The affected call counts are:

- one dispatch in `transcriptStateLiveItemLifecycle.test.ts`;
- three dispatches in `transcriptStateLiveStreaming.test.ts`;
- one dispatch in `transcriptStateReconnect.test.ts`;
- one dispatch in `transcriptStateScrollSignals.test.ts`;
- one dispatch in `transcriptStateSelectorCache.test.ts`;
- one dispatch in `CommittedTranscriptSurface.browser.test.tsx`.

The first live-streaming test currently dispatches `"Hello"` and `" world"` separately. Keep them as two independent singleton-batch dispatches so the expected `revision: 2` and the existing scroll semantics remain unchanged:

```ts
store.dispatch(
  threadRuntimeDeltasAccepted({
    notifications: [
      agentMessageDelta(
        eventAgentMessageDelta,
        "turn-streaming",
        "agent-streaming",
        "Hello",
      ),
    ],
  }),
);
store.dispatch(
  threadRuntimeDeltasAccepted({
    notifications: [
      agentMessageDelta(
        eventAgentMessageDelta,
        "turn-streaming",
        "agent-streaming",
        " world",
      ),
    ],
  }),
);
```

Do not change existing multi-notification batch tests or their `revision: 1` assertions.

- [ ] **Step 3: Run the migrated Node tests as characterization coverage**

Run:

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run \
  src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts \
  src/features/transcriptState/__tests__/transcriptStateLiveItemLifecycle.test.ts \
  src/features/transcriptState/__tests__/transcriptStateLiveStreaming.test.ts \
  src/features/transcriptState/__tests__/transcriptStateReconnect.test.ts \
  src/features/transcriptState/__tests__/transcriptStateScrollSignals.test.ts \
  src/features/transcriptState/__tests__/transcriptStateSelectorCache.test.ts
```

Expected: PASS. The surviving batch action already supports singleton inputs, so this step proves that the test contract can migrate without changing behavior before production symbols are removed.

- [ ] **Step 4: Remove the obsolete Thread Runtime action and payload**

In `threadRuntimeSlice.ts`, delete:

```ts
export type ThreadRuntimeProjectionDeltaPayload = {
  notification: ThreadProjectionDeltaNotification;
};
```

Delete the `threadRuntimeDeltaAccepted` reducer:

```ts
threadRuntimeDeltaAccepted: create.reducer(
  // eslint-disable-next-line @typescript-eslint/no-empty-function -- Accepted projection deltas are a cross-slice signal; runtime intentionally does not mutate buffers.
  (_state, _action: PayloadAction<ThreadRuntimeProjectionDeltaPayload>) => {},
),
```

Remove `threadRuntimeDeltaAccepted` from the destructured action exports. Keep `ThreadProjectionDeltaNotification`, `ThreadRuntimeProjectionDeltasPayload`, and `threadRuntimeDeltasAccepted` because they remain the batch payload and action contract.

- [ ] **Step 5: Make Projection Coordination depend directly on the protocol type**

In `projectionApplicationCoordinator.ts`, remove the type-only `threadRuntimeDeltaAccepted` import. Replace `enqueueProjectionDelta` with:

```ts
private enqueueProjectionDelta(notification: ThreadProjectionDeltaNotification): void {
  this.pendingDeltaNotifications.push(notification);
  this.schedulePendingDeltaFlush();
}
```

Do not change the pending queue, RAF scheduling, flush boundaries, dispatch order, or `threadRuntimeDeltasAccepted({ notifications })` call.

- [ ] **Step 6: Remove the Transcript State single-delta reducer path**

In `transcriptStateSlice.ts`:

- remove `threadRuntimeDeltaAccepted` from the Thread Runtime imports;
- remove `applyAcceptedProjectionDelta` from the live projection imports;
- delete this extra reducer case:

```ts
.addCase(threadRuntimeDeltaAccepted, (state, action) => {
  applyAcceptedProjectionDelta(state, action.payload.notification);
})
```

Keep the `threadRuntimeDeltasAccepted` case exactly as the sole accepted-delta consumer:

```ts
.addCase(threadRuntimeDeltasAccepted, (state, action) => {
  applyAcceptedProjectionDeltaBatch(state, action.payload.notifications);
})
```

- [ ] **Step 7: Remove the Transcript State single-delta helper and use the protocol type**

In `transcriptLiveProjection.ts`, remove the Thread Runtime action type import and use the generated protocol types directly:

```ts
import type { ThreadItem, ThreadProjectionDeltaNotification } from "@codex-protocol/v2";
```

Delete `appendAgentMessageDeltaToLiveItem` and `applyAcceptedProjectionDelta` entirely. Change the batch helper signature to:

```ts
export const applyAcceptedProjectionDeltaBatch = (
  state: TranscriptState,
  notifications: ThreadProjectionDeltaNotification[],
) => {
```

Keep `AgentMessageDeltaBucket`, `appendDeltaToLiveItem`, ordered `deltas`, `join("")`, wrong-thread filtering, unsupported-delta filtering, and missing-live-item no-op behavior unchanged.

- [ ] **Step 8: Run the focused Node tests after production removal**

Run:

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run \
  src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts \
  src/features/projectionCoordination/__tests__/projectionApplicationCoordinator.test.ts \
  src/features/transcriptState/__tests__/transcriptStateLiveItemLifecycle.test.ts \
  src/features/transcriptState/__tests__/transcriptStateLiveStreaming.test.ts \
  src/features/transcriptState/__tests__/transcriptStateReconnect.test.ts \
  src/features/transcriptState/__tests__/transcriptStateScrollSignals.test.ts \
  src/features/transcriptState/__tests__/transcriptStateSelectorCache.test.ts
```

Expected: PASS with the existing number of tests minus the deleted single-action Thread Runtime no-op test.

- [ ] **Step 9: Run the focused browser regression**

Run:

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest \
  --config=vitest.browser.config.ts \
  --browser=chromium \
  --run \
  src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx
```

Expected: PASS. The live assistant Markdown remains visible and the committed transcript scroll key assertion remains unchanged.

- [ ] **Step 10: Verify the obsolete source contract is gone**

Run from `/Users/jiangsheng/cnb/codex`:

```bash
rg -n -e 'threadRuntimeDeltaAccepted|ThreadRuntimeProjectionDeltaPayload|applyAcceptedProjectionDelta\b|appendAgentMessageDeltaToLiveItem\b' 'codex-gui/src'
```

Expected: no matches and exit status 1. Do not search historical specs or plans; they intentionally preserve the old implementation record.

- [ ] **Step 11: Format the touched files with the repository formatter**

Run:

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec oxfmt --write \
  src/features/threadRuntime/threadRuntimeSlice.ts \
  src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts \
  src/features/projectionCoordination/projectionApplicationCoordinator.ts \
  src/features/transcriptState/transcriptStateSlice.ts \
  src/features/transcriptState/transcriptLiveProjection.ts \
  src/features/transcriptState/__tests__/transcriptStateLiveItemLifecycle.test.ts \
  src/features/transcriptState/__tests__/transcriptStateLiveStreaming.test.ts \
  src/features/transcriptState/__tests__/transcriptStateReconnect.test.ts \
  src/features/transcriptState/__tests__/transcriptStateScrollSignals.test.ts \
  src/features/transcriptState/__tests__/transcriptStateSelectorCache.test.ts \
  src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx
```

Inspect the diff and confirm the formatter did not touch files outside the B06 scope.

- [ ] **Step 12: Run final non-fix verification**

Run:

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec oxfmt --check \
  src/features/threadRuntime/threadRuntimeSlice.ts \
  src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts \
  src/features/projectionCoordination/projectionApplicationCoordinator.ts \
  src/features/transcriptState/transcriptStateSlice.ts \
  src/features/transcriptState/transcriptLiveProjection.ts \
  src/features/transcriptState/__tests__/transcriptStateLiveItemLifecycle.test.ts \
  src/features/transcriptState/__tests__/transcriptStateLiveStreaming.test.ts \
  src/features/transcriptState/__tests__/transcriptStateReconnect.test.ts \
  src/features/transcriptState/__tests__/transcriptStateScrollSignals.test.ts \
  src/features/transcriptState/__tests__/transcriptStateSelectorCache.test.ts \
  src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx
/opt/homebrew/bin/fnm exec --using-file pnpm run lint
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
```

Expected: all commands PASS. If lint, type-check, formatting, or tests fail because of this B06 change and the fix stays within the listed files and accepted behavior, fix it and repeat the relevant non-fix check without asking for another decision.

- [ ] **Step 13: Review and commit the atomic B06 implementation**

From `/Users/jiangsheng/cnb/codex`, inspect the exact diff:

```bash
git status --short
git diff --check
git diff -- \
  codex-gui/src/features/threadRuntime/threadRuntimeSlice.ts \
  codex-gui/src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts \
  codex-gui/src/features/projectionCoordination/projectionApplicationCoordinator.ts \
  codex-gui/src/features/transcriptState/transcriptStateSlice.ts \
  codex-gui/src/features/transcriptState/transcriptLiveProjection.ts \
  codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveItemLifecycle.test.ts \
  codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveStreaming.test.ts \
  codex-gui/src/features/transcriptState/__tests__/transcriptStateReconnect.test.ts \
  codex-gui/src/features/transcriptState/__tests__/transcriptStateScrollSignals.test.ts \
  codex-gui/src/features/transcriptState/__tests__/transcriptStateSelectorCache.test.ts \
  codex-gui/src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx
```

Expected: only the B06 production and test files above are changed; no design, plan, audit, protocol, transport, rendering, style, dependency, or generated files are included.

Stage and create one independent implementation commit:

```bash
git add -- \
  codex-gui/src/features/threadRuntime/threadRuntimeSlice.ts \
  codex-gui/src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts \
  codex-gui/src/features/projectionCoordination/projectionApplicationCoordinator.ts \
  codex-gui/src/features/transcriptState/transcriptStateSlice.ts \
  codex-gui/src/features/transcriptState/transcriptLiveProjection.ts \
  codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveItemLifecycle.test.ts \
  codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveStreaming.test.ts \
  codex-gui/src/features/transcriptState/__tests__/transcriptStateReconnect.test.ts \
  codex-gui/src/features/transcriptState/__tests__/transcriptStateScrollSignals.test.ts \
  codex-gui/src/features/transcriptState/__tests__/transcriptStateSelectorCache.test.ts \
  codex-gui/src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx
git diff --cached --check
git commit -m 'refactor(gui): remove single accepted delta action'
```

Expected: one local B06 implementation commit. Do not push, fetch, pull, or otherwise operate on Git remotes.

## Completion Gate

B06 is complete only when:

- `threadRuntimeDeltasAccepted` is the only accepted-delta Redux action in `codex-gui/src`;
- internal notification typing uses `ThreadProjectionDeltaNotification` directly;
- singleton test batches preserve prior dispatch boundaries;
- focused Node and browser tests pass;
- scoped format, full lint, and type-check pass;
- the implementation diff remains inside the accepted B06 file boundary;
- the implementation is recorded in one local commit independent from B05 and later P2 batches.
