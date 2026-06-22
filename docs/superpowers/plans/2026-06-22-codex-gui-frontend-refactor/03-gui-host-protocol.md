# GUI Host Protocol Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract JSON-RPC parsing and projection payload guards from `guiHostClient.ts` into `guiHostProtocol.ts` without changing runtime behavior.

**Architecture:** Keep `guiHostClient.ts` responsible for WebSocket lifecycle, pending requests, handshake flow, command readiness, and transport helpers. Move only pure protocol parsing/guard helpers into a sibling module under the same `guiHost` feature. Existing `guiHostClient.test.ts` remains the behavioral lock for this stage.

**Tech Stack:** TypeScript, React/Vite frontend, Vitest, app-server protocol generated TypeScript.

---

## File Structure

**Create:**

- `/Users/jiangsheng/cnb/codex/codex-gui/src/features/guiHost/guiHostProtocol.ts`
  - Owns `RpcMessage`, `parseRpcMessage`, `formatRpcId`, and projection payload guards.
  - Keeps low-level helper functions private inside the module.

**Modify:**

- `/Users/jiangsheng/cnb/codex/codex-gui/src/features/guiHost/guiHostClient.ts`
  - Imports protocol helpers from `./guiHostProtocol`.
  - Removes local parser/guard helper definitions.
  - Keeps `PendingRequest`, `webSocketProtocol`, `sendRequest`, and `readSessionStorage` local.

**Do not modify:**

- `/Users/jiangsheng/cnb/codex/codex-gui/src/features/guiHost/guiHostClient.test.ts`
- `/Users/jiangsheng/cnb/codex/codex-gui/e2e/app.spec.ts`
- `/Users/jiangsheng/cnb/codex/codex-gui/package.json`
- `/Users/jiangsheng/cnb/codex/codex-gui/pnpm-lock.yaml`

## Task 1: Create the Protocol Helper Module

**Files:**

- Create: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/guiHost/guiHostProtocol.ts`

- [ ] **Step 1: Create `guiHostProtocol.ts` with type imports**

Create the file with these imports:

```ts
import type {
  ThreadProjectionAttachResponse,
  ThreadProjectionClosedNotification,
  ThreadProjectionEventNotification,
} from "@codex-protocol/v2";
```

- [ ] **Step 2: Add the exported `RpcMessage` type**

Add this type below the imports:

```ts
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
```

- [ ] **Step 3: Add JSON-RPC parser functions**

Add these functions after `RpcMessage`:

```ts
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
```

- [ ] **Step 4: Add projection payload guards**

Add these functions after `parseRpcError`:

```ts
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
```

- [ ] **Step 5: Add shared private helpers**

Add these functions at the bottom of the file:

```ts
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function formatRpcId(value: unknown): string {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return "-";
}
```

- [ ] **Step 6: Run TypeScript check for the new isolated module**

Run:

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
pnpm run type-check
```

Expected: FAIL or PASS are both acceptable at this point. If it fails because `guiHostProtocol.ts` is valid but unused, continue. If it fails because of syntax or import errors in `guiHostProtocol.ts`, fix those before Task 2.

## Task 2: Wire `guiHostClient.ts` to the New Module

**Files:**

- Modify: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/guiHost/guiHostClient.ts`

- [ ] **Step 1: Add protocol helper imports**

After the existing `@codex-protocol/v2` import block, add:

```ts
import {
  formatRpcId,
  isThreadProjectionAttachResponse,
  isThreadProjectionClosedNotification,
  isThreadProjectionEventNotification,
  parseRpcMessage,
  type RpcMessage,
} from "./guiHostProtocol";
```

- [ ] **Step 2: Remove projection response types from the protocol import only if unused**

Keep these type imports because `StartGuiHostConnectionOptions` still exposes them:

```ts
ThreadProjectionAttachResponse,
ThreadProjectionClosedNotification,
ThreadProjectionEventNotification,
```

Do not remove them from `guiHostClient.ts` unless TypeScript reports they are unused after the local edit.

- [ ] **Step 3: Remove the local `RpcMessage` type**

Delete this local block from `guiHostClient.ts`:

```ts
type RpcMessage = {
  id?: unknown;
  method?: string;
  result?: Record<string, unknown>;
  error?: {
    code: number;
    message?: string;
  };
  params?: Record<string, unknown>;
};
```

- [ ] **Step 4: Keep `PendingRequest` in `guiHostClient.ts`**

Verify this type remains local in `guiHostClient.ts`:

```ts
type PendingRequest = {
  terminalOnError: boolean;
  resolve: (result: Record<string, unknown>) => void;
  reject: (error: Error) => void;
};
```

- [ ] **Step 5: Remove local parser and guard helper functions**

Delete the local definitions with these exact names from `guiHostClient.ts`:

- `parseRpcMessage`
- `parseRpcError`
- `isThreadProjectionAttachResponse`
- `isThreadProjectionEventNotification`
- `isThreadProjectionClosedNotification`
- `isThreadProjectionEvent`
- `isTurnProjectionNotification`
- `isItemProjectionNotification`
- `isProjectionTurn`
- `isProjectionItem`
- `isRecord`
- `formatRpcId`

Do not delete `webSocketProtocol`, `sendRequest`, or `readSessionStorage`.

- [ ] **Step 6: Confirm the client still owns transport helpers**

Verify these functions remain in `guiHostClient.ts`:

```ts
function webSocketProtocol(location: URL): "ws" | "wss" {
  return location.protocol === "https:" ? "wss" : "ws";
}

function sendRequest(socket: WebSocket, id: number, method: string, params: unknown): void {
  socket.send(JSON.stringify({ jsonrpc: "2.0", id, method, params }));
}

function readSessionStorage(): Pick<Storage, "getItem" | "setItem"> | undefined {
  try {
    return globalThis.sessionStorage;
  } catch {
    return undefined;
  }
}
```

## Task 3: Verify Behavior and Formatting

**Files:**

- Test: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/guiHost/guiHostClient.test.ts`
- Verify: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/guiHost/guiHostClient.ts`
- Verify: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/guiHost/guiHostProtocol.ts`

- [ ] **Step 1: Run focused GUI host tests**

Run:

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
pnpm exec vitest --run src/features/guiHost/guiHostClient.test.ts
```

Expected: PASS. The tests should still cover malformed JSON-RPC, malformed projection payloads, command requests, cleanup, and terminal error behavior.

- [ ] **Step 2: Run type-check**

Run:

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
pnpm run type-check
```

Expected: PASS.

- [ ] **Step 3: Run Prettier check for the touched files**

Run:

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
pnpm exec prettier --check src/features/guiHost/guiHostClient.ts src/features/guiHost/guiHostProtocol.ts
```

Expected: PASS. If it fails, run:

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
pnpm exec prettier --write src/features/guiHost/guiHostClient.ts src/features/guiHost/guiHostProtocol.ts
```

Then do not rerun tests solely because formatting changed.

- [ ] **Step 4: Inspect the diff for scope**

Run:

```bash
cd /Users/jiangsheng/cnb/codex
git diff -- codex-gui/src/features/guiHost/guiHostClient.ts codex-gui/src/features/guiHost/guiHostProtocol.ts
```

Expected: the diff only creates `guiHostProtocol.ts`, adds imports in `guiHostClient.ts`, and removes the moved local helper definitions. There should be no change to WebSocket lifecycle, pending request handling, command readiness, `sendRequest`, or `webSocketProtocol`.

- [ ] **Step 5: Optional commit only when explicitly requested**

Do not stage or commit unless the current execution request explicitly asks for it. If commit is requested, use:

```bash
cd /Users/jiangsheng/cnb/codex
git add codex-gui/src/features/guiHost/guiHostClient.ts codex-gui/src/features/guiHost/guiHostProtocol.ts
git commit -m "refactor(gui): extract host protocol helpers"
```

## Self-Review Checklist for Implementers

- [ ] `guiHostProtocol.ts` exports only `RpcMessage`, `parseRpcMessage`, `formatRpcId`, and the three top-level projection guards.
- [ ] `parseRpcError`, `isRecord`, and lower-level projection helpers remain private.
- [ ] `guiHostClient.ts` still owns `PendingRequest`, `webSocketProtocol`, `sendRequest`, and `readSessionStorage`.
- [ ] No tests, fixtures, e2e files, package manifests, or lockfiles changed.
- [ ] JSON-RPC parser behavior did not get stricter.
- [ ] Projection payload guard behavior did not get stricter.
- [ ] Focused `guiHostClient.test.ts` passes.
- [ ] `pnpm run type-check` passes.
