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
  return { queue, message: effect.claim.message };
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
