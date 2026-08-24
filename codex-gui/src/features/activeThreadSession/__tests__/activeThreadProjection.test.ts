import { describe, expect, it } from "vitest";
import {
  attachBaseline,
  closedBackpressure,
  eventAgentMessageDelta,
  eventItemStarted,
  eventTurnStarted,
} from "@/features/projection/__tests__/projectionFixtures";
import {
  deltaWithEnvelope,
  eventWithEnvelope,
} from "@/features/projection/__tests__/projectionTestBuilders";
import { createActiveThreadProjection } from "../activeThreadProjection";

const threadId = attachBaseline.snapshot.thread.id;
const subscriptionId = attachBaseline.subscriptionId;

const createProjection = () =>
  createActiveThreadProjection({
    threadId,
    attachResponse: attachBaseline,
  });

describe("ActiveThreadProjection", () => {
  it("stages baseline, deltas, and accepted events in FIFO replay order", () => {
    const projection = createProjection();

    expect(projection.handleDelta(eventAgentMessageDelta)).toEqual({ type: "accepted" });
    expect(projection.handleEvent(eventTurnStarted)).toEqual({ type: "accepted" });
    expect(projection.handleEvent(eventItemStarted)).toEqual({ type: "accepted" });

    const batch = projection.flush();
    expect(batch.readModelFacts.map(({ type }) => type)).toEqual([
      "baselineAttached",
      "deltasAccepted",
      "eventAccepted",
      "eventAccepted",
    ]);
    expect(batch.acceptedQueueFacts.map(({ notification }) => notification)).toEqual([
      eventTurnStarted,
      eventItemStarted,
    ]);
    expect(batch.readModelFacts[2]).toEqual({
      type: "eventAccepted",
      payload: batch.acceptedQueueFacts[0],
    });
    expect(batch.readModelFacts[3]).toEqual({
      type: "eventAccepted",
      payload: batch.acceptedQueueFacts[1],
    });
  });

  it("flushes accepted deltas synchronously without a scheduler", () => {
    const projection = createProjection();
    projection.flush();

    projection.handleDelta(eventAgentMessageDelta);

    expect(projection.flush()).toEqual({
      readModelFacts: [
        {
          type: "deltasAccepted",
          notifications: [eventAgentMessageDelta],
        },
      ],
      acceptedQueueFacts: [],
    });
    expect(projection.flush()).toEqual({ readModelFacts: [], acceptedQueueFacts: [] });
  });

  it("stages matching invalidation after pending deltas and rejects later notifications", () => {
    const projection = createProjection();
    projection.flush();
    projection.handleDelta(eventAgentMessageDelta);

    expect(projection.handleClosed(closedBackpressure)).toEqual({
      type: "projectionUnavailable",
      reason: "backpressure",
    });
    expect(projection.handleEvent(eventTurnStarted)).toEqual({
      type: "ignored",
      reason: "alreadyRequiresManualReconnect",
    });
    expect(projection.handleDelta(eventAgentMessageDelta)).toEqual({
      type: "ignored",
      reason: "alreadyRequiresManualReconnect",
    });
    expect(projection.handleClosed(closedBackpressure)).toEqual({
      type: "ignored",
      reason: "alreadyRequiresManualReconnect",
    });
    expect(projection.flush()).toEqual({
      readModelFacts: [
        {
          type: "deltasAccepted",
          notifications: [eventAgentMessageDelta],
        },
        {
          type: "projectionUnavailable",
          reason: "backpressure",
          threadId,
          subscriptionId,
        },
      ],
      acceptedQueueFacts: [],
    });
  });

  it("ignores wrong-thread, stale-subscription, and duplicate-commit input", () => {
    const projection = createProjection();
    const baseline = projection.flush();

    expect(
      projection.handleEvent(
        eventWithEnvelope(eventTurnStarted, {
          threadId: "00000000-0000-0000-0000-000000000999",
        }),
      ),
    ).toEqual({ type: "ignored", reason: "wrongThread" });
    expect(
      projection.handleDelta(
        deltaWithEnvelope(eventAgentMessageDelta, {
          subscriptionId: "00000000-0000-0000-0000-000000000999",
        }),
      ),
    ).toEqual({ type: "ignored", reason: "staleSubscription" });

    const duplicateProjection = createProjection();
    duplicateProjection.flush();
    expect(duplicateProjection.handleEvent(eventTurnStarted)).toEqual({ type: "accepted" });
    duplicateProjection.flush();
    expect(duplicateProjection.handleEvent(eventTurnStarted)).toEqual({
      type: "ignored",
      reason: "duplicateCommit",
    });

    expect(baseline.readModelFacts.map(({ type }) => type)).toEqual(["baselineAttached"]);
    expect(projection.flush()).toEqual({ readModelFacts: [], acceptedQueueFacts: [] });
    expect(duplicateProjection.flush()).toEqual({ readModelFacts: [], acceptedQueueFacts: [] });
  });
});
