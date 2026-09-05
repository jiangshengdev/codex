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
import {
  committedUserMessage,
  createCoordinator,
  deferredStart,
  live,
  nextMicrotask,
  type StartTurn,
  type SteerTurn,
} from "./composerInputQueueCoordinatorTestFixtures";
import { composerCapture as input } from "./composerInputQueueTestFixtures";

type Deferred = ReturnType<typeof deferredStart>;
describe("ComposerInputQueueCoordinator", () => {
  it("keeps delivery-unknown blocked and recovers a definite rejection before deferred start", async () => {
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
    coordinator.submit(input("unknown"));
    coordinator.submit(input("queued"));
    requests[0]?.reject(
      new GuiHostCommandError({
        source: "missingResult",
        delivery: "deliveryUnknown",
        error: new Error(),
      }),
    );
    await nextMicrotask();
    expect(startTurn).toHaveBeenCalledTimes(1);
    expect(startTurn.mock.calls[0]?.[0].input).toEqual(input("unknown").input);
    expect(coordinator.getReleaseReadiness()).toEqual({
      type: "blocked",
      blockers: [
        { type: "ordinaryQueued", count: 1 },
        { type: "pendingStart", phase: "deliveryUnknown" },
      ],
    });

    const definiteRequests: Deferred[] = [];
    const definiteStart = vi.fn<StartTurn>(() => {
      const request = deferredStart();
      definiteRequests.push(request);
      return request.promise;
    });
    const definite = createCoordinator({
      threadId: "thread-1",
      activeTurnId: null,
      startTurn: definiteStart,
      steerTurn: vi.fn<SteerTurn>(),
    });
    definite.submit(input("rejected"));
    definite.submit(input("deferred"));
    definiteRequests[0]?.reject(
      new GuiHostCommandError({
        source: "rpc",
        delivery: "definitelyNotAccepted",
        error: new Error(),
      }),
    );
    await nextMicrotask();
    expect(definite.getSnapshot().recoveryCount).toBe(1);
    expect(definite.getReleaseReadiness()).toEqual({
      type: "blocked",
      blockers: [
        { type: "pendingStart", phase: "issuing" },
        { type: "recoveryPending", count: 1 },
      ],
    });
    expect(definite.submit(input("blocked"))).toEqual({
      type: "rejected",
      reason: "recoveryPending",
    });
    expect(definiteStart).toHaveBeenCalledTimes(1);
    expect(definite.recover()).toBe(true);
    expect(definite.recover()).toBe(false);
    expect(definiteStart).toHaveBeenCalledTimes(2);
    expect(definiteStart.mock.calls[1]?.[0].input).toEqual(input("deferred").input);
    definiteRequests[1]?.resolve({ turn: baseTurn("turn-deferred") });
    await nextMicrotask();
    definite.observeAcceptedEvent(
      live(turnCompleted(eventTurnCompleted, "commit-deferred", baseTurn("turn-deferred"))),
    );
    expect(definiteStart.mock.calls[2]?.[0].input).toEqual(input("rejected").input);
  });

  it("classifies an interrupted start after accepted or delivery-unknown owner evidence", async () => {
    const acceptedRequest = deferredStart();
    const acceptedStart = vi
      .fn<StartTurn>()
      .mockImplementationOnce(() => acceptedRequest.promise)
      .mockResolvedValue({ turn: baseTurn("accepted-next") });
    const accepted = createCoordinator({
      threadId: "thread-1",
      activeTurnId: null,
      startTurn: acceptedStart,
      steerTurn: vi.fn<SteerTurn>(),
    });
    accepted.submit(input("accepted-owner"));
    accepted.submit(input("accepted-next"));
    accepted.observeAcceptedEvent(
      live(
        turnCompleted(eventTurnCompleted, "accepted-terminal", {
          ...baseTurn("accepted-owner"),
          status: "interrupted",
        }),
      ),
    );
    expect(acceptedStart).toHaveBeenCalledTimes(1);
    acceptedRequest.resolve({ turn: baseTurn("accepted-owner") });
    await nextMicrotask();
    expect(acceptedStart.mock.calls.map(([params]) => params.input)).toEqual([
      input("accepted-owner").input,
      input("accepted-next").input,
    ]);
    expect(accepted.getSnapshot().recovery).toBeNull();

    const unknownRequest = deferredStart();
    const unknownStart = vi
      .fn<StartTurn>()
      .mockImplementationOnce(() => unknownRequest.promise)
      .mockResolvedValue({ turn: baseTurn("unknown-next") });
    const unknown = createCoordinator({
      threadId: "thread-1",
      activeTurnId: null,
      startTurn: unknownStart,
      steerTurn: vi.fn<SteerTurn>(),
    });
    unknown.submit(input("unknown-owner"));
    unknown.submit(input("unknown-next"));
    const clientId = unknownStart.mock.calls[0]?.[0].clientUserMessageId;
    unknown.observeAcceptedEvent(
      live(
        turnCompleted(eventTurnCompleted, "unknown-terminal", {
          ...baseTurn("unknown-owner"),
          status: "interrupted",
        }),
      ),
    );
    unknownRequest.reject(new Error("delivery is unknown"));
    await nextMicrotask();
    expect(unknownStart).toHaveBeenCalledTimes(1);
    unknown.observeAcceptedEvent(
      live(
        itemStarted(
          eventItemStarted,
          "unknown-commit",
          "unknown-owner",
          committedUserMessage(clientId ?? "missing-client-id"),
        ),
      ),
    );
    expect(unknownStart.mock.calls.map(([params]) => params.input)).toEqual([
      input("unknown-owner").input,
      input("unknown-next").input,
    ]);
    expect(unknown.getSnapshot().recovery).toBeNull();
  });
});
