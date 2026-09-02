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
});
