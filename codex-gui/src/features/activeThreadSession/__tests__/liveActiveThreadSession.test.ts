import { describe, expect, it, vi } from "vitest";
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

const createHarness = () => {
  const store = makeStore();
  const listSkills = vi.fn<GuiHostCommands["listSkills"]>(() => new Promise(() => undefined));
  const compactThread = vi.fn<GuiHostCommands["compactThread"]>().mockResolvedValue({});
  const startTurn = vi.fn<GuiHostCommands["startTurn"]>(() => new Promise(() => undefined));
  const commands = {
    compactThread,
    listSkills,
    startTurn,
    steerTurn: vi.fn<GuiHostCommands["steerTurn"]>(() => new Promise(() => undefined)),
    interruptTurn: vi.fn<GuiHostCommands["interruptTurn"]>().mockResolvedValue({}),
  };
  const projection = createActiveThreadProjection({
    threadId: attachBaseline.snapshot.thread.id,
    attachResponse: attachBaseline,
  });
  const session = createLiveActiveThreadSession({
    sessionRevision: 1,
    attachResponse: attachBaseline,
    projection,
    commands,
    dispatch: store.dispatch,
  });
  return { commands, compactThread, listSkills, session, startTurn, store };
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
    expect(store.getState().threadRuntime.sessionRevision).toBe(2);
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

  it("invalidates a captured pending-edit closure when the session revision advances", () => {
    const { session } = createHarness();
    session.handleProjectionEvent(eventTurnStarted);
    session.submit(session.getSnapshot().revision, composerCapture("edit me"));
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
    const begun = session.beginPendingInputEdit(
      session.getSnapshot().revision,
      { key: page.items[0].key, revision: page.revision },
      () => ({ type: "restored" }),
    );
    if (begun.type !== "begun") throw new Error("expected a pending edit capability");
    const capabilityRevision = session.getSnapshot().revision;

    session.handleProjectionDelta(eventAgentMessageDelta);
    session.flushProjection();

    const unavailable = begun.reservation.save(composerCapture("changed"));
    expect(unavailable).toEqual({
      type: "unavailable",
      scope: "activeThreadSession",
      reason: "staleRevision",
      revision: session.getSnapshot().revision,
    });
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
      throw new Error("expected the original pending input after stale save cleanup");
    }
    expect(restoredPage.items[0]).toMatchObject({
      preview: { type: "text", text: "edit me", truncated: false },
    });
    expect(session.getReleaseReadiness()).toEqual({
      type: "blocked",
      blockers: [{ type: "ordinaryQueued", count: 1 }],
    });
    expect(begun.reservation.save(composerCapture("changed again"))).toEqual({
      type: "unavailable",
      scope: "activeThreadSession",
      reason: "staleRevision",
      revision: session.getSnapshot().revision,
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

  it("cleans up a stale pending-edit cancel callback only once", () => {
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
    session.handleProjectionDelta(eventAgentMessageDelta);
    session.flushProjection();

    expect(begun.reservation.cancel()).toMatchObject({
      type: "unavailable",
      scope: "activeThreadSession",
      reason: "staleRevision",
      revision: session.getSnapshot().revision,
    });
    const revisionAfterCleanup = session.getSnapshot().revision;
    expect(begun.reservation.cancel()).toEqual({
      type: "unavailable",
      scope: "activeThreadSession",
      reason: "staleRevision",
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
