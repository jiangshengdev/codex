// GENERATED CODE! DO NOT MODIFY BY HAND!
import type { JSONRPCMessage } from "@codex-protocol/JSONRPCMessage";
import type { ServerNotification } from "@codex-protocol/ServerNotification";
import type { ProtocolValidator, RequestResponse } from "../../features/guiHost/appServerProtocol";
export declare const validateInitializeResponse: ProtocolValidator<RequestResponse<"initialize">>;
export declare const validateJSONRPCMessage: ProtocolValidator<JSONRPCMessage>;
export declare const validateServerNotification: ProtocolValidator<ServerNotification>;
export declare const validateV2ThreadProjectionAttachResponse: ProtocolValidator<
  RequestResponse<"thread/projection/attach">
>;
export declare const validateV2TurnInterruptResponse: ProtocolValidator<
  RequestResponse<"turn/interrupt">
>;
export declare const validateV2TurnStartResponse: ProtocolValidator<RequestResponse<"turn/start">>;
