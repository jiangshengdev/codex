import { describe, expect, it } from "vitest";
import {
  attachWithHeadCommitId,
  attachWithTurns,
  closedWithEnvelope,
  deltaWithEnvelope,
  eventWithEnvelope,
  tokenUsageUpdated,
} from "@/features/projection/__tests__/projectionTestBuilders";
import {
  attachBaseline,
  attachReplacement,
  closedBackpressure,
  eventAgentMessageDelta,
  eventItemStarted,
  eventSubscriptionReplacement,
  eventTokenUsageUpdated,
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

  it("accepts token usage without a parent turn and advances the commit chain", () => {
    const adapter = new ProjectionIngressAdapter(projectionThreadId);
    adapter.handleAttach(attachBaseline);
    if (eventTokenUsageUpdated.event.type !== "tokenUsageUpdated") {
      throw new Error("fixture must contain a tokenUsageUpdated projection event");
    }
    const usageEvent = eventWithEnvelope(
      tokenUsageUpdated(eventTokenUsageUpdated, {
        ...eventTokenUsageUpdated.event.notification.tokenUsage,
        last: {
          ...eventTokenUsageUpdated.event.notification.tokenUsage.last,
          totalTokens: 128,
        },
      }),
      { parentCommitId: attachBaseline.snapshot.headCommitId },
    );

    expect(adapter.handleEvent(usageEvent)).toStrictEqual({
      type: "eventAccepted",
      notification: usageEvent,
    });

    const nextEvent = eventWithEnvelope(eventTurnStarted, {
      parentCommitId: usageEvent.commitId,
    });
    expect(adapter.handleEvent(nextEvent)).toStrictEqual({
      type: "eventAccepted",
      notification: nextEvent,
    });
  });

  it("applies thread and subscription ownership checks to token usage events", () => {
    const adapter = new ProjectionIngressAdapter(projectionThreadId);
    adapter.handleAttach(attachBaseline);

    expect(
      adapter.handleEvent(
        eventWithEnvelope(eventTokenUsageUpdated, {
          threadId: "00000000-0000-0000-0000-000000000099",
        }),
      ),
    ).toStrictEqual({ type: "ignored", reason: "wrongThread" });
    expect(
      adapter.handleEvent(
        eventWithEnvelope(eventTokenUsageUpdated, {
          subscriptionId: "projection-fixture-replacement-subscription",
        }),
      ),
    ).toStrictEqual({ type: "ignored", reason: "staleSubscription" });
  });

  it("ignores a token usage event whose commit is already the attach head", () => {
    const adapter = new ProjectionIngressAdapter(projectionThreadId);
    adapter.handleAttach(attachWithHeadCommitId(attachBaseline, eventTokenUsageUpdated.commitId));

    expect(adapter.handleEvent(eventTokenUsageUpdated)).toStrictEqual({
      type: "ignored",
      reason: "duplicateCommit",
    });
  });

  it("requires reconnect for a noncontiguous token usage event and accepts it after replacement", () => {
    const adapter = new ProjectionIngressAdapter(projectionThreadId);
    adapter.handleAttach(attachBaseline);

    expect(adapter.handleEvent(eventTokenUsageUpdated)).toStrictEqual({
      type: "manualReconnectRequired",
      reason: "commitChainMismatch",
      threadId: projectionThreadId,
      subscriptionId: attachBaseline.subscriptionId,
    });

    adapter.handleAttach(attachReplacement);
    const replacementUsageEvent = eventWithEnvelope(eventTokenUsageUpdated, {
      subscriptionId: attachReplacement.subscriptionId,
      commitId: "commit-token-usage-after-replacement",
      parentCommitId: attachReplacement.snapshot.headCommitId,
    });
    expect(adapter.handleEvent(replacementUsageEvent)).toStrictEqual({
      type: "eventAccepted",
      notification: replacementUsageEvent,
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
