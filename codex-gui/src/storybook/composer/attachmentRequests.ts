import {
  FILE_PREVIEW_PATH,
  UPLOAD_PATH,
  type GuiFilePreviewParams,
  type GuiUploadParams,
} from "@codex-gui-host-contract";
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
    kind: "upload" | "preview";
    complete(): void;
    fail(status?: number): void;
    decodeFailure(): void;
  }>[] = [];
  // The real Composer owns selected Files until removal. A weak association
  // lets preview reads use those exact bytes without extending their lifetime.
  const images = new Map<string, WeakRef<Blob>>();
  const cleanups = new Set<() => void>();
  let disposed = false;
  let connected = false;
  const handle: typeof fetch = (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input), location.href);
    const kind =
      url.pathname === UPLOAD_PATH && init?.method === "POST"
        ? "upload"
        : url.pathname === FILE_PREVIEW_PATH && (init?.method ?? "GET") === "GET"
          ? "preview"
          : null;
    if (disposed || kind == null) {
      return Promise.resolve(new Response(null, { status: 410 }));
    }
    const previewPath = url.searchParams.get("path" satisfies keyof GuiFilePreviewParams) ?? "";
    const name =
      kind === "upload"
        ? (url.searchParams.get("filename" satisfies keyof GuiUploadParams) ?? "")
        : (previewPath.split("/").at(-1) ?? "");
    const signal = init?.signal;
    const id = crypto.randomUUID();
    const path = `/storybook/attachments/${id}/${name}`;
    let bytes =
      kind === "upload" && init?.body instanceof Blob
        ? init.body
        : images.get(previewPath)?.deref();
    return new Promise<Response>((resolve) => {
      const settle = (status = kind === "upload" ? 201 : 200, corrupt = false) => {
        signal?.removeEventListener("abort", abort);
        cleanups.delete(settle);
        requests = requests.filter((request) => request.id !== id);
        if (kind === "upload" && status === 201 && !signal?.aborted && bytes != null) {
          images.set(path, new WeakRef(bytes));
        }
        resolve(
          new Response(
            kind === "upload" ? path : corrupt ? "Invalid image bytes" : (bytes ?? null),
            { status },
          ),
        );
        bytes = undefined;
        listeners.notify();
      };
      const abort = () => {
        // A late result keeps metadata only, never the removed file's bytes.
        bytes = undefined;
        if (kind === "preview") {
          settle(410);
          return;
        }
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
          kind,
          removed: signal?.aborted ?? false,
          complete: () => {
            settle();
          },
          fail: (status = 500) => {
            settle(status);
          },
          decodeFailure: () => {
            settle(200, true);
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
      images.clear();
    },
  };
}
