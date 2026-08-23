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
import { copyComposerInputPayload } from "../composerInputPayload";
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
const deferredInterrupt = () => {
  let resolve!: (response: TurnInterruptResponse) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<TurnInterruptResponse>((yes, no) => {
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
  it("reserves a safe release, blocks queue operations until release, and rejects disposal", () => {
    const coordinator = createCoordinator({
      threadId: "thread-1",
      activeTurnId: "turn-active",
      startTurn: vi.fn<StartTurn>(),
      steerTurn: vi.fn<SteerTurn>(),
    });
    const reserved = coordinator.reserveRelease();

    if (reserved.type !== "reserved") throw new Error("expected a release reservation");
    expect({ type: reserved.type, release: typeof reserved.reservation.release }).toEqual({
      type: "reserved",
      release: "function",
    });
    expect({
      readiness: coordinator.getReleaseReadiness(),
      submit: coordinator.submit(input("blocked")),
      recover: coordinator.recover(),
      interrupt: coordinator.interruptActiveTurn(),
      reserveAgain: coordinator.reserveRelease(),
    }).toEqual({
      readiness: { type: "blocked", blockers: [{ type: "releaseReserved" }] },
      submit: { type: "rejected", reason: "releaseReserved" },
      recover: false,
      interrupt: false,
      reserveAgain: { type: "blocked", blockers: [{ type: "releaseReserved" }] },
    });

    reserved.reservation.release();
    expect({
      readiness: coordinator.getReleaseReadiness(),
      submit: coordinator.submit(input("accepted after release")),
    }).toEqual({ readiness: { type: "safe" }, submit: { type: "accepted" } });

    coordinator.dispose();
    expect(coordinator.reserveRelease()).toEqual({
      type: "blocked",
      blockers: [{ type: "disposed" }],
    });
    expect(coordinator.interruptActiveTurn()).toBe(false);
  });

  it("delegates bounded details and rejects stale, foreign, and disposed reads", () => {
    const createActive = (threadId: string) =>
      createCoordinator({
        threadId,
        activeTurnId: `turn-${threadId}`,
        startTurn: vi.fn<StartTurn>(),
        steerTurn: vi.fn<SteerTurn>(),
      });
    const coordinator = createActive("thread-1");
    const foreign = createActive("thread-2");
    for (const owner of [coordinator, foreign]) {
      owner.submit(input("one"));
      owner.submit(input("two"));
    }
    expect(coordinator.getSnapshot()).toMatchObject({
      ordinaryQueuedCount: 2,
      guidingCount: 0,
      detailRevision: 2,
    });
    expect(JSON.stringify(coordinator.getSnapshot())).not.toContain("one");
    expect(JSON.stringify(coordinator.getSnapshot())).not.toContain('"input"');
    const first = coordinator.readPendingInputPage({
      lane: "ordinary",
      revision: coordinator.getSnapshot().detailRevision,
      cursor: null,
      limit: 1,
    });
    if (first.type !== "page" || first.nextCursor == null) {
      throw new Error("expected bounded ordinary cursor");
    }
    expect(first.items).toMatchObject([
      { preview: { type: "text", text: "one", truncated: false } },
    ]);
    expect(
      foreign.readPendingInputPage({
        lane: "ordinary",
        revision: foreign.getSnapshot().detailRevision,
        cursor: first.nextCursor,
        limit: 1,
      }),
    ).toEqual({ type: "stale", revision: foreign.getSnapshot().detailRevision });

    const staleRevision = coordinator.getSnapshot().detailRevision;
    const longText = "x".repeat(200);
    coordinator.submit(composerDraftCapture(longText));
    expect(
      coordinator.readPendingInputPage({
        lane: "ordinary",
        revision: staleRevision,
        cursor: first.nextCursor,
        limit: 1,
      }),
    ).toEqual({ type: "stale", revision: coordinator.getSnapshot().detailRevision });
    const currentRevision = coordinator.getSnapshot().detailRevision;
    const current = coordinator.readPendingInputPage({
      lane: "ordinary",
      revision: currentRevision,
      cursor: null,
      limit: 10,
    });
    if (current.type !== "page") throw new Error("expected current ordinary details");
    const longItem = current.items.find(
      ({ preview }) => preview.type === "text" && preview.truncated,
    );
    if (longItem == null) throw new Error("expected truncated ordinary detail");
    expect(
      coordinator.readPendingInputDetail({ key: longItem.key, revision: currentRevision }),
    ).toEqual({ type: "detail", key: longItem.key, revision: currentRevision, text: longText });

    coordinator.dispose();
    expect(
      coordinator.readPendingInputPage({
        lane: "ordinary",
        revision: currentRevision,
        cursor: null,
        limit: 1,
      }),
    ).toEqual({ type: "unavailable", scope: "ownerGone", reason: "disposed" });
    expect(
      coordinator.readPendingInputDetail({ key: longItem.key, revision: currentRevision }),
    ).toEqual({ type: "unavailable", scope: "ownerGone", reason: "disposed" });
  });

  it("rechecks interrupt ownership after an issuing listener disposes synchronously", () => {
    const interruptTurn = vi.fn<InterruptTurn>();
    const coordinator = createCoordinator({
      threadId: "thread-1",
      activeTurnId: "turn-active",
      startTurn: vi.fn<StartTurn>(),
      steerTurn: vi.fn<SteerTurn>(),
      interruptTurn,
    });
    const listener = vi.fn<
      Parameters<ReturnType<typeof createComposerInputQueueCoordinator>["subscribe"]>[0]
    >(() => {
      expect(coordinator.getSnapshot().interrupt).toEqual({ phase: "issuing" });
      coordinator.dispose();
    });
    coordinator.subscribe(listener);

    expect(coordinator.interruptActiveTurn()).toBe(true);
    expect(interruptTurn).not.toHaveBeenCalled();
    expect(coordinator.getSnapshot()).toMatchObject({ canStop: false, interrupt: null });
    expect(coordinator.getReleaseReadiness()).toEqual({
      type: "blocked",
      blockers: [{ type: "disposed" }],
    });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("exposes its owner and combines queue release readiness without treating an active turn as blocked", async () => {
    const active = createCoordinator({
      threadId: "thread-active",
      activeTurnId: "turn-active",
      startTurn: vi.fn<StartTurn>(),
      steerTurn: vi.fn<SteerTurn>(),
    });
    expect(active.ownerThreadId).toBe("thread-active");
    expect(active.getReleaseReadiness()).toEqual({ type: "safe" });
    active.submit(input("ordinary"));
    expect(active.getReleaseReadiness()).toEqual({
      type: "blocked",
      blockers: [{ type: "ordinaryQueued", count: 1 }],
    });

    const request = deferredStart();
    const startTurn = vi.fn<StartTurn>(() => request.promise);
    const coordinator = createCoordinator({
      threadId: "thread-1",
      activeTurnId: null,
      startTurn,
      steerTurn: vi.fn<SteerTurn>(),
    });
    expect(coordinator.interruptActiveTurn()).toBe(false);
    coordinator.submit(input("pending"));
    expect(coordinator.getReleaseReadiness()).toEqual({
      type: "blocked",
      blockers: [{ type: "pendingStart", phase: "issuing" }],
    });
    request.resolve({ turn: baseTurn("turn-1") });
    await flush();
    expect(coordinator.getReleaseReadiness()).toEqual({
      type: "blocked",
      blockers: [{ type: "pendingStart", phase: "acceptedAwaitingRuntime" }],
    });

    const clientId = startTurn.mock.calls[0]?.[0].clientUserMessageId;
    coordinator.observeAcceptedEvent(
      live(
        itemStarted(
          eventItemStarted,
          "commit-pending",
          "turn-1",
          committedUserMessage(clientId ?? "missing-client-id"),
        ),
      ),
    );
    expect(coordinator.getReleaseReadiness()).toEqual({ type: "safe" });
  });

  it.each(["completed", "failed"] as const)(
    "starts, observes projection before settlement, and drains a %s turn",
    async (status) => {
      const starts: Deferred[] = [];
      const startTurn = vi.fn<StartTurn>(() => {
        const request = deferredStart();
        starts.push(request);
        return request.promise;
      });
      const coordinator = createCoordinator({
        threadId: "thread-1",
        activeTurnId: null,
        startTurn,
        steerTurn: vi.fn<SteerTurn>(),
      });
      expect(coordinator.submit(input("first"))).toEqual({ type: "accepted" });
      expect(coordinator.submit(input("second"))).toEqual({ type: "accepted" });
      expect(startTurn.mock.calls[0]?.[0]).toMatchObject({
        threadId: "thread-1",
        input: input("first").input,
      });
      const clientId = startTurn.mock.calls[0]?.[0].clientUserMessageId;
      coordinator.observeAcceptedEvent(
        live(
          itemStarted(
            eventItemStarted,
            "commit-first",
            "turn-1",
            committedUserMessage(clientId ?? "missing-client-id"),
          ),
        ),
      );
      starts[0]?.resolve({ turn: baseTurn("turn-1") });
      await flush();
      coordinator.observeAcceptedEvent(
        live(
          turnCompleted(eventTurnCompleted, "commit-end", {
            ...baseTurn("turn-1"),
            status,
          }),
        ),
      );
      expect(startTurn).toHaveBeenCalledTimes(2);
      expect(startTurn.mock.calls[1]?.[0].input).toEqual(input("second").input);
    },
  );

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
    await flush();
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
    await flush();
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
    await flush();
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
    await flush();
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
    await flush();
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
    await flush();
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
    await flush();
    coordinator.observeAcceptedEvent(
      live(turnCompleted(eventTurnCompleted, "commit-steer", baseTurn("steer"))),
    );
    coordinator.observeAcceptedEvent(
      live(turnCompleted(eventTurnCompleted, "commit-one", baseTurn("one"))),
    );
    await flush();
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
    await flush();
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
    await flush();
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
      await flush();
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
    await flush();
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
    await flush();
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
    await flush();
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
    await flush();
    expect(interrupted.getSnapshot()).toBe(interruptSnapshot);
    expect(interrupted.getReleaseReadiness()).toEqual({
      type: "blocked",
      blockers: [{ type: "disposed" }],
    });
    expect(interruptListener).toHaveBeenCalledTimes(notificationsAtDisposal);
  });

  it("sends exact steer identities, issues an accepted successor, and releases only its commit", async () => {
    const responses: {
      promise: Promise<TurnSteerResponse>;
      resolve: (response: TurnSteerResponse) => void;
    }[] = [];
    const steerTurn = vi.fn<SteerTurn>(() => {
      let resolve!: (response: TurnSteerResponse) => void;
      const promise = new Promise<TurnSteerResponse>((yes) => {
        resolve = yes;
      });
      responses.push({ promise, resolve });
      return promise;
    });
    const coordinator = createCoordinator({
      threadId: "thread-1",
      activeTurnId: "turn-1",
      startTurn: vi.fn<StartTurn>(),
      steerTurn,
    });
    coordinator.submitSteer(input("first"));
    coordinator.submitSteer(input("second"));
    const firstParams = steerTurn.mock.calls[0]?.[0];
    expect(firstParams).toEqual({
      threadId: "thread-1",
      expectedTurnId: "turn-1",
      clientUserMessageId: firstParams?.clientUserMessageId,
      input: input("first").input,
    });
    expect(firstParams?.clientUserMessageId).toMatch(/^composer-steer-/);
    expect(coordinator.getSnapshot()).toMatchObject({
      guidingCount: 2,
      ordinaryQueuedCount: 0,
      hasUnknownSteer: false,
    });
    const initialDetails = coordinator.readPendingInputPage({
      lane: "steer",
      revision: coordinator.getSnapshot().detailRevision,
      cursor: null,
      limit: 10,
    });
    expect(initialDetails).toMatchObject({
      type: "page",
      items: [
        { preview: { type: "text", text: "first", truncated: false } },
        { preview: { type: "text", text: "second", truncated: false } },
      ],
    });
    const serializedSnapshot = JSON.stringify(coordinator.getSnapshot());
    expect(serializedSnapshot).not.toContain("/example/skills/");
    expect(serializedSnapshot).not.toContain('"input":');
    expect(serializedSnapshot).not.toContain('"path":');
    expect(serializedSnapshot).not.toContain('"claim":');
    expect(serializedSnapshot).not.toContain('"error":');
    expect(serializedSnapshot).not.toContain("clientUserMessageId");

    responses[0]?.resolve({ turnId: "turn-1" });
    await flush();
    expect(steerTurn).toHaveBeenCalledTimes(2);
    expect(steerTurn.mock.calls[1]?.[0].input).toEqual(input("second").input);
    coordinator.observeAcceptedEvent(
      live(
        itemStarted(
          eventItemStarted,
          "commit-first",
          "turn-1",
          committedUserMessage(firstParams?.clientUserMessageId ?? "missing-client-id"),
        ),
      ),
    );
    const remainingDetails = coordinator.readPendingInputPage({
      lane: "steer",
      revision: coordinator.getSnapshot().detailRevision,
      cursor: null,
      limit: 10,
    });
    expect(remainingDetails).toMatchObject({
      type: "page",
      items: [{ preview: { type: "text", text: "second", truncated: false } }],
    });

    coordinator.dispose();
    responses[1]?.resolve({ turnId: "turn-1" });
    await flush();
    expect(steerTurn).toHaveBeenCalledTimes(2);
  });

  it("copies every generated input variant without retaining mutable aliases", () => {
    const payload: TurnSteerParams["input"] = [
      {
        type: "text",
        text: "@agent",
        text_elements: [{ byteRange: { start: 0, end: 6 }, placeholder: "agent" }],
      },
      { type: "image", detail: "high", url: "https://example.test/image.png" },
      { type: "localImage", detail: "low", path: "/tmp/image.png" },
      { type: "audio", url: "https://example.test/audio.wav" },
      { type: "localAudio", path: "/tmp/audio.wav" },
      { type: "skill", name: "skill-name", path: "/tmp/SKILL.md" },
      { type: "mention", name: "agent", path: "/tmp/agent.md" },
    ];

    const copied = copyComposerInputPayload(payload);

    expect(copied).toEqual(payload);
    expect(copied).not.toBe(payload);
    for (const [index, item] of copied.entries()) {
      expect(item).not.toBe(payload[index]);
    }
    const copiedText = copied[0];
    const sourceText = payload[0];
    if (copiedText?.type !== "text" || sourceText?.type !== "text") {
      throw new Error("expected text input items");
    }
    expect(copiedText.text_elements).not.toBe(sourceText.text_elements);
    expect(copiedText.text_elements[0]).not.toBe(sourceText.text_elements[0]);
  });

  it("sends the exact text and skill input captured with the opaque draft", () => {
    const steerTurn = vi.fn<SteerTurn>(() => new Promise<TurnSteerResponse>(() => undefined));
    const capture = composerDraftCapture("Use ", {
      skill: {
        name: "skill-name",
        path: "/tmp/SKILL.md",
        displayName: "Skill name",
        sourceLabel: "Test",
      },
    });
    const coordinator = createCoordinator({
      threadId: "thread-1",
      activeTurnId: "turn-1",
      startTurn: vi.fn<StartTurn>(),
      steerTurn,
    });

    coordinator.submitSteer(capture);

    const requestInput = steerTurn.mock.calls[0]?.[0].input;
    expect(requestInput).toEqual(capture.input);
    expect(requestInput).not.toBe(capture.input);
    expect(requestInput?.[0]).not.toBe(capture.input[0]);
  });

  it.each([
    ["responseTurnMismatch", "response"],
    ["deliveryUnknown", "error"],
  ] as const)("keeps %s blocked without issuing a successor", async (phase, settlement) => {
    let resolve!: (response: TurnSteerResponse) => void;
    let reject!: (error: unknown) => void;
    const steerTurn = vi.fn<SteerTurn>(
      () =>
        new Promise<TurnSteerResponse>((yes, no) => {
          resolve = yes;
          reject = no;
        }),
    );
    const coordinator = createCoordinator({
      threadId: "thread-1",
      activeTurnId: "turn-1",
      startTurn: vi.fn<StartTurn>(),
      steerTurn,
    });
    coordinator.submitSteer(input("first"));
    coordinator.submitSteer(input("second"));
    if (settlement === "response") {
      resolve({ turnId: "turn-other" });
    } else {
      reject(new Error("delivery is unknown"));
    }
    await flush();

    expect(steerTurn).toHaveBeenCalledTimes(1);
    expect(coordinator.getSnapshot()).toMatchObject({
      guidingCount: 2,
      hasUnknownSteer: true,
    });
    expect(["responseTurnMismatch", "deliveryUnknown"]).toContain(phase);
    expect(
      coordinator.readPendingInputPage({
        lane: "steer",
        revision: coordinator.getSnapshot().detailRevision,
        cursor: null,
        limit: 10,
      }),
    ).toMatchObject({
      type: "page",
      items: [
        { preview: { type: "text", text: "first", truncated: false } },
        { preview: { type: "text", text: "second", truncated: false } },
      ],
    });
    expect(coordinator.getReleaseReadiness()).toEqual({
      type: "blocked",
      blockers: [
        { type: "steerQueued", count: 1 },
        { type: "pendingSteers", count: 1, hasUnknown: true },
      ],
    });
  });

  it("preserves structured rejections for a terminal merge before ordinary start", async () => {
    let rejectSteer!: (error: unknown) => void;
    const steerTurn = vi.fn<SteerTurn>(
      () =>
        new Promise<TurnSteerResponse>((_resolve, reject) => {
          rejectSteer = reject;
        }),
    );
    const startRequest = deferredStart();
    const startTurn = vi.fn<StartTurn>(() => startRequest.promise);
    const coordinator = createCoordinator({
      threadId: "thread-1",
      activeTurnId: "turn-1",
      startTurn,
      steerTurn,
    });
    coordinator.submit(input("ordinary"));
    coordinator.submitSteer(input("steer-a"));
    coordinator.submitSteer(input("steer-b"));
    rejectSteer(
      new GuiHostCommandError({
        source: "rpc",
        delivery: "definitelyNotAccepted",
        error: new Error("cannot steer"),
        rpcError: {
          code: -32000,
          message: "cannot steer",
          data: {
            message: "cannot steer",
            codexErrorInfo: { activeTurnNotSteerable: { turnKind: "review" } },
            additionalDetails: null,
          },
        },
      }),
    );
    await flush();
    expect(coordinator.getSnapshot().rejectedSteers.map(({ preview }) => preview)).toEqual([
      { type: "text", text: "steer-a", truncated: false },
      { type: "text", text: "steer-b", truncated: false },
    ]);

    coordinator.observeAcceptedEvent(
      live(turnCompleted(eventTurnCompleted, "terminal-1", baseTurn("turn-1"))),
    );
    expect(startTurn).toHaveBeenCalledTimes(1);
    expect(startTurn.mock.calls[0]?.[0].input).toEqual([
      ...input("steer-a").input,
      ...input("steer-b").input,
    ]);
    startRequest.reject(
      new GuiHostCommandError({
        source: "rpc",
        delivery: "definitelyNotAccepted",
        error: new Error("start rejected"),
      }),
    );
    await flush();
    expect(coordinator.getSnapshot()).toMatchObject({
      ordinaryQueuedCount: 1,
      rejectedSteers: [
        { preview: { type: "text", text: "steer-a", truncated: false } },
        { preview: { type: "text", text: "steer-b", truncated: false } },
      ],
    });
  });

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
    expect(() => singleFailure.coordinator.observeAcceptedEvent(singleFailure.committed)).toThrow(
      replayError,
    );
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
    coordinator.subscribe(() => coordinator.dispose("ownerReplaced"));

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
    duringBegin.subscribe(() => duringBegin.dispose("ownerReplaced"));
    expect(
      duringBegin.beginPendingInputEdit(
        { key: beginItem.key, revision: duringBegin.getSnapshot().detailRevision },
        () => ({ type: "restored" }),
      ),
    ).toEqual(ownerGone);

    const duringDelete = createQueued();
    const deleteItem = pendingItem(duringDelete, "ordinary");
    duringDelete.subscribe(() => duringDelete.dispose("ownerReplaced"));
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
      duringSettlement.subscribe(() => duringSettlement.dispose("ownerReplaced"));
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
