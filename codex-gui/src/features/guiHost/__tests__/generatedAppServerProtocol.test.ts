import { describe, expect, it } from "vitest";
import {
  attachBaseline,
  closedBackpressure,
  eventAgentMessageDelta,
  eventTokenUsageUpdated,
  eventTurnStarted,
} from "@/features/projection/__tests__/projectionFixtures";
import { classifyServerNotification, requestDescriptors } from "@/generated/appServerProtocol";
import {
  validateV2ThreadProjectionClosedNotification,
  validateV2ThreadProjectionDeltaNotification,
  validateV2ThreadProjectionEventNotification,
} from "@/generated/appServerProtocol/appServerPayloadValidators.js";
import { validateJSONRPCMessage } from "@/generated/appServerProtocol/jsonRpcEnvelopeValidators.js";
import type { RequestResponse } from "../appServerProtocol";

const historyThread = attachBaseline.snapshot.thread;

const threadListResponse = {
  data: [historyThread],
  nextCursor: "next-page",
  backwardsCursor: null,
} satisfies RequestResponse<"thread/list">;

const threadResumeResponse = {
  thread: historyThread,
  model: "gpt-5",
  modelProvider: "openai",
  serviceTier: null,
  cwd: historyThread.cwd,
  instructionSources: [],
  approvalPolicy: "on-request",
  approvalsReviewer: "user",
  sandbox: { type: "dangerFullAccess" },
  reasoningEffort: null,
} satisfies RequestResponse<"thread/resume">;

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

  it("validates turn/steer responses with the generated descriptor", () => {
    expect(requestDescriptors["turn/steer"].validateResponse({ turnId: "turn-active" })).toBe(true);
    expect(requestDescriptors["turn/steer"].validateResponse({})).toBe(false);
    expect(requestDescriptors["turn/steer"].validateResponse({ turnId: null })).toBe(false);
  });

  it.each([
    [
      "skills/list",
      {
        data: [
          {
            cwd: "/workspace/project",
            skills: [
              {
                name: "grill-me",
                description: "Stress-test a plan.",
                path: "/workspace/project/skills/grill-me/SKILL.md",
                scope: "repo",
                enabled: true,
              },
            ],
            errors: [],
          },
        ],
      } satisfies RequestResponse<"skills/list">,
      {
        data: [
          {
            cwd: "/workspace/project",
            skills: [
              {
                name: "grill-me",
                description: "Stress-test a plan.",
                path: "/workspace/project/skills/grill-me/SKILL.md",
                scope: "repo",
                enabled: null,
              },
            ],
            errors: [],
          },
        ],
      },
    ],
    ["thread/list", threadListResponse, { data: null, nextCursor: null, backwardsCursor: null }],
    [
      "thread/read",
      { thread: historyThread } satisfies RequestResponse<"thread/read">,
      { thread: null },
    ],
    ["thread/resume", threadResumeResponse, { ...threadResumeResponse, thread: null }],
    [
      "thread/projection/detach",
      { status: "detached" } satisfies RequestResponse<"thread/projection/detach">,
      { status: "unknown" },
    ],
  ] as const)(
    "validates %s responses with the generated descriptor",
    (method, response, malformed) => {
      const descriptor = requestDescriptors[method];

      expect(descriptor.validateResponse(response)).toBe(true);
      expect(descriptor.validateResponse(malformed)).toBe(false);
    },
  );

  it.each([
    ["thread/list", "nextCursor", { ...threadListResponse, nextCursor: null }],
    ["thread/list", "backwardsCursor", threadListResponse],
    ["thread/resume", "serviceTier", threadResumeResponse],
    ["thread/resume", "reasoningEffort", threadResumeResponse],
  ] as const)(
    "requires %s response field %s while accepting explicit null",
    (method, field, responseWithNull) => {
      const responseWithoutField = { ...responseWithNull };
      Reflect.deleteProperty(responseWithoutField, field);

      const descriptor = requestDescriptors[method];
      expect(descriptor.validateResponse(responseWithNull)).toBe(true);
      expect(descriptor.validateResponse(responseWithoutField)).toBe(false);
    },
  );

  it("classifies legal and malformed skills/changed notifications", () => {
    expect(classifyServerNotification({ method: "skills/changed", params: {} })).toEqual({
      type: "selected",
      notification: { method: "skills/changed", params: {} },
    });
    expect(classifyServerNotification({ method: "skills/changed", params: null })).toEqual({
      type: "selectedInvalid",
      method: "skills/changed",
    });
  });

  it.each([
    ["event", validateV2ThreadProjectionEventNotification, eventTurnStarted],
    ["token usage event", validateV2ThreadProjectionEventNotification, eventTokenUsageUpdated],
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

  it("rejects a token usage event with a malformed nested payload", () => {
    if (eventTokenUsageUpdated.event.type !== "tokenUsageUpdated") {
      throw new Error("fixture must contain a tokenUsageUpdated projection event");
    }

    expect(
      validateV2ThreadProjectionEventNotification({
        ...eventTokenUsageUpdated,
        event: {
          ...eventTokenUsageUpdated.event,
          notification: {
            ...eventTokenUsageUpdated.event.notification,
            tokenUsage: {
              ...eventTokenUsageUpdated.event.notification.tokenUsage,
              last: null,
            },
          },
        },
      }),
    ).toBe(false);
  });
});
