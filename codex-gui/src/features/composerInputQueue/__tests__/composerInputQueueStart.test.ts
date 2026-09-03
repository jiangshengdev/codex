import { describe, expect, it } from "vitest";

import {
  createComposerInputQueue,
  type ComposerInputQueue,
  type ComposerInputQueueView,
  type ComposerInputQueueTransition,
  type ComposerQueueMessage,
  type StartClaim,
} from "../composerInputQueue";
import { composerDraftCapture, composerQueueMessage } from "./composerInputQueueTestFixtures";

const message = (id: string): ComposerQueueMessage => composerQueueMessage(id);

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

const committedMessage = (claim: StartClaim, turnId: string, commitId: string) => ({
  type: "userMessageCommitted" as const,
  clientId: claim.clientUserMessageId,
  turnId,
  commitId,
});
const expectedQueueView = (
  queue: ComposerInputQueue,
  overrides: Partial<ComposerInputQueueView> = {},
): ComposerInputQueueView => ({
  ordinaryQueuedCount: 0,
  guidingCount: 0,
  detailRevision: queue.detailRevision(),
  rejectedSteers: [],
  hasUnknownSteer: false,
  releaseState: { type: "safe" },
  ...overrides,
});

describe("composer input queue", () => {
  it("issues one opaque single-message start claim for an idle submit", () => {
    const queue = createComposerInputQueue({ threadId: "thread-1", activeTurnId: null });

    expect(queue.view()).toEqual(expectedQueueView(queue));
    const submittedMessage = message("a");
    const transition = queue.submit(submittedMessage);
    const claim = startClaim(transition);

    expect(transition).toEqual({
      result: { type: "claimIssued" },
      effects: [{ type: "performStart", claim }],
    });
    expect(claim.message).toEqual(submittedMessage);
    expect(claim.message).not.toBe(submittedMessage);
    expect(claim.message.input).not.toBe(submittedMessage.input);
    const submittedText = submittedMessage.input[0];
    const claimedText = claim.message.input[0];
    if (submittedText?.type !== "text" || claimedText?.type !== "text") {
      throw new Error("expected first input items to be text");
    }
    expect(claimedText).not.toBe(submittedText);
    expect(claimedText.text_elements).not.toBe(submittedText.text_elements);
    expect(queue.view()).toEqual(
      expectedQueueView(queue, {
        releaseState: {
          type: "blocked",
          blockers: [{ type: "pendingStart", phase: "issuing" }],
        },
      }),
    );
  });

  it("issues distinct client message identities across queue instances", () => {
    const firstClaim = startClaim(submit(createComposerInputQueue(), "a"));
    const secondClaim = startClaim(submit(createComposerInputQueue(), "a"));

    expect(firstClaim.clientUserMessageId).not.toBe(secondClaim.clientUserMessageId);
  });

  it("exposes every local release blocker without exposing owned messages", () => {
    expect(createComposerInputQueue().view().releaseState).toEqual({ type: "safe" });
    expect(
      createComposerInputQueue({ threadId: "thread-1", activeTurnId: "turn-active" }).view()
        .releaseState,
    ).toEqual({
      type: "safe",
    });

    const ordinary = createComposerInputQueue({
      threadId: "thread-1",
      activeTurnId: "turn-active",
    });
    submit(ordinary, "ordinary");
    expect(ordinary.view().releaseState).toEqual({
      type: "blocked",
      blockers: [{ type: "ordinaryQueued", count: 1 }],
    });

    const pending = createComposerInputQueue();
    const claim = startClaim(submit(pending, "owned"));
    expect(pending.view().releaseState).toEqual({
      type: "blocked",
      blockers: [{ type: "pendingStart", phase: "issuing" }],
    });
    submit(pending, "ordinary");
    expect(pending.view().releaseState).toEqual({
      type: "blocked",
      blockers: [
        { type: "ordinaryQueued", count: 1 },
        { type: "pendingStart", phase: "issuing" },
      ],
    });

    pending.settleStart({ type: "accepted", claim, turnId: "turn-owned" });
    expect(pending.view().releaseState).toEqual({
      type: "blocked",
      blockers: [
        { type: "ordinaryQueued", count: 1 },
        { type: "pendingStart", phase: "acceptedAwaitingRuntime" },
      ],
    });

    const deliveryUnknown = createComposerInputQueue();
    const unknownClaim = startClaim(submit(deliveryUnknown, "unknown"));
    deliveryUnknown.settleStart({ type: "deliveryUnknown", claim: unknownClaim });
    expect(deliveryUnknown.view().releaseState).toEqual({
      type: "blocked",
      blockers: [{ type: "pendingStart", phase: "deliveryUnknown" }],
    });
    deliveryUnknown.observe(committedMessage(unknownClaim, "turn-unknown", "commit-unknown"));
    expect(deliveryUnknown.view().releaseState).toEqual({ type: "safe" });
  });

  it("queues active, pending, and busy submissions without outbound effects and keeps FIFO", () => {
    const activeQueue = createComposerInputQueue({
      threadId: "thread-1",
      activeTurnId: "turn-active",
    });
    expect(submit(activeQueue, "active")).toEqual({
      result: { type: "queued", messageId: "active" },
      effects: [],
    });
    expect(activeQueue.view()).toEqual(
      expectedQueueView(activeQueue, {
        ordinaryQueuedCount: 1,
        releaseState: {
          type: "blocked",
          blockers: [{ type: "ordinaryQueued", count: 1 }],
        },
      }),
    );

    const queue = createComposerInputQueue({ threadId: "thread-1", activeTurnId: null });
    const firstClaim = startClaim(submit(queue, "a"));
    expect(submit(queue, "b")).toEqual({
      result: { type: "queued", messageId: "b" },
      effects: [],
    });
    expect(queue.view()).toEqual(
      expectedQueueView(queue, {
        ordinaryQueuedCount: 1,
        releaseState: {
          type: "blocked",
          blockers: [
            { type: "ordinaryQueued", count: 1 },
            { type: "pendingStart", phase: "issuing" },
          ],
        },
      }),
    );
    expect(submit(queue, "c")).toEqual({
      result: { type: "queued", messageId: "c" },
      effects: [],
    });
    expect(queue.view()).toEqual(
      expectedQueueView(queue, {
        ordinaryQueuedCount: 2,
        releaseState: {
          type: "blocked",
          blockers: [
            { type: "ordinaryQueued", count: 2 },
            { type: "pendingStart", phase: "issuing" },
          ],
        },
      }),
    );

    const afterFirst = queue.settleStart({ type: "definitelyNotAccepted", claim: firstClaim });
    const secondClaim = startClaim({ ...afterFirst, effects: afterFirst.effects.slice(1) });
    expect(secondClaim.message).toEqual(message("b"));
    expect(queue.view()).toEqual(
      expectedQueueView(queue, {
        ordinaryQueuedCount: 1,
        releaseState: {
          type: "blocked",
          blockers: [
            { type: "ordinaryQueued", count: 1 },
            { type: "pendingStart", phase: "issuing" },
          ],
        },
      }),
    );

    const afterSecond = queue.settleStart({ type: "definitelyNotAccepted", claim: secondClaim });
    const thirdClaim = startClaim({ ...afterSecond, effects: afterSecond.effects.slice(1) });
    expect(thirdClaim.message).toEqual(message("c"));
    expect(queue.view()).toEqual(
      expectedQueueView(queue, {
        releaseState: {
          type: "blocked",
          blockers: [{ type: "pendingStart", phase: "issuing" }],
        },
      }),
    );
  });

  it("rejects empty and whitespace-only captures without changing ownership", () => {
    const queue = createComposerInputQueue({ threadId: "thread-1", activeTurnId: null });
    const emptyCapture = composerDraftCapture("");
    const blankCapture = composerDraftCapture(" \n\t ");

    expect(
      queue.submit({
        type: "recoverable",
        id: "empty",
        draft: emptyCapture.draft,
        input: emptyCapture.input,
      }),
    ).toEqual({
      result: { type: "invalidInput", reason: "emptyInput" },
      effects: [],
    });
    expect(
      queue.submit({
        type: "recoverable",
        id: "blank",
        draft: blankCapture.draft,
        input: blankCapture.input,
      }),
    ).toEqual({
      result: { type: "invalidInput", reason: "emptyInput" },
      effects: [],
    });
    expect(queue.submit(message("non-empty")).result).toEqual({
      type: "claimIssued",
    });

    const duplicateQueue = createComposerInputQueue({ threadId: "thread-1", activeTurnId: null });
    const claim = startClaim(submit(duplicateQueue, "a"));
    expect(submit(duplicateQueue, "a")).toEqual({
      result: { type: "duplicateIdentity", messageId: "a" },
      effects: [],
    });
    expect(duplicateQueue.settleStart({ type: "accepted", claim, turnId: "turn-a" })).toEqual({
      result: { type: "applied", operation: "startAccepted" },
      effects: [],
    });
    expect(submit(duplicateQueue, "a")).toEqual({
      result: { type: "duplicateIdentity", messageId: "a" },
      effects: [],
    });
  });

  it("keeps accepted claims single-flight and classifies replay, conflict, and foreign claims", () => {
    const queue = createComposerInputQueue({ threadId: "thread-1", activeTurnId: null });
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
    const queue = createComposerInputQueue({ threadId: "thread-1", activeTurnId: null });
    const claim = startClaim(submit(queue, "a"));
    const unknown = { type: "deliveryUnknown", claim } as const;

    expect(queue.settleStart(unknown)).toEqual({
      result: { type: "deliveryUnknown" },
      effects: [],
    });
    expect(queue.view()).toEqual(
      expectedQueueView(queue, {
        releaseState: {
          type: "blocked",
          blockers: [{ type: "pendingStart", phase: "deliveryUnknown" }],
        },
      }),
    );
    expect(submit(queue, "b")).toEqual({
      result: { type: "queued", messageId: "b" },
      effects: [],
    });
    expect(queue.view()).toEqual(
      expectedQueueView(queue, {
        ordinaryQueuedCount: 1,
        releaseState: {
          type: "blocked",
          blockers: [
            { type: "ordinaryQueued", count: 1 },
            { type: "pendingStart", phase: "deliveryUnknown" },
          ],
        },
      }),
    );
    expect(queue.settleStart(unknown)).toEqual({
      result: { type: "idempotentReplay", subject: "startSettlement" },
      effects: [],
    });
    expect(queue.view()).toEqual(
      expectedQueueView(queue, {
        ordinaryQueuedCount: 1,
        releaseState: {
          type: "blocked",
          blockers: [
            { type: "ordinaryQueued", count: 1 },
            { type: "pendingStart", phase: "deliveryUnknown" },
          ],
        },
      }),
    );
    expect(submit(queue, "a")).toEqual({
      result: { type: "duplicateIdentity", messageId: "a" },
      effects: [],
    });
  });

  it("recovers a definitely rejected claim, drains one FIFO item, and releases its identity", () => {
    const queue = createComposerInputQueue({ threadId: "thread-1", activeTurnId: null });
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
