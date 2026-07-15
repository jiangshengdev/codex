# Projection Application Coordination Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract projection application coordination from `GuiHostConnectionBridge` into a React-independent, instance-scoped coordinator while preserving all existing transport, adapter, Redux, replay, delta batching, reconnect, and teardown behavior.

**Architecture:** Add `ProjectionApplicationCoordinator`, an imperative class that owns the `ProjectionIngressAdapter`, the single replay baseline, pending delta RAF state, outcome mapping, and idempotent disposal. `GuiHostConnectionBridge` creates one coordinator per effect, forwards typed GUI host callbacks, and retains only React state handoff, connection startup/error handling, and connection cleanup.

**Tech Stack:** React 19, TypeScript 6, Redux Toolkit, Vitest Node tests, Vitest Browser Mode with Playwright, pnpm through the repository's fnm-managed toolchain.

---

状态：待确认

设计依据：`docs/superpowers/specs/2026-07-15-codex-gui-projection-application-coordination-design.md`

## Scope And File Map

Create:

- `codex-gui/src/features/projectionCoordination/projectionApplicationCoordinator.ts`
  - Owns application coordination state and callback ordering.
- `codex-gui/src/features/projectionCoordination/__tests__/projectionApplicationCoordinator.test.ts`
  - Locks action order, replay lifecycle, RAF batching, reconnect boundaries, and disposal without React or a real browser.

Modify:

- `codex-gui/src/features/projection/__tests__/projectionTestBuilders.ts`
  - Adds one shared builder for a legal attach snapshot with a selected head commit.
- `codex-gui/src/features/appShell/GuiHostConnectionBridge.tsx`
  - Removes application coordination state and delegates typed callbacks to the coordinator.

Do not modify:

- `codex-gui/src/features/guiHost/guiHostClient.ts`
- `codex-gui/src/features/projectionIngress/projectionIngressAdapter.ts`
- `codex-gui/src/features/threadIdentity/threadIdentitySlice.ts`
- `codex-gui/src/features/threadRuntime/threadRuntimeSlice.ts`
- `codex-gui/src/features/transcriptState/**`
- protocol, Rust, timeline, rendering, or UI files

All commands below use `cwd=/Users/jiangsheng/cnb/codex/codex-gui`. Do not install or update dependencies.

Task 1 and Task 2 are independent review stops: Task 1 lands a tested but not yet wired application owner; Task 2 delegates the existing production Bridge path to that owner. Either local commit can be inspected or reverted independently, and the repeated reconnect cases use a parameterized test to keep the total non-mechanical change below the repository's 800-line review ceiling.

## Task 1: Add Coordinator Characterization Tests And Implementation

**Files:**

- Create: `codex-gui/src/features/projectionCoordination/__tests__/projectionApplicationCoordinator.test.ts`
- Create: `codex-gui/src/features/projectionCoordination/projectionApplicationCoordinator.ts`
- Modify: `codex-gui/src/features/projection/__tests__/projectionTestBuilders.ts`

- [ ] **Step 1: Add the shared attach head builder**

Add this builder after `attachWithTurns` in `projectionTestBuilders.ts`:

```ts
export const attachWithHeadCommitId = (
  attach: ThreadProjectionAttachResponse,
  headCommitId: string | null,
): ThreadProjectionAttachResponse => ({
  ...attach,
  snapshot: {
    ...attach.snapshot,
    headCommitId,
  },
});
```

This is a legal projection payload variant, so it belongs in the shared projection builder surface rather than the coordinator test.

- [ ] **Step 2: Write the complete failing coordinator test file**

Create `projectionApplicationCoordinator.test.ts` with:

```ts
import type { UnknownAction } from "@reduxjs/toolkit";
import { describe, expect, it } from "vitest";
import type { AppDispatch } from "@/app/store";
import {
  attachBaseline,
  attachReplacement,
  closedBackpressure,
  eventAgentMessageDelta,
  eventItemStarted,
  eventSubscriptionReplacement,
  eventTurnStarted,
} from "@/features/projection/__tests__/projectionFixtures";
import {
  agentMessageDelta,
  attachWithHeadCommitId,
  attachWithThreadId,
  attachWithTurns,
  inProgressTurn,
  turnStarted,
} from "@/features/projection/__tests__/projectionTestBuilders";
import {
  ProjectionApplicationCoordinator,
  type ProjectionAnimationFrameScheduler,
} from "../projectionApplicationCoordinator";
import {
  attachedThreadIdObserved,
  launchThreadIdRecorded,
} from "@/features/threadIdentity/threadIdentitySlice";
import {
  threadRuntimeAttached,
  threadRuntimeDeltasAccepted,
  threadRuntimeEventBuffered,
  threadRuntimeManualReconnectRequired,
} from "@/features/threadRuntime/threadRuntimeSlice";

const projectionThreadId = attachBaseline.snapshot.thread.id;

const createCoordinatorHarness = () => {
  const actions: UnknownAction[] = [];
  const frameCallbacks = new Map<number, () => void>();
  const canceledFrameIds: number[] = [];
  let nextFrameId = 1;

  const scheduler: ProjectionAnimationFrameScheduler = {
    requestFrame: (callback) => {
      const frameId = nextFrameId;
      nextFrameId += 1;
      frameCallbacks.set(frameId, callback);
      return frameId;
    },
    cancelFrame: (frameId) => {
      canceledFrameIds.push(frameId);
      frameCallbacks.delete(frameId);
    },
  };

  const dispatch = ((action: UnknownAction) => {
    actions.push(action);
    return action;
  }) as unknown as AppDispatch;

  const coordinator = new ProjectionApplicationCoordinator({ dispatch, scheduler });

  const runNextFrame = () => {
    const entry = frameCallbacks.entries().next().value;
    if (entry == null) {
      throw new Error("expected a pending animation frame");
    }

    const [frameId, callback] = entry;
    frameCallbacks.delete(frameId);
    callback();
  };

  return {
    actions,
    canceledFrameIds,
    coordinator,
    pendingFrameCount: () => frameCallbacks.size,
    runNextFrame,
  };
};

const attachCoordinator = (
  harness: ReturnType<typeof createCoordinatorHarness>,
  attach = attachBaseline,
) => {
  harness.coordinator.handleLaunchThread(attach.snapshot.thread.id);
  harness.coordinator.handleProjectionAttached(attach);
  harness.actions.length = 0;
};

describe("ProjectionApplicationCoordinator", () => {
  it("records launch identity and accepts a matching attach", () => {
    const { actions, coordinator } = createCoordinatorHarness();

    coordinator.handleLaunchThread(projectionThreadId);
    coordinator.handleProjectionAttached(attachBaseline);

    expect(actions).toStrictEqual([
      launchThreadIdRecorded(projectionThreadId),
      attachedThreadIdObserved(projectionThreadId),
      threadRuntimeAttached(attachBaseline),
    ]);
  });

  it("records a mismatched attach without advancing runtime", () => {
    const { actions, coordinator } = createCoordinatorHarness();
    const mismatchedAttach = attachWithThreadId(
      attachBaseline,
      "00000000-0000-0000-0000-000000000999",
    );

    coordinator.handleLaunchThread(projectionThreadId);
    actions.length = 0;
    coordinator.handleProjectionAttached(mismatchedAttach);

    expect(actions).toStrictEqual([
      attachedThreadIdObserved(mismatchedAttach.snapshot.thread.id),
    ]);
  });

  it("classifies accepted events from the current replay baseline", () => {
    const harness = createCoordinatorHarness();
    if (eventTurnStarted.event.type !== "turnStarted") {
      throw new Error("fixture must contain a turnStarted projection event");
    }
    const snapshotAhead = attachWithHeadCommitId(
      attachWithTurns(attachBaseline, [eventTurnStarted.event.notification.turn]),
      eventTurnStarted.parentCommitId,
    );
    attachCoordinator(harness, snapshotAhead);

    harness.coordinator.handleProjectionEvent(eventTurnStarted);

    expect(harness.actions).toStrictEqual([
      threadRuntimeEventBuffered({
        notification: eventTurnStarted,
        replay: "snapshotDuplicate",
      }),
    ]);
  });

  it("replaces the replay baseline after an accepted replacement attach", () => {
    const harness = createCoordinatorHarness();
    if (eventSubscriptionReplacement.event.type !== "turnStarted") {
      throw new Error("fixture must contain a turnStarted projection event");
    }
    const oldOnlyTurn = inProgressTurn("old-baseline-only");
    const replacementTurn = eventSubscriptionReplacement.event.notification.turn;
    const oldAttach = attachWithTurns(attachBaseline, [oldOnlyTurn]);
    const replacementAttach = attachWithTurns(attachReplacement, [replacementTurn]);
    const oldOnlyEvent = {
      ...turnStarted(eventSubscriptionReplacement, "commit-old-baseline-only", oldOnlyTurn),
      parentCommitId: replacementAttach.snapshot.headCommitId,
    };

    attachCoordinator(harness, oldAttach);
    harness.coordinator.handleProjectionAttached(replacementAttach);
    harness.actions.length = 0;
    harness.coordinator.handleProjectionEvent(oldOnlyEvent);

    expect(harness.actions).toStrictEqual([
      threadRuntimeEventBuffered({ notification: oldOnlyEvent, replay: "live" }),
    ]);

    harness.coordinator.handleProjectionAttached(replacementAttach);
    harness.actions.length = 0;
    harness.coordinator.handleProjectionEvent(eventSubscriptionReplacement);

    expect(harness.actions).toStrictEqual([
      threadRuntimeEventBuffered({
        notification: eventSubscriptionReplacement,
        replay: "snapshotDuplicate",
      }),
    ]);
  });

  it("keeps the accepted replay baseline after a mismatched attach", () => {
    const harness = createCoordinatorHarness();
    if (eventTurnStarted.event.type !== "turnStarted") {
      throw new Error("fixture must contain a turnStarted projection event");
    }
    const validAttach = attachWithHeadCommitId(
      attachWithTurns(attachBaseline, [eventTurnStarted.event.notification.turn]),
      eventTurnStarted.parentCommitId,
    );
    const mismatchedAttach = attachWithThreadId(
      attachBaseline,
      "00000000-0000-0000-0000-000000000999",
    );
    attachCoordinator(harness, validAttach);

    harness.coordinator.handleProjectionAttached(mismatchedAttach);
    harness.coordinator.handleProjectionEvent(eventTurnStarted);

    expect(harness.actions).toStrictEqual([
      attachedThreadIdObserved(mismatchedAttach.snapshot.thread.id),
      threadRuntimeEventBuffered({
        notification: eventTurnStarted,
        replay: "snapshotDuplicate",
      }),
    ]);
  });

  it("batches accepted deltas in input order on one animation frame", () => {
    const harness = createCoordinatorHarness();
    attachCoordinator(harness);
    const firstDelta = agentMessageDelta(
      eventAgentMessageDelta,
      "turn-delta-batch",
      "agent-delta-batch",
      "Hello",
    );
    const secondDelta = agentMessageDelta(
      eventAgentMessageDelta,
      "turn-delta-batch",
      "agent-delta-batch",
      " world",
    );

    harness.coordinator.handleProjectionDelta(firstDelta);
    harness.coordinator.handleProjectionDelta(secondDelta);

    expect(harness.pendingFrameCount()).toBe(1);
    expect(harness.actions).toStrictEqual([]);

    harness.runNextFrame();

    expect(harness.actions).toStrictEqual([
      threadRuntimeDeltasAccepted({ notifications: [firstDelta, secondDelta] }),
    ]);
    expect(harness.pendingFrameCount()).toBe(0);
  });

  it("flushes pending deltas before an accepted event", () => {
    const harness = createCoordinatorHarness();
    attachCoordinator(harness);

    harness.coordinator.handleProjectionDelta(eventAgentMessageDelta);
    harness.coordinator.handleProjectionEvent(eventTurnStarted);

    expect(harness.actions).toStrictEqual([
      threadRuntimeDeltasAccepted({ notifications: [eventAgentMessageDelta] }),
      threadRuntimeEventBuffered({ notification: eventTurnStarted, replay: "live" }),
    ]);
    expect(harness.canceledFrameIds).toStrictEqual([1]);
    expect(harness.pendingFrameCount()).toBe(0);
  });

  it("flushes pending deltas before an accepted replacement attach", () => {
    const harness = createCoordinatorHarness();
    attachCoordinator(harness);

    harness.coordinator.handleProjectionDelta(eventAgentMessageDelta);
    harness.coordinator.handleProjectionAttached(attachReplacement);

    expect(harness.actions).toStrictEqual([
      attachedThreadIdObserved(projectionThreadId),
      threadRuntimeDeltasAccepted({ notifications: [eventAgentMessageDelta] }),
      threadRuntimeAttached(attachReplacement),
    ]);
    expect(harness.canceledFrameIds).toStrictEqual([1]);
  });

  it("does not flush pending deltas for ignored outcomes", () => {
    const harness = createCoordinatorHarness();
    attachCoordinator(harness);

    harness.coordinator.handleProjectionDelta(eventAgentMessageDelta);
    harness.coordinator.handleProjectionEvent(eventSubscriptionReplacement);

    expect(harness.actions).toStrictEqual([]);
    expect(harness.pendingFrameCount()).toBe(1);

    harness.runNextFrame();

    expect(harness.actions).toStrictEqual([
      threadRuntimeDeltasAccepted({ notifications: [eventAgentMessageDelta] }),
    ]);
  });

  it.each([
    {
      label: "commit-chain mismatch",
      attach: attachBaseline,
      trigger: (coordinator: ProjectionApplicationCoordinator) => {
        coordinator.handleProjectionEvent(eventItemStarted);
      },
      reason: "commitChainMismatch" as const,
    },
    {
      label: "missing turn",
      attach: attachWithHeadCommitId(
        attachWithTurns(attachBaseline, []),
        eventTurnStarted.commitId,
      ),
      trigger: (coordinator: ProjectionApplicationCoordinator) => {
        coordinator.handleProjectionEvent(eventItemStarted);
      },
      reason: "missingTurn" as const,
    },
    {
      label: "backpressure",
      attach: attachBaseline,
      trigger: (coordinator: ProjectionApplicationCoordinator) => {
        coordinator.handleProjectionClosed(closedBackpressure);
      },
      reason: "backpressure" as const,
    },
  ])("flushes pending deltas before $label reconnect", ({ attach, trigger, reason }) => {
    const harness = createCoordinatorHarness();
    attachCoordinator(harness, attach);

    harness.coordinator.handleProjectionDelta(eventAgentMessageDelta);
    trigger(harness.coordinator);

    expect(harness.actions).toStrictEqual([
      threadRuntimeDeltasAccepted({ notifications: [eventAgentMessageDelta] }),
      threadRuntimeManualReconnectRequired({
        reason,
        threadId: projectionThreadId,
        subscriptionId: attach.subscriptionId,
      }),
    ]);
  });

  it("suppresses notifications after reconnect and resets on replacement attach", () => {
    const harness = createCoordinatorHarness();
    attachCoordinator(harness);
    harness.coordinator.handleProjectionEvent(eventItemStarted);
    harness.actions.length = 0;

    harness.coordinator.handleProjectionEvent(eventTurnStarted);
    harness.coordinator.handleProjectionDelta(eventAgentMessageDelta);
    harness.coordinator.handleProjectionClosed(closedBackpressure);

    expect(harness.actions).toStrictEqual([]);
    expect(harness.pendingFrameCount()).toBe(0);

    harness.coordinator.handleProjectionAttached(attachReplacement);
    harness.actions.length = 0;
    harness.coordinator.handleProjectionEvent(eventSubscriptionReplacement);

    expect(harness.actions).toStrictEqual([
      threadRuntimeEventBuffered({
        notification: eventSubscriptionReplacement,
        replay: "live",
      }),
    ]);
  });

  it("keeps pending deltas when a new launch replaces the adapter", () => {
    const harness = createCoordinatorHarness();
    attachCoordinator(harness);

    harness.coordinator.handleProjectionDelta(eventAgentMessageDelta);
    harness.coordinator.handleLaunchThread(projectionThreadId);

    expect(harness.actions).toStrictEqual([launchThreadIdRecorded(projectionThreadId)]);
    expect(harness.pendingFrameCount()).toBe(1);

    harness.runNextFrame();

    expect(harness.actions).toStrictEqual([
      launchThreadIdRecorded(projectionThreadId),
      threadRuntimeDeltasAccepted({ notifications: [eventAgentMessageDelta] }),
    ]);
  });

  it("classifies from the new baseline after new launch and attach", () => {
    const harness = createCoordinatorHarness();
    if (eventTurnStarted.event.type !== "turnStarted") {
      throw new Error("fixture must contain a turnStarted projection event");
    }
    const oldAttach = attachWithHeadCommitId(
      attachWithTurns(attachBaseline, [eventTurnStarted.event.notification.turn]),
      eventTurnStarted.parentCommitId,
    );
    attachCoordinator(harness, oldAttach);

    harness.coordinator.handleLaunchThread(projectionThreadId);
    harness.coordinator.handleProjectionAttached(attachWithTurns(attachReplacement, []));
    harness.actions.length = 0;
    harness.coordinator.handleProjectionEvent(eventSubscriptionReplacement);

    expect(harness.actions).toStrictEqual([
      threadRuntimeEventBuffered({
        notification: eventSubscriptionReplacement,
        replay: "live",
      }),
    ]);
  });

  it("disposes idempotently and ignores late callbacks", () => {
    const harness = createCoordinatorHarness();
    attachCoordinator(harness);

    harness.coordinator.handleProjectionDelta(eventAgentMessageDelta);
    harness.coordinator.dispose();
    harness.coordinator.dispose();

    expect(harness.actions).toStrictEqual([]);
    expect(harness.canceledFrameIds).toStrictEqual([1]);
    expect(harness.pendingFrameCount()).toBe(0);

    harness.coordinator.handleLaunchThread(projectionThreadId);
    harness.coordinator.handleProjectionAttached(attachBaseline);
    harness.coordinator.handleProjectionEvent(eventTurnStarted);
    harness.coordinator.handleProjectionDelta(eventAgentMessageDelta);
    harness.coordinator.handleProjectionClosed(closedBackpressure);

    expect(harness.actions).toStrictEqual([]);
    expect(harness.pendingFrameCount()).toBe(0);
  });
});
```

- [ ] **Step 3: Run the coordinator test and verify RED**

Run:

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run test:unit -- \
  src/features/projectionCoordination/__tests__/projectionApplicationCoordinator.test.ts
```

Expected: FAIL because `../projectionApplicationCoordinator` does not exist. If it fails for a fixture typo or unrelated type error, correct the test and rerun until the failure is specifically the missing coordinator implementation.

- [ ] **Step 4: Implement the coordinator class**

Create `projectionApplicationCoordinator.ts` with:

```ts
import type { AppDispatch } from "@/app/store";
import {
  ProjectionIngressAdapter,
  type ProjectionIngressOutcome,
} from "@/features/projectionIngress/projectionIngressAdapter";
import {
  attachedThreadIdObserved,
  launchThreadIdRecorded,
} from "@/features/threadIdentity/threadIdentitySlice";
import {
  replayForProjectionEvent,
  snapshotReplayIndexFromTurns,
  type SnapshotReplayIndex,
  threadRuntimeAttached,
  type threadRuntimeDeltaAccepted,
  threadRuntimeDeltasAccepted,
  threadRuntimeEventBuffered,
  threadRuntimeManualReconnectRequired,
} from "@/features/threadRuntime/threadRuntimeSlice";
import type {
  ThreadProjectionAttachResponse,
  ThreadProjectionClosedNotification,
  ThreadProjectionDeltaNotification,
  ThreadProjectionEventNotification,
} from "@codex-protocol/v2";

export type ProjectionAnimationFrameScheduler = {
  requestFrame: (callback: () => void) => number;
  cancelFrame: (frameId: number) => void;
};

type ProjectionApplicationCoordinatorOptions = {
  dispatch: AppDispatch;
  scheduler: ProjectionAnimationFrameScheduler;
};

export class ProjectionApplicationCoordinator {
  private readonly dispatch: AppDispatch;
  private readonly scheduler: ProjectionAnimationFrameScheduler;
  private launchThreadId: string | null = null;
  private projectionIngress: ProjectionIngressAdapter | null = null;
  private snapshotReplayIndex: SnapshotReplayIndex | null = null;
  private pendingDeltaNotifications: ThreadProjectionDeltaNotification[] = [];
  private pendingDeltaFrame: number | null = null;
  private disposed = false;

  constructor({ dispatch, scheduler }: ProjectionApplicationCoordinatorOptions) {
    this.dispatch = dispatch;
    this.scheduler = scheduler;
  }

  handleLaunchThread(threadId: string): void {
    if (this.disposed) {
      return;
    }

    this.launchThreadId = threadId;
    this.projectionIngress = new ProjectionIngressAdapter(threadId);
    this.snapshotReplayIndex = null;
    this.dispatch(launchThreadIdRecorded(threadId));
  }

  handleProjectionAttached(response: ThreadProjectionAttachResponse): void {
    if (this.disposed) {
      return;
    }

    const attachedThreadId = response.snapshot.thread.id;
    this.dispatch(attachedThreadIdObserved(attachedThreadId));

    if (this.launchThreadId !== attachedThreadId || this.projectionIngress == null) {
      return;
    }

    const outcome = this.projectionIngress.handleAttach(response);
    if (outcome.type === "attachAccepted") {
      this.snapshotReplayIndex = snapshotReplayIndexFromTurns(
        outcome.response.snapshot.thread.turns,
      );
    }

    this.dispatchProjectionOutcome(outcome);
  }

  handleProjectionEvent(notification: ThreadProjectionEventNotification): void {
    if (this.disposed || this.projectionIngress == null) {
      return;
    }

    this.dispatchProjectionOutcome(this.projectionIngress.handleEvent(notification));
  }

  handleProjectionDelta(notification: ThreadProjectionDeltaNotification): void {
    if (this.disposed || this.projectionIngress == null) {
      return;
    }

    this.dispatchProjectionOutcome(this.projectionIngress.handleDelta(notification));
  }

  handleProjectionClosed(notification: ThreadProjectionClosedNotification): void {
    if (this.disposed || this.projectionIngress == null) {
      return;
    }

    this.dispatchProjectionOutcome(this.projectionIngress.handleClosed(notification));
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    this.pendingDeltaNotifications = [];
    this.cancelPendingDeltaFrame();
  }

  private dispatchProjectionOutcome(outcome: ProjectionIngressOutcome): void {
    switch (outcome.type) {
      case "attachAccepted":
        this.flushPendingDeltas();
        this.dispatch(threadRuntimeAttached(outcome.response));
        return;
      case "eventAccepted":
        this.flushPendingDeltas();
        this.dispatch(
          threadRuntimeEventBuffered({
            notification: outcome.notification,
            replay:
              this.snapshotReplayIndex == null
                ? "live"
                : replayForProjectionEvent(this.snapshotReplayIndex, outcome.notification),
          }),
        );
        return;
      case "deltaAccepted":
        this.enqueueProjectionDelta(outcome.notification);
        return;
      case "manualReconnectRequired":
        this.flushPendingDeltas();
        this.dispatch(
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
  }

  private enqueueProjectionDelta(
    notification: Parameters<typeof threadRuntimeDeltaAccepted>[0]["notification"],
  ): void {
    this.pendingDeltaNotifications.push(notification);
    this.schedulePendingDeltaFlush();
  }

  private schedulePendingDeltaFlush(): void {
    if (this.pendingDeltaFrame != null) {
      return;
    }

    this.pendingDeltaFrame = this.scheduler.requestFrame(() => {
      if (this.disposed) {
        return;
      }

      this.pendingDeltaFrame = null;
      this.flushPendingDeltas();
    });
  }

  private flushPendingDeltas(): void {
    if (this.pendingDeltaNotifications.length === 0) {
      this.cancelPendingDeltaFrame();
      return;
    }

    const notifications = this.pendingDeltaNotifications;
    this.pendingDeltaNotifications = [];
    this.cancelPendingDeltaFrame();
    this.dispatch(threadRuntimeDeltasAccepted({ notifications }));
  }

  private cancelPendingDeltaFrame(): void {
    if (this.pendingDeltaFrame == null) {
      return;
    }

    this.scheduler.cancelFrame(this.pendingDeltaFrame);
    this.pendingDeltaFrame = null;
  }
}
```

- [ ] **Step 5: Run the coordinator test and verify GREEN**

Run the same targeted unit command.

Expected: the coordinator test file passes with no warnings or unhandled errors.

- [ ] **Step 6: Run type checking for the new public types**

Run:

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
```

Expected: PASS. In particular, the fake dispatch cast, scheduler port, protocol payloads, and exhaustive outcome switch type-check.

- [ ] **Step 7: Format only the Task 1 files**

Run:

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec oxfmt --write \
  src/features/projectionCoordination/__tests__/projectionApplicationCoordinator.test.ts \
  src/features/projectionCoordination/projectionApplicationCoordinator.ts \
  src/features/projection/__tests__/projectionTestBuilders.ts
```

Expected: only the three listed Task 1 files are changed by formatting.

- [ ] **Step 8: Run task-local lint checks**

Run:

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec oxlint \
  src/features/projectionCoordination/__tests__/projectionApplicationCoordinator.test.ts \
  src/features/projectionCoordination/projectionApplicationCoordinator.ts \
  src/features/projection/__tests__/projectionTestBuilders.ts
/opt/homebrew/bin/fnm exec --using-file pnpm exec eslint \
  src/features/projectionCoordination/__tests__/projectionApplicationCoordinator.test.ts \
  src/features/projectionCoordination/projectionApplicationCoordinator.ts \
  src/features/projection/__tests__/projectionTestBuilders.ts --cache
```

Expected: both targeted lint commands pass without warnings.

- [ ] **Step 9: Re-run the targeted unit test after formatting and lint**

Run the targeted unit command again.

Expected: PASS.

- [ ] **Step 10: Commit the tested coordinator unit**

Review and stage only:

```bash
git diff -- src/features/projectionCoordination \
  src/features/projection/__tests__/projectionTestBuilders.ts
git add src/features/projectionCoordination \
  src/features/projection/__tests__/projectionTestBuilders.ts
git diff --cached --check
git diff --cached --stat
git commit -m "refactor(gui): add projection application coordinator"
```

Expected: one local commit containing the coordinator, its owner-local tests, and the shared legal payload builder. Do not stage the design or plan documents in this task.

## Task 2: Rewire The React Bridge To The Coordinator

**Files:**

- Modify: `codex-gui/src/features/appShell/GuiHostConnectionBridge.tsx`
- Verify: `codex-gui/src/__tests__/App.browser.test.tsx`

- [ ] **Step 1: Establish the pre-refactor Browser baseline**

Before editing the Bridge, run Chromium only for fast feedback:

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser -- \
  --run --browser=chromium src/__tests__/App.browser.test.tsx
```

Expected: the full App Browser file passes in the Chromium instance. If it does not, stop and diagnose the pre-existing failure before changing wiring.

- [ ] **Step 2: Replace the Bridge with connection and React wiring only**

Replace `GuiHostConnectionBridge.tsx` with:

```tsx
import { useEffect } from "react";
import { useAppDispatch } from "@/app/hooks";
import type {
  GuiHostCommands,
  GuiHostStatus,
  LaunchParams,
} from "@/features/guiHost/guiHostClient";
import { startGuiHostConnection } from "@/features/guiHost/guiHostClient";
import { ProjectionApplicationCoordinator } from "@/features/projectionCoordination/projectionApplicationCoordinator";

export type GuiHostConnectionBridgeProps = {
  setStatus: (status: GuiHostStatus) => void;
  setCommands: (commands: GuiHostCommands | null) => void;
  setLaunchParams: (params: LaunchParams | null) => void;
};

export function GuiHostConnectionBridge({
  setStatus,
  setCommands,
  setLaunchParams,
}: GuiHostConnectionBridgeProps) {
  const dispatch = useAppDispatch();

  useEffect(() => {
    let isMounted = true;
    let cleanupConnection: (() => void) | undefined;
    const coordinator = new ProjectionApplicationCoordinator({
      dispatch,
      scheduler: {
        requestFrame: (callback) => window.requestAnimationFrame(callback),
        cancelFrame: (frameId) => window.cancelAnimationFrame(frameId),
      },
    });

    try {
      cleanupConnection = startGuiHostConnection({
        location: new URL(window.location.href),
        replaceState: window.history.replaceState.bind(window.history),
        onStatus: setStatus,
        onLaunchParams: (params) => {
          setLaunchParams(params);
          coordinator.handleLaunchThread(params.threadId);
        },
        onProjectionAttached: (response) => {
          coordinator.handleProjectionAttached(response);
        },
        onProjectionEvent: (notification) => {
          coordinator.handleProjectionEvent(notification);
        },
        onProjectionDelta: (notification) => {
          coordinator.handleProjectionDelta(notification);
        },
        onProjectionClosed: (notification) => {
          coordinator.handleProjectionClosed(notification);
        },
        onCommandsReady: setCommands,
        onCommandsUnavailable: () => {
          setCommands(null);
        },
      });
    } catch (error: unknown) {
      queueMicrotask(() => {
        if (!isMounted) {
          return;
        }

        setCommands(null);
        setStatus({
          label: "error",
          message: error instanceof Error ? error.message : String(error),
        });
      });
    }

    return () => {
      isMounted = false;
      setCommands(null);
      setLaunchParams(null);
      coordinator.dispose();
      cleanupConnection?.();
    };
  }, [dispatch, setCommands, setLaunchParams, setStatus]);

  return null;
}
```

The coordinator must be constructed before `startGuiHostConnection`, because `onLaunchParams` is called synchronously before the WebSocket is created.

- [ ] **Step 3: Run the owner-local unit test after wiring**

Run:

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run test:unit -- \
  src/features/projectionCoordination/__tests__/projectionApplicationCoordinator.test.ts
```

Expected: PASS. The Bridge change must not alter the owner contract.

- [ ] **Step 4: Run the Chromium App Browser regression**

Run the same Chromium command from Step 1.

Expected: PASS. This verifies the production callback wiring, Redux/UI behavior, error handoff, commands handoff, replay lifecycle, RAF batching, reconnect handling, and unmount cleanup.

- [ ] **Step 5: Run structural ownership checks**

Run:

```bash
rg -n -e 'ProjectionIngressAdapter|ProjectionIngressOutcome|snapshotReplayIndex|pendingDeltaNotifications|pendingDeltaFrame|dispatchProjectionOutcome|threadRuntimeDeltasAccepted|threadRuntimeEventBuffered' \
  src/features/appShell/GuiHostConnectionBridge.tsx
```

Expected: no output.

Run:

```bash
rg -n -e 'class ProjectionApplicationCoordinator|private projectionIngress|private snapshotReplayIndex|private pendingDeltaNotifications|private pendingDeltaFrame|dispose\(\)' \
  src/features/projectionCoordination/projectionApplicationCoordinator.ts
```

Expected: matches for every listed owner field and `dispose()` in the coordinator file.

- [ ] **Step 6: Format only the Bridge file**

Run:

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec oxfmt --write \
  src/features/appShell/GuiHostConnectionBridge.tsx
git diff --check
git diff -- src/features/appShell/GuiHostConnectionBridge.tsx
```

Expected: formatting succeeds and the Bridge diff only removes coordination implementation and adds coordinator wiring.

- [ ] **Step 7: Run Bridge-local lint and type checks**

Run:

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec oxlint \
  src/features/appShell/GuiHostConnectionBridge.tsx
/opt/homebrew/bin/fnm exec --using-file pnpm exec eslint \
  src/features/appShell/GuiHostConnectionBridge.tsx --cache
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
```

Expected: both lint commands and the project type check pass.

- [ ] **Step 8: Re-run the Chromium regression after formatting and lint**

Run the Chromium command again.

Expected: PASS.

- [ ] **Step 9: Commit the Bridge wiring separately**

```bash
git add src/features/appShell/GuiHostConnectionBridge.tsx
git diff --cached --check
git diff --cached --stat
git commit -m "refactor(gui): delegate projection coordination"
```

Expected: one local commit containing only the Bridge wiring change. Do not stage design or plan documents.

## Task 3: Run Final B05 Verification

**Files:**

- Verify: `codex-gui/src/features/projectionCoordination/__tests__/projectionApplicationCoordinator.test.ts`
- Verify: `codex-gui/src/__tests__/App.browser.test.tsx`
- Verify: all `codex-gui` lint, type-check, formatting, and Node unit files

- [ ] **Step 1: Run the coordinator test directly**

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run test:unit -- \
  src/features/projectionCoordination/__tests__/projectionApplicationCoordinator.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run the App Browser file in all configured browsers**

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser -- \
  --run src/__tests__/App.browser.test.tsx
```

Expected: PASS in Chromium, Firefox, and WebKit. This command is required because `pnpm run ci` does not include Browser Mode.

- [ ] **Step 3: Run the complete GUI CI script**

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run ci
```

Expected: `format:oxfmt`, `lint:oxlint`, `lint:eslint`, `type-check`, and the complete Node Vitest unit suite all pass.

- [ ] **Step 4: Confirm the final diff and local commit boundaries**

From the repository root, run:

```bash
git status --short
git log -2 --oneline
git diff --check
```

Expected:

- the two B05 code commits are present locally;
- no production or test changes remain unstaged;
- the design and plan documents may remain untracked unless the user separately asks to submit them;
- no remote command has been run.

Do not run `pnpm install`, `playwright install`, the full unfiltered Browser suite, E2E tests, Vite build, Rust commands, snapshot commands, or any Git remote operation for this B05 scope.

## Completion Criteria

- `GuiHostConnectionBridge` owns no projection adapter, replay baseline, outcome mapping, delta queue, or RAF handle.
- `ProjectionApplicationCoordinator` is the sole owner of those responsibilities.
- B04's single retained replay baseline invariant remains true.
- Adapter outcomes, Redux actions, payloads, Transcript State behavior, transport callbacks, and user-visible UI remain unchanged.
- Coordinator tests prove launch, attach, event, delta, reconnect, replay, flush, new-launch, mismatch, and dispose ordering.
- Existing App Browser behavior passes in Chromium, Firefox, and WebKit.
- `pnpm run ci` passes through the fnm-managed pnpm runtime.
- Changes are split into local coordinator and Bridge commits; nothing is pushed.
