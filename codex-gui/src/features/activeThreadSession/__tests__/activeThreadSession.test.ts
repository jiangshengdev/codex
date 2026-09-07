import { describe, expect, it, vi } from "vitest";
import { createPersistenceTestContext } from "@/features/composerInputQueue/__tests__/composerInputQueueCoordinatorTestFixtures";
import { makeStore, type AppDispatch } from "@/app/store";
import { createDeferred, createGuiHostCommands } from "@/__tests__/appBrowserTestSupport";
import { composerCapture } from "@/features/composerInputQueue/__tests__/composerInputQueueTestFixtures";
import type { BrowserAuthorizationSession } from "@/features/browserLaunch/browserAuthorizationSession";
import type { GuiHostCommands } from "@/features/guiHost/guiHostClient";
import { SessionCollectionPersistenceError } from "@/features/sessionCollection/sessionCollectionPersistence";
import {
  attachBaseline,
  attachReplacement,
  closedBackpressure,
  eventSubscriptionReplacement,
  eventTurnStarted,
  eventItemStarted,
  eventAgentMessageDelta,
} from "@/features/projection/__tests__/projectionFixtures";
import {
  attachWithThreadId,
  attachWithSnapshotThread,
  attachWithTurns,
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
  let historyCwd: string | undefined;
  return {
    getSnapshot: () => ({ token: "test-token", activeThreadId: currentThreadId, historyCwd }),
    commitActiveThread: vi.fn<BrowserAuthorizationSession["commitActiveThread"]>(
      (threadId, cwd) => {
        currentThreadId = threadId;
        historyCwd = cwd;
      },
    ),
    clearActiveThread: vi.fn<BrowserAuthorizationSession["clearActiveThread"]>(() => {
      currentThreadId = null;
    }),
  };
};

const createHarness = (
  shouldRejectDispatch: () => boolean = () => false,
  afterDispatch: () => void = () => undefined,
  persistence = createPersistenceTestContext(),
  commands = createGuiHostCommands(),
) => {
  vi.mocked(commands.listSkills).mockImplementation(() => new Promise(() => undefined));
  const authorizationSession = createAuthorizationSession();
  const store = makeStore();
  let nextFrameId = 0;
  const frames = new Map<number, () => void>();
  const controller = createActiveThreadSession({
    persistence,
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

it("retains the last successfully selected directory across removal and failed activation", async () => {
  const h = createHarness();
  await activateInitial(h);
  const firstCwd = attachBaseline.snapshot.thread.cwd;
  expect(h.session.getHistoryCwd()).toBe(firstCwd);
  vi.mocked(h.commands.attachThreadProjection).mockRejectedValueOnce(new Error("attach failed"));
  await expect(h.session.activate(replacementThreadId)).resolves.toMatchObject({
    type: "unavailable",
  });
  expect(h.session.getHistoryCwd()).toBe(firstCwd);

  vi.mocked(h.commands.attachThreadProjection).mockResolvedValueOnce(
    attachWithSnapshotThread(replacementAttach, {
      ...replacementAttach.snapshot.thread,
      cwd: "/workspace/second",
    }),
  );
  await expect(h.session.retry(replacementThreadId)).resolves.toMatchObject({ type: "ready" });
  expect(h.session.getHistoryCwd()).toBe("/workspace/second");
  await expect(h.session.remove(replacementThreadId)).resolves.toMatchObject({ type: "removed" });
  expect(h.session.getCollectionSnapshot().viewedThreadId).toBeNull();
  expect(h.session.getCollectionSnapshot().members).toHaveLength(1);
  expect(h.session.getHistoryCwd()).toBe("/workspace/second");
  await h.session.view(attachBaseline.snapshot.thread.id);
  expect(h.session.getHistoryCwd()).toBe(firstCwd);
});

const queueReplacementActivation = (commands: GuiHostCommands) => {
  vi.mocked(commands.attachThreadProjection).mockResolvedValueOnce(replacementAttach);
};

describe("ActiveThreadSession", () => {
  it("opens a live empty recovery thread whose rollout has not been persisted", async () => {
    const h = createHarness(
      undefined,
      undefined,
      undefined,
      createGuiHostCommands({
        loadedThreadIds: [attachBaseline.snapshot.thread.id],
        storedThreadIds: [],
      }),
    );
    vi.mocked(h.commands.attachThreadProjection).mockResolvedValue(
      attachWithTurns(attachBaseline, []),
    );

    await activateInitial(h);

    expect(h.session.getSnapshot()).toMatchObject({
      phase: "active",
      threadId: attachBaseline.snapshot.thread.id,
    });
    expect(h.commands.resumeThread).not.toHaveBeenCalled();
  });

  it("opens an already loaded persisted thread without resuming it", async () => {
    const h = createHarness(
      undefined,
      undefined,
      undefined,
      createGuiHostCommands({
        loadedThreadIds: [attachBaseline.snapshot.thread.id],
        storedThreadIds: [attachBaseline.snapshot.thread.id],
      }),
    );
    await activateInitial(h);
    expect(h.session.getSnapshot()).toMatchObject({ phase: "active" });
    expect(h.commands.resumeThread).not.toHaveBeenCalled();
    expect(h.commands.attachThreadProjection).toHaveBeenCalledExactlyOnceWith({
      threadId: attachBaseline.snapshot.thread.id,
    });
  });

  it("finds a live thread on a later loaded page without requiring a rollout", async () => {
    const h = createHarness();
    vi.mocked(h.commands.resumeThread).mockRejectedValue(new Error("no rollout found"));
    vi.mocked(h.commands.listLoadedThreads)
      .mockResolvedValueOnce({ data: [replacementThreadId], nextCursor: "page-two" })
      .mockResolvedValueOnce({ data: [attachBaseline.snapshot.thread.id], nextCursor: "unused" });

    await activateInitial(h);

    expect(h.commands.listLoadedThreads).toHaveBeenNthCalledWith(1, {});
    expect(h.commands.listLoadedThreads).toHaveBeenNthCalledWith(2, { cursor: "page-two" });
    expect(h.commands.listLoadedThreads).toHaveBeenCalledTimes(2);
    expect(h.commands.resumeThread).not.toHaveBeenCalled();
  });

  it("resumes a persisted unloaded thread only after exhausting loaded pages", async () => {
    const h = createHarness();
    const lastPage = createDeferred<Awaited<ReturnType<GuiHostCommands["listLoadedThreads"]>>>();
    vi.mocked(h.commands.listLoadedThreads)
      .mockResolvedValueOnce({ data: [replacementThreadId], nextCursor: "page-two" })
      .mockReturnValueOnce(lastPage.promise);
    const activation = h.controller.activateRecoveryThread();
    await vi.waitFor(() => {
      expect(h.commands.listLoadedThreads).toHaveBeenCalledTimes(2);
    });
    expect(h.commands.resumeThread).not.toHaveBeenCalled();
    expect(h.commands.attachThreadProjection).not.toHaveBeenCalled();
    lastPage.resolve({ data: [], nextCursor: null });
    await expect(activation).resolves.toMatchObject({ type: "ready" });
    expect(h.commands.resumeThread).toHaveBeenCalledExactlyOnceWith({
      threadId: attachBaseline.snapshot.thread.id,
    });
  });

  it("preserves loaded query failures and queries again on retry", async () => {
    const h = createHarness();
    const error = new Error("loaded query failed");
    vi.mocked(h.commands.listLoadedThreads).mockRejectedValueOnce(error);
    await expect(h.controller.activateRecoveryThread()).resolves.toMatchObject({
      type: "unavailable",
      failure: { type: "operationFailed", phase: "loaded", error },
    });
    expect(h.commands.resumeThread).not.toHaveBeenCalled();
    expect(h.commands.attachThreadProjection).not.toHaveBeenCalled();
    vi.mocked(h.commands.listLoadedThreads).mockResolvedValueOnce({
      data: [attachBaseline.snapshot.thread.id],
      nextCursor: null,
    });
    await expect(h.session.retry(attachBaseline.snapshot.thread.id)).resolves.toMatchObject({
      type: "ready",
    });
    expect(h.commands.listLoadedThreads).toHaveBeenCalledTimes(2);
    expect(h.commands.resumeThread).not.toHaveBeenCalled();
  });

  it("does not infer an unloaded thread when a later loaded page fails", async () => {
    const h = createHarness();
    const error = new Error("second page unavailable");
    vi.mocked(h.commands.listLoadedThreads)
      .mockResolvedValueOnce({ data: [], nextCursor: "page-two" })
      .mockRejectedValueOnce(error);
    await expect(h.controller.activateRecoveryThread()).resolves.toMatchObject({
      type: "unavailable",
      failure: { phase: "loaded", error },
    });
    expect(h.commands.resumeThread).not.toHaveBeenCalled();
    expect(h.commands.attachThreadProjection).not.toHaveBeenCalled();
  });

  it("retains the missing rollout error for a thread that is neither loaded nor stored", async () => {
    const h = createHarness(
      undefined,
      undefined,
      undefined,
      createGuiHostCommands({ loadedThreadIds: [], storedThreadIds: [] }),
    );
    await expect(h.controller.activateRecoveryThread()).resolves.toMatchObject({
      type: "unavailable",
      failure: {
        phase: "resume",
        error: new Error(`no rollout found for thread id ${attachBaseline.snapshot.thread.id}`),
      },
    });
    expect(h.commands.attachThreadProjection).not.toHaveBeenCalled();
  });

  it("does not fall back to resume after attach fails and rechecks loading on retry", async () => {
    const h = createHarness();
    const error = new Error("thread unloaded before attach");
    vi.mocked(h.commands.listLoadedThreads).mockResolvedValueOnce({
      data: [attachBaseline.snapshot.thread.id],
      nextCursor: null,
    });
    vi.mocked(h.commands.attachThreadProjection).mockRejectedValueOnce(error);
    await expect(h.controller.activateRecoveryThread()).resolves.toMatchObject({
      type: "unavailable",
      failure: { phase: "attach", error },
    });
    expect(h.commands.resumeThread).not.toHaveBeenCalled();
    await expect(h.session.retry(attachBaseline.snapshot.thread.id)).resolves.toMatchObject({
      type: "ready",
    });
    expect(h.commands.listLoadedThreads).toHaveBeenCalledTimes(2);
    expect(h.commands.resumeThread).toHaveBeenCalledTimes(1);
  });

  it("stops initialization when the connection closes during loaded pagination", async () => {
    const h = createHarness();
    const page = createDeferred<Awaited<ReturnType<GuiHostCommands["listLoadedThreads"]>>>();
    vi.mocked(h.commands.listLoadedThreads).mockReturnValueOnce(page.promise);
    const activation = h.controller.activateRecoveryThread();
    h.controller.dispose();
    page.resolve({ data: [], nextCursor: "next-page" });
    await expect(activation).resolves.toMatchObject({ type: "unavailable" });
    expect(h.commands.listLoadedThreads).toHaveBeenCalledTimes(1);
    expect(h.commands.resumeThread).not.toHaveBeenCalled();
    expect(h.commands.attachThreadProjection).not.toHaveBeenCalled();
  });

  it("flushes a background member independently without changing the viewed snapshot", async () => {
    const h = createHarness();
    await activateInitial(h);
    h.controller.handleProjectionEvent(eventTurnStarted);
    h.controller.handleProjectionEvent(eventItemStarted);
    queueReplacementActivation(h.commands);
    await h.session.activate(replacementThreadId);
    const viewed = h.session.getSnapshot();
    const background = h.session.getCollectionSnapshot().members[0]?.snapshot;
    if (background == null) throw new Error("expected background snapshot");
    h.controller.handleProjectionDelta(eventAgentMessageDelta);
    expect(h.frames.size).toBe(1);
    for (const flush of h.frames.values()) flush();
    expect(h.session.getSnapshot()).toBe(viewed);
    expect(h.session.getCollectionSnapshot().members[0]?.snapshot?.revision).toBeGreaterThan(
      background.revision,
    );
    expect(h.store.getState().threadRuntime.byThreadId[replacementThreadId]?.sessionRevision).toBe(
      viewed.revision,
    );
  });

  it("drains a notification received reentrantly while constructing a live owner", async () => {
    let controller: ActiveThreadSessionController | null = null;
    let sent = false;
    const h = createHarness(undefined, () => {
      if (sent || controller == null) return;
      sent = true;
      controller.handleProjectionEvent(eventTurnStarted);
    });
    controller = h.controller;
    await activateInitial(h);
    if (eventTurnStarted.event.type !== "turnStarted") throw new Error("expected turn fixture");
    expect(h.session.getSnapshot()).toMatchObject({
      activeTurnId: eventTurnStarted.event.notification.turn.id,
    });
  });

  it("does not resume or attach when membership cannot be saved", async () => {
    const persistence = createPersistenceTestContext();
    const storage = persistence.storage;
    if (storage == null) throw new Error("expected persistence storage");
    vi.spyOn(storage, "setItem").mockImplementation(() => {
      throw new Error("storage full");
    });
    const h = createHarness(undefined, undefined, persistence);
    await expect(h.controller.activateRecoveryThread()).resolves.toEqual({
      type: "unavailable",
      failure: {
        type: "collectionFailed",
        operation: "membershipAdd",
        threadId: attachBaseline.snapshot.thread.id,
      },
    });
    expect(h.commands.resumeThread).not.toHaveBeenCalled();
    expect(h.commands.attachThreadProjection).not.toHaveBeenCalled();
    expect(h.session.getCollectionSnapshot().members).toEqual([]);
  });

  it("keeps failed initialization visible and retries the same member", async () => {
    const h = createHarness();
    vi.mocked(h.commands.attachThreadProjection).mockRejectedValueOnce(new Error("attach failed"));
    await h.controller.activateRecoveryThread();
    expect(h.session.getSnapshot()).toMatchObject({ phase: "failed" });
    await expect(h.session.remove(attachBaseline.snapshot.thread.id)).resolves.toMatchObject({
      type: "blocked",
      blockers: ["statusUnknown"],
    });
    await expect(h.session.retry(attachBaseline.snapshot.thread.id)).resolves.toMatchObject({
      type: "ready",
    });
    expect(h.session.getCollectionSnapshot().members).toHaveLength(1);
    expect(h.authorizationSession.commitActiveThread).toHaveBeenCalledExactlyOnceWith(
      attachBaseline.snapshot.thread.id,
      attachBaseline.snapshot.thread.cwd,
    );
  });

  it("keeps unrelated collection save errors until their own operation succeeds", async () => {
    const persistence = createPersistenceTestContext();
    const h = createHarness(undefined, undefined, persistence);
    await activateInitial(h);
    const threadId = attachBaseline.snapshot.thread.id;
    const selectionError = new Error("same failure text");
    h.authorizationSession.commitActiveThread.mockImplementationOnce(() => {
      throw selectionError;
    });
    await h.session.activate(threadId);
    const storage = persistence.storage;
    if (storage == null) throw new Error("expected storage");
    const membershipError = new Error("same failure text");
    const save = storage.setItem.bind(storage);
    const write = vi.spyOn(storage, "setItem").mockImplementation((key, value) => {
      if (key === "codex-gui.sessionCollection") throw membershipError;
      save(key, value);
    });
    await h.session.activate(replacementThreadId);
    const persistedError = h.session.getCollectionSnapshot().errors[1]?.error;
    expect(persistedError).toBeInstanceOf(SessionCollectionPersistenceError);
    expect(persistedError).toMatchObject({
      code: "write",
      message: "Session collection persistence failed: write",
    });
    if (!(persistedError instanceof SessionCollectionPersistenceError))
      throw new Error("expected persistence error");
    expect(persistedError.cause).toBe(membershipError);
    expect(h.session.getCollectionSnapshot().errors).toEqual([
      { operation: "viewSelection", threadId, error: selectionError },
      { operation: "membershipAdd", threadId: replacementThreadId, error: persistedError },
    ]);
    await h.session.activate(threadId);
    expect(h.session.getCollectionSnapshot().errors).toEqual([
      { operation: "membershipAdd", threadId: replacementThreadId, error: persistedError },
    ]);
    write.mockRestore();
    queueReplacementActivation(h.commands);
    await h.session.activate(replacementThreadId);
    expect(h.session.getCollectionSnapshot().errors).toEqual([]);
  });

  it("owns remove selection failures globally without marking a healthy member failed", async () => {
    const h = createHarness();
    await activateInitial(h);
    const threadId = attachBaseline.snapshot.thread.id;
    const error = new Error("selection removal failed");
    h.authorizationSession.clearActiveThread.mockImplementationOnce(() => {
      throw error;
    });
    await expect(h.session.remove(threadId)).resolves.toMatchObject({
      type: "failed",
      phase: "selection",
    });
    expect(h.session.getCollectionSnapshot()).toMatchObject({
      errors: [{ operation: "removeSelection", threadId, error }],
      members: [{ phase: "ready", error: null }],
    });
    await h.session.retry(threadId);
    expect(h.session.getCollectionSnapshot().errors).toHaveLength(1);
    await expect(h.session.remove(threadId)).resolves.toMatchObject({ type: "removed" });
    expect(h.session.getCollectionSnapshot().errors).toEqual([]);
  });

  it("retains navigation and remove rejections independently of lifecycle retries and removal", async () => {
    const h = createHarness();
    await activateInitial(h);
    const threadId = attachBaseline.snapshot.thread.id;
    const navigationError = new Error("navigation rejected");
    const removeError = new Error("remove rejected");
    h.session.setOperationError(threadId, "navigation", navigationError);
    h.session.setOperationError(threadId, "remove", removeError);
    await h.session.retry(threadId);
    expect(h.session.getCollectionSnapshot().members[0]?.operationErrors).toEqual([
      { operation: "navigation", error: navigationError },
      { operation: "remove", error: removeError },
    ]);
    await h.session.remove(threadId);
    expect(h.session.getCollectionSnapshot().errors).toEqual([
      { operation: "navigation", threadId, error: navigationError },
    ]);
    h.session.setOperationError(threadId, "navigation", null);
    expect(h.session.getCollectionSnapshot().errors).toEqual([]);
    h.session.setOperationError(threadId, "navigation", navigationError);
    await h.session.activate(threadId);
    expect(h.session.getCollectionSnapshot().errors).toEqual([]);
    expect(h.session.getCollectionSnapshot().members[0]?.operationErrors).toEqual([
      { operation: "navigation", error: navigationError },
    ]);
    h.controller.dispose();
    h.session.setOperationError(threadId, "navigation", new Error("late old menu result"));
    expect(h.session.getCollectionSnapshot().errors).toEqual([]);
  });

  it("keeps a detached member and its read model until membership removal can be saved", async () => {
    const persistence = createPersistenceTestContext();
    const h = createHarness(undefined, undefined, persistence);
    await activateInitial(h);
    const threadId = attachBaseline.snapshot.thread.id;
    const storage = persistence.storage;
    if (storage == null) throw new Error("expected persistence storage");
    const save = storage.setItem.bind(storage);
    const membershipError = new Error("membership write failed");
    const write = vi.spyOn(storage, "setItem").mockImplementation((key, value) => {
      if (key === "codex-gui.sessionCollection") throw membershipError;
      save(key, value);
    });
    await expect(h.session.remove(threadId)).resolves.toMatchObject({
      type: "failed",
      phase: "membership",
    });
    expect(h.session.getCollectionSnapshot().members).toMatchObject([
      { threadId, phase: "removalPending", error: null },
    ]);
    const persistedError = h.session.getCollectionSnapshot().errors[0]?.error;
    expect(persistedError).toBeInstanceOf(SessionCollectionPersistenceError);
    expect(persistedError).toMatchObject({
      code: "write",
      message: "Session collection persistence failed: write",
    });
    if (!(persistedError instanceof SessionCollectionPersistenceError))
      throw new Error("expected persistence error");
    expect(persistedError.cause).toBe(membershipError);
    expect(h.session.getCollectionSnapshot().errors).toEqual([
      { operation: "membershipRemove", threadId, error: persistedError },
    ]);
    expect(h.store.getState().threadRuntime.byThreadId[threadId]).toBeDefined();
    expect(h.commands.detachThreadProjection).toHaveBeenCalledTimes(1);
    await expect(h.session.retry(threadId)).resolves.toEqual({
      type: "unavailable",
      failure: { type: "collectionFailed", operation: "membershipRemove", threadId },
    });
    write.mockRestore();
    await expect(h.session.retry(threadId)).resolves.toEqual({
      type: "removed",
      threadId,
      wasViewed: true,
    });
    expect(h.commands.detachThreadProjection).toHaveBeenCalledTimes(1);
    expect(h.store.getState().threadRuntime.byThreadId[threadId]).toBeUndefined();
    expect(h.authorizationSession.clearActiveThread).toHaveBeenCalled();
    expect(h.session.getCollectionSnapshot()).toMatchObject({ viewedThreadId: null, members: [] });
    expect(h.session.getCollectionSnapshot().errors).toEqual([]);
  });

  it("never reattaches while failed initialization cleanup is unresolved", async () => {
    const h = createHarness();
    const attach = createDeferred<Awaited<ReturnType<GuiHostCommands["attachThreadProjection"]>>>();
    vi.mocked(h.commands.attachThreadProjection).mockReturnValueOnce(attach.promise);
    vi.mocked(h.commands.detachThreadProjection).mockRejectedValue(new Error("detach unknown"));
    const activation = h.controller.activateRecoveryThread();
    await Promise.resolve();
    h.controller.handleProjectionClosed(closedBackpressure);
    attach.resolve(attachBaseline);
    await activation;
    expect(h.session.getCollectionSnapshot().members).toMatchObject([{ phase: "cleanupPending" }]);
    const initialError = h.session.getCollectionSnapshot().members[0]?.error;
    expect(initialError).toBeInstanceOf(AggregateError);
    if (!(initialError instanceof AggregateError))
      throw new Error("expected primary and cleanup failures");
    expect(initialError.errors).toEqual([
      new Error("Candidate projection became unavailable before publication"),
      new Error("detach unknown"),
    ]);
    vi.mocked(h.commands.detachThreadProjection).mockRejectedValueOnce(
      new Error("detach retry failed"),
    );
    await h.session.retry(attachBaseline.snapshot.thread.id);
    const retryError = h.session.getCollectionSnapshot().members[0]?.error;
    expect(retryError).toBeInstanceOf(AggregateError);
    if (!(retryError instanceof AggregateError))
      throw new Error("expected retained primary failure");
    expect(retryError.errors).toEqual([initialError.errors[0], new Error("detach retry failed")]);
    expect(h.session.getCollectionSnapshot().errors).toEqual([]);
    expect(h.commands.attachThreadProjection).toHaveBeenCalledTimes(1);
    vi.mocked(h.commands.detachThreadProjection).mockResolvedValue({ status: "detached" });
    await expect(h.session.retry(attachBaseline.snapshot.thread.id)).resolves.toMatchObject({
      type: "ready",
    });
    expect(h.commands.attachThreadProjection).toHaveBeenCalledTimes(2);
    expect(h.authorizationSession.commitActiveThread).toHaveBeenCalledExactlyOnceWith(
      attachBaseline.snapshot.thread.id,
      attachBaseline.snapshot.thread.cwd,
    );
  });

  it("does not persist a background retry or a retry superseded by another view intent", async () => {
    for (const selectBeforeRetry of [true, false]) {
      const h = createHarness();
      await activateInitial(h);
      vi.mocked(h.commands.attachThreadProjection).mockRejectedValueOnce(
        new Error("attach failed"),
      );
      await h.session.activate(replacementThreadId);
      if (selectBeforeRetry) await h.session.activate(attachBaseline.snapshot.thread.id);
      const attach =
        createDeferred<Awaited<ReturnType<GuiHostCommands["attachThreadProjection"]>>>();
      vi.mocked(h.commands.attachThreadProjection).mockReturnValueOnce(attach.promise);
      const retry = h.session.retry(replacementThreadId);
      if (!selectBeforeRetry) await h.session.activate(attachBaseline.snapshot.thread.id);
      h.authorizationSession.commitActiveThread.mockClear();
      attach.resolve(replacementAttach);
      await expect(retry).resolves.toMatchObject({ type: "ready", threadId: replacementThreadId });
      expect(h.authorizationSession.commitActiveThread).not.toHaveBeenCalled();
      expect(h.authorizationSession.getSnapshot().activeThreadId).toBe(
        attachBaseline.snapshot.thread.id,
      );
      expect(h.session.getCollectionSnapshot().viewedThreadId).toBe(
        attachBaseline.snapshot.thread.id,
      );
    }
  });

  it("reports a viewed retry selection save failure without losing the initialized member", async () => {
    const h = createHarness();
    vi.mocked(h.commands.attachThreadProjection).mockRejectedValueOnce(new Error("attach failed"));
    await h.controller.activateRecoveryThread();
    const error = new Error("selection save failed");
    h.authorizationSession.commitActiveThread.mockImplementationOnce(() => {
      throw error;
    });
    await expect(h.session.retry(attachBaseline.snapshot.thread.id)).resolves.toEqual({
      type: "ready",
      threadId: attachBaseline.snapshot.thread.id,
      warnings: [{ type: "authorizationPersistenceFailed", error }],
    });
    expect(h.session.getCollectionSnapshot()).toMatchObject({
      errors: [{ operation: "viewSelection", threadId: attachBaseline.snapshot.thread.id, error }],
      members: [{ phase: "ready" }],
    });
    expect(h.session.getSnapshot()).toMatchObject({ phase: "active" });
  });

  it("refreshes unknown ready status on retry so removal can be reconsidered", async () => {
    const h = createHarness();
    await activateInitial(h);
    const threadId = attachBaseline.snapshot.thread.id;
    vi.mocked(h.commands.readThread).mockResolvedValueOnce({
      thread: { ...attachBaseline.snapshot.thread, status: { type: "systemError" } },
    });
    await expect(h.session.remove(threadId)).resolves.toMatchObject({
      type: "blocked",
      blockers: ["statusUnknown"],
    });
    expect(h.session.getCollectionSnapshot().members[0]?.canRemove).toBe(false);
    vi.mocked(h.commands.readThread).mockClear();
    await expect(h.session.retry(threadId)).resolves.toMatchObject({ type: "ready" });
    expect(h.commands.readThread).toHaveBeenCalledExactlyOnceWith({
      threadId,
      includeTurns: false,
    });
    expect(h.session.getCollectionSnapshot().members[0]?.canRemove).toBe(true);
    await expect(h.session.remove(threadId)).resolves.toEqual({
      type: "removed",
      threadId,
      wasViewed: true,
    });
  });

  it.each([false, true])(
    "requires manual continuation only for recovered members with pending messages (%s)",
    async (hasQueuedMessages) => {
      const persistence = createPersistenceTestContext();
      const original = createHarness(undefined, undefined, persistence);
      const enqueue = () => {
        if (!hasQueuedMessages) return;
        const snapshot = original.session.getSnapshot();
        if (snapshot.phase !== "active") throw new Error("expected active member");
        expect(
          snapshot.composerRole.submit(snapshot.revision, composerCapture("queued before refresh")),
        ).toEqual({ type: "accepted" });
      };
      vi.mocked(original.commands.attachThreadProjection).mockResolvedValueOnce(
        hasQueuedMessages
          ? attachWithTurns(attachBaseline, [inProgressTurn("running-before-refresh")])
          : attachBaseline,
      );
      await activateInitial(original);
      enqueue();
      vi.mocked(original.commands.attachThreadProjection).mockResolvedValueOnce(
        hasQueuedMessages
          ? attachWithTurns(replacementAttach, [inProgressTurn("replacement-before-refresh")])
          : replacementAttach,
      );
      await original.session.activate(replacementThreadId);
      enqueue();
      original.controller.suspendRestoredQueue();
      original.controller.dispose();
      const recovered = createHarness(undefined, undefined, persistence);
      vi.mocked(recovered.commands.attachThreadProjection).mockImplementation(({ threadId }) =>
        Promise.resolve(threadId === replacementThreadId ? replacementAttach : attachBaseline),
      );
      await recovered.controller.activateRecoveryThread();
      await vi.waitFor(() => {
        expect(
          recovered.session
            .getCollectionSnapshot()
            .members.every((member) => member.phase === "ready"),
        ).toBe(true);
      });
      for (const threadId of [attachBaseline.snapshot.thread.id, replacementThreadId]) {
        const removal = await recovered.session.remove(threadId);
        expect(removal.type).toBe(hasQueuedMessages ? "blocked" : "removed");
        const blockers = removal.type === "blocked" ? removal.blockers : [];
        expect(blockers.includes("restoredPaused")).toBe(hasQueuedMessages);
      }
      expect(recovered.commands.startTurn).not.toHaveBeenCalled();
    },
  );

  it("keeps a member suspended when its attachment completes after page suspension", async () => {
    const h = createHarness();
    await activateInitial(h);
    const attach = createDeferred<Awaited<ReturnType<GuiHostCommands["attachThreadProjection"]>>>();
    vi.mocked(h.commands.attachThreadProjection).mockReturnValueOnce(attach.promise);
    const activation = h.session.activate(replacementThreadId);
    await vi.waitFor(() => {
      expect(h.commands.attachThreadProjection).toHaveBeenCalledTimes(2);
    });
    h.controller.suspendRestoredQueue();
    attach.resolve(replacementAttach);
    await expect(activation).resolves.toMatchObject({ type: "ready" });
    const snapshot = h.session.getSnapshot();
    if (snapshot.phase !== "active") throw new Error("expected initialized member");
    expect(snapshot.composer.persistence.restoredPaused).toBe(false);
    expect(
      snapshot.composerRole.submit(snapshot.revision, composerCapture("after late attachment")),
    ).toEqual({ type: "accepted" });
    expect(h.commands.startTurn).not.toHaveBeenCalled();
  });

  it("restores every persisted member when activation retries a transient collection read failure", async () => {
    const persistence = createPersistenceTestContext();
    const original = createHarness(undefined, undefined, persistence);
    await activateInitial(original);
    queueReplacementActivation(original.commands);
    await original.session.activate(replacementThreadId);
    original.controller.suspendRestoredQueue();
    original.controller.dispose();
    const storage = persistence.storage;
    if (storage == null) throw new Error("expected persistence storage");
    const read = vi.spyOn(storage, "getItem").mockImplementationOnce(() => {
      throw new Error("temporary collection read failure");
    });
    const recovered = createHarness(undefined, undefined, persistence);
    vi.mocked(recovered.commands.attachThreadProjection).mockImplementation(({ threadId }) =>
      Promise.resolve(threadId === replacementThreadId ? replacementAttach : attachBaseline),
    );
    await expect(recovered.controller.activateRecoveryThread()).resolves.toEqual({
      type: "unavailable",
      failure: { type: "collectionFailed", operation: "collectionRead", threadId: null },
    });
    expect(recovered.commands.attachThreadProjection).not.toHaveBeenCalled();
    read.mockRestore();
    const target = attachBaseline.snapshot.thread.id;
    await expect(recovered.session.activate(target)).resolves.toMatchObject({
      type: "ready",
      threadId: target,
    });
    await vi.waitFor(() => {
      expect(
        recovered.session
          .getCollectionSnapshot()
          .members.map(({ threadId, phase }) => ({ threadId, phase })),
      ).toEqual([
        { threadId: target, phase: "ready" },
        { threadId: replacementThreadId, phase: "ready" },
      ]);
    });
    expect(recovered.session.getCollectionSnapshot().viewedThreadId).toBe(target);
    expect(recovered.authorizationSession.commitActiveThread).toHaveBeenCalledExactlyOnceWith(
      target,
      attachBaseline.snapshot.thread.cwd,
    );
    expect(recovered.commands.attachThreadProjection).toHaveBeenCalledTimes(2);
    for (const member of recovered.session.getCollectionSnapshot().members) {
      expect(member.snapshot).toMatchObject({
        phase: "active",
        composer: { persistence: { restoredPaused: false } },
      });
    }
    expect(recovered.commands.startTurn).not.toHaveBeenCalled();
  });

  it("routes only the current thread status invalidation to an authoritative read", async () => {
    const h = createHarness();
    await activateInitial(h);
    const initial = h.session.getSnapshot();
    if (initial.phase !== "active") throw new Error("expected the initial active session");
    vi.mocked(h.commands.readThread).mockResolvedValueOnce({
      thread: { ...attachBaseline.snapshot.thread, status: { type: "systemError" } },
    });

    h.controller.handleThreadStatusChanged({
      threadId: "foreign-thread",
      status: { type: "active", activeFlags: [] },
    });
    expect(h.commands.readThread).not.toHaveBeenCalled();

    h.controller.handleThreadStatusChanged({
      threadId: attachBaseline.snapshot.thread.id,
      status: { type: "active", activeFlags: ["waitingOnApproval"] },
    });
    await vi.waitFor(() => {
      expect(h.session.getSnapshot()).toMatchObject({
        threadStatus: { type: "systemError" },
      });
    });
    expect(h.commands.readThread).toHaveBeenCalledExactlyOnceWith({
      threadId: attachBaseline.snapshot.thread.id,
      includeTurns: false,
    });
  });

  it("uses the recovery locator for first attach and publishes one complete session", async () => {
    const h = createHarness();
    const listener = vi.fn<() => void>();
    h.session.subscribe(listener);

    await activateInitial(h);

    expect(h.commands.resumeThread).toHaveBeenCalledExactlyOnceWith({
      threadId: attachBaseline.snapshot.thread.id,
    });
    expect(h.commands.attachThreadProjection).toHaveBeenCalledExactlyOnceWith({
      threadId: attachBaseline.snapshot.thread.id,
    });
    expect(h.session.getSnapshot()).toMatchObject({
      phase: "active",
      threadId: attachBaseline.snapshot.thread.id,
      subscriptionId: attachBaseline.subscriptionId,
    });
    expect(
      h.store.getState().threadRuntime.byThreadId[attachBaseline.snapshot.thread.id]
        ?.sessionRevision,
    ).toBe(h.session.getSnapshot().revision);
    expect(listener).toHaveBeenCalled();
  });

  it("exposes stable revision-gated compaction, composer, and skills roles", async () => {
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
    expect(initial.compaction).toEqual({ phase: "idle", canRequest: true, startFailure: null });

    h.controller.handleProjectionEvent(eventTurnStarted);
    const withTurn = h.session.getSnapshot();
    if (withTurn.phase !== "active") throw new Error("expected an active turn session");
    expect(withTurn.composerRole).toBe(initial.composerRole);
    expect(withTurn.compactionRole).toBe(initial.compactionRole);
    expect(withTurn.skillsRole).toBe(initial.skillsRole);
    expect(withTurn.compaction).toEqual({ phase: "idle", canRequest: false, startFailure: null });
    expect(withTurn.compactionRole.requestCompaction(withTurn.revision)).toEqual({
      type: "rejected",
      reason: "activeTurn",
    });
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

  it("keeps background compaction isolated from the viewed session", async () => {
    const h = createHarness();
    const compact = createDeferred<Awaited<ReturnType<GuiHostCommands["compactThread"]>>>();
    vi.mocked(h.commands.compactThread).mockReturnValueOnce(compact.promise);
    await activateInitial(h);
    const initial = h.session.getSnapshot();
    if (initial.phase !== "active") throw new Error("expected the initial active session");
    expect(initial.compactionRole.requestCompaction(initial.revision)).toEqual({
      type: "accepted",
    });
    h.controller.handleProjectionEvent(eventTurnStarted);

    queueReplacementActivation(h.commands);
    await expect(h.session.activate(replacementThreadId)).resolves.toMatchObject({ type: "ready" });
    const replacement = h.session.getSnapshot();
    if (replacement.phase !== "active") throw new Error("expected the replacement session");
    expect(replacement.compactionRole).not.toBe(initial.compactionRole);
    expect(initial.compactionRole.requestCompaction(initial.revision)).toMatchObject({
      type: "unavailable",
      reason: "staleRevision",
    });

    compact.reject(new Error("late compact failure"));
    await Promise.resolve();
    expect(h.session.getSnapshot()).toBe(replacement);
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

  it("keeps the old live session operable while another member initializes", async () => {
    const h = createHarness();
    await activateInitial(h);
    const resume = createDeferred<Awaited<ReturnType<GuiHostCommands["resumeThread"]>>>();
    vi.mocked(h.commands.resumeThread).mockReturnValueOnce(resume.promise);
    queueReplacementActivation(h.commands);

    const oldSnapshot = h.session.getSnapshot();
    const activation = h.session.activate(replacementThreadId);
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
      type: "ready",
      threadId: replacementThreadId,
    });
    const retained = h.session
      .getCollectionSnapshot()
      .members.find((member) => member.threadId === attachBaseline.snapshot.thread.id)?.snapshot;
    expect(retained).toMatchObject({
      phase: "active",
      threadId: attachBaseline.snapshot.thread.id,
    });
    if (retained?.phase !== "active") throw new Error("expected the retained active session");
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
    expect(
      h.store.getState().threadRuntime.byThreadId[replacementThreadId]?.current?.threadId,
    ).toBe(replacementThreadId);
    expect(listener).toHaveBeenCalled();
    const published = h.session.getSnapshot();
    expect(h.store.getState().threadRuntime.byThreadId[replacementThreadId]?.sessionRevision).toBe(
      published.revision,
    );

    h.controller.handleProjectionEvent(postPublicationEvent);
    const afterEvent = h.session.getSnapshot();
    expect(afterEvent.revision).toBeGreaterThan(published.revision);
    expect(h.store.getState().threadRuntime.byThreadId[replacementThreadId]?.sessionRevision).toBe(
      afterEvent.revision,
    );
    if (afterEvent.phase !== "active") throw new Error("expected the replacement active session");
    expect(
      afterEvent.composerRole.submit(
        afterEvent.revision,
        composerCapture("post-publication child transition"),
      ),
    ).toEqual({ type: "accepted" });
    const afterChild = h.session.getSnapshot();
    expect(afterChild.revision).toBeGreaterThan(afterEvent.revision);
    expect(h.store.getState().threadRuntime.byThreadId[replacementThreadId]?.sessionRevision).toBe(
      afterChild.revision,
    );
    expect(h.commands.detachThreadProjection).not.toHaveBeenCalled();
  });

  it("closes candidate status invalidations before publishing the replacement", async () => {
    const h = createHarness();
    await activateInitial(h);
    const attach = createDeferred<Awaited<ReturnType<GuiHostCommands["attachThreadProjection"]>>>();
    const firstRead = createDeferred<Awaited<ReturnType<GuiHostCommands["readThread"]>>>();
    const secondRead = createDeferred<Awaited<ReturnType<GuiHostCommands["readThread"]>>>();
    vi.mocked(h.commands.attachThreadProjection).mockReturnValueOnce(attach.promise);
    vi.mocked(h.commands.readThread)
      .mockReturnValueOnce(firstRead.promise)
      .mockReturnValueOnce(secondRead.promise);

    const activation = h.session.activate(replacementThreadId);
    await Promise.resolve();
    h.controller.handleThreadStatusChanged({
      threadId: replacementThreadId,
      status: { type: "systemError" },
    });
    attach.resolve(replacementAttach);
    await vi.waitFor(() => {
      expect(h.commands.readThread).toHaveBeenCalledTimes(1);
    });
    expect(h.session.getSnapshot()).toMatchObject({
      threadId: replacementThreadId,
    });

    h.controller.handleThreadStatusChanged({
      threadId: replacementThreadId,
      status: { type: "idle" },
    });
    firstRead.resolve({
      thread: { ...replacementAttach.snapshot.thread, status: { type: "active", activeFlags: [] } },
    });
    await vi.waitFor(() => {
      expect(h.commands.readThread).toHaveBeenCalledTimes(2);
    });
    expect(h.session.getSnapshot()).toMatchObject({
      threadId: replacementThreadId,
    });

    secondRead.resolve({
      thread: { ...replacementAttach.snapshot.thread, status: { type: "systemError" } },
    });
    await expect(activation).resolves.toEqual({
      type: "ready",
      threadId: replacementThreadId,
      warnings: [],
    });
    expect(h.session.getSnapshot()).toMatchObject({
      phase: "active",
      threadId: replacementThreadId,
      threadStatus: { type: "systemError" },
    });
    expect(h.commands.readThread).toHaveBeenNthCalledWith(1, {
      threadId: replacementThreadId,
      includeTurns: false,
    });
    expect(h.commands.readThread).toHaveBeenNthCalledWith(2, {
      threadId: replacementThreadId,
      includeTurns: false,
    });
  });

  it("abandons a candidate status read on connection loss and ignores its late result", async () => {
    const h = createHarness();
    await activateInitial(h);
    const attach = createDeferred<Awaited<ReturnType<GuiHostCommands["attachThreadProjection"]>>>();
    const read = createDeferred<Awaited<ReturnType<GuiHostCommands["readThread"]>>>();
    vi.mocked(h.commands.attachThreadProjection).mockReturnValueOnce(attach.promise);
    vi.mocked(h.commands.readThread).mockReturnValueOnce(read.promise);

    const activation = h.session.activate(replacementThreadId);
    await Promise.resolve();
    h.controller.handleThreadStatusChanged({
      threadId: replacementThreadId,
      status: { type: "active", activeFlags: [] },
    });
    attach.resolve(replacementAttach);
    await vi.waitFor(() => {
      expect(h.commands.readThread).toHaveBeenCalledTimes(1);
    });
    h.controller.connectionUnavailable();

    await expect(activation).resolves.toMatchObject({
      type: "unavailable",
      failure: { type: "connectionLost", progress: "beforeCommit" },
    });
    const disposed = h.session.getSnapshot();
    expect(disposed.phase).toBe("disposed");

    read.resolve({
      thread: { ...replacementAttach.snapshot.thread, status: { type: "systemError" } },
    });
    await read.promise;
    await Promise.resolve();
    expect(h.session.getSnapshot()).toBe(disposed);
  });

  it("retains the old owner when another member initialization fails", async () => {
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
      failure: { type: "operationFailed", phase: "prepare" },
    });

    expect(
      h.session
        .getCollectionSnapshot()
        .members.find((member) => member.threadId === oldSnapshot.threadId)?.snapshot,
    ).toBe(oldSnapshot);
    expect(h.session.getSnapshot()).toMatchObject({
      phase: "failed",
      threadId: replacementThreadId,
    });
    expect(sessionListener).toHaveBeenCalled();
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
      phase: "failed",
      threadId: replacementThreadId,
    });
    expect(h.commands.detachThreadProjection).toHaveBeenCalledExactlyOnceWith({
      threadId: replacementThreadId,
    });
  });

  it("retains both members when selecting another thread without detaching", async () => {
    const h = createHarness();
    await activateInitial(h);
    queueReplacementActivation(h.commands);
    const detachError = new Error("detach failed");
    vi.mocked(h.commands.detachThreadProjection).mockRejectedValueOnce(detachError);

    await expect(h.session.activate(replacementThreadId)).resolves.toEqual({
      type: "ready",
      threadId: replacementThreadId,
      warnings: [],
    });
    expect(h.session.getSnapshot()).toMatchObject({
      phase: "active",
      threadId: replacementThreadId,
    });
    expect(h.commands.detachThreadProjection).not.toHaveBeenCalled();
  });

  it("cleans up all live owners on connection loss", async () => {
    const h = createHarness();
    await activateInitial(h);
    queueReplacementActivation(h.commands);
    const detach = createDeferred<Awaited<ReturnType<GuiHostCommands["detachThreadProjection"]>>>();
    vi.mocked(h.commands.detachThreadProjection).mockReturnValueOnce(detach.promise);

    await h.session.activate(replacementThreadId);
    expect(Object.keys(h.store.getState().threadRuntime.byThreadId)).toHaveLength(2);
    h.controller.connectionUnavailable();
    detach.resolve({ status: "detached" });

    expect(h.store.getState().threadRuntime.byThreadId).toEqual({});
    expect(h.session.getCollectionSnapshot().members).toEqual([]);
    expect(h.session.getSnapshot().phase).toBe("disposed");
  });

  it("allows viewing another member while pending delivery blocks removal", async () => {
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
      type: "ready",
    });
    const removal = await h.session.remove(attachBaseline.snapshot.thread.id);
    expect(removal.type).toBe("blocked");
    if (removal.type !== "blocked") throw new Error("expected blocked removal");
    expect(removal.blockers).toContainEqual({ type: "pendingStart", phase: "issuing" });
    const retained = h.session
      .getCollectionSnapshot()
      .members.find((member) => member.threadId === attachBaseline.snapshot.thread.id)?.snapshot;
    expect(retained).toMatchObject({
      threadId: attachBaseline.snapshot.thread.id,
    });
    if (retained?.phase !== "active") throw new Error("expected the retained active session");
    expect(retained.revision).toBeGreaterThanOrEqual(revision);
    expect(retained.composerRole).toBe(active.composerRole);
  });

  it("allows a newer view intent while retaining failed initialization for retry", async () => {
    const h = createHarness();
    await activateInitial(h);
    const resume = createDeferred<Awaited<ReturnType<GuiHostCommands["resumeThread"]>>>();
    vi.mocked(h.commands.resumeThread).mockReturnValueOnce(resume.promise);
    const first = h.session.activate(replacementThreadId);

    await expect(h.session.activate(attachBaseline.snapshot.thread.id)).resolves.toMatchObject({
      type: "ready",
    });
    resume.resolve(
      await createGuiHostCommands().resumeThread({ threadId: attachBaseline.snapshot.thread.id }),
    );
    await expect(first).resolves.toMatchObject({
      type: "unavailable",
      failure: { type: "currentThreadChanged" },
    });
    expect(h.commands.attachThreadProjection).toHaveBeenCalledTimes(1);
    const failed = h.session
      .getCollectionSnapshot()
      .members.find((member) => member.threadId === replacementThreadId);
    expect(failed?.phase).toBe("failed");
    expect(failed?.error).toBeInstanceOf(Error);
  });

  it("views a background failure without retrying until explicitly requested", async () => {
    const h = createHarness();
    await activateInitial(h);
    const resume = createDeferred<Awaited<ReturnType<GuiHostCommands["resumeThread"]>>>();
    vi.mocked(h.commands.resumeThread).mockReturnValueOnce(resume.promise);
    const activation = h.session.activate(replacementThreadId);
    await h.session.activate(attachBaseline.snapshot.thread.id);
    const error = new Error("background resume failed");
    resume.reject(error);
    await activation;
    expect(h.session.getSnapshot()).toMatchObject({
      phase: "active",
      threadId: attachBaseline.snapshot.thread.id,
    });
    expect(h.commands.resumeThread).toHaveBeenCalledTimes(2);
    expect(h.commands.attachThreadProjection).toHaveBeenCalledTimes(1);

    await expect(h.session.view(replacementThreadId)).resolves.toMatchObject({
      type: "unavailable",
      failure: { type: "operationFailed", error },
    });
    expect(h.session.getSnapshot()).toMatchObject({
      phase: "failed",
      threadId: replacementThreadId,
      error,
    });
    expect(
      h.session
        .getCollectionSnapshot()
        .members.find((member) => member.threadId === replacementThreadId)?.error,
    ).toBe(error);
    expect(h.commands.resumeThread).toHaveBeenCalledTimes(2);
    expect(h.commands.attachThreadProjection).toHaveBeenCalledTimes(1);

    queueReplacementActivation(h.commands);
    await expect(h.session.retry(replacementThreadId)).resolves.toMatchObject({
      type: "ready",
      threadId: replacementThreadId,
    });
    expect(h.commands.resumeThread).toHaveBeenCalledTimes(3);
    expect(h.commands.attachThreadProjection).toHaveBeenCalledTimes(2);
    expect(h.session.getSnapshot()).toMatchObject({
      phase: "active",
      threadId: replacementThreadId,
    });
    expect(
      h.session
        .getCollectionSnapshot()
        .members.find((member) => member.threadId === replacementThreadId)?.error,
    ).toBeNull();
  });

  it("retries a failed member when explicitly continuing it again", async () => {
    const h = createHarness();
    const threadId = attachBaseline.snapshot.thread.id;
    vi.mocked(h.commands.resumeThread).mockRejectedValueOnce(new Error("resume failed"));
    await expect(h.session.activate(threadId)).resolves.toMatchObject({ type: "unavailable" });
    await expect(h.session.activate(threadId)).resolves.toMatchObject({ type: "ready", threadId });
    expect(h.commands.resumeThread).toHaveBeenCalledTimes(2);
    expect(h.commands.attachThreadProjection).toHaveBeenCalledTimes(1);
    expect(h.session.getSnapshot()).toMatchObject({ phase: "active", threadId });
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
    expect(h.session.getSnapshot()).toMatchObject({
      phase: "failed",
      threadId: attachBaseline.snapshot.thread.id,
    });

    h.controller.connectionUnavailable();
    await expect(h.session.activate(attachBaseline.snapshot.thread.id)).resolves.toMatchObject({
      type: "unavailable",
      failure: { type: "connectionLost", progress: "beforeCommit" },
    });
  });
});
