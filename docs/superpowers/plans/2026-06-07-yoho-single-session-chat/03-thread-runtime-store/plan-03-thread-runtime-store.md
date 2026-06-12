# Thread Runtime Store Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a TUI-aligned GUI thread runtime store that records attach baselines, live event buffers, active turn state, and manual reconnect state.

**Architecture:** Add a dedicated `threadRuntimeSlice` that consumes already-accepted projection ingress outcomes. The slice stores `Omit<Thread, "turns">`, `snapshotTurns`, `eventBuffer`, `activeTurnId`, and subscription state; it does not upsert item events into turns or derive chat UI. Wire `App` so `02` outcomes are forwarded to the new runtime store while the old `projectionSlice` remains only as a temporary compatibility path.

**Tech Stack:** TypeScript, React, Redux Toolkit, Vitest, Vitest Browser, pnpm.

---

## Scope

This plan implements only `03 Thread Runtime Store`.

It does not delete `projectionSlice`, build snapshot replay, interpret live items, create chat view models, add visible reconnect UI, or implement composer/tool activity behavior.

## File Structure

- Create: `codex-gui/src/features/threadRuntime/threadRuntimeSlice.ts`
  - Owns runtime types, reducers, active-turn derivation, event buffering, manual reconnect state, and selectors.
- Create: `codex-gui/src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts`
  - Covers reducer behavior for attach baseline, active turn lifecycle, item buffering without upsert, manual reconnect, and store registration.
- Modify: `codex-gui/src/app/store.ts`
  - Registers `threadRuntimeSlice` with the Redux store.
- Modify: `codex-gui/src/App.tsx`
  - Dispatches `02 ProjectionIngressOutcome` results into `threadRuntimeSlice`.
  - Keeps temporary dispatches to `projectionSlice` for compatibility.
- Modify: `codex-gui/src/__tests__/App.browser.test.tsx`
  - Verifies accepted attach/event and manual reconnect outcomes reach runtime state.

---

### Task 1: Add The Thread Runtime Slice

**Files:**
- Create: `codex-gui/src/features/threadRuntime/threadRuntimeSlice.ts`
- Create: `codex-gui/src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts`

- [ ] **Step 1: Write the failing reducer tests**

Create `codex-gui/src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import attachBaselineJson from "@/features/projection/__fixtures__/attach-baseline.json";
import attachReplacementJson from "@/features/projection/__fixtures__/attach-replacement.json";
import eventItemCompletedJson from "@/features/projection/__fixtures__/event-item-completed.json";
import eventItemStartedJson from "@/features/projection/__fixtures__/event-item-started.json";
import eventTurnCompletedJson from "@/features/projection/__fixtures__/event-turn-completed.json";
import eventTurnStartedJson from "@/features/projection/__fixtures__/event-turn-started.json";
import type {
  ThreadProjectionAttachResponse,
  ThreadProjectionEventNotification,
  Turn,
} from "@codex-protocol/v2";
import {
  selectThreadRuntimeActiveTurnId,
  selectThreadRuntimeEventBuffer,
  selectThreadRuntimeRecord,
  selectThreadRuntimeSubscription,
  threadRuntimeAttached,
  threadRuntimeEventBuffered,
  threadRuntimeManualReconnectRequired,
  threadRuntimeSlice,
  type ThreadRuntimeState,
} from "../threadRuntimeSlice";

const attachBaseline = attachBaselineJson as ThreadProjectionAttachResponse;
const attachReplacement = attachReplacementJson as ThreadProjectionAttachResponse;
const eventTurnStarted = eventTurnStartedJson as ThreadProjectionEventNotification;
const eventTurnCompleted = eventTurnCompletedJson as ThreadProjectionEventNotification;
const eventItemStarted = eventItemStartedJson as ThreadProjectionEventNotification;
const eventItemCompleted = eventItemCompletedJson as ThreadProjectionEventNotification;

const reduce = (
  state: ThreadRuntimeState | undefined,
  action:
    | ReturnType<typeof threadRuntimeAttached>
    | ReturnType<typeof threadRuntimeEventBuffered>
    | ReturnType<typeof threadRuntimeManualReconnectRequired>,
) => threadRuntimeSlice.reducer(state, action);

const attachWithTurns = (turns: Turn[]): ThreadProjectionAttachResponse => ({
  ...attachBaseline,
  snapshot: {
    ...attachBaseline.snapshot,
    thread: {
      ...attachBaseline.snapshot.thread,
      turns,
    },
  },
});

const runtimeRoot = (state: ThreadRuntimeState) => ({ threadRuntime: state });

describe("thread runtime reducer", () => {
  it("creates a runtime baseline from an accepted attach", () => {
    const state = reduce(undefined, threadRuntimeAttached(attachBaseline));
    const { turns: snapshotTurns, ...threadMetadata } = attachBaseline.snapshot.thread;

    expect(state.current).toStrictEqual({
      threadId: attachBaseline.snapshot.thread.id,
      sessionId: attachBaseline.snapshot.thread.sessionId,
      thread: threadMetadata,
      snapshotTurns,
      eventBuffer: [],
      activeTurnId: null,
      subscription: { state: "active" },
    });
    expect(selectThreadRuntimeRecord(runtimeRoot(state))).toStrictEqual(state.current);
    expect(selectThreadRuntimeActiveTurnId(runtimeRoot(state))).toBeNull();
    expect(selectThreadRuntimeSubscription(runtimeRoot(state))).toStrictEqual({
      state: "active",
    });
    expect(selectThreadRuntimeEventBuffer(runtimeRoot(state))).toStrictEqual([]);
  });

  it("derives the active turn from snapshot turns", () => {
    if (eventTurnStarted.event.type !== "turnStarted") {
      throw new Error("fixture must contain a turnStarted projection event");
    }
    const state = reduce(
      undefined,
      threadRuntimeAttached(
        attachWithTurns([
          ...attachBaseline.snapshot.thread.turns,
          eventTurnStarted.event.notification.turn,
        ]),
      ),
    );

    expect(state.current?.activeTurnId).toBe(eventTurnStarted.event.notification.turn.id);
  });

  it("buffers turn lifecycle events and tracks the active turn", () => {
    const attached = reduce(undefined, threadRuntimeAttached(attachBaseline));
    const started = reduce(attached, threadRuntimeEventBuffered(eventTurnStarted));
    const completed = reduce(started, threadRuntimeEventBuffered(eventTurnCompleted));

    expect(started.current?.activeTurnId).toBe("turn-in-progress");
    expect(completed.current?.activeTurnId).toBeNull();
    expect(completed.current?.eventBuffer).toStrictEqual([
      { type: "projectionEvent", notification: eventTurnStarted },
      { type: "projectionEvent", notification: eventTurnCompleted },
    ]);
  });

  it("does not clear active turn when a different turn completes", () => {
    if (eventTurnCompleted.event.type !== "turnCompleted") {
      throw new Error("fixture must contain a turnCompleted projection event");
    }
    const attached = reduce(undefined, threadRuntimeAttached(attachBaseline));
    const started = reduce(attached, threadRuntimeEventBuffered(eventTurnStarted));
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

    const state = reduce(started, threadRuntimeEventBuffered(nonMatchingCompleted));

    expect(state.current?.activeTurnId).toBe("turn-in-progress");
    expect(state.current?.eventBuffer.at(-1)).toStrictEqual({
      type: "projectionEvent",
      notification: nonMatchingCompleted,
    });
  });

  it("buffers item events without upserting them into snapshot turns", () => {
    const attached = reduce(undefined, threadRuntimeAttached(attachBaseline));
    const itemStarted = reduce(attached, threadRuntimeEventBuffered(eventTurnStarted));
    const itemBuffered = reduce(itemStarted, threadRuntimeEventBuffered(eventItemStarted));
    const itemCompleted = reduce(itemBuffered, threadRuntimeEventBuffered(eventItemCompleted));

    expect(itemCompleted.current?.snapshotTurns).toStrictEqual(
      attachBaseline.snapshot.thread.turns,
    );
    expect(itemCompleted.current?.eventBuffer).toStrictEqual([
      { type: "projectionEvent", notification: eventTurnStarted },
      { type: "projectionEvent", notification: eventItemStarted },
      { type: "projectionEvent", notification: eventItemCompleted },
    ]);
  });

  it("records manual reconnect state and blocks later events", () => {
    const attached = reduce(undefined, threadRuntimeAttached(attachBaseline));
    const interrupted = reduce(
      attached,
      threadRuntimeManualReconnectRequired({
        reason: "backpressure",
        threadId: attachBaseline.snapshot.thread.id,
        subscriptionId: attachBaseline.subscriptionId,
      }),
    );
    const afterEvent = reduce(interrupted, threadRuntimeEventBuffered(eventTurnStarted));

    expect(interrupted.current?.subscription).toStrictEqual({
      state: "manualReconnectRequired",
      reason: "backpressure",
      subscriptionId: attachBaseline.subscriptionId,
    });
    expect(afterEvent).toStrictEqual(interrupted);
  });

  it("ignores manual reconnect for another thread and ignores reconnect without runtime", () => {
    const attached = reduce(undefined, threadRuntimeAttached(attachBaseline));

    expect(
      reduce(
        attached,
        threadRuntimeManualReconnectRequired({
          reason: "backpressure",
          threadId: "00000000-0000-0000-0000-000000000099",
          subscriptionId: attachBaseline.subscriptionId,
        }),
      ),
    ).toStrictEqual(attached);
    expect(
      reduce(
        undefined,
        threadRuntimeManualReconnectRequired({
          reason: "backpressure",
          threadId: attachBaseline.snapshot.thread.id,
          subscriptionId: attachBaseline.subscriptionId,
        }),
      ),
    ).toStrictEqual({ current: null });
  });

  it("rebuilds baseline and clears manual reconnect state on a new attach", () => {
    const attached = reduce(undefined, threadRuntimeAttached(attachBaseline));
    const interrupted = reduce(
      attached,
      threadRuntimeManualReconnectRequired({
        reason: "backpressure",
        threadId: attachBaseline.snapshot.thread.id,
        subscriptionId: attachBaseline.subscriptionId,
      }),
    );

    const state = reduce(interrupted, threadRuntimeAttached(attachReplacement));

    expect(state.current?.thread.name).toBe("Replacement projection fixture");
    expect(state.current?.snapshotTurns).toStrictEqual(attachReplacement.snapshot.thread.turns);
    expect(state.current?.eventBuffer).toStrictEqual([]);
    expect(state.current?.subscription).toStrictEqual({ state: "active" });
  });
});
```

- [ ] **Step 2: Run the focused reducer test and confirm it fails**

Run from the repo root:

```bash
pnpm --dir codex-gui exec vitest --run src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts
```

Expected result: FAIL because `../threadRuntimeSlice` does not exist yet.

- [ ] **Step 3: Add the runtime slice implementation**

Create `codex-gui/src/features/threadRuntime/threadRuntimeSlice.ts`:

```ts
import type { PayloadAction } from "@reduxjs/toolkit";
import { createAppSlice } from "@/app/createAppSlice";
import type { ProjectionManualReconnectReason } from "@/features/projectionIngress/projectionIngressAdapter";
import type {
  Thread,
  ThreadProjectionAttachResponse,
  ThreadProjectionEventNotification,
  Turn,
} from "@codex-protocol/v2";

export type ThreadRuntimeSubscription =
  | { state: "active" }
  | {
      state: "manualReconnectRequired";
      reason: ProjectionManualReconnectReason;
      subscriptionId: string | null;
    };

export type ThreadRuntimeBufferedEvent = {
  type: "projectionEvent";
  notification: ThreadProjectionEventNotification;
};

export type ThreadRuntimeRecord = {
  threadId: string;
  sessionId: string;
  thread: Omit<Thread, "turns">;
  snapshotTurns: Turn[];
  eventBuffer: ThreadRuntimeBufferedEvent[];
  activeTurnId: string | null;
  subscription: ThreadRuntimeSubscription;
};

export type ThreadRuntimeState = {
  current: ThreadRuntimeRecord | null;
};

export type ThreadRuntimeManualReconnectPayload = {
  reason: ProjectionManualReconnectReason;
  threadId: string;
  subscriptionId: string | null;
};

const initialState: ThreadRuntimeState = {
  current: null,
};

const activeTurnIdFromSnapshot = (turns: Turn[]): string | null =>
  turns
    .toReversed()
    .find((turn) => turn.status === "inProgress")?.id ?? null;

export const threadRuntimeSlice = createAppSlice({
  name: "threadRuntime",
  initialState,
  reducers: (create) => ({
    threadRuntimeAttached: create.reducer(
      (state, action: PayloadAction<ThreadProjectionAttachResponse>) => {
        const {
          turns: snapshotTurns,
          ...thread
        } = action.payload.snapshot.thread;

        state.current = {
          threadId: thread.id,
          sessionId: thread.sessionId,
          thread,
          snapshotTurns,
          eventBuffer: [],
          activeTurnId: activeTurnIdFromSnapshot(snapshotTurns),
          subscription: { state: "active" },
        };
      },
    ),
    threadRuntimeEventBuffered: create.reducer(
      (state, action: PayloadAction<ThreadProjectionEventNotification>) => {
        const runtime = state.current;
        if (runtime == null || runtime.subscription.state !== "active") {
          return;
        }

        runtime.eventBuffer.push({
          type: "projectionEvent",
          notification: action.payload,
        });

        switch (action.payload.event.type) {
          case "turnStarted":
            runtime.activeTurnId = action.payload.event.notification.turn.id;
            return;
          case "turnCompleted":
            if (runtime.activeTurnId === action.payload.event.notification.turn.id) {
              runtime.activeTurnId = null;
            }
            return;
          case "itemStarted":
          case "itemCompleted":
            return;
        }
      },
    ),
    threadRuntimeManualReconnectRequired: create.reducer(
      (state, action: PayloadAction<ThreadRuntimeManualReconnectPayload>) => {
        const runtime = state.current;
        if (runtime == null || runtime.threadId !== action.payload.threadId) {
          return;
        }

        runtime.subscription = {
          state: "manualReconnectRequired",
          reason: action.payload.reason,
          subscriptionId: action.payload.subscriptionId,
        };
      },
    ),
  }),
  selectors: {
    selectThreadRuntimeRecord: (threadRuntime) => threadRuntime.current,
    selectThreadRuntimeActiveTurnId: (threadRuntime) =>
      threadRuntime.current?.activeTurnId ?? null,
    selectThreadRuntimeSubscription: (threadRuntime) =>
      threadRuntime.current?.subscription ?? null,
    selectThreadRuntimeEventBuffer: (threadRuntime) =>
      threadRuntime.current?.eventBuffer ?? [],
  },
});

export const {
  threadRuntimeAttached,
  threadRuntimeEventBuffered,
  threadRuntimeManualReconnectRequired,
} = threadRuntimeSlice.actions;

export const {
  selectThreadRuntimeActiveTurnId,
  selectThreadRuntimeEventBuffer,
  selectThreadRuntimeRecord,
  selectThreadRuntimeSubscription,
} = threadRuntimeSlice.selectors;

export default threadRuntimeSlice;
```

- [ ] **Step 4: Run the focused reducer test and confirm it passes**

Run:

```bash
pnpm --dir codex-gui exec vitest --run src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts
```

Expected result: PASS.

- [ ] **Step 5: Commit the runtime slice**

Run from repo root:

```bash
git add codex-gui/src/features/threadRuntime/threadRuntimeSlice.ts \
  codex-gui/src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts
git commit -m "feat(gui): add thread runtime store"
```

---

### Task 2: Register Thread Runtime In The App Store

**Files:**
- Modify: `codex-gui/src/app/store.ts`
- Modify: `codex-gui/src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts`

- [ ] **Step 1: Add a failing store registration test**

In `codex-gui/src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts`, add this import:

```ts
import { makeStore } from "@/app/store";
```

Add this test inside the existing `describe("thread runtime reducer", () => { ... })` block:

```ts
it("registers thread runtime state in the app store", () => {
  const store = makeStore();

  expect(selectThreadRuntimeRecord(store.getState())).toBeNull();
  expect(selectThreadRuntimeActiveTurnId(store.getState())).toBeNull();
  expect(selectThreadRuntimeSubscription(store.getState())).toBeNull();
  expect(selectThreadRuntimeEventBuffer(store.getState())).toStrictEqual([]);
});
```

- [ ] **Step 2: Run the focused reducer test and confirm it fails**

Run:

```bash
pnpm --dir codex-gui exec vitest --run src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts
```

Expected result: FAIL because `threadRuntimeSlice` is not registered in the app store.

- [ ] **Step 3: Register the slice**

Modify `codex-gui/src/app/store.ts`:

```ts
import type { Action, ThunkAction } from "@reduxjs/toolkit";
import { combineSlices, configureStore } from "@reduxjs/toolkit";
import { counterSlice } from "@/features/counter/counterSlice";
import projectionSlice from "@/features/projection/projectionSlice";
import threadIdentitySlice from "@/features/threadIdentity/threadIdentitySlice";
import threadRuntimeSlice from "@/features/threadRuntime/threadRuntimeSlice";

// `combineSlices` automatically combines the reducers using
// their `reducerPath`s, therefore we no longer need to call `combineReducers`.
const rootReducer = combineSlices(
  counterSlice,
  projectionSlice,
  threadIdentitySlice,
  threadRuntimeSlice,
);
// Infer the `RootState` type from the root reducer
export type RootState = ReturnType<typeof rootReducer>;

// The store setup is wrapped in `makeStore` to allow reuse
// when setting up tests that need the same store config
export const makeStore = (preloadedState?: Partial<RootState>) => {
  return configureStore({
    reducer: rootReducer,
    preloadedState,
  });
};

export const store = makeStore();

// Infer the type of `store`
export type AppStore = typeof store;
// Infer the `AppDispatch` type from the store itself
export type AppDispatch = AppStore["dispatch"];
export type AppThunk<ThunkReturnType = void> = ThunkAction<
  ThunkReturnType,
  RootState,
  unknown,
  Action
>;
```

- [ ] **Step 4: Run the focused reducer test and confirm it passes**

Run:

```bash
pnpm --dir codex-gui exec vitest --run src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts
```

Expected result: PASS.

- [ ] **Step 5: Commit store registration**

Run:

```bash
git add codex-gui/src/app/store.ts \
  codex-gui/src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts
git commit -m "feat(gui): register thread runtime store"
```

---

### Task 3: Wire Projection Ingress Outcomes Into Runtime

**Files:**
- Modify: `codex-gui/src/App.tsx`
- Modify: `codex-gui/src/__tests__/App.browser.test.tsx`

- [ ] **Step 1: Add failing App browser assertions**

Update imports in `codex-gui/src/__tests__/App.browser.test.tsx`.

Add `eventItemStartedJson`:

```ts
import eventItemStartedJson from "@/features/projection/__fixtures__/event-item-started.json";
```

Add runtime selectors:

```ts
import {
  selectThreadRuntimeEventBuffer,
  selectThreadRuntimeRecord,
  selectThreadRuntimeSubscription,
} from "@/features/threadRuntime/threadRuntimeSlice";
```

In `"App dispatches GUI host projection payloads into Redux"`, after the existing projection assertions, add:

```ts
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
```

In `"App stops forwarding projection events after backpressure requires manual reconnect"`, after the existing projection assertions, add:

```ts
expect(selectThreadRuntimeSubscription(store.getState())).toStrictEqual({
  state: "manualReconnectRequired",
  reason: "backpressure",
  subscriptionId: attachResponse.subscriptionId,
});
expect(selectThreadRuntimeEventBuffer(store.getState())).toStrictEqual([]);
```

Add a new test before `"App closes the GUI host connection when unmounted"`:

```ts
test("App records manual reconnect when a projection event breaks the baseline", async () => {
  const { store } = await renderWithProviders(<App />);
  const projectionEvent = eventItemStartedJson as ThreadProjectionEventNotification;

  const options = startGuiHostConnectionMock.mock.calls[0]?.[0];
  options?.onProjectionAttached?.(attachResponse);
  options?.onProjectionEvent?.(projectionEvent);

  expect(selectThreadRuntimeSubscription(store.getState())).toStrictEqual({
    state: "manualReconnectRequired",
    reason: "commitChainMismatch",
    subscriptionId: attachResponse.subscriptionId,
  });
  expect(selectThreadRuntimeEventBuffer(store.getState())).toStrictEqual([]);
});
```

- [ ] **Step 2: Run the focused App browser test and confirm it fails**

Run:

```bash
pnpm --dir codex-gui exec vitest --config=vitest.browser.config.ts --run src/__tests__/App.browser.test.tsx
```

Expected result: FAIL because `App.tsx` does not dispatch projection ingress outcomes into `threadRuntimeSlice` yet.

- [ ] **Step 3: Wire App outcomes to runtime actions**

Modify `codex-gui/src/App.tsx`.

Update the projection ingress import:

```ts
import {
  ProjectionIngressAdapter,
  type ProjectionIngressOutcome,
} from "./features/projectionIngress/projectionIngressAdapter";
```

Add runtime action imports:

```ts
import {
  threadRuntimeAttached,
  threadRuntimeEventBuffered,
  threadRuntimeManualReconnectRequired,
} from "./features/threadRuntime/threadRuntimeSlice";
```

Inside the `useEffect`, after `let projectionIngress: ProjectionIngressAdapter | null = null;`, add:

```ts
const dispatchProjectionOutcome = (outcome: ProjectionIngressOutcome) => {
  switch (outcome.type) {
    case "attachAccepted":
      dispatch(threadRuntimeAttached(outcome.response));
      dispatch(projectionAttached(outcome.response));
      return;
    case "eventAccepted":
      dispatch(threadRuntimeEventBuffered(outcome.notification));
      dispatch(projectionEventReceived(outcome.notification));
      return;
    case "manualReconnectRequired":
      dispatch(
        threadRuntimeManualReconnectRequired({
          reason: outcome.reason,
          threadId: outcome.threadId,
          subscriptionId: outcome.subscriptionId,
        }),
      );
      return;
    case "ignored":
      return;
  }
};
```

Replace the accepted attach branch:

```ts
const outcome = projectionIngress.handleAttach(response);
if (outcome.type === "attachAccepted") {
  dispatch(projectionAttached(outcome.response));
}
```

with:

```ts
dispatchProjectionOutcome(projectionIngress.handleAttach(response));
```

Replace the accepted event branch:

```ts
const outcome = projectionIngress.handleEvent(notification);
if (outcome.type === "eventAccepted") {
  dispatch(projectionEventReceived(outcome.notification));
}
```

with:

```ts
dispatchProjectionOutcome(projectionIngress.handleEvent(notification));
```

Replace the closed handler:

```ts
onProjectionClosed: (notification) => {
  projectionIngress?.handleClosed(notification);
},
```

with:

```ts
onProjectionClosed: (notification) => {
  if (projectionIngress == null) {
    return;
  }

  dispatchProjectionOutcome(projectionIngress.handleClosed(notification));
},
```

- [ ] **Step 4: Run the focused App browser test and confirm it passes**

Run:

```bash
pnpm --dir codex-gui exec vitest --config=vitest.browser.config.ts --run src/__tests__/App.browser.test.tsx
```

Expected result: PASS.

- [ ] **Step 5: Run the runtime reducer test again**

Run:

```bash
pnpm --dir codex-gui exec vitest --run src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts
```

Expected result: PASS.

- [ ] **Step 6: Commit App runtime wiring**

Run:

```bash
git add codex-gui/src/App.tsx \
  codex-gui/src/__tests__/App.browser.test.tsx
git commit -m "feat(gui): wire projection ingress to runtime store"
```

---

### Task 4: Final Verification And Scope Check

**Files:**
- No source edits expected.

- [ ] **Step 1: Run focused runtime tests**

Run:

```bash
pnpm --dir codex-gui exec vitest --run src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts
```

Expected result: PASS.

- [ ] **Step 2: Run focused App browser wiring tests**

Run:

```bash
pnpm --dir codex-gui exec vitest --config=vitest.browser.config.ts --run src/__tests__/App.browser.test.tsx
```

Expected result: PASS.

- [ ] **Step 3: Run type check**

Run:

```bash
pnpm --dir codex-gui run type-check
```

Expected result: PASS.

- [ ] **Step 4: Review the committed diff**

Run:

```bash
git log --oneline -3
git status --short
git diff HEAD~3..HEAD --stat
```

Expected result:

- The three latest commits are the task commits from this plan.
- `git status --short` is empty.
- The diff only touches:
  - `codex-gui/src/features/threadRuntime/threadRuntimeSlice.ts`
  - `codex-gui/src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts`
  - `codex-gui/src/app/store.ts`
  - `codex-gui/src/App.tsx`
  - `codex-gui/src/__tests__/App.browser.test.tsx`

- [ ] **Step 5: Confirm non-goals stayed out of scope**

Check the diff manually and verify:

- No `projectionSlice` deletion in this plan.
- No chat view model selectors.
- No snapshot replay implementation.
- No live item interpretation.
- No visible reconnect UI.
- No composer or tool activity changes.

If any of those appear, revert that part before considering this plan complete.
