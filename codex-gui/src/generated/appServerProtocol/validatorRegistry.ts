// GENERATED CODE! DO NOT MODIFY BY HAND!
import {
  validateInitializeResponse,
  validateJSONRPCMessage,
  validateServerNotification,
  validateV2ThreadProjectionAttachResponse,
  validateV2TurnInterruptResponse,
  validateV2TurnStartResponse,
} from "./standaloneValidators.js";
export const validatorRegistry = {
  InitializeResponse: validateInitializeResponse,
  JSONRPCMessage: validateJSONRPCMessage,
  ServerNotification: validateServerNotification,
  "v2/ThreadProjectionAttachResponse": validateV2ThreadProjectionAttachResponse,
  "v2/TurnInterruptResponse": validateV2TurnInterruptResponse,
  "v2/TurnStartResponse": validateV2TurnStartResponse,
};
