import { describe, expect, it, vi } from "vitest";
import { exportComposerDraft } from "@/features/composerEditor/composerDraft";
import { GuiHostCommandError } from "@/features/guiHost/guiHostCommandGateway";
import {
  createCoordinator,
  deferredStart,
  live,
  pendingItem,
  type InterruptTurn,
  type StartTurn,
  type SteerTurn,
} from "./composerInputQueueCoordinatorTestFixtures";
import { composerDraftCapture } from "./composerInputQueueTestFixtures";
import {
  baseTurn,
  inProgressTurn,
  turnCompleted,
} from "@/features/projection/__tests__/projectionTestBuilders";
import { eventTurnCompleted } from "@/features/projection/__tests__/projectionFixtures";
import { createComposerInputQueue, type RecoveryBatch } from "../composerInputQueue";
import { createComposerInterruptState } from "../composerInterruptState";
import { composerQueueMessage } from "./composerInputQueueTestFixtures";

function persistenceFixture() {
  const records = new Map<string, string>();
  let failWrites = false;
  return {
    records,
    failWrites: (value: boolean) => {
      failWrites = value;
    },
    context: {
      authorizationContext: "test-authorization",
      storage: {
        getItem: (key: string) => records.get(key) ?? null,
        setItem: (key: string, value: string) => {
          if (failWrites) throw new Error("storage quota exhausted");
          records.set(key, value);
        },
      },
    },
  };
}

function owner(fixture: ReturnType<typeof persistenceFixture>, activeTurnId: string | null) {
  const startTurn = vi.fn<StartTurn>(() => new Promise(() => undefined));
  const steerTurn = vi.fn<SteerTurn>(() => new Promise(() => undefined));
  const coordinator = createCoordinator({
    threadId: "thread-1",
    activeTurnId,
    startTurn,
    steerTurn,
    persistence: fixture.context,
  });
  coordinator.completeRestoreReconciliation();
  return { coordinator, startTurn, steerTurn };
}

describe("coordinator persistence boundaries", () => {
  it.each(["restore", "projection"])(
    "merges an old accepted message and a newer pending interrupt through %s",
    (entrypoint) => {
      const fixture = persistenceFixture();
      const queue = createComposerInputQueue({ threadId: "thread-1", activeTurnId: "old-turn" });
      queue.submitSteer(composerQueueMessage("old guidance"));
      queue.observe({
        type: "turnCompleted",
        turnId: "old-turn",
        status: "completed",
        commitId: "old-terminal",
      });
      queue.observe({ type: "turnStarted", turnId: "new-turn", commitId: "new-start" });
      queue.submit(composerQueueMessage("new ordinary"));
      const state = queue.exportState(null);
      const legacy = {
        ...state,
        version: 1,
        steer: {
          ...state.steer,
          pending: state.steer.pending.map((entry) => ({
            ...entry,
            phase: "acceptedAwaitingCommit",
          })),
          closedTargets: state.steer.closedTargets.map(({ target, ...identity }) => ({
            ...identity,
            target: { reason: target.reason, rejectionBatch: target.rejectionBatch },
          })),
        },
      };
      const interrupt = createComposerInterruptState();
      interrupt.transition({
        type: "issue",
        params: { threadId: "thread-1", turnId: "new-turn" },
        generation: 1,
      });
      fixture.context.storage.setItem(
        "codex-gui.browserPersistence.thread-1",
        JSON.stringify({
          version: 1,
          authorizationContext: fixture.context.authorizationContext,
          threadId: "thread-1",
          revision: 1,
          payload: {
            version: 1,
            queue: legacy,
            draft: null,
            interrupt: interrupt.exportState(),
            failedInterruptTurnId: null,
          },
        }),
      );
      const startTurn = vi.fn<StartTurn>(() => new Promise(() => undefined));
      const coordinator = createCoordinator({
        threadId: "thread-1",
        activeTurnId: null,
        startTurn,
        steerTurn: vi.fn<SteerTurn>(),
        persistence: fixture.context,
      });
      const turns = [
        baseTurn("old-turn"),
        { ...baseTurn("new-turn"), status: "interrupted" as const },
      ];
      coordinator.setConnectionUnavailable(entrypoint === "projection");
      let result: ReturnType<typeof coordinator.reconcileProjection> | null = null;
      if (entrypoint === "restore") coordinator.reconcileRestoredTurns(turns);
      else result = coordinator.reconcileProjection(turns, []);
      expect(result).toEqual(entrypoint === "restore" ? null : { type: "committed" });
      coordinator.setConnectionUnavailable(false);
      coordinator.completeRestoreReconciliation();
      expect(coordinator.getSnapshot()).toMatchObject({
        guidingCount: 0,
        ordinaryQueuedCount: 0,
        recoveryCount: 2,
        interrupt: null,
        persistence: { error: null },
      });
      expect(startTurn).not.toHaveBeenCalled();
      coordinator.dispose();
      const restored = owner(fixture, null);
      expect(restored.coordinator.getSnapshot().recoveryCount).toBe(2);
      expect(restored.coordinator.recover()).toBe(true);
      expect(
        restored.coordinator.resumeRestored(
          restored.coordinator.getSnapshot().persistence.revision,
        ),
      ).toBe(true);
      expect(restored.startTurn.mock.calls[0]?.[0].input).toEqual(
        composerQueueMessage("old guidance").input,
      );
      expect(restored.coordinator.getSnapshot().ordinaryQueuedCount).toBe(1);
      restored.coordinator.dispose();
    },
  );

  it.each(["startDefinitelyNotAccepted", "steerDefinitelyNotAccepted", "userStopped"] as const)(
    "merges legacy acceptance with %s recovery and preserves it through write failure",
    (reason) => {
      const fixture = persistenceFixture();
      const queue = createComposerInputQueue({
        threadId: "thread-1",
        activeTurnId:
          reason === "startDefinitelyNotAccepted"
            ? null
            : reason === "steerDefinitelyNotAccepted"
              ? "legacy-turn"
              : "prior-turn",
      });
      let batch: RecoveryBatch;
      if (reason === "userStopped") {
        queue.submit(composerQueueMessage("existing"));
        queue.prepareInterruptedTerminal({
          type: "turnCompleted",
          turnId: "prior-turn",
          status: "interrupted",
          commitId: "prior-terminal",
        });
        const effect = queue.applyInterruptedDisposition("prior-turn", "local").effects[0];
        if (effect?.type !== "recover") throw new Error("Expected local recovery");
        batch = effect.batch;
      } else {
        const sent =
          reason === "startDefinitelyNotAccepted"
            ? queue.submit(composerQueueMessage("existing"))
            : queue.submitSteer(composerQueueMessage("existing"));
        const request = sent.effects[0];
        if (request?.type !== "performStart" && request?.type !== "performSteer")
          throw new Error("Expected request");
        const failed =
          request.type === "performStart"
            ? queue.settleStart({ type: "definitelyNotAccepted", claim: request.claim })
            : queue.settleSteer({ type: "definitelyNotAccepted", claim: request.claim });
        const effect = failed.effects[0];
        if (effect?.type !== "recover") throw new Error("Expected failed request recovery");
        batch = effect.batch;
      }
      queue.observe({ type: "turnStarted", turnId: "legacy-turn", commitId: "legacy-start" });
      queue.submitSteer(composerQueueMessage("legacy"));
      queue.observe({
        type: "turnCompleted",
        turnId: "legacy-turn",
        status: "completed",
        commitId: "legacy-terminal",
      });
      const state = queue.exportState(batch);
      const legacy = {
        ...state,
        version: 1,
        steer: {
          ...state.steer,
          pending: state.steer.pending.map((entry) => ({
            ...entry,
            phase: "acceptedAwaitingCommit",
          })),
          closedTargets: state.steer.closedTargets.map(({ target, ...identity }) => ({
            ...identity,
            target: { reason: target.reason, rejectionBatch: target.rejectionBatch },
          })),
        },
      };
      fixture.context.storage.setItem(
        "codex-gui.browserPersistence.thread-1",
        JSON.stringify({
          version: 1,
          authorizationContext: fixture.context.authorizationContext,
          threadId: "thread-1",
          revision: 1,
          payload: {
            version: 1,
            queue: legacy,
            draft: null,
            interrupt: createComposerInterruptState().exportState(),
            failedInterruptTurnId: null,
          },
        }),
      );
      const saved = [...fixture.records.values()];
      const startTurn = vi.fn<StartTurn>(() => new Promise(() => undefined));
      const coordinator = createCoordinator({
        threadId: "thread-1",
        activeTurnId: null,
        startTurn,
        steerTurn: vi.fn<SteerTurn>(),
        persistence: fixture.context,
      });
      fixture.failWrites(true);
      coordinator.reconcileRestoredTurns([baseTurn("legacy-turn")]);
      expect([...fixture.records.values()]).toEqual(saved);
      expect(coordinator.getSnapshot().persistence.error).toBe("Browser persistence failed: write");
      fixture.failWrites(false);
      expect(coordinator.retryPersistence()).toBe(true);
      coordinator.completeRestoreReconciliation();
      expect(coordinator.getSnapshot()).toMatchObject({
        guidingCount: 0,
        recoveryCount: 2,
        persistence: { error: null, restoredPaused: true },
      });
      expect(startTurn).not.toHaveBeenCalled();
      coordinator.dispose();
      const restored = owner(fixture, null);
      expect(restored.coordinator.getSnapshot()).toMatchObject({
        recoveryCount: 2,
        persistence: { error: null },
      });
      expect(restored.coordinator.recover()).toBe(true);
      expect(
        restored.coordinator.resumeRestored(
          restored.coordinator.getSnapshot().persistence.revision,
        ),
      ).toBe(true);
      expect(restored.startTurn).toHaveBeenCalledTimes(1);
      restored.coordinator.dispose();
    },
  );

  it("retries a late local acceptance without publishing or consuming recovery before storage commits", async () => {
    const fixture = persistenceFixture();
    let accept!: (response: Awaited<ReturnType<SteerTurn>>) => void;
    const steerTurn = vi.fn<SteerTurn>(
      () =>
        new Promise((resolve) => {
          accept = resolve;
        }),
    );
    const startTurn = vi.fn<StartTurn>(() => new Promise(() => undefined));
    const coordinator = createCoordinator({
      threadId: "thread-1",
      activeTurnId: "running-turn",
      persistence: fixture.context,
      startTurn,
      steerTurn,
      interruptTurn: () => Promise.resolve({}),
    });
    coordinator.completeRestoreReconciliation();
    coordinator.submitSteer(composerDraftCapture("late"));
    coordinator.submit(composerDraftCapture("ordinary"));
    coordinator.interruptActiveTurn();
    await Promise.resolve();
    coordinator.observeAcceptedEvent(
      live(
        turnCompleted(eventTurnCompleted, "stopped", {
          ...baseTurn("running-turn"),
          status: "interrupted",
        }),
      ),
    );
    const saved = [...fixture.records.values()];
    fixture.failWrites(true);
    accept({ turnId: "running-turn" });
    await Promise.resolve();
    expect(coordinator.getSnapshot()).toMatchObject({
      guidingCount: 1,
      recoveryCount: 1,
      persistence: { error: "Browser persistence failed: write" },
    });
    expect([...fixture.records.values()]).toEqual(saved);
    expect(startTurn).not.toHaveBeenCalled();
    fixture.failWrites(false);
    expect(coordinator.retryPersistence()).toBe(true);
    expect(coordinator.getSnapshot()).toMatchObject({
      guidingCount: 0,
      recoveryCount: 2,
      persistence: { error: null },
    });
    coordinator.dispose();
    const restored = owner(fixture, null);
    restored.coordinator.reconcileRestoredTurns([baseTurn("running-turn")]);
    expect(restored.coordinator.getSnapshot().recoveryCount).toBe(2);
    expect(restored.startTurn).not.toHaveBeenCalled();
    expect(restored.coordinator.recover()).toBe(true);
    expect(
      restored.coordinator.resumeRestored(restored.coordinator.getSnapshot().persistence.revision),
    ).toBe(true);
    expect(restored.startTurn.mock.calls[0]?.[0].input).toEqual(composerDraftCapture("late").input);
    restored.coordinator.dispose();
  });

  it("keeps suspended pending messages paused until the existing continue-sending confirmation", () => {
    const fixture = persistenceFixture();
    const { coordinator, startTurn } = owner(fixture, "running-turn");
    coordinator.submit(composerDraftCapture("wait for confirmation"));
    coordinator.suspendRestored();
    coordinator.setConnectionUnavailable(true);
    expect(coordinator.reconcileProjection([baseTurn("running-turn")], [])).toEqual({
      type: "committed",
    });
    coordinator.setConnectionUnavailable(false);
    const snapshot = coordinator.getSnapshot();
    expect(snapshot.persistence.restoredPaused).toBe(true);
    expect(startTurn).not.toHaveBeenCalled();
    expect(coordinator.resumeRestored(snapshot.persistence.revision)).toBe(true);
    expect(startTurn).toHaveBeenCalledTimes(1);
  });

  it("does not complete suspended restoration when saving the snapshot fails", () => {
    const fixture = persistenceFixture();
    const { coordinator, startTurn } = owner(fixture, null);
    coordinator.suspendRestored();
    coordinator.setConnectionUnavailable(true);
    fixture.failWrites(true);
    expect(coordinator.reconcileProjection([], [])).toEqual({
      type: "blocked",
      error: "Browser persistence failed: write",
    });
    coordinator.setConnectionUnavailable(false);
    fixture.failWrites(false);
    expect(coordinator.retryPersistence()).toBe(true);
    expect(coordinator.submit(composerDraftCapture("still blocked"))).toEqual({ type: "accepted" });
    expect(startTurn).not.toHaveBeenCalled();
    expect(coordinator.resumeRestored(coordinator.getSnapshot().persistence.revision)).toBe(false);
    coordinator.setConnectionUnavailable(true);
    expect(coordinator.reconcileProjection([], [])).toEqual({ type: "committed" });
    coordinator.setConnectionUnavailable(false);
    expect(startTurn).toHaveBeenCalledTimes(1);
  });

  it("allows a new send after an empty suspended owner is reconciled on the restored connection", () => {
    const fixture = persistenceFixture();
    const { coordinator, startTurn } = owner(fixture, null);
    coordinator.suspendRestored();
    coordinator.setConnectionUnavailable(true);
    expect(coordinator.reconcileProjection([], [])).toEqual({ type: "committed" });
    expect(startTurn).not.toHaveBeenCalled();
    coordinator.setConnectionUnavailable(false);
    expect(coordinator.getSnapshot().persistence.restoredPaused).toBe(false);
    expect(coordinator.submit(composerDraftCapture("send after restoration"))).toEqual({
      type: "accepted",
    });
    expect(startTurn).toHaveBeenCalledTimes(1);
  });

  it("rebases an active queue while keeping sends frozen until projection publication", () => {
    const fixture = persistenceFixture();
    const { coordinator, startTurn } = owner(fixture, "running-turn");
    coordinator.submit(composerDraftCapture("queued after active turn"));
    coordinator.setProjectionUnavailable(true);
    expect(coordinator.reconcileProjection([baseTurn("running-turn")], [])).toEqual({
      type: "committed",
    });
    expect(startTurn).not.toHaveBeenCalled();
    expect(coordinator.getSnapshot().ordinaryQueuedCount).toBe(1);
    coordinator.setProjectionUnavailable(false);
    expect(startTurn).toHaveBeenCalledTimes(1);
  });

  it("requires appended projection facts to commit and retries a failed append without rebasing", () => {
    const fixture = persistenceFixture();
    const { coordinator, startTurn } = owner(fixture, "running-turn");
    coordinator.submit(composerDraftCapture("waiting for completion"));
    coordinator.setProjectionUnavailable(true);
    expect(coordinator.reconcileProjection([inProgressTurn("running-turn")], [])).toEqual({
      type: "committed",
    });
    expect(coordinator.reconcileProjection(null, [])).toEqual({ type: "committed" });
    expect(coordinator.getSnapshot().canStop).toBe(true);
    const terminal = live(
      turnCompleted(eventTurnCompleted, "appended-terminal", baseTurn("running-turn")),
    );
    fixture.failWrites(true);
    expect(coordinator.reconcileProjection(null, [terminal])).toEqual({
      type: "blocked",
      error: "Browser persistence failed: write",
    });
    expect(coordinator.getSnapshot().canStop).toBe(true);
    expect(coordinator.getSnapshot().ordinaryQueuedCount).toBe(1);
    expect(startTurn).not.toHaveBeenCalled();
    fixture.failWrites(false);
    expect(coordinator.reconcileProjection(null, [terminal])).toEqual({ type: "committed" });
    expect(coordinator.getSnapshot().canStop).toBe(false);
    expect(startTurn).not.toHaveBeenCalled();
    coordinator.setProjectionUnavailable(false);
    expect(startTurn).toHaveBeenCalledTimes(1);
  });

  it("rolls back a failed projection candidate and preserves pending delivery facts and draft", async () => {
    const fixture = persistenceFixture();
    const response = deferredStart();
    const startTurn = vi.fn<StartTurn>(() => response.promise);
    const coordinator = createCoordinator({
      threadId: "thread-1",
      activeTurnId: null,
      persistence: fixture.context,
      startTurn,
      steerTurn: vi.fn<SteerTurn>(),
    });
    coordinator.submit(composerDraftCapture("already sent"));
    coordinator.submit(composerDraftCapture("still queued"));
    coordinator.setProjectionUnavailable(true);
    fixture.failWrites(true);
    response.resolve({ turn: inProgressTurn("confirmed-turn") });
    await Promise.resolve();
    const draft = composerDraftCapture("unsaved draft").draft;
    expect(coordinator.saveDraft(draft)).toBe(false);
    const saved = [...fixture.records];
    expect(coordinator.reconcileProjection([baseTurn("confirmed-turn")], [])).toEqual({
      type: "blocked",
      error: "Browser persistence failed: write",
    });
    expect([...fixture.records]).toEqual(saved);
    expect(coordinator.getSnapshot().ordinaryQueuedCount).toBe(1);
    expect(coordinator.getDraft()).toBe(draft);
    fixture.failWrites(false);
    const terminal = live(
      turnCompleted(eventTurnCompleted, "candidate-terminal", baseTurn("new-turn")),
    );
    expect(
      coordinator.reconcileProjection(
        [baseTurn("confirmed-turn"), inProgressTurn("new-turn")],
        [terminal],
      ),
    ).toEqual({ type: "committed" });
    expect(coordinator.getSnapshot().persistence.error).toBeNull();
    expect(coordinator.getDraft()).toBe(draft);
    expect(startTurn).toHaveBeenCalledTimes(1);
    coordinator.setProjectionUnavailable(false);
    expect(startTurn).toHaveBeenCalledTimes(2);
    expect(startTurn.mock.calls[1]?.[0].input).toEqual(composerDraftCapture("still queued").input);
  });

  it("does not release restored or unknown-delivery barriers when projection recovers", () => {
    const fixture = persistenceFixture();
    const initial = owner(fixture, null);
    initial.coordinator.submit(composerDraftCapture("possibly delivered"));
    initial.coordinator.submit(composerDraftCapture("later input"));
    initial.coordinator.dispose();
    const restored = owner(fixture, null);
    restored.coordinator.setProjectionUnavailable(true);
    expect(restored.coordinator.reconcileProjection([], [])).toEqual({ type: "committed" });
    restored.coordinator.setProjectionUnavailable(false);
    expect(restored.coordinator.getSnapshot().persistence).toMatchObject({ restoredPaused: true });
    expect(restored.coordinator.getSnapshot().persistence.unknownMessages).toHaveLength(1);
    expect(restored.startTurn).not.toHaveBeenCalled();
    expect(
      restored.coordinator.resumeRestored(restored.coordinator.getSnapshot().persistence.revision),
    ).toBe(true);
    expect(restored.startTurn).not.toHaveBeenCalled();
  });

  it("keeps a late steer response valid without sending its successor during projection pause", async () => {
    const fixture = persistenceFixture();
    const steerTurn = vi.fn<SteerTurn>().mockResolvedValue({ turnId: "running-turn" });
    const coordinator = createCoordinator({
      threadId: "thread-1",
      activeTurnId: "running-turn",
      persistence: fixture.context,
      startTurn: vi.fn<StartTurn>(),
      steerTurn,
    });
    coordinator.submitSteer(composerDraftCapture("first guide"));
    coordinator.submitSteer(composerDraftCapture("next guide"));
    coordinator.setProjectionUnavailable(true);
    await Promise.resolve();
    expect(steerTurn).toHaveBeenCalledTimes(1);
    expect(coordinator.reconcileProjection([inProgressTurn("running-turn")], [])).toEqual({
      type: "committed",
    });
    expect(steerTurn).toHaveBeenCalledTimes(1);
    coordinator.setProjectionUnavailable(false);
    expect(steerTurn).toHaveBeenCalledTimes(2);
    expect(steerTurn.mock.calls[1]?.[0].input).toEqual(composerDraftCapture("next guide").input);
  });

  it("preserves recovery and deferred starts while projection is unavailable", async () => {
    const fixture = persistenceFixture();
    const first = deferredStart();
    const startTurn = vi
      .fn<StartTurn>()
      .mockImplementationOnce(() => first.promise)
      .mockImplementation(() => new Promise(() => undefined));
    const coordinator = createCoordinator({
      threadId: "thread-1",
      activeTurnId: null,
      persistence: fixture.context,
      startTurn,
      steerTurn: vi.fn<SteerTurn>(),
    });
    coordinator.submit(composerDraftCapture("definitely rejected"));
    coordinator.submit(composerDraftCapture("deferred successor"));
    first.reject(
      new GuiHostCommandError({
        source: "rpc",
        delivery: "definitelyNotAccepted",
        error: new Error("rejected"),
      }),
    );
    await Promise.resolve();
    expect(coordinator.getSnapshot().recoveryCount).toBe(1);
    coordinator.setProjectionUnavailable(true);
    expect(coordinator.recover()).toBe(false);
    expect(coordinator.getSnapshot().recoveryCount).toBe(1);
    expect(startTurn).toHaveBeenCalledTimes(1);
    expect(coordinator.reconcileProjection([], [])).toEqual({ type: "committed" });
    coordinator.setProjectionUnavailable(false);
    expect(startTurn).toHaveBeenCalledTimes(1);
    expect(coordinator.recover()).toBe(true);
    expect(startTurn).toHaveBeenCalledTimes(2);
  });

  it.each([false, true])(
    "restores an empty queue without manual continuation (draft: %s)",
    (hasDraft) => {
      const fixture = persistenceFixture();
      const initial = owner(fixture, null);
      const capture = composerDraftCapture("first explicit message");
      if (hasDraft) initial.coordinator.saveDraft(capture.draft);
      initial.coordinator.dispose();

      const restored = owner(fixture, null);
      expect(restored.coordinator.getSnapshot().persistence).toMatchObject({
        error: null,
        restoredPaused: false,
        revision: null,
        unknownMessages: [],
      });
      expect(restored.coordinator.getDraft() === null).toBe(!hasDraft);
      expect(restored.startTurn).not.toHaveBeenCalled();
      expect(restored.coordinator.submit(capture)).toEqual({ type: "accepted" });
      expect(restored.startTurn).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ input: capture.input }),
      );
    },
  );

  it.each([
    { activeTurnId: null, status: "completed" },
    { activeTurnId: "running-turn", status: "completed" },
    { activeTurnId: "running-turn", status: "interrupted" },
  ] as const)(
    "keeps an empty suspended session isolated during submits and retries ($activeTurnId, $status)",
    ({ activeTurnId, status }) => {
      const fixture = persistenceFixture();
      const current = owner(fixture, activeTurnId);
      current.coordinator.suspendRestored();
      expect(current.coordinator.getSnapshot().persistence.restoredPaused).toBe(false);
      expect(current.coordinator.submit(composerDraftCapture("after suspension"))).toEqual({
        type: "accepted",
      });
      const guide =
        activeTurnId == null
          ? null
          : current.coordinator.submitSteer(composerDraftCapture("suspended guide"));
      expect(guide).toEqual(activeTurnId == null ? null : { type: "accepted" });
      if (activeTurnId != null) {
        current.coordinator.observeAcceptedEvent(
          live(
            turnCompleted(eventTurnCompleted, "suspended-terminal", {
              ...baseTurn(activeTurnId),
              status,
            }),
          ),
        );
      }
      expect(current.coordinator.retryPersistence()).toBe(true);
      current.coordinator.completeRestoreReconciliation();
      expect(
        current.coordinator.resumeRestored(current.coordinator.getSnapshot().persistence.revision),
      ).toBe(false);
      expect(current.startTurn).not.toHaveBeenCalled();
      expect(current.steerTurn).not.toHaveBeenCalled();
    },
  );

  it("keeps restored empty state isolated until reconciliation is saved successfully", () => {
    const fixture = persistenceFixture();
    owner(fixture, null).coordinator.dispose();
    const startTurn = vi.fn<StartTurn>(() => new Promise(() => undefined));
    const restored = createCoordinator({
      threadId: "thread-1",
      activeTurnId: null,
      persistence: fixture.context,
      startTurn,
      steerTurn: vi.fn<SteerTurn>(),
    });
    expect(restored.submit(composerDraftCapture("submitted while restoring"))).toEqual({
      type: "accepted",
    });
    expect(startTurn).not.toHaveBeenCalled();
    fixture.failWrites(true);
    restored.completeRestoreReconciliation();
    expect(restored.getSnapshot().persistence.error).not.toBeNull();
    expect(startTurn).not.toHaveBeenCalled();
    fixture.failWrites(false);
    expect(restored.retryPersistence()).toBe(true);
    expect(restored.getSnapshot().persistence.restoredPaused).toBe(false);
    expect(startTurn).toHaveBeenCalledTimes(1);
  });

  it("does not treat unreadable storage as an empty recovered session", () => {
    const fixture = persistenceFixture();
    vi.spyOn(fixture.context.storage, "getItem").mockImplementation(() => {
      throw new Error("storage unavailable");
    });
    const restored = owner(fixture, null);
    expect(restored.coordinator.getSnapshot().persistence.error).not.toBeNull();
    expect(restored.coordinator.submit(composerDraftCapture("must stay local"))).toEqual({
      type: "rejected",
      reason: "persistenceFailed",
    });
    expect(
      restored.coordinator.resumeRestored(restored.coordinator.getSnapshot().persistence.revision),
    ).toBe(false);
    expect(restored.startTurn).not.toHaveBeenCalled();
  });

  it("keeps lifecycle isolation when a later local stop produces a recovery batch", async () => {
    const fixture = persistenceFixture();
    const startTurn = vi.fn<StartTurn>(() => new Promise(() => undefined));
    const coordinator = createCoordinator({
      threadId: "thread-1",
      activeTurnId: "running-turn",
      persistence: fixture.context,
      startTurn,
      steerTurn: vi.fn<SteerTurn>(),
      interruptTurn: vi.fn<InterruptTurn>().mockResolvedValue({}),
    });
    coordinator.completeRestoreReconciliation();
    coordinator.suspendRestored();
    coordinator.submit(composerDraftCapture("queued during suspension"));
    expect(coordinator.interruptActiveTurn()).toBe(true);
    await Promise.resolve();
    coordinator.observeAcceptedEvent(
      live(
        turnCompleted(eventTurnCompleted, "local-stop-while-suspended", {
          ...baseTurn("running-turn"),
          status: "interrupted",
        }),
      ),
    );
    expect(coordinator.getSnapshot()).toMatchObject({
      recoveryCount: 1,
      persistence: { restoredPaused: false },
    });
    expect(coordinator.recover()).toBe(true);
    expect(coordinator.retryPersistence()).toBe(true);
    expect(coordinator.getSnapshot()).toMatchObject({ recoveryCount: 0, ordinaryQueuedCount: 1 });
    expect(startTurn).not.toHaveBeenCalled();
  });

  it("retries a failed sending preparation after a management save without replaying its effect", () => {
    const fixture = persistenceFixture();
    const { coordinator, startTurn } = owner(fixture, "running-turn");
    coordinator.submit(composerDraftCapture("original head"));
    const item = pendingItem(coordinator, "ordinary");
    const begun = coordinator.beginPendingInputEdit(
      { key: item.key, revision: coordinator.getSnapshot().detailRevision },
      () => ({ type: "restored" }),
    );
    if (begun.type !== "begun") throw new Error("Expected ordinary edit");
    coordinator.observeAcceptedEvent(
      live(turnCompleted(eventTurnCompleted, "completed-active", baseTurn("running-turn"))),
    );
    const writes = vi.spyOn(fixture.context.storage, "setItem");
    writes.mockImplementationOnce((key, value) => {
      fixture.records.set(key, value);
    });
    writes.mockImplementationOnce(() => {
      throw new Error("Sending preparation could not be saved");
    });
    expect(begun.reservation.save(composerDraftCapture("saved edited head"))).toMatchObject({
      type: "saved",
    });
    expect(writes).toHaveBeenCalledTimes(2);
    expect(coordinator.getSnapshot().persistence.error).not.toBeNull();
    expect(startTurn).not.toHaveBeenCalled();
    writes.mockRestore();

    expect(coordinator.retryPersistence()).toBe(true);
    expect(coordinator.getSnapshot().persistence.error).toBeNull();
    expect(startTurn).toHaveBeenCalledTimes(1);
    expect(startTurn.mock.calls[0]?.[0].input).toEqual(
      composerDraftCapture("saved edited head").input,
    );
    expect(coordinator.retryPersistence()).toBe(true);
    expect(startTurn).toHaveBeenCalledTimes(1);
  });

  it("blocks direct and promoted guides behind an unknown start even with a current active turn", () => {
    const fixture = persistenceFixture();
    const initial = owner(fixture, null);
    initial.coordinator.submit(composerDraftCapture("unknown start"));
    const restored = owner(fixture, "another-active-turn");
    expect(restored.coordinator.getSnapshot().persistence.unknownMessages).toHaveLength(1);
    expect(
      restored.coordinator.resumeRestored(restored.coordinator.getSnapshot().persistence.revision),
    ).toBe(true);
    expect(restored.coordinator.submitSteer(composerDraftCapture("direct guide"))).toEqual({
      type: "accepted",
    });
    restored.coordinator.submit(composerDraftCapture("promoted guide"));
    expect(restored.coordinator.promoteOrdinaryFrontToSteer()).toBe(true);
    expect(restored.steerTurn).not.toHaveBeenCalled();
    expect(restored.startTurn).not.toHaveBeenCalled();
    expect(restored.coordinator.getSnapshot().guidingCount).toBe(2);
  });

  it("retains a server acceptance when saving its result fails and never reissues the request", async () => {
    const fixture = persistenceFixture();
    const response = deferredStart();
    const startTurn = vi.fn<StartTurn>(() => response.promise);
    const coordinator = createCoordinator({
      threadId: "thread-1",
      activeTurnId: null,
      persistence: fixture.context,
      startTurn,
      steerTurn: vi.fn<SteerTurn>(),
    });
    coordinator.submit(composerDraftCapture("accepted first"));
    coordinator.submit(composerDraftCapture("later second"));
    fixture.failWrites(true);
    response.resolve({ turn: baseTurn("confirmed-turn") });
    await Promise.resolve();
    expect(coordinator.getSnapshot().persistence.error).not.toBeNull();
    expect(startTurn).toHaveBeenCalledTimes(1);
    fixture.failWrites(false);
    expect(coordinator.retryPersistence()).toBe(true);
    expect(startTurn).toHaveBeenCalledTimes(1);
    const restored = owner(fixture, null);
    expect(restored.coordinator.getSnapshot().persistence.unknownMessages).toEqual([]);
    restored.coordinator.reconcileRestoredTurns([baseTurn("confirmed-turn")]);
    expect(
      restored.coordinator.resumeRestored(restored.coordinator.getSnapshot().persistence.revision),
    ).toBe(true);
    expect(restored.startTurn).toHaveBeenCalledTimes(1);
    expect(restored.startTurn.mock.calls[0]?.[0].input).toEqual(
      composerDraftCapture("later second").input,
    );
  });
  it("commits queue addition and source draft clearing in one saved record", () => {
    const fixture = persistenceFixture();
    const { coordinator, startTurn } = owner(fixture, "running-turn");
    const capture = composerDraftCapture("queued draft");
    expect(coordinator.saveDraft(capture.draft)).toBe(true);
    expect(coordinator.submit(capture)).toEqual({ type: "accepted" });
    expect(coordinator.getDraft()).toBeNull();
    expect(startTurn).not.toHaveBeenCalled();
    const restored = owner(fixture, null);
    expect(restored.coordinator.getDraft()).toBeNull();
    expect(restored.coordinator.getSnapshot().ordinaryQueuedCount).toBe(1);
    expect(restored.coordinator.getSnapshot().persistence.restoredPaused).toBe(true);
    expect(restored.startTurn).not.toHaveBeenCalled();
    expect(
      restored.coordinator.resumeRestored(restored.coordinator.getSnapshot().persistence.revision),
    ).toBe(true);
    expect(restored.startTurn).toHaveBeenCalledTimes(1);
  });

  it("preserves the draft and queue when the submission cannot be persisted", () => {
    const fixture = persistenceFixture();
    const { coordinator, startTurn } = owner(fixture, null);
    const capture = composerDraftCapture("do not lose this");
    coordinator.saveDraft(capture.draft);
    const saved = [...fixture.records];
    fixture.failWrites(true);
    expect(coordinator.submit(capture)).toEqual({ type: "rejected", reason: "persistenceFailed" });
    expect([...fixture.records]).toEqual(saved);
    expect(coordinator.getDraft()).toBe(capture.draft);
    expect(coordinator.getSnapshot().ordinaryQueuedCount).toBe(0);
    expect(startTurn).not.toHaveBeenCalled();
    fixture.failWrites(false);
    expect(coordinator.retryPersistence()).toBe(true);
    expect(startTurn).not.toHaveBeenCalled();
    expect(coordinator.submit(capture)).toEqual({ type: "accepted" });
    expect(startTurn).toHaveBeenCalledTimes(1);
  });

  it("keeps possibly issued starts blocked after the user continues", () => {
    const fixture = persistenceFixture();
    const initial = owner(fixture, null);
    initial.coordinator.submit(composerDraftCapture("possibly received"));
    expect(initial.startTurn).toHaveBeenCalledTimes(1);
    const restored = owner(fixture, null);
    expect(restored.coordinator.getSnapshot().persistence.unknownMessages).toHaveLength(1);
    expect(
      restored.coordinator.resumeRestored(restored.coordinator.getSnapshot().persistence.revision),
    ).toBe(true);
    expect(restored.startTurn).not.toHaveBeenCalled();
    const persistence = restored.coordinator.getSnapshot().persistence;
    expect(persistence.restoredPaused).toBe(false);
    expect(persistence.revision).toBeTypeOf("number");
    expect(persistence.unknownMessages.map(({ text }) => text)).toEqual(["possibly received"]);
    restored.coordinator.submit(composerDraftCapture("later input"));
    expect(restored.startTurn).not.toHaveBeenCalled();
  });

  it("requires a fresh review revision and invalidates permission on page suspension", () => {
    const fixture = persistenceFixture();
    const initial = owner(fixture, "running-turn");
    initial.coordinator.submit(composerDraftCapture("first"));
    const restored = owner(fixture, "running-turn");
    const staleRevision = restored.coordinator.getSnapshot().persistence.revision;
    restored.coordinator.submit(composerDraftCapture("second"));
    expect(restored.coordinator.resumeRestored(staleRevision)).toBe(false);
    expect(
      restored.coordinator.resumeRestored(restored.coordinator.getSnapshot().persistence.revision),
    ).toBe(true);
    restored.coordinator.suspendRestored();
    expect(restored.coordinator.getSnapshot().persistence.restoredPaused).toBe(true);
    expect(
      restored.coordinator.resumeRestored(restored.coordinator.getSnapshot().persistence.revision),
    ).toBe(false);
    expect(restored.startTurn).not.toHaveBeenCalled();
  });

  it("restores committed ordinary drafts independently of runtime editor handles", () => {
    const fixture = persistenceFixture();
    const initial = owner(fixture, null);
    const capture = composerDraftCapture("draft across reload");
    initial.coordinator.saveDraft(capture.draft);
    const restored = owner(fixture, null);
    const draft = restored.coordinator.getDraft();
    expect(draft).not.toBeNull();
    if (draft == null) throw new Error("Expected saved draft");
    expect(draft).not.toBe(capture.draft);
    expect(exportComposerDraft(draft)).toEqual(exportComposerDraft(capture.draft));
  });
});
