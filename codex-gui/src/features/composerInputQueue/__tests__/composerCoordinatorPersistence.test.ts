import { describe, expect, it, vi } from "vitest";
import { exportComposerDraft } from "@/features/composerEditor/composerDraft";
import {
  createCoordinator,
  deferredStart,
  live,
  pendingItem,
  type StartTurn,
  type SteerTurn,
} from "./composerInputQueueCoordinatorTestFixtures";
import { composerDraftCapture } from "./composerInputQueueTestFixtures";
import { baseTurn, turnCompleted } from "@/features/projection/__tests__/projectionTestBuilders";
import { eventTurnCompleted } from "@/features/projection/__tests__/projectionFixtures";

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
