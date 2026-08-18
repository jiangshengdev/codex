import type { UnknownAction } from "@reduxjs/toolkit";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createGuiHostCommands } from "@/__tests__/appBrowserTestSupport";
import type { AppDispatch } from "@/app/store";
import { makeStore } from "@/app/store";
import { BrowserAuthorizationSession } from "@/features/browserLaunch/browserAuthorizationSession";
import type { GuiRouteTarget } from "@/features/browserLaunch/guiRouteTarget";
import type { GuiHostCommands } from "@/features/guiHost/guiHostClient";
import {
  attachBaseline,
  attachReplacement,
  closedBackpressure,
  eventAgentMessageDelta,
  eventTurnStarted,
} from "@/features/projection/__tests__/projectionFixtures";
import {
  attachWithThreadId,
  closedWithEnvelope,
  deltaWithEnvelope,
  eventWithEnvelope,
} from "@/features/projection/__tests__/projectionTestBuilders";
import { liveThreadReplacementCommitted } from "@/features/projectionCoordination/liveThreadReplacement";
import {
  ProjectionApplicationCoordinator,
  type ProjectionAnimationFrameScheduler,
} from "@/features/projectionCoordination/projectionApplicationCoordinator";
import type { ActiveThreadOwnerHandle } from "@/features/projectionCoordination/activeThreadOwner";
import { RouteConnectionStartupCoordinator } from "../routeConnectionStartupCoordinator";

const currentThreadId = attachBaseline.snapshot.thread.id;
const recoveryThreadId = "00000000-0000-0000-0000-000000000002";
const detailThreadId = "00000000-0000-0000-0000-000000000003";
type AttachResponse = Awaited<ReturnType<GuiHostCommands["attachThreadProjection"]>>;

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => (resolve = settle));
  return { promise, resolve };
};

const expectSessionWriteFailure = (error: unknown, cause: Error): void => {
  expect(error).toBeInstanceOf(Error);
  if (!(error instanceof Error)) throw new Error("expected a session write error");
  expect(error.message).toBe("Unable to write browser authorization session");
  expect(error.cause).toBe(cause);
};

const requireActiveOwner = (
  activeOwner: ActiveThreadOwnerHandle | null,
): ActiveThreadOwnerHandle => {
  expect(activeOwner).not.toBeNull();
  if (activeOwner == null) throw new Error("expected an active owner");
  return activeOwner;
};

const createHarness = ({
  target,
  recoveryId = null,
}: {
  target: GuiRouteTarget;
  recoveryId?: string | null;
}) => {
  const store = makeStore();
  const actions: UnknownAction[] = [];
  const dispatch = ((action: UnknownAction) => {
    actions.push(action);
    return store.dispatch(action);
  }) as AppDispatch;
  const commands = createGuiHostCommands();
  vi.mocked(commands.attachThreadProjection).mockImplementation(({ threadId }) =>
    Promise.resolve(attachWithThreadId(attachReplacement, threadId)),
  );
  const storage = {
    getItem: vi.fn<Storage["getItem"]>(),
    setItem: vi.fn<Storage["setItem"]>(),
  };
  const authorizationSession = new BrowserAuthorizationSession(storage, {
    token: "secret",
    activeThreadId: recoveryId,
  });
  const commitActiveThread = vi.spyOn(authorizationSession, "commitActiveThread");
  const scheduler: ProjectionAnimationFrameScheduler = {
    requestFrame: vi.fn<ProjectionAnimationFrameScheduler["requestFrame"]>(() => 1),
    cancelFrame: vi.fn<ProjectionAnimationFrameScheduler["cancelFrame"]>(),
  };
  const coordinator = new RouteConnectionStartupCoordinator({
    target,
    authorizationSession,
    commands,
    dispatch,
    scheduler,
  });
  return {
    actions,
    authorizationSession,
    commands,
    commitActiveThread,
    coordinator,
    dispatch,
    scheduler,
    storage,
    store,
  };
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("RouteConnectionStartupCoordinator", () => {
  it("attaches the current route and commits recovery only before returning one live owner", async () => {
    const target = { type: "currentTask", threadId: currentThreadId } as const;
    const h = createHarness({ target, recoveryId: recoveryThreadId });
    const pending = deferred<AttachResponse>();
    vi.mocked(h.commands.attachThreadProjection).mockReturnValueOnce(pending.promise);

    const starting = h.coordinator.start();
    expect(h.commands.attachThreadProjection).toHaveBeenCalledWith({ threadId: currentThreadId });
    expect(h.commitActiveThread).not.toHaveBeenCalled();
    pending.resolve(attachWithThreadId(attachBaseline, currentThreadId));

    const outcome = await starting;
    if (outcome.type !== "ready") throw new Error("expected a ready outcome");
    expect(outcome).toEqual({
      type: "ready",
      target,
      activeOwner: outcome.activeOwner,
      cleanupFailure: null,
      postCommitFailure: null,
    });
    expect(outcome.activeOwner?.threadId).toBe(currentThreadId);
    expect(h.commitActiveThread).toHaveBeenCalledWith(currentThreadId);
    expect(h.actions.filter(liveThreadReplacementCommitted.match)).toHaveLength(1);
  });

  it("fails closed for a history list without recovery context", async () => {
    const target = { type: "historyList" } as const;
    const h = createHarness({ target });

    await expect(h.coordinator.start()).resolves.toEqual({
      type: "historyContextUnavailable",
      target,
      activeOwner: null,
      cleanupFailure: null,
    });
    expect(h.commands.attachThreadProjection).not.toHaveBeenCalled();
    expect(h.commands.listThreads).not.toHaveBeenCalled();
    expect(h.commitActiveThread).not.toHaveBeenCalled();
  });

  it("attaches only the recovery owner for a history list with context", async () => {
    const target = { type: "historyList" } as const;
    const h = createHarness({ target, recoveryId: recoveryThreadId });

    const outcome = await h.coordinator.start();
    if (outcome.type !== "ready") throw new Error("expected a ready outcome");
    expect(outcome).toEqual({
      type: "ready",
      target,
      activeOwner: outcome.activeOwner,
      cleanupFailure: null,
      postCommitFailure: null,
    });
    expect(h.commands.attachThreadProjection).toHaveBeenCalledWith({
      threadId: recoveryThreadId,
    });
    expect(h.commitActiveThread).toHaveBeenCalledWith(recoveryThreadId);
  });

  it("keeps an external history detail read-only when recovery is absent", async () => {
    const target = { type: "historyDetail", threadId: detailThreadId } as const;
    const h = createHarness({ target });

    await expect(h.coordinator.start()).resolves.toEqual({
      type: "ready",
      target,
      activeOwner: null,
      cleanupFailure: null,
      postCommitFailure: null,
    });
    expect(h.commands.attachThreadProjection).not.toHaveBeenCalled();
    expect(h.commands.startTurn).not.toHaveBeenCalled();
    expect(h.commitActiveThread).not.toHaveBeenCalled();
  });

  it("attaches only recovery for a history detail and never uses its route ID", async () => {
    const target = { type: "historyDetail", threadId: detailThreadId } as const;
    const h = createHarness({ target, recoveryId: recoveryThreadId });

    const outcome = await h.coordinator.start();
    if (outcome.type !== "ready") throw new Error("expected a ready outcome");
    expect(outcome).toEqual({
      type: "ready",
      target,
      activeOwner: outcome.activeOwner,
      cleanupFailure: null,
      postCommitFailure: null,
    });
    expect(h.commands.attachThreadProjection).toHaveBeenCalledTimes(1);
    expect(h.commands.attachThreadProjection).toHaveBeenCalledWith({
      threadId: recoveryThreadId,
    });
    expect(h.commands.readThread).not.toHaveBeenCalled();
  });

  it("preserves attach failures without committing or falling back", async () => {
    const target = { type: "currentTask", threadId: currentThreadId } as const;
    const h = createHarness({ target, recoveryId: recoveryThreadId });
    const error = new Error("attach failed");
    vi.mocked(h.commands.attachThreadProjection).mockRejectedValueOnce(error);

    await expect(h.coordinator.start()).resolves.toEqual({
      type: "failed",
      target,
      phase: "attach",
      error,
      cleanupFailure: null,
    });
    expect(h.commands.attachThreadProjection).toHaveBeenCalledTimes(1);
    expect(h.commitActiveThread).not.toHaveBeenCalled();
  });

  it("fails explicitly without attaching when disposed before start", async () => {
    const target = { type: "currentTask", threadId: currentThreadId } as const;
    const h = createHarness({ target, recoveryId: recoveryThreadId });

    h.coordinator.dispose();

    await expect(h.coordinator.start()).resolves.toEqual({
      type: "failed",
      target,
      phase: "application",
      error: new Error("Route connection startup was disposed before start"),
      cleanupFailure: null,
    });
    expect(h.commands.attachThreadProjection).not.toHaveBeenCalled();
    expect(h.commands.detachThreadProjection).not.toHaveBeenCalled();
    expect(h.commitActiveThread).not.toHaveBeenCalled();
  });

  it("keeps the committed owner and reports a buffered replay failure", async () => {
    const target = { type: "currentTask", threadId: currentThreadId } as const;
    const h = createHarness({ target, recoveryId: recoveryThreadId });
    const pending = deferred<AttachResponse>();
    vi.mocked(h.commands.attachThreadProjection).mockReturnValueOnce(pending.promise);
    const replayError = new Error("replay failed");
    vi.spyOn(
      ProjectionApplicationCoordinator.prototype,
      "handleProjectionEvent",
    ).mockImplementationOnce(() => {
      throw replayError;
    });
    const event = eventWithEnvelope(eventTurnStarted, {
      threadId: currentThreadId,
      subscriptionId: attachBaseline.subscriptionId,
    });

    const starting = h.coordinator.start();
    h.coordinator.handleProjectionEvent(event);
    pending.resolve(attachWithThreadId(attachBaseline, currentThreadId));

    const outcome = await starting;
    if (outcome.type !== "ready" || outcome.activeOwner == null) {
      throw new Error("expected a ready live owner");
    }
    expect(outcome).toEqual({
      type: "ready",
      target,
      activeOwner: outcome.activeOwner,
      cleanupFailure: null,
      postCommitFailure: {
        failures: [{ phase: "replay", error: replayError }],
      },
    });
    expect(h.commands.detachThreadProjection).not.toHaveBeenCalled();
    expect(h.commitActiveThread).toHaveBeenCalledWith(currentThreadId);
    expect(h.authorizationSession.getSnapshot()).toEqual({
      token: "secret",
      activeThreadId: currentThreadId,
    });
    expect(h.actions.filter(liveThreadReplacementCommitted.match)).toHaveLength(1);
    expect(outcome.activeOwner.queueCoordinator.submit("owner remains live")).toEqual({
      type: "accepted",
    });
  });

  it("keeps the committed owner and old recovery when session commit fails", async () => {
    const target = { type: "currentTask", threadId: currentThreadId } as const;
    const h = createHarness({ target, recoveryId: recoveryThreadId });
    const sessionError = new Error("session commit failed");
    h.storage.setItem.mockImplementationOnce(() => {
      throw sessionError;
    });

    const outcome = await h.coordinator.start();
    if (outcome.type !== "ready" || outcome.activeOwner == null) {
      throw new Error("expected a ready live owner");
    }
    expect(outcome).toEqual({
      type: "ready",
      target,
      activeOwner: outcome.activeOwner,
      cleanupFailure: null,
      postCommitFailure: {
        failures: [
          {
            phase: "authorizationSession",
            error: new Error("Unable to write browser authorization session", {
              cause: sessionError,
            }),
          },
        ],
      },
    });
    expectSessionWriteFailure(outcome.postCommitFailure?.failures[0]?.error, sessionError);
    expect(h.commands.detachThreadProjection).not.toHaveBeenCalled();
    expect(h.commitActiveThread).toHaveBeenCalledWith(currentThreadId);
    expect(h.authorizationSession.getSnapshot()).toEqual({
      token: "secret",
      activeThreadId: recoveryThreadId,
    });
    expect(h.actions.filter(liveThreadReplacementCommitted.match)).toHaveLength(1);
    expect(outcome.activeOwner.queueCoordinator.submit("owner remains live")).toEqual({
      type: "accepted",
    });
  });

  it("preserves replay and session errors when both post-commit steps fail", async () => {
    const target = { type: "currentTask", threadId: currentThreadId } as const;
    const h = createHarness({ target, recoveryId: recoveryThreadId });
    const pending = deferred<AttachResponse>();
    vi.mocked(h.commands.attachThreadProjection).mockReturnValueOnce(pending.promise);
    const replayError = new Error("replay failed");
    const sessionError = new Error("session commit failed");
    vi.spyOn(
      ProjectionApplicationCoordinator.prototype,
      "handleProjectionEvent",
    ).mockImplementationOnce(() => {
      throw replayError;
    });
    h.storage.setItem.mockImplementationOnce(() => {
      throw sessionError;
    });
    const event = eventWithEnvelope(eventTurnStarted, {
      threadId: currentThreadId,
      subscriptionId: attachBaseline.subscriptionId,
    });

    const starting = h.coordinator.start();
    h.coordinator.handleProjectionEvent(event);
    pending.resolve(attachWithThreadId(attachBaseline, currentThreadId));

    const outcome = await starting;
    if (outcome.type !== "ready" || outcome.activeOwner == null) {
      throw new Error("expected a ready live owner");
    }
    expect(outcome).toEqual({
      type: "ready",
      target,
      activeOwner: outcome.activeOwner,
      cleanupFailure: null,
      postCommitFailure: {
        failures: [
          { phase: "replay", error: replayError },
          {
            phase: "authorizationSession",
            error: new Error("Unable to write browser authorization session", {
              cause: sessionError,
            }),
          },
        ],
      },
    });
    expectSessionWriteFailure(outcome.postCommitFailure?.failures[1]?.error, sessionError);
    expect(h.commands.detachThreadProjection).not.toHaveBeenCalled();
    expect(h.authorizationSession.getSnapshot()).toEqual({
      token: "secret",
      activeThreadId: recoveryThreadId,
    });
    expect(outcome.activeOwner.queueCoordinator.submit("owner remains live")).toEqual({
      type: "accepted",
    });
  });

  it("rejects an attach identity mismatch and detaches the returned candidate", async () => {
    const target = { type: "currentTask", threadId: currentThreadId } as const;
    const h = createHarness({ target });
    vi.mocked(h.commands.attachThreadProjection).mockResolvedValueOnce(
      attachWithThreadId(attachReplacement, recoveryThreadId),
    );

    const outcome = await h.coordinator.start();
    expect(outcome).toMatchObject({ type: "failed", target, phase: "attach" });
    expect((outcome as { error: Error }).error.message).toBe(
      "thread/projection/attach returned a different thread identity",
    );
    expect(h.commands.detachThreadProjection).toHaveBeenCalledWith({
      threadId: currentThreadId,
    });
    expect(h.commitActiveThread).not.toHaveBeenCalled();
  });
  it("keeps the committed owner when the application commit dispatch throws", async () => {
    const target = { type: "currentTask", threadId: currentThreadId } as const;
    const h = createHarness({ target, recoveryId: recoveryThreadId });
    const applicationError = new Error("application failed");
    const failingDispatch = ((action: UnknownAction) => {
      if (liveThreadReplacementCommitted.match(action)) {
        throw applicationError;
      }
      return h.dispatch(action);
    }) as AppDispatch;
    const coordinator = new RouteConnectionStartupCoordinator({
      target,
      authorizationSession: h.authorizationSession,
      commands: h.commands,
      dispatch: failingDispatch,
      scheduler: h.scheduler,
    });

    const outcome = await coordinator.start();
    if (outcome.type !== "ready" || outcome.activeOwner == null) {
      throw new Error("expected a ready live owner");
    }
    expect(outcome).toEqual({
      type: "ready",
      target,
      activeOwner: outcome.activeOwner,
      cleanupFailure: null,
      postCommitFailure: {
        failures: [{ phase: "applicationCommit", error: applicationError }],
      },
    });
    expect(h.commands.detachThreadProjection).not.toHaveBeenCalled();
    expect(h.commitActiveThread).not.toHaveBeenCalled();
    expect(h.authorizationSession.getSnapshot()).toEqual({
      token: "secret",
      activeThreadId: recoveryThreadId,
    });
    expect(outcome.activeOwner.queueCoordinator.submit("owner remains live")).toEqual({
      type: "accepted",
    });
  });

  it("disposes and detaches once when dispose reenters the application commit", async () => {
    const target = { type: "currentTask", threadId: currentThreadId } as const;
    const h = createHarness({ target, recoveryId: recoveryThreadId });
    let ownerDuringCommit: ActiveThreadOwnerHandle | null = null;
    const reentrantDispatch = ((action: UnknownAction) => {
      if (liveThreadReplacementCommitted.match(action)) {
        ownerDuringCommit = (
          coordinator as unknown as { activeOwner: ActiveThreadOwnerHandle | null }
        ).activeOwner;
        coordinator.dispose();
      }
      return h.dispatch(action);
    }) as AppDispatch;
    const coordinator = new RouteConnectionStartupCoordinator({
      target,
      authorizationSession: h.authorizationSession,
      commands: h.commands,
      dispatch: reentrantDispatch,
      scheduler: h.scheduler,
    });

    const outcome = await coordinator.start();

    expect(outcome).toMatchObject({ type: "failed", target, phase: "application" });
    expect("activeOwner" in outcome).toBe(false);
    expect((outcome as { error: Error }).error.message).toBe(
      "Route connection startup was disposed",
    );
    expect(h.commands.detachThreadProjection).toHaveBeenCalledTimes(1);
    expect(h.commands.detachThreadProjection).toHaveBeenCalledWith({
      threadId: currentThreadId,
    });
    expect(h.commitActiveThread).not.toHaveBeenCalled();
    expect(h.commands.startTurn).not.toHaveBeenCalled();
    const disposedOwner = requireActiveOwner(ownerDuringCommit);
    expect(disposedOwner.queueCoordinator.getSnapshot().recoveryCount).toBe(0);
    expect(disposedOwner.queueCoordinator.submit("disposed owner")).toEqual({
      type: "rejected",
      reason: "disposed",
    });
  });

  it("disposes and detaches once when dispose reenters buffered replay", async () => {
    const target = { type: "currentTask", threadId: currentThreadId } as const;
    const h = createHarness({ target, recoveryId: recoveryThreadId });
    const pending = deferred<AttachResponse>();
    vi.mocked(h.commands.attachThreadProjection).mockReturnValueOnce(pending.promise);
    let ownerDuringReplay: ActiveThreadOwnerHandle | null = null;
    vi.spyOn(
      ProjectionApplicationCoordinator.prototype,
      "handleProjectionEvent",
    ).mockImplementationOnce(() => {
      ownerDuringReplay = (
        h.coordinator as unknown as { activeOwner: ActiveThreadOwnerHandle | null }
      ).activeOwner;
      h.coordinator.dispose();
    });
    const event = eventWithEnvelope(eventTurnStarted, {
      threadId: currentThreadId,
      subscriptionId: attachBaseline.subscriptionId,
    });

    const starting = h.coordinator.start();
    h.coordinator.handleProjectionEvent(event);
    pending.resolve(attachWithThreadId(attachBaseline, currentThreadId));
    const outcome = await starting;

    expect(outcome).toMatchObject({ type: "failed", target, phase: "application" });
    expect("activeOwner" in outcome).toBe(false);
    expect((outcome as { error: AggregateError }).error.errors).toEqual([
      new Error("Route connection startup was disposed during replay"),
      new Error("Route connection startup was disposed"),
    ]);
    expect(h.commands.detachThreadProjection).toHaveBeenCalledTimes(1);
    expect(h.commands.detachThreadProjection).toHaveBeenCalledWith({
      threadId: currentThreadId,
    });
    expect(h.commitActiveThread).not.toHaveBeenCalled();
    expect(h.commands.startTurn).not.toHaveBeenCalled();
    const disposedOwner = requireActiveOwner(ownerDuringReplay);
    expect(disposedOwner.queueCoordinator.getSnapshot().recoveryCount).toBe(0);
    expect(disposedOwner.queueCoordinator.submit("disposed owner")).toEqual({
      type: "rejected",
      reason: "disposed",
    });
    expect(h.actions.filter(liveThreadReplacementCommitted.match)).toHaveLength(1);
  });

  it("buffers event, delta, and closed notifications until the owner is ready and replays in order", async () => {
    const target = { type: "currentTask", threadId: currentThreadId } as const;
    const h = createHarness({ target });
    const pending = deferred<AttachResponse>();
    vi.mocked(h.commands.attachThreadProjection).mockReturnValueOnce(pending.promise);
    const eventSpy = vi.spyOn(ProjectionApplicationCoordinator.prototype, "handleProjectionEvent");
    const deltaSpy = vi.spyOn(ProjectionApplicationCoordinator.prototype, "handleProjectionDelta");
    const closedSpy = vi.spyOn(
      ProjectionApplicationCoordinator.prototype,
      "handleProjectionClosed",
    );
    const owner = { threadId: currentThreadId, subscriptionId: attachBaseline.subscriptionId };
    const event = eventWithEnvelope(eventTurnStarted, owner);
    const delta = deltaWithEnvelope(eventAgentMessageDelta, owner);
    const closed = closedWithEnvelope(closedBackpressure, owner);

    const starting = h.coordinator.start();
    h.coordinator.handleProjectionEvent(event);
    h.coordinator.handleProjectionDelta(delta);
    h.coordinator.handleProjectionClosed(closed);
    expect(eventSpy).not.toHaveBeenCalled();
    expect(deltaSpy).not.toHaveBeenCalled();
    expect(closedSpy).not.toHaveBeenCalled();

    pending.resolve(attachWithThreadId(attachBaseline, currentThreadId));
    await expect(starting).resolves.toMatchObject({ type: "ready" });
    expect(eventSpy).toHaveBeenCalledWith(event);
    expect(deltaSpy).toHaveBeenCalledWith(delta);
    expect(closedSpy).toHaveBeenCalledWith(closed);
    const eventCallOrder = eventSpy.mock.invocationCallOrder[0];
    const deltaCallOrder = deltaSpy.mock.invocationCallOrder[0];
    const closedCallOrder = closedSpy.mock.invocationCallOrder[0];
    if (eventCallOrder == null || deltaCallOrder == null || closedCallOrder == null) {
      throw new Error("expected each buffered notification to be replayed once");
    }
    expect(eventCallOrder).toBeLessThan(deltaCallOrder);
    expect(deltaCallOrder).toBeLessThan(closedCallOrder);
  });

  it("rejects stale settlement after dispose and cleans the attached candidate", async () => {
    const target = { type: "currentTask", threadId: currentThreadId } as const;
    const h = createHarness({ target });
    const pending = deferred<AttachResponse>();
    vi.mocked(h.commands.attachThreadProjection).mockReturnValueOnce(pending.promise);

    const starting = h.coordinator.start();
    h.coordinator.dispose();
    pending.resolve(attachWithThreadId(attachBaseline, currentThreadId));

    const outcome = await starting;
    expect(outcome).toMatchObject({ type: "failed", target, phase: "application" });
    expect((outcome as { error: Error }).error.message).toBe(
      "Route connection startup was disposed",
    );
    expect(h.commands.detachThreadProjection).toHaveBeenCalledWith({
      threadId: currentThreadId,
    });
    expect(h.commitActiveThread).not.toHaveBeenCalled();
  });
});
