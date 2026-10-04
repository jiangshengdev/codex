import { describe, expect, it } from "vitest";
import {
  attachBaseline,
  closedBackpressure,
  eventAgentMessageDelta,
  eventItemCompleted,
  eventItemStarted,
  eventTokenUsageUpdated,
  eventTurnCompleted,
  eventTurnStarted,
} from "@/features/projection/__tests__/projectionFixtures";
import {
  agentMessage,
  attachWithTurns,
  baseTurn,
  deltaWithEnvelope,
  eventWithEnvelope,
  inProgressTurn,
  itemCompleted,
  itemStarted,
  turnCompleted,
  turnStarted,
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
  const snapshotItem = agentMessage("snapshot-item", "Already attached");
  const snapshotTurn = baseTurn("snapshot-turn", [snapshotItem]);
  const pendingTurn = inProgressTurn("pending-turn");
  const newItem = agentMessage("new-item", "New event");
  const replayCommitId = "commit-after-snapshot";

  it.each([
    {
      name: "a snapshotted turn start",
      notification: turnStarted(eventTurnStarted, replayCommitId, inProgressTurn(snapshotTurn.id)),
      replay: "snapshotDuplicate",
    },
    {
      name: "a snapshotted turn completion",
      notification: turnCompleted(eventTurnCompleted, replayCommitId, snapshotTurn),
      replay: "snapshotDuplicate",
    },
    {
      name: "a snapshotted item start",
      notification: itemStarted(eventItemStarted, replayCommitId, snapshotTurn.id, snapshotItem),
      replay: "snapshotDuplicate",
    },
    {
      name: "a snapshotted item completion",
      notification: itemCompleted(
        eventItemCompleted,
        replayCommitId,
        snapshotTurn.id,
        snapshotItem,
      ),
      replay: "snapshotDuplicate",
    },
    {
      name: "a new turn start",
      notification: turnStarted(eventTurnStarted, replayCommitId, inProgressTurn("new-turn")),
      replay: "live",
    },
    {
      name: "a new turn completion",
      notification: turnCompleted(eventTurnCompleted, replayCommitId, baseTurn("new-turn")),
      replay: "live",
    },
    {
      name: "completion of a turn still in progress in the snapshot",
      notification: turnCompleted(eventTurnCompleted, replayCommitId, baseTurn(pendingTurn.id)),
      replay: "live",
    },
    {
      name: "a new item start",
      notification: itemStarted(eventItemStarted, replayCommitId, pendingTurn.id, newItem),
      replay: "live",
    },
    {
      name: "a new item completion",
      notification: itemCompleted(eventItemCompleted, replayCommitId, pendingTurn.id, newItem),
      replay: "live",
    },
    {
      name: "a token usage update",
      notification: eventTokenUsageUpdated,
      replay: "live",
    },
  ])("shares the accepted replay fact for $name", ({ notification, replay }) => {
    const attachResponse = attachWithTurns(attachBaseline, [snapshotTurn, pendingTurn]);
    const projection = createActiveThreadProjection({ threadId, attachResponse });
    projection.flush();
    const contiguousNotification = eventWithEnvelope(notification, {
      commitId: replayCommitId,
      parentCommitId: attachResponse.snapshot.headCommitId,
    });

    expect(projection.handleEvent(contiguousNotification)).toEqual({ type: "accepted" });

    const batch = projection.flush();
    expect(batch.acceptedQueueFacts).toEqual([{ notification: contiguousNotification, replay }]);
    expect(batch.readModelFacts).toEqual([
      { type: "eventAccepted", payload: batch.acceptedQueueFacts[0] },
    ]);
    const fact = batch.readModelFacts[0];
    if (fact?.type !== "eventAccepted") throw new Error("Expected an accepted event fact");
    expect(fact.payload).toBe(batch.acceptedQueueFacts[0]);
  });

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
