import { describe, expect, it } from "vitest";
import {
  eventItemCompleted,
  eventItemStarted,
  eventTurnCompleted,
  eventTurnStarted,
} from "@/features/projection/__tests__/projectionFixtures";
import {
  baseTurn,
  inProgressTurn,
  itemStarted,
  turnCompleted,
  turnStarted,
  userMessage,
} from "@/features/projection/__tests__/projectionTestBuilders";
import type { ThreadItem } from "@codex-protocol/v2";
import { runtimeObservationFromAcceptedProjectionEvent as adapt } from "../composerInputQueueRuntimeObservation";

type UserMessage = Extract<ThreadItem, { type: "userMessage" }>;
const committedUserMessage = (): UserMessage => {
  const item = userMessage("item-1", []);
  if (item.type !== "userMessage") throw new Error("userMessage builder returned another variant");
  return { ...item, clientId: "client-1" };
};
describe("runtimeObservationFromAcceptedProjectionEvent", () => {
  it("maps live turn lifecycle events and ignores snapshot replays", () => {
    const started = turnStarted(eventTurnStarted, "commit-start", baseTurn("turn-1"));
    const completed = turnCompleted(eventTurnCompleted, "commit-end", baseTurn("turn-1"));

    expect(adapt({ notification: started, replay: "live" })).toEqual({
      type: "turnStarted",
      turnId: "turn-1",
      commitId: "commit-start",
    });
    expect(adapt({ notification: completed, replay: "live" })).toEqual({
      type: "turnCompleted",
      turnId: "turn-1",
      status: "completed",
      commitId: "commit-end",
    });
    expect(adapt({ notification: started, replay: "snapshotDuplicate" })).toBeNull();
    expect(
      adapt({
        notification: turnCompleted(eventTurnCompleted, "commit-live", inProgressTurn("turn-1")),
        replay: "live",
      }),
    ).toBeNull();
  });

  it("maps only started user messages with a client identity", () => {
    const committed = itemStarted(
      eventItemStarted,
      "commit-item",
      "turn-1",
      committedUserMessage(),
    );

    expect(adapt({ notification: committed, replay: "live" })).toEqual({
      type: "userMessageCommitted",
      clientId: "client-1",
      turnId: "turn-1",
      commitId: "commit-item",
    });
    expect(adapt({ notification: eventItemCompleted, replay: "live" })).toBeNull();
    expect(adapt({ notification: eventItemStarted, replay: "live" })).toBeNull();
  });
});
