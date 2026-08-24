import { describe, expect, it } from "vitest";

import {
  COMPOSER_PENDING_INPUT_MAX_PAGE_SIZE,
  createComposerInputQueue,
  type ComposerInputQueue,
  type ComposerInputQueueView,
  type ComposerInputQueueTransition,
  type ComposerQueueMessage,
  type ComposerPendingInputCursor,
  type ComposerPendingInputLane,
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

function acceptAndCompleteStart(queue: ComposerInputQueue, claim: StartClaim, turnId: string) {
  queue.settleStart({ type: "accepted", claim, turnId });
  return queue.observe({
    type: "turnCompleted",
    turnId,
    status: "completed",
    commitId: `terminal-${turnId}`,
  });
}

function pendingPage(queue: ComposerInputQueue, lane: ComposerPendingInputLane, limit = 100) {
  const result = queue.readPendingInputPage({
    lane,
    revision: queue.detailRevision(),
    cursor: null,
    limit,
  });
  expect(result.type).toBe("page");
  if (result.type !== "page") throw new Error(`expected ${lane} detail page`);
  return result;
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

  it("converges equivalently when turn start arrives before or after acceptance", () => {
    const afterSettlement = createComposerInputQueue();
    const firstClaim = startClaim(submit(afterSettlement, "a"));
    submit(afterSettlement, "b");
    afterSettlement.settleStart({ type: "accepted", claim: firstClaim, turnId: "turn-a" });
    expect(
      afterSettlement.observe({
        type: "turnStarted",
        turnId: "turn-foreign",
        commitId: "start-foreign",
      }).result,
    ).toEqual({ type: "ownershipMismatch", subject: "runtimeTurn" });
    expect(
      afterSettlement.observe({ type: "turnStarted", turnId: "turn-a", commitId: "start-a" }),
    ).toEqual({ result: { type: "applied", operation: "turnStarted" }, effects: [] });

    const beforeSettlement = createComposerInputQueue();
    const secondClaim = startClaim(submit(beforeSettlement, "a"));
    submit(beforeSettlement, "b");
    expect(
      beforeSettlement.observe({ type: "turnStarted", turnId: "turn-a", commitId: "start-a" }),
    ).toEqual({ result: { type: "applied", operation: "observationRecorded" }, effects: [] });
    expect(
      beforeSettlement.settleStart({ type: "accepted", claim: secondClaim, turnId: "turn-a" }),
    ).toEqual({ result: { type: "applied", operation: "turnStarted" }, effects: [] });

    for (const queue of [afterSettlement, beforeSettlement]) {
      const completed = queue.observe({
        type: "turnCompleted",
        turnId: "turn-a",
        status: "completed",
        commitId: "terminal-a",
      });
      expect(startClaim(completed).message).toEqual(message("b"));
    }
  });

  it("converges equivalently when commit arrives before or after acceptance", () => {
    const beforeSettlement = createComposerInputQueue();
    const beforeClaim = startClaim(submit(beforeSettlement, "a"));
    submit(beforeSettlement, "b");
    expect(beforeSettlement.observe(committedMessage(beforeClaim, "turn-a", "message-a"))).toEqual({
      result: { type: "applied", operation: "observationRecorded" },
      effects: [],
    });
    expect(
      beforeSettlement.settleStart({ type: "accepted", claim: beforeClaim, turnId: "turn-a" }),
    ).toEqual({ result: { type: "applied", operation: "userMessageCommitted" }, effects: [] });

    const afterSettlement = createComposerInputQueue();
    const afterClaim = startClaim(submit(afterSettlement, "a"));
    submit(afterSettlement, "b");
    afterSettlement.settleStart({ type: "accepted", claim: afterClaim, turnId: "turn-a" });
    expect(afterSettlement.observe(committedMessage(afterClaim, "turn-a", "message-a"))).toEqual({
      result: { type: "applied", operation: "userMessageCommitted" },
      effects: [],
    });

    for (const queue of [beforeSettlement, afterSettlement]) {
      const completed = queue.observe({
        type: "turnCompleted",
        turnId: "turn-a",
        status: "completed",
        commitId: "terminal-a",
      });
      expect(startClaim(completed).message).toEqual(message("b"));
    }
  });

  it("converges delivery unknown through matching commit or terminal evidence", () => {
    const queue = createComposerInputQueue();
    const claim = startClaim(submit(queue, "a"));
    submit(queue, "b");
    queue.settleStart({ type: "deliveryUnknown", claim });

    expect(
      queue.observe({
        type: "userMessageCommitted",
        clientId: "foreign",
        turnId: "turn-a",
        commitId: "message-foreign",
      }),
    ).toEqual({
      result: { type: "ownershipMismatch", subject: "runtimeCommit" },
      effects: [],
    });
    const committed = committedMessage(claim, "turn-a", "message-a");
    expect(queue.observe(committed)).toEqual({
      result: { type: "applied", operation: "userMessageCommitted" },
      effects: [],
    });
    expect(queue.observe(committed).result).toEqual({
      type: "idempotentReplay",
      subject: "runtimeCommit",
    });
    expect(queue.observe({ ...committed, turnId: "turn-foreign" }).result).toEqual({
      type: "ownershipMismatch",
      subject: "runtimeCommit",
    });
    expect(queue.observe({ ...committed, clientId: "other" }).result).toEqual({
      type: "ownershipMismatch",
      subject: "runtimeCommit",
    });
    expect(queue.view()).toEqual(
      expectedQueueView(queue, {
        ordinaryQueuedCount: 1,
        releaseState: {
          type: "blocked",
          blockers: [{ type: "ordinaryQueued", count: 1 }],
        },
      }),
    );
    const completed = queue.observe({
      type: "turnCompleted",
      turnId: "turn-a",
      status: "completed",
      commitId: "terminal-a",
    });
    expect(startClaim(completed).message).toEqual(message("b"));
    expect(queue.view()).toEqual(
      expectedQueueView(queue, {
        releaseState: {
          type: "blocked",
          blockers: [{ type: "pendingStart", phase: "issuing" }],
        },
      }),
    );

    const terminalQueue = createComposerInputQueue();
    const terminalClaim = startClaim(submit(terminalQueue, "a"));
    submit(terminalQueue, "b");
    const terminal = {
      type: "turnCompleted",
      turnId: "turn-a",
      status: "completed",
      commitId: "terminal-a",
    } as const;
    expect(terminalQueue.observe(terminal)).toEqual({
      result: { type: "applied", operation: "observationRecorded" },
      effects: [],
    });
    expect(terminalQueue.settleStart({ type: "deliveryUnknown", claim: terminalClaim })).toEqual({
      result: { type: "deliveryUnknown" },
      effects: [],
    });
    expect(submit(terminalQueue, "a").result).toEqual({
      type: "duplicateIdentity",
      messageId: "a",
    });
    expect(
      startClaim(terminalQueue.observe(committedMessage(terminalClaim, "turn-a", "message-a")))
        .message,
    ).toEqual(message("b"));
  });

  it("keeps delivery-unknown ownership when only bare foreign runtime facts arrive", () => {
    const queue = createComposerInputQueue();
    const claim = startClaim(submit(queue, "a"));
    submit(queue, "b");
    queue.settleStart({ type: "deliveryUnknown", claim });

    expect(
      queue.observe({ type: "turnStarted", turnId: "foreign", commitId: "foreign-start" }),
    ).toEqual({ result: { type: "applied", operation: "observationRecorded" }, effects: [] });
    expect(
      queue.prepareInterruptedTerminal({
        type: "turnCompleted",
        turnId: "foreign",
        status: "interrupted",
        commitId: "foreign-terminal",
      }),
    ).toEqual({ result: { type: "applied", operation: "observationRecorded" }, effects: [] });
    expect(submit(queue, "a").result).toEqual({ type: "duplicateIdentity", messageId: "a" });
    expect(submit(queue, "b").result).toEqual({ type: "duplicateIdentity", messageId: "b" });
  });

  it("selects the matching candidate after foreign same-kind facts arrive while issuing", () => {
    const queue = createComposerInputQueue();
    const claim = startClaim(submit(queue, "a"));
    submit(queue, "b");
    queue.observe({ type: "turnStarted", turnId: "foreign", commitId: "foreign-start" });
    queue.observe({ type: "turnStarted", turnId: "turn-a", commitId: "matching-start" });

    expect(queue.settleStart({ type: "accepted", claim, turnId: "turn-a" })).toEqual({
      result: { type: "applied", operation: "turnStarted" },
      effects: [],
    });
    const completed = queue.observe({
      type: "turnCompleted",
      turnId: "turn-a",
      status: "completed",
      commitId: "terminal-a",
    });
    expect(startClaim(completed).message).toEqual(message("b"));
  });

  it("does not let an evicted bare terminal release a delivery-unknown owner when replayed", () => {
    const queue = createComposerInputQueue();
    const claim = startClaim(submit(queue, "a"));
    const oldTerminal = {
      type: "turnCompleted",
      turnId: "old",
      status: "completed",
      commitId: "old-terminal",
    } as const;
    queue.observe(oldTerminal);
    for (let index = 0; index < 4; index += 1) {
      queue.observe({
        type: "turnStarted",
        turnId: `candidate-${String(index)}`,
        commitId: `candidate-${String(index)}`,
      });
    }
    queue.settleStart({ type: "deliveryUnknown", claim });

    expect(queue.observe(oldTerminal)).toEqual({
      result: { type: "applied", operation: "observationRecorded" },
      effects: [],
    });
    expect(submit(queue, "a").result).toEqual({ type: "duplicateIdentity", messageId: "a" });
  });

  it("rejects an evicted old claim commit after the local message identity is reused", () => {
    const queue = createComposerInputQueue();
    const oldClaim = startClaim(submit(queue, "a"));
    const oldCommit = committedMessage(oldClaim, "turn-old", "message-old");
    const oldTerminal = {
      type: "turnCompleted",
      turnId: "turn-old",
      status: "completed",
      commitId: "terminal-old",
    } as const;
    queue.settleStart({ type: "deliveryUnknown", claim: oldClaim });
    queue.observe(oldCommit);
    queue.observe(oldTerminal);

    for (let index = 0; index < 2; index += 1) {
      const turnId = `eviction-${String(index)}`;
      queue.observe({ type: "turnStarted", turnId, commitId: `${turnId}-start` });
      queue.observe({
        type: "turnCompleted",
        turnId,
        status: "completed",
        commitId: `${turnId}-terminal`,
      });
    }

    const newClaim = startClaim(submit(queue, "a"));
    expect(newClaim.clientUserMessageId).not.toBe(oldClaim.clientUserMessageId);
    submit(queue, "b");
    queue.settleStart({ type: "deliveryUnknown", claim: newClaim });
    expect(queue.observe(oldCommit)).toEqual({
      result: { type: "ownershipMismatch", subject: "runtimeCommit" },
      effects: [],
    });
    expect(queue.observe(oldTerminal)).toEqual({
      result: { type: "applied", operation: "observationRecorded" },
      effects: [],
    });
    expect(submit(queue, "a").result).toEqual({ type: "duplicateIdentity", messageId: "a" });
    expect(queue.observe(committedMessage(newClaim, "turn-new", "message-new"))).toEqual({
      result: { type: "applied", operation: "userMessageCommitted" },
      effects: [],
    });
    const completed = queue.observe({
      type: "turnCompleted",
      turnId: "turn-new",
      status: "completed",
      commitId: "terminal-new",
    });
    expect(startClaim(completed).message).toEqual(message("b"));
  });

  it("prepares one local interruption and restores ordinary messages in FIFO order", () => {
    const queue = createComposerInputQueue({ threadId: "thread-1", activeTurnId: "turn-a" });
    submit(queue, "b");
    submit(queue, "c");
    expect(queue.view()).toEqual(
      expectedQueueView(queue, {
        ordinaryQueuedCount: 2,
        releaseState: {
          type: "blocked",
          blockers: [{ type: "ordinaryQueued", count: 2 }],
        },
      }),
    );
    const interrupted = {
      type: "turnCompleted",
      turnId: "turn-a",
      status: "interrupted",
      commitId: "terminal-a",
    } as const;

    expect(queue.prepareInterruptedTerminal(interrupted)).toEqual({
      result: { type: "interruptedTerminalPrepared", turnId: "turn-a" },
      effects: [],
    });
    expect(queue.applyInterruptedDisposition("wrong-turn", "local")).toEqual({
      result: { type: "ownershipMismatch", subject: "interruptedTurn" },
      effects: [],
    });
    const stopped = queue.applyInterruptedDisposition("turn-a", "local");
    expect(stopped).toEqual({
      result: { type: "recoveryProduced", reason: "userStopped", messageIds: ["b", "c"] },
      effects: [
        {
          type: "recover",
          batch: { reason: "userStopped", rejected: null, messages: [message("b"), message("c")] },
        },
      ],
    });
    expect(queue.applyInterruptedDisposition("turn-a", "local")).toEqual({
      result: { type: "ownershipMismatch", subject: "interruptedTurn" },
      effects: [],
    });
    const recovery = stopped.effects[0];
    if (recovery?.type !== "recover" || recovery.batch.reason !== "userStopped") {
      throw new Error("expected user-stopped recovery");
    }
    expect(queue.restoreUserStoppedRecovery({ ...recovery.batch })).toEqual({
      result: { type: "ownershipMismatch", subject: "userStoppedRecovery" },
      effects: [],
    });
    const first = startClaim(queue.restoreUserStoppedRecovery(recovery.batch));
    expect(queue.restoreUserStoppedRecovery(recovery.batch)).toEqual({
      result: { type: "ownershipMismatch", subject: "userStoppedRecovery" },
      effects: [],
    });
    expect(first.message).toEqual(message("b"));
    queue.settleStart({ type: "accepted", claim: first, turnId: "turn-b" });
    expect(
      startClaim(
        queue.observe({
          type: "turnCompleted",
          turnId: "turn-b",
          status: "completed",
          commitId: "terminal-b",
        }),
      ).message,
    ).toEqual(message("c"));
  });

  it("invalidates pre-stop cursors and republishes only remaining ordinary FIFO after recovery", () => {
    const queue = createComposerInputQueue({ threadId: "thread-1", activeTurnId: "turn-a" });
    submit(queue, "b");
    submit(queue, "c");
    submit(queue, "d");
    const beforeStopRevision = queue.detailRevision();
    const beforeStop = pendingPage(queue, "ordinary", 1);
    const beforeStopAll = pendingPage(queue, "ordinary");
    const oldKeys = beforeStopAll.items.map(({ key }) => key);
    const oldFirstKey = oldKeys[0];
    if (beforeStop.nextCursor == null || oldKeys.length !== 3 || oldFirstKey == null) {
      throw new Error("expected pre-stop ordinary cursor and keys");
    }

    queue.prepareInterruptedTerminal({
      type: "turnCompleted",
      turnId: "turn-a",
      status: "interrupted",
      commitId: "terminal-a",
    });
    const stopped = queue.applyInterruptedDisposition("turn-a", "local");
    const recovery = stopped.effects[0];
    if (recovery?.type !== "recover" || recovery.batch.reason !== "userStopped") {
      throw new Error("expected user-stopped recovery");
    }
    const first = startClaim(queue.restoreUserStoppedRecovery(recovery.batch));

    expect(first.message).toEqual(message("b"));
    expect(
      queue.readPendingInputPage({
        lane: "ordinary",
        revision: beforeStopRevision,
        cursor: beforeStop.nextCursor,
        limit: 1,
      }),
    ).toEqual({ type: "stale", revision: queue.detailRevision() });
    const restored = pendingPage(queue, "ordinary");
    expect(restored.items.map(({ preview }) => preview)).toMatchObject([
      { text: "message c" },
      { text: "message d" },
    ]);
    const restoredKeys = restored.items.map(({ key }) => key);
    expect(restoredKeys).toHaveLength(2);
    expect(restoredKeys.every((key) => !oldKeys.includes(key))).toBe(true);
    expect(pendingPage(queue, "ordinary").items.map(({ key }) => key)).toEqual(restoredKeys);
    expect(
      queue.readPendingInputDetail({ key: oldFirstKey, revision: queue.detailRevision() }),
    ).toEqual({ type: "missing", revision: queue.detailRevision() });
  });

  it("restores local rejected steers before ordinary and auto-drains non-local interruption", () => {
    const local = createComposerInputQueue({ threadId: "thread-1", activeTurnId: "turn-local" });
    submit(local, "ordinary");
    const first = local.submitSteer(message("steer-a")).effects[0];
    if (first?.type !== "performSteer") throw new Error("expected steer claim");
    local.submitSteer(message("steer-b"));
    local.settleSteer({ type: "activeTurnNotSteerable", claim: first.claim });
    local.prepareInterruptedTerminal({
      type: "turnCompleted",
      turnId: "turn-local",
      status: "interrupted",
      commitId: "terminal-local",
    });
    const stopped = local.applyInterruptedDisposition("turn-local", "local");
    const recovery = stopped.effects[0];
    if (recovery?.type !== "recover" || recovery.batch.reason !== "userStopped") {
      throw new Error("expected user-stopped recovery");
    }
    const merge = startClaim(local.restoreUserStoppedRecovery(recovery.batch));
    expect({ input: merge.message.input, queued: local.view().ordinaryQueuedCount }).toEqual({
      input: [...message("steer-a").input, ...message("steer-b").input],
      queued: 1,
    });
    local.settleStart({ type: "accepted", claim: merge, turnId: "turn-merge" });
    expect(
      startClaim(
        local.observe({
          type: "turnCompleted",
          turnId: "turn-merge",
          status: "completed",
          commitId: "terminal-merge",
        }),
      ).message,
    ).toEqual(message("ordinary"));

    const nonLocal = createComposerInputQueue({
      threadId: "thread-1",
      activeTurnId: "turn-non-local",
    });
    submit(nonLocal, "ordinary-front");
    const pending = nonLocal.submitSteer(message("pending")).effects[0];
    if (pending?.type !== "performSteer") throw new Error("expected steer claim");
    nonLocal.submitSteer(message("unsent"));
    nonLocal.settleSteer({ type: "accepted", claim: pending.claim, turnId: "turn-non-local" });
    nonLocal.prepareInterruptedTerminal({
      type: "turnCompleted",
      turnId: "turn-non-local",
      status: "interrupted",
      commitId: "terminal-non-local",
    });
    const rejectedFirst = startClaim(
      nonLocal.applyInterruptedDisposition("turn-non-local", "nonLocal"),
    );
    expect(rejectedFirst.message.input).toEqual([
      ...message("pending").input,
      ...message("unsent").input,
    ]);
    nonLocal.settleStart({ type: "accepted", claim: rejectedFirst, turnId: "turn-rejected" });
    expect(
      startClaim(
        nonLocal.observe({
          type: "turnCompleted",
          turnId: "turn-rejected",
          status: "completed",
          commitId: "terminal-rejected",
        }),
      ).message,
    ).toEqual(message("ordinary-front"));
  });

  it("reconciles terminal-before-settlement and classifies terminal replay and lateness", () => {
    const queue = createComposerInputQueue();
    const claim = startClaim(submit(queue, "a"));
    submit(queue, "b");
    const terminal = {
      type: "turnCompleted",
      turnId: "turn-a",
      status: "completed",
      commitId: "terminal-a",
    } as const;

    queue.observe({ ...terminal, turnId: "foreign", commitId: "foreign-terminal" });
    expect(queue.observe(terminal)).toEqual({
      result: { type: "applied", operation: "observationRecorded" },
      effects: [],
    });
    const accepted = queue.settleStart({ type: "accepted", claim, turnId: "turn-a" });
    expect(startClaim(accepted).message).toEqual(message("b"));

    const afterSettlement = createComposerInputQueue();
    const afterClaim = startClaim(submit(afterSettlement, "a"));
    submit(afterSettlement, "b");
    afterSettlement.settleStart({ type: "accepted", claim: afterClaim, turnId: "turn-a" });
    expect(startClaim(afterSettlement.observe(terminal)).message).toEqual(message("b"));

    expect(queue.observe(terminal)).toEqual({
      result: { type: "idempotentReplay", subject: "runtimeObservation" },
      effects: [],
    });
    expect(queue.observe({ ...terminal, commitId: "terminal-a-late" })).toEqual({
      result: { type: "stale", subject: "runtimeObservation" },
      effects: [],
    });
  });

  it("preserves single ownership through a fixed submit-to-recovery sequence", () => {
    const queue = createComposerInputQueue();
    const transitions: ComposerInputQueueTransition[] = [];
    const firstSubmit = submit(queue, "a");
    transitions.push(firstSubmit, submit(queue, "b"), submit(queue, "c"));
    const first = startClaim(firstSubmit);
    transitions.push(
      queue.observe({ type: "turnStarted", turnId: "turn-a", commitId: "start-a" }),
      queue.observe(committedMessage(first, "turn-a", "message-a")),
      queue.settleStart({ type: "accepted", claim: first, turnId: "turn-a" }),
    );
    expect(queue.view()).toEqual(
      expectedQueueView(queue, {
        ordinaryQueuedCount: 2,
        releaseState: {
          type: "blocked",
          blockers: [{ type: "ordinaryQueued", count: 2 }],
        },
      }),
    );
    const failed = queue.observe({
      type: "turnCompleted",
      turnId: "turn-a",
      status: "failed",
      commitId: "terminal-a",
    });
    transitions.push(failed);
    const second = startClaim(failed);
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
    transitions.push(
      queue.settleStart({ type: "accepted", claim: second, turnId: "turn-b" }),
      queue.observe({ type: "turnStarted", turnId: "turn-b", commitId: "start-b" }),
    );
    transitions.push(
      queue.prepareInterruptedTerminal({
        type: "turnCompleted",
        turnId: "turn-b",
        status: "interrupted",
        commitId: "terminal-b",
      }),
    );
    const interrupted = queue.applyInterruptedDisposition("turn-b", "local");
    transitions.push(interrupted);
    expect(interrupted).toEqual({
      result: { type: "recoveryProduced", reason: "userStopped", messageIds: ["c"] },
      effects: [
        {
          type: "recover",
          batch: { reason: "userStopped", rejected: null, messages: [message("c")] },
        },
      ],
    });
    for (const transition of transitions) {
      expect(transition.effects.filter(({ type }) => type === "performStart")).toHaveLength(
        transition.effects.some(({ type }) => type === "performStart") ? 1 : 0,
      );
    }
    const effectOwnerIds = transitions.flatMap(({ effects }) =>
      effects.flatMap((effect) =>
        effect.type === "performStart"
          ? [effect.claim.message.id]
          : effect.type === "performSteer"
            ? [effect.claim.intent.message.id]
            : effect.batch.reason === "steerDefinitelyNotAccepted"
              ? effect.batch.transfer.intents.map(({ message }) => message.id)
              : effect.batch.messages.map(({ id }) => id),
      ),
    );
    expect(effectOwnerIds).toEqual(["a", "b", "c"]);
    expect(new Set(effectOwnerIds).size).toBe(effectOwnerIds.length);
  });

  it("lets direct steers bypass the ordinary FIFO while ordinary entries keep their order", () => {
    const queue = createComposerInputQueue({ threadId: "thread-1", activeTurnId: "turn-1" });
    submit(queue, "ordinary-a");
    submit(queue, "ordinary-b");

    const first = queue.submitSteer(message("steer-a"));
    const firstEffect = first.effects[0];
    expect(firstEffect?.type).toBe("performSteer");
    if (firstEffect?.type !== "performSteer") throw new Error("expected direct steer claim");
    expect(firstEffect.claim.intent).toEqual({
      type: "intent",
      message: message("steer-a"),
      threadId: "thread-1",
      expectedTurnId: "turn-1",
      clientUserMessageId: firstEffect.claim.intent.clientUserMessageId,
      source: "direct",
    });
    expect(queue.submitSteer(message("steer-b"))).toEqual({
      result: { type: "applied", operation: "steerQueued" },
      effects: [],
    });

    const accepted = queue.settleSteer({
      type: "accepted",
      claim: firstEffect.claim,
      turnId: "turn-1",
    });
    const secondEffect = accepted.effects[0];
    expect(secondEffect?.type).toBe("performSteer");
    if (secondEffect?.type !== "performSteer") throw new Error("expected successor steer claim");
    expect(secondEffect.claim.intent.message).toEqual(message("steer-b"));
    expect(
      queue.observe({
        type: "userMessageCommitted",
        clientId: firstEffect.claim.intent.clientUserMessageId,
        turnId: "turn-1",
        commitId: "commit-steer-a",
      }),
    ).toEqual({ result: { type: "applied", operation: "steerCommitted" }, effects: [] });
    expect(queue.view()).toMatchObject({
      ordinaryQueuedCount: 2,
      guidingCount: 1,
    });
    expect(pendingPage(queue, "steer").items).toMatchObject([
      { preview: { type: "text", text: "message steer-b", truncated: false } },
    ]);

    queue.settleSteer({ type: "accepted", claim: secondEffect.claim, turnId: "turn-1" });
    queue.observe({
      type: "userMessageCommitted",
      clientId: secondEffect.claim.intent.clientUserMessageId,
      turnId: "turn-1",
      commitId: "commit-steer-b",
    });
    const completed = queue.observe({
      type: "turnCompleted",
      turnId: "turn-1",
      status: "completed",
      commitId: "terminal-1",
    });
    const ordinaryA = startClaim(completed);
    expect(ordinaryA.message).toEqual(message("ordinary-a"));
    const next = queue.settleStart({ type: "definitelyNotAccepted", claim: ordinaryA });
    const ordinaryB = startClaim({ ...next, effects: next.effects.slice(1) });
    expect(ordinaryB.message).toEqual(message("ordinary-b"));
  });

  it("promotes only the ordinary front into the steer tail", () => {
    const queue = createComposerInputQueue({ threadId: "thread-1", activeTurnId: "turn-1" });
    submit(queue, "ordinary-a");
    submit(queue, "ordinary-b");
    const direct = queue.submitSteer(message("direct"));
    const directEffect = direct.effects[0];
    if (directEffect?.type !== "performSteer") throw new Error("expected direct steer claim");

    expect(queue.promoteOrdinaryFrontToSteer()).toEqual({
      result: { type: "applied", operation: "steerQueued" },
      effects: [],
    });
    expect(queue.view()).toMatchObject({
      ordinaryQueuedCount: 1,
      guidingCount: 2,
    });
    expect(pendingPage(queue, "steer").items).toMatchObject([
      { preview: { text: "message direct" } },
      { preview: { text: "message ordinary-a" } },
    ]);
    const accepted = queue.settleSteer({
      type: "accepted",
      claim: directEffect.claim,
      turnId: "turn-1",
    });
    const promotedEffect = accepted.effects[0];
    expect(promotedEffect?.type).toBe("performSteer");
    if (promotedEffect?.type !== "performSteer") throw new Error("expected promoted steer claim");
    expect(promotedEffect.claim.intent).toEqual({
      type: "intent",
      message: message("ordinary-a"),
      threadId: "thread-1",
      expectedTurnId: "turn-1",
      clientUserMessageId: promotedEffect.claim.intent.clientUserMessageId,
      source: "ordinaryPromotion",
    });
    expect(queue.view().ordinaryQueuedCount).toBe(1);
  });

  it("moves a promoted ordinary front to the rejected tail when its target is closed", () => {
    const queue = createComposerInputQueue({ threadId: "thread-1", activeTurnId: "turn-1" });
    submit(queue, "ordinary-a");
    submit(queue, "ordinary-b");
    const direct = queue.submitSteer(message("direct"));
    const directEffect = direct.effects[0];
    if (directEffect?.type !== "performSteer") throw new Error("expected direct steer claim");
    expect(
      queue.settleSteer({ type: "activeTurnNotSteerable", claim: directEffect.claim }),
    ).toEqual({
      result: { type: "applied", operation: "steerRejected" },
      effects: [],
    });

    expect(queue.promoteOrdinaryFrontToSteer()).toEqual({
      result: { type: "applied", operation: "steerRejected" },
      effects: [],
    });
    expect(queue.view()).toMatchObject({
      ordinaryQueuedCount: 1,
      guidingCount: 0,
      rejectedSteers: [{ key: "direct" }, { key: "ordinary-a" }],
    });
  });

  it.each([
    ["responseTurnMismatch", "accepted"],
    ["deliveryUnknown", "deliveryUnknown"],
  ] as const)("keeps %s steer ownership and blocks successors", (phase, settlementType) => {
    const queue = createComposerInputQueue({ threadId: "thread-1", activeTurnId: "turn-1" });
    const first = queue.submitSteer(message("a"));
    const effect = first.effects[0];
    if (effect?.type !== "performSteer") throw new Error("expected steer claim");
    queue.submitSteer(message("b"));
    if (settlementType === "accepted") {
      queue.settleSteer({ type: "accepted", claim: effect.claim, turnId: "turn-other" });
    } else {
      queue.settleSteer({ type: "deliveryUnknown", claim: effect.claim });
    }

    expect(queue.view()).toMatchObject({
      guidingCount: 2,
      hasUnknownSteer: true,
      releaseState: {
        type: "blocked",
        blockers: [
          { type: "steerQueued", count: 1 },
          { type: "pendingSteers", count: 1, hasUnknown: true },
        ],
      },
    });
    expect(["responseTurnMismatch", "deliveryUnknown"]).toContain(phase);
    const items = pendingPage(queue, "steer").items;
    expect(items).toMatchObject([
      { preview: { text: "message a" } },
      { preview: { text: "message b" } },
    ]);
    const pendingKey = items[0]?.key;
    if (pendingKey == null) throw new Error("expected blocked pending steer key");
    expect(queue.deletePendingInput({ key: pendingKey, revision: queue.detailRevision() })).toEqual(
      { type: "notManageable", revision: queue.detailRevision() },
    );
  });

  it("merges terminal rejected steers before ordinary and restores them after definite start failure", () => {
    const queue = createComposerInputQueue({ threadId: "thread-1", activeTurnId: "turn-1" });
    submit(queue, "ordinary");
    const first = queue.submitSteer(message("steer-a"));
    const firstEffect = first.effects[0];
    if (firstEffect?.type !== "performSteer") throw new Error("expected steer claim");
    queue.submitSteer(message("steer-b"));
    expect(queue.settleSteer({ type: "activeTurnNotSteerable", claim: firstEffect.claim })).toEqual(
      {
        result: { type: "applied", operation: "steerRejected" },
        effects: [],
      },
    );
    expect(queue.view().rejectedSteers.map(({ key }) => key)).toEqual(["steer-a", "steer-b"]);

    const terminal = queue.observe({
      type: "turnCompleted",
      turnId: "turn-1",
      status: "completed",
      commitId: "terminal-1",
    });
    const merge = startClaim(terminal);
    expect(merge.message.type).toBe("rejectedSteerMerge");
    if (merge.message.type !== "rejectedSteerMerge") {
      throw new Error("expected rejected steer merge");
    }
    expect("draft" in merge.message).toBe(false);
    expect(merge.message.input).toEqual([...message("steer-a").input, ...message("steer-b").input]);
    expect(queue.view()).toMatchObject({ ordinaryQueuedCount: 1, rejectedSteers: [] });

    expect(queue.settleStart({ type: "definitelyNotAccepted", claim: merge })).toEqual({
      result: { type: "applied", operation: "rejectedSteerStartRestored" },
      effects: [],
    });
    expect(queue.view()).toMatchObject({
      ordinaryQueuedCount: 1,
      rejectedSteers: [{ key: "steer-a" }, { key: "steer-b" }],
    });
  });

  it("releases rejected merge identities only after the accepted start is observed", () => {
    const queue = createComposerInputQueue({ threadId: "thread-1", activeTurnId: "turn-1" });
    const first = queue.submitSteer(message("steer-a"));
    const firstEffect = first.effects[0];
    if (firstEffect?.type !== "performSteer") throw new Error("expected steer claim");
    queue.submitSteer(message("steer-b"));
    queue.settleSteer({ type: "activeTurnNotSteerable", claim: firstEffect.claim });

    const terminal = queue.observe({
      type: "turnCompleted",
      turnId: "turn-1",
      status: "completed",
      commitId: "terminal-1",
    });
    const merge = startClaim(terminal);
    expect(merge.message.type).toBe("rejectedSteerMerge");

    expect(queue.settleStart({ type: "accepted", claim: merge, turnId: "turn-2" })).toEqual({
      result: { type: "applied", operation: "startAccepted" },
      effects: [],
    });
    expect(queue.view().rejectedSteers).toEqual([]);
    expect(queue.submitSteer(message("steer-a"))).toEqual({
      result: { type: "duplicateIdentity", messageId: "steer-a" },
      effects: [],
    });
    expect(queue.submitSteer(message(merge.message.id))).toEqual({
      result: { type: "duplicateIdentity", messageId: merge.message.id },
      effects: [],
    });

    expect(queue.observe({ type: "turnStarted", turnId: "turn-2", commitId: "start-2" })).toEqual({
      result: { type: "applied", operation: "turnStarted" },
      effects: [],
    });
    expect(queue.view().rejectedSteers).toEqual([]);

    const resubmitted = queue.submitSteer(message("steer-a"));
    expect(resubmitted.result.type).not.toBe("duplicateIdentity");
    const resubmittedEffect = resubmitted.effects[0];
    if (resubmittedEffect?.type !== "performSteer") {
      throw new Error("expected resubmitted steer claim");
    }
    expect(resubmittedEffect.claim.intent.message).toEqual(message("steer-a"));
    expect(resubmittedEffect.claim.intent.expectedTurnId).toBe("turn-2");
    expect(queue.submitSteer(message(merge.message.id))).toEqual({
      result: { type: "applied", operation: "steerQueued" },
      effects: [],
    });
  });

  it("keeps generic steer rejection in steer recovery and exposes only bounded previews", () => {
    const queue = createComposerInputQueue({ threadId: "thread-1", activeTurnId: "turn-1" });
    const longText = "x".repeat(200);
    const longCapture = composerDraftCapture(longText);
    const first = queue.submitSteer({
      type: "recoverable",
      id: "long",
      draft: longCapture.draft,
      input: longCapture.input,
    });
    const effect = first.effects[0];
    if (effect?.type !== "performSteer") throw new Error("expected steer claim");
    const view = queue.view();
    expect(pendingPage(queue, "steer").items[0]?.preview).toEqual({
      type: "text",
      text: `${"x".repeat(157)}...`,
      truncated: true,
    });
    expect(JSON.stringify(view)).not.toContain("/example/skills/");
    expect(JSON.stringify(view)).not.toContain("clientUserMessageId");
    const rejected = queue.settleSteer({ type: "definitelyNotAccepted", claim: effect.claim });
    const recovery = rejected.effects[0];
    expect(recovery?.type).toBe("recover");
    if (recovery?.type !== "recover" || recovery.batch.reason !== "steerDefinitelyNotAccepted") {
      throw new Error("expected steer recovery transfer");
    }
    expect(rejected).toEqual({
      result: {
        type: "recoveryProduced",
        reason: "steerDefinitelyNotAccepted",
        messageIds: ["long"],
      },
      effects: [{ type: "recover", batch: recovery.batch }],
    });
    const restored = queue.restoreSteerRecovery(recovery.batch.transfer).effects[0];
    if (restored?.type !== "performSteer") throw new Error("expected restored steer claim");
    expect(restored.claim.intent).toEqual(recovery.batch.transfer.intents[0]);
  });

  it("pages ordinary inputs with an owner-enforced bound and opaque stable display keys", () => {
    const queue = createComposerInputQueue({ threadId: "thread-1", activeTurnId: "turn-1" });
    for (let index = 0; index < COMPOSER_PENDING_INPUT_MAX_PAGE_SIZE + 3; index += 1) {
      submit(queue, `ordinary-${String(index)}`);
    }
    const revision = queue.detailRevision();
    const first = queue.readPendingInputPage({
      lane: "ordinary",
      revision,
      cursor: null,
      limit: COMPOSER_PENDING_INPUT_MAX_PAGE_SIZE + 100,
    });
    expect(first.type).toBe("page");
    if (first.type !== "page") throw new Error("expected ordinary detail page");
    expect(first.items).toHaveLength(COMPOSER_PENDING_INPUT_MAX_PAGE_SIZE);
    expect(first.items.map(({ preview }) => preview)).toEqual(
      Array.from({ length: COMPOSER_PENDING_INPUT_MAX_PAGE_SIZE }, (_, index) => ({
        type: "text",
        text: `message ordinary-${String(index)}`,
        truncated: false,
      })),
    );
    expect(first.items.every(({ key }) => !key.includes("ordinary-"))).toBe(true);
    expect(JSON.stringify(first)).not.toContain("/example/skills/");
    expect(JSON.stringify(first)).not.toContain('"input"');
    expect(first.nextCursor).not.toBeNull();

    const second = queue.readPendingInputPage({
      lane: "ordinary",
      revision,
      cursor: first.nextCursor,
      limit: COMPOSER_PENDING_INPUT_MAX_PAGE_SIZE + 100,
    });
    expect(second).toMatchObject({
      type: "page",
      items: [
        { preview: { type: "text", text: "message ordinary-20", truncated: false } },
        { preview: { type: "text", text: "message ordinary-21", truncated: false } },
        { preview: { type: "text", text: "message ordinary-22", truncated: false } },
      ],
      nextCursor: null,
    });
  });

  it("reads steer inputs pending-before-queued and returns current full text by display key", () => {
    const queue = createComposerInputQueue({ threadId: "thread-1", activeTurnId: "turn-1" });
    const longText = "👩‍💻".repeat(161);
    const longCapture = composerDraftCapture(`  ${longText}  `);
    queue.submitSteer({
      type: "recoverable",
      id: "a",
      draft: longCapture.draft,
      input: longCapture.input,
    });
    queue.submitSteer(message("b"));
    const revision = queue.detailRevision();
    const page = queue.readPendingInputPage({ lane: "steer", revision, cursor: null, limit: 10 });
    expect(page.type).toBe("page");
    if (page.type !== "page") throw new Error("expected steer detail page");
    expect(page.items.map(({ preview }) => preview)).toEqual([
      { type: "text", text: `${"👩‍💻".repeat(157)}...`, truncated: true },
      { type: "text", text: "message b", truncated: false },
    ]);
    const firstKey = page.items[0]?.key;
    if (firstKey == null) throw new Error("expected first steer display key");
    expect(queue.readPendingInputDetail({ key: firstKey, revision })).toEqual({
      type: "detail",
      key: firstKey,
      revision,
      text: longText,
    });
    expect(JSON.stringify(queue.readPendingInputDetail({ key: firstKey, revision }))).not.toContain(
      "/private/skills/",
    );
    const shortTextKey = page.items[1]?.key;
    if (shortTextKey == null) throw new Error("expected short-text display key");
    expect(queue.readPendingInputDetail({ key: shortTextKey, revision })).toEqual({
      type: "missing",
      revision,
    });

    queue.observe({
      type: "turnCompleted",
      turnId: "turn-1",
      status: "completed",
      commitId: "terminal",
    });
    expect(
      queue.readPendingInputDetail({ key: firstKey, revision: queue.detailRevision() }),
    ).toEqual({ type: "missing", revision: queue.detailRevision() });
  });

  it("invalidates cursors across promotion, steer issue, commit, and terminal transitions", () => {
    const queue = createComposerInputQueue({ threadId: "thread-1", activeTurnId: "turn-1" });
    submit(queue, "a");
    submit(queue, "b");
    submit(queue, "d");
    const beforePromotionRevision = queue.detailRevision();
    const beforePromotion = pendingPage(queue, "ordinary", 1);
    const promotedKey = beforePromotion.items[0]?.key;
    if (promotedKey == null || beforePromotion.nextCursor == null) {
      throw new Error("expected ordinary promotion cursor");
    }

    const promoted = queue.promoteOrdinaryFrontToSteer();
    const promotedEffect = promoted.effects[0];
    if (promotedEffect?.type !== "performSteer") throw new Error("expected promoted steer claim");
    expect(
      queue.readPendingInputPage({
        lane: "ordinary",
        revision: beforePromotionRevision,
        cursor: beforePromotion.nextCursor,
        limit: 1,
      }),
    ).toEqual({ type: "stale", revision: queue.detailRevision() });
    const afterPromotionOrdinary = pendingPage(queue, "ordinary");
    const afterPromotionSteer = pendingPage(queue, "steer");
    expect(afterPromotionOrdinary.items.map(({ preview }) => preview)).toMatchObject([
      { text: "message b" },
      { text: "message d" },
    ]);
    expect(afterPromotionSteer.items).toMatchObject([{ key: promotedKey }]);
    const ordinaryKeys = afterPromotionOrdinary.items.map(({ key }) => key);

    queue.submitSteer(message("c"));
    const beforeIssueRevision = queue.detailRevision();
    const beforeIssue = pendingPage(queue, "steer", 1);
    const beforeIssueAll = pendingPage(queue, "steer");
    const queuedKey = beforeIssueAll.items[1]?.key;
    if (queuedKey == null || beforeIssue.nextCursor == null) {
      throw new Error("expected queued steer cursor");
    }
    queue.settleSteer({
      type: "accepted",
      claim: promotedEffect.claim,
      turnId: "turn-1",
    });
    expect(
      queue.readPendingInputPage({
        lane: "steer",
        revision: beforeIssueRevision,
        cursor: beforeIssue.nextCursor,
        limit: 1,
      }),
    ).toEqual({ type: "stale", revision: queue.detailRevision() });
    expect(pendingPage(queue, "steer").items).toMatchObject([
      { key: promotedKey },
      { key: queuedKey },
    ]);

    const beforeCommitRevision = queue.detailRevision();
    const beforeCommit = pendingPage(queue, "steer", 1);
    if (beforeCommit.nextCursor == null) throw new Error("expected pre-commit steer cursor");
    queue.observe({
      type: "userMessageCommitted",
      clientId: promotedEffect.claim.intent.clientUserMessageId,
      turnId: "turn-1",
      commitId: "commit-a",
    });
    expect(
      queue.readPendingInputPage({
        lane: "steer",
        revision: beforeCommitRevision,
        cursor: beforeCommit.nextCursor,
        limit: 1,
      }),
    ).toEqual({ type: "stale", revision: queue.detailRevision() });
    expect(pendingPage(queue, "steer").items).toMatchObject([{ key: queuedKey }]);

    const beforeTerminalRevision = queue.detailRevision();
    const beforeTerminal = pendingPage(queue, "ordinary", 1);
    if (beforeTerminal.nextCursor == null) throw new Error("expected pre-terminal ordinary cursor");
    queue.observe({
      type: "turnCompleted",
      turnId: "turn-1",
      status: "completed",
      commitId: "terminal",
    });
    expect(
      queue.readPendingInputPage({
        lane: "ordinary",
        revision: beforeTerminalRevision,
        cursor: beforeTerminal.nextCursor,
        limit: 1,
      }),
    ).toEqual({ type: "stale", revision: queue.detailRevision() });
    expect(pendingPage(queue, "ordinary").items.map(({ key }) => key)).toEqual(ordinaryKeys);
    expect(pendingPage(queue, "steer").items).toEqual([]);
  });

  it("invalidates a cursor when steer recovery restores the original FIFO", () => {
    const queue = createComposerInputQueue({ threadId: "thread-1", activeTurnId: "turn-1" });
    const first = queue.submitSteer(message("r"));
    const firstEffect = first.effects[0];
    if (firstEffect?.type !== "performSteer") throw new Error("expected first steer claim");
    queue.submitSteer(message("s"));
    queue.submitSteer(message("t"));
    const initial = pendingPage(queue, "steer");
    const [initialFirstKey, stableSecondKey, stableThirdKey] = initial.items.map(({ key }) => key);
    const rejected = queue.settleSteer({
      type: "definitelyNotAccepted",
      claim: firstEffect.claim,
    });
    const recovery = rejected.effects[0];
    if (recovery?.type !== "recover" || recovery.batch.reason !== "steerDefinitelyNotAccepted") {
      throw new Error("expected steer recovery transfer");
    }
    const beforeRestoreRevision = queue.detailRevision();
    const beforeRestore = pendingPage(queue, "steer", 1);
    if (beforeRestore.nextCursor == null) throw new Error("expected pre-restore steer cursor");

    queue.restoreSteerRecovery(recovery.batch.transfer);
    expect(
      queue.readPendingInputPage({
        lane: "steer",
        revision: beforeRestoreRevision,
        cursor: beforeRestore.nextCursor,
        limit: 1,
      }),
    ).toEqual({ type: "stale", revision: queue.detailRevision() });
    const restoredKeys = pendingPage(queue, "steer").items.map(({ key }) => key);
    expect(restoredKeys).toHaveLength(3);
    expect(restoredKeys[0]).not.toBe(initialFirstKey);
    expect(restoredKeys.slice(1)).toEqual([stableSecondKey, stableThirdKey]);
  });

  it("invalidates revised and foreign-owner cursors", () => {
    const firstOwner = createComposerInputQueue({ threadId: "thread-1", activeTurnId: "turn-1" });
    const secondOwner = createComposerInputQueue({ threadId: "thread-2", activeTurnId: "turn-2" });
    for (const queue of [firstOwner, secondOwner]) {
      submit(queue, "a");
      submit(queue, "b");
    }
    const revision = firstOwner.detailRevision();
    const firstPage = firstOwner.readPendingInputPage({
      lane: "ordinary",
      revision,
      cursor: null,
      limit: 1,
    });
    expect(firstPage.type).toBe("page");
    if (firstPage.type !== "page" || firstPage.nextCursor == null) {
      throw new Error("expected an ordinary cursor");
    }

    expect(
      secondOwner.readPendingInputPage({
        lane: "ordinary",
        revision: secondOwner.detailRevision(),
        cursor: firstPage.nextCursor,
        limit: 1,
      }),
    ).toEqual({ type: "stale", revision: secondOwner.detailRevision() });

    submit(firstOwner, "c");
    expect(
      firstOwner.readPendingInputPage({
        lane: "ordinary",
        revision,
        cursor: firstPage.nextCursor,
        limit: 1,
      }),
    ).toEqual({ type: "stale", revision: firstOwner.detailRevision() });
  });

  it("projects owner-derived management state for ordinary, queued steer, and pending steer", () => {
    const queue = createComposerInputQueue({ threadId: "thread-1", activeTurnId: "turn-1" });
    submit(queue, "ordinary");
    const issued = queue.submitSteer(message("pending-steer"));
    const issueEffect = issued.effects[0];
    if (issueEffect?.type !== "performSteer") throw new Error("expected pending steer claim");
    queue.submitSteer(message("queued-steer"));

    expect(pendingPage(queue, "ordinary").items).toMatchObject([
      { lane: "ordinary", management: { type: "manageable" } },
    ]);
    expect(pendingPage(queue, "steer").items).toMatchObject([
      {
        lane: "steer",
        management: { type: "readOnly", reason: "deliveryInProgress" },
      },
      { lane: "steer", management: { type: "manageable" } },
    ]);
    const pendingSteerKey = pendingPage(queue, "steer").items[0]?.key;
    if (pendingSteerKey == null) throw new Error("expected pending steer key");
    let restoreCalled = false;
    expect(
      queue.beginPendingInputEdit(
        { key: pendingSteerKey, revision: queue.detailRevision() },
        () => {
          restoreCalled = true;
          return { type: "restored" };
        },
      ),
    ).toEqual({ type: "notManageable", revision: queue.detailRevision() });
    expect(
      queue.deletePendingInput({ key: pendingSteerKey, revision: queue.detailRevision() }),
    ).toEqual({ type: "notManageable", revision: queue.detailRevision() });
    expect(restoreCalled).toBe(false);
  });

  it("begins an ordinary edit only after a current manageable slot restores successfully", () => {
    const queue = createComposerInputQueue({ threadId: "thread-1", activeTurnId: "turn-1" });
    submit(queue, "a");
    submit(queue, "b");
    const before = pendingPage(queue, "ordinary");
    const firstKey = before.items[0]?.key;
    const secondKey = before.items[1]?.key;
    if (firstKey == null || secondKey == null) throw new Error("expected ordinary keys");
    const beforeView = queue.view();

    let restoreCalls = 0;
    expect(
      queue.beginPendingInputEdit({ key: firstKey, revision: queue.detailRevision() }, () => {
        restoreCalls += 1;
        return { type: "invalidDraft" };
      }),
    ).toEqual({ type: "invalidDraft", revision: queue.detailRevision() });
    expect(restoreCalls).toBe(1);
    expect(queue.view()).toEqual(beforeView);
    expect(pendingPage(queue, "ordinary")).toEqual(before);

    const staleRevision = queue.detailRevision();
    submit(queue, "c");
    expect(
      queue.beginPendingInputEdit({ key: firstKey, revision: staleRevision }, () => {
        restoreCalls += 1;
        return { type: "restored" };
      }),
    ).toEqual({ type: "stale", revision: queue.detailRevision() });
    expect(restoreCalls).toBe(1);

    const foreignQueue = createComposerInputQueue({
      threadId: "thread-2",
      activeTurnId: "turn-2",
    });
    submit(foreignQueue, "foreign");
    const foreignKey = pendingPage(foreignQueue, "ordinary").items[0]?.key;
    if (foreignKey == null) throw new Error("expected foreign key");
    expect(
      queue.beginPendingInputEdit({ key: foreignKey, revision: queue.detailRevision() }, () => {
        restoreCalls += 1;
        return { type: "restored" };
      }),
    ).toEqual({ type: "notManageable", revision: queue.detailRevision() });
    expect(restoreCalls).toBe(1);

    const begun = queue.beginPendingInputEdit(
      { key: secondKey, revision: queue.detailRevision() },
      () => {
        restoreCalls += 1;
        return { type: "restored" };
      },
    );
    expect(begun.type).toBe("begun");
    if (begun.type !== "begun") throw new Error("expected edit reservation");
    expect(restoreCalls).toBe(2);
    expect(pendingPage(queue, "ordinary").items).toMatchObject([
      { key: firstKey, management: { type: "manageable" } },
      { key: secondKey, management: { type: "editing" } },
      { management: { type: "manageable" } },
    ]);
    expect(
      queue.beginPendingInputEdit(
        {
          key: secondKey,
          revision: queue.detailRevision(),
        },
        () => ({ type: "restored" }),
      ),
    ).toEqual({
      type: "conflict",
      reason: "editInProgress",
      revision: queue.detailRevision(),
    });
  });

  it("rolls back an invalid restore after rejecting reentrant owner mutations", () => {
    const queue = createComposerInputQueue({ threadId: "thread-1", activeTurnId: "turn-1" });
    submit(queue, "a");
    submit(queue, "b");
    const beforeRevision = queue.detailRevision();
    const beforeView = queue.view();
    const beforePage = pendingPage(queue, "ordinary");
    const firstKey = beforePage.items[0]?.key;
    if (firstKey == null) throw new Error("expected reentrant edit key");

    expect(
      queue.beginPendingInputEdit({ key: firstKey, revision: beforeRevision }, () => {
        expect(queue.deletePendingInput({ key: firstKey, revision: beforeRevision })).toEqual({
          type: "conflict",
          reason: "editInProgress",
          revision: beforeRevision,
        });
        expect(submit(queue, "reentrant")).toEqual({
          result: { type: "ownershipMismatch", subject: "pendingInputEdit" },
          effects: [],
        });
        expect(pendingPage(queue, "ordinary")).toEqual({
          ...beforePage,
          items: beforePage.items.map((item) => ({ ...item, movement: null })),
        });
        return { type: "invalidDraft" };
      }),
    ).toEqual({ type: "invalidDraft", revision: beforeRevision });
    expect(queue.detailRevision()).toBe(beforeRevision);
    expect(queue.view()).toEqual(beforeView);
    expect(pendingPage(queue, "ordinary")).toEqual(beforePage);
    const begun = queue.beginPendingInputEdit({ key: firstKey, revision: beforeRevision }, () => {
      expect(queue.deletePendingInput({ key: firstKey, revision: beforeRevision })).toEqual({
        type: "conflict",
        reason: "editInProgress",
        revision: beforeRevision,
      });
      return { type: "restored" };
    });
    if (begun.type !== "begun") throw new Error("expected reentrant-safe reservation");
    expect(pendingPage(queue, "ordinary").items).toMatchObject([
      { key: firstKey, management: { type: "editing" }, preview: { text: "message a" } },
      { key: beforePage.items[1]?.key, preview: { text: "message b" } },
    ]);
    expect(begun.reservation.cancel().type).toBe("cancelled");
    expect(submit(queue, "reentrant").result).toEqual({
      type: "queued",
      messageId: "reentrant",
    });
  });

  it.each([
    ["head", 0, ["editing", "manageable", "manageable"]],
    ["middle", 1, ["manageable", "editing", "manageable"]],
    ["tail", 2, ["manageable", "manageable", "editing"]],
  ])(
    "keeps a %s reservation in bounded pages and release projection",
    (_position, index, expectedManagement) => {
      const queue = createComposerInputQueue({ threadId: "thread-1", activeTurnId: "turn-1" });
      submit(queue, "a");
      submit(queue, "b");
      submit(queue, "c");
      const initial = pendingPage(queue, "ordinary");
      const keys = initial.items.map(({ key }) => key);
      const editKey = keys[index];
      if (editKey == null) throw new Error("expected parameterized edit key");
      const begun = queue.beginPendingInputEdit(
        { key: editKey, revision: queue.detailRevision() },
        () => ({ type: "restored" }),
      );
      if (begun.type !== "begun") throw new Error("expected parameterized reservation");

      const pagedKeys = [];
      const pagedManagement = [];
      let cursor: ComposerPendingInputCursor | null = null;
      do {
        const page = queue.readPendingInputPage({
          lane: "ordinary",
          revision: queue.detailRevision(),
          cursor,
          limit: 1,
        });
        if (page.type !== "page") throw new Error("expected reservation page");
        const item = page.items[0];
        if (item == null) throw new Error("expected reservation page item");
        pagedKeys.push(item.key);
        pagedManagement.push(item.management.type);
        cursor = page.nextCursor;
      } while (cursor != null);
      expect(pagedKeys).toEqual(keys);
      expect(pagedManagement).toEqual(expectedManagement);
      expect(queue.view().releaseState).toEqual({
        type: "blocked",
        blockers: [{ type: "ordinaryQueued", count: 3 }],
      });
      expect(begun.reservation.cancel().type).toBe("cancelled");
    },
  );

  it("keeps an ordinary reservation in place while earlier messages drain and saves by capability", () => {
    const queue = createComposerInputQueue({ threadId: "thread-1", activeTurnId: null });
    const firstClaim = startClaim(submit(queue, "a"));
    submit(queue, "b");
    submit(queue, "c");
    submit(queue, "d");
    const before = pendingPage(queue, "ordinary", 2);
    const allBefore = pendingPage(queue, "ordinary");
    const originalKeys = allBefore.items.map(({ key }) => key);
    const editKey = originalKeys[1];
    if (before.nextCursor == null || editKey == null) throw new Error("expected middle edit key");
    const begun = queue.beginPendingInputEdit(
      { key: editKey, revision: queue.detailRevision() },
      () => ({ type: "restored" }),
    );
    if (begun.type !== "begun") throw new Error("expected edit reservation");

    expect(queue.view().ordinaryQueuedCount).toBe(3);
    expect(queue.view().releaseState).toEqual({
      type: "blocked",
      blockers: [
        { type: "ordinaryQueued", count: 3 },
        { type: "pendingStart", phase: "issuing" },
      ],
    });
    const during = pendingPage(queue, "ordinary", 2);
    expect(during.items.map(({ key }) => key)).toEqual(originalKeys.slice(0, 2));
    expect(during.items[1]?.management).toEqual({ type: "editing" });
    expect(during.nextCursor).not.toBeNull();

    queue.settleStart({ type: "accepted", claim: firstClaim, turnId: "turn-a" });
    const secondClaim = startClaim(
      queue.observe({
        type: "turnCompleted",
        turnId: "turn-a",
        status: "completed",
        commitId: "terminal-a",
      }),
    );
    expect(secondClaim.message).toEqual(message("b"));
    queue.settleStart({ type: "accepted", claim: secondClaim, turnId: "turn-b" });
    expect(
      queue.observe({
        type: "turnCompleted",
        turnId: "turn-b",
        status: "completed",
        commitId: "terminal-b",
      }),
    ).toEqual({ result: { type: "applied", operation: "turnCompleted" }, effects: [] });
    expect(pendingPage(queue, "ordinary").items.map(({ key }) => key)).toEqual(
      originalKeys.slice(1),
    );

    const editedCapture = composerDraftCapture("edited c");
    const saved = begun.reservation.save(editedCapture);
    expect(saved).toEqual({
      type: "saved",
      revision: queue.detailRevision(),
      drainIntent: { lane: "ordinary" },
    });
    expect(pendingPage(queue, "ordinary").items).toMatchObject([
      { key: editKey, management: { type: "manageable" }, preview: { text: "edited c" } },
      { key: originalKeys[2], preview: { text: "message d" } },
    ]);
    expect(begun.reservation.cancel()).toEqual({
      type: "unavailable",
      reason: "sessionSettled",
      revision: queue.detailRevision(),
    });
    if (saved.type !== "saved") throw new Error("expected saved drain intent");
    const resumed = startClaim(queue.drainPendingInput(saved.drainIntent));
    expect(resumed.message).toEqual({
      type: "recoverable",
      id: "c",
      draft: editedCapture.draft,
      input: editedCapture.input,
    });
    expect(pendingPage(queue, "ordinary").items.map(({ key }) => key)).toEqual([originalKeys[2]]);
  });

  it("rejects empty saves, restores cancel content, and never forms a claim while settling", () => {
    const queue = createComposerInputQueue({ threadId: "thread-1", activeTurnId: "turn-1" });
    submit(queue, "a");
    submit(queue, "b");
    const page = pendingPage(queue, "ordinary");
    const firstKey = page.items[0]?.key;
    if (firstKey == null) throw new Error("expected ordinary key");
    const begun = queue.beginPendingInputEdit(
      { key: firstKey, revision: queue.detailRevision() },
      () => ({ type: "restored" }),
    );
    if (begun.type !== "begun") throw new Error("expected edit reservation");
    const editingRevision = queue.detailRevision();

    expect(begun.reservation.save(composerDraftCapture(" \n\t "))).toEqual({
      type: "invalidInput",
      reason: "emptyInput",
      revision: editingRevision,
    });
    expect(queue.detailRevision()).toBe(editingRevision);
    expect(pendingPage(queue, "ordinary").items[0]).toMatchObject({
      key: firstKey,
      management: { type: "editing" },
      preview: { text: "message a" },
    });
    expect(queue.promoteOrdinaryFrontToSteer()).toEqual({
      result: { type: "noOp", reason: "ordinaryQueueBlockedByEdit" },
      effects: [],
    });
    const cancelled = begun.reservation.cancel();
    expect(cancelled).toEqual({
      type: "cancelled",
      revision: queue.detailRevision(),
      drainIntent: { lane: "ordinary" },
    });
    expect(pendingPage(queue, "ordinary").items).toMatchObject([
      { key: firstKey, management: { type: "manageable" }, preview: { text: "message a" } },
      { preview: { text: "message b" } },
    ]);
    expect(begun.reservation.save(composerDraftCapture("late save"))).toEqual({
      type: "unavailable",
      reason: "sessionSettled",
      revision: queue.detailRevision(),
    });
    expect(begun.reservation.save(composerDraftCapture(" \n\t "))).toEqual({
      type: "unavailable",
      reason: "sessionSettled",
      revision: queue.detailRevision(),
    });
    expect(
      startClaim(
        queue.observe({
          type: "turnCompleted",
          turnId: "turn-1",
          status: "completed",
          commitId: "terminal-1",
        }),
      ).message,
    ).toEqual(message("a"));
  });

  it("deletes exact ordinary slots by revision without creating a start claim", () => {
    const queue = createComposerInputQueue({ threadId: "thread-1", activeTurnId: "turn-1" });
    submit(queue, "a");
    submit(queue, "b");
    submit(queue, "c");
    const initial = pendingPage(queue, "ordinary");
    const [firstKey, middleKey, lastKey] = initial.items.map(({ key }) => key);
    if (firstKey == null || middleKey == null || lastKey == null) {
      throw new Error("expected delete keys");
    }
    const staleRevision = queue.detailRevision();
    const deletedMiddle = queue.deletePendingInput({ key: middleKey, revision: staleRevision });
    expect(deletedMiddle).toEqual({
      type: "deleted",
      revision: queue.detailRevision(),
      drainIntent: { lane: "ordinary" },
    });
    expect(queue.deletePendingInput({ key: lastKey, revision: staleRevision })).toEqual({
      type: "stale",
      revision: queue.detailRevision(),
    });
    expect(pendingPage(queue, "ordinary").items.map(({ key }) => key)).toEqual([firstKey, lastKey]);

    expect(queue.deletePendingInput({ key: firstKey, revision: queue.detailRevision() })).toEqual({
      type: "deleted",
      revision: queue.detailRevision(),
      drainIntent: { lane: "ordinary" },
    });
    expect(queue.deletePendingInput({ key: lastKey, revision: queue.detailRevision() })).toEqual({
      type: "deleted",
      revision: queue.detailRevision(),
      drainIntent: { lane: "ordinary" },
    });
    expect(queue.view().ordinaryQueuedCount).toBe(0);
    expect(submit(queue, "a").result).toEqual({ type: "queued", messageId: "a" });
    expect(pendingPage(queue, "ordinary").items).toHaveLength(1);
  });

  it("keeps recovery ordering behind an ordinary reservation until its drain intent is consumed", () => {
    const queue = createComposerInputQueue({ threadId: "thread-1", activeTurnId: null });
    const failedClaim = startClaim(submit(queue, "failed"));
    submit(queue, "edited");
    submit(queue, "successor");
    const editKey = pendingPage(queue, "ordinary").items[0]?.key;
    if (editKey == null) throw new Error("expected recovery edit key");
    const begun = queue.beginPendingInputEdit(
      { key: editKey, revision: queue.detailRevision() },
      () => ({ type: "restored" }),
    );
    if (begun.type !== "begun") throw new Error("expected edit reservation");

    const failed = queue.settleStart({ type: "definitelyNotAccepted", claim: failedClaim });
    expect(failed.effects).toHaveLength(1);
    expect(failed.effects[0]?.type).toBe("recover");
    const saved = begun.reservation.save(composerDraftCapture("saved while recovering"));
    if (saved.type !== "saved") throw new Error("expected saved reservation");
    expect(queue.view().releaseState).toEqual({
      type: "blocked",
      blockers: [{ type: "ordinaryQueued", count: 2 }],
    });

    expect(queue.submit(message("failed"))).toEqual({
      result: { type: "queued", messageId: "failed" },
      effects: [],
    });
    const editedClaim = startClaim(queue.drainPendingInput(saved.drainIntent));
    expect(editedClaim.message.id).toBe("edited");
    expect(pendingPage(queue, "ordinary").items.map(({ preview }) => preview)).toMatchObject([
      { text: "message successor" },
      { text: "message failed" },
    ]);
    const successorClaim = startClaim(acceptAndCompleteStart(queue, editedClaim, "turn-edited"));
    const recoveredFailedClaim = startClaim(
      acceptAndCompleteStart(queue, successorClaim, "turn-successor"),
    );
    expect([
      editedClaim.message.id,
      successorClaim.message.id,
      recoveredFailedClaim.message.id,
    ]).toEqual(["edited", "successor", "failed"]);
  });

  it("keeps a reservation blocked behind delivery unknown and rejects local interruption", () => {
    const deliveryUnknownQueue = createComposerInputQueue({
      threadId: "thread-1",
      activeTurnId: null,
    });
    const unknownClaim = startClaim(submit(deliveryUnknownQueue, "pending"));
    submit(deliveryUnknownQueue, "edited");
    const unknownEditKey = pendingPage(deliveryUnknownQueue, "ordinary").items[0]?.key;
    if (unknownEditKey == null) throw new Error("expected delivery-unknown edit key");
    const unknownEdit = deliveryUnknownQueue.beginPendingInputEdit(
      { key: unknownEditKey, revision: deliveryUnknownQueue.detailRevision() },
      () => ({ type: "restored" }),
    );
    if (unknownEdit.type !== "begun") throw new Error("expected delivery-unknown reservation");
    deliveryUnknownQueue.settleStart({ type: "deliveryUnknown", claim: unknownClaim });
    const cancelled = unknownEdit.reservation.cancel();
    if (cancelled.type !== "cancelled") throw new Error("expected delivery-unknown cancel");
    expect(deliveryUnknownQueue.drainPendingInput(cancelled.drainIntent)).toEqual({
      result: { type: "applied", operation: "pendingInputManagementDrained" },
      effects: [],
    });

    const interruptedQueue = createComposerInputQueue({
      threadId: "thread-2",
      activeTurnId: "turn-2",
    });
    submit(interruptedQueue, "edited");
    const interruptedKey = pendingPage(interruptedQueue, "ordinary").items[0]?.key;
    if (interruptedKey == null) throw new Error("expected interrupted edit key");
    const interruptedEdit = interruptedQueue.beginPendingInputEdit(
      { key: interruptedKey, revision: interruptedQueue.detailRevision() },
      () => ({ type: "restored" }),
    );
    if (interruptedEdit.type !== "begun") throw new Error("expected interrupted reservation");
    interruptedQueue.prepareInterruptedTerminal({
      type: "turnCompleted",
      turnId: "turn-2",
      status: "interrupted",
      commitId: "terminal-2",
    });
    expect(interruptedQueue.applyInterruptedDisposition("turn-2", "local")).toEqual({
      result: { type: "ownershipMismatch", subject: "pendingInputEdit" },
      effects: [],
    });
    expect(pendingPage(interruptedQueue, "ordinary").items[0]).toMatchObject({
      key: interruptedKey,
      management: { type: "editing" },
    });
  });

  it("preserves an existing deferred successor effect ahead of management drain", () => {
    const queue = createComposerInputQueue({ threadId: "thread-1", activeTurnId: null });
    const failedClaim = startClaim(submit(queue, "failed"));
    submit(queue, "successor");
    submit(queue, "edited");
    const editKey = pendingPage(queue, "ordinary").items[1]?.key;
    if (editKey == null) throw new Error("expected deferred-successor edit key");
    const begun = queue.beginPendingInputEdit(
      { key: editKey, revision: queue.detailRevision() },
      () => ({ type: "restored" }),
    );
    if (begun.type !== "begun") throw new Error("expected deferred-successor reservation");

    const failure = queue.settleStart({ type: "definitelyNotAccepted", claim: failedClaim });
    expect(failure.effects[0]?.type).toBe("recover");
    const successorEffect = failure.effects[1];
    if (successorEffect?.type !== "performStart") {
      throw new Error("expected existing deferred successor effect");
    }
    expect(successorEffect.claim.message.id).toBe("successor");
    const saved = begun.reservation.save(composerDraftCapture("edited after failure"));
    if (saved.type !== "saved") throw new Error("expected deferred-successor save");
    expect(queue.submit(message("failed"))).toEqual({
      result: { type: "queued", messageId: "failed" },
      effects: [],
    });
    expect(pendingPage(queue, "ordinary").items.map(({ preview }) => preview)).toMatchObject([
      { text: "edited after failure" },
      { text: "message failed" },
    ]);
    const editedClaim = startClaim(
      acceptAndCompleteStart(queue, successorEffect.claim, "turn-successor"),
    );
    const recoveredFailedClaim = startClaim(
      acceptAndCompleteStart(queue, editedClaim, "turn-edited"),
    );
    expect([
      successorEffect.claim.message.id,
      editedClaim.message.id,
      recoveredFailedClaim.message.id,
    ]).toEqual(["successor", "edited", "failed"]);
  });

  it("returns only an ordinary drain intent when deleting during start recovery", () => {
    const queue = createComposerInputQueue({ threadId: "thread-1", activeTurnId: null });
    const failedClaim = startClaim(submit(queue, "failed"));
    submit(queue, "existing-successor");
    submit(queue, "deleted-during-recovery");
    const deleteKey = pendingPage(queue, "ordinary").items[1]?.key;
    if (deleteKey == null) throw new Error("expected recovery delete key");
    const failure = queue.settleStart({ type: "definitelyNotAccepted", claim: failedClaim });
    expect(failure.effects.map(({ type }) => type)).toEqual(["recover", "performStart"]);

    expect(queue.deletePendingInput({ key: deleteKey, revision: queue.detailRevision() })).toEqual({
      type: "deleted",
      revision: queue.detailRevision(),
      drainIntent: { lane: "ordinary" },
    });
    expect(queue.view().ordinaryQueuedCount).toBe(0);
    expect(queue.submit(message("failed"))).toEqual({
      result: { type: "queued", messageId: "failed" },
      effects: [],
    });
    const successorEffect = failure.effects[1];
    if (successorEffect?.type !== "performStart") {
      throw new Error("expected recovery-delete successor claim");
    }
    const recoveredFailedClaim = startClaim(
      acceptAndCompleteStart(queue, successorEffect.claim, "turn-successor"),
    );
    expect([successorEffect.claim.message.id, recoveredFailedClaim.message.id]).toEqual([
      "existing-successor",
      "failed",
    ]);
    expect(recoveredFailedClaim.message.id).not.toBe("deleted-during-recovery");
  });

  it("edits a queued steer in place and resumes only from its steer drain intent", () => {
    const queue = createComposerInputQueue({ threadId: "thread-1", activeTurnId: "turn-1" });
    const first = queue.submitSteer(message("pending"));
    const firstEffect = first.effects[0];
    if (firstEffect?.type !== "performSteer") throw new Error("expected pending steer claim");
    queue.submitSteer(message("edited"));
    const editKey = pendingPage(queue, "steer").items[1]?.key;
    if (editKey == null) throw new Error("expected queued steer key");
    const begun = queue.beginPendingInputEdit(
      { key: editKey, revision: queue.detailRevision() },
      (draft) => {
        expect(draft).toBe(message("edited").draft);
        return { type: "restored" };
      },
    );
    if (begun.type !== "begun") throw new Error("expected steer reservation");
    expect(pendingPage(queue, "steer").items[1]).toMatchObject({
      key: editKey,
      management: { type: "editing" },
      preview: { text: "message edited" },
    });
    expect(queue.view().releaseState).toEqual({
      type: "blocked",
      blockers: [
        { type: "steerQueued", count: 1 },
        { type: "pendingSteers", count: 1, hasUnknown: false },
      ],
    });

    const replacement = composerDraftCapture("saved steer");
    const saved = begun.reservation.save(replacement);
    expect(saved).toEqual({
      type: "saved",
      revision: queue.detailRevision(),
      drainIntent: { lane: "steer" },
    });
    if (saved.type !== "saved") throw new Error("expected saved steer");
    expect(queue.drainPendingInput(saved.drainIntent)).toEqual({
      result: { type: "applied", operation: "pendingInputManagementDrained" },
      effects: [],
    });
    const accepted = queue.settleSteer({
      type: "accepted",
      claim: firstEffect.claim,
      turnId: "turn-1",
    });
    const editedEffect = accepted.effects[0];
    if (editedEffect?.type !== "performSteer") throw new Error("expected edited steer claim");
    expect(editedEffect.claim.intent).toMatchObject({
      type: "intent",
      threadId: "thread-1",
      expectedTurnId: "turn-1",
      source: "direct",
      message: {
        id: "edited",
        draft: replacement.draft,
        input: replacement.input,
      },
    });
    expect(pendingPage(queue, "steer").items).toMatchObject([
      { management: { type: "readOnly" }, preview: { text: "message pending" } },
      { key: editKey, management: { type: "readOnly" }, preview: { text: "saved steer" } },
    ]);
  });

  it("cancels and deletes exact queued steer slots without forming claims", () => {
    const queue = createComposerInputQueue({ threadId: "thread-1", activeTurnId: "turn-1" });
    const pending = queue.submitSteer(message("pending"));
    if (pending.effects[0]?.type !== "performSteer") throw new Error("expected pending steer");
    queue.submitSteer(message("cancelled"));
    queue.submitSteer(message("deleted"));
    const [pendingItem, cancelledItem, deletedItem] = pendingPage(queue, "steer").items;
    if (cancelledItem == null || deletedItem == null) throw new Error("expected steer queue items");
    const begun = queue.beginPendingInputEdit(
      { key: cancelledItem.key, revision: queue.detailRevision() },
      () => ({ type: "restored" }),
    );
    if (begun.type !== "begun") throw new Error("expected steer reservation");
    const cancelled = begun.reservation.cancel();
    expect(cancelled).toEqual({
      type: "cancelled",
      revision: queue.detailRevision(),
      drainIntent: { lane: "steer" },
    });
    if (cancelled.type !== "cancelled") throw new Error("expected steer cancel");
    expect(queue.drainPendingInput(cancelled.drainIntent).effects).toEqual([]);
    expect(
      queue.deletePendingInput({ key: deletedItem.key, revision: queue.detailRevision() }),
    ).toEqual({
      type: "deleted",
      revision: queue.detailRevision(),
      drainIntent: { lane: "steer" },
    });
    expect(pendingPage(queue, "steer").items).toMatchObject([
      { key: pendingItem?.key, management: { type: "readOnly" } },
      {
        key: cancelledItem.key,
        management: { type: "manageable" },
        preview: { text: "message cancelled" },
      },
    ]);
  });

  it("invalidates a reserved steer immediately when its target closes", () => {
    const queue = createComposerInputQueue({ threadId: "thread-1", activeTurnId: "turn-1" });
    const pending = queue.submitSteer(message("pending"));
    const pendingEffect = pending.effects[0];
    if (pendingEffect?.type !== "performSteer") throw new Error("expected pending steer claim");
    queue.submitSteer(message("edited"));
    const edited = pendingPage(queue, "steer").items[1];
    if (edited == null) throw new Error("expected queued steer");
    const begun = queue.beginPendingInputEdit(
      { key: edited.key, revision: queue.detailRevision() },
      () => ({ type: "restored" }),
    );
    if (begun.type !== "begun") throw new Error("expected steer reservation");

    const closed = queue.settleSteer({
      type: "activeTurnNotSteerable",
      claim: pendingEffect.claim,
    });
    expect(closed.editInvalidation).toEqual({
      key: edited.key,
      lane: "steer",
      reason: "targetInvalidated",
      targetReason: "activeTurnNotSteerable",
    });
    expect(queue.view().rejectedSteers).toMatchObject([
      { key: "pending", preview: { text: "message pending" } },
      { key: "edited", preview: { text: "message edited" } },
    ]);
    expect(pendingPage(queue, "steer").items).toEqual([]);
    expect(begun.reservation.save(composerDraftCapture("late save"))).toEqual({
      type: "unavailable",
      reason: "sessionSettled",
      revision: queue.detailRevision(),
    });
    expect(begun.reservation.cancel()).toEqual({
      type: "unavailable",
      reason: "sessionSettled",
      revision: queue.detailRevision(),
    });
  });
});
