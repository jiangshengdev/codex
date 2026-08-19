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
  TurnStartParams,
  TurnStartResponse,
  TurnSteerParams,
  TurnSteerResponse,
} from "@codex-protocol/v2";
import { createComposerInputQueueCoordinator as createCoordinator } from "../composerInputQueueCoordinator";

type Deferred = ReturnType<typeof deferredStart>;
type StartTurn = (params: TurnStartParams) => Promise<TurnStartResponse>;
type SteerTurn = (params: TurnSteerParams) => Promise<TurnSteerResponse>;
const input = (text: string): TurnStartParams["input"] => [
  { type: "text", text, text_elements: [] },
  { type: "skill", name: `skill-${text}`, path: `/example/skills/${text}/SKILL.md` },
];
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
      reserveAgain: coordinator.reserveRelease(),
    }).toEqual({
      readiness: { type: "blocked", blockers: [{ type: "releaseReserved" }] },
      submit: { type: "rejected", reason: "releaseReserved" },
      recover: false,
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
        input: input("first"),
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
      expect(startTurn.mock.calls[1]?.[0].input).toEqual(input("second"));
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
    expect(startTurn.mock.calls[0]?.[0].input).toEqual(input("unknown"));
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
    expect(definiteStart.mock.calls[1]?.[0].input).toEqual(input("deferred"));
    definiteRequests[1]?.resolve({ turn: baseTurn("turn-deferred") });
    await flush();
    definite.observeAcceptedEvent(
      live(turnCompleted(eventTurnCompleted, "commit-deferred", baseTurn("turn-deferred"))),
    );
    expect(definiteStart.mock.calls[2]?.[0].input).toEqual(input("rejected"));
  });

  it("recovers interrupted messages in FIFO order and preserves stable snapshots", async () => {
    const startTurn = vi.fn<StartTurn>(({ input }) =>
      Promise.resolve({ turn: baseTurn(input[0]?.type === "text" ? input[0].text : "unexpected") }),
    );
    const coordinator = createCoordinator({
      threadId: "thread-1",
      activeTurnId: "turn-active",
      startTurn,
      steerTurn: vi.fn<SteerTurn>(),
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
    coordinator.observeAcceptedEvent(
      live(
        turnCompleted(eventTurnCompleted, "commit-interrupt", {
          ...baseTurn("turn-active"),
          status: "interrupted",
        }),
      ),
    );
    expect(coordinator.getSnapshot()).toMatchObject({ queuedCount: 0, recoveryCount: 2 });
    expect(coordinator.recover()).toBe(true);
    expect(startTurn).toHaveBeenCalledTimes(1);
    await flush();
    coordinator.observeAcceptedEvent(
      live(turnCompleted(eventTurnCompleted, "commit-one", baseTurn("one"))),
    );
    expect(startTurn.mock.calls.map(([params]) => params.input)).toEqual([
      input("one"),
      input("two"),
    ]);
    expect(snapshots).toContainEqual({
      queuedCount: 0,
      recoveryCount: 2,
      recovery: { reason: "interrupted", count: 2 },
      isRecovering: true,
      pendingSteers: [],
      queuedSteers: [],
      rejectedSteers: [],
      hasUnknownSteer: false,
    });
    expect(releaseReadiness).toContainEqual({
      type: "blocked",
      blockers: [{ type: "recoveryPending", count: 2 }, { type: "recovering" }],
    });
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
  });

  it("sends exact steer identities, issues an accepted successor, and releases only its commit", async () => {
    const responses: Array<{
      promise: Promise<TurnSteerResponse>;
      resolve: (response: TurnSteerResponse) => void;
    }> = [];
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
      input: input("first"),
    });
    expect(firstParams?.clientUserMessageId).toMatch(/^composer-steer-/);
    expect(coordinator.getSnapshot()).toMatchObject({
      pendingSteers: [{ phase: "issuing", preview: { type: "text", text: "first" } }],
      queuedSteers: [{ preview: { type: "text", text: "second" } }],
      hasUnknownSteer: false,
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
    expect(steerTurn.mock.calls[1]?.[0].input).toEqual(input("second"));
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
    expect(coordinator.getSnapshot().pendingSteers).toMatchObject([
      { phase: "issuing", preview: { type: "text", text: "second" } },
    ]);

    coordinator.dispose();
    responses[1]?.resolve({ turnId: "turn-1" });
    await flush();
    expect(steerTurn).toHaveBeenCalledTimes(2);
  });

  it("copies every generated steer input variant into the wire request", () => {
    const steerTurn = vi.fn<SteerTurn>(() => new Promise<TurnSteerResponse>(() => undefined));
    const wireInput: TurnSteerParams["input"] = [
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
    const coordinator = createCoordinator({
      threadId: "thread-1",
      activeTurnId: "turn-1",
      startTurn: vi.fn<StartTurn>(),
      steerTurn,
    });

    coordinator.submitSteer(wireInput);

    const requestInput = steerTurn.mock.calls[0]?.[0].input;
    expect(requestInput).toEqual(wireInput);
    expect(requestInput).not.toBe(wireInput);
    expect(requestInput?.[0]).not.toBe(wireInput[0]);
    if (requestInput?.[0]?.type !== "text" || wireInput[0]?.type !== "text") {
      throw new Error("expected text inputs");
    }
    expect(requestInput[0].text_elements).not.toBe(wireInput[0].text_elements);
    expect(requestInput[0].text_elements[0]).not.toBe(wireInput[0].text_elements[0]);
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
      pendingSteers: [{ phase }],
      queuedSteers: [{ preview: { type: "text", text: "second" } }],
      hasUnknownSteer: true,
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
      { type: "text", text: "steer-a" },
      { type: "text", text: "steer-b" },
    ]);

    coordinator.observeAcceptedEvent(
      live(turnCompleted(eventTurnCompleted, "terminal-1", baseTurn("turn-1"))),
    );
    expect(startTurn).toHaveBeenCalledTimes(1);
    expect(startTurn.mock.calls[0]?.[0].input).toEqual([...input("steer-a"), ...input("steer-b")]);
    startRequest.reject(
      new GuiHostCommandError({
        source: "rpc",
        delivery: "definitelyNotAccepted",
        error: new Error("start rejected"),
      }),
    );
    await flush();
    expect(coordinator.getSnapshot()).toMatchObject({
      queuedCount: 1,
      rejectedSteers: [
        { preview: { type: "text", text: "steer-a" } },
        { preview: { type: "text", text: "steer-b" } },
      ],
    });
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
