import { describe, expect, it } from "vitest";
import type { TurnSteerParams } from "@codex-protocol/v2";

import {
  createComposerSteerQueue,
  type ComposerSteerQueue,
  type EnqueueSteerInput,
  type RejectedSteerTransfer,
  type SteerClaim,
  type SteerIntent,
  type SteerRecoveryTransfer,
} from "../composerSteerQueueState";

const steerInput = (messageId: string, expectedTurnId = "turn-a"): EnqueueSteerInput => ({
  messageId,
  threadId: "thread-a",
  expectedTurnId,
  input: [
    { type: "text", text: `message ${messageId}`, text_elements: [] },
    { type: "skill", name: `skill-${messageId}`, path: `/skills/${messageId}/SKILL.md` },
  ],
  source: "direct",
});

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
  ).toEqual({ type: "accepted", messageId: claim.intent.messageId });
}

function assertSteerInputIsDeepReadonly(input: SteerIntent["input"]): void {
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
  it("moves each entry through the steer, pending, and rejected FIFOs exactly once", () => {
    const queue = createComposerSteerQueue();
    enqueue(queue, "a");
    enqueue(queue, "b");
    enqueue(queue, "c");

    const first = issue(queue);
    accept(queue, first);
    const second = issue(queue);

    expect(queue.state().steerQueue.map(({ messageId }) => messageId)).toEqual(["c"]);
    expect(queue.state().pendingSteers.map(({ claim }) => claim.intent.messageId)).toEqual([
      "a",
      "b",
    ]);

    expect(queue.transition({ type: "activeTurnNotSteerable", claim: second })).toEqual({
      type: "rejected",
      reason: "activeTurnNotSteerable",
      messageIds: ["a", "b", "c"],
    });
    expect(queue.state()).toMatchObject({ steerQueue: [], pendingSteers: [] });
    expect(queue.state().rejectedSteersQueue.map(({ intent }) => intent.messageId)).toEqual([
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
    expect(queue.state().pendingSteers.map(({ claim }) => claim.intent.messageId)).toEqual(["a"]);

    expect(
      queue.transition({
        type: "committed",
        threadId: "thread-other",
        turnId: first.intent.expectedTurnId,
        clientUserMessageId: first.intent.clientUserMessageId,
      }),
    ).toEqual({ type: "ownershipMismatch", subject: "committedMessage" });
    expect(queue.state().pendingSteers.map(({ claim }) => claim.intent.messageId)).toEqual(["a"]);
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
    expect(queue.state().rejectedSteersQueue.map(({ intent }) => intent.messageId)).toEqual([
      "a",
      "b",
      "c",
    ]);
    expect(queue.state().steerQueue.map(({ messageId }) => messageId)).toEqual(["other"]);
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
      { intent: { messageId: "late-terminal" }, reason: "terminal" },
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
    expect(next.intent.messageId).toBe("queued-b");
    expect(queue.transition({ type: "issueNext" })).toEqual({ type: "blocked", phase: "issuing" });

    queue.transition({ type: "terminal", threadId: "thread-a", turnId: "turn-a" });
    expect(queue.transition({ type: "enqueue", input: steerInput("late-a") })).toEqual({
      type: "rejected",
      reason: "activeTurnNotSteerable",
      messageIds: ["late-a"],
    });
    expect(queue.state().steerQueue).toEqual([]);
    expect(queue.state().rejectedSteersQueue.map(({ intent }) => intent.messageId)).toEqual([
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
    expect(taken.transfer.entries.map(({ intent }) => intent.messageId)).toEqual(["a", "b"]);
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
    expect(queue.state().rejectedSteersQueue.map(({ intent }) => intent.messageId)).toEqual([
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
    expect(queue.state().rejectedSteersQueue.map(({ intent }) => intent.messageId)).toEqual([
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
      { intent: { messageId: "retained" } },
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
    expect(recovery.state().steerQueue.map(({ messageId }) => messageId)).toEqual([
      "recovery",
      "other",
    ]);
    const restored = issue(recovery);
    expect(restored.intent).toBe(required.transfer.intents[0]);
    expect(restored.intent).toMatchObject({
      messageId: "recovery",
      threadId: "thread-a",
      expectedTurnId: "turn-a",
      clientUserMessageId: recoveryClaim.intent.clientUserMessageId,
      source: "direct",
    });
  });

  it("preserves the captured structured skill payload independently of the caller array", () => {
    const queue = createComposerSteerQueue();
    const input = steerInput("skill");
    const callerInput: TurnSteerParams["input"] = [
      { type: "text", text: "message skill", text_elements: [] },
      { type: "skill", name: "skill-skill", path: "/skills/skill/SKILL.md" },
    ];

    queue.transition({ type: "enqueue", input: { ...input, input: callerInput } });
    const callerText = callerInput[0];
    if (callerText?.type === "text") {
      callerText.text = "mutated text";
      callerText.text_elements.push({ byteRange: { start: 0, end: 1 }, placeholder: "x" });
    }
    const callerSkill = callerInput[1];
    if (callerSkill?.type === "skill") {
      callerSkill.path = "/mutated/SKILL.md";
    }
    callerInput.splice(0, callerInput.length);
    const claim = issue(queue);
    accept(queue, claim);
    queue.transition({ type: "terminal", threadId: "thread-a", turnId: "turn-a" });

    expect(queue.state().rejectedSteersQueue[0]?.intent.input).toEqual([
      { type: "text", text: "message skill", text_elements: [] },
      { type: "skill", name: "skill-skill", path: "/skills/skill/SKILL.md" },
    ]);
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
    expect(queue.findPendingInput("b")?.input).toEqual(steerInput("b").input);

    queue.transition({ type: "terminal", threadId: "thread-a", turnId: "turn-a" });
    expect(queue.pendingInputCount()).toBe(0);
    expect(queue.readPendingInputs(0, 2)).toEqual([]);
    expect(queue.findPendingInput("a")).toBeNull();
  });
});
