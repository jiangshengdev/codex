import { describe, expect, it } from "vitest";

import {
  createComposerInputQueue,
  type ComposerInputQueue,
  type ComposerInputQueueTransition,
  type ComposerQueueMessage,
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

describe("composer input queue", () => {
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
});
