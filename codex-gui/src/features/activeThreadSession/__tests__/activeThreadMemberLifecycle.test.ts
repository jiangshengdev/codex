import { describe, expect, it, vi } from "vitest";
import type { UnknownAction } from "@reduxjs/toolkit";
import { makeStore, type AppDispatch } from "@/app/store";
import { createDeferred, createGuiHostCommands } from "@/__tests__/appBrowserTestSupport";
import { createPersistenceTestContext } from "@/features/composerInputQueue/__tests__/composerInputQueueCoordinatorTestFixtures";
import { composerCapture } from "@/features/composerInputQueue/__tests__/composerInputQueueTestFixtures";
import { GuiHostCommandError } from "@/features/guiHost/guiHostCommandGateway";
import {
  attachBaseline,
  closedBackpressure,
  eventTurnStarted,
  eventItemStarted,
  eventAgentMessageDelta,
} from "@/features/projection/__tests__/projectionFixtures";
import { createActiveThreadMemberLifecycle } from "../activeThreadMemberLifecycle";
import { createActiveThreadConnection } from "../activeThreadConnection";
import { selectThreadRuntimeRecord } from "@/features/threadRuntime/threadRuntimeSlice";
import {
  attachWithSnapshotThread,
  eventWithEnvelope,
  closedWithEnvelope,
  attachWithGoal,
  threadGoal,
  goalEvent,
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
  it.each([false, true])(
    "applies goals received during attach (recovery: %s)",
    async (recovery) => {
      const h = createHarness();
      if (recovery) await h.member.initialize();
      const initial = h.member.getState().snapshot;
      const response = attachWithGoal(
        attachWithSnapshotThread(attachBaseline, attachBaseline.snapshot.thread, "goal-attach"),
        threadGoal(threadId),
      );
      const attached = createDeferred<typeof response>();
      const started = createDeferred<undefined>();
      vi.mocked(h.commands.attachThreadProjection).mockImplementation(() => {
        started.resolve(undefined);
        return attached.promise;
      });
      if (recovery) {
        h.member.connectionUnavailable();
        h.connection.replace(h.commands);
      }
      const pending =
        recovery && initial?.phase === "active"
          ? h.member.recoverConnection(initial.identity)
          : h.member.initialize();
      await started.promise;
      h.member.handleProjectionEvent(
        goalEvent(
          response,
          "created-during-attach",
          response.snapshot.headCommitId,
          threadGoal(threadId, { objective: "New objective" }),
        ),
      );
      h.member.handleProjectionEvent(
        goalEvent(response, "cleared-during-attach", "created-during-attach", null),
      );
      attached.resolve(response);
      await pending;
      expect(selectThreadRuntimeRecord(h.store.getState(), threadId)).toMatchObject({ goal: null });
      h.member.handleProjectionEvent(
        goalEvent(attachBaseline, "stale-goal", null, threadGoal(threadId)),
      );
      for (const callback of h.frames.values()) callback();
      expect(selectThreadRuntimeRecord(h.store.getState(), threadId)).toMatchObject({ goal: null });
      h.member.dispose();
    },
  );

  it.each([true, false])("reads the goal when opening a task (loaded: %s)", async (loaded) => {
    const h = createHarness();
    const goal = threadGoal(threadId);
    vi.mocked(h.commands.listLoadedThreads).mockResolvedValue({
      data: loaded ? [threadId] : [],
      nextCursor: null,
    });
    vi.mocked(h.commands.attachThreadProjection).mockResolvedValue(
      attachWithGoal(attachBaseline, goal),
    );
    await h.member.initialize();
    expect(h.member.getState().phase).toBe("ready");
    expect(selectThreadRuntimeRecord(h.store.getState(), threadId)).toMatchObject({ goal });
    h.member.dispose();
  });

  it("opens a task without a goal", async () => {
    const h = createHarness();
    vi.mocked(h.commands.attachThreadProjection).mockResolvedValue(
      attachWithGoal(attachBaseline, null),
    );
    await h.member.initialize();
    expect(h.member.getState().phase).toBe("ready");
    expect(selectThreadRuntimeRecord(h.store.getState(), threadId)).toMatchObject({ goal: null });
    h.member.dispose();
  });

  it.each(["connection", "projection"] as const)(
    "refreshes the goal on %s recovery",
    async (mode) => {
      const h = createHarness();
      vi.mocked(h.commands.attachThreadProjection).mockResolvedValue(
        attachWithGoal(attachBaseline, threadGoal(threadId)),
      );
      await h.member.initialize();
      const initial = h.member.getState().snapshot;
      if (initial?.phase !== "active") throw new Error("expected active member");
      for (const goal of [
        threadGoal(threadId, { objective: "Changed while disconnected", status: "complete" }),
        null,
      ]) {
        vi.mocked(h.commands.attachThreadProjection).mockResolvedValue(
          attachWithGoal(attachBaseline, goal),
        );
        if (mode === "connection") {
          h.member.connectionUnavailable();
          h.connection.replace(h.commands);
        } else h.member.handleProjectionClosed(closedBackpressure);
        const result =
          mode === "connection"
            ? await h.member.recoverConnection(initial.identity)
            : await h.member.recoverProjection(initial.identity);
        expect(result).toEqual({ type: "recovered" });
        expect(selectThreadRuntimeRecord(h.store.getState(), threadId)).toMatchObject({ goal });
      }
      h.member.dispose();
    },
  );

  it("reports a required goal read failure instead of publishing an empty goal", async () => {
    const h = createHarness();
    const error = new Error("failed to read thread goal");
    vi.mocked(h.commands.attachThreadProjection).mockRejectedValue(error);
    await h.member.initialize();
    expect(h.member.getState()).toMatchObject({ phase: "failed", error });
    expect(selectThreadRuntimeRecord(h.store.getState(), threadId)).toBeNull();
    h.member.dispose();
  });

  it.each(["connection", "projection"] as const)(
    "keeps the retained goal and reports failure during %s recovery",
    async (mode) => {
      const h = createHarness();
      const goal = threadGoal(threadId);
      vi.mocked(h.commands.attachThreadProjection).mockResolvedValue(
        attachWithGoal(attachBaseline, goal),
      );
      await h.member.initialize();
      const initial = h.member.getState().snapshot;
      if (initial?.phase !== "active") throw new Error("expected active member");
      const error = new Error("failed to read thread goal");
      vi.mocked(h.commands.attachThreadProjection).mockRejectedValue(error);
      if (mode === "connection") {
        h.member.connectionUnavailable();
        h.connection.replace(h.commands);
      } else h.member.handleProjectionClosed(closedBackpressure);
      const result =
        mode === "connection"
          ? await h.member.recoverConnection(initial.identity)
          : await h.member.recoverProjection(initial.identity);
      expect(result).toMatchObject({ type: "failed", error });
      expect(selectThreadRuntimeRecord(h.store.getState(), threadId)).toMatchObject({ goal });
      h.member.dispose();
    },
  );

  it("stops recovery pagination at a later loaded match without resuming", async () => {
    const h = createHarness();
    await h.member.initialize();
    const before = h.member.getState().snapshot;
    if (before?.phase !== "active") throw new Error("expected active member");
    h.member.connectionUnavailable();
    const replacement = createGuiHostCommands({ loadedThreadIds: [threadId] });
    vi.mocked(replacement.listLoadedThreads)
      .mockResolvedValueOnce({ data: ["another-task"], nextCursor: "second" })
      .mockResolvedValueOnce({ data: [threadId], nextCursor: "unused" });
    h.connection.replace(replacement);

    await expect(h.member.recoverConnection(before.identity)).resolves.toEqual({
      type: "recovered",
    });
    expect(vi.mocked(replacement.listLoadedThreads).mock.calls).toEqual([
      [{}],
      [{ cursor: "second" }],
    ]);
    expect(replacement.resumeThread).not.toHaveBeenCalled();
    expect(replacement.attachThreadProjection).toHaveBeenCalledTimes(1);
  });

  it("abandons a stale recovery page without resuming or requesting another page", async () => {
    const h = createHarness();
    await h.member.initialize();
    const before = h.member.getState().snapshot;
    if (before?.phase !== "active") throw new Error("expected active member");
    h.member.connectionUnavailable();
    const replacement = createGuiHostCommands({ loadedThreadIds: [] });
    const secondPage = createDeferred<Awaited<ReturnType<typeof replacement.listLoadedThreads>>>();
    vi.mocked(replacement.listLoadedThreads)
      .mockResolvedValueOnce({ data: [], nextCursor: "second" })
      .mockReturnValueOnce(secondPage.promise);
    h.connection.replace(replacement);
    const pending = h.member.recoverConnection(before.identity);
    await vi.waitFor(() => {
      expect(replacement.listLoadedThreads).toHaveBeenCalledTimes(2);
    });
    h.connection.revoke();
    h.member.connectionUnavailable();
    secondPage.resolve({ data: [], nextCursor: "unused" });

    await expect(pending).resolves.toEqual({ type: "unavailable" });
    expect(replacement.listLoadedThreads).toHaveBeenCalledTimes(2);
    expect(replacement.resumeThread).not.toHaveBeenCalled();
    expect(replacement.attachThreadProjection).not.toHaveBeenCalled();
  });

  it("preserves unknown delivery and never sends it again when the connection recovers", async () => {
    const h = createHarness();
    await h.member.initialize();
    const before = h.member.getState().snapshot;
    if (before?.phase !== "active") throw new Error("expected active member");
    vi.mocked(h.commands.startTurn).mockRejectedValueOnce(
      new GuiHostCommandError({
        source: "unavailable",
        delivery: "deliveryUnknown",
        error: new Error("connection lost"),
      }),
    );
    before.composerRole.submit(before.revision, composerCapture("unknown delivery"));
    h.member.connectionUnavailable();
    await Promise.resolve();
    const replacement = createGuiHostCommands({ loadedThreadIds: [threadId] });
    h.connection.replace(replacement);
    await expect(h.member.recoverConnection(before.identity)).resolves.toEqual({
      type: "recovered",
    });
    expect(h.member.getState().snapshot).toMatchObject({
      connection: { phase: "available" },
      composer: { persistence: { unknownMessages: [{ text: "unknown delivery" }] } },
    });
    expect(replacement.startTurn).not.toHaveBeenCalled();
  });

  it("keeps a connection failure when the candidate subscription closes before attachment completes", async () => {
    const h = createHarness();
    await h.member.initialize();
    const before = h.member.getState().snapshot;
    if (before?.phase !== "active") throw new Error("expected active member");
    h.member.connectionUnavailable();
    const replacement = createGuiHostCommands({ loadedThreadIds: [threadId] });
    const attach = createDeferred<typeof attachBaseline>();
    vi.mocked(replacement.attachThreadProjection).mockReturnValueOnce(attach.promise);
    h.connection.replace(replacement);
    const pending = h.member.recoverConnection(before.identity);
    await vi.waitFor(() => {
      expect(replacement.attachThreadProjection).toHaveBeenCalledTimes(1);
    });
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
      subscriptionId: before.subscriptionId,
      connection: { phase: "unavailable", recovery: { pending: false } },
    });
    await expect(h.member.recoverConnection(before.identity)).resolves.toEqual({
      type: "recovered",
    });
  });

  it("abandons recovery when the replacement connection closes and can recover on the next round", async () => {
    const h = createHarness();
    await h.member.initialize();
    const before = h.member.getState().snapshot;
    if (before?.phase !== "active") throw new Error("expected active member");
    h.member.connectionUnavailable();
    const replacement = createGuiHostCommands({ loadedThreadIds: [threadId] });
    const attached = createDeferred<typeof attachBaseline>();
    vi.mocked(replacement.attachThreadProjection).mockReturnValueOnce(attached.promise);
    h.connection.replace(replacement);
    const pending = h.member.recoverConnection(before.identity);
    await vi.waitFor(() => {
      expect(replacement.attachThreadProjection).toHaveBeenCalledTimes(1);
    });
    h.connection.revoke();
    h.member.connectionUnavailable();
    attached.resolve(attachBaseline);
    await expect(pending).resolves.toEqual({ type: "unavailable" });
    expect(h.member.getState().snapshot).toMatchObject({
      connection: { phase: "unavailable", recovery: { pending: false } },
    });
    const next = createGuiHostCommands({ loadedThreadIds: [threadId] });
    h.connection.replace(next);
    await expect(h.member.recoverConnection(before.identity)).resolves.toEqual({
      type: "recovered",
    });
  });

  it("keeps a failed connection recovery retryable and resumes only after exhausting loaded pages", async () => {
    const h = createHarness();
    await h.member.initialize();
    const before = h.member.getState().snapshot;
    if (before?.phase !== "active") throw new Error("expected active member");
    h.member.connectionUnavailable();
    const replacement = createGuiHostCommands({ loadedThreadIds: [threadId] });
    const failed = new Error("loaded query failed");
    vi.mocked(replacement.listLoadedThreads).mockRejectedValueOnce(failed);
    h.connection.replace(replacement);
    await expect(h.member.recoverConnection(before.identity)).resolves.toEqual({
      type: "failed",
      error: failed,
    });
    expect(h.member.getState().snapshot).toMatchObject({
      subscriptionId: before.subscriptionId,
      connection: { phase: "unavailable", recovery: { pending: false, error: failed } },
    });
    expect(replacement.resumeThread).not.toHaveBeenCalled();
    expect(replacement.attachThreadProjection).not.toHaveBeenCalled();
    vi.mocked(replacement.listLoadedThreads)
      .mockResolvedValueOnce({ data: ["another-task"], nextCursor: "next-page" })
      .mockResolvedValueOnce({ data: [], nextCursor: null });
    const pending = h.member.recoverConnection(before.identity);
    expect(h.member.recoverConnection(before.identity)).toBe(pending);
    expect(h.member.getState().snapshot).toMatchObject({
      connection: { recovery: { pending: true, error: failed } },
    });
    await expect(pending).resolves.toEqual({ type: "recovered" });
    expect(replacement.listLoadedThreads).toHaveBeenLastCalledWith({ cursor: "next-page" });
    expect(replacement.resumeThread).toHaveBeenCalledTimes(1);
    expect(replacement.attachThreadProjection).toHaveBeenCalledTimes(1);
  });

  it("recovers a disconnected loaded member in place using replacement commands", async () => {
    const h = createHarness();
    await h.member.initialize();
    const before = h.member.getState().snapshot;
    if (before?.phase !== "active") throw new Error("expected active member");
    h.member.connectionUnavailable();
    const replacement = createGuiHostCommands({ loadedThreadIds: [threadId] });
    vi.mocked(replacement.attachThreadProjection).mockResolvedValue(
      attachWithSnapshotThread(
        attachBaseline,
        attachBaseline.snapshot.thread,
        "replacement-subscription",
      ),
    );
    h.connection.replace(replacement);
    await expect(h.member.recoverConnection(before.identity)).resolves.toEqual({
      type: "recovered",
    });
    const recovered = h.member.getState().snapshot;
    expect(recovered).toMatchObject({
      phase: "active",
      identity: before.identity,
      connection: { phase: "available" },
      subscriptionId: "replacement-subscription",
    });
    if (recovered?.phase !== "active") throw new Error("expected recovered member");
    expect(recovered.composerRole).toBe(before.composerRole);
    expect(replacement.resumeThread).not.toHaveBeenCalled();
    expect(replacement.listLoadedThreads).toHaveBeenCalledTimes(1);
    recovered.composerRole.submit(recovered.revision, composerCapture("new connection"));
    expect(replacement.startTurn).toHaveBeenCalledTimes(1);
    expect(h.commands.startTurn).not.toHaveBeenCalled();
  });

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
    await vi.waitFor(() => {
      expect(h.commands.attachThreadProjection).toHaveBeenCalledTimes(1);
    });
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
    await vi.waitFor(() => {
      expect(h.commands.attachThreadProjection).toHaveBeenCalledTimes(1);
    });
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
    await vi.waitFor(() => {
      expect(h.commands.attachThreadProjection).toHaveBeenCalledTimes(1);
    });
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
    await vi.waitFor(() => {
      expect(h.commands.attachThreadProjection).toHaveBeenCalledTimes(1);
    });
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
