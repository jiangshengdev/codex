import type {
  ThreadProjectionAttachResponse,
  ThreadProjectionClosedNotification,
  ThreadProjectionDeltaNotification,
  ThreadProjectionEventNotification,
} from "@codex-protocol/v2";

export type RpcMessage = {
  id?: unknown;
  method?: string;
  result?: Record<string, unknown>;
  error?: {
    code: number;
    message?: string;
  };
  params?: Record<string, unknown>;
};

export function parseRpcMessage(data: unknown): RpcMessage {
  const parsed: unknown = JSON.parse(String(data));
  if (!isRecord(parsed)) {
    return {};
  }

  const message: RpcMessage = {
    id: parsed.id,
    method: typeof parsed.method === "string" ? parsed.method : undefined,
    result: isRecord(parsed.result) ? parsed.result : undefined,
    error: parseRpcError(parsed.error),
    params: isRecord(parsed.params) ? parsed.params : undefined,
  };

  return message;
}

function parseRpcError(value: unknown): RpcMessage["error"] {
  if (!isRecord(value) || typeof value.code !== "number") {
    return undefined;
  }

  return {
    code: value.code,
    message: typeof value.message === "string" ? value.message : undefined,
  };
}

export function isThreadProjectionAttachResponse(
  value: unknown,
): value is ThreadProjectionAttachResponse {
  if (!isRecord(value) || typeof value.subscriptionId !== "string") {
    return false;
  }

  const snapshot = value.snapshot;
  if (!isRecord(snapshot)) {
    return false;
  }

  const thread = snapshot.thread;
  return (
    isRecord(thread) &&
    typeof thread.id === "string" &&
    Array.isArray(thread.turns) &&
    (typeof snapshot.headCommitId === "string" || snapshot.headCommitId === null)
  );
}

export function isThreadProjectionEventNotification(
  value: unknown,
): value is ThreadProjectionEventNotification {
  if (
    !isRecord(value) ||
    typeof value.threadId !== "string" ||
    typeof value.subscriptionId !== "string" ||
    typeof value.commitId !== "string" ||
    (typeof value.parentCommitId !== "string" && value.parentCommitId !== null)
  ) {
    return false;
  }

  const event = value.event;
  return isThreadProjectionEvent(event);
}

export function isThreadProjectionClosedNotification(
  value: unknown,
): value is ThreadProjectionClosedNotification {
  return (
    isRecord(value) &&
    typeof value.threadId === "string" &&
    typeof value.subscriptionId === "string" &&
    value.reason === "backpressure"
  );
}

export function isThreadProjectionDeltaNotification(
  value: unknown,
): value is ThreadProjectionDeltaNotification {
  if (
    !isRecord(value) ||
    typeof value.threadId !== "string" ||
    typeof value.subscriptionId !== "string"
  ) {
    return false;
  }

  const delta = value.delta;
  return isThreadProjectionDelta(delta);
}

function isThreadProjectionEvent(value: unknown): boolean {
  if (!isRecord(value) || typeof value.type !== "string" || !isRecord(value.notification)) {
    return false;
  }

  switch (value.type) {
    case "turnStarted":
    case "turnCompleted":
      return isTurnProjectionNotification(value.notification);
    case "itemStarted":
      return isItemProjectionNotification(value.notification, "startedAtMs");
    case "itemCompleted":
      return isItemProjectionNotification(value.notification, "completedAtMs");
    default:
      return false;
  }
}

function isTurnProjectionNotification(value: Record<string, unknown>): boolean {
  return typeof value.threadId === "string" && isProjectionTurn(value.turn);
}

function isItemProjectionNotification(
  value: Record<string, unknown>,
  timestampField: "startedAtMs" | "completedAtMs",
): boolean {
  return (
    typeof value.threadId === "string" &&
    typeof value.turnId === "string" &&
    typeof value[timestampField] === "number" &&
    isProjectionItem(value.item)
  );
}

function isProjectionTurn(value: unknown): boolean {
  return isRecord(value) && typeof value.id === "string" && Array.isArray(value.items);
}

function isProjectionItem(value: unknown): boolean {
  return isRecord(value) && typeof value.id === "string";
}

function isThreadProjectionDelta(value: unknown): boolean {
  if (!isRecord(value) || typeof value.type !== "string" || !isRecord(value.notification)) {
    return false;
  }

  switch (value.type) {
    case "agentMessage":
      return isAgentMessageDeltaNotification(value.notification);
    case "reasoningSummaryText":
      return isReasoningSummaryTextDeltaNotification(value.notification);
    case "reasoningSummaryPartAdded":
      return isReasoningSummaryPartAddedNotification(value.notification);
    case "reasoningText":
      return isReasoningTextDeltaNotification(value.notification);
    default:
      return false;
  }
}

function isAgentMessageDeltaNotification(value: Record<string, unknown>): boolean {
  return (
    typeof value.threadId === "string" &&
    typeof value.turnId === "string" &&
    typeof value.itemId === "string" &&
    typeof value.delta === "string"
  );
}

function isReasoningSummaryTextDeltaNotification(value: Record<string, unknown>): boolean {
  return (
    typeof value.threadId === "string" &&
    typeof value.turnId === "string" &&
    typeof value.itemId === "string" &&
    typeof value.delta === "string" &&
    typeof value.summaryIndex === "number"
  );
}

function isReasoningSummaryPartAddedNotification(value: Record<string, unknown>): boolean {
  return (
    typeof value.threadId === "string" &&
    typeof value.turnId === "string" &&
    typeof value.itemId === "string" &&
    typeof value.summaryIndex === "number"
  );
}

function isReasoningTextDeltaNotification(value: Record<string, unknown>): boolean {
  return (
    typeof value.threadId === "string" &&
    typeof value.turnId === "string" &&
    typeof value.itemId === "string" &&
    typeof value.delta === "string" &&
    typeof value.contentIndex === "number"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function formatRpcId(value: unknown): string {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return "-";
}
