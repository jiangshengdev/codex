import { UPLOAD_PATH } from "@codex-gui-host-contract";
import { createListenerSet } from "@/subscriptions/listenerSet";

const tokenPrefix = "storybook-attachments-";
const handlers = new Map<string, typeof fetch>();
let installed = false;

// Only preview tokens enter this router. Retired tokens remain local too, so a
// late request cannot fall through to a real host after its story unmounts.
function installRouter() {
  if (installed) return;
  installed = true;
  const original = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    const headers = new Headers(
      init?.headers ?? (input instanceof Request ? input.headers : undefined),
    );
    const token = headers.get("Authorization")?.replace(/^Bearer /, "");
    if (token?.startsWith(tokenPrefix)) {
      return (
        handlers.get(token)?.(input, init) ?? Promise.resolve(new Response(null, { status: 410 }))
      );
    }
    return original(input, init);
  };
}

export function createAttachmentRequests() {
  const token = `${tokenPrefix}${crypto.randomUUID()}`;
  const listeners = createListenerSet();
  let requests: readonly Readonly<{
    id: string;
    name: string;
    removed: boolean;
    complete(): void;
    fail(status?: number): void;
  }>[] = [];
  const cleanups = new Set<() => void>();
  let disposed = false;
  let connected = false;
  const handle: typeof fetch = (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input), location.href);
    if (disposed || url.pathname !== UPLOAD_PATH || init?.method !== "POST") {
      return Promise.resolve(new Response(null, { status: 410 }));
    }
    const name = url.searchParams.get("filename") ?? "";
    const signal = init.signal;
    const id = crypto.randomUUID();
    return new Promise<Response>((resolve) => {
      const settle = (status = 201) => {
        signal?.removeEventListener("abort", abort);
        cleanups.delete(settle);
        requests = requests.filter((request) => request.id !== id);
        resolve(new Response(`/storybook/attachments/${id}/${name}`, { status }));
        listeners.notify();
      };
      const abort = () => {
        // Keep only response metadata to demonstrate a late completion. No File
        // or request body is retained here; the real plugin owns cancellation.
        requests = requests.map((request) =>
          request.id === id ? { ...request, removed: true } : request,
        );
        listeners.notify();
      };
      cleanups.add(settle);
      requests = [
        ...requests,
        {
          id,
          name,
          removed: signal?.aborted ?? false,
          complete: () => {
            settle();
          },
          fail: (status = 500) => {
            settle(status);
          },
        },
      ];
      signal?.addEventListener("abort", abort, { once: true });
      listeners.notify();
    });
  };
  return {
    token,
    getSnapshot: () => requests,
    subscribe: (listener: () => void) => listeners.subscribe(listener),
    isConnected: () => connected,
    connect() {
      installRouter();
      handlers.set(token, handle);
      connected = true;
      listeners.notify();
      return () => {
        handlers.delete(token);
        connected = false;
        listeners.notify();
      };
    },
    dispose() {
      disposed = true;
      handlers.delete(token);
      for (const cleanup of cleanups) cleanup();
    },
  };
}
