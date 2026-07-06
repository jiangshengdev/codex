# GUI Streaming Support 02f Projection Delta RAF Batch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Batch accepted `thread/projection/delta` notifications in `GuiHostConnectionBridge` so high-frequency streaming deltas produce at most one Redux write per animation frame unless a structural projection message requires an immediate flush.

**Architecture:** The GUI host client and `ProjectionIngressAdapter` remain synchronous per-notification protocol layers. `GuiHostConnectionBridge` owns a frame-scoped pending-delta buffer and dispatches a new `threadRuntimeDeltasAccepted` cross-slice action. `transcriptState` handles the batch action by applying each notification in order with the same reducer logic used by the existing single-delta action.

**Tech Stack:** TypeScript, React, Redux Toolkit slice reducers, Vitest Browser Mode, Vitest unit tests, codex-gui projection fixtures/builders.

---

## Context

Design spec:

- `/Users/jiangsheng/cnb/codex/docs/superpowers/specs/2026-07-03-codex-gui-streaming-support/02-f-projection-delta-raf-batch-design.md`

This plan implements hot path 08 only:

- Reduce Redux dispatch frequency for accepted projection deltas.
- Preserve projection ordering by flushing pending deltas before structural outcomes.
- Keep delta notifications unmerged inside the batch action.

This plan intentionally does not implement hot path 09. The reducer can continue using the current `transientText += delta` behavior after this plan.

Important repo rules for execution:

- Before editing files under `codex-gui/**`, read `/Users/jiangsheng/cnb/codex/codex-gui/AGENTS.md`.
- Before running `pnpm` in `/Users/jiangsheng/cnb/codex/codex-gui`, use the user's fnm-backed toolchain:

```zsh
/opt/homebrew/bin/fnm exec --using-file pnpm --version
/opt/homebrew/bin/fnm exec --using-file which pnpm
```

- Stop if `which pnpm` points under `/Users/jiangsheng/.cache/codex-runtimes/`.
- Use shared legal projection fixtures/builders from `src/features/projection/__tests__/projectionFixtures.ts` and `src/features/projection/__tests__/projectionTestBuilders.ts`.
- Commit at the end of each task after its focused verification passes.

## File Structure

- Modify: `/Users/jiangsheng/cnb/codex/codex-gui/src/__tests__/appBrowserTestSupport.ts`
  - Adds a delta emission helper that mirrors existing attach/event/closed helpers.
- Modify: `/Users/jiangsheng/cnb/codex/codex-gui/src/__tests__/App.browser.test.tsx`
  - Owns bridge-level browser tests for RAF batching, structural synchronous flush, and cleanup cancellation.
- Modify: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/threadRuntime/threadRuntimeSlice.ts`
  - Adds `ThreadRuntimeProjectionDeltasPayload` and `threadRuntimeDeltasAccepted` as a batch cross-slice signal.
- Modify: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts`
  - Locks the batch action payload type and confirms runtime state remains unchanged.
- Modify: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/transcriptState/transcriptStateSlice.ts`
  - Handles `threadRuntimeDeltasAccepted` by applying each notification in order.
- Modify: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts`
  - Verifies batch delta handling is equivalent to sequential single-delta actions.
- Modify: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/appShell/GuiHostConnectionBridge.tsx`
  - Owns the pending-delta buffer, RAF scheduling, synchronous flush before structural outcomes, and cleanup cancellation.

## Task 0: Commit accepted 02f design and plan docs

**Files:**

- Include: `/Users/jiangsheng/cnb/codex/docs/superpowers/specs/2026-07-03-codex-gui-streaming-support/02-f-projection-delta-raf-batch-design.md`
- Include: `/Users/jiangsheng/cnb/codex/docs/superpowers/plans/2026-07-03-codex-gui-streaming-support-02-f-projection-delta-raf-batch.md`

- [ ] **Step 1: Confirm the docs-only diff**

Run:

```zsh
cd /Users/jiangsheng/cnb/codex
git status --short
git diff -- docs/superpowers/specs/2026-07-03-codex-gui-streaming-support/02-f-projection-delta-raf-batch-design.md docs/superpowers/plans/2026-07-03-codex-gui-streaming-support-02-f-projection-delta-raf-batch.md
git diff --check -- docs/superpowers/specs/2026-07-03-codex-gui-streaming-support/02-f-projection-delta-raf-batch-design.md docs/superpowers/plans/2026-07-03-codex-gui-streaming-support-02-f-projection-delta-raf-batch.md
```

Expected:

- The only staged or unstaged docs intended for this task are the 02f design and plan.
- `git diff --check` has no output.

- [ ] **Step 2: Commit the design and plan**

Run:

```zsh
cd /Users/jiangsheng/cnb/codex
git add docs/superpowers/specs/2026-07-03-codex-gui-streaming-support/02-f-projection-delta-raf-batch-design.md docs/superpowers/plans/2026-07-03-codex-gui-streaming-support-02-f-projection-delta-raf-batch.md
git diff --cached --check
git diff --cached --stat
git commit -m "Document projection delta RAF batching"
```

Expected: one docs-only local commit containing the accepted 02f design and implementation plan.

## Task 1: Lock bridge RAF batching behavior with browser tests

**Files:**

- Modify: `/Users/jiangsheng/cnb/codex/codex-gui/src/__tests__/appBrowserTestSupport.ts`
- Modify: `/Users/jiangsheng/cnb/codex/codex-gui/src/__tests__/App.browser.test.tsx`

- [ ] **Step 1: Read codex-gui local instructions**

Run:

```zsh
sed -n '1,240p' /Users/jiangsheng/cnb/codex/codex-gui/AGENTS.md
```

Expected: instructions are read before touching `codex-gui/**` files.

- [ ] **Step 2: Add a projection delta test helper**

In `/Users/jiangsheng/cnb/codex/codex-gui/src/__tests__/appBrowserTestSupport.ts`, add this helper after `emitProjectionEvent`:

```ts
export const emitProjectionDelta = (
  options: StartGuiHostConnectionOptions,
  notification: Parameters<NonNullable<StartGuiHostConnectionOptions["onProjectionDelta"]>>[0],
): void => {
  options.onProjectionDelta?.(notification);
};
```

Expected: the helper mirrors `emitProjectionEvent` and uses the existing `StartGuiHostConnectionOptions` type.

- [ ] **Step 3: Import delta fixtures and selectors in App browser tests**

In `/Users/jiangsheng/cnb/codex/codex-gui/src/__tests__/App.browser.test.tsx`, update the support import to include `emitProjectionDelta`:

```ts
import {
  attachProjection,
  attachResponse,
  attachWithCommittedMessages,
  createGuiHostCommands,
  emitProjectionClosed,
  emitProjectionDelta,
  emitProjectionEvent,
  getCleanupConnectionCallCount,
  getHostOptions,
  launchThreadId,
  markCommandsReady,
  markHostAttached,
  resetAppBrowserTestSupport,
  type StartGuiHostConnectionMock,
} from "./appBrowserTestSupport";
```

Update the projection fixture import to include `eventAgentMessageDelta`:

```ts
import {
  closedBackpressure,
  eventAgentMessageDelta,
  eventItemCompleted,
  eventItemStarted,
  eventTurnStarted,
} from "@/features/projection/__tests__/projectionFixtures";
```

Update the projection builder import to include `agentMessageDelta` and `itemStarted`:

```ts
import {
  agentMessage,
  agentMessageDelta,
  attachWithTurns,
  baseTurn,
  itemCompleted,
  itemStarted,
} from "@/features/projection/__tests__/projectionTestBuilders";
```

Update the transcript selector imports by adding this import block near the thread runtime imports:

```ts
import {
  selectTranscriptEntry,
  selectTranscriptLiveItem,
} from "@/features/transcriptState/transcriptStateSlice";
```

Expected: TypeScript can reference the shared legal delta fixture and transcript selectors in the new tests.

- [ ] **Step 4: Add a failing test for frame batching**

In `/Users/jiangsheng/cnb/codex/codex-gui/src/__tests__/App.browser.test.tsx`, add this test after `App dispatches accepted host projection payloads into thread runtime`:

```ts
test("App batches accepted projection deltas until the next animation frame", async () => {
  vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame"] });
  try {
    const { store } = await renderWithProviders(<App />);
    const options = getHostOptions(startGuiHostConnectionMock);
    const initialItem = agentMessage("agent-raf-batch", "");

    attachProjection(options, attachWithTurns(attachResponse, []));
    emitProjectionEvent(
      options,
      itemStarted(eventItemStarted, "commit-raf-batch-started", "turn-raf-batch", initialItem),
    );

    emitProjectionDelta(
      options,
      agentMessageDelta(eventAgentMessageDelta, "turn-raf-batch", "agent-raf-batch", "Hello"),
    );
    emitProjectionDelta(
      options,
      agentMessageDelta(eventAgentMessageDelta, "turn-raf-batch", "agent-raf-batch", " world"),
    );

    expect(
      selectTranscriptLiveItem(store.getState(), "turn-raf-batch", "agent-raf-batch"),
    ).toStrictEqual({
      key: "turn-raf-batch:agent-raf-batch",
      turnId: "turn-raf-batch",
      itemId: "agent-raf-batch",
      status: "started",
      initialItem,
      transientText: "",
      revision: 0,
    });

    vi.advanceTimersToNextFrame();

    expect(
      selectTranscriptLiveItem(store.getState(), "turn-raf-batch", "agent-raf-batch"),
    ).toStrictEqual({
      key: "turn-raf-batch:agent-raf-batch",
      turnId: "turn-raf-batch",
      itemId: "agent-raf-batch",
      status: "streaming",
      initialItem,
      transientText: "Hello world",
      revision: 2,
    });
  } finally {
    vi.useRealTimers();
  }
});
```

Expected before implementation: FAIL because deltas are currently applied immediately before the frame advances.

- [ ] **Step 5: Add a regression test for event-before-frame synchronous flush**

In the same file, add this test after the frame batching test:

```ts
test("App flushes pending projection deltas before structural projection events", async () => {
  vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame"] });
  try {
    const { store } = await renderWithProviders(<App />);
    const options = getHostOptions(startGuiHostConnectionMock);
    const initialItem = agentMessage("agent-raf-flush-event", "");

    attachProjection(options, attachWithTurns(attachResponse, []));
    emitProjectionEvent(
      options,
      itemStarted(
        eventItemStarted,
        "commit-raf-flush-event-started",
        "turn-raf-flush-event",
        initialItem,
      ),
    );

    emitProjectionDelta(
      options,
      agentMessageDelta(
        eventAgentMessageDelta,
        "turn-raf-flush-event",
        "agent-raf-flush-event",
        "Transient before completion",
      ),
    );
    emitProjectionEvent(
      options,
      itemCompleted(
        eventItemCompleted,
        "commit-raf-flush-event-completed",
        "turn-raf-flush-event",
        agentMessage("agent-raf-flush-event", "Completed answer"),
      ),
    );

    expect(
      selectTranscriptLiveItem(store.getState(), "turn-raf-flush-event", "agent-raf-flush-event"),
    ).toBeNull();
    expect(selectTranscriptEntry(store.getState(), "agent-raf-flush-event")).toStrictEqual({
      type: "message",
      id: "agent-raf-flush-event",
      turnId: "turn-raf-flush-event",
      role: "assistant",
      source: "Completed answer",
      sourceKind: "markdown",
      phase: "final_answer",
      revision: 0,
    });
  } finally {
    vi.useRealTimers();
  }
});
```

Expected before implementation: this may pass before production changes because current code applies deltas immediately. Keep it as a regression test for the buffered implementation so a later RAF-only implementation cannot reverse delta/event order.

- [ ] **Step 6: Add a failing test for cleanup cancellation**

In the same file, add this test after `App closes the host connection when unmounted`:

```ts
test("App cancels pending projection delta frame dispatch when unmounted", async () => {
  vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame"] });
  try {
    const screen = await renderWithProviders(<App />);
    const { store } = screen;
    const options = getHostOptions(startGuiHostConnectionMock);
    const initialItem = agentMessage("agent-raf-cleanup", "");

    attachProjection(options, attachWithTurns(attachResponse, []));
    emitProjectionEvent(
      options,
      itemStarted(eventItemStarted, "commit-raf-cleanup-started", "turn-raf-cleanup", initialItem),
    );
    emitProjectionDelta(
      options,
      agentMessageDelta(eventAgentMessageDelta, "turn-raf-cleanup", "agent-raf-cleanup", "Lost"),
    );

    await screen.unmount();
    vi.advanceTimersToNextFrame();

    expect(getCleanupConnectionCallCount()).toBe(1);
    expect(
      selectTranscriptLiveItem(store.getState(), "turn-raf-cleanup", "agent-raf-cleanup"),
    ).toStrictEqual({
      key: "turn-raf-cleanup:agent-raf-cleanup",
      turnId: "turn-raf-cleanup",
      itemId: "agent-raf-cleanup",
      status: "started",
      initialItem,
      transientText: "",
      revision: 0,
    });
  } finally {
    vi.useRealTimers();
  }
});
```

Expected before implementation: FAIL because current deltas apply immediately before unmount.

- [ ] **Step 7: Run the focused browser test and verify failures**

Run:

```zsh
cd /Users/jiangsheng/cnb/codex/codex-gui
/opt/homebrew/bin/fnm exec --using-file pnpm --version
/opt/homebrew/bin/fnm exec --using-file which pnpm
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --config=vitest.browser.config.ts --run src/__tests__/App.browser.test.tsx
```

Expected:

- `which pnpm` does not point under `/Users/jiangsheng/.cache/codex-runtimes/`.
- At least the frame batching and cleanup cancellation tests fail because current bridge dispatches deltas immediately.

- [ ] **Step 8: Leave Task 1 changes uncommitted**

Run:

```zsh
cd /Users/jiangsheng/cnb/codex
git status --short -- codex-gui/src/__tests__/appBrowserTestSupport.ts codex-gui/src/__tests__/App.browser.test.tsx
```

Expected: the two browser test files are modified and unstaged. Do not commit failing tests separately; Task 3 commits them together with the bridge implementation after the focused browser tests pass.

## Task 2: Add batch delta action and transcriptState batch reducer support

**Files:**

- Modify: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/threadRuntime/threadRuntimeSlice.ts`
- Modify: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts`
- Modify: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/transcriptState/transcriptStateSlice.ts`
- Modify: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts`

- [ ] **Step 1: Add the batch payload type and action expectation test**

In `/Users/jiangsheng/cnb/codex/codex-gui/src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts`, update imports from `../threadRuntimeSlice` to include `threadRuntimeDeltasAccepted` and `type ThreadRuntimeProjectionDeltasPayload`:

```ts
  threadRuntimeDeltasAccepted,
  type ThreadRuntimeProjectionDeltasPayload,
```

Update the `reduce` action union to include:

```ts
    | ReturnType<typeof threadRuntimeDeltasAccepted>
```

After the existing test named `exports accepted projection delta actions without mutating runtime buffers`, add:

```ts
  it("exports accepted projection delta batch actions without mutating runtime buffers", () => {
    expectTypeOf<
      Parameters<typeof threadRuntimeDeltasAccepted>[0]
    >().toEqualTypeOf<ThreadRuntimeProjectionDeltasPayload>();

    const state = reduce(undefined, threadRuntimeAttached(attachBaseline));
    const nextState = reduce(
      state,
      threadRuntimeDeltasAccepted({ notifications: [eventAgentMessageDelta] }),
    );

    expect(nextState).toStrictEqual(state);
    expect(threadRuntimeDeltasAccepted({ notifications: [eventAgentMessageDelta] }).payload)
      .toStrictEqual({
        notifications: [eventAgentMessageDelta],
      });
  });
```

Expected before implementation: FAIL because `threadRuntimeDeltasAccepted` and `ThreadRuntimeProjectionDeltasPayload` do not exist.

- [ ] **Step 2: Implement the batch cross-slice signal**

In `/Users/jiangsheng/cnb/codex/codex-gui/src/features/threadRuntime/threadRuntimeSlice.ts`, add this type after `ThreadRuntimeProjectionDeltaPayload`:

```ts
export type ThreadRuntimeProjectionDeltasPayload = {
  notifications: ThreadProjectionDeltaNotification[];
};
```

Add this reducer immediately after `threadRuntimeDeltaAccepted`:

```ts
    threadRuntimeDeltasAccepted: create.reducer(
      // eslint-disable-next-line @typescript-eslint/no-empty-function -- Accepted projection delta batches are a cross-slice signal; runtime intentionally does not mutate buffers.
      (_state, _action: PayloadAction<ThreadRuntimeProjectionDeltasPayload>) => {},
    ),
```

Add `threadRuntimeDeltasAccepted` to the exported actions:

```ts
  threadRuntimeDeltasAccepted,
```

Expected: thread runtime has an explicit batch signal and still does not store transient deltas.

- [ ] **Step 3: Add a failing transcriptState batch-equivalence test**

In `/Users/jiangsheng/cnb/codex/codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts`, update the thread runtime import to include `threadRuntimeDeltasAccepted`:

```ts
  threadRuntimeDeltasAccepted,
```

After the existing test named `appends accepted agent message deltas into an existing live slot`, add:

```ts
  it("applies accepted agent message delta batches in notification order", () => {
    const singleStore = makeStore();
    const batchStore = makeStore();
    const initialItem = agentMessage("agent-streaming-batch", "");
    const started = itemStarted(
      eventItemStarted,
      "commit-streaming-batch-started",
      "turn-streaming-batch",
      initialItem,
    );
    const firstDelta = agentMessageDelta(
      eventAgentMessageDelta,
      "turn-streaming-batch",
      "agent-streaming-batch",
      "Hello",
    );
    const secondDelta = agentMessageDelta(
      eventAgentMessageDelta,
      "turn-streaming-batch",
      "agent-streaming-batch",
      " world",
    );

    for (const store of [singleStore, batchStore]) {
      store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
      store.dispatch(
        threadRuntimeEventBuffered({
          notification: started,
          replay: "live",
        }),
      );
    }

    singleStore.dispatch(threadRuntimeDeltaAccepted({ notification: firstDelta }));
    singleStore.dispatch(threadRuntimeDeltaAccepted({ notification: secondDelta }));
    batchStore.dispatch(
      threadRuntimeDeltasAccepted({ notifications: [firstDelta, secondDelta] }),
    );

    expect(
      selectTranscriptLiveItem(batchStore.getState(), "turn-streaming-batch", "agent-streaming-batch"),
    ).toStrictEqual(
      selectTranscriptLiveItem(
        singleStore.getState(),
        "turn-streaming-batch",
        "agent-streaming-batch",
      ),
    );
    expect(
      selectTranscriptLiveItemsForTurn(batchStore.getState(), "turn-streaming-batch"),
    ).toStrictEqual(
      selectTranscriptLiveItemsForTurn(singleStore.getState(), "turn-streaming-batch"),
    );
  });
```

Expected before transcriptState implementation: FAIL because batch action is not handled by `transcriptState`.

- [ ] **Step 4: Share delta application logic inside transcriptState**

In `/Users/jiangsheng/cnb/codex/codex-gui/src/features/transcriptState/transcriptStateSlice.ts`, update the thread runtime import to include `threadRuntimeDeltasAccepted`:

```ts
  threadRuntimeDeltasAccepted,
```

Add this helper after `appendAgentMessageDeltaToLiveItem`:

```ts
const applyAcceptedProjectionDelta = (
  state: TranscriptState,
  notification: Parameters<typeof threadRuntimeDeltaAccepted>[0]["notification"],
) => {
  if (state.threadId !== notification.threadId) {
    return;
  }

  switch (notification.delta.type) {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Keep projection deltas handled by discriminant switch.
    case "agentMessage": {
      const { turnId, itemId, delta } = notification.delta.notification;
      appendAgentMessageDeltaToLiveItem(state, turnId, itemId, delta);
      return;
    }
  }
};
```

Replace the current `.addCase(threadRuntimeDeltaAccepted, ...)` body with:

```ts
      .addCase(threadRuntimeDeltaAccepted, (state, action) => {
        applyAcceptedProjectionDelta(state, action.payload.notification);
      })
      .addCase(threadRuntimeDeltasAccepted, (state, action) => {
        for (const notification of action.payload.notifications) {
          applyAcceptedProjectionDelta(state, notification);
        }
      })
```

Expected: single and batch delta actions use the same application path.

- [ ] **Step 5: Run focused reducer tests**

Run:

```zsh
cd /Users/jiangsheng/cnb/codex/codex-gui
/opt/homebrew/bin/fnm exec --using-file pnpm --version
/opt/homebrew/bin/fnm exec --using-file which pnpm
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts
```

Expected:

- `which pnpm` does not point under `/Users/jiangsheng/.cache/codex-runtimes/`.
- The focused reducer tests pass.

- [ ] **Step 6: Commit Task 2**

Run:

```zsh
cd /Users/jiangsheng/cnb/codex
git status --short
git diff -- codex-gui/src/features/threadRuntime/threadRuntimeSlice.ts codex-gui/src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts codex-gui/src/features/transcriptState/transcriptStateSlice.ts codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts
git add codex-gui/src/features/threadRuntime/threadRuntimeSlice.ts codex-gui/src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts codex-gui/src/features/transcriptState/transcriptStateSlice.ts codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts
git diff --cached --check
git diff --cached --stat
git commit -m "Add projection delta batch runtime signal"
```

Expected: one local commit containing only Task 2 reducer/action files. Do not include the failing browser test files from Task 1 in this commit.

## Task 3: Implement bridge RAF batching and structural flush

**Files:**

- Modify: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/appShell/GuiHostConnectionBridge.tsx`
- Modify: `/Users/jiangsheng/cnb/codex/codex-gui/src/__tests__/appBrowserTestSupport.ts`
- Modify: `/Users/jiangsheng/cnb/codex/codex-gui/src/__tests__/App.browser.test.tsx`

- [ ] **Step 1: Import the batch action**

In `/Users/jiangsheng/cnb/codex/codex-gui/src/features/appShell/GuiHostConnectionBridge.tsx`, update the thread runtime import to include `threadRuntimeDeltasAccepted`:

```ts
  threadRuntimeDeltasAccepted,
```

Expected: bridge can dispatch the new batch action from Task 2.

- [ ] **Step 2: Add pending delta buffer state inside the effect**

Inside the `useEffect` body, after `let snapshotReplayIndex: SnapshotReplayIndex | null = null;`, add:

```ts
    let pendingDeltaNotifications: Parameters<typeof threadRuntimeDeltasAccepted>[0]["notifications"] =
      [];
    let pendingDeltaFrame: number | null = null;
```

Expected: buffer state is scoped to the connection bridge effect.

- [ ] **Step 3: Add frame cancellation and flush helpers**

Still inside the `useEffect` body, before `dispatchProjectionOutcome`, add:

```ts
    const cancelPendingDeltaFrame = () => {
      if (pendingDeltaFrame == null) {
        return;
      }

      window.cancelAnimationFrame(pendingDeltaFrame);
      pendingDeltaFrame = null;
    };

    const flushPendingDeltas = () => {
      if (pendingDeltaNotifications.length === 0) {
        cancelPendingDeltaFrame();
        return;
      }

      const notifications = pendingDeltaNotifications;
      pendingDeltaNotifications = [];
      cancelPendingDeltaFrame();
      dispatch(threadRuntimeDeltasAccepted({ notifications }));
    };

    const schedulePendingDeltaFlush = () => {
      if (pendingDeltaFrame != null) {
        return;
      }

      pendingDeltaFrame = window.requestAnimationFrame(() => {
        pendingDeltaFrame = null;
        flushPendingDeltas();
      });
    };

    const enqueueProjectionDelta = (
      notification: Parameters<typeof threadRuntimeDeltaAccepted>[0]["notification"],
    ) => {
      pendingDeltaNotifications.push(notification);
      schedulePendingDeltaFlush();
    };
```

Expected: repeated delta outcomes before the next frame schedule only one frame callback.

- [ ] **Step 4: Flush before structural outcomes and enqueue delta outcomes**

In `dispatchProjectionOutcome`, update the switch cases to:

```ts
        case "attachAccepted":
          flushPendingDeltas();
          dispatch(threadRuntimeAttached(outcome.response));
          return;
        case "eventAccepted":
          flushPendingDeltas();
          dispatch(
            threadRuntimeEventBuffered({
              notification: outcome.notification,
              replay:
                snapshotReplayIndex == null
                  ? "live"
                  : replayForProjectionEvent(snapshotReplayIndex, outcome.notification),
            }),
          );
          return;
        case "deltaAccepted":
          enqueueProjectionDelta(outcome.notification);
          return;
        case "manualReconnectRequired":
          flushPendingDeltas();
          dispatch(
            threadRuntimeManualReconnectRequired({
              reason: outcome.reason,
              threadId: outcome.threadId,
              subscriptionId: outcome.subscriptionId,
            }),
          );
          return;
```

Keep the `ignored` case unchanged.

Expected: accepted deltas are buffered, while attach/event/manual reconnect first flush pending deltas synchronously.

- [ ] **Step 5: Cancel pending frame during cleanup**

In the effect cleanup function, before `cleanupConnection?.();`, add:

```ts
      pendingDeltaNotifications = [];
      cancelPendingDeltaFrame();
```

The cleanup function should end like this:

```ts
    return () => {
      isMounted = false;
      setCommands(null);
      setLaunchParams(null);
      pendingDeltaNotifications = [];
      cancelPendingDeltaFrame();
      cleanupConnection?.();
    };
```

Expected: unmount clears the pending buffer and prevents delayed dispatch after the bridge is gone.

- [ ] **Step 6: Run focused browser tests**

Run:

```zsh
cd /Users/jiangsheng/cnb/codex/codex-gui
/opt/homebrew/bin/fnm exec --using-file pnpm --version
/opt/homebrew/bin/fnm exec --using-file which pnpm
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --config=vitest.browser.config.ts --run src/__tests__/App.browser.test.tsx
```

Expected:

- `which pnpm` does not point under `/Users/jiangsheng/.cache/codex-runtimes/`.
- App browser tests pass, including the new RAF batching, event flush, and cleanup cancellation tests.

- [ ] **Step 7: Run focused reducer tests again**

Run:

```zsh
cd /Users/jiangsheng/cnb/codex/codex-gui
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts
```

Expected: focused reducer tests still pass.

- [ ] **Step 8: Commit Task 3**

Run:

```zsh
cd /Users/jiangsheng/cnb/codex
git status --short
git diff -- codex-gui/src/features/appShell/GuiHostConnectionBridge.tsx codex-gui/src/__tests__/appBrowserTestSupport.ts codex-gui/src/__tests__/App.browser.test.tsx
git add codex-gui/src/features/appShell/GuiHostConnectionBridge.tsx codex-gui/src/__tests__/appBrowserTestSupport.ts codex-gui/src/__tests__/App.browser.test.tsx
git diff --cached --check
git diff --cached --stat
git commit -m "Batch projection deltas before Redux dispatch"
```

Expected: one local commit containing only bridge and browser-test changes.

## Task 4: Final formatting and lint

**Files:**

- Include any files changed by Task 2 and Task 3 if formatter modifies them.

- [ ] **Step 1: Run formatter check**

Run:

```zsh
cd /Users/jiangsheng/cnb/codex/codex-gui
/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt
```

Expected: PASS. If it fails, run:

```zsh
cd /Users/jiangsheng/cnb/codex/codex-gui
/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt:fix
```

Then re-run:

```zsh
/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt
```

- [ ] **Step 2: Run scoped ESLint**

Run:

```zsh
cd /Users/jiangsheng/cnb/codex/codex-gui
/opt/homebrew/bin/fnm exec --using-file pnpm run lint:eslint -- src/features/appShell/GuiHostConnectionBridge.tsx src/__tests__/appBrowserTestSupport.ts src/__tests__/App.browser.test.tsx src/features/threadRuntime/threadRuntimeSlice.ts src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts src/features/transcriptState/transcriptStateSlice.ts src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run type-check**

Run:

```zsh
cd /Users/jiangsheng/cnb/codex/codex-gui
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
```

Expected: PASS.

- [ ] **Step 4: Re-run focused tests after formatting and lint**

Run:

```zsh
cd /Users/jiangsheng/cnb/codex/codex-gui
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --config=vitest.browser.config.ts --run src/__tests__/App.browser.test.tsx
```

Expected: both focused test commands pass.

- [ ] **Step 5: Check docs and workspace diff**

Run:

```zsh
cd /Users/jiangsheng/cnb/codex
git diff --check
git status --short
```

Expected:

- `git diff --check` has no output.
- Only intended implementation files are modified. The 02f design/plan docs should already be committed by Task 0.

- [ ] **Step 6: Commit any formatter-only changes**

If `format:oxfmt:fix` changed files that were already committed in Task 2 or Task 3, commit those formatter-only changes separately:

```zsh
cd /Users/jiangsheng/cnb/codex
git add codex-gui/src/features/appShell/GuiHostConnectionBridge.tsx codex-gui/src/__tests__/appBrowserTestSupport.ts codex-gui/src/__tests__/App.browser.test.tsx codex-gui/src/features/threadRuntime/threadRuntimeSlice.ts codex-gui/src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts codex-gui/src/features/transcriptState/transcriptStateSlice.ts codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts
git diff --cached --check
git diff --cached --stat
git commit -m "Format projection delta batch changes"
```

Expected: create this commit only if formatter produced changes after Task 2 or Task 3 commits.
