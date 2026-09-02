import { describe, expect, it } from "vitest";

import {
  createComposerInputQueue,
  type ComposerInputQueue,
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

describe("composer input queue", () => {
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
