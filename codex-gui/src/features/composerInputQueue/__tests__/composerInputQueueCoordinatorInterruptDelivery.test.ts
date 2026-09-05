import { describe, expect, it, vi } from "vitest";
import {
  eventItemStarted,
  eventTurnCompleted,
} from "@/features/projection/__tests__/projectionFixtures";
import {
  baseTurn,
  eventWithEnvelope,
  turnCompleted,
} from "@/features/projection/__tests__/projectionTestBuilders";
import { GuiHostCommandError } from "@/features/guiHost/guiHostCommandGateway";
import type { TurnInterruptResponse } from "@codex-protocol/v2";
import {
  createCoordinator,
  deferredStart,
  live,
  nextMicrotask,
  type InterruptTurn,
  type StartTurn,
  type SteerTurn,
} from "./composerInputQueueCoordinatorTestFixtures";
import { composerCapture as input } from "./composerInputQueueTestFixtures";

const deferredInterrupt = () => {
  let resolve!: (response: TurnInterruptResponse) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<TurnInterruptResponse>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
describe("ComposerInputQueueCoordinator", () => {
  it("owns local stop through explicit FIFO recovery and auto-drains non-local interruption", async () => {
    const startTurn = vi.fn<StartTurn>(({ input }) =>
      Promise.resolve({ turn: baseTurn(input[0]?.type === "text" ? input[0].text : "unexpected") }),
    );
    const steerTurn = vi.fn<SteerTurn>().mockRejectedValue(
      new GuiHostCommandError({
        source: "rpc",
        delivery: "definitelyNotAccepted",
        error: new Error("steer rejected"),
      }),
    );
    const interruptTurn = vi.fn<InterruptTurn>().mockResolvedValue({});
    const coordinator = createCoordinator({
      threadId: "thread-1",
      activeTurnId: "turn-active",
      startTurn,
      steerTurn,
      interruptTurn,
    });
    const initial = coordinator.getSnapshot();
    const snapshots: unknown[] = [];
    const releaseReadiness: unknown[] = [];
    coordinator.subscribe(() => {
      snapshots.push(coordinator.getSnapshot());
      releaseReadiness.push(coordinator.getReleaseReadiness());
    });
    coordinator.observeAcceptedEvent({
      notification: eventWithEnvelope(eventItemStarted, { threadId: "thread-1" }),
      replay: "snapshotDuplicate",
    });
    expect(coordinator.getSnapshot()).toBe(initial);
    coordinator.submit(input("one"));
    coordinator.submit(input("two"));
    expect({
      issued: coordinator.interruptActiveTurn(),
      duplicate: coordinator.interruptActiveTurn(),
    }).toEqual({ issued: true, duplicate: false });
    expect(interruptTurn).toHaveBeenCalledExactlyOnceWith({
      threadId: "thread-1",
      turnId: "turn-active",
    });
    expect(coordinator.getSnapshot()).toEqual({
      ordinaryQueuedCount: 2,
      guidingCount: 0,
      detailRevision: 2,
      recoveryCount: 0,
      recovery: null,
      isRecovering: false,
      rejectedSteers: [],
      hasUnknownSteer: false,
      canStop: false,
      interrupt: { phase: "issuing" },
      pendingInputManagementOutcome: null,
    });
    expect(coordinator.getReleaseReadiness()).toEqual({
      type: "blocked",
      blockers: [
        { type: "ordinaryQueued", count: 2 },
        { type: "interruptPending", phase: "issuing" },
      ],
    });
    coordinator.submitSteer(input("steer"));
    await nextMicrotask();
    const beforeLocalStop = coordinator.getSnapshot();
    coordinator.observeAcceptedEvent(
      live(
        turnCompleted(eventTurnCompleted, "commit-interrupt", {
          ...baseTurn("turn-active"),
          status: "interrupted",
        }),
      ),
    );
    const stoppedSnapshot = coordinator.getSnapshot();
    expect(stoppedSnapshot).toMatchObject({
      ordinaryQueuedCount: 0,
      guidingCount: 0,
      recoveryCount: 3,
      recovery: { reason: "userStopped", count: 3 },
      interrupt: null,
    });
    expect(stoppedSnapshot.detailRevision).toBeGreaterThan(beforeLocalStop.detailRevision);
    expect(
      coordinator.readPendingInputPage({
        lane: "ordinary",
        revision: beforeLocalStop.detailRevision,
        cursor: null,
        limit: 1,
      }),
    ).toEqual({ type: "stale", revision: stoppedSnapshot.detailRevision });
    expect(coordinator.interruptActiveTurn()).toBe(false);
    expect(coordinator.recover()).toBe(true);
    expect(startTurn).toHaveBeenCalledTimes(1);
    expect(startTurn.mock.calls[0]?.[0].input).toEqual(input("steer").input);
    await nextMicrotask();
    coordinator.observeAcceptedEvent(
      live(turnCompleted(eventTurnCompleted, "commit-steer", baseTurn("steer"))),
    );
    coordinator.observeAcceptedEvent(
      live(turnCompleted(eventTurnCompleted, "commit-one", baseTurn("one"))),
    );
    await nextMicrotask();
    expect(startTurn.mock.calls.map(([params]) => params.input)).toEqual([
      input("steer").input,
      input("one").input,
      input("two").input,
    ]);
    expect(snapshots).toContainEqual({
      ordinaryQueuedCount: 0,
      guidingCount: 0,
      detailRevision: stoppedSnapshot.detailRevision,
      recoveryCount: 3,
      recovery: { reason: "userStopped", count: 3 },
      isRecovering: true,
      rejectedSteers: [],
      hasUnknownSteer: false,
      canStop: false,
      interrupt: null,
      pendingInputManagementOutcome: null,
    });
    expect(releaseReadiness).toContainEqual({
      type: "blocked",
      blockers: [{ type: "recoveryPending", count: 3 }, { type: "recovering" }],
    });

    const nonLocalStart = vi.fn<StartTurn>(({ input }) =>
      Promise.resolve({ turn: baseTurn(input[0]?.type === "text" ? input[0].text : "unexpected") }),
    );
    const nonLocalSteer = vi.fn<SteerTurn>().mockRejectedValue(
      new GuiHostCommandError({
        source: "rpc",
        delivery: "definitelyNotAccepted",
        error: new Error("non-local steer rejected"),
      }),
    );
    const nonLocal = createCoordinator({
      threadId: "thread-1",
      activeTurnId: "turn-foreign",
      startTurn: nonLocalStart,
      steerTurn: nonLocalSteer,
    });
    nonLocal.submit(input("ordinary"));
    nonLocal.submitSteer(input("rejected-steer"));
    await nextMicrotask();
    expect(nonLocal.getSnapshot().recovery).toEqual({
      reason: "steerDefinitelyNotAccepted",
      count: 1,
    });
    nonLocal.observeAcceptedEvent(
      live(
        turnCompleted(eventTurnCompleted, "foreign-interrupt", {
          ...baseTurn("turn-foreign"),
          status: "interrupted",
        }),
      ),
    );
    expect(nonLocalStart.mock.calls.map(([params]) => params.input)).toEqual([
      input("rejected-steer").input,
    ]);
    await nextMicrotask();
    nonLocal.observeAcceptedEvent(
      live(turnCompleted(eventTurnCompleted, "rejected-terminal", baseTurn("rejected-steer"))),
    );
    expect(nonLocalStart.mock.calls.map(([params]) => params.input)).toEqual([
      input("rejected-steer").input,
      input("ordinary").input,
    ]);
  });

  it.each([
    ["accepted", null, "userStopped", 0],
    ["deliveryUnknown", new Error("unknown"), "userStopped", 0],
    [
      "definitelyNotAccepted",
      new GuiHostCommandError({
        source: "rpc",
        delivery: "definitelyNotAccepted",
        error: new Error("rejected"),
      }),
      null,
      1,
    ],
  ] as const)(
    "classifies terminal-before-%s settlement once",
    async (_phase, error, recovery, starts) => {
      const request = deferredInterrupt();
      const interruptTurn = vi.fn<InterruptTurn>(() => request.promise);
      const startTurn = vi.fn<StartTurn>().mockResolvedValue({ turn: baseTurn("ordinary") });
      const coordinator = createCoordinator({
        threadId: "thread-1",
        activeTurnId: "turn",
        startTurn,
        steerTurn: vi.fn<SteerTurn>(),
        interruptTurn,
      });
      coordinator.submit(input("ordinary"));
      coordinator.interruptActiveTurn();
      const terminal = live(
        turnCompleted(eventTurnCompleted, "terminal", {
          ...baseTurn("turn"),
          status: "interrupted",
        }),
      );
      coordinator.observeAcceptedEvent(terminal);
      expect(startTurn).not.toHaveBeenCalled();
      if (error == null) request.resolve({});
      else request.reject(error);
      await nextMicrotask();
      expect({
        recovery: coordinator.getSnapshot().recovery?.reason ?? null,
        starts: startTurn.mock.calls.length,
      }).toEqual({ recovery, starts });
      expect(coordinator.getSnapshot().interrupt).toBeNull();
      const settledSnapshot = coordinator.getSnapshot();
      coordinator.observeAcceptedEvent(terminal);
      expect(coordinator.getSnapshot()).toBe(settledSnapshot);
    },
  );

  it.each([
    ["accepted", "completed", null],
    ["unknown", "failed", new Error("unknown")],
    [
      "definitelyNotAccepted",
      "failed",
      new GuiHostCommandError({
        source: "rpc",
        delivery: "definitelyNotAccepted",
        error: new Error("rejected"),
      }),
    ],
  ] as const)("clears a %s interrupt when its turn ends with %s", async (phase, status, error) => {
    const interruptTurn =
      error == null
        ? vi.fn<InterruptTurn>().mockResolvedValue({})
        : vi.fn<InterruptTurn>().mockRejectedValue(error);
    const coordinator = createCoordinator({
      threadId: "thread-1",
      activeTurnId: "turn",
      startTurn: vi.fn<StartTurn>(),
      steerTurn: vi.fn<SteerTurn>(),
      interruptTurn,
    });
    coordinator.interruptActiveTurn();
    await nextMicrotask();
    expect(coordinator.getSnapshot().interrupt).toEqual({ phase });
    coordinator.observeAcceptedEvent(
      live(
        turnCompleted(eventTurnCompleted, "normal-terminal", {
          ...baseTurn("turn"),
          status,
        }),
      ),
    );
    expect(coordinator.getSnapshot()).toMatchObject({ canStop: false, interrupt: null });
    expect(coordinator.getReleaseReadiness()).toEqual({ type: "safe" });
  });

  it("clears an issuing interrupt on normal terminal and ignores its late settlement", async () => {
    const request = deferredInterrupt();
    const coordinator = createCoordinator({
      threadId: "thread-1",
      activeTurnId: "turn",
      startTurn: vi.fn<StartTurn>(),
      steerTurn: vi.fn<SteerTurn>(),
      interruptTurn: vi.fn<InterruptTurn>(() => request.promise),
    });
    coordinator.interruptActiveTurn();
    coordinator.observeAcceptedEvent(
      live(turnCompleted(eventTurnCompleted, "normal-terminal", baseTurn("turn"))),
    );
    const terminalSnapshot = coordinator.getSnapshot();
    expect(terminalSnapshot).toMatchObject({ canStop: false, interrupt: null });
    request.resolve({});
    await nextMicrotask();
    expect(coordinator.getSnapshot()).toBe(terminalSnapshot);
    expect(coordinator.getReleaseReadiness()).toEqual({ type: "safe" });
  });

  it("ignores mismatched events and settlements after disposal", async () => {
    const request = deferredStart();
    const startTurn = vi.fn<StartTurn>(() => request.promise);
    const coordinator = createCoordinator({
      threadId: "thread-1",
      activeTurnId: null,
      startTurn,
      steerTurn: vi.fn<SteerTurn>(),
    });
    const listener = vi.fn<() => void>();
    coordinator.subscribe(listener);
    coordinator.submit(input("first"));
    coordinator.observeAcceptedEvent({
      notification: { ...eventItemStarted, threadId: "thread-2" },
      replay: "live",
    });
    coordinator.dispose();
    const readinessAtDisposal = coordinator.getReleaseReadiness();
    const queued = createCoordinator({
      threadId: "thread-1",
      activeTurnId: "active",
      startTurn,
      steerTurn: vi.fn<SteerTurn>(),
    });
    queued.submit(input("queued"));
    queued.dispose();
    queued.observeAcceptedEvent(
      live(turnCompleted(eventTurnCompleted, "commit", baseTurn("active"))),
    );
    expect(startTurn).toHaveBeenCalledTimes(1);
    request.resolve({ turn: baseTurn("turn-1") });
    await nextMicrotask();
    expect(coordinator.submit(input("late"))).toEqual({ type: "rejected", reason: "disposed" });
    expect(coordinator.getReleaseReadiness()).toEqual(readinessAtDisposal);
    expect(listener).not.toHaveBeenCalled();
    expect(startTurn).toHaveBeenCalledTimes(1);

    const interruptRequest = deferredInterrupt();
    const interrupted = createCoordinator({
      threadId: "thread-1",
      activeTurnId: "interrupt-active",
      startTurn: vi.fn<StartTurn>(),
      steerTurn: vi.fn<SteerTurn>(),
      interruptTurn: vi.fn<InterruptTurn>(() => interruptRequest.promise),
    });
    const interruptListener = vi.fn<() => void>();
    interrupted.subscribe(interruptListener);
    interrupted.interruptActiveTurn();
    interrupted.dispose();
    const interruptSnapshot = interrupted.getSnapshot();
    const notificationsAtDisposal = interruptListener.mock.calls.length;
    interruptRequest.resolve({});
    await nextMicrotask();
    expect(interrupted.getSnapshot()).toBe(interruptSnapshot);
    expect(interrupted.getReleaseReadiness()).toEqual({
      type: "blocked",
      blockers: [{ type: "disposed" }],
    });
    expect(interruptListener).toHaveBeenCalledTimes(notificationsAtDisposal);
  });
});
