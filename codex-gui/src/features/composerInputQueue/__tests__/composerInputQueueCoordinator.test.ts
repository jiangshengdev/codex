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
import type { ThreadItem, TurnStartParams, TurnStartResponse } from "@codex-protocol/v2";
import { createComposerInputQueueCoordinator as createCoordinator } from "../composerInputQueueCoordinator";

type Deferred = ReturnType<typeof deferredStart>;
type StartTurn = (params: TurnStartParams) => Promise<TurnStartResponse>;
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
      });
      expect(coordinator.submit("first")).toEqual({ type: "accepted" });
      expect(coordinator.submit("second")).toEqual({ type: "accepted" });
      expect(startTurn.mock.calls[0]?.[0]).toMatchObject({
        threadId: "thread-1",
        input: [{ type: "text", text: "first", text_elements: [] }],
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
      expect(startTurn.mock.calls[1]?.[0].input).toEqual([
        { type: "text", text: "second", text_elements: [] },
      ]);
    },
  );

  it("keeps delivery-unknown blocked and recovers a definite rejection before deferred start", async () => {
    const requests: Deferred[] = [];
    const startTurn = vi.fn<StartTurn>(() => {
      const request = deferredStart();
      requests.push(request);
      return request.promise;
    });
    const coordinator = createCoordinator({ threadId: "thread-1", activeTurnId: null, startTurn });
    coordinator.submit("unknown");
    coordinator.submit("queued");
    requests[0]?.reject(
      new GuiHostCommandError({
        source: "missingResult",
        delivery: "deliveryUnknown",
        error: new Error(),
      }),
    );
    await flush();
    expect(startTurn).toHaveBeenCalledTimes(1);

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
    });
    definite.submit("rejected");
    definite.submit("deferred");
    definiteRequests[0]?.reject(
      new GuiHostCommandError({
        source: "rpc",
        delivery: "definitelyNotAccepted",
        error: new Error(),
      }),
    );
    await flush();
    expect(definite.getSnapshot().recoveryCount).toBe(1);
    expect(definite.submit("blocked")).toEqual({ type: "rejected", reason: "recoveryPending" });
    expect(definiteStart).toHaveBeenCalledTimes(1);
    expect(definite.recover()).toBe(true);
    expect(definite.recover()).toBe(false);
    expect(definiteStart).toHaveBeenCalledTimes(2);
    expect(definiteStart.mock.calls[1]?.[0].input[0]).toMatchObject({ text: "deferred" });
    definiteRequests[1]?.resolve({ turn: baseTurn("turn-deferred") });
    await flush();
    definite.observeAcceptedEvent(
      live(turnCompleted(eventTurnCompleted, "commit-deferred", baseTurn("turn-deferred"))),
    );
    expect(definiteStart.mock.calls[2]?.[0].input[0]).toMatchObject({ text: "rejected" });
  });

  it("recovers interrupted messages in FIFO order and preserves stable snapshots", async () => {
    const startTurn = vi.fn<StartTurn>(({ input }) =>
      Promise.resolve({ turn: baseTurn(input[0]?.type === "text" ? input[0].text : "unexpected") }),
    );
    const coordinator = createCoordinator({
      threadId: "thread-1",
      activeTurnId: "turn-active",
      startTurn,
    });
    const initial = coordinator.getSnapshot();
    const snapshots: unknown[] = [];
    coordinator.subscribe(() => snapshots.push(coordinator.getSnapshot()));
    coordinator.observeAcceptedEvent({
      notification: eventWithEnvelope(eventItemStarted, { threadId: "thread-1" }),
      replay: "snapshotDuplicate",
    });
    expect(coordinator.getSnapshot()).toBe(initial);
    coordinator.submit("one");
    coordinator.submit("two");
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
    expect(startTurn.mock.calls.map(([params]) => params.input[0])).toEqual([
      { type: "text", text: "one", text_elements: [] },
      { type: "text", text: "two", text_elements: [] },
    ]);
    expect(snapshots).toContainEqual({ queuedCount: 0, recoveryCount: 2, isRecovering: true });
  });

  it("ignores mismatched events and settlements after disposal", async () => {
    const request = deferredStart();
    const startTurn = vi.fn<StartTurn>(() => request.promise);
    const coordinator = createCoordinator({ threadId: "thread-1", activeTurnId: null, startTurn });
    coordinator.submit("first");
    coordinator.observeAcceptedEvent({
      notification: { ...eventItemStarted, threadId: "thread-2" },
      replay: "live",
    });
    coordinator.dispose();
    const queued = createCoordinator({ threadId: "thread-1", activeTurnId: "active", startTurn });
    queued.submit("queued");
    queued.dispose();
    queued.observeAcceptedEvent(
      live(turnCompleted(eventTurnCompleted, "commit", baseTurn("active"))),
    );
    expect(startTurn).toHaveBeenCalledTimes(1);
    request.resolve({ turn: baseTurn("turn-1") });
    await flush();
    expect(coordinator.submit("late")).toEqual({ type: "rejected", reason: "disposed" });
    expect(startTurn).toHaveBeenCalledTimes(1);
  });
});
