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
