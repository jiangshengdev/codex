// GENERATED CODE! DO NOT MODIFY BY HAND!
import type { JSONRPCNotification } from "@codex-protocol/JSONRPCNotification";
import type { ServerNotification } from "@codex-protocol/ServerNotification";
import {
  validateV2ThreadProjectionEventNotification,
  validateV2ThreadProjectionDeltaNotification,
  validateV2ThreadProjectionClosedNotification,
} from "./appServerPayloadValidators.js";
export type SelectedServerNotification = Extract<
  ServerNotification,
  {
    method: "thread/projection/event" | "thread/projection/delta" | "thread/projection/closed";
  }
>;
export type ServerNotificationClassification =
  | {
      type: "selected";
      notification: SelectedServerNotification;
    }
  | {
      type: "selectedInvalid";
      method: SelectedServerNotification["method"];
    }
  | {
      type: "knownUnconsumed";
    }
  | {
      type: "unknown";
    };
function isKnownServerNotificationMethod(method: string): boolean {
  switch (method) {
    case "account/login/completed":
      return true;
    case "account/rateLimits/updated":
      return true;
    case "account/updated":
      return true;
    case "app/list/updated":
      return true;
    case "command/exec/outputDelta":
      return true;
    case "configWarning":
      return true;
    case "deprecationNotice":
      return true;
    case "error":
      return true;
    case "externalAgentConfig/import/completed":
      return true;
    case "externalAgentConfig/import/progress":
      return true;
    case "fs/changed":
      return true;
    case "fuzzyFileSearch/sessionCompleted":
      return true;
    case "fuzzyFileSearch/sessionUpdated":
      return true;
    case "guardianWarning":
      return true;
    case "hook/completed":
      return true;
    case "hook/started":
      return true;
    case "item/agentMessage/delta":
      return true;
    case "item/autoApprovalReview/completed":
      return true;
    case "item/autoApprovalReview/started":
      return true;
    case "item/commandExecution/outputDelta":
      return true;
    case "item/commandExecution/terminalInteraction":
      return true;
    case "item/completed":
      return true;
    case "item/fileChange/outputDelta":
      return true;
    case "item/fileChange/patchUpdated":
      return true;
    case "item/mcpToolCall/progress":
      return true;
    case "item/plan/delta":
      return true;
    case "item/reasoning/summaryPartAdded":
      return true;
    case "item/reasoning/summaryTextDelta":
      return true;
    case "item/reasoning/textDelta":
      return true;
    case "item/started":
      return true;
    case "mcpServer/oauthLogin/completed":
      return true;
    case "mcpServer/startupStatus/updated":
      return true;
    case "model/rerouted":
      return true;
    case "model/safetyBuffering/updated":
      return true;
    case "model/verification":
      return true;
    case "remoteControl/status/changed":
      return true;
    case "serverRequest/resolved":
      return true;
    case "skills/changed":
      return true;
    case "thread/archived":
      return true;
    case "thread/closed":
      return true;
    case "thread/compacted":
      return true;
    case "thread/deleted":
      return true;
    case "thread/goal/cleared":
      return true;
    case "thread/goal/updated":
      return true;
    case "thread/name/updated":
      return true;
    case "thread/projection/closed":
      return true;
    case "thread/projection/delta":
      return true;
    case "thread/projection/event":
      return true;
    case "thread/started":
      return true;
    case "thread/status/changed":
      return true;
    case "thread/tokenUsage/updated":
      return true;
    case "thread/unarchived":
      return true;
    case "turn/completed":
      return true;
    case "turn/diff/updated":
      return true;
    case "turn/plan/updated":
      return true;
    case "turn/started":
      return true;
    case "warning":
      return true;
    case "windows/worldWritableWarning":
      return true;
    case "windowsSandbox/setupCompleted":
      return true;
    default:
      return false;
  }
}
export function classifyServerNotification(
  notification: JSONRPCNotification,
): ServerNotificationClassification {
  switch (notification.method) {
    case "thread/projection/event":
      if (!validateV2ThreadProjectionEventNotification(notification.params)) {
        return { type: "selectedInvalid", method: notification.method };
      }
      return {
        type: "selected",
        notification: {
          method: notification.method,
          params: notification.params,
        },
      };
    case "thread/projection/delta":
      if (!validateV2ThreadProjectionDeltaNotification(notification.params)) {
        return { type: "selectedInvalid", method: notification.method };
      }
      return {
        type: "selected",
        notification: {
          method: notification.method,
          params: notification.params,
        },
      };
    case "thread/projection/closed":
      if (!validateV2ThreadProjectionClosedNotification(notification.params)) {
        return { type: "selectedInvalid", method: notification.method };
      }
      return {
        type: "selected",
        notification: {
          method: notification.method,
          params: notification.params,
        },
      };
    default:
      return isKnownServerNotificationMethod(notification.method)
        ? { type: "knownUnconsumed" }
        : { type: "unknown" };
  }
}
