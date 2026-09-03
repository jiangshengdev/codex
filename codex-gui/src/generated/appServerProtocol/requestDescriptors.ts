// GENERATED CODE! DO NOT MODIFY BY HAND!
import type { ProtocolValidator, RequestResponse } from "../../features/guiHost/appServerProtocol";
import {
  validateInitializeResponse,
  validateV2SkillsListResponse,
  validateV2ThreadCompactStartResponse,
  validateV2ThreadProjectionAttachResponse,
  validateV2ThreadProjectionDetachResponse,
  validateV2ThreadListResponse,
  validateV2ThreadReadResponse,
  validateV2ThreadResumeResponse,
  validateV2TurnStartResponse,
  validateV2TurnSteerResponse,
  validateV2TurnInterruptResponse,
} from "./appServerPayloadValidators.js";
export const requestDescriptors = {
  initialize: {
    method: "initialize",
    paramsSchema: "InitializeParams",
    responseSchema: "InitializeResponse",
    validateResponse: validateInitializeResponse,
  },
  "skills/list": {
    method: "skills/list",
    paramsSchema: "v2/SkillsListParams",
    responseSchema: "v2/SkillsListResponse",
    validateResponse: validateV2SkillsListResponse,
  },
  "thread/compact/start": {
    method: "thread/compact/start",
    paramsSchema: "v2/ThreadCompactStartParams",
    responseSchema: "v2/ThreadCompactStartResponse",
    validateResponse: validateV2ThreadCompactStartResponse,
  },
  "thread/projection/attach": {
    method: "thread/projection/attach",
    paramsSchema: "v2/ThreadProjectionAttachParams",
    responseSchema: "v2/ThreadProjectionAttachResponse",
    validateResponse: validateV2ThreadProjectionAttachResponse,
  },
  "thread/projection/detach": {
    method: "thread/projection/detach",
    paramsSchema: "v2/ThreadProjectionDetachParams",
    responseSchema: "v2/ThreadProjectionDetachResponse",
    validateResponse: validateV2ThreadProjectionDetachResponse,
  },
  "thread/list": {
    method: "thread/list",
    paramsSchema: "v2/ThreadListParams",
    responseSchema: "v2/ThreadListResponse",
    validateResponse: validateV2ThreadListResponse,
  },
  "thread/read": {
    method: "thread/read",
    paramsSchema: "v2/ThreadReadParams",
    responseSchema: "v2/ThreadReadResponse",
    validateResponse: validateV2ThreadReadResponse,
  },
  "thread/resume": {
    method: "thread/resume",
    paramsSchema: "v2/ThreadResumeParams",
    responseSchema: "v2/ThreadResumeResponse",
    validateResponse: validateV2ThreadResumeResponse,
  },
  "turn/start": {
    method: "turn/start",
    paramsSchema: "v2/TurnStartParams",
    responseSchema: "v2/TurnStartResponse",
    validateResponse: validateV2TurnStartResponse,
  },
  "turn/steer": {
    method: "turn/steer",
    paramsSchema: "v2/TurnSteerParams",
    responseSchema: "v2/TurnSteerResponse",
    validateResponse: validateV2TurnSteerResponse,
  },
  "turn/interrupt": {
    method: "turn/interrupt",
    paramsSchema: "v2/TurnInterruptParams",
    responseSchema: "v2/TurnInterruptResponse",
    validateResponse: validateV2TurnInterruptResponse,
  },
} satisfies {
  [M in
    | "initialize"
    | "skills/list"
    | "thread/compact/start"
    | "thread/projection/attach"
    | "thread/projection/detach"
    | "thread/list"
    | "thread/read"
    | "thread/resume"
    | "turn/start"
    | "turn/steer"
    | "turn/interrupt"]: {
    method: M;
    paramsSchema: string;
    responseSchema: string;
    validateResponse: ProtocolValidator<RequestResponse<M>>;
  };
};
