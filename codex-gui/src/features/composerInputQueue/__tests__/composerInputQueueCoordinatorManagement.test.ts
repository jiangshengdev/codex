import { describe, expect, it, vi } from "vitest";
import {
  eventItemStarted,
  eventTurnCompleted,
  eventTurnStarted,
} from "@/features/projection/__tests__/projectionFixtures";
import {
  baseTurn,
  eventWithEnvelope,
  itemStarted,
  turnStarted,
  turnCompleted,
  userMessage,
} from "@/features/projection/__tests__/projectionTestBuilders";
import { GuiHostCommandError } from "@/features/guiHost/guiHostCommandGateway";
import type {
  ThreadItem,
  TurnInterruptParams,
  TurnInterruptResponse,
  TurnStartParams,
  TurnStartResponse,
  TurnSteerParams,
  TurnSteerResponse,
} from "@codex-protocol/v2";
import { createComposerInputQueueCoordinator } from "../composerInputQueueCoordinator";
import { composerCapture, composerDraftCapture } from "./composerInputQueueTestFixtures";

type Deferred = ReturnType<typeof deferredStart>;
type StartTurn = (params: TurnStartParams) => Promise<TurnStartResponse>;
type SteerTurn = (params: TurnSteerParams) => Promise<TurnSteerResponse>;
type InterruptTurn = (params: TurnInterruptParams) => Promise<TurnInterruptResponse>;
type CoordinatorInput = Parameters<typeof createComposerInputQueueCoordinator>[0];
const createCoordinator = (
  options: Omit<CoordinatorInput, "interruptTurn"> & { interruptTurn?: InterruptTurn },
) =>
  createComposerInputQueueCoordinator({
    ...options,
    interruptTurn: options.interruptTurn ?? vi.fn<InterruptTurn>(),
  });
const input = composerCapture;
const deferredStart = () => {
  let resolve!: (response: TurnStartResponse) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<TurnStartResponse>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
type UserMessage = Extract<ThreadItem, { type: "userMessage" }>;
const committedUserMessage = (clientId: string): UserMessage => {
  const item = userMessage("item-1", []);
  if (item.type !== "userMessage") throw new Error("userMessage builder returned another variant");
  return { ...item, clientId };
};
const live = (notification: typeof eventItemStarted) => ({
  notification: eventWithEnvelope(notification, { threadId: "thread-1" }),
  replay: "live" as const,
});
const flush = (): Promise<void> => Promise.resolve();
const pendingItem = (
  coordinator: ReturnType<typeof createComposerInputQueueCoordinator>,
  lane: "ordinary" | "steer",
  index = 0,
) => {
  const page = coordinator.readPendingInputPage({
    lane,
    revision: coordinator.getSnapshot().detailRevision,
    cursor: null,
    limit: 10,
  });
  if (page.type !== "page" || page.items[index] == null) {
    throw new Error(`expected pending ${lane} item at index ${String(index)}`);
  }
  return page.items[index];
};
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

  it("defers ordinary management drain through recovery and preserves successor-first ordering", async () => {
    const requests: Deferred[] = [];
    const startTurn = vi.fn<StartTurn>(() => {
      const request = deferredStart();
      requests.push(request);
      return request.promise;
    });
    const coordinator = createCoordinator({
      threadId: "thread-1",
      activeTurnId: null,
      startTurn,
      steerTurn: vi.fn<SteerTurn>(),
    });
    coordinator.submit(input("failed"));
    coordinator.submit(input("successor"));
    coordinator.submit(input("reserved"));
    const reserved = pendingItem(coordinator, "ordinary", 1);
    const begun = coordinator.beginPendingInputEdit(
      { key: reserved.key, revision: coordinator.getSnapshot().detailRevision },
      () => ({ type: "restored" }),
    );
    if (begun.type !== "begun") throw new Error("expected tail edit capability");

    requests[0]?.reject(
      new GuiHostCommandError({
        source: "rpc",
        delivery: "definitelyNotAccepted",
        error: new Error("failed"),
      }),
    );
    await flush();
    expect(coordinator.getSnapshot().recovery?.reason).toBe("startDefinitelyNotAccepted");
    expect(begun.reservation.cancel()).toMatchObject({ type: "cancelled" });
    expect(startTurn).toHaveBeenCalledTimes(1);

    expect(coordinator.recover()).toBe(true);
    expect(startTurn.mock.calls.map(([params]) => params.input)).toEqual([
      input("failed").input,
      input("successor").input,
    ]);
    requests[1]?.resolve({ turn: baseTurn("turn-successor") });
    await flush();
    coordinator.observeAcceptedEvent(
      live(turnCompleted(eventTurnCompleted, "successor-terminal", baseTurn("turn-successor"))),
    );
    expect(startTurn.mock.calls[2]?.[0].input).toEqual(input("reserved").input);
    requests[2]?.resolve({ turn: baseTurn("turn-reserved") });
    await flush();
    coordinator.observeAcceptedEvent(
      live(turnCompleted(eventTurnCompleted, "reserved-terminal", baseTurn("turn-reserved"))),
    );
    expect(startTurn.mock.calls[3]?.[0].input).toEqual(input("failed").input);
  });

  it("uses management drain when ordinary recovery has no preclaimed successor", async () => {
    const requests: Deferred[] = [];
    const startTurn = vi.fn<StartTurn>(() => {
      const request = deferredStart();
      requests.push(request);
      return request.promise;
    });
    const coordinator = createCoordinator({
      threadId: "thread-1",
      activeTurnId: null,
      startTurn,
      steerTurn: vi.fn<SteerTurn>(),
    });
    coordinator.submit(input("failed"));
    coordinator.submit(input("reserved"));
    const item = pendingItem(coordinator, "ordinary");
    const begun = coordinator.beginPendingInputEdit(
      { key: item.key, revision: coordinator.getSnapshot().detailRevision },
      () => ({ type: "restored" }),
    );
    if (begun.type !== "begun") throw new Error("expected recovery edit capability");
    requests[0]?.reject(
      new GuiHostCommandError({
        source: "rpc",
        delivery: "definitelyNotAccepted",
        error: new Error("failed"),
      }),
    );
    await flush();

    expect(begun.reservation.save(composerDraftCapture("edited reserved"))).toMatchObject({
      type: "saved",
    });
    expect(startTurn).toHaveBeenCalledTimes(1);
    expect(coordinator.recover()).toBe(true);
    expect(startTurn.mock.calls[1]?.[0].input).toEqual(input("edited reserved").input);
    requests[1]?.resolve({ turn: baseTurn("turn-edited") });
    await flush();
    coordinator.observeAcceptedEvent(
      live(turnCompleted(eventTurnCompleted, "edited-terminal", baseTurn("turn-edited"))),
    );
    expect(startTurn.mock.calls[2]?.[0].input).toEqual(input("failed").input);
  });

  it("deletes during recovery without issuing a claim before the existing successor", async () => {
    const requests: Deferred[] = [];
    const startTurn = vi.fn<StartTurn>(() => {
      const request = deferredStart();
      requests.push(request);
      return request.promise;
    });
    const coordinator = createCoordinator({
      threadId: "thread-1",
      activeTurnId: null,
      startTurn,
      steerTurn: vi.fn<SteerTurn>(),
    });
    coordinator.submit(input("failed"));
    coordinator.submit(input("successor"));
    coordinator.submit(input("delete me"));
    requests[0]?.reject(
      new GuiHostCommandError({
        source: "rpc",
        delivery: "definitelyNotAccepted",
        error: new Error("failed"),
      }),
    );
    await flush();
    const item = pendingItem(coordinator, "ordinary");

    expect(
      coordinator.deletePendingInput({
        key: item.key,
        revision: coordinator.getSnapshot().detailRevision,
      }),
    ).toEqual({ type: "deleted", revision: coordinator.getSnapshot().detailRevision });
    expect(startTurn).toHaveBeenCalledTimes(1);
    expect(coordinator.recover()).toBe(true);
    expect(startTurn.mock.calls[1]?.[0].input).toEqual(input("successor").input);
    requests[1]?.resolve({ turn: baseTurn("turn-successor") });
    await flush();
    coordinator.observeAcceptedEvent(
      live(turnCompleted(eventTurnCompleted, "successor-terminal", baseTurn("turn-successor"))),
    );
    expect(startTurn.mock.calls[2]?.[0].input).toEqual(input("failed").input);
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
    await flush();
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

  it("restores a failed steer ahead of a management-settled successor", async () => {
    let rejectFirst!: (error: unknown) => void;
    const steerTurn = vi
      .fn<SteerTurn>()
      .mockImplementationOnce(
        () =>
          new Promise<TurnSteerResponse>((_resolve, reject) => {
            rejectFirst = reject;
          }),
      )
      .mockResolvedValue({ turnId: "turn-1" });
    const coordinator = createCoordinator({
      threadId: "thread-1",
      activeTurnId: "turn-1",
      startTurn: vi.fn<StartTurn>(),
      steerTurn,
    });
    coordinator.submitSteer(input("failed steer"));
    coordinator.submitSteer(input("edit successor"));
    const successor = pendingItem(coordinator, "steer", 1);
    const begun = coordinator.beginPendingInputEdit(
      { key: successor.key, revision: coordinator.getSnapshot().detailRevision },
      () => ({ type: "restored" }),
    );
    if (begun.type !== "begun") throw new Error("expected steer successor edit");

    rejectFirst(
      new GuiHostCommandError({
        source: "rpc",
        delivery: "definitelyNotAccepted",
        error: new Error("failed steer"),
      }),
    );
    await flush();
    expect(coordinator.getSnapshot().recovery?.reason).toBe("steerDefinitelyNotAccepted");
    expect(begun.reservation.save(composerDraftCapture("edited successor"))).toMatchObject({
      type: "saved",
    });
    expect(steerTurn).toHaveBeenCalledTimes(1);

    expect(coordinator.recover()).toBe(true);
    expect(steerTurn.mock.calls.map(([params]) => params.input)).toEqual([
      input("failed steer").input,
      input("failed steer").input,
    ]);
    await flush();
    const retryClientId = steerTurn.mock.calls[1]?.[0].clientUserMessageId;
    coordinator.observeAcceptedEvent(
      live(
        itemStarted(
          eventItemStarted,
          "retry-commit",
          "turn-1",
          committedUserMessage(retryClientId ?? "missing-retry-client-id"),
        ),
      ),
    );
    expect(steerTurn.mock.calls[2]?.[0].input).toEqual(input("edited successor").input);
  });

  it("stops recovery when an isRecovering listener disposes the owner", async () => {
    const first = deferredStart();
    const startTurn = vi.fn<StartTurn>(() => first.promise);
    const coordinator = createCoordinator({
      threadId: "thread-1",
      activeTurnId: null,
      startTurn,
      steerTurn: vi.fn<SteerTurn>(),
    });
    coordinator.submit(input("failed"));
    first.reject(
      new GuiHostCommandError({
        source: "rpc",
        delivery: "definitelyNotAccepted",
        error: new Error("failed"),
      }),
    );
    await flush();
    coordinator.subscribe(() => {
      if (coordinator.getSnapshot().isRecovering) coordinator.dispose("ownerReplaced");
    });

    expect(coordinator.recover()).toBe(false);
    expect(startTurn).toHaveBeenCalledTimes(1);
    expect(
      coordinator.readPendingInputPage({ lane: "ordinary", revision: 0, cursor: null, limit: 1 }),
    ).toEqual({ type: "unavailable", scope: "ownerGone", reason: "ownerReplaced" });
  });

  it("recovers a generic definite steer rejection through the steer path", async () => {
    const steerTurn = vi
      .fn<SteerTurn>()
      .mockRejectedValueOnce(
        new GuiHostCommandError({
          source: "rpc",
          delivery: "definitelyNotAccepted",
          error: new Error("rejected"),
        }),
      )
      .mockResolvedValue({ turnId: "turn-1" });
    const coordinator = createCoordinator({
      threadId: "thread-1",
      activeTurnId: "turn-1",
      startTurn: vi.fn<StartTurn>(),
      steerTurn,
    });
    coordinator.submitSteer(input("recover-steer"));
    await flush();
    expect(coordinator.getSnapshot()).toMatchObject({
      recoveryCount: 1,
      recovery: { reason: "steerDefinitelyNotAccepted", count: 1 },
    });
    expect(coordinator.recover()).toBe(true);
    expect(steerTurn).toHaveBeenCalledTimes(2);
    expect(steerTurn.mock.calls[1]?.[0]).toEqual(steerTurn.mock.calls[0]?.[0]);
  });
});
