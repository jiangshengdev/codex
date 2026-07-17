import { describe, expect, it } from "vitest";
import {
  attachBaseline,
  closedBackpressure,
  eventAgentMessageDelta,
  eventTurnStarted,
} from "@/features/projection/__tests__/projectionFixtures";
import { requestDescriptors } from "@/generated/appServerProtocol";
import {
  validateV2ThreadProjectionClosedNotification,
  validateV2ThreadProjectionDeltaNotification,
  validateV2ThreadProjectionEventNotification,
} from "@/generated/appServerProtocol/appServerPayloadValidators.js";
import { validateJSONRPCMessage } from "@/generated/appServerProtocol/jsonRpcEnvelopeValidators.js";

describe("generated app-server protocol", () => {
  it.each([
    [
      "request",
      {
        jsonrpc: "2.0",
        id: 1,
        method: "fixture/request",
        params: { opaque: { nested: true } },
      },
    ],
    [
      "notification",
      {
        jsonrpc: "2.0",
        method: "fixture/notification",
        params: { opaque: { nested: true } },
      },
    ],
    ["success response", { jsonrpc: "2.0", id: 1, result: { opaque: { nested: true } } }],
    [
      "error response",
      {
        jsonrpc: "2.0",
        id: 1,
        error: { code: -32600, message: "fixture error", data: { opaque: true } },
      },
    ],
    [
      "response with both result and error",
      {
        jsonrpc: "2.0",
        id: 1,
        result: {},
        error: { code: -32600, message: "fixture error" },
      },
    ],
  ])("validates a shallow %s envelope with an opaque payload", (_, message) => {
    expect(validateJSONRPCMessage(message)).toBe(true);
  });

  it.each([
    ["array", []],
    ["primitive", 42],
    ["response with neither result nor error", { jsonrpc: "2.0", id: 1 }],
  ])("rejects an invalid %s envelope", (_, message) => {
    expect(validateJSONRPCMessage(message)).toBe(false);
  });

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

  it.each([
    ["event", validateV2ThreadProjectionEventNotification, eventTurnStarted],
    ["delta", validateV2ThreadProjectionDeltaNotification, eventAgentMessageDelta],
    ["closed", validateV2ThreadProjectionClosedNotification, closedBackpressure],
  ])("validates legal projection %s params", (_, validate, params) => {
    expect(validate(params)).toBe(true);
  });

  it.each([
    ["event", validateV2ThreadProjectionEventNotification],
    ["delta", validateV2ThreadProjectionDeltaNotification],
    ["closed", validateV2ThreadProjectionClosedNotification],
  ])("rejects projection %s params with missing required fields", (_, validate) => {
    expect(validate({})).toBe(false);
  });
});
