import { describe, expectTypeOf, test } from "vitest";

import type { ServerNotification } from "@codex-protocol/ServerNotification";
import type {
  ThreadProjectionAttachParams,
  TurnStartParams,
  TurnStartResponse,
} from "@codex-protocol/v2";
import { requestDescriptors, validateServerNotification } from "@/generated/appServerProtocol";
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

  test("narrows notifications through the generated public validator", () => {
    const notification: unknown = {};

    if (validateServerNotification(notification)) {
      expectTypeOf(notification).toEqualTypeOf<ServerNotification>();
    }
  });
});
