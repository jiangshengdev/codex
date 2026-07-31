import { describe, expect, it } from "vitest";
import {
  attachWithHeadCommitId,
  attachWithTurns,
  closedWithEnvelope,
  deltaWithEnvelope,
  eventWithEnvelope,
} from "@/features/projection/__tests__/projectionTestBuilders";
import {
  attachBaseline,
  attachReplacement,
  closedBackpressure,
  eventAgentMessageDelta,
  eventItemStarted,
  eventSubscriptionReplacement,
  eventTurnStarted,
} from "@/features/projection/__tests__/projectionFixtures";
import { ProjectionIngressAdapter } from "../projectionIngressAdapter";

const projectionThreadId = attachBaseline.snapshot.thread.id;

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

  it("accepts matching projection deltas without advancing the commit chain", () => {
    const adapter = new ProjectionIngressAdapter(projectionThreadId);
    adapter.handleAttach(attachBaseline);

    expect(adapter.handleDelta(eventAgentMessageDelta)).toStrictEqual({
      type: "deltaAccepted",
      notification: eventAgentMessageDelta,
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
        eventWithEnvelope(eventTurnStarted, {
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

  it("ignores wrong-thread and stale-subscription deltas", () => {
    const adapter = new ProjectionIngressAdapter(projectionThreadId);
    adapter.handleAttach(attachBaseline);

    expect(
      adapter.handleDelta(
        deltaWithEnvelope(eventAgentMessageDelta, {
          threadId: "00000000-0000-0000-0000-000000000099",
        }),
      ),
    ).toStrictEqual({ type: "ignored", reason: "wrongThread" });
    expect(
      adapter.handleDelta(
        deltaWithEnvelope(eventAgentMessageDelta, {
          subscriptionId: "projection-fixture-replacement-subscription",
        }),
      ),
    ).toStrictEqual({ type: "ignored", reason: "staleSubscription" });
  });

  it("ignores duplicate latest commit events", () => {
    const adapter = new ProjectionIngressAdapter(projectionThreadId);
    if (eventTurnStarted.event.type !== "turnStarted") {
      throw new Error("fixture must contain a turnStarted projection event");
    }
    const snapshotAtCommit = attachWithHeadCommitId(
      attachWithTurns(attachBaseline, [eventTurnStarted.event.notification.turn]),
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
    const snapshotAheadWithOldHead = attachWithHeadCommitId(
      attachWithTurns(attachBaseline, [eventTurnStarted.event.notification.turn]),
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
    const snapshotWithoutLiveTurn = attachWithHeadCommitId(
      attachWithTurns(attachBaseline, attachBaseline.snapshot.thread.turns),
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

  it("ignores deltas after manual reconnect is required", () => {
    const adapter = new ProjectionIngressAdapter(projectionThreadId);
    adapter.handleAttach(attachBaseline);
    adapter.handleClosed(closedBackpressure);

    expect(adapter.handleDelta(eventAgentMessageDelta)).toStrictEqual({
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

    expect(adapter.handleClosed(closedBackpressure)).toStrictEqual({
      type: "manualReconnectRequired",
      reason: closedBackpressure.reason,
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
      adapter.handleClosed(
        closedWithEnvelope(closedBackpressure, {
          threadId: "00000000-0000-0000-0000-000000000099",
        }),
      ),
    ).toStrictEqual({ type: "ignored", reason: "wrongThread" });
    expect(
      adapter.handleClosed(
        closedWithEnvelope(closedBackpressure, {
          subscriptionId: "projection-fixture-replacement-subscription",
        }),
      ),
    ).toStrictEqual({ type: "ignored", reason: "staleSubscription" });
  });
});
