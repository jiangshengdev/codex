import { describe, expect, it } from "vitest";

import {
  COMPOSER_PENDING_INPUT_MAX_PAGE_SIZE,
  createComposerInputQueue,
  type ComposerInputQueue,
  type ComposerInputQueueTransition,
  type ComposerQueueMessage,
  type ComposerPendingInputLane,
} from "../composerInputQueue";
import { composerDraftCapture, composerQueueMessage } from "./composerInputQueueTestFixtures";

const message = (id: string): ComposerQueueMessage => composerQueueMessage(id);

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
  it("pages ordinary inputs with an owner-enforced bound and opaque stable display keys", () => {
    const queue = createComposerInputQueue({ threadId: "thread-1", activeTurnId: "turn-1" });
    for (let index = 0; index < COMPOSER_PENDING_INPUT_MAX_PAGE_SIZE + 3; index += 1) {
      submit(queue, `ordinary-${String(index)}`);
    }
    const revision = queue.detailRevision();
    const first = queue.readPendingInputPage({
      lane: "ordinary",
      revision,
      cursor: null,
      limit: COMPOSER_PENDING_INPUT_MAX_PAGE_SIZE + 100,
    });
    expect(first.type).toBe("page");
    if (first.type !== "page") throw new Error("expected ordinary detail page");
    expect(first.items).toHaveLength(COMPOSER_PENDING_INPUT_MAX_PAGE_SIZE);
    expect(first.items.map(({ preview }) => preview)).toEqual(
      Array.from({ length: COMPOSER_PENDING_INPUT_MAX_PAGE_SIZE }, (_, index) => ({
        type: "text",
        text: `message ordinary-${String(index)}`,
        truncated: false,
      })),
    );
    expect(first.items.every(({ key }) => !key.includes("ordinary-"))).toBe(true);
    expect(JSON.stringify(first)).not.toContain("/example/skills/");
    expect(JSON.stringify(first)).not.toContain('"input"');
    expect(first.nextCursor).not.toBeNull();

    const second = queue.readPendingInputPage({
      lane: "ordinary",
      revision,
      cursor: first.nextCursor,
      limit: COMPOSER_PENDING_INPUT_MAX_PAGE_SIZE + 100,
    });
    expect(second).toMatchObject({
      type: "page",
      items: [
        { preview: { type: "text", text: "message ordinary-20", truncated: false } },
        { preview: { type: "text", text: "message ordinary-21", truncated: false } },
        { preview: { type: "text", text: "message ordinary-22", truncated: false } },
      ],
      nextCursor: null,
    });
  });

  it("reads steer inputs pending-before-queued and returns current full text by display key", () => {
    const queue = createComposerInputQueue({ threadId: "thread-1", activeTurnId: "turn-1" });
    const longText = "👩‍💻".repeat(161);
    const longCapture = composerDraftCapture(`  ${longText}  `);
    queue.submitSteer({
      type: "recoverable",
      id: "a",
      draft: longCapture.draft,
      input: longCapture.input,
    });
    queue.submitSteer(message("b"));
    const revision = queue.detailRevision();
    const page = queue.readPendingInputPage({ lane: "steer", revision, cursor: null, limit: 10 });
    expect(page.type).toBe("page");
    if (page.type !== "page") throw new Error("expected steer detail page");
    expect(page.items.map(({ preview }) => preview)).toEqual([
      { type: "text", text: `${"👩‍💻".repeat(157)}...`, truncated: true },
      { type: "text", text: "message b", truncated: false },
    ]);
    const firstKey = page.items[0]?.key;
    if (firstKey == null) throw new Error("expected first steer display key");
    expect(queue.readPendingInputDetail({ key: firstKey, revision })).toEqual({
      type: "detail",
      key: firstKey,
      revision,
      text: longText,
    });
    expect(JSON.stringify(queue.readPendingInputDetail({ key: firstKey, revision }))).not.toContain(
      "/private/skills/",
    );
    const shortTextKey = page.items[1]?.key;
    if (shortTextKey == null) throw new Error("expected short-text display key");
    expect(queue.readPendingInputDetail({ key: shortTextKey, revision })).toEqual({
      type: "missing",
      revision,
    });

    queue.observe({
      type: "turnCompleted",
      turnId: "turn-1",
      status: "completed",
      commitId: "terminal",
    });
    expect(
      queue.readPendingInputDetail({ key: firstKey, revision: queue.detailRevision() }),
    ).toEqual({ type: "missing", revision: queue.detailRevision() });
  });

  it("invalidates cursors across promotion, steer issue, commit, and terminal transitions", () => {
    const queue = createComposerInputQueue({ threadId: "thread-1", activeTurnId: "turn-1" });
    submit(queue, "a");
    submit(queue, "b");
    submit(queue, "d");
    const beforePromotionRevision = queue.detailRevision();
    const beforePromotion = pendingPage(queue, "ordinary", 1);
    const promotedKey = beforePromotion.items[0]?.key;
    if (promotedKey == null || beforePromotion.nextCursor == null) {
      throw new Error("expected ordinary promotion cursor");
    }

    const promoted = queue.promoteOrdinaryFrontToSteer();
    const promotedEffect = promoted.effects[0];
    if (promotedEffect?.type !== "performSteer") throw new Error("expected promoted steer claim");
    expect(
      queue.readPendingInputPage({
        lane: "ordinary",
        revision: beforePromotionRevision,
        cursor: beforePromotion.nextCursor,
        limit: 1,
      }),
    ).toEqual({ type: "stale", revision: queue.detailRevision() });
    const afterPromotionOrdinary = pendingPage(queue, "ordinary");
    const afterPromotionSteer = pendingPage(queue, "steer");
    expect(afterPromotionOrdinary.items.map(({ preview }) => preview)).toMatchObject([
      { text: "message b" },
      { text: "message d" },
    ]);
    expect(afterPromotionSteer.items).toMatchObject([{ key: promotedKey }]);
    const ordinaryKeys = afterPromotionOrdinary.items.map(({ key }) => key);

    queue.submitSteer(message("c"));
    const beforeIssueRevision = queue.detailRevision();
    const beforeIssue = pendingPage(queue, "steer", 1);
    const beforeIssueAll = pendingPage(queue, "steer");
    const queuedKey = beforeIssueAll.items[1]?.key;
    if (queuedKey == null || beforeIssue.nextCursor == null) {
      throw new Error("expected queued steer cursor");
    }
    queue.settleSteer({
      type: "accepted",
      claim: promotedEffect.claim,
      turnId: "turn-1",
    });
    expect(
      queue.readPendingInputPage({
        lane: "steer",
        revision: beforeIssueRevision,
        cursor: beforeIssue.nextCursor,
        limit: 1,
      }),
    ).toEqual({ type: "stale", revision: queue.detailRevision() });
    expect(pendingPage(queue, "steer").items).toMatchObject([
      { key: promotedKey },
      { key: queuedKey },
    ]);

    const beforeCommitRevision = queue.detailRevision();
    const beforeCommit = pendingPage(queue, "steer", 1);
    if (beforeCommit.nextCursor == null) throw new Error("expected pre-commit steer cursor");
    queue.observe({
      type: "userMessageCommitted",
      clientId: promotedEffect.claim.intent.clientUserMessageId,
      turnId: "turn-1",
      commitId: "commit-a",
    });
    expect(
      queue.readPendingInputPage({
        lane: "steer",
        revision: beforeCommitRevision,
        cursor: beforeCommit.nextCursor,
        limit: 1,
      }),
    ).toEqual({ type: "stale", revision: queue.detailRevision() });
    expect(pendingPage(queue, "steer").items).toMatchObject([{ key: queuedKey }]);

    const beforeTerminalRevision = queue.detailRevision();
    const beforeTerminal = pendingPage(queue, "ordinary", 1);
    if (beforeTerminal.nextCursor == null) throw new Error("expected pre-terminal ordinary cursor");
    queue.observe({
      type: "turnCompleted",
      turnId: "turn-1",
      status: "completed",
      commitId: "terminal",
    });
    expect(
      queue.readPendingInputPage({
        lane: "ordinary",
        revision: beforeTerminalRevision,
        cursor: beforeTerminal.nextCursor,
        limit: 1,
      }),
    ).toEqual({ type: "stale", revision: queue.detailRevision() });
    expect(pendingPage(queue, "ordinary").items.map(({ key }) => key)).toEqual(ordinaryKeys);
    expect(pendingPage(queue, "steer").items).toEqual([]);
  });

  it("invalidates a cursor when steer recovery restores the original FIFO", () => {
    const queue = createComposerInputQueue({ threadId: "thread-1", activeTurnId: "turn-1" });
    const first = queue.submitSteer(message("r"));
    const firstEffect = first.effects[0];
    if (firstEffect?.type !== "performSteer") throw new Error("expected first steer claim");
    queue.submitSteer(message("s"));
    queue.submitSteer(message("t"));
    const initial = pendingPage(queue, "steer");
    const [initialFirstKey, stableSecondKey, stableThirdKey] = initial.items.map(({ key }) => key);
    const rejected = queue.settleSteer({
      type: "definitelyNotAccepted",
      claim: firstEffect.claim,
    });
    const recovery = rejected.effects[0];
    if (recovery?.type !== "recover" || recovery.batch.reason !== "steerDefinitelyNotAccepted") {
      throw new Error("expected steer recovery transfer");
    }
    const beforeRestoreRevision = queue.detailRevision();
    const beforeRestore = pendingPage(queue, "steer", 1);
    if (beforeRestore.nextCursor == null) throw new Error("expected pre-restore steer cursor");

    queue.restoreSteerRecovery(recovery.batch.transfer);
    expect(
      queue.readPendingInputPage({
        lane: "steer",
        revision: beforeRestoreRevision,
        cursor: beforeRestore.nextCursor,
        limit: 1,
      }),
    ).toEqual({ type: "stale", revision: queue.detailRevision() });
    const restoredKeys = pendingPage(queue, "steer").items.map(({ key }) => key);
    expect(restoredKeys).toHaveLength(3);
    expect(restoredKeys[0]).not.toBe(initialFirstKey);
    expect(restoredKeys.slice(1)).toEqual([stableSecondKey, stableThirdKey]);
  });

  it("invalidates revised and foreign-owner cursors", () => {
    const firstOwner = createComposerInputQueue({ threadId: "thread-1", activeTurnId: "turn-1" });
    const secondOwner = createComposerInputQueue({ threadId: "thread-2", activeTurnId: "turn-2" });
    for (const queue of [firstOwner, secondOwner]) {
      submit(queue, "a");
      submit(queue, "b");
    }
    const revision = firstOwner.detailRevision();
    const firstPage = firstOwner.readPendingInputPage({
      lane: "ordinary",
      revision,
      cursor: null,
      limit: 1,
    });
    expect(firstPage.type).toBe("page");
    if (firstPage.type !== "page" || firstPage.nextCursor == null) {
      throw new Error("expected an ordinary cursor");
    }

    expect(
      secondOwner.readPendingInputPage({
        lane: "ordinary",
        revision: secondOwner.detailRevision(),
        cursor: firstPage.nextCursor,
        limit: 1,
      }),
    ).toEqual({ type: "stale", revision: secondOwner.detailRevision() });

    submit(firstOwner, "c");
    expect(
      firstOwner.readPendingInputPage({
        lane: "ordinary",
        revision,
        cursor: firstPage.nextCursor,
        limit: 1,
      }),
    ).toEqual({ type: "stale", revision: firstOwner.detailRevision() });
  });

  it("projects owner-derived management state for ordinary, queued steer, and pending steer", () => {
    const queue = createComposerInputQueue({ threadId: "thread-1", activeTurnId: "turn-1" });
    submit(queue, "ordinary");
    const issued = queue.submitSteer(message("pending-steer"));
    const issueEffect = issued.effects[0];
    if (issueEffect?.type !== "performSteer") throw new Error("expected pending steer claim");
    queue.submitSteer(message("queued-steer"));

    expect(pendingPage(queue, "ordinary").items).toMatchObject([
      { lane: "ordinary", management: { type: "manageable" } },
    ]);
    expect(pendingPage(queue, "steer").items).toMatchObject([
      {
        lane: "steer",
        management: { type: "readOnly", reason: "deliveryInProgress" },
      },
      { lane: "steer", management: { type: "manageable" } },
    ]);
    const pendingSteerKey = pendingPage(queue, "steer").items[0]?.key;
    if (pendingSteerKey == null) throw new Error("expected pending steer key");
    let restoreCalled = false;
    expect(
      queue.beginPendingInputEdit(
        { key: pendingSteerKey, revision: queue.detailRevision() },
        () => {
          restoreCalled = true;
          return { type: "restored" };
        },
      ),
    ).toEqual({ type: "notManageable", revision: queue.detailRevision() });
    expect(
      queue.deletePendingInput({ key: pendingSteerKey, revision: queue.detailRevision() }),
    ).toEqual({ type: "notManageable", revision: queue.detailRevision() });
    expect(restoreCalled).toBe(false);
  });
});
