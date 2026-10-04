import { describe, expect, it } from "vitest";
import {
  createComposerInputQueue,
  type ComposerInputQueue,
  type ComposerInputQueueTransition,
  type RecoveryBatch,
} from "../composerInputQueue";
import { composerQueueMessage } from "./composerInputQueueTestFixtures";

const owner = () => createComposerInputQueue({ threadId: "thread-a", activeTurnId: null });

function recoveryFrom(transition: ComposerInputQueueTransition): RecoveryBatch {
  const effect = transition.effects.find((candidate) => candidate.type === "recover");
  if (effect?.type !== "recover") throw new Error("Expected recovery batch");
  return effect.batch;
}

function roundTrip(queue: ComposerInputQueue, recovery: RecoveryBatch | null = null) {
  const record: unknown = JSON.parse(JSON.stringify(queue.exportState(recovery)));
  const restored = owner();
  const restoredRecovery = restored.rehydrateState(record);
  expect(restored.exportState(restoredRecovery).knownMessageIds).toEqual(
    queue.exportState(recovery).knownMessageIds,
  );
  return { restored, restoredRecovery };
}

function rejectedMerge() {
  const queue = createComposerInputQueue({ threadId: "thread-a", activeTurnId: "turn-a" });
  queue.setAutomaticSendingPaused(true);
  queue.submitSteer(composerQueueMessage("rejected-a"));
  queue.submitSteer(composerQueueMessage("rejected-b"));
  queue.observe({
    type: "turnCompleted",
    turnId: "turn-a",
    status: "completed",
    commitId: "terminal-a",
  });
  queue.setAutomaticSendingPaused(false);
  const effect = queue.drain().effects[0];
  if (effect?.type !== "performStart" || effect.claim.message.type !== "rejectedSteerMerge")
    throw new Error("Expected rejected merge");
  return { queue, message: effect.claim.message, claim: effect.claim };
}

describe("whole queue persisted message ownership", () => {
  it("rejects a pending start duplicated in ordinary without changing the current owner", () => {
    const source = owner();
    source.submit(composerQueueMessage("same-message"));
    const record = source.exportState(null);
    const message = record.start.pending?.message;
    if (message?.type !== "recoverable") throw new Error("Expected ordinary start");
    const target = owner();
    target.setAutomaticSendingPaused(true);
    target.submit(composerQueueMessage("preserved"));
    const before = target.exportState(null);
    expect(() => target.rehydrateState({ ...record, ordinary: [message] })).toThrow(
      "multiple owners",
    );
    expect(target.exportState(null)).toEqual(before);
    expect(target.drain().effects).toEqual([]);
  });

  it.each(["missing", "orphan"] as const)("rejects %s known identities", (corruption) => {
    const source = owner();
    source.setAutomaticSendingPaused(true);
    source.submit(composerQueueMessage("queued"));
    const record = source.exportState(null);
    const knownMessageIds = corruption === "missing" ? [] : [...record.knownMessageIds, "orphan"];
    expect(() => owner().rehydrateState({ ...record, knownMessageIds })).toThrow(
      "known identities",
    );
  });

  it("accepts an ordinary pending start with distinct queued messages", () => {
    const source = owner();
    source.submit(composerQueueMessage("start"));
    source.submit(composerQueueMessage("queued"));
    const { restored } = roundTrip(source);
    expect(restored.unknownMessages().map(({ id }) => id)).toEqual(["start"]);
    expect(restored.view().ordinaryQueuedCount).toBe(1);
  });

  it("accepts start recovery outside known identities and rejects its second ordinary owner", () => {
    const source = owner();
    const issued = source.submit(composerQueueMessage("failed-start")).effects[0];
    if (issued?.type !== "performStart") throw new Error("Expected start");
    const recovery = recoveryFrom(
      source.settleStart({ type: "definitelyNotAccepted", claim: issued.claim }),
    );
    const { restoredRecovery } = roundTrip(source, recovery);
    expect(restoredRecovery?.reason).toBe("startDefinitelyNotAccepted");
    const record = source.exportState(recovery);
    if (record.recovery?.reason !== "startDefinitelyNotAccepted")
      throw new Error("Expected persisted start recovery");
    const recoveryMessages = record.recovery.messages;
    expect(() =>
      owner().rehydrateState({
        ...record,
        ordinary: recoveryMessages,
        knownMessageIds: ["failed-start"],
      }),
    ).toThrow("multiple owners");
    expect(() => owner().rehydrateState({ ...record, knownMessageIds: ["failed-start"] })).toThrow(
      "known identities",
    );
  });

  it("accepts steer recovery without assigning it queue ownership", () => {
    const source = createComposerInputQueue({ threadId: "thread-a", activeTurnId: "turn-a" });
    const issued = source.submitSteer(composerQueueMessage("failed-steer")).effects[0];
    if (issued?.type !== "performSteer") throw new Error("Expected steer");
    const recovery = recoveryFrom(
      source.settleSteer({ type: "definitelyNotAccepted", claim: issued.claim }),
    );
    const { restored, restoredRecovery } = roundTrip(source, recovery);
    if (restoredRecovery?.reason !== "steerDefinitelyNotAccepted")
      throw new Error("Expected restored steer recovery");
    expect(restored.restoreSteerRecovery(restoredRecovery.transfer).result.type).toBe("applied");
  });

  it("distinguishes a rejected merge container identity from its original message identities", () => {
    const { queue, message } = rejectedMerge();
    const { restored } = roundTrip(queue);
    expect(restored.unknownMessages().map(({ id }) => id)).toEqual([message.id]);
    const record = queue.exportState(null);
    const pending = record.start.pending;
    if (pending?.message.type !== "rejectedSteerMerge") throw new Error("Expected persisted merge");
    const original = pending.message.transfer[0]?.intent.message;
    if (original == null) throw new Error("Expected original steer");
    expect(() => owner().rehydrateState({ ...record, ordinary: [original] })).toThrow(
      "multiple owners",
    );
    expect(() =>
      owner().rehydrateState({ ...record, ordinary: [{ ...original, id: message.id }] }),
    ).toThrow("multiple owners");
  });

  it.each(["live unknown", "restored issuing"] as const)(
    "releases the merge and all original identities after discarding %s",
    (delivery) => {
      const { queue, message, claim } = rejectedMerge();
      queue.submit(composerQueueMessage("preserved-a"));
      queue.submit(composerQueueMessage("preserved-b"));
      if (delivery === "live unknown") {
        queue.settleStart({ type: "deliveryUnknown", claim });
      }
      const target = delivery === "live unknown" ? queue : roundTrip(queue).restored;
      const before = target.exportState(null);
      expect(before.knownMessageIds).toEqual(
        expect.arrayContaining([message.id, "rejected-a", "rejected-b"]),
      );
      expect(target.discardUnknown("rejected-a")).toBe(false);
      expect(target.discardUnknown("missing")).toBe(false);
      expect(target.exportState(null)).toEqual(before);
      expect(target.discardUnknown(message.id)).toBe(true);
      const after = target.exportState(null);
      expect(after.start.pending).toBeNull();
      expect(after.knownMessageIds).toEqual(["preserved-a", "preserved-b"]);
      expect(after.steer.queued).toEqual([]);
      expect(after.steer.pending).toEqual([]);
      expect(after.steer.rejected).toEqual([]);
      expect(after.ordinary).toEqual(before.ordinary);
      expect(target.unknownMessages()).toEqual([]);
      const { restored } = roundTrip(target);
      restored.setAutomaticSendingPaused(false);
      const next = restored.drain().effects[0];
      expect(next).toMatchObject({
        type: "performStart",
        claim: { message: composerQueueMessage("preserved-a") },
      });
    },
  );

  it("does not consume a merge transfer in a discarded transaction candidate", () => {
    const { queue, message, claim } = rejectedMerge();
    queue.settleStart({ type: "deliveryUnknown", claim });
    const before = queue.exportState(null);
    const candidate = queue.prepare((pending) => pending.discardUnknown(message.id));
    expect(candidate.result).toBe(true);
    expect(candidate.queue.exportState(null).knownMessageIds).toEqual([]);
    roundTrip(candidate.queue);
    expect(queue.exportState(null)).toEqual(before);
    roundTrip(queue);
    const retry = queue.prepare((pending) => pending.discardUnknown(message.id));
    expect(retry.result).toBe(true);
    retry.commit();
    expect(queue.exportState(null).knownMessageIds).toEqual([]);
    roundTrip(queue);
  });

  it("accepts user-stopped ordinary recovery and its still-owned rejected transfer", () => {
    const source = createComposerInputQueue({ threadId: "thread-a", activeTurnId: "turn-a" });
    source.setAutomaticSendingPaused(true);
    source.submit(composerQueueMessage("ordinary-stopped"));
    source.submitSteer(composerQueueMessage("steer-stopped"));
    source.prepareInterruptedTerminal({
      type: "turnCompleted",
      turnId: "turn-a",
      status: "interrupted",
      commitId: "stopped",
    });
    const recovery = recoveryFrom(source.applyInterruptedDisposition("turn-a", "local"));
    const { restored, restoredRecovery } = roundTrip(source, recovery);
    if (restoredRecovery?.reason !== "userStopped")
      throw new Error("Expected user-stopped recovery");
    expect(restored.restoreUserStoppedRecovery(restoredRecovery).result.type).toBe("applied");
  });
});
