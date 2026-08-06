import { describe, expect, it } from "vitest";

import {
  createComposerInputQueue,
  type ComposerInputQueue,
  type ComposerInputQueueTransition,
  type ComposerQueueMessage,
  type StartClaim,
} from "../composerInputQueue";

const message = (id: string): ComposerQueueMessage => ({ id, text: `message ${id}` });

function startClaim(transition: ComposerInputQueueTransition): StartClaim {
  const effect = transition.effects[0];
  expect(effect?.type).toBe("performStart");
  if (effect?.type !== "performStart") {
    throw new Error("expected performStart effect");
  }
  return effect.claim;
}

function submit(queue: ComposerInputQueue, id: string): ComposerInputQueueTransition {
  return queue.submit(message(id));
}

describe("composer input queue", () => {
  it("issues one opaque single-message start claim for an idle submit", () => {
    const queue = createComposerInputQueue({ activeTurnId: null });

    const transition = submit(queue, "a");
    const claim = startClaim(transition);

    expect(transition).toEqual({
      result: { type: "claimIssued" },
      effects: [{ type: "performStart", claim }],
    });
    expect(claim).toMatchObject({ type: "start", message: message("a") });
    expect(Object.isFrozen(claim)).toBe(true);
    expect(Object.isFrozen(claim.message)).toBe(true);
  });

  it("queues active, pending, and busy submissions without outbound effects and keeps FIFO", () => {
    const activeQueue = createComposerInputQueue({ activeTurnId: "turn-active" });
    expect(submit(activeQueue, "active")).toEqual({
      result: { type: "queued", messageId: "active" },
      effects: [],
    });

    const queue = createComposerInputQueue({ activeTurnId: null });
    const firstClaim = startClaim(submit(queue, "a"));
    expect(submit(queue, "b")).toEqual({
      result: { type: "queued", messageId: "b" },
      effects: [],
    });
    expect(submit(queue, "c")).toEqual({
      result: { type: "queued", messageId: "c" },
      effects: [],
    });

    const afterFirst = queue.settleStart({ type: "definitelyNotAccepted", claim: firstClaim });
    const secondClaim = startClaim({ ...afterFirst, effects: afterFirst.effects.slice(1) });
    expect(secondClaim.message).toEqual(message("b"));

    const afterSecond = queue.settleStart({ type: "definitelyNotAccepted", claim: secondClaim });
    const thirdClaim = startClaim({ ...afterSecond, effects: afterSecond.effects.slice(1) });
    expect(thirdClaim.message).toEqual(message("c"));
  });

  it("rejects blank and locally owned duplicate messages without changing ownership", () => {
    const queue = createComposerInputQueue({ activeTurnId: null });

    expect(queue.submit({ id: "blank", text: " \n\t " })).toEqual({
      result: { type: "invalidInput", reason: "emptyText" },
      effects: [],
    });
    const claim = startClaim(submit(queue, "a"));
    expect(submit(queue, "a")).toEqual({
      result: { type: "duplicateIdentity", messageId: "a" },
      effects: [],
    });
    expect(queue.settleStart({ type: "accepted", claim, turnId: "turn-a" })).toEqual({
      result: { type: "applied", operation: "startAccepted" },
      effects: [],
    });
    expect(submit(queue, "a")).toEqual({
      result: { type: "duplicateIdentity", messageId: "a" },
      effects: [],
    });
  });

  it("keeps accepted claims single-flight and classifies replay, conflict, and foreign claims", () => {
    const queue = createComposerInputQueue({ activeTurnId: null });
    const claim = startClaim(submit(queue, "a"));
    const accepted = { type: "accepted", claim, turnId: "turn-a" } as const;

    expect(queue.settleStart(accepted)).toEqual({
      result: { type: "applied", operation: "startAccepted" },
      effects: [],
    });
    expect(queue.settleStart(accepted)).toEqual({
      result: { type: "idempotentReplay", subject: "startSettlement" },
      effects: [],
    });
    expect(queue.settleStart({ type: "deliveryUnknown", claim })).toEqual({
      result: { type: "stale", subject: "startSettlement" },
      effects: [],
    });
    expect(submit(queue, "b")).toEqual({
      result: { type: "queued", messageId: "b" },
      effects: [],
    });

    const foreignClaim = startClaim(submit(createComposerInputQueue(), "foreign"));
    expect(queue.settleStart({ type: "definitelyNotAccepted", claim: foreignClaim })).toEqual({
      result: { type: "ownershipMismatch", subject: "startClaim" },
      effects: [],
    });
  });

  it("keeps delivery-unknown ownership and blocks draining", () => {
    const queue = createComposerInputQueue({ activeTurnId: null });
    const claim = startClaim(submit(queue, "a"));
    const unknown = { type: "deliveryUnknown", claim } as const;

    expect(queue.settleStart(unknown)).toEqual({
      result: { type: "deliveryUnknown" },
      effects: [],
    });
    expect(submit(queue, "b")).toEqual({
      result: { type: "queued", messageId: "b" },
      effects: [],
    });
    expect(queue.settleStart(unknown)).toEqual({
      result: { type: "idempotentReplay", subject: "startSettlement" },
      effects: [],
    });
    expect(submit(queue, "a")).toEqual({
      result: { type: "duplicateIdentity", messageId: "a" },
      effects: [],
    });
  });

  it("recovers a definitely rejected claim, drains one FIFO item, and releases its identity", () => {
    const queue = createComposerInputQueue({ activeTurnId: null });
    const firstClaim = startClaim(submit(queue, "a"));
    submit(queue, "b");
    submit(queue, "c");

    const transition = queue.settleStart({
      type: "definitelyNotAccepted",
      claim: firstClaim,
    });
    const nextEffect = transition.effects[1];
    expect(nextEffect?.type).toBe("performStart");
    if (nextEffect?.type !== "performStart") {
      throw new Error("expected next performStart effect");
    }
    expect(transition).toEqual({
      result: {
        type: "recoveryProduced",
        reason: "startDefinitelyNotAccepted",
        messageIds: ["a"],
      },
      effects: [
        {
          type: "recover",
          batch: { reason: "startDefinitelyNotAccepted", messages: [message("a")] },
        },
        { type: "performStart", claim: nextEffect.claim },
      ],
    });
    expect(nextEffect.claim.message).toEqual(message("b"));
    expect(submit(queue, "a")).toEqual({
      result: { type: "queued", messageId: "a" },
      effects: [],
    });

    const afterSecond = queue.settleStart({
      type: "definitelyNotAccepted",
      claim: nextEffect.claim,
    });
    const thirdClaim = startClaim({ ...afterSecond, effects: afterSecond.effects.slice(1) });
    expect(thirdClaim.message).toEqual(message("c"));
  });
});
