// GENERATED CODE! DO NOT MODIFY BY HAND!
import type { ProtocolValidator, RequestResponse } from "../../features/guiHost/appServerProtocol";
import {
  validateInitializeResponse,
  validateV2ThreadProjectionAttachResponse,
  validateV2TurnStartResponse,
  validateV2TurnInterruptResponse,
} from "./appServerPayloadValidators.js";
export const requestDescriptors = {
  initialize: {
    method: "initialize",
    paramsSchema: "InitializeParams",
    responseSchema: "InitializeResponse",
    validateResponse: validateInitializeResponse,
  },
  "thread/projection/attach": {
    method: "thread/projection/attach",
    paramsSchema: "v2/ThreadProjectionAttachParams",
    responseSchema: "v2/ThreadProjectionAttachResponse",
    validateResponse: validateV2ThreadProjectionAttachResponse,
  },
  "turn/start": {
    method: "turn/start",
    paramsSchema: "v2/TurnStartParams",
    responseSchema: "v2/TurnStartResponse",
    validateResponse: validateV2TurnStartResponse,
  },
  "turn/interrupt": {
    method: "turn/interrupt",
    paramsSchema: "v2/TurnInterruptParams",
    responseSchema: "v2/TurnInterruptResponse",
    validateResponse: validateV2TurnInterruptResponse,
  },
} satisfies {
  [M in "initialize" | "thread/projection/attach" | "turn/start" | "turn/interrupt"]: {
    method: M;
    paramsSchema: string;
    responseSchema: string;
    validateResponse: ProtocolValidator<RequestResponse<M>>;
  };
};
