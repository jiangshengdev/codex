import { describe, expect, it } from "vitest";
import attachBaselineJson from "../__fixtures__/attach-baseline.json";
import attachReplacementJson from "../__fixtures__/attach-replacement.json";
import closedBackpressureJson from "../__fixtures__/closed-backpressure.json";
import eventItemCompletedJson from "../__fixtures__/event-item-completed.json";
import eventItemStartedJson from "../__fixtures__/event-item-started.json";
import eventSubscriptionReplacementJson from "../__fixtures__/event-subscription-replacement.json";
import eventTurnCompletedJson from "../__fixtures__/event-turn-completed.json";
import eventTurnStartedJson from "../__fixtures__/event-turn-started.json";
import type {
  ThreadProjectionAttachResponse,
  ThreadProjectionClosedNotification,
  ThreadProjectionEventNotification,
} from "@codex-protocol/v2";

const attachBaseline = attachBaselineJson as ThreadProjectionAttachResponse;
const attachReplacement = attachReplacementJson as ThreadProjectionAttachResponse;
const closedBackpressure = closedBackpressureJson as ThreadProjectionClosedNotification;
const eventTurnStarted = eventTurnStartedJson as ThreadProjectionEventNotification;
const eventItemStarted = eventItemStartedJson as ThreadProjectionEventNotification;
const eventItemCompleted = eventItemCompletedJson as ThreadProjectionEventNotification;
const eventTurnCompleted = eventTurnCompletedJson as ThreadProjectionEventNotification;
const eventSubscriptionReplacement =
  eventSubscriptionReplacementJson as ThreadProjectionEventNotification;

const fixturePayloads = [
  attachBaselineJson,
  attachReplacementJson,
  closedBackpressureJson,
  eventTurnStartedJson,
  eventItemStartedJson,
  eventItemCompletedJson,
  eventTurnCompletedJson,
  eventSubscriptionReplacementJson,
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
    expect(eventTurnCompleted.event.type).toBe("turnCompleted");
    expect(eventSubscriptionReplacement.event.type).toBe("turnStarted");
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
    expect(eventTurnCompleted.parentCommitId).toBe(eventItemCompleted.commitId);
  });

  it("keeps the replacement subscription chain separate", () => {
    expect(eventSubscriptionReplacement.subscriptionId).toBe(attachReplacement.subscriptionId);
    expect(eventSubscriptionReplacement.parentCommitId).toBe(
      attachReplacement.snapshot.headCommitId,
    );
    expect(eventSubscriptionReplacement.commitId).toBe("commit-replacement-next");
  });

  it("does not contain historical sequence projection fields", () => {
    expect(fixturePayloads).toHaveLength(8);

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
