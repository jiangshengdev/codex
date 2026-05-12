# Codex GUI Frontend Handshake Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the browser-side recovery of app-server launch URL parameters, WebSocket handshake, projection attach sequence, and simple transport status UI.

**Architecture:** The frontend consumes the launch URL returned by app-server and printed by TUI; it does not know which process owns `GuiHost`. Browser code reads `threadId` from query, reads the launch token from fragment or `sessionStorage`, clears the fragment, connects to same-origin `/ws`, then performs `gui/authenticate -> initialize -> thread/projection/attach`. The frontend verifies transport only and does not write projection data into Redux/store; it displays only connection status, attached state, received event count, and last event type.

**Tech Stack:** React, TypeScript, Vite, Vitest, browser WebSocket.

---

Source spec: `docs/superpowers/specs/2026-05-11-codex-gui-host-redesign.md`.
Prerequisite plans: `02-app-server-bridge.md`, `06-in-process-gui-launch.md` (produce the real launch URL in the default in-process TUI path).

**Acceptance path for this plan:** the end-to-end verification in `05-packaging-verification.md` runs against the in-process TUI default — `/gui` prints a real URL, the browser opens it, and all four acceptance traces below come from the in-process runtime.

## Scope Notes

- Keep this plan focused on browser handshake and status UI.
- Do not add frontend assumptions about whether TUI, app-server, or another caller owns GUI host lifecycle.
- The launch URL shape is produced by app-server and displayed by TUI:

```text
http://127.0.0.1:<port>/?threadId=<primary-thread-id>#token=<launch-token>
```

- Frontend behavior remains unchanged by the ownership redesign: read launch params, clear fragment, connect `/ws`, authenticate, initialize, attach, and count `thread/projection/event` notifications.

### Task 10: Add frontend GUI host client and status UI

**Files:**
- Create: `codex-gui/src/features/guiHost/guiHostClient.ts`
- Create: `codex-gui/src/features/guiHost/guiHostClient.test.ts`
- Modify: `codex-gui/src/App.tsx`
- Test: `codex-gui/src/features/guiHost/guiHostClient.test.ts`

- [ ] **Step 1: Write failing tests**

Create `codex-gui/src/features/guiHost/guiHostClient.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import {
  clearLaunchTokenFragment,
  readLaunchParams,
  startGuiHostConnection,
} from "./guiHostClient";

class MemoryStorage {
  private readonly values = new Map<string, string>();
  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

class RecordingWebSocket {
  sent: string[] = [];
  closed: Array<{ code?: number; reason?: string }> = [];
  onerror: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onopen: (() => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;

  send(message: string): void {
    this.sent.push(message);
  }

  close(code?: number, reason?: string): void {
    this.closed.push({ code, reason });
  }
}

describe("guiHostClient", () => {
  it("stores app-server launch URL fragment token and restores it after refresh", () => {
    const storage = new MemoryStorage();
    const replaceState = vi.fn();
    expect(
      readLaunchParams(
        new URL("http://127.0.0.1:4567/?threadId=thread-abc#token=secret"),
        storage,
      ),
    ).toEqual({ threadId: "thread-abc", token: "secret" });
    expect(
      readLaunchParams(new URL("http://127.0.0.1:4567/?threadId=thread-abc"), storage),
    ).toEqual({ threadId: "thread-abc", token: "secret" });
    // Spec §WebSocket 认证 (spec §343): token must be scrubbed from the
    // visible URL once the app has it. Verify clearLaunchTokenFragment calls
    // replaceState with a URL that preserves path + query but drops the
    // fragment.
    clearLaunchTokenFragment(
      new URL("http://127.0.0.1:4567/app?threadId=thread-abc#token=secret"),
      replaceState,
    );
    expect(replaceState).toHaveBeenCalledTimes(1);
    const [, , replacedUrl] = replaceState.mock.calls[0] as [unknown, unknown, string];
    expect(replacedUrl).not.toContain("#token=");
    expect(replacedUrl).toContain("/app");
    expect(replacedUrl).toContain("threadId=thread-abc");
  });

  it("sends authenticate, initialize, attach, and records projection events", () => {
    const socket = new RecordingWebSocket();
    const statuses: string[] = [];
    startGuiHostConnection({
      location: new URL("http://127.0.0.1:4567/?threadId=thread-abc#token=secret"),
      replaceState: vi.fn(),
      tokenStorage: new MemoryStorage(),
      createWebSocket: () => socket as unknown as WebSocket,
      onStatus: (status) => statuses.push(status.label),
    });

    socket.onopen?.();
    socket.onmessage?.({
      data: JSON.stringify({ jsonrpc: "2.0", id: 1, result: { authenticated: true } }),
    });
    socket.onmessage?.({
      data: JSON.stringify({ jsonrpc: "2.0", id: 2, result: {} }),
    });
    socket.onmessage?.({
      data: JSON.stringify({ jsonrpc: "2.0", id: 3, result: { subscriptionId: "sub-1" } }),
    });
    socket.onmessage?.({
      data: JSON.stringify({
        jsonrpc: "2.0",
        method: "thread/projection/event",
        params: {
          threadId: "thread-abc",
          subscriptionId: "sub-1",
          commitId: "c1",
          parentCommitId: null,
          event: { type: "turnStarted", notification: {} },
        },
      }),
    });

    expect(socket.sent.map((message) => JSON.parse(message).method)).toEqual([
      "gui/authenticate",
      "initialize",
      "thread/projection/attach",
    ]);
    expect(statuses).toContain("authenticated");
    expect(statuses).toContain("initialized");
    expect(statuses).toContain("attached");
    expect(statuses).toContain("received event");
  });

  it("surfaces JSON-RPC errors on initialize/attach instead of advancing", () => {
    const socket = new RecordingWebSocket();
    const statuses: Array<{ label: string; message?: string }> = [];
    startGuiHostConnection({
      location: new URL("http://127.0.0.1:4567/?threadId=thread-abc#token=secret"),
      replaceState: vi.fn(),
      tokenStorage: new MemoryStorage(),
      createWebSocket: () => socket as unknown as WebSocket,
      onStatus: (status) => statuses.push({ label: status.label, message: status.message }),
    });
    socket.onopen?.();
    socket.onmessage?.({
      data: JSON.stringify({ jsonrpc: "2.0", id: 1, result: { authenticated: true } }),
    });
    socket.onmessage?.({
      data: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        error: { code: -32601, message: "method not found" },
      }),
    });
    // Must NOT send thread/projection/attach after an initialize error.
    expect(socket.sent.map((m) => JSON.parse(m).method)).toEqual([
      "gui/authenticate",
      "initialize",
    ]);
    expect(statuses.at(-1)?.label).toBe("error");
    // Must also close the socket on protocol error so the backend bridge
    // can release its extra connection.
    expect(socket.closed).toHaveLength(1);
    expect(socket.closed[0].code).toBe(1000);
  });

  it("reports policy-close as error", () => {
    const socket = new RecordingWebSocket();
    const statuses: string[] = [];
    startGuiHostConnection({
      location: new URL("http://127.0.0.1:4567/?threadId=thread-abc#token=secret"),
      replaceState: vi.fn(),
      tokenStorage: new MemoryStorage(),
      createWebSocket: () => socket as unknown as WebSocket,
      onStatus: (status) => statuses.push(status.label),
    });
    socket.onopen?.();
    // Auth reject close from codex-gui-host /ws path (policy violation).
    socket.onclose?.({ code: 1008, reason: "invalid token" } as CloseEvent);
    expect(statuses.at(-1)).toBe("error");
  });
});
```

- [ ] **Step 2: Run tests to verify FAIL**

Run from `codex-gui`:

```bash
pnpm vitest --run src/features/guiHost/guiHostClient.test.ts
```

Expected failure:

```text
Failed to resolve import "./guiHostClient"
```

- [ ] **Step 3: Implement frontend client and status UI**

Create `codex-gui/src/features/guiHost/guiHostClient.ts`:

```ts
export type GuiHostStatus =
  | { label: "connecting"; eventCount: number; lastEventType: null }
  | { label: "authenticated"; eventCount: number; lastEventType: null }
  | { label: "initialized"; eventCount: number; lastEventType: null }
  | { label: "attached"; eventCount: number; lastEventType: null }
  | { label: "received event"; eventCount: number; lastEventType: string }
  | { label: "closed"; eventCount: number; lastEventType: null }
  | { label: "error"; eventCount: number; lastEventType: null; message: string };

export type LaunchParams = {
  threadId: string;
  token: string;
};

export type StartGuiHostConnectionOptions = {
  location: URL;
  replaceState: History["replaceState"];
  tokenStorage?: Pick<Storage, "getItem" | "setItem">;
  createWebSocket?: (url: string) => WebSocket;
  onStatus?: (status: GuiHostStatus) => void;
};

const launchTokenStorageKey = "codex-gui.launchToken";

export function readLaunchParams(
  url: URL,
  tokenStorage?: Pick<Storage, "getItem" | "setItem">,
): LaunchParams {
  const threadId = url.searchParams.get("threadId");
  const fragmentToken = new URLSearchParams(url.hash.replace(/^#/, "")).get("token");
  if (!threadId) {
    throw new Error("Missing threadId query parameter");
  }
  if (fragmentToken) {
    tokenStorage?.setItem(launchTokenStorageKey, fragmentToken);
    return { threadId, token: fragmentToken };
  }
  const token = tokenStorage?.getItem(launchTokenStorageKey);
  if (!token) {
    throw new Error("Missing launch token fragment");
  }
  return { threadId, token };
}

export function clearLaunchTokenFragment(
  location: URL,
  replaceState: History["replaceState"],
): void {
  replaceState(null, "", `${location.pathname}${location.search}`);
}

export function startGuiHostConnection({
  location,
  replaceState,
  tokenStorage = globalThis.sessionStorage,
  createWebSocket = (url) => new WebSocket(url),
  onStatus,
}: StartGuiHostConnectionOptions): void {
  const { threadId, token } = readLaunchParams(location, tokenStorage);
  clearLaunchTokenFragment(location, replaceState);
  const socket = createWebSocket(`${webSocketProtocol(location)}://${location.host}/ws`);
  let eventCount = 0;
  onStatus?.({ label: "connecting", eventCount, lastEventType: null });

  socket.onopen = () => {
    sendRequest(socket, 1, "gui/authenticate", { token });
  };
  socket.onerror = () => {
    onStatus?.({
      label: "error",
      eventCount,
      lastEventType: null,
      message: "GUI host WebSocket failed",
    });
  };
  socket.onclose = (ev) => {
    // Auth reject closes with policy violation (1008). Bridge-side shutdown
    // or server abort also surfaces here. Only report an error if we have
    // not yet reached 'attached' AND this is not a clean client-initiated
    // close. If the caller never sets a custom close handler, any close is
    // surfaced so the page does not silently stall.
    if (ev.code === 1000) {
      onStatus?.({
        label: "closed",
        eventCount,
        lastEventType: null,
      });
      return;
    }
    onStatus?.({
      label: "error",
      eventCount,
      lastEventType: null,
      message: `GUI host WebSocket closed (code=${ev.code}${ev.reason ? ", reason=" + ev.reason : ""})`,
    });
  };
  socket.onmessage = (event) => {
    const message = JSON.parse(String(event.data)) as {
      id?: unknown;
      method?: string;
      result?: { authenticated?: boolean };
      error?: { code: number; message?: string };
      params?: {
        event?: { type?: string };
      };
    };
    if (message.error) {
      onStatus?.({
        label: "error",
        eventCount,
        lastEventType: null,
        message: `JSON-RPC error (id=${message.id ?? "-"}, code=${message.error.code}): ${message.error.message ?? ""}`.trim(),
      });
      // Once the handshake has surfaced a protocol error we should not keep
      // the socket open silently; close cleanly so the backend's bridge
      // exits the pump pair and the GUI host releases its ExtraConnectionHandle.
      try {
        socket.close(1000, "handshake error");
      } catch {
        // ignore: some browsers throw if the socket is already closing.
      }
      return;
    }
    if (message.id === 1 && message.result?.authenticated === true) {
      onStatus?.({ label: "authenticated", eventCount, lastEventType: null });
      sendRequest(socket, 2, "initialize", {
        clientInfo: { name: "codex-gui", version: "0.0.0" },
        capabilities: {},
      });
      return;
    }
    if (message.id === 2) {
      if (!message.result) {
        onStatus?.({
          label: "error",
          eventCount,
          lastEventType: null,
          message: "initialize returned no result payload",
        });
        return;
      }
      onStatus?.({ label: "initialized", eventCount, lastEventType: null });
      sendRequest(socket, 3, "thread/projection/attach", { threadId });
      return;
    }
    if (message.id === 3) {
      if (!message.result) {
        onStatus?.({
          label: "error",
          eventCount,
          lastEventType: null,
          message: "thread/projection/attach returned no result payload",
        });
        return;
      }
      onStatus?.({ label: "attached", eventCount, lastEventType: null });
      return;
    }
    if (message.method === "thread/projection/event") {
      eventCount += 1;
      onStatus?.({
        label: "received event",
        eventCount,
        lastEventType: message.params?.event?.type ?? "unknown",
      });
    }
  };
}

function webSocketProtocol(location: URL): "ws" | "wss" {
  return location.protocol === "https:" ? "wss" : "ws";
}

function sendRequest(
  socket: WebSocket,
  id: number,
  method: string,
  params: Record<string, unknown>,
): void {
  socket.send(JSON.stringify({ jsonrpc: "2.0", id, method, params }));
}
```

Modify `codex-gui/src/App.tsx`:

```tsx
import { useEffect, useRef, useState } from "react";
import type { GuiHostStatus } from "./features/guiHost/guiHostClient";
import { startGuiHostConnection } from "./features/guiHost/guiHostClient";

function App() {
  const [status, setStatus] = useState<GuiHostStatus>({
    label: "connecting",
    eventCount: 0,
    lastEventType: null as string | null,
  });
  const hasStartedConnection = useRef(false);

  useEffect(() => {
    if (hasStartedConnection.current) {
      return;
    }
    hasStartedConnection.current = true;

    try {
      startGuiHostConnection({
        location: new URL(window.location.href),
        replaceState: window.history.replaceState.bind(window.history),
        onStatus: setStatus,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      setStatus({
        label: "error",
        eventCount: 0,
        lastEventType: null,
        message,
      });
    }
  }, []);

  return (
    <main
      className="grid min-h-svh place-items-center bg-background px-6 py-10 text-foreground"
      data-gui-host-status={status.label}
    >
      <p aria-live="polite">
        {status.label === "error" ? `error: ${status.message}` : status.label}
      </p>
      <p>events: {status.eventCount}</p>
      <p>last event: {status.lastEventType ?? "none"}</p>
    </main>
  );
}

export default App;
```

- [ ] **Step 4: Run tests to verify PASS**

Run:

```bash
pnpm vitest --run src/features/guiHost/guiHostClient.test.ts
```

Expected:

```text
Test Files  1 passed (1)
Tests  2 passed (2)
```

- [ ] **Step 5: Commit**

```bash
git add codex-gui/src/App.tsx codex-gui/src/features/guiHost
git commit -m "feat(gui): connect to GUI host websocket"
```

---
