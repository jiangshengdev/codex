import { describe, expect, it, vi } from "vitest";
import type { eventItemStarted } from "@/features/projection/__tests__/projectionFixtures";
import {
  eventTurnCompleted,
  eventTurnStarted,
} from "@/features/projection/__tests__/projectionFixtures";
import {
  baseTurn,
  eventWithEnvelope,
  turnStarted,
  turnCompleted,
} from "@/features/projection/__tests__/projectionTestBuilders";
import { GuiHostCommandError } from "@/features/guiHost/guiHostCommandGateway";
import type {
  TurnInterruptParams,
  TurnInterruptResponse,
  TurnStartParams,
  TurnStartResponse,
  TurnSteerParams,
  TurnSteerResponse,
} from "@codex-protocol/v2";
import { createComposerInputQueueCoordinator } from "../composerInputQueueCoordinator";
import { composerCapture } from "./composerInputQueueTestFixtures";

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
  it("moves a manageable item with authoritative coordinates and keeps rejected moves silent", () => {
    const startTurn = vi.fn<StartTurn>();
    const steerTurn = vi.fn<SteerTurn>();
    const coordinator = createCoordinator({
      threadId: "thread-1",
      activeTurnId: "turn-active",
      startTurn,
      steerTurn,
    });
    coordinator.submit(input("one"));
    coordinator.submit(input("two"));
    coordinator.submit(input("three"));
    const item = pendingItem(coordinator, "ordinary", 1);
    const initialRevision = coordinator.getSnapshot().detailRevision;
    const publishedStates: unknown[] = [];
    const reentrantResults: unknown[] = [];
    const listener = vi.fn<() => void>(() => {
      const revision = coordinator.getSnapshot().detailRevision;
      publishedStates.push({
        revision,
        canStop: coordinator.getSnapshot().canStop,
      });
      reentrantResults.push({
        move: coordinator.movePendingInput({
          key: item.key,
          revision,
          destination: "last",
        }),
        begin: coordinator.beginPendingInputEdit({ key: item.key, revision }, () => ({
          type: "restored",
        })),
        delete: coordinator.deletePendingInput({ key: item.key, revision }),
        release: coordinator.reserveRelease(),
        recover: coordinator.recover(),
        interrupt: coordinator.interruptActiveTurn(),
        submit: coordinator.submit(input("reentrant ordinary")),
        submitSteer: coordinator.submitSteer(input("reentrant steer")),
        promote: coordinator.promoteOrdinaryFrontToSteer(),
      });
    });
    coordinator.subscribe(listener);

    expect(
      coordinator.movePendingInput({
        key: item.key,
        revision: initialRevision,
        destination: "first",
      }),
    ).toEqual({
      type: "moved",
      revision: initialRevision + 1,
      lane: "ordinary",
      position: 1,
      count: 3,
    });
    expect(pendingItem(coordinator, "ordinary").key).toBe(item.key);
    expect(coordinator.getSnapshot()).toMatchObject({
      detailRevision: initialRevision + 1,
      canStop: true,
    });
    expect(coordinator.getReleaseReadiness()).toEqual({
      type: "blocked",
      blockers: [{ type: "ordinaryQueued", count: 3 }],
    });
    expect(publishedStates).toEqual([{ revision: initialRevision + 1, canStop: true }]);
    expect(reentrantResults).toEqual([
      {
        move: {
          type: "unavailable",
          scope: "liveOwner",
          reason: "mutationPending",
          revision: initialRevision + 1,
        },
        begin: {
          type: "unavailable",
          scope: "liveOwner",
          reason: "mutationPending",
          revision: initialRevision + 1,
        },
        delete: {
          type: "unavailable",
          scope: "liveOwner",
          reason: "mutationPending",
          revision: initialRevision + 1,
        },
        release: {
          type: "blocked",
          blockers: [{ type: "ordinaryQueued", count: 3 }, { type: "managementPending" }],
        },
        recover: false,
        interrupt: false,
        submit: { type: "rejected", reason: "managementPending" },
        submitSteer: { type: "rejected", reason: "managementPending" },
        promote: false,
      },
    ]);
    expect(listener).toHaveBeenCalledOnce();
    expect(startTurn).not.toHaveBeenCalled();
    expect(steerTurn).not.toHaveBeenCalled();

    listener.mockClear();
    expect(
      coordinator.movePendingInput({
        key: item.key,
        revision: coordinator.getSnapshot().detailRevision,
        destination: "first",
      }),
    ).toEqual({
      type: "noOp",
      reason: "alreadyAtDestination",
      revision: coordinator.getSnapshot().detailRevision,
    });
    expect(
      coordinator.movePendingInput({
        key: item.key,
        revision: initialRevision,
        destination: "last",
      }),
    ).toEqual({
      type: "stale",
      scope: "liveOwner",
      revision: coordinator.getSnapshot().detailRevision,
    });
    expect(listener).not.toHaveBeenCalled();

    const pendingSteer = createCoordinator({
      threadId: "thread-2",
      activeTurnId: "turn-active",
      startTurn: vi.fn<StartTurn>(),
      steerTurn: vi.fn<SteerTurn>(() => new Promise<TurnSteerResponse>(() => undefined)),
    });
    pendingSteer.submitSteer(input("delivery in progress"));
    const readOnlyItem = pendingItem(pendingSteer, "steer");
    const readOnlyListener = vi.fn<() => void>();
    pendingSteer.subscribe(readOnlyListener);
    expect(
      pendingSteer.movePendingInput({
        key: readOnlyItem.key,
        revision: pendingSteer.getSnapshot().detailRevision,
        destination: "last",
      }),
    ).toEqual({
      type: "notManageable",
      scope: "liveOwner",
      revision: pendingSteer.getSnapshot().detailRevision,
    });
    expect(readOnlyListener).not.toHaveBeenCalled();
  });

  it("blocks moves during edit acquisition and throughout the live edit session", () => {
    const coordinator = createCoordinator({
      threadId: "thread-1",
      activeTurnId: "turn-active",
      startTurn: vi.fn<StartTurn>(),
      steerTurn: vi.fn<SteerTurn>(),
    });
    coordinator.submit(input("one"));
    coordinator.submit(input("two"));
    const item = pendingItem(coordinator, "ordinary", 1);
    const revision = coordinator.getSnapshot().detailRevision;
    const request = { key: item.key, revision, destination: "first" } as const;

    const begun = coordinator.beginPendingInputEdit({ key: item.key, revision }, () => {
      expect(coordinator.movePendingInput(request)).toEqual({
        type: "unavailable",
        scope: "liveOwner",
        reason: "mutationPending",
        revision,
      });
      return { type: "restored" };
    });
    if (begun.type !== "begun") throw new Error("expected edit capability");
    expect(coordinator.movePendingInput(request)).toEqual({
      type: "unavailable",
      scope: "liveOwner",
      reason: "editInProgress",
      revision: coordinator.getSnapshot().detailRevision,
    });
    expect(begun.reservation.cancel()).toMatchObject({ type: "cancelled" });
  });

  it("prioritizes replay and mailbox mutationPending over an overlapping active edit", () => {
    const coordinator = createCoordinator({
      threadId: "thread-1",
      activeTurnId: "turn-active",
      startTurn: vi.fn<StartTurn>(() => new Promise<TurnStartResponse>(() => undefined)),
      steerTurn: vi.fn<SteerTurn>(),
    });
    coordinator.submit(input("move me"));
    coordinator.submit(input("edit me"));
    const moveItem = pendingItem(coordinator, "ordinary");
    const editItem = pendingItem(coordinator, "ordinary", 1);
    const begun = coordinator.beginPendingInputEdit(
      { key: editItem.key, revision: coordinator.getSnapshot().detailRevision },
      () => ({ type: "restored" }),
    );
    if (begun.type !== "begun") throw new Error("expected overlapping edit capability");

    const eventB = live(
      turnStarted(eventTurnStarted, "overlap-replay-b", baseTurn("turn-pending")),
    );
    const replayMoveResults: unknown[] = [];
    let injected = false;
    coordinator.subscribe(() => {
      if (!injected) {
        injected = true;
        coordinator.observeAcceptedEvent(eventB);
      }
      replayMoveResults.push(
        coordinator.movePendingInput({
          key: moveItem.key,
          revision: coordinator.getSnapshot().detailRevision,
          destination: "last",
        }),
      );
    });

    coordinator.observeAcceptedEvent(
      live(turnCompleted(eventTurnCompleted, "overlap-replay-a", baseTurn("turn-active"))),
    );
    expect(replayMoveResults).not.toHaveLength(0);
    for (const result of replayMoveResults) {
      expect(result).toEqual({
        type: "unavailable",
        scope: "liveOwner",
        reason: "mutationPending",
        revision: coordinator.getSnapshot().detailRevision,
      });
    }
    expect(
      coordinator.movePendingInput({
        key: moveItem.key,
        revision: coordinator.getSnapshot().detailRevision,
        destination: "last",
      }),
    ).toEqual({
      type: "unavailable",
      scope: "liveOwner",
      reason: "editInProgress",
      revision: coordinator.getSnapshot().detailRevision,
    });
    expect(begun.reservation.cancel()).toMatchObject({ type: "cancelled" });
  });

  it("blocks moves while release or recovery owns the queue", async () => {
    const releaseCoordinator = createCoordinator({
      threadId: "thread-release",
      activeTurnId: "turn-active",
      startTurn: vi.fn<StartTurn>(),
      steerTurn: vi.fn<SteerTurn>(),
    });
    releaseCoordinator.submit(input("one"));
    const releaseItem = pendingItem(releaseCoordinator, "ordinary");
    expect(
      releaseCoordinator.deletePendingInput({
        key: releaseItem.key,
        revision: releaseCoordinator.getSnapshot().detailRevision,
      }),
    ).toEqual({ type: "deleted", revision: releaseCoordinator.getSnapshot().detailRevision });
    const release = releaseCoordinator.reserveRelease();
    if (release.type !== "reserved") throw new Error("expected release reservation");
    expect(
      releaseCoordinator.movePendingInput({
        key: releaseItem.key,
        revision: releaseCoordinator.getSnapshot().detailRevision,
        destination: "first",
      }),
    ).toEqual({
      type: "unavailable",
      scope: "liveOwner",
      reason: "releaseReserved",
      revision: releaseCoordinator.getSnapshot().detailRevision,
    });

    const failed = deferredStart();
    const recoveryCoordinator = createCoordinator({
      threadId: "thread-recovery",
      activeTurnId: null,
      startTurn: vi.fn<StartTurn>(() => failed.promise),
      steerTurn: vi.fn<SteerTurn>(),
    });
    recoveryCoordinator.submit(input("failed"));
    recoveryCoordinator.submit(input("successor"));
    recoveryCoordinator.submit(input("movable"));
    const recoveryItem = pendingItem(recoveryCoordinator, "ordinary");
    failed.reject(
      new GuiHostCommandError({
        source: "rpc",
        delivery: "definitelyNotAccepted",
        error: new Error("failed"),
      }),
    );
    await flush();
    const request = {
      key: recoveryItem.key,
      revision: recoveryCoordinator.getSnapshot().detailRevision,
      destination: "last",
    } as const;
    expect(recoveryCoordinator.movePendingInput(request)).toEqual({
      type: "unavailable",
      scope: "liveOwner",
      reason: "recoveryPending",
      revision: recoveryCoordinator.getSnapshot().detailRevision,
    });

    let moveWhileRecovering: unknown;
    let revisionWhileRecovering: number | undefined;
    recoveryCoordinator.subscribe(() => {
      if (recoveryCoordinator.getSnapshot().isRecovering) {
        revisionWhileRecovering = recoveryCoordinator.getSnapshot().detailRevision;
        moveWhileRecovering = recoveryCoordinator.movePendingInput({
          ...request,
          revision: revisionWhileRecovering,
        });
      }
    });
    expect(recoveryCoordinator.recover()).toBe(true);
    expect(moveWhileRecovering).toEqual({
      type: "unavailable",
      scope: "liveOwner",
      reason: "recoveryPending",
      revision: revisionWhileRecovering,
    });
  });

  it("replays move-listener runtime facts once in FIFO order and returns reprojected coordinates", () => {
    const startTurn = vi.fn<StartTurn>(() => new Promise<TurnStartResponse>(() => undefined));
    const coordinator = createCoordinator({
      threadId: "thread-1",
      activeTurnId: "turn-active",
      startTurn,
      steerTurn: vi.fn<SteerTurn>(),
    });
    coordinator.submit(input("one"));
    coordinator.submit(input("two"));
    coordinator.submit(input("three"));
    coordinator.submit(input("target"));
    const target = pendingItem(coordinator, "ordinary", 3);
    const eventA = live(turnStarted(eventTurnStarted, "move-fifo-a", baseTurn("turn-active")));
    const eventB = live(turnStarted(eventTurnStarted, "move-fifo-b", baseTurn("turn-active")));
    const eventC = live(turnCompleted(eventTurnCompleted, "move-fifo-c", baseTurn("turn-active")));
    let initialInjectionCount = 0;
    let finalPublicationInjectionCount = 0;
    let eventCReplayPublicationCount = 0;
    let movementBeforeReplay: unknown;
    const gatedResults: Readonly<{
      revision: number;
      move: ReturnType<typeof coordinator.movePendingInput>;
      begin: ReturnType<typeof coordinator.beginPendingInputEdit>;
      delete: ReturnType<typeof coordinator.deletePendingInput>;
      release: ReturnType<typeof coordinator.reserveRelease>;
      recover: boolean;
      interrupt: boolean;
    }>[] = [];
    coordinator.subscribe(() => {
      const revision = coordinator.getSnapshot().detailRevision;
      const moveRequest = { key: target.key, revision, destination: "last" } as const;
      gatedResults.push({
        revision,
        move: coordinator.movePendingInput(moveRequest),
        begin: coordinator.beginPendingInputEdit({ key: target.key, revision }, () => ({
          type: "restored",
        })),
        delete: coordinator.deletePendingInput({ key: target.key, revision }),
        release: coordinator.reserveRelease(),
        recover: coordinator.recover(),
        interrupt: coordinator.interruptActiveTurn(),
      });
      if (initialInjectionCount === 0) {
        initialInjectionCount += 1;
        movementBeforeReplay = pendingItem(coordinator, "ordinary", 2).movement;
        coordinator.observeAcceptedEvent(eventA);
        coordinator.observeAcceptedEvent(eventB);
      } else if (finalPublicationInjectionCount === 0 && coordinator.getSnapshot().canStop) {
        finalPublicationInjectionCount += 1;
        coordinator.observeAcceptedEvent(eventC);
      } else if (finalPublicationInjectionCount === 1 && !coordinator.getSnapshot().canStop) {
        eventCReplayPublicationCount += 1;
      }
    });

    const result = coordinator.movePendingInput({
      key: target.key,
      revision: coordinator.getSnapshot().detailRevision,
      destination: "earlier",
    });

    expect(result).toEqual({
      type: "moved",
      revision: coordinator.getSnapshot().detailRevision,
      lane: "ordinary",
      position: 2,
      count: 3,
    });
    expect(movementBeforeReplay).toEqual({
      position: 3,
      count: 4,
      canMoveEarlier: true,
      canMoveLater: true,
    });
    expect({
      initialInjectionCount,
      finalPublicationInjectionCount,
      eventCReplayPublicationCount,
    }).toEqual({
      initialInjectionCount: 1,
      finalPublicationInjectionCount: 1,
      eventCReplayPublicationCount: 1,
    });
    expect(coordinator.getSnapshot().canStop).toBe(false);
    expect(startTurn.mock.calls.map(([params]) => params.input)).toEqual([input("one").input]);
    expect(gatedResults).not.toHaveLength(0);
    for (const gated of gatedResults) {
      const revision = gated.revision;
      if (
        gated.move.type !== "unavailable" ||
        gated.begin.type !== "unavailable" ||
        gated.delete.type !== "unavailable" ||
        gated.release.type !== "blocked"
      ) {
        throw new Error("expected management operations to remain gated during move replay");
      }
      expect(gated.move).toEqual({
        type: "unavailable",
        scope: "liveOwner",
        reason: "mutationPending",
        revision,
      });
      expect(gated.begin).toEqual({
        type: "unavailable",
        scope: "liveOwner",
        reason: "mutationPending",
        revision,
      });
      expect(gated.delete).toEqual({
        type: "unavailable",
        scope: "liveOwner",
        reason: "mutationPending",
        revision,
      });
      expect(gated.recover).toEqual(false);
      expect(gated.interrupt).toEqual(false);
      expect(gated.release.blockers.some(({ type }) => type === "managementPending")).toBe(true);
    }
  });

  it("returns notManageable when replay consumes the moved target", () => {
    const startTurn = vi.fn<StartTurn>(() => new Promise<TurnStartResponse>(() => undefined));
    const coordinator = createCoordinator({
      threadId: "thread-1",
      activeTurnId: "turn-active",
      startTurn,
      steerTurn: vi.fn<SteerTurn>(),
    });
    coordinator.submit(input("one"));
    coordinator.submit(input("target"));
    const target = pendingItem(coordinator, "ordinary", 1);
    let injected = false;
    coordinator.subscribe(() => {
      if (injected) return;
      injected = true;
      coordinator.observeAcceptedEvent(
        live(turnCompleted(eventTurnCompleted, "consume-target", baseTurn("turn-active"))),
      );
    });

    expect(
      coordinator.movePendingInput({
        key: target.key,
        revision: coordinator.getSnapshot().detailRevision,
        destination: "first",
      }),
    ).toEqual({
      type: "notManageable",
      scope: "liveOwner",
      revision: coordinator.getSnapshot().detailRevision,
    });
    expect(startTurn).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ input: input("target").input }),
    );
  });

  it.each(["initial", "replay"] as const)(
    "prioritizes ownerGone when the %s move publication replaces the owner",
    (publication) => {
      const startTurn = vi.fn<StartTurn>(() => new Promise<TurnStartResponse>(() => undefined));
      const coordinator = createCoordinator({
        threadId: "thread-1",
        activeTurnId: "turn-active",
        startTurn,
        steerTurn: vi.fn<SteerTurn>(),
      });
      coordinator.submit(input("one"));
      coordinator.submit(input("two"));
      const target = pendingItem(coordinator, "ordinary", 1);
      const activeTurnCompleted = live(
        turnCompleted(
          eventTurnCompleted,
          `${publication}-replace-completed`,
          baseTurn("turn-active"),
        ),
      );
      let listenerCall = 0;
      coordinator.subscribe(() => {
        listenerCall += 1;
        if (publication === "initial") {
          coordinator.observeAcceptedEvent(activeTurnCompleted);
          coordinator.dispose("ownerReplaced");
          return;
        }
        if (listenerCall === 1) {
          coordinator.observeAcceptedEvent(activeTurnCompleted);
        } else if (listenerCall === 2) {
          coordinator.dispose("ownerReplaced");
        }
      });

      expect(
        coordinator.movePendingInput({
          key: target.key,
          revision: coordinator.getSnapshot().detailRevision,
          destination: "first",
        }),
      ).toEqual({ type: "unavailable", scope: "ownerGone", reason: "ownerReplaced" });
      expect(startTurn).toHaveBeenCalledTimes(publication === "initial" ? 0 : 1);
      expect(listenerCall).toBe(publication === "initial" ? 1 : 2);
    },
  );

  it("rejects moves after disposal without publishing or issuing RPCs", () => {
    const startTurn = vi.fn<StartTurn>();
    const steerTurn = vi.fn<SteerTurn>();
    const coordinator = createCoordinator({
      threadId: "thread-1",
      activeTurnId: "turn-active",
      startTurn,
      steerTurn,
    });
    coordinator.submit(input("one"));
    coordinator.submit(input("two"));
    const target = pendingItem(coordinator, "ordinary", 1);
    const listener = vi.fn<() => void>();
    coordinator.subscribe(listener);
    coordinator.dispose();

    expect(
      coordinator.movePendingInput({
        key: target.key,
        revision: coordinator.getSnapshot().detailRevision,
        destination: "first",
      }),
    ).toEqual({ type: "unavailable", scope: "ownerGone", reason: "disposed" });
    expect(listener).not.toHaveBeenCalled();
    expect(startTurn).not.toHaveBeenCalled();
    expect(steerTurn).not.toHaveBeenCalled();
  });
});
