import { describe, expect, it } from "vitest";
import attachBaselineJson from "../__fixtures__/attach-baseline.json";
import attachReplacementJson from "../__fixtures__/attach-replacement.json";
import eventItemCompletedJson from "../__fixtures__/event-item-completed.json";
import eventItemStartedJson from "../__fixtures__/event-item-started.json";
import eventLargeSequenceJson from "../__fixtures__/event-large-sequence.json";
import eventMetadataNullJson from "../__fixtures__/event-thread-metadata-updated-null.json";
import eventProjectionResetJson from "../__fixtures__/event-projection-reset.json";
import eventTurnCompletedJson from "../__fixtures__/event-turn-completed.json";
import eventTurnStartedJson from "../__fixtures__/event-turn-started.json";
import type {
  ProjectionEventNotification,
  ThreadProjectionAttachResponse,
} from "@codex-protocol/v2";

const attachBaseline = attachBaselineJson as ThreadProjectionAttachResponse;
const attachReplacement = attachReplacementJson as ThreadProjectionAttachResponse;
const eventTurnStarted = eventTurnStartedJson as ProjectionEventNotification;
const eventItemStarted = eventItemStartedJson as ProjectionEventNotification;
const eventItemCompleted = eventItemCompletedJson as ProjectionEventNotification;
const eventTurnCompleted = eventTurnCompletedJson as ProjectionEventNotification;
const eventMetadataNull = eventMetadataNullJson as ProjectionEventNotification;
const eventProjectionReset = eventProjectionResetJson as ProjectionEventNotification;
const eventLargeSequence = eventLargeSequenceJson as ProjectionEventNotification;

describe("Rust-generated projection fixtures", () => {
  it("imports attach snapshots with string latestSequence", () => {
    expect(attachBaseline.latestSequence).toBe("0");
    expect(attachBaseline.thread.turns.length).toBeGreaterThan(0);
    expect(attachReplacement.latestSequence).toBe("1");
    expect(attachReplacement.thread.turns.length).toBeGreaterThan(0);
  });

  it("imports projection events with expected payload discriminators", () => {
    expect(eventTurnStarted.payload.type).toBe("turnStarted");
    expect(eventItemStarted.payload.type).toBe("itemStarted");
    expect(eventItemCompleted.payload.type).toBe("itemCompleted");
    expect(eventTurnCompleted.payload.type).toBe("turnCompleted");
    expect(eventMetadataNull.payload).toStrictEqual({
      type: "threadMetadataUpdated",
      name: null,
    });
    expect(eventProjectionReset.payload.type).toBe("projectionReset");
  });

  it("keeps unsafe integer sequences as JSON strings", () => {
    expect(eventLargeSequence.sequence).toBe("9007199254740993");
    expect(eventLargeSequence.eventId).toBe("projection-fixture-instance:9007199254740993");
  });
});
