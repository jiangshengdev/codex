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

export const attachBaseline = attachBaselineJson as ThreadProjectionAttachResponse;
export const attachReplacement = attachReplacementJson as ThreadProjectionAttachResponse;
export const closedBackpressure = closedBackpressureJson as ThreadProjectionClosedNotification;
export const eventTurnStarted = eventTurnStartedJson as ThreadProjectionEventNotification;
export const eventItemStarted = eventItemStartedJson as ThreadProjectionEventNotification;
export const eventItemCompleted = eventItemCompletedJson as ThreadProjectionEventNotification;
export const eventTurnCompleted = eventTurnCompletedJson as ThreadProjectionEventNotification;
export const eventSubscriptionReplacement =
  eventSubscriptionReplacementJson as ThreadProjectionEventNotification;
