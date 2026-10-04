import { describe, expect, it, vi } from "vitest";
import {
  eventItemStarted,
  eventTurnCompleted,
  eventTurnStarted,
} from "@/features/projection/__tests__/projectionFixtures";
import {
  baseTurn,
  itemStarted,
  turnStarted,
  turnCompleted,
} from "@/features/projection/__tests__/projectionTestBuilders";
import type { TurnStartResponse, TurnSteerResponse } from "@codex-protocol/v2";
import {
  committedUserMessage,
  createCoordinator,
  live,
  pendingItem,
  type StartTurn,
  type SteerTurn,
} from "./composerInputQueueCoordinatorTestFixtures";
import { composerCapture as input } from "./composerInputQueueTestFixtures";
describe("ComposerInputQueueCoordinator", () => {
  it("gates reentrant queue mutations and replays runtime facts after restore acquisition", () => {
    const startTurn = vi.fn<StartTurn>().mockResolvedValue({ turn: baseTurn("turn-pending") });
    const coordinator = createCoordinator({
      threadId: "thread-1",
      activeTurnId: "turn-active",
      startTurn,
      steerTurn: vi.fn<SteerTurn>(),
    });
    coordinator.submit(input("pending"));
    const item = pendingItem(coordinator, "ordinary");
    const terminal = live(
      turnCompleted(eventTurnCompleted, "restore-terminal", baseTurn("turn-active")),
    );

    const begun = coordinator.beginPendingInputEdit(
      { key: item.key, revision: coordinator.getSnapshot().detailRevision },
      () => {
        expect(coordinator.submit(input("reentrant ordinary"))).toEqual({
          type: "rejected",
          reason: "managementPending",
        });
        expect(coordinator.submitSteer(input("reentrant steer"))).toEqual({
          type: "rejected",
          reason: "managementPending",
        });
        expect(coordinator.promoteOrdinaryFrontToSteer()).toBe(false);
        coordinator.observeAcceptedEvent(terminal);
        expect(startTurn).not.toHaveBeenCalled();
        return { type: "restored" };
      },
    );
    if (begun.type !== "begun") throw new Error("expected replay-safe edit capability");
    expect(startTurn).not.toHaveBeenCalled();

    expect(begun.reservation.cancel()).toMatchObject({ type: "cancelled" });
    expect(startTurn).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ input: input("pending").input }),
    );
  });

  it("publishes canStop after accepted-event replay releases its mutation gate", () => {
    const coordinator = createCoordinator({
      threadId: "thread-1",
      activeTurnId: null,
      startTurn: vi.fn<StartTurn>(),
      steerTurn: vi.fn<SteerTurn>(),
    });
    const canStopSnapshots: boolean[] = [];
    coordinator.subscribe(() => canStopSnapshots.push(coordinator.getSnapshot().canStop));

    coordinator.observeAcceptedEvent(
      live(turnStarted(eventTurnStarted, "replay-turn-started", baseTurn("turn-started"))),
    );

    expect(coordinator.getSnapshot().canStop).toBe(true);
    expect(canStopSnapshots.at(-1)).toBe(true);
  });

  it("publishes the final replay snapshot after an empty-mailbox listener failure", () => {
    const createPendingSteer = () => {
      const steerTurn = vi.fn<SteerTurn>(() => new Promise<TurnSteerResponse>(() => undefined));
      const coordinator = createCoordinator({
        threadId: "thread-1",
        activeTurnId: "turn-1",
        startTurn: vi.fn<StartTurn>(),
        steerTurn,
      });
      coordinator.submitSteer(input("pending steer"));
      const clientId = steerTurn.mock.calls[0]?.[0].clientUserMessageId;
      const committed = live(
        itemStarted(
          eventItemStarted,
          "empty-mailbox-commit",
          "turn-1",
          committedUserMessage(clientId ?? "missing-client-id"),
        ),
      );
      return { committed, coordinator };
    };

    const singleFailure = createPendingSteer();
    const replayError = new Error("replay listener failed");
    let unsubscribe = (): void => undefined;
    unsubscribe = singleFailure.coordinator.subscribe(() => {
      unsubscribe();
      throw replayError;
    });
    expect(() => {
      singleFailure.coordinator.observeAcceptedEvent(singleFailure.committed);
    }).toThrow(replayError);
    expect(singleFailure.coordinator.getSnapshot()).toMatchObject({
      guidingCount: 0,
      canStop: true,
    });

    const doubleFailure = createPendingSteer();
    const finalPublishError = new Error("final snapshot listener failed");
    let listenerCall = 0;
    doubleFailure.coordinator.subscribe(() => {
      listenerCall += 1;
      throw listenerCall === 1 ? replayError : finalPublishError;
    });
    let combinedError: unknown;
    try {
      doubleFailure.coordinator.observeAcceptedEvent(doubleFailure.committed);
    } catch (error: unknown) {
      combinedError = error;
    }
    expect(combinedError).toBeInstanceOf(AggregateError);
    if (!(combinedError instanceof AggregateError)) throw new Error("expected aggregate error");
    expect(combinedError.errors).toEqual([replayError, finalPublishError]);
    expect(doubleFailure.coordinator.getSnapshot().canStop).toBe(true);
  });

  it("cancels an undelivered edit when final replay snapshot publication throws", () => {
    const coordinator = createCoordinator({
      threadId: "thread-1",
      activeTurnId: "turn-active",
      startTurn: vi.fn<StartTurn>(),
      steerTurn: vi.fn<SteerTurn>(),
    });
    coordinator.submit(input("pending"));
    const item = pendingItem(coordinator, "ordinary");
    const publishError = new Error("final replay snapshot failed");
    let unsubscribe = (): void => undefined;
    unsubscribe = coordinator.subscribe(() => {
      unsubscribe();
      throw publishError;
    });

    expect(() =>
      coordinator.beginPendingInputEdit(
        { key: item.key, revision: coordinator.getSnapshot().detailRevision },
        () => ({ type: "restored" }),
      ),
    ).toThrow(publishError);
    expect(coordinator.getSnapshot().canStop).toBe(true);
    expect(
      coordinator.deletePendingInput({
        key: item.key,
        revision: coordinator.getSnapshot().detailRevision,
      }),
    ).toMatchObject({ type: "deleted" });
  });

  it("replays deferred and listener-injected runtime facts in strict FIFO order", () => {
    const startTurn = vi.fn<StartTurn>().mockResolvedValue({ turn: baseTurn("turn-pending") });
    const coordinator = createCoordinator({
      threadId: "thread-1",
      activeTurnId: "turn-active",
      startTurn,
      steerTurn: vi.fn<SteerTurn>(),
    });
    coordinator.submit(input("pending"));
    const item = pendingItem(coordinator, "ordinary");
    const eventA = live(turnCompleted(eventTurnCompleted, "fifo-a", baseTurn("turn-active")));
    const eventB = live(turnStarted(eventTurnStarted, "fifo-b", baseTurn("turn-b")));
    const eventC = live(turnCompleted(eventTurnCompleted, "fifo-c", baseTurn("turn-b")));
    let injected = false;
    coordinator.subscribe(() => {
      if (injected) return;
      injected = true;
      expect(coordinator.submit(input("listener submit"))).toEqual({
        type: "rejected",
        reason: "managementPending",
      });
      expect(coordinator.submitSteer(input("listener steer"))).toEqual({
        type: "rejected",
        reason: "managementPending",
      });
      expect(coordinator.promoteOrdinaryFrontToSteer()).toBe(false);
      expect(coordinator.interruptActiveTurn()).toBe(false);
      expect(coordinator.recover()).toBe(false);
      expect(coordinator.reserveRelease()).toEqual({
        type: "blocked",
        blockers: [{ type: "ordinaryQueued", count: 1 }, { type: "managementPending" }],
      });
      expect(
        coordinator.deletePendingInput({
          key: item.key,
          revision: coordinator.getSnapshot().detailRevision,
        }),
      ).toMatchObject({ type: "unavailable", scope: "liveOwner", reason: "mutationPending" });
      expect(
        coordinator.beginPendingInputEdit(
          { key: item.key, revision: coordinator.getSnapshot().detailRevision },
          () => ({ type: "restored" }),
        ),
      ).toMatchObject({ type: "unavailable", scope: "liveOwner", reason: "mutationPending" });
      coordinator.observeAcceptedEvent(eventC);
    });

    const begun = coordinator.beginPendingInputEdit(
      { key: item.key, revision: coordinator.getSnapshot().detailRevision },
      () => {
        coordinator.observeAcceptedEvent(eventA);
        coordinator.observeAcceptedEvent(eventB);
        return { type: "restored" };
      },
    );
    if (begun.type !== "begun") throw new Error("expected FIFO edit capability");
    expect(injected).toBe(true);
    expect(startTurn).not.toHaveBeenCalled();

    expect(begun.reservation.cancel()).toMatchObject({ type: "cancelled" });
    expect(coordinator.getSnapshot().canStop).toBe(false);
    expect(startTurn).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ input: input("pending").input }),
    );
  });

  it("prioritizes ownerGone when replay after a thrown restore replaces the owner", () => {
    const coordinator = createCoordinator({
      threadId: "thread-1",
      activeTurnId: "turn-active",
      startTurn: vi.fn<StartTurn>(() => new Promise<TurnStartResponse>(() => undefined)),
      steerTurn: vi.fn<SteerTurn>(),
    });
    coordinator.submit(input("pending"));
    const item = pendingItem(coordinator, "ordinary");
    const terminal = live(
      turnCompleted(eventTurnCompleted, "restore-error-terminal", baseTurn("turn-active")),
    );
    coordinator.subscribe(() => {
      coordinator.dispose("ownerReplaced");
    });

    expect(
      coordinator.beginPendingInputEdit(
        { key: item.key, revision: coordinator.getSnapshot().detailRevision },
        () => {
          coordinator.observeAcceptedEvent(terminal);
          throw new Error("restore failed");
        },
      ),
    ).toEqual({ type: "unavailable", scope: "ownerGone", reason: "ownerReplaced" });
  });

  it("retains unconsumed runtime facts when replay publication throws", () => {
    const startTurn = vi.fn<StartTurn>().mockResolvedValue({ turn: baseTurn("unexpected") });
    const coordinator = createCoordinator({
      threadId: "thread-1",
      activeTurnId: "turn-active",
      startTurn,
      steerTurn: vi.fn<SteerTurn>(),
    });
    coordinator.submit(input("pending"));
    const item = pendingItem(coordinator, "ordinary");
    const eventA = live(turnCompleted(eventTurnCompleted, "throw-a", baseTurn("turn-active")));
    const eventB = live(turnStarted(eventTurnStarted, "throw-b", baseTurn("turn-b")));
    const eventC = live(turnCompleted(eventTurnCompleted, "throw-c", baseTurn("turn-other")));
    const replayError = new Error("replay listener failed");
    let unsubscribe = (): void => undefined;
    unsubscribe = coordinator.subscribe(() => {
      unsubscribe();
      throw replayError;
    });

    expect(() =>
      coordinator.beginPendingInputEdit(
        { key: item.key, revision: coordinator.getSnapshot().detailRevision },
        () => {
          coordinator.observeAcceptedEvent(eventA);
          coordinator.observeAcceptedEvent(eventB);
          return { type: "restored" };
        },
      ),
    ).toThrow(replayError);

    coordinator.observeAcceptedEvent(eventC);
    expect(coordinator.getSnapshot().canStop).toBe(true);
    expect(startTurn).not.toHaveBeenCalled();
  });
});
