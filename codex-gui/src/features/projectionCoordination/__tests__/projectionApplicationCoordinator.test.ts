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
  eventWithEnvelope,
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

    expect(actions).toStrictEqual([attachedThreadIdObserved(mismatchedAttach.snapshot.thread.id)]);
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

  it("keeps replay, RAF, dispatch, and disposal state scoped to each coordinator instance", () => {
    const harnessA = createCoordinatorHarness();
    const harnessB = createCoordinatorHarness();
    if (eventTurnStarted.event.type !== "turnStarted") {
      throw new Error("fixture must contain a turnStarted projection event");
    }
    const snapshotAhead = attachWithHeadCommitId(
      attachWithTurns(attachBaseline, [eventTurnStarted.event.notification.turn]),
      eventTurnStarted.parentCommitId,
    );
    attachCoordinator(harnessA, snapshotAhead);
    attachCoordinator(harnessB);

    harnessA.coordinator.handleProjectionEvent(eventTurnStarted);

    expect(harnessA.actions).toStrictEqual([
      threadRuntimeEventBuffered({
        notification: eventTurnStarted,
        replay: "snapshotDuplicate",
      }),
    ]);
    harnessA.actions.length = 0;

    harnessA.coordinator.handleProjectionDelta(eventAgentMessageDelta);
    harnessB.coordinator.handleProjectionEvent(eventTurnStarted);

    expect(harnessA.actions).toStrictEqual([]);
    expect(harnessA.pendingFrameCount()).toBe(1);
    expect(harnessB.actions).toStrictEqual([
      threadRuntimeEventBuffered({
        notification: eventTurnStarted,
        replay: "live",
      }),
    ]);
    expect(harnessB.pendingFrameCount()).toBe(0);

    harnessA.coordinator.dispose();

    expect(harnessA.canceledFrameIds).toStrictEqual([1]);
    expect(harnessA.pendingFrameCount()).toBe(0);
    expect(harnessB.actions).toStrictEqual([
      threadRuntimeEventBuffered({
        notification: eventTurnStarted,
        replay: "live",
      }),
    ]);
    expect(harnessB.pendingFrameCount()).toBe(0);

    harnessB.coordinator.handleProjectionDelta(eventAgentMessageDelta);

    expect(harnessB.pendingFrameCount()).toBe(1);

    harnessB.runNextFrame();

    expect(harnessA.actions).toStrictEqual([]);
    expect(harnessB.actions).toStrictEqual([
      threadRuntimeEventBuffered({
        notification: eventTurnStarted,
        replay: "live",
      }),
      threadRuntimeDeltasAccepted({ notifications: [eventAgentMessageDelta] }),
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
    const oldOnlyEvent = eventWithEnvelope(
      turnStarted(eventSubscriptionReplacement, "commit-old-baseline-only", oldOnlyTurn),
      {
        parentCommitId: replacementAttach.snapshot.headCommitId,
      },
    );

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

  it("reschedules delta batching after an animation frame flush", () => {
    const harness = createCoordinatorHarness();
    attachCoordinator(harness);
    const firstDelta = agentMessageDelta(
      eventAgentMessageDelta,
      "turn-delta-reschedule",
      "agent-delta-reschedule",
      "Hello",
    );
    const secondDelta = agentMessageDelta(
      eventAgentMessageDelta,
      "turn-delta-reschedule",
      "agent-delta-reschedule",
      " world",
    );
    const thirdDelta = agentMessageDelta(
      eventAgentMessageDelta,
      "turn-delta-reschedule",
      "agent-delta-reschedule",
      " again",
    );

    harness.coordinator.handleProjectionDelta(firstDelta);
    harness.coordinator.handleProjectionDelta(secondDelta);
    harness.runNextFrame();
    harness.coordinator.handleProjectionDelta(thirdDelta);

    expect(harness.pendingFrameCount()).toBe(1);
    expect(harness.actions).toStrictEqual([
      threadRuntimeDeltasAccepted({ notifications: [firstDelta, secondDelta] }),
    ]);

    harness.runNextFrame();

    expect(harness.actions).toStrictEqual([
      threadRuntimeDeltasAccepted({ notifications: [firstDelta, secondDelta] }),
      threadRuntimeDeltasAccepted({ notifications: [thirdDelta] }),
    ]);
  });

  it("does not flush pending deltas for a mismatched attach", () => {
    const harness = createCoordinatorHarness();
    const mismatchedAttach = attachWithThreadId(
      attachBaseline,
      "00000000-0000-0000-0000-000000000999",
    );
    attachCoordinator(harness);

    harness.coordinator.handleProjectionDelta(eventAgentMessageDelta);
    harness.coordinator.handleProjectionAttached(mismatchedAttach);

    expect(harness.actions).toStrictEqual([
      attachedThreadIdObserved(mismatchedAttach.snapshot.thread.id),
    ]);
    expect(harness.pendingFrameCount()).toBe(1);

    harness.runNextFrame();

    expect(harness.actions).toStrictEqual([
      attachedThreadIdObserved(mismatchedAttach.snapshot.thread.id),
      threadRuntimeDeltasAccepted({ notifications: [eventAgentMessageDelta] }),
    ]);
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
