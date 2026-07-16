export type RpcMessage = {
  id?: unknown;
  method?: string;
  hasResult: boolean;
  result?: unknown;
  error?: {
    code: number;
    message?: string;
  };
  params?: unknown;
};

export function parseRpcMessage(data: unknown): RpcMessage {
  const parsed: unknown = JSON.parse(String(data));
  if (!isRecord(parsed)) {
    return { hasResult: false };
  }

  const message: RpcMessage = {
    id: parsed.id,
    method: typeof parsed.method === "string" ? parsed.method : undefined,
    hasResult: Object.hasOwn(parsed, "result"),
    result: parsed.result,
    error: parseRpcError(parsed.error),
    params: parsed.params,
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function formatRpcId(value: unknown): string {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return "-";
}
