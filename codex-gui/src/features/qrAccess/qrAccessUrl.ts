import { THREAD_QUERY_KEY, TOKEN_FRAGMENT_KEY } from "@codex-gui-host-contract";

export type QrAccessUrlInput = {
  origin: string;
  threadId: string;
  token: string;
};

export function buildQrAccessUrl({ origin, threadId, token }: QrAccessUrlInput): string {
  const url = new URL("/", origin);
  url.searchParams.set(THREAD_QUERY_KEY, threadId);
  url.hash = new URLSearchParams({ [TOKEN_FRAGMENT_KEY]: token }).toString();
  return url.toString();
}
