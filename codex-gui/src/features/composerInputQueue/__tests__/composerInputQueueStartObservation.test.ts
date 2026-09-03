import { describe, expect, it } from "vitest";

import {
  createComposerInputQueue,
  type ComposerInputQueue,
  type ComposerInputQueueView,
  type ComposerInputQueueTransition,
  type ComposerQueueMessage,
  type StartClaim,
} from "../composerInputQueue";
import { composerQueueMessage } from "./composerInputQueueTestFixtures";

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
});
