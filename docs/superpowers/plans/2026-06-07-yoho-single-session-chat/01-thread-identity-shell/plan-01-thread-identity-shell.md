# Thread Identity Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a minimal GUI thread identity gate so the GUI only advances projection state when the `/gui` launch thread id matches the attached projection thread id.

**Architecture:** Add a dedicated `threadIdentity` Redux slice that records `launchThreadId`, `attachedThreadId`, and `attachStatus`. Keep `guiHostClient` as the source of parsed launch params, then let `App` use the identity gate to decide whether an attach snapshot can be forwarded into the existing temporary projection slice.

**Tech Stack:** TypeScript, React, Redux Toolkit, Vitest, Vitest Browser, pnpm.

---

## Scope

This plan implements only `01 Thread Identity Shell`.

It does not replace `projectionSlice`, design projection ingress, add reattach behavior, add chat UI, add composer behavior, or add browser smoke coverage. It only adds identity state and uses it as a gate before the current projection reducer receives an attach snapshot.

## File Structure

- Create: `codex-gui/src/features/threadIdentity/threadIdentitySlice.ts`
  - Owns `GuiThreadIdentityState`, three-state status resolution, actions, and selectors.
- Create: `codex-gui/src/features/threadIdentity/__tests__/threadIdentitySlice.test.ts`
  - Unit coverage for `none`, `attached`, `mismatch`, and launch reset behavior.
- Modify: `codex-gui/src/app/store.ts`
  - Registers `threadIdentitySlice` in the app store.
- Modify: `codex-gui/src/features/guiHost/guiHostClient.ts`
  - Adds an `onLaunchParams` callback so the parsed launch thread id has one source of truth.
- Modify: `codex-gui/src/features/guiHost/guiHostClient.test.ts`
  - Verifies launch params are emitted after parsing.
- Modify: `codex-gui/src/App.tsx`
  - Records launch identity and attached identity, then only dispatches `projectionAttached` when the ids match.
- Modify: `codex-gui/src/__tests__/App.browser.test.tsx`
  - Verifies matching attach advances projection and mismatched attach only updates identity state.

---

### Task 1: Add The Thread Identity Slice

**Files:**
- Create: `codex-gui/src/features/threadIdentity/threadIdentitySlice.ts`
- Create: `codex-gui/src/features/threadIdentity/__tests__/threadIdentitySlice.test.ts`

- [ ] **Step 1: Write the failing reducer tests**

Create `codex-gui/src/features/threadIdentity/__tests__/threadIdentitySlice.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  attachedThreadIdObserved,
  launchThreadIdRecorded,
  threadIdentitySlice,
  type GuiThreadIdentityState,
} from "../threadIdentitySlice";

const reduce = (
  state: GuiThreadIdentityState | undefined,
  action: ReturnType<typeof launchThreadIdRecorded> | ReturnType<typeof attachedThreadIdObserved>,
) => threadIdentitySlice.reducer(state, action);

describe("thread identity reducer", () => {
  it("records launch thread id without marking the identity as attached", () => {
    const state = reduce(undefined, launchThreadIdRecorded("thread-launch"));

    expect(state).toStrictEqual({
      launchThreadId: "thread-launch",
      attachedThreadId: null,
      attachStatus: "none",
    });
  });

  it("marks matching attach thread id as attached", () => {
    const launched = reduce(undefined, launchThreadIdRecorded("thread-1"));

    const state = reduce(launched, attachedThreadIdObserved("thread-1"));

    expect(state).toStrictEqual({
      launchThreadId: "thread-1",
      attachedThreadId: "thread-1",
      attachStatus: "attached",
    });
  });

  it("marks mismatched attach thread id as mismatch", () => {
    const launched = reduce(undefined, launchThreadIdRecorded("thread-launch"));

    const state = reduce(launched, attachedThreadIdObserved("thread-attached"));

    expect(state).toStrictEqual({
      launchThreadId: "thread-launch",
      attachedThreadId: "thread-attached",
      attachStatus: "mismatch",
    });
  });

  it("resets attached identity when a new launch thread id is recorded", () => {
    const launched = reduce(undefined, launchThreadIdRecorded("thread-1"));
    const attached = reduce(launched, attachedThreadIdObserved("thread-1"));

    const state = reduce(attached, launchThreadIdRecorded("thread-2"));

    expect(state).toStrictEqual({
      launchThreadId: "thread-2",
      attachedThreadId: null,
      attachStatus: "none",
    });
  });
});
```

- [ ] **Step 2: Run the focused test and confirm it fails**

Run from `codex-gui`:

```bash
pnpm vitest --run src/features/threadIdentity/__tests__/threadIdentitySlice.test.ts
```

Expected result: FAIL because `../threadIdentitySlice` does not exist yet.

- [ ] **Step 3: Add the minimal slice implementation**

Create `codex-gui/src/features/threadIdentity/threadIdentitySlice.ts`:

```ts
import type { PayloadAction } from "@reduxjs/toolkit";
import { createAppSlice } from "@/app/createAppSlice";

export type GuiThreadAttachStatus = "none" | "attached" | "mismatch";

export type GuiThreadIdentityState = {
  launchThreadId: string | null;
  attachedThreadId: string | null;
  attachStatus: GuiThreadAttachStatus;
};

const initialState: GuiThreadIdentityState = {
  launchThreadId: null,
  attachedThreadId: null,
  attachStatus: "none",
};

const resolveAttachStatus = (
  launchThreadId: string | null,
  attachedThreadId: string | null,
): GuiThreadAttachStatus => {
  if (launchThreadId == null || attachedThreadId == null) {
    return "none";
  }

  return launchThreadId === attachedThreadId ? "attached" : "mismatch";
};

export const threadIdentitySlice = createAppSlice({
  name: "threadIdentity",
  initialState,
  reducers: (create) => ({
    launchThreadIdRecorded: create.reducer((state, action: PayloadAction<string>) => {
      state.launchThreadId = action.payload;
      state.attachedThreadId = null;
      state.attachStatus = "none";
    }),
    attachedThreadIdObserved: create.reducer((state, action: PayloadAction<string>) => {
      state.attachedThreadId = action.payload;
      state.attachStatus = resolveAttachStatus(state.launchThreadId, action.payload);
    }),
  }),
  selectors: {
    selectThreadIdentityState: (threadIdentity) => threadIdentity,
    selectCanAdvanceThreadIdentity: (threadIdentity) =>
      threadIdentity.attachStatus === "attached",
  },
});

export const { launchThreadIdRecorded, attachedThreadIdObserved } = threadIdentitySlice.actions;

export const { selectThreadIdentityState, selectCanAdvanceThreadIdentity } =
  threadIdentitySlice.selectors;

export default threadIdentitySlice;
```

- [ ] **Step 4: Run the focused test and confirm it passes**

Run from `codex-gui`:

```bash
pnpm vitest --run src/features/threadIdentity/__tests__/threadIdentitySlice.test.ts
```

Expected result: PASS.

- [ ] **Step 5: Commit the slice**

Run from repo root:

```bash
git add codex-gui/src/features/threadIdentity/threadIdentitySlice.ts \
  codex-gui/src/features/threadIdentity/__tests__/threadIdentitySlice.test.ts
git commit -m "feat(gui): add thread identity state"
```

---

### Task 2: Wire Launch Identity Into The Store

**Files:**
- Modify: `codex-gui/src/app/store.ts`
- Modify: `codex-gui/src/features/guiHost/guiHostClient.ts`
- Modify: `codex-gui/src/features/guiHost/guiHostClient.test.ts`

- [ ] **Step 1: Write failing tests for launch param emission and store registration**

In `codex-gui/src/features/guiHost/guiHostClient.test.ts`, update the imports:

```ts
import {
  clearLaunchTokenFragment,
  readLaunchParams,
  startGuiHostConnection,
  type LaunchParams,
} from "./guiHostClient";
```

In the `"sends authenticate, initialize, attach, and forwards projection payloads"` test, add a `launchParams` array before `startGuiHostConnection`:

```ts
const launchParams: LaunchParams[] = [];
```

Pass this option into `startGuiHostConnection` in that test:

```ts
onLaunchParams: (params) => {
  launchParams.push(params);
},
```

Add this assertion after the existing `socket.sent.map(readRpcMethod)` assertion:

```ts
expect(launchParams).toEqual([{ threadId, token: "secret" }]);
```

Create a store registration test at the bottom of `codex-gui/src/features/threadIdentity/__tests__/threadIdentitySlice.test.ts`:

```ts
import { makeStore } from "@/app/store";
import { selectThreadIdentityState } from "../threadIdentitySlice";
```

Add this test:

```ts
it("is registered in the app store", () => {
  const store = makeStore();

  expect(selectThreadIdentityState(store.getState())).toStrictEqual({
    launchThreadId: null,
    attachedThreadId: null,
    attachStatus: "none",
  });
});
```

- [ ] **Step 2: Run focused tests and confirm they fail**

Run from `codex-gui`:

```bash
pnpm vitest --run \
  src/features/guiHost/guiHostClient.test.ts \
  src/features/threadIdentity/__tests__/threadIdentitySlice.test.ts
```

Expected result: FAIL because `onLaunchParams` is not part of `StartGuiHostConnectionOptions`, and `threadIdentitySlice` is not registered in the store.

- [ ] **Step 3: Register the identity slice in the app store**

Update `codex-gui/src/app/store.ts`:

```ts
import type { Action, ThunkAction } from "@reduxjs/toolkit";
import { combineSlices, configureStore } from "@reduxjs/toolkit";
import { counterSlice } from "@/features/counter/counterSlice";
import projectionSlice from "@/features/projection/projectionSlice";
import threadIdentitySlice from "@/features/threadIdentity/threadIdentitySlice";

// `combineSlices` automatically combines the reducers using
// their `reducerPath`s, therefore we no longer need to call `combineReducers`.
const rootReducer = combineSlices(counterSlice, projectionSlice, threadIdentitySlice);
```

Leave the rest of the file unchanged.

- [ ] **Step 4: Emit parsed launch params from guiHostClient**

Update `codex-gui/src/features/guiHost/guiHostClient.ts`.

Add `onLaunchParams` to `StartGuiHostConnectionOptions`:

```ts
export type StartGuiHostConnectionOptions = {
  location: URL;
  replaceState: History["replaceState"];
  tokenStorage?: Pick<Storage, "getItem" | "setItem">;
  createWebSocket?: (url: string) => WebSocket;
  onStatus?: (status: GuiHostStatus) => void;
  onLaunchParams?: (params: LaunchParams) => void;
  onProjectionAttached?: (response: ThreadProjectionAttachResponse) => void;
  onProjectionEvent?: (notification: ThreadProjectionEventNotification) => void;
};
```

Destructure the option in `startGuiHostConnection`:

```ts
export function startGuiHostConnection({
  location,
  replaceState,
  tokenStorage,
  createWebSocket = (url) => new WebSocket(url),
  onStatus,
  onLaunchParams,
  onProjectionAttached,
  onProjectionEvent,
}: StartGuiHostConnectionOptions): GuiHostConnectionCleanup {
```

Replace the existing launch param read:

```ts
const { threadId, token } = readLaunchParams(location, tokenStorage ?? readSessionStorage());
```

with:

```ts
const launchParams = readLaunchParams(location, tokenStorage ?? readSessionStorage());
const { threadId, token } = launchParams;
onLaunchParams?.(launchParams);
```

- [ ] **Step 5: Run focused tests and confirm they pass**

Run from `codex-gui`:

```bash
pnpm vitest --run \
  src/features/guiHost/guiHostClient.test.ts \
  src/features/threadIdentity/__tests__/threadIdentitySlice.test.ts
```

Expected result: PASS.

- [ ] **Step 6: Commit launch/store wiring**

Run from repo root:

```bash
git add codex-gui/src/app/store.ts \
  codex-gui/src/features/guiHost/guiHostClient.ts \
  codex-gui/src/features/guiHost/guiHostClient.test.ts \
  codex-gui/src/features/threadIdentity/__tests__/threadIdentitySlice.test.ts
git commit -m "feat(gui): record launch thread identity"
```

---

### Task 3: Gate Projection Attach In App

**Files:**
- Modify: `codex-gui/src/App.tsx`
- Modify: `codex-gui/src/__tests__/App.browser.test.tsx`

- [ ] **Step 1: Write failing App browser tests for identity gate behavior**

Update imports in `codex-gui/src/__tests__/App.browser.test.tsx`:

```ts
import {
  selectProjectionByThreadId,
  selectProjectionReattachByThreadId,
} from "@/features/projection/projectionSlice";
import { selectThreadIdentityState } from "@/features/threadIdentity/threadIdentitySlice";
```

Add constants after `startGuiHostConnectionMock`:

```ts
const attachResponse = attachBaselineJson as ThreadProjectionAttachResponse;
const launchThreadId = attachResponse.snapshot.thread.id;
```

In the `beforeEach` mock implementation, emit launch params before assigning `emitStatus`:

```ts
startGuiHostConnectionMock.mockImplementation((options) => {
  options.onLaunchParams?.({ threadId: launchThreadId, token: "secret" });
  emitStatus = options.onStatus;
  return () => {
    cleanupConnectionCallCount += 1;
  };
});
```

In `"App dispatches GUI host projection payloads into Redux"`, remove the local `attachResponse` declaration because the file-level constant is used. Keep the projection event declaration:

```ts
const projectionEvent = eventTurnStartedJson as ThreadProjectionEventNotification;
const threadId = attachResponse.snapshot.thread.id;
```

Add this assertion before checking the projection:

```ts
expect(selectThreadIdentityState(store.getState())).toStrictEqual({
  launchThreadId: threadId,
  attachedThreadId: threadId,
  attachStatus: "attached",
});
```

Add a new test below it:

```ts
test("App records mismatched attach identity without advancing projection state", async () => {
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
  expect(selectProjectionByThreadId(store.getState(), launchThreadId)).toBeNull();
  expect(selectProjectionByThreadId(store.getState(), mismatchedThreadId)).toBeNull();
  expect(selectProjectionReattachByThreadId(store.getState(), launchThreadId)).toBeNull();
});
```

- [ ] **Step 2: Run the App browser test and confirm it fails**

Run from `codex-gui`:

```bash
pnpm vitest --config=vitest.browser.config.ts --run src/__tests__/App.browser.test.tsx
```

Expected result: FAIL because `App` does not record launch identity, does not record attached identity, and forwards mismatched attach snapshots into `projectionSlice`.

- [ ] **Step 3: Gate projection attach in App**

Update `codex-gui/src/App.tsx` imports:

```tsx
import { useEffect, useState } from "react";
import { useAppDispatch } from "./app/hooks";
import type { GuiHostStatus } from "./features/guiHost/guiHostClient";
import { startGuiHostConnection } from "./features/guiHost/guiHostClient";
import { projectionAttached, projectionEventReceived } from "./features/projection/projectionSlice";
import {
  attachedThreadIdObserved,
  launchThreadIdRecorded,
} from "./features/threadIdentity/threadIdentitySlice";
```

Inside the `useEffect`, add a local launch id before the `try` block:

```tsx
let launchThreadId: string | null = null;
```

Pass an `onLaunchParams` handler into `startGuiHostConnection`:

```tsx
onLaunchParams: (params) => {
  launchThreadId = params.threadId;
  dispatch(launchThreadIdRecorded(params.threadId));
},
```

Replace the current `onProjectionAttached` handler:

```tsx
onProjectionAttached: (response) => {
  dispatch(projectionAttached(response));
},
```

with:

```tsx
onProjectionAttached: (response) => {
  const attachedThreadId = response.snapshot.thread.id;
  dispatch(attachedThreadIdObserved(attachedThreadId));

  if (launchThreadId !== attachedThreadId) {
    return;
  }

  dispatch(projectionAttached(response));
},
```

Replace the current `onProjectionEvent` handler:

```tsx
onProjectionEvent: (notification) => {
  dispatch(projectionEventReceived(notification));
},
```

with:

```tsx
onProjectionEvent: (notification) => {
  if (launchThreadId !== notification.threadId) {
    return;
  }

  dispatch(projectionEventReceived(notification));
},
```

Do not add retry, detach, reattach, chat UI, or composer behavior in this task.

- [ ] **Step 4: Run the App browser test and confirm it passes**

Run from `codex-gui`:

```bash
pnpm vitest --config=vitest.browser.config.ts --run src/__tests__/App.browser.test.tsx
```

Expected result: PASS.

- [ ] **Step 5: Commit App gate behavior**

Run from repo root:

```bash
git add codex-gui/src/App.tsx codex-gui/src/__tests__/App.browser.test.tsx
git commit -m "feat(gui): gate projection attach by thread identity"
```

---

### Task 4: Final Verification

**Files:**
- Verify only: `codex-gui/src/features/threadIdentity/threadIdentitySlice.ts`
- Verify only: `codex-gui/src/features/threadIdentity/__tests__/threadIdentitySlice.test.ts`
- Verify only: `codex-gui/src/features/guiHost/guiHostClient.ts`
- Verify only: `codex-gui/src/features/guiHost/guiHostClient.test.ts`
- Verify only: `codex-gui/src/App.tsx`
- Verify only: `codex-gui/src/__tests__/App.browser.test.tsx`

- [ ] **Step 1: Run format check**

Run from `codex-gui`:

```bash
pnpm run format
```

Expected result: PASS.

- [ ] **Step 2: Run lint**

Run from `codex-gui`:

```bash
pnpm run lint
```

Expected result: PASS.

- [ ] **Step 3: Run type check**

Run from `codex-gui`:

```bash
pnpm run type-check
```

Expected result: PASS.

- [ ] **Step 4: Run focused Vitest suite**

Run from `codex-gui`:

```bash
pnpm vitest --run \
  src/features/threadIdentity/__tests__/threadIdentitySlice.test.ts \
  src/features/guiHost/guiHostClient.test.ts \
  src/features/projection/__tests__/projectionSlice.test.ts
```

Expected result: PASS.

- [ ] **Step 5: Run App browser test**

Run from `codex-gui`:

```bash
pnpm vitest --config=vitest.browser.config.ts --run src/__tests__/App.browser.test.tsx
```

Expected result: PASS.

- [ ] **Step 6: Confirm the implementation stayed inside 01 scope**

Run from repo root:

```bash
git diff --stat HEAD~3..HEAD
git diff --name-only HEAD~3..HEAD
```

Expected changed implementation files:

```text
codex-gui/src/App.tsx
codex-gui/src/__tests__/App.browser.test.tsx
codex-gui/src/app/store.ts
codex-gui/src/features/guiHost/guiHostClient.test.ts
codex-gui/src/features/guiHost/guiHostClient.ts
codex-gui/src/features/threadIdentity/__tests__/threadIdentitySlice.test.ts
codex-gui/src/features/threadIdentity/threadIdentitySlice.ts
```

Expected absent changes:

```text
codex-rs/
codex-gui/src/features/projection/projectionSlice.ts
codex-gui/src/features/projection/__tests__/projectionSlice.test.ts
Cargo.lock
uv.lock
```

- [ ] **Step 7: Commit verification cleanup if formatting changed files**

If `pnpm run format` reports files that need formatting, run from `codex-gui`:

```bash
pnpm run format:fix
```

Then run from repo root:

```bash
git add codex-gui
git commit -m "chore(gui): format thread identity changes"
```

If `pnpm run format` passes without changes, do not create a formatting commit.
