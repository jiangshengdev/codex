import type { UnknownAction } from "@reduxjs/toolkit";
import { describe, expect, it, vi } from "vitest";
import type { AppDispatch } from "@/app/store";
import { makeStore } from "@/app/store";
import { createGuiHostCommands } from "@/__tests__/appBrowserTestSupport";
import { composerCapture } from "@/features/composerInputQueue/__tests__/composerInputQueueTestFixtures";
import {
  createComposerInputQueueCoordinator,
  type ComposerInputQueueCoordinatorReleaseReservation,
} from "@/features/composerInputQueue/composerInputQueueCoordinator";
import type { GuiHostCommands } from "@/features/guiHost/guiHostClient";
import {
  attachBaseline,
  attachReplacement,
  eventAgentMessageDelta,
  eventSubscriptionReplacement,
  eventTurnStarted,
} from "@/features/projection/__tests__/projectionFixtures";
import {
  attachWithThreadId,
  deltaWithEnvelope,
  eventWithEnvelope,
} from "@/features/projection/__tests__/projectionTestBuilders";
import {
  threadRuntimeDeltasAccepted,
  threadRuntimeEventBuffered,
} from "@/features/threadRuntime/threadRuntimeSlice";
import type { SkillCatalogState } from "@/features/skillCatalog/skillCatalogOwner";
import { liveThreadReplacementCommitted } from "../liveThreadReplacement";
import {
  ProjectionApplicationCoordinator,
  type ProjectionAnimationFrameScheduler,
} from "../projectionApplicationCoordinator";
import { ThreadSwitchCoordinator } from "../threadSwitchCoordinator";

const oldThreadId = attachBaseline.snapshot.thread.id;
const candidateThreadId = "00000000-0000-0000-0000-000000000002";
type AttachResponse = Awaited<ReturnType<GuiHostCommands["attachThreadProjection"]>>;
const emptySkillCatalogState: SkillCatalogState = {
  type: "ready",
  candidates: [],
  partialErrorCount: 0,
};

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => (resolve = settle));
  return { promise, resolve };
};

const createHarness = ({ initialActiveOwner = true } = {}) => {
  const store = makeStore();
  const actions: UnknownAction[] = [];
  let dispatchReentry: ((action: UnknownAction) => void) | undefined;
  const dispatch = ((action: UnknownAction) => {
    actions.push(action);
    const result = store.dispatch(action);
    dispatchReentry?.(action);
    return result;
  }) as AppDispatch;
  const scheduler: ProjectionAnimationFrameScheduler = {
    requestFrame: vi.fn<ProjectionAnimationFrameScheduler["requestFrame"]>(() => 1),
    cancelFrame: vi.fn<ProjectionAnimationFrameScheduler["cancelFrame"]>(),
  };
  const projectionOwner = new ProjectionApplicationCoordinator({ dispatch, scheduler });
  projectionOwner.handleLaunchThread(oldThreadId);
  projectionOwner.handleProjectionAttached(attachBaseline);
  actions.length = 0;

  const commands = createGuiHostCommands();
  vi.mocked(commands.listSkills).mockResolvedValue({ data: [] });
  vi.mocked(commands.attachThreadProjection).mockImplementation(({ threadId }) =>
    Promise.resolve(attachWithThreadId(attachReplacement, threadId)),
  );
  const queueCoordinator = createComposerInputQueueCoordinator({
    threadId: oldThreadId,
    activeTurnId: null,
    startTurn: commands.startTurn,
    steerTurn: commands.steerTurn,
    interruptTurn: commands.interruptTurn,
  });
  const realReserveRelease = queueCoordinator.reserveRelease;
  const reservationRelease = vi.fn<ComposerInputQueueCoordinatorReleaseReservation["release"]>();
  const reserveRelease = vi.spyOn(queueCoordinator, "reserveRelease").mockImplementation(() => {
    const result = realReserveRelease();
    if (result.type === "blocked") return result;
    return {
      type: "reserved",
      reservation: {
        release: () => {
          reservationRelease();
          result.reservation.release();
        },
      },
    };
  });
  const queueDispose = vi.spyOn(queueCoordinator, "dispose");
  const projectionDispose = vi.spyOn(projectionOwner, "dispose");
  const skillCatalogDispose = vi.fn<() => void>();
  const skillCatalog = {
    getSnapshot: () => emptySkillCatalogState,
    subscribe: () => () => undefined,
    invalidate: () => false,
    retry: () => false,
    dispose: skillCatalogDispose,
  };
  let activeOwnerDisposed = false;
  const activeOwnerDispose = vi.fn<(cause?: "disposed" | "ownerReplaced") => void>((cause) => {
    if (activeOwnerDisposed) {
      return;
    }
    activeOwnerDisposed = true;
    try {
      queueCoordinator.dispose(cause);
    } finally {
      try {
        skillCatalog.dispose();
      } finally {
        projectionOwner.dispose();
      }
    }
  });
  const publishActiveOwner =
    vi.fn<ConstructorParameters<typeof ThreadSwitchCoordinator>[0]["publishActiveOwner"]>();
  const coordinator = new ThreadSwitchCoordinator({
    activeOwner: initialActiveOwner
      ? {
          threadId: oldThreadId,
          subscriptionId: attachBaseline.subscriptionId,
          projectionOwner,
          queueCoordinator,
          skillCatalog,
          dispose: activeOwnerDispose,
        }
      : null,
    commands,
    dispatch,
    publishActiveOwner,
    scheduler,
  });

  return {
    actions,
    activeOwnerDispose,
    commands,
    coordinator,
    projectionDispose,
    publishActiveOwner,
    queueCoordinator,
    queueDispose,
    reservationRelease,
    reserveRelease,
    scheduler,
    skillCatalogDispose,
    setDispatchReentry: (reentry: (action: UnknownAction) => void) => {
      dispatchReentry = reentry;
    },
    store,
  };
};

describe("ThreadSwitchCoordinator", () => {
  it("publishes the first owner through the shared switch transaction", async () => {
    const h = createHarness({ initialActiveOwner: false });

    await expect(h.coordinator.continueThread(candidateThreadId)).resolves.toMatchObject({
      type: "switched",
      activeOwner: { threadId: candidateThreadId },
      cleanupFailure: null,
    });

    expect(h.commands.resumeThread).toHaveBeenCalledExactlyOnceWith({
      threadId: candidateThreadId,
    });
    expect(h.commands.attachThreadProjection).toHaveBeenCalledExactlyOnceWith({
      threadId: candidateThreadId,
    });
    expect(h.actions.filter(liveThreadReplacementCommitted.match)).toHaveLength(1);
    expect(h.publishActiveOwner).toHaveBeenCalledOnce();
    expect(h.coordinator.getActiveOwner()?.threadId).toBe(candidateThreadId);
    expect(h.reserveRelease).not.toHaveBeenCalled();
    expect(h.queueDispose).not.toHaveBeenCalled();
    expect(h.projectionDispose).not.toHaveBeenCalled();
    expect(h.commands.detachThreadProjection).not.toHaveBeenCalled();
  });

  it.each(["resume", "attach"] as const)(
    "keeps the first owner absent after a %s failure",
    async (phase) => {
      const h = createHarness({ initialActiveOwner: false });
      const error = new Error(`${phase} failed`);
      if (phase === "resume") vi.mocked(h.commands.resumeThread).mockRejectedValueOnce(error);
      else vi.mocked(h.commands.attachThreadProjection).mockRejectedValueOnce(error);

      await expect(h.coordinator.continueThread(candidateThreadId)).resolves.toEqual({
        type: "failed",
        phase,
        error,
        cleanupFailure: null,
      });
      expect(h.coordinator.getActiveOwner()).toBeNull();
      expect(h.actions.filter(liveThreadReplacementCommitted.match)).toHaveLength(0);
      expect(h.publishActiveOwner).not.toHaveBeenCalled();
      expect(h.reserveRelease).not.toHaveBeenCalled();
      expect(h.commands.detachThreadProjection).not.toHaveBeenCalled();
    },
  );

  it("replays notifications buffered while preparing the first owner", async () => {
    const h = createHarness({ initialActiveOwner: false });
    const attach = attachWithThreadId(attachReplacement, candidateThreadId);
    const pending = deferred<AttachResponse>();
    vi.mocked(h.commands.attachThreadProjection).mockReturnValueOnce(pending.promise);
    const switching = h.coordinator.continueThread(candidateThreadId);
    await Promise.resolve();
    const candidateEvent = eventWithEnvelope(eventSubscriptionReplacement, {
      threadId: candidateThreadId,
      subscriptionId: attach.subscriptionId,
    });

    h.coordinator.handleProjectionEvent(eventTurnStarted);
    h.coordinator.handleProjectionEvent(candidateEvent);
    expect(h.actions).toHaveLength(0);
    pending.resolve(attach);

    await expect(switching).resolves.toMatchObject({ type: "switched" });
    expect(
      h.actions
        .filter((action) => action.type === threadRuntimeEventBuffered.type)
        .map(
          (action) =>
            (action as ReturnType<typeof threadRuntimeEventBuffered>).payload.notification.threadId,
        ),
    ).toEqual([candidateThreadId]);
  });

  it("disposes safely before the first owner exists", async () => {
    const h = createHarness({ initialActiveOwner: false });

    expect(() => {
      h.coordinator.handleProjectionEvent(eventTurnStarted);
      h.coordinator.dispose();
      h.coordinator.dispose();
    }).not.toThrow();
    await expect(h.coordinator.continueThread(candidateThreadId)).resolves.toEqual({
      type: "blocked",
      reason: { type: "disposed" },
      cleanupFailure: null,
    });
    expect(h.queueDispose).not.toHaveBeenCalled();
    expect(h.projectionDispose).not.toHaveBeenCalled();
    expect(h.commands.resumeThread).not.toHaveBeenCalled();
  });

  it("returns the current owner without reserving or issuing commands", async () => {
    const h = createHarness();
    const outcome = await h.coordinator.continueThread(oldThreadId);

    expect(outcome.type).toBe("current");
    expect(h.reserveRelease).not.toHaveBeenCalled();
    expect(h.commands.resumeThread).not.toHaveBeenCalled();
  });

  it("reports a queue blocker and retries after the owner becomes releasable", async () => {
    const h = createHarness();
    h.reserveRelease.mockReturnValueOnce({
      type: "blocked",
      blockers: [{ type: "ordinaryQueued", count: 1 }],
    });

    await expect(h.coordinator.continueThread(candidateThreadId)).resolves.toMatchObject({
      type: "blocked",
      reason: { type: "queueReleaseBlocked" },
    });
    expect(h.commands.resumeThread).not.toHaveBeenCalled();
    await expect(h.coordinator.continueThread(candidateThreadId)).resolves.toMatchObject({
      type: "switched",
    });
  });

  it("rejects asynchronously when reserving the queue release throws synchronously", async () => {
    const h = createHarness();
    const error = new Error("reserve release failed");
    h.reserveRelease.mockImplementationOnce(() => {
      throw error;
    });
    let switching!: ReturnType<ThreadSwitchCoordinator["continueThread"]>;

    expect(() => {
      switching = h.coordinator.continueThread(candidateThreadId);
    }).not.toThrow();
    await expect(switching).rejects.toBe(error);

    expect(h.commands.resumeThread).not.toHaveBeenCalled();
    expect(h.commands.attachThreadProjection).not.toHaveBeenCalled();
    expect(h.commands.detachThreadProjection).not.toHaveBeenCalled();
    expect(h.coordinator.getActiveOwner()?.threadId).toBe(oldThreadId);
  });

  it.each(["resume", "attach"] as const)("keeps the old owner on %s failure", async (phase) => {
    const h = createHarness();
    const error = new Error(`${phase} failed`);
    if (phase === "resume") vi.mocked(h.commands.resumeThread).mockRejectedValueOnce(error);
    else vi.mocked(h.commands.attachThreadProjection).mockRejectedValueOnce(error);

    await expect(h.coordinator.continueThread(candidateThreadId)).resolves.toMatchObject({
      type: "failed",
      phase,
      error,
    });
    expect(h.coordinator.getActiveOwner()?.threadId).toBe(oldThreadId);
    expect(h.actions.filter(liveThreadReplacementCommitted.match)).toHaveLength(0);
    expect(h.reservationRelease).toHaveBeenCalledOnce();
    expect(h.queueDispose).not.toHaveBeenCalled();
  });

  it("commits once, replaces all three slices, and releases the old owner once", async () => {
    const h = createHarness();
    const pending = deferred<AttachResponse>();
    vi.mocked(h.commands.attachThreadProjection).mockReturnValueOnce(pending.promise);
    const switching = h.coordinator.continueThread(candidateThreadId);
    await Promise.resolve();

    expect(h.actions.filter(liveThreadReplacementCommitted.match)).toHaveLength(0);
    pending.resolve(attachWithThreadId(attachReplacement, candidateThreadId));
    await expect(switching).resolves.toMatchObject({ type: "switched" });

    expect(h.actions.filter(liveThreadReplacementCommitted.match)).toHaveLength(1);
    expect(h.store.getState()).toMatchObject({
      threadIdentity: {
        launchThreadId: candidateThreadId,
        attachedThreadId: candidateThreadId,
        attachStatus: "attached",
      },
      threadRuntime: { current: { threadId: candidateThreadId } },
      transcriptState: { threadId: candidateThreadId },
    });
    expect(h.queueDispose).toHaveBeenCalledOnce();
    expect(h.projectionDispose).toHaveBeenCalledOnce();
    expect(h.activeOwnerDispose).toHaveBeenCalledOnce();
    expect(h.activeOwnerDispose).toHaveBeenCalledExactlyOnceWith("ownerReplaced");
    expect(h.skillCatalogDispose).toHaveBeenCalledOnce();
    expect(h.publishActiveOwner).toHaveBeenCalledOnce();
  });

  it.each(["resume", "attach"] as const)(
    "keeps the release reservation for the entire pending %s phase",
    async (phase) => {
      const h = createHarness();
      let switching: ReturnType<ThreadSwitchCoordinator["continueThread"]>;
      let resolvePending: () => void | Promise<void>;
      if (phase === "resume") {
        const pending = deferred<Awaited<ReturnType<GuiHostCommands["resumeThread"]>>>();
        vi.mocked(h.commands.resumeThread).mockReturnValueOnce(pending.promise);
        switching = h.coordinator.continueThread(candidateThreadId);
        resolvePending = async () => {
          const response = await createGuiHostCommands().resumeThread({
            threadId: candidateThreadId,
          });
          pending.resolve(response);
        };
      } else {
        const pending = deferred<AttachResponse>();
        vi.mocked(h.commands.attachThreadProjection).mockReturnValueOnce(pending.promise);
        switching = h.coordinator.continueThread(candidateThreadId);
        resolvePending = () => {
          pending.resolve(attachWithThreadId(attachReplacement, candidateThreadId));
        };
      }
      if (phase === "attach") await Promise.resolve();

      expect(h.queueCoordinator.submit(composerCapture("blocked during switch"))).toEqual({
        type: "rejected",
        reason: "releaseReserved",
      });
      expect(h.queueCoordinator.recover()).toBe(false);
      expect(h.queueCoordinator.reserveRelease()).toEqual({
        type: "blocked",
        blockers: [{ type: "releaseReserved" }],
      });
      await resolvePending();
      await expect(switching).resolves.toMatchObject({ type: "switched" });
      expect(h.reservationRelease).not.toHaveBeenCalled();
    },
  );

  it("dispatches the shared replacement before publishing the active owner", async () => {
    const h = createHarness();
    const order: string[] = [];
    h.setDispatchReentry((action) => {
      if (liveThreadReplacementCommitted.match(action)) order.push("dispatch");
    });
    h.publishActiveOwner.mockImplementationOnce(() => {
      order.push("publish");
    });

    await h.coordinator.continueThread(candidateThreadId);

    expect(order).toEqual(["dispatch", "publish"]);
  });

  it("isolates candidate notifications and ignores late notifications from the old owner", async () => {
    const h = createHarness();
    const attach = attachWithThreadId(attachReplacement, candidateThreadId);
    const pending = deferred<AttachResponse>();
    vi.mocked(h.commands.attachThreadProjection).mockReturnValueOnce(pending.promise);
    const switching = h.coordinator.continueThread(candidateThreadId);
    await Promise.resolve();
    const candidateEvent = eventWithEnvelope(eventSubscriptionReplacement, {
      threadId: candidateThreadId,
      subscriptionId: attach.subscriptionId,
    });

    h.coordinator.handleProjectionEvent(candidateEvent);
    expect(h.actions).toHaveLength(0);
    h.coordinator.handleProjectionEvent(eventTurnStarted);
    expect(
      h.actions.filter((action) => action.type === threadRuntimeEventBuffered.type),
    ).toHaveLength(1);
    pending.resolve(attach);
    await switching;
    expect(
      h.actions
        .filter((action) => action.type === threadRuntimeEventBuffered.type)
        .map(
          (action) =>
            (action as ReturnType<typeof threadRuntimeEventBuffered>).payload.notification.threadId,
        ),
    ).toEqual([oldThreadId, candidateThreadId]);
    const actionCount = h.actions.length;
    h.coordinator.handleProjectionEvent(eventTurnStarted);
    expect(h.actions).toHaveLength(actionCount);
  });

  it("keeps old-owner deltas out of the candidate owner before and after commit", async () => {
    const h = createHarness();
    const scheduledFrames = new Map<number, () => void>();
    let nextFrameId = 1;
    vi.mocked(h.scheduler.requestFrame).mockImplementation((callback) => {
      const frameId = nextFrameId;
      nextFrameId += 1;
      scheduledFrames.set(frameId, callback);
      return frameId;
    });
    vi.mocked(h.scheduler.cancelFrame).mockImplementation((frameId) => {
      scheduledFrames.delete(frameId);
    });
    const pending = deferred<AttachResponse>();
    vi.mocked(h.commands.attachThreadProjection).mockReturnValueOnce(pending.promise);
    const switching = h.coordinator.continueThread(candidateThreadId);
    await Promise.resolve();

    h.coordinator.handleProjectionDelta(eventAgentMessageDelta);
    expect(scheduledFrames.size).toBe(1);
    pending.resolve(attachWithThreadId(attachReplacement, candidateThreadId));
    await switching;
    expect(scheduledFrames.size).toBe(0);
    const oldDelta = deltaWithEnvelope(eventAgentMessageDelta, {
      threadId: oldThreadId,
      subscriptionId: attachBaseline.subscriptionId,
    });
    h.coordinator.handleProjectionDelta(oldDelta);
    expect(scheduledFrames.size).toBe(0);
    const candidateDelta = deltaWithEnvelope(eventAgentMessageDelta, {
      threadId: candidateThreadId,
      subscriptionId: attachReplacement.subscriptionId,
    });
    const runtimeBeforeFlush = h.store.getState().threadRuntime;
    h.coordinator.handleProjectionDelta(candidateDelta);
    expect(scheduledFrames.size).toBe(1);
    const flushCandidateDeltas = scheduledFrames.values().next().value;
    if (flushCandidateDeltas == null) throw new Error("expected a scheduled candidate delta flush");
    flushCandidateDeltas();

    expect(h.actions.filter(threadRuntimeDeltasAccepted.match)).toEqual([
      threadRuntimeDeltasAccepted({ notifications: [candidateDelta] }),
    ]);
    expect(h.store.getState().threadRuntime).toEqual(runtimeBeforeFlush);
  });

  it("detaches an attached candidate that cannot commit", async () => {
    const h = createHarness();
    const detachError = new Error("candidate detach failed");
    vi.mocked(h.commands.attachThreadProjection).mockResolvedValueOnce(
      attachWithThreadId(attachReplacement, "00000000-0000-0000-0000-000000000003"),
    );
    vi.mocked(h.commands.detachThreadProjection).mockRejectedValueOnce(detachError);

    await expect(h.coordinator.continueThread(candidateThreadId)).resolves.toMatchObject({
      type: "failed",
      phase: "attach",
      cleanupFailure: {
        phase: "detach",
        owner: "candidate",
        threadId: candidateThreadId,
        error: detachError,
      },
    });
    expect(h.commands.detachThreadProjection).toHaveBeenCalledWith({
      threadId: candidateThreadId,
    });
    expect(h.actions.filter(liveThreadReplacementCommitted.match)).toHaveLength(0);
  });

  it("reports a previous-owner detach failure after a successful commit", async () => {
    const h = createHarness();
    const error = new Error("previous detach failed");
    vi.mocked(h.commands.detachThreadProjection).mockRejectedValueOnce(error);

    await expect(h.coordinator.continueThread(candidateThreadId)).resolves.toMatchObject({
      type: "switched",
      cleanupFailure: {
        phase: "detach",
        owner: "previous",
        threadId: oldThreadId,
        error,
      },
    });
    expect(h.coordinator.getActiveOwner()?.threadId).toBe(candidateThreadId);
  });

  it.each(["dispatch", "publish"] as const)("survives %s reentrant disposal", async (source) => {
    const h = createHarness();
    if (source === "dispatch") {
      h.setDispatchReentry((action) => {
        if (liveThreadReplacementCommitted.match(action)) h.coordinator.dispose();
      });
    } else {
      h.publishActiveOwner.mockImplementationOnce(() => {
        h.coordinator.dispose();
      });
    }

    const outcome = await h.coordinator.continueThread(candidateThreadId);
    expect(outcome.type).toBe("switched");
    if (outcome.type !== "switched") throw new Error("expected a switched outcome");
    expect(outcome.activeOwner.queueCoordinator.getReleaseReadiness()).toEqual({
      type: "blocked",
      blockers: [{ type: "disposed" }],
    });
    expect(
      outcome.activeOwner.queueCoordinator.readPendingInputPage({
        lane: "ordinary",
        revision: 0,
        cursor: null,
        limit: 1,
      }),
    ).toEqual({ type: "unavailable", scope: "ownerGone", reason: "disposed" });
    expect(h.queueDispose).toHaveBeenCalledOnce();
    expect(h.projectionDispose).toHaveBeenCalledOnce();
    expect(h.activeOwnerDispose).toHaveBeenCalledOnce();
    expect(h.activeOwnerDispose).toHaveBeenCalledExactlyOnceWith("ownerReplaced");
    expect(h.skillCatalogDispose).toHaveBeenCalledOnce();
    await expect(h.coordinator.continueThread(oldThreadId)).resolves.toMatchObject({
      type: "blocked",
      reason: { type: "disposed" },
    });
  });

  it.each(["commit", "publish", "replay"] as const)(
    "converges owner and cleanup when application %s throws",
    async (operation) => {
      const h = createHarness();
      const error = new Error(`${operation} failed`);
      let switching: ReturnType<ThreadSwitchCoordinator["continueThread"]>;
      if (operation === "publish") {
        h.publishActiveOwner.mockImplementationOnce(() => {
          throw error;
        });
        switching = h.coordinator.continueThread(candidateThreadId);
      } else if (operation === "commit") {
        h.setDispatchReentry((action) => {
          if (liveThreadReplacementCommitted.match(action)) throw error;
        });
        switching = h.coordinator.continueThread(candidateThreadId);
      } else {
        const attach = attachWithThreadId(attachReplacement, candidateThreadId);
        const pending = deferred<AttachResponse>();
        vi.mocked(h.commands.attachThreadProjection).mockReturnValueOnce(pending.promise);
        h.setDispatchReentry((action) => {
          if (action.type === threadRuntimeEventBuffered.type) throw error;
        });
        switching = h.coordinator.continueThread(candidateThreadId);
        await Promise.resolve();
        h.coordinator.handleProjectionEvent(
          eventWithEnvelope(eventSubscriptionReplacement, {
            threadId: candidateThreadId,
            subscriptionId: attach.subscriptionId,
          }),
        );
        pending.resolve(attach);
      }

      await expect(switching).resolves.toMatchObject({
        type: "switched",
        cleanupFailure: { phase: "application", operation, error },
      });
      expect(h.coordinator.getActiveOwner()?.threadId).toBe(candidateThreadId);
      expect(h.queueDispose).toHaveBeenCalledOnce();
      expect(h.projectionDispose).toHaveBeenCalledOnce();
      expect(h.activeOwnerDispose).toHaveBeenCalledOnce();
      expect(h.activeOwnerDispose).toHaveBeenCalledExactlyOnceWith("ownerReplaced");
      expect(h.skillCatalogDispose).toHaveBeenCalledOnce();
      await expect(
        h.coordinator.continueThread("00000000-0000-0000-0000-000000000004"),
      ).resolves.toMatchObject({ type: "switched" });
    },
  );
});
