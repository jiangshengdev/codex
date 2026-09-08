import { describe, expect, it, vi } from "vitest";
import type { UnknownAction } from "@reduxjs/toolkit";
import { makeStore, type AppDispatch } from "@/app/store";
import { createDeferred, createGuiHostCommands } from "@/__tests__/appBrowserTestSupport";
import { createPersistenceTestContext } from "@/features/composerInputQueue/__tests__/composerInputQueueCoordinatorTestFixtures";
import { composerCapture } from "@/features/composerInputQueue/__tests__/composerInputQueueTestFixtures";
import {
  attachBaseline,
  closedBackpressure,
  eventTurnStarted,
  eventItemStarted,
  eventAgentMessageDelta,
} from "@/features/projection/__tests__/projectionFixtures";
import { createActiveThreadMemberLifecycle } from "../activeThreadMemberLifecycle";

const threadId = attachBaseline.snapshot.thread.id;

function createHarness(afterDispatch: () => void = () => undefined) {
  const store = makeStore();
  const commands = createGuiHostCommands({ loadedThreadIds: [threadId] });
  vi.mocked(commands.listSkills).mockImplementation(() => new Promise(() => undefined));
  const frames = new Map<number, () => void>();
  let nextFrame = 0;
  const member = createActiveThreadMemberLifecycle({
    threadId,
    commands,
    persistence: createPersistenceTestContext(),
    dispatch: ((action: UnknownAction) => {
      const result = store.dispatch(action);
      afterDispatch();
      return result;
    }) as AppDispatch,
    scheduler: {
      requestFrame(callback) {
        const id = ++nextFrame;
        frames.set(id, callback);
        return id;
      },
      cancelFrame(id) {
        frames.delete(id);
      },
    },
  });
  return { member, commands, store, frames };
}

describe("active thread member lifecycle", () => {
  it("drains a notification received synchronously while the live session is constructed", async () => {
    let notified = false;
    const h = createHarness(() => {
      if (notified || h.store.getState().threadRuntime.byThreadId[threadId]?.sessionRevision !== 1)
        return;
      notified = true;
      h.member.handleProjectionEvent(eventTurnStarted);
    });
    await expect(h.member.initialize()).resolves.toMatchObject({ type: "ready" });
    const snapshot = h.member.getState().snapshot;
    expect(snapshot).toMatchObject({ phase: "active", activeTurnId: "turn-in-progress" });
    expect(h.store.getState().threadRuntime.byThreadId[threadId]?.sessionRevision).toBe(
      snapshot?.revision,
    );
    h.member.dispose();
  });

  it("keeps sending suspended when attach completes after suspension", async () => {
    const h = createHarness();
    const attach = createDeferred<typeof attachBaseline>();
    vi.mocked(h.commands.attachThreadProjection).mockReturnValueOnce(attach.promise);
    const pending = h.member.initialize();
    await Promise.resolve();
    h.member.suspendRestored();
    h.member.invalidateSkills();
    attach.resolve(attachBaseline);
    await expect(pending).resolves.toMatchObject({ type: "ready" });
    const snapshot = h.member.getState().snapshot;
    if (snapshot?.phase !== "active") throw new Error("expected active snapshot");
    expect(snapshot.composer.persistence.restoredPaused).toBe(false);
    expect(
      snapshot.composerRole.submit(snapshot.revision, composerCapture("after late attach")),
    ).toEqual({ type: "accepted" });
    expect(h.commands.startTurn).not.toHaveBeenCalled();
    expect(h.commands.listSkills).toHaveBeenCalled();
    h.member.dispose();
  });

  it("rejects a prepared release after local termination without detaching", async () => {
    const h = createHarness();
    await h.member.initialize();
    const preparation = await h.member.prepareRemoval();
    if (preparation.type !== "prepared") throw new Error("expected release preparation");
    h.member.dispose();
    await expect(preparation.release()).resolves.toEqual({ type: "unavailable", threadId });
    await expect(h.member.prepareRemoval()).resolves.toEqual({ type: "unavailable", threadId });
    expect(h.commands.detachThreadProjection).not.toHaveBeenCalled();
  });

  it("deduplicates initialization and loads an already loaded member without resuming", async () => {
    const h = createHarness();
    const pending = h.member.initialize();
    expect(h.member.initialize()).toBe(pending);
    await expect(pending).resolves.toEqual({ type: "ready", threadId, warnings: [] });
    expect(h.commands.attachThreadProjection).toHaveBeenCalledTimes(1);
    expect(h.commands.resumeThread).not.toHaveBeenCalled();
    expect(h.member.getState()).toMatchObject({
      phase: "ready",
      cwd: attachBaseline.snapshot.thread.cwd,
    });
    h.member.dispose();
  });

  it("keeps initialization failure separate from unresolved detach and retries cleanup before attach", async () => {
    const h = createHarness();
    const attach = createDeferred<typeof attachBaseline>();
    vi.mocked(h.commands.attachThreadProjection).mockReturnValueOnce(attach.promise);
    const cleanupError = new Error("detach unknown");
    vi.mocked(h.commands.detachThreadProjection).mockRejectedValue(cleanupError);
    const pending = h.member.initialize();
    await Promise.resolve();
    h.member.handleProjectionClosed(closedBackpressure);
    attach.resolve(attachBaseline);
    await expect(pending).resolves.toMatchObject({
      type: "unavailable",
      failure: { cleanupError },
    });
    expect(h.member.getState()).toMatchObject({ phase: "cleanupPending", retryRemoval: false });
    const failure = h.member.getState().error;
    expect(failure).toBeInstanceOf(AggregateError);
    await h.member.initialize();
    await h.member.retry();
    expect(h.commands.attachThreadProjection).toHaveBeenCalledTimes(1);
    expect(h.member.getState().error).toEqual(failure);
    vi.mocked(h.commands.detachThreadProjection).mockResolvedValue({ status: "detached" });
    await expect(h.member.retry()).resolves.toMatchObject({ type: "ready" });
    expect(h.commands.attachThreadProjection).toHaveBeenCalledTimes(2);
    h.member.dispose();
  });

  it("retains the read model across release retries until membership finalization", async () => {
    const h = createHarness();
    await h.member.initialize();
    for (const attempt of [0, 1]) {
      const preparation = await h.member.prepareRemoval();
      expect(preparation.type).toBe("prepared");
      if (preparation.type !== "prepared") throw new Error("expected release preparation");
      await expect(preparation.release()).resolves.toEqual({ type: "released" });
      expect(h.member.getState()).toMatchObject({
        phase: "removalPending",
        snapshot: null,
        retryRemoval: true,
      });
      expect(h.commands.detachThreadProjection).toHaveBeenCalledTimes(1);
      expect(
        h.store.getState().threadRuntime.byThreadId[threadId],
        `attempt ${String(attempt)}`,
      ).toBeDefined();
    }
    h.member.finalizeRemoval();
    expect(h.store.getState().threadRuntime.byThreadId[threadId]).toBeUndefined();
  });

  it("cancels a release without detaching or disabling the healthy member", async () => {
    const h = createHarness();
    await h.member.initialize();
    const preparation = await h.member.prepareRemoval();
    if (preparation.type !== "prepared") throw new Error("expected release preparation");
    preparation.cancel();
    expect(h.commands.detachThreadProjection).not.toHaveBeenCalled();
    const snapshot = h.member.getState().snapshot;
    if (snapshot?.phase !== "active") throw new Error("expected active snapshot");
    expect(
      snapshot.composerRole.submit(snapshot.revision, composerCapture("still usable")),
    ).toEqual({ type: "accepted" });
    h.member.dispose();
  });

  it("disposes locally and compensates an attach that arrives after termination", async () => {
    const h = createHarness();
    const attach = createDeferred<typeof attachBaseline>();
    vi.mocked(h.commands.attachThreadProjection).mockReturnValueOnce(attach.promise);
    const pending = h.member.initialize();
    await Promise.resolve();
    h.member.dispose();
    expect(h.commands.detachThreadProjection).not.toHaveBeenCalled();
    attach.resolve(attachBaseline);
    await expect(pending).resolves.toMatchObject({
      type: "unavailable",
      failure: { type: "connectionLost" },
    });
    expect(h.commands.detachThreadProjection).toHaveBeenCalledTimes(1);
    expect(h.store.getState().threadRuntime.byThreadId[threadId]).toBeUndefined();
  });

  it("cleans the registered slot when slot creation synchronously terminates the member", async () => {
    let terminate = false;
    const h = createHarness(() => {
      if (terminate) h.member.dispose();
    });
    terminate = true;
    await expect(h.member.initialize()).resolves.toMatchObject({ type: "unavailable" });
    expect(h.store.getState().threadRuntime.byThreadId[threadId]).toBeUndefined();
    expect(h.commands.detachThreadProjection).toHaveBeenCalledTimes(1);
  });

  it("cancels a scheduled delta frame when a non-delta closes the projection", async () => {
    const h = createHarness();
    await h.member.initialize();
    h.member.handleProjectionEvent(eventTurnStarted);
    h.member.handleProjectionEvent(eventItemStarted);
    h.member.handleProjectionDelta(eventAgentMessageDelta);
    expect(h.frames.size).toBe(1);
    h.member.handleProjectionClosed(closedBackpressure);
    expect(h.frames.size).toBe(0);
    expect(h.member.getState().snapshot?.phase).toBe("projectionUnavailable");
    h.member.dispose();
    expect(h.commands.detachThreadProjection).not.toHaveBeenCalled();
  });

  it("applies status invalidation before exposing ready and ignores another subscription", async () => {
    const h = createHarness();
    const read = createDeferred<Awaited<ReturnType<typeof h.commands.readThread>>>();
    vi.mocked(h.commands.readThread).mockReturnValueOnce(read.promise);
    h.member.invalidateThreadStatus();
    const pending = h.member.initialize();
    await vi.waitFor(() => {
      expect(h.commands.readThread).toHaveBeenCalledTimes(1);
    });
    expect(h.member.getState().phase).toBe("initializing");
    h.member.handleProjectionClosed({
      ...closedBackpressure,
      subscriptionId: "another-subscription",
    });
    read.resolve({ thread: attachBaseline.snapshot.thread });
    await expect(pending).resolves.toMatchObject({ type: "ready" });
    expect(h.member.getState().snapshot?.phase).toBe("active");
    h.member.dispose();
  });
});
