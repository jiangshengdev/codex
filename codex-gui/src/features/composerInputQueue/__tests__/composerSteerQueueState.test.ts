import { describe, expect, it } from "vitest";

import {
  createComposerSteerQueue,
  type ComposerSteerQueue,
  type EnqueueSteerInput,
  type RejectedSteerTransfer,
  type SteerClaim,
  type SteerIntent,
  type SteerQueueSlot,
  type SteerRecoveryTransfer,
} from "../composerSteerQueueState";
import { composerSteerInput } from "./composerInputQueueTestFixtures";

const steerInput = (messageId: string, expectedTurnId = "turn-a"): EnqueueSteerInput =>
  composerSteerInput(messageId, expectedTurnId);

function enqueue(queue: ComposerSteerQueue, messageId: string, expectedTurnId = "turn-a"): void {
  expect(
    queue.transition({ type: "enqueue", input: steerInput(messageId, expectedTurnId) }),
  ).toEqual({ type: "enqueued", messageId });
}

function issue(queue: ComposerSteerQueue): SteerClaim {
  const result = queue.transition({ type: "issueNext" });
  expect(result.type).toBe("issued");
  if (result.type !== "issued") {
    throw new Error("expected an issued steer claim");
  }
  return result.claim;
}

function accept(queue: ComposerSteerQueue, claim: SteerClaim): void {
  expect(
    queue.transition({
      type: "responseAccepted",
      claim,
      turnId: claim.intent.expectedTurnId,
    }),
  ).toEqual({ type: "accepted", messageId: claim.intent.message.id });
}

function slotIntent(slot: SteerQueueSlot): SteerIntent {
  return slot.type === "intent" ? slot : slot.original;
}

function assertSteerInputIsDeepReadonly(input: SteerIntent["message"]["input"]): void {
  // @ts-expect-error steer input array ownership is readonly
  input[0] = input[0];
  const item = input[0];
  if (item?.type === "text") {
    // @ts-expect-error generated item fields are recursively readonly
    item.text = "replacement";
    const textElement = item.text_elements[0];
    if (textElement != null) {
      // @ts-expect-error nested generated arrays are recursively readonly
      item.text_elements[0] = textElement;
      // @ts-expect-error nested generated object fields are recursively readonly
      textElement.byteRange.start = 1;
    }
  }
}

void assertSteerInputIsDeepReadonly;

function assertTransferCapabilitiesCannotBeForged(): void {
  // @ts-expect-error rejected transfers require the state-private capability brand
  const rejected: RejectedSteerTransfer = { entries: [] };
  // @ts-expect-error recovery transfers require the state-private capability brand
  const recovery: SteerRecoveryTransfer = { intents: [] };
  void rejected;
  void recovery;
}

void assertTransferCapabilitiesCannotBeForged;

describe("composer steer queue state", () => {
  it.each([
    ["head", 0],
    ["middle", 1],
    ["tail", 2],
  ] as const)("keeps a %s edit reservation in its exact FIFO slot", (_position, index) => {
    const queue = createComposerSteerQueue();
    enqueue(queue, "a");
    enqueue(queue, "b");
    enqueue(queue, "c");
    const messageId = ["a", "b", "c"][index];
    if (messageId == null) throw new Error("expected steer edit target");

    const acquired = queue.acquirePendingInputEdit(messageId);
    if (acquired.type !== "acquired") throw new Error("expected steer acquisition");
    const reservation = queue.reservePendingInputEdit(acquired.acquisition);
    if (reservation == null) throw new Error("expected steer reservation");

    expect(queue.pendingInputCount()).toBe(3);
    expect(queue.overview().queuedCount).toBe(3);
    expect(queue.readPendingInputs(0, 3).map(({ messageId: id }) => id)).toEqual(["a", "b", "c"]);
    expect(queue.readPendingInputs(0, 3).map(({ management }) => management)).toEqual(
      [{ type: "manageable" }, { type: "manageable" }, { type: "manageable" }].with(index, {
        type: "editing",
      }),
    );
    for (let earlier = 0; earlier < index; earlier += 1) {
      const claim = issue(queue);
      accept(queue, claim);
    }
    expect(queue.transition({ type: "issueNext" })).toEqual({
      type: "blocked",
      phase: "editReservation",
    });
    expect(queue.cancelPendingInputEdit(reservation)).toEqual({ type: "settled" });
    expect(issue(queue).intent.message.id).toBe(messageId);
  });

  it("saves only steer content while preserving every delivery identity", () => {
    const queue = createComposerSteerQueue();
    enqueue(queue, "edited");
    const original = queue.state().steerQueue[0];
    if (original?.type !== "intent") throw new Error("expected original steer intent");
    const acquired = queue.acquirePendingInputEdit("edited");
    if (acquired.type !== "acquired") throw new Error("expected steer acquisition");
    const reservation = queue.reservePendingInputEdit(acquired.acquisition);
    if (reservation == null) throw new Error("expected steer reservation");
    const replacement = steerInput("replacement").message;

    expect(queue.savePendingInputEdit(reservation, replacement)).toEqual({ type: "settled" });
    const saved = issue(queue).intent;
    expect(saved).toEqual({
      ...original,
      message: {
        ...original.message,
        draft: replacement.draft,
        input: replacement.input,
      },
    });
    expect(saved.message.input).not.toBe(replacement.input);
    expect(queue.cancelPendingInputEdit(reservation)).toEqual({ type: "unavailable" });
    expect(queue.transition({ type: "terminal", threadId: "thread-a", turnId: "turn-a" })).toEqual({
      type: "terminal",
      messageIds: ["edited"],
    });
    expect(queue.state().rejectedSteersQueue[0]?.intent).toBe(saved);
    expect(queue.state().rejectedSteersQueue[0]?.intent.message).toEqual(saved.message);
  });

  it("preserves saved steer order and identity when its queued target closes", () => {
    const queue = createComposerSteerQueue();
    enqueue(queue, "edited");
    enqueue(queue, "successor");
    const original = queue.state().steerQueue[0];
    if (original?.type !== "intent") throw new Error("expected original steer intent");
    const acquired = queue.acquirePendingInputEdit("edited");
    if (acquired.type !== "acquired") throw new Error("expected steer acquisition");
    const reservation = queue.reservePendingInputEdit(acquired.acquisition);
    if (reservation == null) throw new Error("expected steer reservation");
    const replacement = steerInput("replacement").message;
    expect(queue.savePendingInputEdit(reservation, replacement)).toEqual({ type: "settled" });

    expect(queue.transition({ type: "terminal", threadId: "thread-a", turnId: "turn-a" })).toEqual({
      type: "terminal",
      messageIds: ["edited", "successor"],
    });
    const rejected = queue.state().rejectedSteersQueue;
    expect(rejected.map(({ intent }) => intent.message.id)).toEqual(["edited", "successor"]);
    expect(rejected[0]?.intent).toEqual({
      ...original,
      message: {
        ...original.message,
        draft: replacement.draft,
        input: replacement.input,
      },
    });
    expect(rejected[0]?.intent.threadId).toBe(original.threadId);
    expect(rejected[0]?.intent.expectedTurnId).toBe(original.expectedTurnId);
    expect(rejected[0]?.intent.clientUserMessageId).toBe(original.clientUserMessageId);
    expect(rejected[0]?.intent.source).toBe(original.source);
  });

  it.each([
    "issuing",
    "acceptedAwaitingCommit",
    "deliveryUnknown",
    "responseTurnMismatch",
  ] as const)("keeps a %s pending steer read-only", (phase) => {
    const queue = createComposerSteerQueue();
    enqueue(queue, phase);
    const claim = issue(queue);
    if (phase === "acceptedAwaitingCommit") {
      accept(queue, claim);
    } else if (phase === "deliveryUnknown") {
      queue.transition({ type: "deliveryUnknown", claim });
    } else if (phase === "responseTurnMismatch") {
      queue.transition({ type: "responseAccepted", claim, turnId: "turn-other" });
    }

    expect(queue.findPendingInput(phase)?.management).toEqual({
      type: "readOnly",
      reason: "deliveryInProgress",
    });
    expect(queue.acquirePendingInputEdit(phase)).toEqual({ type: "notManageable" });
    expect(queue.deletePendingInput(phase)).toEqual({ type: "notManageable" });
  });

  it.each(["terminal", "activeTurnNotSteerable"] as const)(
    "invalidates a reserved target on %s and rejects the untouched original in order",
    (closure) => {
      const queue = createComposerSteerQueue();
      enqueue(queue, "pending");
      enqueue(queue, "edited");
      enqueue(queue, "successor");
      const pending = issue(queue);
      const acquired = queue.acquirePendingInputEdit("edited");
      if (acquired.type !== "acquired") throw new Error("expected steer acquisition");
      const reservation = queue.reservePendingInputEdit(acquired.acquisition);
      if (reservation == null) throw new Error("expected steer reservation");

      const result =
        closure === "terminal"
          ? queue.transition({ type: "terminal", threadId: "thread-a", turnId: "turn-a" })
          : queue.transition({ type: "activeTurnNotSteerable", claim: pending });
      expect(result).toMatchObject({
        type: closure === "terminal" ? "terminal" : "rejected",
        messageIds: ["pending", "edited", "successor"],
        editInvalidations: [
          {
            messageId: "edited",
            owner: reservation.owner,
            reason: closure === "terminal" ? "terminal" : "activeTurnNotSteerable",
          },
        ],
      });
      expect(queue.state().rejectedSteersQueue.map(({ intent }) => intent.message.id)).toEqual([
        "pending",
        "edited",
        "successor",
      ]);
      expect(queue.state().rejectedSteersQueue[1]?.intent).toBe(reservation.original);
      expect(queue.savePendingInputEdit(reservation, steerInput("late").message)).toEqual({
        type: "unavailable",
      });
      expect(queue.cancelPendingInputEdit(reservation)).toEqual({ type: "unavailable" });
    },
  );

  it("restores a definitely-failed steer before a reservation without crossing it", () => {
    const queue = createComposerSteerQueue();
    enqueue(queue, "failed");
    enqueue(queue, "edited");
    enqueue(queue, "successor");
    const failed = issue(queue);
    const acquired = queue.acquirePendingInputEdit("edited");
    if (acquired.type !== "acquired") throw new Error("expected steer acquisition");
    const reservation = queue.reservePendingInputEdit(acquired.acquisition);
    if (reservation == null) throw new Error("expected steer reservation");
    const recovery = queue.transition({ type: "definitelyNotAccepted", claim: failed });
    if (recovery.type !== "recoveryRequired") throw new Error("expected steer recovery");

    expect(queue.transition({ type: "restoreRecovery", transfer: recovery.transfer })).toEqual({
      type: "recoveryRestored",
      messageIds: ["failed"],
    });
    const retried = issue(queue);
    expect(retried.intent.message.id).toBe("failed");
    accept(queue, retried);
    expect(queue.transition({ type: "issueNext" })).toEqual({
      type: "blocked",
      phase: "editReservation",
    });
    expect(queue.cancelPendingInputEdit(reservation)).toEqual({ type: "settled" });
    expect(issue(queue).intent.message.id).toBe("edited");
  });

  it("rejects recovery ownership whose target closed before restore", () => {
    const queue = createComposerSteerQueue();
    enqueue(queue, "failed");
    enqueue(queue, "other", "turn-b");
    const failed = issue(queue);
    const recovery = queue.transition({ type: "definitelyNotAccepted", claim: failed });
    if (recovery.type !== "recoveryRequired") throw new Error("expected steer recovery");
    expect(queue.transition({ type: "terminal", threadId: "thread-a", turnId: "turn-a" })).toEqual({
      type: "terminal",
      messageIds: [],
    });

    expect(queue.transition({ type: "restoreRecovery", transfer: recovery.transfer })).toEqual({
      type: "recoveryRestored",
      messageIds: [],
      rejectedMessageIds: ["failed"],
    });
    expect(queue.state().rejectedSteersQueue).toMatchObject([
      { intent: { message: { id: "failed" } }, reason: "terminal" },
    ]);
    expect(issue(queue).intent.message.id).toBe("other");
  });

  it("restores a failed steer before its reserved original and successor in a closed target", () => {
    const queue = createComposerSteerQueue();
    enqueue(queue, "failed");
    enqueue(queue, "edited");
    enqueue(queue, "successor");
    const failed = issue(queue);
    const recovery = queue.transition({ type: "definitelyNotAccepted", claim: failed });
    if (recovery.type !== "recoveryRequired") throw new Error("expected steer recovery");
    const acquired = queue.acquirePendingInputEdit("edited");
    if (acquired.type !== "acquired") throw new Error("expected steer acquisition");
    const reservation = queue.reservePendingInputEdit(acquired.acquisition);
    if (reservation == null) throw new Error("expected steer reservation");
    const temporary = steerInput("temporary").message;

    expect(
      queue.transition({ type: "terminal", threadId: "thread-a", turnId: "turn-a" }),
    ).toMatchObject({
      type: "terminal",
      messageIds: ["edited", "successor"],
      editInvalidations: [{ messageId: "edited", owner: reservation.owner }],
    });
    expect(queue.transition({ type: "restoreRecovery", transfer: recovery.transfer })).toEqual({
      type: "recoveryRestored",
      messageIds: [],
      rejectedMessageIds: ["failed"],
    });
    expect(queue.state().rejectedSteersQueue.map(({ intent }) => intent.message.id)).toEqual([
      "failed",
      "edited",
      "successor",
    ]);
    const rejectedEdited = queue.state().rejectedSteersQueue[1]?.intent;
    expect(rejectedEdited).toBe(reservation.original);
    expect(rejectedEdited?.message).toEqual(steerInput("edited").message);
    expect(rejectedEdited?.message.draft).not.toBe(temporary.draft);
    expect(queue.savePendingInputEdit(reservation, temporary)).toEqual({ type: "unavailable" });
    expect(queue.transition({ type: "restoreRecovery", transfer: recovery.transfer })).toEqual({
      type: "ownershipMismatch",
      subject: "recoveryTransfer",
    });
    expect(queue.state().rejectedSteersQueue.map(({ intent }) => intent.message.id)).toEqual([
      "failed",
      "edited",
      "successor",
    ]);
  });

  it("orders multiple closed recovery transfers by their original FIFO even when restored backward", () => {
    const queue = createComposerSteerQueue();
    enqueue(queue, "failed-a");
    enqueue(queue, "failed-b");
    enqueue(queue, "successor");
    const failedA = issue(queue);
    const recoveryA = queue.transition({ type: "definitelyNotAccepted", claim: failedA });
    if (recoveryA.type !== "recoveryRequired") throw new Error("expected first recovery");
    const failedB = issue(queue);
    const recoveryB = queue.transition({ type: "definitelyNotAccepted", claim: failedB });
    if (recoveryB.type !== "recoveryRequired") throw new Error("expected second recovery");
    queue.transition({ type: "terminal", threadId: "thread-a", turnId: "turn-a" });
    const rejected = queue.transition({ type: "takeRejected" });
    if (rejected.type !== "rejectedTaken") throw new Error("expected rejected transfer");

    queue.transition({ type: "restoreRecovery", transfer: recoveryB.transfer });
    queue.transition({ type: "restoreRecovery", transfer: recoveryA.transfer });
    queue.transition({ type: "restoreRejected", transfer: rejected.transfer });
    expect(queue.state().rejectedSteersQueue.map(({ intent }) => intent.message.id)).toEqual([
      "failed-a",
      "failed-b",
      "successor",
    ]);
  });

  it("moves each entry through the steer, pending, and rejected FIFOs exactly once", () => {
    const queue = createComposerSteerQueue();
    enqueue(queue, "a");
    enqueue(queue, "b");
    enqueue(queue, "c");

    const first = issue(queue);
    accept(queue, first);
    const second = issue(queue);

    expect(queue.state().steerQueue.map((slot) => slotIntent(slot).message.id)).toEqual(["c"]);
    expect(queue.state().pendingSteers.map(({ claim }) => claim.intent.message.id)).toEqual([
      "a",
      "b",
    ]);

    expect(queue.transition({ type: "activeTurnNotSteerable", claim: second })).toEqual({
      type: "rejected",
      reason: "activeTurnNotSteerable",
      messageIds: ["a", "b", "c"],
    });
    expect(queue.state()).toMatchObject({ steerQueue: [], pendingSteers: [] });
    expect(queue.state().rejectedSteersQueue.map(({ intent }) => intent.message.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("releases only the pending entry with matching thread, turn, and client identity", () => {
    const queue = createComposerSteerQueue();
    enqueue(queue, "a");
    enqueue(queue, "b");
    const first = issue(queue);
    accept(queue, first);
    const second = issue(queue);
    accept(queue, second);

    expect(
      queue.transition({
        type: "committed",
        threadId: first.intent.threadId,
        turnId: first.intent.expectedTurnId,
        clientUserMessageId: second.intent.clientUserMessageId,
      }),
    ).toEqual({ type: "committed", messageId: "b" });
    expect(queue.state().pendingSteers.map(({ claim }) => claim.intent.message.id)).toEqual(["a"]);

    expect(
      queue.transition({
        type: "committed",
        threadId: "thread-other",
        turnId: first.intent.expectedTurnId,
        clientUserMessageId: first.intent.clientUserMessageId,
      }),
    ).toEqual({ type: "ownershipMismatch", subject: "committedMessage" });
    expect(queue.state().pendingSteers.map(({ claim }) => claim.intent.message.id)).toEqual(["a"]);
  });

  it("appends terminal pending entries before unsent entries without disturbing other targets", () => {
    const queue = createComposerSteerQueue();
    enqueue(queue, "a");
    enqueue(queue, "b");
    enqueue(queue, "other", "turn-b");
    const first = issue(queue);
    accept(queue, first);
    const second = issue(queue);
    accept(queue, second);

    enqueue(queue, "c");
    expect(queue.transition({ type: "terminal", threadId: "thread-a", turnId: "turn-a" })).toEqual({
      type: "terminal",
      messageIds: ["a", "b", "c"],
    });
    expect(queue.state().rejectedSteersQueue.map(({ intent }) => intent.message.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
    expect(queue.state().steerQueue.map((slot) => slotIntent(slot).message.id)).toEqual(["other"]);
  });

  it("keeps a terminal target closed and directly rejects every later enqueue with its reason", () => {
    const queue = createComposerSteerQueue();

    expect(queue.transition({ type: "terminal", threadId: "thread-a", turnId: "turn-a" })).toEqual({
      type: "terminal",
      messageIds: [],
    });
    expect(queue.transition({ type: "enqueue", input: steerInput("late-terminal") })).toEqual({
      type: "rejected",
      reason: "terminal",
      messageIds: ["late-terminal"],
    });
    expect(queue.transition({ type: "issueNext" })).toEqual({ type: "empty" });
    expect(queue.state().rejectedSteersQueue).toMatchObject([
      { intent: { message: { id: "late-terminal" } }, reason: "terminal" },
    ]);
  });

  it("batch rejects only the first non-steerable claim target and never issues it again", () => {
    const queue = createComposerSteerQueue();
    enqueue(queue, "accepted-a");
    enqueue(queue, "issuing-a");
    enqueue(queue, "queued-b", "turn-b");
    enqueue(queue, "queued-a");
    const accepted = issue(queue);
    accept(queue, accepted);
    const rejected = issue(queue);

    expect(queue.transition({ type: "activeTurnNotSteerable", claim: rejected })).toEqual({
      type: "rejected",
      reason: "activeTurnNotSteerable",
      messageIds: ["accepted-a", "issuing-a", "queued-a"],
    });
    const next = issue(queue);
    expect(next.intent.message.id).toBe("queued-b");
    expect(queue.transition({ type: "issueNext" })).toEqual({ type: "blocked", phase: "issuing" });

    queue.transition({ type: "terminal", threadId: "thread-a", turnId: "turn-a" });
    expect(queue.transition({ type: "enqueue", input: steerInput("late-a") })).toEqual({
      type: "rejected",
      reason: "activeTurnNotSteerable",
      messageIds: ["late-a"],
    });
    expect(queue.state().steerQueue).toEqual([]);
    expect(queue.state().rejectedSteersQueue.map(({ intent }) => intent.message.id)).toEqual([
      "accepted-a",
      "issuing-a",
      "queued-a",
      "late-a",
    ]);
  });

  it("keeps a mismatched response pending and blocks every successor", () => {
    const queue = createComposerSteerQueue();
    enqueue(queue, "a");
    enqueue(queue, "b");
    const claim = issue(queue);

    expect(
      queue.transition({ type: "responseAccepted", claim, turnId: "turn-unexpected" }),
    ).toEqual({
      type: "responseTurnMismatch",
      messageId: "a",
      expectedTurnId: "turn-a",
      responseTurnId: "turn-unexpected",
    });
    expect(queue.transition({ type: "issueNext" })).toEqual({
      type: "blocked",
      phase: "responseTurnMismatch",
    });
    expect(queue.state().pendingSteers[0]?.claim).toBe(claim);
  });

  it("keeps delivery-unknown ownership and blocks every successor without a new claim", () => {
    const queue = createComposerSteerQueue();
    enqueue(queue, "a");
    enqueue(queue, "b");
    const claim = issue(queue);

    expect(queue.transition({ type: "deliveryUnknown", claim })).toEqual({
      type: "deliveryUnknown",
      messageId: "a",
    });
    expect(queue.transition({ type: "issueNext" })).toEqual({
      type: "blocked",
      phase: "deliveryUnknown",
    });
    expect(queue.state().pendingSteers).toEqual([{ claim, phase: "deliveryUnknown" }]);
  });

  it.each(["issuing", "deliveryUnknown", "responseTurnMismatch"] as const)(
    "lets a matching commit release a %s claim before its settlement and ignores the late settlement",
    (phase) => {
      const queue = createComposerSteerQueue();
      enqueue(queue, phase);
      const claim = issue(queue);
      if (phase === "deliveryUnknown") {
        queue.transition({ type: "deliveryUnknown", claim });
      } else if (phase === "responseTurnMismatch") {
        queue.transition({ type: "responseAccepted", claim, turnId: "turn-other" });
      }

      expect(
        queue.transition({
          type: "committed",
          threadId: claim.intent.threadId,
          turnId: claim.intent.expectedTurnId,
          clientUserMessageId: claim.intent.clientUserMessageId,
        }),
      ).toEqual({ type: "committed", messageId: phase });
      expect(queue.state().pendingSteers).toEqual([]);
      expect(
        queue.transition({
          type: "responseAccepted",
          claim,
          turnId: claim.intent.expectedTurnId,
        }),
      ).toEqual({ type: "ownershipMismatch", subject: "steerClaim" });
      expect(queue.state().pendingSteers).toEqual([]);
    },
  );

  it("transfers a generic definite rejection to explicit recovery without calling it rejected", () => {
    const queue = createComposerSteerQueue();
    enqueue(queue, "a");
    const claim = issue(queue);

    const result = queue.transition({ type: "definitelyNotAccepted", claim });
    expect(result.type).toBe("recoveryRequired");
    if (result.type !== "recoveryRequired") throw new Error("expected explicit recovery");
    expect(result.transfer.intents).toEqual([claim.intent]);
    expect(queue.state()).toEqual({
      steerQueue: [],
      pendingSteers: [],
      rejectedSteersQueue: [],
    });
  });

  it("leaves state unchanged when rejected take is repeatedly empty", () => {
    const queue = createComposerSteerQueue();
    const initialState = queue.state();

    expect(queue.transition({ type: "takeRejected" })).toEqual({ type: "empty" });
    expect(queue.transition({ type: "takeRejected" })).toEqual({ type: "empty" });
    expect(queue.state()).toEqual(initialState);
  });

  it("atomically takes rejected entries and restores them at the front in original order", () => {
    const queue = createComposerSteerQueue();
    enqueue(queue, "a");
    enqueue(queue, "b");
    const first = issue(queue);
    expect(queue.transition({ type: "activeTurnNotSteerable", claim: first })).toMatchObject({
      type: "rejected",
      messageIds: ["a", "b"],
    });
    const taken = queue.transition({ type: "takeRejected" });
    expect(taken.type).toBe("rejectedTaken");
    if (taken.type !== "rejectedTaken") throw new Error("expected rejected entries");
    const restoreClone = { ...taken.transfer };
    const releaseClone = { ...taken.transfer };
    expect(taken.transfer.entries.map(({ intent }) => intent.message.id)).toEqual(["a", "b"]);
    expect(queue.state().rejectedSteersQueue).toEqual([]);

    expect(queue.transition({ type: "enqueue", input: steerInput("later", "turn-b") })).toEqual({
      type: "enqueued",
      messageId: "later",
    });
    const later = issue(queue);
    expect(queue.transition({ type: "activeTurnNotSteerable", claim: later })).toMatchObject({
      type: "rejected",
      messageIds: ["later"],
    });
    const laterTaken = queue.transition({ type: "takeRejected" });
    if (laterTaken.type !== "rejectedTaken") throw new Error("expected later rejected entry");
    expect(queue.transition({ type: "restoreRejected", transfer: laterTaken.transfer })).toEqual({
      type: "rejectedRestored",
      messageIds: ["later"],
    });
    const foreign = createComposerSteerQueue();
    expect(foreign.transition({ type: "restoreRejected", transfer: taken.transfer })).toEqual({
      type: "ownershipMismatch",
      subject: "rejectedTransfer",
    });
    expect(foreign.state().rejectedSteersQueue).toEqual([]);

    const tamperedRestore = { ...restoreClone, entries: laterTaken.transfer.entries };
    expect(queue.transition({ type: "restoreRejected", transfer: tamperedRestore })).toEqual({
      type: "rejectedRestored",
      messageIds: ["a", "b"],
    });
    expect(queue.state().rejectedSteersQueue.map(({ intent }) => intent.message.id)).toEqual([
      "a",
      "b",
      "later",
    ]);
    expect(queue.transition({ type: "restoreRejected", transfer: taken.transfer })).toEqual({
      type: "ownershipMismatch",
      subject: "rejectedTransfer",
    });
    expect(queue.transition({ type: "releaseRejected", transfer: releaseClone })).toEqual({
      type: "ownershipMismatch",
      subject: "rejectedTransfer",
    });
    expect(queue.state().rejectedSteersQueue.map(({ intent }) => intent.message.id)).toEqual([
      "a",
      "b",
      "later",
    ]);
  });

  it("consumes a rejected release capability once and never restores it afterward", () => {
    const rejected = createComposerSteerQueue();
    enqueue(rejected, "released");
    const rejectedClaim = issue(rejected);
    rejected.transition({ type: "activeTurnNotSteerable", claim: rejectedClaim });
    const taken = rejected.transition({ type: "takeRejected" });
    if (taken.type !== "rejectedTaken") throw new Error("expected rejected entries");
    const releaseClone = { ...taken.transfer };
    const restoreClone = { ...taken.transfer };
    enqueue(rejected, "retained", "turn-b");
    const retainedClaim = issue(rejected);
    rejected.transition({ type: "activeTurnNotSteerable", claim: retainedClaim });
    const retainedTaken = rejected.transition({ type: "takeRejected" });
    if (retainedTaken.type !== "rejectedTaken") throw new Error("expected retained entry");
    expect(
      rejected.transition({ type: "restoreRejected", transfer: retainedTaken.transfer }),
    ).toEqual({ type: "rejectedRestored", messageIds: ["retained"] });
    const tamperedRelease = { ...taken.transfer, entries: retainedTaken.transfer.entries };
    expect(rejected.transition({ type: "releaseRejected", transfer: tamperedRelease })).toEqual({
      type: "rejectedReleased",
      messageIds: ["released"],
    });
    expect(rejected.transition({ type: "releaseRejected", transfer: releaseClone })).toEqual({
      type: "ownershipMismatch",
      subject: "rejectedTransfer",
    });
    expect(rejected.transition({ type: "restoreRejected", transfer: restoreClone })).toEqual({
      type: "ownershipMismatch",
      subject: "rejectedTransfer",
    });
    expect(
      rejected.transition({ type: "enqueue", input: steerInput("released", "turn-c") }),
    ).toEqual({
      type: "enqueued",
      messageId: "released",
    });
    expect(
      rejected.transition({ type: "enqueue", input: steerInput("retained", "turn-c") }),
    ).toEqual({
      type: "duplicateIdentity",
      messageId: "retained",
    });
    expect(rejected.state().rejectedSteersQueue).toMatchObject([
      { intent: { message: { id: "retained" } } },
    ]);
  });

  it("restores a generic recovery capability only in its owner and only once", () => {
    const recovery = createComposerSteerQueue();
    enqueue(recovery, "recovery");
    const recoveryClaim = issue(recovery);
    const required = recovery.transition({ type: "definitelyNotAccepted", claim: recoveryClaim });
    if (required.type !== "recoveryRequired") throw new Error("expected explicit recovery");
    const recoveryClone = { ...required.transfer };
    enqueue(recovery, "other");
    const otherClaim = issue(recovery);
    const otherRequired = recovery.transition({ type: "definitelyNotAccepted", claim: otherClaim });
    if (otherRequired.type !== "recoveryRequired") throw new Error("expected other recovery");
    expect(
      recovery.transition({ type: "restoreRecovery", transfer: otherRequired.transfer }),
    ).toEqual({ type: "recoveryRestored", messageIds: ["other"] });
    const foreign = createComposerSteerQueue();
    expect(foreign.transition({ type: "restoreRecovery", transfer: required.transfer })).toEqual({
      type: "ownershipMismatch",
      subject: "recoveryTransfer",
    });
    expect(foreign.state().steerQueue).toEqual([]);

    const tamperedRecovery = { ...recoveryClone, intents: otherRequired.transfer.intents };
    expect(recovery.transition({ type: "restoreRecovery", transfer: tamperedRecovery })).toEqual({
      type: "recoveryRestored",
      messageIds: ["recovery"],
    });
    expect(recovery.transition({ type: "restoreRecovery", transfer: required.transfer })).toEqual({
      type: "ownershipMismatch",
      subject: "recoveryTransfer",
    });
    expect(recovery.state().steerQueue.map((slot) => slotIntent(slot).message.id)).toEqual([
      "recovery",
      "other",
    ]);
    const restored = issue(recovery);
    expect(restored.intent).toBe(required.transfer.intents[0]);
    expect(restored.intent).toEqual(required.transfer.intents[0]);
  });

  it("owns the complete captured message independently of the enqueue container", () => {
    const queue = createComposerSteerQueue();
    const input = steerInput("skill");

    queue.transition({ type: "enqueue", input });
    const queuedIntent = queue.state().steerQueue[0];
    if (queuedIntent?.type !== "intent") throw new Error("expected queued steer intent");
    expect(queuedIntent.message).toEqual(input.message);
    expect(queuedIntent.message).not.toBe(input.message);
    expect(queuedIntent.message.draft).toBe(input.message.draft);
    expect(queuedIntent.message.input).not.toBe(input.message.input);
    const claim = issue(queue);
    accept(queue, claim);
    queue.transition({ type: "terminal", threadId: "thread-a", turnId: "turn-a" });

    expect(queue.state().rejectedSteersQueue[0]?.intent).toEqual(claim.intent);
  });

  it("reads a bounded pending-then-queued window without exposing rejected entries", () => {
    const queue = createComposerSteerQueue();
    enqueue(queue, "a");
    enqueue(queue, "b");
    enqueue(queue, "c");
    const first = issue(queue);
    accept(queue, first);
    issue(queue);

    expect(queue.pendingInputCount()).toBe(3);
    expect(queue.readPendingInputs(0, 2).map(({ messageId }) => messageId)).toEqual(["a", "b"]);
    expect(queue.readPendingInputs(2, 2).map(({ messageId }) => messageId)).toEqual(["c"]);
    expect(queue.findPendingInput("b")?.input).toEqual(steerInput("b").message.input);

    queue.transition({ type: "terminal", threadId: "thread-a", turnId: "turn-a" });
    expect(queue.pendingInputCount()).toBe(0);
    expect(queue.readPendingInputs(0, 2)).toEqual([]);
    expect(queue.findPendingInput("a")).toBeNull();
  });
});
