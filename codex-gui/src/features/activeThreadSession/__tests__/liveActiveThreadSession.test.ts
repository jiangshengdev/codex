import { describe, expect, it, vi } from "vitest";
import { makeStore } from "@/app/store";
import { composerCapture } from "@/features/composerInputQueue/__tests__/composerInputQueueTestFixtures";
import type { GuiHostCommands } from "@/features/guiHost/guiHostClient";
import {
  attachBaseline,
  closedBackpressure,
  eventAgentMessageDelta,
  eventTurnStarted,
} from "@/features/projection/__tests__/projectionFixtures";
import { createActiveThreadProjection } from "../activeThreadProjection";
import { createLiveActiveThreadSession } from "../liveActiveThreadSession";

const createHarness = () => {
  const store = makeStore();
  const listSkills = vi.fn<GuiHostCommands["listSkills"]>(() => new Promise(() => undefined));
  const startTurn = vi.fn<GuiHostCommands["startTurn"]>(() => new Promise(() => undefined));
  const commands = {
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
  return { commands, listSkills, session, startTurn, store };
};

describe("LiveActiveThreadSession", () => {
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
    const listener = vi.fn();
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

    expect(begun.reservation.save(composerCapture("changed"))).toEqual({
      type: "unavailable",
      scope: "activeThreadSession",
      reason: "staleRevision",
      revision: capabilityRevision + 1,
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
    const listener = vi.fn();
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
