export function parseRpcMessage(data: unknown): unknown {
  return JSON.parse(String(data));
}
