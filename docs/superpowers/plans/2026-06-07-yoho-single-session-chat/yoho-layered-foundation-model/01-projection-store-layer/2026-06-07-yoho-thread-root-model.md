# YOHO Thread Root Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first Projection Store Layer foundation: a TypeScript data-TUI thread root model that supports multi-thread metadata and parent/child graph facts.

**Architecture:** Add a focused Redux Toolkit slice for thread root facts, independent of the current GUI projection reducer. The slice stores thread metadata in flat maps, tracks `primaryThreadId` and `activeThreadId`, and maintains graph indexes without storing turns/items inside `ThreadRecord`.

**Tech Stack:** React 19, TypeScript, Redux Toolkit `createAppSlice`, Vitest, generated `@codex-protocol/v2` types.

---

## Spec

Implement only the decisions in:

`docs/superpowers/specs/2026-06-07-yoho-single-session-chat/yoho-layered-foundation-model/01-projection-store-layer/01-thread-root-model.md`

Do not implement turn lifecycle, item lifecycle, chat rendering, composer, runtime request state, or UI changes in this plan.

## Files

- Create: `codex-gui/src/features/projection/threadRootSlice.ts`
  - Owns `ThreadRootState`, `ThreadRecord`, launch initialization, thread metadata attach, graph edge updates, and selectors.
- Create: `codex-gui/src/features/projection/__tests__/threadRootSlice.test.ts`
  - Tests launch initialization, metadata extraction, graph update, parent move, and metadata-only child thread support.
- Modify: `codex-gui/src/app/store.ts`
  - Registers `threadRootSlice` with the Redux store.

Do not modify `codex-gui/pnpm-lock.yaml`.

---

### Task 1: Add Failing Thread Root Slice Tests

**Files:**
- Create: `codex-gui/src/features/projection/__tests__/threadRootSlice.test.ts`

- [ ] **Step 1: Create the test file**

```ts
import { describe, expect, it } from "vitest";
import attachBaselineJson from "../__fixtures__/attach-baseline.json";
import type { Thread, ThreadProjectionAttachResponse } from "@codex-protocol/v2";
import {
  launchPrimaryThread,
  selectActiveThreadId,
  selectChildThreadIds,
  selectParentThreadId,
  selectPrimaryThreadId,
  selectThreadById,
  threadMetadataAttached,
  threadRootSlice,
} from "../threadRootSlice";

const attachBaseline = attachBaselineJson as ThreadProjectionAttachResponse;
const primaryThread = attachBaseline.snapshot.thread;

const reduce = (
  actions: Array<ReturnType<typeof launchPrimaryThread> | ReturnType<typeof threadMetadataAttached>>,
) => actions.reduce(threadRootSlice.reducer, threadRootSlice.getInitialState());

const threadWith = (overrides: Partial<Thread>): Thread => ({
  ...primaryThread,
  id: "00000000-0000-0000-0000-000000000101",
  sessionId: "00000000-0000-0000-0000-000000000101",
  parentThreadId: null,
  turns: [],
  ...overrides,
});

describe("thread root reducer", () => {
  it("initializes primary and active thread ids from launch params", () => {
    const state = reduce([launchPrimaryThread({ threadId: primaryThread.id })]);

    expect(selectPrimaryThreadId({ threadRoot: state })).toBe(primaryThread.id);
    expect(selectActiveThreadId({ threadRoot: state })).toBe(primaryThread.id);
  });

  it("stores thread metadata without nested turns", () => {
    const state = reduce([
      launchPrimaryThread({ threadId: primaryThread.id }),
      threadMetadataAttached(primaryThread),
    ]);

    const record = selectThreadById({ threadRoot: state }, primaryThread.id);
    expect(record).toStrictEqual({
      id: primaryThread.id,
      sessionId: primaryThread.sessionId,
      parentThreadId: primaryThread.parentThreadId,
      preview: primaryThread.preview,
      status: primaryThread.status,
      name: primaryThread.name,
      cwd: primaryThread.cwd,
      source: primaryThread.source,
      agentNickname: primaryThread.agentNickname,
      agentRole: primaryThread.agentRole,
      createdAt: primaryThread.createdAt,
      updatedAt: primaryThread.updatedAt,
    });
    expect(record).not.toHaveProperty("turns");
  });

  it("registers a metadata-only child thread in the graph", () => {
    const child = threadWith({
      id: "00000000-0000-0000-0000-000000000102",
      sessionId: primaryThread.sessionId,
      parentThreadId: primaryThread.id,
      agentNickname: "Scout",
      agentRole: "explorer",
    });

    const state = reduce([
      launchPrimaryThread({ threadId: primaryThread.id }),
      threadMetadataAttached(primaryThread),
      threadMetadataAttached(child),
    ]);

    expect(selectParentThreadId({ threadRoot: state }, child.id)).toBe(primaryThread.id);
    expect(selectChildThreadIds({ threadRoot: state }, primaryThread.id)).toStrictEqual([child.id]);
    expect(selectThreadById({ threadRoot: state }, child.id)?.agentNickname).toBe("Scout");
  });

  it("moves a thread between parents without rebuilding the whole graph", () => {
    const oldParent = threadWith({
      id: "00000000-0000-0000-0000-000000000201",
      sessionId: primaryThread.sessionId,
      parentThreadId: primaryThread.id,
    });
    const newParent = threadWith({
      id: "00000000-0000-0000-0000-000000000202",
      sessionId: primaryThread.sessionId,
      parentThreadId: primaryThread.id,
    });
    const sibling = threadWith({
      id: "00000000-0000-0000-0000-000000000203",
      sessionId: primaryThread.sessionId,
      parentThreadId: oldParent.id,
    });
    const movingChild = threadWith({
      id: "00000000-0000-0000-0000-000000000204",
      sessionId: primaryThread.sessionId,
      parentThreadId: oldParent.id,
    });
    const movedChild = {
      ...movingChild,
      parentThreadId: newParent.id,
    };

    const state = reduce([
      launchPrimaryThread({ threadId: primaryThread.id }),
      threadMetadataAttached(primaryThread),
      threadMetadataAttached(oldParent),
      threadMetadataAttached(newParent),
      threadMetadataAttached(sibling),
      threadMetadataAttached(movingChild),
      threadMetadataAttached(movedChild),
    ]);

    expect(selectChildThreadIds({ threadRoot: state }, oldParent.id)).toStrictEqual([sibling.id]);
    expect(selectChildThreadIds({ threadRoot: state }, newParent.id)).toStrictEqual([movingChild.id]);
    expect(selectThreadById({ threadRoot: state }, sibling.id)).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
cd codex-gui
pnpm exec vitest --run src/features/projection/__tests__/threadRootSlice.test.ts
```

Expected: FAIL because `../threadRootSlice` does not exist.

---

### Task 2: Implement Thread Root Slice

**Files:**
- Create: `codex-gui/src/features/projection/threadRootSlice.ts`

- [ ] **Step 1: Create the slice implementation**

```ts
import type { PayloadAction } from "@reduxjs/toolkit";
import { createAppSlice } from "@/app/createAppSlice";
import type { SessionSource, Thread, ThreadStatus } from "@codex-protocol/v2";

export type ThreadRecord = {
  id: string;
  sessionId: string;
  parentThreadId: string | null;
  preview: string;
  status: ThreadStatus;
  name: string | null;
  cwd: Thread["cwd"];
  source: SessionSource;
  agentNickname: string | null;
  agentRole: string | null;
  createdAt: number;
  updatedAt: number;
};

export type ThreadRootState = {
  primaryThreadId: string | null;
  activeThreadId: string | null;
  threadsById: Record<string, ThreadRecord>;
  parentThreadIdByThreadId: Record<string, string | null>;
  childThreadIdsByParentId: Record<string, string[]>;
};

const initialState: ThreadRootState = {
  primaryThreadId: null,
  activeThreadId: null,
  threadsById: {},
  parentThreadIdByThreadId: {},
  childThreadIdsByParentId: {},
};

export const toThreadRecord = (thread: Thread): ThreadRecord => ({
  id: thread.id,
  sessionId: thread.sessionId,
  parentThreadId: thread.parentThreadId,
  preview: thread.preview,
  status: thread.status,
  name: thread.name,
  cwd: thread.cwd,
  source: thread.source,
  agentNickname: thread.agentNickname,
  agentRole: thread.agentRole,
  createdAt: thread.createdAt,
  updatedAt: thread.updatedAt,
});

const removeChildThreadId = (
  childThreadIdsByParentId: ThreadRootState["childThreadIdsByParentId"],
  parentThreadId: string,
  childThreadId: string,
) => {
  const childThreadIds = childThreadIdsByParentId[parentThreadId];
  if (childThreadIds == null) {
    return;
  }

  childThreadIdsByParentId[parentThreadId] = childThreadIds.filter(
    (threadId) => threadId !== childThreadId,
  );
};

const addChildThreadId = (
  childThreadIdsByParentId: ThreadRootState["childThreadIdsByParentId"],
  parentThreadId: string,
  childThreadId: string,
) => {
  const childThreadIds = childThreadIdsByParentId[parentThreadId] ?? [];
  if (childThreadIds.includes(childThreadId)) {
    childThreadIdsByParentId[parentThreadId] = childThreadIds;
    return;
  }

  childThreadIdsByParentId[parentThreadId] = [...childThreadIds, childThreadId];
};

const updateThreadGraphEdge = (state: ThreadRootState, thread: ThreadRecord) => {
  const previousParentThreadId = state.parentThreadIdByThreadId[thread.id] ?? null;
  const nextParentThreadId = thread.parentThreadId;

  if (previousParentThreadId !== nextParentThreadId && previousParentThreadId != null) {
    removeChildThreadId(state.childThreadIdsByParentId, previousParentThreadId, thread.id);
  }

  state.parentThreadIdByThreadId[thread.id] = nextParentThreadId;

  if (nextParentThreadId != null) {
    addChildThreadId(state.childThreadIdsByParentId, nextParentThreadId, thread.id);
  }
};

export const threadRootSlice = createAppSlice({
  name: "threadRoot",
  initialState,
  reducers: (create) => ({
    launchPrimaryThread: create.reducer((state, action: PayloadAction<{ threadId: string }>) => {
      state.primaryThreadId = action.payload.threadId;
      state.activeThreadId = action.payload.threadId;
    }),
    threadMetadataAttached: create.reducer((state, action: PayloadAction<Thread>) => {
      const record = toThreadRecord(action.payload);
      state.threadsById[record.id] = record;
      updateThreadGraphEdge(state, record);
    }),
  }),
  selectors: {
    selectPrimaryThreadId: (state) => state.primaryThreadId,
    selectActiveThreadId: (state) => state.activeThreadId,
    selectThreadById: (state, threadId: string) => state.threadsById[threadId] ?? null,
    selectParentThreadId: (state, threadId: string) =>
      state.parentThreadIdByThreadId[threadId] ?? null,
    selectChildThreadIds: (state, parentThreadId: string) =>
      state.childThreadIdsByParentId[parentThreadId] ?? [],
  },
});

export const { launchPrimaryThread, threadMetadataAttached } = threadRootSlice.actions;

export const {
  selectPrimaryThreadId,
  selectActiveThreadId,
  selectThreadById,
  selectParentThreadId,
  selectChildThreadIds,
} = threadRootSlice.selectors;

export default threadRootSlice;
```

- [ ] **Step 2: Run the focused test and verify it passes**

Run:

```bash
cd codex-gui
pnpm exec vitest --run src/features/projection/__tests__/threadRootSlice.test.ts
```

Expected: PASS for all `thread root reducer` tests.

---

### Task 3: Register Thread Root Slice in the Store

**Files:**
- Modify: `codex-gui/src/app/store.ts`

- [ ] **Step 1: Update the store imports and reducer list**

Replace the store imports and `rootReducer` setup with:

```ts
import type { Action, ThunkAction } from "@reduxjs/toolkit";
import { combineSlices, configureStore } from "@reduxjs/toolkit";
import { counterSlice } from "@/features/counter/counterSlice";
import projectionSlice from "@/features/projection/projectionSlice";
import threadRootSlice from "@/features/projection/threadRootSlice";

const rootReducer = combineSlices(counterSlice, projectionSlice, threadRootSlice);
```

Leave the rest of `store.ts` unchanged.

- [ ] **Step 2: Run the focused thread root test again**

Run:

```bash
cd codex-gui
pnpm exec vitest --run src/features/projection/__tests__/threadRootSlice.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run existing projection reducer tests to catch accidental store breakage**

Run:

```bash
cd codex-gui
pnpm exec vitest --run src/features/projection/__tests__/projectionSlice.test.ts
```

Expected: PASS. This plan does not rewrite the existing projection reducer yet; it only adds the new thread root foundation beside it.

---

### Task 4: Typecheck and Lint the Focused Frontend Change

**Files:**
- Check: `codex-gui/src/features/projection/threadRootSlice.ts`
- Check: `codex-gui/src/features/projection/__tests__/threadRootSlice.test.ts`
- Check: `codex-gui/src/app/store.ts`

- [ ] **Step 1: Run TypeScript typecheck**

Run:

```bash
cd codex-gui
pnpm run type-check
```

Expected: PASS with no TypeScript errors.

- [ ] **Step 2: Run lint**

Run:

```bash
cd codex-gui
pnpm run lint
```

Expected: PASS with no ESLint errors.

- [ ] **Step 3: Run the narrow frontend tests used by this plan**

Run:

```bash
cd codex-gui
pnpm exec vitest --run \
  src/features/projection/__tests__/threadRootSlice.test.ts \
  src/features/projection/__tests__/projectionSlice.test.ts
```

Expected: PASS.

---

### Task 5: Commit the Thread Root Foundation

**Files:**
- Stage: `codex-gui/src/features/projection/threadRootSlice.ts`
- Stage: `codex-gui/src/features/projection/__tests__/threadRootSlice.test.ts`
- Stage: `codex-gui/src/app/store.ts`

- [ ] **Step 1: Inspect the final diff**

Run:

```bash
git diff -- codex-gui/src/features/projection/threadRootSlice.ts \
  codex-gui/src/features/projection/__tests__/threadRootSlice.test.ts \
  codex-gui/src/app/store.ts
```

Expected: diff only contains the new thread root slice, tests, and store registration.

- [ ] **Step 2: Stage only the implementation files**

Run:

```bash
git add codex-gui/src/features/projection/threadRootSlice.ts \
  codex-gui/src/features/projection/__tests__/threadRootSlice.test.ts \
  codex-gui/src/app/store.ts
```

- [ ] **Step 3: Commit**

Run:

```bash
git commit -m "feat(gui): add thread root store foundation"
```

Expected: commit succeeds with only the staged thread root implementation files.

---

## Self-Review

- Spec coverage: This plan covers the thread root decisions: TS data-TUI direction, multi-thread-capable shape, `primaryThreadId`/`activeThreadId`, flat graph indexes, metadata-only thread records, attach metadata replacement, local graph edge updates, launch-derived primary id, and metadata-only child threads.
- Intentional gaps: Turn lifecycle, item lifecycle, projection lifecycle, reattach, runtime state, UI rendering, composer, and child navigation are out of scope for this plan.
- Placeholder scan: no placeholder sections or unspecified implementation steps remain.
- Type consistency: The plan consistently uses `ThreadRootState`, `ThreadRecord`, `launchPrimaryThread`, `threadMetadataAttached`, and selectors exported from `threadRootSlice.ts`.
