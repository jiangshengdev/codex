# Codex GUI Frontend Handshake Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the browser launch-token recovery, WebSocket handshake, projection attach sequence, and simple transport status UI.

**Architecture:** The frontend verifies transport only and does not write projection data into Redux/store. It displays only connection status, attached state, received event count, and last event type.

**Tech Stack:** React, TypeScript, Vite, Vitest, browser WebSocket.

---

Source spec: `docs/superpowers/specs/2026-05-11-codex-gui-host-redesign.md`.

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
import { readLaunchParams, startGuiHostConnection } from "./guiHostClient";

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
  onerror: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onopen: (() => void) | null = null;

  send(message: string): void {
    this.sent.push(message);
  }
}

describe("guiHostClient", () => {
  it("stores fragment token and restores it after refresh", () => {
    const storage = new MemoryStorage();
    expect(
      readLaunchParams(
        new URL("http://127.0.0.1:4567/?threadId=thread-abc#token=secret"),
        storage,
      ),
    ).toEqual({ threadId: "thread-abc", token: "secret" });
    expect(
      readLaunchParams(new URL("http://127.0.0.1:4567/?threadId=thread-abc"), storage),
    ).toEqual({ threadId: "thread-abc", token: "secret" });
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
        params: { type: "reset" },
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
  socket.onmessage = (event) => {
    const message = JSON.parse(String(event.data)) as {
      id?: unknown;
      method?: string;
      result?: { authenticated?: boolean };
      params?: { type?: string };
    };
    if (message.id === 1 && message.result?.authenticated === true) {
      onStatus?.({ label: "authenticated", eventCount, lastEventType: null });
      sendRequest(socket, 2, "initialize", {
        clientInfo: { name: "codex-gui", version: "0.0.0" },
        capabilities: {},
      });
      return;
    }
    if (message.id === 2) {
      onStatus?.({ label: "initialized", eventCount, lastEventType: null });
      sendRequest(socket, 3, "thread/projection/attach", { threadId });
      return;
    }
    if (message.id === 3) {
      onStatus?.({ label: "attached", eventCount, lastEventType: null });
      return;
    }
    if (message.method === "thread/projection/event") {
      eventCount += 1;
      onStatus?.({
        label: "received event",
        eventCount,
        lastEventType: message.params?.type ?? "unknown",
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
