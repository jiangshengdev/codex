import { describe, expect, it } from "vitest";

import {
  createComposerInputQueue,
  type ComposerInputQueue,
  type ComposerInputQueueTransition,
  type ComposerQueueMessage,
  type StartClaim,
} from "../composerInputQueue";

const message = (id: string): ComposerQueueMessage => ({
  id,
  input: [
    { type: "text", text: `message ${id}`, text_elements: [] },
    { type: "skill", name: `skill-${id}`, path: `/example/skills/${id}/SKILL.md` },
  ],
});

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

describe("composer input queue", () => {
  it("issues one opaque single-message start claim for an idle submit", () => {
    const queue = createComposerInputQueue({ threadId: "thread-1", activeTurnId: null });

    expect(queue.view()).toEqual({
      queuedCount: 0,
      pendingSteers: [],
      queuedSteers: [],
      rejectedSteers: [],
      hasUnknownSteer: false,
      releaseState: { type: "safe" },
    });
    const submittedMessage = message("a");
    const transition = queue.submit(submittedMessage);
    const claim = startClaim(transition);

    expect(transition).toEqual({
      result: { type: "claimIssued" },
      effects: [{ type: "performStart", claim }],
    });
    expect(claim).toMatchObject({ type: "start", message: message("a") });
    expect(claim.message).not.toBe(submittedMessage);
    expect(claim.message.input).not.toBe(submittedMessage.input);
    expect(queue.view()).toEqual({
      queuedCount: 0,
      pendingSteers: [],
      queuedSteers: [],
      rejectedSteers: [],
      hasUnknownSteer: false,
      releaseState: {
        type: "blocked",
        blockers: [{ type: "pendingStart", phase: "issuing" }],
      },
    });
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
    expect(activeQueue.view()).toEqual({
      queuedCount: 1,
      pendingSteers: [],
      queuedSteers: [],
      rejectedSteers: [],
      hasUnknownSteer: false,
      releaseState: {
        type: "blocked",
        blockers: [{ type: "ordinaryQueued", count: 1 }],
      },
    });

    const queue = createComposerInputQueue({ threadId: "thread-1", activeTurnId: null });
    const firstClaim = startClaim(submit(queue, "a"));
    expect(submit(queue, "b")).toEqual({
      result: { type: "queued", messageId: "b" },
      effects: [],
    });
    expect(queue.view()).toEqual({
      queuedCount: 1,
      pendingSteers: [],
      queuedSteers: [],
      rejectedSteers: [],
      hasUnknownSteer: false,
      releaseState: {
        type: "blocked",
        blockers: [
          { type: "ordinaryQueued", count: 1 },
          { type: "pendingStart", phase: "issuing" },
        ],
      },
    });
    expect(submit(queue, "c")).toEqual({
      result: { type: "queued", messageId: "c" },
      effects: [],
    });
    expect(queue.view()).toEqual({
      queuedCount: 2,
      pendingSteers: [],
      queuedSteers: [],
      rejectedSteers: [],
      hasUnknownSteer: false,
      releaseState: {
        type: "blocked",
        blockers: [
          { type: "ordinaryQueued", count: 2 },
          { type: "pendingStart", phase: "issuing" },
        ],
      },
    });

    const afterFirst = queue.settleStart({ type: "definitelyNotAccepted", claim: firstClaim });
    const secondClaim = startClaim({ ...afterFirst, effects: afterFirst.effects.slice(1) });
    expect(secondClaim.message).toEqual(message("b"));
    expect(queue.view()).toEqual({
      queuedCount: 1,
      pendingSteers: [],
      queuedSteers: [],
      rejectedSteers: [],
      hasUnknownSteer: false,
      releaseState: {
        type: "blocked",
        blockers: [
          { type: "ordinaryQueued", count: 1 },
          { type: "pendingStart", phase: "issuing" },
        ],
      },
    });

    const afterSecond = queue.settleStart({ type: "definitelyNotAccepted", claim: secondClaim });
    const thirdClaim = startClaim({ ...afterSecond, effects: afterSecond.effects.slice(1) });
    expect(thirdClaim.message).toEqual(message("c"));
    expect(queue.view()).toEqual({
      queuedCount: 0,
      pendingSteers: [],
      queuedSteers: [],
      rejectedSteers: [],
      hasUnknownSteer: false,
      releaseState: {
        type: "blocked",
        blockers: [{ type: "pendingStart", phase: "issuing" }],
      },
    });
  });

  it("rejects empty input and whitespace-only text without changing ownership", () => {
    const queue = createComposerInputQueue({ threadId: "thread-1", activeTurnId: null });

    expect(queue.submit({ id: "empty", input: [] })).toEqual({
      result: { type: "invalidInput", reason: "emptyInput" },
      effects: [],
    });
    expect(
      queue.submit({
        id: "blank",
        input: [{ type: "text", text: " \n\t ", text_elements: [] }],
      }),
    ).toEqual({
      result: { type: "invalidInput", reason: "emptyInput" },
      effects: [],
    });
    const skillOnly = message("skill-only").input[1];
    if (skillOnly == null) throw new Error("skill-only fixture must exist");
    expect(queue.submit({ id: "skill-only", input: [skillOnly] }).result).toEqual({
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
    expect(queue.view()).toEqual({
      queuedCount: 0,
      pendingSteers: [],
      queuedSteers: [],
      rejectedSteers: [],
      hasUnknownSteer: false,
      releaseState: {
        type: "blocked",
        blockers: [{ type: "pendingStart", phase: "deliveryUnknown" }],
      },
    });
    expect(submit(queue, "b")).toEqual({
      result: { type: "queued", messageId: "b" },
      effects: [],
    });
    expect(queue.view()).toEqual({
      queuedCount: 1,
      pendingSteers: [],
      queuedSteers: [],
      rejectedSteers: [],
      hasUnknownSteer: false,
      releaseState: {
        type: "blocked",
        blockers: [
          { type: "ordinaryQueued", count: 1 },
          { type: "pendingStart", phase: "deliveryUnknown" },
        ],
      },
    });
    expect(queue.settleStart(unknown)).toEqual({
      result: { type: "idempotentReplay", subject: "startSettlement" },
      effects: [],
    });
    expect(queue.view()).toEqual({
      queuedCount: 1,
      pendingSteers: [],
      queuedSteers: [],
      rejectedSteers: [],
      hasUnknownSteer: false,
      releaseState: {
        type: "blocked",
        blockers: [
          { type: "ordinaryQueued", count: 1 },
          { type: "pendingStart", phase: "deliveryUnknown" },
        ],
      },
    });
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
    expect(queue.view()).toEqual({
      queuedCount: 1,
      pendingSteers: [],
      queuedSteers: [],
      rejectedSteers: [],
      hasUnknownSteer: false,
      releaseState: {
        type: "blocked",
        blockers: [{ type: "ordinaryQueued", count: 1 }],
      },
    });
    const completed = queue.observe({
      type: "turnCompleted",
      turnId: "turn-a",
      status: "completed",
      commitId: "terminal-a",
    });
    expect(startClaim(completed).message).toEqual(message("b"));
    expect(queue.view()).toEqual({
      queuedCount: 0,
      pendingSteers: [],
      queuedSteers: [],
      rejectedSteers: [],
      hasUnknownSteer: false,
      releaseState: {
        type: "blocked",
        blockers: [{ type: "pendingStart", phase: "issuing" }],
      },
    });

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

    for (const observation of [
      { type: "turnStarted", turnId: "foreign", commitId: "foreign-start" },
      {
        type: "turnCompleted",
        turnId: "foreign",
        status: "interrupted",
        commitId: "foreign-terminal",
      },
    ] as const) {
      expect(queue.observe(observation)).toEqual({
        result: { type: "applied", operation: "observationRecorded" },
        effects: [],
      });
    }
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

  it("recovers every ordinary message on interruption without starting another turn", () => {
    const queue = createComposerInputQueue({ threadId: "thread-1", activeTurnId: "turn-a" });
    submit(queue, "b");
    submit(queue, "c");
    expect(queue.view()).toEqual({
      queuedCount: 2,
      pendingSteers: [],
      queuedSteers: [],
      rejectedSteers: [],
      hasUnknownSteer: false,
      releaseState: {
        type: "blocked",
        blockers: [{ type: "ordinaryQueued", count: 2 }],
      },
    });
    const interrupted = {
      type: "turnCompleted",
      turnId: "turn-a",
      status: "interrupted",
      commitId: "terminal-a",
    } as const;

    expect(queue.observe(interrupted)).toEqual({
      result: { type: "recoveryProduced", reason: "interrupted", messageIds: ["b", "c"] },
      effects: [
        {
          type: "recover",
          batch: { reason: "interrupted", messages: [message("b"), message("c")] },
        },
      ],
    });
    expect(queue.view()).toEqual({
      queuedCount: 0,
      pendingSteers: [],
      queuedSteers: [],
      rejectedSteers: [],
      hasUnknownSteer: false,
      releaseState: { type: "safe" },
    });
    expect(queue.observe(interrupted)).toEqual({
      result: { type: "idempotentReplay", subject: "runtimeObservation" },
      effects: [],
    });
    expect(submit(queue, "b").effects[0]?.type).toBe("performStart");
    expect(
      createComposerInputQueue({ threadId: "thread-1", activeTurnId: "empty" }).observe({
        type: "turnCompleted",
        turnId: "empty",
        status: "interrupted",
        commitId: "empty-terminal",
      }),
    ).toEqual({ result: { type: "applied", operation: "turnCompleted" }, effects: [] });
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
    expect(queue.view()).toEqual({
      queuedCount: 2,
      pendingSteers: [],
      queuedSteers: [],
      rejectedSteers: [],
      hasUnknownSteer: false,
      releaseState: {
        type: "blocked",
        blockers: [{ type: "ordinaryQueued", count: 2 }],
      },
    });
    const failed = queue.observe({
      type: "turnCompleted",
      turnId: "turn-a",
      status: "failed",
      commitId: "terminal-a",
    });
    transitions.push(failed);
    const second = startClaim(failed);
    expect(queue.view()).toEqual({
      queuedCount: 1,
      pendingSteers: [],
      queuedSteers: [],
      rejectedSteers: [],
      hasUnknownSteer: false,
      releaseState: {
        type: "blocked",
        blockers: [
          { type: "ordinaryQueued", count: 1 },
          { type: "pendingStart", phase: "issuing" },
        ],
      },
    });
    transitions.push(
      queue.settleStart({ type: "accepted", claim: second, turnId: "turn-b" }),
      queue.observe({ type: "turnStarted", turnId: "turn-b", commitId: "start-b" }),
    );
    const interrupted = queue.observe({
      type: "turnCompleted",
      turnId: "turn-b",
      status: "interrupted",
      commitId: "terminal-b",
    });
    transitions.push(interrupted);
    expect(interrupted).toEqual({
      result: { type: "recoveryProduced", reason: "interrupted", messageIds: ["c"] },
      effects: [{ type: "recover", batch: { reason: "interrupted", messages: [message("c")] } }],
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
            ? [effect.claim.intent.messageId]
            : effect.batch.reason === "steerDefinitelyNotAccepted"
              ? effect.batch.transfer.intents.map(({ messageId }) => messageId)
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
    expect(firstEffect.claim.intent).toMatchObject({
      messageId: "steer-a",
      threadId: "thread-1",
      expectedTurnId: "turn-1",
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
    expect(secondEffect.claim.intent.messageId).toBe("steer-b");
    expect(
      queue.observe({
        type: "userMessageCommitted",
        clientId: firstEffect.claim.intent.clientUserMessageId,
        turnId: "turn-1",
        commitId: "commit-steer-a",
      }),
    ).toEqual({ result: { type: "applied", operation: "steerCommitted" }, effects: [] });
    expect(queue.view()).toMatchObject({
      queuedCount: 2,
      pendingSteers: [{ key: "steer-b", phase: "issuing" }],
    });

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
      queuedCount: 1,
      queuedSteers: [{ key: "ordinary-a" }],
    });
    const accepted = queue.settleSteer({
      type: "accepted",
      claim: directEffect.claim,
      turnId: "turn-1",
    });
    const promotedEffect = accepted.effects[0];
    expect(promotedEffect?.type).toBe("performSteer");
    if (promotedEffect?.type !== "performSteer") throw new Error("expected promoted steer claim");
    expect(promotedEffect.claim.intent).toMatchObject({
      messageId: "ordinary-a",
      source: "ordinaryPromotion",
    });
    expect(queue.view().queuedCount).toBe(1);
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
      queuedCount: 1,
      pendingSteers: [],
      queuedSteers: [],
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
      pendingSteers: [{ key: "a", phase }],
      queuedSteers: [{ key: "b" }],
      hasUnknownSteer: true,
      releaseState: {
        type: "blocked",
        blockers: [
          { type: "steerQueued", count: 1 },
          { type: "pendingSteers", count: 1, hasUnknown: true },
        ],
      },
    });
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
    expect(merge.provenance.type).toBe("rejectedSteerMerge");
    expect(merge.message.input).toEqual([...message("steer-a").input, ...message("steer-b").input]);
    expect(queue.view()).toMatchObject({ queuedCount: 1, rejectedSteers: [] });

    expect(queue.settleStart({ type: "definitelyNotAccepted", claim: merge })).toEqual({
      result: { type: "applied", operation: "rejectedSteerStartRestored" },
      effects: [],
    });
    expect(queue.view()).toMatchObject({
      queuedCount: 1,
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
    expect(merge.provenance.type).toBe("rejectedSteerMerge");

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
    expect(resubmitted.effects[0]).toMatchObject({
      type: "performSteer",
      claim: { intent: { messageId: "steer-a", expectedTurnId: "turn-2" } },
    });
    expect(queue.submitSteer(message(merge.message.id))).toEqual({
      result: { type: "applied", operation: "steerQueued" },
      effects: [],
    });
  });

  it("keeps generic steer rejection in steer recovery and exposes only bounded previews", () => {
    const queue = createComposerInputQueue({ threadId: "thread-1", activeTurnId: "turn-1" });
    const longText = "x".repeat(200);
    const first = queue.submitSteer({
      id: "long",
      input: [
        { type: "text", text: longText, text_elements: [] },
        { type: "skill", name: "secret-skill", path: "/example/skills/secret/SKILL.md" },
      ],
    });
    const effect = first.effects[0];
    if (effect?.type !== "performSteer") throw new Error("expected steer claim");
    const view = queue.view();
    expect(view.pendingSteers[0]?.preview).toEqual({
      type: "text",
      text: `${"x".repeat(157)}...`,
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
    expect(queue.restoreSteerRecovery(recovery.batch.transfer).effects[0]).toMatchObject({
      type: "performSteer",
      claim: { intent: { messageId: "long" } },
    });
  });
});
