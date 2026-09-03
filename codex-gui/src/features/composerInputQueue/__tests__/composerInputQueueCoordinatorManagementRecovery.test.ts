import { describe, expect, it, vi } from "vitest";
import {
  eventItemStarted,
  eventTurnCompleted,
} from "@/features/projection/__tests__/projectionFixtures";
import {
  baseTurn,
  eventWithEnvelope,
  itemStarted,
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
const flush = (): Promise<void> => Promise.resolve();
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
