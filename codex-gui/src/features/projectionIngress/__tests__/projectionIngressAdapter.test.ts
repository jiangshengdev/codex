import { describe, expect, it } from "vitest";
import {
  attachBaseline,
  attachReplacement,
  closedBackpressure,
  eventItemStarted,
  eventSubscriptionReplacement,
  eventTurnStarted,
} from "@/features/projection/__tests__/projectionFixtures";
import type {
  ThreadProjectionAttachResponse,
  ThreadProjectionClosedNotification,
  ThreadProjectionEventNotification,
  Turn,
} from "@codex-protocol/v2";
import { ProjectionIngressAdapter } from "../projectionIngressAdapter";

const projectionThreadId = attachBaseline.snapshot.thread.id;

const deriveEvent = (
  event: ThreadProjectionEventNotification,
  overrides: Partial<ThreadProjectionEventNotification>,
): ThreadProjectionEventNotification => ({
  ...event,
  ...overrides,
});

const attachWithTurnsAndHead = (
  turns: Turn[],
  headCommitId: string | null,
): ThreadProjectionAttachResponse => ({
  ...attachBaseline,
  snapshot: {
    ...attachBaseline.snapshot,
    headCommitId,
    thread: {
      ...attachBaseline.snapshot.thread,
      turns,
    },
  },
});

const closed = (
  overrides: Partial<ThreadProjectionClosedNotification> = {},
): ThreadProjectionClosedNotification => ({
  ...closedBackpressure,
  ...overrides,
});

describe("ProjectionIngressAdapter", () => {
  it("accepts attach and contiguous projection events", () => {
    const adapter = new ProjectionIngressAdapter(projectionThreadId);

    expect(adapter.handleAttach(attachBaseline)).toStrictEqual({
      type: "attachAccepted",
      response: attachBaseline,
    });
    expect(adapter.handleEvent(eventTurnStarted)).toStrictEqual({
      type: "eventAccepted",
      notification: eventTurnStarted,
    });
  });

  it("ignores wrong-thread events", () => {
    const adapter = new ProjectionIngressAdapter(projectionThreadId);
    adapter.handleAttach(attachBaseline);

    expect(
      adapter.handleEvent(
        deriveEvent(eventTurnStarted, {
          threadId: "00000000-0000-0000-0000-000000000099",
        }),
      ),
    ).toStrictEqual({ type: "ignored", reason: "wrongThread" });
  });

  it("ignores stale subscription events", () => {
    const adapter = new ProjectionIngressAdapter(projectionThreadId);
    adapter.handleAttach(attachBaseline);

    expect(adapter.handleEvent(eventSubscriptionReplacement)).toStrictEqual({
      type: "ignored",
      reason: "staleSubscription",
    });
  });

  it("ignores duplicate latest commit events", () => {
    const adapter = new ProjectionIngressAdapter(projectionThreadId);
    if (eventTurnStarted.event.type !== "turnStarted") {
      throw new Error("fixture must contain a turnStarted projection event");
    }
    const snapshotAtCommit = attachWithTurnsAndHead(
      [eventTurnStarted.event.notification.turn],
      eventTurnStarted.commitId,
    );
    adapter.handleAttach(snapshotAtCommit);

    expect(adapter.handleEvent(eventTurnStarted)).toStrictEqual({
      type: "ignored",
      reason: "duplicateCommit",
    });
  });

  it("accepts contiguous events already represented in the attach snapshot", () => {
    const adapter = new ProjectionIngressAdapter(projectionThreadId);
    if (eventTurnStarted.event.type !== "turnStarted") {
      throw new Error("fixture must contain a turnStarted projection event");
    }
    const snapshotAheadWithOldHead = attachWithTurnsAndHead(
      [eventTurnStarted.event.notification.turn],
      eventTurnStarted.parentCommitId,
    );
    adapter.handleAttach(snapshotAheadWithOldHead);

    expect(adapter.handleEvent(eventTurnStarted)).toStrictEqual({
      type: "eventAccepted",
      notification: eventTurnStarted,
    });
  });

  it("requires manual reconnect when parent commit does not match local head", () => {
    const adapter = new ProjectionIngressAdapter(projectionThreadId);
    adapter.handleAttach(attachBaseline);

    expect(adapter.handleEvent(eventItemStarted)).toStrictEqual({
      type: "manualReconnectRequired",
      reason: "commitChainMismatch",
      threadId: projectionThreadId,
      subscriptionId: attachBaseline.subscriptionId,
    });
  });

  it("requires manual reconnect when an item event is missing its parent turn", () => {
    const adapter = new ProjectionIngressAdapter(projectionThreadId);
    const snapshotWithoutLiveTurn = attachWithTurnsAndHead(
      attachBaseline.snapshot.thread.turns,
      eventTurnStarted.commitId,
    );
    adapter.handleAttach(snapshotWithoutLiveTurn);

    expect(adapter.handleEvent(eventItemStarted)).toStrictEqual({
      type: "manualReconnectRequired",
      reason: "missingTurn",
      threadId: projectionThreadId,
      subscriptionId: attachBaseline.subscriptionId,
    });
  });

  it("ignores later events after manual reconnect is required", () => {
    const adapter = new ProjectionIngressAdapter(projectionThreadId);
    adapter.handleAttach(attachBaseline);
    adapter.handleEvent(eventItemStarted);

    expect(adapter.handleEvent(eventTurnStarted)).toStrictEqual({
      type: "ignored",
      reason: "alreadyRequiresManualReconnect",
    });
  });

  it("resets manual reconnect state after a replacement attach", () => {
    const adapter = new ProjectionIngressAdapter(projectionThreadId);
    adapter.handleAttach(attachBaseline);
    adapter.handleEvent(eventItemStarted);

    expect(adapter.handleAttach(attachReplacement)).toStrictEqual({
      type: "attachAccepted",
      response: attachReplacement,
    });
    expect(adapter.handleEvent(eventSubscriptionReplacement)).toStrictEqual({
      type: "eventAccepted",
      notification: eventSubscriptionReplacement,
    });
  });

  it("requires manual reconnect for matching backpressure closed notifications", () => {
    const adapter = new ProjectionIngressAdapter(projectionThreadId);
    adapter.handleAttach(attachBaseline);

    expect(adapter.handleClosed(closed())).toStrictEqual({
      type: "manualReconnectRequired",
      reason: "backpressure",
      threadId: projectionThreadId,
      subscriptionId: attachBaseline.subscriptionId,
    });
    expect(adapter.handleEvent(eventTurnStarted)).toStrictEqual({
      type: "ignored",
      reason: "alreadyRequiresManualReconnect",
    });
  });

  it("ignores wrong-thread and stale-subscription closed notifications", () => {
    const adapter = new ProjectionIngressAdapter(projectionThreadId);
    adapter.handleAttach(attachBaseline);

    expect(
      adapter.handleClosed(closed({ threadId: "00000000-0000-0000-0000-000000000099" })),
    ).toStrictEqual({ type: "ignored", reason: "wrongThread" });
    expect(
      adapter.handleClosed(
        closed({ subscriptionId: "projection-fixture-replacement-subscription" }),
      ),
    ).toStrictEqual({ type: "ignored", reason: "staleSubscription" });
  });
});
