export type QrAccessUrlInput = {
  origin: string;
  threadId: string;
  token: string;
};

export function buildQrAccessUrl({ origin, threadId, token }: QrAccessUrlInput): string {
  const url = new URL("/", origin);
  url.searchParams.set("threadId", threadId);
  url.hash = new URLSearchParams({ token }).toString();
  return url.toString();
}
