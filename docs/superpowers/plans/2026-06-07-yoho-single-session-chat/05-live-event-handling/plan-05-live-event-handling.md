# Live Event Handling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `liveEventHandling` GUI feature module that derives `source: "liveEvent"` timeline material from `threadRuntime.eventBuffer` and manual reconnect status from `threadRuntime.subscription`.

**Architecture:** Implement live event handling as a pure TypeScript selector module with no Redux state, React wiring, or UI side effects. The module reads `threadRuntimeSlice` and `snapshotReplay` selectors, preserves projection event lifecycle order, appends subscription interruption status when present, and exposes a combined timeline selector for the later chat surface.

**Tech Stack:** TypeScript, Redux Toolkit selectors, Vitest, pnpm.

---

## Scope

This plan implements only `05 Live Event Handling`.

It creates:

- `codex-gui/src/features/liveEventHandling/liveEventHandling.ts`
- `codex-gui/src/features/liveEventHandling/__tests__/liveEventHandling.test.ts`

It does not modify `threadRuntimeSlice`, `snapshotReplay`, `App.tsx`, the Redux store, the GUI host debug panel, composer behavior, reconnect behavior, streaming delta handling, chat view model, or tool activity UI.

## File Structure

- Create: `codex-gui/src/features/liveEventHandling/liveEventHandling.ts`
  - Owns live event material types, subscription status material types, pure derivation helpers, live-only selectors, and the combined timeline selector.
- Create: `codex-gui/src/features/liveEventHandling/__tests__/liveEventHandling.test.ts`
  - Covers empty runtime, live event material derivation, item lifecycle preservation, replay/live ordering, subscription status material, and event buffer immutability.

---

### Task 1: Add Failing Live Event Handling Tests

**Files:**
- Create: `codex-gui/src/features/liveEventHandling/__tests__/liveEventHandling.test.ts`

- [ ] **Step 1: Write the failing live event handling tests**

Create `codex-gui/src/features/liveEventHandling/__tests__/liveEventHandling.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { makeStore } from "@/app/store";
import attachBaselineJson from "@/features/projection/__fixtures__/attach-baseline.json";
import eventItemCompletedJson from "@/features/projection/__fixtures__/event-item-completed.json";
import eventItemStartedJson from "@/features/projection/__fixtures__/event-item-started.json";
import eventTurnCompletedJson from "@/features/projection/__fixtures__/event-turn-completed.json";
import eventTurnStartedJson from "@/features/projection/__fixtures__/event-turn-started.json";
import { selectSnapshotReplayMaterials } from "@/features/snapshotReplay/snapshotReplay";
import {
  selectThreadRuntimeEventBuffer,
  selectThreadRuntimeRecord,
  threadRuntimeAttached,
  threadRuntimeEventBuffered,
  threadRuntimeManualReconnectRequired,
} from "@/features/threadRuntime/threadRuntimeSlice";
import type {
  ThreadProjectionAttachResponse,
  ThreadProjectionEventNotification,
  Turn,
} from "@codex-protocol/v2";
import {
  buildLiveEventMaterials,
  buildLiveSubscriptionMaterials,
  selectLiveEventMaterials,
  selectLiveSubscriptionMaterials,
  selectThreadTimelineMaterials,
  type LiveEventMaterial,
  type LiveSubscriptionMaterial,
  type TimelineMaterial,
} from "../liveEventHandling";

const attachBaseline = attachBaselineJson as ThreadProjectionAttachResponse;
const eventTurnStarted = eventTurnStartedJson as ThreadProjectionEventNotification;
const eventItemStarted = eventItemStartedJson as ThreadProjectionEventNotification;
const eventItemCompleted = eventItemCompletedJson as ThreadProjectionEventNotification;
const eventTurnCompleted = eventTurnCompletedJson as ThreadProjectionEventNotification;

const turnWithoutItems = ({
  id,
  itemsView,
  status,
  error,
  startedAt,
  completedAt,
  durationMs,
}: Turn): Omit<Turn, "items"> => ({
  id,
  itemsView,
  status,
  error,
  startedAt,
  completedAt,
  durationMs,
});

describe("live event handling", () => {
  it("returns no material when no runtime exists", () => {
    const store = makeStore();

    expect(buildLiveEventMaterials(null)).toStrictEqual([]);
    expect(buildLiveSubscriptionMaterials(null)).toStrictEqual([]);
    expect(selectLiveEventMaterials(store.getState())).toStrictEqual([]);
    expect(selectLiveSubscriptionMaterials(store.getState())).toStrictEqual([]);
    expect(selectThreadTimelineMaterials(store.getState())).toStrictEqual([]);
  });

  it("derives live turn and item lifecycle material in event buffer order", () => {
    if (eventTurnStarted.event.type !== "turnStarted") {
      throw new Error("fixture must contain a turnStarted projection event");
    }
    if (eventItemStarted.event.type !== "itemStarted") {
      throw new Error("fixture must contain an itemStarted projection event");
    }
    if (eventItemCompleted.event.type !== "itemCompleted") {
      throw new Error("fixture must contain an itemCompleted projection event");
    }
    if (eventTurnCompleted.event.type !== "turnCompleted") {
      throw new Error("fixture must contain a turnCompleted projection event");
    }

    const store = makeStore();
    store.dispatch(threadRuntimeAttached(attachBaseline));
    store.dispatch(threadRuntimeEventBuffered(eventTurnStarted));
    store.dispatch(threadRuntimeEventBuffered(eventItemStarted));
    store.dispatch(threadRuntimeEventBuffered(eventItemCompleted));
    store.dispatch(threadRuntimeEventBuffered(eventTurnCompleted));

    const expectedMaterials = [
      {
        type: "turnStarted",
        source: "liveEvent",
        threadId: eventTurnStarted.threadId,
        turn: eventTurnStarted.event.notification.turn,
      },
      {
        type: "itemStarted",
        source: "liveEvent",
        threadId: eventItemStarted.threadId,
        turnId: eventItemStarted.event.notification.turnId,
        item: eventItemStarted.event.notification.item,
      },
      {
        type: "itemCompleted",
        source: "liveEvent",
        threadId: eventItemCompleted.threadId,
        turnId: eventItemCompleted.event.notification.turnId,
        item: eventItemCompleted.event.notification.item,
      },
      {
        type: "turnCompleted",
        source: "liveEvent",
        threadId: eventTurnCompleted.threadId,
        turn: turnWithoutItems(eventTurnCompleted.event.notification.turn),
      },
    ] satisfies LiveEventMaterial[];

    expect(buildLiveEventMaterials(selectThreadRuntimeRecord(store.getState()))).toStrictEqual(
      expectedMaterials,
    );
    expect(selectLiveEventMaterials(store.getState())).toStrictEqual(expectedMaterials);
  });

  it("does not collapse item started and completed lifecycle material", () => {
    if (eventItemStarted.event.type !== "itemStarted") {
      throw new Error("fixture must contain an itemStarted projection event");
    }
    if (eventItemCompleted.event.type !== "itemCompleted") {
      throw new Error("fixture must contain an itemCompleted projection event");
    }

    const store = makeStore();
    store.dispatch(threadRuntimeAttached(attachBaseline));
    store.dispatch(threadRuntimeEventBuffered(eventTurnStarted));
    store.dispatch(threadRuntimeEventBuffered(eventItemStarted));
    store.dispatch(threadRuntimeEventBuffered(eventItemCompleted));

    expect(selectLiveEventMaterials(store.getState()).slice(1)).toStrictEqual([
      {
        type: "itemStarted",
        source: "liveEvent",
        threadId: eventItemStarted.threadId,
        turnId: eventItemStarted.event.notification.turnId,
        item: eventItemStarted.event.notification.item,
      },
      {
        type: "itemCompleted",
        source: "liveEvent",
        threadId: eventItemCompleted.threadId,
        turnId: eventItemCompleted.event.notification.turnId,
        item: eventItemCompleted.event.notification.item,
      },
    ] satisfies LiveEventMaterial[]);
  });

  it("derives subscription interrupted material only for manual reconnect state", () => {
    const store = makeStore();
    store.dispatch(threadRuntimeAttached(attachBaseline));

    expect(selectLiveSubscriptionMaterials(store.getState())).toStrictEqual([]);

    store.dispatch(
      threadRuntimeManualReconnectRequired({
        reason: "backpressure",
        threadId: attachBaseline.snapshot.thread.id,
        subscriptionId: attachBaseline.subscriptionId,
      }),
    );

    const expectedMaterials = [
      {
        type: "subscriptionInterrupted",
        source: "liveEvent",
        threadId: attachBaseline.snapshot.thread.id,
        reason: "backpressure",
        subscriptionId: attachBaseline.subscriptionId,
      },
    ] satisfies LiveSubscriptionMaterial[];

    expect(buildLiveSubscriptionMaterials(selectThreadRuntimeRecord(store.getState()))).toStrictEqual(
      expectedMaterials,
    );
    expect(selectLiveSubscriptionMaterials(store.getState())).toStrictEqual(expectedMaterials);
  });

  it("combines snapshot replay, live events, and subscription status in timeline order", () => {
    if (eventTurnStarted.event.type !== "turnStarted") {
      throw new Error("fixture must contain a turnStarted projection event");
    }

    const store = makeStore();
    store.dispatch(threadRuntimeAttached(attachBaseline));
    store.dispatch(threadRuntimeEventBuffered(eventTurnStarted));
    store.dispatch(
      threadRuntimeManualReconnectRequired({
        reason: "backpressure",
        threadId: attachBaseline.snapshot.thread.id,
        subscriptionId: attachBaseline.subscriptionId,
      }),
    );

    const expectedTimeline = [
      ...selectSnapshotReplayMaterials(store.getState()),
      {
        type: "turnStarted",
        source: "liveEvent",
        threadId: eventTurnStarted.threadId,
        turn: eventTurnStarted.event.notification.turn,
      },
      {
        type: "subscriptionInterrupted",
        source: "liveEvent",
        threadId: attachBaseline.snapshot.thread.id,
        reason: "backpressure",
        subscriptionId: attachBaseline.subscriptionId,
      },
    ] satisfies TimelineMaterial[];

    expect(selectThreadTimelineMaterials(store.getState())).toStrictEqual(expectedTimeline);
  });

  it("does not mutate or consume the runtime event buffer", () => {
    const store = makeStore();
    store.dispatch(threadRuntimeAttached(attachBaseline));
    store.dispatch(threadRuntimeEventBuffered(eventTurnStarted));
    const before = selectThreadRuntimeEventBuffer(store.getState());

    selectLiveEventMaterials(store.getState());
    selectThreadTimelineMaterials(store.getState());

    expect(selectThreadRuntimeEventBuffer(store.getState())).toStrictEqual(before);
  });
});
```

- [ ] **Step 2: Run the focused live event handling test and confirm it fails**

Run from the repo root:

```bash
pnpm --dir codex-gui exec vitest --run src/features/liveEventHandling/__tests__/liveEventHandling.test.ts
```

Expected result: FAIL because `../liveEventHandling` does not exist yet.

- [ ] **Step 3: Keep the failing test uncommitted until implementation**

Run:

```bash
git status --short
```

Expected result: the failing test file is still uncommitted. Do not commit a red test state; commit the test and implementation together after the focused suite passes in Task 2.

---

### Task 2: Implement Live Event Handling Selectors

**Files:**
- Create: `codex-gui/src/features/liveEventHandling/liveEventHandling.ts`
- Modify: `codex-gui/src/features/liveEventHandling/__tests__/liveEventHandling.test.ts` only if TypeScript narrowing requires local test cleanup.

- [ ] **Step 1: Add the live event handling implementation**

Create `codex-gui/src/features/liveEventHandling/liveEventHandling.ts`:

```ts
import type { RootState } from "@/app/store";
import {
  selectSnapshotReplayMaterials,
  type SnapshotReplayMaterial,
} from "@/features/snapshotReplay/snapshotReplay";
import {
  selectThreadRuntimeRecord,
  type ThreadRuntimeBufferedEvent,
  type ThreadRuntimeRecord,
} from "@/features/threadRuntime/threadRuntimeSlice";
import type { ProjectionManualReconnectReason } from "@/features/projectionIngress/projectionIngressAdapter";
import type { ThreadItem, Turn } from "@codex-protocol/v2";

export type LiveEventSource = "liveEvent";

export type LiveEventMaterial =
  | {
      type: "turnStarted";
      source: LiveEventSource;
      threadId: string;
      turn: Turn;
    }
  | {
      type: "itemStarted";
      source: LiveEventSource;
      threadId: string;
      turnId: string;
      item: ThreadItem;
    }
  | {
      type: "itemCompleted";
      source: LiveEventSource;
      threadId: string;
      turnId: string;
      item: ThreadItem;
    }
  | {
      type: "turnCompleted";
      source: LiveEventSource;
      threadId: string;
      turn: Omit<Turn, "items">;
    };

export type LiveSubscriptionMaterial = {
  type: "subscriptionInterrupted";
  source: LiveEventSource;
  threadId: string;
  reason: ProjectionManualReconnectReason;
  subscriptionId: string | null;
};

export type TimelineMaterial =
  | SnapshotReplayMaterial
  | LiveEventMaterial
  | LiveSubscriptionMaterial;

const LIVE_EVENT_SOURCE: LiveEventSource = "liveEvent";

const turnWithoutItems = ({
  id,
  itemsView,
  status,
  error,
  startedAt,
  completedAt,
  durationMs,
}: Turn): Omit<Turn, "items"> => ({
  id,
  itemsView,
  status,
  error,
  startedAt,
  completedAt,
  durationMs,
});

const liveMaterialFromBufferedEvent = (
  bufferedEvent: ThreadRuntimeBufferedEvent,
): LiveEventMaterial => {
  const { notification } = bufferedEvent;

  switch (notification.event.type) {
    case "turnStarted":
      return {
        type: "turnStarted",
        source: LIVE_EVENT_SOURCE,
        threadId: notification.threadId,
        turn: notification.event.notification.turn,
      };
    case "itemStarted":
      return {
        type: "itemStarted",
        source: LIVE_EVENT_SOURCE,
        threadId: notification.threadId,
        turnId: notification.event.notification.turnId,
        item: notification.event.notification.item,
      };
    case "itemCompleted":
      return {
        type: "itemCompleted",
        source: LIVE_EVENT_SOURCE,
        threadId: notification.threadId,
        turnId: notification.event.notification.turnId,
        item: notification.event.notification.item,
      };
    case "turnCompleted":
      return {
        type: "turnCompleted",
        source: LIVE_EVENT_SOURCE,
        threadId: notification.threadId,
        turn: turnWithoutItems(notification.event.notification.turn),
      };
  }
};

export const buildLiveEventMaterials = (
  runtime: ThreadRuntimeRecord | null,
): LiveEventMaterial[] => {
  if (runtime == null) {
    return [];
  }

  return runtime.eventBuffer.map(liveMaterialFromBufferedEvent);
};

export const buildLiveSubscriptionMaterials = (
  runtime: ThreadRuntimeRecord | null,
): LiveSubscriptionMaterial[] => {
  if (runtime?.subscription.state !== "manualReconnectRequired") {
    return [];
  }

  return [
    {
      type: "subscriptionInterrupted",
      source: LIVE_EVENT_SOURCE,
      threadId: runtime.threadId,
      reason: runtime.subscription.reason,
      subscriptionId: runtime.subscription.subscriptionId,
    },
  ];
};

export const selectLiveEventMaterials = (state: RootState): LiveEventMaterial[] =>
  buildLiveEventMaterials(selectThreadRuntimeRecord(state));

export const selectLiveSubscriptionMaterials = (
  state: RootState,
): LiveSubscriptionMaterial[] =>
  buildLiveSubscriptionMaterials(selectThreadRuntimeRecord(state));

export const selectThreadTimelineMaterials = (state: RootState): TimelineMaterial[] => [
  ...selectSnapshotReplayMaterials(state),
  ...selectLiveEventMaterials(state),
  ...selectLiveSubscriptionMaterials(state),
];
```

- [ ] **Step 2: Run the focused live event handling test and confirm it passes**

Run:

```bash
pnpm --dir codex-gui exec vitest --run src/features/liveEventHandling/__tests__/liveEventHandling.test.ts
```

Expected result: PASS.

- [ ] **Step 3: Run focused regression tests for dependencies**

Run:

```bash
pnpm --dir codex-gui exec vitest --run src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts
pnpm --dir codex-gui exec vitest --run src/features/snapshotReplay/__tests__/snapshotReplay.test.ts
```

Expected result: both suites PASS. These confirm `05` did not change runtime buffering or snapshot replay semantics.

- [ ] **Step 4: Run type check**

Run:

```bash
pnpm --dir codex-gui run type-check
```

Expected result: PASS.

- [ ] **Step 5: Format changed frontend files**

Run:

```bash
pnpm --dir codex-gui exec prettier --write src/features/liveEventHandling/liveEventHandling.ts src/features/liveEventHandling/__tests__/liveEventHandling.test.ts
```

Expected result: Prettier reports the two live event handling files as written.

- [ ] **Step 6: Commit the implementation**

Run:

```bash
git add codex-gui/src/features/liveEventHandling/liveEventHandling.ts codex-gui/src/features/liveEventHandling/__tests__/liveEventHandling.test.ts
git commit -m "feat(gui): derive live event timeline materials"
```

Expected result: one implementation commit that adds the pure selector module and updates the test if formatting changed it.

---

### Task 3: Final Verification And Scope Check

**Files:**
- Verify: `codex-gui/src/features/liveEventHandling/liveEventHandling.ts`
- Verify: `codex-gui/src/features/liveEventHandling/__tests__/liveEventHandling.test.ts`
- Verify: `docs/superpowers/specs/2026-06-07-yoho-single-session-chat/05-live-event-handling/design.md`

- [ ] **Step 1: Run the focused verification suite**

Run:

```bash
pnpm --dir codex-gui exec vitest --run src/features/liveEventHandling/__tests__/liveEventHandling.test.ts
pnpm --dir codex-gui exec vitest --run src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts
pnpm --dir codex-gui exec vitest --run src/features/snapshotReplay/__tests__/snapshotReplay.test.ts
pnpm --dir codex-gui run type-check
```

Expected result: all commands PASS.

- [ ] **Step 2: Run GUI package CI**

Run:

```bash
pnpm --dir codex-gui run ci
```

Expected result: PASS. This is package-level GUI verification for the frontend change, not a repo-wide full test suite.

- [ ] **Step 3: Confirm no UI or runtime reducers were changed**

Run:

```bash
git show --stat --oneline HEAD
git show --name-only --format= HEAD
```

Expected changed files:

```text
codex-gui/src/features/liveEventHandling/__tests__/liveEventHandling.test.ts
codex-gui/src/features/liveEventHandling/liveEventHandling.ts
```

No changes should appear under:

```text
codex-gui/src/App.tsx
codex-gui/src/app/store.ts
codex-gui/src/features/threadRuntime/threadRuntimeSlice.ts
codex-gui/src/features/snapshotReplay/snapshotReplay.ts
```

- [ ] **Step 4: Confirm design scope stayed intact**

Run:

```bash
rg -n "ChatSurface|composer|turn/start|turn/interrupt|markdown|tool activity|reconnect button|AgentMessageDelta|delta" codex-gui/src/features/liveEventHandling
```

Expected result: no matches. `05` must not implement chat view model, composer behavior, reconnect UI, tool activity, or streaming delta handling.

- [ ] **Step 5: Review the committed diff**

Run:

```bash
git show -- codex-gui/src/features/liveEventHandling/liveEventHandling.ts codex-gui/src/features/liveEventHandling/__tests__/liveEventHandling.test.ts
```

Expected result:

- The implementation commit contains the focused live event handling tests.
- The implementation commit contains only the pure selector module and its focused tests.
- The implementation keeps `liveEventHandling` as a pure derived layer.
- Live materials use `source: "liveEvent"`.
- Snapshot replay materials still come from `selectSnapshotReplayMaterials`.
- Manual reconnect status is represented as `subscriptionInterrupted` and is not treated as thread close or turn completion.

- [ ] **Step 6: Commit plan completion separately after implementation**

After all previous steps pass and the plan checkboxes have been updated, run:

```bash
git add docs/superpowers/plans/2026-06-07-yoho-single-session-chat/05-live-event-handling/plan-05-live-event-handling.md
git commit -m "docs(gui): mark live event handling plan complete"
```

Expected result: one docs-only commit that updates this plan's checkboxes and records execution results if the implementing agent adds them.

## Execution Results

Record implementation results here after executing the plan:

- Focused live event handling test: not run during plan authoring.
- Focused thread runtime test: not run during plan authoring.
- Focused snapshot replay test: not run during plan authoring.
- Type check: not run during plan authoring.
- GUI package CI: not run during plan authoring.
- Commits: none created during plan authoring.
