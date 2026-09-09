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
import { createActiveThreadConnection } from "../activeThreadConnection";
import {
  attachWithSnapshotThread,
  eventWithEnvelope,
  closedWithEnvelope,
} from "@/features/projection/__tests__/projectionTestBuilders";

const threadId = attachBaseline.snapshot.thread.id;

function createHarness(
  afterDispatch: () => void = () => undefined,
  persistence = createPersistenceTestContext(),
) {
  const store = makeStore();
  const commands = createGuiHostCommands({ loadedThreadIds: [threadId] });
  vi.mocked(commands.listSkills).mockImplementation(() => new Promise(() => undefined));
  const frames = new Map<number, () => void>();
  let nextFrame = 0;
  const connection = createActiveThreadConnection(commands);
  const member = createActiveThreadMemberLifecycle({
    threadId,
    connection,
    persistence,
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
  return { member, commands, connection, store, frames };
}

describe("active thread member lifecycle", () => {
  it("keeps the old baseline when the candidate closes during its persistence transaction", async () => {
    const persistence = createPersistenceTestContext();
    const h = createHarness(() => undefined, persistence);
    await h.member.initialize();
    const initial = h.member.getState().snapshot;
    if (initial?.phase !== "active" || persistence.storage == null)
      throw new Error("expected active member and storage");
    h.member.handleProjectionClosed(closedBackpressure);
    const response = attachWithSnapshotThread(
      attachBaseline,
      attachBaseline.snapshot.thread,
      "closed-while-saving",
    );
    vi.mocked(h.commands.attachThreadProjection).mockResolvedValueOnce(response);
    const write = persistence.storage.setItem;
    vi.spyOn(persistence.storage, "setItem").mockImplementation((key, value) => {
      write(key, value);
      h.member.handleProjectionClosed(
        closedWithEnvelope(closedBackpressure, { subscriptionId: response.subscriptionId }),
      );
    });
    await expect(h.member.recoverProjection(initial.identity)).resolves.toMatchObject({
      type: "failed",
    });
    expect(h.store.getState().transcriptState.byThreadId[threadId]?.transcript.subscriptionId).toBe(
      initial.subscriptionId,
    );
    h.member.dispose();
  });

  it("does not recover or advance the active turn when a reentrant candidate event cannot be saved", async () => {
    const persistence = createPersistenceTestContext();
    let inject = false;
    const response = attachWithSnapshotThread(
      attachBaseline,
      attachBaseline.snapshot.thread,
      "reentrant-candidate",
    );
    const h = createHarness(() => {
      if (
        !inject ||
        h.store.getState().transcriptState.byThreadId[threadId]?.transcript.subscriptionId !==
          response.subscriptionId
      )
        return;
      inject = false;
      if (persistence.storage == null) throw new Error("expected storage");
      vi.spyOn(persistence.storage, "setItem").mockImplementation(() => {
        throw new Error("full");
      });
      h.member.handleProjectionEvent(
        eventWithEnvelope(eventTurnStarted, { subscriptionId: response.subscriptionId }),
      );
    }, persistence);
    await h.member.initialize();
    const initial = h.member.getState().snapshot;
    if (initial?.phase !== "active") throw new Error("expected active member");
    h.member.handleProjectionClosed(closedBackpressure);
    vi.mocked(h.commands.attachThreadProjection).mockResolvedValueOnce(response);
    inject = true;
    await expect(h.member.recoverProjection(initial.identity)).resolves.toMatchObject({
      type: "blocked",
    });
    expect(h.member.getState().snapshot).toMatchObject({
      phase: "projectionUnavailable",
      activeTurnId: null,
      recovery: { pending: false },
    });
    expect(h.commands.startTurn).not.toHaveBeenCalled();
    h.member.dispose();
  });

  it("rejects a candidate closed before its attach response and allows another recovery", async () => {
    const h = createHarness();
    await h.member.initialize();
    const initial = h.member.getState().snapshot;
    if (initial?.phase !== "active") throw new Error("expected active member");
    h.member.handleProjectionClosed(closedBackpressure);
    const attach = createDeferred<typeof attachBaseline>();
    vi.mocked(h.commands.attachThreadProjection).mockReturnValueOnce(attach.promise);
    const pending = h.member.recoverProjection(initial.identity);
    const response = attachWithSnapshotThread(
      attachBaseline,
      attachBaseline.snapshot.thread,
      "closed-candidate",
    );
    h.member.handleProjectionClosed(
      closedWithEnvelope(closedBackpressure, { subscriptionId: response.subscriptionId }),
    );
    attach.resolve(response);
    await expect(pending).resolves.toMatchObject({ type: "failed" });
    expect(h.member.getState().snapshot).toMatchObject({
      phase: "projectionUnavailable",
      subscriptionId: initial.subscriptionId,
      recovery: { pending: false },
    });
    await expect(h.member.recoverProjection(initial.identity)).resolves.toEqual({
      type: "recovered",
    });
    h.member.dispose();
  });

  it("does not publish or detach when a recovery response arrives after disposal", async () => {
    const h = createHarness();
    await h.member.initialize();
    const initial = h.member.getState().snapshot;
    if (initial?.phase !== "active") throw new Error("expected active member");
    h.member.handleProjectionClosed(closedBackpressure);
    const attach = createDeferred<typeof attachBaseline>();
    vi.mocked(h.commands.attachThreadProjection).mockReturnValueOnce(attach.promise);
    const pending = h.member.recoverProjection(initial.identity);
    h.member.dispose();
    attach.resolve(
      attachWithSnapshotThread(attachBaseline, attachBaseline.snapshot.thread, "late-recovery"),
    );
    await expect(pending).resolves.toEqual({ type: "unavailable" });
    expect(h.commands.detachThreadProjection).not.toHaveBeenCalled();
    expect(h.store.getState().threadRuntime.byThreadId[threadId]).toBeUndefined();
  });

  it("deduplicates recovery from synchronous pending listeners", async () => {
    const h = createHarness();
    await h.member.initialize();
    const initial = h.member.getState().snapshot;
    if (initial?.phase !== "active") throw new Error("expected active member");
    h.member.handleProjectionClosed(closedBackpressure);
    const nested: Promise<unknown>[] = [];
    const unsubscribe = h.member.subscribe(() => {
      const state = h.member.getState().snapshot;
      if (state?.phase === "projectionUnavailable" && state.recovery.pending)
        nested.push(h.member.recoverProjection(initial.identity));
    });
    const pending = h.member.recoverProjection(initial.identity);
    await expect(pending).resolves.toEqual({ type: "recovered" });
    expect(nested[0]).toBe(pending);
    expect(h.commands.attachThreadProjection).toHaveBeenCalledTimes(2);
    unsubscribe();
    h.member.dispose();
  });

  it("recovers the same live member after a failed attach and buffers the new subscription", async () => {
    const h = createHarness();
    await h.member.initialize();
    const initial = h.member.getState().snapshot;
    if (initial?.phase !== "active") throw new Error("expected active member");
    h.member.handleProjectionClosed(closedBackpressure);
    const failure = new Error("attach failed");
    vi.mocked(h.commands.attachThreadProjection).mockRejectedValueOnce(failure);
    await expect(h.member.recoverProjection(initial.identity)).resolves.toEqual({
      type: "failed",
      error: failure,
    });
    expect(h.member.getState().snapshot).toMatchObject({
      phase: "projectionUnavailable",
      recovery: { pending: false, error: failure },
    });
    const attach = createDeferred<typeof attachBaseline>();
    vi.mocked(h.commands.attachThreadProjection).mockReturnValueOnce(attach.promise);
    const pending = h.member.recoverProjection(initial.identity);
    expect(h.member.recoverProjection(initial.identity)).toBe(pending);
    expect(h.member.getState().snapshot).toMatchObject({
      recovery: { pending: true, error: failure },
    });
    const response = attachWithSnapshotThread(
      attachBaseline,
      attachBaseline.snapshot.thread,
      "recovered-subscription",
    );
    h.member.handleProjectionEvent(
      eventWithEnvelope(eventTurnStarted, { subscriptionId: response.subscriptionId }),
    );
    attach.resolve(response);
    await expect(pending).resolves.toEqual({ type: "recovered" });
    const recovered = h.member.getState().snapshot;
    expect(recovered).toMatchObject({
      phase: "active",
      identity: initial.identity,
      activeTurnId: "turn-in-progress",
      subscriptionId: response.subscriptionId,
    });
    if (recovered?.phase !== "active") throw new Error("expected recovered member");
    expect(recovered.composerRole).toBe(initial.composerRole);
    h.member.handleProjectionClosed(closedBackpressure);
    expect(h.member.getState().snapshot?.phase).toBe("active");
    expect(h.commands.detachThreadProjection).not.toHaveBeenCalled();
    h.member.dispose();
  });

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
    h.connection.revoke();
    expect(h.commands.detachThreadProjection).not.toHaveBeenCalled();
    attach.resolve(attachBaseline);
    await expect(pending).resolves.toMatchObject({
      type: "unavailable",
      failure: { type: "connectionLost" },
    });
    expect(h.commands.detachThreadProjection).toHaveBeenCalledTimes(1);
    expect(h.store.getState().threadRuntime.byThreadId[threadId]).toBeUndefined();
  });

  it("reports old-round compensation failure without detaching through a replacement connection", async () => {
    const h = createHarness();
    const attach = createDeferred<typeof attachBaseline>();
    const cleanupError = new Error("old connection cleanup failed");
    vi.mocked(h.commands.attachThreadProjection).mockReturnValueOnce(attach.promise);
    vi.mocked(h.commands.detachThreadProjection).mockRejectedValueOnce(cleanupError);
    const pending = h.member.initialize();
    await Promise.resolve();
    h.member.dispose();
    h.connection.revoke();
    const replacement = createGuiHostCommands({ loadedThreadIds: [threadId] });
    h.connection.replace(replacement);
    attach.resolve(attachBaseline);
    await expect(pending).resolves.toMatchObject({
      type: "unavailable",
      failure: { type: "connectionLost", cleanupError },
    });
    expect(h.commands.detachThreadProjection).toHaveBeenCalledTimes(1);
    expect(replacement.detachThreadProjection).not.toHaveBeenCalled();
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
