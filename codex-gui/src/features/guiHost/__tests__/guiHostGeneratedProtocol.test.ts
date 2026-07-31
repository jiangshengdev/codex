import { describe, expect, expectTypeOf, test } from "vitest";

import type { ServerNotification } from "@codex-protocol/ServerNotification";
import type {
  ThreadProjectionAttachParams,
  TurnStartParams,
  TurnStartResponse,
} from "@codex-protocol/v2";
import {
  closedBackpressure,
  eventAgentMessageDelta,
  eventTurnStarted,
} from "@/features/projection/__tests__/projectionFixtures";
import { classifyServerNotification, requestDescriptors } from "@/generated/appServerProtocol";
import type { RequestParams, RequestResponse } from "../appServerProtocol";

describe("generated GUI Host protocol boundary", () => {
  test("associates turn/start with its generated params and response", () => {
    const descriptor = requestDescriptors["turn/start"];
    type Method = typeof descriptor.method;

    expectTypeOf<Method>().toEqualTypeOf<"turn/start">();
    expectTypeOf<RequestParams<Method>>().toEqualTypeOf<TurnStartParams>();
    expectTypeOf<ThreadProjectionAttachParams>().not.toExtend<RequestParams<Method>>();
    expectTypeOf<RequestResponse<Method>>().toEqualTypeOf<TurnStartResponse>();

    const result: unknown = {};
    if (descriptor.validateResponse(result)) {
      expectTypeOf(result).toEqualTypeOf<TurnStartResponse>();
    }
  });

  test("narrows selected notifications to their method-specific generated type", () => {
    const notifications = [
      { method: "thread/projection/event", params: eventTurnStarted },
      { method: "thread/projection/delta", params: eventAgentMessageDelta },
      { method: "thread/projection/closed", params: closedBackpressure },
    ] as const;

    for (const notification of notifications) {
      const classification = classifyServerNotification(notification);
      expect(classification.type).toBe("selected");
      if (classification.type !== "selected") {
        continue;
      }

      switch (classification.notification.method) {
        case "thread/projection/event":
          expectTypeOf(classification.notification).toEqualTypeOf<
            Extract<ServerNotification, { method: "thread/projection/event" }>
          >();
          break;
        case "thread/projection/delta":
          expectTypeOf(classification.notification).toEqualTypeOf<
            Extract<ServerNotification, { method: "thread/projection/delta" }>
          >();
          break;
        case "thread/projection/closed":
          expectTypeOf(classification.notification).toEqualTypeOf<
            Extract<ServerNotification, { method: "thread/projection/closed" }>
          >();
          break;
        default:
          classification.notification satisfies never;
      }
    }
  });
});
