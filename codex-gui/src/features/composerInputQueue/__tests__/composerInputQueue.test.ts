import { describe, expect, it } from "vitest";
import {
  createComposerInputQueue,
  type ComposerInputQueueTransition,
  type RecoveryBatch,
  type StartClaim,
  type SteerAttempt,
} from "../composerInputQueue";

function message(id: string, text = id) {
  return { id, text };
}

function submit(queue: ReturnType<typeof createComposerInputQueue>, id: string, text = id) {
  return queue.submit({ intent: "queue", message: message(id, text) });
}

function complete(
  queue: ReturnType<typeof createComposerInputQueue>,
  turnId: string,
  commitId = `commit-${turnId}`,
  status: "completed" | "failed" | "interrupted" = "completed",
) {
  return queue.observe({ type: "turnCompleted", completion: { status, turnId, commitId } });
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

function steerAttempt(transition: ComposerInputQueueTransition): SteerAttempt {
  const effect = transition.effects.find(({ type }) => type === "performSteer");
  if (effect?.type !== "performSteer") {
    throw new Error("expected a performSteer effect");
  }
  return effect.attempt;
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
      pendingSteerCount: 0,
      rejectedSteerCount: 0,
      hasDeliveryUnknown: false,
      manageableMessageIds: [],
      canUndo: false,
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

    const firstStart = complete(queue, "turn-active");
    const firstClaim = startClaim(firstStart);
    expect(firstClaim.messages).toStrictEqual([message("message-1")]);
    expect(queue.view().ordinary).toStrictEqual([message("message-2")]);

    queue.settle({ type: "startAccepted", claim: firstClaim, turnId: "turn-next" });
    queue.observe({ type: "turnStarted", turnId: "turn-next" });
    const secondStart = complete(queue, "turn-next");
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
      pendingSteerCount: 0,
      rejectedSteerCount: 0,
      hasDeliveryUnknown: false,
      manageableMessageIds: ["message-2"],
      canUndo: false,
    });
    expect(submit(queue, "message-3").effects).toStrictEqual([]);

    expect(queue.observe({ type: "turnStarted", turnId: "turn-1" }).result).toStrictEqual({
      type: "applied",
      operation: "turnStarted",
    });
    expect(queue.view()).toStrictEqual({
      ordinary: [message("message-2"), message("message-3")],
      hasPendingStart: false,
      pendingSteerCount: 0,
      rejectedSteerCount: 0,
      hasDeliveryUnknown: false,
      manageableMessageIds: ["message-2", "message-3"],
      canUndo: false,
    });
  });

  it("accepts a matching terminal fact before turnStarted and drains only once", () => {
    const queue = createComposerInputQueue();
    const claim = startClaim(submit(queue, "message-1"));
    submit(queue, "message-2");
    queue.settle({ type: "startAccepted", claim, turnId: "turn-1" });

    const terminal = complete(queue, "turn-1");
    expect(startClaim(terminal).messages).toStrictEqual([message("message-2")]);
    expect(complete(queue, "turn-1")).toStrictEqual({
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
      pendingSteerCount: 0,
      rejectedSteerCount: 0,
      hasDeliveryUnknown: false,
      manageableMessageIds: ["message-2"],
      canUndo: false,
    });
  });

  it("does not replace a pending claim fact with an observation for another turn", () => {
    const queue = createComposerInputQueue();
    const claim = startClaim(submit(queue, "message-1"));

    queue.observe({ type: "turnStarted", turnId: "turn-original" });
    expect(complete(queue, "turn-other")).toStrictEqual({
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
      pendingSteerCount: 0,
      rejectedSteerCount: 0,
      hasDeliveryUnknown: false,
      manageableMessageIds: [],
      canUndo: false,
    });
  });

  it("retains a matching terminal that arrives before settlement and then continues FIFO", () => {
    const queue = createComposerInputQueue();
    const claim = startClaim(submit(queue, "message-1"));
    submit(queue, "message-2");

    expect(complete(queue, "turn-1")).toStrictEqual({
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
      pendingSteerCount: 0,
      rejectedSteerCount: 0,
      hasDeliveryUnknown: false,
      manageableMessageIds: ["message-3"],
      canUndo: false,
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
      pendingSteerCount: 0,
      rejectedSteerCount: 0,
      hasDeliveryUnknown: true,
      manageableMessageIds: ["message-2", "message-3"],
      canUndo: false,
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
    expect(complete(queue, "turn-stale").result).toStrictEqual({
      type: "ownershipMismatch",
      subject: "runtimeTurn",
    });
  });

  it("returns stale for an unrelated terminal observation while idle", () => {
    const queue = createComposerInputQueue();

    expect(complete(queue, "turn-old")).toStrictEqual({
      result: { type: "stale", subject: "runtimeObservation" },
      effects: [],
    });
  });

  it("keeps only the latest terminal identity and classifies an older terminal as stale", () => {
    const queue = createComposerInputQueue({ activeTurnId: "turn-1" });
    complete(queue, "turn-1");
    queue.observe({ type: "turnStarted", turnId: "turn-2" });
    complete(queue, "turn-2");

    expect(complete(queue, "turn-1", "commit-turn-1-replay")).toStrictEqual({
      result: { type: "stale", subject: "runtimeObservation" },
      effects: [],
    });
  });
});

describe("ComposerInputQueue steer and terminal ownership", () => {
  it("keeps an accepted steer pending until its client id is committed", () => {
    const queue = createComposerInputQueue({ activeTurnId: "turn-1" });
    const attempt = steerAttempt(
      queue.submit({ intent: "steer", message: message("steer-1", "same text") }),
    );
    queue.settle({ type: "steerAccepted", attempt });

    expect(
      queue.observe({
        type: "userMessageCommitted",
        clientId: "other-id",
        turnId: "turn-1",
        commitId: "commit-other",
      }).result,
    ).toStrictEqual({ type: "stale", subject: "runtimeCommit" });
    expect(
      queue.observe({
        type: "userMessageCommitted",
        clientId: "steer-1",
        turnId: "turn-1",
        commitId: "commit-steer",
      }).result,
    ).toStrictEqual({ type: "applied", operation: "userMessageCommitted" });
    expect(queue.view().pendingSteerCount).toBe(0);
  });

  it("retries a turn mismatch once with the same steer capability", () => {
    const queue = createComposerInputQueue({ activeTurnId: "turn-old" });
    const attempt = steerAttempt(queue.submit({ intent: "steer", message: message("steer-1") }));

    const retry = queue.settle({
      type: "steerExpectedTurnMismatch",
      attempt,
      actualTurnId: "turn-current",
    });
    const retryAttempt = steerAttempt(retry);
    expect(retryAttempt.claim).toBe(attempt.claim);
    expect(retryAttempt.turnId).toBe("turn-current");
    expect(
      queue.settle({
        type: "steerExpectedTurnMismatch",
        attempt,
        actualTurnId: "turn-current",
      }).result,
    ).toStrictEqual({ type: "idempotentReplay", subject: "steerSettlement" });
    expect(
      queue.settle({
        type: "steerExpectedTurnMismatch",
        attempt: retryAttempt,
        actualTurnId: "turn-newer",
      }).result,
    ).toStrictEqual({
      type: "recoveryProduced",
      reason: "steerRetryExhausted",
      messageIds: ["steer-1"],
    });
  });

  it("drains rejected steers before ordinary messages after failed completion", () => {
    const queue = createComposerInputQueue({ activeTurnId: "turn-1" });
    const rejected = steerAttempt(
      queue.submit({ intent: "steer", message: message("rejected-1") }),
    );
    queue.settle({ type: "steerNonSteerable", attempt: rejected });
    submit(queue, "ordinary-1");

    const failed = complete(queue, "turn-1", "commit-failed", "failed");
    expect(startClaim(failed).messages).toStrictEqual([message("rejected-1")]);
    expect(queue.view().ordinary).toStrictEqual([message("ordinary-1")]);
  });

  it("interrupts atomically into rejected-pending-ordinary recovery without outbound work", () => {
    const queue = createComposerInputQueue({ activeTurnId: "turn-1" });
    const rejected = steerAttempt(
      queue.submit({ intent: "steer", message: message("rejected-1") }),
    );
    queue.settle({ type: "steerNonSteerable", attempt: rejected });
    queue.submit({ intent: "steer", message: message("pending-1") });
    submit(queue, "ordinary-1");

    const interrupted = complete(queue, "turn-1", "commit-interrupted", "interrupted");
    expect(recoveryBatch(interrupted).messages).toStrictEqual([
      message("rejected-1"),
      message("pending-1"),
      message("ordinary-1"),
    ]);
    expect(interrupted.effects.some(({ type }) => type !== "recover")).toBe(false);
  });

  it("preserves FIFO ownership when two pending steers both report no active turn", () => {
    const queue = createComposerInputQueue({ activeTurnId: "turn-old" });
    const first = steerAttempt(queue.submit({ intent: "steer", message: message("steer-first") }));
    const second = steerAttempt(
      queue.submit({ intent: "steer", message: message("steer-second") }),
    );

    const firstStart = queue.settle({ type: "steerNoActive", attempt: first });
    expect(startClaim(firstStart).messages).toStrictEqual([message("steer-first")]);
    expect(queue.settle({ type: "steerNoActive", attempt: second }).result).toStrictEqual({
      type: "rejected",
      reason: "noActive",
    });
    expect(queue.view()).toMatchObject({
      hasPendingStart: true,
      pendingSteerCount: 0,
      rejectedSteerCount: 1,
    });

    const firstClaim = startClaim(firstStart);
    queue.settle({ type: "startAccepted", claim: firstClaim, turnId: "turn-first" });
    const secondStart = complete(queue, "turn-first", "commit-first");
    expect(startClaim(secondStart).messages).toStrictEqual([message("steer-second")]);
  });

  it("does not let a later no-active steer overtake an earlier pending steer", () => {
    const queue = createComposerInputQueue({ activeTurnId: "turn-old" });
    const first = steerAttempt(queue.submit({ intent: "steer", message: message("steer-first") }));
    const second = steerAttempt(
      queue.submit({ intent: "steer", message: message("steer-second") }),
    );

    expect(queue.settle({ type: "steerNoActive", attempt: second }).effects).toStrictEqual([]);
    expect(submit(queue, "ordinary-after").result).toStrictEqual({
      type: "queued",
      messageId: "ordinary-after",
    });
    const released = queue.settle({ type: "steerNonSteerable", attempt: first });
    expect(startClaim(released).messages).toStrictEqual([
      message("steer-first"),
      message("steer-second"),
    ]);
    expect(queue.view().ordinary).toStrictEqual([message("ordinary-after")]);
  });

  it.each(["observationFirst", "settlementFirst"] as const)(
    "converges start delivery unknown with turnStarted in %s order",
    (order) => {
      const queue = createComposerInputQueue();
      const claim = startClaim(submit(queue, "start-unknown"));

      if (order === "observationFirst") {
        queue.observe({ type: "turnStarted", turnId: "turn-started" });
        queue.settle({ type: "startDeliveryUnknown", claim });
      } else {
        queue.settle({ type: "startDeliveryUnknown", claim });
        queue.observe({ type: "turnStarted", turnId: "turn-started" });
      }

      expect(queue.view()).toMatchObject({ hasPendingStart: true, hasDeliveryUnknown: true });
      queue.observe({
        type: "userMessageCommitted",
        clientId: "start-unknown",
        turnId: "turn-started",
        commitId: "commit-started-message",
      });
      expect(queue.view()).toMatchObject({ hasPendingStart: false, hasDeliveryUnknown: false });
      expect(queue.view().ordinary).toStrictEqual([]);
    },
  );

  it.each(["observationFirst", "settlementFirst"] as const)(
    "converges start delivery unknown with turnCompleted in %s order and drains FIFO",
    (order) => {
      const queue = createComposerInputQueue();
      const claim = startClaim(submit(queue, "start-unknown"));
      submit(queue, "ordinary-next");

      if (order === "observationFirst") {
        complete(queue, "turn-completed", "commit-completed");
        queue.settle({ type: "startDeliveryUnknown", claim });
      } else {
        queue.settle({ type: "startDeliveryUnknown", claim });
        complete(queue, "turn-completed", "commit-completed");
      }

      expect(queue.view()).toMatchObject({ hasPendingStart: true, hasDeliveryUnknown: true });
      const completion = queue.observe({
        type: "userMessageCommitted",
        clientId: "start-unknown",
        turnId: "turn-completed",
        commitId: "commit-start-message",
      });
      expect(startClaim(completion).messages).toStrictEqual([message("ordinary-next")]);
    },
  );

  it("uses the mismatch actual turn for retry and subsequent steer submissions", () => {
    const queue = createComposerInputQueue({ activeTurnId: "turn-old" });
    const original = steerAttempt(
      queue.submit({ intent: "steer", message: message("steer-original") }),
    );
    const retry = queue.settle({
      type: "steerExpectedTurnMismatch",
      attempt: original,
      actualTurnId: "turn-actual",
    });
    expect(steerAttempt(retry).turnId).toBe("turn-actual");
    expect(
      steerAttempt(queue.submit({ intent: "steer", message: message("steer-new") })).turnId,
    ).toBe("turn-actual");
  });

  it("does not clear the actual active turn or its pending owners for another turn completion", () => {
    const queue = createComposerInputQueue({ activeTurnId: "turn-old" });
    const original = steerAttempt(
      queue.submit({ intent: "steer", message: message("steer-original") }),
    );
    queue.settle({
      type: "steerExpectedTurnMismatch",
      attempt: original,
      actualTurnId: "turn-actual",
    });

    expect(complete(queue, "turn-old", "commit-old").result).toStrictEqual({
      type: "ownershipMismatch",
      subject: "runtimeTurn",
    });
    expect(queue.view().pendingSteerCount).toBe(1);
    expect(
      steerAttempt(queue.submit({ intent: "steer", message: message("steer-new") })).turnId,
    ).toBe("turn-actual");
  });

  it("does not requeue a committed pending steer when its turn completes", () => {
    const queue = createComposerInputQueue({ activeTurnId: "turn-1" });
    queue.submit({ intent: "steer", message: message("steer-committed") });
    submit(queue, "ordinary-next");
    queue.observe({
      type: "userMessageCommitted",
      clientId: "steer-committed",
      turnId: "turn-1",
      commitId: "commit-steer",
    });

    const completion = complete(queue, "turn-1", "commit-turn");
    expect(startClaim(completion).messages).toStrictEqual([message("ordinary-next")]);
  });

  it("excludes committed pending messages from interrupted recovery", () => {
    const queue = createComposerInputQueue({ activeTurnId: "turn-1" });
    queue.submit({ intent: "steer", message: message("steer-committed") });
    queue.observe({
      type: "userMessageCommitted",
      clientId: "steer-committed",
      turnId: "turn-1",
      commitId: "commit-steer",
    });
    const rejected = steerAttempt(
      queue.submit({ intent: "steer", message: message("steer-rejected") }),
    );
    queue.settle({ type: "steerNonSteerable", attempt: rejected });
    queue.submit({ intent: "steer", message: message("steer-pending") });
    submit(queue, "ordinary-1");

    const interrupted = complete(queue, "turn-1", "commit-interrupted", "interrupted");
    expect(recoveryBatch(interrupted).messages).toStrictEqual([
      message("steer-rejected"),
      message("steer-pending"),
      message("ordinary-1"),
    ]);
  });

  it("recovers all local owners when an interrupted completion releases the current turn", () => {
    const queue = createComposerInputQueue({ activeTurnId: "turn-old" });
    const rejectedOld = steerAttempt(
      queue.submit({ intent: "steer", message: message("rejected-old") }),
    );
    queue.settle({ type: "steerNonSteerable", attempt: rejectedOld });
    const pendingNew = steerAttempt(
      queue.submit({ intent: "steer", message: message("pending-new") }),
    );
    queue.settle({
      type: "steerExpectedTurnMismatch",
      attempt: pendingNew,
      actualTurnId: "turn-new",
    });

    const interrupted = complete(queue, "turn-new", "commit-new", "interrupted");
    expect(recoveryBatch(interrupted).messages).toStrictEqual([
      message("rejected-old"),
      message("pending-new"),
    ]);
    expect(interrupted.effects.map(({ type }) => type)).toStrictEqual(["recover"]);
    expect(queue.view()).toMatchObject({
      ordinary: [],
      hasPendingStart: false,
      pendingSteerCount: 0,
      rejectedSteerCount: 0,
      hasDeliveryUnknown: false,
    });
  });
});

describe("ComposerInputQueue ordinary management", () => {
  it("edits in place and deletes then restores the original FIFO position", () => {
    const queue = createComposerInputQueue({ activeTurnId: "turn-1" });
    submit(queue, "message-1");
    submit(queue, "message-2");
    submit(queue, "message-3");

    expect(
      queue.manage({ type: "edit", messageId: "message-2", text: "edited" }).result,
    ).toStrictEqual({
      type: "applied",
      operation: "queueItemEdited",
    });
    expect(queue.manage({ type: "delete", messageId: "message-2" }).result).toStrictEqual({
      type: "applied",
      operation: "queueItemDeleted",
    });
    expect(queue.view()).toMatchObject({
      ordinary: [message("message-1"), message("message-3")],
      manageableMessageIds: ["message-1", "message-3"],
      canUndo: true,
    });
    expect(queue.manage({ type: "undo" }).result).toStrictEqual({
      type: "applied",
      operation: "undoApplied",
    });
    expect(queue.view().ordinary).toStrictEqual([
      message("message-1"),
      message("message-2", "edited"),
      message("message-3"),
    ]);
  });

  it("classifies invalid, unchanged, unknown, and locked management explicitly", () => {
    const queue = createComposerInputQueue({ activeTurnId: "turn-1" });
    submit(queue, "ordinary-1", "text");
    expect(queue.manage({ type: "edit", messageId: "ordinary-1", text: " " }).result).toStrictEqual(
      {
        type: "invalidInput",
        reason: "emptyEdit",
      },
    );
    expect(
      queue.manage({ type: "edit", messageId: "ordinary-1", text: "text" }).result,
    ).toStrictEqual({
      type: "unchanged",
      subject: "edit",
    });
    expect(queue.manage({ type: "delete", messageId: "missing" }).result).toStrictEqual({
      type: "unknownIdentity",
      messageId: "missing",
    });

    const lockedQueue = createComposerInputQueue();
    submit(lockedQueue, "locked-1");
    expect(lockedQueue.manage({ type: "delete", messageId: "locked-1" }).result).toStrictEqual({
      type: "lockedIdentity",
      messageId: "locked-1",
    });
    expect(
      lockedQueue.manage({ type: "edit", messageId: "locked-1", text: "changed" }).result,
    ).toStrictEqual({ type: "lockedIdentity", messageId: "locked-1" });
  });

  it("expires undo on later membership mutation and reports replay after successful undo", () => {
    const queue = createComposerInputQueue({ activeTurnId: "turn-1" });
    submit(queue, "message-1");
    submit(queue, "message-2");
    queue.manage({ type: "delete", messageId: "message-1" });
    submit(queue, "message-3");
    expect(queue.manage({ type: "undo" }).result).toStrictEqual({
      type: "undoUnavailable",
      reason: "expired",
    });

    queue.manage({ type: "delete", messageId: "message-2" });
    queue.manage({ type: "undo" });
    expect(queue.manage({ type: "undo" }).result).toStrictEqual({
      type: "undoUnavailable",
      reason: "replayed",
    });
  });

  it("clears and restores an unbounded ordinary sequence", () => {
    const queue = createComposerInputQueue({ activeTurnId: "turn-1" });
    const messages = Array.from({ length: 32 }, (_, index) => message(`message-${String(index)}`));
    for (const item of messages) {
      queue.submit({ intent: "queue", message: item });
    }

    expect(queue.manage({ type: "clear" }).result).toStrictEqual({
      type: "applied",
      operation: "queueCleared",
    });
    expect(queue.view()).toMatchObject({ ordinary: [], canUndo: true });
    queue.manage({ type: "undo" });
    expect(queue.view().ordinary).toStrictEqual(messages);
  });

  it("returns frozen management views without exposing mutable queue references", () => {
    const queue = createComposerInputQueue({ activeTurnId: "turn-1" });
    submit(queue, "message-1");
    const view = queue.view();

    expect(Object.isFrozen(view)).toBe(true);
    expect(Object.isFrozen(view.ordinary)).toBe(true);
    expect(Object.isFrozen(view.ordinary[0])).toBe(true);
    expect(Object.isFrozen(view.manageableMessageIds)).toBe(true);
  });

  it("conserves identities through a fixed commit-reject-drain-recovery sequence", () => {
    const queue = createComposerInputQueue({ activeTurnId: "turn-1" });
    const serverOwner = new Set<string>();
    const recoveryOwner = new Set<string>();
    const deletedOwner = new Set<string>();
    const expectAtMostOneStart = (transition: ComposerInputQueueTransition) => {
      expect(transition.effects.filter(({ type }) => type === "performStart")).toHaveLength(
        transition.effects.some(({ type }) => type === "performStart") ? 1 : 0,
      );
    };

    const committed = steerAttempt(queue.submit({ intent: "steer", message: message("server-1") }));
    queue.settle({ type: "steerAccepted", attempt: committed });
    queue.observe({
      type: "userMessageCommitted",
      clientId: "server-1",
      turnId: "turn-1",
      commitId: "commit-server-1",
    });
    serverOwner.add("server-1");
    expect(queue.view().pendingSteerCount).toBe(0);

    const rejected = steerAttempt(
      queue.submit({ intent: "steer", message: message("rejected-1") }),
    );
    queue.settle({ type: "steerNonSteerable", attempt: rejected });
    submit(queue, "ordinary-1");
    submit(queue, "ordinary-2");
    submit(queue, "ordinary-3");
    expect(queue.view()).toMatchObject({
      ordinary: [message("ordinary-1"), message("ordinary-2"), message("ordinary-3")],
      rejectedSteerCount: 1,
      pendingSteerCount: 0,
    });
    expect(submit(queue, "ordinary-1", "duplicate")).toStrictEqual({
      result: { type: "duplicateIdentity", messageId: "ordinary-1" },
      effects: [],
    });
    queue.manage({ type: "delete", messageId: "ordinary-2" });
    deletedOwner.add("ordinary-2");
    expect(queue.view()).toMatchObject({
      ordinary: [message("ordinary-1"), message("ordinary-3")],
      canUndo: true,
    });

    const rejectedStart = complete(queue, "turn-1", "commit-turn-1", "failed");
    expectAtMostOneStart(rejectedStart);
    expect(startClaim(rejectedStart).messages).toStrictEqual([message("rejected-1")]);
    expect(queue.view()).toMatchObject({
      ordinary: [message("ordinary-1"), message("ordinary-3")],
      hasPendingStart: true,
      rejectedSteerCount: 0,
      canUndo: true,
    });
    expect(submit(queue, "ordinary-1", "still duplicate")).toStrictEqual({
      result: { type: "duplicateIdentity", messageId: "ordinary-1" },
      effects: [],
    });
    const rejectedClaim = startClaim(rejectedStart);
    queue.settle({ type: "startAccepted", claim: rejectedClaim, turnId: "turn-2" });
    queue.observe({ type: "turnStarted", turnId: "turn-2" });
    serverOwner.add("rejected-1");
    const ordinaryStart = complete(queue, "turn-2", "commit-turn-2");
    expectAtMostOneStart(ordinaryStart);
    expect(startClaim(ordinaryStart).messages).toStrictEqual([message("ordinary-1")]);
    expect(queue.view()).toMatchObject({
      ordinary: [message("ordinary-3")],
      hasPendingStart: true,
      canUndo: false,
    });
    expect(queue.manage({ type: "undo" }).result).toStrictEqual({
      type: "undoUnavailable",
      reason: "expired",
    });
    const ordinaryClaim = startClaim(ordinaryStart);
    const rejectedOrdinary = queue.settle({
      type: "startDefinitelyNotAccepted",
      claim: ordinaryClaim,
    });
    expectAtMostOneStart(rejectedOrdinary);
    expect(recoveryBatch(rejectedOrdinary).messages).toStrictEqual([message("ordinary-1")]);
    recoveryOwner.add("ordinary-1");
    expect(startClaim(rejectedOrdinary).messages).toStrictEqual([message("ordinary-3")]);
    expect(queue.view()).toMatchObject({
      ordinary: [],
      hasPendingStart: true,
      pendingSteerCount: 0,
      rejectedSteerCount: 0,
    });

    const finalStart = startClaim(rejectedOrdinary);
    queue.settle({ type: "startAccepted", claim: finalStart, turnId: "turn-3" });
    queue.observe({ type: "turnStarted", turnId: "turn-3" });
    serverOwner.add("ordinary-3");
    const interruptedRejected = steerAttempt(
      queue.submit({ intent: "steer", message: message("interrupted-rejected") }),
    );
    queue.settle({ type: "steerNonSteerable", attempt: interruptedRejected });
    queue.submit({ intent: "steer", message: message("interrupted-pending") });
    submit(queue, "interrupted-ordinary");

    const interrupted = complete(queue, "turn-3", "commit-turn-3", "interrupted");
    expect(interrupted.effects.map(({ type }) => type)).toStrictEqual(["recover"]);
    expect(recoveryBatch(interrupted).messages).toStrictEqual([
      message("interrupted-rejected"),
      message("interrupted-pending"),
      message("interrupted-ordinary"),
    ]);
    for (const item of recoveryBatch(interrupted).messages) {
      recoveryOwner.add(item.id);
    }
    expect(queue.view()).toMatchObject({
      ordinary: [],
      hasPendingStart: false,
      pendingSteerCount: 0,
      rejectedSteerCount: 0,
    });

    const allOwners = [...serverOwner, ...recoveryOwner, ...deletedOwner];
    expect(new Set(allOwners).size).toBe(allOwners.length);
    expect(new Set(allOwners)).toStrictEqual(
      new Set([
        "server-1",
        "rejected-1",
        "ordinary-1",
        "ordinary-2",
        "ordinary-3",
        "interrupted-rejected",
        "interrupted-pending",
        "interrupted-ordinary",
      ]),
    );
  });
});
