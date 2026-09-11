// GENERATED CODE! DO NOT MODIFY BY HAND!
import type { ServerNotification } from "@codex-protocol/ServerNotification";
import type {
  TurnError,
  TurnInterruptParams,
  TurnStartParams,
  TurnSteerParams,
} from "@codex-protocol/v2";
import type { ProtocolValidator, RequestResponse } from "../../features/guiHost/appServerProtocol";
export declare const validateInitializeResponse: ProtocolValidator<RequestResponse<"initialize">>;
export declare const validateV2SkillsChangedNotification: ProtocolValidator<
  Extract<
    ServerNotification,
    {
      method: "skills/changed";
    }
  >["params"]
>;
export declare const validateV2SkillsListResponse: ProtocolValidator<
  RequestResponse<"skills/list">
>;
export declare const validateV2ThreadCompactStartResponse: ProtocolValidator<
  RequestResponse<"thread/compact/start">
>;
export declare const validateV2ThreadForkResponse: ProtocolValidator<
  RequestResponse<"thread/fork">
>;
export declare const validateV2ThreadListResponse: ProtocolValidator<
  RequestResponse<"thread/list">
>;
export declare const validateV2ThreadLoadedListResponse: ProtocolValidator<
  RequestResponse<"thread/loaded/list">
>;
export declare const validateV2ThreadProjectionAttachResponse: ProtocolValidator<
  RequestResponse<"thread/projection/attach">
>;
export declare const validateV2ThreadProjectionClosedNotification: ProtocolValidator<
  Extract<
    ServerNotification,
    {
      method: "thread/projection/closed";
    }
  >["params"]
>;
export declare const validateV2ThreadProjectionDeltaNotification: ProtocolValidator<
  Extract<
    ServerNotification,
    {
      method: "thread/projection/delta";
    }
  >["params"]
>;
export declare const validateV2ThreadProjectionDetachResponse: ProtocolValidator<
  RequestResponse<"thread/projection/detach">
>;
export declare const validateV2ThreadProjectionEventNotification: ProtocolValidator<
  Extract<
    ServerNotification,
    {
      method: "thread/projection/event";
    }
  >["params"]
>;
export declare const validateV2ThreadReadResponse: ProtocolValidator<
  RequestResponse<"thread/read">
>;
export declare const validateV2ThreadResumeResponse: ProtocolValidator<
  RequestResponse<"thread/resume">
>;
export declare const validateV2ThreadStartResponse: ProtocolValidator<
  RequestResponse<"thread/start">
>;
export declare const validateV2ThreadStatusChangedNotification: ProtocolValidator<
  Extract<
    ServerNotification,
    {
      method: "thread/status/changed";
    }
  >["params"]
>;
export declare const validateV2TurnError: ProtocolValidator<
  Partial<TurnError> & Required<Pick<TurnError, "message">>
>;
export declare const validateV2TurnInterruptParams: ProtocolValidator<
  Partial<TurnInterruptParams> & Required<Pick<TurnInterruptParams, "threadId" | "turnId">>
>;
export declare const validateV2TurnInterruptResponse: ProtocolValidator<
  RequestResponse<"turn/interrupt">
>;
export declare const validateV2TurnStartParams: ProtocolValidator<
  Partial<TurnStartParams> & Required<Pick<TurnStartParams, "input" | "threadId">>
>;
export declare const validateV2TurnStartResponse: ProtocolValidator<RequestResponse<"turn/start">>;
export declare const validateV2TurnSteerParams: ProtocolValidator<
  Partial<TurnSteerParams> &
    Required<Pick<TurnSteerParams, "expectedTurnId" | "input" | "threadId">>
>;
export declare const validateV2TurnSteerResponse: ProtocolValidator<RequestResponse<"turn/steer">>;
