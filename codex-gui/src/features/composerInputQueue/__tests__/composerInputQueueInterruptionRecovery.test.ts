import { describe, expect, it } from "vitest";

import {
  createComposerInputQueue,
  type ComposerInputQueue,
  type ComposerInputQueueView,
  type ComposerInputQueueTransition,
  type ComposerQueueMessage,
  type ComposerPendingInputLane,
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
});
