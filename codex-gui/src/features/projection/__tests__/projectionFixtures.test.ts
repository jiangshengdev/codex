import { describe, expect, it } from "vitest";
import {
  attachBaseline,
  attachReplacement,
  closedBackpressure,
  eventAgentMessageDelta,
  eventItemCompleted,
  eventItemStarted,
  eventReasoningItemCompleted,
  eventReasoningItemStarted,
  eventReasoningSummaryPartAddedDelta,
  eventReasoningSummaryTextDelta,
  eventReasoningTextDelta,
  eventSubscriptionReplacement,
  eventTurnCompleted,
  eventTurnStarted,
} from "./projectionFixtures";

const fixturePayloads = [
  attachBaseline,
  attachReplacement,
  closedBackpressure,
  eventTurnStarted,
  eventItemStarted,
  eventItemCompleted,
  eventReasoningItemStarted,
  eventReasoningItemCompleted,
  eventTurnCompleted,
  eventSubscriptionReplacement,
  eventAgentMessageDelta,
  eventReasoningSummaryTextDelta,
  eventReasoningSummaryPartAddedDelta,
  eventReasoningTextDelta,
];

const assertFieldAbsentRecursive = (value: unknown, fieldName: string): void => {
  if (Array.isArray(value)) {
    for (const item of value) {
      assertFieldAbsentRecursive(item, fieldName);
    }
    return;
  }

  if (value != null && typeof value === "object") {
    expect(value).not.toHaveProperty(fieldName);
    for (const child of Object.values(value)) {
      assertFieldAbsentRecursive(child, fieldName);
    }
  }
};

describe("Rust-generated projection fixtures", () => {
  it("imports attach snapshots with current thread projection envelope", () => {
    expect(attachBaseline.subscriptionId).toBe("projection-fixture-subscription");
    expect(attachBaseline.snapshot.headCommitId).toBeNull();
    expect(attachBaseline.snapshot.thread.turns.length).toBeGreaterThan(0);

    expect(attachReplacement.subscriptionId).toBe("projection-fixture-replacement-subscription");
    expect(attachReplacement.snapshot.headCommitId).toBe("commit-replacement-head");
    expect(attachReplacement.snapshot.thread.turns.length).toBeGreaterThan(0);
  });

  it("imports projection events with expected notification discriminators", () => {
    expect(eventTurnStarted.event.type).toBe("turnStarted");
    expect(eventItemStarted.event.type).toBe("itemStarted");
    expect(eventItemCompleted.event.type).toBe("itemCompleted");
    expect(eventReasoningItemStarted.event.type).toBe("itemStarted");
    expect(eventReasoningItemCompleted.event.type).toBe("itemCompleted");
    expect(eventTurnCompleted.event.type).toBe("turnCompleted");
    expect(eventSubscriptionReplacement.event.type).toBe("turnStarted");
  });

  it("imports projection delta notifications with expected discriminators", () => {
    expect(eventAgentMessageDelta.delta.type).toBe("agentMessage");

    if (eventAgentMessageDelta.delta.type !== "agentMessage") {
      throw new Error("fixture must contain an agentMessage projection delta");
    }
    expect(eventAgentMessageDelta.delta.notification).toMatchObject({
      threadId: attachBaseline.snapshot.thread.id,
      turnId: "turn-in-progress",
      itemId: "assistant-message",
      delta: "streamed text",
    });

    expect(eventReasoningSummaryTextDelta.delta.type).toBe("reasoningSummaryText");
    if (eventReasoningSummaryTextDelta.delta.type !== "reasoningSummaryText") {
      throw new Error("fixture must contain a reasoningSummaryText projection delta");
    }
    expect(eventReasoningSummaryTextDelta.delta.notification).toMatchObject({
      threadId: attachBaseline.snapshot.thread.id,
      turnId: "turn-in-progress",
      itemId: "reasoning-item",
      delta: "thinking summary",
      summaryIndex: 0,
    });

    expect(eventReasoningSummaryPartAddedDelta.delta.type).toBe("reasoningSummaryPartAdded");
    if (eventReasoningSummaryPartAddedDelta.delta.type !== "reasoningSummaryPartAdded") {
      throw new Error("fixture must contain a reasoningSummaryPartAdded projection delta");
    }
    expect(eventReasoningSummaryPartAddedDelta.delta.notification).toMatchObject({
      threadId: attachBaseline.snapshot.thread.id,
      turnId: "turn-in-progress",
      itemId: "reasoning-item",
      summaryIndex: 1,
    });

    expect(eventReasoningTextDelta.delta.type).toBe("reasoningText");
    if (eventReasoningTextDelta.delta.type !== "reasoningText") {
      throw new Error("fixture must contain a reasoningText projection delta");
    }
    expect(eventReasoningTextDelta.delta.notification).toMatchObject({
      threadId: attachBaseline.snapshot.thread.id,
      turnId: "turn-in-progress",
      itemId: "reasoning-item",
      delta: "raw reasoning",
      contentIndex: 0,
    });
  });

  it("imports projection closed notifications with expected reason", () => {
    expect(closedBackpressure.threadId).toBe(attachBaseline.snapshot.thread.id);
    expect(closedBackpressure.subscriptionId).toBe(attachBaseline.subscriptionId);
    expect(closedBackpressure.reason).toBe("backpressure");
  });

  it("keeps the baseline commit chain contiguous", () => {
    expect(eventTurnStarted.parentCommitId).toBeNull();
    expect(eventItemStarted.parentCommitId).toBe(eventTurnStarted.commitId);
    expect(eventItemCompleted.parentCommitId).toBe(eventItemStarted.commitId);
    expect(eventReasoningItemStarted.parentCommitId).toBe(eventItemCompleted.commitId);
    expect(eventReasoningItemCompleted.parentCommitId).toBe(eventReasoningItemStarted.commitId);
    expect(eventTurnCompleted.parentCommitId).toBe(eventReasoningItemCompleted.commitId);
  });

  it("keeps the replacement subscription chain separate", () => {
    expect(eventSubscriptionReplacement.subscriptionId).toBe(attachReplacement.subscriptionId);
    expect(eventSubscriptionReplacement.parentCommitId).toBe(
      attachReplacement.snapshot.headCommitId,
    );
    expect(eventSubscriptionReplacement.commitId).toBe("commit-replacement-next");
  });

  it("does not contain historical sequence projection fields", () => {
    expect(fixturePayloads).toHaveLength(14);

    for (const payload of fixturePayloads) {
      for (const fieldName of [
        "projectionInstanceId",
        "latestSequence",
        "sequence",
        "eventId",
        "payload",
      ]) {
        assertFieldAbsentRecursive(payload, fieldName);
      }
    }
  });
});
