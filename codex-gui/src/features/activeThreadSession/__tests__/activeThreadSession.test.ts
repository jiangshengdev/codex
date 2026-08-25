import { describe, expect, it, vi } from "vitest";
import { makeStore, type AppDispatch } from "@/app/store";
import { createDeferred, createGuiHostCommands } from "@/__tests__/appBrowserTestSupport";
import { composerCapture } from "@/features/composerInputQueue/__tests__/composerInputQueueTestFixtures";
import type { GuiHostCommands } from "@/features/guiHost/guiHostClient";
import {
  attachBaseline,
  attachReplacement,
  closedBackpressure,
  eventSubscriptionReplacement,
} from "@/features/projection/__tests__/projectionFixtures";
import {
  attachWithThreadId,
  eventForThreadOwner,
} from "@/features/projection/__tests__/projectionTestBuilders";
import type { UnknownAction } from "@reduxjs/toolkit";
import {
  createActiveThreadSession,
  type ActiveThreadSession,
} from "../activeThreadSession";

const replacementThreadId = "00000000-0000-0000-0000-000000000002";
const replacementAttach = attachWithThreadId(attachReplacement, replacementThreadId);
const replacementEvent = eventForThreadOwner(eventSubscriptionReplacement, {
  threadId: replacementThreadId,
  subscriptionId: replacementAttach.subscriptionId,
});

const createAuthorizationSession = (activeThreadId: string | null = attachBaseline.snapshot.thread.id) => {
  let currentThreadId = activeThreadId;
  return {
    getSnapshot: () => ({ token: "test-token", activeThreadId: currentThreadId }),
    commitActiveThread: vi.fn((threadId: string) => {
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
  const session = createActiveThreadSession({
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
  return { authorizationSession, commands, frames, session, store };
};

const activateInitial = async (harness: ReturnType<typeof createHarness>) => {
  const outcome = await harness.session.activateRecoveryThread();
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
    const listener = vi.fn();
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
    expect(h.store.getState().threadRuntime.sessionRevision).toBe(
      h.session.getSnapshot().revision,
    );
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("keeps the old live session operable during remote preparation and rejects a changed CAS", async () => {
    const h = createHarness();
    await activateInitial(h);
    const resume = createDeferred<Awaited<ReturnType<GuiHostCommands["resumeThread"]>>>();
    vi.mocked(h.commands.resumeThread).mockReturnValueOnce(resume.promise);
    queueReplacementActivation(h.commands);

    const activation = h.session.activate(replacementThreadId);
    const oldLive = h.session.getLiveSession();
    if (oldLive == null) throw new Error("expected the initial live session");
    const oldRevision = oldLive.getSnapshot().revision;
    expect(oldLive.submit(oldRevision, composerCapture("still usable"))).toEqual({
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
    expect(h.session.getLiveSession()).toBe(oldLive);
    expect(h.session.getSnapshot()).toMatchObject({
      phase: "active",
      threadId: attachBaseline.snapshot.thread.id,
    });
  });

  it("reconciles candidate notifications before one replacement publication", async () => {
    const h = createHarness();
    await activateInitial(h);
    const attach = createDeferred<Awaited<ReturnType<GuiHostCommands["attachThreadProjection"]>>>();
    vi.mocked(h.commands.attachThreadProjection).mockReturnValueOnce(attach.promise);
    const listener = vi.fn();
    h.session.subscribe(listener);
    const oldLive = h.session.getLiveSession();
    if (oldLive == null) throw new Error("expected the initial live session");
    const oldSnapshots: ReturnType<typeof oldLive.getSnapshot>[] = [];
    oldLive.subscribe(() => {
      oldSnapshots.push(oldLive.getSnapshot());
    });

    const activation = h.session.activate(replacementThreadId);
    await Promise.resolve();
    h.session.handleProjectionEvent(replacementEvent);
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
    expect(oldSnapshots).toHaveLength(1);
    expect(oldSnapshots[0]?.phase).toBe("disposed");
    expect(h.commands.detachThreadProjection).toHaveBeenCalledExactlyOnceWith({
      threadId: attachBaseline.snapshot.thread.id,
    });
  });

  it("aborts a failed handoff without changing the old snapshot identity or revision", async () => {
    let rejectDispatch = false;
    const h = createHarness(() => rejectDispatch);
    await activateInitial(h);
    const oldLive = h.session.getLiveSession();
    if (oldLive == null) throw new Error("expected the initial live session");
    const oldSnapshot = oldLive.getSnapshot();
    const oldListener = vi.fn();
    oldLive.subscribe(oldListener);
    const sessionListener = vi.fn();
    h.session.subscribe(sessionListener);
    queueReplacementActivation(h.commands);
    rejectDispatch = true;

    await expect(h.session.activate(replacementThreadId)).resolves.toMatchObject({
      type: "unavailable",
      failure: { type: "operationFailed", phase: "activate" },
    });

    expect(h.session.getLiveSession()).toBe(oldLive);
    expect(oldLive.getSnapshot()).toBe(oldSnapshot);
    expect(oldLive.getSnapshot().revision).toBe(oldSnapshot.revision);
    expect(h.session.getSnapshot()).toBe(oldSnapshot);
    expect(oldListener).not.toHaveBeenCalled();
    expect(sessionListener).not.toHaveBeenCalled();
  });

  it("classifies a non-committed handoff after Redux dispatch as connection loss", async () => {
    let terminateAfterDispatch = false;
    let session: ActiveThreadSession | null = null;
    const h = createHarness(
      () => false,
      () => {
        if (terminateAfterDispatch) session?.connectionUnavailable();
      },
    );
    session = h.session;
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
    h.session.handleProjectionClosed({
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
    h.session.connectionUnavailable();
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
    const live = h.session.getLiveSession();
    if (live == null) throw new Error("expected the initial live session");
    expect(live.submit(live.getSnapshot().revision, composerCapture("pending delivery"))).toEqual({
      type: "accepted",
    });
    const revision = live.getSnapshot().revision;
    queueReplacementActivation(h.commands);

    await expect(h.session.activate(replacementThreadId)).resolves.toMatchObject({
      type: "unavailable",
      failure: {
        type: "currentThreadUnresolved",
        activeThreadId: attachBaseline.snapshot.thread.id,
        blockers: [{ type: "pendingStart" }],
      },
    });
    expect(h.session.getLiveSession()).toBe(live);
    expect(h.session.getSnapshot()).toMatchObject({
      revision,
      threadId: attachBaseline.snapshot.thread.id,
    });
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
    h.session.connectionUnavailable();
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

    await expect(h.session.activateRecoveryThread()).resolves.toEqual({
      type: "unavailable",
      failure: {
        type: "operationFailed",
        phase: "attach",
        error: attachError,
        cleanupError: null,
      },
    });
    expect(h.session.getSnapshot()).toEqual({ phase: "empty", revision: 0 });

    h.session.connectionUnavailable();
    await expect(h.session.activate(attachBaseline.snapshot.thread.id)).resolves.toMatchObject({
      type: "unavailable",
      failure: { type: "connectionLost", progress: "beforeCommit" },
    });
  });
});
