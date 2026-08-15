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

const committedMessage = (claim: StartClaim, turnId: string, commitId: string) => ({
  type: "userMessageCommitted" as const,
  clientId: claim.clientUserMessageId,
  turnId,
  commitId,
});

describe("composer input queue", () => {
  it("issues one opaque single-message start claim for an idle submit", () => {
    const queue = createComposerInputQueue({ activeTurnId: null });

    expect(queue.view()).toEqual({ queuedCount: 0 });
    const transition = submit(queue, "a");
    const claim = startClaim(transition);

    expect(transition).toEqual({
      result: { type: "claimIssued" },
      effects: [{ type: "performStart", claim }],
    });
    expect(claim).toMatchObject({ type: "start", message: message("a") });
    expect(queue.view()).toEqual({ queuedCount: 0 });
  });

  it("issues distinct client message identities across queue instances", () => {
    const firstClaim = startClaim(submit(createComposerInputQueue(), "a"));
    const secondClaim = startClaim(submit(createComposerInputQueue(), "a"));

    expect(firstClaim.clientUserMessageId).not.toBe(secondClaim.clientUserMessageId);
  });

  it("queues active, pending, and busy submissions without outbound effects and keeps FIFO", () => {
    const activeQueue = createComposerInputQueue({ activeTurnId: "turn-active" });
    expect(submit(activeQueue, "active")).toEqual({
      result: { type: "queued", messageId: "active" },
      effects: [],
    });
    expect(activeQueue.view()).toEqual({ queuedCount: 1 });

    const queue = createComposerInputQueue({ activeTurnId: null });
    const firstClaim = startClaim(submit(queue, "a"));
    expect(submit(queue, "b")).toEqual({
      result: { type: "queued", messageId: "b" },
      effects: [],
    });
    expect(queue.view()).toEqual({ queuedCount: 1 });
    expect(submit(queue, "c")).toEqual({
      result: { type: "queued", messageId: "c" },
      effects: [],
    });
    expect(queue.view()).toEqual({ queuedCount: 2 });

    const afterFirst = queue.settleStart({ type: "definitelyNotAccepted", claim: firstClaim });
    const secondClaim = startClaim({ ...afterFirst, effects: afterFirst.effects.slice(1) });
    expect(secondClaim.message).toEqual(message("b"));
    expect(queue.view()).toEqual({ queuedCount: 1 });

    const afterSecond = queue.settleStart({ type: "definitelyNotAccepted", claim: secondClaim });
    const thirdClaim = startClaim({ ...afterSecond, effects: afterSecond.effects.slice(1) });
    expect(thirdClaim.message).toEqual(message("c"));
    expect(queue.view()).toEqual({ queuedCount: 0 });
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
    expect(queue.view()).toEqual({ queuedCount: 0 });
    expect(submit(queue, "b")).toEqual({
      result: { type: "queued", messageId: "b" },
      effects: [],
    });
    expect(queue.view()).toEqual({ queuedCount: 1 });
    expect(queue.settleStart(unknown)).toEqual({
      result: { type: "idempotentReplay", subject: "startSettlement" },
      effects: [],
    });
    expect(queue.view()).toEqual({ queuedCount: 1 });
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
    expect(queue.view()).toEqual({ queuedCount: 1 });
    const completed = queue.observe({
      type: "turnCompleted",
      turnId: "turn-a",
      status: "completed",
      commitId: "terminal-a",
    });
    expect(startClaim(completed).message).toEqual(message("b"));
    expect(queue.view()).toEqual({ queuedCount: 0 });

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
    const queue = createComposerInputQueue({ activeTurnId: "turn-a" });
    submit(queue, "b");
    submit(queue, "c");
    expect(queue.view()).toEqual({ queuedCount: 2 });
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
    expect(queue.view()).toEqual({ queuedCount: 0 });
    expect(queue.observe(interrupted)).toEqual({
      result: { type: "idempotentReplay", subject: "runtimeObservation" },
      effects: [],
    });
    expect(submit(queue, "b").effects[0]?.type).toBe("performStart");
    expect(
      createComposerInputQueue({ activeTurnId: "empty" }).observe({
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
    expect(queue.view()).toEqual({ queuedCount: 2 });
    const failed = queue.observe({
      type: "turnCompleted",
      turnId: "turn-a",
      status: "failed",
      commitId: "terminal-a",
    });
    transitions.push(failed);
    const second = startClaim(failed);
    expect(queue.view()).toEqual({ queuedCount: 1 });
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
          : effect.batch.messages.map(({ id }) => id),
      ),
    );
    expect(effectOwnerIds).toEqual(["a", "b", "c"]);
    expect(new Set(effectOwnerIds).size).toBe(effectOwnerIds.length);
  });
});
