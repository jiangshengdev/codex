import { describe, expect, it } from "vitest";
import {
  createComposerInputQueue,
  type ComposerInputQueueTransition,
  type RecoveryBatch,
  type StartClaim,
} from "../composerInputQueue";

function message(id: string, text = id) {
  return { id, text };
}

function submit(queue: ReturnType<typeof createComposerInputQueue>, id: string, text = id) {
  return queue.submit({ intent: "queue", message: message(id, text) });
}

function startClaim(transition: ComposerInputQueueTransition): StartClaim {
  const effect = transition.effects.find(({ type }) => type === "performStart");
  if (effect?.type !== "performStart") {
    throw new Error("expected a performStart effect");
  }
  return effect.claim;
}

function recoveryBatch(transition: ComposerInputQueueTransition): RecoveryBatch {
  const effect = transition.effects.find(({ type }) => type === "recover");
  if (effect?.type !== "recover") {
    throw new Error("expected a recover effect");
  }
  return effect.batch;
}

describe("ComposerInputQueue ordinary start ownership", () => {
  it("directly claims an idle submission exactly once", () => {
    const queue = createComposerInputQueue();

    const transition = submit(queue, "message-1", "first");

    expect(transition.result).toStrictEqual({ type: "claimIssued", claimType: "start" });
    expect(startClaim(transition).messages).toStrictEqual([message("message-1", "first")]);
    expect(queue.view()).toStrictEqual({
      ordinary: [],
      hasPendingStart: true,
      hasDeliveryUnknown: false,
    });
  });

  it("queues active-turn submissions in strict FIFO order", () => {
    const queue = createComposerInputQueue({ activeTurnId: "turn-active" });

    expect(submit(queue, "message-1").result).toStrictEqual({
      type: "queued",
      messageId: "message-1",
    });
    expect(submit(queue, "message-2").result).toStrictEqual({
      type: "queued",
      messageId: "message-2",
    });
    expect(queue.view().ordinary).toStrictEqual([message("message-1"), message("message-2")]);

    const firstStart = queue.observe({ type: "turnTerminal", turnId: "turn-active" });
    const firstClaim = startClaim(firstStart);
    expect(firstClaim.messages).toStrictEqual([message("message-1")]);
    expect(queue.view().ordinary).toStrictEqual([message("message-2")]);

    queue.settle({ type: "startAccepted", claim: firstClaim, turnId: "turn-next" });
    queue.observe({ type: "turnStarted", turnId: "turn-next" });
    const secondStart = queue.observe({ type: "turnTerminal", turnId: "turn-next" });
    expect(startClaim(secondStart).messages).toStrictEqual([message("message-2")]);
  });

  it("keeps accepted starts single-flight until an authoritative runtime observation", () => {
    const queue = createComposerInputQueue();
    const claim = startClaim(submit(queue, "message-1"));
    expect(submit(queue, "message-2").result).toStrictEqual({
      type: "queued",
      messageId: "message-2",
    });

    const accepted = queue.settle({ type: "startAccepted", claim, turnId: "turn-1" });
    expect(accepted).toStrictEqual({
      result: { type: "applied", operation: "startAccepted" },
      effects: [],
    });
    expect(queue.view()).toStrictEqual({
      ordinary: [message("message-2")],
      hasPendingStart: true,
      hasDeliveryUnknown: false,
    });
    expect(submit(queue, "message-3").effects).toStrictEqual([]);

    expect(queue.observe({ type: "turnStarted", turnId: "turn-1" }).result).toStrictEqual({
      type: "applied",
      operation: "turnStarted",
    });
    expect(queue.view()).toStrictEqual({
      ordinary: [message("message-2"), message("message-3")],
      hasPendingStart: false,
      hasDeliveryUnknown: false,
    });
  });

  it("accepts a matching terminal fact before turnStarted and drains only once", () => {
    const queue = createComposerInputQueue();
    const claim = startClaim(submit(queue, "message-1"));
    submit(queue, "message-2");
    queue.settle({ type: "startAccepted", claim, turnId: "turn-1" });

    const terminal = queue.observe({ type: "turnTerminal", turnId: "turn-1" });
    expect(startClaim(terminal).messages).toStrictEqual([message("message-2")]);
    expect(queue.observe({ type: "turnTerminal", turnId: "turn-1" })).toStrictEqual({
      result: { type: "idempotentReplay", subject: "runtimeObservation" },
      effects: [],
    });
    expect(queue.observe({ type: "turnStarted", turnId: "turn-1" })).toStrictEqual({
      result: { type: "stale", subject: "runtimeObservation" },
      effects: [],
    });
  });

  it("retains a matching turnStarted that arrives before the start settlement", () => {
    const queue = createComposerInputQueue();
    const claim = startClaim(submit(queue, "message-1"));
    submit(queue, "message-2");

    expect(queue.observe({ type: "turnStarted", turnId: "turn-1" })).toStrictEqual({
      result: { type: "applied", operation: "observationRecorded" },
      effects: [],
    });
    expect(queue.view().hasPendingStart).toBe(true);
    expect(queue.settle({ type: "startAccepted", claim, turnId: "turn-1" })).toStrictEqual({
      result: { type: "applied", operation: "startAccepted" },
      effects: [],
    });
    expect(queue.view()).toStrictEqual({
      ordinary: [message("message-2")],
      hasPendingStart: false,
      hasDeliveryUnknown: false,
    });
  });

  it("does not replace a pending claim fact with an observation for another turn", () => {
    const queue = createComposerInputQueue();
    const claim = startClaim(submit(queue, "message-1"));

    queue.observe({ type: "turnStarted", turnId: "turn-original" });
    expect(queue.observe({ type: "turnTerminal", turnId: "turn-other" })).toStrictEqual({
      result: { type: "ownershipMismatch", subject: "runtimeTurn" },
      effects: [],
    });
    expect(queue.settle({ type: "startAccepted", claim, turnId: "turn-original" })).toStrictEqual({
      result: { type: "applied", operation: "startAccepted" },
      effects: [],
    });
    expect(queue.view()).toStrictEqual({
      ordinary: [],
      hasPendingStart: false,
      hasDeliveryUnknown: false,
    });
  });

  it("retains a matching terminal that arrives before settlement and then continues FIFO", () => {
    const queue = createComposerInputQueue();
    const claim = startClaim(submit(queue, "message-1"));
    submit(queue, "message-2");

    expect(queue.observe({ type: "turnTerminal", turnId: "turn-1" })).toStrictEqual({
      result: { type: "applied", operation: "observationRecorded" },
      effects: [],
    });
    const accepted = queue.settle({ type: "startAccepted", claim, turnId: "turn-1" });
    expect(startClaim(accepted).messages).toStrictEqual([message("message-2")]);
  });

  it("recovers a definitely rejected claim and continues the remaining FIFO", () => {
    const queue = createComposerInputQueue();
    const rejectedClaim = startClaim(submit(queue, "message-1"));
    submit(queue, "message-2");
    submit(queue, "message-3");

    const rejected = queue.settle({
      type: "startDefinitelyNotAccepted",
      claim: rejectedClaim,
    });

    expect(rejected.result).toStrictEqual({
      type: "recoveryProduced",
      reason: "startDefinitelyNotAccepted",
      messageIds: ["message-1"],
    });
    expect(recoveryBatch(rejected)).toStrictEqual({
      reason: "startDefinitelyNotAccepted",
      messages: [message("message-1")],
    });
    expect(startClaim(rejected).messages).toStrictEqual([message("message-2")]);
    expect(queue.view()).toStrictEqual({
      ordinary: [message("message-3")],
      hasPendingStart: true,
      hasDeliveryUnknown: false,
    });
  });

  it("keeps delivery-unknown ownership and blocks automatic drain", () => {
    const queue = createComposerInputQueue();
    const claim = startClaim(submit(queue, "message-1"));
    submit(queue, "message-2");

    expect(queue.settle({ type: "startDeliveryUnknown", claim })).toStrictEqual({
      result: { type: "deliveryUnknown", claimType: "start" },
      effects: [],
    });
    expect(submit(queue, "message-3").effects).toStrictEqual([]);
    expect(queue.view()).toStrictEqual({
      ordinary: [message("message-2"), message("message-3")],
      hasPendingStart: true,
      hasDeliveryUnknown: true,
    });
  });

  it("classifies empty and duplicate submissions without losing the owned message", () => {
    const queue = createComposerInputQueue();

    expect(submit(queue, "empty", " \n ").result).toStrictEqual({
      type: "invalidInput",
      reason: "emptyText",
    });
    const claim = startClaim(submit(queue, "message-1", "kept"));
    expect(submit(queue, "message-1", "replacement").result).toStrictEqual({
      type: "duplicateIdentity",
      messageId: "message-1",
    });
    expect(claim.messages).toStrictEqual([message("message-1", "kept")]);
  });

  it("releases message identity after ownership moves to server or recovery", () => {
    const serverQueue = createComposerInputQueue();
    const acceptedClaim = startClaim(submit(serverQueue, "message-1"));
    serverQueue.settle({ type: "startAccepted", claim: acceptedClaim, turnId: "turn-1" });
    serverQueue.observe({ type: "turnStarted", turnId: "turn-1" });
    expect(submit(serverQueue, "message-1", "new local owner").result).toStrictEqual({
      type: "queued",
      messageId: "message-1",
    });

    const recoveryQueue = createComposerInputQueue();
    const rejectedClaim = startClaim(submit(recoveryQueue, "message-2"));
    recoveryQueue.settle({ type: "startDefinitelyNotAccepted", claim: rejectedClaim });
    expect(submit(recoveryQueue, "message-2", "recovered elsewhere").result).toStrictEqual({
      type: "claimIssued",
      claimType: "start",
    });
  });

  it("distinguishes foreign claims, exact replay, stale settlement, and turn mismatch", () => {
    const queue = createComposerInputQueue();
    const claim = startClaim(submit(queue, "message-1"));
    const foreignClaim = startClaim(submit(createComposerInputQueue(), "foreign"));

    expect(
      queue.settle({ type: "startDeliveryUnknown", claim: foreignClaim }).result,
    ).toStrictEqual({ type: "ownershipMismatch", subject: "startClaim" });
    expect(queue.settle({ type: "startAccepted", claim, turnId: "turn-1" }).result).toStrictEqual({
      type: "applied",
      operation: "startAccepted",
    });
    expect(queue.settle({ type: "startAccepted", claim, turnId: "turn-1" }).result).toStrictEqual({
      type: "idempotentReplay",
      subject: "startSettlement",
    });
    expect(queue.settle({ type: "startDefinitelyNotAccepted", claim }).result).toStrictEqual({
      type: "stale",
      subject: "startSettlement",
    });
    expect(queue.observe({ type: "turnStarted", turnId: "turn-other" }).result).toStrictEqual({
      type: "ownershipMismatch",
      subject: "runtimeTurn",
    });
    expect(queue.observe({ type: "turnTerminal", turnId: "turn-stale" }).result).toStrictEqual({
      type: "ownershipMismatch",
      subject: "runtimeTurn",
    });
  });

  it("returns stale for an unrelated terminal observation while idle", () => {
    const queue = createComposerInputQueue();

    expect(queue.observe({ type: "turnTerminal", turnId: "turn-old" })).toStrictEqual({
      result: { type: "stale", subject: "runtimeObservation" },
      effects: [],
    });
  });

  it("keeps only the latest terminal identity and classifies an older terminal as stale", () => {
    const queue = createComposerInputQueue({ activeTurnId: "turn-1" });
    queue.observe({ type: "turnTerminal", turnId: "turn-1" });
    queue.observe({ type: "turnStarted", turnId: "turn-2" });
    queue.observe({ type: "turnTerminal", turnId: "turn-2" });

    expect(queue.observe({ type: "turnTerminal", turnId: "turn-1" })).toStrictEqual({
      result: { type: "stale", subject: "runtimeObservation" },
      effects: [],
    });
  });
});
