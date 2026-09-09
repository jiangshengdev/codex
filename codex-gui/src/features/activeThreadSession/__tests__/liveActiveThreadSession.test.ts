import { describe, expect, it, vi } from "vitest";
import { createPersistenceTestContext } from "@/features/composerInputQueue/__tests__/composerInputQueueCoordinatorTestFixtures";
import { createDeferred } from "@/__tests__/testDeferred";
import { makeStore } from "@/app/store";
import { composerCapture } from "@/features/composerInputQueue/__tests__/composerInputQueueTestFixtures";
import type { GuiHostCommands } from "@/features/guiHost/guiHostClient";
import { GuiHostCommandError } from "@/features/guiHost/guiHostCommandGateway";
import {
  attachBaseline,
  closedBackpressure,
  eventAgentMessageDelta,
  eventItemCompleted,
  eventItemStarted,
  eventTurnCompleted,
  eventTurnStarted,
} from "@/features/projection/__tests__/projectionFixtures";
import {
  baseTurn,
  attachWithSnapshotThread,
  contextCompaction,
  contextCompactionCompleted,
  eventWithEnvelope,
  inProgressTurn,
  itemStarted,
  turnCompleted,
  turnStarted,
  turnWithStatus,
} from "@/features/projection/__tests__/projectionTestBuilders";
import { createActiveThreadProjection } from "../activeThreadProjection";
import { createLiveActiveThreadSession } from "../liveActiveThreadSession";
import { createActiveThreadSessionIdentity } from "../activeThreadSessionIdentity";
import { activeThreadReadModelSlotCreated } from "../activeThreadSessionReadModel";

const createHarness = (persistence = createPersistenceTestContext()) => {
  const store = makeStore();
  const listSkills = vi.fn<GuiHostCommands["listSkills"]>(() => new Promise(() => undefined));
  const compactThread = vi.fn<GuiHostCommands["compactThread"]>().mockResolvedValue({});
  const readThread = vi
    .fn<GuiHostCommands["readThread"]>()
    .mockResolvedValue({ thread: attachBaseline.snapshot.thread });
  const startTurn = vi.fn<GuiHostCommands["startTurn"]>(() => new Promise(() => undefined));
  const commands = {
    compactThread,
    listSkills,
    readThread,
    startTurn,
    steerTurn: vi.fn<GuiHostCommands["steerTurn"]>(() => new Promise(() => undefined)),
    interruptTurn: vi.fn<GuiHostCommands["interruptTurn"]>().mockResolvedValue({}),
  };
  const projection = createActiveThreadProjection({
    threadId: attachBaseline.snapshot.thread.id,
    attachResponse: attachBaseline,
  });
  const identity = createActiveThreadSessionIdentity(attachBaseline.snapshot.thread.id);
  store.dispatch(activeThreadReadModelSlotCreated(identity));
  const session = createLiveActiveThreadSession({
    identity,
    sessionRevision: 1,
    attachResponse: attachBaseline,
    projection,
    commands,
    dispatch: store.dispatch,
    persistence,
  });
  return { commands, compactThread, listSkills, readThread, session, startTurn, store };
};

const compactTurnId = "compact-turn";
const compactItemId = "compact-item";
const compactTurnStarted = turnStarted(
  eventTurnStarted,
  "compact-turn-started",
  inProgressTurn(compactTurnId),
);
const compactItemStarted = eventWithEnvelope(
  itemStarted(
    eventItemStarted,
    "compact-item-started",
    compactTurnId,
    contextCompaction(compactItemId),
  ),
  { parentCommitId: compactTurnStarted.commitId },
);
const compactItemCompleted = eventWithEnvelope(
  contextCompactionCompleted(
    eventItemCompleted,
    "compact-item-completed",
    compactTurnId,
    compactItemId,
  ),
  { parentCommitId: compactItemStarted.commitId },
);
const compactTurnCompleted = eventWithEnvelope(
  turnCompleted(eventTurnCompleted, "compact-turn-completed", baseTurn(compactTurnId)),
  { parentCommitId: compactTurnStarted.commitId },
);

const commandError = (delivery: "definitelyNotAccepted" | "deliveryUnknown", message: string) =>
  new GuiHostCommandError({ source: "rpc", delivery, error: new Error(message) });

describe("LiveActiveThreadSession", () => {
  it("keeps external owners and the old transcript unchanged when recovery cannot be saved", () => {
    const persistence = createPersistenceTestContext();
    const h = createHarness(persistence);
    h.session.handleProjectionEvent(eventTurnStarted);
    h.session.handleProjectionClosed(closedBackpressure);
    const old = h.session.getSnapshot();
    const previousTranscript =
      h.store.getState().transcriptState.byThreadId[h.session.identity.threadId]?.transcript;
    const storage = persistence.storage;
    if (storage == null) throw new Error("expected storage");
    const write = vi.spyOn(storage, "setItem").mockImplementation(() => {
      throw new Error("full");
    });
    const response = attachWithSnapshotThread(
      attachBaseline,
      attachBaseline.snapshot.thread,
      "saved-recovery",
    );
    h.session.beginProjectionRecovery();
    expect(
      h.session.commitProjectionRecovery(
        response,
        createActiveThreadProjection({
          threadId: h.session.identity.threadId,
          attachResponse: response,
        }),
        () => true,
      ),
    ).toMatchObject({ type: "blocked" });
    expect(h.session.getSnapshot()).toMatchObject({
      phase: "projectionUnavailable",
      activeTurnId: "turn-in-progress",
      subscriptionId: attachBaseline.subscriptionId,
      recovery: { pending: false },
    });
    const currentTranscript =
      h.store.getState().transcriptState.byThreadId[h.session.identity.threadId]?.transcript;
    expect(currentTranscript).toEqual({
      ...previousTranscript,
      sessionRevision: h.session.getSnapshot().revision,
    });
    const failed = h.session.getSnapshot();
    if (old.phase !== "projectionUnavailable" || failed.phase !== "projectionUnavailable")
      throw new Error("expected paused snapshots");
    expect(failed.threadStatus).toEqual(old.threadStatus);
    expect(failed.compaction).toEqual(old.compaction);
    write.mockRestore();
    h.session.beginProjectionRecovery();
    expect(
      h.session.commitProjectionRecovery(
        response,
        createActiveThreadProjection({
          threadId: h.session.identity.threadId,
          attachResponse: response,
        }),
        () => true,
      ),
    ).toEqual({ type: "recovered" });
    expect(h.session.getSnapshot()).toMatchObject({ phase: "active", activeTurnId: null });
    h.session.dispose();
  });

  it("owns the attach status baseline and publishes authoritative refresh changes", async () => {
    const h = createHarness();
    const initial = h.session.getSnapshot();
    if (initial.phase !== "active") throw new Error("expected an active session");
    expect(initial.threadStatus).toEqual(attachBaseline.snapshot.thread.status);
    const listener = vi.fn<() => void>();
    h.session.subscribe(listener);
    h.readThread.mockResolvedValueOnce({
      thread: { ...attachBaseline.snapshot.thread, status: { type: "systemError" } },
    });

    h.session.invalidateThreadStatus();
    await h.session.settleThreadStatusInvalidations();

    const refreshed = h.session.getSnapshot();
    expect(refreshed).toMatchObject({ threadStatus: { type: "systemError" } });
    expect(refreshed.revision).toBe(initial.revision + 1);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("gates compaction by revision, active turn, queue readiness, and one in-flight claim", async () => {
    const h = createHarness();
    const initial = h.session.getSnapshot();
    if (initial.phase !== "active") throw new Error("expected an active session");

    expect(h.session.requestCompaction(initial.revision - 1)).toMatchObject({
      type: "unavailable",
      reason: "staleRevision",
    });
    const handoff = h.session.reserveRelease(initial.revision);
    if (handoff.type !== "reserved") throw new Error("expected a release reservation");
    expect(h.session.requestCompaction(initial.revision)).toEqual({
      type: "blocked",
      blockers: [{ type: "releaseReserved" }],
    });
    expect(handoff.reservation.release()).toEqual({ type: "released" });

    expect(h.session.requestCompaction(initial.revision)).toEqual({ type: "accepted" });
    const pending = h.session.getSnapshot();
    if (pending.phase !== "active") throw new Error("expected an active session");
    expect(pending.compaction).toEqual({
      phase: "requestPending",
      canRequest: false,
      startFailure: null,
    });
    expect(h.session.requestCompaction(pending.revision)).toEqual({
      type: "rejected",
      reason: "operationInProgress",
    });
    expect(h.session.submit(pending.revision, composerCapture("blocked by compact"))).toEqual({
      type: "rejected",
      reason: "releaseReserved",
    });
    expect(h.compactThread).toHaveBeenCalledExactlyOnceWith({
      threadId: attachBaseline.snapshot.thread.id,
    });
    await Promise.resolve();
    expect(h.session.getSnapshot()).toBe(pending);

    const activeHarness = createHarness();
    activeHarness.session.handleProjectionEvent(eventTurnStarted);
    const active = activeHarness.session.getSnapshot();
    expect(activeHarness.session.requestCompaction(active.revision)).toEqual({
      type: "rejected",
      reason: "activeTurn",
    });
    expect(activeHarness.compactThread).not.toHaveBeenCalled();
  });

  it("publishes the candidate turn and releases the child reservation in one transition", () => {
    const h = createHarness();
    h.session.requestCompaction(h.session.getSnapshot().revision);
    const pendingRevision = h.session.getSnapshot().revision;
    const listener = vi.fn<() => void>();
    h.session.subscribe(listener);

    expect(h.session.handleProjectionEvent(compactTurnStarted)).toEqual({ type: "accepted" });

    const started = h.session.getSnapshot();
    if (started.phase !== "active") throw new Error("expected an active session");
    expect(started.revision).toBe(pendingRevision + 1);
    expect(started.activeTurnId).toBe(compactTurnId);
    expect(started.compaction.phase).toBe("requestPending");
    expect(h.session.getReleaseReadiness()).toEqual({ type: "safe" });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("keeps acknowledgement separate from lifecycle and supports event-before-ack", async () => {
    const h = createHarness();
    const response = createDeferred<undefined>();
    h.compactThread.mockReturnValue(response.promise.then(() => ({})));
    h.session.requestCompaction(h.session.getSnapshot().revision);

    h.session.handleProjectionEvent(compactTurnStarted);
    h.session.handleProjectionEvent(compactItemStarted);
    let running = h.session.getSnapshot();
    if (running.phase !== "active") throw new Error("expected an active session");
    expect(running.compaction).toEqual({
      phase: "running",
      canRequest: false,
      startFailure: null,
    });

    response.resolve(undefined);
    await response.promise;
    await Promise.resolve();
    expect(h.session.getSnapshot()).toBe(running);

    h.session.handleProjectionEvent(compactItemCompleted);
    running = h.session.getSnapshot();
    if (running.phase !== "active") throw new Error("expected an active session");
    expect(running.compaction).toEqual({ phase: "idle", canRequest: false, startFailure: null });
  });

  it("tracks automatic compaction and clears matching failed or interrupted turns", () => {
    for (const terminalStatus of ["failed", "interrupted"] as const) {
      const h = createHarness();
      h.session.handleProjectionEvent(compactTurnStarted);
      h.session.handleProjectionEvent(compactItemStarted);
      const running = h.session.getSnapshot();
      if (running.phase !== "active") throw new Error("expected an active session");
      expect(running.compaction.phase).toBe("running");

      h.session.handleProjectionEvent(
        eventWithEnvelope(
          turnCompleted(
            eventTurnCompleted,
            `compact-${terminalStatus}`,
            turnWithStatus(baseTurn(compactTurnId), terminalStatus),
          ),
          { parentCommitId: compactItemStarted.commitId },
        ),
      );
      const terminal = h.session.getSnapshot();
      if (terminal.phase !== "active") throw new Error("expected an active session");
      expect(terminal.compaction).toEqual({
        phase: "idle",
        canRequest: true,
        startFailure: null,
      });
    }

    const beforeItem = createHarness();
    beforeItem.session.requestCompaction(beforeItem.session.getSnapshot().revision);
    beforeItem.session.handleProjectionEvent(compactTurnStarted);
    beforeItem.session.handleProjectionEvent(compactTurnCompleted);
    const terminal = beforeItem.session.getSnapshot();
    if (terminal.phase !== "active") throw new Error("expected an active session");
    expect(terminal.compaction).toEqual({ phase: "idle", canRequest: true, startFailure: null });
  });

  it("distinguishes definite rejection from unknown delivery", async () => {
    const rejected = createHarness();
    rejected.compactThread.mockRejectedValue(
      commandError("definitelyNotAccepted", "compaction rejected"),
    );
    rejected.session.requestCompaction(rejected.session.getSnapshot().revision);
    await Promise.resolve();
    const rejectedSnapshot = rejected.session.getSnapshot();
    if (rejectedSnapshot.phase !== "active") throw new Error("expected an active session");
    expect(rejectedSnapshot.compaction).toEqual({
      phase: "idle",
      canRequest: true,
      startFailure: "compaction rejected",
    });

    const unknown = createHarness();
    unknown.compactThread.mockRejectedValue(commandError("deliveryUnknown", "connection lost"));
    unknown.session.requestCompaction(unknown.session.getSnapshot().revision);
    await Promise.resolve();
    const unknownSnapshot = unknown.session.getSnapshot();
    if (unknownSnapshot.phase !== "active") throw new Error("expected an active session");
    expect(unknownSnapshot.compaction).toEqual({
      phase: "deliveryUnknown",
      canRequest: false,
      startFailure: null,
    });

    const unexpected = createHarness();
    unexpected.compactThread.mockRejectedValue(new Error("unexpected transport failure"));
    unexpected.session.requestCompaction(unexpected.session.getSnapshot().revision);
    await Promise.resolve();
    const unexpectedSnapshot = unexpected.session.getSnapshot();
    if (unexpectedSnapshot.phase !== "active") throw new Error("expected an active session");
    expect(unexpectedSnapshot.compaction.phase).toBe("deliveryUnknown");
  });

  it("retains the last start failure during retry and unknown delivery until canonical start", async () => {
    const h = createHarness();
    h.compactThread.mockRejectedValueOnce(commandError("definitelyNotAccepted", "first failure"));
    h.session.requestCompaction(h.session.getSnapshot().revision);
    await Promise.resolve();

    const response = createDeferred<undefined>();
    h.compactThread.mockReturnValue(response.promise.then(() => ({})));
    h.session.requestCompaction(h.session.getSnapshot().revision);
    expect(h.session.getSnapshot()).toMatchObject({
      compaction: { phase: "requestPending", canRequest: false, startFailure: "first failure" },
    });
    expect(h.session.requestCompaction(h.session.getSnapshot().revision)).toEqual({
      type: "rejected",
      reason: "operationInProgress",
    });
    expect(h.compactThread).toHaveBeenCalledTimes(2);

    response.reject(commandError("deliveryUnknown", "connection lost"));
    await response.promise.catch(() => undefined);
    await Promise.resolve();
    expect(h.session.getSnapshot()).toMatchObject({
      compaction: { phase: "deliveryUnknown", canRequest: false, startFailure: "first failure" },
    });
    h.session.handleProjectionEvent(compactTurnStarted);
    h.session.handleProjectionEvent(compactItemStarted);
    expect(h.session.getSnapshot()).toMatchObject({
      compaction: { phase: "running", canRequest: false, startFailure: null },
    });
  });

  it("invalidates pending compaction callbacks on projection loss and dispose", async () => {
    for (const terminate of ["projection", "dispose"] as const) {
      const h = createHarness();
      const response = createDeferred<undefined>();
      h.compactThread.mockReturnValue(response.promise.then(() => ({})));
      h.session.requestCompaction(h.session.getSnapshot().revision);
      if (terminate === "projection") h.session.handleProjectionClosed(closedBackpressure);
      else h.session.dispose();
      const terminated = h.session.getSnapshot();

      response.resolve(undefined);
      await response.promise;
      await Promise.resolve();
      expect(h.session.getSnapshot()).toBe(terminated);
    }
  });

  it("fans an accepted turn fact into queue, Redux, and one session revision", () => {
    const { session, store } = createHarness();
    const revisions: number[] = [];
    session.subscribe(() => revisions.push(session.getSnapshot().revision));

    expect(session.handleProjectionEvent(eventTurnStarted)).toEqual({ type: "accepted" });

    const snapshot = session.getSnapshot();
    if (snapshot.phase !== "active" || eventTurnStarted.event.type !== "turnStarted") {
      throw new Error("expected an active session and turnStarted fixture");
    }
    expect(snapshot.revision).toBe(2);
    expect(snapshot.activeTurnId).toBe(eventTurnStarted.event.notification.turn.id);
    expect(snapshot.composer.canStop).toBe(true);
    expect(store.getState().threadRuntime.byThreadId[snapshot.threadId]?.sessionRevision).toBe(2);
    expect(revisions).toEqual([2]);
  });

  it("publishes queue capability transitions and rejects a stale caller before the child", () => {
    const { session, startTurn } = createHarness();
    const revision = session.getSnapshot().revision;

    expect(session.submit(revision, composerCapture("first"))).toEqual({ type: "accepted" });
    const nextRevision = session.getSnapshot().revision;
    expect(nextRevision).toBeGreaterThan(revision);
    expect(session.submit(revision, composerCapture("stale"))).toEqual({
      type: "unavailable",
      scope: "activeThreadSession",
      reason: "staleRevision",
      revision: nextRevision,
    });
    expect(startTurn).toHaveBeenCalledTimes(1);
  });

  it("does not publish rejected or no-op queue mutations", () => {
    const { session, startTurn } = createHarness();
    const revision = session.getSnapshot().revision;
    const listener = vi.fn<() => void>();
    session.subscribe(listener);

    expect(session.submit(revision, composerCapture(""))).toEqual({
      type: "rejected",
      reason: "invalidInput",
    });
    expect(session.promoteOrdinaryFrontToSteer(revision)).toBe(false);

    expect(session.getSnapshot().revision).toBe(revision);
    expect(listener).not.toHaveBeenCalled();
    expect(startTurn).not.toHaveBeenCalled();
  });

  it("forwards unknown removal with both revisions and publishes the committed composer snapshot", async () => {
    const h = createHarness();
    h.startTurn.mockRejectedValueOnce(commandError("deliveryUnknown", "lost response"));
    h.session.submit(h.session.getSnapshot().revision, composerCapture("unknown message"));
    await Promise.resolve();
    const before = h.session.getSnapshot();
    if (before.phase !== "active") throw new Error("expected an active session");
    const persistence = before.composer.persistence;
    const message = persistence.unknownMessages[0];
    if (message == null) throw new Error("expected unknown message");
    const listener = vi.fn<() => void>();
    h.session.subscribe(listener);

    expect(
      h.session.discardUnknown(before.revision, message.id, (persistence.revision ?? 0) - 1),
    ).toBe(false);
    expect(h.session.getSnapshot()).toBe(before);
    expect(listener).not.toHaveBeenCalled();
    expect(h.session.discardUnknown(before.revision, message.id, persistence.revision)).toBe(true);

    const after = h.session.getSnapshot();
    if (after.phase !== "active") throw new Error("expected an active session");
    expect(after.revision).toBeGreaterThan(before.revision);
    expect(after.composer.persistence).toMatchObject({
      error: null,
      unknownMessages: [],
      revision: null,
    });
    expect(listener).toHaveBeenCalledOnce();
    expect(
      h.session.discardUnknown(before.revision, message.id, persistence.revision),
    ).toMatchObject({ type: "unavailable", reason: "staleRevision" });
    expect(h.startTurn).toHaveBeenCalledOnce();
  });

  it("aborts a synchronous release handoff without changing the public session", () => {
    const { session } = createHarness();
    const snapshot = session.getSnapshot();
    const listener = vi.fn<() => void>();
    session.subscribe(listener);

    const reserved = session.reserveRelease(snapshot.revision);
    if (reserved.type !== "reserved") throw new Error("expected a release reservation");
    expect(session.getSnapshot()).toBe(snapshot);
    expect(listener).not.toHaveBeenCalled();
    expect(session.submit(snapshot.revision, composerCapture("blocked"))).toEqual({
      type: "rejected",
      reason: "releaseReserved",
    });
    expect(session.reserveRelease(snapshot.revision)).toEqual({
      type: "blocked",
      blockers: [{ type: "releaseReserved" }],
    });

    expect(reserved.reservation.release()).toEqual({ type: "released" });
    expect(session.getSnapshot()).toBe(snapshot);
    expect(session.getSnapshot().revision).toBe(snapshot.revision);
    expect(listener).not.toHaveBeenCalled();
    expect(session.getReleaseReadiness()).toEqual({ type: "safe" });
  });

  it("commits a synchronous release handoff without publishing its frozen state", () => {
    const { session } = createHarness();
    const snapshot = session.getSnapshot();
    const listener = vi.fn<() => void>();
    session.subscribe(listener);

    const reserved = session.reserveRelease(snapshot.revision);
    if (reserved.type !== "reserved") throw new Error("expected a release reservation");
    expect(reserved.reservation.commit()).toEqual({ type: "committed" });

    expect(session.getSnapshot()).toBe(snapshot);
    expect(session.getSnapshot().revision).toBe(snapshot.revision);
    expect(listener).not.toHaveBeenCalled();
    expect(session.getReleaseReadiness()).toEqual({
      type: "blocked",
      blockers: [{ type: "releaseReserved" }],
    });
  });

  it("rejects release commit after a child transition and releases its reservation without restoring stale state", async () => {
    const h = createHarness();
    const snapshot = h.session.getSnapshot();
    const reserved = h.session.reserveRelease(snapshot.revision);
    if (reserved.type !== "reserved") throw new Error("expected reservation");
    h.readThread.mockResolvedValueOnce({
      thread: { ...attachBaseline.snapshot.thread, status: { type: "active", activeFlags: [] } },
    });
    h.session.invalidateThreadStatus();
    await h.session.settleThreadStatusInvalidations();
    expect(reserved.reservation.commit()).toMatchObject({ type: "unavailable" });
    expect(reserved.reservation.release()).toEqual({ type: "released" });
    expect(h.session.getSnapshot()).toMatchObject({ threadStatus: { type: "active" } });
    expect(h.session.getReleaseReadiness()).toEqual({ type: "safe" });
    expect(
      h.session.submit(h.session.getSnapshot().revision, composerCapture("after aborted release")),
    ).toEqual({ type: "accepted" });
  });

  it("rejects settled and disposed release handoff closures", () => {
    const releasedHarness = createHarness();
    const releasedRevision = releasedHarness.session.getSnapshot().revision;
    const released = releasedHarness.session.reserveRelease(releasedRevision);
    if (released.type !== "reserved") throw new Error("expected a release reservation");
    expect(released.reservation.release()).toEqual({ type: "released" });
    expect(released.reservation.commit()).toEqual({
      type: "unavailable",
      scope: "activeThreadSession",
      reason: "staleRevision",
      revision: releasedRevision,
    });

    const disposedHarness = createHarness();
    const disposedRevision = disposedHarness.session.getSnapshot().revision;
    const disposed = disposedHarness.session.reserveRelease(disposedRevision);
    if (disposed.type !== "reserved") throw new Error("expected a release reservation");
    disposedHarness.session.dispose();
    expect(disposed.reservation.release()).toEqual({
      type: "unavailable",
      scope: "activeThreadSession",
      reason: "disposed",
      revision: disposedRevision + 1,
    });
  });

  it("saves a pending edit in place after ordinary projection updates", () => {
    const { session } = createHarness();
    session.handleProjectionEvent(eventTurnStarted);
    session.submit(session.getSnapshot().revision, composerCapture("edit me"));
    session.submit(session.getSnapshot().revision, composerCapture("after me"));
    const snapshot = session.getSnapshot();
    if (snapshot.phase !== "active") throw new Error("expected an active session");
    const page = session.readPendingInputPage({
      lane: "ordinary",
      revision: snapshot.composer.detailRevision,
      cursor: null,
      limit: 10,
    });
    if (page.type !== "page" || page.items[0] == null) {
      throw new Error("expected one pending ordinary input");
    }
    const restore = vi.fn<() => { type: "restored" }>(() => ({ type: "restored" }));
    expect(
      session.beginPendingInputEdit(
        snapshot.revision - 1,
        { key: page.items[0].key, revision: page.revision },
        restore,
      ),
    ).toEqual({
      type: "unavailable",
      scope: "activeThreadSession",
      reason: "staleRevision",
      revision: snapshot.revision,
    });
    expect(restore).not.toHaveBeenCalled();
    const begun = session.beginPendingInputEdit(
      session.getSnapshot().revision,
      { key: page.items[0].key, revision: page.revision },
      restore,
    );
    if (begun.type !== "begun") throw new Error("expected a pending edit capability");
    const capabilityRevision = session.getSnapshot().revision;

    session.handleProjectionDelta(eventAgentMessageDelta);
    session.flushProjection();

    expect(session.getSnapshot().revision).toBe(capabilityRevision + 1);
    expect(begun.reservation.save(composerCapture("changed"))).toMatchObject({ type: "saved" });
    expect(session.getSnapshot().revision).toBe(capabilityRevision + 2);
    const restoredSnapshot = session.getSnapshot();
    if (restoredSnapshot.phase !== "active") throw new Error("expected an active session");
    const restoredPage = session.readPendingInputPage({
      lane: "ordinary",
      revision: restoredSnapshot.composer.detailRevision,
      cursor: null,
      limit: 10,
    });
    if (restoredPage.type !== "page" || restoredPage.items[0] == null) {
      throw new Error("expected the saved pending input");
    }
    expect(restoredPage.items.map(({ key }) => key)).toEqual(page.items.map(({ key }) => key));
    expect(restoredPage.items).toMatchObject([
      { preview: { type: "text", text: "changed", truncated: false } },
      { preview: { type: "text", text: "after me", truncated: false } },
    ]);
    expect(session.getReleaseReadiness()).toEqual({
      type: "blocked",
      blockers: [{ type: "ordinaryQueued", count: 2 }],
    });
    expect(begun.reservation.save(composerCapture("changed again"))).toMatchObject({
      type: "unavailable",
      scope: "liveOwner",
      reason: "sessionInvalidated",
    });
    session.dispose();
    const disposedRevision = session.getSnapshot().revision;
    expect(begun.reservation.save(composerCapture("after dispose"))).toEqual({
      type: "unavailable",
      scope: "activeThreadSession",
      reason: "disposed",
      revision: disposedRevision,
    });
    expect(begun.reservation.cancel()).toEqual({
      type: "unavailable",
      scope: "activeThreadSession",
      reason: "disposed",
      revision: disposedRevision,
    });
  });

  it("rejects an outstanding pending edit after session disposal without publishing again", () => {
    const { session } = createHarness();
    session.handleProjectionEvent(eventTurnStarted);
    session.submit(session.getSnapshot().revision, composerCapture("keep me"));
    const active = session.getSnapshot();
    if (active.phase !== "active") throw new Error("expected an active session");
    const page = session.readPendingInputPage({
      lane: "ordinary",
      revision: active.composer.detailRevision,
      cursor: null,
      limit: 10,
    });
    if (page.type !== "page" || page.items[0] == null) throw new Error("expected pending input");
    const begun = session.beginPendingInputEdit(
      active.revision,
      { key: page.items[0].key, revision: page.revision },
      () => ({ type: "restored" }),
    );
    if (begun.type !== "begun") throw new Error("expected pending edit capability");
    const listener = vi.fn<() => void>();
    session.subscribe(listener);

    session.dispose();
    const disposed = session.getSnapshot();
    expect(listener).toHaveBeenCalledTimes(1);
    const unavailable = {
      type: "unavailable",
      scope: "activeThreadSession",
      reason: "disposed",
      revision: disposed.revision,
    };
    expect(begun.reservation.save(composerCapture("late save"))).toEqual(unavailable);
    expect(begun.reservation.cancel()).toEqual(unavailable);
    expect(begun.reservation.save(composerCapture("another late save"))).toEqual(unavailable);
    expect(session.getSnapshot()).toBe(disposed);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("cleans up a pending edit when projection becomes unavailable", () => {
    const { session } = createHarness();
    session.handleProjectionEvent(eventTurnStarted);
    session.submit(session.getSnapshot().revision, composerCapture("keep me"));
    const active = session.getSnapshot();
    if (active.phase !== "active") throw new Error("expected an active session");
    const page = session.readPendingInputPage({
      lane: "ordinary",
      revision: active.composer.detailRevision,
      cursor: null,
      limit: 10,
    });
    if (page.type !== "page" || page.items[0] == null) throw new Error("expected pending input");
    const begun = session.beginPendingInputEdit(
      active.revision,
      { key: page.items[0].key, revision: page.revision },
      () => ({ type: "restored" }),
    );
    if (begun.type !== "begun") throw new Error("expected pending edit capability");

    session.handleProjectionClosed(closedBackpressure);
    const unavailable = begun.reservation.save(composerCapture("do not save"));

    expect(unavailable).toEqual({
      type: "unavailable",
      scope: "activeThreadSession",
      reason: "projectionUnavailable",
      revision: session.getSnapshot().revision,
    });
    const revisionAfterCleanup = session.getSnapshot().revision;
    expect(begun.reservation.cancel()).toEqual({
      type: "unavailable",
      scope: "activeThreadSession",
      reason: "projectionUnavailable",
      revision: revisionAfterCleanup,
    });
    expect(session.getSnapshot().revision).toBe(revisionAfterCleanup);
    const snapshot = session.getSnapshot();
    if (snapshot.phase !== "projectionUnavailable") {
      throw new Error("expected projectionUnavailable");
    }
    const restoredPage = session.readPendingInputPage({
      lane: "ordinary",
      revision: snapshot.composer.detailRevision,
      cursor: null,
      limit: 10,
    });
    if (restoredPage.type !== "page" || restoredPage.items[0] == null) {
      throw new Error("expected restored input");
    }
    expect(restoredPage.items[0]).toMatchObject({
      preview: { type: "text", text: "keep me", truncated: false },
    });
    expect(session.getReleaseReadiness()).toEqual({
      type: "blocked",
      blockers: [{ type: "ordinaryQueued", count: 1 }],
    });
  });

  it("cleans up a projection-unavailable pending-edit cancel callback only once", () => {
    const { session } = createHarness();
    session.handleProjectionEvent(eventTurnStarted);
    session.submit(session.getSnapshot().revision, composerCapture("cancel me"));
    const active = session.getSnapshot();
    if (active.phase !== "active") throw new Error("expected an active session");
    const page = session.readPendingInputPage({
      lane: "ordinary",
      revision: active.composer.detailRevision,
      cursor: null,
      limit: 10,
    });
    if (page.type !== "page" || page.items[0] == null) throw new Error("expected pending input");
    const begun = session.beginPendingInputEdit(
      active.revision,
      { key: page.items[0].key, revision: page.revision },
      () => ({ type: "restored" }),
    );
    if (begun.type !== "begun") throw new Error("expected pending edit capability");
    session.handleProjectionClosed(closedBackpressure);

    expect(begun.reservation.cancel()).toMatchObject({
      type: "unavailable",
      scope: "activeThreadSession",
      reason: "projectionUnavailable",
      revision: session.getSnapshot().revision,
    });
    const revisionAfterCleanup = session.getSnapshot().revision;
    expect(begun.reservation.cancel()).toEqual({
      type: "unavailable",
      scope: "activeThreadSession",
      reason: "projectionUnavailable",
      revision: revisionAfterCleanup,
    });
    expect(session.getSnapshot().revision).toBe(revisionAfterCleanup);
    expect(session.getReleaseReadiness()).toEqual({
      type: "blocked",
      blockers: [{ type: "ordinaryQueued", count: 1 }],
    });
  });

  it("keeps child views but rejects skills commands after projection becomes unavailable", () => {
    const { listSkills, session } = createHarness();
    const activeSnapshot = session.getSnapshot();
    if (activeSnapshot.phase !== "active") throw new Error("expected an active session");
    const skillsBefore = activeSnapshot.skills;

    session.handleProjectionClosed(closedBackpressure);

    const snapshot = session.getSnapshot();
    if (snapshot.phase !== "projectionUnavailable") {
      throw new Error("expected projectionUnavailable");
    }
    expect(snapshot.skills).toBe(skillsBefore);
    for (const result of [
      session.retrySkills(snapshot.revision),
      session.refreshSkills(snapshot.revision),
      session.invalidateSkills(snapshot.revision),
    ]) {
      expect(result).toEqual({
        type: "unavailable",
        scope: "activeThreadSession",
        reason: "projectionUnavailable",
        revision: snapshot.revision,
      });
    }
    expect(listSkills).toHaveBeenCalledTimes(1);
  });

  it("disposes child subscriptions and permanently rejects captured capabilities", () => {
    const { session } = createHarness();
    const revision = session.getSnapshot().revision;
    const listener = vi.fn<() => void>();
    session.subscribe(listener);

    session.dispose();
    session.dispose();

    expect(session.getSnapshot()).toEqual({ phase: "disposed", revision: revision + 1 });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(session.submit(revision, composerCapture("late"))).toEqual({
      type: "unavailable",
      scope: "activeThreadSession",
      reason: "disposed",
      revision: revision + 1,
    });
  });
});
