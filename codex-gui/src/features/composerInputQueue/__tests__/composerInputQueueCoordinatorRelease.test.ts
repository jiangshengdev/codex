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
import type { ComposerInputQueueCoordinator } from "../composerInputQueueCoordinator";
import {
  committedUserMessage,
  createCoordinator,
  deferredStart,
  live,
  nextMicrotask,
  type InterruptTurn,
  type StartTurn,
  type SteerTurn,
} from "./composerInputQueueCoordinatorTestFixtures";
import { composerCapture as input, composerDraftCapture } from "./composerInputQueueTestFixtures";

type Deferred = ReturnType<typeof deferredStart>;
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
    const listener = vi.fn<Parameters<ComposerInputQueueCoordinator["subscribe"]>[0]>(() => {
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
    await nextMicrotask();
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
      await nextMicrotask();
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
});
