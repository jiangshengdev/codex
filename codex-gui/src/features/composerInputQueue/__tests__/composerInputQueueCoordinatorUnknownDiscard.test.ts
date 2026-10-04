import { describe, expect, it, vi } from "vitest";
import { BrowserPersistenceStore } from "@/features/browserPersistence/browserPersistenceStore";
import { GuiHostCommandError } from "@/features/guiHost/guiHostCommandGateway";
import { eventTurnCompleted } from "@/features/projection/__tests__/projectionFixtures";
import { baseTurn, turnCompleted } from "@/features/projection/__tests__/projectionTestBuilders";
import {
  decodeComposerCoordinatorRecord,
  type ComposerCoordinatorRecord,
} from "../composerCoordinatorPersistence";
import {
  createCoordinator,
  createPersistenceTestContext,
  deferredStart,
  live,
  type StartTurn,
  type SteerTurn,
} from "./composerInputQueueCoordinatorTestFixtures";
import { composerCapture as input } from "./composerInputQueueTestFixtures";

function harness(activeTurnId: string | null = null, persistence = createPersistenceTestContext()) {
  const request = deferredStart();
  const startTurn = vi.fn<StartTurn>(() => request.promise);
  const steerTurn = vi.fn<SteerTurn>(() => new Promise(() => undefined));
  const coordinator = createCoordinator({
    threadId: "thread-1",
    activeTurnId,
    persistence,
    startTurn,
    steerTurn,
  });
  coordinator.completeRestoreReconciliation();
  const store = new BrowserPersistenceStore<ComposerCoordinatorRecord>({
    ...persistence,
    threadId: "thread-1",
    codec: {
      encode: (value) => value,
      decode: (value) => decodeComposerCoordinatorRecord(value, "thread-1"),
    },
  });
  return { coordinator, startTurn, steerTurn, request, persistence, store };
}

async function unknownStart() {
  const h = harness();
  h.coordinator.submit(input("unknown"));
  h.coordinator.submit(input("next"));
  h.coordinator.submit(input("last"));
  h.request.reject(new Error("delivery unknown"));
  await Promise.resolve();
  return h;
}

function unknown(h: ReturnType<typeof harness>) {
  const persistence = h.coordinator.getSnapshot().persistence;
  const message = persistence.unknownMessages[0];
  if (message == null) throw new Error("Expected unknown message");
  return { id: message.id, revision: persistence.revision };
}

describe("unknown record removal transaction", () => {
  it("saves removal and the FIFO successor before invoking its RPC", async () => {
    const h = await unknownStart();
    const removed = unknown(h);
    const listener = vi.fn<() => void>();
    h.coordinator.subscribe(listener);
    h.startTurn.mockImplementation(() => {
      const saved = h.store.read();
      expect(saved?.value.queue.knownMessageIds).not.toContain(removed.id);
      expect(saved?.value.queue.start.pending).toMatchObject({
        phase: "issuing",
        message: { input: input("next").input },
      });
      expect(saved?.revision).toBeGreaterThan(removed.revision ?? 0);
      return new Promise(() => undefined);
    });

    expect(h.coordinator.discardUnknown(removed.id, removed.revision)).toBe(true);

    expect(h.startTurn.mock.calls.map(([params]) => params.input)).toEqual([
      input("unknown").input,
      input("next").input,
    ]);
    expect(h.coordinator.getSnapshot()).toMatchObject({
      ordinaryQueuedCount: 1,
      persistence: { error: null, unknownMessages: [], revision: null },
    });
    expect(listener).toHaveBeenCalled();
  });

  it.each([false, true])(
    "removes a merged claim with all original owners (restored: %s)",
    async (restored) => {
      const initial = harness("turn-1");
      initial.steerTurn.mockRejectedValue(
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
      initial.coordinator.submit(input("next"));
      initial.coordinator.submitSteer(input("first guide"));
      initial.coordinator.submitSteer(input("second guide"));
      await Promise.resolve();
      initial.coordinator.observeAcceptedEvent(
        live(turnCompleted(eventTurnCompleted, "terminal", baseTurn("turn-1"))),
      );
      expect(initial.startTurn.mock.calls[0]?.[0].input).toEqual([
        ...input("first guide").input,
        ...input("second guide").input,
      ]);
      if (!restored) {
        initial.request.reject(new Error("unknown merged start"));
        await Promise.resolve();
      } else initial.coordinator.dispose();
      const h = restored ? harness(null, initial.persistence) : initial;
      const removed = unknown(h);
      const previousIds = h.store.read()?.value.queue.knownMessageIds;
      expect(previousIds).toHaveLength(4);
      h.startTurn.mockImplementation(() => {
        const saved = h.store.read();
        expect(saved?.value.queue.knownMessageIds).toHaveLength(1);
        expect(saved?.value.queue.knownMessageIds).not.toContain(removed.id);
        expect(saved?.value.queue.start.pending).toMatchObject({
          phase: "issuing",
          message: { input: input("next").input },
        });
        return new Promise(() => undefined);
      });
      expect(h.coordinator.discardUnknown(removed.id, removed.revision)).toBe(true);
      expect(h.store.read()?.value.queue.knownMessageIds).toHaveLength(1);
      expect(h.coordinator.getSnapshot().persistence.unknownMessages).toEqual([]);
      expect(h.startTurn).toHaveBeenCalledTimes(restored ? 0 : 2);
      expect(h.coordinator.getSnapshot().persistence.restoredPaused).toBe(restored);
      expect(h.coordinator.resumeRestored(h.coordinator.getSnapshot().persistence.revision)).toBe(
        restored,
      );
      expect(h.startTurn.mock.lastCall?.[0].input).toEqual(input("next").input);
    },
  );

  it("rolls back both removal and successor preparation when saving fails", async () => {
    const h = await unknownStart();
    const removed = unknown(h);
    const saved = h.store.read();
    const storage = h.persistence.storage;
    if (storage == null) throw new Error("Expected test storage");
    const setItem = vi.spyOn(storage, "setItem").mockImplementation(() => {
      throw new Error("quota exhausted");
    });
    expect(h.coordinator.discardUnknown(removed.id, removed.revision)).toBe(false);
    expect(h.store.read()).toEqual(saved);
    expect(h.coordinator.getSnapshot()).toMatchObject({
      ordinaryQueuedCount: 2,
      persistence: { unknownMessages: [{ id: removed.id }] },
    });
    expect(h.coordinator.getSnapshot().persistence.error).not.toBeNull();
    expect(h.coordinator.discardUnknown(removed.id, removed.revision)).toBe(false);
    expect(h.startTurn).toHaveBeenCalledTimes(1);
    setItem.mockRestore();
    const restored = harness(null, h.persistence);
    expect(restored.coordinator.getSnapshot().persistence.unknownMessages).toEqual([
      { id: removed.id, text: "unknown" },
    ]);
    expect(restored.coordinator.getSnapshot().ordinaryQueuedCount).toBe(2);
  });

  it.each(["stale", "missing", "disposed"] as const)(
    "does not drain on a %s removal",
    async (kind) => {
      const h = await unknownStart();
      const removed = unknown(h);
      const saved = h.store.read();
      if (kind === "disposed") h.coordinator.dispose();
      expect(
        h.coordinator.discardUnknown(
          kind === "missing" ? "absent" : removed.id,
          kind === "stale" ? (removed.revision ?? 0) - 1 : removed.revision,
        ),
      ).toBe(false);
      expect(h.store.read()).toEqual(saved);
      expect(h.startTurn).toHaveBeenCalledTimes(1);
    },
  );

  it.each(["restoredPaused", "sendingBarrier"] as const)(
    "publishes removal while preserving %s",
    async (barrier) => {
      const initial = await unknownStart();
      const h = barrier === "restoredPaused" ? harness(null, initial.persistence) : initial;
      if (barrier === "sendingBarrier") h.coordinator.suspendRestored();
      const removed = unknown(h);
      const calls = h.startTurn.mock.calls.length;
      expect(h.coordinator.discardUnknown(removed.id, removed.revision)).toBe(true);
      expect(h.coordinator.getSnapshot().persistence).toMatchObject({
        unknownMessages: [],
        restoredPaused: true,
      });
      expect(h.coordinator.getSnapshot().persistence.revision).toBeGreaterThan(
        removed.revision ?? 0,
      );
      expect(h.startTurn).toHaveBeenCalledTimes(calls);
      expect(h.coordinator.resumeRestored(removed.revision)).toBe(false);
      expect(h.coordinator.resumeRestored(h.coordinator.getSnapshot().persistence.revision)).toBe(
        barrier === "restoredPaused",
      );
      expect(h.startTurn).toHaveBeenCalledTimes(1);
    },
  );

  it("keeps recovery blocking after an unknown successor is removed", async () => {
    const initial = harness();
    initial.coordinator.submit(input("rejected"));
    initial.coordinator.submit(input("prepared successor"));
    initial.coordinator.submit(input("last"));
    initial.request.reject(
      new GuiHostCommandError({
        source: "rpc",
        delivery: "definitelyNotAccepted",
        error: new Error("rejected"),
      }),
    );
    await Promise.resolve();
    const h = harness(null, initial.persistence);
    expect(h.coordinator.getSnapshot().recoveryCount).toBe(1);
    expect(h.coordinator.resumeRestored(h.coordinator.getSnapshot().persistence.revision)).toBe(
      true,
    );
    const removed = unknown(h);
    expect(h.coordinator.discardUnknown(removed.id, removed.revision)).toBe(true);
    expect(h.coordinator.getSnapshot()).toMatchObject({
      recoveryCount: 1,
      ordinaryQueuedCount: 1,
      persistence: { unknownMessages: [], restoredPaused: false },
    });
    expect(h.startTurn).not.toHaveBeenCalled();
  });

  it("updates revisions for successive unknown steers and retains the active turn", async () => {
    const initial = harness("turn-1");
    initial.steerTurn.mockResolvedValue({ turnId: "turn-1" });
    initial.coordinator.submitSteer(input("first unknown guide"));
    initial.coordinator.submitSteer(input("second unknown guide"));
    await Promise.resolve();
    await Promise.resolve();
    initial.coordinator.submit(input("ordinary"));
    initial.coordinator.dispose();
    const saved = initial.store.read();
    if (saved == null) throw new Error("Expected saved steers");
    // Preserve validated owners while representing two unresolved deliveries.
    initial.store.commit(
      {
        ...saved.value,
        queue: {
          ...saved.value.queue,
          steer: {
            ...saved.value.queue.steer,
            pending: saved.value.queue.steer.pending.map((pending) => ({
              ...pending,
              phase: "deliveryUnknown",
            })),
          },
        },
      },
      saved.revision,
    );
    const h = harness("turn-1", initial.persistence);
    expect(h.coordinator.resumeRestored(h.coordinator.getSnapshot().persistence.revision)).toBe(
      true,
    );
    expect(h.coordinator.submitSteer(input("next guide"))).toEqual({ type: "accepted" });
    const first = unknown(h);
    expect(h.coordinator.getSnapshot().persistence.unknownMessages).toHaveLength(2);
    expect(h.coordinator.discardUnknown(first.id, first.revision)).toBe(true);
    const second = unknown(h);
    expect(second.id).not.toBe(first.id);
    expect(second.revision).toBeGreaterThan(first.revision ?? 0);
    expect(h.coordinator.discardUnknown(second.id, first.revision)).toBe(false);
    expect(h.startTurn).not.toHaveBeenCalled();
    expect(h.steerTurn).not.toHaveBeenCalled();
    expect(h.coordinator.discardUnknown(second.id, second.revision)).toBe(true);
    expect(h.coordinator.getSnapshot()).toMatchObject({
      canStop: true,
      ordinaryQueuedCount: 1,
      persistence: { unknownMessages: [] },
    });
    expect(h.startTurn).not.toHaveBeenCalled();
    expect(h.steerTurn).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ input: input("next guide").input }),
    );
  });
});
