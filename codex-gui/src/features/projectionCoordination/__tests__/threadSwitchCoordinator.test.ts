import type { UnknownAction } from "@reduxjs/toolkit";
import { describe, expect, it, vi } from "vitest";
import type { AppDispatch } from "@/app/store";
import { makeStore } from "@/app/store";
import { createGuiHostCommands } from "@/__tests__/appBrowserTestSupport";
import {
  createComposerInputQueueCoordinator,
  type ComposerInputQueueCoordinatorReleaseReservation,
} from "@/features/composerInputQueue/composerInputQueueCoordinator";
import type { GuiHostCommands } from "@/features/guiHost/guiHostClient";
import {
  attachBaseline,
  attachReplacement,
  eventSubscriptionReplacement,
  eventTurnStarted,
} from "@/features/projection/__tests__/projectionFixtures";
import {
  attachWithThreadId,
  eventWithEnvelope,
} from "@/features/projection/__tests__/projectionTestBuilders";
import { threadRuntimeEventBuffered } from "@/features/threadRuntime/threadRuntimeSlice";
import { liveThreadReplacementCommitted } from "../liveThreadReplacement";
import {
  ProjectionApplicationCoordinator,
  type ProjectionAnimationFrameScheduler,
} from "../projectionApplicationCoordinator";
import { ThreadSwitchCoordinator } from "../threadSwitchCoordinator";

const oldThreadId = attachBaseline.snapshot.thread.id;
const candidateThreadId = "00000000-0000-0000-0000-000000000002";
type AttachResponse = Awaited<ReturnType<GuiHostCommands["attachThreadProjection"]>>;

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => (resolve = settle));
  return { promise, resolve };
};

const createHarness = () => {
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
  vi.mocked(commands.attachThreadProjection).mockImplementation(({ threadId }) =>
    Promise.resolve(attachWithThreadId(attachReplacement, threadId)),
  );
  const queueCoordinator = createComposerInputQueueCoordinator({
    threadId: oldThreadId,
    activeTurnId: null,
    startTurn: commands.startTurn,
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
  const publishActiveOwner =
    vi.fn<ConstructorParameters<typeof ThreadSwitchCoordinator>[0]["publishActiveOwner"]>();
  const coordinator = new ThreadSwitchCoordinator({
    activeOwner: {
      threadId: oldThreadId,
      subscriptionId: attachBaseline.subscriptionId,
      projectionOwner,
      queueCoordinator,
    },
    commands,
    dispatch,
    publishActiveOwner,
    scheduler,
  });

  return {
    actions,
    commands,
    coordinator,
    projectionDispose,
    publishActiveOwner,
    queueDispose,
    reservationRelease,
    reserveRelease,
    setDispatchReentry: (reentry: (action: UnknownAction) => void) => {
      dispatchReentry = reentry;
    },
    store,
  };
};

describe("ThreadSwitchCoordinator", () => {
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
    expect(h.coordinator.getActiveOwner().threadId).toBe(oldThreadId);
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
    expect(h.publishActiveOwner).toHaveBeenCalledOnce();
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

  it("detaches an attached candidate that cannot commit", async () => {
    const h = createHarness();
    vi.mocked(h.commands.attachThreadProjection).mockResolvedValueOnce(
      attachWithThreadId(attachReplacement, "00000000-0000-0000-0000-000000000003"),
    );

    await expect(h.coordinator.continueThread(candidateThreadId)).resolves.toMatchObject({
      type: "failed",
      phase: "attach",
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
    expect(h.coordinator.getActiveOwner().threadId).toBe(candidateThreadId);
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
    expect(h.queueDispose).toHaveBeenCalledOnce();
    expect(h.projectionDispose).toHaveBeenCalledOnce();
    await expect(h.coordinator.continueThread(oldThreadId)).resolves.toMatchObject({
      type: "blocked",
      reason: { type: "disposed" },
    });
  });
});
