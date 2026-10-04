import { describe, expect, it, vi } from "vitest";
import {
  eventItemStarted,
  eventTurnCompleted,
} from "@/features/projection/__tests__/projectionFixtures";
import {
  baseTurn,
  itemStarted,
  turnCompleted,
} from "@/features/projection/__tests__/projectionTestBuilders";
import { GuiHostCommandError } from "@/features/guiHost/guiHostCommandGateway";
import type { TurnSteerResponse } from "@codex-protocol/v2";
import {
  committedUserMessage,
  createCoordinator,
  deferredStart,
  live,
  nextMicrotask,
  pendingItem,
  type StartTurn,
  type SteerTurn,
} from "./composerInputQueueCoordinatorTestFixtures";
import { composerCapture as input, composerDraftCapture } from "./composerInputQueueTestFixtures";

type Deferred = ReturnType<typeof deferredStart>;
describe("ComposerInputQueueCoordinator", () => {
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
    await nextMicrotask();
    expect(coordinator.getSnapshot().recovery?.reason).toBe("startDefinitelyNotAccepted");
    expect(begun.reservation.cancel()).toMatchObject({ type: "cancelled" });
    expect(startTurn).toHaveBeenCalledTimes(1);

    expect(coordinator.recover()).toBe(true);
    expect(startTurn.mock.calls.map(([params]) => params.input)).toEqual([
      input("failed").input,
      input("successor").input,
    ]);
    requests[1]?.resolve({ turn: baseTurn("turn-successor") });
    await nextMicrotask();
    coordinator.observeAcceptedEvent(
      live(turnCompleted(eventTurnCompleted, "successor-terminal", baseTurn("turn-successor"))),
    );
    expect(startTurn.mock.calls[2]?.[0].input).toEqual(input("reserved").input);
    requests[2]?.resolve({ turn: baseTurn("turn-reserved") });
    await nextMicrotask();
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
    await nextMicrotask();

    expect(begun.reservation.save(composerDraftCapture("edited reserved"))).toMatchObject({
      type: "saved",
    });
    expect(startTurn).toHaveBeenCalledTimes(1);
    expect(coordinator.recover()).toBe(true);
    expect(startTurn.mock.calls[1]?.[0].input).toEqual(input("edited reserved").input);
    requests[1]?.resolve({ turn: baseTurn("turn-edited") });
    await nextMicrotask();
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
    await nextMicrotask();
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
    await nextMicrotask();
    coordinator.observeAcceptedEvent(
      live(turnCompleted(eventTurnCompleted, "successor-terminal", baseTurn("turn-successor"))),
    );
    expect(startTurn.mock.calls[2]?.[0].input).toEqual(input("failed").input);
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
    await nextMicrotask();
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
    await nextMicrotask();
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
    await nextMicrotask();
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
    await nextMicrotask();
    expect(coordinator.getSnapshot()).toMatchObject({
      recoveryCount: 1,
      recovery: { reason: "steerDefinitelyNotAccepted", count: 1 },
    });
    expect(coordinator.recover()).toBe(true);
    expect(steerTurn).toHaveBeenCalledTimes(2);
    expect(steerTurn.mock.calls[1]?.[0]).toEqual(steerTurn.mock.calls[0]?.[0]);
  });
});
