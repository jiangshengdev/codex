import { describe, expect, it, vi } from "vitest";
import type { TurnInterruptResponse } from "@codex-protocol/v2";
import { eventTurnCompleted } from "@/features/projection/__tests__/projectionFixtures";
import {
  baseTurn,
  turnCompleted,
  turnWithStatus,
} from "@/features/projection/__tests__/projectionTestBuilders";
import {
  createCoordinator,
  createPersistenceTestContext,
  deferredStart,
  live,
  nextMicrotask,
  type InterruptTurn,
  type StartTurn,
  type SteerTurn,
} from "./composerInputQueueCoordinatorTestFixtures";
import { composerCapture } from "./composerInputQueueTestFixtures";

function setup() {
  let resolveInterrupt!: (response: TurnInterruptResponse) => void;
  const interruptPromise = new Promise<TurnInterruptResponse>((resolve) => {
    resolveInterrupt = resolve;
  });
  const start = deferredStart();
  const startTurn = vi.fn<StartTurn>(() => start.promise);
  const steerTurn = vi.fn<SteerTurn>();
  const interruptTurn = vi.fn<InterruptTurn>(() => interruptPromise);
  const persistence = createPersistenceTestContext();
  const options = { threadId: "thread-1", persistence, startTurn, steerTurn, interruptTurn };
  const original = createCoordinator({ ...options, activeTurnId: "turn-active" });
  original.submit(composerCapture("queued message"));
  expect(original.interruptActiveTurn()).toBe(true);
  return {
    original,
    startTurn,
    interruptTurn,
    resolveInterrupt,
    restore() {
      original.dispose();
      return createCoordinator({ ...options, activeTurnId: null });
    },
  };
}

describe("interrupt snapshot persistence", () => {
  it("retains an issuing local stop through projection recovery and its late acceptance", async () => {
    const fixture = setup();
    fixture.original.setProjectionUnavailable(true);
    const terminal = turnWithStatus(baseTurn("turn-active"), "interrupted");
    expect(fixture.original.reconcileProjection([terminal], [])).toEqual({ type: "committed" });
    expect(fixture.original.getSnapshot()).toMatchObject({
      interrupt: { phase: "issuing" },
      recoveryCount: 0,
    });
    fixture.original.setProjectionUnavailable(false);
    expect(fixture.startTurn).not.toHaveBeenCalled();
    fixture.resolveInterrupt({});
    await nextMicrotask();
    expect(fixture.original.getSnapshot()).toMatchObject({
      interrupt: null,
      recovery: { reason: "userStopped", count: 1 },
    });
    expect(fixture.startTurn).not.toHaveBeenCalled();
    expect(fixture.original.recover()).toBe(true);
    expect(fixture.startTurn).toHaveBeenCalledTimes(1);
    expect(fixture.interruptTurn).toHaveBeenCalledTimes(1);
  });

  it.each(["issuing", "accepted", "terminalPrepared"] as const)(
    "retains local-stop recovery after refresh in the %s window",
    async (phase) => {
      const fixture = setup();
      const terminal = turnWithStatus(baseTurn("turn-active"), "interrupted");
      if (phase === "accepted") {
        fixture.resolveInterrupt({});
        await nextMicrotask();
      }
      if (phase === "terminalPrepared") {
        fixture.original.observeAcceptedEvent(
          live(turnCompleted(eventTurnCompleted, "terminal-before-refresh", terminal)),
        );
      }
      const restored = fixture.restore();
      restored.reconcileRestoredTurns([terminal]);
      expect(restored.getSnapshot()).toMatchObject({
        ordinaryQueuedCount: 0,
        recoveryCount: 1,
        recovery: { reason: "userStopped", count: 1 },
        interrupt: null,
        persistence: { error: null, restoredPaused: true },
      });
      restored.completeRestoreReconciliation();
      expect(restored.resumeRestored(restored.getSnapshot().persistence.revision)).toBe(true);
      expect(fixture.startTurn).not.toHaveBeenCalled();
      expect(fixture.interruptTurn).toHaveBeenCalledTimes(1);
      expect(restored.recover()).toBe(true);
      expect(fixture.startTurn).toHaveBeenCalledTimes(1);
    },
  );

  it.each(["completed", "failed"] as const)(
    "clears a restored interrupt without local-stop recovery when the target %s",
    (status) => {
      const fixture = setup();
      const restored = fixture.restore();
      restored.reconcileRestoredTurns([turnWithStatus(baseTurn("turn-active"), status)]);
      expect(restored.getSnapshot()).toMatchObject({
        ordinaryQueuedCount: 1,
        recovery: null,
        interrupt: null,
      });
      restored.completeRestoreReconciliation();
      expect(restored.resumeRestored(restored.getSnapshot().persistence.revision)).toBe(true);
      expect(fixture.startTurn).toHaveBeenCalledTimes(1);
      expect(fixture.interruptTurn).toHaveBeenCalledTimes(1);
    },
  );

  it("keeps the unknown interrupt pending when its target is absent from the snapshot", () => {
    const fixture = setup();
    const restored = fixture.restore();
    restored.reconcileRestoredTurns([baseTurn("unrelated-turn")]);
    expect(restored.getSnapshot()).toMatchObject({
      ordinaryQueuedCount: 1,
      recovery: null,
      interrupt: { phase: "unknown" },
    });
    expect(fixture.startTurn).not.toHaveBeenCalled();
    expect(fixture.interruptTurn).toHaveBeenCalledTimes(1);
  });
});
