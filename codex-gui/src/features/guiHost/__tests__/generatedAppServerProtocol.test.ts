import { describe, expect, it } from "vitest";
import { requestDescriptors, validateServerNotification } from "@/generated/appServerProtocol";
import {
  attachBaseline,
  eventTurnStarted,
} from "@/features/projection/__tests__/projectionFixtures";
import {
  inProgressTurn,
  turnStarted,
} from "@/features/projection/__tests__/projectionTestBuilders";

describe("generated app-server protocol", () => {
  it("validates the projection attach response fixture", () => {
    expect(requestDescriptors["thread/projection/attach"].validateResponse(attachBaseline)).toBe(
      true,
    );
  });

  it("rejects an attach response with a null snapshot", () => {
    expect(
      requestDescriptors["thread/projection/attach"].validateResponse({
        ...attachBaseline,
        snapshot: null,
      }),
    ).toBe(false);
  });

  it("validates a turnStarted server notification", () => {
    const notification = turnStarted(
      eventTurnStarted,
      "commit-generated-validator",
      inProgressTurn("turn-generated-validator"),
    );

    expect(
      validateServerNotification({
        method: "thread/projection/event",
        params: notification,
      }),
    ).toBe(true);
  });

  it("rejects an unknown projection event type", () => {
    const notification = turnStarted(
      eventTurnStarted,
      "commit-generated-validator",
      inProgressTurn("turn-generated-validator"),
    );

    expect(
      validateServerNotification({
        method: "thread/projection/event",
        params: {
          ...notification,
          event: { ...notification.event, type: "unknown" },
        },
      }),
    ).toBe(false);
  });
});
