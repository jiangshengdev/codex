import { describe, expect, it, vi } from "vitest";
import { makeStore, type AppDispatch } from "@/app/store";
import { createDeferred, createGuiHostCommands } from "@/__tests__/appBrowserTestSupport";
import { composerCapture } from "@/features/composerInputQueue/__tests__/composerInputQueueTestFixtures";
import type { BrowserAuthorizationSession } from "@/features/browserLaunch/browserAuthorizationSession";
import type { GuiHostCommands } from "@/features/guiHost/guiHostClient";
import {
  attachBaseline,
  attachReplacement,
  closedBackpressure,
  eventSubscriptionReplacement,
  eventTurnStarted,
} from "@/features/projection/__tests__/projectionFixtures";
import {
  attachWithThreadId,
  eventForThreadOwner,
  eventWithEnvelope,
  inProgressTurn,
  turnStarted,
} from "@/features/projection/__tests__/projectionTestBuilders";
import type { UnknownAction } from "@reduxjs/toolkit";
import {
  createActiveThreadSession,
  type ActiveThreadSessionController,
} from "../activeThreadSession";

const replacementThreadId = "00000000-0000-0000-0000-000000000002";
const replacementAttach = attachWithThreadId(attachReplacement, replacementThreadId);
const replacementEvent = eventForThreadOwner(eventSubscriptionReplacement, {
  threadId: replacementThreadId,
  subscriptionId: replacementAttach.subscriptionId,
});
const postPublicationEvent = eventForThreadOwner(
  eventWithEnvelope(
    turnStarted(
      eventTurnStarted,
      "commit-post-publication",
      inProgressTurn("post-publication-turn"),
    ),
    { parentCommitId: replacementEvent.commitId },
  ),
  {
    threadId: replacementThreadId,
    subscriptionId: replacementAttach.subscriptionId,
  },
);

const createAuthorizationSession = (
  activeThreadId: string | null = attachBaseline.snapshot.thread.id,
) => {
  let currentThreadId = activeThreadId;
  return {
    getSnapshot: () => ({ token: "test-token", activeThreadId: currentThreadId }),
    commitActiveThread: vi.fn<BrowserAuthorizationSession["commitActiveThread"]>((threadId) => {
      currentThreadId = threadId;
    }),
  };
};

const createHarness = (
  shouldRejectDispatch: () => boolean = () => false,
  afterDispatch: () => void = () => undefined,
) => {
  const commands = createGuiHostCommands();
  vi.mocked(commands.listSkills).mockImplementation(() => new Promise(() => undefined));
  const authorizationSession = createAuthorizationSession();
  const store = makeStore();
  let nextFrameId = 0;
  const frames = new Map<number, () => void>();
  const controller = createActiveThreadSession({
    authorizationSession,
    commands,
    dispatch: ((action: UnknownAction) => {
      if (shouldRejectDispatch()) throw new Error("dispatch rejected");
      const result = store.dispatch(action);
      afterDispatch();
      return result;
    }) as AppDispatch,
    scheduler: {
      requestFrame: (callback) => {
        const frameId = ++nextFrameId;
        frames.set(frameId, callback);
        return frameId;
      },
      cancelFrame: (frameId) => {
        frames.delete(frameId);
      },
    },
  });
  return { authorizationSession, commands, controller, frames, session: controller.session, store };
};

const activateInitial = async (harness: ReturnType<typeof createHarness>) => {
  const outcome = await harness.controller.activateRecoveryThread();
  expect(outcome).toEqual({
    type: "ready",
    threadId: attachBaseline.snapshot.thread.id,
    warnings: [],
  });
};

const queueReplacementActivation = (commands: GuiHostCommands) => {
  vi.mocked(commands.attachThreadProjection).mockResolvedValueOnce(replacementAttach);
};

describe("ActiveThreadSession", () => {
  it("uses the recovery locator for first attach and publishes one complete session", async () => {
    const h = createHarness();
    const listener = vi.fn<() => void>();
    h.session.subscribe(listener);

    await activateInitial(h);

    expect(h.commands.resumeThread).not.toHaveBeenCalled();
    expect(h.commands.attachThreadProjection).toHaveBeenCalledExactlyOnceWith({
      threadId: attachBaseline.snapshot.thread.id,
    });
    expect(h.session.getSnapshot()).toMatchObject({
      phase: "active",
      threadId: attachBaseline.snapshot.thread.id,
      subscriptionId: attachBaseline.subscriptionId,
    });
    expect(h.store.getState().threadRuntime.sessionRevision).toBe(h.session.getSnapshot().revision);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("exposes stable revision-gated composer and skills roles through the public snapshot", async () => {
    const h = createHarness();
    await activateInitial(h);
    const initial = h.session.getSnapshot();
    if (initial.phase !== "active") throw new Error("expected the initial active session");
    expect(initial.composerRole.submitSteer(initial.revision, composerCapture(""))).toEqual({
      type: "rejected",
      reason: "invalidInput",
    });
    expect(initial.composerRole.promoteOrdinaryFrontToSteer(initial.revision)).toBe(false);
    expect(initial.composerRole.recover(initial.revision)).toBe(false);

    h.controller.handleProjectionEvent(eventTurnStarted);
    const withTurn = h.session.getSnapshot();
    if (withTurn.phase !== "active") throw new Error("expected an active turn session");
    expect(withTurn.composerRole).toBe(initial.composerRole);
    expect(withTurn.skillsRole).toBe(initial.skillsRole);
    expect(withTurn.composerRole.interruptActiveTurn(withTurn.revision)).toBe(true);

    h.controller.handleProjectionClosed(closedBackpressure);
    const unavailable = h.session.getSnapshot();
    if (unavailable.phase !== "projectionUnavailable") {
      throw new Error("expected projectionUnavailable");
    }
    expect(initial.composerRole.submit(initial.revision, composerCapture("stale"))).toEqual({
      type: "unavailable",
      scope: "activeThreadSession",
      reason: "staleRevision",
      revision: unavailable.revision,
    });
    for (const result of [
      unavailable.skillsRole.retrySkills(unavailable.revision),
      unavailable.skillsRole.refreshSkills(unavailable.revision),
      unavailable.skillsRole.invalidateSkills(unavailable.revision),
    ]) {
      expect(result).toEqual({
        type: "unavailable",
        scope: "activeThreadSession",
        reason: "projectionUnavailable",
        revision: unavailable.revision,
      });
    }
  });

  it("keeps pending-input reads, mutations, and edit capabilities on the public role", async () => {
    const h = createHarness();
    await activateInitial(h);
    h.controller.handleProjectionEvent(eventTurnStarted);
    let snapshot = h.session.getSnapshot();
    if (snapshot.phase !== "active") throw new Error("expected an active turn session");
    expect(
      snapshot.composerRole.submit(
        snapshot.revision,
        composerCapture("pending detail ".repeat(100)),
      ),
    ).toEqual({ type: "accepted" });
    snapshot = h.session.getSnapshot();
    if (snapshot.phase !== "active") throw new Error("expected an active pending-input session");
    const page = snapshot.composerRole.readPendingInputPage({
      lane: "ordinary",
      revision: snapshot.composer.detailRevision,
      cursor: null,
      limit: 10,
    });
    if (page.type !== "page" || page.items[0] == null) {
      throw new Error("expected a pending ordinary input");
    }
    expect(
      snapshot.composerRole.readPendingInputDetail({
        key: page.items[0].key,
        revision: page.revision,
      }),
    ).toMatchObject({ type: "detail", key: page.items[0].key });
    expect(
      snapshot.composerRole.movePendingInput(snapshot.revision, {
        key: page.items[0].key,
        revision: page.revision,
        destination: "first",
      }),
    ).toMatchObject({ type: "noOp" });
    snapshot = h.session.getSnapshot();
    if (snapshot.phase !== "active") throw new Error("expected an active pending-input session");
    const begun = snapshot.composerRole.beginPendingInputEdit(
      snapshot.revision,
      { key: page.items[0].key, revision: snapshot.composer.detailRevision },
      () => ({ type: "restored" }),
    );
    if (begun.type !== "begun") throw new Error("expected a pending edit capability");
    h.controller.handleProjectionClosed(closedBackpressure);
    expect(begun.reservation.save(composerCapture("late edit"))).toMatchObject({
      type: "unavailable",
      scope: "activeThreadSession",
    });
  });

  it("keeps the old live session operable during remote preparation and rejects a changed CAS", async () => {
    const h = createHarness();
    await activateInitial(h);
    const resume = createDeferred<Awaited<ReturnType<GuiHostCommands["resumeThread"]>>>();
    vi.mocked(h.commands.resumeThread).mockReturnValueOnce(resume.promise);
    queueReplacementActivation(h.commands);

    const activation = h.session.activate(replacementThreadId);
    const oldSnapshot = h.session.getSnapshot();
    if (oldSnapshot.phase !== "active") throw new Error("expected the initial active session");
    const oldRevision = oldSnapshot.revision;
    expect(oldSnapshot.composerRole.submit(oldRevision, composerCapture("still usable"))).toEqual({
      type: "accepted",
    });
    resume.resolve(
      await createGuiHostCommands().resumeThread({
        threadId: replacementThreadId,
      }),
    );

    await expect(activation).resolves.toMatchObject({
      type: "unavailable",
      failure: { type: "currentThreadChanged", expectedRevision: oldRevision },
    });
    const retained = h.session.getSnapshot();
    expect(retained).toMatchObject({
      phase: "active",
      threadId: attachBaseline.snapshot.thread.id,
    });
    if (retained.phase !== "active") throw new Error("expected the retained active session");
    expect(retained.composerRole).toBe(oldSnapshot.composerRole);
  });

  it("reconciles candidate notifications before one replacement publication", async () => {
    const h = createHarness();
    await activateInitial(h);
    const attach = createDeferred<Awaited<ReturnType<GuiHostCommands["attachThreadProjection"]>>>();
    vi.mocked(h.commands.attachThreadProjection).mockReturnValueOnce(attach.promise);
    const listener = vi.fn<() => void>();
    h.session.subscribe(listener);

    const activation = h.session.activate(replacementThreadId);
    await Promise.resolve();
    h.controller.handleProjectionEvent(replacementEvent);
    attach.resolve(replacementAttach);

    await expect(activation).resolves.toEqual({
      type: "ready",
      threadId: replacementThreadId,
      warnings: [],
    });
    expect(h.session.getSnapshot()).toMatchObject({
      phase: "active",
      threadId: replacementThreadId,
      subscriptionId: replacementAttach.subscriptionId,
    });
    expect(h.store.getState().threadRuntime.current?.threadId).toBe(replacementThreadId);
    expect(listener).toHaveBeenCalledTimes(1);
    const published = h.session.getSnapshot();
    expect(h.store.getState().threadRuntime.sessionRevision).toBe(published.revision);

    h.controller.handleProjectionEvent(postPublicationEvent);
    const afterEvent = h.session.getSnapshot();
    expect(afterEvent.revision).toBeGreaterThan(published.revision);
    expect(h.store.getState().threadRuntime.sessionRevision).toBe(afterEvent.revision);
    if (afterEvent.phase !== "active") throw new Error("expected the replacement active session");
    expect(
      afterEvent.composerRole.submit(
        afterEvent.revision,
        composerCapture("post-publication child transition"),
      ),
    ).toEqual({ type: "accepted" });
    const afterChild = h.session.getSnapshot();
    expect(afterChild.revision).toBeGreaterThan(afterEvent.revision);
    expect(h.store.getState().threadRuntime.sessionRevision).toBe(afterChild.revision);
    expect(h.commands.detachThreadProjection).toHaveBeenCalledExactlyOnceWith({
      threadId: attachBaseline.snapshot.thread.id,
    });
  });

  it("aborts a failed handoff without changing the old snapshot identity or revision", async () => {
    let rejectDispatch = false;
    const h = createHarness(() => rejectDispatch);
    await activateInitial(h);
    const oldSnapshot = h.session.getSnapshot();
    if (oldSnapshot.phase !== "active") throw new Error("expected the initial active session");
    const sessionListener = vi.fn<() => void>();
    h.session.subscribe(sessionListener);
    queueReplacementActivation(h.commands);
    rejectDispatch = true;

    await expect(h.session.activate(replacementThreadId)).resolves.toMatchObject({
      type: "unavailable",
      failure: { type: "operationFailed", phase: "activate" },
    });

    expect(h.session.getSnapshot()).toBe(oldSnapshot);
    expect(h.session.getSnapshot().revision).toBe(oldSnapshot.revision);
    expect(sessionListener).not.toHaveBeenCalled();
  });

  it("classifies a non-committed handoff after Redux dispatch as connection loss", async () => {
    let terminateAfterDispatch = false;
    let controller: ActiveThreadSessionController | null = null;
    const h = createHarness(
      () => false,
      () => {
        if (terminateAfterDispatch) controller?.connectionUnavailable();
      },
    );
    controller = h.controller;
    await activateInitial(h);
    queueReplacementActivation(h.commands);
    terminateAfterDispatch = true;

    await expect(h.session.activate(replacementThreadId)).resolves.toMatchObject({
      type: "unavailable",
      failure: {
        type: "connectionLost",
        progress: "beforeCommit",
        threadId: replacementThreadId,
      },
    });
    expect(h.session.getSnapshot().phase).toBe("disposed");
  });

  it("keeps the old session when candidate replay becomes unavailable", async () => {
    const h = createHarness();
    await activateInitial(h);
    const attach = createDeferred<Awaited<ReturnType<GuiHostCommands["attachThreadProjection"]>>>();
    vi.mocked(h.commands.attachThreadProjection).mockReturnValueOnce(attach.promise);
    const activation = h.session.activate(replacementThreadId);
    await Promise.resolve();
    h.controller.handleProjectionClosed({
      ...closedBackpressure,
      threadId: replacementThreadId,
      subscriptionId: replacementAttach.subscriptionId,
    });
    attach.resolve(replacementAttach);

    await expect(activation).resolves.toMatchObject({
      type: "unavailable",
      failure: { type: "operationFailed", phase: "prepare" },
    });
    expect(h.session.getSnapshot()).toMatchObject({
      phase: "active",
      threadId: attachBaseline.snapshot.thread.id,
    });
    expect(h.commands.detachThreadProjection).toHaveBeenCalledExactlyOnceWith({
      threadId: replacementThreadId,
    });
  });

  it("waits for old detach and returns an ordinary cleanup warning without rollback", async () => {
    const h = createHarness();
    await activateInitial(h);
    queueReplacementActivation(h.commands);
    const detachError = new Error("detach failed");
    vi.mocked(h.commands.detachThreadProjection).mockRejectedValueOnce(detachError);

    await expect(h.session.activate(replacementThreadId)).resolves.toEqual({
      type: "ready",
      threadId: replacementThreadId,
      warnings: [{ type: "previousOwnerCleanupFailed", error: detachError }],
    });
    expect(h.session.getSnapshot()).toMatchObject({
      phase: "active",
      threadId: replacementThreadId,
    });
  });

  it("classifies connection terminal during cleanup as post-commit connection loss", async () => {
    const h = createHarness();
    await activateInitial(h);
    queueReplacementActivation(h.commands);
    const detach = createDeferred<Awaited<ReturnType<GuiHostCommands["detachThreadProjection"]>>>();
    vi.mocked(h.commands.detachThreadProjection).mockReturnValueOnce(detach.promise);

    const activation = h.session.activate(replacementThreadId);
    let settled = false;
    void activation.then(() => {
      settled = true;
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(h.session.getSnapshot()).toMatchObject({
      phase: "active",
      threadId: replacementThreadId,
    });
    expect(settled).toBe(false);
    h.controller.connectionUnavailable();
    detach.resolve({ status: "detached" });

    await expect(activation).resolves.toMatchObject({
      type: "unavailable",
      failure: {
        type: "connectionLost",
        progress: "afterCommit",
        threadId: replacementThreadId,
      },
    });
    expect(h.session.getSnapshot().phase).toBe("disposed");
  });

  it("returns release blockers without changing the current session", async () => {
    const h = createHarness();
    const pendingStart = createDeferred<Awaited<ReturnType<GuiHostCommands["startTurn"]>>>();
    vi.mocked(h.commands.startTurn).mockReturnValueOnce(pendingStart.promise);
    await activateInitial(h);
    const active = h.session.getSnapshot();
    if (active.phase !== "active") throw new Error("expected the initial active session");
    expect(
      active.composerRole.submit(active.revision, composerCapture("pending delivery")),
    ).toEqual({
      type: "accepted",
    });
    const revision = h.session.getSnapshot().revision;
    queueReplacementActivation(h.commands);

    await expect(h.session.activate(replacementThreadId)).resolves.toMatchObject({
      type: "unavailable",
      failure: {
        type: "currentThreadUnresolved",
        activeThreadId: attachBaseline.snapshot.thread.id,
        blockers: [{ type: "pendingStart" }],
      },
    });
    const retained = h.session.getSnapshot();
    expect(retained).toMatchObject({
      revision,
      threadId: attachBaseline.snapshot.thread.id,
    });
    if (retained.phase !== "active") throw new Error("expected the retained active session");
    expect(retained.composerRole).toBe(active.composerRole);
  });

  it("rejects a concurrent activation and preserves a resume identity failure", async () => {
    const h = createHarness();
    await activateInitial(h);
    const resume = createDeferred<Awaited<ReturnType<GuiHostCommands["resumeThread"]>>>();
    vi.mocked(h.commands.resumeThread).mockReturnValueOnce(resume.promise);
    const first = h.session.activate(replacementThreadId);

    await expect(h.session.activate("00000000-0000-0000-0000-000000000003")).resolves.toEqual({
      type: "unavailable",
      failure: { type: "switchInProgress" },
    });
    resume.resolve(
      await createGuiHostCommands().resumeThread({ threadId: attachBaseline.snapshot.thread.id }),
    );
    await expect(first).resolves.toMatchObject({
      type: "unavailable",
      failure: { type: "operationFailed", phase: "resume" },
    });
    expect(h.commands.attachThreadProjection).toHaveBeenCalledTimes(1);
  });

  it("reports authorization persistence as a post-publication warning", async () => {
    const h = createHarness();
    await activateInitial(h);
    queueReplacementActivation(h.commands);
    const persistenceError = new Error("storage unavailable");
    h.authorizationSession.commitActiveThread.mockImplementationOnce(() => {
      throw persistenceError;
    });

    await expect(h.session.activate(replacementThreadId)).resolves.toEqual({
      type: "ready",
      threadId: replacementThreadId,
      warnings: [{ type: "authorizationPersistenceFailed", error: persistenceError }],
    });
    expect(h.session.getSnapshot()).toMatchObject({
      phase: "active",
      threadId: replacementThreadId,
    });
  });

  it("classifies connection terminal during candidate attach as pre-commit loss", async () => {
    const h = createHarness();
    await activateInitial(h);
    const attach = createDeferred<Awaited<ReturnType<GuiHostCommands["attachThreadProjection"]>>>();
    vi.mocked(h.commands.attachThreadProjection).mockReturnValueOnce(attach.promise);

    const activation = h.session.activate(replacementThreadId);
    await Promise.resolve();
    h.controller.connectionUnavailable();
    attach.resolve(replacementAttach);

    await expect(activation).resolves.toMatchObject({
      type: "unavailable",
      failure: {
        type: "connectionLost",
        progress: "beforeCommit",
        threadId: replacementThreadId,
      },
    });
    expect(h.session.getSnapshot().phase).toBe("disposed");
  });

  it("keeps empty on pre-publication attach failure and permanently rejects after terminal", async () => {
    const h = createHarness();
    const attachError = new Error("attach failed");
    vi.mocked(h.commands.attachThreadProjection).mockRejectedValueOnce(attachError);

    await expect(h.controller.activateRecoveryThread()).resolves.toEqual({
      type: "unavailable",
      failure: {
        type: "operationFailed",
        phase: "attach",
        error: attachError,
        cleanupError: null,
      },
    });
    expect(h.session.getSnapshot()).toEqual({ phase: "empty", revision: 0 });

    h.controller.connectionUnavailable();
    await expect(h.session.activate(attachBaseline.snapshot.thread.id)).resolves.toMatchObject({
      type: "unavailable",
      failure: { type: "connectionLost", progress: "beforeCommit" },
    });
  });
});
