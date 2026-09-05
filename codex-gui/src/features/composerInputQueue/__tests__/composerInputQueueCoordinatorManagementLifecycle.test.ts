import { describe, expect, it, vi } from "vitest";
import { eventTurnCompleted } from "@/features/projection/__tests__/projectionFixtures";
import { baseTurn, turnCompleted } from "@/features/projection/__tests__/projectionTestBuilders";
import { GuiHostCommandError } from "@/features/guiHost/guiHostCommandGateway";
import type { TurnStartResponse, TurnSteerResponse } from "@codex-protocol/v2";
import {
  createCoordinator,
  live,
  nextMicrotask,
  pendingItem,
  type InterruptTurn,
  type StartTurn,
  type SteerTurn,
} from "./composerInputQueueCoordinatorTestFixtures";
import { composerCapture as input, composerDraftCapture } from "./composerInputQueueTestFixtures";
describe("ComposerInputQueueCoordinator", () => {
  it("owns an ordinary edit across revision changes and blocks stop and release", () => {
    const startTurn = vi.fn<StartTurn>().mockResolvedValue({ turn: baseTurn("turn-earlier") });
    const interruptTurn = vi.fn<InterruptTurn>();
    const coordinator = createCoordinator({
      threadId: "thread-1",
      activeTurnId: "turn-active",
      startTurn,
      steerTurn: vi.fn<SteerTurn>(),
      interruptTurn,
    });
    coordinator.submit(input("earlier"));
    coordinator.submit(input("edit me"));
    const item = pendingItem(coordinator, "ordinary", 1);
    const restore = vi.fn<Parameters<typeof coordinator.beginPendingInputEdit>[1]>(() => {
      expect(coordinator.interruptActiveTurn()).toBe(false);
      expect(coordinator.reserveRelease()).toEqual({
        type: "blocked",
        blockers: [{ type: "ordinaryQueued", count: 2 }, { type: "managementPending" }],
      });
      return { type: "restored" } as const;
    });
    const begun = coordinator.beginPendingInputEdit(
      { key: item.key, revision: coordinator.getSnapshot().detailRevision },
      restore,
    );
    if (begun.type !== "begun") throw new Error("expected ordinary edit capability");

    expect(restore).toHaveBeenCalledOnce();
    expect(coordinator.getSnapshot()).toMatchObject({ canStop: false });
    expect(coordinator.interruptActiveTurn()).toBe(false);
    expect(interruptTurn).not.toHaveBeenCalled();
    expect(coordinator.getReleaseReadiness()).toEqual({
      type: "blocked",
      blockers: [{ type: "ordinaryQueued", count: 2 }],
    });
    expect(begun.reservation.save(composerDraftCapture("   "))).toMatchObject({
      type: "invalidInput",
      reason: "emptyInput",
    });

    coordinator.observeAcceptedEvent(
      live(turnCompleted(eventTurnCompleted, "active-terminal", baseTurn("turn-active"))),
    );
    expect(startTurn).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ input: input("earlier").input }),
    );
    expect(begun.reservation.save(composerDraftCapture("edited"))).toMatchObject({ type: "saved" });
    expect(begun.reservation.cancel()).toMatchObject({
      type: "unavailable",
      scope: "liveOwner",
      reason: "sessionInvalidated",
    });
  });

  it("returns the authoritative revision after a saved head immediately drains", () => {
    const startTurn = vi.fn<StartTurn>().mockResolvedValue({ turn: baseTurn("turn-edited") });
    const coordinator = createCoordinator({
      threadId: "thread-1",
      activeTurnId: "turn-active",
      startTurn,
      steerTurn: vi.fn<SteerTurn>(),
    });
    coordinator.submit(input("edit head"));
    const item = pendingItem(coordinator, "ordinary");
    const begun = coordinator.beginPendingInputEdit(
      { key: item.key, revision: coordinator.getSnapshot().detailRevision },
      () => ({ type: "restored" }),
    );
    if (begun.type !== "begun") throw new Error("expected head edit capability");
    coordinator.observeAcceptedEvent(
      live(turnCompleted(eventTurnCompleted, "active-terminal", baseTurn("turn-active"))),
    );

    const saved = begun.reservation.save(composerDraftCapture("edited head"));
    expect(saved).toEqual({ type: "saved", revision: coordinator.getSnapshot().detailRevision });
    expect(saved).not.toHaveProperty("drainIntent");
    expect(startTurn).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ input: input("edited head").input }),
    );
  });

  it("returns ownerGone when synchronous management publication replaces the owner", () => {
    const createQueued = () => {
      const coordinator = createCoordinator({
        threadId: "thread-1",
        activeTurnId: "turn-active",
        startTurn: vi.fn<StartTurn>(),
        steerTurn: vi.fn<SteerTurn>(),
      });
      coordinator.submit(input("pending"));
      return coordinator;
    };
    const ownerGone = {
      type: "unavailable",
      scope: "ownerGone",
      reason: "ownerReplaced",
    } as const;

    const duringBegin = createQueued();
    const beginItem = pendingItem(duringBegin, "ordinary");
    duringBegin.subscribe(() => {
      duringBegin.dispose("ownerReplaced");
    });
    expect(
      duringBegin.beginPendingInputEdit(
        { key: beginItem.key, revision: duringBegin.getSnapshot().detailRevision },
        () => ({ type: "restored" }),
      ),
    ).toEqual(ownerGone);

    const duringDelete = createQueued();
    const deleteItem = pendingItem(duringDelete, "ordinary");
    duringDelete.subscribe(() => {
      duringDelete.dispose("ownerReplaced");
    });
    expect(
      duringDelete.deletePendingInput({
        key: deleteItem.key,
        revision: duringDelete.getSnapshot().detailRevision,
      }),
    ).toEqual(ownerGone);

    for (const operation of ["save", "cancel"] as const) {
      const duringSettlement = createQueued();
      const item = pendingItem(duringSettlement, "ordinary");
      const begun = duringSettlement.beginPendingInputEdit(
        { key: item.key, revision: duringSettlement.getSnapshot().detailRevision },
        () => ({ type: "restored" }),
      );
      if (begun.type !== "begun") throw new Error("expected settlement edit capability");
      duringSettlement.subscribe(() => {
        duringSettlement.dispose("ownerReplaced");
      });
      expect(
        operation === "save"
          ? begun.reservation.save(composerDraftCapture("edited"))
          : begun.reservation.cancel(),
      ).toEqual(ownerGone);
    }
  });

  it("returns a live target invalidation when a begin listener closes the steer target", () => {
    const coordinator = createCoordinator({
      threadId: "thread-1",
      activeTurnId: "turn-1",
      startTurn: vi.fn<StartTurn>(() => new Promise<TurnStartResponse>(() => undefined)),
      steerTurn: vi.fn<SteerTurn>(() => new Promise<TurnSteerResponse>(() => undefined)),
    });
    coordinator.submitSteer(input("issuing"));
    coordinator.submitSteer(input("reserve me"));
    const item = pendingItem(coordinator, "steer", 1);
    const terminal = live(
      turnCompleted(eventTurnCompleted, "listener-terminal", baseTurn("turn-1")),
    );
    let injected = false;
    const invalidationOutcomes: unknown[] = [];
    coordinator.subscribe(() => {
      const outcome = coordinator.getSnapshot().pendingInputManagementOutcome;
      if (outcome != null) invalidationOutcomes.push(outcome);
      if (!injected) {
        injected = true;
        coordinator.observeAcceptedEvent(terminal);
      }
    });

    const result = coordinator.beginPendingInputEdit(
      { key: item.key, revision: coordinator.getSnapshot().detailRevision },
      () => ({ type: "restored" }),
    );
    expect(result).toEqual({
      type: "unavailable",
      scope: "liveOwner",
      reason: "targetInvalidated",
      revision: coordinator.getSnapshot().detailRevision,
      key: item.key,
      lane: "steer",
      targetReason: "terminal",
    });
    expect(coordinator.getSnapshot()).toMatchObject({ canStop: false });
    expect(invalidationOutcomes).toEqual([result]);

    coordinator.observeAcceptedEvent(terminal);
    expect(invalidationOutcomes).toEqual([result]);
  });

  it("publishes a draft-free target invalidation and classifies later owner loss", async () => {
    let rejectSteer!: (error: unknown) => void;
    const steerTurn = vi.fn<SteerTurn>(
      () =>
        new Promise<TurnSteerResponse>((_resolve, reject) => {
          rejectSteer = reject;
        }),
    );
    const coordinator = createCoordinator({
      threadId: "thread-1",
      activeTurnId: "turn-1",
      startTurn: vi.fn<StartTurn>(),
      steerTurn,
    });
    coordinator.submitSteer(input("issuing"));
    coordinator.submitSteer(input("reserved secret"));
    const item = pendingItem(coordinator, "steer", 1);
    const begun = coordinator.beginPendingInputEdit(
      { key: item.key, revision: coordinator.getSnapshot().detailRevision },
      () => ({ type: "restored" }),
    );
    if (begun.type !== "begun") throw new Error("expected steer edit capability");
    const outcomes: unknown[] = [];
    coordinator.subscribe(() => {
      const outcome = coordinator.getSnapshot().pendingInputManagementOutcome;
      if (outcome != null) outcomes.push(outcome);
    });

    rejectSteer(
      new GuiHostCommandError({
        source: "rpc",
        delivery: "definitelyNotAccepted",
        error: new Error("target closed"),
        rpcError: {
          code: -32000,
          message: "target closed",
          data: {
            message: "target closed",
            codexErrorInfo: { activeTurnNotSteerable: { turnKind: "review" } },
            additionalDetails: null,
          },
        },
      }),
    );
    await nextMicrotask();
    const invalidation = {
      type: "unavailable",
      scope: "liveOwner",
      reason: "targetInvalidated",
      revision: coordinator.getSnapshot().detailRevision,
      key: item.key,
      lane: "steer",
      targetReason: "activeTurnNotSteerable",
    } as const;
    expect(coordinator.getSnapshot().pendingInputManagementOutcome).toEqual(invalidation);
    expect(outcomes).toEqual([invalidation]);
    expect(JSON.stringify(invalidation)).not.toContain("secret");
    expect(begun.reservation.cancel()).toEqual(invalidation);

    coordinator.dispose("ownerReplaced");
    expect(coordinator.getSnapshot().pendingInputManagementOutcome).toBeNull();
    expect(begun.reservation.save(composerDraftCapture("late"))).toEqual({
      type: "unavailable",
      scope: "ownerGone",
      reason: "ownerReplaced",
    });
    expect(
      coordinator.readPendingInputPage({ lane: "steer", revision: 0, cursor: null, limit: 1 }),
    ).toEqual({ type: "unavailable", scope: "ownerGone", reason: "ownerReplaced" });
  });
});
